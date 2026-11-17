import crypto from 'crypto';
import { meetingRepository, DEFAULT_MEETING_SETTINGS } from '../db/repositories/meeting-repository';
import { userRepository } from '../db/repositories/user-repository';
import { invitationRepository } from '../db/repositories/invitation-repository';
import { recurrenceRepository } from '../db/repositories/recurrence-repository';
import {
  MeetingRecord,
  MeetingInvitationRecord,
  ScheduleMeetingDTO,
  UpdateMeetingDTO,
  MeetingSettings,
} from '../db/types';
import { generateJitsiMeetingToken } from '../auth/tokens';
import { meetingCalendarService } from './meeting-calendar-service';
import { meetingRecurrenceService } from './meeting-recurrence-service';

export class MeetingService {
  public generateRoomId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let room = '';
    const bytes = crypto.randomBytes(9);
    for (let i = 0; i < 9; i++) {
      if (i > 0 && i % 3 === 0) room += '-';
      room += chars[bytes[i] % chars.length];
    }
    return room;
  }

  public hashPasscode(passcode: string): string {
    return crypto.createHash('sha256').update(passcode.trim()).digest('hex');
  }

  public verifyPasscode(storedHash: string, inputPasscode: string): boolean {
    const inputHash = this.hashPasscode(inputPasscode);
    return crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(inputHash));
  }

  public async createMeeting(
    userId: string,
    title?: string
  ): Promise<{ meeting: MeetingRecord; token: string; role: 'owner' | 'moderator' | 'participant' }> {
    const user = await userRepository.findById(userId);
    if (!user || user.status !== 'active') {
      throw new Error('User not authorized to create meetings');
    }

    const roomId = this.generateRoomId();
    const meetingTitle = title && title.trim() ? title.trim() : 'Faceonn Meeting';

    const meeting = await meetingRepository.createMeeting({
      room_id: roomId,
      title: meetingTitle,
      owner_user_id: user.id,
      status: 'active',
      is_scheduled: false,
      meeting_type: 'instant',
    });

    const token = generateJitsiMeetingToken({
      user,
      room: meeting.room_id,
      isModerator: true,
      meetingSettings: meeting.settings,
    });

    return {
      meeting,
      token,
      role: 'owner',
    };
  }

  public async scheduleMeeting(
    userId: string,
    data: ScheduleMeetingDTO,
    origin = 'https://faceonn.com'
  ): Promise<{
    meeting: MeetingRecord;
    invitees: MeetingInvitationRecord[];
    token: string;
    roomUrl: string;
    googleCalendarUrl: string;
    outlookCalendarUrl: string;
    icsUrl: string;
    invitationText: string;
  }> {
    const user = await userRepository.findById(userId);
    if (!user || user.status !== 'active') {
      throw new Error('User not authorized to schedule meetings');
    }

    // 1. Validate Title
    const title = data.title ? data.title.trim() : '';
    if (!title) {
      throw new Error('Meeting topic is required');
    }
    if (title.length > 200) {
      throw new Error('Meeting topic cannot exceed 200 characters');
    }

    // 2. Validate Scheduled Date/Time
    const scheduledAt = new Date(data.scheduledAt);
    if (isNaN(scheduledAt.getTime())) {
      throw new Error('Invalid scheduled meeting date/time');
    }

    // Reject past dates (allow 5-minute buffer for clock drift)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (scheduledAt.getTime() < fiveMinutesAgo) {
      throw new Error('Cannot schedule a meeting in the past');
    }

    // 3. Duration & Timezone
    const durationMinutes = data.durationMinutes && data.durationMinutes > 0 ? data.durationMinutes : 30;
    const timezone = data.timezone || 'UTC';

    // 4. Room ID (Personal Meeting ID vs Auto-generated)
    let roomId = this.generateRoomId();
    if (data.usePmi && user.pmi) {
      roomId = user.pmi;
    }

    // 5. Security & Passcode Hashing
    const settings: MeetingSettings = {
      ...DEFAULT_MEETING_SETTINGS,
      ...(data.settings || {}),
    };

    let passcodeHash: string | null = null;
    let rawPasscode: string | undefined = undefined;

    if (settings.passcodeEnabled && data.settings?.passcode) {
      rawPasscode = data.settings.passcode.trim();
      if (rawPasscode.length < 4 || rawPasscode.length > 32) {
        throw new Error('Passcode must be between 4 and 32 characters');
      }
      passcodeHash = this.hashPasscode(rawPasscode);
    } else {
      settings.passcodeEnabled = false;
    }

    // 6. Recurrence Handling
    let recurrenceSeriesId: string | null = null;
    let recurrenceRule: string | null = null;
    let recurrenceEndAt: Date | null = null;

    if (data.meetingType === 'recurring' && data.recurrence) {
      recurrenceRule = meetingRecurrenceService.buildRrule(data.recurrence);
      if (data.recurrence.endDate) {
        recurrenceEndAt = new Date(data.recurrence.endDate);
      }

      const series = await recurrenceRepository.createSeries({
        owner_user_id: user.id,
        recurrence_rule: recurrenceRule,
        timezone,
        start_at: scheduledAt,
        end_at: recurrenceEndAt,
        occurrence_count: data.recurrence.occurrenceCount || null,
      });
      recurrenceSeriesId = series.id;
    }

    // 7. Persist Scheduled Meeting
    const meeting = await meetingRepository.createMeeting({
      room_id: roomId,
      title,
      owner_user_id: user.id,
      status: 'scheduled',
      scheduled_at: scheduledAt,
      duration_minutes: durationMinutes,
      timezone,
      description: data.description,
      is_scheduled: true,
      meeting_type: data.meetingType || 'scheduled',
      recurrence_series_id: recurrenceSeriesId,
      recurrence_rule: recurrenceRule,
      recurrence_end_at: recurrenceEndAt,
      settings,
      passcode_hash: passcodeHash,
    });

    // 8. Handle Invitations
    let invitees: MeetingInvitationRecord[] = [];
    if (data.invitees && data.invitees.length > 0) {
      // Deduplicate and validate email format
      const validEmails = Array.from(
        new Set(
          data.invitees
            .map((e) => e.trim().toLowerCase())
            .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        )
      );
      invitees = await invitationRepository.createInvitations(meeting.id, validEmails);
    }

    // 9. Host Meeting Token
    const token = generateJitsiMeetingToken({
      user,
      room: meeting.room_id,
      isModerator: true,
      meetingSettings: meeting.settings,
    });

    const roomUrl = `${origin}/${meeting.room_id}`;
    const googleCalendarUrl = meetingCalendarService.generateGoogleCalendarUrl(meeting, origin);
    const outlookCalendarUrl = meetingCalendarService.generateOutlookCalendarUrl(meeting, origin);
    const icsUrl = `${origin}/api/meetings/${meeting.id}/calendar.ics`;
    const invitationText = meetingCalendarService.formatInvitationText(
      meeting,
      user.name,
      origin,
      rawPasscode
    );

    return {
      meeting,
      invitees,
      token,
      roomUrl,
      googleCalendarUrl,
      outlookCalendarUrl,
      icsUrl,
      invitationText,
    };
  }

  public async getMeetingOrJoin(
    userId: string,
    roomId: string,
    passcode?: string
  ): Promise<{ meeting: MeetingRecord; token: string; role: 'owner' | 'moderator' | 'participant' }> {
    const user = await userRepository.findById(userId);
    if (!user || user.status !== 'active') {
      throw new Error('Authentication required to access meeting');
    }

    const normalizedRoom = roomId.toLowerCase().trim();
    let meeting = await meetingRepository.findByRoomId(normalizedRoom);

    // If meeting was not pre-created via REST, create it on-demand for this authenticated user as owner
    if (!meeting) {
      meeting = await meetingRepository.createMeeting({
        room_id: normalizedRoom,
        title: `Meeting ${normalizedRoom}`,
        owner_user_id: user.id,
      });
    }

    // Security Check 1: Check if meeting was cancelled
    if (meeting.status === 'cancelled') {
      const err = new Error('This scheduled meeting has been cancelled by the host.');
      (err as any).statusCode = 410;
      throw err;
    }

    const isOwner = meeting.owner_user_id === user.id;

    // Security Check 2: Passcode enforcement for non-owners
    if (meeting.settings.passcodeEnabled && meeting.passcode_hash && !isOwner) {
      if (!passcode) {
        const err = new Error('Passcode required to join this meeting');
        (err as any).statusCode = 403;
        (err as any).code = 'PASSCODE_REQUIRED';
        throw err;
      }

      if (!this.verifyPasscode(meeting.passcode_hash, passcode)) {
        const err = new Error('Invalid meeting passcode');
        (err as any).statusCode = 403;
        (err as any).code = 'INVALID_PASSCODE';
        throw err;
      }
    }

    // Security Check 3: Join before host enforcement
    if (
      meeting.is_scheduled &&
      meeting.settings.joinBeforeHost === false &&
      !isOwner &&
      meeting.status === 'scheduled'
    ) {
      const err = new Error('The host has not started this meeting yet. Please wait for the host.');
      (err as any).statusCode = 403;
      (err as any).code = 'WAITING_FOR_HOST';
      throw err;
    }

    let participant = await meetingRepository.getParticipant(meeting.id, user.id);
    let role: 'owner' | 'moderator' | 'participant' = isOwner ? 'owner' : 'participant';

    if (participant) {
      role = participant.role;
    } else {
      participant = await meetingRepository.addParticipant(meeting.id, user.id, role);
    }

    const isModerator = role === 'owner' || role === 'moderator';

    // If owner enters the scheduled meeting, automatically transition status to 'active'
    if (isOwner && meeting.status === 'scheduled') {
      meeting = await meetingRepository.updateMeeting(meeting.id, { status: 'active' });
    }

    const token = generateJitsiMeetingToken({
      user,
      room: meeting.room_id,
      isModerator,
      meetingSettings: meeting.settings,
    });

    return {
      meeting,
      token,
      role,
    };
  }

  public async getMeetingById(
    userId: string,
    meetingId: string,
    origin = 'https://faceonn.com'
  ): Promise<{
    meeting: MeetingRecord;
    invitees: MeetingInvitationRecord[];
    isOwner: boolean;
    googleCalendarUrl: string;
    outlookCalendarUrl: string;
    icsUrl: string;
    invitationText: string;
  }> {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const isOwner = meeting.owner_user_id === userId;
    const participant = await meetingRepository.getParticipant(meeting.id, userId);

    if (!isOwner && !participant) {
      throw new Error('Unauthorized to view this meeting');
    }

    const owner = await userRepository.findById(meeting.owner_user_id);
    const invitees = await invitationRepository.listByMeeting(meeting.id);

    return {
      meeting,
      invitees,
      isOwner,
      googleCalendarUrl: meetingCalendarService.generateGoogleCalendarUrl(meeting, origin),
      outlookCalendarUrl: meetingCalendarService.generateOutlookCalendarUrl(meeting, origin),
      icsUrl: `${origin}/api/meetings/${meeting.id}/calendar.ics`,
      invitationText: meetingCalendarService.formatInvitationText(meeting, owner?.name || null, origin),
    };
  }

  public async updateMeeting(
    userId: string,
    meetingId: string,
    data: UpdateMeetingDTO
  ): Promise<MeetingRecord> {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }
    if (meeting.owner_user_id !== userId) {
      throw new Error('Unauthorized: Only meeting owner can update this meeting');
    }
    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      throw new Error(`Cannot update a meeting that is ${meeting.status}`);
    }

    const updates: Partial<MeetingRecord> = {};

    if (data.title !== undefined) {
      const trimmed = data.title.trim();
      if (!trimmed) throw new Error('Meeting topic cannot be empty');
      updates.title = trimmed;
    }

    if (data.description !== undefined) {
      updates.description = data.description ? data.description.trim() : null;
    }

    if (data.scheduledAt !== undefined) {
      const scheduledDate = new Date(data.scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        throw new Error('Invalid scheduled date/time');
      }
      updates.scheduled_at = scheduledDate;
    }

    if (data.durationMinutes !== undefined && data.durationMinutes > 0) {
      updates.duration_minutes = data.durationMinutes;
    }

    if (data.timezone !== undefined) {
      updates.timezone = data.timezone;
    }

    if (data.settings) {
      const newSettings = { ...meeting.settings, ...data.settings };
      if (data.settings.passcodeEnabled && data.settings.passcode) {
        updates.passcode_hash = this.hashPasscode(data.settings.passcode.trim());
      } else if (data.settings.passcodeEnabled === false) {
        updates.passcode_hash = null;
        newSettings.passcodeEnabled = false;
      }
      updates.settings = newSettings;
    }

    return meetingRepository.updateMeeting(meetingId, updates);
  }

  public async cancelMeeting(
    userId: string,
    meetingId: string,
    scope: 'occurrence' | 'series' = 'occurrence'
  ): Promise<boolean> {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }
    if (meeting.owner_user_id !== userId) {
      throw new Error('Unauthorized: Only meeting owner can cancel this meeting');
    }

    if (scope === 'series' && meeting.recurrence_series_id) {
      const seriesMeetings = await meetingRepository.listBySeriesId(meeting.recurrence_series_id);
      for (const m of seriesMeetings) {
        await meetingRepository.updateMeeting(m.id, { status: 'cancelled' });
      }
      await recurrenceRepository.deleteSeries(meeting.recurrence_series_id);
      return true;
    }

    return meetingRepository.cancelMeeting(meetingId, userId);
  }

  public async startMeeting(
    userId: string,
    meetingId: string
  ): Promise<{ meeting: MeetingRecord; token: string }> {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }
    if (meeting.owner_user_id !== userId) {
      throw new Error('Unauthorized: Only meeting owner can start this meeting');
    }

    const updated = await meetingRepository.updateMeeting(meetingId, { status: 'active' });
    const user = (await userRepository.findById(userId))!;

    const token = generateJitsiMeetingToken({
      user,
      room: updated.room_id,
      isModerator: true,
      meetingSettings: updated.settings,
    });

    return { meeting: updated, token };
  }

  public async listUserMeetings(userId: string): Promise<MeetingRecord[]> {
    return meetingRepository.listUserMeetings(userId);
  }

  public async listUpcomingMeetings(userId: string): Promise<MeetingRecord[]> {
    return meetingRepository.listUpcomingMeetings(userId);
  }

  public async listPastMeetings(userId: string): Promise<MeetingRecord[]> {
    return meetingRepository.listPastMeetings(userId);
  }

  public async addInvitations(
    userId: string,
    meetingId: string,
    emails: string[]
  ): Promise<MeetingInvitationRecord[]> {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting || meeting.owner_user_id !== userId) {
      throw new Error('Unauthorized to manage invitations for this meeting');
    }

    const validEmails = Array.from(
      new Set(
        emails
          .map((e) => e.trim().toLowerCase())
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      )
    );

    return invitationRepository.createInvitations(meetingId, validEmails);
  }

  public async removeInvitation(
    userId: string,
    meetingId: string,
    invitationId: string
  ): Promise<boolean> {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting || meeting.owner_user_id !== userId) {
      throw new Error('Unauthorized to manage invitations for this meeting');
    }
    return invitationRepository.removeInvitation(meetingId, invitationId);
  }

  public async respondToInvitation(
    userId: string,
    meetingId: string,
    invitationId: string,
    status: 'accepted' | 'declined'
  ): Promise<MeetingInvitationRecord | null> {
    const invitation = await invitationRepository.updateStatus(invitationId, status);
    if (invitation && status === 'accepted') {
      await meetingRepository.addParticipant(meetingId, userId, 'participant');
    }
    return invitation;
  }
}

export const meetingService = new MeetingService();
