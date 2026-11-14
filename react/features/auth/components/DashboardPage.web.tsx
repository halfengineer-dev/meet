import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IReduxState } from '../../app/types';
import { createMeeting } from '../actions';
import { getAuthUser } from '../functions';
import UserMenu from './UserMenu';

export default function DashboardPage() {
    const dispatch = useDispatch();
    const user = useSelector((state: IReduxState) => getAuthUser(state));
    const [joinInput, setJoinInput] = useState('');
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

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
        } catch (_) {
            // Use as is
        }

        window.location.href = `/${encodeURIComponent(room)}`;
    };

    const displayName = user?.name || user?.email?.split('@')[0] || 'User';

    return (
        <div className="faceonn-dashboard-page">
            <header className="faceonn-dashboard-header">
                <a href="/dashboard" className="faceonn-auth-logo">
                    <img src="images/faceonn-neon-logo.png" alt="Faceonn" />
                </a>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <UserMenu />
                </div>
            </header>

            <main className="faceonn-dashboard-content">
                <div className="faceonn-dashboard-welcome">
                    <h1>Good day, {displayName}!</h1>
                    <p>Start a new secure video meeting or join an existing room.</p>
                </div>

                {createError && (
                    <div className="faceonn-auth-error" style={{ maxWidth: '500px', marginBottom: '24px' }}>
                        <span>{createError}</span>
                    </div>
                )}

                <div className="faceonn-action-cards">
                    {/* New Meeting Card */}
                    <div className="faceonn-action-card">
                        <div className="faceonn-card-icon orange">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="23 7 16 12 23 17 23 7" />
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                            </svg>
                        </div>
                        <h3>New Meeting</h3>
                        <p>Start an instant HD video conference as host with moderation controls.</p>
                        <button
                            className="faceonn-btn-primary"
                            style={{ margin: 0, width: 'auto', padding: '10px 24px' }}
                            onClick={handleCreateMeeting}
                            disabled={isCreating}>
                            {isCreating ? 'Creating Room...' : 'Start Meeting'}
                        </button>
                    </div>

                    {/* Join Meeting Card */}
                    <div className="faceonn-action-card">
                        <div className="faceonn-card-icon blue">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="16" />
                                <line x1="8" y1="12" x2="16" y2="12" />
                            </svg>
                        </div>
                        <h3>Join Meeting</h3>
                        <p>Enter a meeting link or room ID to participate in an active conference.</p>
                        <button
                            className="faceonn-btn-primary"
                            style={{
                                margin: 0,
                                width: 'auto',
                                padding: '10px 24px',
                                background: '#3b82f6',
                                boxShadow: '0 4px 16px rgba(59, 130, 246, 0.35)'
                            }}
                            onClick={() => setShowJoinModal(true)}>
                            Join via Code / Link
                        </button>
                    </div>
                </div>

                {/* Join Modal */}
                {showJoinModal && (
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(15, 23, 42, 0.6)',
                            backdropFilter: 'blur(4px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1100,
                            padding: '20px'
                        }}>
                        <div
                            style={{
                                background: '#ffffff',
                                borderRadius: '16px',
                                padding: '32px',
                                maxWidth: '420px',
                                width: '100%',
                                boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
                            }}>
                            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a' }}>
                                Join a Meeting
                            </h2>
                            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0' }}>
                                Enter the meeting room name or paste the full meeting link.
                            </p>

                            <form onSubmit={handleJoinSubmit}>
                                <div className="faceonn-form-group">
                                    <input
                                        type="text"
                                        className="faceonn-input"
                                        placeholder="e.g. daily-standup or meet-abc-xyz"
                                        value={joinInput}
                                        onChange={(e) => setJoinInput(e.target.value)}
                                        autoFocus
                                        required />
                                </div>

                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                                    <button
                                        type="button"
                                        style={{
                                            padding: '10px 18px',
                                            borderRadius: '8px',
                                            border: '1px solid #cbd5e1',
                                            background: '#ffffff',
                                            color: '#475569',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                        onClick={() => setShowJoinModal(false)}>
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="faceonn-btn-primary"
                                        style={{ margin: 0, width: 'auto', padding: '10px 24px' }}>
                                        Join Meeting
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

