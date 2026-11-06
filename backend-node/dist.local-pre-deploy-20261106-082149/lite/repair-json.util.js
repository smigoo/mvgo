"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repairJson = repairJson;
function repairJson(text) {
    if (!text || typeof text !== 'string')
        return null;
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    let raw = (fence ? fence[1] : text).trim();
    if (!raw)
        return null;
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first)
        raw = raw.slice(first, last + 1);
    raw = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
    raw = raw.replace(/,(\s*[}\]])/g, '$1');
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=repair-json.util.js.map