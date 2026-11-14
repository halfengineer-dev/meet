import * as mediasoup from 'mediasoup';
import os from 'os';

// Array to hold the workers
const workers: mediasoup.types.Worker[] = [];
let nextWorkerIdx = 0;

export async function createWorkers() {
  const numWorkers = Math.max(1, os.cpus().length); // One worker per CPU core
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
    });

    workers.push(worker);
  }

  console.log('[Media] mediasoup Workers initialized successfully');
}

// Simple round-robin algorithm to distribute rooms across CPU cores
export function getNextWorker(): mediasoup.types.Worker {
  if (workers.length === 0) {
    throw new Error('No mediasoup workers available');
  }
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}
