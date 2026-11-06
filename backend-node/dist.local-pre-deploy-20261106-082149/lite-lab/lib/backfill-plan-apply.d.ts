import type { BackfillPlan, PlanKind } from './backfill-plan';
export interface PlanApplyEdit {
    path: string;
    pos: number;
    end: number;
    text: string;
    desc: string;
}
export interface PlanApplyStats {
    entries: number;
    appliedEntries: number;
    ruleEdits: number;
    bgInserted: number;
    bgReplacedGradient: number;
    bgReplacedColor: number;
    bgReplacedUrl: number;
    bgLayered: number;
    fillApplied: number;
    textApplied: number;
    noop: number;
    stale: number;
}
export interface PlanApplyResult {
    files: Array<{
        path: string;
        changed: boolean;
        content: string;
        edits: PlanApplyEdit[];
    }>;
    stats: PlanApplyStats;
    consumedAssets: Array<{
        fileName: string;
        figmaId: string;
        cls: string;
        action: string;
    }>;
}
export declare function mergeStyle(existing: string, incoming: string): string;
export declare function applyBackfillPlan(files: Array<{
    path: string;
    content: string;
}>, plan: BackfillPlan, opts?: {
    kinds?: PlanKind[];
}): PlanApplyResult;
export interface PlanReconcileReport {
    planOnly: string[];
    legacyOnly: string[];
    both: string[];
    agree: boolean;
}
export declare function reconcileBgPlan(plan: BackfillPlan, legacyAnchored: Array<{
    fileName: string;
    cls: string;
}>): PlanReconcileReport;
