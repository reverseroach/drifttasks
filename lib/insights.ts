// lib/insights.ts

import { db } from './firebase';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    where,
    serverTimestamp,
    documentId,
} from 'firebase/firestore';

import { getUserProfile } from './userProfile';
import { categoryService } from './categories';
import { 
    formatDateInTimeZone,
    daysBetweenDateStrings,
    addDaysToDateString
} from './dateUtils';

import type { 
    UserInsights, 
    DayStats, 
    TaskSchedule,
    Priority,
    EnergyRequired,
    Category,
    UserProfile
} from '@/types';

const userInsightsCollection = collection(db, 'userInsights');
const taskSchedulesCollection = collection(db, 'taskSchedules');
const tasksCollection = collection(db, 'tasks');

// Core functions

export async function ensureUserInsightsFresh(userId: string): Promise<void> {
    try {
        // fetch profile
        const profile = await getUserProfile(userId)

        if (profile == null) {
            throw new Error("User profile not found")
        }
        
        // get profile window days setting
        const profileWindowDays = profile.insightWindowDays

        // get today in users timezone
        const today = formatDateInTimeZone(profile.timezone)
        
        // fetch user insight 
        const userInsights = await(getUserInsights(userId))

        if (userInsights !== null) {
            // check if lastUpdated isnt today or if windows days has changed
            const lastUpdated = formatDateInTimeZone(profile.timezone, userInsights.lastUpdated)
            const oldWindowDays = daysBetweenDateStrings(userInsights.windowStart, userInsights.windowEnd)
            if (lastUpdated !== today || oldWindowDays !== profileWindowDays) {
                // generate updated userInsights
                const insightData = await generateInsightData(userId, profile, today)

                // update user insights
                if (insightData != null) {
                    await updateUserInsights(userId, insightData)
                }
                
                return

            } else {
                return
            }

        } else {
            // generate new user insights
            const insightData = await generateInsightData(userId, profile, today)
            
            // create user insights
            if (insightData != null) {
                await createUserInsights(userId, insightData)
            }

            return
        }

    } catch(error) {
        console.error("Error checking user insights:", error)
        throw error
    }
}

export async function createUserInsights(
    userId: string, 
    insightData: Omit<UserInsights, 'userId' | 'lastUpdated'>
): Promise<UserInsights> {
    try {
        const docRef = doc(db, 'userInsights', userId)
        await setDoc(docRef, {
            ...insightData,
            lastUpdated: serverTimestamp(),
        })

        return {
            userId,
            ...insightData,
            lastUpdated: new Date()
        } as UserInsights

    } catch(error) {
        console.error("Error creating user insights:", error)
        throw error
    }
}

export async function getUserInsights(userId: string): Promise<UserInsights | null> {
    try {
        const docRef = doc(db, 'userInsights', userId)
        const docSnap = await getDoc(docRef)

        if (docSnap.exists()) {
            const data = docSnap.data()
            return {
                userId,
                ...data,
                lastUpdated: data.lastUpdated.toDate() ?? null
            } as UserInsights
        } else {
            console.log("User insights does not exist")
            return null
        }

    } catch(error) {
        console.error("Error getting user insights:", error)
        throw error
    }
}

export async function updateUserInsights(
    userId: string, 
    updates: Partial<UserInsights>
): Promise<void> {
    try {
        const docRef = doc(db, 'userInsights', userId)
        const docSnap = await getDoc(docRef)

        if (!docSnap.exists()) {
            throw new Error("User insight not found")
        }

        await updateDoc(docRef, {
            ...updates,
            lastUpdated: serverTimestamp()
        })

    } catch(error) {
        console.error("Error updating user insights:", error)
        throw error
    }
}

// Helper functions

function calculateDayCompletionRates(taskSchedules: TaskSchedule[]): Record<string, DayStats> {
    // initialize the result object
    const dayStats: Record<string, DayStats> = {
        0: { totalScheduled: 0, completed: 0, rate: 0 }, // Sunday
        1: { totalScheduled: 0, completed: 0, rate: 0 }, // Monday
        2: { totalScheduled: 0, completed: 0, rate: 0 }, // Tuesday
        3: { totalScheduled: 0, completed: 0, rate: 0 }, // Wednesday
        4: { totalScheduled: 0, completed: 0, rate: 0 }, // Thursday
        5: { totalScheduled: 0, completed: 0, rate: 0 }, // Friday
        6: { totalScheduled: 0, completed: 0, rate: 0 }  // Saturday
    }

    // loop through the taskSchedules
    for (const schedule of taskSchedules) {
        // get day of week in UTC
        const [year, month, day] = schedule.scheduledDate.split('-').map(Number)
        const date = new Date(Date.UTC(year, month - 1, day))
        const dayOfWeek = date.getUTCDay() // 0 (Sunday) to 6 (Saturday)

        // update dayStats
        dayStats[dayOfWeek].totalScheduled += 1
        if (schedule.status == "completed") {
            dayStats[dayOfWeek].completed += 1
        }
    }

    // loop through dayStats to update rate
    for (const [date, stat] of Object.entries(dayStats)) {
        if (stat.totalScheduled > 0) {
            stat.rate = stat.completed / stat.totalScheduled
        } else {
            stat.rate = 0
        }
    }

    return dayStats
}

function calculateTimeOfDayPerformance(taskSchedules: TaskSchedule[]): { morning: number; afternoon: number; evening: number; lateNight: number } {
    // initialize counters
    const stats = {
        morning: { total: 0, completed: 0 },
        afternoon: { total: 0, completed: 0 },
        evening: { total: 0, completed: 0 },
        lateNight: { total: 0, completed: 0 },
    }

    // loop though schedules and update counters based on scheduleStartTime
    for (const schedule of taskSchedules) {
        if (schedule.scheduledStartTime != undefined) {
            const [hour] = schedule.scheduledStartTime.split(':').map(Number)
            if (hour >= 5 && hour <=11) {
                stats.morning.total += 1
                if (schedule.status == "completed") {
                    stats.morning.completed += 1
                }
            } else if (hour >= 12 && hour <= 16) {
                stats.afternoon.total += 1
                if (schedule.status == "completed") {
                    stats.afternoon.completed += 1
                }
            } else if (hour >= 17 && hour <= 23) {
                stats.evening.total += 1
                if (schedule.status == "completed") {
                    stats.evening.completed += 1
                }
            } else if (hour >= 0 && hour <= 4) {
                stats.lateNight.total += 1
                if (schedule.status == "completed") {
                    stats.lateNight.completed += 1
                }
            }
        }
    }

    // calculate final rates
    return {
        morning: stats.morning.total > 0 ? stats.morning.completed / stats.morning.total : 0,
        afternoon: stats.afternoon.total > 0 ? stats.afternoon.completed / stats.afternoon.total : 0,
        evening: stats.evening.total > 0 ? stats.evening.completed / stats.evening.total : 0,
        lateNight: stats.lateNight.total > 0 ? stats.lateNight.completed / stats.lateNight.total : 0
    }
}

function calculateDriftPerformance(taskSchedules: TaskSchedule[]): { driftRate: number, driftCount: number } {
    // initialize count
    let driftCount = 0

    // loop through schedules and update count
    for (const schedule of taskSchedules) {
        if (schedule.status == "drifted") {
            driftCount += 1
        }
    }

    // calculate driftRate
    return {
        driftRate: taskSchedules.length > 0 ? driftCount / taskSchedules.length : 0,
        driftCount: driftCount
    }
}

function calculateCategoryPerformance(taskSchedules: TaskSchedule[], categoryLookup: Map<string, string> , categories: Category[]): Record<string, DayStats> {
    // initialize the result object
    const dayStats: Record<string, DayStats> = {}
    for (const category of categories) {
        dayStats[category.id] = { totalScheduled: 0, completed: 0, rate: 0 }
    }

    // loop through schedules
    for (const schedule of taskSchedules) {
        // get taskId, use that to add to dayStats with lookup
        const categoryId = categoryLookup.get(schedule.taskId)
        if (categoryId !== undefined) {
            dayStats[categoryId].totalScheduled += 1
            if (schedule.status == "completed") {
                dayStats[categoryId].completed += 1
            }
        }
    }

    // loop through dayStats to calculate rates
    for (const [date, stat] of Object.entries(dayStats)) {
        if (stat.totalScheduled > 0) {
            stat.rate = stat.completed / stat.totalScheduled
        } else {
            stat.rate = 0
        }
    }

    return dayStats
}

function calculatePriorityPerformance(taskSchedules: TaskSchedule[], priorityLookup: Map<string, Priority>): Record<string, DayStats> {
    // initialize the result object
    const dayStats: Record<string, DayStats> = {
        high: { totalScheduled: 0, completed: 0, rate: 0 },
        medium: { totalScheduled: 0, completed: 0, rate: 0 },
        low: { totalScheduled: 0, completed: 0, rate: 0 },
    }

    // loop through schedules to update counters
    for (const schedule of taskSchedules) {
        // use taskId to add to dayStats with lookup
        const priority = priorityLookup.get(schedule.taskId)
        if (priority !== undefined) {
            dayStats[priority].totalScheduled += 1
            if (schedule.status == "completed") {
                dayStats[priority].completed += 1
            }
        }
    }

    // loop through dayStats to calculate rates
    for (const [date, stat] of Object.entries(dayStats)) {
        if (stat.totalScheduled > 0) {
            stat.rate = stat.completed / stat.totalScheduled
        } else {
            stat.rate = 0
        }
    } 

    return dayStats
}

function calculateEnergyPerformance(taskSchedules: TaskSchedule[], energyLookup: Map<string, EnergyRequired>): Record<string, DayStats> {
    // initialize the result object
    const dayStats: Record<string, DayStats> = {
        high: { totalScheduled: 0, completed: 0, rate: 0 },
        medium: { totalScheduled: 0, completed: 0, rate: 0 },
        low: { totalScheduled: 0, completed: 0, rate: 0 },
    }

    // loop through schedules to update counters
    for (const schedule of taskSchedules) {
        // use taskId to add to dayStats with lookup
        const energy = energyLookup.get(schedule.taskId)
        if (energy !== undefined) {
            dayStats[energy].totalScheduled += 1
            if (schedule.status == "completed") {
                dayStats[energy].completed += 1
            }
        }
    }

    // loop through dayStats to calculate rate
    for (const [date, stat] of Object.entries(dayStats)) {
        if (stat.totalScheduled > 0) {
            stat.rate = stat.completed / stat.totalScheduled
        } else {
            stat.rate = 0
        }
    }

    return dayStats
}

async function generateInsightData(userId: string, profile: UserProfile, today: string): Promise<Omit<UserInsights, 'userId' | 'lastUpdated'> | null> {
    // generate window Start and End
    const profileWindowDays = profile.insightWindowDays
    const windowEnd = today
    const windowStart = addDaysToDateString(today, -profileWindowDays)

    const windowDateStrings = []
    for(let i=0; i<profileWindowDays; i++) {
        windowDateStrings.push(addDaysToDateString(windowStart, i))
    }

    // fetch task schedules for the window
    const q = query(
        taskSchedulesCollection,
        where("userId", "==", userId),
        where("scheduledDate", "in", windowDateStrings)
    )
    const scheduleSnapshot = await getDocs(q)

    if (scheduleSnapshot.empty) {
        return null
    }

    const taskSchedules: TaskSchedule[] = scheduleSnapshot.docs.map((doc) => {
        const data = doc.data()
        return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt.toDate() ?? null,
            updatedAt: data.updatedAt.toDate() ?? null
        } as TaskSchedule
    })

    // fetch tasks
    const uniqueTaskIds = [...new Set(taskSchedules.map(schedule => schedule.taskId))]

    // initialize lookups
    const categoryLookup = new Map<string, string>
    const priorityLookup = new Map<string, Priority>
    const energyLookup = new Map<string, EnergyRequired>

    // batch the taskIds to avoid Firestore's "in" query limit of 30
    for (let i = 0; i < Math.ceil(uniqueTaskIds.length/30); i++) {
        const batchTaskIds = uniqueTaskIds.slice(i*30, (i+1)*30)
        const taskQuery = query(
            tasksCollection,
            where(documentId(), "in", batchTaskIds),
        )
        const taskSnapshot = await getDocs(taskQuery)

        // loop through tasks and add to lookups
        for (const task of taskSnapshot.docs) {
            if (task.data().categoryId != undefined) {
                categoryLookup.set(task.id, task.data().categoryId)
            }
            priorityLookup.set(task.id, task.data().priority)
            energyLookup.set(task.id, task.data().energyRequired)
        }
    }

    // get list of user's categories
    const categories = await categoryService.getUserCategories(userId)

    // generate data
    const dayCompletionRates = calculateDayCompletionRates(taskSchedules)
    const timeOfDayPerformance = calculateTimeOfDayPerformance(taskSchedules)
    const driftPerformance = calculateDriftPerformance(taskSchedules)
    const categoryPerformance = calculateCategoryPerformance(taskSchedules, categoryLookup, categories)
    const priorityPerformance = calculatePriorityPerformance(taskSchedules, priorityLookup)
    const energyPerformance = calculateEnergyPerformance(taskSchedules, energyLookup)

    // return user insights
    return {
        windowStart,
        windowEnd,
        dayCompletionRates,
        timeOfDayPerformance,
        driftRate: driftPerformance.driftRate,
        driftCount: driftPerformance.driftCount,
        categoryPerformance,
        priorityPerformance,
        energyPerformance
    } as Omit<UserInsights, 'userId' | 'lastUpdated'>
}

// Service object
export const insightsService = {
  ensureUserInsightsFresh,
  updateUserInsights,
  getUserInsights,
};