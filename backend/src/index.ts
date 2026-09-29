import http from 'http';
import dotenv from 'dotenv';
import { createHttpServer } from './server/http';
import { createSocketServer } from './server/socket';
import { createWorkers } from './media/worker-manager';

dotenv.config();

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  console.log('🚀 Starting Fresh Call Custom Backend...');

  // 1. Initialize Express
  const app = createHttpServer();
  const httpServer = http.createServer(app);

  // 2. Initialize Socket.io Signaling
  createSocketServer(httpServer);

  // 3. Initialize Mediasoup Workers
  await createWorkers();

  httpServer.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
