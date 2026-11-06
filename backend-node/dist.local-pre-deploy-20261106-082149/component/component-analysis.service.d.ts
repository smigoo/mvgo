import { ComponentService } from './component.service';
import { AiConfigService } from '../config/config.service';
type AnalysisConfig = {
    visionApiKey?: string;
    visionBaseURL?: string;
    visionModel?: string;
};
type VisualIssue = {
    severity: 'high' | 'medium' | 'low';
    category: string;
    region: string;
    description: string;
    suggestion: string;
};
export declare class ComponentAnalysisService {
    private readonly componentService;
    private readonly aiConfigService;
    private readonly logger;
    constructor(componentService: ComponentService, aiConfigService: AiConfigService);
    analyzeComponent(componentId: string, userId: string, config?: AnalysisConfig): Promise<{
        success: boolean;
        component: {
            id: string;
            componentId: string;
            name: string;
            target: string;
            groupId: string;
        };
        figma: {
            fileKey: any;
            nodeId: any;
            previewPath: string;
        };
        runtime: {
            status: any;
            pass: boolean;
            summary: string;
            issues: any;
            previewUrl: any;
        };
        visual: {
            available: boolean;
            overallSimilarity: any;
            pass: boolean;
            summary: string;
            issues: VisualIssue[];
        };
        recommendation: {
            nextStep: string;
            rationale: string;
        };
    }>;
    private resolveFigmaPreviewPath;
    private resolveAnalysisOutputPath;
    private resolveVisionConfig;
    private pick;
    private summarizeRuntimeIssues;
    private buildVisualSection;
    private buildVisualSummary;
    private buildRecommendation;
}
export {};
