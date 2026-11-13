import { AiConfigService } from '../../config/config.service';
import { LiteService } from '../../lite/lite.service';
import { ProgressService } from '../../progress/progress.service';
import { TasksService } from '../../tasks/tasks.service';
import { TaskCodeSnapshotService } from '../../tasks/task-code-snapshot.service';
import type { RunLabDto } from './dto/run-lab.dto';
import { type UnsourcedStats } from '../lib/unsourced-style';
import { type ApplyUnsourcedStats } from '../lib/unsourced-apply';
import { type PlanApplyStats } from '../lib/backfill-plan-apply';
export interface LabReportSummary {
    status: 'done' | 'error';
    sessionId: string;
    fileKey?: string;
    nodeId?: string;
    stats?: Record<string, number>;
    plan?: {
        entries: number;
        apply: number;
        satisfied: number;
        conflicts: number;
        gaps: number;
        byKind: Record<string, {
            candidates: number;
            apply: number;
            skip: number;
            satisfied: number;
        }>;
        applyStats: PlanApplyStats;
        reconcile: {
            both: number;
            planOnly: string[];
            legacyOnly: string[];
            agree: boolean;
        };
    };
    assets?: Array<{
        nodeId: string;
        name: string;
        fileName?: string;
    }>;
    unsourced?: {
        stats: UnsourcedStats;
        findings: Array<{
            cls: string;
            prop: string;
            value: string;
            verdict: string;
            figmaId: string;
            evidence: string;
        }>;
    };
    unsourcedApplied?: {
        stats: ApplyUnsourcedStats;
        remainingAuto: number;
        applied: Array<{
            file: string;
            cls: string;
            rawProp: string;
            kind: string;
            from: string;
            to: string;
            figmaId: string;
        }>;
        skipped: Array<{
            cls: string;
            rawProp: string;
            verdict: string;
            reason: string;
        }>;
    };
    files?: Array<{
        path: string;
        changed: boolean;
        editCount: number;
    }>;
    workspaceSynced?: boolean;
    outputPath?: string;
    error?: string;
    finishedAt?: string;
}
export declare class LiteLabService {
    private readonly liteService;
    private readonly tasksService;
    private readonly progressService;
    private readonly aiConfigService;
    private readonly taskCodeSnapshotService;
    private readonly logger;
    constructor(liteService: LiteService, tasksService: TasksService, progressService: ProgressService, aiConfigService: AiConfigService, taskCodeSnapshotService: TaskCodeSnapshotService);
    private resolveFigmaToken;
    private locateOutputPath;
    parseFigmaUrlLocal(url: string): Promise<{
        fileKey?: string;
        nodeId?: string;
    }>;
    run(dto: RunLabDto, userId?: string): Promise<{
        sessionId: string;
        fileKey: string;
        nodeId: string;
        componentType: "microcode" | "vue3";
        progressUrl: string;
        message: string;
    }>;
    private executeLab;
    private syncBackfillToWorkspace;
    private runBgAiFallback;
    private buildBgAiComposite;
    private collectSfcFiles;
    private collectPrecompiledCss;
    private assertLabAccess;
    getReport(sessionId: string, userId?: string): LabReportSummary & {
        edits?: any;
    };
    getArtifact(sessionId: string, relPath: string, userId?: string): {
        buffer: Buffer;
        ext: string;
    };
}
