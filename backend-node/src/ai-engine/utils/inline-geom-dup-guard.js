/**
 * 🛡️ P0-A / P0-B + P3-A（2026-11-15）：内联几何「排他性落点」单一事实源
 *
 * ## 事故形态 A（mc-max-1794747509141-9fad7892 实锤）
 * 方案 E（2026-11-14 用户硬约束）把段高真值写进 `<style lang="less" scoped>`
 * 的 `.c-…-sech-N { flex: 0 1 <px> !important; min-height: 0; margin-top: <px> !important }`，
 * 但确定性装配层 **仍同时** 把 `flex:<h/Σh>;min-height:0;margin-top:<px>` 写进同一标签的 inline style。
 * 结果：inline 侧被 !important 压成死样式、px 不过 postcss-pxtorem（rem 适配失效）、
 * 同一几何真值出现「两写者 / 两载体 / 两量纲」——11-14 整治方案 R1「布局真值多源」的残留面。
 *
 * ## 事故形态 B（mc-max-1794751473723-92612fc0 实锤）
 * P0 修完「段级双写」后，产物仍有 8 处 inline：T09 文本兜底的 `gap:4px;margin-left:16px`
 * （resource-mounter.js:2734）、F1 弹窗根尺寸的 `width:420px;height:425px`（code-generator.js:973）、
 * 容器段/行带的纯比例与 `:style` 背景绑定。前两类是**绝对长度 px**，inline 不过 postcss-pxtorem
 * ⇒ 大屏 rem 适配失效。规范从未禁止 inline，禁的是「px 尺寸进 inline」。
 *
 * ## 本模块的三条纪律
 * 1. **单一落点（P0-A）**：带 `mvgo-layout-truth` class 的段，几何属性只允许由 class 规则承载；
 *    `stripInlineGeometryDuplicates()` 在 `applyDeterministicIndexTemplate` 出口（写盘前）剥除 inline 重复声明。
 * 2. **长度归一（P3-A）**：`normalizeInlineLengthPx()` 挂在 **终写前最后窗口**（T09 补跑与
 *    header-right 提升之后、writeFiles 之前），把任何写者留在静态 inline 的绝对长度 px 搬到
 *    确定性 class + 同文件 less 规则。放在终写前而非改产生处，是因为 T09 在装配出口**之后**补跑，
 *    改产生处会被补跑绕开；一层收口才能覆盖全部写者。
 * 3. **语义 class 整段收口（P3-B）**：P3-A 只搬 px、留半截 inline，且按声明集合哈希派生
 *    `mvgo-igeom-*` class ⇒ 真机产物 class 字符 105→415、模板观感反而更脏（用户 23:08 反馈）。
 *    P3-B 改为对**确定性写者标签**（header-right 文本兜底 / 根容器 / S4-b tab 块）做整段
 *    `style` 收口：搬进语义命名的 `mvgo-is-*` class + 同文件 less 规则，标签尽量不再带静态 style。
 *    ⚠️ 含 `var()` / `calc()` / `url()` 的声明**必须留在 inline**：前端 `postcss-pxtorem`
 *    `propList:['*']` 会把 `font-size: calc(var(--fontSize, 14px) * 0.9286)` 里的 14px 转 rem，
 *    破坏变量回退值语义（等于改了生效值）。
 * 4. **可辩驳判据（P0-B / P3-A / P3-B）**：`auditInlineGeometryDuplicates()` 独立审计写盘产物，
 *    任何来源漏剥/回灌/漏归一都 BLOCK。判据只在含 `mvgo-layout-truth` 的 index.vue 上启用。
 *
 * ⚠️ 验收纪律（防假绿）：审计与归一共用本模块的解析实现，因此**不得只靠 audit 返回 0 判定通过**。
 *    spec 必须用独立字面量断言，真机必须看产物字符串（见 inline-geom-dup-guard.spec.ts）。
 *
 * ## 作用范围（严格限定）
 * - 只处理静态 `style="..."`，不碰 `:style` 绑定（base-panel 背景图注入走绑定，变量名需运行时解析）。
 * - P0 只剥 class 规则已承载的四个属性：flex / min-height / min-width / margin-top。
 * - P3-A 只搬「长度类属性的绝对 px 值」；字号（font-size-normalizer 管）、背景、方向、比例、
 *   0 值、非 px 单位、img/canvas/svg 标签一律不动。
 * - P3-B 整段收口**只对白名单内的确定性写者标签**生效；LLM 自由模板、段级比例、行带、
 *   `:style` 绑定、容器段、takeover 快照仍走 P3-A 兜底或零命中（逐字不变）。
 * - 无 `mvgo-layout-truth` 标记 ⇒ 原样返回（逐字不变，vue3 / mc-lite / LLM 自由模板零命中）。
 * - fail-closed：less 规则没确实注入 ⇒ 不剥 inline（宁可留 px 被判据 BLOCK，也不丢几何）。
 */

export const LAYOUT_TRUTH_MARK = 'mvgo-layout-truth';
export const INLINE_GEOM_DUP = 'INLINE-GEOM-DUP';
export const INLINE_GEOM_PX = 'INLINE-GEOM-PX';

/** class 规则承载的声明（与 injectLayoutStyle 产出的规则逐字对齐） */
const CARRIED_DECL_NAMES = Object.freeze(['flex', 'min-height', 'min-width', 'margin-top']);

/**
 * 🛡️ P3-A：长度类属性白名单 + px 值判据（归一与判据共用，判据单一来源）。
 * 只认影响几何布局的绝对长度；font-size / line-height / border / background-position
 * 不在此列（字号由 font-size-normalizer 管，背景走 :style 动态绑定）。
 * 支持 `gap:4px` 单值与 `padding:4px 8px` 多值；`calc()` / `%` / `auto` / `0` 一律不命中。
 */
const LENGTH_DECL_NAME_RX = /^(?:width|height|min-width|min-height|max-width|max-height|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|gap|row-gap|column-gap|flex-basis|top|right|bottom|left|border(?:-[a-z]+)*-radius)$/i;
const PX_VALUE_RX = /^-?\d+(?:\.\d+)?px(?:\s+-?\d+(?:\.\d+)?px)*$/i;
/** img/canvas/svg 的 inline 尺寸由 resource-mounter 的 imgTagHasPxSize 等判据消费，不搬不判 */
const EXCLUDED_TAG_RX = /^<(?:img|image|canvas|svg)\b/i;

/**
 * 🛡️ P3-B：整段收口时**必须留在 inline** 的声明。
 * 前端 `vite.config.js#pxtorem` 配 `propList:['*'] / minPixelValue:5`，写进 less 后
 * `font-size: calc(var(--fontSize, 14px) * 0.9286)` 的 14px 会被转 rem ⇒ 变量回退值语义被改。
 * 同理 `url()` 资源路径、`calc()` 表达式一律不搬（宁可留一条短 inline，也不改生效值）。
 */
const KEEP_INLINE_DECL_RX = /\b(?:var\s*\(|calc\s*\(|url\s*\()/i;

/** P3-B 语义 class 前缀：短、可读、无声明集合哈希（用户 23:08 反馈的观感退化根治） */
const SEMANTIC_PREFIX = 'mvgo-is-';

/**
 * 确定性写者标签白名单（按标签语义，不按声明内容）。
 * 只认系统自己注入的结构；LLM 自由模板即使同形态也不命中（无对应 class / 不在 header-right 块内）。
 */
const SEMANTIC_CATEGORIES = Object.freeze([
  { key: 'hdr-text', test: (_tag, ctx) => ctx.inHeaderRight && /^<span\b/i.test(_tag) },
  // 🛡️ 2026-11-15（3cacdefb 实锤）：Tab 骨架（file-writer.js injectMissingTabUi）注入的
  //    `-slot-con-tabs` / `-tab-item` 会被下面的 root-geom 正则吃掉（`slot-con` 后接 `-`
  //   仍是 \b 边界），语义命名退化成 root-geom，与「根容器」混淆。必须排在 root-geom 之前。
  { key: 'tabblock', test: (tag) => /\bc-[A-Za-z0-9_-]*-slot-con-tabs\b/.test(tag) },
  { key: 'tabitem', test: (tag) => /\bc-[A-Za-z0-9_-]*-tab-item\b/.test(tag) },
  // 根容器只在 F1 弹窗类（style 带绝对长度 px）时收口；普通 P6 装配根容器
  // （display/flex-direction/min-height 无 px）属阴性形态，必须逐字不变
  { key: 'root-geom', test: (tag, ctx) => /\bc-[A-Za-z0-9_-]*-slot-con\b/.test(tag) && hasInlineLengthPx(ctx.styleText) },
  { key: 's4-tabblock', test: (tag) => /\bmc-s4-tabblock\b/.test(tag) },
  { key: 's4-tablist', test: (tag) => /\bmc-s4-tablist\b/.test(tag) },
  { key: 's4-rowlink', test: (tag) => /\bmc-s4-row-link\b/.test(tag) },
  { key: 's4-rowtitle', test: (tag) => /\bmc-s4-row-title\b/.test(tag) },
  { key: 's4-tab', test: (tag) => /\bmc-s4-tab\b/.test(tag) },
]);

/** 标签已有本模块语义 class ⇒ 已收口，整段收口与兜底归一都跳过（幂等） */
function isAlreadySemantic(tag) {
  const m = tag.match(CLASS_ATTR_RX);
  return Boolean(m && m[1].split(/\s+/).some((c) => c.startsWith(SEMANTIC_PREFIX)));
}

function resolveSemanticCategory(tag, ctx) {
  for (const cat of SEMANTIC_CATEGORIES) {
    if (cat.test(tag, ctx)) return cat.key;
  }
  return null;
}

/** `<template #header-right>` 区间（T09 兜底 span 的归属段定位，避免误伤 LLM 自由 span） */
function headerRightRange(tplPart) {
  const open = /<template\s+#header-right\s*>/i.exec(tplPart);
  if (!open) return null;
  const start = open.index + open[0].length;
  const close = tplPart.toLowerCase().indexOf('</template>', start);
  return { start, end: close < 0 ? start : close };
}

/** 单一事实源：这条 inline 声明是不是「绝对长度 px」 */
function isInlineLengthPxDecl(decl) {
  const at = String(decl).indexOf(':');
  if (at < 0) return false;
  const name = String(decl).slice(0, at).trim().toLowerCase();
  const value = String(decl).slice(at + 1).trim();
  return LENGTH_DECL_NAME_RX.test(name) && PX_VALUE_RX.test(value);
}

function hasInlineLengthPx(styleText) {
  return splitDecls(styleText).some(isInlineLengthPxDecl);
}

const STYLE_ATTR_RX = /(?:^|\s)style\s*=\s*"([^"]*)"/;
const CLASS_ATTR_RX = /(?:^|\s)class\s*=\s*"([^"]*)"/;
const OPEN_TAG_RX = /<[A-Za-z][^>]*?>/g;

/**
 * 取 `<style>` 之前的部分（template + script）；less 规则里可能出现 `>` 组合器，
 * 不参与开标签扫描。产物顺序 template→script→style，未见反序形态时保持 fail-open。
 * @param {string} content
 * @returns {{head:string, tail:string}}
 */
function splitStyleTail(content) {
  const at = content.search(/<style\b/i);
  if (at < 0) return { head: content, tail: '' };
  return { head: content.slice(0, at), tail: content.slice(at) };
}

/**
 * 从 `mvgo-layout-truth` 之后的 less 片段里提取「承载几何真值」的 class 集合。
 *
 * 🔴 判据只认**规则体含 flex 声明**的选择器，不认类名语义、不认注释位置：
 *    方案 E 的规则形态恒为 `.cls { flex: 0 1 <px> !important; … }`；
 *    真值注释之后常跟着 `.mc-bg-carrier-*` 之类的背景/网格规则（实测产物有 2 条），
 *    若一并算作真值载体，带这些 class 且带 inline flex 的元素会被误剥/误判。
 *
 * @param {string} content
 * @returns {Set<string>}
 */
export function collectLayoutTruthClasses(content) {
  const out = new Set();
  if (typeof content !== 'string' || !content.includes(LAYOUT_TRUTH_MARK)) return out;
  const { tail } = splitStyleTail(content);
  const markAt = tail.indexOf(LAYOUT_TRUTH_MARK);
  if (markAt < 0) return out;
  const truthBlock = tail.slice(markAt);
  const rx = /\.([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g;
  let m;
  while ((m = rx.exec(truthBlock)) !== null) {
    if (/\bflex\s*:/i.test(m[2])) out.add(m[1]);
  }
  return out;
}

/** 把 style 声明按分号切开（保留原始片段，便于逐字重组） */
function splitDecls(styleText) {
  return String(styleText || '').split(';').map((s) => s.trim()).filter(Boolean);
}

function isCarriedDecl(decl) {
  // 用「声明名」判定，不用全局正则的 lastIndex 状态
  const name = String(decl).split(':')[0].trim().toLowerCase();
  return CARRIED_DECL_NAMES.includes(name);
}

/**
 * P0-A：写盘前终裁归一。
 * 把「带 layout-truth class 的标签」的 inline 里、由 class 规则承载的声明剥掉；
 * style 剥空则整个属性移除。其余标签与属性逐字不变。
 *
 * @param {string} content index.vue 全文（已注入 mvgo-layout-truth 规则）
 * @param {{file?:string, logger?:object}} [options]
 * @returns {{content:string, stats:object}}
 */
export function stripInlineGeometryDuplicates(content, options = {}) {
  const stats = {
    eligible: 0,
    truthClasses: 0,
    scannedTags: 0,
    strippedTags: 0,
    strippedDecls: 0,
    skippedNoLessTruth: 0,
  };
  if (typeof content !== 'string' || !content) return { content, stats };
  if (!content.includes(LAYOUT_TRUTH_MARK)) {
    stats.skippedNoLessTruth = 1;
    return { content, stats };
  }
  stats.eligible = 1;
  const truthClasses = collectLayoutTruthClasses(content);
  stats.truthClasses = truthClasses.size;
  // fail-closed：拿不到真值 class ⇒ 不剥（宁可留双写，也不能把段高整块弄丢）
  if (truthClasses.size === 0) return { content, stats };

  const { head, tail } = splitStyleTail(content);
  const nextHead = head.replace(OPEN_TAG_RX, (tag) => {
    stats.scannedTags += 1;
    const clsM = tag.match(CLASS_ATTR_RX);
    if (!clsM) return tag;
    const classes = clsM[1].split(/\s+/).filter(Boolean);
    if (!classes.some((c) => truthClasses.has(c))) return tag;
    const styleM = tag.match(STYLE_ATTR_RX);
    if (!styleM) return tag;
    const decls = splitDecls(styleM[1]);
    const kept = decls.filter((d) => !isCarriedDecl(d));
    const removed = decls.length - kept.length;
    if (removed === 0) return tag;
    stats.strippedTags += 1;
    stats.strippedDecls += removed;
    if (kept.length === 0) {
      // 整个静态 style 属性移除（注意保留属性前的空白，避免标签粘连）
      return tag.replace(/\s+style\s*=\s*"[^"]*"/, '');
    }
    return tag.replace(STYLE_ATTR_RX, (full) => {
      const prefix = full.slice(0, full.indexOf('style'));
      return `${prefix}style="${kept.join(';')};"`;
    });
  });
  return { content: nextHead + tail, stats };
}

/**
 * P0-B：可辩驳的排他性判据（供 L0-B 门禁与终裁自检共用）。
 *
 * - `INLINE-GEOM-DUP`：layout-truth class 标签的 inline 仍含被 class 承载的声明 ⇒ BLOCK。
 * - `INLINE-GEOM-PX`（P3-A 收紧）：**任何**静态 inline 出现长度类属性的绝对 px ⇒ BLOCK。
 *   P0 版只认「flex 数值 + px 混排」，把 T09 `gap:4px` / F1 `width:420px` 这类纯 px 漏掉；
 *   现改为按声明逐条判定（与归一同一个 `isInlineLengthPxDecl`）。归一后仍残留才是真错。
 *
 * 「同兄弟组两种量纲」由既有 FLEX-004 / FLEX-005 覆盖，本模块不重复实现（判据单一来源）。
 *
 * @param {string} content
 * @param {{file?:string}} [options]
 * @returns {{issues:Array, stats:object}}
 */
export function auditInlineGeometryDuplicates(content, options = {}) {
  const file = options.file || 'package/index.vue';
  const stats = {
    eligible: 0,
    truthClasses: 0,
    scannedTags: 0,
    dupTags: 0,
    dupDecls: 0,
    pxTags: 0,
  };
  const issues = [];
  if (typeof content !== 'string' || !content || !content.includes(LAYOUT_TRUTH_MARK)) {
    return { issues, stats };
  }
  stats.eligible = 1;
  const truthClasses = collectLayoutTruthClasses(content);
  stats.truthClasses = truthClasses.size;
  const { head } = splitStyleTail(content);
  const dupSamples = [];
  const pxSamples = [];

  let m;
  OPEN_TAG_RX.lastIndex = 0;
  while ((m = OPEN_TAG_RX.exec(head)) !== null) {
    const tag = m[0];
    stats.scannedTags += 1;
    const styleM = tag.match(STYLE_ATTR_RX);
    if (!styleM) continue;
    const styleText = styleM[1];
    const clsM = tag.match(CLASS_ATTR_RX);
    const classes = clsM ? clsM[1].split(/\s+/).filter(Boolean) : [];
    const hasTruthClass = classes.some((c) => truthClasses.has(c));

    if (hasTruthClass) {
      const dup = splitDecls(styleText).filter(isCarriedDecl);
      if (dup.length > 0) {
        stats.dupTags += 1;
        stats.dupDecls += dup.length;
        if (dupSamples.length < 3) dupSamples.push(`${classes.filter((c) => truthClasses.has(c)).join('.')} → ${dup.join(' / ')}`);
      }
    }
    // P3-A：任何静态 inline 长度 px（归一后仍残留即为真错，不依赖是否有 flex 比例）
    if (!EXCLUDED_TAG_RX.test(tag) && hasInlineLengthPx(styleText)) {
      stats.pxTags += 1;
      if (pxSamples.length < 3) pxSamples.push(styleText.slice(0, 90));
    }
  }

  if (stats.dupTags > 0) {
    issues.push({
      id: INLINE_GEOM_DUP,
      severity: 'BLOCK',
      file,
      message: `段级几何双载体：${stats.dupTags} 个带 mvgo-layout-truth class 的标签仍在 inline 写 ${stats.dupDecls} 条被 class 规则承载的声明（${dupSamples.join('；')}）。inline 不过 postcss-pxtorem 且被 !important 压成死样式，必须由 writeFiles 前的终裁归一剥除`,
      hint: { suggestion: '在 applyDeterministicIndexTemplate 出口调用 stripInlineGeometryDuplicates；禁止手工改产物回灌 inline' },
    });
  }
  if (stats.pxTags > 0) {
    issues.push({
      id: INLINE_GEOM_PX,
      severity: 'BLOCK',
      file,
      message: `inline 绝对长度 px：${stats.pxTags} 处（${pxSamples.join('；')}）。inline 不过 postcss-pxtorem ⇒ 大屏 rem 适配失效，必须由终写前归一搬到语义 class + less 规则`,
      hint: { suggestion: '可照抄配方（含归属段定位）：把 <span style="...gap:4px;margin-left:16px..."> 改成 <span class="mvgo-is-hdr-text" style="<仅 var()/calc()/url() 声明>">，并在同文件 <style lang="less" scoped> 末尾追加 .mvgo-is-hdr-text { display:inline-flex !important; ...; gap:4px !important; margin-left:16px !important; }；根容器 .c-*-slot-con 用 .mvgo-is-root-geom 承载 width/height，S4 tab 块用 .mvgo-is-s4-tabblock / -tablist。var()/calc()/url() 声明禁止搬进 less（px2rem 会改变量回退值语义）。禁止手工改产物回灌 inline px' },
    });
  }
  return { issues, stats };
}

/** 真机计数行（0 也打，区分「没命中」与「没生效」） */
export function formatInlineGeomStats(prefix, stats) {
  return `${prefix} ${JSON.stringify({
    eligible: stats?.eligible ?? 0,
    truthClasses: stats?.truthClasses ?? 0,
    scannedTags: stats?.scannedTags ?? 0,
    strippedTags: stats?.strippedTags ?? 0,
    strippedDecls: stats?.strippedDecls ?? 0,
    skippedNoLessTruth: stats?.skippedNoLessTruth ?? 0,
    pxMovedTags: stats?.pxMovedTags ?? 0,
    pxMovedDecls: stats?.pxMovedDecls ?? 0,
    pxInjectedClasses: stats?.pxInjectedClasses ?? 0,
    pxSemanticTags: stats?.pxSemanticTags ?? 0,
    pxStyleAttrsRemoved: stats?.pxStyleAttrsRemoved ?? 0,
    dupTags: stats?.dupTags ?? 0,
    pxTags: stats?.pxTags ?? 0,
  })}`;
}

/** class 名按「被搬走的声明集合」派生：同一组声明复用同一规则，天然幂等 */
function hashDecls(decls) {
  const s = decls.map((d) => d.replace(/\s+/g, '')).sort().join(';');
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(7, '0').slice(0, 7);
}

/** 给标签追加确定性 class（保留既有 class；兼容自闭合标签） */
function withAppendedClass(tag, cls) {
  if (CLASS_ATTR_RX.test(tag)) {
    return tag.replace(CLASS_ATTR_RX, (full, val) => {
      const prefix = full.slice(0, full.indexOf('class'));
      return `${prefix}class="${val.trim()} ${cls}"`;
    });
  }
  return tag.replace(/\s*(\/?)>$/, (_m, slash) => ` class="${cls}"${slash ? ' /' : ''}>`);
}

/**
 * 🛡️ P3-A：写盘前终裁归一 —— 静态 inline 的绝对长度 px → 确定性 class + 同文件 less 规则。
 *
 * 为什么挂在终写前最后窗口：T09 文本兜底（microcode-engineer.js:10777）与 header-right
 * 交互 Tab 提升都在装配出口之后补跑，改产生处会被补跑绕开；只有终写前一层能覆盖全部写者。
 *
 * 生效值等价：原 inline 优先级最高，搬进 less 后每条声明带 `!important`，避免被同元素
 * 其它 class 规则反杀（与方案 E 段高规则同口径）。px 由 postcss-pxtorem 转 rem。
 *
 * fail-closed：拿不到 style 注入点、或任一规则未确实落地 ⇒ 整份原样返回（不剥 inline），
 * 由 L0-B 判据 BLOCK；宁可留 px 也不丢几何。
 *
 * @param {string} content index.vue 全文
 * @returns {{content:string, stats:object}}
 */
export function normalizeInlineLengthPx(content) {
  const stats = {
    eligible: 0,
    scannedTags: 0,
    movedTags: 0,
    movedDecls: 0,
    injectedClasses: 0,
    semanticTags: 0,
    styleAttrsRemoved: 0,
    skippedNoTruth: 0,
    skippedNoStyleTarget: 0,
    skippedExcludedTag: 0,
  };
  if (typeof content !== 'string' || !content) return { content, stats };
  if (!content.includes(LAYOUT_TRUTH_MARK)) {
    stats.skippedNoTruth = 1;
    return { content, stats };
  }
  stats.eligible = 1;
  const { head, tail } = splitStyleTail(content);
  // 扫描域再收紧到 `<template>` 区内：script 里可能出现形如 style="…" 的字符串字面量，
  // 那不是 DOM 声明，不得改写。
  const tplOpen = head.search(/<template\b/i);
  const tplClose = head.toLowerCase().lastIndexOf('</template>');
  const scanFrom = tplOpen >= 0 ? tplOpen : 0;
  const scanTo = tplClose >= 0 ? tplClose + '</template>'.length : head.length;
  const beforeTpl = head.slice(0, scanFrom);
  const tplPart = head.slice(scanFrom, scanTo);
  const afterTpl = head.slice(scanTo);
  /** cls → 被搬走的声明（有序，注入顺序稳定） */
  const rules = new Map();
  /** category → (声明集合 hash → cls)：同类别同声明集合共用一个语义 class */
  const categoryClasses = new Map();
  const headerRange = headerRightRange(tplPart);
  OPEN_TAG_RX.lastIndex = 0;
  const nextTplPart = tplPart.replace(OPEN_TAG_RX, (tag, offset) => {
    stats.scannedTags += 1;
    if (EXCLUDED_TAG_RX.test(tag)) {
      stats.skippedExcludedTag += 1;
      return tag;
    }
    // 幂等：本模块已挂过语义 class 的标签不再处理（装配出口 / 终写前两道归一互不重复注入）
    if (isAlreadySemantic(tag)) return tag;
    const styleM = tag.match(STYLE_ATTR_RX);
    if (!styleM) return tag;
    const decls = splitDecls(styleM[1]);
    const ctx = {
      inHeaderRight: Boolean(headerRange && offset >= headerRange.start && offset < headerRange.end),
      styleText: styleM[1],
    };
    const category = resolveSemanticCategory(tag, ctx);

    let moved;
    let cls;
    if (category) {
      // P3-B 整段收口：var()/calc()/url() 声明留 inline（进 less 会被 px2rem 改语义），其余全搬
      moved = decls.filter((d) => !KEEP_INLINE_DECL_RX.test(d));
      if (moved.length === 0) return tag;
      const declHash = hashDecls(moved);
      if (!categoryClasses.has(category)) categoryClasses.set(category, new Map());
      const classMap = categoryClasses.get(category);
      if (!classMap.has(declHash)) {
        const seq = classMap.size + 1;
        const candidate = `${SEMANTIC_PREFIX}${category}${seq === 1 ? '' : `-${seq}`}`;
        classMap.set(declHash, candidate);
        rules.set(candidate, moved);
      }
      cls = classMap.get(declHash);
      stats.semanticTags += 1;
    } else {
      // P3-A 兜底：非确定性写者只搬绝对长度 px，保留其余 inline
      moved = decls.filter(isInlineLengthPxDecl);
      if (moved.length === 0) return tag;
      cls = `${SEMANTIC_PREFIX}geom-${hashDecls(moved)}`;
      if (!rules.has(cls)) rules.set(cls, moved);
    }

    stats.movedTags += 1;
    stats.movedDecls += moved.length;
    const movedSet = new Set(moved);
    const kept = decls.filter((d) => !movedSet.has(d));
    const rebuilt = kept.length > 0 ? ` style="${kept.join(';')};"` : '';
    if (kept.length === 0) stats.styleAttrsRemoved += 1;
    let next = tag.replace(/\s+style\s*=\s*"[^"]*"/, rebuilt);
    if (!next.includes(cls)) next = withAppendedClass(next, cls);
    return next;
  });
  const nextHead = beforeTpl + nextTplPart + afterTpl;
  if (rules.size === 0) return { content, stats };

  const ruleEntries = [...rules.entries()];
  const ruleLines = ruleEntries.map(([cls, decls]) => {
    const body = decls
      .map((d) => `${d.replace(/\s*!important\s*$/i, '').trim()} !important`)
      .join('; ');
    return `  .${cls} { ${body}; }`;
  });
  const payload =
    `\n  /* mvgo-inline-styles：确定性写者样式由语义 class 承载（px 由 postcss-pxtorem 转 rem）；\n` +
    `     var()/calc()/url() 声明刻意留在 inline，禁止搬进 less（px2rem 会改变量回退值语义）。勿改回 inline 全长 */\n` +
    `${ruleLines.join('\n')}\n`;

  let out;
  const styleEnd = tail.toLowerCase().lastIndexOf('</style>');
  if (styleEnd >= 0) {
    out = nextHead + tail.slice(0, styleEnd) + payload + tail.slice(styleEnd);
  } else {
    const tplEnd = nextHead.toLowerCase().lastIndexOf('</template>');
    if (tplEnd < 0) {
      stats.skippedNoStyleTarget = 1;
      stats.movedTags = 0;
      stats.movedDecls = 0;
      stats.semanticTags = 0;
      stats.styleAttrsRemoved = 0;
      return { content, stats };
    }
    const insertAt = tplEnd + '</template>'.length;
    out =
      nextHead.slice(0, insertAt) +
      `\n\n<style lang="less" scoped>\n${payload}</style>` +
      nextHead.slice(insertAt) +
      tail;
  }
  // fail-closed 复核：所有规则都必须确实出现在产物里
  for (const [cls] of ruleEntries) {
    if (!out.includes(`.${cls} {`)) {
      stats.skippedNoStyleTarget = 1;
      stats.movedTags = 0;
      stats.movedDecls = 0;
      stats.semanticTags = 0;
      stats.styleAttrsRemoved = 0;
      return { content, stats };
    }
  }
  stats.injectedClasses = ruleEntries.length;
  return { content: out, stats };
}

/** P3-A 真机计数行（0 也打，区分「没有 inline px」与「归一失效」） */
export function formatInlinePxStats(prefix, stats) {
  return `${prefix} ${JSON.stringify({
    eligible: stats?.eligible ?? 0,
    scannedTags: stats?.scannedTags ?? 0,
    movedTags: stats?.movedTags ?? 0,
    movedDecls: stats?.movedDecls ?? 0,
    injectedClasses: stats?.injectedClasses ?? 0,
    semanticTags: stats?.semanticTags ?? 0,
    styleAttrsRemoved: stats?.styleAttrsRemoved ?? 0,
    skippedNoTruth: stats?.skippedNoTruth ?? 0,
    skippedNoStyleTarget: stats?.skippedNoStyleTarget ?? 0,
    skippedExcludedTag: stats?.skippedExcludedTag ?? 0,
  })}`;
}
