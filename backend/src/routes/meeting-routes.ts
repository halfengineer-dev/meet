import { Router } from 'express';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../auth/middleware';
import { meetingService } from '../meetings/meeting-service';
import { meetingCalendarService } from '../meetings/meeting-calendar-service';
import { MeetingRecord } from '../db/types';

export const meetingRouter = Router();

// Public/optional-auth room status endpoint (used by Zoom-style waiting screen before entering conference)
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

function sanitizeMeeting(m: MeetingRecord) {
  return {
    id: m.id,
    roomId: m.room_id,
    title: m.title,
    ownerId: m.owner_user_id,
    status: m.status,
    scheduledAt: m.scheduled_at ? m.scheduled_at.toISOString() : null,
    durationMinutes: m.duration_minutes,
    timezone: m.timezone,
    description: m.description,
    isScheduled: m.is_scheduled,
    meetingType: m.meeting_type,
    recurrenceSeriesId: m.recurrence_series_id,
    recurrenceRule: m.recurrence_rule,
    recurrenceEndAt: m.recurrence_end_at ? m.recurrence_end_at.toISOString() : null,
    settings: {
      passcodeEnabled: Boolean(m.settings.passcodeEnabled && m.passcode_hash),
      waitingRoomEnabled: m.settings.waitingRoomEnabled,
      joinBeforeHost: m.settings.joinBeforeHost,
      hostVideoEnabled: m.settings.hostVideoEnabled,
      participantVideoEnabled: m.settings.participantVideoEnabled,
      muteOnEntry: m.settings.muteOnEntry,
      allowScreenSharing: m.settings.allowScreenSharing,
      allowChat: m.settings.allowChat,
      allowReactions: m.settings.allowReactions,
      requireAuthentication: m.settings.requireAuthentication,
    },
    hasPasscode: Boolean(m.passcode_hash),
    createdAt: m.created_at.toISOString(),
    updatedAt: m.updated_at.toISOString(),
  };
}

// POST /api/meetings/schedule - Schedule a meeting
meetingRouter.post('/schedule', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const origin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    const result = await meetingService.scheduleMeeting(user.id, req.body, origin);

    res.status(201).json({
      meeting: sanitizeMeeting(result.meeting),
      invitees: result.invitees,
      token: result.token,
      roomUrl: result.roomUrl,
      googleCalendarUrl: result.googleCalendarUrl,
      outlookCalendarUrl: result.outlookCalendarUrl,
      icsUrl: result.icsUrl,
      invitationText: result.invitationText,
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
    const { title } = req.body;

    const { meeting, token, role } = await meetingService.createMeeting(user.id, title);

    res.status(201).json({
      meeting: sanitizeMeeting(meeting),
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

// GET /api/meetings/:id - Get meeting details
meetingRouter.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    // Guard against collision with other endpoints
    if (['upcoming', 'past', 'schedule'].includes(id)) {
      return next();
    }

    const origin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    const result = await meetingService.getMeetingById(user.id, id, origin);

    res.json({
      meeting: sanitizeMeeting(result.meeting),
      invitees: result.invitees,
      isOwner: result.isOwner,
      googleCalendarUrl: result.googleCalendarUrl,
      outlookCalendarUrl: result.outlookCalendarUrl,
      icsUrl: result.icsUrl,
      invitationText: result.invitationText,
    });
  } catch (err: any) {
    res.status(err.message === 'Meeting not found' ? 404 : 403).json({ error: err.message });
  }
});

// PATCH /api/meetings/:id - Update scheduled meeting
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

// POST /api/meetings/:id/cancel - Cancel meeting
meetingRouter.post('/:id/cancel', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { scope } = req.body || {};

    const success = await meetingService.cancelMeeting(user.id, id, scope);
    res.json({ success });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to cancel meeting' });
  }
});

// POST /api/meetings/:id/start - Host starts scheduled meeting
meetingRouter.post('/:id/start', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await meetingService.startMeeting(user.id, id);

    res.json({
      meeting: sanitizeMeeting(result.meeting),
      token: result.token,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to start meeting' });
  }
});

// POST /api/meetings/:id/end - Host ends an active meeting
meetingRouter.post('/:id/end', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updated = await meetingService.endMeeting(user.id, id);

    res.json({
      meeting: sanitizeMeeting(updated),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to end meeting' });
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

// POST /api/meetings/:id/invitations - Add invitations
meetingRouter.post('/:id/invitations', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { emails } = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Emails list is required' });
    }

    const invitees = await meetingService.addInvitations(user.id, id, emails);
    res.status(201).json({ invitees });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to add invitations' });
  }
});

// DELETE /api/meetings/:id/invitations/:invitationId - Remove an invitation
meetingRouter.delete('/:id/invitations/:invitationId', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const invitationId = Array.isArray(req.params.invitationId)
      ? req.params.invitationId[0]
      : req.params.invitationId;

    const removed = await meetingService.removeInvitation(user.id, id, invitationId);
    res.json({ success: removed });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to remove invitation' });
  }
});

// GET /api/meetings/:roomId/token - Get meeting authorization & Jitsi JWT
meetingRouter.get('/:roomId/token', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
    const passcode = (req.query.passcode as string) || (req.headers['x-meeting-passcode'] as string);
    const allowHostAutoStart = req.query.autoStart !== 'false';

    const { meeting, token, role } = await meetingService.getMeetingOrJoin(user.id, roomId, passcode, {
      allowHostAutoStart,
    });

    res.json({
      meeting: sanitizeMeeting(meeting),
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
    const { passcode, allowHostAutoStart } = req.body || {};

    const { meeting, token, role } = await meetingService.getMeetingOrJoin(user.id, roomId, passcode, {
      allowHostAutoStart: allowHostAutoStart !== false,
    });

    res.json({
      meeting: sanitizeMeeting(meeting),
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
