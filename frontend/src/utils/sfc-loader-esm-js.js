/**
 * vue3-sfc-loader「脚本模块求值模式」判定 —— 单一真相源
 *
 * 背景（2026-10-25 · mc-max-1792934332868-389dd460 真机实锤）：
 * vue3-sfc-loader 内部按**扩展名**决定脚本用哪种 Babel sourceType 解析：
 *
 *   case ".vue" → createSFCModule(...)
 *   case ".js"  → createJSModule(src, false, ...)   // sourceType: "script"
 *   case ".mjs" → createJSModule(src, true,  ...)   // sourceType: "module"
 *   case ".ts"  → createJSModule(src, true,  ...)   // sourceType: "module"
 *
 * ⇒ 顶层 `import` / `export` 出现在 **`.js`** 里（完全合法的 ESM 写法）会直接抛
 *   `'import' and 'export' may appear only with 'sourceType: "module"'`
 *   → 整组件「加载失败（组件自身问题）」。
 *
 * 事故件：产物 `package/index.vue` 写了
 *   `import { runtimeBuilder } from './runtime.js'`
 * 而 `package/runtime.js` 是 LLM 自由发挥的 ESM 模块（规范/prompt 里没有它的位置）
 * ⇒ `.js` 走 script 模式 ⇒ 报错坐标 (6:0) 正落在该文件的 `export {...}` 行。
 *
 * 处置：内容确为 ESM 时，把该文件**声明为 module 资源**——vue3-sfc-loader 的
 * `getResource` 支持 `getFile` 返回 `{ type, getContentData }` 来覆写分派类型
 * （dist :426-429：`type: res.type !== undefined ? res.type : extname(...)`），
 * 据此把它送入 `.mjs` 分支（module 模式）。
 *
 * 🔴 双闸判据（零回归的关键）：**只对 `.js` 生效**，且必须同时满足
 *   ① 有顶层 ESM 标记（行首 `import x` / `export ...`，`import(` 动态导入不算）；
 *   ② script 模式**确实解析不了**（`new Function` 编译探测抛 SyntaxError）。
 *   ② 是 ① 的「阳性对照」：若一个 `.js` 的「ESM 标记」其实落在模板字符串里
 *   （`const tpl = `\nexport default {}\n``），`new Function` 能编译 ⇒ 不提升 ⇒
 *   正则的假阳性被这一闸消掉。真正 CJS 的 `.js`（`require`/`module.exports`）
 *   ① 就不命中 ⇒ 行为与改动前**逐字节一致**。
 *
 * 微码生产路径（views/preview/index.vue）与 Vue3 路径（utils/loadVue3Runtime.js）
 * 共用本模块 —— 与 sfc-loader-binary.js 同一「单一真相源」纪律，避免两侧判据漂移
 * （一边能加载、一边报「组件自身问题」这类最难排查的不对称）。
 */

import { extOf } from './sfc-loader-binary'

/**
 * 顶层 ESM 语法标记（行首 import/export 声明）。
 * 刻意要求「行首 + 关键字后跟合法的声明起始字符」：
 *   - `import(` 动态导入不匹配（script 模式合法）⇒ 不误判；
 *   - `import 'a.css'` 副作用导入匹配（script 模式非法，必须提升）。
 */
const ESM_MARKER_RE =
  /^[ \t]*(?:import[ \t]+(?:[\w*$]|\{)|export[ \t]+(?:default|const|let|var|function|class|\{|\*))/m

/**
 * 源码是否含顶层 ESM 标记（仅**必要**条件，不足以判定需提升）。
 * @param {string} src
 * @returns {boolean}
 */
export function isEsmMarked(src) {
  if (typeof src !== 'string' || !src) return false
  return ESM_MARKER_RE.test(src)
}

/**
 * script 模式可解析性探测（**只编译不执行**）。
 * @returns {'yes'|'no'|'unknown'} 'no' = 确定解析不了（SyntaxError）；
 *   'unknown' = 环境限制（如 CSP 禁 eval 抛 EvalError）⇒ 按「不确定」保守处理。
 */
function probeScriptMode(src) {
  if (typeof Function !== 'function') return 'unknown'
  try {
    // eslint-disable-next-line no-new-func
    new Function(String(src))
    return 'yes'
  } catch (err) {
    return err instanceof SyntaxError ? 'no' : 'unknown'
  }
}

/**
 * 解析 `.js` 文件需要的 vue3-sfc-loader「类型覆写」值。
 * @param {string} rel 文件相对路径（用于取扩展名）
 * @param {string} src 文件最终源码（经 autoImport / less 预编译等全部改写后的版本）
 * @returns {'.mjs'|null} 非 null ⇒ 调用方应让 getFile 返回
 *   `{ type: '.mjs', getContentData: async () => src }`
 */
export function resolveJsModuleTypeOverride(rel, src) {
  // 只治 `.js`：`.mjs`/`.ts` 内部已是 module 模式；`.cjs` 语义上就是 CJS。
  if (extOf(String(rel || '')) !== '.js') return null
  if (!isEsmMarked(src)) return null
  if (probeScriptMode(src) !== 'no') return null
  return '.mjs'
}
