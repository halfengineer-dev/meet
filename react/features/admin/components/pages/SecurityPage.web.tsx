/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import { Download, Key, Plus, RefreshCw, Shield, ShieldAlert, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { adminApi } from '../../api';
import { IAdminContextInfo } from '../../types';
import ConfirmModal from '../shared/ConfirmModal.web';

interface ISecurityPageProps {
    accessToken: string;
    adminContext: IAdminContextInfo;
    mode: 'security-dashboard' | 'login-activity' | 'audit-logs' | 'api-keys' | 'sessions' | 'access-policies';
}

export default function SecurityPage({ accessToken, adminContext, mode }: ISecurityPageProps) {
    const [ secOverview, setSecOverview ] = useState<any>(null);
    const [ events, setEvents ] = useState<any[]>([]);
    const [ auditLogs, setAuditLogs ] = useState<any[]>([]);
    const [ apiKeys, setApiKeys ] = useState<any[]>([]);
    const [ sessions, setSessions ] = useState<any[]>([]);
    const [ accessPolicy, setAccessPolicy ] = useState<any>(null);
    const [ search, setSearch ] = useState('');
    const [ loading, setLoading ] = useState(true);
    const [ error, setError ] = useState<string | null>(null);
    const [ notice, setNotice ] = useState<string | null>(null);

    const [ showCreateKey, setShowCreateKey ] = useState(false);
    const [ newKeyName, setNewKeyName ] = useState('');
    const [ newKeyScopes, setNewKeyScopes ] = useState('read:meetings,read:users');
    const [ newKeyRate, setNewKeyRate ] = useState(120);
    const [ oneTimeSecret, setOneTimeSecret ] = useState<string | null>(null);
    const [ confirmRevokeKey, setConfirmRevokeKey ] = useState<any>(null);
    const [ busy, setBusy ] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (mode === 'security-dashboard') {
                setSecOverview(await adminApi.getSecurityOverview(accessToken));
            } else if (mode === 'login-activity') {
                const res = await adminApi.listSecurityEvents(accessToken, { search: search.trim() || undefined, limit: 60 });

                setEvents(res.events || []);
            } else if (mode === 'audit-logs') {
                const res = await adminApi.listAuditLogs(accessToken, { search: search.trim() || undefined, limit: 60 });

                setAuditLogs(res.logs || []);
            } else if (mode === 'api-keys') {
                const res = await adminApi.listApiKeys(accessToken);

                setApiKeys(res.apiKeys || []);
            } else if (mode === 'sessions') {
                const res = await adminApi.listSessions(accessToken);

                setSessions(res.sessions || []);
            } else if (mode === 'access-policies') {
                const res = await adminApi.getSettings(accessToken);

                setAccessPolicy(res.settings?.access_policies || {});
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load security module');
        } finally {
            setLoading(false);
        }
    }, [ accessToken, mode, search ]);

    useEffect(() => {
        loadData();
    }, [ loadData ]);

    return (
        <div className = 'fa-page'>
            <div className = 'fa-page-header'>
                <div>
                    <h1>
                        {mode === 'security-dashboard' && 'Security Center'}
                        {mode === 'login-activity' && 'Login Activity & Threat Monitoring'}
                        {mode === 'audit-logs' && 'Immutable Audit Logs'}
                        {mode === 'api-keys' && 'API Keys & Access Scopes'}
                        {mode === 'sessions' && 'Active Sessions & Devices'}
                        {mode === 'access-policies' && 'Access & Lockout Policies'}
                    </h1>
                    <p>Monitor authentication integrity, revoke active sessions, rotate API credentials, and inspect immutable audit trails.</p>
                </div>
                <div className = 'fa-header-actions'>
                    {mode === 'audit-logs' && (adminContext.isSuperAdmin || adminContext.permissions.includes('audit:export')) && (
                        <button
                            className = 'fa-btn fa-btn-secondary'
                            onClick = { () => adminApi.downloadCsv('/api/admin/audit-logs/export', accessToken, 'faceonn-audit-logs.csv') }
                            type = 'button'>
                            <Download size = { 15 } /> Export CSV
                        </button>
                    )}
                    {mode === 'api-keys' && (adminContext.isSuperAdmin || adminContext.permissions.includes('security:api_keys')) && (
                        <button
                            className = 'fa-btn fa-btn-primary'
                            onClick = { () => setShowCreateKey(true) }
                            type = 'button'>
                            <Plus size = { 15 } /> Create API Key
                        </button>
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
            {notice && <div className = 'fa-alert-success'>{notice}</div>}
            {oneTimeSecret && (
                <div className = 'fa-alert-success'>
                    <strong>Copy your API secret now — it will never be displayed again:</strong>{' '}
                    <code>{oneTimeSecret}</code>
                </div>
            )}

            {mode === 'security-dashboard' && secOverview && (
                <>
                    <div className = 'fa-kpi-grid'>
                        <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Successful Logins (24h)</span><Shield size = { 15 } /></div><div className = 'fa-kpi-value'>{secOverview.summary.loginSuccess24h}</div></div>
                        <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Failed Logins (24h)</span><ShieldAlert size = { 15 } /></div><div className = 'fa-kpi-value'>{secOverview.summary.loginFailed24h}</div></div>
                        <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>New Devices / Token Reuse</span></div><div className = 'fa-kpi-value'>{secOverview.summary.newDeviceLogins24h} / {secOverview.summary.tokenReuseAlerts}</div></div>
                        <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Active Sessions / API Keys</span></div><div className = 'fa-kpi-value'>{secOverview.summary.activeSessionsCount} / {secOverview.summary.activeApiKeysCount}</div></div>
                    </div>

                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'><h3>Suspicious IP Activity (&ge;5 Failed Logins / 24h)</h3></div>
                        {(secOverview.suspiciousIps || []).length === 0 ? (
                            <p className = 'fa-muted'>No suspicious IP brute-force patterns detected in the last 24 hours.</p>
                        ) : (
                            <div className = 'fa-table-wrap'>
                                <table className = 'fa-table'>
                                    <thead><tr><th>IP Address</th><th>Failed Attempts (24h)</th></tr></thead>
                                    <tbody>
                                        {secOverview.suspiciousIps.map((row: any) => (
                                            <tr key = { row.ipAddress }>
                                                <td><code>{row.ipAddress}</code></td>
                                                <td><span className = 'fa-badge fa-badge-critical'>{row.failedAttempts}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {mode === 'login-activity' && (
                <div className = 'fa-card'>
                    <div className = 'fa-toolbar'>
                        <input
                            className = 'fa-input'
                            onChange = { e => setSearch(e.target.value) }
                            placeholder = 'Filter by email, event type, or IP...'
                            type = 'text'
                            value = { search } />
                    </div>
                    <div className = 'fa-table-wrap'>
                        <table className = 'fa-table'>
                            <thead><tr><th>Event</th><th>Account</th><th>Device</th><th>IP</th><th>Severity</th><th>Time</th></tr></thead>
                            <tbody>
                                {loading ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 6 }>Loading login activity...</td></tr>
                                ) : events.length === 0 ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 6 }>No authentication events recorded yet.</td></tr>
                                ) : (
                                    events.map(ev => (
                                        <tr key = { ev.id }>
                                            <td><strong>{ev.event_type}</strong></td>
                                            <td>{ev.email || ev.user_id || '—'}</td>
                                            <td className = 'fa-muted-xs'>{ev.browser} · {ev.os}</td>
                                            <td><code>{ev.ip_address || '—'}</code></td>
                                            <td><span className = { `fa-badge fa-badge-${ev.severity}` }>{ev.severity}</span></td>
                                            <td className = 'fa-muted-xs'>{new Date(ev.created_at).toLocaleString()}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {mode === 'audit-logs' && (
                <div className = 'fa-card'>
                    <div className = 'fa-toolbar'>
                        <input
                            className = 'fa-input'
                            onChange = { e => setSearch(e.target.value) }
                            placeholder = 'Search by action, actor email, or target ID...'
                            type = 'text'
                            value = { search } />
                    </div>
                    <div className = 'fa-table-wrap'>
                        <table className = 'fa-table'>
                            <thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Target</th><th>Status</th><th>Correlation ID</th></tr></thead>
                            <tbody>
                                {loading ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 6 }>Loading audit trail...</td></tr>
                                ) : auditLogs.length === 0 ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 6 }>No audit events recorded yet.</td></tr>
                                ) : (
                                    auditLogs.map(log => (
                                        <tr key = { log.id }>
                                            <td className = 'fa-muted-xs'>{new Date(log.created_at).toLocaleString()}</td>
                                            <td><strong>{log.actor_email || 'System'}</strong><div className = 'fa-muted-xs'>{log.actor_role || ''}</div></td>
                                            <td><code>{log.action}</code></td>
                                            <td>{log.target_type} <span className = 'fa-muted-xs'>{log.target_id ? log.target_id.slice(0, 8) : ''}</span></td>
                                            <td><span className = { `fa-badge fa-badge-${log.status}` }>{log.status}</span></td>
                                            <td className = 'fa-muted-xs'><code>{log.correlation_id ? log.correlation_id.slice(0, 10) : '—'}</code></td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {mode === 'api-keys' && (
                <div className = 'fa-card'>
                    <div className = 'fa-table-wrap'>
                        <table className = 'fa-table'>
                            <thead><tr><th>Name</th><th>Key Prefix</th><th>Scopes</th><th>Rate Limit</th><th>Status</th><th>Action</th></tr></thead>
                            <tbody>
                                {apiKeys.length === 0 ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 6 }>No API keys created yet.</td></tr>
                                ) : (
                                    apiKeys.map(k => (
                                        <tr key = { k.id }>
                                            <td><strong><Key size = { 13 } /> {k.name}</strong></td>
                                            <td><code>{k.keyPrefix}••••••</code></td>
                                            <td className = 'fa-muted-xs'>{(k.scopes || []).join(', ')}</td>
                                            <td>{k.rateLimitPerMin}/min</td>
                                            <td><span className = { `fa-badge fa-badge-${k.status}` }>{k.status}</span></td>
                                            <td>
                                                {k.status === 'active' && (
                                                    <button
                                                        className = 'fa-link-btn danger'
                                                        onClick = { () => setConfirmRevokeKey(k) }
                                                        type = 'button'>
                                                        <Trash2 size = { 13 } /> Revoke
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
            )}

            {mode === 'sessions' && (
                <div className = 'fa-card'>
                    <div className = 'fa-table-wrap'>
                        <table className = 'fa-table'>
                            <thead><tr><th>User</th><th>Device</th><th>IP Address</th><th>Last Active</th><th>Action</th></tr></thead>
                            <tbody>
                                {sessions.length === 0 ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 5 }>No active sessions found.</td></tr>
                                ) : (
                                    sessions.map(s => (
                                        <tr key = { s.id }>
                                            <td><strong>{s.userName || s.userEmail}</strong><div className = 'fa-muted-xs'>{s.userEmail}</div></td>
                                            <td>{s.browser} on {s.os} ({s.deviceType})</td>
                                            <td><code>{s.ipAddress || '—'}</code></td>
                                            <td className = 'fa-muted-xs'>{new Date(s.lastUsedAt).toLocaleString()}</td>
                                            <td>
                                                <button
                                                    className = 'fa-link-btn danger'
                                                    onClick = { async () => {
                                                        await adminApi.revokeSession(accessToken, s.id);
                                                        setNotice('Session revoked.');
                                                        await loadData();
                                                    } }
                                                    type = 'button'>
                                                    Revoke
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {mode === 'access-policies' && accessPolicy && (
                <div className = 'fa-card'>
                    <div className = 'fa-card-header'><h3>Global Access &amp; Authentication Policies</h3></div>
                    <div className = 'fa-form-grid-2'>
                        <div className = 'fa-field'>
                            <label>Session Timeout (minutes)</label>
                            <input
                                onChange = { e => setAccessPolicy({ ...accessPolicy, sessionTimeoutMinutes: Number(e.target.value) }) }
                                type = 'number'
                                value = { accessPolicy.sessionTimeoutMinutes || 10080 } />
                        </div>
                        <div className = 'fa-field'>
                            <label>Max Failed Logins Before Alert</label>
                            <input
                                onChange = { e => setAccessPolicy({ ...accessPolicy, maxFailedLoginsBeforeLockout: Number(e.target.value) }) }
                                type = 'number'
                                value = { accessPolicy.maxFailedLoginsBeforeLockout || 10 } />
                        </div>
                    </div>
                    <div className = 'fa-toggle-grid'>
                        <label className = 'fa-toggle-row'>
                            <input
                                checked = { Boolean(accessPolicy.enforceStrongPasswords) }
                                onChange = { e => setAccessPolicy({ ...accessPolicy, enforceStrongPasswords: e.target.checked }) }
                                type = 'checkbox' />
                            <span>Enforce Strong Password Policy</span>
                        </label>
                        <label className = 'fa-toggle-row'>
                            <input
                                checked = { Boolean(accessPolicy.allowAdminApiKeys) }
                                onChange = { e => setAccessPolicy({ ...accessPolicy, allowAdminApiKeys: e.target.checked }) }
                                type = 'checkbox' />
                            <span>Allow Administrative API Keys</span>
                        </label>
                    </div>
                    {adminContext.isSuperAdmin && (
                        <button
                            className = 'fa-btn fa-btn-primary'
                            onClick = { async () => {
                                await adminApi.updateSettingsSection(accessToken, 'access_policies', accessPolicy);
                                setNotice('Access policies saved.');
                            } }
                            style = {{ marginTop: '16px' }}
                            type = 'button'>
                            Save Access Policies
                        </button>
                    )}
                </div>
            )}

            {showCreateKey && (
                <div
                    className = 'fa-modal-backdrop'
                    onClick = { () => setShowCreateKey(false) }>
                    <div
                        className = 'fa-modal-card'
                        onClick = { e => e.stopPropagation() }>
                        <div className = 'fa-modal-header'><h3>Create API Key</h3></div>
                        <form
                            onSubmit = { async e => {
                                e.preventDefault();
                                setBusy(true);
                                try {
                                    const res = await adminApi.createApiKey(accessToken, {
                                        name: newKeyName.trim(),
                                        scopes: newKeyScopes.split(',').map(s => s.trim()).filter(Boolean),
                                        rateLimitPerMin: newKeyRate
                                    });

                                    setOneTimeSecret(res.plaintextSecret);
                                    setShowCreateKey(false);
                                    setNewKeyName('');
                                    await loadData();
                                } catch (err: any) {
                                    setError(err.message);
                                } finally {
                                    setBusy(false);
                                }
                            } }>
                            <div className = 'fa-field'><label>Key Name *</label><input
                                onChange = { e => setNewKeyName(e.target.value) }
                                required = { true }
                                type = 'text'
                                value = { newKeyName } /></div>
                            <div className = 'fa-field'><label>Scopes (comma-separated)</label><input
                                onChange = { e => setNewKeyScopes(e.target.value) }
                                type = 'text'
                                value = { newKeyScopes } /></div>
                            <div className = 'fa-field'><label>Rate Limit (requests/min)</label><input
                                min = { 10 }
                                onChange = { e => setNewKeyRate(Number(e.target.value)) }
                                type = 'number'
                                value = { newKeyRate } /></div>
                            <div className = 'fa-modal-actions'>
                                <button
                                    className = 'fa-btn fa-btn-secondary'
                                    onClick = { () => setShowCreateKey(false) }
                                    type = 'button'>Cancel</button>
                                <button
                                    className = 'fa-btn fa-btn-primary'
                                    disabled = { busy }
                                    type = 'submit'>{busy ? 'Generating...' : 'Generate Key'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {confirmRevokeKey && (
                <ConfirmModal
                    confirmLabel = 'Revoke API Key'
                    danger = { true }
                    description = { `Permanently revoke API key "${confirmRevokeKey.name}" (${confirmRevokeKey.keyPrefix}...)? Integrations using this key will immediately fail.` }
                    isLoading = { busy }
                    onCancel = { () => setConfirmRevokeKey(null) }
                    onConfirm = { async () => {
                        setBusy(true);
                        try {
                            await adminApi.revokeApiKey(accessToken, confirmRevokeKey.id);
                            setConfirmRevokeKey(null);
                            setNotice('API key revoked.');
                            await loadData();
                        } finally {
                            setBusy(false);
                        }
                    } }
                    title = 'Revoke API Key' />
            )}
        </div>
    );
}
