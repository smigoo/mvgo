export interface DecisionRecord {
    conflictId: string;
    choice: string;
    note?: string;
    decidedAt?: string;
}
export interface FreezeInput {
    runId: string;
    projectRoot: string;
    envelope?: any;
    endpoints: any[];
    declaredPrefix?: string | null;
    decisions: DecisionRecord[];
    pendingConflictIds?: string[];
    blockerGapIds?: string[];
    frozenAt: string;
}
export interface OpenApiStats {
    pathCount: number;
    operationCount: number;
    verbDeclared: number;
    verbDefaulted: number;
    skipped: number;
    byConfidence: Record<string, number>;
    decisionIds: string[];
    pendingConflictIds: string[];
    envelopeSource: string;
    envelopeConfirmed: boolean;
    sha256: string;
    bytes: number;
}
export interface OpenApiBuild {
    yaml: string;
    stats: OpenApiStats;
}
export declare function buildOpenApi(input: FreezeInput): OpenApiBuild;
export interface RequirementsFreezeInput {
    draft: string;
    runId: string;
    frozenAt: string;
    openapiStats: OpenApiStats;
    decisions: DecisionRecord[];
    pendingConflicts: {
        id: string;
        title: string;
    }[];
    blockerGaps: {
        id: string;
        title: string;
    }[];
    artifactDigests: Record<string, string>;
}
export declare function freezeRequirements(input: RequirementsFreezeInput): string;
