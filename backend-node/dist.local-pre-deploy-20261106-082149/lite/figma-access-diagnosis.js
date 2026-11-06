"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIGMA_API_BASE = exports.FIGMA_PROBE_TIMEOUT_MS = void 0;
exports.isFigmaNotFoundError = isFigmaNotFoundError;
exports.figmaTokenSlotLabel = figmaTokenSlotLabel;
exports.createFigmaNodeProber = createFigmaNodeProber;
exports.createFigmaAccountResolver = createFigmaAccountResolver;
exports.diagnoseFigmaNotFoundAccess = diagnoseFigmaNotFoundAccess;
const figma_token_projection_1 = require("../config/figma-token-projection");
exports.FIGMA_PROBE_TIMEOUT_MS = 5_000;
exports.FIGMA_API_BASE = 'https://api.figma.com/v1';
function isFigmaNotFoundError(error) {
    return !!error && typeof error === 'object' && error.figStatus === 404;
}
function figmaTokenSlotLabel(slot, index) {
    const name = typeof slot?.name === 'string' ? slot.name.trim() : '';
    return name || `Token ${index + 1}`;
}
function createFigmaNodeProber(options = {}) {
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : exports.FIGMA_PROBE_TIMEOUT_MS;
    const baseUrl = (options.baseUrl || exports.FIGMA_API_BASE).replace(/\/+$/, '');
    return async (token, fileKey, nodeId) => {
        if (!token || !fileKey || !nodeId)
            return { status: null, nodeFound: false };
        const url = `${baseUrl}/files/${encodeURIComponent(fileKey)}/nodes` +
            `?ids=${encodeURIComponent(nodeId)}&depth=1`;
        try {
            const res = await fetch(url, {
                headers: { 'X-Figma-Token': token },
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (res.status !== 200) {
                try {
                    await res.text();
                }
                catch {
                }
                return { status: res.status, nodeFound: false };
            }
            const payload = await res.json();
            const nodes = payload?.nodes && typeof payload.nodes === 'object' ? payload.nodes : {};
            const apiNodeId = String(nodeId).replace(/:/g, '-');
            const nodeFound = !!nodes[apiNodeId] || !!nodes[String(nodeId)];
            return { status: 200, nodeFound };
        }
        catch {
            return { status: null, nodeFound: false };
        }
    };
}
function createFigmaAccountResolver(options = {}) {
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : exports.FIGMA_PROBE_TIMEOUT_MS;
    const baseUrl = (options.baseUrl || exports.FIGMA_API_BASE).replace(/\/+$/, '');
    return async (token) => {
        if (!token)
            return null;
        try {
            const res = await fetch(`${baseUrl}/me`, {
                headers: { 'X-Figma-Token': token },
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (res.status !== 200) {
                try {
                    await res.text();
                }
                catch {
                }
                return null;
            }
            const payload = await res.json();
            const handle = payload?.handle;
            return typeof handle === 'string' && handle.trim() ? handle.trim() : null;
        }
        catch {
            return null;
        }
    };
}
async function diagnoseFigmaNotFoundAccess(options) {
    const fileKey = String(options.fileKey || '');
    const nodeId = String(options.nodeId || '');
    const config = options.config || {};
    const probe = options.probe || createFigmaNodeProber();
    const resolveAccount = options.resolveAccount || createFigmaAccountResolver();
    const slots = (0, figma_token_projection_1.normalizeFigmaTokenSlots)(config.figmaTokens).slice(0, figma_token_projection_1.MAX_FIGMA_TOKENS);
    const active = (0, figma_token_projection_1.pickActiveFigmaTokenSlot)(config, slots);
    const activeIndex = active ? slots.findIndex((s) => s.id === active.id) : -1;
    const activeSlotId = active?.id || '';
    const activeSlotLabel = active
        ? figmaTokenSlotLabel(active, activeIndex < 0 ? 0 : activeIndex)
        :
            '主 Token';
    const others = slots.filter((s) => s.id !== activeSlotId);
    const probes = [];
    const candidateSlotIds = [];
    const candidateSlotLabels = [];
    const candidateAccounts = [];
    for (let i = 0; i < others.length; i += 1) {
        const slot = others[i];
        const label = figmaTokenSlotLabel(slot, slots.indexOf(slot));
        let result = { status: null, nodeFound: false };
        try {
            result = await probe(slot.token, fileKey, nodeId);
        }
        catch {
            result = { status: null, nodeFound: false };
        }
        probes.push({
            slotId: slot.id,
            slotLabel: label,
            status: result.status,
            nodeFound: result.nodeFound,
        });
        if (result.status === 200) {
            let account = null;
            try {
                account = await resolveAccount(slot.token);
            }
            catch {
                account = null;
            }
            candidateSlotIds.push(slot.id);
            candidateSlotLabels.push(label);
            candidateAccounts.push(account);
            break;
        }
    }
    const candidateAccount = candidateAccounts[0] || null;
    const candidateHint = candidateSlotLabels[0]
        ? `检测到 Token「${candidateSlotLabels[0]}」${candidateAccount ? `（Figma 账号 ${candidateAccount}）` : ''}可以读取该文件，请在「设置 → Figma Token」里切换到它后重试。`
        : '';
    const message = candidateSlotLabels.length > 0
        ? `当前激活的 Figma Token「${activeSlotLabel}」无法访问该文件（fileKey ${fileKey}，节点 ${nodeId}）。` +
            `Figma 对「无权限」的文件也返回 404（不是 403），所以这不是文件已删除的证据。` +
            candidateHint
        : `当前激活的 Figma Token「${activeSlotLabel}」无法访问该文件（fileKey ${fileKey}，节点 ${nodeId}）。` +
            `Figma 对「无权限」的文件也返回 404（不是 403），所以这不是文件已删除的证据。` +
            `其它 Token 同样无法读取：请先确认该文件未被删除或移动；若文件仍在，` +
            `请为当前 Token 所属的 Figma 账号开通此文件权限（在 Figma 里把文件分享给该账号），或换一个能读该文件的 Token。`;
    return {
        kind: 'figma-not-found',
        fileKey,
        nodeId,
        activeSlotId,
        activeSlotLabel,
        candidateSlotIds,
        candidateSlotLabels,
        candidateAccounts,
        probes,
        message,
    };
}
//# sourceMappingURL=figma-access-diagnosis.js.map