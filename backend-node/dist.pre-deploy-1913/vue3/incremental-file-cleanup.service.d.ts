import { OnModuleInit } from '@nestjs/common';
export declare class IncrementalFileCleanupService implements OnModuleInit {
    private static readonly DELETE_BATCH_SIZE;
    private static readonly MAX_DELETE_ATTEMPTS;
    private readonly logger;
    private readonly jobs;
    private draining;
    onModuleInit(): void;
    scanAndResume(roots: string[]): number;
    private collectCleanupDirs;
    detachAndSchedule(targetPath: string): string | null;
    scheduleDetached(detachedPath: string): void;
    private scheduleDrain;
    private drainNextBatch;
    private retryOrAbandon;
    private collectEntries;
}
