/**
 * CodeStructureValidator - L0-B 自验器
 *
 * 在 microcode-engineer / vue3-engineer 输出 generatedFiles 后立即执行，
 * 校验生成的 Vue 文件是否符合 scoped-less 标准。
 *
 * 检查项适用范围：
 *   两者通用：CODE-001 / CODE-002 / CODE-004 / CODE-005 / CODE-006 / CODE-008
 *   仅微码：  CODE-003 / CODE-009
 *   仅 Vue3： CODE-007
 */

const HOST_STYLE_LEAK_PATTERNS = [
  {
    id: 'CODE-004',
    severity: 'BLOCK',
    regex: /@apply\b|@tailwind\b|@layer\b/,
    message: '检测到 Tailwind 指令，生成组件禁止依赖宿主 Tailwind 样式链',
  },
  {
    id: 'CODE-005',
    severity: 'BLOCK',
    regex:
      /from\s*["']@inspira-ui\/plugins["']|from\s*["']tailwindcss["']|from\s*["']tw-animate-css["']|import\s*["']@inspira-ui\/plugins["']|import\s*["']tailwindcss["']|import\s*["']tw-animate-css["']/,
    message: '检测到宿主 UI / Tailwind 依赖导入，生成组件必须保持自包含',
  },
  // CODE-006 是硬编码 Tailwind utility class 名单的复杂正则，误杀面大，降级 WARN（不阻断，仅提示精修）
  {
    id: 'CODE-006',
    severity: 'WARN',
    regex:
      /\bclass\s*=\s*["'](?:[^"']*\s)?(?:flex|grid|inline-flex|items-center|justify-center|justify-between|gap-\d+|p[xytrbl]?-[\w.\/[\]-]+|m[xytrbl]?-[\w.\/[\]-]+|text-(?:xs|sm|base|lg|xl|\d+xl)|font-(?:bold|semibold|medium|light)|bg-[\w/\-[\]]+|rounded(?:-[\w/\-[\]]+)?|border(?:-[\w/\-[\]]+)?|shadow(?:-[\w/\-[\]]+)?|w-(?:full|\d+)|h-(?:full|\d+))\b(?:\s[^"']*)?["']/i,
    message: '检测到疑似 Tailwind utility class，生成组件禁止依赖宿主原子类',
  },
];

// CODE-011/012 用 AST 结构分析检测 echarts 时序与 resize 监听（非正则写法枚举），
// 避免「每发现一种等价写法就硬编码一个分支」的脆弱模式。
import {
  checkEchartsInitTiming,
  checkEchartsResizeListener,
} from '../utils/echarts-init-guard.js';
import { compileDesignFacts } from '../context/design-facts-compiler.js';
// 🛡️ P1-1（2026-08-30）：节点级尺寸绑定 —— class→figmaBox ±2px 精确校验
import { validateNodeSizes } from '../utils/node-size-validator.js';
// 🆕 2026-09-04：componentId 确定性格式 c-<语义>-<sessionId 尾 8hex>，
// class 前缀事实源经 classPrefixOf 剥离尾段（c-monitor-43e7fe45 → c-monitor）。
import { classPrefixOf } from '../utils/component-naming.js';
// 🛡️ CODE-018（2026-08-31）：子组件资源依赖声明检查 —— 复用方案 3 落地的共享纯函数
// （单一事实源在 resource-import-guard.js，microcode-engineer 编译前置校验与 L0-B 门禁共用）
import { validateSubcomponentResourceDeps, filterAvailableResources, buildResourceUsageCorpus, isResourceUsedInCorpus } from '../utils/resource-import-guard.js';
// 🛡️ TEXT-001（2026-09-01）：文本兄弟顺序漂移 —— 事实源在 text-order-guard.js
// （code-fix-rules 自愈与 L0-B 门禁三处消费同一实现，不新增并行判定）
import { detectTextOrderDrift } from '../utils/text-order-guard.js';
// 🛡️ COMP-001（2026-09-02）：模块组装覆盖 —— 事实源在 section-coverage-guard.js
// （规划的 section 必须全部组装进 index.vue，否则预览整块缺失）
import { detectMissingSections } from '../utils/section-coverage-guard.js';
// 🛡️ TEXT-TRUTH（2026-09-02）：文字真值白名单 —— 事实源在 text-truth-guard.js
// （产物文字必须落在 Figma characters 真值内，否则是 vision OCR 误读/臆造）
import { detectUnknownText, resolveTextTruthSeverity } from '../utils/text-truth-guard.js';
// 🛡️ THEME-COLOR（2026-09-04）：样式主题变量化门禁 —— 事实源在 theme-color-guard.js
// （槽位色值抄写/预设名本地重声明 → BLOCK；设计专色 → WARN。mc-max-1788485095835 实锤）
import { detectThemeColorViolations } from '../utils/theme-color-guard.js';
// 🛡️ CODE-019（2026-09-07）：Props 接线校验 —— 事实源在 props-wiring-guard.js
// （主组件调用子组件时必须传入所有 required props，否则运行时 Vue 警告 + 渲染异常）
import { detectMissingPropsWiring } from '../utils/props-wiring-guard.js';
// 🛡️ SEMANTIC-BINDING（2026-09-07）：语义元素错绑校验 —— 事实源在 semantic-binding-guard.js
// （角标数据如 `3/3740` 不得绑定到 progress/percent 等进度/比例字段，否则语义错乱）
import { detectSemanticBindingErrors } from '../utils/semantic-binding-guard.js';

function normalizeCssLiteral(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * CODE-016 挂载点匹配时忽略的「无区分度词」。
 *
 * 这些词几乎出现在所有容器名里（bg / container / area …），参与命中判定只会让
 * 「匹配」失去意义——任何容器都能靠 container 命中 tabs-list。故统一剔除。
 */
const MOUNT_TARGET_GENERIC_WORDS = new Set([
  'bg',
  'background',
  'icon',
  'img',
  'image',
  'area',
  'region',
  'container',
  'the',
  'and',
  'for',
]);

/**
 * 把 mountTarget / CSS 选择器拆成「有效实词」数组（去虚词、去通用词、去短词）。
 *
 * 例：'tabs-list' → ['tabs','list']；'.c-env-monitor-tabs-container' → ['env','monitor','tabs']
 *
 * @param {string} s
 * @returns {string[]}
 */
function meaningfulWordsOf(s) {
  return String(s || '')
    .split(/[^a-zA-Z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 3 && !MOUNT_TARGET_GENERIC_WORDS.has(w));
}

/**
 * 从背景描述字符串中提取可落地的 CSS 颜色字面量（hex / rgb / rgba）。
 * 视觉分析产出的 background 常为「浅灰蓝色背景 #edf4fb」这类混合描述，
 * 必须提取出 #edf4fb 才能与生成代码里的字面量精确比对。
 * 纯文字描述（如「浅灰蓝色背景」无具体色值）返回空数组。
 */
function extractColorLiterals(value = '') {
  const s = String(value || '');
  const colors = [];
  const hex = s.match(/#[0-9a-fA-F]{3,8}\b/g);
  if (hex) colors.push(...hex);
  const rgb = s.match(/rgba?\(\s*[\d.,\s%]+\)/g);
  if (rgb) colors.push(...rgb);
  return colors;
}

function extractRootBackgroundExpectation(options = {}) {
  const layoutBg =
    options?.layoutStructure?.styles?.background ||
    options?.layoutStructure?.background ||
    '';
  const visualBg = options?.visualElements?.background || '';
  const bgResource = (options?.resourceDomMapping || []).find(
    (item) =>
      item?.previewAnalysisRole === 'bg' &&
      item?.recommendedUsage === 'backgroundStyle',
  );
  // 🛡️ colors 数组兼容（2026-09-03，mv-max-1788365247487 实锤）：vision 常把主背景色
  // 作为 colors 数组第一项（如 ["rgba(237,244,251,1)"=#edf4fb, ...]），但 schema 说 colors
  // 是「颜色名称或简述」，vision 却输出精确色值数组。旧逻辑只读 styles.background（字符串字段，
  // vision 不输出）→ 期望值恒空 → CODE-007 对「深色兜底顶替浅色背景」不触发。
  // 取第一个字符串色值（主背景色）纳入候选，避免把主题蓝/强调红等误当背景期望。
  const layoutColors = options?.layoutStructure?.styles?.colors || [];
  const firstColorString = Array.isArray(layoutColors)
    ? layoutColors.find((c) => typeof c === 'string' && extractColorLiterals(c).length > 0)
    : '';
  const candidates = [layoutBg, visualBg, bgResource?.cssValue, firstColorString].filter(Boolean);
  // 只提取明确色值纳入期望；纯文字描述无法落地成 CSS 字面量，不强制比对。
  const normalized = [];
  for (const candidate of candidates) {
    for (const c of extractColorLiterals(candidate)) {
      const n = normalizeCssLiteral(c);
      if (n) normalized.push(n);
    }
  }
  return {
    hasRootBackground: normalized.length > 0,
    expectedValues: [...new Set(normalized)],
  };
}

function findRootStyleBlock(content = '') {
  // 捕获 class="..." 完整值（含连字符类名如 env-monitor-root），
  // 取第一个类名作为根选择器。旧正则用 \b([a-z][\w-]*)\b 会在连字符处断词，
  // 导致 env-monitor-root 被误捕为最后一段 root。
  const rootClassMatch = content.match(
    /<template>[\s\S]*?class=["']([^"']+)["']/i,
  );
  const classList = rootClassMatch?.[1]?.split(/\s+/) || [];
  const rootClass = classList[0] || '';
  if (!rootClass) return { rootClass: '', styleBody: '' };

  const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const styleBody = styleMatch?.[1] || '';
  return { rootClass, styleBody };
}

function extractRootRuleBody(styleBody = '', rootClass = '') {
  if (!styleBody || !rootClass) return '';
  const escaped = rootClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styleBody.match(
    new RegExp(`\\.${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'i'),
  );
  return match?.[1] || '';
}

/**
 * 从所有 .vue/.less/.css 文件中提取根容器类（rootClass）对应的样式规则体。
 * 根容器由 microcode-engineer._ensureRootInstanceId 注入 .c-mc-max-{id} 首 class，
 * 其样式可能写在 index.vue <style> 或 common.less 中，需跨文件聚合。
 */
function extractRootRuleBodyFromFiles(generatedFiles, rootClass) {
  if (!rootClass) return '';
  const escaped = rootClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\.${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'i');
  let body = '';
  for (const file of generatedFiles) {
    const fp = file.path || '';
    const content = file.content || '';
    if (fp.endsWith('.vue')) {
      const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      const m = styleMatch?.[1]?.match(re);
      if (m) body += '\n' + m[1];
    } else if (fp.endsWith('.less') || fp.endsWith('.css')) {
      const m = content.match(re);
      if (m) body += '\n' + m[1];
    }
  }
  return body;
}

// 根装饰检测：仅命中「真实有值的装饰」，避免 transparent/none/0 误杀（否则合规组件被 L0-B 误杀）。
// 采用「提取值再判定」而非负向 lookahead，规避 \s* 回溯导致 `background: transparent` 误命中。
function extractDeclValues(body, propPattern) {
  const re = new RegExp(
    `(?:^|[;}\\s])(${propPattern.source})\\s*:\\s*([^;}\\n]+)`,
    'gi',
  );
  const out = [];
  let m;
  while ((m = re.exec(body || '')) !== null)
    out.push(m[2].trim().toLowerCase());
  return out;
}

const NO_BG = /^(none|transparent|inherit|initial|unset|0(\s+0)?)$/;
function rootHasBackground(body = '') {
  const vals = extractDeclValues(
    body,
    /background|background-color|background-image/,
  );
  if (vals.some((v) => !NO_BG.test(v))) return true;
  if (/(?:linear|radial|conic)-gradient\s*\(/i.test(body)) return true;
  return false;
}

const NO_BORDER = /^(none|hidden|inherit|initial|unset|0(\s+0)?)$/;
function rootHasBorder(body = '') {
  // border 简写（排除 border-radius，后者单独判定）
  const short = extractDeclValues(body, /border(?!-radius)/);
  if (short.some((v) => !NO_BORDER.test(v))) return true;
  const width = extractDeclValues(
    body,
    /border-(?:top|right|bottom|left)-width|border-width/,
  );
  if (
    width.some(
      (v) =>
        !/^(0(\s+0)?|none|thin|medium|thick|inherit|initial|unset)$/.test(v),
    )
  )
    return true;
  const style = extractDeclValues(
    body,
    /border-(?:top|right|bottom|left)-style|border-style/,
  );
  if (style.some((v) => !/^(none|hidden|inherit|initial|unset)$/.test(v)))
    return true;
  const color = extractDeclValues(
    body,
    /border-(?:top|right|bottom|left)-color|border-color/,
  );
  if (color.some((v) => !/^(transparent|inherit|initial|unset|none)$/.test(v)))
    return true;
  return false;
}

const NO_RADIUS = /^(0(\s+0)?|none|inherit|initial|unset)$/;
function rootHasBorderRadius(body = '') {
  const vals = extractDeclValues(body, /border-radius/);
  return vals.some((v) => !NO_RADIUS.test(v));
}

const NO_SHADOW = /^(none|inherit|initial|unset)$/;
function rootHasBoxShadow(body = '') {
  const vals = extractDeclValues(body, /box-shadow/);
  return vals.some((v) => !NO_SHADOW.test(v));
}

/**
 * 检测是否存在 <style lang="less" scoped>（属性顺序无关，且必须同一标签内同时具备两者）。
 * 旧实现 /<style[^>]*lang=["']less["'][^>]*scoped/ 要求 lang 必须排在 scoped 前，
 * 模型写 <style scoped lang="less">（Vue 等价写法）会被误判为缺 lang="less"（2026-08-16 审计）。
 */
export function hasScopedLessStyle(content = '') {
  const styleTags = content.match(/<style\b[^>]*>/gi) || [];
  return styleTags.some(
    (tag) => /lang\s*=\s*["']less["']/i.test(tag) && /\bscoped\b/i.test(tag),
  );
}

/**
 * 提取 common.less 中缺少组件前缀的 class 列表（CODE-003 / complete 最终扫描共用的事实源）
 * @param {string} content - common.less 文件内容
 * @param {string} [prefixId] - 组件前缀（如 c-env-monitor 或 env-monitor）；为空时放宽为「只要有 .c- 前缀即通过」
 * @returns {string[]} 违规 class 列表（不含 . 前缀，如 ['wrapper', 'item']）
 */
export function findPrefixViolations(content = '', prefixId = '') {
  // 负向后瞻 (?<!&) 排除 LESS 父引用写法（&.active / &:hover:not(.active)）——
  // 这类 class 继承父选择器前缀，不是独立全局 class，不应被判「缺前缀」。
  // 旧正则 /\.\w+(?=\s*\{)/ 会把 "&.active {" 误提取为 ".active"（& 被丢弃），
  // 触发 CODE-003 误报 + autoFix 漏修（declRegex 要求 . 前是空白/行首，匹配不到 & 后场景）。
  const classes = content.match(/(?<!&)\.[a-zA-Z][\w-]+(?=\s*\{)/g) || [];
  return classes.filter((c) => {
    if (/^&|^:root|^@keyframes/.test(c)) return false;
    // 豁免实例 ID 根类（.c-mc-max-{id}）：它仅作根容器作用域标记，不受组件语义前缀约束；
    // 否则会被 CODE-003 误报为「缺前缀」并触发 autoFix 二次叠加前缀。
    if (/^\.c-mc-max-/i.test(c)) return false;
    // componentId 为空（上游未传）时放宽为「只要有 .c- 前缀即通过」，
    // 避免空 componentId 导致所有 class 被误报「缺前缀」，陷入越修越多的死循环。
    if (!prefixId) return !c.startsWith('.c-');
    // componentId 可能已含 c- 前缀（如 c-env-monitor）或纯 id（如 env-monitor），
    // 统一归一化为「含 c- 的标准前缀」再匹配；旧实现直接拼 .c-${prefixId}，
    // 当 componentId 已含 c- 时会叠成 .c-c-env-monitor-，永远不匹配实际 class 导致误报。
    const barePrefix = prefixId.startsWith('c-') ? prefixId : `c-${prefixId}`;
    if (c.startsWith(`.${barePrefix}-`) || c.startsWith(`.${barePrefix}`))
      return false;
    return true;
  });
}

/**
 * 从 common.less 提取所有定义的 class 名（用于类名命中率校验）
 * @param {string} content - common.less 文件内容
 * @returns {Set<string>} class 名集合（不含 . 前缀，如 'root', 'header-item'）
 */
export function extractCommonLessClasses(content = '') {
  const classes = content.match(/(?<!&)\.[a-zA-Z][\w-]+(?=\s*\{)/g) || [];
  return new Set(
    classes
      .filter((c) => !/^&|^:root|^@keyframes/.test(c))
      .map((c) => c.slice(1)) // 去掉开头的 .
  );
}

/**
 * 从 template 的 class 属性（静态 class="..." 与绑定 :class="..."）中提取 class 名。
 * @param {string} templateContent
 * @returns {Set<string>}
 */
export function extractTemplateClassNames(templateContent = '') {
  const classSet = new Set();
  // 提取所有 class="..." / :class="..." 的属性值。属性值外层引号可能是 " 或 '，
  // 内部数组/对象字面量会再嵌套单/双引号字符串 → 不能按「到第一个引号截止」，
  // 需按配对引号整体截取（2026-09-09 实锤：:class="['a', {'b': c}]" 被截断成 "['a"）。
  const attrRe = /(?:class|:class)\s*=\s*["']/gi;
  let m;
  while ((m = attrRe.exec(templateContent))) {
    const quote = m[0].slice(-1); // " 或 '
    const start = m.index + m[0].length;
    // 向后找配对的非转义收尾引号
    let end = -1;
    for (let i = start; i < templateContent.length; i++) {
      if (templateContent[i] === '\\') { i += 1; continue; }
      if (templateContent[i] === quote) { end = i; break; }
    }
    if (end < 0) continue;
    const value = templateContent.slice(start, end);
    // value 内可能有 JS 数组/对象字面量，提取其中全部引号包裹的字符串 token
    const strRe = /["']([^"']+)["']/g;
    let sm;
    while ((sm = strRe.exec(value))) {
      const token = sm[1].trim();
      if (!token || token.includes(' ')) continue; // 空格分隔会走静态拆分，避免误纳表达式
      // 对象字面量 key（'active': true）与数组元素（'c-x-tab-item'）均被引号包裹
      classSet.add(token);
    }
    // 若 value 是纯静态（无 JS 引号表达式 → 形如 a b c），按空格拆
    if (!/[{}[\],:]/g.test(value)) {
      for (const tok of value.split(/\s+/).filter(Boolean)) classSet.add(tok);
    }
  }
  return classSet;
}

/**
 * 从所有 .vue 文件的 template 中提取使用的 class 名
 * @param {Array<{path:string, content:string}>} files - 文件数组
 * @returns {Set<string>} class 名集合（不含 . 前缀）
 */
export function extractTemplateClasses(files) {
  const classSet = new Set();
  for (const file of files) {
    if (!file || !file.content || !(file.path || '').endsWith('.vue')) continue;
    const templateMatch = file.content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
    if (!templateMatch) continue;
    const templateContent = templateMatch[1];
    // 提取所有 class="..." 属性值（支持单引号/双引号、多 class 空格分隔、:class 数组/对象字面量）
    const classAttrs = templateContent.match(/class\s*=\s*["']([^"']+)["']/gi) || [];
    for (const attr of classAttrs) {
      const valueMatch = attr.match(/=\s*["']([^"']+)["']/);
      if (!valueMatch) continue;
      const classes = valueMatch[1].split(/\s+/).filter(Boolean);
      for (const cls of classes) {
        classSet.add(cls);
      }
    }
    // :class 绑定（数组/对象/混合字面量里的字符串 class 名）
    const dynamicNames = extractTemplateClassNames(templateContent);
    for (const n of dynamicNames) classSet.add(n);
  }
  return classSet;
}

/**
 * 检查 common.less 类名在 template 中的命中率（CODE-003 扩展：死样式检测）
 * @param {Set<string>} commonClasses - common.less 中定义的 class 集合
 * @param {Set<string>} templateClasses - template 中使用的 class 集合
 * @returns {{ hitRate: number, unusedClasses: string[], totalClasses: number }}
 */
export function checkClassHitRate(commonClasses, templateClasses) {
  const unusedClasses = [];
  for (const cls of commonClasses) {
    if (!templateClasses.has(cls)) {
      unusedClasses.push(cls);
    }
  }
  const totalClasses = commonClasses.size;
  const hitRate = totalClasses > 0 ? (totalClasses - unusedClasses.length) / totalClasses : 1;
  return { hitRate, unusedClasses, totalClasses };
}

/**
 * CODE-003 class 前缀单一事实源解析（R0-4，2026-09-01）
 *
 * 优先级：declare.json 的 componentId（c- 归一化）→ fallbackPrefix。
 * L0-B 校验（checkCodeStructure）、phase2 autoFix/最终扫描、microcode code-validator
 * autoFix 三方统一走这里；禁止各处手搓「declare.json 覆盖 + c- 归一化」逻辑造成漂移
 * （漂移实锤：L0-B 用 declare.json、phase2 用 state.componentId、code-validator 用
 * deriveClassPrefix + 'component' 兜底 → 同一文件可被 A 判违规、C 修错、B 再判违规）。
 *
 * @param {Array<{path:string, content:string}>|Object<string,string>} files
 *        文件数组（[{path, content}]）或路径→内容 map
 * @param {string} [fallbackPrefix] - declare.json 缺失/无 componentId 时的回退前缀
 *        （调用方保证语义化短名，禁止传实例 ID 如 mc-<ts>-<hash>）
 * @returns {string} 前缀（可能含 c-；findPrefixViolations/autoFixPrefixViolations 内部会再归一）
 */
export function resolveClassPrefixId(files, fallbackPrefix = '') {
  let declareContent = null;
  if (Array.isArray(files)) {
    const f = files.find(
      (x) => x && typeof x.path === 'string' && x.path.endsWith('declare.json'),
    );
    declareContent = f ? f.content : null;
  } else if (files && typeof files === 'object') {
    declareContent = files['declare.json'] || null;
  }
  if (declareContent && typeof declareContent === 'string') {
    try {
      const decl = JSON.parse(declareContent);
      if (decl && typeof decl.componentId === 'string' && decl.componentId) {
        // 🆕 2026-09-04：componentId 为 c-<语义>-<sessionId 尾 8hex> 确定性格式。
        // 必须经 classPrefixOf 剥离尾段返回短前缀（c-monitor），否则 LLM 生成的
        // .c-monitor-root 与 c-monitor-43e7fe45 失配，被 CODE-003 误判缺前缀并二次叠加；
        // 历史实例形态（含 13 位时间戳，如 c-mc-max-<ts>-<hash>）由 classPrefixOf 内守卫保留。
        return classPrefixOf(decl.componentId);
      }
    } catch {
      /* declare.json 解析失败，回退 fallbackPrefix */
    }
  }
  // fallbackPrefix 同样只接受短语义前缀；若调用方误传带尾段完整 id 则剥离之
  return classPrefixOf(fallbackPrefix);
}

/**
 * 检测表达式中的 c- 类名前缀标识符（LLM 把 CSS 类名误当 JS 变量/对象 key 的典型错误）。
 * 类名前缀形如 c-monitor-* 或 c-mc-<id>-*（含连字符），在 JS 表达式里无法作为合法标识符：
 *   - 点号访问 legendState.c-monitor-beijing → 被解析为减法链，恒 undefined（静默）或
 *     哈希段数字开头时触发 "Identifier directly after number"（语法崩溃）
 *   - 对象 key { c-mc-<id>-active: ... } → key 含连字符未加引号，直接语法崩溃
 * @param {string} expr - 绑定表达式原文
 * @returns {Array<{ token: string, prev: string }>} prev 为 '.' 表示点号访问，否则为裸标识符/key
 */
function findCPrefixIdentifiers(expr) {
  const hits = [];
  if (!expr || typeof expr !== 'string') return hits;
  const cRe = /c-[a-zA-Z0-9][a-zA-Z0-9_-]*/g;
  let m;
  while ((m = cRe.exec(expr)) !== null) {
    const idx = m.index;
    // 跳过字符串字面量内的 c- 前缀（如 'c-monitor-xxx' 是合法的字符串 key/class 名）
    let quote = null;
    for (let i = 0; i < idx; i++) {
      const ch = expr[i];
      if (ch === '\\') {
        i++;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
      }
    }
    if (quote) continue; // 在字符串字面量内，属合法，跳过
    const prev = idx > 0 ? expr[idx - 1] : '';
    hits.push({ token: m[0], prev });
  }
  return hits;
}

export class CodeStructureValidator {
  /**
   * 执行校验
   * @param {Array} generatedFiles - [{ path, content }] 文件数组
   * @param {string} componentId - 组件ID（用于前缀检查）
   * @param {Object} options - { target, layoutStructure, visualElements, resourceDomMapping, previewAnalysis }
   * @returns {{ pass: boolean, blockCount: number, issues: Array }}
   */
  static validate(generatedFiles, componentId, options = {}) {
    const files = Array.isArray(generatedFiles) ? generatedFiles : [];
    const issues = [];

    // 🛡️ R5: L0-B 空集不得 pass=true（此前空产物恒 pass，绿灯直达发布阶段，
    // 直到 workspace-preview-publisher 才回滚「缺少 package/index.vue」）
    const hasNonEmptyVue = files.some(
      (f) =>
        f &&
        (f.path || '').endsWith('.vue') &&
        String(f.content || '').trim().length > 0,
    );
    if (!hasNonEmptyVue) {
      // 🛡️ D+（2026-08-31）：成因判定——区分「LLM 未生成」vs「已生成但被写盘门禁跳过」。
      // 事故 mc-max-1788174922721-1034fb6d：index.vue 已生成但被 SFC 门禁跳过落盘，
      // L0-B 只报「产物为空」→ 修复指导指错方向（让 LLM 重生成，而 LLM 产物本是好的）。
      const gateSkipped = Array.isArray(options?.gateSkippedFiles)
        ? options.gateSkippedFiles.filter((f) =>
            String(f || '').endsWith('.vue'),
          )
        : [];
      const skipNote =
        gateSkipped.length > 0
          ? `。⚠️ 成因判定：并非 LLM 未生成——${gateSkipped.length} 个 .vue 已生成但被 Vue SFC 写盘门禁跳过（${gateSkipped
              .slice(0, 3)
              .join(', ')}${gateSkipped.length > 3 ? ' 等' : ''}），请优先排查 file-writer 自愈/注入链路是否把产物改坏，而不是重试让 LLM 重新生成`
          : '';
      return {
        pass: false,
        blockCount: 1,
        issues: [
          {
            id: 'EMPTY_ARTIFACT',
            severity: 'BLOCK',
            file: '(全部)',
            message: `生成产物为空：没有任何非空 .vue 文件，L0-B 空集不得通过（阻断静默绿灯直达发布）${skipNote}`,
          },
        ],
      };
    }

    const isVue3 = options?.target === 'vue3';
    const rootBgExpectation = isVue3
      ? extractRootBackgroundExpectation(options)
      : { hasRootBackground: false, expectedValues: [] };

    // ========== 🛡️ G1: EMPTY_BODY 主体空壳检测（2026-08-31 事故 4 实锤）==========
    // 重试轮 LLM 把全部内容塞进命名插槽（如 base-panel 的 header_right）、默认插槽为空 →
    // 空壳照样 pass 发布 → 用户看到空面板。本检查与 EMPTY_ARTIFACT 互补：
    // EMPTY_ARTIFACT 检测「没有任何 .vue 文件」，EMPTY_BODY 检测「有 index.vue 但默认插槽为空」。
    {
      const indexVue = files.find(
        (f) => f && (f.path || '').endsWith('package/index.vue'),
      );
      if (indexVue && indexVue.content) {
        // 🛡️ 提取 SFC 顶层 <template> 内容：必须匹配最外层 <template>...</template>，
        // 不能用 lazy `*?`（会停在第一个内层 </template>，即命名插槽的闭合标签）。
        // 策略：找到第一个 <template 开始位置，然后找最后一个 </template> 结束位置。
        const tplStartMatch = indexVue.content.match(/<template[\s>]/i);
        let templateContent = '';
        if (tplStartMatch) {
          const startIdx = tplStartMatch.index;
          // 跳过 <template...> 开标签本身
          const openTagEnd = indexVue.content.indexOf('>', startIdx);
          if (openTagEnd >= 0) {
            const lastCloseIdx = indexVue.content.lastIndexOf('</template>');
            if (lastCloseIdx > openTagEnd) {
              templateContent = indexVue.content.slice(
                openTagEnd + 1,
                lastCloseIdx,
              );
            }
          }
        }

        // 🛡️ 提取根元素内部内容：默认插槽是根元素（如 <base-panel>、<div>）内部的内容，
        // 不是 <template> 直接子元素。策略：找到根元素的开标签和闭标签，提取中间内容。
        // 根元素开标签 = templateContent 第一个 `<` 开始，到第一个 `>` 结束。
        // 根元素闭标签 = templateContent 最后一个 `</xxx>`。
        let rootInnerContent = templateContent;
        const rootOpenMatch = templateContent.match(/^\s*<([\w-]+)/);
        if (rootOpenMatch) {
          const rootOpenEnd = templateContent.indexOf('>', rootOpenMatch.index);
          const rootCloseIdx = templateContent.lastIndexOf(`</${rootOpenMatch[1]}>`);
          if (rootOpenEnd >= 0 && rootCloseIdx > rootOpenEnd) {
            rootInnerContent = templateContent.slice(
              rootOpenEnd + 1,
              rootCloseIdx,
            );
          }
        }

        // 提取所有命名插槽（<template #xxx> 或 <template v-slot:xxx>）
        // 注意：命名插槽在根元素内部，所以从 rootInnerContent 提取。
        const namedSlotRegex =
          /<template\s+(?:#|v-slot:)([\w-]+)[^>]*>([\s\S]*?)<\/template>/gi;
        const namedSlots = [];
        let slotMatch;
        while ((slotMatch = namedSlotRegex.exec(rootInnerContent)) !== null) {
          namedSlots.push({ name: slotMatch[1], content: slotMatch[2] });
        }

        // 提取默认插槽内容：移除所有 <template #xxx>...</template> 后，剩余的直接子元素
        // 注意：namedSlotRegex 是全局正则（带 g 标志），exec 循环后 lastIndex 已改变，
        // 必须重置为 0 才能在 replace 中正确匹配所有命名插槽。
        namedSlotRegex.lastIndex = 0;
        const contentWithoutNamedSlots = rootInnerContent
          .replace(namedSlotRegex, '')
          .trim();

        // 判定默认插槽是否有实质内容（非空白、非纯注释）
        const defaultSlotContent = contentWithoutNamedSlots
          .replace(/<!--[\s\S]*?-->/g, '') // 去注释
          .trim();
        const hasDefaultSlotContent = defaultSlotContent.length > 0;

        // 判定命名插槽是否有实质内容
        const namedSlotsWithContent = namedSlots.filter((slot) => {
          const cleaned = slot.content
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\s+/g, '')
            .trim();
          return cleaned.length > 0;
        });

        // 触发条件：默认插槽为空 + 至少一个命名插槽有内容
        if (!hasDefaultSlotContent && namedSlotsWithContent.length > 0) {
          const slotNames = namedSlotsWithContent
            .map((s) => `#${s.name}`)
            .join(', ');
          issues.push({
            id: 'EMPTY_BODY',
            severity: 'BLOCK',
            file: 'package/index.vue',
            message: `主体空壳检测失败：默认插槽（主体内容区）为空，但命名插槽 ${slotNames} 有实质内容。主体内容（图表/列表/卡片）必须放默认插槽，命名插槽仅放 header 区控件（如 tabs/按钮）。请重新组织模板结构`,
          });
        }

        // ========== 🛡️ 缺口④（2026-09-01）：降级空壳检测 EMPTY_SHELL ==========
        // 与 EMPTY_BODY 互补而非重复：EMPTY_BODY 抓「内容被塞进命名插槽、默认插槽为空」；
        // 本检查抓「主体容器被占位注释/空白掏空」——此时默认插槽**非空**（还剩一个空壳根 div），
        // 故 EMPTY_BODY 不触发，空壳照样判 passed 直达发布。
        //
        // 实证 mc-max-1788186816558-fb3a1a7b（last-good = r-4e644c37）：
        // 4 个子组件被门禁隔离降级后，package/index.vue 的 5 个模块容器退化成
        // `<!-- 当日总流量 -->` 等 5 个占位注释，剥除注释后 `<div class="c-monitor-root">`
        // 内部只剩空白，manifest 各项却全 passed。
        {
          const commentBlocks = templateContent.match(/<!--[\s\S]*?-->/g) || [];
          // void 元素不承载内容，计数时排除（避免 Task2 里那张 `display:none` 的假绑定 img 充数）
          const VOID_TAGS = new Set([
            'img', 'br', 'hr', 'input', 'meta', 'link', 'path', 'circle',
            'rect', 'line', 'polyline', 'polygon', 'use', 'source', 'area',
            'col', 'embed', 'track', 'wbr',
          ]);
          const openTags =
            rootInnerContent.replace(/<!--[\s\S]*?-->/g, '').match(/<([a-zA-Z][\w-]*)/g) ||
            [];
          const realElements = openTags.filter(
            (t) => !VOID_TAGS.has(t.slice(1).toLowerCase()),
          );
          if (commentBlocks.length >= 2 && realElements.length <= 2) {
            issues.push({
              id: 'EMPTY_SHELL',
              severity: 'BLOCK',
              file: 'package/index.vue',
              message: `降级空壳检测失败：模板含 ${commentBlocks.length} 个占位注释，但剥除注释后仅剩 ${realElements.length} 个真实元素（主体容器已被掏空）。典型成因是子组件被门禁隔离降级后未回填内容——产物只剩外壳，发布后用户看到空白面板`,
              hint: {
                suggestion:
                  '恢复被隔离的子组件内容（见隔离日志）；若确需降级，也必须保留可读的占位区块（真实 DOM），不得只用注释占位后照常发布',
              },
            });
          }
        }
      }
    }

    // ========== 🛡️ 缺口③（2026-09-01）：跨样式源 flex 冲突 + 量纲混用 + 兄弟组感知 ==========
    // 单文件视角的 checkFlexUsage 抓不到「同一 class 在 SFC <style scoped> 与 common.less
    // 各写一套 flex」——scoped 编译后 (0,2,0) 恒胜 common.less (0,1,0)，另一套变死样式，
    // 且区块高度比例按错误值计算（Task3 实证：tunnel+vehicle 独占 85%）。
    // FLEX-005（2026-09-01）：在 FLEX-003/004 基础上引入 template DOM 兄弟组感知——
    // 同一父容器下**可证**的像素量级与比例量级兄弟混排 → BLOCK（携带行号与来源文件）。
    try {
      const flexConflicts = checkFlexSourceConflicts(files);
      for (const fc of flexConflicts) {
        issues.push({
          id: fc.id,
          severity: fc.severity,
          file: fc.file,
          message: fc.message,
          hint: fc.hint,
        });
      }
      const siblingIssues = detectFlexSiblingIssues(files);
      for (const si of siblingIssues) {
        issues.push({
          id: si.id,
          severity: si.severity,
          file: si.file,
          message: si.message,
          hint: si.hint,
        });
      }
    } catch (flexErr) {
      // 校验异常不得阻断整条门禁链路（与既有 flex 检查同策略：非阻断）
      issues.push({
        id: 'FLEX-CHECK-ERROR',
        severity: 'WARN',
        file: '(全部)',
        message: `跨样式源 flex 冲突检查异常（非阻断）：${flexErr?.message || flexErr}`,
      });
    }

    // ========== 🛡️ 缺口①（2026-09-01）：资源型 LESS 变量「定义后零消费」断尾检测 ==========
    // 实证：Task1（r-18aef1f3）theme-vars.less:46/47 定义 @tab-active-bg / @container-bg，
    // 各定义 2 次、消费 0 次（背景实际走的是 JS 注入的 CSS 变量 --bg-tab-active）；
    // Task2（r-4e644c37）theme-vars.less 五张 bg 同样全部零消费。
    //
    // 定级 **WARN 而非 BLOCK**：资源可能已通过 CSS 变量 / :style 绑定正确渲染
    // （Task1 的 bg2 正是如此），死变量本身不直接造成视觉缺陷，BLOCK 会误杀已正确的产物；
    // 真正的「资源完全没渲染」由 RES-UNUSED 门禁 BLOCK 兜底，两者分工不重叠。
    try {
      const lessFiles = files.filter((f) => /\.less$/i.test(f.path || ''));
      const assetVarDefs = new Map();
      for (const f of lessFiles) {
        (f.content || '').split('\n').forEach((line, i) => {
          const m = line.match(/@([a-zA-Z][\w-]*)\s*:\s*(.+?);?\s*$/);
          if (!m) return;
          const value = m[2];
          // 只认资源型变量（url(...) 或图片路径字面量），不放宽到颜色/尺寸变量
          if (!/url\s*\(|['"][^'"]*\.(png|jpe?g|gif|svg|webp)['"]/i.test(value)) return;
          if (!assetVarDefs.has(m[1])) {
            assetVarDefs.set(m[1], { file: f.path, line: i + 1, value: value.trim() });
          }
        });
      }
      if (assetVarDefs.size > 0) {
        const corpus = files
          .filter((f) => /\.(vue|less|css)$/i.test(f.path || ''))
          .map((f) => f.content || '')
          .join('\n');
        for (const [name, def] of assetVarDefs) {
          const total = (corpus.match(new RegExp(`@${name}\\b`, 'g')) || []).length;
          let defCount = 0;
          for (const f of lessFiles) {
            defCount += ((f.content || '').match(new RegExp(`@${name}\\s*:`, 'g')) || []).length;
          }
          if (total - defCount > 0) continue; // 存在实际消费，正常
          issues.push({
            id: 'VAR-UNUSED',
            severity: 'WARN',
            file: def.file,
            message: `资源型 LESS 变量 @${name}（${def.file}:${def.line}，值 = ${def.value.slice(0, 60)}）定义后在整个产物中零消费——该资源没有通过这条路径挂到 DOM 上（挂载断尾）`,
            hint: {
              suggestion: `若该资源已通过 CSS 变量 / :style 绑定渲染（Task1 的 --bg-tab-active 即属此例），请删除这条无用的 LESS 变量定义以保持单一事实源；若确实未渲染，请补上消费（如 background-image: @${name};）`,
            },
          });
        }
      }
    } catch (varErr) {
      issues.push({
        id: 'VAR-CHECK-ERROR',
        severity: 'WARN',
        file: '(全部)',
        message: `资源型 LESS 变量消费检查异常（非阻断）：${varErr?.message || varErr}`,
      });
    }

    // ========== 逐 .vue 文件检查（两者通用 + Vue3 专属）==========
    for (const file of generatedFiles) {
      const filePath = file.path || '';
      const content = file.content || '';
      if (!filePath.endsWith('.vue')) continue;

      // 区分主组件 vs 子组件：子组件 package/components/*.vue 的 style 可选，
      // 但若有 <style> 块则必须 <style lang="less" scoped>（避免样式污染全局）。
      const isSubComponent =
        filePath.includes('/components/') || filePath.startsWith('components/');

      // ---- 两者通用 ----

      if (isSubComponent) {
        // 子组件：style 可选；若有 style 则必须 <style lang="less" scoped> 并 @import index.less
        const hasAnyStyle = /<style[\s\S]*?<\/style>/g.test(content);
        if (hasAnyStyle) {
          const hasScopedLess = hasScopedLessStyle(content);
          if (!hasScopedLess) {
            const hasScopedOnly = /<style[^>]*scoped/.test(content);
            issues.push({
              id: 'CODE-001',
              severity: 'BLOCK',
              file: filePath,
              message: hasScopedOnly
                ? '子组件 style 块缺少 lang="less" 属性，必须为 <style lang="less" scoped>'
                : '子组件若有 <style> 块，必须为 <style lang="less" scoped>（避免样式污染全局）',
            });
          }
          if (!content.includes('@import') || !content.includes('index.less')) {
            issues.push({
              id: 'CODE-002',
              severity: 'BLOCK',
              file: filePath,
              message:
                "子组件若有 <style> 块，必须 @import '../../resources/styles/index.less'（或对应层级路径）",
            });
          }
        }
        // 子组件无 style → 通过（不报 CODE-001/CODE-002）
      } else {
        // 主组件：必须有 <style lang="less" scoped> + @import index.less
        const hasScopedLess = hasScopedLessStyle(content);
        if (!hasScopedLess) {
          const hasAnyStyle = /<style[\s\S]*?<\/style>/g.test(content);
          if (hasAnyStyle) {
            const hasScopedOnly = /<style[^>]*scoped/.test(content);
            issues.push({
              id: 'CODE-001',
              severity: 'BLOCK',
              file: filePath,
              message: hasScopedOnly
                ? 'style 块缺少 lang="less" 属性，必须为 <style lang="less" scoped>'
                : '缺少 <style lang="less" scoped> 块',
            });
          } else {
            issues.push({
              id: 'CODE-001',
              severity: 'BLOCK',
              file: filePath,
              message: '.vue 文件没有任何 style 块',
            });
          }
        }

        // CODE-002: 必须引入 index.less
        if (!content.includes('@import') || !content.includes('index.less')) {
          issues.push({
            id: 'CODE-002',
            severity: 'BLOCK',
            file: filePath,
            message:
              "未引入 resources/styles/index.less，必须 @import '../resources/styles/index.less'（或对应层级路径）",
          });
        }
      }

      // CODE-004/005/006: 禁止宿主 Tailwind / Inspira / 原子类泄漏
      for (const rule of HOST_STYLE_LEAK_PATTERNS) {
        if (rule.regex.test(content)) {
          issues.push({
            id: rule.id,
            severity: rule.severity || 'BLOCK',
            file: filePath,
            message: rule.message,
          });
        }
      }

      // ---- 仅 Vue3 ----

      // CODE-007: Vue3 根面板有背景时，根选择器必须直接落地背景字面量
      if (
        isVue3 &&
        filePath.endsWith('index.vue') &&
        rootBgExpectation.hasRootBackground
      ) {
        const { rootClass, styleBody } = findRootStyleBlock(content);
        const rootRuleBody = extractRootRuleBody(styleBody, rootClass);
        const normalizedRule = normalizeCssLiteral(rootRuleBody);
        const reliesOnThemeVar =
          /background(?:-color)?\s*:\s*var\(--color(?:-bg|bg)\)/i.test(
            rootRuleBody,
          );
        const usesTransparentFallback =
          /background(?:-color)?\s*:\s*(transparent|inherit)\b/i.test(
            rootRuleBody,
          );
        const hasDirectBackgroundLiteral =
          rootBgExpectation.expectedValues.some((value) =>
            normalizedRule.includes(value),
          );
        const hasBackgroundProperty = /background(?:-image|-color)?\s*:/i.test(
          rootRuleBody,
        );

        // 检测模板根元素是否通过 :style 动态绑定背景（Vue3 Vite 资源导入的标准写法）
        const templateMatch = content.match(
          /<template[^>]*>([\s\S]*?)<\/template>/i,
        );
        const templateContent = templateMatch?.[1] || '';
        const rootElMatch = templateContent.match(
          new RegExp(
            `<[\\w-][^>]*class=["'][^"']*\\b${rootClass?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^"']*["'][^>]*>`,
          ),
        );
        const rootElHtml = rootElMatch?.[0] || '';

        // 写法一：内联字面量 :style="{ background... }" 或 :style="'background...'"
        // 直接检测根元素标签内是否含背景属性 + 期望色值（兼容驼峰 backgroundColor 与 kebab background-color）。
        const inlineDynamicBinding =
          /:style\s*=/.test(rootElHtml) &&
          /background(?:color|image|size|position|repeat|-color|-image|-size|-position|-repeat)?\s*:/i.test(
            rootElHtml,
          ) &&
          rootBgExpectation.expectedValues.some((value) =>
            normalizeCssLiteral(rootElHtml).includes(value),
          );

        // 写法二：:style="computedVar" 引用变量 → 去 <script> 找该变量定义里的背景字面量
        let variableDynamicBinding = false;
        const styleVarMatch = rootElHtml.match(
          /:style\s*=\s*["']([A-Za-z_$][\w$]*)["']/,
        );
        if (styleVarMatch) {
          const styleVarName = styleVarMatch[1];
          const scriptMatch = content.match(
            /<script[^>]*>([\s\S]*?)<\/script>/i,
          );
          const scriptBody = scriptMatch?.[1] || '';
          const defMatch = scriptBody.match(
            new RegExp(
              `(?:const|let|var)\\s+${styleVarName}\\b[\\s\\S]*?=\\s*([\\s\\S]*?)(?=\\n\\s*(?:const|let|var|function|async|export|\\/\\/|\\/\\*)|$)`,
              'i',
            ),
          );
          const defBody = defMatch?.[1] || '';
          if (
            defBody &&
            /background(?:color|image|size|position|repeat|-color|-image|-size|-position|-repeat)?\s*:/i.test(
              defBody,
            )
          ) {
            const normalizedDef = normalizeCssLiteral(defBody);
            variableDynamicBinding = rootBgExpectation.expectedValues.some(
              (value) => normalizedDef.includes(value),
            );
          }
        }

        const hasDynamicBackgroundBinding =
          inlineDynamicBinding || variableDynamicBinding;

        // 两种写法任一满足即通过：静态字面量 OR 动态 :style 绑定
        const staticPass =
          rootRuleBody &&
          hasBackgroundProperty &&
          hasDirectBackgroundLiteral &&
          !reliesOnThemeVar &&
          !usesTransparentFallback;
        const dynamicPass = hasDynamicBackgroundBinding;

        if (!staticPass && !dynamicPass) {
          issues.push({
            id: 'CODE-007',
            severity: 'BLOCK',
            file: filePath,
            message: `Vue3 根面板存在背景，但根选择器未直接落地背景字面量；期望包含: ${rootBgExpectation.expectedValues.slice(0, 3).join(' / ')}（支持静态 CSS 或 :style 动态绑定）。禁止用深色兜底/渐变顶替 Figma 真值背景色`,
          });
        }
      }
    }

    // ========== 非 .vue 文件的 Tailwind 泄漏检查（两者通用）==========
    for (const file of generatedFiles) {
      const filePath = file.path || '';
      const content = file.content || '';
      if (
        !filePath.endsWith('.less') &&
        !filePath.endsWith('.css') &&
        !filePath.endsWith('.js')
      )
        continue;

      for (const rule of HOST_STYLE_LEAK_PATTERNS) {
        if (rule.regex.test(content)) {
          issues.push({
            id: rule.id,
            severity: rule.severity || 'BLOCK',
            file: filePath,
            message: rule.message,
          });
        }
      }
    }

    // ========== CODE-008: ESM import 变量名一致性（两者通用）==========
    // 禁止 LLM 自行 import 本地图片资源，应交由 injectResourceImports 后处理注入
    const resourceMapping = options?.resourceDomMapping || [];
    const validResourceFiles = new Set(
      resourceMapping
        .filter((m) => m.resourceFile)
        .map((m) =>
          m.resourceFile.replace(/^\.\.\//, '').replace(/^\.\.\/\.\.\//, ''),
        ),
    );

    for (const file of generatedFiles) {
      const filePath = file.path || '';
      const content = file.content || '';
      if (!filePath.endsWith('.vue')) continue;

      const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      if (!scriptMatch) continue;
      const scriptContent = scriptMatch[1];

      const importRegex =
        /import\s+(\w+)\s+from\s+['"]([^'"]*resources\/images\/[^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(scriptContent)) !== null) {
        const importPath = match[2];
        const normalizedPath = importPath
          .replace(/^\.\.\//, '')
          .replace(/^\.\.\/\.\.\//, '');
        const isValid =
          validResourceFiles.has(normalizedPath) ||
          resourceMapping.some(
            (m) =>
              m.resourceFile &&
              importPath.endsWith(m.resourceFile.replace(/^.*images\//, '')),
          );

        if (!isValid) {
          issues.push({
            id: 'CODE-008',
            severity: 'WARN',
            file: filePath,
            message: `检测到未经后处理注入的 ESM 图片 import: ${match[1]} from '${importPath}'，应交由 injectResourceImports 自动注入，禁止 LLM 手写`,
          });
        }
      }
    }

    // ========== CODE-009: componentName vs 预览图标题（仅微码）==========
    // Vue3 不生成 declare.json，跳过此检查
    if (!isVue3) {
      const previewTitle =
        options?.previewAnalysis?.componentTitle ||
        options?.previewAnalysis?.title ||
        '';
      if (previewTitle) {
        const declareFile = generatedFiles.find(
          (f) =>
            f.path &&
            (f.path.endsWith('declare.json') ||
              f.path.includes('declare.json')),
        );
        if (declareFile) {
          try {
            const declare = JSON.parse(declareFile.content);
            if (
              declare.componentName &&
              declare.componentName !== previewTitle
            ) {
              issues.push({
                id: 'CODE-009',
                severity: 'WARN',
                file: declareFile.path,
                message: `declare.json componentName='${declare.componentName}' 与预览图识别标题='${previewTitle}' 不一致，必须使用预览图识别的标题`,
              });
            }
          } catch (e) {
            // JSON 解析失败，跳过
          }
        }
      }
    }

    // ========== CODE-003: common.less 前缀检查（仅微码）==========
    if (!isVue3) {
      const commonLessFile = generatedFiles.find(
        (f) =>
          f.path &&
          (f.path.endsWith('common.less') || f.path.includes('common.less')),
      );
      if (commonLessFile) {
        // class 前缀事实源是 declare.json 的 componentId（如 c-env-monitor），而非 sessionId
        // （sessionId 仅用于目录隔离）。旧实现用 sessionId 做前缀，导致 class 的
        // .c-c-env-monitor-root 永远不匹配 .c-mc-max-...- 前缀，22 个 class 全部误报 WARN 噪音。
        // R0-4（2026-09-01）：统一走 resolveClassPrefixId 单一解析器（declare.json 优先，
        // 回退调用方传入的 componentId），与 phase2 autoFix / code-validator autoFix 同源。
        const prefixId = resolveClassPrefixId(generatedFiles, componentId);

        const violations = findPrefixViolations(
          commonLessFile.content,
          prefixId,
        );

        if (violations.length > 0) {
          issues.push({
            id: 'CODE-003',
            severity: 'WARN',
            file: commonLessFile.path,
            message: `common.less 中 ${violations.length} 个 class 缺少 ${prefixId || '组件'} 前缀: ${violations.slice(0, 5).join(', ')}${violations.length > 5 ? '...' : ''}`,
          });
        }

        // ========== CODE-003 扩展：类名命中率检查（死样式检测）==========
        // 检查 common.less 中定义的 class 是否真的在 template 中被使用
        // 命中率 < 60% 视为 WARN（LLM 可能生成了大量无用样式）
        const commonClasses = extractCommonLessClasses(commonLessFile.content);
        const templateClasses = extractTemplateClasses(generatedFiles);
        const { hitRate, unusedClasses, totalClasses } = checkClassHitRate(
          commonClasses,
          templateClasses,
        );

        if (totalClasses > 0 && hitRate < 0.6) {
          const unusedExamples = unusedClasses.slice(0, 5).join(', ');
          const moreCount = unusedClasses.length > 5 ? ` 等 ${unusedClasses.length} 个` : '';
          issues.push({
            id: 'CODE-003-HIT-RATE',
            severity: 'WARN',
            file: commonLessFile.path,
            message: `common.less 类名命中率过低（${Math.round(hitRate * 100)}%，${unusedClasses.length}/${totalClasses} 个未使用）：${unusedExamples}${moreCount}。这些 class 在 template 中未被引用，属于死样式。建议删除未使用的 class 定义，或检查 template 是否遗漏了对应的 DOM 元素`,
          });
        }
      }
    }

    // ========== CODE-010: echarts 图表数据硬编码检测（两者通用，WARN）==========
    // 生成组件必须数据驱动：echarts 的 series.data / xAxis.data 应绑定 ref 变量，
    // 禁止在 setOption({...}) 里硬编码数字字面量（否则后续 API 绑定无法驱动图表）。
    for (const file of generatedFiles) {
      const filePath = file.path || '';
      const content = file.content || '';
      if (!filePath.endsWith('.vue') || !/echarts/.test(content)) continue;

      const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      if (!scriptMatch) continue;
      const hardcoded = scriptMatch[1].match(/data\s*:\s*\[\s*\d/g);
      if (hardcoded && hardcoded.length > 0) {
        issues.push({
          id: 'CODE-010',
          severity: 'WARN',
          file: filePath,
          message: `echarts 图表数据疑似硬编码字面量（${hardcoded.length} 处）：series.data/xAxis.data 应绑定 ref() 变量，禁止 data: [数字, ...] 写死；否则 API 绑定后图表无法被真实数据驱动`,
        });
      }
    }

    // ========== CODE-011: echarts 初始化时序检测（两者通用，BLOCK）==========
    // echarts.init 必须等待 DOM layout settle 后再执行，否则 flex 百分比高度未 settle 时
    // init 会定格在小尺寸，图表永远无法充满容器。用 AST 结构分析识别「延迟/守卫上下文」
    // （nextTick/rAF/setTimeout/ResizeObserver/watch 回调、尺寸守卫、await 之后），
    // 而非硬编码正则枚举特定写法——模型每多一种等价写法都会天然覆盖。
    for (const file of generatedFiles) {
      const filePath = file.path || '';
      const content = file.content || '';
      if (!filePath.endsWith('.vue') || !/echarts\.init\s*\(/.test(content))
        continue;

      const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      if (!scriptMatch) continue;
      const scriptContent = scriptMatch[1];

      const timingCheck = checkEchartsInitTiming(scriptContent);
      const hasDeferredInit = !timingCheck.hasSyncInit;

      if (!hasDeferredInit) {
        issues.push({
          id: 'CODE-011',
          severity: 'BLOCK',
          file: filePath,
          message:
            'echarts.init 必须等待 DOM layout settle（onMounted 内先 await nextTick() 再 requestAnimationFrame 后才 init），禁止同步 init；否则 flex 百分比高度未 settle 时图表会定格在小尺寸',
        });
      }
    }

    // ========== CODE-012: echarts resize 监听检测（两者通用，BLOCK）==========
    // echarts 实例创建后必须挂 ResizeObserver / window.resize 监听，
    // 否则窗口/容器尺寸变化时图表不会自适应，永远停留在 init 时的尺寸。
    for (const file of generatedFiles) {
      const filePath = file.path || '';
      const content = file.content || '';
      if (!filePath.endsWith('.vue') || !/echarts\.init\s*\(/.test(content))
        continue;

      const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      if (!scriptMatch) continue;
      const scriptContent = scriptMatch[1];

      // 检测是否有 resize 监听（AST 结构分析，识别 .resize() / ResizeObserver /
      // addEventListener('resize') / .onresize 四种信号；解析失败一律放行，宁漏勿杀）
      const resizeCheck = checkEchartsResizeListener(scriptContent);
      const hasResizeListener = resizeCheck.hasResizeListener;

      if (!hasResizeListener) {
        issues.push({
          id: 'CODE-012',
          severity: 'BLOCK',
          file: filePath,
          message:
            'echarts 实例创建后必须挂 ResizeObserver 或 window.resize 监听，并在回调中调用 chartInstance.resize()；否则图表无法随窗口/容器尺寸变化自适应',
        });
      }
    }

    // ========== CODE-013: chart 容器固定高度检测（两者通用，WARN）==========
    // chart 容器应使用 flex 比例分配高度，不应设置固定 height（如 height: 180px）。
    // 注意：min-height 是兜底最小高度（防止极端收缩），不属于固定高度，不告警。
    for (const file of generatedFiles) {
      const filePath = file.path || '';
      const content = file.content || '';
      if (!filePath.endsWith('.vue') || !/echarts/.test(content)) continue;

      const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (!styleMatch) continue;
      const styleContent = styleMatch[1];

      // 匹配图表容器 class（通常包含 chart、echart 等关键词）
      const chartClassPattern =
        /\.([\w-]*(?:chart|echart)[\w-]*)\s*\{([^}]+)\}/gi;
      let match;
      while ((match = chartClassPattern.exec(styleContent)) !== null) {
        const className = match[1];
        const rules = match[2];

        // 只检查固定 height（>100px），不检查 min-height（兜底高度是合理的）
        const hasFixedHeight = /(^|;|\s)height\s*:\s*(\d+)px/i.test(rules);
        const hasFlex = /flex\s*:/i.test(rules);

        if (hasFixedHeight && !hasFlex) {
          const heightMatch = rules.match(/height\s*:\s*(\d+)px/i);
          const heightValue = heightMatch ? heightMatch[1] : '?';

          if (parseInt(heightValue) > 100) {
            issues.push({
              id: 'CODE-013',
              severity: 'WARN',
              file: filePath,
              message: `图表容器 .${className} 设置了固定 height: ${heightValue}px，建议改用 flex 比例按设计稿视觉分配高度（如 flex: ${heightValue} 1 0），避免不同尺寸下布局失衡`,
            });
          }
        }
      }
    }

    // ========== 🎯 方案4: RESOURCE-001/002 资源覆盖率校验（两者通用）==========
    // RESOURCE-001: 资源变量未引用（WARN级别）
    // RESOURCE-002: 资源变量误用（写进CSS）（BLOCK级别）
    if (
      options?.resourceDomMapping &&
      Array.isArray(options.resourceDomMapping)
    ) {
      // R0-6（2026-09-01）：统一走 filterAvailableResources 单一过滤帮手
      const availableResources = filterAvailableResources(
        options.resourceDomMapping,
      );

      if (availableResources.length > 0) {
        // 🛡️ P0-4（2026-09-01）：资源「未使用」判定统一走 buildResourceUsageCorpus /
        // isResourceUsedInCorpus 单一事实源（与 resource-attribution-validator、resource-mounter
        // 同口径）。旧口径只扫 .vue template/script 的 includes(varName)，与 A 处 corpus 判定
        // 漂移：模型把背景写进 common.less（url(../images/bg-7890.png)）时，这里判「未使用」、
        // A 处判「已用」——同一资源两套结论（mc-max-1788056145870 实锤）。
        const filesByPath = {};
        for (const f of generatedFiles) {
          if (f && typeof f.path === 'string' && typeof f.content === 'string') {
            filesByPath[f.path] = f.content;
          }
        }
        const usageCorpus = buildResourceUsageCorpus(filesByPath);

        // 提取所有可用的资源变量名（用于 RESOURCE-002 误用检测，需逐文件扫 style 块）
        const resourceVars = new Set();
        availableResources.forEach((r) => {
          if (r.assignedVarName) resourceVars.add(r.assignedVarName);
          if (r.semanticVarName) resourceVars.add(r.semanticVarName);
        });

        // 检查每个 .vue 文件（RESOURCE-002：误用写进 CSS，需逐文件定位 style 块）
        for (const file of generatedFiles) {
          const filePath = file.path || '';
          const content = file.content || '';
          if (!filePath.endsWith('.vue')) continue;

          const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
          const styleContent = styleMatch ? styleMatch[1] : '';

          const misusedInStyle = [];

          resourceVars.forEach((varName) => {
            // RESOURCE-002: 检测误用（写进CSS）
            if (
              styleContent.includes(varName) &&
              (styleContent.includes(`url(\${${varName}})`) ||
                styleContent.includes(`url(@${varName})`) ||
                styleContent.includes(`url($${varName})`))
            ) {
              misusedInStyle.push(varName);
            }
          });

          // 报告 RESOURCE-002（BLOCK级别）
          if (misusedInStyle.length > 0) {
            issues.push({
              id: 'RESOURCE-002',
              severity: 'BLOCK',
              file: filePath,
              message: `资源变量 ${misusedInStyle.join(', ')} 被错误地写入 <style> 块中。资源变量只能在模板插值中使用（如 <img :src="${misusedInStyle[0]}"> 或 :style="{ backgroundImage: 'url(' + ${misusedInStyle[0]} + ')' }"），禁止写进 CSS（url(\${${misusedInStyle[0]}}) 会导致 LESS 编译崩溃）`,
            });
          }
        }

        // 报告 RESOURCE-001（WARN级别）—— 全局 corpus 判定（同源）
        const unusedResources = [];
        availableResources.forEach((m) => {
          if (!isResourceUsedInCorpus(usageCorpus, m)) {
            const varName = m.assignedVarName || m.semanticVarName || m.name;
            if (varName) unusedResources.push(varName);
          }
        });
        if (unusedResources.length > 0) {
          issues.push({
            id: 'RESOURCE-001',
            severity: 'WARN',
            file: 'package/index.vue',
            message: `已下载但未使用的资源变量: ${unusedResources.join(', ')}。建议在模板中使用这些资源以提升视觉还原度（资源使用率: ${Math.round(((availableResources.length - unusedResources.length) / availableResources.length) * 100)}%）`,
          });
        }

        // 🛡️ RESOURCE-003: 幽灵资源变量引用（typeof _bgChart 等，BLOCK，2026-09-03）
        // LLM 臆造下划线前缀资源变量（如 _bgChart），期望系统注入，但系统实际注入的是
        // bg1/bg2/icon1/img1 等编号变量（resourceVars）。`typeof _bgChart` 恒 === 'undefined'
        // → `const x = typeof _bgChart !== 'undefined' ? _bgChart : ''` 恒为 '' → 资源底图/图标
        // 静默丢失（mv-max-1788365247487 环境监测实锤：vue3 主题色/图表缺失根因之一）。
        // 仅匹配「资源类前缀（bg/icon/img）+ 下划线开头 + 不在 resourceVars」的 typeof 引用，
        // 合法代码不会 `typeof _bgXxx` 这种未注入的资源名，零误杀。
        {
          const ghostVars = new Set();
          for (const file of generatedFiles) {
            const fp = file.path || '';
            const c = file.content || '';
            if (!fp.endsWith('.vue')) continue;
            const sm = c.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
            const sb = sm ? sm[1] : '';
            if (!sb) continue;
            const ghostRx = /typeof\s+_([a-zA-Z][\w]*)/g;
            let gm;
            while ((gm = ghostRx.exec(sb)) !== null) {
              const ghostName = `_${gm[1]}`;
              if (/^(bg|icon|img)/.test(gm[1]) && !resourceVars.has(ghostName)) {
                ghostVars.add(ghostName);
              }
            }
          }
          if (ghostVars.size > 0) {
            issues.push({
              id: 'RESOURCE-003',
              severity: 'BLOCK',
              file: 'package/index.vue',
              message: `引用了未注入的幽灵资源变量：${[...ghostVars].join(', ')}。资源变量由系统按 bg1/bg2/icon1/img1 编号注入，请直接引用已 import 的变量（如 bg1），禁止 typeof _xxx 引用下划线前缀的臆造资源名（该写法恒为 undefined，导致背景/图标静默丢失）`,
            });
          }
        }

      }
    }

    // ========== CODE-014: 根容器无证据装饰检测（两者通用，BLOCK，P0）==========
    // designFacts.root.styleEvidence 是 figma-api 确定性真值：某项 allowed:false 时根容器严禁生成该装饰。
    // 模型常基于「漂亮大屏」先验臆造根背景/边框/圆角/阴影，需硬性 BLOCK（L0-B 失败）兜底重生成。
    {
      const styleEvidence =
        options?.styleEvidence ||
        options?.designFacts?.root?.styleEvidence ||
        (options?.figmaNodeData
          ? compileDesignFacts({ figmaNodeData: options.figmaNodeData }).root
              .styleEvidence
          : null);

      if (styleEvidence && typeof styleEvidence === 'object') {
        let rootClass = '';
        for (const file of generatedFiles) {
          if ((file.path || '').endsWith('index.vue')) {
            const { rootClass: rc } = findRootStyleBlock(file.content || '');
            if (rc) {
              rootClass = rc;
              break;
            }
          }
        }
        if (rootClass) {
          const rootBody = extractRootRuleBodyFromFiles(
            generatedFiles,
            rootClass,
          );
          // 🛡️ R6（2026-08-31，mc-1788157559938-782399cf 实锤）：豁免「面板整体背景」。
          //    根容器真值无 background，但 N4 后处理（microcode-engineer 根容器锚定）
          //    会确定性注入 skipMount:true 的面板 bg（治「根容器无背景」塌缩）——
          //    注入产物 url 命中 mapping 里的面板资源文件名，属于系统行为而非 LLM 臆造。
          //    不豁免则「注入 → CODE-014 BLOCK → LLM 删 → N4 再注入」死循环，重试必耗尽。
          const panelBgFiles = new Set(
            (options?.resourceDomMapping || [])
              .filter(
                (m) =>
                  m &&
                  m.previewAnalysisRole === 'bg' &&
                  m.skipMount === true &&
                  m.resourceFile,
              )
              .map((m) => String(m.resourceFile).split('/').pop()),
          );
          const rootBgUrls = [
            ...rootBody.matchAll(/url\((['"]?)([^'")]+)\1\)/gi),
          ].map((m) => String(m[2]).split('/').pop());
          const bgAllPanelBg =
            panelBgFiles.size > 0 &&
            rootBgUrls.length > 0 &&
            rootBgUrls.every((f) => panelBgFiles.has(f));
          const forbidden = [];
          if (
            styleEvidence.background?.allowed === false &&
            rootHasBackground(rootBody) &&
            !bgAllPanelBg
          )
            forbidden.push('background');
          if (
            styleEvidence.border?.allowed === false &&
            rootHasBorder(rootBody)
          )
            forbidden.push('border');
          if (
            styleEvidence.borderRadius?.allowed === false &&
            rootHasBorderRadius(rootBody)
          )
            forbidden.push('border-radius');
          if (
            styleEvidence.boxShadow?.allowed === false &&
            rootHasBoxShadow(rootBody)
          )
            forbidden.push('box-shadow');
          if (forbidden.length > 0) {
            issues.push({
              id: 'CODE-014',
              severity: 'BLOCK',
              file: 'package/index.vue',
              message: `根容器（.${rootClass}）的 Figma 真值不含以下装饰，但产物中检测到：${forbidden.join('、')}。styleEvidence 确认根容器无对应证据，禁止臆造（违反 L0-B，需重生成）`,
            });
          }
        }
      }
    }

    // ========== 🎯 方案6: LAYOUT-001 布局方向校验（两者通用，BLOCK）==========
    // 验证生成的 template 中每个 section 的布局方向是否与 layoutStructure 标注一致
    if (options?.layoutStructure?.sections) {
      const sections = options.layoutStructure.sections || [];
      const indexVueFile = generatedFiles.find((f) =>
        (f.path || '').endsWith('index.vue'),
      );

      if (indexVueFile && sections.length > 0) {
        const content = indexVueFile.content || '';
        const templateMatch = content.match(
          /<template>([\s\S]*?)<\/template>/i,
        );
        if (templateMatch) {
          const templateContent = templateMatch[1];

          for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            const expectedLayout =
              section.layout ||
              (section.body && section.body.layout) ||
              'vertical';
            const gridCols = section.body && section.body.gridColumns;

            // 简化检测：根据 section 名称或序号查找对应的 DOM 节点区域
            // 检查是否包含正确的布局方向 CSS
            let layoutMismatch = false;
            let expectedCss = '';
            let issue = '';

            if (expectedLayout === 'horizontal') {
              expectedCss = 'flex-direction: row 或 display: flex（横向）';
              // 检测是否误用了竖向布局（flex-direction: column）
              if (
                /flex-direction:\s*column/i.test(templateContent) &&
                !/flex-direction:\s*row/i.test(templateContent)
              ) {
                layoutMismatch = true;
                issue = `Section ${i + 1} (${section.name || 'unnamed'}) 标注为横向布局（horizontal），但模板中使用了 flex-direction: column（竖向）`;
              }
            } else if (expectedLayout === 'vertical') {
              expectedCss = 'flex-direction: column 或默认竖向堆叠';
              // 竖向布局较为宽松，只要不是明确的横向或网格即可
            } else if (expectedLayout === 'grid' && gridCols) {
              expectedCss = `display: grid; grid-template-columns: repeat(${gridCols}, 1fr)`;
              // 检测是否使用了 grid 布局且列数正确
              const gridColsRegex = new RegExp(
                `grid-template-columns:\\s*repeat\\(\\s*${gridCols}\\s*,`,
                'i',
              );
              if (
                /display:\s*grid/i.test(templateContent) &&
                !gridColsRegex.test(templateContent)
              ) {
                layoutMismatch = true;
                issue = `Section ${i + 1} (${section.name || 'unnamed'}) 标注为 ${gridCols} 列网格布局，但模板中网格列数不匹配`;
              } else if (!/display:\s*grid/i.test(templateContent)) {
                layoutMismatch = true;
                issue = `Section ${i + 1} (${section.name || 'unnamed'}) 标注为网格布局（grid），但模板中使用了非网格布局`;
              }
            } else if (/2-?col/i.test(expectedLayout)) {
              expectedCss = 'flex-direction: row（两列并排）';
              if (!/flex-direction:\s*row/i.test(templateContent)) {
                layoutMismatch = true;
                issue = `Section ${i + 1} (${section.name || 'unnamed'}) 标注为两列布局（2-col），但模板中未使用 flex-direction: row`;
              }
            }

            if (layoutMismatch && issue) {
              issues.push({
                id: 'LAYOUT-001',
                severity: 'BLOCK',
                file: indexVueFile.path,
                message: `${issue}。期望：${expectedCss}`,
              });
            }
          }
        }
      }
    }

    // ========== 🎯 方案6: STYLE-001 common.less 外层选择器包裹检测（微码，BLOCK）==========
    // common.less 中的 class 必须写在文件根层，禁止被 .dark / .light / 任何外层选择器包裹
    // 原因：宿主环境不给组件根元素添加 .dark/.light 类，包裹后编译成 `.dark .c-xxx`，真实DOM上0命中 → 样式全部失效
    if (!isVue3) {
      const commonLessFile = generatedFiles.find(
        (f) =>
          f.path &&
          (f.path.endsWith('common.less') || f.path.includes('common.less')),
      );
      if (commonLessFile) {
        const content = commonLessFile.content || '';
        // 检测是否有外层选择器包裹 class（如 .dark { .c-xxx {} } 或 .light { .c-xxx {} }）
        // ⚠️ (?!c-) 负向前瞻：common.less 里 `.c-parent { .c-child {} }` 是合法的 LESS 嵌套
        //    （编译成 `.c-parent .c-child`，父子关系在真实 DOM 上命中），不是主题包裹。
        //    少了这个前瞻会把所有 c- 嵌套误报成 STYLE-001（R3：误报导致重试耗尽+L0-B BLOCK）
        const wrappedClassRegex =
          /^\s*\.(?!c-)(dark|light|[\w-]+)\s*\{[^}]*\.c-[\w-]+/m;
        const wrappedMatch = content.match(wrappedClassRegex);
        if (wrappedMatch) {
          const wrapper = wrappedMatch[1];
          // 仅当包裹层是「主题/作用域」语义（dark|light|theme-*|*-theme|root|page|app|wrap* 等）才 BLOCK，
          // 其余非 c- 包裹降级为 WARN，避免把合法的 BEM/语义分组嵌套一棍子打死
          const isThemeLike =
            /^(dark|light)$/i.test(wrapper) ||
            /(^|-)(theme|mode|root|page|app|wrapper|wrap|scope|container)($|-)/i.test(
              wrapper,
            );
          issues.push({
            id: 'STYLE-001',
            severity: isThemeLike ? 'BLOCK' : 'WARN',
            file: commonLessFile.path,
            message: isThemeLike
              ? `common.less 中的 class 被主题/作用域选择器 .${wrapper} 包裹。宿主不给组件根添加该类，包裹后样式在真实DOM上0命中。必须将所有 .c- class 直接写在文件根层`
              : `common.less 中 .c- class 被外层选择器 .${wrapper} 包裹（非主题类）。请确认该包裹层在真实 DOM 上存在；若不存在请将 .c- class 提到文件根层`,
          });
        }
      }
    }

    // ========== 🎯 方案6: STYLE-002 class 使用实例ID前缀检测（微码，WARN）==========
    // 禁止使用实例ID作为 class 前缀（如 .c-f0abee-container、.c-mc-max-1234567890-header）
    // 原因：实例ID是运行时随机标识符，写进CSS后其他实例无法复用样式
    if (!isVue3) {
      const commonLessFile = generatedFiles.find(
        (f) =>
          f.path &&
          (f.path.endsWith('common.less') || f.path.includes('common.less')),
      );
      if (commonLessFile) {
        const content = commonLessFile.content || '';
        // 检测实例ID模式：c-f0abee- 或 c-mc-max-数字-
        const instanceIdPattern = /\.c-([a-f0-9]{6}|mc-max-\d+)-[\w-]+/g;
        const matches = content.match(instanceIdPattern);
        if (matches && matches.length > 0) {
          const examples = [...new Set(matches)].slice(0, 3);
          issues.push({
            id: 'STYLE-002',
            severity: 'WARN',
            file: commonLessFile.path,
            message: `检测到 ${matches.length} 个使用实例ID的 class（如 ${examples.join('、')}）。实例ID是运行时随机标识符，应使用功能语义命名（如 .c-env-monitor-header）`,
          });
        }
      }
    }

    // ========== 🎯 方案6: STYLE-003 子组件 margin 检测（两者通用，WARN）==========
    // 子组件根元素不应设置 margin（应由父组件控制间距）
    // 检查所有 components/ 下的 .vue 文件
    for (const file of generatedFiles) {
      const filePath = file.path || '';
      if (!filePath.includes('/components/') || !filePath.endsWith('.vue'))
        continue;

      const content = file.content || '';
      const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (!styleMatch) continue;

      const styleContent = styleMatch[1];
      // 查找根元素 class（通常是第一个 class）
      const templateMatch = content.match(
        /<template>[\s\S]*?class=["']([^"']+)["']/i,
      );
      if (!templateMatch) continue;

      const rootClass = templateMatch[1].split(/\s+/)[0];
      // 检查根 class 的样式中是否有 margin
      const rootClassRegex = new RegExp(
        `\\.${rootClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*margin[^}]*\\}`,
        'i',
      );
      if (rootClassRegex.test(styleContent)) {
        issues.push({
          id: 'STYLE-003',
          severity: 'WARN',
          file: filePath,
          message: `子组件根元素（.${rootClass}）设置了 margin。子组件间距应由父组件控制（使用 gap），子组件只管理内部样式（padding）`,
        });
      }
    }

    // ========== CODE-015: 模板绑定表达式 c- 类名前缀标识符检测（两者通用，BLOCK）==========
    // LLM 常把 CSS 类名前缀（c-mc-<id>- 或 c-monitor-，含连字符）误当作 JS 变量/对象 key：
    //   - legendState.c-monitor-beijing → 减法链，恒 undefined（静默）或哈希段数字开头时
    //     "Identifier directly after number"（语法崩溃）
    //   - { c-mc-<id>-active: ... } → 对象 key 含连字符未加引号，直接语法崩溃
    // 需在 L0-B 落盘前硬拦截（BLOCK），避免靠 LLM 重试打地鼠。
    {
      const BIND_RE =
        /(:[a-zA-Z-]+|v-[a-zA-Z-]+|@[a-zA-Z.-]+)\s*=\s*"([^"]*)"/g;
      for (const file of generatedFiles) {
        const filePath = file.path || '';
        const content = file.content || '';
        if (!filePath.endsWith('.vue')) continue;
        const templateMatch = content.match(
          /<template[^>]*>([\s\S]*?)<\/template>/i,
        );
        if (!templateMatch) continue;
        const templateContent = templateMatch[1];

        const offenders = [];
        let bindMatch;
        while ((bindMatch = BIND_RE.exec(templateContent)) !== null) {
          const expr = bindMatch[2] || '';
          const hits = findCPrefixIdentifiers(expr);
          for (const h of hits) {
            offenders.push(
              h.prev === '.' ? `点号访问 ${h.token}` : `裸标识符 ${h.token}`,
            );
          }
        }
        if (offenders.length > 0) {
          const uniq = [...new Set(offenders)];
          issues.push({
            id: 'CODE-015',
            severity: 'BLOCK',
            file: filePath,
            message: `模板绑定表达式中 ${offenders.length} 处把 CSS 类名前缀当 JS 变量/对象 key 使用: ${uniq.slice(0, 5).join(', ')}${uniq.length > 5 ? '...' : ''}。含连字符的 key 必须方括号访问（legendState['c-xxx']）或去前缀用 script 里的 ref 名（chartType），禁止 legendState.c-xxx / { c-xxx-key: ... } 写法`,
          });
        }
      }
    }

    // ========== CODE-016: 样式块非根容器直写资源相对路径（两者通用，分级）==========
    // P2-4（2026-08-30，mc-max-1788056145870 实锤）：LLM 在 common.less 里给非根容器直写
    // url(../images/bg-7890.png)，绕过 import 变量机制 → resource-attribution-validator
    // 按变量名完全看不见它，导致「已用却判未用 → 二次挂载」或资源归属误判。
    //
    // 🛡️ R4 修订（2026-08-30，mc-max-1788065970150 复核）：该规则本身不是误报——它抓到的
    //    正是用户反馈的「图表区多出一大块背景」（common.less 给 .chart-section 直写 bg-7890）。
    //    但原实现「一刀切 BLOCK」会误杀两类合法形态：
    //      ① 根容器的整块背景兜底挂载（我们自己的 _autoMount* 兜底 + LLM 的正确做法都长这样）
    //      ② LESS 变量定义行（@bg-image-7890: url(...)，只是定义、不渲染，由 RES-UNUSED 兜底）
    //    故改为「归属分级」：根容器/变量定义 → WARN；非根容器规则内直写 → BLOCK。
    {
      const mappingList = options?.resourceDomMapping || [];
      const resourceFileNames = new Set(
        mappingList
          .filter((m) => m && m.resourceFile)
          .map((m) => String(m.resourceFile).split('/').pop()),
      );
      // 🛡️ R5（2026-08-31，mc-max-1788156091997-aa001b1d 实锤）：原 legal 只认「根容器 + 变量定义」，
      //    把两类合法形态误杀成 BLOCK，且重试永远修不好（模板自带，改不掉）：
      //      ① mountTarget 指定容器：bg 资源本就该挂到 figma-connector 推导出的父容器上，
      //         注释与报错文案都承诺「根容器或 mountTarget 指定的容器」，代码却没实现 mountTarget 分支。
      //      ② sub-state 状态背景：bgRole==='sub-state'（面积比<0.8，如 tabs-list/bg-tab-active 78×21）
      //         是局部/状态装饰背景，各状态容器各挂一处是设计本意，不受「整块背景只挂根容器」约束。
      //    按资源文件名建索引，供下方 legal 判定查表。
      const legalMountByFile = new Map();
      for (const m of mappingList) {
        if (!m || !m.resourceFile) continue;
        const fname = String(m.resourceFile).split('/').pop();
        const meta = legalMountByFile.get(fname) || {
          mountTargets: [],
          isSubState: false,
        };
        if (m.mountTarget) meta.mountTargets.push(String(m.mountTarget));
        if (m.bgRole === 'sub-state') meta.isSubState = true;
        legalMountByFile.set(fname, meta);
      }
      if (resourceFileNames.size > 0) {
        const rootCls = this._extractRootContainerClass(generatedFiles);
        for (const file of generatedFiles) {
          const filePath = file.path || '';
          const content = file.content || '';
          const isVue = filePath.endsWith('.vue');
          const isLess = filePath.endsWith('.less') || filePath.endsWith('.css');
          if (!isVue && !isLess) continue;
          // .vue 取 <style> 块；.less/.css 全文件即样式
          const styleMatch = content.match(
            /<style[^>]*>([\s\S]*?)<\/style>/i,
          );
          const styleContent = isVue ? styleMatch?.[1] || '' : content;
          if (!styleContent) continue;

          const offenders = [];
          const tolerant = [];
          for (const hit of this._scanStyleResourceUrls(styleContent)) {
            const fname = String(hit.url).split('/').pop();
            if (!resourceFileNames.has(fname)) continue;
            const meta = legalMountByFile.get(fname);
            const legal =
              hit.kind === 'less-var-decl' ||
              (rootCls && hit.selector && hit.selector.includes(rootCls)) ||
              (hit.selector &&
                (meta?.mountTargets || []).some((t) =>
                  this._selectorMatchesMountTarget(hit.selector, t),
                )) ||
              meta?.isSubState === true;
            (legal ? tolerant : offenders).push({
              fname,
              selector: hit.selector || '(变量定义)',
              mountTargets: meta?.mountTargets || [],
            });
          }
          if (offenders.length > 0) {
            const uniq = [...new Set(offenders.map((o) => o.fname))];
            const at = [...new Set(offenders.map((o) => o.selector))].slice(0, 3);
            // 🛡️ R6（2026-08-31，mc-max-1788165979299-01f105b7 实锤 3 轮重试耗尽）：
            //    原文案只说「非根容器」+「只能挂根容器或 mountTarget 指定的容器」，
            //    却从不输出 mountTarget 的**实际值**，也不给产物里可选的容器 → LLM 只能盲猜，
            //    重试预算耗尽是必然结果。这里把权威结论（mountTarget）与候选容器一并输出。
            const guideLines = [];
            for (const fname of uniq.slice(0, 3)) {
              const targets = [
                ...new Set(
                  offenders
                    .filter((o) => o.fname === fname)
                    .flatMap((o) => o.mountTargets || []),
                ),
              ];
              if (targets.length === 0) {
                guideLines.push(
                  `${fname}：该资源无 mountTarget（非 container 背景 / mapping 缺失），禁止直写，必须改用模板变量绑定`,
                );
                continue;
              }
              for (const t of targets) {
                const candidates = this._collectMountCandidates(generatedFiles, t);
                guideLines.push(
                  candidates.length > 0
                    ? `${fname} → mountTarget='${t}'，本组件内可挂载的容器：${candidates.join('、')}`
                    : `${fname} → mountTarget='${t}'，产物中未找到匹配容器，请新建一个含该语义的容器 class（如 xxx-${t}），或挂到根容器${rootCls ? ` ${rootCls}` : ''}`,
                );
              }
            }
            const guide =
              guideLines.length > 0
                ? `\n【本组件挂载指引】\n${guideLines.map((l) => `  - ${l}`).join('\n')}`
                : '';
            issues.push({
              id: 'CODE-016',
              severity: 'BLOCK',
              file: filePath,
              message: `样式块在非根容器（${at.join('、')}）直写了资源相对路径（${uniq.slice(0, 3).join('、')}），这是「背景挂错容器」的典型形态。整块背景只能挂在根容器${rootCls ? `（${rootCls}）` : ''}或 mountTarget 指定的容器上；其余必须改用模板 <img :src="var"> 或 :style="{ backgroundImage: \`url(\${var})\` }" 绑定资源变量。${guide}`,
            });
          } else if (tolerant.length > 0) {
            const uniq = [...new Set(tolerant.map((o) => o.fname))];
            issues.push({
              id: 'CODE-016',
              severity: 'WARN',
              file: filePath,
              message: `样式块在根容器/变量定义处直写了资源路径（${uniq.slice(0, 3).join('、')}）。属合法兜底挂载，但请确认相对路径正确（resources/styles/*.less 应为 ../images/x；resources/styles/themes/*.less 应为 ../../images/x）`,
            });
          }
        }
      }
    }

    // ========== CODE-017: bg 整块背景被多容器引用（两者通用，BLOCK）==========
    // P2-3（2026-08-30，mc-max-1788056145870 实锤）：bg-7890（整块背景）被挂 3 处
    // （base-panel 内联 + .chart-section + tabs-list 真值），T07 检出「引用 3 次」却只 WARN 放行。
    // 整块背景（previewAnalysisRole==='bg'）设计上只应挂一个容器，多引用即资源分发错误，落盘前 BLOCK。
    //
    // 🛡️ R4 修订（2026-08-30）：原实现只数「直写路径」，看不见 url(${bg2}) 这种变量引用，
    //    于是本应拦下的真实错误被漏掉——mc-max-1788065970150 里 bg2(=bg-7890) 同时挂在
    //    .tabs-section 与 .tabs-bg（正是用户反馈「tabs-section 多了一个背景，应该挂在 tabs-bg」），
    //    CODE-017 却只数到 index.css/common.less 的 2 次直写。
    //    现通过 import 变量 → 资源文件映射，把变量引用一并计入，直写与变量两种形态统一计数。
    {
      // 🛡️ R5（2026-08-31，mc-max-1788156091997-aa001b1d 实锤）：必须排除 bgRole==='sub-state'。
      //    previewAnalysisRole==='bg' 只是「这是一张背景图」，不代表它是整块背景 —— 真正的
      //    整块/局部分野在 bgRole（figma-connector 用面积比+IoU 几何推导：container / sub-state）。
      //    sub-state 是状态装饰背景（tabs-list/bg-tab-active 78×21，面积比 0.21），设计上
      //    normal/active 各挂一处，把它按「整块背景只能挂一个容器」判 BLOCK 属于规则张冠李戴。
      const bgResourceFiles = new Set(
        (options?.resourceDomMapping || [])
          .filter(
            (m) =>
              m &&
              m.previewAnalysisRole === 'bg' &&
              m.bgRole !== 'sub-state' &&
              m.resourceFile,
          )
          .map((m) => String(m.resourceFile).split('/').pop()),
      );
      if (bgResourceFiles.size > 0) {
        const allCode = generatedFiles.map((f) => f.content || '').join('\n');
        // 变量 → 资源文件名：解析 import bg2 from '../resources/images/bg-7890.png'
        const varToFile = new Map();
        for (const m of allCode.matchAll(
          /import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g,
        )) {
          const fname = String(m[2]).split('/').pop();
          if (bgResourceFiles.has(fname)) varToFile.set(m[1], fname);
        }
        // 🛡️ 分桶统计（2026-09-03，mc-1788395352082 误报实锤）：直写路径按「文件名」统计、
        // 变量引用按「变量名」统计。此前两者混用一个 usage（按文件名），导致「12 个设备卡片背景
        // 结构相同被资源去重成同一文件 bg-8439.png，各用 bg3/bg4/bg5 变量挂到各自卡片」被误合并
        // 成「bg-8439.png 引用 3 次」→ 误判整块背景被多容器引用。真正的资源分发错误是：
        // ① 同一文件直写多次；② 同一变量被引用多次。不同变量各挂一处（即便指向同一去重图片）是合法的。
        const directUsage = new Map(); // 文件名 → 直写次数
        const varUsage = new Map(); // 变量名 → 引用次数
        const bumpDirect = (fname) =>
          directUsage.set(fname, (directUsage.get(fname) || 0) + 1);
        const bumpVar = (v) => varUsage.set(v, (varUsage.get(v) || 0) + 1);

        // ① 直写路径
        //    🛡️ R5（2026-08-31）：必须排除 less-var-decl（@bg-main: url(...);）。
        //    变量定义只是声明、不渲染成背景，挂载次数应由使用处决定 —— 这与 CODE-016 的处理
        //    （less-var-decl 归为合法、不算挂载）必须保持一致，否则两套规则互相矛盾。
        //    实锤影响：主题模板自带 light/dark 两份 theme-vars.less，同一资源被变量定义 2 次，
        //    于是「真实挂载 1 次 + 变量定义 2 次 = 3 次 > 1」→ BLOCK，而 LLM 无论怎么改模板
        //    都消不掉这两处定义，重试 3 轮必然耗尽。
        for (const hit of this._scanStyleResourceUrls(allCode)) {
          if (hit.kind === 'less-var-decl') continue;
          const fname = String(hit.url).split('/').pop();
          if (bgResourceFiles.has(fname)) bumpDirect(fname);
        }
        // ② 变量引用：`url(${bg2})` / url(' + bg2 + ') / <img :src="bg2">
        for (const m of allCode.matchAll(
          /url\(\s*[`'"][^`'"]*\$\{\s*([A-Za-z_$][\w$]*)\s*\}[^`'"]*[`'"]\s*\)/g,
        )) {
          if (varToFile.has(m[1])) bumpVar(m[1]);
        }
        for (const m of allCode.matchAll(
          /url\(\s*['"]?\s*\+\s*([A-Za-z_$][\w$]*)\s*\+\s*['"]?\s*\)/g,
        )) {
          if (varToFile.has(m[1])) bumpVar(m[1]);
        }
        for (const m of allCode.matchAll(
          /:src\s*=\s*"([A-Za-z_$][\w$]*)"/g,
        )) {
          if (varToFile.has(m[1])) bumpVar(m[1]);
        }

        for (const [fname, count] of directUsage) {
          if (count > 1) {
            issues.push({
              id: 'CODE-017',
              severity: 'BLOCK',
              file: 'package/index.vue',
              message: `整块背景资源 ${fname} 被直写引用 ${count} 次，资源分发错误（设计上整块背景只应挂一个容器）。请仅在 mountTarget 匹配的容器挂载一次，其余引用剔除`,
            });
          }
        }
        for (const [v, count] of varUsage) {
          if (count > 1) {
            issues.push({
              id: 'CODE-017',
              severity: 'BLOCK',
              file: 'package/index.vue',
              message: `整块背景变量 ${v} 被引用 ${count} 次，资源分发错误（同一背景变量只应挂一个容器）。请仅在 mountTarget 匹配的容器挂载一次，其余引用剔除`,
            });
          }
        }
      }
    }

    // 🛡️ CODE-018（2026-08-31，P0/D 契约对齐 2026-09-09）：子组件资源依赖声明检查 —— BLOCK
    // 子组件（package/components/*.vue）若在模板/样式中使用了资源变量（bg1/icon2/img3…），
    // 必须在 <script setup> 中「import 或 const/let 声明」，**或经 defineProps 接收**（P0/D 契约：
    // 资源只在主组件 import 一次，子组件只经 defineProps 透传接收，详见 resource-handling-guide.md）。
    // 注意：collectDeclaredBindings 已把 defineProps 的 prop 名（含嵌套对象 / 泛型）纳入「已声明」集合，
    // 因此经契约改写后的子组件（本地资源 import → defineProps 资源 prop）不会误判 CODE-018。
    // 检测逻辑与 microcode-engineer 编译前置校验（方案 3）共用同一纯函数，保证两处判定一致。
    if (
      options?.resourceDomMapping &&
      Array.isArray(options.resourceDomMapping) &&
      options.resourceDomMapping.length > 0
    ) {
      for (const f of generatedFiles) {
        const p = String(f?.path || '');
        // 仅检查子组件（与 bad-file-isolation 的 isDegradableVuePath 口径一致）：
        // 入口 package/index.vue 由 CODE-016/017 覆盖，不重复检查。
        if (!/\/components\/[^/]+\.vue$/.test(p)) continue;
        if (!f?.content) continue;
        const depResult = validateSubcomponentResourceDeps(
          f.content,
          p,
          options.resourceDomMapping,
        );
        if (!depResult.valid) {
          for (const err of depResult.errors) {
            issues.push({
              id: 'CODE-018',
              severity: 'BLOCK',
              file: p,
              message: `子组件资源依赖缺失：${err}`,
            });
          }
        }
      }
    }

    // 🛡️ P1-1（2026-08-30）：节点级尺寸绑定 —— class→figmaBox ±2px 精确校验
    // 资源容器（resourceDomMapping 中有 mountTarget 的）的 CSS width/height 必须与
    // Figma 真值一致（±2px 容忍度），阻断「根尺寸套子元素」等偏差。
    if (options?.resourceDomMapping && Array.isArray(options.resourceDomMapping)) {
      const nodeSizeIssues = validateNodeSizes(
        files,
        options.resourceDomMapping,
        { tolerance: 2, componentId },
      );
      if (nodeSizeIssues.length > 0) {
        issues.push(...nodeSizeIssues);
      }
    }

    // 🛡️ CODE-019（2026-09-07）：Props 接线校验 —— BLOCK
    // 主组件调用子组件时必须传入所有 required props，否则运行时 Vue 警告 + 渲染异常。
    // 事实源在 props-wiring-guard.js，此处 fail-closed 兜底。
    try {
      const propsWiringIssues = detectMissingPropsWiring(generatedFiles, {
        resourceDomMapping: options?.resourceDomMapping,
      });
      if (propsWiringIssues.length > 0) {
        issues.push(...propsWiringIssues);
      }
    } catch (err) {
      // 检测器异常不阻断（fail-open）：避免检测 bug 误杀全部生成
      issues.push({
        id: 'CODE-019-ERROR',
        severity: 'WARN',
        file: '(props-wiring-guard)',
        message: `Props 接线检测器执行异常（非阻断）：${err?.message || String(err)}`,
      });
    }

    // ========== 🛡️ TEXT-001: 文本兄弟顺序漂移（两者通用，BLOCK，2026-09-01）==========
    // 事故 mc-max-1788251680480-98c9140b：Figma tabs-list 的 4 个 TEXT 子节点视觉 x 序 ≠
    // children 数组序，产物 v-for 数组按 children 序 → 「能见度」从视觉第 2 位掉到末位。
    // 文案全部正确、只有顺序错 → DO-NOT-INVENT-TEXT / ELEMENT 覆盖率全放行（存在性检查盲区）。
    // 事实源 = 同一父容器 TEXT 直接子节点的视觉坐标排序（utils/text-order-guard.js），
    // 自愈在 code-fix-rules「fix-text-sibling-order」先行（生成侧确定性重排），
    // 此处 fail-closed 兜底：自愈后仍有残留漂移（结构不可判定/自愈异常）→ BLOCK。
    if (options?.figmaNodeData) {
      try {
        const drifts = detectTextOrderDrift(files, options.figmaNodeData);
        for (const d of drifts) {
          issues.push({
            id: 'TEXT-001',
            severity: 'BLOCK',
            file: d.file,
            message: `文本兄弟顺序漂移：Figma 容器「${d.parentName || '(未命名)'}」内文本的视觉顺序为 [${d.expected.join(' → ')}]，产物实际为 [${d.actual.join(' → ')}]（${d.kind === 'array' ? 'script 数组字面量' : 'template 静态兄弟元素'}）。文案全部正确但顺序错误——Figma 图层顺序≠视觉顺序，请按视觉坐标排序重排（水平组按 x、垂直组按 y）`,
          });
        }
      } catch (err) {
        // 检测器异常不阻断（fail-open）：避免检测 bug 误杀全部生成，交由下游门禁与人工复核
        issues.push({
          id: 'TEXT-001-ERROR',
          severity: 'WARN',
          file: '(text-order-guard)',
          message: `文本顺序检测器执行异常（非阻断）：${err?.message || String(err)}`,
        });
      }
    }

    // ========== 🛡️ COMP-001: 模块组装覆盖（仅微码，BLOCK，2026-09-02）==========
    // 事故 mc-max-1788306635802（流量监测）：vision 88% 捕获 5 section、强制拆分 5 子组件、
    // LLM 也生成了 5 个子组件文件，但 index.vue 只内联 1 个 section，其余 4 个零引用 →
    // 预览里 4/5 模块整块消失。既有机制（ensureSubComponentImport 只补已出现 tag 的 import、
    // pruneOrphanSubComponents 反向删孤儿、各 CODE 规则只查资源/硬编码）全部漏检。
    // 此处 fail-closed：规划的 section 必须全部组装进 index.vue（引用或内联），否则 BLOCK，
    // 触发 L0-B 重试让模型把缺失模块补回。
    if (!isVue3 && options?.componentPlan) {
      try {
        const missingSections = detectMissingSections(
          files,
          options.componentPlan,
        );
        if (missingSections.length > 0) {
          const total =
            options.componentPlan.effectiveSections?.length ??
            missingSections.length;
          const titles = missingSections
            .map((s) => `「${s.title}」`)
            .join('、');
          issues.push({
            id: 'COMP-001',
            severity: 'BLOCK',
            file: 'package/index.vue',
            message: `模块组装缺失：componentPlan 强制拆分了 ${total} 个 section，但 index.vue 未组装其中 ${missingSections.length} 个（${titles}）——这些模块在预览中整块消失。请在 index.vue 模板中通过 <子组件 /> 引用对应子组件（package/components/ 下已有生成文件），或将该 section 内容内联渲染，确保所有规划模块全部落地`,
            hint: {
              suggestion:
                '检查 package/components/ 下已生成但未被 index.vue import/使用的子组件，把它们组装进模板',
            },
          });
        }
      } catch (err) {
        // 检测器异常不阻断（fail-open）：避免检测 bug 误杀全部生成
        issues.push({
          id: 'COMP-001-ERROR',
          severity: 'WARN',
          file: '(section-coverage-guard)',
          message: `section 覆盖检测器执行异常（非阻断）：${err?.message || String(err)}`,
        });
      }
    }

    // ========== 🛡️ TEXT-TRUTH: 文字真值白名单（两者通用，2026-09-02 建立 / 09-03 升级 / 09-04 放宽）==========
    // 事故 mc-max-1788306653919-a57e4409（设备监测）：vision 把「监控」OCR 成「挖掘机」、
    // 「烟道机器人」成「烟雾机器人」、「交通诱导」成「交通设施」、臆造「控制」。do-not-invent
    // 是黑名单（vision 自误时约束也错），防不了。此处用白名单：产物里任何「不在 Figma
    // characters 真值里的中文」= OCR 误读/臆造。
    // 🛡️ 2026-09-03 升级 BLOCK：此前 WARN 静默放行，臆造文字（如环境监测「当前」「24-7h5CO浓度」
    // 等 vision 臆造的 stat 区块）仍落盘交付（mc-max-1788365238726 事故）。检测确定性高
    // （只查模板文本 + script label/name/text 字段，已排除注释/console.log/aria-label/theme），
    // 升级为 fail-closed，臆造文字直接阻断，交由重试用 Figma 真值替换。
    // 🛡️ 2026-09-04 放宽阈值：1 处臆造文字就 BLOCK 导致任务频繁失败（mc-max-1788499007313
    // 事故：仅「房址」1 处 OCR 误读，重试耗尽）。改为阈值策略：≤2 处降级 WARN（允许少量
    // OCR 误读通过），>2 处仍 BLOCK（防止大量臆造）。配合 prompt 注入白名单降低误读率。
    if (options?.figmaNodeData) {
      try {
        const unknownTexts = detectUnknownText(files, options.figmaNodeData);
        if (unknownTexts.length > 0) {
          // 真值可能含换行（Figma 两行文本如 "南北接线\n设备"），展示时转义为字面量，
          // 否则 LLM 收到真实换行会把「该替换成什么」读丢——修正指导失效、重试再度盲猜。
          const esc = (s) => String(s || '').replace(/\n/g, '\\n');
          const samples = unknownTexts
            .slice(0, 8)
            .map((u) => (u.suggest ? `「${u.text}」→ 应为「${esc(u.suggest)}」` : `「${u.text}」`))
            .join('；');
          const deletable = unknownTexts.filter((u) => !u.suggest).map((u) => `「${u.text}」`);
          const fixGuide = deletable.length
            ? `。以下文字在 Figma 真值里找不到任何近似项，属于臆造区块，请直接删除整个区块：${deletable.join('、')}`
            : '';
          
          // 🛡️ L4 / P0-6（2026-09-07）：标题级核心文案篡改必 BLOCK，不受「≤2 处」阈值豁免。
          // 先判标题级（t- 前缀 Figma TEXT 节点）篡改 → BLOCK；否则沿用 09-04 阈值策略。
          const titleSeverity = resolveTextTruthSeverity(unknownTexts, options.figmaNodeData);
          const TEXT_TRUTH_BLOCK_THRESHOLD = 2;
          const severity =
            titleSeverity === 'BLOCK' || unknownTexts.length > TEXT_TRUTH_BLOCK_THRESHOLD
              ? 'BLOCK'
              : 'WARN';
          const thresholdNote =
            titleSeverity === 'BLOCK'
              ? '（标题级核心文案被篡改，必 BLOCK——不受 ≤2 处阈值豁免）'
              : severity === 'WARN'
                ? `（≤${TEXT_TRUTH_BLOCK_THRESHOLD} 处降级为 WARN，允许少量 OCR 误读通过）`
                : `（>${TEXT_TRUTH_BLOCK_THRESHOLD} 处升级为 BLOCK，防止大量臆造）`;
          
          issues.push({
            id: 'TEXT-TRUTH',
            severity,
            file: '(产物文字 vs Figma 真值)',
            message: `检测到 ${unknownTexts.length} 处不在 Figma 设计真值里的文字（vision OCR 误读/臆造）${thresholdNote}：${samples}${unknownTexts.length > 8 ? ' 等' : ''}。请按上述「→ 应为」映射逐处替换为 Figma TEXT 节点的 characters 真值（原样照抄，含换行时保留换行或按原排版分两行渲染）${fixGuide}`,
            hint: {
              suggestion:
                '按报错里的「→ 应为」映射，用 Figma characters 真值原样替换错误文字；无映射项的臆造区块直接删除',
              replacements: unknownTexts
                .slice(0, 8)
                .filter((u) => u.suggest)
                .map((u) => ({ from: u.text, to: esc(u.suggest) })),
            },
          });
        }
      } catch (err) {
        issues.push({
          id: 'TEXT-TRUTH-ERROR',
          severity: 'WARN',
          file: '(text-truth-guard)',
          message: `文字真值检测器执行异常（非阻断）：${err?.message || String(err)}`,
        });
      }
    }

    // ========== 🛡️ THEME-COLOR: 样式主题变量化门禁（两者通用，2026-09-04）==========
    // 事故 mc-max-1788485095835-e1432017：81 处 #hex 抄写槽位色值 + 子组件局部
    // @colorTextBase:#333 覆盖 → 切主题/调颜色变量零生效。检测确定性高（只查样式
    // 文本与主题槽值集合比对），槽位色抄写/预设名本地重声明 BLOCK，设计专色 WARN。
    {
      try {
        const themeColorIssues = detectThemeColorViolations(files);
        issues.push(...themeColorIssues);
      } catch (err) {
        // 检测器异常不阻断（fail-open）：避免检测 bug 误杀全部生成
        issues.push({
          id: 'THEME-COLOR-ERROR',
          severity: 'WARN',
          file: '(theme-color-guard)',
          message: `样式主题变量化检测器执行异常（非阻断）：${err?.message || String(err)}`,
        });
      }
    }

    // ========== 🛡️ SEMANTIC-BINDING: 语义元素错绑校验（两者通用，2026-09-07）==========
    // 事故 mc-max-1788306653919-a57e4409（设备监测）：竖排 tab 的"监控"项右上角角标
    // `3/3740`，竖排 tabs 整列丢失后 LLM 把这个角标数据错误绑定到隧道大卡的 progress
    // 字段（ViewSwitch.vue:40: `progress: '3/3740'`）→ 角标数据出现在进度条位置。
    // 检测确定性高（只查明确的角标模式 + 明确的语义字段），fail-closed BLOCK。
    {
      try {
        // 🛡️ 修复（2026-09-08 实测 mc-max-1788832532312）：原写法 { logger } 引用了本作用域
        // 不存在的标识符 → ReferenceError → 每次被下方 catch 成 WARN fail-open 跳过，
        // 语义错绑检测自上线以来从未真正执行过。detectSemanticBindingErrors 内部对 logger
        // 已做 ?. 保护（semantic-binding-guard.js:101），传空对象即安全。
        const semanticIssues = detectSemanticBindingErrors(files, {});
        if (semanticIssues.length > 0) {
          const details = semanticIssues
            .map((i) => `${i.file}${i.line ? `:${i.line}` : ''} - ${i.message}`)
            .join('；');
          issues.push({
            id: 'SEMANTIC-BINDING',
            severity: 'BLOCK',
            file: '(semantic-binding-guard)',
            message: `语义元素错绑：${details}。角标/徽标数据（如"3/3740"）应出现在角标位置，不得绑定到进度/比例字段`,
            hint: {
              suggestion:
                '检查角标数据的来源和用途，将其绑定到正确的角标/徽标字段（如 badge/count），而非 progress/percent 等进度字段',
            },
          });
        }
      } catch (err) {
        // 检测器异常不阻断（fail-open）：避免检测 bug 误杀全部生成
        issues.push({
          id: 'SEMANTIC-BINDING-ERROR',
          severity: 'WARN',
          file: '(semantic-binding-guard)',
          message: `语义元素错绑检测器执行异常（非阻断）：${err?.message || String(err)}`,
        });
      }
    }

    return {
      pass: !issues.some((i) => i.severity === 'BLOCK'),
      blockCount: issues.filter((i) => i.severity === 'BLOCK').length,
      issues,
    };
  }

  /**
   * 提取根容器 class（供 CODE-016 判定「背景是否挂在根容器上」）。
   *
   * 取 index.vue `<template>` 的第一个带 class 的标签；兼容 `<base-panel>` 包裹
   * （宿主外壳不算根容器，跳过它取其后第一个 class）。取不到返回 ''。
   *
   * @param {Array<{path:string, content:string}>} generatedFiles
   * @returns {string}
   */
  static _extractRootContainerClass(generatedFiles) {
    const vue = (generatedFiles || []).find(
      (f) => f && /package\/index\.vue$/.test(f.path || '') && f.content,
    );
    if (!vue) return '';
    const tpl = String(vue.content).match(/<template>([\s\S]*?)<\/template>/i);
    const body = tpl ? tpl[1] : String(vue.content);
    const withPanel = body.match(
      /<base-panel[^>]*>[\s\S]*?<[a-zA-Z][^>]*\bclass="([\w-]+)"/,
    );
    if (withPanel) return withPanel[1];
    const plain = body.match(/<[a-zA-Z][^>]*\bclass="([\w-]+)"/);
    return plain ? plain[1] : '';
  }

  /**
   * 扫描样式内容里的资源 url()，并带上「所属选择器」与「形态」信息。
   *
   * 为什么要带选择器：同样一句 `background-image: url(../images/bg.png)`，
   * 写在根容器上是合法的整块背景兜底，写在 .chart-section 上就是「背景挂错容器」。
   * 不带选择器只能一刀切，必然在某一侧误判（R4）。
   *
   * @param {string} styleContent
   * @returns {Array<{url:string, selector:string|null, kind:'rule'|'less-var-decl'}>}
   */
  static _scanStyleResourceUrls(styleContent) {
    const out = [];
    if (!styleContent || typeof styleContent !== 'string') return out;
    const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;

    // ① LESS/CSS 变量定义行：@bg-image-7890: url(...); / --bg: url(...);
    //    只是定义、不渲染成背景，归属由使用处决定 → 单独标记
    for (const line of styleContent.split(/\r?\n/)) {
      const decl = line.match(/^\s*(?:@|--)[A-Za-z_][\w-]*\s*:\s*url\(/i);
      if (!decl) continue;
      let m;
      urlRe.lastIndex = 0;
      while ((m = urlRe.exec(line)) !== null) {
        out.push({ url: m[1], selector: null, kind: 'less-var-decl' });
      }
    }

    // ② 规则体内的 url()：回溯到该行的所属选择器（简单向上查找最近的选择器行，够用且确定）
    const lines = styleContent.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(?:@|--)[A-Za-z_][\w-]*\s*:\s*url\(/i.test(line)) continue; // 已按变量定义计过
      urlRe.lastIndex = 0;
      let m;
      while ((m = urlRe.exec(line)) !== null) {
        out.push({
          url: m[1],
          selector: this._findEnclosingSelector(lines, i),
          kind: 'rule',
        });
      }
    }
    return out;
  }

  /**
   * 从第 i 行向上回溯最近的 CSS/LESS 选择器（匹配花括号深度）。
   * 找不到（如在 mixin 调用或根层）返回 null。
   */
  static _findEnclosingSelector(lines, i) {
    let depth = 0;
    for (let j = i; j >= 0; j--) {
      const seg = lines[j] || '';
      for (let k = seg.length - 1; k >= 0; k--) {
        const ch = seg[k];
        if (ch === '}') depth++;
        else if (ch === '{') {
          if (depth === 0) {
            const head = seg.slice(0, k).trim();
            const mm = head.match(/([.&#]?[\w-]+(?:\s*[.>][\w-]+)*)\s*$/);
            return mm ? mm[1] : head || null;
          }
          depth--;
        }
      }
    }
    return null;
  }

  /**
   * 判断样式选择器是否是 mountTarget 指定的挂载容器（供 CODE-016 豁免判定）。
   *
   * mountTarget 由 figma-connector 从 figmaPath 倒数第二段推导（如 cp-x/tabs-list/bg → 'tabs-list'），
   * 产物里的 class 则带组件前缀（如 .c-mc-max-xxx-c-env-monitor-tabs-list），无法直接字符串相等比较，
   * 故按「实词命中」匹配，分两级：
   *
   *   ① 严格级（首选）：mountTarget 的每个实词都出现在选择器里。
   *      mountTarget='tabs-list' → 命中 .c-xxx-tabs-list。
   *   ② 退化级（🛡️ R6，2026-08-31，mc-max-1788165979299-01f105b7 实锤 3 轮重试耗尽）：
   *      只要求 mountTarget 的**最长实词**出现在选择器里。
   *
   * 为什么必须加退化级：mountTarget 是 **Figma 图层名**（'tabs-list'），
   * 而产物 class 是 **LLM 自己起的名**（'c-env-monitor-tabs-container'）——两个命名体系天然对不上。
   * 严格级要求 'tabs' 与 'list' 同时出现，等于要求 LLM 猜中 Figma 图层的每一个词；
   * LLM 就算把背景正确挂到 tabs 容器上，只要类名里没有 'list' 就必然 BLOCK，
   * 且报错文案从未输出过 'tabs-list' ⇒ 重试永远修不好。这不是模型能力问题，是规则要求了不可达成的条件。
   *
   * 退化级为何仍保拦截力：只认**最长**那一个实词，不是任意实词（some）。
   *   mountTarget='tabs-list' → 最长实词 'tabs'
   *     ✅ .c-env-monitor-tabs-container / .c-env-monitor-header-tabs（正确挂载）
   *     ❌ .c-env-monitor-chart-wrapper / .c-env-monitor-chart-area（真实误挂，仍 BLOCK）
   * 即：放宽的只是「命名差异」，不是「挂载位置错误」。
   *
   * @param {string} selector - 样式选择器，如 '.c-xxx-tabs-container'
   * @param {string} mountTarget - Figma 侧挂载目标容器名，如 'tabs-list'
   * @returns {boolean}
   */
  static _selectorMatchesMountTarget(selector, mountTarget) {
    if (!selector || !mountTarget) return false;
    const targetWords = meaningfulWordsOf(mountTarget);
    if (targetWords.length === 0) return false;
    const selWords = new Set(meaningfulWordsOf(selector));
    // ① 严格级：全词命中
    if (targetWords.every((w) => selWords.has(w))) return true;
    // ② 退化级：最长实词命中（等长时取出现序第一个，保证结果确定）
    const longest = targetWords.reduce((a, b) => (b.length > a.length ? b : a));
    return selWords.has(longest);
  }

  /**
   * 收集产物中「与某 mountTarget 语义匹配」的容器选择器候选（供 CODE-016 报错文案给指引）。
   *
   * 只报错不给目标 = 让 LLM 盲改（mc-max-1788165979299-01f105b7 连试 3 轮全败的直接原因）。
   * 这里从全部产物里扫出 class 名（模板 class="" + 样式选择器 .xxx），
   * 用与判定同一个匹配器筛一遍，保证「指引里给的容器」一定是「能过校验的容器」。
   *
   * @param {Array<{path:string, content:string}>} generatedFiles
   * @param {string} mountTarget - Figma 侧挂载目标容器名，如 'tabs-list'
   * @param {number} [limit=4]
   * @returns {string[]} 形如 ['.c-env-monitor-tabs-container', ...]
   */
  static _collectMountCandidates(generatedFiles, mountTarget, limit = 4) {
    if (!mountTarget) return [];
    const seen = new Set();
    for (const file of generatedFiles || []) {
      const content = String(file?.content || '');
      if (!content) continue;
      // 模板里的 class="a b c"（含 :class 的字符串字面量）
      const classAttrs = content.matchAll(/class="([^"{}]+)"/g);
      for (const m of classAttrs) {
        for (const cls of String(m[1]).split(/\s+/)) {
          const c = cls.trim();
          if (c) seen.add(c);
        }
      }
      // 样式里的 .selector
      for (const m of content.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
        seen.add(m[1]);
      }
    }
    const out = [];
    for (const cls of seen) {
      if (out.length >= limit) break;
      if (this._selectorMatchesMountTarget(cls, mountTarget)) out.push(`.${cls}`);
    }
    return out;
  }

  /**
   * 生成修订指导
   */
  static generateFixGuidance(issues) {
    const blocks = issues.filter((i) => i.severity === 'BLOCK');
    const warns = issues.filter((i) => i.severity === 'WARN');

    let g = '# ⚠️ 代码结构校验未通过\n\n';
    if (blocks.length)
      g +=
        '## 🔴 必须修复\n' +
        blocks.map((i) => `- [${i.id}] ${i.file}: ${i.message}`).join('\n') +
        '\n\n';
    if (warns.length)
      g +=
        '## 🟡 建议修复\n' +
        warns.map((i) => `- [${i.id}] ${i.file}: ${i.message}`).join('\n') +
        '\n\n';

    return g;
  }

  /**
   * R1' 组件树骨架提取（2026-09-01，重试轮结构锚定）
   *
   * 从上一轮产物中提取组件树骨架（插槽分配 + 子组件清单），注入到重试指导中，
   * 约束 LLM 只重生成失败分块、不得重排结构。
   *
   * @param {Array} files - [{ path, content }] 文件数组
   * @returns {string} 骨架文本（适合注入 prompt）
   */
  static extractComponentSkeleton(files) {
    if (!Array.isArray(files) || files.length === 0) return '';

    const indexVue = files.find(
      (f) => f && (f.path || '').endsWith('package/index.vue'),
    );
    if (!indexVue || !indexVue.content) return '';

    const lines = [];
    lines.push('## 主组件结构（上一轮产物，不得重排）');

    // 提取 <template> 内容
    const tplStartMatch = indexVue.content.match(/<template[\s>]/i);
    let templateContent = '';
    if (tplStartMatch) {
      const startIdx = tplStartMatch.index;
      const openTagEnd = indexVue.content.indexOf('>', startIdx);
      if (openTagEnd >= 0) {
        const lastCloseIdx = indexVue.content.lastIndexOf('</template>');
        if (lastCloseIdx > openTagEnd) {
          templateContent = indexVue.content.slice(openTagEnd + 1, lastCloseIdx);
        }
      }
    }

    // 提取根元素内部内容
    let rootInnerContent = templateContent;
    const rootOpenMatch = templateContent.match(/^\s*<([\w-]+)/);
    if (rootOpenMatch) {
      const rootOpenEnd = templateContent.indexOf('>', rootOpenMatch.index);
      const rootCloseIdx = templateContent.lastIndexOf(`</${rootOpenMatch[1]}>`);
      if (rootOpenEnd >= 0 && rootCloseIdx > rootOpenEnd) {
        rootInnerContent = templateContent.slice(rootOpenEnd + 1, rootCloseIdx);
      }
    }

    // 提取命名插槽
    const namedSlotRegex =
      /<template\s+(?:#|v-slot:)([\w-]+)[^>]*>([\s\S]*?)<\/template>/gi;
    const namedSlots = [];
    let slotMatch;
    while ((slotMatch = namedSlotRegex.exec(rootInnerContent)) !== null) {
      namedSlots.push({ name: slotMatch[1], content: slotMatch[2] });
    }

    // 提取默认插槽内容
    namedSlotRegex.lastIndex = 0;
    const contentWithoutNamedSlots = rootInnerContent
      .replace(namedSlotRegex, '')
      .trim();
    const defaultSlotContent = contentWithoutNamedSlots
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();

    // 输出默认插槽
    if (defaultSlotContent) {
      lines.push('\n### 默认插槽（主体内容区）');
      // 提取组件标签（简化版，只提取顶层组件）
      const componentTags = [];
      const tagRegex = /<([A-Z][\w-]*)/g;
      let tagMatch;
      while ((tagMatch = tagRegex.exec(defaultSlotContent)) !== null) {
        if (!componentTags.includes(tagMatch[1])) {
          componentTags.push(tagMatch[1]);
        }
      }
      if (componentTags.length > 0) {
        lines.push(`包含组件: ${componentTags.join(', ')}`);
      } else {
        lines.push(`内容: ${defaultSlotContent.slice(0, 100)}...`);
      }
    } else {
      lines.push('\n### 默认插槽（主体内容区）');
      lines.push('⚠️ 当前为空（必须填充主体内容）');
    }

    // 输出命名插槽
    if (namedSlots.length > 0) {
      lines.push('\n### 命名插槽（仅放 header 区控件）');
      for (const slot of namedSlots) {
        const cleaned = slot.content
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        const componentTags = [];
        const tagRegex = /<([A-Z][\w-]*)/g;
        let tagMatch;
        while ((tagMatch = tagRegex.exec(cleaned)) !== null) {
          if (!componentTags.includes(tagMatch[1])) {
            componentTags.push(tagMatch[1]);
          }
        }
        const desc =
          componentTags.length > 0
            ? componentTags.join(', ')
            : cleaned.slice(0, 50);
        lines.push(`- #${slot.name}: ${desc}`);
      }
    }

    // 提取子组件清单
    const subComponents = files.filter(
      (f) =>
        f &&
        (f.path || '').includes('package/components/') &&
        (f.path || '').endsWith('.vue'),
    );

    if (subComponents.length > 0) {
      lines.push('\n## 子组件清单（不得缩减）');
      for (const sub of subComponents) {
        const fileName = (sub.path || '').split('/').pop();
        // 提取子组件的注释或第一个有意义的标签作为职责描述
        const commentMatch = sub.content.match(/<!--\s*([\s\S]*?)\s*-->/);
        const desc = commentMatch
          ? commentMatch[1].trim().slice(0, 80)
          : '(无描述)';
        lines.push(`- ${fileName}: ${desc}`);
      }
    }

    lines.push('\n⚠️ 重试时请保持上述结构不变，只修复指定的问题分块。');

    return lines.join('\n');
  }
}

/**
 * 🛡️ flex 系列共享实现已迁至 utils/flex-sibling-guard.js（单一事实源，2026-09-01 FLEX-005）。
 *
 * FLEX_GROW_SCALES / extractStyleBlocks / collectStyleSources / buildFlexIndex
 * 由 checkFlexUsage / checkFlexSourceConflicts / detectFlexSiblingIssues（FLEX-005 兄弟组
 * 量纲混用 BLOCK）共用，杜绝「修复器一套判据、校验器一套判据」的口径漂移。
 *
 * 兼容再导出：roles/microcode/resource-mounter.js 等既有消费方仍从本文件导入
 * FLEX_GROW_SCALES（import 路径不变，零破坏）。
 */
import {
  FLEX_GROW_SCALES,
  extractStyleBlocks,
  collectStyleSources,
  buildFlexIndex,
  detectFlexSiblingIssues,
} from '../utils/flex-sibling-guard.js';

export { FLEX_GROW_SCALES };

/**
 * 🛡️ 缺口③（2026-09-01）：跨样式源 flex 冲突检测（零 LLM、确定性、幂等）。
 *
 * 事故实证（三个 Figma 测试组件终验 #471）：
 *   - mc-max-1788186816669-8f7b5097：子组件 SFC `TunnelHourly.vue:276 flex: 131 1 0`
 *     与 `common.less:456 flex: 17 1 0` 同一 class 两套值；`VehicleDistribution.vue:195
 *     flex: 142 1 0` 与 `common.less:457 flex: 12 1 0` 同理。
 *   - `<style scoped>` 编译后选择器带属性选择器（0,2,0），**恒胜** common.less（0,1,0），
 *     故 common.less 那套永远是死样式；而生效的像素量级值又与其余兄弟的比例量级值混排，
 *     最终区块高度比例失真（tunnel+vehicle 占 85%，Figma 真值各约 17~18%）。
 *
 * 两类检查：
 *   FLEX-003 [BLOCK] 同一 class 在**不同文件**的样式源中 flex 值不同
 *            → 其中一套必为死样式，且区块比例按错误值计算。
 *            （同文件内多值视为层叠/响应式，不判冲突，避免误伤。）
 *   FLEX-004 [WARN]  产物整体 grow 值跨量纲混用（像素量级与比例量级并存）
 *            → 比例失真信号。若这些值分属互不相干的嵌套容器则属正常，故只 WARN。
 *
 * @param {Array<{path:string, content:string}>} files 全量产物文件（内存态，不读磁盘）
 * @returns {Array<{id:string, severity:string, file:string, message:string, hint?:object}>}
 */
export function checkFlexSourceConflicts(files = []) {
  const issues = [];
  if (!Array.isArray(files) || files.length === 0) return issues;

  // 1. 收集全部样式源 + 2. 建索引：共享实现（utils/flex-sibling-guard.js，单一事实源）。
  //    R1 同源原则：一律取内存 files，不读磁盘；同名 .less 的 .css 编译产物排除，
  //    详见 flex-sibling-guard.js:collectStyleSources docblock（Task3 假冲突实锤）。
  const sources = collectStyleSources(files);
  if (sources.length < 2) return issues;

  const { byClass, allGrows } = buildFlexIndex(sources);

  // 3. FLEX-003：同一 class 跨文件 flex **grow 值**冲突。
  //    归一化（后者覆盖前者）：同一 selector block 内多值（如 flex: 1 1 0 后又 flex: 1）
  //    属 CSS 层叠/自覆盖冗余，只取最后一个生效值，避免把「文件内冗余」误判成「跨文件冲突」。
  //    按 grow 值比对（而非字符串）：`flex: 1 1 0` 与 `flex: 1` 的 grow 都是 1、语义等价
  //    （等比例分配），不判冲突；只有 grow 语义不同（如 180 1 0 vs 1，像素高度 vs 等比例）
  //    才是真冲突 BLOCK（Task3 形态 mc-max-1788186816669）。
  for (const [cls, entries] of byClass) {
    const fileVals = new Map(); // file -> Set<完整 flex 值>（归一化后的最后生效值，供 message）
    const fileGrows = new Map(); // file -> Set<grow 值>（归一化后的最后生效值，供判定）
    for (const e of entries) {
      const vals = Array.isArray(e.values) ? e.values : [];
      const grows = Array.isArray(e.grows) ? e.grows : [];
      const lastVal = vals.length > 0 ? vals[vals.length - 1] : null;
      const lastGrow = grows.length > 0 ? grows[grows.length - 1] : null;
      if (lastVal === null || lastGrow === null || !Number.isFinite(lastGrow)) continue;
      if (!fileVals.has(e.file)) fileVals.set(e.file, new Set());
      fileVals.get(e.file).add(lastVal);
      if (!fileGrows.has(e.file)) fileGrows.set(e.file, new Set());
      fileGrows.get(e.file).add(lastGrow);
    }
    if (fileGrows.size < 2) continue;
    const allGrows = new Set();
    for (const gs of fileGrows.values()) for (const g of gs) allGrows.add(g);
    if (allGrows.size < 2) continue; // 各文件 grow 语义一致：冗余声明但无害，不报

    const detail = [...fileVals.entries()]
      .map(([fp, vs]) => `${fp} → ${[...vs].join(' / ')}`)
      .join('；');
    const scopedCount = entries.filter((e) => e.scoped).length;
    const scopedNote =
      scopedCount > 0
        ? '。其中 <style scoped> 编译后带属性选择器（0,2,0）优先级恒高于 common.less（0,1,0），common.less 里的那套将成为永不生效的死样式'
        : '';
    issues.push({
      id: 'FLEX-003',
      severity: 'BLOCK',
      file: [...fileGrows.keys()].join(' ↔ '),
      message: `同一 class .${cls} 在不同样式源中声明了不同的 flex 值（${detail}）${scopedNote}。区块高度比例将按其中一套错误值计算，导致各模块高度比例与 Figma 设计稿不符`,
      hint: {
        suggestion: `为 .${cls} 只保留一份 flex 声明（删掉另一份），并统一为 Figma 像素高度写法 \`flex: <Figma高度px> 1 0\``,
      },
    });
  }

  // 4. FLEX-004：产物整体 grow 值跨量纲混用（像素量级 + 比例量级并存）
  const grows = allGrows.map((g) => g.grow).filter((g) => g > 0);
  if (grows.length >= 2) {
    const pixelScale = grows.filter((g) => g >= FLEX_GROW_SCALES.PIXEL_MIN);
    const ratioScale = grows.filter((g) => g <= FLEX_GROW_SCALES.RATIO_MAX);
    if (pixelScale.length > 0 && ratioScale.length > 0) {
      issues.push({
        id: 'FLEX-004',
        severity: 'WARN',
        file: '(跨文件)',
        message: `flex-grow 量纲混用：产物中同时存在像素量级（${[...new Set(pixelScale)].sort((a, b) => a - b).join('/')}，即「Figma 高度」写法）与比例量级（${[...new Set(ratioScale)].sort((a, b) => a - b).join('/')}）的 grow 值。若它们属于同一组兄弟区块，高度比例会严重失真（例：131 与 17 同组 → 前者独占 88% 空间）`,
        hint: {
          // 🛡️ 修复（2026-09-08）：原文案「统一写成 `flex: <Figma高度px> 1 0`」在**教错误写法**
          // （像素写进 grow 正是本规则要拦的问题），与 root-container.md / ai-generation-
          // constraints.md 的「归一化 flexGrow 系数」口径相反——同一语义两处事实源打架，
          // LLM 照抄 hint 会稳定复现 FLEX-004。现统一为系数口径。
          suggestion: `统一量纲：同一组兄弟区块的 grow 统一使用管线下发的 flexGrow 系数（\`flex: <flexGrow系数> 1 0\`，各区块系数平均值为 1），禁止把 Figma 像素高度直接写进 grow。若这些值分属互不相干的嵌套容器，可忽略本提示`,
        },
      });
    }
  }

  return issues;
}

/**
 * 🛡️ P0-4: flex 静态检查（零 LLM）
 *
 * 检查生成代码中的 flex 使用是否合理：
 * 1. [BLOCK 级] column-flex 容器内有 flex:1 子元素，但容器/子元素缺 min-height:0
 *    → 高度坍塌/撑破父级风险（echarts/表格容器致命），自动补 min-height:0
 * 2. [WARN 级] column-flex 容器无任何 flex 子属性（无 flex:1 / align / justify / gap）
 *    → 与块布局等价，纯冗余
 *
 * @param {string} styleContent - <style> 块内容（可含嵌套 less）
 * @returns {Array<{ id: string, severity: string, message: string, suggestion?: string, autoFix?: boolean }>}
 */
export function checkFlexUsage(styleContent) {
  const issues = [];
  const blocks = extractStyleBlocks(styleContent);

  for (const b of blocks) {
    const isFlexColumn =
      /display\s*:\s*flex/i.test(b.body) &&
      /flex-direction\s*:\s*column/i.test(b.body);
    if (!isFlexColumn) continue;

    const hasFlexChild = /\bflex\s*:\s*1\b|\bflex-grow\s*:\s*1\b/.test(b.body);
    const hasMinHeight0 = /min-height\s*:\s*0\b/.test(b.body);
    const hasFlexProps =
      hasFlexChild ||
      /align-items|justify-content|\bgap\s*:|align-self|flex-shrink|margin-top\s*:\s*auto|margin-bottom\s*:\s*auto/.test(
        b.body,
      );

    // 1. flex:1 子项 + 缺 min-height:0 → BLOCK，自动补
    if (hasFlexChild && !hasMinHeight0) {
      issues.push({
        id: 'FLEX-001',
        severity: 'BLOCK',
        message: `column-flex 容器 ${b.selector} 内含 flex:1 子元素但缺少 min-height:0，高度会被内容撑破（echarts/表格类容器必现）`,
        suggestion: `在 ${b.selector} 中补 \`min-height: 0;\`，且所有 flex:1 子元素同样需要 min-height:0`,
        autoFix: true,
        selector: b.selector,
        body: b.body,
      });
    }
    // 2. 无任何 flex 子属性 → WARN，纯冗余
    else if (!hasFlexProps) {
      issues.push({
        id: 'FLEX-002',
        severity: 'WARN',
        message: `column-flex 容器 ${b.selector} 无任何 flex 子属性（flex:1/align/justify/gap），与块级布局等价，属冗余 flex`,
        suggestion: `移除 \`display:flex; flex-direction:column\` 改用默认块级流，或补充实际需要的 flex 子属性`,
        autoFix: false,
        selector: b.selector,
        body: b.body,
      });
    }
  }

  return issues;
}

/**
 * 🛡️ P0-4: 对样式内容执行 flex 自动修复（补 min-height:0），返回修复后的内容
 * @param {string} styleContent - 原始 <style> 内容
 * @returns {{ content: string, fixed: number }}
 */
export function autoFixFlexIssues(styleContent) {
  if (!styleContent) return { content: styleContent || '', fixed: 0 };
  const issues = checkFlexUsage(styleContent);
  const fixable = issues.filter((i) => i.autoFix && i.selector && i.body);
  if (fixable.length === 0) return { content: styleContent, fixed: 0 };

  let content = styleContent;
  let fixed = 0;
  for (const issue of fixable) {
    // 在规则 body 末尾（最后一个 } 前）插入 min-height: 0;
    const selectorEsc = issue.selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fullRule = new RegExp(
      `(${selectorEsc}\\s*\\{)([\\s\\S]*?)(\\})`,
      'i',
    );
    const before = content;
    content = content.replace(fullRule, (whole, open, body, close) => {
      if (/min-height\s*:\s*0/.test(body)) return whole;
      // 只在规则末尾插入；若 body 以 ; 结尾避免双分号
      const trimmed = body.replace(/\s+$/, '');
      const suffix = /;\s*$/.test(trimmed) ? '' : ';';
      fixed++;
      return `${open}${trimmed}${suffix}\n  min-height: 0;${close}`;
    });
    if (content === before) {
      // 正则没匹配上（嵌套复杂），跳过
      continue;
    }
  }
  return { content, fixed };
}

/**
 * 🛡️ L0-B 自动修复: 修复 .vue 文件的 CODE-001（style 标签属性缺失）
 * 将 <style> / <style scoped> / <style lang="less"> 统一修复为 <style lang="less" scoped>
 * 同时修复 CODE-002（缺少 @import index.less）
 *
 * @param {string} content - .vue 文件完整内容
 * @param {string} filePath - 文件路径（用于判断主/子组件确定 import 层级）
 * @returns {{ content: string, fixes: string[] }}
 */
export function autoFixStyleTag(content, filePath) {
  if (!content || typeof content !== 'string') return { content, fixes: [] };
  const fixes = [];

  // 1. 修复 style 标签属性：统一为 <style lang="less" scoped>
  content = content.replace(/<style([^>]*)>/gi, (match, attrs) => {
    const hasLang = /lang\s*=\s*["']less["']/i.test(attrs);
    const hasScoped = /\bscoped\b/i.test(attrs);

    if (hasLang && hasScoped) return match; // 已合规

    let newAttrs = attrs;
    if (!hasLang) {
      // 补齐 lang="less"
      newAttrs = ` lang="less"${newAttrs}`;
    }
    if (!hasScoped) {
      // 补齐 scoped
      newAttrs = `${newAttrs} scoped`;
    }
    fixes.push(`CODE-001: 修复 style 标签属性 → <style${newAttrs.trim()}>`);
    return `<style${newAttrs}>`;
  });

  // 2. 修复 CODE-002：缺少 @import index.less
  const isSubComponent =
    filePath.includes('/components/') || filePath.startsWith('components/');
  const importPath = isSubComponent
    ? '../../resources/styles/index.less'
    : '../resources/styles/index.less';
  const importStatement = `@import '${importPath}';`;

  const hasStyleBlock = /<style[^>]*>/.test(content);
  if (
    hasStyleBlock &&
    (!content.includes('@import') || !content.includes('index.less'))
  ) {
    // 在 <style> 标签开始后插入 @import
    content = content.replace(/(<style[^>]*>)/i, (match) => {
      fixes.push(`CODE-002: 注入 @import '${importPath}'`);
      return `${match}\n${importStatement}`;
    });
  }

  return { content, fixes };
}

/**
 * 🛡️ L0-B 自动修复: 修复 common.less 的 CODE-003（class 缺少组件前缀）
 * 将无前缀的 class 选择器加上 .c-{componentId}- 前缀，
 * 同时修复引用这些 class 的 .vue 文件中的 class 属性值。
 *
 * @param {string} commonLessContent - common.less 文件内容
 * @param {string} componentId - 组件 ID（如 c-env-monitor）
 * @param {string[]} vueFiles - 需要联动修复的 .vue 文件内容数组 [{ path, content }]
 * @returns {{ commonLess: string, vueFiles: Array<{path, content}>, fixedClasses: string[] }}
 */
export function autoFixPrefixViolations(
  commonLessContent,
  componentId,
  vueFiles = [],
) {
  if (!commonLessContent || typeof commonLessContent !== 'string') {
    return { commonLess: commonLessContent, vueFiles, fixedClasses: [] };
  }

  const violations = findPrefixViolations(commonLessContent, componentId);
  if (violations.length === 0) {
    return { commonLess: commonLessContent, vueFiles, fixedClasses: [] };
  }

  // 归一化 componentId 为标准前缀（剥离尾 8 hex，防止 c-device-monitor-4luni2f5 作为 class 前缀）
  const barePrefix = classPrefixOf(componentId) || componentId.replace(/^c-/, '') || 'component';
  const fixedClasses = [];
  let fixedContent = commonLessContent;

  // 逐个修复违规 class
  for (const cls of violations) {
    // cls 形如 ".wrapper" ".item"（已含 . 前缀）
    const className = cls.startsWith('.') ? cls.slice(1) : cls;
    const prefixedName = `${barePrefix}-${className}`;

    // 替换 class 选择器声明（.wrapper { → .c-xxx-wrapper {）
    // 只替换声明位置（.{className} 后跟 { 或 : 或 ,），不替换内部引用
    const declRegex = new RegExp(
      `(\\s|^)\\.${escapeRegExp(className)}(\\s*[{:,])`,
      'g',
    );
    const before = fixedContent;
    fixedContent = fixedContent.replace(declRegex, `$1.${prefixedName}$2`);
    if (fixedContent !== before) {
      fixedClasses.push(className);
    }

    // 联动修复 .vue 文件中的 class="wrapper" → class="c-xxx-wrapper"
    for (const vueFile of vueFiles) {
      if (!vueFile.content) continue;
      // 匹配 class="...wrapper..." 或 :class="'wrapper'"（要求 className 前不是字母/数字/短横，
      // 避免在已带前缀类如 c-monitor-root 中二次匹配到裸名 'root' 造成双重前缀）
      const classAttrRegex = new RegExp(
        `((?:class|:class)\\s*=\\s*["'][^"']*)(?<![a-z0-9-])\\b${escapeRegExp(className)}\\b([^"']*["'])`,
        'g',
      );
      const beforeVue = vueFile.content;
      vueFile.content = vueFile.content.replace(
        classAttrRegex,
        `$1${prefixedName}$2`,
      );

      // 也修复模板中 :class 绑定对象字面量 { wrapper: true }
      // 🛡️ 修复（2026-08-28 mc-1787904543641-38cfa308 实锤 P0）：
      //   这里把「裸 key」改写成带前缀的 class（active → c-monitor-active）。改写后的 key 含连字符，
      //   若不加引号就是非法 JS 表达式，compiler-sfc 直接报
      //   "Error parsing JavaScript expression: Unexpected token, expected ',' (1:27)"
      //   → Vite 对 index.vue 返回 500 → 前端 fetch 失败，表现为「组件资源加载失败（网络错误 / 404）」。
      //   此处就地补引号：标识符 key 保持裸写，非标识符 key 包单引号。
      //   已带引号的 key（{ 'active': x }）因前置引号挡住字面量匹配，不会被二次改写。
      const classBindRegex = new RegExp(
        `([\\[{,]\\s*)(?<![a-z0-9-])${escapeRegExp(className)}(\\s*[:}\\]])`,
        'g',
      );
      vueFile.content = vueFile.content.replace(
        classBindRegex,
        (_m, pre, post) =>
          `${pre}${quoteObjectKeyIfNeeded(prefixedName)}${post}`,
      );

      // 🛡️ P2（2026-09-08）：同时修复 <style scoped> 块内无前缀的 CSS 选择器。
      // 子组件的 <style scoped> 也可能引用裸 class 名（.wrapper），需要加前缀。
      // 只处理 <style scoped> 块（不处理 <style> 全局块，因为全局块走 common.less 路径）。
      const styleScopedRegex = /<style\s+scoped[^>]*>([\s\S]*?)<\/style>/gi;
      const styleMatch = styleScopedRegex.exec(vueFile.content);
      if (styleMatch) {
        const styleBody = styleMatch[1];
        const scopedSelectorRegex = new RegExp(
          `\\.${escapeRegExp(className)}(\\s*[{:,>~+\\s])`,
          'g',
        );
        const fixedStyleBody = styleBody.replace(
          scopedSelectorRegex,
          `.${prefixedName}$1`,
        );
        if (fixedStyleBody !== styleBody) {
          vueFile.content = vueFile.content.replace(styleBody, fixedStyleBody);
        }
      }
    }
  }

  return { commonLess: fixedContent, vueFiles, fixedClasses };
}

/** JS 标识符（对象字面量可裸写的 key） */
const JS_IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;

/**
 * 对象字面量 key 按需加引号。
 * 含 - / . / : 等非标识符字符的 key 裸写会导致 compiler-sfc 解析失败，必须加引号。
 * @param {string} key
 * @returns {string} 原样返回或单引号包裹
 */
function quoteObjectKeyIfNeeded(key) {
  const k = String(key ?? '');
  if (!k) return k;
  return JS_IDENTIFIER_RE.test(k) ? k : `'${k.replace(/'/g, "\\'")}'`;
}

/**
 * 🛡️ L0-B 自动修复: 移除冗余的 column-flex（FLEX-002）
 * 当 flex column 容器无任何 flex 子属性时，移除 display:flex + flex-direction:column
 *
 * @param {string} styleContent - <style> 块内容
 * @returns {{ content: string, fixed: number }}
 */
export function autoFixRedundantFlex(styleContent) {
  if (!styleContent || typeof styleContent !== 'string')
    return { content: styleContent || '', fixed: 0 };
  const issues = checkFlexUsage(styleContent);
  const redundant = issues.filter(
    (i) => i.id === 'FLEX-002' && !i.autoFix && i.selector && i.body,
  );
  if (redundant.length === 0) return { content: styleContent, fixed: 0 };

  let content = styleContent;
  let fixed = 0;
  for (const issue of redundant) {
    const selectorEsc = issue.selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fullRule = new RegExp(
      `(${selectorEsc}\\s*\\{)([\\s\\S]*?)(\\})`,
      'i',
    );
    const before = content;
    content = content.replace(fullRule, (whole, open, body, close) => {
      // 移除 display: flex 和 flex-direction: column
      let newBody = body
        .replace(/\s*display\s*:\s*flex\s*;?/gi, '')
        .replace(/\s*flex-direction\s*:\s*column\s*;?/gi, '');
      // 清理多余空行
      newBody = newBody.replace(/\n\s*\n\s*\n/g, '\n');
      fixed++;
      return `${open}${newBody}${close}`;
    });
    if (content === before) continue;
  }
  return { content, fixed };
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
