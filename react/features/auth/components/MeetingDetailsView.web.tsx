/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { IReduxState } from '../../app/types';
import { getAccessToken } from '../functions';
import { authApiClient } from '../api';
import { IMeetingDetailsResponse, IMeetingInvitation } from '../types';
import {
    getRelativeMeetingTime,
    downloadIcsFile,
    formatMeetingInvitationText
} from '../utils/calendar';

interface MeetingDetailsViewProps {
    meetingId: string;
    onBack: () => void;
    onEdit: (meetingId: string) => void;
    onCancelled: () => void;
}

export default function MeetingDetailsView({
    meetingId,
    onBack,
    onEdit,
    onCancelled
}: MeetingDetailsViewProps) {
    const accessToken = useSelector((state: IReduxState) => getAccessToken(state));

    const [details, setDetails] = useState<IMeetingDetailsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [copiedLink, setCopiedLink] = useState(false);
    const [copiedInvite, setCopiedInvite] = useState(false);

    // Cancel modal state
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelScope, setCancelScope] = useState<'occurrence' | 'series'>('occurrence');
    const [cancelling, setCancelling] = useState(false);

    // New Invitee State
    const [newEmail, setNewEmail] = useState('');
    const [addingInvitee, setAddingInvitee] = useState(false);

    const loadDetails = () => {
        if (!accessToken) return;
        setLoading(true);
        setError(null);

        authApiClient
            .getMeetingDetails(meetingId, accessToken)
            .then(data => setDetails(data))
            .catch(err => setError(err.message || 'Failed to load meeting details'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadDetails();
    }, [meetingId, accessToken]);

    const handleCopyLink = () => {
        if (!details) return;
        const link = `${window.location.origin}/${details.meeting.roomId}`;
        navigator.clipboard.writeText(link);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
    };

    const handleCopyInvite = () => {
        if (!details) return;
        const text = formatMeetingInvitationText(details.meeting, null, window.location.origin);
        navigator.clipboard.writeText(text);
        setCopiedInvite(true);
        setTimeout(() => setCopiedInvite(false), 2000);
    };

    const handleDownloadIcs = () => {
        if (!details) return;
        downloadIcsFile(details.meeting, null, window.location.origin);
    };

    const handleStartMeeting = async (occurrenceId?: string) => {
        if (!details || !accessToken) return;
        try {
            if (details.isOwner || details.isHost) {
                await authApiClient.startMeeting(details.meeting.id, accessToken, occurrenceId);
            }
        } catch (err: any) {
            alert(err.message || 'Failed to start meeting');
            return;
        }
        window.location.href = `/${details.meeting.roomId}`;
    };

    const handleEndActiveOccurrence = async () => {
        if (!details || !accessToken) return;
        try {
            await authApiClient.endOccurrence(details.meeting.id, accessToken);
            loadDetails();
        } catch (err: any) {
            alert(err.message || 'Failed to end active occurrence');
        }
    };

    const handleCancelSingleOccurrence = async (occurrenceId: string) => {
        if (!details || !accessToken) return;
        try {
            await authApiClient.cancelOccurrence(details.meeting.id, occurrenceId, accessToken);
            loadDetails();
        } catch (err: any) {
            alert(err.message || 'Failed to cancel occurrence');
        }
    };

    const handleConfirmCancel = async () => {
        if (!accessToken) return;
        setCancelling(true);
        try {
            await authApiClient.cancelMeeting(meetingId, accessToken, cancelScope);
            setShowCancelModal(false);
            onCancelled();
        } catch (err: any) {
            alert(err.message || 'Failed to cancel meeting');
        } finally {
            setCancelling(false);
        }
    };

    const handleAddInvitee = async () => {
        const email = newEmail.trim().toLowerCase();
        if (!email || !accessToken) return;

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            alert('Please enter a valid email address');
            return;
        }

        setAddingInvitee(true);
        try {
            const res = await authApiClient.addInvitations(meetingId, [email], accessToken);
            if (details && res.invitees) {
                setDetails({
                    ...details,
                    invitees: [...details.invitees, ...res.invitees]
                });
            }
            setNewEmail('');
        } catch (err: any) {
            alert(err.message || 'Failed to add invitation');
        } finally {
            setAddingInvitee(false);
        }
    };

    const handleRemoveInvitee = async (invitationId: string) => {
        if (!accessToken || !details) return;
        try {
            await authApiClient.removeInvitation(meetingId, invitationId, accessToken);
            setDetails({
                ...details,
                invitees: details.invitees.filter(i => i.id !== invitationId)
            });
        } catch (err: any) {
            alert(err.message || 'Failed to remove invitation');
        }
    };

    if (loading) {
        return (
            <div className="faceonn-schedule-container" style={{ textAlign: 'center', padding: '60px 0' }}>
                <div className="dash-loading-spinner" />
                <p style={{ marginTop: '16px', color: '#64748b' }}>Loading meeting details...</p>
            </div>
        );
    }

    if (error || !details) {
        return (
            <div className="faceonn-schedule-container">
                <button type="button" className="schedule-btn-back" onClick={onBack}>
                    ← Back to Meetings
                </button>
                <div className="schedule-error-banner" style={{ marginTop: '20px' }}>
                    <span>{error || 'Meeting not found'}</span>
                </div>
            </div>
        );
    }

    const { meeting, invitees, isOwner, isHost, occurrences = [], nextOccurrence, alternativeHosts = [], recurrenceSummary } = details;
    const canHost = Boolean(isOwner || isHost);
    const roomUrl = `${window.location.origin}/${meeting.roomId}`;
    const relativeTime = getRelativeMeetingTime(nextOccurrence?.scheduledAt || meeting.scheduledAt, meeting.timezone);

    return (
        <div className="faceonn-schedule-container">
            {/* Header Toolbar */}
            <div className="faceonn-details-header">
                <button type="button" className="schedule-btn-back" onClick={onBack}>
                    ← Back to Meetings
                </button>

                <div className="details-header-main">
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <h2>{meeting.title}</h2>
                            <span className={`status-pill ${meeting.status}`}>
                                {meeting.status.toUpperCase()}
                            </span>
                            <span className={`time-pill ${relativeTime.badgeClass}`}>
                                {relativeTime.label}
                            </span>
                        </div>
                        <p className="details-subtitle">
                            Created {new Date(meeting.createdAt).toLocaleDateString()} • Room:{' '}
                            <strong>{meeting.roomId}</strong>
                        </p>
                    </div>

                    <div className="details-header-actions">
                        {meeting.status !== 'cancelled' && meeting.status !== 'ended' && (
                            <button
                                type="button"
                                className="schedule-btn-action blue"
                                onClick={() => handleStartMeeting(nextOccurrence?.id)}>
                                {canHost
                                    ? (meeting.status === 'active' ? 'Rejoin Meeting →' : 'Start Meeting →')
                                    : 'Join Meeting →'}
                            </button>
                        )}

                        {canHost && meeting.status === 'active' && (
                            <button
                                type="button"
                                className="schedule-btn-danger"
                                onClick={handleEndActiveOccurrence}>
                                End Current Session
                            </button>
                        )}

                        <button
                            type="button"
                            className="schedule-btn-secondary"
                            onClick={handleCopyLink}>
                            {copiedLink ? '✓ Copied' : 'Copy Link'}
                        </button>

                        <button
                            type="button"
                            className="schedule-btn-secondary"
                            onClick={handleCopyInvite}>
                            {copiedInvite ? '✓ Copied' : 'Copy Invite'}
                        </button>

                        {isOwner && meeting.status !== 'cancelled' && meeting.status !== 'ended' && (
                            <>
                                <button
                                    type="button"
                                    className="schedule-btn-secondary"
                                    onClick={() => onEdit(meeting.id)}>
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    className="schedule-btn-danger"
                                    onClick={() => setShowCancelModal(true)}>
                                    Cancel
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="details-content-grid">
                {/* Left: General & Security Info */}
                <div className="details-main-pane">
                    {/* Overview Box */}
                    <div className="schedule-card-section">
                        <h3>Meeting Details</h3>
                        <div className="details-row-grid">
                            <div className="detail-item">
                                <label>Date & Time</label>
                                <span>
                                    {meeting.scheduledAt
                                        ? new Date(meeting.scheduledAt).toLocaleString('en-US', {
                                              weekday: 'short',
                                              year: 'numeric',
                                              month: 'short',
                                              day: 'numeric',
                                              hour: 'numeric',
                                              minute: '2-digit',
                                              timeZoneName: 'short'
                                          })
                                        : 'Instant Meeting'}
                                </span>
                            </div>

                            <div className="detail-item">
                                <label>Duration</label>
                                <span>{meeting.durationMinutes} minutes</span>
                            </div>

                            <div className="detail-item">
                                <label>Timezone</label>
                                <span>{meeting.timezone || 'UTC'}</span>
                            </div>

                            <div className="detail-item">
                                <label>Meeting ID</label>
                                <span className="mono">{meeting.roomId}</span>
                            </div>

                            <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                                <label>Join URL</label>
                                <span className="mono-link">{roomUrl}</span>
                            </div>

                            {meeting.description && (
                                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                                    <label>Description</label>
                                    <p className="detail-description">{meeting.description}</p>
                                </div>
                            )}

                            {(recurrenceSummary || meeting.recurrenceRule) && (
                                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                                    <label>Recurrence</label>
                                    <span>🔁 {recurrenceSummary || meeting.recurrenceRule}</span>
                                </div>
                            )}

                            {nextOccurrence && meeting.meetingType === 'recurring' && (
                                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                                    <label>Next Occurrence</label>
                                    <span>
                                        #{nextOccurrence.occurrenceNumber} •{' '}
                                        {new Date(nextOccurrence.scheduledAt).toLocaleString('en-US', {
                                            weekday: 'long',
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            timeZoneName: 'short'
                                        })}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Recurring Occurrences Timeline */}
                    {meeting.meetingType === 'recurring' && occurrences.length > 0 && (
                        <div className="schedule-card-section">
                            <h3>Scheduled Occurrences ({occurrences.length})</h3>
                            <div className="occurrences-timeline-list">
                                {occurrences.slice(0, 12).map((occ) => (
                                    <div key={occ.id} className="occurrence-row-item">
                                        <div className="occurrence-row-left">
                                            <span className="occurrence-num">#{occ.occurrenceNumber}</span>
                                            <div>
                                                <div className="occurrence-date">
                                                    {new Date(occ.scheduledAt).toLocaleString('en-US', {
                                                        weekday: 'short',
                                                        month: 'short',
                                                        day: 'numeric',
                                                        year: 'numeric',
                                                        hour: 'numeric',
                                                        minute: '2-digit'
                                                    })}
                                                </div>
                                                <span className={`occurrence-status-badge ${occ.status}`}>
                                                    {occ.status.replace('_', ' ').toUpperCase()}
                                                </span>
                                            </div>
                                        </div>

                                        {canHost && (occ.status === 'scheduled' || occ.status === 'waiting_for_host' || occ.status === 'active') && (
                                            <div className="occurrence-row-actions">
                                                <button
                                                    type="button"
                                                    className="schedule-btn-action blue"
                                                    onClick={() => handleStartMeeting(occ.id)}>
                                                    {occ.status === 'active' ? 'Rejoin' : 'Start'}
                                                </button>
                                                {occ.status !== 'active' && (
                                                    <button
                                                        type="button"
                                                        className="schedule-btn-danger"
                                                        onClick={() => handleCancelSingleOccurrence(occ.id)}>
                                                        Cancel
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Alternative Hosts */}
                    {alternativeHosts.length > 0 && (
                        <div className="schedule-card-section">
                            <h3>Alternative Hosts ({alternativeHosts.length})</h3>
                            <div className="invitees-chips-list" style={{ marginTop: '10px' }}>
                                {alternativeHosts.map(ah => (
                                    <div key={ah.userId} className="invitee-chip">
                                        <span className="invitee-chip-email">👑 {ah.name || ah.email} ({ah.email})</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Security & Configured Settings */}
                    <div className="schedule-card-section">
                        <h3>Security & Conference Settings</h3>
                        <div className="settings-pills-wrap">
                            <div className="settings-pill-box">
                                <span className="pill-title">Passcode</span>
                                <span className="pill-value">
                                    {meeting.hasPasscode ? '🔒 Required' : '🔓 Not Required'}
                                </span>
                            </div>

                            <div className="settings-pill-box">
                                <span className="pill-title">Waiting Room</span>
                                <span className="pill-value">
                                    {meeting.settings?.waitingRoomEnabled ? '🛡️ Enabled' : '⚡ Direct'}
                                </span>
                            </div>

                            <div className="settings-pill-box">
                                <span className="pill-title">Join Before Host</span>
                                <span className="pill-value">
                                    {meeting.settings?.joinBeforeHost ? 'Allowed' : 'Host Required'}
                                </span>
                            </div>

                            <div className="settings-pill-box">
                                <span className="pill-title">Mute on Entry</span>
                                <span className="pill-value">
                                    {meeting.settings?.muteOnEntry ? '🔇 Muted' : '🔊 Open'}
                                </span>
                            </div>

                            <div className="settings-pill-box">
                                <span className="pill-title">Screen Sharing</span>
                                <span className="pill-value">
                                    {meeting.settings?.allowScreenSharing !== false ? 'Allowed' : 'Disabled'}
                                </span>
                            </div>

                            <div className="settings-pill-box">
                                <span className="pill-title">In-Meeting Chat</span>
                                <span className="pill-value">
                                    {meeting.settings?.allowChat !== false ? 'Enabled' : 'Disabled'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Attendees & Invitations */}
                    <div className="schedule-card-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3>Invited Attendees ({invitees.length})</h3>
                        </div>

                        {isOwner && (
                            <div className="invite-add-row" style={{ marginTop: '12px' }}>
                                <input
                                    type="email"
                                    className="schedule-input-text"
                                    placeholder="Add participant email..."
                                    value={newEmail}
                                    onChange={e => setNewEmail(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddInvitee();
                                        }
                                    }} />
                                <button
                                    type="button"
                                    className="schedule-btn-action blue"
                                    disabled={addingInvitee}
                                    onClick={handleAddInvitee}>
                                    {addingInvitee ? 'Adding...' : '+ Invite'}
                                </button>
                            </div>
                        )}

                        {invitees.length === 0 ? (
                            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '10px' }}>
                                No attendees invited yet.
                            </p>
                        ) : (
                            <div className="details-invitees-list">
                                {invitees.map(invitee => (
                                    <div key={invitee.id} className="details-invitee-row">
                                        <div className="invitee-main-info">
                                            <span className="invitee-email">{invitee.email}</span>
                                            <span className={`invitee-status-tag ${invitee.status}`}>
                                                {invitee.status}
                                            </span>
                                        </div>

                                        {isOwner && (
                                            <button
                                                type="button"
                                                className="btn-remove-invitee"
                                                onClick={() => handleRemoveInvitee(invitee.id)}>
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Calendar Shortcuts */}
                <div className="details-sidebar-pane">
                    <div className="schedule-summary-card">
                        <h4>Add to Calendar</h4>
                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                            Export this event to your preferred calendar platform.
                        </p>

                        <div className="calendar-vertical-links">
                            <a
                                href={details.googleCalendarUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-calendar-provider google"
                                style={{ width: '100%', justifyContent: 'center' }}>
                                <span>Google Calendar</span>
                            </a>

                            <a
                                href={details.outlookCalendarUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-calendar-provider outlook"
                                style={{ width: '100%', justifyContent: 'center' }}>
                                <span>Outlook Calendar</span>
                            </a>

                            <button
                                type="button"
                                className="btn-calendar-provider ics"
                                style={{ width: '100%', justifyContent: 'center' }}
                                onClick={handleDownloadIcs}>
                                <span>Download .ics File</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cancellation Confirmation Modal */}
            {showCancelModal && (
                <div className="faceonn-dash-modal-overlay" onClick={() => setShowCancelModal(false)}>
                    <div className="faceonn-dash-modal-card" onClick={e => e.stopPropagation()}>
                        <div className="faceonn-dash-modal-header">
                            <h3>Cancel Meeting</h3>
                            <button
                                type="button"
                                className="dash-modal-close"
                                onClick={() => setShowCancelModal(false)}>
                                ✕
                            </button>
                        </div>

                        <p className="dash-modal-desc">
                            Are you sure you want to cancel <strong>{meeting.title}</strong>? Participants will no
                            longer be able to join using this invitation.
                        </p>

                        {meeting.recurrenceSeriesId && (
                            <div className="cancel-recurrence-options" style={{ margin: '16px 0' }}>
                                <label className="schedule-radio-label">
                                    <input
                                        type="radio"
                                        name="cancelScope"
                                        checked={cancelScope === 'occurrence'}
                                        onChange={() => setCancelScope('occurrence')} />
                                    <span>Cancel only this occurrence</span>
                                </label>
                                <label className="schedule-radio-label" style={{ marginTop: '8px' }}>
                                    <input
                                        type="radio"
                                        name="cancelScope"
                                        checked={cancelScope === 'series'}
                                        onChange={() => setCancelScope('series')} />
                                    <span>Cancel all occurrences in this recurring series</span>
                                </label>
                            </div>
                        )}

                        <div className="dash-modal-actions">
                            <button
                                type="button"
                                className="faceonn-dash-btn-cancel"
                                onClick={() => setShowCancelModal(false)}
                                disabled={cancelling}>
                                Keep Meeting
                            </button>
                            <button
                                type="button"
                                className="schedule-btn-danger"
                                onClick={handleConfirmCancel}
                                disabled={cancelling}>
                                {cancelling ? 'Cancelling...' : 'Yes, Cancel Meeting'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

