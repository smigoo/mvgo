export declare const UNIT_CONTRACT_VERSION = "unit.v2";
export type UnitSourceType = 'figma' | 'screenshot' | 'html';
export type UnitTier = 'lite' | 'max';
export type UnitStatus = 'pending' | 'running' | 'done' | 'failed';
export declare const UNIT_SOURCE_TYPES: UnitSourceType[];
export declare const UNIT_TIERS: UnitTier[];
export declare const UNIT_STATUSES: UnitStatus[];
export declare const UNIT_SOURCE_KINDS: string[];
export type UnitSourceKind = 'figma' | 'html' | 'screenshot' | 'none';
export interface UnitAnchor {
    figmaFileKey?: string | null;
    figmaNodeId?: string | null;
    pagePath?: string | null;
    selector?: string | null;
    shotPath?: string | null;
}
export interface UnitBox {
    width: number | null;
    height: number | null;
}
export interface ProjectUnit {
    componentId: string;
    name: string;
    sourceType: UnitSourceType;
    anchor: UnitAnchor;
    box: UnitBox;
    tier: UnitTier;
    status: UnitStatus;
    feature: string | null;
    note?: string;
}
export interface UnitDegraded {
    code: string;
    message: string;
}
export interface UnitContract {
    version: string;
    runId: string;
    builtAt: string;
    source: {
        kind: UnitSourceKind;
        figmaUrl: string | null;
        figmaFileKey: string | null;
        figmaNodeId: string | null;
        inputKey: string;
    };
    degraded: UnitDegraded | null;
    units: ProjectUnit[];
    stats: {
        total: number;
        bySource: Record<string, number>;
        byTier: Record<string, number>;
        unmatched: number;
    };
}
export declare const DEGRADED_NO_FIGMA_LINK = "NO_FIGMA_LINK";
export declare const DEGRADED_NO_FIGMA_TOKEN = "NO_FIGMA_TOKEN";
export declare const DEGRADED_BAD_FIGMA_URL = "BAD_FIGMA_URL";
export declare const DEGRADED_NO_CP_COMPONENT = "NO_CP_COMPONENT";
export declare const DEGRADED_FIGMA_FETCH_FAILED = "FIGMA_FETCH_FAILED";
export declare const CACHEABLE_DEGRADED_CODES: string[];
export declare function isCacheableDegraded(code: string | null | undefined): boolean;
export declare const UNIT_INPUT_KEY_NONE = "none:";
export declare function unitInputKeyFigma(figmaUrl: string): string;
export declare function unitInputKeyHtml(pageRels: Iterable<string>): string;
export declare function deriveUnitTier(sourceType: UnitSourceType): UnitTier;
export declare function validateUnitContract(obj: any): string[];
export declare function computeUnitStats(units: ProjectUnit[], features?: string[]): {
    total: number;
    bySource: Record<string, number>;
    byTier: Record<string, number>;
    unmatched: number;
};
