import type { Response } from 'express';
import { ProgressService } from './progress.service';
export declare class ProgressController {
    private readonly progressService;
    constructor(progressService: ProgressService);
    streamProgress(sessionId: string, res: Response): Response<any, Record<string, any>>;
}
