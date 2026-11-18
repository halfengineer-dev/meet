import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { registerSignalingHandlers } from '../signaling/handler';
import { verifyAccessToken } from '../auth/tokens';
import { userRepository } from '../db/repositories/user-repository';
import { meetingRepository } from '../db/repositories/meeting-repository';
import { meetingEventBus } from '../meetings/meeting-events';
import { UserRecord } from '../db/types';
import { hasPermission, resolveAdminContext } from '../admin/rbac';

export interface AuthenticatedSocket extends Socket {
  data: {
    user: UserRecord;
  };
}

let activeSocketServer: SocketServer | null = null;
const socketStats = {
  totalConnections: 0,
  totalDisconnections: 0,
  totalEvents: 0,
  socketErrors: 0,
  recentEventTimestamps: [] as number[],
};

export function getSocketTelemetry() {
  const now = Date.now();
  socketStats.recentEventTimestamps = socketStats.recentEventTimestamps.filter((ts) => now - ts <= 60_000);
  const activeConnections = activeSocketServer ? activeSocketServer.engine.clientsCount : 0;

  return {
    initialized: Boolean(activeSocketServer),
    activeConnections,
    totalConnections: socketStats.totalConnections,
    totalDisconnections: socketStats.totalDisconnections,
    eventsPerMinute: socketStats.recentEventTimestamps.length,
    totalEvents: socketStats.totalEvents,
    socketErrors: socketStats.socketErrors,
    redisAdapterConfigured: Boolean(process.env.REDIS_URL && process.env.SOCKETIO_REDIS_ADAPTER === 'true'),
    nodeId: process.env.NODE_ID || process.env.HOSTNAME || 'primary-node',
  };
}

export function createSocketServer(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: '*', // Controlled by reverse proxy / CORS in production
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  activeSocketServer = io;

  // Socket.IO Handshake Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
      if (!authHeader) {
        return next(new Error('Authentication error: Token required'));
      }

      const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.substring(7).trim()
        : authHeader;

      const payload = verifyAccessToken(token);
      const user = await userRepository.findById(payload.sub);

      if (!user || user.status !== 'active') {
        return next(new Error('Authentication error: User account inactive or not found'));
      }

      // Attach verified identity directly to socket.data.user
      socket.data.user = user;
      next();
    } catch (err: any) {
      socketStats.socketErrors += 1;
      next(new Error(`Authentication error: ${err.message || 'Invalid token'}`));
    }
  });

  meetingEventBus.attachSocketServer(io);

  io.on('connection', (socket) => {
    socketStats.totalConnections += 1;

    socket.onAny(() => {
      socketStats.totalEvents += 1;
      socketStats.recentEventTimestamps.push(Date.now());
    });

    socket.on('error', () => {
      socketStats.socketErrors += 1;
    });

    socket.on('disconnect', () => {
      socketStats.totalDisconnections += 1;
    });

    socket.on('meeting:subscribe', async (roomId: string) => {
      if (!roomId || typeof roomId !== 'string') return;
      const normalized = roomId.toLowerCase().trim();
      const meeting = await meetingRepository.findByRoomId(normalized);
      if (!meeting || meeting.series_status === 'cancelled') return;
      socket.join(`meeting-lifecycle:${normalized}`);
    });

    socket.on('meeting:unsubscribe', (roomId: string) => {
      if (!roomId || typeof roomId !== 'string') return;
      socket.leave(`meeting-lifecycle:${roomId.toLowerCase().trim()}`);
    });

    // Authorized admin live-monitoring subscription (RBAC enforced server-side)
    socket.on('admin:live:subscribe', async (cb?: (res: { ok: boolean; error?: string }) => void) => {
      try {
        const user: UserRecord | undefined = socket.data.user;
        if (!user) {
          if (typeof cb === 'function') cb({ ok: false, error: 'Unauthenticated' });
          return;
        }
        const ctx = await resolveAdminContext(user);
        if (!ctx || !hasPermission(ctx, 'live:view')) {
          if (typeof cb === 'function') cb({ ok: false, error: 'Forbidden' });
          return;
        }
        socket.join('admin-live-monitoring');
        if (typeof cb === 'function') cb({ ok: true });
      } catch (err: any) {
        if (typeof cb === 'function') cb({ ok: false, error: err.message });
      }
    });

    socket.on('admin:live:unsubscribe', () => {
      socket.leave('admin-live-monitoring');
    });
  });

  registerSignalingHandlers(io);

  return io;
}
