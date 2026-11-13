import { type TruthInventory } from './truth-matcher';
import { type E2nMap } from './e2n-map';
export type PlanKind = 'bg-image' | 'inline-image' | 'fill-color' | 'text-truth';
export type PlanAction = 'replace-gradient' | 'replace-color' | 'replace-bg-color' | 'insert' | 'replace-url' | 'layer-url' | 'set-src' | 'set-background-color' | 'set-inline-style' | 'noop';
export interface PlanTarget {
    file: string;
    key: string;
    selector?: string;
    cls?: string;
    action: PlanAction;
    before?: string;
    after?: string;
    satisfied: boolean;
    undecidable?: boolean;
}
export interface PlanEntry {
    id: string;
    kind: PlanKind;
    decision: 'apply' | 'skip';
    skipReason?: string;
    figma: {
        nodeId: string;
        name: string;
        type?: string;
        text?: string;
        w?: number;
        h?: number;
        parentId?: string;
    };
    prod?: {
        file?: string;
        path?: string;
        tag?: string;
        classes?: string[];
    };
    evidence: string[];
    targets: PlanTarget[];
    conflicts: Array<{
        entryId: string;
        rule: string;
        resolution: string;
    }>;
    payload?: Record<string, unknown>;
}
export type PlanGapKind = PlanKind | 'container-fill' | 'gradient-fill';
export interface PlanGap {
    kind: PlanGapKind;
    figmaId?: string;
    detail: string;
}
export interface BackfillPlanStats {
    entries: number;
    apply: number;
    skip: number;
    satisfied: number;
    undecidable: number;
    byKind: Record<PlanKind, {
        candidates: number;
        apply: number;
        skip: number;
        satisfied: number;
    }>;
    conflicts: number;
    gaps: number;
}
export interface BackfillPlan {
    builtAt: string;
    stats: BackfillPlanStats;
    entries: PlanEntry[];
    gaps: PlanGap[];
}
export interface BuildPlanOptions {
    figmaRoot: any;
    prodFiles: Array<{
        path: string;
        content: string;
    }>;
    truth?: TruthInventory;
    e2n?: E2nMap;
    agentConsumed?: string[];
    assetOpacity?: Record<string, {
        meanAlpha: number;
        meanLum?: number;
        visibleRatio?: number;
    }>;
    now?: string;
}
export declare function buildBackfillPlan(opts: BuildPlanOptions): BackfillPlan;
export declare function renderPlanMarkdown(plan: BackfillPlan): string;
