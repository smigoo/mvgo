import { OnModuleInit } from '@nestjs/common';
import { TasksService, RateLimitReason } from '../tasks/tasks.service';
import { QuotaService } from '../quota/quota.service';
import { TaskQueueService } from '../queue/task-queue.service';
export type BatchStatus = 'pending' | 'running' | 'partially_completed' | 'completed' | 'failed' | 'cancelled' | 'awaiting_recovery';
export type BatchItemStatus = 'pending' | 'queued' | 'running' | 'rate_limited' | 'retry_scheduled' | 'paused' | 'completed' | 'failed' | 'cancelled';
export interface BatchRecord {
    batchId: string;
    userId: string;
    status: BatchStatus;
    totalItems: number;
    completedItems: number;
    failedItems: number;
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
    items: BatchItem[];
}
export interface BatchItem {
    sessionId: string;
    itemId: string;
    status: BatchItemStatus;
    idempotencyKey: string;
    attemptCount: number;
    lastError?: string;
    completedAt?: number;
    nextRetryAt?: number;
    rateLimitReason?: RateLimitReason;
}
export declare class BatchService implements OnModuleInit {
    private readonly tasksService;
    private readonly quotaService?;
    private readonly queueService?;
    private readonly logger;
    private batches;
    private persistFile;
    private persistInFlight;
    private persistAgain;
    constructor(tasksService: TasksService, quotaService?: QuotaService | undefined, queueService?: TaskQueueService | undefined);
    onModuleInit(): void;
    private loadFromDisk;
    private persist;
    private flushPersist;
    private autoRecoverBatches;
    createBatch(userId: string, items: Array<{
        itemId: string;
        payload: any;
        componentType?: string;
        generationTier?: string;
    }>): Promise<{
        batchId: string;
        totalItems: number;
    }>;
    getBatch(batchId: string): Promise<BatchRecord | null>;
    markItemCompleted(batchId: string, sessionId: string): Promise<void>;
    markItemFailed(batchId: string, sessionId: string, error: string): Promise<void>;
    markItemQueued(batchId: string, sessionId: string): Promise<void>;
    markItemRunning(batchId: string, sessionId: string): Promise<void>;
    markItemRateLimited(batchId: string, sessionId: string, reason: RateLimitReason, quotaResetAt?: number): Promise<void>;
    markItemRetryScheduled(batchId: string, sessionId: string, retryAt: number): Promise<void>;
    getUserBatches(userId: string): Promise<BatchRecord[]>;
    getBatchesAwaitingRecovery(): Promise<BatchRecord[]>;
    cancelBatch(batchId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    resumeBatch(batchId: string): Promise<{
        success: boolean;
        message: string;
        resumedItems: number;
    }>;
    getPendingItems(batchId: string): BatchItem[];
    isItemCompleted(batchId: string, sessionId: string): boolean;
    private updateBatchSummaryStatus;
    pauseBatch(batchId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    retryFailedItems(batchId: string, userId: string): Promise<{
        success: boolean;
        message: string;
        retryCount: number;
    }>;
    private generateIdempotencyKey;
}
