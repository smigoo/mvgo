"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTruthInventory = buildTruthInventory;
const truth_matcher_1 = require("./truth-matcher");
const asset_feed_1 = require("./asset-feed");
function buildTruthInventory(nodeData, downloadedAssets) {
    const truth = (0, truth_matcher_1.collectFigmaTruth)(nodeData);
    const feed = {
        downloaded: downloadedAssets.length,
        fed: 0,
        aligned: 0,
        unmatched: 0,
    };
    const imageRefIndex = (0, truth_matcher_1.buildImageRefIndex)(nodeData);
    for (const a of downloadedAssets) {
        if (!a.localPath)
            continue;
        const fileName = String(a.localPath).split('/').pop();
        const imgRef = imageRefIndex.get(String(a.ref));
        let hit = imgRef ? truth.assets.find((x) => x.imageRef === imgRef) : undefined;
        if (!hit)
            hit = truth.assets.find((x) => x.nodeId === a.ref);
        if (!hit && a.name)
            hit = truth.assets.find((x) => !x.fileName && x.name === a.name);
        if (hit && fileName) {
            hit.fileName = fileName;
            feed.aligned += 1;
        }
    }
    const textCtx = (0, truth_matcher_1.buildNodeTextContext)(nodeData);
    for (const a of downloadedAssets) {
        if (!a.localPath)
            continue;
        const fn = String(a.localPath).split('/').pop() ?? '';
        const nodeId = (0, asset_feed_1.resolveFeedNodeId)(a, (id) => !!(0, truth_matcher_1.findNodeById)(nodeData, id), (suffix) => (0, truth_matcher_1.findNodeIdBySuffix)(nodeData, suffix));
        if (!nodeId)
            continue;
        {
            const refImgRef = imageRefIndex.get(String(a.ref));
            if (refImgRef && truth.assets.some((x) => x.imageRef === refImgRef))
                continue;
        }
        if (truth.assets.some((x) => x.nodeId === nodeId))
            continue;
        const bbox = (0, truth_matcher_1.findNodeById)(nodeData, nodeId)?.absoluteBoundingBox;
        const pMeta = (0, truth_matcher_1.collectAssetParentMeta)(nodeData, nodeId);
        truth.assets.push({
            nodeId,
            name: String(a.name ?? fn),
            fileName: fn,
            siblingTexts: [],
            nearbyTexts: textCtx.get(nodeId) ?? [],
            width: bbox?.width,
            height: bbox?.height,
            ...(bbox ? { x: Math.round(bbox.x), y: Math.round(bbox.y) } : {}),
            parentFill: (0, truth_matcher_1.findParentFillById)(nodeData, nodeId) ?? null,
            ...(pMeta.parentTexts.length > 0 ? { parentTexts: pMeta.parentTexts } : {}),
            ...(pMeta.parentId ? { parentId: pMeta.parentId } : {}),
            containerLevel: pMeta.containerLevel,
        });
        feed.fed += 1;
    }
    feed.unmatched = truth.assets.filter((x) => !x.fileName).length;
    return { truth, feed };
}
//# sourceMappingURL=truth-inventory.js.map