/**
 * 🛡️ 标题装饰真值（2026-11-15 · mc-max-1794728034288-4bc53ccd 实锤）— 纯函数、零 IO。
 *
 * 病灶（同一产物三种形态并存 ⇒ 用户「有的标题有 icon 有的没有」）：
 *   ① `ContentDailyTotalFlow.vue` / `ContentFlowMonitor.vue` ⇒ 真 `<img>`（有 png 的两个）；
 *   ② `ChartSection.vue` / `ChartSection7.vue` / `ContentForecast.vue` ⇒ `<span class="...-icon">`
 *      **空占位**，样式表里只剩 `border-radius: 6px` + 一个空 `;`，**width/height/background 全丢**
 *      ⇒ 渲染 0×0 不可见；
 *   ③ `ContentVehicleDist.vue` ⇒ **连占位都没有**。
 *   Figma 真值侧 6/6 段都有装饰（`2:3561`/`2:3441`/`2:3573` 三层同构图标、`2:7626`/`2:7795`
 *   渐变竖条、`2:3552` 小圆点），所以「有的有有的没有」不是设计如此，是落地通道不一致。
 *
 * 根因（三层叠，均日志实证）：
 *   R1 同构去重只留首个所有者 —— 三个 18×18.25 图标子树签名相同，`sigGroups` 判重后
 *      `duplicates.push(); continue` ⇒ 只下载 `icon-3561.png`，另两段在 resourceDomMapping 里
 *      无 localPath ⇒ 恒 `missing`；
 *   R2 CSS 替代产出了真值却无人消费 —— `2:7626`/`2:7795` 日志实锤
 *      `🎨 CSS 替代（跳过下载）: icon {"css":"linear-gradient(180deg, #388dff 0%, #388dff 100%)"}`，
 *      但 `cssValue` 只进 prompt 文本，且「CSS 替代条目不分配语义变量名」⇒ 模型无法引用，
 *      只能靠自然语言记住 ⇒ 写空 span 时把 background 丢了；
 *   R3 守恒器数据源错层 —— `icon-truth-conservation#collectIconTruth` 只收 `resourceFile`（png），
 *      无 png 一律 `no-icon-truth` 跳过（真机 `skipped:["ChartSection.vue:no-icon-truth",
 *      "ChartSection7.vue:no-icon-truth","ContentForecast.vue:no-icon-truth"]` 恰是缺 icon 的三个）。
 *
 * ── 判据（可辩驳；零类名、零图层名、零绝对像素阈值）──────────────────────────
 *   装饰候选 D（在 Figma 树上直接判定，**不依赖资源下载**）：
 *     Ⓐ D 非 TEXT；
 *     Ⓑ D 有可见填充（自身 SOLID/GRADIENT，或子树内任一可见填充节点）；
 *     Ⓒ D 的同一父容器 P 内存在 TEXT 兄弟 T，且 |centerY(D) − centerY(T)| ≤ D.height * 0.6
 *        （同一行的装饰槽；`D.height*0.6` 无量纲，不随结构漂移）；
 *     Ⓓ P 是「标题行」：`P.height ≤ maxTextHeight(P) * HEADER_ROW_RATIO_MAX(2.0)` 且
 *        `P` 子树 TEXT 数 ≤ 2。**纯相对判据**：实测 `2:3559`=1.00 / `2:7625`=1.00 / `2:3439`=1.00 /
 *        `2:3571`=1.00 / `2:3550`=1.69 全部 ≤2.0，而内容行（统计卡 52/24=2.17）被排除；
 *     Ⓔ D 不是 P 的唯一子节点。
 *     Ⓖ 伴随 TEXT 非纯数字：纯数字计数（`^\d+$`）是 Tab 数字角标底板（badge-count）
 *       的充分信号，不是标题装饰（2026-11-17 路线A第二步，真机 e6cb4983 实锤：4 个
 *       18×18 红点因伴随 TEXT="2" 被插进全文每个 "2" 中间 ⇒ 红点遮字 + 8 TEXT 断裂）。
 *       标题装饰伴随 TEXT 恒含非数字字符（标签文案），不命中。
 *
 * ── 落地形态（按 D 子树构成决定，不靠猜）────────────────────────────────────
 *   · 子树内**全部**为 RECTANGLE/ELLIPSE（规则形状）⇒ CSS 逐层复刻（`glyphs`），矢量无损、
 *     随 rem 缩放、零额外网络请求。实测三层同构图标 `2:3561`/`2:3441`/`2:3573` 与竖条
 *     `2:7626`/`2:7795` 全部落此档。
 *   · 子树含 VECTOR（不规则路径，CSS 只能填矩形/椭圆 ⇒ 复刻必失真）⇒ `hasIrregularShape=true`，
 *     由调用方决定是否用已有 png（`2:3552` 已有 `g-3552.png`）。
 *
 * ── 产物侧落地（`applyHeaderDecorTruth`）────────────────────────────────────
 *   归属键 = **伴随 TEXT 原文**（不是几何、不是类名）：
 *     · 在模板里定位该文本首次出现（跳过 `<template #xxx>` 具名插槽 —— 那是 base-panel 壳层，
 *       装饰由壳层自己渲染）；
 *     · 取该文本的**直接父元素**为标题行容器；
 *     · 幂等三态：
 *       已有 `<img>` / `style` 含 `background|gradient` ⇒ 不动（尊重显式）；
 *       父内存在「空占位元素」（无文本、无渲染、class 在样式表里有绘制声明但无尺寸/背景）⇒ 原地替换；
 *       否则 ⇒ 在文本前插入。
 *   · 真值缺失 / 无模板 / 无伴随 TEXT / 非法形状且无 png ⇒ 一律 fail-open 原样返回。
 */

import { buildDrawClassIndex } from './icon-truth-conservation.js';

/* ── Figma 树 ───────────────────────────────────────────────────────────── */

const RULE_SHAPES = new Set(['RECTANGLE', 'ELLIPSE']);
const SKIP_TYPES = new Set(['TEXT', 'SLICE']);
/** 标题行容器高 / 内部最大 TEXT 高的上限（无量纲，见头注释 Ⓓ 实测）。 */
const HEADER_ROW_RATIO_MAX = 2.0;

function rootOf(figmaRoot) {
  if (!figmaRoot || typeof figmaRoot !== 'object') return null;
  const doc = figmaRoot.document;
  if (doc && typeof doc === 'object') return doc;
  return figmaRoot;
}

function indexTree(root) {
  const byId = new Map();
  const parentOf = new Map();
  const order = [];
  const walk = (node, parentId) => {
    if (!node || typeof node !== 'object') return;
    const id = node.id == null ? null : String(node.id);
    if (id) {
      byId.set(id, node);
      parentOf.set(id, parentId);
      order.push(id);
    }
    for (const child of Array.isArray(node.children) ? node.children : []) {
      walk(child, id);
    }
  };
  walk(root, null);
  return { byId, parentOf, order };
}

function boxOf(node) {
  if (!node || typeof node !== 'object') return null;
  const direct = node.absoluteBoundingBox;
  if (direct && Number.isFinite(direct.width) && Number.isFinite(direct.height)) {
    return {
      x: Number.isFinite(direct.x) ? direct.x : 0,
      y: Number.isFinite(direct.y) ? direct.y : 0,
      width: direct.width,
      height: direct.height,
    };
  }
  const rel = node.absoluteRenderBounds || node.size;
  if (rel && Number.isFinite(rel.width) && Number.isFinite(rel.height)) {
    return {
      x: Number.isFinite(rel.x) ? rel.x : 0,
      y: Number.isFinite(rel.y) ? rel.y : 0,
      width: rel.width,
      height: rel.height,
    };
  }
  return null;
}

function visibleFills(node) {
  const fills = Array.isArray(node && node.fills) ? node.fills : [];
  return fills.filter((f) => f && f.type && f.visible !== false);
}

function hexOf(color) {
  if (!color || typeof color !== 'object') return null;
  const to = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(255, Math.round(n * 255)));
  };
  return `#${to(color.r).toString(16).padStart(2, '0')}${to(color.g).toString(16).padStart(2, '0')}${to(color.b).toString(16).padStart(2, '0')}`;
}

/** Figma 渐变把手 → CSS 角度（0deg 向上、顺时针；与 figma-connector#_gradientAngleDeg 同口径）。 */
function gradientAngleDeg(fill) {
  const handles = fill && fill.gradientHandlePositions;
  if (!Array.isArray(handles) || handles.length < 2) return 180;
  const p0 = handles[0];
  const p1 = handles[1];
  if (!p0 || !p1) return 180;
  const dx = (p1.x ?? 0) - (p0.x ?? 0);
  const dy = (p1.y ?? 0) - (p0.y ?? 0);
  let angle = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
  if (angle < 0) angle += 360;
  return angle;
}

/** 单个节点的 fills → CSS background 值（多层 fill 用逗号叠加）。不可复刻返回 null。 */
function backgroundOf(node) {
  const fills = visibleFills(node);
  if (fills.length === 0) return null;
  const layers = [];
  for (const fill of fills) {
    if (fill.type === 'SOLID') {
      const hex = hexOf(fill.color);
      if (hex) layers.push(hex);
    } else if (fill.type === 'GRADIENT_LINEAR' && Array.isArray(fill.gradientStops)) {
      const stops = [...fill.gradientStops]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((s) => `${hexOf(s.color) || '#000000'} ${Math.round((s.position ?? 0) * 100)}%`);
      if (stops.length >= 2) layers.push(`linear-gradient(${gradientAngleDeg(fill)}deg, ${stops.join(', ')})`);
    } else if (fill.type === 'GRADIENT_RADIAL' && Array.isArray(fill.gradientStops)) {
      const stops = [...fill.gradientStops]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((s) => `${hexOf(s.color) || '#000000'} ${Math.round((s.position ?? 0) * 100)}%`);
      if (stops.length >= 2) layers.push(`radial-gradient(circle, ${stops.join(', ')})`);
    } else if (fill.type === 'IMAGE') {
      return null; // 位图填充 ⇒ 必须走 png
    } else {
      return null; // VIDEO 等未知类型 ⇒ 不复刻
    }
  }
  if (layers.length === 0) return null;
  // 多个 SOLID 叠加取最后一层（Figma 上层覆盖下层）；渐变优先于纯色
  const gradient = layers.filter((l) => /gradient\(/.test(l));
  if (gradient.length > 0) return gradient[gradient.length - 1];
  return layers[layers.length - 1];
}

function rounded(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * 把装饰节点 D 的子树拍平为 glyph 层（相对 D 左上角，深度优先、父先子后）。
 * @returns {{glyphs:Array, hasIrregularShape:boolean, hasImageFill:boolean, background:boolean}}
 */
function flattenGlyphs(node, origin, byId) {
  const glyphs = [];
  let hasIrregularShape = false;
  let hasImageFill = false;
  let background = false;

  const walk = (id, depth) => {
    const n = byId.get(id);
    if (!n) return;
    const box = boxOf(n);
    const type = String(n.type || '');
    const bg = backgroundOf(n);
    const fills = visibleFills(n);
    if (fills.some((f) => f.type === 'IMAGE')) {
      hasImageFill = true;
      return;
    }
    if (type === 'VECTOR') {
      hasIrregularShape = true;
      return;
    }
    if (box && (bg || type === 'GROUP' || type === 'FRAME')) {
      const radius = Number.isFinite(n.cornerRadius)
        ? rounded(n.cornerRadius)
        : Number.isFinite(n.rectangleCornerRadii?.[0])
          ? rounded(n.rectangleCornerRadii[0])
          : 0;
      if (bg) {
        glyphs.push({
          left: rounded(box.x - origin.x),
          top: rounded(box.y - origin.y),
          width: rounded(box.width),
          height: rounded(box.height),
          background: bg,
          borderRadius: radius,
          depth,
        });
        background = true;
      }
    } else if (type === 'VECTOR') {
      hasIrregularShape = true;
      return;
    }
    if (!RULE_SHAPES.has(type) && type !== 'GROUP' && type !== 'FRAME' && type !== 'COMPONENT' && type !== 'INSTANCE') {
      if (type && SKIP_TYPES.has(type) === false && type !== 'BOOLEAN_OPERATION') {
        // 非规则形状的其它类型也不计入 CSS
      }
    }
    const kids = Array.isArray(n.children) ? n.children : [];
    for (const k of kids) walk(String(k.id), depth + 1);
  };

  walk(String(node.id), 0);
  return { glyphs, hasIrregularShape, hasImageFill, background };
}

function subtreeTexts(id, byId) {
  const out = [];
  const walk = (nid) => {
    const n = byId.get(nid);
    if (!n) return;
    if (String(n.type) === 'TEXT') {
      const chars = String(n.characters ?? '').trim();
      if (chars) {
        const box = boxOf(n);
        out.push({ id: nid, text: chars, box });
      }
    }
    for (const c of Array.isArray(n.children) ? n.children : []) walk(String(c.id));
  };
  walk(id);
  return out;
}

function centerY(box) {
  return (box?.y ?? 0) + (box?.height ?? 0) / 2;
}

/**
 * 从 Figma 树采集「标题装饰」真值。零命名、零绝对像素阈值。
 *
 * @param {object} figmaRoot `{document}` 或直接 root 节点
 * @returns {Array<{decorId,parentId,textId,text,box,width,height,glyphs,background,
 *                  hasIrregularShape,hasImageFill,shape}>}
 */
export function collectHeaderDecorTruth(figmaRoot) {
  const root = rootOf(figmaRoot);
  if (!root) return [];
  const { byId, parentOf } = indexTree(root);
  if (byId.size === 0) return [];

  const out = [];
  for (const [decorId, node] of byId) {
    const type = String(node.type || '');
    if (type === 'TEXT' || SKIP_TYPES.has(type)) continue;

    const decorBox = boxOf(node);
    if (!decorBox || decorBox.width <= 0 || decorBox.height <= 0) continue;

    // Ⓑ 有可见填充（自身或子树）
    const ownFill = visibleFills(node).length > 0;
    const parentId = parentOf.get(decorId);
    const parent = parentId ? byId.get(parentId) : null;
    if (!parent) continue;
    // Ⓔ 不是父的唯一子节点
    const siblings = Array.isArray(parent.children) ? parent.children : [];
    if (siblings.length < 2) continue;

    // Ⓒ 同父 TEXT 兄弟 + 垂直中心对齐
    const textSiblings = siblings
      .filter((c) => String(c.type) === 'TEXT')
      .map((c) => ({ id: String(c.id), node: c, box: boxOf(c), text: String(c.characters ?? '').trim() }))
      .filter((t) => t.text && t.box);
    if (textSiblings.length === 0) continue;
    const tol = Math.max(1, decorBox.height * 0.6);
    const aligned = textSiblings.find((t) => Math.abs(centerY(t.box) - centerY(decorBox)) <= tol);
    if (!aligned) continue;

    // Ⓖ 伴随 TEXT 是纯数字 ⇒ 圆点是「数字角标底板」，不是标题装饰。
    //    真机 mc-max-1794924107581-e6cb4983（及 30260c7a/199d09af）实锤：Tab 的
    //    `badge-count-01..04`（2:9033/9036/9039/9042，父 group 18×18，子=18×18 红点 +
    //    纯数字 TEXT "6"/"2"/"2"/"2"）被 ⒸⒹⒺ 判为标题装饰；因归属键=伴随 TEXT 原文，
    //    "2" 在全文多处复用（15:32 / G2京沪高速 / 上行Yk2+9…），红点被插进每个 "2" 中间
    //    ⇒ 十几处「臆造大红点遮字」+ 8 个 TEXT 被切断比对失败（覆盖率缺口）。
    //    标题装饰的伴随 TEXT 恒为标签文案（含非数字字符）；纯数字计数是角标底板的充分信号。
    //    零命名、零绝对像素阈值，与既有判据同源。
    if (/^\d+$/.test(aligned.text)) continue;

    // Ⓓ 装饰的**直接父容器**就是「标题行」：高 ≤ 最大 TEXT 高 × 2.0 且 TEXT 数 ≤ 2。
    //    取 parent 而非 parent 的父：实测 `2:7625 sub-title`(h=21) / `2:3559 标题`(h=24.34) /
    //    `2:3439 4sub-header`(h=24.34) / `2:3571 tit`(h=24.34) 本身就是标题行容器；
    //    再上溯一层会拿到 `1744:127 charts`(h=131) ⇒ ratio 6.2 被整段排除（首版实测漏 4/6）。
    const rowNode = parent;
    const rowBox = boxOf(rowNode);
    if (!rowBox) continue;
    // 装饰必须是**纯图形**：子树内不得有 TEXT（否则是下拉框/卡片容器，不是标题图标）。
    // 实测 `2:3547`（24小时下拉背景 100×30.42）子树含「24小时」⇒ 被本约束排除。
    if (subtreeTexts(decorId, byId).length > 0) continue;
    const rowTexts = subtreeTexts(String(parent.id), byId);
    if (rowTexts.length === 0 || rowTexts.length > 2) continue;
    const maxTextH = Math.max(...rowTexts.map((t) => t.box?.height ?? 0));
    if (!(maxTextH > 0)) continue;
    if (rowBox.height > maxTextH * HEADER_ROW_RATIO_MAX) continue;
    // Ⓕ 装饰宽度 ≤ 行内 TEXT 高 × 2 —— 标题装饰是「图标/竖条」量级，不是控件底板。
    //    实测 `2:3547`（24小时下拉背景 100×30.42，行内 TEXT 高 21.30）⇒ 100 > 42.6 被排除；
    //    而 `2:3561`(18 vs 48.68) / `2:7626`(3 vs 42) / 图例 `2:7589`(10 vs 24) 全部保留。
    if (decorBox.width > maxTextH * 2) continue;

    // 子树必须真有可见内容（否则是空占位节点，不是装饰）
    const flat = flattenGlyphs(node, decorBox, byId);
    if (!ownFill && !flat.background && !flat.hasIrregularShape && !flat.hasImageFill) continue;
    // 既无 CSS 层也无不规则形状 ⇒ 抽不出任何可见事实（如 8×4.47 的下拉箭头占位），不产出。
    if (flat.glyphs.length === 0 && !flat.hasIrregularShape && !flat.hasImageFill) continue;

    out.push({
      decorId,
      parentId: String(parent.id),
      rowId: String(rowNode.id),
      textId: aligned.id,
      text: aligned.text,
      box: {
        x: rounded(decorBox.x),
        y: rounded(decorBox.y),
        width: rounded(decorBox.width),
        height: rounded(decorBox.height),
      },
      width: rounded(decorBox.width),
      height: rounded(decorBox.height),
      glyphs: flat.glyphs,
      background: flat.background,
      hasIrregularShape: flat.hasIrregularShape,
      hasImageFill: flat.hasImageFill,
      shape: flat.hasIrregularShape || flat.hasImageFill ? 'irregular' : 'css',
    });
  }

  // 去重：同一伴随 TEXT 只保留面积最大（最外层）的一个装饰
  const byText = new Map();
  for (const d of out) {
    const prev = byText.get(d.text);
    if (!prev || d.width * d.height > prev.width * prev.height) byText.set(d.text, d);
  }
  return [...byText.values()];
}

/* ── 产物落地 ───────────────────────────────────────────────────────────── */

const TAG_RE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 生成装饰 HTML（CSS 形态）。所有长度 px 由产物侧 pxtorem 处理。
 *  @param {boolean} [inline] true ⇒ `display:inline-block`（插在文本流内，与文字同行）；否则 block（行内 flex 槽）。 */
export function renderDecorHtml(decor, inline = false) {
  if (!decor || decor.shape !== 'css' || !Array.isArray(decor.glyphs) || decor.glyphs.length === 0) {
    return null;
  }
  const w = num(decor.width);
  const h = num(decor.height);
  const display = inline
    ? 'display:inline-block;vertical-align:middle;margin-right:4px;'
    : 'display:block;';
  const base =
    `position:relative;${display}width:${w}px;height:${h}px;flex:none;pointer-events:none;`;
  if (decor.glyphs.length === 1) {
    const g = decor.glyphs[0];
    const bg = g.background;
    const radius = g.borderRadius > 0 ? `border-radius:${g.borderRadius}px;` : '';
    // 单层：直接用自身盒子（无需绝对定位包装）
    const sameBox =
      Math.abs(g.left) < 0.01 &&
      Math.abs(g.top) < 0.01 &&
      Math.abs(g.width - w) < 0.51 &&
      Math.abs(g.height - h) < 0.51;
    if (sameBox) {
      return `<span class="mc-header-decor" style="${base}background:${bg};${radius}"></span>`;
    }
    return (
      `<span class="mc-header-decor" style="${base}">` +
      `<i style="position:absolute;left:${g.left}px;top:${g.top}px;width:${g.width}px;height:${g.height}px;background:${bg};${radius}"></i>` +
      `</span>`
    );
  }
  const layers = decor.glyphs
    .map((g) => {
      const radius = g.borderRadius > 0 ? `border-radius:${g.borderRadius}px;` : '';
      return (
        `<i style="position:absolute;left:${g.left}px;top:${g.top}px;` +
        `width:${g.width}px;height:${g.height}px;background:${g.background};${radius}"></i>`
      );
    })
    .join('');
  return `<span class="mc-header-decor" style="${base}">${layers}</span>`;
}

/** 解析模板为带文本区间的轻量树（容错，不依赖 DOM）。 */
function parseTemplate(body) {
  const roots = [];
  const stack = [];
  const rx = new RegExp(TAG_RE.source, 'g');
  let last = 0;
  let m;
  const textChunks = [];
  while ((m = rx.exec(body)) !== null) {
    if (m.index > last) {
      const parent = stack[stack.length - 1];
      if (parent) textChunks.push({ text: body.slice(last, m.index), start: last, end: m.index, parent });
    }
    last = m.index + m[0].length;
    if (m[2] === undefined) continue;
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] || '';
    if (closing) {
      let idx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          idx = i;
          break;
        }
      }
      if (idx === -1) continue;
      const node = stack[idx];
      node.closeStart = m.index;
      node.closeEnd = last;
      stack.length = idx;
      continue;
    }
    const selfClose = /\/\s*$/.test(attrs) || /^(?:img|br|hr|input|meta|link|source|area|base)$/i.test(tag);
    const parent = stack[stack.length - 1] || null;
    const node = { tag, attrs, classes: classesOf(attrs), parent, children: [], openStart: m.index, openEnd: last, selfClose };
    if (!selfClose) {
      node.closeStart = null;
      node.closeEnd = null;
    }
    if (parent) parent.children.push(node);
    else roots.push(node);
    if (!selfClose) {
      node.closeStart = null;
      node.closeEnd = null;
      stack.push(node);
    }
  }
  if (body.length > last) {
    const parent = stack[stack.length - 1];
    if (parent) textChunks.push({ text: body.slice(last), start: last, end: body.length, parent });
  }
  return { roots, textChunks };
}

function classesOf(attrs) {
  const m = /class\s*=\s*["']([^"']*)["']/i.exec(attrs || '');
  return m ? m[1].trim().split(/\s+/).filter(Boolean) : [];
}

function hasRenderableInSubtree(node) {
  if (/<img\b/i.test(node.attrs || '')) return true;
  if (/\b(?:v-if|v-for|v-html|v-text)\b/.test(node.attrs || '')) return true;
  if (/(?::src|v-bind:src|src)\s*=/i.test(node.attrs || '')) return true;
  return node.children.some(hasRenderableInSubtree);
}

function hasBackgroundInSubtree(node, drawClasses) {
  const own = /background(?:-image|-color)?\s*:\s*(?!transparent|none)/i.test(node.attrs || '');
  if (own) return true;
  if (classesOf(node.attrs).some((c) => drawClasses.has(c))) return true;
  return node.children.some((c) => hasBackgroundInSubtree(c, drawClasses));
}

/** 元素是否带**动态**样式绑定（`:style` / `v-bind:style`）。
 *
 *  空槽替换必须排除它：动态背景/尺寸在运行时才有，模板文本里看不到 ⇒ 替换必丢信息。
 *  （静态 `style="background:...;width:426px"` 不在此列 —— 它由 ① 档匹配后的
 *   「尺寸同量级」判据拦，见 applyHeaderDecorTruth 内 `slotSizeMatchesDecor`。） */
function hasDynamicStyleBinding(attrs) {
  return /(?::style|v-bind:style)\s*=/.test(attrs || '');
}

/** 空占位候选：有闭合、无子元素、子树无文本无渲染（模板里写了 `<span class="...-icon"></span>` 但没内容）。 */
function isEmptySlot(node, tpl) {
  if (node.closeEnd == null || node.openEnd == null) return false;
  // 已落地装饰（单层形态无子元素）不得再被当作空占位，否则第二轮 replaced 计数复燃
  if (Array.isArray(node.classes) && node.classes.includes('mc-header-decor')) return false;
  // 动态 style 绑定（背景/尺寸运行时决定）⇒ 替换必丢信息
  if (hasDynamicStyleBinding(node.attrs)) return false;
  if (node.children.length > 0) return false;
  if (/\{\{/.test(tpl.slice(node.openEnd, node.closeEnd))) return false;
  const inner = tpl.slice(node.openEnd, node.closeStart ?? node.closeEnd);
  return inner.trim() === '';
}

/** 空槽自身尺寸是否与真值装饰同量级。无尺寸信息 ⇒ 认（可能是纯 class 定尺寸的图标位）。
 *  反例（真机 mc-max-1794731570445-ca763935 同族形态）：段背景层
 *  `<div class="bg" style="background-image:url(bg-1.png);width:426px;height:91px"></div>`
 *  无子元素无文本，旧判定会把它当空槽 ⇒ **整块背景被替换成装饰环、背景图丢失**。
 *  用「与真值装饰尺寸同量级」拦下它，同时不误伤「带臆造底色的小空槽」（真机常态，
 *  必须被规范化为真值，而不是跳过）。 */
function slotSizeMatchesDecor(attrs, decor) {
  const { w, h } = inlineSizePx(attrs);
  if (w == null && h == null) return true;
  const dw = Number(decor?.width) || 0;
  const dh = Number(decor?.height) || 0;
  const okW = w == null || dw <= 0 || Math.abs(w - dw) <= Math.max(dw * SIZE_REL_TOL, 4);
  const okH = h == null || dh <= 0 || Math.abs(h - dh) <= Math.max(dh * SIZE_REL_TOL, 4);
  return okW && okH;
}

function subtreeFirstText(node, tpl) {
  const inner = tpl.slice(node.openEnd, node.closeEnd ?? tpl.length);
  const stripped = inner.replace(/<[^>]*>/g, ' ').replace(/\{\{[\s\S]*?\}\}/g, ' ');
  const trimmed = stripped.replace(/\s+/g, ' ').trim();
  return trimmed;
}

/** 该「行」是否已有真实图形。
 *  只看 **DOM 事实**（`<img>` / 自身或子树 style 里的 background / 已落地的 `mc-header-decor`），
 *  **不看样式表 drawIndex** —— 空占位 span 的 class 往往在 drawIndex 里（`border-radius:6px`），
 *  按样式表递归判定会把它自己算成「已画图形」⇒ 5/6 被 keptExplicit 吞掉（首版实测
 *  ChartSection/ChartSection7 全被误跳过）。递归是**幂等必需**：装饰落在子元素 `<i>` 上，
 *  只看直接子节点会导致第二轮重复插入（实测 inserted=2 复燃）。 */
function rowHasRealGraphic(node, drawIndex) {
  if (!node) return false;
  if (node.tag === 'img') return true;
  if (/(?::src|v-bind:src|src)\s*=/i.test(node.attrs || '')) return true;
  if (/background(?:-image|-color)?\s*:\s*(?!transparent|none)/i.test(node.attrs || '')) return true;
  const cls = Array.isArray(node.classes) ? node.classes : [];
  if (cls.includes('mc-header-decor')) return true;
  // 样式表里确实画了图形（图例色块 `.legend-dot` 这类背景写在 <style> 而非 inline）
  if (drawIndex && cls.some((c) => drawIndex.has(c))) return true;
  return (node.children || []).some((c) => rowHasRealGraphic(c, drawIndex));
}

/** 该节点子树是否含非空文本（自闭合节点如 `<img>` 恒 false）。
 *  ⚠️ 不能用 `subtreeFirstText`：它对无 `closeEnd` 的节点会 slice 到 tpl 末尾（兜底语义），
 *  在「行容器上溯」里会把整段剩余文本算进来 ⇒ 上溯一步就停，回到固定层数的老问题。 */
function hasAnyText(node, tpl) {
  if (!node || node.openEnd == null) return false;
  const end = node.closeEnd == null ? node.openEnd : node.closeEnd;
  const inner = tpl.slice(node.openEnd, end);
  // ⚠️ 插值 `{{ it.title.text }}` 也算文本：旧实现把 `{{…}}` 一并剔掉后判空，
  //   导致数据驱动的卡片/图例（真机 mc-max-1794733122406-49445bf4 的 ListSection 车型分布）
  //   被判成「无文本」⇒ 其内部色块被当成标题图标 ⇒ 该段装饰永久缺失。
  return inner.replace(/<[^>]*>/g, ' ').trim().length > 0;
}

/** 行容器 = 含该文本、且父级的**其它兄弟都不含文本**的最小祖先。
 *
 *  为什么不能固定上溯 N 层（真机 mc-max-1794731570445-ca763935 实锤）：
 *    ① `<div class="forecast-header"><img/><div class="header"><span>流量预测</span></div></div>`
 *       —— img 是文本容器的**伯父**（不是兄弟），固定上溯 2 层落在 `div.header`，其子树
 *       不含 img ⇒ 判「无图标」⇒ 又插一份 CSS 环 ⇒ **标题前出现两个图标**。
 *    ② `<div class="header"><div class="icon"><img/></div><span>当日总流量</span></div>`
 *       —— 同层兄弟里是 `.icon` 容器（img 在里层），2 层上溯恰好命中，属侥幸。
 *  本函数把「行」定义成结构事实（不含其它文本的最宽祖先），两种形态都归一到同一行容器。 */
function rowContainerFor(textNode, tpl) {
  let node = textNode?.parent;
  guard: while (node && node.parent) {
    const siblings = (node.parent.children || []).filter((c) => c !== node);
    // 兄弟里还有文本 ⇒ 这一层已跨出「同一视觉行」，不能再上溯
    if (siblings.some((c) => hasAnyText(c, tpl))) break guard;
    node = node.parent;
  }
  return node;
}

/** 内联 width/height（px）。真值装饰尺寸 vs 候选图形尺寸同量级才认「同一图标」。 */
function inlineSizePx(attrs) {
  const w = /\bwidth\s*:\s*([\d.]+)px/i.exec(attrs || '');
  const h = /\bheight\s*:\s*([\d.]+)px/i.exec(attrs || '');
  return { w: w ? parseFloat(w[1]) : null, h: h ? parseFloat(h[1]) : null };
}

/** 尺寸同量级容差（相对）。取 0.4 的理由：真机同图标产物尺寸偏差 ≤1px
 *  （真值 18×18.25 vs 产物 18×19 / 18×18.25），而「段背景大图」与图标差一个数量级
 *  （426×91 vs 18×18.25，相对差 >20 倍）⇒ 0.4 能把两者彻底分开，不是拍脑袋阈值。 */
const SIZE_REL_TOL = 0.4;

/** 节点自身/子树里是否已有「尺寸与真值装饰同量级」的真实图形。
 *
 *  与 `rowHasRealGraphic` 的分工：
 *    · `rowHasRealGraphic` = 「有没有图形」（用于同层空槽判定，尺寸不敏感）；
 *    · 本函数 = 「有没有**就是这颗**图标」（用于跨父级兄弟判定，必须带尺寸约束，
 *      否则「段背景图兄弟」会把装饰误判成已存在 ⇒ 该有的图标反而缺失）。
 *  无内联尺寸时返回 true（尺寸不可知 ⇒ 保守视作已存在，与旧行为一致，避免双份）。
 *  已落地的 `mc-header-decor` 自身带尺寸 ⇒ 幂等（第二轮判「已有」，不叠加）。 */
function graphicSizedLikeDecor(node, decor, drawIndex, tpl) {
  if (!node) return false;
  const attrs = node.attrs || '';
  const cls = Array.isArray(node.classes) ? node.classes : [];
  // 含文本的节点**自身不算图标**（即便 class 命中 drawIndex —— 样式表里 title 类常带
  // color/font 声明，会被 drawIndex 收成「画了图形」）⇒ 只继续看它的子节点。
  // 真机 mc-max-1794732579015-c0c1f466：`<span class="title-text">车型分布</span>` 就这样
  // 被误判成「已有图标」，导致该段装饰永远不落。
  const textish = !!tpl && hasAnyText(node, tpl);
  const hasGraphic =
    node.tag === 'img' ||
    /(?::src|v-bind:src|\bsrc)\s*=/i.test(attrs) ||
    /background(?:-image|-color)?\s*:\s*(?!transparent|none)/i.test(attrs) ||
    cls.includes('mc-header-decor') ||
    (drawIndex && cls.some((c) => drawIndex.has(c)));
  if (hasGraphic && !textish) {
    const { w, h } = inlineSizePx(attrs);
    if (w == null || h == null) return true;
    const dw = Number(decor?.width) || 0;
    const dh = Number(decor?.height) || 0;
    const okW = dw <= 0 || Math.abs(w - dw) <= Math.max(dw * SIZE_REL_TOL, 2);
    const okH = dh <= 0 || Math.abs(h - dh) <= Math.max(dh * SIZE_REL_TOL, 2);
    return okW && okH;
  }
  return (node.children || []).some((c) => graphicSizedLikeDecor(c, decor, drawIndex, tpl));
}

/**
 * 在产物文件里落地标题装饰。
 *
 * 两档锚点（都只用**文本原文**做归属键，不用类名/几何）：
 *   ① 精准档 —— 模板里已有「空占位元素」（`<span class="...-icon"></span>` 这类无内容叶子），
 *      取它所在行的第一个非空文本去匹配真值 ⇒ **原地替换**（保留原 DOM 位置与 flex 槽语义）；
 *   ② 补插档 —— 没有空占位时，按文本定位，在该文本元素内**前缀内联插入**
 *      （`display:inline-block;vertical-align:middle`，与文字同行，不假设父级 flex 方向）。
 *
 * @param {Record<string,string>} files 原地修改
 * @param {Array} decorTruth `collectHeaderDecorTruth` 的输出
 * @param {{drawIndex?:Set<string>, onlyPaths?:string[]}} [opts]
 * @returns {{files:object, stats:object, changes:Array}}
 */
export function applyHeaderDecorTruth(files, decorTruth, opts = {}) {
  const stats = {
    evaluated: 0,
    truth: 0,
    files: 0,
    inserted: 0,
    replaced: 0,
    keptExplicit: 0,
    irregularSkipped: 0,
    textNotFound: 0,
    changes: [],
  };
  if (!files || typeof files !== 'object') return { files, stats, changes: [] };
  const truth = Array.isArray(decorTruth) ? decorTruth.filter((d) => d && d.text) : [];
  stats.truth = truth.length;
  if (truth.length === 0) return { files, stats, changes: [] };

  const drawIndex = opts.drawIndex instanceof Set ? opts.drawIndex : buildDrawClassIndex(files);
  const onlyPaths = Array.isArray(opts.onlyPaths) ? new Set(opts.onlyPaths) : null;

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !/\.vue$/.test(path)) continue;
    if (onlyPaths && !onlyPaths.has(path)) continue;
    const tplMatch = /<template[^>]*>([\s\S]*)<\/template>\s*(?:<script|<style|$)/.exec(content);
    if (!tplMatch) continue;
    const tplStart = tplMatch.index + tplMatch[0].indexOf(tplMatch[1]);
    const tpl = tplMatch[1];
    const { roots, textChunks } = parseTemplate(tpl);
    if (textChunks.length === 0) continue;

    stats.files += 1;
    const edits = [];
    const used = new Set();

    // ── ① 精准档：空占位元素 → 按所在行文本匹配
    const slots = [];
    const collectSlots = (node) => {
      if (isEmptySlot(node, tpl) && node.parent && node.parent.children.length >= 2) slots.push(node);
      for (const c of node.children) collectSlots(c);
    };
    for (const r of roots) collectSlots(r);

    for (const slot of slots) {
      const rowText = subtreeFirstText(slot.parent, tpl);
      if (!rowText) continue;
      const decor = truth.find((d) => !used.has(d.decorId) && d.text && rowText.includes(d.text));
      if (!decor) continue;
      // 尺寸量级不符 ⇒ 这不是「该图标的位置」，是布局块（段背景层等）。留给 ② 档按文本内联插入。
      if (!slotSizeMatchesDecor(slot.attrs, decor)) continue;
      const html = renderDecorHtml(decor, false);
      if (!html) {
        stats.irregularSkipped += 1;
        continue;
      }
      stats.evaluated += 1;
      const others = slot.parent.children.filter((c) => c !== slot);
      // ⚠️ 只把「不含文本」的兄弟当「已有图形」。
      //   真机 mc-max-1794732579015-c0c1f466 实锤：`<div class="title-block"><span class="icon"></span>
      //   <span class="title-text">当日总流量</span></div>` 里 title-text 的 class 命中了
      //   `buildDrawClassIndex`（样式表里该 class 有非图形声明）⇒ 旧判据 `rowHasRealGraphic`
      //   把它当「已画图形」⇒ keptExplicit 误拦 ⇒ 该段标题的环永远不落（用户报「有的有有的没有」）。
      //   文本元素本身不可能是「标题前图标」，必须排除。
      const othersGraphic = others.some((c) => !hasAnyText(c, tpl) && rowHasRealGraphic(c, drawIndex));
      const parentInlinePaint =
        /background(?:-image|-color)?\s*:\s*(?!transparent|none)/i.test(slot.parent.attrs || '') ||
        /(?::style|v-bind:style)\s*=/.test(slot.parent.attrs || '');
      if (othersGraphic || parentInlinePaint) {
        stats.keptExplicit += 1;
        used.add(decor.decorId);
        continue;
      }
      edits.push({ start: slot.openStart, end: slot.closeEnd, text: html, kind: 'replace' });
      stats.replaced += 1;
      used.add(decor.decorId);
    }

    // ── ② 补插档：无空占位 ⇒ 文本元素内前缀内联插入
    for (const decor of truth) {
      if (used.has(decor.decorId)) continue;
      const target = textChunks.find((c) => c.text.includes(decor.text));
      if (!target) {
        stats.textNotFound += 1;
        continue;
      }
      stats.evaluated += 1;
      // 行 = 结构事实（不含其它文本的最宽祖先），不是固定层数 —— 见 rowContainerFor 注释。
      const row = rowContainerFor(target, tpl) || target.parent?.parent || target.parent;
      const peers = row?.parent ? (row.parent.children || []).filter((c) => c !== row) : [];
      // 双份图标防线：跨父级的兄弟（如 forecast-header 里的 `<img>`）也要认。
      // 必须带尺寸约束 —— 段背景大图兄弟不能被当成「标题图标已存在」。
      if (
        graphicSizedLikeDecor(row, decor, drawIndex, tpl) ||
        peers.some((p) => graphicSizedLikeDecor(p, decor, drawIndex, tpl))
      ) {
        stats.keptExplicit += 1;
        used.add(decor.decorId);
        continue;
      }
      const html = renderDecorHtml(decor, true);
      if (!html) {
        stats.irregularSkipped += 1;
        continue;
      }
      const at = target.start + target.text.indexOf(decor.text);
      edits.push({ start: at, end: at, text: html, kind: 'insert' });
      stats.inserted += 1;
      used.add(decor.decorId);
    }

    if (edits.length === 0) continue;
    const sorted = [...edits].sort((a, b) => b.start - a.start);
    let next = content;
    for (const e of sorted) {
      const s = tplStart + e.start;
      const en = tplStart + e.end;
      next = next.slice(0, s) + e.text + next.slice(en);
    }
    if (next !== content) {
      files[path] = next;
      stats.changes.push({
        file: path,
        inserted: edits.filter((e) => e.kind === 'insert').length,
        replaced: edits.filter((e) => e.kind === 'replace').length,
      });
    }
  }

  return { files, stats, changes: stats.changes };
}

/** 恒打计数行（0 也打，杜绝「没跑」与「零命中」不可分）。 */
export function formatHeaderDecorLog(stats) {
  const s = stats || {};
  return (
    `headerDecorTruth:evaluated=${num(s.evaluated)},files=${num(s.files)},` +
    `truth=${num(s.truth)},inserted=${num(s.inserted)},replaced=${num(s.replaced)},` +
    `keptExplicit=${num(s.keptExplicit)},irregularSkipped=${num(s.irregularSkipped)},` +
    `textNotFound=${num(s.textNotFound)}`
  );
}
