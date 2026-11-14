import { types } from 'mediasoup';
import { mediaCodecs } from './codecs';

/**
 * A Router corresponds to a Room. 
 * It defines what codecs the room supports and routes media between transports.
 */
export async function createRouter(worker: types.Worker): Promise<types.Router> {
  const router = await worker.createRouter({ mediaCodecs });
  
  return router;
}
