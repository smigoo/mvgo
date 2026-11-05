import type { Response, Request } from 'express';
import { ScreenLayoutService } from './screen-layout.service';
import { ProgressService } from '../progress/progress.service';
export declare class ScreenLayoutController {
    private readonly screenLayoutService;
    private readonly progressService;
    private readonly logger;
    constructor(screenLayoutService: ScreenLayoutService, progressService: ProgressService);
    download(body: {
        layout: any;
    }, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
    analyzeSpatial(body: {
        layout: any;
    }): Promise<{
        success: boolean;
        data: Promise<any>;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        data?: undefined;
    }>;
    analyzeResponsive(body: {
        layout: any;
    }, req: any): Promise<{
        success: boolean;
        sessionId: string;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        sessionId?: undefined;
    }>;
    streamProgress(sessionId: string, res: Response, req: Request): Response<any, Record<string, any>> | undefined;
    downloadResponsive(sessionId: string, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
}
