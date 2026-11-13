import type { Response } from 'express';
import { TasksService } from './tasks.service';
import { TaskCodeSnapshotService } from './task-code-snapshot.service';
import { SnapshotQualityService } from './snapshot-quality.service';
import { TaskQueueService } from '../queue/task-queue.service';
export declare class TasksController {
    private readonly tasksService;
    private readonly queueService;
    private readonly taskCodeSnapshotService;
    private readonly snapshotQualityService;
    constructor(tasksService: TasksService, queueService: TaskQueueService, taskCodeSnapshotService: TaskCodeSnapshotService, snapshotQualityService: SnapshotQualityService);
    getAllTasks(userId: string, limit?: string, full?: string): {
        success: boolean;
        tasks: any[];
        count: number;
    };
    getTaskSummary(userId: string): {
        success: boolean;
        summary: {
            total: number;
            vue3: number;
            microcode: number;
            completed: number;
            failed: number;
            running: number;
            queued: number;
            screenshot: number;
            figma: number;
            todayGenerated: number;
            successRate: number;
        };
    };
    getRecentTasks(limit: string | undefined, userId: string): {
        success: boolean;
        tasks: any[];
        count: number;
    };
    getTaskStatus(sessionId: string, userId: string): {
        success: boolean;
        error: string;
        task?: undefined;
    } | {
        success: boolean;
        task: {
            sessionId: string;
            componentId: string;
            groupId: string | undefined;
            status: import("./tasks.service").TaskStatus;
            startTime: number;
            endTime: number | undefined;
            duration: number | undefined;
            progressCount: number;
            componentName: string;
            displayName: string | undefined;
            error: string | undefined;
            progress: any;
            result: any;
            fileKey: string;
            nodeId: string;
            figmaCredentialFp: string | undefined;
            figmaCredentialSlotId: string | undefined;
            figmaCredentialSlotName: string | undefined;
            themeNodes: {
                fileKey: string;
                nodeId: string;
                name?: string;
                brightness?: "light" | "dark";
                panelType?: string;
                previewImageUrl?: string;
            }[] | undefined;
            target: string | undefined;
            panelKey: string;
            taskType: string | undefined;
            parentId: string | undefined;
            refineOf: string | undefined;
            refineType: "both" | "layout" | "style" | undefined;
            childIds: string[] | undefined;
            generationTier: "max" | "lite" | undefined;
            sourceType: "screenshot" | "figma" | "html" | undefined;
            extraPrompt: string | undefined;
            requirementDocText: string | undefined;
            userComponentId: string | undefined;
            artifactReady: boolean;
            artifactReadyLevel: false | "partial" | "full";
            missingEntryFiles: string[];
            missingFiles: string[] | undefined;
            artifactIncomplete: boolean;
            degradedScriptParts: string[] | undefined;
            degradedFiles: string[] | undefined;
            gateSkippedFiles: string[] | undefined;
            completionModels: {
                visionModel?: string;
                textModel?: string;
            } | null | undefined;
            configSnapshot: any;
        };
        error?: undefined;
    };
    resolveSessionByComponentId(componentId: string): {
        success: boolean;
        sessionId: null;
        error: string;
    } | {
        success: boolean;
        sessionId: string;
        error?: undefined;
    };
    private resolveSnapshotSessionId;
    getLatestCodeSnapshot(rawId: string, userId: string | undefined): {
        success: boolean;
        candidate: import("./task-code-snapshot.service").TaskCodeSnapshotManifest | null;
        lastGood: import("./task-code-snapshot.service").TaskCodeSnapshotManifest | null;
        partial: import("./task-code-snapshot.service").TaskCodeSnapshotManifest | null;
    };
    getRefineDiff(rawId: string, source: string, userId: string | undefined): {
        success: boolean;
        isRefine: boolean;
        available: boolean;
        sourceSessionId?: undefined;
        refineSessionId?: undefined;
        baselineRevision?: undefined;
        candidateRevision?: undefined;
        baselineCreatedAt?: undefined;
        candidateCreatedAt?: undefined;
        changes?: undefined;
    } | {
        success: boolean;
        isRefine: boolean;
        available: boolean;
        sourceSessionId: string;
        refineSessionId?: undefined;
        baselineRevision?: undefined;
        candidateRevision?: undefined;
        baselineCreatedAt?: undefined;
        candidateCreatedAt?: undefined;
        changes?: undefined;
    } | {
        success: boolean;
        isRefine: boolean;
        available: boolean;
        sourceSessionId: string;
        refineSessionId: string;
        baselineRevision: string;
        candidateRevision: string;
        baselineCreatedAt: string;
        candidateCreatedAt: string;
        changes: import("./task-code-snapshot.service").RefineChange[];
    };
    getCodeSnapshotManifest(rawId: string, revision: string, userId: string | undefined): {
        success: boolean;
        manifest: import("./task-code-snapshot.service").TaskCodeSnapshotManifest;
    };
    getCodeSnapshotFile(rawId: string, revision: string, path: string, preview: string, exists: string, userId: string | undefined, res: Response): Response<any, Record<string, any>> | undefined;
    editCodeSnapshotFile(sessionId: string, revision: string, body: {
        path?: string;
        content?: string;
        source?: string;
    }, userId: string): {
        success: boolean;
        manifest: import("./task-code-snapshot.service").TaskCodeSnapshotManifest;
    };
    validateCodeSnapshot(sessionId: string, revision: string, userId: string): Promise<import("./snapshot-quality.service").SnapshotQualityResult>;
    listCodeSnapshotRevisions(rawId: string, userId: string | undefined): {
        success: boolean;
        revisions: import("./task-code-snapshot.service").TaskCodeSnapshotManifest[];
        current: {
            candidate: string | null;
            lastGood: string | null;
            partial: string | null;
        };
    };
    rollbackCodeSnapshot(sessionId: string, revision: string, userId: string): {
        success: boolean;
        manifest: import("./task-code-snapshot.service").TaskCodeSnapshotManifest;
    };
    private assertSnapshotAccessible;
    getTaskTree(sessionId: string, userId: string): {
        success: boolean;
        error: string;
        tree?: undefined;
    } | {
        success: boolean;
        tree: any;
        error?: undefined;
    };
    getQueueSnapshot(userId: string): {
        success: boolean;
        queue: {
            sessionId: string;
            userId?: string;
            status: import("./tasks.service").TaskStatus;
            position: number;
            waitTime: number;
            componentName?: string;
        }[];
        stats: {
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
            queueReason: "user_full" | "global_full" | "both" | "other";
        };
        userId: string;
    };
    getQueueStats(): {
        success: boolean;
        stats: {
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
            queueReason: "user_full" | "global_full" | "both" | "other";
        };
    };
    getTaskQueueStatus(sessionId: string): {
        success: boolean;
        sessionId: string;
        status: {
            inQueue: boolean;
            position?: number;
            status?: import("./tasks.service").TaskStatus;
            enqueuedAt?: number;
            waitTime?: number;
            nextRetryAt?: number;
            retryCount?: number;
        };
    };
    cancelQueuedTask(sessionId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    startQueuedTask(sessionId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    dispatchQueue(userId: string): Promise<{
        success: boolean;
        dispatched: number;
        remaining: number;
        operator: string;
    }>;
    removeTasksBatch(sessionIds: string[], userId: string): Promise<{
        success: boolean;
        error: string;
    } | {
        requested: number;
        removed: string[];
        failed: Array<{
            sessionId: string;
            reason: string;
        }>;
        success: boolean;
        message: string;
        error?: undefined;
    }>;
    removeTask(sessionId: string, userId: string): Promise<{
        success: boolean;
        error: string;
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        error?: undefined;
    }>;
    cleanupOrphans(userId: string): Promise<{
        orphanComponents: number;
        orphanTasks: number;
        deletedFiles: number;
        success: boolean;
        message: string;
    }>;
    cancelTask(sessionId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    pauseTask(sessionId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    resumeTask(sessionId: string, userId: string): {
        success: boolean;
        message: string;
    };
    removeExpiredTasks(userId: string): {
        success: boolean;
        message: string;
        removed: number;
        remaining: number;
    };
    getRetryMetadata(sessionId: string, userId: string): {
        success: boolean;
        error: string | undefined;
        meta?: undefined;
    } | {
        success: boolean;
        meta: {
            sessionId: string;
            componentId: string;
            groupId: string | undefined;
            fileKey: string;
            nodeId: string;
            componentName: string;
            target: string | undefined;
            panelKey: string;
            taskType: string | undefined;
            parentId: string | undefined;
            outputPath: any;
            lastCompletedStage: any;
            checkpointStatus: string;
            extraPrompt: string | undefined;
            requirementDocText: string | undefined;
            userComponentId: string | undefined;
            originalError: string | undefined;
            originalDuration: number | undefined;
            figmaCredentialFp: string | undefined;
            figmaCredentialSlotId: string | undefined;
            figmaCredentialSlotName: string | undefined;
            error?: undefined;
        };
        error?: undefined;
    };
    retryTask(sessionId: string, body: {
        config?: {
            model?: string;
            endpoint?: string;
            apiKey?: string;
        };
    }, userId: string): Promise<{
        success: boolean;
        resumed: boolean;
        stage: any;
        message: string;
        error?: undefined;
        meta?: undefined;
    } | {
        success: boolean;
        error: any;
        resumed?: undefined;
        stage?: undefined;
        message?: undefined;
        meta?: undefined;
    } | {
        success: boolean;
        resumed: boolean;
        meta: {
            error: string;
            sessionId?: undefined;
            componentId?: undefined;
            groupId?: undefined;
            fileKey?: undefined;
            nodeId?: undefined;
            componentName?: undefined;
            target?: undefined;
            panelKey?: undefined;
            taskType?: undefined;
            parentId?: undefined;
            outputPath?: undefined;
            lastCompletedStage?: undefined;
            checkpointStatus?: undefined;
            extraPrompt?: undefined;
            requirementDocText?: undefined;
            userComponentId?: undefined;
            originalError?: undefined;
            originalDuration?: undefined;
            figmaCredentialFp?: undefined;
            figmaCredentialSlotId?: undefined;
            figmaCredentialSlotName?: undefined;
        } | {
            sessionId: string;
            componentId: string;
            groupId: string | undefined;
            fileKey: string;
            nodeId: string;
            componentName: string;
            target: string | undefined;
            panelKey: string;
            taskType: string | undefined;
            parentId: string | undefined;
            outputPath: any;
            lastCompletedStage: any;
            checkpointStatus: string;
            extraPrompt: string | undefined;
            requirementDocText: string | undefined;
            userComponentId: string | undefined;
            originalError: string | undefined;
            originalDuration: number | undefined;
            figmaCredentialFp: string | undefined;
            figmaCredentialSlotId: string | undefined;
            figmaCredentialSlotName: string | undefined;
            error?: undefined;
        } | null;
        message: string;
        stage?: undefined;
        error?: undefined;
    }>;
    downloadTaskCode(sessionId: string, userId: string, res: Response): Promise<void>;
    recoverTask(sessionId: string, userId: string): Promise<{
        success: boolean;
        message?: string;
        error?: string;
    }>;
    publishToWorkspace(sessionId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    speedPassTask(sessionId: string, userId: string): Promise<{
        success: boolean;
        message: string;
        skippedStages?: undefined;
    } | {
        success: boolean;
        message: string;
        skippedStages: string[];
    }>;
    lockTask(sessionId: string, body: {
        revision?: string;
    }, userId: string): Promise<{
        success: boolean;
        message: string;
        revision?: undefined;
    } | {
        success: boolean;
        message: string;
        revision: string | null;
    }>;
    submitHumanReview(sessionId: string, body: {
        overrideStatus?: 'passed' | 'warned';
        reviewerName?: string;
        comment?: string;
    }, userId: string): {
        success: boolean;
        message: string;
        review: import("./tasks.service").HumanReviewRecord;
    } | {
        success: boolean;
        message: string;
    };
    revokeHumanReview(sessionId: string, body: {
        reviewerName?: string;
    }, userId: string): {
        success: boolean;
        message: string;
    };
    getReviewableTasks(userId: string): {
        success: boolean;
        tasks: (import("./tasks.service").Task & {
            reviewable: boolean;
        })[];
        count: number;
    };
    private _figmaNodeCacheDir;
    private _normNodeId;
    private _listFigmaNodeCache;
    listFigmaNodeCache(fileKey?: string, nodeId?: string): {
        success: boolean;
        entries: Record<string, unknown>[];
        count: number;
    };
    deleteFigmaNodeCache(fileKey?: string, nodeId?: string): {
        success: boolean;
        deleted: string[];
        deletedCount: number;
        failed: {
            name: string;
            error: string;
        }[];
        scope: string;
    };
}
