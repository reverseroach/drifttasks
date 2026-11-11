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

import { updateStreak, resetStreakIfNeeded, getStreakInfo } from './streaks'
import { resetStore, getStored } from '../test/fakeFirestore'
import { seedProfile } from '../test/builders'

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

describe('updateStreak', () => {
    it('starts a streak at 1 for a user who has never completed a task', async () => {
        seedProfile('user-1')
        await updateStreak('user-1')
        const profile = getStored('userProfiles', 'user-1')!
        expect(profile.currentStreak).toBe(1)
        expect(profile.longestStreak).toBe(1)
        expect(profile.lastStreakDate).toBe('2026-11-11')
    })

    it('adds one when the last streak day was yesterday', async () => {
        seedProfile('user-1', { currentStreak: 4, longestStreak: 10, lastStreakDate: '2026-11-10' })
        await updateStreak('user-1')
        const profile = getStored('userProfiles', 'user-1')!
        expect(profile.currentStreak).toBe(5)
        expect(profile.longestStreak).toBe(10)
        expect(profile.lastStreakDate).toBe('2026-11-11')
    })

    it('raises longestStreak when the current streak passes it', async () => {
        seedProfile('user-1', { currentStreak: 10, longestStreak: 10, lastStreakDate: '2026-11-10' })
        await updateStreak('user-1')
        expect(getStored('userProfiles', 'user-1')!.longestStreak).toBe(11)
    })

    it('only counts the first completed task of the day', async () => {
        seedProfile('user-1', { currentStreak: 4, longestStreak: 4, lastStreakDate: '2026-11-11' })
        await updateStreak('user-1')
        await updateStreak('user-1')
        expect(getStored('userProfiles', 'user-1')!.currentStreak).toBe(4)
    })

    it('restarts at 1 after a missed day but keeps the longest streak', async () => {
        seedProfile('user-1', { currentStreak: 6, longestStreak: 8, lastStreakDate: '2026-11-08' })
        await updateStreak('user-1')
        const profile = getStored('userProfiles', 'user-1')!
        expect(profile.currentStreak).toBe(1)
        expect(profile.longestStreak).toBe(8)
    })

    it('uses the user\'s timezone to decide what "today" is', async () => {
        // 03:00 UTC on the 12th is still the evening of the 11th in New York
        vi.setSystemTime(new Date('2026-11-12T03:00:00Z'))
        seedProfile('user-1', { currentStreak: 2, longestStreak: 2, lastStreakDate: '2026-11-11' })
        await updateStreak('user-1')
        expect(getStored('userProfiles', 'user-1')!.currentStreak).toBe(2)
    })

    it('throws when the user has no profile', async () => {
        await expect(updateStreak('nobody')).rejects.toThrow('User profile not found')
    })
})

describe('resetStreakIfNeeded', () => {
    it('resets the current streak to 0 when the user missed yesterday', async () => {
        seedProfile('user-1', { currentStreak: 5, longestStreak: 5, lastStreakDate: '2026-11-09' })
        await resetStreakIfNeeded('user-1')
        const profile = getStored('userProfiles', 'user-1')!
        expect(profile.currentStreak).toBe(0)
        expect(profile.longestStreak).toBe(5)
    })

    it('keeps the streak when the last streak day was yesterday, so today can still continue it', async () => {
        seedProfile('user-1', { currentStreak: 5, lastStreakDate: '2026-11-10' })
        await resetStreakIfNeeded('user-1')
        expect(getStored('userProfiles', 'user-1')!.currentStreak).toBe(5)
    })

    it('keeps the streak when the last streak day is today', async () => {
        seedProfile('user-1', { currentStreak: 5, lastStreakDate: '2026-11-11' })
        await resetStreakIfNeeded('user-1')
        expect(getStored('userProfiles', 'user-1')!.currentStreak).toBe(5)
    })

    it('does nothing for a user who has never had a streak', async () => {
        seedProfile('user-1')
        await resetStreakIfNeeded('user-1')
        expect(getStored('userProfiles', 'user-1')!.lastStreakUpdatedAt).toBeUndefined()
    })

    it('throws when the user has no profile', async () => {
        await expect(resetStreakIfNeeded('nobody')).rejects.toThrow('User profile not found')
    })
})

describe('getStreakInfo', () => {
    it('returns the streak fields from the profile', async () => {
        seedProfile('user-1', { currentStreak: 3, longestStreak: 9, lastStreakDate: '2026-11-11' })
        expect(await getStreakInfo('user-1')).toEqual({
            currentStreak: 3,
            longestStreak: 9,
            lastStreakDate: '2026-11-11',
        })
    })

    it('throws when the user has no profile', async () => {
        await expect(getStreakInfo('nobody')).rejects.toThrow('User profile not found')
    })
})
