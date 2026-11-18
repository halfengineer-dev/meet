export type AdminSectionId =
    | 'dashboard'
    | 'live-monitoring'
    | 'platform-health'
    | 'users'
    | 'organizations'
    | 'invitations'
    | 'roles'
    | 'suspended-users'
    | 'meetings'
    | 'live-meetings'
    | 'scheduled-meetings'
    | 'meeting-history'
    | 'recurring-meetings'
    | 'recordings'
    | 'meeting-reports'
    | 'chat-management'
    | 'moderation'
    | 'support-tickets'
    | 'announcements'
    | 'billing-plans'
    | 'subscriptions'
    | 'payments'
    | 'invoices'
    | 'coupons'
    | 'revenue-analytics'
    | 'infra-sfu'
    | 'infra-turn'
    | 'infra-jitsi'
    | 'infra-redis'
    | 'infra-api'
    | 'infra-logs'
    | 'security-dashboard'
    | 'login-activity'
    | 'audit-logs'
    | 'api-keys'
    | 'sessions'
    | 'access-policies'
    | 'settings-general'
    | 'settings-meetings'
    | 'settings-recordings'
    | 'settings-email'
    | 'settings-notifications'
    | 'feature-flags'
    | 'maintenance-mode';

export interface IAdminContextInfo {
    email: string;
    isOrgAdmin: boolean;
    isPlatformAdmin: boolean;
    isSuperAdmin: boolean;
    name: string | null;
    orgRole: string | null;
    permissions: string[];
    platformRole: string | null;
    scopedOrganizationId: string | null;
    userId: string;
}

export interface IPagination {
    limit: number;
    page: number;
    total: number;
    totalPages: number;
}

export interface IKpiMetric {
    changePercent?: number | null;
    currency?: string;
    current?: number;
    periodNew?: number;
    previous?: number;
    securityHighEvents?: number;
    trend?: 'up' | 'down' | 'flat';
    value: number | null;
    visible?: boolean;
}

export interface IDashboardOverview {
    generatedAt: string;
    kpis: {
        dau: IKpiMetric;
        failedMeetingsAndErrors: IKpiMetric;
        liveMeetings: IKpiMetric;
        mau: IKpiMetric;
        mrrCents: IKpiMetric;
        totalMeetingMinutes: IKpiMetric;
        totalMeetings: IKpiMetric;
        totalOrganizations: IKpiMetric;
        totalRecordings: IKpiMetric;
        totalUsers: IKpiMetric;
    };
    timeRangeDays: number;
}

export interface IDashboardAnalytics {
    geographic: Array<{ country: string; meetings: number; users: number; }>;
    meetingAnalytics: {
        averageDurationMinutes: number;
        daily: Array<{ created: number; date: string; minutes: number; started: number; }>;
        totalConferencingMinutes: number;
        totalSessions: number;
    };
    platformUsage: {
        browsers: Array<{ count: number; name: string; }>;
        devices: Array<{ count: number; name: string; }>;
        operatingSystems: Array<{ count: number; name: string; }>;
    };
    timeRangeDays: number;
    userGrowth: {
        activeVsInactive: { active: number; inactive: number; };
        daily: Array<{ date: string; registrations: number; }>;
    };
}

export interface IAdminUserRow {
    adminRole?: string | null;
    avatarUrl?: string | null;
    country?: string | null;
    createdAt: string;
    email: string;
    emailVerified: boolean;
    id: string;
    lastActiveAt?: string | null;
    lastLoginAt: string | null;
    name: string | null;
    organizationId?: string | null;
    organizationName?: string | null;
    role: 'admin' | 'user';
    status: string;
    subscriptionPlan?: string;
}

export interface IAdminOrgPolicies {
    chatEnabled: boolean;
    cloudRecordingEnabled: boolean;
    fileSharingEnabled: boolean;
    guestAccessEnabled: boolean;
    localRecordingEnabled: boolean;
    maxMeetingDurationMinutes: number;
    maxParticipants: number;
    meetingExpirationDays: number;
    passcodeRequired: boolean;
    recurringMeetingsEnabled: boolean;
    requireAuthentication: boolean;
    screenSharingEnabled: boolean;
    waitingRoomDefault: boolean;
}

export interface IAdminOrganizationRow {
    branding: {
        customDomain?: string | null;
        logoUrl?: string | null;
        primaryColor?: string | null;
        welcomeMessage?: string | null;
    };
    createdAt: string;
    id: string;
    meetingCount: number;
    memberCount: number;
    name: string;
    owner: { email: string; id: string; name: string | null; } | null;
    planName: string;
    planSlug: string;
    policies: IAdminOrgPolicies;
    renewalDate: string | null;
    slug: string;
    status: string;
    storageUsedBytes: number;
    updatedAt: string;
}

export interface IAdminMeetingRow {
    createdAt: string;
    durationMinutes: number;
    endedAt: string | null;
    hasRecording: boolean;
    host: { email: string; id: string; name: string | null; };
    id: string;
    isDisabled: boolean;
    meetingType: string;
    organizationId: string | null;
    organizationName: string | null;
    participantCount: number;
    recurrenceRule: string | null;
    recurrenceSummary: string | null;
    roomId: string;
    scheduledAt: string | null;
    seriesStatus: string;
    startedAt: string | null;
    status: string;
    timezone: string;
    title: string;
}

export interface IGlobalSearchResult {
    meetings: Array<{ id: string; roomId: string; status: string; title: string; }>;
    organizations: Array<{ id: string; name: string; planSlug: string; slug: string; }>;
    payments: Array<{ amountCents: number; currency: string; id: string; status: string; }>;
    recordings: Array<{ id: string; status: string; title: string; }>;
    tickets: Array<{ id: string; priority: string; status: string; subject: string; ticketNumber: string; }>;
    users: Array<{ email: string; id: string; name: string | null; status: string; }>;
}

export interface IAdminNotification {
    category: string;
    created_at: string;
    id: string;
    is_read: boolean;
    message: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
}
