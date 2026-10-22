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

import { collectLeafSections, assignSectionComponentNames, indexFigmaNodes, fillToRgba } from './section-tree.js';
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
export const FG_TAKEOVER_CLASS_RX = /-fg-(?:header|grid|text)-/;

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
  const out = text.replace(
    /([^{};]*?)([^{};,/*]*?-fg-(?:header|grid)-[^{};]*?)\s*\{[^{}]*\}/g,
    (_whole, pre) => {
      removed += 1;
      return pre;
    },
  );
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
  const out = { map: new Map(), evaluated: 0, headerHits: 0, gridHits: 0, textHits: 0, skipped: [] };
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
  for (const sec of collectLeafSections(treeSections)) {
    if (!sec?.id) continue;
    out.evaluated += 1;
    // 🔴 判定顺序：网格 → 标题行 → 纯文本（刀 53b）—— 互斥域递减
    //    （cards≥2 / 1 TEXT+icon / 1 TEXT 无图形），顺序只影响 skipped reason 归属。
    let tr = detectGridLeaf(sec, figmaIndex);
    if (!tr.ok) {
      const h = detectHeaderRowLeaf(sec, figmaIndex, p.resourceMapping);
      if (h.ok) tr = h;
      else {
        const t = detectTextLeaf(sec, figmaIndex);
        if (t.ok) tr = t;
        else {
          out.skipped.push({ id: String(sec.id), reason: `grid:${tr.reason};header:${h.reason};text:${t.reason}` });
          continue;
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
    else out.gridHits += 1;
    out.map.set(String(tag), {
      kind: tr.kind,
      sectionId: tr.sectionId,
      baseId: tr.baseId,
      vue: renderFoldedGridLeafVue(tr, semantic),
    });
  }
  p.logger?.info?.('🛡️ 刀 53 同构段确定性接管·已评估', {
    leaves: out.evaluated,
    headerTaken: out.headerHits,
    gridTaken: out.gridHits,
    textTaken: out.textHits,
    skipped: out.skipped.slice(0, 16),
  });
  return out;
}
