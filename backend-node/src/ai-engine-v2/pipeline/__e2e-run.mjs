/**
 * v2 可配管线端到端实跑器（会真实调用 LLM，会产生费用）
 *
 * 为什么不走 HTTP：Nest 层（DTO / 守卫 / SSE 接线）在 lite 档已验证过，
 * 这里要压的是引擎本身。直连引擎能少一层网络与鉴权噪音，失败栈也更短。
 *
 * 必须跑 dist：role 的 .js 会 import config/backend-root.js，
 * 该文件由 .ts 编译产生，src 目录下并不存在。
 *
 * 用法：
 *   node src/ai-engine-v2/pipeline/__e2e-run.mjs --tier max --spec microcode \
 *        --image <截图路径> [--name Demo] [--dry]
 */
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// 截图渲染的前端候选地址里，线上 https://go.microvideo.cn 排在本地 2610 之前
// （见 screenshot-renderer.js getFrontendCandidates）。本地不显式指定就会打到线上，
// 而刚发布的组件只存在于本机 workspace —— 线上返回 500，截出来的是错误页，
// 视觉比对随即给出毫无意义的 0 分。本地实跑必须钉死本地预览服务。
if (!process.env.MC_PREVIEW_BASE_URL) {
  process.env.MC_PREVIEW_BASE_URL = 'http://127.0.0.1:2610'
}

const here = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(here, '..', '..', '..')
const distPipeline = join(backendRoot, 'dist', 'ai-engine-v2', 'pipeline')

if (!existsSync(join(distPipeline, 'configurable-pipeline.js'))) {
  console.error('未找到 dist 产物，请先 npm run build')
  process.exit(1)
}

const argv = process.argv.slice(2)
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : d
}
const has = k => argv.includes(`--${k}`)

const specId = arg('spec', 'microcode')
const tier = arg('tier', 'lite')
const image = arg('image')
const dryRun = has('dry')

const { ConfigurablePipeline } = await import(join(distPipeline, 'configurable-pipeline.js'))
const { loadSpecRegistry } = await import(join(backendRoot, 'dist/ai-engine-v2/specs/spec-registry.js'))
const { resolveVisionConfig, resolveTextConfig } = await import(
  join(backendRoot, 'dist/ai-engine/utils/ai-defaults.js')
)

loadSpecRegistry({ includeUser: true })

const saved = JSON.parse(readFileSync(join(backendRoot, 'data', 'ai-config.json'), 'utf-8'))
const aiConfig = {
  visionAIConfig: resolveVisionConfig(saved),
  textAIConfig: resolveTextConfig(saved),
}

const sessionId = `v2-e2e-${specId}-${tier}-${Date.now()}`
const componentName = arg('name', 'E2eDemo')
const outputPath = join(backendRoot, '..', 'temp-components', 'default-group', sessionId)

const t0 = Date.now()
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`.padStart(7)

const pipeline = new ConfigurablePipeline({
  spec: specId,
  tier,
  sourceType: 'screenshot',
  aiConfig,
  sessionId,
  workspaceDir: outputPath,
  onProgress: e => console.log(`[${stamp()}] ${String(e.status).padEnd(9)} ${e.stage} — ${e.message}`),
})

const view = pipeline.preview()
console.log(`规范 ${view.spec.label} / 档位 ${view.tier.label} / LLM ${view.llmCallCount} 次 / 凭证 ${view.credentialsOk}`)
console.log(`步骤 ${view.steps.join(' → ')}\n`)
for (const n of view.nodes.filter(n => n.callsLlm)) {
  console.log(`  ${n.nodeId.padEnd(22)} ${String(n.model).padEnd(18)} ← ${n.modelSource}`)
}

if (dryRun) process.exit(0)

if (!image || !existsSync(image)) {
  console.error(`\n缺少有效 --image（收到：${image}）`)
  process.exit(1)
}

mkdirSync(outputPath, { recursive: true })
console.log(`\n输出目录 ${outputPath}\n${'='.repeat(80)}`)

try {
  const result = await pipeline.execute({ screenshot: image, componentName })

  console.log(`\n${'='.repeat(80)}\n完成，用时 ${(result.durationMs / 1000).toFixed(1)}s`)
  console.log(`质量 文本=${result.quality.textScore} 视觉=${result.quality.visualScore} 合并=${result.quality.mergedScore} 修订=${result.quality.revisions} 轮`)
  console.log(`决策 ${result.quality.decisionReason}`)

  console.log('\n节点轨迹:')
  for (const t of result.trace) {
    const flag = t.skipped ? `跳过（${t.skipped}）` : t.tolerated ? `降级（${t.error}）` : t.ok ? '' : `失败（${t.error}）`
    console.log(`  ${t.nodeId.padEnd(24)} ${((t.durationMs || 0) / 1000).toFixed(1).padStart(6)}s  ${flag}`)
  }

  console.log(`\n产物（${Object.keys(result.artifacts?.files || {}).length} 个声明 + ${result.artifacts?.undeclaredFiles?.length || 0} 个未声明）:`)
  for (const [f, c] of Object.entries(result.artifacts?.files || {})) {
    console.log(`  ${f.padEnd(30)} ${String(c).length} 字符`)
  }

  console.log(`\n告警 ${result.warnings.length} 条:`)
  result.warnings.forEach(w => console.log(`  - ${w}`))

  const shot = join(outputPath, '.mc-gen', 'screenshots', `${sessionId}-rendered.png`)
  console.log(`\n渲染截图 ${existsSync(shot) ? `${shot}（${statSync(shot).size}B）` : '未生成'}`)
} catch (e) {
  console.error(`\n失败于节点 ${e.nodeId || '未知'}：${e.message}`)
  if (e.trace) for (const t of e.trace) console.error(`  ${t.nodeId} ok=${t.ok} ${t.error || ''}`)
  process.exit(1)
}
