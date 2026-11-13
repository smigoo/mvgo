import { TaskCodeSnapshotService, TaskCodeSnapshotValidation } from './task-code-snapshot.service';
import { TasksService } from './tasks.service';
export type QualitySeverity = 'BLOCK' | 'WARN' | 'INFO';
export interface QualityIssue {
    id: string;
    severity: QualitySeverity;
    sourceType: 'shared-less' | 'standalone-less' | 'sfc-style' | 'sfc-semantics' | 'structure';
    file: string;
    line: number;
    column: number;
    message: string;
    extract?: string[];
    snippet?: Array<{
        line?: number;
        code: string;
        current?: boolean;
    }>;
    hint?: {
        suggestion?: string;
    };
    healApplied?: boolean;
}
export interface SnapshotQualityResult {
    success: true;
    sessionId: string;
    revision: string;
    pass: boolean;
    blockCount: number;
    issues: QualityIssue[];
    validation: TaskCodeSnapshotValidation;
    integrityDrifted?: string[];
    checkedAt: string;
}
export declare class SnapshotQualityService {
    private readonly snapshotService;
    private readonly tasksService;
    private readonly logger;
    constructor(snapshotService: TaskCodeSnapshotService, tasksService: TasksService);
    validateRevision(sessionId: string, revision: string, options?: {
        persist?: boolean;
    }): Promise<SnapshotQualityResult>;
    private persistToTask;
    private materialize;
    private runLessGate;
    private pickLessHint;
    private buildSourceSnippet;
    private runSfcSemantics;
    private extractIssueLine;
    private runStructureCheck;
    private findMissingStyleImports;
    private collapseMissingImportDuplicates;
    private deriveValidation;
}
