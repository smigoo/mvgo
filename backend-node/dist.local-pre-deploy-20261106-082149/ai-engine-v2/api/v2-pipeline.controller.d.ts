import { ProgressService } from '../../progress/progress.service';
import { TasksService } from '../../tasks/tasks.service';
import { GenerateV2Dto, PreviewV2Dto } from './dto/v2-pipeline.dto';
import { V2PipelineService } from './v2-pipeline.service';
export declare class V2PipelineController {
    private readonly service;
    private readonly tasksService;
    private readonly progressService;
    private readonly logger;
    constructor(service: V2PipelineService, tasksService: TasksService, progressService: ProgressService);
    catalog(): Promise<{
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
        success: boolean;
    }>;
    health(req: any): Promise<{
        ok: any;
        generationReady: any;
        specAudit: {
            ok: any;
            warnings: any;
            reports: any;
        };
        tiers: Record<string, any>;
        exposedBy: string;
        success: boolean;
    }>;
    preview(dto: PreviewV2Dto, req: any): Promise<{
        success: boolean;
        preview: any;
    }>;
    generate(dto: GenerateV2Dto, req: any): Promise<{
        success: boolean;
        sessionId: string;
        spec: any;
        tier: any;
        sourceType: "screenshot" | "figma";
        llmCallCount: any;
        steps: any;
        progressUrl: string;
        message: string;
    }>;
    uploadSpec(specDef: Record<string, any>): Promise<{
        message: string;
        id: any;
        packageDir: string;
        success: boolean;
    }>;
}
