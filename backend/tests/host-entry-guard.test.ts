import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { meetingService } from '../src/meetings/meeting-service';
import { meetingRepository } from '../src/db/repositories/meeting-repository';
import { userRepository } from '../src/db/repositories/user-repository';
import { occurrenceRepository } from '../src/db/repositories/occurrence-repository';
import { meetingSessionRepository } from '../src/db/repositories/meeting-session-repository';
import { alternativeHostRepository } from '../src/db/repositories/alternative-host-repository';
import { UserRecord } from '../src/db/types';

function decodeToken(token: string): any {
  return jwt.decode(token);
}

describe('Host In-Room Entry Guard & Anti-Takeover Protection', () => {
  let adminHost: UserRecord;
  let attendeeUser: UserRecord;
  let coHostUser: UserRecord;

  beforeEach(async () => {
    await meetingSessionRepository.clearAll();
    await occurrenceRepository.clearAll();
    await alternativeHostRepository.clearAll();
    await meetingRepository.clearAll();
    await userRepository.clearAll();

    adminHost = await userRepository.createUser({
      name: 'Admin Host',
      email: 'admin@faceonn.com',
      password_hash: 'hash',
      status: 'active',
    });

    attendeeUser = await userRepository.createUser({
      name: 'Waiting Participant',
      email: 'attendee@faceonn.com',
      password_hash: 'hash',
      status: 'active',
    });

    coHostUser = await userRepository.createUser({
      name: 'Alternative Host',
      email: 'cohost@faceonn.com',
      password_hash: 'hash',
      status: 'active',
    });
  });

  it('guarantees participants and guests cannot join when admin started meeting from dashboard until host actually joins the room', async () => {
    const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();

    // 1. Admin schedules a meeting with default joinBeforeHost = false
    const scheduled = await meetingService.scheduleMeeting(adminHost.id, {
      title: 'Quarterly Planning',
      scheduledAt: futureDate,
      timezone: 'UTC',
      durationMinutes: 60,
      alternativeHostIds: [coHostUser.id],
      settings: {
        joinBeforeHost: false,
        requireAuthentication: false,
      },
    });

    const roomId = scheduled.meeting.room_id;
    const meetingId = scheduled.meeting.id;

    // 2. Before admin clicks Start: participant gets WAITING_FOR_HOST
    const preInfo = await meetingService.getPublicMeetingInfo(roomId, attendeeUser.id);
    expect(preInfo.resolutionStatus).toBe('waiting_for_host');
    expect(preInfo.canJoinBeforeHostNow).toBe(false);
    expect(preInfo.isHostJoined).toBe(false);

    await expect(
      meetingService.getMeetingOrJoin(attendeeUser.id, roomId)
    ).rejects.toThrow('The host has not started this meeting yet. Please wait for the host.');

    // 3. At start time: Admin clicks "Start" button from dashboard (POST /api/meetings/:id/start)
    // This creates an active session and marks occurrence active, BUT admin has NOT joined the room yet!
    const startResult = await meetingService.startMeeting(adminHost.id, meetingId);
    expect(startResult.session.status).toBe('active');
    expect(startResult.session.host_joined_at).toBeNull();
    expect(startResult.session.host_in_room).toBe(false);

    // 4. Meanwhile, a waiting participant or guest tries to join before host enters room:
    // MUST BE REJECTED with code WAITING_FOR_HOST!
    const duringDashStartInfo = await meetingService.getPublicMeetingInfo(roomId, attendeeUser.id);
    expect(duringDashStartInfo.resolutionStatus).toBe('waiting_for_host');
    expect(duringDashStartInfo.canJoinBeforeHostNow).toBe(false);
    expect(duringDashStartInfo.isHostJoined).toBe(false);

    await expect(
      meetingService.getMeetingOrJoin(attendeeUser.id, roomId)
    ).rejects.toThrow('The host has not joined this meeting yet. Please wait for the host.');

    await expect(
      meetingService.guestJoinMeeting(roomId, 'Early Guest')
    ).rejects.toThrow('The host has not joined this meeting yet. Please wait for the host.');

    // 5. Host's resolution status remains 'active' so the host can get their token and connect
    const hostInfo = await meetingService.getPublicMeetingInfo(roomId, adminHost.id);
    expect(hostInfo.resolutionStatus).toBe('active');
    expect(hostInfo.isHost).toBe(true);

    const hostToken = await meetingService.getMeetingOrJoin(adminHost.id, roomId);
    expect(hostToken.role).toBe('owner');
    expect(decodeToken(hostToken.token).context.user.moderator).toBe(true);

    // 6. Host's conference joins (CONFERENCE_JOINED) -> triggers recordHostJoined
    const hostJoinRecord = await meetingService.recordHostJoined(adminHost.id, meetingId);
    expect(hostJoinRecord.success).toBe(true);
    expect(hostJoinRecord.session.host_joined_at).not.toBeNull();
    expect(hostJoinRecord.session.host_in_room).toBe(true);

    // 7. Now public meeting info indicates host has joined and meeting is active for participants
    const postHostJoinInfo = await meetingService.getPublicMeetingInfo(roomId, attendeeUser.id);
    expect(postHostJoinInfo.resolutionStatus).toBe('active');
    expect(postHostJoinInfo.canJoinBeforeHostNow).toBe(true);
    expect(postHostJoinInfo.isHostJoined).toBe(true);

    // 8. Now participants can join safely, receiving participant role (NEVER moderator)
    const attendeeJoined = await meetingService.getMeetingOrJoin(attendeeUser.id, roomId);
    expect(attendeeJoined.role).toBe('participant');
    expect(attendeeJoined.session.id).toBe(startResult.session.id);
    expect(decodeToken(attendeeJoined.token).context.user.moderator).toBe(false);

    // 9. Guests can also join safely
    const guestJoined = await meetingService.guestJoinMeeting(roomId, 'Guest Sarah');
    expect(guestJoined.role).toBe('participant');
    expect(guestJoined.displayName).toBe('Guest Sarah');
    expect(decodeToken(guestJoined.token).context.user.moderator).toBe(false);

    // 10. Alternative host can also record joined/left
    const coHostLeave = await meetingService.recordHostLeft(coHostUser.id, meetingId);
    expect(coHostLeave.success).toBe(true);
  });

  it('permits immediate entry when joinBeforeHost = true is explicitly configured by organizer', async () => {
    const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();

    const scheduled = await meetingService.scheduleMeeting(adminHost.id, {
      title: 'Open Coffee Chat',
      scheduledAt: futureDate,
      timezone: 'UTC',
      durationMinutes: 30,
      settings: {
        joinBeforeHost: true,
        joinBeforeHostMinutes: 0,
      },
    });

    const roomId = scheduled.meeting.room_id;

    // Even though host has not started, attendee can join early because joinBeforeHost is explicitly enabled
    const attendeeJoin = await meetingService.getMeetingOrJoin(attendeeUser.id, roomId);
    expect(attendeeJoin.role).toBe('participant');
    expect(decodeToken(attendeeJoin.token).context.user.moderator).toBe(false);
  });
});

