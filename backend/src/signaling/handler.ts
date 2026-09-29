import { Server as SocketServer, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { roomManager } from '../rooms/room-manager';
import { Participant } from '../rooms/participant';
import { createWebRtcTransport } from '../media/transport-manager';

export function registerSignalingHandlers(io: SocketServer) {
  io.on('connection', (socket: Socket) => {
    console.log(`[Signaling] New client connected: ${socket.id}`);
    
    // Store current room to handle disconnects cleanly
    let currentRoomId: string | null = null;

    socket.on('disconnect', () => {
      console.log(`[Signaling] Client disconnected: ${socket.id}`);
      if (currentRoomId) {
        handleLeaveRoom(socket, currentRoomId);
      }
    });

    // --- ROOM EVENTS ---
    
    socket.on('room:join', async ({ roomId, displayName }, callback) => {
      try {
        currentRoomId = roomId;
        const room = await roomManager.getOrCreateRoom(roomId);
        
        // Create new participant
        const participantId = uuidv4();
        const participant = new Participant(participantId, socket.id, displayName);
        room.addParticipant(participant);

        // Join socket.io room for broadcasting
        socket.join(roomId);

        console.log(`[Room] ${displayName} joined ${roomId}`);

        // Notify others
        socket.to(roomId).emit('room:participant-joined', {
          id: participant.id,
          displayName: participant.displayName
        });

        // Send success back to the joining client
        callback({
          routerCapabilities: room.router.rtpCapabilities,
          participants: room.getParticipantList(),
          existingProducers: room.getOtherProducers(socket.id)
        });
      } catch (err: any) {
        console.error('Error joining room:', err);
        callback({ error: err.message });
      }
    });

    // --- MEDIA TRANSPORT EVENTS ---

    socket.on('media:create-transport', async ({ roomId, direction }, callback) => {
      try {
        const room = roomManager.getRoom(roomId);
        if (!room) throw new Error('Room not found');

        const participant = room.getParticipant(socket.id);
        if (!participant) throw new Error('Participant not found');

        const transport = await createWebRtcTransport(room.router);
        participant.addTransport(transport, direction);

        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters
        });
      } catch (err: any) {
        callback({ error: err.message });
      }
    });

    socket.on('media:connect-transport', async ({ roomId, transportId, dtlsParameters }, callback) => {
      try {
        const room = roomManager.getRoom(roomId);
        if (!room) throw new Error('Room not found');

        const participant = room.getParticipant(socket.id);
        if (!participant) throw new Error('Participant not found');

        const transport = transportId === participant.sendTransport?.id 
          ? participant.sendTransport 
          : participant.recvTransport;

        if (!transport) throw new Error('Transport not found');

        await transport.connect({ dtlsParameters });
        callback({ success: true });
      } catch (err: any) {
        callback({ error: err.message });
      }
    });

    // --- PRODUCE & CONSUME EVENTS ---

    socket.on('media:produce', async ({ roomId, kind, rtpParameters }, callback) => {
      try {
        const room = roomManager.getRoom(roomId);
        const participant = room?.getParticipant(socket.id);
        
        if (!room || !participant || !participant.sendTransport) {
          throw new Error('Invalid room or transport state');
        }

        const producer = await participant.sendTransport.produce({ kind, rtpParameters });
        participant.addProducer(producer);

        // Notify everyone else in the room that a new stream is available
        socket.to(roomId).emit('media:new-producer', {
          producerId: producer.id,
          participantId: participant.id,
          kind: producer.kind
        });

        callback({ id: producer.id });
      } catch (err: any) {
        callback({ error: err.message });
      }
    });

    socket.on('media:consume', async ({ roomId, producerId, rtpCapabilities }, callback) => {
      try {
        const room = roomManager.getRoom(roomId);
        const participant = room?.getParticipant(socket.id);

        if (!room || !participant || !participant.recvTransport) {
          throw new Error('Invalid room or transport state');
        }

        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
          throw new Error('Cannot consume this producer (codecs mismatch)');
        }

        const consumer = await participant.recvTransport.consume({
          producerId,
          rtpCapabilities,
          paused: true // Start paused according to mediasoup guidelines
        });

        participant.addConsumer(consumer);

        // We must listen to producer closing to close the consumer
        consumer.on('producerclose', () => {
          socket.emit('media:producer-closed', { producerId });
          participant.consumers.delete(consumer.id);
          consumer.close();
        });

        callback({
          id: consumer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          producerId: consumer.producerId
        });
      } catch (err: any) {
        callback({ error: err.message });
      }
    });

    socket.on('media:resume-consumer', async ({ roomId, consumerId }, callback) => {
      try {
        const room = roomManager.getRoom(roomId);
        const participant = room?.getParticipant(socket.id);
        const consumer = participant?.consumers.get(consumerId);

        if (consumer) {
          await consumer.resume();
          callback({ success: true });
        } else {
          throw new Error('Consumer not found');
        }
      } catch (err: any) {
        callback({ error: err.message });
      }
    });
  });

  // Helper to handle client leaving or disconnecting
  function handleLeaveRoom(socket: Socket, roomId: string) {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const participant = room.getParticipant(socket.id);
    if (participant) {
      const pId = participant.id;
      room.removeParticipant(socket.id);

      socket.to(roomId).emit('room:participant-left', { participantId: pId });

      if (room.isEmpty) {
        roomManager.removeRoom(roomId);
      }
    }
  }
}
