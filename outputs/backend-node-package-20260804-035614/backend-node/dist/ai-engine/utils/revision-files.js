import { readFileSync } from 'fs'
import path from 'path'

/**
 * Read generated file paths into the content map used by revision checks.
 * Missing files are ignored because generatedFiles can include optional outputs.
 */
export function readRevisionSnapshot(filePaths, outputPath) {
  const snapshot = {}
  if (!Array.isArray(filePaths) || !outputPath) return snapshot

  for (const filePath of filePaths) {
    if (typeof filePath !== 'string' || !filePath) continue
    try {
      snapshot[filePath] = readFileSync(path.join(outputPath, filePath), 'utf-8')
    } catch {
      // Optional or removed files are represented by their absence.
    }
  }

  return snapshot
}

/** Compare two { relativePath: content } snapshots using full relative paths. */
export function computeChangedFilePaths(currentFiles = {}, previousFiles = {}) {
  const current = currentFiles && !Array.isArray(currentFiles) ? currentFiles : {}
  const previous = previousFiles && !Array.isArray(previousFiles) ? previousFiles : {}
  const allFilePaths = new Set([...Object.keys(current), ...Object.keys(previous)])
  const changedFilePaths = new Set()

  for (const filePath of allFilePaths) {
    if (current[filePath] !== previous[filePath]) {
      changedFilePaths.add(filePath)
    }
  }

  const unchangedCount = allFilePaths.size - changedFilePaths.size
  if (unchangedCount < 0) {
    throw new Error('Revision file statistics are inconsistent')
  }

  return {
    changedFilePaths,
    totalCount: allFilePaths.size,
    unchangedCount,
  }
}

/**
 * 从对抗检查结果的 critiques / issueCategories 推断“需要修订的目标文件/类”集合。
 *
 * 用于“按问题类别只修目标文件”：
 * - 修订路由（microcode-engineer）：只让 LLM 重新生成被 critique 实际引用的文件，其余从磁盘保留。
 * - 精修轮（refiner）：只让 refiner 修改 critique 指定的 .less/.vue 文件与具体 CSS 类，避免整文件重写回归。
 *
 * @param {Object} checkResult - adversarial-checker 输出（含 critiques / issueCategories）
 * @param {string[]} generatedFiles - 当前生成文件相对路径数组
 * @param {Object} [opts]
 * @param {string} [opts.mainComponentFile='package/index.vue'] - 无法映射路径时的回退主文件
 * @returns {{ targetFiles: Set<string>, targetClassNames: string[], hasTargets: boolean }}
 *   - targetFiles: 目标文件相对路径集合（空表示应全量重做）
 *   - targetClassNames: 从 critique.location 解析出的具体 CSS 类/ID 名（无点号前缀，如 'panel-title'）
 *   - hasTargets: targetFiles 是否非空
 */
export function resolveTargetFiles(checkResult, generatedFiles = [], opts = {}) {
  const genSet = new Set(Array.isArray(generatedFiles) ? generatedFiles : [])
  const targetSet = new Set()
  const classNames = new Set()
  const critiques = (checkResult && Array.isArray(checkResult.critiques)) ? checkResult.critiques : []

  // 形如 'package/index.vue:45' / 'resources/styles/common.less:.panel-title'
  const normalizeFile = (loc) => {
    if (!loc) return null
    const pathPart = String(loc).split(':')[0].trim()
    if (!pathPart) return null
    if (genSet.has(pathPart)) return pathPart
    const base = pathPart.split('/').pop()
    for (const g of genSet) {
      if (g.split('/').pop() === base) return g
    }
    return null
  }

  // 从 location 的 “路径:选择器” 后缀里抽取 CSS 类/ID 名（.panel-title / #legend → panel-title / legend）
  const extractSelectors = (loc) => {
    if (!loc) return
    const rest = String(loc).split(':').slice(1).join(':')
    const matches = rest.match(/[.#]([A-Za-z_][\w-]*)/g) || []
    for (const tok of matches) classNames.add(tok.replace(/^[.#]/, ''))
  }

  for (const c of critiques) {
    const matched = normalizeFile(c.location)
    if (matched) targetSet.add(matched)
    extractSelectors(c.location)
  }

  // 类别兜底：当 critique.location 为空/无法映射到生成文件时，按类别推断主文件
  if (targetSet.size === 0 && critiques.length > 0) {
    const categories = (checkResult && checkResult.issueCategories) || {}
    const hasStylistic = (categories.stylistic?.length || 0) > 0
    const hasLayout = (categories.layout?.length || 0) > 0
    // 🆕 #5: 精修轮需要的是样式文件；布局/样式问题都把 .less/.css/.vue 纳入目标，
    // 让 refiner 仅在此范围内局部修改，而非全量重写所有文件。
    if (hasStylistic || hasLayout) {
      for (const f of genSet) {
        if (f.endsWith('.less') || f.endsWith('.css') || f.endsWith('.vue')) targetSet.add(f)
      }
    }
    const main = opts.mainComponentFile && genSet.has(opts.mainComponentFile)
      ? opts.mainComponentFile
      : [...genSet].find((f) => f.endsWith('.vue')) || null
    const mainCandidates = [main, ...[...genSet].filter((f) => f.endsWith('.vue'))]
    for (const m of mainCandidates) {
      if (m) targetSet.add(m)
    }
  }

  return {
    targetFiles: targetSet,
    targetClassNames: [...classNames],
    hasTargets: targetSet.size > 0
  }
}
