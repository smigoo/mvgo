/**
 * 🛡️ 刀 45（2026-10-22 · mc-1792639559460-61f0ebaf 实锤）：**section 有图标真值，
 *    但组件里一个 `<img>` 都没有** —— 「缺图标」，与 R24 的「破图」是两件事。
 *
 * ── 病灶 ────────────────────────────────────────────────────────────────────
 * 真机第三轮：`HeaderText.vue`（战略合作厂商面板标题）模板只剩
 *   `<div data-section-id="38:3137-tail-text"><span>{{ title }}</span></div>`
 * 而 mapping 里 `38:3160` 明明是 `previewAnalysisRole: 'icon'`、`resourceFile:
 * icon-战略厂商-3160.png`、`usage: '<img :src="iconX">'`。
 * R24 修不了它：**没有 `<img>` 可修**（`findImgTags` 返回空 ⇒ 直接 return）。
 * `resource-mount-plan` 也只能报 `mount-target-not-found`（没有落点元素）。
 * 截图铁证：同一产物里「优质厂商」有图标、「战略合作厂商」没有。
 *
 * ── 判据（可辩驳、fail-open；全部满足才动手）───────────────────────────────
 *   ① 该 section 的候选**恰好 1 个**，且 `previewAnalysisRole === 'icon'`
 *      （`bg` / 空值一律不判 —— 把背景图插成 `<img>` 是错的）；
 *   ② 候选带 `resourceFile`，且 `usage` 明确是 `<img …>` 形态（mapping 自己声明的 DOM 契约）；
 *   ③ 组件**零渲染**：模板里没有 `<img`，且代码里没有任何 `resources/images/<该文件>` 引用；
 *   ④ **位置真值**取自 mapping 的 `figmaBox` / `parentBox`（资源节点相对 section 父框的偏移）：
 *      `dx = figmaBox.x - parentBox.x`、`dy = figmaBox.y - parentBox.y`
 *        · `dx <= parentW*0.10 且 dy <= parentH*0.40` ⇒ 左上角（标题行首）⇒ 插到 section 根**首子元素**
 *        · `dx >= parentW*0.90` ⇒ 右侧收尾 ⇒ 插到根**末子元素**
 *        · 其余位置（居中/中间行）⇒ **不判**（位置不确定，插错比不插更糟）
 *   ⑤ 尺寸取自 `figmaBox.width/height`（真值）；缺失或非正数 ⇒ 不判。
 *   ⑥ **轴向锁定**（刀 45b）：`prepend`/`append` 只是「子树顺序」，视觉语义由宿主根元素
 *      的排列轴决定。宿主纵向时 prepend 变成**纵向堆叠**（实测图标跑到标题上方）。
 *      ⇒ 在宿主根元素**内联 style** 上钉 `display:flex; flex-direction:row; align-items:center`。
 *      **不改 class / 不改 `<style>` 规则**：真机方向定义在共享样式表里（改 scoped 无效），
 *      且该类被多处复用（改 class 会污染）。仅当宿主原本**只有 ≤1 个元素子项**时才动，
 *      多子项宿主一律不插（掰成 row 会打乱原布局）—— fail-open。
 *      **不做坐标定位**：段高由 flex 分配、组件要等比缩放，写死 left/top 必漂。
 *
 * 为什么敢插入 DOM：`usage` 是 mapping 对「这个资源应当怎么渲染」的既有声明，
 *   位置与尺寸又都有 Figma 真值兜底 ⇒ 不是猜。任何一条证据缺失都退回不判。
 *
 * 幂等：插入后模板有 `<img>` 且已引用该文件 ⇒ 条件 ③ 不成立 ⇒ 原样返回。
 */

import {
  templateRange,
  collectSectionIds,
  candidatesForSection,
  varNameOf,
  isDeclared,
  insertImport,
} from './resource-img-src-healer.js';

/** 图标类角色（只认这些；`bg` / 空值一律不判） */
const ICON_ROLES = new Set(['icon', 'slot-icon', 'iconsloticon']);

function isIconRole(mapping) {
  const r = String(mapping?.previewAnalysisRole || '').toLowerCase();
  return ICON_ROLES.has(r);
}

/** `usage` 是否声明为 `<img …>` 形态 */
function usageIsImg(mapping) {
  const u = String(mapping?.usage || '');
  return /<img\b/i.test(u);
}

const RE_ESC = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 把一段内联 CSS 合并成「横向一行」：`display:flex / flex-direction:row / align-items:center`。
 * 只补缺失项；`flex-direction: column` 就地改 `row`；已有 `row` 时**幂等返回 changed=false**。
 * 不做任何布局计算 —— 位置交给布局层，这里只钉「同一行」这一个事实。
 */
function mergeInlineAxisDecls(css) {
  const src = String(css || '').trim();
  let out = src.replace(
    /flex-direction\s*:\s*column(\s*!important)?\s*;?/gi,
    'flex-direction: row;',
  );
  const has = (p) => new RegExp(`(^|;)\\s*${p}\\s*:`, 'i').test(out);
  const add = [];
  if (!has('display')) add.push('display: flex');
  if (!/flex-direction\s*:/i.test(out)) add.push('flex-direction: row');
  if (!has('align-items')) add.push('align-items: center');
  if (out && !out.trim().endsWith(';')) out = `${out.trim()};`;
  if (add.length === 0) {
    const changed = out.trim() !== src;
    return { css: out.trim() || src, changed };
  }
  return { css: `${out.trim()} ${add.join('; ')};`.trim(), changed: true };
}

/**
 * 🛡️ 刀 45b（2026-10-22 · mc-1792640078832-caa3c509 / mc-1792641321781-bf647860 双实锤）：
 *   `prepend` 只决定子树顺序，**视觉语义由宿主根元素的排列轴决定**。
 *   宿主纵向时 prepend 变成纵向堆叠（截图：图标跑到标题上方）。
 *
 * 为什么改**元素级内联 style**，而不是改 `<style>` 里的规则：
 *   ① 真机 `HeaderText2.vue` 根元素是 `class="c-bf6478-icon …"`，而 `.c-bf6478-icon`
 *      的 `flex-direction: column` 定义在**共享样式表** `resources/styles/index.css` 里
 *      ⇒ 改组件 scoped 规则**根本不生效**（上一版 ensureRowAdjacentAxis 因此零命中）；
 *   ② 该类被多个元素复用（三层段容器 / ContentIcon 系）⇒ 按「class 被复用绝不改写」
 *      铁律，**也不该改 class**；
 *   ③ 内联 style 优先级高于任何 class，且只作用于**这一个元素** ⇒ 天然满足上面两条。
 *
 * 不做坐标定位（`left/top` 不采用）：段高由 `flex:0.2xx` 分配、组件要等比缩放，
 *   写死 px 必漂。位置交给布局层，这里只保证「图标与文字同一行」。
 *
 * 与已有的 `:style` 并存安全：Vue 会把静态 `style` 与 `:style` 合并，`:style` 里
 *   通常不含 `flex-direction` 等布局键 ⇒ 静态值生效。
 *
 * @param {{start:number,end:number}} root 根元素开标签范围（索引对原 code 有效）
 * @returns {{code:string, changed:boolean, added:string[]}}
 */
export function lockHostAxisInline(code, root) {
  const res = { code, changed: false, added: [] };
  if (typeof code !== 'string' || !root) return res;
  const openTag = code.slice(root.start, root.end);
  const gt = openTag.lastIndexOf('>');
  if (gt < 0) return res;
  const head = openTag.slice(0, gt);
  const tail = openTag.slice(gt);

  const staticRx = /(^|\s)style\s*=\s*"([^"]*)"/i;
  const m = staticRx.exec(head);

  if (m) {
    const merged = mergeInlineAxisDecls(m[2]);
    if (!merged.changed) return res;
    const newHead = head.replace(staticRx, `$1style="${merged.css}"`);
    res.code = code.slice(0, root.start) + newHead + tail + code.slice(root.end);
    res.changed = true;
    res.added = ['inline-style-merged'];
    return res;
  }

  const merged = mergeInlineAxisDecls('');
  const selfClose = /\/\s*$/.test(head);
  const attrText = selfClose ? head.replace(/\/\s*$/, '').trimEnd() : head;
  const newHead = selfClose
    ? `${attrText} style="${merged.css}" /`
    : `${attrText} style="${merged.css}"`;
  res.code = code.slice(0, root.start) + newHead + tail + code.slice(root.end);
  res.changed = true;
  res.added = ['inline-style-added'];
  return res;
}

/**
 * 统计元素开标签之后、闭合之前**第 1 层**的子元素个数（自闭合标签不计层深）。
 * 用于「改轴只在单子项宿主机上做」的保护：多子项宿主掰成 row 会打乱原布局。
 */
function countTopLevelChildren(code, from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  const rx = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g;
  rx.lastIndex = from;
  let depth = 0;
  let count = 0;
  let m;
  while ((m = rx.exec(code)) !== null && m.index < to) {
    const closing = m[1] === '/';
    const attrs = m[3] || '';
    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) count++;
    if (!/\/\s*$/.test(attrs)) depth++;
  }
  return count;
}

function boxOf(v) {
  if (!v || typeof v !== 'object') return null;
  const x = Number(v.x);
  const y = Number(v.y);
  const width = Number(v.width);
  const height = Number(v.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/**
 * 由 `figmaBox` / `parentBox` 判插入位置。
 * @returns {'prepend'|'append'|null} null = 位置不确定（不判）
 */
export function decideInsertPosition(mapping) {
  const box = boxOf(mapping?.figmaBox);
  const parent = boxOf(mapping?.parentBox);
  if (!box || !parent) return null;
  const dx = box.x - parent.x;
  const dy = box.y - parent.y;
  if (dx >= parent.width * 0.9) return 'append';
  if (dx <= parent.width * 0.1 && dy <= parent.height * 0.4) return 'prepend';
  return null;
}

/**
 * 找到承载 `data-section-id` 的元素开标签（返回 {start,end,tagName,className}）。
 * `sectionId` 为空 ⇒ 取 `<template>` 内**第一个**元素（无锚点组件靠装配层 owner 定位时的兜底）。
 */
function findSectionRootOpenTag(code, sectionId) {
  const range = templateRange(code);
  if (!range) return null;
  const body = range.body;
  const rx = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g;
  let m;
  while ((m = rx.exec(body)) !== null) {
    const attrs = m[2] || '';
    if (sectionId) {
      const sid = /data-section-id\s*=\s*["']([^"']+)["']/.exec(attrs);
      if (!sid || sid[1].trim() !== sectionId) continue;
    }
    const cls = /class\s*=\s*["']([^"']*)["']/.exec(attrs);
    const first = (cls?.[1] || '').trim().split(/\s+/).filter(Boolean)[0] || '';
    return {
      start: range.start + m.index,
      end: range.start + m.index + m[0].length,
      tagName: m[1],
      className: first,
    };
  }
  return null;
}

/**
 * 给「section 有唯一图标真值但组件零渲染」的组件补一个 `<img>`。
 *
 * @param {string} code SFC 源码
 * @param {Array<object>} mappings resourceDomMapping
 * @param {string} relBase 资源相对基准
 * @param {{ownerSectionId?:string}} [opts] 模板无 `data-section-id` 时的归属兜底
 * @returns {{code:string, changed:boolean, healed:Array, skipped:Array}}
 */
export function healMissingIconRender(code, mappings, relBase = '../resources/images/', opts = {}) {
  const result = { code, changed: false, healed: [], skipped: [] };
  if (typeof code !== 'string' || code.length === 0) return result;

  const range = templateRange(code);
  if (!range) return result;

  // ③ 零渲染前提：模板里连一个 img 都没有（有 img 属 R24 域）
  if (/<img\b/i.test(range.body)) {
    result.skipped.push({ reason: 'has-img' });
    return result;
  }
  // 没有文本子节点 ⇒ 不是标题类小组件，位置无从谈起
  const sectionIds = collectSectionIds(code);
  let sectionId = '';
  if (sectionIds.length === 1) sectionId = sectionIds[0];
  else if (sectionIds.length === 0 && opts?.ownerSectionId) {
    sectionId = String(opts.ownerSectionId);
  } else {
    result.skipped.push({
      reason: sectionIds.length === 0 ? 'no-section-id' : 'ambiguous-section',
      sectionIds,
    });
    return result;
  }

  const all = candidatesForSection(mappings, sectionId);
  const icons = all.filter((m) => m?.resourceFile && isIconRole(m) && usageIsImg(m));
  if (icons.length === 0) {
    result.skipped.push({ reason: 'no-icon-resource', sectionIds: [sectionId] });
    return result;
  }
  if (icons.length > 1) {
    result.skipped.push({
      reason: 'ambiguous-icon-resource',
      sectionIds: [sectionId],
      candidates: icons.length,
    });
    return result;
  }

  const mapping = icons[0];
  const fileName = String(mapping.resourceFile).split('/').pop();
  // ③ 零渲染：已经引用过该文件 ⇒ 不是缺图标
  if (code.includes(`resources/images/${fileName}`)) {
    result.skipped.push({ reason: 'already-referenced', sectionIds: [sectionId] });
    return result;
  }

  const position = decideInsertPosition(mapping);
  if (!position) {
    result.skipped.push({ reason: 'position-unknown', sectionIds: [sectionId] });
    return result;
  }

  const box = boxOf(mapping.figmaBox);
  const varName = varNameOf(mapping);
  if (!box || !varName) {
    result.skipped.push({ reason: !varName ? 'no-var-name' : 'no-size-truth', sectionIds: [sectionId] });
    return result;
  }

  const root = findSectionRootOpenTag(code, sectionIds.length === 1 ? sectionId : '');
  if (!root || !root.className) {
    result.skipped.push({ reason: 'no-root-element', sectionIds: [sectionId] });
    return result;
  }

  const w = Math.round(box.width * 100) / 100;
  const h = Math.round(box.height * 100) / 100;
  const imgTag =
    `<img :src="${varName}" class="${root.className}-icon" ` +
    `style="width:${w}px;height:${h}px;object-fit:contain;flex:none;" alt="" />`;

  // 宿主「单子项」保护：多子项宿主掰成 row 会打乱原布局 ⇒ 宁可不动（fail-open）
  const closeTag = `</${root.tagName}>`;
  const closeIdx = code.indexOf(closeTag, root.end);
  const siblingCount = closeIdx === -1 ? -1 : countTopLevelChildren(code, root.end, closeIdx);
  if (siblingCount > 1) {
    result.skipped.push({
      reason: 'host-has-multiple-children',
      sectionIds: [sectionId],
      children: siblingCount,
    });
    return result;
  }

  let out;
  if (position === 'prepend') {
    out = code.slice(0, root.end) + '\n    ' + imgTag + code.slice(root.end);
  } else {
    // append：插到根元素闭合标签之前
    const idx = closeIdx;
    if (idx === -1) {
      result.skipped.push({ reason: 'no-root-element', sectionIds: [sectionId] });
      return result;
    }
    out = code.slice(0, idx) + '  ' + imgTag + '\n  ' + code.slice(idx);
  }

  // 刀 45b：插入语义是「横向相邻」，宿主若为纵向（含共享 class 定义的 column，改 scoped 无效）
  //   ⇒ 在**该元素的内联 style** 上钉死 display:flex + flex-direction:row + align-items:center。
  //   位置与坐标一概不管（交给布局层），只保证「图标与文字同一行」。
  let axisLock = null;
  const lock = lockHostAxisInline(out, root);
  if (lock.changed) {
    out = lock.code;
    axisLock = { mode: lock.added[0] };
  }

  // script：补 import（已声明则不重复）
  if (!isDeclared(out, varName)) {
    const relPath = String(relBase || '').endsWith('/')
      ? `${relBase}${fileName}`
      : `${relBase}/${fileName}`;
    const withImport = insertImport(out, varName, relPath);
    if (withImport == null) {
      result.skipped.push({ reason: 'no-script-setup', sectionIds: [sectionId] });
      return result;
    }
    out = withImport;
  }

  result.code = out;
  result.changed = out !== code;
  if (result.changed) {
    result.healed.push({
      varName,
      resourceFile: mapping.resourceFile,
      sectionId,
      position,
      width: w,
      height: h,
      className: `${root.className}-icon`,
      axisLock,
    });
  }
  return result;
}
