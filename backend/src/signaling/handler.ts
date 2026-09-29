import { Server as SocketServer, Socket } from 'socket.io';

export function registerSignalingHandlers(io: SocketServer) {
  io.on('connection', (socket: Socket) => {
    console.log(`[Signaling] New client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`[Signaling] Client disconnected: ${socket.id}`);
    });

    // TODO: Implement mediasoup WebRTC signaling
    socket.on('room:join', ({ roomId, displayName }) => {
      socket.join(roomId);
      console.log(`[Room] ${displayName} joined ${roomId}`);
      
      socket.emit('room:joined', {
        roomId,
        participants: [] // TODO: Return active participants
      });
    });
  });
}
