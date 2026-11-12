"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPAQUE_BG_ALPHA = void 0;
exports.readPngStats = readPngStats;
exports.readPngStatsMap = readPngStatsMap;
const fs_1 = require("fs");
const pngjs_1 = require("pngjs");
exports.OPAQUE_BG_ALPHA = 180;
function readPngStats(filePath) {
    try {
        const png = pngjs_1.PNG.sync.read((0, fs_1.readFileSync)(filePath));
        const { width, height, data } = png;
        const total = width * height;
        if (!total)
            return undefined;
        let sumA = 0;
        let visible = 0;
        let sumLum = 0;
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            sumA += a;
            if (a > 8) {
                visible += 1;
                sumLum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            }
        }
        return {
            meanAlpha: Math.round(sumA / total),
            meanLum: visible > 0 ? Math.round(sumLum / visible) : 0,
            visibleRatio: Math.round((visible / total) * 100) / 100,
        };
    }
    catch {
        return undefined;
    }
}
function readPngStatsMap(dir, fileNames) {
    const out = {};
    for (const n of fileNames) {
        if (!n)
            continue;
        const info = readPngStats(`${dir}/${n}`);
        if (info)
            out[n] = info;
    }
    return out;
}
//# sourceMappingURL=asset-opacity.js.map