/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import { IReduxState } from '../../app/types';
import { authApiClient } from '../api';
import { getAccessToken, getAuthUser } from '../functions';
import { IUser } from '../types';

interface ICredentialsNotice {
    email: string;
    name: string;
    password: string;
    title: string;
}

export default function AdminOnboardingView() {
    const accessToken = useSelector((state: IReduxState) => getAccessToken(state));
    const currentUser = useSelector((state: IReduxState) => getAuthUser(state));

    const [ users, setUsers ] = useState<IUser[]>([]);
    const [ loadingUsers, setLoadingUsers ] = useState(false);
    const [ searchQuery, setSearchQuery ] = useState('');
    const [ listError, setListError ] = useState<string | null>(null);

    // Onboarding form state
    const [ name, setName ] = useState('');
    const [ email, setEmail ] = useState('');
    const [ password, setPassword ] = useState('');
    const [ role, setRole ] = useState<'user' | 'admin'>('user');
    const [ showPassword, setShowPassword ] = useState(false);
    const [ isSubmitting, setIsSubmitting ] = useState(false);
    const [ formError, setFormError ] = useState<string | null>(null);

    // Credentials banner after onboarding or password reset
    const [ credentialsNotice, setCredentialsNotice ] = useState<ICredentialsNotice | null>(null);
    const [ copiedCredentials, setCopiedCredentials ] = useState(false);

    // Per-user action loading state
    const [ busyUserId, setBusyUserId ] = useState<string | null>(null);

    const fetchUsers = useCallback(async (query?: string) => {
        if (!accessToken) {
            return;
        }
        setLoadingUsers(true);
        setListError(null);
        try {
            const data = await authApiClient.adminListUsers(accessToken, query);

            setUsers(data.users || []);
        } catch (err: any) {
            setListError(err.message || 'Failed to load participants');
        } finally {
            setLoadingUsers(false);
        }
    }, [ accessToken ]);

    useEffect(() => {
        fetchUsers(searchQuery);
    }, [ fetchUsers, searchQuery ]);

    const handleOnboardSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accessToken) {
            return;
        }

        setFormError(null);

        if (!name.trim()) {
            setFormError('Please enter the participant name');

            return;
        }
        if (!email.trim()) {
            setFormError('Please enter the participant email');

            return;
        }

        setIsSubmitting(true);
        try {
            const enteredPassword = password.trim();
            const res = await authApiClient.adminOnboardUser({
                name: name.trim(),
                email: email.trim(),
                ...(enteredPassword ? { password: enteredPassword } : {}),
                role
            }, accessToken);

            const resolvedPassword = res.temporaryPassword || enteredPassword;

            setCredentialsNotice({
                title: `${res.user.name || res.user.email} has been onboarded`,
                name: res.user.name || res.user.email,
                email: res.user.email,
                password: resolvedPassword
            });
            setCopiedCredentials(false);
            setName('');
            setEmail('');
            setPassword('');
            setRole('user');
            await fetchUsers(searchQuery);
        } catch (err: any) {
            setFormError(err.message || 'Failed to onboard participant');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCopyCredentials = () => {
        if (!credentialsNotice) {
            return;
        }
        const loginUrl = `${window.location.origin}/login`;
        const text = [
            `Faceonn Account Details for ${credentialsNotice.name}`,
            `Login URL: ${loginUrl}`,
            `Email: ${credentialsNotice.email}`,
            `Password: ${credentialsNotice.password}`
        ].join('\n');

        navigator.clipboard.writeText(text);
        setCopiedCredentials(true);
        setTimeout(() => setCopiedCredentials(false), 2500);
    };

    const handleToggleStatus = async (target: IUser) => {
        if (!accessToken) {
            return;
        }
        const nextStatus = target.status === 'active' ? 'deactivated' : 'active';

        setBusyUserId(target.id);
        setListError(null);
        try {
            await authApiClient.adminUpdateUser(target.id, { status: nextStatus }, accessToken);
            await fetchUsers(searchQuery);
        } catch (err: any) {
            setListError(err.message || 'Failed to update user status');
        } finally {
            setBusyUserId(null);
        }
    };

    const handleToggleRole = async (target: IUser) => {
        if (!accessToken) {
            return;
        }
        const nextRole = target.role === 'admin' ? 'user' : 'admin';

        setBusyUserId(target.id);
        setListError(null);
        try {
            await authApiClient.adminUpdateUser(target.id, { role: nextRole }, accessToken);
            await fetchUsers(searchQuery);
        } catch (err: any) {
            setListError(err.message || 'Failed to update user role');
        } finally {
            setBusyUserId(null);
        }
    };

    const handleResetPassword = async (target: IUser) => {
        if (!accessToken) {
            return;
        }
        setBusyUserId(target.id);
        setListError(null);
        try {
            const res = await authApiClient.adminUpdateUser(target.id, { generatePassword: true }, accessToken);

            if (res.temporaryPassword) {
                setCredentialsNotice({
                    title: `Password reset for ${target.name || target.email}`,
                    name: target.name || target.email,
                    email: target.email,
                    password: res.temporaryPassword
                });
                setCopiedCredentials(false);
            }
        } catch (err: any) {
            setListError(err.message || 'Failed to reset password');
        } finally {
            setBusyUserId(null);
        }
    };

    const handleDeleteUser = async (target: IUser) => {
        if (!accessToken) {
            return;
        }
        const confirmed = window.confirm(
            `Remove ${target.name || target.email} (${target.email})? This will revoke their access immediately.`
        );

        if (!confirmed) {
            return;
        }

        setBusyUserId(target.id);
        setListError(null);
        try {
            await authApiClient.adminDeleteUser(target.id, accessToken);
            await fetchUsers(searchQuery);
        } catch (err: any) {
            setListError(err.message || 'Failed to delete participant');
        } finally {
            setBusyUserId(null);
        }
    };

    const getInitials = (displayName?: string | null, userEmail?: string) => {
        const source = (displayName || userEmail || 'U').trim();
        const parts = source.split(/\s+/);

        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }

        return source.slice(0, 2).toUpperCase();
    };

    return (
        <div className = 'faceonn-dash-body'>
            <div className = 'faceonn-dash-welcome'>
                <h1>Onboard Participants</h1>
                <p>Public sign up is disabled. Create and manage participant accounts from here.</p>
            </div>

            {credentialsNotice && (
                <div className = 'faceonn-admin-creds-banner'>
                    <div className = 'admin-creds-header'>
                        <div>
                            <strong>✓ {credentialsNotice.title}</strong>
                            <p>Share these credentials securely with the participant so they can sign in.</p>
                        </div>
                        <button
                            className = 'admin-creds-close'
                            onClick = { () => setCredentialsNotice(null) }
                            type = 'button'>
                            ✕
                        </button>
                    </div>
                    <div className = 'admin-creds-grid'>
                        <div>
                            <span className = 'creds-label'>Login URL</span>
                            <code>{window.location.origin}/login</code>
                        </div>
                        <div>
                            <span className = 'creds-label'>Email</span>
                            <code>{credentialsNotice.email}</code>
                        </div>
                        <div>
                            <span className = 'creds-label'>Password</span>
                            <code>{credentialsNotice.password}</code>
                        </div>
                    </div>
                    <div className = 'admin-creds-actions'>
                        <button
                            className = 'faceonn-dash-btn-action blue'
                            onClick = { handleCopyCredentials }
                            type = 'button'>
                            {copiedCredentials ? '✓ Credentials Copied!' : 'Copy Login Credentials'}
                        </button>
                    </div>
                </div>
            )}

            {/* Card 1: Onboard New Participant Form */}
            <div
                className = 'faceonn-dash-card-white faceonn-admin-card'
                style = {{ marginBottom: '24px' }}>
                <div className = 'faceonn-admin-card-header'>
                    <div>
                        <h3>Onboard New Participant</h3>
                        <p>Leave password empty to auto-generate a strong temporary password.</p>
                    </div>
                </div>

                {formError && (
                    <div
                        className = 'schedule-error-banner'
                        style = {{ marginBottom: '16px' }}>
                        <span>⚠️ {formError}</span>
                    </div>
                )}

                <form
                    className = 'faceonn-admin-form'
                    onSubmit = { handleOnboardSubmit }>
                    <div className = 'faceonn-admin-form-grid'>
                        <div className = 'faceonn-admin-field'>
                            <label htmlFor = 'admin-onboard-name'>Full Name *</label>
                            <input
                                disabled = { isSubmitting }
                                id = 'admin-onboard-name'
                                onChange = { e => setName(e.target.value) }
                                placeholder = 'e.g. Priya Sharma'
                                required = { true }
                                type = 'text'
                                value = { name } />
                        </div>

                        <div className = 'faceonn-admin-field'>
                            <label htmlFor = 'admin-onboard-email'>Email Address *</label>
                            <input
                                disabled = { isSubmitting }
                                id = 'admin-onboard-email'
                                onChange = { e => setEmail(e.target.value) }
                                placeholder = 'participant@company.com'
                                required = { true }
                                type = 'email'
                                value = { email } />
                        </div>

                        <div className = 'faceonn-admin-field'>
                            <label htmlFor = 'admin-onboard-password'>Password (Optional)</label>
                            <div className = 'faceonn-admin-password-wrap'>
                                <input
                                    disabled = { isSubmitting }
                                    id = 'admin-onboard-password'
                                    onChange = { e => setPassword(e.target.value) }
                                    placeholder = 'Leave blank to auto-generate'
                                    type = { showPassword ? 'text' : 'password' }
                                    value = { password } />
                                <button
                                    className = 'admin-pass-toggle'
                                    onClick = { () => setShowPassword(!showPassword) }
                                    type = 'button'>
                                    {showPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                        </div>

                        <div className = 'faceonn-admin-field'>
                            <label htmlFor = 'admin-onboard-role'>Role</label>
                            <select
                                disabled = { isSubmitting }
                                id = 'admin-onboard-role'
                                onChange = { e => setRole(e.target.value as 'user' | 'admin') }
                                value = { role }>
                                <option value = 'user'>Participant</option>
                                <option value = 'admin'>Administrator</option>
                            </select>
                        </div>
                    </div>

                    <div className = 'faceonn-admin-form-footer'>
                        <button
                            className = 'faceonn-dash-btn-action blue'
                            disabled = { isSubmitting }
                            type = 'submit'>
                            {isSubmitting ? 'Onboarding...' : '+ Onboard Participant'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Card 2: Onboarded Participants Directory */}
            <div className = 'faceonn-dash-card-white faceonn-admin-card'>
                <div className = 'faceonn-admin-card-header'>
                    <div>
                        <h3>Onboarded Participants ({users.length})</h3>
                        <p>Manage access, roles, and passwords for onboarded accounts.</p>
                    </div>
                    <input
                        className = 'faceonn-admin-search'
                        onChange = { e => setSearchQuery(e.target.value) }
                        placeholder = 'Search by name or email...'
                        type = 'text'
                        value = { searchQuery } />
                </div>

                {listError && (
                    <div
                        className = 'schedule-error-banner'
                        style = {{ marginBottom: '16px' }}>
                        <span>⚠️ {listError}</span>
                    </div>
                )}

                {loadingUsers ? (
                    <p className = 'admin-loading-text'>Loading participants...</p>
                ) : users.length === 0 ? (
                    <div
                        className = 'dash-empty-state'
                        style = {{ padding: '32px 0' }}>
                        <h4>No participants found</h4>
                        <p>Use the form above to onboard your first participant.</p>
                    </div>
                ) : (
                    <div className = 'faceonn-admin-user-list'>
                        {users.map(u => {
                            const isSelf = u.id === currentUser?.id;
                            const isBusy = busyUserId === u.id;

                            return (
                                <div
                                    className = 'faceonn-admin-user-row'
                                    key = { u.id }>
                                    <div className = 'admin-user-info'>
                                        <span className = 'admin-user-avatar'>
                                            {getInitials(u.name, u.email)}
                                        </span>
                                        <div className = 'admin-user-details'>
                                            <div className = 'admin-user-title-row'>
                                                <strong>{u.name || u.email.split('@')[0]}</strong>
                                                {isSelf && <span className = 'admin-pill you'>You</span>}
                                                <span className = { `admin-pill ${u.role === 'admin' ? 'role-admin' : 'role-user'}` }>
                                                    {u.role === 'admin' ? 'Admin' : 'Participant'}
                                                </span>
                                                <span className = { `admin-pill ${u.status === 'active' ? 'status-active' : 'status-inactive'}` }>
                                                    {u.status === 'active' ? 'Active' : u.status}
                                                </span>
                                            </div>
                                            <div className = 'admin-user-meta'>
                                                <span>{u.email}</span>
                                                <span>•</span>
                                                <span>
                                                    {u.lastLoginAt
                                                        ? `Last login ${new Date(u.lastLoginAt).toLocaleDateString()}`
                                                        : 'Never signed in'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {!isSelf && (
                                        <div className = 'admin-user-actions'>
                                            <button
                                                className = 'schedule-btn-secondary'
                                                disabled = { isBusy }
                                                onClick = { () => handleResetPassword(u) }
                                                type = 'button'>
                                                Reset Password
                                            </button>
                                            <button
                                                className = 'schedule-btn-secondary'
                                                disabled = { isBusy }
                                                onClick = { () => handleToggleRole(u) }
                                                type = 'button'>
                                                {u.role === 'admin' ? 'Make Participant' : 'Make Admin'}
                                            </button>
                                            <button
                                                className = 'schedule-btn-secondary'
                                                disabled = { isBusy }
                                                onClick = { () => handleToggleStatus(u) }
                                                type = 'button'>
                                                {u.status === 'active' ? 'Deactivate' : 'Activate'}
                                            </button>
                                            <button
                                                className = 'schedule-btn-danger'
                                                disabled = { isBusy }
                                                onClick = { () => handleDeleteUser(u) }
                                                type = 'button'>
                                                Remove
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
