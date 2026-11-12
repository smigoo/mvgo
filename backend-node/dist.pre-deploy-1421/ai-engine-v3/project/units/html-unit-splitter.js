"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitHtmlUnits = splitHtmlUnits;
const crypto_1 = require("crypto");
const unit_contract_1 = require("./unit-contract");
const unit_naming_1 = require("./unit-naming");
function pageTailSegs(rel) {
    const noExt = String(rel ?? '').replace(/\.[^./\\]+$/, '');
    const segs = noExt.split(/[\\/]+/).filter(Boolean);
    return segs.length && /^html$/i.test(segs[0]) ? segs.slice(1) : segs;
}
function pageName(rel) {
    const tail = pageTailSegs(rel);
    return tail.slice(-2).join(' / ') || String(rel ?? '');
}
function pageFolder(rel) {
    return pageTailSegs(rel).slice(0, -1).join('/');
}
function pageSlug(rel) {
    const noExt = String(rel).replace(/\.[^./\\]+$/, '');
    const segs = noExt.split(/[\\/]+/).filter(Boolean);
    const tail = segs.length && /^html$/i.test(segs[0]) ? segs.slice(1) : segs;
    const ascii = (0, unit_naming_1.slug)(tail.join('-')) || 'p';
    const h = (0, crypto_1.createHash)('sha1').update(String(rel).replace(/\\/g, '/')).digest('hex').slice(0, 8);
    return `${ascii}-${h}`;
}
function splitHtmlUnits(p) {
    const builtAt = new Date().toISOString();
    const features = Array.isArray(p?.features) ? p.features : [];
    const pages = [...new Set((p?.pages ?? []).map((s) => String(s ?? '').trim()).filter(Boolean))].sort();
    const units = pages.map((rel) => {
        const name = pageName(rel);
        return {
            componentId: `u-html-${pageSlug(rel)}`,
            name,
            sourceType: 'html',
            anchor: { pagePath: rel },
            box: { width: null, height: null },
            tier: (0, unit_contract_1.deriveUnitTier)('html'),
            status: 'pending',
            feature: (0, unit_naming_1.attributeFeature)(name, pageFolder(rel), features),
            note: 'HTML 原型页整体（非 Figma 分支）',
        };
    });
    units.sort((a, b) => (a.componentId < b.componentId ? -1 : a.componentId > b.componentId ? 1 : 0));
    p?.onLog?.({ runId: p.runId, mode: 'html-split', pages: pages.length, units: units.length });
    return {
        version: unit_contract_1.UNIT_CONTRACT_VERSION,
        runId: p.runId,
        builtAt,
        source: {
            kind: 'html',
            figmaUrl: null,
            figmaFileKey: null,
            figmaNodeId: null,
            inputKey: p.inputKey,
        },
        degraded: null,
        units,
        stats: (0, unit_contract_1.computeUnitStats)(units, features),
    };
}
//# sourceMappingURL=html-unit-splitter.js.map