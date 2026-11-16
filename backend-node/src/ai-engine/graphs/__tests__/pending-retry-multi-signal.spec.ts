/**
 * 🛡️ 落一回归锚（2026-11-16 · mc-max-1794783635302-7ec8fd72 实锤）：
 *   `_pendingRetryConsumed` 永不清零 ⇒ 同一任务内**第二个**重试信号（sfc-syntax-blocked）
 *   在条件边 `!state._pendingRetryConsumed` 处恒假 ⇒ 静默失效 ⇒ 坏 SFC 不重生成、
 *   整段丢失仍 completed。
 *
 * 真机 iteration 序列（复现依据）：
 *   eng(6) [acceptance 重试→闸=true] → eng(7) → val(8) → eng(9)
 *   [sfc return _pendingRetry] → ❌ val(10)（信号被吞）→ … → complete
 *
 * 修复：消费闸改「读后即清」——`_pendingRetryConsumed` 在消费后复位 false，
 * 每个新 `_pendingRetry` 信号各自有效一次。
 *
 * 用真实 Graph 引擎 + phase2 图同款条件边结构做行为级断言（不 mock 引擎）。
 */
// 🔴 已知坑（memory：archiver/backend-root）：graph.js 经 logger 传递依赖
//    config/backend-root.js（ESM __filename 重声明）⇒ 必须 jest.mock。
jest.mock('../../../config/backend-root.js', () => ({ logsDir: '/tmp', rootDir: '/tmp' }))
import { Graph } from '../graph.js'

describe('落一 · _pendingRetry 多信号消费（读后即清）', () => {
  it('第一个信号消费后，第二个信号（sfc-syntax-blocked）仍能触发回退（真机 iter9→10 场景）', async () => {
    const visits: string[] = []
    const g = new Graph({ name: 'repro-luo1' })
    g.addNode('microcode-engineer', async (state: any) => {
      visits.push('eng#' + (state.n = (state.n || 0) + 1))
      // 轮1：acceptance 可重试（返回值携带——与 phase2 :2334 同形态）
      if (state.n === 1) {
        return { _pendingRetry: true, _pendingRetryPolicyId: 'acceptance-fail' }
      }
      // 轮3：SFC 语法阻断（与 phase2 :2546 同形态：只写返回值）
      if (state.n === 3) {
        return { _pendingRetry: true, _pendingRetryPolicyId: 'sfc-syntax-blocked' }
      }
      return { done: true }
    })
    g.addNode('code-structure-validator', async (state: any) => {
      visits.push('val#' + (state.v = (state.v || 0) + 1))
      // val#1：判失败（真机 iter8 L0-B BLOCK → 回 eng）；val#2 起：放行
      return state.v === 1 ? { pass: false } : { pass: true }
    })
    g.addNode('complete', async () => ({ finished: true }))
    // 与 phase2 :6408 同款条件边（含修复后的读后即清）
    g.addConditionalEdge('microcode-engineer', (state: any) => {
      if (state._pendingRetry && !state._pendingRetryConsumed) {
        state._pendingRetry = false
        state._pendingRetryConsumed = false // 🛡️ 落一：读后即清（修复点）
        state._semanticRetryConsumed = true
        state._resourceRetryConsumed = true
        visits.push('cond→回eng(policy=' + state._pendingRetryPolicyId + ')')
        return 'microcode-engineer'
      }
      if (
        (state._semanticRetried && !state._semanticRetryConsumed) ||
        (state._resourceRetried && !state._resourceRetryConsumed)
      ) {
        return 'microcode-engineer'
      }
      return 'code-structure-validator'
    })
    // validator 条件边：判失败 → 回 eng（真机 L0-B 重试路径，重试计数限 1 次）
    g.addConditionalEdge('code-structure-validator', (state: any) => {
      if (state.pass === false && (state._vbRetry || 0) < 1) {
        state._vbRetry = (state._vbRetry || 0) + 1
        visits.push('val→回eng')
        return 'microcode-engineer'
      }
      return 'complete'
    })
    g.setEntry('microcode-engineer')

    const out: any = await g.run({})

    // 两个信号都被消费：eng 至少跑 4 轮（#1 信号→#2 正常→#3 信号→#4 正常）
    expect(visits.some((v) => v.includes('policy=acceptance-fail'))).toBe(true)
    expect(visits.some((v) => v.includes('policy=sfc-syntax-blocked'))).toBe(true)
    // 修复前：sfc 信号被吞 ⇒ visits 无 'policy=sfc-syntax-blocked' 且 eng#3 后直接 validator
    expect(out.finished).toBe(true)
  })

  it('同一信号不双跳：单次 _pendingRetry 只回退一次（防读后即清引入多余轮次）', async () => {
    const visits: string[] = []
    const g = new Graph({ name: 'repro-luo1-single' })
    g.addNode('microcode-engineer', async (state: any) => {
      state.n = (state.n || 0) + 1
      visits.push('eng#' + state.n)
      if (state.n === 1) {
        return { _pendingRetry: true, _pendingRetryPolicyId: 'acceptance-fail' }
      }
      return { done: true }
    })
    g.addNode('code-structure-validator', async () => ({ validated: true }))
    g.addNode('complete', async () => ({ finished: true }))
    g.addConditionalEdge('microcode-engineer', (state: any) => {
      if (state._pendingRetry && !state._pendingRetryConsumed) {
        state._pendingRetry = false
        state._pendingRetryConsumed = false
        visits.push('cond→回eng')
        return 'microcode-engineer'
      }
      return 'code-structure-validator'
    })
    g.addEdge('code-structure-validator', 'complete')
    g.setEntry('microcode-engineer')

    const out: any = await g.run({})
    // eng 恰好 2 轮（1 次信号 + 1 次正常），无多余回退
    expect(visits.filter((v) => v.startsWith('eng')).length).toBe(2)
    expect(visits.filter((v) => v === 'cond→回eng').length).toBe(1)
    expect(out.finished).toBe(true)
  })
})
