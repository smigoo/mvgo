#!/usr/bin/env node
/**
 * L1 还原率回归评测脚本（只评测、不动管线、不重启服务）
 *
 * 作用：自动发现前端 workspace 中「同时含 source-*.png(Figma 真值) 与 package/index.vue(生成代码)」
 * 的组件产物作为回归集，逐个跑通：
 *   publishQualityPreview → renderScreenshot(真实 Vue 运行时 puppeteer 截图) → VisualComparator(视觉比对)
 * 输出 CSV + JSON 报告，并汇总平均还原率 / ≥80% 占比 / 失败清单。
 *
 * 用法：
 *   node scripts/eval-fidelity-loop.mjs                      # 全量（微码+Vue3，含视觉比对）
 *   node scripts/eval-fidelity-loop.mjs --no-compare         # 只跑发布+截图+门禁，不烧 vision token
 *   node scripts/eval-fidelity-loop.mjs --target=microcode --limit=3
 *   node scripts/eval-fidelity-loop.mjs --target=vue3 --no-compare
 *
 * 依赖：backend-node/dist 已构建（引擎文件来自 dist，与运行中的 13030 服务同源）。
 * 环境：复用运行中的前端 2610 预览页，不重启任何服务。
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, cpSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const backendRoot = join(__dirname, '..')
const dist = join(backendRoot, 'dist')
const frontendWorkspace = join(backendRoot, '..', 'frontend', 'workspace')
const outDir = join(backendRoot, 'scripts', 'eval-reports')
mkdirSync(outDir, { recursive: true })

// 本地 Chromium（puppeteer 优先用环境变量指向的可执行文件）
if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',
  ]
  for (const c of candidates) {
    if (existsSync(c)) {
      process.env.PUPPETEER_EXECUTABLE_PATH = c
      break
    }
  }
}

// ── 参数解析 ──
const args = process.argv.slice(2)
const noCompare = args.includes('--no-compare')
const publish = args.includes('--publish') // 默认不发布：回归集组件本就在前端 workspace 里"活着"，预览直接渲染即可（零副作用）
const limit = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || 0)
const targetFilter = args.find((a) => a.startsWith('--target='))?.split('=')[1] || 'all'
const manifestPath = args.find((a) => a.startsWith('--manifest='))?.split('=')[1]
const ts = new Date().toISOString().replace(/[:.]/g, '-')

// ── 引擎（来自 dist，与运行时 13030 同源）；按需懒加载，避免抬高 node 基线内存导致 Chrome OOM ──
// puppeteer（来自 backend-node/node_modules，CJS 通过 createRequire 加载）
const require = createRequire(import.meta.url)
const puppeteer = require('/Users/smigoo/工作/mvgo/backend-node/node_modules/puppeteer')
process.stdout.write('BOOT puppeteer-loaded\n')

// 轻量前端 URL 探测（避免导入 dist/config/runtime-env 重型模块）
async function detectFrontendUrl() {
  const candidates = ['http://127.0.0.1:2610', 'http://localhost:2610', process.env.MC_PREVIEW_BASE_URL].filter(Boolean)
  for (const url of candidates) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 3000)
      const r = await fetch(url, { signal: ctrl.signal })
      clearTimeout(t)
      if (r.status >= 200 && r.status < 500) return url
    } catch {
      /* try next */
    }
  }
  return null
}

// 轻量渲染器：复用预览页 URL + waitForFunction 逻辑，但用 --single-process 启动 Chrome，
// 以规避本低内存沙箱下默认多进程启动被 OOM SIGKILL 的问题（管线代码零改动；生产 ECS 仍可用原 renderScreenshot）。
let _browser = null
async function getLocalBrowser() {
  if (_browser && _browser.connected) return _browser
  _browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
      '--font-render-hinting=none',
    ],
  })
  return _browser
}

async function renderScreenshotLocal({ componentId, groupId = 'default-group', target = 'microcode', onProgress = () => {} }) {
  const issues = []
  const addBlock = (id, category, message, evidence = {}) => issues.push({ id, severity: 'BLOCK', category, message, evidence })

  // 直接用已知在线的预览地址（127.0.0.1:2610 已探活），避免 Node 全局 fetch 受系统代理干扰
  const frontendUrl = 'http://127.0.0.1:2610'
  {
    const candidates = [frontendUrl]
    void candidates
  }

  const previewUrl = new URL(`preview/${componentId}`, frontendUrl.replace(/\/?$/, '/'))
  if (target === 'vue3') previewUrl.searchParams.set('type', 'vue3')
  if (groupId) previewUrl.searchParams.set('groupId', groupId)

  onProgress({ message: `渲染预览 ${previewUrl.href}` })
  const browser = await getLocalBrowser()
  const page = await browser.newPage()
  const consoleErrors = []
  const responseErrors = []
  const pageErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon\.ico/.test(r.url())) responseErrors.push(`${r.status()} ${r.url()}`) })

  try {
    await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 2 })
    const navTimeout = target === 'vue3' ? 60000 : 20000
    await page.goto(previewUrl.href, { waitUntil: 'domcontentloaded', timeout: navTimeout })
    const timeoutMs = target === 'vue3' ? 60000 : 20000
    try {
      await page.waitForFunction(
        () => {
          const s = document.querySelector('.mc-preview-stage')
          const st = s?.getAttribute('data-preview-status')
          return st === 'ready' || st === 'load-error' || st === 'render-error'
        },
        { timeout: timeoutMs },
      )
    } catch { addBlock('RUNTIME-003', 'timeout', '预览未在时限内进入 ready/error 状态', { timeoutMs }) }

    const state = await page.evaluate(() => {
      const s = document.querySelector('.mc-preview-stage')
      const status = s?.getAttribute('data-preview-status') || 'missing'
      const err = document.querySelector('.mc-preview-error-card')?.textContent?.trim() || ''
      const r = s?.getBoundingClientRect()
      return { status, err, w: r?.width || 0, h: r?.height || 0 }
    })
    if (state.status !== 'ready') addBlock('RUNTIME-004', 'preview-status', `预览状态=${state.status} ${state.err}`, state)
    if (state.w <= 1 || state.h <= 1) addBlock('RUNTIME-005', 'layout', '预览根容器尺寸为空', state)

    const shotDir = join(backendRoot, 'scripts', 'eval-reports', 'shots')
    mkdirSync(shotDir, { recursive: true })
    const shotPath = join(shotDir, `${componentId}.png`)
    const stage = await page.$('.mc-preview-stage')
    if (stage) await stage.screenshot({ path: shotPath, omitBackground: false })
    else await page.screenshot({ path: shotPath, fullPage: false })

    if (responseErrors.length) addBlock('RUNTIME-007', 'http', '预览存在 HTTP 资源错误', { responseErrors: responseErrors.slice(0, 10) })
    if (pageErrors.length) addBlock('RUNTIME-009', 'pageerror', '预览触发未捕获异常', { pageErrors: pageErrors.slice(0, 10) })
    if (consoleErrors.length) addBlock('RUNTIME-010', 'console', '预览输出 console.error', { consoleErrors: consoleErrors.slice(0, 10) })

    return { renderedImage: shotPath, runtimeGate: { status: issues.length ? 'BLOCK' : 'PASS', issues } }
  } catch (e) {
    addBlock('RUNTIME-011', 'renderer', `截图失败: ${e.message}`)
    return { renderedImage: null, runtimeGate: { status: 'BLOCK', issues } }
  } finally {
    await page.close()
  }
}

function findDesignImage(dir) {
  const walk = (d, depth) => {
    if (depth > 3) return null
    let entries = []
    try {
      entries = readdirSync(d)
    } catch {
      return null
    }
    for (const e of entries) {
      if (/^source-.*\.png$/i.test(e)) return join(d, e)
      const full = join(d, e)
      try {
        if (statSync(full).isDirectory()) {
          const r = walk(full, depth + 1)
          if (r) return r
        }
      } catch {
        /* ignore */
      }
    }
    return null
  }
  return walk(dir, 0)
}

function discover() {
  if (manifestPath && existsSync(manifestPath)) {
    const list = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    return list
      .filter((c) => existsSync(join(c.outputPath, 'package', 'index.vue')) && findDesignImage(c.outputPath))
      .map((c) => ({ ...c, designImage: c.designImage || findDesignImage(c.outputPath) }))
  }
  const cases = []
  const mcRoot = join(frontendWorkspace, 'custom-components')
  const vueRoot = join(frontendWorkspace, 'vue3-components')

  if (targetFilter !== 'vue3' && existsSync(mcRoot)) {
    for (const id of readdirSync(mcRoot)) {
      const dir = join(mcRoot, id)
      if (!statSync(dir).isDirectory()) continue
      if (!existsSync(join(dir, 'package', 'index.vue'))) continue
      const design = findDesignImage(dir)
      if (!design) continue
      cases.push({ id, target: 'microcode', groupId: 'default-group', outputPath: dir, designImage: design })
    }
  }
  if (targetFilter !== 'microcode' && existsSync(vueRoot)) {
    for (const gid of readdirSync(vueRoot)) {
      const gdir = join(vueRoot, gid)
      if (!statSync(gdir).isDirectory()) continue
      for (const id of readdirSync(gdir)) {
        const dir = join(gdir, id)
        if (!statSync(dir).isDirectory()) continue
        if (!existsSync(join(dir, 'package', 'index.vue'))) continue
        const design = findDesignImage(dir)
        if (!design) continue
        cases.push({ id, target: 'vue3', groupId: gid, outputPath: dir, designImage: design })
      }
    }
  }
  return cases
}

/**
 * 中性临时源：把组件复制到一个既不等于 backend/workspace 也不等于 frontend/workspace 的位置，
 * 避免 publishQualityPreview 的 capturePreviewBaseline 把"复制源"误 rename 走（outputPath 与 targetPath 重合的边界 bug）。
 * 仅在 --publish 时调用。
 */
function materializeNeutralSource(outputPath, id) {
  const stagingRoot = join(backendRoot, 'scripts', 'eval-staging')
  const neutral = join(stagingRoot, id)
  mkdirSync(neutral, { recursive: true })
  cpSync(outputPath, neutral, { recursive: true, force: true })
  return neutral
}

function csvEscape(v) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function main() {
  const mark = (s) => writeFileSync('/tmp/eval-marker.txt', `${new Date().toISOString()} ${s}\n`, { flag: 'a' })
  writeFileSync('/tmp/eval-marker.txt', '')
  mark('main-start')
  const cases = discover()
  mark('discovered:' + cases.length)
  if (limit > 0) cases.length = Math.min(cases.length, limit)
  console.log(`\n发现回归集：${cases.length} 个组件（filter=${targetFilter}）`)
  if (cases.length === 0) {
    console.log('未找到任何含 source-*.png + package/index.vue 的产物目录，退出。')
    return
  }

  const results = []
  let idx = 0
  for (const c of cases) {
    idx += 1
    const tag = `[${idx}/${cases.length}] ${c.target}/${c.id}`
    console.log(`\n${tag}`)
    try {
      if (publish) {
        // 从中性临时源发布，避开 outputPath 与 targetPath 重合导致源被 rename 走的边界 bug
        const { publishQualityPreview } = await import(join(dist, 'ai-engine/utils/workspace-preview-publisher.js'))
        const neutralSrc = materializeNeutralSource(c.outputPath, c.id)
        await publishQualityPreview({
          outputPath: neutralSrc,
          componentId: c.id,
          groupId: c.groupId,
          target: c.target,
        })
      } else {
        console.log(`  [skip-publish] 组件已在 frontend workspace 内，预览直接渲染（零副作用）`)
      }
      mark('before-render:' + c.id)
      const shot = await renderScreenshotLocal({
        componentId: c.id,
        groupId: c.groupId,
        target: c.target,
        onProgress: () => {},
      })
      mark('after-render:' + c.id + ' img=' + (shot.renderedImage || 'null'))

      let similarity = null
      let pass = null
      let compareIssues = []
      if (shot.renderedImage && !noCompare) {
        const { VisualComparator } = await import(join(dist, 'ai-engine/roles/visual-comparator.js'))
        const { resolveVisionConfig } = await import(join(dist, 'ai-engine/utils/ai-defaults.js'))
        const aiConfig = JSON.parse(readFileSync(join(backendRoot, 'data', 'ai-config.json'), 'utf-8'))
        const cmp = new VisualComparator(resolveVisionConfig(aiConfig))
        const report = await Promise.race([
          cmp.compare(c.designImage, shot.renderedImage, {}),
          new Promise((_, rej) => setTimeout(() => rej(new Error('vision 比对超时 240s')), 240_000)),
        ]).catch((e) => ({ overallSimilarity: 0, issues: [], pass: false, error: e.message, degraded: true }))
        similarity = report.overallSimilarity ?? 0
        pass = report.pass ?? false
        compareIssues = report.issues || []
        console.log(`  [compare] similarity=${similarity} pass=${pass} issues=${compareIssues.length}`)
      } else if (!shot.renderedImage) {
        console.log(`  [shot] 无渲染图（门禁=${shot.runtimeGate?.status}）`)
      }

      const gateIssues = (shot.runtimeGate?.issues || []).map((i) => `${i.id}:${i.message}`)
      const topIssues = compareIssues
        .slice(0, 3)
        .map((i) => `[${i.severity}]${i.category}:${i.description}`)

      results.push({
        id: c.id,
        target: c.target,
        groupId: c.groupId,
        renderedImage: shot.renderedImage || null,
        isStaticFallback: shot.isStaticFallback || false,
        gateStatus: shot.runtimeGate?.status || 'NONE',
        gateIssues: gateIssues.join(' | '),
        similarity,
        pass,
        compareIssueCount: compareIssues.length,
        topIssues: topIssues.join(' | '),
        designImage: c.designImage,
      })
    } catch (e) {
      console.log(`  [ERROR] ${e.message}`)
      results.push({ id: c.id, target: c.target, groupId: c.groupId, error: e.message })
    }
  }

  // ── 报告 ──
  const scored = results.filter((r) => typeof r.similarity === 'number')
  const avg = scored.length ? Math.round(scored.reduce((s, r) => s + r.similarity, 0) / scored.length) : null
  const ge80 = scored.filter((r) => r.similarity >= 80).length
  const ge85 = scored.filter((r) => r.similarity >= 85).length
  const gateBlocked = results.filter((r) => r.gateStatus === 'BLOCK' || r.error)
  const failing = results.filter(
    (r) => r.error || r.gateStatus === 'BLOCK' || (typeof r.similarity === 'number' && r.similarity < 80),
  )

  // CSV
  const header = ['id', 'target', 'groupId', 'similarity', 'pass', 'gateStatus', 'gateIssues', 'compareIssueCount', 'topIssues', 'renderedImage', 'designImage', 'error']
  const rows = results.map((r) => header.map((k) => csvEscape(r[k])).join(','))
  const csv = [header.join(','), ...rows].join('\n')
  const csvPath = join(outDir, `eval-report-${ts}.csv`)
  writeFileSync(csvPath, csv, 'utf-8')

  const jsonPath = join(outDir, `eval-report-${ts}.json`)
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        summary: {
          total: results.length,
          scored: scored.length,
          avgSimilarity: avg,
          ge80: ge80,
          ge80Ratio: scored.length ? Math.round((ge80 / scored.length) * 100) : null,
          ge85: ge85,
          gateBlocked: gateBlocked.length,
          failing: failing.length,
          noCompare,
        },
        results,
      },
      null,
      2,
    ),
    'utf-8',
  )

  // 汇总打印
  console.log('\n================ 评测汇总 ================')
  console.log(`总组件数        : ${results.length}`)
  console.log(`已评分          : ${scored.length}`)
  console.log(`平均还原率      : ${avg == null ? 'N/A' : avg + '%'}`)
  console.log(`≥80% 占比       : ${scored.length ? ge80 + '/' + scored.length + ' (' + Math.round((ge80 / scored.length) * 100) + '%)' : 'N/A'}`)
  console.log(`≥85% 占比       : ${scored.length ? ge85 + '/' + scored.length + ' (' + Math.round((ge85 / scored.length) * 100) + '%)' : 'N/A'}`)
  console.log(`门禁 BLOCK/错误 : ${gateBlocked.length}`)
  console.log(`未达标(<80%)    : ${failing.length}`)
  if (failing.length) {
    console.log('\n--- 未达标清单 ---')
    for (const r of failing) {
      const sim = typeof r.similarity === 'number' ? r.similarity + '%' : 'N/A'
      console.log(`  • ${r.target}/${r.id}  sim=${sim} gate=${r.gateStatus || '-'}  ${r.error ? 'ERR:' + r.error : (r.topIssues || r.gateIssues || '')}`)
    }
  }
  console.log(`\n报告: ${csvPath}\n      ${jsonPath}`)
}

// 关闭本地浏览器单例，避免退出时残留 Chrome 子进程导致进程组被 SIGKILL（exit 137）
async function cleanup() {
  if (_browser) {
    try {
      await _browser.close()
    } catch {
      /* ignore */
    }
    _browser = null
  }
}

main()
  .catch((e) => {
    console.error('评测脚本异常:', e)
    process.exitCode = 1
  })
  .finally(cleanup)
