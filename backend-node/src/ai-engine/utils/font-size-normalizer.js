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

/** 默认字体基准（与 theme-vars 的 @font-size-base 一致） */
export const FONT_BASE_PX = 14;
/** 契约允许的最小字号（≤该值豁免，视作非字体量） */
export const MIN_FONT_PX = 5;

function ratioOf(px, base = FONT_BASE_PX) {
  const r = px / base;
  if (Math.abs(r - 1) < 1e-6) return null; // 基准值 → 直接用 @fontSize
  return Number(r.toFixed(4));
}

/**
 * 归一单段文本（.less / .css / SFC 的 style 块均适用）。
 * 使用 LESS 变量 @fontSize（由 theme-vars.less 定义为 var(--fontSize)）。
 * @param {string} text
 * @param {{base?:number}} [options]
 * @returns {{ text:string, changes:Array<{from:string,to:string}> }}
 */
export function normalizeFontSizeLiterals(text = '', options = {}) {
  const base = options.base || FONT_BASE_PX;
  const changes = [];
  let out = String(text);
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
