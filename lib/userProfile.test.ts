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

import { createUserProfile, getUserProfile, updateUserProfile } from './userProfile'
import type { UserProfile } from '@/types'
import { resetStore, getStored } from '../test/fakeFirestore'
import { seedProfile } from '../test/builders'

beforeEach(() => {
    resetStore()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

const settings = {
    email: 'ant@example.com',
    dailyTaskLimit: 3,
    preferredFocusStart: '09:00',
    preferredFocusEnd: '17:00',
    timezone: 'America/New_York',
    weekendMode: false,
    weeklyReviewDay: 0,
    autoDriftEnabled: true,
    driftDaysMin: 2,
    driftDaysMax: 5,
    insightWindowDays: 14,
} as Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt' | 'currentStreak' | 'longestStreak'>

describe('createUserProfile', () => {
    it('saves the profile under the uid with both streaks starting at 0', async () => {
        await createUserProfile('user-1', settings)
        expect(getStored('userProfiles', 'user-1')).toMatchObject({
            ...settings,
            currentStreak: 0,
            longestStreak: 0,
        })
    })

    // KNOWN BUG: the profile returned to the caller is missing the streak fields
    // that were saved, so anything using the return value sees them as undefined.
    it.fails('returns the streak fields it saved', async () => {
        const profile = await createUserProfile('user-1', settings)
        expect(profile.currentStreak).toBe(0)
        expect(profile.longestStreak).toBe(0)
    })
})

describe('getUserProfile', () => {
    it('returns null for a user without a profile', async () => {
        expect(await getUserProfile('nobody')).toBeNull()
    })

    it('returns the profile with uid set and timestamps as Dates', async () => {
        seedProfile('user-1', { dailyTaskLimit: 4 })
        const profile = await getUserProfile('user-1')
        expect(profile?.uid).toBe('user-1')
        expect(profile?.dailyTaskLimit).toBe(4)
        expect(profile?.createdAt).toBeInstanceOf(Date)
    })
})

describe('updateUserProfile', () => {
    it('changes only the fields given', async () => {
        seedProfile('user-1', { dailyTaskLimit: 3, timezone: 'America/New_York' })
        await updateUserProfile('user-1', { dailyTaskLimit: 2 })
        const stored = getStored('userProfiles', 'user-1')!
        expect(stored.dailyTaskLimit).toBe(2)
        expect(stored.timezone).toBe('America/New_York')
    })

    it('throws for a user without a profile', async () => {
        await expect(updateUserProfile('nobody', {})).rejects.toThrow('User profile not found')
    })
})
