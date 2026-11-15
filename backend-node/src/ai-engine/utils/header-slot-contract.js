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

/**
 * 🛡️ A1（2026-11-15 · mc-max-1794706325675-693c8d17 实锤）：视觉重试择优会整体替换
 *   `result = retried`，而 retried 是全新 parse 结果，不带首轮的 headerSlotValidation /
 *   契约回写成果 ⇒ state.headerSlots 变 [] ⇒ engineer F1b total=0、T09 不注入、header 行
 *   落进 body。本函数在替换后重跑同一纯函数回写（contractSlots/rejectedNodes 由 Figma 节点
 *   确定性推导，与视觉轮次无关），并继承首轮已过 rejectedKeys 防线的契约（按 slotKey 去重）。
 *
 * @param {Array} firstSlots 首轮回写后的 headerSlots
 * @param {Array} retrySlots 重试结果的原始 headerSlots
 * @param {{contractSlots?:Array, rejectedNodes?:Array}} validation 首轮 headerSlotValidation
 */
export function inheritHeaderSlotsOnVisionRetry(firstSlots, retrySlots, validation = {}) {
  const rewrite = applyHeaderSlotContractRewrite({
    headerSlots: Array.isArray(retrySlots) ? retrySlots : [],
    contractSlots: validation?.contractSlots || [],
    rejectedNodes: validation?.rejectedNodes || [],
  });
  const seen = new Set(rewrite.headerSlots.map(slotKey).filter(Boolean));
  const inherited = (Array.isArray(firstSlots) ? firstSlots : []).filter((s) => {
    const key = slotKey(s);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    headerSlots: [...rewrite.headerSlots, ...inherited],
    rewritten: rewrite.headerSlots.length,
    inherited: inherited.length,
    visionKept: rewrite.visionKept,
    derivedKept: rewrite.derivedKept,
  };
}

/**
 * 🛡️ A3（2026-11-15）：把顶层结构化 tab 契约同步到 figmaNodeId 对应的段级 `headerSlots[]`。
 *   `resolveHeaderTabModels` 只认段级数组（header-tab-slots.js:62）；本次视觉里 Tab 段是
 *   `sections[0].children[0]` / `body.children[0]` 的嵌套段，段级数组恒缺失。
 *   只做**数据同步**：不改 extractSections 的顶层遍历口径，故不会启用既有
 *   renderHeaderTabTemplate 的 inline px 渲染（px2rem 硬约束），交互仍由终写前
 *   promoteHeaderRightTabs 的 less class 方案收口。
 *   原地补字段、幂等、无匹配时不动；返回同一 layoutStructure 便于调用方链用。
 */
export function syncTabContractsToSections(layoutStructure, headerSlots) {
  const stats = { tabSlots: 0, sectionsTouched: 0, alreadyPresent: 0, noTarget: 0 };
  if (!layoutStructure || typeof layoutStructure !== 'object') {
    return { layoutStructure, stats };
  }
  const tabSlots = (Array.isArray(headerSlots) ? headerSlots : []).filter(
    (s) =>
      s &&
      String(s.elementType || '').toLowerCase() === 'tab' &&
      String(s.figmaNodeId || '').trim(),
  );
  stats.tabSlots = tabSlots.length;
  if (tabSlots.length === 0) return { layoutStructure, stats };

  const roots = [];
  for (const key of ['sections', 'effectiveSections']) {
    if (Array.isArray(layoutStructure[key])) roots.push(...layoutStructure[key]);
  }
  const layout = layoutStructure.layout;
  if (layout && typeof layout === 'object') {
    for (const key of ['sections', 'effectiveSections']) {
      if (Array.isArray(layout[key])) roots.push(...layout[key]);
    }
  }
  const nodes = [];
  const visited = new Set();
  const walk = (list, depth = 0) => {
    if (!Array.isArray(list) || depth > 12) return;
    for (const sec of list) {
      if (!sec || typeof sec !== 'object' || visited.has(sec)) continue;
      visited.add(sec);
      nodes.push(sec);
      if (Array.isArray(sec.children)) walk(sec.children, depth + 1);
      if (Array.isArray(sec.body?.children)) walk(sec.body.children, depth + 1);
    }
  };
  walk(roots);

  for (const slot of tabSlots) {
    const id = String(slot.figmaNodeId).trim();
    const targets = nodes.filter((n) => String(n.id ?? '').trim() === id);
    if (targets.length === 0) {
      stats.noTarget += 1;
      continue;
    }
    for (const sec of targets) {
      const current = Array.isArray(sec.headerSlots) ? sec.headerSlots : [];
      const exists = current.some(
        (s) =>
          String(s?.figmaNodeId || '').trim() === id ||
          slotKey(s) === slotKey(slot),
      );
      if (exists) {
        stats.alreadyPresent += 1;
        continue;
      }
      sec.headerSlots = [...current, { ...slot }];
      stats.sectionsTouched += 1;
    }
  }
  return { layoutStructure, stats };
}
