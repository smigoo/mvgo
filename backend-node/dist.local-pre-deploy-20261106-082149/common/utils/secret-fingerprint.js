"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskSecretFingerprint = maskSecretFingerprint;
function maskSecretFingerprint(value) {
    if (!value || typeof value !== 'string' || !value.trim())
        return null;
    const v = value.trim();
    if (v.length <= 8)
        return '****';
    return `${v.slice(0, 6)}****${v.slice(-4)}`;
}
//# sourceMappingURL=secret-fingerprint.js.map