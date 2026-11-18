import { Router } from 'express';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../auth/middleware';
import { meetingService } from '../meetings/meeting-service';
import { meetingCalendarService } from '../meetings/meeting-calendar-service';
import {
  MeetingAlternativeHostRecord,
  MeetingOccurrenceRecord,
  MeetingRecord,
  MeetingSessionRecord,
} from '../db/types';

export const meetingRouter = Router();

function sanitizeMeeting(m: MeetingRecord) {
  return {
    id: m.id,
    roomId: m.room_id,
    title: m.title,
    ownerId: m.owner_user_id,
    status: m.status,
    seriesStatus: m.series_status,
    scheduledAt: m.scheduled_at ? m.scheduled_at.toISOString() : null,
    durationMinutes: m.duration_minutes,
    timezone: m.timezone,
    description: m.description,
    isScheduled: m.is_scheduled,
    meetingType: m.meeting_type,
    recurrenceSeriesId: m.recurrence_series_id,
    recurrenceType: m.recurrence_type,
    recurrenceRule: m.recurrence_rule,
    recurrenceEndAt: m.recurrence_end_at ? m.recurrence_end_at.toISOString() : null,
    recurrenceCount: m.recurrence_count,
    joinBeforeHostMinutes: m.join_before_host_minutes,
    audioType: m.audio_type,
    autoRecording: m.auto_recording,
    registrationRequired: m.registration_required,
    alternativeHostIds: m.alternative_host_ids || [],
    endedAt: m.ended_at ? m.ended_at.toISOString() : null,
    expiresAt: m.expires_at ? m.expires_at.toISOString() : null,
    settings: {
      passcodeEnabled: Boolean(m.settings.passcodeEnabled && m.passcode_hash),
      waitingRoomEnabled: m.settings.waitingRoomEnabled,
      joinBeforeHost: m.settings.joinBeforeHost,
      joinBeforeHostMinutes: m.join_before_host_minutes ?? m.settings.joinBeforeHostMinutes ?? 0,
      hostVideoEnabled: m.settings.hostVideoEnabled,
      participantVideoEnabled: m.settings.participantVideoEnabled,
      muteOnEntry: m.settings.muteOnEntry,
      allowParticipantsUnmute: m.settings.allowParticipantsUnmute !== false,
      allowScreenSharing: m.settings.allowScreenSharing,
      allowChat: m.settings.allowChat,
      allowReactions: m.settings.allowReactions,
      allowRecording: Boolean(m.settings.allowRecording),
      requireAuthentication: m.settings.requireAuthentication,
      registrationRequired: Boolean(m.registration_required),
      audioType: m.audio_type || 'computer',
      autoRecording: m.auto_recording || 'none',
    },
    hasPasscode: Boolean(m.passcode_hash),
    createdAt: m.created_at.toISOString(),
    updatedAt: m.updated_at.toISOString(),
  };
}

function sanitizeOccurrence(o: MeetingOccurrenceRecord) {
  return {
    id: o.id,
    meetingId: o.meeting_id,
    occurrenceNumber: o.occurrence_number,
    scheduledAt: o.scheduled_at.toISOString(),
    scheduledEndAt: o.scheduled_end_at.toISOString(),
    actualStartedAt: o.actual_started_at ? o.actual_started_at.toISOString() : null,
    actualEndedAt: o.actual_ended_at ? o.actual_ended_at.toISOString() : null,
    status: o.status,
    sessionId: o.session_id,
    startedByUserId: o.started_by_user_id,
    endedByUserId: o.ended_by_user_id,
  };
}

function sanitizeSession(s: MeetingSessionRecord) {
  return {
    id: s.id,
    meetingId: s.meeting_id,
    occurrenceId: s.occurrence_id,
    jitsiRoomName: s.jitsi_room_name,
    status: s.status,
    startedAt: s.started_at.toISOString(),
    endedAt: s.ended_at ? s.ended_at.toISOString() : null,
  };
}

function sanitizeAltHost(ah: MeetingAlternativeHostRecord) {
  return {
    id: ah.id,
    userId: ah.user_id,
    name: ah.user_name || null,
    email: ah.user_email || '',
  };
}

// Public/optional-auth room status endpoint (used by Zoom-style waiting/ended screen before entering conference)
meetingRouter.get('/:roomId/public-info', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
    const info = await meetingService.getPublicMeetingInfo(roomId, req.user?.id || null);
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to inspect meeting status' });
  }
});

// Public guest join endpoint (Zoom-style join without creating an account)
meetingRouter.post('/:roomId/guest-join', async (req, res) => {
  try {
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
    const { displayName, passcode } = req.body || {};

    const result = await meetingService.guestJoinMeeting(roomId, displayName, passcode);

    res.json({
      meeting: sanitizeMeeting(result.meeting),
      occurrence: sanitizeOccurrence(result.occurrence),
      session: sanitizeSession(result.session),
      token: result.token,
      role: result.role,
      displayName: result.displayName,
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 403;
    res.status(statusCode).json({
      error: err.message || 'Failed to join meeting as guest',
      code: err.code || 'GUEST_JOIN_FAILED',
    });
  }
});

// Protect ALL remaining meeting routes with requireAuth
meetingRouter.use(requireAuth);

// GET /api/meetings/users/search?q=... - Search registered Faceonn users for Alternative Hosts
meetingRouter.get('/users/search', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const users = await meetingService.searchUsersForAlternativeHost(user.id, q);
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to search users' });
  }
});

// POST /api/meetings/schedule - Schedule a meeting series + initial occurrences
meetingRouter.post('/schedule', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const origin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    const result = await meetingService.scheduleMeeting(user.id, req.body, origin);

    res.status(201).json({
      meeting: sanitizeMeeting(result.meeting),
      occurrences: result.occurrences.map(sanitizeOccurrence),
      invitees: result.invitees,
      alternativeHosts: result.alternativeHosts.map(sanitizeAltHost),
      token: result.token,
      roomUrl: result.roomUrl,
      googleCalendarUrl: result.googleCalendarUrl,
      outlookCalendarUrl: result.outlookCalendarUrl,
      icsUrl: result.icsUrl,
      invitationText: result.invitationText,
      recurrenceSummary: result.recurrenceSummary,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to schedule meeting' });
  }
});

// GET /api/meetings/upcoming - List upcoming scheduled meetings
meetingRouter.get('/upcoming', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const meetings = await meetingService.listUpcomingMeetings(user.id);
    res.json({ meetings: meetings.map(sanitizeMeeting) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list upcoming meetings' });
  }
});

// GET /api/meetings/past - List past meetings
meetingRouter.get('/past', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const meetings = await meetingService.listPastMeetings(user.id);
    res.json({ meetings: meetings.map(sanitizeMeeting) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list past meetings' });
  }
});

// POST /api/meetings - Create instant meeting
meetingRouter.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { title } = req.body || {};

    const { meeting, occurrence, session, token, role } = await meetingService.createMeeting(user.id, title);

    res.status(201).json({
      meeting: sanitizeMeeting(meeting),
      occurrence: sanitizeOccurrence(occurrence),
      session: sanitizeSession(session),
      token,
      role,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create meeting' });
  }
});

// GET /api/meetings - List user meetings
meetingRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const meetings = await meetingService.listUserMeetings(user.id);
    res.json({ meetings: meetings.map(sanitizeMeeting) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list meetings' });
  }
});

// GET /api/meetings/:id/occurrences - List occurrences for a meeting series
meetingRouter.get('/:id/occurrences', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const occurrences = await meetingService.getOccurrences(user.id, id);
    res.json({ occurrences: occurrences.map(sanitizeOccurrence) });
  } catch (err: any) {
    res.status(err.message === 'Meeting not found' ? 404 : 403).json({ error: err.message });
  }
});

// GET /api/meetings/:id/next-occurrence - Get next active/scheduled occurrence
meetingRouter.get('/:id/next-occurrence', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const next = await meetingService.getNextOccurrence(user.id, id);
    res.json({ occurrence: next ? sanitizeOccurrence(next) : null });
  } catch (err: any) {
    res.status(err.message === 'Meeting not found' ? 404 : 403).json({ error: err.message });
  }
});

// GET /api/meetings/:id - Get meeting details
meetingRouter.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (['upcoming', 'past', 'schedule', 'users'].includes(id)) {
      return next();
    }

    const origin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    const result = await meetingService.getMeetingById(user.id, id, origin);

    res.json({
      meeting: sanitizeMeeting(result.meeting),
      occurrences: result.occurrences.map(sanitizeOccurrence),
      nextOccurrence: result.nextOccurrence ? sanitizeOccurrence(result.nextOccurrence) : null,
      alternativeHosts: result.alternativeHosts.map(sanitizeAltHost),
      invitees: result.invitees,
      isOwner: result.isOwner,
      isHost: result.isHost,
      googleCalendarUrl: result.googleCalendarUrl,
      outlookCalendarUrl: result.outlookCalendarUrl,
      icsUrl: result.icsUrl,
      invitationText: result.invitationText,
      recurrenceSummary: result.recurrenceSummary,
    });
  } catch (err: any) {
    res.status(err.message === 'Meeting not found' ? 404 : 403).json({ error: err.message });
  }
});

// PATCH /api/meetings/:id - Update scheduled meeting / series
meetingRouter.patch('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updated = await meetingService.updateMeeting(user.id, id, req.body);

    res.json({ meeting: sanitizeMeeting(updated) });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update meeting' });
  }
});

// PATCH /api/meetings/:id/occurrences/:occurrenceId - Edit a single occurrence
meetingRouter.patch('/:id/occurrences/:occurrenceId', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const occurrenceId = Array.isArray(req.params.occurrenceId)
      ? req.params.occurrenceId[0]
      : req.params.occurrenceId;

    const updated = await meetingService.updateOccurrence(user.id, id, occurrenceId, req.body || {});
    res.json({ occurrence: sanitizeOccurrence(updated) });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update occurrence' });
  }
});

// POST /api/meetings/:id/start - Host or alternative host starts next/active occurrence
meetingRouter.post('/:id/start', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { occurrenceId } = req.body || {};
    const result = await meetingService.startMeeting(user.id, id, occurrenceId);

    res.json({
      meeting: sanitizeMeeting(result.meeting),
      occurrence: sanitizeOccurrence(result.occurrence),
      session: sanitizeSession(result.session),
      token: result.token,
      role: result.role,
    });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({
      error: err.message || 'Failed to start meeting',
      code: err.code || 'START_FAILED',
    });
  }
});

// POST /api/meetings/:id/occurrences/:occurrenceId/start - Start a specific occurrence
meetingRouter.post('/:id/occurrences/:occurrenceId/start', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const occurrenceId = Array.isArray(req.params.occurrenceId)
      ? req.params.occurrenceId[0]
      : req.params.occurrenceId;

    const result = await meetingService.startMeeting(user.id, id, occurrenceId);

    res.json({
      meeting: sanitizeMeeting(result.meeting),
      occurrence: sanitizeOccurrence(result.occurrence),
      session: sanitizeSession(result.session),
      token: result.token,
      role: result.role,
    });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({
      error: err.message || 'Failed to start occurrence',
      code: err.code || 'START_FAILED',
    });
  }
});

// POST /api/meetings/:id/end-occurrence - End ONLY current active occurrence (preserves future occurrences!)
meetingRouter.post('/:id/end-occurrence', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { occurrenceId } = req.body || {};
    const result = await meetingService.endOccurrence(user.id, id, occurrenceId);

    res.json({
      meeting: sanitizeMeeting(result.meeting),
      endedOccurrence: result.endedOccurrence ? sanitizeOccurrence(result.endedOccurrence) : null,
      nextOccurrence: result.nextOccurrence ? sanitizeOccurrence(result.nextOccurrence) : null,
    });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({
      error: err.message || 'Failed to end occurrence',
      code: err.code || 'END_OCCURRENCE_FAILED',
    });
  }
});

// POST /api/meetings/:id/end-series - End active session + cancel all future occurrences + invalidate link
meetingRouter.post('/:id/end-series', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updated = await meetingService.endSeries(user.id, id);

    res.json({ meeting: sanitizeMeeting(updated) });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({
      error: err.message || 'Failed to end meeting series',
      code: err.code || 'END_SERIES_FAILED',
    });
  }
});

// POST /api/meetings/:id/end - Backward-compatible alias for end-occurrence
meetingRouter.post('/:id/end', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await meetingService.endOccurrence(user.id, id);

    res.json({
      meeting: sanitizeMeeting(result.meeting),
      endedOccurrence: result.endedOccurrence ? sanitizeOccurrence(result.endedOccurrence) : null,
      nextOccurrence: result.nextOccurrence ? sanitizeOccurrence(result.nextOccurrence) : null,
    });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ error: err.message || 'Failed to end meeting' });
  }
});

// POST /api/meetings/:id/cancel - Cancel occurrence or entire series
meetingRouter.post('/:id/cancel', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { scope, occurrenceId } = req.body || {};

    const success = await meetingService.cancelMeeting(user.id, id, scope, occurrenceId);
    res.json({ success });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to cancel meeting' });
  }
});

// POST /api/meetings/:id/occurrences/:occurrenceId/cancel - Cancel specific occurrence
meetingRouter.post('/:id/occurrences/:occurrenceId/cancel', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const occurrenceId = Array.isArray(req.params.occurrenceId)
      ? req.params.occurrenceId[0]
      : req.params.occurrenceId;

    const cancelled = await meetingService.cancelOccurrence(user.id, id, occurrenceId);
    res.json({ occurrence: sanitizeOccurrence(cancelled) });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to cancel occurrence' });
  }
});

// GET /api/meetings/:id/calendar.ics - Export RFC 5545 ICS calendar file
meetingRouter.get('/:id/calendar.ics', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const origin = `${req.protocol}://${req.get('host') || 'faceonn.com'}`;

    const { meeting, invitees } = await meetingService.getMeetingById(user.id, id, origin);

    const icsContent = meetingCalendarService.generateIcs(meeting, {
      organizerName: user.name,
      organizerEmail: user.email,
      origin,
      invitees,
    });

    const safeTitle = meeting.title.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.ics"`);
    res.send(icsContent);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'Calendar invite not found' });
  }
});

// POST /api/meetings/:id/invitations & /invitees - Add invitations
const handleAddInvitations = async (req: AuthenticatedRequest, res: any) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { emails } = req.body || {};

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Emails list is required' });
    }

    const invitees = await meetingService.addInvitations(user.id, id, emails);
    res.status(201).json({ invitees });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to add invitations' });
  }
};
meetingRouter.post('/:id/invitations', handleAddInvitations);
meetingRouter.post('/:id/invitees', handleAddInvitations);

// DELETE /api/meetings/:id/invitations/:invitationId & /invitees/:inviteeId
const handleRemoveInvitation = async (req: AuthenticatedRequest, res: any) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const invitationId =
      (Array.isArray(req.params.invitationId) ? req.params.invitationId[0] : req.params.invitationId) ||
      (Array.isArray(req.params.inviteeId) ? req.params.inviteeId[0] : req.params.inviteeId);

    const removed = await meetingService.removeInvitation(user.id, id, invitationId);
    res.json({ success: removed });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to remove invitation' });
  }
};
meetingRouter.delete('/:id/invitations/:invitationId', handleRemoveInvitation);
meetingRouter.delete('/:id/invitees/:inviteeId', handleRemoveInvitation);

// GET /api/meetings/:roomId/token - Get meeting authorization & occurrence-scoped Jitsi JWT
meetingRouter.get('/:roomId/token', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
    const passcode = (req.query.passcode as string) || (req.headers['x-meeting-passcode'] as string);
    const allowHostAutoStart = req.query.autoStart !== 'false';
    const occurrenceId = typeof req.query.occurrenceId === 'string' ? req.query.occurrenceId : undefined;

    const { meeting, occurrence, session, token, role } = await meetingService.getMeetingOrJoin(
      user.id,
      roomId,
      passcode,
      { allowHostAutoStart, occurrenceId }
    );

    res.json({
      meeting: sanitizeMeeting(meeting),
      occurrence: sanitizeOccurrence(occurrence),
      session: sanitizeSession(session),
      token,
      role,
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 403;
    res.status(statusCode).json({
      error: err.message || 'Failed to authorize meeting',
      code: err.code || 'AUTHORIZATION_FAILED',
    });
  }
});

// POST /api/meetings/:roomId/join - Join meeting endpoint
meetingRouter.post('/:roomId/join', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
    const { passcode, allowHostAutoStart, occurrenceId } = req.body || {};

    const { meeting, occurrence, session, token, role } = await meetingService.getMeetingOrJoin(
      user.id,
      roomId,
      passcode,
      { allowHostAutoStart: allowHostAutoStart !== false, occurrenceId }
    );

    res.json({
      meeting: sanitizeMeeting(meeting),
      occurrence: sanitizeOccurrence(occurrence),
      session: sanitizeSession(session),
      token,
      role,
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 403;
    res.status(statusCode).json({
      error: err.message || 'Failed to join meeting',
      code: err.code || 'AUTHORIZATION_FAILED',
    });
  }
});

// POST /api/meetings/:roomId/occurrences/:occurrenceId/join - Join specific occurrence
meetingRouter.post('/:roomId/occurrences/:occurrenceId/join', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
    const occurrenceId = Array.isArray(req.params.occurrenceId)
      ? req.params.occurrenceId[0]
      : req.params.occurrenceId;
    const { passcode, allowHostAutoStart } = req.body || {};

    const { meeting, occurrence, session, token, role } = await meetingService.getMeetingOrJoin(
      user.id,
      roomId,
      passcode,
      { allowHostAutoStart: allowHostAutoStart !== false, occurrenceId }
    );

    res.json({
      meeting: sanitizeMeeting(meeting),
      occurrence: sanitizeOccurrence(occurrence),
      session: sanitizeSession(session),
      token,
      role,
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 403;
    res.status(statusCode).json({
      error: err.message || 'Failed to join occurrence',
      code: err.code || 'AUTHORIZATION_FAILED',
    });
  }
});
