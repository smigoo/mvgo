import { IncrementalFileCleanupService } from './incremental-file-cleanup.service';
export interface WorkspaceTransactionTarget {
    targetPath: string;
    stagingPath: string | null;
}
export declare class WorkspaceTransactionService {
    private readonly cleanup;
    constructor(cleanup: IncrementalFileCleanupService);
    commit(targets: WorkspaceTransactionTarget[], validateCommittedState?: () => Promise<void>): Promise<void>;
}
