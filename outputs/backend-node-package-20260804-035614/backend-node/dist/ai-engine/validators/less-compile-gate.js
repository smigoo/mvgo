import less from 'less'
import { readFileSync } from 'fs'
import { dirname, join, normalize, relative } from 'path'

const SHARED_LESS = 'resources/styles/index.less'

function normalizePath(filePath = '') {
  return String(filePath).replaceAll('\\', '/')
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

function toDiagnostic({ error, file, source, sourceType, styleIndex = null, lineOffset = 0 }) {
  const rawLine = Number(error?.line) || 1
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
    extract: error?.extract || [],
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
          return { contents: normalizedFiles.get(candidate), filename: candidate }
        }
      }
      try {
        return { contents: readFileSync(requested, 'utf-8'), filename: requested }
      } catch {
        throw { type: 'File', message: `无法加载 LESS 依赖：${filename}`, filename: requested }
      }
    }
  }
  return new GeneratedFileManager()
}

export class LessCompileGate {
  static async validate(files = {}, options = {}) {
    const diagnostics = []
    const outputPath = options.outputPath || process.cwd()
    const fileManager = createFileManager(files, outputPath)
    const entries = Object.entries(files || {})

    const compile = async ({ file, source, sourceType, styleIndex = null, lineOffset = 0 }) => {
      const absoluteFilename = join(outputPath, file)
      try {
        await less.render(source, {
          filename: absoluteFilename,
          paths: [dirname(absoluteFilename), outputPath],
          plugins: [{ install(_, pluginManager) { pluginManager.addFileManager(fileManager) } }],
          javascriptEnabled: false
        })
      } catch (error) {
        diagnostics.push(toDiagnostic({ error, file, source, sourceType, styleIndex, lineOffset }))
      }
    }

    for (const [rawPath, content] of entries) {
      const file = normalizePath(rawPath)
      if (file.endsWith('.vue')) {
        const styles = extractLessStyles(String(content))
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
    const criticalLessFiles = [
      'resources/styles/common.less',
      'resources/styles/themes/theme-vars.less',
      'resources/styles/themes/dark.less',
      'resources/styles/themes/light.less'
    ]
    
    for (const lessFile of criticalLessFiles) {
      const fullPath = join(outputPath, lessFile)
      try {
        const content = readFileSync(fullPath, 'utf-8')
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

    return {
      pass: diagnostics.length === 0,
      blockCount: diagnostics.length,
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
    })
    lines.push('修复后必须保证所有 <style lang="less"> 与 resources/styles/index.less 均可被 less.render 成功编译。')
    return lines.join('\n')
  }
}

export default LessCompileGate
