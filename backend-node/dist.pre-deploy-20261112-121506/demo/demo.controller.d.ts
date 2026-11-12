import type { Response } from 'express';
import { DemoService } from './demo.service';
export declare class DemoController {
    private readonly demoService;
    private readonly logger;
    constructor(demoService: DemoService);
    aiChat(body: {
        message: string;
        componentId: string;
        selectedFiles?: any[];
        attachments?: any[];
        history?: any[];
        llmConfig?: {
            apiKey?: string;
            baseURL?: string;
            model?: string;
        };
    }): Promise<any>;
    aiFixRenderError(body: {
        componentId: string;
        groupId?: string;
        errorMessage: string;
        stack?: string;
        info?: string;
        llmConfig?: {
            apiKey?: string;
            baseURL?: string;
            model?: string;
        };
    }): {
        success: boolean;
        fixId?: string;
        alreadyRunning?: boolean;
        message?: string;
    };
    aiFixRenderErrorStatus(fixId: string): {
        success: boolean;
        fixId?: string;
        status?: "running" | "success" | "failed";
        componentId?: string;
        summary?: string;
        iterations?: number;
        message?: string;
    };
    aiChatStream(body: {
        message: string;
        componentId: string;
        selectedFiles?: any[];
        attachments?: any[];
        history?: any[];
        llmConfig?: {
            apiKey?: string;
            baseURL?: string;
            model?: string;
        };
    }, res: Response): Promise<void>;
    initialize(componentId: string): Promise<any>;
    undo(componentId: string): Promise<any>;
    restore(componentId: string): Promise<any>;
    getModifications(componentId: string): Promise<{
        modifications: any;
        count: any;
    }>;
    download(componentId: string, req: any, res: Response): Promise<void>;
}
