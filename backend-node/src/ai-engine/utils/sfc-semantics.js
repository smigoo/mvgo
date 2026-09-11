/**
 * Vue SFC 脚本语义校验（第二道防线：结构性闭合之外的逻辑完整性）
 *
 * 背景（2026-08-06 事故 mc-max-1786024610821-871deca9）：
 *   分块生成 index.vue 时，<script> 块只吐了 import 头部两行（模型截断），
 *   而 `_detectFileTruncation` / `validateVueSFCCompleteness` 只查闭合标签，
 *   导致"能闭合但实际残缺"的文件静默落盘 → SFC 编译失败 → 组件渲染空白。
 *
 * 本工具拦截三类"能闭合但必然坏"的产物：
 *   1. 重复 import（分块拼接的典型病，如 import { ref, watch } 出现两次）
 *   2. <script> 只有 import 头、无任何逻辑体（截断的典型形态）
 *   3. 模板引用了 script 中未声明的变量/组件（如模板用 bg1 但从未 import）
 *
 * 以纯静态正则分析为主；「<script> 内部自由变量检测」可选依赖 acorn/acorn-walk
 * （二者为 devDependency 的传递依赖），解析器缺失或解析失败时降级跳过、绝不误杀。
 */

// ── 可选依赖：acorn / acorn-walk（仅用于 <script> 内部自由变量检测）──
import { createRequire } from 'node:module'
import { extractSfcTemplate } from './sfc-template-extractor.js'
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

/**
 * <script> 内部「全局白名单」：这些标识符在 <script setup> 中无需 import 即可使用，
 * 不得被自由变量检测判为「未声明」。宁可多列、不可漏列（漏列会误杀 → fail-closed）。
 * 组成：
 *   1. Vue <script setup> 编译器宏（defineProps/defineEmits/… 编译期由 Vue 处理，不产出运行时引用）
 *   2. Vue API（前端 loadVue3Runtime.injectVueAutoImports 会在运行时自动补 import，后端不能据此拒绝）
 *   3. 宿主注入全局（微码运行时注入 globalThis 的 $ 前缀函数，如 $mcComponentBuilder）
 *   4. JS 语言内置 + 浏览器全局 + Node 环境
 */
const SCRIPT_GLOBALS = new Set([
  // ── Vue 编译器宏（script setup 无需 import）──
  'defineProps', 'defineEmits', 'defineExpose', 'withDefaults', 'defineOptions',
  'defineModel', 'defineSlots', 'useSlots', 'useAttrs',
  // ── Vue API（前端自动补 import）──
  'ref', 'computed', 'reactive', 'readonly', 'shallowRef', 'shallowReactive', 'shallowReadonly',
  'watch', 'watchEffect', 'watchPostEffect', 'watchSyncEffect', 'effectScope',
  'onMounted', 'onBeforeMount', 'onBeforeUnmount', 'onUnmounted', 'onActivated', 'onDeactivated',
  'onUpdated', 'onBeforeUpdate', 'onErrorCaptured', 'onRenderTracked', 'onRenderTriggered',
  'onServerPrefetch', 'onScopeDispose', 'provide', 'inject', 'nextTick',
  'toRef', 'toRefs', 'toRaw', 'unref', 'toValue', 'isRef', 'isReactive', 'isReadonly', 'isProxy',
  'markRaw', 'triggerRef', 'customRef', 'getCurrentInstance', 'h', 'createApp', 'createVNode',
  'resolveComponent', 'resolveDirective', 'withDirectives', 'defineComponent', 'defineAsyncComponent',
  'useTemplateRef', 'useId',
  // ── 微码宿主注入全局（loadVue3Runtime 从 common.js 注入 globalThis 的 $ 前缀函数）──
  '$mcComponentBuilder', 'mcComponentBuilder', '$createMcDeclare', '$runtimeBuilder',
  '$mcCssBuilder', '$getMcDefaultConfig', '$mcDeclare',
  // ── Vue 组件实例 / 模板内建（模板为主，script 偶见）──
  '$emit', '$props', '$attrs', '$slots', '$refs', '$el', '$options', '$nextTick', '$watch', '$forceUpdate',
  // ── JS 语言内置 + 全局对象 ──
  'undefined', 'NaN', 'Infinity', 'globalThis', 'arguments',
  'Object', 'Array', 'String', 'Number', 'Boolean', 'BigInt', 'Symbol', 'Math', 'Date', 'JSON',
  'RegExp', 'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'EvalError', 'URIError',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'Intl', 'ArrayBuffer',
  'DataView', 'Float32Array', 'Float64Array', 'Int8Array', 'Int16Array', 'Int32Array',
  'Uint8Array', 'Uint16Array', 'Uint32Array', 'Uint8ClampedArray', 'BigInt64Array', 'BigUint64Array',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent',
  'atob', 'btoa', 'structuredClone', 'queueMicrotask',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate', 'clearImmediate',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  // ── 浏览器全局 ──
  'window', 'self', 'document', 'navigator', 'location', 'history', 'screen', 'console', 'fetch',
  'localStorage', 'sessionStorage', 'performance', 'crypto',
  'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'PerformanceObserver',
  'URL', 'URLSearchParams', 'FormData', 'Blob', 'File', 'FileReader', 'Image', 'Audio',
  'TextEncoder', 'TextDecoder', 'AbortController', 'AbortSignal', 'WebSocket', 'Worker', 'Event', 'CustomEvent',
  'alert', 'confirm', 'prompt',
  // ── Node 环境（组件代码理论不触碰，列此防误伤）──
  'require', 'module', 'exports', '__dirname', '__filename', 'process', 'Buffer',
])

/** 模板标识符白名单：Vue 内置/JS 全局/微码宿主注入 */
const TEMPLATE_WHITELIST = new Set([
  // JS 全局
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  'Math', 'Date', 'JSON', 'RegExp', 'Error', 'Promise', 'Symbol', 'BigInt',
  'window', 'document', 'navigator', 'console', 'Number', 'String', 'Array', 'Object', 'Boolean',
  'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'Object', 'keys', 'values', 'entries',
  // Vue 模板内建
  '$event', '$refs', '$el', '$attrs', '$slots', '$emit', '$props', '$options',
  '$parent', '$root', '$children', '$forceUpdate', '$nextTick', '$watch', '$set', '$delete',
  '$router', '$route', '$store', '$t', '$i18n', '$store', '$listeners',
  // 宿主全局（微码运行时注入）
  '$mcComponentBuilder', 'mcComponentBuilder',
  // 常用库
  'echarts',
])

/** 模板中不会单独出现的合法名称（v-for 循环变量等，由调用方自行处理） */
const JS_STATEMENT_RX = /(?:const|let|var|function|=>|return\s|if\s*\(|for\s*\(|while\s*\(|try\s*\{|catch\s*\(|switch\s*\(|new\s+[A-Za-z_$]|throw\s|await\s|yield\s|\.value\b|publishEvent|nextTick\s*\(|\.map\(|\.filter\(|\.forEach\()/

/**
 * 提取模板中使用的裸标识符（仅硬引用：${var} / :attr="var" / ref="var" / v-for 源 / PascalCase 组件标签）
 * 刻意不做全表达式解析，避免大量误报。
 * @param {string} templateContent
 * @returns {{ used: Set<string>, loopVars: Set<string> }} used=需在 script 中声明的引用；loopVars=v-for 循环变量（模板作用域内，无需声明）
 */
export function extractTemplateRefs(templateContent) {
  const used = new Set()
  const loopVars = new Set()
  if (!templateContent || typeof templateContent !== 'string') return { used, loopVars }

  // 1. ${var} 模板字面量插值（最常见于 :style="{ backgroundImage: url(${bg1}) }"）
  for (const m of templateContent.matchAll(/\$\{([a-zA-Z_$][\w$]*)\}/g)) used.add(m[1])

  // 2. :attr="var" / v-bind:attr="var"（裸标识符，不含点/括号/字符串）
  for (const m of templateContent.matchAll(/(?::|\bv-bind:)[a-zA-Z-]+\s*=\s*"([a-zA-Z_$][\w$]*)"/g)) used.add(m[1])

  // 3. ref="var"（DOM 引用）
  for (const m of templateContent.matchAll(/(?::?ref)\s*=\s*"([a-zA-Z_$][\w$]*)"/g)) used.add(m[1])

  // 4. v-for：源（需声明）+ 循环变量（模板作用域内，豁免校验）
  //    形态：v-for="item in items" / v-for="(item, i) in items" / v-for="item in obj.list" / v-for="n in 6"
  //    ⚠️ 源表达式不能用 (\w+)["'] 收尾：v-for="(item, idx) in currentData.accuracy" 这种成员表达式源会被整个漏配，
  //       导致 (item, idx) 不进 loopVars、同时 :key="idx" 被第 2 条规则抓进 used → 误报 missing: idx（R2）
  for (const m of templateContent.matchAll(/v-for\s*=\s*["']([^"']*?)\s+in\s+([^"']+)["']/g)) {
    const srcExpr = m[2].trim()
    // 只把源表达式的首个标识符（根对象）记为「需在 script 中声明」；
    // 数字/字符串字面量源（v-for="n in 6"）head 为 null，直接跳过
    const head = srcExpr.match(/^([a-zA-Z_$][\w$]*)/)
    if (head) used.add(head[1])
    const varPart = m[1].trim()
    const vars = varPart.replace(/^\(/, '').replace(/\)$/, '').split(',').map(s => s.trim().replace(/^\.\.\./, ''))
    for (const v of vars) {
      if (/^[a-zA-Z_$][\w$]*$/.test(v)) loopVars.add(v)
    }
  }

  // 5. PascalCase 组件标签 <TotalTraffic ...>
  for (const m of templateContent.matchAll(/<([A-Z][\w]*)\b/g)) used.add(m[1])

  // 过滤白名单
  for (const name of [...used]) {
    if (TEMPLATE_WHITELIST.has(name)) used.delete(name)
  }
  return { used, loopVars }
}

/**
 * Vue 内置组件（PascalCase），在模板中以标签形式出现但不需要 import，
 * 不应被当作"待接线的子组件"去生成 package/components/*.vue 或自动 import。
 */
const VUE_BUILTIN_COMPONENTS = new Set([
  'Transition', 'TransitionGroup', 'KeepAlive', 'Teleport', 'Suspense',
  'Component', 'Slot', 'RouterView', 'RouterLink', 'Fragment',
])
/** 导出供调用方把 Vue 内置组件视为"已声明"，避免模板用 <Transition> 等被判未声明 */
export { VUE_BUILTIN_COMPONENTS }

/**
 * 从模板中抽取"被引用的子组件标签名"（PascalCase 开头的标签）。
 * 与 extractTemplateRefs 不同：本方法只取组件标签（用于子组件接线/生成），
 * 不取 ${var} / :attr / ref / v-for 源等普通变量，避免把大写变量误判为子组件。
 * 已排除 Vue 内置组件（Transition 等）与全局白名单，结果可直接用于 import 自动接线。
 * @param {string} templateContent
 * @returns {string[]} 子组件标签名（如 ['SectionHeader', 'SectionTopCards']）
 */
export function extractComponentTagNames(templateContent) {
  const names = new Set()
  if (!templateContent || typeof templateContent !== 'string') return [...names]
  for (const m of templateContent.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) {
    const name = m[1]
    if (TEMPLATE_WHITELIST.has(name)) continue
    if (VUE_BUILTIN_COMPONENTS.has(name)) continue
    names.add(name)
  }
  return [...names]
}

/**
 * 提取 script 中声明的标识符（import 绑定 + const/let/var/function + defineProps 键）
 * @param {string} scriptBody
 * @returns {Set<string>}
 */
export function extractScriptDeclarations(scriptBody) {
  const declared = new Set()
  if (!scriptBody || typeof scriptBody !== 'string') return declared

  // import x from '...'
  for (const m of scriptBody.matchAll(/import\s+([a-zA-Z_$][\w$]*)\s+from\s+['"]/g)) declared.add(m[1])
  // import * as x from '...'
  for (const m of scriptBody.matchAll(/import\s+\*\s+as\s+([a-zA-Z_$][\w$]*)\s+from\s+['"]/g)) declared.add(m[1])
  // import { a, b as c } from '...'
  for (const m of scriptBody.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]/g)) {
    for (const part of m[1].split(',')) {
      const name = part.replace(/\bas\s+\w+/, '').trim()
      if (/^[a-zA-Z_$][\w$]*$/.test(name)) declared.add(name)
    }
  }
  // import 'xxx'（副作用导入，无绑定）— 无声明

  // const/let/var/function 声明
  for (const m of scriptBody.matchAll(/(?:const|let|var|function)\s+([a-zA-Z_$][\w$]*)/g)) declared.add(m[1])
  // 🔧 多变量声明（逗号分隔）：let attrs = {}, publishEvent = () => {}, theme = 'light';
  // 上面的正则只提「let 后第一个变量」，逗号后的 publishEvent/theme 被漏 → 误判「模板引用未声明变量」→ fail-closed。
  // 前瞻 (?==) 限定「逗号 + 标识符 + 等号」形态，避免误匹配数组/对象字面量（[a, b] / { a: 1, b: 2 }）里的逗号项。
  for (const m of scriptBody.matchAll(/,\s*([a-zA-Z_$][\w$]*)\s*=/g)) declared.add(m[1])
  // 具名函数：function name(...)
  for (const m of scriptBody.matchAll(/function\s+([a-zA-Z_$][\w$]*)\s*\(/g)) declared.add(m[1])

  // 对象解构：const { a, b: c } = useStore()
  for (const m of scriptBody.matchAll(/const\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      let name = part.trim()
      name = name.replace(/\s*:\s*.*$/, '') // a: x → a
      name = name.trim()
      if (/^[a-zA-Z_$][\w$]*$/.test(name)) declared.add(name)
    }
  }
  // 数组解构：const [a, b] = ...
  for (const m of scriptBody.matchAll(/const\s*\[([^\]]*)\]\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim()
      if (/^[a-zA-Z_$][\w$]*$/.test(name)) declared.add(name)
    }
  }

  // defineProps 键（子组件模板常用 props 裸名）
  // ⚠️ 用括号平衡扫描提取完整参数：旧的非贪婪正则 /defineProps\s*\(\s*([\[{][\s\S]*?[\]}])/
  //    遇嵌套对象（如 default: () => ({}) / default: () => []）会在第一个 } 提前截断，
  //    导致排在后面的 prop 键（如 activeTabBg）漏提取 → 误判「模板引用未声明变量」。
  let propsParam = null
  const dpIdx = scriptBody.indexOf('defineProps')
  if (dpIdx >= 0) {
    const openIdx = scriptBody.indexOf('(', dpIdx)
    if (openIdx >= 0) {
      let depth = 0
      let inStr = null
      for (let i = openIdx; i < scriptBody.length; i++) {
        const ch = scriptBody[i]
        if (inStr) {
          if (ch === inStr && scriptBody[i - 1] !== '\\') inStr = null
          continue
        }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue }
        if (ch === '(' || ch === '[' || ch === '{') { depth++; continue }
        if (ch === ')' || ch === ']' || ch === '}') {
          depth--
          if (depth === 0) { propsParam = scriptBody.slice(openIdx + 1, i); break }
        }
      }
    }
  }
  if (propsParam) {
    const raw = propsParam.trim()
    // 数组形式：['a', 'b']
    if (raw.startsWith('[')) {
      for (const m of raw.matchAll(/['"]([a-zA-Z_$][\w$]*)['"]/g)) declared.add(m[1])
    } else if (raw.startsWith('{')) {
      // 对象形式：{ a: {...}, b: {...} } — 只取括号深度为 1 的顶层键（避开嵌套 default/type）
      let depth = 0
      let inStr2 = null
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i]
        if (inStr2) {
          if (ch === inStr2 && raw[i - 1] !== '\\') inStr2 = null
          continue
        }
        if (ch === '"' || ch === "'" || ch === '`') { inStr2 = ch; continue }
        if (ch === '(' || ch === '[' || ch === '{') { depth++; continue }
        if (ch === ')' || ch === ']' || ch === '}') { depth--; continue }
        if (depth === 1 && ch === ':') {
          const km = raw.slice(0, i).match(/([a-zA-Z_$][\w$]*)\s*$/)
          if (km) declared.add(km[1])
        }
      }
    }
  }

  return declared
}

/**
 * 检测 <script> 是否"只有 import 无逻辑体"（截断典型形态）
 * @param {string} scriptBody
 * @returns {boolean}
 */
export function isHeaderOnlyScript(scriptBody) {
  if (!scriptBody || typeof scriptBody !== 'string') return true
  // 去掉 import 行、注释、空白
  const stripped = scriptBody
    .replace(/^\s*import[^\n]*$/gm, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!stripped) return true
  // 至少需要一个"逻辑性"语句（声明/函数/生命周期/表达式）
  return !JS_STATEMENT_RX.test(stripped)
}

/**
 * 判断 <template> 是否包含"实质性"展示内容（足以支撑一个纯展示型组件）。
 * 纯展示型子组件（模板完整 + 空/仅注释 script）是合法 Vue，不应被"仅 import 无逻辑"门禁误杀。
 * 仅当模板缺失/为空（整文件残缺）时，"空脚本"才应判为截断。
 * @param {string} templateContent
 * @returns {boolean}
 */
function hasSubstantialTemplate(templateContent) {
  if (!templateContent || typeof templateContent !== 'string') return false
  const stripped = templateContent
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!stripped) return false
  const tagMatches = stripped.match(/<[a-zA-Z][\w-]*/g)
  return !!tagMatches && tagMatches.length >= 1 && stripped.length > 15
}

/**
 * 检测重复 import（整行归一化后去重）
 * @param {string} scriptBody
 * @returns {string[]} 重复的 import 行列表
 */
export function findDuplicateImports(scriptBody) {
  const dups = []
  if (!scriptBody) return dups
  const seen = new Set()
  for (const line of scriptBody.matchAll(/^\s*import\s+.*$/gm)) {
    const norm = line[0].replace(/\s+/g, ' ').trim()
    if (seen.has(norm)) dups.push(norm)
    seen.add(norm)
  }
  return dups
}

/**
 * 校验单个 Vue SFC 的脚本语义完整性。
 * @param {string} content 完整 .vue 内容
 * @param {string} [filePath=''] 用于日志
 * @param {Object} [opts]
 * @param {string} [opts.templateContent] 外部传入的模板内容（分块场景下 content 可能只有 <script>）
 * @param {boolean} [opts.requireLogic=true] 是否要求 script 非"仅 import"
 * @param {boolean} [opts.requireScriptTag=false] 是否要求必须包含 <script> 标签（index.vue/脚本段）
 * @param {string[]} [opts.implicitlyDeclared=[]] 视为已声明的变量名（如系统后处理注入的资源变量 bg1/icon1，模型按规范不手写其声明，门禁须在注入前识别）
 * @param {boolean} [opts.skipFreeVariableCheck=false] 跳过「<script> 内部自由变量检测」（分块生成的子片段须传 true，避免误报跨片段声明的变量）
 * @returns {{ issues: string[] }}
 */
export function validateVueScriptSemantics(content, filePath = '', opts = {}) {
  const issues = []
  if (!content || typeof content !== 'string') return { issues }

  const requireLogic = opts.requireLogic !== false
  const requireScriptTag = opts.requireScriptTag === true
  const implicitlyDeclared = new Set(Array.isArray(opts.implicitlyDeclared) ? opts.implicitlyDeclared : [])
  let templateContent = opts.templateContent
  let scriptBody = ''

  // 从 content 中抽取 script / template（兼容"content 仅含 script 段"的分块场景）
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/)
  if (scriptMatch) scriptBody = scriptMatch[1]
  else if (content.includes('<script')) {
    // 有开标签无闭标签 → 截断，外层 _detectFileTruncation 会拦；这里也补报
    issues.push(`${filePath}: <script> 标签未闭合`)
    return { issues }
  } else if (requireScriptTag) {
    // 脚本段/index.vue 必须携带 <script setup> 包裹，否则拼装后必然残缺
    issues.push(`${filePath}: 缺少 <script setup> 标签（输出可能被截断）`)
    return { issues }
  }

  const hasScriptTag = /<script[\s>]/.test(content) || opts.templateContent !== undefined

  if (!templateContent) {
    // 🛡️ 共享边界法（lazy </template> 会被具名插槽提前截断——0ca84358 家族缺陷）
    templateContent = extractSfcTemplate(content) || undefined
  }

  // 1. 重复 import
  if (scriptBody) {
    const dups = findDuplicateImports(scriptBody)
    if (dups.length > 0) {
      issues.push(`${filePath}: <script> 存在 ${dups.length} 处重复 import（${dups.slice(0, 3).join('；')}）`)
    }
  }

  // 2. 仅 import 无逻辑（截断典型形态）
  //    子组件允许"纯展示型"（模板完整 + 注释/空 script）是合法 Vue —— 仅当模板也缺失才判截断。
  //    index.vue（requireScriptTag=true）必须含脚本逻辑（$mcComponentBuilder），仍严格。
  if (hasScriptTag && requireLogic && scriptBody) {
    const allowPresentational = !requireScriptTag && hasSubstantialTemplate(templateContent)
    if (isHeaderOnlyScript(scriptBody) && !allowPresentational) {
      issues.push(`${filePath}: <script> 仅有 import 无任何逻辑体（疑似截断）`)
    }
  }

  // 3. 模板引用未声明变量/组件
  if (templateContent && scriptBody) {
    const { used, loopVars } = extractTemplateRefs(templateContent)
    const declared = extractScriptDeclarations(scriptBody)
    const missing = [...used].filter(name => !declared.has(name) && !loopVars.has(name) && !implicitlyDeclared.has(name))
    if (missing.length > 0) {
      issues.push(`${filePath}: 模板引用了 script 中未声明的变量/组件（${missing.slice(0, 8).join('、')}）`)
    }
  }

  // 4. 重复顶层声明（整段 <script> 被重复注入的典型病：runtimeBuilder/statsData/... 各出现两次）
  if (scriptBody) {
    const dupDecls = findDuplicateScriptDeclarations(scriptBody)
    if (dupDecls.length > 0) {
      issues.push(`${filePath}: <script> 存在 ${dupDecls.length} 个重复顶层声明（${dupDecls.slice(0, 6).join('、')}），疑似整段脚本重复注入`)
    }
    // 5. 整段重复检测（兜底，覆盖"重复声明 <2 但前后半段高度重叠"的边界）
    const whole = detectWholeScriptDuplication(scriptBody)
    if (whole.duplicated) {
      issues.push(`${filePath}: ${whole.reason}`)
    }
    // 6. TDZ 检测 + 自动修复
    //    6a. 赋值型 TDZ（变量在 let/const/var 声明前被裸赋值 → 运行时 TDZ 错误）
    //        自动修复：移除声明前的裸赋值语句，修复成功后不再报错；修复失败（无语句可删）才 fail-closed。
    let tdz = findTdzAssignments(scriptBody)
    if (tdz.length > 0) {
      const fixResult = autoFixTdzAssignments(scriptBody)
      if (fixResult.fixed.length > 0) {
        // 自动修复成功：回写 scriptBody，重新检测确认修复完整
        scriptBody = fixResult.content
        // 同步回 content（替换 <script> 内部内容）
        const scriptTagMatch = content.match(/<script([^>]*)>([\s\S]*?)<\/script>/)
        if (scriptTagMatch) {
          const before = content.slice(0, scriptMatch.index)
          const after = content.slice(scriptMatch.index + scriptMatch[0].length)
          content = before + `<script${scriptTagMatch[1]}>${scriptBody}</script>` + after
        }
        // 重新检测：若仍有残留 TDZ，说明 autoFix 未覆盖（如嵌套块内赋值），仍 fail-closed
        tdz = findTdzAssignments(scriptBody)
        if (tdz.length > 0) {
          issues.push(`${filePath}: <script> 存在 TDZ 风险（自动修复后残留）：变量在声明前被赋值（${tdz.slice(0, 6).join('、')}），会导致运行时 "Cannot access before initialization"`)
        }
      } else {
        // 自动修复失败（无顶层语句可删，可能赋值嵌套在函数/if 块内）
        issues.push(`${filePath}: <script> 存在 TDZ 风险：变量在声明前被赋值（${tdz.slice(0, 6).join('、')}），会导致运行时 "Cannot access before initialization"，请删除声明前的重复赋值段`)
      }
    }

    // 6b. 引用型 TDZ（非声明语句读取/调用了索引更大的 const/let 声明，如 `watch(x)` 排在 `const x` 之前）
    //      🛡️ 2026-09-10：env 样本 mc-max-1789019718053-fb0a0de7 实锤，scriptSplit 三段合并后漏网写盘。
    //      自动修复：把被提前引用的声明语句整体上移到首次引用之前（语义等价、不删除语句）。
    const tdzRefs = findTdzReferences(scriptBody)
    if (tdzRefs.length > 0) {
      const fixResult = autoFixTdzReferences(scriptBody)
      if (fixResult.fixed.length > 0) {
        scriptBody = fixResult.content
        const scriptTagMatch = content.match(/<script([^>]*)>([\s\S]*?)<\/script>/)
        if (scriptTagMatch) {
          const before = content.slice(0, scriptMatch.index)
          const after = content.slice(scriptMatch.index + scriptMatch[0].length)
          content = before + `<script${scriptTagMatch[1]}>${scriptBody}</script>` + after
        }
        const residual = findTdzReferences(scriptBody)
        if (residual.length > 0) {
          issues.push(`${filePath}: <script> 存在 TDZ 风险（引用型，自动修复后残留）：变量在声明前被引用（${residual.map(r => r.name).slice(0, 6).join('、')}），会导致运行时 "Cannot access before initialization"`)
        }
      } else {
        issues.push(`${filePath}: <script> 存在 TDZ 风险（引用型）：变量在声明前被引用（${tdzRefs.map(r => r.name).slice(0, 6).join('、')}），会导致运行时 "Cannot access before initialization"，请调整声明顺序`);
      }
    }

    // 7. <script> 内部自由变量检测（引用了既未声明、又未 import、又不在全局白名单的标识符）
    //    典型：模型生成与模板无关的孤儿死代码，引用从未声明的 chartRef → 运行时 "chartRef is not defined"。
    //    白名单 = SCRIPT_GLOBALS ∪ implicitlyDeclared（调用方传入的资源变量/子组件标签/内置组件）。
    //    ⚠️ 仅在「完整脚本」上执行：分块生成的子片段会引用其它片段才声明的变量，若在此检测必误报死循环，
    //       子片段由调用方传 skipFreeVariableCheck=true 跳过，合并后的完整脚本由 SFC 编译器最终把关。
    if (!opts.skipFreeVariableCheck) {
      const freeVars = detectScriptFreeVariables(scriptBody, { extraGlobals: [...implicitlyDeclared] })
      if (freeVars.length > 0) {
        issues.push(`${filePath}: <script> 引用了未声明的自由变量（${freeVars.slice(0, 8).join('、')}），会导致运行时 "is not defined"，请删除相关死代码或补齐声明`)
      }
    }
  }

  return { issues, content }
}

/**
 * 去重 script 内容中的 import 行（**符号级**：按绑定名去重，而非整行）
 * 分块拼接的典型病是两行内容不同但绑定重复：
 *   import { ref, watch } from 'vue'
 *   import { ref, watch, onMounted, onUnmounted } from 'vue'   // ref/watch 重复声明
 * 本函数保留每个绑定首次出现，后续行剔除已声明绑定；某行绑定全重复则该行丢弃。
 * @param {string} scriptBody 不含 <script> 标签的脚本内容
 * @returns {string}
 */
export function dedupeScriptImports(scriptBody) {
  if (!scriptBody || typeof scriptBody !== 'string') return scriptBody
  const seenBindings = new Set()
  const lines = scriptBody.split('\n')
  const out = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!/^import\s+/.test(trimmed)) { out.push(line); continue }

    // 具名导入：import { a, b as c } from 'mod'
    const namedMatch = trimmed.match(/^import\s*\{([^}]*)\}\s*from\s*(['"].*)$/)
    if (namedMatch) {
      const parts = namedMatch[1].split(',').map(s => s.trim()).filter(Boolean)
      const keep = []
      for (const p of parts) {
        // 绑定名：'a as b' → 'a'；'a' → 'a'
        const binding = (p.replace(/\bas\s+\w+$/, '') || p).trim().split(/\s+/)[0]
        if (binding && !seenBindings.has(binding)) {
          seenBindings.add(binding)
          keep.push(p)
        }
      }
      if (keep.length > 0) {
        out.push(line.replace(namedMatch[1], keep.join(', ')))
      }
      // keep 为空 → 该行所有绑定都已声明，整行丢弃
      continue
    }

    // 默认 / 命名空间导入：import x from '...' / import * as x from '...'
    const bindingMatch = trimmed.match(/^import\s+(\*\s+as\s+)?([a-zA-Z_$][\w$]*)\s+from\s+(['"].*)$/)
    if (bindingMatch) {
      const binding = bindingMatch[2]
      if (seenBindings.has(binding)) continue
      seenBindings.add(binding)
      out.push(line)
      continue
    }

    // 副作用导入：import 'mod' — 保留
    out.push(line)
  }
  return out.join('\n')
}

/**
 * 将 <script> 内部内容按顶层语句切分（括号 / 字符串 / 模板字符串 / 注释感知）。
 * 顶层语句在 depth=0 处的 ';' 或一个完整顶层块 '}' 处结束。
 * 用于检测/修复"整段 <script> 被重复注入"导致的重复顶层声明。
 * @param {string} body 不含 <script> 标签的脚本内容
 * @returns {{ text: string, isDecl: boolean, declName: string|null, key: string }[]}
 */
export function splitTopLevelStatements(body) {
  const stmts = []
  if (!body || typeof body !== 'string') return stmts
  // 行首声明关键字锚定切分：本仓库组件风格的每个顶层声明都独占一行起始，
  // 故以"depth=0 处的非空行"作为一块起点，比逐字符括号扫描更稳（不受 ASI 无分号影响）。
  const lines = body.split('\n')
  let depth = 0
  let cur = null
  const pushCur = () => {
    if (cur && cur.text.trim()) {
      stmts.push({ text: cur.text.trim(), isDecl: cur.isDecl, declName: cur.declName, key: cur.text.trim().replace(/\s+/g, ' ') })
    }
    cur = null
  }
  for (const line of lines) {
    const trimmed = line.trim()
    const open = (line.match(/[({[]/g) || []).length
    const close = (line.match(/[)}\]]/g) || []).length
    const startsBlock = depth === 0 && trimmed.length > 0
    if (startsBlock) {
      pushCur()
      const m = trimmed.match(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/)
      cur = { text: line, isDecl: !!m, declName: m ? m[1] : null }
    } else if (cur) {
      cur.text += '\n' + line
    } else if (trimmed.length > 0) {
      // depth>0 且不在任何块内（理论罕见）：孤立内容独立成块
      const m = trimmed.match(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/)
      stmts.push({ text: trimmed, isDecl: !!m, declName: m ? m[1] : null, key: trimmed.replace(/\s+/g, ' ') })
    }
    depth += open - close
    if (depth < 0) depth = 0
  }
  pushCur()
  return stmts
}

/**
 * 检测 <script> 内部的重复顶层声明（const/let/var/function/class 同名）。
 * 整段 <script> 被重复注入时，这批声明会各出现两次 → 编译报
 * "Identifier 'xxx' has already been declared"。
 * @param {string} scriptBody 不含 <script> 标签的脚本内容
 * @returns {string[]} 重复的声明名（如 ['runtimeBuilder','statsData']）
 */
export function findDuplicateScriptDeclarations(scriptBody) {
  if (!scriptBody || typeof scriptBody !== 'string') return []
  const counts = new Map()
  for (const s of splitTopLevelStatements(scriptBody)) {
    if (s.isDecl && s.declName) counts.set(s.declName, (counts.get(s.declName) || 0) + 1)
  }
  const dups = []
  for (const [name, c] of counts) if (c > 1) dups.push(name)
  return dups
}

/**
 * 检测「变量在 let/const/var 声明之前被裸赋值」导致的 TDZ 运行时错误。
 * 典型病（2026-08-23 mc-max-1787496397773）：模型把 runtimeBuilder 初始化写了两遍，
 * 第一遍是裸赋值 `runtimeBuilder = typeof $mcComponentBuilder === 'function' ? ... : null`
 * （无 let/const/var 声明），出现在 `let runtimeBuilder = null` 声明之前，
 * 运行时抛 "Cannot access 'runtimeBuilder' before initialization"，组件渲染失败。
 * 静态校验（L0-B / sfc-semantics）此前只查「重复声明」，查不出「声明前赋值」这种 TDZ。
 * @param {string} scriptBody 不含 <script> 标签的脚本内容
 * @returns {string[]} TDZ 变量名（如 ['runtimeBuilder']）
 */
export function findTdzAssignments(scriptBody) {
  if (!scriptBody || typeof scriptBody !== 'string') return []
  const stmts = splitTopLevelStatements(scriptBody)
  // 记录每个声明名的首次声明位置（索引）
  const declIdx = new Map()
  stmts.forEach((s, i) => {
    if (s.isDecl && s.declName && !declIdx.has(s.declName)) declIdx.set(s.declName, i)
  })
  if (declIdx.size === 0) return []
  const tdz = new Set()
  // 裸赋值：identifier = ...（排除 == / === / => 箭头；排除成员赋值 runtimeBuilder.x=）
  const bareAssignRx = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*=(?![=>])/g
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i]
    if (s.isDecl) continue
    for (const m of s.text.matchAll(bareAssignRx)) {
      const name = m[2]
      if (name === 'this' || name === 'window' || name === 'globalThis') continue
      // 该变量已声明，但声明出现在本赋值语句之后 → TDZ
      if (declIdx.has(name) && declIdx.get(name) > i) tdz.add(name)
    }
  }
  return [...tdz]
}

/**
 * 🛡️ L0-B 自动修复：移除声明前的裸赋值语句（TDZ 风险）。
 * 典型病：模型把 `runtimeBuilder = ...` 写了两遍，第一遍无 let/const/var 出现在 `let runtimeBuilder = null` 之前。
 * 修复策略：删除该赋值所在的顶层语句（而非仅删赋值），避免留下残余表达式。
 * @param {string} scriptBody 不含 <script> 标签的脚本内容
 * @returns {{ content: string, fixed: string[] }}
 */
export function autoFixTdzAssignments(scriptBody) {
  if (!scriptBody || typeof scriptBody !== 'string') return { content: scriptBody, fixed: [] }
  const stmts = splitTopLevelStatements(scriptBody)
  const declIdx = new Map()
  stmts.forEach((s, i) => {
    if (s.isDecl && s.declName && !declIdx.has(s.declName)) declIdx.set(s.declName, i)
  })
  if (declIdx.size === 0) return { content: scriptBody, fixed: [] }

  const bareAssignRx = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*=(?![=>])/g
  // 需要移除的语句索引（去重）
  const removeIdx = new Set()
  const fixed = []
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i]
    if (s.isDecl) continue
    const namesInStmt = new Set()
    for (const m of s.text.matchAll(bareAssignRx)) {
      const name = m[2]
      if (name === 'this' || name === 'window' || name === 'globalThis') continue
      if (declIdx.has(name) && declIdx.get(name) > i) {
        namesInStmt.add(name)
      }
    }
    if (namesInStmt.size > 0) {
      removeIdx.add(i)
      fixed.push(`移除声明前的裸赋值：${[...namesInStmt].join(', ')} = ...`)
    }
  }
  if (removeIdx.size === 0) return { content: scriptBody, fixed: [] }

  // 重建脚本内容：按原始换行拆分，按语句文本匹配跳过
  const kept = stmts.filter((_, i) => !removeIdx.has(i)).map(s => s.text)
  return { content: kept.join('\n'), fixed }
}

// 🛡️ 引用型 TDZ 检测/修复：纯函数、零依赖（无 import.meta），独立模块便于 jest 单测。
// 与 findTdzAssignments（裸赋值型）并列，覆盖分段合并漏网的「引用早于声明」型 TDZ。
// import 供本文件 validateVueScriptSemantics 第 6b 段使用；同时 re-export 保持对外 API 不变。
import { findTdzReferences, autoFixTdzReferences } from './sfc-tdz.js'
export { findTdzReferences, autoFixTdzReferences }

/**
 * 整段 <script> 重复检测（兜底）。
 * 信号：① 存在 ≥2 个重复顶层声明；② 前后半段声明集合高度重叠。
 * @param {string} scriptBody 不含 <script> 标签的脚本内容
 * @returns {{ duplicated: boolean, reason: string }}
 */
export function detectWholeScriptDuplication(scriptBody) {
  if (!scriptBody || typeof scriptBody !== 'string') return { duplicated: false, reason: '' }
  const dups = findDuplicateScriptDeclarations(scriptBody)
  if (dups.length >= 2) {
    return {
      duplicated: true,
      reason: `检测到 ${dups.length} 个重复顶层声明（${dups.slice(0, 5).join('、')}），疑似整段 <script> 被重复注入`,
    }
  }
  const half = Math.floor(scriptBody.length / 2)
  const a = splitTopLevelStatements(scriptBody.slice(0, half))
  const b = splitTopLevelStatements(scriptBody.slice(half))
  const namesA = new Set(a.filter(s => s.declName).map(s => s.declName))
  const namesB = new Set(b.filter(s => s.declName).map(s => s.declName))
  if (namesA.size && namesB.size) {
    let overlap = 0
    for (const name of namesA) if (namesB.has(name)) overlap++
    if (overlap >= 2 && overlap >= Math.min(namesA.size, namesB.size) * 0.6) {
      return { duplicated: true, reason: '前后半段顶层声明高度重叠，疑似整段脚本重复' }
    }
  }
  return { duplicated: false, reason: '' }
}

/**
 * 去重 <script> 内部内容中的重复顶层声明（**声明级**：同名保留最后一次出现，
 * 丢弃更早的重复声明；import 行走 dedupeScriptImports 符号级合并；
 * 非声明语句去重完全相同的，避免重复 watch/onMounted 调用）。
 *
 * 适用场景：_mergeScriptParts 拼接 scriptSplit 两段时，若模型两段都吐了完整脚本，
 * 会产生整段重复声明 → 此处确定性修复（保留更完整的后段），而不是把坏文件写盘。
 * 无重复时原样返回，保持源码格式不被重排。
 * @param {string} scriptBody 不含 <script> 标签的脚本内容
 * @returns {string}
 */
function extractImportBindings(statement = '') {
  const trimmed = statement.trim()
  if (!/^import\s+/.test(trimmed)) return []
  const bindings = []
  const defaultMatch = trimmed.match(/^import\s+([A-Za-z_$][\w$]*)\s*(?:,|from\b)/)
  if (defaultMatch) bindings.push(defaultMatch[1])
  const namespaceMatch = trimmed.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)
  if (namespaceMatch) bindings.push(namespaceMatch[1])
  const namedMatch = trimmed.match(/\{([^}]*)\}/)
  if (namedMatch) {
    for (const item of namedMatch[1].split(',')) {
      const part = item.trim()
      if (!part) continue
      const aliasMatch = part.match(/\bas\s+([A-Za-z_$][\w$]*)$/)
      bindings.push(aliasMatch ? aliasMatch[1] : part.split(/\s+/)[0])
    }
  }
  return bindings.filter(Boolean)
}

export function dedupeScriptDeclarations(scriptBody) {
  if (!scriptBody || typeof scriptBody !== 'string') return scriptBody
  const stmts = splitTopLevelStatements(scriptBody)
  if (stmts.length === 0) return scriptBody

  // import 绑定和 const/let/var/function/class 共享同一个顶层命名空间。
  // 分块常见冲突：前段 const Foo = defineAsyncComponent(...)，后段又 import Foo from '...'。
  const bindingOccurrences = new Map()
  stmts.forEach((statement, index) => {
    const names = statement.isDecl && statement.declName
      ? [statement.declName]
      : extractImportBindings(statement.text)
    for (const name of names) {
      if (!bindingOccurrences.has(name)) bindingOccurrences.set(name, [])
      bindingOccurrences.get(name).push({ index, isImport: /^import\s+/.test(statement.text.trim()) })
    }
  })
  const duplicateBindings = new Set([...bindingOccurrences].filter(([, entries]) => entries.length > 1).map(([name]) => name))
  const seenNonDecl = new Set()
  let hasNonDeclDup = false
  for (const statement of stmts) {
    if (!statement.isDecl && !/^import\s+/.test(statement.text.trim())) {
      if (seenNonDecl.has(statement.key)) hasNonDeclDup = true
      else seenNonDecl.add(statement.key)
    }
  }
  if (duplicateBindings.size === 0 && !hasNonDeclDup) return scriptBody

  const body = dedupeScriptImports(scriptBody)
  const stmts2 = splitTopLevelStatements(body)
  const lastDeclarationIndex = new Map()
  stmts2.forEach((statement, index) => {
    if (statement.isDecl && statement.declName) lastDeclarationIndex.set(statement.declName, index)
  })
  const out = []
  const seenBindings = new Set()
  const seenStatements = new Set()
  stmts2.forEach((statement, index) => {
    const importBindings = extractImportBindings(statement.text)
    if (importBindings.length > 0) {
      // 绑定若已由普通声明提供，则 import 属重复声明，整行移除。
      if (importBindings.some(name => lastDeclarationIndex.has(name))) return
      if (importBindings.some(name => seenBindings.has(name))) return
      importBindings.forEach(name => seenBindings.add(name))
      out.push(statement.text)
      return
    }
    if (statement.isDecl && statement.declName) {
      if (lastDeclarationIndex.get(statement.declName) !== index) return
      seenBindings.add(statement.declName)
      out.push(statement.text)
      return
    }
    if (seenStatements.has(statement.key)) return
    seenStatements.add(statement.key)
    out.push(statement.text)
  })
  return out.join('\n\n')
}

/**
 * 确定性修复：$mcComponentBuilder() 解构声明的重复（#9a 三段拆分脚本常见故障）。
 *
 * 背景：#9a 将 index.vue 脚本拆为 状态/生命周期/图表 三段分别生成。prompt 已要求
 * 仅第 1 段（状态）调用一次 `const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()`，
 * 但模型常在「生命周期」段再次解构同一声明 → 拼装后 runtimeBuilder 等被声明两次 →
 * vue/compiler-sfc 报 `Identifier 'runtimeBuilder' has already been declared` fail-closed。
 *
 * 为何通用去重（dedupeScriptDeclarations / findDuplicateScriptDeclarations）漏判：
 * 二者依赖 splitTopLevelStatements，后者只识别 `const <标识符>`，不识别 `const { … }` 解构形式，
 * 故重复解构被当作普通语句漏过，校验与去重双双失效。
 *
 * 本函数：收集所有 $mcComponentBuilder() 解构出现处的绑定名（取并集，按本地名去重，保留首次写法文本），
 * 仅在 FIRST 处保留并集声明，其余处整条删除（变量已由首处声明）。无重复时原样返回。
 * @param {string} scriptBody 不含 <script> 标签的脚本内容
 * @returns {string}
 */
export function dedupeMcComponentBuilder(scriptBody) {
  if (!scriptBody || typeof scriptBody !== 'string') return scriptBody
  const re = /((?:const|let|var)\s*\{([^}]*)\}\s*=\s*\$mcComponentBuilder\s*\(\s*\))/g
  const matches = [...scriptBody.matchAll(re)]
  if (matches.length <= 1) return scriptBody

  const seen = new Set()
  const union = []
  for (const m of matches) {
    const inner = m[2] || ''
    for (const raw of inner.split(',')) {
      const b = raw.trim()
      if (!b) continue
      const name = resolveDestructuredLocalName(b)
      if (name && !seen.has(name)) {
        seen.add(name)
        union.push(b)
      }
    }
  }
  const unionStr = union.join(', ')
  let replacedFirst = false
  return scriptBody.replace(re, (full) => {
    if (!replacedFirst) {
      replacedFirst = true
      const kw = /^(const|let|var)/.exec(full)[1]
      return `${kw} { ${unionStr} } = $mcComponentBuilder()`
    }
    // 后续重复声明整条删除：变量已在首处并集声明，删除后即可编译通过。
    return ''
  })
}

/** 解构绑定本地名：a / b as c（→ c）/ d: e（→ e） */
function resolveDestructuredLocalName(b) {
  const t = b.trim()
  const asMatch = t.match(/\bas\s+([A-Za-z_$][\w$]*)\s*$/)
  if (asMatch) return asMatch[1]
  const colonMatch = t.match(/:\s*([A-Za-z_$][\w$]*)\s*$/)
  if (colonMatch) return colonMatch[1]
  return t.split(/\s+/)[0].replace(/,$/, '')
}

/**
 * 去重 script 内容中的 onMounted / onUnmounted 生命周期钩子（按钩子名，保留首个）。
 *
 * 分块拼接的典型病（scriptSplit 状态/生命周期段各带一份）：
 *   onMounted(() => { publishEvent('monitor-onload', { componentId: 'c-monitor' }) })  ← state 段
 *   onMounted(() => { publishEvent('monitor-onload', { componentId: 'monitor' }) })     ← lifecycle 段
 * 合并后两个 onMounted 都保留 → 同一 onload 事件被 publishEvent 触发两次。
 *
 * dedupeScriptImports 只去 import、dedupeMcComponentBuilder 只去 $mcComponentBuilder 解构，
 * 都不覆盖「生命周期钩子」。本函数按「钩子名」去重：onMounted 只保留首个、onUnmounted 只保留首个，
 * 其余重复钩子整条删除。无重复时原样返回。
 * @param {string} scriptBody 不含 <script> 标签的脚本内容
 * @returns {string}
 */
export function dedupeLifecycleHooks(scriptBody) {
  if (!scriptBody || typeof scriptBody !== 'string') return scriptBody
  const stmts = splitTopLevelStatements(scriptBody)
  if (stmts.length === 0) return scriptBody
  const seen = new Set() // 已见过的钩子名
  const out = []
  let dropped = 0
  for (const s of stmts) {
    const trimmed = s.text.trim()
    const m = trimmed.match(/^(onMounted|onUnmounted)\s*\(/)
    if (!m) { out.push(s.text); continue }
    const hookName = m[1]
    if (seen.has(hookName)) { dropped++; continue }
    seen.add(hookName)
    out.push(s.text)
  }
  return out.join('\n')
}

/**
 * 假数据回退检测：新内容引入了 Math.random() 而旧内容没有 → 判定为 refiner 伪造数据回归。
 * （图表数据应来自 Figma/原文件，Math.random() 是红线禁止项）
 * @param {string} oldContent 写盘前的原文件内容
 * @param {string} newContent 待写盘的新内容
 * @returns {boolean}
 */
export function hasFakeDataRegression(oldContent, newContent) {
  if (!newContent || typeof newContent !== 'string') return false
  const newHas = /Math\.random\(\)/.test(newContent)
  if (!newHas) return false
  const oldHas = oldContent ? /Math\.random\(\)/.test(oldContent) : false
  return !oldHas
}

/**
 * 确定性修复：对象字面量「裸 key 漏引号」。
 *
 * 背景（2026-08-25 mc-1787669648758 的 TrafficBarSection.vue）：
 *   模型输出 `ref({ c-monitor-beijing: true })` —— key 含连字符却未加引号，
 *   JS 解析器在 `c-monitor` 后的 `-` 处报 `Unexpected token, expected ","`，
 *   导致 compiler-sfc 编译失败 → 组件加载失败。
 *
 * 此类错误模式高度固定、可离线确定性修复（key 含 `-`/`.` 等非标识符字符时，
 * 合法 JS 里只能是字符串 key），故不依赖模型重试，直接在后处理层兜住。
 *
 * 安全性约束：
 *   - 只处理 <script> 块：<style> 里 `background-color: red` 是合法 CSS 属性，
 *     绝不能加引号；template 同理不碰。
 *   - 只匹配「紧跟 { 或 , 之后、以 : 结尾」的裸 key，前缀 `\s*` 天然跨行，
 *     覆盖多行对象字面量的缩进 key。
 *   - 已加引号的 key（`'c-monitor': 1`）因 key 部分不以标识符开头，不会重复加引号。
 *   - 数字 key（`0.5:`）、`foo: string`（无连字符）、`a: b ? c : d`（三目）均不命中。
 *
 * @param {string} source 完整 .vue 源码
 * @returns {string} 修复后的源码（无改动时原样返回，引用相等）
 */
export function normalizeObjectStringKeysInVue(source) {
  if (!source || typeof source !== 'string') return source
  // 裸 key（含 -/. 等非标识符字符）→ 加引号。只匹配「紧跟 { 或 , 之后、以 : 结尾」的裸 key。
  const keyRe = /([{,]\s*)([A-Za-z_$][\w$]*(?:[-.][\w$-]+)+)(\s*:)/g
  const fixKeys = (text) => text.replace(keyRe, (_m, pre, key, post) => `${pre}'${key}'${post}`)

  // 1) <script> 块：对象字面量裸 key（原有逻辑，如 ref({ c-monitor: true })）
  let out = source.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (whole, open, body, close) => open + fixKeys(body) + close,
  )

  // 2) <template> 块：仅处理指令绑定值（:class / :style / :xxx="..."）里的对象字面量。
  //    根因（2026-08-27 mc-1787834157946 复测）：模型把 sessionId 当 class 前缀，生成
  //    :class="['c-tab-item', { c-mc-xxx-active: cond }]" —— key 含连字符缺引号，
  //    compiler-sfc 报 "Unexpected token, expected ," → 写盘门禁跳过 index.vue → load-error。
  //    安全性：仅匹配「:attr="…"」的引号内表达式，字符串 key（'xxx'）以引号开头不命中，
  //    驼峰 key（backgroundImage）无连字符不命中，CSS 类名（HTML 属性值，非指令）不在此上下文。
  out = out.replace(
    /(<template\b[^>]*>)([\s\S]*?)(<\/template>)/gi,
    (whole, open, body, close) => {
      const fixedBody = body.replace(
        /(:[\w-]+\s*=\s*")([^"]*?)(")/g,
        (_m, pre, expr, post) => pre + fixKeys(expr) + post,
      )
      return open + fixedBody + close
    },
  )
  return out
}

/**
 * 递归收集「解构/参数模式」里的绑定标识符（Identifier/ObjectPattern/ArrayPattern/Rest/Assignment）。
 * @param {object|null} node acorn 节点
 * @param {Set<string>} set 目标集合
 */
function collectPatternIdentifiers(node, set) {
  if (!node) return
  switch (node.type) {
    case 'Identifier':
      set.add(node.name)
      break
    case 'ObjectPattern':
      for (const p of node.properties) {
        if (p.type === 'RestElement') collectPatternIdentifiers(p.argument, set)
        else collectPatternIdentifiers(p.value, set) // { a, b: c } → 绑定是 a / c
      }
      break
    case 'ArrayPattern':
      for (const e of node.elements) collectPatternIdentifiers(e, set)
      break
    case 'RestElement':
      collectPatternIdentifiers(node.argument, set)
      break
    case 'AssignmentPattern':
      collectPatternIdentifiers(node.left, set)
      break
  }
}

/**
 * 检测 <script> 内部「引用了既未声明、又未 import、又不在全局白名单」的自由变量。
 *
 * 背景（2026-08-26 mc-1787669648758 的 index.vue）：
 *   模型在主组件里生成了与模板无关的「孤儿图表初始化死代码」，引用了从未声明的 `chartRef`，
 *   运行时抛 `chartRef is not defined`。现有门禁只查「模板引用未声明」，漏掉了 script 内部自由变量。
 *
 * 误伤防线（宁可漏报、不可误报）：
 *   1. 用 acorn AST 而非正则，精准排除：声明位置 / 成员访问属性名(foo.bar 的 bar) /
 *      对象 key({ foo:1 } 的 foo) / 函数参数 / import 的 imported/local / 标签。
 *   2. 声明集合 = 顶层 + 函数内 + 参数 + catch 参数 + class 名（acorn 全量收集）。
 *   3. 白名单 = SCRIPT_GLOBALS ∪ extraGlobals（调用方传入的 implicitlyDeclared：资源变量/子组件标签/内置组件）。
 *   4. 解析器缺失或语法错误 → 返回 []（语法错误由 validateVueSfc 拦，这里不重复、不误杀）。
 *
 * @param {string} scriptBody 不含 <script> 标签的脚本内容
 * @param {Object} [opts]
 * @param {string[]} [opts.extraGlobals=[]] 额外视为全局的变量名
 * @returns {string[]} 自由变量名（去重，保持首次出现顺序）
 */
export function detectScriptFreeVariables(scriptBody, { extraGlobals = [] } = {}) {
  if (!scriptBody || typeof scriptBody !== 'string') return []
  if (!acornParser || !acornWalker) return [] // 解析器缺失：降级跳过

  let ast
  try {
    ast = acornParser.parse(scriptBody, { ecmaVersion: 'latest', sourceType: 'module' })
  } catch {
    return [] // 语法错误由 validateVueSfc 拦截，这里不重复报、不误杀
  }

  const globals = new Set(SCRIPT_GLOBALS)
  for (const g of extraGlobals) if (g) globals.add(g)

  const declared = new Set()
  const referenced = new Set()

  // 第一遍：收集所有声明（顶层 + 函数内 + 参数 + catch + import + class）
  // 注意：acorn-walk 回调第 3 参 type 是「简化类型名」(VariablePattern/Function)，须用 node.type 标准名判断。
  acornWalker.full(ast, (node) => {
    switch (node.type) {
      case 'VariableDeclarator':
        if (node.id) collectPatternIdentifiers(node.id, declared)
        break
      case 'FunctionDeclaration':
      case 'FunctionExpression':
        if (node.id) declared.add(node.id.name)
        for (const p of node.params || []) collectPatternIdentifiers(p, declared)
        break
      case 'ArrowFunctionExpression':
        for (const p of node.params || []) collectPatternIdentifiers(p, declared)
        break
      case 'ClassDeclaration':
      case 'ClassExpression':
        if (node.id) declared.add(node.id.name)
        break
      case 'CatchClause':
        if (node.param) collectPatternIdentifiers(node.param, declared)
        break
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
      case 'ImportSpecifier':
        if (node.local) declared.add(node.local.name)
        break
    }
  })

  // 第二遍：收集「真正的引用」（排除声明/属性名/key/参数/import/标签）
  acornWalker.fullAncestor(ast, (node, _state, ancestors) => {
    if (node.type !== 'Identifier') return
    const parent = ancestors[ancestors.length - 2]
    if (!parent) return

    // 声明位置：不进 referenced（即便进了也会被 declared 过滤，但显式排除更清晰）
    if (parent.type === 'VariableDeclarator' && parent.id === node) return
    if (
      (parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' ||
        parent.type === 'ClassDeclaration' || parent.type === 'ClassExpression') &&
      parent.id === node
    ) return
    if (parent.type === 'CatchClause' && parent.param === node) return
    if (
      (parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' ||
        parent.type === 'ArrowFunctionExpression') &&
      (parent.params || []).includes(node)
    ) return
    if (
      parent.type === 'ImportDefaultSpecifier' || parent.type === 'ImportNamespaceSpecifier' ||
      parent.type === 'ImportSpecifier'
    ) return
    // 成员访问的「属性名」：foo.bar 的 bar（非计算）
    if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return
    // 对象字面量 key：{ foo: 1 } 的 foo（非计算、非简写；简写 { foo } 是引用，不排除）
    if (parent.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand) return
    // 方法定义 key
    if (parent.type === 'MethodDefinition' && parent.key === node && !parent.computed) return
    // 标签语句
    if (parent.type === 'LabeledStatement' && parent.label === node) return

    referenced.add(node.name)
  })

  const free = []
  for (const name of referenced) {
    if (declared.has(name)) continue
    if (globals.has(name)) continue
    free.push(name)
  }
  return free
}
