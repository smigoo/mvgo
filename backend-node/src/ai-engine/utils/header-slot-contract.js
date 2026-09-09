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
  const derivedKeptSlots = contractSlots.filter((s) => {
    const key = slotKey(s);
    if (!key || seen.has(key)) return false;
    if (rejectedKeys.has(key)) return false;
    return true;
  });

  const headerSlots = [...existing, ...derivedKeptSlots];
  return {
    headerSlots,
    visionKept: existing.length,
    derivedKept: derivedKeptSlots.length,
    existingAll: existingAll.length,
  };
}
