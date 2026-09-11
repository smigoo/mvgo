import declareConfig from './declare.json'
import { cssVars } from './resources/config/css-vars.js'

let declareInfo = $createMcDeclare({
  metaUrl: import.meta.url,
  declareConfig,
  cssVars
})
export default declareInfo
