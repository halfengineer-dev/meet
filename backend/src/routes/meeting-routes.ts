import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../auth/middleware';
import { meetingService } from '../meetings/meeting-service';

export const meetingRouter = Router();

// Protect ALL meeting routes with requireAuth
meetingRouter.use(requireAuth);

// POST /api/meetings - Create a meeting
meetingRouter.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { title } = req.body;

    const { meeting, token, role } = await meetingService.createMeeting(user.id, title);

    res.status(201).json({
      meeting: {
        id: meeting.id,
        roomId: meeting.room_id,
        title: meeting.title,
        ownerId: meeting.owner_user_id,
        status: meeting.status,
        createdAt: meeting.created_at,
      },
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

    res.json({
      meetings: meetings.map(m => ({
        id: m.id,
        roomId: m.room_id,
        title: m.title,
        ownerId: m.owner_user_id,
        status: m.status,
        createdAt: m.created_at,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list meetings' });
  }
});

// GET /api/meetings/:roomId/token - Get meeting authorization & Jitsi JWT
meetingRouter.get('/:roomId/token', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;

    const { meeting, token, role } = await meetingService.getMeetingOrJoin(user.id, roomId);

    res.json({
      meeting: {
        id: meeting.id,
        roomId: meeting.room_id,
        title: meeting.title,
        ownerId: meeting.owner_user_id,
        status: meeting.status,
        createdAt: meeting.created_at,
      },
      token,
      role,
    });
  } catch (err: any) {
    res.status(403).json({ error: err.message || 'Failed to authorize meeting' });
  }
});

// POST /api/meetings/:roomId/join - Join meeting endpoint
meetingRouter.post('/:roomId/join', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;

    const { meeting, token, role } = await meetingService.getMeetingOrJoin(user.id, roomId);

    res.json({
      meeting: {
        id: meeting.id,
        roomId: meeting.room_id,
        title: meeting.title,
        ownerId: meeting.owner_user_id,
        status: meeting.status,
        createdAt: meeting.created_at,
      },
      token,
      role,
    });
  } catch (err: any) {
    res.status(403).json({ error: err.message || 'Failed to authorize meeting' });
  }
});
