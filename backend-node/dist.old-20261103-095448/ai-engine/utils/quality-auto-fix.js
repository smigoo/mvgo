/**
 * 质量评分自动修复模块（2026-09-17）
 *
 * 针对质量评分中可自动修复的扣分项提供修复函数：
 * - CODE-008：剥离 LLM 手写的资源 import（应由 injectResourceImports 后处理注入）
 * - THEME-VAR-NAME-MISMATCH：业务样式 var() 直引转 Less 槽位引用
 * - CODE-025-WARN：剥离孤儿资源 import（import 了 mapping 未登记的变量）
 *
 * 设计原则：
 * - 幂等：多次执行结果一致
 * - 安全：只修确定的问题，不确定的保留
 * - 可追溯：返回修复清单（哪些文件、修了什么）
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { healBusinessStyleVarRefs } from './theme-color-guard.js'
import { collectGeneratedFilesFromDir, findResourceDomMapping } from './quality-score-v1.js'
import { buildResourceFacts } from './resource-facts.js'

/**
 * 剥离 LLM 手写的资源 import（CODE-008）
 *
 * 背景：资源 import 应由 injectResourceImports 后处理自动注入，禁止 LLM 手写。
 * 但 LLM 有时会自行 import 本地图片资源，导致 CODE-008 WARN。
 *
 * 修复策略：
 * - 扫描 .vue 文件的 <script> 部分
 * - 匹配 `import xxx from '...resources/images/...'` 模式
 * - 删除这些 import 行（让后续的 injectResourceImports 重新注入正确的）
 *
 * @param {string} componentDir 组件目录
 * @param {Array} files 文件列表（{ path, content }）
 * @returns {{ fixed: Array<{file:string, removed:number}>, files: Array }} 修复清单 + 更新后的文件列表
 */
export function stripLlmResourceImports(componentDir, files) {
  const fixed = []
  const importRegex = /import\s+\w+\s+from\s+['"][^'"]*resources\/images\/[^'"]+['"];?\s*\n?/g

  const updatedFiles = files.map((file) => {
    if (!file.path?.endsWith('.vue') || typeof file.content !== 'string') {
      return file
    }

    // 只处理 <script> 部分
    const scriptMatch = file.content.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
    if (!scriptMatch) return file

    const scriptContent = scriptMatch[1]
    const before = scriptContent

    // 剥离资源 import
    const after = scriptContent.replace(importRegex, '')

    if (before !== after) {
      const removedCount = (before.match(importRegex) || []).length
      const newContent = file.content.replace(scriptMatch[0], (m) => {
        return m.replace(scriptContent, after)
      })
      fixed.push({ file: file.path, removed: removedCount })
      return { ...file, content: newContent }
    }

    return file
  })

  return { fixed, files: updatedFiles }
}

/**
 * 修复 THEME-VAR-NAME-MISMATCH（业务样式 var() 直引转 Less 槽位）
 *
 * 背景：业务样式写了 `var(--colorTextBase, rgba(...))`，平台不注入 `--colorTextBase`
 * → 浅色 fallback 恒生效 → 主题静默失效。应改为 Less 槽位引用 `@color-text-base`。
 *
 * 修复策略：
 * - 调用 healBusinessStyleVarRefs（已在 theme-color-guard.js 实现）
 * - 该函数会把 var(--xxx, fallback) 转成 @xxx（如果 theme-vars.less 有定义）
 * - 或者回退到 fallback 字面量（如果槽位不存在）
 *
 * @param {string} componentDir 组件目录
 * @param {Array} files 文件列表（{ path, content }）
 * @returns {{ fixed: Array<{file:string}>, files: Array }} 修复清单 + 更新后的文件列表
 */
export function healThemeVarNameMismatch(componentDir, files) {
  // 把 files 数组转成 healBusinessStyleVarRefs 期望的 Record<string, string> 格式
  const filesMap = {}
  for (const file of files) {
    if (file.path && typeof file.content === 'string') {
      filesMap[file.path] = file.content
    }
  }

  // 调用已有的自愈函数
  const fixedList = healBusinessStyleVarRefs(filesMap, { logger: { warn() {} } })

  // 把修复后的内容转回 files 数组格式
  const updatedFiles = files.map((file) => {
    if (file.path && filesMap[file.path] !== file.content) {
      return { ...file, content: filesMap[file.path] }
    }
    return file
  })

  return { fixed: fixedList, files: updatedFiles }
}

/**
 * 修复 CODE-025-WARN（剥离孤儿资源 import）
 *
 * 背景：LLM 有时 import 了资源变量名，但该变量不在 resource-dom-mapping 中登记
 * → R3 orphan import（可能命名漂移或臆造变量名）。
 *
 * 修复策略：
 * - 加载 resource-dom-mapping.json 构建事实源
 * - 对每个 .vue 文件扫描 <script> 中的资源 import
 * - 删除不在 mapping 事实源中的 import 行（孤儿 import）
 *
 * 注意：此函数只处理 R3（orphan import），不处理 R1/R2（引用未 import / 幽灵引用）。
 * R1/R2 属于 BLOCK 级别，需要 AI 介入修复，不在本规则范围内。
 *
 * @param {string} componentDir 组件目录
 * @param {Array} files 文件列表（{ path, content }）
 * @returns {{ fixed: Array<{file:string, removed:number}>, files: Array }} 修复清单 + 更新后的文件列表
 */
export function stripOrphanResourceImports(componentDir, files) {
  const fixed = []

  // 加载 resource-dom-mapping 构建事实源
  const mapping = findResourceDomMapping(componentDir)
  if (!mapping || !Array.isArray(mapping) || mapping.length === 0) {
    return { fixed, files }
  }

  const fileMap = {}
  for (const f of files) {
    if (f.path && typeof f.content === 'string') {
      fileMap[f.path] = f.content
    }
  }

  const facts = buildResourceFacts({ mapping, files: fileMap })
  // facts.orphanImports: [{ path, varName }] — import 了但不在 mapping 中的变量
  if (!facts.orphanImports || facts.orphanImports.length === 0) {
    return { fixed, files }
  }

  // 按文件分组
  const orphanByFile = {}
  for (const o of facts.orphanImports) {
    if (!orphanByFile[o.path]) orphanByFile[o.path] = new Set()
    orphanByFile[o.path].add(o.varName)
  }

  // 资源 import 正则（与 resource-facts.js 保持一致）
  const importRe = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"][^'"]*(?:images|assets)[^'"]*['"];?\s*\n?/g

  const updatedFiles = files.map((file) => {
    if (!file.path?.endsWith('.vue') || typeof file.content !== 'string') return file

    const orphans = orphanByFile[file.path]
    if (!orphans || orphans.size === 0) return file

    const scriptMatch = file.content.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
    if (!scriptMatch) return file

    const scriptContent = scriptMatch[1]
    let removedCount = 0

    const after = scriptContent.replace(importRe, (fullMatch, varName) => {
      if (orphans.has(varName)) {
        removedCount++
        return '' // 删除孤儿 import 行
      }
      return fullMatch
    })

    if (removedCount > 0) {
      const newContent = file.content.replace(scriptMatch[0], (m) => {
        return m.replace(scriptContent, after)
      })
      fixed.push({ file: file.path, removed: removedCount })
      return { ...file, content: newContent }
    }

    return file
  })

  return { fixed, files: updatedFiles }
}

/**
 * 执行所有可用的自动修复
 *
 * @param {string} componentDir 组件目录
 * @param {Array} issues 质量评分中的 issues 列表
 * @returns {{ fixed: Array, files: Array, summary: object }} 修复清单 + 更新后的文件列表 + 摘要
 */
export function runAutoFix(componentDir, issues) {
  // 读取组件目录下的所有文件
  const rawFiles = collectGeneratedFilesFromDir(componentDir)

  // 转成 { path, content } 格式
  let files = rawFiles.map((f) => ({
    path: f.path,
    content: f.content,
  }))

  const allFixed = []
  const summary = {
    code008: 0,
    themeVarMismatch: 0,
    code025Warn: 0,
  }

  // 统计需要修复的问题类型
  const issueTypes = new Set(issues.map((i) => i.id))

  // 1. CODE-008 修复
  if (issueTypes.has('CODE-008')) {
    const result = stripLlmResourceImports(componentDir, files)
    files = result.files
    allFixed.push(...result.fixed.map((f) => ({ ...f, rule: 'CODE-008' })))
    summary.code008 = result.fixed.length
  }

  // 2. THEME-VAR-NAME-MISMATCH 修复
  if (issueTypes.has('THEME-VAR-NAME-MISMATCH')) {
    const result = healThemeVarNameMismatch(componentDir, files)
    files = result.files
    allFixed.push(...result.fixed.map((f) => ({ ...f, rule: 'THEME-VAR-NAME-MISMATCH' })))
    summary.themeVarMismatch = result.fixed.length
  }

  // 3. CODE-025-WARN 修复（2026-09-22 新增）
  if (issueTypes.has('CODE-025-WARN')) {
    const result = stripOrphanResourceImports(componentDir, files)
    files = result.files
    allFixed.push(...result.fixed.map((f) => ({ ...f, rule: 'CODE-025-WARN' })))
    summary.code025Warn = result.fixed.length
  }

  return { fixed: allFixed, files, summary }
}

/**
 * 把修复后的文件写回磁盘
 *
 * @param {string} componentDir 组件目录
 * @param {Array} files 修复后的文件列表（{ path, content }）
 * @returns {{ written: number }} 写入文件数
 */
export function writeFixedFiles(componentDir, files) {
  let written = 0
  for (const file of files) {
    if (file.path && typeof file.content === 'string') {
      const fullPath = join(componentDir, file.path)
      try {
        writeFileSync(fullPath, file.content, 'utf8')
        written++
      } catch (err) {
        console.error(`[quality-auto-fix] 写入失败: ${fullPath}`, err.message)
      }
    }
  }
  return { written }
}
