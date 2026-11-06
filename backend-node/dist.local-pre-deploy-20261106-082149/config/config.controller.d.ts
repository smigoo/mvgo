import { AiConfigService } from './config.service';
import { ConfigTestService } from './config-test.service';
import { UserAiConfigService } from './user-ai-config.service';
import { TasksService } from '../tasks/tasks.service';
export declare class AiConfigController {
    private readonly svc;
    private readonly testSvc;
    private readonly userAiConfigService;
    private readonly tasksService;
    constructor(svc: AiConfigService, testSvc: ConfigTestService, userAiConfigService: UserAiConfigService, tasksService: TasksService);
    getAi(userId: string): Promise<{
        success: boolean;
        config: Record<string, any>;
    }>;
    saveAi(body: Record<string, any>, session: Record<string, any>, userId: string): Promise<{
        success: boolean;
        error: string;
        details: string[];
    } | {
        visionWarnings?: string[] | undefined;
        visionCheck?: {
            model: string;
            slot: string;
            vision: boolean | null;
            message: string;
        }[] | undefined;
        success: boolean;
        appliesTo: string;
        hasRunningTasks: boolean;
        error?: undefined;
        details?: undefined;
    }>;
    private normalizeBinding;
    private enforceModelVerification;
    private collectVisionRoleModels;
    private detectVisionCapabilityOnSave;
    testText(body: Record<string, any>): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: import("./config-test.service").TestResult;
        error?: undefined;
    }>;
    testVision(body: Record<string, any>): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: import("./config-test.service").TestResult;
        error?: undefined;
    }>;
    testModelCapability(body: Record<string, any>, userId: string): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: {
            text: import("./config-test.service").TestResult;
            vision: import("./config-test.service").TestResult;
            reasoning: import("./config-test.service").TestResult;
        };
        error?: undefined;
    }>;
    testProvider(body: Record<string, any>, userId: string): Promise<{
        success: boolean;
        error: string;
        text?: undefined;
        vision?: undefined;
    } | {
        success: boolean;
        text: import("./config-test.service").TestResult;
        vision: import("./config-test.service").TestResult;
        error?: undefined;
    }>;
    testFigma(body: Record<string, any>): Promise<import("./config-test.service").TestResult>;
    testApifox(body: Record<string, any>): Promise<import("./config-test.service").TestResult>;
    testGitlab(body: Record<string, any>): Promise<import("./config-test.service").TestResult>;
}
