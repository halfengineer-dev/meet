import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createHttpServer } from '../src/server/http';
import { userRepository } from '../src/db/repositories/user-repository';
import { sessionRepository } from '../src/db/repositories/session-repository';
import { meetingRepository } from '../src/db/repositories/meeting-repository';

describe('Meeting Authorization API', () => {
  const app = createHttpServer();

  let userA: { token: string; id: string; email: string };
  let userB: { token: string; id: string; email: string };

  beforeEach(async () => {
    await meetingRepository.clearAll();
    await sessionRepository.clearAll();
    await userRepository.clearAll();

    // Register User A (Meeting Host)
    const resA = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'User A',
        email: 'userA@example.com',
        password: 'Password123!',
      });
    userA = { token: resA.body.accessToken, id: resA.body.user.id, email: resA.body.user.email };

    // Register User B (Attendee)
    const resB = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'User B',
        email: 'userB@example.com',
        password: 'Password123!',
      });
    userB = { token: resB.body.accessToken, id: resB.body.user.id, email: resB.body.user.email };
  });

  describe('Meeting Creation: POST /api/meetings', () => {
    it('rejects meeting creation without authentication (returns 401)', async () => {
      const res = await request(app)
        .post('/api/meetings')
        .send({ title: 'Unauthenticated Meeting' });

      expect(res.status).toBe(401);
    });

    it('rejects meeting creation with invalid token (returns 401)', async () => {
      const res = await request(app)
        .post('/api/meetings')
        .set('Authorization', 'Bearer invalid-token')
        .send({ title: 'Invalid Token Meeting' });

      expect(res.status).toBe(401);
    });

    it('creates meeting for authenticated user with server-derived ownerId and moderator Jitsi JWT', async () => {
      const res = await request(app)
        .post('/api/meetings')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ title: 'Faceonn Sprint Review' });

      expect(res.status).toBe(201);
      expect(res.body.meeting).toBeDefined();
      expect(res.body.meeting.title).toBe('Faceonn Sprint Review');
      expect(res.body.meeting.ownerId).toBe(userA.id); // Derived server-side!
      expect(res.body.role).toBe('owner');
      expect(res.body.token).toBeDefined();

      // Inspect decoded Jitsi JWT token
      const decoded: any = jwt.decode(res.body.token);
      expect(decoded.room).toBe(res.body.meeting.roomId);
      expect(decoded.context.user.id).toBe(userA.id);
      expect(decoded.context.user.moderator).toBe(true); // Host is moderator!
    });

    it('ignores client-supplied ownerId and strictly enforces authenticated session identity', async () => {
      const res = await request(app)
        .post('/api/meetings')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({
          title: 'Spoof Attempt Meeting',
          ownerId: userA.id, // Client tries to spoof User A as owner
        });

      expect(res.status).toBe(201);
      expect(res.body.meeting.ownerId).toBe(userB.id); // Server forces userB!
      expect(res.body.meeting.ownerId).not.toBe(userA.id);
    });
  });

  describe('Meeting Joining & Jitsi Token Acquisition', () => {
    let meetingRoomId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/meetings')
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ title: 'Faceonn Team Call' });
      meetingRoomId = res.body.meeting.roomId;
    });

    it('rejects joining or token request without authentication (returns 401)', async () => {
      const res = await request(app)
        .get(`/api/meetings/${meetingRoomId}/token`);

      expect(res.status).toBe(401);
    });

    it('authorizes host with moderator privileges in Jitsi JWT', async () => {
      const res = await request(app)
        .get(`/api/meetings/${meetingRoomId}/token`)
        .set('Authorization', `Bearer ${userA.token}`);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('owner');

      const decoded: any = jwt.decode(res.body.token);
      expect(decoded.context.user.moderator).toBe(true);
    });

    it('authorizes regular participant with participant role and non-moderator Jitsi JWT', async () => {
      const res = await request(app)
        .get(`/api/meetings/${meetingRoomId}/token`)
        .set('Authorization', `Bearer ${userB.token}`);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('participant');

      const decoded: any = jwt.decode(res.body.token);
      expect(decoded.context.user.id).toBe(userB.id);
      expect(decoded.context.user.moderator).toBe(false); // User B is not moderator!
    });

    it('lists only meetings owned by or joined by the authenticated user', async () => {
      const resA = await request(app)
        .get('/api/meetings')
        .set('Authorization', `Bearer ${userA.token}`);

      expect(resA.status).toBe(200);
      expect(resA.body.meetings.length).toBe(1);
      expect(resA.body.meetings[0].roomId).toBe(meetingRoomId);

      // User B hasn't joined yet
      const resB = await request(app)
        .get('/api/meetings')
        .set('Authorization', `Bearer ${userB.token}`);

      expect(resB.status).toBe(200);
      expect(resB.body.meetings.length).toBe(0);
    });
  });
});
