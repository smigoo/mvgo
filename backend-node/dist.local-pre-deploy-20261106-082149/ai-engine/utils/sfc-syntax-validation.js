import { readFileSync, readdirSync, existsSync } from 'fs'
import { isAbsolute } from 'path'
import { parse as parseJavaScript } from '@babel/parser'
import {
  compileScript,
  compileStyle,
  compileTemplate,
  parse as parseSfc
} from '@vue/compiler-sfc'

/**
 * 统一格式化编译/解析错误。
 *
 * 🛡️ 2026-09-13：补 LESS 错误形态（`{line, column, filename, extract}`）——
 * 旧实现只看 `error.loc`，而 less 抛出的错误**只有** `line/column/extract`，于是
 * 「style: Missing closing ')'」这种**没有行号、没有代码帧**的报错被写进日志/P1-4
 * rawErrors，排查时必须手工二分复现整条变换链才能定位（事故 mc-1789308308127：
 * 实际是 `:not()` 被掏空，改动点却在类名归一器，跨模块）。
 * 现在把「位置 + 3 行代码帧（`@here` 标记行）」一并输出，一次定位到行。
 */
function formatCompilerError(error, filePath, kind) {
  const message = error?.message || String(error || `${kind} 编译失败`)
  const loc = error?.loc?.start || error?.loc
  // less 错误形态：{ type, message, filename, line, column, extract: [before, at, after] }
  const lessLine = Number(error?.line)
  const hasLessLoc = !loc && Number.isFinite(lessLine) && lessLine > 0
  const frameLines = Array.isArray(error?.extract) ? error.extract.filter(Boolean) : []
  const frame = frameLines.length > 0 ? `\n    ${frameLines.join('\n    ')}` : ''
  if (hasLessLoc) {
    const col = Number(error?.column) > 0 ? `:${Number(error.column) + 1}` : ''
    return `${filePath || 'Vue SFC'}:${lessLine}${col} ${kind}: ${message}${frame}`
  }
  if (!loc) return `${filePath || 'Vue SFC'} ${kind}: ${message}${frame}`
  return `${filePath || 'Vue SFC'}:${loc.line || 1}:${(loc.column || 0) + 1} ${kind}: ${message}${frame}`
}

function validateScriptBlock(block, source, filePath, errors) {
  const isTypeScript = /\blang\s*=\s*["']tsx?["']/i.test(block.attrs)
  try {
    parseJavaScript(block.content, {
      sourceType: 'module',
      errorRecovery: false,
      plugins: [
        ...(isTypeScript ? ['typescript'] : []),
        'jsx',
        'topLevelAwait',
        'importMeta'
      ]
    })
  } catch (error) {
    const lineOffset = lineAtOffset(source, block.offset)
    const line = Number(error?.loc?.line || 1) + lineOffset
    const column = Number(error?.loc?.column || 0) + 1
    errors.push(`${filePath || 'Vue SFC'}:${line}:${column} script: ${error?.message || 'script 语法错误'}`)
  }
}

function stripDeferredLocalStyleImports(source = '') {
  return String(source || '').replace(
    /^\s*@import\s+(?:\([^)]*\)\s*)?["'](?:\.{1,2}\/)[^"']+["']\s*;?\s*$/gm,
    ''
  )
}

/**
 * 归一化 SFC 内 `resources/` 相对路径（与前端 `loadVue3Runtime#fixResourcePaths`、
 * `vite.config#workspace-css-guard` **同口径**，避免三处各写一份正则漂移）。
 *
 * 背景：管线生成的 `package/index.vue`（位于 `package/` 子目录）引用 `./resources/`
 * （错误，应为 `../resources/`），`package/components/X.vue` 应为 `../../resources/`。
 * 前端在预览/构建期已各自修正，但写盘目录门禁此前**不修正** → 绝对路径校验时
 * `@import './resources/styles/index.less'` 解析到不存在的 `package/resources/...`，
 * 报 `SyntaxError: undefined`（或连带 `variable @fontSize is undefined`）而误杀。
 *
 * 按 `relPath` 相对组件根的层级计算正确前缀（0 层=`./resources/`，1 层=`../resources/`，…），
 * 仅改写 `resources/` 前缀引用，其余路径原样保留。
 *
 * @param {string} source SFC 全文
 * @param {string} relPath 相对组件根的路径（如 `package/index.vue`）
 * @returns {string}
 */
export function normalizeResourceRelativePaths(source = '', relPath = '') {
  if (!source || !relPath || !String(relPath).endsWith('.vue')) return source
  const depth = Math.max(0, String(relPath).split('/').length - 1)
  const expectedPrefix = depth === 0 ? './resources/' : `${'../'.repeat(depth)}resources/`
  return String(source).replace(
    /['"](?:\.\.\/)+resources\/|['"]\.\/resources\//g,
    (matched) => `${matched.charAt(0)}${expectedPrefix}`,
  )
}

/**
 * 🛡️ 从文件集提取根作用域可见的 LESS 变量声明（@name: value;）→ globalVars 映射。
 *
 * 根因（mc-max-1788258252381-9168ed08 实锤，2026-09-01）：内存生成阶段
 * `validateVueSfc` 会剥离相对 @import（系统标准 index.less 尚未落盘，避免把
 * 「import 解析失败」误报为样式错误）——但剥离 import 同时也剥掉了
 * theme-vars.less 提供的**变量定义**。子组件 scoped 样式合法引用
 * `font-size: calc(@fontSize * 1.14)` 时，报 `variable @fontSize is undefined`
 * → 分类为 STYLE_SYNTAX → P1-4 坏文件隔离降级**误杀 4/5 个健康子组件**
 * （仅未引用主题变量的 FlowPrediction 幸存），任务却「成功」完成。
 *
 * 治本：剥离 import 的同时，以 less `globalVars` 注回变量定义（globalVars 语义
 * = 编译前把变量定义置于最前，与被剥离 import 链提供的定义等价），产物零改写。
 *
 * 收集范围（与微码标准样式机制对齐，见 index.less 模板：根作用域 `.common()`
 * `.theme-light()` 调用 + theme-vars.less 的 mixin 定义）：
 *   1. 顶层（深度 0）`@var: value;` 声明；
 *   2. **顶层 mixin 定义体**（`.common() { @fontSize: 14px; }`）内的变量——LESS
 *      mixin 闭包变量在调用方作用域可见，标准 index.less 恰在根作用域调用这些
 *      mixin，故其变量对根作用域可见（.common()/.theme-light()/.theme-dark()）。
 *      嵌套选择器（非 mixin）内的变量作用域受限，不收集。
 *
 * 同名变量取首个定义；此处只为让「import 链本应提供的定义」在内存校验中在场，
 * 真正的语义级 LESS 校验由落盘后的目录门禁（绝对路径完整编译 import 链）承担。
 *
 * @param {Object<string,string>|Array<{path:string,content:string}>} files
 * @returns {Object<string,string>} 形如 { fontSize: '14px' }；无 .less 时为空对象
 */
export function extractLessGlobalVars(files) {
  const vars = {}
  const entries = Array.isArray(files)
    ? files.map((f) => [f?.path, f?.content])
    : Object.entries(files || {})
  for (const [path, content] of entries) {
    if (!/\.less$/i.test(String(path || '')) || typeof content !== 'string') continue
    collectLessScopeVars(content, vars)
  }
  return vars
}

function collectLessScopeVars(lessSource, vars) {
  // 保守剥离注释（块注释整段去；行注释须行首或前置空白，避免误伤 url(//…)）
  const noComments = String(lessSource || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*$/gm, '$1')
  let depth = 0
  let inTopMixin = false
  for (const line of noComments.split('\n')) {
    const opens = (line.match(/\{/g) || []).length
    const closes = (line.match(/\}/g) || []).length
    if (depth === 0) {
      const m = line.match(/^\s*@([\w-]+)\s*:\s*([^;{}]+);\s*$/)
      if (m && !(m[1] in vars)) vars[m[1]] = m[2].trim()
      // 顶层 mixin 定义开行（.name(...) {）：进入收集模式
      if (opens > closes && /^\s*\.[\w-]+\s*\([^{]*\{/.test(line)) {
        inTopMixin = true
      }
    } else if (inTopMixin && depth === 1) {
      const m = line.match(/^\s*@([\w-]+)\s*:\s*([^;{}]+);\s*$/)
      if (m && !(m[1] in vars)) vars[m[1]] = m[2].trim()
    }
    depth += opens - closes
    if (depth <= 0) {
      depth = 0
      inTopMixin = false
    }
  }
  return vars
}

function validateVueSfcDescriptor(descriptor, source, filePath, errors, options = {}) {
  const id = `data-v-${Buffer.from(String(filePath || 'component.vue')).toString('hex').slice(0, 8)}`
  const canResolveLocalStyleImports = isAbsolute(filePath) && existsSync(filePath)
  const scriptBlocks = extractScriptBlocks(source)
  for (const block of scriptBlocks) {
    validateScriptBlock(block, source, filePath, errors)
  }
  // 🛡️ 2026-10-03：子组件 import 入口 index.vue → vue3-sfc-loader 模块悬挂（mc-max-...-fbb7781f 实锤，见函数 docblock）
  errors.push(...findEntrypointCircularImports(source, filePath).errors)

  if (descriptor.scriptSetup) {
    try {
      compileScript(descriptor, { id })
    } catch (error) {
      errors.push(formatCompilerError(error, filePath, 'script'))
    }
  }

  if (descriptor.template) {
    try {
      const result = compileTemplate({
        source: descriptor.template.content,
        filename: filePath || 'component.vue',
        id
      })
      for (const error of result.errors || []) {
        errors.push(formatCompilerError(error, filePath, 'template'))
      }
    } catch (error) {
      errors.push(formatCompilerError(error, filePath, 'template'))
    }
  }

  for (const style of descriptor.styles || []) {
    try {
      const isLess = style.lang && style.lang !== 'css'
      // 内存阶段剥离了相对 @import → 其携带的主题变量定义同时丢失（见 extractLessGlobalVars
      // docblock 实锤）。以 less globalVars 注回文件集顶层变量，与 import 链提供的定义等价。
      // 绝对路径（已落盘）模式完整编译真实 import 依赖链，无需注入。
      const globalVars =
        !canResolveLocalStyleImports && isLess && options.lessGlobalVars
          ? options.lessGlobalVars
          : undefined
      const result = compileStyle({
        // 内存生成阶段，系统标准 index.less 尚未落盘，不能把相对 @import 解析失败误报为样式语法错误。
        // 写盘后的目录门禁使用绝对路径，会完整编译真实 import 依赖链。
        source: canResolveLocalStyleImports ? style.content : stripDeferredLocalStyleImports(style.content),
        filename: filePath || 'component.vue',
        id,
        scoped: style.scoped,
        modules: !!style.module,
        preprocessLang: style.lang && style.lang !== 'css' ? style.lang : undefined,
        ...(globalVars && Object.keys(globalVars).length > 0
          ? { preprocessOptions: { globalVars } }
          : {})
      })
      for (const error of result.errors || []) {
        errors.push(formatCompilerError(error, filePath, 'style'))
      }
    } catch (error) {
      errors.push(formatCompilerError(error, filePath, 'style'))
    }
  }
}

function extractScriptBlocks(source = '') {
  const blocks = []
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let match
  while ((match = pattern.exec(String(source || ''))) !== null) {
    blocks.push({
      attrs: match[1] || '',
      content: match[2] || '',
      offset: match.index + match[0].indexOf(match[2] || '')
    })
  }
  return blocks
}

function lineAtOffset(source, offset) {
  return String(source || '').slice(0, offset).split('\n').length - 1
}

export function validateVueScriptSyntax(source = '', filePath = '') {
  const errors = []
  for (const block of extractScriptBlocks(source)) {
    validateScriptBlock(block, source, filePath, errors)
  }
  return { valid: errors.length === 0, errors }
}

/**
 * @param {string} source .vue 全文
 * @param {string} filePath 文件路径（相对=内存阶段剥相对 @import；绝对且存在=完整编译 import 链）
 * @param {{lessGlobalVars?: Object<string,string>}} [options]
 *   lessGlobalVars：内存阶段的顶层 LESS 变量补集（见 extractLessGlobalVars），
 *   用于抵消「剥离 @import 连带剥掉 theme-vars 变量定义」的假阳性（P1-4 误杀实锤）。
 */
export function validateVueSfc(source = '', filePath = '', options = {}) {
  const errors = []
  const sourceText = String(source || '')
  let descriptor
  try {
    const parsed = parseSfc(sourceText, { filename: filePath || 'component.vue' })
    descriptor = parsed.descriptor
    for (const error of parsed.errors || []) {
      errors.push(formatCompilerError(error, filePath, 'SFC'))
    }
  } catch (error) {
    errors.push(formatCompilerError(error, filePath, 'SFC'))
    return { valid: false, errors }
  }

  if (descriptor) {
    validateVueSfcDescriptor(descriptor, sourceText, filePath, errors, options)
  }
  return { valid: errors.length === 0, errors }
}

/**
 * 🛡️ 2026-09-29 新增 · 检出 SFC 模板里的**重名插槽定义**（同一父元素下同名 slot 出现 2+ 次）。
 *
 * 为什么单独抽出：宿主面板契约（`base-panel` 的 4 个固定槽名，每槽只有一个 `<slot name>`）
 * 决定「一个槽名只能出现一次」。装配器一旦对同一槽名产出多个 `<template #xxx>`，会触发
 * 一条**全静默**的失效链（a349ce83 实锤）：
 *   资源注入器自检看到重名 → `writeGuarded` 回滚 → 资源未挂 → slot 级回退糊满整槽；
 *   而写盘门禁内的模板去重纠偏器又"恰好"把它删成合法 ⇒ 门禁通过、任务"成功"。
 * 故需要一个**可单独调用**的判据，插到纠偏器**之前**把缺陷显式判死。
 *
 * 口径（单一事实源，禁止另立正则）：`errors` 直接取自 `@vue/compiler-sfc#compileTemplate`
 * 本体，并逐字复用 `formatCompilerError`（输出 `文件:行:列 template: <message>`），
 * 保证与 `validateVueSfc` 报出的同一缺陷**字符串完全一致**。
 * `duplicates` 仅为可行动补充（槽名 + 定义次数 + 行号），非判定依据。
 *
 * @param {string} source .vue 全文
 * @param {string} [filePath] 用于错误串前缀的文件路径
 * @returns {{errors: string[], duplicates: Array<{name: string, count: number, lines: number[]}>}}
 */
export function findDuplicateSlotNames(source = '', filePath = '') {
  const empty = { errors: [], duplicates: [] }
  const sourceText = String(source || '')
  let descriptor
  try {
    descriptor = parseSfc(sourceText, { filename: filePath || 'component.vue' }).descriptor
  } catch {
    // 解析层错误由 validateVueSfc 负责报，这里不重复、不误杀
    return empty
  }
  if (!descriptor || !descriptor.template) return empty

  // ① 判定：复用 Vue 编译器自身的重名插槽检出口径
  const errors = []
  try {
    const id = `data-v-${Buffer.from(String(filePath || 'component.vue')).toString('hex').slice(0, 8)}`
    const result = compileTemplate({
      source: descriptor.template.content,
      filename: filePath || 'component.vue',
      id
    })
    for (const error of result.errors || []) {
      if (/Duplicate slot names/i.test(error?.message || '')) {
        errors.push(formatCompilerError(error, filePath, 'template'))
      }
    }
  } catch {
    // 同上：异常不在此处升级
  }
  if (errors.length === 0) return empty

  // ② 细节：按「同一父元素的直接子元素」口径统计槽名（与 Vue 对「组件自身 slot」的语义一致）
  const counter = new Map()
  const walk = (element) => {
    const children = Array.isArray(element?.children) ? element.children : []
    const localNames = new Map()
    for (const child of children) {
      if (!child || child.type !== 1) continue
      const props = Array.isArray(child.props) ? child.props : []
      const slotProp = props.find((p) => p && p.type === 7 && p.name === 'slot')
      if (slotProp) {
        const name =
          slotProp.arg && typeof slotProp.arg.content === 'string'
            ? slotProp.arg.content
            : 'default'
        if (!localNames.has(name)) localNames.set(name, [])
        localNames.get(name).push(child.loc?.start?.line || 0)
      }
      walk(child)
    }
    for (const [name, lines] of localNames) {
      if (lines.length <= 1) continue
      if (!counter.has(name)) counter.set(name, [])
      counter.get(name).push(...lines)
    }
  }
  walk(descriptor.template.ast)

  return {
    errors,
    duplicates: [...counter.entries()]
      .map(([name, lines]) => ({ name, count: lines.length, lines: lines.slice().sort((a, b) => a - b) }))
      .sort((a, b) => b.count - a.count)
  }
}

/**
 * 🛡️ 2026-09-30 新增 · 检出 SFC「脚本块泄漏」（scriptSplit 多段拼接畸形）。
 *
 * 背景（`mc-max-1790770973695-8bb771e4` 实锤）：`package/index.vue` 的 `<script setup>` 由
 * `chunk-meta.json` 的 `state / lifecycle / charts` **多段**拼成，每段自带包裹标签。
 * 上游 `mergeScriptParts` 只剥「末尾」一个闭合标签，段间多出的 `</script>` 会残留 ⇒
 * 第 2/3 段（生命周期 `onMounted`/`onUnmounted`）被切到 script 块**之外**。
 *
 * 为什么必须独立成判据：`@vue/compiler-sfc#parse` **不报错**（顶层游离文本被容忍），
 * `validateVueSfc` 全绿、任务「成功」，而 `onMounted` 永不执行 ⇒
 * 「组件加载完成（onload）」业务事件静默失效。危害是全静默的，与重名插槽同族。
 *
 * 口径：对每个 `</script>` 取其到**下一个顶层块开标签**（`<template|<script|<style`）或
 * 文件结尾之间的内容；剥掉 HTML 注释后仍有非空白字符 ⇒ 判泄漏。
 * 正常的 `<template>/<script>/<style>` 三块结构里，该区段恒为空白。
 *
 * @param {string} source .vue 全文
 * @param {string} [filePath] 错误串前缀
 * @returns {{leaks: Array<{line: number, chars: number, preview: string}>, errors: string[]}}
 */
export function detectScriptBlockLeakage(source = '', filePath = '') {
  const sourceText = String(source || '')
  const leaks = []
  const errors = []
  const rx = /<\/script\s*>/gi
  let m
  while ((m = rx.exec(sourceText)) !== null) {
    const closeEnd = m.index + m[0].length
    const nextBlockStart = _nextTopLevelBlockStart(sourceText, closeEnd)
    const gap = sourceText.slice(closeEnd, nextBlockStart)
    const bare = gap.replace(/<!--[\s\S]*?-->/g, '').trim()
    if (bare === '') continue
    const line = lineAtOffset(sourceText, closeEnd) + 1
    leaks.push({
      line,
      chars: bare.length,
      preview: bare.split('\n')[0].slice(0, 80)
    })
    errors.push(
      `${filePath || 'Vue SFC'}:${line}:1 script: 脚本块泄漏 —— </script> 与下一个顶层块之间有 ${bare.length} 字符裸 JS（该段永不执行）: ${bare.split('\n')[0].slice(0, 60)}`
    )
  }
  return { leaks, errors }
}

/** 取 offset 之后第一个顶层块开标签的位置（无则返回全文长度）。 */
function _nextTopLevelBlockStart(sourceText, from) {
  const rx = /<(?:template|script|style)\b/gi
  rx.lastIndex = from
  const nx = rx.exec(sourceText)
  return nx ? nx.index : sourceText.length
}

/**
 * 确定性自愈：消解「脚本块泄漏」区段。**分两种形态，按「能否 parse 成 JS 模块」分流**
 * （实测两形态都真实存在，一刀切必错）：
 *
 *   - **形态 A · 泄漏内容是 JS**（scriptSplit 残留的生命周期段）⇒ **把 `</script>` 后移到区段之后**
 *     （内容重新归入 script 块）。实锤：`c-traffic-monitor-598d88fc` 等 9 例。
 *   - **形态 B · 泄漏内容是说明文字/markdown**（LLM 说明落到 `</script>` 与 `<style>` 之间）
 *     ⇒ **整段删除**。实锤：`c-max-…-12bc3750`（1077 字符 `## 📋 脚本生成说明…`）。
 *     形态 B 若走后移会把 markdown 塞进 script 块 → 必语法错。
 *   - **混合形态**（JS 前缀 + markdown 尾巴）⇒ 从**尾部**逐行回退，取「最长可 parse 前缀」留在
 *     script 块内、其余删除。
 *
 * 纪律（与 `stripSurplusBlockClosers` 同族：纯文本变换、幂等）：
 *   - **删标签、保内容**：绝不 `slice` 截断 JS（会把同段后续脚本整块丢掉）；
 *   - **自愈候选不得引入新的 script 语法错**（`validateVueScriptSyntax` 前后比对）：泄漏段常与
 *     块内已有声明重复（`state` 段与 `lifecycle` 段都写 `emitLoadEvent`）⇒ 直接后移会触发
 *     `Identifier 'x' has already been declared`；此时退化为「删除」候选，两者都失败才记 `unfixable`；
 *   - 只处理「第一个泄漏点」，循环至收敛（上限 20 轮防空转）；
 *   - **不猜**：既 parse 不过、又不属说明文字形态 ⇒ 记入 `unfixable` **原样不动**，
 *     由调用方走 fail-fast（宁可重试，也不静默丢代码）。
 *
 * @param {string} source .vue 全文
 * @returns {{source: string, fixed: boolean,
 *   actions: Array<{kind: 'moved'|'dropped', line: number, chars: number, preview: string}>,
 *   unfixable: Array<{line: number, chars: number, preview: string}>}}
 */
export function healScriptBlockLeakage(source = '') {
  const src = String(source || '')
  if (!/<\/script\s*>/i.test(src)) {
    return { source: src, fixed: false, actions: [], unfixable: [] }
  }
  const actions = []
  const unfixable = []
  let out = src
  for (let guard = 0; guard < 20; guard++) {
    const target = _firstLeakTarget(out)
    if (!target) break
    const gap = out.slice(target.closeEnd, target.nextBlockStart)
    const trimmed = gap.trim()
    const line = lineAtOffset(out, target.closeEnd) + 1
    const preview = trimmed.split('\n')[0].slice(0, 80)

    // 分流：整段能否 parse 成 JS 模块
    let jsPart = ''
    let droppedPart = ''
    if (_parsesAsJsModule(trimmed)) {
      jsPart = trimmed
    } else {
      const split = _splitJsPrefix(trimmed)
      if (split.js.trim() !== '') {
        jsPart = split.js.trim()
        droppedPart = split.rest.trim()
      } else if (_looksLikeNarration(trimmed)) {
        droppedPart = trimmed
      } else {
        // 不猜：原样保留，交 fail-fast
        unfixable.push({ line, chars: trimmed.length, preview })
        break
      }
    }

    const head = out.slice(0, target.closeStart).replace(/\s*$/, '')
    const tail = out.slice(target.nextBlockStart)
    const tailSep = tail.startsWith('\n') ? '' : '\n'

    // 🔑 关键判据（8bb771e4 实锤）：自愈候选**不得引入新的 script 语法错**。
    // 泄漏段常见「与块内已有声明重复」（`state` 段与 `lifecycle` 段都写了 `emitLoadEvent`）——
    // 这正是上游 `mergeScriptParts` 去重链的职责，而泄漏段**绕过了**合并 ⇒ 直接后移会
    // 触发 `Identifier 'emitLoadEvent' has already been declared`。故：
    //   ① 后移候选无错 ⇒ 采用「后移」（保留生命周期，如 onUnmounted 清理）；
    //   ② 后移引入错 ⇒ 退化为「删除」候选（泄漏段本为块内已有声明的冗余副本）；
    //   ③ 两者都引入错 ⇒ 不猜，记 unfixable 交 fail-fast。
    const baselineErrs = validateVueScriptSyntax(out, '').errors.length
    const candMove =
      jsPart === '' ? null : `${head}\n${jsPart}\n</script>${tailSep}${tail}`
    const candDrop = `${head}\n</script>${tailSep}${tail}`
    const pick = (cand, kind, text) =>
      validateVueScriptSyntax(cand, '').errors.length <= baselineErrs
        ? {
            src: cand,
            kind,
            chars: text.length,
            preview: text.split('\n')[0].slice(0, 80),
          }
        : null

    const chosen =
      (candMove && pick(candMove, 'moved', jsPart)) ||
      pick(candDrop, 'dropped', jsPart || droppedPart)

    if (!chosen) {
      // 不猜：原样保留，交 fail-fast
      unfixable.push({ line, chars: trimmed.length, preview })
      break
    }
    out = chosen.src
    actions.push({ kind: chosen.kind, line, chars: chosen.chars, preview: chosen.preview })
  }
  return { source: out, fixed: actions.length > 0, actions, unfixable }
}

/** 取「第一个泄漏点」的位置信息（无则 null）。 */
function _firstLeakTarget(sourceText) {
  const rx = /<\/script\s*>/gi
  let m
  while ((m = rx.exec(sourceText)) !== null) {
    const closeEnd = m.index + m[0].length
    const nextBlockStart = _nextTopLevelBlockStart(sourceText, closeEnd)
    const naked = sourceText.slice(closeEnd, nextBlockStart).replace(/<!--[\s\S]*?-->/g, '').trim()
    if (naked !== '') return { closeStart: m.index, closeEnd, nextBlockStart }
  }
  return null
}

/** 该文本能否作为 JS 模块解析（空串视为可解析）。 */
function _parsesAsJsModule(text) {
  const t = String(text || '').trim()
  if (t === '') return true
  try {
    parseJavaScript(t, {
      sourceType: 'module',
      errorRecovery: false,
      plugins: ['typescript', 'jsx', 'topLevelAwait', 'importMeta']
    })
    return true
  } catch {
    return false
  }
}

/**
 * 从尾部逐行回退，取「最长可 parse 前缀」。用于「JS 前缀 + 垃圾尾巴」混合形态。
 * @returns {{js: string, rest: string}}
 */
function _splitJsPrefix(text) {
  const lines = String(text || '').split('\n')
  for (let end = lines.length; end >= 1; end--) {
    const candidate = lines.slice(0, end).join('\n')
    if (_parsesAsJsModule(candidate)) {
      return { js: candidate, rest: lines.slice(end).join('\n') }
    }
  }
  return { js: '', rest: text }
}

/** 说明文字/markdown 形态判据：首个非空行是标题/围栏/注释/列表标记。 */
function _looksLikeNarration(gap) {
  const first = String(gap || '')
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s !== '') || ''
  return /^(#{1,6}\s|```|<!--|<[a-zA-Z/!]|\*\s|>\s|-{3,}|={3,})/.test(first)
}

/**
 * 🛡️ 2026-09-30 新增 · 宿主保留组件名 —— 产物 `package/components/<name>.vue` 禁止同名。
 *
 * 名单来源（单一事实源：前端**全局注册**点，两处对称）：
 *   - `frontend/src/utils/loadVue3Runtime.js:450`  `app.component('base-panel', …)`
 *   - `frontend/src/views/preview/index.vue:954`   `app.component('base-panel', …)`
 * 新增条目前必须先确认存在全局注册点，否则不得入列（避免把普通子组件名误判为保留名）。
 *
 * 危害（`mc-max-1790770973695-8bb771e4` 实锤「两个头部插槽」）：LLM 把宿主外壳当成普通子组件
 * 生成 → `package/components/base-panel.vue` 模板里再套一层 `<base-panel>`（自引用宿主外壳），
 * 且自带 `<template #header-right>`（与 `index.vue:3` 的同名插槽重复）⇒ 面板外壳套两层。
 */
export const HOST_RESERVED_COMPONENT_NAMES = Object.freeze(['base-panel'])

/**
 * 🛡️ 2026-10-03 新增 · 检出**子组件对组件入口 index.vue 的 import**（mc-max-1790946087204-fbb7781f 实锤）。
 *
 * 全静默失效链（该任务预览「正在加载组件...」永卡，本函数为治本门禁）：
 *   HeaderSection2.vue 写了 `import { runtimeBuilder } from '../index.vue'`：
 *   ① 入口 package/index.vue 是 `<script setup>`，不存在 `runtimeBuilder` 具名导出（局部解构 const 不导出）；
 *   ② 子组件 → 入口 → 子组件构成**循环依赖**；
 *   ③ vue3-sfc-loader 解析该模块时 promise **悬挂不 throw** ⇒ 预览永卡 loading、console 零报错、
 *      运行时门禁只记 RUNTIME-003/004（未 ready 未 error），且加载器「快照源失败退 workspace 源」
 *      的重试逻辑因错误不是 throw 而完全不触发。
 *   正确写法：子组件自行 `const { runtimeBuilder } = $mcComponentBuilder()`（每个 SFC 模块各调一次），
 *   与 c-device-monitor 系列、c-b-83885ba4 等健康产物一致。
 *
 * 判据（目标导向，与来源文件无关）：script 块内任一 `import ... from '<spec>'` / 裸 `import '<spec>'`，
 * 其 spec 形如「一或多段 `./`/`../` 前缀 + 恰好 `index.vue`」⇒ 命中。
 * 不判具名导出名——入口是 `<script setup>` 时任何具名导入都必然失败；裸 import 同样构成循环依赖。
 * 不误伤：`./components/index.vue` 等子目录 barrel（前缀后不是直接 index.vue）不命中。
 *
 * @param {string} source .vue 全文
 * @param {string} [filePath] 错误串前缀
 * @returns {{hits: Array<{spec: string, line: number}>, errors: string[]}}
 */
export function findEntrypointCircularImports(source = '', filePath = '') {
  const hits = []
  const errors = []
  const sourceText = String(source || '')
  // 「一或多段 ./ 或 ../ 前缀后恰好 index.vue」——即任何解析到组件入口的相对引用
  const ENTRY_SPEC_RE = /^\.?\.\/(?:\.?\.\/)*index\.vue$/
  const IMPORT_FROM_RE = /\bimport\b[^'"();]*?from\s*['"]([^'"]+)['"]/g
  const BARE_IMPORT_RE = /\bimport\s*['"]([^'"]+)['"]/g
  for (const block of extractScriptBlocks(sourceText)) {
    for (const re of [IMPORT_FROM_RE, BARE_IMPORT_RE]) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(block.content)) !== null) {
        const spec = m[1]
        if (!spec || !ENTRY_SPEC_RE.test(spec)) continue
        const line = lineAtOffset(sourceText, block.offset + m.index) + 1
        if (hits.some((h) => h.line === line && h.spec === spec)) continue
        hits.push({ spec, line })
        errors.push(
          `${filePath || 'Vue SFC'}:${line}:1 script: 禁止 import 组件入口 index.vue（'${spec}'）—— 入口为 <script setup> 无具名导出，且形成循环依赖，vue3-sfc-loader 会模块悬挂导致预览永久卡「正在加载组件」。需要发布事件时在子组件内调用 $mcComponentBuilder() 解构 runtimeBuilder（每个模块一次）`
        )
      }
    }
  }
  return { hits, errors }
}

/**
 * 检出产物里与宿主保留名同名的子组件文件。
 *
 * @param {Object<string,string>} files 相对路径 → 内容（相对产物根，如 `package/components/base-panel.vue`）
 * @param {string} [filePath] 错误串前缀（一般为 `package/index.vue`）
 * @returns {{collisions: Array<{name: string, file: string}>, errors: string[]}}
 */
export function findHostReservedComponentCollisions(files = {}, filePath = '') {
  const collisions = []
  const errors = []
  const reserved = new Set(HOST_RESERVED_COMPONENT_NAMES)
  for (const rel of Object.keys(files || {})) {
    const norm = String(rel).replace(/\\/g, '/')
    // 只认产物子组件目录，避免误伤 resources/ 下的同名资源或宿主自身的注册文件
    if (!/(^|\/)package\/components\//.test(norm)) continue
    if (!/\.vue$/i.test(norm)) continue
    const base = norm.slice(norm.lastIndexOf('/') + 1).replace(/\.vue$/i, '')
    if (!reserved.has(base.toLowerCase())) continue
    collisions.push({ name: base, file: norm })
    errors.push(
      `${filePath || 'Vue SFC'}:1:1 script: 产物子组件名与宿主保留组件同名（'${base}'）—— ${norm} 会与宿主全局注册的 <${base}> 争用同名外壳（渲染即套两层外壳 / 重复插槽）`
    )
  }
  return { collisions, errors }
}

export function validateVueSfcDirectory(packageDir = '') {
  const errors = []
  if (!existsSync(packageDir)) return [`产物目录不存在: ${packageDir}`]

  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        visit(fullPath)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.vue')) continue
      const result = validateVueSfc(readFileSync(fullPath, 'utf8'), fullPath)
      errors.push(...result.errors)
    }
  }

  visit(packageDir)
  return errors
}

export function assertVueSfc(source = '', filePath = '') {
  const result = validateVueSfc(source, filePath)
  if (!result.valid) {
    throw new Error(`Vue SFC 编译校验失败：\n${result.errors.map((item) => `- ${item}`).join('\n')}`)
  }
  return result
}

export function assertVueScriptSyntax(source = '', filePath = '') {
  const result = validateVueScriptSyntax(source, filePath)
  if (!result.valid) {
    throw new Error(`Vue SFC script 语法校验失败：\n${result.errors.map((item) => `- ${item}`).join('\n')}`)
  }
  return result
}
