/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import { ArrowLeft, Ban, Calendar, Film, PowerOff, RefreshCw, RotateCcw, Search, Trash2, XCircle } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { adminApi } from '../../api';
import { IAdminContextInfo, IAdminMeetingRow, IPagination } from '../../types';
import ConfirmModal from '../shared/ConfirmModal.web';

interface IMeetingsPageProps {
    accessToken: string;
    adminContext: IAdminContextInfo;
    initialFocusId?: string | null;
    mode:
        | 'meetings'
        | 'live-meetings'
        | 'scheduled-meetings'
        | 'meeting-history'
        | 'recurring-meetings'
        | 'recordings'
        | 'meeting-reports';
}

export default function MeetingsPage({ accessToken, adminContext, mode, initialFocusId }: IMeetingsPageProps) {
    const [ meetings, setMeetings ] = useState<IAdminMeetingRow[]>([]);
    const [ pagination, setPagination ] = useState<IPagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
    const [ recordings, setRecordings ] = useState<any[]>([]);
    const [ storageStatus, setStorageStatus ] = useState<any>(null);
    const [ loading, setLoading ] = useState(true);
    const [ error, setError ] = useState<string | null>(null);
    const [ notice, setNotice ] = useState<string | null>(null);

    const [ search, setSearch ] = useState('');
    const [ statusFilter, setStatusFilter ] = useState('');
    const [ page, setPage ] = useState(1);

    const [ selectedMeetingId, setSelectedMeetingId ] = useState<string | null>(initialFocusId || null);
    const [ meetingDetail, setMeetingDetail ] = useState<any>(null);
    const [ confirmAction, setConfirmAction ] = useState<{
        id: string;
        occurrenceId?: string;
        title: string;
        type: 'end' | 'cancel-series' | 'cancel-occ' | 'disable' | 'delete-rec';
    } | null>(null);
    const [ busy, setBusy ] = useState(false);

    const canManage = adminContext.isSuperAdmin || adminContext.permissions.includes('meetings:manage');
    const canTerminate = adminContext.isSuperAdmin || adminContext.permissions.includes('meetings:terminate');
    const canManageRec = adminContext.isSuperAdmin || adminContext.permissions.includes('recordings:manage');

    useEffect(() => {
        setPage(1);
        if (mode === 'live-meetings') setStatusFilter('live');
        else if (mode === 'scheduled-meetings') setStatusFilter('scheduled');
        else if (mode === 'meeting-history') setStatusFilter('ended');
        else setStatusFilter('');
    }, [ mode ]);

    useEffect(() => {
        if (initialFocusId && mode !== 'recordings') {
            setSelectedMeetingId(initialFocusId);
        }
    }, [ initialFocusId, mode ]);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (mode === 'recordings') {
                const res = await adminApi.listRecordings(accessToken, {
                    search: search.trim() || undefined,
                    status: statusFilter || undefined,
                    page,
                    limit: 20
                });

                setRecordings(res.recordings || []);
                setStorageStatus(res.storagePipelineStatus || null);
                setPagination(res.pagination || { page: 1, limit: 20, total: res.total || 0, totalPages: 1 });
            } else {
                const res = await adminApi.listMeetings(accessToken, {
                    search: search.trim() || undefined,
                    status: statusFilter || undefined,
                    recurringOnly: mode === 'recurring-meetings' ? true : undefined,
                    page,
                    limit: 20
                });

                setMeetings(res.meetings || []);
                setPagination(res.pagination || { page: 1, limit: 20, total: res.total || 0, totalPages: 1 });
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load meetings');
        } finally {
            setLoading(false);
        }
    }, [ accessToken, mode, page, search, statusFilter ]);

    useEffect(() => {
        loadData();
    }, [ loadData ]);

    const loadDetail = useCallback(async (id: string) => {
        setError(null);
        try {
            const detail = await adminApi.getMeetingDetail(accessToken, id);

            setMeetingDetail(detail);
        } catch (err: any) {
            setError(err.message || 'Failed to load meeting detail');
        }
    }, [ accessToken ]);

    useEffect(() => {
        if (selectedMeetingId) {
            loadDetail(selectedMeetingId);
        } else {
            setMeetingDetail(null);
        }
    }, [ loadDetail, selectedMeetingId ]);

    const executeAction = async (reason?: string) => {
        if (!confirmAction) {
            return;
        }
        setBusy(true);
        setError(null);
        try {
            if (confirmAction.type === 'end') {
                await adminApi.endLiveMeeting(accessToken, confirmAction.id, reason || 'admin_terminated');
                setNotice('Live meeting terminated and audit logged.');
            } else if (confirmAction.type === 'cancel-series') {
                await adminApi.cancelMeeting(accessToken, confirmAction.id, 'series');
                setNotice('Meeting series cancelled.');
            } else if (confirmAction.type === 'cancel-occ') {
                await adminApi.cancelMeeting(accessToken, confirmAction.id, 'occurrence', confirmAction.occurrenceId);
                setNotice('Single occurrence cancelled without altering remaining series occurrences.');
            } else if (confirmAction.type === 'disable') {
                await adminApi.disableMeetingLink(accessToken, confirmAction.id, reason || 'Disabled by administrator');
                setNotice('Meeting link permanently disabled.');
            } else if (confirmAction.type === 'delete-rec') {
                await adminApi.deleteRecording(accessToken, confirmAction.id);
                setNotice('Recording marked as deleted.');
            }
            setConfirmAction(null);
            await loadData();
            if (selectedMeetingId) {
                await loadDetail(selectedMeetingId);
            }
        } catch (err: any) {
            setError(err.message || 'Action failed');
        } finally {
            setBusy(false);
        }
    };

    // Recordings Management View
    if (mode === 'recordings') {
        return (
            <div className = 'fa-page'>
                <div className = 'fa-page-header'>
                    <div>
                        <h1>Recordings Management</h1>
                        <p>Privacy-enforced recording metadata directory, retention policies, and audit-logged inspection.</p>
                    </div>
                    <button
                        className = 'fa-btn fa-btn-secondary'
                        onClick = { loadData }
                        type = 'button'>
                        <RefreshCw size = { 15 } /> Refresh
                    </button>
                </div>

                {storageStatus && (
                    <div className = 'fa-info-banner'>
                        <Film size = { 16 } />
                        <span>
                            <strong>Recording Storage Pipeline ({storageStatus.provider}):</strong> {storageStatus.note}
                        </span>
                    </div>
                )}

                {error && <div className = 'fa-alert-error'>{error}</div>}
                {notice && <div className = 'fa-alert-success'>{notice}</div>}

                <div className = 'fa-card'>
                    <div className = 'fa-toolbar'>
                        <div className = 'fa-search-box'>
                            <Search size = { 15 } />
                            <input
                                onChange = { e => setSearch(e.target.value) }
                                placeholder = 'Search recordings by title, room ID, or host...'
                                type = 'text'
                                value = { search } />
                        </div>
                        <select
                            className = 'fa-select'
                            onChange = { e => setStatusFilter(e.target.value) }
                            value = { statusFilter }>
                            <option value = ''>All Statuses</option>
                            <option value = 'available'>Available</option>
                            <option value = 'processing'>Processing</option>
                            <option value = 'failed'>Failed</option>
                            <option value = 'deleted'>Deleted</option>
                            <option value = 'expired'>Expired</option>
                        </select>
                    </div>

                    <div className = 'fa-table-wrap'>
                        <table className = 'fa-table'>
                            <thead>
                                <tr><th>Title</th><th>Host / Org</th><th>Duration</th><th>Size</th><th>Retention</th><th>Status</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 7 }>Loading recordings...</td></tr>
                                ) : recordings.length === 0 ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 7 }>No recordings stored yet. Private recordings are never fabricated or exposed without authorization.</td></tr>
                                ) : (
                                    recordings.map(r => (
                                        <tr key = { r.id }>
                                            <td><strong>{r.title}</strong><div className = 'fa-muted-xs'>/{r.roomId || '—'} · {r.visibility}</div></td>
                                            <td>{r.hostName || '—'}<div className = 'fa-muted-xs'>{r.organizationName || 'Personal'}</div></td>
                                            <td>{Math.round((r.durationSeconds || 0) / 60)} min</td>
                                            <td>{((r.fileSizeBytes || 0) / (1024 * 1024)).toFixed(1)} MB</td>
                                            <td>{r.retentionDays}d</td>
                                            <td><span className = { `fa-badge fa-badge-${r.status}` }>{r.status}</span></td>
                                            <td>
                                                <div className = 'fa-row-actions'>
                                                    {canManageRec && r.status !== 'deleted' && (
                                                        <button
                                                            className = 'fa-link-btn danger'
                                                            onClick = { () => setConfirmAction({ id: r.id, title: r.title, type: 'delete-rec' }) }
                                                            type = 'button'>
                                                            <Trash2 size = { 13 } /> Delete
                                                        </button>
                                                    )}
                                                    {canManageRec && r.status === 'deleted' && (
                                                        <button
                                                            className = 'fa-link-btn'
                                                            onClick = { async () => {
                                                                await adminApi.restoreRecording(accessToken, r.id);
                                                                setNotice('Recording restored.');
                                                                await loadData();
                                                            } }
                                                            type = 'button'>
                                                            <RotateCcw size = { 13 } /> Restore
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {confirmAction && (
                    <ConfirmModal
                        confirmLabel = 'Delete Recording'
                        danger = { true }
                        description = { `Mark recording "${confirmAction.title}" as deleted? This action is audit logged.` }
                        isLoading = { busy }
                        onCancel = { () => setConfirmAction(null) }
                        onConfirm = { executeAction }
                        title = 'Delete Recording' />
                )}
            </div>
        );
    }

    // Meeting Detail View
    if (selectedMeetingId && meetingDetail) {
        const g = meetingDetail.general;
        const s = meetingDetail.settings;

        return (
            <div className = 'fa-page'>
                <div className = 'fa-page-header'>
                    <div>
                        <button
                            className = 'fa-link-btn'
                            onClick = { () => setSelectedMeetingId(null) }
                            type = 'button'>
                            <ArrowLeft size = { 15 } /> Back to Meetings
                        </button>
                        <h1>{g.title}</h1>
                        <p>Room: <code>/{g.roomId}</code> · Type: <strong>{g.meetingType}</strong> · Status: <span className = { `fa-badge fa-badge-${g.status}` }>{g.status}</span></p>
                    </div>
                    <div className = 'fa-header-actions'>
                        {canTerminate && g.status === 'live' && (
                            <button
                                className = 'fa-btn fa-btn-danger-outline'
                                onClick = { () => setConfirmAction({ id: g.id, title: g.title, type: 'end' }) }
                                type = 'button'>
                                <PowerOff size = { 14 } /> End Live Meeting
                            </button>
                        )}
                        {canManage && g.status !== 'cancelled' && (
                            <button
                                className = 'fa-btn fa-btn-secondary'
                                onClick = { () => setConfirmAction({ id: g.id, title: g.title, type: 'cancel-series' }) }
                                type = 'button'>
                                <XCircle size = { 14 } /> Cancel {g.meetingType === 'recurring' ? 'Series' : 'Meeting'}
                            </button>
                        )}
                        {canTerminate && !g.isDisabled && (
                            <button
                                className = 'fa-btn fa-btn-danger'
                                onClick = { () => setConfirmAction({ id: g.id, title: g.title, type: 'disable' }) }
                                type = 'button'>
                                <Ban size = { 14 } /> Disable Compromised Link
                            </button>
                        )}
                    </div>
                </div>

                {error && <div className = 'fa-alert-error'>{error}</div>}
                {notice && <div className = 'fa-alert-success'>{notice}</div>}

                <div className = 'fa-grid-2'>
                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'><h3>General Information</h3></div>
                        <dl className = 'fa-dl'>
                            <dt>Meeting ID</dt><dd><code>{g.id}</code></dd>
                            <dt>Meeting URL</dt><dd><code>{g.meetingUrl}</code></dd>
                            <dt>Host</dt><dd>{g.host ? `${g.host.name || ''} (${g.host.email})` : '—'}</dd>
                            <dt>Organization</dt><dd>{g.organization?.name || 'Personal'}</dd>
                            <dt>Scheduled Start</dt><dd>{g.scheduledAt ? new Date(g.scheduledAt).toLocaleString() : 'Instant'}</dd>
                            <dt>Duration / TZ</dt><dd>{g.durationMinutes} min · {g.timezone}</dd>
                            <dt>Recurrence</dt><dd>{g.recurrenceSummary || g.recurrenceRule || 'One-time'}</dd>
                            <dt>Total Sessions</dt><dd>{meetingDetail.analytics?.totalSessions ?? 0} ({meetingDetail.analytics?.totalMeetingMinutes ?? 0} min)</dd>
                        </dl>
                    </div>

                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'><h3>Meeting Security &amp; Policy Settings</h3></div>
                        <dl className = 'fa-dl'>
                            <dt>Passcode Enabled</dt><dd>{s.passcodeEnabled ? 'Yes' : 'No'}</dd>
                            <dt>Waiting Room</dt><dd>{s.waitingRoomEnabled ? 'Enabled' : 'Disabled'}</dd>
                            <dt>Join Before Host</dt><dd>{s.joinBeforeHost ? 'Allowed' : 'Host Required'}</dd>
                            <dt>Require Authentication</dt><dd>{s.requireAuthentication ? 'Required' : 'Guests Allowed'}</dd>
                            <dt>Mute on Entry</dt><dd>{s.muteOnEntry ? 'Yes' : 'No'}</dd>
                            <dt>Screen Sharing</dt><dd>{s.allowScreenSharing ? 'Enabled' : 'Disabled'}</dd>
                            <dt>In-Meeting Chat</dt><dd>{s.allowChat ? 'Enabled' : 'Disabled'}</dd>
                            <dt>Recording</dt><dd>{s.allowRecording ? 'Allowed' : 'Disabled'}</dd>
                        </dl>
                    </div>
                </div>

                <div className = 'fa-grid-2'>
                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'><h3>Scheduled Occurrences ({meetingDetail.occurrences?.length || 0})</h3></div>
                        <div className = 'fa-table-wrap'>
                            <table className = 'fa-table'>
                                <thead><tr><th>#</th><th>Window</th><th>Status</th><th>Action</th></tr></thead>
                                <tbody>
                                    {(meetingDetail.occurrences || []).map((o: any) => (
                                        <tr key = { o.id }>
                                            <td>#{o.occurrenceNumber}</td>
                                            <td className = 'fa-muted-xs'>{new Date(o.scheduledAt).toLocaleString()}</td>
                                            <td><span className = { `fa-badge fa-badge-${o.status}` }>{o.status}</span></td>
                                            <td>
                                                {canManage && (o.status === 'scheduled' || o.status === 'waiting_for_host') && (
                                                    <button
                                                        className = 'fa-link-btn danger'
                                                        onClick = { () => setConfirmAction({
                                                            id: g.id,
                                                            occurrenceId: o.id,
                                                            title: `${g.title} — Occurrence #${o.occurrenceNumber}`,
                                                            type: 'cancel-occ'
                                                        }) }
                                                        type = 'button'>
                                                        Cancel Occurrence
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'><h3>Participants ({meetingDetail.participants?.length || 0})</h3></div>
                        <div className = 'fa-table-wrap'>
                            <table className = 'fa-table'>
                                <thead><tr><th>Participant</th><th>Role</th><th>Joined</th></tr></thead>
                                <tbody>
                                    {(meetingDetail.participants || []).length === 0 ? (
                                        <tr><td
                                            className = 'fa-muted'
                                            colSpan = { 3 }>No participants recorded yet.</td></tr>
                                    ) : (
                                        meetingDetail.participants.map((p: any) => (
                                            <tr key = { p.id }>
                                                <td><strong>{p.name}</strong><div className = 'fa-muted-xs'>{p.email || 'Guest'}</div></td>
                                                <td><span className = 'fa-badge'>{p.role}</span></td>
                                                <td className = 'fa-muted-xs'>{new Date(p.joinedAt).toLocaleString()}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {confirmAction && (
                    <ConfirmModal
                        confirmLabel = 'Confirm Action'
                        danger = { true }
                        description = { `Confirm action (${confirmAction.type}) on "${confirmAction.title}". This intervention is permission-checked and audit-logged.` }
                        isLoading = { busy }
                        onCancel = { () => setConfirmAction(null) }
                        onConfirm = { executeAction }
                        requireReason = { confirmAction.type === 'end' || confirmAction.type === 'disable' }
                        title = 'Confirm Administrative Meeting Action' />
                )}
            </div>
        );
    }

    const titleMap: Record<string, string> = {
        meetings: 'All Meetings',
        'live-meetings': 'Live Meetings',
        'scheduled-meetings': 'Scheduled Meetings',
        'meeting-history': 'Meeting History',
        'recurring-meetings': 'Recurring Meeting Series',
        'meeting-reports': 'Meeting Reports & Diagnostics'
    };

    return (
        <div className = 'fa-page'>
            <div className = 'fa-page-header'>
                <div>
                    <h1>{titleMap[mode] || 'Meetings'}</h1>
                    <p>Inspect full meeting lifecycle, recurring series, individual occurrences, and administrative controls.</p>
                </div>
                <button
                    className = 'fa-btn fa-btn-secondary'
                    onClick = { loadData }
                    type = 'button'>
                    <RefreshCw size = { 15 } /> Refresh
                </button>
            </div>

            {error && <div className = 'fa-alert-error'>{error}</div>}
            {notice && <div className = 'fa-alert-success'>{notice}</div>}

            <div className = 'fa-card'>
                <div className = 'fa-toolbar'>
                    <div className = 'fa-search-box'>
                        <Search size = { 15 } />
                        <input
                            onChange = { e => {
                                setSearch(e.target.value);
                                setPage(1);
                            } }
                            placeholder = 'Search by topic, room ID, meeting ID, or host...'
                            type = 'text'
                            value = { search } />
                    </div>
                    <select
                        className = 'fa-select'
                        onChange = { e => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        } }
                        value = { statusFilter }>
                        <option value = ''>All Statuses</option>
                        <option value = 'live'>Live</option>
                        <option value = 'scheduled'>Scheduled</option>
                        <option value = 'waiting_for_host'>Waiting for Host</option>
                        <option value = 'ended'>Ended</option>
                        <option value = 'cancelled'>Cancelled</option>
                        <option value = 'expired'>Expired</option>
                        <option value = 'disabled'>Disabled</option>
                    </select>
                </div>

                <div className = 'fa-table-wrap'>
                    <table className = 'fa-table'>
                        <thead>
                            <tr>
                                <th>Meeting / Room ID</th>
                                <th>Host</th>
                                <th>Type</th>
                                <th>Scheduled / Created</th>
                                <th>Duration</th>
                                <th>Participants</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td
                                    className = 'fa-muted'
                                    colSpan = { 8 }>Loading meetings...</td></tr>
                            ) : meetings.length === 0 ? (
                                <tr><td
                                    className = 'fa-muted'
                                    colSpan = { 8 }>No meetings found for the current filters.</td></tr>
                            ) : (
                                meetings.map(m => (
                                    <tr key = { m.id }>
                                        <td>
                                            <button
                                                className = 'fa-link-btn'
                                                onClick = { () => setSelectedMeetingId(m.id) }
                                                type = 'button'>
                                                <strong>{m.title}</strong>
                                            </button>
                                            <div className = 'fa-muted-xs'>
                                                /{m.roomId} {m.recurrenceSummary ? `· ${m.recurrenceSummary}` : ''}
                                            </div>
                                        </td>
                                        <td>
                                            {m.host.name || m.host.email}
                                            <div className = 'fa-muted-xs'>{m.organizationName || 'Personal'}</div>
                                        </td>
                                        <td><span className = 'fa-badge'>{m.meetingType}</span></td>
                                        <td className = 'fa-muted-xs'>
                                            <Calendar size = { 12 } /> {new Date(m.scheduledAt || m.createdAt).toLocaleString()}
                                        </td>
                                        <td>{m.durationMinutes}m</td>
                                        <td>{m.participantCount}</td>
                                        <td><span className = { `fa-badge fa-badge-${m.status}` }>{m.status}</span></td>
                                        <td>
                                            <div className = 'fa-row-actions'>
                                                <button
                                                    className = 'fa-link-btn'
                                                    onClick = { () => setSelectedMeetingId(m.id) }
                                                    type = 'button'>Inspect</button>
                                                {canTerminate && m.status === 'live' && (
                                                    <button
                                                        className = 'fa-link-btn danger'
                                                        onClick = { () => setConfirmAction({ id: m.id, title: m.title, type: 'end' }) }
                                                        type = 'button'>
                                                        End
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className = 'fa-pagination'>
                    <span>Page {pagination.page} of {pagination.totalPages} ({pagination.total} meetings)</span>
                    <div className = 'fa-pagination-btns'>
                        <button
                            className = 'fa-btn fa-btn-secondary'
                            disabled = { page <= 1 }
                            onClick = { () => setPage(p => Math.max(1, p - 1)) }
                            type = 'button'>Previous</button>
                        <button
                            className = 'fa-btn fa-btn-secondary'
                            disabled = { page >= pagination.totalPages }
                            onClick = { () => setPage(p => p + 1) }
                            type = 'button'>Next</button>
                    </div>
                </div>
            </div>

            {confirmAction && (
                <ConfirmModal
                    confirmLabel = 'Confirm'
                    danger = { true }
                    description = { `Confirm ${confirmAction.type} on "${confirmAction.title}"?` }
                    isLoading = { busy }
                    onCancel = { () => setConfirmAction(null) }
                    onConfirm = { executeAction }
                    requireReason = { confirmAction.type === 'end' || confirmAction.type === 'disable' }
                    title = 'Confirm Administrative Action' />
            )}
        </div>
    );
}
