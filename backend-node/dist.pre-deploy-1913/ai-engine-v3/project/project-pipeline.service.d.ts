import type { DecisionRecord } from './stages/s2-contract-freezer';
import { AiConfigService } from '../../config/config.service';
import { type UnitContract } from './units/unit-contract';
export declare function normalizeProjectOwner(userId?: unknown): string | undefined;
export interface DecisionEntry {
    conflictId: string;
    choice: string;
    note?: string;
}
export declare class ProjectPipelineService {
    private readonly aiConfig;
    private readonly logger;
    private readonly shotInflight;
    private readonly enrichInflight;
    constructor(aiConfig: AiConfigService);
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
    pickDirectory(defaultDir?: string): Promise<Record<string, any>>;
    browseDirectory(rawPath?: string): {
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
    private listBrowseRoots;
    private recentProjectDirs;
    private pickStartDir;
    private hasBin;
    scan(projectDir: string, note?: string, userId?: string, opts?: {
        vision?: boolean;
        enrich?: 'sync' | 'defer';
    }): Promise<{
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
    }>;
    private runScanner;
    private newRunId;
    private assertRunId;
    private resolveRunDir;
    private readRunMeta;
    listRuns(userId?: string): {
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
    };
    deleteRun(runId: string, userId?: string): {
        deleted: string;
        bytes: number;
        dir: string;
    };
    private measureDir;
    inspectRun(runId: string, userId?: string, opts?: {
        vision?: boolean;
        enrich?: 'sync' | 'defer';
    }): Promise<{
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
        featureEnrich: Record<string, any> | null;
        briefing: {
            title: string;
            desc: string;
            frontend: string;
            backend: string;
            features: string[];
            featuresFrom: string;
        };
    }>;
    private buildBriefing;
    private loadOrBuildFeatureDetails;
    private buildFeatureDetails;
    private attachEndpointLocations;
    private applyEnrichment;
    private readRunJson;
    private patchRunMeta;
    private deriveFeatureEnrichStatus;
    private startFeatureEnrichment;
    private runFeatureEnrichment;
    private extractFeatures;
    private matchEndpoints;
    private matchEndpointsByPaths;
    private matchPages;
    private endpointAction;
    private epKey;
    private detectUiRegions;
    private createPageAccessor;
    private locateEndpointsInPages;
    private enrichEndpointLocationsWithVision;
    private featureTokens;
    private featureSlug;
    private deriveSuggestedEndpoints;
    private shotName;
    private shotsDirHasPng;
    private planShotPaths;
    private waitForPaint;
    private withBudget;
    private closeBrowserSafely;
    private captureShots;
    private computeCoverage;
    private resolveTextConfigSafe;
    private resolveVisionConfigSafe;
    private callVisionJson;
    private enrichCoverageWithVision;
    private enrichFeaturesWithLLM;
    private callChatJson;
    private extractJson;
    getUnits(runId: string, userId?: string, opts?: {
        refresh?: boolean;
    }): Promise<UnitContract & {
        cached: boolean;
        validationErrors?: string[];
    }>;
    private readUnits;
    private readManifest;
    private htmlPageRels;
    private computeUnitInputKey;
    private unitsCacheMatchesInput;
    private buildUnits;
    private readUnitFeatures;
    private resolveFigmaTokenSafe;
    private parseConflictsMd;
    saveDecisions(runId: string, entries: DecisionEntry[], userId?: string): {
        saved: number;
        decisions: DecisionRecord[];
        bytes: number;
        path: string;
    };
    readDecisions(runId: string): DecisionRecord[];
    freeze(runId: string, userId?: string): Promise<{
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
    }>;
    generate(runId: string, userId?: string): Promise<{
        generatedAt: string;
        runId: string;
        summary: import("./stages/s3-codegen").CodeGenSummary;
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
    }>;
    generateVue(runId: string, userId?: string): Promise<{
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
    }>;
    getBinding(runId: string, userId?: string): {
        success: boolean;
        runId: string;
        binding: any;
        apiTags: {
            tag: string;
            functions: string[];
        }[];
        dataRefs: string[];
    };
    setBinding(runId: string, dto: {
        tag: string;
        fn: string;
        params?: Record<string, any>;
        target: string;
    }, userId?: string): {
        success: boolean;
        runId: string;
        binding: {
            tag: string;
            fn: string;
            params: Record<string, any>;
            target: string;
        };
    };
    getEmbeds(runId: string, userId?: string): {
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
            }[];
        }[];
    };
    setEmbeds(runId: string, dto: {
        embeds?: any[];
    }, userId?: string): {
        success: boolean;
        runId: string;
        embeds: any[];
    };
    private readApiExports;
    generateZip(runId: string, userId?: string): Promise<{
        buffer: Buffer;
        filename: string;
    }>;
    private zipDirectory;
    private ensureShot;
    readArtifact(runId: string, name: string, userId?: string): Promise<{
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
    }>;
    listGeneratedFiles(runId: string, userId?: string): string[];
}
