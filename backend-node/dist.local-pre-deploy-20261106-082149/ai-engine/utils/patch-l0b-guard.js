/**
 * ① PATCH 后 L0-B 自检 + 回退守卫
 *
 * 防止 layout/style refiner 的 PATCH 模式写回后引入新的 L0-B BLOCK
 * （失败任务 mc-max-1786794846931-4a790317 的 BLOCK 4→11 根因）。
 *
 * 用法：
 *   const snap = prePatchSnapshot(componentFiles, outputPath)   // PATCH 前
 *   const result = await applyPatchesToWorkspace(...)            // 应用 PATCH
 *   const guard = verifyPatchAndRollback(componentFiles, outputPath, snap)  // PATCH 后
 *   if (guard.rolledBack) return null  // 回退到完整文件模式
 */

import { CodeStructureValidator } from '../validators/code-structure-validator.js'
import { readFileSync, writeFileSync } from 'fs'
import { join, relative, isAbsolute } from 'path'
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'patch-l0b-guard' })

function readVueFilesForL0b(componentFiles, outputPath) {
  const generatedFiles = []
  for (const abs of componentFiles) {
    if (!abs || !abs.endsWith('.vue')) continue
    const rel = isAbsolute(abs) ? relative(outputPath, abs) : abs
    try {
      generatedFiles.push({ path: rel, content: readFileSync(abs, 'utf-8') })
    } catch { /* 文件可能不存在 */ }
  }
  return generatedFiles
}

function validateBlocks(componentFiles, outputPath) {
  const generatedFiles = readVueFilesForL0b(componentFiles, outputPath)
  if (generatedFiles.length === 0) return new Set()
  const result = CodeStructureValidator.validate(generatedFiles, '', {})
  return new Set((result.issues || []).filter(i => i.severity === 'BLOCK').map(i => i.file))
}

/**
 * PATCH 前快照：备份所有 .vue 文件内容 + 拿 preBlockSet
 * @param {string[]} componentFiles - 绝对路径数组
 * @param {string} outputPath - 组件根目录
 * @returns {{ preBlockSet: Set<string>, backups: Record<string, string> }}
 */
export function prePatchSnapshot(componentFiles, outputPath) {
  const backups = {}
  const generatedFiles = []
  for (const abs of componentFiles) {
    if (!abs || !abs.endsWith('.vue')) continue
    const rel = isAbsolute(abs) ? relative(outputPath, abs) : abs
    try {
      const content = readFileSync(abs, 'utf-8')
      backups[rel] = content
      generatedFiles.push({ path: rel, content })
    } catch { /* 文件可能不存在 */ }
  }
  let preBlockSet = new Set()
  if (generatedFiles.length > 0) {
    const result = CodeStructureValidator.validate(generatedFiles, '', {})
    preBlockSet = new Set((result.issues || []).filter(i => i.severity === 'BLOCK').map(i => i.file))
  }
  return { preBlockSet, backups }
}

/**
 * PATCH 后自检：跑 L0-B，对比改前改后 BLOCK 集合，新增 BLOCK 就回退备份
 * @returns {{ rolledBack: boolean, newBlocks: string[] }}
 */
export function verifyPatchAndRollback(componentFiles, outputPath, snapshot) {
  const { preBlockSet, backups } = snapshot
  const postBlockSet = validateBlocks(componentFiles, outputPath)
  const newBlocks = [...postBlockSet].filter(f => !preBlockSet.has(f))
  if (newBlocks.length === 0) {
    return { rolledBack: false, newBlocks: [] }
  }
  // BLOCK 增加 → 回退备份
  for (const [rel, content] of Object.entries(backups)) {
    try {
      writeFileSync(join(outputPath, rel), content, 'utf-8')
    } catch (e) {
      logger.warn(`回退文件失败: ${rel}`, { error: e.message })
    }
  }
  logger.warn(
    `⚠️ ① PATCH 后 L0-B 自检：新增 ${newBlocks.length} 个 BLOCK（改前 ${preBlockSet.size} → 改后 ${postBlockSet.size}），已回退 PATCH`,
    { newBlocks, preBlocks: [...preBlockSet], postBlocks: [...postBlockSet] }
  )
  return { rolledBack: true, newBlocks }
}
