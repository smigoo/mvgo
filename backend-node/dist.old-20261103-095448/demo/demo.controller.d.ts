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
    }): Promise<{
        success: boolean;
        componentId: string;
        summary: string;
        alreadyRunning: boolean;
        iterations?: undefined;
    } | {
        success: boolean;
        componentId: string;
        summary: any;
        iterations: any;
        alreadyRunning?: undefined;
    }>;
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
