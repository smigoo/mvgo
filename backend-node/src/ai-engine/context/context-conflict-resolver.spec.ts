import { resolveContextConflicts } from './context-conflict-resolver.js'
import {
  evaluateVisualTrustVerdict,
  VISUAL_VERDICT_VALUES,
} from '../utils/visual-trust.js'

/**
 * 契约同步回归测试：low-coverage verdict 必须被 resolver 消费。
 *
 * 背景：2026-09-02 事故 mc-max-1788306653919-a57e4409（设备监测）——
 * visual-trust.js 2026-08-30 P2-1 新增了 low-coverage（覆盖率 <40%）verdict，
 * 但 context-conflict-resolver.js 的判定链只处理 blocked/conflict/warning，
 * 漏接 low-coverage → 23% 覆盖率的幻觉 vision（监控→挖掘机、3740→740）被当成
 * trusted 放行，进入代码生成。
 */

const va = (rate: number) => ({
  coverageReport: { coverageRate: rate, recognizedSections: 5, recognizedCharts: 0 },
})

describe('evaluateVisualTrustVerdict 覆盖率分级', () => {
  it('覆盖率 <40% → low-coverage', () => {
    expect(evaluateVisualTrustVerdict(va(23)).verdict).toBe('low-coverage')
  })
  it('覆盖率 40-60% → warning', () => {
    expect(evaluateVisualTrustVerdict(va(50)).verdict).toBe('warning')
  })
  it('覆盖率 >=60% → trusted', () => {
    expect(evaluateVisualTrustVerdict(va(88)).verdict).toBe('trusted')
  })
})

describe('resolveContextConflicts 契约同步（low-coverage 不漏接）', () => {
  it('low-coverage（23%）→ level=restricted（修复前恒 trusted）', () => {
    const res = resolveContextConflicts({ visualAnalysis: va(23) })
    expect(res.trustVerdict.level).toBe('restricted')
    expect(res.trustVerdict.reasons.length).toBeGreaterThan(0)
  })

  it('low-coverage → restrictions 非空（启用降级限制）', () => {
    const res = resolveContextConflicts({ visualAnalysis: va(23) })
    expect(res.trustVerdict.restrictions.length).toBeGreaterThan(0)
  })

  it('warning（50%）→ level=restricted（既有行为不回归）', () => {
    const res = resolveContextConflicts({ visualAnalysis: va(50) })
    expect(res.trustVerdict.level).toBe('restricted')
  })

  it('trusted（88%）→ level=trusted、restrictions 空', () => {
    const res = resolveContextConflicts({ visualAnalysis: va(88) })
    expect(res.trustVerdict.level).toBe('trusted')
    expect(res.trustVerdict.restrictions).toHaveLength(0)
  })
})

describe('verdict 枚举穷举（契约漂移治理：新增 verdict 忘接即红）', () => {
  // 每个 verdict 值都必须能由 evaluateVisualTrustVerdict 产出，且 resolver 有显式 level 映射。
  // 若未来给 VISUAL_VERDICTS 新增一个值却没在此登记「构造器 + 期望 level」，本测试直接失败。
  const VERDICT_CASES: Array<{
    verdict: string
    makeAnalysis: () => any
    expectLevel: string
  }> = [
    {
      verdict: 'blocked',
      makeAnalysis: () => null,
      expectLevel: 'blocked',
    },
    {
      verdict: 'conflict',
      makeAnalysis: () => ({
        coverageReport: { coverageRate: 0 },
        layoutStructure: { sections: [{}] },
        charts: [],
      }),
      expectLevel: 'blocked',
    },
    {
      verdict: 'low-coverage',
      makeAnalysis: () => va(23),
      expectLevel: 'restricted',
    },
    {
      verdict: 'warning',
      makeAnalysis: () => va(50),
      expectLevel: 'restricted',
    },
    {
      verdict: 'trusted',
      makeAnalysis: () => va(88),
      expectLevel: 'trusted',
    },
  ]

  it('枚举值与用例一一对应（无遗漏、无多余）', () => {
    const enumSet = [...VISUAL_VERDICT_VALUES].sort()
    const caseSet = VERDICT_CASES.map((c) => c.verdict).sort()
    expect(caseSet).toEqual(enumSet)
  })

  it.each(VERDICT_CASES)(
    'verdict=$verdict 映射为 $expectLevel',
    ({ verdict, makeAnalysis, expectLevel }) => {
      const vaRes = evaluateVisualTrustVerdict(makeAnalysis())
      expect(vaRes.verdict).toBe(verdict)
      const res = resolveContextConflicts({ visualAnalysis: makeAnalysis() })
      expect(res.trustVerdict.level).toBe(expectLevel)
    },
  )
})
