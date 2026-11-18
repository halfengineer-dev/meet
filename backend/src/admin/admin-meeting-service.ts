import { meetingRepository } from '../db/repositories/meeting-repository';
import { meetingSessionRepository } from '../db/repositories/meeting-session-repository';
import { occurrenceRepository } from '../db/repositories/occurrence-repository';
import { invitationRepository } from '../db/repositories/invitation-repository';
import { userRepository } from '../db/repositories/user-repository';
import { adminStore } from '../db/repositories/admin-store';
import { meetingEventBus } from '../meetings/meeting-events';
import { meetingRecurrenceService } from '../meetings/meeting-recurrence-service';
import { roomManager } from '../rooms/room-manager';
import { MeetingRecord } from '../db/types';
import { AdminContext, assertOrgScope } from './rbac';

function deriveUnifiedStatus(m: MeetingRecord, hasActiveSession: boolean): string {
  if (m.is_disabled) return 'disabled';
  if (m.status === 'cancelled' || m.series_status === 'cancelled') return 'cancelled';
  if (m.series_status === 'expired' || (m.expires_at && m.expires_at.getTime() < Date.now() && !hasActiveSession)) {
    return 'expired';
  }
  if (hasActiveSession || m.status === 'active') return 'live';
  if (m.status === 'ended' || m.series_status === 'ended') return 'ended';
  if (m.is_scheduled && m.scheduled_at && m.scheduled_at.getTime() > Date.now()) return 'scheduled';
  if (m.is_scheduled) return 'waiting_for_host';
  return m.status;
}

export class AdminMeetingService {
  public async listMeetingsDirectory(
    ctx: AdminContext,
    query: {
      search?: string;
      status?: string;
      hostId?: string;
      organizationId?: string;
      meetingType?: string;
      recurringOnly?: boolean;
      hasRecording?: boolean;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const scopeOrgId = ctx.scopedOrganizationId || query.organizationId || undefined;
    const [meetings, activeSessions, recordings, users, orgs] = await Promise.all([
      meetingRepository.listAllMeetings(scopeOrgId),
      meetingSessionRepository.listAllActiveSessions(),
      adminStore.listRecordings(scopeOrgId),
      userRepository.listUsers(undefined, true),
      adminStore.listOrganizations(ctx.scopedOrganizationId),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    const activeByMeeting = new Map(activeSessions.map((s) => [s.meeting_id, s]));
    const recordingMeetingIds = new Set(recordings.filter((r) => r.meeting_id && r.status !== 'deleted').map((r) => r.meeting_id!));
    const sfuRooms = new Map(roomManager.getActiveRoomsTelemetry().map((r) => [r.roomId, r]));

    const q = (query.search || '').trim().toLowerCase();
    const fromDate = query.from ? new Date(query.from) : null;
    const toDate = query.to ? new Date(query.to) : null;

    const rows = await Promise.all(
      meetings.map(async (m) => {
        const activeSession = activeByMeeting.get(m.id) || null;
        const unifiedStatus = deriveUnifiedStatus(m, Boolean(activeSession));
        const host = userMap.get(m.owner_user_id);
        const org = m.organization_id ? orgMap.get(m.organization_id) : null;
        const participants = await meetingRepository.listMeetingParticipants(m.id);
        const sfu = sfuRooms.get(m.room_id);
        const participantCount = Math.max(participants.length, sfu?.participantCount || 0);

        return {
          id: m.id,
          roomId: m.room_id,
          title: m.title,
          host: host ? { id: host.id, name: host.name, email: host.email } : { id: m.owner_user_id, name: 'Unknown', email: '' },
          organizationId: m.organization_id || null,
          organizationName: org?.name || null,
          createdAt: m.created_at.toISOString(),
          scheduledAt: m.scheduled_at ? m.scheduled_at.toISOString() : null,
          startedAt: activeSession ? activeSession.started_at.toISOString() : null,
          endedAt: m.ended_at ? m.ended_at.toISOString() : null,
          durationMinutes: m.duration_minutes,
          timezone: m.timezone,
          participantCount,
          meetingType: m.meeting_type,
          recurrenceRule: m.recurrence_rule,
          recurrenceSummary: meetingRecurrenceService.describeRecurrence(m.recurrence_rule, m.timezone),
          status: unifiedStatus,
          seriesStatus: m.series_status,
          isDisabled: Boolean(m.is_disabled),
          hasRecording: recordingMeetingIds.has(m.id),
        };
      })
    );

    const filtered = rows.filter((r) => {
      if (q) {
        const hay = `${r.title} ${r.roomId} ${r.id} ${r.host.name || ''} ${r.host.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (query.status && r.status !== query.status) return false;
      if (query.hostId && r.host.id !== query.hostId) return false;
      if (query.meetingType && r.meetingType !== query.meetingType) return false;
      if (query.recurringOnly && r.meetingType !== 'recurring') return false;
      if (query.hasRecording && !r.hasRecording) return false;
      const refDate = r.scheduledAt ? new Date(r.scheduledAt) : new Date(r.createdAt);
      if (fromDate && !isNaN(fromDate.getTime()) && refDate < fromDate) return false;
      if (toDate && !isNaN(toDate.getTime()) && refDate > toDate) return false;
      return true;
    });

    const total = filtered.length;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
    const offset = (page - 1) * limit;

    return {
      meetings: filtered.slice(offset, offset + limit),
      total,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  public async getMeetingDetail(ctx: AdminContext, meetingId: string) {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      const err: any = new Error('Meeting not found');
      err.statusCode = 404;
      throw err;
    }

    if (ctx.scopedOrganizationId) {
      assertOrgScope(ctx, meeting.organization_id);
    }

    const [host, org, occurrences, sessions, participants, invitations] = await Promise.all([
      userRepository.findById(meeting.owner_user_id, true),
      meeting.organization_id ? adminStore.findOrganizationById(meeting.organization_id) : Promise.resolve(null),
      occurrenceRepository.listByMeetingId(meeting.id),
      meetingSessionRepository.listByMeetingId(meeting.id),
      meetingRepository.listMeetingParticipants(meeting.id),
      invitationRepository.listByMeeting(meeting.id),
    ]);

    const participantDetails = await Promise.all(
      participants.map(async (p) => {
        const u = await userRepository.findById(p.user_id, true);
        return {
          id: p.id,
          userId: p.user_id,
          name: u?.name || 'Participant',
          email: u?.email || null,
          role: p.role,
          joinedAt: p.created_at.toISOString(),
        };
      })
    );

    const activeSession = sessions.find((s) => s.status === 'active') || null;
    const sfuRoom = roomManager.getActiveRoomsTelemetry().find((r) => r.roomId === meeting.room_id) || null;
    const totalSessionMinutes = sessions.reduce((acc, s) => {
      const end = s.ended_at ? s.ended_at.getTime() : Date.now();
      return acc + Math.max(1, Math.round((end - s.started_at.getTime()) / 60000));
    }, 0);

    return {
      general: {
        id: meeting.id,
        roomId: meeting.room_id,
        title: meeting.title,
        description: meeting.description,
        meetingUrl: `https://${process.env.PUBLIC_DOMAIN || 'faceonn.com'}/${meeting.room_id}`,
        host: host ? { id: host.id, name: host.name, email: host.email } : null,
        organization: org ? { id: org.id, name: org.name } : null,
        status: deriveUnifiedStatus(meeting, Boolean(activeSession)),
        seriesStatus: meeting.series_status,
        isDisabled: Boolean(meeting.is_disabled),
        disabledReason: meeting.disabled_reason || null,
        meetingType: meeting.meeting_type,
        recurrenceType: meeting.recurrence_type,
        recurrenceRule: meeting.recurrence_rule,
        recurrenceSummary: meetingRecurrenceService.describeRecurrence(meeting.recurrence_rule, meeting.timezone),
        scheduledAt: meeting.scheduled_at ? meeting.scheduled_at.toISOString() : null,
        durationMinutes: meeting.duration_minutes,
        timezone: meeting.timezone,
        expiresAt: meeting.expires_at ? meeting.expires_at.toISOString() : null,
        endedAt: meeting.ended_at ? meeting.ended_at.toISOString() : null,
        createdAt: meeting.created_at.toISOString(),
      },
      settings: {
        passcodeEnabled: Boolean(meeting.settings.passcodeEnabled && meeting.passcode_hash),
        waitingRoomEnabled: meeting.settings.waitingRoomEnabled,
        joinBeforeHost: meeting.settings.joinBeforeHost,
        muteOnEntry: meeting.settings.muteOnEntry,
        allowScreenSharing: meeting.settings.allowScreenSharing,
        allowChat: meeting.settings.allowChat,
        allowRecording: Boolean(meeting.settings.allowRecording),
        requireAuthentication: meeting.settings.requireAuthentication,
      },
      participants: participantDetails,
      invitations,
      occurrences: occurrences.map((o) => ({
        id: o.id,
        occurrenceNumber: o.occurrence_number,
        scheduledAt: o.scheduled_at.toISOString(),
        scheduledEndAt: o.scheduled_end_at.toISOString(),
        actualStartedAt: o.actual_started_at ? o.actual_started_at.toISOString() : null,
        actualEndedAt: o.actual_ended_at ? o.actual_ended_at.toISOString() : null,
        status: o.status,
        sessionId: o.session_id,
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        occurrenceId: s.occurrence_id,
        jitsiRoomName: s.jitsi_room_name,
        status: s.status,
        startedAt: s.started_at.toISOString(),
        endedAt: s.ended_at ? s.ended_at.toISOString() : null,
        terminationReason: s.termination_reason,
      })),
      analytics: {
        totalSessions: sessions.length,
        totalParticipantCount: Math.max(participantDetails.length, sfuRoom?.participantCount || 0),
        totalMeetingMinutes: totalSessionMinutes,
        liveSfuStats: sfuRoom,
      },
    };
  }

  public async endLiveMeeting(ctx: AdminContext, meetingId: string, reason = 'admin_terminated') {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      const err: any = new Error('Meeting not found');
      err.statusCode = 404;
      throw err;
    }
    if (ctx.scopedOrganizationId) assertOrgScope(ctx, meeting.organization_id);

    const now = new Date();
    const activeSession = await meetingSessionRepository.findActiveByMeetingId(meeting.id);
    if (activeSession) {
      await meetingSessionRepository.endSession(activeSession.id, ctx.userId, reason);
      await occurrenceRepository.updateOccurrence(activeSession.occurrence_id, {
        status: 'ended',
        actual_ended_at: now,
        ended_by_user_id: ctx.userId,
      }).catch(() => {});
    }
    await meetingSessionRepository.endAllActiveForMeeting(meeting.id, ctx.userId, reason);

    // Close SFU room if active in custom Mediasoup backend
    roomManager.removeRoom(meeting.room_id);

    const updated = await meetingRepository.updateMeeting(meeting.id, {
      status: 'ended',
      ...(meeting.meeting_type !== 'recurring' ? { series_status: 'ended', ended_at: now } : {}),
    });

    meetingEventBus.emitOccurrenceEnded({
      meetingId: meeting.id,
      roomId: meeting.room_id,
      occurrenceId: activeSession?.occurrence_id,
      sessionId: activeSession?.id,
      status: 'ended',
      timestamp: now.toISOString(),
    });

    return updated;
  }

  public async cancelMeeting(
    ctx: AdminContext,
    meetingId: string,
    scope: 'series' | 'occurrence' = 'series',
    occurrenceId?: string
  ) {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      const err: any = new Error('Meeting not found');
      err.statusCode = 404;
      throw err;
    }
    if (ctx.scopedOrganizationId) assertOrgScope(ctx, meeting.organization_id);

    const now = new Date();
    if (scope === 'occurrence' && occurrenceId) {
      const occ = await occurrenceRepository.findById(occurrenceId);
      if (!occ || occ.meeting_id !== meeting.id) {
        const err: any = new Error('Occurrence not found');
        err.statusCode = 404;
        throw err;
      }
      if (occ.session_id) {
        await meetingSessionRepository.endSession(occ.session_id, ctx.userId, 'admin_cancelled_occurrence');
      }
      const cancelledOcc = await occurrenceRepository.updateOccurrence(occ.id, {
        status: 'cancelled',
        actual_ended_at: now,
        ended_by_user_id: ctx.userId,
      });
      return { meeting, cancelledOccurrence: cancelledOcc };
    }

    await meetingSessionRepository.endAllActiveForMeeting(meeting.id, ctx.userId, 'admin_cancelled');
    await occurrenceRepository.cancelFutureOccurrences(meeting.id);
    roomManager.removeRoom(meeting.room_id);

    const updated = await meetingRepository.updateMeeting(meeting.id, {
      status: 'cancelled',
      series_status: 'cancelled',
      ended_at: now,
    });

    meetingEventBus.emitSeriesCancelled({
      meetingId: meeting.id,
      roomId: meeting.room_id,
      status: 'cancelled',
      timestamp: now.toISOString(),
    });

    return { meeting: updated };
  }

  public async disableMeetingLink(ctx: AdminContext, meetingId: string, reason = 'Link disabled by administrator') {
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      const err: any = new Error('Meeting not found');
      err.statusCode = 404;
      throw err;
    }
    if (ctx.scopedOrganizationId) assertOrgScope(ctx, meeting.organization_id);

    await meetingSessionRepository.endAllActiveForMeeting(meeting.id, ctx.userId, 'link_disabled');
    roomManager.removeRoom(meeting.room_id);

    const updated = await meetingRepository.updateMeeting(meeting.id, {
      is_disabled: true,
      disabled_reason: reason,
      status: 'cancelled',
      series_status: 'cancelled',
      ended_at: new Date(),
    });

    meetingEventBus.emitSeriesCancelled({
      meetingId: meeting.id,
      roomId: meeting.room_id,
      status: 'disabled',
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  public async getLiveMonitoringSnapshot(ctx: AdminContext) {
    const [activeSessions, allMeetings, users, orgs] = await Promise.all([
      meetingSessionRepository.listAllActiveSessions(),
      meetingRepository.listAllMeetings(ctx.scopedOrganizationId),
      userRepository.listUsers(undefined, true),
      adminStore.listOrganizations(ctx.scopedOrganizationId),
    ]);

    const meetingMap = new Map(allMeetings.map((m) => [m.id, m]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    const sfuRooms = roomManager.getActiveRoomsTelemetry();
    const sfuByRoom = new Map(sfuRooms.map((r) => [r.roomId, r]));

    const liveMeetings = [];
    let totalConcurrentParticipants = 0;

    for (const session of activeSessions) {
      const m = meetingMap.get(session.meeting_id);
      if (!m) continue; // Scoped out for org admin or deleted
      const host = userMap.get(m.owner_user_id);
      const org = m.organization_id ? orgMap.get(m.organization_id) : null;
      const participants = await meetingRepository.listMeetingParticipants(m.id);
      const sfu = sfuByRoom.get(m.room_id);
      const participantCount = Math.max(participants.length, sfu?.participantCount || 0);
      totalConcurrentParticipants += participantCount;

      liveMeetings.push({
        meetingId: m.id,
        sessionId: session.id,
        roomId: m.room_id,
        jitsiRoomName: session.jitsi_room_name,
        title: m.title,
        host: host ? { id: host.id, name: host.name, email: host.email } : { id: m.owner_user_id, name: 'Unknown', email: '' },
        organizationName: org?.name || null,
        participantCount,
        startedAt: session.started_at.toISOString(),
        durationSeconds: Math.max(0, Math.floor((Date.now() - session.started_at.getTime()) / 1000)),
        sfuNode: sfu ? (process.env.SFU_NODE_ID || 'local-mediasoup-node') : (process.env.JITSI_NODE_ID || 'jitsi-primary'),
        region: process.env.SERVER_REGION || 'default',
        audioProducers: sfu?.audioProducers ?? null,
        videoProducers: sfu?.videoProducers ?? null,
        recordingActive: m.auto_recording !== 'none',
        networkHealth: sfu ? (sfu.routerClosed ? 'degraded' : 'healthy') : 'telemetry_via_jitsi',
      });
    }

    const totalTransports = sfuRooms.reduce((s, r) => s + r.transports, 0);
    const totalProducers = sfuRooms.reduce((s, r) => s + r.producers, 0);
    const totalConsumers = sfuRooms.reduce((s, r) => s + r.consumers, 0);

    return {
      timestamp: new Date().toISOString(),
      liveMeetings,
      metrics: {
        concurrentMeetings: liveMeetings.length,
        concurrentParticipants: totalConcurrentParticipants,
        sfuActiveRooms: sfuRooms.length,
        incomingWebRtcStreams: totalProducers,
        outgoingWebRtcStreams: totalConsumers,
        activeTransports: totalTransports,
        // Honest telemetry availability indicators (no fabricated WebRTC RTT/jitter/packet-loss)
        webrtcQualityTelemetryAvailable: false,
        avgPacketLossPercent: null,
        avgRttMs: null,
        avgJitterMs: null,
      },
    };
  }
}

export const adminMeetingService = new AdminMeetingService();
