/**
 * 🛡️ layout-truth-healer.js —— Figma 真值驱动的布局/文案确定性纠偏（刀 28 / 刀 29）。
 *
 * 背景（2026-10-14 · mc-max-1791942831818-0397a327 / mc-max-1791944957047-cd63d1c5
 * 同一 Figma 节点连续两轮实锤）：LLM 对「固定卡片 + 填充列表」类版式稳定产出两类病——
 *   ① 兄弟 section 全写等分臆造比例（`flex:0.500`/`flex:0.500`）→ 固定卡撑满半屏成巨型卡；
 *   ② 文案槽位互换：14px 地址进了 18px 标题槽、`离线` 进了数值槽（`28` 进了标签槽）。
 * 逐产物手修不可持续 ⇒ 本模块在落盘前自愈链（pre-write-self-healing ④-f/④-g）以
 * Figma 真值 + 模板结构做确定性纠偏。命名无关、幂等、fail-open。
 *
 * 刀 28 normalizeSectionFlexTruth（比例真值）：
 *   判据（全部同时成立）：
 *     - 模板中带 `data-section-id` 的 div，inline style 含 `flex:<0<v<1>`（等分臆造信号）；
 *     - base sid（剥 `-list` 等后缀）在 Figma 树可解析，节点高 h>0；
 *     - 同批候选里「含 v-for 的子组件」与「不含」两类都存在（固定段 + 填充段配对）；
 *     - 固定段 sanity：h ≤ 0.35×最大候选高 或 h ≤ 160px（防两个固定段的健康版式误拆）。
 *   修复：v-for 宿主 div → `flex:1 1 0`（填充剩余）；固定段 → `flex:0 0 auto; height:<h>px`。
 *
 * 刀 29 normalizeTextSlotOrder（文案槽位）：
 *   判据（同父**相邻**兄弟对——between 仅空白；二者取一）：
 *     A 真值交叉：槽 a 的 CSS 字号 > 槽 b，但 a 文本在 Figma 的字号 < b 文本 ⇒ 对调；
 *     B 形态交叉：槽 a 的 CSS 字号 > 槽 b，且 a 文本纯 CJK、b 文本纯数字（含千分位）⇒ 对调。
 *   两个文本都必须是模板静态文本（无 `{{ }}`）；对调只交换两元素的内文。
 */

import { normalizeSectionLayout, isoBodyEntries } from './isomorphic-section-group.js';
import { SIBLING_ROW_TOLERANCE } from './row-metrics.js';
import { declaredColumns, parseDeclMap, inlineStyleOf } from './grid-list-layout-contract.js';

const CJK_RE = /^[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef·]+$/;
const DIGITS_RE = /^[\d,.\s]+$/;

/**
 * 提取 SFC 根 <template> 内文（深度感知）。lazy 正则 `/<template>([\s\S]*?)<\/template>/`
 * 会被根模板内的具名插槽 `<template #header-right>...</template>` 截断
 * （2026-10-14 实锤：base-panel 产物的 index.vue 根模板被截成只剩 header 插槽 94 字符，
 * 刀 28 候选永远收集不到 ⇒ 线上零命中）。返回 { tpl, tplStart } 或 null。
 */
export function extractRootTemplate(fc) {
  const m = /<template(?:\s[^>]*)?>/i.exec(fc);
  if (!m) return null;
  const start = m.index + m[0].length;
  const tokRe = /<template(?:\s[^>]*)?>|<\/template\s*>/gi;
  tokRe.lastIndex = start;
  let depth = 1;
  let t;
  while ((t = tokRe.exec(fc))) {
    depth += t[0][1] === '/' ? -1 : 1;
    if (depth === 0) return { tpl: fc.slice(start, t.index), tplStart: start };
  }
  return null;
}

/** 遍历 Figma 树，建 sid→节点（含父指针）、文本→字号 两张索引。 */
export function collectFigmaIndex(figmaRoot) {
  const nodeById = new Map();
  const textByChars = new Map();
  if (!figmaRoot || typeof figmaRoot !== 'object') {
    return { nodeById, textByChars };
  }
  const root = figmaRoot.document || figmaRoot;
  const walk = (node) => {
    if (!node || typeof node !== 'object' || !node.id) return;
    nodeById.set(node.id, node);
    if (node.type === 'TEXT' && typeof node.characters === 'string') {
      const chars = node.characters.trim();
      if (chars && !textByChars.has(chars)) {
        textByChars.set(chars, {
          fontSize: node.style?.fontSize ?? node.absoluteBoundingBox?.height ?? 0,
        });
      }
    }
    for (const c of node.children || []) walk(c);
  };
  walk(root);
  return { nodeById, textByChars };
}

/** 从样式源提取类的有效字号（px）：calc(@fontSize|var(--fontSize…) * X) → X*14；直写 Npx → N。 */
function extractFontPx(cls, styleSources) {
  const first = String(cls || '').trim().split(/\s+/)[0];
  if (!first) return 0;
  for (const src of styleSources) {
    if (typeof src !== 'string') continue;
    const esc = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 🔒 括号配对取完整块 + 嵌套掩码：扁平正则 `\.cls\{([^{}]*)\}` 对含嵌套子规则
    //   （如 `&.x-success {…}`）的块整体失明 → font-size 提取 0 → 大小序反转误判
    //   （2026-10-14 · c-device-monitor-1c3555ba 实锤：stat-value 含 & 嵌套提取 0，
    //   健康 label(14)/value(20) 版式被 truth 误判互换）
    const hm = new RegExp(`\\.${esc}\\s*\\{`).exec(src);
    if (!hm) continue;
    let depth = 1;
    let i = hm.index + hm[0].length;
    const bodyStart = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    if (depth !== 0) continue;
    // 嵌套掩码：子规则区域置等长空格，只看顶层声明（与刀 27 maskNested 同判据）
    const arr = src.slice(bodyStart, i - 1).split('');
    let d = 0;
    for (let j = 0; j < arr.length; j++) {
      if (arr[j] === '{') { d++; arr[j] = ' '; }
      else if (arr[j] === '}') { d--; arr[j] = ' '; }
      else if (d > 0) arr[j] = ' ';
    }
    const body = arr.join('');
    // 🔒 var() 内允许一层嵌套括号（生成器常写 fallback 链 `var(--fontSize, var(--fontSize))`，
    //   `[^)]*` 会在内层 `)` 提前闭合 → calc 提取失败返 0 → 大小序反转误判，
    //   2026-10-14 · c-device-monitor-hnhl49no 实锤）
    const VAR_RE = String.raw`var\(--fontSize(?:[^)(]|\([^()]*\))*\)`;
    const calc = body.match(
      new RegExp(
        `font-size\\s*:\\s*calc\\((?:@fontSize|${VAR_RE})\\s*\\*\\s*([\\d.]+)\\s*\\)`,
        'i',
      ),
    );
    if (calc) return parseFloat(calc[1]) * 14;
    const px = body.match(/font-size\s*:\s*([\d.]+)\s*px/i);
    if (px) return parseFloat(px[1]);
    // 裸写基准变量（无乘数）→ 基准 14px（2026-10-14 · 0397a327 实锤：
    // `font-size: @fontSize;` 直写形态此前提取为 0，大小序判据失明）；
    // 负向断言防 `@fontSize-large` 这类更长变量名误截
    const bare = body.match(
      new RegExp(`font-size\\s*:\\s*(?:@fontSize|${VAR_RE})(?![\\w-])`, 'i'),
    );
    if (bare) return 14;
  }
  return 0;
}

/**
 * 刀 28：兄弟 section 等分臆造 → 真值「固定 px + 填充 flex:1」。
 * @param {Record<string,string>} files 产物文件集
 * @param {{figmaRoot?:object}} ctx
 * @returns {{files:Record<string,string>, changes:Array<{file:string,count:number}>}}
 */
export function normalizeSectionFlexTruth(files, ctx = {}) {
  const changes = [];
  const out = { ...files };
  if (!ctx.figmaRoot) return { files: out, changes };
  const { nodeById } = collectFigmaIndex(ctx.figmaRoot);
  if (nodeById.size === 0) return { files: out, changes };

  for (const [fp, fc] of Object.entries(out)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const rt = extractRootTemplate(fc);
    if (!rt) continue;
    const { tpl, tplStart } = rt;

    // 收集候选：sid 化 div + 分数 flex（等分臆造信号）
    const tagRe = /<div\b[^>]*?data-section-id="([^"]+)"[^>]*?style="([^"]*)"[^>]*>/g;
    const cands = [];
    for (const m of tpl.matchAll(tagRe)) {
      const vM = m[2].match(/flex\s*:\s*(\d?(?:\.\d+)?)(?=[;\s])/);
      if (!vM) continue;
      const v = parseFloat(vM[1]);
      if (!(v > 0 && v < 1)) continue;
      const baseSid = m[1].split('-')[0];
      const node = nodeById.get(baseSid);
      const h = Math.round(node?.absoluteBoundingBox?.height || 0);
      if (!(h > 0)) continue;
      cands.push({
        sid: m[1],
        baseSid,
        h,
        tagStart: m.index,
        tagEnd: m.index + m[0].length,
      });
    }
    if (cands.length < 2) continue;

    // 解析每个候选的直接子组件 → 对应文件是否含 v-for
    for (const c of cands) {
      const after = tpl.slice(c.tagEnd, c.tagEnd + 600);
      const comp = after.match(/<([A-Z][\w]*)[\s/]/);
      c.hasVFor = false;
      if (comp) {
        const childFile = Object.keys(out).find((p) =>
          p.endsWith(`/components/${comp[1]}.vue`),
        );
        c.hasVFor = !!(childFile && /\bv-for\b/.test(out[childFile]));
      }
    }

    // 配对成立条件：v-for 段与固定段都存在；固定段 sanity（显著小或 ≤160px）
    const withVFor = cands.filter((c) => c.hasVFor);
    const withoutVFor = cands.filter((c) => !c.hasVFor);
    if (withVFor.length === 0 || withoutVFor.length === 0) continue;
    const maxH = Math.max(...cands.map((c) => c.h));
    const fixedCands = new Set(
      withoutVFor.filter((c) => c.h <= 0.35 * maxH || c.h <= 160),
    );
    if (fixedCands.size === 0) continue;

    // 自后向前改写，保持索引有效
    const edits = [];
    for (const c of cands) {
      const tag = tpl.slice(c.tagStart, c.tagEnd);
      const next = c.hasVFor
        ? tag.replace(/flex\s*:\s*[\d.]+/, 'flex:1 1 0')
        : fixedCands.has(c)
          ? tag.replace(/flex\s*:\s*[\d.]+/, `flex:0 0 auto; height:${c.h}px`)
          : tag.replace(/flex\s*:\s*[\d.]+/, 'flex:1 1 0');
      if (next !== tag) edits.push({ start: c.tagStart, end: c.tagEnd, next });
    }
    if (edits.length === 0) continue;
    let result = fc;
    for (const e of edits.reverse()) {
      result =
        result.slice(0, tplStart + e.start) +
        e.next +
        result.slice(tplStart + e.end);
    }
    out[fp] = result;
    changes.push({ file: fp, count: edits.length });
  }
  return { files: out, changes };
}

/**
 * 刀 29：同父相邻兄弟静态文本槽位对调（标题/地址、数值/标签互换）。
 * @param {Record<string,string>} files 产物文件集
 * @param {{figmaRoot?:object}} ctx
 * @returns {{files:Record<string,string>, changes:Array<{file:string,count:number,pairs:string[]}>}}
 */
export function normalizeTextSlotOrder(files, ctx = {}) {
  const changes = [];
  const out = { ...files };
  if (!ctx.figmaRoot) return { files: out, changes };
  const { textByChars } = collectFigmaIndex(ctx.figmaRoot);

  for (const [fp, fc] of Object.entries(out)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const rt = extractRootTemplate(fc);
    if (!rt) continue;
    const { tpl, tplStart } = rt;

    // 样式源：本文件 <style> + common.less（跨文件同源定义）
    const styleSources = [];
    const sfcStyle = fc.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (sfcStyle) styleSources.push(sfcStyle[1]);
    for (const p of Object.keys(out)) {
      if (p.endsWith('/common.less')) styleSources.push(out[p]);
    }

    // 静态文本元素（无 {{ }}、无子标签）：body 禁 `<` ⇒ 只命中叶子元素，
    // 外层容器不会吞掉内层（旧写法 lazy 匹配到外层闭合，内层被跳过）
    const elRe = /<([\w-]+)((?:[^<>"']|"[^"]*"|'[^']*')*?)>([^<]*)<\/\1>/g;
    const items = [];
    for (const m of tpl.matchAll(elRe)) {
      const raw = m[3];
      if (!raw || /\{\{/.test(raw)) continue;
      const t = raw.trim();
      if (!t || t.includes('<')) continue;
      const clsM = m[2].match(/\sclass="([^"]+)"/);
      if (!clsM) continue;
      items.push({
        cls: clsM[1],
        text: t,
        rawText: raw,
        start: m.index,
        end: m.index + m[0].length,
      });
    }
    if (items.length < 2) continue;

    // 同父相邻兄弟对：between 仅空白（含各自闭合标签在内的元素 span 之间只隔空白）
    const pairCtx = [];
    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i];
      const b = items[i + 1];
      if (!/^\s*$/.test(tpl.slice(a.end, b.start))) continue;
      pairCtx.push({
        a,
        b,
        fa: extractFontPx(a.cls, styleSources),
        fb: extractFontPx(b.cls, styleSources),
      });
    }
    // 文件级版式表决：大槽在上 vs 小槽在上（2026-10-14 · 0397a327 实锤：LLM 把
    // value-offline 与 label 同写 `font-size: @fontSize`，本对 CSS 大小序丢失，
    // 单靠本对 fa>fb 门槛永远失明；用同文件其他健康对的多数版式兜底）
    const bigFirst = pairCtx.filter((p) => p.fa > p.fb + 0.5).length;
    const smallFirst = pairCtx.filter((p) => p.fb > p.fa + 0.5).length;
    const fileBigOrder = bigFirst >= 1 && smallFirst === 0;

    const swaps = [];
    for (const { a, b, fa, fb } of pairCtx) {
      const sa = textByChars.get(a.text)?.fontSize ?? 0;
      const sb = textByChars.get(b.text)?.fontSize ?? 0;
      // A 真值交叉：a 是大字槽（CSS 严格大序），但 Figma 字号反而小 ⇒ 对调
      const truthSwap = fa > fb + 0.5 && sa > 0 && sb > 0 && sa < sb - 1;
      // B 形态交叉：a 纯 CJK 短标签（≤4 字）+ b 纯数字 ⇒ 对调。CSS 门槛两级：
      //   严格 fa>fb+0.5 直接成立；fa≈fb（大小序丢失）时要求文件级「大槽在上」版式兜底。
      //   短标签约束防「节点名 ⇄ 数值」合法版式误伤（3b06a019 语料实锤）。
      const shapeSignal =
        a.text.length <= 4 && CJK_RE.test(a.text) && DIGITS_RE.test(b.text);
      const shapeSwap =
        shapeSignal &&
        (fa > fb + 0.5 || (fileBigOrder && Math.abs(fa - fb) <= 0.5));
      if (truthSwap || shapeSwap) {
        swaps.push({ a, b, reason: truthSwap ? 'truth' : 'shape' });
      }
    }
    if (swaps.length === 0) continue;

    let result = fc;
    // 自后向前对调（同元素不会出现在两个 swap 里：相邻对互不重叠，但保险起见倒序）
    for (const s of swaps.reverse()) {
      const aSpan = result.slice(tplStart + s.a.start, tplStart + s.a.end);
      const bSpan = result.slice(tplStart + s.b.start, tplStart + s.b.end);
      const aNew = aSpan.replace(s.a.rawText, s.b.text);
      const bNew = bSpan.replace(s.b.rawText, s.a.text);
      if (aNew === aSpan || bNew === bSpan) continue;
      result =
        result.slice(0, tplStart + s.a.start) +
        aNew +
        result.slice(tplStart + s.a.end, tplStart + s.b.start) +
        bNew +
        result.slice(tplStart + s.b.end);
    }
    if (result !== fc) {
      out[fp] = result;
      changes.push({
        file: fp,
        count: swaps.length,
        pairs: swaps.map((s) => `${s.a.text} ⇄ ${s.b.text}(${s.reason})`),
      });
    }
  }
  return { files: out, changes };
}

/**
 * 刀 30 normalizeStatGroupLayout（2026-10-14 · cd63d1c5 实锤立项）：
 * 「数值+标签」stat 组被 LLM 写成同容器内连续横排的兄弟叶子
 * （`<span>2,138</span><span>在线</span><span>12</span><span>离线</span>`），
 * 设计稿契约是「每组一个包裹容器、数值在上标签在下」（style-guide.md
 * 「统计指标（stat）版式契约」）。
 *
 * 判据（全部成立，命名无关、fail-open）：
 *   - 同父容器内连续 ≥4 个叶子元素（span/div），between 仅空白；
 *   - 叶子严格交替 [value, label] ×N（N≥2）：
 *     value = 插值文本（{{ node.online }}）或纯数字/千分位；label = 静态纯 CJK ≤4 字；
 *   - value 开头（label 开头的序列不动，避免误重组）；
 *   - 幂等天然成立：已分组的产物父容器 children 是 N 个 div（非 ≥4 叶子）⇒ 不触发。
 *
 * 修复：每对包 `<div class="<groupCls>">`；groupCls = 父容器首类 `-stats`→`-stat`
 *   （否则追加 `-stat`）；CSS 堆叠规则（column/center/gap:2px）注入 common.less
 *   （已存在同类名规则则不注入）。
 *
 * 防误伤：单对（值+单位，如 `10810 台`）不触发（N≥2）；
 *   label 含插值/超过 4 字/非 CJK 不触发。
 *
 * @param {Record<string,string>} files 产物文件集
 * @returns {{files:Record<string,string>, changes:Array<{file:string,count:number,groups:string}>}}
 */
export function normalizeStatGroupLayout(files) {
  const changes = [];
  const out = { ...files };
  const INTERP_RE = /^\{\{[\s\S]*\}\}$/;
  const NUM_RE = /^[\d,.\s]+$/;
  const elRe = /<([\w-]+)((?:[^<>"']|"[^"]*"|'[^']*')*?)>([^<]*)<\/\1>/g;

  // 收集需要注入 CSS 的组类（去重），键 = common.less 路径
  const cssInject = new Map(); // commonPath -> Set<groupCls>

  for (const [fp, fc] of Object.entries(out)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const rt = extractRootTemplate(fc);
    if (!rt) continue;
    const { tpl, tplStart } = rt;

    // 叶子元素序列（同刀 29 口径：body 禁 `<` 只命中叶子）
    const items = [];
    for (const m of tpl.matchAll(elRe)) {
      const raw = m[3];
      const t = raw.trim();
      if (!t) continue;
      const clsM = m[2].match(/\sclass="([^"]+)"/);
      items.push({
        tag: m[1],
        cls: clsM ? clsM[1] : '',
        text: t,
        start: m.index,
        end: m.index + m[0].length,
        kind: INTERP_RE.test(t) || NUM_RE.test(t) ? 'value' : 'other',
      });
    }
    if (items.length < 4) continue;
    for (const it of items) {
      if (it.kind === 'value') continue;
      it.kind = CJK_RE.test(it.text) && it.text.length <= 4 ? 'label' : 'other';
    }

    // 找连续（between 仅空白）交替 [value,label]×N 窗口（value 开头，N≥2）
    const wraps = []; // {start, end, pairs:[{a,b}], parentCls}
    let i = 0;
    while (i < items.length - 3) {
      const a = items[i];
      if (a.kind !== 'value' || (a.tag !== 'span' && a.tag !== 'div')) {
        i++;
        continue;
      }
      // 连续交替探测
      const pairs = [];
      let j = i;
      while (j + 1 < items.length) {
        const va = items[j];
        const lb = items[j + 1];
        if (va.kind !== 'value' || lb.kind !== 'label') break;
        if (va.tag !== lb.tag) break;
        if (!/^\s*$/.test(tpl.slice(va.end, lb.start))) break;
        // 与上一对之间也必须仅空白（同父相邻）
        if (pairs.length > 0) {
          const prevLb = pairs[pairs.length - 1].b;
          if (!/^\s*$/.test(tpl.slice(prevLb.end, va.start))) break;
        }
        pairs.push({ a: va, b: lb });
        j += 2;
      }
      if (pairs.length >= 2) {
        // 组类推导：value 首类去 BEM 修饰 → 去尾部 value 系后缀 → 去尾部既有 -stat
        //   （防 `node-stat-value` → `node-stat-stat` 双重后缀，e38ee16b 语料实锤）
        //   → 统一补 `-stat`；落空用 'mc-stat-group'（仍确定性）
        const firstCls = (a.cls || '').split(/\s+/)[0] || '';
        let groupCls = firstCls
          .replace(/--.*$/, '')
          .replace(/-(value|num|number|count|val)$/i, '')
          .replace(/-stat$/i, '');
        groupCls = groupCls ? `${groupCls}-stat` : 'mc-stat-group';
        wraps.push({
          start: a.start,
          end: pairs[pairs.length - 1].b.end,
          pairs,
          groupCls,
        });
        i = j;
        continue;
      }
      i++;
    }
    if (wraps.length === 0) continue;

    // 自后向前包裹（pairs 索引基于原始模板；倒序保证前方索引有效）
    let result = fc;
    for (const w of wraps.reverse()) {
      const innerRaw = w.pairs
        .map((p) => {
          const aSpan = result.slice(tplStart + p.a.start, tplStart + p.a.end);
          const between = result.slice(tplStart + p.a.end, tplStart + p.b.start);
          const bSpan = result.slice(tplStart + p.b.start, tplStart + p.b.end);
          return `<div class="${w.groupCls}">${aSpan}${between}${bSpan}</div>`;
        })
        .join('');
      result =
        result.slice(0, tplStart + w.start) +
        innerRaw +
        result.slice(tplStart + w.end);
      const commonPath = Object.keys(out).find((p) =>
        p.endsWith('/common.less'),
      );
      if (commonPath) {
        if (!cssInject.has(commonPath)) cssInject.set(commonPath, new Set());
        cssInject.get(commonPath).add(w.groupCls);
      }
      changes.push({
        file: fp,
        count: w.pairs.length,
        groups: w.groupCls,
      });
    }
    if (result !== fc) out[fp] = result;
  }

  // CSS 注入（common.less 无同名规则才追加）
  for (const [commonPath, clsSet] of cssInject) {
    let less = out[commonPath];
    if (typeof less !== 'string') continue;
    for (const cls of clsSet) {
      const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\.${esc}\\s*\\{`).test(less)) continue;
      less +=
        `\n.${cls} {\n` +
        `  display: flex;\n` +
        `  flex-direction: column;\n` +
        `  align-items: center;\n` +
        `  gap: 2px;\n` +
        `}\n`;
    }
    out[commonPath] = less;
  }

  return { files: out, changes };
}

/**
 * 刀 31 ensureSlotConBackground（R8 容器底色契约，2026-10-14 · cd63d1c5 实锤立项）：
 *   病灶：组件内容根容器（*-slot-con，管线既有契约容器名）无显式 background →
 *   面板底色依赖预览环境色，dark 轨下卡/底亮度关系失控（分析文档 R8/B1）。
 * 判据（全部同时成立，可辩驳）：
 *   ① common.less 中存在**单个类选择器** `.<x>-slot-con`（复合选择器不动）；
 *   ② 其规则块（括号配对提取）无 `background`/`background-color` 声明；
 *   ③ 该产物 theme-vars.less 已定义优先级链中至少一个页面底色变量：
 *      color-bg-page > color-bg-container > color-bg-base > color-bg
 *      （13 语料 hit 实测覆盖 12，优先级链取产物既有定义，零臆造色值）。
 *   ③ 不满足 → 跳过（零臆造），记入 skipped 供审计。
 * 修复：向规则块末尾注入 `background: @<var>;`（幂等：已有 background 则不触发；
 *   同名复合规则不重复注入）。index.css 由下游 refiner recompileIndexCss 同步，本刀只改 less 源。
 * 阳性对照：temp-components 带病原始产物触发；cd63d1c5 手修版（已注入）不触发。
 *
 * 🛡️ 2026-10-20 真值豁免（5ef650ff 实锤）：figma 根容器 fills=[]（透明——底色由
 *   宿主弹窗/面板透出）时**禁止注入**，否则臆造背景盖住宿主底色（浅发白/深发灰）。
 *   无真值（旧链路/无 figma）⇒ 维持原行为（fail-open 不回退）。
 */
const SLOT_CON_BG_PRIORITY = [
  'color-bg-page',
  'color-bg-container',
  'color-bg-base',
  'color-bg',
];

export function ensureSlotConBackground(files, opts = {}) {
  const out = { ...files };
  const changes = [];
  const skipped = [];
  // 真值豁免：根透明 ⇒ 不注入（设计意图是透出宿主底色）
  const rootTransparent = opts?.transparentContainerTruth?.rootTransparent === true;

  // 该产物 theme-vars.less 已定义的 less 变量集合
  const themePath = Object.keys(out).find((p) =>
    p.endsWith('resources/styles/themes/theme-vars.less'),
  );
  const definedVars = new Set();
  if (themePath && typeof out[themePath] === 'string') {
    const re = /@([\w-]+)\s*:/g;
    let m;
    while ((m = re.exec(out[themePath]))) definedVars.add(m[1]);
  }
  const bgVar = SLOT_CON_BG_PRIORITY.find((v) => definedVars.has(v)) || null;

  const commonPath = Object.keys(out).find((p) => p.endsWith('/common.less'));
  const less = commonPath ? out[commonPath] : null;
  if (typeof less !== 'string') return { files: out, changes, skipped };

  // 单类选择器 .<x>-slot-con 的规则块定位（括号配对）
  const selRe = /^[ \t]*\.([\w-]+-slot-con)[ \t]*\{/gm;
  let m;
  let patched = less;
  const injections = []; // {pos, text} pos 基于原始 less
  while ((m = selRe.exec(less))) {
    const braceStart = m.index + m[0].length - 1;
    let depth = 1;
    let i = braceStart + 1;
    while (i < less.length && depth > 0) {
      if (less[i] === '{') depth++;
      else if (less[i] === '}') depth--;
      i++;
    }
    if (depth !== 0) continue;
    const body = less.slice(braceStart + 1, i - 1);
    if (/\bbackground(?:-color)?\s*:/.test(body)) continue; // 幂等
    if (rootTransparent) {
      skipped.push({ file: commonPath, selector: m[1], reason: 'root-transparent-by-figma-truth' });
      continue;
    }
    if (!bgVar) {
      skipped.push({ file: commonPath, selector: m[1], reason: 'no-bg-var-defined' });
      continue;
    }
    injections.push({
      pos: i - 1,
      text: `  background: @${bgVar};\n`,
      selector: m[1],
    });
  }
  if (injections.length > 0) {
    for (const inj of injections.reverse()) {
      patched = patched.slice(0, inj.pos) + inj.text + patched.slice(inj.pos);
      changes.push({
        file: commonPath,
        selector: inj.selector,
        variable: `@${bgVar}`,
      });
    }
    out[commonPath] = patched;
  }

  return { files: out, changes, skipped };
}

/**
 * 刀 32 healZebraStripeMisread（臆造斑马纹纠偏，2026-10-14 · mc-max-1791965365126-2238359a 实锤立项）：
 *   病灶：Figma 同构列表卡「仅首卡异色」（激活/选中态，1 异 5 同），LLM 按 UI 惯例
 *   误泛化为 `:nth-child(odd)` 斑马纹（1/3/5 蓝、2/4/6 白）——单点激活证据被归纳成交替模式。
 * 判据（全部同时成立，可辩驳；无 figmaRoot → fail-open 不动）：
 *   ① Figma 真值分布：树中「同名同尺寸 ≥3 个 SOLID 填充重复节点」的最大组，按 y 排序：
 *      - 严格交替（n≥4，fill[i]===fill[i%2] 且 fill[0]!==fill[1]）→ 'zebra'：产物斑马合法，不动；
 *      - 恰好 1 个与多数派不同 → 'active'：激活态语义；
 *      - 全部同色 → 'uniform'：无高亮语义；
 *      - 其他 / 无 ≥3 重复组 → 不动。
 *   ② 产物（common.less + 各 .vue）存在**交替型** nth-child 背景规则：
 *      `:nth-child(odd|even|2n[±k])` 且规则块内有 `background` 声明。
 * 修复：
 *   - 'active'：选择器 `:nth-child(alt)` → `:first-child, :hover`（嵌套 `&:` 与扁平 `.x:nth-child`
 *      两种形态都支持；扁平形态两个伪类都保留宿主类前缀）；块内补 `cursor: pointer` 与
 *      `transition: background 0.2s ease`（已有则不重复）。背景声明原值沿用（色值契约归 R7 规范层管）。
 *   - 'uniform'：整个交替型规则块剥除。
 * 幂等：改写/剥除后产物无交替型 nth-child 背景规则 ⇒ 二次调用零改动。
 * 阳性对照：2238359a common.less `&:nth-child(odd){background:@color-primary}` + Figma 1 异 5 同。
 */
const ZEBRA_ARG_RE = /^(?:odd|even|2n(?:\s*[+-]\s*\d+)?)$/;

/** 从 figmaRoot 提取最大重复节点组（≥3 同名同尺寸 SOLID 填充）的 fills 分布判定 */
export function classifyRepeatedCardFills(figmaRoot) {
  if (!figmaRoot || typeof figmaRoot !== 'object') return null;
  const groups = new Map(); // key → [{hex, opacity, y}]
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    const bb = n.absoluteBoundingBox;
    const f = Array.isArray(n.fills) ? n.fills[0] : null;
    if (bb && f && f.type === 'SOLID' && f.color && n.name) {
      const { r, g, b } = f.color;
      const hex =
        '#' +
        [r, g, b]
          .map((v) =>
            Math.round((v || 0) * 255)
              .toString(16)
              .padStart(2, '0'),
          )
          .join('');
      const key = `${n.name}|${Math.round(bb.width)}x${Math.round(bb.height)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        hex,
        // 🔴 2026-10-15：fill.opacity 必须随真值携带（91544b38 实锤：5 张卡
        // #ffffff@0.43 被下游提为不透明 #ffffff → 浅蓝 tint 全丢）。
        opacity: f.opacity == null ? 1 : Number(f.opacity),
        y: Math.round(bb.y || 0),
      });
    }
    (n.children || []).forEach(walk);
  })(figmaRoot.document || figmaRoot);

  let best = null;
  for (const arr of groups.values()) {
    if (arr.length >= 3 && (!best || arr.length > best.length)) best = arr;
  }
  if (!best) return null;
  best.sort((a, b) => a.y - b.y);
  const fills = best.map((x) => x.hex.toLowerCase());
  const fillOf = (hex) => {
    const hit = best.find((x) => x.hex.toLowerCase() === hex);
    return hit ? { hex, opacity: hit.opacity } : { hex, opacity: 1 };
  };

  // 严格交替（≥4 才承认斑马，3 张 AB 无法与「首卡激活」区分——保守归 active 候选）
  if (
    fills.length >= 4 &&
    fills[0] !== fills[1] &&
    fills.every((h, i) => h === fills[i % 2])
  ) {
    return { kind: 'zebra', size: fills.length, fillA: fillOf(fills[0]), fillB: fillOf(fills[1]) };
  }
  const uniq = new Set(fills);
  if (uniq.size === 1) return { kind: 'uniform', size: fills.length, fill: fillOf(fills[0]) };
  // 多数派统计：恰好 1 个少数派
  const count = new Map();
  for (const h of fills) count.set(h, (count.get(h) || 0) + 1);
  const minor = [...count.entries()].filter(([, c]) => c === 1);
  if (uniq.size === 2 && minor.length === 1) {
    const minorHex = minor[0][0];
    const majorHex = [...count.entries()].find(([, c]) => c !== 1)?.[0];
    return {
      kind: 'active',
      size: fills.length,
      activeHex: minorHex,
      activeFill: fillOf(minorHex),
      baseFill: majorHex ? fillOf(majorHex) : null,
    };
  }
  return null; // 分布不明 → 不动
}

/**
 * 重复卡 fill 描述符 → CSS 色值（2026-10-15 · 91544b38 实锤）。
 * opacity < 1 必须输出 rgba(...) 保留透明度——提为不透明 hex 会把
 * 「半透白叠蓝底页」的浅蓝 tint 卡底变成纯白（产物 @color-bg-card:#ffffff 病灶）。
 */
export function formatRepeatedFillCss(fill) {
  if (!fill || !fill.hex) return null;
  const op = fill.opacity == null ? 1 : Number(fill.opacity);
  if (!(op < 0.999)) return fill.hex;
  const r = parseInt(fill.hex.slice(1, 3), 16);
  const g = parseInt(fill.hex.slice(3, 5), 16);
  const b = parseInt(fill.hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Number(op.toFixed(2))})`;
}

/**
 * 重复卡填充真值注入（2026-10-15 · 2238359a 臆造斑马纹根因第三层 · 源头预防）。
 *
 * 挂点：visual-parser._postProcessAnalysis（视觉分析确定性后处理枢纽）。
 * 真值判据复用刀 32 同款 classifyRepeatedCardFills；注入后 parsed.repeatedCardTruth
 * 随 layoutStructure 原样进 prompt（prompt-builder 另有权威行强约束）。
 * 无 figmaRoot / 分布不明（null）→ 不动（fail-open）。
 */
export function injectRepeatedCardTruth(parsed, figmaRoot) {
  const truth = classifyRepeatedCardFills(figmaRoot);
  if (truth && parsed && typeof parsed === 'object') {
    parsed.repeatedCardTruth = truth;
  }
  return truth;
}

/**
 * 奇偶交替样式确定性检测（2026-11-12 · 视觉分析阶段提示）。
 *
 * 通用化 classifyRepeatedCardFills：扫描布局里**所有**同构重复组（按
 * `name|WxH` 分组），对每组判定 zebra（严格交替）/ active（单一异色激活态）/
 * uniform（全同 → 跳过），输出 oddEvenHints 数组供下游 prompt 注入。
 *
 * 真值来源 = Figma 节点 fill（非 vision 猜测），复用刀 32 同款判定，
 * 规避「臆造斑马纹」根因（把 1 异 N 同误泛化成 nth-child 斑马纹）。
 *
 * 无 figmaRoot / 无重复组 → 返回空数组（fail-open，下游 no-op）。
 */
export function detectOddEvenPatterns(figmaRoot) {
  if (!figmaRoot || typeof figmaRoot !== 'object') return [];
  const groups = new Map(); // key → [{hex, opacity, y}]
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    const bb = n.absoluteBoundingBox;
    const f = Array.isArray(n.fills) ? n.fills[0] : null;
    if (bb && f && f.type === 'SOLID' && f.color && n.name) {
      const { r, g, b } = f.color;
      const hex =
        '#' +
        [r, g, b]
          .map((v) => Math.round((v || 0) * 255).toString(16).padStart(2, '0'))
          .join('');
      const key = `${n.name}|${Math.round(bb.width)}x${Math.round(bb.height)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        hex,
        opacity: f.opacity == null ? 1 : Number(f.opacity),
        y: Math.round(bb.y || 0),
      });
    }
    (n.children || []).forEach(walk);
  })(figmaRoot.document || figmaRoot);

  const hints = [];
  for (const [key, arr] of groups) {
    if (arr.length < 3) continue; // 组太小，不足以判定奇偶
    arr.sort((a, b) => a.y - b.y);
    const fills = arr.map((x) => x.hex.toLowerCase());
    const fillOf = (hex) => {
      const hit = arr.find((x) => x.hex.toLowerCase() === hex);
      return hit ? { hex, opacity: hit.opacity } : { hex, opacity: 1 };
    };
    // 严格交替（≥4 才承认斑马，3 张 AB 无法与「首卡激活」区分——保守归 active 候选）
    if (
      fills.length >= 4 &&
      fills[0] !== fills[1] &&
      fills.every((h, i) => h === fills[i % 2])
    ) {
      hints.push({
        scope: key.split('|')[0],
        kind: 'zebra',
        size: fills.length,
        fillA: formatRepeatedFillCss(fillOf(fills[0])),
        fillB: formatRepeatedFillCss(fillOf(fills[1])),
      });
      continue;
    }
    const uniq = new Set(fills);
    if (uniq.size === 1) continue; // 全同 → 不是奇偶样式，跳过
    const count = new Map();
    for (const h of fills) count.set(h, (count.get(h) || 0) + 1);
    const minor = [...count.entries()].filter(([, c]) => c === 1);
    if (uniq.size === 2 && minor.length === 1) {
      const minorHex = minor[0][0];
      const majorHex = [...count.entries()].find(([, c]) => c !== 1)?.[0];
      hints.push({
        scope: key.split('|')[0],
        kind: 'active',
        size: fills.length,
        activeHex: formatRepeatedFillCss(fillOf(minorHex)),
        baseHex: majorHex ? formatRepeatedFillCss(fillOf(majorHex)) : null,
      });
      continue;
    }
    // 其他分布不明 → 跳过
  }
  return hints;
}

/**
 * 奇偶交替样式真值注入（镜像 injectRepeatedCardTruth）。
 * 挂点：visual-parser._postProcessAnalysis。无 figmaRoot / 空 hints → 不动。
 */
export function injectOddEvenHints(parsed, figmaRoot) {
  const hints = detectOddEvenPatterns(figmaRoot);
  if (hints && hints.length && parsed && typeof parsed === 'object') {
    parsed.oddEvenHints = hints;
  }
  return hints;
}

/**
 * 🛡️ 2026-10-20（5ef650ff 实锤）：透明容器真值。
 *
 * 病灶：设计稿里 fills=[] 的透明内容容器（如 796:3 slot-icon 整柱——底色由宿主
 *   浅蓝/深蓝弹窗提供），产物却给对应 wrapper 刷上 `background: @color-bg-container`
 *   （light #fff / 深色轨猜测灰 #2b2b2b）⇒ 浅色整体发白、深色发灰，盖住宿主底色。
 *
 * 判据（纯几何，命名无关）：容器节点（FRAME/GROUP/INSTANCE/COMPONENT）无可见填充，
 *   且**首个子节点不是同尺寸填充矩形**（后者是「面板底」形态——背景色是设计意图，
 *   由 buildSectionStyleFacts 的「面板底(几何)」真值下发，不算透明）。
 *
 * @returns {null|{transparentIds:string[], total:number}}
 */
export function classifyTransparentContainers(figmaRoot) {
  const root = figmaRoot?.document ?? figmaRoot;
  if (!root || typeof root !== 'object') return null;
  const CONTAINER = new Set(['FRAME', 'GROUP', 'INSTANCE', 'COMPONENT']);
  const transparent = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    const t = String(n.type || '').toUpperCase();
    if (CONTAINER.has(t) && Array.isArray(n.children) && n.children.length > 0) {
      const fillsVisible = (n.fills || []).some((f) => f && f.visible !== false);
      if (!fillsVisible) {
        const nb = n.absoluteBoundingBox;
        const first = n.children[0];
        const fb = first?.absoluteBoundingBox;
        const ft = String(first?.type || '').toUpperCase();
        const firstFilled = (first?.fills || []).some((f) => f && f.visible !== false);
        const sameSize = !!(nb && fb &&
          Math.abs((fb.x || 0) - (nb.x || 0)) <= 2 && Math.abs((fb.y || 0) - (nb.y || 0)) <= 2 &&
          Math.abs((fb.width || 0) - (nb.width || 0)) <= 2 && Math.abs((fb.height || 0) - (nb.height || 0)) <= 2);
        const isPanelBase = (ft === 'RECTANGLE' || ft === 'VECTOR') && firstFilled && sameSize;
        if (!isPanelBase) transparent.push({ id: String(n.id || ''), name: String(n.name || '') });
      }
    }
    for (const c of n.children || []) walk(c);
  };
  walk(root);
  // 根容器透明标记：根 FRAME fills=[] ⇒ 整柱底色由宿主透出（弹窗/面板场景），
  //   刀 31（ensureSlotConBackground）见此标记必须停手（5ef650ff 实锤：透明弹窗
  //   内容柱被注入 @color-bg-container ⇒ 浅发白/深发灰）。
  const rootTransparent = !(root.fills || []).some((f) => f && f.visible !== false);
  if (transparent.length === 0 && !rootTransparent) return null;
  return { transparentIds: transparent.slice(0, 40).map((t) => t.id), total: transparent.length, rootTransparent };
}

export function injectTransparentContainerTruth(parsed, figmaRoot) {
  const truth = classifyTransparentContainers(figmaRoot);
  if (truth && parsed && typeof parsed === 'object') {
    parsed.transparentContainerTruth = truth;
  }
  return truth;
}

/**
 * 🧬 刀 66-P0 · 同构段 Figma 真值注入（L0 事实层，2026-11-12 · adbd1b3d 三厂商段实锤）
 *
 * ## 为什么在视觉后处理做
 * 三段「战略/优质/普通厂商」在 Figma 里是同一套 frame 复制，仅数值文本色与卡片底色不同
 * （accent #b9a000 / #00ac2e / #0099bb；bg #fffdf1 / #f6fff7 / #f2fdff；零值色 #679bbe）。
 * 这些是**确定性几何/填充真值**，不依赖 vision 措辞。此前下游 `collectIsomorphicSectionGroups`
 * 只能押 vision 自由文本（label / stat-card / vendor-item / 嵌套容器），连续四次 0 命中。
 * 本层只产**事实**（每段的结构与配色），**不产裁决**：分组仍由 L1 唯一判据
 * `collectIsomorphicSectionGroups` 用结构签名 + 本地校验完成，视觉声明只作候选。
 *
 * ## 纪律
 * - 纯附加字段 `parsed.isoSectionTruth`，不改 sections 骨架、不改 children/items 形态；
 * - 取不到 Figma 节点 / 取不到配色 ⇒ 对应字段留空（fail-open，绝不臆造颜色）；
 * - 与 `injectRepeatedCardTruth` 同挂点，随 layoutStructure 原样进 prompt。
 */

/** 数值文本（含单位）：非零 → accent 候选；零值 → zeroColor 候选。 */
const ISO_ZERO_TEXT_RE = /^0(?:\.\d+)?\s*(?:台|个|件|辆|次|人|%|项|条|家|户|座|路)?$/;
const ISO_NUM_TEXT_RE = /^[1-9]\d*(?:\.\d+)?\s*(?:台|个|件|辆|次|人|%|项|条|家|户|座|路)?$/;

function isoFillHex(fill) {
  if (!fill || typeof fill !== 'object' || fill.type !== 'SOLID' || !fill.color) return '';
  const c = fill.color;
  return '#' + [c.r, c.g, c.b]
    .map((v) => Math.round((v || 0) * 255).toString(16).padStart(2, '0'))
    .join('');
}

function isoVisibleFillHex(node) {
  for (const f of node?.fills || []) {
    if (f && f.visible !== false) {
      const h = isoFillHex(f);
      if (h) return h;
    }
  }
  return '';
}

/** 近灰/黑白：最大最小通道差 ≤12 ⇒ 不参与配色真值（防把正文 #333 当 accent）。 */
function isoIsNeutral(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return Math.max(r, g, b) - Math.min(r, g, b) <= 12;
}

function isoMode(list) {
  const counts = new Map();
  for (const x of list) if (x) counts.set(x, (counts.get(x) || 0) + 1);
  let best = '';
  let bestN = 0;
  for (const [k, v] of counts) if (v > bestN) { best = k; bestN = v; }
  return best;
}

/**
 * 从段 Figma 子树提取配色真值（确定性、命名无关）。
 * @returns {{theme: {bg:string,accent:string,zeroColor:string}, frameNames: string[]}}
 */
export function classifyIsoSectionTheme(rootNode) {
  const theme = { bg: '', accent: '', zeroColor: '' };
  const frameNames = [];
  if (!rootNode || typeof rootNode !== 'object') return { theme, frameNames };
  const numericColors = [];
  const zeroColors = [];
  const bgCandidates = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    const t = String(n.type || '').toUpperCase();
    const hex = isoVisibleFillHex(n);
    if (t === 'TEXT') {
      const chars = String(n.characters || '').trim();
      if (hex && !isoIsNeutral(hex)) {
        if (ISO_ZERO_TEXT_RE.test(chars)) zeroColors.push(hex);
        else if (ISO_NUM_TEXT_RE.test(chars)) numericColors.push(hex);
      }
    } else {
      if (hex) {
        const m = /^#([0-9a-f]{6})$/i.exec(hex);
        if (m) {
          const v = parseInt(m[1], 16);
          const r = (v >> 16) & 255;
          const g = (v >> 8) & 255;
          const b = v & 255;
          // 🔴 底色是**很淡的色相**（#f6fff7 通道差仅 9）⇒ 不能复用正文灰过滤
          //    isoIsNeutral(阈值12)，否则会把绿底误判成中性色丢掉（adbd1b3d 实锤）。
          //    判据：各通道 >220（浅色）、非纯白（通道差 ≥3 ⇒ 确实带色相）。
          if (Math.min(r, g, b) > 220 && Math.max(r, g, b) - Math.min(r, g, b) >= 3) {
            bgCandidates.push(hex);
          }
        }
      }
      if ((t === 'FRAME' || t === 'INSTANCE' || t === 'COMPONENT') && n.name) {
        frameNames.push(String(n.name));
      }
    }
    for (const c of n.children || []) walk(c);
  };
  walk(rootNode);
  theme.accent = isoMode(numericColors);
  theme.zeroColor = isoMode(zeroColors);
  theme.bg = isoMode(bgCandidates);
  return { theme, frameNames: frameNames.slice(0, 12) };
}

/** 枚举 parsed 里全部 sections（四形态，按 id 去重；与 visual-parser#collectSectionArrays 同源口径）。 */
function collectIsoTruthSections(parsed) {
  const out = new Map();
  const push = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const s of arr) {
      if (!s || typeof s !== 'object' || s.id == null) continue;
      const id = String(s.id);
      if (!out.has(id)) out.set(id, s);
    }
  };
  push(parsed?.layout?.sections);
  push(parsed?.sections);
  push(parsed?.layoutStructure?.layout?.sections);
  push(parsed?.layoutStructure?.sections);
  return [...out.values()];
}

/**
 * 构建 L0 事实包（纯函数，可 spec）。
 * 视觉模型若已声明 `isomorphicSectionGroups`，原样收进 declaredGroups 作**候选**；
 * 真值校验与分组裁决一律留给 L1，声明单独存在绝不触发收敛。
 */
export function buildIsoSectionTruth(parsed, figmaRoot) {
  if (!parsed || typeof parsed !== 'object') return null;
  const { nodeById } = collectFigmaIndex(figmaRoot);
  const sections = [];
  for (const sec of collectIsoTruthSections(parsed)) {
    const id = String(sec.id);
    const node =
      nodeById.get(id) ||
      nodeById.get(String(sec.figmaAnchorId || '')) ||
      nodeById.get(String(sec.figmaNodeId || '')) ||
      null;
    const lay = normalizeSectionLayout(sec.body);
    const { theme, frameNames } = node
      ? classifyIsoSectionTheme(node)
      : { theme: { bg: '', accent: '', zeroColor: '' }, frameNames: [] };
    sections.push({
      id,
      figmaNodeId: node ? String(node.id || id) : '',
      columns: Number.isInteger(lay.columns) ? lay.columns : null,
      entryCount: isoBodyEntries(sec, { flattenOneLevel: true }).length,
      theme,
      frameNames,
    });
  }
  const declaredRaw =
    parsed.isomorphicSectionGroups ||
    parsed.layout?.isomorphicSectionGroups ||
    parsed.layoutStructure?.isomorphicSectionGroups ||
    [];
  const declaredGroups = Array.isArray(declaredRaw)
    ? declaredRaw
        .filter((g) => g && Array.isArray(g.sectionIds) && g.sectionIds.length >= 2)
        .map((g) => ({
          groupId: String(g.groupId || ''),
          sectionIds: g.sectionIds.map(String),
          representativeId: g.representativeId ? String(g.representativeId) : '',
        }))
    : [];
  return {
    source: 'figma-node-tree',
    sections,
    declaredGroups,
    counts: {
      sections: sections.length,
      figmaResolved: sections.filter((s) => s.figmaNodeId).length,
      withTheme: sections.filter(
        (s) => s.theme && (s.theme.accent || s.theme.bg || s.theme.zeroColor),
      ).length,
      declaredGroups: declaredGroups.length,
    },
  };
}

/** 注入挂点：与 injectRepeatedCardTruth 同形态，随 layoutStructure 原样进 prompt。 */
export function injectIsomorphicSectionTruth(parsed, figmaRoot) {
  const truth = buildIsoSectionTruth(parsed, figmaRoot);
  if (truth && parsed && typeof parsed === 'object') {
    parsed.isoSectionTruth = truth;
  }
  return truth;
}


/** 交替型 nth-child 规则块扫描：返回 [{selStart, selEnd, bodyStart, bodyEnd, selector, body}] */
export function findZebraRules(css) {
  const out = [];
  // 嵌套 `&:nth-child(...)` 与扁平 `.x:nth-child(...)` 统一匹配选择器头
  const re = /((?:&|[.#][\w-]+(?::[\w-]+(?:\([^)]*\))?)*)?:nth-child\(\s*([^)]*?)\s*\))\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    if (!ZEBRA_ARG_RE.test(m[2].trim())) continue;
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    if (depth !== 0) continue;
    const body = css.slice(bodyStart, i - 1);
    if (!/\bbackground(?:-color)?\s*:/.test(body)) continue;
    out.push({
      selStart: m.index,
      selEnd: bodyStart, // 含 {
      blockEnd: i, // 含 }
      selector: m[1],
      body,
    });
  }
  return out;
}

/** `:nth-child(alt)` 选择器 → `:first-child, :hover`（保留宿主前缀） */
function rewriteActiveSelector(sel) {
  if (sel.startsWith('&')) return '&:first-child, &:hover';
  const host = sel.replace(/:nth-child\(\s*[^)]*?\s*\)\s*$/, '');
  return `${host}:first-child, ${host}:hover`;
}

export function healZebraStripeMisread(files, { figmaRoot } = {}) {
  const out = { ...files };
  const changes = [];
  const truth = classifyRepeatedCardFills(figmaRoot);
  if (!truth || truth.kind === 'zebra') return { files: out, changes, truth };

  for (const [fp, fc] of Object.entries(files)) {
    if (typeof fc !== 'string') continue;
    if (!fp.endsWith('.less') && !fp.endsWith('.vue')) continue;
    const rules = findZebraRules(fc);
    if (rules.length === 0) continue;

    let result = fc;
    for (const r of rules.reverse()) {
      if (truth.kind === 'uniform') {
        // 剥除整个规则块
        result = result.slice(0, r.selStart) + result.slice(r.blockEnd);
        changes.push({ file: fp, action: 'strip', selector: r.selector });
      } else {
        // 'active'：改写选择器 + 补交互三件套（cursor/transition 已有则跳过）
        let newBody = r.body;
        if (!/\bcursor\s*:/.test(newBody)) {
          newBody = newBody.replace(/\s*$/, '') + '\n  cursor: pointer;\n';
        }
        if (!/\btransition\s*:/.test(newBody)) {
          newBody = newBody.replace(/\s*$/, '') + '\n  transition: background 0.2s ease;\n';
        }
        const newSel = rewriteActiveSelector(r.selector);
        result =
          result.slice(0, r.selStart) +
          `${newSel} {${newBody}}` +
          result.slice(r.blockEnd);
        changes.push({ file: fp, action: 'active', selector: r.selector, to: newSel });
      }
    }
    if (result !== fc) out[fp] = result;
  }

  return { files: out, changes, truth };
}

/**
 * 🛡️ C 层（2026-11-12 · mc-1794428749650-cc633474 实锤）：网格列数真值落地。
 *
 *   事故：plan 里 `38:3137-list` 明确 `gridColumns:4`（真值 item 126×30、gap 20、行宽 564），
 *   prompt 也写了「gridColumns 是硬约束」，但产物 `CardGrid.vue` 只写了
 *   `display:flex;flex-direction:row`（无列宽/无 wrap）⇒ 33 条按内容自适应排出 **5 列**。
 *   根因不是 LLM 不知道，而是**列数没有任何确定性落地环节**：plan→prompt 是软约束，
 *   LLM 自由发挥即漂移（修复轮重写后尤其明显）。
 *
 *   判据（全部来自 plan / Figma 真值，零臆造）：
 *     · 段 `gridColumns = K` 且 `type/layout = grid`（或 id 以 `-list` 收尾的折叠段）；
 *     · item 宽 `w`（取 items[0] 的 box）与段宽 `W` 可算 gap：`g = (W - K*w)/(K-1)`；
 *       `g` 为合理正数（0..64）⇒ 用 `repeat(K, w px)` 复刻真值；否则退 `repeat(K, minmax(0,1fr))`。
 *     · 目标元素 = 段内**承载 v-for 的开标签**（`data-section-id` 之后第一个 v-for 元素）。
 *     · 该标签 style 已含同列数 `repeat(K, …)` ⇒ 视为已落地，跳过（幂等）。
 *
 *   fail-open：无 sections / 段内无 v-for / 该 sid 无 gridColumns ⇒ 不动该文件。
 */
export function collectGridColumnTruth(sections, depth = 0) {
  const map = new Map();
  const walk = (arr, d) => {
    if (!Array.isArray(arr) || d > 6) return;
    for (const s of arr) {
      if (!s || typeof s !== 'object') continue;
      const k = Number(s.gridColumns || s.body?.gridColumns || 0);
      const isGrid =
        s.type === 'grid' || s.layout === 'grid' || String(s.id || '').endsWith('-list');
      if (isGrid && k >= 2 && k <= 8) {
        const items = s.items || s.body?.items || s.body?.children || s.children || [];
        const box = s.figmaBox || s.absoluteBoundingBox || {};
        const ib = (items[0] && (items[0].absoluteBoundingBox || items[0].figmaBox)) || {};
        const W = Math.round(Number(box.width) || 0);
        const w = Math.round(Number(ib.width) || 0);
        let gap = 0;
        if (W > 0 && w > 0 && k > 1) {
          const g = (W - k * w) / (k - 1);
          if (g >= 0 && g <= 64) gap = Math.round(g);
        }
        map.set(String(s.id), { cols: k, itemW: w, gap, boxW: W });
      }
      walk(s.children, d + 1);
      if (Array.isArray(s.body?.children)) walk(s.body.children, d + 1);
    }
  };
  walk(sections, depth);
  return map;
}

/**
 * 🛡️ C 层之二（2026-11-12 · mc-1794428749650-cc633474 实锤）：兄弟段主轴方向真值。
 *
 *   事故：两个统计卡在 Figma 里 **y 相同、x 相邻**（26900/27229，各 265×76，gap 64）⇒ 并排；
 *   但规划层只写了段内 `layoutMetadata.direction=column`，**没有兄弟间 row 关系**，
 *   产物 index.vue 于是写成 `flex-direction:column` 竖排，两卡各占 24% 高、中间大片空白。
 *
 *   判据（纯几何，零语义）：相邻两段 `|Δy| ≤ 4` 且 `|Δx| > 4` 且 `|Δw| ≤ 3` ⇒ 并排；
 *   gap = `b.x - (a.x + a.w)`（负值钳 0）。
 *
 *   落地：在 index.vue 里把这两个子组件标签包进一个 row 容器
 *   （`display:flex;flex-direction:row;column-gap:gap;flex:0 0 auto`），
 *   子组件原有 flex 比例保留（等宽段天然 1:1）；只包一层，不动内容与其他段。
 *
 *   fail-open：段数/子组件数对不上、标签非相邻、找不到 index.vue ⇒ 不改。
 */
function sectionBox(s) {
  const b = (s && (s.figmaBox || s.absoluteBoundingBox)) || null;
  if (!b || !Number(b.width)) return null;
  return { x: Number(b.x) || 0, y: Number(b.y) || 0, w: Number(b.width) };
}

/** 子组件标签范围（自闭合 `<X ... />` 或成对 `<X ...></X>`）。 */
function findComponentTagRange(tpl, name, fromIdx = 0) {
  const openRe = new RegExp(`<${name}\\b`, 'g');
  openRe.lastIndex = fromIdx;
  const m = openRe.exec(tpl);
  if (!m) return null;
  const start = m.index;
  const gt = tpl.indexOf('>', start);
  if (gt < 0) return null;
  if (/\/\s*$/.test(tpl.slice(start, gt))) return { start, end: gt + 1 };
  const closeTag = `</${name}>`;
  const closeIdx = tpl.indexOf(closeTag, gt);
  if (closeIdx < 0) return null;
  return { start, end: closeIdx + closeTag.length };
}

export function enforceSiblingRowDirection(files, ctx = {}) {
  const out = { ...files };
  const changes = [];
  const stats = { rows: 0, wrapped: 0, skipped: 0 };
  const secs = Array.isArray(ctx.fullSections) && ctx.fullSections.length > 0
    ? ctx.fullSections
    : ctx.effectiveSections;
  if (!Array.isArray(secs) || secs.length < 2) return { files: out, changes, stats };

  // 相邻并排组
  const rows = [];
  for (let i = 0; i < secs.length - 1; i++) {
    const a = sectionBox(secs[i]);
    const b = sectionBox(secs[i + 1]);
    if (!a || !b) continue;
    if (Math.abs(a.y - b.y) > SIBLING_ROW_TOLERANCE.y) continue;
    if (Math.abs(a.x - b.x) <= SIBLING_ROW_TOLERANCE.x) continue;
    if (Math.abs(a.w - b.w) > SIBLING_ROW_TOLERANCE.width) continue;
    const left = a.x <= b.x ? a : b;
    const right = a.x <= b.x ? b : a;
    rows.push({ i, gap: Math.max(0, Math.round(right.x - (left.x + left.w))) });
  }
  stats.rows = rows.length;
  if (rows.length === 0) return { files: out, changes, stats };

  const entry = Object.entries(files).find(
    ([p, c]) => /package\/index\.vue$/.test(p) && typeof c === 'string',
  );
  if (!entry) {
    stats.skipped = rows.length;
    return { files: out, changes, stats };
  }
  const [fp, fc] = entry;
  const rt = extractRootTemplate(fc);
  if (!rt) {
    stats.skipped = rows.length;
    return { files: out, changes, stats };
  }
  const { tpl, tplStart } = rt;

  // 子组件出现顺序（回退映射用）
  const compOrder = [];
  for (const m of tpl.matchAll(/<([A-Z][\w.]*)\b/g)) {
    const nm = m[1];
    if (!compOrder.some((c) => c.name === nm)) compOrder.push({ name: nm, idx: m.index });
  }
  // sid → 组件名：以组件文件内 `data-section-id` 为唯一权威（防止「夹了别的子组件」时按序错配）
  const sidToComp = new Map();
  for (const [p, c] of Object.entries(files)) {
    const mm = p.match(/package\/components\/([\w.]+)\.vue$/);
    if (!mm || typeof c !== 'string') continue;
    const sid = (c.match(/data-section-id="([^"]+)"/) || [])[1];
    if (sid) sidToComp.set(sid.split('-')[0], mm[1]);
  }
  if (compOrder.length < secs.length && sidToComp.size === 0) {
    stats.skipped = rows.length;
    return { files: out, changes, stats };
  }

  const edits = [];
  for (const r of rows) {
    const sidA = String(secs[r.i]?.id || '').split('-')[0];
    const sidB = String(secs[r.i + 1]?.id || '').split('-')[0];
    const nameA = sidToComp.get(sidA) || compOrder[r.i]?.name;
    const nameB = sidToComp.get(sidB) || compOrder[r.i + 1]?.name;
    if (!nameA || !nameB) {
      stats.skipped++;
      continue;
    }
    const ra = findComponentTagRange(tpl, nameA, 0);
    const rb = findComponentTagRange(tpl, nameB, 0);
    if (!ra || !rb || rb.start < ra.end) {
      stats.skipped++;
      continue;
    }
    // 只处理紧邻（两标签之间只允许空白）：夹了其他子组件 ⇒ 结构不同，交给 LLM/人工，不猜
    if (tpl.slice(ra.end, rb.start).trim() !== '') {
      stats.skipped++;
      continue;
    }
    // 幂等：父容器已是 row（LLM 写对了 / 本刀已包过）⇒ 跳过，防重复包裹
    const pStart = findEnclosingOpenTagStart(tpl, ra.start);
    if (pStart >= 0) {
      const pEnd = tpl.indexOf('>', pStart);
      const pTag = pEnd > 0 ? tpl.slice(pStart, pEnd + 1) : '';
      if (/flex-direction\s*:\s*row/.test(pTag) || /mc-sibling-row/.test(pTag)) {
        stats.skipped++;
        continue;
      }
    }
    const cls = 'mc-sibling-row';
    const style = `display:flex;flex-direction:row;align-items:stretch;column-gap:${r.gap}px;flex:0 0 auto`;
    edits.push({ start: ra.start, end: ra.end, next: `<div class="${cls}" style="${style}">${tpl.slice(ra.start, ra.end)}` });
    edits.push({ start: rb.start, end: rb.end, next: `${tpl.slice(rb.start, rb.end)}</div>` });
    stats.wrapped++;
  }
  if (edits.length === 0) return { files: out, changes, stats };

  let result = fc;
  for (const e of [...edits].sort((x, y) => y.start - x.start)) {
    result = result.slice(0, tplStart + e.start) + e.next + result.slice(tplStart + e.end);
  }
  out[fp] = result;
  changes.push({ file: fp, count: stats.wrapped, gaps: rows.map((r) => r.gap) });
  return { files: out, changes, stats };
}

/** 把网格三元组合并进开标签的 style（剥除冲突声明）。 */
function mergeGridStyleAttr(tag, css) {
  const m = tag.match(/style="([^"]*)"/);
  const drop = /^(display|flex|flex-direction|flex-wrap|flex-flow|gap|column-gap|row-gap|grid-template-columns|grid-auto-flow|grid-template-rows)\s*:/;
  if (!m) return tag.replace(/^(<[A-Za-z][\w-]*)/, `$1 style="${css}"`);
  const kept = m[1]
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => !drop.test(d));
  const merged = [...kept, ...css.split(';').map((d) => d.trim()).filter(Boolean)].join(';');
  return tag.replace(/style="[^"]*"/, `style="${merged}"`);
}

/**
 * 找到包裹 idx 处的最近开标签起点：即 idx 之前**最后一个已闭合的开标签**。
 * 模板内属性值不含裸 '>' 字面量（含则本函数 fail-open 返回 -1，调用方退化为 item 自身）。
 */
function findEnclosingOpenTagStart(tpl, idx) {
  const re = /<([A-Za-z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let best = -1;
  let m;
  while ((m = re.exec(tpl))) {
    if (m.index >= idx) break;
    const end = m.index + m[0].length;
    if (end <= idx && !/\/>$/.test(m[0])) best = m.index;
  }
  return best;
}

const VOID_TAGS = new Set([
  'img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr',
]);

/**
 * 从 open tag 起点匹配同名闭合标签（深度感知；自闭合/void 视为空元素）。
 *
 * @returns {{openEnd:number, closeStart:number, after:number, tag:string} | null}
 */
function matchElementEnd(tpl, openTagStart) {
  const openEnd = tpl.indexOf('>', openTagStart);
  if (openEnd < 0) return null;
  const openTag = tpl.slice(openTagStart, openEnd + 1);
  const nm = /^<([a-zA-Z][\w-]*)/.exec(openTag);
  if (!nm) return null;
  const name = nm[1].toLowerCase();
  if (/\/>$/.test(openTag) || VOID_TAGS.has(name)) {
    return { openEnd: openEnd + 1, closeStart: openEnd + 1, after: openEnd + 1, tag: name };
  }
  let depth = 1;
  const re = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, 'gi');
  re.lastIndex = openEnd + 1;
  let m;
  while ((m = re.exec(tpl))) {
    const isClose = m[1] === '/';
    const selfClose = m[2] === '/';
    if (isClose) {
      depth -= 1;
      if (depth === 0) {
        return { openEnd: openEnd + 1, closeStart: m.index, after: m.index + m[0].length, tag: name };
      }
    } else if (!selfClose && !VOID_TAGS.has(name)) {
      depth += 1;
    }
  }
  return null;
}

/** 枚举 [innerStart, innerEnd) 内的**直接**子元素（整棵子树跳过，不递归）。 */
function directChildElements(tpl, innerStart, innerEnd) {
  const out = [];
  if (innerStart >= innerEnd) return out;
  const tagRe = /<([a-zA-Z][\w-]*)([^>]*)>/g;
  tagRe.lastIndex = innerStart;
  let m;
  while ((m = tagRe.exec(tpl)) && m.index < innerEnd) {
    const name = m[1];
    const start = m.index;
    const r = matchElementEnd(tpl, start);
    if (!r || r.after <= start) break;
    out.push({
      start,
      openEnd: r.openEnd,
      end: r.closeStart,
      after: r.after,
      tag: name.toLowerCase(),
      openTag: tpl.slice(start, r.openEnd),
    });
    tagRe.lastIndex = r.after;
    if (out.length > 64) break;
  }
  return out;
}

/**
 * 定位「静态重复卡」的列容器（无 v-for 场景）。
 *
 * 🔴 2026-11-12（mc-max-1794461835645-82b6cfaa 实锤）：统计段真值 2 列，产物把两张卡
 *   硬编码成两个 div（无 v-for）且容器 `.c-component-stats-cards` 是 `flex-direction:column`
 *   ⇒ 两张卡上下堆叠。`enforceGridColumnTruth` 与 D-GRID 都以「有 v-for」为前提
 *   （`stats.noVfor++` / `if (!host) continue`）⇒ 静态重复卡整条链路无人管。
 *
 * 判据（几何真值 + 结构同构，零语义猜测）：在段锚子树深度 ≤3 内，存在元素其
 *   **直接子元素数恰为 K** 且这些子元素**同构**（class 全等或同名标签）⇒ 该元素即列容器。
 * K 本身来自真值几何聚带（collectGridColumnTruth），不是猜的。
 *
 * @returns {number} 列容器的 open tag 起点；未命中返回 -1
 */
function findStaticColumnContainer(tpl, anchorOpenEnd, K) {
  if (!(K >= 2)) return -1;
  let level = directChildElements(tpl, anchorOpenEnd, tpl.length).slice(0, 8);
  for (let depth = 0; depth < 3 && level.length > 0; depth += 1) {
    for (const el of level) {
      const kids = directChildElements(tpl, el.openEnd, el.end);
      if (kids.length !== K) continue;
      const sig = kids.map((k) => {
        const cls = /class="([^"]*)"/.exec(k.openTag);
        return cls ? cls[1].trim() : `tag:${k.tag}`;
      });
      if (sig.every((s) => s === sig[0])) return el.start;
    }
    const next = [];
    for (const el of level) {
      next.push(...directChildElements(tpl, el.openEnd, el.end).slice(0, 8));
    }
    level = next;
  }
  return -1;
}

export function enforceGridColumnTruth(files, ctx = {}) {
  const out = { ...files };
  const changes = [];
  const stats = { scanned: 0, fixed: 0, resolved: 0, noVfor: 0, noTruth: 0 };
  const secs = Array.isArray(ctx.fullSections) && ctx.fullSections.length > 0
    ? ctx.fullSections
    : ctx.effectiveSections;
  const truth = collectGridColumnTruth(secs || []);
  // 🛡️ 2026-11-12（82b6cfaa 实锤）：段列数真值有两个来源——vision sections 与装配后的
  //   componentPlan.effectiveSections。后者才是 D-GRID 判据的实际入参（同一事实源），
  //   统计卡这类「无 v-for 的静态 K 卡」只在后者里带 gridColumns（vision 只给
  //   layout:'horizontal-2-columns'）⇒ 不合并会整段 fail-open、用户看到卡竖排。
  const planSecs =
    ctx.componentPlan && Array.isArray(ctx.componentPlan.effectiveSections)
      ? ctx.componentPlan.effectiveSections
      : null;
  if (planSecs && planSecs.length > 0) {
    for (const [k, v] of collectGridColumnTruth(planSecs)) {
      if (!truth.has(k)) truth.set(k, v);
    }
  }
  // 🛡️ vision 显式列数声明补充（2026-11-12 · 82b6cfaa）：统计卡段在 vision 里只写
  //   `layout:"horizontal-2-columns"`，没有展开成 `gridColumns`，而 collectGridColumnTruth
  //   的 isGrid 只认 type/layout==='grid' 与 `-list` 后缀 ⇒ 该段永远取不到 K。
  //   这里把「horizontal-N-columns」当作**显式事实**解析出 N（不是猜：N 由 vision 写出），
  //   仅在本段尚无真值时补入；itemW/gap 缺省 ⇒ 落 `minmax(0,1fr)` 等分。
  {
    const addFromLayout = (arr, d = 0) => {
      if (!Array.isArray(arr) || d > 6) return;
      for (const s of arr) {
        if (!s || typeof s !== 'object') continue;
        const sid = String(s.id ?? '');
        if (sid && !truth.has(sid)) {
          const mm = /^horizontal-(\d+)-columns?$/i.exec(String(s.layout || ''));
          const k = mm ? Number(mm[1]) : 0;
          if (k >= 2 && k <= 8) {
            const box = s.figmaBox || s.absoluteBoundingBox || {};
            truth.set(sid, {
              cols: k,
              itemW: 0,
              gap: 0,
              boxW: Math.round(Number(box.width) || 0),
            });
          }
        }
        addFromLayout(s.children, d + 1);
        if (Array.isArray(s.body?.children)) addFromLayout(s.body.children, d + 1);
      }
    };
    addFromLayout(secs || []);
    if (planSecs) addFromLayout(planSecs);
  }
  if (truth.size === 0) return { files: out, changes, stats };

  for (const [fp, fc] of Object.entries(files)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const rt = extractRootTemplate(fc);
    if (!rt) continue;
    const { tpl, tplStart } = rt;
    const edits = [];
    const tagRe = /data-section-id="([^"]+)"/g;
    for (const m of tpl.matchAll(tagRe)) {
      const sid = m[1];
      const t = truth.get(sid) || truth.get(sid.split('-')[0]);
      if (!t) continue;
      stats.scanned++;
      const tagStart = tpl.lastIndexOf('<', m.index);
      if (tagStart < 0) continue;
      const tagEnd = tpl.indexOf('>', m.index);
      if (tagEnd < 0) continue;
      // 段内承载 v-for 的元素（含其自身既是网格容器的情况）
      const win = tpl.slice(tagEnd + 1, tagEnd + 2400);
      const vforIdx = win.search(/\bv-for\s*=/);
      let cStart;
      if (vforIdx < 0) {
        // 🛡️ 静态重复卡（2026-11-12 · 82b6cfaa 实锤）：无 v-for 不等于无列数语义。
        //   真值 K 列而产物把 K 张卡硬编码成 K 个同构兄弟 ⇒ 同样必须声明 K 列，
        //   否则两张卡上下堆叠（本例统计卡竖排，用户肉眼可见第一段布局错）。
        const staticStart = findStaticColumnContainer(tpl, tagEnd, t.cols);
        if (staticStart < 0) {
          stats.noVfor++;
          continue;
        }
        cStart = staticStart;
        stats.staticHit = (stats.staticHit || 0) + 1;
      } else {
        // v-for 通常写在 item 元素上，网格容器是它的父级；父级若就是段根则用 item 自身。
        const vforAbs = tagEnd + 1 + vforIdx;
        const selfStart = tpl.lastIndexOf('<', vforAbs);
        cStart = selfStart;
        const parentStart = findEnclosingOpenTagStart(tpl, selfStart);
        if (parentStart >= 0) {
          const parentEnd = tpl.indexOf('>', parentStart);
          if (parentEnd > 0) {
            const pTag = tpl.slice(parentStart, parentEnd + 1);
            if (!/data-section-id=/.test(pTag)) cStart = parentStart;
          }
        }
      }
      const cEnd = tpl.indexOf('>', cStart) + 1;
      if (cStart < tagEnd || cEnd <= cStart) continue;
      const openTag = tpl.slice(cStart, cEnd);
      const colWidth = t.gap > 0 && t.itemW > 0 ? `${t.itemW}px` : 'minmax(0, 1fr)';
      const colsDecl = `grid-template-columns:repeat(${t.cols}, ${colWidth})`;
      // 🛡️ 幂等判定走 `declaredColumns`（与 D-GRID / GRID-CONTRACT-001 同一实现）：
      //   旧代码只认 `repeat(N`，产物若写成显式轨道 `1fr 1fr 1fr 1fr`（同为 4 列）会被
      //   当「没有列数」重写一遍 —— 同值不同写法属无谓改写，且判据出现第二份口径。
      const existingDecls = parseDeclMap(inlineStyleOf(openTag));
      const existingCols =
        String(existingDecls.display || '').trim().toLowerCase() === 'grid'
          ? declaredColumns(existingDecls)
          : null;
      if (existingCols && existingCols.cols === t.cols) {
        stats.resolved++;
        continue;
      }
      // 🛡️ 2026-11-12：gap 推不出时**不写 gap 声明**（原先兜底 20px 属魔数臆造，
      //   会把产物原有的正确间距覆盖成 20）。宁可少写一条，也不凭空造事实。
      const css = [
        'display:grid',
        colsDecl,
        ...(t.gap > 0 ? [`column-gap:${t.gap}px`, `row-gap:${t.gap}px`] : []),
      ].join(';');
      const next = mergeGridStyleAttr(openTag, css);
      if (next === openTag) {
        stats.resolved++;
        continue;
      }
      edits.push({ start: cStart, end: cEnd, next, sid, cols: t.cols });
    }
    if (edits.length === 0) continue;
    let result = fc;
    for (const e of edits.reverse()) {
      result = result.slice(0, tplStart + e.start) + e.next + result.slice(tplStart + e.end);
    }
    out[fp] = result;
    stats.fixed += edits.length;
    changes.push({ file: fp, count: edits.length, grids: edits.map((e) => ({ sid: e.sid, cols: e.cols })) });
  }
  return { files: out, changes, stats };
}

/**
 * P2-2 enforceCompositeRowTruth（2026-11-12 · mc-max-1794456716158-7f427bd3 实锤立项）
 *
 * 病灶：统计卡这类「图标 + 数值 + 标签」复合卡，LLM 稳定漏写 `display:flex`
 *   （实测 HeaderSection `.header-card` / StatsSection `.stat-card-content` /
 *   `.stat-card-text` 三处全缺）⇒ <img>/<span> 退化为块级，图标、33、66、标签纵向堆叠
 *   且溢出重叠，两张卡挤成一张。视觉分析 notes 明写「每个卡片包含图标、数值和标签」，
 *   但文案 prompt 无法约束 CSS ⇒ 必须在写盘前用几何真值兜底。
 *
 * 判据（可辩驳、单一来源、fail-open）：
 *   ① 组件带 `data-section-id`，且 Figma 树能解析该节点（否则跳过，零臆造）；
 *   ② 该节点子树中存在「图标与文本同一行」的几何事实：
 *      `icon.x + icon.w <= text.x + 1`（图标在文本左侧）**且** y 区间重叠
 *      （重叠判定不用等值阈值 —— 图标 56 高、文本 30 高时 y 永不相等）；
 *   ③ 产物模板中存在复合卡容器：其内部（含上升层）既有 `<img>`，又有 ≥1 个叶子文本元素；
 *   ④ 该容器缺 `display:flex` 或 direction≠row ⇒ 注入
 *      `display:flex;flex-direction:row;align-items:center`；
 *      若两个叶子文本是兄弟（数值 + 标签）⇒ 其共同父注入 column（同父则包一层）：
 *      真值里 33/合作厂商 纵向堆叠、与图标横向并排，这是「卡内两级方向」。
 *
 * 幂等：容器 inline style 已含 `flex-direction:row` 或已包 `.mc-stat-text-col` ⇒ 跳过。
 * 无 Figma 或无行内图标事实 ⇒ 一律不动（不新增臆造布局）。
 *
 * @param {Record<string,string>} files
 * @param {{figmaRoot?: object}} ctx
 * @returns {{files:Record<string,string>, changes:Array, stats:object}}
 */
export function enforceCompositeRowTruth(files, ctx = {}) {
  const out = { ...files };
  const changes = [];
  const stats = { scanned: 0, rowTruth: 0, fixed: 0, skipped: 0, noFigma: 0 };
  const figmaRoot = ctx?.figmaRoot;
  if (!figmaRoot || typeof figmaRoot !== 'object') return { files: out, changes, stats };
  const { nodeById } = collectFigmaIndex(figmaRoot);

  const boxOf = (n) => {
    const b = n?.absoluteBoundingBox || n?.bbox;
    if (!b) return null;
    const x = Number(b.x);
    const y = Number(b.y);
    const w = Number(b.width ?? b.w);
    const h = Number(b.height ?? b.h);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
    return { x, y, w, h };
  };

  // 全局「文本 → 几何」索引（段子树缺 TEXT 时回查，见 hasInlineIconRow 注释）
  const textBoxByChars = new Map();
  {
    const root = figmaRoot.document || figmaRoot;
    const walk = (n, depth) => {
      if (!n || typeof n !== 'object' || depth > 12) return;
      if (String(n.type || '').toUpperCase() === 'TEXT') {
        const chars = String(n.characters || '').trim();
        const b = boxOf(n);
        if (chars && b && !textBoxByChars.has(chars)) textBoxByChars.set(chars, b);
      }
      for (const c of n.children || []) walk(c, depth + 1);
    };
    walk(root, 0);
  }

  const hasInlineIconRow = (node, fallbackTexts = []) => {
    const icons = { named: [], image: [], vector: [] };
    const texts = [];
    const walk = (n, depth) => {
      if (!n || typeof n !== 'object' || depth > 5) return;
      const nm = String(n.name || '').toLowerCase();
      const t = String(n.type || '').toUpperCase();
      const b = boxOf(n);
      if (b) {
        if (t === 'TEXT') texts.push(b);
        // 图标优先级：名字命中 icon > IMAGE > 非背景类 VECTOR。
        //   真值里段内含「背景矩形 265×76」等 VECTOR，若按首个 VECTOR 取会误当图标
        //   ⇒ icon.x+icon.w 顶到容器右边 ⇒ 横排判据恒 false（假阴性）。
        else if (/icon|图标/.test(nm)) icons.named.push(b);
        else if (t === 'IMAGE') icons.image.push(b);
        else if (t === 'VECTOR' && !/bg|background|rectangle|fill|divider|line/.test(nm)) {
          icons.vector.push(b);
        }
      }
      for (const c of n.children || []) walk(c, depth + 1);
    };
    walk(node, 0);
    const icon = icons.named[0] || icons.image[0] || icons.vector[0];
    if (!icon) return false;
    // 🔴 文本可能**不在段节点子树内**：mc-max-1794456716158 实测 38:3260（GROUP 265×76）
    //   子树只有背景 + icon，`33`/`合作厂商` 是兄弟节点 ⇒ 子树 TEXT 为空。
    //   故子树无 TEXT 时，用组件模板里的叶子文本回查全局 `textByChars` 几何。
    let boxes = texts;
    if (boxes.length === 0 && Array.isArray(fallbackTexts) && fallbackTexts.length > 0) {
      boxes = fallbackTexts.map((t) => textBoxByChars.get(String(t).trim())).filter(Boolean);
    }
    if (boxes.length === 0) return false;
    return boxes.some(
      (tb) => icon.x + icon.w <= tb.x + 1 && icon.y < tb.y + tb.h && tb.y < icon.y + icon.h,
    );
  };

  const findElementEnd = (tpl, start) => {
    const m = /^<([A-Za-z][\w-]*)/.exec(tpl.slice(start));
    if (!m) return null;
    const name = m[1];
    if (/^(img|br|input|hr|meta|link)$/i.test(name)) {
      const gt = tpl.indexOf('>', start);
      return gt < 0 ? null : { end: gt + 1, closeStart: gt + 1 };
    }
    const re = new RegExp(`<${name}\\b([^>]*?)(/?)>|</${name}\\s*>`, 'g');
    re.lastIndex = start;
    let depth = 0;
    let t;
    while ((t = re.exec(tpl))) {
      if (t[0].startsWith('</')) {
        depth -= 1;
        if (depth === 0) return { end: t.index + t[0].length, closeStart: t.index };
      } else if (!t[2]) {
        depth += 1;
      }
    }
    return null;
  };

  /** 祖先开标签栈（由外到内）。`findEnclosingOpenTagStart` 是"最后一个已闭合开标签"，
   *  语义是"在此处插入包裹"，拿不到真正父元素 —— 本函数按配平扫描得到真实祖先链。 */
  const ancestorStack = (tpl, idx) => {
    const re = /<(\/?)([A-Za-z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
    const stack = [];
    let m;
    while ((m = re.exec(tpl)) && m.index < idx) {
      const closing = m[1] === '/';
      const name = m[2];
      if (closing) {
        for (let i = stack.length - 1; i >= 0; i -= 1) {
          if (stack[i].name === name) {
            stack.length = i;
            break;
          }
        }
      } else if (!/\/>$/.test(m[0]) && !/^(img|br|input|hr|meta|link)$/i.test(name)) {
        stack.push({ name, start: m.index });
      }
    }
    return stack;
  };

  const LEAF_RE = /<(span|div)\b((?:[^<>"']|"[^"]*"|'[^']*')*?)>([^<>]+)<\/\1\s*>/g;
  const leafTextsIn = (range) => {
    const list = [];
    for (const m of range.matchAll(LEAF_RE)) {
      const text = m[3].trim();
      if (!text) continue;
      list.push({ start: m.index, end: m.index + m[0].length, tag: m[0], text });
    }
    return list;
  };

  for (const [fp, fc] of Object.entries(files)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const sid = (fc.match(/data-section-id="([^"]+)"/) || [])[1];
    if (!sid) continue;
    const node = nodeById.get(sid) || nodeById.get(sid.split('-')[0]);
    if (!node) {
      stats.noFigma += 1;
      continue;
    }
    stats.scanned += 1;

    const rt = extractRootTemplate(fc);
    if (!rt) continue;
    const { tpl, tplStart } = rt;
    const tplTexts = leafTextsIn(tpl).map((l) => l.text);
    if (!hasInlineIconRow(node, tplTexts)) continue;
    stats.rowTruth += 1;

    // 每个 <img> 的复合卡容器：从最内层祖先向外找第一个「含叶子文本」的容器
    //   （图标常被包在 `<div class="icon-wrap">` 纯图标壳里 ⇒ 必须逐级上升，
    //    但一旦某层已有文本就直接停，绝不跳到段根去包裹整卡）。
    const containers = new Set();
    const imgRe = /<img\b[^>]*>/g;
    for (const m of tpl.matchAll(imgRe)) {
      const stack = ancestorStack(tpl, m.index);
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        const p = stack[i].start;
        const pEnd = tpl.indexOf('>', p);
        if (pEnd < 0) break;
        const range = findElementEnd(tpl, p);
        if (!range) break;
        const inner = tpl.slice(pEnd + 1, range.closeStart);
        if (leafTextsIn(inner).length > 0) {
          containers.add(p);
          break;
        }
      }
    }
    if (containers.size === 0) continue;

    const edits = [];
    for (const cStart of containers) {
      const cEnd = tpl.indexOf('>', cStart);
      if (cEnd < 0) continue;
      const cRange = findElementEnd(tpl, cStart);
      if (!cRange) continue;
      const openTag = tpl.slice(cStart, cEnd + 1);
      if (/flex-direction\s*:\s*row/.test(openTag) || /mc-stat-text-col/.test(openTag)) {
        stats.skipped += 1;
        continue;
      }
      const inner = tpl.slice(cEnd + 1, cRange.closeStart);
      const leaves = leafTextsIn(inner);
      // 叶子必须全部落在同一父元素里（数值 + 标签），否则只做 row，不猜分组
      let sameParent = leaves.length >= 2;
      let leafParentStart = -1;
      if (sameParent) {
        const st = ancestorStack(inner, leaves[0].start);
        leafParentStart = st.length > 0 ? st[st.length - 1].start : -1;
        for (const lf of leaves.slice(1)) {
          const st2 = ancestorStack(inner, lf.start);
          const s2 = st2.length > 0 ? st2[st2.length - 1].start : -1;
          if (s2 !== leafParentStart) {
            sameParent = false;
            break;
          }
        }
      }
      const rowCss = 'display:flex;flex-direction:row;align-items:center';
      edits.push({ start: cStart, end: cEnd + 1, next: mergeGridStyleAttr(openTag, rowCss) });
      if (sameParent) {
        const colCss = 'display:flex;flex-direction:column;align-items:flex-start';
        // leafParentStart = -1 ⇒ 叶子直接挂在卡容器（无共同子容器）⇒ 现在包一层 column 壳
        if (leafParentStart <= 0) {
          // 叶子直接挂在卡容器 ⇒ 包一层 column 壳（不依赖产物 less 里是否已有该类规则）
          const firstLeafAbs = cEnd + 1 + leaves[0].start;
          const lastLeafAbs = cEnd + 1 + leaves[leaves.length - 1].end;
          edits.push({ start: lastLeafAbs, end: lastLeafAbs, next: '</div>' });
          edits.push({
            start: firstLeafAbs,
            end: firstLeafAbs,
            next: `<div class="mc-stat-text-col" style="${colCss}">`,
          });
        } else {
          const lpIdxEnd = inner.indexOf('>', leafParentStart);
          if (lpIdxEnd >= 0) {
            const lpOpen = inner.slice(leafParentStart, lpIdxEnd + 1);
            if (!/flex-direction\s*:\s*column/.test(lpOpen)) {
              // 坐标换算：inner 内的绝对下标 → tpl 坐标（+ cEnd+1）；不可再把
              // leafParentStart 与 lpIdxEnd 相加（曾因此把 end 算到模板外，
              // 多删 143 字符，mc-max-1794456716158 离线验证当场抓出）。
              edits.push({
                start: cEnd + 1 + leafParentStart,
                end: cEnd + 1 + lpIdxEnd + 1,
                next: mergeGridStyleAttr(lpOpen, colCss),
              });
            }
          }
        }
      }
      stats.fixed += 1;
    }
    if (edits.length === 0) continue;
    let result = fc;
    for (const e of edits.sort((a, b) => b.start - a.start)) {
      result = result.slice(0, tplStart + e.start) + e.next + result.slice(tplStart + e.end);
    }
    if (result !== fc) {
      out[fp] = result;
      changes.push({ file: fp, count: containers.size });
    }
  }
  return { files: out, changes, stats };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 刀 56 / P2-3：容器主轴（flex-direction）真值归一
 * （2026-11-12 · mc-max-1794462282698-2c855ae0 实锤立项）
 *
 * 事故形态：分组容器同时存在两条矛盾声明 ——
 *     inline `style="display:flex;flex-direction:row"`（LLM 写的）
 *     scoped class `.c-component-group-2136638434 { flex-direction: column }`（按 Figma 生成）
 *   inline 优先级更高 ⇒ 图标、标题、4 个行容器全被挤进一行，文本互相压字
 *   ⇒ RUNTIME-016（12 对 text-overlap）+ VISUAL-002 阻断交付，肉眼「第一 section 布局错误」。
 *   旧链路无任何一刀看「同一元素上主轴声明是否自相矛盾」，也没有判据比对真值主轴方向。
 *
 * 判据（唯一事实源 = Figma 几何，不猜、不硬编码）：
 *   元素 → Figma 节点两条路径（都要求唯一命中，否则 fail-open）：
 *     ① `data-section-id` 直接命中；
 *     ② class 名中的 ≥5 位数字 ↔ Figma 节点 name 中同名数字
 *        （产物类名由 `c-component-<kind>-<figmaNameNumber>` 派生，如
 *          `c-component-group-2136638434` ↔ `Group 2136638434`）。
 *   节点主轴由**直接子元素几何的 y 带数**判定：
 *     子元素聚成 ≥2 个 y 带 ⇒ 纵向主轴（column）；只有一个 y 带且 x 显著分散 ⇒ 横向（row）。
 *     该判据对「分组容器（图标/标题/多行）」= column、「行容器（4 卡同 y）」= row、
 *     「复合卡（图标+数值+标签同 y）」= row 全部成立，且与容器宽度无关（不受 4 列铺满误导）。
 *   排除项：背景矩形 / 纯装饰 RECTANGLE（其覆盖整框，会污染 y 带聚类）。
 *
 * 动作：有效主轴（inline 优先，无 inline 用本文件 scoped class）与真值不符 ⇒ 把 inline
 *   写成真值（inline 必胜，确定性生效；class 保留不动以免误伤复用该类名的其它元素）。
 *   有效主轴**声明都不存在**时不动（可能由公共 less 提供，无从判断 ⇒ fail-open）。
 * ═══════════════════════════════════════════════════════════════════════════ */

const AXIS_NUM_RE = /\d{5,}/g;

function axisBoxOf(n) {
  const b = n?.absoluteBoundingBox || n?.bbox;
  if (!b) return null;
  const x = Number(b.x);
  const y = Number(b.y);
  const w = Number(b.width ?? b.w);
  const h = Number(b.height ?? b.h);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/** 由 Figma 节点直接子元素几何判定主轴：'column' | 'row' | null（判不出）。 */
function judgeAxisFromNode(node) {
  const kids = [];
  for (const c of node?.children || []) {
    const b = axisBoxOf(c);
    if (!b) continue;
    const nm = String(c.name || '').toLowerCase();
    const t = String(c.type || '').toUpperCase();
    // 背景/装饰矩形会铺满整框，参与聚类会把所有行并成一个带 ⇒ 排除。
    if (/^(bg|background|rectangle|rect|line|divider|fill|shadow|mask|ellipse)/.test(nm)) continue;
    if (t === 'RECTANGLE' && !/icon/.test(nm)) continue;
    kids.push(b);
  }
  if (kids.length < 2) return null;
  const sorted = [...kids].sort((a, b) => a.y - b.y);
  let bands = 0;
  let bandBottom = Number.NEGATIVE_INFINITY;
  for (const b of sorted) {
    const tol = Math.min(2, b.h * 0.5);
    if (b.y > bandBottom - tol) {
      bands += 1;
      bandBottom = b.y + b.h;
    } else {
      bandBottom = Math.max(bandBottom, b.y + b.h);
    }
  }
  if (bands >= 2) return 'column';
  const spanX = Math.max(...kids.map((b) => b.x + b.w)) - Math.min(...kids.map((b) => b.x));
  const minW = Math.min(...kids.map((b) => b.w));
  if (spanX > Math.max(minW * 1.2, 8)) return 'row';
  return null;
}

/** 从 `<style>` 文本里解析「单类选择器 → flex-direction」（嵌套块/组合选择器跳过）。 */
function parseClassFlexDirs(css) {
  const map = new Map();
  const src = String(css || '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const body = m[2];
    const fd = /flex-direction\s*:\s*(row|column)\b/i.exec(body);
    if (!fd) continue;
    const val = fd[1].toLowerCase();
    for (const part of m[1].split(',')) {
      const p = part.trim().replace(/^&/, '').trim();
      const cm = /^\.([A-Za-z0-9_-]+)$/.exec(p);
      if (!cm) continue;
      const key = cm[1];
      if (!map.has(key)) map.set(key, val);
      else if (map.get(key) !== val) map.set(key, null); // 同名多值 ⇒ 歧义，不用
    }
  }
  return map;
}

function firstClassDir(cls, classDirs) {
  for (const c of String(cls || '').split(/\s+/)) {
    if (!c || !classDirs.has(c)) continue;
    const v = classDirs.get(c);
    if (v) return v;
  }
  return null;
}

/** 把开标签的 inline style 主轴写成 dir（保留其它声明；缺失 display:flex 时补上）。 */
function setInlineFlexDirection(tag, dir) {
  const need = `display:flex;flex-direction:${dir}`;
  const m = tag.match(/\sstyle="([^"]*)"/);
  if (!m) return tag.replace(/^(<[A-Za-z][\w-]*)/, `$1 style="${need}"`);
  let css = m[1].trim().replace(/;+$/, '');
  if (/flex-direction\s*:/i.test(css)) {
    css = css.replace(/flex-direction\s*:\s*[A-Za-z-]+/i, `flex-direction:${dir}`);
  } else {
    css = `${css};flex-direction:${dir}`;
  }
  if (!/(^|;)\s*display\s*:/i.test(css)) css = `display:flex;${css}`;
  return tag.replace(/\sstyle="[^"]*"/, ` style="${css}"`);
}

/** 元素 → 候选 Figma 节点集合（段 id 命中即唯一；否则取类名数字对应的全部同名节点）。 */
function resolveAxisNodes(attrs, cls, nodeById, byNameNum) {
  const sid = (typeof attrs === 'string' ? attrs.match(/data-section-id="([^"]+)"/) : null)?.[1];
  if (sid && nodeById.has(sid)) return [nodeById.get(sid)];
  const ids = new Set();
  for (const num of String(cls || '').match(AXIS_NUM_RE) || []) {
    for (const id of byNameNum.get(num) || []) ids.add(id);
  }
  return [...ids].map((id) => nodeById.get(id)).filter(Boolean);
}

/** 干跑扫描（修复刀与门禁/诊断共用的唯一判据实现）。 */
function scanMainAxis(files, ctx = {}) {
  const hits = [];
  const stats = { scanned: 0, conflicts: 0, mismatch: 0, noTruth: 0, skipped: 0, ambiguous: 0 };
  const figmaRoot = ctx?.figmaRoot;
  if (!figmaRoot || typeof figmaRoot !== 'object') return { hits, stats };
  const { nodeById } = collectFigmaIndex(figmaRoot);
  // 同名图层数字 → 节点 id 列表。Figma 里 `Frame 2136639905` 这类图层名会被复用
  //   （真机 11 处），若按「必须唯一」处理会把绝大多数容器全部跳过（覆盖缺口）。
  //   同名的复用节点形态一致 ⇒ 取「全部同名节点主轴的交集」仍可辩驳：
  //   交集唯一才采用，出现两种方向说明该名字并非同一形态 ⇒ fail-open 不动。
  const byNameNum = new Map();
  for (const [id, n] of nodeById) {
    for (const num of String(n?.name || '').match(AXIS_NUM_RE) || []) {
      if (!byNameNum.has(num)) byNameNum.set(num, []);
      const arr = byNameNum.get(num);
      if (!arr.includes(id)) arr.push(id);
    }
  }

  for (const [fp, fc] of Object.entries(files)) {
    if (!fp.endsWith('.vue') || typeof fc !== 'string') continue;
    const rt = extractRootTemplate(fc);
    if (!rt) continue;
    const { tpl, tplStart } = rt;
    const styleText = [...fc.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
    const classDirs = parseClassFlexDirs(styleText);
    const tagRe = /<([A-Za-z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
    for (const m of tpl.matchAll(tagRe)) {
      if (/\/>$/.test(m[0])) continue;
      const attrs = m[2] || '';
      const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
      const inlineRaw = (attrs.match(/style="([^"]*)"/) || [])[1] || '';
      const inlineFd = (inlineRaw.match(/flex-direction\s*:\s*(row|column)/i) || [])[1];
      // 与本刀无关的元素直接跳过：既无 inline 主轴、类名又不带 Figma 数字，
      // 不可能映射到真值节点（省掉全量查树，避免大模板拖慢）。
      if (!inlineFd && !/\d{5,}/.test(cls)) continue;
      const nodes = resolveAxisNodes(attrs, cls, nodeById, byNameNum);
      if (nodes.length === 0) {
        stats.ambiguous += 1;
        continue;
      }
      // 同名复用节点 ⇒ 取主轴交集：唯一才采用，两种方向并存即无法归因（fail-open）。
      const axes = new Set();
      for (const n of nodes) {
        const a = judgeAxisFromNode(n);
        if (a) axes.add(a);
      }
      if (axes.size === 0) {
        stats.noTruth += 1;
        continue;
      }
      if (axes.size > 1) {
        stats.ambiguous += 1;
        continue;
      }
      const truth = [...axes][0];
      stats.scanned += 1;
      const classFd = firstClassDir(cls, classDirs);
      const eff = inlineFd ? inlineFd.toLowerCase() : classFd;
      if (!eff) {
        // 无 inline、本文件 class 也没声明 ⇒ 可能来自公共 less，无从判断 ⇒ 不动。
        stats.skipped += 1;
        continue;
      }
      if (eff === truth) continue;
      if (inlineFd && classFd && classFd !== inlineFd) stats.conflicts += 1;
      else stats.mismatch += 1;
      hits.push({
        file: fp,
        nodeId: String(nodes[0].id),
        nodeName: String(nodes[0].name || ''),
        nodeCount: nodes.length,
        cls,
        eff,
        truth,
        hasInline: !!inlineFd,
        start: tplStart + m.index,
        end: tplStart + m.index + m[0].length,
        next: setInlineFlexDirection(m[0], truth),
      });
    }
  }
  return { hits, stats };
}

/** 干跑：返回主轴不符真值的元素清单（诊断 / 门禁共用，不写盘）。 */
export function detectContainerMainAxisConflicts(files, ctx = {}) {
  const { hits, stats } = scanMainAxis(files, ctx);
  return {
    hits: hits.map(({ file, nodeId, nodeName, cls, eff, truth, hasInline }) => ({
      file, nodeId, nodeName, cls, effective: eff, truth, hasInline,
    })),
    stats,
  };
}

/** 修复：按 Figma 几何真值把容器主轴写成正确方向（确定性，fail-open）。 */
export function enforceContainerMainAxisTruth(files, ctx = {}) {
  const out = { ...files };
  const changes = [];
  const { hits, stats } = scanMainAxis(files, ctx);
  const byFile = new Map();
  for (const h of hits) {
    if (!byFile.has(h.file)) byFile.set(h.file, []);
    byFile.get(h.file).push(h);
  }
  for (const [fp, list] of byFile) {
    const fc = files[fp];
    if (typeof fc !== 'string') continue;
    let s = fc;
    for (const e of [...list].sort((a, b) => b.start - a.start)) {
      s = s.slice(0, e.start) + e.next + s.slice(e.end);
    }
    // 安全阀：编辑只允许「等长或变长」（只改属性值/追加声明），变短说明下标越界 ⇒ 丢弃该文件。
    if (s.length < fc.length) continue;
    if (s === fc) continue;
    out[fp] = s;
    changes.push({
      file: fp,
      count: list.length,
      axes: list.slice(0, 6).map((h) => `${h.cls || h.nodeId}:${h.eff}→${h.truth}`),
    });
  }
  stats.fixed = changes.reduce((a, c) => a + c.count, 0);
  return { files: out, changes, stats };
}
