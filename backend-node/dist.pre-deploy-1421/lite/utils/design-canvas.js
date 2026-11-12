"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RASTER_SCALE = exports.FIGMA_EXPORT_SCALE = void 0;
exports.normalizeRasterScale = normalizeRasterScale;
exports.resolveDesignCanvas = resolveDesignCanvas;
exports.isCanvasScaleConsistent = isCanvasScaleConsistent;
exports.FIGMA_EXPORT_SCALE = 1;
exports.DEFAULT_RASTER_SCALE = 1;
function normalizeRasterScale(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}
function resolveDesignCanvas(input) {
    const { sourceType, rasterWidth, rasterHeight } = input;
    const positive = (v) => Number.isFinite(Number(v)) && Number(v) > 0;
    if (sourceType === 'figma') {
        const scale = normalizeRasterScale(input.rasterScale, exports.FIGMA_EXPORT_SCALE);
        if (positive(input.previewWidth) && positive(input.previewHeight)) {
            return {
                width: Math.round(Number(input.previewWidth)),
                height: Math.round(Number(input.previewHeight)),
                rasterScale: scale,
                origin: 'preview',
            };
        }
        if (positive(input.logicalWidth) && positive(input.logicalHeight)) {
            return {
                width: Math.round(Number(input.logicalWidth)),
                height: Math.round(Number(input.logicalHeight)),
                rasterScale: scale,
                origin: 'figma-node',
            };
        }
        return {
            width: Math.round(rasterWidth / scale),
            height: Math.round(rasterHeight / scale),
            rasterScale: scale,
            origin: 'raster-scale',
        };
    }
    if (sourceType === 'html') {
        return {
            width: rasterWidth,
            height: rasterHeight,
            rasterScale: 1,
            origin: 'html-raster',
        };
    }
    const scale = normalizeRasterScale(input.rasterScale, exports.DEFAULT_RASTER_SCALE);
    return {
        width: Math.round(rasterWidth / scale),
        height: Math.round(rasterHeight / scale),
        rasterScale: scale,
        origin: 'raster-scale',
    };
}
function isCanvasScaleConsistent(canvas, rasterWidth, tolerance = 0.05) {
    if (!Number.isFinite(canvas.width) || canvas.width <= 0)
        return false;
    const observed = rasterWidth / canvas.width;
    return Math.abs(observed - canvas.rasterScale) <= tolerance;
}
//# sourceMappingURL=design-canvas.js.map