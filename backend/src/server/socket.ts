import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { registerSignalingHandlers } from '../signaling/handler';

export function createSocketServer(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: '*', // We'll restrict this in production
      methods: ['GET', 'POST']
    }
  });

  registerSignalingHandlers(io);

  return io;
}
