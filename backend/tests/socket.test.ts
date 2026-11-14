import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createHttpServer } from '../src/server/http';
import { createSocketServer } from '../src/server/socket';
import { authService } from '../src/auth/auth-service';
import { userRepository } from '../src/db/repositories/user-repository';
import { sessionRepository } from '../src/db/repositories/session-repository';
import { meetingRepository } from '../src/db/repositories/meeting-repository';

describe('Socket.IO Signaling Authentication & Authorization', () => {
  let server: http.Server;
  let port: number;
  let validToken: string;
  let userId: string;

  beforeAll(async () => {
    const app = createHttpServer();
    server = http.createServer(app);
    createSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as any;
        port = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await meetingRepository.clearAll();
    await sessionRepository.clearAll();
    await userRepository.clearAll();

    const reg = await authService.register('Test User', 'sockettest@example.com', 'Password123!');
    validToken = reg.accessToken;
    userId = reg.user.id;
  });

  it('rejects connection without authentication token', async () => {
    const client = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: false,
    });

    const errorPromise = new Promise<string>((resolve) => {
      client.on('connect_error', (err) => resolve(err.message));
    });

    client.connect();
    const errorMsg = await errorPromise;
    client.disconnect();

    expect(errorMsg).toMatch(/token required|authentication error/i);
  });

  it('rejects connection with invalid token', async () => {
    const client = Client(`http://localhost:${port}`, {
      auth: { token: 'invalid.bearer.token' },
      transports: ['websocket'],
      autoConnect: false,
    });

    const errorPromise = new Promise<string>((resolve) => {
      client.on('connect_error', (err) => resolve(err.message));
    });

    client.connect();
    const errorMsg = await errorPromise;
    client.disconnect();

    expect(errorMsg).toMatch(/authentication error/i);
  });

  it('successfully connects with valid access token', async () => {
    const client = Client(`http://localhost:${port}`, {
      auth: { token: validToken },
      transports: ['websocket'],
      autoConnect: false,
    });

    const connectPromise = new Promise<boolean>((resolve) => {
      client.on('connect', () => resolve(true));
    });

    client.connect();
    const connected = await connectPromise;
    expect(connected).toBe(true);

    client.disconnect();
  });
});

