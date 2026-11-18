import { userRepository } from '../db/repositories/user-repository';
import { sessionRepository } from '../db/repositories/session-repository';
import { meetingRepository } from '../db/repositories/meeting-repository';
import { adminStore } from '../db/repositories/admin-store';
import { authService, toSafeUser } from '../auth/auth-service';
import { PlatformAdminRole, UserRecord, UserRole } from '../db/types';
import { AdminContext, assertOrgScope, isValidPlatformAdminRole, resolvePlatformRole } from './rbac';

export function parseUserAgentSummary(ua: string | null): { browser: string; os: string; deviceType: 'mobile' | 'tablet' | 'desktop' } {
  const s = (ua || '').toLowerCase();
  let browser = 'Unknown';
  if (s.includes('edg/')) browser = 'Edge';
  else if (s.includes('chrome/') && !s.includes('chromium')) browser = 'Chrome';
  else if (s.includes('firefox/')) browser = 'Firefox';
  else if (s.includes('safari/') && !s.includes('chrome')) browser = 'Safari';
  else if (s.includes('curl') || s.includes('node') || s.includes('supertest')) browser = 'API Client';

  let os = 'Unknown';
  if (s.includes('mac os') || s.includes('macintosh')) os = 'macOS';
  else if (s.includes('windows')) os = 'Windows';
  else if (s.includes('android')) os = 'Android';
  else if (s.includes('iphone') || s.includes('ipad') || s.includes('ios')) os = 'iOS';
  else if (s.includes('linux')) os = 'Linux';

  let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  if (s.includes('ipad') || s.includes('tablet')) deviceType = 'tablet';
  else if (s.includes('mobile') || s.includes('iphone') || s.includes('android')) deviceType = 'mobile';

  return { browser, os, deviceType };
}

export class AdminUserService {
  public async listUsersDirectory(
    ctx: AdminContext,
    query: {
      search?: string;
      status?: string;
      organizationId?: string;
      subscription?: string;
      role?: string;
      from?: string;
      to?: string;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    }
  ) {
    const allUsers = await userRepository.listUsers(query.search);
    const [orgs, subs, plans] = await Promise.all([
      adminStore.listOrganizations(ctx.scopedOrganizationId),
      adminStore.listSubscriptions(ctx.scopedOrganizationId),
      adminStore.listPlans(),
    ]);

    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    const planMap = new Map(plans.map((p) => [p.id, p]));
    const subByUser = new Map<string, string>();
    const subByOrg = new Map<string, string>();

    for (const s of subs) {
      if (s.status !== 'active' && s.status !== 'trialing') continue;
      const planName = planMap.get(s.plan_id)?.name || 'Free';
      if (s.user_id) subByUser.set(s.user_id, planName);
      if (s.organization_id) subByOrg.set(s.organization_id, planName);
    }

    const fromDate = query.from ? new Date(query.from) : null;
    const toDate = query.to ? new Date(query.to) : null;

    let enriched = allUsers
      .filter((u) => {
        if (ctx.scopedOrganizationId && u.organization_id !== ctx.scopedOrganizationId) return false;
        if (query.organizationId && u.organization_id !== query.organizationId) return false;
        if (query.status && u.status !== query.status) return false;
        if (query.role) {
          const pr = resolvePlatformRole(u);
          if (query.role === 'admin' && !pr) return false;
          if (query.role === 'user' && pr) return false;
          if (query.role !== 'admin' && query.role !== 'user' && pr !== query.role) return false;
        }
        if (fromDate && !isNaN(fromDate.getTime()) && u.created_at < fromDate) return false;
        if (toDate && !isNaN(toDate.getTime()) && u.created_at > toDate) return false;
        return true;
      })
      .map((u) => {
        const org = u.organization_id ? orgMap.get(u.organization_id) : null;
        const plan = subByUser.get(u.id) || (org ? subByOrg.get(org.id) || org.plan_slug : 'Free');
        return {
          ...toSafeUser(u),
          organizationName: org?.name || null,
          subscriptionPlan: plan,
        };
      });

    if (query.subscription) {
      const subFilter = query.subscription.toLowerCase();
      enriched = enriched.filter((u) => u.subscriptionPlan.toLowerCase() === subFilter);
    }

    // Sorting
    const sortBy = query.sortBy || 'createdAt';
    const dir = query.sortDir === 'asc' ? 1 : -1;
    enriched.sort((a: any, b: any) => {
      const va = a[sortBy] ?? '';
      const vb = b[sortBy] ?? '';
      return String(va).localeCompare(String(vb)) * dir;
    });

    const total = enriched.length;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
    const offset = (page - 1) * limit;
    const paged = enriched.slice(offset, offset + limit);

    return {
      users: paged,
      total,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  public async getUserDetail(ctx: AdminContext, targetUserId: string) {
    const user = await userRepository.findById(targetUserId);
    if (!user) {
      const err: any = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    if (ctx.scopedOrganizationId) {
      assertOrgScope(ctx, user.organization_id);
    }

    const [sessions, meetings, securityEvRes, orgs, subs, payments, plans] = await Promise.all([
      sessionRepository.listUserSessions(user.id),
      meetingRepository.listUserMeetings(user.id),
      adminStore.listSecurityEvents({ userId: user.id, limit: 30 }),
      user.organization_id ? adminStore.findOrganizationById(user.organization_id) : Promise.resolve(null),
      adminStore.listSubscriptions(user.organization_id || undefined),
      adminStore.listPayments(user.organization_id || undefined),
      adminStore.listPlans(),
    ]);

    const hostedMeetings = meetings.filter((m) => m.owner_user_id === user.id);
    const attendedMeetings = meetings.filter((m) => m.owner_user_id !== user.id);
    const upcomingMeetings = meetings.filter((m) => m.status === 'scheduled' || m.status === 'active');
    const recurringMeetings = meetings.filter((m) => m.meeting_type === 'recurring');

    const userSub = subs.find((s) => s.user_id === user.id || (user.organization_id && s.organization_id === user.organization_id)) || null;
    const plan = userSub ? plans.find((p) => p.id === userSub.plan_id) : null;
    const userPayments = payments.filter((p) => p.user_id === user.id || (user.organization_id && p.organization_id === user.organization_id));

    const canViewIp = ctx.isSuperAdmin || ctx.platformRole === 'technical_admin' || ctx.platformRole === 'platform_admin';

    return {
      profile: {
        ...toSafeUser(user),
        pmi: user.pmi || null,
        organization: orgs ? { id: orgs.id, name: orgs.name, slug: orgs.slug } : null,
      },
      activity: {
        lastLoginAt: user.last_login_at ? user.last_login_at.toISOString() : null,
        lastActiveAt: user.last_active_at ? user.last_active_at.toISOString() : null,
        activeSessions: sessions.map((s) => {
          const parsed = parseUserAgentSummary(s.user_agent);
          return {
            id: s.id,
            createdAt: s.created_at,
            lastUsedAt: s.last_used_at,
            expiresAt: s.expires_at,
            browser: parsed.browser,
            os: parsed.os,
            deviceType: parsed.deviceType,
            ipAddress: canViewIp ? s.ip_address : (s.ip_address ? 'Redacted' : null),
          };
        }),
        loginHistory: securityEvRes.items.map((ev) => ({
          id: ev.id,
          eventType: ev.event_type,
          severity: ev.severity,
          ipAddress: canViewIp ? ev.ip_address : (ev.ip_address ? 'Redacted' : null),
          ...parseUserAgentSummary(ev.user_agent),
          createdAt: ev.created_at.toISOString(),
        })),
      },
      meetingHistory: {
        totalHosted: hostedMeetings.length,
        totalAttended: attendedMeetings.length,
        upcomingCount: upcomingMeetings.length,
        recurringCount: recurringMeetings.length,
        totalScheduledMinutes: hostedMeetings.reduce((sum, m) => sum + (m.duration_minutes || 0), 0),
        recentMeetings: meetings.slice(0, 20).map((m) => ({
          id: m.id,
          roomId: m.room_id,
          title: m.title,
          status: m.status,
          meetingType: m.meeting_type,
          isHost: m.owner_user_id === user.id,
          durationMinutes: m.duration_minutes,
          scheduledAt: m.scheduled_at ? m.scheduled_at.toISOString() : null,
          createdAt: m.created_at.toISOString(),
        })),
      },
      subscription: {
        currentPlan: plan?.name || orgs?.plan_slug || 'Free',
        status: userSub?.status || 'active',
        renewalDate: userSub?.current_period_end || null,
        billingHistory: userPayments.slice(0, 15).map((p) => ({
          id: p.id,
          amountCents: p.amount_cents,
          currency: p.currency,
          status: p.status,
          createdAt: p.created_at,
        })),
      },
    };
  }

  public async updateUserWithRbac(
    ctx: AdminContext,
    targetUserId: string,
    updates: {
      name?: string;
      role?: UserRole;
      adminRole?: PlatformAdminRole | null;
      status?: 'active' | 'suspended' | 'deactivated';
      organizationId?: string | null;
      country?: string | null;
      emailVerified?: boolean;
      password?: string;
      generatePassword?: boolean;
    }
  ) {
    const target = await userRepository.findById(targetUserId);
    if (!target) {
      const err: any = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    if (ctx.scopedOrganizationId) {
      assertOrgScope(ctx, target.organization_id);
      if (updates.role !== undefined || updates.adminRole !== undefined) {
        const err: any = new Error('Forbidden: Organization admins cannot assign platform roles');
        err.statusCode = 403;
        throw err;
      }
    }

    // Privilege escalation protection: non-super-admins CANNOT touch super_admin accounts or promote anyone to super_admin
    const targetPlatformRole = resolvePlatformRole(target);
    if (targetPlatformRole === 'super_admin' && !ctx.isSuperAdmin) {
      const err: any = new Error('Forbidden: Only a Super Admin can modify a Super Admin account');
      err.statusCode = 403;
      throw err;
    }

    if (updates.adminRole !== undefined) {
      if (updates.adminRole !== null && !isValidPlatformAdminRole(updates.adminRole)) {
        throw new Error('Invalid platform admin role');
      }
      if (!ctx.isSuperAdmin) {
        const err: any = new Error('Forbidden: Only a Super Admin can assign or change platform admin roles');
        err.statusCode = 403;
        throw err;
      }
      if (ctx.userId === targetUserId && updates.adminRole !== 'super_admin') {
        throw new Error('You cannot remove your own Super Admin role');
      }
    }

    if (updates.role === 'admin' && !ctx.isSuperAdmin) {
      const err: any = new Error('Forbidden: Only a Super Admin can grant platform administrator privileges');
      err.statusCode = 403;
      throw err;
    }

    // Apply core authService update (handles self-protection, password policy, session revocation on status change)
    const coreRes = await authService.updateUserByAdmin(ctx.userId, targetUserId, {
      name: updates.name,
      role: updates.role,
      status: updates.status,
      password: updates.password,
      generatePassword: updates.generatePassword,
    });

    // Apply extended fields if present
    const hasExtended =
      updates.adminRole !== undefined ||
      updates.organizationId !== undefined ||
      updates.country !== undefined ||
      updates.emailVerified !== undefined;

    if (hasExtended) {
      const extUpdated = await userRepository.updateUser(targetUserId, {
        ...(updates.adminRole !== undefined ? { admin_role: updates.adminRole } : {}),
        ...(updates.organizationId !== undefined ? { organization_id: updates.organizationId } : {}),
        ...(updates.country !== undefined ? { country: updates.country } : {}),
        ...(updates.emailVerified !== undefined ? { email_verified: updates.emailVerified } : {}),
      });
      if (extUpdated) {
        return {
          user: toSafeUser(extUpdated),
          ...(coreRes.temporaryPassword ? { temporaryPassword: coreRes.temporaryPassword } : {}),
        };
      }
    }

    return coreRes;
  }

  public async suspendUser(ctx: AdminContext, targetUserId: string) {
    return this.updateUserWithRbac(ctx, targetUserId, { status: 'suspended' });
  }

  public async reactivateUser(ctx: AdminContext, targetUserId: string) {
    return this.updateUserWithRbac(ctx, targetUserId, { status: 'active' });
  }

  public async revokeAllSessions(ctx: AdminContext, targetUserId: string) {
    const target = await userRepository.findById(targetUserId);
    if (!target) {
      const err: any = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }
    if (ctx.scopedOrganizationId) assertOrgScope(ctx, target.organization_id);
    if (resolvePlatformRole(target) === 'super_admin' && !ctx.isSuperAdmin) {
      const err: any = new Error('Forbidden: Cannot revoke Super Admin sessions');
      err.statusCode = 403;
      throw err;
    }
    await sessionRepository.revokeAllUserSessions(targetUserId);
  }

  public async deleteUserWithRbac(ctx: AdminContext, targetUserId: string) {
    const target = await userRepository.findById(targetUserId);
    if (!target) {
      const err: any = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }
    if (ctx.scopedOrganizationId) assertOrgScope(ctx, target.organization_id);
    if (resolvePlatformRole(target) === 'super_admin' && !ctx.isSuperAdmin) {
      const err: any = new Error('Forbidden: Cannot delete a Super Admin account');
      err.statusCode = 403;
      throw err;
    }
    await authService.deleteUserByAdmin(ctx.userId, targetUserId);
  }

  public usersToCsv(users: Array<ReturnType<typeof toSafeUser> & { organizationName?: string | null; subscriptionPlan?: string }>): string {
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['id', 'name', 'email', 'organization', 'role', 'adminRole', 'status', 'subscription', 'emailVerified', 'country', 'createdAt', 'lastLoginAt'];
    const rows = users.map((u) =>
      [u.id, u.name, u.email, u.organizationName || '', u.role, u.adminRole || '', u.status, u.subscriptionPlan || 'Free', u.emailVerified, u.country || '', u.createdAt, u.lastLoginAt || '']
        .map(esc)
        .join(',')
    );
    return [header.join(','), ...rows].join('\n');
  }
}

export const adminUserService = new AdminUserService();

