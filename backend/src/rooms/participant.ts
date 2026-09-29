import { Consumer, Producer, WebRtcTransport } from 'mediasoup/node/lib/types';

export class Participant {
  public id: string;
  public socketId: string;
  public displayName: string;

  // Mediasoup Transports
  public sendTransport: WebRtcTransport | null = null;
  public recvTransport: WebRtcTransport | null = null;

  // Track the audio/video this participant is sending to the server
  public producers: Map<string, Producer> = new Map();
  // Track the audio/video this participant is receiving from others
  public consumers: Map<string, Consumer> = new Map();

  constructor(id: string, socketId: string, displayName: string) {
    this.id = id;
    this.socketId = socketId;
    this.displayName = displayName;
  }

  public addTransport(transport: WebRtcTransport, direction: 'send' | 'recv') {
    if (direction === 'send') {
      this.sendTransport = transport;
    } else {
      this.recvTransport = transport;
    }
  }

  public addProducer(producer: Producer) {
    this.producers.set(producer.id, producer);
  }

  public addConsumer(consumer: Consumer) {
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
