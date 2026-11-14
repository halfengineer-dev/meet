import http from 'http';
import dotenv from 'dotenv';
import { createHttpServer } from './server/http';
import { createSocketServer } from './server/socket';
import { createWorkers } from './media/worker-manager';
import { initDatabase } from './db/database';

dotenv.config();

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  console.log('🚀 Starting Faceonn Custom Backend...');

  // 1. Initialize Database & Migrations
  await initDatabase();

  // 2. Initialize Express
  const app = createHttpServer();
  const httpServer = http.createServer(app);

  // 3. Initialize Authenticated Socket.io Signaling
  createSocketServer(httpServer);

  // 4. Initialize Mediasoup Workers (skip if in pure test mode)
  if (process.env.NODE_ENV !== 'test') {
    try {
      await createWorkers();
    } catch (err) {
      console.warn('⚠️ Mediasoup workers failed to initialize (continuing with HTTP/Signaling):', err);
    }
  }

  httpServer.listen(PORT, () => {
    console.log(`✅ Faceonn Backend is running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
