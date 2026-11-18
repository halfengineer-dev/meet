import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { meetingService } from '../src/meetings/meeting-service';
import { meetingAuthorizationService } from '../src/meetings/meeting-authorization-service';
import { meetingRecurrenceService } from '../src/meetings/meeting-recurrence-service';
import { meetingRepository } from '../src/db/repositories/meeting-repository';
import { userRepository } from '../src/db/repositories/user-repository';
import { invitationRepository } from '../src/db/repositories/invitation-repository';
import { recurrenceRepository } from '../src/db/repositories/recurrence-repository';
import { occurrenceRepository } from '../src/db/repositories/occurrence-repository';
import { meetingSessionRepository } from '../src/db/repositories/meeting-session-repository';
import { alternativeHostRepository } from '../src/db/repositories/alternative-host-repository';
import { UserRecord } from '../src/db/types';

function decodeToken(token: string): any {
  return jwt.decode(token);
}

describe('Enterprise Meeting Lifecycle, Recurrence & Host Takeover Prevention', () => {
  let ownerUser: UserRecord;
  let altHostUser: UserRecord;
  let participantUser: UserRecord;
  let randomUser: UserRecord;

  beforeEach(async () => {
    await meetingSessionRepository.clearAll();
    await occurrenceRepository.clearAll();
    await alternativeHostRepository.clearAll();
    await meetingRepository.clearAll();
    await invitationRepository.clearAll();
    await recurrenceRepository.clearAll();
    await userRepository.clearAll();

    ownerUser = await userRepository.createUser({
      name: 'Sourav Owner',
      email: 'sourav@faceonn.com',
      password_hash: 'hash',
      status: 'active',
    });

    altHostUser = await userRepository.createUser({
      name: 'Priya CoHost',
      email: 'priya@faceonn.com',
      password_hash: 'hash',
      status: 'active',
    });

    participantUser = await userRepository.createUser({
      name: 'Rahul Participant',
      email: 'rahul@faceonn.com',
      password_hash: 'hash',
      status: 'active',
    });

    randomUser = await userRepository.createUser({
      name: 'Stranger User',
      email: 'stranger@faceonn.com',
      password_hash: 'hash',
      status: 'active',
    });
  });

  it('ACCEPTANCE WORKFLOW: Mon & Wed recurring series -> Start Mon -> Join -> End Occurrence -> Random user blocked & sees Wed -> Start Wed with isolated Jitsi room -> End Series invalidates link', async () => {
    // Next Monday in the future at 13:30 Asia/Kolkata (08:00 UTC)
    const now = new Date();
    const daysUntilMon = ((1 - now.getUTCDay() + 7) % 7) || 7;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMon, 8, 0, 0));

    // 1. Host schedules recurring Team Sync every Monday and Wednesday at 1:30 PM Asia/Kolkata
    const scheduled = await meetingService.scheduleMeeting(ownerUser.id, {
      title: 'Team Sync',
      scheduledAt: monday.toISOString(),
      timezone: 'Asia/Kolkata',
      durationMinutes: 30,
      meetingType: 'recurring',
      recurrence: {
        frequency: 'weekly',
        interval: 1,
        weekdays: [1, 3], // Monday & Wednesday
        occurrenceCount: 6,
      },
      settings: {
        joinBeforeHost: false,
        waitingRoomEnabled: true,
        requireAuthentication: false,
      },
    });

    expect(scheduled.meeting.meeting_type).toBe('recurring');
    expect(scheduled.occurrences).toHaveLength(6);
    const monOcc = scheduled.occurrences[0];
    const wedOcc = scheduled.occurrences[1];
    expect(wedOcc.scheduled_at.getTime()).toBeGreaterThan(monOcc.scheduled_at.getTime());

    // Before host starts on Monday -> random person / participant cannot start or join
    const preStartPublic = await meetingService.getPublicMeetingInfo(scheduled.meeting.room_id, null);
    expect(preStartPublic.resolutionStatus).toBe('waiting_for_host');
    expect(preStartPublic.nextOccurrence?.id).toBe(monOcc.id);

    await expect(
      meetingService.startMeeting(randomUser.id, scheduled.meeting.id)
    ).rejects.toThrow('Unauthorized');

    // 2. On Monday, host starts the meeting
    const monStart = await meetingService.startMeeting(ownerUser.id, scheduled.meeting.id);
    expect(monStart.occurrence.id).toBe(monOcc.id);
    expect(monStart.occurrence.status).toBe('active');
    expect(monStart.session.jitsi_room_name).toContain(`faceonn-${scheduled.meeting.room_id}-`);
    expect(decodeToken(monStart.token).context.user.moderator).toBe(true);
    expect(decodeToken(monStart.token).room).toBe(monStart.session.jitsi_room_name);

    // 3. Participants (authenticated + guest) join Monday's active session — NEVER moderator
    const participantMonJoin = await meetingService.getMeetingOrJoin(
      participantUser.id,
      scheduled.meeting.room_id
    );
    expect(participantMonJoin.role).toBe('participant');
    expect(participantMonJoin.session.id).toBe(monStart.session.id);
    expect(decodeToken(participantMonJoin.token).context.user.moderator).toBe(false);
    expect(decodeToken(participantMonJoin.token).room).toBe(monStart.session.jitsi_room_name);

    const guestMonJoin = await meetingService.guestJoinMeeting(scheduled.meeting.room_id, 'Guest Alex');
    expect(guestMonJoin.session.id).toBe(monStart.session.id);
    expect(decodeToken(guestMonJoin.token).context.user.moderator).toBe(false);

    // 4. Host clicks End Meeting (current occurrence ONLY)
    const endRes = await meetingService.endOccurrence(ownerUser.id, scheduled.meeting.id);
    expect(endRes.endedOccurrence?.id).toBe(monOcc.id);
    expect(endRes.endedOccurrence?.status).toBe('ended');
    expect(endRes.nextOccurrence?.id).toBe(wedOcc.id);
    expect(endRes.meeting.series_status).toBe('active');

    // Idempotent repeat endOccurrence does not fail
    const endResAgain = await meetingService.endOccurrence(ownerUser.id, scheduled.meeting.id);
    expect(endResAgain.meeting.series_status).toBe('active');

    // 5. Random person opens the same meeting link 5 minutes later
    const betweenPublic = await meetingService.getPublicMeetingInfo(scheduled.meeting.room_id, randomUser.id);
    expect(betweenPublic.resolutionStatus).toBe('waiting_for_host');
    expect(betweenPublic.lastEndedOccurrence?.id).toBe(monOcc.id);
    expect(betweenPublic.nextOccurrence?.id).toBe(wedOcc.id);
    expect(betweenPublic.isHost).toBe(false);

    // Random person CANNOT join, CANNOT start, CANNOT become host
    await expect(
      meetingService.getMeetingOrJoin(randomUser.id, scheduled.meeting.room_id)
    ).rejects.toThrow('The host has not started this meeting yet');
    await expect(
      meetingService.guestJoinMeeting(scheduled.meeting.room_id, 'Random Intruder')
    ).rejects.toThrow('The host has not started this meeting yet');
    await expect(
      meetingService.startMeeting(randomUser.id, scheduled.meeting.id)
    ).rejects.toThrow('Unauthorized');

    // 6. On Wednesday, authorized host opens the same permanent link and starts the next occurrence
    const wedStart = await meetingService.startMeeting(ownerUser.id, scheduled.meeting.id);
    expect(wedStart.occurrence.id).toBe(wedOcc.id);
    expect(wedStart.occurrence.status).toBe('active');
    // CRITICAL: Wednesday MUST get a fresh isolated Jitsi room, NOT Monday's stale room!
    expect(wedStart.session.id).not.toBe(monStart.session.id);
    expect(wedStart.session.jitsi_room_name).not.toBe(monStart.session.jitsi_room_name);

    // Participants join Wednesday's fresh occurrence normally
    const participantWedJoin = await meetingService.getMeetingOrJoin(
      participantUser.id,
      scheduled.meeting.room_id
    );
    expect(participantWedJoin.session.jitsi_room_name).toBe(wedStart.session.jitsi_room_name);
    expect(decodeToken(participantWedJoin.token).context.user.moderator).toBe(false);

    // 7. Finally, host selects End Meeting Series
    const cancelledSeries = await meetingService.endSeries(ownerUser.id, scheduled.meeting.id);
    expect(cancelledSeries.series_status).toBe('cancelled');
    expect(cancelledSeries.status).toBe('cancelled');

    // All future occurrences are cancelled and permanent link is permanently invalid
    const allOccurrences = await occurrenceRepository.listByMeetingId(scheduled.meeting.id);
    const futureRemaining = allOccurrences.filter((o) => o.status === 'scheduled' || o.status === 'active');
    expect(futureRemaining).toHaveLength(0);

    const afterCancelPublic = await meetingService.getPublicMeetingInfo(scheduled.meeting.room_id, null);
    expect(afterCancelPublic.resolutionStatus).toBe('cancelled');

    await expect(
      meetingService.getMeetingOrJoin(participantUser.id, scheduled.meeting.room_id)
    ).rejects.toThrow('cancelled');
    await expect(
      meetingService.startMeeting(ownerUser.id, scheduled.meeting.id)
    ).rejects.toThrow('cancelled');
  });

  it('prevents host takeover: unknown rooms are NEVER created via join/token route', async () => {
    await expect(
      meetingService.getMeetingOrJoin(randomUser.id, 'made-up-room-id')
    ).rejects.toThrow('Meeting not found');
  });

  it('authorizes verified alternative hosts to start and enforces concurrency-safe single active session', async () => {
    const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
    const scheduled = await meetingService.scheduleMeeting(ownerUser.id, {
      title: 'Leadership Sync',
      scheduledAt: futureDate,
      timezone: 'UTC',
      durationMinutes: 45,
      alternativeHostIds: [altHostUser.id],
      settings: { joinBeforeHost: false },
    });

    expect(scheduled.alternativeHosts).toHaveLength(1);
    expect(scheduled.alternativeHosts[0].user_id).toBe(altHostUser.id);

    // Simultaneous start by owner & alternative host yields ONE shared active session
    const [s1, s2] = await Promise.all([
      meetingService.startMeeting(ownerUser.id, scheduled.meeting.id),
      meetingService.startMeeting(altHostUser.id, scheduled.meeting.id),
    ]);

    expect(s1.session.id).toBe(s2.session.id);
    expect(s1.session.jitsi_room_name).toBe(s2.session.jitsi_room_name);
    expect(decodeToken(s1.token).context.user.moderator).toBe(true);
    expect(decodeToken(s2.token).context.user.moderator).toBe(true);

    // Alternative host can end occurrence, but ONLY owner can end entire series
    await expect(
      meetingService.endSeries(altHostUser.id, scheduled.meeting.id)
    ).rejects.toThrow('Only the meeting owner');
  });

  it('enforces join-before-host lead time window and never elevates early joiners to moderator', async () => {
    const inThirtyMin = new Date(Date.now() + 30 * 60000).toISOString();
    const scheduled = await meetingService.scheduleMeeting(ownerUser.id, {
      title: 'Early Bird Window Test',
      scheduledAt: inThirtyMin,
      timezone: 'UTC',
      durationMinutes: 30,
      settings: {
        joinBeforeHost: true,
        joinBeforeHostMinutes: 10, // Only 10 min before start
      },
    });

    // 30 minutes before start -> blocked
    await expect(
      meetingService.getMeetingOrJoin(participantUser.id, scheduled.meeting.room_id)
    ).rejects.toThrow('The host has not started this meeting yet');

    // Reschedule to 5 minutes from now -> within 10-minute lead window -> allowed as participant (NOT moderator!)
    const inFiveMin = new Date(Date.now() + 5 * 60000).toISOString();
    await meetingService.updateMeeting(ownerUser.id, scheduled.meeting.id, {
      scheduledAt: inFiveMin,
    });

    const earlyJoin = await meetingService.getMeetingOrJoin(
      participantUser.id,
      scheduled.meeting.room_id
    );
    expect(earlyJoin.role).toBe('participant');
    expect(decodeToken(earlyJoin.token).context.user.moderator).toBe(false);
  });

  it('marks missed occurrences after grace period while preserving future recurring occurrences', async () => {
    const twoHoursAgo = new Date(Date.now() - 120 * 60000);
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);

    const meeting = await meetingRepository.createMeeting({
      room_id: 'mis-sed-001',
      title: 'Daily Standup',
      owner_user_id: ownerUser.id,
      status: 'scheduled',
      series_status: 'active',
      is_scheduled: true,
      meeting_type: 'recurring',
      scheduled_at: twoHoursAgo,
      duration_minutes: 15,
      timezone: 'UTC',
      recurrence_type: 'daily',
      recurrence_rule: 'FREQ=DAILY;COUNT=5',
      settings: { joinBeforeHost: false },
    });

    const [pastOcc, nextOcc] = await occurrenceRepository.createOccurrences(meeting.id, [
      {
        occurrence_number: 1,
        scheduled_at: twoHoursAgo,
        scheduled_end_at: new Date(twoHoursAgo.getTime() + 15 * 60000),
        status: 'scheduled',
      },
      {
        occurrence_number: 2,
        scheduled_at: tomorrow,
        scheduled_end_at: new Date(tomorrow.getTime() + 15 * 60000),
        status: 'scheduled',
      },
    ]);

    const resolution = await meetingAuthorizationService.resolveMeetingAccess(meeting.room_id, null);
    expect(resolution.status).toBe('waiting_for_host');
    expect(resolution.nextOccurrence?.id).toBe(nextOcc.id);

    const refreshedPast = await occurrenceRepository.findById(pastOcc.id);
    expect(refreshedPast?.status).toBe('missed');
  });

  it('preserves local wall-clock time across DST transition in America/New_York', () => {
    // March 6, 2026 13:30 EST (UTC-5 = 18:30Z) -> DST springs forward March 8, 2026 -> March 9 should be 13:30 EDT (UTC-4 = 17:30Z)
    const startBeforeDst = new Date('2026-03-06T18:30:00.000Z');
    const dates = meetingRecurrenceService.calculateOccurrences(
      startBeforeDst,
      { frequency: 'daily', interval: 1, occurrenceCount: 5 },
      5,
      'America/New_York'
    );

    expect(dates).toHaveLength(5);
    // Before DST (Mar 6): 18:30Z
    expect(dates[0].toISOString()).toBe('2026-03-06T18:30:00.000Z');
    // After DST (Mar 9): 17:30Z (still 1:30 PM New York time!)
    expect(dates[3].toISOString()).toBe('2026-03-09T17:30:00.000Z');
  });

  it('builds weekdays and monthly nth-weekday RRULEs and human-readable summaries', () => {
    const weekdaysRule = meetingRecurrenceService.buildRrule({
      frequency: 'weekdays',
      interval: 1,
      occurrenceCount: 10,
    });
    expect(weekdaysRule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=10');
    expect(meetingRecurrenceService.describeRecurrence(weekdaysRule)).toContain('Every weekday');

    const monthlyRule = meetingRecurrenceService.buildRrule({
      frequency: 'monthly',
      interval: 1,
      monthlyMode: 'nth_weekday',
      monthlyWeek: -1,
      monthlyWeekday: 5, // Last Friday
    });
    expect(monthlyRule).toBe('FREQ=MONTHLY;BYDAY=-1FR');
    expect(meetingRecurrenceService.describeRecurrence(monthlyRule)).toBe('Monthly on the last Friday');
  });
});
