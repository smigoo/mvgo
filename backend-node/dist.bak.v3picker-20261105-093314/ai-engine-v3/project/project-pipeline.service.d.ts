import type { DecisionRecord } from './stages/s2-contract-freezer';
export interface DecisionEntry {
    conflictId: string;
    choice: string;
    note?: string;
}
export declare class ProjectPipelineService {
    private readonly logger;
    health(): {
        engine: string;
        milestone: string;
        node: string;
        runsRoot: string;
        scanner: {
            path: string;
            exists: boolean;
            md5: string | null;
            expectedMd5: string;
            md5Match: boolean;
        };
        runsRootWritable: boolean;
        runsRootError: string | null;
        ok: boolean;
        note: string;
    };
    inspect(projectDir: string): {
        projectDir: string;
        resolvedPath: string;
        exists: boolean;
        isDirectory: boolean;
        readable: boolean;
        totalFiles: number;
        totalBytes: number;
        topLevel: never[];
        byExt: never[];
        hint: string;
        readError?: undefined;
    } | {
        projectDir: string;
        resolvedPath: string;
        exists: boolean;
        isDirectory: boolean;
        readable: boolean;
        readError: string | null;
        totalFiles: number;
        totalBytes: number;
        topLevel: {
            name: string;
            type: string;
            size: number;
            childCount: number;
        }[];
        byExt: {
            count: number;
            bytes: number;
            ext: string;
        }[];
        hint: string;
    };
    scan(projectDir: string, note?: string): Promise<{
        runId: string;
        dir: string;
        projectDir: any;
        scannedAt: any;
        elapsedMs: any;
        s0: {
            docs: any;
            html: any;
            frontend: any;
            backend: any;
            projectJson: any;
            git: any;
            missing: any;
            gate: any;
            readOnly: any;
        } | null;
        s1: {
            sources: any;
            alignment: any;
            envelopeShapes: any;
            envelope: any;
            sourceHashes: any;
            gaps: any;
            gate: any;
        } | null;
        endpoints: {
            total: any;
            declaredPrefix: any;
            byConfidence: any;
            list: any;
        };
        conflicts: {
            id: string;
            title: string;
            index: number;
        }[];
        gaps: {
            id: string;
            severity: string;
            title: string;
        }[];
        missing: any;
        decisions: DecisionRecord[];
        artifacts: ({
            name: string;
            exists: boolean;
            bytes: number;
            mtime: string;
        } | {
            name: string;
            exists: boolean;
            bytes: number;
            mtime: null;
        })[];
        frozen: boolean;
        durationMs: number;
        exitCode: number;
        stdout: string;
    }>;
    private runScanner;
    private newRunId;
    private assertRunId;
    listRuns(): {
        runsRoot: string;
        total: number;
        runs: {
            runId: string;
            createdAt: string;
            projectDir: string | null;
            note: string | null;
            frozen: boolean;
        }[];
    };
    inspectRun(runId: string): {
        runId: string;
        dir: string;
        projectDir: any;
        scannedAt: any;
        elapsedMs: any;
        s0: {
            docs: any;
            html: any;
            frontend: any;
            backend: any;
            projectJson: any;
            git: any;
            missing: any;
            gate: any;
            readOnly: any;
        } | null;
        s1: {
            sources: any;
            alignment: any;
            envelopeShapes: any;
            envelope: any;
            sourceHashes: any;
            gaps: any;
            gate: any;
        } | null;
        endpoints: {
            total: any;
            declaredPrefix: any;
            byConfidence: any;
            list: any;
        };
        conflicts: {
            id: string;
            title: string;
            index: number;
        }[];
        gaps: {
            id: string;
            severity: string;
            title: string;
        }[];
        missing: any;
        decisions: DecisionRecord[];
        artifacts: ({
            name: string;
            exists: boolean;
            bytes: number;
            mtime: string;
        } | {
            name: string;
            exists: boolean;
            bytes: number;
            mtime: null;
        })[];
        frozen: boolean;
    };
    private parseConflictsMd;
    saveDecisions(runId: string, entries: DecisionEntry[]): {
        saved: number;
        decisions: DecisionRecord[];
        bytes: number;
        path: string;
    };
    readDecisions(runId: string): DecisionRecord[];
    freeze(runId: string): {
        artifacts: ({
            name: string;
            exists: boolean;
            bytes: number;
            mtime: string;
        } | {
            name: string;
            exists: boolean;
            bytes: number;
            mtime: null;
        })[];
        runId: string;
        frozenAt: string;
        projectRoot: any;
        generator: string;
        openapi: {
            pathCount: number;
            operationCount: number;
            verbDeclared: number;
            verbDefaulted: number;
            skipped: number;
            byConfidence: Record<string, number>;
            sha256: string;
            bytes: number;
        };
        envelope: {
            source: string;
            confirmed: boolean;
            keys: any;
            successCode: any;
        };
        decisions: {
            total: number;
            ids: string[];
        };
        pending: {
            conflicts: {
                id: string;
                title: string;
            }[];
            gaps: {
                id: string;
                severity: string;
                title: string;
            }[];
        };
        digests: Record<string, string>;
        checks: {
            id: string;
            ok: boolean;
            detail: string;
        }[];
        allChecksOk: boolean;
    };
    readArtifact(runId: string, name: string): {
        runId: string;
        name: string;
        bytes: number;
        truncated: boolean;
        mtime: string;
        content: string;
        lines: number;
    };
}
