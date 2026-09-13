/**
 * Playground Agent 工具集
 * 用于读取、修改、分析组件代码
 *
 * v2.0 改造：
 *   - 路径解析从单路径 MC_COMPONENTS_ROOT → resolveComponentDir 4路径自动扫描
 *   - 新增 listComponentFiles 工具（列出组件目录下所有文件）
 *   - writeComponentFile 写入前自动调用 takeModificationSnapshot（版本控制）
 */

import fs from 'fs'
import path from 'path'
import componentResolver from '../utils/component-resolver.js'
import snapshotManager from './snapshot-manager.js'
import { createLogger } from '../logger/index.js'
import { validateVueSfc } from '../utils/sfc-syntax-validation.js'
import { buildComponentId, semanticTokenFrom, sanitizeComponentId } from '../utils/component-naming.js'

const { resolveComponentDirStrict, resolveWritableComponentDirs, isEncodedComponentName } =
  componentResolver
const { takeModificationSnapshot } = snapshotManager

const logger = createLogger('playground-tools')

const SKIP_DIRS = new Set(['.snapshots', '.backups', 'node_modules', '.git'])

/**
 * 🛡️ S3 写盘防腐（2026-09-10）
 *
 * 背景：AI 修复 / Playground 修改曾把 declare.json 的 componentId 写成任务号
 * （mc-lite-1789035969084-c298235f），即「规范化被反向覆盖」，且全程无告警 ——
 * 直接导致 workspace 目录名、规范 ID、下载文件名一起退化成任务号。
 *
 * 处理：写入 declare.json 前解析内容，若 componentId 命中编码型（任务号）形态，
 * 就地重建为 `c-<语义段>-<尾 8hex>` 并打 WARN。语义段优先复用原 id，其次从
 * componentName 的中文/英文名派生，最后兜底 'component'。
 *
 * 为什么不抛错：现存存量有 138 条已被污染（4a），若 fail-closed 抛错会让这些组件的
 * AI 修复全线失败 —— 目标是「不再持久化坏值」，而非「拒绝服务」。返回的仍是可写内容。
 */
export function normalizeDeclareComponentId(raw, fallbackComponentId, filePath) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(`拒绝写入无法解析的 declare.json（${filePath}）: ${e.message}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`拒绝写入结构非法的 declare.json（${filePath}）：顶层应为对象`)
  }

  const current = typeof parsed.componentId === 'string' ? parsed.componentId.trim() : ''
  if (!current || !isEncodedComponentName(current)) return raw // 已是规范名 → 原样写

  const seg = semanticTokenFrom({
    displayName: parsed.componentName || parsed.name || parsed.displayName || '',
    zhName: parsed.componentName || parsed.name || '',
    fallbackToken: String(fallbackComponentId || '').replace(/^(mc|mv)-/i, ''),
  })
  // 🛡️ 刀 9（2026-09-13）：经可剥离闸门收敛。semanticTokenFrom 可能从编码型 current id
  // 提取到含随机中段（00g6b7vh）的 seg → buildComponentId 污染。sanitize 先剥装饰段再派生，
  // 保证落盘 id 必为 c-<语义>-<8hex尾> 契约形态。
  const normalized = sanitizeComponentId(buildComponentId(seg, fallbackComponentId || current), {
    sessionId: fallbackComponentId || current,
    fallbackToken: String(fallbackComponentId || '').replace(/^(mc|mv)-/i, ''),
  })
  parsed.componentId = normalized
  logger.warn('declare.componentId 为任务号形态，写盘前已归一', {
    filePath,
    from: current,
    to: normalized,
  })
  return JSON.stringify(parsed, null, 2)
}

/**
 * 读取组件文件内容
 */
function normalizeVue3Entry(componentDir, filePath) {
  if (filePath !== 'index.vue') return filePath
  return fs.existsSync(path.join(componentDir, 'package', 'index.vue'))
    ? 'package/index.vue'
    : 'index.vue'
}

export async function readComponentFile({ componentId, filePath }) {
  try {
    const componentDir = await resolveComponentDirStrict(componentId)
    if (!componentDir) {
      throw new Error(`组件目录不存在: ${componentId}`)
    }

    const normalizedPath = normalizeVue3Entry(componentDir, filePath)
    const fullPath = path.join(componentDir, normalizedPath)

    // 安全检查：禁止路径穿越
    const resolvedPath = path.resolve(fullPath)
    if (!resolvedPath.startsWith(path.resolve(componentDir))) {
      throw new Error('非法的文件路径')
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`文件不存在: ${normalizedPath}`)
    }

    const content = fs.readFileSync(fullPath, 'utf-8')

    return {
      success: true,
      filePath: normalizedPath,
      content,
      lines: content.split('\n').length,
    }
  } catch (error) {
    logger.error('读取文件失败', { error: error.message, componentId, filePath })
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * 写入/修改组件文件
 * 写入前自动拍摄修改快照（用于后退）
 */
export async function writeComponentFile({ componentId, filePath, content, createBackup = true }) {
  try {
    const componentDir = await resolveComponentDirStrict(componentId)
    if (!componentDir) {
      throw new Error(`组件目录不存在: ${componentId}`)
    }

    const writableDirs = await resolveWritableComponentDirs(componentId)
    if (writableDirs.length === 0) {
      throw new Error('未找到可写的正式组件 workspace，已拒绝修改临时管线产物')
    }

    const normalizedPath = normalizeVue3Entry(componentDir, filePath)
    if (normalizedPath.endsWith('.vue')) {
      const syntaxResult = validateVueSfc(content, normalizedPath)
      if (!syntaxResult.valid) {
        throw new Error(`拒绝写入不可编译 Vue SFC ${normalizedPath}: ${syntaxResult.errors.join('; ')}`)
      }
    }
    // 🛡️ S3：declare.json 写盘前归一到规范 ID（命中任务号形态则收敛 + WARN，禁止持久化坏值）
    const effectiveContent =
      path.basename(normalizedPath) === 'declare.json'
        ? normalizeDeclareComponentId(content, componentId, normalizedPath)
        : content
    const primaryDir = writableDirs.includes(componentDir) ? componentDir : writableDirs[0]
    const primaryPath = resolveSafeFilePath(primaryDir, normalizedPath)
    const originalFileExists = fs.existsSync(primaryPath)

    // 拍摄修改快照（用于「后退」功能）
    try {
      await takeModificationSnapshot(componentId)
    } catch (snapErr) {
      logger.warn('修改快照拍摄失败，继续写入', { error: snapErr.message })
    }

    // 创建旧文件备份（保留在 .backups/ 中，与快照系统互补）
    if (createBackup && originalFileExists) {
      const backupDir = path.join(primaryDir, '.backups')
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true })
      }

      const timestamp = Date.now()
      const backupFileName = `${path.basename(normalizedPath)}.${timestamp}.bak`
      const backupPath = path.join(backupDir, backupFileName)

      fs.copyFileSync(primaryPath, backupPath)
      logger.info('文件已备份', { backupPath })
    }

    // 同步写入所有已存在的正式 workspace，确保文件树、编辑器和预览读取同一版本。
    const writtenTargets = []
    for (const targetDir of writableDirs) {
      const targetPath = resolveSafeFilePath(targetDir, normalizedPath)
      const parentDir = path.dirname(targetPath)
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true })
      }
      fs.writeFileSync(targetPath, effectiveContent, 'utf-8')
      writtenTargets.push(targetPath)
    }

    return {
      success: true,
      filePath: normalizedPath,
      bytesWritten: Buffer.byteLength(effectiveContent, 'utf-8'),
      backupCreated: createBackup && originalFileExists,
      syncedWorkspaces: writtenTargets.length,
    }
  } catch (error) {
    logger.error('写入文件失败', { error: error.message, componentId, filePath })
    return {
      success: false,
      error: error.message,
    }
  }
}

function resolveSafeFilePath(componentDir, filePath) {
  const resolvedBase = path.resolve(componentDir)
  const resolvedPath = path.resolve(resolvedBase, filePath)
  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(resolvedBase + path.sep)) {
    throw new Error('非法的文件路径')
  }
  return resolvedPath
}

/**
 * 列出组件目录下的所有文件
 */
export async function listComponentFiles({ componentId }) {
  try {
    const componentDir = await resolveComponentDirStrict(componentId)
    if (!componentDir) {
      throw new Error(`组件目录不存在: ${componentId}`)
    }

    const files = []
    function traverse(dir, basePath) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue
        const fullPath = path.join(dir, entry.name)
        const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          traverse(fullPath, relativePath)
        } else {
          const stat = fs.statSync(fullPath)
          files.push({
            path: relativePath,
            name: entry.name,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          })
        }
      }
    }

    traverse(componentDir, '')

    return {
      success: true,
      componentId,
      fileCount: files.length,
      files,
    }
  } catch (error) {
    logger.error('列出文件失败', { error: error.message, componentId })
    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * 撤回修改 - 恢复备份文件（保留，向后兼容）
 */
export async function restoreBackup({ componentId, filePath, backupTimestamp }) {
  try {
    const componentDir = await resolveComponentDirStrict(componentId)
    if (!componentDir) {
      throw new Error(`组件目录不存在: ${componentId}`)
    }

    const backupDir = path.join(componentDir, '.backups')

    let backupPath
    if (backupTimestamp) {
      const backupFileName = `${path.basename(filePath)}.${backupTimestamp}.bak`
      backupPath = path.join(backupDir, backupFileName)
    } else {
      const backupFiles = fs.readdirSync(backupDir)
        .filter((f) => f.startsWith(path.basename(filePath)))
        .sort()
        .reverse()

      if (backupFiles.length === 0) {
        throw new Error('没有找到备份文件')
      }
      backupPath = path.join(backupDir, backupFiles[0])
    }

    if (!fs.existsSync(backupPath)) {
      throw new Error('备份文件不存在')
    }

    const fullPath = path.join(componentDir, filePath)
    const backupContent = fs.readFileSync(backupPath, 'utf-8')
    fs.writeFileSync(fullPath, backupContent, 'utf-8')

    logger.info('文件已恢复', { filePath, backupPath })

    return {
      success: true,
      filePath,
      restoredFrom: backupPath,
    }
  } catch (error) {
    logger.error('恢复备份失败', { error: error.message, componentId, filePath })
    return {
      success: false,
      error: error.message,
    }
  }
}

export default {
  readComponentFile,
  writeComponentFile,
  listComponentFiles,
  restoreBackup,
}
