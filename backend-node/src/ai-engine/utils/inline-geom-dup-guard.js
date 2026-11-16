/**
 * 🛡️ P0-A / P0-B + C（2026-11-16）：内联几何「排他性落点」单一事实源
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
 * ## 事故形态 C（mc-max-1794758569380-8cc9f6dd 实锤 ⇒ 本模块改为「零新类」策略）
 * P3-A/P3-B 曾把长度 px 搬进**新造的** `mvgo-is-*` / `mvgo-igeom-*` 语义类，判据与归一自洽、
 * 真机 audit 也归零，但落盘产物被下游写者撕裂：
 *   - `class-prefix-fixer` 只改 template 侧（`mvgo-is-root-geom` → `c-<comp>-mvgo-is-root-geom`），
 *     index.vue scoped 的 `.mvgo-is-root-geom` 不命中 ⇒ **死规则**；
 *   - `root-container-normalizer` 对根容器一律 `height:100%` ⇒ Figma 真值 `420×425` 被改 `100%×100%`；
 *   - `fixed-size-normalizer` 补 `flex:0 0 auto`、`font-size-normalizer` 改 `@fontSize`、
 *     `style-class-consolidator` 回写 common.less 并加组件前缀。
 * code-chunks 缓存与落盘产物双向取证：chunk 阶段 `.mvgo-is-root-geom { width:420px; height:425px }`
 * 正确，落盘后 `420/425` **只剩那条不命中的死规则**。
 * ⇒ 新类名 ＝ 新的真相源，必然被多写者各自加工。**C 起不再新造任何类名。**
 *
 * ## 本模块的四条纪律
 * 1. **单一落点（P0-A）**：带 `mvgo-layout-truth` class 的段，几何属性只允许由 class 规则承载；
 *    `stripInlineGeometryDuplicates()` 在 `applyDeterministicIndexTemplate` 出口（写盘前）剥除 inline 重复声明。
 * 2. **长度归一（C）**：`normalizeInlineLengthPx()` 挂在 **终写前最后窗口**（T09 补跑与 header-right
 *    提升之后、writeFiles 之前），把任何写者留在静态 inline 的绝对长度 px 落到**元素已有类**的规则块。
 *    放在终写前而非改产生处，是因为 T09 在装配出口**之后**补跑，改产生处会被补跑绕开。
 * 3. **零新类分档（C）**：① 元素已有组件语义类 ⇒ 声明合并进该类块（与方案 E 的段高规则天然同块，
 *    同一元素同一属性只剩一个写者）；② 内容根容器（`-slot-con` / `-root` 词尾）⇒ 长度声明**剥除**，
 *    尺寸归 `root-container-normalizer` 单点（`height:100%` + `aspect-ratio`），Figma 画布尺寸不是
 *    组件自身尺寸；③ 原生元素无类可落 ⇒ 合成**带组件前缀**的类（如 `c-device-monitor-hdr-text`，
 *    前缀由产物已有类求 LCP 得出，带正确前缀不会被 prefix-fixer 改名）；④ 组件标签 / 推不出前缀
 *    ⇒ 保留 inline 并打 `data-mvgo-geom="no-anchor"`，判据降 WARN（可观测、不静默、不丢几何）。
 *    ⚠️ 含 `var()` / `calc()` / `url()` 的值**不得进 less**：前端 `postcss-pxtorem` `propList:['*']`
 *    会把 `calc(var(--fontSize, 14px) * 0.9286)` 里的 14px 转 rem，破坏变量回退值语义。
 * 4. **可辩驳判据（P0-B / C）**：`auditInlineGeometryDuplicates()` 独立审计写盘产物，
 *    任何来源漏剥/回灌/漏归一都 BLOCK；带 `no-anchor` 标记的元素单列 WARN。
 *    判据只在含 `mvgo-layout-truth` 的 index.vue 上启用。
 *
 * ⚠️ 验收纪律（防假绿）：审计与归一共用本模块的解析实现，因此**不得只靠 audit 返回 0 判定通过**。
 *    spec 必须用独立字面量断言，真机必须看产物字符串（见 inline-geom-dup-guard.spec.ts）。
 *
 * ## 作用范围（严格限定）
 * - 只处理静态 `style="..."`，不碰 `:style` 绑定（base-panel 背景图注入走绑定，变量名需运行时解析）。
 * - P0 只剥 class 规则已承载的四个属性：flex / min-height / min-width / margin-top。
 * - C 只搬「长度类属性的绝对 px 值」；字号（font-size-normalizer 管）、背景、方向、比例、
 *   0 值、非 px 单位、img/canvas/svg 标签一律不动。
 * - 多值简写里「首值无单位」的形态（`padding:0 8px`）暂不搬也不判（`PX_VALUE_RX` 口径一致），
 *   登记为下一项判据缺口，不在本轮静默放宽。
 * - 无 `mvgo-layout-truth` 标记 ⇒ 原样返回（逐字不变，vue3 / mc-lite / LLM 自由模板零命中）。
 * - fail-closed：规则块拿不到（less 嵌套 / 无 style 注入点）⇒ 整份原样返回，不剥 inline。
 */

export const LAYOUT_TRUTH_MARK = 'mvgo-layout-truth';
export const INLINE_GEOM_DUP = 'INLINE-GEOM-DUP';
export const INLINE_GEOM_PX = 'INLINE-GEOM-PX';
/**
 * S3（2026-11-16）：同一落点类、同一属性被**不同值**两次写入。
 * 归一按「首条优先」保留并落一条 `mvgo-inline-conflict:` 注释，判据据此出 WARN。
 * 为什么不是 BLOCK：产物最终只有一个确定值（不丢几何），但意味着产生处对同一元素
 * 给了两个真值，需要人看；若升 BLOCK，修复轮无法自证「哪个值对」，只会反复失败。
 */
export const INLINE_GEOM_CONFLICT = 'INLINE-GEOM-CONFLICT';

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
    pxNoAnchorTags: 0,
    pxRootKeepTags: 0,
    conflictNotes: 0,
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
    // 🛡️ C（2026-11-16）：带 `data-mvgo-geom="no-anchor"` 的元素是**归一主动保留**的
    //    （既无已有类可落、又非根容器）⇒ 降为 WARN，可观测但不静默放行。
    if (!EXCLUDED_TAG_RX.test(tag) && hasInlineLengthPx(styleText)) {
      if (tag.includes(ROOT_KEEP_MARK)) {
        // S1：根容器 fail-closed 保留 ⇒ F1 契约的**合法形态**，不计 BLOCK/WARN，只做统计
        stats.pxRootKeepTags += 1;
      } else if (tag.includes(NO_ANCHOR_MARK)) {
        stats.pxNoAnchorTags += 1;
      } else {
        stats.pxTags += 1;
        if (pxSamples.length < 3) pxSamples.push(styleText.slice(0, 90));
      }
    }
  }

  if (stats.dupTags > 0) {
    // 🛡️ P0（2026-11-16 · docs/2026-11-16-内置组件全量审计.md）：BLOCK → **WARN**。
    //   ①后果是「inline 写法与 class 规则双载体，inline 不过 pxtorem」——几何仍在、能打开；
    //   ②修复**唯一**通道是确定性归一 stripInlineGeometryDuplicates（LLM 改产物无效，
    //     因为它写的是同一份双载体）；BLOCK 的边际收益只剩「逼 LLM 重试」= 零收益；
    //   ③全量实测 32 个组件命中，其中含 runtimeVerified=true 的已跑通产物。
    //   判据、计数、message、配方全保留；装配出口的 fail-closed warn 日志仍在（可观测性不降）。
    issues.push({
      id: INLINE_GEOM_DUP,
      severity: 'WARN',
      file,
      message: `（非阻断：由终裁归一剥除，不靠 LLM 重写）段级几何双载体：${stats.dupTags} 个带 mvgo-layout-truth class 的标签仍在 inline 写 ${stats.dupDecls} 条被 class 规则承载的声明（${dupSamples.join('；')}）。inline 不过 postcss-pxtorem 且被 !important 压成死样式，必须由 writeFiles 前的终裁归一剥除`,
      hint: { suggestion: '在 applyDeterministicIndexTemplate 出口调用 stripInlineGeometryDuplicates；禁止手工改产物回灌 inline' },
    });
  }
  if (stats.pxTags > 0) {
    // 🛡️ P0（2026-11-16）：同上 —— BLOCK → **WARN**。后果是「大屏 rem 适配可能失效」，
    //   元素仍按 px 正确渲染；修复靠 normalizeInlineLengthPx 确定性搬进语义 class。
    //   全量实测 38 个组件命中（日志 22 行、0 次致败）。
    issues.push({
      id: INLINE_GEOM_PX,
      severity: 'WARN',
      file,
      message: `（非阻断：由终写前归一搬进既有语义 class）inline 绝对长度 px：${stats.pxTags} 处（${pxSamples.join('；')}）。inline 不过 postcss-pxtorem ⇒ 大屏 rem 适配失效，必须由终写前归一搬到元素既有类的规则块`,
      hint: {
        suggestion:
          '可照抄配方（C 分档，2026-11-16）：① 元素已有组件语义类（如 c-x-sech-1 / mc-s4-tabblock）⇒ 直接在该类的 less 规则块里写 `width: 420px !important;`（无块则补 `.c-x-sech-1 { … }`），并把 inline 中该声明删除，**禁止新造 mvgo-is-* 类名**（新类名会被 prefix-fixer 改 template、被 root-container-normalizer 改 100%、被 consolidator 回写 common.less ⇒ 变死规则 + 丢真值）；② 内容根容器（`-slot-con` / `-root` 词尾）⇒ **仅当剥后仍有尺寸兜底**（height:100% / flex / aspect-ratio）才删；否则保留 inline（F1 契约，元素应带 `data-mvgo-geom="root"`），因为 root-container-normalizer 不会凭空补规则块，删了就是尺寸整块丢失；③ 无任何类可落的裸元素 ⇒ 保留 inline 并加 `data-mvgo-geom="no-anchor"`（门禁降 WARN）。var()/calc()/url() 声明禁止搬进 less（px2rem 会改变量回退值语义）。禁止手工改产物回灌 inline px',
      },
    });
  }
  // S3：冲突登记（注释形态）⇒ WARN。产物本身只有首条确定值（不丢几何），故不 BLOCK。
  const conflictHits = (content.match(/mvgo-inline-conflict:/g) || []).length;
  stats.conflictNotes = conflictHits;
  if (conflictHits > 0) {
    const sample = (content.match(/mvgo-inline-conflict:[\s\S]{0,160}/) || [''])[0]
      .replace(/\s+/g, ' ')
      .slice(0, 140);
    issues.push({
      id: INLINE_GEOM_CONFLICT,
      severity: 'WARN',
      file,
      message: `同落点类同属性被赋不同值 ${conflictHits} 组，已按首条优先落盘（产物只有一个确定值，但产生处给了两个真值）：${sample}`,
      hint: {
        suggestion:
          '检查产生处是否对同一元素写了两次同属性（典型：段真值 bbox 与 LLM/规则兜底各算一次）。归一只做首条优先，不做取舍裁决；确认哪一路是唯一来源后删掉另一路。',
      },
    });
  }
  if (stats.pxNoAnchorTags > 0) {
    issues.push({
      id: INLINE_GEOM_PX,
      severity: 'WARN',
      file,
      message: `inline 绝对长度 px 保留 ${stats.pxNoAnchorTags} 处（已标 data-mvgo-geom="no-anchor"）：元素既无组件语义类可落、也非根容器 ⇒ 归一 fail-closed 保留，不丢几何。`,
      hint: {
        suggestion:
          '要消掉这处 WARN，需让模板给该元素一个稳定的组件语义类（如 c-{组件}-hdr-text），再由归一合并声明；禁止为此新造 mvgo-is-* 类名',
      },
    });
  }
  return { issues, stats };
}

/**
 * 真机计数行（0 也打，区分「没命中」与「没生效」）
 * ⚠️ 只输出【段级双写】组（stripInlineGeometryDuplicates + audit）的字段。
 *   C 的长度归一组另有唯一来源 `formatInlinePxStats()`（下方），
 *   此处**禁止**再映射 px* 字段 —— 2026-11-16 真机实锤：旧版在这里手抄了一份
 *   `pxMovedTags/pxInjectedClasses/...` 映射，子键改名（injectedClasses→appendedClasses、
 *   semanticTags→mergedClasses）后映射静默失效，日志恒 0 ⇒ 观测失真、误判「C 没生效」。
 */
export function formatInlineGeomStats(prefix, stats) {
  return `${prefix} ${JSON.stringify({
    eligible: stats?.eligible ?? 0,
    truthClasses: stats?.truthClasses ?? 0,
    scannedTags: stats?.scannedTags ?? 0,
    strippedTags: stats?.strippedTags ?? 0,
    strippedDecls: stats?.strippedDecls ?? 0,
    skippedNoLessTruth: stats?.skippedNoLessTruth ?? 0,
    dupTags: stats?.dupTags ?? 0,
    pxTags: stats?.pxTags ?? 0,
    pxNoAnchorTags: stats?.pxNoAnchorTags ?? 0,
    pxRootKeepTags: stats?.pxRootKeepTags ?? 0,
  })}`;
}

/* ────────────────────── C 治本：声明落到「已有类」（2026-11-16）──────────────────────
 * 病灶（mc-max-1794758569380-8cc9f6dd 实锤，code-chunks 缓存 vs 落盘产物双向取证）：
 *   P3-A/P3-B 把布局声明搬到**新造的** `mvgo-is-*` 类上 ＝ 引入新的真相源。
 *   新类名随后被下游 5 个写者各自加工：
 *     class-prefix-fixer    → 只改 template 侧（`mvgo-is-root-geom` → `c-device-monitor-mvgo-is-root-geom`），
 *                             index.vue scoped 的 `.mvgo-is-root-geom` 不命中 ⇒ **死规则**；
 *     root-container-normalizer → 根容器一律 `height:100%` ⇒ 420×425 被改 100%×100%；
 *     fixed-size-normalizer → 显式 px 块补 `flex:0 0 auto`；
 *     font-size-normalizer  → `var(--fontSize,14px)` → `@fontSize`；
 *     style-class-consolidator → 回写 common.less 并加组件前缀。
 *   结果：chunk 阶段真值 `.mvgo-is-root-geom { width:420px; height:425px }` 正确，
 *   落盘后 `420/425` 只剩那条**不命中的死规则**，实际生效的是 100%×100%。
 *   ⇒ 违反「判据单一来源 / 角色唯一」，是 R1 布局真值多写者的复现。
 *
 * C 的三档（**不再新造任何类名**）：
 *   ① 元素有「模板里已存在的组件语义类」⇒ 声明**合并**进该类的既有规则块（无块则补块）。
 *      类名来自模板，不是新真相源；与方案 E（injectLayoutStyle）的段高规则天然落到
 *      同一个 `.c-x-sech-N` 块 ⇒ 同一元素同一属性只有一个写者。
 *   ② 元素是内容根容器（`-slot-con` / `-root` 词尾）⇒ inline 长度声明**有条件剥除**：
 *      仅当剥完仍存在尺寸兜底（height:100% / flex / aspect-ratio）才剥，尺寸交
 *      root-container-normalizer；剥完什么都不剩（F1 弹窗类的 `width:420px;height:425px`）
 *      ⇒ **fail-closed 保留 inline** + `data-mvgo-geom="root"`（真机 f5c9792c：剥了之后
 *      less 与 scoped 都没有该根类规则块，420×425 凭空消失，整树退回 height:auto）。
 *   ③ 既无锚类也非根容器（如 T09 裸 `<span>`）⇒ **保留 inline**，元素加
 *      `data-mvgo-geom="no-anchor"`，L0-B 对该元素降 WARN（可观测、不静默、不丢几何）。
 *
 * 幂等：处理后元素不再有该声明 ⇒ 二次归一零命中；合并是同值替换。
 * fail-closed：目标类块是 less 嵌套块（body 含 `{`）⇒ 不动该元素，保留 inline 交判据。
 */

/** 可作为「声明落点」的已存在类：组件前缀类 或 S4 确定性结构类 */
const ANCHOR_CLASS_RX = /^(?:c-[a-z0-9]+(?:-[a-z0-9]+)*|mc-s4-[a-z0-9]+(?:-[a-z0-9]+)*)$/i;
/** 不可作锚：运行期哈希类 / 本模块历史语义类 / BEM 修饰 / 状态类 */
const NON_ANCHOR_CLASS_RX = /(?:^c-mc-|mvgo-|--|^is-|-(?:active|on|disabled|checked)$)/i;
/** 组件前缀末段的**结构词**：命中说明 LCP 已切进段/行/tab 内部，不构成组件名 */
const STRUCTURAL_TAIL_RX = /^(?:sech|slot|row|tab|tabblock|tablist|item|con|root|grid|card|list|text|hdr|body)$/i;
/** 内容根容器（尺寸策略归 root-container-normalizer，不参与声明搬移） */
const ROOT_CONTAINER_CLASS_RX = /-(?:slot-con|root)$/i;
/** 第三档元素的溯源标记（不参与样式，不会被任何样式写者加工） */
export const NO_ANCHOR_MARK = 'data-mvgo-geom="no-anchor"';
/**
 * 第二档（内容根容器）**fail-closed 保留**的溯源标记。
 *
 * 触发条件：根容器 inline 带绝对长度 px，但剥掉之后**没有任何尺寸兜底**
 * （无 width/height/flex/aspect-ratio，或只剩 `min-height:0` 这类零值）。
 * 真机 `mc-max-1794760431071-f5c9792c` 实锤：弹窗分支由 F1 产生处
 * （`code-generator.js` 的 `rootSizeStyle`）写 `width:420px;height:425px`，
 * 剥掉后 common.less 与 scoped 都没有该根类规则块 ⇒ 420×425 两边皆无，根 div 退回
 * `height:auto`，整棵树塌掉。⇒ 宁可留 inline，也不把尺寸弄丢。
 *
 * 语义：F1 契约里「根容器尺寸由产生处单点写 inline」本来就是设计选择（免疫下游 5 个
 * 写者改写），所以带此标记的 inline px 属**合法形态**，判据不计 BLOCK / WARN，
 * 观测走计数行 `rootKeepTags`。
 */
export const ROOT_KEEP_MARK = 'data-mvgo-geom="root"';

/** 「剥完是否还有尺寸兜底」认的声明名（min-height:0 这类零值已在取值处排除） */
const SIZE_FLOOR_NAME_RX = /^(?:width|height|min-width|min-height|flex|flex-basis|aspect-ratio)$/i;

/** 剥除后剩余声明里是否还有真正撑起尺寸的一条 */
function hasSizeFloor(decls) {
  return decls.some((d) => {
    const at = d.indexOf(':');
    if (at < 0) return false;
    const name = d.slice(0, at).trim().toLowerCase();
    if (!SIZE_FLOOR_NAME_RX.test(name)) return false;
    const value = d.slice(at + 1).trim();
    return value !== '' && !/^0(?:px|%|rem|em|vh|vw)?$/i.test(value);
  });
}

function classTokens(tag) {
  const m = tag.match(CLASS_ATTR_RX);
  return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

/** 锚类：模板中已存在、可承载布局声明的组件语义类（顺序即优先序） */
function resolveAnchorClass(tag) {
  for (const c of classTokens(tag)) {
    if (!ANCHOR_CLASS_RX.test(c)) continue;
    if (NON_ANCHOR_CLASS_RX.test(c)) continue;
    if (ROOT_CONTAINER_CLASS_RX.test(c)) continue;
    return c;
  }
  return null;
}

function isRootContainerTag(tag) {
  return classTokens(tag).some((c) => ROOT_CONTAINER_CLASS_RX.test(c));
}

/**
 * 从产物已有类提取组件前缀（如 `c-device-monitor`）。
 *
 * 为什么需要：裸 `<span>` 没有任何类可落，直接 fail-closed 会留 px（真机 `0f2346a3`
 * 有 3 处 T09 header span）。给它一个**带组件前缀**的语义类就能落到 less 块，
 * 且带正确前缀的类**不会**被 `class-prefix-fixer` 改名（它只补「缺前缀」的类），
 * 也不会被 root-container-normalizer 当根容器（词尾不是 `-slot-con`/`-root`）。
 *
 * 提取方式：模板内所有 `c-*` 类 token 求最长公共前缀段序列（≥2 段才算有效）；
 * 排除运行期哈希类与历史 `mvgo-is-*`。拿不到 ⇒ null（该元素 fail-closed 保留 inline）。
 */
function detectComponentPrefix(head) {
  const tokens = new Set();
  for (const m of String(head || '').matchAll(/class\s*=\s*"([^"]*)"/g)) {
    for (const t of m[1].split(/\s+/)) {
      if (!/^c-[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(t)) continue;
      if (/^c-mc-/i.test(t) || /mvgo-/i.test(t)) continue;
      tokens.add(t.toLowerCase());
    }
  }
  if (tokens.size === 0) return null;
  // 单一 token 推不出「组件前缀」：`c-x-sech-1` 的 LCP 就是它自己，据此合成类名会跑飞。
  // 至少 2 个不同类 token 才认（真机产物恒有 slot-con/sech-N 等多个同类前缀令牌）。
  if (tokens.size < 2) return null;
  const seqs = [...tokens].map((t) => t.split('-'));
  let acc = seqs[0];
  for (const s of seqs.slice(1)) {
    let i = 0;
    while (i < acc.length && i < s.length && acc[i] === s[i]) i += 1;
    acc = acc.slice(0, i);
    if (acc.length < 2) return null;
  }
  // 🔴 S2：LCP 末段若是**结构词**，说明它已经被切到「段 / 行 / tab」内部，
  //   不是组件名。典型：模板只有 `c-x-sech-1` + `c-x-sech-2` ⇒ LCP = `c-x-sech`
  //   合成出 `c-x-sech-hdr-text-1`，看着像段规则，会被 §E 段高规则/consolidator 当段类加工。
  //   真机 `f5c9792c` 之所以推对，是因为模板里恰好还有 `-slot-con` 把 LCP 拉回到组件名。
  while (acc.length >= 3 && STRUCTURAL_TAIL_RX.test(acc[acc.length - 1])) acc = acc.slice(0, -1);
  return acc.length >= 2 ? acc.join('-') : null;
}

/** 定位 `.cls { … }` 规则块；less 嵌套（body 含 `{`）返回 nested 由调用方 fail-closed */
function findRuleBlock(styleTail, cls) {
  const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`\\.${esc}\\s*\\{([^{}]*)\\}`, 'i');
  const m = rx.exec(styleTail);
  if (!m) return null;
  return { full: m[0], body: m[1] };
}

/** 把声明并入既有规则体：同名属性替换（保留其他声明），否则追加；统一带 !important */
function mergeDeclsIntoBody(body, decls) {
  const list = String(body || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const d of decls) {
    const at = d.indexOf(':');
    if (at < 0) continue;
    const name = d.slice(0, at).trim();
    const value = d.slice(at + 1).replace(/\s*!important\s*$/i, '').trim();
    const entry = `${name}: ${value} !important`;
    const hit = list.findIndex((x) => {
      const bx = x.indexOf(':');
      return bx > 0 && x.slice(0, bx).trim().toLowerCase() === name.toLowerCase();
    });
    if (hit >= 0) list[hit] = entry;
    else list.push(entry);
  }
  return list;
}

/** 元素上打「无锚类」溯源标记（只加一次） */
function markNoAnchor(tag) {
  if (tag.includes(NO_ANCHOR_MARK)) return tag;
  return tag.replace(/\s*(\/?)>$/, (_m, slash) => ` ${NO_ANCHOR_MARK}${slash ? ' /' : ''}>`);
}

/** 根容器 fail-closed 保留标记（只加一次，幂等） */
function markRootKeep(tag) {
  if (tag.includes(ROOT_KEEP_MARK)) return tag;
  return tag.replace(/\s*(\/?)>$/, (_m, slash) => ` ${ROOT_KEEP_MARK}${slash ? ' /' : ''}>`);
}

/**
 * S3：把冲突登记写成 style 块末尾注释（幂等 —— 已存在则不重复插）。
 * 判据侧 `auditInlineGeometryDuplicates` 靠 `mvgo-inline-conflict:` 计数出 WARN。
 */
function appendConflictNote(out, conflictClassSet, conflictSamples, stats) {
  if (conflictClassSet.size === 0) return out;
  stats.conflictClasses = conflictClassSet.size;
  if (out.includes('mvgo-inline-conflict:')) return out;
  const note =
    `\n  /* mvgo-inline-conflict: 同落点类同属性被赋不同值，已按首条优先，需人工确认真值来源\n` +
    `     ${conflictSamples.join('; ')}\n   */\n`;
  const styleEnd = out.toLowerCase().lastIndexOf('</style>');
  return styleEnd >= 0 ? out.slice(0, styleEnd) + note + out.slice(styleEnd) : out;
}

/** 给标签追加类名（保留既有 class；兼容自闭合标签） */
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
 * 🛡️ C：写盘前终裁归一 —— 静态 inline 的绝对长度 px → **元素已有类**的规则块。
 *
 * 与 P3-A/P3-B 的差别：不新增 class 名、不新增 `mvgo-is-*` 语义层，
 * 因此不会被 prefix-fixer / root-container-normalizer / consolidator 二次撕裂。
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
    mergedClasses: 0,
    appendedClasses: 0,
    strippedRootTags: 0,
    strippedRootDecls: 0,
    rootKeepTags: 0,
    conflictClasses: 0,
    conflictDecls: 0,
    keptConflictTags: 0,
    noAnchorTags: 0,
    syntheticTags: 0,
    syntheticReuseTags: 0,
    skippedNonScoped: 0,
    skippedNestedBlock: 0,
    skippedNoTruth: 0,
    skippedNoStyleTarget: 0,
    skippedExcludedTag: 0,
    styleAttrsRemoved: 0,
  };
  if (typeof content !== 'string' || !content) return { content, stats };
  if (!content.includes(LAYOUT_TRUTH_MARK)) {
    stats.skippedNoTruth = 1;
    return { content, stats };
  }
  stats.eligible = 1;
  const { head, tail } = splitStyleTail(content);
  // 扫描域收紧到 `<template>` 区：script 里形如 style="…" 的字符串字面量不是 DOM 声明
  const tplOpen = head.search(/<template\b/i);
  const tplClose = head.toLowerCase().lastIndexOf('</template>');
  const scanFrom = tplOpen >= 0 ? tplOpen : 0;
  const scanTo = tplClose >= 0 ? tplClose + '</template>'.length : head.length;
  const beforeTpl = head.slice(0, scanFrom);
  const tplPart = head.slice(scanFrom, scanTo);
  const afterTpl = head.slice(scanTo);

  /** 锚类 → 待并入的声明（同一类多处声明合并到同一块） */
  const mergePlan = new Map();
  const headerRange = headerRightRange(tplPart);
  const compPrefix = detectComponentPrefix(tplPart);
  // 🛡️ S2（2026-11-16）：合成类名的**唯一性**与**作用域**两个守卫。
  //   病灶：旧版按 `SEMANTIC_CATEGORIES` 的有限枚举（hdr-text / tabblock / … / 兜底 inline-geom）
  //   合成类名 ⇒ 同一模板里两个裸 span 得到**同一个类**，声明合并进同一块、同属性后者覆盖前者，
  //   真值静默丢失；且若模板里恰好已有同名类，会污染既有语义。
  //   现改为「语义类别 + 全模板自增序号」，并避开模板中已出现的任何类名 ⇒ 唯一。
  //   作用域：合成类只在 scoped 下安全（非 scoped 会全局污染别的组件）⇒ 非 scoped fail-closed。
  const styleScoped = /<style\b[^>]*\bscoped\b/i.test(tail || '');
  const takenClassNames = new Set();
  for (const tm of tplPart.matchAll(/class\s*=\s*"([^"]*)"/g)) {
    for (const t of tm[1].split(/\s+/)) if (t) takenClassNames.add(t.toLowerCase());
  }
  let syntheticSeq = 0;
  /** 合成类复用表：`cat|声明签名` → 已分配的类名。
   *  同类别 + 同声明的多个元素**共用**一个类（声明一致 ⇒ 不存在同属性覆盖），
   *  避免 3 个 T09 兜底 span 拆出 3 份完全相同的规则块。 */
  const syntheticBySig = new Map();
  /** S3 冲突检测：anchor → Map(属性名 → 首次取值)；同一属性不同值 ⇒ 保留首条并登记 */
  const anchorDeclIndex = new Map();
  const conflictSamples = [];
  const conflictClassSet = new Set();
  const nextTplPart = tplPart.replace(OPEN_TAG_RX, (tag, offset) => {
    stats.scannedTags += 1;
    if (EXCLUDED_TAG_RX.test(tag)) {
      stats.skippedExcludedTag += 1;
      return tag;
    }
    const styleM = tag.match(STYLE_ATTR_RX);
    if (!styleM) return tag;
    const decls = splitDecls(styleM[1]);
    const pxDecls = decls.filter(isInlineLengthPxDecl);

    // ② 内容根容器：长度声明剥除，尺寸归 root-container-normalizer
    //    🔴 S1 fail-closed（2026-11-16 · f5c9792c 实锤）：剥除的前提是「剥完还有尺寸兜底」。
    //    根容器尺寸在 F1 契约里由产生处单点写 inline（免疫下游改写），而
    //    root-container-normalizer 只在「样式源里已存在该根类规则块」时才改写、**不会凭空补块**
    //    ⇒ 无条件剥会让 420×425 两边皆无（真机产物 inline 只剩 margin:auto，less/scoped 零规则）。
    //    故：剥后无 width/height/flex/aspect-ratio（或只剩 0 值）⇒ 不剥，保留 inline 并打标记。
    if (isRootContainerTag(tag)) {
      if (pxDecls.length === 0) return tag;
      const pxSet = new Set(pxDecls);
      const kept = decls.filter((d) => !pxSet.has(d));
      if (!hasSizeFloor(kept)) {
        stats.rootKeepTags += 1;
        return markRootKeep(tag);
      }
      stats.strippedRootTags += 1;
      stats.strippedRootDecls += pxDecls.length;
      if (kept.length === 0) {
        stats.styleAttrsRemoved += 1;
        return tag.replace(/\s+style\s*=\s*"[^"]*"/, '');
      }
      return tag.replace(/\s+style\s*=\s*"[^"]*"/, ` style="${kept.join(';')};"`);
    }

    if (pxDecls.length === 0) return tag;
    let anchor = resolveAnchorClass(tag);
    let syntheticAnchor = false;
    // ③a 原生元素无锚类 ⇒ 合成「带组件前缀」的语义类（如 `c-device-monitor-hdr-text`）：
    //     这类名不会被 prefix-fixer 改名（它只补缺前缀的类），也不落在根容器词尾上。
    //     组件标签（大写开头）不合成：class 会挂到子组件根元素，可能顶掉子组件自身根样式。
    if (!anchor && compPrefix && styleScoped && /^<[a-z]/.test(tag)) {
      const cat =
        resolveSemanticCategory(tag, {
          inHeaderRight: Boolean(
            headerRange && offset >= headerRange.start && offset < headerRange.end,
          ),
          styleText: styleM[1],
        }) || 'geom';
      const sig = `${cat}|${pxDecls.map((d) => d.replace(/\s+/g, '')).sort().join('|')}`;
      const reused = syntheticBySig.get(sig);
      if (reused) {
        anchor = reused;
        syntheticAnchor = true;
        stats.syntheticReuseTags += 1;
      } else {
        let name;
        do {
          syntheticSeq += 1;
          name = `${compPrefix}-${cat}-${syntheticSeq}`;
        } while (takenClassNames.has(name));
        takenClassNames.add(name);
        syntheticBySig.set(sig, name);
        anchor = name;
        syntheticAnchor = true;
        stats.syntheticTags += 1;
      }
    }
    // ③b 仍无落点（组件标签 / 推不出前缀 / 非 scoped）：保留 inline，打溯源标记（判据降 WARN）
    if (!anchor) {
      stats.noAnchorTags += 1;
      if (!styleScoped) stats.skippedNonScoped += 1;
      return markNoAnchor(tag);
    }

    // ① 合并进已有类块
    //    🛡️ S3（2026-11-16）：同一落点类的同一属性被赋不同值时**不静默覆盖** ——
    //    旧行为是后写覆盖前写（mergeDeclsIntoBody 按属性名替换），前者真值静默丢失，
    //    且 `mc-s4-tab` 这类结构重复类（N 个 tab 共用）必然暴露。现改为首条优先，
    //    冲突登记到注释 + 计数行，判据出 WARN（产物本身仍只有一个确定值）。
    const idxMap = anchorDeclIndex.get(anchor) || new Map();
    const accepted = [];
    let hadConflict = false;
    for (const d of pxDecls) {
      const at = d.indexOf(':');
      if (at < 0) {
        accepted.push(d);
        continue;
      }
      const prop = d.slice(0, at).trim().toLowerCase();
      const val = d.slice(at + 1).trim();
      if (idxMap.has(prop)) {
        const prev = idxMap.get(prop);
        if (prev !== val) {
          hadConflict = true;
          stats.conflictDecls += 1;
          conflictClassSet.add(anchor);
          if (conflictSamples.length < 5) conflictSamples.push(`${anchor}.${prop} ${prev} | ${val}`);
        }
        // 同值重复 ⇒ 幂等（类里已有该声明，inline 照剥）；不同值 ⇒ 冲突，保首条
        continue;
      }
      idxMap.set(prop, val);
      accepted.push(d);
    }
    anchorDeclIndex.set(anchor, idxMap);
    if (accepted.length === 0 && hadConflict) {
      // 整元素的 px 全部与首条冲突 ⇒ 类侧已有同属性首条值，inline 必须剥掉，
      // 否则 inline 优先级更高、会反压类侧首条，「首条优先」落不了地，且判据会 BLOCK。
      // 只登记计数（供人工确认哪个值才是真值），不阻断。
      stats.keptConflictTags += 1;
    }
    stats.movedTags += 1;
    // movedDecls = 从 inline 搬走（并进类块）的声明条数，含「同值幂等重复」
    stats.movedDecls += pxDecls.length;
    if (accepted.length > 0) {
      if (!mergePlan.has(anchor)) mergePlan.set(anchor, []);
      mergePlan.get(anchor).push(...accepted);
    }

    // inline 里只留非长度声明（var()/calc()/url() 等）
    //   注意：删除集是**全部** pxDecls（含被判冲突的那条）。若只删 accepted，冲突值会留在
    //   inline 里反压类侧首条（inline 优先级最高），「保留首条」就落不了地。
    const pxSet = new Set(pxDecls);
    const kept = decls.filter((d) => !pxSet.has(d));
    if (kept.length === 0) {
      stats.styleAttrsRemoved += 1;
      let next = tag.replace(/\s+style\s*=\s*"[^"]*"/, '');
      if (syntheticAnchor) next = withAppendedClass(next, anchor);
      return next;
    }
    let next = tag.replace(/\s+style\s*=\s*"[^"]*"/, ` style="${kept.join(';')};"`);
    if (syntheticAnchor) next = withAppendedClass(next, anchor);
    return next;
  });

  const nextHead = beforeTpl + nextTplPart + afterTpl;
  if (mergePlan.size === 0) {
    return {
      content: appendConflictNote(nextHead + tail, conflictClassSet, conflictSamples, stats),
      stats,
    };
  }

  // 合并进既有块 / 无块则补块
  let nextTail = tail;
  const appendEntries = [];
  for (const [cls, decls] of mergePlan.entries()) {
    const block = findRuleBlock(nextTail, cls);
    if (!block) {
      appendEntries.push([cls, decls]);
      continue;
    }
    const list = mergeDeclsIntoBody(block.body, decls);
    nextTail = nextTail.replace(block.full, `.${cls} { ${list.join('; ')}; }`);
    stats.mergedClasses += 1;
  }
  if (appendEntries.length > 0) {
    const lines = appendEntries.map(([cls, decls]) => {
      // 同一落点类可能被多个元素命中（如 3 个 hdr-text span）⇒ 必须按属性名去重，
      // 否则块里会出现 `gap:4px !important` ×3（真机 0f2346a3 实锤）
      const deduped = mergeDeclsIntoBody('', decls);
      return `  .${cls} { ${deduped.join('; ')}; }`;
    });
    const payload =
      `\n  /* mvgo-inline-styles：布局声明落到元素既有类（不新造类名，px 由 postcss-pxtorem 转 rem）；\n` +
      `     var()/calc()/url() 声明刻意留在 inline，禁止搬进 less（px2rem 会改变量回退值语义）。勿改回 inline 全长 */\n` +
      `${lines.join('\n')}\n`;
    const styleEnd = nextTail.toLowerCase().lastIndexOf('</style>');
    if (styleEnd >= 0) {
      nextTail = nextTail.slice(0, styleEnd) + payload + nextTail.slice(styleEnd);
    } else {
      stats.skippedNoStyleTarget = 1;
      stats.movedTags = 0;
      stats.movedDecls = 0;
      return { content, stats };
    }
    stats.appendedClasses += appendEntries.length;
  }

  let out = appendConflictNote(nextHead + nextTail, conflictClassSet, conflictSamples, stats);
  // fail-closed 复核：每个落点类都必须真的出现在产物里
  for (const cls of mergePlan.keys()) {
    if (!out.includes(`.${cls} {`)) {
      stats.skippedNestedBlock = 1;
      stats.movedTags = 0;
      stats.movedDecls = 0;
      stats.mergedClasses = 0;
      stats.appendedClasses = 0;
      return { content, stats };
    }
  }
  return { content: out, stats };
}
/** C 真机计数行（0 也打，区分「没有 inline px」与「归一失效」） */
export function formatInlinePxStats(prefix, stats) {
  return `${prefix} ${JSON.stringify({
    eligible: stats?.eligible ?? 0,
    scannedTags: stats?.scannedTags ?? 0,
    movedTags: stats?.movedTags ?? 0,
    movedDecls: stats?.movedDecls ?? 0,
    mergedClasses: stats?.mergedClasses ?? 0,
    appendedClasses: stats?.appendedClasses ?? 0,
    strippedRootTags: stats?.strippedRootTags ?? 0,
    strippedRootDecls: stats?.strippedRootDecls ?? 0,
    rootKeepTags: stats?.rootKeepTags ?? 0,
    conflictClasses: stats?.conflictClasses ?? 0,
    conflictDecls: stats?.conflictDecls ?? 0,
    keptConflictTags: stats?.keptConflictTags ?? 0,
    noAnchorTags: stats?.noAnchorTags ?? 0,
    syntheticTags: stats?.syntheticTags ?? 0,
    syntheticReuseTags: stats?.syntheticReuseTags ?? 0,
    skippedNonScoped: stats?.skippedNonScoped ?? 0,
    skippedNestedBlock: stats?.skippedNestedBlock ?? 0,
    styleAttrsRemoved: stats?.styleAttrsRemoved ?? 0,
    skippedNoTruth: stats?.skippedNoTruth ?? 0,
    skippedNoStyleTarget: stats?.skippedNoStyleTarget ?? 0,
    skippedExcludedTag: stats?.skippedExcludedTag ?? 0,
  })}`;
}
