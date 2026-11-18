import { RecurrenceInput } from '../db/types';

export type RecurrenceConfig = RecurrenceInput;

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDINAL_LABELS: Record<number, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  [-1]: 'last',
};

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  weekday: number; // 0=Sun..6=Sat
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hour12: false,
    });
    const parts = dtf.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }
    const hour = Number(map.hour) === 24 ? 0 : Number(map.hour);
    const weekday = Math.max(0, DAY_SHORT.indexOf(map.weekday));
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour,
      minute: Number(map.minute),
      second: Number(map.second),
      weekday,
    };
  } catch (_) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      weekday: date.getUTCDay(),
    };
  }
}

/**
 * Converts a wall-clock date/time in a specific IANA timezone to the exact UTC Date,
 * preserving wall-clock time across DST transitions (two-pass offset convergence).
 */
export function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = new Date(guessUtcMs);

  for (let pass = 0; pass < 2; pass++) {
    const actual = getZonedParts(candidate, timeZone);
    const actualAsUtcMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    const diffMs = guessUtcMs - actualAsUtcMs;
    if (diffMs === 0) break;
    candidate = new Date(candidate.getTime() + diffMs);
  }

  return candidate;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getNthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): number {
  const totalDays = daysInMonth(year, month);
  if (nth === -1) {
    for (let d = totalDays; d >= 1; d--) {
      if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === weekday) {
        return d;
      }
    }
    return totalDays;
  }
  let count = 0;
  for (let d = 1; d <= totalDays; d++) {
    if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === weekday) {
      count++;
      if (count === nth) return d;
    }
  }
  return Math.min(totalDays, 28);
}

export class MeetingRecurrenceService {
  /**
   * Build RFC 5545 RRULE string
   */
  public buildRrule(config: RecurrenceConfig): string {
    if (config.frequency === 'custom' && config.customRrule) {
      return config.customRrule.replace(/^RRULE:/i, '').trim().toUpperCase();
    }

    if (config.frequency === 'weekdays') {
      const parts = ['FREQ=WEEKLY', 'BYDAY=MO,TU,WE,TH,FR'];
      if (config.occurrenceCount && config.occurrenceCount > 0) {
        parts.push(`COUNT=${config.occurrenceCount}`);
      } else if (config.endDate) {
        const end = new Date(config.endDate);
        if (!isNaN(end.getTime())) {
          parts.push(`UNTIL=${end.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`);
        }
      }
      return parts.join(';');
    }

    const parts: string[] = [`FREQ=${config.frequency.toUpperCase()}`];

    if (config.interval && config.interval > 1) {
      parts.push(`INTERVAL=${config.interval}`);
    }

    if (config.frequency === 'weekly' && config.weekdays && config.weekdays.length > 0) {
      const days = Array.from(new Set(config.weekdays))
        .filter((d) => d >= 0 && d <= 6)
        .sort((a, b) => a - b)
        .map((d) => DAY_CODES[d]);
      if (days.length > 0) {
        parts.push(`BYDAY=${days.join(',')}`);
      }
    }

    if (
      config.frequency === 'monthly' &&
      config.monthlyMode === 'nth_weekday' &&
      config.monthlyWeekday !== undefined &&
      config.monthlyWeek !== undefined
    ) {
      const dayCode = DAY_CODES[config.monthlyWeekday] || 'MO';
      const nth = config.monthlyWeek === -1 ? -1 : Math.max(1, Math.min(4, config.monthlyWeek));
      parts.push(`BYDAY=${nth}${dayCode}`);
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
   * Parse an RFC 5545 RRULE string back into a structured RecurrenceConfig
   */
  public parseRrule(rrule: string): RecurrenceConfig {
    const clean = rrule.replace(/^RRULE:/i, '').trim();
    const kv: Record<string, string> = {};
    for (const part of clean.split(';')) {
      const [k, v] = part.split('=');
      if (k && v) {
        kv[k.toUpperCase().trim()] = v.toUpperCase().trim();
      }
    }

    const freqRaw = (kv.FREQ || 'WEEKLY').toLowerCase();
    const frequency: RecurrenceConfig['frequency'] =
      freqRaw === 'daily' || freqRaw === 'weekly' || freqRaw === 'monthly' ? freqRaw : 'weekly';
    const interval = kv.INTERVAL ? Math.max(1, parseInt(kv.INTERVAL, 10) || 1) : 1;

    const config: RecurrenceConfig = { frequency, interval };

    if (kv.BYDAY) {
      const tokens = kv.BYDAY.split(',');
      const nthMatch = tokens.length === 1 ? /^(-?\d)([A-Z]{2})$/.exec(tokens[0]) : null;
      if (frequency === 'monthly' && nthMatch) {
        config.monthlyMode = 'nth_weekday';
        config.monthlyWeek = parseInt(nthMatch[1], 10);
        config.monthlyWeekday = Math.max(0, DAY_CODES.indexOf(nthMatch[2]));
      } else {
        const weekdays = tokens
          .map((t) => DAY_CODES.indexOf(t.replace(/^-?\d+/, '')))
          .filter((idx) => idx >= 0);
        if (weekdays.length > 0) {
          config.weekdays = weekdays;
        }
      }
    }

    if (kv.COUNT) {
      const cnt = parseInt(kv.COUNT, 10);
      if (cnt > 0) config.occurrenceCount = cnt;
    }

    if (kv.UNTIL) {
      const m = /^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?$/.exec(kv.UNTIL);
      if (m) {
        const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4] || '23'}:${m[5] || '59'}:${m[6] || '59'}Z`;
        const parsed = new Date(iso);
        if (!isNaN(parsed.getTime())) {
          config.endDate = parsed.toISOString();
        }
      }
    }

    return config;
  }

  /**
   * DST-safe calculation of occurrences from a start date & RecurrenceConfig in an IANA timezone.
   */
  public calculateOccurrences(
    startDate: Date,
    config: RecurrenceConfig,
    maxOccurrences = 60,
    timeZone = 'UTC',
    horizonEndDate?: Date
  ): Date[] {
    const effectiveConfig: RecurrenceConfig =
      config.frequency === 'weekdays'
        ? { ...config, frequency: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] }
        : config.frequency === 'custom' && config.customRrule
          ? this.parseRrule(config.customRrule)
          : config;

    const interval = Math.max(1, effectiveConfig.interval || 1);
    const maxCount = effectiveConfig.occurrenceCount
      ? Math.min(effectiveConfig.occurrenceCount, maxOccurrences)
      : maxOccurrences;
    const ruleEndMs = effectiveConfig.endDate ? new Date(effectiveConfig.endDate).getTime() : null;
    const horizonMs = horizonEndDate ? horizonEndDate.getTime() : null;
    const effectiveEndMs =
      ruleEndMs && horizonMs ? Math.min(ruleEndMs, horizonMs) : ruleEndMs || horizonMs;

    const startParts = getZonedParts(startDate, timeZone);
    const occurrences: Date[] = [];

    const pushIfValid = (d: Date): boolean => {
      if (effectiveEndMs && d.getTime() > effectiveEndMs) {
        return false;
      }
      occurrences.push(d);
      return occurrences.length < maxCount;
    };

    if (effectiveConfig.frequency === 'daily') {
      let curDate = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
      let safety = 0;
      while (occurrences.length < maxCount && safety < 2000) {
        safety++;
        const dt = zonedWallClockToUtc(
          curDate.getUTCFullYear(),
          curDate.getUTCMonth() + 1,
          curDate.getUTCDate(),
          startParts.hour,
          startParts.minute,
          startParts.second,
          timeZone
        );
        if (!pushIfValid(dt)) break;
        curDate = new Date(curDate.getTime() + interval * 86400000);
      }
      return occurrences;
    }

    if (effectiveConfig.frequency === 'weekly') {
      const targetDays =
        effectiveConfig.weekdays && effectiveConfig.weekdays.length > 0
          ? Array.from(new Set(effectiveConfig.weekdays)).sort((a, b) => a - b)
          : [startParts.weekday];

      // Anchor to Sunday of the start week in wall-clock calendar
      const startCal = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
      const startDow = startCal.getUTCDay();
      let weekStart = new Date(startCal.getTime() - startDow * 86400000);
      let safety = 0;

      while (occurrences.length < maxCount && safety < 500) {
        safety++;
        let exceededEnd = false;
        for (const dow of targetDays) {
          const candidateCal = new Date(weekStart.getTime() + dow * 86400000);
          if (candidateCal.getTime() < startCal.getTime()) {
            continue;
          }
          const dt = zonedWallClockToUtc(
            candidateCal.getUTCFullYear(),
            candidateCal.getUTCMonth() + 1,
            candidateCal.getUTCDate(),
            startParts.hour,
            startParts.minute,
            startParts.second,
            timeZone
          );
          if (effectiveEndMs && dt.getTime() > effectiveEndMs) {
            exceededEnd = true;
            break;
          }
          occurrences.push(dt);
          if (occurrences.length >= maxCount) break;
        }
        if (exceededEnd) break;
        weekStart = new Date(weekStart.getTime() + interval * 7 * 86400000);
      }

      // Ensure startDate is included if startDay wasn't among targetDays and no occurrences matched early
      if (occurrences.length === 0) {
        occurrences.push(new Date(startDate));
      }
      return occurrences;
    }

    if (effectiveConfig.frequency === 'monthly') {
      let curYear = startParts.year;
      let curMonth = startParts.month;
      let safety = 0;

      while (occurrences.length < maxCount && safety < 240) {
        safety++;
        let targetDay: number;
        if (
          effectiveConfig.monthlyMode === 'nth_weekday' &&
          effectiveConfig.monthlyWeek !== undefined &&
          effectiveConfig.monthlyWeekday !== undefined
        ) {
          targetDay = getNthWeekdayOfMonth(
            curYear,
            curMonth,
            effectiveConfig.monthlyWeekday,
            effectiveConfig.monthlyWeek
          );
        } else {
          targetDay = Math.min(startParts.day, daysInMonth(curYear, curMonth));
        }

        const dt = zonedWallClockToUtc(
          curYear,
          curMonth,
          targetDay,
          startParts.hour,
          startParts.minute,
          startParts.second,
          timeZone
        );

        if (dt.getTime() >= startDate.getTime() - 60000) {
          if (!pushIfValid(dt)) break;
        }

        const totalMonths = curYear * 12 + (curMonth - 1) + interval;
        curYear = Math.floor(totalMonths / 12);
        curMonth = (totalMonths % 12) + 1;
      }

      if (occurrences.length === 0) {
        occurrences.push(new Date(startDate));
      }
      return occurrences;
    }

    return [new Date(startDate)];
  }

  /**
   * Rolling 90-day occurrence window generator.
   */
  public generateRollingWindow(params: {
    startDate: Date;
    durationMinutes: number;
    rrule: string;
    timeZone: string;
    windowDays?: number;
    maxOccurrences?: number;
  }): Array<{ occurrence_number: number; scheduled_at: Date; scheduled_end_at: Date }> {
    const config = this.parseRrule(params.rrule);
    const windowDays = params.windowDays ?? 90;
    const horizonEnd = new Date(
      Math.max(Date.now(), params.startDate.getTime()) + windowDays * 86400000
    );

    const dates = this.calculateOccurrences(
      params.startDate,
      config,
      params.maxOccurrences ?? 90,
      params.timeZone,
      horizonEnd
    );

    return dates.map((d, idx) => ({
      occurrence_number: idx + 1,
      scheduled_at: d,
      scheduled_end_at: new Date(d.getTime() + params.durationMinutes * 60000),
    }));
  }

  /**
   * Human-readable recurrence summary (e.g., "Every Mon, Wed until Dec 18, 2026")
   */
  public describeRecurrence(rrule?: string | null, timeZone = 'UTC'): string | null {
    if (!rrule) return null;
    const cfg = this.parseRrule(rrule);
    let summary = '';

    if (cfg.frequency === 'daily') {
      summary = cfg.interval === 1 ? 'Every day' : `Every ${cfg.interval} days`;
    } else if (cfg.frequency === 'weekly') {
      const days = cfg.weekdays || [];
      if (
        cfg.interval === 1 &&
        days.length === 5 &&
        [1, 2, 3, 4, 5].every((d) => days.includes(d))
      ) {
        summary = 'Every weekday (Mon–Fri)';
      } else if (days.length > 0) {
        const dayStr = days.map((d) => DAY_SHORT[d]).join(', ');
        summary = cfg.interval === 1 ? `Every ${dayStr}` : `Every ${cfg.interval} weeks on ${dayStr}`;
      } else {
        summary = cfg.interval === 1 ? 'Weekly' : `Every ${cfg.interval} weeks`;
      }
    } else if (cfg.frequency === 'monthly') {
      if (
        cfg.monthlyMode === 'nth_weekday' &&
        cfg.monthlyWeek !== undefined &&
        cfg.monthlyWeekday !== undefined
      ) {
        const ord = ORDINAL_LABELS[cfg.monthlyWeek] || `${cfg.monthlyWeek}th`;
        const dayName = DAY_NAMES[cfg.monthlyWeekday] || 'day';
        summary =
          cfg.interval === 1
            ? `Monthly on the ${ord} ${dayName}`
            : `Every ${cfg.interval} months on the ${ord} ${dayName}`;
      } else {
        summary = cfg.interval === 1 ? 'Monthly' : `Every ${cfg.interval} months`;
      }
    }

    if (cfg.occurrenceCount) {
      summary += `, ${cfg.occurrenceCount} occurrences`;
    } else if (cfg.endDate) {
      try {
        const formattedEnd = new Intl.DateTimeFormat('en-US', {
          timeZone,
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(new Date(cfg.endDate));
        summary += ` until ${formattedEnd}`;
      } catch (_) {
        summary += ` until ${cfg.endDate.slice(0, 10)}`;
      }
    }

    return summary;
  }
}

export const meetingRecurrenceService = new MeetingRecurrenceService();
