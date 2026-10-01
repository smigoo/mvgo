/**
 * inline-header-slot-inferrer.js — 从 inlineCompositeRows 推断 headerSlots（纯函数）
 *
 * 🔴 现状（2026-09-30 审计后）：本模块在当前输入下**恒返回 `[]`**。
 *   原因见 `inferHeaderSlotsFromInlineRows` 内的 🗑️ 段：唯一会触发的「按图层名」分支
 *   （`header-` / `title-` 前缀）已按用户契约「文本处理命名无关」删除；剩下的几何分支
 *   因 inline-row-rebuilder 构造的行**无 bbox**（实测 14329/14329 行无 bbox、
 *   387/387 文件无 rootBBox）而**结构性永不触发**。
 *   ⇒ header 归属的权威来源就是事实源两条：① 视觉真值 headerRelation / slotCandidate
 *     → `ensureHeaderSlots`；② Figma header 容器 → `deriveHeaderSlotsFromFigma`。
 *   本模块仅作为「行携带几何后」的未来兜底位保留（待办见函数内注释）。
 *
 * 背景（0907 审计，P1 修复）：inlineCompositeRows 是 Figma 结构中的同行复合节点。
 * 死路径修复：bbox 重建的 inlineCompositeRows 只有 {id,name,layout,members}，不含
 * children；旧实现只走 `row.children`（恒空）→ 兜底推断永远返回空列表。
 * 双通道：LLM 路径（有 children）走子节点提取；bbox 路径走行名启发式（**已删**）。
 * 所有 slot 均携带 figmaNodeId（子节点 id 或行 id），供下游 T09 C-1 越界几何过滤
 * 在 Figma 节点树中定位候选 bbox，避免内容区元素被误判为 header 插槽。
 *
 * 本模块为纯函数（无 import.meta / 无 fs），jest 可直接 require——与
 * utils/inline-row-rebuilder.js（L2）同模式。
 */

/**
 * 🎯 治本 B（2026-09-10）：判定行是否位于组件顶部区域（顶部 15%）。
 * 依据行 bbox 的 y 与根容器高度；任一缺失时 fail-closed 返回 false（不误收内容区行）。
 * @param {object} row
 * @param {object} [rootBBox] 根容器 bbox（含 height）
 * @returns {boolean}
 */
function isInTopRegion(row, rootBBox) {
  const b = row?.absoluteBoundingBox || row?.bbox || null;
  const y = Number(b?.y);
  const rootH = Number(rootBBox?.height);
  if (Number.isFinite(y) && Number.isFinite(rootH) && rootH > 0) {
    // 相对根顶部的偏移：row.y 可能是页面绝对坐标，这里用行高做保守判定
    const rowH = Number(b?.height) || 0;
    // 若 y < 根高的 15% 视为顶部区（y 为绝对坐标时该判定可能不中，故再叠加行高判定）
    if (y >= 0 && y < rootH * 0.15) return true;
    // 退化：行本身很矮且宽度明显大于高度（横向 tab 条）
    const w = Number(b?.width);
    if (Number.isFinite(w) && rowH > 0 && w > rowH * 3) return true;
    return false;
  }
  // 无几何信息：fail-closed 不判为顶部（保持 Loop 2.0.D 原行为，不误收）
  return false;
}

/**
 * 从 inlineCompositeRows 推断 headerSlots
 * @param {Object} analysisResult - visual-parser 分析结果（含 inlineCompositeRows）
 * @returns {Array} headerSlots（slotType/elementType/content/sectionId/figmaNodeId）
 */
export function inferHeaderSlotsFromInlineRows(analysisResult) {
  const rows = Array.isArray(analysisResult?.inlineCompositeRows)
    ? analysisResult.inlineCompositeRows
    : [];
  if (rows.length === 0) return [];
  const rootBBox =
    analysisResult?.layoutStructure?.absoluteBoundingBox ||
    analysisResult?.absoluteBoundingBox ||
    null;

  const slots = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rowName = String(row.componentName || row.name || row.id || '').toLowerCase();
    // 🗑️ 已删（2026-09-30，用户契约「文本处理命名无关」）：
    //   `isTitleBarRow = rowName.startsWith('header-') || rowName.startsWith('title-')`
    //   这是**按图层名判归属并把它当 UI 文本输出**，违反契约（命名只允许用于资源类型
    //   bg/icon/img 与 @ 技术栈）。全语料审计（387 个含 inlineCompositeRows 的产物 / 14329 行）：
    //     · 按名分支命中 77 行 ⇒ 产出 77 个 slot，而 `content` **全部是图层名原文 `header-`**
    //       （行由 inline-row-rebuilder 构造，形如 `{id,name:'header-',layout,members}`，
    //        走 else 分支 ⇒ content = row.name）⇒ 往 headerSlots 注入的是**假 UI 文案**，
    //        并会被 visual-parser 注册进「identifyText 已识别文本集」，污染文本真值。
    //     · 几何分支（isTopTabRow）命中 **0** 行 —— **结构性死支**：该模块的行由
    //       `rebuildSectionsPreservingInlineRows` 构造，只含 `{id,name,layout,members}`，
    //       **无 bbox**（实测 14329/14329 行无 bbox、387/387 文件无 rootBBox）
    //       ⇒ `isInTopRegion` 恒 false。
    //   ⇒ 删掉按名分支后，本模块在当前输入下**恒返回 []**，header 归属完全由事实源接管：
    //     ① ensureHeaderSlots（视觉真值 headerRelation / slotCandidate）
    //     ② deriveHeaderSlotsFromFigma（Figma header 容器）
    //   ⚠️ 待办（需授权）：`isTopTabRow` 的命名项 `/tab|标签页|导航|标签/` 同属按名判据，
    //      应按同一契约替换为**几何事实源**（要求 inline-row-rebuilder 的行携带 bbox /
    //      行内成员的相对几何），随后本模块与其调用点可整体删除（当前恒 [] ⇒ 删调用点零行为变化）。
    const isTopTabRow =
      /tab|标签页|导航|标签/.test(rowName) &&
      isInTopRegion(row, rootBBox);
    if (!isTopTabRow) {
      continue;
    }

    // 🛡️ P1：先尝试 LLM 路径（有 children 时才走子节点提取）
    const children = Array.isArray(row.children) ? row.children : [];
    if (children.length > 0) {
      for (const child of children) {
        if (!child || typeof child !== 'object') continue;
        const childType = String(child.type || child.componentType || '').toLowerCase();
        const childName = String(child.name || child.label || child.text || '').trim();

        if (
          /text-group|stat-item|statistic/.test(childType) ||
          (childName && /\d/.test(childName) && childName.length < 20)
        ) {
          slots.push({
            slotType: 'header-right',
            elementType: 'statistic',
            content: childName || child.label || '',
            sectionId: row.id || '',
            figmaNodeId: child.id || row.id || '',
          });
        } else if (
          /tab-switch|tab|icon-group|icon-button/.test(childType) ||
          /tab|导航|nav/.test(childName)
        ) {
          // 顶部 tab 行的 tab 子节点 → header-tabs（否则 title-bar 行的 controls → header-right）
          const slotType = isTopTabRow ? 'header-tabs' : 'header-right';
          slots.push({
            slotType,
            elementType: /tab/.test(childType || childName) ? 'tab' : 'icon',
            content: childName,
            sectionId: row.id || '',
            figmaNodeId: child.id || row.id || '',
          });
        }
      }
    } else {
      // 🛡️ P1：bbox 重建路径——仅有 {id,name}，无子节点结构信息。
      // 行名本身即 header-/title- 前缀（或几何顶部 tab 行），以行本身作为插槽候选并携带 figmaNodeId。
      const name = String(row.name || '').trim();
      if (name) {
        slots.push({
          slotType: isTopTabRow ? 'header-tabs' : 'header-right',
          elementType: 'statistic',
          content: name,
          sectionId: row.id || '',
          figmaNodeId: row.id || '',
        });
      }
    }
  }
  return slots;
}

function slotKey(s) {
  return s?.figmaNodeId || s?.content || '';
}

function boxesIntersect(a, b) {
  if (!a || !b) return true;
  const ax = Number(a.x);
  const ay = Number(a.y);
  const aw = Number(a.w ?? a.width);
  const ah = Number(a.h ?? a.height);
  const bx = Number(b.x);
  const by = Number(b.y);
  const bw = Number(b.w ?? b.width);
  const bh = Number(b.h ?? b.height);
  if (![ax, ay, aw, ah, bx, by, bw, bh].every(Number.isFinite)) return true;
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * 合并去重：保留既有 slot（section-inferred 等），追加无 content 冲突的 inline 推断结果。
 * Loop 0.A：命中 rejectedKeys 或与 header 容器不相交（C-2）→ 不加。
 * @param {Array} existingSlots
 * @param {Array} inlineSlots
 * @param {{ rejectedKeys?: Set, headerBBox?: object, slotsBBoxOf?: Function }} [opts]
 * @returns {Array}
 */
export function mergeHeaderSlots(existingSlots, inlineSlots, opts = {}) {
  const base = Array.isArray(existingSlots) ? existingSlots : [];
  const add = Array.isArray(inlineSlots) ? inlineSlots : [];
  const rejectedKeys = opts?.rejectedKeys instanceof Set ? opts.rejectedKeys : new Set();
  const headerBBox = opts?.headerBBox || null;
  const slotsBBoxOf = typeof opts?.slotsBBoxOf === 'function' ? opts.slotsBBoxOf : null;
  const existingContents = new Set(
    base.map((s) => String(s?.content || '').trim()).filter(Boolean),
  );
  const newSlots = add.filter((s) => {
    if (!s?.content || existingContents.has(String(s.content).trim())) return false;
    const key = slotKey(s);
    if (key && rejectedKeys.has(key)) return false;
    if (rejectedKeys.has(String(s.content).trim())) return false;
    if (headerBBox && slotsBBoxOf) {
      const bbox = slotsBBoxOf(s);
      if (bbox && !boxesIntersect(bbox, headerBBox)) return false;
    }
    return true;
  });
  if (newSlots.length === 0) return base;
  return [...base, ...newSlots];
}

// ============================================================================
// 🎯 E2 / R3(A)（2026-09-16）：header 归属「事实优先」装配
// ----------------------------------------------------------------------------
// 现状：header 归属由 inferHeaderSlotsFromInlineRows 的**行名启发式**猜测
//   （startsWith('header-'|'title-') / 顶部 15% tab），与 deriveHeaderSlotsFromFigma
//   双源并存 → 「小标题/tabs 该进 header 插槽却进内容区」缺乏唯一确定性事实源。
// 本刀：把视觉分析已产出的 headerRelation / slotCandidate **视觉真值**接为权威事实，
//   确定性装配 headerSlots（纯函数、零臆造、增量 union、不删任何既有 slot）。
//   —— 只加不改：不触碰既有 _inferHeaderSlots / mergeHeaderSlots 分支。
// ============================================================================

/**
 * header 归属的权威关系集：这些 headerRelation 的 section 属 base-panel 外壳（chrome），
 * 其 slotCandidate 应确定性进入 headerSlots，section 本身不进入业务内容区。
 * ⚠️ 与 utils/chrome-section-filter.js 的 CHROME_HEADER_RELATIONS 同源（单一事实源）。
 */
export const HEADER_CHROME_RELATIONS = new Set([
  'title-itself',
  'panel-title',
  'title-note',
  'sub-header',
  'header-only',
])

/** 标题同行控件关系：控件应进 header 插槽，但整节不剥离（内容仍在同行）。 */
export const HEADER_SAME_ROW_RELATION = 'title-same-row'

/** 归一化 section 的 headerRelation（兼容 header.relation / relation 别名）。 */
export function normalizeHeaderRelation(section) {
  return String(
    section?.headerRelation ?? section?.header?.relation ?? section?.relation ?? '',
  )
    .trim()
    .toLowerCase()
}

/**
 * slotCandidate（视觉真值）→ 契约形态 header slot。
 * 形态：`string`（视为 slotType，如 'header-right'）或
 *      `object { slotType?, elementType?, content?, figmaNodeId?, ... }`。
 * 无候选返回 null（不臆造）。content 缺失时回退 section 标题/名称。
 */
export function normalizeSlotCandidate(candidate, section = {}) {
  if (!candidate) return null
  const isObj = typeof candidate === 'object'
  const content = isObj
    ? String(candidate.content ?? candidate.label ?? candidate.text ?? '').trim()
    : ''
  const slotType = isObj
    ? String(candidate.slotType ?? candidate.role ?? '').trim()
    : String(candidate).trim()
  const elementType = isObj ? String(candidate.elementType ?? candidate.type ?? '').trim() : ''
  const figmaNodeId = isObj ? String(candidate.figmaNodeId ?? candidate.id ?? '').trim() : ''
  const fallbackContent = String(section?.title ?? section?.name ?? section?.id ?? '').trim()
  const finalContent = content || fallbackContent
  if (!slotType && !finalContent && !figmaNodeId) return null
  return {
    slotType: slotType || 'header-right',
    elementType: elementType || 'statistic',
    content: finalContent,
    sectionId: section?.id || '',
    figmaNodeId: figmaNodeId || '',
  }
}

/**
 * ensureHeaderSlots — 以 headerRelation / slotCandidate 为权威事实，确定性装配 headerSlots。
 *
 * 规则（确定性、无启发式）：
 *   - headerRelation ∈ HEADER_CHROME_RELATIONS：该 section 属 header 外壳 → 记入 headerSectionIds；
 *     其 slotCandidate 规范化为 header slot 加入。
 *   - headerRelation === 'title-same-row'：同行控件 → slotCandidate 加入（section 不记入 header 剥离集）。
 *   - 其他（no-header / content-below-title 等）：不归 header，slots 不加入。
 * 安全：仅做去重 union，**不删既有 slot**；命中 rejectedKeys 的候选不加。
 *
 * @param {Array} sections preview-analysis sections（携带 headerRelation / slotCandidate）
 * @param {Array} headerSlots 既有 headerSlots
 * @param {{ rejectedKeys?: Set }} [opts]
 * @returns {{ headerSlots: Array, headerSectionIds: string[], derivedCount: number, existingCount: number }}
 */
export function ensureHeaderSlots(sections, headerSlots = [], opts = {}) {
  const list = Array.isArray(sections) ? sections : []
  const existing = Array.isArray(headerSlots) ? headerSlots : []
  const rejectedKeys = opts?.rejectedKeys instanceof Set ? opts.rejectedKeys : new Set()

  const byKey = new Map()
  for (const s of existing) {
    const k = slotKey(s)
    if (k) byKey.set(k, s)
  }

  const headerSectionIds = []
  let derivedCount = 0

  for (const sec of list) {
    if (!sec || typeof sec !== 'object') continue
    const rel = normalizeHeaderRelation(sec)
    const isChrome = HEADER_CHROME_RELATIONS.has(rel)
    const isSameRow = rel === HEADER_SAME_ROW_RELATION
    if (!isChrome && !isSameRow) continue
    if (isChrome) headerSectionIds.push(String(sec.id || sec.name || ''))

    const cand = sec.slotCandidate ?? sec.header?.slotCandidate ?? null
    const slot = normalizeSlotCandidate(cand, sec)
    if (!slot) continue
    const key = slotKey(slot)
    if (!key || rejectedKeys.has(key) || byKey.has(key)) continue
    byKey.set(key, slot)
    derivedCount += 1
  }

  return {
    headerSlots: [...byKey.values()],
    headerSectionIds,
    derivedCount,
    existingCount: existing.length,
  }
}
