import { OnModuleInit } from '@nestjs/common';
import { AiConfigService } from '../../config/config.service';
import { ProgressService } from '../../progress/progress.service';
import { TasksService } from '../../tasks/tasks.service';
import type { GenerateV2Dto, PreviewV2Dto } from './dto/v2-pipeline.dto';
import { Model } from 'mongoose';
export declare class V2PipelineService implements OnModuleInit {
    private readonly aiConfigService;
    private readonly progressService;
    private readonly tasksService;
    private readonly groupMemberModel;
    private readonly logger;
    private engine;
    private registryLoaded;
    constructor(aiConfigService: AiConfigService, progressService: ProgressService, tasksService: TasksService, groupMemberModel: Model<any>);
    onModuleInit(): Promise<void>;
    private loadEngine;
    private ensureRegistry;
    getCatalog(): Promise<{
        specs: any;
        tiers: any;
        sourceTypes: any;
        defaults: {
            spec: string;
            tier: any;
            sourceType: string;
        };
        fallbackModels: any;
        registryWarnings: string[];
    }>;
    health(userId?: string): Promise<{
        ok: any;
        generationReady: any;
        specAudit: {
            ok: any;
            warnings: any;
            reports: any;
        };
        tiers: Record<string, any>;
        exposedBy: string;
    }>;
    preview(dto: PreviewV2Dto, userId?: string): Promise<any>;
    private buildPreview;
    runGeneration(sessionId: string, dto: GenerateV2Dto, groupId: string, userId?: string): Promise<{
        sessionId: string;
        spec: any;
        tier: any;
        sourceType: any;
        componentName: any;
        outputPath: string;
        files: string[];
        quality: any;
        warnings: any;
        durationMs: any;
        trace: any;
    }>;
    private writeArtifacts;
    private buildAiConfig;
    private resolveFigmaToken;
    resolveGroupId(dtoGroupId: string | undefined, userId?: string): Promise<string>;
    buildTaskMetadata(sessionId: string, dto: GenerateV2Dto, groupId: string, userId?: string): {
        componentId: string;
        componentName: string;
        target: string;
        groupId: string;
        taskType: "component";
        userId: string | undefined;
        generationTier: any;
        sourceType: any;
        outputPath: string;
    };
    uploadSpec(specDef: Record<string, any>): Promise<{
        id: any;
        packageDir: string;
    }>;
}
