/**
 * inline-header-slot-inferrer.js — 从 inlineCompositeRows 推断 headerSlots（纯函数）
 *
 * 背景（0907 审计，P1 修复）：
 * - inlineCompositeRows 是 Figma 结构中的同行复合节点。当 section 中的 header 被
 *   chrome-filter 剥离后，此处作为兜底提取 header-/title- 前缀节点作为 headerSlots。
 * - 死路径修复：bbox 重建的 inlineCompositeRows 只有 {id,name,layout,members}，不含
 *   children；旧实现只走 `row.children`（恒空）→ 兜底推断永远返回空列表。
 *   双通道：LLM 路径（有 children）走子节点提取；bbox 路径走行名启发式。
 * - 所有 slot 均携带 figmaNodeId（子节点 id 或行 id），供下游 T09 C-1 越界几何过滤
 *   在 Figma 节点树中定位候选 bbox，避免内容区元素被误判为 header 插槽。
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
    // Loop 2.0.D：只处理标题栏行。内容区 @antd/tab / tabs 不得编成 header-right。
    // 🎯 治本 B（2026-09-10）：顶部 tab 行（组件顶部 15% 区）应作为 headerSlots 候选保留，
    //   修复 aacfa51 移除 \btab\b 匹配后连顶部 tab 行也整段丢失的问题（device 顶部 @antd/tab 头）。
    const isTitleBarRow =
      rowName.startsWith('header-') ||
      rowName.startsWith('title-') ||
      /\bheader\b|\btitle-bar\b|\btitle\b/.test(rowName);
    const isTopTabRow =
      /tab|标签页|导航|标签/.test(rowName) &&
      isInTopRegion(row, rootBBox);
    if (!isTitleBarRow && !isTopTabRow) {
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
          // 🎯 治本 B：顶部 tab 行的 tab 子节点标记为 header-tabs（不混同 header-right 统计项）
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
      // 行名本身就是 header- 相关，以行本身作为插槽候选并携带 figmaNodeId。
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
