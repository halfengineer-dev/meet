/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import { ArrowLeft, Megaphone, MessageSquare, Plus, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { adminApi } from '../../api';
import { IAdminContextInfo } from '../../types';

interface ICommunicationPageProps {
    accessToken: string;
    adminContext: IAdminContextInfo;
    initialFocusId?: string | null;
    mode: 'support-tickets' | 'moderation' | 'announcements' | 'chat-management';
}

export default function CommunicationPage({ accessToken, adminContext, mode, initialFocusId }: ICommunicationPageProps) {
    const [ tickets, setTickets ] = useState<any[]>([]);
    const [ ticketMetrics, setTicketMetrics ] = useState<any>(null);
    const [ selectedTicketId, setSelectedTicketId ] = useState<string | null>(initialFocusId || null);
    const [ ticketDetail, setTicketDetail ] = useState<any>(null);
    const [ reports, setReports ] = useState<any[]>([]);
    const [ announcements, setAnnouncements ] = useState<any[]>([]);
    const [ chatFlag, setChatFlag ] = useState<any>(null);
    const [ loading, setLoading ] = useState(true);
    const [ error, setError ] = useState<string | null>(null);
    const [ notice, setNotice ] = useState<string | null>(null);

    // Forms
    const [ replyBody, setReplyBody ] = useState('');
    const [ replyInternal, setReplyInternal ] = useState(false);
    const [ showNewTicket, setShowNewTicket ] = useState(false);
    const [ newTicket, setNewTicket ] = useState({ subject: '', description: '', category: 'meeting_problems', priority: 'medium', userEmail: '' });
    const [ showNewAnn, setShowNewAnn ] = useState(false);
    const [ newAnn, setNewAnn ] = useState({ title: '', body: '', severity: 'info', status: 'published', targetScope: 'all' });
    const [ busy, setBusy ] = useState(false);

    const canManageSupport = adminContext.isSuperAdmin || adminContext.permissions.includes('support:manage');
    const canManageAnn = adminContext.isSuperAdmin || adminContext.permissions.includes('announcements:manage');

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (mode === 'support-tickets') {
                const res = await adminApi.listTickets(accessToken);

                setTickets(res.tickets || []);
                setTicketMetrics(res.metrics || null);
            } else if (mode === 'moderation') {
                const res = await adminApi.listModerationReports(accessToken);

                setReports(res.reports || []);
            } else if (mode === 'announcements') {
                const res = await adminApi.listAnnouncements(accessToken);

                setAnnouncements(res.announcements || []);
            } else if (mode === 'chat-management') {
                const res = await adminApi.listFeatureFlags(accessToken).catch(() => ({ featureFlags: [] }));
                const flag = (res.featureFlags || []).find((f: any) => f.key === 'in_meeting_chat');

                setChatFlag(flag || null);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load communication module');
        } finally {
            setLoading(false);
        }
    }, [ accessToken, mode ]);

    useEffect(() => {
        loadData();
    }, [ loadData ]);

    const loadTicketDetail = useCallback(async (id: string) => {
        try {
            const detail = await adminApi.getTicketDetail(accessToken, id);

            setTicketDetail(detail);
        } catch (err: any) {
            setError(err.message || 'Failed to load ticket');
        }
    }, [ accessToken ]);

    useEffect(() => {
        if (selectedTicketId && mode === 'support-tickets') {
            loadTicketDetail(selectedTicketId);
        } else {
            setTicketDetail(null);
        }
    }, [ loadTicketDetail, mode, selectedTicketId ]);

    if (mode === 'chat-management') {
        return (
            <div className = 'fa-page'>
                <div className = 'fa-page-header'>
                    <div>
                        <h1>Chat Management &amp; Privacy Controls</h1>
                        <p>Control global in-meeting chat availability and review chat abuse reports without reading private user messages.</p>
                    </div>
                </div>
                {error && <div className = 'fa-alert-error'>{error}</div>}
                {notice && <div className = 'fa-alert-success'>{notice}</div>}
                <div className = 'fa-card'>
                    <div className = 'fa-card-header'>
                        <div>
                            <h3><MessageSquare size = { 16 } /> Global In-Meeting Chat Policy</h3>
                            <p>Private in-meeting chat conversations are ephemeral inside XMPP/Jitsi rooms and are never exposed to administrators by default.</p>
                        </div>
                    </div>
                    {chatFlag ? (
                        <div className = 'fa-flag-row'>
                            <div>
                                <strong>{chatFlag.name}</strong>
                                <div className = 'fa-muted-xs'>{chatFlag.description}</div>
                            </div>
                            <button
                                className = { `fa-btn ${chatFlag.enabled_globally ? 'fa-btn-primary' : 'fa-btn-secondary'}` }
                                onClick = { async () => {
                                    await adminApi.updateFeatureFlag(accessToken, chatFlag.id, { enabledGlobally: !chatFlag.enabled_globally });
                                    setNotice(`In-meeting chat ${!chatFlag.enabled_globally ? 'enabled' : 'disabled'} globally.`);
                                    await loadData();
                                } }
                                type = 'button'>
                                {chatFlag.enabled_globally ? 'Enabled Globally' : 'Disabled Globally'}
                            </button>
                        </div>
                    ) : (
                        <p className = 'fa-muted'>Manage chat availability per organization under Organizations → Policies or Feature Flags.</p>
                    )}
                </div>
            </div>
        );
    }

    if (mode === 'moderation') {
        return (
            <div className = 'fa-page'>
                <div className = 'fa-page-header'>
                    <div>
                        <h1>Reports &amp; Moderation</h1>
                        <p>Investigate reported abuse, spam, or policy violations with auditable resolutions.</p>
                    </div>
                    <button
                        className = 'fa-btn fa-btn-secondary'
                        onClick = { loadData }
                        type = 'button'>
                        <RefreshCw size = { 15 } /> Refresh
                    </button>
                </div>
                {error && <div className = 'fa-alert-error'>{error}</div>}
                <div className = 'fa-card'>
                    <div className = 'fa-table-wrap'>
                        <table className = 'fa-table'>
                            <thead><tr><th>Category</th><th>Reason</th><th>Status</th><th>Reported</th><th>Actions</th></tr></thead>
                            <tbody>
                                {loading ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 5 }>Loading reports...</td></tr>
                                ) : reports.length === 0 ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 5 }>No moderation reports filed.</td></tr>
                                ) : (
                                    reports.map(r => (
                                        <tr key = { r.id }>
                                            <td><span className = 'fa-badge'><ShieldAlert size = { 12 } /> {r.category}</span></td>
                                            <td>{r.reason}</td>
                                            <td><span className = { `fa-badge fa-badge-${r.status}` }>{r.status}</span></td>
                                            <td className = 'fa-muted-xs'>{new Date(r.created_at).toLocaleString()}</td>
                                            <td>
                                                {r.status !== 'action_taken' && r.status !== 'dismissed' && (
                                                    <div className = 'fa-row-actions'>
                                                        <button
                                                            className = 'fa-link-btn'
                                                            onClick = { async () => {
                                                                await adminApi.updateModerationReport(accessToken, r.id, { status: 'action_taken', resolutionNotes: 'Resolved by moderator' });
                                                                await loadData();
                                                            } }
                                                            type = 'button'>
                                                            Action Taken
                                                        </button>
                                                        <button
                                                            className = 'fa-link-btn'
                                                            onClick = { async () => {
                                                                await adminApi.updateModerationReport(accessToken, r.id, { status: 'dismissed', resolutionNotes: 'Dismissed' });
                                                                await loadData();
                                                            } }
                                                            type = 'button'>
                                                            Dismiss
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    if (mode === 'announcements') {
        return (
            <div className = 'fa-page'>
                <div className = 'fa-page-header'>
                    <div>
                        <h1>Platform Announcements</h1>
                        <p>Broadcast scheduled or immediate notices to all users, selected organizations, or plan tiers.</p>
                    </div>
                    {canManageAnn && adminContext.isPlatformAdmin && (
                        <button
                            className = 'fa-btn fa-btn-primary'
                            onClick = { () => setShowNewAnn(true) }
                            type = 'button'>
                            <Plus size = { 15 } /> New Announcement
                        </button>
                    )}
                </div>
                {error && <div className = 'fa-alert-error'>{error}</div>}
                {notice && <div className = 'fa-alert-success'>{notice}</div>}
                <div className = 'fa-card'>
                    <div className = 'fa-table-wrap'>
                        <table className = 'fa-table'>
                            <thead><tr><th>Title</th><th>Audience</th><th>Severity</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
                            <tbody>
                                {loading ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 6 }>Loading announcements...</td></tr>
                                ) : announcements.length === 0 ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 6 }>No announcements published yet.</td></tr>
                                ) : (
                                    announcements.map(a => (
                                        <tr key = { a.id }>
                                            <td><strong><Megaphone size = { 13 } /> {a.title}</strong><div className = 'fa-muted-xs'>{a.body.slice(0, 90)}</div></td>
                                            <td>{a.target_scope}</td>
                                            <td><span className = { `fa-badge fa-badge-${a.severity}` }>{a.severity}</span></td>
                                            <td><span className = { `fa-badge fa-badge-${a.status}` }>{a.status}</span></td>
                                            <td className = 'fa-muted-xs'>{new Date(a.created_at).toLocaleDateString()}</td>
                                            <td>
                                                {canManageAnn && a.status !== 'published' && (
                                                    <button
                                                        className = 'fa-link-btn'
                                                        onClick = { async () => {
                                                            await adminApi.updateAnnouncement(accessToken, a.id, { status: 'published' });
                                                            await loadData();
                                                        } }
                                                        type = 'button'>
                                                        Publish
                                                    </button>
                                                )}
                                                {canManageAnn && a.status === 'published' && (
                                                    <button
                                                        className = 'fa-link-btn'
                                                        onClick = { async () => {
                                                            await adminApi.updateAnnouncement(accessToken, a.id, { status: 'archived' });
                                                            await loadData();
                                                        } }
                                                        type = 'button'>
                                                        Archive
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

                {showNewAnn && (
                    <div
                        className = 'fa-modal-backdrop'
                        onClick = { () => setShowNewAnn(false) }>
                        <div
                            className = 'fa-modal-card'
                            onClick = { e => e.stopPropagation() }>
                            <div className = 'fa-modal-header'><h3>Create Announcement</h3></div>
                            <form
                                onSubmit = { async e => {
                                    e.preventDefault();
                                    setBusy(true);
                                    try {
                                        await adminApi.createAnnouncement(accessToken, newAnn);
                                        setShowNewAnn(false);
                                        setNewAnn({ title: '', body: '', severity: 'info', status: 'published', targetScope: 'all' });
                                        setNotice('Announcement saved.');
                                        await loadData();
                                    } catch (err: any) {
                                        setError(err.message);
                                    } finally {
                                        setBusy(false);
                                    }
                                } }>
                                <div className = 'fa-field'><label>Title *</label><input
                                    onChange = { e => setNewAnn({ ...newAnn, title: e.target.value }) }
                                    required = { true }
                                    type = 'text'
                                    value = { newAnn.title } /></div>
                                <div className = 'fa-field'><label>Message *</label><textarea
                                    onChange = { e => setNewAnn({ ...newAnn, body: e.target.value }) }
                                    required = { true }
                                    rows = { 4 }
                                    value = { newAnn.body } /></div>
                                <div className = 'fa-form-grid-2'>
                                    <div className = 'fa-field'>
                                        <label>Severity</label>
                                        <select
                                            onChange = { e => setNewAnn({ ...newAnn, severity: e.target.value }) }
                                            value = { newAnn.severity }>
                                            <option value = 'info'>Info</option>
                                            <option value = 'warning'>Warning</option>
                                            <option value = 'maintenance'>Maintenance</option>
                                            <option value = 'critical'>Critical</option>
                                        </select>
                                    </div>
                                    <div className = 'fa-field'>
                                        <label>Target Audience</label>
                                        <select
                                            onChange = { e => setNewAnn({ ...newAnn, targetScope: e.target.value }) }
                                            value = { newAnn.targetScope }>
                                            <option value = 'all'>All Users</option>
                                            <option value = 'organizations'>Selected Organizations</option>
                                            <option value = 'plans'>Specific Plans</option>
                                        </select>
                                    </div>
                                </div>
                                <div className = 'fa-modal-actions'>
                                    <button
                                        className = 'fa-btn fa-btn-secondary'
                                        onClick = { () => setShowNewAnn(false) }
                                        type = 'button'>Cancel</button>
                                    <button
                                        className = 'fa-btn fa-btn-primary'
                                        disabled = { busy }
                                        type = 'submit'>{busy ? 'Saving...' : 'Publish Announcement'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Support Tickets Detail
    if (selectedTicketId && ticketDetail) {
        const t = ticketDetail.ticket;

        return (
            <div className = 'fa-page'>
                <div className = 'fa-page-header'>
                    <div>
                        <button
                            className = 'fa-link-btn'
                            onClick = { () => setSelectedTicketId(null) }
                            type = 'button'>
                            <ArrowLeft size = { 15 } /> Back to Tickets
                        </button>
                        <h1>{t.ticket_number}: {t.subject}</h1>
                        <p>Category: {t.category} · Priority: <span className = { `fa-badge fa-badge-${t.priority}` }>{t.priority}</span> · Status: <span className = { `fa-badge fa-badge-${t.status}` }>{t.status}</span></p>
                    </div>
                    {canManageSupport && (
                        <div className = 'fa-header-actions'>
                            <select
                                className = 'fa-select'
                                onChange = { async e => {
                                    await adminApi.updateTicket(accessToken, t.id, { status: e.target.value });
                                    await loadTicketDetail(t.id);
                                } }
                                value = { t.status }>
                                <option value = 'open'>Open</option>
                                <option value = 'in_progress'>In Progress</option>
                                <option value = 'waiting_customer'>Waiting for Customer</option>
                                <option value = 'escalated'>Escalated</option>
                                <option value = 'resolved'>Resolved</option>
                                <option value = 'closed'>Closed</option>
                            </select>
                            <select
                                className = 'fa-select'
                                onChange = { async e => {
                                    await adminApi.updateTicket(accessToken, t.id, { priority: e.target.value });
                                    await loadTicketDetail(t.id);
                                } }
                                value = { t.priority }>
                                <option value = 'low'>Low</option>
                                <option value = 'medium'>Medium</option>
                                <option value = 'high'>High</option>
                                <option value = 'urgent'>Urgent</option>
                            </select>
                        </div>
                    )}
                </div>

                <div className = 'fa-card'>
                    <div className = 'fa-card-header'><h3>Conversation Thread</h3></div>
                    <div className = 'fa-ticket-initial'>
                        <strong>{t.user_email || 'Reporter'}</strong> · <span className = 'fa-muted-xs'>{new Date(t.created_at).toLocaleString()}</span>
                        <p>{t.description}</p>
                    </div>
                    <div className = 'fa-ticket-thread'>
                        {(ticketDetail.messages || []).map((m: any) => (
                            <div
                                className = { `fa-ticket-msg ${m.is_internal ? 'internal' : ''}` }
                                key = { m.id }>
                                <div className = 'fa-ticket-msg-head'>
                                    <strong>{m.author_name || 'Support Agent'}</strong>
                                    {m.is_internal && <span className = 'fa-badge fa-badge-warning'>Internal Note</span>}
                                    <span className = 'fa-muted-xs'>{new Date(m.created_at).toLocaleString()}</span>
                                </div>
                                <p>{m.body}</p>
                            </div>
                        ))}
                    </div>

                    {canManageSupport && (
                        <form
                            className = 'fa-reply-box'
                            onSubmit = { async e => {
                                e.preventDefault();
                                if (!replyBody.trim()) return;
                                setBusy(true);
                                try {
                                    await adminApi.replyTicket(accessToken, t.id, replyBody.trim(), replyInternal);
                                    setReplyBody('');
                                    await loadTicketDetail(t.id);
                                } finally {
                                    setBusy(false);
                                }
                            } }>
                            <textarea
                                onChange = { e => setReplyBody(e.target.value) }
                                placeholder = 'Write a reply or internal diagnostic note...'
                                rows = { 3 }
                                value = { replyBody } />
                            <div className = 'fa-reply-actions'>
                                <label className = 'fa-toggle-inline'>
                                    <input
                                        checked = { replyInternal }
                                        onChange = { e => setReplyInternal(e.target.checked) }
                                        type = 'checkbox' />
                                    <span>Internal note only</span>
                                </label>
                                <button
                                    className = 'fa-btn fa-btn-primary'
                                    disabled = { busy || !replyBody.trim() }
                                    type = 'submit'>
                                    <Send size = { 14 } /> Send Reply
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        );
    }

    // Support Tickets Directory
    return (
        <div className = 'fa-page'>
            <div className = 'fa-page-header'>
                <div>
                    <h1>Support Tickets</h1>
                    <p>Track customer requests, SLA compliance, meeting diagnostics, and support resolution times.</p>
                </div>
                {canManageSupport && (
                    <button
                        className = 'fa-btn fa-btn-primary'
                        onClick = { () => setShowNewTicket(true) }
                        type = 'button'>
                        <Plus size = { 15 } /> Create Ticket
                    </button>
                )}
            </div>

            {error && <div className = 'fa-alert-error'>{error}</div>}
            {ticketMetrics && (
                <div className = 'fa-kpi-grid'>
                    <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Open</span></div><div className = 'fa-kpi-value'>{ticketMetrics.open}</div></div>
                    <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>In Progress / Escalated</span></div><div className = 'fa-kpi-value'>{ticketMetrics.inProgress + ticketMetrics.escalated}</div></div>
                    <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>SLA Breached</span></div><div className = 'fa-kpi-value'>{ticketMetrics.slaBreached}</div></div>
                    <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Avg First Response</span></div><div className = 'fa-kpi-value'>{ticketMetrics.avgFirstResponseMinutes !== null ? `${ticketMetrics.avgFirstResponseMinutes}m` : '—'}</div></div>
                </div>
            )}

            <div className = 'fa-card'>
                <div className = 'fa-table-wrap'>
                    <table className = 'fa-table'>
                        <thead><tr><th>Ticket</th><th>User / Org</th><th>Category</th><th>Priority</th><th>Status</th><th>SLA Due</th></tr></thead>
                        <tbody>
                            {loading ? (
                                <tr><td
                                    className = 'fa-muted'
                                    colSpan = { 6 }>Loading support tickets...</td></tr>
                            ) : tickets.length === 0 ? (
                                <tr><td
                                    className = 'fa-muted'
                                    colSpan = { 6 }>No support tickets open.</td></tr>
                            ) : (
                                tickets.map(t => (
                                    <tr key = { t.id }>
                                        <td>
                                            <button
                                                className = 'fa-link-btn'
                                                onClick = { () => setSelectedTicketId(t.id) }
                                                type = 'button'>
                                                <strong>{t.ticket_number}</strong> — {t.subject}
                                            </button>
                                        </td>
                                        <td>{t.user_email || '—'}<div className = 'fa-muted-xs'>{t.organizationName || 'Personal'}</div></td>
                                        <td>{t.category}</td>
                                        <td><span className = { `fa-badge fa-badge-${t.priority}` }>{t.priority}</span></td>
                                        <td><span className = { `fa-badge fa-badge-${t.status}` }>{t.status}</span></td>
                                        <td className = 'fa-muted-xs'>{t.sla_due_at ? new Date(t.sla_due_at).toLocaleString() : '—'} {t.slaBreached ? '⚠️' : ''}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showNewTicket && (
                <div
                    className = 'fa-modal-backdrop'
                    onClick = { () => setShowNewTicket(false) }>
                    <div
                        className = 'fa-modal-card'
                        onClick = { e => e.stopPropagation() }>
                        <div className = 'fa-modal-header'><h3>Create Support Ticket</h3></div>
                        <form
                            onSubmit = { async e => {
                                e.preventDefault();
                                setBusy(true);
                                try {
                                    await adminApi.createTicket(accessToken, newTicket);
                                    setShowNewTicket(false);
                                    setNewTicket({ subject: '', description: '', category: 'meeting_problems', priority: 'medium', userEmail: '' });
                                    await loadData();
                                } finally {
                                    setBusy(false);
                                }
                            } }>
                            <div className = 'fa-field'><label>Subject *</label><input
                                onChange = { e => setNewTicket({ ...newTicket, subject: e.target.value }) }
                                required = { true }
                                type = 'text'
                                value = { newTicket.subject } /></div>
                            <div className = 'fa-field'><label>Reporter Email</label><input
                                onChange = { e => setNewTicket({ ...newTicket, userEmail: e.target.value }) }
                                type = 'email'
                                value = { newTicket.userEmail } /></div>
                            <div className = 'fa-form-grid-2'>
                                <div className = 'fa-field'>
                                    <label>Category</label>
                                    <select
                                        onChange = { e => setNewTicket({ ...newTicket, category: e.target.value }) }
                                        value = { newTicket.category }>
                                        <option value = 'account_problems'>Account Problems</option>
                                        <option value = 'login_problems'>Login Problems</option>
                                        <option value = 'audio_issues'>Audio Issues</option>
                                        <option value = 'video_issues'>Video Issues</option>
                                        <option value = 'screen_sharing'>Screen Sharing</option>
                                        <option value = 'meeting_problems'>Meeting Problems</option>
                                        <option value = 'billing'>Billing</option>
                                        <option value = 'recording'>Recording</option>
                                        <option value = 'security'>Security</option>
                                        <option value = 'feature_requests'>Feature Requests</option>
                                        <option value = 'other'>Other</option>
                                    </select>
                                </div>
                                <div className = 'fa-field'>
                                    <label>Priority</label>
                                    <select
                                        onChange = { e => setNewTicket({ ...newTicket, priority: e.target.value }) }
                                        value = { newTicket.priority }>
                                        <option value = 'low'>Low</option>
                                        <option value = 'medium'>Medium</option>
                                        <option value = 'high'>High</option>
                                        <option value = 'urgent'>Urgent</option>
                                    </select>
                                </div>
                            </div>
                            <div className = 'fa-field'><label>Description *</label><textarea
                                onChange = { e => setNewTicket({ ...newTicket, description: e.target.value }) }
                                required = { true }
                                rows = { 4 }
                                value = { newTicket.description } /></div>
                            <div className = 'fa-modal-actions'>
                                <button
                                    className = 'fa-btn fa-btn-secondary'
                                    onClick = { () => setShowNewTicket(false) }
                                    type = 'button'>Cancel</button>
                                <button
                                    className = 'fa-btn fa-btn-primary'
                                    disabled = { busy }
                                    type = 'submit'>{busy ? 'Creating...' : 'Create Ticket'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
