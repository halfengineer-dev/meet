import crypto from 'crypto';
import {
  adminStore,
  DEFAULT_ORG_POLICIES,
  OrganizationBranding,
  OrganizationPolicies,
  OrganizationRecord,
} from '../db/repositories/admin-store';
import { userRepository } from '../db/repositories/user-repository';
import { meetingRepository } from '../db/repositories/meeting-repository';
import { meetingSessionRepository } from '../db/repositories/meeting-session-repository';
import { MeetingSettings, OrganizationRole } from '../db/types';
import { AdminContext, assertOrgScope, isValidOrgRole } from './rbac';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `org-${Date.now()}`;
}

export class OrganizationService {
  public async listOrganizations(ctx: AdminContext, search?: string) {
    const orgs = await adminStore.listOrganizations(ctx.scopedOrganizationId);
    const q = (search || '').trim().toLowerCase();
    const allMeetings = await meetingRepository.listAllMeetings(ctx.scopedOrganizationId);
    const allSubs = await adminStore.listSubscriptions(ctx.scopedOrganizationId);
    const plans = await adminStore.listPlans();
    const planMap = new Map(plans.map((p) => [p.id, p]));

    const filtered = orgs.filter((o) => {
      if (!q) return true;
      return o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q);
    });

    const items = await Promise.all(
      filtered.map(async (org) => {
        const members = await adminStore.listOrgMembers(org.id);
        const owner = org.owner_user_id ? await userRepository.findById(org.owner_user_id) : null;
        const orgMeetings = allMeetings.filter((m) => m.organization_id === org.id);
        const activeSub = allSubs.find((s) => s.organization_id === org.id && (s.status === 'active' || s.status === 'trialing'));
        const plan = activeSub ? planMap.get(activeSub.plan_id) : null;

        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          status: org.status,
          planSlug: plan?.slug || org.plan_slug,
          planName: plan?.name || org.plan_slug,
          renewalDate: activeSub ? activeSub.current_period_end : null,
          owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
          memberCount: members.length,
          meetingCount: orgMeetings.length,
          storageUsedBytes: org.storage_used_bytes,
          branding: org.branding,
          policies: org.policies,
          createdAt: org.created_at.toISOString(),
          updatedAt: org.updated_at.toISOString(),
        };
      })
    );

    return { organizations: items, total: items.length };
  }

  public async getOrganizationDetail(ctx: AdminContext, orgId: string) {
    assertOrgScope(ctx, orgId);
    const org = await adminStore.findOrganizationById(orgId);
    if (!org) {
      const err: any = new Error('Organization not found');
      err.statusCode = 404;
      throw err;
    }

    const [members, invitations, meetings, sessions, recordings, subs, plans, owner] = await Promise.all([
      adminStore.listOrgMembers(org.id),
      adminStore.listOrgInvitations(org.id),
      meetingRepository.listAllMeetings(org.id),
      meetingSessionRepository.listAllSessions(1000),
      adminStore.listRecordings(org.id),
      adminStore.listSubscriptions(org.id),
      adminStore.listPlans(),
      org.owner_user_id ? userRepository.findById(org.owner_user_id) : Promise.resolve(null),
    ]);

    const memberDetails = await Promise.all(
      members.map(async (m) => {
        const u = await userRepository.findById(m.user_id);
        return {
          id: m.id,
          userId: m.user_id,
          role: m.role,
          status: m.status,
          joinedAt: m.joined_at,
          name: u?.name || null,
          email: u?.email || 'unknown',
          userStatus: u?.status || 'deactivated',
          lastLoginAt: u?.last_login_at || null,
        };
      })
    );

    const meetingIds = new Set(meetings.map((m) => m.id));
    const orgSessions = sessions.filter((s) => meetingIds.has(s.meeting_id));
    const totalMinutes = orgSessions.reduce((acc, s) => {
      const end = s.ended_at ? s.ended_at.getTime() : Date.now();
      return acc + Math.max(1, Math.round((end - s.started_at.getTime()) / 60000));
    }, 0);

    const thirtyDaysAgo = Date.now() - 30 * 86400 * 1000;
    const activeUsers = memberDetails.filter(
      (m) => m.lastLoginAt && new Date(m.lastLoginAt).getTime() >= thirtyDaysAgo
    ).length;

    const storageBytes = recordings.reduce((acc, r) => acc + (r.status !== 'deleted' ? r.file_size_bytes : 0), 0)
      || org.storage_used_bytes;

    const activeSub = subs.find((s) => s.status === 'active' || s.status === 'trialing') || null;
    const plan = activeSub ? plans.find((p) => p.id === activeSub.plan_id) : plans.find((p) => p.slug === org.plan_slug);

    return {
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        planSlug: plan?.slug || org.plan_slug,
        planName: plan?.name || org.plan_slug,
        owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
        branding: org.branding,
        policies: org.policies,
        createdAt: org.created_at.toISOString(),
        updatedAt: org.updated_at.toISOString(),
      },
      usage: {
        memberCount: memberDetails.length,
        activeUsers,
        totalMeetings: meetings.length,
        totalConferencingMinutes: totalMinutes,
        storageUsedBytes: storageBytes,
        recordingCount: recordings.filter((r) => r.status !== 'deleted').length,
      },
      subscription: activeSub
        ? {
            id: activeSub.id,
            planId: activeSub.plan_id,
            planName: plan?.name || org.plan_slug,
            status: activeSub.status,
            billingCycle: activeSub.billing_cycle,
            amountCents: activeSub.amount_cents,
            currency: activeSub.currency,
            renewalDate: activeSub.current_period_end,
          }
        : null,
      members: memberDetails,
      invitations,
    };
  }

  public async createOrganization(
    ctx: AdminContext,
    input: {
      name: string;
      slug?: string;
      ownerUserId?: string | null;
      planSlug?: string;
      branding?: OrganizationBranding;
      policies?: Partial<OrganizationPolicies>;
    }
  ): Promise<OrganizationRecord> {
    if (!ctx.isPlatformAdmin) {
      const err: any = new Error('Only platform administrators can create organizations');
      err.statusCode = 403;
      throw err;
    }

    const name = (input.name || '').trim();
    if (!name || name.length < 2) {
      throw new Error('Organization name must be at least 2 characters');
    }

    const slug = slugify(input.slug || name);
    let ownerId: string | null = null;
    if (input.ownerUserId) {
      const owner = await userRepository.findById(input.ownerUserId);
      if (!owner) throw new Error('Specified organization owner user not found');
      ownerId = owner.id;
    }

    const org = await adminStore.createOrganization({
      name,
      slug,
      owner_user_id: ownerId,
      plan_slug: input.planSlug || 'free',
      branding: input.branding || {},
      policies: { ...DEFAULT_ORG_POLICIES, ...(input.policies || {}) },
    });

    if (ownerId) {
      await adminStore.upsertOrgMember(org.id, ownerId, 'org_owner');
      await userRepository.updateUser(ownerId, { organization_id: org.id });
    }

    await adminStore.createNotification({
      category: 'organization',
      severity: 'info',
      title: `New organization created: ${org.name}`,
      message: `Organization ${org.name} (${org.slug}) was created on plan ${org.plan_slug}.`,
      target_permission: 'organizations:view',
      metadata: { organizationId: org.id },
    }).catch(() => {});

    return org;
  }

  public async updateOrganization(
    ctx: AdminContext,
    orgId: string,
    updates: {
      name?: string;
      ownerUserId?: string | null;
      status?: 'active' | 'suspended';
      planSlug?: string;
      branding?: OrganizationBranding;
      policies?: Partial<OrganizationPolicies>;
    }
  ): Promise<OrganizationRecord> {
    assertOrgScope(ctx, orgId);
    const existing = await adminStore.findOrganizationById(orgId);
    if (!existing) {
      const err: any = new Error('Organization not found');
      err.statusCode = 404;
      throw err;
    }

    if (!ctx.isPlatformAdmin) {
      if (updates.status !== undefined) {
        const err: any = new Error('Only platform administrators can suspend or reactivate an organization');
        err.statusCode = 403;
        throw err;
      }
      if (updates.ownerUserId !== undefined && ctx.orgRole !== 'org_owner') {
        const err: any = new Error('Only the organization owner can transfer ownership');
        err.statusCode = 403;
        throw err;
      }
    }

    if (updates.ownerUserId) {
      const newOwner = await userRepository.findById(updates.ownerUserId);
      if (!newOwner) throw new Error('New owner user not found');
      await adminStore.upsertOrgMember(orgId, newOwner.id, 'org_owner');
      await userRepository.updateUser(newOwner.id, { organization_id: orgId });
    }

    const updated = await adminStore.updateOrganization(orgId, {
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.ownerUserId !== undefined ? { owner_user_id: updates.ownerUserId } : {}),
      ...(updates.status ? { status: updates.status } : {}),
      ...(updates.planSlug ? { plan_slug: updates.planSlug } : {}),
      ...(updates.branding ? { branding: updates.branding } : {}),
      ...(updates.policies ? { policies: { ...existing.policies, ...updates.policies } } : {}),
    });

    if (!updated) throw new Error('Failed to update organization');
    return updated;
  }

  public async deleteOrganization(ctx: AdminContext, orgId: string): Promise<void> {
    if (!ctx.isPlatformAdmin) {
      const err: any = new Error('Only platform administrators can delete organizations');
      err.statusCode = 403;
      throw err;
    }
    const ok = await adminStore.softDeleteOrganization(orgId);
    if (!ok) {
      const err: any = new Error('Organization not found');
      err.statusCode = 404;
      throw err;
    }
  }

  public async addMember(ctx: AdminContext, orgId: string, userId: string, role: OrganizationRole) {
    assertOrgScope(ctx, orgId);
    if (!isValidOrgRole(role)) throw new Error('Invalid organization role');
    const org = await adminStore.findOrganizationById(orgId);
    if (!org) throw new Error('Organization not found');
    const user = await userRepository.findById(userId);
    if (!user) throw new Error('User not found');

    if (role === 'org_owner' && !ctx.isPlatformAdmin && ctx.orgRole !== 'org_owner') {
      const err: any = new Error('Forbidden: Cannot assign organization owner role');
      err.statusCode = 403;
      throw err;
    }

    const member = await adminStore.upsertOrgMember(orgId, userId, role);
    await userRepository.updateUser(userId, { organization_id: orgId });
    return member;
  }

  public async removeMember(ctx: AdminContext, orgId: string, userId: string) {
    assertOrgScope(ctx, orgId);
    const org = await adminStore.findOrganizationById(orgId);
    if (!org) throw new Error('Organization not found');
    if (org.owner_user_id === userId) {
      throw new Error('Transfer organization ownership before removing the owner');
    }
    await adminStore.removeOrgMember(orgId, userId);
    const user = await userRepository.findById(userId);
    if (user && user.organization_id === orgId) {
      await userRepository.updateUser(userId, { organization_id: null });
    }
  }

  public async inviteMembers(
    ctx: AdminContext,
    orgId: string,
    entries: Array<{ email: string; role?: OrganizationRole }>
  ) {
    assertOrgScope(ctx, orgId);
    const org = await adminStore.findOrganizationById(orgId);
    if (!org) throw new Error('Organization not found');

    const created = [];
    const errors: Array<{ email: string; reason: string }> = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const entry of entries) {
      const email = (entry.email || '').trim().toLowerCase();
      if (!emailRegex.test(email)) {
        errors.push({ email: entry.email || '', reason: 'Invalid email address' });
        continue;
      }
      const role: OrganizationRole = entry.role && isValidOrgRole(entry.role) ? entry.role : 'member';
      const token = crypto.randomBytes(24).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const inv = await adminStore.createOrgInvitation({
        organization_id: orgId,
        email,
        role,
        invited_by: ctx.userId,
        token_hash: tokenHash,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 86400 * 1000),
      });
      created.push(inv);
    }

    return { invitations: created, errors };
  }

  /**
   * Parses CSV rows in format `email,role` (with optional header row) for bulk organization invitations.
   */
  public parseBulkCsvInvitations(csvText: string): Array<{ email: string; role?: OrganizationRole }> {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const entries: Array<{ email: string; role?: OrganizationRole }> = [];

    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      const first = parts[0]?.toLowerCase();
      if (i === 0 && (first === 'email' || first === 'user_email')) continue;
      if (!parts[0]) continue;
      const roleCandidate = parts[1]?.toLowerCase() as OrganizationRole | undefined;
      entries.push({
        email: parts[0],
        role: roleCandidate && isValidOrgRole(roleCandidate) ? roleCandidate : 'member',
      });
    }
    return entries;
  }

  /**
   * Backend enforcement of organization policies when creating or scheduling a meeting.
   */
  public async enforceMeetingPoliciesForUser(
    userId: string,
    input: {
      durationMinutes: number;
      isRecurring: boolean;
      hasPasscode: boolean;
      settings: MeetingSettings;
    }
  ): Promise<{ organizationId: string | null; durationMinutes: number; settings: MeetingSettings }> {
    const user = await userRepository.findById(userId);
    const orgId = user?.organization_id || null;
    if (!orgId) {
      return {
        organizationId: null,
        durationMinutes: input.durationMinutes,
        settings: input.settings,
      };
    }

    const org = await adminStore.findOrganizationById(orgId);
    if (!org) {
      return {
        organizationId: null,
        durationMinutes: input.durationMinutes,
        settings: input.settings,
      };
    }

    if (org.status === 'suspended') {
      throw new Error('Your organization is currently suspended. Contact your administrator.');
    }

    const p = org.policies;
    if (input.isRecurring && !p.recurringMeetingsEnabled) {
      throw new Error('Recurring meetings are disabled by your organization policy.');
    }
    if (p.passcodeRequired && !input.hasPasscode) {
      throw new Error('A meeting passcode is required by your organization policy.');
    }

    const enforcedDuration = Math.min(input.durationMinutes, p.maxMeetingDurationMinutes);
    const enforcedSettings: MeetingSettings = {
      ...input.settings,
      requireAuthentication: input.settings.requireAuthentication || p.requireAuthentication || !p.guestAccessEnabled,
      waitingRoomEnabled: input.settings.waitingRoomEnabled || p.waitingRoomDefault,
      allowScreenSharing: p.screenSharingEnabled ? input.settings.allowScreenSharing : false,
      allowChat: p.chatEnabled ? input.settings.allowChat : false,
      allowRecording: (p.cloudRecordingEnabled || p.localRecordingEnabled) ? input.settings.allowRecording : false,
    };

    return {
      organizationId: org.id,
      durationMinutes: enforcedDuration,
      settings: enforcedSettings,
    };
  }
}

export const organizationService = new OrganizationService();

