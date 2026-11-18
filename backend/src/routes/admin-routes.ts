import { Router, Response } from 'express';
import { authService } from '../auth/auth-service';
import { requireAuth } from '../auth/middleware';
import { UserRole } from '../db/types';
import { adminStore } from '../db/repositories/admin-store';
import {
  AdminRequest,
  adminSensitiveActionLimiter,
  attachCorrelationId,
  requireAdminAccess,
  requirePermission,
  requirePlatformAdminOnly,
} from '../admin/admin-middleware';
import { auditLogsToCsv, recordAudit } from '../admin/audit-service';
import { ROLE_DEFINITIONS, isValidPlatformAdminRole } from '../admin/rbac';
import { analyticsService } from '../admin/analytics-service';
import { adminUserService } from '../admin/admin-user-service';
import { organizationService } from '../admin/organization-service';
import { adminMeetingService } from '../admin/admin-meeting-service';
import { recordingService } from '../admin/recording-service';
import { billingService } from '../admin/billing-service';
import { supportService } from '../admin/support-service';
import { commsService } from '../admin/comms-service';
import { securityService } from '../admin/security-service';
import { infrastructureService } from '../admin/infrastructure-service';
import { configService } from '../admin/config-service';
import { globalSearchService } from '../admin/global-search-service';

export const adminRouter = Router();

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : (val || '');
}

function queryStr(val: unknown): string | undefined {
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
}

function handleError(res: Response, err: any, fallback: string) {
  const status = err?.statusCode || (/not found/i.test(err?.message || '') ? 404 : /forbidden|unauthorized/i.test(err?.message || '') ? 403 : 400);
  res.status(status).json({ error: err?.message || fallback, ...(err?.code ? { code: err.code } : {}) });
}

// Every route under /api/admin requires authenticated user + resolved admin/org-admin RBAC context
adminRouter.use(attachCorrelationId, requireAuth, requireAdminAccess);

// ==================== ADMIN CONTEXT & GLOBAL SEARCH ====================
adminRouter.get('/me', (req: AdminRequest, res: Response) => {
  const ctx = req.adminContext!;
  res.json({
    admin: {
      userId: ctx.userId,
      email: ctx.email,
      name: ctx.name,
      isPlatformAdmin: ctx.isPlatformAdmin,
      isSuperAdmin: ctx.isSuperAdmin,
      isOrgAdmin: ctx.isOrgAdmin,
      platformRole: ctx.platformRole,
      orgRole: ctx.orgRole,
      scopedOrganizationId: ctx.scopedOrganizationId,
      permissions: Array.from(ctx.permissions),
    },
  });
});

adminRouter.get('/search', async (req: AdminRequest, res: Response) => {
  try {
    const q = queryStr(req.query.q) || '';
    const results = await globalSearchService.search(req.adminContext!, q);
    res.json(results);
  } catch (err) {
    handleError(res, err, 'Search failed');
  }
});

// ==================== DASHBOARD & ANALYTICS ====================
adminRouter.get('/dashboard/overview', requirePermission('dashboard:view'), async (req: AdminRequest, res: Response) => {
  try {
    const data = await analyticsService.getDashboardOverview(req.adminContext!, {
      days: Number(req.query.days) || 30,
      organizationId: queryStr(req.query.organizationId),
    });
    res.json(data);
  } catch (err) {
    handleError(res, err, 'Failed to load dashboard overview');
  }
});

adminRouter.get('/dashboard/analytics', requirePermission('dashboard:view'), async (req: AdminRequest, res: Response) => {
  try {
    const data = await analyticsService.getAnalyticsSeries(req.adminContext!, {
      days: Number(req.query.days) || 14,
      organizationId: queryStr(req.query.organizationId),
      country: queryStr(req.query.country),
    });
    res.json(data);
  } catch (err) {
    handleError(res, err, 'Failed to load analytics');
  }
});

adminRouter.get('/dashboard/activity', requirePermission('dashboard:view'), async (req: AdminRequest, res: Response) => {
  try {
    const data = await analyticsService.getRecentActivity(req.adminContext!, queryStr(req.query.organizationId));
    res.json(data);
  } catch (err) {
    handleError(res, err, 'Failed to load recent activity');
  }
});

// ==================== ROLES & PERMISSIONS ====================
adminRouter.get('/roles', requirePermission('roles:view'), (_req: AdminRequest, res: Response) => {
  res.json({ roles: Object.values(ROLE_DEFINITIONS) });
});

// ==================== USER MANAGEMENT ====================
adminRouter.get('/users', requirePermission('users:view'), async (req: AdminRequest, res: Response) => {
  try {
    const data = await adminUserService.listUsersDirectory(req.adminContext!, {
      search: queryStr(req.query.search),
      status: queryStr(req.query.status),
      organizationId: queryStr(req.query.organizationId),
      subscription: queryStr(req.query.subscription),
      role: queryStr(req.query.role),
      from: queryStr(req.query.from),
      to: queryStr(req.query.to),
      sortBy: queryStr(req.query.sortBy),
      sortDir: req.query.sortDir === 'asc' ? 'asc' : 'desc',
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 25,
    });
    res.json(data);
  } catch (err) {
    handleError(res, err, 'Failed to list users');
  }
});

adminRouter.get('/users/export', requirePermission('users:export'), async (req: AdminRequest, res: Response) => {
  try {
    const data = await adminUserService.listUsersDirectory(req.adminContext!, {
      search: queryStr(req.query.search),
      status: queryStr(req.query.status),
      organizationId: queryStr(req.query.organizationId),
      page: 1,
      limit: 200,
    });
    await recordAudit(req, { action: 'users.export_csv', targetType: 'user', metadata: { count: data.users.length } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="faceonn-users.csv"');
    res.send(adminUserService.usersToCsv(data.users));
  } catch (err) {
    handleError(res, err, 'Failed to export users');
  }
});

adminRouter.post('/users', requirePermission('users:manage'), adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const ctx = req.adminContext!;
    const { name, email, password, role, adminRole, organizationId, country } = req.body || {};

    if ((role === 'admin' || adminRole) && !ctx.isSuperAdmin) {
      res.status(403).json({ error: 'Forbidden: Only Super Admin can create administrator accounts' });
      return;
    }
    if (adminRole && !isValidPlatformAdminRole(adminRole)) {
      res.status(400).json({ error: 'Invalid adminRole value' });
      return;
    }

    const normalizedRole: UserRole = role === 'admin' || adminRole ? 'admin' : 'user';
    const result = await authService.onboardUserByAdmin({
      name,
      email,
      password,
      role: normalizedRole,
    });

    const targetOrgId = ctx.scopedOrganizationId || organizationId || null;
    if (adminRole || targetOrgId || country) {
      const updated = await adminUserService.updateUserWithRbac(ctx, result.user.id, {
        ...(adminRole ? { adminRole } : {}),
        ...(targetOrgId ? { organizationId: targetOrgId } : {}),
        ...(country ? { country } : {}),
      });
      result.user = updated.user;
      if (targetOrgId) {
        await adminStore.upsertOrgMember(targetOrgId, result.user.id, 'member');
      }
    }

    await recordAudit(req, {
      action: 'user.created',
      targetType: 'user',
      targetId: result.user.id,
      organizationId: targetOrgId,
      metadata: { email: result.user.email, role: normalizedRole, adminRole: adminRole || null },
    });

    analyticsService.clearCache();
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, 'Failed to onboard participant');
  }
});

adminRouter.get('/users/:id', requirePermission('users:view'), async (req: AdminRequest, res: Response) => {
  try {
    const detail = await adminUserService.getUserDetail(req.adminContext!, paramStr(req.params.id));
    res.json(detail);
  } catch (err) {
    handleError(res, err, 'Failed to fetch user detail');
  }
});

adminRouter.get('/users/:id/export', requirePermission('users:export'), async (req: AdminRequest, res: Response) => {
  try {
    const userId = paramStr(req.params.id);
    const detail = await adminUserService.getUserDetail(req.adminContext!, userId);
    await recordAudit(req, { action: 'user.data_exported', targetType: 'user', targetId: userId });
    res.json({ exportedAt: new Date().toISOString(), data: detail });
  } catch (err) {
    handleError(res, err, 'Failed to export user data');
  }
});

adminRouter.patch('/users/:id', requirePermission('users:manage'), adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const userId = paramStr(req.params.id);
    const { name, role, adminRole, status, password, generatePassword, organizationId, country, emailVerified } = req.body || {};

    if (role !== undefined && role !== 'admin' && role !== 'user') {
      res.status(400).json({ error: 'Invalid role. Must be "admin" or "user".' });
      return;
    }
    if (status !== undefined && status !== 'active' && status !== 'suspended' && status !== 'deactivated') {
      res.status(400).json({ error: 'Invalid status.' });
      return;
    }

    const result = await adminUserService.updateUserWithRbac(req.adminContext!, userId, {
      name,
      role,
      adminRole,
      status,
      organizationId,
      country,
      emailVerified,
      password,
      generatePassword: Boolean(generatePassword),
    });

    await recordAudit(req, {
      action: 'user.updated',
      targetType: 'user',
      targetId: userId,
      metadata: { fields: Object.keys(req.body || {}).filter((k) => k !== 'password') },
    });

    analyticsService.clearCache();
    res.json(result);
  } catch (err) {
    handleError(res, err, 'Failed to update user');
  }
});

adminRouter.post('/users/:id/suspend', requirePermission('users:manage'), adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const userId = paramStr(req.params.id);
    const result = await adminUserService.suspendUser(req.adminContext!, userId);
    await recordAudit(req, { action: 'user.suspended', targetType: 'user', targetId: userId, metadata: { reason: req.body?.reason || null } });
    analyticsService.clearCache();
    res.json(result);
  } catch (err) {
    handleError(res, err, 'Failed to suspend user');
  }
});

adminRouter.post('/users/:id/reactivate', requirePermission('users:manage'), adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const userId = paramStr(req.params.id);
    const result = await adminUserService.reactivateUser(req.adminContext!, userId);
    await recordAudit(req, { action: 'user.reactivated', targetType: 'user', targetId: userId });
    analyticsService.clearCache();
    res.json(result);
  } catch (err) {
    handleError(res, err, 'Failed to reactivate user');
  }
});

adminRouter.post('/users/:id/revoke-sessions', requirePermission('users:sessions'), adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const userId = paramStr(req.params.id);
    await adminUserService.revokeAllSessions(req.adminContext!, userId);
    await recordAudit(req, { action: 'user.sessions_revoked', targetType: 'user', targetId: userId });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'Failed to revoke sessions');
  }
});

adminRouter.post('/users/:id/send-verification', requirePermission('users:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const userId = paramStr(req.params.id);
    const result = await adminUserService.updateUserWithRbac(req.adminContext!, userId, { emailVerified: true });
    await recordAudit(req, { action: 'user.verification_marked', targetType: 'user', targetId: userId });
    res.json({ success: true, user: result.user, deliveryNote: process.env.SMTP_HOST ? 'Verification email queued.' : 'SMTP not configured; account marked verified.' });
  } catch (err) {
    handleError(res, err, 'Failed to process verification');
  }
});

adminRouter.delete('/users/:id', requirePermission('users:delete'), adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const userId = paramStr(req.params.id);
    await adminUserService.deleteUserWithRbac(req.adminContext!, userId);
    await recordAudit(req, { action: 'user.deleted', targetType: 'user', targetId: userId });
    analyticsService.clearCache();
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'Failed to delete user');
  }
});

// ==================== ORGANIZATIONS & INVITATIONS ====================
adminRouter.get('/organizations', requirePermission('organizations:view'), async (req: AdminRequest, res: Response) => {
  try {
    const data = await organizationService.listOrganizations(req.adminContext!, queryStr(req.query.search));
    res.json(data);
  } catch (err) {
    handleError(res, err, 'Failed to list organizations');
  }
});

adminRouter.post('/organizations', requirePermission('organizations:manage'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const org = await organizationService.createOrganization(req.adminContext!, req.body || {});
    await recordAudit(req, { action: 'organization.created', targetType: 'organization', targetId: org.id, organizationId: org.id, metadata: { name: org.name } });
    analyticsService.clearCache();
    res.status(201).json({ organization: org });
  } catch (err) {
    handleError(res, err, 'Failed to create organization');
  }
});

adminRouter.get('/organizations/:id', requirePermission('organizations:view'), async (req: AdminRequest, res: Response) => {
  try {
    const detail = await organizationService.getOrganizationDetail(req.adminContext!, paramStr(req.params.id));
    res.json(detail);
  } catch (err) {
    handleError(res, err, 'Failed to fetch organization detail');
  }
});

adminRouter.patch('/organizations/:id', requirePermission('organizations:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const orgId = paramStr(req.params.id);
    const updated = await organizationService.updateOrganization(req.adminContext!, orgId, req.body || {});
    await recordAudit(req, { action: 'organization.updated', targetType: 'organization', targetId: orgId, organizationId: orgId, metadata: { fields: Object.keys(req.body || {}) } });
    res.json({ organization: updated });
  } catch (err) {
    handleError(res, err, 'Failed to update organization');
  }
});

adminRouter.delete('/organizations/:id', requirePermission('organizations:delete'), requirePlatformAdminOnly, adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const orgId = paramStr(req.params.id);
    await organizationService.deleteOrganization(req.adminContext!, orgId);
    await recordAudit(req, { action: 'organization.deleted', targetType: 'organization', targetId: orgId, organizationId: orgId });
    analyticsService.clearCache();
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'Failed to delete organization');
  }
});

adminRouter.post('/organizations/:id/members', requirePermission('organizations:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const orgId = paramStr(req.params.id);
    const { userId, role } = req.body || {};
    const member = await organizationService.addMember(req.adminContext!, orgId, userId, role || 'member');
    await recordAudit(req, { action: 'organization.member_added', targetType: 'organization', targetId: orgId, organizationId: orgId, metadata: { userId, role: role || 'member' } });
    res.status(201).json({ member });
  } catch (err) {
    handleError(res, err, 'Failed to add member');
  }
});

adminRouter.delete('/organizations/:id/members/:userId', requirePermission('organizations:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const orgId = paramStr(req.params.id);
    const userId = paramStr(req.params.userId);
    await organizationService.removeMember(req.adminContext!, orgId, userId);
    await recordAudit(req, { action: 'organization.member_removed', targetType: 'organization', targetId: orgId, organizationId: orgId, metadata: { userId } });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'Failed to remove member');
  }
});

adminRouter.get('/invitations', requirePermission('organizations:view'), async (req: AdminRequest, res: Response) => {
  try {
    const orgId = req.adminContext!.scopedOrganizationId || queryStr(req.query.organizationId) || null;
    const invitations = await adminStore.listOrgInvitations(orgId);
    res.json({ invitations });
  } catch (err) {
    handleError(res, err, 'Failed to list invitations');
  }
});

adminRouter.post('/organizations/:id/invitations', requirePermission('organizations:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const orgId = paramStr(req.params.id);
    const { email, role, emails } = req.body || {};
    const entries = Array.isArray(emails)
      ? emails.map((e: any) => (typeof e === 'string' ? { email: e, role } : e))
      : [{ email, role }];
    const result = await organizationService.inviteMembers(req.adminContext!, orgId, entries);
    await recordAudit(req, { action: 'organization.invitations_sent', targetType: 'organization', targetId: orgId, organizationId: orgId, metadata: { count: result.invitations.length } });
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, 'Failed to create invitations');
  }
});

adminRouter.post('/organizations/:id/invitations/bulk-csv', requirePermission('organizations:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const orgId = paramStr(req.params.id);
    const csv = String(req.body?.csv || '');
    const entries = organizationService.parseBulkCsvInvitations(csv);
    const result = await organizationService.inviteMembers(req.adminContext!, orgId, entries);
    await recordAudit(req, { action: 'organization.bulk_csv_invited', targetType: 'organization', targetId: orgId, organizationId: orgId, metadata: { invited: result.invitations.length, errors: result.errors.length } });
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, 'Failed to process bulk CSV invitations');
  }
});

adminRouter.delete('/invitations/:id', requirePermission('organizations:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const invId = paramStr(req.params.id);
    await adminStore.revokeOrgInvitation(invId);
    await recordAudit(req, { action: 'organization.invitation_revoked', targetType: 'invitation', targetId: invId });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'Failed to revoke invitation');
  }
});

// ==================== MEETINGS & LIVE MONITORING ====================
adminRouter.get('/meetings', requirePermission('meetings:view'), async (req: AdminRequest, res: Response) => {
  try {
    const data = await adminMeetingService.listMeetingsDirectory(req.adminContext!, {
      search: queryStr(req.query.search),
      status: queryStr(req.query.status),
      hostId: queryStr(req.query.hostId),
      organizationId: queryStr(req.query.organizationId),
      meetingType: queryStr(req.query.meetingType),
      recurringOnly: req.query.recurringOnly === 'true',
      hasRecording: req.query.hasRecording === 'true',
      from: queryStr(req.query.from),
      to: queryStr(req.query.to),
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 25,
    });
    res.json(data);
  } catch (err) {
    handleError(res, err, 'Failed to list meetings');
  }
});

adminRouter.get('/meetings/:id', requirePermission('meetings:view'), async (req: AdminRequest, res: Response) => {
  try {
    const detail = await adminMeetingService.getMeetingDetail(req.adminContext!, paramStr(req.params.id));
    res.json(detail);
  } catch (err) {
    handleError(res, err, 'Failed to load meeting details');
  }
});

adminRouter.post('/meetings/:id/end', requirePermission('meetings:terminate'), adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const meetingId = paramStr(req.params.id);
    const updated = await adminMeetingService.endLiveMeeting(req.adminContext!, meetingId, req.body?.reason || 'admin_terminated');
    await recordAudit(req, { action: 'meeting.ended', targetType: 'meeting', targetId: meetingId, organizationId: updated.organization_id || null, metadata: { reason: req.body?.reason || 'admin_terminated' } });
    analyticsService.clearCache();
    res.json({ meeting: updated });
  } catch (err) {
    handleError(res, err, 'Failed to end live meeting');
  }
});

adminRouter.post('/meetings/:id/cancel', requirePermission('meetings:manage'), adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const meetingId = paramStr(req.params.id);
    const scope = req.body?.scope === 'occurrence' ? 'occurrence' : 'series';
    const occurrenceId = req.body?.occurrenceId;
    const result = await adminMeetingService.cancelMeeting(req.adminContext!, meetingId, scope, occurrenceId);
    await recordAudit(req, { action: 'meeting.cancelled', targetType: 'meeting', targetId: meetingId, metadata: { scope, occurrenceId: occurrenceId || null } });
    analyticsService.clearCache();
    res.json(result);
  } catch (err) {
    handleError(res, err, 'Failed to cancel meeting');
  }
});

adminRouter.post('/meetings/:id/disable', requirePermission('meetings:terminate'), adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const meetingId = paramStr(req.params.id);
    const reason = req.body?.reason || 'Disabled by administrator due to policy or security concern';
    const updated = await adminMeetingService.disableMeetingLink(req.adminContext!, meetingId, reason);
    await recordAudit(req, { action: 'meeting.link_disabled', targetType: 'meeting', targetId: meetingId, metadata: { reason } });
    analyticsService.clearCache();
    res.json({ meeting: updated });
  } catch (err) {
    handleError(res, err, 'Failed to disable meeting link');
  }
});

adminRouter.get('/live/meetings', requirePermission('live:view'), async (req: AdminRequest, res: Response) => {
  try {
    const snapshot = await adminMeetingService.getLiveMonitoringSnapshot(req.adminContext!);
    res.json(snapshot);
  } catch (err) {
    handleError(res, err, 'Failed to load live meetings');
  }
});

adminRouter.get('/live/metrics', requirePermission('live:view'), async (req: AdminRequest, res: Response) => {
  try {
    const [live, sfu] = await Promise.all([
      adminMeetingService.getLiveMonitoringSnapshot(req.adminContext!),
      infrastructureService.getSfuStatus(),
    ]);
    res.json({ timestamp: live.timestamp, metrics: live.metrics, sfuStatus: sfu.status, sfuServers: sfu.servers });
  } catch (err) {
    handleError(res, err, 'Failed to load live metrics');
  }
});

// ==================== RECORDINGS ====================
adminRouter.get('/recordings', requirePermission('recordings:view'), async (req: AdminRequest, res: Response) => {
  try {
    const data = await recordingService.listRecordings(req.adminContext!, {
      search: queryStr(req.query.search),
      status: queryStr(req.query.status),
      organizationId: queryStr(req.query.organizationId),
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 25,
    });
    res.json(data);
  } catch (err) {
    handleError(res, err, 'Failed to list recordings');
  }
});

adminRouter.get('/recordings/:id', requirePermission('recordings:view'), async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const rec = await recordingService.getRecordingMetadata(req.adminContext!, id);
    await recordAudit(req, { action: 'recording.metadata_viewed', targetType: 'recording', targetId: id });
    res.json({ recording: rec });
  } catch (err) {
    handleError(res, err, 'Failed to view recording metadata');
  }
});

adminRouter.patch('/recordings/:id/retention', requirePermission('recordings:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const updated = await recordingService.updateRetention(req.adminContext!, id, Number(req.body?.retentionDays));
    await recordAudit(req, { action: 'recording.retention_updated', targetType: 'recording', targetId: id, metadata: { retentionDays: req.body?.retentionDays } });
    res.json({ recording: updated });
  } catch (err) {
    handleError(res, err, 'Failed to update retention');
  }
});

adminRouter.delete('/recordings/:id', requirePermission('recordings:manage'), adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const updated = await recordingService.softDeleteRecording(req.adminContext!, id);
    await recordAudit(req, { action: 'recording.deleted', targetType: 'recording', targetId: id });
    res.json({ recording: updated });
  } catch (err) {
    handleError(res, err, 'Failed to delete recording');
  }
});

adminRouter.post('/recordings/:id/restore', requirePermission('recordings:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const updated = await recordingService.restoreRecording(req.adminContext!, id);
    await recordAudit(req, { action: 'recording.restored', targetType: 'recording', targetId: id });
    res.json({ recording: updated });
  } catch (err) {
    handleError(res, err, 'Failed to restore recording');
  }
});

// ==================== BILLING & SUBSCRIPTIONS ====================
adminRouter.get('/billing/overview', requirePermission('billing:view'), async (req: AdminRequest, res: Response) => {
  try {
    const overview = await billingService.getBillingOverview(req.adminContext!);
    res.json(overview);
  } catch (err) {
    handleError(res, err, 'Failed to load billing overview');
  }
});

adminRouter.get('/billing/plans', requirePermission('billing:view'), async (_req: AdminRequest, res: Response) => {
  try {
    const plans = await billingService.listPlans();
    res.json({ plans });
  } catch (err) {
    handleError(res, err, 'Failed to list plans');
  }
});

adminRouter.post('/billing/plans', requirePermission('billing:manage'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const plan = await billingService.createPlan(req.body || {});
    await recordAudit(req, { action: 'billing.plan_created', targetType: 'subscription_plan', targetId: plan.id, metadata: { slug: plan.slug } });
    res.status(201).json({ plan });
  } catch (err) {
    handleError(res, err, 'Failed to create plan');
  }
});

adminRouter.patch('/billing/plans/:id', requirePermission('billing:manage'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const plan = await billingService.updatePlan(id, req.body || {});
    await recordAudit(req, { action: 'billing.plan_updated', targetType: 'subscription_plan', targetId: id });
    res.json({ plan });
  } catch (err) {
    handleError(res, err, 'Failed to update plan');
  }
});

adminRouter.get('/subscriptions', requirePermission('billing:view'), async (req: AdminRequest, res: Response) => {
  try {
    const subscriptions = await billingService.listSubscriptions(req.adminContext!, queryStr(req.query.status));
    res.json({ subscriptions });
  } catch (err) {
    handleError(res, err, 'Failed to list subscriptions');
  }
});

adminRouter.post('/subscriptions', requirePermission('billing:manage'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const subscription = await billingService.assignSubscription(req.adminContext!, req.body || {});
    await recordAudit(req, { action: 'billing.subscription_assigned', targetType: 'subscription', targetId: subscription.id, organizationId: subscription.organization_id });
    analyticsService.clearCache();
    res.status(201).json({ subscription });
  } catch (err) {
    handleError(res, err, 'Failed to assign subscription');
  }
});

adminRouter.post('/subscriptions/:id/cancel', requirePermission('billing:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const subscription = await billingService.cancelSubscription(req.adminContext!, id);
    await recordAudit(req, { action: 'billing.subscription_cancelled', targetType: 'subscription', targetId: id });
    analyticsService.clearCache();
    res.json({ subscription });
  } catch (err) {
    handleError(res, err, 'Failed to cancel subscription');
  }
});

adminRouter.get('/payments', requirePermission('billing:view'), async (req: AdminRequest, res: Response) => {
  try {
    const payments = await billingService.listPayments(req.adminContext!, queryStr(req.query.status));
    res.json({ payments });
  } catch (err) {
    handleError(res, err, 'Failed to list payments');
  }
});

adminRouter.post('/payments/:id/refund', requirePermission('billing:refund'), requirePlatformAdminOnly, adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const payment = await billingService.refundPayment(req.adminContext!, id, req.body?.amountCents);
    await recordAudit(req, { action: 'billing.payment_refunded', targetType: 'payment', targetId: id, metadata: { amountCents: payment?.refunded_cents } });
    res.json({ payment });
  } catch (err) {
    handleError(res, err, 'Failed to refund payment');
  }
});

adminRouter.get('/invoices', requirePermission('billing:view'), async (req: AdminRequest, res: Response) => {
  try {
    const invoices = await billingService.listInvoices(req.adminContext!);
    res.json({ invoices });
  } catch (err) {
    handleError(res, err, 'Failed to list invoices');
  }
});

adminRouter.get('/coupons', requirePermission('billing:view'), requirePlatformAdminOnly, async (_req: AdminRequest, res: Response) => {
  try {
    const coupons = await billingService.listCoupons();
    res.json({ coupons });
  } catch (err) {
    handleError(res, err, 'Failed to list coupons');
  }
});

adminRouter.post('/coupons', requirePermission('billing:manage'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const coupon = await billingService.createCoupon(req.adminContext!, req.body || {});
    await recordAudit(req, { action: 'billing.coupon_created', targetType: 'coupon', targetId: coupon.id, metadata: { code: coupon.code } });
    res.status(201).json({ coupon });
  } catch (err) {
    handleError(res, err, 'Failed to create coupon');
  }
});

adminRouter.patch('/coupons/:id', requirePermission('billing:manage'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const coupon = await billingService.toggleCoupon(id, Boolean(req.body?.isActive));
    await recordAudit(req, { action: 'billing.coupon_updated', targetType: 'coupon', targetId: id, metadata: { isActive: Boolean(req.body?.isActive) } });
    res.json({ coupon });
  } catch (err) {
    handleError(res, err, 'Failed to update coupon');
  }
});

// ==================== SUPPORT, MODERATION & COMMUNICATIONS ====================
adminRouter.get('/support/tickets', requirePermission('support:view'), async (req: AdminRequest, res: Response) => {
  try {
    const data = await supportService.listTickets(req.adminContext!, {
      status: queryStr(req.query.status),
      priority: queryStr(req.query.priority),
      category: queryStr(req.query.category),
      assignedAdminId: queryStr(req.query.assignedAdminId),
      search: queryStr(req.query.search),
    });
    res.json(data);
  } catch (err) {
    handleError(res, err, 'Failed to list support tickets');
  }
});

adminRouter.post('/support/tickets', requirePermission('support:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const ticket = await supportService.createTicket(req.adminContext!, req.body || {});
    await recordAudit(req, { action: 'support.ticket_created', targetType: 'support_ticket', targetId: ticket.id });
    res.status(201).json({ ticket });
  } catch (err) {
    handleError(res, err, 'Failed to create support ticket');
  }
});

adminRouter.get('/support/tickets/:id', requirePermission('support:view'), async (req: AdminRequest, res: Response) => {
  try {
    const detail = await supportService.getTicketDetail(req.adminContext!, paramStr(req.params.id));
    res.json(detail);
  } catch (err) {
    handleError(res, err, 'Failed to fetch support ticket');
  }
});

adminRouter.post('/support/tickets/:id/reply', requirePermission('support:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const message = await supportService.replyToTicket(req.adminContext!, id, req.body || {});
    await recordAudit(req, { action: 'support.ticket_replied', targetType: 'support_ticket', targetId: id, metadata: { isInternal: Boolean(req.body?.isInternal) } });
    res.status(201).json({ message });
  } catch (err) {
    handleError(res, err, 'Failed to reply to ticket');
  }
});

adminRouter.patch('/support/tickets/:id', requirePermission('support:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const ticket = await supportService.updateTicket(req.adminContext!, id, req.body || {});
    await recordAudit(req, { action: 'support.ticket_updated', targetType: 'support_ticket', targetId: id, metadata: { fields: Object.keys(req.body || {}) } });
    res.json({ ticket });
  } catch (err) {
    handleError(res, err, 'Failed to update ticket');
  }
});

adminRouter.get('/moderation/reports', requirePermission('moderation:view'), async (req: AdminRequest, res: Response) => {
  try {
    const reports = await supportService.listModerationReports(req.adminContext!, queryStr(req.query.status));
    res.json({ reports });
  } catch (err) {
    handleError(res, err, 'Failed to list moderation reports');
  }
});

adminRouter.post('/moderation/reports', requirePermission('moderation:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const report = await supportService.createModerationReport(req.adminContext!, req.body || {});
    await recordAudit(req, { action: 'moderation.report_created', targetType: 'moderation_report', targetId: report.id });
    res.status(201).json({ report });
  } catch (err) {
    handleError(res, err, 'Failed to create moderation report');
  }
});

adminRouter.patch('/moderation/reports/:id', requirePermission('moderation:manage'), async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const report = await supportService.resolveModerationReport(req.adminContext!, id, req.body || {});
    await recordAudit(req, { action: 'moderation.report_updated', targetType: 'moderation_report', targetId: id, metadata: { status: req.body?.status } });
    res.json({ report });
  } catch (err) {
    handleError(res, err, 'Failed to update moderation report');
  }
});

adminRouter.get('/announcements', requirePermission('announcements:view'), async (_req: AdminRequest, res: Response) => {
  try {
    const announcements = await commsService.listAnnouncements();
    res.json({ announcements });
  } catch (err) {
    handleError(res, err, 'Failed to list announcements');
  }
});

adminRouter.post('/announcements', requirePermission('announcements:manage'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const announcement = await commsService.createAnnouncement(req.adminContext!, req.body || {});
    await recordAudit(req, { action: 'announcement.created', targetType: 'announcement', targetId: announcement.id, metadata: { status: announcement.status } });
    res.status(201).json({ announcement });
  } catch (err) {
    handleError(res, err, 'Failed to create announcement');
  }
});

adminRouter.patch('/announcements/:id', requirePermission('announcements:manage'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const announcement = await commsService.updateAnnouncement(id, req.body || {});
    await recordAudit(req, { action: 'announcement.updated', targetType: 'announcement', targetId: id, metadata: { status: announcement.status } });
    res.json({ announcement });
  } catch (err) {
    handleError(res, err, 'Failed to update announcement');
  }
});

adminRouter.get('/notifications', requirePermission('notifications:view'), async (req: AdminRequest, res: Response) => {
  try {
    const data = await commsService.listAdminNotifications(req.adminContext!);
    res.json(data);
  } catch (err) {
    handleError(res, err, 'Failed to load notifications');
  }
});

adminRouter.post('/notifications/:id/read', requirePermission('notifications:view'), async (req: AdminRequest, res: Response) => {
  try {
    await commsService.markNotificationRead(req.adminContext!, paramStr(req.params.id));
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'Failed to mark notification read');
  }
});

// ==================== INFRASTRUCTURE MONITORING ====================
adminRouter.get('/infrastructure/overview', requirePermission('health:view'), requirePlatformAdminOnly, async (_req: AdminRequest, res: Response) => {
  try {
    const data = await infrastructureService.getOverview();
    res.json(data);
  } catch (err) {
    handleError(res, err, 'Failed to load infrastructure overview');
  }
});

adminRouter.get('/infrastructure/sfu', requirePermission('infrastructure:view'), requirePlatformAdminOnly, async (_req: AdminRequest, res: Response) => {
  try {
    res.json(await infrastructureService.getSfuStatus());
  } catch (err) {
    handleError(res, err, 'Failed to load SFU status');
  }
});

adminRouter.get('/infrastructure/jitsi', requirePermission('infrastructure:view'), requirePlatformAdminOnly, async (_req: AdminRequest, res: Response) => {
  try {
    res.json(await infrastructureService.getJitsiStatus());
  } catch (err) {
    handleError(res, err, 'Failed to load Jitsi status');
  }
});

adminRouter.get('/infrastructure/turn', requirePermission('infrastructure:view'), requirePlatformAdminOnly, async (_req: AdminRequest, res: Response) => {
  try {
    res.json(await infrastructureService.getTurnStatus());
  } catch (err) {
    handleError(res, err, 'Failed to load TURN status');
  }
});

adminRouter.get('/infrastructure/redis', requirePermission('infrastructure:view'), requirePlatformAdminOnly, async (_req: AdminRequest, res: Response) => {
  try {
    res.json(await infrastructureService.getRedisStatus());
  } catch (err) {
    handleError(res, err, 'Failed to load Redis status');
  }
});

adminRouter.get('/infrastructure/api', requirePermission('infrastructure:view'), requirePlatformAdminOnly, async (_req: AdminRequest, res: Response) => {
  try {
    res.json(await infrastructureService.getApiAndDbStatus());
  } catch (err) {
    handleError(res, err, 'Failed to load API metrics');
  }
});

adminRouter.get('/infrastructure/logs', requirePermission('infrastructure:view'), requirePlatformAdminOnly, (req: AdminRequest, res: Response) => {
  const logs = infrastructureService.getSystemLogs({
    level: queryStr(req.query.level),
    source: queryStr(req.query.source),
    limit: Number(req.query.limit) || 100,
  });
  res.json({ logs });
});

adminRouter.get('/infrastructure/alerts', requirePermission('health:view'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const alerts = await infrastructureService.listAlerts(queryStr(req.query.status));
    res.json({ alerts });
  } catch (err) {
    handleError(res, err, 'Failed to list alerts');
  }
});

adminRouter.post('/infrastructure/alerts', requirePermission('infrastructure:manage'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const alert = await infrastructureService.createAlert(req.body || {});
    await recordAudit(req, { action: 'infrastructure.alert_created', targetType: 'system_alert', targetId: alert.id });
    res.status(201).json({ alert });
  } catch (err) {
    handleError(res, err, 'Failed to create alert');
  }
});

adminRouter.post('/infrastructure/alerts/:id/acknowledge', requirePermission('infrastructure:manage'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const alert = await infrastructureService.acknowledgeAlert(id, req.adminContext!.userId);
    await recordAudit(req, { action: 'infrastructure.alert_acknowledged', targetType: 'system_alert', targetId: id });
    res.json({ alert });
  } catch (err) {
    handleError(res, err, 'Failed to acknowledge alert');
  }
});

adminRouter.post('/infrastructure/alerts/:id/resolve', requirePermission('infrastructure:manage'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const alert = await infrastructureService.resolveAlert(id, req.adminContext!.userId);
    await recordAudit(req, { action: 'infrastructure.alert_resolved', targetType: 'system_alert', targetId: id });
    res.json({ alert });
  } catch (err) {
    handleError(res, err, 'Failed to resolve alert');
  }
});

// ==================== SECURITY CENTER & AUDIT LOGS ====================
adminRouter.get('/security/overview', requirePermission('security:view'), requirePlatformAdminOnly, async (_req: AdminRequest, res: Response) => {
  try {
    res.json(await securityService.getSecurityOverview());
  } catch (err) {
    handleError(res, err, 'Failed to load security overview');
  }
});

adminRouter.get('/security/events', requirePermission('security:view'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const data = await securityService.listSecurityEvents({
      eventType: queryStr(req.query.eventType),
      severity: queryStr(req.query.severity),
      search: queryStr(req.query.search),
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 30,
    });
    res.json(data);
  } catch (err) {
    handleError(res, err, 'Failed to list security events');
  }
});

adminRouter.get('/security/sessions', requirePermission('security:sessions'), async (req: AdminRequest, res: Response) => {
  try {
    const sessions = await securityService.listActiveSessions(req.adminContext!);
    res.json({ sessions });
  } catch (err) {
    handleError(res, err, 'Failed to list active sessions');
  }
});

adminRouter.delete('/security/sessions/:id', requirePermission('security:sessions'), adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    await securityService.revokeSession(req.adminContext!, id);
    await recordAudit(req, { action: 'security.session_revoked', targetType: 'session', targetId: id });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'Failed to revoke session');
  }
});

adminRouter.get('/security/api-keys', requirePermission('security:api_keys'), async (req: AdminRequest, res: Response) => {
  try {
    const apiKeys = await securityService.listApiKeys(req.adminContext!);
    res.json({ apiKeys });
  } catch (err) {
    handleError(res, err, 'Failed to list API keys');
  }
});

adminRouter.post('/security/api-keys', requirePermission('security:api_keys'), adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const result = await securityService.createApiKey(req.adminContext!, req.body || {});
    await recordAudit(req, { action: 'security.api_key_created', targetType: 'api_key', targetId: result.apiKey.id, metadata: { name: result.apiKey.name, scopes: result.apiKey.scopes } });
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, 'Failed to create API key');
  }
});

adminRouter.delete('/security/api-keys/:id', requirePermission('security:api_keys'), adminSensitiveActionLimiter, async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    await securityService.revokeApiKey(req.adminContext!, id);
    await recordAudit(req, { action: 'security.api_key_revoked', targetType: 'api_key', targetId: id });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'Failed to revoke API key');
  }
});

adminRouter.get('/audit-logs', requirePermission('audit:view'), async (req: AdminRequest, res: Response) => {
  try {
    const ctx = req.adminContext!;
    const data = await adminStore.listAuditLogs({
      action: queryStr(req.query.action),
      actorId: queryStr(req.query.actorId),
      targetType: queryStr(req.query.targetType),
      organizationId: ctx.scopedOrganizationId || queryStr(req.query.organizationId),
      status: queryStr(req.query.status),
      search: queryStr(req.query.search),
      from: queryStr(req.query.from) ? new Date(queryStr(req.query.from)!) : undefined,
      to: queryStr(req.query.to) ? new Date(queryStr(req.query.to)!) : undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 30,
    });
    res.json({ logs: data.items, total: data.total });
  } catch (err) {
    handleError(res, err, 'Failed to list audit logs');
  }
});

adminRouter.get('/audit-logs/export', requirePermission('audit:export'), async (req: AdminRequest, res: Response) => {
  try {
    const ctx = req.adminContext!;
    const data = await adminStore.listAuditLogs({
      action: queryStr(req.query.action),
      organizationId: ctx.scopedOrganizationId || queryStr(req.query.organizationId),
      search: queryStr(req.query.search),
      page: 1,
      limit: 200,
    });
    await recordAudit(req, { action: 'audit.exported_csv', targetType: 'audit_log', metadata: { count: data.items.length } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="faceonn-audit-logs.csv"');
    res.send(auditLogsToCsv(data.items));
  } catch (err) {
    handleError(res, err, 'Failed to export audit logs');
  }
});

// ==================== PLATFORM CONFIGURATION & FEATURE FLAGS ====================
adminRouter.get('/settings', requirePermission('settings:view'), requirePlatformAdminOnly, async (_req: AdminRequest, res: Response) => {
  try {
    const settings = await configService.getSettings();
    res.json({ settings });
  } catch (err) {
    handleError(res, err, 'Failed to load settings');
  }
});

adminRouter.patch('/settings', requirePermission('settings:manage'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const body = req.body || {};
    const section = typeof body.section === 'string' ? body.section : 'general';
    const values = body.values && typeof body.values === 'object' ? body.values : body;
    if ((section === 'maintenance_mode' || section === 'access_policies') && !req.adminContext!.isSuperAdmin) {
      res.status(403).json({ error: 'Forbidden: Only Super Admin can modify critical platform settings' });
      return;
    }
    const updated = await configService.updateSettingsSection(section, values, req.adminContext!.userId);
    await recordAudit(req, { action: 'settings.updated', targetType: 'platform_settings', targetId: section, metadata: { keys: Object.keys(values) } });
    res.json({ section, settings: updated });
  } catch (err) {
    handleError(res, err, 'Failed to update settings');
  }
});

adminRouter.patch('/settings/:section', requirePermission('settings:manage'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const section = paramStr(req.params.section);
    if ((section === 'maintenance_mode' || section === 'access_policies') && !req.adminContext!.isSuperAdmin) {
      res.status(403).json({ error: 'Forbidden: Only Super Admin can modify critical platform settings' });
      return;
    }
    const updated = await configService.updateSettingsSection(section, req.body || {}, req.adminContext!.userId);
    await recordAudit(req, { action: 'settings.updated', targetType: 'platform_settings', targetId: section, metadata: { keys: Object.keys(req.body || {}) } });
    res.json({ section, settings: updated });
  } catch (err) {
    handleError(res, err, 'Failed to update settings section');
  }
});

adminRouter.get('/feature-flags', requirePermission('feature_flags:view'), requirePlatformAdminOnly, async (_req: AdminRequest, res: Response) => {
  try {
    const featureFlags = await configService.listFeatureFlags();
    res.json({ featureFlags });
  } catch (err) {
    handleError(res, err, 'Failed to list feature flags');
  }
});

adminRouter.patch('/feature-flags/:id', requirePermission('feature_flags:manage'), requirePlatformAdminOnly, async (req: AdminRequest, res: Response) => {
  try {
    const id = paramStr(req.params.id);
    const updated = await configService.updateFeatureFlag(
      id,
      {
        enabledGlobally: req.body?.enabledGlobally,
        orgOverrides: req.body?.orgOverrides,
      },
      req.adminContext!.userId
    );
    await recordAudit(req, { action: 'feature_flag.updated', targetType: 'feature_flag', targetId: updated.key, metadata: { enabledGlobally: updated.enabled_globally } });
    res.json({ featureFlag: updated });
  } catch (err) {
    handleError(res, err, 'Failed to update feature flag');
  }
});
