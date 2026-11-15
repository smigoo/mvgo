/**
 * 资源归属归一（P0-a · 2026-11-15 · mc-max-1794714093985-c60fbe6f 实锤）
 *
 * 问题：`resourceDomMapping[].ownerSectionId` 由 figma-connector 写入，取的是
 *   **直接父节点 id**。真实 Figma 结构里图标/背景的直接父常是中间 group
 *   （如 `2:3550` / `2:3559` / `2:3571`），而产物输出 `data-section-id` 的是上层
 *   section（`88:32` / `2:3565`）。两侧对不上 ⇒
 *     ① 资源按 section 分发时错配（8×8 的 `g` 被当成 18×18 图标），
 *     ② 更常见的是**整条资源在目标文件里查不到** ⇒ 生成器「有 icon 位、无 icon 图」
 *        只能手写 CSS 伪元素画假图标（ContentForecast 的 `::before/::after` 三层方块），
 *     ③ 下游各资源修复器按 section 反查 mapping 时全部 `no-icon-truth` 跳过。
 *
 * 判据（单一来源，不猜名字）：给一个**权威 section id 集合**（段树出口
 *   `effectiveSections[].id` / `layoutStructure.sections[].id`），对每条资源：
 *     - owner 已在集合内 ⇒ 原样保留（幂等）；
 *     - owner 是 Figma 节点 id 形态（`12:345`）且不在集合内 ⇒ 沿 `ancestorIds`
 *       （最近父 → 根，figma-connector 已固化）取**第一个落在集合内的祖先**；
 *     - 找不到 / owner 是 `slot-*` 等非 Figma id 形态 ⇒ 原样保留（fail-open，绝不猜）。
 *
 * 边界面：只改 `ownerSectionId` 一个字段，新增 `ownerSectionOrigin` / `ownerSectionOriginal`
 *   两个观测字段；不动 resourceFile / figmaNodeId / ancestorIds / usage 等任何既有字段。
 *   无 section 集合证据 ⇒ 整体 fail-open（`no-section-ids`），零回归。
 */

/** Figma 节点 id 形态：`2:3565` / `88:32`；`slot-con`、`Group 2136` 等一律不碰 */
const FIGMA_ID_RE = /^\d+:\d+$/;

/** 从段树 / layoutStructure 提取 section id 集合（去重、去空） */
export function collectSectionIds(...sources) {
  const out = new Set();
  for (const src of sources) {
    if (!src) continue;
    const list = Array.isArray(src) ? src : [];
    for (const s of list) {
      if (s == null) continue;
      const id =
        typeof s === 'string' || typeof s === 'number'
          ? String(s)
          : String(s.id ?? s.sectionId ?? s.nodeId ?? '');
      if (id) out.add(id);
    }
  }
  return out;
}

function emptyStats(reason) {
  return {
    verdict: 'no-evidence',
    reason,
    total: 0,
    keptInSet: 0,
    resolved: 0,
    unresolved: 0,
    skippedNonFigma: 0,
    skippedNoOwner: 0,
    samples: [],
  };
}

/**
 * 把落在「非 section 中间容器」上的 ownerSectionId 上溯到最近的 section。
 *
 * @param {Array} mappings resourceDomMapping
 * @param {Set<string>|Array<string>} sectionIds 权威 section id 集合
 * @param {{logger?:object, silent?:boolean, sampleLimit?:number}} [options]
 * @returns {{mappings:Array, stats:object, changes:Array}}
 */
export function resolveOwnerSectionToNearestSection(mappings, sectionIds, options = {}) {
  const { logger, silent = false, sampleLimit = 8 } = options;
  const list = Array.isArray(mappings) ? mappings : [];
  const idSet =
    sectionIds instanceof Set ? sectionIds : new Set((Array.isArray(sectionIds) ? sectionIds : []).map(String));

  if (idSet.size === 0) {
    const stats = emptyStats('no-section-ids');
    if (!silent && logger) logger.info(formatResourceOwnershipLog(stats).message, {});
    return { mappings: list, stats, changes: [] };
  }

  const stats = {
    verdict: 'pass',
    reason: null,
    total: 0,
    keptInSet: 0,
    resolved: 0,
    unresolved: 0,
    skippedNonFigma: 0,
    skippedNoOwner: 0,
    samples: [],
  };
  const changes = [];
  const out = [];

  for (const m of list) {
    if (!m || typeof m !== 'object') {
      out.push(m);
      continue;
    }
    stats.total += 1;
    const owner = m.ownerSectionId == null ? '' : String(m.ownerSectionId);

    if (!owner) {
      stats.skippedNoOwner += 1;
      out.push(m);
      continue;
    }
    if (idSet.has(owner)) {
      stats.keptInSet += 1;
      out.push(m);
      continue;
    }
    // 非 Figma id 形态（slot-* / 语义 key 等）：不判，避免破坏已细化的归属
    if (!FIGMA_ID_RE.test(owner)) {
      stats.skippedNonFigma += 1;
      out.push(m);
      continue;
    }

    const anc = Array.isArray(m.ancestorIds) ? m.ancestorIds.map(String) : [];
    const hit = anc.find((a) => idSet.has(a));
    if (!hit) {
      stats.unresolved += 1;
      if (stats.samples.length < sampleLimit) {
        stats.samples.push({ figmaNodeId: m.figmaNodeId, owner, reason: 'no-ancestor-in-sections' });
      }
      out.push(m);
      continue;
    }

    const next = {
      ...m,
      ownerSectionId: hit,
      ownerSectionOriginal: owner,
      ownerSectionOrigin: 'ancestor',
    };
    stats.resolved += 1;
    if (stats.samples.length < sampleLimit) {
      stats.samples.push({ figmaNodeId: m.figmaNodeId, from: owner, to: hit });
    }
    changes.push({ figmaNodeId: m.figmaNodeId, from: owner, to: hit });
    out.push(next);
  }

  stats.verdict = stats.resolved > 0 ? 'normalized' : 'clean';
  if (!silent && logger) {
    const line = formatResourceOwnershipLog(stats);
    logger.info(line.message, line.meta);
  }
  return { mappings: out, stats, changes };
}

/** 计数行唯一格式来源（真机日志与单测共用） */
export function formatResourceOwnershipLog(stats) {
  const s = stats || emptyStats('missing-stats');
  const meta =
    s.verdict === 'no-evidence'
      ? { reason: s.reason }
      : {
          samples: Array.isArray(s.samples) ? s.samples.slice(0, 8) : [],
          sections: s.sectionCount ?? undefined,
        };
  return {
    message:
      `resourceOwnership:total=${s.total || 0},inSection=${s.keptInSet || 0},` +
      `resolved=${s.resolved || 0},unresolved=${s.unresolved || 0},` +
      `nonFigma=${s.skippedNonFigma || 0},noOwner=${s.skippedNoOwner || 0},` +
      `verdict=${s.verdict}` +
      (s.reason ? `,reason=${s.reason}` : ''),
    meta,
  };
}
