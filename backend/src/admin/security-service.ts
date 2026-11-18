import crypto from 'crypto';
import { adminStore } from '../db/repositories/admin-store';
import { sessionRepository } from '../db/repositories/session-repository';
import { userRepository } from '../db/repositories/user-repository';
import { parseUserAgentSummary } from './admin-user-service';
import { AdminContext, assertOrgScope } from './rbac';

export class SecurityService {
  public async getSecurityOverview() {
    const [eventsRes, activeSessions, apiKeys] = await Promise.all([
      adminStore.listSecurityEvents({ limit: 500 }),
      sessionRepository.listAllActiveSessions(500),
      adminStore.listApiKeys(),
    ]);

    const now = Date.now();
    const last24h = now - 24 * 3600 * 1000;
    const events24h = eventsRes.items.filter((e) => e.created_at.getTime() >= last24h);

    const loginSuccess24h = events24h.filter((e) => e.event_type === 'login_success' || e.event_type === 'new_device_login').length;
    const loginFailed24h = events24h.filter((e) => e.event_type === 'login_failed').length;
    const newDeviceLogins24h = events24h.filter((e) => e.event_type === 'new_device_login').length;
    const tokenReuseAlerts = eventsRes.items.filter((e) => e.event_type === 'token_reuse').length;
    const highSeverityAlerts = events24h.filter((e) => e.severity === 'high' || e.severity === 'critical').length;

    // Detect suspicious IPs with >= 5 failed logins in 24h
    const failedByIp = new Map<string, number>();
    for (const ev of events24h) {
      if (ev.event_type === 'login_failed' && ev.ip_address) {
        failedByIp.set(ev.ip_address, (failedByIp.get(ev.ip_address) || 0) + 1);
      }
    }
    const suspiciousIps = Array.from(failedByIp.entries())
      .filter(([, count]) => count >= 5)
      .map(([ipAddress, failedAttempts]) => ({ ipAddress, failedAttempts }));

    return {
      summary: {
        loginSuccess24h,
        loginFailed24h,
        newDeviceLogins24h,
        tokenReuseAlerts,
        highSeverityAlerts,
        activeSessionsCount: activeSessions.length,
        activeApiKeysCount: apiKeys.filter((k) => !k.revoked_at).length,
      },
      suspiciousIps,
      recentEvents: eventsRes.items.slice(0, 25),
    };
  }

  public async listSecurityEvents(filters: {
    eventType?: string;
    severity?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const res = await adminStore.listSecurityEvents(filters);
    return {
      events: res.items.map((ev) => ({
        ...ev,
        ...parseUserAgentSummary(ev.user_agent),
      })),
      total: res.total,
    };
  }

  public async listActiveSessions(ctx: AdminContext) {
    const [sessions, users] = await Promise.all([
      sessionRepository.listAllActiveSessions(300),
      userRepository.listUsers(undefined, true),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));

    return sessions
      .filter((s) => {
        if (!ctx.scopedOrganizationId) return true;
        const u = userMap.get(s.user_id);
        return u?.organization_id === ctx.scopedOrganizationId;
      })
      .map((s) => {
        const u = userMap.get(s.user_id);
        const parsed = parseUserAgentSummary(s.user_agent);
        return {
          id: s.id,
          userId: s.user_id,
          userEmail: u?.email || 'unknown',
          userName: u?.name || null,
          ipAddress: s.ip_address,
          browser: parsed.browser,
          os: parsed.os,
          deviceType: parsed.deviceType,
          createdAt: s.created_at,
          lastUsedAt: s.last_used_at,
          expiresAt: s.expires_at,
        };
      });
  }

  public async revokeSession(ctx: AdminContext, sessionId: string) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      const err: any = new Error('Session not found');
      err.statusCode = 404;
      throw err;
    }
    if (ctx.scopedOrganizationId) {
      const u = await userRepository.findById(session.user_id, true);
      assertOrgScope(ctx, u?.organization_id);
    }
    await sessionRepository.revokeSession(sessionId);
  }

  public async listApiKeys(ctx: AdminContext) {
    const keys = await adminStore.listApiKeys(ctx.scopedOrganizationId);
    // NEVER expose key_hash
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.key_prefix,
      scopes: k.scopes,
      rateLimitPerMin: k.rate_limit_per_min,
      organizationId: k.organization_id,
      createdBy: k.created_by,
      lastUsedAt: k.last_used_at,
      expiresAt: k.expires_at,
      revokedAt: k.revoked_at,
      status: k.revoked_at ? 'revoked' : (k.expires_at && new Date(k.expires_at).getTime() < Date.now() ? 'expired' : 'active'),
      createdAt: k.created_at,
    }));
  }

  public async createApiKey(
    ctx: AdminContext,
    input: {
      name: string;
      scopes: string[];
      rateLimitPerMin?: number;
      expiresInDays?: number | null;
      organizationId?: string | null;
    }
  ) {
    const name = (input.name || '').trim();
    if (!name || name.length < 2) throw new Error('API key name must be at least 2 characters');
    const scopes = Array.isArray(input.scopes) && input.scopes.length ? input.scopes : ['read:meetings'];

    // Generate cryptographically random secret; only return plaintext ONCE here
    const rawSecret = `fck_live_${crypto.randomBytes(24).toString('hex')}`;
    const keyPrefix = rawSecret.slice(0, 16);
    const keyHash = crypto.createHash('sha256').update(rawSecret).digest('hex');

    const expiresAt = input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 86400 * 1000)
      : null;

    const record = await adminStore.createApiKey({
      name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes,
      rate_limit_per_min: Math.max(10, Math.min(10000, Number(input.rateLimitPerMin) || 120)),
      organization_id: ctx.scopedOrganizationId || input.organizationId || null,
      created_by: ctx.userId,
      expires_at: expiresAt,
    });

    return {
      apiKey: {
        id: record.id,
        name: record.name,
        keyPrefix: record.key_prefix,
        scopes: record.scopes,
        rateLimitPerMin: record.rate_limit_per_min,
        expiresAt: record.expires_at,
        createdAt: record.created_at,
        status: 'active',
      },
      // Returned strictly once at creation time
      plaintextSecret: rawSecret,
    };
  }

  public async revokeApiKey(ctx: AdminContext, id: string) {
    const keys = await adminStore.listApiKeys(ctx.scopedOrganizationId);
    const key = keys.find((k) => k.id === id);
    if (!key) {
      const err: any = new Error('API key not found');
      err.statusCode = 404;
      throw err;
    }
    await adminStore.revokeApiKey(id);
  }
}

export const securityService = new SecurityService();

