import less from 'less'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { dirname, join, normalize, relative } from 'path'

// ⚠️ 本模块**刻意不** import config/backend-root.js（R0-8，2026-09-01）。
// 原因：backend-root.js 使用 `import.meta`，而 jest 以 CJS 模式 transform，
// `import.meta` 在 CJS 下是语法错误（已实测：cannot use 'import.meta' outside a module）。
// 一旦本文件在模块作用域静态依赖它，所有传递依赖本文件的测试套件都会整体加载失败——
// 实锤 code-healer.spec.ts 的 40 个用例由 PASS 变成 0 用例执行（本文件被 code-healer.js
// 以 healMissingLessBraces 引入）。
// 本门禁的 outputPath 由调用方显式传入（见 LessCompileGate.validate 注释），无需全局根路径。
// 若将来确实需要全局路径，**必须**改造成惰性动态 import，禁止恢复模块作用域静态依赖。

const SHARED_LESS = 'resources/styles/index.less'

function normalizePath(filePath = '') {
  return String(filePath).replaceAll('\\', '/')
}

export function collectLessCompileFiles(outputPath) {
  const files = {}
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      if (['node_modules', '.cache', '.checkpoint', '.mc-gen'].includes(name)) continue
      const fullPath = join(dir, name)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (name.endsWith('.vue') || name.endsWith('.less')) {
        const relativePath = normalizePath(relative(outputPath, fullPath))
        files[relativePath] = readFileSync(fullPath, 'utf-8')
      }
    }
  }
  walk(outputPath)
  return files
}

/**
 * 判断某行是否为「看起来像 CSS 代码」的行（而非注释续行）。
 * 用于识别「只开不闭」的块注释：若一行以斜杠星号开头、不含对应的星号斜杠结束符，
 * 且紧随其后的行是真实 CSS，则该注释几乎可以确定是被作者遗漏闭合的单行注释（如装饰性横幅）。
 */
function isCssLikeLine(line) {
  const t = String(line || '').trim()
  if (!t) return false
  return (
    /^[\.#{@[]/.test(t) || // 选择器：.class / #id / @media / [attr]
    /^[\}\{]/.test(t) || // 块结束 / 块开始
    /^[a-zA-Z_-][\w-]*\s*\{/.test(t) || // 标签选择器带 {
    t.startsWith('//') // 行注释（绝不可能是块注释续行）
  )
}

/**
 * 自动补全「只开不闭」的块注释。
 * 规则：遍历每一行，若某行以斜杠星号开头但不含星号斜杠结束符，且下一行是 CSS 代码行，
 * 则在该行末尾补上块注释结束符，使其成为合法的单行块注释。
 * 说明：LESS 块注释为 C 风格（不嵌套），未闭合的斜杠星号会一直吞到下一个星号斜杠才被迫闭合，
 * 从而把后续本应生效的 CSS 规则暴露为顶层裸 token —— 这正是本组件报错的根因。
 * 该修复对正常的多行块注释（续行不是 CSS）无副作用。
 */
function healUnclosedLessComments(styleSource = '') {
  const lines = String(styleSource || '').split('\n')
  let changed = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.includes('/*')) continue
    if (line.includes('*/')) continue
    const next = lines[i + 1] || ''
    if (isCssLikeLine(next)) {
      lines[i] = line.replace(/\s*$/, '') + ' */'
      changed = true
    }
  }
  return { source: lines.join('\n'), changed }
}

/**
 * 修复 LESS/CSS 中确定性可推断的缺失右大括号。
 *
 * LLM 截断通常表现为：一个规则已有声明但没有 `}`，后面紧接着新的无缩进规则，
 * 或整个文件只在末尾少了若干个 `}`。前一种情况要在新规则前闭合当前块，
 * 否则虽然补到文件末尾也可能把所有后续规则错误嵌套进根容器。
 * 不修复中间缺失且无法确认边界的括号、括号多余、字符串或注释未闭合，避免误改合法 LESS。
 *
 * R0-5（2026-09-01）：导出为单一事实源——code-healer 的 healVueEmbeddedStyleBraces
 * 已废弃本地「剥注释纯计数」实现，改为按 style 块委托本函数（同算法、同作用域）。
 */
export function healMissingLessBraces(styleSource = '') {
  const source = String(styleSource || '')
  const lines = source.split('\n')
  const output = []
  const frames = []
  let quote = ''
  let escaped = false
  let inBlockComment = false
  let inLineComment = false
  let changed = false

  const isTopLevelRule = (line) => {
    const trimmed = line.trim()
    if (!trimmed || line !== line.trimStart()) return false
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('}')) return false
    return /^(?:[.#\w\[]|@(media|supports|container|keyframes|font-face)\b)[^{}]*\{/.test(trimmed)
  }

  for (const line of lines) {
    const current = frames[frames.length - 1]
    if (current?.hasDeclaration && isTopLevelRule(line)) {
      output.push('}')
      frames.pop()
      changed = true
    }

    output.push(line)
    inLineComment = false
    let sawDeclaration = /^\s*[-\w]+\s*:/.test(line) && !/^\s*[.#\w\[\]]+\s*\{/.test(line)

    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      const next = line[i + 1]

      if (inLineComment) continue
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false
          i++
        }
        continue
      }
      if (quote) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === quote) quote = ''
        continue
      }
      if (ch === '/' && next === '/') {
        inLineComment = true
        i++
        continue
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true
        i++
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        continue
      }
      if (ch === '{') {
        frames.push({ hasDeclaration: sawDeclaration })
        sawDeclaration = false
      } else if (ch === '}') {
        if (frames.length === 0) return { source, changed: false }
        frames.pop()
      }
    }

    if (sawDeclaration && frames.length > 0) {
      frames[frames.length - 1].hasDeclaration = true
    }
  }

  if (quote || inBlockComment || inLineComment) return { source, changed: false }
  if (frames.length > 0) {
    output.push('}'.repeat(frames.length))
    changed = true
  }
  if (!changed) return { source, changed: false }
  return {
    source: output.join('\n'),
    changed: true,
    addedBraces: (output.join('\n').match(/}/g) || []).length - (source.match(/}/g) || []).length,
  }
}

/**
 * 自动补全「声明漏写结尾分号」的 LESS/CSS 语法错误。
 * 背景：LLM 生成的样式常在属性声明后漏写 `;`（如 `background-size: 100% 100%` 紧接下一行
 * `transition: ...`），导致 LESS 编译器把两行拼成一个非法值（"Unrecognised input"），
 * 预览 load-error → RUNTIME-004 硬阻断。
 * 规则：仅对 <style> 块内（或纯 .less/.css 文件整体）、形如 `prop: value`（值非空、不以 ; { } 结尾）
 * 的声明，且其下一行有意义内容为「新声明 / 块结束 / 嵌套选择器 / @规则」时，补 `;`。
 * 对选择器行（.foo / a:hover / & / > / @ 等）、块边界、注释无副作用。
 * 仅在修复后能干净编译时才由调用方写回（与 healUnclosedLessComments 一致的"先验证后写回"策略）。
 */

/**
 * 修复「同行内多个声明被黏连、中间无分号」的漏分号（行级 heal 覆盖不到的情况）。
 * 例：background-size: 100% 100%flex-shrink: 0;  →  background-size: 100% 100%;flex-shrink: 0;
 * 仅当第 2+ 个 `prop:` 前的字符不是合法声明分隔符（空白 / ; { } ( ) / " ' / @ , & > *）时才补 `;`，
 * 以避开 url(data:...) / http:// / content: "a: b" 等合法含冒号的值，避免误伤。
 * 启发式仅"在两个声明之间补 ;"，属恒安全的 CSS 修正。
 */
function fixGluedDeclarationsOnLine(line = '') {
  const trimmed = line.trim()
  if (!/^[\w-][\w-]*\s*:/.test(trimmed)) return line
  const re = /([\w-]+)(\s*):/g
  let out = ''
  let last = 0
  let m
  let count = 0
  const isSep = (ch) =>
    ch === undefined ||
    /\s/.test(ch) ||
    [';', '{', '}', '(', ')', '/', '"', "'", '@', ',', '&', '>', '*'].includes(ch)
  while ((m = re.exec(line))) {
    count++
    if (count >= 2 && !isSep(line[m.index - 1])) {
      out += line.slice(last, m.index) + ';'
      last = m.index
    }
  }
  if (last === 0) return line
  out += line.slice(last)
  return out
}

export function healMissingSemicolons(source = '', { sourceType = 'auto' } = {}) {
  const lines = String(source || '').split('\n')
  let changed = false
  const hasStyleTag = /<style\b/i.test(source)
  const looksLikeVueSfc = /<(?:template|script)\b/i.test(source)
  const isVueSfc = sourceType === 'vue' || (sourceType === 'auto' && looksLikeVueSfc)
  // Vue SFC 只允许修复真实 <style> 块；没有 style 的子组件直接跳过，绝不能把 script 当成 LESS。
  if (isVueSfc && !hasStyleTag) {
    return { source: String(source || ''), changed: false }
  }
  // 仅纯 .less/.css 文件允许把全文视为样式上下文。
  let inStyle = sourceType === 'style' || (!isVueSfc && !hasStyleTag)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const open = /<style\b/.test(raw)
    const close = /<\/style>/.test(raw)
    if (open) inStyle = true
    if (!inStyle) { if (close) inStyle = false; continue }

    // 行内黏连修复：background-size: 100% 100%flex-shrink: 0; → ...;flex-shrink: 0;
    const glued = fixGluedDeclarationsOnLine(raw)
    if (glued !== raw) {
      lines[i] = glued
      changed = true
      if (close) inStyle = false
      continue
    }

    const t = raw.trim()
    // 跳过：空行 / 注释 / 块边界 / 选择器（以 { } & > @ * 开头）/ @规则
    if (
      t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') ||
      t.startsWith('{') || t.startsWith('}') || t.startsWith('&') || t.startsWith('>') || t.startsWith('@')
    ) {
      if (close) inStyle = false
      continue
    }
    // 声明行：prop: value（值非空，允许值内含空格如 background-size: 100% 100%），且不以 ; { } 结尾
    const decl = t.match(/^[\w-][\w-]*\s*:\s*\S.*$/)
    if (decl && !/[,;{}]\s*$/.test(t)) {
      let j = i + 1
      while (j < lines.length) {
        const nt = lines[j].trim()
        if (nt === '' || nt.startsWith('//') || nt.startsWith('/*') || nt.startsWith('*')) { j++; continue }
        break
      }
      const next = j < lines.length ? lines[j].trim() : ''
      const nextIsDecl = /^[\w-][\w-]*\s*:/.test(next) || next.startsWith('}') || next.startsWith('&') || next.startsWith('@')
      if (nextIsDecl) {
        lines[i] = raw.replace(/\s*$/, '') + ';'
        changed = true
      }
    }
    if (close) inStyle = false
  }
  return { source: lines.join('\n'), changed }
}

/**
 * 串联两类自动修复（未闭合块注释 + 漏写分号），供 .vue 与 .less 两条 heal 路径复用。
 * 仅在修复后能干净编译时才由调用方写回磁盘（避免写坏文件）。
 */
export function healLessSource(source = '', options = {}) {
  const sourceType = options.sourceType || 'auto'
  const looksLikeVueSfc = /<(?:template|script)\b/i.test(source)
  if ((sourceType === 'vue' || (sourceType === 'auto' && looksLikeVueSfc)) && !/<style\b/i.test(source)) {
    return { source: String(source || ''), changed: false }
  }
  const a = healUnclosedLessComments(source)
  const b = healMissingSemicolons(a.source, { sourceType })
  const c = healMissingLessBraces(b.source)
  return {
    source: c.source,
    changed: a.changed || b.changed || c.changed,
    addedBraces: c.addedBraces || 0,
  }
}

/**
 * 确定性自愈：微码根容器固定像素宽高 → 100%（占满宿主面板）。
 *
 * 背景：LLM 常把 Figma 设计框尺寸（_figma-size.json 的 absoluteBoundingBox.width/height）
 * 直接写成根容器 `.c-<safeName>-root` 的 width/height 固定像素（如 420px / 186px）。
 * 但微码组件须占满宿主 default-panel 的 .pannel-content（width:100% + flex:1 +
 * height:calc(100% - 38px)），固定像素会让组件在面板内出现留白/滚动条、且面板尺寸一变就错位。
 *
 * 治本（不依赖模型）：写盘/校验自愈把根容器的 width/height 固定长度强制改为 100%，
 * 同时保留 max-width/max-height/min-width/min-height 与 padding/flex/gap 等不变量。
 * 仅匹配微码约定根类 `.c-<name>-root`（含其后可能的组合/后代选择器），且只在该规则块内替换，
 * 不会误伤 max-width/min-height 或嵌套子元素。
 */
const ROOT_FIXED_LEN_RE =
  /(?<![\w-])(width|height)\s*:\s*-?\d+(?:\.\d+)?(?:px|rem|em|vw|vh|vmin|vmax|pt|pc|cm|mm|in|ex|ch|fr)\s*(?:!important)?\s*;/gi

export function healRootFixedSize(source = '', options = {}) {
  const content = String(source || '')
  if (!/\.c-[\w-]+-root\b/.test(content)) return { source: content, changed: false }
  const ruleRe = /\.c-[\w-]+-root\b[^{}]*\{/g
  let result = ''
  let lastIndex = 0
  let changed = false
  let m
  while ((m = ruleRe.exec(content)) !== null) {
    const braceStart = m.index + m[0].length - 1
    // 括号计数定位匹配的 }（根规则通常为扁平声明块，无嵌套选择器块）
    let depth = 0
    let end = -1
    for (let i = braceStart; i < content.length; i++) {
      const ch = content[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end === -1) break // 块未闭合：交给 healMissingLessBraces 处理，此处不动
    const block = content.slice(braceStart + 1, end)
    const fixedBlock = block.replace(
      ROOT_FIXED_LEN_RE,
      (mm, prop) => `${prop}: 100%;`,
    )
    if (fixedBlock !== block) {
      changed = true
      result += content.slice(lastIndex, m.index) + m[0] + fixedBlock + content[end]
    } else {
      result += content.slice(lastIndex, end + 1)
    }
    lastIndex = end + 1
    ruleRe.lastIndex = end + 1
  }
  result += content.slice(lastIndex)
  return { source: result, changed }
}

function safeWriteFile(filePath, content) {
  try {
    const current = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : null
    if (current !== content) {
      writeFileSync(filePath, content, 'utf-8')
    }
  } catch {
    // 写回失败不应阻断校验流程
  }
}

/**
 * 防御性剥除 Markdown 代码围栏（```less / ```css / ```vue 等）。
 * 背景：LLM 生成的 .less / .vue 文件偶尔会在首行带 ````less` 围栏、尾行带 ````，
 * 若写入路径绕过了 _sanitizeFileContent（如 style-refiner 直接落盘、快照回填等），
 * less.render 会把 ````less` 当成非法 token 抛出 "Unrecognised input"，
 * 导致整组件 LESS 编译门禁失败、样式全失。此处在校验编译前统一兜底剥除，
 * 与 microcode-engineer 的去围栏逻辑同源，属恒安全修复。
 */
function stripMarkdownFence(source = '') {
  let s = String(source || '')
  // 去除开头围栏：``` 或 ```less / ```css / ```vue 等（含前导空白与换行）
  s = s.replace(/^\s*```[a-zA-Z]*\s*\n?/m, '')
  // 去除中间孤立围栏行（整行只有 ``` 或 ```lang）
  s = s.replace(/^[ \t]*```[a-zA-Z]*[ \t]*$/gm, '')
  // 去除结尾围栏（单独成行的 ```）
  s = s.replace(/\n?\s*```\s*$/g, '')
  return s
}

function readSnippet(source, line, radius = 2) {
  const lines = String(source || '').split('\n')
  const safeLine = Math.max(1, Number(line) || 1)
  const start = Math.max(1, safeLine - radius)
  const end = Math.min(lines.length, safeLine + radius)
  return lines.slice(start - 1, end).map((code, index) => ({
    line: start + index,
    code,
    current: start + index === safeLine
  }))
}

function extractLessStyles(vueSource = '') {
  const styles = []
  const pattern = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi
  let match
  while ((match = pattern.exec(vueSource)) !== null) {
    const attrs = match[1] || ''
    if (!/\blang\s*=\s*["']less["']/i.test(attrs)) continue
    const content = match[2] || ''
    const contentOffset = match.index + match[0].indexOf(content)
    const startLine = vueSource.slice(0, contentOffset).split('\n').length
    styles.push({ content, startLine, index: styles.length })
  }
  return styles
}

function detectMixinHint(source, error) {
  const line = Number(error?.line) || 1
  const currentLine = String(source || '').split('\n')[line - 1] || ''
  const call = currentLine.match(/^\s*([.#][\w-]+)\s*(\([^;{}]*\))?\s*;?\s*$/)
  if (!call) return null
  return {
    rule: 'LESS-MIXIN-001',
    message: `疑似 Mixin 调用语法或参数不匹配：${currentLine.trim()}`,
    suggestion: '检查 Mixin 定义是否带参数、调用末尾是否有分号，并确认调用名称与定义一致。'
  }
}

/**
 * 「无法加载 LESS 依赖」是 createFileManager 里自定义抛出的错误（{ type: 'File', message, filename }），
 * 不带 line 字段。若不做处理，`Number(error?.line) || 1` 会回退成第 1 行，
 * 映射回 SFC 后落在 `<style>` 标签行而不是真正的 `@import` 行（实测差 1 行：48 vs 49），
 * 用户照着行号找过去看到的是 `<style lang="less" scoped>`，找不到出错的引用。
 * 这里用 message 里的依赖路径在当前编译源里定位真实的 @import 行。
 */
function resolveImportLine(source, message) {
  const spec = String(message || '').match(/无法加载 LESS 依赖：(.+)$/)?.[1]?.trim()
  if (!spec) return null
  const lines = String(source || '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(spec)) return i + 1
  }
  return null
}

function toDiagnostic({ error, file, source, sourceType, styleIndex = null, lineOffset = 0 }) {
  // 仅当 LESS 自身没给出行号时（File 类错误）才用依赖路径反查，避免覆盖真实行号
  const rawLine = Number(error?.line) || resolveImportLine(source, error?.message) || 1
  const line = rawLine + lineOffset
  const column = Math.max(1, Number.isFinite(Number(error?.column)) ? Number(error.column) + 1 : 1)
  const mixinHint = detectMixinHint(source, error)
  return {
    id: 'LESS-COMPILE-001',
    severity: 'BLOCK',
    sourceType,
    file: normalizePath(file),
    line,
    column,
    message: error?.message || 'LESS 编译失败',
    // less 的 error.extract 末尾可能是 null 补位，直接透传会让下游渲染出空行
    extract: Array.isArray(error?.extract)
      ? error.extract.filter((row) => typeof row === 'string')
      : [],
    snippet: readSnippet(source, rawLine),
    styleIndex,
    hint: mixinHint,
    originalError: {
      type: error?.type || 'Parse',
      filename: error?.filename || normalizePath(file)
    }
  }
}

function createFileManager(files, outputPath) {
  const normalizedFiles = new Map(Object.entries(files || {}).map(([key, value]) => [normalizePath(key), String(value)]))
  class GeneratedFileManager extends less.FileManager {
    supports() { return true }
    supportsSync() { return false }
    async loadFile(filename, currentDirectory) {
      const base = normalizePath(currentDirectory || '')
      const requested = normalizePath(normalize(join(base, filename)))
      const relativeToOutput = normalizePath(relative(outputPath || '/', requested))
      const candidates = [requested, relativeToOutput, normalizePath(filename)]
      for (const candidate of candidates) {
        if (normalizedFiles.has(candidate)) {
          // 虚拟文件命中：仍返回绝对磁盘路径作为 filename，
          // 让 LESS 把当前目录定位到 outputPath 下真实的目录层级，
          // 这样被导入文件再 @import 相对路径（如 ./themes/theme-vars.less）时
          // 能基于正确的父目录解析，不会错把 package/ 当成 resources/styles/。
          const absPath = candidate.startsWith('/') ? candidate : normalizePath(join(outputPath, candidate))
          return { contents: normalizedFiles.get(candidate), filename: absPath }
        }
      }
      try {
        // fallback 读磁盘：requested 已经是绝对路径（由 base + filename join 而来），直接用
        return { contents: readFileSync(requested, 'utf-8'), filename: requested }
      } catch {
        throw { type: 'File', message: `无法加载 LESS 依赖：${filename}`, filename: requested }
      }
    }
  }
  return new GeneratedFileManager()
}

// 关键 standalone less 文件（common.less / theme-vars.less）的候选路径。
// 兼容两种产物布局：resources/styles/themes/theme-vars.less 与 resources/styles/theme-vars.less。
function collectCriticalLessFiles(outputPath) {
  const list = ['resources/styles/common.less', 'resources/styles/themes/theme-vars.less']
  if (existsSync(join(outputPath, 'resources/styles/theme-vars.less'))) {
    list.push('resources/styles/theme-vars.less')
  }
  return list
}

/**
 * 在 fileManager 创建之前预自愈 standalone less，避免虚拟文件缓存住修复前的内容。
 * 副作用：修复成功时写回磁盘，并同步更新内存中的 files 映射。
 */
function healCriticalStandaloneLess(files, outputPath, diagnostics = []) {
  for (const lessFile of collectCriticalLessFiles(outputPath)) {
    const fullPath = join(outputPath, lessFile)
    try {
      // 🔒 R1（2026-09-01）：内存 files map 为单一事实源——优先读内存（可能含写盘后
      // 尚未落盘的修复），内存没有才回退磁盘；避免用磁盘旧内容覆盖内存新内容。
      const memContent = files && typeof files === 'object' ? files[lessFile] : null
      let content = stripMarkdownFence(
        typeof memContent === 'string' ? memContent : readFileSync(fullPath, 'utf-8'),
      )
      const healed = healLessSource(content, { sourceType: 'style' })
      if (healed.changed) content = healed.source
      // 🛡️ 根容器固定像素宽高 → 100%（占满面板）；与写盘自愈同源，确保现有磁盘文件在编译前也修正
      const rooted = healRootFixedSize(content, { sourceType: 'style' })
      if (rooted.changed) content = rooted.source
      if (!healed.changed && !rooted.changed) continue
      safeWriteFile(fullPath, content)
      if (files && typeof files === 'object') files[lessFile] = content
      const parts = []
      if (healed.changed) parts.push(`补全 ${healed.addedBraces || 0} 个右大括号/块注释`)
      if (rooted.changed) parts.push('根容器 width/height 固定像素 → 100%')
      diagnostics.push({
        id: 'LESS-AUTOHEAL-001',
        severity: 'INFO',
        sourceType: 'standalone-less',
        file: normalizePath(lessFile),
        line: 1,
        column: 1,
        message: `自动修复 LESS（${parts.join('；')}），已写回磁盘。`,
        healApplied: true
      })
    } catch (err) {
      // 文件不存在（ENOENT）属正常分支，其余异常不阻断门禁流程
      if (err.code !== 'ENOENT') {
        diagnostics.push({
          id: 'LESS-AUTOHEAL-000',
          severity: 'INFO',
          sourceType: 'standalone-less',
          file: normalizePath(lessFile),
          line: 1,
          column: 1,
          message: `预自愈跳过：${err?.message || err}`,
          healApplied: false
        })
      }
    }
  }
}

/**
 * P0-③（2026-09-01）：standalone less 文件 url() 资源引用终验（并入 LessCompileGate 单一收口）。
 *
 * 校验本地资源类 url（含 resources/ 或 images/ 路径、或图片/字体扩展名），
 * 跳过 http(s)/data:/#/var(/gradient/绝对路径；相对路径以 less 文件所在目录为基准解析。
 * 注意不能照搬 validateCssResourceUrls 的「必须含 resources/」过滤——.vue 在 package/ 下
 * 写 url('../resources/images/x.png') 含 resources/，而 common.less 位于 resources/styles/ 内，
 * 写 url('../images/x.png') 不含 resources/（已实锤漏检）。
 * 🔒 R1：优先读内存 files map（单一事实源），内存没有才回退磁盘。
 * 严重度 WARN（不阻断）：文件缺失时生成重试也修不了（无法重新下载），给出明确诊断即可。
 */
function validateStandaloneLessUrls(files, outputPath, diagnostics = []) {
  for (const lessFile of collectCriticalLessFiles(outputPath)) {
    const memContent = files && typeof files === 'object' ? files[lessFile] : null
    let content
    try {
      content =
        typeof memContent === 'string'
          ? memContent
          : readFileSync(join(outputPath, lessFile), 'utf-8')
    } catch {
      continue // 文件不存在属正常分支（如无 common.less）
    }
    if (typeof content !== 'string' || !content.includes('url(')) continue

    const urlPattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g
    let m
    const reported = new Set()
    while ((m = urlPattern.exec(content)) !== null) {
      const rawUrl = m[2].trim()
      if (
        rawUrl.startsWith('http://') || rawUrl.startsWith('https://') ||
        rawUrl.startsWith('data:') || rawUrl.startsWith('#') ||
        rawUrl.startsWith('var(') || rawUrl.startsWith('linear-gradient') ||
        rawUrl.startsWith('radial-gradient') || rawUrl.startsWith('/')
      ) {
        continue
      }
      // 本地资源判定：resources/ 或 images/ 路径、或图片/字体扩展名
      const looksLikeAsset =
        rawUrl.includes('resources/') ||
        rawUrl.includes('images/') ||
        /\.(png|jpe?g|gif|svg|webp|bmp|ico|woff2?|ttf|eot|otf)(\?.*)?$/i.test(rawUrl)
      if (!looksLikeAsset) continue
      if (reported.has(rawUrl)) continue
      reported.add(rawUrl)

      const resolvedPath = normalizePath(join(outputPath, dirname(lessFile), rawUrl))
      if (!existsSync(resolvedPath)) {
        const line = content.slice(0, m.index).split('\n').length
        diagnostics.push({
          id: 'LESS-URL-001',
          severity: 'WARN',
          sourceType: 'standalone-less',
          file: normalizePath(lessFile),
          line,
          column: 1,
          message: `url() 引用的资源文件不存在: ${rawUrl}（解析为 ${resolvedPath}），预览将 404 静默丢图`,
          snippet: readSnippet(content, line),
          healApplied: false,
        })
      }
    }
  }
}

export class LessCompileGate {
  static async validateDirectory(outputPath) {
    return this.validate(collectLessCompileFiles(outputPath), { outputPath })
  }

  static async validate(files = {}, options = {}) {
    const diagnostics = []
    // 🛡️ R0-8（2026-09-01）：outputPath 改回**必填**入参，删掉 `|| workspaceRoot` 死兜底。
    // 原兜底两宗罪：
    //   ① 语义错误——workspaceRoot 指向全局 /mvgo/workspace，从来不是任何组件的产物目录；
    //      真被触发时，下面两个磁盘检查会对着错误根目录判定，刷出一堆假 WARN（资源不存在）。
    //   ② 依赖错误——为拿这个默认值，本文件在模块作用域静态 import config/backend-root.js
    //      （import.meta），把整条依赖链拖进 jest 无法加载的死路（见文件头注释）。
    // 全部 4 处生产调用点均显式传入 outputPath，确认该兜底从未被触发：
    //   - mc-component-graph-phase2.js:3425  validate(files, { outputPath: state.outputPath })
    //   - mc-component-graph-phase2.js:2497  validateDirectory(...)  → 内部包装为 { outputPath }
    //   - mc-component-graph-vue3.js:2426    validate(files, { outputPath: state.outputPath })
    //   - mc-component-graph-vue3.js:1592    validateDirectory(state.outputPath)
    //   - snapshot-quality.service.ts:201    validateDirectory(workDir)
    // 缺失时不静默猜一个根路径，而是显式告警并跳过磁盘依赖型检查（诚实降级，不制造假结论）。
    const outputPath = options.outputPath || ''
    if (!outputPath) {
      diagnostics.push({
        id: 'LESS-GATE-001',
        severity: 'WARN',
        sourceType: 'gate',
        file: '(全部)',
        line: 1,
        column: 1,
        message:
          'LessCompileGate.validate 未收到 outputPath（必填）：磁盘依赖型检查（LESS 预自愈写回 / 资源 url() 存在性）已跳过，仅执行内存编译校验。调用方必须显式传入组件产物根目录',
        snippet: '',
        healApplied: false,
      })
    } else {
      // 预愈合必须在 createFileManager 之前：fileManager 会把 files 复制进内部 Map 缓存，
      // 若自愈在其之后执行，wrapper 的 @import 会命中缓存里的旧内容（磁盘已修复但门禁仍 BLOCK）。
      healCriticalStandaloneLess(files, outputPath, diagnostics)

      // P0-③（2026-09-01）：standalone less 的 url() 资源终验并入本门禁（单一收口，WARN 不阻断）。
      // 背景：模型在 common.less 写 url('../images/xxx.png') 完全靠 prompt 自觉，文件名写错 → 预览 404
      // 且 LESS 编译能通过（url() 不参与语法校验）→ 静默丢图。此处对照磁盘真实文件给出明确诊断。
      // .vue <style> 内的 url() 已由 resource-import-guard.validateCssResourceUrls 覆盖，此处只查独立 less。
      validateStandaloneLessUrls(files, outputPath, diagnostics)
    }

    const fileManager = createFileManager(files, outputPath)
    const entries = Object.entries(files || {})

    const renderSource = async (source, absFile) => {
      try {
        await less.render(source, {
          filename: absFile,
          paths: [dirname(absFile), outputPath],
          plugins: [{ install(_, pluginManager) { pluginManager.addFileManager(fileManager) } }],
          javascriptEnabled: false
        })
        return null
      } catch (error) {
        return error
      }
    }

    const compile = async ({ file, source, sourceType, styleIndex = null, lineOffset = 0 }) => {
      const absoluteFilename = join(outputPath, file)
      const cleaned = stripMarkdownFence(source)
      const error = await renderSource(cleaned, absoluteFilename)
      if (error) {
        diagnostics.push(toDiagnostic({ error, file, source: cleaned, sourceType, styleIndex, lineOffset }))
      }
    }

    // 对单个 .vue 的 style 内容做「未闭合块注释」自动修复，并仅在修复后能干净编译时才写回磁盘。
    // 返回最终用于校验的 SFC 源码（已修复或原样）。
    const healAndMaybeWriteVue = async (file, originalSource) => {
      const healed = healLessSource(originalSource, { sourceType: 'vue' })
      if (!healed.changed) return originalSource
      const healedStyles = extractLessStyles(healed.source)
      let healedOk = healedStyles.length > 0
      for (const s of healedStyles) {
        if (await renderSource(s.content, join(outputPath, file))) {
          healedOk = false
          break
        }
      }
      if (healedOk) {
        safeWriteFile(join(outputPath, file), healed.source)
        // 🔒 R1（2026-09-01）：自愈结果同步回写内存 files map（单一事实源），
        // 避免「磁盘已修但候选快照/下游校验仍读旧内容」的分叉。
        if (files && typeof files === 'object') files[file] = healed.source
        diagnostics.push({
          id: 'LESS-AUTOHEAL-001',
          severity: 'INFO',
          sourceType: 'sfc-style',
          file: normalizePath(file),
          line: 1,
          column: 1,
          message: '自动补全未闭合块注释（如 `/* ===` 横幅注释漏写 `*/`），已修复并写回文件。建议生成阶段显式闭合块注释。',
          healApplied: true
        })
        return healed.source
      }
      return originalSource
    }

    for (const [rawPath, content] of entries) {
      const file = normalizePath(rawPath)
      if (file.endsWith('.vue')) {
        const sourceToUse = await healAndMaybeWriteVue(file, String(content))
        const styles = extractLessStyles(sourceToUse)
        for (const style of styles) {
          await compile({
            file,
            source: style.content,
            sourceType: 'sfc-style',
            styleIndex: style.index,
            lineOffset: style.startLine - 1
          })
        }
      } else if (file === SHARED_LESS || file.endsWith('/resources/styles/index.less')) {
        await compile({ file, source: String(content), sourceType: 'shared-less' })
      }
    }

    // L1 增强：对关键 LESS 文件单独编译校验（捕获 common.less 等独立文件的语法错误）
    // 注意：dark.less / light.less 含 `&.dark` / `&.light` 嵌套选择器，且依赖 theme-vars.less 定义的
    // `.theme-dark()` / `.theme-light()` mixin，本就不能脱离 index.less 的 @import 链被孤立编译
    // （孤立编译必报 ".theme-dark is undefined" / "& 无父选择器" 的误报）。它们已由上方 SFC 的
    // `index.less` 链路覆盖校验，故此处仅保留自洽可独立编译的 common.less 与 theme-vars.less。
    // 自愈已由 healCriticalStandaloneLess 在 fileManager 创建前完成，此处直接读取修复后的磁盘内容。
    const criticalLessFiles = collectCriticalLessFiles(outputPath)

    // 主题变量文件正则：theme-vars.less / dark.less / light.less 自身不参与 prepend（避免自我 import 循环）
    const THEME_FILE_RE = /(^|\/)(theme-vars|dark|light)\.less$/

    for (const lessFile of criticalLessFiles) {
      const fullPath = join(outputPath, lessFile)
      try {
        // 防御性剥除 Markdown 围栏（LLM 偶尔在 .less 首行带 ```less）
        let content = stripMarkdownFence(readFileSync(fullPath, 'utf-8'))
        // 兼容：standalone 编译不经过 index.less 的 import 链，若文件引用主题变量却未自行 @import，
        // 会自动 prepend 同目录（或 themes/ 子目录）的 theme-vars.less，消除 "variable @x is undefined" 误报
        const hasOwnThemeImport = /@import\s+['"][^'"]*theme-vars\.less['"]/.test(content)
        let selectedThemePath = null
        if (!THEME_FILE_RE.test(lessFile)) {
          const themeCandidates = [
            join(dirname(fullPath), 'theme-vars.less'),
            join(dirname(fullPath), 'themes', 'theme-vars.less')
          ]
          selectedThemePath = themeCandidates.find(candidate => existsSync(candidate)) || null
          if (!hasOwnThemeImport && selectedThemePath) {
            const relImport = './' + normalizePath(relative(dirname(fullPath), selectedThemePath))
            content = `@import '${relImport}';\n${content}`
          }
        }

        // common.less 不能脱离主题作用域孤立编译。分别模拟 dark.less/light.less 的真实调用顺序：
        // .common() + 对应主题 mixin 生效后再导入 common.less，既能捕获变量断链，也不会产生假失败。
        if (lessFile.endsWith('resources/styles/common.less') && selectedThemePath) {
          const themeSource = readFileSync(selectedThemePath, 'utf-8')
          const relTheme = './' + normalizePath(relative(dirname(fullPath), selectedThemePath))
          const commonCall = /\.common\s*\(/.test(themeSource) ? '.common();\n' : ''
          const wrappers = []
          if (/\.theme-dark\s*\(/.test(themeSource)) {
            wrappers.push(`.__less_gate_dark__ {\n${commonCall}.theme-dark();\n@import (multiple) './common.less';\n}`)
          }
          if (/\.theme-light\s*\(/.test(themeSource)) {
            wrappers.push(`.__less_gate_light__ {\n${commonCall}.theme-light();\n@import (multiple) './common.less';\n}`)
          }
          if (wrappers.length === 0 && commonCall) {
            wrappers.push(`.__less_gate_common__ {\n${commonCall}@import (multiple) './common.less';\n}`)
          }
          if (wrappers.length > 0) {
            content = `@import '${relTheme}';\n${wrappers.join('\n')}`
          }
        }
        await compile({
          file: lessFile,
          source: content,
          sourceType: 'standalone-less'
        })
      } catch (err) {
        // 文件不存在时忽略，存在但编译失败时记录错误
        if (err.code !== 'ENOENT') {
          // 编译错误已在 compile 函数中记录到 diagnostics
        }
      }
    }

    // 仅 BLOCK 严重度计入通过/阻断判定；INFO（如自动补全未闭合注释）只作可见性记录，不阻断发布
    const blockDiagnostics = diagnostics.filter(d => d.severity === 'BLOCK')
    return {
      pass: blockDiagnostics.length === 0,
      blockCount: blockDiagnostics.length,
      diagnostics,
      checkedFiles: entries.map(([file]) => normalizePath(file)).filter(file => file.endsWith('.vue') || file.endsWith('.less'))
    }
  }

  static buildFixGuidance(result) {
    const diagnostics = result?.diagnostics || []
    if (!diagnostics.length) return ''
    const lines = ['\n\n🔴 上次产物未通过 LESS 真实编译门禁。只修改下列文件并修复语法，不要改动布局与业务逻辑：']
    diagnostics.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.file}:${item.line}:${item.column} ${item.message}`)
      const current = item.snippet?.find(row => row.current)
      if (current) lines.push(`   错误代码：${current.code.trim()}`)
      if (item.hint?.suggestion) lines.push(`   诊断建议：${item.hint.suggestion}`)
      // 变量未定义：不是语法错误，自动修复需明确给出补 import 的指引
      const varMatch = String(item.message || '').match(/variable @([\w-]+) is undefined/)
      if (varMatch) {
        lines.push(`   诊断建议：变量 @${varMatch[1]} 未定义。该变量若来自主题变量文件（theme-vars.less），请在文件顶部添加 @import './theme-vars.less';（或实际相对路径的主题变量定义文件）后重试，不要删除变量引用。`)
      }
    })
    lines.push('修复后必须保证所有 <style lang="less"> 与 resources/styles/index.less 均可被 less.render 成功编译。')
    return lines.join('\n')
  }
}

export default LessCompileGate
