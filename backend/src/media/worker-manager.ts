import * as mediasoup from 'mediasoup';
import { Worker } from 'mediasoup/node/lib/Worker';
import os from 'os';

// Array to hold the workers
const workers: Worker[] = [];
let nextWorkerIdx = 0;

export async function createWorkers() {
  const numWorkers = os.cpus().length; // One worker per CPU core
  console.log(`[Media] Creating ${numWorkers} mediasoup Workers...`);

  const minPort = parseInt(process.env.MEDIASOUP_MIN_PORT || '10000', 10);
  const maxPort = parseInt(process.env.MEDIASOUP_MAX_PORT || '10100', 10);

  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      rtcMinPort: minPort,
      rtcMaxPort: maxPort,
      logLevel: 'warn',
    });

    worker.on('died', () => {
      console.error(`[Media] mediasoup Worker ${worker.pid} died! Restarting...`);
      // We could add logic to gracefully replace the worker here
    });

    workers.push(worker);
  }

  console.log('[Media] mediasoup Workers initialized successfully');
}

// Simple round-robin algorithm to distribute rooms across CPU cores
export function getNextWorker(): Worker {
  if (workers.length === 0) {
    throw new Error('No mediasoup workers available');
  }
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}
