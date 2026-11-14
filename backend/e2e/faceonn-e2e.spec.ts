process.env.NODE_ENV = 'test';

import { test, expect } from '@playwright/test';
import http from 'http';
import { createHttpServer } from '../src/server/http';
import { createSocketServer } from '../src/server/socket';
import { userRepository } from '../src/db/repositories/user-repository';
import { sessionRepository } from '../src/db/repositories/session-repository';
import { meetingRepository } from '../src/db/repositories/meeting-repository';
import { io as Client } from 'socket.io-client';
import jwt from 'jsonwebtoken';

let server: http.Server;
let port: number;
let baseUrl: string;

test.beforeAll(async () => {
  const app = createHttpServer();
  server = http.createServer(app);
  createSocketServer(server);

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address() as any;
      port = addr.port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(async () => {
  await meetingRepository.clearAll();
  await sessionRepository.clearAll();
  await userRepository.clearAll();
});

test.describe('Scenario A: New User Registration', () => {
  test('creates new account with valid details and returns safe user information and tokens', async ({ request }) => {
    const res = await request.post(`${baseUrl}/api/auth/register`, {
      data: {
        name: 'Sarah Connor',
        email: 'sarah@example.com',
        password: 'Password123!',
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.user.email).toBe('sarah@example.com');
    expect(body.user.name).toBe('Sarah Connor');
    expect(body.user.password_hash).toBeUndefined();
    expect(body.accessToken).toBeDefined();

    // Verify session was established
    const cookies = res.headers()['set-cookie'];
    expect(cookies).toContain('faceonn_refresh_token');
  });

  test('rejects duplicate email registrations', async ({ request }) => {
    await request.post(`${baseUrl}/api/auth/register`, {
      data: { name: 'Sarah', email: 'sarah@example.com', password: 'Password123!' },
    });

    const res = await request.post(`${baseUrl}/api/auth/register`, {
      data: { name: 'Sarah Again', email: 'sarah@example.com', password: 'Password123!' },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });
});

test.describe('Scenario B: Existing User Login & Authentication', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${baseUrl}/api/auth/register`, {
      data: { name: 'Alex Murphy', email: 'alex@example.com', password: 'RoboPassword123!' },
    });
  });

  test('successfully logs in with registered credentials and updates last login', async ({ request }) => {
    const res = await request.post(`${baseUrl}/api/auth/login`, {
      data: { email: 'alex@example.com', password: 'RoboPassword123!' },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe('alex@example.com');
    expect(body.accessToken).toBeDefined();

    // Verify authenticated access to /api/auth/me
    const meRes = await request.get(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${body.accessToken}` },
    });
    expect(meRes.status()).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.user.email).toBe('alex@example.com');
  });

  test('rejects login with incorrect password with safe generic error', async ({ request }) => {
    const res = await request.post(`${baseUrl}/api/auth/login`, {
      data: { email: 'alex@example.com', password: 'WrongPassword123!' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid email or password');
  });
});

test.describe('Scenario C: Protected Meeting Creation', () => {
  test('unauthenticated meeting creation is blocked (401)', async ({ request }) => {
    const res = await request.post(`${baseUrl}/api/meetings`, {
      data: { title: 'Secret Executive Sync' },
    });
    expect(res.status()).toBe(401);
  });

  test('authenticated user can create a meeting with server-derived ownership', async ({ request }) => {
    // Register host
    const regRes = await request.post(`${baseUrl}/api/auth/register`, {
      data: { name: 'Meeting Host', email: 'host@example.com', password: 'HostPassword123!' },
    });
    const { accessToken, user } = await regRes.json();

    // Create meeting
    const meetRes = await request.post(`${baseUrl}/api/meetings`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { title: 'Product Launch Planning' },
    });

    expect(meetRes.status()).toBe(201);
    const meetBody = await meetRes.json();
    expect(meetBody.meeting.title).toBe('Product Launch Planning');
    expect(meetBody.meeting.ownerId).toBe(user.id); // Derived server-side!
    expect(meetBody.role).toBe('owner');
    expect(meetBody.token).toBeDefined();

    // Verify Jitsi token has moderator: true
    const decoded: any = jwt.decode(meetBody.token);
    expect(decoded.context.user.moderator).toBe(true);
  });
});

test.describe('Scenario D: Protected Meeting Joining & Role Assignment', () => {
  let roomId: string;
  let hostToken: string;
  let attendeeToken: string;
  let attendeeId: string;

  test.beforeEach(async ({ request }) => {
    // Host registers and creates meeting
    const hostReg = await request.post(`${baseUrl}/api/auth/register`, {
      data: { name: 'Host User', email: 'host@example.com', password: 'Password123!' },
    });
    const hostData = await hostReg.json();
    hostToken = hostData.accessToken;

    const createRes = await request.post(`${baseUrl}/api/meetings`, {
      headers: { Authorization: `Bearer ${hostToken}` },
      data: { title: 'All Hands' },
    });
    const createData = await createRes.json();
    roomId = createData.meeting.roomId;

    // Attendee registers
    const attReg = await request.post(`${baseUrl}/api/auth/register`, {
      data: { name: 'Attendee User', email: 'attendee@example.com', password: 'Password123!' },
    });
    const attData = await attReg.json();
    attendeeToken = attData.accessToken;
    attendeeId = attData.user.id;
  });

  test('unauthenticated meeting join or token request is blocked (401)', async ({ request }) => {
    const res = await request.get(`${baseUrl}/api/meetings/${roomId}/token`);
    expect(res.status()).toBe(401);
  });

  test('attendee joins with participant role and non-moderator conference token', async ({ request }) => {
    const res = await request.get(`${baseUrl}/api/meetings/${roomId}/token`, {
      headers: { Authorization: `Bearer ${attendeeToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('participant');

    const decoded: any = jwt.decode(body.token);
    expect(decoded.context.user.id).toBe(attendeeId);
    expect(decoded.context.user.moderator).toBe(false);
  });
});

test.describe('Scenario E: Direct API Bypass & Socket.IO Security', () => {
  test('direct Socket.IO connection without token is rejected', async () => {
    const client = Client(baseUrl, {
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

  test('direct Socket.IO connection with forged token is rejected', async () => {
    const client = Client(baseUrl, {
      auth: { token: 'forged.fake.token' },
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

  test('direct REST call without token cannot create or join rooms', async ({ request }) => {
    const createRes = await request.post(`${baseUrl}/api/meetings`, { data: {} });
    expect(createRes.status()).toBe(401);

    const joinRes = await request.post(`${baseUrl}/api/meetings/fake-room/join`, { data: {} });
    expect(joinRes.status()).toBe(401);
  });
});

test.describe('Scenario F: Session Persistence & Revocation', () => {
  test('session persists across refresh, rotates token, and terminates on logout', async ({ request }) => {
    const regRes = await request.post(`${baseUrl}/api/auth/register`, {
      data: { name: 'Persistent User', email: 'persist@example.com', password: 'Password123!' },
    });
    expect(regRes.status()).toBe(201);

    const cookieHeader = regRes.headers()['set-cookie'];
    expect(cookieHeader).toBeDefined();

    // Refresh session using cookie
    const refreshRes = await request.post(`${baseUrl}/api/auth/refresh`, {
      headers: { Cookie: cookieHeader },
    });
    expect(refreshRes.status()).toBe(200);
    const refreshData = await refreshRes.json();
    expect(refreshData.accessToken).toBeDefined();

    const newCookieHeader = refreshRes.headers()['set-cookie'];
    expect(newCookieHeader).toBeDefined();

    // Logout
    const logoutRes = await request.post(`${baseUrl}/api/auth/logout`, {
      headers: { Cookie: newCookieHeader },
    });
    expect(logoutRes.status()).toBe(200);

    // Subsequent refresh fails
    const failRefresh = await request.post(`${baseUrl}/api/auth/refresh`, {
      headers: { Cookie: newCookieHeader },
    });
    expect(failRefresh.status()).toBe(401);
  });
});
