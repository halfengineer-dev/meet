import {
  MeetingOccurrenceRecord,
  MeetingRecord,
  MeetingSessionRecord,
} from '../db/types';
import { meetingRepository } from '../db/repositories/meeting-repository';
import { occurrenceRepository } from '../db/repositories/occurrence-repository';
import { meetingSessionRepository } from '../db/repositories/meeting-session-repository';
import { alternativeHostRepository } from '../db/repositories/alternative-host-repository';
import { userRepository } from '../db/repositories/user-repository';
import { meetingRecurrenceService } from './meeting-recurrence-service';

export type MeetingResolutionStatus =
  | 'not_found'
  | 'cancelled'
  | 'expired'
  | 'ended'
  | 'waiting_for_host'
  | 'active';

export interface MeetingAccessResolution {
  status: MeetingResolutionStatus;
  roomId: string;
  meeting: MeetingRecord | null;
  hostName: string | null;
  isOwner: boolean;
  isAlternativeHost: boolean;
  isHost: boolean;
  activeOccurrence: MeetingOccurrenceRecord | null;
  activeSession: MeetingSessionRecord | null;
  nextOccurrence: MeetingOccurrenceRecord | null;
  lastEndedOccurrence: MeetingOccurrenceRecord | null;
  canJoinBeforeHostNow: boolean;
  recurrenceSummary: string | null;
  countdownSeconds: number | null;
}

const MISSED_GRACE_MINUTES = Number(process.env.MEETING_MISSED_GRACE_MINUTES || 30);

export class MeetingAuthorizationService {
  /**
   * Backend-authoritative check for host privileges (Owner OR verified Alternative Host).
   * Never trusts client-supplied roles, display names, or emails.
   */
  public async getHostRoles(
    meeting: MeetingRecord,
    userId?: string | null
  ): Promise<{ isOwner: boolean; isAlternativeHost: boolean; isHost: boolean }> {
    if (!userId) {
      return { isOwner: false, isAlternativeHost: false, isHost: false };
    }
    const isOwner = meeting.owner_user_id === userId;
    if (isOwner) {
      return { isOwner: true, isAlternativeHost: false, isHost: true };
    }
    const isAltInTable = await alternativeHostRepository.isAlternativeHost(meeting.id, userId);
    const isAltInArray = Array.isArray(meeting.alternative_host_ids)
      ? meeting.alternative_host_ids.includes(userId)
      : false;
    const isAlternativeHost = isAltInTable || isAltInArray;
    return {
      isOwner: false,
      isAlternativeHost,
      isHost: isAlternativeHost,
    };
  }

  /**
   * Ensures a meeting has occurrences populated (handles legacy records created before
   * meeting_occurrences existed and extends rolling 90-day windows for recurring series).
   */
  public async ensureOccurrences(meeting: MeetingRecord, now = new Date()): Promise<MeetingOccurrenceRecord[]> {
    let occurrences = await occurrenceRepository.listByMeetingId(meeting.id);

    // Backfill if legacy scheduled/instant meeting has no occurrence rows yet
    if (occurrences.length === 0) {
      if (meeting.meeting_type === 'recurring' && meeting.recurrence_rule && meeting.scheduled_at) {
        const items = meetingRecurrenceService.generateRollingWindow({
          startDate: meeting.scheduled_at,
          durationMinutes: meeting.duration_minutes,
          rrule: meeting.recurrence_rule,
          timeZone: meeting.timezone,
          windowDays: 90,
          maxOccurrences: 90,
        });
        await occurrenceRepository.createOccurrences(meeting.id, items);
      } else {
        const start = meeting.scheduled_at || meeting.created_at;
        const end = new Date(start.getTime() + meeting.duration_minutes * 60000);
        const initialStatus =
          meeting.status === 'cancelled'
            ? 'cancelled'
            : meeting.status === 'ended'
              ? 'ended'
              : meeting.status === 'active'
                ? 'active'
                : 'scheduled';
        await occurrenceRepository.createOccurrences(meeting.id, [
          {
            occurrence_number: 1,
            scheduled_at: start,
            scheduled_end_at: end,
            status: initialStatus,
          },
        ]);
      }
      occurrences = await occurrenceRepository.listByMeetingId(meeting.id);
    }

    // Rolling window extension for active recurring series when < 5 future occurrences remain
    if (
      meeting.meeting_type === 'recurring' &&
      meeting.series_status === 'active' &&
      meeting.recurrence_rule &&
      meeting.scheduled_at
    ) {
      const futureScheduled = occurrences.filter(
        (o) => (o.status === 'scheduled' || o.status === 'waiting_for_host') && o.scheduled_end_at.getTime() >= now.getTime()
      );
      const countLimitReached =
        meeting.recurrence_count !== null && occurrences.length >= meeting.recurrence_count;
      const endDateReached =
        meeting.recurrence_end_at !== null && meeting.recurrence_end_at.getTime() <= now.getTime();

      if (futureScheduled.length < 5 && !countLimitReached && !endDateReached) {
        const latest = occurrences[occurrences.length - 1];
        const anchorStart = latest
          ? new Date(latest.scheduled_at.getTime() + 60000)
          : meeting.scheduled_at;
        const generated = meetingRecurrenceService.generateRollingWindow({
          startDate: anchorStart,
          durationMinutes: meeting.duration_minutes,
          rrule: meeting.recurrence_rule,
          timeZone: meeting.timezone,
          windowDays: 90,
          maxOccurrences: meeting.recurrence_count
            ? Math.max(0, meeting.recurrence_count - occurrences.length)
            : 60,
        });
        if (generated.length > 0) {
          const offset = occurrences.length;
          await occurrenceRepository.createOccurrences(
            meeting.id,
            generated.map((g, i) => ({
              ...g,
              occurrence_number: offset + i + 1,
            }))
          );
          occurrences = await occurrenceRepository.listByMeetingId(meeting.id);
        }
      }
    }

    return occurrences;
  }

  /**
   * Marks overdue unstarted scheduled occurrences as 'missed' after the grace window,
   * preserving recurring series continuity.
   */
  public async sweepMissedOccurrences(
    meeting: MeetingRecord,
    occurrences: MeetingOccurrenceRecord[],
    now = new Date()
  ): Promise<MeetingOccurrenceRecord[]> {
    if (!meeting.is_scheduled) return occurrences;

    const graceMs = MISSED_GRACE_MINUTES * 60000;
    const updated: MeetingOccurrenceRecord[] = [];

    for (const occ of occurrences) {
      if (
        (occ.status === 'scheduled' || occ.status === 'waiting_for_host') &&
        occ.scheduled_end_at.getTime() + graceMs < now.getTime()
      ) {
        const missed = await occurrenceRepository.updateOccurrence(occ.id, { status: 'missed' });
        updated.push(missed);
      } else {
        updated.push(occ);
      }
    }

    return updated;
  }

  /**
   * Resolves the complete authoritative state of a meeting room for any viewer (host, user, or guest).
   */
  public async resolveMeetingAccess(
    roomId: string,
    viewerUserId?: string | null,
    now = new Date()
  ): Promise<MeetingAccessResolution> {
    const normalizedRoom = roomId.toLowerCase().trim();
    const meeting = await meetingRepository.findByRoomId(normalizedRoom);

    if (!meeting) {
      return {
        status: 'not_found',
        roomId: normalizedRoom,
        meeting: null,
        hostName: null,
        isOwner: false,
        isAlternativeHost: false,
        isHost: false,
        activeOccurrence: null,
        activeSession: null,
        nextOccurrence: null,
        lastEndedOccurrence: null,
        canJoinBeforeHostNow: false,
        recurrenceSummary: null,
        countdownSeconds: null,
      };
    }

    const [roles, owner] = await Promise.all([
      this.getHostRoles(meeting, viewerUserId),
      userRepository.findById(meeting.owner_user_id),
    ]);
    const hostName = owner?.name || 'Meeting Host';
    const recurrenceSummary = meetingRecurrenceService.describeRecurrence(
      meeting.recurrence_rule,
      meeting.timezone
    );

    // 1. Series cancelled or link disabled by administrator
    if (meeting.is_disabled || meeting.series_status === 'cancelled' || meeting.status === 'cancelled') {
      return {
        status: 'cancelled',
        roomId: meeting.room_id,
        meeting,
        hostName,
        ...roles,
        activeOccurrence: null,
        activeSession: null,
        nextOccurrence: null,
        lastEndedOccurrence: null,
        canJoinBeforeHostNow: false,
        recurrenceSummary,
        countdownSeconds: null,
      };
    }

    // 2. Link expired
    if (
      meeting.series_status === 'expired' ||
      (meeting.expires_at && meeting.expires_at.getTime() < now.getTime())
    ) {
      return {
        status: 'expired',
        roomId: meeting.room_id,
        meeting,
        hostName,
        ...roles,
        activeOccurrence: null,
        activeSession: null,
        nextOccurrence: null,
        lastEndedOccurrence: null,
        canJoinBeforeHostNow: false,
        recurrenceSummary,
        countdownSeconds: null,
      };
    }

    // 3. Populate & sweep occurrences
    let occurrences = await this.ensureOccurrences(meeting, now);
    occurrences = await this.sweepMissedOccurrences(meeting, occurrences, now);

    // 4. Check for a LIVE active session
    const activeSession = await meetingSessionRepository.findActiveByMeetingId(meeting.id);
    let activeOccurrence: MeetingOccurrenceRecord | null = null;
    if (activeSession) {
      activeOccurrence = occurrences.find((o) => o.id === activeSession.occurrence_id) || null;
    }

    // Handle legacy instant/active meetings that have status='active' before session table existed
    if (!activeSession && meeting.status === 'active' && !meeting.is_scheduled) {
      const occ = occurrences[0];
      if (occ && occ.status !== 'ended' && occ.status !== 'cancelled') {
        const { session } = await meetingSessionRepository.createOrGetActiveSession({
          meetingId: meeting.id,
          occurrenceId: occ.id,
          publicRoomId: meeting.room_id,
          startedByUserId: meeting.owner_user_id,
        });
        const updatedOcc = await occurrenceRepository.updateOccurrence(occ.id, {
          status: 'active',
          session_id: session.id,
          actual_started_at: occ.actual_started_at || now,
        });
        return {
          status: 'active',
          roomId: meeting.room_id,
          meeting,
          hostName,
          ...roles,
          activeOccurrence: updatedOcc,
          activeSession: session,
          nextOccurrence: null,
          lastEndedOccurrence: null,
          canJoinBeforeHostNow: true,
          recurrenceSummary,
          countdownSeconds: 0,
        };
      }
    }

    // Find next upcoming scheduled occurrence & most recently ended occurrence
    const upcomingScheduled = occurrences.filter(
      (o) => o.status === 'scheduled' || o.status === 'waiting_for_host'
    );
    const nextOccurrence = upcomingScheduled[0] || null;

    const endedOccurrences = occurrences
      .filter((o) => o.status === 'ended')
      .sort((a, b) => (b.actual_ended_at?.getTime() || 0) - (a.actual_ended_at?.getTime() || 0));
    const lastEndedOccurrence = endedOccurrences[0] || null;

    // 5. If there is an active session right now -> ACTIVE
    if (activeSession && activeOccurrence && activeOccurrence.status === 'active') {
      return {
        status: 'active',
        roomId: meeting.room_id,
        meeting,
        hostName,
        ...roles,
        activeOccurrence,
        activeSession,
        nextOccurrence,
        lastEndedOccurrence,
        canJoinBeforeHostNow: true,
        recurrenceSummary,
        countdownSeconds: 0,
      };
    }

    // 6. One-time or instant meeting that has ended (no future occurrences)
    if (
      meeting.status === 'ended' ||
      meeting.series_status === 'ended' ||
      (!nextOccurrence && lastEndedOccurrence)
    ) {
      return {
        status: 'ended',
        roomId: meeting.room_id,
        meeting,
        hostName,
        ...roles,
        activeOccurrence: null,
        activeSession: null,
        nextOccurrence: null,
        lastEndedOccurrence,
        canJoinBeforeHostNow: false,
        recurrenceSummary,
        countdownSeconds: null,
      };
    }

    // 7. Scheduled / Recurring meeting waiting for host (between occurrences or before first occurrence)
    if (nextOccurrence) {
      const diffMs = nextOccurrence.scheduled_at.getTime() - now.getTime();
      const countdownSeconds = Math.max(0, Math.floor(diffMs / 1000));
      const leadMinutes = meeting.join_before_host_minutes ?? meeting.settings.joinBeforeHostMinutes ?? 0;
      const canJoinBeforeHostNow = Boolean(
        meeting.settings.joinBeforeHost &&
          (leadMinutes === 0 || diffMs <= leadMinutes * 60000)
      );

      return {
        status: 'waiting_for_host',
        roomId: meeting.room_id,
        meeting,
        hostName,
        ...roles,
        activeOccurrence: null,
        activeSession: null,
        nextOccurrence,
        lastEndedOccurrence,
        canJoinBeforeHostNow,
        recurrenceSummary,
        countdownSeconds,
      };
    }

    // Fallback: all occurrences missed or expired
    return {
      status: 'ended',
      roomId: meeting.room_id,
      meeting,
      hostName,
      ...roles,
      activeOccurrence: null,
      activeSession: null,
      nextOccurrence: null,
      lastEndedOccurrence,
      canJoinBeforeHostNow: false,
      recurrenceSummary,
      countdownSeconds: null,
    };
  }
}

export const meetingAuthorizationService = new MeetingAuthorizationService();
