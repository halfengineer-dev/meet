export interface ITimezoneOption {
    value: string;
    label: string;
    offset: string;
}

export function detectUserTimezone(): string {
    try {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detected) {
            return detected;
        }
    } catch (_) {}
    return 'UTC';
}

export const COMMON_TIMEZONES: ITimezoneOption[] = [
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)', offset: 'GMT+00:00' },
    { value: 'America/New_York', label: 'Eastern Time - US & Canada (New York)', offset: 'GMT-05:00' },
    { value: 'America/Chicago', label: 'Central Time - US & Canada (Chicago)', offset: 'GMT-06:00' },
    { value: 'America/Denver', label: 'Mountain Time - US & Canada (Denver)', offset: 'GMT-07:00' },
    { value: 'America/Los_Angeles', label: 'Pacific Time - US & Canada (Los Angeles)', offset: 'GMT-08:00' },
    { value: 'America/Sao_Paulo', label: 'Brasilia Time (Sao Paulo)', offset: 'GMT-03:00' },
    { value: 'Europe/London', label: 'Greenwich Mean Time (London)', offset: 'GMT+00:00' },
    { value: 'Europe/Paris', label: 'Central European Time (Paris, Berlin, Rome)', offset: 'GMT+01:00' },
    { value: 'Europe/Helsinki', label: 'Eastern European Time (Helsinki, Athens)', offset: 'GMT+02:00' },
    { value: 'Europe/Moscow', label: 'Moscow Standard Time', offset: 'GMT+03:00' },
    { value: 'Africa/Cairo', label: 'Eastern European Time (Cairo)', offset: 'GMT+02:00' },
    { value: 'Africa/Johannesburg', label: 'South Africa Standard Time (Johannesburg)', offset: 'GMT+02:00' },
    { value: 'Asia/Dubai', label: 'Gulf Standard Time (Dubai)', offset: 'GMT+04:00' },
    { value: 'Asia/Kolkata', label: 'India Standard Time (Kolkata, New Delhi)', offset: 'GMT+05:30' },
    { value: 'Asia/Dhaka', label: 'Bangladesh Standard Time (Dhaka)', offset: 'GMT+06:00' },
    { value: 'Asia/Bangkok', label: 'Indochina Time (Bangkok, Jakarta)', offset: 'GMT+07:00' },
    { value: 'Asia/Singapore', label: 'Singapore Standard Time', offset: 'GMT+08:00' },
    { value: 'Asia/Hong_Kong', label: 'Hong Kong Time', offset: 'GMT+08:00' },
    { value: 'Asia/Tokyo', label: 'Japan Standard Time (Tokyo)', offset: 'GMT+09:00' },
    { value: 'Australia/Sydney', label: 'Australian Eastern Time (Sydney)', offset: 'GMT+11:00' },
    { value: 'Pacific/Auckland', label: 'New Zealand Daylight Time (Auckland)', offset: 'GMT+13:00' },
];

