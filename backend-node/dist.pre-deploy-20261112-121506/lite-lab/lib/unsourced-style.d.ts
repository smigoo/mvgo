import type { E2nMap } from './e2n-map';
export type UnsourcedProp = 'background' | 'border' | 'border-radius' | 'box-shadow';
export type UnsourcedVerdict = 'delete' | 'override' | 'fanout';
export interface UnsourcedFinding {
    file: string;
    selector: string;
    cls: string;
    figmaId: string;
    figmaName: string;
    prop: UnsourcedProp;
    rawProp: string;
    value: string;
    verdict: UnsourcedVerdict;
    evidence: string;
    bodyStart: number;
    bodyEnd: number;
    declStart: number;
    declEnd: number;
    valueStart: number;
    valueEnd: number;
    truthValue?: string;
}
export interface UnsourcedStats {
    classesScanned: number;
    classesSkipped: number;
    unmappedRiskClasses: string[];
    findings: number;
    delete: number;
    override: number;
    fanout: number;
    byProp: Record<UnsourcedProp, number>;
}
export interface DetectUnsourcedOptions {
    figmaRoot: any;
    prodFiles: Array<{
        path: string;
        content: string;
    }>;
    e2n?: E2nMap;
}
export interface NodeStyleTruth {
    hasFill: boolean;
    hasStroke: boolean;
    cornerRadius: number | null;
    hasShadow: boolean;
    hasRuleShape: boolean;
    sourceNodeId: string;
    fillCss?: string;
    siblingFills?: string[];
}
export declare function collectNodeStyleTruth(figmaRoot: any, nodeId: string): NodeStyleTruth | undefined;
export declare function collectSiblingFillVariants(figmaRoot: any, nodeId: string): string[] | undefined;
export declare function detectUnsourcedStyles(opts: DetectUnsourcedOptions): {
    findings: UnsourcedFinding[];
    stats: UnsourcedStats;
};
export declare function renderUnsourcedMarkdown(findings: UnsourcedFinding[], stats: UnsourcedStats): string;
export declare function unsourcedStatsLine(stats: UnsourcedStats): string;
export declare function isAutoApplicable(f: UnsourcedFinding): boolean;
export declare function countAutoApplicable(findings: UnsourcedFinding[]): number;
