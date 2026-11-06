/**
 * 🧵 样式补缺（2026-11-06 · mc-max-1799319861321-a9364bd4 实锤）：纯函数族。
 *
 * ## 病灶
 * `common.less` 一次性要覆盖 59 个模板类，模型只写出 21 个（outputTokens 2555）⇒
 * 子组件 `ContentForecast` 的 24 个 `forecast-*` 类**零规则** ⇒ 整段渲染成裸文本堆叠
 * （结构在、样式全无）。既有 `CLASS-MUST-EXIST` 检出 38 个缺失却只 WARN，没人补。
 *
 * 本模块只做**确定性的差距计算与回收过滤**，LLM 调用在 microcode-engineer 侧：
 *  1) `collectUsedClasses`：样式分块拿到的清单 ∪ 所有 `.vue` 模板里 `class="..."` 的字面 token
 *  2) `collectDefinedClasses`：样式表**选择器**里出现过的类名（只认 `{` 之前的部分）
 *  3) `diffMissingClasses`：used − defined
 *  4) `harvestMissingRuleBlocks`：从补缺响应里**只摘**命中缺失类、且当前仍未定义的规则块
 *  5) `appendRules`：把摘到的块追加到 common.less 末尾（不覆盖任何已有内容）
 *
 * 纪律：宁可漏补（少了样式）也不覆盖（把已有正确规则冲掉）；动态片段/插值天然被
 * 标识符正则过滤，不会当成类名。
 */

const CLASS_TOKEN_RX = /^[A-Za-z][\w-]*$/;

/** 去掉 CSS 注释（块内选择器/声明里的注释会把选择器切坏）。 */
export function stripCssComments(text) {
  return String(text || '').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * 去掉 `@media / @supports / @container … { … }` 整块（含配平嵌套）。
 * 缺类回收只针对**顶层普通规则**：@media 内的规则在原文件里已存在与否无法从片段判断，
 * 摘进来会重复定义（宁可漏补）。
 */
export function stripAtBlocks(text) {
  const s = String(text || '');
  let out = '';
  let i = 0;
  while (i < s.length) {
    const at = s.indexOf('@', i);
    if (at < 0) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, at);
    const brace = s.indexOf('{', at);
    if (brace < 0) break;
    let depth = 0;
    let j = brace;
    for (; j < s.length; j += 1) {
      if (s[j] === '{') depth += 1;
      else if (s[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    // 跳过整块（@import/@charset 这类无花括号的由上方 brace<0 兜住）
    i = j;
  }
  return out;
}

/** 模板 `class="..."` 里的字面 token（插值/动态片段被标识符正则排除）。 */
export function collectTemplateClassTokens(vueContent) {
  const out = [];
  const text = typeof vueContent === 'string' ? vueContent : '';
  if (!text) return out;
  for (const m of text.matchAll(/\sclass="([^"]*)"/g)) {
    // 🔴 先剥掉 mustache 段：`class="a {{ dyn }}"` 里的 `dyn` 是表达式不是类名
    const literal = String(m[1]).replace(/\{\{[\s\S]*?\}\}/g, ' ');
    for (const t of literal.split(/\s+/)) {
      const c = t.trim();
      if (c && CLASS_TOKEN_RX.test(c)) out.push(c);
    }
  }
  return out;
}

/**
 * 已使用类集合（去重、保序）。
 * @param {string[]} classNamesList 样式分块拿到的类名清单
 * @param {Object<string,string>} files 产物文件表（只扫 .vue）
 */
export function collectUsedClasses(classNamesList, files = {}) {
  const seen = new Set();
  const out = [];
  const push = (raw) => {
    const c = String(raw || '').trim();
    if (!c || seen.has(c) || !CLASS_TOKEN_RX.test(c)) return;
    seen.add(c);
    out.push(c);
  };
  for (const c of Array.isArray(classNamesList) ? classNamesList : []) push(c);
  for (const [p, content] of Object.entries(files || {})) {
    if (!/\.vue$/i.test(p)) continue;
    for (const c of collectTemplateClassTokens(content)) push(c);
  }
  return out;
}

/**
 * 样式表里已定义的类名（只取选择器段 `[^{}]+{` 内的 `.class`）。
 * @param {...string} texts 任意个样式文本（common.less / theme-vars.less / index.less …）
 * @returns {Set<string>}
 */
export function collectDefinedClasses(...texts) {
  const set = new Set();
  for (const text of texts) {
    const s = typeof text === 'string' ? text : '';
    if (!s) continue;
    for (const m of s.matchAll(/([^{}]+)\{/g)) {
      for (const cm of m[1].matchAll(/\.([A-Za-z][\w-]*)/g)) set.add(cm[1]);
    }
  }
  return set;
}

/** used − defined（保序）。 */
export function diffMissingClasses(used, defined) {
  const d = defined instanceof Set ? defined : new Set(defined || []);
  return (Array.isArray(used) ? used : []).filter((c) => !d.has(c));
}

/**
 * 从补缺响应里只摘「命中缺失类 且 当前仍未定义」的规则块。
 * @param {string} text LLM 返回（可能整篇重写，也可能只有几块）
 * @param {Set<string>} missingSet 缺失类集合
 * @param {Set<string>} definedSet 当前已定义集合
 * @returns {string[]} 可追加的规则块（`selector { body }`）
 */
export function harvestMissingRuleBlocks(text, missingSet, definedSet) {
  const out = [];
  const seen = new Set();
  const src = stripAtBlocks(stripCssComments(text));
  if (!src) return out;
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = String(m[1]).trim();
    if (!selector || selector.includes('@')) continue;
    const classes = [...selector.matchAll(/\.([A-Za-z][\w-]*)/g)].map((x) => x[1]);
    if (classes.length === 0) continue;
    if (!classes.some((c) => missingSet.has(c))) continue;
    if (classes.every((c) => definedSet.has(c) || seen.has(c))) continue;
    const body = String(m[2]).trim();
    if (!body) continue;
    out.push(`${selector} { ${body} }`);
    for (const c of classes) seen.add(c);
  }
  return out;
}

/** 把块追加到样式表末尾（保留原内容，末尾补一个说明注释）。 */
export function appendRules(styleContent, blocks) {
  const list = Array.isArray(blocks) ? blocks.filter(Boolean) : [];
  if (list.length === 0) return typeof styleContent === 'string' ? styleContent : '';
  const base = String(styleContent || '').replace(/\s*$/, '');
  const header = `\n/* ===== [样式补缺] 缺失类定向补齐（${list.length} 条 · 系统生成） ===== */\n`;
  return `${base}\n${header}${list.join('\n')}\n`;
}

/**
 * 🧱 结构性兜底（选项 A · 2026-11-06）：**只补布局骨架，不猜视觉**。
 *
 * 背景：样式补缺一轮后仍可能有个别类零规则（模型漏写 / 无 Figma 真值）。此时若什么都不写，
 * 元素退回浏览器默认样式（`display:block` / 无 flex / 无 min-width），常见后果是文字竖堆、
 * 卡片挤成一行、flex 子项无法收缩 → 整块视觉塌陷。
 *
 * 判据与边界（宁缺勿错）：
 *  · 只输出 `box-sizing / display:flex / flex-direction:column / min-width:0` 四类**纯结构**声明；
 *  · **绝不**写颜色、字号、圆角、阴影、宽高（那些属于真值，猜了就是编造）；
 *  · 只有当该 class 所在元素**有元素子节点**（容器）时才给 `display:flex; flex-direction:column`
 *    —— 纯文本叶子给 flex 会改变行内排版（把文字变成 flex item），风险大于收益；
 *  · 兜底不等于"样式已还原"：调用方仍把它计入 `stillMissing`（诚实降级），只额外计数。
 */

/** 从 .vue 模板里定位每个 class 的第一个宿主标签：{ tag, hasElementChildren } */
export function findClassHostKinds(files = {}) {
  const map = new Map();
  for (const [p, content] of Object.entries(files || {})) {
    if (!/\.vue$/i.test(p) || typeof content !== 'string') continue;
    const text = content;
    for (const m of text.matchAll(/\sclass="([^"]*)"/g)) {
      const tokens = String(m[1]).replace(/\{\{[\s\S]*?\}\}/g, ' ').split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;
      // 标签名：从 class 属性往前找最近的一个 `<tag`
      const before = text.slice(0, m.index);
      const tagOpen = before.lastIndexOf('<');
      if (tagOpen < 0) continue;
      const tagM = /^<([a-zA-Z][\w-]*)/.exec(text.slice(tagOpen));
      if (!tagM) continue;
      // 标签结束位置（属性可能带引号内的 `>`）
      let i = tagOpen + 1;
      let quote = null;
      for (; i < text.length; i += 1) {
        const ch = text[i];
        if (quote) {
          if (ch === quote) quote = null;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          continue;
        }
        if (ch === '>') break;
      }
      const after = text.slice(i + 1).replace(/^\s+/, '');
      const selfClosed = text.slice(tagOpen, i).trimEnd().endsWith('/');
      const hasElementChildren = !selfClosed && after.startsWith('<') && !after.startsWith('</');
      for (const cls of tokens) {
        if (!map.has(cls)) map.set(cls, { tag: tagM[1].toLowerCase(), hasElementChildren });
      }
    }
  }
  return map;
}

/** 生成结构性最小规则（纯布局，无任何视觉猜测）。 */
export function buildStructuralRule(cls, kind) {
  const name = String(cls || '').trim();
  if (!name) return '';
  const node = kind || {};
  const decls = ['box-sizing: border-box;'];
  if (node.hasElementChildren) {
    decls.push('display: flex;', 'flex-direction: column;', 'min-width: 0;');
  }
  return `.${name} { ${decls.join(' ')} }`;
}

/**
 * 为仍缺失的类生成结构性兜底块（保持输入顺序，跳过无宿主的类）。
 * @returns {{blocks:string[], covered:string[], skipped:string[]}}
 */
export function buildStructuralFallback(classes, files = {}) {
  const kinds = findClassHostKinds(files);
  const blocks = [];
  const covered = [];
  const skipped = [];
  for (const cls of Array.isArray(classes) ? classes : []) {
    const kind = kinds.get(cls);
    if (!kind) {
      skipped.push(cls);
      continue;
    }
    const rule = buildStructuralRule(cls, kind);
    if (!rule) {
      skipped.push(cls);
      continue;
    }
    blocks.push(rule);
    covered.push(cls);
  }
  return { blocks, covered, skipped };
}
