"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slug = slug;
exports.attributeFeature = attributeFeature;
function slug(raw) {
    return String(raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}
function attributeFeature(unitName, folderName, features) {
    const n = String(unitName || '').toLowerCase().trim();
    const f = String(folderName || '').replace(/^c-/, '').toLowerCase().trim();
    const fJoined = f.replace(/-/g, '');
    for (const feat of features) {
        const x = String(feat || '').toLowerCase().trim();
        if (!x)
            continue;
        if (!n && !f)
            continue;
        if (n && (n.includes(x) || (x.length >= 2 && x.includes(n))))
            return feat;
        if (f && (f.includes(x) || (x.length >= 2 && x.includes(f))))
            return feat;
        if (fJoined && (fJoined.includes(x) || x.includes(fJoined)))
            return feat;
    }
    return null;
}
//# sourceMappingURL=unit-naming.js.map