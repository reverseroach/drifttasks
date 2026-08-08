import { 
    expect, 
    it, 
    describe, 
} from 'vitest'
import { 
    formatDateInTimeZone,
    addDaysToDateString,
    daysBetweenDateStrings,
 } from './dateUtils'

describe('formatDateInTimeZone', () => {
    it('returns different results for the same instant in timezones on opposite sides of the date line', () => {
        const date = new Date('2026-07-18T23:00:00Z') // 2026-07-18 23:00 UTC
        expect(formatDateInTimeZone('Pacific/Kiritimati', date)).toBe('2026-07-19') // +14 hours
        expect(formatDateInTimeZone('Pacific/Niue', date)).toBe('2026-07-18') // -11 hours
    })

    it('keeps a late-night local time on its own calendar day, not UTC\'s', () => {
        const date = new Date('2026-07-19T05:30:00Z') // 2026-07-19 05:30 UTC
        expect(formatDateInTimeZone('America/Los_Angeles', date)).toBe('2026-07-18')
        expect(formatDateInTimeZone('UTC', date)).toBe('2026-07-19')
    })

    it('falls back to UTC for missing/invalid timezones', () => {
        const date = new Date('2026-07-19T05:30:00Z') // 2026-07-19 05:30 UTC
        expect(formatDateInTimeZone(undefined, date)).toBe('2026-07-19')
        expect(formatDateInTimeZone('', date)).toBe('2026-07-19')
        expect(formatDateInTimeZone('Invalid/Timezone', date)).toBe('2026-07-19')
    })
})

describe('addDaysToDateString', () => {
    it('adds days to a date string when a month boundary is crossed', () => {
        expect(addDaysToDateString('2026-07-31', 1)).toBe('2026-08-01')
    })

    it('adds days to a date string when a year boundary is crossed', () => {
        expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01')
    })

    it('subtracts days from a date string when a non-leap year February boundary is crossed', () => {
        expect(addDaysToDateString('2026-03-01', -1)).toBe('2026-02-28')
    })

    it('subtracts days from a date string when a leap year Feburary boundary is crossed', () => {
        expect(addDaysToDateString('2028-03-01', -1)).toBe('2028-02-29')
    })
})

describe('daysBetweenDateStrings', () => {
    it('returns the number of days between two date strings when a month boundary is crossed', () => {
        expect(daysBetweenDateStrings('2026-07-31', '2026-08-01')).toBe(1)
    })

    it('returns the number of days between two date strings when a year boundary is crossed', () => {
        expect(daysBetweenDateStrings('2026-12-31', '2027-01-01')).toBe(1)
    })

    it('returns a negative number when the end date is before the start date', () => {
        expect(daysBetweenDateStrings('2026-08-01', '2026-07-31')).toBe(-1)
    })

    it('returns the number of days between to date strings when a leap year Feburary boundary is crossed', () => {
        expect(daysBetweenDateStrings('2028-02-27', '2028-03-02')).toBe(4)
    })

    it('returns the number of days between to date strings when a non-leap year Feburary boundary is crossed', () => {
        expect(daysBetweenDateStrings('2026-02-27', '2026-03-02')).toBe(3)
    })
})
