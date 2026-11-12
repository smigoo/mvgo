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
// 🛡️ F1（2026-11-05 · mc-max-1793869867060-e23b0b40 实锤）：图表真值冲突排除复用
//   下方 `section-anchor-truth.js` 已 re-export 的 `sectionAnchorCandidates`（G14a 下沉，
//   同一份锚点候选口径）——**不新增第二条 import 路径**，避免第二套口径漂移。

// 🛡️ P3（2026-11-03）：接管产物**自持**面板三件套真值（底色/圆角/发光/满宽）。
//   判据单一来源 = `container-background-truth.js`（与刀 37/42 heal 共用同一组
//   构造器，禁在本文件另写 CSS 字面量副本）。为什么接管侧必须自己写：刀 53 的
//   **终裁覆写**（`file-writer.js` 以 `_fgTakeoverFiles` 快照整包替换）快照拍在 heal
//   **之前** ⇒ heal 对本类文件的修复会被整包回滚（实测 icon 0/110、header 0/219）。
//   该模块只 import `figma-effects.js`（纯函数），无循环依赖。
import { resolveSectionPanel, buildPanelInlineCss } from './container-background-truth.js';
// 🔴 R3（2026-11-02）：超界段判据的 refs 唯一来源 —— 与锚点审计（R22-d/R2）同一份
//   `collectSectionFigmaRefs`，禁止在本文件另写「children 里挑 id」的副本。
import { collectSectionFigmaRefs, sectionAnchorCandidates, sectionAnchorKey } from './section-anchor-truth.js';
import { declaredTableHeaders } from './section-type-derive.js';
// 🛡️ 刀53h：footer 段的**判据唯一来源**必须复用 vision 发言读取口径
//   （`declaredSectionType` = `sec.type || sec.header.type` 归一小写），
//   禁止在本文件自写「读 type 字段」的副本 —— 副本 ≥2 份即事故温床
//   （与 `FG_TAKEOVER_CLASS_RX` 同一纪律）。vision-facts.js 无 import（纯函数集），
//   故引入无循环依赖风险。
import { declaredSectionType, declaredTableHeaderContainerTexts, declaredTableRowArity } from './vision-facts.js';
// 🛡️ 刀33：列表 item 的**卡盒真值**回收要按「行填充色」归一比较（与 N1 真值色值门禁
//   同一口径，禁止自造颜色归一），故引入 `normalizeCssColor`（纯函数、零依赖，无环）。
import { normalizeCssColor } from './truth-color-usage-guard.js';
// 🛡️ T-CONTRACT（2026-11-05）：section 语义类型的**唯一入口**——接管判据只许读它，
//   禁止在本文件自写「读 type 字段 + 关键词」的第二套推导（与 `declaredSectionType`
//   同一纪律）。依据 docs/2026-10-31-vision形态漂移治理方案.md Phase A
//   「同一语义只在一处识别；下游只读规范结论」。`section-semantics.js` 只依赖
//   vision-facts / section-type-derive（均纯函数集），无循环依赖。
import { canonicalSectionType } from './section-semantics.js';
// 🛡️ 刀33：item 内「图条」背景四件套（size/position/repeat）**必须**复用资源挂载层
//   同一份纯函数判据（`inferBackgroundStyle`），否则 item 挂载形态与容器挂载形态
//   会分叉成两套 geometry（正是「容器画一遍、item 画另一遍」的温床）。
import { inferBackgroundStyle } from './background-size-inference.js';
// 🔀 刀 54 段内分区接管（2026-11-03 接线刀）：全 miss leaf 的段内分区判据唯一来源。
//   注意：region-partitioner.js 反向 import 本文件的 bboxOf/textRun/clusterByTolerance/KV_TOL
//   （第一阶段既有口径），构成**良性环**——两侧都只在运行时调用对方函数（函数声明
//   提升、模块初始化期零互调），ESM/jest 均安全；禁止把环改成第三模块中转（徒增间接层）。
import { partitionLeafRegions } from './region-partitioner.js';

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
export const FG_TAKEOVER_CLASS_RX = /-fg-(?:header|grid|kvgrid|text|icon|statrow|table|legend|list|footer|regions)-/;

/**
 * 🛡️ T-CONTRACT（2026-11-05）：「泛化容器」类型桶——**不构成形态主张**，
 * 故不得作为「拒绝表格接管」的理由。
 *
 * 唯一来源是 `vision-facts.js#TYPE_KEYWORDS` 的最后一项
 * `['body', ['body','content','main','主体','内容']]`：该桶的语义就是「某种内容区」，
 * 不含任何形状断言。`deriveSectionType` 对显式 `sec.type` 逐字返回（不归一到桶名），
 * 所以 `content` / `main` 会以字面值出现在这里，必须一并放行。
 * 反向约束：**不得**把 `stats|list|grid|tabs|card|header|footer|chart|…` 加进来——
 * 那些是形态语义，与表格互斥，正是本门要拦的对象。
 */
const GENERIC_SECTION_KINDS = new Set(['body', 'content', 'main']);

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
export function bboxOf(node) {
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
  // R7：只从候选单一来源取修复产物，并保持无修复锚时原有 id/sourceNodeIds 顺序逐字不变。
  const [anchorRepaired] = sectionAnchorCandidates(sec);
  const ids = [
    anchorRepaired,
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

/**
 * 🔴 R3（2026-11-02 · mc-max-1793597679970-646085b2「合作厂商弹窗」实锤）：超界段判定。
 *
 * 病灶：锚点守卫（R22-d）把统计区锚点 38:3260 修成整容器 796:3 前的**撕裂形态**下，
 * 或锚点天然偏窄时，段声明的 refs（`collectSectionFigmaRefs`）落在**锚点子树之外** ——
 * 此时 icon/header/text 三类单元素接管只看锚点子树内的事实，会输出「一个图标/一行标题」
 * **把整段内容确定性裁没**，且无任何告警（真机实锤：统计区只剩一张 53×55 图标却 flex:2.209）。
 *
 * 判据（可辩驳，类型无关、命名无关）：
 *   `collectSectionFigmaRefs(section)` 中存在**树内**、且不在任何锚点子树（含锚点自身）之内的
 *   引用 ⇒ 该 section scope-incomplete。幻影 ref 不参与（与 R22-d 同口径：幻觉 id 归
 *   `vision-anchor-validator` 单一来源管）；无锚点段不在此扩权（各检测器既有 `noAnchorNode`
 *   分支处理）。
 *
 * 纯函数、fail-open：无 refs / 无 figmaIndex / 无锚点 ⇒ false（不改变既有行为）。
 */
function isScopeIncomplete(sec, figmaIndex) {
  if (!sec || !(figmaIndex instanceof Map) || figmaIndex.size === 0) return false;
  const refs = collectSectionFigmaRefs(sec);
  if (refs.size === 0) return false;
  const anchors = collectAnchorNodes(sec, figmaIndex);
  if (anchors.length === 0) return false;
  const anchorIds = new Set(anchors.map((n) => String(n.id)));
  for (const ref of refs) {
    if (!figmaIndex.has(ref)) continue; // 幻影 ref 不参与（单一来源 = vision-anchor-validator）
    if (anchorIds.has(ref)) continue; // ref 即锚点自身（祖先判定含自身）
    let cur = figmaIndex.get(ref);
    let guard = 0;
    let inside = false;
    while (cur && guard++ < 256) {
      if (anchorIds.has(String(cur.id))) {
        inside = true;
        break;
      }
      cur = cur.parentId != null ? figmaIndex.get(String(cur.parentId)) || null : null;
    }
    if (!inside) return true;
  }
  return false;
}

/** 文本节点 → 渲染 run（颜色/字号/字重任一缺失 ⇒ null，调用方 fail-open）。 */
export function textRun(t) {
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
  // 🔴 R3：超界段（refs 落在锚点子树之外）禁单元素接管 —— 只看锚点子树必然裁没整段内容
  if (isScopeIncomplete(sec, figmaIndex)) return { ok: false, reason: 'scopeIncomplete' };
  const nodes = collectAnchorNodes(sec, figmaIndex);
  // 🔴 R8-7（2026-11-02 · dea074f9 实锤）：TEXT 计数与 detectIconLeaf / detectTextLeaf 对齐，
  //   但**按锚点来源分两态**（连锁红暴露的边界，不可一刀切递归）：
  //   · 精确锚点（sec.id / sourceNodeIds 直接命中真值树）⇒ 本叶**拥有整棵子树** ⇒ 递归计数。
  //     旧 1 层口径在此场景误判：38:3137（604×161 容器：标题 TEXT + 两个含 12 TEXT 的正文
  //     FRAME + 图标）直接子项层恰 1 TEXT ⇒ 标题行接管把整段内容裁没。
  //   · 剥后缀兜底锚点（合成 `…-tail-text` / `…-list` 叶 → 父容器）⇒ 本叶只是父容器**切片**，
  //     深层文本归其它叶（折叠列表/网格叶）⇒ 保持 1 层口径（render 用例连锁红实锤）。
  //   递归仅从本叶锚点集合起步（seen 防父子重复入队），不触碰锚点外节点 ⇒ 8bbcf027 反向断言不受影响。
  const exactAnchor = [sectionAnchorCandidates(sec)[0], sec?.id, ...toArray(sec?.sourceNodeIds), sec?.figmaNodeId, sec?.figmaNode].some(
    (raw) => raw != null && raw !== '' && Boolean(figmaIndex.get(String(raw))?.rawNode),
  );
  let texts;
  if (exactAnchor) {
    const seen = new Set();
    texts = [];
    const walk = (n) => {
      if (!n || seen.has(n) || n.visible === false) return;
      seen.add(n);
      if (typeof n.characters === 'string' && n.characters.trim().length > 0) {
        texts.push(n);
        return;
      }
      for (const c of n.children || []) walk(c);
    };
    for (const n of nodes) walk(n);
  } else {
    texts = nodes.filter(
      (n) => typeof n?.characters === 'string' && n.characters.trim().length > 0,
    );
  }
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
/**
 * 锚点是否与**兄弟**文本构成同一行复合卡（icon 在左、文本在右）。
 *
 * 🔴 2026-11-12（mc-max-1794460832686-7b016640 实锤 · 产物统计段只剩一个图标）：
 *   `detectIconLeaf` 的既有判据是「锚点子树 0 个 TEXT ⇒ 纯 icon 叶」，但 Figma 里
 *   统计卡的 label/value 常常**不是**锚点的后代，而是与锚点**平级**的兄弟 TEXT：
 *   真值 `796:3 slot-icon` 下，`38:3260`(Group：背景矩形 + 187:262 icon) 与
 *   `38:3262`「33」、`38:3263`「合作厂商」、`38:3284`「66」、`38:3285`「在线设备」
 *   同为直接子节点 ⇒ 锚点子树确实 0 TEXT ⇒ 整段被接管成**单个 `<img>`**，
 *   兄弟文本被彻底丢弃，产物肉眼只剩一个图标（用户截图实证）。
 *   下游 C1b 也救不回：「合作厂商」被 index.vue 的「战略合作厂商」子串误命中、
 *   「33/66」是纯数字不在中文标签判据内 ⇒ 门禁全绿放行。
 *
 * 判据（纯几何，零语义猜测）：同父直接子节点里存在 TEXT，同时满足
 *   ① 在锚点**右侧**（文本左缘 ≥ 锚点右缘 − 4px 容差）；
 *   ② 与锚点**同一行**（y 区间交集 ≥ min(锚点高, 文本高) × 0.5）。
 * 两者同时成立 ⇒ 该「icon 叶」实为「icon + 文本」复合卡，**拒绝接管**（fail-open
 * 交给正常 LLM/布局治愈路径建模），绝不用单图替换掉整段内容。
 *
 * 只看直接父一层：真值形态如此，且向上多跨层会把「图标旁边恰好有别的段的文本」
 * 误判成同一张卡（宁可少接管，不可误接管）。
 */
function hasSiblingRowText(anchorNode, figmaIndex) {
  if (!(figmaIndex instanceof Map)) return false;
  const ab = bboxOf(anchorNode);
  if (!ab) return false;
  const parentId = figmaIndex.get(String(anchorNode.id))?.parentId;
  if (!parentId) return false;
  const parent = figmaIndex.get(String(parentId))?.rawNode || null;
  const kids = Array.isArray(parent?.children) ? parent.children : [];
  const aRight = ab.x + ab.w;
  const aBottom = ab.y + ab.h;
  for (const k of kids) {
    if (!k || String(k.id) === String(anchorNode.id)) continue;
    if (k.type !== 'TEXT' || typeof k.characters !== 'string') continue;
    if (k.characters.trim().length === 0) continue;
    const kb = bboxOf(k);
    if (!kb) continue;
    if (kb.x < aRight - 4) continue; // ① 必须在图标右侧
    const overlap = Math.min(aBottom, kb.y + kb.h) - Math.max(ab.y, kb.y);
    if (overlap < Math.min(Math.max(ab.h, 1), Math.max(kb.h, 1)) * 0.5) continue; // ② 同一行
    return true;
  }
  return false;
}

export function detectIconLeaf(sec, figmaIndex, resourceMapping) {
  // 🔴 R3：超界段（refs 落在锚点子树之外）禁单元素接管 —— 只看锚点子树必然裁没整段内容
  if (isScopeIncomplete(sec, figmaIndex)) return { ok: false, reason: 'scopeIncomplete' };
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
  // 🔴 兄弟行文本守卫（2026-11-12）：子树 0 TEXT 但同父同行的右侧有 TEXT ⇒
  //   锚点只是复合卡里的图标位，整段接管会把 label/value 一起抹掉。
  if (nodes.some((n) => hasSiblingRowText(n, figmaIndex))) {
    return { ok: false, reason: 'siblingRowText' };
  }

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
  // 🔴 R3：超界段（refs 落在锚点子树之外）禁单元素接管 —— 只看锚点子树必然裁没整段内容
  if (isScopeIncomplete(sec, figmaIndex)) return { ok: false, reason: 'scopeIncomplete' };
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

/**
 * 🔴 P0-3（2026-11-11 · docs/2026-11-11-组件生成断层归因与交接 实锤）：table 接管的
 *   **结构签名否决**。病灶：vision `type=null` ⇒ T-CONTRACT 契约门 fail-open（:1126
 *   对 canonical 空值放行）⇒ 纯几何判据把「图表卡」判成表格 ⇒ `kind=table` 确定性接管
 *   （整文件不进 LLM chunk）⇒ 车型分布 `2:3438` 子树含 `246:30 @echarts` 52×52 +
 *   `bg-[m]` 背景层被渲染成 `<a-table>`。既有 F1 图表段否决依赖 `analysisCharts`
 *   （vision `charts[]`），type=null 时 charts[] 同样缺失 ⇒ 两道判据同时瞎。
 *
 *   本判据是**第三道独立防线**：直接扫段锚点子树的 Figma 节点**命名签名**——
 *     ① 图表库标记：`@echarts/@chart/@chartjs/@plotly/@g2/@antv/@d3`（figma-connector.js:1137
 *        技术栈标记约定，子树由运行时图表库渲染，静态 DOM 接管必然毁图）；
 *     ② 背景位图层：`bg-*`/`bg[*`（figma-connector.js:2502 命名约定，接管会剥掉背景层）。
 *   命中即拒（宁可放过，不可误接管——与 F1 同一取向），fail-open 回 LLM 生成路径。
 *
 * @param {Array<object>} anchorRawNodes 段锚点原始节点（含完整 children 子树）
 * @returns {string|null} 命中的签名（`chart:@echarts/xx` / `bgLayer:bg-[m]`），未命中 null
 */
export function memberSubtreeBlockedSignature(anchorRawNodes) {
  const CHART_MARKER_RX = /^@(echarts|chart|chartjs|plotly|g2|antv|d3)\b/i;
  const BG_LAYER_RX = /^bg([-_[]|$)/i;
  const MAX_DEPTH = 64;
  let visited = 0;
  // 先序遍历（文档序）：首个命中即返回，保证结果确定性（不依赖遍历容器实现）
  const scan = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return null;
    if (++visited > 500) return null;
    const name = String(node.name || '');
    if (CHART_MARKER_RX.test(name)) return `chart:${name}`;
    if (BG_LAYER_RX.test(name)) return `bgLayer:${name}`;
    const kids = Array.isArray(node.children) ? node.children : [];
    for (const k of kids) {
      const hit = scan(k, depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  for (const root of anchorRawNodes || []) {
    if (!root || typeof root !== 'object') continue;
    const hit = scan(root, 0);
    if (hit) return hit;
  }
  return null;
}

export function detectTableLeaf(sec, figmaIndex, parentOf, resourceMapping) {
  // 🛡️ T-CONTRACT 契约门（2026-11-05 · mc-max-1793880532372-38f97905 实锤）：
  //   vision 已给出**形态语义**且不是 table ⇒ 表格判据不得接管。
  //   为什么必须在这里：下方 `detectTableLeafByAnchors` 是**纯几何**判定，而
  //   「两张 stat-card 并排」与「2 列 5 行表格」在几何上完全同构（同高同 y、每列
  //   TEXT 数相同且逐项 y 对齐、x 严格递增）⇒ 几何永远无法区分，只能由上游契约仲裁。
  //   反面教材：本文件历史被改 49 次，每次都是给某个判据加更紧的几何约束。
  //   🔴 放行条件（三条，缺一不可）：无类型（''）/ 归一为 table / 归一为**泛化容器**
  //   （`body|content|main` —— 即 `TYPE_KEYWORDS` 里的 body 桶，见 vision-facts.js：
  //   `['body', ['body','content','main','主体','内容']]`）。泛化容器不是形态主张，
  //   把它当反对证据会误伤「内容区里确实是一张表」的正常段（`type:'content'` 夹具实锤）。
  const canonical = canonicalSectionType(sec);
  if (canonical && canonical !== 'table' && !GENERIC_SECTION_KINDS.has(canonical)) {
    return { ok: false, reason: `contractMismatch:${canonical}` };
  }
  // 🛡️ P0-3 结构签名否决（判据见 memberSubtreeBlockedSignature 注释）：契约门 fail-open
  //   （type=null）时，子树里的 @图表库标记 / bg-* 背景层是「这不是静态表格」的确定性
  //   反证，纯几何判据必须让位。放在 direct/promoted 之前——两条路径都不得越过本闸。
  const blockedSig = memberSubtreeBlockedSignature(
    collectAnchorNodes(sec, figmaIndex),
  );
  if (blockedSig) {
    return { ok: false, reason: `memberSubtreeBlocked:${blockedSig}` };
  }
  const direct = detectTableLeafByAnchors(sec, figmaIndex, parentOf, resourceMapping);
  if (direct.ok) return direct;
  // 🛡️ 形态自洽 fail-closed（e7da39ca，2026-11-02）：仅当表头来自**形态⑤**
  //   （单个 `table-header` 容器）时校验「声明表头数 == 首行非图标单元格数」。
  //   不自洽 ⇒ 契约与行列结构互相矛盾（vision 幻觉）⇒ 契约不可信，**不用于 LCA
  //   回查**，并显式记 `contractShapeMismatch`（不静默落回 notTableColumn，避免
  //   与「契约缺失」混淆）。前四形态 `declaredTableHeaderContainerTexts` 返 null
  //   ⇒ 本闸门整体跳过，既有行为**逐字不变**。
  const containerHeaders = declaredTableHeaderContainerTexts(sec);
  if (containerHeaders) {
    const arity = declaredTableRowArity(sec);
    if (arity != null && arity !== containerHeaders.length) {
      return { ok: false, reason: 'contractShapeMismatch' };
    }
  }
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

/**
 * 🛡️ 刀55（2026-11-05 · c-device-monitor-8f4dfed9 / 89c25985 双实锤）：节点是否命中
 * 「图标用途」的**已下载**资源条目——`isIcon` 排除判据（`subtreeBackground` 内）的
 * **正向**消费，同一判据单一来源（mapping 按 figmaNodeId 命中 ∧ 非背景用途）。
 * 额外要求 `assignedVarName/semanticVarName` 与 `resourceFile`（可写 import、可落文件），
 * 下载失败/missing 不算命中（绝不造资源）。
 * @returns {object|null} 命中的 mapping 条目
 */
function mappingIconHit(node, mapping) {
  if (!node?.id || !Array.isArray(mapping) || mapping.length === 0) return null;
  const hit = mapping.find(
    (e) =>
      String(e?.figmaNodeId) === String(node?.id) &&
      !isBackgroundResource(node, mapping) &&
      String(e?.resourceFile || '') &&
      String(e?.downloadStatus || '') !== 'failed' &&
      String(e?.downloadStatus || '') !== 'missing',
  );
  if (!hit) return null;
  if (!String(hit?.assignedVarName || hit?.semanticVarName || '')) return null;
  return hit;
}

/**
 * 🛡️ 刀55：卡子树内**前导 icon**真值。
 *
 * 判据（可辩驳、零猜测）：
 *   · 候选 = 深度 ≤2（与 `subtreeBackground.walk` 同深度）内 `mappingIconHit` 命中的
 *     非文本节点；
 *   · 必须在首文本左侧（`b.x < firstTextX`）——本通道的语义就是「被 pad 吸收的
 *     前导图标区」（:1416 pad 病灶），首文本右侧的装饰图不属于本通道；
 *   · 选择 = x 最小（最左）；平票面积最大；再平票 id 字典序（确定性，无第三种平票出口）。
 *
 * @returns {{varName:string, file:string, dx:number, w:number, h:number, gap:number}|null}
 *   `dx` = icon 左缘距卡左缘；`gap` = icon 右缘→首文本。无候选 ⇒ null（fail-open，
 *   调用方 pad/gap 逐字不变）。
 */
function subtreeIconTruth(node, resourceMapping, firstTextX) {
  const mapping = Array.isArray(resourceMapping) ? resourceMapping : [];
  if (!node || mapping.length === 0 || !Number.isFinite(Number(firstTextX))) return null;
  const cands = [];
  const seen = new Set();
  const walk = (n, d) => {
    if (!n || seen.has(n) || d > 2) return;
    seen.add(n);
    for (const c of n.children || []) {
      if (!c || typeof c.characters === 'string') continue;
      const b = bboxOf(c);
      if (b && b.x < Number(firstTextX) && mappingIconHit(c, mapping)) {
        cands.push({ node: c, b });
      }
      walk(c, d + 1);
    }
  };
  walk(node, 0);
  if (!cands.length) return null;
  cands.sort(
    (a, b) =>
      a.b.x - b.b.x ||
      b.b.w * b.b.h - a.b.w * a.b.h ||
      String(a.node.id).localeCompare(String(b.node.id)),
  );
  const pick = cands[0];
  const hit = mappingIconHit(pick.node, mapping);
  if (!hit) return null;
  const varName = String(hit.assignedVarName || hit.semanticVarName);
  const file = String(hit.resourceFile).split('/').pop().split('\\').pop();
  const cardBox = bboxOf(node);
  if (!cardBox) return null;
  return {
    varName,
    file,
    dx: Math.max(0, Math.round(pick.b.x - cardBox.x)),
    w: Math.max(0, Math.round(pick.b.w)),
    h: Math.max(0, Math.round(pick.b.h)),
    gap: Math.max(0, Math.round(Number(firstTextX) - (pick.b.x + pick.b.w))),
  };
}

/** 卡原始节点 → 内联真值（底/圆角/文本 runs/卡内 pad+gap/前导 icon）。任一文本不可解析 ⇒ null。 */
/** 卡内文本列「x 对齐」容差（px）：≥2 run 起点 x 差在此范围内才可能是同一文本列 */
const TEXT_COL_X_TOL = 2;

/**
 * 卡原始节点 → 内联真值（底/圆角/文本 runs/卡内 pad+gap/前导 icon/文本列方向）。
 * 任一文本不可解析 ⇒ null。
 */
export function cardTruth(node, resourceMapping) {
  const box = bboxOf(node);
  if (!box) return null;
  let r = node?.cornerRadius;
  if (r == null && Array.isArray(node?.rectangleCornerRadii)) {
    r = Math.max(...node.rectangleCornerRadii);
  }
  // 🔴 RC2 治本（2026-11-05 · mc-max-1793873426434-f9cae6bf 实锤 12 卡全丢）：
  //   卡底原先**只看本体** `firstSolidFillRgba` ⇒ Figma GROUP 卡（`fills:[]`，真实填充在
  //   子 `bg` GROUP 的 GRADIENT VECTOR 上）**双重不命中**（GROUP 无 fills + 唯一 SOLID
  //   判据不认渐变）⇒ `cardTruthMissing:2:8438` ⇒ 整段 12 张设备卡零渲染。
  //   修法与 `detectStatRowLeaf` **同构**（`nodeAppearanceTruth` → `subtreeBackground`
  //   同一份判据），不是新造口径：本体填充（SOLID / 渐变）优先 ⇒ 缺失回退子树最大底候选。
  //   图片与 CSS **互斥**（`subtreeBackground` 只返回其一）：图片项走导入变量 + 四件套，
  //   CSS 项走 `background` 内联，不得同时写（近似底覆盖真图 = 2ec8acc7 同型错误）。
  // 🔴 R2.5（2026-11-05 · 矛盾/重复审查 §2）：本体填充**含渐变**优先 —— 与
  //   `detectStatRowLeaf:977` 的 `nodeAppearanceTruth(p.node)` 首判**完全同构**。
  //   原先只认 SOLID ⇒ 本体自带 `GRADIENT_LINEAR` 且子树无底候选的卡整张 fail-open。
  //   为何仍保留 `firstSolidFillRgba` 首判：**稳定产物色值格式**（SOLID 走 rgba，
  //   与既有产物逐字一致）；该分支只在无 SOLID 时进入 ⇒ 新增只可能是渐变，
  //   `fillsToCss` 口径（hex / `linear-gradient`）与子树 CSS 通道本就同格式，零格式回归。
  let bg = firstSolidFillRgba(node);
  let bgImage = null;
  let subR = 0;
  if (!bg) {
    const own = nodeAppearanceTruth(node);
    if (own?.bg) bg = own.bg;
  }
  if (!bg) {
    const sub = subtreeBackground(node, resourceMapping);
    if (sub) {
      if (sub.image?.file) {
        bgImage = toBgChannel(sub.image.hit, 'subtree');
        // 有图无变量名 ⇒ 无法写 import（绝不造命名空间）⇒ 该卡 fail-open
        if (!bgImage) return null;
      } else if (sub.css) {
        bg = sub.css;
      }
      // 导出图只含填充层：本体无圆角真值时继承候选圆角（GROUP 卡的唯一来源）
      if (Number.isFinite(sub.r) && sub.r > 0) subR = Math.round(sub.r);
    }
  }
  if (!bg && !bgImage) return null; // 卡底色是本刀核心交付之一，缺 ⇒ fail-open
  const texts = [];
  (function walk(n, d) {
    if (!n || d > 3) return;
    for (const c of n.children || []) {
      if (typeof c?.characters === 'string' && c.characters.trim()) texts.push(c);
      walk(c, d + 1);
    }
  })(node, 0);
  if (!texts.length) return null;
  // 🛡️ 刀60（2026-11-05 · c-device-0ddd1708 / 43:4892 实锤）：**同行成员 y-then-x 拆序**。
  //   病灶：卡内文本排序纯 `y差||x差` 无容差 —— 大字号数值（fs24,h≈29）与小字号
  //   label（fs14,h≈16）垂直居中对齐时 bbox y 必有差（居中基线差）⇒ 数值被排到
  //   label 前 ⇒ runs 语序颠倒（「8总设备」）+ `pad=首成员x−卡左缘` 取到数值 x
  //   （实测 pad:86，卡宽 134 内容起点 64% ⇒ 视觉整体靠右）+ gap 失真，一因三症。
  //   判据：垂直中心差 ≤ 较小盒高一半 ⇒ 同行，按 x 序（x 平局回退 y 序，保护
  //   左对齐堆叠）；跨行（中心差超容差）仍按 y 序 —— 多行卡（title 上 value 下，
  //   中心差 > 盒高半）不误伤。文本命名无关：只认几何，不认内容。
  //   单一口径：比较器只此一份（rowOrderFixed 观测与实际排序共用，禁复制第二份）。
  const __cardBoxCache = new Map();
  const cardBoxOf = (t) => {
    if (!__cardBoxCache.has(t)) __cardBoxCache.set(t, bboxOf(t));
    return __cardBoxCache.get(t);
  };
  const cardTextCmp = (a, b) => {
    const ab = cardBoxOf(a), bb = cardBoxOf(b);
    if (!ab || !bb) return 0;
    const rowTol = Math.min(ab.h, bb.h) / 2;
    const sameRow = Math.abs(ab.y + ab.h / 2 - (bb.y + bb.h / 2)) <= rowTol;
    if (sameRow) return ab.x - bb.x || ab.y - bb.y;
    return ab.y - bb.y || ab.x - bb.x;
  };
  const rowOrderFixed = (() => {
    if (texts.length < 2) return false;
    const before = texts.map((t) => String(t.id));
    const after = [...texts].sort(cardTextCmp).map((t) => String(t.id));
    return before.some((v, i) => v !== after[i]);
  })();
  texts.sort(cardTextCmp);
  const runs = [];
  for (const t of texts) {
    const ti = textRun(t);
    if (!ti) return null;
    runs.push(ti);
  }
  const tb = runs.map((x) => x.box);
  let pad = Math.max(0, Math.round((tb[0]?.x ?? box.x) - box.x));
  let gap = 0;
  if (tb.length > 1) {
    const gs = tb.slice(1).map((b, i) => Math.round(b.x - (tb[i].x + tb[i].w)));
    gap = Math.max(0, Math.round(gs.reduce((s, g) => s + g, 0) / gs.length));
  }
  // 🧱 2026-11-08（mc-1794143134686 实锤）：卡内文本列方向 —— 从 runs 几何确定性判定。
  //   病灶：模板固定 `display:flex`（默认 row）⇒ icon + 「名称」+「数值」全横排，
  //   实测卡片 117 宽内名称 x=39→75、数值 x=81→138 ⇒ 右边界 138 超出卡宽被裁 21px。
  //   真值：`摄像机` rel=(39,13) 36×18 与 `(2/484)` rel=(39,35) 55×21 —— **x 对齐、y 递增**（竖排），
  //   垂直间距 35-(13+18)=4px（与 planner itemSkeleton.gapPx=4 同源同值）。
  //   判据（几何、零命名）：≥2 run 且「x 起点差 ≤ 2px 且 y 严格递增」⇒ column，否则 row。
  //   注：gap 只在 column 时有意义（垂直间距），row 时保持原水平间距计算。
  let textDir = 'row';
  let stackGap = null;
  if (tb.length >= 2) {
    const xAligned = tb.every((b) => Math.abs(b.x - tb[0].x) <= TEXT_COL_X_TOL);
    const yAsc = tb.every((b, i) => i === 0 || b.y > tb[i - 1].y);
    if (xAligned && yAsc) {
      textDir = 'column';
      const vg = tb.slice(1).map((b, i) => Math.round(b.y - (tb[i].y + tb[i].h)));
      stackGap = Math.max(0, Math.round(vg.reduce((s, g) => s + g, 0) / vg.length));
    }
  }
  // 🛡️ 刀55（2026-11-05 · c-device-monitor-8f4dfed9 / 89c25985 双实锤）：**卡内 icon 资源通道**。
  //   病灶：本函数子树只收 TEXT 节点（上方 walk），icon 节点不可见 ⇒ 其几何足迹被
  //   `pad = 首文本x − 卡左缘` 整体吸收（实测 8f4dfed9 两状态卡 pad:111/122 恰为 icon
  //   区宽度）——位置在、图不在，14 个已下载 icon 资源产物零引用。
  //   治本：`subtreeIconTruth` 取最左前导 icon（判据见其头注），pad 改写为 icon 左缘
  //   （dx）、gap 改写为 icon→首文本真值间距，渲染层补 `<img>`（RC3 变量池同款）。
  //   无命中 ⇒ icon=null 且 pad/gap **逐字不变**（阴性零回归是结构保证）。
  const iconTruth = subtreeIconTruth(node, resourceMapping, tb[0]?.x ?? null);
  let icon = null;
  if (iconTruth) {
    icon = { varName: iconTruth.varName, file: iconTruth.file, w: iconTruth.w, h: iconTruth.h };
    pad = iconTruth.dx;
    gap = iconTruth.gap;
  }
  return {
    bg,
    bgImage,
    r: Number.isFinite(r) ? Math.max(0, Math.round(r)) : subR,
    pad,
    gap,
    icon,
    // 🛡️ 刀60 观测出参：本卡同行容差判据是否改变了文本序（0 也打，真机计数行用）
    rowOrderFixed,
    // 🧱 卡内文本列方向（column = icon 左 + 名称上/数值下；row = 单行横排）
    textDir,
    ...(stackGap !== null ? { stackGap } : {}),
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
 * 资源映射条目 → 「背景图通道」`{varName, file, style}`（**唯一来源**）。
 *
 * 🔴 变量名只取 `assignedVarName` / `semanticVarName`（取不到 ⇒ null，绝不自造命名空间——
 *    否则资源挂载层 `bgBindingOwnership` 会判 `other` 而 fail-closed + 诊断噪声）。
 * 🔴 四件套走 `inferBackgroundStyle`（与 list item / statrow 卡底 / footer **同一份**纯函数判据）。
 *
 * 消费方：`detectListLeaf#toItemBg`（item 底图）、`cardTruth`（网格卡底截图通道）、
 *        `resolveFooterBackground`（footer 段基名反查后的通道构造）。
 * 三者必须共用本函数 —— 见 `detectGridLeaf` 的 RC2 注记（同一份判据被多条通道消费）。
 *
 * 🔴 R2.6（2026-11-05 · 矛盾/重复审查 §5.3）：`file` 基名来源加回落链
 *    `resourceFile → file → src` —— footer 的基名反查按这三字段匹配，命中的条目未必带
 *   `resourceFile`（否则原 footer 实现在此拿到的会是 `'undefined'` 字符串）。
 *   分隔符同时切 `/` 与 `\\`（与 `baseNameOf` 同口径）。既有 list/grid 路径的条目由
 *   `backgroundImageOf` 保证 `resourceFile` 非空 ⇒ 回落链与分隔符扩展均为**零行为变化**。
 */
function toBgChannel(hit, source) {
  const varName = String(hit?.assignedVarName || hit?.semanticVarName || '');
  if (!varName) return null;
  return {
    varName,
    file: String(hit?.resourceFile || hit?.file || hit?.src || '').split('/').pop().split('\\').pop(),
    style: inferBackgroundStyle(hit),
    source,
  };
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
 * @returns {{image:{file:string, hit:object}, css:null, r:number, border:object|null}
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
          // 🔴 命中条目随通道回传：调用方需要 `assignedVarName` 才能写 import
          //    （按文件名反查会歧义 —— 同一 PNG 可由 12 张卡共享，见 RC2 实锤）
          hit: imgRes,
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
      image: { file: imgBest.file, hit: imgBest.hit },
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
 *
 * @param {object} sec plan 叶子
 * @param {Map} figmaIndex
 * @param {Array} [resourceMapping] effectiveMapping —— `cardTruth` 卡底回退
 *   （`subtreeBackground` / `toBgChannel`）用；**可选**（缺省 ⇒ 只走本体 SOLID 与子树
 *   CSS 候选，图片通道不成立；旧两参调用零回归）。调用方必须传，否则 GROUP 卡的
 *   截图底无法写 import（见 `cardTruth` RC2 注记）。
 */
export function detectGridLeaf(sec, figmaIndex, resourceMapping) {
  const contract = buildGridContract(sec, { figmaIndex });
  if (!contract) return { ok: false, reason: 'noGridContract' };
  const cards = resolveCardNodes(sec, contract, figmaIndex);
  if (!cards) return { ok: false, reason: 'cardNodesNotFullyResolvable' };
  const items = [];
  for (const n of cards.nodes) {
    const t = cardTruth(n, resourceMapping);
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
export const KV_TOL = 2

/** 值 → 簇（±tol 视为同一锚点）。返回 `[{anchor, members:[原索引]}]`，按 anchor 升序。 */
export function clusterByTolerance(values, tol = KV_TOL) {
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

  // 🔀 刀 54（2026-11-03）：行列/列事实/行事实/贴边形态/单元序的**全部推导**
  //    原样提取到 `buildKvGridFacts` 共用段 —— 段内分区接管的 kv 区走**同一份**
  //    严格口径（右对齐/等距/贴边校验一个不少），禁第二套 kv 事实副本。
  const facts = buildKvGridFacts(resolved, cols, anchorBox)
  if (!facts.ok) return facts

  return {
    ok: true,
    kind: 'kvgrid',
    sectionId: String(sec.id ?? ''),
    baseId: String(sec.id ?? ''),
    ...facts,
  }
}

/**
 * 🔀 刀 54（2026-11-03）：kv 网格事实推导**共用段** —— 自 `detectKvGridLeaf` 尾段
 * 原样提取（行为逐字不变，既有 kvgrid spec 锁定）。两个消费者：
 *   ① `detectKvGridLeaf`（originBox = 段锚 bbox，原路径）；
 *   ② `detectRegionCompositeLeaf` 的 kv 区（originBox = 区外框 bbox —— kv 区以
 *      绝对定位落在 `region.box` 上，贴边事实相对**区外框**成立，与原口径同构）。
 *
 * @param {Array} resolved `[{label:textRun, value:textRun, labelLh, valueLh}]`（行优先）
 * @param {number} cols 列数（对数/行）
 * @param {{x,y,w,h}} originBox 贴边判定的参照框（原=段锚；分区=区外框）
 * @returns {{ok:true, cols,rows,rowGap,colGap,justify,labelGap,columns,cells} | {ok:false, reason}}
 */
function buildKvGridFacts(resolved, cols, originBox) {
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
  const flushLeft = Math.abs(firstLeft - originBox.x) <= KV_TOL
  const flushRight = Math.abs(originBox.x + originBox.w - lastRight) <= KV_TOL
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
 * 刀 54（2026-11-03）：段内分区接管（接线刀）。
 *
 * ## 病灶
 * 弹窗家族（36:1693 设备详情 / 38:3134 合作厂商 / 跨 32 目录 slot-icon 家族）：
 * `<anchor> = bg RECTANGLE + header VECTOR + slot-icon GROUP（全部内容）`，
 * 复合段（kv 网格+标题+描述混居）对「整段二选一」的 detect* 家族全部 fail-closed
 * ⇒ 整段交 LLM ⇒ 布局发挥（4ee12198 列对齐参差、b59e9d88 臆造深蓝块）。
 *
 * ## 判据与装配
 * 第一阶段 `region-partitioner.js#partitionLeafRegions`（`8e548cf`，真值重放
 * 36:1693 全归区）已把内容子树分成互斥子区；本刀做装配：
 *   - kv 区 → 与 `detectKvGridLeaf` **同一份**事实口径（`buildKvGridFacts`：
 *     右对齐/等距/贴边校验一个不少；originBox=区外框），判据不过 ⇒ 整段 fail-open；
 *   - text 区 → 逐成员绝对定位（box 真值；`region.box` 仅为外框——text members
 *     分散在 kv 区上下，**不可**按 region 顺序块装）。
 * 完整性由分区器 `partition:unaccounted` 守卫保证（每个文本恰归一区），故本
 * kind 天然满足 R6 对账（`declaredUnconsumedCount` 对非 header/icon kind 恒 0）。
 *
 * ## 分发位置
 * 检测链**最末位**（footer 之后）：只救十类全 fail 的叶，结构上不可能抢走
 * 既有命中（与 legend/kvgrid/footer 同一「位置保证」论证，宁漏勿错）。
 * ════════════════════════════════════════════════════════════════════════════ */

/** kv 区行带重聚容差（与分区器 BAND_TOL 同口径；行内精聚仍走 KV_TOL=2）。 */
const REGION_BAND_TOL = 8;

/**
 * 段内分区接管判据（复合 leaf → regions 复合真值）。
 * @param {object} sec section 树节点（需 sec.id）
 * @param {Map} figmaIndex indexFigmaNodes 产物（entry.rawNode 形状，同 detect* 家族）
 * @returns {{ok:true, kind:'regions', sectionId, baseId, height, kv, textRuns, regionCount}
 *          | {ok:false, reason:string}}
 */
export function detectRegionCompositeLeaf(sec, figmaIndex) {
  const part = partitionLeafRegions(sec, figmaIndex);
  if (!part.ok) return part;
  const entry = figmaIndex && typeof figmaIndex.get === 'function'
    ? figmaIndex.get(sectionAnchorKey(sec))
    : null;
  // R7：与 partitionLeafRegions 同走 sectionAnchorKey，禁止一个读修复锚、另一个仍读旧 id。
  // 只取 h（分区器已把成员坐标归一到段锚系；平移不改高度，无平移误差风险）
  const anchorBox = bboxOf(entry?.rawNode);
  if (!anchorBox) return { ok: false, reason: 'partition:anchorBoxMissing' };

  // —— kv 区：行带显式重聚（不靠 flatMap 隐式顺序）+ 严格事实口径 ——
  const kvRegion = part.regions.find((r) => r.kind === 'kvgrid');
  if (!kvRegion) return { ok: false, reason: 'partition:noKvRegion' };
  const kvBands = clusterByTolerance(kvRegion.members.map((m) => Math.round(m.box.y)), REGION_BAND_TOL);
  const counts = kvBands.map((b) => b.members.length);
  if (!counts.every((c) => c === counts[0])) return { ok: false, reason: 'partition:kvRowsRagged' };
  const perRow = counts[0];
  if (perRow < 4 || perRow % 2 !== 0) return { ok: false, reason: `partition:kvPerRow(${perRow})` };
  const cols = perRow / 2;
  if (cols < 2) return { ok: false, reason: `partition:kvCols(${cols})` };
  const resolved = [];
  for (const b of kvBands) {
    const line = b.members.map((i) => kvRegion.members[i]).sort((a, b2) => a.box.x - b2.box.x);
    for (let k = 0; k + 1 < line.length; k += 2) {
      const l = line[k];
      const v = line[k + 1];
      if (l.box.x + l.box.w > v.box.x + KV_TOL) return { ok: false, reason: 'partition:kvPairOrder' };
      if (!l.run || !v.run) return { ok: false, reason: 'partition:kvRunMissing' };
      // 🔴 分区器只归一 `member.box`；`member.run.box` 仍是画布绝对坐标（第一阶段
      //    落库口径，不回改）。几何真值必须取 member.box（同一 bboxOf 产物、已归一），
      //    否则 buildKvGridFacts 的贴边判定拿绝对坐标比段内系区外框 ⇒ 永不贴边
      //    （36:1693 实测 kvColGapUnstable 假阴性）。
      resolved.push({ label: { ...l.run, box: l.box }, value: { ...v.run, box: v.box }, labelLh: l.run.lh, valueLh: v.run.lh });
    }
  }
  const facts = buildKvGridFacts(resolved, cols, kvRegion.box);
  if (!facts.ok) return { ok: false, reason: `partition:${facts.reason}` };

  // —— text 区：逐成员绝对定位真值（单行 nowrap；h>1.5×行高 ⇒ 多行给宽换行，
  //     与 detectTextLeaf 的 multiline 形态同构）——
  const textRegion = part.regions.find((r) => r.kind === 'text');
  const textRuns = [];
  if (textRegion) {
    for (const m of textRegion.members) {
      if (!m.run || !m.run.box) return { ok: false, reason: 'partition:textRunMissing' };
      const lh = m.run.lh ?? Math.max(1, Math.round(m.box.h));
      const multiline = m.box.h > lh * 1.5 + 1;
      textRuns.push({
        text: m.run.text,
        color: m.run.color,
        fs: m.run.fs,
        fw: m.run.fw,
        x: Math.round(m.box.x),
        y: Math.round(m.box.y),
        w: Math.round(m.box.w),
        lh: Math.round(lh),
        multiline,
      });
    }
  }

  return {
    ok: true,
    kind: 'regions',
    sectionId: String(sec.id ?? ''),
    baseId: String(sec.id ?? ''),
    // 容器高=段锚真值（内容全绝对定位不占流 ⇒ 无高度则容器塌 0）
    height: Math.round(anchorBox.h),
    kv: {
      x: Math.round(kvRegion.box.x),
      y: Math.round(kvRegion.box.y),
      w: Math.round(kvRegion.box.w),
      cols: facts.cols,
      rows: facts.rows,
      rowGap: facts.rowGap,
      colGap: facts.colGap,
      justify: facts.justify,
      labelGap: facts.labelGap,
      columns: facts.columns,
      cells: facts.cells,
    },
    textRuns,
    regionCount: part.regions.length,
  };
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
import { resolveListMemberDirection } from './section-list-direction.js';

/**
 * 🔴 A 段级附属文本（2026-11-12 · mc-max-1794458950336-47b996c3 实锤）
 *
 * ## 病灶
 * 同构列表接管（刀 20b）只物化 `items`（v-for），而**直属于段、不在任何 item 子树内**的
 * TEXT 无处安放 —— 真机 `565:3 slot-con` 段尾 `共 6 个节点` / `接入设备 10810` 两条真值
 * 文本在产物里**一个字都没有**（`C1b FAIL=1 checked=110`），且修复轮因「承载段结构里没有
 * 这两个位置」两轮改不动（`0/2 → 1/2 → 2/2`，FAIL 内容逐字相同）。
 *
 * ## 判据（结构 + 几何，全部可辩驳；零语义猜测、零兜底样式）
 *   ① 段锚节点可取（`sec.id` / `sourceNodeIds` 首个 ∈ figmaIndex）；
 *   ② **每个 item 锚必须可取** —— 任一不可取 ⇒ 归属不可证 ⇒ 整体 fail-open
 *      （否则会把该 item 子树里的文本误判成段级 ⇒ 同一串文本渲染两次）；
 *   ③ 段子树内非空 TEXT、且节点 id ∉ 任一 item 子树 TEXT 集 ⇒ 段级候选；
 *   ④ 位置由**几何**裁决（不按名称/顺序猜）：
 *      候选盒中心 y < 全部 item 盒最小 y ⇒ `head`；
 *      候选盒中心 y > 全部 item 盒最大底 ⇒ `tail`；
 *      其余（夹在 items 之间）⇒ `undecidable` ⇒ 整体 fail-open（位置不可证，宁可交 LLM）。
 *
 * ## 为什么 `undecidable` 要整体放弃而不是「放尾部」
 * 夹在 items 中间的文本按尾部渲染会**打乱纵向顺序**（视觉错位），与「丢文本」同属交付坏结构；
 * 判据不可证时 fail-open 是既有纪律（与 detectTextLeaf 的 `textRunsNotLinear` 同一裁决方式）。
 *
 * @param {object} sec plan 叶子
 * @param {Array} itemAnchors item 锚 id 列表（含内容轨 `body.items[0]` 的锚）
 * @param {Map} figmaIndex
 * @returns {{ok:true, head:Array, tail:Array, undecidable:Array} | {ok:false, reason:string, ...}}
 */
export function collectSatelliteTexts(sec, itemAnchors, figmaIndex, direction) {
  // 🔴 主轴向：`head`/`tail` 沿**列表自身主轴**裁决（column ⇒ y，row ⇒ x）。
  //   若恒定按 y 判，横向列表的「左侧标题」会被误判成 undecidable 而整体 fail-open。
  const dir = String(direction || 'column') === 'row' ? 'row' : 'column';
  const axisStart = (b) => (dir === 'row' ? b.x : b.y);
  const axisEnd = (b) => (dir === 'row' ? b.x + b.w : b.y + b.h);
  const axisCenter = (b) => (dir === 'row' ? b.x + b.w / 2 : b.y + b.h / 2);
  const fail = (reason, extra) => ({
    ok: false,
    reason,
    head: [],
    tail: [],
    undecidable: [],
    ...(extra || {}),
  });
  if (!figmaIndex || typeof figmaIndex.get !== 'function') return fail('noFigmaIndex');
  const secNode =
    figmaIndex.get(String(sec?.id ?? ''))?.rawNode ||
    toArray(sec?.sourceNodeIds)
      .map((s) => figmaIndex.get(String(s))?.rawNode)
      .find(Boolean) ||
    null;
  if (!secNode) return fail('noSectionNode');
  const anchors = toArray(itemAnchors).filter((a) => a != null && a !== '');
  if (anchors.length === 0) return fail('noItemAnchor');
  const itemTextIds = new Set();
  const itemBoxes = [];
  for (const anchor of anchors) {
    const raw = figmaIndex.get(String(anchor))?.rawNode || null;
    if (!raw) return fail('itemAnchorMissing');
    const box = bboxOf(raw);
    if (!box) return fail('itemBoxMissing');
    itemBoxes.push(box);
    for (const t of collectTexts(raw)) itemTextIds.add(String(t.id));
  }
  const cands = [];
  const seen = new Set();
  const walk = (n) => {
    if (!n || seen.has(n)) return;
    seen.add(n);
    if (n.visible === false) return;
    if (typeof n.characters === 'string' && n.characters.trim().length > 0) {
      if (!itemTextIds.has(String(n.id))) {
        const box = bboxOf(n);
        if (box) cands.push({ node: n, box });
      }
      return;
    }
    for (const c of Array.isArray(n.children) ? n.children : []) walk(c);
  };
  walk(secNode);
  if (cands.length === 0) return { ok: true, head: [], tail: [], undecidable: [] };
  const minStart = Math.min(...itemBoxes.map(axisStart));
  const maxEnd = Math.max(...itemBoxes.map(axisEnd));
  const toEntry = ({ node, box }) => {
    const st = node?.style && typeof node.style === 'object' ? node.style : {};
    const fsNum = Number(st.fontSize);
    const lhNum = Number(st.lineHeightPx);
    return {
      t: String(node.characters).replace(/\s+/g, ' ').trim(),
      c: firstSolidFillRgba(node),
      fs: Number.isFinite(fsNum) && fsNum > 0 ? fsNum : null,
      fw: st.fontWeight == null ? null : String(st.fontWeight),
      lh: Number.isFinite(lhNum) && lhNum > 0 ? Math.round(lhNum) : null,
      box,
      nodeId: String(node.id ?? ''),
      gap: null,
    };
  };
  const byAxis = (a, b) => axisStart(a.box) - axisStart(b.box) || axisCenter(a.box) - axisCenter(b.box);
  const head = [];
  const tail = [];
  const undecidable = [];
  for (const c of cands) {
    const ac = axisCenter(c.box);
    if (ac < minStart) head.push(toEntry(c));
    else if (ac > maxEnd) tail.push(toEntry(c));
    else undecidable.push(toEntry(c));
  }
  if (undecidable.length > 0) {
    return fail(`undecidable:${undecidable.length}`, { undecidable });
  }
  head.sort(byAxis);
  tail.sort(byAxis);
  // 🔴 真实间距：`gap` = 本条目起点 − 上一个已知元素的终点（主轴方向）。
  //   head 链起点取**段盒起点**（= 段首内距），tail 链起点取**item 链终点**。
  //   纯几何派生，缺盒即 null（不猜，不填兜底间距）。
  const secBox = bboxOf(secNode);
  let prevEnd = secBox ? axisStart(secBox) : null;
  for (const e of head) {
    e.gap = prevEnd == null ? null : Math.max(0, Math.round(axisStart(e.box) - prevEnd));
    prevEnd = axisEnd(e.box);
  }
  prevEnd = maxEnd;
  for (const e of tail) {
    e.gap = Math.max(0, Math.round(axisStart(e.box) - prevEnd));
    prevEnd = axisEnd(e.box);
  }
  return { ok: true, head, tail, undecidable: [] };
}

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
  // 🔴 G11b：mapping 文本归位计数（调用方聚合进计数行，0 也打）
  let iconTextMatched = 0;
  let iconTextUnmatched = 0;
  // 🔴 G11b（2026-11-04 · a41a470f 实锤）：icon 尺寸单一来源 = mapping `figmaBox`。
  //   旧代码读 `m.width/m.height`——mapping 条目顶层**无** width/height（只有
  //   figmaBox/visualMeta）⇒ Number(undefined)=NaN ⇒ w/h **恒 null**（真 bug）。
  const mappingIconSize = (m) => {
    const fb = m?.figmaBox || null;
    const w = Number(fb?.width);
    const h = Number(fb?.height);
    return {
      w: Number.isFinite(w) && w > 0 ? Math.round(w) : null,
      h: Number.isFinite(h) && h > 0 ? Math.round(h) : null,
    };
  };
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
          ...mappingIconSize(m),
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
        ...mappingIconSize(hits[0].m),
      };
      return String(hits[0].node.id);
    }
    // 🔴 G11b 第三路（2026-11-04 · a41a470f 实锤）：**mapping 文本唯一匹配**。
    //   病灶：item 锚=分组 Group（38:3137），厂商行子树内 icon 未被 vision 建
    //   icon 节点 ⇒ 前两路全 miss ⇒ `icon-战略厂商`(16×16 已下载)闲置。
    //   判据（零语义猜测）：mapping name 去 `icon-` 前缀、去尾部 `-数字` 得语义名，
    //   与 item 任一 text **互含**（双向 includes），且**全 mapping 仅一命中**；
    //   多命中/零命中不猜（留 null）。计数由调用方聚合（iconFromMapping）。
    const texts0 = (norm[i]?.texts || []).map((t) => String(t?.t || '').trim()).filter(Boolean);
    if (texts0.length > 0) {
      const semMatches = mapping.filter((e) => {
        if (!e?.resourceFile || e?.downloadStatus === 'failed') return false;
        const sem = String(e?.name || '')
          .replace(/^icon-/, '')
          .replace(/-?\d+$/, '')
          .trim();
        if (!sem) return false;
        return texts0.some((t) => t.includes(sem) || sem.includes(t));
      });
      if (semMatches.length === 1) {
        norm[i].icon = {
          file: String(semMatches[0].resourceFile).split('/').pop(),
          ...mappingIconSize(semMatches[0]),
        };
        iconTextMatched += 1;
        return String(semMatches[0].figmaNodeId ?? '');
      }
      iconTextUnmatched += 1;
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
  /** 两盒是否共享至少一条边（±1px 仅吸收舍入，非阈值判据）。 */
  const sharesEdge = (outer, inner) => {
    const near = (a, b) => Math.abs(a - b) <= 1;
    return (
      near(inner.x, outer.x) ||
      near(inner.y, outer.y) ||
      near(inner.x + inner.w, outer.x + outer.w) ||
      near(inner.y + inner.h, outer.y + outer.h)
    );
  };
  /**
   * 🔴 步④（2026-11-03）：**按几何选可见底** —— 颜色匹配在实践中是「选错了轴」。
   *
   * 病灶（真机 `1t7Dmmpsl5i0PC8BJt2QLf_2-7952` 直读）：卡帧自身 `fills=[]`，卡底渐变在深层
   * `136:126"bg">2:8058 GROUP>2:8059 RECTANGLE`（两段 `GRADIENT_LINEAR`，首段 `visible:false`）；
   * 而 vision `repeatedFill=#a6ceff` 归一后在子树内**无相等 SOLID**（渐变归不出单色）。
   * ⇒ 颜色锚 `findFillAnchorNode` **结构性必然 miss**（不是「真值取不到」，是判据维度错），
   *   于是回退帧盒（140.48/120/141 异宽）⇒ 按 x 相减恰好得 `[-11,-12]`（与产物逐位吻合）。
   *
   * 判据（零语义猜测、零像素阈值，全部可辩驳）：
   *   ① `visible !== false`；
   *   ② `fills` 非空且存在 `visible !== false` 的填充 —— **不限 SOLID**（渐变/图片同样是可见底，
   *      这一步就是把「单色 SOLID」这条隐性前提拆掉）；
   *   ③ 排除 `TEXT`（TEXT 的 `fills` 是**字色**，不是底）；
   *   ④ `rowBox ⊇ cb`：含于本行帧盒 —— 注意与颜色锚的「`cb ⊇ rowBox`」**方向相反**，因可见底
   *      通常比帧盒**小**（帧盒含卡内留白：真机 120 < 140.48）。这也是 `:2321` 必须分开的原因：
   *      沿用 `cb.w >= rowBox.w` 则「选对节点仍回落」；
   *   ⑤ 盒不等于行盒（完全相等 ⇒ 无信息增量，交给回退口径）；
   *   ⑥ 不含其它行（沿用「恰好容纳本行」，否则选到的是列表容器）；
   *   ⑦ **与行盒共享至少一条边**（上/下/左/右）—— 排除「卡内居中浮块」这类高面积噪声；
   *      真机三卡分别左对齐/左对齐/右对齐，逐卡满足；
   *   ⑧ 多候选取**面积最大**（卡底覆盖卡内最大面积；图标、文字框、装饰色块必更小）。
   * 跨卡一致性另由调用方 span 自校验兜底（见 resolveCardBox 之后）。
   * @returns {{box:object, node:object, area:number}|null}
   */
  const pickVisibleFillBox = (node, rowBox, allRowBoxes) => {
    if (!node || !rowBox) return null;
    const seen = new Set();
    const stack = [node];
    const cands = [];
    while (stack.length) {
      const n = stack.shift();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      if (n.visible === false) continue;
      const isText = String(n.type || '').toUpperCase() === 'TEXT';
      const fills = Array.isArray(n.fills) ? n.fills : [];
      if (!isText && fills.some((f) => f && f.visible !== false)) {
        const cb = toBox(n.absoluteBoundingBox || n.bbox);
        if (
          cb &&
          cb.w > 0 &&
          cb.h > 0 &&
          boxContains(rowBox, cb) &&
          !(
            Math.round(cb.w) === Math.round(rowBox.w) &&
            Math.round(cb.h) === Math.round(rowBox.h)
          ) &&
          sharesEdge(rowBox, cb) &&
          !allRowBoxes.some((rb) => rb && rb !== rowBox && boxContains(cb, rb))
        ) {
          cands.push({ box: cb, node: n, area: cb.w * cb.h });
        }
      }
      for (const c of Array.isArray(n.children) ? n.children : []) stack.push(c);
    }
    if (!cands.length) return null;
    cands.sort((a, z) => z.area - a.area);
    return cands[0];
  };
  /**
   * 单行卡盒真值。**不可证 ⇒ 回落该行自身盒**（无从证明错位就不改，保持旧口径）。
   * 两条支路：① 颜色锚（最精确，先跑，须 `cb ⊇ 行盒`）；② 几何锚（步④，须 `行盒 ⊇ cb`）。
   * @returns {{box:object|null, node:object|null, fillNode:object|null, boxSource:string|null}}
   */
  const resolveCardBox = (it, rowBox, fill, allRowBoxes) => {
    const target = normalizeCssColor(fill);
    let cur = String(it?.figmaNodeId ?? it?.figmaNode ?? it?.id ?? '');
    // 🔴 步④：`target` **不再进守卫** —— 颜色锚 miss（含 fill 缺失）时仍须尝试几何锚。
    if (!cur || !figmaIndex) {
      return { box: rowBox, node: null, fillNode: null, boxSource: null };
    }
    let guard = 0;
    while (cur && guard++ < 64) {
      const entry = figmaIndex.get(cur);
      const node = entry?.rawNode || entry?.node || null;
      if (node) {
        if (target) {
          const hit = findFillAnchorNode(node, target);
          if (hit) {
            const cb = toBox(entry?.bbox || node.absoluteBoundingBox || node.bbox);
            const ok =
              !!cb &&
              (!rowBox || (cb.w >= rowBox.w && cb.h >= rowBox.h)) &&
              // 「恰好容纳本行」：若还含别的行 ⇒ 上溯到的是列表容器，不是卡盒
              !allRowBoxes.some((rb) => rb && rb !== rowBox && boxContains(cb, rb));
            if (ok) return { box: cb, node, fillNode: hit, boxSource: 'fill' };
            // ⚠️ 步④ 前此处 immediate return：颜色命中但盒不合格 = 命中的是卡内小色块而非卡底，
            //    直接回退属「颜色单轴」的第二处硬编码。现在落到几何支路由几何裁决。
          }
        }
        const geo = pickVisibleFillBox(node, rowBox, allRowBoxes);
        if (geo) {
          return { box: geo.box, node, fillNode: geo.node, boxSource: 'geometry' };
        }
      }
      cur = parentOf.get(cur) || null;
    }
    return { box: rowBox, node: null, fillNode: null, boxSource: null };
  };
  // 行盒（几何轨，旧口径）：E1 富化树节点直读优先（刀 21d），否则按 item id / icon 节点回查
  // 🔴 G9（2026-11-04 · 1de12f48 实锤）：icon 回退盒**只作占位、禁作行盒真值**。
  //   病灶：item 无本体盒时回退 `figmaIndex.get(item.icon.figmaNode)` ⇒ icon 是行内
  //   **子元素**（40×40），必然小于行盒；其盒被当行盒真值消费 ⇒ cardH=40（真值 ~72）
  //   且 cardWidths/gaps 同源污染。标记 `rowBoxFromIcon`，几何下发处分支拦截。
  const rowBoxFromIcon = [];
  const rowBoxes = items.map((it) => {
    const direct = it?.absoluteBoundingBox;
    const e =
      direct && Number.isFinite(direct.x) && Number.isFinite(direct.y)
        ? { bbox: direct }
        : figmaIndex?.get(String(it?.figmaNodeId ?? it?.figmaNode ?? it?.id ?? '')) ||
          figmaIndex?.get(String(it?.icon?.figmaNode ?? ''));
    const fromIcon =
      !(direct && Number.isFinite(direct.x) && Number.isFinite(direct.y)) &&
      !figmaIndex?.get(String(it?.figmaNodeId ?? it?.figmaNode ?? it?.id ?? '')) &&
      !!(it?.icon?.figmaNode && figmaIndex?.get(String(it.icon.figmaNode)));
    rowBoxFromIcon.push(fromIcon);
    return toBox(e?.bbox || e?.absoluteBoundingBox || e?.rawNode?.absoluteBoundingBox);
  });
  const iconFallbackPolluted = rowBoxFromIcon.some(Boolean);
  const cards = items.map((it, i) => resolveCardBox(it, rowBoxes[i], norm[i].fill, rowBoxes));
  // 🔴 步④ 自校验：几何锚必须与**帧轨同跨度**（首左 → 末右，±2px）。
  //   为何是跨度而非「Σwidths + Σgaps ≈ 段内容宽」：`Σw + Σg` **恒等于** `max(x+w) − min(x)`
  //   （代数恒等，不是独立事实），而「段内容宽」还要再取 sec 的 padding —— 那是**第二事实源**，
  //   违反判据单一来源。跨度式只用已存在的帧轨真值 `rowBoxes`，零新增事实、零阈值（±2 仅吸收舍入；
  //   真机 37..415 两侧逐位相等）。
  //   守卫对象：几何锚选到「卡内小色块 / 局部容器」⇒ 跨度必然远小于帧轨 ⇒ 全量 fail-open。
  //   计数（真机必 grep，0 也打）：`spanRejected>0` ⇒ 有样本被几何锚误选并已拦下；
  //   长期为 0 且 `geomPicked>0` ⇒ 自校验从未触发（须复核是否被架空）。
  const spanOfBoxes = (bs) => {
    const v = (bs || []).filter(Boolean);
    if (!v.length) return null;
    const lo = Math.min(...v.map((b) => b.x));
    const hi = Math.max(...v.map((b) => b.x + b.w));
    return Number.isFinite(lo) && Number.isFinite(hi) ? hi - lo : null;
  };
  const geomPicked = cards.filter((c) => c.boxSource === 'geometry').length;
  let spanRejected = false;
  if (geomPicked > 0) {
    const sp = spanOfBoxes(cards.map((c) => c.box));
    const sr = spanOfBoxes(rowBoxes);
    if (sp == null || sr == null || Math.abs(sp - sr) > 2) {
      spanRejected = true;
      cards.forEach((c, i) => {
        if (c.boxSource === 'geometry') {
          // 盒回退，但**保留尝试痕迹**（`geomPicked` 是「尝试数」不是「生效数」）——
          //   否则真机日志无法区分「几何锚从未触发」与「触发了但自校验拦下」。
          cards[i] = { box: rowBoxes[i], node: null, fillNode: null, boxSource: 'geometry-rejected' };
        }
      });
    }
  }
  const cardBoxes = cards.map((c, i) => c.box || rowBoxes[i]);
  const boxesReady = cardBoxes.length > 0 && cardBoxes.every(Boolean);
  const sameHeight = boxesReady && cardBoxes.every(
    (b) => Math.round(b.h) === Math.round(cardBoxes[0].h),
  );
  // 🔴 步③（2026-11-03）：**同宽**是与同高**独立**的轴约束 —— row 的「逐项宽度 + 横向间距」
  //   只取决于宽度轴，故必须能单独判定（原代码只有 `geoReady`=宽高同时相等，粒度太粗）。
  const sameWidth = boxesReady && cardBoxes.every(
    (b) => Math.round(b.w) === Math.round(cardBoxes[0].w),
  );
  // 🛡️ 2026-11-06（mc-max-1793913231075-64a1a31f 实锤）：**「是否同一循环组」不能用精确等值判**。
  //
  //   病灶：6 项盒集 `[470,459,459,459,459,459]` —— 首卡走帧盒（选中态描边使其帧盒 470），
  //   其余 5 卡走几何锚（内容盒 459）。差 11px（2.3%）⇒ 旧 `geoReady = sameWidth && sameHeight`
  //   判否 ⇒ column 分支**整段不写 cardH / gaps** ⇒ 产物 `FG_LIST_GAPS=null`、行无高度，
  //   设计稿 72px 行高 + 20px 间距全部丢失（三轮前同段真值本是 [470×6] + [20×5]，几何完全可证）。
  //
  //   事实：视觉阶段/Bbox 只能给出「大概相似」，同组成员的盒**本就不会逐像素相等**
  //   （内容盒 vs 帧盒、选中态描边、1px 描边归属都会造成 ±几 px）。用等值当闸门 = 让一个
  //   离群项废掉整段真值。故「同组资格」改走**容差相似带**；「每项实际尺寸/间距」仍逐项精确
  //   （间距用各卡自己的 y/h 相减，不经中位数抹平）。
  //
  //   判据（相对带宽，无绝对上限）：容差 = max(2px, 3% × 最大边)。小盒（40px 图标级）
  //   不吃 3% 的 1.2px（2px 托底），大盒（470px）得 14.1px —— 本次病灶差 11px（2.3%）
  //   据此落回组内；真异形（120 vs 140.5，17%）仍判否。**不设绝对上限**：上限会把
  //   「大盒 + 混源」这种最常见的病灶形态又挡回门外（首版写 6px 上限，11px 差仍判否，
  //   等于没修）。真异宽样本仍由 `horizProven`/逐项精确间距各自兜住，不因放宽而失真。
  const BOX_SIMILAR_RATIO = 0.03;
  const BOX_SIMILAR_MIN_PX = 2;
  const axisSimilar = (vals) => {
    const v = (vals || []).filter((n) => Number.isFinite(n));
    if (v.length === 0) return false;
    const hi = Math.max(...v);
    const lo = Math.min(...v);
    const tol = Math.max(BOX_SIMILAR_MIN_PX, hi * BOX_SIMILAR_RATIO);
    return hi - lo <= tol;
  };
  const similarWidth = boxesReady && axisSimilar(cardBoxes.map((b) => b.w));
  const similarHeight = boxesReady && axisSimilar(cardBoxes.map((b) => b.h));
  /** 相似带内的代表值：中位数（等值集退化为该值，行为与原 `cardBoxes[0]` 逐字一致）。 */
  const axisMedian = (vals) => {
    const v = (vals || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    if (v.length === 0) return null;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  };
  // 共享几何（卡高/间距）的可用性：以「相似」为准（视觉阶段可达的事实），不是「等值」。
  const geoReady = similarWidth && similarHeight;
  // 精确一致仍留作可回溯事实（`listGeoRelaxed` = 相似但不等值 ⇒ 容差生效的段数）。
  const exactUniform = sameWidth && sameHeight;

  // ── 步⑤（P0-2）卡内布局几何真值：名称/数值的相对排布 + 数值/单位的相对排布 ─────
  // 🛡️ 病灶（设计稿 vs 产物）：真机三卡是「名称在上、`51`+`次` 同一行在名称**正下方**且左对齐」，
  //   而渲染器硬编码「名称列 + stats 列 + `margin-left:auto`」⇒ 数值被推到**最右**，
  //   数值与单位上下两行（`51` / `次`）⇒ OCR 读成「名称 …右对齐的 51、次」。
  //   🔴 `margin-left:auto` 是**渲染层猜的横向关系**，与本次治理的 `cardWidths`/`gaps` 同病：
  //      声明层没有这条事实，是渲染器替真值做了决定。
  //
  // 判据（与刀55 `resolveListMemberDirection` 同构：**几何可证优先，不可证回落现状**）：
  //   - `innerDir`：名称盒 × 数值盒 —— **x 重叠率 > 50% 且 y 不重叠** ⇒ `stacked`（纵排，本单）；
  //                 **y 重叠率 > 50% 且 x 不重叠** ⇒ `inline`（横排）；皆不成立 ⇒ 不下发（回落现状）。
  //   - `valuePartsDir`：数值盒 × 单位盒 —— y 重叠率 > 50% 且 x 不重叠 ⇒ `inline`（本单 `51`+`次`）；
  //                     x 重叠率 > 50% 且 y 不重叠 ⇒ `stacked`；否则不下发。
  //   - `valuePartsGap`：单位盒左 − 数值盒右（真值 2px），**逐卡得同一整数才下发**（异值不下发）。
  //
  // 🔴 三道 fail-open 闸（缺一不可，否则「一条误判」会重排整段）：
  //   ① **文本配对必须唯一**：卡子树内 `characters` 与 vision 文本**全等**的节点恰 1 个才可用
  //      （0 个 = 取不到真值；≥2 个 = 有歧义）⇒ 该卡不投票，**绝不按顺序猜**。
  //   ② **多卡必须一致**：各卡的结论取集合，集合只有一种才采纳；出现第二种 ⇒ `innerConflict`
  //      ⇒ 整段不下发（重复成员同构 ⇒ 矛盾即不可证）。
  //   ③ **只用于「改变现状」的方向**：`stacked` 才重排（现状是 inline）；`inline` 仅确认现状。
  //      即「判错」的最坏后果是保持原样，不是把 `inline` 段错误压成纵排。
  //
  // 计数（真机必 grep，0 也打）：`inner=stacked` + `innerProv>0` ⇒ 判据在本单生效；
  //   `inner=none` 且产物仍把数值贴右 ⇒ 未生效（须查文本配对是否全 miss）；
  //   `innerConf=1` ⇒ 有样本各卡不一致而被拦（判据在工作，非故障）。
  const textBoxesIn = (node) => {
    const out = [];
    const seen = new Set();
    const stack = [node];
    while (stack.length) {
      const n = stack.shift();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      if (String(n.type || '').toUpperCase() === 'TEXT') {
        const s = String(n.characters ?? n.text ?? '').trim();
        const b = toBox(n.absoluteBoundingBox || n.bbox);
        if (s && b) out.push({ s, box: b });
        continue; // TEXT 无子节点，不必下探
      }
      for (const c of Array.isArray(n.children) ? n.children : []) stack.push(c);
    }
    return out;
  };
  /** 卡子树内与 `s` **全等**的 TEXT 盒；恰 1 个才返回（0/多个 ⇒ null，不猜）。 */
  const uniqueTextBox = (tb, s) => {
    const key = String(s ?? '').trim();
    if (!key) return null;
    const hit = tb.filter((e) => e.s === key);
    return hit.length === 1 ? hit[0].box : null;
  };
  /** 两盒在指定轴上的重叠率（分母取较窄者 ⇒ 小盒被大盒包含即 1.0）。 */
  const overlapRatio = (a, b, axis) => {
    const la = axis === 'x' ? a.w : a.h;
    const lb = axis === 'x' ? b.w : b.h;
    const m = Math.min(la, lb);
    if (!(m > 0)) return 0;
    const lo = axis === 'x' ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
    const hi = axis === 'x' ? Math.min(a.x + a.w, b.x + b.w) : Math.min(a.y + a.h, b.y + b.h);
    return Math.max(0, hi - lo) / m;
  };
  const innerVotes = [];
  const vPartsVotes = [];
  const vGapVotes = [];
  // 🔴 G8（2026-11-04 · a41a470f 实锤）：texts **条目间**几何投票。
  //   病灶：innerLayout 只投 name↔stats[0] 与 value↔unit 两组盒对；value 被归入
  //   texts（stats=[]）时，「华为技术」「8台」同行左右的几何关系**无任何投票** ⇒
  //   innerDir=null ⇒ 渲染器文本列 column 纵堆。补第三组：texts 相邻条目
  //   （texts[j] vs texts[j+1]）同构判据（uniqueTextBox+overlapRatio），零语义猜测。
  const textPairVotes = [];
  items.forEach((it, i) => {
    const id = String(it?.figmaNodeId ?? it?.figmaNode ?? it?.id ?? '');
    const entry = id ? figmaIndex?.get(id) : null;
    const node = cards[i]?.node || entry?.rawNode || entry?.node || null;
    if (!node) return;
    const tb = textBoxesIn(node);
    const tx = norm[i]?.texts || [];
    for (let j = 0; j + 1 < tx.length; j++) {
      const aB = uniqueTextBox(tb, tx[j]?.t);
      const bB = uniqueTextBox(tb, tx[j + 1]?.t);
      if (!aB || !bB) continue;
      const xr = overlapRatio(aB, bB, 'x');
      const yr = overlapRatio(aB, bB, 'y');
      // 与 name↔stats 判据同构：y 重叠（同行）+x 分离（左右）⇒ inline；
      // x 重叠（同列）+y 分离（上下）⇒ stacked。
      if (yr > 0.5 && xr <= 0.5) textPairVotes.push('inline');
      else if (xr > 0.5 && yr <= 0.5) textPairVotes.push('stacked');
    }
  });
  items.forEach((it, i) => {
    const id = String(it?.figmaNodeId ?? it?.figmaNode ?? it?.id ?? '');
    const entry = id ? figmaIndex?.get(id) : null;
    const node = cards[i]?.node || entry?.rawNode || entry?.node || null;
    if (!node) return;
    const tb = textBoxesIn(node);
    const st = norm[i]?.stats?.[0] || null;
    const nameB = uniqueTextBox(tb, norm[i]?.texts?.[0]?.t);
    const valueB = st ? uniqueTextBox(tb, st.v) : null;
    const unitB = st?.l ? uniqueTextBox(tb, st.l) : null;
    if (nameB && valueB) {
      const xr = overlapRatio(nameB, valueB, 'x');
      const yr = overlapRatio(nameB, valueB, 'y');
      if (xr > 0.5 && yr <= 0.5) innerVotes.push('stacked');
      else if (yr > 0.5 && xr <= 0.5) innerVotes.push('inline');
    }
    if (valueB && unitB) {
      const xr = overlapRatio(valueB, unitB, 'x');
      const yr = overlapRatio(valueB, unitB, 'y');
      if (yr > 0.5 && xr <= 0.5) vPartsVotes.push('inline');
      else if (xr > 0.5 && yr <= 0.5) vPartsVotes.push('stacked');
      const gap = Math.round(unitB.x - (valueB.x + valueB.w));
      if (Number.isFinite(gap) && gap >= 0) vGapVotes.push(gap);
    }
  });
  /** 投票汇总：全一致才采纳；出现第二种即冲突（不下发）。 */
  const tallyVotes = (vs) => {
    const uniq = [...new Set(vs)];
    if (uniq.length === 0) return { dir: null, proven: 0, conflict: false };
    if (uniq.length > 1) return { dir: null, proven: vs.length, conflict: true };
    return { dir: uniq[0], proven: vs.length, conflict: false };
  };
  const innerTally = tallyVotes(innerVotes);
  const vPartsTally = tallyVotes(vPartsVotes);
  // 🔴 G8：texts 条目间投票汇总（全行一致才采纳，出现第二种即冲突不下发）
  const textPairsTally = tallyVotes(textPairVotes);
  const vGapUniq = [...new Set(vGapVotes)];
  // 间距只在「数值/单位同行」时才是事实（纵排时 x 差无意义）⇒ 门控在 inline 分支内。
  const valuePartsGap =
    vPartsTally.dir === 'inline' && vGapUniq.length === 1 ? vGapUniq[0] : null;
  const innerLayout = {
    innerDir: innerTally.dir,
    innerProven: innerTally.proven,
    innerConflict: innerTally.conflict,
    valuePartsDir: vPartsTally.dir,
    valuePartsProven: vPartsTally.proven,
    valuePartsConflict: vPartsTally.conflict,
    valuePartsGap,
    // 🔴 G8：texts 相邻条目方向（inline=同行左右 / stacked=上下堆叠 / null=不可证不猜）
    textPairsDir: textPairsTally.dir,
    textPairsProven: textPairsTally.proven,
    textPairsConflict: textPairsTally.conflict,
  };

  const directionTruth = resolveListMemberDirection(sec, { cardBoxes });
  const direction = directionTruth.direction;
  let cardH = null;
  let cardWidths = null;
  let gaps = null;
  let padL = null;
  let radius = null;
  // 🔴 步③（2026-11-03）：横向几何（逐项宽度 `cardWidths` + 横向间距 `gaps`）的**可证条件**。
  //   ① `sameWidth`：与 v-for「重复成员同构」契约一致 ⇒ 可下发；
  //   ② `horizProven`：每卡盒都由 `resolveCardBox` **独立证明**（`node` 非空）⇒ 异宽也是真值 ⇒ 可下发。
  //   两者皆不满足（= 回退帧盒 + 异宽）⇒ **不可证** ⇒ 不下发。
  //   🔴 为何必须保留 ② 这一支（防误伤）：若只用 `sameWidth`，会把「逐项已证明的真异宽」也拦掉 ——
  //     那种样本的宽度是真值，照发才对。真机病灶样本恰好**两者皆不满足**。
  //   🔴 为何 `gaps` 与 `cardWidths` 同门（而不是只拦宽度）：row 的横向间距是
  //     `x(后) − (x(前) + w(前))`，**同一个不可信盒**同时决定宽度与间距 —— 宽度不可证则间距同样不可证。
  //     只拦宽度会留下「宽度不下发、间距照发」的自相矛盾态。
  const horizProven = boxesReady && cards.every((c) => !!c.node);
  // 🛡️ 2026-11-06：`widthNotUniform` 的否定项从**等宽**改为**相似宽**（同 `geoReady` 口径）。
  //   理由与列分支同一根因：混源盒集（帧盒 470 / 内容盒 459）在视觉阶段就是「大概相似」，
  //   用等值拦会连带把逐项宽度真值一起丢掉；越出相似带（真异宽）仍照拦。
  const widthNotUniform = boxesReady && direction === 'row' && !similarWidth && !horizProven;
  // 🔴 G9：icon 回退盒污染 ⇒ cardH/cardWidths/gaps 全部不可证（盒高/宽是子元素尺寸，
  //   非行盒真值）⇒ 一律不下发（宁缺勿错：错误 40px 限高比自然流危害大）。
  if (boxesReady && direction === 'row' && !iconFallbackPolluted) {
    if (similarHeight) cardH = Math.round(axisMedian(cardBoxes.map((b) => b.h)));
    if (!widthNotUniform) {
      cardWidths = cardBoxes.map((b) => Math.round(b.w));
      const byX = cardBoxes.map((b, i) => ({ b, i })).sort((a, z) => a.b.x - z.b.x);
      gaps = byX.slice(1).map((p, k) => {
        const prev = byX[k].b;
        return Math.round(p.b.x - (prev.x + prev.w));
      });
    }
  } else if (similarHeight && !iconFallbackPolluted && (similarWidth || horizProven)) {
    // 🛡️ 2026-11-06：`similarHeight` 取代 `geoReady`（后者要求**宽度也等值**，与纵向间距
    //   无关却成了闸门）。纵向间距只依赖各卡自身的 y/h，逐项精确相减 —— 不使用中位数抹平。
    //   🔴 保留「不可证 ⇒ 不下发」的原意（2026-11-03 步③）：若宽度轴明显不同形**且**各卡盒
    //   并非逐卡独立证明（全是回退帧盒），说明盒集本身不可信 ⇒ 整段几何仍不下发。
    //   即「相似宽」与「逐卡已证明」二选一成立即可 —— 本次病灶正是后者不成立、前者成立。
    cardH = Math.round(axisMedian(cardBoxes.map((b) => b.h)));
    // 🔴 退化守卫（保留 2026-11-03 column −86 教训）：若全部卡回退到**同一个盒**
    //   （y 全同），逐项相减得到的是同一盒自比 ⇒ 无意义。判据零语义：y 去重数 == 卡数。
    const distinctY = new Set(cardBoxes.map((b) => Math.round(b.y))).size === cardBoxes.length;
    if (distinctY) {
      const byY = cardBoxes.map((b, i) => ({ b, i })).sort((a, z) => a.b.y - z.b.y);
      gaps = byY.slice(1).map((p, k) => {
        const prev = byY[k].b;
        return Math.round(p.b.y - (prev.y + prev.h));
      });
    }
  }
  // 🔴🔴 2026-11-03（列表卡盒真值治本 · 步①②）：**间距不得为负** —— 几何恒真约束。
  //
  // 病灶（两处独立成因，同一症状）：
  //   ① row 分支（:2364）只以 `boxesReady` 为守卫，**不看 `geoReady`（同宽同高）**，
  //      而异宽帧盒按 x 相减必然为负。实测 c-vehicle-monitor-c2f78898 帧盒
  //      140.5/120/141 @ x=[37,166,274] ⇒ 166−(37+140.5)=−11.5→−11、274−(166+120)=−12，
  //      与产物 `FG_LIST_GAPS=[-11,-12]` **逐位吻合**（不是「真值取不到」，是算出了负值照写）。
  //   ② column 分支（:2372）有守卫，但 `resolveCardBox` 对该样本**全量回退同一 rowBox**
  //      （全同 y）⇒ 实测 −86。
  // 全库取证：172 产物中 5 个产出列表段，**3 个负间距**（row −11/−12、column −86），纵向横向都复发。
  //
  // 处置：负间距一律置 `null`（=不写间距，回落自然流），**绝不 clamp 成 0**
  //   —— 0 会把「算错」伪装成「设计本就无间距」，正是本仓反复踩的假绿形状。
  //   置 null 是「让错值不可能被写出去」，而非「把 −11 改成 9」。
  // 计数（真机必 grep，0 也打）：`negGapClamped=0 而产物仍含负值` ⇒ 判据未生效（或有第四处
  //   写间距的路径，须先查清）；`>0 而产物已无负值` ⇒ 生效；气氛值暴涨 ⇒ 几何判据误伤。
  const negGapValues = Array.isArray(gaps) ? gaps.filter((g) => g < 0) : [];
  const negGapClamped = negGapValues.length > 0;
  if (negGapClamped) gaps = null;
  // 🔴 步①：列表几何真值可见化。`geoReady===false`（异宽/异高）过去是**静默降级**，
  //   与「设计本就无间距」不可区分（§9.3 结论 3）—— 故随本刀一起挂出来。
  // 🔴 步③：`widthNotUniform`（row 回退盒 + 异宽 ⇒ 横向几何不下发）必须与 `negGapClamped`
  //   并列挂出 —— 否则「不下发宽度」就是新的静默降级。
  //   `rawWidths`+`rawXs` 让被拦下的**帧盒几何完整可回溯**（只给宽度无法重建负间距；
  //   步④ 按几何选可见底也要用到 x 真值）。
  // 🔴 步③ 与步① 的交互（必须知道，否则会误读计数）：`widthNotUniform` 生效时 `gaps`
  //   **从未被计算** ⇒ `negGapValues=[]`/`negGapClamped=false`。即真机病灶样本在步③ 后
  //   由 `widthNotUniform` 承载信号，`negGap` 不再是它的信号 —— 两者互补不重叠：
  //   `widthNotUniform`=「不可证 ⇒ 不算」，`negGapClamped`=「算了但为负 ⇒ 拦下」。
  const rawWidths = rowBoxes.length ? rowBoxes.map((b) => (b ? Math.round(b.w) : null)) : null;
  const rawXs = rowBoxes.length ? rowBoxes.map((b) => (b ? Math.round(b.x) : null)) : null;
  // 🔴 步④：`raw*` = **帧轨真值**（回溯用，语义不随支路漂移）；`box*` = **生效卡盒**
  //   （颜色锚或几何锚命中后可能小于帧盒）。两者并列才能区分「帧盒含留白」与「取错盒」。
  const boxWidths = boxesReady ? cardBoxes.map((b) => Math.round(b.w)) : null;
  const boxXs = boxesReady ? cardBoxes.map((b) => Math.round(b.x)) : null;
  const listGeo = {
    direction,
    geoReady: !!geoReady,
    sameWidth: !!sameWidth,
    sameHeight: !!sameHeight,
    // 🛡️ 2026-11-06：相似带判据可见化。`relaxed` = 判为可用但**并非精确等值** ⇒ 容差生效；
    //   `relaxed=0 && geoReady=0` ⇒ 真异形（不是容差没生效）；`relaxed>0` 而产物仍无
    //   cardH/gaps ⇒ 下游未消费（判据被架空）。
    similarWidth: !!similarWidth,
    similarHeight: !!similarHeight,
    exactUniform: !!exactUniform,
    relaxed: !!geoReady && !exactUniform,
    // 🔴 G9：icon 回退盒污染标记（真机计数行 listCardHIconFallbackRejected 的数据源）
    iconFallbackPolluted,
    cardW: boxesReady ? Math.round(cardBoxes[0].w) : null,
    cardH: boxesReady ? Math.round(cardBoxes[0].h) : null,
    rawWidths,
    rawXs,
    boxWidths,
    boxXs,
    geomPicked,
    spanRejected,
    cardWidths,
    gaps,
    negGapClamped,
    negGapValues,
    widthNotUniform,
    // 🔴 步⑤（P0-2）：卡内布局几何真值可见化 —— 否则「不下发」又是静默降级（与步①/③ 同规）。
    innerDir: innerLayout.innerDir,
    innerProven: innerLayout.innerProven,
    innerConflict: innerLayout.innerConflict,
    // 🔴 G8：texts 条目间方向真值（a41a470f name/value 同行实锤）
    textPairsDir: innerLayout.textPairsDir,
    textPairsProven: innerLayout.textPairsProven,
    textPairsConflict: innerLayout.textPairsConflict,
    valuePartsDir: innerLayout.valuePartsDir,
    valuePartsProven: innerLayout.valuePartsProven,
    valuePartsConflict: innerLayout.valuePartsConflict,
    valuePartsGap: innerLayout.valuePartsGap,
  };
  if (geoReady) {
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
  }

  // 每卡背景独立归属：逐项声明优先；无声明时只消费本卡子树的唯一背景证据。
  // 颜色只参与卡盒/填充真值，不再参与资源共享；相同 URL 只能由各项分别证明。
  // 通道构造委托 `toBgChannel`（**唯一来源**，与网格卡底截图通道同一份口径）。
  const toItemBg = (hit, source) => toBgChannel(hit, source);
  const itemBgs = items.map((it, i) => {
    const declaredFile = String(it?.bg?.resourceFile || '');
    if (declaredFile) {
      const ownerIds = new Set(
        [cards[i]?.node?.id, it?.figmaNodeId, it?.figmaNode, it?.id]
          .filter((id) => id != null && String(id))
          .map(String),
      );
      const declaredHits = mapping.filter((e) => {
        if (String(e?.resourceFile || '') !== declaredFile) return false;
        // 复用既有背景用途/下载状态判据，禁止把同名图标借成卡片背景。
        if (backgroundImageOf({ id: e?.figmaNodeId }, [e]) !== e) return false;
        const owner = String(e?.ownerSectionId || '');
        return !owner || ownerIds.has(owner);
      });
      if (declaredHits.length === 1) {
        const bg = toItemBg(declaredHits[0], 'declared');
        if (bg) return bg;
      }
      // 有显式声明但归属/用途/变量不成立时 fail-closed：不得改借本卡另一张背景。
      return null;
    }
    const cardNode = cards[i]?.node;
    if (!cardNode) return null;
    const hits = [];
    const seen = new Set();
    const walkNode = (n) => {
      if (!n || seen.has(n)) return;
      seen.add(n);
      const hit = backgroundImageOf(n, mapping);
      if (hit) hits.push(hit);
      for (const c of Array.isArray(n.children) ? n.children : []) walkNode(c);
    };
    walkNode(cardNode);
    return hits.length === 1 ? toItemBg(hits[0], 'subtree') : null;
  });
  const itemBgStats = { declared: 0, subtree: 0, skipped: 0 };
  itemBgs.forEach((bg, i) => {
    norm[i].bg = !!bg;
    if (bg) itemBgStats[bg.source] += 1;
    else itemBgStats.skipped += 1;
  });
  // 🛡️ G4（2026-11-04 · mc-max-1793775868744-c7d56bd7 实锤 FG_LIST_ITEMS texts:[]）：
  //   文本可观测性——textsFilled/textsEmpty 恒计（调用方计数行落日志，0 也打）。
  //   textsAllEmpty=true = 本段所有行的行文本断供（文本全在 stats 或采集缺失），
  //   接管仍成立（卡几何/背景真值在），但显式标记供审计与 G3 消费，不再静默。
  // 🔴 A（2026-11-12 · mc-max-1794458950336-47b996c3 实锤）：**段级附属文本**归属。
  //   同构列表只物化 items ⇒ 直属于段、不在任何 item 子树内的 TEXT（真机段尾
  //   `共 6 个节点` / `接入设备 10810`）结构性缺席，C1b 判定真值缺席且修复轮无 carrier
  //   可修（两轮 FAIL 逐字相同）。此处按「结构归属 + 几何位置」取回，交渲染层物化为
  //   v-for **之外**的独立节点（不进 items、不进循环）。
  const itemAnchors = items.flatMap((it) => {
    const a = it?.figmaNodeId ?? it?.figmaNode ?? it?.id;
    const inner = it?.body?.items?.[0];
    const b = inner?.figmaNodeId ?? inner?.figmaNode ?? inner?.id;
    return [a, b].filter((x) => x != null && x !== '');
  });
  const satellite = collectSatelliteTexts(sec, itemAnchors, figmaIndex, direction);
  const satelliteCount = satellite.ok ? satellite.head.length + satellite.tail.length : 0;
  const textsFilled = norm.filter((n) => n.texts.length > 0).length;
  const textsEmpty = norm.length - textsFilled;
  return {
    ok: true,
    kind: 'list',
    sectionId: String(sec.id ?? ''),
    baseId: String(sec.id ?? ''),
    items: norm,
    direction,
    directionSource: directionTruth.directionSource,
    cardH,
    cardWidths,
    gaps,
    padL,
    radius,
    itemBgs,
    itemBgStats,
    // 🔴 2026-11-03：几何真值事实（含 `negGapClamped` / `geoReady`）——调用方 `out` 聚合，
    //   不得只留在返回体里（否则计数行在审计侧不可见 = 假绿）。
    listGeo,
    // 🔴 步⑤（P0-2）：卡内布局真值（渲染器据此重排/不重排；`null` ⇒ 保持现状）。
    innerLayout,
    textsFilled,
    textsEmpty,
    // 🔴 A（2026-11-12 · mc-max-1794458950336-47b996c3）：段级附属文本裁决结果。
    //   `ok:true` 且 count>0 ⇒ 渲染层必须在 `v-for` **之外**物化 head/tail；
    //   `ok:false` ⇒ 整体 fail-open 交 LLM（reason 进计数行，禁止静默丢）。
    satellite: {
      ok: !!satellite.ok,
      reason: satellite.ok ? null : String(satellite.reason || 'unknown'),
      head: satellite.head,
      tail: satellite.tail,
      count: satelliteCount,
    },
    // 🔴 G11b：mapping 文本归位计数（调用方聚合进计数行）
    iconFromMapping: iconTextMatched,
    iconTextUnmatched,
    textsAllEmpty: textsFilled === 0 && norm.length > 0,
  };
}

/**
 * 🛡️ 刀53h（2026-11-02 · mc-max-1793582674250-3b0689c9 实锤）：**footer 汇总条**确定性接管判据。
 *
 * ## 病灶（为什么必须有这一类）
 * vision/planner 给出**独立 footer 段**（`type:'footer'` / id 前缀 `footer-*`），其真值
 * 形状与既有九类**全都不同**，于是九类逐条 fail-open：
 *   - `detectGridLeaf` / `detectHeaderRowLeaf` / `detectTextLeaf` / `detectIconLeaf` /
 *     `detectLegendDotTextLeaf` / `detectKvGridLeaf`：**全部依赖 Figma 锚点**，而 footer 段
 *     `sourceNodeIds=[]`（planner 无归属）⇒ `noAnchorNode`；
 *   - `detectStatRowLeaf` / `detectTableLeaf`：要求 `role:'stat-card'` / 表头契约 +
 *     归一类型不为其他 kind（T-CONTRACT，2026-11-05：footer 段 `type='footer'` ⇒
 *     `contractMismatch:footer`），footer 的 `body.items[].content.elements` 也无这些标记；
 *   - `detectListLeaf`：要求 `collapsed:true || renderHint==='v-for'`，footer 无折叠标记。
 * ⇒ footer 段落入 LLM chunk 自由生成：3b0689c9 实测「LLM 把整片内容区 6 节点列表复刻进
 *   footer 组件（`data-section-id="footer-summary"` 但内容是 node-card），footer 本体真值
 *   （共 6 个节点 / 接入设备 10810）全丢」，`index.vue` 两块各 flex:1 上下排 ⇒ 用户看到
 *   「上下重复 + 样式不同」。
 *
 * ## 判据（**只用段契约，不依赖 Figma 锚点** —— 这正是它的存在理由）
 * `declaredSectionType(sec) === 'footer'`（vision 显式发言，`sec.type > sec.header.type`）
 * **或** `sec.id` 前缀 `footer-`（planner id 通道，实测 `footer-summary`）。
 * 两通道都**不做几何/形态校验**：无锚点段拿不到几何，加几何闸门等于恒定失败（假绿）。
 * 反向由判据本身封闭：`type='list'|'stats'|'table'|'grid'|'header'` 或 id 不是 footer-*
 * 的段一律 `notFooterSection` ⇒ 结构上不可能抢走既有九类的命中。
 *
 * ## 真值来源（`body.items[].content.elements[]`，逐字取用，缺事实不猜）
 * 每 item = 一组（group），组内每个 element = 一个 part：`{ t:text, c:color, fs:fontSize, fw:fontWeight }`。
 * 🔴 **文本不 trim**：实测 label 真值 `'接入设备 '` 带尾空格，它是「label 与 value 之间的
 *   间距」这一视觉事实，trim 掉就等于改真值（渲染侧用 `white-space:pre` 保住它，不靠猜 gap）。
 * 空文本（`trim()===''`）的 part 丢弃；全组丢空 ⇒ `footerNoText`（fail-open，不渲染空壳）。
 *
 * ## 背景图（跟随既有纪律：变量名只能取资源映射层的 `assignedVarName`）
 * `body.backgroundImage.src` 的**基名**去 `resourceMapping` 反查（单一命中才认，歧义/未命中
 * ⇒ `bg:null` 不猜）；`style` 四件套复用 `inferBackgroundStyle`（与 list item / statrow 卡底
 * **同一份判据**，禁止副本）。
 *
 * @param {object} sec planner 叶段（resolvePlanSections 的产物）
 * @param {Array} resourceMapping effectiveMapping（含 `resourceFile` / `assignedVarName`）
 * @returns {{ok:true, kind:'footer', sectionId:string, baseId:string, groups:Array<{parts:Array<{t:string,c:string|null,fs:number|null,fw:string|null}>}>, bg:{varName:string,file:string,style:object}|null}
 *          | {ok:false, reason:'noSection'|'notFooterSection'|'footerNoItems'|'footerNoText'}}
 */
export function detectFooterSummaryLeaf(sec, resourceMapping) {
  const fail = (reason) => ({ ok: false, reason });
  if (!sec || typeof sec !== 'object') return fail('noSection');
  // 判据通道（唯一来源，不自写 type 读取副本）
  const declared = declaredSectionType(sec);
  const idStr = String(sec.id ?? '');
  if (declared !== 'footer' && !/^footer[-_]/i.test(idStr)) return fail('notFooterSection');
  // 容器形态（两种已验证形态，前者优先；其余形态宁漏不误 ⇒ fail-open）
  const items = Array.isArray(sec.body?.items)
    ? sec.body.items
    : Array.isArray(sec.items)
      ? sec.items
      : null;
  if (!items || items.length === 0) return fail('footerNoItems');
  const groups = [];
  for (const it of items) {
    const els = Array.isArray(it?.content?.elements) ? it.content.elements : [];
    const parts = [];
    for (const e of els) {
      const raw = e?.text == null ? '' : String(e.text);
      if (!raw.trim()) continue;
      const st = e?.styles && typeof e.styles === 'object' ? e.styles : {};
      const fsNum = Number(st.fontSize);
      parts.push({
        t: raw,
        c: st.color == null ? null : String(st.color),
        fs: Number.isFinite(fsNum) && fsNum > 0 ? fsNum : null,
        fw: st.fontWeight == null ? null : String(st.fontWeight),
      });
    }
    if (parts.length > 0) groups.push({ parts });
  }
  if (groups.length === 0) return fail('footerNoText');
  return {
    ok: true,
    kind: 'footer',
    sectionId: idStr,
    baseId: idStr,
    groups,
    bg: resolveFooterBackground(sec, resourceMapping),
  };
}

/** 背景图基名（`../resources/images/image_313-5800.png` → `image_313-5800.png`）。 */
function baseNameOf(p) {
  return String(p ?? '').split('/').pop().split('\\').pop();
}

/**
 * footer 段背景图反查（无 Figma 锚点 ⇒ 只能按**资源文件基名**匹配）。
 *
 * 纪律：
 *  ① 只在**基名唯一命中**时认（歧义 ⇒ null，绝不挑一个）；
 *  ② 通道构造**委托** `toBgChannel`（唯一来源，R2.6 2026-11-05）—— 本函数只负责
 *     「无锚点时的基名反查」这一件事，不再自己拼 `{varName, file, style}` 契约
 *     （原先与 `toBgChannel` 逐行同构，属重复构造；见矛盾/重复审查 §5.3）。
 */
function resolveFooterBackground(sec, resourceMapping) {
  const src = sec?.body?.backgroundImage?.src;
  const want = baseNameOf(src);
  if (!want) return null;
  const all = toArray(resourceMapping).filter((e) => e && typeof e === 'object');
  let hits = all.filter((e) => baseNameOf(e.resourceFile || e.file || e.src) === want);
  if (hits.length !== 1) {
    const usage = String(sec?.body?.backgroundImage?.recommendedUsage || '');
    const narrowed = usage
      ? hits.filter((e) => String(e.recommendedUsage || '') === usage)
      : [];
    if (narrowed.length !== 1) return null;
    hits = narrowed;
  }
  // 命中条目的基名 = `want`（上面的 filter 保证）⇒ `file` 与旧实现在此逐字一致
  return toBgChannel(hits[0], 'footer');
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
/**
 * 🔀 刀 54：kv 网格单元**渲染构造**共用段（单一来源，2026-11-03 自 kvgrid 分支原样
 * 提取，字符串逐字不变 —— 既有 kvgrid spec 锁定）。两个消费者：
 *   ① `renderFoldedGridLeafVue` 的 kvgrid 分支（`l{i}`/`v{i}`）；
 *   ② regions 复合分支（`kvl{i}`/`kvv{i}`，避免与 text 区常量撞名）。
 * @param {object} kv `{cells, columns, labelGap}` 形状（两分支同构）
 * @param {string} cls 类名前缀
 * @param {string} lp label script 常量前缀
 * @param {string} vp value script 常量前缀
 */
function fgKvCellLines(kv, cls, lp, vp) {
  const lines = [];
  kv.cells.forEach((c, i) => {
    const lw = kv.columns[c.col]?.labelW ?? c.labelW;
    lines.push(
      `    <div class="${cls}-cell" style="display:flex;flex-direction:row;align-items:baseline;gap:${kv.labelGap}px;">`,
      `      <span class="${cls}-label" style="flex:0 0 ${lw}px;text-align:right;color:${c.labelColor};font-size:${c.labelFs}px;font-weight:${c.labelFw};line-height:${c.labelLh}px;white-space:nowrap;">{{ ${lp}${i} }}</span>`,
      `      <span class="${cls}-value" style="color:${c.valueColor};font-size:${c.valueFs}px;font-weight:${c.valueFw};line-height:${c.valueLh}px;white-space:nowrap;">{{ ${vp}${i} }}</span>`,
      '    </div>',
    );
  });
  return lines;
}

/** 🔀 kv 单元 script 常量行（与 fgKvCellLines 配对，同一单一来源论证）。 */
function fgKvCellConsts(kv, lp, vp) {
  const lines = [];
  kv.cells.forEach((c, i) => {
    lines.push(`const ${lp}${i} = ${jsonStr(c.label)}`);
    lines.push(`const ${vp}${i} = ${jsonStr(c.value)}`);
  });
  return lines;
}

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
    // 每卡背景消费自己的映射变量与四件套；同资源由逐项证据自然共享 import，
    //   不再从首卡向同色成员扩散。URL 与尺寸/定位均只走 `:style`，不拼静态资源文本。
    const itemBgs = Array.isArray(tr.itemBgs) ? tr.itemBgs : [];
    const bgImports = new Set();
    itemBgs.forEach((bg) => {
      if (!bg?.varName || bgImports.has(bg.varName)) return;
      bgImports.add(bg.varName);
      importLines.push(`import ${bg.varName} from '../../resources/images/${bg.file}'`);
    });
    const itemStatic = tr.radius ? `border-radius:${tr.radius}px;` : '';
    const itemBindBg = itemBgs.some(Boolean)
      ? ", backgroundImage: it.bgVar ? 'url(' + it.bgVar + ')' : undefined, backgroundSize: it.bgVar ? it.bgSize : undefined, backgroundRepeat: it.bgVar ? it.bgRepeat : undefined, backgroundPosition: it.bgVar ? it.bgPosition : undefined"
      : '';
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
      const bg = itemBgs[i] || null;
      const bgVar = bg?.varName || 'null';
      const bgSize = bg?.style?.size ? jsonStr(bg.style.size) : 'null';
      const bgPosition = bg?.style?.position ? jsonStr(bg.style.position) : 'null';
      const bgRepeat = bg?.style?.repeat ? jsonStr(bg.style.repeat) : 'null';
      return `  { texts: ${texts}, stats: ${stats}, icon: ${itemIconExpr[i]}, iconW: ${it.icon?.w ?? 'null'}, iconH: ${it.icon?.h ?? 'null'}, fill: ${it.fill ? jsonStr(it.fill) : 'null'}, bg: ${it.bg === true}, bgVar: ${bgVar}, bgSize: ${bgSize}, bgPosition: ${bgPosition}, bgRepeat: ${bgRepeat} }${i < tr.items.length - 1 ? ',' : ''}`;
    });
    const gapsLit = Array.isArray(tr.gaps)
      ? `const FG_LIST_GAPS = ${inlineJson(tr.gaps)};`
      : 'const FG_LIST_GAPS = null;';
    const widthsLit = Array.isArray(tr.cardWidths)
      ? `const FG_LIST_WIDTHS = ${inlineJson(tr.cardWidths)};`
      : 'const FG_LIST_WIDTHS = null;';
    const isRow = tr.direction === 'row';
    // 🔴 A（2026-11-12 · mc-max-1794458950336-47b996c3）：段级附属文本（`562:3` 段尾的
    //   `共 6 个节点` / `接入设备 10810`）。它们直属于段、不在任何 item 子树内，
    //   同构接管只物化 items ⇒ 结构性缺席（C1b 真值缺席且修复轮无 carrier 可修）。
    //   此处物化为 `v-for` **之外**的独立节点：不进 items、不进循环、不参与同构校验。
    //   颜色/字号/字重/行高/间距全部 Figma 真值内联；缺事实不写（绝不兜底）。
    const satHead = tr.satellite?.ok && Array.isArray(tr.satellite.head) ? tr.satellite.head : [];
    const satTail = tr.satellite?.ok && Array.isArray(tr.satellite.tail) ? tr.satellite.tail : [];
    const satLit = (arr, name) =>
      `const ${name} = [${
        arr.length
          ? arr
              .map(
                (e) =>
                  `{ t: ${jsonStr(e.t)}, c: ${e.c ? jsonStr(e.c) : 'null'}, fs: ${e.fs ?? 'null'}, fw: ${e.fw ? jsonStr(e.fw) : 'null'}, lh: ${e.lh ?? 'null'}, gap: ${e.gap ?? 'null'} }`,
              )
              .join(', ')
          : ''
      }];`;
    // 间距沿**列表主轴**施加（column ⇒ marginTop，row ⇒ marginLeft），与 `FG_LIST_GAPS` 同向。
    // 数组为空 ⇒ 该行**整行不输出**（产物零噪音；不留空 v-for 残壳）。
    const satAxisMargin = isRow ? 'marginLeft' : 'marginTop';
    const satBlock = (name, arr, pad) =>
      arr.length === 0
        ? []
        : [
            `${pad}<span v-for="(g, __s) in ${name}" :key="__s" :style="{ color: g.c || undefined, fontSize: g.fs ? g.fs + 'px' : undefined, fontWeight: g.fw || undefined, lineHeight: g.lh ? g.lh + 'px' : 1.2, whiteSpace: 'nowrap', flex: 'none', ${satAxisMargin}: g.gap != null ? g.gap + 'px' : undefined }">{{ g.t }}</span>`,
          ];
    const itemWidth = isRow
      ? "width: FG_LIST_WIDTHS ? FG_LIST_WIDTHS[__i] + 'px' : undefined,"
      : '';
    const itemGap = isRow
      ? "marginLeft: __i > 0 && FG_LIST_GAPS ? FG_LIST_GAPS[__i - 1] + 'px' : undefined,"
      : "marginTop: __i > 0 && FG_LIST_GAPS ? FG_LIST_GAPS[__i - 1] + 'px' : undefined,";
    // 🔴 步⑤（P0-2）：卡内布局按**几何真值**重建，缺真值一律保持现状（fail-open 到旧结构）。
    //   旧结构硬编码了 `margin-left:auto` —— 那是渲染器替真值决定的**横向关系**
    //   （把数值推到最右）；真机是「数值在名称正下方、左对齐」。两者只差这一处，
    //   但真值不下发时**必须**仍是旧行为，否则一次误判会重排整段。
    const il = tr.innerLayout || {};
    const innerStacked = il.innerDir === 'stacked';
    const vPartsInline = il.valuePartsDir === 'inline';
    // 🔴 G8（2026-11-04 · a41a470f 实锤）：texts 条目间几何真值落地。
    //   inline（同行左右，y 重叠+x 分离投票一致）⇒ 文本列改 row + baseline；
    //   间距无真值不写（紧邻排列），也不推右（margin-left:auto 是替真值决定，
    //   与步⑤ 废除 stats 硬编码推右同一纪律）。stacked/null ⇒ 维持旧 column（fail-open）。
    const textPairsInline = il.textPairsDir === 'inline';
    const textColStyle = textPairsInline
      ? 'display:flex;flex-direction:row;align-items:baseline;justify-content:flex-start;min-width:0;flex:1 1 auto;'
      : 'display:flex;flex-direction:column;justify-content:center;min-width:0;flex:1 1 auto;';
    // 数值/单位同行时的真值间距（真机 2px）；无真值 ⇒ 一个字符都不写（缺事实不猜）。
    const vGapCss =
      vPartsInline && Number.isFinite(il.valuePartsGap) ? `gap:${il.valuePartsGap}px;` : '';
    // 每个 stats 组内部：inline ⇒ 数值/单位同行 + `baseline`（校正 fs20 与 fs12.32 的基线差，
    //   否则小字会贴大字的底线）；stacked ⇒ 现状纵排，对齐方式随外层（stacked 左对齐 / 现状右对齐）。
    const statGroupStyle = `display:flex;flex-direction:${vPartsInline ? 'row' : 'column'};align-items:${
      vPartsInline ? 'baseline' : innerStacked ? 'flex-start' : 'flex-end'
    };justify-content:center;${vGapCss}`;
    const statsOuterStyle = innerStacked
      ? 'display:flex;flex-direction:column;align-items:flex-start;flex:none;'
      : 'margin-left:auto;display:flex;flex-direction:row;flex:none;';
    const vSpanHtml = `<span :style="{ color: s.vc || undefined, fontSize: s.vfs ? s.vfs + 'px' : undefined, fontWeight: s.vfw || undefined, lineHeight: 1.2, whiteSpace: 'nowrap' }">{{ s.v }}</span>`;
    const lSpanHtml = `<span v-if="s.l" :style="{ color: s.lc || undefined, fontSize: s.lfs ? s.lfs + 'px' : undefined, lineHeight: 1.2, whiteSpace: 'nowrap' }">{{ s.l }}</span>`;
    const statsBlock = (pad) => [
      `${pad}<div v-if="it.stats.length" style="${statsOuterStyle}">`,
      `${pad}  <div v-for="(s, __k) in it.stats" :key="__k" style="${statGroupStyle}">`,
      `${pad}    ${vSpanHtml}`,
      `${pad}    ${lSpanHtml}`,
      `${pad}  </div>`,
      `${pad}</div>`,
    ];
    const lines = [
      '<template>',
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:flex;flex-direction:${isRow ? 'row' : 'column'};min-height:0;overflow-${isRow ? 'x' : 'y'}:auto;">`,
      // 🔴 A：段级附属文本（head）在 `v-for` **之前**作为独立节点渲染（不属于任何一项）。
      ...satBlock('FG_LIST_HEAD', satHead, '    '),
      // 🔴 卡底走 `backgroundColor` **长写**（非 `background` 简写）：简写会重置
      //   逐项背景四件套 ⇒ 图条尺寸/定位全丢；长写与图片属性零重叠。
      `    <div v-for="(it, __i) in FG_LIST_ITEMS" :key="__i" class="${cls}-item" style="display:flex;flex-direction:row;align-items:center;flex:none;box-sizing:border-box;${itemStatic}" :style="{${itemWidth}${tr.cardH ? ` height: '${tr.cardH}px',` : ''} ${itemGap} backgroundColor: it.fill || undefined${itemBindBg} }">`,
      `      <img v-if="it.icon" :src="it.icon" :style="{ width: it.iconW ? it.iconW + 'px' : undefined, height: it.iconH ? it.iconH + 'px' : undefined, objectFit: 'contain', flex: 'none'${tr.padL != null ? `, marginLeft: '${tr.padL}px'` : ''} }" alt="" />`,
      `      <div style="${textColStyle}">`,
      `        <span v-for="(t, __j) in it.texts" :key="__j" :style="{ color: t.c || undefined, fontSize: t.fs ? t.fs + 'px' : undefined, fontWeight: t.fw || undefined, lineHeight: 1.2, whiteSpace: 'nowrap' }">{{ t.t }}</span>`,
      // stacked：stats 进**同一列**（`it` 的文本列），紧接名称下方 ⇒ 天然左对齐、不再贴右
      ...(innerStacked ? statsBlock('        ') : []),
      `      </div>`,
      ...(innerStacked ? [] : statsBlock('      ')),
      `    </div>`,
      // 🔴 A：段级附属文本（tail）在 `v-for` **之后**作为独立节点渲染（不属于任何一项）。
      ...satBlock('FG_LIST_TAIL', satTail, '    '),
      `  </div>`,
      '</template>',
      '',
      '<script setup>',
      ...importLines,
      `const FG_LIST_ITEMS = [`,
      ...itemLit,
      `];`,
      gapsLit,
      widthsLit,
      // 🔴 A：段级附属文本真值（空数组 ⇒ 模板 `v-if` 不渲染，零空壳）。
      satLit(satHead, 'FG_LIST_HEAD'),
      satLit(satTail, 'FG_LIST_TAIL'),
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
    // 图标 import 与「名字 → 模块绑定」查表：按 varName 去重（同一 varName 指向不同
    // file ⇒ 冲突，全不渲染 —— 绝不猜测「取哪一个」）；varName 非法 JS 标识符同样跳过
    // （降级不渲图标，不炸脚本）。
    // 🔴 必须在**模板生成之前**算出来：无可用图标 ⇒ 模板不产 `<img>` 行与查表
    //   （零副作用：既不写永不为真的绑定，也不引空查表）。
    // 🔴🔴 图标 URL 必须经运行时查表 `ICON_MAP[名]`，模板里绝不能直接绑名字：
    //   `rows` 是 JSON 字面量（`inlineJson`），`iconVar` 存的是**变量名的字符串**
    //   （`"icon4"`）⇒ 直接 `:src="record.c0.iconVar"` 求值成 `src="icon4"`（相对 URL 404），
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
    // 🔴 R9 antd 语义升级（2026-11-02 · 用户拍板方案 A，fe47afcd 实锤立项）：
    //   手写 flex 表格 DOM ⇒ `<a-table>`。微码预览运行时已全局注册 ant-design-vue
    //   （frontend/src/utils/loadVue3Runtime.js `app.use(antd)` 实证），产物**禁止
    //   自行 import**（微码 import 白名单：组件库由运行时提供）。防重复渲染纪律
    //   不变（memberIndex>0 仍 display:none 空壳）。真值通道（预览运行时 SFC
    //   scoped style 不生效的既有教训 ⇒ 全部走**运行时注入**，禁 :deep 硬怼内部 DOM）：
    //   · 列宽 %      → columns[].width（table-layout fixed）；
    //   · 表头/单元格外观（bg/border/pad/行高）→ customHeaderCell/customCell 返回 inline style；
    //   · 文本样式（color/fs/fw）→ #headerCell / #bodyCell slot inline（不依赖继承）；
    //   · 图标列      → #bodyCell 内 ICON_MAP 查表（rows 为 JSON 字面量，模块绑定唯一桥）。
    //   行为差异声明：flex 版「itemSpacing=-1 压叠出 1px 网格线」在 table 布局无负
    //   margin 语义，改由真值 border（`1px solid #ffffff`）表达；`:bordered="false"`
    //   关掉 antd 自带边框，网格线全部来自真值。行高换算：th=rowH；td=rowH+rowGap
    //   （负节距并入行高 ⇒ 44 + 8×43 = 388 精确命中真值总高）。
    const imgLine = usableIconVars.length > 0
      ? `          <img v-if="record[column.dataIndex].iconVar" :src="ICON_MAP[record[column.dataIndex].iconVar]" alt="" :style="{ width: record[column.dataIndex].iconW + 'px', height: record[column.dataIndex].iconH + 'px', objectFit: 'contain', flex: 'none', marginRight: record[column.dataIndex].iconGap == null ? undefined : record[column.dataIndex].iconGap + 'px' }" />`
      : null;
    const lines = [
      '<template>',
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;height:${tr.height}px;padding:0;min-width:0;box-sizing:border-box;">`,
      `    <a-table class="${cls}-tbl" :columns="cols" :data-source="rows" :pagination="false" :bordered="false" :show-header="true" table-layout="fixed" size="small" :row-key="(_, i) => i">`,
      '      <template #headerCell="{ column }">',
      `        <span :style="{ color: column.h.color, fontSize: column.h.fs + 'px', fontWeight: column.h.fw, lineHeight: 1, whiteSpace: 'nowrap' }">{{ column.title }}</span>`,
      '      </template>',
      '      <template #bodyCell="{ column, record }">',
      '        <template v-if="record[column.dataIndex]">',
      ...(imgLine ? [imgLine] : []),
      `          <span :style="{ color: record[column.dataIndex].color, fontSize: record[column.dataIndex].fs + 'px', fontWeight: record[column.dataIndex].fw, lineHeight: 1, whiteSpace: 'nowrap' }">{{ record[column.dataIndex].text }}</span>`,
      '        </template>',
      '      </template>',
      '    </a-table>',
      '  </div>',
      '</template>',
      '',
      '<script setup>',
    ];
    // 表头/单元格外观真值 → inline style 源码（customHeaderCell/customCell 运行时注入）。
    // td 行高并入负节距（th=rowH；td=rowH+rowGap ⇒ 真值总高精确命中，见上方行为差异声明）。
    const tdH = tr.rowH + (tr.rowGap || 0);
    tr.cols.forEach((c, i) => {
      const hStyleParts = [
        c.header.pad ? `padding: ${jsonStr(c.header.pad)}` : 'padding: 0',
        c.header.bg ? `background: ${jsonStr(c.header.bg)}` : '',
        c.header.border ? `border: ${jsonStr(c.header.border)}` : '',
        `height: '${tr.rowH}px'`,
        `'box-sizing': 'border-box'`,
        `'text-align': 'center'`,
        `'vertical-align': 'middle'`,
      ].filter(Boolean);
      const cellStyleParts = [
        `background: (c && c.bg) || undefined`,
        `border: (c && c.border) || undefined`,
        `padding: (c && c.pad) || 0`,
        `height: '${tdH}px'`,
        `'box-sizing': 'border-box'`,
        `'text-align': 'center'`,
        `'vertical-align': 'middle'`,
      ];
      lines.push(
        `const hStyle${i} = { ${hStyleParts.join(', ')} };`,
        `const cellStyle${i} = (record) => { const c = record && record.c${i}; return { ${cellStyleParts.join(', ')} }; };`,
      );
    });
    // 图标 import（判据见上方 `iconFiles` / `iconConflicts` 计算，此处只落盘）
    for (const v of usableIconVars) {
      lines.push(`import ${v} from '../../resources/images/${iconFiles.get(v)}'`);
    }
    // 名字 → 模块绑定。模板 `:src="ICON_MAP[record.cN.iconVar]"` 的唯一来源：
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
    // 列定义：真值列宽（table-layout fixed 下百分比生效）+ 表头/单元格外观注入。
    // 🔴 产物禁止 `import ... from 'ant-design-vue'`（运行时全局注册，import 白名单纪律）。
    lines.push('const cols = [');
    tr.cols.forEach((c, i) => {
      lines.push(
        `  { title: ${jsonStr(c.header.text)}, dataIndex: 'c${i}', width: '${c.widthPct}%', h: { color: ${jsonStr(c.header.color)}, fs: ${c.header.fs}, fw: ${c.header.fw} }, customHeaderCell: () => ({ style: hStyle${i} }), customCell: (record) => ({ style: cellStyle${i}(record) }) },`,
      );
    });
    lines.push('];');
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
    lines.push(...fgKvCellLines(tr, cls, 'l', 'v'));
    lines.push('  </div>', '</template>', '', '<script setup>');
    lines.push(...fgKvCellConsts(tr, 'l', 'v'));
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
  if (tr.kind === 'regions') {
    // 🔀 刀 54 段内分区接管：复合 leaf 产**单个 SFC** —— 相对定位容器（高=段锚真值，
    //   内容全绝对定位不占流）+ kv 区绝对定位 grid（单元构造复用 kvgrid 分支同一
    //   helper，禁第二份）+ text 区逐成员绝对定位 span。text members 分散在 kv 区
    //   上下 ⇒ 只能逐成员定位，不可按 region 顺序块装（区域框仅为外框）。
    const cls = `c-${sem}-fg-regions-${idSlug(tr.sectionId)}`;
    const kvCls = `${cls}-kv`;
    const kv = tr.kv;
    const gridStyle = [
      `position:absolute;left:${kv.x}px;top:${kv.y}px;width:${kv.w}px`,
      'display:grid',
      `grid-template-columns:repeat(${kv.cols}, max-content)`,
      `justify-content:${kv.justify}`,
      kv.colGap > 0 ? `column-gap:${kv.colGap}px` : '',
      kv.rowGap > 0 ? `row-gap:${kv.rowGap}px` : '',
      'align-content:start',
      'align-items:start',
    ].filter(Boolean).join(';');
    const lines = [
      '<template>',
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="position:relative;min-width:0;${tr.height ? `height:${tr.height}px;` : ''}padding:0;">`,
      `    <div class="${kvCls}" style="${gridStyle};">`,
    ];
    lines.push(...fgKvCellLines(kv, kvCls, 'kvl', 'kvv'));
    lines.push('    </div>');
    tr.textRuns.forEach((r, i) => {
      const multiline = Boolean(r.multiline);
      lines.push(
        `    <span class="${cls}-rt" style="position:absolute;left:${r.x}px;top:${r.y}px;${multiline ? `width:${r.w}px;` : ''}color:${r.color};font-size:${r.fs}px;font-weight:${r.fw};line-height:${r.lh}px;white-space:${multiline ? 'normal' : 'nowrap'};">{{ rt${i} }}</span>`,
      );
    });
    lines.push('  </div>', '</template>', '', '<script setup>');
    lines.push(...fgKvCellConsts(kv, 'kvl', 'kvv'));
    tr.textRuns.forEach((r, i) => {
      lines.push(`const rt${i} = ${jsonStr(r.text)}`);
    });
    lines.push(
      '</script>',
      '',
      '<style lang="less" scoped>',
      `.${cls} { min-width: 0; }`,
      `.${cls}-rt { display: block; }`,
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
    // 🛡️ P3：面板真值（底色/圆角/发光/满宽）自持 —— `tr.panelCss` 由 collectFoldedGridTakeover
    //   注入（判据同源 container-background-truth#buildPanelInlineCss）。为空 ⇒ 无前缀 ⇒ 逐字不变。
    const panelStyle = tr.panelCss ? `${tr.panelCss};` : '';
    return [
      '<template>',
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="${panelStyle}display:flex;align-items:center;justify-content:center;min-width:0;padding:0;">`,
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
    // 🛡️ P3：面板真值自持（同 icon 分支；判据同源，见 collectFoldedGridTakeover 注入点）。
    //   为空 ⇒ 无前缀 ⇒ 根 div 逐字不变（fail-open 零回归）。
    const panelStyle = tr.panelCss ? `${tr.panelCss};` : '';
    // 🔴 font-size 放**内联 style 属性**（round-16 推翻 round-10 结论）：
    //   微码预览运行时里 SFC scoped style 块**不生效**（54 个 stylesheet 无 fg- 规则），
    //   放 style 块 = 字号塌回继承值；放内联则依赖归一器的 fg- 标签内联保护
    //   （font-size-normalizer#protectFgTagInlineStyles，单点豁免）。
    // 🔴 内联必须钉死 flex-direction:row：布局事实注入器会给宿主 class 写
    //   `flex-direction:column`（内联没钉的属性 class 就能赢，round-10 实锤）。
    return [
      '<template>',
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="${panelStyle}display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:${tr.gap}px;height:${tr.height}px;padding:0;">`,
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
  // 🔴 footer 汇总条（刀53h）：判据侧零几何（`sourceNodeIds=[]`）⇒ 渲染只落**段真值**
  //   （每 part 的文本/色值/字号/字重）与图条背景，绝不编造尺寸/间距。
  //   结构性布局取 `row + space-between`：这是**本 kind 的布局判断**（左「文本指标」/
  //   右「统计数值」是 footer 汇总条的通用读法），不是从真值推导的几何；真值里既无
  //   figmaBox 也无 itemSpacing ⇒ 任何 px 间距都会是臆造，故一个都不写。
  //   🔴 图条 URL 必须走 `:style` 绑定（593cf7f / 刀53d 同一铁律）：静态 style 是纯 CSS
  //   文本，`bg1` 不会被求值 ⇒ 浏览器拿到相对 URL `url(bg1)` → 404 → 整条零背景。
  //   两段属性不重叠（静态段只有 size/position/repeat），Vue 合并时互不覆盖。
  if (tr.kind === 'footer') {
    const cls = `c-${sem}-fg-footer-${idSlug(tr.sectionId)}`;
    const bg = tr.bg && tr.bg.varName ? tr.bg : null;
    const bgStatic = bg
      ? `background-size:${bg.style.size};background-position:${bg.style.position};background-repeat:${bg.style.repeat};`
      : '';
    const bgBind = bg
      ? ` :style="{ backgroundImage: 'url(' + ${bg.varName} + ')' }"`
      : '';
    const groupLit = tr.groups.map(
      (g, i) =>
        `  { parts: [${g.parts
          .map(
            (p) =>
              `{ t: ${jsonStr(p.t)}, c: ${p.c ? jsonStr(p.c) : 'null'}, fs: ${p.fs ?? 'null'}, fw: ${p.fw ? jsonStr(p.fw) : 'null'} }`,
          )
          .join(', ')}] }${i < tr.groups.length - 1 ? ',' : ''}`,
    );
    const lines = [
      '<template>',
      `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:flex;flex-direction:row;align-items:center;justify-content:space-between;width:100%;min-width:0;box-sizing:border-box;${bgStatic}"${bgBind}>`,
      `    <div v-for="(g, __i) in FG_FOOTER_GROUPS" :key="__i" style="display:flex;flex-direction:row;align-items:center;min-width:0;">`,
      // 🔴 `white-space:pre` 而非 nowrap：真值 label 带**尾空格**（`'接入设备 '`），
      //   nowrap 下尾空格会被行盒吃掉 ⇒ label 与 value 粘连。`pre` 保留真值空格，
      //   「间距」这一视觉事实就由真值自身承载，无需猜 gap。
      `      <span v-for="(p, __j) in g.parts" :key="__j" :style="{ color: p.c || undefined, fontSize: p.fs ? p.fs + 'px' : undefined, fontWeight: p.fw || undefined, lineHeight: 1.2, whiteSpace: 'pre' }">{{ p.t }}</span>`,
      '    </div>',
      '  </div>',
      '</template>',
      '',
      '<script setup>',
    ];
    if (bg) {
      lines.push(`import ${bg.varName} from '../../resources/images/${bg.file}'`);
    }
    lines.push('const FG_FOOTER_GROUPS = [', ...groupLit, '];', '</script>', '', '<style lang="less" scoped>', `.${cls} { min-width: 0; }`, '</style>', '');
    return lines.join('\n');
  }
  const cls = `c-${sem}-fg-grid-${idSlug(tr.sectionId)}`;
  // 🔴 RC3（2026-11-05 · 与 RC2 同一单）：`cardTruth` 落到图片通道后，本分支必须能消费
  //   它 —— 否则接管产物的卡底是 `background: null`（比不接管更糟）。
  //   口径与 list item **完全一致**：唯一 import 变量池（同资源去重共用一个 import），
  //   每项只持**变量下标** + 自己的四件套（`inferBackgroundStyle` 真值），不拼静态资源文本。
  //   无任何图片项 ⇒ `bgVars` 为空 ⇒ 产物**逐字不变**（阴性零回归是结构保证）。
  const bgVars = [];
  const varIndex = new Map();
  const itemBgIdx = (Array.isArray(tr.items) ? tr.items : []).map((it) => {
    const b = it?.bgImage;
    if (!b?.varName || !b.file) return null;
    if (!varIndex.has(b.varName)) {
      varIndex.set(b.varName, bgVars.length);
      bgVars.push({ varName: b.varName, file: b.file });
    }
    return varIndex.get(b.varName);
  });
  const hasImg = bgVars.length > 0;
  const cardImgBind = hasImg
    ? ", backgroundImage: it.bgImg == null ? undefined : 'url(' + FG_GRID_BGS[it.bgImg] + ')', backgroundSize: it.bgImg == null ? undefined : it.bgSize, backgroundRepeat: it.bgImg == null ? undefined : it.bgRepeat, backgroundPosition: it.bgImg == null ? undefined : it.bgPosition"
    : '';
  // 🛡️ 刀55（2026-11-05 · c-device-monitor-8f4dfed9 / 89c25985 双实锤）：卡内 icon 资源池。
  //   与 bgVars 同构：唯一 import 变量 + 去重下标（593cf7f 铁律：资源变量绝不拼静态文本，
  //   经 `FG_GRID_ICONS[it.icon]` 数组绑定求值）。无 icon 项 ⇒ iconVars 空 ⇒ 无 import、
  //   无数组、模板无 `<img>` 行（下方条件展开）⇒ 产物**逐字不变**（RC3 同款结构保证）。
  const iconVars = [];
  const iconVarIndex = new Map();
  const itemIconIdx = (Array.isArray(tr.items) ? tr.items : []).map((it) => {
    const ic = it?.icon;
    if (!ic?.varName || !ic.file) return null;
    if (!iconVarIndex.has(ic.varName)) {
      iconVarIndex.set(ic.varName, iconVars.length);
      iconVars.push({ varName: ic.varName, file: ic.file });
    }
    return iconVarIndex.get(ic.varName);
  });
  const hasIcon = iconVars.length > 0;
  // 🧱 卡内文本列方向：只有**全部卡一致**为 column 才启用（混排时不猜，逐字保持旧结构）。
  const hasTextColumn =
    tr.items.length > 0 && tr.items.every((it) => it.textDir === 'column');
  const stackGapPx = tr.items[0]?.stackGap;
  const textColGap =
    Number.isFinite(stackGapPx) && stackGapPx > 0 ? `gap:${stackGapPx}px;` : '';

  const lines = [
    '<template>',
    // 🔴 justify-content 必须显式内联：只要有写作者（LLM/注入器）给宿主 class 写
    //   `justify-content:space-between`，列不满时第二排卡会被甩到行末尾（round-11 实锤，
    //   战略段第二行「天地伟业」跑到右侧）。真值一律左起排布。
    `  <div data-section-id="${tr.sectionId}" class="${cls}" style="display:grid;justify-content:start;grid-template-columns:repeat(${tr.cols}, ${tr.cardW}px);grid-auto-rows:${tr.cardH}px;column-gap:${tr.colGap}px;${tr.rows > 1 && tr.rowGap !== null ? `row-gap:${tr.rowGap}px;` : ''}align-content:start;align-items:stretch;">`,
    `    <div v-for="(it, i) in items" :key="i" class="${cls}-card" :style="{ background: it.bg, borderRadius: it.r + 'px', paddingLeft: it.pad + 'px', gap: it.gap + 'px'${cardImgBind} }">`,
    // 🛡️ 刀55：前导 icon（真值几何 w/h；pad/gap 已在 cardTruth 改写为 icon 左缘/间距）。
    //   条件展开：无 icon 项 ⇒ 本行整行不存在 ⇒ 产物逐字不变。
    ...(hasIcon
      ? [
          `      <img v-if="it.icon != null" :src="FG_GRID_ICONS[it.icon]" :style="{ width: it.iw + 'px', height: it.ih + 'px', flex: '0 0 auto' }" />`,
        ]
      : []),
    // 🧱 2026-11-08（mc-1794143134686 实锤）：文本列方向按 Figma 几何还原。
    //   真值 `摄像机`(39,13) 与 `(2/484)`(39,35) 是 **x 对齐 + y 递增** 的竖排两行；
    //   旧模板固定 flex(row) ⇒ 两行被拉成一行，数值右边界超出卡宽 21px 被裁。
    //   现按 `textDir` 决定：column ⇒ 包一层竖排 text 列（垂直 gap 用真值 stackGap）；
    //   row（默认/单文本/无法判定）⇒ 逐字保持旧结构，阴性零回归。
    ...(hasTextColumn
      ? [
          `      <div class="${cls}-text" style="display:flex;flex-direction:column;${textColGap}min-width:0;">`,
          `        <span v-for="(t, ti) in it.runs" :key="ti" :style="{ color: t.color, fontSize: t.fs + 'px', fontWeight: t.fw, lineHeight: 1, whiteSpace: 'nowrap' }">{{ t.text }}</span>`,
          '      </div>',
        ]
      : [
          `      <span v-for="(t, ti) in it.runs" :key="ti" :style="{ color: t.color, fontSize: t.fs + 'px', fontWeight: t.fw, lineHeight: 1, whiteSpace: 'nowrap' }">{{ t.text }}</span>`,
        ]),
    '    </div>',
    '  </div>',
    '</template>',
    '',
    '<script setup>',
    ...bgVars.map((v) => `import ${v.varName} from '../../resources/images/${v.file}'`),
    ...iconVars.map((v) => `import ${v.varName} from '../../resources/images/${v.file}'`),
    `const items = ${inlineJson(
      tr.items.map((it, i) => {
        const base = { bg: it.bg, r: it.r, pad: it.pad, gap: it.gap, runs: it.runs };
        let out = base;
        if (hasImg) {
          const b = it.bgImage;
          out = {
            ...out,
            bgImg: itemBgIdx[i],
            bgSize: b?.style?.size ?? null,
            bgRepeat: b?.style?.repeat ?? null,
            bgPosition: b?.style?.position ?? null,
          };
        }
        // 🔴 刀55：icon 项带下标 + 尺寸真值（w/h）；无 icon 项不写字段（阴性逐字不变）
        if (hasIcon && itemIconIdx[i] != null) {
          out = { ...out, icon: itemIconIdx[i], iw: it.icon.w, ih: it.icon.h };
        }
        return out;
      }),
    )}`,
    ...(hasImg ? [`const FG_GRID_BGS = [${bgVars.map((v) => v.varName).join(', ')}];`] : []),
    ...(hasIcon ? [`const FG_GRID_ICONS = [${iconVars.map((v) => v.varName).join(', ')}];`] : []),
    '</script>',
    '',
    '<style lang="less" scoped>',
    `.${cls} { min-width: 0; }`,
    `.${cls}-card { display: flex; align-items: center; min-width: 0; overflow: hidden; box-sizing: border-box; }`,
    ...(hasTextColumn ? [`.${cls}-text { min-width: 0; }`] : []),
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
 *            footerHits: number,
 *            skipped: Array<{id:string, reason:string}> }}
 */
/**
 * 🔴 R6（2026-11-02 · mc-max-1793601903166-9e078c6a「合作厂商弹窗」复跑实锤）：
 * 接管形态 vs 段声明**内容对账**。
 *
 * 病灶：vision 在 `body.children` 里完整声明了段内容（厂商段 6/12/15 个 pill 文本、
 * 统计段 2 张卡），但 header 接管只渲染「1 标题 + 1 图标」、icon 接管只渲染「1 图标」
 * —— 声明内容被**确定性丢弃**，零告警、不回退 LLM（接管命中即终点）。
 * 与 R3 的区别：R3 治「refs 落在锚点子树之外」（几何撕裂）；本判据治「命中形态消费量 ≪
 * 段声明内容量」（消费对账缺失）——后者在 kids 无 figma id（refs=∅）或声明即锚时天然
 * 是 R3 盲区（本单 `scopeIncomplete=0` 而 `header:3,icon:1` 即此型）。
 *
 * 判据（可辩驳、类型无关、命名无关）：
 *   · `header` 消费 1 个标题文本 ⇒ 段声明中**带文本**的 item ≥2 ⇒ 拒（回退 LLM）
 *   · `icon` 消费 1 个图标 ⇒ 段声明 item 总数 ≥2 ⇒ 拒
 *   · 其余形态（grid/list/statrow/table/legend/kvgrid/footer/text）结构性消费全部成员，不对账
 * 纪律：声明内容必须被消费或显式计数放弃（`declaredUnconsumed`），**禁止静默丢弃**。
 * 纯函数；段无声明 kids（⌀）⇒ 0（不改变既有行为，旧 spec 的无 kids fixture 逐字不变）。
 */

/** 段声明的直接内容 items（与 planner `sectionChildrenOf` 同 OR 语义：取首个非空数组）。 */
function collectDeclaredItems(sec) {
  if (!sec || typeof sec !== 'object') return [];
  const body = sec.body;
  // 🔴 R8-7：`declaredContent` 是 assembler 透传的段内容契约（与 body 表头契约分键，
  //   见 generation-context-assembler#normalizeBodyContract）。优先级最高——它是唯一
  //   保证穿过 generationInput.componentPlan 白名单的内容来源。
  const declared = sec.declaredContent;
  const arr =
    (Array.isArray(declared?.children) && declared.children) ||
    (Array.isArray(declared?.items) && declared.items) ||
    (Array.isArray(declared?.elements) && declared.elements) ||
    (Array.isArray(body?.children) && body.children) ||
    (Array.isArray(body?.items) && body.items) ||
    (Array.isArray(body?.elements) && body.elements) ||
    (Array.isArray(sec.children) && sec.children) ||
    (Array.isArray(sec.items) && sec.items) ||
    (Array.isArray(sec.elements) && sec.elements) ||
    [];
  return arr.filter((k) => k && typeof k === 'object');
}

/**
 * 🔴 R6-2（2026-11-02 · mc-max-1793605825777-d30d888c 实锤）：声明**内容量**递归收集。
 *
 * 病灶：`itemHasText` 字段枚举是 R6 的第四次变异盲区——vision 这次把文本载体写在
 * `name`/`value`（vendor-card），`textBearing=0` ⇒ 对账放行 ⇒ 三厂商段空壳。
 * 治本：对账口径与「vision 把字段叫什么」解耦——递归收集声明树里全部**文本形字符串叶子**：
 *   · 文本候选键：`text/texts/characters/name/value/label/title`（声明 children 树内全收，
 *     段级 name 不在树内天然不收）；
 *   · 值形态过滤：HEX/rgba()/hsl()/var()/url()/data:/相对|绝对路径/资源扩展名 ⇒ 非文本
 *     （`#F0F0F0`、`rgba(51,51,51,1)`、`../resources/images/icon.png` 不计入）；
 *   · 只沿 `children/items/elements` 递归（与 `collectDeclaredItems` 同族键），不进
 *     `styles` 等样式对象；有界（depth≤12）+ visited 防环（与 I-3 `collectSectionBodyTexts` 同纪律）。
 * 纯函数；计数行铁律的口径升级——不变式是「声明内容必须被消费或显式计数放弃」。
 */
const MASS_TEXT_KEYS = new Set(['text', 'texts', 'characters', 'name', 'value', 'label', 'title']);
// 🔴 R8-7（2026-11-02 · dea074f9 实锤）：补 `content` / `parts` 两个容器键。
//   本单 vision 把厂商文本放在 `items[].content.parts[].text`、统计卡文本放在
//   `body.children[].content.elements[].text` —— 旧三键递归不到 ⇒ mass 只能靠 item 级
//   `name` 兜住（38:3260 的 33/66 完全漏计）。键集合与 assembler 的 normalizeBodyNode
//   容器白名单**同族**（content 对象 + parts 数组），判据同构单一来源。
const MASS_CHILD_KEYS = ['children', 'items', 'elements', 'content', 'parts'];
const MASS_NON_TEXT_VALUE_RE = /^(#(?:[0-9a-f]{3,8})\b|rgba?\(|hsla?\(|var\(|url\(|data:|https?:|\/|\.\?\/)/i;
const MASS_ASSET_EXT_RE = /\.(png|jpe?g|svg|gif|webp|ico)$/i;

function isMassTextValue(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s) return false;
  if (MASS_NON_TEXT_VALUE_RE.test(s)) return false;
  if (MASS_ASSET_EXT_RE.test(s)) return false;
  return true;
}

function declaredTextMass(node, depth = 0, visited = null) {
  if (!node || typeof node !== 'object' || depth > 12) return 0;
  if (visited === null) visited = new Set();
  if (visited.has(node)) return 0;
  visited.add(node);
  let mass = 0;
  for (const [k, v] of Object.entries(node)) {
    if (!MASS_TEXT_KEYS.has(k)) continue;
    if (isMassTextValue(v)) mass += 1;
    else if (Array.isArray(v)) mass += v.filter(isMassTextValue).length;
  }
  for (const ck of MASS_CHILD_KEYS) {
    const v = node[ck];
    // 🔴 R8-7：`content` 是**对象**容器（其 parts/elements 才是文本数组），不是数组 ——
    //   旧实现只认数组 ⇒ 对象容器被静默跳过。数组/对象两种容器形态都递归。
    if (Array.isArray(v)) {
      for (const child of v) {
        if (child && typeof child === 'object') mass += declaredTextMass(child, depth + 1, visited);
      }
    } else if (v && typeof v === 'object') {
      mass += declaredTextMass(v, depth + 1, visited);
    }
  }
  return mass;
}

/**
 * @returns {number} 该形态未消费的声明 item 数（0 = 对账通过，接管可落地）
 */
function declaredUnconsumedCount(sec, kind) {
  const items = collectDeclaredItems(sec);
  if (items.length === 0) return 0; // 无声明 ⇒ 无对账（fail-open，既有行为逐字不变）
  // 🔴 R6-2：内容量守恒口径（itemHasText 字段枚举判空的第四次变异已实锤）。
  //    mass = 声明树全部文本形字符串叶子数；header/icon 各消费 1 个标题/图标载体。
  const mass = declaredTextMass({ children: items });
  if (kind === 'header') {
    return Math.max(0, mass - 1); // header 只消费 1 个标题
  }
  if (kind === 'icon') {
    // 保留旧 items 枚举下限（多 icon 无文本段不被新口径漏放），mass 兜 name/value 深层载体
    return Math.max(0, Math.max(items.length - 1, mass - 1));
  }
  return 0;
}

export function collectFoldedGridTakeover(p = {}) {
  // 🔴 R3：scope-incomplete 段计数（0 也必须出现 —— 计数行铁律，防「判据失效」与「真没问题」不可辨）
  // 🔴 R6：接管形态 vs 段声明消费对账拒修计数（同上，0 也必须出现）
  const out = { map: new Map(), evaluated: 0, headerHits: 0, gridHits: 0, textHits: 0, iconHits: 0, legendHits: 0, kvGridHits: 0, listHits: 0, listRow: 0, listColumn: 0, listDirectionOverrides: 0, listItemBg: 0, listItemBgDeclared: 0, listItemBgSubtree: 0, listItemBgSkipped: 0, listTextsFilled: 0, listTextsEmpty: 0, listTextsAllEmptySections: 0, listSatelliteTexts: 0, listSatelliteSections: 0, listSatelliteFail: 0, listSatelliteFailSamples: [], listCardHIconFallbackRejected: 0, listTextPairsInline: 0, listTextPairsStacked: 0, listTextPairsConflict: 0, iconFromMapping: 0, iconTextUnmatched: 0, statRowHits: 0, statRowSuppressed: 0, tableHits: 0, tableSuppressed: 0, tableAnchorRepairs: 0, tableStructVeto: 0, footerHits: 0, regionHits: 0, scopeIncomplete: 0, declaredUnconsumed: 0, panelBgTried: 0, panelBgInjected: 0, cardIconEvaluated: 0, cardIconHit: 0, cardRowEvaluated: 0, cardRowOrderFixed: 0, listGeoNegGapClamped: 0, listGeoGeoNotReady: 0, listGeoRelaxed: 0, listGeoWidthNotUniform: 0, listGeoGeomPicked: 0, listGeoSpanRejected: 0, listGeoInnerStacked: 0, listGeoInnerInline: 0, listGeoInnerConflict: 0, listGeoValuePartsInline: 0, listGeoValuePartsStacked: 0, listGeoSamples: [], chartOwned: 0, chartOwnedIds: [], skipped: [] };
  const treeSections = Array.isArray(p.treeSections) ? p.treeSections : [];
  if (!treeSections.length) return out;
  // 🛡️ F1（2026-11-05 · mc-max-1793869867060-e23b0b40 实锤）：vision `charts[]` 段归属集合。
  //   病灶：本文件判据只看「同构标题行 + 折叠网格」结构形态，**对 charts[] 零感知** ⇒
  //   环形图段（标题行 + 两个圆环容器并排）在结构上被判成折叠网格 ⇒ `kind=table`
  //   确定性接管（整文件不进 LLM chunk）⇒ 产物是 `<a-table>`、全产物无 pie/doughnut
  //   series ⇒ `DO-NOT-INVENT-CHART-MISSING`(BLOCK) ⇒ 任务失败（e23b0b40 实锤：
  //   vision 明确记录 `2:3438 = 环形图`，产物却是表格）。
  //   判据：vision 声明该段有图表的，**一律不接管**，fail-open 回 LLM 图表生成路径
  //   （G3 的 chart 接管器未实施，此处只做「不抢占」，不承诺生成）。
  //   归一：vision 历史上产出过 `chart-2:7989` 前缀形态（2026-11-04 父级孤儿 echarts
  //   方案实测 id 失锚），故剥 `chart|table|list` 前缀再比对；段的**全部锚点候选**
  //   任一命中即判冲突（宁可放过，不可误接管）。
  const _chartNorm = (v) => String(v == null ? '' : v).trim().replace(/^(chart|table|list)-/i, '');
  const _chartOwned = new Set(
    (Array.isArray(p.analysisCharts) ? p.analysisCharts : [])
      .map((c) => _chartNorm(c?.section ?? c?.sectionId ?? c?.figmaSectionId ?? ''))
      .filter(Boolean),
  );
  out.chartOwnedIds = [..._chartOwned];
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
    // 🛡️ F1：图表段不参与结构接管（判据见函数入口 `_chartOwned` 注释）。
    //   必须放在**所有 kind 判据之前** —— 网格/统计行/表格都能吃下环形图段的结构形态，
    //   放在后面等于白加。
    if (_chartOwned.size > 0) {
      const _anchors = sectionAnchorCandidates(sec).map(_chartNorm).filter(Boolean);
      if (_anchors.some((k) => _chartOwned.has(k))) {
        out.chartOwned += 1;
        out.skipped.push({ id: String(sec.id), reason: 'chartOwned' });
        continue;
      }
    }
    // 🔴 R3：超界段观测计数（段级、与是否实际命中无关 —— 分母口径，真机日志可见）
    if (isScopeIncomplete(sec, figmaIndex)) out.scopeIncomplete += 1;
    // 🔴 判定顺序：网格 → 标题行 → **统计行** → 表格 → 纯文本 → 纯 icon → 图例
    //    （刀 53b/53c/53d/53e/53f/53g/53h）—— 互斥域递减（cards≥2 / 1 TEXT+已映射 icon /
    //    兄弟同构 N 元组 / 同表多列 / 线性 N TEXT 无图形 / 0 TEXT 且已导出 PNG /
    //    1 ELLIPSE + 1 TEXT 的 ≥2 组同构 / 段契约声明 footer）。统计行/表格必须**早于**
    //    text/icon：它们的成员各自含 2 个 TEXT；即使成员几何可被线性 text 接管，父级
    //    聚类判据也更严格，先判可锁定整行/整表归属。图例/属性网格/footer **放最后**：
    //    与 text/icon 两两互斥，末位 ⇒ 结构上不可能抢走既有命中（只救原本被 skip 的叶，
    //    footer-summary 实测即此类）。
    let tr = detectGridLeaf(sec, figmaIndex, p.resourceMapping);
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
            // 🔴 P0-3 计数行铁律：结构签名否决计数（0 也必须出现），否则「判据失效」
            //   与「真没问题」不可辨。否决时跳过 table 分支继续后续检测（fail-open）。
            if (typeof tb?.reason === 'string' && tb.reason.startsWith('memberSubtreeBlocked:')) {
              out.tableStructVeto += 1;
              out.skipped.push(`table-struct-veto:${sec.id}:${tb.reason}`);
            }
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
                // 🔴 footer（刀 53h）在 kvgrid 之后、**最后一个**：判据是段契约
                //   （`declaredSectionType==='footer'` / id 前缀 `footer-`）而非几何，
                //   放末位 ⇒ 只救「九类全 fail」的叶，结构上不可能抢走既有命中。
                const kv = detectKvGridLeaf(sec, figmaIndex);
                if (kv.ok) tr = kv;
                else {
                  // 🔴 footer 汇总条（刀53h）**必须放末位**：判据是「段契约显式声明 footer」
                  //   （`declaredSectionType==='footer'` 或 id 前缀 `footer-`），与前九类逐一
                  //   互斥；放末位 ⇒ 只有前九类全 fail 才轮到它 ⇒ **结构上不可能抢走既有
                  //   命中**（阴性零误伤由「位置」保证，不靠断言兜；与 legend/kvgrid 同一论证，
                  //   且更弱的前提即可成立）。目标病灶 footer-summary 实测被九类全 skip
                  //   （noAnchorNode / kvPairs=0 / notCollapsedList …）⇒ 置于此位零漂移。
                  const ft = detectFooterSummaryLeaf(sec, p.resourceMapping);
                  if (ft.ok) tr = ft;
                  else {
                    // 🔀 刀 54 段内分区接管（2026-11-03）：检测链**最末位** ——
                    //   十类（grid/header/statrow/table/list/text/icon/legend/kv/footer）
                    //   全 fail 的复合叶才轮到它，结构上不可能抢走既有命中（宁漏勿错）。
                    //   整段二选一会丢内容的复合段按几何分互斥子区逐区渲染；任一子区
                    //   判据不过 ⇒ 整段 fail-open 交 LLM。
                    const rg = detectRegionCompositeLeaf(sec, figmaIndex);
                    if (rg.ok) {
                      tr = rg;
                      // 🔴 判据行铁律：真机可 grep 的命中计数（regions=N = 子区数）。
                      p.logger?.info?.('🔀 段内分区接管', {
                        leaf: String(sec.id),
                        regions: rg.regionCount,
                        kvCells: rg.kv.cells.length,
                        textRuns: rg.textRuns.length,
                      });
                    } else {
                      out.skipped.push({ id: String(sec.id), reason: `grid:${tr.reason};header:${h.reason};statrow:${sr.reason};table:${tb.reason};list:${ls.reason};text:${t.reason};icon:${ic.reason};legend:${lg.reason};kv:${kv.reason};footer:${ft.reason};regions:${rg.reason}` });
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
      }
    }
    // 🔴 R6：接管形态 vs 段声明对账 —— 命中形态消费不了段声明的内容 ⇒ 拒、回退 LLM、计数。
    //   禁止「命中即终点」的静默裁没（9e078c6a：vision 声明 6/12/15 个 pill 被 header 形态
    //   整段丢弃、2 张统计卡被 icon 形态丢成 1 图标，均零告警）。
    const unconsumed = declaredUnconsumedCount(sec, tr.kind);
    if (unconsumed > 0) {
      out.declaredUnconsumed += 1;
      out.skipped.push({ id: String(sec.id), reason: `${tr.kind}:declaredUnconsumed(${unconsumed})` });
      continue;
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
    else if (tr.kind === 'list') {
      out.listHits += 1;
      if (tr.direction === 'row') out.listRow += 1;
      else out.listColumn += 1;
      // 🛡️ G4（2026-11-04 · c7d56bd7 FG_LIST_ITEMS texts:[] 实锤）：文本可观测性恒计——
      //   textsFilled/textsEmpty 0 也打；textsAllEmpty 段数单列（行文本断供嫌疑，
      //   文本全在 stats 或采集缺失），不再静默。
      out.listTextsFilled += Number(tr.textsFilled || 0);
      out.listTextsEmpty += Number(tr.textsEmpty || 0);
      if (tr.textsAllEmpty) out.listTextsAllEmptySections += 1;
      // 🔴 A（2026-11-12）：段级附属文本可见化 —— 恒打（0 也打）。
      //   `listSatelliteTexts=0` 且真机段有段级文本 ⇒ 判据未取到（假绿）；`listSatelliteFail>0`
      //   且含 undecidable ⇒ 几何裁决不确定，已 fail-open 交 LLM（不静默丢）。
      if (tr.satellite?.ok) {
        const sc = Number(tr.satellite.count || 0);
        out.listSatelliteTexts += sc;
        if (sc > 0) out.listSatelliteSections += 1;
      } else {
        out.listSatelliteFail += 1;
        if (out.listSatelliteFailSamples.length < 8) {
          out.listSatelliteFailSamples.push(`${String(sec.id)}=${String(tr.satellite?.reason || 'unknown')}`);
        }
      }
      // 🔴 G11b：mapping 文本归位计数恒打（iconFromMapping>0 而产物 icon 仍 null ⇒ 模板/数据未消费）
      out.iconFromMapping += Number(tr.iconFromMapping || 0);
      out.iconTextUnmatched += Number(tr.iconTextUnmatched || 0);
      // 🔴 刀55 计数行铁律：几何翻案声明/缺省的次数必须真机可 grep（0 也打）——
      //   若恒 0 说明新判据从未生效（塞入参=假绿的形状），若暴涨说明几何判据误伤。
      if (String(tr.directionSource || '').startsWith('geometry-overrides')) out.listDirectionOverrides += 1;
      const declared = Number(tr.itemBgStats?.declared || 0);
      const subtree = Number(tr.itemBgStats?.subtree || 0);
      out.listItemBgDeclared += declared;
      out.listItemBgSubtree += subtree;
      out.listItemBgSkipped += Number(tr.itemBgStats?.skipped || 0);
      out.listItemBg += declared + subtree;
      // 🔴 2026-11-03（步①②）：列表几何真值可见化 —— 与刀55「几何翻案次数必 grep」同款铁律。
      //   `listGeoNegGapClamped`：负间距被总闸拦下的段数。0 而产物仍含负值 ⇒ 判据未生效。
      //   `listGeoGeoNotReady`：异宽/异高致 `geoReady=false` 的段数 —— 过去是静默降级，
      //     与「设计本就无间距」不可区分（§9.3 结论 3），必须挂出来。
      //   `listGeoWidthNotUniform`（步③）：row 且「回退盒 + 异宽」⇒ 横向几何未下发的段数。
      //     0 而产物仍含 `FG_LIST_WIDTHS` 异宽值 ⇒ 判据未生效。
      //   `listGeoSamples`（封顶 8）：留真值现场（`rawW`/`rawX`=帧盒几何真值，
      //     `widths`=实际下发，`neg`=clamp 前的原始负值）—— 被拦下后仍可完整回溯。
      const lg = tr.listGeo || null;
      if (lg) {
        // 🔴 G9（2026-11-04）：icon 回退盒污染致几何拒下发的段数 —— 0 也打；
        //   >0 且产物仍有 cardH/widths ⇒ 判据未生效（或有第二写路径）。
        if (lg.iconFallbackPolluted) out.listCardHIconFallbackRejected += 1;
        if (lg.negGapClamped) out.listGeoNegGapClamped += 1;
        if (!lg.geoReady) out.listGeoGeoNotReady += 1;
        // 🛡️ 2026-11-06（64a1a31f 实锤）：「近似相似带」生效段数 —— 0 也打。
        //   relaxed>0 ⇒ 容差救了「混源盒集/选中态描边」样本（正是本次病灶形态）；
        //   relaxed=0 且 geoNotReady=0 ⇒ 全是精确等值样本（容差未被需要）；
        //   relaxed=0 且 geoNotReady>0 ⇒ 真异形，不是容差没生效。
        if (lg.relaxed) out.listGeoRelaxed += 1;
        if (lg.widthNotUniform) out.listGeoWidthNotUniform += 1;
        // 🔴 步④：几何锚（按几何选可见底）命中段数 + 跨度自校验拒绝段数。
        //   `geomPicked>0` ⇒ 颜色锚结构性失效的样本已被几何锚救回（真机病灶即此类）；
        //   `spanRejected>0` ⇒ 几何锚误选并被兜底拦下（是自校验生效的证据，不是故障）。
        //   `geomPicked>0 && !spanRejected` 才是「几何锚**生效**」；被自校验拦下的段只计 spanRejected。
        if (lg.geomPicked > 0 && !lg.spanRejected) out.listGeoGeomPicked += 1;
        if (lg.spanRejected) out.listGeoSpanRejected += 1;
        // 🔴 步⑤（P0-2）：卡内布局真值落地分布。`innerInline` 仅确认现状（不重排），
        //   `innerStacked` 才真正改渲染结构 ⇒ 误判定性：只有 stacked 会改变产物形态。
        //   `innerConflict` ⇒ 各卡投票不一致被拦（判据在工作，不是故障）。
        if (lg.innerDir === 'stacked') out.listGeoInnerStacked += 1;
        else if (lg.innerDir === 'inline') out.listGeoInnerInline += 1;
        if (lg.innerConflict) out.listGeoInnerConflict += 1;
        // 🔴 G8：texts 条目间方向分布（0 也打；inline>0 而产物仍纵堆 ⇒ 模板未消费）
        if (lg.textPairsDir === 'inline') out.listTextPairsInline += 1;
        else if (lg.textPairsDir === 'stacked') out.listTextPairsStacked += 1;
        if (lg.textPairsConflict) out.listTextPairsConflict += 1;
        if (lg.valuePartsDir === 'inline') out.listGeoValuePartsInline += 1;
        else if (lg.valuePartsDir === 'stacked') out.listGeoValuePartsStacked += 1;
        if (out.listGeoSamples.length < 8) {
          out.listGeoSamples.push({
            sectionId: String(tr.sectionId ?? ''),
            dir: lg.direction === 'row' ? 'row' : 'column',
            w: lg.cardW,
            h: lg.cardH,
            rawW: lg.rawWidths,
            rawX: lg.rawXs,
            boxW: lg.boxWidths,
            boxX: lg.boxXs,
            geom: lg.geomPicked,
            spanRej: !!lg.spanRejected,
            inner: lg.innerDir,
            innerProv: lg.innerProven,
            vParts: lg.valuePartsDir,
            vGap: lg.valuePartsGap,
            widths: lg.cardWidths,
            gaps: lg.gaps,
            neg: lg.negGapValues,
            wnu: !!lg.widthNotUniform,
          });
        }
      }
    }
    else if (tr.kind === 'kvgrid') out.kvGridHits += 1;
    // 🔴 刀53h 同 53g/20b 教训：新 kind **必须显式分支**，否则落进下面 `else` 被算成
    //   gridHits ⇒「gridHits 里有几个是 footer」不可辨 ⇒ 计数失真 = 假绿。
    else if (tr.kind === 'footer') out.footerHits += 1;
    // 🔴 刀 54 同 53g/53h/20b 教训：新 kind **必须显式分支**，否则落进 else 被算成
    //   gridHits ⇒ 计数失真 = 假绿。
    else if (tr.kind === 'regions') out.regionHits += 1;
    else out.gridHits += 1;
    // 🎯 [刀55] 接管卡片 icon 通道评估（2026-11-05 · 8f4dfed9/89c25985 实锤）。
    //   计数行铁律：**0 也打** —— `evaluated>0 && hit=0` 且产物卡内确有 icon 资源 ⇒
    //   判据失效（mapping 未接 / 几何过滤过严）；`hit>0` ⇒ 真机验签看产物 `<img>` 对数。
    //   只在带 items 的 tr（grid 族）上计：statrow/table 两阶段已 continue，list 的
    //   item 无 icon 字段（刀55 只扩 grid 卡），恒 0 不污染。
    if (Array.isArray(tr.items)) {
      out.cardIconEvaluated += tr.items.length;
      out.cardIconHit += tr.items.filter((x) => x?.icon).length;
      // 🛡️ [刀60] 卡内同行容差排序观测（2026-11-05 · 0ddd1708「8总设备」+pad:86 实锤）。
      //   计数行铁律：0 也打 —— `evaluated>0 && fixed=0` 只说明本批卡无同行拆序；
      //   `fixed>0` ⇒ 真机验签看产物 runs 语序与 pad 值。与刀55 cardIcon 同挂点同形态。
      out.cardRowEvaluated += tr.items.length;
      out.cardRowOrderFixed += tr.items.filter((x) => x?.rowOrderFixed).length;
    }
    // 🛡️ P3（2026-11-03）：icon / header 接管产物**自持**面板真值（底色/圆角/发光/满宽）。
    //   病灶：刀 53 终裁覆写（`file-writer.js` 以 `_fgTakeoverFiles` 快照整包替换）的快照
    //   拍于 LLM 分块之前，而刀 37/42 heal 跑在快照**之后** ⇒ 对本类文件的修复被整包回滚
    //   （全库实测 `fg-` 接管元素 icon `0/110`、header `0/219` 携带背景 = 铁证：同一病、新机制）。
    //   治本：渲染器自己写（heal 对非接管的 LLM 产物照旧生效，两路互补、判据同源）。
    //   🔴 只对 icon/header 生效：grid/statrow/table/list 的面板底由既有的 item/容器背景
    //   机制（刀 33/41）负责，实测已有背景（grid 102/204）；扩面会引入重排风险，故不扩。
    //   fail-open：无 panel 真值 ⇒ `panelCss=''` ⇒ 根 div 逐字不变（零回归）。
    if (tr.kind === 'icon' || tr.kind === 'header') {
      out.panelBgTried += 1;
      tr.panelCss = buildPanelInlineCss(resolveSectionPanel(tr.sectionId, figmaIndex));
      // 🔴 计数行铁律：`tried>0 而 injected=0` 正是「判据静默失效」（如索引形状不符）
      //   的形状，必须与「本来就没有面板真值」可辨 —— 0 也打（见 reject-summary 审计行）。
      if (tr.panelCss) out.panelBgInjected += 1;
    }
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
    // 🔴 P0-3（2026-11-11）：table 结构签名否决计数（@图表库标记 / bg-* 背景层）——0 也打。
    tableStructVeto: out.tableStructVeto,
    footerTaken: out.footerHits,
    regionsTaken: out.regionHits,
    listDirectionOverrides: out.listDirectionOverrides,
    // 🛡️ G4（2026-11-04 · c7d56bd7 texts:[] 实锤）：行文本可观测性——0 也打。
    listTextsFilled: out.listTextsFilled,
    listTextsEmpty: out.listTextsEmpty,
    listTextsAllEmptySections: out.listTextsAllEmptySections,
    // 🔴 A（2026-11-12）：段级附属文本（非 item 直属）物化计数——0 也打。
    listSatelliteTexts: out.listSatelliteTexts,
    listSatelliteSections: out.listSatelliteSections,
    listSatelliteFail: out.listSatelliteFail,
    listSatelliteFailSamples: out.listSatelliteFailSamples,
    // 🔴 2026-11-03：列表卡盒几何真值（负间距总闸 + geoReady 覆盖 + 步③ 异宽拦宽度）——0 也打。
    listGeoNegGapClamped: out.listGeoNegGapClamped,
    listGeoGeoNotReady: out.listGeoGeoNotReady,
    listGeoWidthNotUniform: out.listGeoWidthNotUniform,
    listGeoGeomPicked: out.listGeoGeomPicked,
    listGeoSpanRejected: out.listGeoSpanRejected,
    // 🔴 G9（2026-11-04 · 1de12f48 cardH=40 实锤）：icon 回退盒污染拒下发段数——0 也打。
    listCardHIconFallbackRejected: out.listCardHIconFallbackRejected,
    // 🔴 G8（2026-11-04 · a41a470f name/value 纵堆实锤）：texts 条目间几何投票分布。
    listTextPairsInline: out.listTextPairsInline,
    listTextPairsStacked: out.listTextPairsStacked,
    listTextPairsConflict: out.listTextPairsConflict,
    // 🔴 G11b（2026-11-04 · a41a470f icon 全 null 实锤）：mapping 文本归位计数。
    iconFromMapping: out.iconFromMapping,
    iconTextUnmatched: out.iconTextUnmatched,
    listGeoInnerStacked: out.listGeoInnerStacked,
    listGeoInnerInline: out.listGeoInnerInline,
    listGeoInnerConflict: out.listGeoInnerConflict,
    listGeoValuePartsInline: out.listGeoValuePartsInline,
    listGeoValuePartsStacked: out.listGeoValuePartsStacked,
    listGeoSamples: out.listGeoSamples.slice(0, 4),
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
