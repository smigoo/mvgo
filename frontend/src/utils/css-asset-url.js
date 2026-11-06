/**
 * 组件预览：CSS 资源 URL 重写（单一事实源）
 *
 * 背景（2026-11-05 真机实锤 · 用户报告「img icon 能还原，背景资源不还原」）：
 *   微码组件的 `<style lang="less">` 与 `resources/styles/index.css` 里，静态资源一律写
 *   **相对路径**（`url('../images/bg-8439.png')` / `url('../resources/images/bg-7890.png')`），
 *   这是标准 Vite / webpack 语义——打包器会按「该 CSS 文件所在位置」解析并产出带 hash 的 URL。
 *
 *   但预览环境没有打包器：
 *     ① `views/preview/index.vue#loadProd` 把 index.css 用 `fetch` 取成**文本**，再
 *        `style.textContent = css` 内联注入 `<head>`。内联样式表没有自己的 URL，
 *        `url()` 的解析基准退化为**文档 URL**（`http://host/#/preview?...`）⇒
 *        请求变成 `http://host/images/bg-8439.png` ⇒ 404 ⇒ **背景图整片不显示**。
 *     ② `loadVue3Runtime.js#injectGlobalIndexCss` 同理（fetch + textContent）。
 *     ③ 图标之所以正常，是因为它走 `import labAsset from '../resources/images/icon-x.png'`
 *        → `handleModule` 返回 `${base}/${rel}` 绝对 URL，绕开了 CSS url 解析。
 *
 *   ⇒ 现象与用户观察完全一致：**icon 对、bg 错**。修法必须在「内联注入之前」把相对 url
 *     提升为绝对 URL，且基准必须是**该 CSS 文件自身的虚拟路径**，不是组件根、更不是页面 URL。
 *
 * 判据纪律：
 *   - 只重写「相对引用」；已是绝对 / 协议 / 片段 / 变量的一律原样返回（幂等）。
 *   - 不猜扩展名、不补目录：解析结果完全由 `new URL(raw, baseUrl)` 决定。
 */

/**
 * 已经是「自带基准」的引用，不需要也没有相对位置可解析。
 * 覆盖：`data:` / `blob:` / `http(s):` / `//cdn…` / `/abs/path` / `#fragment` / `about:`。
 */
const SELF_ANCHORED_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i;

/** `url(...)` 抓取：优先引号包裹（可含空格），其次裸值（不含空白与右括号）。 */
const URL_FN_RE = /url\(\s*(?:(["'])([^"']*)\1|([^)'"\s]+))\s*\)/gi;

function shouldRewrite(raw) {
  if (!raw) return false;
  const v = String(raw).trim();
  if (!v) return false;
  if (SELF_ANCHORED_RE.test(v)) return false;
  // CSS 变量 / 函数值（var(--x)、attr(...) 等）不是路径
  if (/^[a-z-]+\(/i.test(v)) return false;
  return true;
}

/**
 * 把一段 CSS 文本里的相对 `url()` 重写为绝对 URL。
 *
 * @param css      CSS 文本（可以是完整样式表，也可以是 `<style>` 内的一段）
 * @param baseUrl  该 CSS 内容的**解析基准**，应为绝对 URL；传相对路径时会以 `location.origin` 补齐。
 *                 例：`http://host/api/preview/g/c/resources/styles/index.css`
 *                 ⇒ `url('../images/bg-1.png')` → `http://host/api/preview/g/c/resources/images/bg-1.png`
 * @returns 重写后的文本；`baseUrl` 不可解析时**原样返回**（绝不让预览因路径工具崩掉）。
 */
export function rewriteCssAssetUrls(css, baseUrl) {
  if (!css || !baseUrl) return css;
  let absBase;
  try {
    const origin = typeof location !== 'undefined' && location.origin ? location.origin : 'http://localhost';
    absBase = new URL(baseUrl, origin).href;
  } catch {
    return css;
  }
  return css.replace(URL_FN_RE, (full, _quote, quoted, bare) => {
    const raw = quoted !== undefined ? quoted : bare;
    if (!shouldRewrite(raw)) return full;
    try {
      return `url("${new URL(String(raw).trim(), absBase).href}")`;
    } catch {
      return full;
    }
  });
}

/**
 * 只重写 SFC 源码中 `<style>` 块内的相对 `url()`，`<template>` / `<script>` 原样不动。
 *
 * 用途：在 `precompileVueLess` **之前**前处理。此时能拿到该 `.vue` 的真实相对路径 `rel`，
 * 基准最准确；若放到 less 编译之后，`@import` 内联进来的规则会以本文件为基准算错目录。
 *
 * @param src     `.vue` 源码
 * @param baseUrl 该 `.vue` 文件自身的绝对 URL（`${base}/${rel}`）
 */
export function rewriteVueStyleAssetUrls(src, baseUrl) {
  if (!src || !baseUrl || !/<style\b/i.test(src)) return src;
  return src.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_full, open, body, close) => {
    return open + rewriteCssAssetUrls(body, baseUrl) + close;
  });
}

/**
 * 重写 SFC `<template>` 里 img 的**静态相对 src** 为绝对 URL（模板兜底通道）。
 *
 * 背景（2026-11-06 真机实锤 · mc-lite-1793913244590-bdfba71d 续跑后预览图标破图）：
 *   Lite AI 定位路径的历史产物把模板 img 写成 `src="../resources/images/x.png"`——
 *   它是 HTML 属性，不经 script import（handleModule）也不经 style url() 两条重写管道，
 *   vue3-sfc-loader 原样保留 ⇒ 浏览器按当前页面 URL 解析 `../resources/...` ⇒ 404 破图。
 *
 *   本函数在模板编译**之前**调用（与 rewriteVueStyleAssetUrls 同位、同基准），把
 *   `src="相对路径"` 提升为绝对 URL。判据纪律与 rewriteCssAssetUrls 一致：
 *   - 只重写相对引用（SELF_ANCHORED_RE：绝对/协议/data:/blob: 原样，幂等）；
 *   - `:src="expr"` 是**动态绑定**（运行时值，编译期不可解析）——本函数的正则只匹配
 *     静态 `src=`，不会碰 `:src=`（属性名不同）；
 *   - 解析结果完全由 `new URL(raw, baseUrl)` 决定，不猜扩展名不补目录。
 *
 * @param src     `.vue` 源码
 * @param baseUrl 该 `.vue` 文件自身的绝对 URL（`${base}/${rel}`）
 */
export function rewriteVueTemplateAssetUrls(src, baseUrl) {
  if (!src || !baseUrl || !/<template\b/i.test(src)) return src;
  let absBase;
  try {
    const origin = typeof location !== 'undefined' && location.origin ? location.origin : 'http://localhost';
    absBase = new URL(baseUrl, origin).href;
  } catch {
    return src;
  }
  // 只匹配 <template>…</template> 块内、静态 src 属性（排除 :src/v-bind:src——属性名前带 : 或 v-bind: 即不匹配 ` src="` 形态）
  return src.replace(
    /(<template\b[^>]*>)([\s\S]*?)(<\/template>)/gi,
    (_full, open, body, close) => {
      const rewritten = body.replace(
        /(\ssrc=)(["'])([^"']+)\2/g,
        (full, attr, quote, raw) => {
          const v = String(raw).trim();
          if (!v || SELF_ANCHORED_RE.test(v)) return full;
          try {
            return `${attr}${quote}${new URL(v, absBase).href}${quote}`;
          } catch {
            return full;
          }
        },
      );
      return open + rewritten + close;
    },
  );
}

/**
 * 🔴 2026-11-06 67cd38d8 形态扩展：重写 `:src="<expr> || '../resources/images/x.png'"`
 * **表达式内相对路径字面量**为绝对 URL（仅存量兜底；挂载链第七形态已在生成期把该
 * 字面量抽成 labAsset import）。判据与 rewriteVueTemplateAssetUrls 一致：
 * 只提升相对引用（SELF_ANCHORED_RE 幂等）、`new URL(raw, baseUrl)` 决定结果。
 * 只匹配「单引号字面量在 || 右侧」的保守形态，不做通用表达式解析。
 */
export function rewriteVueExprAssetUrls(src, baseUrl) {
  if (!src || !baseUrl || !/<template\b/i.test(src)) return src;
  let absBase;
  try {
    const origin = typeof location !== 'undefined' && location.origin ? location.origin : 'http://localhost';
    absBase = new URL(baseUrl, origin).href;
  } catch {
    return src;
  }
  return src.replace(
    /(<template\b[^>]*>)([\s\S]*?)(<\/template>)/gi,
    (_full, open, body, close) => {
      const rewritten = body.replace(
        /(\|\|\s*)(['"])(\.\.?\/[^'"]+)\2/g,
        (full, pipe, quote, raw) => {
          const v = String(raw).trim();
          if (!SELF_ANCHORED_RE.test(v)) {
            try {
              return `${pipe}${quote}${new URL(v, absBase).href}${quote}`;
            } catch {
              return full;
            }
          }
          return full;
        },
      );
      return open + rewritten + close;
    },
  );
}
