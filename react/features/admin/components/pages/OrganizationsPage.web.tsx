/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import { ArrowLeft, Building2, Mail, Plus, RefreshCw, Save, Trash2, Upload, UserPlus } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { adminApi } from '../../api';
import { IAdminContextInfo, IAdminOrgPolicies, IAdminOrganizationRow } from '../../types';
import ConfirmModal from '../shared/ConfirmModal.web';

interface IOrganizationsPageProps {
    accessToken: string;
    adminContext: IAdminContextInfo;
    initialFocusId?: string | null;
    mode: 'organizations' | 'invitations';
}

export default function OrganizationsPage({ accessToken, adminContext, mode, initialFocusId }: IOrganizationsPageProps) {
    const [ orgs, setOrgs ] = useState<IAdminOrganizationRow[]>([]);
    const [ invitations, setInvitations ] = useState<any[]>([]);
    const [ loading, setLoading ] = useState(true);
    const [ error, setError ] = useState<string | null>(null);
    const [ notice, setNotice ] = useState<string | null>(null);
    const [ search, setSearch ] = useState('');

    // Detail state
    const [ selectedOrgId, setSelectedOrgId ] = useState<string | null>(initialFocusId || null);
    const [ orgDetail, setOrgDetail ] = useState<any>(null);
    const [ policiesDraft, setPoliciesDraft ] = useState<IAdminOrgPolicies | null>(null);
    const [ brandingDraft, setBrandingDraft ] = useState<any>({});

    // Create Org modal
    const [ showCreate, setShowCreate ] = useState(false);
    const [ newOrgName, setNewOrgName ] = useState('');
    const [ newOrgPlan, setNewOrgPlan ] = useState('free');

    // Invite form
    const [ inviteEmail, setInviteEmail ] = useState('');
    const [ inviteRole, setInviteRole ] = useState('member');
    const [ bulkCsv, setBulkCsv ] = useState('');
    const [ addMemberUserId, setAddMemberUserId ] = useState('');
    const [ addMemberRole, setAddMemberRole ] = useState('member');
    const [ confirmDeleteOrg, setConfirmDeleteOrg ] = useState<IAdminOrganizationRow | null>(null);
    const [ busy, setBusy ] = useState(false);

    const canManage = adminContext.isSuperAdmin || adminContext.permissions.includes('organizations:manage');
    const canDelete = adminContext.isSuperAdmin || adminContext.permissions.includes('organizations:delete');

    useEffect(() => {
        if (initialFocusId) {
            setSelectedOrgId(initialFocusId);
        }
    }, [ initialFocusId ]);

    const loadList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (mode === 'invitations') {
                const res = await adminApi.listInvitations(accessToken);

                setInvitations(res.invitations || []);
            } else {
                const res = await adminApi.listOrganizations(accessToken, search.trim() || undefined);

                setOrgs(res.organizations || []);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load organizations');
        } finally {
            setLoading(false);
        }
    }, [ accessToken, mode, search ]);

    useEffect(() => {
        loadList();
    }, [ loadList ]);

    const loadDetail = useCallback(async (orgId: string) => {
        setError(null);
        try {
            const detail = await adminApi.getOrganizationDetail(accessToken, orgId);

            setOrgDetail(detail);
            setPoliciesDraft(detail.organization.policies);
            setBrandingDraft(detail.organization.branding || {});
        } catch (err: any) {
            setError(err.message || 'Failed to load organization detail');
        }
    }, [ accessToken ]);

    useEffect(() => {
        if (selectedOrgId) {
            loadDetail(selectedOrgId);
        } else {
            setOrgDetail(null);
        }
    }, [ loadDetail, selectedOrgId ]);

    const handleCreateOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await adminApi.createOrganization(accessToken, { name: newOrgName.trim(), planSlug: newOrgPlan });
            setShowCreate(false);
            setNewOrgName('');
            setNotice('Organization created.');
            await loadList();
        } catch (err: any) {
            setError(err.message || 'Failed to create organization');
        } finally {
            setBusy(false);
        }
    };

    const handleSavePoliciesAndBranding = async () => {
        if (!selectedOrgId || !policiesDraft) {
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await adminApi.updateOrganization(accessToken, selectedOrgId, {
                policies: policiesDraft,
                branding: brandingDraft
            });
            setNotice('Organization policies and branding saved (enforced on backend meeting creation/join).');
            await loadDetail(selectedOrgId);
        } catch (err: any) {
            setError(err.message || 'Failed to save policies');
        } finally {
            setBusy(false);
        }
    };

    const handleSendInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOrgId || !inviteEmail.trim()) {
            return;
        }
        setBusy(true);
        try {
            await adminApi.sendOrgInvitations(accessToken, selectedOrgId, [ { email: inviteEmail.trim(), role: inviteRole } ]);
            setInviteEmail('');
            setNotice('Invitation created.');
            await loadDetail(selectedOrgId);
        } catch (err: any) {
            setError(err.message || 'Failed to send invitation');
        } finally {
            setBusy(false);
        }
    };

    const handleBulkCsv = async () => {
        if (!selectedOrgId || !bulkCsv.trim()) {
            return;
        }
        setBusy(true);
        try {
            const res = await adminApi.sendBulkCsvInvitations(accessToken, selectedOrgId, bulkCsv);

            setBulkCsv('');
            setNotice(`Bulk CSV processed: ${res.invitations.length} invited, ${res.errors.length} invalid rows.`);
            await loadDetail(selectedOrgId);
        } catch (err: any) {
            setError(err.message || 'Bulk CSV import failed');
        } finally {
            setBusy(false);
        }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOrgId || !addMemberUserId.trim()) {
            return;
        }
        setBusy(true);
        try {
            await adminApi.addOrgMember(accessToken, selectedOrgId, addMemberUserId.trim(), addMemberRole);
            setAddMemberUserId('');
            setNotice('Member added to organization.');
            await loadDetail(selectedOrgId);
        } catch (err: any) {
            setError(err.message || 'Failed to add member');
        } finally {
            setBusy(false);
        }
    };

    if (mode === 'invitations') {
        return (
            <div className = 'fa-page'>
                <div className = 'fa-page-header'>
                    <div>
                        <h1>Organization Invitations</h1>
                        <p>Track pending, accepted, and revoked organization member invitations.</p>
                    </div>
                    <button
                        className = 'fa-btn fa-btn-secondary'
                        onClick = { loadList }
                        type = 'button'>
                        <RefreshCw size = { 15 } /> Refresh
                    </button>
                </div>
                {error && <div className = 'fa-alert-error'>{error}</div>}
                <div className = 'fa-card'>
                    <div className = 'fa-table-wrap'>
                        <table className = 'fa-table'>
                            <thead>
                                <tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 5 }>Loading invitations...</td></tr>
                                ) : invitations.length === 0 ? (
                                    <tr><td
                                        className = 'fa-muted'
                                        colSpan = { 5 }>No organization invitations recorded yet.</td></tr>
                                ) : (
                                    invitations.map(inv => (
                                        <tr key = { inv.id }>
                                            <td><strong>{inv.email}</strong></td>
                                            <td><span className = 'fa-badge'>{inv.role}</span></td>
                                            <td><span className = { `fa-badge fa-badge-${inv.status}` }>{inv.status}</span></td>
                                            <td className = 'fa-muted-xs'>{new Date(inv.expires_at).toLocaleDateString()}</td>
                                            <td>
                                                {canManage && inv.status === 'pending' && (
                                                    <button
                                                        className = 'fa-link-btn danger'
                                                        onClick = { async () => {
                                                            await adminApi.revokeInvitation(accessToken, inv.id);
                                                            await loadList();
                                                        } }
                                                        type = 'button'>
                                                        Revoke
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    if (selectedOrgId && orgDetail) {
        const org = orgDetail.organization;
        const usage = orgDetail.usage;

        return (
            <div className = 'fa-page'>
                <div className = 'fa-page-header'>
                    <div>
                        <button
                            className = 'fa-link-btn'
                            onClick = { () => setSelectedOrgId(null) }
                            type = 'button'>
                            <ArrowLeft size = { 15 } /> Back to Organizations
                        </button>
                        <h1>{org.name}</h1>
                        <p>Slug: <code>{org.slug}</code> · Plan: <strong>{org.planName}</strong> · ID: <code>{org.id}</code></p>
                    </div>
                    {canManage && policiesDraft && (
                        <button
                            className = 'fa-btn fa-btn-primary'
                            disabled = { busy }
                            onClick = { handleSavePoliciesAndBranding }
                            type = 'button'>
                            <Save size = { 15 } /> Save Policies &amp; Branding
                        </button>
                    )}
                </div>

                {error && <div className = 'fa-alert-error'>{error}</div>}
                {notice && <div className = 'fa-alert-success'>{notice}</div>}

                <div className = 'fa-kpi-grid'>
                    <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Members</span></div><div className = 'fa-kpi-value'>{usage.memberCount}</div><div className = 'fa-kpi-sub'>Active (30d): {usage.activeUsers}</div></div>
                    <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Total Meetings</span></div><div className = 'fa-kpi-value'>{usage.totalMeetings}</div><div className = 'fa-kpi-sub'>{usage.totalConferencingMinutes} min</div></div>
                    <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Storage Used</span></div><div className = 'fa-kpi-value'>{(usage.storageUsedBytes / (1024 * 1024)).toFixed(1)} MB</div><div className = 'fa-kpi-sub'>{usage.recordingCount} recordings</div></div>
                    <div className = 'fa-kpi-card'><div className = 'fa-kpi-top'><span>Subscription</span></div><div className = 'fa-kpi-value'>{org.planName}</div><div className = 'fa-kpi-sub'>{orgDetail.subscription?.renewalDate ? `Renews ${new Date(orgDetail.subscription.renewalDate).toLocaleDateString()}` : 'No billing renewal'}</div></div>
                </div>

                {policiesDraft && (
                    <div className = 'fa-grid-2'>
                        <div className = 'fa-card'>
                            <div className = 'fa-card-header'>
                                <div>
                                    <h3>Enforced Organization Meeting Policies</h3>
                                    <p>Applied automatically by the backend on every meeting created or joined by org members.</p>
                                </div>
                            </div>
                            <div className = 'fa-form-grid-2'>
                                <div className = 'fa-field'>
                                    <label>Max Duration (minutes)</label>
                                    <input
                                        min = { 15 }
                                        onChange = { e => setPoliciesDraft({ ...policiesDraft, maxMeetingDurationMinutes: Number(e.target.value) }) }
                                        type = 'number'
                                        value = { policiesDraft.maxMeetingDurationMinutes } />
                                </div>
                                <div className = 'fa-field'>
                                    <label>Max Participants</label>
                                    <input
                                        min = { 2 }
                                        onChange = { e => setPoliciesDraft({ ...policiesDraft, maxParticipants: Number(e.target.value) }) }
                                        type = 'number'
                                        value = { policiesDraft.maxParticipants } />
                                </div>
                                <div className = 'fa-field'>
                                    <label>Meeting Expiration (days)</label>
                                    <input
                                        min = { 1 }
                                        onChange = { e => setPoliciesDraft({ ...policiesDraft, meetingExpirationDays: Number(e.target.value) }) }
                                        type = 'number'
                                        value = { policiesDraft.meetingExpirationDays } />
                                </div>
                            </div>
                            <div className = 'fa-toggle-grid'>
                                {([
                                    [ 'requireAuthentication', 'Require Authentication to Join' ],
                                    [ 'waitingRoomDefault', 'Waiting Room Enabled by Default' ],
                                    [ 'passcodeRequired', 'Passcode Mandatory' ],
                                    [ 'cloudRecordingEnabled', 'Cloud Recording Allowed' ],
                                    [ 'localRecordingEnabled', 'Local Recording Allowed' ],
                                    [ 'screenSharingEnabled', 'Screen Sharing Allowed' ],
                                    [ 'chatEnabled', 'In-Meeting Chat Allowed' ],
                                    [ 'fileSharingEnabled', 'File Sharing Allowed' ],
                                    [ 'guestAccessEnabled', 'Guest Access Allowed' ],
                                    [ 'recurringMeetingsEnabled', 'Recurring Meetings Allowed' ]
                                ] as Array<[ keyof IAdminOrgPolicies, string ]>).map(([ key, label ]) => (
                                    <label
                                        className = 'fa-toggle-row'
                                        key = { key }>
                                        <input
                                            checked = { Boolean(policiesDraft[key]) }
                                            onChange = { e => setPoliciesDraft({ ...policiesDraft, [key]: e.target.checked }) }
                                            type = 'checkbox' />
                                        <span>{label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className = 'fa-card'>
                            <div className = 'fa-card-header'><h3>Organization Branding</h3></div>
                            <div className = 'fa-field'>
                                <label>Logo URL</label>
                                <input
                                    onChange = { e => setBrandingDraft({ ...brandingDraft, logoUrl: e.target.value }) }
                                    placeholder = 'https://...'
                                    type = 'text'
                                    value = { brandingDraft.logoUrl || '' } />
                            </div>
                            <div className = 'fa-field'>
                                <label>Primary Brand Color</label>
                                <input
                                    onChange = { e => setBrandingDraft({ ...brandingDraft, primaryColor: e.target.value }) }
                                    placeholder = '#2563eb'
                                    type = 'text'
                                    value = { brandingDraft.primaryColor || '' } />
                            </div>
                            <div className = 'fa-field'>
                                <label>Custom Domain</label>
                                <input
                                    onChange = { e => setBrandingDraft({ ...brandingDraft, customDomain: e.target.value }) }
                                    placeholder = 'meet.acme.com'
                                    type = 'text'
                                    value = { brandingDraft.customDomain || '' } />
                            </div>
                            <div className = 'fa-field'>
                                <label>Welcome Message</label>
                                <textarea
                                    onChange = { e => setBrandingDraft({ ...brandingDraft, welcomeMessage: e.target.value }) }
                                    rows = { 3 }
                                    value = { brandingDraft.welcomeMessage || '' } />
                            </div>
                        </div>
                    </div>
                )}

                <div className = 'fa-grid-2'>
                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'><h3>Members ({orgDetail.members.length})</h3></div>
                        {canManage && (
                            <form
                                className = 'fa-inline-form'
                                onSubmit = { handleAddMember }>
                                <input
                                    onChange = { e => setAddMemberUserId(e.target.value) }
                                    placeholder = 'Existing User ID (UUID)'
                                    type = 'text'
                                    value = { addMemberUserId } />
                                <select
                                    onChange = { e => setAddMemberRole(e.target.value) }
                                    value = { addMemberRole }>
                                    <option value = 'member'>Member</option>
                                    <option value = 'meeting_admin'>Meeting Admin</option>
                                    <option value = 'org_admin'>Org Admin</option>
                                    <option value = 'org_owner'>Org Owner</option>
                                </select>
                                <button
                                    className = 'fa-btn fa-btn-primary'
                                    disabled = { busy }
                                    type = 'submit'>
                                    <UserPlus size = { 14 } /> Add
                                </button>
                            </form>
                        )}
                        <div className = 'fa-table-wrap'>
                            <table className = 'fa-table'>
                                <thead><tr><th>Member</th><th>Role</th><th>Action</th></tr></thead>
                                <tbody>
                                    {orgDetail.members.length === 0 ? (
                                        <tr><td
                                            className = 'fa-muted'
                                            colSpan = { 3 }>No members yet.</td></tr>
                                    ) : (
                                        orgDetail.members.map((m: any) => (
                                            <tr key = { m.id }>
                                                <td><strong>{m.name || m.email}</strong><div className = 'fa-muted-xs'>{m.email}</div></td>
                                                <td><span className = 'fa-badge'>{m.role}</span></td>
                                                <td>
                                                    {canManage && m.role !== 'org_owner' && (
                                                        <button
                                                            className = 'fa-link-btn danger'
                                                            onClick = { async () => {
                                                                await adminApi.removeOrgMember(accessToken, selectedOrgId, m.userId);
                                                                await loadDetail(selectedOrgId);
                                                            } }
                                                            type = 'button'>
                                                            Remove
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className = 'fa-card'>
                        <div className = 'fa-card-header'><h3>Email &amp; Bulk CSV Invitations</h3></div>
                        {canManage && (
                            <>
                                <form
                                    className = 'fa-inline-form'
                                    onSubmit = { handleSendInvite }>
                                    <input
                                        onChange = { e => setInviteEmail(e.target.value) }
                                        placeholder = 'colleague@company.com'
                                        type = 'email'
                                        value = { inviteEmail } />
                                    <select
                                        onChange = { e => setInviteRole(e.target.value) }
                                        value = { inviteRole }>
                                        <option value = 'member'>Member</option>
                                        <option value = 'meeting_admin'>Meeting Admin</option>
                                        <option value = 'org_admin'>Org Admin</option>
                                    </select>
                                    <button
                                        className = 'fa-btn fa-btn-primary'
                                        disabled = { busy }
                                        type = 'submit'>
                                        <Mail size = { 14 } /> Invite
                                    </button>
                                </form>

                                <div
                                    className = 'fa-field'
                                    style = {{ marginTop: '14px' }}>
                                    <label>Bulk CSV Import (format: <code>email,role</code> per line)</label>
                                    <textarea
                                        onChange = { e => setBulkCsv(e.target.value) }
                                        placeholder = { 'alice@acme.com,org_admin\nbob@acme.com,member' }
                                        rows = { 3 }
                                        value = { bulkCsv } />
                                    <button
                                        className = 'fa-btn fa-btn-secondary'
                                        disabled = { busy || !bulkCsv.trim() }
                                        onClick = { handleBulkCsv }
                                        style = {{ marginTop: '8px' }}
                                        type = 'button'>
                                        <Upload size = { 14 } /> Process Bulk CSV Invites
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className = 'fa-page'>
            <div className = 'fa-page-header'>
                <div>
                    <h1>Organizations</h1>
                    <p>Manage enterprise workspaces, owners, subscriptions, branding, and enforced meeting policies.</p>
                </div>
                {adminContext.isPlatformAdmin && canManage && (
                    <button
                        className = 'fa-btn fa-btn-primary'
                        onClick = { () => setShowCreate(true) }
                        type = 'button'>
                        <Plus size = { 15 } /> Create Organization
                    </button>
                )}
            </div>

            {error && <div className = 'fa-alert-error'>{error}</div>}
            {notice && <div className = 'fa-alert-success'>{notice}</div>}

            <div className = 'fa-card'>
                <div className = 'fa-toolbar'>
                    <input
                        className = 'fa-input'
                        onChange = { e => setSearch(e.target.value) }
                        placeholder = 'Search organizations...'
                        type = 'text'
                        value = { search } />
                    <button
                        className = 'fa-btn fa-btn-secondary'
                        onClick = { loadList }
                        type = 'button'>
                        <RefreshCw size = { 14 } />
                    </button>
                </div>

                <div className = 'fa-table-wrap'>
                    <table className = 'fa-table'>
                        <thead>
                            <tr><th>Organization</th><th>Owner</th><th>Members</th><th>Meetings</th><th>Plan</th><th>Status</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td
                                    className = 'fa-muted'
                                    colSpan = { 7 }>Loading organizations...</td></tr>
                            ) : orgs.length === 0 ? (
                                <tr><td
                                    className = 'fa-muted'
                                    colSpan = { 7 }>No organizations created yet.</td></tr>
                            ) : (
                                orgs.map(org => (
                                    <tr key = { org.id }>
                                        <td>
                                            <button
                                                className = 'fa-link-btn'
                                                onClick = { () => setSelectedOrgId(org.id) }
                                                type = 'button'>
                                                <Building2 size = { 14 } /> <strong>{org.name}</strong>
                                            </button>
                                            <div className = 'fa-muted-xs'>{org.slug}</div>
                                        </td>
                                        <td>{org.owner ? org.owner.email : 'Unassigned'}</td>
                                        <td>{org.memberCount}</td>
                                        <td>{org.meetingCount}</td>
                                        <td><span className = 'fa-badge'>{org.planName}</span></td>
                                        <td><span className = { `fa-badge fa-badge-${org.status}` }>{org.status}</span></td>
                                        <td>
                                            <div className = 'fa-row-actions'>
                                                <button
                                                    className = 'fa-link-btn'
                                                    onClick = { () => setSelectedOrgId(org.id) }
                                                    type = 'button'>Manage</button>
                                                {canDelete && adminContext.isPlatformAdmin && (
                                                    <button
                                                        className = 'fa-link-btn danger'
                                                        onClick = { () => setConfirmDeleteOrg(org) }
                                                        type = 'button'>
                                                        <Trash2 size = { 13 } />
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
            </div>

            {showCreate && (
                <div
                    className = 'fa-modal-backdrop'
                    onClick = { () => setShowCreate(false) }>
                    <div
                        className = 'fa-modal-card'
                        onClick = { e => e.stopPropagation() }>
                        <div className = 'fa-modal-header'><h3>Create Enterprise Organization</h3></div>
                        <form onSubmit = { handleCreateOrg }>
                            <div className = 'fa-field'>
                                <label>Organization Name *</label>
                                <input
                                    onChange = { e => setNewOrgName(e.target.value) }
                                    required = { true }
                                    type = 'text'
                                    value = { newOrgName } />
                            </div>
                            <div className = 'fa-field'>
                                <label>Initial Plan</label>
                                <select
                                    onChange = { e => setNewOrgPlan(e.target.value) }
                                    value = { newOrgPlan }>
                                    <option value = 'free'>Free</option>
                                    <option value = 'pro'>Pro</option>
                                    <option value = 'business'>Business</option>
                                    <option value = 'enterprise'>Enterprise</option>
                                </select>
                            </div>
                            <div className = 'fa-modal-actions'>
                                <button
                                    className = 'fa-btn fa-btn-secondary'
                                    onClick = { () => setShowCreate(false) }
                                    type = 'button'>Cancel</button>
                                <button
                                    className = 'fa-btn fa-btn-primary'
                                    disabled = { busy }
                                    type = 'submit'>{busy ? 'Creating...' : 'Create Organization'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {confirmDeleteOrg && (
                <ConfirmModal
                    confirmLabel = 'Delete Organization'
                    danger = { true }
                    description = { `Soft-delete organization "${confirmDeleteOrg.name}"? Historical invoices and audit logs remain preserved.` }
                    isLoading = { busy }
                    onCancel = { () => setConfirmDeleteOrg(null) }
                    onConfirm = { async () => {
                        setBusy(true);
                        try {
                            await adminApi.deleteOrganization(accessToken, confirmDeleteOrg.id);
                            setConfirmDeleteOrg(null);
                            await loadList();
                        } finally {
                            setBusy(false);
                        }
                    } }
                    title = 'Delete Organization' />
            )}
        </div>
    );
}
