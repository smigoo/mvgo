/**
 * 验证 2026-08-27 #271 模型优先级修复（provider-pool）
 * 运行：node scripts/verify-provider-priority.mjs
 *
 * 覆盖：
 *   [1] 同故障域排除：exclude deepseek-v4-pro 时连 deepseek-v4-flash（同一 host）一起排除
 *   [2] 动态权重：290s 失败样本把 deepseek 权重压到 0.15，pick 统计应高度偏向 gpt-5.5
 *   [3] 冷却窗口：recordTimeout 后 180s 内 pick 排除该 provider；清除记录后恢复
 *   [4] 空串熔断：breaker.recordFailure ×2 → open → pick 跳过该 provider
 */
import poolModule from '../dist/ai-engine/utils/provider-pool.js'
const { ProviderPool } = poolModule

let pass = 0
let fail = 0
const t = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

const DEEP = 'https://api.deepseek.com/v1'
const NEWCLI = 'https://code.newcli.com/codex/v1'
const mk = (id, baseURL, model) => ({
  id, name: model, apiKey: 'k', baseURL, model, providerType: 'openai-compatible',
  role: 'text', rpm: 0, tpm: 0, weight: 10,
})

const pool = new ProviderPool()
pool.setProviders(
  [
    mk('deep-pro', DEEP, 'deepseek-v4-pro'),
    mk('deep-flash', DEEP, 'deepseek-v4-flash'),
    mk('gpt55', NEWCLI, 'gpt-5.5'),
  ],
  { failureThreshold: 2, cooldownMs: 120000 },
  { role: 'text', pickStrategy: 'weighted-spread' },
)

// ─────────────────────────────────────────────────────────────
console.log('\n[1] 同故障域排除（同一 baseURL host 一起避开）')
pool._latency.clear()
pool._recentTimeouts.clear()
pool.recordTimeout('deep-pro')
let got = new Set()
for (let i = 0; i < 60; i++) {
  const p = pool.pick('text', { excludeIds: ['deep-pro'] })
  if (p) got.add(p.id)
}
t('exclude deep-pro 后 60 次全部落在 gpt55（同域 deep-flash 被排除）',
  got.size === 1 && got.has('gpt55'), [...got].join(','))
pool._recentTimeouts.clear()

// ─────────────────────────────────────────────────────────────
console.log('\n[2] 动态权重：290s 失败样本把 deepseek 压到边缘')
pool._latency.clear()
pool._recentTimeouts.clear()
pool.recordLatency('deep-pro', 290000, false)
pool.recordLatency('deep-pro', 290000, false)
pool.recordLatency('deep-flash', 290000, false)
pool.recordLatency('deep-flash', 290000, false)
const wDeep = pool._weightOf(pool.get('deep-pro'))
const wFlash = pool._weightOf(pool.get('deep-flash'))
const wGpt = pool._weightOf(pool.get('gpt55'))
t(`deepseek 权重被压低（deep-pro=${wDeep.toFixed(2)}, gpt55=${wGpt.toFixed(2)}）`, wDeep < wGpt * 0.2)
t('gpt55 无样本保持 baseWeight', Math.abs(wGpt - 10) < 1e-9, wGpt)

// 统计 pick 分布（带降权后应高度偏向 gpt55）
const dist = { 'deep-pro': 0, 'deep-flash': 0, gpt55: 0 }
for (let i = 0; i < 300; i++) {
  const p = pool.pick('text')
  if (p) dist[p.id]++
}
const gptRatio = dist.gpt55 / 300
t(`300 次 pick 中 gpt55 占比 ${(gptRatio * 100).toFixed(0)}%（应 ≥ 85%）`, gptRatio >= 0.85, JSON.stringify(dist))
pool._latency.clear()

// ─────────────────────────────────────────────────────────────
console.log('\n[3] 冷却窗口：recordTimeout 后 180s 内排除，清除后恢复')
pool._recentTimeouts.clear()
pool.recordTimeout('gpt55')
let seen = new Set()
for (let i = 0; i < 40; i++) { const p = pool.pick('text'); if (p) seen.add(p.id) }
t('冷却期内 pick 不再选 gpt55', !seen.has('gpt55'), [...seen].join(','))
t('冷却期剩余时间 > 100s（窗口已提升到 180s）',
  (pool._recentTimeouts.get('gpt55') && (pool.timeoutMemoryMs - (Date.now() - pool._recentTimeouts.get('gpt55'))) > 100000))
pool._recentTimeouts.delete('gpt55')
let seen2 = new Set()
for (let i = 0; i < 40; i++) { const p = pool.pick('text'); if (p) seen2.add(p.id) }
t('清除超时记录后恢复可选', seen2.has('gpt55'), [...seen2].join(','))

// ─────────────────────────────────────────────────────────────
console.log('\n[4] 空串熔断：2 次 recordFailure → open → pick 跳过')
pool._recentTimeouts.clear()
pool._latency.clear()
pool.get('deep-flash').breaker.recordFailure()
t('1 次失败仍 closed', pool.get('deep-flash').breaker.state !== 'open')
pool.get('deep-flash').breaker.recordFailure()
t('2 次失败 → open', pool.get('deep-flash').breaker.state === 'open')
let seen3 = new Set()
for (let i = 0; i < 60; i++) { const p = pool.pick('text'); if (p) seen3.add(p.id) }
t('熔断 open 后 pick 不再选 deep-flash', !seen3.has('deep-flash'), [...seen3].join(','))
t('熔断 open 后仍能选到其他健康 provider', seen3.has('gpt55') || seen3.has('deep-pro'), [...seen3].join(','))

// ─────────────────────────────────────────────────────────────
console.log('\n[5] 网关层空内容当失败：treatEmptyAsFailure → MODEL_EMPTY_OUTPUT → 重试')
import { executeModelRequest } from '../dist/ai-engine/utils/ai-request-gateway.js'
let calls = 0
const emptyThenOk = await executeModelRequest({
  context: 'verify-empty',
  treatEmptyAsFailure: true,
  requestMaxRetries: 1,
  requestTimeoutMs: 15000,
  requestQueueTimeoutMs: 8000,
  requestConcurrency: 4,
  operation: async () => {
    calls++
    if (calls === 1) return { content: '' }   // 第一次空串 → 网关判失败
    return { content: 'ok' }                    // 第二次成功
  },
})
t('空串触发网关重试（operation 调用 2 次）', calls === 2, `calls=${calls}`)
t('重试后拿到有效内容', emptyThenOk?.content === 'ok', JSON.stringify(emptyThenOk).slice(0, 80))

// 关闭 treatEmptyAsFailure 时空串不被判失败（向后兼容）
let calls2 = 0
const passThrough = await executeModelRequest({
  context: 'verify-empty-off',
  requestMaxRetries: 0,
  requestTimeoutMs: 15000,
  requestQueueTimeoutMs: 8000,
  requestConcurrency: 4,
  operation: async () => { calls2++; return { content: '' } },
})
t('treatEmptyAsFailure 关闭时透传空串（兼容）', calls2 === 1 && passThrough?.content === '', `calls=${calls2}`)

// ─────────────────────────────────────────────────────────────
console.log('\n[6] 延迟画像持久化：重启后冷启动即有优先级')
import fs from 'node:fs'
// 先清掉可能存在的真实 stats 文件，避免干扰
const statsFile = '/Users/smigoo/工作/mvgo/backend-node/data/ai-provider-stats.json'
try { fs.rmSync(statsFile, { force: true }) } catch { /* ignore */ }

const poolA = new ProviderPool()
poolA.recordLatency('deep-pro', 290000, false)
poolA.recordLatency('deep-pro', 290000, false)
poolA.recordLatency('gpt55', 8000, true)
poolA._persistStats() // 手动立即落盘
t('画像已持久化到磁盘', fs.existsSync(statsFile), statsFile)

const poolB = new ProviderPool() // 模拟重启：新实例加载画像
const wDeepB = poolB._weightOf({ id: 'deep-pro', weight: 10 })
const wGptB = poolB._weightOf({ id: 'gpt55', weight: 10 })
t(`重启后 deepseek 仍被降权（w=${wDeepB.toFixed(2)} vs gpt55=${wGptB.toFixed(2)}）`, wDeepB < wGptB * 0.2, `${wDeepB} vs ${wGptB}`)
t('重启后快模型保持高权重', Math.abs(wGptB - 10) < 1e-9, wGptB)
try { fs.rmSync(statsFile, { force: true }) } catch { /* 清理测试产物 */ }

// ─────────────────────────────────────────────────────────────
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
