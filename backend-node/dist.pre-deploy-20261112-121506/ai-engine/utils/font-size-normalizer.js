/**
 * @file font-size-normalizer.js — 🛡️ P1.8（2026-09-11）：**硬编码字号的确定性归一**。
 *
 * 背景（mc-check M5-7「禁止硬编码字体大小 >5px」）：max 路径靠 prompt 让模型写
 * `calc(@fontSize * 系数)`，lite 路径的 prompt 无该约束且不过 file-writer 归一链
 * → 产物里 `font-size: 15px / 13px / 26px` 原样落盘 → M5-7 报错一片（用户截图 5 条）。
 *
 * 归一约定（与 max 合格产物一致，实样取证）：
 *   14px → @fontSize（LESS 变量，由 theme-vars.less 定义为 var(--fontSize)）
 *   12px → calc(@fontSize * 0.8571)
 *   16px → calc(@fontSize * 1.1429)
 * 即：ratio = px / 基准(14)，保留 4 位小数；≤5px 视为「非字体场景」（图标尺寸/边框等）不改。
 *
 * 只处理 **CSS 声明**（`font-size:` 后紧跟 px 值）；不动 JS 字符串、不动 url()、不动注释。
 * jest 安全：无 import.meta。
 */

import { FG_TAKEOVER_CLASS_RX } from './folded-grid-section-takeover.js';

/** 默认字体基准（与 theme-vars 的 @font-size-base 一致） */
export const FONT_BASE_PX = 14;
/** 契约允许的最小字号（≤该值豁免，视作非字体量） */
export const MIN_FONT_PX = 5;

/**
 * 🛡️ 正文字号下限比例（2026-10-30）—— **单一来源，禁止任何地方再硬编码 0.75**。
 *
 * 背景（实锤 c-deployment-node-overview-74d5fe95）：Lite prompt 的 P0-4「空间不足优先缩字号」
 * 条款没有任何下限，LLM 为把内容塞进画布直接把正文压到 8px（归一后 = `calc(@fontSize * 0.5714)`），
 * 产物不可读。只靠后处理钳制属于治标，必须在**生成阶段**就把下限写进 prompt。
 *
 * 三个消费方必须引用本常量（改一处即全局生效，避免分叉）：
 *   ① microcode-engineer `ensureMinFontSize` 的默认 minRatio（后处理兜底）
 *   ② lite.service `buildCodegenPrompt` / `buildMicrocodeCodegenPrompt` 的字号下限铁律（生成阶段约束）
 *   ③ 对应 spec 的一致性断言
 */
export const MIN_BODY_FONT_RATIO = 0.75;

/** 正文字号下限（px）= FONT_BASE_PX × MIN_BODY_FONT_RATIO ⇒ 14 × 0.75 = 10.5px */
export const MIN_BODY_FONT_PX = Number((FONT_BASE_PX * MIN_BODY_FONT_RATIO).toFixed(2));

/**
 * 🛡️ 默认豁免的选择器（2026-10-22 round-12 实锤）：刀 53 确定性接管类。
 * 这类规则的 font-size 由 Figma 真值渲染（`font-size: 16px`），归一成
 * `calc(@fontSize * 1.1429)` 后实测塌成 13.71px ⇒ 真值失真。
 * 传 `options.skipSelectors = []` 可显式关闭（测试用）。
 */
export const DEFAULT_SKIP_SELECTOR_RXS = [FG_TAKEOVER_CLASS_RX];

/**
 * 把命中豁免选择器的**整条规则块**占位抠出，保证后续归一正则碰不到它。
 * @param {string} text
 * @param {RegExp[]} skipSelectors
 * @returns {{ text:string, restore:(t:string)=>string }}
 */
function protectSkippedBlocks(text, skipSelectors) {
  const slots = [];
  const masked = String(text).replace(/([^{};]*)\{([^{}]*)\}/g, (whole, sel) => {
    if (skipSelectors.some((rx) => rx.test(sel))) {
      slots.push(whole);
      return `\u0000S${slots.length - 1}\u0000`;
    }
    return whole;
  });
  return {
    text: masked,
    restore: (t) =>
      slots.length
        ? String(t).replace(/\u0000S(\d+)\u0000/g, (_m, i) => slots[Number(i)] ?? '')
        : String(t),
  };
}

function ratioOf(px, base = FONT_BASE_PX) {
  const r = px / base;
  if (Math.abs(r - 1) < 1e-6) return null; // 基准值 → 直接用 @fontSize
  return Number(r.toFixed(4));
}

/**
 * 🛡️ 把 **fg- 类标签的 style 属性**占位抠出（round-16 实锤）。
 *
 * 背景：微码预览运行时里 SFC scoped style 块**不生效**（54 个 stylesheet 无 fg- 规则），
 * font-size 只有内联才能落 DOM；但内联 `font-size:24px` 会被本归一器改写成
 * `calc(@fontSize * 1.7143)`（LESS 变量在模板 style 属性里是非法 CSS，浏览器丢弃
 * ⇒ 字号塌回继承值，round-10/16 双实锤）。故 fg- 标签（class 命中 FG_TAKEOVER_CLASS_RX）
 * 的 style 属性值整段占位保护。`:style` 绑定不在匹配范围（归一正则也不碰 JS 表达式）。
 * @param {string} text
 * @returns {{ text:string, restore:(t:string)=>string }}
 */
function protectFgTagInlineStyles(text) {
  const slots = [];
  const masked = String(text).replace(/<[a-zA-Z][^>]*>/g, (tag) => {
    if (!FG_TAKEOVER_CLASS_RX.test(tag)) return tag;
    return tag.replace(/(\bstyle=")([^"]*)(")/g, (_m, pre, styleVal, post) => {
      slots.push(styleVal);
      return `${pre}\u0000I${slots.length - 1}\u0000${post}`;
    });
  });
  return {
    text: masked,
    restore: (t) =>
      slots.length
        ? String(t).replace(/\u0000I(\d+)\u0000/g, (_m, i) => slots[Number(i)] ?? '')
        : String(t),
  };
}

/**
 * 归一单段文本（.less / .css / SFC 的 style 块均适用）。
 * 使用 LESS 变量 @fontSize（由 theme-vars.less 定义为 var(--fontSize)）。
 * @param {string} text
 * @param {{base?:number, skipSelectors?:RegExp[]}} [options]
 *   - skipSelectors：命中这些选择器的规则块整块豁免（默认 `DEFAULT_SKIP_SELECTOR_RXS`）。
 * @returns {{ text:string, changes:Array<{from:string,to:string}> }}
 */
export function normalizeFontSizeLiterals(text = '', options = {}) {
  const base = options.base || FONT_BASE_PX;
  const skip = Array.isArray(options.skipSelectors)
    ? options.skipSelectors
    : DEFAULT_SKIP_SELECTOR_RXS;
  const changes = [];
  const guard = skip.length ? protectSkippedBlocks(text, skip) : null;
  const inlineGuard = skip.length
    ? protectFgTagInlineStyles(guard ? guard.text : String(text))
    : null;
  let out = inlineGuard ? inlineGuard.text : guard ? guard.text : String(text);
  // 去掉注释，避免注释里的示例被改（处理完再还原）
  const comments = [];
  out = out.replace(/\/\*[\s\S]*?\*\//g, (m) => {
    comments.push(m);
    return `\u0000C${comments.length - 1}\u0000`;
  });
  const lineComments = [];
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => {
    lineComments.push(m);
    return `${p1}\u0000L${lineComments.length - 1}\u0000`;
  });

  out = out.replace(
    /(^|[^-\w])font-size\s*:\s*(-?\d+(?:\.\d+)?)\s*px\b/g,
    (whole, prefix, numStr) => {
      const px = Number(numStr);
      if (!Number.isFinite(px) || px <= MIN_FONT_PX) return whole;
      const ratio = ratioOf(px, base);
      // 🛡️ M5-6 修复：使用 LESS 变量 @fontSize（由 theme-vars.less 定义）
      // 而非 CSS 变量 var(--fontSize)，mc-check 检查的是 LESS 变量
      const to =
        ratio === null
          ? `font-size: @fontSize`
          : `font-size: calc(@fontSize * ${ratio})`;
      changes.push({ from: whole.trim(), to });
      return `${prefix}${to}`;
    },
  );

  // 还原注释
  out = out.replace(/\u0000L(\d+)\u0000/g, (_m, i) => lineComments[Number(i)]);
  out = out.replace(/\u0000C(\d+)\u0000/g, (_m, i) => comments[Number(i)]);
  // 还原豁免（顺序：先注释 → 内联属性 → 规则块；三者占位前缀不同不会互吃）
  if (inlineGuard) out = inlineGuard.restore(out);
  if (guard) out = guard.restore(out);
  return { text: out, changes };
}

/**
 * 归一产物文件表（只改 .vue 的 <style> 块与 .less/.css 文件）。
 * @param {Object<string,string>} files
 * @returns {{ files:Object<string,string>, changes:Array<{path:string,from:string,to:string}> }}
 */
export function normalizeFontSizesInFiles(files = {}) {
  const next = { ...files };
  const changes = [];
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (/\.(less|css)$/i.test(p)) {
      const r = normalizeFontSizeLiterals(c);
      for (const ch of r.changes) changes.push({ path: p, ...ch });
      if (r.changes.length > 0) next[p] = r.text;
    } else if (/\.vue$/i.test(p) && /<style/i.test(c)) {
      const out = c.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (whole, body) => {
        const r = normalizeFontSizeLiterals(body);
        for (const ch of r.changes) changes.push({ path: p, ...ch });
        return r.changes.length > 0 ? whole.replace(body, r.text) : whole;
      });
      if (out !== c) next[p] = out;
    }
  }
  return { files: next, changes };
}
