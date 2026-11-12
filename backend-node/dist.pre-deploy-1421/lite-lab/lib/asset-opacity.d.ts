export interface AssetOpacityInfo {
    meanAlpha: number;
    meanLum: number;
    visibleRatio: number;
}
export declare const OPAQUE_BG_ALPHA = 180;
export declare function readPngStats(filePath: string): AssetOpacityInfo | undefined;
export declare function readPngStatsMap(dir: string, fileNames: string[]): Record<string, AssetOpacityInfo>;
