import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Task, TaskStatus } from '../tasks/tasks.service';
import { QuotaService } from '../quota/quota.service';
export declare class TaskQueueService implements OnModuleInit, OnModuleDestroy {
    private readonly quotaService;
    private readonly logger;
    private readonly MAX_QUEUE_SIZE;
    readonly MAX_CONCURRENT: number;
    readonly GLOBAL_MAX_CONCURRENT: number;
    private static resolveGlobalMaxConcurrent;
    private readonly RETRY_BACKOFF_SECONDS;
    private waitingQueue;
    private runningTasks;
    private sessionOwners;
    private readonly RUNNING_STALE_TIMEOUT_MS;
    private executeFnRegistry;
    private executeCallback;
    private taskFailedCallback;
    private restoreExecutors;
    private reconcileTimer?;
    private terminalSessions;
    private readonly TERMINAL_SESSIONS_MAX;
    private markTerminal;
    private static resolveMaxConcurrent;
    constructor(quotaService: QuotaService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    onExecute(callback: () => Promise<void>): void;
    registerExecuteFn(sessionId: string, fn: () => Promise<void>): void;
    onTaskFailed(callback: (sessionId: string, error: string) => void): void;
    unregisterExecuteFn(sessionId: string): void;
    registerRestoreExecutor(fn: (task: Task) => Promise<boolean>): void;
    restoreQueuedTask(task: Task): Promise<boolean>;
    getAvailableSlots(userId?: string): number;
    getRunningCount(userId?: string): number;
    private countRunningOf;
    isRunning(sessionId: string): boolean;
    registerRunning(sessionId: string, userId?: string): void;
    private releaseSlotInternal;
    touchRunning(sessionId: string): void;
    markTaskCompleted(sessionId: string): Promise<void>;
    markTaskFailed(sessionId: string): Promise<void>;
    releaseSlot(sessionId: string): Promise<void>;
    tryReRegister(sessionId: string, userId?: string): boolean;
    enqueue(taskData: Pick<Task, 'sessionId' | 'componentId'> & Partial<Task>, reason?: 'concurrency_full' | 'quota_exceeded' | 'retry_scheduled', executeFn?: () => Promise<void>): Promise<{
        success: boolean;
        queuePosition: number;
        message: string;
    }>;
    dequeue(sessionId: string): boolean;
    getQueueStatus(sessionId: string): {
        inQueue: boolean;
        position?: number;
        status?: TaskStatus;
        enqueuedAt?: number;
        waitTime?: number;
        nextRetryAt?: number;
        retryCount?: number;
    };
    getQueueSnapshot(): Array<{
        sessionId: string;
        userId?: string;
        status: TaskStatus;
        position: number;
        waitTime: number;
        componentName?: string;
    }>;
    reconcileWaitingQueue(): Promise<void>;
    private reapStaleRunningTasks;
    startQueuedTask(sessionId: string, userId?: string): Promise<{
        success: boolean;
        message: string;
    }>;
    getQueueStats(userId?: string): {
        totalQueued: number;
        runningCount: number;
        maxConcurrent: number;
        availableSlots: number;
        avgWaitTimeMs: number;
        maxWaitTimeMs: number;
        userRunningCount: number;
        userMaxConcurrent: number;
        globalRunningCount: number;
        globalMaxConcurrent: number;
        queueReason: 'user_full' | 'global_full' | 'both' | 'other';
    };
    private diagnoseQueueReason;
    cancelQueuedTask(sessionId: string, userId: string): {
        success: boolean;
        message: string;
    };
    private scheduleSpecificWaiting;
    scheduleNextWaiting(): Promise<{
        dispatched: number;
        remaining: number;
    }>;
    private calculateQueuePosition;
}
