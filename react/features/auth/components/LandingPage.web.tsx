/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles, @typescript-eslint/no-unused-vars, @stylistic/max-statements-per-line */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { IReduxState } from '../../app/types';
import { createMeeting } from '../actions';
import { getAuthUser, isAuthenticated } from '../functions';
import { IUser } from '../types';
import UserMenu from './UserMenu';

interface IProps {
    _isAuthenticated: boolean;
    _user: IUser | null;
    _createMeeting: () => Promise<any>;
}

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

class LandingPage extends Component<IProps, IState> {
    constructor(props: IProps) {
        super(props);

        this.state = {
            showJoinModal: false,
            showScheduleModal: false,
            joinRoomInput: '',
            scheduleTopic: 'Quick Sync Meeting',
            scheduleDate: new Date().toISOString().split('T')[0],
            scheduleTime: '11:00',
            generatedScheduleLink: `${window.location.origin}/meet-scheduled`,
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

    async _onStartMeeting() {
        if (!this.props._isAuthenticated) {
            // Business rule: Unauthenticated users cannot create meetings!
            window.location.href = '/login?redirect=/dashboard';
            return;
        }

        try {
            await this.props._createMeeting();
        } catch (_) {
            window.location.href = '/dashboard';
        }
    }

    _onJoinMeetingSubmit(e: React.FormEvent) {
        e.preventDefault();
        const input = this.state.joinRoomInput.trim();
        if (!input) return;

        let room = input;
        try {
            if (input.includes('/')) {
                const url = new URL(input.startsWith('http') ? input : `https://${input}`);
                room = url.pathname.replace(/^\/+/, '');
            }
        } catch (_) {
            // fallback to using input as-is
        }

        const targetRoom = encodeURIComponent(room);

        if (!this.props._isAuthenticated) {
            // Business rule: Unauthenticated users cannot join meetings!
            window.location.href = `/login?redirect=/${targetRoom}`;
            return;
        }

        window.location.href = `/${targetRoom}`;
    }

    _onCopyScheduleLink() {
        if (!this.props._isAuthenticated) {
            window.location.href = '/login?redirect=/dashboard';
            return;
        }
        navigator.clipboard.writeText(this.state.generatedScheduleLink);
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
    }

    _onEmailSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (this.state.emailInput.trim()) {
            this.setState({ emailSubscribed: true });
        }
    }

    renderNavbar() {
        const { _isAuthenticated, _user } = this.props;

        return (
            <header className="test-nav">
                <div className="test-nav-inner">
                    <div className="test-nav-left">
                        <a href="/" className="test-brand-logo-link">
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

                        {_isAuthenticated ? (
                            <UserMenu />
                        ) : (
                            <>
                                <a
                                    href="/login"
                                    className="test-btn-signin"
                                    style={{ textDecoration: 'none' }}>
                                    Sign in
                                </a>

                                <a
                                    href="/signup"
                                    className="test-btn-getstarted"
                                    style={{ textDecoration: 'none' }}>
                                    Get started free <span className="arrow">→</span>
                                </a>
                            </>
                        )}
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
                                <span><span className="check">✓</span> Enterprise-grade security</span>
                                <span><span className="check">✓</span> Account-based verification</span>
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
                </div>
            </section>
        );
    }

    renderModals() {
        return (
            <>
                {/* Join Modal */}
                {this.state.showJoinModal && (
                    <div className="test-modal-overlay" onClick={() => this.setState({ showJoinModal: false })}>
                        <div className="test-modal-card" onClick={e => e.stopPropagation()}>
                            <div className="test-modal-header">
                                <h3>Join a meeting</h3>
                                <button
                                    className="test-modal-close"
                                    onClick={() => this.setState({ showJoinModal: false })}>
                                    ✕
                                </button>
                            </div>
                            <form onSubmit={this._onJoinMeetingSubmit}>
                                <div className="test-modal-body">
                                    <label>Meeting link or room ID</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. daily-sync or https://faceonn.com/room-name"
                                        value={this.state.joinRoomInput}
                                        onChange={e => this.setState({ joinRoomInput: e.target.value })}
                                        autoFocus />
                                    {!this.props._isAuthenticated && (
                                        <p style={{ fontSize: '12px', color: '#6366f1', marginTop: '8px' }}>
                                            ℹ️ An authenticated account is required to join meetings. You will be prompted to sign in.
                                        </p>
                                    )}
                                </div>
                                <div className="test-modal-actions">
                                    <button
                                        type="button"
                                        className="test-btn-modal-cancel"
                                        onClick={() => this.setState({ showJoinModal: false })}>
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="test-btn-modal-primary"
                                        disabled={!this.state.joinRoomInput.trim()}>
                                        Join Meeting
                                    </button>
                                </div>
                            </form>
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
                </main>
                {this.renderModals()}
            </div>
        );
    }
}

function _mapStateToProps(state: IReduxState) {
    return {
        _isAuthenticated: isAuthenticated(state),
        _user: getAuthUser(state)
    };
}

function _mapDispatchToProps(dispatch: any) {
    return {
        _createMeeting: () => dispatch(createMeeting())
    };
}

export default connect(_mapStateToProps, _mapDispatchToProps)(LandingPage);

