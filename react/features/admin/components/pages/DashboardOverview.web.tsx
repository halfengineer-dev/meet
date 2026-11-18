/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles, react/no-multi-comp */
import {
    Activity,
    AlertCircle,
    ArrowDownRight,
    ArrowUpRight,
    Building2,
    Clock,
    DollarSign,
    Film,
    Minus,
    Radio,
    RefreshCw,
    Users,
    Video
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { adminApi } from '../../api';
import {
    AdminSectionId,
    IAdminContextInfo,
    IAdminOrganizationRow,
    IDashboardAnalytics,
    IDashboardOverview,
    IKpiMetric
} from '../../types';
import { AreaLineChart, DonutBreakdown, HorizontalBarList } from '../shared/AdminCharts.web';

interface IDashboardOverviewProps {
    accessToken: string;
    adminContext: IAdminContextInfo;
    mode?: 'dashboard' | 'platform-health';
    onNavigate: (section: AdminSectionId, entityId?: string) => void;
}

function TrendBadge({ metric }: { metric?: IKpiMetric; }) {
    if (metric?.changePercent === null || metric?.changePercent === undefined) {
        return <span className = 'fa-trend flat'><Minus size = { 12 } /> Live</span>;
    }
    const cls = metric.trend === 'up' ? 'up' : metric.trend === 'down' ? 'down' : 'flat';

    return (
        <span className = { `fa-trend ${cls}` }>
            {metric.trend === 'up' && <ArrowUpRight size = { 12 } />}
            {metric.trend === 'down' && <ArrowDownRight size = { 12 } />}
            {metric.trend === 'flat' && <Minus size = { 12 } />}
            {metric.changePercent > 0 ? `+${metric.changePercent}%` : `${metric.changePercent}%`}
        </span>
    );
}

export default function DashboardOverview({
    accessToken,
    adminContext,
    mode = 'dashboard',
    onNavigate
}: IDashboardOverviewProps) {
    const [ days, setDays ] = useState<number>(30);
    const [ orgFilter, setOrgFilter ] = useState<string>('');
    const [ orgs, setOrgs ] = useState<IAdminOrganizationRow[]>([]);
    const [ overview, setOverview ] = useState<IDashboardOverview | null>(null);
    const [ analytics, setAnalytics ] = useState<IDashboardAnalytics | null>(null);
    const [ activity, setActivity ] = useState<any>(null);
    const [ infra, setInfra ] = useState<any>(null);
    const [ loading, setLoading ] = useState<boolean>(true);
    const [ error, setError ] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const promises: Promise<any>[] = [
                adminApi.getDashboardOverview(accessToken, { days, organizationId: orgFilter || undefined }),
                adminApi.getDashboardAnalytics(accessToken, { days: Math.min(days, 90), organizationId: orgFilter || undefined }),
                adminApi.getDashboardActivity(accessToken, orgFilter || undefined)
            ];

            if (adminContext.isPlatformAdmin && adminContext.permissions.includes('organizations:view')) {
                promises.push(adminApi.listOrganizations(accessToken).catch(() => ({ organizations: [] })));
            } else {
                promises.push(Promise.resolve({ organizations: [] }));
            }

            if (adminContext.isPlatformAdmin && adminContext.permissions.includes('health:view')) {
                promises.push(adminApi.getInfrastructureOverview(accessToken).catch(() => null));
            } else {
                promises.push(Promise.resolve(null));
            }

            const [ ov, an, act, orgRes, infraRes ] = await Promise.all(promises);

            setOverview(ov);
            setAnalytics(an);
            setActivity(act);
            setOrgs(orgRes?.organizations || []);
            setInfra(infraRes);
        } catch (err: any) {
            setError(err.message || 'Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    }, [ accessToken, adminContext, days, orgFilter ]);

    useEffect(() => {
        loadData();
    }, [ loadData ]);

    if (mode === 'platform-health') {
        return (
            <div className = 'fa-page'>
                <div className = 'fa-page-header'>
                    <div>
                        <h1>Platform Health</h1>
                        <p>Live operational status of Faceonn API, database, SFU, signaling, and external services.</p>
                    </div>
                    <button
                        className = 'fa-btn fa-btn-secondary'
                        onClick = { loadData }
                        type = 'button'>
                        <RefreshCw size = { 15 } /> Refresh Health
                    </button>
                </div>

                {error && <div className = 'fa-alert-error'>{error}</div>}
                {loading && !infra && <div className = 'fa-loading-box'>Checking platform health...</div>}

                {infra && (
                    <>
                        <div className = 'fa-kpi-grid'>
                            <div className = 'fa-kpi-card'>
                                <div className = 'fa-kpi-top'><span>Overall Status</span><Activity size = { 16 } /></div>
                                <div className = 'fa-kpi-value'>
                                    <span className = { `fa-badge fa-badge-${infra.overallStatus}` }>{infra.overallStatus}</span>
                                </div>
                                <div className = 'fa-kpi-sub'>Open Alerts: {infra.openAlertsCount}</div>
                            </div>
                            <div className = 'fa-kpi-card'>
                                <div className = 'fa-kpi-top'><span>Database ({infra.database?.mode})</span></div>
                                <div className = 'fa-kpi-value'>{infra.database?.connected ? 'Connected' : 'In-Memory'}</div>
                                <div className = 'fa-kpi-sub'>Avg Query: {infra.database?.avgQueryLatencyMs} ms</div>
                            </div>
                            <div className = 'fa-kpi-card'>
                                <div className = 'fa-kpi-top'><span>API Latency (P95)</span></div>
                                <div className = 'fa-kpi-value'>{infra.api?.p95LatencyMs ?? 0} ms</div>
                                <div className = 'fa-kpi-sub'>{infra.api?.requestsPerMinute ?? 0} req/min · 5xx: {infra.api?.http5xx ?? 0}</div>
                            </div>
                            <div className = 'fa-kpi-card'>
                                <div className = 'fa-kpi-top'><span>Socket.IO Connections</span></div>
                                <div className = 'fa-kpi-value'>{infra.socketIo?.activeConnections ?? 0}</div>
                                <div className = 'fa-kpi-sub'>Events/min: {infra.socketIo?.eventsPerMinute ?? 0}</div>
                            </div>
                        </div>

                        <div className = 'fa-card'>
                            <div className = 'fa-card-header'>
                                <h3>Component Matrix</h3>
                                <button
                                    className = 'fa-link-btn'
                                    onClick = { () => onNavigate('infra-sfu') }
                                    type = 'button'>
                                    Open Infrastructure Monitor →
                                </button>
                            </div>
                            <div className = 'fa-table-wrap'>
                                <table className = 'fa-table'>
                                    <thead>
                                        <tr>
                                            <th>Component</th>
                                            <th>Status</th>
                                            <th>Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td><strong>Mediasoup SFU</strong></td>
                                            <td><span className = { `fa-badge fa-badge-${infra.sfu?.status}` }>{infra.sfu?.status}</span></td>
                                            <td>{infra.sfu?.servers?.[0]?.activeWorkers ?? 0} active workers · {infra.sfu?.servers?.[0]?.activeRooms ?? 0} rooms</td>
                                        </tr>
                                        <tr>
                                            <td><strong>Jitsi Cluster</strong></td>
                                            <td><span className = { `fa-badge fa-badge-${infra.jitsi?.status}` }>{infra.jitsi?.status}</span></td>
                                            <td>{infra.jitsi?.configured ? 'Configured & monitored' : 'Set JITSI_JVB_COLIBRI_URL to enable live stats'}</td>
                                        </tr>
                                        <tr>
                                            <td><strong>TURN Server</strong></td>
                                            <td><span className = { `fa-badge fa-badge-${infra.turn?.status}` }>{infra.turn?.status}</span></td>
                                            <td>{infra.turn?.host}:{infra.turn?.port} {infra.turn?.latencyMs !== null ? `(${infra.turn?.latencyMs} ms)` : ''}</td>
                                        </tr>
                                        <tr>
                                            <td><strong>Redis</strong></td>
                                            <td><span className = { `fa-badge fa-badge-${infra.redis?.status}` }>{infra.redis?.status}</span></td>
                                            <td>{infra.redis?.connected ? `Memory ${infra.redis.memoryUsedHuman} · ${infra.redis.connectedClients} clients` : 'Not configured or unavailable'}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    }

    const kpis = overview?.kpis;

    return (
        <div className = 'fa-page'>
            <div className = 'fa-page-header'>
                <div>
                    <h1>Enterprise Control Center</h1>
                    <p>Real-time operational metrics, growth telemetry, and conferencing activity across Faceonn.</p>
                </div>
                <div className = 'fa-header-actions'>
                    <select
                        className = 'fa-select'
                        onChange = { e => setDays(Number(e.target.value)) }
                        value = { days }>
                        <option value = { 7 }>Last 7 days</option>
                        <option value = { 14 }>Last 14 days</option>
                        <option value = { 30 }>Last 30 days</option>
                        <option value = { 90 }>Last 90 days</option>
                    </select>
                    {adminContext.isPlatformAdmin && orgs.length > 0 && (
                        <select
                            className = 'fa-select'
                            onChange = { e => setOrgFilter(e.target.value) }
                            value = { orgFilter }>
                            <option value = ''>All Organizations</option>
                            {orgs.map(o => (
                                <option
                                    key = { o.id }
                                    value = { o.id }>{o.name}</option>
                            ))}
                        </select>
                    )}
                    <button
                        className = 'fa-btn fa-btn-secondary'
                        onClick = { loadData }
                        type = 'button'>
                        <RefreshCw size = { 15 } /> Refresh
                    </button>
                </div>
            </div>

            {error && <div className = 'fa-alert-error'>{error}</div>}
            {loading && !overview && <div className = 'fa-loading-box'>Loading platform analytics...</div>}

            {kpis && (
                <div className = 'fa-kpi-grid'>
                    <div
                        className = 'fa-kpi-card'
                        onClick = { () => onNavigate('users') }>
                        <div className = 'fa-kpi-top'><span>Total Users</span><Users size = { 16 } /></div>
                        <div className = 'fa-kpi-value'>{(kpis.totalUsers.value ?? 0).toLocaleString()}</div>
                        <div className = 'fa-kpi-sub'><TrendBadge metric = { kpis.totalUsers } /> · +{kpis.totalUsers.periodNew ?? 0} in {days}d</div>
                    </div>

                    <div className = 'fa-kpi-card'>
                        <div className = 'fa-kpi-top'><span>Active Users (DAU)</span><Activity size = { 16 } /></div>
                        <div className = 'fa-kpi-value'>{(kpis.dau.value ?? 0).toLocaleString()}</div>
                        <div className = 'fa-kpi-sub'><TrendBadge metric = { kpis.dau } /> · vs previous 24h</div>
                    </div>

                    <div className = 'fa-kpi-card'>
                        <div className = 'fa-kpi-top'><span>Monthly Active (MAU)</span><Users size = { 16 } /></div>
                        <div className = 'fa-kpi-value'>{(kpis.mau.value ?? 0).toLocaleString()}</div>
                        <div className = 'fa-kpi-sub'><TrendBadge metric = { kpis.mau } /> · 30-day rolling</div>
                    </div>

                    <div
                        className = 'fa-kpi-card'
                        onClick = { () => onNavigate('organizations') }>
                        <div className = 'fa-kpi-top'><span>Organizations</span><Building2 size = { 16 } /></div>
                        <div className = 'fa-kpi-value'>{(kpis.totalOrganizations.value ?? 0).toLocaleString()}</div>
                        <div className = 'fa-kpi-sub'><TrendBadge metric = { kpis.totalOrganizations } /> · {days}d delta</div>
                    </div>

                    <div
                        className = 'fa-kpi-card'
                        onClick = { () => onNavigate('meetings') }>
                        <div className = 'fa-kpi-top'><span>Total Meetings</span><Video size = { 16 } /></div>
                        <div className = 'fa-kpi-value'>{(kpis.totalMeetings.value ?? 0).toLocaleString()}</div>
                        <div className = 'fa-kpi-sub'><TrendBadge metric = { kpis.totalMeetings } /> · {days}d period</div>
                    </div>

                    <div
                        className = 'fa-kpi-card highlight-live'
                        onClick = { () => onNavigate('live-monitoring') }>
                        <div className = 'fa-kpi-top'><span>Meetings Live Now</span><Radio size = { 16 } /></div>
                        <div className = 'fa-kpi-value'>{(kpis.liveMeetings.value ?? 0).toLocaleString()}</div>
                        <div className = 'fa-kpi-sub'>Click to inspect live rooms</div>
                    </div>

                    <div className = 'fa-kpi-card'>
                        <div className = 'fa-kpi-top'><span>Meeting Minutes</span><Clock size = { 16 } /></div>
                        <div className = 'fa-kpi-value'>{(kpis.totalMeetingMinutes.value ?? 0).toLocaleString()}</div>
                        <div className = 'fa-kpi-sub'><TrendBadge metric = { kpis.totalMeetingMinutes } /> · cumulative</div>
                    </div>

                    <div
                        className = 'fa-kpi-card'
                        onClick = { () => onNavigate('recordings') }>
                        <div className = 'fa-kpi-top'><span>Total Recordings</span><Film size = { 16 } /></div>
                        <div className = 'fa-kpi-value'>{(kpis.totalRecordings.value ?? 0).toLocaleString()}</div>
                        <div className = 'fa-kpi-sub'><TrendBadge metric = { kpis.totalRecordings } /> · metadata records</div>
                    </div>

                    {kpis.mrrCents.visible && (
                        <div
                            className = 'fa-kpi-card'
                            onClick = { () => onNavigate('revenue-analytics') }>
                            <div className = 'fa-kpi-top'><span>Monthly Recurring Revenue</span><DollarSign size = { 16 } /></div>
                            <div className = 'fa-kpi-value'>${((kpis.mrrCents.value ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            <div className = 'fa-kpi-sub'>Active subscriptions ({kpis.mrrCents.currency})</div>
                        </div>
                    )}

                    <div
                        className = 'fa-kpi-card'
                        onClick = { () => onNavigate('security-dashboard') }>
                        <div className = 'fa-kpi-top'><span>Errors &amp; Alerts</span><AlertCircle size = { 16 } /></div>
                        <div className = 'fa-kpi-value'>{(kpis.failedMeetingsAndErrors.value ?? 0).toLocaleString()}</div>
                        <div className = 'fa-kpi-sub'>High security events: {kpis.failedMeetingsAndErrors.securityHighEvents ?? 0}</div>
                    </div>
                </div>
            )}

            {analytics && (
                <div className = 'fa-grid-2'>
                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'>
                            <div>
                                <h3>User Registrations</h3>
                                <p>Daily onboarded users over the last {analytics.timeRangeDays} days</p>
                            </div>
                        </div>
                        <AreaLineChart
                            color = '#2563eb'
                            data = { analytics.userGrowth.daily.map(d => ({ label: d.date.slice(5), value: d.registrations })) }
                            primaryLabel = 'Registrations' />
                    </div>

                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'>
                            <div>
                                <h3>Meeting Activity</h3>
                                <p>Avg duration: {analytics.meetingAnalytics.averageDurationMinutes} min · {analytics.meetingAnalytics.totalSessions} sessions</p>
                            </div>
                        </div>
                        <AreaLineChart
                            color = '#2563eb'
                            data = { analytics.meetingAnalytics.daily.map(d => ({
                                label: d.date.slice(5),
                                value: d.created,
                                secondary: d.started
                            })) }
                            primaryLabel = 'Created'
                            secondaryColor = '#7c3aed'
                            secondaryLabel = 'Started' />
                    </div>
                </div>
            )}

            {analytics && (
                <div className = 'fa-grid-3'>
                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'><h3>Active vs. Inactive Users</h3></div>
                        <DonutBreakdown
                            segments = { [
                                { label: 'Active (30d)', value: analytics.userGrowth.activeVsInactive.active, color: '#2563eb' },
                                { label: 'Inactive', value: analytics.userGrowth.activeVsInactive.inactive, color: '#cbd5e1' }
                            ] } />
                    </div>

                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'><h3>Geographic Distribution</h3></div>
                        <HorizontalBarList
                            emptyText = 'No country attributes recorded on users yet.'
                            items = { analytics.geographic.map(g => ({
                                label: g.country,
                                count: g.users,
                                sublabel: `${g.meetings} meetings`
                            })) } />
                    </div>

                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'><h3>Client Platforms &amp; Browsers</h3></div>
                        <HorizontalBarList
                            emptyText = 'No active session User-Agent telemetry yet.'
                            items = { [
                                ...analytics.platformUsage.browsers.map(b => ({ label: `Browser: ${b.name}`, count: b.count })),
                                ...analytics.platformUsage.devices.map(d => ({ label: `Device: ${d.name}`, count: d.count }))
                            ] } />
                    </div>
                </div>
            )}

            {activity && (
                <div className = 'fa-grid-2'>
                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'>
                            <h3>Latest User Registrations</h3>
                            <button
                                className = 'fa-link-btn'
                                onClick = { () => onNavigate('users') }
                                type = 'button'>View all →</button>
                        </div>
                        <div className = 'fa-activity-list'>
                            {(activity.latestRegistrations || []).length === 0 ? (
                                <p className = 'fa-muted'>No registrations recorded yet.</p>
                            ) : (
                                activity.latestRegistrations.map((u: any) => (
                                    <div
                                        className = 'fa-activity-row'
                                        key = { u.id }>
                                        <div>
                                            <strong>{u.name || u.email}</strong>
                                            <span className = 'fa-muted-xs'>{u.email}</span>
                                        </div>
                                        <span className = 'fa-muted-xs'>{new Date(u.createdAt).toLocaleDateString()}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'>
                            <h3>Recent Meetings</h3>
                            <button
                                className = 'fa-link-btn'
                                onClick = { () => onNavigate('meetings') }
                                type = 'button'>View all →</button>
                        </div>
                        <div className = 'fa-activity-list'>
                            {(activity.recentMeetings || []).length === 0 ? (
                                <p className = 'fa-muted'>No meetings created yet.</p>
                            ) : (
                                activity.recentMeetings.map((m: any) => (
                                    <div
                                        className = 'fa-activity-row'
                                        key = { m.id }>
                                        <div>
                                            <strong>{m.title}</strong>
                                            <span className = 'fa-muted-xs'>/{m.roomId} · {m.meetingType}</span>
                                        </div>
                                        <span className = { `fa-badge fa-badge-${m.status}` }>{m.status}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
