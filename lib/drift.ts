// lib/drift.ts

import { db } from "./firebase";
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    getDoc,
    orderBy,
    limit,
    doc,
    increment,
    serverTimestamp,
    documentId,
    writeBatch
} from "firebase/firestore";

import type { DriftHistory, DriftReason } from "@/types";
import type { TaskSchedule } from '@/types';


import { taskService } from "./tasks";

const driftHistoryCollection = collection(db, "driftHistory");
const taskSchedulesCollection = collection(db, "taskSchedules");
const tasksCollection = collection(db, "tasks");
const userProfilesCollection = collection(db, "userProfiles");

/**
 * Automatically drifts all missed tasks according to the app's rules.
 * This is typically called daily (e.g. via a cron job or on app load).
 */
export async function driftMissedTasks(userId: string): Promise<void> {

    // 1. Find all TaskSchedules for the user that are scheduled before today and still pending
    // 2. For each missed TaskSchedule:
    //    a. Create a new TaskSchedule in 1-5 days, check the tasks on the day to be scheduled to make sure it doesnt
    //       violate the max tasks per day rule. If it does, keep pushing it out by 1 day until it fits.
    //    b. Increment the driftCount on the associated Task
    //    c. Add an entry to the DriftHistory collection with reason = 'missed'

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // get task schedules that are before today and still pending
    const scheduleQuery = query(
        taskSchedulesCollection,
        where("userId", "==", userId),
        where("scheduledDate", "<", today),
        where("status", "==", "pending")
    )
    const scheduleSnapshot = await getDocs(scheduleQuery);

    // if there are no missed tasks, return early
    if(scheduleSnapshot.empty) return;

    const taskIds = scheduleSnapshot.docs.map(doc => doc.data().taskId);

    // get task data that isnt recurring
    const taskQuery = query(
        tasksCollection,
        where("userId", "==", userId),
        where(documentId(), "in", taskIds),
        where("isRecurring", "==", false) // only drift non-recurring tasks, recurring tasks will generate new schedules automatically
    )
    const tasksSnapshot = await getDocs(taskQuery);

    // get user profile to check daily task limit and get min/max drift days
    const userProfileDoc = await getDoc(doc(userProfilesCollection, userId));
    
    if(!userProfileDoc.exists()) {
        throw new Error("User profile not found");
    }

    const taskLimit = userProfileDoc?.data().dailyTaskLimit ?? 5; // default to 5 if not set
    const driftDaysMin = userProfileDoc?.data().driftDaysMin ?? 1;
    const driftDaysMax = userProfileDoc?.data().driftDaysMax ?? 5;

    for(const taskDoc of tasksSnapshot.docs) {

        // generate new date
        const candidateDate = new Date()
        const driftNumber = Math.floor(Math.random() * (driftDaysMax - driftDaysMin + 1))+ driftDaysMin
        candidateDate.setDate(candidateDate.getDate() + driftNumber)
        
        let attempts = 0;
        // Keep pushing out the date until we find a free day
        while (true) {
            const dateKey = candidateDate.toISOString().split('T')[0];
            const existingTasks = await taskService.getTasksForDate(userId, dateKey);
            
            if (existingTasks.length < taskLimit) {
                break; // found a free day
            }

            attempts++;
            if (attempts > 30) {
                throw new Error(`Could not find a free day for task ${taskDoc.id} after 30 attempts`);
            }

            candidateDate.setDate(candidateDate.getDate() + 1); // push out by 1 day
        }

        // get old schedule for the task
        const oldScheduleDoc = scheduleSnapshot.docs.find(s => s.data().taskId === taskDoc.id)
        const oldSchedule = {
            id: oldScheduleDoc?.id,
            ...oldScheduleDoc?.data()
        } as TaskSchedule;

        // create new task schedule for the found date
        await driftSchedule(userId, oldSchedule, taskDoc.id, candidateDate.toISOString().split('T')[0], 'missed');

    }
}

/**
 * Manually drifts a task to a new date (user-initiated).
 */
export async function manuallyDriftTask(
    userId: string, 
    scheduleId: string, 
    newDate: string
): Promise<void> {
    // 1. Validate that the TaskSchedule belongs to the user and is eligible for drifting
    // 2. create a new TaskSchedule with the new date and set isDrifted = true
    // 3. Increment the driftCount on the associated Task
    // 4. Add an entry to the DriftHistory collection with reason = 'user'

    const scheduleRef = doc(db, "taskSchedules", scheduleId);
    const scheduleDoc = await getDoc(scheduleRef);

    if (!scheduleDoc.exists()) {
        throw new Error("TaskSchedule not found");
    }

    if (scheduleDoc.data().userId !== userId) {
        throw new Error("TaskSchedule does not belong to the user");
    }

    if (scheduleDoc.data().status !== "pending") {
        throw new Error("TaskSchedule is not eligible for drifting");
    }

    const oldSchedule = {
        id: scheduleDoc.id,
        ...scheduleDoc.data()
    } as TaskSchedule;

    await driftSchedule(userId, oldSchedule, oldSchedule.taskId, newDate, 'user')
}

/**
 * Gets the drift history for a user (useful for Weekly Review).
 */
export async function getDriftHistory(userId: string, historyLimit = 50): Promise<DriftHistory[]> {
    // Query the DriftHistory collection for entries belonging to the user, ordered by createdAt desc, limited by the provided limit
    // Return an array of DriftHistory objects

    const driftHistoryQuery = query(
        driftHistoryCollection,
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(historyLimit)
    );

    const driftHistorySnapshot = await getDocs(driftHistoryQuery);

    if (driftHistorySnapshot.empty) {
        return [];
    }

    const driftHistory: DriftHistory[] = driftHistorySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate() // convert Firestore Timestamp to JS Date
        } as DriftHistory
    ));

    return driftHistory;
}
    

// ==================== UTILITY / HELPER FUNCTIONS ==================== //
/**
 * Internal helper to update the schedule and increment the driftCount for a task.
 * This is called by driftMissedTasks and manuallyDriftTask.
 */
async function driftSchedule(
    userId: string, 
    oldSchedule: TaskSchedule, 
    taskId: string, 
    newDate: string, 
    reason: DriftReason
): Promise<void> {
    
    const batch = writeBatch(db);

    // update old task schedule to drifted
    batch.update(doc(db, "taskSchedules", oldSchedule.id), {
        status: "drifted",
        updatedAt: serverTimestamp()
    });

    // create new task schedule for the new date
    const newScheduleRef = doc(taskSchedulesCollection);
    batch.set(newScheduleRef, {
        userId: userId,
        taskId: taskId,
        scheduledDate: newDate,
        status: "pending",
        isUserScheduled: reason === 'user'? true : false,
        isDrifted: reason === 'user'? false : true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    // increment the driftCount for the task
    batch.update(doc(db, "tasks", taskId), {
        driftCount: increment(1),
        updatedAt: serverTimestamp()
    })

    // add entry to drift history
    const driftHistoryRef = doc(driftHistoryCollection);
    batch.set(driftHistoryRef, {
        userId: userId,
        taskId: taskId,
        newTaskScheduleId: newScheduleRef.id,
        fromDate: oldSchedule.scheduledDate,
        toDate: newDate,
        reason: reason,
        createdAt: serverTimestamp()
    });
    
    await batch.commit();
}


export const driftService = {
    driftMissedTasks,
    manuallyDriftTask,
    getDriftHistory,
};