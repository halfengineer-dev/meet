import { Server as SocketServer } from 'socket.io';

export interface MeetingLifecycleEventPayload {
  meetingId: string;
  roomId: string;
  occurrenceId?: string;
  sessionId?: string;
  status: string;
  timestamp: string;
}

class MeetingEventBus {
  private io: SocketServer | null = null;

  public attachSocketServer(io: SocketServer): void {
    this.io = io;
  }

  public emitOccurrenceStarted(payload: MeetingLifecycleEventPayload): void {
    this.broadcastToRoom(payload.roomId, 'meeting:occurrence:started', payload);
  }

  public emitOccurrenceEnded(payload: MeetingLifecycleEventPayload): void {
    this.broadcastToRoom(payload.roomId, 'meeting:occurrence:ended', payload);
  }

  public emitSeriesCancelled(payload: MeetingLifecycleEventPayload): void {
    this.broadcastToRoom(payload.roomId, 'meeting:series:cancelled', payload);
  }

  public emitParticipantJoined(payload: MeetingLifecycleEventPayload & { participantRole: string }): void {
    this.broadcastToRoom(payload.roomId, 'meeting:participant:joined', payload);
  }

  private broadcastToRoom(roomId: string, event: string, payload: unknown): void {
    if (!this.io) return;
    const channel = `meeting-lifecycle:${roomId.toLowerCase().trim()}`;
    this.io.to(channel).emit(event, payload);
    this.io.to('admin-live-monitoring').emit('admin:live:event', { event, payload });
  }
}

export const meetingEventBus = new MeetingEventBus();

