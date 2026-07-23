// lib/reviews.ts

import { db } from './firebase';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    query,
    where,
    updateDoc,
    serverTimestamp,
    orderBy,
    documentId,
    limit
} from 'firebase/firestore';
import type { WeeklyReview } from '@/types';
import { 
    addDaysToDateString, 
    formatDateInTimeZone 
} from './dateUtils';

const taskSchedulesCollection = collection(db, 'taskSchedules');
const weeklyReviewsCollection = collection(db, 'weeklyReviews');
const tasksCollection = collection(db, 'tasks');
const userProfilesCollection = collection(db, 'userProfiles');

export async function createWeeklyReview(
    userId: string, 
    reviewData: Omit<WeeklyReview, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<WeeklyReview> {
    try {
        const weeklyReviewRef = await addDoc(weeklyReviewsCollection, {
            ...reviewData,
            userId: userId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        })

        return {
            id: weeklyReviewRef.id,
            ...reviewData,
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as WeeklyReview

    } catch (error) {
        console.error("Error creating weekly review:", error);
        throw error;
    }
}

export async function getWeeklyReview(
    userId: string, 
    weekStarting: string
): Promise<WeeklyReview | null> {
    try {
        const q = query(
            weeklyReviewsCollection,
            where("userId", "==", userId),
            where("weekStarting", "==", weekStarting),
            limit(1)
        )
        const reviewSnapshot = await getDocs(q)

        if (reviewSnapshot.empty) {
            return null
        }

        const weeklyReviews: WeeklyReview[] = reviewSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt.toDate() ?? null,
                updatedAt: data.updatedAt.toDate() ?? null
            } as WeeklyReview
        })

        return weeklyReviews[0]
        
    }   catch (error) {
        console.error("Error fetching weekly review:", error);
        throw error;
    }
}

export async function getReviewHistory(
    userId: string, 
    historyLimit?: number
) : Promise<WeeklyReview[]> {
    // get past reviews ordered by weekStarting desc
    try {
        const q = query(
            weeklyReviewsCollection,
            where("userId", "==", userId),
            orderBy("weekStarting", "desc"),
            limit(historyLimit ? historyLimit : 30)
        )
        const reviewSnapshot = await getDocs(q)

        if (reviewSnapshot.empty) {
            return []
        }

        const reviewHistory: WeeklyReview[] = reviewSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt.toDate() ?? null,
                updatedAt: data.updatedAt.toDate() ?? null,
            } as WeeklyReview
        });

        return reviewHistory
    
    } catch(error) {
        console.error("Error fetching weekly review history:", error);
        throw error;
    }
}

export async function updateWeeklyReview(
    userId: string, 
    weeklyReviewId: string,
    updates: Partial<WeeklyReview>
): Promise<void> {
    try {
        const docRef = doc(db, 'weeklyReviews', weeklyReviewId)
        const docSnap = await getDoc(docRef)

        if (!docSnap.exists()) {
            throw new Error("Weekly review not found")
        }

        if (docSnap.data().userId !== userId) {
            throw new Error("Unauthorized to access this weekly review")
        }

        await updateDoc(docRef, {
            ...updates,
            updatedAt: serverTimestamp(),
        })

    } catch(error) {
        console.error("Error upateing weekly review:", error);
        throw error;
    }
}

export async function markWeeklyReviewViewed(userId: string, weeklyReviewId: string): Promise<void> {
    try {
        const docRef = doc(db, 'weeklyReviews', weeklyReviewId)
        const docSnap = await getDoc(docRef)

        if (!docSnap.exists()) {
            throw new Error("Weekly review not found")
        }

        if (docSnap.data().userId !== userId) {
            throw new Error("Unauthorized to access this weekly review")
        }

        await updateDoc(docRef, {
            reviewedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        })

    } catch (error) {
        console.error("Error marking weekly review viewed:", error);
        throw error;
    }
}

// ==================== UTILITY / HELPER FUNCTIONS ==================== //

export function getCurrentWeekStart(timezone: string, weeklyReviewDay: number): string {
    const today = formatDateInTimeZone(timezone)

    const [year, month, day] = today.split('-').map(Number);
    const anchor = new Date(Date.UTC(year, month - 1, day));
    anchor.setUTCDate(anchor.getUTCDate());
    const todayDay = anchor.getUTCDay()

    const dayDiff = ((todayDay - weeklyReviewDay + 7) % 7) * -1;
    const weekStart = addDaysToDateString(today, dayDiff)

    return weekStart
}

export async function generateWeeklyReviewData(userId: string) {
    try {
        const userProfileDoc = await getDoc(doc(userProfilesCollection, userId));

        if (!userProfileDoc.exists()) {
            throw new Error("User profile not found")
        }

        // create a list of the 7 days in the week
        const timezone = userProfileDoc.data().timezone
        const reviewDay = userProfileDoc.data().weeklyReviewDay
        const weekStart = getCurrentWeekStart(timezone, reviewDay)

        const weekDateStrings = []
        for(let i=0; i<7; i++) {
            weekDateStrings.push(addDaysToDateString(weekStart, i))
        }

        // queries the weeks task schedules (via range query on scheduledDate)
        const q = query(
            taskSchedulesCollection,
            where("userId", "==", userId),
            where("scheduledDate", "in", weekDateStrings),
        )
        const scheduleSnapshot = await getDocs(q)

        if (scheduleSnapshot.empty) {
            return {
                weekStarting: weekStart,
                tasksScheduled: 0,
                tasksDrifted: 0,
                completionRate: 0,
                highPriorityScheduled: 0
            }
        }

        // derives tasksScheduled, tasksDrifted (cross-reference with getDriftHistory or 
        // TaskSchedule.status), completionRate, and grabs taskIds
        const tasksScheduled = scheduleSnapshot.size
        let tasksDrifted: number = 0
        let tasksCompleted: number = 0
        const taskIds: string[] = []
        for (const doc of scheduleSnapshot.docs) {
            taskIds.push(doc.data().taskId)
            if (doc.data().status === "drifted") {
                tasksDrifted++
            }
            if (doc.data().status === "completed") {
                tasksCompleted++
            }
        }
        const completionRate = tasksScheduled > 0 ? tasksCompleted / tasksScheduled : 0

        // queries the tasks for the week to get highPriorityScheduled
        let highPriorityScheduled: number = 0
        for (let i = 0; i < Math.ceil(taskIds.length/30); i++) {
            // batch the taskIds to avoid Firestore's "in" query limit of 30
            const batchTaskIds = taskIds.slice(i*30, (i+1)*30)
            const taskQuery = query(
                tasksCollection,
                where(documentId(), "in", batchTaskIds),
                where("priority", "==", "high")
            )
            const taskSnapshot = await getDocs(taskQuery)
            highPriorityScheduled += taskSnapshot.size
        }

        return {
            weekStarting: weekStart,
            tasksScheduled,
            tasksDrifted,
            completionRate,
            highPriorityScheduled
        }

    } catch (error) {
        console.error("Error generating weekly review data:", error);
        throw error;
    }
}

export async function ensureWeeklyReviewExists(userId: string) {
    try {
        // fetch profile
        const userProfileDoc = await getDoc(doc(userProfilesCollection, userId));

        if (!userProfileDoc.exists()) {
            throw new Error("User profile not found")
        }

        // get starting week
        const timezone = userProfileDoc.data().timezone;
        const reviewDay = userProfileDoc.data().weeklyReviewDay
        const weekStarting = getCurrentWeekStart(timezone, reviewDay)

        // check for existing weekly review
        const weeklyReview = await getWeeklyReview(userId, weekStarting)
        if (weeklyReview == null) {
            // generate weekly review
            const reviewData = await generateWeeklyReviewData(userId)
            await createWeeklyReview(userId, reviewData)
        }
    } catch (error) {
        console.error("Error checking for weekly review:", error);
        throw error;
    }
}