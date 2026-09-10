/**
 * Screenshot Renderer - 渲染截图节点
 * 职责：将生成的组件代码用 Puppeteer 无头浏览器渲染为 PNG 截图
 *
 * 两种渲染路径（按优先级）：
 * 1. 预览页路径：通过前端 /preview/:componentId 打开真实 Vue 运行时页面截图
 *    → 适用于 v-for / {{ }} / props / computed 等动态内容，对比最准确
 * 2. 静态抽取路径（降级回退）：直接提取 .vue 的 <template> + <style> 做静态渲染
 *    → 仅限纯静态组件，动态内容会显示为原始模板语法
 *
 * 设计要点：
 * - sessionId 路径隔离：每个组件截图存到独立目录，防止并行串图
 * - 复用 browser 实例：全局单例，每次 newPage() 创建独立页签
 * - 超时降级：渲染失败不阻塞主流程，返回 null 让视觉比对跳过
 * - Vue3 + 微码双类型支持
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, cpSync } from 'fs'
import { join, dirname, basename, extname } from 'path'
import { createLogger } from '../logger/index.js'
import { customComponentsDir, vue3ComponentsDir, projectRoot } from '../../config/backend-root.js'
import { getFrontendCandidates } from '../../config/runtime-env.js'
// 🛡️ 2026-09-03 修复：原为顶层 require(...) → ESM 加载即抛
// "require is not defined in ES module scope"（dist 原样复制 .js，Node ESM ModuleJob 直接加载）。
// workspace-preview-publisher.js 已 module.exports named export resolveWorkspaceComponentId。
import { resolveWorkspaceComponentId } from '../utils/workspace-preview-publisher.js'

const logger = createLogger({ name: 'screenshot-renderer' })
const RUNTIME_SELF_HEAL_WARNING_CODE = 'RUNTIME_SELF_HEAL_MISSING_ASSET'

const RUNTIME_BLOCK_IDS = new Set([
  'RUNTIME-001',
  'RUNTIME-002',
  'RUNTIME-003',
  'RUNTIME-004',
  'RUNTIME-005',
  'RUNTIME-006',
  'RUNTIME-009',
  'RUNTIME-011',
  'RUNTIME-012',
  'RUNTIME-013',
  'RUNTIME-014',
  'RUNTIME-015',
])

const RUNTIME_INCREMENTAL_IDS = new Set([
  'RUNTIME-007',
  'RUNTIME-008',
  'RUNTIME-010',
])

const RUNTIME_BENIGN_CONSOLE_PATTERNS = [
  /Permissions policy violation: unload is not allowed in this document\.?/i,
  /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i,
  /favicon\.ico/i,
]

const RUNTIME_FATAL_CONSOLE_PATTERNS = [
  /TypeError/i,
  /ReferenceError/i,
  /SyntaxError/i,
  /RangeError/i,
  /Cannot read properties of undefined/i,
  /Cannot read properties of null/i,
  /Cannot set properties of undefined/i,
  /Cannot set properties of null/i,
  /is not defined/i,
  /Unhandled/i,
  /Unexpected token/i,
]

const LOCAL_RUNTIME_URL_PATTERNS = [
  /\/preview\//i,
  /\/__raw\//i,
  /\/workspace\//i,
  /\/component\.js(?:\?|$)/i,
  /\/index\.vue(?:\?|$)/i,
  /\.(js|mjs|ts|vue)(?:\?|$)/i,
]

// 全局 Puppeteer browser 单例（复用，避免每次启动开销）
let _browserInstance = null
let _browserLaunchPromise = null

// 前端预览页候选地址统一由 runtime-env.getFrontendCandidates() 提供，
// 不再在此硬编码域名或读取僵尸别名（FRONTEND_URL/APP_BASE_URL/...）。

function normalizeAssetPathname(pathname = '') {
  if (!pathname) return ''
  return pathname.replace(/^\/+/, '').replace(/^api\/preview\//, '')
}

export function buildRequestPathPattern(path = '') {
  const source = String(path)
    .split(/(\{[^}]+\})/g)
    .map(segment => /^\{[^}]+\}$/.test(segment)
      ? '[^/]+'
      : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('')
  return new RegExp(`^${source}$`)
}

function extractMissingAssetEntries(runtimeGate) {
  const responses = runtimeGate?.issues
    ?.filter(issue => issue?.id === 'RUNTIME-007')
    ?.flatMap(issue => issue?.evidence?.responses || []) || []

  const seen = new Set()
  const entries = []
  for (const response of responses) {
    const url = response?.url || ''
    if (!url) continue
    let pathname = ''
    try {
      pathname = new URL(url).pathname || ''
    } catch {
      pathname = url
    }
    const normalizedPath = normalizeAssetPathname(pathname)
    if (!normalizedPath || seen.has(normalizedPath)) continue
    seen.add(normalizedPath)
    entries.push({
      url,
      normalizedPath,
      fileName: basename(normalizedPath),
    })
  }
  return entries
}

function buildPreviewRelativeCandidates(target, normalizedPath, fileName) {
  const candidates = []
  if (normalizedPath) candidates.push(normalizedPath)
  if (fileName) {
    candidates.push(join('resources', 'images', fileName))
  }
  return [...new Set(candidates)]
}

function buildOutputRelativeCandidates(target, normalizedPath, fileName) {
  const candidates = []
  if (fileName) {
    candidates.push(join('resources', 'images', fileName))
  }
  if (normalizedPath) {
    const cleaned = normalizedPath.replace(/^([^/]+\/){2}/, '')
    if (cleaned && cleaned !== normalizedPath) candidates.push(cleaned)
  }
  return [...new Set(candidates)]
}

function resolveExistingFile(basePath, relativeCandidates = []) {
  for (const relativePath of relativeCandidates) {
    const absolutePath = join(basePath, relativePath)
    if (existsSync(absolutePath)) return absolutePath
  }
  return null
}

function copyIfMissing(sourceFile, destinationFile) {
  mkdirSync(dirname(destinationFile), { recursive: true })
  if (existsSync(destinationFile)) return false
  cpSync(sourceFile, destinationFile, { force: false })
  return true
}

function summarizeRuntimeGate(runtimeGate) {
  return runtimeGate?.issues?.map(issue => `[${issue.id}] ${issue.message}`).join('; ') || '未知运行时错误'
}

function isBenignConsoleError(entry = {}) {
  const text = `${entry?.text || ''} ${entry?.location?.url || ''}`.trim()
  return RUNTIME_BENIGN_CONSOLE_PATTERNS.some(pattern => pattern.test(text))
}

function isFatalConsoleError(entry = {}) {
  const text = entry?.text || ''
  if (RUNTIME_FATAL_CONSOLE_PATTERNS.some(pattern => pattern.test(text))) return true
  const locationUrl = entry?.location?.url || ''
  return !!locationUrl && LOCAL_RUNTIME_URL_PATTERNS.some(pattern => pattern.test(locationUrl))
}

export function buildRuntimeRevisionGuidance(runtimeGate) {
  const issues = Array.isArray(runtimeGate?.issues) ? runtimeGate.issues : []
  const guidance = {
    target: 'layout',
    reviseTarget: 'layout',
    scope: 'incremental-runtime',
    summary: summarizeRuntimeGate(runtimeGate),
    rules: [
      '只修复当前运行时问题，保持其他结构和样式不变。',
      '优先基于真实预览报错证据修改，不要无依据重写整个组件。',
    ],
    focusAreas: [],
    evidence: issues.map(issue => ({
      id: issue?.id,
      category: issue?.category,
      message: issue?.message,
      evidence: issue?.evidence,
    })),
  }

  const issueIds = new Set(issues.map(issue => issue?.id).filter(Boolean))
  if (issueIds.has('RUNTIME-008')) {
    guidance.target = 'engineer'
    guidance.reviseTarget = 'full'
    guidance.scope = 'runtime-request-fix'
    guidance.focusAreas.push('修正模板、脚本或资源引用中的错误请求地址与调用方式')
    guidance.rules.push('网络请求失败优先检查脚本、接口地址、资源路径和条件渲染，不要只改样式。')
  }

  if (issueIds.has('RUNTIME-010')) {
    const fatalConsoleErrors = issues
      .filter(issue => issue?.id === 'RUNTIME-010')
      .flatMap(issue => issue?.evidence?.errors || [])
      .filter(isFatalConsoleError)
    if (fatalConsoleErrors.length > 0) {
      guidance.target = 'engineer'
      guidance.reviseTarget = 'full'
      guidance.scope = 'runtime-script-fix'
      guidance.focusAreas.push('修正运行时脚本异常、未定义变量、空值访问和组件初始化逻辑')
      guidance.rules.push('console.error 来自组件脚本或运行时代码时，必须修脚本/模板逻辑，不要仅做 CSS 级修改。')
      guidance.evidence.push({
        id: 'RUNTIME-010-FATAL',
        category: 'console',
        message: '检测到核心运行时脚本异常',
        evidence: fatalConsoleErrors,
      })
    } else {
      guidance.focusAreas.push('清理非核心 console.error，核对资源引用与宿主副作用')
    }
  }

  if (issueIds.has('RUNTIME-007')) {
    guidance.focusAreas.push('核对资源路径、图片引用和预览态依赖文件是否齐全')
  }

  if (guidance.focusAreas.length === 0) {
    guidance.focusAreas.push('按运行时问题证据做最小范围修复')
  }

  return guidance
}

function hasOnlyMissingAssetIssues(runtimeGate) {
  const issueIds = new Set((runtimeGate?.issues || []).map(issue => issue?.id))
  return issueIds.has('RUNTIME-007') && [...issueIds].every((id) => id === 'RUNTIME-007' || id === 'RUNTIME-010')
}

// 🛡️ P0 升级（2026-09-02，mv-max-1788359428498-ee0cbe69）+ 扩展（2026-09-10，立项统一治理运行时 JS 错误）：
// 确定性运行时缺失判定（产物自身缺陷、重试/降级无法自愈）抽到无 import.meta 的纯函数模块，
// 便于 jest 单测且可复用。详见 docs/runtime-js-error-governance-2026-09-10.md。
import { hasDeterministicRuntimeMissing } from '../utils/runtime-error-classifier.js'
// 保持对外导出不变：graph 层（phase2/vue3）仍从本模块 import 该函数。
export { hasDeterministicRuntimeMissing }

export function classifyRuntimeGate(runtimeGate) {
  const issues = Array.isArray(runtimeGate?.issues) ? runtimeGate.issues : []
  const issueIds = issues.map(issue => issue?.id).filter(Boolean)

  if (runtimeGate?.status === 'WARN' && runtimeGate?.warning) {
    return {
      action: 'complete_with_warning',
      reason: runtimeGate.warning.message,
      blockingIssues: [],
      incrementalIssues: [],
    }
  }

  const blockingIssues = issues.filter(issue => RUNTIME_BLOCK_IDS.has(issue?.id))
  if (blockingIssues.length > 0) {
    return {
      action: 'fail',
      reason: blockingIssues.map(issue => `[${issue.id}] ${issue.message}`).join('; '),
      blockingIssues,
      incrementalIssues: [],
    }
  }

  const incrementalIssues = issues.filter(issue => RUNTIME_INCREMENTAL_IDS.has(issue?.id))
  if (incrementalIssues.length > 0) {
    const hasConsoleOnly = incrementalIssues.every(issue => issue?.id === 'RUNTIME-010')
    const fatalConsoleErrors = incrementalIssues
      .filter(issue => issue?.id === 'RUNTIME-010')
      .flatMap(issue => issue?.evidence?.errors || [])
      .filter(isFatalConsoleError)
    const benignConsoleOnly = hasConsoleOnly && fatalConsoleErrors.length === 0
    return {
      action: benignConsoleOnly ? 'complete_with_warning' : 'incremental_fix',
      reason: incrementalIssues.map(issue => `[${issue.id}] ${issue.message}`).join('; '),
      blockingIssues: [],
      incrementalIssues,
      revisionGuidance: benignConsoleOnly ? null : buildRuntimeRevisionGuidance(runtimeGate),
    }
  }

  if (issueIds.length > 0) {
    // 🛡️ 修复（2026-09-08）：fallback 不再一刀切 fail，而是按 issue.severity 分级
    // 旧逻辑：所有未列入白名单的 issue 都当硬阻断 → 未知 issue ID 直接导致任务失败
    // 新逻辑：检查每个 issue 的 severity 字段，BLOCK 才阻断，其余降级为 incremental
    const unknownBlocking = issues.filter(issue => issue?.severity === 'BLOCK')
    const unknownNonBlocking = issues.filter(issue => issue?.severity !== 'BLOCK')

    if (unknownBlocking.length > 0) {
      // 有明确标记为 BLOCK 的未知 issue，仍然 fail
      return {
        action: 'fail',
        reason: summarizeRuntimeGate(runtimeGate),
        blockingIssues: unknownBlocking,
        incrementalIssues: unknownNonBlocking,
      }
    }

    // 所有未知 issue 都不是 BLOCK 级别，降级为 incremental（允许后续修复）
    return {
      action: 'incremental_fix',
      reason: summarizeRuntimeGate(runtimeGate),
      blockingIssues: [],
      incrementalIssues: issues,
      revisionGuidance: buildRuntimeRevisionGuidance(runtimeGate),
    }
  }

  return {
    action: runtimeGate?.status === 'PASS' ? 'pass' : 'fail',
    reason: runtimeGate?.status === 'PASS' ? 'PASS' : summarizeRuntimeGate(runtimeGate),
    blockingIssues: [],
    incrementalIssues: [],
  }
}

async function selfHealMissingAssetsOnce({ outputPath, runtimeGate, componentId, groupId, target, onProgress }) {
  const missingEntries = extractMissingAssetEntries(runtimeGate)
  if (missingEntries.length === 0) {
    return { attempted: false, healed: false, warning: null, healedAssets: [], missingAssets: [] }
  }

  const workspaceRoot = target === 'vue3'
    ? join(vue3ComponentsDir, groupId || 'default-group', componentId)
    : join(customComponentsDir, componentId)
  const frontendWorkspaceRoot = process.env.FRONTEND_WORKSPACE?.trim()
    ? (process.env.FRONTEND_WORKSPACE.startsWith('/')
      ? process.env.FRONTEND_WORKSPACE
      : join(projectRoot, 'frontend', 'workspace', process.env.FRONTEND_WORKSPACE))
    : join(projectRoot, 'frontend', 'workspace')
  const frontendTargetRoot = target === 'vue3'
    ? join(frontendWorkspaceRoot, 'vue3-components', groupId || 'default-group', componentId)
    : join(frontendWorkspaceRoot, 'custom-components', componentId)

  const healedAssets = []
  const unresolvedAssets = []

  for (const entry of missingEntries) {
    const previewCandidates = buildPreviewRelativeCandidates(target, entry.normalizedPath, entry.fileName)
    const outputCandidates = buildOutputRelativeCandidates(target, entry.normalizedPath, entry.fileName)
    const sourceFile = resolveExistingFile(outputPath, outputCandidates)

    if (!sourceFile) {
      unresolvedAssets.push({ ...entry, reason: 'source-missing', sourceCandidates: outputCandidates })
      continue
    }

    const destinations = [workspaceRoot, frontendTargetRoot]
    let copiedAny = false
    for (const root of destinations) {
      const existingPreviewTarget = resolveExistingFile(root, previewCandidates)
      if (existingPreviewTarget) continue
      const preferredRelativePath = previewCandidates[0] || join('resources', 'images', `${basename(entry.fileName, extname(entry.fileName)) || 'asset'}${extname(entry.fileName) || ''}`)
      const destinationFile = join(root, preferredRelativePath)
      try {
        copiedAny = copyIfMissing(sourceFile, destinationFile) || copiedAny
      } catch (error) {
        unresolvedAssets.push({ ...entry, reason: `copy-failed:${error.message}`, destinationFile })
      }
    }

    if (copiedAny) {
      healedAssets.push({ ...entry, sourceFile })
    } else if (!unresolvedAssets.some(asset => asset.url === entry.url)) {
      unresolvedAssets.push({ ...entry, reason: 'already-missing-after-copy', sourceFile })
    }
  }

  if (healedAssets.length > 0) {
    onProgress?.({
      stage: '运行时质量门禁',
      message: `检测到缺图，已自动补齐 ${healedAssets.length} 个资源后重试一次`,
      status: 'warning',
    })
  }

  const warning = unresolvedAssets.length > 0
    ? {
        code: RUNTIME_SELF_HEAL_WARNING_CODE,
        type: 'runtime-missing-assets',
        message: `真实预览缺图自愈后仍有 ${unresolvedAssets.length} 个资源缺失，已降级为告警，不阻断任务完成`,
        details: unresolvedAssets,
      }
    : null

  return {
    attempted: true,
    healed: healedAssets.length > 0,
    warning,
    healedAssets,
    missingAssets: unresolvedAssets,
  }
}

/**
 * 获取前端预览页基准 URL（优先环境变量，否则逐一尝试）
 * @returns {Promise<string|null>}
 */
async function detectFrontendUrl() {
  const candidates = getFrontendCandidates()
  for (const url of candidates) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)

      const resp = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timeout)

      // 用 GET 探测：部分网关/CDN 对 HEAD 返回 405（如 go.microvideo.cn），
      // 只要服务可达（status < 500）即视为可用，具体路径错误会在渲染阶段暴露。
      if (resp.status >= 200 && resp.status < 500) {
        logger.info(`检测到前端预览页可用: ${url}`)
        return url
      }
    } catch {
      // 不可达，尝试下一个
    }
  }
  logger.warn('未检测到可用的前端预览页，将回退到静态抽取', { candidates })
  return null
}

/**
 * 通过前端预览页渲染截图（真实 Vue 运行时）
 * @returns {Promise<string|null>} 截图路径
 */
async function renderViaPreviewPage({
  componentId,
  sessionId,
  groupId,
  target,
  screenshotPath,
  viewportWidth,
  viewportHeight,
  onProgress,
  requestMocks = [],
}) {
  const issues = []
  const addBlock = (id, category, message, evidence = {}) => {
    issues.push({ id, severity: 'BLOCK', category, message, evidence })
  }
  const frontendUrl = await detectFrontendUrl()
  if (!frontendUrl) {
    addBlock('RUNTIME-001', 'navigation', '真实预览页不可达', { candidates: getFrontendCandidates() })
    return { renderedImage: null, runtimeGate: { status: 'BLOCK', issues, isStaticFallback: false } }
  }

  // 保留基准 URL 的子路径（如 /mvgo）：用相对路径拼接，避免绝对路径覆盖掉子路径导致 404
  const previewUrl = new URL(`preview/${componentId}`, frontendUrl.replace(/\/?$/, '/'))
  // 🛡️ P0-2（2026-09-09）：传真实 sessionId 给 frontend preview 页做 latest snapshot 反查，
  // 避免 ensureLatestSnapshot 用 componentId fallback → API 404（RUNTIME-007）。
  if (sessionId) previewUrl.searchParams.set('sessionId', sessionId)
  if (target === 'vue3') previewUrl.searchParams.set('type', 'vue3')
  if (groupId) previewUrl.searchParams.set('groupId', groupId)

  logger.info(`通过预览页渲染截图: ${previewUrl.href}`)
  onProgress?.({
    stage: '运行时质量门禁',
    message: '正在加载真实组件预览...',
    status: 'running',
  })

  const browser = await getBrowser()
  
  // 🛡️ 2026-09-04 使用独立 BrowserContext 隔离每个截图任务
  // 避免 cookie/localStorage/DOM 状态污染导致截图串图
  // Puppeteer 22+ 已移除 createIncognitoBrowserContext()，改用 createBrowserContext()
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  
  const responseErrors = []
  const responseErrorUrls = new Set()
  const requestFailures = []
  const pageErrors = []
  const consoleErrors = []
  const ignoredShellRequestPatterns = [
    /\/api\/auth\/current(?:\?|$)/,
    /\/api\/tasks(?:\?|$)/,
  ]
  const ignoredConsoleErrorPatterns = [
    /Permissions policy violation: unload is not allowed in this document\.?/i,
  ]
  const isIgnoredShellRequest = url => ignoredShellRequestPatterns.some(pattern => pattern.test(url))
  const isIgnoredConsoleError = text => ignoredConsoleErrorPatterns.some(pattern => pattern.test(text || ''))

  if (requestMocks.length > 0) {
    await page.setRequestInterception(true)
    page.on('request', request => {
      const url = new URL(request.url())
      const method = request.method().toUpperCase()
      const mock = requestMocks.find(item => {
        const mockPath = String(item?.path || '')
        const pathname = url.pathname.startsWith('/api/') ? url.pathname.slice(4) : url.pathname
        const pathPattern = buildRequestPathPattern(mockPath)
        return String(item?.method || 'GET').toUpperCase() === method && pathPattern.test(pathname)
      })
      if (!mock) {
        request.continue()
        return
      }
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mock.response || { code: 200, data: {} }),
      })
    })
  }

  page.on('response', response => {
    const status = response.status()
    const url = response.url()
    if (status >= 400 && !/favicon\.ico(?:\?|$)/.test(url) && !isIgnoredShellRequest(url)) {
      responseErrors.push({ status, url, resourceType: response.request().resourceType() })
      responseErrorUrls.add(url)
    }
  })
  page.on('requestfailed', request => {
    const url = request.url()
    if (isIgnoredShellRequest(url)) return
    requestFailures.push({ url, error: request.failure()?.errorText || 'request failed' })
  })
  page.on('pageerror', error => {
    pageErrors.push({ message: error.message, stack: error.stack || '' })
  })
  page.on('console', message => {
    if (message.type() === 'error') {
      const text = message.text()
      const location = message.location()
      const locationUrl = location?.url || ''
      if (isIgnoredShellRequest(locationUrl) || isIgnoredConsoleError(text)) return
      // 浏览器对资源 404 会同时记 response>=400 和 console.error("Failed to load resource")。
      // 这类错误本质上已经由 RUNTIME-007 覆盖，若继续记到 RUNTIME-010 会重复阻断同一问题。
      const isDuplicatedHttpConsole =
        /Failed to load resource: the server responded with a status of \d+/i.test(text) &&
        !!locationUrl &&
        responseErrorUrls.has(locationUrl)
      if (isDuplicatedHttpConsole) return
      consoleErrors.push({ text, location })
    }
  })

  try {
    await page.setViewport({
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: 2,
    })

    // Vue3 组件需要更长的导航时间（页面加载 + 资源解析）
    const navTimeoutMs = target === 'vue3' ? 60000 : 20000

    const navigationResponse = await page.goto(previewUrl.href, {
      waitUntil: 'domcontentloaded',
      timeout: navTimeoutMs,
    })
    const navigationStatus = navigationResponse?.status() || 0
    if (!navigationResponse || navigationStatus < 200 || navigationStatus >= 400) {
      addBlock('RUNTIME-002', 'navigation', `真实预览导航失败（HTTP ${navigationStatus || '无响应'}）`, {
        url: previewUrl.href,
        status: navigationStatus,
      })
    }

    // Vue3 组件需要更长的加载时间（浏览器内 SFC 编译、LESS 预编译等）
    const timeoutMs = target === 'vue3' ? 60000 : 20000

    try {
      await page.waitForFunction(
        () => {
          const stage = document.querySelector('.mc-preview-stage')
          const status = stage?.getAttribute('data-preview-status')
          return status === 'ready' || status === 'load-error' || status === 'render-error'
        },
        { timeout: timeoutMs },
      )
    } catch (error) {
      addBlock('RUNTIME-003', 'timeout', '真实预览未在时限内进入 ready 或 error 状态', {
        timeoutMs,
        error: error.message,
      })
    }

    const previewState = await page.evaluate(() => {
      const stage = document.querySelector('.mc-preview-stage')
      const status = stage?.getAttribute('data-preview-status') || 'missing'
      const errorType = stage?.getAttribute('data-preview-error-type') || ''
      const loadError = document.querySelector('.mc-preview-error-card')?.textContent?.trim() || ''
      const renderError = document.querySelector('.error-boundary')?.textContent?.trim() || ''
      const children = stage
        ? [...stage.children].filter(element => !element.matches('.mc-panel-switcher, .mc-preview-tip, .mc-preview-error-card, .error-boundary'))
        : []
      const visibleChildren = children.map(element => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          tag: element.tagName,
          className: element.className || '',
          width: rect.width,
          height: rect.height,
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
        }
      }).filter(item => item.width > 1 && item.height > 1 && item.display !== 'none' && item.visibility !== 'hidden' && Number(item.opacity) > 0)
      const stageRect = stage?.getBoundingClientRect()
      return {
        status,
        errorType,
        loadError,
        renderError,
        stage: stageRect ? { width: stageRect.width, height: stageRect.height } : null,
        visibleChildren,
      }
    })

    if (previewState.status !== 'ready') {
      addBlock('RUNTIME-004', 'preview-status', `真实预览状态为 ${previewState.status}`, previewState)
    }
    if (!previewState.stage || previewState.stage.width <= 1 || previewState.stage.height <= 1) {
      addBlock('RUNTIME-005', 'layout', '预览根容器尺寸为空', { stage: previewState.stage })
    }
    if (previewState.status === 'ready' && previewState.visibleChildren.length === 0) {
      addBlock('RUNTIME-006', 'blank-render', '组件已标记 ready，但没有可见根节点', previewState)
    }

    if (responseErrors.length > 0) {
      addBlock('RUNTIME-007', 'http', '组件预览存在 HTTP 资源加载错误', { responses: responseErrors.slice(0, 20) })
    }
    if (requestFailures.length > 0) {
      addBlock('RUNTIME-008', 'request', '组件预览存在网络请求失败', { requests: requestFailures.slice(0, 20) })
    }
    if (pageErrors.length > 0) {
      addBlock('RUNTIME-009', 'pageerror', '组件预览触发未捕获的页面异常', { errors: pageErrors.slice(0, 20) })
    }
    if (consoleErrors.length > 0) {
      addBlock('RUNTIME-010', 'console', '组件预览输出 console.error', { errors: consoleErrors.slice(0, 20) })
    }

    await page.evaluate(() => {
      const switcher = document.querySelector('.mc-panel-switcher')
      if (switcher) switcher.setAttribute('style', 'display: none !important')
    })
    await new Promise(resolve => setTimeout(resolve, 500))

    const stageElement = await page.$('.mc-preview-stage')
    if (stageElement) {
      await stageElement.screenshot({ path: screenshotPath, omitBackground: false })
    } else {
      await page.screenshot({ path: screenshotPath, fullPage: false, omitBackground: false })
    }

    logger.info('预览页截图完成', { componentId, screenshotPath, issueCount: issues.length })
    return {
      renderedImage: screenshotPath,
      runtimeGate: {
        status: issues.length > 0 ? 'BLOCK' : 'PASS',
        issues,
        isStaticFallback: false,
        previewUrl: previewUrl.href,
      },
    }
  } catch (error) {
    addBlock('RUNTIME-011', 'renderer', `真实预览截图失败: ${error.message}`, { stack: error.stack || '' })
    logger.warn('预览页截图失败', { error: error.message })
    return { renderedImage: null, runtimeGate: { status: 'BLOCK', issues, isStaticFallback: false } }
  } finally {
    // 🛡️ 2026-09-04 同时关闭 page 和 context，确保状态完全清理
    try {
      await page.close()
    } catch (closeError) {
      logger.warn('关闭 page 失败', { error: closeError.message })
    }
    try {
      await context.close()
    } catch (closeError) {
      logger.warn('关闭 context 失败', { error: closeError.message })
    }
  }
}

/**
 * 获取或创建 Puppeteer browser 单例
 */
async function getBrowser() {
  if (_browserInstance && _browserInstance.connected) {
    return _browserInstance
  }

  if (_browserLaunchPromise) {
    return _browserLaunchPromise
  }

  _browserLaunchPromise = (async () => {
    try {
      const puppeteer = await import('puppeteer')
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || [
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/snap/bin/chromium',
      ].find(p => { try { return existsSync(p) } catch { return false } })
      const browser = await puppeteer.default.launch({
        headless: 'new',
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--font-render-hinting=none',
        ],
      })

      // 监听断开事件，清理单例
      browser.on('disconnected', () => {
        logger.warn('Puppeteer browser 已断开，下次将重新启动')
        _browserInstance = null
        _browserLaunchPromise = null
      })

      _browserInstance = browser
      logger.info('Puppeteer browser 已启动（单例）')
      return browser
    } catch (error) {
      _browserLaunchPromise = null
      throw error
    }
  })()

  return _browserLaunchPromise
}

/**
 * 尝试将 Less 编译为 CSS（失败则降级返回原始内容）
 * @param {string} code
 * @param {string} basePath - 用于解析 @import 的基准目录
 * @returns {Promise<string>}
 */
async function compileLessIfNeeded(code, basePath) {
  if (!code || (!code.includes('@import') && !code.includes('&'))) {
    return code
  }
  try {
    const less = await import('less')
    const result = await less.default.render(code, {
      paths: [basePath],
      javascriptEnabled: true,
    })
    return result.css
  } catch (error) {
    logger.warn('Less 编译失败，降级使用原始样式', { basePath, error: error.message })
    return code
  }
}

/**
 * 为 Vue3 组件生成容器 HTML
 */
async function buildVue3ContainerHTML(componentDir, componentName) {
  const vuePath = join(componentDir, 'package', 'index.vue')
  if (!existsSync(vuePath)) {
    logger.warn(`无法读取 Vue3 组件文件: ${vuePath} 不存在`)
    return null
  }

  let vueContent = ''
  try {
    vueContent = readFileSync(vuePath, 'utf-8')
  } catch (e) {
    logger.warn(`无法读取 Vue3 组件文件: ${vuePath}`, { error: e.message })
    return null
  }

  // 提取最外层 <template> 和 <style>（Vue SFC 内层 <template #slot> 是未闭合的插槽片段，
  // 用 lookahead 确保匹配到 <script>/<style> 之前最外层的 </template>）
  const templateMatch = vueContent.match(/<template>([\s\S]*?)<\/template>\s*(?=<script|<style|$)/)
  const styleMatch = vueContent.match(/<style[^>]*>([\s\S]*?)<\/style>/)

  const template = templateMatch ? templateMatch[1].trim() : ''
  let styleCode = styleMatch ? styleMatch[1].trim() : ''

  // 若样式是 Less，尝试编译为 CSS
  if (styleCode && styleMatch && styleMatch[0].includes('lang="less"')) {
    styleCode = await compileLessIfNeeded(styleCode, dirname(vuePath))
  }

  // 构建 Vue3 SFC 静态渲染页面
  // 对于视觉比对来说，template + style 的静态渲染已足够（不需要 script 交互逻辑）
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: inline-block; background: transparent; }
    #app { display: inline-block; }
    ${styleCode}
  </style>
</head>
<body>
  <div id="app">${template}</div>
</body>
</html>`
}

/**
 * 为微码组件生成容器 HTML
 *
 * 说明：
 * - 微码 component.js 通常是 `import component from './package/index.vue'`，浏览器无法直接执行。
 * - 视觉比对只需要静态外观，因此直接读取 package/index.vue 的 <template> + <style> 做静态渲染。
 * - 同时注入 resources/styles 下的 Less/CSS 作为兜底样式，并尝试编译 Less。
 */
async function analyzeScreenshotPixels(screenshotPath) {
  try {
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(screenshotPath)
      .removeAlpha()
      .resize({ width: 160, height: 160, fit: 'inside', withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const pixelCount = info.width * info.height
    if (!pixelCount) return { blank: true, reason: 'empty-image', variance: 0, nonWhiteRatio: 0 }

    let sum = 0
    let sumSquares = 0
    let nonWhitePixels = 0
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const r = data[offset]
      const g = data[offset + 1]
      const b = data[offset + 2]
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
      sum += luminance
      sumSquares += luminance * luminance
      if (r < 248 || g < 248 || b < 248) nonWhitePixels += 1
    }

    const mean = sum / pixelCount
    const variance = Math.max(0, sumSquares / pixelCount - mean * mean)
    const nonWhiteRatio = nonWhitePixels / pixelCount
    return {
      blank: variance < 2 && nonWhiteRatio < 0.005,
      variance: Number(variance.toFixed(2)),
      nonWhiteRatio: Number(nonWhiteRatio.toFixed(4)),
      width: info.width,
      height: info.height,
    }
  } catch (error) {
    return { blank: false, analysisError: error.message }
  }
}

async function buildMicrocodeContainerHTML(componentDir, componentName) {
  const declarePath = join(componentDir, 'declare.json')
  const vuePath = join(componentDir, 'package', 'index.vue')
  const stylesDir = join(componentDir, 'resources', 'styles')

  let declare = null
  try {
    declare = JSON.parse(readFileSync(declarePath, 'utf-8'))
  } catch (e) {
    logger.warn(`无法读取 declare.json: ${declarePath}`, { error: e.message })
    return null
  }

  // 读取 Vue SFC 模板和样式
  let vueContent = ''
  try {
    vueContent = readFileSync(vuePath, 'utf-8')
  } catch (e) {
    logger.warn(`无法读取微码 Vue 文件: ${vuePath}`, { error: e.message })
    return null
  }

  // 提取最外层 <template> 和 <style>
  const templateMatch = vueContent.match(/<template>([\s\S]*?)<\/template>\s*(?=<script|<style|$)/)
  const styleMatch = vueContent.match(/<style[^>]*>([\s\S]*?)<\/style>/)
  const template = templateMatch ? templateMatch[1].trim() : ''
  let vueStyle = styleMatch ? styleMatch[1].trim() : ''

  // 若样式是 Less，尝试编译为 CSS
  if (vueStyle && styleMatch && styleMatch[0].includes('lang="less"')) {
    vueStyle = await compileLessIfNeeded(vueStyle, dirname(vuePath))
  }

  // 读取 resources/styles 下所有样式文件兜底，并尝试编译 Less
  let stylesContent = ''
  try {
    if (existsSync(stylesDir)) {
      const styleFiles = readdirSync(stylesDir).filter(f => f.endsWith('.less') || f.endsWith('.css'))
      for (const f of styleFiles) {
        // common.less 是 index.less 引入的 partial，单独编译会因变量未定义而失败；
        // index.less 已通过 Vue SFC 的 @import 编译，此处无需重复兜底。
        if (f === 'common.less' || f === 'index.less') continue
        const raw = readFileSync(join(stylesDir, f), 'utf-8')
        const compiled = f.endsWith('.less')
          ? await compileLessIfNeeded(raw, stylesDir)
          : raw
        stylesContent += `\n/* ${f} */\n` + compiled
      }
    }
  } catch (e) {
    logger.warn(`无法读取样式目录: ${stylesDir}`, { error: e.message })
  }

  const rootClass = `c-${declare.componentName || componentName}-root`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: inline-block; background: transparent; }
    #mc-root { display: inline-block; }
    ${vueStyle}
    ${stylesContent}
  </style>
</head>
<body>
  <div id="mc-root" class="${rootClass}">${template}</div>
</body>
</html>`
}

/**
 * 渲染截图
 * @param {Object} params
 * @param {string} params.outputPath - 组件输出目录
 * @param {string} params.sessionId - 生成会话 ID（用于路径隔离）
 * @param {string} params.componentName - 组件名称
 * @param {string} params.target - 组件类型: 'microcode' | 'vue3'
 * @param {string} params.groupId - Vue3 组件所属群组
 * @param {string} params.previewImage - Figma 原始预览图路径（用于获取尺寸）
 * @param {Object} params.onProgress - 进度回调
 * @param {boolean} params.hardGate - true 时禁止静态降级，真实预览失败直接 BLOCK
 * @param {Array} params.requestMocks - 仅在确定性发布门禁中拦截的业务 API 响应
 * @returns {Promise<{ renderedImage: string|null, isStaticFallback: boolean, runtimeGate: Object }>}
 */
export async function renderScreenshot(params) {
  const {
    outputPath,
    sessionId = 'unknown',
    componentName = 'unknown',
    target = 'microcode',
    groupId = 'default-group',
    previewImage = null,
    onProgress = null,
    hardGate = false,
    allowMissingAssetSelfHeal = false,
    requestMocks = [],
  } = params

  // M1-1：workspace 目录名以 declare.json componentId 为准，截图预览也必须用同一 ID，
  // 否则 preview 页按旧 sessionId 查找目录会 404。
  const resolvedComponentId = outputPath
    ? resolveWorkspaceComponentId(outputPath, sessionId)
    : sessionId
  if (resolvedComponentId !== sessionId) {
    logger.info('[renderScreenshot] componentId 按 declare.json 归一', {
      sessionId,
      resolvedComponentId,
    })
  }

  logger.info('开始渲染截图', { sessionId, componentName, target, outputPath, resolvedComponentId })

  onProgress?.({
    stage: '视觉比对',
    message: '正在渲染组件截图...',
    status: 'running',
  })

  // 截图目录：sessionId 隔离（保持原 sessionId 命名，仅预览 ID 用 resolvedComponentId）
  const screenshotDir = join(outputPath, '.mc-gen', 'screenshots')
  const htmlPath = join(screenshotDir, `${sessionId}-preview.html`)
  const screenshotPath = join(screenshotDir, `${sessionId}-rendered.png`)

  try {
    // 创建截图目录
    mkdirSync(screenshotDir, { recursive: true })

    // ── 计算 viewport 尺寸（基于 Figma 预览图）──
    let viewportWidth = 800
    let viewportHeight = 600
    if (previewImage && existsSync(previewImage)) {
      try {
        const sharp = (await import('sharp')).default
        const metadata = await sharp(readFileSync(previewImage)).metadata()
        viewportWidth = Math.min(metadata.width || 800, 1200)
        viewportHeight = Math.min(metadata.height || 600, 1600)
      } catch (e) {
        logger.warn('无法读取预览图尺寸，使用默认 viewport', { error: e.message })
      }
    }

  // ── 1️⃣ 优先：通过前端预览页渲染（真实 Vue 运行时）──
  let previewResult = await renderViaPreviewPage({
    componentId: resolvedComponentId,
    sessionId,
    groupId,
    target,
    screenshotPath,
    viewportWidth,
    viewportHeight,
    onProgress,
    requestMocks,
  })

    const finalizePreviewResult = async (result) => {
      if (!result?.renderedImage) return result
      const pixelEvidence = await analyzeScreenshotPixels(result.renderedImage)
      if (pixelEvidence.blank) {
        result.runtimeGate.status = 'BLOCK'
        result.runtimeGate.issues.push({
          id: 'RUNTIME-012',
          severity: 'BLOCK',
          category: 'blank-render',
          message: '真实预览截图像素近似全白或无有效内容',
          evidence: pixelEvidence,
        })
      }
      return result
    }

      if (allowMissingAssetSelfHeal && previewResult.runtimeGate?.status === 'BLOCK' && hasOnlyMissingAssetIssues(previewResult.runtimeGate)) {
        const healResult = await selfHealMissingAssetsOnce({
          outputPath,
          runtimeGate: previewResult.runtimeGate,
          componentId: resolvedComponentId,
          groupId,
          target,
          onProgress,
        })

        if (healResult.attempted && healResult.healed) {
          logger.warn('检测到缺图，执行一次自愈重试', {
            sessionId,
            componentName,
            target,
            healedAssets: healResult.healedAssets.map(item => item.fileName),
          })
          previewResult = await renderViaPreviewPage({
            componentId: resolvedComponentId,
            sessionId,
            groupId,
            target,
            screenshotPath,
            viewportWidth,
            viewportHeight,
            onProgress,
          })
        }

      if (previewResult.runtimeGate?.status === 'BLOCK' && hasOnlyMissingAssetIssues(previewResult.runtimeGate)) {
        const warning = healResult.warning || {
          code: RUNTIME_SELF_HEAL_WARNING_CODE,
          type: 'runtime-missing-assets',
          message: '真实预览缺图自愈后仍存在资源缺失，已降级为告警，不阻断任务完成',
          details: extractMissingAssetEntries(previewResult.runtimeGate),
        }
        previewResult.runtimeGate = {
          ...previewResult.runtimeGate,
          status: 'WARN',
          warning,
          warningCode: warning.code,
        }
        onProgress?.({
          stage: '运行时质量门禁',
          message: '缺图自愈后仍有资源缺失，已记录告警并继续完成任务',
          status: 'warning',
        })
      }
    }

    previewResult = await finalizePreviewResult(previewResult)

    if (previewResult.renderedImage) {
      return {
        renderedImage: previewResult.renderedImage,
        isStaticFallback: false,
        runtimeGate: previewResult.runtimeGate,
      }
    }

    if (hardGate) {
      return {
        renderedImage: null,
        isStaticFallback: false,
        runtimeGate: previewResult.runtimeGate,
      }
    }

    logger.info('预览页路径不可用，回退到静态抽取', { sessionId })

    // ── 2️⃣ 降级：静态 HTML 抽取（原逻辑）──
    const html = target === 'vue3'
      ? await buildVue3ContainerHTML(outputPath, componentName)
      : await buildMicrocodeContainerHTML(outputPath, componentName)

    if (!html) {
      logger.warn('无法构建容器 HTML，跳过截图', { sessionId, target })
      onProgress?.({
        stage: '视觉比对',
        message: '截图跳过（无法构建容器）',
        status: 'warning',
      })
      return {
        renderedImage: null,
        isStaticFallback: false,
        runtimeGate: {
          status: 'BLOCK',
          issues: [{
            id: 'RUNTIME-014',
            severity: 'BLOCK',
            category: 'renderer',
            message: '无法构建组件截图容器',
            evidence: { outputPath, target },
          }],
          isStaticFallback: false,
        },
      }
    }

    writeFileSync(htmlPath, html, 'utf-8')

    // 启动 Puppeteer 渲染静态 HTML
    const browser = await getBrowser()
    const page = await browser.newPage()

    try {
      await page.setViewport({
        width: viewportWidth,
        height: viewportHeight,
        deviceScaleFactor: 2,
      })

      // 加载 HTML 文件
      await page.goto(`file://${htmlPath}`, {
        waitUntil: 'networkidle0',
        timeout: 3000,
      })

      await new Promise(r => setTimeout(r, 500))

      // 截图
      await page.screenshot({
        path: screenshotPath,
        fullPage: false,
        omitBackground: false,
      })

      logger.info('静态抽取截图完成', { sessionId, screenshotPath, viewport: { width: viewportWidth, height: viewportHeight } })

      onProgress?.({
        stage: '视觉比对',
        message: '组件截图完成（静态抽取）',
        status: 'completed',
      })

      return {
        renderedImage: screenshotPath,
        isStaticFallback: true,
        runtimeGate: {
          status: 'BLOCK',
          issues: [{
            id: 'RUNTIME-013',
            severity: 'BLOCK',
            category: 'static-fallback',
            message: '仅完成静态抽取，不能证明组件可在真实 Vue 运行时加载',
            evidence: { screenshotPath },
          }],
          isStaticFallback: true,
        },
      }
    } finally {
      await page.close()
    }
  } catch (error) {
    logger.warn('截图渲染失败，降级跳过视觉比对', {
      sessionId,
      error: error.message,
    })

    onProgress?.({
      stage: '视觉比对',
      message: `截图失败（${error.message}），跳过视觉比对`,
      status: 'warning',
    })

    return {
      renderedImage: null,
      isStaticFallback: false,
      runtimeGate: {
        status: 'BLOCK',
        issues: [{
          id: 'RUNTIME-015',
          severity: 'BLOCK',
          category: 'renderer',
          message: `截图渲染失败: ${error.message}`,
          evidence: { stack: error.stack || '' },
        }],
        isStaticFallback: false,
      },
    }
  }
}

/**
 *  预热 Puppeteer browser（非阻塞）
 * 在 init 节点调用，提前启动 browser 实例，避免 screenshot-renderer 首次启动延迟
 * @returns {Promise<void>}
 */
export async function warmupBrowser() {
  if (_browserInstance || _browserLaunchPromise) {
    logger.info('Puppeteer browser 已在运行或预热中，跳过')
    return
  }
  
  logger.info('🔥 P1-4: 开始预热 Puppeteer browser...')
  const startTime = Date.now()
  
  try {
    await getBrowser()
    const elapsed = Date.now() - startTime
    logger.info(`✅ P1-4: Puppeteer browser 预热完成 (${elapsed}ms)`)
  } catch (error) {
    logger.warn('⚠️ P1-4: Puppeteer 预热失败（非阻塞）', { error: error.message })
  }
}

export function evaluateRuntimeGate(runtimeGate) {
  return classifyRuntimeGate(runtimeGate)
}

/**
 * 关闭 Puppeteer browser 单例（进程退出时调用）
 */
export async function closeBrowser() {
  if (_browserInstance) {
    try {
      await _browserInstance.close()
    } catch (e) {
      // 静默
    }
    _browserInstance = null
    _browserLaunchPromise = null
  }
}

// 进程退出时清理
process.on('exit', () => {
  if (_browserInstance) {
    try {
      _browserInstance.close()
    } catch (e) {
      // 静默
    }
  }
})
