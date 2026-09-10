import { getIndexVueChunkBudgets, getMaxIndexVueChunkBudget } from './chunk-budget.js'

describe('getIndexVueChunkBudgets · 真实分块预算（容量门禁与下发共用）', () => {
  it('未拆分：template + script 两段，权重 0.1 / 0.3', () => {
    const chunks = getIndexVueChunkBudgets({ estTokens: 10000, scriptSplit: false })
    expect(chunks).toHaveLength(2)
    expect(chunks[0].segmentType).toBe('template')
    expect(chunks[1].segmentType).toBe('script')
    // 10% / 30%
    expect(chunks[0].estTokens).toBe(1000)
    expect(chunks[1].estTokens).toBe(3000)
  })

  it('scriptSplit：template + state/lifecycle/charts 三段 script，各占 0.3', () => {
    const chunks = getIndexVueChunkBudgets({ estTokens: 10000, scriptSplit: true })
    expect(chunks).toHaveLength(4)
    expect(chunks[0].segmentType).toBe('template')
    expect(chunks[1].scriptPart).toBe('state')
    expect(chunks[2].scriptPart).toBe('lifecycle')
    expect(chunks[3].scriptPart).toBe('charts')
    expect(chunks[1].estTokens).toBe(3000)
    expect(chunks[2].estTokens).toBe(3000)
    expect(chunks[3].estTokens).toBe(3000)
  })

  it('requestedMaxTokens = estTokens*1.2+1024（与 generateSingleChunk.dynamicMax 一致）', () => {
    const chunks = getIndexVueChunkBudgets({ estTokens: 10000, scriptSplit: false })
    const script = chunks.find((c) => c.segmentType === 'script')!
    expect(script.requestedMaxTokens).toBe(Math.ceil(3000 * 1.2 + 1024))
  })

  it('mc-max-1789036112943 实证：整组件 44860，max chunk 仍远小于 32768 → 不误杀', () => {
    const max = getMaxIndexVueChunkBudget({ estTokens: 44860, scriptSplit: false })
    expect(max.segmentType).toBe('script')
    expect(max.estTokens).toBe(Math.max(500, Math.round(44860 * 0.3)))
    expect(max.requestedMaxTokens).toBeLessThan(32768)
  })

  it('整组件超上限但仍可分块（script 0.3 后小于上限）→ 容量门禁用 max chunk 判定放行', () => {
    // 模拟一个脚本必须 40k 才会超限的模型（上限 32768）
    const max = getMaxIndexVueChunkBudget({ estTokens: 90000, scriptSplit: true })
    // 90000*0.3=27000 -> requested=27000*1.2+1024=33424 > 32768
    expect(max.requestedMaxTokens).toBeGreaterThan(32768)
    // 与 getIndexVueChunkBudgets 同源
    expect(getIndexVueChunkBudgets({ estTokens: 90000, scriptSplit: true }).length).toBe(4)
  })

  it('estTokens 缺失/非法 → 返回全 0 预算，不抛错', () => {
    const a = getIndexVueChunkBudgets({})
    const b = getMaxIndexVueChunkBudget({ estTokens: NaN })
    expect(a.every((c) => c.estTokens === 0 && c.requestedMaxTokens === 0)).toBe(true)
    expect(b.requestedMaxTokens).toBe(0)
  })
})
