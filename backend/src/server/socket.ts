import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { registerSignalingHandlers } from '../signaling/handler';
import { verifyAccessToken } from '../auth/tokens';
import { userRepository } from '../db/repositories/user-repository';
import { UserRecord } from '../db/types';

export interface AuthenticatedSocket extends Socket {
  data: {
    user: UserRecord;
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
      next(new Error(`Authentication error: ${err.message || 'Invalid token'}`));
    }
  });

  registerSignalingHandlers(io);

  return io;
}
