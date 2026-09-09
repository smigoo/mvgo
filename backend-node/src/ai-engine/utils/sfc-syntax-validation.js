import { readFileSync, readdirSync, existsSync } from 'fs'
import { isAbsolute } from 'path'
import { parse as parseJavaScript } from '@babel/parser'
import {
  compileScript,
  compileStyle,
  compileTemplate,
  parse as parseSfc
} from '@vue/compiler-sfc'

function formatCompilerError(error, filePath, kind) {
  const message = error?.message || String(error || `${kind} 编译失败`)
  const loc = error?.loc?.start || error?.loc
  if (!loc) return `${filePath || 'Vue SFC'} ${kind}: ${message}`
  return `${filePath || 'Vue SFC'}:${loc.line || 1}:${(loc.column || 0) + 1} ${kind}: ${message}`
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
