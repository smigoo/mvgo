/**
 * 🛡️ flex 兄弟组感知单一真相源（FLEX-005，2026-09-01 缺口③ 治理）
 *
 * 背景：既有 FLEX-003（同 class 跨文件 flex 值冲突 BLOCK）与 FLEX-004（产物整体
 * 量纲混用 WARN）都是**无兄弟组归属性**的全局视角——FLEX-004 明知「值分属互不相干
 * 嵌套容器时属正常」却无法证明，只能降级 WARN，误报面大、拦截力弱。
 *
 * 本模块补上「可证兄弟组」这一层：解析 template DOM 按父容器分组**真兄弟**，
 * 当同一兄弟组内可证地同时存在像素量级与比例量级的 flex-grow 时 → FLEX-005 BLOCK。
 *
 * 事故实证（mc-max-1788186816669-8f7b5097）：.c-monitor-root 五个兄弟区块里
 * tunnel/vehicle/flow 生效值为 scoped 像素量级（131/142/180），
 * daily/bridge 为 common.less 比例量级（15/17）→ 前三者独占 ~85% 高度，
 * 与 Figma 真值（各约 12~17%）严重不符。
 *
 * 与 code-structure-validator.js 的关系：
 *   - FLEX_GROW_SCALES / extractStyleBlocks / collectStyleSources / buildFlexIndex
 *     从 checkFlexSourceConflicts 抽出为共享实现（validator 再导出保持兼容）；
 *   - detectFlexSiblingIssues 由 validator 的 validate() 消费并入 issues。
 *
 * 判定纪律（BLOCK 必须「可证」，宁可漏报不可误杀）：
 *   1. 兄弟组 = 同一父元素下的直接子元素（template DOM 标签栈扫描）；
 *   2. 父容器可证 flex：inline display:flex，或任一样式源中含 display:flex 的
 *      规则块 selector 命中父元素 class（over-approximate，只为过滤明显非 flex 父级）；
 *   3. 兄弟生效 grow 解析（scoped 优先，见 resolveClassGrows），仅取「唯一确定值」
 *      的兄弟参与量纲判定——多值歧义兄弟交给 FLEX-003，不在此重复拦截；
 *   4. grow=0（附属区/页脚等）不参与量纲统计（与 FLEX-004 的 g>0 过滤一致）；
 *   5. 组内 ≥1 个确定像素量级兄弟 且 ≥1 个确定比例量级兄弟 → FLEX-005 BLOCK。
 *
 * ⚠️ 量纲铁律（2026-09-09 修订：fixer 已从像素改为系数，与以下共识同步修正）：
 *   系数量级 grow（`flex: <flexGrow系数> 1 0`，avg=1 量纲如 0.978 / 1.061）是
 *   **规范要求的正确写法**；像素量级 grow（`flex: 131 1 0`）是过时写法，本校验器
 *   会将其标记为异常。病灶从来不是「grow 值大」，而是**同一兄弟组内两种量纲混排**。
 *   严禁把系数量级 grow 归一化成 1（会抹平设计稿比例）。
 */

/**
 * flex-grow 量纲阈值（无灰区：两阈值相邻 19/20，刻意不留空档）。
 *   - PIXEL_MIN：grow >= 20 视为「像素量级」（过时写法，fixer 不应再输出）
 *   - RATIO_MAX：grow <= 19 视为「系数量级」（flexGrow 系数 avg=1，规范要求的正确写法）
 * 初版 11~19 灰区把 12/15/17 这类最典型的比例值全部漏判（Task3 实证零命中），
 * 量纲判定宁可偏宽也不可留缝。注意 flexGrow 系数（~1 量级）天然落在 RATIO_MAX 内，
 * 所以正常生成的组件不会触发像素告警——阈值设计已成为安全兜底。
 */
export const FLEX_GROW_SCALES = Object.freeze({
  PIXEL_MIN: 20,
  RATIO_MAX: 19,
});

const FLEX_DECL_RX = /(?:^|[;{\n])\s*flex\s*:\s*([^;}]+)/gi;
const GROW_DECL_RX = /(?:^|[;{\n])\s*flex-grow\s*:\s*([^;}]+)/gi;

/**
 * 🛡️ 刀 16a（2026-09-13）：一条 CSS 规则**真正作用的元素**上的 class（= 最右复合选择器）。
 *
 * CSS 语义：规则只作用于选择器**最右**的复合选择器（目标元素），左侧全是祖先/条件。
 *   `.a > .b { flex: 0 0 46px }` → 只作用于 .b（`.a` 只是祖先条件）
 *   `.a .b { … }`                → 只作用于 .b
 *   `.a.b { … }`                 → 同一元素同时带 a/b → 两个都算
 *   `.a, .b { … }`               → 逗号分组各自独立作用 → 两个都算
 *   `.a:not(.b) > .c { … }`      → 只作用于 .c（`:not()` 参数内的 .b 不是目标元素）
 *
 * 旧实现（`CLASS_RX` 直扫 selector）对选择器里**所有** class 一视同仁登记同一组声明 →
 * `.A > .B { flex: 0 0 46px }` 把 B 的值记到 A 头上 → 同一文件里 A 出现两个 grow
 * （自己的 1 与后代的 0）→ FLEX-003 假阳性 BLOCK。
 * 实锤 `mc-1789313554441-b3bc70a3`：`.c-device-monitor-section-main-content` 被
 * `.c-device-monitor-section-main-content > .c-device-monitor-tab { flex: 0 0 46px }` 污染。
 *
 * 伪类参数剥离是**文本级**的（与 class-dialect-normalizer#findPseudoArgRanges 同源思路，
 * 但那返回范围数组、且会引入跨模块依赖；此处保持本模块零依赖）。
 *
 * @param {string} selector 规则的选择器原文（可含逗号分组 / 组合符 / 伪类）
 * @returns {string[]} 目标元素上的 class（去重，保序）
 */
export function targetClassesOf(selector = '') {
  const out = [];
  for (const group of String(selector).split(',')) {
    // 剥掉伪类函数参数（`:not(.x)` / `:is(.y)` 里的类名不是目标元素）；两遍覆盖一层嵌套
    let cleaned = group;
    for (let i = 0; i < 2; i += 1) {
      cleaned = cleaned.replace(/:[a-zA-Z-]+\([^()]*\)/g, ':');
    }
    const compounds = cleaned.trim().split(/[\s>+~]+/).filter(Boolean);
    const last = compounds[compounds.length - 1] || '';
    for (const m of last.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) out.push(m[1]);
  }
  return [...new Set(out)];
}

const VOID_TAGS = new Set([
  'img', 'br', 'hr', 'input', 'meta', 'link', 'path', 'circle',
  'rect', 'line', 'polyline', 'polygon', 'use', 'source', 'area',
  'col', 'embed', 'track', 'wbr',
]);

/** 标签扫描正则：引号内属性值可含 ">"，不会被误当标签结束符 */
const TAG_RX = /<(\/)?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

/**
 * 提取样式规则块 { selector { body } }（含一层嵌套），flex 系列检查共用。
 *
 * ⚠️ 2026-09-01 FLEX-005 实锤修复：顶层无块 @ 指令（@import/@charset 等）必须先剥离——
 * 否则 `@import '...';` 会与下一条规则的 selector 粘连（selector 形如
 * `@import '...'; .c-monitor-tunnel-hourly`），被「selector 含 @ 跳过」规则整块丢弃。
 * 实锤：mc-max-1788186816669-8f7b5097 的 TunnelHourly.vue <style> 顶部 @import 导致
 * 首条 `.c-monitor-tunnel-hourly { flex: 131 1 0 }` 整块丢失，scoped 131 从未进入索引，
 * FLEX-003/005 双双漏报。既有 FLEX-003 用例无 @import 形态，零回归。
 *
 * @param {string} styleContent
 * @returns {Array<{ selector: string, body: string }>}
 */
export function extractStyleBlocks(styleContent) {
  const blocks = [];
  if (!styleContent || typeof styleContent !== 'string') return blocks;
  // 剥离顶层无块 @ 指令（@import/@charset/@plugin + LESS 变量定义如 @fontSize: 14px;）。
  // ⚠️ 2026-09-03 根治：原正则只剥 @import/@charset/@plugin，漏了 LESS 变量定义 ——
  // 变量定义残留会与下一个规则块 selector 粘连（`@fontSize: 14px;\n\n.c-x {...}`），
  // 使 selector 含 '@' 被整体跳过，该块的 flex-grow（如 flex:131 1 0）漏索引 → FLEX-005
  // 漏检（流量监测 mc-max-1788366123410 高度比例事故实锤）。带块的 @media/@keyframes 以
  // '{' 结尾（无 ';'），不会被本正则误剥。
  const cleaned = styleContent.replace(/@[a-zA-Z][\w-]*\b[^;{]*;/gi, '');
  const re = /([^{}]+)\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const selector = m[1].trim();
    const body = m[2];
    if (selector && body && !selector.includes('@')) {
      blocks.push({ selector, body });
    }
  }
  return blocks;
}

/**
 * 解析 flex 声明值的 grow 数值（宽口径：`131 1 0` / `1` / `grow: 5` 均可）。
 * 非数值开头（none/auto/initial 等）返回 null。
 * @param {string} raw 如 "131 1 0"、"1"、"grow: 5"
 * @returns {number|null}
 */
export function parseGrowFromFlexValue(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const v = raw.trim().replace(/\s+/g, ' ');
  if (/^grow:/i.test(v)) {
    const g = Number(v.replace(/^grow:\s*/i, ''));
    return Number.isFinite(g) ? g : null;
  }
  const m = v.match(/^(\d+(?:\.\d+)?)(?:\s|$)/);
  return m ? Number(m[1]) : null;
}

/**
 * 量纲分类：'pixel'（像素量级）/ 'ratio'（比例量级）/ null（grow=0 或非法，不参与）。
 * @param {number} grow
 */
export function classifyGrowScale(grow) {
  if (!Number.isFinite(grow) || grow <= 0) return null;
  if (grow >= FLEX_GROW_SCALES.PIXEL_MIN) return 'pixel';
  if (grow <= FLEX_GROW_SCALES.RATIO_MAX) return 'ratio';
  return null; // 理论不可达（无灰区），防御性兜底
}

/**
 * 收集全部样式源：.vue 的 <style> 块（记录 scoped 标记）+ .less/.css 全文。
 * R1 同源原则：一律取内存 files，不读磁盘。
 * ⚠️ 编译产物排除：与同名 .less 共存的 .css 是 LESS 编译产物（会展开 mixin/层叠、
 * 归一化 grow 值），当独立样式源会凭空造假冲突（实锤：Task3 由 2 条真冲突膨胀到 6 条假冲突）。
 * @param {Array<{path:string, content:string}>} files
 * @returns {Array<{file:string, scoped:boolean, content:string}>}
 */
export function collectStyleSources(files = []) {
  const sources = [];
  if (!Array.isArray(files)) return sources;

  const lessBasenames = new Set(
    files
      .filter((f) => /\.less$/i.test(f?.path || ''))
      .map((f) => (f.path || '').replace(/.*\//, '').replace(/\.less$/i, '')),
  );

  for (const f of files) {
    if (!f || typeof f.content !== 'string') continue;
    const p = f.path || '';
    if (/\.css$/i.test(p)) {
      const base = p.replace(/.*\//, '').replace(/\.css$/i, '');
      if (lessBasenames.has(base)) continue; // 同名 .less 的编译产物 → 跳过
    }
    if (p.endsWith('.vue')) {
      const styleTags = f.content.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
      for (const tag of styleTags) {
        const bodyMatch = tag.match(/>([\s\S]*?)<\/style>/i);
        const body = bodyMatch ? bodyMatch[1] : '';
        if (!body) continue;
        sources.push({
          file: p,
          scoped: /<style[^>]*scoped/i.test(tag),
          content: body,
        });
      }
    } else if (/\.(less|css)$/i.test(p)) {
      sources.push({ file: p, scoped: false, content: f.content });
    }
  }
  return sources;
}

/**
 * 建立 class → flex 声明索引 + 严格口径 grow 全集。
 *
 *   byClass：class → [{file, scoped, values(原始串，FLEX-003 按字符串比对),
 *                      grows(宽口径数值，供兄弟生效值解析)}]
 *   allGrows：{file, scoped, grow}（严格口径：仅 `N 1 0` 三元组与 `grow: N`，
 *              与既有 FLEX-004 行为逐字对齐——`flex: 1` 裸简写历史上不计入）
 *
 * @param {Array<{file:string, scoped:boolean, content:string}>} sources
 */
export function buildFlexIndex(sources = []) {
  const byClass = new Map();
  const allGrows = [];

  for (const src of sources) {
    for (const b of extractStyleBlocks(src.content)) {
      const flexVals = [];
      let m;
      FLEX_DECL_RX.lastIndex = 0;
      while ((m = FLEX_DECL_RX.exec(b.body)) !== null) {
        flexVals.push(m[1].trim().replace(/\s+/g, ' '));
      }
      GROW_DECL_RX.lastIndex = 0;
      while ((m = GROW_DECL_RX.exec(b.body)) !== null) {
        flexVals.push(`grow: ${m[1].trim().replace(/\s+/g, ' ')}`);
      }
      if (flexVals.length === 0) continue;

      // 严格口径（FLEX-004 兼容）：三元组 / grow-only
      for (const v of flexVals) {
        const triple = v.match(/^(\d+)\s+[01]\s+(0|auto)$/);
        const growOnly = v.match(/^grow:\s*(\d+)$/);
        const num = triple ? parseInt(triple[1], 10) : growOnly ? parseInt(growOnly[1], 10) : null;
        if (num !== null) {
          allGrows.push({ file: src.file, scoped: src.scoped, grow: num });
        }
      }

      // 宽口径（兄弟生效值解析）：裸 `flex: 1` 也计入
      const grows = flexVals
        .map((v) => parseGrowFromFlexValue(v))
        .filter((g) => g !== null && Number.isFinite(g));

      // 🛡️ 刀 16a：只登记「目标元素」上的 class（最右复合选择器），
      // 避免 `.A > .B { flex }` 把 B 的值记到祖先 A 头上 → 同文件出现两个 grow → FLEX-003 假阳性。
      for (const cls of targetClassesOf(b.selector)) {
        if (!byClass.has(cls)) byClass.set(cls, []);
        byClass.get(cls).push({ file: src.file, scoped: src.scoped, values: flexVals, grows });
      }
    }
  }

  return { byClass, allGrows };
}

/**
 * 解析 class 的「生效」grow 集合：scoped 源优先（编译后 (0,2,0) 恒胜非 scoped (0,1,0)，
 * 事故实证机制）；无 scoped 时取全部非 scoped 源的并集。
 * @returns {{ grows: number[], sourceFiles: string[], ambiguous: boolean }}
 *   ambiguous=true：生效值不唯一（同 scopedness 下多值，量纲判定不参与，交 FLEX-003）
 */
export function resolveClassGrows(cls, flexIndex) {
  const empty = { grows: [], sourceFiles: [], ambiguous: false };
  if (!cls || !flexIndex?.byClass) return empty;
  const entries = flexIndex.byClass.get(cls) || [];
  const bearing = entries.filter((e) => e.grows && e.grows.length > 0);
  if (bearing.length === 0) return empty;

  const scopedEntries = bearing.filter((e) => e.scoped);
  const chosen = scopedEntries.length > 0 ? scopedEntries : bearing;

  const grows = new Set();
  const files = new Set();
  for (const e of chosen) {
    e.grows.forEach((g) => grows.add(g));
    files.add(e.file);
  }
  return {
    grows: [...grows],
    sourceFiles: [...files],
    ambiguous: grows.size > 1,
  };
}

/**
 * 解析 .vue 文件 template 的元素树 + 兄弟组。
 * 标签栈扫描：支持 void 元素、自闭合、引号内 ">"、注释剥离、行号定位。
 *
 * @param {string} content .vue 全文
 * @returns {{
 *   hasTemplate: boolean,
 *   roots: Array<Node>,
 *   groups: Array<{ parent: {tag, classes, inlineDisplayFlex, line}, siblings: Array<Node> }>,
 * }}
 *   Node = { tag, classes: string[], inlineGrows: number[], inlineDisplayFlex: boolean, children: Node[], line: number }
 */
export function parseVueTemplate(content) {
  const result = { hasTemplate: false, roots: [], groups: [] };
  if (typeof content !== 'string' || !content) return result;

  const tm = content.match(/<template[^>]*>([\s\S]*)<\/template>/i);
  if (!tm) return result;
  result.hasTemplate = true;

  // 剥离注释（占位注释不构成兄弟）
  const tpl = tm[1].replace(/<!--[\s\S]*?-->/g, '');

  const stack = [];
  TAG_RX.lastIndex = 0;
  let m;
  while ((m = TAG_RX.exec(tpl)) !== null) {
    const closing = !!m[1];
    const tag = m[2];
    const attrsRaw = m[3] || '';

    if (closing) {
      // 容错弹出：匹配到最近同名开标签（模板畸形时不至于错位到文件尾）
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const line = (tpl.slice(0, m.index).match(/\n/g) || []).length + 1;
    const styleVal = extractAttrValue(attrsRaw, 'style');
    const node = {
      tag,
      classes: extractAttrValue(attrsRaw, 'class').split(/\s+/).filter(Boolean),
      inlineGrows: extractInlineFlexGrows(styleVal),
      inlineDisplayFlex: /display\s*:\s*flex/i.test(styleVal || ''),
      children: [],
      line,
    };

    const parent = stack[stack.length - 1] || null;
    if (parent) parent.children.push(node);
    else result.roots.push(node);

    const selfClosing = /\/\s*$/.test(attrsRaw) || VOID_TAGS.has(tag.toLowerCase());
    if (!selfClosing) stack.push(node);
  }

  const walk = (n) => {
    if (n.children.length >= 2) {
      result.groups.push({
        parent: {
          tag: n.tag,
          classes: n.classes,
          inlineDisplayFlex: n.inlineDisplayFlex,
          line: n.line,
        },
        siblings: n.children,
      });
    }
    n.children.forEach(walk);
  };
  result.roots.forEach(walk);
  return result;
}

/** 提取静态属性值（class/style）；动态绑定 :class/:style 前缀排除 */
function extractAttrValue(attrsRaw, name) {
  if (!attrsRaw) return '';
  const re = new RegExp(`(?<![:@\\w-])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
  const m = attrsRaw.match(re);
  return m ? (m[1] ?? m[2] ?? '') : '';
}

/** 解析 inline style 中的 flex / flex-grow 声明 grow 值 */
function extractInlineFlexGrows(styleVal) {
  const grows = [];
  if (!styleVal) return grows;
  const flexM = styleVal.match(/(?:^|;)\s*flex\s*:\s*([^;]+)/i);
  if (flexM) {
    const g = parseGrowFromFlexValue(flexM[1]);
    if (g !== null) grows.push(g);
  }
  const growM = styleVal.match(/(?:^|;)\s*flex-grow\s*:\s*([^;]+)/i);
  if (growM) {
    const g = Number(String(growM[1]).trim());
    if (Number.isFinite(g)) grows.push(g);
  }
  return grows;
}

/**
 * 🛡️ FLEX-005：可证兄弟组 flex-grow 量纲混用检测（BLOCK 级）。
 *
 * 判定纪律见模块 docblock。返回 issue 数组（与 validator 的 push 形态对齐），
 * 校验器异常兜底由调用方 try/catch 负责（同 FLEX-CHECK-ERROR 策略）。
 *
 * @param {Array<{path:string, content:string}>} files 全量产物文件（内存态，不读磁盘）
 * @returns {Array<{id:string, severity:string, file:string, message:string, hint:object}>}
 */
export function detectFlexSiblingIssues(files = []) {
  const issues = [];
  if (!Array.isArray(files) || files.length === 0) return issues;

  const sources = collectStyleSources(files);
  const flexIndex = buildFlexIndex(sources);

  const vueFiles = files.filter(
    (f) => f && typeof f.content === 'string' && /\.vue$/i.test(f.path || ''),
  );
  if (vueFiles.length === 0) return issues;

  // 每文件只解析一次；同时建立「组件标签名 → 子组件模板根」解析表
  const parsedByFile = new Map();
  const compRoots = new Map();
  for (const f of vueFiles) {
    const parsed = parseVueTemplate(f.content);
    parsedByFile.set(f.path, parsed);
    if (parsed.roots.length === 1) {
      const base = (f.path || '').replace(/.*\//, '').replace(/\.vue$/i, '');
      compRoots.set(base, parsed.roots[0]);
    }
  }

  // flex 容器 class 全集（over-approximate）：任一 display:flex 规则块 selector 中的 class
  const flexContainerClasses = new Set();
  for (const src of sources) {
    for (const b of extractStyleBlocks(src.content)) {
      if (!/display\s*:\s*flex/i.test(b.body)) continue;
      // 🛡️ 刀 16a：flex 容器 = `display:flex` 规则的**目标元素**；祖先不因后代规则而变 flex。
      for (const cls of targetClassesOf(b.selector)) flexContainerClasses.add(cls);
    }
  }

  for (const f of vueFiles) {
    const parsed = parsedByFile.get(f.path);
    for (const group of parsed.groups) {
      const parent = group.parent;

      // 条件②：父容器可证 flex（inline 或 class 命中 flex 容器全集；组件标签父级解析其根元素）
      let parentFlexProvable =
        parent.inlineDisplayFlex ||
        parent.classes.some((c) => flexContainerClasses.has(c));
      if (!parentFlexProvable && /^[A-Z]/.test(parent.tag)) {
        const root = compRoots.get(parent.tag) || compRoots.get(parent.tag.toLowerCase());
        if (root) {
          parentFlexProvable =
            root.inlineDisplayFlex || root.classes.some((c) => flexContainerClasses.has(c));
        }
      }
      if (!parentFlexProvable) continue;

      // 逐兄弟解析生效 grow
      const infos = [];
      for (const sib of group.siblings) {
        const info = describeSiblingGrow(sib, flexIndex, compRoots);
        if (info) infos.push(info);
      }
      const flexBearing = infos.filter((i) => i.grows.some((g) => g > 0));
      if (flexBearing.length < 2) continue; // 条件①：至少两个承载 flex 的兄弟

      const definitive = flexBearing.filter((i) => !i.ambiguous && i.grows.length === 1);
      const hasPixel = definitive.some((i) => classifyGrowScale(i.grows[0]) === 'pixel');
      const hasRatio = definitive.some((i) => classifyGrowScale(i.grows[0]) === 'ratio');
      if (!(hasPixel && hasRatio)) continue; // 条件⑤：可证的量纲混用

      const desc = flexBearing
        .map((i) => {
          const scale = i.ambiguous || i.grows.length > 1
            ? '（多值，见 FLEX-003）'
            : classifyGrowScale(i.grows[0]) === 'pixel' ? '【像素量级】' : '【比例量级】';
          const clsPart = i.primaryClass ? `.${i.primaryClass}` : '';
          const compPart = i.isComponent ? `（组件，根 ${clsPart || '无 class'}）` : '';
          const srcPart = i.sourceFiles.length > 0 ? `（${i.sourceFiles.join(' ↔ ')}）` : '（inline style）';
          return `${i.tag}${i.isComponent ? '' : clsPart} → flex:${i.grows.join('/')} ${srcPart}${compPart}${scale}`;
        })
        .join('；');

      const parentDesc = parent.classes.length > 0
        ? `.${parent.classes[0]}`
        : `<${parent.tag}>`;

      issues.push({
        id: 'FLEX-005',
        severity: 'BLOCK',
        file: f.path,
        message: `兄弟区块 flex-grow 量纲混用（${f.path} 模板 ${parentDesc} 内）：${desc}。像素量级（Figma 高度写法）与比例量级在同一兄弟组混排，比例量级区块将被严重挤压（例：131 与 15 同组 → 前者独占 ~90% 高度），各区块高度比例与 Figma 设计稿不符`,
        hint: {
          suggestion: '同一组兄弟区块统一量纲：全部写 `flex: <Figma高度px> 1 0`（grow 取各区块的 Figma 高度真值）；若某兄弟报「多值」，先按 FLEX-003 删掉跨文件重复声明',
        },
      });
    }
  }

  return issues;
}

/**
 * 解析单个兄弟元素的生效 flex-grow。
 * @returns {null|{
 *   tag: string, primaryClass: string|null, isComponent: boolean,
 *   grows: number[], sourceFiles: string[], ambiguous: boolean, line: number
 * }}
 *   无任何 flex 声明（含组件根解析后仍无）返回 null。
 */
function describeSiblingGrow(node, flexIndex, compRoots) {
  const grows = new Set();
  const sourceFiles = new Set();
  let ambiguous = false;
  let primaryClass = node.classes[0] || null;

  const consumeClasses = (classes) => {
    for (const cls of classes) {
      const resolved = resolveClassGrows(cls, flexIndex);
      if (resolved.grows.length === 0) continue;
      if (primaryClass === null) primaryClass = cls;
      if (resolved.ambiguous) ambiguous = true;
      resolved.grows.forEach((g) => grows.add(g));
      resolved.sourceFiles.forEach((sf) => sourceFiles.add(sf));
    }
  };

  consumeClasses(node.classes);

  // 组件标签（首字母大写且非原生标签）→ 解析子组件模板根元素 class
  let isComponent = false;
  if (/^[A-Z]/.test(node.tag)) {
    const root = compRoots.get(node.tag) || compRoots.get(node.tag.toLowerCase());
    if (root) {
      isComponent = true;
      if (primaryClass === null) primaryClass = root.classes[0] || null;
      consumeClasses(root.classes);
      root.inlineGrows.forEach((g) => grows.add(g));
    }
  }

  node.inlineGrows.forEach((g) => grows.add(g));

  if (grows.size === 0) return null;
  return {
    tag: isComponent ? `<${node.tag}>` : node.tag,
    primaryClass,
    isComponent,
    grows: [...grows],
    sourceFiles: [...sourceFiles],
    ambiguous,
    line: node.line,
  };
}

/**
 * 🛡️ FLEX-003 确定性归一（2026-09-02，mc-max-1788362388732-1ae956dc 重试耗尽实锤）。
 *
 * FLEX-003 与 FLEX-004/005 不同：后者是「不同兄弟 class 之间量纲混用」（需 Figma 高度
 * 真值才能换算，后处理无法自行换算，故交给 L0-B 拦截）；而 FLEX-003 是「**同一个 class**
 * 跨文件写了不同的 flex grow 值」（如 index.vue scoped 写 `flex:113 1 0`、common.less 写
 * `flex:1 1 0`）——同一 class 本就是同一区块，正确值唯一，即「像素量级」那份（规范要求
 * `flex: <Figma高度px> 1 0`，grow 取设计稿高度）。比例量级那份是 LLM 冗余误写、且因
 * scoped 优先级（0,2,0）恒胜 common.less（0,1,0）而成死样式。LLM 重试反复犯同一错误，
 * 系统必须确定性归一（对齐到像素量级那份），否则重试必耗尽。
 *
 * 策略（保守、可证、幂等）：
 *   1. 同 class 跨文件 grow 量纲冲突（一份 pixel>=20、一份 ratio 1..19）才归一；
 *   2. 目标值 = 像素量级那份的 grow；
 *   3. 只改写「比例量级」文件的 flex/flex-grow 声明（grow>0 且 <=RATIO_MAX，排除 grow=0
 *      的附属区），保留该块其余属性（display/flex-direction/overflow/min-height 不动）。
 *
 * @param {Array<{path:string, content:string}>} files 全量产物文件（内存态）
 * @returns {Array<{path:string, content:string}>} 归一后的 files（未改动则返回原引用）
 */
export function normalizeFlexSourceConflicts(files = []) {
  if (!Array.isArray(files) || files.length < 2) return files;
  const sources = collectStyleSources(files);
  if (sources.length < 2) return files;
  const { byClass } = buildFlexIndex(sources);

  // 冲突定位：同 class 跨文件 grow 量纲冲突（pixel vs ratio），只取每文件最后生效 grow
  const fixesByFile = new Map(); // file -> [{cls, toGrow}]
  for (const [cls, entries] of byClass) {
    const fileLastGrow = new Map(); // file -> lastGrow（宽口径最后生效值）
    for (const e of entries) {
      const last = Array.isArray(e.grows) && e.grows.length ? e.grows[e.grows.length - 1] : null;
      if (last === null || !Number.isFinite(last) || last <= 0) continue;
      fileLastGrow.set(e.file, last);
    }
    if (fileLastGrow.size < 2) continue;
    const pixelGrow = [...fileLastGrow.values()].find(
      (g) => g >= FLEX_GROW_SCALES.PIXEL_MIN,
    );
    if (pixelGrow === undefined) continue;
    const ratioFiles = [...fileLastGrow.entries()]
      .filter(([, g]) => g > 0 && g <= FLEX_GROW_SCALES.RATIO_MAX)
      .map(([f]) => f);
    if (ratioFiles.length === 0) continue;
    for (const f of ratioFiles) {
      if (!fixesByFile.has(f)) fixesByFile.set(f, []);
      fixesByFile.get(f).push({ cls, toGrow: pixelGrow });
    }
  }
  if (fixesByFile.size === 0) return files;

  const rewrite = (body, toGrow) => {
    let out = body;
    // flex: N 1 0 三元组（比例量级 N）
    out = out.replace(/flex\s*:\s*(\d+)\s+([01])\s+(0|auto)\b/g, (m, g, s, b) => {
      const gv = parseInt(g, 10);
      return gv > 0 && gv <= FLEX_GROW_SCALES.RATIO_MAX ? `flex: ${toGrow} ${s} ${b}` : m;
    });
    // flex: N 裸简写（N 后跟 ; 或行尾）
    out = out.replace(/flex\s*:\s*(\d+)\s*(?:;|$)/g, (m, g) => {
      const gv = parseInt(g, 10);
      return gv > 0 && gv <= FLEX_GROW_SCALES.RATIO_MAX ? `flex: ${toGrow} 1 0;` : m;
    });
    // flex-grow: N
    out = out.replace(/flex-grow\s*:\s*(\d+)/g, (m, g) => {
      const gv = parseInt(g, 10);
      return gv > 0 && gv <= FLEX_GROW_SCALES.RATIO_MAX ? `flex-grow: ${toGrow}` : m;
    });
    return out;
  };

  let changedAny = false;
  const outFiles = files.map((f) => {
    const fixes = fixesByFile.get(f?.path || '');
    if (!fixes || typeof f?.content !== 'string') return f;
    let content = f.content;
    let changed = false;
    for (const fx of fixes) {
      const esc = fx.cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const blockRe = new RegExp(`(\\.${esc}\\s*\\{)([^{}]*)(\\})`, 'g');
      content = content.replace(blockRe, (whole, head, body, close) => {
        const newBody = rewrite(body, fx.toGrow);
        if (newBody === body) return whole;
        changed = true;
        return head + newBody + close;
      });
    }
    if (changed) {
      changedAny = true;
      return { ...f, content };
    }
    return f;
  });
  return changedAny ? outFiles : files;
}

/**
 * 🛡️ FLEX-005 确定性归一（2026-09-03，mc-max-1788373364090 重试耗尽实锤；
 * 2026-09-08 归一方向修正，mc-max-1788917942199-ba330e3e 等分抹平比例实锤）。
 *
 * FLEX-005 检测到「不同兄弟 class 之间量纲混用」（如 SummaryCards flex:1 比例 +
 * TabAndContent flex:317 像素）后，BLOCK + 重试无法修正——LLM 拿不到 section 的 Figma
 * 高度真值（vision section 无 absoluteBoundingBox.height，subcomponent-planner
 * extractLayoutMetadata 恒 0），重试确定性复现 flex:1 vs flex:317 → 重试耗尽，用户拿不到产物。
 *
 * 本函数在 BLOCK 前做确定性归一：把「像素量级」兄弟（grow >= PIXEL_MIN）按同组像素兄弟
 * 的占比归一化为「比例量级」，即 flex: <px> 1 0 → flex: (px / groupPixelSum) 1 0，
 * 使整组兄弟落到同一量纲，同时保留设计稿相对比例。
 *
 * ⛔ 量纲铁律：严禁把像素量级 grow 统一归一化成 flex:1 1 0（等分）。2026-09-08 实锤
 * mc-max-1788917942199-ba330e3e：BridgeChart(flex:131) 与 FlowPrediction(flex:174)
 * 被等分抹平为 1:1，丢失设计稿 131:174 相对比例，属确定性错误产物。
 * 像素量级 grow（flex: <Figma高度px> 1 0）是规范要求的正确写法，病灶仅在「同一兄弟组内
 * 两种量纲混排」，归一应保留比例而非抹平比例。
 *
 * @param {Array<{path:string, content:string}>} files 全量产物文件（内存态）
 * @returns {Array<{path:string, content:string}>} 归一后的 files（未改动则返回原引用）
 */
export function normalizeFlexSiblingScale(files = []) {
  if (!Array.isArray(files) || files.length === 0) return files;
  const sources = collectStyleSources(files);
  const flexIndex = buildFlexIndex(sources);
  const vueFiles = files.filter(
    (f) => f && typeof f.content === 'string' && /\.vue$/i.test(f.path || ''),
  );
  if (vueFiles.length === 0) return files;

  // 与 detectFlexSiblingIssues 同源的解析：compRoots + flex 容器全集
  const parsedByFile = new Map();
  const compRoots = new Map();
  for (const f of vueFiles) {
    const parsed = parseVueTemplate(f.content);
    parsedByFile.set(f.path, parsed);
    if (parsed.roots.length === 1) {
      const base = (f.path || '').replace(/.*\//, '').replace(/\.vue$/i, '');
      compRoots.set(base, parsed.roots[0]);
    }
  }
  const flexContainerClasses = new Set();
  for (const src of sources) {
    for (const b of extractStyleBlocks(src.content)) {
      if (!/display\s*:\s*flex/i.test(b.body)) continue;
      // 🛡️ 刀 16a：flex 容器 = `display:flex` 规则的**目标元素**；祖先不因后代规则而变 flex。
      for (const cls of targetClassesOf(b.selector)) flexContainerClasses.add(cls);
    }
  }

  // 定位像素量级兄弟：file -> Map<class, proportion（像素占比 0~1）>
  const pixelFixes = new Map();
  for (const f of vueFiles) {
    const parsed = parsedByFile.get(f.path);
    for (const group of parsed.groups) {
      const parent = group.parent;
      let parentFlexProvable =
        parent.inlineDisplayFlex ||
        parent.classes.some((c) => flexContainerClasses.has(c));
      if (!parentFlexProvable && /^[A-Z]/.test(parent.tag)) {
        const root = compRoots.get(parent.tag) || compRoots.get(parent.tag.toLowerCase());
        if (root) {
          parentFlexProvable =
            root.inlineDisplayFlex || root.classes.some((c) => flexContainerClasses.has(c));
        }
      }
      if (!parentFlexProvable) continue;
      const infos = [];
      for (const sib of group.siblings) {
        const info = describeSiblingGrow(sib, flexIndex, compRoots);
        if (info) infos.push(info);
      }
      const flexBearing = infos.filter((i) => i.grows.some((g) => g > 0));
      if (flexBearing.length < 2) continue;
      const definitive = flexBearing.filter((i) => !i.ambiguous && i.grows.length === 1);
      const hasPixel = definitive.some((i) => classifyGrowScale(i.grows[0]) === 'pixel');
      const hasRatio = definitive.some((i) => classifyGrowScale(i.grows[0]) === 'ratio');
      if (!(hasPixel && hasRatio)) continue;
      // 混用组：收集本组所有像素量级兄弟的原始 pixel 值，按比例归一化。
      // pixelFixes: file -> Map<class, proportion>
      const pixelGroup = [];
      for (const i of definitive) {
        if (classifyGrowScale(i.grows[0]) !== 'pixel') continue;
        if (!i.primaryClass) continue;
        pixelGroup.push({ info: i, pixelValue: i.grows[0] });
      }
      if (pixelGroup.length === 0) continue;
      const totalPixel = pixelGroup.reduce((s, p) => s + p.pixelValue, 0);
      for (const { info: i, pixelValue } of pixelGroup) {
        const proportion = totalPixel > 0 ? pixelValue / totalPixel : 1 / pixelGroup.length;
        for (const sf of i.sourceFiles || []) {
          if (!pixelFixes.has(sf)) pixelFixes.set(sf, new Map());
          pixelFixes.get(sf).set(i.primaryClass, proportion);
        }
      }
    }
  }
  if (pixelFixes.size === 0) return files;

  let changedAny = false;
  const outFiles = files.map((f) => {
    const classMap = pixelFixes.get(f?.path || '');
    if (!classMap || typeof f?.content !== 'string') return f;
    let content = f.content;
    let changed = false;
    for (const [cls, proportion] of classMap) {
      const proportionStr = proportion.toFixed(3);
      const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const blockRe = new RegExp(`(\\.${esc}\\s*\\{)([^{}]*)(\\})`, 'g');
      content = content.replace(blockRe, (whole, head, body, close) => {
        const newBody = body.replace(
          /flex\s*:\s*(\d+)\s+([01])\s+(0|auto)\b/g,
          (m, g, s, b) => {
            const gv = parseInt(g, 10);
            return gv >= FLEX_GROW_SCALES.PIXEL_MIN ? `flex: ${proportionStr} ${s} ${b}` : m;
          },
        );
        if (newBody === body) return whole;
        changed = true;
        return head + newBody + close;
      });
    }
    if (changed) {
      changedAny = true;
      return { ...f, content };
    }
    return f;
  });
  return changedAny ? outFiles : files;
}
