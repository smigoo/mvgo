/**
 * @file lite-subcomponent-splitter.js — Lite「单 SFC → 多子组件」确定性后处理（Phase 2）
 *
 * 背景：Lite 走「一次模型调用、一个 SFC 字符串」（maxTokens 16384 单次整体输出），
 * prompt / 解析 / validateLiteSfc / checkpoint 全链都只认一份 <template>/<script>/<style>。
 * 直接改 prompt 让模型输出多文件会拉长输出 ⇒ 截断概率上升 ⇒ 2026-11-11 刚根治的
 * LESS 红卡（分块在 `color:` 中间被切断）复发。故采用**确定性后处理**：
 * 模型输出不变，落盘时把模板里的「业务模块级纯静态块」切到 package/components/*.vue。
 *
 * 三条硬边界（改规则前必须重跑同名 spec）：
 *  ① 只拆**纯静态、业务模块级**块：无插值 / 无指令 / 无 ref / 无 id / 无 Vue 组件标签 /
 *     无宿主 base-panel；根 class 必须能推出语义名，且元素数 ≥4、原始字节 ≥200
 *     （真机 mc-lite-1794400267712-73394f4b 的 165B 徽标、mv-lite-1794400275965 的
 *      v-for 卡片 svg 图标 ⇒ 不再被拆成组件）。
 *     **静态块整体即最小粒度，不再下钻到它的叶子** —— 拆分维度从「任意层级静态叶子」
 *     改为「根 class 语义划分的业务模块」。脚本按 class/id 查询 DOM 时只跳过命中块及子树。
 *  ② 微码 Lite（<style lang="less"> 非 scoped）：业务样式在 resources/styles 全局注入 ⇒
 *     子组件不带 <style>。Vue3 Lite（<style scoped>）：父样式中**命中的顶层规则复制**进
 *     子组件自己的 scoped 样式；父规则原样保留（复制是叠加不是移动 ⇒ 不会丢样式），
 *     并用覆盖率判据钉死「块内每个在父样式里有规则的 class 都必须出现在子组件样式里」。
 *  ③ 达标块 ≥ 2 才拆；单 section 必须字节级原样返回（阴性对照）。
 *
 * 命名（Phase 2，对齐 max 的 HeaderSection/ContentSection）：从根 class 去掉全体候选的
 * 最长公共前缀后转 PascalCase + `Section` 后缀，如 `c-equipment-monitoring-header`
 * → `HeaderSection.vue`；同名块按出现序加 2/3。旧 v1 的 `LiteSectionN.vue` 仍可识别/清理。
 *
 * 产物校验用 validateVueScriptSyntax + @vue/compiler-sfc 真编译 template；scoped 子组件的
 * 纯 CSS 样式另用 compileStyle 真编译。任一文件不合法即整体放弃拆分 —— 不允许「拆完更差」。
 *
 * checkpoint 无需改动：续跑从原始 vueCode 重新抽样式、重新跑本确定性函数，结果幂等；
 * 不引入「原始 vueCode / 拆分后 files」两份真值。
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { parse as parseSfc, compileTemplate, compileStyle } from '@vue/compiler-sfc';
import { validateVueScriptSyntax, normalizeResourceRelativePaths } from './sfc-syntax-validation.js';

export const LITE_SPLIT_VERSION = 'lite-split.v2';
/** 本工具产物：v1 编号命名 + v2 语义命名。清理时还需父 import 佐证，绝不误删 max 的 components/*.vue */
export const LITE_SPLIT_FILE_RE = /^(?:LiteSection\d+|[A-Z][A-Za-z0-9]*Section\d*)\.vue$/;
export const LITE_SPLIT_COMPONENT_DIR = 'components';
/** 业务模块最小粒度：真机 165B 徽标（2 元素）、v-for 卡片里的 svg 图标（3 元素）都必须被挡 */
export const LITE_SPLIT_MIN_ELEMENTS = 4;
export const LITE_SPLIT_MIN_BYTES = 200;

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** 引号感知地找开始/结束标签的 '>'（属性值里可能出现 '>'） */
function findTagEnd(html, from) {
  let quote = '';
  for (let i = from + 1; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return i + 1;
  }
  return html.length;
}

/**
 * 极简 HTML tokenizer。只区分 start / end / comment / text / other，
 * 不做 DOM 语义解析 —— 拆块只需要「标签边界 + 属性原文」。
 */
function tokenize(html) {
  const tokens = [];
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      if (i < n) tokens.push({ type: 'text', start: i, end: n, raw: html.slice(i, n) });
      break;
    }
    if (lt > i) tokens.push({ type: 'text', start: i, end: lt, raw: html.slice(i, lt) });

    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4);
      const end = close < 0 ? n : close + 3;
      tokens.push({ type: 'comment', start: lt, end, raw: html.slice(lt, end) });
      i = end;
      continue;
    }
    if (html.startsWith('</', lt)) {
      const gt = html.indexOf('>', lt + 2);
      const end = gt < 0 ? n : gt + 1;
      const name = (html.slice(lt + 2, gt < 0 ? n : gt).trim().match(/^[^\s>]+/) || [''])[0].toLowerCase();
      tokens.push({ type: 'end', name, start: lt, end, raw: html.slice(lt, end) });
      i = end;
      continue;
    }

    const end = findTagEnd(html, lt);
    const raw = html.slice(lt, end);
    const m = raw.match(/^<\s*([A-Za-z][\w:.-]*)/);
    if (!m) {
      tokens.push({ type: 'other', start: lt, end, raw });
      i = end;
      continue;
    }
    const nameRaw = m[1];
    const name = nameRaw.toLowerCase();
    tokens.push({
      type: 'start',
      name,
      nameRaw,
      selfClosing: /\/\s*>$/.test(raw) || VOID_TAGS.has(name),
      start: lt,
      end,
      raw,
    });
    i = end;
  }
  return tokens;
}

/**
 * 取根 <template> 块（配对扫描，支持内部 `<template #slot>` 等嵌套 template）。
 * 🔴 不能用 `/<template>([\s\S]*?)<\/template>/`：非贪婪正则会在第一个嵌套
 * `</template>` 处截断，把插槽内容误当成模板尾部（真实 Lite 产物含 `#bodyCell` 插槽）。
 */
function extractRootTemplate(src) {
  const tokens = tokenize(src);
  const startIdx = tokens.findIndex((t) => t.type === 'start' && t.name === 'template');
  if (startIdx < 0) return null;
  let depth = 0;
  for (let i = startIdx; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'start' && t.name === 'template') depth++;
    else if (t.type === 'end' && t.name === 'template') {
      depth--;
      if (depth === 0) {
        return {
          start: tokens[startIdx].start,
          openTagEnd: tokens[startIdx].end,
          closeTagStart: t.start,
          body: src.slice(tokens[startIdx].end, t.start),
        };
      }
    }
  }
  return null;
}

/**
 * 取 html 中的顶层元素节点（文本/注释/自闭合 void 标签不属于节点，保持原位）。
 * balanced=false 表示模板标签不配对 —— 调用方必须放弃拆分。
 */
function scanTopLevelNodes(html) {
  const tokens = tokenize(html);
  const nodes = [];
  let depth = 0;
  let start = -1;
  let open = null;
  for (const t of tokens) {
    if (t.type === 'start' && !t.selfClosing) {
      if (depth === 0) {
        start = t.start;
        open = t;
      }
      depth++;
      continue;
    }
    if (t.type === 'end') {
      if (depth === 0) continue;
      depth--;
      if (depth === 0 && open) {
        nodes.push({
          start,
          end: t.end,
          raw: html.slice(start, t.end),
          name: open.name,
          nameRaw: open.nameRaw,
          openRaw: open.raw,
          openTagEnd: open.end,
          closeTagStart: t.start,
        });
        start = -1;
        open = null;
      }
    }
  }
  return { nodes, balanced: depth === 0 };
}

/** 判据可辩驳：spec/诊断脚本直接复用内部 tokenizer 与节点扫描，禁止另写一份正则 */
export const __testing = {
  tokenize, findTagEnd, scanTopLevelNodes, extractRootTemplate, collectStaticBlocks, validateSplitFile,
  collectClassTokens, rootClassToken, commonClassPrefix, semanticComponentName, isLiteSplitModuleBlock,
  parseTopLevelStyleRules, selectScopedStyleForBlock, extractStyleBlock,
};

/**
 * 硬否决标记：命中即**整块连同子树**都不参与拆分。
 * 🔴 单独抽出的原因：自适应下钻会钻进被判「非静态」的容器，
 * 若只把 id/ref/组件标签当作「本块不静态」，子块仍会被搬走 ⇒ 否决被绕过（spec 实测）。
 * id/ref 是 DOM 查询锚点、v-model 需要 emit、大写组件标签可能有隐式 props/事件。
 */
export function hasHardUnsafeMarker(raw = '') {
  const text = String(raw || '');
  if (/(?:^|\s)(?:id|ref)\s*=\s*["']/i.test(text)) return true;
  if (/\bv-model\b/.test(text)) return true;
  for (const t of tokenize(text)) {
    if (t.type === 'start' && /^[A-Z]/.test(t.nameRaw || '')) return true;
  }
  return false;
}

/**
 * 只看**节点自身开标签**的硬否决：用于决定「是否允许下钻这个容器」。
 * 🔴 不能用整块全文判：父容器会因子孙里出现 id / 大写组件而被整页否决
 * （真机回放实测：一个 `id="stats"` 让 base-panel→content 整链被跳过）。
 */
export function hasHardUnsafeTag(openRaw = '') {
  const text = String(openRaw || '');
  if (/(?:^|\s)(?:id|ref)\s*=\s*["']/i.test(text)) return true;
  if (/\bv-model\b/.test(text)) return true;
  if (/^<\s*[A-Z]/.test(text)) return true;
  return false;
}

/** 静态块判据：单一事实源，spec 的阳性/阴性样本直接喂这个函数 */
export function isLiteSplitStaticBlock(raw = '') {
  const text = String(raw || '');
  if (text.trim().length < 40) return false;
  if (text.split('\n').length < 2) return false;
  if (text.includes('{{')) return false;
  // 结构块/组件块不得外搬：脚本可能依赖 slot、宿主面板、动态组件
  if (/<\s*(?:script|style|template|slot|component|transition|keepalive|teleport|suspense)\b/i.test(text)) return false;
  if (/<\s*base-panel\b/i.test(text)) return false;
  // 相对资源之外的 Vue 指令（v-xxx / :xxx / @xxx / #xxx）
  if (/(?:^|\s)(?:v-[\w:.-]+|[:@#][\w:.-]+)(?:\s|=|\/|>)/.test(text)) return false;
  return !hasHardUnsafeMarker(text);
}

/* ─────────────── Phase 2：语义命名 / 业务模块维度 ─────────────── */

/** 收集 HTML 片段里出现的所有 class token（命名与样式迁移共用同一事实源） */
export function collectClassTokens(raw = '') {
  const out = new Set();
  for (const m of String(raw || '').matchAll(/\bclass\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    for (const t of String(m[2] || '').split(/\s+/)) if (t) out.add(t);
  }
  return [...out];
}

/** 取根元素开标签的第一个 class token（语义名的来源） */
export function rootClassToken(raw = '') {
  const m = String(raw || '').match(/^\s*<[A-Za-z][\w:.-]*\b[^>]*?\bclass\s*=\s*(["'])([\s\S]*?)\1/i);
  return m ? String(m[2] || '').trim().split(/\s+/)[0] || '' : '';
}

/** 全体候选 class 的最长公共前缀（按 '-' 分段，至少一段；用于剥掉组件名前缀） */
export function commonClassPrefix(classes = []) {
  const parts = classes.filter(Boolean).map((c) => String(c).split('-'));
  if (!parts.length) return '';
  const first = parts[0];
  let n = 0;
  // 至少保留最后一段给语义词，故上限 first.length - 1
  for (; n < first.length - 1; n++) {
    if (!parts.every((p) => p.length > n && p[n] === first[n])) break;
  }
  return n > 0 ? `${first.slice(0, n).join('-')}-` : '';
}

/** 语义组件名：剥公共前缀 → PascalCase → Section 后缀；重名按出现序加 2/3 */
export function semanticComponentName(rootClass = '', prefix = '', used = new Set(), fallbackIndex = 1) {
  const raw = String(rootClass || '');
  const rest = prefix && raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  const words = rest.split(/[^A-Za-z0-9]+/).filter(Boolean).slice(0, 3);
  const pascal = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  const stem = /^[A-Z][A-Za-z0-9]*$/.test(pascal) ? `${pascal}Section` : `Section${fallbackIndex}`;
  let name = stem;
  let n = 2;
  while (used.has(name)) name = `${stem}${n++}`;
  used.add(name);
  return name;
}

/**
 * 业务模块门槛（拆分维度）：根 class 可命名 + 元素数 ≥4 + 原始字节 ≥200。
 * 🔴 真机 mc-lite-1794400267712-73394f4b 的 165B 徽标（2 元素）、mv-lite-1794400275965
 *    里 v-for 卡片的 svg 图标容器（3 元素）都必须被挡；header / stat-body / overview
 *    这类 ≥4 元素的完整业务模块才允许成为子组件。
 */
export function isLiteSplitModuleBlock(raw = '') {
  const text = String(raw || '');
  if (text.length < LITE_SPLIT_MIN_BYTES) return false;
  if (tokenize(text).filter((t) => t.type === 'start').length < LITE_SPLIT_MIN_ELEMENTS) return false;
  return rootClassToken(text).length > 0;
}

/* ─────────────── Phase 2：scoped 样式随块迁移 ─────────────── */

function selectorClasses(selector = '') {
  return [...String(selector).matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
}

/**
 * 解析顶层 CSS 规则（注释/引号感知、大括号配对）。
 * complex=true 表示存在嵌套规则 / at-rule 块 / 括号不配对 ⇒ 调用方整份复制，不切分。
 */
export function parseTopLevelStyleRules(css = '') {
  const text = String(css || '');
  const rules = [];
  const globals = [];
  let complex = false;
  let buf = '';
  let pendingSelector = '';
  let depth = 0;
  let quote = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      buf += text.slice(i, stop);
      i = stop;
      continue;
    }
    const ch = text[i];
    if (quote) {
      buf += ch;
      if (ch === quote) quote = '';
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      i++;
      continue;
    }
    if (ch === '{') {
      if (depth > 0) {
        complex = true;
      } else {
        // 🔴 selector 只取「真实遇到的 { 之前」的文本。注释里的 { 在注释分支里
        //    作为普通文本追加，不会触发这里 ⇒ 不会把 `/* 注释 */` 误当选择器截断。
        pendingSelector = buf;
        buf = '';
      }
      depth++;
      buf += ch;
      i++;
      continue;
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1);
      buf += ch;
      if (depth === 0) {
        const selector = pendingSelector.trim();
        if (/^@(media|supports|keyframes|font-face|container|layer)\b/i.test(selector)) complex = true;
        rules.push({ selector, raw: pendingSelector + buf, classes: selectorClasses(selector) });
        buf = '';
        pendingSelector = '';
      }
      i++;
      continue;
    }
    if (depth === 0 && ch === ';' && /@(?:import|use|plugin|charset)\b|^\s*@[\w-]+\s*:/.test(buf)) {
      buf += ch;
      globals.push(buf);
      buf = '';
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  if (buf.trim()) globals.push(buf);
  if (depth !== 0) complex = true;
  return { rules, globals, complex };
}

/**
 * 为某个块挑出父 scoped 样式里命中的顶层规则（**复制，不移动**）。
 * missing 非空 ⇒ 会丢样式，调用方必须整体放弃拆分（可辩驳判据，不是尽力而为）。
 */
export function selectScopedStyleForBlock(parsed, blockRaw = '') {
  const blockClasses = collectClassTokens(blockRaw);
  const classSet = new Set(blockClasses);
  const selected = (parsed.rules || []).filter((r) => (r.classes || []).some((c) => classSet.has(c)));
  const parentHas = new Set((parsed.rules || []).flatMap((r) => r.classes || []));
  const copiedHas = new Set(selected.flatMap((r) => r.classes || []));
  const missing = blockClasses.filter((c) => parentHas.has(c) && !copiedHas.has(c));
  const css = `${(parsed.globals || []).join('')}${selected.map((r) => r.raw).join('')}`;
  return { css, blockClasses, missing, complex: !!parsed.complex };
}

/** 取 <style ...> 块的开标签属性与内容（配对扫描，style 内不含 </style>） */
export function extractStyleBlock(src = '') {
  const m = String(src || '').match(/<style\b([^>]*)>([\s\S]*?)<\/style>/i);
  return m ? { attrs: String(m[1] || ''), content: String(m[2] || ''), raw: m[0] } : null;
}

/**
 * 自适应收集静态块：真实 Lite 的顶层 section 常带 `:style` / `@click` / `{{ }}`，
 * 只扫一层会得到「静态块 0~1 个」⇒ 永远拆不了。故对**非静态容器**继续下钻，
 * 收集其内部纯静态子块；静态块整体作为候选、不再下钻（避免父子重叠）。
 * 唯一顶层节点一律视为包装层强制下钻（`<base-panel> → div.content → sections`）。
 */
function collectStaticBlocks(templateBody, topNodes, stats, options = {}) {
  const picked = [];
  let visited = 0;
  const visit = (html, absOffset, nodes, depth, underDynamicList = false) => {
    // 包装链 `<base-panel> → div.content → section → 内层块` 最多 4 跳；
    // 超过即视为碎片，不再拆（避免把单个 span 也搬成组件）。
    if (depth > 4) return;
    const wrapperOnly = nodes.length === 1;
    for (const n of nodes) {
      visited++;
      // 🔴 拆分维度：`v-for` 列表项内部不拆 —— 列表项本身才是重复单元，
      //    把其中的图标/文本碎块抽成组件不符合开发习惯（真机 mv-lite-…-ea99d36f
      //    的 `equipment-monitor-card-icon` 原本会被拆成 CardIconSection.vue）。
      const listCtx = underDynamicList || /\bv-for\b/.test(n.openRaw);
      // 硬否决只看开标签：命中则该块连同子树跳过，防止「本块不静态、子块却被搬走」绕过判据
      if (hasHardUnsafeTag(n.openRaw)) continue;
      // 🔴 脚本按 class/id 反查 DOM：命中则该块连同子树跳过（与硬否决同口径，防下钻绕过）
      if (options.domSelectors?.length && blockMatchesDomSelector(n.raw, options.domSelectors)) continue;
      const absStart = absOffset + n.start;
      const absEnd = absOffset + n.end;
      if (!wrapperOnly && isLiteSplitStaticBlock(n.raw)) {
        // 🔴 静态块整体即最小粒度，不再下钻到它的叶子；
        //    只有「业务模块级」（语义 class + ≥4 元素 + ≥200B，且不在 v-for 内）才作为候选。
        if (!listCtx && isLiteSplitModuleBlock(n.raw)) picked.push({ absStart, absEnd, raw: n.raw, depth });
        continue;
      }
      const innerHtml = html.slice(n.openTagEnd, n.closeTagStart);
      const inner = scanTopLevelNodes(innerHtml);
      if (inner.balanced && inner.nodes.length) {
        visit(innerHtml, absOffset + n.openTagEnd, inner.nodes, depth + 1, listCtx);
      }
    }
  };
  visit(templateBody, 0, topNodes, 0);
  stats.candidates = visited;
  stats.skipped = visited - picked.length;
  return picked;
}

/**
 * 脚本 DOM 判据（单一事实源）：待拆的块是「纯静态、无 id/ref/指令」的，父脚本的变量
 * 绑定不可能落在块内；唯一风险是脚本按 class/id 反查这些 DOM。故把原先的「出现 DOM
 * API 就整份不拆」精确化为三层：
 *   - hardUnsafe：$refs / useTemplateRef / defineExpose —— 无法静态定位，整份不拆；
 *   - opaque：选择器是变量、标签选择器或有未识别调用 —— 保守整份不拆；
 *   - selectors：字面量 class/id 选择器 token —— 交给 collectStaticBlocks 按块跳过。
 * echarts.init / ResizeObserver 通过模板 ref 取节点，而含 ref 的块已被静态块判据排除，
 * 不再因「脚本里出现过」就否决整页（真机 mc-lite-1794398124528-997fd90f 可拆 11 块）。
 */
export function collectScriptDomSelectors(script = '') {
  const text = String(script || '');
  const hardUnsafe = /\b(?:useTemplateRef|defineExpose)\b/.test(text) || /\$refs\b/.test(text);
  const callRx = /\b(?:querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName)\s*\(/g;
  const literalRx = /\b(querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName)\s*\(\s*(['"`])([^'"`]*)\2\s*\)/g;
  const totalCalls = (text.match(callRx) || []).length;
  const tokens = new Set();
  let opaque = false;
  let matched = 0;
  for (const m of text.matchAll(literalRx)) {
    matched++;
    const fn = m[1];
    const sel = String(m[3] || '').trim();
    if (fn === 'getElementsByTagName') { opaque = true; continue; }
    if (fn === 'getElementById') {
      const t = sel.replace(/[^\w-]/g, '');
      if (t) tokens.add(t);
      continue;
    }
    if (fn === 'getElementsByClassName') {
      for (const part of sel.split(/\s+/)) {
        const t = part.replace(/[^\w-]/g, '');
        if (t) tokens.add(t);
      }
      continue;
    }
    // querySelector(All)：只接受以 . / # 开头的字面量选择器；标签选择器 / 复杂组合无法静态归一
    if (!/^[.#]/.test(sel)) { opaque = true; continue; }
    for (const hit of sel.matchAll(/[.#]([\w-]+)/g)) tokens.add(hit[1]);
  }
  if (totalCalls > matched) opaque = true; // 存在变量参数或无法识别的调用形态
  return { hardUnsafe, opaque, selectors: [...tokens] };
}

/** 块是否落在脚本按 class/id 反查的范围内（命中则该块连同子树跳过） */
export function blockMatchesDomSelector(raw = '', selectors = []) {
  const text = String(raw || '');
  for (const s of selectors || []) {
    const token = String(s).replace(/[^\w-]/g, '');
    if (!token) continue;
    if (new RegExp(`(?:class|id)\\s*=\\s*["'][^"']*\\b${token}\\b`, 'i').test(text)) return true;
  }
  return false;
}

/** 脚本硬判据：只拦「无法静态定位的 DOM 暴露」，与 collectScriptDomSelectors 同源 */
export function isLiteSplitSafeScript(script = '') {
  return !collectScriptDomSelectors(script).hardUnsafe;
}

/**
 * 拆分产物终验：只校验**被改动**的 template / script。
 * 🔴 不复用 validateVueSfc 整文件校验：它会编译 `<style lang="less">`，而相对
 * `@import '../resources/styles/index.less'` 在内存阶段被剥离 ⇒ `@fontSize` 假阳性
 * 「undefined」（真机 mc-lite-1793918463647-67cd38d8 实测）。style 由拆分器逐字节保留，
 * 其可编译性是既有 compileIndexCssStrict / ensureLiteStylesCompilable 的职责，不在此重复判。
 */
function validateSplitFile(content, rel) {
  const script = validateVueScriptSyntax(content, rel);
  if (!script.valid) return script.errors;
  let descriptor;
  try {
    const parsed = parseSfc(content, { filename: rel });
    if (parsed.errors && parsed.errors.length) return parsed.errors.map((e) => String(e.message || e));
    descriptor = parsed.descriptor;
  } catch (error) {
    return [String(error?.message || error)];
  }
  if (!descriptor?.template) return ['缺少 <template> 块'];
  try {
    const compiled = compileTemplate({
      source: descriptor.template.content,
      filename: rel,
      id: 'lite-split',
    });
    const errors = (compiled.errors || []).map((e) => String(e?.message || e));
    if (errors.length) return errors;
  } catch (error) {
    return [String(error?.message || error)];
  }
  // 🔴 scoped 子组件自带样式：纯 CSS 用 compileStyle 真编译（含 data-v 作用域变换）。
  //    LESS/SCSS 不在此编译：相对 @import 在内存阶段会假阳性，归落盘后的样式终验管。
  for (const block of descriptor.styles || []) {
    if (block.lang && block.lang !== 'css') continue;
    try {
      const out = compileStyle({
        source: block.content,
        filename: rel,
        id: 'lite-split',
        scoped: !!block.scoped,
      });
      const errs = (out.errors || []).map((e) => String(e?.message || e));
      if (errs.length) return errs;
    } catch (error) {
      return [String(error?.message || error)];
    }
  }
  return [];
}

function noChange(source, reason, stats) {
  return {
    version: LITE_SPLIT_VERSION,
    changed: false,
    reason,
    files: { 'package/index.vue': source },
    stats,
    audit: { originalSource: source, injectedImports: '', blocks: [] },
  };
}

/**
 * 纯函数：单 SFC → files map。
 * @param {string} source package/index.vue 内容（已抽样式、含 <style lang="less"> 的版本）
 * @returns {{version,changed,reason,files:Object<string,string>,stats,audit}}
 */
export function splitLiteSfcIntoSubcomponents(source = '') {
  const src = String(source || '');
  const stats = { topLevel: 0, candidates: 0, staticBlocks: 0, split: 0, skipped: 0 };
  if (!src.trim()) return noChange(src, 'empty', stats);
  // 🔴 幂等判据不依赖命名：父已 import 任意 `./components/*.vue` 就说明它是多子组件产物
  //    （Lite v1 编号 / v2 语义名 / max 的 HeaderStats.vue 等），一律不再拆。
  //    scoped 放开后 max 产物也会进入本函数，若只认自家命名会二次拆分（真机回放
  //    c-device-monitor-l0rxb0x4-c34eb871 实测命中）。
  if (/from\s+['"]\.\/components\/[A-Za-z0-9_.-]+\.vue['"]/.test(src)) {
    return noChange(src, 'already-split', stats);
  }

  const tpl = extractRootTemplate(src);
  if (!tpl) return noChange(src, 'no-template', stats);
  const templateBody = tpl.body;

  // 🔴 样式通道（Phase 2）：
  //   - 微码 Lite `<style lang="less">` 非 scoped：样式由 resources/styles 全局注入 ⇒ 子组件不带 style；
  //   - Vue3 Lite `<style scoped>`：把命中的顶层规则**复制**进子组件自己的 scoped 样式，
  //     父规则原样保留。父 data-v 覆盖不到子组件；复制的规则经 compileStyle 变成子组件 data-v ⇒ 生效。
  //     复杂形态（嵌套 / @media 块 / 括号不配对）整份复制，宁可冗余不可丢样式。
  const styleBlock = extractStyleBlock(src);
  const scoped = !!styleBlock && /\bscoped\b/.test(styleBlock.attrs);
  let styleParser = null;
  if (scoped) {
    const parsed = parseTopLevelStyleRules(styleBlock.content);
    styleParser = (parsed.complex || !parsed.rules.length)
      ? { ...parsed, complex: true, rules: [], globals: [] }
      : parsed;
  }

  const scriptMatch = src.match(/<script\b([^>]*)>([\s\S]*?)<\/script>/i);
  if (!scriptMatch || !/\bsetup\b/.test(scriptMatch[1])) return noChange(src, 'script-not-setup', stats);
  const scriptBody = scriptMatch[2];
  const dom = collectScriptDomSelectors(scriptBody);
  // 硬否决（$refs / useTemplateRef / defineExpose）与无法定位的选择器：保守整份不拆。
  // 其余字面量 class/id 选择器降级为「按块跳过」，不再因脚本出现 echarts/ResizeObserver
  // 就否决整页（真机 mc-lite-1794398124528-997fd90f 原本 11 个静态块全被挡）。
  if (!isLiteSplitSafeScript(scriptBody) || dom.opaque) return noChange(src, 'script-dom-api', stats);
  // 脚本里若已声明同名组件（避免重复声明 / 覆盖）
  if (/\bLiteSection\d+\b/.test(scriptBody)) return noChange(src, 'name-collision', stats);

  const top = scanTopLevelNodes(templateBody);
  if (!top.balanced) return noChange(src, 'unbalanced-template', stats);

  // 收集所有层级（深度 ≤ 2）的纯静态块；下标已换算为 templateBody 绝对坐标，
  // 因此可以直接从后往前替换，包装层原样保留、无需逐层拼回。
  stats.topLevel = top.nodes.length;
  const picked = collectStaticBlocks(templateBody, top.nodes, stats, { domSelectors: dom.selectors });
  stats.staticBlocks = picked.length;
  if (picked.length < 2) {
    return noChange(src, stats.candidates <= 2 ? 'single-section' : 'insufficient-static-blocks', stats);
  }

  // 🔴 语义命名（Phase 2）：先按模板字节序正向排序，再剥全体候选根 class 的最长公共前缀。
  //    同一 class 的多个块（如两张统计卡的数据区）按出现序加 2/3，对齐 max 的 ContentSection3。
  const forward = [...picked].sort((a, b) => a.absStart - b.absStart);
  const prefix = commonClassPrefix(forward.map((n) => rootClassToken(n.raw)));
  const usedNames = new Set();
  const named = forward.map((n, idx) => ({
    ...n,
    name: semanticComponentName(rootClassToken(n.raw), prefix, usedNames, idx + 1),
  }));

  // 从后往前替换，避免索引漂移
  const ordered = [...named].sort((a, b) => b.absStart - a.absStart);
  const replacements = [];
  let newTemplateBody = templateBody;
  for (const node of ordered) {
    const tag = `<${node.name} />`;
    const rel = `package/${LITE_SPLIT_COMPONENT_DIR}/${node.name}.vue`;
    replacements.unshift({ name: node.name, tag, rel, raw: node.raw });
    newTemplateBody = `${newTemplateBody.slice(0, node.absStart)}${tag}${newTemplateBody.slice(node.absEnd)}`;
  }

  const newTemplate = `${src.slice(0, tpl.openTagEnd)}${newTemplateBody}${src.slice(tpl.closeTagStart)}`;

  // import 注入到 <script setup> 开标签之后；保持其余内容逐字节不变
  const injectedImports = replacements
    .map((r) => `import ${r.name} from './${LITE_SPLIT_COMPONENT_DIR}/${r.name}.vue'`)
    .join('\n');
  const scriptOpenTag = scriptMatch[0].slice(0, scriptMatch[0].indexOf('>') + 1);
  const parent = newTemplate.replace(scriptOpenTag, `${scriptOpenTag}\n${injectedImports}`);

  const files = { 'package/index.vue': parent };
  for (const r of replacements) {
    // 资源相对路径按新文件层级归一（后端/前端同款单一判据，见 sfc-syntax-validation.js:82）
    const block = normalizeResourceRelativePaths(r.raw, r.rel);
    let styleText = '';
    if (scoped) {
      const selected = styleParser.complex
        ? { css: styleBlock.content, missing: [] }
        : selectScopedStyleForBlock(styleParser, r.raw);
      // 🔴 覆盖率判据：块内每个在父样式里有规则的 class 都必须出现在复制结果里；
      //    且至少要复制到一条规则。任一不满足 ⇒ 整体放弃，绝不发布「样式静默丢失」的拆分产物。
      if (selected.missing.length) {
        stats.styleMissing = selected.missing.slice(0, 5);
        return noChange(src, 'style-migration-incomplete', stats);
      }
      if (!String(selected.css).trim()) return noChange(src, 'style-migration-empty', stats);
      const attrs = String(styleBlock.attrs || '').trim();
      const css = normalizeResourceRelativePaths(selected.css, r.rel);
      styleText = `\n<style${attrs ? ` ${attrs}` : ''}>\n${css}\n</style>\n`;
    }
    files[r.rel] = `<template>\n${block}\n</template>\n${styleText}`;
  }

  // 🔴 终验：任一文件过不了 template/script 真编译 ⇒ 整份放弃拆分（零回归硬保证）
  for (const [rel, content] of Object.entries(files)) {
    const errors = validateSplitFile(content, rel);
    if (errors.length) {
      stats.validationErrors = errors.slice(0, 3);
      return noChange(src, 'validation-failed', stats);
    }
  }

  stats.split = replacements.length;
  return {
    version: LITE_SPLIT_VERSION,
    changed: true,
    reason: 'ok',
    files,
    stats,
    // 判据用：把组件标签换回原块、删掉注入的 import，应当与输入逐字节一致
    audit: { originalSource: src, injectedImports, blocks: replacements.map((r) => ({ rel: r.rel, tag: r.tag, raw: r.raw })) },
  };
}

/**
 * 判据用「拼回」：验证拆分没有丢任何模板字节（比"语义等价"更强的可辩驳判据）。
 */
export function reassembleLiteSfc(result) {
  if (!result || !result.changed) return result?.audit?.originalSource ?? '';
  let parent = result.files['package/index.vue'];
  parent = parent.replace(`\n${result.audit.injectedImports}`, '');
  for (const b of result.audit.blocks) {
    // 子组件里的资源路径已按新层级归一；拼回父层级必须用 audit.raw（原始字节）
    parent = parent.replace(b.tag, () => b.raw);
  }
  return parent;
}

/**
 * I/O 接线（唯一写入点）：读已落盘的 package/index.vue → 拆分 → 写回父 + 子组件。
 * 主路径与 executeResumeFromCheckpoint 都调它；changed=false 时**不写任何文件**。
 * @returns {{changed:boolean,reason:string,stats:object}}
 */
export function applyLiteSubcomponentSplit(packageDir = '') {
  const entry = join(packageDir, 'index.vue');
  if (!existsSync(entry)) {
    return { changed: false, reason: 'no-entry', stats: {} };
  }
  const source = readFileSync(entry, 'utf-8');
  const result = splitLiteSfcIntoSubcomponents(source);
  const componentsDir = join(packageDir, LITE_SPLIT_COMPONENT_DIR);

  // 🔴 清理口径（Phase 2 修正）：keep 必须包含「父已经 import 的子组件」。
  //    旧实现 changed=false 时 keep=[]，已拆产物二次发布会把自己的子组件全删掉、
  //    父 import 悬空。只清本工具产物：v1 编号名，或 v2 语义名且父曾 import 过
  //    ⇒ max 管线的 HeaderSection.vue 等绝不会被误删。
  const importedNames = new Set(
    [...source.matchAll(/from\s+['"]\.\/components\/([A-Za-z0-9_]+\.vue)['"]/g)].map((m) => m[1]),
  );
  const producedNames = new Set(
    Object.keys(result.files)
      .filter((p) => p.startsWith(`package/${LITE_SPLIT_COMPONENT_DIR}/`))
      .map((p) => p.split('/').pop()),
  );
  const keep = new Set([...importedNames, ...producedNames]);
  if (existsSync(componentsDir)) {
    for (const name of readdirSync(componentsDir)) {
      const mine = /^LiteSection\d+\.vue$/.test(name) || (LITE_SPLIT_FILE_RE.test(name) && importedNames.has(name));
      if (!mine || keep.has(name)) continue;
      try { unlinkSync(join(componentsDir, name)); } catch { /* 只读文件系统等：不阻断 */ }
    }
  }

  if (!result.changed) return { changed: false, reason: result.reason, stats: result.stats };

  mkdirSync(componentsDir, { recursive: true });
  // 🔴 写入顺序：先写全部子组件，**最后**才改父 index.vue。
  // 中途 I/O 失败时父仍是原单文件（可用），不会留下「父引用了不存在的子组件」的半拆分态。
  for (const [rel, content] of Object.entries(result.files)) {
    if (rel === 'package/index.vue') continue;
    const name = rel.split('/').pop();
    writeFileSync(join(componentsDir, name), content, 'utf-8');
  }
  writeFileSync(entry, result.files['package/index.vue'], 'utf-8');
  return { changed: true, reason: result.reason, stats: result.stats };
}
