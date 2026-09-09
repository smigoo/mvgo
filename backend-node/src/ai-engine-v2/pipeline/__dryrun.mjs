/**
 * DAG 骨架干跑自检 —— 不调 LLM、不实例化 role，只验证配置解析链路
 * 运行：node src/ai-engine-v2/pipeline/__dryrun.mjs
 */
import { resolveSpec, loadSpecRegistry, listSpecIds } from '../specs/spec-registry.js'
import { resolveTier, listTiers } from './tier-profile.js'
import { resolvePipelineModels, auditCredentials, listConfigurableNodes } from './model-resolver.js'
import { dryRunNodes } from './node-registry.js'

console.log('=== 1. 档位列表（配置页数据）===')
console.table(listTiers())

console.log('=== 2. 档位拓扑自检 ===')
for (const t of ['lite', 'max']) {
  const p = resolveTier(t)
  console.log(`  ${t.padEnd(5)} 节点=${p.nodes.length} 边=${p.edges.length} 精修=${p.refineLoops}轮 视觉回归=${p.visualRegression} 预期LLM=${p.expectedLlmCalls}`)
}

console.log('\n=== 3. 非法档位应被拦截 ===')
try {
  resolveTier('turbo')
  console.log('  未拦截（异常）')
} catch (e) {
  console.log('  拦截 →', e.message)
}

console.log('\n=== 4. 拓扑覆盖校验应被拦截 ===')
try {
  resolveTier('lite', { edges: [['input-adapter', 'ghost-node']] })
  console.log('  未拦截（异常）')
} catch (e) {
  console.log('  拦截 →', e.message.split('\n')[1]?.trim() || e.message)
}

loadSpecRegistry()

console.log('\n=== 5. spec × tier 矩阵干跑 ===')
for (const specId of listSpecIds()) {
  const spec = resolveSpec(specId)
  for (const tierId of ['lite', 'max']) {
    const tier = resolveTier(tierId)
    const { table, llmCallCount, matchesExpected } = resolvePipelineModels({
      spec,
      tierProfile: tier,
      aiConfig: {}
    })
    const cred = auditCredentials(table)
    console.log(
      `  ${specId.padEnd(18)} ${tierId.padEnd(4)} LLM调用=${llmCallCount}/${tier.expectedLlmCalls} 一致=${matchesExpected} 凭证ok=${cred.ok}`
    )
  }
}

console.log('\n=== 6. lite 档节点明细（microcode）===')
{
  const spec = resolveSpec('microcode')
  const tier = resolveTier('lite')
  const { table } = resolvePipelineModels({ spec, tierProfile: tier, aiConfig: {} })
  console.table(dryRunNodes(tier, { spec, modelTable: table }))
}

console.log('=== 7. 同一档位换 spec，产物差异只在规范维度 ===')
{
  const tier = resolveTier('lite')
  for (const specId of ['microcode', 'vue3-js']) {
    const spec = resolveSpec(specId)
    const { table } = resolvePipelineModels({ spec, tierProfile: tier, aiConfig: {} })
    const rows = dryRunNodes(tier, { spec, modelTable: table })
    const eng = rows.find(r => r.nodeId === 'code-engineer')
    console.log(
      `  ${specId.padEnd(12)} engineer=${eng.impl.padEnd(20)} promptProp=${String(eng.promptProp).padEnd(12)} 文档=${eng.promptDocs}份/${eng.promptChars}字符`
    )
    console.log(
      `  ${''.padEnd(12)} 产物=${spec.artifacts.entryFile} + [${spec.artifacts.extraFiles.join(', ') || '无'}] 绑定=${spec.binding.mode} 外壳剥离=${spec.panel.stripOuterShell}`
    )
  }
}

console.log('\n=== 8. 模型四级优先级 ===')
{
  const spec = resolveSpec('microcode')
  const tier = resolveTier('max')
  const { table } = resolvePipelineModels({
    spec,
    tierProfile: tier,
    modelOverrides: { 'code-engineer': 'gpt-5-turbo' },
    aiConfig: { textAIConfig: { model: 'claude-from-request' } }
  })
  for (const n of ['visual-parser', 'code-engineer', 'adversarial-checker', 'layout-reviewer']) {
    const e = table[n]
    console.log(`  ${n.padEnd(22)} ${String(e.model).padEnd(22)} 来源=${e.source.padEnd(9)} 通道=${e.channel}`)
  }
}

console.log('\n=== 9. 配置页可配节点（lite vs max）===')
for (const t of ['lite', 'max']) {
  const tier = resolveTier(t)
  console.log(`  ${t}:`, listConfigurableNodes(tier).map(n => `${n.nodeId}(${n.channel})`).join(', '))
}
