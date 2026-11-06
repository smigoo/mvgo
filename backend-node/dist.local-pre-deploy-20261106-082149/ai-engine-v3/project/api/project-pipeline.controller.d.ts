import { StreamableFile } from '@nestjs/common';
import { FreezeProjectDto, GenerateProjectDto, InspectProjectDto, PickProjectDto, SaveDecisionsDto, ScanProjectDto } from './dto/project-pipeline.dto';
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
        probeCleanupError: string | null;
        ok: boolean;
        note: string;
        success: boolean;
    };
    pickDir(dto: PickProjectDto): Promise<{
        success: boolean;
    }>;
    browseDir(dirPath: string): {
        success: boolean;
        browse: {
            path: string;
            name: string;
            parent: null;
            roots: boolean;
            entries: Record<string, any>[];
        } | {
            path: string;
            name: string;
            parent: string | null;
            parentName: string | null;
            isGitRepo: boolean;
            hasProjectJson: boolean;
            fileCountAtThisLevel: number;
            skippedDirs: number;
            truncated: boolean;
            totalEntries: number;
            entries: Record<string, any>[];
        };
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
    scan(dto: ScanProjectDto, req: any): Promise<{
        featureEnrich: Record<string, any>;
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
        featureDetails: Record<string, any>;
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
        briefing: {
            title: string;
            desc: string;
            frontend: string;
            backend: string;
            features: string[];
            featuresFrom: string;
        };
        durationMs: number;
        exitCode: number;
        stdout: string;
        success: boolean;
    }>;
    runs(req: any): {
        runsRoot: string;
        total: number;
        runs: {
            runId: string;
            createdAt: string;
            projectDir: string | null;
            note: string | null;
            ownerId: string | null;
            frozen: boolean;
        }[];
        success: boolean;
    };
    run(runId: string, req: any): Promise<{
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
            featureDetails: Record<string, any>;
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
            featureEnrich: Record<string, any> | null;
            briefing: {
                title: string;
                desc: string;
                frontend: string;
                backend: string;
                features: string[];
                featuresFrom: string;
            };
        };
    }>;
    units(runId: string, refresh: string, req: any): Promise<{
        success: boolean;
        units: import("../units/unit-contract").UnitContract & {
            cached: boolean;
            validationErrors?: string[];
        };
    }>;
    artifact(runId: string, name: string, req: any): Promise<{
        success: boolean;
        artifact: {
            runId: string;
            name: string;
            bytes: number;
            isImage: boolean;
            dataUrl: string;
            truncated?: undefined;
            mtime?: undefined;
            content?: undefined;
            lines?: undefined;
        } | {
            runId: string;
            name: string;
            bytes: number;
            truncated: boolean;
            mtime: string;
            content: string;
            lines: number;
            isImage?: undefined;
            dataUrl?: undefined;
        };
    }>;
    generatedFiles(runId: string, req: any): {
        success: boolean;
        files: string[];
    };
    deleteRun(runId: string, req: any): {
        deleted: string;
        bytes: number;
        dir: string;
        success: boolean;
    };
    decisions(dto: SaveDecisionsDto, req: any): {
        saved: number;
        decisions: import("../stages/s2-contract-freezer").DecisionRecord[];
        bytes: number;
        path: string;
        success: boolean;
    };
    freeze(dto: FreezeProjectDto, req: any): Promise<{
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
    }>;
    generate(dto: GenerateProjectDto, req: any): Promise<{
        success: boolean;
        generate: {
            generatedAt: string;
            runId: string;
            summary: import("../stages/s3-codegen").CodeGenSummary;
            notes: string[];
            files: {
                backend: string[];
                frontend: string[];
                meta: string[];
            };
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
        };
    }>;
    generateVue(dto: GenerateProjectDto, req: any): Promise<{
        success: boolean;
        generateVue: {
            generatedAt: string;
            runId: string;
            projectRoot: string;
            summary: {
                pages: number;
                files: number;
                components: number;
            };
            gate: {
                pass: boolean;
                missingText: string[];
                missingHeadings: string[];
            };
            notes: string[];
            files: string[];
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
        };
    }>;
    getBinding(runId: string, req: any): {
        success: boolean;
        runId: string;
        binding: any;
        apiTags: {
            tag: string;
            functions: string[];
        }[];
        dataRefs: string[];
    };
    setBinding(runId: string, dto: any, req: any): {
        success: boolean;
        runId: string;
        binding: {
            tag: string;
            fn: string;
            params: Record<string, any>;
            target: string;
        };
    };
    getEmbeds(runId: string, req: any): {
        success: boolean;
        runId: string;
        embeds: any[];
        views: {
            viewName: string;
            pageName: string;
            dataRefs: string[];
            blocks?: {
                index: number;
                tag: string;
                hint: string;
            }[] | undefined;
        }[];
    };
    setEmbeds(runId: string, dto: any, req: any): {
        success: boolean;
        runId: string;
        embeds: any[];
    };
    generatedZip(runId: string, req: any): Promise<StreamableFile>;
}
