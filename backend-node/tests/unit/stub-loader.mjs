// 测试用 loader：把只有 .ts 源码的 NestJS 配置模块 config/backend-root.js
// 顶替为一个 Proxy 支撑的桩模块，使 ai-engine 的纯 JS 文件能在 plain Node 下被 import。
// （backend-root 在生产由 tsc 编译成 .js；源码态只有 .ts，plain node 无法直接解析。）
const STUB_SRC = `
const __p = new Proxy({}, { get: () => '.' })
export default __p
export const dataDir = '.'
export const backendRoot = '.'
export const logsDir = '.'
export const workspaceRoot = '.'
export const configDir = '.'
export const env = {}
export const isTest = false
`
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('config/backend-root.js')) {
    return { url: 'data:text/javascript,' + encodeURIComponent(STUB_SRC), shortCircuit: true }
  }
  return next(specifier, context)
}
