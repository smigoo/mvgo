"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFedAssetFileName = isFedAssetFileName;
exports.trailingNumericSuffix = trailingNumericSuffix;
exports.resolveFeedNodeId = resolveFeedNodeId;
function isFedAssetFileName(fileName) {
    return /^(?:icon|bg|g)-/.test(fileName);
}
function trailingNumericSuffix(fileName) {
    const m = fileName.match(/(\d+)\.\w+$/);
    return m ? m[1] : undefined;
}
function resolveFeedNodeId(a, isKnownNode, idBySuffix) {
    const fileName = String(a.localPath ?? '').split('/').pop() ?? '';
    if (!isFedAssetFileName(fileName))
        return undefined;
    const refId = String(a.ref ?? '');
    if (refId && isKnownNode(refId))
        return refId;
    const suffix = trailingNumericSuffix(fileName);
    if (!suffix)
        return undefined;
    const bySuffix = idBySuffix(suffix);
    return bySuffix && isKnownNode(bySuffix) ? bySuffix : undefined;
}
//# sourceMappingURL=asset-feed.js.map