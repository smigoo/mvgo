import { Model } from 'mongoose';
import { TasksService } from '../tasks/tasks.service';
import { UserAiConfigService } from '../config/user-ai-config.service';
import { TaskFeedbackDocument, FeedbackStatus } from './feedback.schema';
export declare const FEEDBACK_MAX_FILE_BYTES: number;
export interface CreateFeedbackParams {
    sessionId: string;
    userId: string;
    username?: string;
    category?: string;
    description?: string;
    includes?: string[] | string;
    logsText?: string;
    pageUrl?: string;
    userAgent?: string;
    file?: {
        buffer: Buffer;
        originalname?: string;
        mimetype?: string;
        size?: number;
    };
}
export interface CreateFeedbackResult {
    success: boolean;
    message?: string;
    duplicate?: boolean;
    feedback?: Record<string, any>;
}
export interface ListFeedbackQuery {
    page?: number;
    pageSize?: number;
    status?: string;
    category?: string;
    sessionId?: string;
    keyword?: string;
}
export declare class FeedbackService {
    private readonly feedbackModel;
    private readonly tasksService;
    private readonly userAiConfigService;
    private readonly logger;
    constructor(feedbackModel: Model<TaskFeedbackDocument>, tasksService: TasksService, userAiConfigService: UserAiConfigService);
    create(params: CreateFeedbackParams): Promise<CreateFeedbackResult>;
    private normalizeCategory;
    private parseIncludes;
    private buildSnapshot;
    private resolveModelsUsed;
    private buildFigmaUrl;
    private resolveTaskImages;
    private resolveCredentialFingerprint;
    private readUserFigmaConfig;
    private saveAttachment;
    list(query: ListFeedbackQuery): Promise<{
        list: any[];
        total: number;
        counts: Record<string, number>;
    }>;
    detail(id: string): Promise<any>;
    updateStatus(id: string, params: {
        status: FeedbackStatus;
        adminNote?: string;
        adminId: string;
        adminName?: string;
    }): Promise<any>;
    remove(id: string): Promise<{
        success: boolean;
    }>;
    resolveAttachment(id: string): Promise<{
        absPath: string;
        filename: string;
        mimeType: string;
    }>;
    private assertObjectId;
}
