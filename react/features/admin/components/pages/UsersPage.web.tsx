/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import {
    ArrowLeft,
    CheckCircle,
    Download,
    KeyRound,
    LogOut,
    Plus,
    RefreshCw,
    Search,
    Shield,
    Trash2,
    UserCheck,
    UserX
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { adminApi } from '../../api';
import { IAdminContextInfo, IAdminOrganizationRow, IAdminUserRow, IPagination } from '../../types';
import ConfirmModal from '../shared/ConfirmModal.web';

interface IUsersPageProps {
    accessToken: string;
    adminContext: IAdminContextInfo;
    initialFocusId?: string | null;
    mode: 'users' | 'suspended-users' | 'roles';
}

export default function UsersPage({ accessToken, adminContext, mode, initialFocusId }: IUsersPageProps) {
    const [ users, setUsers ] = useState<IAdminUserRow[]>([]);
    const [ pagination, setPagination ] = useState<IPagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
    const [ orgs, setOrgs ] = useState<IAdminOrganizationRow[]>([]);
    const [ roles, setRoles ] = useState<any[]>([]);
    const [ loading, setLoading ] = useState(true);
    const [ error, setError ] = useState<string | null>(null);
    const [ notice, setNotice ] = useState<string | null>(null);

    // Filters
    const [ search, setSearch ] = useState('');
    const [ statusFilter, setStatusFilter ] = useState(mode === 'suspended-users' ? 'suspended' : '');
    const [ orgFilter, setOrgFilter ] = useState('');
    const [ page, setPage ] = useState(1);

    // User detail view
    const [ selectedUserId, setSelectedUserId ] = useState<string | null>(initialFocusId || null);
    const [ userDetail, setUserDetail ] = useState<any>(null);
    const [ loadingDetail, setLoadingDetail ] = useState(false);

    // Onboard modal
    const [ showCreateModal, setShowCreateModal ] = useState(false);
    const [ newName, setNewName ] = useState('');
    const [ newEmail, setNewEmail ] = useState('');
    const [ newPassword, setNewPassword ] = useState('');
    const [ newAdminRole, setNewAdminRole ] = useState('');
    const [ newOrgId, setNewOrgId ] = useState('');
    const [ newCountry, setNewCountry ] = useState('');
    const [ tempPasswordBanner, setTempPasswordBanner ] = useState<{ email: string; password: string; } | null>(null);

    // Destructive confirm
    const [ confirmState, setConfirmState ] = useState<{ action: 'suspend' | 'delete' | 'revoke'; user: IAdminUserRow; } | null>(null);
    const [ busy, setBusy ] = useState(false);

    const canManage = adminContext.isSuperAdmin || adminContext.permissions.includes('users:manage');
    const canDelete = adminContext.isSuperAdmin || adminContext.permissions.includes('users:delete');
    const canExport = adminContext.isSuperAdmin || adminContext.permissions.includes('users:export');

    useEffect(() => {
        setStatusFilter(mode === 'suspended-users' ? 'suspended' : '');
        setPage(1);
    }, [ mode ]);

    useEffect(() => {
        if (initialFocusId) {
            setSelectedUserId(initialFocusId);
        }
    }, [ initialFocusId ]);

    const loadDirectory = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (mode === 'roles') {
                const res = await adminApi.getRoles(accessToken);

                setRoles(res.roles || []);

                return;
            }
            const [ usersRes, orgsRes ] = await Promise.all([
                adminApi.listUsers(accessToken, {
                    search: search.trim() || undefined,
                    status: statusFilter || undefined,
                    organizationId: orgFilter || undefined,
                    page,
                    limit: 20
                }),
                adminContext.permissions.includes('organizations:view')
                    ? adminApi.listOrganizations(accessToken).catch(() => ({ organizations: [] }))
                    : Promise.resolve({ organizations: [] })
            ]);

            setUsers(usersRes.users || []);
            setPagination(usersRes.pagination || { page: 1, limit: 20, total: usersRes.total, totalPages: 1 });
            setOrgs(orgsRes.organizations || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load users');
        } finally {
            setLoading(false);
        }
    }, [ accessToken, adminContext.permissions, mode, orgFilter, page, search, statusFilter ]);

    useEffect(() => {
        loadDirectory();
    }, [ loadDirectory ]);

    const loadUserDetail = useCallback(async (uid: string) => {
        setLoadingDetail(true);
        setError(null);
        try {
            const detail = await adminApi.getUserDetail(accessToken, uid);

            setUserDetail(detail);
        } catch (err: any) {
            setError(err.message || 'Failed to load user detail');
        } finally {
            setLoadingDetail(false);
        }
    }, [ accessToken ]);

    useEffect(() => {
        if (selectedUserId) {
            loadUserDetail(selectedUserId);
        } else {
            setUserDetail(null);
        }
    }, [ loadUserDetail, selectedUserId ]);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const res = await adminApi.createUser(accessToken, {
                name: newName.trim(),
                email: newEmail.trim(),
                ...(newPassword.trim() ? { password: newPassword.trim() } : {}),
                ...(newAdminRole ? { role: 'admin', adminRole: newAdminRole } : { role: 'user' }),
                ...(newOrgId ? { organizationId: newOrgId } : {}),
                ...(newCountry.trim() ? { country: newCountry.trim() } : {})
            });

            if (res.temporaryPassword) {
                setTempPasswordBanner({ email: res.user.email, password: res.temporaryPassword });
            } else {
                setNotice(`User ${res.user.email} onboarded successfully.`);
            }
            setShowCreateModal(false);
            setNewName('');
            setNewEmail('');
            setNewPassword('');
            setNewAdminRole('');
            setNewCountry('');
            await loadDirectory();
        } catch (err: any) {
            setError(err.message || 'Failed to onboard user');
        } finally {
            setBusy(false);
        }
    };

    const handleExecuteConfirm = async (reason?: string) => {
        if (!confirmState) {
            return;
        }
        setBusy(true);
        setError(null);
        try {
            if (confirmState.action === 'suspend') {
                await adminApi.suspendUser(accessToken, confirmState.user.id, reason);
                setNotice(`Account ${confirmState.user.email} suspended and active sessions revoked.`);
            } else if (confirmState.action === 'revoke') {
                await adminApi.revokeUserSessions(accessToken, confirmState.user.id);
                setNotice(`All sessions revoked for ${confirmState.user.email}.`);
            } else if (confirmState.action === 'delete') {
                await adminApi.deleteUser(accessToken, confirmState.user.id);
                setNotice(`Account ${confirmState.user.email} soft-deleted (financial & audit records retained).`);
                if (selectedUserId === confirmState.user.id) {
                    setSelectedUserId(null);
                }
            }
            setConfirmState(null);
            await loadDirectory();
            if (selectedUserId && confirmState.action !== 'delete') {
                await loadUserDetail(selectedUserId);
            }
        } catch (err: any) {
            setError(err.message || 'Operation failed');
        } finally {
            setBusy(false);
        }
    };

    const handleReactivate = async (user: IAdminUserRow) => {
        setBusy(true);
        try {
            await adminApi.reactivateUser(accessToken, user.id);
            setNotice(`Account ${user.email} reactivated.`);
            await loadDirectory();
            if (selectedUserId === user.id) {
                await loadUserDetail(user.id);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to reactivate user');
        } finally {
            setBusy(false);
        }
    };

    const handleResetPassword = async (user: IAdminUserRow) => {
        setBusy(true);
        try {
            const res = await adminApi.updateUser(accessToken, user.id, { generatePassword: true });

            if (res.temporaryPassword) {
                setTempPasswordBanner({ email: user.email, password: res.temporaryPassword });
            }
        } catch (err: any) {
            setError(err.message || 'Failed to reset credentials');
        } finally {
            setBusy(false);
        }
    };

    const handleExportUserJson = async (userId: string) => {
        try {
            const data = await adminApi.exportUserData(accessToken, userId);
            const blob = new Blob([ JSON.stringify(data, null, 2) ], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');

            a.href = url;
            a.download = `faceonn-user-${userId.slice(0, 8)}.json`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            setError(err.message || 'Failed to export user data');
        }
    };

    // Roles & Permissions View
    if (mode === 'roles') {
        return (
            <div className = 'fa-page'>
                <div className = 'fa-page-header'>
                    <div>
                        <h1>Roles &amp; Permissions Matrix</h1>
                        <p>Centralized backend-enforced RBAC roles across platform and organization scopes.</p>
                    </div>
                </div>
                {error && <div className = 'fa-alert-error'>{error}</div>}
                <div className = 'fa-role-grid'>
                    {roles.map(role => (
                        <div
                            className = 'fa-card'
                            key = { role.slug }>
                            <div className = 'fa-card-header'>
                                <div>
                                    <h3><Shield size = { 16 } /> {role.name}</h3>
                                    <p>{role.description}</p>
                                </div>
                                <span className = 'fa-badge'>{role.scope}</span>
                            </div>
                            <div className = 'fa-chip-list'>
                                {(role.permissions || []).length === 0 ? (
                                    <span className = 'fa-muted-xs'>No administrative panel permissions</span>
                                ) : (
                                    role.permissions.map((p: string) => (
                                        <span
                                            className = 'fa-chip'
                                            key = { p }>{p}</span>
                                    ))
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // User Detail View
    if (selectedUserId) {
        const profile = userDetail?.profile;

        return (
            <div className = 'fa-page'>
                <div className = 'fa-page-header'>
                    <div>
                        <button
                            className = 'fa-link-btn'
                            onClick = { () => setSelectedUserId(null) }
                            type = 'button'>
                            <ArrowLeft size = { 15 } /> Back to User Directory
                        </button>
                        <h1>{profile?.name || profile?.email || 'User Detail'}</h1>
                        <p>User ID: <code>{selectedUserId}</code></p>
                    </div>
                    {profile && (
                        <div className = 'fa-header-actions'>
                            {canManage && profile.status === 'active' && (
                                <button
                                    className = 'fa-btn fa-btn-secondary'
                                    onClick = { () => setConfirmState({ action: 'suspend', user: profile }) }
                                    type = 'button'>
                                    <UserX size = { 15 } /> Suspend
                                </button>
                            )}
                            {canManage && profile.status !== 'active' && (
                                <button
                                    className = 'fa-btn fa-btn-primary'
                                    onClick = { () => handleReactivate(profile) }
                                    type = 'button'>
                                    <UserCheck size = { 15 } /> Reactivate
                                </button>
                            )}
                            {canManage && (
                                <button
                                    className = 'fa-btn fa-btn-secondary'
                                    onClick = { () => setConfirmState({ action: 'revoke', user: profile }) }
                                    type = 'button'>
                                    <LogOut size = { 15 } /> Force Logout
                                </button>
                            )}
                            {canManage && (
                                <button
                                    className = 'fa-btn fa-btn-secondary'
                                    onClick = { () => handleResetPassword(profile) }
                                    type = 'button'>
                                    <KeyRound size = { 15 } /> Reset Password
                                </button>
                            )}
                            {canExport && (
                                <button
                                    className = 'fa-btn fa-btn-secondary'
                                    onClick = { () => handleExportUserJson(profile.id) }
                                    type = 'button'>
                                    <Download size = { 15 } /> Export Data
                                </button>
                            )}
                            {canDelete && (
                                <button
                                    className = 'fa-btn fa-btn-danger-outline'
                                    onClick = { () => setConfirmState({ action: 'delete', user: profile }) }
                                    type = 'button'>
                                    <Trash2 size = { 15 } /> Delete
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {error && <div className = 'fa-alert-error'>{error}</div>}
                {notice && <div className = 'fa-alert-success'>{notice}</div>}
                {tempPasswordBanner && (
                    <div className = 'fa-alert-success'>
                        Temporary password for <strong>{tempPasswordBanner.email}</strong>: <code>{tempPasswordBanner.password}</code>
                    </div>
                )}
                {loadingDetail && <div className = 'fa-loading-box'>Loading user profile...</div>}

                {userDetail && profile && (
                    <>
                        <div className = 'fa-grid-2'>
                            <div className = 'fa-card'>
                                <div className = 'fa-card-header'><h3>Profile</h3></div>
                                <dl className = 'fa-dl'>
                                    <dt>Full Name</dt><dd>{profile.name || '—'}</dd>
                                    <dt>Email</dt><dd>{profile.email}</dd>
                                    <dt>Status</dt><dd><span className = { `fa-badge fa-badge-${profile.status}` }>{profile.status}</span></dd>
                                    <dt>Verified</dt><dd>{profile.emailVerified ? 'Verified' : 'Unverified'}</dd>
                                    <dt>Platform Role</dt><dd>{profile.adminRole || profile.role}</dd>
                                    <dt>Organization</dt><dd>{profile.organization?.name || 'None'}</dd>
                                    <dt>Country</dt><dd>{profile.country || 'Unspecified'}</dd>
                                    <dt>Registered</dt><dd>{new Date(profile.createdAt).toLocaleString()}</dd>
                                </dl>
                                {adminContext.isSuperAdmin && profile.id !== adminContext.userId && (
                                    <div className = 'fa-inline-role-edit'>
                                        <label>Assign Platform Role:</label>
                                        <select
                                            className = 'fa-select'
                                            onChange = { async e => {
                                                const val = e.target.value || null;

                                                await adminApi.updateUser(accessToken, profile.id, {
                                                    role: val ? 'admin' : 'user',
                                                    adminRole: val
                                                });
                                                await loadUserDetail(profile.id);
                                                setNotice('Administrator role updated.');
                                            } }
                                            value = { profile.adminRole || '' }>
                                            <option value = ''>Standard User</option>
                                            <option value = 'super_admin'>Super Admin</option>
                                            <option value = 'platform_admin'>Platform Admin</option>
                                            <option value = 'support_admin'>Support Admin</option>
                                            <option value = 'billing_admin'>Billing Admin</option>
                                            <option value = 'technical_admin'>Technical Admin</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div className = 'fa-card'>
                                <div className = 'fa-card-header'><h3>Subscription &amp; Meeting Summary</h3></div>
                                <dl className = 'fa-dl'>
                                    <dt>Current Plan</dt><dd><strong>{userDetail.subscription?.currentPlan}</strong> ({userDetail.subscription?.status})</dd>
                                    <dt>Renewal Date</dt><dd>{userDetail.subscription?.renewalDate ? new Date(userDetail.subscription.renewalDate).toLocaleDateString() : '—'}</dd>
                                    <dt>Meetings Hosted</dt><dd>{userDetail.meetingHistory?.totalHosted ?? 0}</dd>
                                    <dt>Meetings Attended</dt><dd>{userDetail.meetingHistory?.totalAttended ?? 0}</dd>
                                    <dt>Upcoming / Recurring</dt><dd>{userDetail.meetingHistory?.upcomingCount ?? 0} / {userDetail.meetingHistory?.recurringCount ?? 0}</dd>
                                    <dt>Last Login</dt><dd>{userDetail.activity?.lastLoginAt ? new Date(userDetail.activity.lastLoginAt).toLocaleString() : 'Never'}</dd>
                                </dl>
                            </div>
                        </div>

                        <div className = 'fa-grid-2'>
                            <div className = 'fa-card'>
                                <div className = 'fa-card-header'><h3>Active Sessions ({userDetail.activity?.activeSessions?.length || 0})</h3></div>
                                <div className = 'fa-table-wrap'>
                                    <table className = 'fa-table'>
                                        <thead><tr><th>Device</th><th>IP</th><th>Last Used</th></tr></thead>
                                        <tbody>
                                            {(userDetail.activity?.activeSessions || []).length === 0 ? (
                                                <tr><td
                                                    className = 'fa-muted'
                                                    colSpan = { 3 }>No active sessions.</td></tr>
                                            ) : (
                                                userDetail.activity.activeSessions.map((s: any) => (
                                                    <tr key = { s.id }>
                                                        <td>{s.browser} on {s.os} ({s.deviceType})</td>
                                                        <td><code>{s.ipAddress || '—'}</code></td>
                                                        <td>{new Date(s.lastUsedAt).toLocaleString()}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className = 'fa-card'>
                                <div className = 'fa-card-header'><h3>Recent Meetings</h3></div>
                                <div className = 'fa-table-wrap'>
                                    <table className = 'fa-table'>
                                        <thead><tr><th>Topic</th><th>Type</th><th>Status</th></tr></thead>
                                        <tbody>
                                            {(userDetail.meetingHistory?.recentMeetings || []).length === 0 ? (
                                                <tr><td
                                                    className = 'fa-muted'
                                                    colSpan = { 3 }>No meetings found.</td></tr>
                                            ) : (
                                                userDetail.meetingHistory.recentMeetings.map((m: any) => (
                                                    <tr key = { m.id }>
                                                        <td><strong>{m.title}</strong><div className = 'fa-muted-xs'>/{m.roomId}</div></td>
                                                        <td>{m.meetingType}</td>
                                                        <td><span className = { `fa-badge fa-badge-${m.status}` }>{m.status}</span></td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {confirmState && (
                    <ConfirmModal
                        confirmLabel = { confirmState.action === 'delete' ? 'Delete Account' : confirmState.action === 'suspend' ? 'Suspend Account' : 'Revoke Sessions' }
                        danger = { true }
                        description = {
                            confirmState.action === 'delete'
                                ? `Soft-delete ${confirmState.user.email}? Active sessions will terminate immediately while financial and audit records are retained.`
                                : confirmState.action === 'suspend'
                                    ? `Suspend ${confirmState.user.email} and terminate all active sessions?`
                                    : `Force logout all active devices for ${confirmState.user.email}?`
                        }
                        isLoading = { busy }
                        onCancel = { () => setConfirmState(null) }
                        onConfirm = { handleExecuteConfirm }
                        requireReason = { confirmState.action === 'suspend' }
                        title = { `Confirm ${confirmState.action}` } />
                )}
            </div>
        );
    }

    // Main User Directory
    return (
        <div className = 'fa-page'>
            <div className = 'fa-page-header'>
                <div>
                    <h1>{mode === 'suspended-users' ? 'Suspended Accounts' : 'User Directory'}</h1>
                    <p>Manage registered Faceonn users, onboarding credentials, roles, sessions, and account status.</p>
                </div>
                <div className = 'fa-header-actions'>
                    {canExport && (
                        <button
                            className = 'fa-btn fa-btn-secondary'
                            onClick = { () => adminApi.downloadCsv('/api/admin/users/export', accessToken, 'faceonn-users.csv') }
                            type = 'button'>
                            <Download size = { 15 } /> Export CSV
                        </button>
                    )}
                    {canManage && (
                        <button
                            className = 'fa-btn fa-btn-primary'
                            onClick = { () => setShowCreateModal(true) }
                            type = 'button'>
                            <Plus size = { 15 } /> Onboard User
                        </button>
                    )}
                </div>
            </div>

            {error && <div className = 'fa-alert-error'>{error}</div>}
            {notice && <div className = 'fa-alert-success'><CheckCircle size = { 15 } /> {notice}</div>}
            {tempPasswordBanner && (
                <div className = 'fa-alert-success'>
                    Account credentials generated for <strong>{tempPasswordBanner.email}</strong> — Temporary password: <code>{tempPasswordBanner.password}</code>
                </div>
            )}

            <div className = 'fa-card'>
                <div className = 'fa-toolbar'>
                    <div className = 'fa-search-box'>
                        <Search size = { 15 } />
                        <input
                            onChange = { e => {
                                setSearch(e.target.value);
                                setPage(1);
                            } }
                            placeholder = 'Search by name or email...'
                            type = 'text'
                            value = { search } />
                    </div>
                    {mode !== 'suspended-users' && (
                        <select
                            className = 'fa-select'
                            onChange = { e => {
                                setStatusFilter(e.target.value);
                                setPage(1);
                            } }
                            value = { statusFilter }>
                            <option value = ''>All Statuses</option>
                            <option value = 'active'>Active</option>
                            <option value = 'suspended'>Suspended</option>
                            <option value = 'deactivated'>Deactivated</option>
                        </select>
                    )}
                    {orgs.length > 0 && (
                        <select
                            className = 'fa-select'
                            onChange = { e => {
                                setOrgFilter(e.target.value);
                                setPage(1);
                            } }
                            value = { orgFilter }>
                            <option value = ''>All Organizations</option>
                            {orgs.map(o => (<option
                                key = { o.id }
                                value = { o.id }>{o.name}</option>))}
                        </select>
                    )}
                    <button
                        className = 'fa-btn fa-btn-secondary'
                        onClick = { loadDirectory }
                        type = 'button'>
                        <RefreshCw size = { 14 } />
                    </button>
                </div>

                <div className = 'fa-table-wrap'>
                    <table className = 'fa-table'>
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Organization</th>
                                <th>Role</th>
                                <th>Plan</th>
                                <th>Status</th>
                                <th>Registered</th>
                                <th>Last Active</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td
                                    className = 'fa-muted'
                                    colSpan = { 8 }>Loading users...</td></tr>
                            ) : users.length === 0 ? (
                                <tr><td
                                    className = 'fa-muted'
                                    colSpan = { 8 }>No users match the selected filters.</td></tr>
                            ) : (
                                users.map(u => (
                                    <tr key = { u.id }>
                                        <td>
                                            <button
                                                className = 'fa-user-cell-btn'
                                                onClick = { () => setSelectedUserId(u.id) }
                                                type = 'button'>
                                                <span className = 'fa-avatar'>{(u.name || u.email).slice(0, 2).toUpperCase()}</span>
                                                <div>
                                                    <strong>{u.name || 'Unnamed User'}</strong>
                                                    <div className = 'fa-muted-xs'>{u.email}</div>
                                                </div>
                                            </button>
                                        </td>
                                        <td>{u.organizationName || '—'}</td>
                                        <td><span className = 'fa-badge'>{u.adminRole || u.role}</span></td>
                                        <td>{u.subscriptionPlan || 'Free'}</td>
                                        <td><span className = { `fa-badge fa-badge-${u.status}` }>{u.status}</span></td>
                                        <td className = 'fa-muted-xs'>{new Date(u.createdAt).toLocaleDateString()}</td>
                                        <td className = 'fa-muted-xs'>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}</td>
                                        <td>
                                            <div className = 'fa-row-actions'>
                                                <button
                                                    className = 'fa-link-btn'
                                                    onClick = { () => setSelectedUserId(u.id) }
                                                    type = 'button'>
                                                    Details
                                                </button>
                                                {canManage && u.status === 'active' && u.id !== adminContext.userId && (
                                                    <button
                                                        className = 'fa-link-btn danger'
                                                        onClick = { () => setConfirmState({ action: 'suspend', user: u }) }
                                                        type = 'button'>
                                                        Suspend
                                                    </button>
                                                )}
                                                {canManage && u.status !== 'active' && (
                                                    <button
                                                        className = 'fa-link-btn'
                                                        onClick = { () => handleReactivate(u) }
                                                        type = 'button'>
                                                        Reactivate
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className = 'fa-pagination'>
                    <span>Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} users)</span>
                    <div className = 'fa-pagination-btns'>
                        <button
                            className = 'fa-btn fa-btn-secondary'
                            disabled = { page <= 1 }
                            onClick = { () => setPage(p => Math.max(1, p - 1)) }
                            type = 'button'>
                            Previous
                        </button>
                        <button
                            className = 'fa-btn fa-btn-secondary'
                            disabled = { page >= pagination.totalPages }
                            onClick = { () => setPage(p => p + 1) }
                            type = 'button'>
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {showCreateModal && (
                <div
                    className = 'fa-modal-backdrop'
                    onClick = { () => setShowCreateModal(false) }>
                    <div
                        className = 'fa-modal-card'
                        onClick = { e => e.stopPropagation() }>
                        <div className = 'fa-modal-header'>
                            <h3>Onboard New User</h3>
                        </div>
                        <form onSubmit = { handleCreateUser }>
                            <div className = 'fa-field'>
                                <label>Full Name *</label>
                                <input
                                    onChange = { e => setNewName(e.target.value) }
                                    required = { true }
                                    type = 'text'
                                    value = { newName } />
                            </div>
                            <div className = 'fa-field'>
                                <label>Email Address *</label>
                                <input
                                    onChange = { e => setNewEmail(e.target.value) }
                                    required = { true }
                                    type = 'email'
                                    value = { newEmail } />
                            </div>
                            <div className = 'fa-field'>
                                <label>Password (leave empty to auto-generate)</label>
                                <input
                                    onChange = { e => setNewPassword(e.target.value) }
                                    type = 'password'
                                    value = { newPassword } />
                            </div>
                            <div className = 'fa-field'>
                                <label>Country</label>
                                <input
                                    onChange = { e => setNewCountry(e.target.value) }
                                    placeholder = 'e.g. United States, India, Germany'
                                    type = 'text'
                                    value = { newCountry } />
                            </div>
                            {orgs.length > 0 && (
                                <div className = 'fa-field'>
                                    <label>Organization</label>
                                    <select
                                        onChange = { e => setNewOrgId(e.target.value) }
                                        value = { newOrgId }>
                                        <option value = ''>None</option>
                                        {orgs.map(o => (<option
                                            key = { o.id }
                                            value = { o.id }>{o.name}</option>))}
                                    </select>
                                </div>
                            )}
                            {adminContext.isSuperAdmin && (
                                <div className = 'fa-field'>
                                    <label>Platform Role</label>
                                    <select
                                        onChange = { e => setNewAdminRole(e.target.value) }
                                        value = { newAdminRole }>
                                        <option value = ''>Standard User</option>
                                        <option value = 'platform_admin'>Platform Admin</option>
                                        <option value = 'support_admin'>Support Admin</option>
                                        <option value = 'billing_admin'>Billing Admin</option>
                                        <option value = 'technical_admin'>Technical Admin</option>
                                        <option value = 'super_admin'>Super Admin</option>
                                    </select>
                                </div>
                            )}
                            <div className = 'fa-modal-actions'>
                                <button
                                    className = 'fa-btn fa-btn-secondary'
                                    onClick = { () => setShowCreateModal(false) }
                                    type = 'button'>
                                    Cancel
                                </button>
                                <button
                                    className = 'fa-btn fa-btn-primary'
                                    disabled = { busy }
                                    type = 'submit'>
                                    {busy ? 'Onboarding...' : 'Create Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {confirmState && (
                <ConfirmModal
                    confirmLabel = { confirmState.action === 'delete' ? 'Delete Account' : 'Suspend Account' }
                    danger = { true }
                    description = { `Confirm ${confirmState.action} for ${confirmState.user.email}. This action is recorded in the audit log.` }
                    isLoading = { busy }
                    onCancel = { () => setConfirmState(null) }
                    onConfirm = { handleExecuteConfirm }
                    requireReason = { confirmState.action === 'suspend' }
                    title = { `Confirm ${confirmState.action}` } />
            )}
        </div>
    );
}
