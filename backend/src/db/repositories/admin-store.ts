import { v4 as uuidv4 } from 'uuid';
import { getDatabasePool, isUsingPostgres, recordDbQueryLatency } from '../database';
import { OrganizationRole } from '../types';

export interface OrganizationPolicies {
  maxMeetingDurationMinutes: number;
  maxParticipants: number;
  requireAuthentication: boolean;
  waitingRoomDefault: boolean;
  passcodeRequired: boolean;
  cloudRecordingEnabled: boolean;
  localRecordingEnabled: boolean;
  screenSharingEnabled: boolean;
  chatEnabled: boolean;
  fileSharingEnabled: boolean;
  guestAccessEnabled: boolean;
  recurringMeetingsEnabled: boolean;
  meetingExpirationDays: number;
}

export interface OrganizationBranding {
  logoUrl?: string | null;
  primaryColor?: string | null;
  customDomain?: string | null;
  welcomeMessage?: string | null;
}

export const DEFAULT_ORG_POLICIES: OrganizationPolicies = {
  maxMeetingDurationMinutes: 240,
  maxParticipants: 100,
  requireAuthentication: false,
  waitingRoomDefault: true,
  passcodeRequired: false,
  cloudRecordingEnabled: false,
  localRecordingEnabled: true,
  screenSharingEnabled: true,
  chatEnabled: true,
  fileSharingEnabled: true,
  guestAccessEnabled: true,
  recurringMeetingsEnabled: true,
  meetingExpirationDays: 90,
};

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string | null;
  status: 'active' | 'suspended' | 'deleted';
  plan_slug: string;
  branding: OrganizationBranding;
  policies: OrganizationPolicies;
  storage_used_bytes: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrganizationMemberRecord {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  status: 'active' | 'suspended';
  joined_at: Date;
  updated_at: Date;
}

export interface OrganizationInvitationRecord {
  id: string;
  organization_id: string;
  email: string;
  role: OrganizationRole;
  invited_by: string | null;
  token_hash: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RecordingRecord {
  id: string;
  meeting_id: string | null;
  room_id: string | null;
  title: string;
  host_user_id: string | null;
  organization_id: string | null;
  duration_seconds: number;
  file_size_bytes: number;
  storage_provider: string;
  storage_key: string | null;
  status: 'processing' | 'available' | 'failed' | 'deleted' | 'expired';
  failure_reason: string | null;
  visibility: 'private' | 'organization' | 'restricted';
  retention_days: number;
  retention_expires_at: Date | null;
  deleted_at: Date | null;
  recorded_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionPlanRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_monthly_cents: number;
  price_yearly_cents: number;
  currency: string;
  max_meeting_minutes: number;
  max_participants: number;
  cloud_recording_gb: number;
  features: Record<string, boolean | number | string>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionRecord {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  plan_id: string;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired';
  billing_cycle: 'monthly' | 'yearly';
  amount_cents: number;
  currency: string;
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end: boolean;
  cancelled_at: Date | null;
  external_provider: string | null;
  external_subscription_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentRecord {
  id: string;
  subscription_id: string | null;
  user_id: string | null;
  organization_id: string | null;
  amount_cents: number;
  currency: string;
  status: 'succeeded' | 'pending' | 'failed' | 'refunded';
  payment_method_label: string | null;
  provider: string;
  provider_transaction_id: string | null;
  failure_reason: string | null;
  refunded_cents: number;
  refunded_at: Date | null;
  created_at: Date;
}

export interface InvoiceRecord {
  id: string;
  invoice_number: string;
  subscription_id: string | null;
  payment_id: string | null;
  user_id: string | null;
  organization_id: string | null;
  amount_cents: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  due_at: Date | null;
  paid_at: Date | null;
  line_items: Array<{ description: string; quantity: number; unit_amount_cents: number }>;
  created_at: Date;
}

export interface CouponRecord {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_redemptions: number | null;
  redemption_count: number;
  valid_until: Date | null;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
}

export interface SupportTicketRecord {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  user_id: string | null;
  user_email: string | null;
  organization_id: string | null;
  meeting_id: string | null;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_customer' | 'escalated' | 'resolved' | 'closed';
  assigned_admin_id: string | null;
  sla_due_at: Date | null;
  first_response_at: Date | null;
  resolved_at: Date | null;
  resolution_notes: string | null;
  csat_rating: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface SupportMessageRecord {
  id: string;
  ticket_id: string;
  author_user_id: string | null;
  author_name: string | null;
  is_internal: boolean;
  body: string;
  attachments: Array<{ name: string; url?: string; sizeBytes?: number }>;
  created_at: Date;
}

export interface ModerationReportRecord {
  id: string;
  reporter_user_id: string | null;
  reported_user_id: string | null;
  meeting_id: string | null;
  organization_id: string | null;
  category: string;
  reason: string;
  status: 'open' | 'investigating' | 'action_taken' | 'dismissed';
  resolution_notes: string | null;
  resolved_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical' | 'maintenance';
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  target_scope: 'all' | 'organizations' | 'plans';
  target_ids: string[];
  channels: string[];
  scheduled_at: Date | null;
  published_at: Date | null;
  expires_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AdminNotificationRecord {
  id: string;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  target_permission: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_by: string | null;
  read_at: Date | null;
  created_at: Date;
}

export interface AuditLogRecord {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  organization_id: string | null;
  status: 'success' | 'failure';
  correlation_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface SecurityEventRecord {
  id: string;
  event_type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  user_id: string | null;
  email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  country: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  rate_limit_per_min: number;
  organization_id: string | null;
  created_by: string | null;
  last_used_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

export interface FeatureFlagRecord {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled_globally: boolean;
  org_overrides: Record<string, boolean>;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SystemAlertRecord {
  id: string;
  source: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  acknowledged_by: string | null;
  acknowledged_at: Date | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export const DEFAULT_FEATURE_FLAGS: Array<{
  key: string;
  name: string;
  description: string;
  enabled_globally: boolean;
}> = [
  { key: 'cloud_recording', name: 'Cloud Recording', description: 'Allow server-side cloud recording for eligible rooms', enabled_globally: false },
  { key: 'ai_meeting_summary', name: 'AI Meeting Summary', description: 'Automated post-meeting summaries and action items', enabled_globally: false },
  { key: 'screen_sharing', name: 'Screen Sharing', description: 'Allow participants to share their screen', enabled_globally: true },
  { key: 'in_meeting_chat', name: 'In-meeting Chat', description: 'Enable real-time text chat inside meetings', enabled_globally: true },
  { key: 'file_sharing', name: 'File Sharing', description: 'Allow file attachments in meeting chat', enabled_globally: true },
  { key: 'virtual_backgrounds', name: 'Virtual Backgrounds', description: 'Client-side blur and custom background replacement', enabled_globally: true },
  { key: 'waiting_room', name: 'Waiting Room', description: 'Lobby/waiting room host admission controls', enabled_globally: true },
  { key: 'breakout_rooms', name: 'Breakout Rooms', description: 'Split large meetings into smaller breakout sessions', enabled_globally: true },
  { key: 'live_transcription', name: 'Live Transcription', description: 'Real-time captions and transcription service', enabled_globally: false },
  { key: 'youtube_sharing', name: 'YouTube Sharing', description: 'Shared video playback from YouTube links', enabled_globally: true },
  { key: 'embedded_browser', name: 'Embedded Browser', description: 'Collaborative embedded web view inside rooms', enabled_globally: false },
];

export const DEFAULT_PLATFORM_SETTINGS: Record<string, { category: string; value: Record<string, unknown> }> = {
  general: {
    category: 'general',
    value: {
      platformName: 'Faceonn',
      logoUrl: '/images/faceonn-neon-logo.png',
      faviconUrl: '/images/favicon.ico',
      supportEmail: 'support@faceonn.com',
      contactPhone: '',
      defaultTimezone: 'UTC',
      defaultLanguage: 'en',
    },
  },
  meeting_policies: {
    category: 'meeting_policies',
    value: {
      maxMeetingDurationMinutes: 480,
      defaultParticipantLimit: 100,
      defaultWaitingRoom: true,
      defaultPasscodeRequired: false,
      defaultJoinBeforeHost: false,
      defaultRecordingPolicy: 'disabled',
      guestAccessEnabled: true,
      meetingExpirationDays: 90,
    },
  },
  recording_policies: {
    category: 'recording_policies',
    value: {
      defaultRetentionDays: 90,
      maxStoragePerOrgGb: 50,
      allowOrgAdminsDownload: false,
      requireHostConsentBanner: true,
      autoDeleteExpired: true,
    },
  },
  registration_policies: {
    category: 'registration_policies',
    value: {
      allowPublicRegistration: false,
      requireEmailVerification: true,
      allowSocialLogin: false,
      allowOrganizationInvitations: true,
      restrictedEmailDomains: [],
    },
  },
  email_config: {
    category: 'email_config',
    value: {
      provider: 'smtp',
      fromAddress: 'no-reply@faceonn.com',
      fromName: 'Faceonn Conferencing',
      smtpHost: process.env.SMTP_HOST || '',
      smtpPort: Number(process.env.SMTP_PORT || 587),
      smtpConfigured: Boolean(process.env.SMTP_HOST),
    },
  },
  notifications: {
    category: 'notifications',
    value: {
      emailNotifications: true,
      meetingReminders: true,
      invitationEmails: true,
      recordingNotifications: true,
      securityAlerts: true,
      billingNotifications: true,
    },
  },
  access_policies: {
    category: 'access_policies',
    value: {
      sessionTimeoutMinutes: 10080,
      maxFailedLoginsBeforeLockout: 10,
      enforceStrongPasswords: true,
      allowAdminApiKeys: true,
      ipAllowlist: [],
    },
  },
  maintenance_mode: {
    category: 'maintenance',
    value: {
      enabled: false,
      message: 'Faceonn is currently undergoing scheduled maintenance. Please check back shortly.',
      scheduledStart: null,
      scheduledEnd: null,
      allowAdminAccess: true,
    },
  },
};

export const DEFAULT_SUBSCRIPTION_PLANS: Array<Omit<SubscriptionPlanRecord, 'id' | 'created_at' | 'updated_at'>> = [
  {
    slug: 'free',
    name: 'Free',
    description: 'Essential video meetings for small teams and personal use.',
    price_monthly_cents: 0,
    price_yearly_cents: 0,
    currency: 'USD',
    max_meeting_minutes: 40,
    max_participants: 50,
    cloud_recording_gb: 0,
    features: { cloudRecording: false, customBranding: false, breakoutRooms: false, sso: false },
    is_active: true,
  },
  {
    slug: 'pro',
    name: 'Pro',
    description: 'Extended meetings, cloud recording, and advanced host controls.',
    price_monthly_cents: 1500,
    price_yearly_cents: 14400,
    currency: 'USD',
    max_meeting_minutes: 300,
    max_participants: 150,
    cloud_recording_gb: 10,
    features: { cloudRecording: true, customBranding: false, breakoutRooms: true, sso: false },
    is_active: true,
  },
  {
    slug: 'business',
    name: 'Business',
    description: 'Organization management, security policies, analytics, and expanded cloud storage.',
    price_monthly_cents: 2900,
    price_yearly_cents: 28800,
    currency: 'USD',
    max_meeting_minutes: 720,
    max_participants: 300,
    cloud_recording_gb: 50,
    features: { cloudRecording: true, customBranding: true, breakoutRooms: true, sso: true },
    is_active: true,
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    description: 'Custom participant limits, dedicated support, compliance, and custom retention.',
    price_monthly_cents: 7900,
    price_yearly_cents: 79000,
    currency: 'USD',
    max_meeting_minutes: 1440,
    max_participants: 1000,
    cloud_recording_gb: 500,
    features: { cloudRecording: true, customBranding: true, breakoutRooms: true, sso: true, dedicatedSupport: true },
    is_active: true,
  },
];

function parseJson<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return val as T;
}

async function timedQuery(sql: string, params?: any[]) {
  const pool = getDatabasePool()!;
  const start = Date.now();
  try {
    const res = await pool.query(sql, params);
    recordDbQueryLatency(Date.now() - start);
    return res;
  } catch (err) {
    recordDbQueryLatency(Date.now() - start);
    throw err;
  }
}

class AdminStore {
  // In-memory maps for dev/test mode
  public organizations = new Map<string, OrganizationRecord>();
  public orgMembers = new Map<string, OrganizationMemberRecord>();
  public orgInvitations = new Map<string, OrganizationInvitationRecord>();
  public recordings = new Map<string, RecordingRecord>();
  public plans = new Map<string, SubscriptionPlanRecord>();
  public subscriptions = new Map<string, SubscriptionRecord>();
  public payments = new Map<string, PaymentRecord>();
  public invoices = new Map<string, InvoiceRecord>();
  public coupons = new Map<string, CouponRecord>();
  public tickets = new Map<string, SupportTicketRecord>();
  public ticketMessages = new Map<string, SupportMessageRecord[]>();
  public moderationReports = new Map<string, ModerationReportRecord>();
  public announcements = new Map<string, AnnouncementRecord>();
  public notifications = new Map<string, AdminNotificationRecord>();
  public auditLogs: AuditLogRecord[] = [];
  public securityEvents: SecurityEventRecord[] = [];
  public apiKeys = new Map<string, ApiKeyRecord>();
  public settings = new Map<string, { category: string; value: Record<string, unknown>; updated_by: string | null; updated_at: Date }>();
  public featureFlags = new Map<string, FeatureFlagRecord>();
  public systemAlerts = new Map<string, SystemAlertRecord>();

  private seededMemory = false;

  constructor() {
    this.ensureInMemorySeeds();
  }

  public ensureInMemorySeeds(): void {
    if (this.seededMemory) return;
    this.seededMemory = true;
    const now = new Date();

    for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
      const id = uuidv4();
      this.plans.set(id, { id, ...plan, created_at: now, updated_at: now });
    }

    for (const flag of DEFAULT_FEATURE_FLAGS) {
      const id = uuidv4();
      this.featureFlags.set(id, {
        id,
        key: flag.key,
        name: flag.name,
        description: flag.description,
        enabled_globally: flag.enabled_globally,
        org_overrides: {},
        updated_by: null,
        created_at: now,
        updated_at: now,
      });
    }

    for (const [key, entry] of Object.entries(DEFAULT_PLATFORM_SETTINGS)) {
      this.settings.set(key, {
        category: entry.category,
        value: { ...entry.value },
        updated_by: null,
        updated_at: now,
      });
    }
  }

  public async ensurePostgresSeeds(): Promise<void> {
    if (!isUsingPostgres()) {
      this.ensureInMemorySeeds();
      return;
    }

    for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
      await timedQuery(
        `INSERT INTO subscription_plans
         (id, slug, name, description, price_monthly_cents, price_yearly_cents, currency, max_meeting_minutes, max_participants, cloud_recording_gb, features, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (slug) DO NOTHING`,
        [
          uuidv4(),
          plan.slug,
          plan.name,
          plan.description,
          plan.price_monthly_cents,
          plan.price_yearly_cents,
          plan.currency,
          plan.max_meeting_minutes,
          plan.max_participants,
          plan.cloud_recording_gb,
          JSON.stringify(plan.features),
          plan.is_active,
        ]
      );
    }

    for (const flag of DEFAULT_FEATURE_FLAGS) {
      await timedQuery(
        `INSERT INTO feature_flags (id, key, name, description, enabled_globally, org_overrides)
         VALUES ($1, $2, $3, $4, $5, '{}'::jsonb)
         ON CONFLICT (key) DO NOTHING`,
        [uuidv4(), flag.key, flag.name, flag.description, flag.enabled_globally]
      );
    }

    for (const [key, entry] of Object.entries(DEFAULT_PLATFORM_SETTINGS)) {
      await timedQuery(
        `INSERT INTO platform_settings (key, category, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [key, entry.category, JSON.stringify(entry.value)]
      );
    }
  }

  // ==================== AUDIT LOGS ====================
  public async insertAuditLog(entry: Omit<AuditLogRecord, 'id' | 'created_at'>): Promise<AuditLogRecord> {
    const record: AuditLogRecord = {
      id: uuidv4(),
      ...entry,
      created_at: new Date(),
    };

    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO audit_logs
         (id, actor_id, actor_email, actor_role, action, target_type, target_id, organization_id, status, correlation_id, ip_address, user_agent, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          record.id,
          record.actor_id,
          record.actor_email,
          record.actor_role,
          record.action,
          record.target_type,
          record.target_id,
          record.organization_id,
          record.status,
          record.correlation_id,
          record.ip_address,
          record.user_agent,
          JSON.stringify(record.metadata || {}),
          record.created_at,
        ]
      );
      return record;
    }

    this.auditLogs.unshift(record);
    if (this.auditLogs.length > 5000) this.auditLogs.pop();
    return record;
  }

  public async listAuditLogs(filters: {
    action?: string;
    actorId?: string;
    targetType?: string;
    organizationId?: string;
    status?: string;
    search?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ items: AuditLogRecord[]; total: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 25));
    const offset = (page - 1) * limit;

    if (isUsingPostgres()) {
      const clauses: string[] = [];
      const params: any[] = [];
      const push = (cond: string, val: any) => {
        params.push(val);
        clauses.push(cond.replace('$?', `$${params.length}`));
      };

      if (filters.action) push('action = $?', filters.action);
      if (filters.actorId) push('actor_id = $?', filters.actorId);
      if (filters.targetType) push('target_type = $?', filters.targetType);
      if (filters.organizationId) push('organization_id = $?', filters.organizationId);
      if (filters.status) push('status = $?', filters.status);
      if (filters.from) push('created_at >= $?', filters.from);
      if (filters.to) push('created_at <= $?', filters.to);
      if (filters.search) {
        const pattern = `%${filters.search.toLowerCase()}%`;
        params.push(pattern);
        const idx = params.length;
        clauses.push(`(LOWER(action) LIKE $${idx} OR LOWER(COALESCE(actor_email, '')) LIKE $${idx} OR LOWER(COALESCE(target_id, '')) LIKE $${idx})`);
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRes = await timedQuery(`SELECT COUNT(*)::int AS total FROM audit_logs ${where}`, params);
      const total = countRes.rows[0]?.total || 0;

      params.push(limit, offset);
      const res = await timedQuery(
        `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return {
        total,
        items: res.rows.map((r: any) => ({
          ...r,
          metadata: parseJson(r.metadata, {}),
          created_at: new Date(r.created_at),
        })),
      };
    }

    const q = (filters.search || '').trim().toLowerCase();
    const filtered = this.auditLogs.filter((log) => {
      if (filters.action && log.action !== filters.action) return false;
      if (filters.actorId && log.actor_id !== filters.actorId) return false;
      if (filters.targetType && log.target_type !== filters.targetType) return false;
      if (filters.organizationId && log.organization_id !== filters.organizationId) return false;
      if (filters.status && log.status !== filters.status) return false;
      if (filters.from && log.created_at < filters.from) return false;
      if (filters.to && log.created_at > filters.to) return false;
      if (q) {
        const hay = `${log.action} ${log.actor_email || ''} ${log.target_type} ${log.target_id || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return {
      total: filtered.length,
      items: filtered.slice(offset, offset + limit),
    };
  }

  // ==================== SECURITY EVENTS ====================
  public async insertSecurityEvent(entry: Omit<SecurityEventRecord, 'id' | 'created_at'>): Promise<SecurityEventRecord> {
    const record: SecurityEventRecord = {
      id: uuidv4(),
      ...entry,
      created_at: new Date(),
    };

    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO security_events (id, event_type, severity, user_id, email, ip_address, user_agent, country, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          record.id,
          record.event_type,
          record.severity,
          record.user_id,
          record.email,
          record.ip_address,
          record.user_agent,
          record.country,
          JSON.stringify(record.metadata || {}),
          record.created_at,
        ]
      );
      return record;
    }

    this.securityEvents.unshift(record);
    if (this.securityEvents.length > 5000) this.securityEvents.pop();
    return record;
  }

  public async listSecurityEvents(filters: {
    eventType?: string;
    severity?: string;
    userId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: SecurityEventRecord[]; total: number }> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(200, Math.max(1, filters.limit || 25));
    const offset = (page - 1) * limit;

    if (isUsingPostgres()) {
      const clauses: string[] = [];
      const params: any[] = [];
      if (filters.eventType) {
        params.push(filters.eventType);
        clauses.push(`event_type = $${params.length}`);
      }
      if (filters.severity) {
        params.push(filters.severity);
        clauses.push(`severity = $${params.length}`);
      }
      if (filters.userId) {
        params.push(filters.userId);
        clauses.push(`user_id = $${params.length}`);
      }
      if (filters.search) {
        params.push(`%${filters.search.toLowerCase()}%`);
        const idx = params.length;
        clauses.push(`(LOWER(COALESCE(email, '')) LIKE $${idx} OR LOWER(event_type) LIKE $${idx} OR LOWER(COALESCE(ip_address, '')) LIKE $${idx})`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRes = await timedQuery(`SELECT COUNT(*)::int AS total FROM security_events ${where}`, params);
      params.push(limit, offset);
      const res = await timedQuery(
        `SELECT * FROM security_events ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return {
        total: countRes.rows[0]?.total || 0,
        items: res.rows.map((r: any) => ({
          ...r,
          metadata: parseJson(r.metadata, {}),
          created_at: new Date(r.created_at),
        })),
      };
    }

    const q = (filters.search || '').trim().toLowerCase();
    const filtered = this.securityEvents.filter((ev) => {
      if (filters.eventType && ev.event_type !== filters.eventType) return false;
      if (filters.severity && ev.severity !== filters.severity) return false;
      if (filters.userId && ev.user_id !== filters.userId) return false;
      if (q) {
        const hay = `${ev.event_type} ${ev.email || ''} ${ev.ip_address || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return { total: filtered.length, items: filtered.slice(offset, offset + limit) };
  }

  // ==================== ORGANIZATIONS ====================
  private normalizeOrg(r: any): OrganizationRecord {
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      owner_user_id: r.owner_user_id || null,
      status: r.status || 'active',
      plan_slug: r.plan_slug || 'free',
      branding: parseJson<OrganizationBranding>(r.branding, {}),
      policies: { ...DEFAULT_ORG_POLICIES, ...parseJson<Partial<OrganizationPolicies>>(r.policies, {}) },
      storage_used_bytes: Number(r.storage_used_bytes || 0),
      deleted_at: r.deleted_at ? new Date(r.deleted_at) : null,
      created_at: new Date(r.created_at),
      updated_at: new Date(r.updated_at),
    };
  }

  public async createOrganization(data: {
    name: string;
    slug: string;
    owner_user_id?: string | null;
    plan_slug?: string;
    branding?: OrganizationBranding;
    policies?: Partial<OrganizationPolicies>;
  }): Promise<OrganizationRecord> {
    const now = new Date();
    const record: OrganizationRecord = {
      id: uuidv4(),
      name: data.name.trim(),
      slug: data.slug.toLowerCase().trim(),
      owner_user_id: data.owner_user_id || null,
      status: 'active',
      plan_slug: data.plan_slug || 'free',
      branding: data.branding || {},
      policies: { ...DEFAULT_ORG_POLICIES, ...(data.policies || {}) },
      storage_used_bytes: 0,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    };

    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO organizations (id, name, slug, owner_user_id, status, plan_slug, branding, policies, storage_used_bytes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          record.id,
          record.name,
          record.slug,
          record.owner_user_id,
          record.status,
          record.plan_slug,
          JSON.stringify(record.branding),
          JSON.stringify(record.policies),
          record.storage_used_bytes,
          record.created_at,
          record.updated_at,
        ]
      );
      return record;
    }

    for (const existing of this.organizations.values()) {
      if (existing.slug === record.slug && !existing.deleted_at) {
        throw new Error('An organization with this slug already exists');
      }
    }
    this.organizations.set(record.id, { ...record });
    return record;
  }

  public async findOrganizationById(id: string): Promise<OrganizationRecord | null> {
    if (isUsingPostgres()) {
      const res = await timedQuery('SELECT * FROM organizations WHERE id = $1 AND deleted_at IS NULL LIMIT 1', [id]);
      return res.rows[0] ? this.normalizeOrg(res.rows[0]) : null;
    }
    const org = this.organizations.get(id);
    if (!org || org.deleted_at) return null;
    return { ...org, branding: { ...org.branding }, policies: { ...org.policies } };
  }

  public async listOrganizations(onlyOrgId?: string | null): Promise<OrganizationRecord[]> {
    if (isUsingPostgres()) {
      const res = onlyOrgId
        ? await timedQuery('SELECT * FROM organizations WHERE deleted_at IS NULL AND id = $1 ORDER BY created_at DESC', [onlyOrgId])
        : await timedQuery('SELECT * FROM organizations WHERE deleted_at IS NULL ORDER BY created_at DESC');
      return res.rows.map((r: any) => this.normalizeOrg(r));
    }

    const list: OrganizationRecord[] = [];
    for (const org of this.organizations.values()) {
      if (org.deleted_at) continue;
      if (onlyOrgId && org.id !== onlyOrgId) continue;
      list.push({ ...org, branding: { ...org.branding }, policies: { ...org.policies } });
    }
    return list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async updateOrganization(
    id: string,
    updates: Partial<Pick<OrganizationRecord, 'name' | 'owner_user_id' | 'status' | 'plan_slug' | 'branding' | 'policies' | 'storage_used_bytes'>>
  ): Promise<OrganizationRecord | null> {
    const existing = await this.findOrganizationById(id);
    if (!existing) return null;
    const now = new Date();
    const updated: OrganizationRecord = {
      ...existing,
      ...updates,
      branding: updates.branding ? { ...existing.branding, ...updates.branding } : existing.branding,
      policies: updates.policies ? { ...existing.policies, ...updates.policies } : existing.policies,
      updated_at: now,
    };

    if (isUsingPostgres()) {
      await timedQuery(
        `UPDATE organizations
         SET name = $1, owner_user_id = $2, status = $3, plan_slug = $4, branding = $5, policies = $6, storage_used_bytes = $7, updated_at = $8
         WHERE id = $9`,
        [
          updated.name,
          updated.owner_user_id,
          updated.status,
          updated.plan_slug,
          JSON.stringify(updated.branding),
          JSON.stringify(updated.policies),
          updated.storage_used_bytes,
          updated.updated_at,
          id,
        ]
      );
      return updated;
    }

    this.organizations.set(id, { ...updated });
    return updated;
  }

  public async softDeleteOrganization(id: string): Promise<boolean> {
    const now = new Date();
    if (isUsingPostgres()) {
      const res = await timedQuery(
        `UPDATE organizations SET deleted_at = $1, status = 'deleted', updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
        [now, id]
      );
      return (res.rowCount || 0) > 0;
    }
    const org = this.organizations.get(id);
    if (!org || org.deleted_at) return false;
    org.deleted_at = now;
    org.status = 'deleted';
    org.updated_at = now;
    return true;
  }

  // ==================== ORGANIZATION MEMBERS & INVITATIONS ====================
  public async upsertOrgMember(organizationId: string, userId: string, role: OrganizationRole): Promise<OrganizationMemberRecord> {
    const now = new Date();
    const key = `${organizationId}:${userId}`;
    const record: OrganizationMemberRecord = {
      id: uuidv4(),
      organization_id: organizationId,
      user_id: userId,
      role,
      status: 'active',
      joined_at: now,
      updated_at: now,
    };

    if (isUsingPostgres()) {
      const res = await timedQuery(
        `INSERT INTO organization_members (id, organization_id, user_id, role, status, joined_at, updated_at)
         VALUES ($1, $2, $3, $4, 'active', $5, $5)
         ON CONFLICT (organization_id, user_id)
         DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = EXCLUDED.updated_at
         RETURNING *`,
        [record.id, organizationId, userId, role, now]
      );
      return res.rows[0];
    }

    const existing = this.orgMembers.get(key);
    const saved: OrganizationMemberRecord = existing
      ? { ...existing, role, status: 'active', updated_at: now }
      : record;
    this.orgMembers.set(key, saved);
    return { ...saved };
  }

  public async removeOrgMember(organizationId: string, userId: string): Promise<boolean> {
    if (isUsingPostgres()) {
      const res = await timedQuery(
        'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2',
        [organizationId, userId]
      );
      return (res.rowCount || 0) > 0;
    }
    return this.orgMembers.delete(`${organizationId}:${userId}`);
  }

  public async listOrgMembers(organizationId: string): Promise<OrganizationMemberRecord[]> {
    if (isUsingPostgres()) {
      const res = await timedQuery(
        'SELECT * FROM organization_members WHERE organization_id = $1 ORDER BY joined_at ASC',
        [organizationId]
      );
      return res.rows;
    }

    const list: OrganizationMemberRecord[] = [];
    for (const m of this.orgMembers.values()) {
      if (m.organization_id === organizationId) list.push({ ...m });
    }
    return list;
  }

  public async findUserOrgMemberships(userId: string): Promise<OrganizationMemberRecord[]> {
    if (isUsingPostgres()) {
      const res = await timedQuery(
        `SELECT om.* FROM organization_members om
         INNER JOIN organizations o ON o.id = om.organization_id AND o.deleted_at IS NULL AND o.status = 'active'
         WHERE om.user_id = $1 AND om.status = 'active'`,
        [userId]
      );
      return res.rows;
    }

    const list: OrganizationMemberRecord[] = [];
    for (const m of this.orgMembers.values()) {
      if (m.user_id === userId && m.status === 'active') {
        const org = this.organizations.get(m.organization_id);
        if (org && !org.deleted_at && org.status === 'active') {
          list.push({ ...m });
        }
      }
    }
    return list;
  }

  public async createOrgInvitation(data: Omit<OrganizationInvitationRecord, 'id' | 'created_at' | 'updated_at'>): Promise<OrganizationInvitationRecord> {
    const now = new Date();
    const record: OrganizationInvitationRecord = {
      id: uuidv4(),
      ...data,
      email: data.email.trim().toLowerCase(),
      created_at: now,
      updated_at: now,
    };

    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO organization_invitations (id, organization_id, email, role, invited_by, token_hash, status, expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          record.id,
          record.organization_id,
          record.email,
          record.role,
          record.invited_by,
          record.token_hash,
          record.status,
          record.expires_at,
          record.created_at,
          record.updated_at,
        ]
      );
      return record;
    }

    this.orgInvitations.set(record.id, { ...record });
    return record;
  }

  public async listOrgInvitations(organizationId?: string | null): Promise<OrganizationInvitationRecord[]> {
    if (isUsingPostgres()) {
      const res = organizationId
        ? await timedQuery('SELECT * FROM organization_invitations WHERE organization_id = $1 ORDER BY created_at DESC', [organizationId])
        : await timedQuery('SELECT * FROM organization_invitations ORDER BY created_at DESC LIMIT 300');
      return res.rows;
    }

    const list: OrganizationInvitationRecord[] = [];
    for (const inv of this.orgInvitations.values()) {
      if (organizationId && inv.organization_id !== organizationId) continue;
      list.push({ ...inv });
    }
    return list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async revokeOrgInvitation(id: string): Promise<boolean> {
    const now = new Date();
    if (isUsingPostgres()) {
      const res = await timedQuery(
        `UPDATE organization_invitations SET status = 'revoked', updated_at = $1 WHERE id = $2`,
        [now, id]
      );
      return (res.rowCount || 0) > 0;
    }
    const inv = this.orgInvitations.get(id);
    if (!inv) return false;
    inv.status = 'revoked';
    inv.updated_at = now;
    return true;
  }

  // ==================== RECORDINGS ====================
  public async createRecording(data: Omit<RecordingRecord, 'id' | 'created_at' | 'updated_at'>): Promise<RecordingRecord> {
    const now = new Date();
    const record: RecordingRecord = { id: uuidv4(), ...data, created_at: now, updated_at: now };

    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO recordings
         (id, meeting_id, room_id, title, host_user_id, organization_id, duration_seconds, file_size_bytes,
          storage_provider, storage_key, status, failure_reason, visibility, retention_days, retention_expires_at,
          deleted_at, recorded_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          record.id, record.meeting_id, record.room_id, record.title, record.host_user_id,
          record.organization_id, record.duration_seconds, record.file_size_bytes,
          record.storage_provider, record.storage_key, record.status, record.failure_reason,
          record.visibility, record.retention_days, record.retention_expires_at,
          record.deleted_at, record.recorded_at, record.created_at, record.updated_at,
        ]
      );
      return record;
    }

    this.recordings.set(record.id, { ...record });
    return record;
  }

  public async listRecordings(organizationId?: string | null): Promise<RecordingRecord[]> {
    if (isUsingPostgres()) {
      const res = organizationId
        ? await timedQuery('SELECT * FROM recordings WHERE organization_id = $1 ORDER BY recorded_at DESC', [organizationId])
        : await timedQuery('SELECT * FROM recordings ORDER BY recorded_at DESC LIMIT 500');
      return res.rows.map((r: any) => ({
        ...r,
        duration_seconds: Number(r.duration_seconds || 0),
        file_size_bytes: Number(r.file_size_bytes || 0),
        recorded_at: new Date(r.recorded_at),
        created_at: new Date(r.created_at),
        updated_at: new Date(r.updated_at),
        retention_expires_at: r.retention_expires_at ? new Date(r.retention_expires_at) : null,
        deleted_at: r.deleted_at ? new Date(r.deleted_at) : null,
      }));
    }

    const list: RecordingRecord[] = [];
    for (const r of this.recordings.values()) {
      if (organizationId && r.organization_id !== organizationId) continue;
      list.push({ ...r });
    }
    return list.sort((a, b) => b.recorded_at.getTime() - a.recorded_at.getTime());
  }

  public async findRecordingById(id: string): Promise<RecordingRecord | null> {
    if (isUsingPostgres()) {
      const res = await timedQuery('SELECT * FROM recordings WHERE id = $1 LIMIT 1', [id]);
      if (!res.rows[0]) return null;
      const r = res.rows[0];
      return {
        ...r,
        duration_seconds: Number(r.duration_seconds || 0),
        file_size_bytes: Number(r.file_size_bytes || 0),
        recorded_at: new Date(r.recorded_at),
        created_at: new Date(r.created_at),
        updated_at: new Date(r.updated_at),
        retention_expires_at: r.retention_expires_at ? new Date(r.retention_expires_at) : null,
        deleted_at: r.deleted_at ? new Date(r.deleted_at) : null,
      };
    }
    const r = this.recordings.get(id);
    return r ? { ...r } : null;
  }

  public async updateRecording(id: string, updates: Partial<RecordingRecord>): Promise<RecordingRecord | null> {
    const existing = await this.findRecordingById(id);
    if (!existing) return null;
    const updated: RecordingRecord = { ...existing, ...updates, updated_at: new Date() };

    if (isUsingPostgres()) {
      await timedQuery(
        `UPDATE recordings SET status = $1, retention_days = $2, retention_expires_at = $3, deleted_at = $4, visibility = $5, updated_at = $6 WHERE id = $7`,
        [updated.status, updated.retention_days, updated.retention_expires_at, updated.deleted_at, updated.visibility, updated.updated_at, id]
      );
      return updated;
    }

    this.recordings.set(id, { ...updated });
    return updated;
  }

  // ==================== BILLING ====================
  public async listPlans(): Promise<SubscriptionPlanRecord[]> {
    if (isUsingPostgres()) {
      await this.ensurePostgresSeeds();
      const res = await timedQuery('SELECT * FROM subscription_plans ORDER BY price_monthly_cents ASC');
      return res.rows.map((r: any) => ({ ...r, features: parseJson(r.features, {}) }));
    }
    this.ensureInMemorySeeds();
    return Array.from(this.plans.values()).sort((a, b) => a.price_monthly_cents - b.price_monthly_cents);
  }

  public async createPlan(data: Omit<SubscriptionPlanRecord, 'id' | 'created_at' | 'updated_at'>): Promise<SubscriptionPlanRecord> {
    const now = new Date();
    const record: SubscriptionPlanRecord = { id: uuidv4(), ...data, created_at: now, updated_at: now };

    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO subscription_plans
         (id, slug, name, description, price_monthly_cents, price_yearly_cents, currency, max_meeting_minutes, max_participants, cloud_recording_gb, features, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          record.id, record.slug, record.name, record.description, record.price_monthly_cents,
          record.price_yearly_cents, record.currency, record.max_meeting_minutes, record.max_participants,
          record.cloud_recording_gb, JSON.stringify(record.features), record.is_active, record.created_at, record.updated_at,
        ]
      );
      return record;
    }
    this.plans.set(record.id, { ...record });
    return record;
  }

  public async updatePlan(id: string, updates: Partial<SubscriptionPlanRecord>): Promise<SubscriptionPlanRecord | null> {
    const plans = await this.listPlans();
    const existing = plans.find((p) => p.id === id);
    if (!existing) return null;
    const updated: SubscriptionPlanRecord = { ...existing, ...updates, updated_at: new Date() };

    if (isUsingPostgres()) {
      await timedQuery(
        `UPDATE subscription_plans
         SET name = $1, description = $2, price_monthly_cents = $3, price_yearly_cents = $4,
             max_meeting_minutes = $5, max_participants = $6, cloud_recording_gb = $7, features = $8, is_active = $9, updated_at = $10
         WHERE id = $11`,
        [
          updated.name, updated.description, updated.price_monthly_cents, updated.price_yearly_cents,
          updated.max_meeting_minutes, updated.max_participants, updated.cloud_recording_gb,
          JSON.stringify(updated.features), updated.is_active, updated.updated_at, id,
        ]
      );
      return updated;
    }
    this.plans.set(id, { ...updated });
    return updated;
  }

  public async listSubscriptions(organizationId?: string | null): Promise<SubscriptionRecord[]> {
    if (isUsingPostgres()) {
      const res = organizationId
        ? await timedQuery('SELECT * FROM subscriptions WHERE organization_id = $1 ORDER BY created_at DESC', [organizationId])
        : await timedQuery('SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 500');
      return res.rows;
    }
    const list: SubscriptionRecord[] = [];
    for (const s of this.subscriptions.values()) {
      if (organizationId && s.organization_id !== organizationId) continue;
      list.push({ ...s });
    }
    return list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async createSubscription(data: Omit<SubscriptionRecord, 'id' | 'created_at' | 'updated_at'>): Promise<SubscriptionRecord> {
    const now = new Date();
    const record: SubscriptionRecord = { id: uuidv4(), ...data, created_at: now, updated_at: now };

    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO subscriptions
         (id, user_id, organization_id, plan_id, status, billing_cycle, amount_cents, currency, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, external_provider, external_subscription_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          record.id, record.user_id, record.organization_id, record.plan_id, record.status,
          record.billing_cycle, record.amount_cents, record.currency, record.current_period_start,
          record.current_period_end, record.cancel_at_period_end, record.cancelled_at,
          record.external_provider, record.external_subscription_id, record.created_at, record.updated_at,
        ]
      );
      return record;
    }
    this.subscriptions.set(record.id, { ...record });
    return record;
  }

  public async updateSubscription(id: string, updates: Partial<SubscriptionRecord>): Promise<SubscriptionRecord | null> {
    const subs = await this.listSubscriptions();
    const existing = subs.find((s) => s.id === id);
    if (!existing) return null;
    const updated: SubscriptionRecord = { ...existing, ...updates, updated_at: new Date() };

    if (isUsingPostgres()) {
      await timedQuery(
        `UPDATE subscriptions SET status = $1, plan_id = $2, billing_cycle = $3, amount_cents = $4, cancel_at_period_end = $5, cancelled_at = $6, updated_at = $7 WHERE id = $8`,
        [updated.status, updated.plan_id, updated.billing_cycle, updated.amount_cents, updated.cancel_at_period_end, updated.cancelled_at, updated.updated_at, id]
      );
      return updated;
    }
    this.subscriptions.set(id, { ...updated });
    return updated;
  }

  public async listPayments(organizationId?: string | null): Promise<PaymentRecord[]> {
    if (isUsingPostgres()) {
      const res = organizationId
        ? await timedQuery('SELECT * FROM payments WHERE organization_id = $1 ORDER BY created_at DESC', [organizationId])
        : await timedQuery('SELECT * FROM payments ORDER BY created_at DESC LIMIT 500');
      return res.rows;
    }
    const list: PaymentRecord[] = [];
    for (const p of this.payments.values()) {
      if (organizationId && p.organization_id !== organizationId) continue;
      list.push({ ...p });
    }
    return list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async createPayment(data: Omit<PaymentRecord, 'id' | 'created_at'>): Promise<PaymentRecord> {
    const record: PaymentRecord = { id: uuidv4(), ...data, created_at: new Date() };
    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO payments
         (id, subscription_id, user_id, organization_id, amount_cents, currency, status, payment_method_label, provider, provider_transaction_id, failure_reason, refunded_cents, refunded_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          record.id, record.subscription_id, record.user_id, record.organization_id, record.amount_cents,
          record.currency, record.status, record.payment_method_label, record.provider,
          record.provider_transaction_id, record.failure_reason, record.refunded_cents, record.refunded_at, record.created_at,
        ]
      );
      return record;
    }
    this.payments.set(record.id, { ...record });
    return record;
  }

  public async updatePayment(id: string, updates: Partial<PaymentRecord>): Promise<PaymentRecord | null> {
    const list = await this.listPayments();
    const existing = list.find((p) => p.id === id);
    if (!existing) return null;
    const updated: PaymentRecord = { ...existing, ...updates };
    if (isUsingPostgres()) {
      await timedQuery(
        `UPDATE payments SET status = $1, refunded_cents = $2, refunded_at = $3, failure_reason = $4 WHERE id = $5`,
        [updated.status, updated.refunded_cents, updated.refunded_at, updated.failure_reason, id]
      );
      return updated;
    }
    this.payments.set(id, { ...updated });
    return updated;
  }

  public async listInvoices(organizationId?: string | null): Promise<InvoiceRecord[]> {
    if (isUsingPostgres()) {
      const res = organizationId
        ? await timedQuery('SELECT * FROM invoices WHERE organization_id = $1 ORDER BY created_at DESC', [organizationId])
        : await timedQuery('SELECT * FROM invoices ORDER BY created_at DESC LIMIT 500');
      return res.rows.map((r: any) => ({ ...r, line_items: parseJson(r.line_items, []) }));
    }
    const list: InvoiceRecord[] = [];
    for (const inv of this.invoices.values()) {
      if (organizationId && inv.organization_id !== organizationId) continue;
      list.push({ ...inv });
    }
    return list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async createInvoice(data: Omit<InvoiceRecord, 'id' | 'created_at'>): Promise<InvoiceRecord> {
    const record: InvoiceRecord = { id: uuidv4(), ...data, created_at: new Date() };
    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO invoices (id, invoice_number, subscription_id, payment_id, user_id, organization_id, amount_cents, currency, status, due_at, paid_at, line_items, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          record.id, record.invoice_number, record.subscription_id, record.payment_id, record.user_id,
          record.organization_id, record.amount_cents, record.currency, record.status,
          record.due_at, record.paid_at, JSON.stringify(record.line_items), record.created_at,
        ]
      );
      return record;
    }
    this.invoices.set(record.id, { ...record });
    return record;
  }

  public async listCoupons(): Promise<CouponRecord[]> {
    if (isUsingPostgres()) {
      const res = await timedQuery('SELECT * FROM coupons ORDER BY created_at DESC');
      return res.rows;
    }
    return Array.from(this.coupons.values()).sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async createCoupon(data: Omit<CouponRecord, 'id' | 'redemption_count' | 'created_at'>): Promise<CouponRecord> {
    const record: CouponRecord = {
      id: uuidv4(),
      ...data,
      code: data.code.trim().toUpperCase(),
      redemption_count: 0,
      created_at: new Date(),
    };
    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO coupons (id, code, description, discount_type, discount_value, max_redemptions, redemption_count, valid_until, is_active, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          record.id, record.code, record.description, record.discount_type, record.discount_value,
          record.max_redemptions, record.redemption_count, record.valid_until, record.is_active,
          record.created_by, record.created_at,
        ]
      );
      return record;
    }
    for (const c of this.coupons.values()) {
      if (c.code === record.code) throw new Error('Coupon code already exists');
    }
    this.coupons.set(record.id, { ...record });
    return record;
  }

  public async toggleCoupon(id: string, isActive: boolean): Promise<CouponRecord | null> {
    const list = await this.listCoupons();
    const existing = list.find((c) => c.id === id);
    if (!existing) return null;
    const updated = { ...existing, is_active: isActive };
    if (isUsingPostgres()) {
      await timedQuery('UPDATE coupons SET is_active = $1 WHERE id = $2', [isActive, id]);
      return updated;
    }
    this.coupons.set(id, updated);
    return updated;
  }

  // ==================== SUPPORT TICKETS & MODERATION ====================
  public async createSupportTicket(data: Omit<SupportTicketRecord, 'id' | 'ticket_number' | 'created_at' | 'updated_at'>): Promise<SupportTicketRecord> {
    const now = new Date();
    const suffix = Math.floor(100000 + Math.random() * 900000);
    const record: SupportTicketRecord = {
      id: uuidv4(),
      ticket_number: `FCT-${suffix}`,
      ...data,
      created_at: now,
      updated_at: now,
    };

    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO support_tickets
         (id, ticket_number, subject, description, user_id, user_email, organization_id, meeting_id, category, priority, status, assigned_admin_id, sla_due_at, first_response_at, resolved_at, resolution_notes, csat_rating, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          record.id, record.ticket_number, record.subject, record.description, record.user_id,
          record.user_email, record.organization_id, record.meeting_id, record.category,
          record.priority, record.status, record.assigned_admin_id, record.sla_due_at,
          record.first_response_at, record.resolved_at, record.resolution_notes, record.csat_rating,
          record.created_at, record.updated_at,
        ]
      );
      return record;
    }
    this.tickets.set(record.id, { ...record });
    this.ticketMessages.set(record.id, []);
    return record;
  }

  public async listSupportTickets(organizationId?: string | null): Promise<SupportTicketRecord[]> {
    if (isUsingPostgres()) {
      const res = organizationId
        ? await timedQuery('SELECT * FROM support_tickets WHERE organization_id = $1 ORDER BY updated_at DESC', [organizationId])
        : await timedQuery('SELECT * FROM support_tickets ORDER BY updated_at DESC LIMIT 500');
      return res.rows;
    }
    const list: SupportTicketRecord[] = [];
    for (const t of this.tickets.values()) {
      if (organizationId && t.organization_id !== organizationId) continue;
      list.push({ ...t });
    }
    return list.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
  }

  public async findSupportTicketById(id: string): Promise<SupportTicketRecord | null> {
    if (isUsingPostgres()) {
      const res = await timedQuery('SELECT * FROM support_tickets WHERE id = $1 LIMIT 1', [id]);
      return res.rows[0] || null;
    }
    const t = this.tickets.get(id);
    return t ? { ...t } : null;
  }

  public async updateSupportTicket(id: string, updates: Partial<SupportTicketRecord>): Promise<SupportTicketRecord | null> {
    const existing = await this.findSupportTicketById(id);
    if (!existing) return null;
    const updated: SupportTicketRecord = { ...existing, ...updates, updated_at: new Date() };

    if (isUsingPostgres()) {
      await timedQuery(
        `UPDATE support_tickets
         SET status = $1, priority = $2, assigned_admin_id = $3, first_response_at = $4, resolved_at = $5, resolution_notes = $6, csat_rating = $7, updated_at = $8
         WHERE id = $9`,
        [
          updated.status, updated.priority, updated.assigned_admin_id, updated.first_response_at,
          updated.resolved_at, updated.resolution_notes, updated.csat_rating, updated.updated_at, id,
        ]
      );
      return updated;
    }
    this.tickets.set(id, { ...updated });
    return updated;
  }

  public async addSupportMessage(data: Omit<SupportMessageRecord, 'id' | 'created_at'>): Promise<SupportMessageRecord> {
    const record: SupportMessageRecord = { id: uuidv4(), ...data, created_at: new Date() };
    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO support_messages (id, ticket_id, author_user_id, author_name, is_internal, body, attachments, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          record.id, record.ticket_id, record.author_user_id, record.author_name,
          record.is_internal, record.body, JSON.stringify(record.attachments || []), record.created_at,
        ]
      );
      return record;
    }
    const arr = this.ticketMessages.get(record.ticket_id) || [];
    arr.push(record);
    this.ticketMessages.set(record.ticket_id, arr);
    return record;
  }

  public async listSupportMessages(ticketId: string): Promise<SupportMessageRecord[]> {
    if (isUsingPostgres()) {
      const res = await timedQuery('SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC', [ticketId]);
      return res.rows.map((r: any) => ({ ...r, attachments: parseJson(r.attachments, []) }));
    }
    return [...(this.ticketMessages.get(ticketId) || [])];
  }

  public async listModerationReports(organizationId?: string | null): Promise<ModerationReportRecord[]> {
    if (isUsingPostgres()) {
      const res = organizationId
        ? await timedQuery('SELECT * FROM moderation_reports WHERE organization_id = $1 ORDER BY created_at DESC', [organizationId])
        : await timedQuery('SELECT * FROM moderation_reports ORDER BY created_at DESC LIMIT 300');
      return res.rows;
    }
    const list: ModerationReportRecord[] = [];
    for (const r of this.moderationReports.values()) {
      if (organizationId && r.organization_id !== organizationId) continue;
      list.push({ ...r });
    }
    return list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async createModerationReport(data: Omit<ModerationReportRecord, 'id' | 'created_at' | 'updated_at'>): Promise<ModerationReportRecord> {
    const now = new Date();
    const record: ModerationReportRecord = { id: uuidv4(), ...data, created_at: now, updated_at: now };
    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO moderation_reports (id, reporter_user_id, reported_user_id, meeting_id, organization_id, category, reason, status, resolution_notes, resolved_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          record.id, record.reporter_user_id, record.reported_user_id, record.meeting_id,
          record.organization_id, record.category, record.reason, record.status,
          record.resolution_notes, record.resolved_by, record.created_at, record.updated_at,
        ]
      );
      return record;
    }
    this.moderationReports.set(record.id, { ...record });
    return record;
  }

  public async updateModerationReport(id: string, updates: Partial<ModerationReportRecord>): Promise<ModerationReportRecord | null> {
    const list = await this.listModerationReports();
    const existing = list.find((r) => r.id === id);
    if (!existing) return null;
    const updated: ModerationReportRecord = { ...existing, ...updates, updated_at: new Date() };
    if (isUsingPostgres()) {
      await timedQuery(
        'UPDATE moderation_reports SET status = $1, resolution_notes = $2, resolved_by = $3, updated_at = $4 WHERE id = $5',
        [updated.status, updated.resolution_notes, updated.resolved_by, updated.updated_at, id]
      );
      return updated;
    }
    this.moderationReports.set(id, { ...updated });
    return updated;
  }

  // ==================== ANNOUNCEMENTS & NOTIFICATIONS ====================
  public async listAnnouncements(): Promise<AnnouncementRecord[]> {
    if (isUsingPostgres()) {
      const res = await timedQuery('SELECT * FROM platform_announcements ORDER BY created_at DESC LIMIT 200');
      return res.rows.map((r: any) => ({
        ...r,
        target_ids: parseJson(r.target_ids, []),
        channels: parseJson(r.channels, ['in_app']),
      }));
    }
    return Array.from(this.announcements.values()).sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async createAnnouncement(data: Omit<AnnouncementRecord, 'id' | 'created_at' | 'updated_at'>): Promise<AnnouncementRecord> {
    const now = new Date();
    const record: AnnouncementRecord = { id: uuidv4(), ...data, created_at: now, updated_at: now };
    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO platform_announcements
         (id, title, body, severity, status, target_scope, target_ids, channels, scheduled_at, published_at, expires_at, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          record.id, record.title, record.body, record.severity, record.status,
          record.target_scope, JSON.stringify(record.target_ids), JSON.stringify(record.channels),
          record.scheduled_at, record.published_at, record.expires_at, record.created_by,
          record.created_at, record.updated_at,
        ]
      );
      return record;
    }
    this.announcements.set(record.id, { ...record });
    return record;
  }

  public async updateAnnouncement(id: string, updates: Partial<AnnouncementRecord>): Promise<AnnouncementRecord | null> {
    const list = await this.listAnnouncements();
    const existing = list.find((a) => a.id === id);
    if (!existing) return null;
    const updated: AnnouncementRecord = { ...existing, ...updates, updated_at: new Date() };
    if (isUsingPostgres()) {
      await timedQuery(
        `UPDATE platform_announcements
         SET title = $1, body = $2, severity = $3, status = $4, target_scope = $5, target_ids = $6, channels = $7, scheduled_at = $8, published_at = $9, expires_at = $10, updated_at = $11
         WHERE id = $12`,
        [
          updated.title, updated.body, updated.severity, updated.status, updated.target_scope,
          JSON.stringify(updated.target_ids), JSON.stringify(updated.channels),
          updated.scheduled_at, updated.published_at, updated.expires_at, updated.updated_at, id,
        ]
      );
      return updated;
    }
    this.announcements.set(id, { ...updated });
    return updated;
  }

  public async createNotification(data: Omit<AdminNotificationRecord, 'id' | 'is_read' | 'read_by' | 'read_at' | 'created_at'>): Promise<AdminNotificationRecord> {
    const record: AdminNotificationRecord = {
      id: uuidv4(),
      ...data,
      is_read: false,
      read_by: null,
      read_at: null,
      created_at: new Date(),
    };
    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO admin_notifications (id, category, severity, title, message, target_permission, metadata, is_read, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,$8)`,
        [
          record.id, record.category, record.severity, record.title, record.message,
          record.target_permission, JSON.stringify(record.metadata || {}), record.created_at,
        ]
      );
      return record;
    }
    this.notifications.set(record.id, { ...record });
    return record;
  }

  public async listNotifications(limit = 50): Promise<AdminNotificationRecord[]> {
    if (isUsingPostgres()) {
      const res = await timedQuery('SELECT * FROM admin_notifications ORDER BY created_at DESC LIMIT $1', [limit]);
      return res.rows.map((r: any) => ({ ...r, metadata: parseJson(r.metadata, {}) }));
    }
    return Array.from(this.notifications.values())
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
      .slice(0, limit);
  }

  public async markNotificationRead(id: string, userId: string): Promise<boolean> {
    const now = new Date();
    if (isUsingPostgres()) {
      const res = await timedQuery(
        'UPDATE admin_notifications SET is_read = TRUE, read_by = $1, read_at = $2 WHERE id = $3',
        [userId, now, id]
      );
      return (res.rowCount || 0) > 0;
    }
    const n = this.notifications.get(id);
    if (!n) return false;
    n.is_read = true;
    n.read_by = userId;
    n.read_at = now;
    return true;
  }

  // ==================== API KEYS ====================
  public async createApiKey(data: Omit<ApiKeyRecord, 'id' | 'last_used_at' | 'revoked_at' | 'created_at'>): Promise<ApiKeyRecord> {
    const record: ApiKeyRecord = {
      id: uuidv4(),
      ...data,
      last_used_at: null,
      revoked_at: null,
      created_at: new Date(),
    };
    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO api_keys (id, name, key_prefix, key_hash, scopes, rate_limit_per_min, organization_id, created_by, expires_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          record.id, record.name, record.key_prefix, record.key_hash,
          JSON.stringify(record.scopes), record.rate_limit_per_min,
          record.organization_id, record.created_by, record.expires_at, record.created_at,
        ]
      );
      return record;
    }
    this.apiKeys.set(record.id, { ...record });
    return record;
  }

  public async listApiKeys(organizationId?: string | null): Promise<ApiKeyRecord[]> {
    if (isUsingPostgres()) {
      const res = organizationId
        ? await timedQuery('SELECT * FROM api_keys WHERE organization_id = $1 ORDER BY created_at DESC', [organizationId])
        : await timedQuery('SELECT * FROM api_keys ORDER BY created_at DESC');
      return res.rows.map((r: any) => ({ ...r, scopes: parseJson(r.scopes, []) }));
    }
    const list: ApiKeyRecord[] = [];
    for (const k of this.apiKeys.values()) {
      if (organizationId && k.organization_id !== organizationId) continue;
      list.push({ ...k });
    }
    return list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async revokeApiKey(id: string): Promise<boolean> {
    const now = new Date();
    if (isUsingPostgres()) {
      const res = await timedQuery('UPDATE api_keys SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL', [now, id]);
      return (res.rowCount || 0) > 0;
    }
    const k = this.apiKeys.get(id);
    if (!k || k.revoked_at) return false;
    k.revoked_at = now;
    return true;
  }

  // ==================== SETTINGS & FEATURE FLAGS ====================
  public async getAllSettings(): Promise<Record<string, Record<string, unknown>>> {
    if (isUsingPostgres()) {
      await this.ensurePostgresSeeds();
      const res = await timedQuery('SELECT * FROM platform_settings');
      const result: Record<string, Record<string, unknown>> = {};
      for (const [k, def] of Object.entries(DEFAULT_PLATFORM_SETTINGS)) {
        result[k] = { ...def.value };
      }
      for (const row of res.rows) {
        result[row.key] = { ...(result[row.key] || {}), ...parseJson<Record<string, unknown>>(row.value, {}) };
      }
      return result;
    }

    this.ensureInMemorySeeds();
    const result: Record<string, Record<string, unknown>> = {};
    for (const [k, entry] of this.settings.entries()) {
      result[k] = { ...entry.value };
    }
    return result;
  }

  public async upsertSetting(key: string, category: string, value: Record<string, unknown>, updatedBy: string): Promise<Record<string, unknown>> {
    const now = new Date();
    const current = (await this.getAllSettings())[key] || {};
    const merged = { ...current, ...value };

    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO platform_settings (key, category, value, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
        [key, category, JSON.stringify(merged), updatedBy, now]
      );
      return merged;
    }

    this.ensureInMemorySeeds();
    this.settings.set(key, { category, value: merged, updated_by: updatedBy, updated_at: now });
    return merged;
  }

  public async listFeatureFlags(): Promise<FeatureFlagRecord[]> {
    if (isUsingPostgres()) {
      await this.ensurePostgresSeeds();
      const res = await timedQuery('SELECT * FROM feature_flags ORDER BY name ASC');
      return res.rows.map((r: any) => ({ ...r, org_overrides: parseJson(r.org_overrides, {}) }));
    }
    this.ensureInMemorySeeds();
    return Array.from(this.featureFlags.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  public async updateFeatureFlag(
    idOrKey: string,
    updates: { enabled_globally?: boolean; org_overrides?: Record<string, boolean>; updated_by: string }
  ): Promise<FeatureFlagRecord | null> {
    const flags = await this.listFeatureFlags();
    const existing = flags.find((f) => f.id === idOrKey || f.key === idOrKey);
    if (!existing) return null;

    const updated: FeatureFlagRecord = {
      ...existing,
      enabled_globally: updates.enabled_globally !== undefined ? updates.enabled_globally : existing.enabled_globally,
      org_overrides: updates.org_overrides !== undefined ? { ...existing.org_overrides, ...updates.org_overrides } : existing.org_overrides,
      updated_by: updates.updated_by,
      updated_at: new Date(),
    };

    if (isUsingPostgres()) {
      await timedQuery(
        'UPDATE feature_flags SET enabled_globally = $1, org_overrides = $2, updated_by = $3, updated_at = $4 WHERE id = $5',
        [updated.enabled_globally, JSON.stringify(updated.org_overrides), updated.updated_by, updated.updated_at, existing.id]
      );
      return updated;
    }

    this.featureFlags.set(existing.id, updated);
    return updated;
  }

  // ==================== SYSTEM ALERTS ====================
  public async createAlert(data: Omit<SystemAlertRecord, 'id' | 'status' | 'acknowledged_by' | 'acknowledged_at' | 'resolved_by' | 'resolved_at' | 'created_at' | 'updated_at'>): Promise<SystemAlertRecord> {
    const now = new Date();
    const record: SystemAlertRecord = {
      id: uuidv4(),
      ...data,
      status: 'open',
      acknowledged_by: null,
      acknowledged_at: null,
      resolved_by: null,
      resolved_at: null,
      created_at: now,
      updated_at: now,
    };

    if (isUsingPostgres()) {
      await timedQuery(
        `INSERT INTO system_alerts (id, source, severity, title, message, status, metadata, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'open',$6,$7,$7)`,
        [record.id, record.source, record.severity, record.title, record.message, JSON.stringify(record.metadata || {}), now]
      );
      return record;
    }
    this.systemAlerts.set(record.id, { ...record });
    return record;
  }

  public async listAlerts(status?: string): Promise<SystemAlertRecord[]> {
    if (isUsingPostgres()) {
      const res = status
        ? await timedQuery('SELECT * FROM system_alerts WHERE status = $1 ORDER BY created_at DESC LIMIT 200', [status])
        : await timedQuery('SELECT * FROM system_alerts ORDER BY created_at DESC LIMIT 200');
      return res.rows.map((r: any) => ({ ...r, metadata: parseJson(r.metadata, {}) }));
    }
    const list: SystemAlertRecord[] = [];
    for (const a of this.systemAlerts.values()) {
      if (status && a.status !== status) continue;
      list.push({ ...a });
    }
    return list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  public async updateAlertStatus(id: string, status: 'acknowledged' | 'resolved', actorId: string): Promise<SystemAlertRecord | null> {
    const alerts = await this.listAlerts();
    const existing = alerts.find((a) => a.id === id);
    if (!existing) return null;
    const now = new Date();
    const updated: SystemAlertRecord = {
      ...existing,
      status,
      acknowledged_by: status === 'acknowledged' ? actorId : existing.acknowledged_by,
      acknowledged_at: status === 'acknowledged' ? now : existing.acknowledged_at,
      resolved_by: status === 'resolved' ? actorId : existing.resolved_by,
      resolved_at: status === 'resolved' ? now : existing.resolved_at,
      updated_at: now,
    };

    if (isUsingPostgres()) {
      await timedQuery(
        `UPDATE system_alerts SET status = $1, acknowledged_by = $2, acknowledged_at = $3, resolved_by = $4, resolved_at = $5, updated_at = $6 WHERE id = $7`,
        [updated.status, updated.acknowledged_by, updated.acknowledged_at, updated.resolved_by, updated.resolved_at, now, id]
      );
      return updated;
    }
    this.systemAlerts.set(id, { ...updated });
    return updated;
  }

  public async clearAll(): Promise<void> {
    this.organizations.clear();
    this.orgMembers.clear();
    this.orgInvitations.clear();
    this.recordings.clear();
    this.plans.clear();
    this.subscriptions.clear();
    this.payments.clear();
    this.invoices.clear();
    this.coupons.clear();
    this.tickets.clear();
    this.ticketMessages.clear();
    this.moderationReports.clear();
    this.announcements.clear();
    this.notifications.clear();
    this.auditLogs = [];
    this.securityEvents = [];
    this.apiKeys.clear();
    this.settings.clear();
    this.featureFlags.clear();
    this.systemAlerts.clear();
    this.seededMemory = false;
    this.ensureInMemorySeeds();
  }
}

export const adminStore = new AdminStore();

