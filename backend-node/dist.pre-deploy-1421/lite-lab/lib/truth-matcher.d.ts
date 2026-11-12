export interface FigmaTextTruth {
    nodeId: string;
    characters: string;
    fontSize?: number;
    color?: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
}
export interface FigmaAssetTruth {
    nodeId: string;
    name: string;
    imageRef?: string;
    fileName?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    siblingTexts?: string[];
    parentTexts?: string[];
    parentId?: string;
    containerLevel?: boolean;
    parentBox?: {
        width: number;
        height: number;
    };
    nearbyTexts?: string[];
    parentFill?: {
        color: string;
        opacity: number;
    } | null;
}
export interface TruthInventory {
    texts: FigmaTextTruth[];
    assets: FigmaAssetTruth[];
    containerCount: number;
    containers: FigmaContainerTruth[];
    fillRects: FigmaFillRectTruth[];
}
export interface FigmaFillRectTruth {
    nodeId: string;
    name: string;
    bbox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    color?: string;
    gradient?: string;
    coveredTexts: string[];
}
export interface FigmaContainerTruth {
    nodeId: string;
    name: string;
    color: string;
    childTexts: string[];
}
export interface BackfillEdit {
    tag: string;
    anchorText: string;
    figmaNodeId: string;
    matchType: 'exact' | 'substr';
    applied: Record<string, string>;
    beforeStyle: string | null;
    _pos?: number;
    _oldLen?: number;
    _newOpenTag?: string;
}
export interface FileBackfillResult {
    path: string;
    changed: boolean;
    edits: BackfillEdit[];
    content: string;
}
export interface BackfillOptions {
    applyColor?: boolean;
    applyFontSize?: boolean;
    applySizes?: boolean;
}
export interface BackfillStats {
    evaluated: number;
    shortSkipped: number;
    interpSkipped: number;
    exact: number;
    substr: number;
    miss: number;
    colorApplied: number;
    fontSizeApplied: number;
    sizeApplied: number;
}
export interface BackfillResult {
    files: FileBackfillResult[];
    stats: BackfillStats;
}
export declare function normalizeAnchorText(s: string): string;
export declare function gradientFillToCss(node: any): string | undefined;
export declare function findParentFillById(root: any, nodeId: string): {
    color: string;
    opacity: number;
} | null | undefined;
export declare function subtreeTextsOf(root: any): string[];
export declare function collectAncestorTexts(root: any, nodeId: string, opts?: {
    hops?: number;
    cap?: number;
}): string[];
export interface AssetParentMeta {
    parentId?: string;
    parentBox?: {
        width: number;
        height: number;
    };
    containerLevel: boolean;
    parentTexts: string[];
}
export declare function collectAssetParentMeta(root: any, nodeId: string, opts?: {
    tolPx?: number;
}): AssetParentMeta;
export declare function collectFigmaTruth(root: any): TruthInventory;
export declare function findNodeIdBySuffix(root: any, suffix: string): string | undefined;
export declare function findNodeById(root: any, id: string): any | undefined;
export declare function buildNodeTextContext(root: any): Map<string, string[]>;
export declare function buildImageRefIndex(root: any): Map<string, string>;
export declare function extractTemplateRange(content: string): {
    start: number;
    end: number;
};
export declare function backfillSfcFiles(files: Array<{
    path: string;
    content: string;
}>, truth: TruthInventory, options?: BackfillOptions): BackfillResult;
export interface AssetMountStats {
    assetsTotal: number;
    uniqueImageRefs: number;
    mounted: number;
    noSiblingTexts: number;
    noAnchor: number;
    noFile: number;
    svgReplaced: number;
    dataUriReplaced: number;
    iconClassReplaced: number;
    emptyIconVarsReplaced: number;
    emptyIconFieldsReplaced: number;
    emptyObjPropsReplaced: number;
    staticSrcRewritten?: number;
    newElementInserted: number;
    newElSkipNoAnchor: number;
    newElSkipAmbiguous: number;
    svgSkipped: number;
    bgAnchored: number;
    bgSkipNoClass: number;
    bgSkipAmbiguous: number;
    bgSkipNoBgKey: number;
    bgSkipAlreadyUrl: number;
    sizeRestored: number;
    containerSizeFixed: number;
    parentBoxRelaxed: number;
}
export interface AssetMountResult {
    files: FileBackfillResult[];
    stats: AssetMountStats;
}
export declare function importDepthFor(path: string): string;
export declare function mountAssetIcons(files: Array<{
    path: string;
    content: string;
}>, assets: FigmaAssetTruth[]): AssetMountResult;
export declare function bgFileNameCore(fileName: unknown): string;
export interface CssStyleRule {
    bodyStart: number;
    bodyEnd: number;
    selNorm: string;
}
export declare function collectStyleRulesFromContent(content: string): CssStyleRule[];
export interface BgAiCandidate {
    fileName: string;
    label: string;
}
export interface BgAiStats {
    candidates: number;
    structCandidates?: number;
    structOverrides?: number;
    anchored: number;
    skipNoLabelHit: number;
    skipNoClass: number;
    skipClassAmbiguous: number;
    skipNoRule: number;
    skipRuleAmbiguous: number;
    skipNoBgKey: number;
    skipAlreadyUrl: number;
    errors: number;
    totalTokens: number;
}
export interface BgAiResult {
    files: FileBackfillResult[];
    stats: BgAiStats;
}
export declare function aiAnchorBackgroundAssets(files: Array<{
    path: string;
    content: string;
}>, candidates: BgAiCandidate[]): BgAiResult;
export interface TplTreeNode {
    tag: string;
    attrs: string;
    start: number;
    afterOpen: number;
    end: number;
    ownText: string;
    parent: TplTreeNode | null;
    selfClosed: boolean;
}
export declare function parseTemplateTree(content: string): {
    root: TplTreeNode;
    nodes: TplTreeNode[];
};
export interface ContainerFillStats {
    wrapTransparentized: number;
    wrapColorFixed: number;
    containerColorFixed: number;
    skipNoRule: number;
    skipAmbiguous: number;
    skipUrlOrGradient: number;
    skipSameColor: number;
    wrapGroupsEvaluated: number;
    containerRulesEvaluated: number;
}
export interface ContainerFillResult {
    files: FileBackfillResult[];
    stats: ContainerFillStats;
}
export declare function classMatchesSelector(selNorm: string, cls: string): boolean;
export declare function backfillContainerFill(files: Array<{
    path: string;
    content: string;
}>, truth: TruthInventory): ContainerFillResult;
export declare function byVisualOrder<T extends {
    x?: number;
    y?: number;
}>(arr: T[]): T[];
export type AssetClass = 'bg' | 'strip' | 'icon' | 'decor';
export declare const STRIP_MIN_WIDTH_PX = 120;
export declare function classifyAsset(a: FigmaAssetTruth): AssetClass;
export declare function isBgClassAsset(a: FigmaAssetTruth): boolean;
export declare function isIconClassAsset(a: FigmaAssetTruth): boolean;
export interface ScriptTruthStats {
    xAxisBackfilled: number;
    yAxisBackfilled: number;
    markLineBackfilled: number;
    scriptColorApplied: number;
    scriptFontSizeApplied: number;
    scriptSkipped: number;
}
export interface ScriptTruthResult {
    files: FileBackfillResult[];
    stats: ScriptTruthStats;
}
export declare function backfillScriptOptionTruth(files: Array<{
    path: string;
    content: string;
    changed?: boolean;
    edits?: any[];
}>, truth: TruthInventory): ScriptTruthResult;
export interface PanelTitleStats {
    panels: number;
    titleRelocated: number;
    skipNoTitle: number;
}
export interface PanelTitleResult {
    files: Array<{
        path: string;
        content: string;
        changed: boolean;
    }>;
    stats: PanelTitleStats;
}
export declare function relocatePanelTitle(files: Array<{
    path: string;
    content: string;
}>, displayName: string): PanelTitleResult;
export interface RootContentBgStats {
    panels: number;
    rootClasses: number;
    cleared: number;
    skipAlreadyTransparent: number;
    skipNoBackground: number;
    skipNoRootClass: number;
}
export interface RootContentBgResult {
    files: Array<{
        path: string;
        content: string;
        changed: boolean;
        edits: Array<{
            desc: string;
        }>;
    }>;
    stats: RootContentBgStats;
}
export declare function clearRootContentBackground(files: Array<{
    path: string;
    content: string;
}>): RootContentBgResult;
