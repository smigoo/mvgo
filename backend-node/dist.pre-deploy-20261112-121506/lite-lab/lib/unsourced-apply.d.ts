import type { UnsourcedFinding } from './unsourced-style';
export type ApplySkipReason = 'no-truth-value' | 'multi-value' | 'non-px' | 'less-var' | 'important' | 'stale-offset' | 'file-missing' | 'cap-exceeded';
export interface AppliedUnsourcedEdit {
    file: string;
    cls: string;
    selector: string;
    figmaId: string;
    kind: 'delete' | 'override';
    rawProp: string;
    from: string;
    to: string;
}
export interface SkippedUnsourcedEdit {
    file: string;
    cls: string;
    rawProp: string;
    verdict: string;
    reason: ApplySkipReason;
}
export interface ApplyUnsourcedStats {
    considered: number;
    reportOnly: number;
    applied: number;
    delete: number;
    override: number;
    skipped: number;
    filesChanged: number;
    rulesRewritten: number;
    emptyRulesLeft: number;
    byReason: Record<string, number>;
}
export interface ApplyUnsourcedResult {
    files: Array<{
        path: string;
        content: string;
        changed: boolean;
        edits: string[];
    }>;
    applied: AppliedUnsourcedEdit[];
    skipped: SkippedUnsourcedEdit[];
    stats: ApplyUnsourcedStats;
}
export interface ApplyUnsourcedOptions {
    findings: UnsourcedFinding[];
    prodFiles: Array<{
        path: string;
        content: string;
    }>;
    maxPerFile?: number;
    maxTotal?: number;
}
export declare function applyUnsourcedStyles(opts: ApplyUnsourcedOptions): ApplyUnsourcedResult;
export declare function renderUnsourcedAppliedMarkdown(stats: ApplyUnsourcedStats, applied: AppliedUnsourcedEdit[], skipped: SkippedUnsourcedEdit[]): string;
export declare function unsourcedApplyStatsLine(stats: ApplyUnsourcedStats): string;
