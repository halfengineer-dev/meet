/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import { AlertTriangle, Flag, Save } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { adminApi } from '../../api';
import { IAdminContextInfo } from '../../types';
import ConfirmModal from '../shared/ConfirmModal.web';

interface IConfigurationPageProps {
    accessToken: string;
    adminContext: IAdminContextInfo;
    mode:
        | 'settings-general'
        | 'settings-meetings'
        | 'settings-recordings'
        | 'settings-email'
        | 'settings-notifications'
        | 'feature-flags'
        | 'maintenance-mode';
}

const MODE_TO_SECTION: Record<string, string> = {
    'settings-general': 'general',
    'settings-meetings': 'meeting_policies',
    'settings-recordings': 'recording_policies',
    'settings-email': 'email_config',
    'settings-notifications': 'notifications',
    'maintenance-mode': 'maintenance_mode'
};

export default function ConfigurationPage({ accessToken, adminContext, mode }: IConfigurationPageProps) {
    const [ settings, setSettings ] = useState<Record<string, Record<string, any>>>({});
    const [ flags, setFlags ] = useState<any[]>([]);
    const [ loading, setLoading ] = useState(true);
    const [ saving, setSaving ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);
    const [ notice, setNotice ] = useState<string | null>(null);
    const [ confirmMaintenance, setConfirmMaintenance ] = useState(false);

    const canManageSettings = adminContext.isSuperAdmin || adminContext.permissions.includes('settings:manage');
    const canManageFlags = adminContext.isSuperAdmin || adminContext.permissions.includes('feature_flags:manage');

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (mode === 'feature-flags') {
                const res = await adminApi.listFeatureFlags(accessToken);

                setFlags(res.featureFlags || []);
            } else {
                const res = await adminApi.getSettings(accessToken);

                setSettings(res.settings || {});
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load configuration');
        } finally {
            setLoading(false);
        }
    }, [ accessToken, mode ]);

    useEffect(() => {
        loadData();
    }, [ loadData ]);

    const sectionKey = MODE_TO_SECTION[mode];
    const sectionVal = (sectionKey && settings[sectionKey]) || {};

    const updateField = (key: string, value: any) => {
        setSettings(prev => ({
            ...prev,
            [sectionKey]: {
                ...(prev[sectionKey] || {}),
                [key]: value
            }
        }));
    };

    const handleSave = async () => {
        if (!sectionKey) {
            return;
        }
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            await adminApi.updateSettingsSection(accessToken, sectionKey, sectionVal);
            setNotice('Configuration saved and audit logged.');
        } catch (err: any) {
            setError(err.message || 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    if (mode === 'feature-flags') {
        return (
            <div className = 'fa-page'>
                <div className = 'fa-page-header'>
                    <div>
                        <h1>Feature Flags</h1>
                        <p>Enable or disable conferencing capabilities globally. Enforced directly by backend services.</p>
                    </div>
                </div>
                {error && <div className = 'fa-alert-error'>{error}</div>}
                {notice && <div className = 'fa-alert-success'>{notice}</div>}
                <div className = 'fa-card'>
                    {loading ? (
                        <p className = 'fa-muted'>Loading feature flags...</p>
                    ) : (
                        <div className = 'fa-flag-list'>
                            {flags.map(flag => (
                                <div
                                    className = 'fa-flag-row'
                                    key = { flag.id }>
                                    <div>
                                        <strong><Flag size = { 14 } /> {flag.name}</strong> <code>{flag.key}</code>
                                        <div className = 'fa-muted-xs'>{flag.description}</div>
                                    </div>
                                    <button
                                        className = { `fa-btn ${flag.enabled_globally ? 'fa-btn-primary' : 'fa-btn-secondary'}` }
                                        disabled = { !canManageFlags }
                                        onClick = { async () => {
                                            await adminApi.updateFeatureFlag(accessToken, flag.id, { enabledGlobally: !flag.enabled_globally });
                                            setNotice(`${flag.name} ${!flag.enabled_globally ? 'enabled' : 'disabled'} globally.`);
                                            await loadData();
                                        } }
                                        type = 'button'>
                                        {flag.enabled_globally ? 'Enabled' : 'Disabled'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className = 'fa-page'>
            <div className = 'fa-page-header'>
                <div>
                    <h1>
                        {mode === 'settings-general' && 'General Platform Settings'}
                        {mode === 'settings-meetings' && 'Global Meeting Policies'}
                        {mode === 'settings-recordings' && 'Recording Retention & Access Policies'}
                        {mode === 'settings-email' && 'Email & SMTP Configuration'}
                        {mode === 'settings-notifications' && 'Notification Settings'}
                        {mode === 'maintenance-mode' && 'Maintenance Mode'}
                    </h1>
                    <p>Central platform configuration persisted in PostgreSQL and tracked via audit logs.</p>
                </div>
                {canManageSettings && mode !== 'maintenance-mode' && (
                    <button
                        className = 'fa-btn fa-btn-primary'
                        disabled = { saving }
                        onClick = { handleSave }
                        type = 'button'>
                        <Save size = { 15 } /> {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                )}
            </div>

            {error && <div className = 'fa-alert-error'>{error}</div>}
            {notice && <div className = 'fa-alert-success'>{notice}</div>}
            {loading && <div className = 'fa-loading-box'>Loading settings...</div>}

            {!loading && mode === 'maintenance-mode' && (
                <div className = 'fa-card'>
                    <div className = 'fa-card-header'>
                        <div>
                            <h3><AlertTriangle size = { 16 } /> Scheduled Maintenance Banner &amp; Lock</h3>
                            <p>Restrict non-administrative platform traffic during upgrades or migrations (Super Admin only).</p>
                        </div>
                        <span className = { `fa-badge ${sectionVal.enabled ? 'fa-badge-critical' : 'fa-badge-healthy'}` }>
                            {sectionVal.enabled ? 'MAINTENANCE ACTIVE' : 'NORMAL OPERATION'}
                        </span>
                    </div>
                    <div className = 'fa-field'>
                        <label>Maintenance Message</label>
                        <textarea
                            onChange = { e => updateField('message', e.target.value) }
                            rows = { 3 }
                            value = { sectionVal.message || '' } />
                    </div>
                    {adminContext.isSuperAdmin && (
                        <div
                            className = 'fa-header-actions'
                            style = {{ marginTop: '14px' }}>
                            <button
                                className = { `fa-btn ${sectionVal.enabled ? 'fa-btn-primary' : 'fa-btn-danger'}` }
                                onClick = { () => setConfirmMaintenance(true) }
                                type = 'button'>
                                {sectionVal.enabled ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {!loading && mode !== 'maintenance-mode' && (
                <div className = 'fa-card'>
                    <div className = 'fa-form-grid-2'>
                        {Object.entries(sectionVal).map(([ key, value ]) => {
                            if (typeof value === 'boolean') {
                                return (
                                    <label
                                        className = 'fa-toggle-row'
                                        key = { key }>
                                        <input
                                            checked = { value }
                                            disabled = { !canManageSettings }
                                            onChange = { e => updateField(key, e.target.checked) }
                                            type = 'checkbox' />
                                        <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                                    </label>
                                );
                            }
                            if (typeof value === 'number') {
                                return (
                                    <div
                                        className = 'fa-field'
                                        key = { key }>
                                        <label>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</label>
                                        <input
                                            disabled = { !canManageSettings }
                                            onChange = { e => updateField(key, Number(e.target.value)) }
                                            type = 'number'
                                            value = { value } />
                                    </div>
                                );
                            }
                            if (Array.isArray(value)) {
                                return (
                                    <div
                                        className = 'fa-field'
                                        key = { key }>
                                        <label>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())} (comma-separated)</label>
                                        <input
                                            disabled = { !canManageSettings }
                                            onChange = { e => updateField(key, e.target.value.split(',').map(s => s.trim()).filter(Boolean)) }
                                            type = 'text'
                                            value = { value.join(', ') } />
                                    </div>
                                );
                            }

                            return (
                                <div
                                    className = 'fa-field'
                                    key = { key }>
                                    <label>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</label>
                                    <input
                                        disabled = { !canManageSettings }
                                        onChange = { e => updateField(key, e.target.value) }
                                        type = 'text'
                                        value = { value === null || value === undefined ? '' : String(value) } />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {confirmMaintenance && (
                <ConfirmModal
                    confirmLabel = { sectionVal.enabled ? 'Restore Normal Operation' : 'Activate Maintenance Mode' }
                    danger = { !sectionVal.enabled }
                    description = {
                        sectionVal.enabled
                            ? 'Disable maintenance mode and restore normal platform access for all users?'
                            : 'Enable platform-wide maintenance mode? Regular users will see the maintenance notice.'
                    }
                    isLoading = { saving }
                    onCancel = { () => setConfirmMaintenance(false) }
                    onConfirm = { async () => {
                        setSaving(true);
                        try {
                            const next = { ...sectionVal, enabled: !sectionVal.enabled };

                            await adminApi.updateSettingsSection(accessToken, 'maintenance_mode', next);
                            setSettings(prev => ({ ...prev, maintenance_mode: next }));
                            setConfirmMaintenance(false);
                            setNotice(`Maintenance mode ${next.enabled ? 'activated' : 'disabled'}.`);
                        } catch (err: any) {
                            setError(err.message);
                        } finally {
                            setSaving(false);
                        }
                    } }
                    title = 'Confirm Maintenance Mode Change' />
            )}
        </div>
    );
}
