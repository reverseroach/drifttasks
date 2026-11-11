import {
    expect,
    it,
    describe,
    vi,
    beforeEach,
    afterEach,
} from 'vitest'

vi.mock('firebase/firestore', () => import('../test/fakeFirestore'))
vi.mock('./firebase', () => ({ db: {}, auth: {} }))

import {
    calculateDayCompletionRates,
    calculateTimeOfDayPerformance,
    calculateDriftPerformance,
    calculateCategoryPerformance,
    calculatePriorityPerformance,
    calculateEnergyPerformance,
    ensureUserInsightsFresh,
    getUserInsights,
} from './insights'
import type { Category, Priority, EnergyRequired } from '@/types'
import { resetStore, seed, getStored, ts } from '../test/fakeFirestore'
import { schedule, seedProfile, seedTask, seedSchedule, seedCategory } from '../test/builders'

// ==================== Pure calculation helpers ==================== //

describe('calculateDayCompletionRates', () => {
    it('returns all seven days at zero when there are no schedules', () => {
        const result = calculateDayCompletionRates([])
        expect(Object.keys(result)).toEqual(['0', '1', '2', '3', '4', '5', '6'])
        for (const stats of Object.values(result)) {
            expect(stats).toEqual({ totalScheduled: 0, completed: 0, rate: 0 })
        }
    })

    it('groups schedules by the day of the week of their scheduledDate', () => {
        const result = calculateDayCompletionRates([
            schedule({ scheduledDate: '2026-11-08', status: 'completed' }), // Sunday
            schedule({ scheduledDate: '2026-11-09', status: 'completed' }), // Monday
            schedule({ scheduledDate: '2026-11-09', status: 'pending' }),   // Monday
            schedule({ scheduledDate: '2026-11-16', status: 'drifted' }),   // Monday, next week
        ])
        expect(result[0]).toEqual({ totalScheduled: 1, completed: 1, rate: 1 })
        expect(result[1]).toEqual({ totalScheduled: 3, completed: 1, rate: 1 / 3 })
        expect(result[2]).toEqual({ totalScheduled: 0, completed: 0, rate: 0 })
    })

    it('uses the calendar date, not the host timezone, to pick the weekday', () => {
        // Saturday 2026-11-14 must stay Saturday however the machine running the tests is set up
        const result = calculateDayCompletionRates([schedule({ scheduledDate: '2026-11-14' })])
        expect(result[6].totalScheduled).toBe(1)
    })
})

describe('calculateTimeOfDayPerformance', () => {
    it('returns zero for every bucket when there are no timed schedules', () => {
        expect(calculateTimeOfDayPerformance([schedule({ scheduledStartTime: undefined })])).toEqual({
            morning: 0, afternoon: 0, evening: 0, lateNight: 0,
        })
    })

    it('puts each start hour in the right bucket at the boundaries', () => {
        const done = (time: string) => schedule({ scheduledStartTime: time, status: 'completed' })
        const missed = (time: string) => schedule({ scheduledStartTime: time, status: 'pending' })

        const result = calculateTimeOfDayPerformance([
            done('05:00'), done('11:59'),        // morning 2/2
            done('12:00'), missed('16:59'),      // afternoon 1/2
            missed('17:00'), missed('23:59'),    // evening 0/2
            done('00:00'), missed('04:59'),      // late night 1/2
        ])
        expect(result).toEqual({ morning: 1, afternoon: 0.5, evening: 0, lateNight: 0.5 })
    })
})

describe('calculateDriftPerformance', () => {
    it('returns zero rate for no schedules instead of dividing by zero', () => {
        expect(calculateDriftPerformance([])).toEqual({ driftRate: 0, driftCount: 0 })
    })

    it('counts drifted schedules as a fraction of all schedules', () => {
        const result = calculateDriftPerformance([
            schedule({ status: 'drifted' }),
            schedule({ status: 'drifted' }),
            schedule({ status: 'completed' }),
            schedule({ status: 'pending' }),
        ])
        expect(result).toEqual({ driftRate: 0.5, driftCount: 2 })
    })
})

describe('calculateCategoryPerformance', () => {
    const categories = [{ id: 'home' }, { id: 'work' }] as Category[]

    it('starts every user category at zero, even ones with no schedules', () => {
        const result = calculateCategoryPerformance([], new Map(), categories)
        expect(result).toEqual({
            home: { totalScheduled: 0, completed: 0, rate: 0 },
            work: { totalScheduled: 0, completed: 0, rate: 0 },
        })
    })

    it('looks up each schedule\'s category through its task and skips uncategorised tasks', () => {
        const lookup = new Map([['t-home', 'home'], ['t-work', 'work']])
        const result = calculateCategoryPerformance([
            schedule({ taskId: 't-home', status: 'completed' }),
            schedule({ taskId: 't-home', status: 'pending' }),
            schedule({ taskId: 't-work', status: 'completed' }),
            schedule({ taskId: 't-none', status: 'completed' }),
        ], lookup, categories)
        expect(result.home).toEqual({ totalScheduled: 2, completed: 1, rate: 0.5 })
        expect(result.work).toEqual({ totalScheduled: 1, completed: 1, rate: 1 })
    })
})

describe('calculatePriorityPerformance', () => {
    it('splits completion rate by task priority', () => {
        const lookup = new Map<string, Priority>([['a', 'high'], ['b', 'low']])
        const result = calculatePriorityPerformance([
            schedule({ taskId: 'a', status: 'completed' }),
            schedule({ taskId: 'a', status: 'drifted' }),
            schedule({ taskId: 'b', status: 'completed' }),
        ], lookup)
        expect(result).toEqual({
            high: { totalScheduled: 2, completed: 1, rate: 0.5 },
            medium: { totalScheduled: 0, completed: 0, rate: 0 },
            low: { totalScheduled: 1, completed: 1, rate: 1 },
        })
    })
})

describe('calculateEnergyPerformance', () => {
    it('splits completion rate by energy required and ignores unknown tasks', () => {
        const lookup = new Map<string, EnergyRequired>([['a', 'medium']])
        const result = calculateEnergyPerformance([
            schedule({ taskId: 'a', status: 'pending' }),
            schedule({ taskId: 'a', status: 'completed' }),
            schedule({ taskId: 'unknown', status: 'completed' }),
        ], lookup)
        expect(result.medium).toEqual({ totalScheduled: 2, completed: 1, rate: 0.5 })
        expect(result.high.totalScheduled).toBe(0)
        expect(result.low.totalScheduled).toBe(0)
    })
})

// ==================== ensureUserInsightsFresh (Firestore faked) ==================== //

describe('ensureUserInsightsFresh', () => {
    beforeEach(() => {
        resetStore()
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-11-11T15:00:00Z')) // Wed 10:00 in New York
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('throws when the user has no profile', async () => {
        await expect(ensureUserInsightsFresh('nobody')).rejects.toThrow('User profile not found')
    })

    it('creates insights from the last insightWindowDays days, not counting today', async () => {
        seedProfile('user-1', { insightWindowDays: 7 })
        seedCategory('home')
        seedTask('task-1', { priority: 'high', energyRequired: 'low', categoryId: 'home' })
        seedTask('task-2', { priority: 'low', energyRequired: 'high' })
        seedSchedule('s1', { taskId: 'task-1', scheduledDate: '2026-11-04', status: 'completed' }) // first day of window
        seedSchedule('s2', { taskId: 'task-2', scheduledDate: '2026-11-10', status: 'drifted' })   // last day of window
        seedSchedule('s3', { taskId: 'task-2', scheduledDate: '2026-11-11', status: 'pending' })   // today, outside window
        seedSchedule('s4', { taskId: 'task-2', scheduledDate: '2026-11-03', status: 'pending' })   // too old
        seedSchedule('other', { userId: 'user-2', scheduledDate: '2026-11-05' })                   // someone else

        await ensureUserInsightsFresh('user-1')

        const stored = getStored('userInsights', 'user-1')!
        expect(stored.windowStart).toBe('2026-11-04')
        expect(stored.windowEnd).toBe('2026-11-11')
        expect(stored.driftCount).toBe(1)
        expect(stored.driftRate).toBe(0.5)
        expect(stored.categoryPerformance).toEqual({ home: { totalScheduled: 1, completed: 1, rate: 1 } })
        expect((stored.priorityPerformance as Record<string, unknown>).high).toEqual({ totalScheduled: 1, completed: 1, rate: 1 })
        expect((stored.energyPerformance as Record<string, unknown>).high).toEqual({ totalScheduled: 1, completed: 0, rate: 0 })
        // 2026-11-04 is a Wednesday
        expect((stored.dayCompletionRates as Record<string, unknown>)[3]).toEqual({ totalScheduled: 1, completed: 1, rate: 1 })
    })

    it('does not create insights when there are no schedules in the window', async () => {
        seedProfile('user-1')
        await ensureUserInsightsFresh('user-1')
        expect(getStored('userInsights', 'user-1')).toBeUndefined()
    })

    it('leaves insights alone when they were already updated today with the same window', async () => {
        seedProfile('user-1', { insightWindowDays: 7 })
        seedSchedule('s1', { scheduledDate: '2026-11-10', status: 'completed' })
        seedTask('task-1')
        seed('userInsights', 'user-1', {
            windowStart: '2026-11-04',
            windowEnd: '2026-11-11',
            driftCount: 99,
            lastUpdated: ts('2026-11-11T13:00:00Z'), // 08:00 today in New York
        })

        await ensureUserInsightsFresh('user-1')

        expect(getStored('userInsights', 'user-1')!.driftCount).toBe(99)
    })

    it('regenerates insights last updated on an earlier day in the user\'s timezone', async () => {
        seedProfile('user-1', { insightWindowDays: 7 })
        seedSchedule('s1', { scheduledDate: '2026-11-10', status: 'completed' })
        seedTask('task-1')
        seed('userInsights', 'user-1', {
            windowStart: '2026-11-03',
            windowEnd: '2026-11-10',
            driftCount: 99,
            // 03:00 UTC on the 11th is still the 10th in New York
            lastUpdated: ts('2026-11-11T03:00:00Z'),
        })

        await ensureUserInsightsFresh('user-1')

        const stored = getStored('userInsights', 'user-1')!
        expect(stored.driftCount).toBe(0)
        expect(stored.windowEnd).toBe('2026-11-11')
    })

    it('regenerates insights the same day when the user changes their window size', async () => {
        seedProfile('user-1', { insightWindowDays: 14 })
        seedSchedule('s1', { scheduledDate: '2026-11-01', status: 'drifted' }) // only inside a 14 day window
        seedTask('task-1')
        seed('userInsights', 'user-1', {
            windowStart: '2026-11-04',
            windowEnd: '2026-11-11',
            driftCount: 0,
            lastUpdated: ts('2026-11-11T14:00:00Z'),
        })

        await ensureUserInsightsFresh('user-1')

        const stored = getStored('userInsights', 'user-1')!
        expect(stored.windowStart).toBe('2026-10-28')
        expect(stored.driftCount).toBe(1)
    })
})

describe('getUserInsights', () => {
    beforeEach(() => {
        resetStore()
        vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns null when the user has no insights yet', async () => {
        expect(await getUserInsights('user-1')).toBeNull()
    })

    it('converts lastUpdated from a Firestore timestamp to a Date', async () => {
        seed('userInsights', 'user-1', { driftCount: 2, lastUpdated: ts('2026-11-10T12:00:00Z') })
        const insights = await getUserInsights('user-1')
        expect(insights?.userId).toBe('user-1')
        expect(insights?.lastUpdated).toEqual(new Date('2026-11-10T12:00:00Z'))
    })
})
