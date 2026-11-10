/**
 * header-slot-contract.js — headerSlots 契约回写（纯函数）
 *
 * Loop 0.A：C-1 rejected 的 vision / derived 一律不得加回。
 * 纠错后 0 且 derived 全在 rejectedKeys → 保持 0。
 */

function slotKey(s) {
  return s?.figmaNodeId || s?.content || '';
}

export function rejectedKeySet(rejectedNodes) {
  return new Set(
    (rejectedNodes || [])
      .map((r) => r?.figmaNodeId || r?.slotCandidate?.figmaNodeId || r?.slotCandidate?.content || '')
      .filter(Boolean),
  );
}

/**
 * @param {{ headerSlots?: Array, contractSlots?: Array, rejectedNodes?: Array }} input
 * @returns {{ headerSlots: Array, visionKept: number, derivedKept: number, existingAll: number }}
 */
export function applyHeaderSlotContractRewrite(input = {}) {
  const contractSlots = input.contractSlots || [];
  const rejectedKeys = rejectedKeySet(input.rejectedNodes);
  const existingAll = Array.isArray(input.headerSlots) ? input.headerSlots : [];

  const derivedHasTab = contractSlots.some((s) =>
    /tab|segmented|switch/i.test(String(s?.elementType || '')),
  );

  let existing = existingAll.filter((s) => {
    const et = String(s?.elementType || '').toLowerCase();
    if (/tab|segmented|switch/.test(et)) return derivedHasTab;
    return true;
  });
  existing = existing.filter((s) => !rejectedKeys.has(slotKey(s)));

  const seen = new Set(existing.map((s) => slotKey(s)));
  let deriveWinsOverRejected = 0;
  const derivedKeptSlots = contractSlots.filter((s) => {
    const key = slotKey(s);
    if (!key || seen.has(key)) return false;
    if (rejectedKeys.has(key)) {
      // 🛡️ 2026-11-10 修订（设备 15f40155/5da4ea56 真机实锤）：derive（contractSlots，从
      //   Figma **header 容器**确定性推导）与 rejectedNodes（**标题同行**几何猜测，reason=
      //   figma-no-same-row）同出自 header-slot-validator——两者冲突（同 key）时的裁决：
      //   - statistic/label 等**非筛选控件**：derive 赢。header 允许多行布局（统计条在标题
      //     下一行），「不在标题同行」≠「不在 header」；旧口径 rejectedKeys 优先把 derive
      //     成果也滤掉 ⇒ headerSlots 恒空 ⇒ 头部统计词全丢（设备「设备类型/设备总数/完好率」）。
      //   - tab/segmented/switch：rejected 仍赢（021e3cf7/9c3aff7f 防线保留——内容区 tabs 被
      //     vision 误判 header-right 是实锤高危形态，mc-max-1788003430879）。
      const et = String(s?.elementType || '').toLowerCase();
      if (/tab|segmented|switch/.test(et)) return false;
      deriveWinsOverRejected += 1;
      return true;
    }
    return true;
  });

  const headerSlots = [...existing, ...derivedKeptSlots];
  return {
    headerSlots,
    visionKept: existing.length,
    derivedKept: derivedKeptSlots.length,
    existingAll: existingAll.length,
    deriveWinsOverRejected,
  };
}
