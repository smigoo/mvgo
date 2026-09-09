/**
 * ConfigurablePipeline 自检 —— 不调 LLM，验证编排逻辑
 * 运行：node src/ai-engine-v2/pipeline/__pipeline-verify.mjs
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ConfigurablePipeline, buildExecutionPlan } from './configurable-pipeline.js'
import { resolveTier } from './tier-profile.js'
import { loadSpecRegistry } from '../specs/spec-registry.js'
import { screenshotAdapter } from './input-adapters/screenshot-adapter.js'
import { parseFigmaUrl } from './input-adapters/figma-adapter.js'

loadSpecRegistry()

console.log('=== 1. 执行计划线性化 ===')
for (const t of ['lite', 'max']) {
  const plan = buildExecutionPlan(resolveTier(t))
  const rendered = plan
    .map(s => (s.type === 'parallel' ? `[${s.nodes.join(' ∥ ')}]` : s.type === 'conditional' ? `<${s.node}>` : s.node))
    .join(' → ')
  console.log(`  ${t.padEnd(5)} (${plan.length} 步) ${rendered}`)
}

console.log('\n=== 2. 配置页预览：spec × tier 矩阵 ===')
for (const specId of ['microcode', 'vue3-js']) {
  for (const tier of ['lite', 'max']) {
    const p = new ConfigurablePipeline({ spec: specId, tier, sourceType: 'screenshot' })
    const v = p.preview()
    console.log(
      `  ${specId.padEnd(10)} ${tier.padEnd(4)} LLM=${v.llmCallCount} 产物=${v.artifacts.entryFile}${v.artifacts.extraFiles.length ? '+' + v.artifacts.extraFiles.length + '个' : ''} 凭证ok=${v.credentialsOk} 步数=${v.steps.length}`
    )
  }
}

console.log('\n=== 3. 同一张截图，只换 spec → 产物结构差异 ===')
for (const specId of ['microcode', 'vue3-js', 'example-team-vue3']) {
  const v = new ConfigurablePipeline({ spec: specId, tier: 'lite' }).preview()
  const eng = v.nodes.find(n => n.nodeId === 'code-engineer')
  console.log(
    `  ${specId.padEnd(18)} ${eng.impl.padEnd(18)} 产物=[${[v.artifacts.entryFile, ...v.artifacts.extraFiles].join(', ')}] 样式=${v.artifacts.styleExt} prompt=${eng.promptDocs}份`
  )
}

console.log('\n=== 4. 节点级模型覆盖生效 ===')
{
  const v = new ConfigurablePipeline({
    spec: 'microcode',
    tier: 'max',
    modelOverrides: { 'code-engineer': 'gpt-5', 'visual-parser': 'gemini-3-vision' }
  }).preview()
  v.nodes
    .filter(n => n.callsLlm)
    .forEach(n => console.log(`  ${n.nodeId.padEnd(22)} ${String(n.model).padEnd(20)} ← ${n.modelSource}`))
}

console.log('\n=== 5. 缺凭证时执行应被拦截（而非跑到一半才炸）===')
try {
  const p = new ConfigurablePipeline({ spec: 'microcode', tier: 'lite' })
  await p.execute({ screenshot: 'x' })
  console.log('  未拦截（异常）')
} catch (e) {
  console.log('  拦截 →', e.message.split('\n')[0])
}

console.log('\n=== 6. 非法配置拦截 ===')
for (const [desc, cfg] of [
  ['未知规范', { spec: 'svelte', tier: 'lite' }],
  ['未知档位', { spec: 'microcode', tier: 'turbo' }],
  ['未知来源', { spec: 'microcode', tier: 'lite', sourceType: 'pdf' }]
]) {
  try {
    const p = new ConfigurablePipeline(cfg)
    p.prepare()
    if (cfg.sourceType) {
      const { resolveInputAdapter } = await import('./input-adapters/index.js')
      resolveInputAdapter(cfg.sourceType)
    }
    console.log(`  ${desc.padEnd(10)} 未拦截（异常）`)
  } catch (e) {
    console.log(`  ${desc.padEnd(10)} 拦截 → ${e.message.split('\n')[0].slice(0, 60)}`)
  }
}

console.log('\n=== 7. 截图适配器：三种输入形态归一 ===')
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-ir-'))
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  const filePath = path.join(dir, 'in.png')
  fs.writeFileSync(filePath, png)

  const forms = [
    ['Buffer', png],
    ['本地路径', filePath],
    ['data-url', `data:image/png;base64,${png.toString('base64')}`]
  ]
  for (const [desc, input] of forms) {
    const ir = await screenshotAdapter({ screenshot: input, workspaceDir: dir, componentName: 'demo' })
    console.log(`  ${desc.padEnd(10)} → hash=${ir.meta.hash} ${ir.meta.bytes}B sourceType=${ir.sourceType}`)
  }

  try {
    await screenshotAdapter({ screenshot: null, workspaceDir: dir })
  } catch (e) {
    console.log('  空输入     → 拦截:', e.message)
  }
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('\n=== 8. Figma URL 解析（node-id 连字符转冒号）===')
for (const url of [
  'https://www.figma.com/design/abc123XYZ/MyFile?node-id=1-234',
  'https://www.figma.com/file/Key9876/Proj?node-id=45-6789&t=xyz'
]) {
  const r = parseFigmaUrl(url)
  console.log(`  fileKey=${r.fileKey.padEnd(12)} nodeId=${r.nodeId}`)
}
try {
  parseFigmaUrl('https://example.com/foo')
} catch (e) {
  console.log('  非 Figma URL → 拦截:', e.message)
}
