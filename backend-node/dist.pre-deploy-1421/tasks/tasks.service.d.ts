import { Model } from 'mongoose';
import { ComponentDocument } from '../schemas/component.schema';
import { TaskQueueService } from '../queue/task-queue.service';
import { PipelineMetricsService } from './pipeline-metrics.service';
import { ModuleRef } from '@nestjs/core';
interface TaskMetadata {
    configSnapshot?: Record<string, any>;
    componentId?: string;
    groupId?: string;
    componentName?: string;
    nodeId?: string;
    fileKey?: string;
    themeNodes?: Array<{
        fileKey: string;
        nodeId: string;
        name?: string;
        brightness?: 'light' | 'dark';
        panelType?: string;
        previewImageUrl?: string;
    }>;
    target?: string;
    generationTier?: 'lite' | 'max';
    sourceType?: 'screenshot' | 'figma' | 'html';
    extraPrompt?: string;
    requirementDocText?: string;
    figmaCredentialFp?: string;
    figmaCredentialSlotId?: string;
    figmaCredentialSlotName?: string;
    userComponentId?: string;
    outputPath?: string;
    lastCompletedStage?: string;
    checkpointStatus?: string;
    panelKey?: string;
    taskType?: string;
    parentId?: string;
    refineOf?: string;
    refineType?: 'layout' | 'style' | 'both';
    userId?: string;
    queuePriority?: number;
    enqueuedAt?: number;
    quotaResetAt?: number;
    rateLimitReason?: RateLimitReason;
    idempotencyKey?: string;
    attemptCount?: number;
    lastError?: string;
}
export interface HumanReviewRecord {
    reviewedBy: string;
    reviewedByName?: string;
    reviewedAt: number;
    previousStatus: 'failed';
    previousError?: string;
    overrideStatus: 'passed' | 'warned';
    reason?: string;
    action: 'pass' | 'revoke';
    revokedAt?: number;
    revokedBy?: string;
    partialIncomplete?: boolean;
    missingFiles?: string[];
}
export interface Task {
    sessionId: string;
    configSnapshot?: Record<string, any>;
    componentId: string;
    groupId?: string;
    status: TaskStatus;
    startTime: number;
    endTime?: number;
    duration?: number;
    progress: any[];
    progressCount: number;
    result?: any;
    error?: string;
    buffer: any[];
    componentName: string;
    displayName?: string;
    nodeId: string;
    fileKey: string;
    themeNodes?: Array<{
        fileKey: string;
        nodeId: string;
        name?: string;
        brightness?: 'light' | 'dark';
        panelType?: string;
        previewImageUrl?: string;
    }>;
    target?: string;
    generationTier?: 'lite' | 'max';
    sourceType?: 'screenshot' | 'figma' | 'html';
    extraPrompt?: string;
    requirementDocText?: string;
    figmaCredentialFp?: string;
    figmaCredentialSlotId?: string;
    figmaCredentialSlotName?: string;
    userComponentId?: string;
    figmaDimensions?: {
        width: number;
        height: number;
    };
    outputPath?: string;
    lastCompletedStage?: string;
    checkpointStatus?: string;
    panelKey: string;
    taskType?: string;
    parentId?: string;
    refineOf?: string;
    refineType?: 'layout' | 'style' | 'both';
    childIds?: string[];
    userId?: string;
    qualityGate?: 'passed' | 'warned';
    visualFidelityWarning?: {
        score?: number | null;
        verdict?: string;
    } | null;
    assetUpgradedAt?: number;
    assetUpgradeNote?: string;
    visualDegraded?: boolean;
    visualLayoutSource?: string | null;
    visualDegradeReason?: string | null;
    visualQualityWarning?: {
        rate?: number;
        attribution?: string;
        missingTexts?: string[];
        missingTextCount?: number;
    } | null;
    completionModels?: {
        visionModel?: string;
        textModel?: string;
    } | null;
    artifactReady?: boolean;
    artifactReadyLevel?: 'full' | 'partial' | false;
    missingEntryFiles?: string[];
    degradedScriptParts?: string[];
    degradedFiles?: string[];
    gateSkippedFiles?: string[];
    acceptanceDeliveredWithWarnings?: boolean;
    acceptanceWarningCodes?: string[];
    acceptanceMissingTexts?: string[];
    acceptanceWarningText?: string | null;
    acceptanceWarnings?: Array<{
        code: string;
        detail: string;
    }>;
    humanReview?: HumanReviewRecord;
    userApproved?: boolean;
    approval?: SpeedPassRecord | LockSatisfiedRecord;
    queuePriority?: number;
    enqueuedAt?: number;
    quotaResetAt?: number;
    retryCount?: number;
    nextRetryAt?: number;
    rateLimitReason?: RateLimitReason;
    idempotencyKey?: string;
    attemptCount?: number;
    lastError?: string;
    executeFn?: () => Promise<void>;
}
export interface SpeedPassRecord {
    by: 'user';
    type: 'speed-pass';
    skippedStages: string[];
    at: number;
}
export interface LockSatisfiedRecord {
    by: 'user';
    type: 'lock-satisfied';
    revision?: string | null;
    at: number;
}
export type TaskStatus = 'queued' | 'rate_limited' | 'retry_scheduled' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type RateLimitReason = 'USER_HOURLY_QUOTA' | 'USER_DAILY_QUOTA' | 'PLATFORM_QUEUE' | 'PROVIDER_RATE_LIMIT';
export declare class TasksService {
    private readonly componentModel?;
    private readonly moduleRef?;
    private readonly pipelineMetrics?;
    private readonly logger;
    private tasks;
    private abortControllers;
    private persistFile;
    private persistInFlight;
    private persistAgain;
    private pendingDeletedIds;
    private lastKnownDiskCount;
    private readonly artifactCheckCache;
    private static readonly ARTIFACT_CACHE_TTL_MS;
    private queueService;
    constructor(componentModel?: Model<ComponentDocument> | undefined, queueService?: TaskQueueService, moduleRef?: ModuleRef | undefined, pipelineMetrics?: PipelineMetricsService | undefined);
    onModuleInit(): Promise<void>;
    private recoverZombieTasks;
    private loadSync;
    private hasRecoverableArtifacts;
    private _tryRecoverTask;
    recoverTask(sessionId: string, userId: string): {
        success: boolean;
        message?: string;
        error?: string;
    };
    private _findOutputPathFromTemp;
    private _tryRecoverTaskSync;
    private _tryRecoverFromWorkspace;
    private validateVueArtifacts;
    private getTempRoots;
    private findTempComponentDir;
    private findTempComponentDirSync;
    private restoreWorkspaceArtifacts;
    private restoreWorkspaceArtifactsSync;
    private ensureMicrocodeEntry;
    private ensureMicrocodeEntrySync;
    private persist;
    private flushPersistQueue;
    private readDiskTaskList;
    private mergeTaskLists;
    private backupPersistFileBeforeDirectWrite;
    private gc;
    createTask(sessionId: string, metadata?: TaskMetadata, initialStatus?: TaskStatus): Task;
    getTask(sessionId: string): Task | undefined;
    getTaskByComponentId(componentId: string): Task | undefined;
    resolveTaskOutputDir(task: Task): string | null;
    packageTaskCode(sessionId: string, userId: string): Promise<{
        buffer: Buffer;
        filename: string;
    }>;
    publishToWorkspace(sessionId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    private stripParentRefs;
    private stripParentRefsDeep;
    getTaskStatus(sessionId: string, userId?: string): {
        success: boolean;
        error: string;
        task?: undefined;
    } | {
        success: boolean;
        task: {
            sessionId: string;
            componentId: string;
            groupId: string | undefined;
            status: TaskStatus;
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
    getTaskSummary(userId?: string): {
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
    private readonly figmaSourceCache;
    private static readonly FIGMA_SOURCE_CACHE_TTL_MS;
    private resolveFigmaSource;
    private readFigmaSourceFromProgress;
    private readFigmaSourceFromCache;
    private readMetaArtifactIncomplete;
    private getArtifactSnapshot;
    getAllTasks(userId?: string, opts?: {
        limit?: number;
        slim?: boolean;
    }): any[];
    countActiveTasks(userId?: string): number;
    getChildren(parentId: string): Task[];
    getTaskTree(sessionId: string, userId?: string): any;
    addProgress(sessionId: string, progressData: any): void;
    clearBuffer(sessionId: string): any[];
    private finalizeTask;
    private unfinalizeTask;
    completeTask(sessionId: string, result: any): void;
    failTask(sessionId: string, error: any): void;
    private finalizeRecoverFailedTask;
    cancelTask(sessionId: string, userId?: string): Promise<{
        success: boolean;
        message: string;
    }>;
    pauseTask(sessionId: string, userId?: string): Promise<{
        success: boolean;
        message: string;
    }>;
    resumeTask(sessionId: string, userId?: string): {
        success: boolean;
        message: string;
    };
    updateTask(sessionId: string, updates: Partial<Task>): void;
    removeTask(sessionId: string, userId?: string): Promise<boolean>;
    removeTasksBatch(sessionIds: string[], userId?: string): Promise<{
        requested: number;
        removed: string[];
        failed: Array<{
            sessionId: string;
            reason: string;
        }>;
    }>;
    removeTasksByComponentId(componentId: string, userId?: string): Promise<number>;
    private removeTaskInternal;
    private getTaskIdentifiers;
    private getComponentRecordIdentifiers;
    private cleanupTaskArtifacts;
    private cleanupComponentArtifacts;
    private removeGeneratedPaths;
    private isAllowedGeneratedPath;
    private deleteComponentRecordsForTask;
    removeComponentCascade(componentId: string, userId?: string): Promise<{
        deletedTasks: number;
        deletedFiles: number;
    }>;
    cleanupOrphans(userId?: string): Promise<{
        orphanComponents: number;
        orphanTasks: number;
        deletedFiles: number;
    }>;
    removeExpiredTasks(userId?: string): {
        removed: number;
        remaining: number;
    };
    registerAbortController(sessionId: string, controller: AbortController): void;
    removeAbortController(sessionId: string): void;
    speedPassTask(sessionId: string, userId?: string): Promise<{
        success: boolean;
        message: string;
        skippedStages?: undefined;
    } | {
        success: boolean;
        message: string;
        skippedStages: string[];
    }>;
    lockTask(sessionId: string, userId?: string, revision?: string): Promise<{
        success: boolean;
        message: string;
        revision?: undefined;
    } | {
        success: boolean;
        message: string;
        revision: string | null;
    }>;
    getRetryMetadata(sessionId: string, userId?: string): {
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
    createRetryTask(sessionId: string, retrySessionId: string, userId?: string): Task | null;
    retryWithResume(sessionId: string, userId?: string, config?: {
        model?: string;
        endpoint?: string;
        apiKey?: string;
    }): Promise<{
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
    private buildFailureGuidance;
    private hasVue3Artifacts;
    private hasVue3EntryFile;
    private hasTaskArtifacts;
    private hasPartialMicrocodeArtifacts;
    private hasPartialMicrocodeEntry;
    getArtifactReadyLevel(task: Task): 'full' | 'partial' | false;
    getMissingEntryFiles(task: Task): string[];
    private hasPartialSnapshotArtifacts;
    private getPartialMissingFiles;
    private hasMicrocodeArtifacts;
    private hasMicrocodeEntryFile;
    submitHumanReview(params: {
        sessionId: string;
        userId: string;
        overrideStatus: 'passed' | 'warned';
        reviewerName?: string;
        comment?: string;
    }): {
        success: boolean;
        message: string;
        review?: undefined;
    } | {
        success: boolean;
        message: string;
        review: HumanReviewRecord;
    };
    revokeHumanReview(params: {
        sessionId: string;
        userId: string;
        reviewerName?: string;
    }): {
        success: boolean;
        message: string;
    };
    getReviewableTasks(userId: string): (Task & {
        reviewable: boolean;
    })[];
}
export {};
