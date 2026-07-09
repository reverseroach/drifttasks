// lib/tasks.ts

import { db } from './firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  getDoc, 
  updateDoc, 
  query,
  where,
  orderBy,
  serverTimestamp,
  documentId,
  writeBatch
} from 'firebase/firestore';

import type { Task } from '@/types';
import type { TaskSchedule } from '@/types';
import type { TodayTask } from '@/types';

const tasksCollection = collection(db, 'tasks');
const taskSchedulesCollection = collection(db, 'taskSchedules');

export const taskService = {
    // ==================== CORE CRUD ==================== //

    // CREATE
    async createTask(
        userId: string, 
        taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'driftCount' | 'archived'>
    ): Promise<Task> {
        try {
            const docRef = await addDoc(tasksCollection, {
                ...taskData,
                userId,
                driftCount: 0,
                archived: false,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            return {
                id: docRef.id,
                ...taskData,
                userId,
                driftCount: 0,
                archived: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as Task;
        } catch(error) {
            console.error("Error creating task:", error);
            throw error;
        }
    },

    // user created and scheduled task in one go
    async createAndScheduleTask(
        userId: string, 
        taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'driftCount' | 'archived'>,
        scheduledDate: string,
        scheduledStartTime?: string,
        scheduledEndTime?: string
    ): Promise<{ task: Task; schedule: TaskSchedule }> {
        try {
            const batch = writeBatch(db);

            // Create the task
            const taskRef = doc(tasksCollection);
            batch.set(taskRef, {
                ...taskData,
                userId,
                driftCount: 0,
                archived: false,
                hasActiveSchedule: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            // Create the schedule
            const scheduleRef = doc(taskSchedulesCollection);
            batch.set(scheduleRef, {
                userId,
                taskId: taskRef.id,
                scheduledDate: scheduledDate,
                ...(scheduledStartTime && { scheduledStartTime }),
                ...(scheduledEndTime && { scheduledEndTime }),
                status: 'pending',
                isUserScheduled: true,
                isDrifted: false,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            })

            await batch.commit();

            return {
                task: {
                    id: taskRef.id,
                    ...taskData,
                    userId,
                    driftCount: 0,
                    archived: false,
                    hasActiveSchedule: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                } as Task,
                schedule: {
                    id: scheduleRef.id,
                    userId,
                    taskId: taskRef.id,
                    scheduledDate: scheduledDate,
                    scheduledStartTime: scheduledStartTime,
                    scheduledEndTime: scheduledEndTime,
                    status: 'pending',
                    isUserScheduled: true,
                    isDrifted: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                } as TaskSchedule
            };
        } catch(error) {
            console.error("Error creating and scheduling task:", error);
            throw error;
        }
    },

    // READ
    async getUserTasks(userId: string): Promise<Task[]> {
        try {
            // Get all tasks that relate to the user and are not archived
            const q = query(
                tasksCollection, 
                where("userId", "==", userId),
                where("archived", "==", false),
                orderBy("createdAt", "desc")
            );

            const querySnapshot = await getDocs(q);

            const tasks: Task[] = querySnapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt.toDate() ?? null,
                    updatedAt: data.updatedAt.toDate() ?? null,
                    completedAt: data.completedAt?.toDate() ?? null,
                } as Task;
            });

            return tasks;

        } catch(error) {
            console.error("Error fetching user tasks:", error);
            throw error;
        }
    },

    async getTaskById(taskId: string): Promise<Task | null> {
        try {
            const docRef = doc(db, 'tasks', taskId);
            const docSnap = await getDoc(docRef);
            
            if(docSnap.exists()) {
                const data = docSnap.data();

                return {
                    id: docSnap.id,
                    ...data,
                    createdAt: data.createdAt.toDate() ?? null,
                    updatedAt: data.updatedAt.toDate() ?? null,
                    completedAt: data.completedAt?.toDate() ?? null,
                } as Task;
            } else {
                console.log("Document does not exist")
                return null;
            }
        } catch(error) {
            console.error("Error fetching task by ID:", error);
            throw error;
        }
    },

    // UPDATE
    async updateTask(userId: string, taskId: string, updates: Partial<Task>): Promise<void> {
        try {
            const docRef = doc(db, 'tasks', taskId);
            const docSnap = await getDoc(docRef);

            if(!docSnap.exists()) {
                throw new Error("Task not found");
            }

            if(docSnap.data().userId !== userId) {
                throw new Error("Unauthorized to update this task");
            } 

            await updateDoc(docRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });


        } catch(error) {
            console.error("Error updating task:", error);
            throw error;
        }
    },

    async completeTask(userId: string, scheduleId: string): Promise<Task> {
        try {
            // update task schedule
            const scheduleRef = doc(db, 'taskSchedules', scheduleId);
            const scheduleSnap = await getDoc(scheduleRef);
            
            if(!scheduleSnap.exists()) {
                throw new Error("Task schedule not found");
            }

            if (scheduleSnap.data().userId !== userId) {
                throw new Error("Unauthorized to update this task schedule");
            }

            await updateDoc(scheduleRef, {
                status: 'completed',
                updatedAt: serverTimestamp()
            })

            const taskId = scheduleSnap.data().taskId;

            // update task
            const taskRef = doc(db, 'tasks', taskId);
            const taskSnap = await getDoc(taskRef);

            if(!taskSnap.exists()) {
                throw new Error("Task not found");
            }

            if(taskSnap.data().userId !== userId) {
                throw new Error("Unauthorized to update this task");
            }

            await updateDoc(taskRef, {
                completedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            })

            // update streak tracking
            // TODO: will add later when function exists in streak service

            // return the updated task
            const updatedTaskData = taskSnap.data();
            const updatedTask: Task = {
                id: taskSnap.id,
                ...updatedTaskData,
                completedAt: new Date(), // approximate for immediate return
                updatedAt: new Date(), // approximate for immediate return
            } as Task;

            return updatedTask;
        } catch(error) {
            console.error("Error completing task:", error);
            throw error
        }
    },

    // DELETE / ARCHIVE
    async archiveTask(userId: string, taskId: string): Promise<void> {
        try {
            const docRef = doc(db, 'tasks', taskId);
            const docSnap = await getDoc(docRef);

            if(!docSnap.exists()) {
                throw new Error("Task not found")
            }

            if(docSnap.data().userId !== userId) {
                throw new Error("Unauthorized to archive this task");
            }

            await updateDoc(docRef, {
                archived: true,
                updatedAt: serverTimestamp()
            })

        } catch(error) {
            console.error("Error archiving task:", error);
            throw error;
        }
    },
    
    // ==================== SCHEDULING ======================= //

    /**
     * Gets all tasks that should appear on the user's Today view.
     * Includes scheduled tasks + auto-drifted tasks.
     */
    async getTodayTasks(userId: string): Promise<TodayTask[]> {
        const today: string = new Date().toISOString().slice(0, 10);   // YYYY-MM-DD format
        
        try {
            const scheduleQuery = query(
                taskSchedulesCollection, 
                where("userId", "==", userId),
                where("scheduledDate", "==", today),
                orderBy("scheduledStartTime", "asc")
            );

            const scheduleSnapshot = await getDocs(scheduleQuery);

            // If there are no scheduled tasks for today, we can return early with an empty array
            if (scheduleSnapshot.empty) {
                return [];
            }

            // Create a lookup map for the schedule data so we can easily merge it with the task data after fetching
            const scheduleLookup = new Map<string, TaskSchedule>();
            const taskIds: string[] = [];

            scheduleSnapshot.docs.forEach(doc => {
                const data = doc.data();

                // add to list of Ids
                taskIds.push(data.taskId);

                // add to lookup map
                // the key is set to taskId vs scheduleId so we can easily merge with the task data later
                const cleanScheduleData: TaskSchedule = {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate() ?? null,
                    updatedAt: data.updatedAt?.toDate() ?? null,
                } as TaskSchedule;
                    
                scheduleLookup.set(data.taskId, cleanScheduleData);

            });

            // Note: Firestore has a limit of 30 for 'in' queries, but there should always be less than 30 tasks scheduled 
            // for a single day. If we wanted to future-proof this, we could batch the 'in' queries in groups of 30.
            const taskQuery = query(
                tasksCollection, 
                where(documentId(), "in", taskIds),
                where("archived", "==", false),
            );

            const taskSnapshot = await getDocs(taskQuery);

            const todayTasks: TodayTask[] = taskSnapshot.docs.map((doc) => {
                const taskData = doc.data();
                const scheduleData = scheduleLookup.get(doc.id);
                return {
                    id: doc.id,
                    ...taskData,
                    createdAt: taskData.createdAt?.toDate() ?? null,
                    updatedAt: taskData.updatedAt?.toDate() ?? null,
                    completedAt: taskData.completedAt?.toDate() ?? null,

                    scheduledDate: scheduleData?.scheduledDate,
                    scheduledStartTime: scheduleData?.scheduledStartTime,
                    scheduledEndTime: scheduleData?.scheduledEndTime,
                    isDrifted: scheduleData?.isDrifted ?? false,
                    status: scheduleData?.status,
                } as TodayTask;
            });

            return todayTasks;
        } catch(error) {
            console.error("Error fetching today's tasks:", error);
            throw error;
        }
    },

    async getUnscheduledTasks(userId: string):Promise<Task[]> {
        try {
            const q = query(
                tasksCollection,
                where("userId", "==", userId),
                where("archived", "==", false),
                where("hasActiveSchedule", "==", false),
                orderBy("createdAt", "desc")
            )

            const querySnapshot = await getDocs(q);

            const tasks: Task[] = querySnapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate() ?? null,
                    updatedAt: data.updatedAt?.toDate() ?? null,
                    completedAt: data.completedAt?.toDate() ?? null,
                } as Task;
            })

            return tasks;

        } catch(error) {
            console.error("Error fetching unscheduled tasks:", error);
            throw error;
        }
    },

    // ==================== UTILITY / HELPER FUNCTIONS ==================== //

    // Fetches tasks for a specific date, with option to include completed tasks (for Weekly Review)
    async getTasksForDate(
        userId: string, 
        date: string, 
        options: { includeCompleted?: boolean } = {}
    ):Promise<Task[]> {
        const includeCompleted = options.includeCompleted ?? false;
        
        try {
            const statusFilter = includeCompleted 
                ? where("status", "in", ["pending", "completed"])
                : where("status", "==", "pending");

            const scheduleQuery = query(
                taskSchedulesCollection,
                where("userId", "==", userId),
                where("scheduledDate", "==", date),
                statusFilter,
                orderBy("scheduledStartTime", "asc")
            );
            
            const scheduleSnapshot = await getDocs(scheduleQuery);
            
            // If there are no scheduled tasks for the date, we can return early with an empty array
            if (scheduleSnapshot.empty) {
                return [];
            }

            // Process and return the tasks
            const taskIds = scheduleSnapshot.docs.map(doc => doc.data().taskId);

            const taskQuery = query(
                tasksCollection,
                where(documentId(), "in", taskIds),
                where("archived", "==", false)
            )
            const taskSnapshot = await getDocs(taskQuery);

            const tasks: Task[] = taskSnapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate() ?? null,
                    updatedAt: data.updatedAt?.toDate() ?? null,
                    completedAt: data.completedAt?.toDate() ?? null,
                } as Task;
            });

            return tasks;

        }   catch(error) {
            console.error("Error fetching tasks for date:", error);
            throw error;
        }
    }

    // async getUpcomingTasks(...)
};