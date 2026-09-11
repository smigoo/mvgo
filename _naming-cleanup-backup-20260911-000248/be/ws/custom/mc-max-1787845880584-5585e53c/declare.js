import declareConfig from './declare.json'
// 设置微码组件信息
let declareInfo = $createMcDeclare({
  metaUrl: import.meta.url,
  declareConfig
})
// 导出组件配置信息
export default declareInfo