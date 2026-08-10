import { Response } from 'express';
import { TasksService } from '../tasks/tasks.service';
export declare class ProgressService {
    private readonly tasksService;
    private readonly logger;
    private sessions;
    private heartbeatIntervals;
    constructor(tasksService: TasksService);
    register(sessionId: string, res: Response): Response;
    private sendEvent;
    sendProgress(sessionId: string, progressData: any): void;
    sendLog(sessionId: string, level: string, message: string, meta?: any): void;
    private stripSecrets;
    sendComplete(sessionId: string, result: any): void;
    sendError(sessionId: string, error: any): void;
    close(sessionId: string): void;
}
