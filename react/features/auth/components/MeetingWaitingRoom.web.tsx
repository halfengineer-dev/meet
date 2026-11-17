import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { appWillNavigate } from '../../base/app/actions';
import { setJWT } from '../../base/jwt/actions';
import { IReduxState } from '../../app/types';
import { _getRouteToRender } from '../../app/getRouteToRender';
import { logout } from '../actions';
import { authApiClient } from '../api';
import { getAccessToken, getAuthUser, isAuthenticated } from '../functions';
import { IPublicMeetingInfo } from '../types';

type GateMode =
    | 'loading'
    | 'waiting_for_host'
    | 'host_pre_start'
    | 'passcode_required'
    | 'cancelled'
    | 'ended'
    | 'entering'
    | 'error';

function formatCountdown(scheduledAtIso?: string | null): { text: string; isPast: boolean } {
    if (!scheduledAtIso) {
        return { text: 'Scheduled meeting', isPast: false };
    }

    const diffMs = new Date(scheduledAtIso).getTime() - Date.now();
    if (diffMs <= 0) {
        return { text: 'Scheduled time reached — waiting for host', isPast: true };
    }

    const totalSec = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    if (days > 0) {
        return { text: `Starts in ${days}d ${hours}h ${minutes}m`, isPast: false };
    }
    if (hours > 0) {
        return { text: `Starts in ${hours}h ${minutes}m ${seconds}s`, isPast: false };
    }
    if (minutes > 0) {
        return { text: `Starts in ${minutes}m ${seconds}s`, isPast: false };
    }
    return { text: `Starts in ${seconds}s`, isPast: false };
}

function formatScheduledDateTime(scheduledAtIso?: string | null, timezone?: string): string {
    if (!scheduledAtIso) return 'Scheduled';
    try {
        const d = new Date(scheduledAtIso);
        return new Intl.DateTimeFormat('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
            ...(timezone ? { timeZone: timezone } : {})
        }).format(d);
    } catch (_) {
        return new Date(scheduledAtIso).toLocaleString();
    }
}

export default function MeetingWaitingRoom() {
    const dispatch = useDispatch<any>();
    const isUserAuth = useSelector(isAuthenticated);
    const accessToken = useSelector(getAccessToken);
    const user = useSelector(getAuthUser);
    const reduxRoom = useSelector((state: IReduxState) => state['features/base/conference']?.room);
    const app = useSelector((state: IReduxState) => state['features/base/app']?.app);

    const roomId = (
        reduxRoom
        || window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0]
        || ''
    ).toLowerCase();

    const [mode, setMode] = useState<GateMode>('loading');
    const [info, setInfo] = useState<IPublicMeetingInfo | null>(null);
    const [previewParticipantView, setPreviewParticipantView] = useState(false);

    // Passcode state
    const [passcode, setPasscode] = useState('');
    const [showPasscode, setShowPasscode] = useState(false);
    const [passcodeError, setPasscodeError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Polling & countdown state
    const [countdown, setCountdown] = useState<{ text: string; isPast: boolean }>({ text: '', isPast: false });
    const [lastCheckedText, setLastCheckedText] = useState<string>('Checking automatically every 5 seconds');
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const enteringRef = useRef(false);

    // Unlock document scrolling while on waiting screen (matching dashboard/auth pages)
    useEffect(() => {
        document.documentElement.classList.add('faceonn-dash-html');
        document.body.classList.add('faceonn-dash-body');
        return () => {
            document.documentElement.classList.remove('faceonn-dash-html');
            document.body.classList.remove('faceonn-dash-body');
        };
    }, []);

    const enterConferenceWithToken = useCallback(async (jwtToken: string) => {
        if (enteringRef.current) return;
        enteringRef.current = true;
        setMode('entering');
        dispatch(setJWT(jwtToken));

        // Let Redux state reflect the new JWT, then navigate directly into Conference
        setTimeout(() => {
            if (app && typeof app._navigate === 'function') {
                dispatch((d: any, getState: () => IReduxState) => {
                    const currentState = getState();
                    _getRouteToRender(currentState, d).then((route: any) => {
                        if (route) {
                            d(appWillNavigate(app, route));
                            app._navigate(route);
                        }
                    });
                });
            } else {
                window.location.reload();
            }
        }, 60);
    }, [app, dispatch]);

    const attemptTokenJoin = useCallback(async (inputPasscode?: string) => {
        if (!accessToken) {
            const target = window.location.pathname + window.location.search;
            window.location.href = `/login?redirect=${encodeURIComponent(target)}`;
            return;
        }

        try {
            const data = await authApiClient.getMeetingToken(roomId, accessToken, inputPasscode, {
                allowHostAutoStart: false
            });
            await enterConferenceWithToken(data.token);
        } catch (err: any) {
            if (err.code === 'WAITING_FOR_HOST') {
                setMode('waiting_for_host');
            } else if (err.code === 'HOST_NOT_STARTED') {
                setMode('host_pre_start');
            } else if (err.code === 'PASSCODE_REQUIRED') {
                setPasscodeError(null);
                setMode('passcode_required');
            } else if (err.code === 'INVALID_PASSCODE') {
                setPasscodeError('Incorrect meeting passcode. Please try again.');
                setMode('passcode_required');
            } else if (err.code === 'MEETING_CANCELLED') {
                setMode('cancelled');
            } else if (err.code === 'MEETING_ENDED') {
                setMode('ended');
            } else {
                setStatusMessage(err.message || 'Unable to join this meeting right now.');
                setMode('error');
            }
        }
    }, [accessToken, enterConferenceWithToken, roomId]);

    const fetchStatus = useCallback(async (isPoll = false) => {
        if (!roomId || enteringRef.current) return;

        try {
            const publicInfo = await authApiClient.getPublicMeetingInfo(roomId, accessToken);
            setInfo(publicInfo);

            if (!publicInfo.exists) {
                if (!isUserAuth) {
                    const target = window.location.pathname + window.location.search;
                    window.location.href = `/login?redirect=${encodeURIComponent(target)}`;
                    return;
                }
                await attemptTokenJoin();
                return;
            }

            if (publicInfo.status === 'cancelled') {
                setMode('cancelled');
                return;
            }

            if (publicInfo.status === 'ended') {
                setMode('ended');
                return;
            }

            // Scheduled meeting not yet started by host
            if (publicInfo.isScheduled && publicInfo.status === 'scheduled') {
                if (publicInfo.isOwner) {
                    setMode('host_pre_start');
                    return;
                }
                if (publicInfo.joinBeforeHost === false) {
                    setMode('waiting_for_host');
                    if (isPoll) {
                        setLastCheckedText(`Last checked at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
                    }
                    return;
                }
            }

            // Meeting is ACTIVE (host started!) or joinBeforeHost === true
            if (!isUserAuth) {
                setStatusMessage('The host has started the meeting! Redirecting to sign in...');
                const target = window.location.pathname + window.location.search;
                setTimeout(() => {
                    window.location.href = `/login?redirect=${encodeURIComponent(target)}`;
                }, 900);
                return;
            }

            const urlPasscode = new URLSearchParams(window.location.search).get('passcode') || undefined;
            if (publicInfo.passcodeEnabled && !publicInfo.isOwner && !urlPasscode) {
                setMode('passcode_required');
                return;
            }

            await attemptTokenJoin(urlPasscode);
        } catch (err: any) {
            if (!isPoll) {
                setStatusMessage(err.message || 'Could not reach Faceonn meeting server.');
                setMode('error');
            }
        }
    }, [accessToken, attemptTokenJoin, isUserAuth, roomId]);

    // Initial load
    useEffect(() => {
        fetchStatus(false);
    }, [fetchStatus]);

    // Auto-poll every 5 seconds while waiting for the host to start
    useEffect(() => {
        if (mode !== 'waiting_for_host') return;
        const interval = setInterval(() => {
            fetchStatus(true);
        }, 5000);
        return () => clearInterval(interval);
    }, [mode, fetchStatus]);

    // Live 1-second countdown timer
    useEffect(() => {
        if (!info?.scheduledAt) return;
        const update = () => setCountdown(formatCountdown(info.scheduledAt));
        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [info?.scheduledAt]);

    const handleHostStartNow = async () => {
        if (!info?.id || !accessToken) return;
        setSubmitting(true);
        setStatusMessage(null);
        try {
            const res = await authApiClient.startMeeting(info.id, accessToken);
            await enterConferenceWithToken(res.token);
        } catch (err: any) {
            setStatusMessage(err.message || 'Failed to start meeting.');
            setSubmitting(false);
        }
    };

    const handleSubmitPasscode = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = passcode.trim();
        if (!trimmed) {
            setPasscodeError('Please enter the meeting passcode.');
            return;
        }
        setSubmitting(true);
        setPasscodeError(null);
        try {
            await attemptTokenJoin(trimmed);
        } finally {
            setSubmitting(false);
        }
    };

    const handleSignInAsHost = () => {
        const target = window.location.pathname + window.location.search;
        window.location.href = `/login?redirect=${encodeURIComponent(target)}`;
    };

    const handleSwitchAccount = async () => {
        await dispatch(logout());
        const target = window.location.pathname + window.location.search;
        window.location.href = `/login?redirect=${encodeURIComponent(target)}`;
    };

    const handleLeave = () => {
        window.location.href = isUserAuth ? '/dashboard' : '/';
    };

    const effectiveMode: GateMode = mode === 'host_pre_start' && previewParticipantView
        ? 'waiting_for_host'
        : mode;

    return (
        <div className="faceonn-waiting-page">
            {/* Top Navigation Bar */}
            <header className="waiting-topbar">
                <a href={isUserAuth ? '/dashboard' : '/'} className="waiting-brand-link">
                    <img src="images/faceonn-logo.png" alt="Faceonn" className="waiting-brand-logo" />
                </a>

                <div className="waiting-topbar-actions">
                    {isUserAuth ? (
                        <div className="waiting-user-chip">
                            <span className="waiting-user-dot" />
                            <span>{user?.name || user?.email}</span>
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="waiting-btn-outline"
                            onClick={handleSignInAsHost}>
                            Sign In
                        </button>
                    )}
                </div>
            </header>

            {/* Preview Banner when host toggles Participant Preview */}
            {mode === 'host_pre_start' && previewParticipantView && (
                <div className="waiting-preview-banner">
                    <span>👁️ You are previewing what participants see before you start this meeting.</span>
                    <button
                        type="button"
                        className="waiting-preview-exit"
                        onClick={() => setPreviewParticipantView(false)}>
                        Back to Host View
                    </button>
                </div>
            )}

            {/* Main Centered Waiting Card */}
            <main className="waiting-main">
                <div className="waiting-card">
                    {/* Loading / Entering */}
                    {(effectiveMode === 'loading' || effectiveMode === 'entering') && (
                        <div className="waiting-center-state">
                            <div className="waiting-spinner-ring">
                                <div className="waiting-spinner-inner" />
                            </div>
                            <h1>{effectiveMode === 'entering' ? 'Joining Meeting...' : 'Checking Meeting Status...'}</h1>
                            <p className="waiting-subtitle">
                                {effectiveMode === 'entering'
                                    ? 'Connecting you securely to the conference room.'
                                    : 'Verifying schedule and meeting access settings.'}
                            </p>
                        </div>
                    )}

                    {/* Zoom-Style Waiting for Host Screen */}
                    {effectiveMode === 'waiting_for_host' && (
                        <div className="waiting-center-state">
                            <div className="waiting-pulse-orb">
                                <div className="orb-ring" />
                                <div className="orb-core">
                                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" />
                                        <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                </div>
                            </div>

                            <span className="waiting-status-badge waiting">Waiting for Host</span>

                            <h1>Waiting for the host to start this meeting</h1>
                            <p className="waiting-subtitle">
                                {statusMessage || 'Please wait — this page will automatically connect you as soon as the host starts the meeting.'}
                            </p>

                            {/* Meeting Info Card */}
                            {info && (
                                <div className="waiting-details-box">
                                    <div className="waiting-details-header">
                                        <h2>{info.title || 'Scheduled Meeting'}</h2>
                                        {countdown.text && (
                                            <span className={`waiting-countdown-pill ${countdown.isPast ? 'live' : ''}`}>
                                                {countdown.isPast ? '● ' : '⏳ '}
                                                {countdown.text}
                                            </span>
                                        )}
                                    </div>

                                    <div className="waiting-details-grid">
                                        <div className="waiting-detail-item">
                                            <span className="detail-label">Start Time</span>
                                            <span className="detail-value">
                                                {formatScheduledDateTime(info.scheduledAt, info.timezone)}
                                            </span>
                                        </div>

                                        <div className="waiting-detail-item">
                                            <span className="detail-label">Host</span>
                                            <span className="detail-value">{info.hostName || 'Meeting Host'}</span>
                                        </div>

                                        <div className="waiting-detail-item">
                                            <span className="detail-label">Meeting ID</span>
                                            <span className="detail-value mono">{info.roomId}</span>
                                        </div>

                                        <div className="waiting-detail-item">
                                            <span className="detail-label">Duration</span>
                                            <span className="detail-value">{info.durationMinutes || 30} minutes</span>
                                        </div>
                                    </div>

                                    {(info.passcodeEnabled || info.waitingRoomEnabled) && (
                                        <div className="waiting-security-tags">
                                            {info.passcodeEnabled && (
                                                <span className="sec-tag">🔒 Passcode Required</span>
                                            )}
                                            {info.waitingRoomEnabled && (
                                                <span className="sec-tag">🛡️ Waiting Room Enabled</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Live auto-polling indicator */}
                            <div className="waiting-poll-bar">
                                <span className="poll-live-dot" />
                                <span>{lastCheckedText}</span>
                            </div>

                            {/* Actions */}
                            <div className="waiting-actions-row">
                                <button
                                    type="button"
                                    className="waiting-btn-primary"
                                    onClick={() => fetchStatus(true)}>
                                    Check Status Now
                                </button>
                                <button
                                    type="button"
                                    className="waiting-btn-outline"
                                    onClick={handleLeave}>
                                    {isUserAuth ? 'Back to Dashboard' : 'Leave'}
                                </button>
                            </div>

                            {/* Zoom-style Host Sign-In Footer */}
                            {!previewParticipantView && (
                                <div className="waiting-host-footer">
                                    {!isUserAuth ? (
                                        <>
                                            <span>If you are the host, </span>
                                            <button
                                                type="button"
                                                className="waiting-inline-link"
                                                onClick={handleSignInAsHost}>
                                                sign in to start this meeting
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span>Signed in as <strong>{user?.email}</strong>. Are you the host? </span>
                                            <button
                                                type="button"
                                                className="waiting-inline-link"
                                                onClick={handleSwitchAccount}>
                                                Switch Account
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Host Pre-Start Gate (prevents accidentally activating future meeting just by visiting URL) */}
                    {effectiveMode === 'host_pre_start' && info && (
                        <div className="waiting-center-state">
                            <div className="waiting-host-orb">
                                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                </svg>
                            </div>

                            <span className="waiting-status-badge host">👑 You are the Host</span>

                            <h1>This meeting hasn&apos;t started yet</h1>
                            <p className="waiting-subtitle">
                                {info.joinBeforeHost === false
                                    ? 'Participants visiting this link are currently held in the Waiting for Host screen until you start.'
                                    : 'You scheduled this meeting for a future time. Start whenever you are ready.'}
                            </p>

                            {statusMessage && (
                                <div className="waiting-error-inline">⚠️ {statusMessage}</div>
                            )}

                            <div className="waiting-details-box">
                                <div className="waiting-details-header">
                                    <h2>{info.title || 'Scheduled Meeting'}</h2>
                                    {countdown.text && (
                                        <span className={`waiting-countdown-pill ${countdown.isPast ? 'live' : ''}`}>
                                            {countdown.isPast ? '● ' : '⏳ '}
                                            {countdown.text}
                                        </span>
                                    )}
                                </div>

                                <div className="waiting-details-grid">
                                    <div className="waiting-detail-item">
                                        <span className="detail-label">Scheduled Time</span>
                                        <span className="detail-value">
                                            {formatScheduledDateTime(info.scheduledAt, info.timezone)}
                                        </span>
                                    </div>

                                    <div className="waiting-detail-item">
                                        <span className="detail-label">Meeting ID</span>
                                        <span className="detail-value mono">{info.roomId}</span>
                                    </div>

                                    <div className="waiting-detail-item">
                                        <span className="detail-label">Duration</span>
                                        <span className="detail-value">{info.durationMinutes || 30} minutes</span>
                                    </div>

                                    <div className="waiting-detail-item">
                                        <span className="detail-label">Join Before Host</span>
                                        <span className="detail-value">
                                            {info.joinBeforeHost ? 'Allowed' : 'Blocked (Host Required)'}
                                        </span>
                                    </div>
                                </div>

                                {(info.passcodeEnabled || info.waitingRoomEnabled) && (
                                    <div className="waiting-security-tags">
                                        {info.passcodeEnabled && (
                                            <span className="sec-tag">🔒 Passcode Protected</span>
                                        )}
                                        {info.waitingRoomEnabled && (
                                            <span className="sec-tag">🛡️ Waiting Room Enabled</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="waiting-actions-row">
                                <button
                                    type="button"
                                    className="waiting-btn-primary"
                                    disabled={submitting}
                                    onClick={handleHostStartNow}>
                                    {submitting ? 'Starting Meeting...' : 'Start Meeting Now →'}
                                </button>
                                <button
                                    type="button"
                                    className="waiting-btn-outline"
                                    onClick={() => setPreviewParticipantView(true)}>
                                    👁️ Preview Waiting Screen
                                </button>
                                <button
                                    type="button"
                                    className="waiting-btn-ghost"
                                    onClick={handleLeave}>
                                    ← Back to Dashboard
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Passcode Gate */}
                    {effectiveMode === 'passcode_required' && (
                        <div className="waiting-center-state">
                            <div className="waiting-host-orb">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                            </div>

                            <span className="waiting-status-badge waiting">🔒 Passcode Protected</span>

                            <h1>Enter Meeting Passcode</h1>
                            <p className="waiting-subtitle">
                                {info?.title ? `${info.title} • ` : ''}Meeting ID: <strong>{roomId}</strong>
                            </p>

                            <form className="waiting-passcode-form" onSubmit={handleSubmitPasscode}>
                                <div className="passcode-input-group">
                                    <input
                                        type={showPasscode ? 'text' : 'password'}
                                        placeholder="Enter meeting passcode"
                                        value={passcode}
                                        onChange={(e) => {
                                            setPasscode(e.target.value);
                                            if (passcodeError) setPasscodeError(null);
                                        }}
                                        autoFocus
                                        disabled={submitting} />
                                    <button
                                        type="button"
                                        className="passcode-toggle-btn"
                                        onClick={() => setShowPasscode(!showPasscode)}>
                                        {showPasscode ? 'Hide' : 'Show'}
                                    </button>
                                </div>

                                {passcodeError && (
                                    <div className="waiting-error-inline">⚠️ {passcodeError}</div>
                                )}

                                <div className="waiting-actions-row">
                                    <button
                                        type="submit"
                                        className="waiting-btn-primary"
                                        disabled={submitting}>
                                        {submitting ? 'Verifying...' : 'Join Meeting →'}
                                    </button>
                                    <button
                                        type="button"
                                        className="waiting-btn-outline"
                                        onClick={handleLeave}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Cancelled / Ended / Error States */}
                    {(effectiveMode === 'cancelled' || effectiveMode === 'ended' || effectiveMode === 'error') && (
                        <div className="waiting-center-state">
                            <div className="waiting-ended-orb">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="15" y1="9" x2="9" y2="15" />
                                    <line x1="9" y1="9" x2="15" y2="15" />
                                </svg>
                            </div>

                            <h1>
                                {effectiveMode === 'cancelled'
                                    ? 'This meeting has been cancelled'
                                    : effectiveMode === 'ended'
                                        ? 'This meeting has ended'
                                        : 'Unable to join meeting'}
                            </h1>

                            <p className="waiting-subtitle">
                                {effectiveMode === 'cancelled'
                                    ? `The host (${info?.hostName || 'Organizer'}) cancelled "${info?.title || roomId}".`
                                    : effectiveMode === 'ended'
                                        ? `"${info?.title || roomId}" is no longer active.`
                                        : (statusMessage || 'Something went wrong while accessing this meeting.')}
                            </p>

                            <div className="waiting-actions-row">
                                <button
                                    type="button"
                                    className="waiting-btn-primary"
                                    onClick={handleLeave}>
                                    {isUserAuth ? 'Back to Dashboard' : 'Go to Home'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
