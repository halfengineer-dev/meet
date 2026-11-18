import crypto from 'crypto';
import { meetingRepository, DEFAULT_MEETING_SETTINGS } from '../db/repositories/meeting-repository';
import { userRepository } from '../db/repositories/user-repository';
import { invitationRepository } from '../db/repositories/invitation-repository';
import { recurrenceRepository } from '../db/repositories/recurrence-repository';
import { occurrenceRepository } from '../db/repositories/occurrence-repository';
import { meetingSessionRepository } from '../db/repositories/meeting-session-repository';
import { alternativeHostRepository } from '../db/repositories/alternative-host-repository';
import {
  MeetingAlternativeHostRecord,
  MeetingInvitationRecord,
  MeetingOccurrenceRecord,
  MeetingRecord,
  MeetingSessionRecord,
  MeetingSettings,
  RecurrenceType,
  ScheduleMeetingDTO,
  UpdateMeetingDTO,
} from '../db/types';
import { generateJitsiMeetingToken } from '../auth/tokens';
import { meetingCalendarService } from './meeting-calendar-service';
import { meetingRecurrenceService } from './meeting-recurrence-service';
import { meetingAuthorizationService } from './meeting-authorization-service';
import { meetingEventBus } from './meeting-events';
import { organizationService } from '../admin/organization-service';
import { configService } from '../admin/config-service';

function logLifecycle(event: string, data: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') return;
  console.log(
    JSON.stringify({
      scope: 'meeting-lifecycle',
      event,
      timestamp: new Date().toISOString(),
      ...data,
    })
  );
}

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
    if (storedHash.length !== inputHash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(inputHash));
  }

  /**
   * Validates that all supplied alternative host user IDs exist and are active registered Faceonn users.
   */
  private async validateAlternativeHostIds(
    ownerId: string,
    candidateIds?: string[]
  ): Promise<string[]> {
    if (!candidateIds || candidateIds.length === 0) return [];
    const unique = Array.from(new Set(candidateIds.filter((id) => id && id !== ownerId)));
    const verified: string[] = [];

    for (const uid of unique) {
      const u = await userRepository.findById(uid);
      if (!u || u.status !== 'active') {
        throw new Error(`Alternative host user (${uid}) not found or inactive`);
      }
      verified.push(u.id);
    }

    return verified;
  }

  public async createMeeting(
    userId: string,
    title?: string
  ): Promise<{
    meeting: MeetingRecord;
    occurrence: MeetingOccurrenceRecord;
    session: MeetingSessionRecord;
    token: string;
    role: 'owner' | 'moderator' | 'participant';
  }> {
    const user = await userRepository.findById(userId);
    if (!user || user.status !== 'active') {
      throw new Error('User not authorized to create meetings');
    }

    const roomId = this.generateRoomId();
    const meetingTitle = title && title.trim() ? title.trim() : 'Faceonn Meeting';
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 3600 * 1000); // Instant room expires in 24h or on end

    const enforced = await organizationService.enforceMeetingPoliciesForUser(user.id, {
      durationMinutes: 60,
      isRecurring: false,
      hasPasscode: false,
      settings: {
        ...DEFAULT_MEETING_SETTINGS,
        waitingRoomEnabled: false,
        joinBeforeHost: true,
        requireAuthentication: false,
      },
    });
    const [screenShareFlag, chatFlag] = await Promise.all([
      configService.isFeatureEnabled('screen_sharing', enforced.organizationId),
      configService.isFeatureEnabled('in_meeting_chat', enforced.organizationId),
    ]);
    enforced.settings.allowScreenSharing = enforced.settings.allowScreenSharing && screenShareFlag;
    enforced.settings.allowChat = enforced.settings.allowChat && chatFlag;

    const meeting = await meetingRepository.createMeeting({
      room_id: roomId,
      title: meetingTitle,
      owner_user_id: user.id,
      organization_id: enforced.organizationId,
      status: 'active',
      series_status: 'active',
      is_scheduled: false,
      meeting_type: 'instant',
      duration_minutes: enforced.durationMinutes,
      settings: enforced.settings,
      expires_at: expiresAt,
    });

    const [occ] = await occurrenceRepository.createOccurrences(meeting.id, [
      {
        occurrence_number: 1,
        scheduled_at: now,
        scheduled_end_at: new Date(now.getTime() + 60 * 60000),
        status: 'scheduled',
      },
    ]);

    const { session } = await meetingSessionRepository.createOrGetActiveSession({
      meetingId: meeting.id,
      occurrenceId: occ.id,
      publicRoomId: meeting.room_id,
      startedByUserId: user.id,
    });

    const activeOcc = await occurrenceRepository.updateOccurrence(occ.id, {
      status: 'active',
      session_id: session.id,
      actual_started_at: now,
      started_by_user_id: user.id,
    });

    const token = generateJitsiMeetingToken({
      user,
      room: session.jitsi_room_name,
      isModerator: true,
      meetingSettings: meeting.settings,
    });

    logLifecycle('instant_meeting_created', {
      meetingId: meeting.id,
      roomId: meeting.room_id,
      sessionId: session.id,
      userId: user.id,
    });

    return {
      meeting,
      occurrence: activeOcc,
      session,
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
    occurrences: MeetingOccurrenceRecord[];
    invitees: MeetingInvitationRecord[];
    alternativeHosts: MeetingAlternativeHostRecord[];
    token: string;
    roomUrl: string;
    googleCalendarUrl: string;
    outlookCalendarUrl: string;
    icsUrl: string;
    invitationText: string;
    recurrenceSummary: string | null;
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

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (scheduledAt.getTime() < fiveMinutesAgo) {
      throw new Error('Cannot schedule a meeting in the past');
    }

    // 3. Duration & Timezone
    const durationMinutes =
      data.durationMinutes && data.durationMinutes > 0 && data.durationMinutes <= 1440
        ? data.durationMinutes
        : 30;
    const timezone = data.timezone || 'UTC';

    // 4. Room ID (Personal Meeting ID vs cryptographically random)
    let roomId = this.generateRoomId();
    if (data.usePmi && user.pmi) {
      roomId = user.pmi;
    }

    // 5. Security & Passcode Hashing (NEVER persist plaintext passcode in settings JSONB)
    const { passcode: rawInputPasscode, ...cleanInputSettings } = data.settings || {};
    const settings: MeetingSettings = {
      ...DEFAULT_MEETING_SETTINGS,
      ...cleanInputSettings,
    };

    let passcodeHash: string | null = null;
    let rawPasscode: string | undefined = undefined;

    if (settings.passcodeEnabled && rawInputPasscode) {
      rawPasscode = rawInputPasscode.trim();
      if (rawPasscode.length < 4 || rawPasscode.length > 32) {
        throw new Error('Passcode must be between 4 and 32 characters');
      }
      passcodeHash = this.hashPasscode(rawPasscode);
    } else {
      settings.passcodeEnabled = false;
    }

    // 6. Validate Alternative Hosts
    const alternativeHostIds = await this.validateAlternativeHostIds(
      user.id,
      data.alternativeHostIds
    );

    // 7. Recurrence Handling
    const isRecurring = data.meetingType === 'recurring' && Boolean(data.recurrence);
    let recurrenceSeriesId: string | null = null;
    let recurrenceRule: string | null = null;
    let recurrenceEndAt: Date | null = null;
    let recurrenceType: RecurrenceType = 'none';
    let recurrenceCount: number | null = null;

    if (isRecurring && data.recurrence) {
      recurrenceType = data.recurrence.frequency;
      recurrenceRule = meetingRecurrenceService.buildRrule(data.recurrence);
      if (data.recurrence.endDate) {
        const parsedEnd = new Date(data.recurrence.endDate);
        if (!isNaN(parsedEnd.getTime())) {
          recurrenceEndAt = parsedEnd;
        }
      }
      if (data.recurrence.occurrenceCount && data.recurrence.occurrenceCount > 0) {
        recurrenceCount = data.recurrence.occurrenceCount;
      }

      const series = await recurrenceRepository.createSeries({
        owner_user_id: user.id,
        recurrence_rule: recurrenceRule,
        timezone,
        start_at: scheduledAt,
        end_at: recurrenceEndAt,
        occurrence_count: recurrenceCount,
      });
      recurrenceSeriesId = series.id;
    }

    // Link expiration policy (365d inactivity for recurring; 30d post-end for one-time)
    const expiresAt = isRecurring
      ? new Date(Date.now() + 365 * 86400000)
      : new Date(scheduledAt.getTime() + durationMinutes * 60000 + 30 * 86400000);

    // 7b. Enforce Organization Policies & Platform Feature Flags on backend
    const enforcedSchedule = await organizationService.enforceMeetingPoliciesForUser(user.id, {
      durationMinutes,
      isRecurring,
      hasPasscode: Boolean(passcodeHash),
      settings,
    });
    const [screenShareEnabled, chatEnabled, cloudRecEnabled] = await Promise.all([
      configService.isFeatureEnabled('screen_sharing', enforcedSchedule.organizationId),
      configService.isFeatureEnabled('in_meeting_chat', enforcedSchedule.organizationId),
      configService.isFeatureEnabled('cloud_recording', enforcedSchedule.organizationId),
    ]);
    enforcedSchedule.settings.allowScreenSharing = enforcedSchedule.settings.allowScreenSharing && screenShareEnabled;
    enforcedSchedule.settings.allowChat = enforcedSchedule.settings.allowChat && chatEnabled;
    if (!cloudRecEnabled && enforcedSchedule.settings.autoRecording === 'cloud') {
      enforcedSchedule.settings.autoRecording = 'none';
    }

    // 8. Persist Scheduled Meeting Series
    const meeting = await meetingRepository.createMeeting({
      room_id: roomId,
      title,
      owner_user_id: user.id,
      organization_id: enforcedSchedule.organizationId,
      status: 'scheduled',
      series_status: 'active',
      scheduled_at: scheduledAt,
      duration_minutes: enforcedSchedule.durationMinutes,
      timezone,
      description: data.description,
      is_scheduled: true,
      meeting_type: isRecurring ? 'recurring' : 'scheduled',
      recurrence_series_id: recurrenceSeriesId,
      recurrence_type: recurrenceType,
      recurrence_rule: recurrenceRule,
      recurrence_end_at: recurrenceEndAt,
      recurrence_count: recurrenceCount,
      settings: enforcedSchedule.settings,
      passcode_hash: passcodeHash,
      join_before_host_minutes: enforcedSchedule.settings.joinBeforeHostMinutes ?? 0,
      audio_type: enforcedSchedule.settings.audioType || 'computer',
      auto_recording: enforcedSchedule.settings.autoRecording || 'none',
      registration_required: Boolean(enforcedSchedule.settings.registrationRequired),
      alternative_host_ids: alternativeHostIds,
      expires_at: expiresAt,
    });

    // 9. Persist Alternative Hosts join records
    const alternativeHosts =
      alternativeHostIds.length > 0
        ? await alternativeHostRepository.setAlternativeHosts(meeting.id, alternativeHostIds)
        : [];

    // 10. Generate Initial Occurrences (rolling 90-day window for recurring, 1 for one-time)
    let occurrenceDrafts: Array<{
      occurrence_number: number;
      scheduled_at: Date;
      scheduled_end_at: Date;
    }>;

    if (isRecurring && recurrenceRule) {
      occurrenceDrafts = meetingRecurrenceService.generateRollingWindow({
        startDate: scheduledAt,
        durationMinutes,
        rrule: recurrenceRule,
        timeZone: timezone,
        windowDays: 90,
        maxOccurrences: recurrenceCount ? Math.min(recurrenceCount, 90) : 90,
      });
    } else {
      occurrenceDrafts = [
        {
          occurrence_number: 1,
          scheduled_at: scheduledAt,
          scheduled_end_at: new Date(scheduledAt.getTime() + durationMinutes * 60000),
        },
      ];
    }

    const occurrences = await occurrenceRepository.createOccurrences(meeting.id, occurrenceDrafts);

    // 11. Handle Invitations
    let invitees: MeetingInvitationRecord[] = [];
    if (data.invitees && data.invitees.length > 0) {
      const validEmails = Array.from(
        new Set(
          data.invitees
            .map((e) => e.trim().toLowerCase())
            .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        )
      );
      invitees = await invitationRepository.createInvitations(meeting.id, validEmails);
    }

    // 12. Preview Host Token (note: real conference sessions receive occurrence-scoped tokens on start)
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
    const recurrenceSummary = meetingRecurrenceService.describeRecurrence(recurrenceRule, timezone);

    logLifecycle('meeting_scheduled', {
      meetingId: meeting.id,
      roomId: meeting.room_id,
      meetingType: meeting.meeting_type,
      occurrencesGenerated: occurrences.length,
      ownerId: user.id,
    });

    return {
      meeting,
      occurrences,
      invitees,
      alternativeHosts,
      token,
      roomUrl,
      googleCalendarUrl,
      outlookCalendarUrl,
      icsUrl,
      invitationText,
      recurrenceSummary,
    };
  }

  /**
   * Public/optional-auth room status resolver — exposes ONLY safe metadata (never passcodes or JWTs).
   */
  public async getPublicMeetingInfo(
    roomId: string,
    viewerUserId?: string | null
  ): Promise<{
    exists: boolean;
    resolutionStatus: 'not_found' | 'cancelled' | 'expired' | 'ended' | 'waiting_for_host' | 'active';
    id?: string;
    roomId: string;
    title?: string;
    hostName?: string;
    status?: 'active' | 'ended' | 'scheduled' | 'cancelled';
    seriesStatus?: string;
    isScheduled?: boolean;
    meetingType?: 'instant' | 'scheduled' | 'recurring';
    scheduledAt?: string | null;
    durationMinutes?: number;
    timezone?: string;
    recurrenceRule?: string | null;
    recurrenceSummary?: string | null;
    joinBeforeHost?: boolean;
    joinBeforeHostMinutes?: number;
    canJoinBeforeHostNow?: boolean;
    passcodeEnabled?: boolean;
    waitingRoomEnabled?: boolean;
    requireAuthentication?: boolean;
    isOwner?: boolean;
    isAlternativeHost?: boolean;
    isHost?: boolean;
    countdownSeconds?: number | null;
    activeOccurrence?: {
      id: string;
      occurrenceNumber: number;
      scheduledAt: string;
      scheduledEndAt: string;
      status: string;
    } | null;
    nextOccurrence?: {
      id: string;
      occurrenceNumber: number;
      scheduledAt: string;
      scheduledEndAt: string;
      status: string;
    } | null;
    lastEndedOccurrence?: {
      id: string;
      occurrenceNumber: number;
      scheduledAt: string;
      actualEndedAt: string | null;
    } | null;
  }> {
    const res = await meetingAuthorizationService.resolveMeetingAccess(roomId, viewerUserId);

    if (res.status === 'not_found' || !res.meeting) {
      return {
        exists: false,
        resolutionStatus: 'not_found',
        roomId: res.roomId,
      };
    }

    const m = res.meeting;
    const effectiveScheduledAt =
      res.activeOccurrence?.scheduled_at ||
      res.nextOccurrence?.scheduled_at ||
      m.scheduled_at;

    return {
      exists: true,
      resolutionStatus: res.status,
      id: m.id,
      roomId: m.room_id,
      title: m.title,
      hostName: res.hostName || 'Meeting Host',
      status: res.status === 'active' ? 'active' : res.status === 'cancelled' ? 'cancelled' : res.status === 'ended' ? 'ended' : 'scheduled',
      seriesStatus: m.series_status,
      isScheduled: m.is_scheduled,
      meetingType: m.meeting_type,
      scheduledAt: effectiveScheduledAt ? effectiveScheduledAt.toISOString() : null,
      durationMinutes: m.duration_minutes,
      timezone: m.timezone,
      recurrenceRule: m.recurrence_rule,
      recurrenceSummary: res.recurrenceSummary,
      joinBeforeHost: m.settings.joinBeforeHost,
      joinBeforeHostMinutes: m.join_before_host_minutes,
      canJoinBeforeHostNow: res.canJoinBeforeHostNow,
      passcodeEnabled: Boolean(m.settings.passcodeEnabled && m.passcode_hash),
      waitingRoomEnabled: m.settings.waitingRoomEnabled,
      requireAuthentication: m.settings.requireAuthentication,
      isOwner: res.isOwner,
      isAlternativeHost: res.isAlternativeHost,
      isHost: res.isHost,
      countdownSeconds: res.countdownSeconds,
      activeOccurrence: res.activeOccurrence
        ? {
            id: res.activeOccurrence.id,
            occurrenceNumber: res.activeOccurrence.occurrence_number,
            scheduledAt: res.activeOccurrence.scheduled_at.toISOString(),
            scheduledEndAt: res.activeOccurrence.scheduled_end_at.toISOString(),
            status: res.activeOccurrence.status,
          }
        : null,
      nextOccurrence: res.nextOccurrence
        ? {
            id: res.nextOccurrence.id,
            occurrenceNumber: res.nextOccurrence.occurrence_number,
            scheduledAt: res.nextOccurrence.scheduled_at.toISOString(),
            scheduledEndAt: res.nextOccurrence.scheduled_end_at.toISOString(),
            status: res.nextOccurrence.status,
          }
        : null,
      lastEndedOccurrence: res.lastEndedOccurrence
        ? {
            id: res.lastEndedOccurrence.id,
            occurrenceNumber: res.lastEndedOccurrence.occurrence_number,
            scheduledAt: res.lastEndedOccurrence.scheduled_at.toISOString(),
            actualEndedAt: res.lastEndedOccurrence.actual_ended_at
              ? res.lastEndedOccurrence.actual_ended_at.toISOString()
              : null,
          }
        : null,
    };
  }

  /**
   * Backend-authoritative host start for a scheduled/recurring occurrence.
   * Concurrency-safe: simultaneous starts from owner & alternative host share ONE active session.
   * Starting early binds to the existing scheduled occurrence without creating a duplicate.
   */
  public async startMeeting(
    userId: string,
    meetingId: string,
    occurrenceId?: string
  ): Promise<{
    meeting: MeetingRecord;
    occurrence: MeetingOccurrenceRecord;
    session: MeetingSessionRecord;
    token: string;
    role: 'owner' | 'moderator';
  }> {
    const user = await userRepository.findById(userId);
    if (!user || user.status !== 'active') {
      throw new Error('Authentication required to start meeting');
    }

    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      const err = new Error('Meeting not found');
      (err as any).statusCode = 404;
      (err as any).code = 'MEETING_NOT_FOUND';
      throw err;
    }

    const roles = await meetingAuthorizationService.getHostRoles(meeting, user.id);
    if (!roles.isHost) {
      const err = new Error('Unauthorized: Only meeting owner or alternative host can start this meeting');
      (err as any).statusCode = 403;
      (err as any).code = 'NOT_HOST';
      throw err;
    }

    if (meeting.series_status === 'cancelled' || meeting.status === 'cancelled') {
      const err = new Error('This meeting series has been cancelled and cannot be restarted.');
      (err as any).statusCode = 410;
      (err as any).code = 'MEETING_CANCELLED';
      throw err;
    }

    if (
      meeting.series_status === 'expired' ||
      (meeting.expires_at && meeting.expires_at.getTime() < Date.now())
    ) {
      const err = new Error('This meeting link has expired.');
      (err as any).statusCode = 410;
      (err as any).code = 'MEETING_EXPIRED';
      throw err;
    }

    const occurrences = await meetingAuthorizationService.ensureOccurrences(meeting);

    // Resolve which occurrence to start (explicit occurrenceId > existing active > next upcoming scheduled)
    let targetOcc: MeetingOccurrenceRecord | null = null;
    if (occurrenceId) {
      targetOcc = occurrences.find((o) => o.id === occurrenceId) || null;
      if (!targetOcc) {
        const err = new Error('Requested meeting occurrence not found');
        (err as any).statusCode = 404;
        (err as any).code = 'OCCURRENCE_NOT_FOUND';
        throw err;
      }
      if (targetOcc.status === 'ended' || targetOcc.status === 'cancelled') {
        const err = new Error(`This occurrence is already ${targetOcc.status} and cannot be restarted.`);
        (err as any).statusCode = 409;
        (err as any).code = targetOcc.status === 'cancelled' ? 'MEETING_CANCELLED' : 'OCCURRENCE_ENDED';
        throw err;
      }
    } else {
      targetOcc =
        occurrences.find((o) => o.status === 'active') ||
        occurrences.find((o) => o.status === 'scheduled' || o.status === 'waiting_for_host') ||
        null;
    }

    if (!targetOcc) {
      const err = new Error('No upcoming occurrence available to start. This meeting has ended.');
      (err as any).statusCode = 410;
      (err as any).code = 'MEETING_ENDED';
      throw err;
    }

    // Atomically create or retrieve the single active session for this occurrence
    const { session, created } = await meetingSessionRepository.createOrGetActiveSession({
      meetingId: meeting.id,
      occurrenceId: targetOcc.id,
      publicRoomId: meeting.room_id,
      startedByUserId: user.id,
    });

    const now = new Date();
    const updatedOcc = await occurrenceRepository.updateOccurrence(targetOcc.id, {
      status: 'active',
      session_id: session.id,
      actual_started_at: targetOcc.actual_started_at || now,
      started_by_user_id: targetOcc.started_by_user_id || user.id,
    });

    // Extend recurring inactivity expiry (365 days from latest activity)
    const updatedMeeting = await meetingRepository.updateMeeting(meeting.id, {
      status: 'active',
      ...(meeting.meeting_type === 'recurring'
        ? { expires_at: new Date(Date.now() + 365 * 86400000) }
        : {}),
    });

    const role: 'owner' | 'moderator' = roles.isOwner ? 'owner' : 'moderator';
    await meetingRepository.addParticipant(meeting.id, user.id, role);

    const token = generateJitsiMeetingToken({
      user,
      room: session.jitsi_room_name,
      isModerator: true,
      meetingSettings: updatedMeeting.settings,
    });

    if (created) {
      logLifecycle('occurrence_started', {
        meetingId: meeting.id,
        roomId: meeting.room_id,
        occurrenceId: updatedOcc.id,
        sessionId: session.id,
        jitsiRoomName: session.jitsi_room_name,
        startedByUserId: user.id,
        role,
      });

      meetingEventBus.emitOccurrenceStarted({
        meetingId: meeting.id,
        roomId: meeting.room_id,
        occurrenceId: updatedOcc.id,
        sessionId: session.id,
        status: 'active',
        timestamp: now.toISOString(),
      });
    }

    return {
      meeting: updatedMeeting,
      occurrence: updatedOcc,
      session,
      token,
      role,
    };
  }

  /**
   * Authenticated user join/authorize flow.
   * CRITICAL SECURITY: NEVER creates a new meeting on demand! NEVER elevates participants to host!
   */
  public async getMeetingOrJoin(
    userId: string,
    roomId: string,
    passcode?: string,
    options?: { allowHostAutoStart?: boolean; occurrenceId?: string }
  ): Promise<{
    meeting: MeetingRecord;
    occurrence: MeetingOccurrenceRecord;
    session: MeetingSessionRecord;
    token: string;
    role: 'owner' | 'moderator' | 'participant';
  }> {
    const user = await userRepository.findById(userId);
    if (!user || user.status !== 'active') {
      throw new Error('Authentication required to access meeting');
    }

    const res = await meetingAuthorizationService.resolveMeetingAccess(roomId, user.id);

    if (res.status === 'not_found' || !res.meeting) {
      const err = new Error('Meeting not found. Please check the Meeting ID or link.');
      (err as any).statusCode = 404;
      (err as any).code = 'MEETING_NOT_FOUND';
      throw err;
    }

    if (res.status === 'cancelled') {
      const err = new Error('This scheduled meeting has been cancelled by the host.');
      (err as any).statusCode = 410;
      (err as any).code = 'MEETING_CANCELLED';
      throw err;
    }

    if (res.status === 'expired') {
      const err = new Error('This meeting link is no longer valid.');
      (err as any).statusCode = 410;
      (err as any).code = 'MEETING_EXPIRED';
      throw err;
    }

    if (res.status === 'ended') {
      const err = new Error('This meeting has ended.');
      (err as any).statusCode = 410;
      (err as any).code = 'MEETING_ENDED';
      throw err;
    }

    const meeting = res.meeting;

    // Case A: Waiting for host (no active session yet)
    if (res.status === 'waiting_for_host') {
      if (res.isHost) {
        if (options?.allowHostAutoStart === false) {
          const err = new Error('This scheduled meeting has not been started yet.');
          (err as any).statusCode = 403;
          (err as any).code = 'HOST_NOT_STARTED';
          throw err;
        }
        return this.startMeeting(user.id, meeting.id, options?.occurrenceId || res.nextOccurrence?.id);
      }

      // Non-host: check joinBeforeHost policy & lead time window
      if (!res.canJoinBeforeHostNow || !res.nextOccurrence) {
        const err = new Error('The host has not started this meeting yet. Please wait for the host.');
        (err as any).statusCode = 403;
        (err as any).code = 'WAITING_FOR_HOST';
        throw err;
      }

      // Validate passcode BEFORE creating join-before-host participant session
      if (meeting.settings.passcodeEnabled && meeting.passcode_hash) {
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

      // Authorized join-before-host: create session WITHOUT granting moderator privileges!
      const { session } = await meetingSessionRepository.createOrGetActiveSession({
        meetingId: meeting.id,
        occurrenceId: res.nextOccurrence.id,
        publicRoomId: meeting.room_id,
        startedByUserId: null,
      });
      const activeOcc = await occurrenceRepository.updateOccurrence(res.nextOccurrence.id, {
        status: 'active',
        session_id: session.id,
        actual_started_at: res.nextOccurrence.actual_started_at || new Date(),
      });
      await meetingRepository.addParticipant(meeting.id, user.id, 'participant');

      const token = generateJitsiMeetingToken({
        user,
        room: session.jitsi_room_name,
        isModerator: false,
        meetingSettings: meeting.settings,
      });

      logLifecycle('participant_joined_before_host', {
        meetingId: meeting.id,
        occurrenceId: activeOcc.id,
        sessionId: session.id,
        userId: user.id,
      });

      return {
        meeting,
        occurrence: activeOcc,
        session,
        token,
        role: 'participant',
      };
    }

    // Case B: Active session exists
    const activeSession = res.activeSession!;
    const activeOccurrence = res.activeOccurrence!;

    // Passcode check for non-hosts
    if (meeting.settings.passcodeEnabled && meeting.passcode_hash && !res.isHost) {
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

    // Backend-authoritative role assignment (ONLY owner or verified alternative host gets moderator!)
    const role: 'owner' | 'moderator' | 'participant' = res.isOwner
      ? 'owner'
      : res.isAlternativeHost
        ? 'moderator'
        : 'participant';
    const isModerator = res.isHost;

    await meetingRepository.addParticipant(meeting.id, user.id, role);

    const token = generateJitsiMeetingToken({
      user,
      room: activeSession.jitsi_room_name,
      isModerator,
      meetingSettings: meeting.settings,
    });

    logLifecycle('participant_joined', {
      meetingId: meeting.id,
      occurrenceId: activeOccurrence.id,
      sessionId: activeSession.id,
      userId: user.id,
      role,
    });

    meetingEventBus.emitParticipantJoined({
      meetingId: meeting.id,
      roomId: meeting.room_id,
      occurrenceId: activeOccurrence.id,
      sessionId: activeSession.id,
      status: 'active',
      participantRole: role,
      timestamp: new Date().toISOString(),
    });

    return {
      meeting,
      occurrence: activeOccurrence,
      session: activeSession,
      token,
      role,
    };
  }

  /**
   * Unauthenticated guest join flow (Zoom-style join without creating an account).
   * Strictly enforces existence, lifecycle, waiting-for-host, requireAuthentication, and passcode.
   * NEVER issues moderator claims.
   */
  public async guestJoinMeeting(
    roomId: string,
    displayName: string,
    passcode?: string
  ): Promise<{
    meeting: MeetingRecord;
    occurrence: MeetingOccurrenceRecord;
    session: MeetingSessionRecord;
    token: string;
    role: 'participant';
    displayName: string;
  }> {
    const cleanName = (displayName || '').trim();
    if (!cleanName) {
      const err = new Error('Please enter your name to join the meeting');
      (err as any).statusCode = 400;
      (err as any).code = 'DISPLAY_NAME_REQUIRED';
      throw err;
    }
    if (cleanName.length > 80) {
      const err = new Error('Display name cannot exceed 80 characters');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_DISPLAY_NAME';
      throw err;
    }

    const res = await meetingAuthorizationService.resolveMeetingAccess(roomId, null);

    if (res.status === 'not_found' || !res.meeting) {
      const err = new Error('Meeting not found. Please check the Meeting ID or link.');
      (err as any).statusCode = 404;
      (err as any).code = 'MEETING_NOT_FOUND';
      throw err;
    }

    if (res.status === 'cancelled') {
      const err = new Error('This scheduled meeting has been cancelled by the host.');
      (err as any).statusCode = 410;
      (err as any).code = 'MEETING_CANCELLED';
      throw err;
    }

    if (res.status === 'expired') {
      const err = new Error('This meeting link is no longer valid.');
      (err as any).statusCode = 410;
      (err as any).code = 'MEETING_EXPIRED';
      throw err;
    }

    if (res.status === 'ended') {
      const err = new Error('This meeting has already ended.');
      (err as any).statusCode = 410;
      (err as any).code = 'MEETING_ENDED';
      throw err;
    }

    const meeting = res.meeting;

    if (res.status === 'waiting_for_host' && !res.canJoinBeforeHostNow) {
      const err = new Error('The host has not started this meeting yet. Please wait for the host.');
      (err as any).statusCode = 403;
      (err as any).code = 'WAITING_FOR_HOST';
      throw err;
    }

    if (meeting.settings.requireAuthentication) {
      const err = new Error('The host requires you to sign in to a Faceonn account to join this meeting.');
      (err as any).statusCode = 401;
      (err as any).code = 'AUTH_REQUIRED';
      throw err;
    }

    if (meeting.settings.passcodeEnabled && meeting.passcode_hash) {
      if (!passcode || !passcode.trim()) {
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

    let session = res.activeSession;
    let occurrence = res.activeOccurrence;

    if (!session || !occurrence) {
      if (!res.canJoinBeforeHostNow || !res.nextOccurrence) {
        const err = new Error('The host has not started this meeting yet. Please wait for the host.');
        (err as any).statusCode = 403;
        (err as any).code = 'WAITING_FOR_HOST';
        throw err;
      }
      const created = await meetingSessionRepository.createOrGetActiveSession({
        meetingId: meeting.id,
        occurrenceId: res.nextOccurrence.id,
        publicRoomId: meeting.room_id,
        startedByUserId: null,
      });
      session = created.session;
      occurrence = await occurrenceRepository.updateOccurrence(res.nextOccurrence.id, {
        status: 'active',
        session_id: session.id,
        actual_started_at: res.nextOccurrence.actual_started_at || new Date(),
      });
    }

    const guestId = `guest-${crypto.randomUUID()}`;
    const token = generateJitsiMeetingToken({
      user: {
        id: guestId,
        name: cleanName,
        email: '',
        avatar_url: null,
      },
      room: session.jitsi_room_name,
      isModerator: false,
      meetingSettings: meeting.settings,
    });

    logLifecycle('guest_joined', {
      meetingId: meeting.id,
      occurrenceId: occurrence.id,
      sessionId: session.id,
      guestId,
    });

    return {
      meeting,
      occurrence,
      session,
      token,
      role: 'participant',
      displayName: cleanName,
    };
  }

  /**
   * Ends ONLY the current occurrence/session (idempotent).
   * Preserves recurring series and all future occurrences!
   */
  public async endOccurrence(
    userId: string,
    meetingId: string,
    occurrenceId?: string
  ): Promise<{
    meeting: MeetingRecord;
    endedOccurrence: MeetingOccurrenceRecord | null;
    nextOccurrence: MeetingOccurrenceRecord | null;
  }> {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const roles = await meetingAuthorizationService.getHostRoles(meeting, userId);
    if (!roles.isHost) {
      const err = new Error('Unauthorized: Only meeting owner or alternative host can end this meeting');
      (err as any).statusCode = 403;
      (err as any).code = 'NOT_HOST';
      throw err;
    }

    const now = new Date();
    const activeSession = await meetingSessionRepository.findActiveByMeetingId(meeting.id);
    const occurrences = await meetingAuthorizationService.ensureOccurrences(meeting, now);

    let targetOcc: MeetingOccurrenceRecord | null = null;
    if (occurrenceId) {
      targetOcc = occurrences.find((o) => o.id === occurrenceId) || null;
    } else if (activeSession) {
      targetOcc = occurrences.find((o) => o.id === activeSession.occurrence_id) || null;
    } else {
      targetOcc = occurrences.find((o) => o.status === 'active') || null;
    }

    if (activeSession) {
      await meetingSessionRepository.endSession(activeSession.id, userId, 'host_ended');
    }

    let endedOcc: MeetingOccurrenceRecord | null = targetOcc;
    if (targetOcc && targetOcc.status !== 'ended' && targetOcc.status !== 'cancelled') {
      endedOcc = await occurrenceRepository.updateOccurrence(targetOcc.id, {
        status: 'ended',
        actual_ended_at: now,
        ended_by_user_id: userId,
      });
    }

    const refreshedOccurrences = await occurrenceRepository.listByMeetingId(meeting.id);
    const nextOccurrence =
      refreshedOccurrences.find((o) => o.status === 'scheduled' || o.status === 'waiting_for_host') ||
      null;

    // For recurring series with future occurrences, keep series active and return meeting status to 'scheduled'
    let updatedMeeting: MeetingRecord;
    if (meeting.meeting_type === 'recurring' && nextOccurrence && meeting.series_status === 'active') {
      updatedMeeting = await meetingRepository.updateMeeting(meeting.id, {
        status: 'scheduled',
        scheduled_at: nextOccurrence.scheduled_at,
      });
    } else {
      updatedMeeting = await meetingRepository.updateMeeting(meeting.id, {
        status: 'ended',
        series_status: 'ended',
        ended_at: now,
      });
    }

    logLifecycle('occurrence_ended', {
      meetingId: meeting.id,
      roomId: meeting.room_id,
      occurrenceId: endedOcc?.id,
      nextOccurrenceId: nextOccurrence?.id || null,
      endedByUserId: userId,
    });

    meetingEventBus.emitOccurrenceEnded({
      meetingId: meeting.id,
      roomId: meeting.room_id,
      occurrenceId: endedOcc?.id,
      sessionId: activeSession?.id,
      status: nextOccurrence ? 'waiting_for_host' : 'ended',
      timestamp: now.toISOString(),
    });

    return {
      meeting: updatedMeeting,
      endedOccurrence: endedOcc,
      nextOccurrence,
    };
  }

  /**
   * Ends the entire recurring series: terminates active sessions, cancels all future occurrences,
   * and permanently invalidates the meeting link. Idempotent!
   */
  public async endSeries(userId: string, meetingId: string): Promise<MeetingRecord> {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    if (meeting.owner_user_id !== userId) {
      const err = new Error('Unauthorized: Only the meeting owner can end the entire series');
      (err as any).statusCode = 403;
      (err as any).code = 'NOT_OWNER';
      throw err;
    }

    const now = new Date();

    // 1. Terminate any active sessions
    await meetingSessionRepository.endAllActiveForMeeting(meeting.id, userId, 'series_cancelled');

    // 2. End any active occurrence
    const activeOcc = await occurrenceRepository.findActiveByMeetingId(meeting.id);
    if (activeOcc) {
      await occurrenceRepository.updateOccurrence(activeOcc.id, {
        status: 'ended',
        actual_ended_at: now,
        ended_by_user_id: userId,
      });
    }

    // 3. Cancel all future scheduled occurrences
    await occurrenceRepository.cancelFutureOccurrences(meeting.id);

    // 4. Mark series cancelled
    const updated = await meetingRepository.updateMeeting(meeting.id, {
      status: 'cancelled',
      series_status: 'cancelled',
      ended_at: now,
    });

    if (meeting.recurrence_series_id) {
      await recurrenceRepository.deleteSeries(meeting.recurrence_series_id).catch(() => {});
    }

    logLifecycle('series_cancelled', {
      meetingId: meeting.id,
      roomId: meeting.room_id,
      endedByUserId: userId,
    });

    meetingEventBus.emitSeriesCancelled({
      meetingId: meeting.id,
      roomId: meeting.room_id,
      status: 'cancelled',
      timestamp: now.toISOString(),
    });

    return updated;
  }

  // Backward-compatible alias for endOccurrence
  public async endMeeting(userId: string, meetingId: string): Promise<MeetingRecord> {
    const res = await this.endOccurrence(userId, meetingId);
    return res.meeting;
  }

  public async cancelOccurrence(
    userId: string,
    meetingId: string,
    occurrenceId: string
  ): Promise<MeetingOccurrenceRecord> {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) throw new Error('Meeting not found');

    const roles = await meetingAuthorizationService.getHostRoles(meeting, userId);
    if (!roles.isHost) {
      throw new Error('Unauthorized: Only meeting host can cancel this occurrence');
    }

    const occ = await occurrenceRepository.findById(occurrenceId);
    if (!occ || occ.meeting_id !== meeting.id) {
      throw new Error('Occurrence not found');
    }

    if (occ.status === 'active') {
      const activeSession = await meetingSessionRepository.findActiveByOccurrenceId(occ.id);
      if (activeSession) {
        await meetingSessionRepository.endSession(activeSession.id, userId, 'occurrence_cancelled');
      }
    }

    const cancelled = await occurrenceRepository.updateOccurrence(occ.id, {
      status: 'cancelled',
      ended_by_user_id: userId,
    });

    logLifecycle('occurrence_cancelled', {
      meetingId: meeting.id,
      occurrenceId: occ.id,
      userId,
    });

    return cancelled;
  }

  public async getOccurrences(userId: string, meetingId: string): Promise<MeetingOccurrenceRecord[]> {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) throw new Error('Meeting not found');

    const roles = await meetingAuthorizationService.getHostRoles(meeting, userId);
    const participant = await meetingRepository.getParticipant(meeting.id, userId);
    if (!roles.isHost && !participant) {
      throw new Error('Unauthorized to view occurrences for this meeting');
    }

    let occurrences = await meetingAuthorizationService.ensureOccurrences(meeting);
    occurrences = await meetingAuthorizationService.sweepMissedOccurrences(meeting, occurrences);
    return occurrences;
  }

  public async getNextOccurrence(
    userId: string,
    meetingId: string
  ): Promise<MeetingOccurrenceRecord | null> {
    const occurrences = await this.getOccurrences(userId, meetingId);
    return (
      occurrences.find((o) => o.status === 'active') ||
      occurrences.find((o) => o.status === 'scheduled' || o.status === 'waiting_for_host') ||
      null
    );
  }

  public async getMeetingById(
    userId: string,
    meetingId: string,
    origin = 'https://faceonn.com'
  ): Promise<{
    meeting: MeetingRecord;
    occurrences: MeetingOccurrenceRecord[];
    nextOccurrence: MeetingOccurrenceRecord | null;
    alternativeHosts: MeetingAlternativeHostRecord[];
    invitees: MeetingInvitationRecord[];
    isOwner: boolean;
    isHost: boolean;
    googleCalendarUrl: string;
    outlookCalendarUrl: string;
    icsUrl: string;
    invitationText: string;
    recurrenceSummary: string | null;
  }> {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const roles = await meetingAuthorizationService.getHostRoles(meeting, userId);
    const participant = await meetingRepository.getParticipant(meeting.id, userId);

    if (!roles.isHost && !participant) {
      throw new Error('Unauthorized to view this meeting');
    }

    const [owner, invitees, alternativeHosts] = await Promise.all([
      userRepository.findById(meeting.owner_user_id),
      invitationRepository.listByMeeting(meeting.id),
      alternativeHostRepository.listByMeetingId(meeting.id),
    ]);

    let occurrences = await meetingAuthorizationService.ensureOccurrences(meeting);
    occurrences = await meetingAuthorizationService.sweepMissedOccurrences(meeting, occurrences);
    const nextOccurrence =
      occurrences.find((o) => o.status === 'active') ||
      occurrences.find((o) => o.status === 'scheduled' || o.status === 'waiting_for_host') ||
      null;

    return {
      meeting,
      occurrences,
      nextOccurrence,
      alternativeHosts,
      invitees,
      isOwner: roles.isOwner,
      isHost: roles.isHost,
      googleCalendarUrl: meetingCalendarService.generateGoogleCalendarUrl(meeting, origin),
      outlookCalendarUrl: meetingCalendarService.generateOutlookCalendarUrl(meeting, origin),
      icsUrl: `${origin}/api/meetings/${meeting.id}/calendar.ics`,
      invitationText: meetingCalendarService.formatInvitationText(
        meeting,
        owner?.name || null,
        origin
      ),
      recurrenceSummary: meetingRecurrenceService.describeRecurrence(
        meeting.recurrence_rule,
        meeting.timezone
      ),
    };
  }

  public async updateOccurrence(
    userId: string,
    meetingId: string,
    occurrenceId: string,
    data: { scheduledAt?: string; durationMinutes?: number }
  ): Promise<MeetingOccurrenceRecord> {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) throw new Error('Meeting not found');
    if (meeting.owner_user_id !== userId) {
      throw new Error('Unauthorized: Only meeting owner can update this occurrence');
    }

    const occ = await occurrenceRepository.findById(occurrenceId);
    if (!occ || occ.meeting_id !== meeting.id) {
      throw new Error('Occurrence not found');
    }
    if (occ.status === 'ended' || occ.status === 'cancelled') {
      throw new Error(`Cannot edit an occurrence that is ${occ.status}`);
    }

    const nextStart = data.scheduledAt ? new Date(data.scheduledAt) : occ.scheduled_at;
    if (isNaN(nextStart.getTime())) {
      throw new Error('Invalid scheduled date/time');
    }
    const duration = data.durationMinutes && data.durationMinutes > 0
      ? data.durationMinutes
      : Math.round((occ.scheduled_end_at.getTime() - occ.scheduled_at.getTime()) / 60000) || meeting.duration_minutes;

    return occurrenceRepository.updateOccurrence(occ.id, {
      scheduled_at: nextStart,
      scheduled_end_at: new Date(nextStart.getTime() + duration * 60000),
    });
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
    if (meeting.status === 'ended' || meeting.status === 'cancelled' || meeting.series_status === 'cancelled') {
      throw new Error(`Cannot update a meeting that is ${meeting.status}`);
    }

    // Single occurrence edit
    if (data.scope === 'occurrence' && data.occurrenceId) {
      await this.updateOccurrence(userId, meetingId, data.occurrenceId, {
        scheduledAt: data.scheduledAt,
        durationMinutes: data.durationMinutes,
      });
      return meeting;
    }

    const updates: Partial<MeetingRecord> = {};
    let shouldRegenerateFuture = false;

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
      shouldRegenerateFuture = true;
    }

    if (data.durationMinutes !== undefined && data.durationMinutes > 0) {
      updates.duration_minutes = data.durationMinutes;
      shouldRegenerateFuture = true;
    }

    if (data.timezone !== undefined) {
      updates.timezone = data.timezone;
      shouldRegenerateFuture = true;
    }

    if (data.recurrence) {
      updates.recurrence_type = data.recurrence.frequency;
      updates.recurrence_rule = meetingRecurrenceService.buildRrule(data.recurrence);
      updates.recurrence_end_at = data.recurrence.endDate ? new Date(data.recurrence.endDate) : null;
      updates.recurrence_count = data.recurrence.occurrenceCount || null;
      shouldRegenerateFuture = true;
    }

    if (data.settings) {
      const { passcode: rawInputPasscode, ...cleanUpdates } = data.settings;
      const newSettings = { ...meeting.settings, ...cleanUpdates };
      if (data.settings.passcodeEnabled && rawInputPasscode) {
        updates.passcode_hash = this.hashPasscode(rawInputPasscode.trim());
      } else if (data.settings.passcodeEnabled === false) {
        updates.passcode_hash = null;
        newSettings.passcodeEnabled = false;
      }
      if (data.settings.joinBeforeHostMinutes !== undefined) {
        updates.join_before_host_minutes = data.settings.joinBeforeHostMinutes;
      }
      if (data.settings.audioType !== undefined) {
        updates.audio_type = data.settings.audioType;
      }
      if (data.settings.autoRecording !== undefined) {
        updates.auto_recording = data.settings.autoRecording;
      }
      updates.settings = newSettings;
    }

    if (data.alternativeHostIds !== undefined) {
      const verifiedIds = await this.validateAlternativeHostIds(userId, data.alternativeHostIds);
      updates.alternative_host_ids = verifiedIds;
      await alternativeHostRepository.setAlternativeHosts(meeting.id, verifiedIds);
    }

    const updated = await meetingRepository.updateMeeting(meetingId, updates);

    // Regenerate ONLY future unstarted occurrences (never touch historical ended/missed ones!)
    if (shouldRegenerateFuture && updated.is_scheduled && updated.scheduled_at) {
      const pivot = new Date();
      await occurrenceRepository.deleteFutureScheduledOccurrences(updated.id, pivot);

      const existingCount = (await occurrenceRepository.listByMeetingId(updated.id)).length;
      if (updated.meeting_type === 'recurring' && updated.recurrence_rule) {
        const drafts = meetingRecurrenceService.generateRollingWindow({
          startDate: updated.scheduled_at,
          durationMinutes: updated.duration_minutes,
          rrule: updated.recurrence_rule,
          timeZone: updated.timezone,
          windowDays: 90,
          maxOccurrences: 90,
        });
        const futureDrafts = drafts
          .filter((d) => d.scheduled_at.getTime() >= pivot.getTime() - 60000)
          .map((d, i) => ({
            ...d,
            occurrence_number: existingCount + i + 1,
          }));
        await occurrenceRepository.createOccurrences(updated.id, futureDrafts);
      } else if (updated.scheduled_at.getTime() >= pivot.getTime() - 60000) {
        await occurrenceRepository.createOccurrences(updated.id, [
          {
            occurrence_number: existingCount + 1,
            scheduled_at: updated.scheduled_at,
            scheduled_end_at: new Date(
              updated.scheduled_at.getTime() + updated.duration_minutes * 60000
            ),
          },
        ]);
      }
    }

    return updated;
  }

  public async cancelMeeting(
    userId: string,
    meetingId: string,
    scope: 'occurrence' | 'series' = 'series',
    occurrenceId?: string
  ): Promise<boolean> {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }
    if (meeting.owner_user_id !== userId) {
      throw new Error('Unauthorized: Only meeting owner can cancel this meeting');
    }

    if (scope === 'occurrence' && meeting.meeting_type === 'recurring') {
      const targetId =
        occurrenceId || (await this.getNextOccurrence(userId, meetingId))?.id;
      if (targetId) {
        await this.cancelOccurrence(userId, meetingId, targetId);
        return true;
      }
    }

    await this.endSeries(userId, meetingId);
    return true;
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

  public async searchUsersForAlternativeHost(
    requesterId: string,
    query: string
  ): Promise<Array<{ id: string; name: string | null; email: string }>> {
    return userRepository.searchUsers(query, requesterId, 10);
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
