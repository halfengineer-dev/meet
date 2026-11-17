/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { IReduxState } from '../../app/types';
import { getAccessToken, getAuthUser } from '../functions';
import { authApiClient } from '../api';
import { IScheduleMeetingDTO, IScheduleMeetingResponse } from '../types';
import { detectUserTimezone, COMMON_TIMEZONES } from '../utils/timezones';

interface ScheduleMeetingViewProps {
    onBack: () => void;
    onScheduled: (result: IScheduleMeetingResponse) => void;
}

export default function ScheduleMeetingView({ onBack, onScheduled }: ScheduleMeetingViewProps) {
    const user = useSelector((state: IReduxState) => getAuthUser(state));
    const accessToken = useSelector((state: IReduxState) => getAccessToken(state));

    // Section A: Meeting Info
    const [title, setTitle] = useState('Team Sync');
    const [description, setDescription] = useState('');

    // Start time ~1 hour from now, rounded to next 15 minutes
    const [date, setDate] = useState(() => {
        const d = new Date();
        d.setHours(d.getHours() + 1);
        return d.toISOString().split('T')[0];
    });

    const [time, setTime] = useState(() => {
        const d = new Date();
        d.setHours(d.getHours() + 1);
        const minutes = Math.ceil(d.getMinutes() / 15) * 15;
        d.setMinutes(minutes);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    });

    const [durationMinutes, setDurationMinutes] = useState(30);
    const [isCustomDuration, setIsCustomDuration] = useState(false);
    const [timezone, setTimezone] = useState(() => detectUserTimezone());

    // Section B: Recurrence
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrenceFreq, setRecurrenceFreq] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
    const [recurrenceInterval, setRecurrenceInterval] = useState(1);
    const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1]); // Monday default
    const [recurrenceEndType, setRecurrenceEndType] = useState<'date' | 'count'>('date');
    const [recurrenceEndDate, setRecurrenceEndDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return d.toISOString().split('T')[0];
    });
    const [recurrenceCount, setRecurrenceCount] = useState(5);

    // Section C: Meeting ID & Security
    const [usePmi, setUsePmi] = useState(false);
    const [passcodeEnabled, setPasscodeEnabled] = useState(true);
    const [passcode, setPasscode] = useState(() => {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let res = '';
        for (let i = 0; i < 6; i++) {
            res += chars[Math.floor(Math.random() * chars.length)];
        }
        return res;
    });
    const [showPasscode, setShowPasscode] = useState(false);
    const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(true);
    const [joinBeforeHost, setJoinBeforeHost] = useState(false);
    const [requireAuthentication, setRequireAuthentication] = useState(true);

    // Section D: Video, Audio & Permissions
    const [hostVideoEnabled, setHostVideoEnabled] = useState(true);
    const [participantVideoEnabled, setParticipantVideoEnabled] = useState(true);
    const [muteOnEntry, setMuteOnEntry] = useState(true);
    const [allowScreenSharing, setAllowScreenSharing] = useState(true);
    const [allowChat, setAllowChat] = useState(true);
    const [allowReactions, setAllowReactions] = useState(true);

    // Section E: Invitations
    const [inviteEmailInput, setInviteEmailInput] = useState('');
    const [invitees, setInvitees] = useState<string[]>([]);
    const [inviteError, setInviteError] = useState<string | null>(null);

    // Submission & UI States
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggleWeekday = (dayIndex: number) => {
        if (selectedWeekdays.includes(dayIndex)) {
            if (selectedWeekdays.length > 1) {
                setSelectedWeekdays(selectedWeekdays.filter(d => d !== dayIndex));
            }
        } else {
            setSelectedWeekdays([...selectedWeekdays, dayIndex].sort());
        }
    };

    const handleAddInvitee = () => {
        const email = inviteEmailInput.trim().toLowerCase();
        setInviteError(null);
        if (!email) return;

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setInviteError('Please enter a valid email address');
            return;
        }

        if (invitees.includes(email)) {
            setInviteError('Email already added');
            return;
        }

        setInvitees([...invitees, email]);
        setInviteEmailInput('');
    };

    const handleRemoveInvitee = (emailToRemove: string) => {
        setInvitees(invitees.filter(e => e !== emailToRemove));
    };

    const handleGenerateNewPasscode = () => {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let res = '';
        for (let i = 0; i < 6; i++) {
            res += chars[Math.floor(Math.random() * chars.length)];
        }
        setPasscode(res);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!title.trim()) {
            setError('Please provide a meeting topic');
            return;
        }

        if (!accessToken) {
            setError('You must be signed in to schedule a meeting');
            return;
        }

        setIsSubmitting(true);

        try {
            // Combine date & time in ISO format
            const scheduledAtIso = new Date(`${date}T${time}:00`).toISOString();

            const payload: IScheduleMeetingDTO = {
                title: title.trim(),
                description: description.trim() || undefined,
                scheduledAt: scheduledAtIso,
                timezone,
                durationMinutes: Number(durationMinutes),
                meetingType: isRecurring ? 'recurring' : 'scheduled',
                usePmi,
                settings: {
                    passcodeEnabled,
                    passcode: passcodeEnabled ? passcode : undefined,
                    waitingRoomEnabled,
                    joinBeforeHost,
                    hostVideoEnabled,
                    participantVideoEnabled,
                    muteOnEntry,
                    allowScreenSharing,
                    allowChat,
                    allowReactions,
                    requireAuthentication
                },
                invitees: invitees.length > 0 ? invitees : undefined
            };

            if (isRecurring) {
                payload.recurrence = {
                    frequency: recurrenceFreq,
                    interval: recurrenceInterval,
                    weekdays: recurrenceFreq === 'weekly' ? selectedWeekdays : undefined,
                    endDate: recurrenceEndType === 'date' ? recurrenceEndDate : undefined,
                    occurrenceCount: recurrenceEndType === 'count' ? recurrenceCount : undefined
                };
            }

            const result = await authApiClient.scheduleMeeting(payload, accessToken);
            onScheduled(result);
        } catch (err: any) {
            setError(err.message || 'Failed to schedule meeting. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const weekdays = [
        { label: 'S', name: 'Sunday', value: 0 },
        { label: 'M', name: 'Monday', value: 1 },
        { label: 'T', name: 'Tuesday', value: 2 },
        { label: 'W', name: 'Wednesday', value: 3 },
        { label: 'T', name: 'Thursday', value: 4 },
        { label: 'F', name: 'Friday', value: 5 },
        { label: 'S', name: 'Saturday', value: 6 }
    ];

    return (
        <div className="faceonn-schedule-container">
            {/* Header Navigation */}
            <div className="faceonn-schedule-header">
                <button type="button" className="schedule-btn-back" onClick={onBack}>
                    ← Back to Meetings
                </button>
                <div className="schedule-header-title">
                    <h2>Schedule a Meeting</h2>
                    <p>Configure meeting security, recurrence, and invite participants.</p>
                </div>
            </div>

            {error && (
                <div className="schedule-error-banner">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{error}</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="faceonn-schedule-layout">
                {/* Left Column: Form Fields */}
                <div className="schedule-main-column">
                    {/* Section 1: Meeting Information */}
                    <div className="schedule-card-section">
                        <div className="section-title-wrap">
                            <div className="section-badge-num">1</div>
                            <h3>Meeting Information</h3>
                        </div>

                        <div className="schedule-input-group">
                            <label>Topic <span className="req">*</span></label>
                            <input
                                type="text"
                                className="schedule-input-text"
                                placeholder="e.g. Weekly Strategy Sync"
                                value={title}
                                maxLength={200}
                                onChange={e => setTitle(e.target.value)}
                                required />
                        </div>

                        <div className="schedule-input-group">
                            <label>Description (Optional)</label>
                            <textarea
                                className="schedule-input-textarea"
                                placeholder="Add an agenda, meeting goals, or discussion links..."
                                rows={3}
                                value={description}
                                onChange={e => setDescription(e.target.value)} />
                        </div>

                        {/* Date, Time & Duration Grid */}
                        <div className="schedule-grid-2">
                            <div className="schedule-input-group">
                                <label>Date</label>
                                <input
                                    type="date"
                                    className="schedule-input-text"
                                    value={date}
                                    min={new Date().toISOString().split('T')[0]}
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
                                {!isCustomDuration ? (
                                    <select
                                        className="schedule-input-select"
                                        value={durationMinutes}
                                        onChange={e => {
                                            if (e.target.value === 'custom') {
                                                setIsCustomDuration(true);
                                            } else {
                                                setDurationMinutes(Number(e.target.value));
                                            }
                                        }}>
                                        <option value={15}>15 minutes</option>
                                        <option value={30}>30 minutes</option>
                                        <option value={45}>45 minutes</option>
                                        <option value={60}>1 hour</option>
                                        <option value={90}>1.5 hours</option>
                                        <option value={120}>2 hours</option>
                                        <option value="custom">Custom duration...</option>
                                    </select>
                                ) : (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            type="number"
                                            className="schedule-input-text"
                                            min={5}
                                            max={1440}
                                            value={durationMinutes}
                                            onChange={e => setDurationMinutes(Number(e.target.value))} />
                                        <button
                                            type="button"
                                            className="schedule-btn-secondary"
                                            onClick={() => setIsCustomDuration(false)}>
                                            Presets
                                        </button>
                                    </div>
                                )}
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
                    </div>

                    {/* Section 2: Recurring Meeting */}
                    <div className="schedule-card-section">
                        <div className="section-title-wrap">
                            <div className="section-badge-num">2</div>
                            <h3>Recurring Meeting</h3>
                        </div>

                        <div className="schedule-switch-row">
                            <div className="switch-info">
                                <strong>Recurring Meeting</strong>
                                <span>Schedule once and reuse the same meeting link for regular occurrences.</span>
                            </div>
                            <label className="faceonn-switch">
                                <input
                                    type="checkbox"
                                    checked={isRecurring}
                                    onChange={e => setIsRecurring(e.target.checked)} />
                                <span className="slider round" />
                            </label>
                        </div>

                        {isRecurring && (
                            <div className="schedule-recurrence-box">
                                <div className="schedule-grid-2">
                                    <div className="schedule-input-group">
                                        <label>Recurrence</label>
                                        <select
                                            className="schedule-input-select"
                                            value={recurrenceFreq}
                                            onChange={e => setRecurrenceFreq(e.target.value as any)}>
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly</option>
                                            <option value="monthly">Monthly</option>
                                        </select>
                                    </div>

                                    <div className="schedule-input-group">
                                        <label>Repeat Every</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="number"
                                                className="schedule-input-text"
                                                min={1}
                                                max={12}
                                                value={recurrenceInterval}
                                                onChange={e => setRecurrenceInterval(Number(e.target.value))} />
                                            <span style={{ fontSize: '13px', color: '#64748b' }}>
                                                {recurrenceFreq === 'daily'
                                                    ? 'day(s)'
                                                    : recurrenceFreq === 'weekly'
                                                    ? 'week(s)'
                                                    : 'month(s)'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {recurrenceFreq === 'weekly' && (
                                    <div className="schedule-input-group" style={{ marginTop: '14px' }}>
                                        <label>Occurs On</label>
                                        <div className="weekday-chips-row">
                                            {weekdays.map(day => (
                                                <button
                                                    key={day.value}
                                                    type="button"
                                                    className={`weekday-chip ${
                                                        selectedWeekdays.includes(day.value) ? 'active' : ''
                                                    }`}
                                                    onClick={() => toggleWeekday(day.value)}>
                                                    {day.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="schedule-grid-2" style={{ marginTop: '14px' }}>
                                    <div className="schedule-input-group">
                                        <label>End Recurrence</label>
                                        <select
                                            className="schedule-input-select"
                                            value={recurrenceEndType}
                                            onChange={e => setRecurrenceEndType(e.target.value as any)}>
                                            <option value="date">By Date</option>
                                            <option value="count">After Occurrences</option>
                                        </select>
                                    </div>

                                    <div className="schedule-input-group">
                                        {recurrenceEndType === 'date' ? (
                                            <>
                                                <label>End Date</label>
                                                <input
                                                    type="date"
                                                    className="schedule-input-text"
                                                    value={recurrenceEndDate}
                                                    min={date}
                                                    onChange={e => setRecurrenceEndDate(e.target.value)} />
                                            </>
                                        ) : (
                                            <>
                                                <label>Number of occurrences</label>
                                                <input
                                                    type="number"
                                                    className="schedule-input-text"
                                                    min={1}
                                                    max={50}
                                                    value={recurrenceCount}
                                                    onChange={e => setRecurrenceCount(Number(e.target.value))} />
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Section 3: Security & Permissions */}
                    <div className="schedule-card-section">
                        <div className="section-title-wrap">
                            <div className="section-badge-num">3</div>
                            <h3>Security & Permissions</h3>
                        </div>

                        {/* Meeting ID Choice */}
                        <div className="schedule-input-group">
                            <label>Meeting ID</label>
                            <div className="schedule-radio-group">
                                <label className="schedule-radio-label">
                                    <input
                                        type="radio"
                                        name="meetingIdType"
                                        checked={!usePmi}
                                        onChange={() => setUsePmi(false)} />
                                    <span>Generate Automatically</span>
                                </label>
                                <label className="schedule-radio-label">
                                    <input
                                        type="radio"
                                        name="meetingIdType"
                                        checked={usePmi}
                                        onChange={() => setUsePmi(true)} />
                                    <span>Personal Meeting ID {user?.pmi ? `(${user.pmi})` : ''}</span>
                                </label>
                            </div>
                        </div>

                        {/* Passcode */}
                        <div className="schedule-switch-row">
                            <div className="switch-info">
                                <strong>Passcode</strong>
                                <span>Only attendees with the passcode can enter this meeting.</span>
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
                            <div className="schedule-passcode-box">
                                <div className="passcode-input-wrap">
                                    <input
                                        type={showPasscode ? 'text' : 'password'}
                                        className="schedule-input-text"
                                        value={passcode}
                                        onChange={e => setPasscode(e.target.value)}
                                        maxLength={16} />
                                    <button
                                        type="button"
                                        className="passcode-icon-btn"
                                        onClick={() => setShowPasscode(!showPasscode)}>
                                        {showPasscode ? 'Hide' : 'Show'}
                                    </button>
                                    <button
                                        type="button"
                                        className="schedule-btn-secondary"
                                        onClick={handleGenerateNewPasscode}>
                                        Regenerate
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Waiting Room */}
                        <div className="schedule-switch-row">
                            <div className="switch-info">
                                <strong>Waiting Room</strong>
                                <span>Participants wait in lobby until the host admits them.</span>
                            </div>
                            <label className="faceonn-switch">
                                <input
                                    type="checkbox"
                                    checked={waitingRoomEnabled}
                                    onChange={e => setWaitingRoomEnabled(e.target.checked)} />
                                <span className="slider round" />
                            </label>
                        </div>

                        {/* Join Before Host */}
                        <div className="schedule-switch-row">
                            <div className="switch-info">
                                <strong>Allow Participants to Join Before Host</strong>
                                <span>If disabled, participants cannot enter until the host starts the room.</span>
                            </div>
                            <label className="faceonn-switch">
                                <input
                                    type="checkbox"
                                    checked={joinBeforeHost}
                                    onChange={e => setJoinBeforeHost(e.target.checked)} />
                                <span className="slider round" />
                            </label>
                        </div>

                        {/* Require Authentication */}
                        <div className="schedule-switch-row">
                            <div className="switch-info">
                                <strong>Require Faceonn Authentication</strong>
                                <span>Only authenticated users with verified accounts can join.</span>
                            </div>
                            <label className="faceonn-switch">
                                <input
                                    type="checkbox"
                                    checked={requireAuthentication}
                                    onChange={e => setRequireAuthentication(e.target.checked)} />
                                <span className="slider round" />
                            </label>
                        </div>
                    </div>

                    {/* Section 4: Video & Audio Settings */}
                    <div className="schedule-card-section">
                        <div className="section-title-wrap">
                            <div className="section-badge-num">4</div>
                            <h3>Video & Audio Preferences</h3>
                        </div>

                        <div className="schedule-grid-2">
                            <div className="schedule-switch-row">
                                <div className="switch-info">
                                    <strong>Host Video</strong>
                                    <span>Start with camera on</span>
                                </div>
                                <label className="faceonn-switch">
                                    <input
                                        type="checkbox"
                                        checked={hostVideoEnabled}
                                        onChange={e => setHostVideoEnabled(e.target.checked)} />
                                    <span className="slider round" />
                                </label>
                            </div>

                            <div className="schedule-switch-row">
                                <div className="switch-info">
                                    <strong>Participant Video</strong>
                                    <span>Start with camera on</span>
                                </div>
                                <label className="faceonn-switch">
                                    <input
                                        type="checkbox"
                                        checked={participantVideoEnabled}
                                        onChange={e => setParticipantVideoEnabled(e.target.checked)} />
                                    <span className="slider round" />
                                </label>
                            </div>
                        </div>

                        <div className="schedule-switch-row" style={{ marginTop: '10px' }}>
                            <div className="switch-info">
                                <strong>Mute Participants Upon Entry</strong>
                                <span>Keep conference audio clean when attendees join.</span>
                            </div>
                            <label className="faceonn-switch">
                                <input
                                    type="checkbox"
                                    checked={muteOnEntry}
                                    onChange={e => setMuteOnEntry(e.target.checked)} />
                                <span className="slider round" />
                            </label>
                        </div>

                        <div className="schedule-switch-row">
                            <div className="switch-info">
                                <strong>Allow Screen Sharing</strong>
                                <span>Allow participants to share screens during the meeting.</span>
                            </div>
                            <label className="faceonn-switch">
                                <input
                                    type="checkbox"
                                    checked={allowScreenSharing}
                                    onChange={e => setAllowScreenSharing(e.target.checked)} />
                                <span className="slider round" />
                            </label>
                        </div>

                        <div className="schedule-switch-row">
                            <div className="switch-info">
                                <strong>Allow In-Meeting Chat & Reactions</strong>
                                <span>Enable group chat and interactive emoji reactions.</span>
                            </div>
                            <label className="faceonn-switch">
                                <input
                                    type="checkbox"
                                    checked={allowChat && allowReactions}
                                    onChange={e => {
                                        setAllowChat(e.target.checked);
                                        setAllowReactions(e.target.checked);
                                    }} />
                                <span className="slider round" />
                            </label>
                        </div>
                    </div>

                    {/* Section 5: Invite Participants */}
                    <div className="schedule-card-section">
                        <div className="section-title-wrap">
                            <div className="section-badge-num">5</div>
                            <h3>Invite Attendees</h3>
                        </div>
                        <p className="schedule-desc-text">
                            Add invitees by email address. They will receive calendar invitations with the direct room link.
                        </p>

                        <div className="invite-add-row">
                            <input
                                type="email"
                                className="schedule-input-text"
                                placeholder="colleague@company.com"
                                value={inviteEmailInput}
                                onChange={e => setInviteEmailInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddInvitee();
                                    }
                                }} />
                            <button
                                type="button"
                                className="schedule-btn-action blue"
                                onClick={handleAddInvitee}>
                                + Add
                            </button>
                        </div>

                        {inviteError && <div className="schedule-field-error">{inviteError}</div>}

                        {invitees.length > 0 && (
                            <div className="invitees-chips-list">
                                {invitees.map(email => (
                                    <div key={email} className="invitee-chip">
                                        <span className="invitee-chip-email">{email}</span>
                                        <button
                                            type="button"
                                            className="invitee-chip-remove"
                                            onClick={() => handleRemoveInvitee(email)}>
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Live Summary Preview & Actions */}
                <div className="schedule-summary-column">
                    <div className="schedule-summary-card">
                        <h4>Meeting Summary</h4>
                        <div className="summary-title">{title || 'Untitled Meeting'}</div>

                        <div className="summary-item">
                            <div className="summary-label">Date & Time</div>
                            <div className="summary-val">
                                {date} at {time} ({durationMinutes} mins)
                            </div>
                        </div>

                        <div className="summary-item">
                            <div className="summary-label">Timezone</div>
                            <div className="summary-val">{timezone}</div>
                        </div>

                        {isRecurring && (
                            <div className="summary-item">
                                <div className="summary-label">Recurrence</div>
                                <div className="summary-val">
                                    Repeats {recurrenceFreq} every {recurrenceInterval}{' '}
                                    {recurrenceFreq === 'weekly' ? 'week(s)' : recurrenceFreq === 'daily' ? 'day(s)' : 'month(s)'}
                                </div>
                            </div>
                        )}

                        <div className="summary-badges-list">
                            <span className="summary-badge">
                                {passcodeEnabled ? '🔒 Passcode Protected' : '🔓 No Passcode'}
                            </span>
                            <span className="summary-badge">
                                {waitingRoomEnabled ? '🛡️ Waiting Room On' : '⚡ Direct Entry'}
                            </span>
                            <span className="summary-badge">
                                {muteOnEntry ? '🔇 Mute on Entry' : '🔊 Open Audio'}
                            </span>
                        </div>

                        {invitees.length > 0 && (
                            <div className="summary-item" style={{ marginTop: '12px' }}>
                                <div className="summary-label">Invited Attendees</div>
                                <div className="summary-val">{invitees.length} participant(s)</div>
                            </div>
                        )}

                        <div className="summary-actions">
                            <button
                                type="submit"
                                className="schedule-btn-submit"
                                disabled={isSubmitting}>
                                {isSubmitting ? 'Scheduling Meeting...' : 'Schedule Meeting →'}
                            </button>
                            <button
                                type="button"
                                className="schedule-btn-cancel-flat"
                                onClick={onBack}
                                disabled={isSubmitting}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}

