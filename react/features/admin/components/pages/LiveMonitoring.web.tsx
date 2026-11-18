/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import { Activity, Ban, PowerOff, Radio, RefreshCw, Server, Users, Wifi } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { adminApi } from '../../api';
import { IAdminContextInfo } from '../../types';
import ConfirmModal from '../shared/ConfirmModal.web';

interface ILiveMonitoringProps {
    accessToken: string;
    adminContext: IAdminContextInfo;
}

function formatElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) {
        return `${h}h ${m}m ${s}s`;
    }

    return `${m}m ${s}s`;
}

export default function LiveMonitoring({ accessToken, adminContext }: ILiveMonitoringProps) {
    const [ snapshot, setSnapshot ] = useState<any>(null);
    const [ loading, setLoading ] = useState(true);
    const [ error, setError ] = useState<string | null>(null);
    const [ autoRefresh, setAutoRefresh ] = useState(true);
    const [ pendingAction, setPendingAction ] = useState<{ meeting: any; type: 'end' | 'disable'; } | null>(null);
    const [ actionBusy, setActionBusy ] = useState(false);

    const canControl = adminContext.isSuperAdmin
        || adminContext.permissions.includes('live:control')
        || adminContext.permissions.includes('meetings:terminate');

    const loadLive = useCallback(async () => {
        try {
            const data = await adminApi.getLiveMeetings(accessToken);

            setSnapshot(data);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load live monitoring feed');
        } finally {
            setLoading(false);
        }
    }, [ accessToken ]);

    useEffect(() => {
        loadLive();
    }, [ loadLive ]);

    useEffect(() => {
        if (!autoRefresh) {
            return;
        }
        const timer = window.setInterval(() => {
            loadLive();
        }, 10000);

        return () => window.clearInterval(timer);
    }, [ autoRefresh, loadLive ]);

    const handleConfirmAction = async (reason?: string) => {
        if (!pendingAction) {
            return;
        }
        setActionBusy(true);
        try {
            if (pendingAction.type === 'end') {
                await adminApi.endLiveMeeting(accessToken, pendingAction.meeting.meetingId, reason || 'admin_terminated');
            } else {
                await adminApi.disableMeetingLink(accessToken, pendingAction.meeting.meetingId, reason || 'Compromised room disabled');
            }
            setPendingAction(null);
            await loadLive();
        } catch (err: any) {
            setError(err.message || 'Action failed');
        } finally {
            setActionBusy(false);
        }
    };

    const metrics = snapshot?.metrics;
    const liveMeetings = snapshot?.liveMeetings || [];

    return (
        <div className = 'fa-page'>
            <div className = 'fa-page-header'>
                <div>
                    <h1>Live Meeting Monitoring</h1>
                    <p>Real-time visibility into active conferences, SFU streams, and room health. Private meetings can never be silently joined.</p>
                </div>
                <div className = 'fa-header-actions'>
                    <label className = 'fa-toggle-inline'>
                        <input
                            checked = { autoRefresh }
                            onChange = { e => setAutoRefresh(e.target.checked) }
                            type = 'checkbox' />
                        <span>Auto-refresh (10s)</span>
                    </label>
                    <button
                        className = 'fa-btn fa-btn-secondary'
                        onClick = { loadLive }
                        type = 'button'>
                        <RefreshCw size = { 15 } /> Refresh
                    </button>
                </div>
            </div>

            {error && <div className = 'fa-alert-error'>{error}</div>}
            {loading && !snapshot && <div className = 'fa-loading-box'>Loading live telemetry...</div>}

            {metrics && (
                <div className = 'fa-kpi-grid'>
                    <div className = 'fa-kpi-card highlight-live'>
                        <div className = 'fa-kpi-top'><span>Concurrent Meetings</span><Radio size = { 16 } /></div>
                        <div className = 'fa-kpi-value'>{metrics.concurrentMeetings}</div>
                        <div className = 'fa-kpi-sub'>Active conference sessions</div>
                    </div>
                    <div className = 'fa-kpi-card'>
                        <div className = 'fa-kpi-top'><span>Concurrent Participants</span><Users size = { 16 } /></div>
                        <div className = 'fa-kpi-value'>{metrics.concurrentParticipants}</div>
                        <div className = 'fa-kpi-sub'>Across active rooms</div>
                    </div>
                    <div className = 'fa-kpi-card'>
                        <div className = 'fa-kpi-top'><span>SFU Incoming / Outgoing</span><Wifi size = { 16 } /></div>
                        <div className = 'fa-kpi-value'>{metrics.incomingWebRtcStreams} / {metrics.outgoingWebRtcStreams}</div>
                        <div className = 'fa-kpi-sub'>Active transports: {metrics.activeTransports}</div>
                    </div>
                    <div className = 'fa-kpi-card'>
                        <div className = 'fa-kpi-top'><span>WebRTC Quality Telemetry</span><Activity size = { 16 } /></div>
                        <div className = 'fa-kpi-value'>{metrics.webrtcQualityTelemetryAvailable ? `${metrics.avgRttMs} ms` : 'Not Connected'}</div>
                        <div className = 'fa-kpi-sub'>Connect JVB Colibri / SFU stats exporter for RTT &amp; jitter</div>
                    </div>
                </div>
            )}

            <div className = 'fa-card'>
                <div className = 'fa-card-header'>
                    <div>
                        <h3>Active Live Rooms ({liveMeetings.length})</h3>
                        <p>Last updated: {snapshot?.timestamp ? new Date(snapshot.timestamp).toLocaleTimeString() : '—'}</p>
                    </div>
                </div>

                {liveMeetings.length === 0 ? (
                    <div className = 'fa-empty-state'>
                        <Radio size = { 28 } />
                        <h4>No active meetings right now</h4>
                        <p>When hosts start instant or scheduled meetings, live cards and SFU telemetry will appear here immediately.</p>
                    </div>
                ) : (
                    <div className = 'fa-live-grid'>
                        {liveMeetings.map((m: any) => (
                            <div
                                className = 'fa-live-card'
                                key = { m.sessionId }>
                                <div className = 'fa-live-card-head'>
                                    <span className = 'fa-badge fa-badge-live'>LIVE</span>
                                    <span className = 'fa-muted-xs'>{formatElapsed(m.durationSeconds)}</span>
                                </div>
                                <h4>{m.title}</h4>
                                <div className = 'fa-live-meta'>
                                    <span><strong>Room:</strong> /{m.roomId}</span>
                                    <span><strong>Host:</strong> {m.host?.name || m.host?.email}</span>
                                    <span><strong>Participants:</strong> {m.participantCount}</span>
                                    <span><Server size = { 13 } /> {m.sfuNode} ({m.region})</span>
                                    <span><strong>Recording:</strong> {m.recordingActive ? 'Enabled' : 'Off'}</span>
                                    <span><strong>Health:</strong> {m.networkHealth}</span>
                                </div>
                                {canControl && (
                                    <div className = 'fa-live-actions'>
                                        <button
                                            className = 'fa-btn fa-btn-danger-outline'
                                            onClick = { () => setPendingAction({ meeting: m, type: 'end' }) }
                                            type = 'button'>
                                            <PowerOff size = { 14 } /> End Meeting
                                        </button>
                                        <button
                                            className = 'fa-btn fa-btn-secondary'
                                            onClick = { () => setPendingAction({ meeting: m, type: 'disable' }) }
                                            type = 'button'>
                                            <Ban size = { 14 } /> Disable Link
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {pendingAction && (
                <ConfirmModal
                    confirmLabel = { pendingAction.type === 'end' ? 'End Live Meeting' : 'Disable Compromised Room' }
                    danger = { true }
                    description = {
                        pendingAction.type === 'end'
                            ? `Immediately terminate "${pendingAction.meeting.title}" (/${pendingAction.meeting.roomId}) for all participants? This action is audit logged.`
                            : `Permanently disable room link "/${pendingAction.meeting.roomId}" and terminate active sessions?`
                    }
                    isLoading = { actionBusy }
                    onCancel = { () => setPendingAction(null) }
                    onConfirm = { handleConfirmAction }
                    requireReason = { true }
                    title = { pendingAction.type === 'end' ? 'Terminate Live Meeting' : 'Disable Compromised Room Link' } />
            )}
        </div>
    );
}
