import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IReduxState } from '../../app/types';
import { login, clearAuthError } from '../actions';
import { getAuthError, isAuthLoading } from '../functions';

export default function LoginPage() {
    const dispatch = useDispatch();
    const error = useSelector((state: IReduxState) => getAuthError(state));
    const isLoading = useSelector((state: IReduxState) => isAuthLoading(state));

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    // Parse ?redirect= param from URL if present
    const searchParams = new URLSearchParams(window.location.search);
    const redirectUrl = searchParams.get('redirect');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);
        dispatch(clearAuthError());

        if (!email.trim()) {
            setLocalError('Please enter your email address');
            return;
        }

        if (!password) {
            setLocalError('Please enter your password');
            return;
        }

        try {
            await dispatch(login(email.trim(), password, redirectUrl) as any);
        } catch (_) {
            // Handled via Redux state
        }
    };

    const signupLink = redirectUrl
        ? `/signup?redirect=${encodeURIComponent(redirectUrl)}`
        : '/signup';

    const displayError = localError || error;

    return (
        <div className="faceonn-auth-page">
            <header className="faceonn-auth-navbar">
                <a href="/" className="faceonn-auth-logo">
                    <img src="images/faceonn-neon-logo.png" alt="Faceonn" />
                </a>
                <a
                    href={signupLink}
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
                    Sign Up Free
                </a>
            </header>

            <div className="faceonn-auth-body">
                <div className="faceonn-auth-card">
                    <div className="faceonn-auth-header">
                        <h1 className="faceonn-auth-title">Welcome Back</h1>
                        <p className="faceonn-auth-subtitle">Sign in to your Faceonn account to continue</p>
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
                            <label className="faceonn-form-label" htmlFor="faceonn-login-email">
                                Email Address
                            </label>
                            <input
                                id="faceonn-login-email"
                                type="email"
                                className="faceonn-input"
                                placeholder="name@company.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isLoading}
                                autoFocus
                                required />
                        </div>

                        <div className="faceonn-form-group">
                            <label className="faceonn-form-label" htmlFor="faceonn-login-password">
                                Password
                            </label>
                            <div className="faceonn-input-wrapper">
                                <input
                                    id="faceonn-login-password"
                                    type={showPassword ? 'text' : 'password'}
                                    className="faceonn-input"
                                    placeholder="Enter your password"
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
                        </div>

                        <button
                            type="submit"
                            className="faceonn-btn-primary"
                            disabled={isLoading}>
                            {isLoading ? 'Signing In...' : 'Sign In'}
                        </button>
                    </form>

                    <div className="faceonn-auth-footer">
                        Don&apos;t have an account?{' '}
                        <a href={signupLink}>
                            Sign up free
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

