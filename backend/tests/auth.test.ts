import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createHttpServer } from '../src/server/http';
import { userRepository } from '../src/db/repositories/user-repository';
import { sessionRepository } from '../src/db/repositories/session-repository';
import { verifyAccessToken } from '../src/auth/tokens';
import { authService } from '../src/auth/auth-service';
import { hashPassword } from '../src/auth/password';

describe('Faceonn Authentication & Admin Onboarding API', () => {
  const app = createHttpServer();

  async function seedAdminAndLogin() {
    const password_hash = await hashPassword('AdminPass123!');
    await userRepository.createUser({
      name: 'Super Admin',
      email: 'admin@example.com',
      password_hash,
      role: 'admin',
      email_verified: true,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'AdminPass123!',
      });

    return {
      token: loginRes.body.accessToken as string,
      user: loginRes.body.user,
    };
  }

  beforeEach(async () => {
    await sessionRepository.clearAll();
    await userRepository.clearAll();
  });

  describe('Public Registration Disabled: POST /api/auth/register', () => {
    it('rejects public self-registration with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Random Person',
          email: 'random@example.com',
          password: 'StrongPassword123!',
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SIGNUP_DISABLED');
      expect(res.body.error).toMatch(/disabled/i);

      // Ensure user was NOT created
      const user = await userRepository.findByEmail('random@example.com');
      expect(user).toBeNull();
    });
  });

  describe('Admin Participant Onboarding: /api/admin/users', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'StrongPassword123!',
        });

      expect(res.status).toBe(401);
    });

    it('rejects non-admin users with 403', async () => {
      const { token: adminToken } = await seedAdminAndLogin();

      await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Regular User',
          email: 'regular@example.com',
          password: 'UserPass123!',
        });

      const userLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'regular@example.com',
          password: 'UserPass123!',
        });

      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${userLogin.body.accessToken}`)
        .send({
          name: 'Unauthorized Invite',
          email: 'unauth@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/administrator/i);
    });

    it('allows admin to onboard a new participant with custom password and lets them log in', async () => {
      const { token: adminToken } = await seedAdminAndLogin();

      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: 'StrongPassword123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('jane@example.com');
      expect(res.body.user.name).toBe('Jane Doe');
      expect(res.body.user.role).toBe('user');
      expect(res.body.user.password_hash).toBeUndefined();
      expect(res.body.temporaryPassword).toBeUndefined();

      // Newly onboarded participant can log in immediately
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'jane@example.com',
          password: 'StrongPassword123!',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user.role).toBe('user');
      const payload = verifyAccessToken(loginRes.body.accessToken);
      expect(payload.email).toBe('jane@example.com');
      expect(payload.role).toBe('user');
    });

    it('auto-generates a strong temporary password when admin omits password', async () => {
      const { token: adminToken } = await seedAdminAndLogin();

      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Auto Pass User',
          email: 'autopass@example.com',
        });

      expect(res.status).toBe(201);
      expect(res.body.temporaryPassword).toBeDefined();
      expect(res.body.temporaryPassword.length).toBeGreaterThanOrEqual(8);

      // Participant can log in using the generated temporary password
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'autopass@example.com',
          password: res.body.temporaryPassword,
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user.email).toBe('autopass@example.com');
    });

    it('rejects duplicate email, invalid email, and weak passwords during onboarding', async () => {
      const { token: adminToken } = await seedAdminAndLogin();

      await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'First User',
          email: 'test@example.com',
          password: 'Password123!',
        });

      let res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Second User',
          email: 'TEST@EXAMPLE.COM',
          password: 'Password123!',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already exists/i);

      res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Bad Email',
          email: 'invalid-email',
          password: 'Password123!',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/valid email/i);

      res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Weak Pass',
          email: 'weak@example.com',
          password: 'pass',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least 8 characters/i);
    });

    it('allows admin to list, update status/role, reset password, and delete participants', async () => {
      const { token: adminToken, user: adminUser } = await seedAdminAndLogin();

      const onboardRes = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Managed User',
          email: 'managed@example.com',
          password: 'Password123!',
        });
      const targetId = onboardRes.body.user.id;

      // List users
      const listRes = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.users.length).toBe(2);

      // Deactivate user
      const deactivateRes = await request(app)
        .patch(`/api/admin/users/${targetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'deactivated' });
      expect(deactivateRes.status).toBe(200);
      expect(deactivateRes.body.user.status).toBe('deactivated');

      // Deactivated user cannot log in
      const blockedLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'managed@example.com', password: 'Password123!' });
      expect(blockedLogin.status).toBe(401);

      // Admin cannot deactivate or delete themselves
      const selfDeactivate = await request(app)
        .patch(`/api/admin/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'deactivated' });
      expect(selfDeactivate.status).toBe(400);

      const selfDelete = await request(app)
        .delete(`/api/admin/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(selfDelete.status).toBe(400);

      // Delete target user
      const deleteRes = await request(app)
        .delete(`/api/admin/users/${targetId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deleteRes.status).toBe(200);
      expect(await userRepository.findById(targetId)).toBeNull();
    });
  });

  describe('Login: POST /api/auth/login', () => {
    beforeEach(async () => {
      await authService.onboardUserByAdmin({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'CorrectPassword123!',
      });
    });

    it('successfully logs in with correct credentials and sets HttpOnly refresh cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'john@example.com',
          password: 'CorrectPassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('john@example.com');
      expect(res.body.accessToken).toBeDefined();

      const cookies = res.headers['set-cookie'] as unknown as string[];
      const refreshCookie = cookies.find(c => c.startsWith('faceonn_refresh_token='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
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
      await authService.onboardUserByAdmin({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'Password123!',
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'alice@example.com',
          password: 'Password123!',
        });

      const initialCookies = loginRes.headers['set-cookie'] as unknown as string[];
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
      expect(newRefreshCookie).not.toBe(refreshCookie);

      // Token Reuse Detection
      const replayRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [refreshCookie!]);

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.error).toMatch(/reuse detected|invalid/i);

      const subsequentRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [newRefreshCookie!]);

      expect(subsequentRes.status).toBe(401);
    });
  });

  describe('Logout: POST /api/auth/logout', () => {
    it('revokes session and clears the refresh cookie', async () => {
      await authService.onboardUserByAdmin({
        name: 'Bob',
        email: 'bob@example.com',
        password: 'Password123!',
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'bob@example.com',
          password: 'Password123!',
        });

      const cookies = loginRes.headers['set-cookie'] as unknown as string[];
      const refreshCookie = cookies.find(c => c.startsWith('faceonn_refresh_token='));

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [refreshCookie!]);

      expect(logoutRes.status).toBe(200);

      const setCookies = logoutRes.headers['set-cookie'] as unknown as string[];
      const clearedCookie = setCookies.find(c => c.startsWith('faceonn_refresh_token=;'));
      expect(clearedCookie).toBeDefined();

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

    it('returns current user info including role when valid access token is provided', async () => {
      const { token } = await seedAdminAndLogin();

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.email).toBe('admin@example.com');
      expect(meRes.body.user.role).toBe('admin');
    });

    it('rejects access when token is tampered with', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.tampered.token');

      expect(res.status).toBe(401);
    });
  });
});
