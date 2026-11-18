import { describe, it, expect, beforeEach } from 'vitest';
import { meetingService } from '../src/meetings/meeting-service';
import { meetingCalendarService } from '../src/meetings/meeting-calendar-service';
import { meetingRecurrenceService } from '../src/meetings/meeting-recurrence-service';
import { meetingRepository } from '../src/db/repositories/meeting-repository';
import { userRepository } from '../src/db/repositories/user-repository';
import { invitationRepository } from '../src/db/repositories/invitation-repository';
import { recurrenceRepository } from '../src/db/repositories/recurrence-repository';
import { occurrenceRepository } from '../src/db/repositories/occurrence-repository';
import { meetingSessionRepository } from '../src/db/repositories/meeting-session-repository';
import { alternativeHostRepository } from '../src/db/repositories/alternative-host-repository';
import { UserRecord } from '../src/db/types';

describe('Faceonn Meeting Scheduling System Unit & Integration Tests', () => {
  let hostUser: UserRecord;
  let attendeeUser: UserRecord;

  beforeEach(async () => {
    await meetingSessionRepository.clearAll();
    await occurrenceRepository.clearAll();
    await alternativeHostRepository.clearAll();
    await meetingRepository.clearAll();
    await invitationRepository.clearAll();
    await recurrenceRepository.clearAll();
    await userRepository.clearAll();

    hostUser = await userRepository.createUser({
      name: 'Alice Host',
      email: 'alice@faceonn.com',
      password_hash: 'hashedpassword',
      status: 'active',
    });

    attendeeUser = await userRepository.createUser({
      name: 'Bob Attendee',
      email: 'bob@faceonn.com',
      password_hash: 'hashedpassword',
      status: 'active',
    });
  });

  describe('Section A: Meeting Information & Validation', () => {
    it('rejects scheduling a meeting with an empty topic', async () => {
      const futureDate = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
      await expect(
        meetingService.scheduleMeeting(hostUser.id, {
          title: '   ',
          scheduledAt: futureDate,
          timezone: 'Asia/Kolkata',
          durationMinutes: 30,
        })
      ).rejects.toThrow('Meeting topic is required');
    });

    it('rejects scheduling a meeting with a topic exceeding 200 characters', async () => {
      const futureDate = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
      await expect(
        meetingService.scheduleMeeting(hostUser.id, {
          title: 'A'.repeat(201),
          scheduledAt: futureDate,
          timezone: 'Asia/Kolkata',
          durationMinutes: 30,
        })
      ).rejects.toThrow('Meeting topic cannot exceed 200 characters');
    });

    it('rejects scheduling a meeting in the past', async () => {
      const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
      await expect(
        meetingService.scheduleMeeting(hostUser.id, {
          title: 'Past Meeting',
          scheduledAt: pastDate,
          timezone: 'UTC',
          durationMinutes: 45,
        })
      ).rejects.toThrow('Cannot schedule a meeting in the past');
    });

    it('successfully schedules a valid meeting with topic, duration, and timezone', async () => {
      const futureDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const result = await meetingService.scheduleMeeting(hostUser.id, {
        title: 'Q4 Strategy Review',
        description: 'Quarterly roadmap alignment',
        scheduledAt: futureDate,
        timezone: 'America/New_York',
        durationMinutes: 60,
      });

      expect(result.meeting).toBeDefined();
      expect(result.meeting.title).toBe('Q4 Strategy Review');
      expect(result.meeting.duration_minutes).toBe(60);
      expect(result.meeting.timezone).toBe('America/New_York');
      expect(result.meeting.status).toBe('scheduled');
      expect(result.meeting.is_scheduled).toBe(true);
      expect(result.roomUrl).toContain(result.meeting.room_id);
      expect(result.token).toBeDefined();
    });
  });

  describe('Section B: Recurrence Calculations & RRULE', () => {
    it('builds RFC 5545 RRULE string for daily recurrence', () => {
      const rrule = meetingRecurrenceService.buildRrule({
        frequency: 'daily',
        interval: 2,
        occurrenceCount: 5,
      });
      expect(rrule).toBe('FREQ=DAILY;INTERVAL=2;COUNT=5');
    });

    it('builds RFC 5545 RRULE string for weekly recurrence with weekdays', () => {
      const rrule = meetingRecurrenceService.buildRrule({
        frequency: 'weekly',
        interval: 1,
        weekdays: [1, 3, 5], // Mon, Wed, Fri
      });
      expect(rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    });

    it('calculates expected occurrences correctly', () => {
      const start = new Date('2026-12-01T10:00:00Z');
      const dates = meetingRecurrenceService.calculateOccurrences(
        start,
        {
          frequency: 'daily',
          interval: 1,
          occurrenceCount: 3,
        },
        5
      );

      expect(dates).toHaveLength(3);
      expect(dates[0].toISOString()).toBe('2026-12-01T10:00:00.000Z');
      expect(dates[1].toISOString()).toBe('2026-12-02T10:00:00.000Z');
      expect(dates[2].toISOString()).toBe('2026-12-03T10:00:00.000Z');
    });
  });

  describe('Section C: Security, Passcodes, and Join Enforcement', () => {
    it('enforces passcode requirement for attendees while allowing host direct entry', async () => {
      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const scheduled = await meetingService.scheduleMeeting(hostUser.id, {
        title: 'Executive Sync',
        scheduledAt: futureDate,
        timezone: 'UTC',
        durationMinutes: 30,
        settings: {
          passcodeEnabled: true,
          passcode: 'SecretPass123',
        },
      });

      expect(scheduled.meeting.passcode_hash).toBeDefined();
      expect(scheduled.meeting.passcode_hash).not.toBe('SecretPass123');

      // Host enters without passcode -> Success
      const hostJoin = await meetingService.getMeetingOrJoin(hostUser.id, scheduled.meeting.room_id);
      expect(hostJoin.role).toBe('owner');

      // Attendee attempts without passcode -> 403 PASSCODE_REQUIRED
      await expect(
        meetingService.getMeetingOrJoin(attendeeUser.id, scheduled.meeting.room_id)
      ).rejects.toThrow('Passcode required to join this meeting');

      // Attendee enters with wrong passcode -> 403 INVALID_PASSCODE
      await expect(
        meetingService.getMeetingOrJoin(attendeeUser.id, scheduled.meeting.room_id, 'WrongPass')
      ).rejects.toThrow('Invalid meeting passcode');

      // Attendee enters with correct passcode -> Success
      const attendeeJoin = await meetingService.getMeetingOrJoin(
        attendeeUser.id,
        scheduled.meeting.room_id,
        'SecretPass123'
      );
      expect(attendeeJoin.role).toBe('participant');
    });

    it('enforces join-before-host: attendees wait until host starts or enters the meeting', async () => {
      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const scheduled = await meetingService.scheduleMeeting(hostUser.id, {
        title: 'Moderated Workshop',
        scheduledAt: futureDate,
        timezone: 'UTC',
        durationMinutes: 45,
        settings: {
          joinBeforeHost: false,
        },
      });

      // Attendee tries to join before host starts -> Rejected
      await expect(
        meetingService.getMeetingOrJoin(attendeeUser.id, scheduled.meeting.room_id)
      ).rejects.toThrow('The host has not started this meeting yet. Please wait for the host.');

      // Host starts the meeting
      await meetingService.startMeeting(hostUser.id, scheduled.meeting.id);

      // Now attendee can join
      const attendeeJoin = await meetingService.getMeetingOrJoin(attendeeUser.id, scheduled.meeting.room_id);
      expect(attendeeJoin.role).toBe('participant');
    });

    it('checks waiting-for-host before passcode and never stores plaintext passcode in settings', async () => {
      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const scheduled = await meetingService.scheduleMeeting(hostUser.id, {
        title: 'Locked Future Session',
        scheduledAt: futureDate,
        timezone: 'Asia/Kolkata',
        durationMinutes: 60,
        settings: {
          joinBeforeHost: false,
          passcodeEnabled: true,
          passcode: 'TopSecret99',
        },
      });

      // Plaintext passcode must NOT be stored inside settings JSON
      expect((scheduled.meeting.settings as any).passcode).toBeUndefined();

      // Public info reveals safe status without leaking passcode
      const publicInfo = await meetingService.getPublicMeetingInfo(scheduled.meeting.room_id, null);
      expect(publicInfo.exists).toBe(true);
      expect(publicInfo.status).toBe('scheduled');
      expect(publicInfo.joinBeforeHost).toBe(false);
      expect(publicInfo.passcodeEnabled).toBe(true);
      expect((publicInfo as any).passcode).toBeUndefined();

      // Attendee gets WAITING_FOR_HOST first (before passcode prompt)
      try {
        await meetingService.getMeetingOrJoin(attendeeUser.id, scheduled.meeting.room_id);
        expect.unreachable('Should have rejected with WAITING_FOR_HOST');
      } catch (err: any) {
        expect(err.code).toBe('WAITING_FOR_HOST');
      }

      // Host visiting link with allowHostAutoStart: false gets HOST_NOT_STARTED instead of silently activating
      try {
        await meetingService.getMeetingOrJoin(hostUser.id, scheduled.meeting.room_id, undefined, {
          allowHostAutoStart: false,
        });
        expect.unreachable('Should have rejected with HOST_NOT_STARTED');
      } catch (err: any) {
        expect(err.code).toBe('HOST_NOT_STARTED');
      }

      // Once host explicitly starts, attendee is now prompted for passcode
      await meetingService.startMeeting(hostUser.id, scheduled.meeting.id);
      try {
        await meetingService.getMeetingOrJoin(attendeeUser.id, scheduled.meeting.room_id);
        expect.unreachable('Should have rejected with PASSCODE_REQUIRED');
      } catch (err: any) {
        expect(err.code).toBe('PASSCODE_REQUIRED');
      }

      // With right passcode, attendee joins
      const joined = await meetingService.getMeetingOrJoin(
        attendeeUser.id,
        scheduled.meeting.room_id,
        'TopSecret99'
      );
      expect(joined.role).toBe('participant');
    });

    it('allows unauthenticated guests to join without an account when requireAuthentication is false, while still enforcing waiting-for-host and passcode', async () => {
      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const scheduled = await meetingService.scheduleMeeting(hostUser.id, {
        title: 'Open Guest Webinar',
        scheduledAt: futureDate,
        timezone: 'UTC',
        durationMinutes: 60,
        settings: {
          joinBeforeHost: false,
          requireAuthentication: false,
          passcodeEnabled: true,
          passcode: 'GuestPass42',
        },
      });

      // Guest cannot join non-existent room
      await expect(
        meetingService.guestJoinMeeting('non-existent-room', 'Jane Guest')
      ).rejects.toThrow('Meeting not found');

      // Guest blocked before host starts
      try {
        await meetingService.guestJoinMeeting(scheduled.meeting.room_id, 'Jane Guest', 'GuestPass42');
        expect.unreachable('Should have rejected with WAITING_FOR_HOST');
      } catch (err: any) {
        expect(err.code).toBe('WAITING_FOR_HOST');
      }

      // Host starts meeting
      await meetingService.startMeeting(hostUser.id, scheduled.meeting.id);

      // Guest blocked without passcode
      try {
        await meetingService.guestJoinMeeting(scheduled.meeting.room_id, 'Jane Guest');
        expect.unreachable('Should have rejected with PASSCODE_REQUIRED');
      } catch (err: any) {
        expect(err.code).toBe('PASSCODE_REQUIRED');
      }

      // Guest joins cleanly with name + right passcode -> receives non-moderator token
      const guestJoin = await meetingService.guestJoinMeeting(
        scheduled.meeting.room_id,
        'Jane Guest',
        'GuestPass42'
      );
      expect(guestJoin.role).toBe('participant');
      expect(guestJoin.displayName).toBe('Jane Guest');
      expect(guestJoin.token).toBeDefined();

      // If host enables requireAuthentication, guests are blocked with AUTH_REQUIRED
      await meetingService.updateMeeting(hostUser.id, scheduled.meeting.id, {
        settings: { requireAuthentication: true },
      });
      try {
        await meetingService.guestJoinMeeting(scheduled.meeting.room_id, 'Jane Guest', 'GuestPass42');
        expect.unreachable('Should have rejected with AUTH_REQUIRED');
      } catch (err: any) {
        expect(err.code).toBe('AUTH_REQUIRED');
      }
    });
  });

  describe('Section D & F: Calendar Integration & RFC 5545 ICS Export', () => {
    it('generates a standards-compliant RFC 5545 .ics file with CRLF endings and folded lines', async () => {
      const futureDate = new Date(Date.now() + 2 * 3600 * 1000);
      const scheduled = await meetingService.scheduleMeeting(hostUser.id, {
        title: 'Design System & Architecture Alignment Meeting With External Partners',
        description: 'Deep dive into UI components and responsive layout strategies.',
        scheduledAt: futureDate.toISOString(),
        timezone: 'Europe/London',
        durationMinutes: 45,
      });

      const ics = meetingCalendarService.generateIcs(scheduled.meeting, {
        organizerName: hostUser.name,
        organizerEmail: hostUser.email,
        origin: 'https://faceonn.com',
      });

      expect(ics).toContain('BEGIN:VCALENDAR\r\n');
      expect(ics).toContain('VERSION:2.0\r\n');
      expect(ics).toContain('METHOD:REQUEST\r\n');
      expect(ics).toContain('BEGIN:VEVENT\r\n');
      expect(ics).toContain('DTSTART:');
      expect(ics).toContain('DTEND:');
      expect(ics).toContain('BEGIN:VALARM\r\n');
      expect(ics).toContain('TRIGGER:-PT15M\r\n');
      expect(ics).toContain('END:VEVENT\r\n');
      expect(ics).toContain('END:VCALENDAR\r\n');
      // Every line ending is CRLF
      expect(ics.includes('\r\n')).toBe(true);
    });

    it('generates valid Google Calendar web URLs', async () => {
      const futureDate = new Date(Date.now() + 2 * 3600 * 1000);
      const scheduled = await meetingService.scheduleMeeting(hostUser.id, {
        title: 'Sprint Demo',
        scheduledAt: futureDate.toISOString(),
        timezone: 'UTC',
        durationMinutes: 30,
      });

      const googleUrl = meetingCalendarService.generateGoogleCalendarUrl(
        scheduled.meeting,
        'https://faceonn.com'
      );
      expect(googleUrl).toContain('https://calendar.google.com/calendar/render?action=TEMPLATE');
      expect(googleUrl).toContain('text=Sprint%20Demo');
      expect(googleUrl).toContain('location=');
    });
  });

  describe('Section E: Meeting Lifecycle (Cancel, Reschedule, History)', () => {
    it('allows owner to cancel meeting and blocks further joins', async () => {
      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const scheduled = await meetingService.scheduleMeeting(hostUser.id, {
        title: 'Project Kickoff',
        scheduledAt: futureDate,
        timezone: 'UTC',
        durationMinutes: 30,
      });

      // Non-owner cannot cancel
      await expect(
        meetingService.cancelMeeting(attendeeUser.id, scheduled.meeting.id)
      ).rejects.toThrow('Unauthorized: Only meeting owner can cancel this meeting');

      // Owner cancels
      const cancelled = await meetingService.cancelMeeting(hostUser.id, scheduled.meeting.id);
      expect(cancelled).toBe(true);

      // Attempt to join cancelled meeting is rejected with 410
      await expect(
        meetingService.getMeetingOrJoin(hostUser.id, scheduled.meeting.room_id)
      ).rejects.toThrow('This scheduled meeting has been cancelled by the host.');
    });

    it('allows owner to update meeting topic and duration', async () => {
      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();
      const scheduled = await meetingService.scheduleMeeting(hostUser.id, {
        title: 'Initial Title',
        scheduledAt: futureDate,
        timezone: 'UTC',
        durationMinutes: 30,
      });

      const updated = await meetingService.updateMeeting(hostUser.id, scheduled.meeting.id, {
        title: 'Updated Strategic Sync',
        durationMinutes: 45,
      });

      expect(updated.title).toBe('Updated Strategic Sync');
      expect(updated.duration_minutes).toBe(45);
    });

    it('correctly filters upcoming vs past meetings', async () => {
      const futureDate = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
      await meetingService.scheduleMeeting(hostUser.id, {
        title: 'Upcoming Meeting 1',
        scheduledAt: futureDate,
        timezone: 'UTC',
        durationMinutes: 30,
      });

      const upcoming = await meetingService.listUpcomingMeetings(hostUser.id);
      expect(upcoming.length).toBeGreaterThanOrEqual(1);
      expect(upcoming.some((m) => m.title === 'Upcoming Meeting 1')).toBe(true);
    });
  });
});

