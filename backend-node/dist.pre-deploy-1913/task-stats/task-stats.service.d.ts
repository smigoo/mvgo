import { Model } from 'mongoose';
import { TokenUsageDocument } from '../schemas/token-usage.schema';
import { UserDocument } from '../schemas/user.schema';
import { AdminService } from '../admin/admin.service';
import { TasksService } from '../tasks/tasks.service';
import { TaskCodeSnapshotService } from '../tasks/task-code-snapshot.service';
import { UsagePreset } from '../admin/usage-export';
export type FailType = 'quality' | 'env' | 'other';
export interface TaskStatsFilter {
    preset?: UsagePreset | string;
    from?: string;
    to?: string;
}
export declare class TaskStatsService {
    private readonly adminService;
    private readonly tasksService;
    private readonly snapshotService;
    private readonly tokenUsageModel;
    private readonly userModel;
    constructor(adminService: AdminService, tasksService: TasksService, snapshotService: TaskCodeSnapshotService, tokenUsageModel: Model<TokenUsageDocument>, userModel: Model<UserDocument>);
    assertAdmin(userId: string): Promise<void>;
    assertFailureAnalysisAccess(userId: string, sessionId: string): Promise<void>;
    backfillTokenBaseURLs(): Promise<{
        scanned: number;
        updated: number;
        skipped: number;
        errors: number;
    }>;
    private classifyFailure;
    private resolveWindow;
    listAllTasks(filter?: TaskStatsFilter): Promise<{
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
            failType: FailType | undefined;
            failReason: any;
        }[];
        count: number;
        windowLabel: string;
    }>;
    modelCompare(filter?: TaskStatsFilter): Promise<{
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
    trends(filter?: TaskStatsFilter, metric?: 'successRate' | 'duration' | 'tokens' | 'taskCount', granularity?: 'day' | 'week'): Promise<{
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
    }>;
    userStats(filter?: TaskStatsFilter): Promise<{
        list: {
            userId: string;
            username: string;
            department: string;
            taskCount: number;
            completed: number;
            failed: number;
            cancelled: number;
            successRate: number | null;
            durationP50Ms: number | null;
            durationP90Ms: number | null;
            lastUsedAt: number;
            topModels: {
                model: string;
                count: number;
            }[];
            smallSample: boolean;
        }[];
        departments: {
            department: string;
            userCount: number;
            taskCount: number;
            completed: number;
            failed: number;
            successRate: number | null;
            durationP50Ms: number | null;
        }[];
        count: number;
        windowLabel: string;
    }>;
    dashboard(filter?: TaskStatsFilter): Promise<{
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
    }>;
    myDashboard(userId: string, filter?: TaskStatsFilter): Promise<{
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
    }>;
}
