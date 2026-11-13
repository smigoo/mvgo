"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveExecutionFigmaTokenWithProbe = resolveExecutionFigmaTokenWithProbe;
const figma_credential_ref_1 = require("./figma-credential-ref");
const figma_token_projection_1 = require("./figma-token-projection");
const figma_access_diagnosis_1 = require("../lite/figma-access-diagnosis");
const NEEDS_PROBE = new Set([
    'not-found',
    'slot-overwritten',
    'fingerprint-unusable',
    'no-slots',
]);
const asTrimmedString = (value) => typeof value === 'string' ? value.trim() : '';
function resolveProbeTarget(input) {
    return {
        fileKey: asTrimmedString(input.fileKey),
        nodeId: asTrimmedString(input.nodeId),
    };
}
function describeProbeStatus(trace) {
    if (trace.status === 200) {
        return trace.nodeFound ? '200（节点存在）' : '200（但响应里没有该节点）';
    }
    if (trace.status === null)
        return '请求失败/超时';
    return `HTTP ${trace.status}`;
}
function nonSlotLabel(source) {
    if (source === 'env')
        return '环境变量 FIGMA_ACCESS_TOKEN';
    if (source === 'request')
        return '本次请求携带的 Token';
    return '当前生效的 Token';
}
function orderProbeCandidates(input, baseToken, baseSource) {
    const config = input.activeConfig || {};
    const slots = (0, figma_token_projection_1.normalizeFigmaTokenSlots)(config.figmaTokens).slice(0, 2);
    const active = (0, figma_token_projection_1.pickActiveFigmaTokenSlot)(config, slots);
    const ordered = active ? [active, ...slots.filter((s) => s.id !== active.id)] : slots;
    const usableToken = (value) => {
        const v = asTrimmedString(value);
        return !v || (0, figma_credential_ref_1.isRedactedPlaceholder)(v) ? '' : v;
    };
    const list = ordered.map((slot) => {
        const index = slots.indexOf(slot);
        return {
            slotId: slot.id,
            slotLabel: (0, figma_access_diagnosis_1.figmaTokenSlotLabel)(slot, index < 0 ? 0 : index),
            token: usableToken(slot.token),
        };
    });
    if (!list.length) {
        for (const candidate of (0, figma_credential_ref_1.listFigmaCredentialCandidates)(config)) {
            if (candidate.slotId === null) {
                list.push({
                    slotId: null,
                    slotLabel: candidate.slotName || '主 Token',
                    token: usableToken(candidate.token),
                });
            }
        }
    }
    const envToken = usableToken(input.envToken);
    if (envToken && envToken !== baseToken) {
        list.push({ slotId: null, slotLabel: '环境变量 FIGMA_ACCESS_TOKEN', token: envToken });
    }
    const baseValue = usableToken(baseToken);
    const out = [];
    if (baseValue) {
        const at = list.findIndex((item) => item.token === baseValue);
        const head = at >= 0
            ? list[at]
            : { slotId: null, slotLabel: nonSlotLabel(baseSource), token: baseValue };
        out.push({ ...head, isBaseToken: true });
    }
    const seen = new Set(out.map((item) => item.token));
    for (const item of list) {
        const value = asTrimmedString(item.token);
        if (!value || seen.has(value))
            continue;
        seen.add(value);
        out.push({ ...item, token: value, isBaseToken: value === baseValue });
    }
    return out.filter((item) => !!item.token);
}
async function resolveExecutionFigmaTokenWithProbe(input = {}) {
    const base = (0, figma_credential_ref_1.resolveExecutionFigmaToken)(input);
    const untouched = (extra) => ({
        ...base,
        probes: [],
        ...(extra || {}),
    });
    if (base.source === 'ref' && !input.forceProbe)
        return untouched();
    if (!NEEDS_PROBE.has(String(base.reason)) && !input.forceProbe)
        return untouched();
    if (input.disableProbe)
        return untouched();
    const reason = base.reason;
    const reasonText = input.forceProbe && String(base.reason) === 'matched'
        ? `任务记录的 Figma Token（${asTrimmedString(base.ref?.slotName) || asTrimmedString(base.ref?.slotId) || '当前凭证'}）已被证实读不到该文件（HTTP 404）`
        : (0, figma_credential_ref_1.describeFigmaCredentialReason)(reason, base.ref, base.overwrittenSlotId);
    const { fileKey, nodeId } = resolveProbeTarget(input);
    if (!fileKey || !nodeId) {
        return untouched({
            reason: 'probe-unavailable',
            note: `${reasonText}；本次拿不到 fileKey/nodeId（${!fileKey ? '缺 fileKey' : '缺 nodeId'}），` +
                `无法逐槽探测该文件，按当前凭证执行`,
        });
    }
    const candidates = orderProbeCandidates(input, base.token, base.source);
    if (!candidates.length) {
        return untouched();
    }
    const probe = input.probe || (0, figma_access_diagnosis_1.createFigmaNodeProber)({ timeoutMs: input.probeTimeoutMs });
    const probes = [];
    for (const candidate of candidates) {
        let result = { status: null, nodeFound: false };
        try {
            result = await probe(candidate.token, fileKey, nodeId);
        }
        catch {
            result = { status: null, nodeFound: false };
        }
        const trace = {
            slotId: candidate.slotId,
            slotLabel: candidate.slotLabel,
            status: result.status,
            nodeFound: result.nodeFound,
            isBaseToken: candidate.isBaseToken,
        };
        probes.push(trace);
        if (result.status !== 200)
            continue;
        return {
            token: candidate.token,
            source: candidate.isBaseToken ? base.source : 'probe',
            reason: 'probe-selected',
            ref: base.ref,
            refSource: base.refSource,
            requestOverridden: base.requestOverridden,
            note: candidate.isBaseToken
                ? `${reasonText}；已探测确认 Token「${candidate.slotLabel}」可读取该文件（fileKey ${fileKey}，节点 ${nodeId}），沿用该 Token 执行`
                : `${reasonText}；逐槽探测发现 Token「${candidate.slotLabel}」可读取该文件（fileKey ${fileKey}，节点 ${nodeId}），本次已改用该 Token 执行（不修改你的配置）`,
            refFields: null,
            probes,
        };
    }
    const summary = probes
        .map((t) => `${t.slotLabel}=${describeProbeStatus(t)}`)
        .join('，');
    return {
        token: null,
        source: 'none',
        reason: 'probe-failed',
        ref: base.ref,
        refSource: base.refSource,
        requestOverridden: base.requestOverridden,
        note: `${reasonText}；已对 ${probes.length} 个 Figma Token 逐个探测该文件` +
            `（fileKey ${fileKey}，节点 ${nodeId}），全部读不到：${summary}。` +
            `Figma 对「无权限」的文件同样返回 404（不是 403），所以这并不证明文件已被删除。` +
            `请先在 Figma 里把该文件分享给这些 Token 所属的账号，或到「设置 → Figma Token」` +
            `换一个能读取该文件的 Token 后重试`,
        refFields: null,
        probes,
    };
}
//# sourceMappingURL=figma-execution-token-probe.js.map