import { TaskStatsService } from './task-stats.service';
import { SelfHealingService } from './self-healing.service';
export declare class TaskStatsController {
    private readonly taskStatsService;
    private readonly selfHealingService;
    constructor(taskStatsService: TaskStatsService, selfHealingService: SelfHealingService);
    listAllTasks(userId: string, preset?: string, from?: string, to?: string): Promise<{
        success: boolean;
        list: {
            sessionId: any;
            userId: any;
            username: any;
            status: any;
            target: any;
            startTime: any;
            duration: any;
            textModel: any;
            visionModel: any;
            textBaseURL: any;
            visionBaseURL: any;
            totalTokens: number;
            callCount: number;
            fileCount: number;
            lineCount: any;
            componentName: any;
            failType: import("./task-stats.service").FailType | undefined;
            failReason: any;
        }[];
        count: number;
        windowLabel: string;
    }>;
    modelCompare(userId: string, preset?: string, from?: string, to?: string): Promise<{
        success: boolean;
        list: {
            type: string;
            model: string;
            baseURL: string;
            taskCount: number;
            completed: number;
            failed: number;
            qualityFail: number;
            envFail: number;
            otherFail: number;
            successRate: number | null;
            qualitySuccessRate: number | null;
            durationP50Ms: number | null;
            durationP90Ms: number | null;
            componentCount: number;
            totalTokens: number;
            callCount: number;
            avgLineCount: number;
            secPer100LinesP50: number | null;
            secPer100LinesP90: number | null;
            tokenKPer100LinesP50: number | null;
            tokenKPer100LinesP90: number | null;
            efficiencySampleCount: number;
            smallSample: boolean;
        }[];
        count: number;
        windowLabel: string;
    }>;
    backfillTokenBaseURLs(userId: string): Promise<{
        scanned: number;
        updated: number;
        skipped: number;
        errors: number;
        success: boolean;
    }>;
    trends(userId: string, preset?: string, from?: string, to?: string, metric?: 'successRate' | 'duration' | 'tokens' | 'taskCount', granularity?: 'day' | 'week'): Promise<{
        series: {
            timestamp: number;
            taskCount: number;
            completed: number;
            successRate: number | null;
            durationP50Ms: number | null;
            durationP90Ms: number | null;
            totalTokens: number;
        }[];
        metric: "duration" | "tokens" | "successRate" | "taskCount";
        granularity: "week" | "day";
        count: number;
        windowLabel: string;
        success: boolean;
    }>;
    dashboard(userId: string, preset?: string, from?: string, to?: string): Promise<{
        success: boolean;
        data: {
            overview: {
                totalTasks: number;
                completedTasks: number;
                failedTasks: number;
                successRate: number | null;
                firstTrySuccessRate: number | null;
                avgDurationMs: number;
                totalTokens: number;
                totalCost: number;
                avgCostPerTask: number;
                activeUsers: number;
                windowLabel: string;
            };
            modelRanking: {
                type: string;
                model: string;
                baseURL: string;
                taskCount: number;
                successRate: number | null;
                qualitySuccessRate: number | null;
                secPer100LinesP50: number | null;
                tokenKPer100LinesP50: number | null;
            }[];
            modelScatterData: {
                model: string;
                type: string;
                taskCount: number;
                successRate: number | null;
                avgCostPer100Lines: number;
                secPer100LinesP50: number | null;
                tokenKPer100LinesP50: number | null;
            }[];
            trends: {
                timestamp: any;
                successRate: any;
                durationP50Ms: any;
                taskCount: any;
            }[];
            failDistribution: {
                quality: number;
                qualityRate: number;
                qualityDetails: any[];
                env: number;
                envRate: number;
                envDetails: any[];
                other: number;
                otherRate: number;
                otherDetails: any[];
                total: number;
            };
            departmentSummary: {
                department: string;
                userCount: number;
                taskCount: number;
                completed: number;
                failed: number;
                successRate: number | null;
                durationP50Ms: number | null;
            }[];
            windowLabel: string;
        };
    }>;
    myDashboard(userId: string, preset?: string, from?: string, to?: string): Promise<{
        success: boolean;
        data: {
            overview: {
                totalTasks: number;
                completedTasks: number;
                failedTasks: number;
                successRate: number | null;
                firstTrySuccessRate: number | null;
                avgDurationMs: number;
                totalTokens: number;
                totalCost: number;
                avgCostPerTask: number;
                windowLabel: string;
            };
            myModels: {
                model: string;
                taskCount: number;
                successCount: number;
                successRate: number;
            }[];
            windowLabel: string;
        };
    }>;
    failureAnalysis(userId: string, sessionId?: string): Promise<{
        success: boolean;
        message: string;
        data?: undefined;
    } | {
        success: boolean;
        data: import("./self-healing.service").FailureAnalysis | null;
        message?: undefined;
    }>;
}
