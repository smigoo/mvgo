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
import { buildGridContract } from './grid-list-layout-contract.js';

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
export const FG_TAKEOVER_CLASS_RX = /-fg-(?:header|grid|text|icon|statrow|table)-/;

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
  for (const raw of ids) {
    if (raw == null || raw === '') continue;
    const id = String(raw);
    let entry = figmaIndex.get(id) || null;
    if (!entry) {
      const base = id.replace(/-[A-Za-z0-9:._-]+$/, '');
      if (base && base !== id) entry = figmaIndex.get(base) || null;
    }
    if (!entry?.rawNode) continue;
    if (!out.has(String(entry.rawNode.id))) out.set(String(entry.rawNode.id), entry.rawNode);
    for (const c of entry.rawNode.children || []) {
      if (c?.id && !out.has(String(c.id))) out.set(String(c.id), c);
    }
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
  return {
    text: String(t.characters),
    color,
    fs: Math.round(fs * 100) / 100,
    fw,
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
  return { ok: false, reason: 'anchorNotExportedAsImage' };
}

/**
 * 纯文本叶判据（刀 53b，2026-10-22 mc-1792662399514-2b715fa0 实锤）：
 * 锚点子树**恰 1 个 TEXT、0 个图形节点**（GROUP 纯包装允许）。
 *
 * 病灶：顶部 stat 条的数字叶（`38:3262`="33" fs24 fw600 蓝、`38:3284`="66"）与
 * 标题叶（`38:3285`="在线设备"）被 LLM chunk 臆造成**无 `:src` 的 `<img>`**
 * ⇒ 数字整段消失 + 破图占位 alt 文字（用户截图实锤）。纯文本叶的确定性渲染
 * 只有 span + 真值样式，无任何可随机维度 ⇒ 整文件接管。
 *
 * fail-open：TEXT 数≠1、出现任何图形类型（VECTOR/RECTANGLE/FRAME/INSTANCE/
 * ELLIPSE/BOOLEAN 等）、颜色/字号/字重任一缺失 ⇒ 不接管（LLM 原路径）。
 *
 * @returns {{ok:true, ...truth} | {ok:false, reason:string}}
 */
export function detectTextLeaf(sec, figmaIndex) {
  const nodes = collectAnchorNodes(sec, figmaIndex);
  if (nodes.length === 0) return { ok: false, reason: 'noAnchorNode' };
  // 递归收集锚点子树（GROUP 纯包装允许；其余类型 = 图形 ⇒ fail）
  const GRAPHIC_RX = /^(VECTOR|RECTANGLE|FRAME|INSTANCE|ELLIPSE|LINE|BOOLEAN_OPERATION|COMPONENT|SLICE|STAR|POLYGON|RECT)$/i;
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
  if (graphic) return { ok: false, reason: `hasGraphic(${graphic})` };
  if (texts.length !== 1) return { ok: false, reason: `texts=${texts.length}(need 1)` };
  const ti = textRun(texts[0]);
  if (!ti) return { ok: false, reason: 'textStyleIncomplete' };
  const tb = bboxOf(texts[0]);
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
      members: sorted.map((p) => {
        // 卡外观真值：本体 `fills`/`strokes` 优先；取不到 ⇒ 子树最大非图标图形
        // （真值卡底与描边都在 VECTOR 上）⇒ 再取不到即 null（不写该属性，绝不填兜底色）。
        const app = nodeAppearanceTruth(p.node);
        let bg = app.bg;
        let border = cssBorder(app.border);
        if (!bg || !border) {
          const sub = subtreeBackground(p.node, resourceMapping);
          if (sub) {
            if (!bg) bg = sub.css;
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
export function detectTableLeaf(sec, figmaIndex, parentOf, resourceMapping) {
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
 * 卡/格「自绘底」真值：子树内**面积最大的、非 TEXT 且非已导出图标**的图形节点的
 * 外观 → `{ css, r, border }`（本单统计卡底 = VECTOR 渐变 134×56，且描边
 * `#a0c1ff` 也在该 VECTOR 上而非卡节点上 —— 故 border 必须一并回传）。
 *
 * 🔴 口径复用 `nodeAppearanceTruth`（单一来源），不在此另造 fills/strokes 解析。
 *
 * @returns {{ css:string, r:number, border:{width:number,color:string}|null }|null}
 */
function subtreeBackground(node, resourceMapping) {
  const mapping = toArray(resourceMapping);
  const isIcon = (n) => mapping.some((e) => String(e?.figmaNodeId) === String(n?.id));
  const seen = new Set();
  let best = null;
  let bestArea = 0;
  const walk = (n, d) => {
    if (!n || seen.has(n) || d > 2) return;
    seen.add(n);
    for (const c of n.children || []) {
      if (!c || typeof c.characters === 'string') continue;
      const b = bboxOf(c);
      const area = b ? b.w * b.h : 0;
      if (area > bestArea && !isIcon(c)) {
        const t = nodeAppearanceTruth(c);
        if (t.bg) {
          best = { css: t.bg, r: cornerRadiusOf(c), border: t.border };
          bestArea = area;
        }
      }
      walk(c, d + 1);
    }
  };
  walk(node, 0);
  return best;
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
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:${tr.gap}px;padding:0;">`,
    ];
    tr.members.forEach((m, i) => {
      const tSpan = `<span class="${cls}-t${i}" style="color:${m.titleColor};font-size:${m.titleFs}px;font-weight:${m.titleFw};line-height:1;white-space:nowrap;">{{ t${i} }}</span>`;
      const vSpan = `<span class="${cls}-v${i}" style="color:${m.valueColor};font-size:${m.valueFs}px;font-weight:${m.valueFw};line-height:1;white-space:nowrap;">{{ v${i} }}</span>`;
      // 卡外观真值内联（真值：`GRADIENT_LINEAR` 底 + `#a0c1ff` 描边 + 圆角）；
      // 取不到即不写该属性 —— 绝不填兜底色（会画出真值里不存在的卡底）。
      const cardAppearance = [
        m.bg ? `background:${m.bg};` : '',
        m.border ? `border:${m.border};` : '',
        m.pad ? `padding:${m.pad};` : 'padding:0;',
        m.r ? `border-radius:${m.r}px;` : '',
      ].join('');
      lines.push(
        `    <div class="${cls}-card${i}" style="display:flex;flex-direction:${tr.innerDir};align-items:center;justify-content:center;gap:${tr.innerGap}px;width:${tr.cardW}px;height:${tr.cardH}px;flex:none;box-sizing:border-box;${cardAppearance}">`,
        `      ${m.titleFirst ? tSpan : vSpan}`,
        `      ${m.titleFirst ? vSpan : tSpan}`,
        '    </div>',
      );
    });
    lines.push('  </div>', '</template>', '', '<script setup>');
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
    lines.push(
      '    </div>',
      `    <div v-for="(row, ri) in rows" :key="ri" class="${cls}-tr" style="display:flex;flex-direction:row;align-items:center;justify-content:flex-start;height:${tr.rowH}px;flex:none;${tr.rowGap ? `margin-top:${tr.rowGap}px;` : ''}">`,
    );
    tr.cols.forEach((c, i) => {
      lines.push(
        `      <div class="${cls}-td${i}" :style="{ boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, flex: '0 0 ${c.widthPct}%', padding: row.c${i}.pad || 0, background: row.c${i}.bg || undefined, border: row.c${i}.border || undefined }">`,
        `        <img v-if="row.c${i}.iconVar" :src="row.c${i}.iconVar" alt="" :style="{ width: row.c${i}.iconW + 'px', height: row.c${i}.iconH + 'px', objectFit: 'contain', flex: 'none', marginRight: row.c${i}.iconGap == null ? undefined : row.c${i}.iconGap + 'px' }" />`,
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
    // 图标 import：按 varName 去重（同一 varName 指向不同 file ⇒ 冲突，全不渲染 ——
    // 绝不猜测「取哪一个」）；varName 非法 JS 标识符同样跳过（降级不渲图标，不炸脚本）。
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
    for (const [varName, file] of iconFiles) {
      if (!iconConflicts.has(varName)) {
        lines.push(`import ${varName} from '../../resources/images/${file}'`);
      }
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
  if (tr.kind === 'text') {
    // 🔴 纯文本叶（刀 53b）：span + 真值内联 color/size/weight（scoped style 块在预览
    //   运行时不生效 ⇒ 字号必须内联，归一器经 protectFgTagInlineStyles 豁免）。
    //   **绝不渲染 img** —— 本判据的存在意义就是堵「纯文本叶被 LLM 臆造成无 :src 破图」。
    const cls = `c-${sem}-fg-text-${idSlug(tr.sectionId)}`;
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
 * @returns {{ map: Map<string, {kind:string, sectionId:string, baseId:string, vue:string}>,
 *            evaluated: number, headerHits: number, gridHits: number,
 *            skipped: Array<{id:string, reason:string}> }}
 */
export function collectFoldedGridTakeover(p = {}) {
  const out = { map: new Map(), evaluated: 0, headerHits: 0, gridHits: 0, textHits: 0, iconHits: 0, statRowHits: 0, statRowSuppressed: 0, tableHits: 0, tableSuppressed: 0, skipped: [] };
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
    // 🔴 判定顺序：网格 → 标题行 → **统计行** → 纯文本 → 纯 icon（刀 53b/53c/53d）
    //    —— 互斥域递减（cards≥2 / 1 TEXT+icon / 兄弟同构二元组 / 1 TEXT 无图形 /
    //    0 TEXT 且已导出 PNG）。统计行必须**早于** text/icon：它的成员各自含 2 个
    //    TEXT（不可能是 text 叶），但父级聚类判据更严格，先判可锁定整行归属。
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
            tablePending.push({ sec, tr: tb });
            continue;
          } else {
          const t = detectTextLeaf(sec, figmaIndex);
          if (t.ok) tr = t;
          else {
            const ic = detectIconLeaf(sec, figmaIndex, p.resourceMapping);
            if (ic.ok) tr = ic;
            else {
              out.skipped.push({ id: String(sec.id), reason: `grid:${tr.reason};header:${h.reason};statrow:${sr.reason};table:${tb.reason};text:${t.reason};icon:${ic.reason}` });
              continue;
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
    else out.gridHits += 1;
    out.map.set(String(tag), {
      kind: tr.kind,
      sectionId: tr.sectionId,
      baseId: tr.baseId,
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
    statRowTaken: out.statRowHits,
    statRowSuppressed: out.statRowSuppressed,
    tableTaken: out.tableHits,
    tableSuppressed: out.tableSuppressed,
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
