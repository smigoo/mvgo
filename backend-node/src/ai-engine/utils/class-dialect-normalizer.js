/**
 * @file class-dialect-normalizer.js — 🛡️ P1.5（2026-09-11）：**类名规范化的单一写入者**。
 *
 * 设计位置（关键）：本规范化器必须运行在 **classFacts 采集之前**。这样
 *   `LLM/修复器产物 → 归一 → classFacts 采集 → 各消费链（consolidator / prefix-fixer / 门禁 / 不变量）`
 * 全链看到的是**同一套规范类名**，从结构上消灭「facts 看到 is-active、下游看到 --active」这类新裂缝。
 *
 * 规范化规则（契约 C1/C2 的生成侧实现）：
 *   R1 布尔方言归一：元素上的 `is-active`/`active`/`is-on`… → `${该元素基类}--active`
 *   R2 修饰符形态对齐：元素上的 `X--mod`（X 与同元素基类形态不一致）→ `${基类}--mod`
 *      （后缀逐字保留；`--mod` / `-active` 形态由 normalizeModifierSuffix 归一）
 *   R3 样式侧同规则：`.base.is-active` → `.base--active`；`.X--mod` 若 X 为短形而同文件
 *      存在长形基类 → 对齐长形（保守：仅在能唯一确定时改写）
 *   R4 跨侧基名对齐（刀 12，2026-09-13）：模板元素基名与**样式源基名**不一致时，
 *      以修饰符为锚点、前缀扩展 + 唯一候选为判据，把模板侧改写到样式侧基名。
 *      （R1~R3 只覆盖「同一元素内部 / 同一文件内部」，R4 补的是「模板 ↔ 样式」跨侧。）
 *
 * 保守边界（宁可不动，不可改错）：
 *   - 仅处理 `c-*` 组件类；不碰工具类 / 状态类以外的宿主类；
 *   - 元素上找不到「基类 token」时**不动**（交给门禁 C1 报警，避免臆造基名）；
 *   - R4 无修饰符锚点 / 候选不唯一 → **不动**（交给门禁 C3/C4 报警，不臆造对应关系）；
 *   - 只改类 token，不触碰属性结构（逐 token 精确替换，带 `(?<![\w-])(?![\w-])` 边界）。
 *
 * jest 安全：无 import.meta。
 */

import {
  splitModifier,
  normalizeModifierSuffix,
  isAliasModifierToken,
  hasModifier,
  extractClassTokensFromBindingValue,
} from './class-facts.js';
import { buildParentSelectorMap } from './less-selector-stack.js';

/** 元素标签 + 属性串（宽松匹配，仅用于定位 class/:class 片段） */
const TAG_RE = /<([A-Za-z][\w-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*)\/?>/g;

/** 取 class="..." / :class="..." 的属性值（含配对引号内含引号的 :class 对象字面量） */
function extractClassAttrs(attrs = '') {
  const out = { static: [], dynamic: [] };
  const attrRe = /(:class|class)\s*=\s*(["'])/g;
  let m;
  while ((m = attrRe.exec(attrs))) {
    const isDynamic = m[1] === ':class';
    const quote = m[2];
    const start = m.index + m[0].length;
    let end = -1;
    for (let i = start; i < attrs.length; i++) {
      if (attrs[i] === '\\') {
        i += 1;
        continue;
      }
      if (attrs[i] === quote) {
        end = i;
        break;
      }
    }
    if (end < 0) continue;
    out[isDynamic ? 'dynamic' : 'static'].push({
      value: attrs.slice(start, end),
      start,
      end,
    });
  }
  return out;
}

/**
 * 🛡️ 刀 12b（2026-09-13）：class/:class 绑定值的 token 采集**统一到单一事实源**
 * `class-facts#extractClassTokensFromBindingValue`（旧 `tokensOfClassValue` 已删除）。
 *
 * 旧实现用 `/["']([^"']+)["']/g` 无差别抓引号文本 —— 与刀 11a 在 classFacts 里修的是
 * 同一缺陷类，但这里后果更重：`'active'` 被当成类 token 后，R1 会把它「归一」成
 * `${基类}--active` 并**回写进模板**，把 `:class="{ 'x': cur === 'active' }"` 的比较值
 * 直接改坏（表达式损坏）。统一后：对象字面量只取键、表达式位置的字面量被遮。
 */

/** 兜底自动修复段的标记注释（症状遮罩，不可当作设计意图样式） */
const AUTO_FIX_MARKER_RE = /\/\*\s*(?:=+\s*)?\[自动修复\][\s\S]*?\*\//g;

/**
 * 🛡️ 刀 12（2026-09-13）：剥离 `[自动修复]` 兜底 stub（**标记注释 + 紧随其后的一个规则块**）。
 * 该段是「模板类名在样式侧缺失」时程序化补的 stub（只有布局属性），若当作设计意图样式
 * 参与 R4 判定，会把「名字不一致」误读成「已经对齐」→ 对齐永不触发。
 *
 * 实现要点（**按规则块剔除，不能整段截断**）：编译产物 `index.css` 里兜底段被
 * `.common()` / `@import (multiple)` / 主题层各自展开，位置分散且前后夹着合法设计规则；
 * 早期「截断到首个标记」的实现会连带丢掉后面几十 KB 的合法类名（索引残缺 → 只能 fail-open）。
 * @param {string} css
 * @returns {string}
 */
export function stripAutoFixSection(css = '') {
  const s = String(css);
  let out = '';
  let last = 0;
  for (const m of s.matchAll(AUTO_FIX_MARKER_RE)) {
    out += s.slice(last, m.index);
    let cut = m.index + m[0].length;
    let j = cut;
    while (j < s.length && /\s/.test(s[j])) j += 1;
    const open = s.indexOf('{', j);
    if (open > j) {
      const selector = s.slice(j, open);
      // 选择器不得跨行 / 含花括号：否则说明这条标记后面没有自己的规则块（只删标记）
      if (!/[\n{}]/.test(selector)) {
        let depth = 0;
        let k = open;
        for (; k < s.length; k += 1) {
          if (s[k] === '{') depth += 1;
          else if (s[k] === '}') {
            depth -= 1;
            if (depth === 0) { k += 1; break; }
          }
        }
        if (depth === 0) cut = k;
      }
    }
    last = cut;
  }
  out += s.slice(last);
  return out;
}

const STYLE_CLASS_TOKEN_RE = /\.(-?[A-Za-z_][\w-]*)/g;

/**
 * 🛡️ 刀 12（2026-09-13）：构建「设计意图样式源」的类名索引，供 R4 跨侧对齐判定。
 * - 覆盖 `.less` / `.css` 与各 `.vue` 的 `<style>` 块（子组件 scoped 样式块也算样式源）；
 * - **剥离 `[自动修复]` 兜底段**（见 stripAutoFixSection）；
 * - **同名 `.less` 存在的 `.css`（编译产物）不入索引**：内容是 `.less` 的派生，白算一遍；
 *   更要紧的是兜底 stub 经 LESS 展开后与标记注释的配对不再可靠（实测 `index.css` 里裸 stub
 *   规则带不上标记 → 剔除不掉 → 被当成设计意图 → 索引里出现 `c-x-tab` → 误判「已对齐」）。
 * @param {Object<string,string>} files 产物文件表
 * @returns {{ exact: Set<string>, bases: Map<string,string> }}
 *          exact = 样式侧出现过的类名（小写）；bases = 无修饰符 `c-*` 基名（小写 → 原样）
 */
export function buildStyleClassIndex(files = {}) {
  const exact = new Set();
  const bases = new Map();
  const absorb = (css) => {
    for (const m of stripAutoFixSection(css).matchAll(STYLE_CLASS_TOKEN_RE)) {
      const cls = m[1];
      if (!cls || cls.startsWith('-')) continue;
      const lower = cls.toLowerCase();
      exact.add(lower);
      if (/^c-/.test(lower) && !hasModifier(cls) && !bases.has(lower)) bases.set(lower, cls);
    }
  };
  for (const [p, c] of Object.entries(files || {})) {
    if (typeof c !== 'string') continue;
    if (/\.(less|css)$/i.test(p)) {
      if (/\.css$/i.test(p) && Object.prototype.hasOwnProperty.call(files, p.replace(/\.css$/i, '.less'))) {
        continue; // 编译产物：跳过（见 jsdoc）
      }
      absorb(c);
    } else if (/\.vue$/i.test(p)) {
      for (const m of c.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) absorb(m[1]);
    }
  }
  return { exact, bases };
}

/**
 * 🛡️ 刀 12（2026-09-13）：跨侧基名对齐的改写计划（R4）。
 *
 * 缺陷（实测 `mc-1789305950498-6a45b6f2`）：模板与样式源由两次独立 LLM 调用产出，
 * 同一元素落到两个不同基名上 —— 模板 `c-device-monitor-tab` / `--active`，
 * 样式 `.c-device-monitor-tab-item` / `.c-device-monitor-tab-item--active`。后果：
 *   ① 门禁 C3：模板修饰符类在样式侧无规则；
 *   ② 门禁 C4：样式的**真实激活态规则**无模板使用（7 条）；
 *   ③ 兜底 autoFix 只按 elementStyleMap 补「布局属性」stub 遮掉告警 ——
 *      背景色 / 圆角 / 内边距 / 字重等设计样式**永不生效**（「复测效果依旧很差」的真身）。
 * 判据（确定性 + 保守；样式侧承载真实设计 ⇒ 改写**模板侧**）：
 *   ① 元素基类在样式侧已有精确同名规则 → 视为已对齐，不动；
 *   ② 锚点 = 该元素上的修饰符后缀（R1/R2 归一后的形态）；**无锚点 → 不动**（防臆造）；
 *   ③ 候选样式基名 y：`c-*` 无修饰符、以 `${base}-` 开头（前缀扩展）、且**全部锚点修饰符
 *      形态**在样式侧均存在；
 *   ④ 候选**唯一**才改写（0 个 → 交门禁报警；≥2 个 → 歧义，不动）。
 * @param {string[]} tokens 元素类 token（**已过 R1/R2 归一**）
 * @param {{exact:Set<string>, bases:Map<string,string>}|null} styleIndex
 * @returns {Array<{from:string,to:string,rule:'R4'}>}
 */
export function planCrossSideBaseAlignment(tokens = [], styleIndex = null) {
  if (!styleIndex?.exact?.size) return [];
  const base = pickElementBaseToken(tokens);
  if (!base) return [];
  const baseLower = base.toLowerCase();
  // ① 样式侧已有同名基类 → 已对齐
  if (styleIndex.exact.has(baseLower)) return [];
  // ② 锚点：该元素上的修饰符后缀
  const mods = [];
  for (const t of tokens) {
    if (t === base) continue;
    if (isAliasModifierToken(t)) {
      mods.push(normalizeModifierSuffix(t.replace(/^is-/, '')));
      continue;
    }
    const { base: b, suffix } = splitModifier(t);
    if (b === base && suffix) mods.push(normalizeModifierSuffix(suffix));
  }
  if (mods.length === 0) return [];
  const uniqMods = [...new Set(mods)];
  // ③④ 唯一候选
  const cands = [];
  for (const [yLower, y] of styleIndex.bases) {
    if (yLower === baseLower) continue;
    if (!yLower.startsWith(`${baseLower}-`)) continue;
    if (tokens.some((t) => t.toLowerCase() === yLower)) continue; // 目标已在模板上 → 非替换目标
    if (!uniqMods.every((m) => styleIndex.exact.has(`${yLower}${m}`))) continue;
    cands.push(y);
  }
  if (cands.length !== 1) return [];
  const y = cands[0];
  const plan = [];
  const push = (t) => {
    const { suffix } = splitModifier(t);
    const target = `${y}${suffix}`;
    if (target !== t) plan.push({ from: t, to: target, rule: 'R4' });
  };
  push(base);
  for (const t of tokens) {
    const { base: b, suffix } = splitModifier(t);
    if (b === base && suffix) push(t);
  }
  const seen = new Set();
  return plan
    .filter((p) => (seen.has(p.from) ? false : (seen.add(p.from), true)))
    .sort((a, b) => b.from.length - a.from.length); // 长 token 优先，避免前缀 token 先替换干扰
}

/**
 * 计算某元素的「基类 token」（规范化后修饰符应挂在它上面）。
 * 优先级：① 带实例前缀的 DOM 长形（`c-{sem}-{id}-c-...`）② 最长 c-* 非修饰符 token。
 * @param {string[]} tokens 元素全部类 token（原样）
 * @returns {string} 基类 token；找不到返回 ''
 */
export function pickElementBaseToken(tokens = []) {
  const cands = tokens.filter(
    (t) => /^c-/.test(t) && !isAliasModifierToken(t) && splitModifier(t).suffix === '',
  );
  if (cands.length === 0) return '';
  const prefixed = cands.filter((t) => t.toLowerCase().includes('-c-'));
  const pool = prefixed.length > 0 ? prefixed : cands;
  return [...pool].sort((a, b) => b.length - a.length)[0];
}

/** 用边界安全的正则替换单个 token（同一行内其它同名 token 一并替换） */
function replaceToken(line = '', from = '', to = '') {
  if (!from) return line;
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return line.replace(new RegExp(`(?<![\\w-])${esc}(?![\\w-])`, 'g'), to);
}

/** 元素上是否需要改写的修饰符 token 计划 */
function planModifierRewrites(tokens = []) {
  const base = pickElementBaseToken(tokens);
  if (!base) return [];
  const plan = [];
  for (const t of tokens) {
    const { suffix } = splitModifier(t);
    const alias = isAliasModifierToken(t);
    if (!suffix && !alias) continue;
    const mod = alias ? normalizeModifierSuffix(t.replace(/^is-/, '')) : normalizeModifierSuffix(suffix);
    const target = `${base}${mod}`;
    if (target !== t) plan.push({ from: t, to: target });
  }
  // 去重（同 from 只保留一条）
  const seen = new Set();
  return plan.filter((p) => (seen.has(p.from) ? false : (seen.add(p.from), true)));
}

/** 应用改写计划到模板文本（逐元素、逐 token 精确替换） */
function applyPlanToTag(rawTag = '', plan = []) {
  let out = rawTag;
  for (const { from, to } of plan) out = replaceToken(out, from, to);
  return out;
}

/**
 * 规范化模板区：元素级 R1/R2（元素内部对齐）+ R4（跨侧基名对齐）。
 * @param {string} templateBody 模板区文本
 * @param {{exact:Set<string>,bases:Map<string,string>}|null} [styleIndex]
 *        样式源类名索引（buildStyleClassIndex 产出）；缺省则只做 R1/R2。
 * @returns {{ text: string, changes: Array<{from:string,to:string,rule?:string}> }}
 */
export function normalizeTemplateModifierDialect(templateBody = '', styleIndex = null) {
  const changes = [];
  let text = String(templateBody);
  text = text.replace(TAG_RE, (rawTag, _tag, attrs) => {
    if (!/class/.test(attrs)) return rawTag;
    const { static: statics, dynamic: dynamics } = extractClassAttrs(attrs);
    const tokens = [];
    // 🛡️ 刀 12b：与 classFacts 共用同一 token 采集实现（对象字面量只取键 / 遮表达式字面量）
    for (const s of statics) tokens.push(...extractClassTokensFromBindingValue(s.value));
    for (const d of dynamics) tokens.push(...extractClassTokensFromBindingValue(d.value));
    if (tokens.length === 0) return rawTag;
    // R1/R2 —— 同一元素内部（布尔方言归一 / 修饰符形态对齐）
    const plan = planModifierRewrites(tokens);
    // 🛡️ 刀 12 R4 —— 跨侧基名对齐。锚点判定必须基于**归一后**的类名
    const normalized =
      plan.length === 0
        ? tokens
        : tokens.map((t) => plan.find((p) => p.from === t)?.to || t);
    const crossPlan = planCrossSideBaseAlignment(normalized, styleIndex);
    const all = [...plan, ...crossPlan];
    if (all.length === 0) return rawTag;
    changes.push(...all);
    return applyPlanToTag(rawTag, all);
  });
  return { text, changes };
}

/**
 * 伪类「函数」——括号内是**另一个选择器**，其中的类名不是本元素的类。
 *
 * 反例（事故 mc-1789308308127-356073d1，2026-09-13）：
 *   `.c-device-monitor-switch-item:not(.is-active)` 里的 `is-active` 描述的是
 *   `:not()` 的**匹配对象**（非激活态元素），不是本元素的布尔别名。
 *   旧实现把它当「元素自身别名」做 R1 归一 → `:not(…)` 内容被 `__DROP__` 掏空 →
 *   产出 `.c-device-monitor-switch-item--active:not() {` —— **非法 LESS**
 *   （less: `Missing closing ')'`）→ STYLE_SYNTAX → P1-4 坏文件隔离降级 →
 *   子组件整块从产物消失 → COMP-001「模块组装缺失」BLOCK ×3 轮（不可达成，重试永不收敛）。
 */
const PSEUDO_SELECTOR_FN_RE = /:(?:not|is|where|has|matches|nth-child|nth-last-child|nth-of-type|nth-last-of-type|slotted)\s*\(/i;

/**
 * 求选择器里所有「伪类函数参数」的字符区间 `[start, end)`（内容区间，不含括号本身）。
 * 括号不配平时只返回已配平的区间；剩余内容按主体处理，由调用方配平守卫兜底。
 * @param {string} sel
 * @returns {Array<[number,number]>}
 */
function findPseudoArgRanges(sel = '') {
  const ranges = [];
  const re = new RegExp(PSEUDO_SELECTOR_FN_RE.source, 'gi');
  let m;
  while ((m = re.exec(sel))) {
    const open = re.lastIndex - 1;
    let depth = 0;
    let end = -1;
    for (let j = open; j < sel.length; j += 1) {
      if (sel[j] === '(') depth += 1;
      else if (sel[j] === ')') {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) break;
    ranges.push([open + 1, end]);
    re.lastIndex = end + 1;
  }
  return ranges;
}

function inRanges(pos, ranges) {
  for (const [s, e] of ranges) {
    if (pos >= s && pos < e) return true;
  }
  return false;
}

function countChar(s = '', ch = '(') {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) if (s[i] === ch) n += 1;
  return n;
}

/**
 * 🛡️ 刀 13b（2026-09-13）：嵌套 `&` 形态的样式侧归一。
 *
 * 事故 mc-1789308308127-356073d1：`common.less` 里激活态写成
 *   `.c-device-monitor-switch-item { … &.is-active { … } &:not(.is-active) { … } }`
 * —— 行内只有 `&` + 别名，**基类在父块**，平铺逻辑看不见 → 归一不到 →
 * 模板已被 R1 改成 `--active`，样式仍 `&.is-active` → 规则永不命中
 * （主题变量版激活态成死样式）+ 契约层 C4、12 项。
 *
 * 治本：用父选择器栈（less-selector-stack 单一事实源）解析出父基类后改写：
 *   - `&.is-active`      → `&--active`（Less 的 `&` 拼接，编译为 `.base--active`）
 *   - `&:not(.is-active)` → `&:not(.base--active)`（`:not()` 参数须用**绝对类名**）
 *
 * 保守：父基类解析不出 → 不动；token 既非别名也无修饰符 → 不动；括号失衡 → 不动。
 *
 * @returns {{text:string, changes:Array<{from:string,to:string}>}|null} null = 本行不适用
 */
function normalizeNestedAmpSelector(line, selector, parent) {
  if (!selector.includes('&') || !parent) return null;
  const parentTokens = [...parent.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
  const base = pickElementBaseToken(parentTokens);
  if (!base) return null;

  const changes = [];
  const modOf = (tok) => {
    const alias = isAliasModifierToken(tok);
    if (!alias && !hasModifier(tok)) return '';
    return normalizeModifierSuffix(alias ? tok.replace(/^is-/, '') : splitModifier(tok).suffix);
  };

  // 形态 A：`&.<token>` → `&<mod>`（Less `&` 拼接，编译后即 `.base<mod>`）
  let out = line.replace(/(&)\.([A-Za-z_][\w-]*)/g, (m, amp, tok) => {
    const mod = modOf(tok);
    if (!mod) return m;
    changes.push({ from: tok, to: `${base}${mod}` });
    return `${amp}${mod}`;
  });
  // 形态 B：`&:not(.<token>)` / `:is` / `:where` → 参数换绝对类名（`:not(&)` 非法）
  out = out.replace(
    /(&:(?:not|is|where)\s*\(\s*)\.([A-Za-z_][\w-]*)(\s*\))/gi,
    (m, head, tok, tail) => {
      const mod = modOf(tok);
      if (!mod) return m;
      changes.push({ from: tok, to: `${base}${mod}` });
      return `${head}.${base}${mod}${tail}`;
    },
  );

  if (out === line || changes.length === 0) return null;
  if (
    countChar(out, '(') !== countChar(line, '(') ||
    countChar(out, ')') !== countChar(line, ')')
  ) {
    return null;
  }
  return { text: out, changes };
}

/**
 * 规范化样式源：`.base.is-active` → `.base--active`（平铺）+ `&.is-active` → `&--active`（嵌套）。
 * 保守：仅当同一选择器里同时存在 c-* 基类与布尔别名时才改写。
 *
 * ⚠️ 伪类函数参数隔离（2026-09-13 治本）：`:not(…)` / `:is(…)` / `:where(…)` 等括号内的
 * 类名**不参与**「元素自身修饰符」判定（否则会被掏空成非法 `:not()`）。
 * ⚠️ 括号配平守卫（fail-safe）：改写后 `(`/`)` 计数必须与改写前一致，否则整行放弃。
 *
 * @param {string} css
 * @returns {{ text: string, changes: Array<{from:string,to:string}> }}
 */
export function normalizeStyleModifierDialect(css = '') {
  const changes = [];
  const raw = String(css);
  const lines = raw.split('\n');
  const parents = buildParentSelectorMap(raw);
  const out = lines.map((line, idx) => {
    const t = line.trim();
    if (!t.includes('{') && !/,\s*$/.test(t)) return line;
    const selector = t.replace(/\{.*$/, '').trim();
    if (!selector) return line;

    // ① 嵌套 `&` 形态（行内无基类，基类在父块）
    const nested = normalizeNestedAmpSelector(line, selector, parents[idx]);
    if (nested) {
      changes.push(...nested.changes);
      return nested.text;
    }

    // ② 平铺形态
    const argRanges = findPseudoArgRanges(selector);
    const allTokenHits = [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => ({
      name: m[1],
      pos: m.index,
    }));
    // 只有落在**主体**（非伪类参数）里的类名才算本元素的类
    const tokens = allTokenHits.filter((h) => !inRanges(h.pos, argRanges)).map((h) => h.name);
    const aliases = tokens.filter((tk) => isAliasModifierToken(tk));
    if (aliases.length === 0) return line;
    const base = pickElementBaseToken(tokens);
    if (!base) return line;
    // 逐 token 替换无法区分「主体 / 参数」内位置：同名 token 同时出现在参数里时整行跳过
    if (argRanges.length > 0) {
      for (const alias of aliases) {
        if (allTokenHits.some((h) => h.name === alias && inRanges(h.pos, argRanges))) {
          return line;
        }
      }
    }

    let newLine = line;
    const lineChanges = [];
    for (const alias of aliases) {
      const mod = normalizeModifierSuffix(alias.replace(/^is-/, ''));
      const target = `${base}${mod}`;
      // `.base.is-active` → `.base--active`（去掉 .alias，改基类为修饰符形态）
      newLine = replaceToken(newLine, alias, '__DROP__');
      newLine = newLine.replace(
        new RegExp(`\\.${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\.__DROP__`, 'g'),
        `.${target}`,
      );
      // 兜底：基类单独出现时直接替换为 target
      newLine = newLine.replace(
        new RegExp(`\\.${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![-\\w])`, 'g'),
        `.${target}`,
      );
      newLine = newLine.replace(/\.__DROP__/g, '');
      lineChanges.push({ from: alias, to: target });
    }
    // 括号配平守卫：失衡即非法 LESS（→ P1-4 隔离 → 子组件整块消失），宁可不动
    if (
      countChar(newLine, '(') !== countChar(line, '(') ||
      countChar(newLine, ')') !== countChar(line, ')')
    ) {
      return line;
    }
    changes.push(...lineChanges);
    return newLine;
  });
  return { text: out.join('\n'), changes };
}

/**
 * 主入口：规范化产物文件表（模板 + 样式）。**必须早于 classFacts 采集**。
 * R1/R2/R3 元素与文件内部对齐 + 🛡️刀 12 R4 跨侧（模板 ↔ 样式）基名对齐。
 * @param {Object<string,string>} files
 * @returns {{ files: Object<string,string>, changes: Array<{path:string,from:string,to:string,rule?:string}> }}
 */
export function normalizeClassNameDialect(files = {}) {
  const next = { ...files };
  const changes = [];
  // 🛡️ 刀 12：先建「设计意图样式源」类名索引（已剥离 [自动修复] 兜底段），
  // 供模板侧 R4 跨侧基名对齐使用。必须在改模板**之前**建索引（读的是同一份文件表）。
  const styleIndex = buildStyleClassIndex(files);
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (/\.vue$/i.test(p)) {
      const tplStart = c.search(/<template\b[^>]*>/i);
      if (tplStart < 0) continue;
      const rest = c.slice(tplStart);
      const endIdx = rest.search(/<script[\s>]|<style[\s>]/i);
      const tplEnd = endIdx > 0 ? tplStart + endIdx : c.length;
      const tplRegion = c.slice(tplStart, tplEnd);
      const tplRes = normalizeTemplateModifierDialect(tplRegion, styleIndex);
      let out = c.slice(0, tplStart) + tplRes.text + c.slice(tplEnd);
      // 样式块
      out = out.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (whole, body) => {
        const st = normalizeStyleModifierDialect(body);
        for (const ch of st.changes) changes.push({ path: p, ...ch });
        return whole.replace(body, st.text);
      });
      for (const ch of tplRes.changes) changes.push({ path: p, ...ch });
      next[p] = out;
    } else if (/\.(less|css)$/i.test(p)) {
      const st = normalizeStyleModifierDialect(c);
      for (const ch of st.changes) changes.push({ path: p, ...ch });
      next[p] = st.text;
    }
  }
  return { files: next, changes };
}
