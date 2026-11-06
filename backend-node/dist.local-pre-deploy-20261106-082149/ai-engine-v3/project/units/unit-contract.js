"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNIT_INPUT_KEY_NONE = exports.CACHEABLE_DEGRADED_CODES = exports.DEGRADED_FIGMA_FETCH_FAILED = exports.DEGRADED_NO_CP_COMPONENT = exports.DEGRADED_BAD_FIGMA_URL = exports.DEGRADED_NO_FIGMA_TOKEN = exports.DEGRADED_NO_FIGMA_LINK = exports.UNIT_SOURCE_KINDS = exports.UNIT_STATUSES = exports.UNIT_TIERS = exports.UNIT_SOURCE_TYPES = exports.UNIT_CONTRACT_VERSION = void 0;
exports.isCacheableDegraded = isCacheableDegraded;
exports.unitInputKeyFigma = unitInputKeyFigma;
exports.unitInputKeyHtml = unitInputKeyHtml;
exports.deriveUnitTier = deriveUnitTier;
exports.validateUnitContract = validateUnitContract;
exports.computeUnitStats = computeUnitStats;
const crypto_1 = require("crypto");
exports.UNIT_CONTRACT_VERSION = 'unit.v2';
exports.UNIT_SOURCE_TYPES = ['figma', 'screenshot', 'html'];
exports.UNIT_TIERS = ['lite', 'max'];
exports.UNIT_STATUSES = ['pending', 'running', 'done', 'failed'];
exports.UNIT_SOURCE_KINDS = ['figma', 'html', 'screenshot', 'none'];
exports.DEGRADED_NO_FIGMA_LINK = 'NO_FIGMA_LINK';
exports.DEGRADED_NO_FIGMA_TOKEN = 'NO_FIGMA_TOKEN';
exports.DEGRADED_BAD_FIGMA_URL = 'BAD_FIGMA_URL';
exports.DEGRADED_NO_CP_COMPONENT = 'NO_CP_COMPONENT';
exports.DEGRADED_FIGMA_FETCH_FAILED = 'FIGMA_FETCH_FAILED';
exports.CACHEABLE_DEGRADED_CODES = [
    exports.DEGRADED_NO_FIGMA_LINK,
    exports.DEGRADED_NO_FIGMA_TOKEN,
    exports.DEGRADED_BAD_FIGMA_URL,
    exports.DEGRADED_NO_CP_COMPONENT,
];
function isCacheableDegraded(code) {
    return !!code && exports.CACHEABLE_DEGRADED_CODES.includes(code);
}
exports.UNIT_INPUT_KEY_NONE = 'none:';
function unitInputKeyFigma(figmaUrl) {
    return `figma:${figmaUrl}`;
}
function unitInputKeyHtml(pageRels) {
    const sorted = [...new Set([...pageRels].map((s) => String(s ?? '').trim()).filter(Boolean))].sort();
    const h = (0, crypto_1.createHash)('sha1').update(sorted.join('\n')).digest('hex').slice(0, 12);
    return `html:${h}`;
}
function deriveUnitTier(sourceType) {
    return sourceType === 'figma' ? 'max' : 'lite';
}
function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}
function isNumOrNull(v) {
    return v === null || (typeof v === 'number' && Number.isFinite(v));
}
function validateUnitContract(obj) {
    const errs = [];
    if (!obj || typeof obj !== 'object')
        return ['contract 必须是对象'];
    if (obj.version !== exports.UNIT_CONTRACT_VERSION) {
        errs.push(`version 必须是 ${exports.UNIT_CONTRACT_VERSION}，实际 ${JSON.stringify(obj.version)}`);
    }
    if (!isNonEmptyString(obj.runId))
        errs.push('runId 必须是非空字符串');
    if (!isNonEmptyString(obj.builtAt) || Number.isNaN(Date.parse(obj.builtAt))) {
        errs.push(`builtAt 必须是可解析的时间字符串，实际 ${JSON.stringify(obj.builtAt)}`);
    }
    if (!obj.source || typeof obj.source !== 'object') {
        errs.push('source 必须是对象');
    }
    else {
        if (!exports.UNIT_SOURCE_KINDS.includes(obj.source.kind)) {
            errs.push(`source.kind 必须是 ${exports.UNIT_SOURCE_KINDS.join('|')}，实际 ${JSON.stringify(obj.source.kind)}`);
        }
        if (!isNonEmptyString(obj.source.inputKey)) {
            errs.push('source.inputKey 必须是非空字符串（缓存一致性门的唯一判据）');
        }
    }
    if (!Array.isArray(obj.units)) {
        errs.push('units 必须是数组');
        return errs;
    }
    if (obj.degraded !== null && obj.degraded !== undefined) {
        if (typeof obj.degraded !== 'object') {
            errs.push('degraded 必须是 null 或对象');
        }
        else {
            if (!isNonEmptyString(obj.degraded.code))
                errs.push('degraded.code 必须是非空字符串');
            if (!isNonEmptyString(obj.degraded.message)) {
                errs.push('degraded.message 必须是非空字符串');
            }
        }
    }
    if (!obj.stats || typeof obj.stats !== 'object') {
        errs.push('stats 必须是对象');
    }
    else {
        if (typeof obj.stats.total !== 'number') {
            errs.push('stats.total 必须是数字');
        }
        else if (obj.stats.total !== obj.units.length) {
            errs.push(`stats.total=${obj.stats.total} 与 units.length=${obj.units.length} 不一致`);
        }
        if (typeof obj.stats.unmatched !== 'number')
            errs.push('stats.unmatched 必须是数字');
        if (!obj.stats.bySource || typeof obj.stats.bySource !== 'object') {
            errs.push('stats.bySource 必须是对象');
        }
        if (!obj.stats.byTier || typeof obj.stats.byTier !== 'object') {
            errs.push('stats.byTier 必须是对象');
        }
    }
    const seen = new Set();
    obj.units.forEach((u, i) => {
        const at = `units[${i}]`;
        if (!isNonEmptyString(u?.componentId)) {
            errs.push(`${at}.componentId 必须是非空字符串`);
        }
        else {
            if (seen.has(u.componentId))
                errs.push(`${at}.componentId 重复：${u.componentId}`);
            seen.add(u.componentId);
        }
        if (!isNonEmptyString(u?.name))
            errs.push(`${at}.name 必须是非空字符串`);
        if (!exports.UNIT_SOURCE_TYPES.includes(u?.sourceType)) {
            errs.push(`${at}.sourceType 必须是 ${exports.UNIT_SOURCE_TYPES.join('|')}`);
        }
        if (!exports.UNIT_TIERS.includes(u?.tier)) {
            errs.push(`${at}.tier 必须是 ${exports.UNIT_TIERS.join('|')}`);
        }
        else if (exports.UNIT_SOURCE_TYPES.includes(u?.sourceType) && u.tier !== deriveUnitTier(u.sourceType)) {
            errs.push(`${at}.tier=${u.tier} 与 deriveUnitTier(${u.sourceType})=${deriveUnitTier(u.sourceType)} 不符`);
        }
        if (!exports.UNIT_STATUSES.includes(u?.status)) {
            errs.push(`${at}.status 必须是 ${exports.UNIT_STATUSES.join('|')}`);
        }
        if (!u?.anchor || typeof u.anchor !== 'object') {
            errs.push(`${at}.anchor 必须是对象`);
        }
        else if (!isNonEmptyString(u.anchor.figmaNodeId) &&
            !isNonEmptyString(u.anchor.pagePath) &&
            !isNonEmptyString(u.anchor.selector) &&
            !isNonEmptyString(u.anchor.shotPath)) {
            errs.push(`${at}.anchor 至少要有一个锚点（figmaNodeId / pagePath / selector / shotPath）`);
        }
        if (!u?.box || typeof u.box !== 'object') {
            errs.push(`${at}.box 必须是对象`);
        }
        else if (!isNumOrNull(u.box.width) || !isNumOrNull(u.box.height)) {
            errs.push(`${at}.box.width/height 必须是数字或 null`);
        }
        if (u?.feature !== null && u?.feature !== undefined && typeof u.feature !== 'string') {
            errs.push(`${at}.feature 必须是字符串或 null`);
        }
    });
    return errs;
}
function computeUnitStats(units, features = []) {
    const bySource = {};
    const byTier = {};
    let unmatched = 0;
    for (const u of units) {
        bySource[u.sourceType] = (bySource[u.sourceType] || 0) + 1;
        byTier[u.tier] = (byTier[u.tier] || 0) + 1;
        if (!u.feature || (features.length && !features.includes(u.feature)))
            unmatched += 1;
    }
    return { total: units.length, bySource, byTier, unmatched };
}
//# sourceMappingURL=unit-contract.js.map