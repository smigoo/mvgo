/**
 * acorn / acorn-walk 可选依赖加载器（单一事实源）。
 *
 * 为什么独立成模块（2026-10-15）：
 *   acorn/acorn-walk 是 devDependency 的传递依赖，必须「缺失降级、绝不误杀」，
 *   只能经 createRequire(import.meta.url) 动态加载。而词法 import.meta 会让
 *   ts-jest CJS 转换下的整个消费方模块解析期 SyntaxError（套件 0 运行），
 *   且被测模块自身不可 mock ⇒ 把 import.meta 隔离进本模块，spec 侧按惯例
 *   工厂 mock 本模块即可（mock 内用 jest 的 require 真加载 acorn，覆盖率不降）。
 *
 * 生产形态：Node22 语法探测按 ESM 运行 dist，import.meta 合法；
 * 解析失败时导出 null，消费方（sfc-semantics）走既有降级分支。
 */
import { createRequire } from 'node:module'

const _require = createRequire(import.meta.url)

let acornParser = null
let acornWalker = null
try {
  acornParser = _require('acorn')
  acornWalker = _require('acorn-walk')
} catch {
  acornParser = null
  acornWalker = null
}

export { acornParser, acornWalker }
