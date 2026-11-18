import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createHttpServer } from '../src/server/http';
import { userRepository } from '../src/db/repositories/user-repository';
import { sessionRepository } from '../src/db/repositories/session-repository';
import { meetingRepository } from '../src/db/repositories/meeting-repository';
import { occurrenceRepository } from '../src/db/repositories/occurrence-repository';
import { meetingSessionRepository } from '../src/db/repositories/meeting-session-repository';
import { adminStore } from '../src/db/repositories/admin-store';
import { hashPassword } from '../src/auth/password';
import { PlatformAdminRole } from '../src/db/types';

describe('Faceonn Enterprise Admin Control Center API', () => {
  const app = createHttpServer();

  async function createAndLoginUser(params: {
    name: string;
    email: string;
    password?: string;
    role?: 'admin' | 'user';
    adminRole?: PlatformAdminRole | null;
    organizationId?: string | null;
  }) {
    const password = params.password || 'StrongPass123!';
    const password_hash = await hashPassword(password);
    const created = await userRepository.createUser({
      name: params.name,
      email: params.email,
      password_hash,
      role: params.role || (params.adminRole ? 'admin' : 'user'),
      admin_role: params.adminRole ?? null,
      organization_id: params.organizationId ?? null,
      email_verified: true,
      status: 'active',
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: params.email, password });

    return {
      user: created,
      token: loginRes.body.accessToken as string,
      cookies: loginRes.headers['set-cookie'] as unknown as string[],
    };
  }

  beforeEach(async () => {
    await meetingSessionRepository.clearAll();
    await occurrenceRepository.clearAll();
    await meetingRepository.clearAll();
    await sessionRepository.clearAll();
    await userRepository.clearAll();
    await adminStore.clearAll();
  });

  describe('1. Authentication, RBAC & Privilege Escalation Prevention', () => {
    it('blocks unauthenticated and regular-user requests across all administrative APIs', async () => {
      const regular = await createAndLoginUser({ name: 'Regular User', email: 'regular@faceonn.com' });

      const endpoints = [
        { method: 'get', path: '/api/admin/me' },
        { method: 'get', path: '/api/admin/dashboard/overview' },
        { method: 'get', path: '/api/admin/users' },
        { method: 'get', path: '/api/admin/organizations' },
        { method: 'get', path: '/api/admin/meetings' },
        { method: 'get', path: '/api/admin/live/meetings' },
        { method: 'get', path: '/api/admin/recordings' },
        { method: 'get', path: '/api/admin/billing/overview' },
        { method: 'get', path: '/api/admin/infrastructure/overview' },
        { method: 'get', path: '/api/admin/security/events' },
        { method: 'get', path: '/api/admin/audit-logs' },
        { method: 'get', path: '/api/admin/settings' },
      ];

      for (const ep of endpoints) {
        const unauth = await (request(app) as any)[ep.method](ep.path);
        expect(unauth.status).toBe(401);

        const forbidden = await (request(app) as any)[ep.method](ep.path).set('Authorization', `Bearer ${regular.token}`);
        expect(forbidden.status).toBe(403);
      }
    });

    it('enforces Platform Admin restrictions and prevents privilege escalation against Super Admin', async () => {
      const superAdmin = await createAndLoginUser({
        name: 'Root Super Admin',
        email: 'super@faceonn.com',
        role: 'admin',
        adminRole: 'super_admin',
      });
      const platformAdmin = await createAndLoginUser({
        name: 'Platform Admin',
        email: 'platform@faceonn.com',
        role: 'admin',
        adminRole: 'platform_admin',
      });
      const regular = await createAndLoginUser({ name: 'Target User', email: 'target@faceonn.com' });

      // Platform admin CAN list users and suspend regular users
      const listRes = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${platformAdmin.token}`);
      expect(listRes.status).toBe(200);

      // Platform admin CANNOT modify a Super Admin account
      const touchSuper = await request(app)
        .post(`/api/admin/users/${superAdmin.user.id}/suspend`)
        .set('Authorization', `Bearer ${platformAdmin.token}`);
      expect(touchSuper.status).toBe(403);

      // Platform admin CANNOT escalate a regular user (or themselves) to super_admin
      const escalate = await request(app)
        .patch(`/api/admin/users/${regular.user.id}`)
        .set('Authorization', `Bearer ${platformAdmin.token}`)
        .send({ role: 'admin', adminRole: 'super_admin' });
      expect(escalate.status).toBe(403);

      // Platform admin CANNOT modify critical maintenance_mode settings or access billing refunds
      const critSetting = await request(app)
        .patch('/api/admin/settings/maintenance_mode')
        .set('Authorization', `Bearer ${platformAdmin.token}`)
        .send({ enabled: true });
      expect(critSetting.status).toBe(403);

      const billingRes = await request(app)
        .get('/api/admin/billing/overview')
        .set('Authorization', `Bearer ${platformAdmin.token}`);
      expect(billingRes.status).toBe(403);
    });

    it('enforces Support Admin, Billing Admin, and Technical Admin role boundaries', async () => {
      const supportAdmin = await createAndLoginUser({
        name: 'Support Admin',
        email: 'support@faceonn.com',
        adminRole: 'support_admin',
      });
      const billingAdmin = await createAndLoginUser({
        name: 'Billing Admin',
        email: 'billing@faceonn.com',
        adminRole: 'billing_admin',
      });
      const techAdmin = await createAndLoginUser({
        name: 'Tech Admin',
        email: 'tech@faceonn.com',
        adminRole: 'technical_admin',
      });

      // Support Admin: CAN view users & manage tickets; CANNOT view recordings, billing, or infrastructure
      expect((await request(app).get('/api/admin/users').set('Authorization', `Bearer ${supportAdmin.token}`)).status).toBe(200);
      expect((await request(app).get('/api/admin/support/tickets').set('Authorization', `Bearer ${supportAdmin.token}`)).status).toBe(200);
      expect((await request(app).get('/api/admin/recordings').set('Authorization', `Bearer ${supportAdmin.token}`)).status).toBe(403);
      expect((await request(app).get('/api/admin/billing/overview').set('Authorization', `Bearer ${supportAdmin.token}`)).status).toBe(403);
      expect((await request(app).get('/api/admin/infrastructure/sfu').set('Authorization', `Bearer ${supportAdmin.token}`)).status).toBe(403);

      // Billing Admin: CAN access billing; CANNOT manage users or infrastructure
      expect((await request(app).get('/api/admin/billing/overview').set('Authorization', `Bearer ${billingAdmin.token}`)).status).toBe(200);
      expect((await request(app).get('/api/admin/billing/plans').set('Authorization', `Bearer ${billingAdmin.token}`)).status).toBe(200);
      expect((await request(app).get('/api/admin/users').set('Authorization', `Bearer ${billingAdmin.token}`)).status).toBe(403);
      expect((await request(app).get('/api/admin/infrastructure/sfu').set('Authorization', `Bearer ${billingAdmin.token}`)).status).toBe(403);

      // Technical Admin: CAN access infrastructure & feature flags; CANNOT access billing
      expect((await request(app).get('/api/admin/infrastructure/overview').set('Authorization', `Bearer ${techAdmin.token}`)).status).toBe(200);
      expect((await request(app).get('/api/admin/feature-flags').set('Authorization', `Bearer ${techAdmin.token}`)).status).toBe(200);
      expect((await request(app).get('/api/admin/billing/overview').set('Authorization', `Bearer ${techAdmin.token}`)).status).toBe(403);
    });

    it('strictly enforces Organization Admin isolation and prevents cross-organization IDOR', async () => {
      const superAdmin = await createAndLoginUser({ name: 'Super', email: 'root@faceonn.com', adminRole: 'super_admin' });

      const orgARes = await request(app)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({ name: 'Org Alpha' });
      const orgBRes = await request(app)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({ name: 'Org Beta' });

      const orgAId = orgARes.body.organization.id;
      const orgBId = orgBRes.body.organization.id;

      const orgAAdmin = await createAndLoginUser({
        name: 'Alpha Admin',
        email: 'alpha-admin@faceonn.com',
        organizationId: orgAId,
      });
      const orgBUser = await createAndLoginUser({
        name: 'Beta Member',
        email: 'beta-member@faceonn.com',
        organizationId: orgBId,
      });

      await adminStore.upsertOrgMember(orgAId, orgAAdmin.user.id, 'org_admin');
      await adminStore.upsertOrgMember(orgBId, orgBUser.user.id, 'member');

      // Org A admin CAN inspect Org A
      const okOrgA = await request(app)
        .get(`/api/admin/organizations/${orgAId}`)
        .set('Authorization', `Bearer ${orgAAdmin.token}`);
      expect(okOrgA.status).toBe(200);

      // Org A admin CANNOT inspect Org B (IDOR blocked with 403)
      const idorOrgB = await request(app)
        .get(`/api/admin/organizations/${orgBId}`)
        .set('Authorization', `Bearer ${orgAAdmin.token}`);
      expect(idorOrgB.status).toBe(403);

      // Org A admin CANNOT inspect Org B's user detail
      const idorUserB = await request(app)
        .get(`/api/admin/users/${orgBUser.user.id}`)
        .set('Authorization', `Bearer ${orgAAdmin.token}`);
      expect(idorUserB.status).toBe(403);

      // Org A admin user list ONLY returns Org A members (never Org B or platform users)
      const scopedList = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${orgAAdmin.token}`);
      expect(scopedList.status).toBe(200);
      expect(scopedList.body.users.every((u: any) => u.organizationId === orgAId)).toBe(true);

      // Org A admin CANNOT access platform-wide infrastructure or settings
      expect((await request(app).get('/api/admin/infrastructure/overview').set('Authorization', `Bearer ${orgAAdmin.token}`)).status).toBe(403);
      expect((await request(app).get('/api/admin/settings').set('Authorization', `Bearer ${orgAAdmin.token}`)).status).toBe(403);
    });
  });

  describe('2. User Management & Session Revocation', () => {
    it('supports search, pagination, suspension, reactivation, session revocation, CSV export, and audit logging', async () => {
      const superAdmin = await createAndLoginUser({ name: 'Super', email: 'super@faceonn.com', adminRole: 'super_admin' });
      const alice = await createAndLoginUser({ name: 'Alice Walker', email: 'alice@faceonn.com' });
      await createAndLoginUser({ name: 'Bob Stone', email: 'bob@faceonn.com' });

      // Search & Pagination
      const searchRes = await request(app)
        .get('/api/admin/users?search=alice&page=1&limit=1')
        .set('Authorization', `Bearer ${superAdmin.token}`);
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.users.length).toBe(1);
      expect(searchRes.body.users[0].email).toBe('alice@faceonn.com');
      expect(searchRes.body.pagination.total).toBe(1);

      // Suspend Alice -> blocks subsequent login and revokes sessions
      const suspRes = await request(app)
        .post(`/api/admin/users/${alice.user.id}/suspend`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({ reason: 'Policy violation' });
      expect(suspRes.status).toBe(200);
      expect(suspRes.body.user.status).toBe('suspended');

      const blockedLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@faceonn.com', password: 'StrongPass123!' });
      expect(blockedLogin.status).toBe(401);

      // Reactivate Alice -> login succeeds again
      const reactRes = await request(app)
        .post(`/api/admin/users/${alice.user.id}/reactivate`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      expect(reactRes.status).toBe(200);
      expect(reactRes.body.user.status).toBe('active');

      const restoredLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@faceonn.com', password: 'StrongPass123!' });
      expect(restoredLogin.status).toBe(200);

      // Revoke sessions
      const revokeRes = await request(app)
        .post(`/api/admin/users/${alice.user.id}/revoke-sessions`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      expect(revokeRes.status).toBe(200);
      expect((await sessionRepository.listUserSessions(alice.user.id)).length).toBe(0);

      // CSV export
      const csvRes = await request(app)
        .get('/api/admin/users/export')
        .set('Authorization', `Bearer ${superAdmin.token}`);
      expect(csvRes.status).toBe(200);
      expect(csvRes.text).toContain('alice@faceonn.com');

      // Audit logs captured suspension & reactivation & export
      const auditRes = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${superAdmin.token}`);
      expect(auditRes.status).toBe(200);
      const actions = auditRes.body.logs.map((l: any) => l.action);
      expect(actions).toContain('user.suspended');
      expect(actions).toContain('user.reactivated');
      expect(actions).toContain('user.sessions_revoked');
    });
  });

  describe('3. Organization Policies Enforcement & Meeting Management', () => {
    it('enforces organization meeting policies on backend and allows live termination & recurring occurrence inspection', async () => {
      const superAdmin = await createAndLoginUser({ name: 'Super', email: 'super@faceonn.com', adminRole: 'super_admin' });

      // Create org with strict passcodeRequired & maxMeetingDurationMinutes = 45
      const orgRes = await request(app)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({
          name: 'Strict Corp',
          policies: {
            passcodeRequired: true,
            maxMeetingDurationMinutes: 45,
            recurringMeetingsEnabled: true,
          },
        });
      const orgId = orgRes.body.organization.id;

      const host = await createAndLoginUser({
        name: 'Strict Host',
        email: 'host@strict.com',
        organizationId: orgId,
      });

      // Attempting to schedule without passcode MUST be rejected by backend org policy
      const futureIso = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
      const rejectedSchedule = await request(app)
        .post('/api/meetings/schedule')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          title: 'Policy Test',
          scheduledAt: futureIso,
          timezone: 'UTC',
          durationMinutes: 120,
          meetingType: 'scheduled',
        });
      expect(rejectedSchedule.status).toBe(400);
      expect(rejectedSchedule.body.error).toMatch(/passcode is required by your organization policy/i);

      // Scheduling with passcode succeeds and clamps duration to 45 mins
      const recurringRes = await request(app)
        .post('/api/meetings/schedule')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          title: 'Weekly Sync',
          scheduledAt: futureIso,
          timezone: 'UTC',
          durationMinutes: 120,
          meetingType: 'recurring',
          recurrence: { frequency: 'weekly', interval: 1, occurrenceCount: 3 },
          settings: { passcodeEnabled: true, passcode: '123456' },
        });
      expect(recurringRes.status).toBe(201);
      expect(recurringRes.body.meeting.durationMinutes).toBe(45);

      const recurringId = recurringRes.body.meeting.id;

      // Admin inspects recurring meeting series & cancels only occurrence #1
      const detailRes = await request(app)
        .get(`/api/admin/meetings/${recurringId}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.occurrences.length).toBeGreaterThanOrEqual(2);

      const firstOccId = detailRes.body.occurrences[0].id;
      const cancelOccRes = await request(app)
        .post(`/api/admin/meetings/${recurringId}/cancel`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({ scope: 'occurrence', occurrenceId: firstOccId });
      expect(cancelOccRes.status).toBe(200);

      // Verify remaining occurrences are still scheduled (series intact)
      const afterDetail = await request(app)
        .get(`/api/admin/meetings/${recurringId}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      expect(afterDetail.body.occurrences[0].status).toBe('cancelled');
      expect(afterDetail.body.occurrences[1].status).toBe('scheduled');

      // Create a live instant meeting from a regular user without strict passcode policy
      const instantHost = await createAndLoginUser({ name: 'Live Host', email: 'live@faceonn.com' });
      const liveCreate = await request(app)
        .post('/api/meetings')
        .set('Authorization', `Bearer ${instantHost.token}`)
        .send({ title: 'Live Townhall' });
      expect(liveCreate.status).toBe(201);

      // Live monitoring detects it
      const liveFeed = await request(app)
        .get('/api/admin/live/meetings')
        .set('Authorization', `Bearer ${superAdmin.token}`);
      expect(liveFeed.status).toBe(200);
      expect(liveFeed.body.liveMeetings.some((m: any) => m.meetingId === liveCreate.body.meeting.id)).toBe(true);

      // Admin terminates live meeting
      const endRes = await request(app)
        .post(`/api/admin/meetings/${liveCreate.body.meeting.id}/end`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({ reason: 'Compliance test termination' });
      expect(endRes.status).toBe(200);

      const liveAfter = await request(app)
        .get('/api/admin/live/meetings')
        .set('Authorization', `Bearer ${superAdmin.token}`);
      expect(liveAfter.body.liveMeetings.some((m: any) => m.meetingId === liveCreate.body.meeting.id)).toBe(false);
    });
  });

  describe('4. Billing, Support, Infrastructure & Security Center', () => {
    it('manages subscriptions, payments, refunds, API keys (one-time secret), alerts, and honest infra telemetry', async () => {
      const superAdmin = await createAndLoginUser({ name: 'Super', email: 'super@faceonn.com', adminRole: 'super_admin' });
      const billingAdmin = await createAndLoginUser({ name: 'Billing', email: 'bill@faceonn.com', adminRole: 'billing_admin' });

      const orgRes = await request(app)
        .post('/api/admin/organizations')
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({ name: 'Enterprise Co' });
      const orgId = orgRes.body.organization.id;

      // Billing Admin assigns Pro subscription -> creates payment & invoice
      const plansRes = await request(app)
        .get('/api/admin/billing/plans')
        .set('Authorization', `Bearer ${billingAdmin.token}`);
      const proPlan = plansRes.body.plans.find((p: any) => p.slug === 'pro');
      expect(proPlan).toBeDefined();

      const subRes = await request(app)
        .post('/api/admin/subscriptions')
        .set('Authorization', `Bearer ${billingAdmin.token}`)
        .send({ organizationId: orgId, planId: proPlan.id, billingCycle: 'monthly' });
      expect(subRes.status).toBe(201);

      const paymentsRes = await request(app)
        .get('/api/admin/payments')
        .set('Authorization', `Bearer ${billingAdmin.token}`);
      expect(paymentsRes.body.payments.length).toBe(1);
      expect(paymentsRes.body.payments[0].amount_cents).toBe(proPlan.price_monthly_cents);

      // Refund payment
      const refundRes = await request(app)
        .post(`/api/admin/payments/${paymentsRes.body.payments[0].id}/refund`)
        .set('Authorization', `Bearer ${billingAdmin.token}`);
      expect(refundRes.status).toBe(200);
      expect(refundRes.body.payment.status).toBe('refunded');

      // Infrastructure honestly reports unconfigured external probes (no fabricated stats)
      const infraRes = await request(app)
        .get('/api/admin/infrastructure/overview')
        .set('Authorization', `Bearer ${superAdmin.token}`);
      expect(infraRes.status).toBe(200);
      expect(infraRes.body.redis.status).toBe('not_configured');
      expect(infraRes.body.jitsi.status).toBe('not_configured');
      expect(infraRes.body.api.totalRequests).toBeGreaterThan(0);

      // Alert creation -> acknowledge -> resolve
      const alertCreate = await request(app)
        .post('/api/admin/infrastructure/alerts')
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({ source: 'sfu', severity: 'warning', title: 'High CPU', message: 'CPU > 85%' });
      expect(alertCreate.status).toBe(201);
      const alertId = alertCreate.body.alert.id;

      const ackRes = await request(app)
        .post(`/api/admin/infrastructure/alerts/${alertId}/acknowledge`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      expect(ackRes.body.alert.status).toBe('acknowledged');

      const resolveRes = await request(app)
        .post(`/api/admin/infrastructure/alerts/${alertId}/resolve`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      expect(resolveRes.body.alert.status).toBe('resolved');

      // API Key creation returns secret ONCE, list omits secret/hash, revoke works
      const keyCreate = await request(app)
        .post('/api/admin/security/api-keys')
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({ name: 'CI Pipeline Key', scopes: ['read:meetings'] });
      expect(keyCreate.status).toBe(201);
      expect(keyCreate.body.plaintextSecret).toMatch(/^fck_live_/);

      const keyList = await request(app)
        .get('/api/admin/security/api-keys')
        .set('Authorization', `Bearer ${superAdmin.token}`);
      expect(keyList.body.apiKeys.length).toBe(1);
      expect(keyList.body.apiKeys[0].plaintextSecret).toBeUndefined();
      expect(keyList.body.apiKeys[0].key_hash).toBeUndefined();

      const keyRevoke = await request(app)
        .delete(`/api/admin/security/api-keys/${keyCreate.body.apiKey.id}`)
        .set('Authorization', `Bearer ${superAdmin.token}`);
      expect(keyRevoke.status).toBe(200);
    });
  });
});

