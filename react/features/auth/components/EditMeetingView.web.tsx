/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { IReduxState } from '../../app/types';
import { getAccessToken } from '../functions';
import { authApiClient } from '../api';
import { IMeeting, IUpdateMeetingDTO } from '../types';
import { COMMON_TIMEZONES } from '../utils/timezones';

interface EditMeetingViewProps {
    meetingId: string;
    onBack: () => void;
    onUpdated: (meeting: IMeeting) => void;
}

export default function EditMeetingView({ meetingId, onBack, onUpdated }: EditMeetingViewProps) {
    const accessToken = useSelector((state: IReduxState) => getAccessToken(state));

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [meeting, setMeeting] = useState<IMeeting | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [durationMinutes, setDurationMinutes] = useState(30);
    const [timezone, setTimezone] = useState('UTC');

    const [passcodeEnabled, setPasscodeEnabled] = useState(false);
    const [passcode, setPasscode] = useState('');
    const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(false);
    const [joinBeforeHost, setJoinBeforeHost] = useState(true);
    const [muteOnEntry, setMuteOnEntry] = useState(true);

    const [scope, setScope] = useState<'occurrence' | 'series'>('occurrence');

    useEffect(() => {
        if (!accessToken) return;
        setLoading(true);
        authApiClient
            .getMeetingDetails(meetingId, accessToken)
            .then(data => {
                const m = data.meeting;
                setMeeting(m);
                setTitle(m.title);
                setDescription(m.description || '');
                setDurationMinutes(m.durationMinutes || 30);
                setTimezone(m.timezone || 'UTC');

                if (m.scheduledAt) {
                    const d = new Date(m.scheduledAt);
                    setDate(d.toISOString().split('T')[0]);
                    setTime(
                        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                    );
                }

                if (m.settings) {
                    setPasscodeEnabled(Boolean(m.settings.passcodeEnabled));
                    setWaitingRoomEnabled(Boolean(m.settings.waitingRoomEnabled));
                    setJoinBeforeHost(Boolean(m.settings.joinBeforeHost));
                    setMuteOnEntry(Boolean(m.settings.muteOnEntry));
                }
            })
            .catch(err => setError(err.message || 'Failed to load meeting for editing'))
            .finally(() => setLoading(false));
    }, [meetingId, accessToken]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!title.trim()) {
            setError('Meeting topic cannot be empty');
            return;
        }

        if (!accessToken) return;
        setSaving(true);

        try {
            const scheduledAtIso = date && time ? new Date(`${date}T${time}:00`).toISOString() : undefined;

            const payload: IUpdateMeetingDTO = {
                title: title.trim(),
                description: description.trim() || undefined,
                scheduledAt: scheduledAtIso,
                durationMinutes: Number(durationMinutes),
                timezone,
                settings: {
                    passcodeEnabled,
                    passcode: passcodeEnabled && passcode ? passcode : undefined,
                    waitingRoomEnabled,
                    joinBeforeHost,
                    muteOnEntry
                },
                scope
            };

            const res = await authApiClient.updateMeeting(meetingId, payload, accessToken);
            onUpdated(res.meeting);
        } catch (err: any) {
            setError(err.message || 'Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="faceonn-schedule-container" style={{ textAlign: 'center', padding: '60px 0' }}>
                <div className="dash-loading-spinner" />
                <p style={{ marginTop: '16px', color: '#64748b' }}>Loading meeting details...</p>
            </div>
        );
    }

    return (
        <div className="faceonn-schedule-container">
            <div className="faceonn-schedule-header">
                <button type="button" className="schedule-btn-back" onClick={onBack}>
                    ← Back to Meeting Details
                </button>
                <div className="schedule-header-title">
                    <h2>Edit Meeting</h2>
                    <p>Update topic, schedule, passcode, and conference settings.</p>
                </div>
            </div>

            {error && (
                <div className="schedule-error-banner">
                    <span>{error}</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="faceonn-schedule-layout">
                <div className="schedule-main-column">
                    <div className="schedule-card-section">
                        <h3>Meeting Information</h3>

                        <div className="schedule-input-group">
                            <label>Topic</label>
                            <input
                                type="text"
                                className="schedule-input-text"
                                value={title}
                                maxLength={200}
                                onChange={e => setTitle(e.target.value)}
                                required />
                        </div>

                        <div className="schedule-input-group">
                            <label>Description</label>
                            <textarea
                                className="schedule-input-textarea"
                                rows={3}
                                value={description}
                                onChange={e => setDescription(e.target.value)} />
                        </div>

                        <div className="schedule-grid-2">
                            <div className="schedule-input-group">
                                <label>Date</label>
                                <input
                                    type="date"
                                    className="schedule-input-text"
                                    value={date}
                                    onChange={e => setDate(e.target.value)}
                                    required />
                            </div>

                            <div className="schedule-input-group">
                                <label>Start Time</label>
                                <input
                                    type="time"
                                    className="schedule-input-text"
                                    value={time}
                                    onChange={e => setTime(e.target.value)}
                                    required />
                            </div>
                        </div>

                        <div className="schedule-grid-2">
                            <div className="schedule-input-group">
                                <label>Duration</label>
                                <select
                                    className="schedule-input-select"
                                    value={durationMinutes}
                                    onChange={e => setDurationMinutes(Number(e.target.value))}>
                                    <option value={15}>15 minutes</option>
                                    <option value={30}>30 minutes</option>
                                    <option value={45}>45 minutes</option>
                                    <option value={60}>1 hour</option>
                                    <option value={90}>1.5 hours</option>
                                    <option value={120}>2 hours</option>
                                </select>
                            </div>

                            <div className="schedule-input-group">
                                <label>Timezone</label>
                                <select
                                    className="schedule-input-select"
                                    value={timezone}
                                    onChange={e => setTimezone(e.target.value)}>
                                    {COMMON_TIMEZONES.map(tz => (
                                        <option key={tz.value} value={tz.value}>
                                            {tz.offset} - {tz.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {meeting?.recurrenceSeriesId && (
                            <div className="schedule-input-group" style={{ marginTop: '16px' }}>
                                <label>Edit Scope</label>
                                <div className="schedule-radio-group">
                                    <label className="schedule-radio-label">
                                        <input
                                            type="radio"
                                            name="editScope"
                                            checked={scope === 'occurrence'}
                                            onChange={() => setScope('occurrence')} />
                                        <span>Update only this occurrence</span>
                                    </label>
                                    <label className="schedule-radio-label">
                                        <input
                                            type="radio"
                                            name="editScope"
                                            checked={scope === 'series'}
                                            onChange={() => setScope('series')} />
                                        <span>Update all occurrences in recurring series</span>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="schedule-card-section">
                        <h3>Security & Options</h3>

                        <div className="schedule-switch-row">
                            <div className="switch-info">
                                <strong>Require Passcode</strong>
                                <span>Change or toggle passcode protection</span>
                            </div>
                            <label className="faceonn-switch">
                                <input
                                    type="checkbox"
                                    checked={passcodeEnabled}
                                    onChange={e => setPasscodeEnabled(e.target.checked)} />
                                <span className="slider round" />
                            </label>
                        </div>

                        {passcodeEnabled && (
                            <div className="schedule-input-group" style={{ marginTop: '10px' }}>
                                <label>New Passcode (Leave empty to keep current)</label>
                                <input
                                    type="text"
                                    className="schedule-input-text"
                                    placeholder="Enter new passcode"
                                    value={passcode}
                                    maxLength={16}
                                    onChange={e => setPasscode(e.target.value)} />
                            </div>
                        )}

                        <div className="schedule-switch-row">
                            <div className="switch-info">
                                <strong>Waiting Room</strong>
                                <span>Participants must wait for host admission</span>
                            </div>
                            <label className="faceonn-switch">
                                <input
                                    type="checkbox"
                                    checked={waitingRoomEnabled}
                                    onChange={e => setWaitingRoomEnabled(e.target.checked)} />
                                <span className="slider round" />
                            </label>
                        </div>

                        <div className="schedule-switch-row">
                            <div className="switch-info">
                                <strong>Allow Join Before Host</strong>
                                <span>Allow participants to enter before host arrives</span>
                            </div>
                            <label className="faceonn-switch">
                                <input
                                    type="checkbox"
                                    checked={joinBeforeHost}
                                    onChange={e => setJoinBeforeHost(e.target.checked)} />
                                <span className="slider round" />
                            </label>
                        </div>

                        <div className="schedule-switch-row">
                            <div className="switch-info">
                                <strong>Mute Participants on Entry</strong>
                            </div>
                            <label className="faceonn-switch">
                                <input
                                    type="checkbox"
                                    checked={muteOnEntry}
                                    onChange={e => setMuteOnEntry(e.target.checked)} />
                                <span className="slider round" />
                            </label>
                        </div>
                    </div>
                </div>

                <div className="schedule-summary-column">
                    <div className="schedule-summary-card">
                        <h4>Save Changes</h4>
                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                            Updated meeting information will be saved immediately and calendar links will be
                            refreshed.
                        </p>

                        <div className="summary-actions">
                            <button
                                type="submit"
                                className="schedule-btn-submit"
                                disabled={saving}>
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                                type="button"
                                className="schedule-btn-cancel-flat"
                                onClick={onBack}
                                disabled={saving}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}

