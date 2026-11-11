// test/builders.ts
// Small helpers that build realistic documents so each test only spells out
// the fields it cares about.

import type { TaskSchedule } from '@/types'
import { seed, ts } from './fakeFirestore'

const CREATED = '2026-01-01T00:00:00Z'

/** A TaskSchedule object for the pure insights helpers. */
export function schedule(overrides: Partial<TaskSchedule> = {}): TaskSchedule {
    return {
        id: 'schedule-1',
        taskId: 'task-1',
        userId: 'user-1',
        scheduledDate: '2026-11-09',
        status: 'pending',
        isUserScheduled: true,
        isDrifted: false,
        createdAt: new Date(CREATED),
        updatedAt: new Date(CREATED),
        ...overrides,
    }
}

/** Seeds a userProfiles document with sensible defaults. */
export function seedProfile(userId: string, overrides: Record<string, unknown> = {}) {
    seed('userProfiles', userId, {
        email: `${userId}@example.com`,
        dailyTaskLimit: 3,
        preferredFocusStart: '09:00',
        preferredFocusEnd: '17:00',
        timezone: 'America/New_York',
        weekendMode: false,
        weeklyReviewDay: 0,
        autoDriftEnabled: true,
        driftDaysMin: 2,
        driftDaysMax: 5,
        currentStreak: 0,
        longestStreak: 0,
        insightWindowDays: 7,
        createdAt: ts(CREATED),
        updatedAt: ts(CREATED),
        ...overrides,
    })
}

/** Seeds a tasks document with sensible defaults. */
export function seedTask(id: string, overrides: Record<string, unknown> = {}) {
    seed('tasks', id, {
        userId: 'user-1',
        title: `Task ${id}`,
        priority: 'medium',
        energyRequired: 'medium',
        isRecurring: false,
        driftCount: 0,
        hasActiveSchedule: true,
        archived: false,
        createdAt: ts(CREATED),
        updatedAt: ts(CREATED),
        ...overrides,
    })
}

/** Seeds a taskSchedules document with sensible defaults. */
export function seedSchedule(id: string, overrides: Record<string, unknown> = {}) {
    seed('taskSchedules', id, {
        userId: 'user-1',
        taskId: 'task-1',
        scheduledDate: '2026-11-11',
        scheduledStartTime: '09:00',
        status: 'pending',
        isUserScheduled: true,
        isDrifted: false,
        createdAt: ts(CREATED),
        updatedAt: ts(CREATED),
        ...overrides,
    })
}

/** Seeds a categories document with sensible defaults. */
export function seedCategory(id: string, overrides: Record<string, unknown> = {}) {
    seed('categories', id, {
        userId: 'user-1',
        name: `Category ${id}`,
        color: '#3b82f6',
        sortOrder: 0,
        createdAt: ts(CREATED),
        updatedAt: ts(CREATED),
        ...overrides,
    })
}
