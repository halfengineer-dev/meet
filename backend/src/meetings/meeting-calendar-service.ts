import { MeetingRecord, MeetingInvitationRecord } from '../db/types';

export class MeetingCalendarService {
  /**
   * Escape characters for RFC 5545 text values
   */
  public escapeIcsText(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  /**
   * Format Date to RFC 5545 UTC timestamp: YYYYMMDDTHHMMSSZ
   */
  public formatIcsDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  /**
   * Fold lines longer than 75 octets per RFC 5545 Section 3.1
   */
  public foldIcsLine(line: string): string {
    const maxLen = 74; // Account for CRLF
    if (Buffer.byteLength(line, 'utf-8') <= maxLen) {
      return line;
    }

    let result = '';
    let currentLine = '';

    for (const char of line) {
      if (Buffer.byteLength(currentLine + char, 'utf-8') > maxLen) {
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
   * Generate RFC 5545 standards-compliant .ics file content
   */
  public generateIcs(
    meeting: MeetingRecord,
    options: {
      organizerName?: string | null;
      organizerEmail?: string;
      origin?: string;
      invitees?: MeetingInvitationRecord[];
    } = {}
  ): string {
    const origin = options.origin || 'https://faceonn.com';
    const roomUrl = `${origin}/${meeting.room_id}`;
    const startTime = meeting.scheduled_at || meeting.created_at;
    const endTime = new Date(startTime.getTime() + meeting.duration_minutes * 60 * 1000);

    const description = [
      meeting.description || `Faceonn Video Meeting: ${meeting.title}`,
      '',
      `Join Meeting: ${roomUrl}`,
      `Meeting ID: ${meeting.room_id}`,
      meeting.passcode_hash ? 'Security: Passcode Protected' : '',
    ]
      .filter((line) => line !== null)
      .join('\n');

    const rawLines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Faceonn//Meeting Scheduler//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${meeting.id}@faceonn.com`,
      `DTSTAMP:${this.formatIcsDate(new Date())}`,
      `DTSTART:${this.formatIcsDate(startTime)}`,
      `DTEND:${this.formatIcsDate(endTime)}`,
      `SUMMARY:${this.escapeIcsText(meeting.title)}`,
      `DESCRIPTION:${this.escapeIcsText(description)}`,
      `LOCATION:${this.escapeIcsText(roomUrl)}`,
      `URL:${roomUrl}`,
      'STATUS:CONFIRMED',
    ];

    if (options.organizerEmail) {
      const cn = options.organizerName ? `;CN=${this.escapeIcsText(options.organizerName)}` : '';
      rawLines.push(`ORGANIZER${cn}:mailto:${options.organizerEmail}`);
    }

    if (options.invitees && options.invitees.length > 0) {
      for (const invitee of options.invitees) {
        rawLines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${invitee.email}`);
      }
    }

    if (meeting.recurrence_rule) {
      rawLines.push(`RRULE:${meeting.recurrence_rule}`);
    }

    // 15-minute standard reminder alarm
    rawLines.push(
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${this.escapeIcsText(`Reminder: ${meeting.title} starts in 15 minutes`)}`,
      'END:VALARM'
    );

    rawLines.push('END:VEVENT', 'END:VCALENDAR');

    return rawLines.map((line) => this.foldIcsLine(line)).join('\r\n') + '\r\n';
  }

  /**
   * Generate Google Calendar Web Event URL
   */
  public generateGoogleCalendarUrl(
    meeting: MeetingRecord,
    origin = 'https://faceonn.com'
  ): string {
    const roomUrl = `${origin}/${meeting.room_id}`;
    const startTime = meeting.scheduled_at || meeting.created_at;
    const endTime = new Date(startTime.getTime() + meeting.duration_minutes * 60 * 1000);

    const dates = `${this.formatIcsDate(startTime)}/${this.formatIcsDate(endTime)}`;
    const details = [
      meeting.description || '',
      `Join Meeting: ${roomUrl}`,
      `Meeting ID: ${meeting.room_id}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    let url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      meeting.title
    )}&dates=${dates}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(roomUrl)}`;

    if (meeting.recurrence_rule) {
      url += `&recur=RRULE:${encodeURIComponent(meeting.recurrence_rule)}`;
    }

    return url;
  }

  /**
   * Generate Outlook Web Calendar Event URL
   */
  public generateOutlookCalendarUrl(
    meeting: MeetingRecord,
    origin = 'https://faceonn.com'
  ): string {
    const roomUrl = `${origin}/${meeting.room_id}`;
    const startTime = meeting.scheduled_at || meeting.created_at;
    const endTime = new Date(startTime.getTime() + meeting.duration_minutes * 60 * 1000);

    const details = [
      meeting.description || '',
      `Join Meeting: ${roomUrl}`,
      `Meeting ID: ${meeting.room_id}`,
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
   * Format complete copyable meeting invitation
   */
  public formatInvitationText(
    meeting: MeetingRecord,
    organizerName: string | null,
    origin = 'https://faceonn.com',
    rawPasscode?: string
  ): string {
    const roomUrl = `${origin}/${meeting.room_id}`;
    const startTime = meeting.scheduled_at || meeting.created_at;

    const formattedDate = new Intl.DateTimeFormat('en-US', {
      timeZone: meeting.timezone,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(startTime);

    const formattedTime = new Intl.DateTimeFormat('en-US', {
      timeZone: meeting.timezone,
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(startTime);

    const lines = [
      `${organizerName || 'Faceonn User'} is inviting you to a scheduled Faceonn meeting.`,
      '',
      `Topic: ${meeting.title}`,
      `Time: ${formattedDate} ${formattedTime} (${meeting.timezone})`,
      '',
      `Join Faceonn Meeting:`,
      `${roomUrl}`,
      '',
      `Meeting ID: ${meeting.room_id}`,
    ];

    if (rawPasscode) {
      lines.push(`Passcode: ${rawPasscode}`);
    } else if (meeting.passcode_hash) {
      lines.push('Security: Passcode Protected');
    }

    if (meeting.description) {
      lines.push('', `Description:`, meeting.description);
    }

    return lines.join('\n');
  }
}

export const meetingCalendarService = new MeetingCalendarService();

