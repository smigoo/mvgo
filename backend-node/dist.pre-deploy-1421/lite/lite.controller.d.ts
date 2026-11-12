import { LiteService } from './lite.service';
import { HtmlSplitService } from './html-split.service';
import { Phase2Service } from '../phase2/phase2.service';
import { GenerateLiteDto } from './dto/generate-lite.dto';
import { TasksService, RateLimitReason } from '../tasks/tasks.service';
import { ProgressService } from '../progress/progress.service';
import { QuotaService } from '../quota/quota.service';
import { TaskQueueService } from '../queue/task-queue.service';
import { LiteComponentType, LiteSourceType } from './lite.constants';
export declare class LiteController {
    private readonly liteService;
    private readonly htmlSplitService;
    private readonly phase2Service;
    private readonly tasksService;
    private readonly progressService;
    private readonly quotaService?;
    private readonly queueService?;
    private readonly logger;
    constructor(liteService: LiteService, htmlSplitService: HtmlSplitService, phase2Service: Phase2Service, tasksService: TasksService, progressService: ProgressService, quotaService?: QuotaService | undefined, queueService?: TaskQueueService | undefined);
    retryFromCache(sessionId: string, body: {
        componentType?: 'vue3' | 'microcode';
        config?: Record<string, any>;
    }, req: any): Promise<{
        success: boolean;
        sessionId: string;
        message: string;
    }>;
    upgradeAssets(sessionId: string, body?: {
        figmaUrl?: string;
    }, req?: any): Promise<{
        success: boolean;
        message: string;
        assets?: any[];
        mappingFile?: string;
        placementReport?: {
            placements: any[];
            summary: string;
            analyzedAt: string;
            model?: string;
        } | null;
        codeUpdated?: boolean;
        backupFile?: string;
        appliedPlacements?: any[];
        skippedPlacements?: any[];
        modifiedFiles?: string[];
        validation?: {
            sfcStructure: "passed" | "skipped";
            scriptSetupUnchanged: "passed" | "skipped";
            resourceReferences: "passed" | "skipped";
        };
    }>;
    analyzeHtml(body: {
        htmlContent: string;
        htmlFileName?: string;
    }): Promise<{
        success: boolean;
        totalComponents: number;
        fileName: string;
        previewHtml: string;
        components: Array<{
            index: number;
            name: string;
            strategy: "explicit" | "semantic" | "layout-child" | "class-name";
            htmlContent: string;
        }>;
    }>;
    generateSplit(body: {
        htmlContent: string;
        htmlFileName?: string;
        groupId?: string;
        config?: Record<string, any>;
        selections: Array<{
            index: number;
            componentType: 'vue3' | 'microcode';
            componentName?: string;
        }>;
    }, req: any): Promise<{
        success: boolean;
        totalSelected: number;
        components: Array<{
            sessionId: string;
            name: string;
            type: "vue3" | "microcode";
            status: "pending" | "running" | "completed" | "failed";
            error?: string;
        }>;
    }>;
    generate(dto: GenerateLiteDto, req: any): Promise<{
        success: boolean;
        sessionId: string;
        sourceType: LiteSourceType;
        componentType: LiteComponentType;
        generationTier: "max";
        queued: boolean;
        queuePosition: number;
        message: string;
        rateLimitReason?: undefined;
        quotaResetAt?: undefined;
        waitMinutes?: undefined;
    } | {
        success: boolean;
        sessionId: string;
        sourceType: LiteSourceType;
        componentType: LiteComponentType;
        generationTier: "max";
        queued: boolean;
        message: string;
        queuePosition?: undefined;
        rateLimitReason?: undefined;
        quotaResetAt?: undefined;
        waitMinutes?: undefined;
    } | {
        success: boolean;
        sessionId: string;
        sourceType: LiteSourceType;
        componentType: LiteComponentType;
        generationTier: "lite";
        queued: boolean;
        queuePosition: number;
        rateLimitReason: RateLimitReason;
        quotaResetAt: number | undefined;
        waitMinutes: number | undefined;
        message: string;
    } | {
        success: boolean;
        sessionId: string;
        sourceType: LiteSourceType;
        componentType: LiteComponentType;
        generationTier: "lite";
        queued: boolean;
        message: string;
        queuePosition?: undefined;
        rateLimitReason?: undefined;
        quotaResetAt?: undefined;
        waitMinutes?: undefined;
    } | {
        success: boolean;
        sessionId: string;
        sourceType: LiteSourceType;
        componentType: LiteComponentType;
        generationTier: "lite";
        queued: boolean;
        queuePosition: number;
        rateLimitReason: string;
        message: string;
        quotaResetAt?: undefined;
        waitMinutes?: undefined;
    }>;
}
