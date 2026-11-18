import { OrganizationRole, PlatformAdminRole, UserRecord } from '../db/types';
import { adminStore } from '../db/repositories/admin-store';

export type AdminPermission =
  | 'dashboard:view'
  | 'dashboard:analytics:full'
  | 'live:view'
  | 'live:control'
  | 'health:view'
  | 'users:view'
  | 'users:manage'
  | 'users:delete'
  | 'users:sessions'
  | 'users:export'
  | 'roles:view'
  | 'roles:manage'
  | 'organizations:view'
  | 'organizations:manage'
  | 'organizations:delete'
  | 'organizations:policies'
  | 'meetings:view'
  | 'meetings:manage'
  | 'meetings:terminate'
  | 'recordings:view'
  | 'recordings:manage'
  | 'recordings:media_access'
  | 'support:view'
  | 'support:manage'
  | 'moderation:view'
  | 'moderation:manage'
  | 'announcements:view'
  | 'announcements:manage'
  | 'billing:view'
  | 'billing:manage'
  | 'billing:refund'
  | 'infrastructure:view'
  | 'infrastructure:manage'
  | 'security:view'
  | 'security:manage'
  | 'security:sessions'
  | 'security:api_keys'
  | 'audit:view'
  | 'audit:export'
  | 'settings:view'
  | 'settings:manage'
  | 'settings:critical'
  | 'feature_flags:view'
  | 'feature_flags:manage'
  | 'notifications:view';

export interface RoleDefinition {
  slug: PlatformAdminRole | OrganizationRole;
  name: string;
  scope: 'platform' | 'organization';
  description: string;
  permissions: AdminPermission[];
}

export const ALL_PERMISSIONS: AdminPermission[] = [
  'dashboard:view',
  'dashboard:analytics:full',
  'live:view',
  'live:control',
  'health:view',
  'users:view',
  'users:manage',
  'users:delete',
  'users:sessions',
  'users:export',
  'roles:view',
  'roles:manage',
  'organizations:view',
  'organizations:manage',
  'organizations:delete',
  'organizations:policies',
  'meetings:view',
  'meetings:manage',
  'meetings:terminate',
  'recordings:view',
  'recordings:manage',
  'recordings:media_access',
  'support:view',
  'support:manage',
  'moderation:view',
  'moderation:manage',
  'announcements:view',
  'announcements:manage',
  'billing:view',
  'billing:manage',
  'billing:refund',
  'infrastructure:view',
  'infrastructure:manage',
  'security:view',
  'security:manage',
  'security:sessions',
  'security:api_keys',
  'audit:view',
  'audit:export',
  'settings:view',
  'settings:manage',
  'settings:critical',
  'feature_flags:view',
  'feature_flags:manage',
  'notifications:view',
];

export const ROLE_DEFINITIONS: Record<PlatformAdminRole | OrganizationRole, RoleDefinition> = {
  super_admin: {
    slug: 'super_admin',
    name: 'Super Admin',
    scope: 'platform',
    description: 'Complete platform access across users, organizations, billing, infrastructure, security, settings, and administrators.',
    permissions: [...ALL_PERMISSIONS],
  },
  platform_admin: {
    slug: 'platform_admin',
    name: 'Platform Admin',
    scope: 'platform',
    description: 'Manages users, organizations, meetings, support, moderation, and announcements. Cannot modify super admins, critical infrastructure, or billing refunds.',
    permissions: [
      'dashboard:view',
      'live:view',
      'live:control',
      'health:view',
      'users:view',
      'users:manage',
      'users:sessions',
      'users:export',
      'roles:view',
      'organizations:view',
      'organizations:manage',
      'organizations:policies',
      'meetings:view',
      'meetings:manage',
      'meetings:terminate',
      'recordings:view',
      'recordings:manage',
      'support:view',
      'support:manage',
      'moderation:view',
      'moderation:manage',
      'announcements:view',
      'announcements:manage',
      'audit:view',
      'settings:view',
      'feature_flags:view',
      'notifications:view',
    ],
  },
  support_admin: {
    slug: 'support_admin',
    name: 'Support Admin',
    scope: 'platform',
    description: 'Views user profiles and meeting metadata, manages support tickets and diagnostics. No access to private recordings, billing, or infrastructure changes.',
    permissions: [
      'dashboard:view',
      'health:view',
      'users:view',
      'meetings:view',
      'support:view',
      'support:manage',
      'moderation:view',
      'moderation:manage',
      'announcements:view',
      'notifications:view',
    ],
  },
  billing_admin: {
    slug: 'billing_admin',
    name: 'Billing Admin',
    scope: 'platform',
    description: 'Manages subscription plans, subscriptions, payments, invoices, coupons, refunds, and revenue analytics.',
    permissions: [
      'dashboard:view',
      'organizations:view',
      'billing:view',
      'billing:manage',
      'billing:refund',
      'audit:view',
      'notifications:view',
    ],
  },
  technical_admin: {
    slug: 'technical_admin',
    name: 'Technical Admin',
    scope: 'platform',
    description: 'Manages SFU servers, TURN, Jitsi nodes, Redis, Socket.IO, API monitoring, alerts, system logs, and technical configuration.',
    permissions: [
      'dashboard:view',
      'live:view',
      'health:view',
      'meetings:view',
      'infrastructure:view',
      'infrastructure:manage',
      'security:view',
      'audit:view',
      'settings:view',
      'settings:manage',
      'feature_flags:view',
      'feature_flags:manage',
      'notifications:view',
    ],
  },
  org_owner: {
    slug: 'org_owner',
    name: 'Organization Owner',
    scope: 'organization',
    description: 'Full administrative control scoped strictly to their own organization.',
    permissions: [
      'dashboard:view',
      'live:view',
      'live:control',
      'users:view',
      'users:manage',
      'organizations:view',
      'organizations:manage',
      'organizations:policies',
      'meetings:view',
      'meetings:manage',
      'meetings:terminate',
      'recordings:view',
      'recordings:manage',
      'billing:view',
      'support:view',
      'audit:view',
      'notifications:view',
    ],
  },
  org_admin: {
    slug: 'org_admin',
    name: 'Organization Admin',
    scope: 'organization',
    description: 'Manages organization members, policies, and meetings scoped strictly to their own organization.',
    permissions: [
      'dashboard:view',
      'live:view',
      'users:view',
      'users:manage',
      'organizations:view',
      'organizations:manage',
      'organizations:policies',
      'meetings:view',
      'meetings:manage',
      'meetings:terminate',
      'recordings:view',
      'support:view',
      'audit:view',
      'notifications:view',
    ],
  },
  meeting_admin: {
    slug: 'meeting_admin',
    name: 'Meeting Administrator',
    scope: 'organization',
    description: 'Manages meetings, scheduled series, and live meetings scoped to their own organization.',
    permissions: [
      'dashboard:view',
      'live:view',
      'live:control',
      'meetings:view',
      'meetings:manage',
      'meetings:terminate',
      'recordings:view',
      'notifications:view',
    ],
  },
  member: {
    slug: 'member',
    name: 'Member',
    scope: 'organization',
    description: 'Standard organization member without admin console access.',
    permissions: [],
  },
  guest: {
    slug: 'guest',
    name: 'Guest',
    scope: 'organization',
    description: 'External meeting guest without admin console access.',
    permissions: [],
  },
};

export const PLATFORM_ADMIN_ROLES: PlatformAdminRole[] = [
  'super_admin',
  'platform_admin',
  'support_admin',
  'billing_admin',
  'technical_admin',
];

export const ORG_ADMIN_ROLES: OrganizationRole[] = [
  'org_owner',
  'org_admin',
  'meeting_admin',
];

export interface AdminContext {
  userId: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
  isSuperAdmin: boolean;
  isOrgAdmin: boolean;
  platformRole: PlatformAdminRole | null;
  orgRole: OrganizationRole | null;
  /** When non-null, ALL queries and mutations MUST be scoped to this organization ID */
  scopedOrganizationId: string | null;
  permissions: Set<AdminPermission>;
}

export function resolvePlatformRole(user: UserRecord): PlatformAdminRole | null {
  if (user.admin_role && PLATFORM_ADMIN_ROLES.includes(user.admin_role)) {
    return user.admin_role;
  }
  if (user.role === 'admin') {
    return 'super_admin';
  }
  return null;
}

export async function resolveAdminContext(user: UserRecord): Promise<AdminContext | null> {
  const platformRole = resolvePlatformRole(user);
  if (platformRole) {
    const def = ROLE_DEFINITIONS[platformRole];
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      isPlatformAdmin: true,
      isSuperAdmin: platformRole === 'super_admin',
      isOrgAdmin: false,
      platformRole,
      orgRole: null,
      scopedOrganizationId: null,
      permissions: new Set(def.permissions),
    };
  }

  // Check organization-level admin membership
  const memberships = await adminStore.findUserOrgMemberships(user.id);
  const adminMembership = memberships.find((m) => ORG_ADMIN_ROLES.includes(m.role));
  if (adminMembership) {
    const def = ROLE_DEFINITIONS[adminMembership.role];
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      isPlatformAdmin: false,
      isSuperAdmin: false,
      isOrgAdmin: true,
      platformRole: null,
      orgRole: adminMembership.role,
      scopedOrganizationId: adminMembership.organization_id,
      permissions: new Set(def.permissions),
    };
  }

  return null;
}

export function hasPermission(ctx: AdminContext, permission: AdminPermission): boolean {
  if (ctx.isSuperAdmin) return true;
  return ctx.permissions.has(permission);
}

export function assertOrgScope(ctx: AdminContext, targetOrgId: string | null | undefined): void {
  if (ctx.isPlatformAdmin) return;
  if (!ctx.scopedOrganizationId || !targetOrgId || ctx.scopedOrganizationId !== targetOrgId) {
    const err: any = new Error('Forbidden: Organization boundary violation');
    err.statusCode = 403;
    throw err;
  }
}

export function isValidPlatformAdminRole(role: unknown): role is PlatformAdminRole {
  return typeof role === 'string' && PLATFORM_ADMIN_ROLES.includes(role as PlatformAdminRole);
}

export function isValidOrgRole(role: unknown): role is OrganizationRole {
  return typeof role === 'string' && ['org_owner', 'org_admin', 'meeting_admin', 'member', 'guest'].includes(role);
}

