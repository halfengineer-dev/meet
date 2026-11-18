import { userRepository } from '../db/repositories/user-repository';
import { sessionRepository } from '../db/repositories/session-repository';
import { meetingRepository } from '../db/repositories/meeting-repository';
import { meetingSessionRepository } from '../db/repositories/meeting-session-repository';
import { adminStore } from '../db/repositories/admin-store';
import { parseUserAgentSummary } from './admin-user-service';
import { AdminContext, hasPermission } from './rbac';

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const CACHE_TTL_MS = 15_000;

function calcDelta(current: number, previous: number): { current: number; previous: number; changePercent: number | null; trend: 'up' | 'down' | 'flat' } {
  if (previous === 0) {
    return {
      current,
      previous,
      changePercent: current > 0 ? 100 : 0,
      trend: current > 0 ? 'up' : 'flat',
    };
  }
  const pct = Number((((current - previous) / previous) * 100).toFixed(1));
  return {
    current,
    previous,
    changePercent: pct,
    trend: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
  };
}

function formatDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class AnalyticsService {
  private overviewCache = new Map<string, CacheEntry<any>>();

  public clearCache(): void {
    this.overviewCache.clear();
  }

  public async getDashboardOverview(
    ctx: AdminContext,
    filters: { days?: number; organizationId?: string }
  ) {
    const days = Math.min(365, Math.max(1, Number(filters.days) || 30));
    const scopeOrgId = ctx.scopedOrganizationId || filters.organizationId || null;
    const cacheKey = `${ctx.userId}:${scopeOrgId || 'all'}:${days}`;
    const cached = this.overviewCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() && process.env.NODE_ENV !== 'test') {
      return cached.value;
    }

    const now = Date.now();
    const periodMs = days * 86400 * 1000;
    const periodStart = now - periodMs;
    const prevPeriodStart = periodStart - periodMs;
    const dayAgo = now - 86400 * 1000;
    const twoDaysAgo = now - 2 * 86400 * 1000;
    const thirtyDaysAgo = now - 30 * 86400 * 1000;
    const sixtyDaysAgo = now - 60 * 86400 * 1000;

    const [allUsers, allOrgs, allMeetings, allSessions, allRecordings, allSubs, secEvents] = await Promise.all([
      userRepository.listUsers(),
      adminStore.listOrganizations(scopeOrgId),
      meetingRepository.listAllMeetings(scopeOrgId),
      meetingSessionRepository.listAllSessions(5000),
      adminStore.listRecordings(scopeOrgId),
      adminStore.listSubscriptions(scopeOrgId),
      adminStore.listSecurityEvents({ limit: 500 }),
    ]);

    const scopedUsers = scopeOrgId ? allUsers.filter((u) => u.organization_id === scopeOrgId) : allUsers;
    const meetingIdSet = new Set(allMeetings.map((m) => m.id));
    const scopedSessions = allSessions.filter((s) => meetingIdSet.has(s.meeting_id));

    // KPI 1: Total Users (growth vs previous period)
    const usersInPeriod = scopedUsers.filter((u) => u.created_at.getTime() >= periodStart).length;
    const usersPrevPeriod = scopedUsers.filter((u) => u.created_at.getTime() >= prevPeriodStart && u.created_at.getTime() < periodStart).length;

    // KPI 2: DAU
    const dau = scopedUsers.filter((u) => (u.last_active_at || u.last_login_at) && (u.last_active_at || u.last_login_at)!.getTime() >= dayAgo).length;
    const prevDau = scopedUsers.filter((u) => {
      const t = (u.last_active_at || u.last_login_at)?.getTime();
      return t && t >= twoDaysAgo && t < dayAgo;
    }).length;

    // KPI 3: MAU
    const mau = scopedUsers.filter((u) => (u.last_active_at || u.last_login_at) && (u.last_active_at || u.last_login_at)!.getTime() >= thirtyDaysAgo).length;
    const prevMau = scopedUsers.filter((u) => {
      const t = (u.last_active_at || u.last_login_at)?.getTime();
      return t && t >= sixtyDaysAgo && t < thirtyDaysAgo;
    }).length;

    // KPI 4: Organizations
    const orgsInPeriod = allOrgs.filter((o) => o.created_at.getTime() >= periodStart).length;
    const orgsPrevPeriod = allOrgs.filter((o) => o.created_at.getTime() >= prevPeriodStart && o.created_at.getTime() < periodStart).length;

    // KPI 5 & 6: Total Meetings & Live Meetings
    const meetingsInPeriod = allMeetings.filter((m) => m.created_at.getTime() >= periodStart).length;
    const meetingsPrevPeriod = allMeetings.filter((m) => m.created_at.getTime() >= prevPeriodStart && m.created_at.getTime() < periodStart).length;
    const liveMeetings = scopedSessions.filter((s) => s.status === 'active').length;

    // KPI 7: Total Meeting Minutes (from real sessions)
    const calcSessionMins = (s: typeof scopedSessions[number]) => {
      const end = s.ended_at ? s.ended_at.getTime() : now;
      return Math.max(1, Math.round((end - s.started_at.getTime()) / 60000));
    };
    const totalMinutes = scopedSessions.reduce((sum, s) => sum + calcSessionMins(s), 0);
    const periodMinutes = scopedSessions.filter((s) => s.started_at.getTime() >= periodStart).reduce((sum, s) => sum + calcSessionMins(s), 0);
    const prevPeriodMinutes = scopedSessions
      .filter((s) => s.started_at.getTime() >= prevPeriodStart && s.started_at.getTime() < periodStart)
      .reduce((sum, s) => sum + calcSessionMins(s), 0);

    // KPI 8: Total Recordings
    const activeRecordings = allRecordings.filter((r) => r.status !== 'deleted');
    const recInPeriod = activeRecordings.filter((r) => r.recorded_at.getTime() >= periodStart).length;
    const recPrevPeriod = activeRecordings.filter((r) => r.recorded_at.getTime() >= prevPeriodStart && r.recorded_at.getTime() < periodStart).length;

    // KPI 9: MRR (only exposed if user has billing:view or super_admin)
    const canSeeBilling = hasPermission(ctx, 'billing:view');
    const mrrCents = canSeeBilling
      ? allSubs
          .filter((s) => s.status === 'active')
          .reduce((sum, s) => sum + (s.billing_cycle === 'yearly' ? Math.round(s.amount_cents / 12) : s.amount_cents), 0)
      : null;

    // KPI 10: Failed Meetings / Connection Errors
    const failedSessions = scopedSessions.filter((s) => s.termination_reason && /error|fail|crash/i.test(s.termination_reason)).length;
    const failedSecEvents = secEvents.items.filter((e) => e.created_at.getTime() >= periodStart && e.severity === 'high').length;

    const result = {
      timeRangeDays: days,
      generatedAt: new Date().toISOString(),
      kpis: {
        totalUsers: { value: scopedUsers.length, ...calcDelta(usersInPeriod, usersPrevPeriod), periodNew: usersInPeriod },
        dau: { value: dau, ...calcDelta(dau, prevDau) },
        mau: { value: mau, ...calcDelta(mau, prevMau) },
        totalOrganizations: { value: allOrgs.length, ...calcDelta(orgsInPeriod, orgsPrevPeriod) },
        totalMeetings: { value: allMeetings.length, ...calcDelta(meetingsInPeriod, meetingsPrevPeriod) },
        liveMeetings: { value: liveMeetings, trend: liveMeetings > 0 ? 'up' : 'flat', changePercent: null },
        totalMeetingMinutes: { value: totalMinutes, ...calcDelta(periodMinutes, prevPeriodMinutes) },
        totalRecordings: { value: activeRecordings.length, ...calcDelta(recInPeriod, recPrevPeriod) },
        mrrCents: mrrCents !== null ? { value: mrrCents, currency: 'USD', visible: true } : { value: null, currency: 'USD', visible: false },
        failedMeetingsAndErrors: { value: failedSessions, securityHighEvents: failedSecEvents },
      },
    };

    this.overviewCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
    return result;
  }

  public async getAnalyticsSeries(
    ctx: AdminContext,
    filters: { days?: number; organizationId?: string; country?: string }
  ) {
    const days = Math.min(90, Math.max(7, Number(filters.days) || 14));
    const scopeOrgId = ctx.scopedOrganizationId || filters.organizationId || null;

    const [allUsers, allMeetings, allSessions, allActiveUserSessions] = await Promise.all([
      userRepository.listUsers(),
      meetingRepository.listAllMeetings(scopeOrgId),
      meetingSessionRepository.listAllSessions(5000),
      sessionRepository.listAllActiveSessions(500),
    ]);

    const scopedUsers = allUsers.filter((u) => {
      if (scopeOrgId && u.organization_id !== scopeOrgId) return false;
      if (filters.country && (u.country || '').toLowerCase() !== filters.country.toLowerCase()) return false;
      return true;
    });

    const userIdSet = new Set(scopedUsers.map((u) => u.id));
    const meetingIdSet = new Set(allMeetings.map((m) => m.id));
    const scopedSessions = allSessions.filter((s) => meetingIdSet.has(s.meeting_id));

    // Build daily buckets
    const dayLabels: string[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400 * 1000);
      dayLabels.push(formatDayKey(d));
    }

    const userRegByDay = new Map<string, number>();
    const meetingsCreatedByDay = new Map<string, number>();
    const meetingsStartedByDay = new Map<string, number>();
    const minutesByDay = new Map<string, number>();

    for (const label of dayLabels) {
      userRegByDay.set(label, 0);
      meetingsCreatedByDay.set(label, 0);
      meetingsStartedByDay.set(label, 0);
      minutesByDay.set(label, 0);
    }

    for (const u of scopedUsers) {
      const k = formatDayKey(u.created_at);
      if (userRegByDay.has(k)) userRegByDay.set(k, (userRegByDay.get(k) || 0) + 1);
    }

    for (const m of allMeetings) {
      const k = formatDayKey(m.created_at);
      if (meetingsCreatedByDay.has(k)) meetingsCreatedByDay.set(k, (meetingsCreatedByDay.get(k) || 0) + 1);
    }

    let totalSessionDurationMins = 0;
    for (const s of scopedSessions) {
      const k = formatDayKey(s.started_at);
      const end = s.ended_at ? s.ended_at.getTime() : Date.now();
      const mins = Math.max(1, Math.round((end - s.started_at.getTime()) / 60000));
      totalSessionDurationMins += mins;
      if (meetingsStartedByDay.has(k)) {
        meetingsStartedByDay.set(k, (meetingsStartedByDay.get(k) || 0) + 1);
        minutesByDay.set(k, (minutesByDay.get(k) || 0) + mins);
      }
    }

    // Active vs inactive users
    const thirtyDaysAgo = Date.now() - 30 * 86400 * 1000;
    const activeCount = scopedUsers.filter((u) => (u.last_active_at || u.last_login_at) && (u.last_active_at || u.last_login_at)!.getTime() >= thirtyDaysAgo).length;
    const inactiveCount = Math.max(0, scopedUsers.length - activeCount);

    // Geographic distribution from real users.country
    const countryMap = new Map<string, { users: number; meetings: number }>();
    const userCountryMap = new Map<string, string>();
    for (const u of scopedUsers) {
      const c = u.country || 'Unspecified';
      userCountryMap.set(u.id, c);
      const entry = countryMap.get(c) || { users: 0, meetings: 0 };
      entry.users += 1;
      countryMap.set(c, entry);
    }
    for (const m of allMeetings) {
      const c = userCountryMap.get(m.owner_user_id) || 'Unspecified';
      const entry = countryMap.get(c) || { users: 0, meetings: 0 };
      entry.meetings += 1;
      countryMap.set(c, entry);
    }

    // Platform usage (Browser / OS / Desktop vs Mobile) from real sessions.user_agent
    const browserCounts = new Map<string, number>();
    const osCounts = new Map<string, number>();
    const deviceCounts = new Map<string, number>();

    for (const s of allActiveUserSessions) {
      if (scopeOrgId && !userIdSet.has(s.user_id)) continue;
      const parsed = parseUserAgentSummary(s.user_agent);
      browserCounts.set(parsed.browser, (browserCounts.get(parsed.browser) || 0) + 1);
      osCounts.set(parsed.os, (osCounts.get(parsed.os) || 0) + 1);
      deviceCounts.set(parsed.deviceType, (deviceCounts.get(parsed.deviceType) || 0) + 1);
    }

    const avgMeetingDurationMins = scopedSessions.length > 0 ? Math.round(totalSessionDurationMins / scopedSessions.length) : 0;

    return {
      timeRangeDays: days,
      userGrowth: {
        daily: dayLabels.map((date) => ({ date, registrations: userRegByDay.get(date) || 0 })),
        activeVsInactive: { active: activeCount, inactive: inactiveCount },
      },
      meetingAnalytics: {
        daily: dayLabels.map((date) => ({
          date,
          created: meetingsCreatedByDay.get(date) || 0,
          started: meetingsStartedByDay.get(date) || 0,
          minutes: minutesByDay.get(date) || 0,
        })),
        averageDurationMinutes: avgMeetingDurationMins,
        totalConferencingMinutes: totalSessionDurationMins,
        totalSessions: scopedSessions.length,
      },
      geographic: Array.from(countryMap.entries())
        .map(([country, data]) => ({ country, ...data }))
        .sort((a, b) => b.users - a.users)
        .slice(0, 12),
      platformUsage: {
        browsers: Array.from(browserCounts.entries()).map(([name, count]) => ({ name, count })),
        operatingSystems: Array.from(osCounts.entries()).map(([name, count]) => ({ name, count })),
        devices: Array.from(deviceCounts.entries()).map(([name, count]) => ({ name, count })),
      },
    };
  }

  public async getRecentActivity(ctx: AdminContext, organizationId?: string) {
    const scopeOrgId = ctx.scopedOrganizationId || organizationId || null;
    const [users, meetings, orgs, payments, tickets, secEvents] = await Promise.all([
      userRepository.listUsers(),
      meetingRepository.listAllMeetings(scopeOrgId),
      adminStore.listOrganizations(scopeOrgId),
      hasPermission(ctx, 'billing:view') ? adminStore.listPayments(scopeOrgId) : Promise.resolve([]),
      hasPermission(ctx, 'support:view') ? adminStore.listSupportTickets(scopeOrgId) : Promise.resolve([]),
      hasPermission(ctx, 'security:view') ? adminStore.listSecurityEvents({ limit: 15 }) : Promise.resolve({ items: [], total: 0 }),
    ]);

    const scopedUsers = scopeOrgId ? users.filter((u) => u.organization_id === scopeOrgId) : users;

    return {
      latestRegistrations: scopedUsers.slice(0, 8).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        status: u.status,
        createdAt: u.created_at.toISOString(),
      })),
      recentMeetings: meetings.slice(0, 8).map((m) => ({
        id: m.id,
        roomId: m.room_id,
        title: m.title,
        status: m.status,
        meetingType: m.meeting_type,
        createdAt: m.created_at.toISOString(),
        endedAt: m.ended_at ? m.ended_at.toISOString() : null,
      })),
      newOrganizations: orgs.slice(0, 6).map((o) => ({
        id: o.id,
        name: o.name,
        planSlug: o.plan_slug,
        status: o.status,
        createdAt: o.created_at.toISOString(),
      })),
      recentPayments: payments.slice(0, 6).map((p) => ({
        id: p.id,
        amountCents: p.amount_cents,
        currency: p.currency,
        status: p.status,
        createdAt: p.created_at,
      })),
      recentTickets: tickets.slice(0, 6).map((t) => ({
        id: t.id,
        ticketNumber: t.ticket_number,
        subject: t.subject,
        priority: t.priority,
        status: t.status,
        updatedAt: t.updated_at,
      })),
      securityAlerts: secEvents.items
        .filter((e) => e.severity === 'medium' || e.severity === 'high' || e.severity === 'critical')
        .slice(0, 8),
    };
  }
}

export const analyticsService = new AnalyticsService();

