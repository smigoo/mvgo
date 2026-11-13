import { collectStyleRulesFromContent } from './truth-matcher';
export interface E2nProdNode {
    key: string;
    path: string;
    tag: string;
    classes: string[];
    start: number;
    end: number;
    parentKey?: string;
    ownStatic: string[];
    ownInterp: string[];
    ownInterpSingle: string[];
    renderTexts: string[];
    instanceTexts: string[];
    vforCount: number;
    instTextNodes: number;
    vforAlias?: string;
    vforList?: string;
}
export interface E2nSeed {
    figmaId: string;
    text: string;
    prodKey: string;
    how: 'text-exact' | 'text-partial';
    candidates: number;
}
export interface E2nNodeEdge {
    figmaId: string;
    figmaType: string;
    figmaName: string;
    prodKey: string;
    prodPath: string;
    classes: string[];
    how: 'subtree-set-equal' | 'vfor-unit' | 'fill-rect-cover';
    matched: number;
    instCount: number;
    unique: boolean;
}
export interface E2nMulti {
    figmaId: string;
    figmaName: string;
    prodKeys: string[];
}
export interface E2nMap {
    seeds: E2nSeed[];
    nodes: E2nNodeEdge[];
    multi: E2nMulti[];
    unmapped: Array<{
        figmaId?: string;
        prodKey?: string;
        reason: string;
    }>;
    prodNodes: E2nProdNode[];
    stats: {
        prodNodes: number;
        figmaTexts: number;
        seeds: number;
        ambiguousSeeds: number;
        partialSeeds: number;
        missSeeds: number;
        nodes: number;
        multi: number;
        depthResolved: number;
        figmaContainers: number;
    };
}
export interface BuildE2nOptions {
    files?: string[];
}
export declare function buildE2nMap(figmaRoot: any, prodFiles: Array<{
    path: string;
    content: string;
}>, opts?: BuildE2nOptions): E2nMap;
export declare function findE2nEdge(e2n: E2nMap, figmaId: string | undefined): E2nNodeEdge | undefined;
export declare function anchorByCoveredTexts(e2n: E2nMap, coveredTexts: string[]): E2nNodeEdge | undefined;
export interface BgE2nStats {
    candidates: number;
    anchored: number;
    inserted: number;
    mergedColor: number;
    replacedGradient: number;
    replacedColor: number;
    skipNoEdge: number;
    skipNoClass: number;
    skipNoRule: number;
    skipMultiClass: number;
    skipRuleAmbiguous: number;
    skipAlreadyUrl: number;
}
export interface BgE2nResult {
    files: Array<{
        path: string;
        changed: boolean;
        content: string;
        edits: Array<{
            desc: string;
        }>;
    }>;
    stats: BgE2nStats;
    anchoredAssets: Array<{
        fileName: string;
        figmaId: string;
        cls: string;
        how: 'insert' | 'merge-color' | 'replace-gradient' | 'replace-color' | 'value';
    }>;
}
export declare function selKeyOf(sel: string): string;
export interface StyleRuleIndex {
    files: Array<{
        path: string;
        content: string;
        rules: ReturnType<typeof collectStyleRulesFromContent>;
    }>;
}
export declare function buildStyleRuleIndex(files: Array<{
    path: string;
    content: string;
}>): StyleRuleIndex;
export interface ClassRuleHit {
    file: {
        path: string;
        content: string;
    };
    rule: ReturnType<typeof collectStyleRulesFromContent>[number];
}
export declare function findClassRuleHits(index: StyleRuleIndex, cls: string): ClassRuleHit[];
export declare function isSingleClassSelector(selNorm: string): boolean;
export declare function bgUrlFor(filePath: string, fileName: string): string;
export type BgDecl = {
    kind: 'background';
    value: string;
    isGradient: boolean;
    hasUrl: boolean;
    index: number;
    end: number;
    match: string;
} | {
    kind: 'background-color';
    value: string;
    index: number;
    end: number;
    match: string;
} | {
    kind: 'none';
};
export declare function readBgDecl(body: string): BgDecl;
export declare function mountBgByE2n(files: Array<{
    path: string;
    content: string;
}>, assets: Array<{
    nodeId: string;
    name: string;
    width?: number;
    height?: number;
    fileName?: string;
    parentId?: string;
    containerLevel?: boolean;
}>, e2n: E2nMap): BgE2nResult;
