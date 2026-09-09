/**
 * 视觉回归链路探针：发布 → 截图 → 比对
 *
 * 为什么单独做：max 档实跑一次 ~30min 且要烧 13 次 LLM，
 * 而「视觉分恒为 0」只涉及链路末端三步，拿已有产物复跑即可定位，
 * 只花一次 vision 调用。
 *
 * 用法：node src/ai-engine-v2/pipeline/__visual-probe.mjs <产物目录> [--no-publish]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const backendRoot = join(here, '..', '..', '..')
const dist = join(backendRoot, 'dist')

const outputPath = process.argv[2]
const skipPublish = process.argv.includes('--no-publish')
// 视觉比对要调 vision 模型，慢且可能挂起；只想确认预览页有没有渲染出组件时用 --no-compare，
// runtimeGate 的判定已经足够定位问题，不必等比对分数
const skipCompare = process.argv.includes('--no-compare')
if (!outputPath || !existsSync(outputPath)) {
  console.error(`产物目录不存在：${outputPath}`)
  process.exit(1)
}

const componentId = basename(outputPath)
const designImage = readdirSync(outputPath)
  .filter(f => /^source-.*\.png$/.test(f))
  .map(f => join(outputPath, f))[0]

if (!designImage) {
  console.error('产物目录内没有 source-*.png 设计原图')
  process.exit(1)
}

console.log(`组件 ${componentId}`)
console.log(`原图 ${designImage}\n`)

const { publishQualityPreview } = await import(join(dist, 'ai-engine/utils/workspace-preview-publisher.js'))
const { renderScreenshot } = await import(join(dist, 'ai-engine/roles/screenshot-renderer.js'))
const { VisualComparator } = await import(join(dist, 'ai-engine/roles/visual-comparator.js'))
const { resolveVisionConfig } = await import(join(dist, 'ai-engine/utils/ai-defaults.js'))

// ── 1. 发布到前端 workspace ──
if (!skipPublish) {
  const r = await publishQualityPreview({
    outputPath,
    componentId,
    groupId: 'default-group',
    target: 'microcode',
  })
  console.log(`[publish] 完成 ${JSON.stringify(r?.previewUrl || r || '')}`)
}
const wsDir = join(backendRoot, '..', 'frontend', 'workspace', 'custom-components', componentId)
console.log(`[publish] workspace 是否存在组件：${existsSync(wsDir)}`)

// ── 2. 截图 ──
const shot = await renderScreenshot({
  outputPath,
  sessionId: componentId,
  componentName: componentId,
  groupId: 'default-group',
  target: 'microcode',
  previewImage: designImage,
  hardGate: true,
  allowMissingAssetSelfHeal: true,
  onProgress: e => console.log(`  [shot] ${e.status} ${e.message}`),
})
console.log(`\n[screenshot] 静态降级=${shot.isStaticFallback} 门禁=${shot.runtimeGate?.status}`)
if (shot.renderedImage) {
  console.log(`[screenshot] ${shot.renderedImage} (${statSync(shot.renderedImage).size} bytes)`)
}
for (const i of shot.runtimeGate?.issues || []) {
  console.log(`  [gate] ${i.severity} ${i.id} ${i.message}`)
}

if (!shot.renderedImage || shot.isStaticFallback) {
  console.log('\n截图不可用，终止比对')
  process.exit(1)
}
if (skipCompare) {
  console.log('\n--no-compare：跳过视觉比对')
  process.exit(0)
}

// ── 3. 视觉比对 ──
const saved = JSON.parse(readFileSync(join(backendRoot, 'data', 'ai-config.json'), 'utf-8'))
// VisualComparator 把 config 原样交给 VisionAgent，不能再包一层 aiConfig
const visionConfig = resolveVisionConfig(saved)
console.log(`\n[vision] model=${visionConfig.model} hasKey=${Boolean(visionConfig.apiKey)} baseURL=${visionConfig.baseURL || '(default)'}`)
const cmp = new VisualComparator(visionConfig)
// vision 调用可能长时间挂起（探针里没有引擎的重试与超时兜底），加硬超时避免空等
const report = await Promise.race([
  cmp.compare(designImage, shot.renderedImage, {}),
  new Promise((_, rej) => setTimeout(() => rej(new Error('vision 比对超时 300s')), 300_000)),
])
console.log(`\n[compare] degraded=${report.degraded} similarity=${report.overallSimilarity} pass=${report.pass}`)
for (const i of report.issues || []) {
  console.log(`  [${i.severity}] ${i.category || ''} ${i.description || i.issue}`)
}
