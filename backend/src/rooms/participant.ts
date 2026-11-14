import { types } from 'mediasoup';

export class Participant {
  public id: string;
  public socketId: string;
  public displayName: string;

  // Mediasoup Transports
  public sendTransport: types.WebRtcTransport | null = null;
  public recvTransport: types.WebRtcTransport | null = null;

  // Track the audio/video this participant is sending to the server
  public producers: Map<string, types.Producer> = new Map();
  // Track the audio/video this participant is receiving from others
  public consumers: Map<string, types.Consumer> = new Map();

  constructor(id: string, socketId: string, displayName: string) {
    this.id = id;
    this.socketId = socketId;
    this.displayName = displayName;
  }

  public addTransport(transport: types.WebRtcTransport, direction: 'send' | 'recv') {
    if (direction === 'send') {
      this.sendTransport = transport;
    } else {
      this.recvTransport = transport;
    }
  }

  public addProducer(producer: types.Producer) {
    this.producers.set(producer.id, producer);
  }

  public addConsumer(consumer: types.Consumer) {
    this.consumers.set(consumer.id, consumer);
  }

  // Clean up all WebRTC resources when participant leaves
  public close() {
    this.producers.forEach(producer => producer.close());
    this.consumers.forEach(consumer => consumer.close());
    this.sendTransport?.close();
    this.recvTransport?.close();
  }
}
