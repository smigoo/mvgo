export declare const FIGMA_EXPORT_SCALE = 1;
export declare const DEFAULT_RASTER_SCALE = 1;
export type DesignCanvasOrigin = 'preview' | 'figma-node' | 'raster-scale' | 'html-raster';
export interface DesignCanvas {
    width: number;
    height: number;
    rasterScale: number;
    origin: DesignCanvasOrigin;
}
export interface ResolveDesignCanvasInput {
    sourceType: string;
    rasterWidth: number;
    rasterHeight: number;
    previewWidth?: number | null;
    previewHeight?: number | null;
    logicalWidth?: number | null;
    logicalHeight?: number | null;
    rasterScale?: number | null;
}
export declare function normalizeRasterScale(value: unknown, fallback: number): number;
export declare function resolveDesignCanvas(input: ResolveDesignCanvasInput): DesignCanvas;
export declare function isCanvasScaleConsistent(canvas: Pick<DesignCanvas, 'width' | 'rasterScale'>, rasterWidth: number, tolerance?: number): boolean;
