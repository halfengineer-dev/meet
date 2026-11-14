import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createHttpServer } from '../src/server/http';
import { userRepository } from '../src/db/repositories/user-repository';
import { sessionRepository } from '../src/db/repositories/session-repository';
import { verifyAccessToken } from '../src/auth/tokens';

describe('Faceonn Authentication API', () => {
  const app = createHttpServer();

  beforeEach(async () => {
    await sessionRepository.clearAll();
    await userRepository.clearAll();
  });

  describe('Registration: POST /api/auth/register', () => {
    it('successfully registers a new user with valid details and sets HttpOnly refresh cookie', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'StrongPassword123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('jane@example.com');
      expect(res.body.user.name).toBe('Jane Doe');
      expect(res.body.user.password_hash).toBeUndefined(); // Never leak password hash
      expect(res.body.accessToken).toBeDefined();

      // Check access token payload
      const payload = verifyAccessToken(res.body.accessToken);
      expect(payload.email).toBe('jane@example.com');
      expect(payload.sub).toBe(res.body.user.id);

      // Verify HttpOnly refresh cookie was set
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const refreshCookie = (cookies as unknown as string[]).find(c => c.startsWith('faceonn_refresh_token='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
    });

    it('rejects registration with duplicate email regardless of case', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          name: 'First User',
          email: 'test@example.com',
          password: 'Password123!',
        });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Second User',
          email: 'TEST@EXAMPLE.COM',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already exists/i);
    });

    it('rejects registration with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Bad Email User',
          email: 'invalid-email-format',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/valid email/i);
    });

    it('rejects registration with weak passwords', async () => {
      // Too short
      let res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'short@example.com',
          password: 'pass',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least 8 characters/i);

      // Only letters
      res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'letters@example.com',
          password: 'onlylettersnopass',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least one letter and one number/i);
    });
  });

  describe('Login: POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'CorrectPassword123!',
        });
    });

    it('successfully logs in with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'john@example.com',
          password: 'CorrectPassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('john@example.com');
      expect(res.body.accessToken).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('rejects login with incorrect password with safe generic error', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'john@example.com',
          password: 'WrongPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('rejects login for nonexistent email with safe generic error', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'doesnotexist@example.com',
          password: 'SomePassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });
  });

  describe('Session Refresh & Token Rotation: POST /api/auth/refresh', () => {
    it('rotates refresh token and issues new access token', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Alice',
          email: 'alice@example.com',
          password: 'Password123!',
        });

      const initialCookies = regRes.headers['set-cookie'] as unknown as string[];
      const refreshCookie = initialCookies.find(c => c.startsWith('faceonn_refresh_token='));
      expect(refreshCookie).toBeDefined();

      // First refresh: should succeed and rotate cookie
      const refreshRes1 = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [refreshCookie!]);

      expect(refreshRes1.status).toBe(200);
      expect(refreshRes1.body.accessToken).toBeDefined();

      const newCookies = refreshRes1.headers['set-cookie'] as unknown as string[];
      const newRefreshCookie = newCookies.find(c => c.startsWith('faceonn_refresh_token='));
      expect(newRefreshCookie).toBeDefined();
      expect(newRefreshCookie).not.toBe(refreshCookie); // Token has rotated!

      // Token Reuse Detection: Attempting to use the OLD rotated token must fail and invalidate the session family
      const replayRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [refreshCookie!]);

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.error).toMatch(/reuse detected|invalid/i);

      // Because reuse was detected, even the new token should now be revoked!
      const subsequentRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [newRefreshCookie!]);

      expect(subsequentRes.status).toBe(401);
    });
  });

  describe('Logout: POST /api/auth/logout', () => {
    it('revokes session and clears the refresh cookie', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Bob',
          email: 'bob@example.com',
          password: 'Password123!',
        });

      const cookies = regRes.headers['set-cookie'] as unknown as string[];
      const refreshCookie = cookies.find(c => c.startsWith('faceonn_refresh_token='));

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [refreshCookie!]);

      expect(logoutRes.status).toBe(200);

      // Verify refresh cookie is cleared
      const setCookies = logoutRes.headers['set-cookie'] as unknown as string[];
      const clearedCookie = setCookies.find(c => c.startsWith('faceonn_refresh_token=;'));
      expect(clearedCookie).toBeDefined();

      // Subsequent refresh must fail
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [refreshCookie!]);

      expect(refreshRes.status).toBe(401);
    });
  });

  describe('Current User & Protected Endpoints: GET /api/auth/me', () => {
    it('returns 401 when no access token is provided', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns current user info when valid access token is provided', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Charlie',
          email: 'charlie@example.com',
          password: 'Password123!',
        });

      const token = regRes.body.accessToken;

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.email).toBe('charlie@example.com');
      expect(meRes.body.user.name).toBe('Charlie');
    });

    it('rejects access when token is tampered with', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.tampered.token');

      expect(res.status).toBe(401);
    });
  });
});

