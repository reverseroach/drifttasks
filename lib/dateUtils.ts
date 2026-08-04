// lib/dateUtils.ts

export const DEFAULT_TIMEZONE = 'UTC';

/**
 * Formats a Date (defaults to now) as a YYYY-MM-DD string in the given IANA timezone.
 * Falls back to UTC if timezone is missing/invalid.
 */
export function formatDateInTimeZone(timeZone: string | undefined, date: Date = new Date()): string {
    const tz = timeZone && timeZone.trim() ? timeZone : DEFAULT_TIMEZONE;
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(date);
    } catch (error) {
        console.error(`Invalid timezone "${tz}", falling back to ${DEFAULT_TIMEZONE}`, error);
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: DEFAULT_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(date);
    }
}

/**
 * Adds `days` (positive or negative) to a YYYY-MM-DD calendar-date string, returning a new
 * YYYY-MM-DD string. Pure calendar-date arithmetic anchored at UTC internally, so it's not
 * subject to host-timezone or DST bugs.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const anchor = new Date(Date.UTC(year, month - 1, day));
    anchor.setUTCDate(anchor.getUTCDate() + days);
    return formatDateInTimeZone(DEFAULT_TIMEZONE, anchor);
}

/**
 * Returns the number of calendar days between two YYYY-MM-DD strings (end - start).
 * Anchored at UTC internally like addDaysToDateString, so it's not subject to
 * host-timezone or DST bugs. Negative if `end` is before `start`.
 */
export function daysBetweenDateStrings(start: string, end: string): number {
    const [startYear, startMonth, startDay] = start.split('-').map(Number);
    const startAnchor = new Date(Date.UTC(startYear, startMonth-1, startDay));

    const [endYear, endMonth, endDay] = end.split('-').map(Number);
    const endAnchor = new Date(Date.UTC(endYear, endMonth-1, endDay));

    const daysBetween = Math.round((endAnchor.getTime() - startAnchor.getTime()) / (1000 * 60 * 60 * 24))
    return daysBetween
}