import { IMeeting } from '../types';

/**
 * Format Date to RFC 5545 UTC timestamp: YYYYMMDDTHHMMSSZ
 */
function formatIcsDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escape text according to RFC 5545
 */
function escapeIcsText(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

/**
 * Fold lines longer than 75 octets
 */
function foldIcsLine(line: string): string {
    const maxLen = 74;
    if (line.length <= maxLen) return line;

    let result = '';
    let currentLine = '';
    for (const char of line) {
        if (currentLine.length >= maxLen) {
            result += currentLine + '\r\n ';
            currentLine = char;
        } else {
            currentLine += char;
        }
    }
    result += currentLine;
    return result;
}

/**
 * Generate Google Calendar Web URL
 */
export function generateGoogleCalendarUrl(meeting: IMeeting, origin = window.location.origin): string {
    const roomUrl = `${origin}/${meeting.roomId}`;
    const startTime = meeting.scheduledAt ? new Date(meeting.scheduledAt) : new Date(meeting.createdAt);
    const duration = meeting.durationMinutes || 30;
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    const dates = `${formatIcsDate(startTime)}/${formatIcsDate(endTime)}`;
    const details = [
        meeting.description || '',
        `Join Faceonn Meeting: ${roomUrl}`,
        `Meeting ID: ${meeting.roomId}`,
        meeting.hasPasscode ? 'Passcode: (Protected - See invitation)' : ''
    ]
        .filter(Boolean)
        .join('\n\n');

    let url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
        meeting.title
    )}&dates=${dates}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(roomUrl)}`;

    if (meeting.recurrenceRule) {
        url += `&recur=RRULE:${encodeURIComponent(meeting.recurrenceRule)}`;
    }

    return url;
}

/**
 * Generate Outlook Live Web Calendar URL
 */
export function generateOutlookCalendarUrl(meeting: IMeeting, origin = window.location.origin): string {
    const roomUrl = `${origin}/${meeting.roomId}`;
    const startTime = meeting.scheduledAt ? new Date(meeting.scheduledAt) : new Date(meeting.createdAt);
    const duration = meeting.durationMinutes || 30;
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    const details = [
        meeting.description || '',
        `Join Faceonn Meeting: ${roomUrl}`,
        `Meeting ID: ${meeting.roomId}`
    ]
        .filter(Boolean)
        .join('\n\n');

    return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(
        meeting.title
    )}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(
        roomUrl
    )}&startdt=${startTime.toISOString()}&enddt=${endTime.toISOString()}`;
}

/**
 * Generate RFC 5545 standard .ics file and trigger browser download
 */
export function downloadIcsFile(
    meeting: IMeeting,
    hostName?: string | null,
    origin = window.location.origin
): void {
    const roomUrl = `${origin}/${meeting.roomId}`;
    const startTime = meeting.scheduledAt ? new Date(meeting.scheduledAt) : new Date(meeting.createdAt);
    const duration = meeting.durationMinutes || 30;
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    const description = [
        meeting.description || `Faceonn Video Meeting: ${meeting.title}`,
        '',
        `Join Meeting: ${roomUrl}`,
        `Meeting ID: ${meeting.roomId}`,
        meeting.hasPasscode ? 'Security: Passcode Protected' : ''
    ]
        .filter(Boolean)
        .join('\n');

    const rawLines: string[] = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Faceonn//Meeting Scheduler//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        `UID:${meeting.id}@faceonn.com`,
        `DTSTAMP:${formatIcsDate(new Date())}`,
        `DTSTART:${formatIcsDate(startTime)}`,
        `DTEND:${formatIcsDate(endTime)}`,
        `SUMMARY:${escapeIcsText(meeting.title)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        `LOCATION:${escapeIcsText(roomUrl)}`,
        `URL:${roomUrl}`,
        'STATUS:CONFIRMED'
    ];

    if (hostName) {
        rawLines.push(`ORGANIZER;CN=${escapeIcsText(hostName)}:mailto:no-reply@faceonn.com`);
    }

    if (meeting.recurrenceRule) {
        rawLines.push(`RRULE:${meeting.recurrenceRule}`);
    }

    // 15-minute standard reminder alarm
    rawLines.push(
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcsText(`Reminder: ${meeting.title} starts in 15 minutes`)}`,
        'END:VALARM'
    );

    rawLines.push('END:VEVENT', 'END:VCALENDAR');

    const icsContent = rawLines.map(line => foldIcsLine(line)).join('\r\n') + '\r\n';
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${meeting.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

/**
 * Format complete copyable meeting invitation
 */
export function formatMeetingInvitationText(
    meeting: IMeeting,
    hostName?: string | null,
    origin = window.location.origin,
    rawPasscode?: string
): string {
    const roomUrl = `${origin}/${meeting.roomId}`;
    const startTime = meeting.scheduledAt ? new Date(meeting.scheduledAt) : new Date(meeting.createdAt);
    const tz = meeting.timezone || 'UTC';

    let formattedDate = startTime.toDateString();
    let formattedTime = startTime.toLocaleTimeString();

    try {
        formattedDate = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }).format(startTime);

        formattedTime = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        }).format(startTime);
    } catch (_) {}

    const lines = [
        `${hostName || 'Faceonn User'} is inviting you to a scheduled Faceonn meeting.`,
        '',
        `Topic: ${meeting.title}`,
        `Time: ${formattedDate} ${formattedTime} (${tz})`,
        '',
        `Join Faceonn Meeting:`,
        `${roomUrl}`,
        '',
        `Meeting ID: ${meeting.roomId}`
    ];

    if (rawPasscode) {
        lines.push(`Passcode: ${rawPasscode}`);
    } else if (meeting.hasPasscode || meeting.settings?.passcodeEnabled) {
        lines.push('Security: Passcode Protected');
    }

    if (meeting.description) {
        lines.push('', `Description:`, meeting.description);
    }

    return lines.join('\n');
}

/**
 * Calculate human-friendly relative time for meeting cards
 */
export function getRelativeMeetingTime(
    scheduledAtStr?: string | null,
    timezone = 'UTC'
): { label: string; badgeClass: 'now' | 'soon' | 'today' | 'future' | 'past'; isPast: boolean } {
    if (!scheduledAtStr) {
        return { label: 'Instant meeting', badgeClass: 'now', isPast: false };
    }

    const scheduledDate = new Date(scheduledAtStr);
    const now = new Date();
    const diffMs = scheduledDate.getTime() - now.getTime();
    const diffMinutes = Math.round(diffMs / (60 * 1000));
    const diffHours = Math.round(diffMs / (3600 * 1000));
    const diffDays = Math.round(diffMs / (24 * 3600 * 1000));

    // Past
    if (diffMs < -30 * 60 * 1000) {
        return { label: 'Ended', badgeClass: 'past', isPast: true };
    }

    // Happening now or within 10 minutes of start
    if (diffMinutes >= -15 && diffMinutes <= 5) {
        return { label: 'Starting now', badgeClass: 'now', isPast: false };
    }

    // In less than 60 minutes
    if (diffMinutes > 5 && diffMinutes < 60) {
        return { label: `In ${diffMinutes} min`, badgeClass: 'soon', isPast: false };
    }

    // Today in a few hours
    if (diffHours >= 1 && diffHours < 24 && scheduledDate.getDate() === now.getDate()) {
        try {
            const timeStr = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                hour: 'numeric',
                minute: '2-digit'
            }).format(scheduledDate);
            return { label: `Today at ${timeStr}`, badgeClass: 'today', isPast: false };
        } catch (_) {
            return { label: `In ${diffHours}h`, badgeClass: 'today', isPast: false };
        }
    }

    // Tomorrow
    if (diffDays === 1) {
        try {
            const timeStr = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                hour: 'numeric',
                minute: '2-digit'
            }).format(scheduledDate);
            return { label: `Tomorrow at ${timeStr}`, badgeClass: 'future', isPast: false };
        } catch (_) {
            return { label: 'Tomorrow', badgeClass: 'future', isPast: false };
        }
    }

    // Further future
    if (diffDays > 1) {
        try {
            const formatted = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            }).format(scheduledDate);
            return { label: formatted, badgeClass: 'future', isPast: false };
        } catch (_) {
            return { label: `In ${diffDays} days`, badgeClass: 'future', isPast: false };
        }
    }

    return { label: 'Scheduled', badgeClass: 'future', isPast: false };
}

