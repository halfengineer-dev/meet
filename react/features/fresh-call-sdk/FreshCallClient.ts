import { io, Socket } from 'socket.io-client';
import { Device } from 'mediasoup-client';
import { Transport, Producer, Consumer } from 'mediasoup-client/lib/types';
import EventEmitter from 'events';

export class FreshCallClient extends EventEmitter {
  private socket: Socket;
  private device: Device;
  
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  
  public producers: Map<string, Producer> = new Map();
  public consumers: Map<string, Consumer> = new Map();
  
  public localParticipantId: string | null = null;
  public roomId: string | null = null;

  constructor(serverUrl: string) {
    super();
    this.device = new Device();
    
    // Connect to our new custom backend
    this.socket = io(serverUrl, {
      transports: ['websocket'],
      autoConnect: false
    });

    this.registerSocketEvents();
  }

  // --- PUBLIC API ---

  public async connectAndJoin(roomId: string, displayName: string): Promise<void> {
    this.roomId = roomId;
    this.socket.connect();

    return new Promise((resolve, reject) => {
      this.socket.on('connect', async () => {
        try {
          const result: any = await this.socketRequest('room:join', { roomId, displayName });
          
          // 1. Initialize our local WebRTC Device with the room's codec capabilities
          await this.device.load({ routerRtpCapabilities: result.routerCapabilities });
          
          // 2. Setup the physical connections (Transports)
          await this.initSendTransport();
          await this.initRecvTransport();

          // 3. Emit local events for the UI
          result.participants.forEach((p: any) => {
            this.emit('participantJoined', p);
          });

          // 4. Subscribe to existing streams
          for (const existingProducer of result.existingProducers) {
            await this.consume(existingProducer.producerId);
          }

          resolve();
        } catch (error) {
          reject(error);
        }
      });

      this.socket.on('connect_error', (error) => reject(error));
    });
  }

  // Called when the user turns on their mic or camera
  public async produce(track: MediaStreamTrack): Promise<Producer> {
    if (!this.sendTransport) {
      throw new Error('Send transport not initialized');
    }

    const producer = await this.sendTransport.produce({ track });
    this.producers.set(producer.id, producer);

    return producer;
  }

  // Called when the user leaves
  public leave() {
    this.socket.disconnect();
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.producers.forEach(p => p.close());
    this.consumers.forEach(c => c.close());
    
    this.emit('left');
  }

  // --- INTERNAL SIGNALING ---

  private registerSocketEvents() {
    this.socket.on('room:participant-joined', (participant) => {
      this.emit('participantJoined', participant);
    });

    this.socket.on('room:participant-left', ({ participantId }) => {
      this.emit('participantLeft', participantId);
    });

    this.socket.on('media:new-producer', async ({ producerId, participantId, kind }) => {
      // Automatically subscribe to the new stream
      const consumer = await this.consume(producerId);
      
      this.emit('trackAdded', {
        participantId,
        kind,
        track: consumer.track
      });
    });

    this.socket.on('media:producer-closed', ({ producerId }) => {
      // Find consumer mapped to this producer
      for (const [id, consumer] of this.consumers.entries()) {
        if (consumer.producerId === producerId) {
          consumer.close();
          this.consumers.delete(id);
          this.emit('trackRemoved', { track: consumer.track });
          break;
        }
      }
    });
  }

  private async initSendTransport() {
    const params: any = await this.socketRequest('media:create-transport', { 
      roomId: this.roomId, 
      direction: 'send' 
    });

    this.sendTransport = this.device.createSendTransport(params);

    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.socketRequest('media:connect-transport', {
          roomId: this.roomId,
          transportId: this.sendTransport!.id,
          dtlsParameters
        });
        callback();
      } catch (error: any) {
        errback(error);
      }
    });

    this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      try {
        const { id }: any = await this.socketRequest('media:produce', {
          roomId: this.roomId,
          kind,
          rtpParameters
        });
        callback({ id });
      } catch (error: any) {
        errback(error);
      }
    });
  }

  private async initRecvTransport() {
    const params: any = await this.socketRequest('media:create-transport', { 
      roomId: this.roomId, 
      direction: 'recv' 
    });

    this.recvTransport = this.device.createRecvTransport(params);

    this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.socketRequest('media:connect-transport', {
          roomId: this.roomId,
          transportId: this.recvTransport!.id,
          dtlsParameters
        });
        callback();
      } catch (error: any) {
        errback(error);
      }
    });
  }

  private async consume(producerId: string): Promise<Consumer> {
    if (!this.recvTransport) {
      throw new Error('Receive transport not initialized');
    }

    const { rtpCapabilities } = this.device;

    const params: any = await this.socketRequest('media:consume', {
      roomId: this.roomId,
      producerId,
      rtpCapabilities
    });

    const consumer = await this.recvTransport.consume({
      id: params.id,
      producerId: params.producerId,
      kind: params.kind,
      rtpParameters: params.rtpParameters
    });

    this.consumers.set(consumer.id, consumer);

    // Tell the server we're ready to start receiving data
    await this.socketRequest('media:resume-consumer', { 
      roomId: this.roomId, 
      consumerId: consumer.id 
    });

    return consumer;
  }

  // Promisify socket.emit
  private socketRequest(event: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.socket.emit(event, data, (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }
}
