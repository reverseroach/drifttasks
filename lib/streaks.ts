// lib/streaks.ts

import { db } from './firebase';
import {
    collection,
    doc,
    getDoc,
    updateDoc,
    serverTimestamp,
    runTransaction
} from 'firebase/firestore';
import { formatDateInTimeZone, addDaysToDateString } from './dateUtils';

const userProfilesCollection = collection(db, 'userProfiles');

/**
 * Updates the user's streak after completing a task.
 * Called from completeTask.
 */
export async function updateStreak(userId: string): Promise<void> {
    try {
        await runTransaction(db, async (transaction) => {
        
            const docRef = doc(userProfilesCollection, userId);
            const docSnap = await transaction.get(docRef);

            if (!docSnap.exists()) {
                throw new Error("User profile not found");
            }

            const timezone = docSnap.data()?.timezone;
            const today = formatDateInTimeZone(timezone);
            const yesterday = addDaysToDateString(today, -1);
            const lastStreakDate = docSnap.data()?.lastStreakDate;

            if (lastStreakDate === today) {
                // Already updated today, no need to increment streak
                return;
            } else if (lastStreakDate === yesterday) {
                // If the last streak date is exactly yesterday, increment the current streak
                transaction.update(docRef, {
                    currentStreak: docSnap.data().currentStreak + 1,
                    longestStreak: Math.max(docSnap.data().longestStreak, docSnap.data().currentStreak + 1),
                    lastStreakDate: today, // YYYY-MM-DD
                    lastStreakUpdatedAt: serverTimestamp()
                })
            } else if (lastStreakDate < today || lastStreakDate === undefined) {
                // If the last streak date is before today or undefined, reset current streak to 1
                transaction.update(docRef, {
                    currentStreak: 1,
                    longestStreak: Math.max(docSnap.data().longestStreak, 1),
                    lastStreakDate: today, // YYYY-MM-DD
                    lastStreakUpdatedAt: serverTimestamp()
                });
            }
        })

    }   catch(error) {
        console.error("Error updating streak:", error);
        throw error;
    }
}

/**
 * Resets current streak if the user missed a day.
 * Typically called daily or on app load.
 */
export async function resetStreakIfNeeded(userId: string): Promise<void> {
    try {
        const docRef = doc(userProfilesCollection, userId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            throw new Error("User profile not found");
        }

        const lastStreakDate = docSnap.data().lastStreakDate;
        const timezone = docSnap.data().timezone;

        const todayStr = formatDateInTimeZone(timezone);
        const yesterdayStr = addDaysToDateString(todayStr, -1);

        if (lastStreakDate && lastStreakDate < yesterdayStr) {
            await updateDoc(docRef, {
                currentStreak: 0,
                lastStreakUpdatedAt: serverTimestamp()
            });
        }

    }   catch(error) {
        console.error("Error resetting streak:", error);
        throw error;
    }
}

/**
 * Gets current streak information for a user.
 */
export async function getStreakInfo(userId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
  lastStreakDate?: string;
}> {
    try {
        const docRef = doc(userProfilesCollection, userId);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
            throw new Error("User profile not found");
        }

        const data = docSnap.data();
        return {
            currentStreak: data.currentStreak,
            longestStreak: data.longestStreak,
            lastStreakDate: data.lastStreakDate
        };

    } catch(error) {
        console.error("Error fetching streak info:", error);
        throw error;
    }
}

// =============================================
// Service Object
// =============================================

export const streakService = {
    updateStreak,
    resetStreakIfNeeded,
    getStreakInfo,
};