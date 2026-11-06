/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles, @typescript-eslint/no-unused-vars, @stylistic/max-statements-per-line */
import React, { Component } from 'react';
import { generateRoomWithoutSeparator } from '@jitsi/js-utils/random';

interface IState {
    showJoinModal: boolean;
    showScheduleModal: boolean;
    joinRoomInput: string;
    scheduleTopic: string;
    scheduleDate: string;
    scheduleTime: string;
    generatedScheduleLink: string;
    copied: boolean;
    emailInput: string;
    emailSubscribed: boolean;
    showLangDropdown: boolean;
    selectedLang: string;
}

export default class TestWelcomePage extends Component<{}, IState> {
    constructor(props: {}) {
        super(props);

        const initialScheduleRoom = generateRoomWithoutSeparator();

        this.state = {
            showJoinModal: false,
            showScheduleModal: false,
            joinRoomInput: '',
            scheduleTopic: 'Quick Sync Meeting',
            scheduleDate: new Date().toISOString().split('T')[0],
            scheduleTime: '11:00',
            generatedScheduleLink: `${window.location.origin}/${initialScheduleRoom}`,
            copied: false,
            emailInput: '',
            emailSubscribed: false,
            showLangDropdown: false,
            selectedLang: 'EN'
        };

        this._onStartMeeting = this._onStartMeeting.bind(this);
        this._onJoinMeetingSubmit = this._onJoinMeetingSubmit.bind(this);
        this._onCopyScheduleLink = this._onCopyScheduleLink.bind(this);
        this._onEmailSubmit = this._onEmailSubmit.bind(this);
    }

    override componentDidMount() {
        document.body.classList.add('test-welcome-page-body');
        document.title = 'Faceonn | Video meetings that bring people closer';
    }

    override componentWillUnmount() {
        document.body.classList.remove('test-welcome-page-body');
    }

    _onStartMeeting() {
        const room = generateRoomWithoutSeparator();
        window.location.href = `/${room}`;
    }

    _onJoinMeetingSubmit(e: React.FormEvent) {
        e.preventDefault();
        const input = this.state.joinRoomInput.trim();
        if (!input) return;

        // If user pasted a full URL, parse room out of it
        let room = input;
        try {
            if (input.includes('/')) {
                const url = new URL(input.startsWith('http') ? input : `https://${input}`);
                room = url.pathname.replace(/^\/+/, '');
            }
        } catch (_) {
            // fallback to using input as-is
        }

        window.location.href = `/${encodeURIComponent(room)}`;
    }

    _onCopyScheduleLink() {
        navigator.clipboard.writeText(this.state.generatedScheduleLink);
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2500);
    }

    _onEmailSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (this.state.emailInput.trim()) {
            this.setState({ emailSubscribed: true });
            setTimeout(() => {
                this.setState({ emailInput: '', emailSubscribed: false });
            }, 3000);
        }
    }

    renderNavbar() {
        return (
            <header className="test-nav">
                <div className="test-nav-inner">
                    <div className="test-nav-left">
                        <a href="/test" className="test-brand-logo-link">
                            <img
                                src="images/faceonn-neon-logo.png"
                                alt="Faceonn"
                                className="test-brand-logo-img" />
                        </a>
                    </div>

                    <nav className="test-nav-menu">
                        <div className="test-nav-dropdown-wrapper">
                            <button className="test-nav-link">Product <span className="test-chevron">▾</span></button>
                            <div className="test-nav-dropdown">
                                <a href="#features">Video Meetings</a>
                                <a href="#features">Screen Sharing</a>
                                <a href="#features">AI Summaries</a>
                                <a href="#features">Cloud Recording</a>
                            </div>
                        </div>
                        <div className="test-nav-dropdown-wrapper">
                            <button className="test-nav-link">Solutions <span className="test-chevron">▾</span></button>
                            <div className="test-nav-dropdown">
                                <a href="#why">For Teams</a>
                                <a href="#why">Enterprise</a>
                                <a href="#why">Education</a>
                                <a href="#why">Healthcare</a>
                            </div>
                        </div>
                        <div className="test-nav-dropdown-wrapper">
                            <button className="test-nav-link">Resources <span className="test-chevron">▾</span></button>
                            <div className="test-nav-dropdown">
                                <a href="#features">Documentation</a>
                                <a href="#features">Guides & Tutorials</a>
                                <a href="#features">API Reference</a>
                                <a href="#footer">Community Support</a>
                            </div>
                        </div>
                        <a href="#features" className="test-nav-link">Pricing</a>
                    </nav>

                    <div className="test-nav-right">
                        <div className="test-lang-picker">
                            <button
                                className="test-lang-btn"
                                onClick={() => this.setState({ showLangDropdown: !this.state.showLangDropdown })}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                </svg>
                                <span>{this.state.selectedLang}</span>
                                <span className="test-chevron">▾</span>
                            </button>
                            {this.state.showLangDropdown && (
                                <div className="test-lang-menu">
                                    {['EN', 'ES', 'FR', 'DE', 'JA'].map(lang => (
                                        <button
                                            key={lang}
                                            onClick={() => this.setState({ selectedLang: lang, showLangDropdown: false })}>
                                            {lang}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            className="test-btn-text"
                            onClick={() => this.setState({ showJoinModal: true })}>
                            Join a meeting
                        </button>

                        <button
                            className="test-btn-text"
                            onClick={this._onStartMeeting}>
                            Host a meeting
                        </button>

                        <button
                            className="test-btn-signin"
                            onClick={() => this.setState({ showJoinModal: true })}>
                            Sign in
                        </button>

                        <button
                            className="test-btn-getstarted"
                            onClick={this._onStartMeeting}>
                            Get started free <span className="arrow">→</span>
                        </button>
                    </div>
                </div>
            </header>
        );
    }

    renderHero() {
        return (
            <section className="test-hero-section">
                <div className="test-hero-ambient-glow" />
                <div className="test-hero-container">
                    <div className="test-hero-grid">
                        <div className="test-hero-left">
                            <div className="test-hero-badge">
                                <span className="test-badge-pill">✨ New</span>
                                <span className="test-badge-text">Meet face to face, from anywhere. →</span>
                            </div>

                            <h1 className="test-hero-heading">
                                Video meetings<br />
                                that bring people<br />
                                <span className="word-closer">
                                    closer
                                    <svg className="closer-curve" viewBox="0 0 200 24" fill="none">
                                        <path d="M4 18C45 6 130 4 196 14" stroke="#a855f7" strokeWidth="5.5" strokeLinecap="round" />
                                        <path d="M12 20C55 9 135 7 190 16" stroke="#c084fc" strokeWidth="2.5" strokeLinecap="round" />
                                    </svg>
                                </span>
                            </h1>

                            <p className="test-hero-subtitle">
                                Secure, high-quality video conferencing for teams, businesses and individuals — with powerful collaboration tools, on any device, anywhere in the world.
                            </p>

                            <div className="test-hero-actions">
                                <button className="test-btn-hero-primary" onClick={this._onStartMeeting}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                    </svg>
                                    Start a free meeting
                                </button>

                                <button
                                    className="test-btn-hero-secondary"
                                    onClick={() => this.setState({ showScheduleModal: true })}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                        <line x1="16" y1="2" x2="16" y2="6" />
                                        <line x1="8" y1="2" x2="8" y2="6" />
                                        <line x1="3" y1="10" x2="21" y2="10" />
                                    </svg>
                                    Schedule a meeting
                                </button>
                            </div>

                            <div className="test-hero-checklist">
                                <span><span className="check">✓</span> No credit card required</span>
                                <span><span className="check">✓</span> Free for everyone</span>
                                <span><span className="check">✓</span> Works on any device</span>
                            </div>
                        </div>

                        <div className="test-hero-right">
                            <div className="test-hero-visual-wrapper">
                                <img
                                    src="images/hero-devices.png"
                                    alt="Faceonn Video Conference Devices"
                                    className="test-hero-devices-img" />
                            </div>
                        </div>
                    </div>

                    {/* Trusted by bar */}
                    <div className="test-trusted-section">
                        <div className="test-trusted-title">Trusted by teams at</div>
                        <div className="test-trusted-logos">
                            {/* Meta */}
                            <div className="test-logo-item">
                                <svg width="28" height="18" viewBox="0 0 24 16" fill="currentColor">
                                    <path d="M12 9.5c-1.4 2-3.1 3.5-5.2 3.5-3.3 0-6-2.9-6-6.5S3.5 0 6.8 0c2.4 0 4.2 1.8 5.2 3.5C13 1.8 14.8 0 17.2 0 20.5 0 23.2 2.9 23.2 6.5s-2.7 6.5-6 6.5c-2.1 0-3.8-1.5-5.2-3.5zm-5.2 1.3c2 0 3.7-2 4.4-4.3C10.5 4.2 8.8 2.2 6.8 2.2 4.8 2.2 3 4.2 3 6.5s1.8 4.3 3.8 4.3zm10.4 0c2 0 3.8-2 3.8-4.3S19.2 2.2 17.2 2.2c-2 0-3.7 2-4.4 4.3.7 2.3 2.4 4.3 4.4 4.3z" />
                                </svg>
                                <span>Meta</span>
                            </div>

                            {/* Google */}
                            <div className="test-logo-item">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.053 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
                                </svg>
                                <span>Google</span>
                            </div>

                            {/* Microsoft */}
                            <div className="test-logo-item">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="1" y="1" width="10" height="10" fill="currentColor" opacity="0.9" />
                                    <rect x="13" y="1" width="10" height="10" fill="currentColor" opacity="0.9" />
                                    <rect x="1" y="13" width="10" height="10" fill="currentColor" opacity="0.9" />
                                    <rect x="13" y="13" width="10" height="10" fill="currentColor" opacity="0.9" />
                                </svg>
                                <span>Microsoft</span>
                            </div>

                            {/* Spotify */}
                            <div className="test-logo-item">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                </svg>
                                <span>Spotify</span>
                            </div>

                            {/* airbnb */}
                            <div className="test-logo-item">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 0C7.2 0 4 3.7 4 7.6c0 4.8 4.7 10.6 8 16.4 3.3-5.8 8-11.6 8-16.4C20 3.7 16.8 0 12 0zm0 13.5c-2.5 0-4.5-2-4.5-4.5s2-4.5 4.5-4.5 4.5 2 4.5 4.5-2 4.5-4.5 4.5z" />
                                </svg>
                                <span>airbnb</span>
                            </div>

                            {/* Notion */}
                            <div className="test-logo-item">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M4.459 4.209l12.448-3.08c1.36-.34 2.16.44 2.16 1.74v15.28c0 1.34-.8 2.22-2.16 2.56l-12.448 3.08c-1.36.34-2.16-.44-2.16-1.74V6.769c0-1.34.8-2.22 2.16-2.56zm10.74 3.791l-6.2 8.35v-7.39l-2.4.6v11.17l2.2-.55 6.2-8.35v7.39l2.4-.6V7.4l-2.2.6z" />
                                </svg>
                                <span>Notion</span>
                            </div>
                        </div>
                    </div>

                    {/* 4 Feature Cards */}
                    <div className="test-hero-feature-cards">
                        <div className="test-hero-card">
                            <div className="test-hero-card-icon">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#a855f7" strokeWidth="2">
                                    <path d="M23 7l-7 5 7 5V7z" />
                                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                </svg>
                            </div>
                            <div className="test-hero-card-text">
                                <h4>Crystal-clear video</h4>
                                <p>HD quality, even on low bandwidth</p>
                            </div>
                        </div>

                        <div className="test-hero-card">
                            <div className="test-hero-card-icon">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#a855f7" strokeWidth="2">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                    <circle cx="9" cy="7" r="4" />
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                            </div>
                            <div className="test-hero-card-text">
                                <h4>Seamless collaboration</h4>
                                <p>Chat, share, whiteboard and more</p>
                            </div>
                        </div>

                        <div className="test-hero-card">
                            <div className="test-hero-card-icon">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#a855f7" strokeWidth="2">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                </svg>
                            </div>
                            <div className="test-hero-card-text">
                                <h4>Enterprise-grade security</h4>
                                <p>Privacy and compliance, by design</p>
                            </div>
                        </div>

                        <div className="test-hero-card">
                            <div className="test-hero-card-icon">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#a855f7" strokeWidth="2">
                                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                    <line x1="8" y1="21" x2="16" y2="21" />
                                    <line x1="12" y1="17" x2="12" y2="21" />
                                </svg>
                            </div>
                            <div className="test-hero-card-text">
                                <h4>Across all your devices</h4>
                                <p>Join from web, desktop, or mobile</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    renderWhyFaceonn() {
        return (
            <section id="why" className="test-why-section">
                <div className="test-section-header">
                    <div className="test-section-badge">
                        <span>⚡ Why Faceonn</span>
                    </div>
                    <h2 className="test-section-heading">
                        Everything you need for modern<br />
                        <span className="text-gradient">video collaboration</span>
                    </h2>
                    <p className="test-section-subtitle">
                        A complete, secure and easy-to-use platform for meetings, webinars, team collaboration and more.
                    </p>
                </div>

                <div className="test-why-content">
                    <div className="test-why-grid">
                        <div className="test-why-left">
                            <div className="test-why-img-container">
                                <img
                                    src="images/meeting-interface.png"
                                    alt="Faceonn Video Meeting Interface"
                                    className="test-why-interface-img" />
                            </div>
                        </div>

                        <div className="test-why-right">
                            <div className="test-features-grid-2x3">
                                <div className="test-feature-tile">
                                    <div className="test-feature-tile-icon">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                                            <polygon points="23 7 16 12 23 17 23 7" />
                                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                        </svg>
                                    </div>
                                    <div className="test-feature-tile-body">
                                        <h4>HD Video & Audio</h4>
                                        <p>Crystal-clear calls with adaptive quality</p>
                                    </div>
                                </div>

                                <div className="test-feature-tile">
                                    <div className="test-feature-tile-icon">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                            <circle cx="9" cy="7" r="4" />
                                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                        </svg>
                                    </div>
                                    <div className="test-feature-tile-body">
                                        <h4>Large Meetings</h4>
                                        <p>Host up to 1,000 participants with stable performance</p>
                                    </div>
                                </div>

                                <div className="test-feature-tile">
                                    <div className="test-feature-tile-icon">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                            <line x1="8" y1="21" x2="16" y2="21" />
                                            <line x1="12" y1="17" x2="12" y2="21" />
                                        </svg>
                                    </div>
                                    <div className="test-feature-tile-body">
                                        <h4>Screen Sharing</h4>
                                        <p>Share your screen, apps or presentations instantly</p>
                                    </div>
                                </div>

                                <div className="test-feature-tile">
                                    <div className="test-feature-tile-icon">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                        </svg>
                                    </div>
                                    <div className="test-feature-tile-body">
                                        <h4>AI Meeting Assistant</h4>
                                        <p>Auto summaries, key takeaways and action items</p>
                                    </div>
                                </div>

                                <div className="test-feature-tile">
                                    <div className="test-feature-tile-icon">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                        </svg>
                                    </div>
                                    <div className="test-feature-tile-body">
                                        <h4>Enterprise Security</h4>
                                        <p>End-to-end encryption and company-grade compliance</p>
                                    </div>
                                </div>

                                <div className="test-feature-tile">
                                    <div className="test-feature-tile-icon">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                            <line x1="16" y1="2" x2="16" y2="6" />
                                            <line x1="8" y1="2" x2="8" y2="6" />
                                            <line x1="3" y1="10" x2="21" y2="10" />
                                        </svg>
                                    </div>
                                    <div className="test-feature-tile-body">
                                        <h4>Schedule & Manage</h4>
                                        <p>Plan meetings, send invites and sync with your calendar</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats Banner */}
                    <div className="test-stats-banner">
                        <div className="test-stat-item">
                            <div className="test-stat-icon">👥</div>
                            <div className="test-stat-text">
                                <h3>10M+</h3>
                                <p>Active Users</p>
                            </div>
                        </div>

                        <div className="test-stat-item">
                            <div className="test-stat-icon">🏢</div>
                            <div className="test-stat-text">
                                <h3>100K+</h3>
                                <p>Businesses</p>
                            </div>
                        </div>

                        <div className="test-stat-item">
                            <div className="test-stat-icon">🌐</div>
                            <div className="test-stat-text">
                                <h3>190+</h3>
                                <p>Countries</p>
                            </div>
                        </div>

                        <div className="test-stat-item">
                            <div className="test-stat-icon">🏆</div>
                            <div className="test-stat-text">
                                <h3>99.99%</h3>
                                <p>Uptime</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    renderMeetingsMadeSimple() {
        return (
            <section className="test-simple-section">
                <div className="test-simple-grid">
                    <div className="test-simple-left">
                        <div className="test-section-badge">
                            <span>📅 Meetings Made Simple</span>
                        </div>
                        <h2 className="test-simple-heading">
                            Plan, join and manage meetings <span className="text-gradient">effortlessly</span>
                        </h2>
                        <p className="test-simple-subtitle">
                            From quick team syncs to large webinars, Faceonn gives you all the tools to schedule, host and manage meetings in one place.
                        </p>

                        <div className="test-simple-list">
                            <div className="test-simple-item">
                                <div className="test-simple-icon">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                        <line x1="16" y1="2" x2="16" y2="6" />
                                        <line x1="8" y1="2" x2="8" y2="6" />
                                        <line x1="3" y1="10" x2="21" y2="10" />
                                    </svg>
                                </div>
                                <div className="test-simple-item-body">
                                    <h4>Smart Scheduling</h4>
                                    <p>Create, share and manage meetings with your team</p>
                                </div>
                            </div>

                            <div className="test-simple-item">
                                <div className="test-simple-icon">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                        <circle cx="9" cy="7" r="4" />
                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                    </svg>
                                </div>
                                <div className="test-simple-item-body">
                                    <h4>Instant Join</h4>
                                    <p>Jump into meetings with a single click</p>
                                </div>
                            </div>

                            <div className="test-simple-item">
                                <div className="test-simple-icon">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                                    </svg>
                                </div>
                                <div className="test-simple-item-body">
                                    <h4>Reminders & Alerts</h4>
                                    <p>Never miss an important meeting</p>
                                </div>
                            </div>

                            <div className="test-simple-item">
                                <div className="test-simple-icon">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                                        <polygon points="23 7 16 12 23 17 23 7" />
                                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                    </svg>
                                </div>
                                <div className="test-simple-item-body">
                                    <h4>Recurring Meetings</h4>
                                    <p>Set it once and keep your team in sync</p>
                                </div>
                            </div>
                        </div>

                        <div className="test-simple-actions">
                            <button
                                className="test-btn-simple-schedule"
                                onClick={() => this.setState({ showScheduleModal: true })}>
                                Schedule a Meeting →
                            </button>
                            <a href="#features" className="test-btn-simple-learn">
                                Learn More <span className="arrow">↗</span>
                            </a>
                        </div>
                    </div>

                    <div className="test-simple-right">
                        <div className="test-simple-img-wrapper">
                            <img
                                src="images/meeting-dashboard.png"
                                alt="Virtual Meeting Dashboard"
                                className="test-simple-dashboard-img" />
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    renderPowerfulFeatures() {
        return (
            <section id="features" className="test-features-section">
                <div className="test-section-header">
                    <div className="test-section-badge">
                        <span>🥞 Powerful Features</span>
                    </div>
                    <h2 className="test-section-heading">
                        Everything you need for seamless<br />
                        <span className="text-gradient">video meetings</span>
                    </h2>
                    <p className="test-section-subtitle">
                        A complete suite of tools to help you communicate, collaborate and get more done — whether you're a team of 2 or 2,000.
                    </p>
                </div>

                <div className="test-features-cards-grid">
                    {/* Card 1 */}
                    <div className="test-feature-card">
                        <div className="test-card-asset-wrapper">
                            <img src="images/feature-camera.png" alt="HD Video" className="test-card-3d-img" />
                        </div>
                        <h3>Crystal Clear Meetings</h3>
                        <p>High-quality video and audio with adaptive performance.</p>
                    </div>

                    {/* Card 2 - Special Featured Highlight */}
                    <div className="test-feature-card featured-dark">
                        <div className="test-card-asset-wrapper">
                            <img src="images/feature-screen-share.png" alt="Screen Sharing" className="test-card-3d-img" />
                        </div>
                        <h3>Screen Sharing</h3>
                        <p>Present, collaborate and get feedback in real time.</p>
                    </div>

                    {/* Card 3 */}
                    <div className="test-feature-card">
                        <div className="test-card-asset-wrapper">
                            <img src="images/feature-users.png" alt="Large Meetings" className="test-card-3d-img" />
                        </div>
                        <h3>Large Meetings</h3>
                        <p>Host up to 1,000 participants with stable, reliable performance.</p>
                    </div>

                    {/* Card 4 */}
                    <div className="test-feature-card">
                        <div className="test-card-asset-wrapper">
                            <img src="images/feature-calendar.png" alt="Smart Scheduling" className="test-card-3d-img" />
                        </div>
                        <h3>Smart Scheduling</h3>
                        <p>Plan, schedule and manage meetings with ease.</p>
                    </div>

                    {/* Card 5 */}
                    <div className="test-feature-card">
                        <div className="test-card-asset-wrapper">
                            <img src="images/feature-security.png" alt="Enterprise Security" className="test-card-3d-img" />
                        </div>
                        <h3>Enterprise Security</h3>
                        <p>End-to-end encryption, SSO and advanced privacy controls.</p>
                    </div>

                    {/* Card 6 */}
                    <div className="test-feature-card">
                        <div className="test-card-asset-wrapper">
                            <img src="images/feature-cloud-sync.png" alt="AI Meeting Assistant" className="test-card-3d-img" />
                        </div>
                        <h3>AI Meeting Assistant</h3>
                        <p>Auto summaries, key takeaways and action items after every meeting.</p>
                    </div>
                </div>

                <div className="test-features-footer-action">
                    <button className="test-btn-explore-features" onClick={this._onStartMeeting}>
                        Explore All Features →
                    </button>
                </div>
            </section>
        );
    }

    renderFooter() {
        return (
            <footer id="footer" className="test-footer-section">
                <div className="test-footer-container">
                    {/* CTA Banner Card */}
                    <div className="test-cta-banner">
                        <div className="test-cta-banner-bg" />
                        <div className="test-cta-content">
                            <div className="test-cta-text">
                                <h2>
                                    Ready to build<br />
                                    something <span className="text-gradient">amazing?</span>
                                </h2>
                                <p>
                                    Join creators, teams, and businesses who are already building the next generation of experiences with Faceonn.
                                </p>
                            </div>

                            <div className="test-cta-rocket-visual">
                                <img
                                    src="images/footer-rocket.png"
                                    alt="Rocket Launch"
                                    className="test-cta-rocket-img" />
                            </div>

                            <div className="test-cta-actions">
                                <button className="test-btn-cta-white" onClick={this._onStartMeeting}>
                                    Get Started Free →
                                </button>
                                <button
                                    className="test-btn-cta-demo"
                                    onClick={() => this.setState({ showScheduleModal: true })}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                        <line x1="16" y1="2" x2="16" y2="6" />
                                        <line x1="8" y1="2" x2="8" y2="6" />
                                        <line x1="3" y1="10" x2="21" y2="10" />
                                    </svg>
                                    Book a Demo
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Main Footer Links */}
                    <div className="test-footer-main">
                        <div className="test-footer-col brand-col">
                            <a href="/test" className="test-footer-logo-link">
                                <img
                                    src="images/faceonn-neon-logo.png"
                                    alt="Faceonn"
                                    className="test-footer-logo-img" />
                            </a>
                            <p className="test-footer-tagline">
                                Build, collaborate, and ship extraordinary digital experiences.
                            </p>
                            <div className="test-social-links">
                                <a href="https://github.com" target="_blank" rel="noreferrer" aria-label="GitHub" className="social-icon-btn">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                    </svg>
                                </a>
                                <a href="https://x.com" target="_blank" rel="noreferrer" aria-label="X" className="social-icon-btn">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                    </svg>
                                </a>
                                <a href="https://linkedin.com" target="_blank" rel="noreferrer" aria-label="LinkedIn" className="social-icon-btn">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                                    </svg>
                                </a>
                                <a href="https://youtube.com" target="_blank" rel="noreferrer" aria-label="YouTube" className="social-icon-btn">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                                    </svg>
                                </a>
                                <a href="https://discord.com" target="_blank" rel="noreferrer" aria-label="Discord" className="social-icon-btn">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                                    </svg>
                                </a>
                            </div>
                        </div>

                        <div className="test-footer-col">
                            <h4>Product</h4>
                            <ul>
                                <li><a href="#features">Features</a></li>
                                <li><a href="#features">Integrations</a></li>
                                <li><a href="#features">Pricing</a></li>
                                <li><a href="#features">Changelog</a></li>
                            </ul>
                        </div>

                        <div className="test-footer-col">
                            <h4>Company</h4>
                            <ul>
                                <li><a href="#why">About</a></li>
                                <li><a href="#why">Careers <span className="test-hiring-pill">Hiring</span></a></li>
                                <li><a href="#why">Blog</a></li>
                                <li><a href="#footer">Contact</a></li>
                            </ul>
                        </div>

                        <div className="test-footer-col">
                            <h4>Resources</h4>
                            <ul>
                                <li><a href="#features">Documentation</a></li>
                                <li><a href="#features">Guides</a></li>
                                <li><a href="#features">API Reference</a></li>
                                <li><a href="#footer">Support</a></li>
                            </ul>
                        </div>

                        <div className="test-footer-col stay-in-loop-col">
                            <h4>Stay in the loop</h4>
                            <p>Get product updates, tips, and early access to new features.</p>
                            <form className="test-subscribe-form" onSubmit={this._onEmailSubmit}>
                                <div className="test-subscribe-input-wrapper">
                                    <svg className="mail-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                        <polyline points="22,6 12,13 2,6" />
                                    </svg>
                                    <input
                                        type="email"
                                        placeholder="Enter your email"
                                        value={this.state.emailInput}
                                        onChange={e => this.setState({ emailInput: e.target.value })}
                                        required />
                                    <button type="submit" className="test-btn-subscribe-submit" aria-label="Subscribe">
                                        →
                                    </button>
                                </div>
                                {this.state.emailSubscribed && (
                                    <div className="test-subscribe-success">✓ Thanks for subscribing!</div>
                                )}
                            </form>
                        </div>
                    </div>

                    {/* Bottom row */}
                    <div className="test-footer-bottom">
                        <div className="test-footer-copyright">
                            © 2026 Faceonn. All rights reserved.
                        </div>
                        <div className="test-footer-legal">
                            <a href="#footer">Privacy Policy</a>
                            <a href="#footer">Terms of Service</a>
                            <a href="#footer">Cookies</a>
                        </div>
                    </div>

                    {/* Glowing bottom waves */}
                    <div className="test-footer-waves-wrapper">
                        <img
                            src="images/footer-waves.png"
                            alt=""
                            className="test-footer-waves-img" />
                    </div>
                </div>
            </footer>
        );
    }

    renderModals() {
        return (
            <>
                {/* Join Meeting Modal */}
                {this.state.showJoinModal && (
                    <div className="test-modal-overlay" onClick={() => this.setState({ showJoinModal: false })}>
                        <div className="test-modal-card" onClick={e => e.stopPropagation()}>
                            <button
                                className="test-modal-close"
                                onClick={() => this.setState({ showJoinModal: false })}>
                                ✕
                            </button>
                            <div className="test-modal-header">
                                <div className="test-modal-badge">Instant Join</div>
                                <h3>Join a Faceonn Meeting</h3>
                                <p>Enter the meeting room name or paste the full meeting link to jump right in.</p>
                            </div>

                            <form onSubmit={this._onJoinMeetingSubmit} className="test-modal-form">
                                <div className="test-modal-input-group">
                                    <label>Meeting Name or Link</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. daily-standup or faceonn.com/team-sync"
                                        value={this.state.joinRoomInput}
                                        onChange={e => this.setState({ joinRoomInput: e.target.value })}
                                        autoFocus
                                        required />
                                </div>

                                <div className="test-modal-actions">
                                    <button
                                        type="button"
                                        className="test-btn-modal-cancel"
                                        onClick={() => this.setState({ showJoinModal: false })}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="test-btn-modal-primary">
                                        Join Meeting Now →
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Schedule Meeting Modal */}
                {this.state.showScheduleModal && (
                    <div className="test-modal-overlay" onClick={() => this.setState({ showScheduleModal: false })}>
                        <div className="test-modal-card" onClick={e => e.stopPropagation()}>
                            <button
                                className="test-modal-close"
                                onClick={() => this.setState({ showScheduleModal: false })}>
                                ✕
                            </button>
                            <div className="test-modal-header">
                                <div className="test-modal-badge">Smart Scheduling</div>
                                <h3>Schedule a Meeting</h3>
                                <p>Set up your meeting details and share the invite link with your attendees.</p>
                            </div>

                            <div className="test-modal-form">
                                <div className="test-modal-input-group">
                                    <label>Meeting Topic</label>
                                    <input
                                        type="text"
                                        value={this.state.scheduleTopic}
                                        onChange={e => this.setState({ scheduleTopic: e.target.value })} />
                                </div>

                                <div className="test-modal-row">
                                    <div className="test-modal-input-group">
                                        <label>Date</label>
                                        <input
                                            type="date"
                                            value={this.state.scheduleDate}
                                            onChange={e => this.setState({ scheduleDate: e.target.value })} />
                                    </div>
                                    <div className="test-modal-input-group">
                                        <label>Time</label>
                                        <input
                                            type="time"
                                            value={this.state.scheduleTime}
                                            onChange={e => this.setState({ scheduleTime: e.target.value })} />
                                    </div>
                                </div>

                                <div className="test-modal-input-group">
                                    <label>Shareable Meeting Link</label>
                                    <div className="test-copy-box">
                                        <input
                                            type="text"
                                            readOnly
                                            value={this.state.generatedScheduleLink} />
                                        <button
                                            type="button"
                                            className="test-btn-copy"
                                            onClick={this._onCopyScheduleLink}>
                                            {this.state.copied ? '✓ Copied!' : 'Copy Link'}
                                        </button>
                                    </div>
                                </div>

                                <div className="test-modal-actions">
                                    <button
                                        type="button"
                                        className="test-btn-modal-cancel"
                                        onClick={() => this.setState({ showScheduleModal: false })}>
                                        Done
                                    </button>
                                    <button
                                        type="button"
                                        className="test-btn-modal-primary"
                                        onClick={() => window.location.href = this.state.generatedScheduleLink}>
                                        Start Meeting Now →
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    }

    override render() {
        return (
            <div className="test-home-container">
                {this.renderNavbar()}
                <main>
                    {this.renderHero()}
                    {this.renderWhyFaceonn()}
                    {this.renderMeetingsMadeSimple()}
                    {this.renderPowerfulFeatures()}
                </main>
                {this.renderFooter()}
                {this.renderModals()}
            </div>
        );
    }
}

