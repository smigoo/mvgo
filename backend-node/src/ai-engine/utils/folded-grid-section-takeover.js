/**
 * 🛡️ 刀 53（2026-10-22）：同构「标题行 + 折叠网格」叶段确定性接管。
 *
 * 病灶（mc-1792654910735-837fd806 第九轮实锤）：三个 section 在 Figma 完全同构
 * （bg + icon/TEXT 标题行 + N 个 126×30 r6 卡的网格行），但生成层把它们拆成
 * 7 个独立 LLM chunk，每个 chunk 自由决定类名、数据内联 vs prop、标题写法、
 * justify-content —— 确定性刀具（刀 38/41/49/50/51/52）只能逐维钉，没钉到的
 * 维度每轮重新随机：
 *   ① 普通段标题居中：LLM 给 `.c-component-header-text3` 写了 justify-content:center
 *     （共享样式表按文件序后写者胜）——真值是三段都左对齐（icon 最左）。
 *   ② 优质厂商 0 张卡：CardGridList.vue 用 `defineProps({ list: () => [] })`，
 *     而 index.vue 引用时未传 —— 数据通道每轮随机，真值 12 卡直接消失。
 *   ③ 卡片 r6 圆角丢失：LLM chunk 漏写。
 *
 * 治本：沿用「确定性接管」模式 —— 判据读 Figma 真值，命中「标题行叶 / 折叠网格叶」
 * 的 plan 叶子，其子组件文件**整文件由本模块确定性渲染**（跳过 LLM chunk）：
 *   - 数据必然内联（无 defineProps，0 卡不可能复发）；
 *   - 标题必然左对齐（justify-content:flex-start 显式内联）；
 *   - 类名按 section id 派生、组件内唯一（微码全局注入下「后写者胜」不可证 ⇒ 唯一名免疫）；
 *   - 几何/颜色/字号全部从 Figma 真值推导，逐属性缺失即 fail-open（不猜）。
 *
 * 判据单一来源纪律：
 *   - 网格几何**必须**复用 `grid-list-layout-contract.js#buildGridContract`
 *     （与刀 41 同一份几何判据，禁止副本）；
 *   - 颜色转换复用 `section-tree.js#fillToRgba`（与 visual-parser/prompt-builder 同口径）。
 *
 * 纯函数（不读盘、不改入参）。任何事实缺失/形态不符 ⇒ 不接管（fail-open，LLM 原路径）。
 */

import {
  collectLeafSections,
  assignSectionComponentNames,
  indexFigmaNodes,
  fillToRgba,
  splitTitleValueByStyle,
  // 外观三件套真值（bg/border/pad）—— 单一来源，刀具不得自造 fills/strokes 解析
  nodeAppearanceTruth,
} from './section-tree.js';
import { buildGridContract, uniformPitch } from './grid-list-layout-contract.js';
import { declaredTableHeaders } from './section-type-derive.js';
// 🛡️ 刀33：列表 item 的**卡盒真值**回收要按「行填充色」归一比较（与 N1 真值色值门禁
//   同一口径，禁止自造颜色归一），故引入 `normalizeCssColor`（纯函数、零依赖，无环）。
import { normalizeCssColor } from './truth-color-usage-guard.js';
// 🛡️ 刀33：item 内「图条」背景四件套（size/position/repeat）**必须**复用资源挂载层
//   同一份纯函数判据（`inferBackgroundStyle`），否则 item 挂载形态与容器挂载形态
//   会分叉成两套 geometry（正是「容器画一遍、item 画另一遍」的温床）。
import { inferBackgroundStyle } from './background-size-inference.js';

/**
 * 🛡️ 刀 53 命名空间识别器（**唯一来源**，2026-10-22 round-12 实锤后提取）。
 *
 * 类名形如 `c-{sem}-fg-{header|grid}-{idSlug}`。这些类的关键属性由本模块
 * **内联钉死 + style 块自持**，任何后置管线改写都会把真值换掉：
 *   ① font-size-normalizer 把 `font-size:16px` 归一成 `calc(@fontSize * 1.1429)`
 *      ⇒ 实测 13.71px，Figma 真值 16px 丢失（round-10/12 实锤）；
 *   ② layout-facts-injector 给宿主 class 写 `flex-direction:column;flex:1.548 1 0`
 *      ⇒ 与内联的 `row` 对抗，靠内联优先级侥幸赢，脆弱且是「后写者胜」的温床；
 *   ③ extractTemplateClassNames 把 fg- 类当模板类硬约束 ⇒ LLM 编造规则（round-11）。
 *
 * 因此 font-size-normalizer / layout-facts-injector / code-validator **必须 import 本常量**，
 * 禁止各自写正则副本（副本 ≥2 份 = 事故温床）。
 */
/**
 * 刀 53 确定性接管产物的类名签名（**唯一来源**：字号归一豁免、孤儿样式守卫、
 * 布局事实注入豁免等全部从这里取）。
 * 🔴 新增 kind 必须**同步**登记到这里 —— 否则该 kind 的内联 `font-size` 不被
 *    `font-size-normalizer#protectFgTagInlineStyles` 保护 ⇒ 字号塌回 `@fontSize`
 *    （d072d085 实锤病灶之一），且 `DEFAULT_SKIP_SELECTOR_RXS` 也会漏掉它。
 */
export const FG_TAKEOVER_CLASS_RX = /-fg-(?:header|grid|kvgrid|text|icon|statrow|table|legend|list)-/;

/** fg- 类名的**裸片段**（去两侧 `/`），供需要拼接正则的场合复用，杜绝副本。 */
const FG_CLASS_SRC = FG_TAKEOVER_CLASS_RX.source;

/**
 * 🛡️ 剔除样式内容里的 **fg- 类规则块**（命名空间隔离，round-13 实锤）。
 *
 * 契约：`c-{sem}-fg-{header|grid}-*` 只允许出现在刀 53 接管文件自带的 style 块里。
 * 出现在 common.less / index.css 里的 fg- 规则一律是「LLM 从既有产物上下文照抄类名
 * 后编造」或「consolidator 从子组件提升上去的副本」，编译后经预览注入
 * （`[data-preview-scope] .light .c-…`，特异性 0,3,0）会**压过**子组件 scoped 规则，
 * 把真值换掉（实测 font-size 16px → 13.71px、flex-direction 被写成 column）。
 *
 * 纯函数：命中选择器的规则块整块删除，其余字节不动。
 * @param {string} text
 * @returns {{ text:string, removed:number }}
 */
export function stripFgTakeoverRules(text = '') {
  if (typeof text !== 'string' || !text) return { text: String(text ?? ''), removed: 0 };
  let removed = 0;
  // ⚠️ 选择器捕获必须**排除 `;`**：否则会把前面 `@import …;` / 注释 / 上一条声明
  //   一起吞进 pre 之前的部分，删除时连带误删（单测实锤）。故用两段捕获：
  //   `pre`（原样保留） + `sel`（含 -fg- 的选择器，连同块体一起删）。
  // 🔴 类名片段**必须**由 `FG_TAKEOVER_CLASS_RX` 拼出（单一来源）：此前此处硬编码
  //   `(?:header|grid)` 是副本，刀 53b/53c 扩到 text/icon 时未同步 ⇒ text/icon 的
  //   编造规则从未被剔除（静默漏网）。改用常量后新增 kind 自动生效。
  const rx = new RegExp(
    `([^{};]*?)([^{};,/*]*?${FG_CLASS_SRC}[^{};]*?)\\s*\\{[^{}]*\\}`,
    'g',
  );
  const out = text.replace(rx, (_whole, pre) => {
    removed += 1;
    return pre;
  });
  return { text: out, removed };
}

/** 条目 → 数组（null/undefined ⇒ []）。 */
function toArray(x) {
  return Array.isArray(x) ? x : x == null ? [] : [x];
}

/** 节点 bbox（Figma 树原始节点形态）。 */
function bboxOf(node) {
  const b = node?.absoluteBoundingBox || node?.bbox;
  if (!b) return null;
  const x = Number(b.x), y = Number(b.y), w = Number(b.width), h = Number(b.height);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  return { x, y, w, h };
}

/** 两盒是否逐字段相等（图片父包装借用只允许同盒，禁止用容差猜邻近资源）。 */
function sameBox(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);
}

/** 子树内是否存在「占满指定盒」的可见 IMAGE fill。 */
function hasFullBoxImageFill(root, box) {
  if (!root || !box) return false;
  const seen = new Set();
  const walk = (n) => {
    if (!n || seen.has(n) || n.visible === false) return false;
    seen.add(n);
    const fills = Array.isArray(n.fills) ? n.fills : [];
    if (fills.some((f) => f?.visible !== false && f.type === 'IMAGE') && sameBox(bboxOf(n), box)) return true;
    return (n.children || []).some(walk);
  };
  return walk(root);
}

/** 首个可见 SOLID 填充 → rgba()（fillToRgba 单一口径，含 opacity）。非 SOLID ⇒ null。 */
function firstSolidFillRgba(node) {
  const fills = Array.isArray(node?.fills) ? node.fills : [];
  const f = fills.find((x) => x && x.visible !== false && x.type === 'SOLID');
  if (!f) return null;
  return fillToRgba(f);
}

/**
 * 收集 plan 叶子可锚定的 Figma 原始节点集合：显式 id 命中 + 其**直接子项**。
 * 合成段 id（`38:3137-tail-text` / `38:3167-list`）剥**一段**后缀回真节点
 * （折叠器契约：`${first.id}-list`；tail-text 叶同理以真节点 id 为前缀）。
 */
function collectAnchorNodes(sec, figmaIndex) {
  const out = new Map();
  const ids = [
    sec?.id,
    ...toArray(sec?.sourceNodeIds),
    sec?.figmaNodeId,
    sec?.figmaNode,
  ];
  const absorb = (entry) => {
    if (!entry?.rawNode) return false;
    if (!out.has(String(entry.rawNode.id))) out.set(String(entry.rawNode.id), entry.rawNode);
    for (const c of entry.rawNode.children || []) {
      if (c?.id && !out.has(String(c.id))) out.set(String(c.id), c);
    }
    return true;
  };

  // ① 精确锚点优先：命中即**不再**做任何剥后缀兜底。
  for (const raw of ids) {
    if (raw == null || raw === '') continue;
    absorb(figmaIndex.get(String(raw)) || null);
  }
  if (out.size > 0) return [...out.values()];

  // ② 仅当**完全无精确锚点**时才允许「合成 id 剥后缀」兜底。
  //   🔴 2026-10-27（mc-max-1793079162063-8bbcf027 实锤）：原实现是**逐 id**兜底，
  //   于是 `801:3-orphan-text-0`（sourceNodeIds=['36:1724'] 精确可解析）仍会把
  //   `sec.id` 剥成父容器 `801:3`，将其 9 个直接子项全当本叶内容 ⇒ 判据在**别人**
  //   的事实上求值：真机日志 `header:texts=5(need 1)`（本叶仅 1 TEXT）、
  //   `text:hasGraphic(RECTANGLE:36:1695)`（别区域的描述卡底）、`icon:hasText(30)`
  //   （全组件 TEXT 总数）⇒ 7 叶 0 接管。orphan-text 叶的 sourceNodeIds 才是
  //   精确事实，父容器不是。53f 图例判据已因同一坑改为「严格本叶锚点」，此处收口。
  //   兜底仍保留：sourceNodeIds 全是幻影 id（真值树不存在）时，维持原 fail-open 能力。
  for (const raw of ids) {
    if (raw == null || raw === '') continue;
    const id = String(raw);
    const base = id.replace(/-[A-Za-z0-9:._-]+$/, '');
    if (!base || base === id) continue;
    absorb(figmaIndex.get(base) || null);
  }
  return [...out.values()];
}

/** 文本节点 → 渲染 run（颜色/字号/字重任一缺失 ⇒ null，调用方 fail-open）。 */
function textRun(t) {
  const color = firstSolidFillRgba(t);
  const st = t?.style || {};
  const fs = Number(st.fontSize);
  const fw = st.fontWeight == null ? null : Number(st.fontWeight);
  if (!color || !Number.isFinite(fs) || fs <= 0 || fw == null) return null;
  const b = bboxOf(t);
  const lhRaw = Number(st.lineHeightPx);
  return {
    text: String(t.characters),
    color,
    fs: Math.round(fs * 100) / 100,
    fw,
    // 真值行高（px）。缺失 ⇒ null，调用方保持原有单行形态（fail-open，不臆造行高）。
    lh: Number.isFinite(lhRaw) && lhRaw > 0 ? lhRaw : null,
    box: b,
  };
}

/**
 * 标题行叶判据：子树恰 1 个 TEXT + ≥1 个「已导出为图片资源」的图标节点，
 * 图标与文本同行（Δy≤2）且在文本左侧，间距 0..48px。
 *
 * 🔴 icon **必须**在资源映射里（downloadStatus !== 'failed'）—— 映射不到的
 * VECTOR 图标无法渲染（没有路径数据），不臆造占位 ⇒ fail-open。
 *
 * @returns {{ok:true, ...truth} | {ok:false, reason:string}}
 */
export function detectHeaderRowLeaf(sec, figmaIndex, resourceMapping) {
  const nodes = collectAnchorNodes(sec, figmaIndex);
  const texts = nodes.filter(
    (n) => typeof n?.characters === 'string' && n.characters.trim().length > 0,
  );
  if (texts.length !== 1) return { ok: false, reason: `texts=${texts.length}(need 1)` };
  const tb = bboxOf(texts[0]);
  if (!tb) return { ok: false, reason: 'textBoxMissing' };

  const iconNodes = nodes.filter((n) => {
    if (!n || typeof n.characters === 'string') return false;
    const b = bboxOf(n);
    // 图标尺寸事实：≤32px（16×16 实测）；更大的兄弟（面板 bg/网格行）不是图标
    return b && Math.max(b.w, b.h) <= 32;
  });
  if (iconNodes.length < 1) return { ok: false, reason: 'noIconNode' };

  const mapping = toArray(resourceMapping);
  for (const n of iconNodes) {
    const m = mapping.find(
      (e) =>
        String(e?.figmaNodeId) === String(n.id) &&
        e?.resourceFile &&
        e?.downloadStatus !== 'failed',
    );
    if (!m) continue;
    const ib = bboxOf(n);
    if (Math.abs(ib.y - tb.y) > 2) continue; // 不同行
    if (ib.x + ib.w > tb.x) continue; // 不在文本左侧
    const gap = Math.round(tb.x - (ib.x + ib.w));
    if (!(gap >= 0 && gap <= 48)) continue;
    const ti = textRun(texts[0]);
    if (!ti) return { ok: false, reason: 'textStyleIncomplete' };
    return {
      ok: true,
      kind: 'header',
      sectionId: String(sec.id ?? ''),
      baseId: m?.ownerSectionId ? String(m.ownerSectionId) : String(n.id),
      title: ti.text,
      titleColor: ti.color,
      fontSize: ti.fs,
      fontWeight: ti.fw,
      iconVar: String(m.assignedVarName || m.semanticVarName || ''),
      iconFile: String(m.resourceFile).split('/').pop(),
      iconW: Math.round(ib.w),
      iconH: Math.round(ib.h),
      gap,
      height: Math.round(Math.max(ib.h, tb.h)),
    };
  }
  return { ok: false, reason: 'iconNotMappedOrNotLeftOfTextOnSameRow' };
}

/**
 * 纯 icon 叶判据（刀 53c，2026-10-22 mc-1792664016166-36520fb1 实锤）：
 * 锚点子树 **0 个 TEXT**，且锚点自身已导出为 PNG 资源（在资源映射里、下载未失败）。
 *
 * 病灶：`187:262` / `187:263`（stat 条图标 GROUP，内部是十几个 VECTOR，无路径数据）
 * 走 LLM 时**整段偶发丢失**（round-17 左卡图标 MISSING）——它不是标题行（texts=0）、
 * 也不是纯文本叶 ⇒ 前三判据全部 fail-open。资源映射里已有导出 PNG（`icon-262.png`），
 * 渲染形态完全确定 ⇒ 整文件接管。
 *
 * fail-open：子树含任何 TEXT、锚点未在映射里、下载失败、bbox 缺失 ⇒ 不接管。
 *
 * @returns {{ok:true, ...truth} | {ok:false, reason:string}}
 */
export function detectIconLeaf(sec, figmaIndex, resourceMapping) {
  const nodes = collectAnchorNodes(sec, figmaIndex);
  if (nodes.length === 0) return { ok: false, reason: 'noAnchorNode' };
  // 子树含任何非空 TEXT ⇒ 不是纯 icon 叶（交给 text/header 判据）
  const seen = new Set();
  let textCount = 0;
  const walk = (n) => {
    if (!n || seen.has(n)) return;
    seen.add(n);
    if (typeof n.characters === 'string' && n.characters.trim().length > 0) {
      textCount += 1;
      return;
    }
    for (const c of n.children || []) walk(c);
  };
  for (const n of nodes) walk(n);
  if (textCount > 0) return { ok: false, reason: `hasText(${textCount})` };

  const mapping = toArray(resourceMapping);
  for (const n of nodes) {
    const m = mapping.find(
      (e) =>
        String(e?.figmaNodeId) === String(n.id) &&
        e?.resourceFile &&
        e?.downloadStatus !== 'failed',
    );
    if (!m) continue;
    const b = bboxOf(n);
    if (!b) return { ok: false, reason: 'iconBoxMissing' };
    return {
      ok: true,
      kind: 'icon',
      sectionId: String(sec.id ?? ''),
      baseId: m?.ownerSectionId ? String(m.ownerSectionId) : String(n.id),
      iconVar: String(m.assignedVarName || m.semanticVarName || ''),
      iconFile: String(m.resourceFile).split('/').pop(),
      iconW: Math.round(b.w),
      iconH: Math.round(b.h),
    };
  }

  // 🔴 父级图片包装借用（2026-10-27 · 8bbcf027 `36:1726` 实锤）：plan 叶是 Mask group，
  //   资源映射落在直接父级 `36:1725(img)`，而本叶子项 `36:1729` 是同 bbox IMAGE fill。
  //   只允许「直接父级已映射成功 + 父子 bbox 完全相等 + 本叶有同 bbox IMAGE fill」，
  //   三事实缺一不可；否则仍按原样 fail-open，绝不用相近父容器猜资源。
  for (const n of nodes) {
    const b = bboxOf(n);
    if (!b || !hasFullBoxImageFill(n, b)) continue;
    const parentId = figmaIndex.get(String(n.id))?.parentId;
    if (!parentId) continue;
    const parent = figmaIndex.get(String(parentId))?.rawNode || null;
    const pb = bboxOf(parent);
    if (!sameBox(pb, b)) continue;
    const m = mapping.find(
      (e) =>
        String(e?.figmaNodeId) === String(parentId) &&
        e?.resourceFile &&
        e?.downloadStatus !== 'failed' &&
        e?.downloadStatus !== 'missing',
    );
    if (!m) continue;
    return {
      ok: true,
      kind: 'icon',
      sectionId: String(sec.id ?? ''),
      baseId: m?.ownerSectionId ? String(m.ownerSectionId) : String(parentId),
      iconVar: String(m.assignedVarName || m.semanticVarName || ''),
      iconFile: String(m.resourceFile).split('/').pop(),
      iconW: Math.round(b.w),
      iconH: Math.round(b.h),
    };
  }
  return { ok: false, reason: 'anchorNotExportedAsImage' };
}

/**
 * vision 纯文本声明 → Figma TEXT 精确回查（29c2c476 底部汇总）。
 *
 * 只消费 body.children 的直接文本或 parts 拼接文本；每项必须在整棵树中恰命中一个
 * 相同 characters 的 TEXT。缺项、重复命中、同一节点被重复消费、含非文本子结构均返回 null。
 * 该路径只在没有有效锚点、原锚点无文本或锚到图形时启用，不替代正常锚点，也不按相似文本猜测。
 */
function resolveDeclaredTextNodes(sec, figmaIndex) {
  const declared = Array.isArray(sec?.body?.children) ? sec.body.children : null;
  if (!declared || declared.length === 0 || !(figmaIndex instanceof Map)) return null;
  const allTexts = [];
  const seen = new Set();
  for (const entry of figmaIndex.values()) {
    const n = entry?.rawNode;
    if (!n || seen.has(n) || typeof n.characters !== 'string' || !n.characters.trim()) continue;
    seen.add(n);
    allTexts.push(n);
  }
  const used = new Set();
  const resolved = [];
  for (const child of declared) {
    if (!child || typeof child !== 'object') return null;
    let value = '';
    if (typeof child.text === 'string' && child.text.trim()) value = child.text;
    else if (Array.isArray(child.parts) && child.parts.length > 0) {
      if (child.parts.some((p) => typeof p?.text !== 'string' || !p.text.trim())) return null;
      value = child.parts.map((p) => p.text).join('');
    } else return null;
    const wanted = value.trim();
    const hits = allTexts.filter((n) => n.characters.trim() === wanted);
    if (hits.length !== 1 || used.has(hits[0])) return null;
    used.add(hits[0]);
    resolved.push(hits[0]);
  }
  return resolved.length === declared.length ? resolved : null;
}

/**
 * 纯文本叶判据（刀 53b，2026-10-22 mc-1792662399514-2b715fa0 实锤）：
 * 锚点子树**至少 1 个 TEXT、0 个图形节点**（GROUP 纯包装允许）。
 *
 * 病灶：顶部 stat 条的数字叶（`38:3262`="33" fs24 fw600 蓝、`38:3284`="66"）与
 * 标题叶（`38:3285`="在线设备"）被 LLM chunk 臆造成**无 `:src` 的 `<img>`**
 * ⇒ 数字整段消失 + 破图占位 alt 文字（用户截图实锤）。纯文本叶的确定性渲染
 * 只有 span + 真值样式，无任何可随机维度 ⇒ 整文件接管。
 *
 * N 段扩展（第 3 刀）：N=1 保持原契约；N>1 仅接管「全部同一行」或「每段独占一行」，
 * 每段保留独立文本/样式，间距取相邻 bbox 差值。混合多行多列不属于线性文本，必须 fail-open
 * 给后续 kvgrid，不能拍平成一维数组。
 *
 * fail-open：0 TEXT、出现任何图形类型（VECTOR/RECTANGLE/FRAME/INSTANCE/
 * ELLIPSE/BOOLEAN 等）、颜色/字号/字重任一缺失；N>1 时任一 bbox 缺失、盒体重叠或
 * 混合多行多列 ⇒ 不接管（LLM 原路径）。
 *
 * @returns {{ok:true, ...truth} | {ok:false, reason:string}}
 */
export function detectTextLeaf(sec, figmaIndex) {
  let nodes = collectAnchorNodes(sec, figmaIndex);
  if (nodes.length === 0) {
    nodes = resolveDeclaredTextNodes(sec, figmaIndex) || [];
    if (nodes.length === 0) return { ok: false, reason: 'noAnchorNode' };
  }
  // 递归收集锚点子树（GROUP 纯包装允许；其余类型 = 图形 ⇒ fail）
  // 🔴 图形类型口径来自模块级 `GRAPHIC_NODE_RX`（与图例判据共用，禁止各写一份）
  const GRAPHIC_RX = GRAPHIC_NODE_RX;
  const texts = [];
  let graphic = null;
  // 🔴 去重：collectAnchorNodes 返回「锚点 + 直接子项」，父与子会重复进入本函数
  //   （GROUP 锚点时 walk(group) 已递归其子，外层循环又会单独 walk 子）⇒ 用 Set 防重。
  const seen = new Set();
  const walk = (n) => {
    if (!n || seen.has(n)) return;
    seen.add(n);
    if (n.visible === false) return;
    if (typeof n.characters === 'string' && n.characters.trim().length > 0) {
      texts.push(n);
      return;
    }
    if (GRAPHIC_RX.test(String(n.type || ''))) {
      graphic = graphic || `${n.type}:${n.id}`;
      return;
    }
    for (const c of n.children || []) walk(c);
  };
  for (const n of nodes) walk(n);
  // 原锚点失效时，vision 的完整纯文本声明仍可确定性物化；样式与几何改由
  // 精确命中的 Figma TEXT 提供。判据失败则沿用原错误，绝不退回模糊匹配。
  if (graphic || texts.length === 0) {
    const declaredNodes = resolveDeclaredTextNodes(sec, figmaIndex);
    if (declaredNodes) {
      nodes = declaredNodes;
      texts.length = 0;
      graphic = null;
      for (const n of nodes) walk(n);
    }
  }
  if (graphic) return { ok: false, reason: `hasGraphic(${graphic})` };
  if (texts.length === 0) return { ok: false, reason: 'texts=0(need>=1)' };
  if (texts.length > 1) {
    const items = texts.map((node) => ({ node, run: textRun(node) }));
    if (items.some((it) => !it.run)) return { ok: false, reason: 'textStyleIncomplete' };
    if (items.some((it) => !it.run.box)) return { ok: false, reason: 'textBoxMissing' };
    // 同一行 = 全部文本盒存在共同垂直交集；每段一行 = 按 y 排序后盒体互不垂直重叠。
    // 其余是混合多行多列/叠层，不做线性化猜测（尤其不能抢走后面的 kvgrid）。
    const commonTop = Math.max(...items.map((it) => it.run.box.y));
    const commonBottom = Math.min(...items.map((it) => it.run.box.y + it.run.box.h));
    const sameRow = commonTop < commonBottom;
    const byY = [...items].sort((a, b) => a.run.box.y - b.run.box.y || a.run.box.x - b.run.box.x);
    const separateRows = byY.every((it, i) => i === 0 || it.run.box.y >= byY[i - 1].run.box.y + byY[i - 1].run.box.h);
    if (!sameRow && !separateRows) return { ok: false, reason: 'textRunsNotLinear' };
    const direction = sameRow ? 'row' : 'column';
    items.sort(sameRow
      ? (a, b) => a.run.box.x - b.run.box.x || a.run.box.y - b.run.box.y
      : (a, b) => a.run.box.y - b.run.box.y || a.run.box.x - b.run.box.x);
    const runs = [];
    for (let i = 0; i < items.length; i++) {
      const { node, run } = items[i];
      const prev = items[i - 1]?.run.box;
      const gapBefore = i === 0
        ? 0
        : sameRow
          ? run.box.x - (prev.x + prev.w)
          : run.box.y - (prev.y + prev.h);
      if (gapBefore < 0) return { ok: false, reason: 'textRunsOverlap' };
      runs.push({
        id: String(node.id),
        text: run.text,
        color: run.color,
        fontSize: run.fs,
        fontWeight: run.fw,
        lineHeight: run.lh,
        width: Math.round(run.box.w * 100) / 100,
        height: Math.round(run.box.h * 100) / 100,
        multiline: Boolean(run.lh && run.box.h > run.lh * 1.5),
        gapBefore: Math.round(gapBefore * 100) / 100,
      });
    }
    return {
      ok: true,
      kind: 'text',
      sectionId: String(sec.id ?? ''),
      baseId: runs[0].id,
      direction,
      runs,
      height: sameRow
        ? Math.max(...runs.map((run) => run.height))
        : runs.reduce((sum, run) => sum + run.height + run.gapBefore, 0),
    };
  }
  const ti = textRun(texts[0]);
  if (!ti) return { ok: false, reason: 'textStyleIncomplete' };
  const tb = bboxOf(texts[0]);
  // 🔴 多行判定只认真值几何：盒高 > 行高 × 1.5 ⇒ 必然多行（真值 36:1719 = 496×90、
  //   fs14 / lineHeightPx30 ⇒ 90 > 45 ⇒ 3 行）。行高缺失 ⇒ 不多行（保持原单行形态）。
  //   不这么做会把「长描述」渲染成 `white-space:nowrap; line-height:1` 的一行溢出。
  const multiline = Boolean(tb && ti.lh && tb.h > ti.lh * 1.5);
  return {
    ok: true,
    kind: 'text',
    sectionId: String(sec.id ?? ''),
    baseId: String(texts[0].id),
    text: ti.text,
    color: ti.color,
    fontSize: ti.fs,
    fontWeight: ti.fw,
    height: tb ? Math.round(tb.h) : null,
    lineHeight: ti.lh,
    multiline,
  };
}

/**
 * 图例「圆点 + 短文本」判据的几何阈值（**唯一来源**，spec 断言从这里取，禁止照抄数字）。
 *
 * - {@link LEGEND_DOT_MAX}=16：圆点长边上限。真值 8×8；放到 16 是为容纳 10/12px 的点。
 *   再大就该是头像/徽标而不是「点」，其语义与渲染形态都不同 ⇒ 不猜。
 * - {@link LEGEND_GAP_MAX}=24：点与文字的**紧邻**水平间距上限。真值 3。
 *   放宽到 24 仍远小于「图标 + 标题」的左图标间距上限（header 判据 48）——
 *   图例的点必须贴着文字，否则可能是「图标 + 独立标签」两个语义单元。
 * - {@link LEGEND_ROW_DY}=2：同行的容忍度（与 header 判据同口径），比的是**垂直中心**。
 */
const LEGEND_DOT_MAX = 16;
const LEGEND_GAP_MAX = 24;
const LEGEND_ROW_DY = 2;

/**
 * 图形节点类型（GROUP/CANVAS 不在此列 ⇒ 纯包装允许）。
 * 🔴 由 `detectTextLeaf` 与 `detectLegendDotTextLeaf` **共用**：此前它是 `detectTextLeaf`
 *   内的局部正则，图例判据若另写一份，「什么算图形」就会有两套口径（副本 ≥2 份 = 温床）。
 */
const GRAPHIC_NODE_RX =
  /^(VECTOR|RECTANGLE|FRAME|INSTANCE|ELLIPSE|LINE|BOOLEAN_OPERATION|COMPONENT|SLICE|STAR|POLYGON|RECT)$/i;

/**
 * 「圆点 + 短文本」**单一判据**：容器节点的**直接子项**恰为「1 个 ELLIPSE + 1 个 TEXT」，
 * 且几何满足同行 + 点在左 + 紧邻 ⇒ 返回真值三元组，否则 null。
 *
 * 🔴 本函数是**唯一**算这套几何的地方：`detectLegendDotTextLeaf` 用它判自己、
 *   也用它判兄弟（同父下 ≥2 组同构）。禁止在调用侧另写一份比较 ——
 *   「父说 2 组同构、子说自己不是」的自相矛盾就是这样长出来的。
 *
 * @param {object|null} container Figma 原始节点
 * @returns {{dot:object, text:object, dotBox:object, textBox:object, gap:number}|null}
 */
function readDotTextPair(container) {
  if (!container || typeof container.characters === 'string') return null;
  const kids = (container.children || []).filter((c) => c && c.visible !== false);
  // 恰 2 个子项：多一个图形（图标/箭头/背景）就不再是「点+文」纯组 ⇒ 不认
  if (kids.length !== 2) return null;
  const texts = kids.filter(
    (c) => typeof c.characters === 'string' && c.characters.trim().length > 0,
  );
  const dots = kids.filter((c) => String(c.type || '').toUpperCase() === 'ELLIPSE');
  if (texts.length !== 1 || dots.length !== 1) return null;
  const db = bboxOf(dots[0]);
  const tb = bboxOf(texts[0]);
  if (!db || !tb) return null;
  if (!(db.w > 0 && db.h > 0)) return null;
  if (Math.max(db.w, db.h) > LEGEND_DOT_MAX) return null;
  // 同行：比垂直中心（真值 点 cy=52145 / 文 cy=52145 ⇒ Δ0）
  if (Math.abs(db.y + db.h / 2 - (tb.y + tb.h / 2)) > LEGEND_ROW_DY) return null;
  // 点必须在**文字左侧**且紧邻（子项数组序不可信：真值序是 [TEXT, ELLIPSE]，几何才是判据）
  if (db.x + db.w > tb.x) return null;
  const gap = Math.round(tb.x - (db.x + db.w));
  if (!(gap >= 0 && gap <= LEGEND_GAP_MAX)) return null;
  return { dot: dots[0], text: texts[0], dotBox: db, textBox: tb, gap };
}

/**
 * 🛡️ 图例「圆点 + 短文本」叶判据（刀 53f，2026-10-26 mc-max-1792934367321-ab7bb76c 实锤）。
 *
 * ## 病灶：两枚同构图例组掉进了三个判据**之间的缝**里
 *
 * 真值（`visual.json#layoutStructure.inlineCompositeRows` 逐字标注）：
 *   - `43:4869` = horizontal `members:[43:4871(●8×8), 43:4870("运行中")]`；
 *   - `43:4875` = horizontal `members:[43:4877(●8×8), 43:4876("离线")]`。
 * 三者全灭（真机日志 2026-10-25T13:20:52Z 逐字）：
 *   - `text:hasGraphic(ELLIPSE:43:4871)` —— 纯文本判据要求子树 0 图形；
 *   - `icon:hasText(1)` —— 纯 icon 判据要求子树 0 TEXT；
 *   - `header:iconNotMappedOrNotLeftOfTextOnSameRow` —— 标题行判据要求圆点**已导出
 *     PNG 且映射到资源变量**，而纯色 ELLIPSE 无路径数据、资源映射里根本没有它。
 *
 * 落到 LLM 自由发挥的后果（事故件产物实锤）：
 *   - `ContentSection5`：`.dot` **有 background 无 width/height** ⇒ 圆点 0×0 不可见；
 *   - `ContentSection4`：整组被臆造成「数值卡」（`value="1"` + `label="离线"`），
 *     连 `-dot`/`-text` 都没有，且内联 `flex-direction:column` 与 style 块 `row` 对打。
 *
 * ## 判据（严格 fail-open：任一事实缺失即不接管，绝不兜底）
 *
 *   ① **容器就是本叶自身的锚点节点**（`sec.id` 直接命中 / 合成 id 剥一段后缀回真节点），
 *      **不**沿用其它判据的 `collectAnchorNodes` 全集遍历 —— 理由见下方 🔴；
 *   ② 容器直接子项恰「1 ELLIPSE + 1 TEXT」（{@link readDotTextPair}）；
 *   ③ 圆点有可见 SOLID 填充（拿不到色值就不画，绝不填兜底色）；
 *   ④ 文本 run 三件套齐全（color/fs/fw，复用 `textRun`）；
 *   ⑤ **同父下 ≥2 组同构**（同一个 {@link readDotTextPair} 判兄弟）⇒ 才承认这是「图例」。
 *
 * 🔴 为什么容器必须是「本叶自身的锚点」而不是锚点集合里的任意节点：
 *   `807:2-tail-text` 这类合成叶的 `sourceNodeIds` 会把**父级全部子项**带进锚点集合，
 *   其中就含有 `43:4869` 这枚图例组。若照兄弟判据那样遍历集合取首个命中，
 *   本叶会把**别人**的图例再渲染一遍（重复 DOM，且比不接管更糟）。
 *   实测该叶的跳过原因是 `text:hasGraphic(FRAME:43:4784)`（45 个 TEXT）——
 *   它的锚点过宽是另一个病灶，不在本刀范围。
 *
 * 🔴 为什么要求「同父 ≥2 组」：单枚「● + 文本」也可能只是状态徽标（如「● 已连接」），
 *   其语义 ≠ 图例；而图例的定义性特征就是**多枚同构**。这条闸门与 43:4869/43:4875
 *   互为阳性对照（真值兄弟数 = 2）。
 *
 * @param {object} sec plan 叶段
 * @param {Map} figmaIndex indexFigmaNodes 结果
 * @param {Map<string,string>} parentOf buildParentMap 结果（兄弟视角）
 * @returns {{ok:true, kind:'legend', ...truth} | {ok:false, reason:string}}
 */
export function detectLegendDotTextLeaf(sec, figmaIndex, parentOf) {
  // ① 严格解析本叶自身锚点（不吃 sourceNodeIds 的子树）
  const ids = [sec?.id, sec?.figmaNodeId]
    .filter((x) => x != null && x !== '')
    .map(String);
  let container = null;
  for (const id of ids) {
    let entry = figmaIndex.get(id) || null;
    if (!entry) {
      const base = id.replace(/-[A-Za-z0-9:._-]+$/, '');
      if (base && base !== id) entry = figmaIndex.get(base) || null;
    }
    if (entry?.rawNode) {
      container = entry.rawNode;
      break;
    }
  }
  if (!container) return { ok: false, reason: 'noAnchorNode' };

  // ② 点+文纯组
  const pair = readDotTextPair(container);
  if (!pair) return { ok: false, reason: 'noDotTextPair' };

  // ③ 圆点色值真值
  const dotColor = firstSolidFillRgba(pair.dot);
  if (!dotColor) return { ok: false, reason: 'dotFillMissing' };

  // ④ 文本 run 真值
  const ti = textRun(pair.text);
  if (!ti) return { ok: false, reason: 'textStyleIncomplete' };

  // ⑤ 同父 ≥2 组同构（图片例语义；同一 readDotTextPair 判兄弟）
  const parentId = parentOf?.get?.(String(container.id));
  if (!parentId) return { ok: false, reason: 'noParentForRepeatCheck' };
  const parentNode = figmaIndex.get(String(parentId))?.rawNode || null;
  if (!parentNode) return { ok: false, reason: 'parentNotIndexed' };
  const likeSiblings = (parentNode.children || []).filter(
    (c) => c?.visible !== false && readDotTextPair(c) !== null,
  ).length;
  if (likeSiblings < 2) return { ok: false, reason: `dotTextSiblings=${likeSiblings}(need 2)` };

  return {
    ok: true,
    kind: 'legend',
    sectionId: String(sec.id ?? ''),
    baseId: String(container.id),
    dotW: Math.round(pair.dotBox.w),
    dotH: Math.round(pair.dotBox.h),
    dotColor,
    gap: pair.gap,
    text: ti.text,
    color: ti.color,
    fontSize: ti.fs,
    fontWeight: ti.fw,
    height: Math.round(Math.max(pair.textBox.h, pair.dotBox.h)),
  };
}

/**
 * 构建「子节点 id → 父节点 id」映射（统计行判据需要「兄弟」视角）。
 *
 * @param {Map} figmaIndex indexFigmaNodes 结果
 * @returns {Map<string,string>}
 */
export function buildParentMap(figmaIndex) {
  const parentOf = new Map();
  if (!figmaIndex || typeof figmaIndex.forEach !== 'function') return parentOf;
  for (const [, entry] of figmaIndex) {
    const node = entry?.rawNode || entry;
    if (!node?.id) continue;
    for (const c of node.children || []) {
      if (c?.id) parentOf.set(String(c.id), String(node.id));
    }
  }
  return parentOf;
}

/** 子树内非空 TEXT 节点（深度优先，去重）。 */
function collectTexts(node) {
  const out = [];
  const seen = new Set();
  const walk = (n) => {
    if (!n || seen.has(n)) return;
    seen.add(n);
    if (n.visible === false) return;
    if (typeof n.characters === 'string' && n.characters.trim().length > 0) {
      out.push(n);
      return;
    }
    for (const c of n.children || []) walk(c);
  };
  walk(node);
  return out;
}

/**
 * 统计行叶判据（刀 53d，2026-10-23 · mc-max-1792718704810-f98f7463 实锤）。
 *
 * 病灶：真值统计行 `43:4892` 是 3 张同构卡（8/总设备、2/运行中、1/离线，x=29636/29804/29972，
 * 各 134 宽），但 plan 把它切成**两个独立 section**（`43:4898` / `43:4903`）且**漏切**
 * `43:4893` ⇒ 既有 `assessStatRowConfidence` 因「整行不是同一个 section」直接
 * `too-few-members` ⇒ 统计行确定性装配从未启动；LLM 于是复制 `43:4898` 造出第二张
 * 「运行中/2」，「8 总设备」整卡消失。
 *
 * 治本：**不依赖 plan 切分** —— 直接在 Figma 树上以「兄弟同构聚类」识别统计行：
 *   ① 取锚点节点的**父容器**下的全部直接子项为候选成员；
 *   ② 每个候选：子树**恰 2 个 TEXT**、`splitTitleValueByStyle`（样式真值，命名无关）
 *      能分出 title/value、且成员间**宽高相近（±2）**；
 *   ③ 候选 ≥2、按 x **严格递增**、跨成员 title 唯一、value 唯一 ⇒ 判为统计行。
 *
 * 🔴 去重契约：整行由**锚点为 x 最小成员**的那个 section 渲染全部 N 卡；其余成员
 *    section 返回 `memberIndex > 0` ⇒ 渲染 `display:none` 空壳（不参与 flex 布局，
 *    父容器不会留空白），避免 N 个组件各画一遍造成重复卡。
 *
 * fail-open：父容器缺失 / 候选 <2 / 宽高不齐 / 样式不可分辨 / x 不严格递增 /
 *            title 或 value 重复 / 任一 run 缺色值字号字重 ⇒ 不接管。
 *
 * ## 外观扩维（2026-10-23·cd8938f8）
 *
 * 统计卡真值底不是 `fills` 而是子树内的**图形节点**（`43:4783` = VECTOR
 * `GRADIENT_LINEAR [d4e3ff@0% c1d6ff@100%] op=0.9` + `stroke #a0c1ff`）⇒ 卡本体
 * `nodeAppearanceTruth` 取不到底时回退 `subtreeBackground`（子树最大非图标图形）。
 * 取不到即 null，绝不填兜底色。
 *
 * @param {object} sec plan 叶子
 * @param {Map} figmaIndex
 * @param {Map} parentOf
 * @param {Array} [resourceMapping] effectiveMapping（`subtreeBackground` 排除图标用）
 * @returns {{ok:true, kind:'statrow', ...} | {ok:false, reason:string}}
 */
export function detectStatRowLeaf(sec, figmaIndex, parentOf, resourceMapping) {
  const nodes = collectAnchorNodes(sec, figmaIndex);
  if (nodes.length === 0) return { ok: false, reason: 'noAnchorNode' };
  if (!parentOf || parentOf.size === 0) return { ok: false, reason: 'noParentMap' };

  for (const anchor of nodes) {
    const pid = parentOf.get(String(anchor.id));
    if (!pid) continue;
    const parent = figmaIndex.get(pid)?.rawNode || null;
    if (!parent) continue;
    const sibs = (parent.children || []).filter((c) => c?.id && bboxOf(c));
    if (sibs.length < 2) continue;

    // ② 逐个候选解析：恰 2 TEXT + 样式可分 title/value
    const parsed = [];
    for (const s of sibs) {
      const texts = collectTexts(s);
      if (texts.length !== 2) continue;
      // 🔴 入参形状必须与 `splitTitleValueByStyle` 的契约一致（{text, fontSize, y}）：
      //    直接喂 Figma 原始节点会让 `a.fontSize` 恒 undefined ⇒ 该唯一事实源函数恒返回
      //    null ⇒ 统计行永不被识别（离线重放实锤）。
      const items = texts.map((t) => {
        const b = bboxOf(t);
        const fs = Number(t?.style?.fontSize);
        return {
          text: String(t.characters),
          fontSize: Number.isFinite(fs) && fs > 0 ? fs : null,
          y: b ? b.y : null,
        };
      });
      const roles = splitTitleValueByStyle(items);
      if (!roles) continue;
      const tNode = texts.find((t) => String(t.characters) === String(roles.title)) || texts[0];
      const vNode = texts.find((t) => String(t.characters) === String(roles.value)) || texts[1];
      const tRun = textRun(tNode);
      const vRun = textRun(vNode);
      if (!tRun || !vRun) continue;
      const box = bboxOf(s);
      const tb = bboxOf(tNode);
      const vb = bboxOf(vNode);
      if (!box || !tb || !vb) continue;
      parsed.push({ id: String(s.id), node: s, box, title: tRun, value: vRun, tb, vb });
    }
    if (parsed.length < 2) continue;

    // 宽高相近（±2）：统计卡的骨架一致性
    const w0 = parsed[0].box.w;
    const h0 = parsed[0].box.h;
    if (!parsed.every((p) => Math.abs(p.box.w - w0) <= 2 && Math.abs(p.box.h - h0) <= 2)) {
      return { ok: false, reason: 'member-size-mismatch' };
    }

    // ③ 按 x 升序 + 严格递增 + title/value 唯一
    const sorted = [...parsed].sort((a, b) => a.box.x - b.box.x);
    for (let i = 1; i < sorted.length; i++) {
      if (!(sorted[i].box.x > sorted[i - 1].box.x)) return { ok: false, reason: 'ambiguous-x-order' };
    }
    const titles = sorted.map((p) => p.title.text);
    const values = sorted.map((p) => p.value.text);
    if (new Set(titles).size !== titles.length) return { ok: false, reason: 'duplicate-title' };
    if (new Set(values).size !== values.length) return { ok: false, reason: 'duplicate-value' };

    const memberIndex = sorted.findIndex((p) => p.id === String(anchor.id));
    if (memberIndex < 0) continue; // 锚点不是成员（是父容器本身）⇒ 换下一个锚点

    const first = sorted[0];
    // 卡内排布：**几何判定**（x 区间不交叠且 y 区间有交叠 ⇒ 横排）。
    //   ⚠️ 不能用「Δy ≤ 2」：本单真值是横排（[总设备][8]），但基线对齐导致 Δy=3
    //   ⇒ 阈值判定会误判成纵排（离线重放实锤）。
    const xOverlap = Math.min(first.tb.x + first.tb.w, first.vb.x + first.vb.w)
      - Math.max(first.tb.x, first.vb.x);
    const yOverlap = Math.min(first.tb.y + first.tb.h, first.vb.y + first.vb.h)
      - Math.max(first.tb.y, first.vb.y);
    const horizontal = xOverlap <= 0 && yOverlap > 0;
    // 卡内间距必须**按实际左右/上下序取正向间距**：两边公式都算再取 min 会把
    // 「正确间距 10」与「反序公式的 -66」比较后取到负数（离线重放实锤）。
    const firstTitleFirst = horizontal ? first.tb.x <= first.vb.x : first.tb.y <= first.vb.y;
    const innerGapRaw = horizontal
      ? (firstTitleFirst
        ? first.vb.x - (first.tb.x + first.tb.w)
        : first.tb.x - (first.vb.x + first.vb.w))
      : (firstTitleFirst
        ? first.vb.y - (first.tb.y + first.tb.h)
        : first.tb.y - (first.vb.y + first.vb.h));
    const innerGap = Number.isFinite(innerGapRaw) ? Math.max(0, Math.round(innerGapRaw)) : 0;
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(Math.round(sorted[i].box.x - (sorted[i - 1].box.x + sorted[i - 1].box.w)));
    }

    return {
      ok: true,
      kind: 'statrow',
      sectionId: String(sec.id ?? ''),
      baseId: String(sorted[memberIndex].id),
      parentId: String(pid),
      memberIndex,
      memberCount: sorted.length,
      cardW: Math.round(w0),
      cardH: Math.round(h0),
      gap: gaps.length ? Math.max(0, Math.min(...gaps)) : 0,
      innerDir: horizontal ? 'row' : 'column',
      innerGap,
      members: sorted.map((p, mi) => {
        // 卡外观真值：本体 `fills`/`strokes` 优先；取不到 ⇒ 子树最大「底候选」
        // （真值卡底与描边都在 VECTOR 上）⇒ 再取不到即 null（不写该属性，绝不填兜底色）。
        const app = nodeAppearanceTruth(p.node);
        let bg = app.bg;
        let border = cssBorder(app.border);
        let bgImageFile = null;
        if (!bg || !border) {
          const sub = subtreeBackground(p.node, resourceMapping);
          if (sub) {
            // 🔴 图片与 CSS 是**互斥**通道：`subtreeBackground` 只返回其中一个。
            //    图片命中时不得再写 `background:${sub.css}`（那会用「近似底」覆盖真图，
            //    正是 2ec8acc7 丢顶部亮条的同型错误）。
            if (sub.image?.file) bgImageFile = sub.image.file;
            else if (!bg) bg = sub.css;
            if (!border) border = cssBorder(sub.border);
          }
        }
        return {
          title: p.title.text,
          titleColor: p.title.color,
          titleFs: p.title.fs,
          titleFw: p.title.fw,
          value: p.value.text,
          valueColor: p.value.color,
          valueFs: p.value.fs,
          valueFw: p.value.fw,
          // 卡内左右序：按 x（横排）/ y（纵排）升序，杜绝「值左标题右」臆造
          titleFirst: horizontal ? p.tb.x <= p.vb.x : p.tb.y <= p.vb.y,
          bg,
          bgImageFile,
          bgImageVar: bgImageFile ? `fgStatBg${mi}` : null,
          border,
          pad: cssPadding(app.pad),
          r: cornerRadiusOf(p.node),
        };
      }),
    };
  }
  return { ok: false, reason: 'notStatRowMember' };
}

/**
 * 列式表格叶判据（刀 53e / 方案 C，2026-10-23 · mc-max-1792718704810-f98f7463 实锤）。
 *
 * ## 病灶
 *
 * 真值表格 `43:4784`（470×388）是 **4 个列容器**：x=29636/29814/29911/30008，
 * 高全 388、**y 全 51728**，各含 9 个 TEXT（1 表头 @y51743 + 8 数据 @51786…52087，步长 43），
 * 跨列**逐行 y 对齐**。但 `grid-list-layout-contract.js` 只有 grid/list 契约、
 * **没有列式表格契约** ⇒ 4 个 section 全 `grid:noGridContract`，表头归属无判据 ⇒
 * LLM 自由拆分：表格挤成一团、无表头、设备名列被渲染两遍（= 用户看到的「多个 icon」）。
 *
 * ## 🔴 判据必须按**实测真值**定，不能照抄方案文档的「同宽 ±2」
 *
 * 本单 4 列宽是 **179 / 98 / 98 / 98** —— 宽度差 81，**「同宽 ±2」在本单恒不成立**。
 * 真正的表格特征是：**同高 ±2 + 同 y ±2（同一行带）+ x 中心严格递增 + 各列 TEXT 数相同
 * + 跨列逐行 y 对齐**。列宽各自记录（渲染时按 `width/total` 转百分比）。
 *
 * ## 列间 x 微重叠
 *
 * 实测相邻列 `(x_i + w_i) - x_{i+1} = 1`（Figma 常见 1px 咬合）⇒ 判据允许
 * **重叠 ≤ 2px**，不能要求「x 区间完全不交叠」（那样本单恒不命中 = 假绿）。
 *
 * ## 与 statrow 的互斥
 *
 * statrow 的每卡**恰 2 个 TEXT**（title + value）；表格每列**≥3 个 TEXT**
 * （表头 + ≥2 数据）⇒ 二者天然互斥。判定顺序上 statrow 先判（域更窄），table 后判。
 *
 * fail-open：列数 <2 / 任一列 bbox 缺失 / 高或 y 不齐 / TEXT 数不一致 /
 * 跨列 y 不对齐 / 任一文本样式缺失 ⇒ 不接管。
 *
 * ## 外观扩维（2026-10-23·cd8938f8）
 *
 * 表格的**行节点**（列容器直接子项）自带 `fills`（表头 `#bdd5ff` / 数据格
 * `#e2ecfe`↔`#d6e5ff` 斑马纹）+ `strokes`（`#ffffff` 1px INSIDE = 白网格线）+
 * `padding*`（`[10,16,10,16]`），首列数据行还含 28×28 已导出图标 —— 这些**必须**
 * 进契约，否则接管产物是「裸文字表格」。行节距真值是 `itemSpacing=-1`（负间距压叠，
 * `9×44 − 8×1 = 388`），故 `rowGap` 允许负值。
 *
 * @param {object} sec plan 叶子段
 * @param {Map} figmaIndex indexFigmaNodes 产物
 * @param {Map} parentOf buildParentMap 产物
 * @param {Array} [resourceMapping] effectiveMapping（行图标反查用）
 * @returns {{ok:true, ...truth} | {ok:false, reason:string}}
 */
/**
 * 用唯一表头文本的最近公共祖先回查整表锚点。
 * 只负责定位候选；最终是否接管仍由原 detectTableLeafByAnchors 的 Figma 几何/样式判据决定。
 * 任一表头缺失或重复 ⇒ null，绝不把歧义文本提升成整表。
 */
function resolveDeclaredTableLca(sec, figmaIndex, parentOf) {
  const headers = declaredTableHeaders(sec);
  if (!headers || !(parentOf instanceof Map) || parentOf.size === 0) return null;
  const headerIds = [];
  for (const header of headers) {
    const matches = [];
    for (const [id, rec] of figmaIndex) {
      const node = rec?.rawNode;
      if (node?.type === 'TEXT' && String(node?.characters ?? '').trim() === header) {
        matches.push(String(id));
      }
    }
    if (matches.length !== 1) return null;
    headerIds.push(matches[0]);
  }
  const isAncestor = (ancestor, id) => {
    let cur = String(id);
    for (let depth = 0; cur && depth < 128; depth++) {
      if (cur === ancestor) return true;
      cur = parentOf.get(cur) || '';
    }
    return false;
  };
  let candidate = headerIds[0];
  while (candidate && !headerIds.every((id) => isAncestor(candidate, id))) {
    candidate = parentOf.get(candidate) || '';
  }
  return candidate || null;
}

export function detectTableLeaf(sec, figmaIndex, parentOf, resourceMapping) {
  const direct = detectTableLeafByAnchors(sec, figmaIndex, parentOf, resourceMapping);
  if (direct.ok) return direct;
  const tableAnchor = resolveDeclaredTableLca(sec, figmaIndex, parentOf);
  if (!tableAnchor) return direct;
  const promoted = detectTableLeafByAnchors(
    { ...sec, sourceNodeIds: [tableAnchor], figmaNodeId: tableAnchor, figmaNode: tableAnchor },
    figmaIndex,
    parentOf,
    resourceMapping,
  );
  return promoted.ok
    ? { ...promoted, sectionId: String(sec.id ?? ''), anchorRepair: 'declared-headers-lca' }
    : direct;
}

function detectTableLeafByAnchors(sec, figmaIndex, parentOf, resourceMapping) {
  const nodes = collectAnchorNodes(sec, figmaIndex);
  if (nodes.length === 0) return { ok: false, reason: 'noAnchorNode' };
  if (!parentOf || parentOf.size === 0) return { ok: false, reason: 'noParentMap' };

  for (const anchor of nodes) {
    const pid = parentOf.get(String(anchor.id));
    if (!pid) continue;
    const parent = figmaIndex.get(pid)?.rawNode || null;
    if (!parent) continue;

    // ① 父的直接子项 = 列容器候选：同高 ±2 + 同 y ±2（同一行带）
    const sibs = (parent.children || []).filter((c) => c?.id && bboxOf(c));
    if (sibs.length < 2) continue;
    const b0 = bboxOf(sibs[0]);
    const band = sibs.filter((s) => {
      const b = bboxOf(s);
      return Math.abs(b.h - b0.h) <= 2 && Math.abs(b.y - b0.y) <= 2;
    });
    // 🔴 必须**全部**直接子项都在同一行带（离线单测实锤：只做「过滤后 ≥2」会把
    //    「行数不同的列」过滤掉后仍把剩余列当表格 ⇒ 误接管）。宁漏不误接管。
    if (band.length !== sibs.length) continue;
    if (band.length < 2) continue;

    // ② 各列 TEXT 数相同且 ≥3（表头 + ≥2 数据）
    const colTexts = band.map((s) => collectTexts(s));
    const n0 = colTexts[0].length;
    if (n0 < 3) continue;
    if (!colTexts.every((t) => t.length === n0)) continue;

    // ②b 每列内 TEXT 按 y 升序后**逐项跨列对齐**（±2）⇒ 同一行
    const sortedTexts = colTexts.map((ts) =>
      [...ts].sort((a, b) => bboxOf(a).y - bboxOf(b).y),
    );
    let aligned = true;
    for (let c = 1; c < sortedTexts.length && aligned; c++) {
      for (let r = 0; r < n0; r++) {
        const ya = bboxOf(sortedTexts[0][r]).y;
        const yb = bboxOf(sortedTexts[c][r]).y;
        if (Math.abs(ya - yb) > 2) { aligned = false; break; }
      }
    }
    if (!aligned) continue;

    // ③ 按 x 升序 + 严格递增 + 允许 ≤2px 咬合
    const order = band
      .map((s, i) => ({ s, i, b: bboxOf(s) }))
      .sort((a, b) => a.b.x - b.b.x);
    for (let i = 1; i < order.length; i++) {
      const prev = order[i - 1];
      if (!(order[i].b.x > prev.b.x)) { aligned = false; break; }
      if (prev.b.x + prev.b.w - order[i].b.x > 2) { aligned = false; break; }
    }
    if (!aligned) continue;

    // ④ 表头 = 每列 y 最小者（样式不可区分时只按位置，不猜）；各列表头 y 必须相同 ±2
    const headers = sortedTexts.map((ts) => ts[0]);
    const hy0 = bboxOf(headers[0]).y;
    if (!headers.every((h) => Math.abs(bboxOf(h).y - hy0) <= 2)) continue;

    // ⑤ 真值 run（颜色/字号/字重任一缺失 ⇒ 整体 fail-open，绝不猜）
    //    + 外观扩维（2026-10-23）：每列的**行节点**（列容器直接子项，按 y 升序）自带
    //      `fills`（表头 `#bdd5ff` / 斑马纹 `#e2ecfe`↔`#d6e5ff`）+ `strokes`
    //      （`1px #ffffff` INSIDE 白网格线）+ `padding*`（`[10,16,10,16]`），
    //      首列数据行含 28×28 已导出图标。行数不齐 ⇒ **外观整体置 null 但内容照常
    //      渲染**（单属性降级，不 fail-open 整表 —— 丢已确定的全表内容比缺底色更糟）。
    const cols = [];
    let ok = true;
    order.forEach((o) => {
      const ts = sortedTexts[o.i];
      const hRun = textRun(ts[0]);
      if (!hRun) { ok = false; return; }
      const cellRuns = [];
      for (let r = 1; r < ts.length; r++) {
        const cr = textRun(ts[r]);
        if (!cr) { ok = false; return; }
        cellRuns.push(cr);
      }
      const rowNodes = (o.s.children || [])
        .filter((c) => c?.id && bboxOf(c))
        .sort((a, b) => bboxOf(a).y - bboxOf(b).y);
      const appearances = rowNodes.length === n0
        ? rowNodes.map((rn) => nodeAppearanceTruth(rn))
        : null;
      cols.push({
        id: String(o.s.id),
        x: Math.round(o.b.x),
        width: Math.round(o.b.w),
        height: Math.round(o.b.h),
        header: hRun,
        headerBox: appearances ? appearances[0] : null,
        cells: cellRuns,
        cellBoxes: appearances ? appearances.slice(1) : null,
        rowNodes: appearances ? rowNodes.slice(1) : null,
      });
    });
    if (!ok || cols.length < 2) continue;

    const memberIndex = order.findIndex((o) => String(o.s.id) === String(anchor.id));
    if (memberIndex < 0) continue; // 锚点是父容器本身 ⇒ 换下一个锚点

    // 行高：优先取首列直接子项高度（真值 44）；否则按 列高/行数
    const firstColNode = order[0].s;
    const col0RowNodes = (firstColNode.children || []).filter((c) => bboxOf(c));
    const rowH = col0RowNodes.length === n0
      ? Math.round(bboxOf(col0RowNodes[0]).h)
      : Math.round(order[0].b.h / n0);
    const totalW = cols.reduce((s, c) => s + c.width, 0) || 1;
    const gaps = [];
    for (let i = 1; i < order.length; i++) {
      gaps.push(Math.max(0, Math.round(order[i].b.x - (order[i - 1].b.x + order[i - 1].b.w))));
    }
    // 行节距：真值首列 `itemSpacing=-1`（负间距压叠，`9×44 − 8×1 = 388`）⇒ 允许负值；
    // 缺省 0（不猜）。渲染侧用 margin-top 表达（flex 的 row-gap 会 clamp 负值到 0）。
    const col0Spacing = Number(firstColNode?.itemSpacing);
    const rowGap = Number.isFinite(col0Spacing) ? Math.round(col0Spacing) : 0;

    return {
      ok: true,
      kind: 'table',
      sectionId: String(sec.id ?? ''),
      baseId: String(order[memberIndex].s.id),
      parentId: String(pid),
      memberIndex,
      memberCount: cols.length,
      rowCount: n0 - 1,
      rowH,
      rowGap,
      colGap: gaps.length ? Math.max(0, Math.min(...gaps)) : 0,
      totalW: Math.round(totalW),
      height: Math.round(order[0].b.h),
      cols: cols.map((c) => ({
        id: c.id,
        width: c.width,
        // 百分比按真值宽度均分（4 列 179/98/98/98 ⇒ 38.09% / 20.85% …）
        widthPct: Math.round((c.width / totalW) * 10000) / 100,
        header: {
          text: c.header.text,
          color: c.header.color,
          fs: c.header.fs,
          fw: c.header.fw,
          bg: c.headerBox?.bg ?? null,
          border: cssBorder(c.headerBox?.border),
          pad: cssPadding(c.headerBox?.pad),
        },
        cells: c.cells.map((x, r) => {
          const rn = c.rowNodes?.[r];
          const ic = rn ? resolveMappedIcon(rn, resourceMapping) : null;
          // 图标-文字间距：优先行节点（Auto Layout）真值 `itemSpacing`；取不到 ⇒ null
          // （不设 margin，而不是猜一个 6px）。
          const sp = Number(rn?.itemSpacing);
          return {
            text: x.text,
            color: x.color,
            fs: x.fs,
            fw: x.fw,
            bg: c.cellBoxes?.[r]?.bg ?? null,
            border: cssBorder(c.cellBoxes?.[r]?.border),
            pad: cssPadding(c.cellBoxes?.[r]?.pad),
            // 首列数据行的 28×28 图标（已导出 ⇒ varName/file/尺寸；未导出 ⇒ null 降级）
            icon: ic
              ? { ...ic, gap: Number.isFinite(sp) ? Math.max(0, Math.round(sp)) : null }
              : null,
          };
        }),
      })),
    };
  }
  return { ok: false, reason: 'notTableColumn' };
}

/**
 * 从 buildGridContract 的几何事实回推卡原始节点集合（内容真值）。
 *
 * 路径 A（折叠段正路，如 38:3167-list）：items[].id → figmaIndex。
 * 路径 B（整行段正路，如 38:3140）：geometryFrom === 'figma:<id>' ⇒ 该节点直接子项。
 *
 * 🔴 部分解析即整体失败（fail-open）—— 内容不齐就接管 = 部分内联 + 部分臆造，
 *    比 LLM 更危险。这里不允许「尽力而为」。
 */
function resolveCardNodes(sec, contract, figmaIndex) {
  const items = toArray(sec?.items).length ? toArray(sec.items) : toArray(sec?.body?.items);
  if (items.length === contract.itemCount && items.length > 0) {
    const nodes = items.map((it) => figmaIndex.get(String(it?.id ?? ''))?.rawNode || null);
    if (nodes.every(Boolean)) return { nodes, from: 'items' };
  }
  if (String(contract.geometryFrom || '').startsWith('figma:')) {
    const hit = figmaIndex.get(String(contract.geometryFrom.slice(6)));
    const kids = (hit?.rawNode?.children || []).filter((c) => bboxOf(c));
    if (kids.length === contract.itemCount) return { nodes: kids, from: 'figma' };
  }
  return null;
}

/** 卡原始节点 → 内联真值（bg/圆角/文本 runs/卡内 pad+gap）。任一文本不可解析 ⇒ null。 */
function cardTruth(node) {
  const box = bboxOf(node);
  if (!box) return null;
  const bg = firstSolidFillRgba(node);
  if (!bg) return null; // 卡底色是本刀核心交付之一，缺 ⇒ fail-open
  let r = node?.cornerRadius;
  if (r == null && Array.isArray(node?.rectangleCornerRadii)) {
    r = Math.max(...node.rectangleCornerRadii);
  }
  const texts = [];
  (function walk(n, d) {
    if (!n || d > 3) return;
    for (const c of n.children || []) {
      if (typeof c?.characters === 'string' && c.characters.trim()) texts.push(c);
      walk(c, d + 1);
    }
  })(node, 0);
  if (!texts.length) return null;
  texts.sort((a, b) => {
    const ab = bboxOf(a), bb = bboxOf(b);
    if (!ab || !bb) return 0;
    return ab.y - bb.y || ab.x - bb.x;
  });
  const runs = [];
  for (const t of texts) {
    const ti = textRun(t);
    if (!ti) return null;
    runs.push(ti);
  }
  const tb = runs.map((x) => x.box);
  const pad = Math.max(0, Math.round((tb[0]?.x ?? box.x) - box.x));
  let gap = 0;
  if (tb.length > 1) {
    const gs = tb.slice(1).map((b, i) => Math.round(b.x - (tb[i].x + tb[i].w)));
    gap = Math.max(0, Math.round(gs.reduce((s, g) => s + g, 0) / gs.length));
  }
  return {
    bg,
    r: Number.isFinite(r) ? Math.max(0, Math.round(r)) : 0,
    pad,
    gap,
    runs: runs.map((x) => ({ text: x.text, color: x.color, fs: x.fs, fw: x.fw })),
  };
}

/* ------------------------------------------------------------------ *
 * 🛡️ 刀 53 外观扩维（2026-10-23 · cd8938f8 实锤）
 *
 * 病灶：table / statrow 分支的输出模型只有 `{text,color,fs,fw}` —— **没有
 * background / border / padding 这三个维度**（不是「忘写」，是模型本身无此字段）
 * ⇒ 接管后表格「裸文字」：表头无 `#bdd5ff` 底、数据格无 `#e2ecfe`/`#d6e5ff`
 * 斑马纹、无 `1px solid #ffffff` 白网格线、无 28×28 首列图标；统计卡无渐变底。
 * 判定手法（只读）：模板 class 集合 vs 全部 stylesheet 选择器集合求差集 +
 * 逐节点比对 `fills/strokes/padding*` 真值。
 *
 * 治本：契约扩维 —— 真值从 Figma 原始节点取（`nodeAppearanceTruth` / 子图形节点），
 * **内联输出**（微码预览运行时 SFC scoped style 不生效 ⇒ 与 font-size 同套路）。
 *
 * 🔴 三件套全部「取不到即 null ⇒ 该属性整体不写」，绝不填默认色 ——
 *    「0px 白边」「#fff 兜底底」比没有更糟（会画出真值里不存在的框/底色）。
 * ------------------------------------------------------------------ */

/** 描边真值 → CSS border 值（`1px solid #ffffff`）；无/权重非法 ⇒ null。 */
function cssBorder(b) {
  if (!b || !b.color || !(Number(b.width) > 0)) return null;
  return `${b.width}px solid ${b.color}`;
}

/** Auto Layout 内边距 → CSS padding 简写；全 0 / 缺失 ⇒ null。 */
function cssPadding(pad) {
  if (!pad) return null;
  const { t, r, b, l } = pad;
  if (![t, r, b, l].every((x) => Number.isFinite(x))) return null;
  if (t === 0 && r === 0 && b === 0 && l === 0) return null;
  if (t === b && r === l) return t === r ? `${t}px` : `${t}px ${r}px`;
  return `${t}px ${r}px ${b}px ${l}px`;
}

/** 节点圆角 → px（`cornerRadius` 优先，其次 `rectangleCornerRadii` 最大值；无 ⇒ 0）。 */
function cornerRadiusOf(node) {
  let r = node?.cornerRadius;
  if (r == null && Array.isArray(node?.rectangleCornerRadii)) {
    r = Math.max(...node.rectangleCornerRadii);
  }
  return Number.isFinite(r) ? Math.max(0, Math.round(r)) : 0;
}

/**
 * 行/卡子树内的**已导出图标**真值：非 TEXT 图形节点、尺寸 ≤ `maxSize`、
 * 在资源映射里且下载未失败 ⇒ `{ varName, file, w, h, r }`；否则 null。
 *
 * 🔴 未导出（映射不到 / 下载失败）⇒ 返回 null 而**不是** fail-open 整表 ——
 *    图标缺一个不该让整表退回 LLM（那会丢掉已确定的全表内容）。调用方据此
 *    省略该格 `<img>`，其余真值照常渲染（单属性降级）。
 */
function resolveMappedIcon(node, resourceMapping, maxSize = 64) {
  const mapping = toArray(resourceMapping);
  if (!mapping.length) return null;
  const seen = new Set();
  let best = null;
  const walk = (n, d) => {
    if (!n || seen.has(n) || d > 2) return;
    seen.add(n);
    for (const c of n.children || []) {
      if (!c || typeof c.characters === 'string') continue;
      const b = bboxOf(c);
      if (b && Math.max(b.w, b.h) <= maxSize && !best) {
        const m = mapping.find(
          (e) =>
            String(e?.figmaNodeId) === String(c.id) &&
            e?.resourceFile &&
            e?.downloadStatus !== 'failed',
        );
        const varName = m ? String(m.assignedVarName || m.semanticVarName || '') : '';
        if (varName) {
          best = {
            varName,
            file: String(m.resourceFile).split('/').pop(),
            w: Math.round(b.w),
            h: Math.round(b.h),
            r: cornerRadiusOf(c),
          };
        }
      }
      walk(c, d + 1);
    }
  };
  walk(node, 0);
  return best;
}

/**
 * 「背景用途」的资源标记（**唯一来源**）。
 *
 * 🔴 事故（2026-10-27 · 2ec8acc7 实锤）：`subtreeBackground` 原先用
 * `mapping.some(e => e.figmaNodeId === n.id)` 判「这是图标 ⇒ 跳过」。但资源映射里
 * **背景图也是被下载的资源**（`48:5909` → `bg-5909.png`，`recommendedUsage:
 * 'backgroundStyle'`、`bgRole:'container'`）⇒ 背景节点被当成图标跳过，退回它内部
 * **单根** VECTOR（`43:4894`，`GRADIENT op=0.5`）⇒ 三张统计卡的底只剩 50% 那一层，
 * 顶部 10px 亮条（`43:4897`，`op=1`）整层丢失。用户报障「三个数据是有背景图的」即此。
 *
 * 「是不是图标」与「是不是背景」必须分开判，不能只看「在不在映射里」。
 */
const BG_RESOURCE_FLAGS = {
  usage: new Set(['backgroundStyle', 'backgroundBlock']),
  role: new Set(['bg', 'container']),
};

/** 该节点是否被映射标记为**背景用途**（不含图标）。 */
function isBackgroundResource(node, mapping) {
  return mapping.some(
    (e) =>
      String(e?.figmaNodeId) === String(node?.id) &&
      (BG_RESOURCE_FLAGS.usage.has(String(e?.recommendedUsage || '')) ||
        BG_RESOURCE_FLAGS.usage.has(String(e?.usage || '')) ||
        BG_RESOURCE_FLAGS.role.has(String(e?.previewAnalysisRole || '')) ||
        BG_RESOURCE_FLAGS.role.has(String(e?.bgRole || ''))),
  );
}

/** 该节点是否被映射为**已可用的背景图片**（有文件且确实下载到）。 */
function backgroundImageOf(node, mapping) {
  return (
    mapping.find(
      (e) =>
        String(e?.figmaNodeId) === String(node?.id) &&
        String(e?.resourceFile || '') &&
        String(e?.downloadStatus || '') !== 'failed' &&
        String(e?.downloadStatus || '') !== 'missing' &&
        (BG_RESOURCE_FLAGS.usage.has(String(e?.recommendedUsage || '')) ||
          BG_RESOURCE_FLAGS.usage.has(String(e?.usage || '')) ||
          BG_RESOURCE_FLAGS.role.has(String(e?.previewAnalysisRole || '')) ||
          BG_RESOURCE_FLAGS.role.has(String(e?.bgRole || ''))),
    ) || null
  );
}

/**
 * 卡/格「自绘底」真值：子树内**面积最大的**底候选。
 *
 * 两类候选，二者择一（**不合成**，避免「近似底 + 真图」双重绘制）：
 *   · `image`：命中「背景用途」且已下载 ⇒ 整卡底的**导出快照**（含叠加的全部图层）。
 *   · `css`：子树内面积最大的、非 TEXT 且非已导出图标的图形节点的外观。
 *
 * 🔴 图片优先于 CSS 的**判据**（可辩驳，不是偏好）：图片面积 ≥ CSS 候选面积。
 *    图片是父 GROUP 整块导出、CSS 候选是它内部的某一根矢量 ⇒ 图片必然更完整；
 *    反之若「图片只是卡片里的一小块装饰、CSS 才是整卡底」，面积判据会把它挡掉。
 *
 * 🔴 口径复用 `nodeAppearanceTruth`（单一来源），不在此另造 fills/strokes 解析。
 *
 * @returns {{image:{file:string}, css:null, r:number, border:object|null}
 *          |{image:null, css:string, r:number, border:object|null}
 *          |null}
 */
function subtreeBackground(node, resourceMapping) {
  const mapping = toArray(resourceMapping);
  const isIcon = (n) =>
    mapping.some(
      (e) =>
        String(e?.figmaNodeId) === String(n?.id) &&
        // 🔴 背景资源**不是**图标：漏这一条就等于把整卡底当图标跳过（见上「事故」）
        !isBackgroundResource(n, mapping),
    );
  const seen = new Set();
  let imgBest = null;
  let imgArea = 0;
  let cssBest = null;
  let cssArea = 0;
  const walk = (n, d) => {
    if (!n || seen.has(n) || d > 2) return;
    seen.add(n);
    for (const c of n.children || []) {
      if (!c || typeof c.characters === 'string') continue;
      const b = bboxOf(c);
      const area = b ? b.w * b.h : 0;
      const imgRes = backgroundImageOf(c, mapping);
      if (imgRes && area > imgArea) {
        imgBest = {
          file: String(imgRes.resourceFile).split('/').pop(),
          r: cornerRadiusOf(c),
          border: nodeAppearanceTruth(c).border,
        };
        imgArea = area;
      }
      if (!isIcon(c) && area > cssArea) {
        const t = nodeAppearanceTruth(c);
        if (t.bg) {
          cssBest = { css: t.bg, r: cornerRadiusOf(c), border: t.border };
          cssArea = area;
        }
      }
      walk(c, d + 1);
    }
  };
  walk(node, 0);
  // 图片优先的判据：面积 ≥ CSS 候选（图片是整块导出，必然覆盖 CSS 那根矢量）
  if (imgBest && imgArea >= cssArea) {
    return {
      image: { file: imgBest.file },
      css: null,
      // 🔴 圆角/描边**必须**从 CSS 候选继承：导出图只含填充层，Figma 的
      //    `strokes` 不进 PNG（实测 bg-5909.png 左缘像素 = 中心像素，无描边色）
      //    ⇒ 只看图片节点（GROUP，无 strokes）会把真值描边整条丢掉。
      r: cssBest ? cssBest.r : imgBest.r,
      border: (cssBest && cssBest.border) || imgBest.border,
    };
  }
  if (cssBest) return { image: null, css: cssBest.css, r: cssBest.r, border: cssBest.border };
  return null;
}

/**
 * 折叠网格叶判据：几何复用刀 41 `buildGridContract`（单一来源），
 * 内容真值逐卡可解析 ⇒ 接管；否则 fail-open。
 */
export function detectGridLeaf(sec, figmaIndex) {
  const contract = buildGridContract(sec, { figmaIndex });
  if (!contract) return { ok: false, reason: 'noGridContract' };
  const cards = resolveCardNodes(sec, contract, figmaIndex);
  if (!cards) return { ok: false, reason: 'cardNodesNotFullyResolvable' };
  const items = [];
  for (const n of cards.nodes) {
    const t = cardTruth(n);
    if (!t) return { ok: false, reason: `cardTruthMissing:${n?.id ?? '?'}` };
    items.push(t);
  }
  return {
    ok: true,
    kind: 'grid',
    sectionId: String(sec.id ?? ''),
    baseId: String(contract.geometryFrom || '').startsWith('figma:')
      ? String(contract.geometryFrom.slice(6))
      : String(sec.id ?? ''),
    cols: contract.cols,
    cardW: contract.cardW,
    cardH: contract.cardH,
    colGap: contract.colGap,
    rowGap: contract.rowGap,
    rows: contract.rows,
    items,
  };
}

/* ------------------------------------------------------------------ *
 * 🛡️ 刀 53g 属性网格叶判据（label-value grid）· 2026-10-27
 *
 * ── 病灶（d072d085 实锤）──────────────────────────────────────────────
 * `81:7`「设备属性信息」真值 = **2 组 × 6 行 × 12 对 label:value**，
 * 但它在刀 53 家族里 **七项判据全不命中**：
 *   `grid:noGridContract`（24 个 TEXT、9 个 x 唯一值、12 种宽度 ⇒
 *   `buildGridContract#uniformPitch` 恒 null）、`header:texts=24(need 1)`、
 *   `statrow:notStatRowMember`、`table:notTableColumn`、`text:texts=24(need 1)`、
 *   `icon:hasText(24)`、`legend:noDotTextPair`
 * ⇒ 整段交回 LLM ⇒ 产物猜成 **4 列**（真值 2 列）。
 *
 * 这是「**语义规则、几何不规则**」结构的盲区：几何给不出等距栅格，只有语义
 * （vision 明确声明 12 个 `label-value` + `gridColumns:2`）才看得出配对关系。
 * 载体 = 刀 53g 前身（plan 层 `internalTree`，`5e4ad69`）。
 *
 * ── 判据（双源交叉，全部可辩驳）───────────────────────────────────────
 * 语义源（vision）：`sec.internalTree.children` 全部 `type==='label-value'`、
 *   `gridColumns>=2`、配对数 = 行数 × 列数。
 * 几何源（Figma，真值）：`sec.id` 直接子 TEXT 按**文本**反查——
 *   🔴 **绝不用 vision 的 `id` 做几何锚点**：实测 `81:7` 的 12 个条目 id
 *   整体偏移一位（vision 写 `36:1700`=「所属产品」，真值 `36:1700`=「所属路公司」）。
 *   🔴 也**绝不用 `style.textAlignHorizontal`**：真值 24 个 TEXT 全是 `LEFT`，
 *   但它们的**盒子右缘**对齐在两个固定值（24801 / 25074）⇒ 视觉上 label 是右对齐。
 *   对齐事实只能从盒子几何取。
 * 三条全满足才接管，任一不满足 ⇒ fail-open（不猜，退回 LLM 原路径）：
 *   ① 每列 label 盒**右缘一致**（±2）⇒ label 右对齐事实成立
 *   ② 行锚（label y）聚类数 = 行数、列锚（value x）聚类数 = 列数
 *   ③ 行距等距（复用刀 41 `uniformPitch`，同一容差）
 *
 * ── 分发位置 ────────────────────────────────────────────────────────
 * 放在判定链**最末位**（legend 之后）：与刀 53f 同一论证——本判据要求
 * 「internalTree 显式声明 label-value ≥4 对」这一强前提，结构性上不与
 * statrow（`stat-card`）/ table（`table-header`+`list`）/ text（1 TEXT）/
 * icon（0 TEXT）/ legend（1 图形+1 TEXT）重叠，末位 ⇒ **只可能救原本被 skip 的叶**。
 * ------------------------------------------------------------------ */

/** 属性网格条目的唯一语义类型名（新增别名必须**显式**改这里，不许模糊匹配）。 */
const KV_LEAF_TYPE = 'label-value'

/** 几何容差（与刀 41 `TOL` 同口径；Figma 坐标含浮点/取整差异）。 */
const KV_TOL = 2

/** 值 → 簇（±tol 视为同一锚点）。返回 `[{anchor, members:[原索引]}]`，按 anchor 升序。 */
function clusterByTolerance(values, tol = KV_TOL) {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const clusters = []
  for (const { v, i } of sorted) {
    const last = clusters[clusters.length - 1]
    if (last && Math.abs(v - last.anchor) <= tol) last.members.push(i)
    else clusters.push({ anchor: v, members: [i] })
  }
  return clusters
}

/** 真值行高读取（两条 kv 路径共用，口径一致）。 */
function kvLineHeightOf(n) {
  const v = Number(n?.style?.lineHeightPx)
  return Number.isFinite(v) ? Math.max(1, Math.round(v)) : null
}

/**
 * 🔴 路径 B（2026-10-27 · `81:7` 实锤）：**没有 `internalTree` 时**从 Figma 几何直接
 * 推导 label-value 网格，不再依赖 vision 的词表声明。
 *
 * 为什么需要它：`detectKvGridLeaf` 原实现的唯一输入是 `sec.internalTree.children`，
 * 且要求每项 `type==='label-value'`。`internalTree` 是 vision 自由输出 —— 缺失、
 * 换词（key-value/property）或 id 错位都会让判据恒 `kvPairs=0`。
 * 真机 `81:7`：真值 **6 行 × 4 TEXT = 12 对属性**，却 `kvPairs=0(need>=4)` ⇒ 不接管。
 *
 * 判据（全部来自 Figma 真值，可证伪；任一不满足 ⇒ 不接管）：
 *   ① 直接子 TEXT ≥ 8（≥4 对）；
 *   ② 按 y 聚类得 ≥2 行，且**每行文本数相同、为偶数、≥4**（≥2 对/行，与原 cols>=2 同口径）；
 *   ③ 行内按 x 排序后两两成对，且 **label 右缘 ≤ value.x + KV_TOL**（label 必在 value 左侧）；
 *   ④ 每对 color/fs/fw/bbox 齐全（`textRun` 缺失 ⇒ 不猜）。
 * 后续的列锚/行锚/右对齐/等距/贴边校验**与 vision 路径完全共用**，不另起一套。
 *
 * @returns {{ok:true, resolved:Array, cols:number} | {ok:false}}
 */
function deriveKvResolvedFromGeometry(anchor, anchorBox, texts) {
  const fail = { ok: false }
  if (!anchor || !anchorBox) return fail
  if (texts.length < 8) return fail
  const items = texts.map((n) => ({ n, box: bboxOf(n) }))
  if (items.some((it) => !it.box)) return fail
  const rowClusters = clusterByTolerance(items.map((it) => Math.round(it.box.y)))
  if (rowClusters.length < 2) return fail // 单行不是网格
  const counts = rowClusters.map((c) => c.members.length)
  if (!counts.every((c) => c === counts[0])) return fail // 每行文本数必须一致
  const perRow = counts[0]
  if (perRow < 4 || perRow % 2 !== 0) return fail // 每行至少 2 对，且必须成对
  const cols = perRow / 2
  // 🔴 单位必须一致：perRow 是「每行 TEXT 数」，cols 是「每行对数」（= perRow/2）。
  if (rowClusters.length * perRow !== items.length) return fail
  const resolved = []
  for (const rc of rowClusters) {
    const line = rc.members.map((i) => items[i]).sort((a, b) => a.box.x - b.box.x)
    for (let k = 0; k < line.length; k += 2) {
      const l = line[k]
      const v = line[k + 1]
      if (l.box.x + l.box.w > v.box.x + KV_TOL) return fail // label 必须在 value 左侧
      const lr = textRun(l.n)
      const vr = textRun(v.n)
      if (!lr || !vr || !lr.box || !vr.box) return fail
      resolved.push({
        label: lr,
        value: vr,
        labelLh: kvLineHeightOf(l.n),
        valueLh: kvLineHeightOf(v.n),
      })
    }
  }
  if (resolved.length < 4) return fail
  return { ok: true, resolved, cols }
}

/**
 * 属性网格叶判据（label-value grid）。
 *
 * @param {object} sec section 树节点（`internalTree` 可选；缺失时走 Figma 几何推导）
 * @param {Map} figmaIndex `indexFigmaNodes()` 产物
 * @returns {{ok:true, kind:'kvgrid', ...truth} | {ok:false, reason:string}}
 */
export function detectKvGridLeaf(sec, figmaIndex) {
  const tree = sec?.internalTree
  const pairs = Array.isArray(tree?.children) ? tree.children : []

  // —— 几何真值（Figma）：sec.id 自身 + 直接子 TEXT（两条路径共用，故提前）——
  const entry = figmaIndex && typeof figmaIndex.get === 'function'
    ? figmaIndex.get(String(sec?.id ?? ''))
    : null
  const anchor = entry?.rawNode
  const anchorBox = bboxOf(anchor)
  const texts = (anchor?.children || []).filter(
    (n) => typeof n?.characters === 'string' && n.characters.trim(),
  )

  let resolved = null
  let cols = 0

  if (pairs.length > 0) {
    // ===== 路径 A：vision `internalTree` 声明（行为与此前完全一致）=====
    if (pairs.length < 4) return { ok: false, reason: `kvPairs=${pairs.length}(need>=4)` }
    const types = new Set(pairs.map((p) => String(p?.type || p?.role || '')))
    if (types.size !== 1 || !types.has(KV_LEAF_TYPE)) {
      return { ok: false, reason: `kvTypeMixed(${[...types].join('|')})` }
    }
    cols = Number(tree.gridColumns)
    if (!(cols >= 2)) return { ok: false, reason: 'kvColsMissing' }
    if (pairs.length % cols !== 0) return { ok: false, reason: `kvNotRect(${pairs.length}/${cols})` }

    // —— 语义真值（vision）：只取文本，id 一律不采信 ——
    const wanted = []
    for (const p of pairs) {
      const kids = Array.isArray(p?.children) ? p.children : []
      const lt = String(kids.find((k) => String(k?.type || '') === 'label')?.text ?? '').trim()
      const vt = String(kids.find((k) => String(k?.type || '') === 'value')?.text ?? '').trim()
      if (!lt || !vt) return { ok: false, reason: 'kvTextMissing' }
      wanted.push({ lt, vt })
    }

    if (!anchorBox) return { ok: false, reason: 'kvAnchorBoxMissing' }
    // 每对恰好 2 个 TEXT（label + value）：数量不等 ⇒ 有图标/装饰/复合值，不猜
    if (texts.length !== pairs.length * 2) {
      return { ok: false, reason: `kvTexts=${texts.length}(need ${pairs.length * 2})` }
    }
    const used = new Set()
    const pick = (txt) => texts.find((n) => n.characters.trim() === txt && !used.has(n)) || null
    resolved = []
    for (const w of wanted) {
      const l = pick(w.lt)
      if (!l) return { ok: false, reason: `kvLabelMissing:${w.lt}` }
      used.add(l)
      const v = pick(w.vt)
      if (!v) return { ok: false, reason: `kvValueMissing:${w.vt}` }
      used.add(v)
      const lr = textRun(l)
      const vr = textRun(v)
      if (!lr || !vr) return { ok: false, reason: `kvRunMissing:${w.lt}` }
      // `textRun` 只校验 color/fs/fw，**不**校验 bbox —— 而本判据全部几何都从 bbox 来
      // （列锚/行锚/label 右缘/定宽），缺 bbox 必须 fail-open，不许按 0 参与聚类
      // （按 0 会把所有项聚成一簇 ⇒「恰好」凑出 1 列 1 行的假契约）。
      if (!lr.box || !vr.box) return { ok: false, reason: `kvBoxMissing:${w.lt}` }
      resolved.push({
        label: lr,
        value: vr,
        labelLh: kvLineHeightOf(l),
        valueLh: kvLineHeightOf(v),
      })
    }
    if (used.size !== texts.length) return { ok: false, reason: 'kvTextsUnaccounted' }
  } else {
    // ===== 路径 B：无 internalTree ⇒ Figma 几何推导 =====
    // 推导不过 ⇒ 返回**与此前完全相同**的理由，保证非 kv 叶的日志/行为零变化。
    const derived = deriveKvResolvedFromGeometry(anchor, anchorBox, texts)
    if (!derived.ok) return { ok: false, reason: 'kvPairs=0(need>=4)' }
    resolved = derived.resolved
    cols = derived.cols
  }

  // —— 行列聚类（value.x = 列锚；label.y = 行锚）——
  const rows = resolved.length / cols
  const colClusters = clusterByTolerance(resolved.map((r) => r.value.box.x))
  if (colClusters.length !== cols) {
    return { ok: false, reason: `kvColsMismatch(${colClusters.length}!=${cols})` }
  }
  const rowClusters = clusterByTolerance(resolved.map((r) => r.label.box.y))
  if (rowClusters.length !== rows) {
    return { ok: false, reason: `kvRowsMismatch(${rowClusters.length}!=${rows})` }
  }
  const colOf = new Map()
  colClusters.forEach((c, ci) => c.members.forEach((i) => colOf.set(i, ci)))
  const rowOf = new Map()
  rowClusters.forEach((c, ci) => c.members.forEach((i) => rowOf.set(i, ci)))
  const seen = new Set()
  for (let i = 0; i < resolved.length; i++) {
    const k = `${rowOf.get(i)}:${colOf.get(i)}`
    if (seen.has(k)) return { ok: false, reason: `kvCellDuplicate(${k})` }
    seen.add(k)
  }
  if (seen.size !== resolved.length) return { ok: false, reason: 'kvCellIncomplete' }

  // —— 列事实：label 右缘一致（右对齐）+ 列内 label 定宽 + value 定锚 ——
  const columns = []
  for (let ci = 0; ci < cols; ci++) {
    const idxs = resolved.map((_, i) => i).filter((i) => colOf.get(i) === ci)
    if (!idxs.length) return { ok: false, reason: `kvColEmpty(${ci})` }
    const rights = idxs.map((i) => resolved[i].label.box.x + resolved[i].label.box.w)
    if (clusterByTolerance(rights).length !== 1) {
      return { ok: false, reason: `kvLabelNotRightAligned(col${ci})` }
    }
    const labelGap = Math.round(colClusters[ci].anchor - rights[0])
    if (!(labelGap >= 0) || labelGap > 64) return { ok: false, reason: `kvLabelGap(${labelGap})` }
    columns.push({
      labelGap,
      // 列内 label 定宽 = 该列最宽 label（右对齐 ⇒ 各行右缘仍落在同一处，与真值等价）
      labelW: Math.round(Math.max(...idxs.map((i) => resolved[i].label.box.w))),
      valueW: Math.round(Math.max(...idxs.map((i) => resolved[i].value.box.w))),
    })
  }
  const labelGaps = columns.map((c) => c.labelGap)
  if (Math.max(...labelGaps) - Math.min(...labelGaps) > KV_TOL) {
    return { ok: false, reason: 'kvLabelGapUnstable' }
  }
  const labelGap = Math.round(labelGaps.reduce((s, g) => s + g, 0) / labelGaps.length)

  // —— 行事实：行距等距（复用刀 41 同一实现）——
  const rowPitch = rows > 1 ? uniformPitch(rowClusters.map((c) => Math.round(c.anchor))) : null
  if (rows > 1 && rowPitch === null) return { ok: false, reason: 'kvRowPitchNotUniform' }
  const rowH = Math.max(
    ...resolved.map((r) => Math.max(
      r.labelLh ?? r.label.box.h,
      r.valueLh ?? r.value.box.h,
      r.label.box.h,
      r.value.box.h,
    )),
  )
  const rowGap = rowPitch === null ? 0 : Math.round(rowPitch - rowH)
  if (!(rowGap >= 0) || rowGap > 200) return { ok: false, reason: `kvRowGap(${rowGap})` }

  // —— 列分布形态：首列贴容器左 ∧ 末列贴容器右 ⇒ space-between（**事实**，非样式偏好）——
  const cellW = columns.map((c) => c.labelW + labelGap + c.valueW)
  const firstLeft = Math.min(...resolved.map((r) => r.label.box.x))
  const lastRight = Math.max(...resolved.map((r) => r.value.box.x + r.value.box.w))
  const flushLeft = Math.abs(firstLeft - anchorBox.x) <= KV_TOL
  const flushRight = Math.abs(anchorBox.x + anchorBox.w - lastRight) <= KV_TOL
  let justify = 'start'
  let colGap = 0
  if (flushLeft && flushRight) {
    justify = 'space-between'
  } else {
    const colPitch = uniformPitch(colClusters.map((c) => Math.round(c.anchor)))
    if (colPitch === null) return { ok: false, reason: 'kvColPitchNotUniform' }
    const gaps = cellW.map((w) => colPitch - w)
    if (Math.max(...gaps) - Math.min(...gaps) > KV_TOL) {
      return { ok: false, reason: 'kvColGapUnstable' }
    }
    colGap = Math.max(0, Math.round(gaps[0]))
  }

  // —— 单元按**行优先**输出（真值视觉顺序：逐行左→右）——
  const cells = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = resolved.findIndex((_, k) => rowOf.get(k) === r && colOf.get(k) === c)
      const pr = resolved[i]
      cells.push({
        col: c,
        label: pr.label.text,
        labelColor: pr.label.color,
        labelFs: pr.label.fs,
        labelFw: pr.label.fw,
        labelLh: pr.labelLh ?? pr.label.box.h,
        value: pr.value.text,
        valueColor: pr.value.color,
        valueFs: pr.value.fs,
        valueFw: pr.value.fw,
        valueLh: pr.valueLh ?? pr.value.box.h,
      })
    }
  }

  return {
    ok: true,
    kind: 'kvgrid',
    sectionId: String(sec.id ?? ''),
    baseId: String(sec.id ?? ''),
    cols,
    rows,
    rowGap,
    colGap,
    justify,
    labelGap,
    columns: columns.map((c) => ({ labelW: c.labelW })),
    cells,
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * 刀 20b（2026-10-28 · mc-max-1793174936204-657661ca 实锤）：同构列表接管。
 *
 * ## 病灶
 * vision items 轨给出「节点列表 body.items = 6 张同构卡」，但 LLM 只渲染第 1 张
 * （其余 5 张文本全丢、卡面 rect 被刀 7 当背景吸收成空壳、滚动条 rect 画成
 * 装饰 ⇒「假滚动」）。TEXT-COVERAGE 两轮报 31%/44%，第二轮落 WARN 档放行。
 *
 * ## 判据（全部来自真值，零硬编码）
 *   ① sec 是折叠列表叶（collapsed/v-for，契约同 repeated-section-collapser）；
 *   ② items ≥2 且每项可解出 ≥1 条文本或 ≥1 组 stat（content.elements / stats /
 *      texts / textRuns 任一通道）；
 *   ③ 同构：每项文本段数一致（不一致 = 非同构列表，fail-open 不猜）。
 *   几何（卡高/间距）由 figmaIndex 按 item.id/icon.figmaNode 回查；查不到即
 *   不写该属性（内容自然流），绝不用兜底值。
 * ══════════════════════════════════════════════════════════════════════════ */

/** 刀 23：子树轨 icon 节点定位（role/type === icon），供 resourceMapping 反查。 */
function findSubtreeIconNodeId(node) {
  if (!node || typeof node !== 'object') return null;
  const type = String(node.type || node.role || '').toLowerCase();
  if (type === 'icon' && node.id) return String(node.id);
  for (const c of Array.isArray(node.children) ? node.children : []) {
    const r = findSubtreeIconNodeId(c);
    if (r) return r;
  }
  return null;
}

// 🛡️ Phase B-1（2026-10-31 治理方案）：roleOf + ROLE_*_SET 角色词表收拢至
//   vision-facts.js 单一来源（本模块原定义删除，防第 4 份词表 split-brain）。
// 🛡️ Phase A-2（2026-10-31 治理方案）：canonicalListItem 家族（统计 5+ 形态回退链）
//   迁至 section-semantics.js#canonicalListItem 单一实现，本模块薄壳引用。
// 🛡️ Phase A-2（2026-10-31 治理方案）：normListItem 家族（统计 5+ 形态回退链）
//   迁至 section-semantics.js#canonicalListItem 单一实现，本模块薄壳引用；
//   roleOf/ROLE_*_SET 词表随 normListItem 家族一并迁出（本模块不再直接消费）。
import { canonicalListItem } from './section-semantics.js';

export function detectListLeaf(sec, figmaIndex, resourceMapping) {
  const fail = (reason) => ({ ok: false, reason });
  if (!sec || typeof sec !== 'object') return fail('noSection');
  // vision 的结构类型优先：显式表格即使带 body.items/折叠标记，也只能走 table 接管。
  // 表格判据事实不足时 fail-open 给后续检测，不得把一行多列拍平成纵排普通列表。
  if (String(sec.type || '').toLowerCase() === 'table') return fail('explicitTable');
  if (sec.collapsed !== true && sec.renderHint !== 'v-for') return fail('notCollapsedList');
  const items = Array.isArray(sec.items) ? sec.items : null;
  if (!items || items.length < 2) return fail('items<2');
  // 🛡️ 刀 21d（mc-max-1793181937804-3e301cdb 实锤）：顶层 items 可能是 E1 富化
  //   **树节点**（children 子树里是 TEXT/icon，无 content.elements/stat）⇒ 归一全空；
  //   而 vision 富卡轨完整保留在 `sec.body.items`（F1 回填）。双轨合并判据：
  //   顶层归一有任一空项 且 body.items 同长度（同构对齐防错配）且归一全非空
  //   ⇒ 内容轨改用 body.items；**几何轨仍用顶层 items**（E1 卡盒真值，含
  //   absoluteBoundingBox/id 可回查）。零硬编码：不满足对齐条件维持原失败口径。
  let norm = items.map(canonicalListItem);
  const isEmpty = (n) => n.texts.length === 0 && n.stats.length === 0;
  // 🛡️ 刀 21d（mc-max-1793181937804-3e301cdb 实锤）：顶层 items 可能是 E1 富化
  //   **树节点**（children 子树里是 TEXT/icon，无 content.elements/stat）⇒ 归一全空；
  //   而 F1 回填把每项自己的 vision 富卡挂在 `item.body.items[0]`（per-item 单轨）。
  //   判据：逐项比较——body.items 恰 1 条（防错配）且其归一**内容更全**
  //   （texts+stats 条数严格更多）⇒ 用其内容轨；**几何轨仍用顶层 items**
  //   （E1 卡盒真值）。刀 23 后顶层子树也能抽出文本（兜底轨），故条件从
  //   「空才回退」改为「更全者胜出」——确定性条数比较，零语义猜测。
  norm = norm.map((n, i) => {
    const inner = items[i]?.body?.items;
    if (Array.isArray(inner) && inner.length === 1) {
      const m = canonicalListItem(inner[0]);
      // 结构优先：带 stats 的轨承载「左文本+右数值」分区结构（margin-left:auto
      // 右列渲染），优于纯文本纵排；同结构再比总条数。权重常数是判据而非事实。
      const score = (x) =>
        (x.stats.length > 0 ? 1000 : 0) + x.texts.length + x.stats.length;
      if (score(m) > score(n)) return m;
    }
    return n;
  });
  // 🛡️ 刀31b（2026-10-29，mc-max-1793258602028-6eafb2f7 实锤）：整 body vision 轨
  //   与顶层 figma 轨**逐项比分**（同 21d 口径：stats>0 权重 1000 + 条数），取代旧
  //   「仅空项才回退」——旧口径下 figma 拍平轨 texts=6（非空）把角色分区轨
  //   （texts=2+stats=2，卡内布局结构）顶掉 ⇒ 纵堆。比分平局/更低 ⇒ 维持顶层轨。
  const structuralScore = (x) =>
    (x.stats.length > 0 ? 1000 : 0) + x.texts.length + x.stats.length;
  if (norm.some(isEmpty)) {
    const bodyItems =
      Array.isArray(sec.body?.items) && sec.body.items.length === items.length
        ? sec.body.items
        : null;
    if (bodyItems) {
      const bodyNorm = bodyItems.map(canonicalListItem);
      if (!bodyNorm.some(isEmpty)) norm = bodyNorm;
    }
  } else if (Array.isArray(sec.body?.items) && sec.body.items.length === items.length) {
    const bodyNorm = sec.body.items.map(canonicalListItem);
    norm = norm.map((n, i) => {
      const b = bodyNorm[i];
      if (!b || isEmpty(b)) return n;
      return structuralScore(b) > structuralScore(n) ? b : n;
    });
  }
  if (norm.some(isEmpty)) return fail('emptyItem');

  // 🛡️ 刀31d（2026-10-29，mc-max-1793258602028-6eafb2f7 实锤）：fill 数据轨补真值——
  //   vision repeatedFill 缺失（本 run 全 null）时按卡 figma 子树回查：本体首个可见
  //   SOLID fill 优先，取不到 ⇒ 子树内首个带可见 SOLID fill 的矩形节点（卡底真值
  //   常是卡内衬底 rect，如 48:5799 #a6ceff 首卡高亮）。fillToRgba 单一口径，
  //   vision repeatedFill 在场时仍以 vision 为准（不覆盖）。
  norm.forEach((n, i) => {
    if (n.fill) return;
    const it = items[i];
    const entry =
      figmaIndex?.get(String(it?.figmaNodeId ?? '')) ||
      figmaIndex?.get(String(it?.id ?? '')) ||
      (Array.isArray(it?.sourceNodeIds)
        ? figmaIndex?.get(String(it.sourceNodeIds[0]))
        : null);
    const raw = entry?.rawNode || entry?.node || null;
    if (!raw) return;
    const own = firstSolidFillRgba(raw);
    if (own) {
      n.fill = own;
      return;
    }
    // 卡底衬底 rect 通常是子树内**面积最大**的 SOLID 填充节点（48:5799 实锤）；
    //   BFS 首个命中会抓到小装饰色块 ⇒ 收集全部候选取面积最大者（零语义判据）。
    const candidates = [];
    const stack = Array.isArray(raw.children) ? [...raw.children] : [];
    while (stack.length) {
      const c = stack.shift();
      const rgba = firstSolidFillRgba(c);
      if (rgba) {
        const b = c?.absoluteBoundingBox || c?.bbox || null;
        const area =
          b && Number.isFinite(b.width) && Number.isFinite(b.height)
            ? b.width * b.height
            : 0;
        candidates.push({ rgba, area });
      }
      if (Array.isArray(c?.children)) stack.push(...c.children);
    }
    if (candidates.length > 0) {
      candidates.sort((a, z) => z.area - a.area);
      n.fill = candidates[0].rgba;
    }
  });
  const t0 = norm[0].texts.length;
  if (!norm.every((n) => n.texts.length === t0)) return fail('heteroTextCount');

  // 🛡️ 刀 23（b2086a9c 实锤）：children 子树轨的 icon 不在 item.icon，而在子树
  //   role/type==='icon' 节点上（无 resource 文件名）⇒ 用节点 id 反查
  //   resourceMapping（figmaNodeId → resourceFile，与 header/icon 接管同口径）。
  //   查不到 ⇒ icon 留 null（缺事实不猜），不阻断列表接管。
  const mapping = toArray(resourceMapping);
  const iconNodeIds = items.map((it, i) => {
    if (norm[i].icon) return null;
    const nodeId =
      findSubtreeIconNodeId(it) || findSubtreeIconNodeId(it?.body?.items?.[0]);
    if (nodeId) {
      const m = mapping.find(
        (e) =>
          String(e?.figmaNodeId) === nodeId &&
          e?.resourceFile &&
          e?.downloadStatus !== 'failed',
      );
      if (m) {
        norm[i].icon = {
          file: String(m.resourceFile).split('/').pop(),
          w: Number.isFinite(Number(m.width)) ? Number(m.width) : null,
          h: Number.isFinite(Number(m.height)) ? Number(m.height) : null,
        };
        return nodeId;
      }
    }
    // 子树轨 vision 节点 id 不可信（b2086a9c 实测全是伪造重复 id）⇒ 回退：
    //   卡 figma 子树内**唯一**带资源映射的节点即 icon（多命中 = 有背景图等
    //   歧义 ⇒ 不猜，留 null）。判据=归属唯一性，零语义猜测。
    const cardEntry = figmaIndex?.get(String(it?.id ?? ''));
    const hits = [];
    const walkR = (nn) => {
      if (!nn || typeof nn !== 'object') return;
      const hit = mapping.find(
        (e) =>
          String(e?.figmaNodeId) === String(nn.id) &&
          e?.resourceFile &&
          e?.downloadStatus !== 'failed',
      );
      if (hit) hits.push({ node: nn, m: hit });
      for (const c of Array.isArray(nn.children) ? nn.children : []) walkR(c);
    };
    walkR(cardEntry?.rawNode);
    if (hits.length === 1) {
      norm[i].icon = {
        file: String(hits[0].m.resourceFile).split('/').pop(),
        w: Number.isFinite(Number(hits[0].m.width)) ? Number(hits[0].m.width) : null,
        h: Number.isFinite(Number(hits[0].m.height)) ? Number(hits[0].m.height) : null,
      };
      return String(hits[0].node.id);
    }
    return null;
  });

  // ── 几何真值：卡盒 = **能解释该行 fill 的自绘底祖先盒** ───────────────────
  // 🛡️ 刀33（2026-10-29 · c-aiot-dpjh-bsjd-fg-list-485798list-item 用户报障实锤）：
  //   vision item 锚点**层级错位** —— `items[i].id` 指向的是卡内的**内层内容组**
  //   （`48:5801`，430×41），而带 `repeatedFill` 自绘底的**卡盒**是它的祖先
  //   （`48:5798`，470×72 / 圆角 6）。直接拿 `items[i].id` 的盒当卡盒 ⇒ 三处几何全错：
  //     · 卡高 41（真值 72）
  //     · 卡间距 51（真值 20 = 步长 92 − 卡高 72）
  //     · icon 左内距 0（真值 20 = 图标盒左边 − 卡盒左边）
  //   判据（零硬编码：纯几何 + 颜色**单一来源**归一，无阈值、无兜底）：
  //     ① 锚 = 该行 `fill` 归一（`normalizeCssColor`，与 N1 真值色值门禁同口径）；
  //     ② 从 item 起始节点沿 `parentOf` 上溯，取**第一个**「子树内（含自身）存在归一后
  //        与锚相等的可见 SOLID 填充」的节点 = 该行自绘底所在层；
  //     ③ 该节点盒必须**能容纳本行且不含其它行**（否则命中的是列表容器而非卡盒）；
  //     ④ 行间卡盒尺寸不一致 / 任一行为空 ⇒ 不下发 cardH/gaps（自然流，绝不猜）。
  const toBox = (b) =>
    b &&
    Number.isFinite(b.x) &&
    Number.isFinite(b.y) &&
    Number.isFinite(b.width) &&
    Number.isFinite(b.height)
      ? { x: b.x, y: b.y, w: b.width, h: b.height }
      : null;
  const parentOf = buildParentMap(figmaIndex);
  const boxContains = (outer, inner) =>
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.w >= inner.x + inner.w &&
    outer.y + outer.h >= inner.y + inner.h;
  /** 子树（含自身）内首个归一后 == `target` 的可见 SOLID 填充节点；无 ⇒ null。 */
  const findFillAnchorNode = (node, target) => {
    if (!node || !target) return null;
    const seen = new Set();
    const stack = [node];
    while (stack.length) {
      const n = stack.shift();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      if (n.visible === false) continue;
      const own = firstSolidFillRgba(n);
      if (own && normalizeCssColor(own) === target) return n;
      for (const c of Array.isArray(n.children) ? n.children : []) stack.push(c);
    }
    return null;
  };
  /**
   * 单行卡盒真值。**不可证 ⇒ 回落该行自身盒**（无从证明错位就不改，保持旧口径）。
   * @returns {{box:object|null, node:object|null, fillNode:object|null}}
   */
  const resolveCardBox = (it, rowBox, fill, allRowBoxes) => {
    const target = normalizeCssColor(fill);
    let cur = String(it?.figmaNodeId ?? it?.figmaNode ?? it?.id ?? '');
    if (!cur || !target || !figmaIndex) return { box: rowBox, node: null, fillNode: null };
    let guard = 0;
    while (cur && guard++ < 64) {
      const entry = figmaIndex.get(cur);
      const node = entry?.rawNode || entry?.node || null;
      if (node) {
        const hit = findFillAnchorNode(node, target);
        if (hit) {
          const cb = toBox(entry?.bbox || node.absoluteBoundingBox || node.bbox);
          const ok =
            !!cb &&
            (!rowBox || (cb.w >= rowBox.w && cb.h >= rowBox.h)) &&
            // 「恰好容纳本行」：若还含别的行 ⇒ 上溯到的是列表容器，不是卡盒
            !allRowBoxes.some((rb) => rb && rb !== rowBox && boxContains(cb, rb));
          return ok ? { box: cb, node, fillNode: hit } : { box: rowBox, node: null, fillNode: null };
        }
      }
      cur = parentOf.get(cur) || null;
    }
    return { box: rowBox, node: null, fillNode: null };
  };
  // 行盒（几何轨，旧口径）：E1 富化树节点直读优先（刀 21d），否则按 item id / icon 节点回查
  const rowBoxes = items.map((it) => {
    const direct = it?.absoluteBoundingBox;
    const e =
      direct && Number.isFinite(direct.x) && Number.isFinite(direct.y)
        ? { bbox: direct }
        : figmaIndex?.get(String(it?.figmaNodeId ?? it?.figmaNode ?? it?.id ?? '')) ||
          figmaIndex?.get(String(it?.icon?.figmaNode ?? ''));
    return toBox(e?.bbox || e?.absoluteBoundingBox || e?.rawNode?.absoluteBoundingBox);
  });
  const cards = items.map((it, i) => resolveCardBox(it, rowBoxes[i], norm[i].fill, rowBoxes));
  const cardBoxes = cards.map((c, i) => c.box || rowBoxes[i]);
  const geoReady =
    cardBoxes.length > 0 &&
    cardBoxes.every(Boolean) &&
    cardBoxes.every(
      (b) =>
        Math.round(b.w) === Math.round(cardBoxes[0].w) &&
        Math.round(b.h) === Math.round(cardBoxes[0].h),
    );
  let cardH = null;
  let gaps = null;
  let padL = null;
  let radius = null;
  let itemBg = null;
  if (geoReady) {
    cardH = Math.round(cardBoxes[0].h);
    const byY = cardBoxes.map((b, i) => ({ b, i })).sort((a, z) => a.b.y - z.b.y);
    gaps = byY.slice(1).map((p, k) => {
      const prev = byY[k].b;
      return Math.round(p.b.y - (prev.y + prev.h));
    });
    // icon 左内距真值：icon 盒左边 − **卡盒**左边（首项可解即下发；不可解不写）
    //   刀 23：子树轨 icon 用反查到的节点 id 回查几何
    const iconId0 = items[0]?.icon?.figmaNode
      ? String(items[0].icon.figmaNode)
      : iconNodeIds[0] || null;
    const iconNode0 = iconId0 ? figmaIndex?.get(iconId0) : null;
    const ib = toBox(
      iconNode0?.bbox || iconNode0?.absoluteBoundingBox || iconNode0?.rawNode?.absoluteBoundingBox,
    );
    if (ib) padL = Math.round(ib.x - cardBoxes[0].x);
    // 卡圆角真值：自绘底 SOLID 填充节点的圆角（本单 48:5799 RECT cr=6）。
    //   取不到 / 为 0 ⇒ 不写（绝不填兜底圆角）。
    const r = cards[0].fillNode ? cornerRadiusOf(cards[0].fillNode) : 0;
    if (r > 0) radius = r;
    // 每卡自绘**图条**真值：卡盒子树内**唯一**被映射标记为「背景用途」的可下载资源
    //   （与 statrow 的 `subtreeBackground` 同族判据；图标因 `isBackgroundResource` 为假被排除）。
    //   多命中（歧义）/ 无 varName ⇒ 不下发（不猜）。四件套复用资源挂载层同一纯函数。
    if (cards[0].node) {
      const map = toArray(resourceMapping);
      const hits = [];
      const seen = new Set();
      const walkNode = (n) => {
        if (!n || seen.has(n)) return;
        seen.add(n);
        const hit = map.find(
          (e) =>
            String(e?.figmaNodeId) === String(n.id) &&
            e?.resourceFile &&
            e?.downloadStatus !== 'failed' &&
            isBackgroundResource(n, map),
        );
        if (hit) hits.push(hit);
        for (const c of Array.isArray(n.children) ? n.children : []) walkNode(c);
      };
      walkNode(cards[0].node);
      if (hits.length === 1) {
        const hit = hits[0];
        const varName = String(hit.assignedVarName || hit.semanticVarName || '');
        if (varName) {
          itemBg = {
            varName,
            file: String(hit.resourceFile).split('/').pop(),
            style: inferBackgroundStyle(hit),
            sourceFill: norm[0].fill || null,
          };
        }
      }
    }
  }
  // 图条事实来自首卡，但绑定域必须由逐卡状态证明：仅与来源卡填充一致的项共享。
  // 不同激活填充 ⇒ 不扩散；所有项填充一致 ⇒ 仍允许全部共享，不硬编码「只有首项」。
  const itemBgFill = normalizeCssColor(itemBg?.sourceFill);
  if (itemBgFill) {
    for (const n of norm) n.bg = normalizeCssColor(n.fill) === itemBgFill;
  }
  return {
    ok: true,
    kind: 'list',
    sectionId: String(sec.id ?? ''),
    baseId: String(sec.id ?? ''),
    items: norm,
    cardH,
    gaps,
    padL,
    radius,
    itemBg,
  };
}

/** script 内联 JSON（转义 `<`，防 `</script>` 提前闭合）。 */
function inlineJson(value) {
  return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}
/** section id → CSS 安全片段（类名唯一性来源：同组件内不同叶绝不撞名）。 */
function idSlug(id) {
  return String(id || 'x').replace(/[^a-zA-Z0-9]/g, '');
}

/** JSON 字符串字面量（模板 {{ title }} 用，进 script const）。 */
function jsonStr(s) {
  return JSON.stringify(String(s)).replace(/</g, '\\u003c');
}

/**
 * 确定性渲染叶组件（数据内联、类名唯一、关键几何全部内联 style —— 不依赖
 * common.less / 共享表，免疫「后写者胜」）。
 */
export function renderFoldedGridLeafVue(tr, semantic) {
  const sem = String(semantic || 'component');
  // 🔴 同构列表（刀 20b）：N 项 v-for 真值展开。文案/色值/字号逐项内联进
  //   FG_LIST_ITEMS（script const），卡高/间距/左内距全部几何真值；缺事实的属性
  //   一律不写（undefined 绑定），绝不兜底。滚动：min-height:0 + overflow-y:auto
  //   ⇒ 内容超高时是真滚动，不画假滚动条。
  if (tr.kind === 'list') {
    const cls = `c-${sem}-fg-list-${idSlug(tr.sectionId)}`;
    // 图标：同文件去重共用一个 import 变量；ITEMS 里直接引用变量（非字符串，
    //   避免表格 kind 的 ICON_MAP 查表弯路——本数组是 JS 字面量可直接持引用）。
    const fileToVar = new Map();
    const importLines = [];
    const itemIconExpr = tr.items.map((it) => {
      if (!it.icon) return 'null';
      if (!fileToVar.has(it.icon.file)) {
        const v = `fgListIcon${fileToVar.size}`;
        fileToVar.set(it.icon.file, v);
        importLines.push(`import ${v} from '../../resources/images/${it.icon.file}'`);
      }
      return fileToVar.get(it.icon.file);
    });
    // 🛡️ 刀33：每卡「图条」真值（卡盒内自绘底图）。变量名**取资源映射层的
    //   `assignedVarName`** ⇒ 资源挂载层的 `bgBindingOwnership` 见之判 `self`（幂等），
    //   不会与容器挂载互相打架（自造命名空间会被判 `other` 而 fail-closed 并留诊断噪声）。
    //   🔴 图片 URL 只能走 `:style` 绑定，绝不能拼进静态 `style="..."`（静态段是纯 CSS
    //   文本，`bg1` 不会被求值 ⇒ 浏览器拿到相对 URL `url(bg1)` → 404 → 整卡零背景，593cf7f 事故）。
    const itemBg = tr.itemBg && tr.itemBg.varName ? tr.itemBg : null;
    if (itemBg) {
      importLines.push(`import ${itemBg.varName} from '../../resources/images/${itemBg.file}'`);
    }
    // 静态段只放 CSS 常量（size/position/repeat 与圆角）；URL 由 `:style` 段给出，
    //   两段属性不重叠 ⇒ Vue 合并 static style 与 `:style` 时不会互相覆盖。
    const itemStatic =
      (tr.radius ? `border-radius:${tr.radius}px;` : '') +
      (itemBg
        ? `background-size:${itemBg.style.size};background-repeat:${itemBg.style.repeat};background-position:${itemBg.style.position};`
        : '');
    const itemBindBg = itemBg ? `, backgroundImage: it.bg ? 'url(' + ${itemBg.varName} + ')' : undefined` : '';
    const itemLit = tr.items.map((it, i) => {
      const texts = `[${it.texts
        .map(
          (t) =>
            `{ t: ${jsonStr(t.t)}, c: ${t.c ? jsonStr(t.c) : 'null'}, fs: ${t.fs ?? 'null'}, fw: ${t.fw ? jsonStr(t.fw) : 'null'} }`,
        )
        .join(', ')}]`;
      const stats = `[${it.stats
        .map(
          (s) =>
            `{ v: ${jsonStr(s.v)}, l: ${jsonStr(s.l)}, vc: ${s.vc ? jsonStr(s.vc) : 'null'}, vfs: ${s.vfs ?? 'null'}, vfw: ${s.vfw ? jsonStr(s.vfw) : 'null'}, lc: ${s.lc ? jsonStr(s.lc) : 'null'}, lfs: ${s.lfs ?? 'null'} }`,
        )
        .join(', ')}]`;
      return `  { texts: ${texts}, stats: ${stats}, icon: ${itemIconExpr[i]}, iconW: ${it.icon?.w ?? 'null'}, iconH: ${it.icon?.h ?? 'null'}, fill: ${it.fill ? jsonStr(it.fill) : 'null'}, bg: ${it.bg === true} }${i < tr.items.length - 1 ? ',' : ''}`;
    });
    const gapsLit = Array.isArray(tr.gaps)
      ? `const FG_LIST_GAPS = ${inlineJson(tr.gaps)};`
      : 'const FG_LIST_GAPS = null;';
    const lines = [
      '<template>',
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:flex;flex-direction:column;min-height:0;overflow-y:auto;">`,
      // 🔴 卡底走 `backgroundColor` **长写**（非 `background` 简写）：简写会把上面静态段的
      //   `background-size/position/repeat` 一并重置为初始值 ⇒ 图条尺寸/定位全丢。
      //   长写与静态段四属性零重叠 ⇒ Vue 合并 static style 与 `:style` 时互不覆盖。
      `    <div v-for="(it, __i) in FG_LIST_ITEMS" :key="__i" class="${cls}-item" style="display:flex;flex-direction:row;align-items:center;flex:none;box-sizing:border-box;${itemStatic}" :style="{${tr.cardH ? ` height: '${tr.cardH}px',` : ''} marginTop: __i > 0 && FG_LIST_GAPS ? FG_LIST_GAPS[__i - 1] + 'px' : undefined, backgroundColor: it.fill || undefined${itemBindBg} }">`,
      `      <img v-if="it.icon" :src="it.icon" :style="{ width: it.iconW ? it.iconW + 'px' : undefined, height: it.iconH ? it.iconH + 'px' : undefined, objectFit: 'contain', flex: 'none'${tr.padL != null ? `, marginLeft: '${tr.padL}px'` : ''} }" alt="" />`,
      `      <div style="display:flex;flex-direction:column;justify-content:center;min-width:0;flex:1 1 auto;">`,
      `        <span v-for="(t, __j) in it.texts" :key="__j" :style="{ color: t.c || undefined, fontSize: t.fs ? t.fs + 'px' : undefined, fontWeight: t.fw || undefined, lineHeight: 1.2, whiteSpace: 'nowrap' }">{{ t.t }}</span>`,
      `      </div>`,
      `      <div v-if="it.stats.length" style="margin-left:auto;display:flex;flex-direction:row;flex:none;">`,
      `        <div v-for="(s, __k) in it.stats" :key="__k" style="display:flex;flex-direction:column;align-items:flex-end;justify-content:center;">`,
      `          <span :style="{ color: s.vc || undefined, fontSize: s.vfs ? s.vfs + 'px' : undefined, fontWeight: s.vfw || undefined, lineHeight: 1.2, whiteSpace: 'nowrap' }">{{ s.v }}</span>`,
      `          <span v-if="s.l" :style="{ color: s.lc || undefined, fontSize: s.lfs ? s.lfs + 'px' : undefined, lineHeight: 1.2, whiteSpace: 'nowrap' }">{{ s.l }}</span>`,
      `        </div>`,
      `      </div>`,
      `    </div>`,
      `  </div>`,
      '</template>',
      '',
      '<script setup>',
      ...importLines,
      `const FG_LIST_ITEMS = [`,
      ...itemLit,
      `];`,
      gapsLit,
      '</script>',
      '',
      '<style lang="less" scoped>',
      `.${cls} { min-width: 0; }`,
      '</style>',
      '',
    ];
    return lines.join('\n');
  }
  // 🔴 统计行（刀 53d）：整行由 x 最小成员渲染全部 N 卡（真值尺寸/色值/字号/卡内序
  //   全部内联）；非首个成员渲染 `display:none` 空壳 ⇒ 不参与父容器 flex 布局，
  //   杜绝「N 个组件各画一遍」的重复卡。
  if (tr.kind === 'statrow') {
    const cls = `c-${sem}-fg-statrow-${idSlug(tr.sectionId)}`;
    if (tr.memberIndex > 0) {
      return [
        '<template>',
        `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:none;"></div>`,
        '</template>',
        '',
        '<script setup>',
        '</script>',
        '',
        '<style lang="less" scoped>',
        `// 本卡由统计行首个成员（${tr.memberCount} 卡整行）统一渲染，此处仅占位不显示`,
        '</style>',
        '',
      ].join('\n');
    }
    const lines = [
      '<template>',
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:${tr.gap}px;width:100%;padding:0;">`,
    ];
    tr.members.forEach((m, i) => {
      const tSpan = `<span class="${cls}-t${i}" style="color:${m.titleColor};font-size:${m.titleFs}px;font-weight:${m.titleFw};line-height:1;white-space:nowrap;">{{ t${i} }}</span>`;
      const vSpan = `<span class="${cls}-v${i}" style="color:${m.valueColor};font-size:${m.valueFs}px;font-weight:${m.valueFw};line-height:1;white-space:nowrap;">{{ v${i} }}</span>`;
      // 卡外观真值内联（真值：`GRADIENT_LINEAR` 底 + `#a0c1ff` 描边 + 圆角）；
      // 取不到即不写该属性 —— 绝不填兜底色（会画出真值里不存在的卡底）。
      // 🔴 底走**图片通道**时（`bgImageVar`）不得再写 `background:${m.bg}`：
      //   图片是整卡底的导出快照（含叠加图层），CSS 近似底只会把它盖掉。
      //   `background-size:100% 100%` 钉死拉伸到卡尺寸，`no-repeat` 防平铺。
      // 🔴🔴 图片 URL 必须走 **`:style` 绑定**，绝不能拼进静态 `style="..."`：
      //   静态 style 是纯 CSS 文本，Vue 不做变量求值 ⇒ 浏览器拿到的是相对 URL
      //   `url(fgStatBg0)` → 404 ⇒ 整卡零背景。593cf7f 就是在这里翻车的：图片通道
      //   逻辑（选图/面积判据/描边继承）全对，只差绑定形态，于是「三个统计卡有背景图」
      //   这个用户报障修完仍在，且 `import fgStatBg<i>` 三行全成死代码。
      //   静态段只留 CSS 常量（size/repeat），图片 URL 由绑定段给出；两段属性不重叠，
      //   Vue 合并 static style 与 `:style` 时不会互相覆盖（同属性才是 bound 优先）。
      const cardStatic = [
        m.bgImageVar
          ? 'background-size:100% 100%;background-repeat:no-repeat;'
          : m.bg ? `background:${m.bg};` : '',
        m.border ? `border:${m.border};` : '',
        m.pad ? `padding:${m.pad};` : 'padding:0;',
        m.r ? `border-radius:${m.r}px;` : '',
      ].join('');
      const cardBindStyle = m.bgImageVar
        ? ` :style="{ backgroundImage: 'url(' + ${m.bgImageVar} + ')' }"`
        : '';
      lines.push(
        `    <div class="${cls}-card${i}" style="display:flex;flex-direction:${tr.innerDir};align-items:center;justify-content:center;gap:${tr.innerGap}px;flex:1;min-width:0;height:${tr.cardH}px;box-sizing:border-box;${cardStatic}"${cardBindStyle}>`,
        `      ${m.titleFirst ? tSpan : vSpan}`,
        `      ${m.titleFirst ? vSpan : tSpan}`,
        '    </div>',
      );
    });
    lines.push('  </div>', '</template>', '', '<script setup>');
    // 卡底图片 import（变量名由判据侧分配 `fgStatBg<i>`，与 LLM 侧的 `bgN`/`iconN`
    // 命名空间隔离 ⇒ 不可能与 `injectResourceImports` 注入的绑定撞名）
    tr.members.forEach((m) => {
      if (m.bgImageVar && m.bgImageFile) {
        lines.push(`import ${m.bgImageVar} from '../../resources/images/${m.bgImageFile}'`);
      }
    });
    tr.members.forEach((m, i) => {
      lines.push(`const t${i} = ${jsonStr(m.title)}`);
      lines.push(`const v${i} = ${jsonStr(m.value)}`);
    });
    lines.push('</script>', '', '<style lang="less" scoped>', `.${cls} { min-width: 0; }`, '</style>', '');
    return lines.join('\n');
  }
  // 🔴 列式表格（刀 53e / 方案 C）：整表由「列序最小」的列所在叶段渲染
  //    （真值 4 列 × 9 行，含表头行）；同 tableId 的其余叶段渲染 `display:none` 空壳
  //    ⇒ 杜绝「每列各渲染一遍 / 表头无人渲染」。
  if (tr.kind === 'table') {
    const cls = `c-${sem}-fg-table-${idSlug(tr.sectionId)}`;
    if (tr.memberIndex > 0) {
      return [
        '<template>',
        `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:none;"></div>`,
        '</template>',
        '',
        '<script setup>',
        '</script>',
        '',
        '<style lang="less" scoped>',
        `// 本列由表格首个列（${tr.memberCount} 列 × ${tr.rowCount} 行整表）统一渲染，此处仅占位不显示`,
        '</style>',
        '',
      ].join('\n');
    }
    const lines = [
      '<template>',
      // 🔴 表格用 column 包行、行内 row 包列：行必须显式 flex（真值列容器是横排兄弟），
      //    行高/列宽全部内联（scoped style 在预览运行时不生效）。外观三件套
      //    （bg/border/pad）同样**内联**：表头 `#bdd5ff`、斑马纹、`1px #ffffff`
      //    白网格线、`padding:10px 16px` 全部来自 Figma 行节点真值，取不到即不写。
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;height:${tr.height}px;padding:0;min-width:0;box-sizing:border-box;">`,
      `    <div class="${cls}-thead" style="display:flex;flex-direction:row;align-items:center;justify-content:flex-start;height:${tr.rowH}px;flex:none;">`,
    ];
    tr.cols.forEach((c, i) => {
      const thStyle = [
        `flex:0 0 ${c.widthPct}%;`,
        'box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-width:0;',
        c.header.pad ? `padding:${c.header.pad};` : 'padding:0;',
        c.header.bg ? `background:${c.header.bg};` : '',
        c.header.border ? `border:${c.header.border};` : '',
      ].join('');
      lines.push(
        `      <div class="${cls}-th${i}" style="${thStyle}">`,
        `        <span class="${cls}-th${i}-t" style="color:${c.header.color};font-size:${c.header.fs}px;font-weight:${c.header.fw};line-height:1;white-space:nowrap;">{{ h${i} }}</span>`,
        '      </div>',
      );
    });
    // 行节距真值为负（`itemSpacing=-1`，压叠 1px）⇒ 用 margin-top 表达（flex 的
    // row-gap 会把负值 clamp 成 0，真值 388 会变 396）。
    //
    // 图标 import 与「名字 → 模块绑定」查表：按 varName 去重（同一 varName 指向不同
    // file ⇒ 冲突，全不渲染 —— 绝不猜测「取哪一个」）；varName 非法 JS 标识符同样跳过
    // （降级不渲图标，不炸脚本）。
    // 🔴 必须在**模板生成之前**算出来：模板要按「本列有没有可用图标」决定是否产 `<img>`
    //   以及 `:src` 走查表还是直取。
    // 🔴🔴 图标 URL 必须经运行时查表 `ICON_MAP[名]`，模板里绝不能直接绑名字：
    //   `rows` 是 JSON 字面量（`inlineJson`），`iconVar` 存的是**变量名的字符串**
    //   （`"icon4"`）⇒ 直接 `:src="row.c0.iconVar"` 求值成 `src="icon4"`（相对 URL 404），
    //   而 `import icon4` 全成死代码。实锤：c-device-6d79e69d 表格首列 8 行图标全破图。
    const iconFiles = new Map();
    const iconConflicts = new Set();
    const IDENT_RX = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
    for (const c of tr.cols) {
      for (const cell of c.cells) {
        const ic = cell.icon;
        if (!ic?.varName || !ic.file || !IDENT_RX.test(ic.varName)) continue;
        const prev = iconFiles.get(ic.varName);
        if (prev && prev !== ic.file) iconConflicts.add(ic.varName);
        else if (!prev) iconFiles.set(ic.varName, ic.file);
      }
    }
    const usableIconVars = [...iconFiles.keys()].filter((v) => !iconConflicts.has(v));
    const usableIconSet = new Set(usableIconVars);
    const colHasIcon = (c) =>
      (c.cells || []).some((cell) => cell.icon && usableIconSet.has(cell.icon.varName));
    lines.push(
      '    </div>',
      `    <div v-for="(row, ri) in rows" :key="ri" class="${cls}-tr" style="display:flex;flex-direction:row;align-items:center;justify-content:flex-start;height:${tr.rowH}px;flex:none;${tr.rowGap ? `margin-top:${tr.rowGap}px;` : ''}">`,
    );
    tr.cols.forEach((c, i) => {
      lines.push(
        `      <div class="${cls}-td${i}" :style="{ boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, flex: '0 0 ${c.widthPct}%', padding: row.c${i}.pad || 0, background: row.c${i}.bg || undefined, border: row.c${i}.border || undefined }">`,
      );
      // 无可用图标的列不产 `<img>`（零副作用：既不写永不为真的绑定，也不引空查表）
      if (colHasIcon(c)) {
        lines.push(`        <img v-if="row.c${i}.iconVar" :src="ICON_MAP[row.c${i}.iconVar]" alt="" :style="{ width: row.c${i}.iconW + 'px', height: row.c${i}.iconH + 'px', objectFit: 'contain', flex: 'none', marginRight: row.c${i}.iconGap == null ? undefined : row.c${i}.iconGap + 'px' }" />`);
      }
      lines.push(
        `        <span class="${cls}-td${i}-t" :style="{ color: row.c${i}.color, fontSize: row.c${i}.fs + 'px', fontWeight: row.c${i}.fw, lineHeight: 1, whiteSpace: 'nowrap' }">{{ row.c${i}.text }}</span>`,
        '      </div>',
      );
    });
    lines.push(
      '    </div>',
      '  </div>',
      '</template>',
      '',
      '<script setup>',
    );
    tr.cols.forEach((c, i) => lines.push(`const h${i} = ${jsonStr(c.header.text)}`));
    // 图标 import（判据见模板段前的 `iconFiles` / `iconConflicts` 计算，此处只落盘）
    for (const v of usableIconVars) {
      lines.push(`import ${v} from '../../resources/images/${iconFiles.get(v)}'`);
    }
    // 名字 → 模块绑定。模板 `:src="ICON_MAP[row.cN.iconVar]"` 的唯一来源：
    // `rows` 里存的是字符串名（JSON 字面量无法承载模块绑定），查表是唯一正确的桥。
    if (usableIconVars.length > 0) {
      lines.push(`const ICON_MAP = { ${usableIconVars.join(', ')} }`);
    }
    // 行优先：每行按列序取真值（含各自颜色/字号/字重 ⇒ 「禁用」橙色不会丢；含外观
    // 三件套与首列图标 ⇒ 斑马纹/白网格线/图标不会丢）
    const rows = [];
    for (let r = 0; r < tr.rowCount; r++) {
      const row = {};
      tr.cols.forEach((c, i) => {
        const cell = c.cells[r];
        const ic = cell.icon && !iconConflicts.has(cell.icon.varName) ? cell.icon : null;
        row[`c${i}`] = {
          text: cell.text,
          color: cell.color,
          fs: cell.fs,
          fw: cell.fw,
          bg: cell.bg,
          border: cell.border,
          pad: cell.pad,
          iconVar: ic ? ic.varName : null,
          iconW: ic ? ic.w : 0,
          iconH: ic ? ic.h : 0,
          iconGap: ic ? ic.gap : null,
        };
      });
      rows.push(row);
    }
    lines.push(`const rows = ${inlineJson(rows)}`);
    lines.push(
      '</script>',
      '',
      '<style lang="less" scoped>',
      `.${cls} { min-width: 0; }`,
      '</style>',
      '',
    );
    return lines.join('\n');
  }
  if (tr.kind === 'kvgrid') {
    // 🔴 属性网格叶（刀 53g）：`label: value` 成对排布（真值 d072d085 `81:7` =
    //   2 组 × 6 行 × 12 对）。**全部几何内联**（预览运行时 SFC scoped style 不生效，
    //   与 font-size 同套路）；`label` 用「定宽 + text-align:right」复刻真值的
    //   **右缘对齐**事实（真值 24 个 TEXT 的盒子右缘钉在两个固定 x，而
    //   `style.textAlignHorizontal` 全是 LEFT ⇒ 对齐只能靠盒子几何表达，不能靠 text-align 声明）。
    // 🔴 列分布用 `justify-content`（space-between 或固定 column-gap），由判据按
    //   「首列贴容器左 ∧ 末列贴容器右」的**事实**选定，不再让 LLM 猜列数（真值 2 列 vs 旧产物 4 列）。
    const cls = `c-${sem}-fg-kvgrid-${idSlug(tr.sectionId)}`;
    const gridStyle = [
      'display:grid',
      `grid-template-columns:repeat(${tr.cols}, max-content)`,
      `justify-content:${tr.justify}`,
      tr.colGap > 0 ? `column-gap:${tr.colGap}px` : '',
      tr.rowGap > 0 ? `row-gap:${tr.rowGap}px` : '',
      'align-content:start',
      'align-items:start',
      'padding:0',
    ].filter(Boolean).join(';');
    const lines = [
      '<template>',
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="${gridStyle};">`,
    ];
    tr.cells.forEach((c, i) => {
      const lw = tr.columns[c.col]?.labelW ?? c.labelW;
      lines.push(
        `    <div class="${cls}-cell" style="display:flex;flex-direction:row;align-items:baseline;gap:${tr.labelGap}px;">`,
        `      <span class="${cls}-label" style="flex:0 0 ${lw}px;text-align:right;color:${c.labelColor};font-size:${c.labelFs}px;font-weight:${c.labelFw};line-height:${c.labelLh}px;white-space:nowrap;">{{ l${i} }}</span>`,
        `      <span class="${cls}-value" style="color:${c.valueColor};font-size:${c.valueFs}px;font-weight:${c.valueFw};line-height:${c.valueLh}px;white-space:nowrap;">{{ v${i} }}</span>`,
        '    </div>',
      );
    });
    lines.push('  </div>', '</template>', '', '<script setup>');
    tr.cells.forEach((c, i) => {
      lines.push(`const l${i} = ${jsonStr(c.label)}`);
      lines.push(`const v${i} = ${jsonStr(c.value)}`);
    });
    lines.push(
      '</script>',
      '',
      '<style lang="less" scoped>',
      `.${cls} { min-width: 0; }`,
      `.${cls}-cell { min-width: 0; }`,
      `.${cls}-label { flex: none; }`,
      `.${cls}-value { min-width: 0; }`,
      '</style>',
      '',
    );
    return lines.join('\n');
  }
  if (tr.kind === 'icon') {
    // 🔴 纯 icon 叶（刀 53c）：真值尺寸内联、object-fit:contain；资源变量由
    //    injectResourceImports 补 import（单一事实源）。**不依赖任何 style 块**
    //   （预览运行时 scoped style 不生效，round-16 实锤）。
    const cls = `c-${sem}-fg-icon-${idSlug(tr.sectionId)}`;
    return [
      '<template>',
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:flex;align-items:center;justify-content:center;min-width:0;padding:0;">`,
      `    <img :src="${tr.iconVar}" alt="" class="${cls}-img" style="width:${tr.iconW}px;height:${tr.iconH}px;object-fit:contain;flex:none;" />`,
      '  </div>',
      '</template>',
      '',
      '<script setup>',
      `import ${tr.iconVar} from '../../resources/images/${tr.iconFile}'`,
      '</script>',
      '',
      '<style lang="less" scoped>',
      `.${cls} { min-width: 0; }`,
      `.${cls}-img { object-fit: contain; }`,
      '</style>',
      '',
    ].join('\n');
  }
  if (tr.kind === 'legend') {
    // 🔴 图例叶（刀 53f）：圆点用 **CSS 圆**（真值 ELLIPSE 纯色，无路径数据 ⇒ 不需要
    //   也不可能有 PNG）；尺寸/色值/间距/字号全部内联 —— 预览运行时 scoped style 不生效，
    //   放进 style 块 = 圆点塌成 0×0（事故件 `.dot` 只有 background 没有宽高，正是这个坑）。
    //   `flex:none` 钉死圆点不被 flex 收缩，`align-items:center` 保证点与文本垂直居中。
    const cls = `c-${sem}-fg-legend-${idSlug(tr.sectionId)}`;
    return [
      '<template>',
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:${tr.gap}px;${tr.height ? `height:${tr.height}px;` : ''}min-width:0;padding:0;">`,
      `    <span class="${cls}-dot" style="display:block;width:${tr.dotW}px;height:${tr.dotH}px;border-radius:50%;background:${tr.dotColor};flex:none;"></span>`,
      `    <span class="${cls}-text" style="color:${tr.color};font-size:${tr.fontSize}px;font-weight:${tr.fontWeight};line-height:1;white-space:nowrap;">{{ text }}</span>`,
      '  </div>',
      '</template>',
      '',
      '<script setup>',
      `const text = ${jsonStr(tr.text)}`,
      '</script>',
      '',
      '<style lang="less" scoped>',
      `.${cls} { min-width: 0; }`,
      `.${cls}-dot { border-radius: 50%; }`,
      `.${cls}-text { font-size: ${tr.fontSize}px; }`,
      '</style>',
      '',
    ].join('\n');
  }
  if (tr.kind === 'text') {
    // 🔴 纯文本叶（刀 53b）：span + 真值内联 color/size/weight（scoped style 块在预览
    //   运行时不生效 ⇒ 字号必须内联，归一器经 protectFgTagInlineStyles 豁免）。
    //   **绝不渲染 img** —— 本判据的存在意义就是堵「纯文本叶被 LLM 臆造成无 :src 破图」。
    const cls = `c-${sem}-fg-text-${idSlug(tr.sectionId)}`;
    // 🔴 N 段文本：每段独立真值样式与相邻间距；不能用统一 gap 抹平非等距，也不能拼成
    //   一个字符串（会丢「编码」与「爆闪灯」的不同颜色）。单段旧产物仍走下方原分支。
    if (Array.isArray(tr.runs) && tr.runs.length > 1) {
      const direction = tr.direction === 'column' ? 'column' : 'row';
      const marginProp = direction === 'column' ? 'margin-top' : 'margin-left';
      const lines = [
        '<template>',
        `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:flex;flex-direction:${direction};align-items:${direction === 'column' ? 'flex-start' : 'center'};justify-content:flex-start;min-width:0;${tr.height ? `height:${tr.height}px;` : ''}padding:0;">`,
      ];
      tr.runs.forEach((run, i) => {
        const margin = i > 0 ? `${marginProp}:${run.gapBefore}px;` : '';
        const multiline = Boolean(run.multiline && run.lineHeight);
        const width = multiline ? `width:${run.width}px;` : '';
        const lineHeight = multiline ? `${run.lineHeight}px` : '1';
        const whiteSpace = multiline ? 'normal' : 'nowrap';
        lines.push(
          `    <span style="display:block;flex:none;${width}${margin}color:${run.color};font-size:${run.fontSize}px;font-weight:${run.fontWeight};line-height:${lineHeight};white-space:${whiteSpace};">{{ runs[${i}].text }}</span>`,
        );
      });
      lines.push(
        '  </div>',
        '</template>',
        '',
        '<script setup>',
        `const runs = ${inlineJson(tr.runs.map((run) => ({ text: run.text })))}`,
        '</script>',
        '',
        '<style lang="less" scoped>',
        `.${cls} { min-width: 0; }`,
        '</style>',
        '',
      );
      return lines.join('\n');
    }
    // 🔴 多行文本（2026-10-27 · 36:1719 长描述实锤）：必须允许换行并用真值行高，
    //   否则 `nowrap + line-height:1` 把 3 行正文压成一行溢出。单行分支**逐字不变**。
    if (tr.multiline && tr.lineHeight) {
      return [
        '<template>',
        `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:flex;align-items:flex-start;justify-content:flex-start;min-width:0;${tr.height ? `height:${tr.height}px;` : ''}padding:0;">`,
        `    <span style="display:block;width:100%;color:${tr.color};font-size:${tr.fontSize}px;font-weight:${tr.fontWeight};line-height:${tr.lineHeight}px;white-space:normal;">{{ text }}</span>`,
        '  </div>',
        '</template>',
        '',
        '<script setup>',
        `const text = ${jsonStr(tr.text)}`,
        '</script>',
        '',
        '<style lang="less" scoped>',
        `.${cls} { min-width: 0; }`,
        `.${cls}-text { font-size: ${tr.fontSize}px; }`,
        '</style>',
        '',
      ].join('\n');
    }
    return [
      '<template>',
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:flex;align-items:center;justify-content:flex-start;min-width:0;${tr.height ? `height:${tr.height}px;` : ''}padding:0;">`,
      `    <span style="color:${tr.color};font-size:${tr.fontSize}px;font-weight:${tr.fontWeight};line-height:1;white-space:nowrap;">{{ text }}</span>`,
      '  </div>',
      '</template>',
      '',
      '<script setup>',
      `const text = ${jsonStr(tr.text)}`,
      '</script>',
      '',
      '<style lang="less" scoped>',
      `.${cls} { min-width: 0; }`,
      `.${cls}-text { font-size: ${tr.fontSize}px; }`,
      '</style>',
      '',
    ].join('\n');
  }
  if (tr.kind === 'header') {
    const cls = `c-${sem}-fg-header-${idSlug(tr.sectionId)}`;
    // 🔴 font-size 放**内联 style 属性**（round-16 推翻 round-10 结论）：
    //   微码预览运行时里 SFC scoped style 块**不生效**（54 个 stylesheet 无 fg- 规则），
    //   放 style 块 = 字号塌回继承值；放内联则依赖归一器的 fg- 标签内联保护
    //   （font-size-normalizer#protectFgTagInlineStyles，单点豁免）。
    // 🔴 内联必须钉死 flex-direction:row：布局事实注入器会给宿主 class 写
    //   `flex-direction:column`（内联没钉的属性 class 就能赢，round-10 实锤）。
    return [
      '<template>',
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:${tr.gap}px;height:${tr.height}px;padding:0;">`,
      `    <img :src="${tr.iconVar}" alt="" class="${cls}-icon" style="width:${tr.iconW}px;height:${tr.iconH}px;object-fit:contain;flex:none;" />`,
      `    <span class="${cls}-title" style="color:${tr.titleColor};font-size:${tr.fontSize}px;font-weight:${tr.fontWeight};line-height:1;white-space:nowrap;">{{ title }}</span>`,
      '  </div>',
      '</template>',
      '',
      '<script setup>',
      `import ${tr.iconVar} from '../../resources/images/${tr.iconFile}'`,
      `const title = ${jsonStr(tr.title)}`,
      '</script>',
      '',
      '<style lang="less" scoped>',
      `.${cls} { min-width: 0; }`,
      `.${cls}-icon { display: block; }`,
      `.${cls}-title { font-size: ${tr.fontSize}px; }`,
      '</style>',
      '',
    ].join('\n');
  }
  const cls = `c-${sem}-fg-grid-${idSlug(tr.sectionId)}`;
  const lines = [
    '<template>',
    // 🔴 justify-content 必须显式内联：只要有写作者（LLM/注入器）给宿主 class 写
    //   `justify-content:space-between`，列不满时第二排卡会被甩到行末尾（round-11 实锤，
    //   战略段第二行「天地伟业」跑到右侧）。真值一律左起排布。
    `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:grid;justify-content:start;grid-template-columns:repeat(${tr.cols}, ${tr.cardW}px);grid-auto-rows:${tr.cardH}px;column-gap:${tr.colGap}px;${tr.rows > 1 && tr.rowGap !== null ? `row-gap:${tr.rowGap}px;` : ''}align-content:start;align-items:stretch;">`,
    `    <div v-for="(it, i) in items" :key="i" class="${cls}-card" :style="{ background: it.bg, borderRadius: it.r + 'px', paddingLeft: it.pad + 'px', gap: it.gap + 'px' }">`,
    `      <span v-for="(t, ti) in it.runs" :key="ti" :style="{ color: t.color, fontSize: t.fs + 'px', fontWeight: t.fw, lineHeight: 1, whiteSpace: 'nowrap' }">{{ t.text }}</span>`,
    '    </div>',
    '  </div>',
    '</template>',
    '',
    '<script setup>',
    `const items = ${inlineJson(
      tr.items.map((it) => ({ bg: it.bg, r: it.r, pad: it.pad, gap: it.gap, runs: it.runs })),
    )}`,
    '</script>',
    '',
    '<style lang="less" scoped>',
    `.${cls} { min-width: 0; }`,
    `.${cls}-card { display: flex; align-items: center; min-width: 0; overflow: hidden; box-sizing: border-box; }`,
    '</style>',
    '',
  ];
  return lines.join('\n');
}

/**
 * 收集全部可接管的叶段 → Map<组件标签名, 真值+vue>。
 *
 * @param {object} p
 * @param {Array} p.treeSections resolvePlanSections(input) 的产物（plan 唯一权威树）
 * @param {object|null} p.figmaNodeData input.figmaNodeData（document 本体或包装）
 * @param {Array} p.resourceMapping effectiveMapping（资源映射，icon 反查用）
 * @param {string} p.componentName input.componentName（类名语义前缀）
 * @param {object} [p.logger]
 * @returns {{ map: Map<string, {kind:string, sectionId:string, baseId:string, suppressed:boolean, vue:string}>,
 *            evaluated: number, headerHits: number, gridHits: number, legendHits: number,
 *            skipped: Array<{id:string, reason:string}> }}
 */
export function collectFoldedGridTakeover(p = {}) {
  const out = { map: new Map(), evaluated: 0, headerHits: 0, gridHits: 0, textHits: 0, iconHits: 0, legendHits: 0, kvGridHits: 0, listHits: 0, statRowHits: 0, statRowSuppressed: 0, tableHits: 0, tableSuppressed: 0, tableAnchorRepairs: 0, skipped: [] };
  const treeSections = Array.isArray(p.treeSections) ? p.treeSections : [];
  if (!treeSections.length) return out;
  const figmaIndex = indexFigmaNodes(
    p.figmaNodeData?.document || p.figmaNodeData || null,
  );
  const semantic = String(p.componentName || '')
    .replace(/^c-/, '')
    .toLowerCase() || 'component';
  let nameOf = new Map();
  try {
    nameOf = assignSectionComponentNames(treeSections);
  } catch {
    return out;
  }
  const parentOf = buildParentMap(figmaIndex);
  // 🔴 统计行必须**两阶段决策**（离线重放实锤：真值 3 卡的 x 最小成员 `43:4893`
  //    **不在 plan 里**，若按「只有 memberIndex===0 才渲染整行」，则 plan 内的两个
  //    成员（index 1/2）全被抑制 ⇒ 整行变空，比不接管更糟）。
  //    故按 parentId 分组，组内 memberIndex 最小者渲染整行，其余抑制。
  const statRowPending = [];
  // 表格两阶段同 statrow：真值「x 最小的列」未必在 plan 里（本单 plan 只切了
  // `43:4785` 与折叠段 `43:4812-list`）⇒ 按 parentId 分组，组内 memberIndex 最小者
  // 渲染整表，其余抑制；若要求 memberIndex===0 才渲染，本单会整表变空。
  const tablePending = [];
  for (const sec of collectLeafSections(treeSections)) {
    if (!sec?.id) continue;
    out.evaluated += 1;
    // 🔴 判定顺序：网格 → 标题行 → **统计行** → 表格 → 纯文本 → 纯 icon → 图例
    //    （刀 53b/53c/53d/53e/53f）—— 互斥域递减（cards≥2 / 1 TEXT+已映射 icon /
    //    兄弟同构 N 元组 / 同表多列 / 线性 N TEXT 无图形 / 0 TEXT 且已导出 PNG /
    //    1 ELLIPSE + 1 TEXT 的 ≥2 组同构）。统计行/表格必须**早于** text/icon：
    //    它们的成员各自含 2 个 TEXT；即使成员几何可被线性 text 接管，父级聚类判据
    //    也更严格，先判可锁定整行/整表归属。图例**放最后**：与 text/icon 两两互斥，
    //    末位 ⇒ 结构上不可能抢走既有命中（只救原本被 skip 的叶）。
    let tr = detectGridLeaf(sec, figmaIndex);
    if (!tr.ok) {
      const h = detectHeaderRowLeaf(sec, figmaIndex, p.resourceMapping);
      if (h.ok) tr = h;
      else {
        const sr = detectStatRowLeaf(sec, figmaIndex, parentOf, p.resourceMapping);
        if (sr.ok) {
          statRowPending.push({ sec, tr: sr });
          continue;
        } else {
          const tb = detectTableLeaf(sec, figmaIndex, parentOf, p.resourceMapping);
          if (tb.ok) {
            if (tb.anchorRepair === 'declared-headers-lca') out.tableAnchorRepairs += 1;
            tablePending.push({ sec, tr: tb });
            continue;
          } else {
          // 🔴 同构列表（刀 20b）：位序在 grid/header/statrow/table 之后、text 之前。
          //   折叠列表是 planner 显式结构契约（collapsed/v-for + enriched items），
          //   先于「按 figma 子树猜」的 text/icon 检测消费；grid/statrow/table 在前
          //   ⇒ 既有折叠网格/表格行为不受影响（它们先判，命中即走）。
          const ls = detectListLeaf(sec, figmaIndex, p.resourceMapping);
          if (ls.ok) tr = ls;
          else {
          const t = detectTextLeaf(sec, figmaIndex);
          if (t.ok) tr = t;
          else {
            const ic = detectIconLeaf(sec, figmaIndex, p.resourceMapping);
            if (ic.ok) tr = ic;
            else {
              // 🔴 图例（刀 53f）**必须放在最后**：text 要求子树 0 图形、icon 要求
              //   子树 0 TEXT、legend 要求「恰 1 图形 + 恰 1 TEXT」——三者两两互斥，
              //   故末位只可能救「原本被 skip 的叶」，**结构上不可能抢走既有命中**
              //   （阴性零误伤是结构保证，不靠断言兜）。
              const lg = detectLegendDotTextLeaf(sec, figmaIndex, parentOf);
              if (lg.ok) tr = lg;
              else {
                // 🔴 属性网格（刀 53g）**同样放末位**，与图例同一论证：本判据要求
                //   「plan 的 internalTree 显式声明 label-value（≥4 对、同 type、
                //   列数可整除）」，与 statrow（`stat-card`）/ table（`table-header`+
                //   `list`）/ icon（子树 0 TEXT）/ legend（恰 1 图形 + 恰 1 TEXT）
                //   结构性互斥；text 虽支持 N 段，但只接受同一行或每段独占一行，
                //   kvgrid 的混合多行多列会被 textRunsNotLinear 明确拒绝 ⇒ 不会被抢走。
                const kv = detectKvGridLeaf(sec, figmaIndex);
                if (kv.ok) tr = kv;
                else {
                  out.skipped.push({ id: String(sec.id), reason: `grid:${tr.reason};header:${h.reason};statrow:${sr.reason};table:${tb.reason};list:${ls.reason};text:${t.reason};icon:${ic.reason};legend:${lg.reason};kv:${kv.reason}` });
                  continue;
                }
              }
            }
          }
          }
          }
        }
      }
    }
    const tag = nameOf.get(String(sec.id));
    if (!tag) {
      out.skipped.push({ id: String(sec.id), reason: 'noComponentName' });
      continue;
    }
    if (tr.kind === 'header') out.headerHits += 1;
    else if (tr.kind === 'text') out.textHits += 1;
    else if (tr.kind === 'icon') out.iconHits += 1;
    else if (tr.kind === 'legend') out.legendHits += 1;
    // 🔴 刀 53g 必须**显式**分支：否则会落进下面的 `else` 被算成 gridHits，
    //   而「gridHits 里有几个是属性网格」正是真机核验唯一依据 ⇒ 计数失真 = 假绿。
    // 🔴 刀 20b 必须**显式**分支（同 53g 教训）：否则落进 else 被算成 gridHits ⇒ 计数失真。
    else if (tr.kind === 'list') out.listHits += 1;
    else if (tr.kind === 'kvgrid') out.kvGridHits += 1;
    else out.gridHits += 1;
    out.map.set(String(tag), {
      kind: tr.kind,
      sectionId: tr.sectionId,
      baseId: tr.baseId,
      height: Number.isFinite(Number(tr.height)) ? Number(tr.height) : null,
      // 🛡️ P1-B（2026-10-26）：显式暴露「本成员是否被两阶段决策抑制」。
      //   下游装配层（code-generator#buildDeterministicIndexTemplate）需要据此把该成员
      //   的宽/高从 flex 归一化分母里剔除；此前只能靠 `vue.includes('display:none')` 嗅探
      //   字符串，属把「渲染产物」当「判据」的反模式（改一个类名就静默失效）。
      suppressed: false,
      vue: renderFoldedGridLeafVue(tr, semantic),
    });
  }

  // 统计行第二阶段：按 parentId 分组，组内 memberIndex 最小者渲染整行，其余抑制。
  const statRowGroups = new Map();
  for (const item of statRowPending) {
    const key = String(item.tr.parentId || item.tr.baseId);
    if (!statRowGroups.has(key)) statRowGroups.set(key, []);
    statRowGroups.get(key).push(item);
  }
  for (const [, arr] of statRowGroups) {
    arr.sort((a, b) => a.tr.memberIndex - b.tr.memberIndex);
    arr.forEach((item, i) => {
      const tag = nameOf.get(String(item.sec.id));
      if (!tag) {
        out.skipped.push({ id: String(item.sec.id), reason: 'noComponentName' });
        return;
      }
      // i===0 ⇒ 强制 memberIndex=0（渲染整行 N 卡）；其余保持原 index ⇒ 渲染 display:none 空壳
      const effective = i === 0 ? { ...item.tr, memberIndex: 0 } : item.tr;
      if (i === 0) out.statRowHits += 1;
      else out.statRowSuppressed += 1;
      out.map.set(String(tag), {
        kind: 'statrow',
        sectionId: effective.sectionId,
        baseId: effective.baseId,
        // i>0 ⇒ 渲染 display:none 空壳 ⇒ 装配层须把其宽度从 flex 分母剔除（P1-B）
        suppressed: i !== 0,
        vue: renderFoldedGridLeafVue(effective, semantic),
      });
    });
  }

  // 表格第二阶段（刀 53e）：按 parentId（表 id）分组，组内 memberIndex 最小者渲染整表，
  // 其余抑制 —— 与 statrow 同构，理由相同（真值 x 最小列未必在 plan 里）。
  const tableGroups = new Map();
  for (const item of tablePending) {
    const key = String(item.tr.parentId || item.tr.baseId);
    if (!tableGroups.has(key)) tableGroups.set(key, []);
    tableGroups.get(key).push(item);
  }
  for (const [, arr] of tableGroups) {
    arr.sort((a, b) => a.tr.memberIndex - b.tr.memberIndex);
    arr.forEach((item, i) => {
      const tag = nameOf.get(String(item.sec.id));
      if (!tag) {
        out.skipped.push({ id: String(item.sec.id), reason: 'noComponentName' });
        return;
      }
      const effective = i === 0 ? { ...item.tr, memberIndex: 0 } : item.tr;
      if (i === 0) out.tableHits += 1;
      else out.tableSuppressed += 1;
      out.map.set(String(tag), {
        kind: 'table',
        sectionId: effective.sectionId,
        baseId: effective.baseId,
        // i>0 ⇒ 渲染 display:none 空壳 ⇒ 装配层须把其宽度从 flex 分母剔除（P1-B）
        suppressed: i !== 0,
        vue: renderFoldedGridLeafVue(effective, semantic),
      });
    });
  }

  p.logger?.info?.('🛡️ 刀 53 同构段确定性接管·已评估', {
    leaves: out.evaluated,
    headerTaken: out.headerHits,
    gridTaken: out.gridHits,
    textTaken: out.textHits,
    iconTaken: out.iconHits,
    legendTaken: out.legendHits,
    statRowTaken: out.statRowHits,
    statRowSuppressed: out.statRowSuppressed,
    tableTaken: out.tableHits,
    tableSuppressed: out.tableSuppressed,
    tableAnchorRepairs: out.tableAnchorRepairs,
    skipped: out.skipped.slice(0, 16),
  });
  return out;
}

/**
 * 🛡️ vue3 接线（2026-10-23）：把「接管真值」映射到**实际的子组件文件路径**。
 *
 * ## 为什么 microcode 不需要它、vue3 必须要有
 *
 * microcode 的子组件清单来自 plan（`assignSectionComponentNames` 确定性命名），
 * 所以 `tag` 直接就是文件名 ⇒ 一行 `package/components/${tag}.vue` 即可。
 * **vue3 不是**：子组件清单由 `_detectSubComponents` + 模板标签从 LLM 生成的
 * `index.vue` 里反解出来（`vue3-engineer.js:739-755`），而 `vue3-prompt.js` 里
 * `requiredSubComps` 是**死变量**（解构后从未下发任何命名约束，实测全文件仅 1 处出现）
 * ⇒ vue3 子组件名是 LLM 自由命名，与 plan 派生的 tag 大概率不同。
 * 直接照搬 microcode 的「tag 即文件名」⇒ 恒零命中且**无计数** ⇒ 假绿闭环。
 *
 * ## 两级匹配（判不了就 fail-open，绝不猜）
 *
 *   ① **名命中**：`tag === takeoverMap 的 key` ⇒ 可在生成前跳过 LLM chunk；
 *   ② **section-id 命中**：产物里出现 `data-section-id` 且落在接管集合内 ⇒ 生成后覆写。
 *   两级都不中 ⇒ 进 `unmatched`，只留痕、不动文件。
 *
 * @param {object} p
 * @param {Map<string, {kind:string, sectionId:string, baseId:string, vue:string}>} p.takeoverMap
 * @param {Array<string>} p.subPaths 形如 `package/components/X.vue`
 * @param {object|null} [p.fileContents] subPath → 文件内容（② 级匹配用，可省）
 * @returns {{ byName: Map<string, object>, bySectionId: Map<string, object>,
 *   evaluated: number, nameHits: number, sectionIdHits: number, unmatched: string[] }}
 */
export function matchFgTakeoverTargets(p = {}) {
  const byName = new Map();
  const bySectionId = new Map();
  const out = { byName, bySectionId, evaluated: 0, nameHits: 0, sectionIdHits: 0, unmatched: [] };
  const takeoverMap = p.takeoverMap instanceof Map ? p.takeoverMap : null;
  if (!takeoverMap || takeoverMap.size === 0) return out;

  const trBySection = new Map();
  for (const tr of takeoverMap.values()) {
    if (tr && tr.sectionId != null) trBySection.set(String(tr.sectionId), tr);
  }

  const list = Array.isArray(p.subPaths) ? p.subPaths : [];
  for (const subPath of list) {
    if (typeof subPath !== 'string' || !subPath.endsWith('.vue')) continue;
    // 🔴 主组件硬护栏：`package/index.vue` 常带 `data-section-id`（容器级），若把它当
    //   匹配目标覆写 ⇒ 整个组件被一个叶段顶替（灾难）。只认 `package/components/` 下的文件。
    if (!subPath.includes('/components/') || subPath.endsWith('/index.vue')) continue;
    out.evaluated += 1;
    const tag = subPath.split('/').pop().replace(/\.vue$/, '');
    if (takeoverMap.has(tag)) {
      byName.set(subPath, takeoverMap.get(tag));
      continue;
    }
    const contents = p.fileContents && typeof p.fileContents === 'object' ? p.fileContents : null;
    const content = contents ? contents[subPath] : null;
    if (typeof content === 'string') {
      const m = /data-section-id="([^"]+)"/.exec(content);
      const tr = m && m[1] ? trBySection.get(m[1]) : null;
      if (tr) {
        bySectionId.set(subPath, tr);
        continue;
      }
    }
    out.unmatched.push(subPath);
  }
  out.nameHits = byName.size;
  out.sectionIdHits = bySectionId.size;
  return out;
}
