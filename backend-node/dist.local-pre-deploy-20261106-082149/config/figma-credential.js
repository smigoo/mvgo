"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIGMA_CREDENTIAL_FP_FIELD = void 0;
exports.figmaCredentialFpFromValue = figmaCredentialFpFromValue;
exports.figmaCredentialFpFromConfig = figmaCredentialFpFromConfig;
const secret_fingerprint_1 = require("../common/utils/secret-fingerprint");
const figma_token_projection_1 = require("./figma-token-projection");
exports.FIGMA_CREDENTIAL_FP_FIELD = 'figmaCredentialFp';
function figmaCredentialFpFromValue(token) {
    return (0, secret_fingerprint_1.maskSecretFingerprint)(token);
}
function figmaCredentialFpFromConfig(config) {
    if (!config || typeof config !== 'object')
        return null;
    const slots = (0, figma_token_projection_1.normalizeFigmaTokenSlots)(config.figmaTokens);
    const active = slots.length ? (0, figma_token_projection_1.pickActiveFigmaTokenSlot)(config, slots) : null;
    const token = active?.token || (typeof config.figmaToken === 'string' ? config.figmaToken : '');
    return (0, secret_fingerprint_1.maskSecretFingerprint)(token);
}
//# sourceMappingURL=figma-credential.js.map