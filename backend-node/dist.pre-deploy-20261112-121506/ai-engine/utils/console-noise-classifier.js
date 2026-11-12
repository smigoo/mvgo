/**
 * 🛡️ 2026-11-05 C3 门禁证据治理 · console 噪声判据（纯函数、零依赖）
 *
 * 方案：docs/2026-11-05-四任务样式各异根因修复方案.md §3.2
 *
 * 沿用 `runtime-error-classifier.js` 的既有先例：纯函数、零依赖、无 import.meta，
 * 便于 jest 单测且可被 graph / 其它门禁复用；从 `roles/screenshot-renderer.js`
 * 抽出，避免 spec 为测三个纯函数而拉起 Puppeteer 渲染器的重依赖。
 *
 * 根因（真机 `server.log:34709`，任务 mc-max-1793849137209-40c7c1a7）：
 *   - 渲染期过滤（函数内 ignoredConsoleErrorPatterns，仅 1 条）与分类期
 *     benign 判据（3 条）是**两套事实源** ⇒ 同一条 console.error 在采集阶段被
 *     收进 issues、在分类阶段才被判 benign，RUNTIME-010 误报。
 *   - `LOCAL_RUNTIME_URL_PATTERNS` 名为 LOCAL，却把 `node_modules/.vite/deps`
 *     的预构建 chunk 也算作组件自身运行时代码 ⇒ 一条 antd Table `rowKey`
 *     deprecation warning 被升级成 `RUNTIME-010-FATAL`。
 *
 * 判据只认结构（warning 文本形态 + 来源是否第三方依赖路径），
 * **不认组件名 / 任务 id / 文件名**；不放宽组件自身运行时错误的 fatal 判定。
 */

/** console 噪声判据单一事实源：渲染期过滤与分类期 benign 共用 */
export const CONSOLE_NOISE_PATTERNS = [
  /Permissions policy violation: unload is not allowed in this document\.?/i,
  /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i,
  /favicon\.ico/i,
];

/** 产物自身运行时脚本异常（确定性缺陷，必须回流修正） */
const RUNTIME_FATAL_CONSOLE_PATTERNS = [
  /TypeError/i,
  /ReferenceError/i,
  /SyntaxError/i,
  /RangeError/i,
  /Cannot read properties of undefined/i,
  /Cannot read properties of null/i,
  /Cannot set properties of undefined/i,
  /Cannot set properties of null/i,
  /is not defined/i,
  /Unhandled/i,
  /Unexpected token/i,
];

/** 组件自身运行时代码路径（预览页 / workspace / 产物 js|vue） */
const LOCAL_RUNTIME_URL_PATTERNS = [
  /\/preview\//i,
  /\/__raw\//i,
  /\/workspace\//i,
  /\/component\.js(?:\?|$)/i,
  /\/index\.vue(?:\?|$)/i,
  /\.(js|mjs|ts|vue)(?:\?|$)/i,
];

/** 第三方依赖路径：node_modules / vite 预构建产物，不是组件自身运行时代码 */
const THIRD_PARTY_URL_PATTERNS = [
  /\/node_modules\//i,
  /\/\.vite\/deps\//i,
];

/** 第三方库 deprecation warning 的结构形态：`Warning: [<lib>: <component>] ... deprecated` */
const THIRD_PARTY_WARNING_RE = /^\s*Warning:\s*\[[^\]]+\][\s\S]*\bdeprecat(?:ed|ion)\b/i;

export function isThirdPartyWarning(entry = {}) {
  const text = String(entry?.text || '');
  const url = String(entry?.location?.url || '');
  return THIRD_PARTY_WARNING_RE.test(text) && THIRD_PARTY_URL_PATTERNS.some((re) => re.test(url));
}

export function isBenignConsoleError(entry = {}) {
  const text = `${entry?.text || ''} ${entry?.location?.url || ''}`.trim();
  return CONSOLE_NOISE_PATTERNS.some((pattern) => pattern.test(text)) || isThirdPartyWarning(entry);
}

export function isFatalConsoleError(entry = {}) {
  const text = entry?.text || '';
  // 第三方库 deprecation warning 不是产物自身运行时缺陷。
  if (isThirdPartyWarning(entry)) return false;
  if (RUNTIME_FATAL_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return true;
  const locationUrl = entry?.location?.url || '';
  // 第三方依赖预构建 chunk 不得按「本地运行时代码」判 fatal。
  if (THIRD_PARTY_URL_PATTERNS.some((re) => re.test(locationUrl))) return false;
  return !!locationUrl && LOCAL_RUNTIME_URL_PATTERNS.some((pattern) => pattern.test(locationUrl));
}
