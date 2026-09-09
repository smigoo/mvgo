/**
 * vue3-sfc-loader 二进制资源处理 —— 单一真相源
 *
 * vue3-sfc-loader 无法原生处理二进制（图片 / 字体），处理方式是：
 *   - getFile 遇到二进制扩展名时返回空占位（不能 res.text()，否则二进制被当文本损坏）
 *   - handleModule 遇到二进制扩展名时返回「后端可访问的绝对 URL」，浏览器直接 fetch
 *
 * 微码生产路径（preview/index.vue 的 loadProd）与 Vue3 路径（loadVue3Runtime.js）
 * 都依赖本集合。集中定义以避免「两边扩展名列表漂移」——
 * 一旦某环境漏加一个扩展名（如 .avif），就会重现⑥类「静态资源加载不出来」问题。
 */

export const BINARY_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
])

/** 从路径中安全提取小写扩展名（含点），无扩展名返回空串 */
export function extOf(rel) {
  const i = rel.lastIndexOf('.')
  return i >= 0 ? rel.substring(i).toLowerCase() : ''
}
