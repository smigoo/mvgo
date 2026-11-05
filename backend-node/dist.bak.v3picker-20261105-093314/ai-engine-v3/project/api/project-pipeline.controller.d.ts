import { FreezeProjectDto, InspectProjectDto, SaveDecisionsDto, ScanProjectDto } from './dto/project-pipeline.dto';
import { ProjectPipelineService } from '../project-pipeline.service';
export declare class ProjectPipelineController {
    private readonly service;
    private readonly logger;
    constructor(service: ProjectPipelineService);
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
        success: boolean;
    };
    inspect(dto: InspectProjectDto): {
        success: boolean;
        inspect: {
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
    };
    scan(dto: ScanProjectDto): Promise<{
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
        decisions: import("../stages/s2-contract-freezer").DecisionRecord[];
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
        success: boolean;
    }>;
    runs(): {
        runsRoot: string;
        total: number;
        runs: {
            runId: string;
            createdAt: string;
            projectDir: string | null;
            note: string | null;
            frozen: boolean;
        }[];
        success: boolean;
    };
    run(runId: string): {
        success: boolean;
        run: {
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
            decisions: import("../stages/s2-contract-freezer").DecisionRecord[];
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
    };
    artifact(runId: string, name: string): {
        success: boolean;
        artifact: {
            runId: string;
            name: string;
            bytes: number;
            truncated: boolean;
            mtime: string;
            content: string;
            lines: number;
        };
    };
    decisions(dto: SaveDecisionsDto): {
        saved: number;
        decisions: import("../stages/s2-contract-freezer").DecisionRecord[];
        bytes: number;
        path: string;
        success: boolean;
    };
    freeze(dto: FreezeProjectDto): {
        success: boolean;
        freeze: {
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
    };
}
