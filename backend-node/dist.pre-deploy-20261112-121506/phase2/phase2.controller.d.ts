import { OnModuleInit } from '@nestjs/common';
import type { Response } from 'express';
import { Phase2Service } from './phase2.service';
import { ComponentService } from '../component/component.service';
import { DocAnalyzerService } from './doc/doc-analyzer.service.js';
import type { AnalyzeDocDto } from './doc/doc-analyzer.service.js';
import { GeneratePhase2Dto } from './dto/generate-phase2.dto';
import { RefineComponentDto } from './dto/refine-component.dto';
import { QuotaService } from '../quota/quota.service';
import { TaskQueueService } from '../queue/task-queue.service';
import { TasksService } from '../tasks/tasks.service';
export declare class Phase2Controller implements OnModuleInit {
    private readonly phase2Service;
    private readonly componentService;
    private readonly docAnalyzerService;
    private readonly quotaService;
    private readonly queueService;
    private readonly tasksService;
    private readonly logger;
    constructor(phase2Service: Phase2Service, componentService: ComponentService, docAnalyzerService: DocAnalyzerService, quotaService: QuotaService, queueService: TaskQueueService, tasksService: TasksService);
    getFigmaPreview(body: {
        figmaUrl: string;
        figmaToken?: string;
        config?: any;
    }, req: any): Promise<{
        success: boolean;
        imageUrl?: string;
        previewToken?: string;
        nodeName?: string;
        width?: number;
        height?: number;
        error?: string;
    }>;
    getPreviewImage(token: string, res: Response): Promise<void>;
    onModuleInit(): void;
    analyzeDoc(dto: AnalyzeDocDto): Promise<import("./doc/doc-analyzer.service.js").AnalyzeDocResult>;
    regenerateWithDoc(dto: any, req: any): Promise<{
        success: boolean;
        sessionId: string;
        message: string;
    }>;
    refine(dto: RefineComponentDto, req: any): Promise<{
        success: boolean;
        sessionId: string;
        message: string;
        target: "microcode" | "vue3" | undefined;
        generationTier: "max" | "lite" | undefined;
    }>;
    visionAnalyze(dto: RefineComponentDto, req: any): Promise<any>;
    visionImage(sessionId: string, kind: string, res: Response): Promise<void>;
    getQuota(req: any): Promise<{
        success: boolean;
        error: string;
        data?: undefined;
    } | {
        success: boolean;
        data: {
            hourly: {
                used: number;
                limit: number;
                remaining: number;
            };
            daily: {
                used: number;
                limit: number;
                remaining: number;
            };
        };
        error?: undefined;
    }>;
    generate(dto: GeneratePhase2Dto, req: any): Promise<{
        success: boolean;
        sessionId: string;
        queued: boolean;
        message: any;
        queue: {
            position: number;
            quotaResetAt: any;
            waitMinutes: any;
            runningCount?: undefined;
            maxConcurrent?: undefined;
            availableSlots?: undefined;
        };
    } | {
        success: boolean;
        sessionId: string;
        queued: boolean;
        message: string;
        queue: {
            position: number;
            runningCount: number;
            maxConcurrent: number;
            quotaResetAt?: undefined;
            waitMinutes?: undefined;
            availableSlots?: undefined;
        };
    } | {
        success: boolean;
        sessionId: string;
        message: string;
        queue: {
            runningCount: number;
            maxConcurrent: number;
            availableSlots: number;
            position?: undefined;
            quotaResetAt?: undefined;
            waitMinutes?: undefined;
        };
        queued?: undefined;
    }>;
    downloadComponent(componentId: string, req: any, res: Response): Promise<void>;
}
