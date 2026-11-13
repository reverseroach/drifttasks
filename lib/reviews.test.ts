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
    getCurrentWeekStart,
    generateWeeklyReviewData,
    ensureWeeklyReviewExists,
    getWeeklyReview,
    getReviewHistory,
    updateWeeklyReview,
    markWeeklyReviewViewed,
} from './reviews'
import { resetStore, seed, getStored, listStored, ts, FakeTimestamp } from '../test/fakeFirestore'
import { seedProfile, seedTask, seedSchedule } from '../test/builders'

beforeEach(() => {
    resetStore()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T15:00:00Z')) // Wednesday 10:00 in New York
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

const seedReview = (id: string, overrides: Record<string, unknown> = {}) =>
    seed('weeklyReviews', id, {
        userId: 'user-1',
        weekStarting: '2026-11-08',
        recapWeekStarting: '2026-11-01',
        tasksScheduled: 0,
        tasksDrifted: 0,
        completionRate: 0,
        highPriorityScheduled: 0,
        createdAt: ts('2026-11-08T12:00:00Z'),
        updatedAt: ts('2026-11-08T12:00:00Z'),
        ...overrides,
    })

describe('getCurrentWeekStart', () => {
    it('goes back to the most recent review day', () => {
        expect(getCurrentWeekStart('America/New_York', 0)).toBe('2026-11-08') // Sunday
        expect(getCurrentWeekStart('America/New_York', 1)).toBe('2026-11-09') // Monday
    })

    it('returns today when today is the review day', () => {
        expect(getCurrentWeekStart('America/New_York', 3)).toBe('2026-11-11')
    })

    it('goes back into last week when the review day is later in the week than today', () => {
        expect(getCurrentWeekStart('America/New_York', 4)).toBe('2026-11-05') // last Thursday
        expect(getCurrentWeekStart('America/New_York', 6)).toBe('2026-11-07') // last Saturday
    })

    it('uses the user\'s timezone, so a late evening is still the earlier day', () => {
        // 03:00 UTC Thursday is still Wednesday evening in New York
        vi.setSystemTime(new Date('2026-11-12T03:00:00Z'))
        expect(getCurrentWeekStart('America/New_York', 3)).toBe('2026-11-11')
        expect(getCurrentWeekStart('UTC', 3)).toBe('2026-11-11')
        expect(getCurrentWeekStart('UTC', 4)).toBe('2026-11-12')
    })
})

describe('generateWeeklyReviewData', () => {
    it('returns zeros for a past week with nothing scheduled', async () => {
        seedProfile('user-1', { weeklyReviewDay: 0 })
        expect(await generateWeeklyReviewData('user-1')).toEqual({
            weekStarting: '2026-11-08',
            recapWeekStarting: '2026-11-01',
            tasksScheduled: 0,
            tasksDrifted: 0,
            completionRate: 0,
            highPriorityScheduled: 0,
        })
    })

    it('is for the week ahead and recaps the week that just ended', async () => {
        // Wednesday 11-11 with a Sunday review day: planning Sun 11-08 onward,
        // recapping Sun 11-01 to Sat 11-07
        seedProfile('user-1', { weeklyReviewDay: 0 })
        seedTask('high-1', { priority: 'high' })
        seedTask('high-2', { priority: 'high' })
        seedTask('low-1', { priority: 'low' })
        seedSchedule('s1', { taskId: 'high-1', scheduledDate: '2026-11-01', status: 'completed' })
        seedSchedule('s2', { taskId: 'high-2', scheduledDate: '2026-11-03', status: 'drifted' })
        seedSchedule('s3', { taskId: 'low-1', scheduledDate: '2026-11-07', status: 'pending' })
        seedSchedule('s4', { taskId: 'low-1', scheduledDate: '2026-11-04', status: 'completed' })
        seedSchedule('before', { taskId: 'low-1', scheduledDate: '2026-10-31' })
        seedSchedule('this-week', { taskId: 'low-1', scheduledDate: '2026-11-08' })
        seedSchedule('theirs', { userId: 'user-2', scheduledDate: '2026-11-03' })

        expect(await generateWeeklyReviewData('user-1')).toEqual({
            weekStarting: '2026-11-08',
            recapWeekStarting: '2026-11-01',
            tasksScheduled: 4,
            tasksDrifted: 1,
            completionRate: 0.5,
            highPriorityScheduled: 2,
        })
    })

    it('handles more than 30 tasks in a week by querying them in batches', async () => {
        seedProfile('user-1', { weeklyReviewDay: 0 })
        for (let i = 0; i < 35; i++) {
            seedTask(`t${i}`, { priority: 'high' })
            seedSchedule(`s${i}`, { taskId: `t${i}`, scheduledDate: '2026-11-02' })
        }
        const review = await generateWeeklyReviewData('user-1')
        expect(review.tasksScheduled).toBe(35)
        expect(review.highPriorityScheduled).toBe(35)
    })

    it('throws when the user has no profile', async () => {
        await expect(generateWeeklyReviewData('nobody')).rejects.toThrow('User profile not found')
    })
})

describe('ensureWeeklyReviewExists', () => {
    it('creates this week\'s review, with last week\'s recap, when there isn\'t one', async () => {
        seedProfile('user-1', { weeklyReviewDay: 0 })
        seedTask('t1')
        seedSchedule('s1', { taskId: 't1', scheduledDate: '2026-11-02', status: 'completed' })

        await ensureWeeklyReviewExists('user-1')

        const reviews = listStored('weeklyReviews')
        expect(reviews).toHaveLength(1)
        expect(reviews[0]).toMatchObject({
            userId: 'user-1',
            weekStarting: '2026-11-08',
            recapWeekStarting: '2026-11-01',
            tasksScheduled: 1,
            completionRate: 1,
        })
    })

    it('does not create a second review for the same week', async () => {
        seedProfile('user-1', { weeklyReviewDay: 0 })
        seedReview('existing', { weekStarting: '2026-11-08' })

        await ensureWeeklyReviewExists('user-1')

        expect(listStored('weeklyReviews')).toHaveLength(1)
    })

    it('refreshes the recap on a review the user hasn\'t opened yet, keeping notes', async () => {
        seedProfile('user-1', { weeklyReviewDay: 0 })
        seedReview('existing', { weekStarting: '2026-11-08', tasksScheduled: 0, notes: 'Busy week' })
        seedTask('t1')
        seedSchedule('s1', { taskId: 't1', scheduledDate: '2026-11-07', status: 'drifted' })

        await ensureWeeklyReviewExists('user-1')

        expect(listStored('weeklyReviews')).toHaveLength(1)
        expect(getStored('weeklyReviews', 'existing')).toMatchObject({ tasksScheduled: 1, tasksDrifted: 1, notes: 'Busy week' })
    })

    it('leaves the recap alone once the user has opened the review', async () => {
        seedProfile('user-1', { weeklyReviewDay: 0 })
        seedReview('existing', { weekStarting: '2026-11-08', tasksScheduled: 0, reviewedAt: ts('2026-11-08T14:00:00Z') })
        seedTask('t1')
        seedSchedule('s1', { taskId: 't1', scheduledDate: '2026-11-07' })

        await ensureWeeklyReviewExists('user-1')

        expect(getStored('weeklyReviews', 'existing')!.tasksScheduled).toBe(0)
    })
})

describe('getWeeklyReview', () => {
    it('returns null when there is no review for that week', async () => {
        seedReview('r1', { weekStarting: '2026-11-01' })
        expect(await getWeeklyReview('user-1', '2026-11-08')).toBeNull()
    })

    it('returns the user\'s review for that week with Dates', async () => {
        seedReview('mine')
        seedReview('theirs', { userId: 'user-2' })
        const review = await getWeeklyReview('user-1', '2026-11-08')
        expect(review?.id).toBe('mine')
        expect(review?.createdAt).toEqual(new Date('2026-11-08T12:00:00Z'))
    })
})

describe('getReviewHistory', () => {
    it('returns the user\'s reviews newest week first, up to the limit', async () => {
        seedReview('a', { weekStarting: '2026-10-25' })
        seedReview('b', { weekStarting: '2026-11-08' })
        seedReview('c', { weekStarting: '2026-11-01' })
        seedReview('theirs', { userId: 'user-2', weekStarting: '2026-11-15' })

        expect((await getReviewHistory('user-1')).map(r => r.id)).toEqual(['b', 'c', 'a'])
        expect((await getReviewHistory('user-1', 2)).map(r => r.id)).toEqual(['b', 'c'])
    })

    it('returns an empty list when the user has no reviews', async () => {
        expect(await getReviewHistory('user-1')).toEqual([])
    })
})

describe('updateWeeklyReview and markWeeklyReviewViewed', () => {
    it('saves notes on the user\'s own review', async () => {
        seedReview('r1')
        await updateWeeklyReview('user-1', 'r1', { notes: 'Good week' })
        expect(getStored('weeklyReviews', 'r1')!.notes).toBe('Good week')
    })

    it('sets reviewedAt when the review is viewed', async () => {
        seedReview('r1')
        await markWeeklyReviewViewed('user-1', 'r1')
        expect(getStored('weeklyReviews', 'r1')!.reviewedAt).toBeInstanceOf(FakeTimestamp)
    })

    it('refuses to touch another user\'s review', async () => {
        seedReview('r1', { userId: 'user-2' })
        await expect(updateWeeklyReview('user-1', 'r1', { notes: 'x' })).rejects.toThrow('Unauthorized')
        await expect(markWeeklyReviewViewed('user-1', 'r1')).rejects.toThrow('Unauthorized')
        expect(getStored('weeklyReviews', 'r1')!.notes).toBeUndefined()
    })

    it('throws for a review that does not exist', async () => {
        await expect(updateWeeklyReview('user-1', 'missing', {})).rejects.toThrow('Weekly review not found')
        await expect(markWeeklyReviewViewed('user-1', 'missing')).rejects.toThrow('Weekly review not found')
    })
})
