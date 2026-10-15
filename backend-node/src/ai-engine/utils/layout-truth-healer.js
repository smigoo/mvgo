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
 */
const SLOT_CON_BG_PRIORITY = [
  'color-bg-page',
  'color-bg-container',
  'color-bg-base',
  'color-bg',
];

export function ensureSlotConBackground(files) {
  const out = { ...files };
  const changes = [];
  const skipped = [];

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
