import { Router } from 'mediasoup/node/lib/Router';
import { Worker } from 'mediasoup/node/lib/Worker';
import { mediaCodecs } from './codecs';

/**
 * A Router corresponds to a Room. 
 * It defines what codecs the room supports and routes media between transports.
 */
export async function createRouter(worker: Worker): Promise<Router> {
  const router = await worker.createRouter({ mediaCodecs });
  
  return router;
}
