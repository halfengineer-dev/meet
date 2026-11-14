import React, { useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IReduxState } from '../../app/types';
import { register, clearAuthError } from '../actions';
import { getAuthError, isAuthLoading } from '../functions';

export default function SignUpPage() {
    const dispatch = useDispatch();
    const error = useSelector((state: IReduxState) => getAuthError(state));
    const isLoading = useSelector((state: IReduxState) => isAuthLoading(state));

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const searchParams = new URLSearchParams(window.location.search);
    const redirectUrl = searchParams.get('redirect');

    // Calculate password strength
    const passwordStrength = useMemo(() => {
        if (!password) return { score: 0, label: '', className: '' };
        let score = 0;
        if (password.length >= 8) score += 1;
        if (/[a-zA-Z]/.test(password) && /[0-9]/.test(password)) score += 1;
        if (/[^a-zA-Z0-9]/.test(password)) score += 1;
        if (password.length >= 12) score += 1;

        switch (score) {
        case 1:
            return { score: 1, label: 'Weak', className: 'weak' };
        case 2:
            return { score: 2, label: 'Fair', className: 'fair' };
        case 3:
            return { score: 3, label: 'Good', className: 'good' };
        case 4:
            return { score: 4, label: 'Strong', className: 'strong' };
        default:
            return { score: 0, label: '', className: '' };
        }
    }, [password]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);
        dispatch(clearAuthError());

        if (!email.trim()) {
            setLocalError('Please enter your email address');
            return;
        }

        if (password.length < 8) {
            setLocalError('Password must be at least 8 characters long');
            return;
        }

        if (!(/[a-zA-Z]/.test(password) && /[0-9]/.test(password))) {
            setLocalError('Password must contain at least one letter and one number');
            return;
        }

        if (password !== confirmPassword) {
            setLocalError('Passwords do not match');
            return;
        }

        try {
            await dispatch(register(name.trim(), email.trim(), password, redirectUrl) as any);
        } catch (_) {
            // Handled via Redux state
        }
    };

    const loginLink = redirectUrl
        ? `/login?redirect=${encodeURIComponent(redirectUrl)}`
        : '/login';

    const displayError = localError || error;

    return (
        <div className="faceonn-auth-page">
            <header className="faceonn-auth-navbar">
                <a href="/" className="faceonn-auth-logo">
                    <img src="images/faceonn-neon-logo.png" alt="Faceonn" />
                </a>
                <a
                    href={loginLink}
                    style={{
                        color: '#ffffff',
                        fontSize: '14px',
                        fontWeight: 600,
                        textDecoration: 'none',
                        background: 'rgba(255, 255, 255, 0.08)',
                        padding: '8px 18px',
                        borderRadius: '20px',
                        border: '1px solid rgba(255, 255, 255, 0.22)'
                    }}>
                    Sign In
                </a>
            </header>

            <div className="faceonn-auth-body">
                <div className="faceonn-auth-card">
                    <div className="faceonn-auth-header">
                        <h1 className="faceonn-auth-title">Create Faceonn Account</h1>
                        <p className="faceonn-auth-subtitle">Get started with secure, high-definition video conferencing</p>
                    </div>

                    {displayError && (
                        <div className="faceonn-auth-error">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span>{displayError}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="faceonn-form-group">
                            <label className="faceonn-form-label" htmlFor="faceonn-signup-name">
                                Full Name
                            </label>
                            <input
                                id="faceonn-signup-name"
                                type="text"
                                className="faceonn-input"
                                placeholder="John Doe"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={isLoading}
                                autoFocus />
                        </div>

                        <div className="faceonn-form-group">
                            <label className="faceonn-form-label" htmlFor="faceonn-signup-email">
                                Email Address
                            </label>
                            <input
                                id="faceonn-signup-email"
                                type="email"
                                className="faceonn-input"
                                placeholder="name@company.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isLoading}
                                required />
                        </div>

                        <div className="faceonn-form-group">
                            <label className="faceonn-form-label" htmlFor="faceonn-signup-password">
                                Password
                            </label>
                            <div className="faceonn-input-wrapper">
                                <input
                                    id="faceonn-signup-password"
                                    type={showPassword ? 'text' : 'password'}
                                    className="faceonn-input"
                                    placeholder="At least 8 characters (letters & numbers)"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={isLoading}
                                    required />
                                <button
                                    type="button"
                                    className="faceonn-input-icon-btn"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                    {showPassword ? (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                            <line x1="1" y1="1" x2="23" y2="23" />
                                        </svg>
                                    ) : (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                            <circle cx="12" cy="12" r="3" />
                                        </svg>
                                    )}
                                </button>
                            </div>

                            {password && (
                                <div className="faceonn-strength-container">
                                    <div className="faceonn-strength-bars">
                                        {[1, 2, 3, 4].map(idx => (
                                            <div
                                                key={idx}
                                                className={`faceonn-strength-bar ${idx <= passwordStrength.score ? passwordStrength.className : ''}`} />
                                        ))}
                                    </div>
                                    <div className="faceonn-strength-label">
                                        <span>Strength: {passwordStrength.label}</span>
                                        <span>Min. 8 chars (letters + numbers)</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="faceonn-form-group">
                            <label className="faceonn-form-label" htmlFor="faceonn-signup-confirm">
                                Confirm Password
                            </label>
                            <input
                                id="faceonn-signup-confirm"
                                type={showPassword ? 'text' : 'password'}
                                className="faceonn-input"
                                placeholder="Re-enter your password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                disabled={isLoading}
                                required />
                        </div>

                        <button
                            type="submit"
                            className="faceonn-btn-primary"
                            disabled={isLoading}>
                            {isLoading ? 'Creating Account...' : 'Create Account'}
                        </button>
                    </form>

                    <div className="faceonn-auth-footer">
                        Already have an account?{' '}
                        <a href={loginLink}>
                            Sign in
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

