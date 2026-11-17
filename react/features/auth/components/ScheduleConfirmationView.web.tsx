/* eslint-disable react/jsx-no-bind, react-native/no-inline-styles */
import React, { useState, useEffect } from 'react';
import { IScheduleMeetingResponse } from '../types';
import { downloadIcsFile } from '../utils/calendar';

interface ScheduleConfirmationViewProps {
    result: IScheduleMeetingResponse;
    onViewDetails: (meetingId: string) => void;
    onBackToMeetings: () => void;
}

export default function ScheduleConfirmationView({
    result,
    onViewDetails,
    onBackToMeetings
}: ScheduleConfirmationViewProps) {
    const { meeting, roomUrl, googleCalendarUrl, outlookCalendarUrl, invitationText } = result;
    const [copiedLink, setCopiedLink] = useState(false);
    const [copiedInvite, setCopiedInvite] = useState(false);
    const [countdown, setCountdown] = useState('');

    useEffect(() => {
        if (!meeting.scheduledAt) return;

        const updateCountdown = () => {
            const now = Date.now();
            const target = new Date(meeting.scheduledAt!).getTime();
            const diff = target - now;

            if (diff <= 0) {
                setCountdown('Meeting starting now');
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const days = Math.floor(hours / 24);

            if (days > 0) {
                setCountdown(`Starts in ${days} day(s) and ${hours % 24} hr(s)`);
            } else if (hours > 0) {
                setCountdown(`Starts in ${hours} hr(s) and ${minutes} min(s)`);
            } else {
                setCountdown(`Starts in ${minutes} minute(s)`);
            }
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 30000);
        return () => clearInterval(interval);
    }, [meeting.scheduledAt]);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(roomUrl);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
    };

    const handleCopyInvitation = () => {
        navigator.clipboard.writeText(invitationText);
        setCopiedInvite(true);
        setTimeout(() => setCopiedInvite(false), 2000);
    };

    const handleDownloadIcs = () => {
        downloadIcsFile(meeting, null, window.location.origin);
    };

    const handleStartNow = () => {
        window.location.href = `/${meeting.roomId}`;
    };

    return (
        <div className="faceonn-schedule-container">
            <div className="schedule-confirmation-card">
                {/* Success Icon Badge */}
                <div className="confirm-icon-wrap">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                </div>

                <h2>Your meeting is scheduled!</h2>
                <p className="confirm-sub-text">
                    The meeting room has been configured. Share the invitation or add it to your calendar.
                </p>

                {countdown && <div className="confirm-countdown-pill">⏱️ {countdown}</div>}

                {/* Meeting Summary Box */}
                <div className="confirm-details-box">
                    <div className="confirm-detail-row">
                        <span className="detail-key">Topic:</span>
                        <span className="detail-val bold">{meeting.title}</span>
                    </div>

                    <div className="confirm-detail-row">
                        <span className="detail-key">Time:</span>
                        <span className="detail-val">
                            {meeting.scheduledAt
                                ? new Date(meeting.scheduledAt).toLocaleString('en-US', {
                                      weekday: 'short',
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      timeZoneName: 'short'
                                  })
                                : 'Scheduled'}
                            {' '}({meeting.durationMinutes} minutes)
                        </span>
                    </div>

                    <div className="confirm-detail-row">
                        <span className="detail-key">Meeting ID:</span>
                        <span className="detail-val mono">{meeting.roomId}</span>
                    </div>

                    {meeting.hasPasscode && (
                        <div className="confirm-detail-row">
                            <span className="detail-key">Security:</span>
                            <span className="detail-val badge-passcode">🔒 Passcode Protected</span>
                        </div>
                    )}
                </div>

                {/* Shareable Link Box */}
                <div className="confirm-link-section">
                    <label>Shareable Meeting URL</label>
                    <div className="confirm-link-box">
                        <input type="text" readOnly value={roomUrl} />
                        <button
                            type="button"
                            className="schedule-btn-action blue"
                            onClick={handleCopyLink}>
                            {copiedLink ? '✓ Copied!' : 'Copy Link'}
                        </button>
                    </div>
                </div>

                {/* Calendar Add Buttons */}
                <div className="confirm-calendar-section">
                    <label>Add to Calendar</label>
                    <div className="calendar-buttons-row">
                        <a
                            href={googleCalendarUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-calendar-provider google">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span>Google Calendar</span>
                        </a>

                        <a
                            href={outlookCalendarUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-calendar-provider outlook">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                <polyline points="22,6 12,13 2,6" />
                            </svg>
                            <span>Outlook</span>
                        </a>

                        <button
                            type="button"
                            className="btn-calendar-provider ics"
                            onClick={handleDownloadIcs}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            <span>Download .ics</span>
                        </button>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="confirm-actions-footer">
                    <button
                        type="button"
                        className="schedule-btn-secondary"
                        onClick={handleCopyInvitation}>
                        {copiedInvite ? '✓ Invitation Copied!' : 'Copy Full Invitation Text'}
                    </button>
                    <button
                        type="button"
                        className="schedule-btn-secondary"
                        onClick={() => onViewDetails(meeting.id)}>
                        View Details
                    </button>
                    <button
                        type="button"
                        className="schedule-btn-action blue"
                        onClick={handleStartNow}>
                        Start Meeting Now →
                    </button>
                </div>

                <div style={{ marginTop: '16px' }}>
                    <button
                        type="button"
                        className="schedule-btn-back"
                        onClick={onBackToMeetings}>
                        ← Back to All Meetings
                    </button>
                </div>
            </div>
        </div>
    );
}

