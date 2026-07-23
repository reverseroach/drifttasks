// types/index.ts

// =============================================
// Basic Type Definitions (Enums)
// =============================================

export type Priority = 'high' | 'medium' | 'low';
export type EnergyRequired = 'high' | 'medium' | 'low';
export type EstimatedTime = 'tiny' | 'small' | 'medium' | 'large';
export type TaskStatus = 'pending' | 'completed' | 'cancelled' | 'drifted';
export type DriftReason = 'missed' | 'auto' | 'user' | 'manual'

// =============================================
// Main Interfaces
// =============================================

export interface Task {
  /** Main brain-dump task */
  id: string;
  userId: string;
  title: string;
  notes?: string;

  priority: Priority;
  energyRequired: EnergyRequired;
  estimatedTime?: EstimatedTime;

  categoryId?: string;

  isRecurring: boolean;
  recurrencePattern?: string;

  driftCount: number;                // How many times this task has been drifted

  // Step-related fields
  isStep?: boolean;                   
  parentTaskId?: string;             // Only populated if isStep = true
  stepOrder?: number;                // Indicates the order of steps within the parent task

  hasActiveSchedule: boolean;        // True if this task is currently scheduled for any date

  googleSyncInfo?: GoogleSyncInfo;

  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  archived: boolean;
}

export interface TaskSchedule {
  /** Links a task to a specific date (core of the Drift system) */  
  id: string;
  taskId: string;
  userId: string;

  scheduledDate: string;         // Format: YYYY-MM-DD
  scheduledStartTime?: string;   // Format: HH:mm
  scheduledEndTime?: string;     // Format: HH:mm

  googleTaskId?: string;
  googleEventId?: string;

  status: TaskStatus;
  isUserScheduled: boolean;     // True if user manually picked the date
  isDrifted: boolean;           // True if this schedule was created by the auto-drift system
  
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  /** User-created task categories (Household, Crafting, Work, etc.) */
  id: string;
  userId: string;

  name: string;
  color: string;                 // Hex color code (e.g. "#3b82f6")
  icon?: string;                 // Optional emoji or icon name

  sortOrder: number;             // Used to control display order

  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  /** User settings and preferences */
  uid: string;

  email: string;
  displayName?: string;
  avatarUrl?: string;

  // Scheduling Preferences
  dailyTaskLimit: number;
  preferredFocusStart: string;        // e.g. "09:00"
  preferredFocusEnd: string;          // e.g. "17:00"
  timezone: string;
  weekendMode: boolean;
  weeklyReviewDay: number;            // 0 = Sunday, 1 = Monday, etc.

  // Drift Settings
  autoDriftEnabled: boolean;
  driftDaysMin: number;
  driftDaysMax: number;

  // Streak Tracking
  currentStreak: number;
  longestStreak: number;
  lastStreakDate?: string;             // YYYY-MM-DD
  lastStreakUpdatedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface DriftHistory {
  /** Record of when a task was drifted (rescheduled) */
  id: string;
  userId: string;
  taskId: string;
  newTaskScheduleId: string;

  fromDate: string;         // YYYY-MM-DD
  toDate: string;           // YYYY-MM-DD
  
  reason: DriftReason;

  createdAt: Date;
}

export interface WeeklyReview {
  /** Record of a user's Sunday (or chosen day) weekly review */
  id: string;
  userId: string;
  
  weekStarting: string;           // YYYY-MM-DD - start of the reviewed week

  reviewedAt?: Date;               // When the user completed the review
  totalTasksReviewed?: number;
  tasksScheduled: number;
  tasksDrifted: number;
  completionRate: number;         // 0.0 to 1.0 (e.g. 0.75 = 75%)
  highPriorityScheduled: number;  // How many high priority tasks were scheduled

  notes?: string;                 // Optional user reflections

  createdAt: Date;
  updatedAt: Date;
}

export interface UserInsights {
  /** Learned user behavior and patterns for smart scheduling */
  userId: string;

  // Completion rates by day of the week
  dayCompletionRates: Record<string, DayStats>;

  // Performance by time of day
  timeOfDayPerformance?: {
    morning: number;         // 0.0 to 1.0
    afternoon: number;
    evening: number;
  };

  // Performance by category
  categoryPerformance?: Record<string, DayStats>;

  lastUpdated: Date;
}

// =============================================
// View-Specific Types
// =============================================

export interface TodayTask extends Task {
  scheduledDate: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;

  isDrifted: boolean;
  status: TaskStatus;
}

// =============================================
// Helper Types
// =============================================

  // Helper interface for reusable stats
  export interface DayStats {
    totalScheduled: number;
    completed: number;
    rate: number;           // 0.0 to 1.0 (e.g. 0.75 = 75%)
  }

  // Helper interface for google services
  export interface GoogleSyncInfo {
  googleTaskId?: string;           
  googleEventId?: string;          
  googleCalendarId?: string;       

  lastSyncedAt?: Date;            
  syncStatus: 'synced' | 'pending' | 'failed' | 'not_synced';
  
  lastSyncError?: string;          
  syncAttempts: number;           

  // Optional: Track what was synced
  syncedFields?: string[];         // e.g. ["title", "dueDate", "completed"]
}