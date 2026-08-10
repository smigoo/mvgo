import type { Response } from 'express';
import { Phase2Service } from './phase2.service';
import { ComponentService } from '../component/component.service';
import { DocAnalyzerService } from './doc/doc-analyzer.service.js';
import type { AnalyzeDocDto } from './doc/doc-analyzer.service.js';
import { GeneratePhase2Dto } from './dto/generate-phase2.dto';
import { QuotaService } from '../quota/quota.service';
export declare class Phase2Controller {
    private readonly phase2Service;
    private readonly componentService;
    private readonly docAnalyzerService;
    private readonly quotaService;
    private readonly logger;
    constructor(phase2Service: Phase2Service, componentService: ComponentService, docAnalyzerService: DocAnalyzerService, quotaService: QuotaService);
    analyzeDoc(dto: AnalyzeDocDto): Promise<import("./doc/doc-analyzer.service.js").AnalyzeDocResult>;
    regenerateWithDoc(dto: any, req: any): Promise<{
        success: boolean;
        sessionId: string;
        message: string;
    }>;
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
        message: string;
    }>;
    downloadComponent(componentId: string, req: any, res: Response): Promise<void>;
}
