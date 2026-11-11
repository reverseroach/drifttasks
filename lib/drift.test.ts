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

import { driftMissedTasks, manuallyDriftTask, getDriftHistory } from './drift'
import { resetStore, seed, getStored, listStored, ts } from '../test/fakeFirestore'
import { seedProfile, seedTask, seedSchedule } from '../test/builders'

beforeEach(() => {
    resetStore()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T15:00:00Z')) // Wed 10:00 in New York
    vi.spyOn(Math, 'random').mockReturnValue(0) // always pick driftDaysMin
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

const pendingSchedulesFor = (taskId: string) =>
    listStored('taskSchedules').filter(s => s.taskId === taskId && s.status === 'pending')

describe('driftMissedTasks', () => {
    it('does nothing when there are no missed tasks', async () => {
        seedProfile('user-1')
        seedTask('task-1')
        seedSchedule('today', { taskId: 'task-1', scheduledDate: '2026-11-11' })

        await driftMissedTasks('user-1')

        expect(getStored('taskSchedules', 'today')!.status).toBe('pending')
        expect(listStored('driftHistory')).toHaveLength(0)
    })

    it('moves a missed task forward by driftDaysMin when Math.random() is 0', async () => {
        seedProfile('user-1', { driftDaysMin: 2, driftDaysMax: 5 })
        seedTask('task-1')
        seedSchedule('old', { taskId: 'task-1', scheduledDate: '2026-11-09' })

        await driftMissedTasks('user-1')

        expect(getStored('taskSchedules', 'old')!.status).toBe('drifted')
        const [moved] = pendingSchedulesFor('task-1')
        expect(moved).toMatchObject({
            userId: 'user-1',
            scheduledDate: '2026-11-13',
            isDrifted: true,
            isUserScheduled: false,
        })
        expect(getStored('tasks', 'task-1')!.driftCount).toBe(1)
    })

    it('moves a missed task by up to driftDaysMax when Math.random() is close to 1', async () => {
        vi.mocked(Math.random).mockReturnValue(0.999)
        seedProfile('user-1', { driftDaysMin: 2, driftDaysMax: 5 })
        seedTask('task-1')
        seedSchedule('old', { taskId: 'task-1', scheduledDate: '2026-11-09' })

        await driftMissedTasks('user-1')

        expect(pendingSchedulesFor('task-1')[0].scheduledDate).toBe('2026-11-16')
    })

    it('records a drift history entry that points at the new schedule', async () => {
        seedProfile('user-1')
        seedTask('task-1')
        seedSchedule('old', { taskId: 'task-1', scheduledDate: '2026-11-09' })

        await driftMissedTasks('user-1')

        const [entry] = listStored('driftHistory')
        expect(entry).toMatchObject({
            userId: 'user-1',
            taskId: 'task-1',
            fromDate: '2026-11-09',
            toDate: '2026-11-13',
            reason: 'missed',
            newTaskScheduleId: pendingSchedulesFor('task-1')[0].id,
        })
    })

    it('skips past a day that is already at the daily task limit', async () => {
        seedProfile('user-1', { dailyTaskLimit: 2, driftDaysMin: 2, driftDaysMax: 2 })
        seedTask('task-1')
        seedSchedule('old', { taskId: 'task-1', scheduledDate: '2026-11-10' })
        // the 13th already has two pending tasks
        seedTask('busy-a')
        seedTask('busy-b')
        seedSchedule('a', { taskId: 'busy-a', scheduledDate: '2026-11-13' })
        seedSchedule('b', { taskId: 'busy-b', scheduledDate: '2026-11-13' })

        await driftMissedTasks('user-1')

        expect(pendingSchedulesFor('task-1')[0].scheduledDate).toBe('2026-11-14')
    })

    it('does not drift recurring tasks', async () => {
        seedProfile('user-1')
        seedTask('chore', { isRecurring: true })
        seedSchedule('old', { taskId: 'chore', scheduledDate: '2026-11-09' })

        await driftMissedTasks('user-1')

        expect(getStored('taskSchedules', 'old')!.status).toBe('pending')
        expect(getStored('tasks', 'chore')!.driftCount).toBe(0)
    })

    it('ignores completed schedules and other users\' schedules', async () => {
        seedProfile('user-1')
        seedTask('done')
        seedTask('theirs', { userId: 'user-2' })
        seedSchedule('done-old', { taskId: 'done', scheduledDate: '2026-11-09', status: 'completed' })
        seedSchedule('theirs-old', { userId: 'user-2', taskId: 'theirs', scheduledDate: '2026-11-09' })

        await driftMissedTasks('user-1')

        expect(listStored('driftHistory')).toHaveLength(0)
    })

    it('throws when there are missed tasks but no profile', async () => {
        seedTask('task-1')
        seedSchedule('old', { taskId: 'task-1', scheduledDate: '2026-11-09' })
        await expect(driftMissedTasks('user-1')).rejects.toThrow('User profile not found')
    })

    it('gives up after 30 full days instead of looping forever', async () => {
        seedProfile('user-1', { dailyTaskLimit: 0 })
        seedTask('task-1')
        seedSchedule('old', { taskId: 'task-1', scheduledDate: '2026-11-09' })

        await expect(driftMissedTasks('user-1')).rejects.toThrow('after 30 attempts')
    })

    // Drifted schedules have no start time, so this also checks that the capacity
    // check can see untimed tasks drifted earlier in the same run.
    it('spreads several missed tasks out instead of overfilling one day', async () => {
        seedProfile('user-1', { dailyTaskLimit: 1, driftDaysMin: 2, driftDaysMax: 2 })
        for (const id of ['t1', 't2', 't3']) {
            seedTask(id)
            seedSchedule(`old-${id}`, { taskId: id, scheduledDate: '2026-11-10' })
        }

        await driftMissedTasks('user-1')

        const dates = ['t1', 't2', 't3'].map(id => pendingSchedulesFor(id)[0].scheduledDate)
        expect(new Set(dates).size).toBe(3)
    })

    it('leaves missed tasks alone when the user turned auto drift off', async () => {
        seedProfile('user-1', { autoDriftEnabled: false })
        seedTask('task-1')
        seedSchedule('old', { taskId: 'task-1', scheduledDate: '2026-11-09' })

        await driftMissedTasks('user-1')

        expect(getStored('taskSchedules', 'old')!.status).toBe('pending')
        expect(listStored('driftHistory')).toHaveLength(0)
    })

    it('does not drift archived tasks', async () => {
        seedProfile('user-1')
        seedTask('task-1', { archived: true })
        seedSchedule('old', { taskId: 'task-1', scheduledDate: '2026-11-09' })

        await driftMissedTasks('user-1')

        expect(getStored('taskSchedules', 'old')!.status).toBe('pending')
        expect(listStored('driftHistory')).toHaveLength(0)
    })

    it('falls back to a limit of 3 and a drift of 2 to 5 days when the profile has no settings', async () => {
        seedProfile('user-1', { dailyTaskLimit: undefined, driftDaysMin: undefined, driftDaysMax: undefined })
        for (const id of ['a', 'b', 'c']) {
            seedTask(id)
            seedSchedule(`full-${id}`, { taskId: id, scheduledDate: '2026-11-13', scheduledStartTime: undefined })
        }
        seedTask('task-1')
        seedSchedule('old', { taskId: 'task-1', scheduledDate: '2026-11-09' })

        await driftMissedTasks('user-1')

        // 2 days out is 11-13, which already has 3 tasks, so it moves on to 11-14
        expect(pendingSchedulesFor('task-1')[0].scheduledDate).toBe('2026-11-14')
    })

    it('handles more than 30 missed tasks by querying them in batches', async () => {
        seedProfile('user-1', { dailyTaskLimit: 40 })
        for (let i = 0; i < 35; i++) {
            seedTask(`t${i}`)
            seedSchedule(`old-${i}`, { taskId: `t${i}`, scheduledDate: '2026-11-09' })
        }

        await driftMissedTasks('user-1')

        expect(listStored('driftHistory')).toHaveLength(35)
    })
})

describe('manuallyDriftTask', () => {
    it('moves the schedule to the chosen date and marks it as user scheduled', async () => {
        seedTask('task-1')
        seedSchedule('s1', { taskId: 'task-1', scheduledDate: '2026-11-11' })

        await manuallyDriftTask('user-1', 's1', '2026-11-20')

        expect(getStored('taskSchedules', 's1')!.status).toBe('drifted')
        expect(pendingSchedulesFor('task-1')[0]).toMatchObject({
            scheduledDate: '2026-11-20',
            isUserScheduled: true,
            isDrifted: false,
        })
        expect(getStored('tasks', 'task-1')!.driftCount).toBe(1)
        expect(listStored('driftHistory')[0]).toMatchObject({ reason: 'user', fromDate: '2026-11-11', toDate: '2026-11-20' })
    })

    it('rejects a schedule that does not exist', async () => {
        await expect(manuallyDriftTask('user-1', 'missing', '2026-11-20')).rejects.toThrow('TaskSchedule not found')
    })

    it('rejects a schedule that belongs to someone else', async () => {
        seedSchedule('s1', { userId: 'user-2' })
        await expect(manuallyDriftTask('user-1', 's1', '2026-11-20')).rejects.toThrow('does not belong to the user')
    })

    it('rejects a schedule that is not pending', async () => {
        seedSchedule('s1', { status: 'completed' })
        await expect(manuallyDriftTask('user-1', 's1', '2026-11-20')).rejects.toThrow('not eligible for drifting')
        expect(listStored('driftHistory')).toHaveLength(0)
    })
})

describe('getDriftHistory', () => {
    it('returns an empty list when the user has no history', async () => {
        expect(await getDriftHistory('user-1')).toEqual([])
    })

    it('returns the user\'s newest entries first, up to the limit, with Dates', async () => {
        seed('driftHistory', 'old', { userId: 'user-1', createdAt: ts('2026-11-01T00:00:00Z') })
        seed('driftHistory', 'mid', { userId: 'user-1', createdAt: ts('2026-11-05T00:00:00Z') })
        seed('driftHistory', 'new', { userId: 'user-1', createdAt: ts('2026-11-10T00:00:00Z') })
        seed('driftHistory', 'theirs', { userId: 'user-2', createdAt: ts('2026-11-11T00:00:00Z') })

        const history = await getDriftHistory('user-1', 2)

        expect(history.map(h => h.id)).toEqual(['new', 'mid'])
        expect(history[0].createdAt).toEqual(new Date('2026-11-10T00:00:00Z'))
    })
})
