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
 *
 * 保守边界（宁可不动，不可改错）：
 *   - 仅处理 `c-*` 组件类；不碰工具类 / 状态类以外的宿主类；
 *   - 元素上找不到「基类 token」时**不动**（交给门禁 C1 报警，避免臆造基名）；
 *   - 只改类 token，不触碰属性结构（逐 token 精确替换，带 `(?<![\w-])(?![\w-])` 边界）。
 *
 * jest 安全：无 import.meta。
 */

import { splitModifier, normalizeModifierSuffix, isAliasModifierToken } from './class-facts.js';

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

/** 拆分 class 属性值里的 token（静态空格拆分 / JS 字面量内的引号字符串） */
function tokensOfClassValue(value = '', isDynamic = false) {
  const tokens = [];
  if (isDynamic) {
    for (const m of value.matchAll(/["']([^"']+)["']/g)) {
      const t = m[1].trim();
      if (t && !/\s/.test(t)) tokens.push({ token: t, raw: `'${m[1]}'` });
    }
    return tokens;
  }
  for (const t of value.split(/\s+/)) if (t) tokens.push({ token: t, raw: t });
  return tokens;
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
 * 规范化模板区：元素级 R1/R2。
 * @param {string} templateBody 模板区文本
 * @returns {{ text: string, changes: Array<{from:string,to:string}> }}
 */
export function normalizeTemplateModifierDialect(templateBody = '') {
  const changes = [];
  let text = String(templateBody);
  text = text.replace(TAG_RE, (rawTag, _tag, attrs) => {
    if (!/class/.test(attrs)) return rawTag;
    const { static: statics, dynamic: dynamics } = extractClassAttrs(attrs);
    const tokens = [];
    for (const s of statics) for (const t of tokensOfClassValue(s.value, false)) tokens.push(t.token);
    for (const d of dynamics) for (const t of tokensOfClassValue(d.value, true)) tokens.push(t.token);
    if (tokens.length === 0) return rawTag;
    const plan = planModifierRewrites(tokens);
    if (plan.length === 0) return rawTag;
    changes.push(...plan);
    return applyPlanToTag(rawTag, plan);
  });
  return { text, changes };
}

/**
 * 规范化样式源：`.base.is-active` → `.base--active`。
 * 保守：仅当同一选择器里同时存在 c-* 基类与布尔别名时才改写。
 * @param {string} css
 * @returns {{ text: string, changes: Array<{from:string,to:string}> }}
 */
export function normalizeStyleModifierDialect(css = '') {
  const changes = [];
  const lines = String(css).split('\n');
  const out = lines.map((line) => {
    const t = line.trim();
    if (!t.includes('{') && !/,\s*$/.test(t)) return line;
    const selector = t.replace(/\{.*$/, '').trim();
    if (!selector) return line;
    const tokens = [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
    const aliases = tokens.filter((tk) => isAliasModifierToken(tk));
    if (aliases.length === 0) return line;
    const base = pickElementBaseToken(tokens);
    if (!base) return line;
    let newLine = line;
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
      changes.push({ from: alias, to: target });
    }
    return newLine;
  });
  return { text: out.join('\n'), changes };
}

/**
 * 主入口：规范化产物文件表（模板 + 样式）。**必须早于 classFacts 采集**。
 * @param {Object<string,string>} files
 * @returns {{ files: Object<string,string>, changes: Array<{path:string,from:string,to:string}> }}
 */
export function normalizeClassNameDialect(files = {}) {
  const next = { ...files };
  const changes = [];
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (/\.vue$/i.test(p)) {
      const tplStart = c.search(/<template\b[^>]*>/i);
      if (tplStart < 0) continue;
      const rest = c.slice(tplStart);
      const endIdx = rest.search(/<script[\s>]|<style[\s>]/i);
      const tplEnd = endIdx > 0 ? tplStart + endIdx : c.length;
      const tplRegion = c.slice(tplStart, tplEnd);
      const tplRes = normalizeTemplateModifierDialect(tplRegion);
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
