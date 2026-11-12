"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIGMA_CREDENTIAL_REF_FIELDS = void 0;
exports.isFigmaFingerprintUsable = isFigmaFingerprintUsable;
exports.listFigmaCredentialCandidates = listFigmaCredentialCandidates;
exports.buildFigmaCredentialRefForToken = buildFigmaCredentialRefForToken;
exports.buildFigmaCredentialRef = buildFigmaCredentialRef;
exports.toFigmaCredentialRefFields = toFigmaCredentialRefFields;
exports.readFigmaCredentialRef = readFigmaCredentialRef;
exports.readTaskFigmaCredentialRef = readTaskFigmaCredentialRef;
exports.resolveFigmaTokenByRef = resolveFigmaTokenByRef;
exports.assessFigmaCredentialDrift = assessFigmaCredentialDrift;
exports.isRedactedPlaceholder = isRedactedPlaceholder;
exports.describeFigmaCredentialReason = describeFigmaCredentialReason;
exports.resolveExecutionFigmaToken = resolveExecutionFigmaToken;
const redact_1 = require("../common/utils/redact");
const secret_fingerprint_1 = require("../common/utils/secret-fingerprint");
const figma_token_projection_1 = require("./figma-token-projection");
exports.FIGMA_CREDENTIAL_REF_FIELDS = {
    fp: 'figmaCredentialFp',
    slotId: 'figmaCredentialSlotId',
    slotName: 'figmaCredentialSlotName',
};
const DEGENERATE_FINGERPRINT = '****';
const asTrimmedString = (value) => typeof value === 'string' ? value.trim() : '';
function isFigmaFingerprintUsable(fp) {
    const v = asTrimmedString(fp);
    return !!v && v !== DEGENERATE_FINGERPRINT;
}
function listFigmaCredentialCandidates(config) {
    if (!config || typeof config !== 'object')
        return [];
    const slots = (0, figma_token_projection_1.normalizeFigmaTokenSlots)(config.figmaTokens);
    if (slots.length) {
        return slots.map((slot) => ({
            slotId: slot.id,
            slotName: asTrimmedString(slot.name) || null,
            token: slot.token.trim(),
        }));
    }
    const legacy = asTrimmedString(config.figmaToken);
    return legacy ? [{ slotId: null, slotName: null, token: legacy }] : [];
}
function buildFigmaCredentialRefForToken(token, config) {
    const value = asTrimmedString(token);
    if (!value)
        return null;
    const owner = listFigmaCredentialCandidates(config).find((candidate) => candidate.token === value);
    return {
        fp: (0, secret_fingerprint_1.maskSecretFingerprint)(value) || DEGENERATE_FINGERPRINT,
        slotId: owner?.slotId ?? null,
        slotName: owner?.slotName ?? null,
    };
}
function buildFigmaCredentialRef(config) {
    const candidates = listFigmaCredentialCandidates(config);
    if (!candidates.length)
        return null;
    const slots = (0, figma_token_projection_1.normalizeFigmaTokenSlots)(config?.figmaTokens);
    if (!slots.length)
        return buildFigmaCredentialRefForToken(candidates[0].token, config);
    const active = (0, figma_token_projection_1.pickActiveFigmaTokenSlot)(config, slots);
    const hit = candidates.find((c) => c.slotId === active?.id) || candidates[0];
    return buildFigmaCredentialRefForToken(hit.token, config);
}
function toFigmaCredentialRefFields(ref) {
    if (!ref || !asTrimmedString(ref.fp))
        return null;
    const out = {
        [exports.FIGMA_CREDENTIAL_REF_FIELDS.fp]: asTrimmedString(ref.fp),
    };
    const slotId = asTrimmedString(ref.slotId);
    if (slotId) {
        ;
        out[exports.FIGMA_CREDENTIAL_REF_FIELDS.slotId] = slotId;
    }
    const slotName = asTrimmedString(ref.slotName);
    if (slotName) {
        ;
        out[exports.FIGMA_CREDENTIAL_REF_FIELDS.slotName] = slotName;
    }
    return out;
}
function readFigmaCredentialRef(source) {
    if (!source || typeof source !== 'object')
        return null;
    const fp = asTrimmedString(source[exports.FIGMA_CREDENTIAL_REF_FIELDS.fp]);
    if (!fp)
        return null;
    return {
        fp,
        slotId: asTrimmedString(source[exports.FIGMA_CREDENTIAL_REF_FIELDS.slotId]) || null,
        slotName: asTrimmedString(source[exports.FIGMA_CREDENTIAL_REF_FIELDS.slotName]) || null,
    };
}
function readTaskFigmaCredentialRef(task) {
    if (!task || typeof task !== 'object') {
        return { ref: null, source: null };
    }
    const fromTask = readFigmaCredentialRef(task);
    if (fromTask)
        return { ref: fromTask, source: 'pipeline' };
    const fromSnapshot = readFigmaCredentialRef(task.configSnapshot);
    if (fromSnapshot)
        return { ref: fromSnapshot, source: 'create' };
    return { ref: null, source: null };
}
function resolveFigmaTokenByRef(ref, config) {
    const fp = asTrimmedString(ref?.fp);
    if (!ref || !fp) {
        return { token: null, slotId: null, slotName: null, reason: 'no-ref' };
    }
    if (!isFigmaFingerprintUsable(fp)) {
        return {
            token: null,
            slotId: null,
            slotName: null,
            reason: 'fingerprint-unusable',
        };
    }
    const candidates = listFigmaCredentialCandidates(config);
    if (!candidates.length) {
        return { token: null, slotId: null, slotName: null, reason: 'no-slots' };
    }
    const hit = candidates.find((c) => (0, secret_fingerprint_1.maskSecretFingerprint)(c.token) === fp);
    if (hit) {
        return {
            token: hit.token,
            slotId: hit.slotId,
            slotName: hit.slotName,
            reason: 'matched',
        };
    }
    const refSlotId = asTrimmedString(ref.slotId);
    if (refSlotId) {
        const sameSlot = candidates.find((c) => c.slotId === refSlotId);
        if (sameSlot) {
            return {
                token: null,
                slotId: null,
                slotName: null,
                reason: 'slot-overwritten',
                overwrittenSlotId: refSlotId,
            };
        }
    }
    return { token: null, slotId: null, slotName: null, reason: 'not-found' };
}
function assessFigmaCredentialDrift(task, currentConfig) {
    const { ref } = readTaskFigmaCredentialRef(task);
    if (!ref)
        return { hasRef: false, changed: undefined, reason: 'no-ref' };
    const resolution = resolveFigmaTokenByRef(ref, currentConfig);
    if (resolution.token)
        return { hasRef: true, changed: false, reason: 'matched' };
    if (resolution.reason === 'fingerprint-unusable') {
        return { hasRef: true, changed: undefined, reason: resolution.reason };
    }
    return { hasRef: true, changed: true, reason: resolution.reason };
}
function isRedactedPlaceholder(value) {
    return asTrimmedString(value) === redact_1.REDACTED_PLACEHOLDER;
}
function describeFigmaCredentialReason(reason, ref, overwrittenSlotId) {
    const slotLabel = asTrimmedString(ref?.slotName) || asTrimmedString(ref?.slotId);
    switch (reason) {
        case 'no-ref':
            return '任务未记录 Figma 凭证引用（首次生成或改造前的老任务）';
        case 'fingerprint-unusable':
            return '任务当时的 Figma Token 过短（指纹退化为 ****），无法安全比对';
        case 'no-slots':
            return '当前用户没有任何可用的 Figma Token';
        case 'slot-overwritten':
            return `Figma Token 槽位${overwrittenSlotId ? `「${overwrittenSlotId}」` : ''}已被改写，任务当时的那个已不存在`;
        case 'not-found':
        default:
            return slotLabel
                ? `任务当时的 Figma Token（槽位「${slotLabel}」）已不在配置中`
                : '任务当时的 Figma Token 已不在配置中';
    }
}
const asUsableToken = (value) => {
    const v = asTrimmedString(value);
    return !v || isRedactedPlaceholder(v) ? '' : v;
};
function resolveExecutionFigmaToken(input = {}) {
    const requestToken = asUsableToken(input.requestToken) || asUsableToken(input.requestConfig?.figmaToken);
    const fromTask = readTaskFigmaCredentialRef(input.task);
    const ref = fromTask.ref || readFigmaCredentialRef(input.requestConfig);
    const refSource = fromTask.ref ? fromTask.source : ref ? 'request' : null;
    let activeToken = asUsableToken(input.activeConfig?.figmaToken);
    if (!activeToken) {
        const candidates = listFigmaCredentialCandidates(input.activeConfig);
        activeToken = asUsableToken(candidates[0]?.token);
    }
    const envToken = asUsableToken(input.envToken);
    const fallback = (reason, note) => {
        const token = requestToken || activeToken || envToken || null;
        const source = requestToken
            ? 'request'
            : activeToken
                ? 'active'
                : envToken
                    ? 'env'
                    : 'none';
        return {
            token,
            source,
            reason,
            ref,
            refSource,
            requestOverridden: false,
            note,
            refFields: ref ? null : token ? toFigmaCredentialRefFields(buildFigmaCredentialRefForToken(token, input.activeConfig)) : null,
        };
    };
    if (!ref) {
        return fallback('no-ref', '任务无 Figma 凭证引用（首次生成或老任务），按当前凭证执行');
    }
    const resolution = resolveFigmaTokenByRef(ref, input.activeConfig);
    if (resolution.token) {
        return {
            token: resolution.token,
            source: 'ref',
            reason: 'matched',
            ref,
            refSource,
            requestOverridden: !!requestToken && requestToken !== resolution.token,
            note: `凭证引用命中${resolution.slotName ? `（槽位「${resolution.slotName}」）` : ''}：沿用任务当时的 Figma Token${requestToken && requestToken !== resolution.token ? '，已忽略请求回传的当前 token' : ''}`,
            refFields: null,
        };
    }
    const reasonText = describeFigmaCredentialReason(resolution.reason, ref, resolution.overwrittenSlotId);
    return {
        ...fallback(resolution.reason, `${reasonText}；本次已回落当前凭证执行（Figma 对无权限文件返回 404，若报「文件不存在」请核对凭证）`),
        overwrittenSlotId: resolution.overwrittenSlotId,
    };
}
//# sourceMappingURL=figma-credential-ref.js.map