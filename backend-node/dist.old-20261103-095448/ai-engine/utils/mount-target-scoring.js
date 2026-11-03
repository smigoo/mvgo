/**
 * 🛡️ 挂载点评分（P1-3，2026-08-30）
 *
 * 背景：R8 —— 组件一 mc-max-1788065970150 日志实锤
 *   05:03:35 去重删掉 `tabs-section` 上的重复 bg2
 *   05:04:50 兜底又按关键词子串匹配把 bg2 挂回 `tabs-section`
 * 根因：**去重与兜底用了两套互不兼容的选型逻辑**
 *   - 去重按「关键词命中数」评分
 *   - 兜底按「关键词顺序 + 文件顺序」取第一个
 * 于是两者互相覆盖，整块背景永远挂在外层 section 上被拉成整条大背景。
 *
 * 本模块是**唯一**的挂载点评分真相源，`_dedupeBgMultiRefs`（去重）与
 * `_autoMountUnusedBackgrounds`（兜底）共用，杜绝打架。
 *
 * 三项信号：
 *   ① 语义距离（权重 3 / 2 / 1）：候选 class token 对 资源名 / mountTarget / figmaPath 上下文的覆盖率
 *   ② 尺寸契合：`figmaBox 面积 / parentBox 面积`，≥0.9 = 整块背景（铺满父容器）
 *   ③ 层级深度：模板嵌套深度，配合 ② 决定加减分——整块背景越深越好，局部小图越浅越好
 *
 * 抽成独立模块的目的：纯函数、可单测，不依赖 MicrocodeEngineer 实例。
 */

import { extractSfcTemplateRegion } from './sfc-template-extractor.js';

/**
 * 确定性锚命中时的评分哨兵值。
 * 正常评分上界 ≈ 3（语义名）+ 2（mountTarget）+ 1（figmaPath 上下文）+ 0.3×6（深度）
 * ≈ 7.8 —— 取 1000 保证「几何锚定」永远压过任何语义组合，又保持有限值
 * （`pickBestMountTarget` 用 `Number.isFinite` 过滤，不能返回 Infinity）。
 */
export const DETERMINISTIC_ANCHOR_SCORE = 1000;

/** 剥离 class 上的实例 ID 前缀（`c-mc-max-<ts>-<hex>-` / `c-mv-max-...`） */
export function stripInstanceClsPrefix(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^c-(?:mc|mv)-max-\d{10,}-[a-z0-9]+-/i, '');
}

/** 剥离 class 上的组件名前缀（由根容器 class 推断，如 `c-env-monitor-`） */
export function stripMountClsPrefix(cls, componentPrefix) {
  const base = stripInstanceClsPrefix(cls);
  const p = String(componentPrefix || '').toLowerCase();
  if (p && base.startsWith(p)) return base.slice(p.length);
  return base;
}

/** class → 语义 token（按 - / _ / 驼峰切分，剔除纯数字与过短片段） */
export function mountClsTokens(s) {
  const src = String(s || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return src
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t));
}

/**
 * 两个 token 集合的覆盖率：|a ∩ b| / |b|
 * b 为空返回 0 —— 否则「空集合」会被算成满分，导致无语义线索时也乱选。
 */
export function tokenOverlapRatio(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || b.length === 0) return 0;
  const set = new Set(a);
  const hit = b.filter((t) => set.has(t)).length;
  return hit / b.length;
}

/**
 * figmaPath 的上下文段：去掉设计页名与资源自身节点名，取最近 3 段。
 * `cp-环境监测/slot-con/sub-t/tabs-list/bg` → `slot-con sub-t tabs-list`
 */
export function figmaPathContext(figmaPath) {
  const segs = String(figmaPath || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segs.length <= 2) return '';
  return segs.slice(0, -1).slice(-3).join(' ');
}

/**
 * 资源 figmaBox 相对 parentBox 的面积占比（0~1）。
 * ≥0.9 视为「整块背景」——它铺满父容器，应挂在父容器对应的 DOM 元素上。
 */
export function boxAreaRatio(mapping) {
  const fb = mapping?.figmaBox;
  const pb = mapping?.parentBox;
  if (!fb || !pb) return 0;
  const pa = (pb.width || 0) * (pb.height || 0);
  if (pa <= 0) return 0;
  const fa = (fb.width || 0) * (fb.height || 0);
  return Math.max(0, Math.min(1, fa / pa));
}

/**
 * 由根容器 class 推断组件名前缀：`c-env-monitor-root` → `c-env-monitor-`
 * 评分前必须先剥离，否则所有候选 class 都带同一前缀，语义距离必然失真。
 *
 * @param {Object<string,string>} files 产物文件表（path → content）
 * @returns {string} 以 '-' 结尾的前缀；推断不出返回 ''
 */
export function inferComponentPrefix(files) {
  const idx = files?.['package/index.vue'];
  if (typeof idx !== 'string') return '';
  // 🛡️ 共享边界法 + 剥具名插槽（lazy </template> 会被插槽提前截断——0ca84358 家族缺陷）
  const body = extractSfcTemplateRegion(idx, { stripSlots: true }) || idx;
  const withPanel = body.match(
    /<base-panel[^>]*>[\s\S]*?<[a-zA-Z][^>]*\bclass="([\w-]+)"/,
  );
  const cls =
    (withPanel ? withPanel[1] : (body.match(/<[a-zA-Z][^>]*\bclass="([\w-]+)"/) || [])[1]) || '';
  const base = stripInstanceClsPrefix(cls);
  const m = base.match(/^(.*)-[a-z0-9]+$/i);
  return m && m[1] ? `${m[1]}-` : '';
}

/**
 * 统一挂载点评分（唯一真相源）。
 *
 * @param {Object} mapping - resourceDomMapping 条目
 * @param {{cls?:string, depth?:number, isHostShell?:boolean, dataSectionId?:string|null}} cand - 挂载候选
 * @param {{componentPrefix?:string}} [opts]
 * @returns {number} 分数（越大越优）；`-Infinity` = 不可挂载
 */
export function scoreMountTarget(mapping, cand, opts = {}) {
  if (!mapping || !cand) return Number.NEGATIVE_INFINITY;
  // 宿主外壳（base-panel / mc-panel）禁止挂业务背景：会被 100% 100% 拉伸成整面板大背景
  if (cand.isHostShell) return Number.NEGATIVE_INFINITY;

  // ── 🛡️ 确定性锚短路（2026-09-29 治本 · mc-max-1790671706919-f0c05ecc 实锤）──
  //  `mapping.ownerSectionId` = bg 节点的**直接父节点 figma id**（figma-connector 已固化，
  //  与 `targetDomSelector = [data-section-id="<父节点id>"]` 同源）；确定性装配骨架把
  //  section id 写在容器上 ⇒ 候选项 `data-section-id` 命中即「几何上就是 bg 的父容器」。
  //
  //  为什么必须短路而不能靠语义评分：`mountTarget` 在「直接父段无语义」时会被
  //  figma-connector 的 E1 回退到**语义祖先**（如 `Group 2136636802` → `slot-当日总流量`），
  //  于是按语义 token 评分时，**外层 slot 容器**（class 含 `slot`）反而比真正的父容器
  //  （class 是 `group-2136636802-con`，与 'slot-当日总流量' token 覆盖率为 0）得分高
  //  ⇒ 426×91 的卡片背景被挂到 420×807 的整块容器上、再被 `background-size:100% 100%`
  //  拉满 ⇒ 视觉上等于「背景图消失」。
  //
  //  这是**不可辩驳的结构事实**（父节点 id 相等），优先级高于一切语义评分；
  //  二者任一为空则不生效 ⇒ 老产物（无 ownerSectionId）行为完全不变。
  if (
    mapping.ownerSectionId &&
    cand.dataSectionId &&
    String(cand.dataSectionId) === String(mapping.ownerSectionId)
  ) {
    return DETERMINISTIC_ANCHOR_SCORE;
  }

  const prefix = opts.componentPrefix || '';
  const clsTokens = mountClsTokens(stripMountClsPrefix(cand.cls || '', prefix));
  if (clsTokens.length === 0) return Number.NEGATIVE_INFINITY;

  const nameTokens = mountClsTokens(String(mapping.name || ''));
  const mtTokens = mountClsTokens(String(mapping.mountTarget || ''));
  const pathTokens = mountClsTokens(figmaPathContext(mapping.figmaPath));

  let score =
    3 * tokenOverlapRatio(clsTokens, nameTokens) +
    2 * tokenOverlapRatio(clsTokens, mtTokens) +
    1 * tokenOverlapRatio(clsTokens, pathTokens);

  // 尺寸契合 + 层级：整块背景（铺满父框）→ 越深越好；局部图 → 越浅越好
  const areaRatio = boxAreaRatio(mapping);
  const depth = Math.max(0, Math.min(cand.depth || 0, 6));
  score += (areaRatio >= 0.9 ? 0.3 : -0.3) * depth;
  return score;
}

/** N3 候选循环同构的标签正则（`class="…"` 必需，与两个 engineer 的 N3 逐字一致） */
const N3_TAG_RE =
  /<([a-zA-Z][a-zA-Z0-9-]*)((?:(?!>).)*?)class="([^"]*)"((?:(?!>).)*?)>/g;

/**
 * 「资源已渲染」检测用的标签正则 —— **不要求 `class="…"`**，与 `N3_TAG_RE` **刻意不同**：
 *   · `N3_TAG_RE` 用于**找候选**（必须读到 class 才能做词重叠评分）⇒ 无 class 的标签天然出局；
 *   · 本正则用于**事实判断**（该变量是否已被挂在某个元素上）⇒ 无 class 的元素
 *     （如 `<div :style="{ backgroundImage: 'url(' + bg1 + ')' }">`）同样是「已渲染」，
 *     漏检会导致重复注入（双挂）。
 * 取值范围与 N3 一致：非贪婪到 `>`（属性值含裸 `>` 的极端情形两边都截断，口径相同）。
 */
const ANY_TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)((?:(?!>).)*?)>/g;
/**
 * 🔒 宿主外壳标签正则 —— **唯一事实源**（2026-09-30 收敛）。
 *
 * `base-panel` / `mc-panel`（含变体后缀）是**宿主提供**的装饰外壳，不是组件自有根容器
 * ⇒ 禁止往它上面挂业务背景：一旦挂上就是 `background-size:100% 100%` 拉满整个面板。
 * 事故实证 `mc-max-1788056145870-6e65dc88`：295×27 的 tabs 条背景被兜底挂到外壳上，
 * 拉满 420×807 面板（含 38px header），产出 Figma/UI 设计上根本不存在的大背景。
 * 策略：命中即**放弃挂载**（宁可明确失败 + RES-UNUSED 报错，也不静默产出肉眼可见的错误背景）。
 *
 * 消费方（三处，同一常量）：
 *   ① 本模块 `scoreMountTarget`（`cand.isHostShell → -Infinity`）与 `selectAnchorMountCandidate`；
 *   ② `roles/microcode/resource-mounter.js#collectMountCandidates`（产出 `isHostShell`）。
 * ⚠️ 此前 `resource-mounter.js` 与 `microcode-engineer.js` 各有一份副本（后者的那份**从未被引用**
 *   = 死代码）⇒ 2026-09-30 删除两份副本，收敛到此处；改外壳名单只改这一个地方。
 */
export const HOST_SHELL_TAG_RE = /^(base-panel|mc-panel)(-[a-z0-9]+)*$/i;

function escapeRegExpLiteral(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 「某标签的属性串是否把该变量用在背景上」—— `var-already-referenced` 的**唯一判据**。
 *
 * `/background/i` 同时覆盖 `background` / `backgroundImage` / `background-image` /
 * `:style="{ background… }"` 四种写法（与两个 engineer 的 N3 既有判据逐字同源）。
 * `attrs` 由 `前缀 + 'class="' + cls + '"' + 后缀` 重组而成 ⇒ **class 名里含 "background"
 * 也会命中**——这是既有口径（历史行为），刻意不改，避免与 N3 的 `/background/i` 分叉。
 */
function attrsReferenceBackgroundVar(attrs, varRe) {
  return !!varRe && /background/i.test(attrs) && varRe.test(attrs);
}

/**
 * 🔑 资源是否**已被渲染**（单一事实源）。
 *
 * 判据：产物任一 `.vue` 中存在某标签，其属性串同时含 `/background/i` 与 `\b<varName>\b`
 * ——即该资源变量**已经以背景形式**挂在某个元素上。
 *
 * ## 为什么必须是独立函数（缺口，2026-09-30 治本）
 * `selectAnchorMountCandidate` 的 `var-already-referenced` 分支**只在「锚点元素命中」时才会被评估**
 * （函数内 `if (!anchorCand) return null` 提前返回）⇒ **锚点缺失 / 无 ownerSectionId 的
 * fallback 路径完全没有这条护栏**。全语料实测（post-0929 语料）：`noAnchorEl = 644`，
 * 其中 `varRendered = 412`、**`varRendered` 且 legacy 仍会另挂 = 354** ⇒ 同一背景挂两处（双挂）。
 * 故调用方须在锚点选择**之前**无条件调用本函数。
 *
 * ⚠️ 取代 `roles/microcode/resource-mounter.js#findExistingResourceBinding`（2026-09-30 删除，
 *   全仓零调用点 = 死代码）：后者判据更宽（`import <var>` 或 `:style="` 含变量名即算），
 *   会误判「仅 import 未渲染」与「非背景引用（如 `:src`）」⇒ 本函数是收紧后的唯一判据。
 *
 * 🔁 也是 `selectAnchorMountCandidate` 的 `var-already-referenced` 分支的**唯一实现**
 *   （该分支已改为直接调用本函数，不再自行统计）⇒ 判据全仓只有一份。
 *
 * @param {Object<string,string>} files 产物文件表（path → content）
 * @param {string} varName 资源变量名（如 `bg1` / `bgTrafficMonitor`）
 * @returns {boolean} true = 已渲染（调用方应跳过注入）
 */
export function isResourceRendered(files, varName) {
  if (!files || typeof files !== 'object') return false;
  const name = varName != null ? String(varName) : '';
  if (!name) return false;
  const varRe = new RegExp(`\\b${escapeRegExpLiteral(name)}\\b`);
  for (const [fpath, fcontent] of Object.entries(files)) {
    if (typeof fcontent !== 'string' || !fpath.endsWith('.vue')) continue;
    ANY_TAG_RE.lastIndex = 0;
    let mt;
    while ((mt = ANY_TAG_RE.exec(fcontent)) !== null) {
      const attrs = mt[0]; // 整个标签串：属性/指令/插值全在
      if (attrsReferenceBackgroundVar(attrs, varRe)) return true;
    }
  }
  return false;
}

/**
 * 🎯 锚点元素的 **owner 优先级**（数字越小越优先）。
 *
 * 同一个 `data-section-id` 在产物中可能命中**多个**元素：实测 96 个 sid 跨文件重复
 * （`sameFile` 仅 2），典型形态是 `package/index.vue` 的容器与
 * `package/components/ChartSection.vue` 的子组件根**同带一个 sid**
 * （ChartSection 是「纯搬运」的兄弟组件副本）。
 * 不定义 owner ⇒ 「谁先被遍历到就是谁」= 随文件插入序漂移。
 *
 * 规则：`package/index.vue`(0) > 其它 `index.vue`(1) > 其它 `.vue`(2)。
 * 同级同文件时再取 **标签位置最小者**（DOM 中最外层/最先出现）。
 *
 * @param {string} fpath 产物相对路径
 * @returns {number} 0 | 1 | 2
 */
export function anchorOwnerRank(fpath) {
  const p = String(fpath || '')
    .replace(/\\/g, '/')
    .toLowerCase();
  if (p === 'package/index.vue') return 0;
  if (/(^|\/)index\.vue$/.test(p)) return 1;
  return 2;
}

/** 候选 a 是否优于当前最优 owner cur（cur 为 null 时恒真） */
function isBetterAnchorOwner(a, cur) {
  if (!cur) return true;
  const ra = anchorOwnerRank(a.fpath);
  const rb = anchorOwnerRank(cur.fpath);
  if (ra !== rb) return ra < rb;
  if (a.fpath !== cur.fpath) return false; // 同 rank 不同文件 ⇒ 保持文件遍历序（稳定）
  return a.index < cur.index; // 同文件 ⇒ 取最外层（最先出现）
}

/**
 * 🎯 ④ N3「锚点优先」候选选择（2026-09-30 治本）。
 *
 * ## 缺口（为什么需要这个函数）
 * `scoreMountTarget` 的**确定性锚短路**（`DETERMINISTIC_ANCHOR_SCORE = 1000`）自 2026-09-29 起
 * 已存在，`resource-mounter`（`pickBestMountTarget` / `dedupeBgMultiRefs`）都在用；
 * **唯独两个 engineer 的 N3（bg→父容器强制挂载）自己写了一套「锚点盲区」的私有词重叠评分**：
 *   `score = wordsOf(cls) ∩ targetWords`，`if (!best || score > best.score) best = cand`
 * ——既不看 `data-section-id`，也不看 `ownerSectionId`。而正确锚点元素的 class
 * （如 `c-traffic-monitor-group-2136636802-con`）与 mountTarget（`slot-当日总流量`）token 覆盖率**恒为 0**
 * ⇒ 必然输给语义祖先容器（class 含 `slot`）⇒ 426×91 的卡片背景被挂到 420×807 的整块容器，
 * 再被 `background-size:100% 100%` 拉满 ⇒ 视觉上「背景图整块丢失」（同 `scoreMountTarget` 所载实锤）。
 *
 * ## 语义（返回三态，调用方按此分派）
 * - `null` —— 产物里**没有** `data-section-id === mapping.ownerSectionId` 的元素
 *   ⇒ 信息不足，调用方**保持既有词重叠评分**（逐字不变，零回归）。
 * - `{ skip: true, reason }` —— **锚点已定性，禁止注入**，且**不得**退化到语义评分（旧实现会退化 ⇒ 双挂）：
 *     · `anchor-already-bg`：锚点元素已有 `background` ⇒ 已挂载（幂等）。
 *     · `anchor-host-shell`：锚点是 `base-panel`/`mc-panel` 宿主外壳 ⇒ 与 `scoreMountTarget`
 *       的 `isHostShell → -Infinity` 同源，禁止挂业务背景（会被 100% 100% 拉成整面板大背景）。
 *     · `var-already-referenced`：该 bg 变量**已在任意元素上以 background 形式被引用**
 *       ⇒ 已渲染，再加一处就是**重复挂载**。
 *       🔑 这条护栏是本函数的安全底线：`-bg` 独立层（透明度归属契约的产物，位于锚点**子树内**）
 *       在实测语料中占 `anchorClean` 的 1/4 —— 硬性锚点优先会在此处造成「容器 + 层各挂一次」，
 *       随后 fixPipeline 的 `dedupe-bg-multi-refs`（其 keep 规则同样是锚点优先）会把**层**的
 *       `:style` 判为重复删掉 ⇒ 透明度层语义丢失。已渲染即不再注入，是唯一不误伤的判据。
 * - `{ skip: false, cand, anchor }` —— 锚点元素干净且该资源确实未被渲染 ⇒ **直接以它为准**
 *   （`cand` 字段形状与 N3 既有候选逐字一致：`fpath/index/full/tag/before/cls/after/score`，
 *    故调用方的注入代码可原样复用；`score` 填 `DETERMINISTIC_ANCHOR_SCORE`）。
 *   🔑 多个「干净」命中时按 `anchorOwnerRank`（`package/index.vue` > 其它 `index.vue` > 其它）
 *   再「同文件取最外层」选唯一目标 —— 修 96 个 sid 跨文件重复的漂移（详见 `anchorOwnerRank`）。
 *   ⚠️ 阻断判据（`anchor-host-shell` / `anchor-already-bg`）与 owner **无关**：对**任一**同名
 *   sid 元素命中即定性（保持首版语义），不因 owner 不同而改变「已处理」的结论。
 *
 * @param {Object<string,string>} files 产物文件表（path → content）
 * @param {Object} mapping resourceDomMapping 条目（读 `ownerSectionId` / `assignedVarName`）
 * @param {{varName?:string}} [opts] 变量名可显式覆盖（默认取 `mapping.assignedVarName`）
 * @returns {null | {skip:true, reason:string, anchor:string, file?:string} | {skip:false, cand:Object, anchor:string}}
 *
 * ⚠️ 已知边界：**纯 CSS 替代资源**（无 `resourceFile` / 无 `assignedVarName`，只有 `visualMeta.fillsSummary`）
 *    无法做 `var-already-referenced` 判据（没有可检索的变量名），只剩 `anchor-already-bg` 兜底。
 *    可接受：该分支注入的是同一个 Figma 渐变/纯色，重复施加不出视觉事故（与图片的
 *    size/position 双写不同）；且锚点仍是几何真值父容器，严格优于旧实现的语义祖先。
 */
export function selectAnchorMountCandidate(files, mapping, opts = {}) {
  if (!mapping || !files || typeof files !== 'object') return null;
  const anchor =
    mapping.ownerSectionId != null ? String(mapping.ownerSectionId).trim() : '';
  if (!anchor) return null;
  const varName =
    opts.varName != null
      ? String(opts.varName)
      : mapping.assignedVarName
        ? String(mapping.assignedVarName)
        : '';
  let anchorCand = null;
  for (const [fpath, fcontent] of Object.entries(files)) {
    if (typeof fcontent !== 'string' || !fpath.endsWith('.vue')) continue;
    N3_TAG_RE.lastIndex = 0;
    let mt;
    while ((mt = N3_TAG_RE.exec(fcontent)) !== null) {
      // attrs 构造与两个 engineer 的 N3 逐字一致（`/background/i` 判据同源：含 class 名）
      const attrs = mt[2] + 'class="' + mt[3] + '"' + mt[4];
      const sidM = attrs.match(/\bdata-section-id\s*=\s*["']([^"']*)["']/);
      if (!sidM || sidM[1] !== anchor) continue;
      // ⚠️ 阻断判据（host-shell / already-bg）与 owner 无关、对**任一**同名 sid 元素生效，
      //    命中即定性（保持 2026-09-30 首版语义不变）：任一命中即证明该锚点已处理/不可挂。
      if (HOST_SHELL_TAG_RE.test(mt[1])) {
        return { skip: true, reason: 'anchor-host-shell', anchor, file: fpath };
      }
      if (/background/i.test(attrs)) {
        return { skip: true, reason: 'anchor-already-bg', anchor, file: fpath };
      }
      // 🎯 多个「干净」命中时按 **owner 优先级** 选唯一注入目标（修 96 个 sid 跨文件重复
      //    导致的「谁先遍历到就是谁」漂移）；候选字段形状与 N3 既有候选逐字一致。
      const cand = {
        fpath,
        index: mt.index,
        full: mt[0],
        tag: mt[1],
        before: mt[2],
        cls: mt[3],
        after: mt[4],
        score: DETERMINISTIC_ANCHOR_SCORE,
      };
      if (isBetterAnchorOwner(cand, anchorCand)) anchorCand = cand;
    }
  }
  if (!anchorCand) return null;
  // 🔁 判据收敛（2026-09-30）：不再在本函数内自行统计引用数，直接调用 `isResourceRendered`
  //    —— 与外部调用方（N3 的**无条件**护栏）共用同一实现，判据全仓只有一份。
  //    ⚠️ 该函数用 `ANY_TAG_RE`（不要求 class），比本函数找候选用的 `N3_TAG_RE` 更宽：
  //    无 class 的元素同样算「已渲染」⇒ 本分支比首版**检出更全**（首版会漏无 class 的已渲染元素）。
  if (isResourceRendered(files, varName)) {
    return {
      skip: true,
      reason: 'var-already-referenced',
      anchor,
      file: anchorCand.fpath,
    };
  }
  return { skip: false, cand: anchorCand, anchor };
}

/**
 * F3（2026-09-01）：mountTarget 语义判定——无语义层名不参与强制挂载。
 *
 * 事故实证 mc-max-1788252098143-12469472：mapping 里两个 bg 的 mountTarget='t'
 * （Figma 作者随手命名的单字符 FRAME），下游无边界子串匹配过宽 → RESOURCE-003 误报
 * BLOCK ×2、3 轮重试耗尽（判定本身已整体移除，此处是生成侧根防）。
 *
 * 无语义形态：单字符 / 纯「类型+编号」（Group 2136636802 / Frame 1280 / Component 1）/ 纯数字。
 * 消费方 figma-connector（bg 挂载目标构造）命中 → 清空 mountTarget。
 * ⚠️ 不能置 skipMount：N4 根容器注入（vue3-engineer.js:1470 / microcode-engineer.js:5078）
 *    用 .find(skipMount bg) 选「面板整体背景」，置 skipMount 会被误选铺到根容器。
 */
export function isSemanticMountTarget(t) {
  if (typeof t !== 'string') return false;
  const s = t.trim();
  if (s.length === 0) return false;
  if (s.length < 2) return false;
  if (/^\d+$/.test(s)) return false;
  if (/^(?:group|frame|component|ellipse|rectangle|text|vector|slice|section|instance)\s*\d+$/i.test(s)) return false;
  return true;
}

export default {
  stripInstanceClsPrefix,
  stripMountClsPrefix,
  mountClsTokens,
  tokenOverlapRatio,
  figmaPathContext,
  boxAreaRatio,
  inferComponentPrefix,
  scoreMountTarget,
  isSemanticMountTarget,
  DETERMINISTIC_ANCHOR_SCORE,
  HOST_SHELL_TAG_RE,
  isResourceRendered,
  anchorOwnerRank,
  selectAnchorMountCandidate,
};
