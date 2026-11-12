import { LiteService } from './lite.service';
import { TasksService } from '../tasks/tasks.service';
export declare class HtmlSplitService {
    private readonly liteService;
    private readonly tasksService;
    private readonly logger;
    constructor(liteService: LiteService, tasksService: TasksService);
    analyzeHtml(params: {
        htmlContent: string;
        htmlFileName?: string;
    }): {
        success: boolean;
        totalComponents: number;
        fileName: string;
        previewHtml: string;
        components: Array<{
            index: number;
            name: string;
            strategy: 'explicit' | 'semantic' | 'layout-child' | 'class-name';
            htmlContent: string;
        }>;
    };
    generateSelectedComponents(params: {
        htmlContent: string;
        htmlFileName?: string;
        groupId?: string;
        config?: Record<string, any>;
        userId?: string;
        selections: Array<{
            index: number;
            componentType: 'vue3' | 'microcode';
            componentName?: string;
        }>;
    }): Promise<{
        success: boolean;
        totalSelected: number;
        components: Array<{
            sessionId: string;
            name: string;
            type: 'vue3' | 'microcode';
            status: 'pending' | 'running' | 'completed' | 'failed';
            error?: string;
        }>;
    }>;
    splitHtmlScreen(params: {
        htmlContent: string;
        htmlFileName?: string;
        componentType: 'vue3' | 'microcode';
        groupId?: string;
        config?: Record<string, any>;
        userId?: string;
    }): Promise<{
        success: boolean;
        totalComponents: number;
        components: Array<{
            sessionId: string;
            name: string;
            type: string;
            boundingBox?: {
                x: number;
                y: number;
                width: number;
                height: number;
            };
            status: 'pending' | 'generating' | 'completed' | 'failed';
            error?: string;
        }>;
    }>;
    private identifyComponentRegions;
    private extractRegionHtml;
    private generatePreviewHtml;
    private extractGlobalStyles;
    private extractRelevantStyles;
    private inferComponentName;
    private isSignificantRegion;
    private isValidComponentSize;
    private startComponentGeneration;
}
