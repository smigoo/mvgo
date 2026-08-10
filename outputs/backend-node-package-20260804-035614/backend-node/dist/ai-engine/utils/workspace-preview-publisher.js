import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { randomBytes } from 'crypto'
import { dirname, isAbsolute, join } from 'path'
import { fileURLToPath } from 'url'
import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'workspace-preview-publisher' })
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = join(MODULE_DIR, '..', '..', '..')
const PROJECT_ROOT = join(BACKEND_ROOT, '..')

const DEFAULT_FRONTEND_PUBLIC_URL = 'https://go.microvideo.cn'
const CLEANUP_MARKER = '.cleanup-'
const DELETE_BATCH_SIZE = 20
const MAX_DELETE_ATTEMPTS = 5
const CLEANUP_SCAN_DEPTH = 4

const cleanupJobs = []
const scheduledCleanupRoots = new Set()
let cleanupDrainScheduled = false
let startupCleanupScanned = false

function resetCleanupState() {
  cleanupJobs.length = 0
  scheduledCleanupRoots.clear()
  cleanupDrainScheduled = false
  startupCleanupScanned = false
}

function normalizeFrontendUrlCandidate(value) {
  const url = value?.trim()
  return url ? url.replace(/\/$/, '') : ''
}

function getFrontendCandidates() {
  return [
    process.env.MC_PREVIEW_BASE_URL,
    process.env.FRONTEND_URL,
    process.env.APP_BASE_URL,
    process.env.PUBLIC_BASE_URL,
    process.env.SITE_URL,
    process.env.PUBLIC_SITE_URL,
    DEFAULT_FRONTEND_PUBLIC_URL,
    'http://127.0.0.1:2610',
    'http://localhost:2610',
    'http://127.0.0.1:2611',
    'http://localhost:2611',
  ].map(normalizeFrontendUrlCandidate).filter((value, index, list) => value && list.indexOf(value) === index)
}

function resolveFrontendWorkspace() {
  const configured = process.env.FRONTEND_WORKSPACE?.trim()
  if (!configured) return join(PROJECT_ROOT, 'frontend', 'workspace')
  return isAbsolute(configured) ? configured : join(BACKEND_ROOT, configured)
}

function copyDirectoryContents(source, destination) {
  if (!existsSync(source)) return false
  mkdirSync(destination, { recursive: true })
  cpSync(source, destination, { recursive: true, force: true })
  return true
}

function collectCleanupEntries(rootPath, files, directories) {
  if (!existsSync(rootPath)) return

  const stat = lstatSync(rootPath)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    files.push(rootPath)
    return
  }

  for (const entry of readdirSync(rootPath)) {
    collectCleanupEntries(join(rootPath, entry), files, directories)
  }
  directories.push(rootPath)
}

function scheduleCleanupDrain() {
  if (cleanupDrainScheduled) return
  cleanupDrainScheduled = true
  setTimeout(() => {
    cleanupDrainScheduled = false
    drainNextCleanupBatch()
  }, 0)
}

function retryOrAbandonCleanup(job, queue, targetPath, targetType, error) {
  const attempts = (job.attempts.get(targetPath) || 0) + 1
  if (attempts < MAX_DELETE_ATTEMPTS) {
    job.attempts.set(targetPath, attempts)
    queue.push(targetPath)
    logger.warn('workspace 预览残留清理失败，稍后重试', {
      targetType,
      targetPath,
      attempts,
      maxAttempts: MAX_DELETE_ATTEMPTS,
      error: error.message,
    })
    return
  }

  job.attempts.delete(targetPath)
  logger.error('workspace 预览残留清理连续失败，停止自动重试并保留路径', {
    targetType,
    targetPath,
    error: error.message,
  })
}

function drainNextCleanupBatch() {
  const job = cleanupJobs[0]
  if (!job) return

  if (!job.prepared) {
    collectCleanupEntries(job.rootPath, job.files, job.directories)
    job.directories.sort((left, right) => right.length - left.length)
    job.prepared = true
  }

  let operations = 0
  const fileBatchSize = Math.min(job.files.length, DELETE_BATCH_SIZE)
  for (let index = 0; index < fileBatchSize; index += 1) {
    const filePath = job.files.shift()
    try {
      unlinkSync(filePath)
      job.attempts.delete(filePath)
    } catch (error) {
      retryOrAbandonCleanup(job, job.files, filePath, 'file', error)
    }
    operations += 1
  }

  if (job.files.length === 0) {
    const directoryBatchSize = Math.min(job.directories.length, DELETE_BATCH_SIZE - operations)
    for (let index = 0; index < directoryBatchSize; index += 1) {
      const directoryPath = job.directories.shift()
      try {
        rmdirSync(directoryPath)
        job.attempts.delete(directoryPath)
      } catch (error) {
        retryOrAbandonCleanup(job, job.directories, directoryPath, 'directory', error)
      }
    }
  }

  if (job.files.length === 0 && job.directories.length === 0) {
    scheduledCleanupRoots.delete(job.rootPath)
    cleanupJobs.shift()
  }

  if (cleanupJobs.length > 0) {
    setTimeout(() => drainNextCleanupBatch(), 10)
  }
}

function enqueueDetachedCleanup(detachedPath) {
  if (!existsSync(detachedPath)) return null
  if (scheduledCleanupRoots.has(detachedPath)) return detachedPath

  cleanupJobs.push({
    rootPath: detachedPath,
    files: [],
    directories: [],
    attempts: new Map(),
    prepared: false,
  })
  scheduledCleanupRoots.add(detachedPath)
  scheduleCleanupDrain()
  return detachedPath
}

function detachPathForCleanup(targetPath) {
  if (!existsSync(targetPath)) return null

  const detachedPath = targetPath.includes(CLEANUP_MARKER)
    ? targetPath
    : `${targetPath}${CLEANUP_MARKER}${process.pid}-${Date.now()}-${randomBytes(3).toString('hex')}`

  if (detachedPath !== targetPath) {
    renameSync(targetPath, detachedPath)
  }

  return enqueueDetachedCleanup(detachedPath)
}

function schedulePathCleanup(targetPath, reason) {
  if (!existsSync(targetPath)) return null
  try {
    return detachPathForCleanup(targetPath)
  } catch (error) {
    logger.warn('workspace 预览延迟清理调度失败，保留现场等待下次启动自愈', {
      targetPath,
      reason,
      error: error.message,
    })
    return null
  }
}

function collectCleanupDirs(root, maxDepth) {
  const found = []
  const walk = (current, depth) => {
    if (depth > maxDepth) return

    let entries = []
    try {
      entries = readdirSync(current)
    } catch {
      return
    }

    for (const name of entries) {
      const fullPath = join(current, name)
      let stat
      try {
        stat = lstatSync(fullPath)
      } catch {
        continue
      }

      if (!stat.isDirectory() || stat.isSymbolicLink()) continue
      if (name.includes(CLEANUP_MARKER)) {
        found.push(fullPath)
      }
      walk(fullPath, depth + 1)
    }
  }

  if (existsSync(root)) {
    walk(root, 0)
  }
  return found
}

function ensureStartupCleanupScan() {
  if (startupCleanupScanned) return
  startupCleanupScanned = true

  const roots = [
    join(BACKEND_ROOT, 'workspace'),
    resolveFrontendWorkspace(),
  ]

  let resumed = 0
  for (const root of roots) {
    for (const dir of collectCleanupDirs(root, CLEANUP_SCAN_DEPTH)) {
      if (scheduledCleanupRoots.has(dir)) continue
      if (enqueueDetachedCleanup(dir)) resumed += 1
    }
  }

  if (resumed > 0) {
    logger.info('workspace 预览发布启动扫描恢复遗漏清理任务', { resumed })
  }
}

function buildStagingCopy({ outputPath, targetPath, target }) {
  const stagingPath = `${targetPath}.quality-staging-${process.pid}-${Date.now()}-${randomBytes(3).toString('hex')}`
  const backupPath = `${targetPath}.quality-backup-${process.pid}-${Date.now()}-${randomBytes(3).toString('hex')}`

  schedulePathCleanup(stagingPath, '清理遗留 staging 目录')
  mkdirSync(stagingPath, { recursive: true })

  if (target === 'vue3') {
    // 保留真实目录树：整体复制 outputPath（含 package/ 与 resources/ 等），
    // 使前端 workspace 落地为 package/index.vue 真实树结构，而非扁平化。
    if (!copyDirectoryContents(outputPath, stagingPath)) {
      throw new Error(`Vue3 预览产物目录不存在: ${outputPath}`)
    }
    if (!existsSync(join(stagingPath, 'package', 'index.vue'))) {
      throw new Error(`Vue3 预览入口缺失: ${join(stagingPath, 'package', 'index.vue')}`)
    }
  } else {
    copyDirectoryContents(outputPath, stagingPath)
    const entryPath = join(stagingPath, 'package', 'index.vue')
    if (!existsSync(entryPath)) {
      throw new Error(`微码预览入口不存在: ${entryPath}`)
    }

    // L3 修复：优先保留 AI 工程师生成的 component.js（含完整 import 链路）
    const originalComponentJs = join(outputPath, 'component.js')
    const stagingComponentJs = join(stagingPath, 'component.js')
    
    if (existsSync(originalComponentJs)) {
      // 优先使用 AI 工程师写的 component.js（保留完整 import 链路）
      copyFileSync(originalComponentJs, stagingComponentJs)
    } else {
      // fallback：自动生成（带缓存破坏）
      const cssPath = join(stagingPath, 'resources', 'styles', 'index.css')
      const lessPath = join(stagingPath, 'resources', 'styles', 'index.less')
      const cacheBuster = `?v=${Date.now()}`
      const styleImport = existsSync(cssPath)
        ? `import './resources/styles/index.css${cacheBuster}'`
        : existsSync(lessPath)
          ? `import './resources/styles/index.less${cacheBuster}'`
          : '// No CSS/LESS file found'
      writeFileSync(
        stagingComponentJs,
        `import component from './package/index.vue'\n${styleImport}\nexport default component\n`,
        'utf-8',
      )
    }
  }

  return {
    target,
    outputPath,
    targetPath,
    stagingPath,
    backupPath,
    hadExisting: false,
    published: false,
  }
}

function promotePreparedTarget(preparedTarget) {
  const parent = dirname(preparedTarget.targetPath)
  mkdirSync(parent, { recursive: true })

  if (existsSync(preparedTarget.targetPath)) {
    renameSync(preparedTarget.targetPath, preparedTarget.backupPath)
    preparedTarget.hadExisting = true
  }

  renameSync(preparedTarget.stagingPath, preparedTarget.targetPath)
  preparedTarget.published = true
  return preparedTarget
}

function rollbackPreparedTarget(preparedTarget) {
  const { targetPath, backupPath, hadExisting } = preparedTarget

  if (hadExisting && existsSync(backupPath)) {
    if (existsSync(targetPath)) {
      schedulePathCleanup(targetPath, '回滚失败发布的新产物')
    }
    try {
      renameSync(backupPath, targetPath)
      return
    } catch (error) {
      logger.error('workspace 预览回滚失败：旧产物恢复失败', {
        targetPath,
        backupPath,
        error: error.message,
      })
      return
    }
  }

  if (existsSync(targetPath)) {
    schedulePathCleanup(targetPath, '回滚无旧版本的新产物')
  }
}

function finalizePreparedTarget(preparedTarget) {
  if (preparedTarget.hadExisting) {
    schedulePathCleanup(preparedTarget.backupPath, '清理已替换的旧 workspace 备份')
  }
  if (existsSync(preparedTarget.stagingPath)) {
    schedulePathCleanup(preparedTarget.stagingPath, '清理残留 staging 目录')
  }
}

function publishPreparedTargets(preparedTargets) {
  const promotedTargets = []
  try {
    for (const preparedTarget of preparedTargets) {
      promotePreparedTarget(preparedTarget)
      promotedTargets.push(preparedTarget)
    }
  } catch (error) {
    for (const preparedTarget of [...promotedTargets, ...preparedTargets].reverse()) {
      rollbackPreparedTarget(preparedTarget)
    }
    throw error
  } finally {
    for (const preparedTarget of preparedTargets) {
      finalizePreparedTarget(preparedTarget)
    }
  }
}

async function invalidateFrontendCache() {
  for (const frontendUrl of getFrontendCandidates()) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    try {
      const response = await fetch(`${frontendUrl}/__invalidate`, {
        signal: controller.signal,
      })
      if (response.ok) return true
    } catch {
      // 前端服务可能未启动，真实预览门禁会返回结构化错误。
    } finally {
      clearTimeout(timer)
    }
  }
  return false
}

ensureStartupCleanupScan()

/**
 * 将当前迭代产物同步到前后端 workspace，供真实预览页进行运行时质量检查。
 */
export async function publishQualityPreview({
  outputPath,
  componentId,
  groupId = 'default-group',
  target = 'microcode',
}) {
  if (!outputPath || !componentId) {
    throw new Error('质量预览暂存缺少 outputPath 或 componentId')
  }

  const relativeTarget = target === 'vue3'
    ? join('vue3-components', groupId, componentId)
    : join('custom-components', componentId)
  const targetPaths = [
    join(BACKEND_ROOT, 'workspace', relativeTarget),
    join(resolveFrontendWorkspace(), relativeTarget),
  ]

  const preparedTargets = targetPaths.map((targetPath) =>
    buildStagingCopy({ outputPath, targetPath, target }),
  )

  publishPreparedTargets(preparedTargets)

  const cacheInvalidated = target === 'microcode'
    ? await invalidateFrontendCache()
    : false

  logger.info('质量预览产物已同步到 workspace', {
    componentId,
    groupId,
    target,
    targetPaths,
    cacheInvalidated,
  })

  return { targetPaths, cacheInvalidated }
}

export const __testing = {
  ensureStartupCleanupScan,
  collectCleanupDirs,
  buildStagingCopy,
  promotePreparedTarget,
  rollbackPreparedTarget,
  publishPreparedTargets,
  resetCleanupState,
}
