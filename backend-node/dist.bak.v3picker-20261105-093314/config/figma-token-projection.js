"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_FIGMA_TOKEN_SLOT_ID = exports.MAX_FIGMA_TOKENS = void 0;
exports.isUsableFigmaTokenSlot = isUsableFigmaTokenSlot;
exports.normalizeFigmaTokenSlots = normalizeFigmaTokenSlots;
exports.pickActiveFigmaTokenSlot = pickActiveFigmaTokenSlot;
exports.applyFigmaTokenProjection = applyFigmaTokenProjection;
exports.materializeFigmaTokenSlots = materializeFigmaTokenSlots;
exports.MAX_FIGMA_TOKENS = 2;
exports.LEGACY_FIGMA_TOKEN_SLOT_ID = 'figma-1';
const asTrimmedString = (value) => typeof value === 'string' ? value.trim() : '';
function isUsableFigmaTokenSlot(value) {
    const v = value;
    return (!!v &&
        typeof v === 'object' &&
        typeof v.token === 'string' &&
        v.token.trim().length > 0);
}
function normalizeFigmaTokenSlots(value) {
    if (!Array.isArray(value))
        return [];
    const seen = new Set();
    const out = [];
    for (const raw of value) {
        if (!isUsableFigmaTokenSlot(raw))
            continue;
        const id = asTrimmedString(raw.id);
        if (!id || seen.has(id))
            continue;
        seen.add(id);
        out.push({
            id,
            ...(asTrimmedString(raw.name) ? { name: asTrimmedString(raw.name) } : {}),
            token: raw.token.trim(),
        });
        if (out.length >= exports.MAX_FIGMA_TOKENS)
            break;
    }
    return out;
}
function pickActiveFigmaTokenSlot(config, slots) {
    if (!slots.length)
        return null;
    const activeId = asTrimmedString(config?.activeFigmaTokenId);
    return slots.find((s) => s.id === activeId) || slots[0];
}
function applyFigmaTokenProjection(config) {
    const cfg = { ...(config || {}) };
    const slots = normalizeFigmaTokenSlots(cfg.figmaTokens);
    if (!slots.length)
        return cfg;
    const active = pickActiveFigmaTokenSlot(cfg, slots);
    cfg.figmaTokens = slots;
    cfg.activeFigmaTokenId = active.id;
    cfg.figmaToken = active.token;
    return cfg;
}
function materializeFigmaTokenSlots(config) {
    const cfg = { ...(config || {}) };
    const rawList = Array.isArray(cfg.figmaTokens) ? cfg.figmaTokens : [];
    const seen = new Set();
    const slots = [];
    for (const raw of rawList) {
        if (!raw || typeof raw !== 'object')
            continue;
        const id = asTrimmedString(raw.id);
        if (!id || seen.has(id))
            continue;
        seen.add(id);
        slots.push({
            id,
            ...(asTrimmedString(raw.name) ? { name: asTrimmedString(raw.name) } : {}),
            token: typeof raw.token === 'string' ? raw.token : '',
        });
        if (slots.length >= exports.MAX_FIGMA_TOKENS)
            break;
    }
    if (!slots.length) {
        const legacy = asTrimmedString(cfg.figmaToken);
        cfg.figmaTokens = [
            { id: exports.LEGACY_FIGMA_TOKEN_SLOT_ID, name: legacy ? '主 Token' : '', token: legacy },
        ];
        cfg.activeFigmaTokenId = exports.LEGACY_FIGMA_TOKEN_SLOT_ID;
        return cfg;
    }
    cfg.figmaTokens = slots;
    const activeId = asTrimmedString(cfg.activeFigmaTokenId);
    cfg.activeFigmaTokenId = slots.some((s) => s.id === activeId)
        ? activeId
        : pickActiveFigmaTokenSlot({ ...cfg, activeFigmaTokenId: '' }, slots).id;
    return cfg;
}
//# sourceMappingURL=figma-token-projection.js.map