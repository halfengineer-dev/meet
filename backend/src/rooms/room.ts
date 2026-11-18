import { types } from 'mediasoup';
import { Participant } from './participant';

export class Room {
  public id: string;
  public router: types.Router;
  private participants: Map<string, Participant> = new Map();

  constructor(id: string, router: types.Router) {
    this.id = id;
    this.router = router;
  }

  public addParticipant(participant: Participant) {
    this.participants.set(participant.socketId, participant);
  }

  public getParticipant(socketId: string): Participant | undefined {
    return this.participants.get(socketId);
  }

  public removeParticipant(socketId: string) {
    const participant = this.participants.get(socketId);
    if (participant) {
      participant.close();
      this.participants.delete(socketId);
    }
  }

  public getParticipantList() {
    return Array.from(this.participants.values()).map(p => ({
      id: p.id,
      displayName: p.displayName
    }));
  }

  // Returns all producers from all OTHER participants in the room
  public getOtherProducers(excludeSocketId: string) {
    const producers: { producerId: string; participantId: string }[] = [];
    
    this.participants.forEach(participant => {
      if (participant.socketId !== excludeSocketId) {
        participant.producers.forEach(producer => {
          producers.push({
            producerId: producer.id,
            participantId: participant.id
          });
        });
      }
    });

    return producers;
  }

  public get isEmpty(): boolean {
    return this.participants.size === 0;
  }

  public getTelemetry() {
    let transports = 0;
    let producers = 0;
    let consumers = 0;
    let audioProducers = 0;
    let videoProducers = 0;

    this.participants.forEach((p) => {
      if (p.sendTransport) transports += 1;
      if (p.recvTransport) transports += 1;
      producers += p.producers.size;
      consumers += p.consumers.size;
      p.producers.forEach((prod) => {
        if (prod.kind === 'audio') audioProducers += 1;
        if (prod.kind === 'video') videoProducers += 1;
      });
    });

    return {
      roomId: this.id,
      routerId: this.router.id,
      routerClosed: this.router.closed,
      participantCount: this.participants.size,
      participants: this.getParticipantList(),
      transports,
      producers,
      consumers,
      audioProducers,
      videoProducers,
    };
  }

  public close() {
    this.router.close();
  }
}
