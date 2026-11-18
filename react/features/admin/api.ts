import { API_BASE_URL } from '../auth/constants';

import {
    IAdminContextInfo,
    IAdminMeetingRow,
    IAdminNotification,
    IAdminOrganizationRow,
    IAdminUserRow,
    IDashboardAnalytics,
    IDashboardOverview,
    IGlobalSearchResult,
    IPagination
} from './types';

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
    const sp = new URLSearchParams();

    Object.entries(params).forEach(([ key, val ]) => {
        if (val !== undefined && val !== null && val !== '') {
            sp.set(key, String(val));
        }
    });
    const str = sp.toString();

    return str ? `?${str}` : '';
}

export class AdminApiClient {
    private async request<T>(
            endpoint: string,
            accessToken: string,
            options: RequestInit = {}
    ): Promise<T> {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                ...(options.headers as Record<string, string> || {})
            },
            credentials: 'include'
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            const err: any = new Error(data.error || `Request failed (${res.status})`);

            err.status = res.status;
            err.code = data.code;
            throw err;
        }

        return data as T;
    }

    public async downloadCsv(endpoint: string, accessToken: string, filename: string): Promise<void> {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken}` },
            credentials: 'include'
        });

        if (!res.ok) {
            throw new Error(`Export failed (${res.status})`);
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    }

    public getAdminMe(token: string): Promise<{ admin: IAdminContextInfo; }> {
        return this.request('/api/admin/me', token);
    }

    public globalSearch(token: string, q: string): Promise<IGlobalSearchResult> {
        return this.request(`/api/admin/search${buildQuery({ q })}`, token);
    }

    // Dashboard
    public getDashboardOverview(token: string, params: { days?: number; organizationId?: string; } = {}): Promise<IDashboardOverview> {
        return this.request(`/api/admin/dashboard/overview${buildQuery(params)}`, token);
    }

    public getDashboardAnalytics(token: string, params: { country?: string; days?: number; organizationId?: string; } = {}): Promise<IDashboardAnalytics> {
        return this.request(`/api/admin/dashboard/analytics${buildQuery(params)}`, token);
    }

    public getDashboardActivity(token: string, organizationId?: string): Promise<any> {
        return this.request(`/api/admin/dashboard/activity${buildQuery({ organizationId })}`, token);
    }

    // Roles
    public getRoles(token: string): Promise<{ roles: any[]; }> {
        return this.request('/api/admin/roles', token);
    }

    // Users
    public listUsers(token: string, params: Record<string, any> = {}): Promise<{ pagination: IPagination; total: number; users: IAdminUserRow[]; }> {
        return this.request(`/api/admin/users${buildQuery(params)}`, token);
    }

    public createUser(token: string, payload: Record<string, any>): Promise<{ temporaryPassword?: string; user: IAdminUserRow; }> {
        return this.request('/api/admin/users', token, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    public getUserDetail(token: string, userId: string): Promise<any> {
        return this.request(`/api/admin/users/${encodeURIComponent(userId)}`, token);
    }

    public updateUser(token: string, userId: string, payload: Record<string, any>): Promise<{ temporaryPassword?: string; user: IAdminUserRow; }> {
        return this.request(`/api/admin/users/${encodeURIComponent(userId)}`, token, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
    }

    public suspendUser(token: string, userId: string, reason?: string): Promise<any> {
        return this.request(`/api/admin/users/${encodeURIComponent(userId)}/suspend`, token, {
            method: 'POST',
            body: JSON.stringify({ reason })
        });
    }

    public reactivateUser(token: string, userId: string): Promise<any> {
        return this.request(`/api/admin/users/${encodeURIComponent(userId)}/reactivate`, token, {
            method: 'POST'
        });
    }

    public revokeUserSessions(token: string, userId: string): Promise<{ success: boolean; }> {
        return this.request(`/api/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, token, {
            method: 'POST'
        });
    }

    public sendUserVerification(token: string, userId: string): Promise<any> {
        return this.request(`/api/admin/users/${encodeURIComponent(userId)}/send-verification`, token, {
            method: 'POST'
        });
    }

    public exportUserData(token: string, userId: string): Promise<any> {
        return this.request(`/api/admin/users/${encodeURIComponent(userId)}/export`, token);
    }

    public deleteUser(token: string, userId: string): Promise<{ success: boolean; }> {
        return this.request(`/api/admin/users/${encodeURIComponent(userId)}`, token, {
            method: 'DELETE'
        });
    }

    // Organizations
    public listOrganizations(token: string, search?: string): Promise<{ organizations: IAdminOrganizationRow[]; total: number; }> {
        return this.request(`/api/admin/organizations${buildQuery({ search })}`, token);
    }

    public createOrganization(token: string, payload: Record<string, any>): Promise<any> {
        return this.request('/api/admin/organizations', token, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    public getOrganizationDetail(token: string, orgId: string): Promise<any> {
        return this.request(`/api/admin/organizations/${encodeURIComponent(orgId)}`, token);
    }

    public updateOrganization(token: string, orgId: string, payload: Record<string, any>): Promise<any> {
        return this.request(`/api/admin/organizations/${encodeURIComponent(orgId)}`, token, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
    }

    public deleteOrganization(token: string, orgId: string): Promise<{ success: boolean; }> {
        return this.request(`/api/admin/organizations/${encodeURIComponent(orgId)}`, token, {
            method: 'DELETE'
        });
    }

    public addOrgMember(token: string, orgId: string, userId: string, role: string): Promise<any> {
        return this.request(`/api/admin/organizations/${encodeURIComponent(orgId)}/members`, token, {
            method: 'POST',
            body: JSON.stringify({ userId, role })
        });
    }

    public removeOrgMember(token: string, orgId: string, userId: string): Promise<any> {
        return this.request(`/api/admin/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`, token, {
            method: 'DELETE'
        });
    }

    public listInvitations(token: string, organizationId?: string): Promise<{ invitations: any[]; }> {
        return this.request(`/api/admin/invitations${buildQuery({ organizationId })}`, token);
    }

    public sendOrgInvitations(token: string, orgId: string, emails: Array<{ email: string; role?: string; }>): Promise<any> {
        return this.request(`/api/admin/organizations/${encodeURIComponent(orgId)}/invitations`, token, {
            method: 'POST',
            body: JSON.stringify({ emails })
        });
    }

    public sendBulkCsvInvitations(token: string, orgId: string, csv: string): Promise<any> {
        return this.request(`/api/admin/organizations/${encodeURIComponent(orgId)}/invitations/bulk-csv`, token, {
            method: 'POST',
            body: JSON.stringify({ csv })
        });
    }

    public revokeInvitation(token: string, id: string): Promise<any> {
        return this.request(`/api/admin/invitations/${encodeURIComponent(id)}`, token, {
            method: 'DELETE'
        });
    }

    // Meetings & Live Monitoring
    public listMeetings(token: string, params: Record<string, any> = {}): Promise<{ meetings: IAdminMeetingRow[]; pagination: IPagination; total: number; }> {
        return this.request(`/api/admin/meetings${buildQuery(params)}`, token);
    }

    public getMeetingDetail(token: string, meetingId: string): Promise<any> {
        return this.request(`/api/admin/meetings/${encodeURIComponent(meetingId)}`, token);
    }

    public endLiveMeeting(token: string, meetingId: string, reason?: string): Promise<any> {
        return this.request(`/api/admin/meetings/${encodeURIComponent(meetingId)}/end`, token, {
            method: 'POST',
            body: JSON.stringify({ reason })
        });
    }

    public cancelMeeting(token: string, meetingId: string, scope: 'series' | 'occurrence' = 'series', occurrenceId?: string): Promise<any> {
        return this.request(`/api/admin/meetings/${encodeURIComponent(meetingId)}/cancel`, token, {
            method: 'POST',
            body: JSON.stringify({ scope, occurrenceId })
        });
    }

    public disableMeetingLink(token: string, meetingId: string, reason?: string): Promise<any> {
        return this.request(`/api/admin/meetings/${encodeURIComponent(meetingId)}/disable`, token, {
            method: 'POST',
            body: JSON.stringify({ reason })
        });
    }

    public getLiveMeetings(token: string): Promise<any> {
        return this.request('/api/admin/live/meetings', token);
    }

    // Recordings
    public listRecordings(token: string, params: Record<string, any> = {}): Promise<any> {
        return this.request(`/api/admin/recordings${buildQuery(params)}`, token);
    }

    public getRecordingDetail(token: string, id: string): Promise<any> {
        return this.request(`/api/admin/recordings/${encodeURIComponent(id)}`, token);
    }

    public updateRecordingRetention(token: string, id: string, retentionDays: number): Promise<any> {
        return this.request(`/api/admin/recordings/${encodeURIComponent(id)}/retention`, token, {
            method: 'PATCH',
            body: JSON.stringify({ retentionDays })
        });
    }

    public deleteRecording(token: string, id: string): Promise<any> {
        return this.request(`/api/admin/recordings/${encodeURIComponent(id)}`, token, {
            method: 'DELETE'
        });
    }

    public restoreRecording(token: string, id: string): Promise<any> {
        return this.request(`/api/admin/recordings/${encodeURIComponent(id)}/restore`, token, {
            method: 'POST'
        });
    }

    // Billing
    public getBillingOverview(token: string): Promise<any> {
        return this.request('/api/admin/billing/overview', token);
    }

    public listPlans(token: string): Promise<{ plans: any[]; }> {
        return this.request('/api/admin/billing/plans', token);
    }

    public createPlan(token: string, payload: Record<string, any>): Promise<any> {
        return this.request('/api/admin/billing/plans', token, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    public updatePlan(token: string, id: string, payload: Record<string, any>): Promise<any> {
        return this.request(`/api/admin/billing/plans/${encodeURIComponent(id)}`, token, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
    }

    public listSubscriptions(token: string, status?: string): Promise<{ subscriptions: any[]; }> {
        return this.request(`/api/admin/subscriptions${buildQuery({ status })}`, token);
    }

    public assignSubscription(token: string, payload: Record<string, any>): Promise<any> {
        return this.request('/api/admin/subscriptions', token, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    public cancelSubscription(token: string, id: string): Promise<any> {
        return this.request(`/api/admin/subscriptions/${encodeURIComponent(id)}/cancel`, token, {
            method: 'POST'
        });
    }

    public listPayments(token: string, status?: string): Promise<{ payments: any[]; }> {
        return this.request(`/api/admin/payments${buildQuery({ status })}`, token);
    }

    public refundPayment(token: string, id: string, amountCents?: number): Promise<any> {
        return this.request(`/api/admin/payments/${encodeURIComponent(id)}/refund`, token, {
            method: 'POST',
            body: JSON.stringify({ amountCents })
        });
    }

    public listInvoices(token: string): Promise<{ invoices: any[]; }> {
        return this.request('/api/admin/invoices', token);
    }

    public listCoupons(token: string): Promise<{ coupons: any[]; }> {
        return this.request('/api/admin/coupons', token);
    }

    public createCoupon(token: string, payload: Record<string, any>): Promise<any> {
        return this.request('/api/admin/coupons', token, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    public toggleCoupon(token: string, id: string, isActive: boolean): Promise<any> {
        return this.request(`/api/admin/coupons/${encodeURIComponent(id)}`, token, {
            method: 'PATCH',
            body: JSON.stringify({ isActive })
        });
    }

    // Support, Moderation, Announcements, Notifications
    public listTickets(token: string, params: Record<string, any> = {}): Promise<any> {
        return this.request(`/api/admin/support/tickets${buildQuery(params)}`, token);
    }

    public createTicket(token: string, payload: Record<string, any>): Promise<any> {
        return this.request('/api/admin/support/tickets', token, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    public getTicketDetail(token: string, id: string): Promise<any> {
        return this.request(`/api/admin/support/tickets/${encodeURIComponent(id)}`, token);
    }

    public replyTicket(token: string, id: string, body: string, isInternal = false): Promise<any> {
        return this.request(`/api/admin/support/tickets/${encodeURIComponent(id)}/reply`, token, {
            method: 'POST',
            body: JSON.stringify({ body, isInternal })
        });
    }

    public updateTicket(token: string, id: string, payload: Record<string, any>): Promise<any> {
        return this.request(`/api/admin/support/tickets/${encodeURIComponent(id)}`, token, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
    }

    public listModerationReports(token: string, status?: string): Promise<{ reports: any[]; }> {
        return this.request(`/api/admin/moderation/reports${buildQuery({ status })}`, token);
    }

    public updateModerationReport(token: string, id: string, payload: Record<string, any>): Promise<any> {
        return this.request(`/api/admin/moderation/reports/${encodeURIComponent(id)}`, token, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
    }

    public listAnnouncements(token: string): Promise<{ announcements: any[]; }> {
        return this.request('/api/admin/announcements', token);
    }

    public createAnnouncement(token: string, payload: Record<string, any>): Promise<any> {
        return this.request('/api/admin/announcements', token, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    public updateAnnouncement(token: string, id: string, payload: Record<string, any>): Promise<any> {
        return this.request(`/api/admin/announcements/${encodeURIComponent(id)}`, token, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
    }

    public listNotifications(token: string): Promise<{ notifications: IAdminNotification[]; unreadCount: number; }> {
        return this.request('/api/admin/notifications', token);
    }

    public markNotificationRead(token: string, id: string): Promise<{ success: boolean; }> {
        return this.request(`/api/admin/notifications/${encodeURIComponent(id)}/read`, token, {
            method: 'POST'
        });
    }

    // Infrastructure
    public getInfrastructureOverview(token: string): Promise<any> {
        return this.request('/api/admin/infrastructure/overview', token);
    }

    public getInfrastructureLogs(token: string, params: Record<string, any> = {}): Promise<{ logs: any[]; }> {
        return this.request(`/api/admin/infrastructure/logs${buildQuery(params)}`, token);
    }

    public listAlerts(token: string, status?: string): Promise<{ alerts: any[]; }> {
        return this.request(`/api/admin/infrastructure/alerts${buildQuery({ status })}`, token);
    }

    public acknowledgeAlert(token: string, id: string): Promise<any> {
        return this.request(`/api/admin/infrastructure/alerts/${encodeURIComponent(id)}/acknowledge`, token, {
            method: 'POST'
        });
    }

    public resolveAlert(token: string, id: string): Promise<any> {
        return this.request(`/api/admin/infrastructure/alerts/${encodeURIComponent(id)}/resolve`, token, {
            method: 'POST'
        });
    }

    // Security & Audit
    public getSecurityOverview(token: string): Promise<any> {
        return this.request('/api/admin/security/overview', token);
    }

    public listSecurityEvents(token: string, params: Record<string, any> = {}): Promise<any> {
        return this.request(`/api/admin/security/events${buildQuery(params)}`, token);
    }

    public listSessions(token: string): Promise<{ sessions: any[]; }> {
        return this.request('/api/admin/security/sessions', token);
    }

    public revokeSession(token: string, id: string): Promise<{ success: boolean; }> {
        return this.request(`/api/admin/security/sessions/${encodeURIComponent(id)}`, token, {
            method: 'DELETE'
        });
    }

    public listApiKeys(token: string): Promise<{ apiKeys: any[]; }> {
        return this.request('/api/admin/security/api-keys', token);
    }

    public createApiKey(token: string, payload: Record<string, any>): Promise<any> {
        return this.request('/api/admin/security/api-keys', token, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    public revokeApiKey(token: string, id: string): Promise<{ success: boolean; }> {
        return this.request(`/api/admin/security/api-keys/${encodeURIComponent(id)}`, token, {
            method: 'DELETE'
        });
    }

    public listAuditLogs(token: string, params: Record<string, any> = {}): Promise<{ logs: any[]; total: number; }> {
        return this.request(`/api/admin/audit-logs${buildQuery(params)}`, token);
    }

    // Configuration
    public getSettings(token: string): Promise<{ settings: Record<string, Record<string, any>>; }> {
        return this.request('/api/admin/settings', token);
    }

    public updateSettingsSection(token: string, section: string, values: Record<string, any>): Promise<any> {
        return this.request(`/api/admin/settings/${encodeURIComponent(section)}`, token, {
            method: 'PATCH',
            body: JSON.stringify(values)
        });
    }

    public listFeatureFlags(token: string): Promise<{ featureFlags: any[]; }> {
        return this.request('/api/admin/feature-flags', token);
    }

    public updateFeatureFlag(token: string, id: string, payload: Record<string, any>): Promise<any> {
        return this.request(`/api/admin/feature-flags/${encodeURIComponent(id)}`, token, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
    }
}

export const adminApi = new AdminApiClient();

