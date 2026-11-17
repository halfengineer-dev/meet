/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import React, { useState } from 'react';

interface PasscodePromptModalProps {
    roomId: string;
    onClose: () => void;
    onSubmit: (passcode: string) => void;
    error?: string | null;
}

export default function PasscodePromptModal({
    roomId,
    onClose,
    onSubmit,
    error
}: PasscodePromptModalProps) {
    const [passcode, setPasscode] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (passcode.trim()) {
            onSubmit(passcode.trim());
        }
    };

    return (
        <div className="faceonn-dash-modal-overlay" onClick={onClose}>
            <div className="faceonn-dash-modal-card" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
                <div className="faceonn-dash-modal-header">
                    <div className="modal-title-with-badge">
                        <div className="modal-badge-icon blue">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                        </div>
                        <h3>Passcode Required</h3>
                    </div>
                    <button type="button" className="dash-modal-close" onClick={onClose}>
                        ✕
                    </button>
                </div>

                <p className="dash-modal-desc">
                    This meeting room (<strong>{roomId}</strong>) is protected by a meeting passcode. Enter the passcode
                    provided in your invitation to join.
                </p>

                {error && <div className="schedule-field-error" style={{ marginBottom: '12px' }}>{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="faceonn-dash-input-group">
                        <label>Meeting Passcode</label>
                        <input
                            type="password"
                            className="schedule-input-text"
                            placeholder="Enter meeting passcode"
                            value={passcode}
                            onChange={e => setPasscode(e.target.value)}
                            autoFocus
                            required />
                    </div>

                    <div className="dash-modal-actions">
                        <button type="button" className="faceonn-dash-btn-cancel" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="faceonn-dash-btn-action blue">
                            Join Meeting →
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

