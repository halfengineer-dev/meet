/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles, @stylistic/max-statements-per-line */
import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IReduxState } from '../../app/types';
import { createMeeting, logout } from '../actions';
import { getAuthUser, getAccessToken, isAdminUser } from '../functions';
import { authApiClient } from '../api';
import { IMeeting, IScheduleMeetingResponse } from '../types';
import { getRelativeMeetingTime, formatMeetingInvitationText } from '../utils/calendar';
import AdminOnboardingView from './AdminOnboardingView.web';
import ScheduleMeetingView from './ScheduleMeetingView.web';
import ScheduleConfirmationView from './ScheduleConfirmationView.web';
import MeetingDetailsView from './MeetingDetailsView.web';
import EditMeetingView from './EditMeetingView.web';
import PasscodePromptModal from './PasscodePromptModal.web';

export default function DashboardPage() {
    const dispatch = useDispatch();
    const user = useSelector((state: IReduxState) => getAuthUser(state));
    const accessToken = useSelector((state: IReduxState) => getAccessToken(state));
    const isAdmin = useSelector((state: IReduxState) => isAdminUser(state));

    const [activeTab, setActiveTab] = useState<'home' | 'meetings' | 'recordings' | 'users' | 'settings' | 'profile'>('home');
    const [meetingsSubTab, setMeetingsSubTab] = useState<'upcoming' | 'previous' | 'personal'>('upcoming');
    const [meetingsViewMode, setMeetingsViewMode] = useState<'list' | 'schedule' | 'confirmation' | 'details' | 'edit'>('list');
    const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
    const [scheduleResult, setScheduleResult] = useState<IScheduleMeetingResponse | null>(null);

    const [joinInput, setJoinInput] = useState('');
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [showProModal, setShowProModal] = useState(false);
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const [showNewMeetingDropdown, setShowNewMeetingDropdown] = useState(false);
    const [showMeetingsTabDropdown, setShowMeetingsTabDropdown] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // Meetings list state
    const [upcomingMeetings, setUpcomingMeetings] = useState<IMeeting[]>([]);
    const [pastMeetings, setPastMeetings] = useState<IMeeting[]>([]);
    const [loadingUpcoming, setLoadingUpcoming] = useState(false);
    const [loadingPast, setLoadingPast] = useState(false);

    // Cancel modal state from list
    const [meetingToCancel, setMeetingToCancel] = useState<IMeeting | null>(null);
    const [cancelScope, setCancelScope] = useState<'occurrence' | 'series'>('occurrence');
    const [cancelling, setCancelling] = useState(false);

    // Passcode modal state
    const [passcodeModalRoom, setPasscodeModalRoom] = useState<string | null>(null);
    const [passcodeModalError, setPasscodeModalError] = useState<string | null>(null);

    // Copy toast indicator
    const [copiedMeetingId, setCopiedMeetingId] = useState<string | null>(null);

    // Dark/Light theme toggle
    const [theme, setTheme] = useState<'light' | 'dark'>('light');

    // Parse URL error if redirected from meeting room
    const [urlBannerError, setUrlBannerError] = useState<string | null>(null);

    useEffect(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            const err = params.get('error');
            if (err) {
                setUrlBannerError(decodeURIComponent(err));
                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } catch (_) {}
    }, []);

    useEffect(() => {
        document.documentElement.classList.add('faceonn-dash-html');
        document.body.classList.add('faceonn-dash-body');
        document.title = 'Faceonn — Dashboard';

        if (theme === 'dark') {
            document.documentElement.classList.add('theme-dark');
            document.body.classList.add('theme-dark');
        } else {
            document.documentElement.classList.remove('theme-dark');
            document.body.classList.remove('theme-dark');
        }

        return () => {
            document.documentElement.classList.remove('faceonn-dash-html', 'theme-dark');
            document.body.classList.remove('faceonn-dash-body', 'theme-dark');
        };
    }, [theme]);

    const fetchUpcomingMeetings = () => {
        if (!accessToken) return;
        setLoadingUpcoming(true);
        authApiClient
            .getUpcomingMeetings(accessToken)
            .then(data => {
                if (data && data.meetings) {
                    setUpcomingMeetings(data.meetings);
                }
            })
            .catch(() => {})
            .finally(() => setLoadingUpcoming(false));
    };

    const fetchPastMeetings = () => {
        if (!accessToken) return;
        setLoadingPast(true);
        authApiClient
            .getPastMeetings(accessToken)
            .then(data => {
                if (data && data.meetings) {
                    setPastMeetings(data.meetings);
                }
            })
            .catch(() => {})
            .finally(() => setLoadingPast(false));
    };

    useEffect(() => {
        if (accessToken) {
            fetchUpcomingMeetings();
            fetchPastMeetings();
        }
    }, [accessToken]);

    const handleCreateMeeting = async () => {
        setIsCreating(true);
        setCreateError(null);
        try {
            await dispatch(createMeeting('Faceonn Instant Meeting') as any);
        } catch (err: any) {
            setCreateError(err.message || 'Failed to create meeting');
            setIsCreating(false);
        }
    };

    const handleJoinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const input = joinInput.trim();
        if (!input) return;

        let room = input;
        try {
            if (input.includes('/')) {
                const url = new URL(input.startsWith('http') ? input : `https://${input}`);
                room = url.pathname.replace(/^\/+/, '');
            }
        } catch (_) {}

        window.location.href = `/${encodeURIComponent(room)}`;
    };

    const handleCopyMeetingLink = (roomId: string, id: string) => {
        const link = `${window.location.origin}/${roomId}`;
        navigator.clipboard.writeText(link);
        setCopiedMeetingId(id);
        setTimeout(() => setCopiedMeetingId(null), 2000);
    };

    const handleCopyMeetingInvite = (meeting: IMeeting) => {
        const text = formatMeetingInvitationText(meeting, user?.name, window.location.origin);
        navigator.clipboard.writeText(text);
        setCopiedMeetingId(`invite-${meeting.id}`);
        setTimeout(() => setCopiedMeetingId(null), 2000);
    };

    const handleStartOrJoinMeeting = async (meeting: IMeeting) => {
        if (accessToken && meeting.ownerId === user?.id && meeting.isScheduled && meeting.status === 'scheduled') {
            try {
                await authApiClient.startMeeting(meeting.id, accessToken);
            } catch (_) {
                // Fall through to room page which handles state cleanly
            }
        }
        window.location.href = `/${meeting.roomId}`;
    };

    const handleConfirmCancelFromList = async () => {
        if (!meetingToCancel || !accessToken) return;
        setCancelling(true);
        try {
            await authApiClient.cancelMeeting(meetingToCancel.id, accessToken, cancelScope);
            setMeetingToCancel(null);
            fetchUpcomingMeetings();
            fetchPastMeetings();
        } catch (err: any) {
            alert(err.message || 'Failed to cancel meeting');
        } finally {
            setCancelling(false);
        }
    };

    const handleOpenSchedule = () => {
        setActiveTab('meetings');
        setMeetingsViewMode('schedule');
    };

    const handleLogout = () => {
        dispatch(logout() as any);
    };

    // User display calculations
    const displayName = user?.name || user?.email?.split('@')[0] || 'User';

    const getInitials = (name?: string | null) => {
        if (!name) return 'U';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    };

    const userInitials = getInitials(displayName);
    const pmi = user?.pmi || (user?.id ? `pmi-${user.id.slice(0, 8)}` : 'my-personal-room');

    return (
        <div className={`faceonn-dash-layout theme-${theme}`}>
            {/* Top-right ambient background glow waves */}
            <div className="faceonn-dash-ambient-wave wave-blue" />
            <div className="faceonn-dash-ambient-wave wave-purple" />

            {/* Left Sidebar */}
            <aside className="faceonn-dash-sidebar">
                <div className="faceonn-dash-sidebar-top">
                    {/* Faceonn Brand Logo */}
                    <a href="/dashboard" className="faceonn-dash-brand">
                        <img src="images/faceonn-neon-logo.png" alt="Faceonn" className="faceonn-dash-logo-img" />
                    </a>

                    {/* Navigation Menu */}
                    <nav className="faceonn-dash-nav">
                        <button
                            type="button"
                            className={`faceonn-dash-nav-item ${activeTab === 'home' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveTab('home');
                                setMeetingsViewMode('list');
                            }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill={activeTab === 'home' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                <polyline points="9 22 9 12 15 12 15 22" />
                            </svg>
                            <span>Home</span>
                        </button>

                        <button
                            type="button"
                            className={`faceonn-dash-nav-item ${activeTab === 'meetings' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveTab('meetings');
                                setMeetingsViewMode('list');
                            }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span>Meetings</span>
                        </button>

                        <button
                            type="button"
                            className={`faceonn-dash-nav-item ${activeTab === 'recordings' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveTab('recordings');
                                setMeetingsViewMode('list');
                            }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
                            </svg>
                            <span>Recordings</span>
                        </button>

                        {isAdmin && (
                            <button
                                type="button"
                                className={`faceonn-dash-nav-item ${activeTab === 'users' ? 'active' : ''}`}
                                onClick={() => {
                                    setActiveTab('users');
                                    setMeetingsViewMode('list');
                                }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                    <circle cx="8.5" cy="7" r="4" />
                                    <line x1="20" y1="8" x2="20" y2="14" />
                                    <line x1="23" y1="11" x2="17" y2="11" />
                                </svg>
                                <span>Onboard Users</span>
                            </button>
                        )}

                        <button
                            type="button"
                            className={`faceonn-dash-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveTab('settings');
                                setMeetingsViewMode('list');
                            }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                            <span>Settings</span>
                        </button>

                        <button
                            type="button"
                            className={`faceonn-dash-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
                            onClick={() => {
                                setActiveTab('profile');
                                setMeetingsViewMode('list');
                            }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                            <span>Profile</span>
                        </button>
                    </nav>
                </div>

                <div className="faceonn-dash-sidebar-bottom">
                    {/* Upgrade to Pro Card */}
                    <div className="faceonn-dash-pro-card">
                        <div className="faceonn-dash-pro-rocket">
                            <img src="images/footer-rocket.png" alt="Pro" className="faceonn-dash-rocket-img" />
                        </div>
                        <h4>Upgrade to Pro</h4>
                        <p>Unlock advanced features for your meetings.</p>
                        <button
                            type="button"
                            className="faceonn-dash-btn-pro"
                            onClick={() => setShowProModal(true)}>
                            Go Pro →
                        </button>
                    </div>

                    {/* Dark/Light mode toggle */}
                    <div className="faceonn-dash-theme-toggle">
                        <button
                            type="button"
                            className={`theme-pill-btn ${theme === 'light' ? 'active' : ''}`}
                            onClick={() => setTheme('light')}
                            aria-label="Light mode">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="5" />
                                <line x1="12" y1="1" x2="12" y2="3" />
                                <line x1="12" y1="21" x2="12" y2="23" />
                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                                <line x1="1" y1="12" x2="3" y2="12" />
                                <line x1="21" y1="12" x2="23" y2="12" />
                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className={`theme-pill-btn ${theme === 'dark' ? 'active' : ''}`}
                            onClick={() => setTheme('dark')}
                            aria-label="Dark mode">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Area */}
            <main className="faceonn-dash-main">
                {/* Top Header */}
                <header className="faceonn-dash-topbar">
                    <div className="faceonn-dash-topbar-right">
                        {/* Notification Bell */}
                        <button
                            type="button"
                            className="faceonn-dash-bell-btn"
                            aria-label="Notifications"
                            onClick={() => alert('No new notifications')}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                            </svg>
                            <span className="bell-badge-dot" />
                        </button>

                        {/* User Profile Pill */}
                        <div className="faceonn-dash-user-dropdown-wrapper">
                            <button
                                type="button"
                                className="faceonn-dash-user-pill"
                                onClick={() => setShowUserDropdown(!showUserDropdown)}>
                                <span className="faceonn-dash-user-avatar">{userInitials}</span>
                                <span className="faceonn-dash-user-name">{displayName}</span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="chevron-icon">
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </button>

                            {/* Dropdown Menu */}
                            {showUserDropdown && (
                                <div className="faceonn-dash-menu-dropdown" onClick={() => setShowUserDropdown(false)}>
                                    <div className="faceonn-dash-menu-header">
                                        <div className="menu-header-name">{displayName}</div>
                                        <div className="menu-header-email">{user?.email}</div>
                                    </div>
                                    <button
                                        type="button"
                                        className="faceonn-dash-menu-item"
                                        onClick={() => setActiveTab('profile')}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                            <circle cx="12" cy="7" r="4" />
                                        </svg>
                                        My Profile
                                    </button>
                                    <button
                                        type="button"
                                        className="faceonn-dash-menu-item"
                                        onClick={() => setActiveTab('settings')}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="3" />
                                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                        </svg>
                                        Settings
                                    </button>
                                    <button
                                        type="button"
                                        className="faceonn-dash-menu-item logout"
                                        onClick={handleLogout}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                            <polyline points="16 17 21 12 16 7" />
                                            <line x1="21" y1="12" x2="9" y2="12" />
                                        </svg>
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {urlBannerError && (
                    <div className="schedule-error-banner" style={{ margin: '20px 32px 0 32px' }}>
                        <span>⚠️ {urlBannerError}</span>
                    </div>
                )}

                {/* Tab: Home */}
                {activeTab === 'home' && (
                    <div className="faceonn-dash-body">
                        {/* Welcome Hero */}
                        <div className="faceonn-dash-welcome">
                            <h1>Welcome back, {displayName} 👋</h1>
                            <p>Host meetings, connect with your team, and collaborate seamlessly.</p>
                        </div>

                        {createError && (
                            <div className="dash-error-toast" style={{ marginBottom: '20px' }}>
                                <span>{createError}</span>
                            </div>
                        )}

                        {/* Top Action Cards: New Meeting & Join Meeting */}
                        <div className="faceonn-dash-actions-grid">
                            {/* Card 1: New Meeting */}
                            <div className="faceonn-dash-card new-meeting-card">
                                <div className="card-left-content">
                                    <div className="card-badge-icon blue">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                        </svg>
                                    </div>
                                    <h2>New Meeting</h2>
                                    <p>Start an instant meeting or schedule for later</p>
                                    <div className="new-meeting-dropdown-wrap">
                                        <button
                                            type="button"
                                            className="faceonn-dash-btn-action blue"
                                            onClick={() => setShowNewMeetingDropdown(!showNewMeetingDropdown)}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                            </svg>
                                            <span>+ New Meeting ▾</span>
                                        </button>

                                        {showNewMeetingDropdown && (
                                            <div className="new-meeting-menu">
                                                <button
                                                    type="button"
                                                    className="meeting-menu-item"
                                                    onClick={() => {
                                                        setShowNewMeetingDropdown(false);
                                                        handleOpenSchedule();
                                                    }}>
                                                    <span className="menu-item-icon">📅</span>
                                                    <div className="menu-item-text">
                                                        <strong>Schedule a Meeting</strong>
                                                        <span>Plan ahead and send calendar invites</span>
                                                    </div>
                                                </button>
                                                <div className="meeting-menu-divider" />
                                                <button
                                                    type="button"
                                                    className="meeting-menu-item"
                                                    disabled={isCreating}
                                                    onClick={() => {
                                                        setShowNewMeetingDropdown(false);
                                                        handleCreateMeeting();
                                                    }}>
                                                    <span className="menu-item-icon">⚡</span>
                                                    <div className="menu-item-text">
                                                        <strong>Start Instant Meeting</strong>
                                                        <span>{isCreating ? 'Creating Room...' : 'Start a meeting right now'}</span>
                                                    </div>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="card-right-visual">
                                    <img
                                        src="images/feature-camera.png"
                                        alt="New Meeting"
                                        className="card-3d-asset camera-glow" />
                                </div>
                            </div>

                            {/* Card 2: Join Meeting */}
                            <div className="faceonn-dash-card join-meeting-card">
                                <div className="card-left-content">
                                    <div className="card-badge-icon purple">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                        </svg>
                                    </div>
                                    <h2>Join Meeting</h2>
                                    <p>Enter a meeting link or ID</p>
                                    <button
                                        type="button"
                                        className="faceonn-dash-btn-action purple"
                                        onClick={() => setShowJoinModal(true)}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                            <polyline points="10 17 15 12 10 7" />
                                            <line x1="15" y1="12" x2="3" y2="12" />
                                        </svg>
                                        Join via Link →
                                    </button>
                                </div>
                                <div className="card-right-visual">
                                    <img
                                        src="images/feature-screen-share.png"
                                        alt="Join Meeting"
                                        className="card-3d-asset window-glow" />
                                </div>
                            </div>
                        </div>

                        {/* Bottom Grid: Upcoming Meetings & Recent Activity */}
                        <div className="faceonn-dash-bottom-grid">
                            {/* Card 3: Upcoming Meetings */}
                            <div className="faceonn-dash-card-white upcoming-meetings-card">
                                <div className="dash-card-header">
                                    <div className="dash-card-title">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2">
                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                            <line x1="16" y1="2" x2="16" y2="6" />
                                            <line x1="8" y1="2" x2="8" y2="6" />
                                            <line x1="3" y1="10" x2="21" y2="10" />
                                        </svg>
                                        <h3>Upcoming Meetings</h3>
                                    </div>
                                    <button
                                        type="button"
                                        className="dash-link-action"
                                        onClick={() => {
                                            setActiveTab('meetings');
                                            setMeetingsViewMode('list');
                                        }}>
                                        View All →
                                    </button>
                                </div>

                                <div className="dash-upcoming-body">
                                    {loadingUpcoming ? (
                                        <p style={{ color: '#64748b' }}>Loading scheduled meetings...</p>
                                    ) : upcomingMeetings.length === 0 ? (
                                        <div className="dash-empty-state">
                                            <div className="empty-state-visual">
                                                <img
                                                    src="images/feature-calendar.png"
                                                    alt="Calendar"
                                                    className="empty-state-calendar-img" />
                                            </div>
                                            <h4>No upcoming meetings</h4>
                                            <p>Schedule a meeting to get started.</p>
                                            <button
                                                type="button"
                                                className="faceonn-dash-btn-outline"
                                                onClick={handleOpenSchedule}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                                    <line x1="16" y1="2" x2="16" y2="6" />
                                                    <line x1="8" y1="2" x2="8" y2="6" />
                                                    <line x1="3" y1="10" x2="21" y2="10" />
                                                </svg>
                                                Schedule Meeting
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="dash-meeting-items-list">
                                            {upcomingMeetings.slice(0, 3).map((m) => {
                                                const rel = getRelativeMeetingTime(m.scheduledAt, m.timezone);
                                                return (
                                                    <div key={m.id} className="dash-meeting-item-row">
                                                        <div className="meeting-row-icon">
                                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                                                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                                            </svg>
                                                        </div>
                                                        <div className="meeting-row-info">
                                                            <div className="meeting-row-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span>{m.title}</span>
                                                                <span className={`time-pill ${rel.badgeClass}`}>{rel.label}</span>
                                                            </div>
                                                            <div className="meeting-row-room">
                                                                Room: {m.roomId} • {m.durationMinutes} mins
                                                                {m.hasPasscode && ' • 🔒 Passcode'}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="meeting-row-btn"
                                                            onClick={() => handleStartOrJoinMeeting(m)}>
                                                            Start →
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Card 4: Recent Activity */}
                            <div className="faceonn-dash-card-white recent-activity-card">
                                <div className="dash-card-header">
                                    <div className="dash-card-title">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#0f172a">
                                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                        </svg>
                                        <h3>Recent Activity</h3>
                                    </div>
                                </div>

                                <div className="dash-activity-timeline">
                                    <div className="dash-timeline-item">
                                        <div className="timeline-node blue">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                            </svg>
                                        </div>
                                        <div className="timeline-content">
                                            <div className="timeline-main">
                                                <div className="timeline-title">Conferencing Ready</div>
                                                <div className="timeline-sub">HD audio & video encryption active</div>
                                            </div>
                                            <div className="timeline-time">Live</div>
                                        </div>
                                    </div>

                                    <div className="dash-timeline-item">
                                        <div className="timeline-node green">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                                <line x1="16" y1="2" x2="16" y2="6" />
                                                <line x1="8" y1="2" x2="8" y2="6" />
                                                <line x1="3" y1="10" x2="21" y2="10" />
                                            </svg>
                                        </div>
                                        <div className="timeline-content">
                                            <div className="timeline-main">
                                                <div className="timeline-title">Scheduler Enabled</div>
                                                <div className="timeline-sub">Google, Outlook & .ics calendar sync active</div>
                                            </div>
                                            <div className="timeline-time">Today</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: Meetings */}
                {activeTab === 'meetings' && (
                    <div className="faceonn-dash-body">
                        {meetingsViewMode === 'schedule' && (
                            <ScheduleMeetingView
                                onBack={() => setMeetingsViewMode('list')}
                                onScheduled={(res) => {
                                    setScheduleResult(res);
                                    setMeetingsViewMode('confirmation');
                                    fetchUpcomingMeetings();
                                }} />
                        )}

                        {meetingsViewMode === 'confirmation' && scheduleResult && (
                            <ScheduleConfirmationView
                                result={scheduleResult}
                                onViewDetails={(id) => {
                                    setSelectedMeetingId(id);
                                    setMeetingsViewMode('details');
                                }}
                                onBackToMeetings={() => setMeetingsViewMode('list')} />
                        )}

                        {meetingsViewMode === 'details' && selectedMeetingId && (
                            <MeetingDetailsView
                                meetingId={selectedMeetingId}
                                onBack={() => setMeetingsViewMode('list')}
                                onEdit={(id) => {
                                    setSelectedMeetingId(id);
                                    setMeetingsViewMode('edit');
                                }}
                                onCancelled={() => {
                                    setMeetingsViewMode('list');
                                    fetchUpcomingMeetings();
                                    fetchPastMeetings();
                                }} />
                        )}

                        {meetingsViewMode === 'edit' && selectedMeetingId && (
                            <EditMeetingView
                                meetingId={selectedMeetingId}
                                onBack={() => setMeetingsViewMode('details')}
                                onUpdated={() => {
                                    setMeetingsViewMode('details');
                                    fetchUpcomingMeetings();
                                }} />
                        )}

                        {meetingsViewMode === 'list' && (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
                                    <div className="faceonn-dash-welcome" style={{ margin: 0 }}>
                                        <h1>Meetings</h1>
                                        <p>Manage and access all your hosted and scheduled meetings.</p>
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <button
                                            type="button"
                                            className="faceonn-dash-btn-action blue"
                                            onClick={handleOpenSchedule}>
                                            📅 Schedule a Meeting
                                        </button>

                                        <div className="new-meeting-dropdown-wrap">
                                            <button
                                                type="button"
                                                className="faceonn-dash-btn-secondary"
                                                onClick={() => setShowMeetingsTabDropdown(!showMeetingsTabDropdown)}>
                                                + New Meeting ▾
                                            </button>

                                            {showMeetingsTabDropdown && (
                                                <div className="new-meeting-menu" style={{ right: 0, left: 'auto' }}>
                                                    <button
                                                        type="button"
                                                        className="meeting-menu-item"
                                                        onClick={() => {
                                                            setShowMeetingsTabDropdown(false);
                                                            handleOpenSchedule();
                                                        }}>
                                                        <span className="menu-item-icon">📅</span>
                                                        <div className="menu-item-text">
                                                            <strong>Schedule a Meeting</strong>
                                                            <span>Plan ahead and send calendar invites</span>
                                                        </div>
                                                    </button>
                                                    <div className="meeting-menu-divider" />
                                                    <button
                                                        type="button"
                                                        className="meeting-menu-item"
                                                        disabled={isCreating}
                                                        onClick={() => {
                                                            setShowMeetingsTabDropdown(false);
                                                            handleCreateMeeting();
                                                        }}>
                                                        <span className="menu-item-icon">⚡</span>
                                                        <div className="menu-item-text">
                                                            <strong>Start Instant Meeting</strong>
                                                            <span>{isCreating ? 'Creating Room...' : 'Start a meeting right now'}</span>
                                                        </div>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Sub Tabs Navigation */}
                                <div className="faceonn-sub-tabs">
                                    <button
                                        type="button"
                                        className={`sub-tab-btn ${meetingsSubTab === 'upcoming' ? 'active' : ''}`}
                                        onClick={() => setMeetingsSubTab('upcoming')}>
                                        Upcoming Meetings ({upcomingMeetings.length})
                                    </button>
                                    <button
                                        type="button"
                                        className={`sub-tab-btn ${meetingsSubTab === 'previous' ? 'active' : ''}`}
                                        onClick={() => setMeetingsSubTab('previous')}>
                                        Previous Meetings ({pastMeetings.length})
                                    </button>
                                    <button
                                        type="button"
                                        className={`sub-tab-btn ${meetingsSubTab === 'personal' ? 'active' : ''}`}
                                        onClick={() => setMeetingsSubTab('personal')}>
                                        Personal Meeting Room (PMI)
                                    </button>
                                </div>

                                {/* Sub-Tab 1: Upcoming Meetings */}
                                {meetingsSubTab === 'upcoming' && (
                                    <div className="faceonn-dash-card-white" style={{ padding: '24px' }}>
                                        {loadingUpcoming ? (
                                            <p style={{ color: '#64748b' }}>Loading upcoming meetings...</p>
                                        ) : upcomingMeetings.length === 0 ? (
                                            <div className="dash-empty-state" style={{ padding: '40px 0' }}>
                                                <img src="images/feature-calendar.png" alt="Calendar" className="empty-state-calendar-img" />
                                                <h4>No upcoming meetings</h4>
                                                <p>Schedule a new meeting to invite colleagues or plan ahead.</p>
                                                <button
                                                    type="button"
                                                    className="faceonn-dash-btn-action blue"
                                                    style={{ marginTop: '16px' }}
                                                    onClick={handleOpenSchedule}>
                                                    Schedule a Meeting Now
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                                {upcomingMeetings.map((m) => {
                                                    const rel = getRelativeMeetingTime(m.scheduledAt, m.timezone);
                                                    const dateObj = m.scheduledAt ? new Date(m.scheduledAt) : new Date(m.createdAt);
                                                    const monthStr = dateObj.toLocaleString('en-US', { month: 'short' });
                                                    const dayStr = dateObj.getDate();

                                                    return (
                                                        <div key={m.id} className="dash-rich-meeting-card">
                                                            <div className="meeting-card-left">
                                                                <div className="card-calendar-badge">
                                                                    <span className="badge-month">{monthStr}</span>
                                                                    <span className="badge-day">{dayStr}</span>
                                                                </div>

                                                                <div className="card-text-info">
                                                                    <div className="card-title-row">
                                                                        <h4 onClick={() => {
                                                                            setSelectedMeetingId(m.id);
                                                                            setMeetingsViewMode('details');
                                                                        }}>
                                                                            {m.title}
                                                                        </h4>
                                                                        <span className={`time-pill ${rel.badgeClass}`}>{rel.label}</span>
                                                                        {m.hasPasscode && <span className="summary-badge">🔒 Passcode</span>}
                                                                        {m.recurrenceRule && <span className="summary-badge">🔁 Recurring</span>}
                                                                    </div>

                                                                    <div className="card-meta-row">
                                                                        <span className="meta-time">
                                                                            {dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} • {m.durationMinutes} min
                                                                        </span>
                                                                        <span className="meta-id">ID: {m.roomId}</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="meeting-card-right">
                                                                <button
                                                                    type="button"
                                                                    className="schedule-btn-action blue"
                                                                    onClick={() => handleStartOrJoinMeeting(m)}>
                                                                    Start
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="schedule-btn-secondary"
                                                                    onClick={() => handleCopyMeetingLink(m.roomId, m.id)}>
                                                                    {copiedMeetingId === m.id ? '✓ Copied' : 'Copy Link'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="schedule-btn-secondary"
                                                                    onClick={() => {
                                                                        setSelectedMeetingId(m.id);
                                                                        setMeetingsViewMode('details');
                                                                    }}>
                                                                    Details
                                                                </button>
                                                                {m.ownerId === user?.id && (
                                                                    <button
                                                                        type="button"
                                                                        className="schedule-btn-secondary"
                                                                        onClick={() => {
                                                                            setSelectedMeetingId(m.id);
                                                                            setMeetingsViewMode('edit');
                                                                        }}>
                                                                        Edit
                                                                    </button>
                                                                )}
                                                                {m.ownerId === user?.id && (
                                                                    <button
                                                                        type="button"
                                                                        className="schedule-btn-danger"
                                                                        onClick={() => setMeetingToCancel(m)}>
                                                                        Cancel
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Sub-Tab 2: Previous Meetings */}
                                {meetingsSubTab === 'previous' && (
                                    <div className="faceonn-dash-card-white" style={{ padding: '24px' }}>
                                        {loadingPast ? (
                                            <p style={{ color: '#64748b' }}>Loading historical meetings...</p>
                                        ) : pastMeetings.length === 0 ? (
                                            <div className="dash-empty-state" style={{ padding: '40px 0' }}>
                                                <h4>No previous meetings</h4>
                                                <p>Completed and cancelled meetings will appear in your history.</p>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                {pastMeetings.map((m) => (
                                                    <div key={m.id} className="dash-rich-meeting-card">
                                                        <div className="meeting-card-left">
                                                            <div className="card-text-info">
                                                                <div className="card-title-row">
                                                                    <h4>{m.title}</h4>
                                                                    <span className={`status-pill ${m.status}`}>{m.status.toUpperCase()}</span>
                                                                </div>
                                                                <div className="card-meta-row">
                                                                    <span>
                                                                        {m.scheduledAt
                                                                            ? new Date(m.scheduledAt).toLocaleString()
                                                                            : new Date(m.createdAt).toLocaleString()}
                                                                    </span>
                                                                    <span className="meta-id">ID: {m.roomId}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="meeting-card-right">
                                                            <button
                                                                type="button"
                                                                className="schedule-btn-secondary"
                                                                onClick={() => {
                                                                    setSelectedMeetingId(m.id);
                                                                    setMeetingsViewMode('details');
                                                                }}>
                                                                View Details
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Sub-Tab 3: Personal Meeting Room */}
                                {meetingsSubTab === 'personal' && (
                                    <div className="faceonn-dash-card-white" style={{ padding: '32px' }}>
                                        <h3 style={{ margin: '0 0 10px 0' }}>Personal Meeting Room (PMI)</h3>
                                        <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 24px 0' }}>
                                            Your personal meeting room is your permanent virtual office space that is always
                                            reserved with your unique ID.
                                        </p>

                                        <div className="confirm-details-box" style={{ maxWidth: '540px' }}>
                                            <div className="confirm-detail-row">
                                                <span className="detail-key">PMI ID:</span>
                                                <span className="detail-val mono">{pmi}</span>
                                            </div>
                                            <div className="confirm-detail-row">
                                                <span className="detail-key">Personal Link:</span>
                                                <span className="detail-val mono">{window.location.origin}/{pmi}</span>
                                            </div>
                                            <div className="confirm-detail-row">
                                                <span className="detail-key">Host:</span>
                                                <span className="detail-val bold">{displayName}</span>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                                            <button
                                                type="button"
                                                className="faceonn-dash-btn-action blue"
                                                onClick={() => window.location.href = `/${pmi}`}>
                                                Start Personal Room →
                                            </button>
                                            <button
                                                type="button"
                                                className="schedule-btn-secondary"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(`${window.location.origin}/${pmi}`);
                                                    alert('Personal meeting link copied to clipboard!');
                                                }}>
                                                Copy Personal Link
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Tab: Recordings */}
                {activeTab === 'recordings' && (
                    <div className="faceonn-dash-body">
                        <div className="faceonn-dash-welcome">
                            <h1>Cloud Recordings</h1>
                            <p>Access and download video recordings of your completed meetings.</p>
                        </div>
                        <div className="faceonn-dash-card-white" style={{ padding: '60px 24px', textAlign: 'center' }}>
                            <div className="empty-state-visual">
                                <img src="images/feature-cloud-sync.png" alt="Recordings" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
                            </div>
                            <h4 style={{ fontSize: '18px', fontWeight: 700, margin: '16px 0 6px 0' }}>No recordings available</h4>
                            <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '400px', margin: '0 auto 20px' }}>
                                Cloud recordings enabled during calls will automatically appear here once finalized.
                            </p>
                        </div>
                    </div>
                )}

                {/* Tab: Admin Participant Onboarding */}
                {activeTab === 'users' && isAdmin && (
                    <AdminOnboardingView />
                )}

                {/* Tab: Settings */}
                {activeTab === 'settings' && (
                    <div className="faceonn-dash-body">
                        <div className="faceonn-dash-welcome">
                            <h1>Settings</h1>
                            <p>Manage your account preferences, audio/video devices, and conferencing security.</p>
                        </div>
                        <div className="faceonn-dash-card-white" style={{ padding: '32px' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700 }}>Conferencing Preferences</h3>
                            <div className="settings-pills-wrap">
                                <div className="settings-pill-box">
                                    <span className="pill-title">Audio Device</span>
                                    <span className="pill-value">Default Microphone</span>
                                </div>
                                <div className="settings-pill-box">
                                    <span className="pill-title">Video Quality</span>
                                    <span className="pill-value">HD (1080p)</span>
                                </div>
                                <div className="settings-pill-box">
                                    <span className="pill-title">Noise Suppression</span>
                                    <span className="pill-value">AI Active</span>
                                </div>
                                <div className="settings-pill-box">
                                    <span className="pill-title">Default Timezone</span>
                                    <span className="pill-value">{Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: Profile */}
                {activeTab === 'profile' && (
                    <div className="faceonn-dash-body">
                        <div className="faceonn-dash-welcome">
                            <h1>Account Profile</h1>
                            <p>Manage your personal profile information and authentication security.</p>
                        </div>
                        <div className="faceonn-dash-card-white" style={{ padding: '32px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px' }}>
                                <div className="profile-large-avatar">{userInitials}</div>
                                <div>
                                    <h2 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 800 }}>{user?.name || 'Faceonn User'}</h2>
                                    <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>{user?.email}</p>
                                </div>
                            </div>
                            <div className="profile-details-grid">
                                <div className="profile-detail-card">
                                    <span className="profile-detail-label">Account Status</span>
                                    <span className="profile-detail-val" style={{ color: '#10b981', fontWeight: 700 }}>Active</span>
                                </div>
                                <div className="profile-detail-card">
                                    <span className="profile-detail-label">Personal Meeting ID (PMI)</span>
                                    <span className="profile-detail-val mono">{pmi}</span>
                                </div>
                                <div className="profile-detail-card">
                                    <span className="profile-detail-label">Account Role</span>
                                    <span className="profile-detail-val" style={{ color: isAdmin ? '#7c3aed' : '#0284c7', fontWeight: 700 }}>
                                        {isAdmin ? 'Administrator' : 'Participant'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Join Meeting Modal */}
                {showJoinModal && (
                    <div className="faceonn-dash-modal-overlay" onClick={() => setShowJoinModal(false)}>
                        <div className="faceonn-dash-modal-card" onClick={e => e.stopPropagation()}>
                            <div className="faceonn-dash-modal-header">
                                <div className="modal-title-with-badge">
                                    <div className="modal-badge-icon purple">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                        </svg>
                                    </div>
                                    <h3>Join a Meeting</h3>
                                </div>
                                <button
                                    type="button"
                                    className="dash-modal-close"
                                    onClick={() => setShowJoinModal(false)}>
                                    ✕
                                </button>
                            </div>
                            <p className="dash-modal-desc">
                                Enter the meeting room name, ID, or full invitation link to join.
                            </p>

                            <form onSubmit={handleJoinSubmit} className="faceonn-dash-modal-form">
                                <div className="faceonn-dash-input-group">
                                    <label>Meeting Link or Room ID</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. daily-standup or faceonn.com/daily-standup"
                                        value={joinInput}
                                        onChange={e => setJoinInput(e.target.value)}
                                        autoFocus
                                        required />
                                </div>

                                <div className="dash-modal-actions">
                                    <button
                                        type="button"
                                        className="faceonn-dash-btn-cancel"
                                        onClick={() => setShowJoinModal(false)}>
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="faceonn-dash-btn-action purple"
                                        disabled={!joinInput.trim()}>
                                        Join Room →
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Cancellation Confirmation Modal */}
                {meetingToCancel && (
                    <div className="faceonn-dash-modal-overlay" onClick={() => setMeetingToCancel(null)}>
                        <div className="faceonn-dash-modal-card" onClick={e => e.stopPropagation()}>
                            <div className="faceonn-dash-modal-header">
                                <h3>Cancel Meeting</h3>
                                <button
                                    type="button"
                                    className="dash-modal-close"
                                    onClick={() => setMeetingToCancel(null)}>
                                    ✕
                                </button>
                            </div>

                            <p className="dash-modal-desc">
                                Are you sure you want to cancel <strong>{meetingToCancel.title}</strong>? Participants will no longer be able to join using this meeting invitation.
                            </p>

                            {meetingToCancel.recurrenceSeriesId && (
                                <div style={{ margin: '16px 0' }}>
                                    <label className="schedule-radio-label">
                                        <input
                                            type="radio"
                                            name="listCancelScope"
                                            checked={cancelScope === 'occurrence'}
                                            onChange={() => setCancelScope('occurrence')} />
                                        <span>Cancel only this occurrence</span>
                                    </label>
                                    <label className="schedule-radio-label" style={{ marginTop: '8px' }}>
                                        <input
                                            type="radio"
                                            name="listCancelScope"
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
                                    onClick={() => setMeetingToCancel(null)}
                                    disabled={cancelling}>
                                    Keep Meeting
                                </button>
                                <button
                                    type="button"
                                    className="schedule-btn-danger"
                                    onClick={handleConfirmCancelFromList}
                                    disabled={cancelling}>
                                    {cancelling ? 'Cancelling...' : 'Yes, Cancel Meeting'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Passcode Prompt Modal */}
                {passcodeModalRoom && (
                    <PasscodePromptModal
                        roomId={passcodeModalRoom}
                        error={passcodeModalError}
                        onClose={() => setPasscodeModalRoom(null)}
                        onSubmit={(enteredPasscode) => {
                            window.location.href = `/${passcodeModalRoom}?passcode=${encodeURIComponent(enteredPasscode)}`;
                        }} />
                )}

                {/* Upgrade to Pro Modal */}
                {showProModal && (
                    <div className="faceonn-dash-modal-overlay" onClick={() => setShowProModal(false)}>
                        <div className="faceonn-dash-modal-card" style={{ textAlign: 'center', maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
                            <div style={{ marginBottom: '16px' }}>
                                <img src="images/footer-rocket.png" alt="Rocket" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
                            </div>
                            <h3 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 8px 0', color: '#0f172a' }}>
                                Upgrade to Faceonn Pro
                            </h3>
                            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 24px 0', lineHeight: 1.5 }}>
                                Get unlimited 1080p group meetings up to 500 participants, cloud recording storage, and AI meeting summaries.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <button
                                    type="button"
                                    className="faceonn-dash-btn-pro"
                                    style={{ width: '100%', padding: '12px' }}
                                    onClick={() => {
                                        alert('Pro upgrade plan checkout will open here.');
                                        setShowProModal(false);
                                    }}>
                                    Upgrade Now - $12/month
                                </button>
                                <button
                                    type="button"
                                    className="faceonn-dash-btn-cancel"
                                    onClick={() => setShowProModal(false)}>
                                    Maybe Later
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
