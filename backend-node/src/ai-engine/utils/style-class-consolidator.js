/**
 * 子组件类样式收敛器（2026-09-03，管线 A 方案）
 *
 * 【背景 / 为什么需要】
 * 契约化改造后，微码产物由「单体 index.vue」变成「主壳 + N 个子组件」，
 * 子组件的类样式自然落在各自的 `<style lang="less" scoped>` 里。而预览加载器
 * （vue3-sfc-loader 0.9.5）存在 **scopeId 失配**缺陷：元素 `data-v-X` 与 CSS 规则
 * `[data-v-Y]` 对不上 → 子组件 scoped 样式在预览页**全部失效**
 * （agent-browser 实测：icon 按 PNG 原始 104px 渲染、chart 容器 0 高 → echarts 不初始化）。
 * 方案前单体组件 + 行内样式 + common.less，缺陷被掩盖 → 拆分后集中爆发 = 视觉退化。
 *
 * 【治本思路】
 * 把子组件的**类规则**确定性收敛进 `resources/styles/common.less`：
 *  - common.less 会被 `precompileCss` 编译进 `index.css`（无 scoped、全局生效）；
 *  - 预览侧已确定性注入 index.css（loadVue3Runtime.injectGlobalIndexCss）；
 *  → 类样式还原不再依赖 scoped 机制。
 * 同名类冲突时**以子组件定义为准**（子组件样式更贴近其模板，且消除双源漂移）。
 *
 * 【④ 根因与治本（2026-09-09，#648/#649）】
 *  实测 fixtures 暴露：LLM 给同一视觉节点生成**两套类名** —— scoped 内写**短语义类**
 *  （如 `.c-device-monitor-header-stats`），而真实 DOM 上却套一层**实例前缀长形式**
 *  （如 `c-device-monitor-malvtjd5-c-device-monitor-header-stats`，即 `c-{instanceId}-` + 短类）。
 *  旧收敛把 scoped 短类**原样**搬进 common.less，但真实 DOM 是长类名 → 选择器永远对不上
 *  → 样式失效（icon 按 PNG 原始尺寸、图表容器 0 高）+ 被 CODE-003-HIT-RATE 误判死样式。
 *  治本：以「子组件 template DOM 实际类名」为事实源，对每个 scoped 短类选择器确定性重写为
 *  DOM 实际出现的长/短形式（DOM 有 `c-{instanceId}-{短类}` 则用长、否则用短、都没有则
 *  fail-open 保留短类）；无 instanceId 组件（DOM 全短）保持短类，不臆造前缀。
 *
 * 【安全边界】
 *  - 只处理 `package/components/*.vue` 的顶层类规则，不碰变量声明 / @import / @media；
 *  - 合并前做括号平衡校验，异常则**整体回退不改动**（不引入 LESS 语法错误）；
 *  - 纯函数、幂等（重复执行结果一致）。
 */

/** 子组件路径：package/components/Xxx.vue */
const SUB_COMPONENT_RE = /^package\/components\/[^/]+\.vue$/;
/** 公共样式文件路径 */
const COMMON_LESS_PATH = 'resources/styles/common.less';
/** 顶层规则起始：行首 .cls / &  / @media 之外只收类选择器 */
const RULE_START_RE = /^(\.[a-zA-Z][\w-]*)/;

/**
 * 从 SFC 源码中提取 style 块内容（可能多个），返回拼接后的 Less 文本。
 * @param {string} sfc 组件源码
 * @returns {string}
 */
function extractStyleBlocks(sfc = '') {
  const blocks = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(sfc))) {
    blocks.push(m[1] || '');
  }
  return blocks.join('\n');
}

/**
 * 按括号平衡切分 Less 文本为「顶层块」数组（保留原始文本，含尾部 }）。
 * 只保留以类选择器开头的块；跳过变量声明（@x: ...）、@import、注释、@media。
 *
 * 【④ 修复（2026-09-09）跨行选择器组】
 *  旧实现遇到每个「非块体行」若其本身不是选择器开头（如 `.a,\n.b,` 这类逗号续行）就 `continue`，
 *  导致多选择器跨行分组（`.stat-type,\n.stat-total,\n.stat-rate { ... }`）被切成多个碎片，
 *  只有最后一个带 `{` 的选择器成块，前几个及其共享规则被静默丢弃 → 样式缺漏。
 *  新实现：首行识别为类选择器即「开始一块」并持续累积后续行，直到 `{` 出现（进入块体）、
 *  再直到 `}` 配对返回顶层才定稿——跨行多选择器被完整保留为单一块。
 *
 * @param {string} less 样式文本
 * @returns {Array<{selector: string, text: string}>}
 */
function splitTopLevelClassBlocks(less = '') {
  const lines = String(less).split('\n');
  const blocks = [];
  let buf = '';
  let depth = 0;
  let selector = '';
  let started = false; // 已开始一个顶层块（首选择器识别后）
  let entered = false; // 已遇到块体 { （进入过 depth>0）
  let inAtRule = false; // 🛡️ 修复：追踪 @media/@supports 等 at-rule 块

  for (const rawLine of lines) {
    const line = rawLine.replace(/\/\/.*$/, ''); // 去行注释（不处理块注释，避免误判）
    const trimmed = line.trim();

    // 🛡️ 修复：检测 at-rule 开始（@media/@supports/@keyframes 等）
    if (depth === 0 && !started && /^@(media|supports|keyframes|font-face|import|charset)/i.test(trimmed)) {
      inAtRule = true;
    }

    // 顶层、尚未开始块、非 at-rule 内：识别块首选择器
    if (depth === 0 && !started && !inAtRule) {
      if (!trimmed || trimmed.startsWith('@') || trimmed.startsWith('/*')) {
        if (buf.trim()) { blocks.push({ selector, text: buf.replace(/\s+$/, '') }); buf = ''; }
        started = false; selector = '';
        continue;
      }
      const sm = trimmed.match(RULE_START_RE);
      if (!sm) {
        // 非类选择器开头（裸属性 / 标签选择器）→ 若有累积先定稿
        if (buf.trim()) { blocks.push({ selector, text: buf.replace(/\s+$/, '') }); buf = ''; }
        started = false; selector = '';
        continue;
      }
      // 进入新块：即便本行同时带 { 也继续累积（depth 会在下方更新）
      selector = sm[1];
      started = true;
      entered = false;
      buf = '';
    }

    if (started) buf += rawLine + '\n';

    for (const ch of line) {
      if (ch === '{') { depth += 1; entered = true; }
      else if (ch === '}') depth -= 1;
    }

    // 🛡️ 修复：at-rule 块结束时重置状态
    if (inAtRule && depth === 0) {
      inAtRule = false;
      buf = '';
      started = false;
      selector = '';
      entered = false;
      continue;
    }

    // 顶层闭合：一个完整块（首选择器 + 块体）结束。必须 entered —— 否则多行选择器
    // 续行（.a,\n.b,）在 depth 仍为 0 时会被误判为独立块。只有真正 {→} 配对后才定稿。
    if (started && entered && depth <= 0) {
      if (buf.trim()) blocks.push({ selector, text: buf.replace(/\s+$/, '') });
      buf = '';
      started = false;
      selector = '';
      entered = false;
      depth = 0;
    }
  }
  // 末尾若有未定稿（理论不该出现，保守定稿）
  if (started && entered && buf.trim()) blocks.push({ selector, text: buf.replace(/\s+$/, '') });
  return blocks;
}

/**
 * 从 Less 文本中删除指定类选择器的规则块（**含嵌套块**）。
 *
 * 为什么必须处理嵌套：LLM 常把子组件的类写进 common.less 的父选择器内
 * （如 `.controls { .icon-btn { width: 100% } }`）。若只在文件末尾追加顶层定义，
 * 嵌套选择器的优先级更高 → 追加的 24px **不会生效**（实测实锤）。
 * 故收敛前先把同名块（任意层级）全部剥离，保证子组件定义是唯一事实源。
 *
 * 假定产物 Less 为规整格式（选择器独占行、`{` 在行尾、`}` 独占行）——
 * 管线生成 + css-sanitizer 清洗后满足该前提；异常格式走括号校验回退。
 * @param {string} less 原 Less 文本
 * @param {string[]} selectors 待删除的类选择器（如 ['.c-x-icon-btn']）
 * @returns {string}
 */
function removeClassBlocks(less = '', selectors = []) {
  if (!selectors.length) return less;
  const lines = String(less).split('\n');
  const out = [];
  let skipDepth = 0;

  const countBraces = (text) => {
    let open = 0;
    let close = 0;
    for (const ch of text) {
      if (ch === '{') open += 1;
      else if (ch === '}') close += 1;
    }
    return { open, close };
  };

  for (const line of lines) {
    if (skipDepth > 0) {
      const { open, close } = countBraces(line);
      skipDepth += open - close;
      if (skipDepth <= 0) skipDepth = 0;
      continue; // 跳过块体
    }
    const trimmed = line.trim();
    const isBlockStart = trimmed.includes('{');
    if (isBlockStart) {
      const selPart = trimmed.slice(0, trimmed.indexOf('{')).trim();
      const tokens = selPart.split(/\s+/).filter(Boolean);
      const hit = selectors.some((s) => tokens.includes(s));
      if (hit) {
        const { open, close } = countBraces(line);
        skipDepth = open - close; // 单行块（如 `.a { x: 1 }`）时为 0
        if (skipDepth <= 0) skipDepth = 0;
        continue; // 删除块头
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * 把类规则块合并进 common.less：
 * ① 先删除 common.less 中所有同名块（含嵌套）→ 消除双源与优先级陷阱；
 * ② 再追加子组件版定义 → 子组件定义为唯一事实源。
 * @param {string} commonLess 原 common.less
 * @param {Array<{selector: string, text: string}>} blocks 待合并块
 * @returns {{content: string, replaced: string[], added: string[]}}
 */
function mergeIntoCommonLess(commonLess = '', blocks = []) {
  const selectors = blocks.map((b) => b.selector);
  const stripped = removeClassBlocks(commonLess, selectors);
  const oldSelectors = selectors.filter((s) => commonLess.includes(s));
  const appended = blocks.map((b) => b.text).join('\n\n');

  const content = `${stripped.replace(/\s*$/, '')}\n\n${appended}\n`;
  return {
    content,
    replaced: oldSelectors,
    added: blocks.map((b) => b.selector).filter((s) => !oldSelectors.includes(s)),
  };
}

/** 括号平衡校验（防止把残缺块写进 common.less） */
function isBalanced(less = '') {
  let depth = 0;
  for (const ch of String(less)) {
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/**
 * 过滤明显不是 Less 规则的碎片，避免分隔文本 / LLM 杂质混入 common.less。
 * 只保留像类规则的块；其它内容一律丢弃。
 */
/** 统计文本中的开括号数 / 闭括号数（忽略字符串内，避免 url("...") 干扰） */
function countOpenBraces(text = '') {
  let n = 0;
  let inStr = null;
  for (const ch of String(text)) {
    if (inStr) {
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") inStr = ch;
    else if (ch === '{') n += 1;
  }
  return n;
}
function countCloseBraces(text = '') {
  let n = 0;
  let inStr = null;
  for (const ch of String(text)) {
    if (inStr) {
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") inStr = ch;
    else if (ch === '}') n += 1;
  }
  return n;
}
function countBraces(text = '') {
  return countOpenBraces(text) - countCloseBraces(text);
}

function isValidLessRuleBlock(text = '') {
  const raw = String(text).trim();
  if (!raw) return false;
  if (/^=+/.test(raw)) return false;
  if (/^[-—]{3,}/.test(raw)) return false;
  if (/^\/\//.test(raw)) return false;
  if (/^\/\*/.test(raw) && !raw.includes('}')) return false;
  if (!raw.includes('{') || !raw.includes('}')) return false;
  return RULE_START_RE.test(raw) || /^&[^{]*\{/.test(raw);
}

/**
 * 清理 common.less 里明显的分隔文本碎片。
 * 这类内容来自上游自愈 / 拼接残留，不属于 Less 规则，
 * 若保留会直接污染最终样式文件。
 */
function sanitizeCommonLessText(less = '') {
  return String(less)
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (/^\}\s*[=—-]{3,}.*$/.test(trimmed)) return '}';
      if (/^[=—-]{3,}\s*.*$/.test(trimmed)) return '';
      if (/^\/\/[=—-]{3,}\s*.*$/.test(trimmed)) return '';
      return line;
    })
    .join('\n');
}

/**
 * 判断 class 是否为「c- 前缀语义类」候选（规范化：全小写、去除 -active/--active 尾缀）。
 * 之所以用小写：微码管道统一小写语义类；Figma 层偶尔有 camelCase（如 stat-type--active）。
 * 返回去尾缀后的语义基名，如 'c-device-monitor-stat-type'；非候选（.is-active / 工具类）返回 ''。
 * @param {string} cls - 去除 . 前缀的 class 名
 * @returns {string}
 */
export function normalizeShortClass(cls = '') {
  const lower = String(cls).toLowerCase();
  const m = lower.match(/^(c-[a-z][a-z0-9]*(?:-[a-z0-9]+)*?)(?:-+active)?$/);
  if (!m) return '';
  const base = m[1];
  // 实例 ID 形态长类自身不带尾缀，直接返回（若带尾缀则同时是短类候选，由调用方先长类后短类优先级处理）
  if (/^c-[a-z0-9]+-[a-z0-9]+-c-/.test(base)) return '';
  return base;
}

/**
 * 判断选择器首 token 是否为需对齐的短语义类选择器（c- 前缀，允许 & 复合）。
 * 排除：父引用专用（&.active / &:hover，本身不独立成块）、active 工具类、c-mc-max 实例根类。
 * @param {string} selectorToken
 * @returns {boolean}
 */
function looksLikeShortClass(selectorToken = '') {
  const t = String(selectorToken).trim();
  if (!t) return false;
  if (/^&[.:]/.test(t)) return false;
  if (t === '&' || /^&\s*$/.test(t)) return false;
  const clsName = t.replace(/^\./, '');
  if (!clsName || !/^c-/.test(clsName)) return false;
  if (/^c-mc-max-/i.test(clsName)) return false;
  return normalizeShortClass(clsName) !== '';
}

/**
 * 重写类块文本：把「每一行」里的短语义类选择器（.c-x-header-stats）重写为
 * DOM 实际出现的长/短类。逐行处理，任意深度（顶层 / 嵌套）的 .c- 短类都对齐 DOM。
 *
 * 【为什么逐行而非两段式（2026-09-09 实锤）】
 *  旧「累积 token 到 { 再统一重写」会把**块体声明行**（如 `flex: 30 1 0;`）误判成
 *  选择器 token 累积进来，整段块体被丢弃 → 输出 `.class{` 空壳 → 括号不平衡 → 整体回退。
 *  逐行方案：每行只替换其中 `.xxx` 形式的类 token，声明行（无 `.class` 形态）原样保留。
 *
 * 【纯父引用块跳过】`& { ... }` 这类仅作嵌套作用域、自身无独立类选择器的块，整体跳过
 *  （其内部的 `.c-x` 已由父块选择器提供上下文，不该被改写为 DOM 长类）。
 *
 * @param {string} text 块文本（含选择器、块体、末尾 `}`）
 * @param {(short: string) => string} rewriteShort 短类 → 真实 DOM 类
 * @returns {string} 重写后文本（选择器行中的 .c- 短类对齐 DOM；块体/声明行原样保留）
 */
function rewriteBlockText(text = '', rewriteShort) {
  const lines = String(text).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    // 仅「选择器行」参与重写：行内含 {（选择器 + 块开始）或以 , 结尾（跨行选择器续行）。
    // 声明行（以 ; 结尾 / 纯属性）与 url(...) / 字符串值里的 .c- 片段一律不动（防误改）。
    const isSelectorLine = trimmed.includes('{') || /,\s*$/.test(trimmed);
    if (!isSelectorLine) {
      out.push(rawLine);
      continue;
    }
    const newTrimmed = trimmed.replace(/\.([a-zA-Z][\w-]*)/g, (full, clsName) => {
      if (!looksLikeShortClass(clsName)) return full;
      const target = rewriteShort(clsName);
      if (!target || target === clsName) return full;
      return `.${target}`;
    });
    if (newTrimmed === trimmed) {
      out.push(rawLine);
    } else {
      // 保留原行缩进
      const indent = /^\s*/.exec(rawLine)[0];
      out.push(indent + newTrimmed);
    }
  }
  return out.join('\n');
}

/**
 * 以子组件 template DOM 实际类名为事实源，构建「短类 → 长类名」重写映射。
 *
 * 【为什么必须 DOM 驱动（2026-09-09 取证）】
 *  LLM 给同一节点生成两套类名：scoped 短类（.c-x-header-stats）与 DOM 长类
 *  （c-x-{instanceId}-c-x-header-stats）。若「长类 = 硬拼 c-{instanceId}- + 短类」，
 *  会漏掉 DOM 上的真实差异（如 c-device-monitor-header-stats 的实际 DOM 长类是
 *  c-device-monitor-malvtjd5-c-device-monitor-header-stats，其中 malvtjd5 恰为 componentId 尾段，
 *  但真实 DOM 与硬拼前缀不总是同构）。故扫描 template class 属性：凡「DOM 短类含 c- 语义」
 *  则登记其**真实出现 token**（可能带 c-{instanceId}- 前缀，也可能就是短类本身）。
 *
 * @param {string} template SFC template 块文本（不含 <template> 标签亦可）
 * @returns {Object<string,string>} shortBase → 真实 DOM 类 token
 */
function buildClassRewriteMap(template = '') {
  const map = {};
  if (!template) return map;
  // 提取所有 class / :class 属性值（含 :class="['a', {'b': x}]" 数组/对象字面量），
  // 按配对引号整体截取（避免内部单引号截断）。
  const attrRe = /(?:class|:class)\s*=\s*["']/gi;
  let m;
  while ((m = attrRe.exec(template))) {
    const quote = m[0].slice(-1);
    const start = m.index + m[0].length;
    let end = -1;
    for (let i = start; i < template.length; i++) {
      if (template[i] === '\\') { i += 1; continue; }
      if (template[i] === quote) { end = i; break; }
    }
    if (end < 0) continue;
    const value = template.slice(start, end);
    // value 内引号包裹的字符串 token 即是 DOM 真实 class（静态 / 数组元素 / 对象 key）
    const strRe = /["']([^"']+)["']/g;
    let sm;
    while ((sm = strRe.exec(value))) {
      const tok = sm[1].trim();
      if (!tok || tok.includes(' ')) continue;
      registerClassToken(map, tok);
    }
    // 纯静态（无 JS 字面量字符）按空格拆
    if (!/[{}[\],:]/.test(value)) {
      for (const tok of value.split(/\s+/).filter(Boolean)) registerClassToken(map, tok);
    }
  }
  return map;
}

/**
 * 把一个 DOM class token 登记进「短类基名 → 真实 token」映射。
 * 短类基名 = 带实例前缀的长类剥外层到内层 c- 语义（如 c-x-{id}-c-x-header-stats → c-x-header-stats）；
 * 无前缀则直接用自身短类。实例前缀段数不固定，用 indexOf('-c-') > 0 剥离，而非固定段数正则。
 */
function registerClassToken(map, tok) {
  const lower = String(tok).toLowerCase();
  const idx = lower.indexOf('-c-');
  if (idx > 0) {
    const base = normalizeShortClass(lower.slice(idx + 1));
    if (base && !map[base]) map[base] = tok;
    return;
  }
  const base = normalizeShortClass(lower);
  if (base && !map[base]) map[base] = tok;
}

/**
 * 主入口：把子组件 style 块里的类规则收敛进 common.less。
 * 收敛前以子组件 template 真实 DOM 类名为事实源，把 scoped 短语义类选择器重写为
 * DOM 实际出现的长/短形式（④ #648/#649），使 common.less 选择器与真实 DOM 匹配。
 * @param {Object<string,string>} files 产物文件表（path → content）
 * @param {Object} [options]
 * @param {{warn?:Function,info?:Function,log?:Function}} [options.logger]
 * @returns {Object<string,string>} 新文件表（原对象不被修改；无变化时返回新对象但内容等价）
 */
export function consolidateSubComponentClasses(files = {}, options = {}) {
  const logger = options.logger || {};
  // 🛡️ 修复（2026-09-08 实测 mc-max-1788832532312 堆栈实锤）：裸方法提取丢 this ——
  // logger.js 的 warn/info 是类方法（内部 this.log(...)），此处提取为裸引用后调用时
  // this 为 undefined → "Cannot read properties of undefined (reading 'log')" →
  // 收敛整体失败回退原样写盘（子组件 scoped 样式失配问题回归）。必须 bind(logger)。
  const warn = typeof logger.warn === 'function' ? logger.warn.bind(logger) : () => {};
  const info = typeof logger.info === 'function' ? logger.info.bind(logger) : () => {};

  const next = { ...files };
  const subPaths = Object.keys(next).filter((p) => SUB_COMPONENT_RE.test(p));
  const rawCommonLess = next[COMMON_LESS_PATH];

  // 无子组件或没有 common.less → 无收敛目标（微码单体组件 / vue3 路不适用）
  if (subPaths.length === 0 || typeof rawCommonLess !== 'string') return next;
  const commonLess = sanitizeCommonLessText(rawCommonLess);

  const blocks = [];
  for (const p of subPaths) {
    const sfc = next[p];
    const styleText = extractStyleBlocks(sfc);
    if (!styleText.trim()) continue;

    // ④ #648/#649：以该子组件 template 真实 DOM 类名为事实源，构建「短类 → 长/短真实类」映射。
    // 失败（无 template / 无映射）时 map 为空 → rewriteShort 一律返回原短类 → 行为与原版一致（fail-open）。
    const tplMatch = sfc.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
    const rewriteMap = buildClassRewriteMap(tplMatch ? tplMatch[1] : '');
    const rewriteShort = (shortClass) => {
      const base = normalizeShortClass(shortClass);
      if (base && rewriteMap[base]) return rewriteMap[base];
      return shortClass; // fail-open：无 DOM 对应则保留 scoped 原短类
    };

    for (const b of splitTopLevelClassBlocks(styleText)) {
      if (!isValidLessRuleBlock(b.text)) continue;
      let targetText = b.text;
      if (rewriteMap && Object.keys(rewriteMap).length > 0) {
        const rewritten = rewriteBlockText(b.text, rewriteShort);
        if (rewritten !== null && rewritten !== '') targetText = rewritten;
      }
      // 跳过已完全相同的块（幂等，避免重复追加）
      blocks.push({ selector: b.selector, text: targetText });
    }
  }
  if (blocks.length === 0) return next;

  // 去重：同一 selector 只保留最后一个（子组件内/间重复时后者优先）
  const dedup = new Map();
  for (const b of blocks) dedup.set(b.selector, b);
  const uniqueBlocks = [...dedup.values()];

  const merged = mergeIntoCommonLess(commonLess, uniqueBlocks);
  if (!merged.replaced.length && !merged.added.length) return next;

  // 安全校验：合并结果必须括号平衡，否则整体回退（不引入 LESS 语法错误）
  if (!isBalanced(merged.content)) {
    warn(
      '[style-class-consolidator] 合并后 LESS 括号不平衡，已回退（不改动 common.less）',
    );
    return next;
  }
  // 幂等短路：内容无实质变化则跳过（避免无意义写盘/日志噪音）
  if (merged.content.trim() === commonLess.trim()) return next;

  next[COMMON_LESS_PATH] = merged.content;
  info(
    `[style-class-consolidator] 子组件类样式已收敛进 common.less（新增 ${merged.added.length} / 覆盖同名 ${merged.replaced.length}）`,
  );
  return next;
}

export default consolidateSubComponentClasses;
