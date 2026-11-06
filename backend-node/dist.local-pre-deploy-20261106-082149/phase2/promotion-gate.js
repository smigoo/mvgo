"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evalStructureGateForPromotion = evalStructureGateForPromotion;
function evalStructureGateForPromotion(genResult) {
    const r = genResult?.codeValidationResult;
    if (!r || typeof r !== 'object')
        return { blocked: false, blockCount: 0, reason: null };
    if (r._bypassed === true)
        return { blocked: false, blockCount: 0, reason: null };
    const issues = Array.isArray(r.issues) ? r.issues : [];
    const blockCount = typeof r.blockCount === 'number'
        ? r.blockCount
        : issues.filter((i) => i?.severity === 'BLOCK').length;
    if (blockCount <= 0)
        return { blocked: false, blockCount: 0, reason: null };
    const ids = issues
        .filter((i) => i?.severity === 'BLOCK')
        .map((i) => String(i?.id || '').trim())
        .filter(Boolean)
        .slice(0, 5);
    return {
        blocked: true,
        blockCount,
        reason: `结构校验存在 ${blockCount} 项阻断（${ids.join(', ') || 'BLOCK'}，L0-B 软失败降级），保留候选版本不晋升稳定版本`,
    };
}
//# sourceMappingURL=promotion-gate.js.map