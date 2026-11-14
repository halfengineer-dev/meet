/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles, @typescript-eslint/no-unused-vars, @stylistic/max-statements-per-line */
import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { generateRoomWithoutSeparator } from '@jitsi/js-utils/random';
import { IReduxState } from '../../app/types';
import { createMeeting, logout } from '../actions';
import { getAuthUser, getAccessToken } from '../functions';
import { authApiClient } from '../api';
import { IMeeting } from '../types';

export default function DashboardPage() {
    const dispatch = useDispatch();
    const user = useSelector((state: IReduxState) => getAuthUser(state));
    const accessToken = useSelector((state: IReduxState) => getAccessToken(state));

    const [activeTab, setActiveTab] = useState<'home' | 'meetings' | 'recordings' | 'settings' | 'profile'>('home');
    const [joinInput, setJoinInput] = useState('');
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [showProModal, setShowProModal] = useState(false);
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // Schedule meeting state
    const [scheduleTopic, setScheduleTopic] = useState('Team Sync');
    const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [scheduleTime, setScheduleTime] = useState('11:00');
    const [generatedScheduleRoom, setGeneratedScheduleRoom] = useState(() => generateRoomWithoutSeparator());
    const [copied, setCopied] = useState(false);

    // Meetings list state
    const [meetings, setMeetings] = useState<IMeeting[]>([]);
    const [loadingMeetings, setLoadingMeetings] = useState(false);

    // Dark/Light theme toggle
    const [theme, setTheme] = useState<'light' | 'dark'>('light');

    useEffect(() => {
        if (accessToken) {
            setLoadingMeetings(true);
            authApiClient.getMeetings(accessToken)
                .then(data => {
                    if (data && data.meetings) {
                        setMeetings(data.meetings);
                    }
                })
                .catch(() => {})
                .finally(() => setLoadingMeetings(false));
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

    const handleCopyScheduleLink = () => {
        const link = `${window.location.origin}/${generatedScheduleRoom}`;
        navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleStartScheduledMeeting = () => {
        window.location.href = `/${generatedScheduleRoom}`;
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
                            onClick={() => setActiveTab('home')}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill={activeTab === 'home' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                <polyline points="9 22 9 12 15 12 15 22" />
                            </svg>
                            <span>Home</span>
                        </button>

                        <button
                            type="button"
                            className={`faceonn-dash-nav-item ${activeTab === 'meetings' ? 'active' : ''}`}
                            onClick={() => setActiveTab('meetings')}>
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
                            onClick={() => setActiveTab('recordings')}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
                            </svg>
                            <span>Recordings</span>
                        </button>

                        <button
                            type="button"
                            className={`faceonn-dash-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                            onClick={() => setActiveTab('settings')}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                            <span>Settings</span>
                        </button>

                        <button
                            type="button"
                            className={`faceonn-dash-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
                            onClick={() => setActiveTab('profile')}>
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

            {/* Main Content Area */}
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
                                <div className="faceonn-dash-user-avatar">
                                    {userInitials}
                                </div>
                                <span className="faceonn-dash-user-name">{displayName}</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="chevron-icon">
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
                                        Sign out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Tab: Home (Default Dashboard) */}
                {activeTab === 'home' && (
                    <div className="faceonn-dash-body">
                        {/* Greeting Banner */}
                        <div className="faceonn-dash-welcome">
                            <h1>Good day, {displayName}!</h1>
                            <p>Ready to connect? Start or join a meeting in just one click. 👋</p>
                        </div>

                        {createError && (
                            <div className="faceonn-dash-alert error">
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
                                    <p>Start an instant video meeting</p>
                                    <button
                                        type="button"
                                        className="faceonn-dash-btn-action blue"
                                        onClick={handleCreateMeeting}
                                        disabled={isCreating}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                        </svg>
                                        {isCreating ? 'Creating Room...' : 'Start Meeting →'}
                                    </button>
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
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                                        onClick={() => setActiveTab('meetings')}>
                                        View All →
                                    </button>
                                </div>

                                <div className="dash-upcoming-body">
                                    {meetings.length === 0 ? (
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
                                                onClick={() => setShowScheduleModal(true)}>
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
                                            {meetings.slice(0, 3).map((m) => (
                                                <div key={m.id} className="dash-meeting-item-row">
                                                    <div className="meeting-row-icon">
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                                            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                                        </svg>
                                                    </div>
                                                    <div className="meeting-row-info">
                                                        <div className="meeting-row-title">{m.title}</div>
                                                        <div className="meeting-row-room">Room: {m.roomId}</div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="meeting-row-btn"
                                                        onClick={() => window.location.href = `/${m.roomId}`}>
                                                        Start →
                                                    </button>
                                                </div>
                                            ))}
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
                                    {/* Activity Item 1 */}
                                    <div className="dash-timeline-item">
                                        <div className="timeline-node blue">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                            </svg>
                                        </div>
                                        <div className="timeline-content">
                                            <div className="timeline-main">
                                                <div className="timeline-title">Meeting ended</div>
                                                <div className="timeline-sub">with 4 participants • 45 min</div>
                                            </div>
                                            <div className="timeline-time">2h ago</div>
                                        </div>
                                    </div>

                                    {/* Activity Item 2 */}
                                    <div className="dash-timeline-item">
                                        <div className="timeline-node purple">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                            </svg>
                                        </div>
                                        <div className="timeline-content">
                                            <div className="timeline-main">
                                                <div className="timeline-title">You joined a meeting</div>
                                                <div className="timeline-sub">via link</div>
                                            </div>
                                            <div className="timeline-time">1d ago</div>
                                        </div>
                                    </div>

                                    {/* Activity Item 3 */}
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
                                                <div className="timeline-title">New meeting scheduled</div>
                                                <div className="timeline-sub">Team Sync</div>
                                            </div>
                                            <div className="timeline-time">2d ago</div>
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
                        <div className="faceonn-dash-welcome">
                            <h1>My Meetings</h1>
                            <p>Manage and access all your hosted and scheduled meetings.</p>
                        </div>

                        <div className="faceonn-dash-card-white" style={{ padding: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Conferences & Rooms</h3>
                                <button
                                    type="button"
                                    className="faceonn-dash-btn-action blue"
                                    style={{ padding: '8px 18px', fontSize: '13px' }}
                                    onClick={handleCreateMeeting}
                                    disabled={isCreating}>
                                    + New Meeting
                                </button>
                            </div>

                            {loadingMeetings ? (
                                <p style={{ color: '#64748b' }}>Loading your meetings...</p>
                            ) : meetings.length === 0 ? (
                                <div className="dash-empty-state" style={{ padding: '40px 0' }}>
                                    <img src="images/feature-calendar.png" alt="Calendar" className="empty-state-calendar-img" />
                                    <h4>No meetings found</h4>
                                    <p>Start a new instant meeting or schedule one for later.</p>
                                </div>
                            ) : (
                                <div className="dash-meeting-items-list">
                                    {meetings.map((m) => (
                                        <div key={m.id} className="dash-meeting-item-row">
                                            <div className="meeting-row-icon">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                                </svg>
                                            </div>
                                            <div className="meeting-row-info">
                                                <div className="meeting-row-title">{m.title}</div>
                                                <div className="meeting-row-room">Room: {m.roomId} • Status: {m.status}</div>
                                            </div>
                                            <button
                                                type="button"
                                                className="meeting-row-btn"
                                                onClick={() => window.location.href = `/${m.roomId}`}>
                                                Join Room →
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
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

                {/* Tab: Settings */}
                {activeTab === 'settings' && (
                    <div className="faceonn-dash-body">
                        <div className="faceonn-dash-welcome">
                            <h1>Settings</h1>
                            <p>Manage your account preferences, audio/video devices, and conferencing security.</p>
                        </div>
                        <div className="faceonn-dash-card-white" style={{ padding: '32px' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700 }}>Conferencing Preferences</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#0f172a' }}>
                                    <input type="checkbox" defaultChecked />
                                    Always start meetings with microphone muted
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#0f172a' }}>
                                    <input type="checkbox" defaultChecked />
                                    Always start meetings with camera enabled
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#0f172a' }}>
                                    <input type="checkbox" defaultChecked />
                                    Enable high definition (HD) video stream by default
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: Profile */}
                {activeTab === 'profile' && (
                    <div className="faceonn-dash-body">
                        <div className="faceonn-dash-welcome">
                            <h1>Account Profile</h1>
                            <p>Review your personal details and authenticated session status.</p>
                        </div>
                        <div className="faceonn-dash-card-white" style={{ padding: '32px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '28px' }}>
                                <div style={{
                                    width: '64px',
                                    height: '64px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    color: '#ffffff',
                                    fontSize: '24px',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {userInitials}
                                </div>
                                <div>
                                    <h3 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>{displayName}</h3>
                                    <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>{user?.email}</p>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                                <div>
                                    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Account Status</div>
                                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#16a34a', marginTop: '4px' }}>Active (Verified)</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Membership Tier</div>
                                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#6366f1', marginTop: '4px' }}>Faceonn Free Tier</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Account ID</div>
                                    <div style={{ fontSize: '13px', fontFamily: 'monospace', color: '#0f172a', marginTop: '4px' }}>{user?.id?.slice(0, 16)}...</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modals */}

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
                                Enter the meeting room code or paste the full meeting link.
                            </p>

                            <form onSubmit={handleJoinSubmit}>
                                <div className="faceonn-dash-input-group">
                                    <label>Meeting link or room ID</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. daily-standup or https://faceonn.com/team-sync"
                                        value={joinInput}
                                        onChange={(e) => setJoinInput(e.target.value)}
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
                                        style={{ padding: '10px 24px' }}>
                                        Join Meeting →
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Schedule Meeting Modal */}
                {showScheduleModal && (
                    <div className="faceonn-dash-modal-overlay" onClick={() => setShowScheduleModal(false)}>
                        <div className="faceonn-dash-modal-card" onClick={e => e.stopPropagation()}>
                            <div className="faceonn-dash-modal-header">
                                <div className="modal-title-with-badge">
                                    <div className="modal-badge-icon blue">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                            <line x1="16" y1="2" x2="16" y2="6" />
                                            <line x1="8" y1="2" x2="8" y2="6" />
                                            <line x1="3" y1="10" x2="21" y2="10" />
                                        </svg>
                                    </div>
                                    <h3>Schedule a Meeting</h3>
                                </div>
                                <button
                                    type="button"
                                    className="dash-modal-close"
                                    onClick={() => setShowScheduleModal(false)}>
                                    ✕
                                </button>
                            </div>
                            <p className="dash-modal-desc">
                                Set up your meeting details and share the invite link with attendees.
                            </p>

                            <div className="faceonn-dash-modal-form">
                                <div className="faceonn-dash-input-group">
                                    <label>Meeting Topic</label>
                                    <input
                                        type="text"
                                        value={scheduleTopic}
                                        onChange={(e) => setScheduleTopic(e.target.value)} />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div className="faceonn-dash-input-group">
                                        <label>Date</label>
                                        <input
                                            type="date"
                                            value={scheduleDate}
                                            onChange={(e) => setScheduleDate(e.target.value)} />
                                    </div>
                                    <div className="faceonn-dash-input-group">
                                        <label>Time</label>
                                        <input
                                            type="time"
                                            value={scheduleTime}
                                            onChange={(e) => setScheduleTime(e.target.value)} />
                                    </div>
                                </div>

                                <div className="faceonn-dash-input-group">
                                    <label>Shareable Meeting Link</label>
                                    <div className="dash-copy-link-box">
                                        <input
                                            type="text"
                                            readOnly
                                            value={`${window.location.origin}/${generatedScheduleRoom}`} />
                                        <button
                                            type="button"
                                            className="dash-btn-copy"
                                            onClick={handleCopyScheduleLink}>
                                            {copied ? '✓ Copied' : 'Copy'}
                                        </button>
                                    </div>
                                </div>

                                <div className="dash-modal-actions">
                                    <button
                                        type="button"
                                        className="faceonn-dash-btn-cancel"
                                        onClick={() => setShowScheduleModal(false)}>
                                        Done
                                    </button>
                                    <button
                                        type="button"
                                        className="faceonn-dash-btn-action blue"
                                        onClick={handleStartScheduledMeeting}>
                                        Start Now →
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
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
