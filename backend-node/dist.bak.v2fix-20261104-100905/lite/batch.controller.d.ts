import { BatchService } from './batch.service';
import { TasksService, RateLimitReason } from '../tasks/tasks.service';
import { ProgressService } from '../progress/progress.service';
import { QuotaService } from '../quota/quota.service';
import { TaskQueueService } from '../queue/task-queue.service';
import { LiteService } from './lite.service';
import { Phase2Service } from '../phase2/phase2.service';
import { LiteComponentType, LiteGenerationTier } from './lite.constants';
interface BatchGenerateDto {
    items: Array<{
        imageBase64?: string;
        figmaUrl?: string;
        previewToken?: string;
        componentName?: string;
        componentType?: LiteComponentType;
        generationTier?: LiteGenerationTier;
        config?: Record<string, any>;
        panelType?: string;
        requirementDoc?: string;
    }>;
    groupId?: string;
}
export declare class BatchController {
    private readonly batchService;
    private readonly liteService;
    private readonly phase2Service;
    private readonly tasksService;
    private readonly progressService;
    private readonly quotaService?;
    private readonly queueService?;
    private readonly logger;
    constructor(batchService: BatchService, liteService: LiteService, phase2Service: Phase2Service, tasksService: TasksService, progressService: ProgressService, quotaService?: QuotaService | undefined, queueService?: TaskQueueService | undefined);
    preCheck(dto: BatchGenerateDto, req: any): Promise<{
        success: boolean;
        requestedCount: number;
        availableNow: number;
        availableLater: number;
        recommendedAction: string;
        message: string;
    } | {
        requestedCount: number;
        availableNow: number;
        availableLater: number;
        hourly: {
            used: number;
            limit: number;
            remaining: number;
            resetAt: number;
            waitMinutes: number;
        };
        daily: {
            used: number;
            limit: number;
            remaining: number;
            resetAt: number;
            waitMinutes: number;
        };
        recommendedAction: "all_now" | "partial" | "all_wait";
        message: string;
        success: boolean;
    }>;
    generate(dto: BatchGenerateDto, req: any): Promise<{
        success: boolean;
        queued: boolean;
        batchId: null;
        requestCount: number;
        availableNow: number;
        availableLater: number;
        recommendedAction: any;
        message: any;
        quotaDetails: {
            hourly: any;
            daily: any;
        };
        quotaResetAt: number | undefined;
        waitMinutes: any;
        totalItems?: undefined;
        immediateItems?: undefined;
        deferredItems?: undefined;
    } | {
        success: boolean;
        batchId: string;
        totalItems: number;
        immediateItems: number;
        deferredItems: number;
        quotaResetAt: number | undefined;
        message: string;
        queued?: undefined;
        requestCount?: undefined;
        availableNow?: undefined;
        availableLater?: undefined;
        recommendedAction?: undefined;
        quotaDetails?: undefined;
        waitMinutes?: undefined;
    }>;
    list(req: any): Promise<{
        success: boolean;
        batches: {
            batchId: string;
            status: import("./batch.service").BatchStatus;
            totalItems: number;
            completedItems: number;
            failedItems: number;
            createdAt: number;
            updatedAt: number;
        }[];
    }>;
    getRecoverable(req: any): Promise<{
        success: boolean;
        batches: {
            batchId: string;
            status: import("./batch.service").BatchStatus;
            totalItems: number;
            completedItems: number;
            failedItems: number;
            createdAt: number;
            updatedAt: number;
        }[];
    }>;
    getBatch(batchId: string, req: any): Promise<{
        success: boolean;
        batch: {
            batchId: string;
            status: import("./batch.service").BatchStatus;
            totalItems: number;
            completedItems: number;
            failedItems: number;
            createdAt: number;
            updatedAt: number;
            completedAt: number | undefined;
            items: {
                sessionId: string;
                itemId: string;
                status: import("./batch.service").BatchItemStatus;
                attemptCount: number;
                lastError: string | undefined;
                completedAt: number | undefined;
                nextRetryAt: number | undefined;
                rateLimitReason: RateLimitReason | undefined;
            }[];
        };
    }>;
    cancelBatch(batchId: string, req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    pauseBatch(batchId: string, req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    retryFailed(batchId: string, req: any): Promise<{
        success: boolean;
        message: string;
        retryCount: number;
    }>;
    resumeBatch(batchId: string, req: any): Promise<{
        success: boolean;
        message: string;
        resumedItems: number;
    }>;
    private acquireGlobalSlot;
    private waitForTaskTerminal;
    private executeBatchGeneration;
}
export {};
