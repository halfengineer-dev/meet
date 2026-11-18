/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import { Activity, AlertTriangle, CheckCircle, Cpu, Database, Radio, RefreshCw, Server, Terminal } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { adminApi } from '../../api';
import { IAdminContextInfo } from '../../types';

interface IInfrastructurePageProps {
    accessToken: string;
    adminContext: IAdminContextInfo;
    mode: 'infra-sfu' | 'infra-turn' | 'infra-jitsi' | 'infra-redis' | 'infra-api' | 'infra-logs';
}

export default function InfrastructurePage({ accessToken, adminContext, mode }: IInfrastructurePageProps) {
    const [ overview, setOverview ] = useState<any>(null);
    const [ alerts, setAlerts ] = useState<any[]>([]);
    const [ logs, setLogs ] = useState<any[]>([]);
    const [ logLevel, setLogLevel ] = useState('');
    const [ loading, setLoading ] = useState(true);
    const [ error, setError ] = useState<string | null>(null);

    const canManage = adminContext.isSuperAdmin || adminContext.permissions.includes('infrastructure:manage');

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [ ov, al, lg ] = await Promise.all([
                adminApi.getInfrastructureOverview(accessToken),
                adminApi.listAlerts(accessToken),
                mode === 'infra-logs'
                    ? adminApi.getInfrastructureLogs(accessToken, { level: logLevel || undefined, limit: 150 })
                    : Promise.resolve({ logs: [] })
            ]);

            setOverview(ov);
            setAlerts(al.alerts || []);
            setLogs(lg.logs || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load infrastructure telemetry');
        } finally {
            setLoading(false);
        }
    }, [ accessToken, logLevel, mode ]);

    useEffect(() => {
        loadData();
    }, [ loadData ]);

    const sfuServer = overview?.sfu?.servers?.[0];

    return (
        <div className = 'fa-page'>
            <div className = 'fa-page-header'>
                <div>
                    <h1>
                        {mode === 'infra-sfu' && 'Mediasoup SFU Servers'}
                        {mode === 'infra-turn' && 'TURN Relay Infrastructure'}
                        {mode === 'infra-jitsi' && 'Jitsi Cluster Nodes'}
                        {mode === 'infra-redis' && 'Redis & Socket.IO Telemetry'}
                        {mode === 'infra-api' && 'API & Database Performance'}
                        {mode === 'infra-logs' && 'System Logs & Infrastructure Alerts'}
                    </h1>
                    <p>Authentic runtime telemetry from Faceonn services. Unconfigured external probes are explicitly marked rather than fabricated.</p>
                </div>
                <button
                    className = 'fa-btn fa-btn-secondary'
                    onClick = { loadData }
                    type = 'button'>
                    <RefreshCw size = { 15 } /> Refresh Metrics
                </button>
            </div>

            {error && <div className = 'fa-alert-error'>{error}</div>}
            {loading && !overview && <div className = 'fa-loading-box'>Collecting live telemetry...</div>}

            {overview && mode === 'infra-sfu' && sfuServer && (
                <>
                    <div className = 'fa-kpi-grid'>
                        <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>SFU Status</span><Server size = { 15 } /></div><div className = 'fa-kpi-value'><span className = { `fa-badge fa-badge-${sfuServer.status}` }>{sfuServer.status}</span></div><div className = 'fa-kpi-sub'>{sfuServer.nodeId} ({sfuServer.region})</div></div>
                        <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>CPU / Memory</span><Cpu size = { 15 } /></div><div className = 'fa-kpi-value'>{sfuServer.cpuUtilizationPct}% / {sfuServer.memoryUsedPct}%</div><div className = 'fa-kpi-sub'>{sfuServer.cpuCount} cores · {sfuServer.memoryFreeMb} MB free</div></div>
                        <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Active Workers / Rooms</span></div><div className = 'fa-kpi-value'>{sfuServer.activeWorkers} / {sfuServer.activeRooms}</div><div className = 'fa-kpi-sub'>Ports {sfuServer.rtcPortRange}</div></div>
                        <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Transports / Prod / Cons</span></div><div className = 'fa-kpi-value'>{sfuServer.activeTransports} / {sfuServer.activeProducers} / {sfuServer.activeConsumers}</div><div className = 'fa-kpi-sub'>{sfuServer.activeParticipants} participants</div></div>
                    </div>

                    {overview.sfu.note && <div className = 'fa-info-banner'>{overview.sfu.note}</div>}

                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'><h3>Mediasoup Workers ({sfuServer.workers?.length || 0})</h3></div>
                        <div className = 'fa-table-wrap'>
                            <table className = 'fa-table'>
                                <thead><tr><th>Worker #</th><th>PID</th><th>State</th><th>User CPU (ms)</th><th>Max RSS</th></tr></thead>
                                <tbody>
                                    {(sfuServer.workers || []).length === 0 ? (
                                        <tr><td
                                            className = 'fa-muted'
                                            colSpan = { 5 }>No local Mediasoup worker processes active in this runtime.</td></tr>
                                    ) : (
                                        sfuServer.workers.map((w: any) => (
                                            <tr key = { w.pid }>
                                                <td>Worker #{w.index}</td>
                                                <td><code>{w.pid}</code></td>
                                                <td><span className = { `fa-badge ${w.closed ? 'fa-badge-failed' : 'fa-badge-healthy'}` }>{w.closed ? 'closed' : 'running'}</span></td>
                                                <td>{w.ruUtime ?? '—'}</td>
                                                <td>{w.ruMaxrss ?? '—'}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {overview && mode === 'infra-jitsi' && (
                <div className = 'fa-card'>
                    <div className = 'fa-card-header'>
                        <div>
                            <h3>Jitsi Meet Cluster Health</h3>
                            <p>Status: <span className = { `fa-badge fa-badge-${overview.jitsi.status}` }>{overview.jitsi.status}</span></p>
                        </div>
                    </div>
                    {overview.jitsi.documentation && <div className = 'fa-info-banner'>{overview.jitsi.documentation}</div>}
                    <div className = 'fa-table-wrap'>
                        <table className = 'fa-table'>
                            <thead><tr><th>Service</th><th>Configured</th><th>Status</th><th>Details</th></tr></thead>
                            <tbody>
                                <tr>
                                    <td><strong>Jitsi Videobridge (JVB)</strong></td>
                                    <td>{overview.jitsi.components?.jvb?.configured ? 'Yes' : 'No'}</td>
                                    <td><span className = { `fa-badge fa-badge-${overview.jitsi.components?.jvb?.status}` }>{overview.jitsi.components?.jvb?.status}</span></td>
                                    <td>Conferences: {overview.jitsi.components?.jvb?.activeConferences ?? 'N/A'} · Participants: {overview.jitsi.components?.jvb?.activeParticipants ?? 'N/A'}</td>
                                </tr>
                                <tr>
                                    <td><strong>Prosody XMPP</strong></td>
                                    <td>{overview.jitsi.components?.prosody?.configured ? 'Yes' : 'No'}</td>
                                    <td><span className = { `fa-badge fa-badge-${overview.jitsi.components?.prosody?.status}` }>{overview.jitsi.components?.prosody?.status}</span></td>
                                    <td>{overview.jitsi.components?.prosody?.error || (overview.jitsi.components?.prosody?.latencyMs ? `${overview.jitsi.components.prosody.latencyMs} ms` : 'Awaiting health URL')}</td>
                                </tr>
                                <tr>
                                    <td><strong>Jicofo</strong></td>
                                    <td>{overview.jitsi.components?.jicofo?.configured ? 'Yes' : 'No'}</td>
                                    <td><span className = { `fa-badge fa-badge-${overview.jitsi.components?.jicofo?.status}` }>{overview.jitsi.components?.jicofo?.status}</span></td>
                                    <td>{overview.jitsi.components?.jicofo?.error || (overview.jitsi.components?.jicofo?.latencyMs ? `${overview.jitsi.components.jicofo.latencyMs} ms` : 'Awaiting health URL')}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {overview && mode === 'infra-turn' && (
                <div className = 'fa-card'>
                    <div className = 'fa-card-header'>
                        <div>
                            <h3>TURN Relay Server ({overview.turn.host}:{overview.turn.port})</h3>
                            <p>Status: <span className = { `fa-badge fa-badge-${overview.turn.status}` }>{overview.turn.status}</span></p>
                        </div>
                    </div>
                    {overview.turn.documentation && <div className = 'fa-info-banner'>{overview.turn.documentation}</div>}
                    <dl className = 'fa-dl'>
                        <dt>TCP Reachability</dt><dd>{overview.turn.reachable === null ? 'Not probed (TURN_HOST unset)' : overview.turn.reachable ? 'Reachable' : `Unreachable (${overview.turn.error})`}</dd>
                        <dt>Probe Latency</dt><dd>{overview.turn.latencyMs !== null ? `${overview.turn.latencyMs} ms` : '—'}</dd>
                        <dt>Active Allocations</dt><dd>{overview.turn.activeAllocations ?? 'Requires TURN_METRICS_URL'}</dd>
                        <dt>Auth / Relay Failures</dt><dd>{overview.turn.authFailures ?? '—'} / {overview.turn.relayFailures ?? '—'}</dd>
                    </dl>
                </div>
            )}

            {overview && mode === 'infra-redis' && (
                <div className = 'fa-grid-2'>
                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'>
                            <h3><Database size = { 16 } /> Redis Cache &amp; Pub/Sub</h3>
                            <span className = { `fa-badge fa-badge-${overview.redis.status}` }>{overview.redis.status}</span>
                        </div>
                        {overview.redis.documentation && <div className = 'fa-info-banner'>{overview.redis.documentation}</div>}
                        <dl className = 'fa-dl'>
                            <dt>Connected</dt><dd>{overview.redis.connected ? 'Yes' : 'No'}</dd>
                            <dt>Latency</dt><dd>{overview.redis.latencyMs !== null ? `${overview.redis.latencyMs} ms` : '—'}</dd>
                            <dt>Memory Used</dt><dd>{overview.redis.memoryUsedHuman || '—'}</dd>
                            <dt>Connected Clients</dt><dd>{overview.redis.connectedClients ?? '—'}</dd>
                            <dt>Commands / sec</dt><dd>{overview.redis.commandsPerSec ?? '—'}</dd>
                            <dt>Cache Hit Rate</dt><dd>{overview.redis.cacheHitRatePercent !== null ? `${overview.redis.cacheHitRatePercent}%` : '—'}</dd>
                            <dt>Key Count</dt><dd>{overview.redis.keyCount ?? '—'}</dd>
                        </dl>
                    </div>

                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'>
                            <h3><Radio size = { 16 } /> Socket.IO Signaling</h3>
                            <span className = 'fa-badge fa-badge-healthy'>{overview.socketIo.nodeId}</span>
                        </div>
                        <dl className = 'fa-dl'>
                            <dt>Active Connections</dt><dd><strong>{overview.socketIo.activeConnections}</strong></dd>
                            <dt>Total Connections</dt><dd>{overview.socketIo.totalConnections}</dd>
                            <dt>Total Disconnections</dt><dd>{overview.socketIo.totalDisconnections}</dd>
                            <dt>Event Throughput</dt><dd>{overview.socketIo.eventsPerMinute} events/min</dd>
                            <dt>Socket Errors</dt><dd>{overview.socketIo.socketErrors}</dd>
                            <dt>Redis Adapter</dt><dd>{overview.socketIo.redisAdapterConfigured ? 'Configured' : 'Single-node memory adapter'}</dd>
                        </dl>
                    </div>
                </div>
            )}

            {overview && mode === 'infra-api' && (
                <>
                    <div className = 'fa-kpi-grid'>
                        <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Requests / min</span><Activity size = { 15 } /></div><div className = 'fa-kpi-value'>{overview.api.requestsPerMinute}</div><div className = 'fa-kpi-sub'>{overview.api.requestsPerSecond} req/s · Total: {overview.api.totalRequests}</div></div>
                        <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Avg / P95 / P99 Latency</span></div><div className = 'fa-kpi-value'>{overview.api.avgResponseTimeMs} / {overview.api.p95LatencyMs} / {overview.api.p99LatencyMs} ms</div><div className = 'fa-kpi-sub'>Real-time rolling samples</div></div>
                        <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>HTTP 4xx / 5xx</span></div><div className = 'fa-kpi-value'>{overview.api.http4xx} / {overview.api.http5xx}</div><div className = 'fa-kpi-sub'>Error rate: {overview.api.errorRatePercent}%</div></div>
                        <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>DB Latency (Avg / P95)</span></div><div className = 'fa-kpi-value'>{overview.database.avgQueryLatencyMs} / {overview.database.p95QueryLatencyMs} ms</div><div className = 'fa-kpi-sub'>Mode: {overview.database.mode}</div></div>
                    </div>

                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'><h3>Slowest Endpoints</h3></div>
                        <div className = 'fa-table-wrap'>
                            <table className = 'fa-table'>
                                <thead><tr><th>Endpoint</th><th>Requests</th><th>Avg (ms)</th><th>Max (ms)</th><th>Errors</th></tr></thead>
                                <tbody>
                                    {(overview.api.slowEndpoints || []).map((ep: any) => (
                                        <tr key = { ep.route }>
                                            <td><code>{ep.route}</code></td>
                                            <td>{ep.count}</td>
                                            <td>{ep.avgMs}</td>
                                            <td>{ep.maxMs}</td>
                                            <td>{ep.errors}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {mode === 'infra-logs' && (
                <>
                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'><h3><AlertTriangle size = { 16 } /> Infrastructure Alerts ({alerts.length})</h3></div>
                        <div className = 'fa-table-wrap'>
                            <table className = 'fa-table'>
                                <thead><tr><th>Source</th><th>Alert</th><th>Severity</th><th>Status</th><th>Actions</th></tr></thead>
                                <tbody>
                                    {alerts.length === 0 ? (
                                        <tr><td
                                            className = 'fa-muted'
                                            colSpan = { 5 }>No infrastructure alerts triggered.</td></tr>
                                    ) : (
                                        alerts.map(a => (
                                            <tr key = { a.id }>
                                                <td><span className = 'fa-badge'>{a.source}</span></td>
                                                <td><strong>{a.title}</strong><div className = 'fa-muted-xs'>{a.message}</div></td>
                                                <td><span className = { `fa-badge fa-badge-${a.severity}` }>{a.severity}</span></td>
                                                <td><span className = { `fa-badge fa-badge-${a.status}` }>{a.status}</span></td>
                                                <td>
                                                    {canManage && a.status === 'open' && (
                                                        <button
                                                            className = 'fa-link-btn'
                                                            onClick = { async () => {
                                                                await adminApi.acknowledgeAlert(accessToken, a.id);
                                                                await loadData();
                                                            } }
                                                            type = 'button'>
                                                            Acknowledge
                                                        </button>
                                                    )}
                                                    {canManage && a.status !== 'resolved' && (
                                                        <button
                                                            className = 'fa-link-btn'
                                                            onClick = { async () => {
                                                                await adminApi.resolveAlert(accessToken, a.id);
                                                                await loadData();
                                                            } }
                                                            type = 'button'>
                                                            <CheckCircle size = { 13 } /> Resolve
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'>
                            <h3><Terminal size = { 16 } /> Runtime System Logs</h3>
                            <select
                                className = 'fa-select'
                                onChange = { e => setLogLevel(e.target.value) }
                                value = { logLevel }>
                                <option value = ''>All Levels</option>
                                <option value = 'info'>Info</option>
                                <option value = 'warn'>Warn</option>
                                <option value = 'error'>Error</option>
                            </select>
                        </div>
                        <div className = 'fa-log-console'>
                            {logs.length === 0 ? (
                                <div className = 'fa-muted'>No log entries captured yet.</div>
                            ) : (
                                logs.map(l => (
                                    <div
                                        className = { `fa-log-line level-${l.level}` }
                                        key = { l.id }>
                                        <span className = 'fa-log-ts'>{new Date(l.timestamp).toLocaleTimeString()}</span>
                                        <span className = 'fa-log-lvl'>[{l.level.toUpperCase()}]</span>
                                        <span className = 'fa-log-src'>{l.source}:</span>
                                        <span>{l.message}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
