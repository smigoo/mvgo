import type { Response } from 'express';
import { ProgressService } from './progress.service';
import { TasksService } from '../tasks/tasks.service';
export declare class ProgressController {
    private readonly progressService;
    private readonly tasksService;
    constructor(progressService: ProgressService, tasksService: TasksService);
    streamProgress(sessionId: string, lastEventId: string | undefined, userId: string, res: Response): Response<any, Record<string, any>>;
}
