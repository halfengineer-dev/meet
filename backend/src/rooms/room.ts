import { Router } from 'mediasoup/node/lib/Router';
import { Participant } from './participant';

export class Room {
  public id: string;
  public router: Router;
  private participants: Map<string, Participant> = new Map();

  constructor(id: string, router: Router) {
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

  public close() {
    this.router.close();
  }
}
