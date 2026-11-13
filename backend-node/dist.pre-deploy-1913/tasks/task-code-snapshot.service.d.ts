export type TaskCodeSnapshotStatus = 'candidate' | 'validating' | 'last-good' | 'rejected' | 'partial';
export interface TaskCodeSnapshotFile {
    path: string;
    size: number;
    hash: string;
    lines?: number;
}
export interface TaskCodeSnapshotValidation {
    semantics?: 'pending' | 'passed' | 'warning' | 'blocked';
    sfc?: 'pending' | 'passed' | 'warning' | 'blocked';
    less?: 'pending' | 'passed' | 'warning' | 'blocked';
    runtime?: 'pending' | 'passed' | 'warning' | 'blocked';
    structure?: 'pending' | 'passed' | 'warning' | 'blocked';
}
export interface TaskCodeSnapshotManifest {
    version: 1;
    sessionId: string;
    componentId: string;
    groupId?: string;
    target: 'microcode' | 'vue3';
    revision: string;
    status: TaskCodeSnapshotStatus;
    createdAt: string;
    stage?: string;
    files: TaskCodeSnapshotFile[];
    validation?: TaskCodeSnapshotValidation;
    lastGoodRevision?: string;
    rejectionReason?: string;
    missingFiles?: string[];
    parentRevision?: string;
    editSource?: string;
    refineSessionId?: string;
}
export interface RefineDiffLine {
    type: 'add' | 'del' | 'ctx';
    text: string;
    oldLine?: number;
    newLine?: number;
}
export interface RefineChange {
    path: string;
    type: 'modified' | 'added' | 'removed';
    baselineLines: number;
    candidateLines: number;
    baselineSize: number;
    candidateSize: number;
    diff: RefineDiffLine[];
}
export interface CreateTaskCodeSnapshotInput {
    sessionId: string;
    componentId: string;
    groupId?: string;
    target: 'microcode' | 'vue3';
    stage?: string;
    files: Record<string, string | Buffer>;
    refineSessionId?: string;
}
export { extractRelativeVueImports, resolveRelativeModulePath, collectMissingVueImports, } from '../ai-engine/utils/vue-import-closure.js';
export declare class TaskCodeSnapshotService {
    private readonly root;
    constructor();
    createCandidate(input: CreateTaskCodeSnapshotInput): TaskCodeSnapshotManifest;
    getCandidateManifest(sessionId: string): TaskCodeSnapshotManifest | null;
    getLatestManifest(sessionId: string): TaskCodeSnapshotManifest | null;
    getLastGoodManifest(sessionId: string): TaskCodeSnapshotManifest | null;
    private isRenderableRevision;
    private isVueImportClosureComplete;
    private resolvePreviewRevision;
    resolvePublishSourceDir(sessionId: string): {
        dir: string;
        revision: string;
    } | null;
    getManifest(sessionId: string, revision: string): TaskCodeSnapshotManifest;
    hasManifest(sessionId: string, revision: string): boolean;
    readPreviewFile(sessionId: string, revision: string, rawPath: string): Buffer;
    readFile(sessionId: string, revision: string, rawPath: string): Buffer;
    private readFileContentOrFallback;
    private resolveWorkspaceFile;
    exportRevisionFiles(sessionId: string, revision: string): Record<string, string>;
    freezeOutputPath(outputPath: string, meta: {
        sessionId: string;
        componentId: string;
        groupId?: string;
        target: 'microcode' | 'vue3';
        stage?: string;
        refineSessionId?: string;
    }): TaskCodeSnapshotManifest;
    restoreOutputPath(sessionId: string, revision: string, outputPath: string): void;
    computeRefineDiff(sessionId: string, baselineRev: string, candidateRev: string): RefineChange[];
    updateValidation(sessionId: string, revision: string, validation: TaskCodeSnapshotValidation, rejectionReason?: string): TaskCodeSnapshotManifest;
    private readManifestFile;
    reconcileRevisionIntegrity(sessionId: string, revision: string): string[];
    refreshRevisionFilesFromDisk(sessionId: string, revision: string, outputPath: string, relPaths: string[]): string[];
    private repairFileEntry;
    markValidating(sessionId: string, revision: string, validation: TaskCodeSnapshotValidation): TaskCodeSnapshotManifest;
    publishLastGood(sessionId: string, revision: string, validation: TaskCodeSnapshotValidation): TaskCodeSnapshotManifest;
    markCandidateDegraded(sessionId: string, revision: string, reason: string, validation: TaskCodeSnapshotValidation): TaskCodeSnapshotManifest;
    rejectCandidate(sessionId: string, revision: string, reason: string, validation: TaskCodeSnapshotValidation): TaskCodeSnapshotManifest;
    markPartial(sessionId: string, revision: string, reason: string, validation: TaskCodeSnapshotValidation): TaskCodeSnapshotManifest;
    getPartialManifest(sessionId: string): TaskCodeSnapshotManifest | null;
    listRevisions(sessionId: string): TaskCodeSnapshotManifest[];
    rollbackToRevision(sessionId: string, revision: string): TaskCodeSnapshotManifest;
    createEditedCandidate(sessionId: string, revision: string, filePath: string, content: string | Buffer, editSource?: string): TaskCodeSnapshotManifest;
    createOverlayCandidate(sessionId: string, overlayFiles: Record<string, string | Buffer>, opts: {
        stage: string;
        editSource: string;
        baseRevision?: string;
    }): TaskCodeSnapshotManifest | null;
    private updateManifest;
    private getSessionDir;
    private getRevisionDir;
    private readPointer;
    private writePointer;
    private clearPointer;
    private assertSafeId;
    private normalizeRelativePath;
    private resolveInside;
}
