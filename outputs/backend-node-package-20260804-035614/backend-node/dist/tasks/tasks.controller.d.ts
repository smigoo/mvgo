import type { Response } from 'express';
import { TasksService } from './tasks.service';
export declare class TasksController {
    private readonly tasksService;
    constructor(tasksService: TasksService);
    getAllTasks(userId: string): {
        success: boolean;
        tasks: {
            target: any;
            taskType: string;
            parentId: string | undefined;
            childIds: string[];
            sessionId: string;
            configSnapshot?: Record<string, any>;
            componentId: string;
            groupId?: string;
            status: "running" | "completed" | "failed" | "cancelled" | "paused";
            startTime: number;
            endTime?: number;
            duration?: number;
            progress: any[];
            progressCount: number;
            result?: any;
            error?: string;
            buffer: any[];
            componentName: string;
            nodeId: string;
            fileKey: string;
            outputPath?: string;
            lastCompletedStage?: string;
            checkpointStatus?: string;
            panelKey: string;
            userId?: string;
            qualityGate?: "passed" | "warned";
            humanReview?: import("./tasks.service").HumanReviewRecord;
        }[];
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
            status: "failed" | "running" | "completed" | "cancelled" | "paused";
            startTime: number;
            endTime: number | undefined;
            duration: number | undefined;
            progressCount: number;
            componentName: string;
            error: string | undefined;
            progress: any[];
            result: any;
            fileKey: string;
            nodeId: string;
            target: string | undefined;
            panelKey: string;
            taskType: string | undefined;
            parentId: string | undefined;
            childIds: string[] | undefined;
        };
        error?: undefined;
    };
    getTaskTree(sessionId: string, userId: string): {
        success: boolean;
        error: string;
        tree?: undefined;
    } | {
        success: boolean;
        tree: {
            children: {
                sessionId: string;
                componentId: string;
                groupId: string | undefined;
                status: "failed" | "running" | "completed" | "cancelled" | "paused";
                componentName: string;
                nodeId: string;
                fileKey: string;
                target: string | undefined;
                panelKey: string;
                taskType: string | undefined;
                startTime: number;
                endTime: number | undefined;
                duration: number | undefined;
                progressCount: number;
                error: string | undefined;
                result: any;
            }[];
            sessionId: string;
            configSnapshot?: Record<string, any>;
            componentId: string;
            groupId?: string;
            status: "running" | "completed" | "failed" | "cancelled" | "paused";
            startTime: number;
            endTime?: number;
            duration?: number;
            progress: any[];
            progressCount: number;
            result?: any;
            error?: string;
            buffer: any[];
            componentName: string;
            nodeId: string;
            fileKey: string;
            target?: string;
            outputPath?: string;
            lastCompletedStage?: string;
            checkpointStatus?: string;
            panelKey: string;
            taskType?: string;
            parentId?: string;
            childIds?: string[];
            userId?: string;
            qualityGate?: "passed" | "warned";
            humanReview?: import("./tasks.service").HumanReviewRecord;
        };
        error?: undefined;
    };
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
    cancelTask(sessionId: string, userId: string): {
        success: boolean;
        message: string;
    };
    pauseTask(sessionId: string, userId: string): {
        success: boolean;
        message: string;
    };
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
            originalError: string | undefined;
            originalDuration: number | undefined;
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
    }, userId: string): {
        success: boolean;
        error: string | undefined;
        meta?: undefined;
        configUpdated?: undefined;
        message?: undefined;
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
            originalError: string | undefined;
            originalDuration: number | undefined;
            error?: undefined;
        };
        configUpdated: boolean;
        message: string;
        error?: undefined;
    };
    downloadTaskCode(sessionId: string, userId: string, res: Response): Promise<void>;
    recoverTask(sessionId: string, userId: string): Promise<{
        success: boolean;
        message?: string;
        error?: string;
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
}
