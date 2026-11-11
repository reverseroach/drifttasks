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

import { taskService } from './tasks'
import type { Task } from '@/types'
import { resetStore, getStored, ts, FakeTimestamp } from '../test/fakeFirestore'
import { seedProfile, seedTask, seedSchedule } from '../test/builders'

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

const newTask = {
    userId: 'user-1',
    title: 'Clean the bathroom',
    priority: 'high',
    energyRequired: 'medium',
    isRecurring: false,
    hasActiveSchedule: false,
} as Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'driftCount' | 'archived'>

describe('createTask', () => {
    it('saves the task with driftCount 0, not archived, and timestamps', async () => {
        const task = await taskService.createTask('user-1', newTask)

        const stored = getStored('tasks', task.id)!
        expect(stored).toMatchObject({ title: 'Clean the bathroom', userId: 'user-1', driftCount: 0, archived: false })
        expect(stored.createdAt).toBeInstanceOf(FakeTimestamp)
        expect(task).toMatchObject({ title: 'Clean the bathroom', driftCount: 0, archived: false })
    })

    it('always uses the userId argument, even if taskData has a different one', async () => {
        const task = await taskService.createTask('user-1', { ...newTask, userId: 'someone-else' })
        expect(getStored('tasks', task.id)!.userId).toBe('user-1')
    })
})

describe('createAndScheduleTask', () => {
    it('creates a task and a pending schedule linked to it', async () => {
        const { task, schedule } = await taskService.createAndScheduleTask('user-1', newTask, '2026-11-12', '09:00', '09:30')

        expect(getStored('tasks', task.id)!.hasActiveSchedule).toBe(true)
        expect(getStored('taskSchedules', schedule.id)).toMatchObject({
            taskId: task.id,
            userId: 'user-1',
            scheduledDate: '2026-11-12',
            scheduledStartTime: '09:00',
            scheduledEndTime: '09:30',
            status: 'pending',
            isUserScheduled: true,
            isDrifted: false,
        })
    })

    it('leaves out start and end times when none are given', async () => {
        const { schedule } = await taskService.createAndScheduleTask('user-1', newTask, '2026-11-12')
        const stored = getStored('taskSchedules', schedule.id)!
        expect(stored).not.toHaveProperty('scheduledStartTime')
        expect(stored).not.toHaveProperty('scheduledEndTime')
    })
})

describe('getUserTasks', () => {
    it('returns the user\'s non-archived tasks, newest first, with Dates', async () => {
        seedTask('older', { createdAt: ts('2026-11-01T00:00:00Z') })
        seedTask('newer', { createdAt: ts('2026-11-05T00:00:00Z') })
        seedTask('archived', { archived: true })
        seedTask('theirs', { userId: 'user-2' })

        const tasks = await taskService.getUserTasks('user-1')

        expect(tasks.map(t => t.id)).toEqual(['newer', 'older'])
        expect(tasks[0].createdAt).toEqual(new Date('2026-11-05T00:00:00Z'))
    })
})

describe('getTaskById', () => {
    it('returns null for a task that does not exist', async () => {
        expect(await taskService.getTaskById('missing')).toBeNull()
    })

    it('returns the task with completedAt converted when it is set', async () => {
        seedTask('task-1', { completedAt: ts('2026-11-10T12:00:00Z') })
        const task = await taskService.getTaskById('task-1')
        expect(task?.id).toBe('task-1')
        expect(task?.completedAt).toEqual(new Date('2026-11-10T12:00:00Z'))
    })
})

describe('updateTask', () => {
    it('updates the fields given', async () => {
        seedTask('task-1')
        await taskService.updateTask('user-1', 'task-1', { title: 'New title' })
        expect(getStored('tasks', 'task-1')!.title).toBe('New title')
    })

    it('refuses to update another user\'s task', async () => {
        seedTask('task-1', { userId: 'user-2' })
        await expect(taskService.updateTask('user-1', 'task-1', { title: 'x' })).rejects.toThrow('Unauthorized')
        expect(getStored('tasks', 'task-1')!.title).toBe('Task task-1')
    })

    it('throws for a task that does not exist', async () => {
        await expect(taskService.updateTask('user-1', 'missing', {})).rejects.toThrow('Task not found')
    })
})

describe('completeTask', () => {
    it('marks the schedule completed and sets completedAt on the task', async () => {
        seedProfile('user-1')
        seedTask('task-1')
        seedSchedule('s1', { taskId: 'task-1' })

        const task = await taskService.completeTask('user-1', 's1')

        expect(getStored('taskSchedules', 's1')!.status).toBe('completed')
        expect(getStored('tasks', 'task-1')!.completedAt).toBeInstanceOf(FakeTimestamp)
        expect(task.id).toBe('task-1')
        expect(task.completedAt).toBeInstanceOf(Date)
    })

    it('refuses to complete another user\'s schedule', async () => {
        seedSchedule('s1', { userId: 'user-2' })
        await expect(taskService.completeTask('user-1', 's1')).rejects.toThrow('Unauthorized')
        expect(getStored('taskSchedules', 's1')!.status).toBe('pending')
    })

    it('throws for a schedule that does not exist', async () => {
        await expect(taskService.completeTask('user-1', 'missing')).rejects.toThrow('Task schedule not found')
    })

    it('clears hasActiveSchedule so the task no longer counts as scheduled', async () => {
        seedProfile('user-1')
        seedTask('task-1', { hasActiveSchedule: true })
        seedSchedule('s1', { taskId: 'task-1' })

        const task = await taskService.completeTask('user-1', 's1')

        expect(getStored('tasks', 'task-1')!.hasActiveSchedule).toBe(false)
        expect(task.hasActiveSchedule).toBe(false)
    })

    it('updates the user\'s streak', async () => {
        seedProfile('user-1', { currentStreak: 4, longestStreak: 4, lastStreakDate: '2026-11-10' })
        seedTask('task-1')
        seedSchedule('s1', { taskId: 'task-1' })

        await taskService.completeTask('user-1', 's1')

        expect(getStored('userProfiles', 'user-1')).toMatchObject({
            currentStreak: 5,
            longestStreak: 5,
            lastStreakDate: '2026-11-11',
        })
    })
})

describe('archiveTask', () => {
    it('sets archived to true', async () => {
        seedTask('task-1')
        await taskService.archiveTask('user-1', 'task-1')
        expect(getStored('tasks', 'task-1')!.archived).toBe(true)
    })

    it('refuses to archive another user\'s task', async () => {
        seedTask('task-1', { userId: 'user-2' })
        await expect(taskService.archiveTask('user-1', 'task-1')).rejects.toThrow('Unauthorized')
    })
})

describe('getTodayTasks', () => {
    it('returns an empty list when nothing is scheduled today', async () => {
        seedProfile('user-1')
        expect(await taskService.getTodayTasks('user-1')).toEqual([])
    })

    it('merges today\'s schedules with their tasks and leaves out archived tasks', async () => {
        seedProfile('user-1')
        seedTask('a')
        seedTask('b', { archived: true })
        seedTask('c')
        seedSchedule('sa', { taskId: 'a', scheduledDate: '2026-11-11', scheduledStartTime: '14:00', isDrifted: true })
        seedSchedule('sb', { taskId: 'b', scheduledDate: '2026-11-11' })
        seedSchedule('sc', { taskId: 'c', scheduledDate: '2026-11-12' })

        const today = await taskService.getTodayTasks('user-1')

        expect(today).toHaveLength(1)
        expect(today[0]).toMatchObject({
            id: 'a',
            scheduledDate: '2026-11-11',
            scheduledStartTime: '14:00',
            isDrifted: true,
            status: 'pending',
        })
    })

    it('uses the user\'s timezone to decide what "today" is', async () => {
        // 03:00 UTC on the 12th is still the 11th in New York
        vi.setSystemTime(new Date('2026-11-12T03:00:00Z'))
        seedProfile('user-1')
        seedTask('a')
        seedSchedule('sa', { taskId: 'a', scheduledDate: '2026-11-11' })

        expect(await taskService.getTodayTasks('user-1')).toHaveLength(1)
    })

    // KNOWN BUG: the schedule query orders by scheduledStartTime, and Firestore
    // leaves out documents that don't have the field being ordered by. Tasks with
    // no time (including every auto-drifted task) never show on Today.
    it('includes tasks scheduled for today without a start time', async () => {
        seedProfile('user-1')
        seedTask('a')
        seedSchedule('sa', { taskId: 'a', scheduledDate: '2026-11-11', scheduledStartTime: undefined })

        expect(await taskService.getTodayTasks('user-1')).toHaveLength(1)
    })

    it('leaves out a task that was moved off today', async () => {
        seedProfile('user-1')
        seedTask('moved')
        seedTask('staying')
        seedSchedule('s-moved', { taskId: 'moved', status: 'drifted' })
        seedSchedule('s-staying', { taskId: 'staying' })

        const today = await taskService.getTodayTasks('user-1')

        expect(today.map(t => t.id)).toEqual(['staying'])
    })

    it('returns an empty list when every task today was moved off it', async () => {
        seedProfile('user-1')
        seedTask('moved')
        seedSchedule('s-moved', { taskId: 'moved', status: 'drifted' })

        expect(await taskService.getTodayTasks('user-1')).toEqual([])
    })

    it('lists timed tasks earliest first, then untimed ones', async () => {
        seedProfile('user-1')
        for (const id of ['late', 'untimed', 'early']) seedTask(id)
        seedSchedule('s-late', { taskId: 'late', scheduledStartTime: '15:00' })
        seedSchedule('s-untimed', { taskId: 'untimed', scheduledStartTime: undefined })
        seedSchedule('s-early', { taskId: 'early', scheduledStartTime: '08:30' })

        const today = await taskService.getTodayTasks('user-1')

        expect(today.map(t => t.id)).toEqual(['early', 'late', 'untimed'])
    })

    it('handles more than 30 tasks in one day by querying them in batches', async () => {
        seedProfile('user-1')
        for (let i = 0; i < 35; i++) {
            seedTask(`t${i}`)
            seedSchedule(`s${i}`, { taskId: `t${i}` })
        }
        expect(await taskService.getTodayTasks('user-1')).toHaveLength(35)
    })
})

describe('getUnscheduledTasks', () => {
    it('returns only active tasks without a schedule', async () => {
        seedTask('scheduled', { hasActiveSchedule: true })
        seedTask('loose', { hasActiveSchedule: false })
        seedTask('archived-loose', { hasActiveSchedule: false, archived: true })

        const tasks = await taskService.getUnscheduledTasks('user-1')

        expect(tasks.map(t => t.id)).toEqual(['loose'])
    })
})

describe('getTasksForDate', () => {
    beforeEach(() => {
        seedTask('pending')
        seedTask('done')
        seedTask('moved')
        seedSchedule('s1', { taskId: 'pending', scheduledDate: '2026-11-13' })
        seedSchedule('s2', { taskId: 'done', scheduledDate: '2026-11-13', status: 'completed' })
        seedSchedule('s3', { taskId: 'moved', scheduledDate: '2026-11-13', status: 'drifted' })
    })

    it('returns only pending tasks by default', async () => {
        const tasks = await taskService.getTasksForDate('user-1', '2026-11-13')
        expect(tasks.map(t => t.id)).toEqual(['pending'])
    })

    it('counts tasks without a start time', async () => {
        seedTask('untimed')
        seedSchedule('s4', { taskId: 'untimed', scheduledDate: '2026-11-13', scheduledStartTime: undefined })
        const tasks = await taskService.getTasksForDate('user-1', '2026-11-13')
        expect(tasks.map(t => t.id).sort()).toEqual(['pending', 'untimed'])
    })

    it('includes completed tasks when asked, but never drifted ones', async () => {
        const tasks = await taskService.getTasksForDate('user-1', '2026-11-13', { includeCompleted: true })
        expect(tasks.map(t => t.id).sort()).toEqual(['done', 'pending'])
    })

    it('returns an empty list for a day with nothing on it', async () => {
        expect(await taskService.getTasksForDate('user-1', '2026-11-20')).toEqual([])
    })
})

