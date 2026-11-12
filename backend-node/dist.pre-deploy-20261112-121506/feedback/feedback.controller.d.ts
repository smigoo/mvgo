import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { AdminService } from '../admin/admin.service';
import { FeedbackService } from './feedback.service';
import type { FeedbackStatus } from './feedback.schema';
export declare class FeedbackController {
    private readonly feedbackService;
    constructor(feedbackService: FeedbackService);
    submitFeedback(sessionId: string, body: Record<string, any>, file: any, userId: string, req: any): Promise<import("./feedback.service").CreateFeedbackResult>;
}
export declare class FeedbackAdminController {
    private readonly feedbackService;
    private readonly adminService;
    constructor(feedbackService: FeedbackService, adminService: AdminService);
    list(userId: string, page?: string, pageSize?: string, status?: string, category?: string, sessionId?: string, keyword?: string): Promise<{
        list: any[];
        total: number;
        counts: Record<string, number>;
        success: boolean;
    }>;
    detail(userId: string, id: string): Promise<{
        success: boolean;
        feedback: any;
    }>;
    updateStatus(userId: string, id: string, body: {
        status?: FeedbackStatus;
        adminNote?: string;
    }, req: any): Promise<{
        success: boolean;
        message: string;
        feedback?: undefined;
    } | {
        success: boolean;
        feedback: any;
        message?: undefined;
    }>;
    remove(userId: string, id: string): Promise<{
        success: boolean;
    }>;
    download(userId: string, id: string, res: Response): Promise<StreamableFile>;
}
