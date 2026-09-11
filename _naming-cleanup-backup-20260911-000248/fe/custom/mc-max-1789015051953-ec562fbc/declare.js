import declareConfig from './declare.json'
import { common, dark, light } from './resources/config/css-vars.js'
// 设置微码组件信息（cssVars 为 M4-2 必传项）
let declareInfo = $createMcDeclare({
  metaUrl: import.meta.url,
  declareConfig,
  cssVars: { common, dark, light }
})
// 导出组件配置信息
export default declareInfo