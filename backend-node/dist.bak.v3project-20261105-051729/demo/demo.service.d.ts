import { Response } from 'express';
import { ComponentService } from '../component/component.service';
import { Phase2Service } from '../phase2/phase2.service';
import { ChatAttachmentService } from './chat-attachment.service';
export declare class DemoService {
    private readonly componentService;
    private readonly phase2Service;
    private readonly chatAttachmentService;
    private readonly logger;
    private readonly aiFixLocks;
    private readonly aiFixJobs;
    private aiFixSeq;
    constructor(componentService: ComponentService, phase2Service: Phase2Service, chatAttachmentService: ChatAttachmentService);
    aiChat(params: {
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
    private buildMessageWithVisualContext;
    aiFixRenderError(params: {
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
        summary: any;
        iterations: any;
    } | {
        success: boolean;
        componentId: string;
        summary: string;
        alreadyRunning: boolean;
    }>;
    startAiFixRenderError(params: {
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
    getAiFixStatus(fixId: string): {
        success: boolean;
        fixId?: string;
        status?: 'running' | 'success' | 'failed';
        componentId?: string;
        summary?: string;
        iterations?: number;
        message?: string;
    };
    private runAiFixRenderError;
    private withTimeout;
    private validateAndSyncAiFix;
    private validateVueSfcStructure;
    private syncEntryAcrossWorkspace;
    aiChatStream(params: {
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
    initializeSnapshot(componentId: string): Promise<any>;
    undoModification(componentId: string): Promise<any>;
    restoreInitial(componentId: string): Promise<any>;
    getModifications(componentId: string): Promise<{
        modifications: any;
        count: any;
    }>;
    downloadComponent(componentId: string, userId: string, res: Response): Promise<void>;
    private legacyArchiveComponent;
    private addComponentDirToArchive;
}
