export interface RecurrenceConfig {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
  weekdays?: number[]; // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  endDate?: string;
  occurrenceCount?: number;
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export class MeetingRecurrenceService {
  /**
   * Build RFC 5545 RRULE string
   */
  public buildRrule(config: RecurrenceConfig): string {
    const parts: string[] = [`FREQ=${config.frequency.toUpperCase()}`];

    if (config.interval && config.interval > 1) {
      parts.push(`INTERVAL=${config.interval}`);
    }

    if (config.frequency === 'weekly' && config.weekdays && config.weekdays.length > 0) {
      const days = config.weekdays
        .filter((d) => d >= 0 && d <= 6)
        .map((d) => DAY_CODES[d]);
      if (days.length > 0) {
        parts.push(`BYDAY=${days.join(',')}`);
      }
    }

    if (config.occurrenceCount && config.occurrenceCount > 0) {
      parts.push(`COUNT=${config.occurrenceCount}`);
    } else if (config.endDate) {
      const end = new Date(config.endDate);
      if (!isNaN(end.getTime())) {
        const untilStr = end.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        parts.push(`UNTIL=${untilStr}`);
      }
    }

    return parts.join(';');
  }

  /**
   * Calculate upcoming occurrence dates from a recurrence rule
   */
  public calculateOccurrences(
    startDate: Date,
    config: RecurrenceConfig,
    maxOccurrences = 10
  ): Date[] {
    const occurrences: Date[] = [new Date(startDate)];
    const limit = Math.min(config.occurrenceCount || 30, maxOccurrences);
    const endTimestamp = config.endDate ? new Date(config.endDate).getTime() : null;

    let current = new Date(startDate);
    const interval = Math.max(1, config.interval || 1);

    while (occurrences.length < limit) {
      if (config.frequency === 'daily') {
        current = new Date(current.getTime() + interval * 24 * 60 * 60 * 1000);
      } else if (config.frequency === 'weekly') {
        if (config.weekdays && config.weekdays.length > 1) {
          // Advance day by day until matching one of selected weekdays
          let found = false;
          for (let step = 1; step <= 7 * interval; step++) {
            const nextDay = new Date(current.getTime() + step * 24 * 60 * 60 * 1000);
            if (config.weekdays.includes(nextDay.getDay())) {
              current = nextDay;
              found = true;
              break;
            }
          }
          if (!found) break;
        } else {
          current = new Date(current.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
        }
      } else if (config.frequency === 'monthly') {
        const nextMonth = new Date(current);
        nextMonth.setMonth(nextMonth.getMonth() + interval);
        current = nextMonth;
      }

      if (endTimestamp && current.getTime() > endTimestamp) {
        break;
      }

      occurrences.push(new Date(current));
    }

    return occurrences;
  }
}

export const meetingRecurrenceService = new MeetingRecurrenceService();

