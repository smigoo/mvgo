import { Response } from 'express';
import { TasksService } from '../tasks/tasks.service';
import { TaskQueueService } from '../queue/task-queue.service';
export declare class ProgressService {
    private readonly tasksService;
    private readonly logger;
    private sessions;
    private heartbeatIntervals;
    private eventSequences;
    private eventHistory;
    private readonly maxHistoryPerSession;
    private queueService;
    constructor(tasksService: TasksService, queueService?: TaskQueueService);
    setQueueService(queueService: TaskQueueService): void;
    register(sessionId: string, res: Response, lastEventId?: string): Response;
    private recordEvent;
    private sanitizeResultForBroadcast;
    private sendEvent;
    sendProgress(sessionId: string, progressData: any): void;
    sendCodeSnapshot(sessionId: string, snapshotData: any): void;
    sendFileLifecycle(sessionId: string, lifecycleData: any): void;
    sendLog(sessionId: string, level: string, message: string, meta?: any): void;
    sendComplete(sessionId: string, result: any): Promise<void>;
    sendError(sessionId: string, error: any): Promise<void>;
    close(sessionId: string): void;
}
