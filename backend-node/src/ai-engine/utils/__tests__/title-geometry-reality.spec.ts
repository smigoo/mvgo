/**
 * 🛡️ 2026-11-15 · RUNTIME-018 标题行几何判据阴阳对照
 *
 * 真机三阶段（mc-max-1794710719020-d8887ee9，Puppeteer 只读探针）：
 *   A 原状            leftGap=344 / groupWidth=403 → BLOCK
 *   B 仅剥内层同名类  leftGap=11  / groupWidth=66  → PASS
 *   C 仅删空 icon 槽  leftGap=4   / groupWidth=403 → PASS
 * 两条互不相同的修法都放行 ⇒ 判的是几何事实，不是「类名相同」。
 */
import {
  evaluateTitleGeometryReality,
  DISTRIBUTED_JUSTIFY,
  LEFT_GAP_RATIO,
} from '../title-geometry-reality.js'

const group = (over: Record<string, unknown> = {}) => ({
  el: 'div.c-traffic-monitor-header.c-traffic-monitor-forecast-title-wrap',
  justify: 'space-between',
  groupWidth: 403,
  leftGap: 344,
  emptyChildren: 1,
  titleText: '流量预测',
  ...over,
})

const probes = (groups: unknown) => ({ titleGroups: groups })

describe('evaluateTitleGeometryReality（RUNTIME-018 单一判据）', () => {
  it('A 破损态：文字被 space-between 推到右半区 ⇒ BLOCK', () => {
    const r = evaluateTitleGeometryReality(probes([group()]))
    expect(r.verdict).toBe('block')
    expect(r.shouldBlock).toBe(true)
    expect(r.evaluated).toBe(1)
    expect(r.distributed).toBe(1)
    expect(r.bad).toHaveLength(1)
    expect(r.bad[0].ratio).toBeCloseTo(0.854, 2)
    expect(r.bad[0].titleText).toBe('流量预测')
  })

  it('B 修法（剥内层分布类）⇒ PASS，零误伤', () => {
    const r = evaluateTitleGeometryReality(probes([group({ groupWidth: 66, leftGap: 11 })]))
    expect(r.verdict).toBe('pass')
    expect(r.shouldBlock).toBe(false)
    expect(r.bad).toHaveLength(0)
  })

  it('C 修法（删空 icon 槽）⇒ PASS，零误伤', () => {
    const r = evaluateTitleGeometryReality(probes([group({ leftGap: 4 })]))
    expect(r.verdict).toBe('pass')
    expect(r.shouldBlock).toBe(false)
  })

  it('正常标题组（flex-start）不判，distributed=0', () => {
    const r = evaluateTitleGeometryReality(probes([group({ justify: 'flex-start' })]))
    expect(r.verdict).toBe('pass')
    expect(r.distributed).toBe(0)
    expect(r.shouldBlock).toBe(false)
  })

  it.each(['space-around', 'space-evenly'])('%s 同样属于分布语义 ⇒ 命中', (justify) => {
    const r = evaluateTitleGeometryReality(probes([group({ justify })]))
    expect(r.verdict).toBe('block')
  })

  it('阈值边界：比例恰等于 0.5 ⇒ 不判（严格大于）', () => {
    const r = evaluateTitleGeometryReality(probes([group({ groupWidth: 100, leftGap: 50 })]))
    expect(r.verdict).toBe('pass')
    expect(r.distributed).toBe(1)
  })

  it('阈值边界：略超 0.5 ⇒ 命中', () => {
    const r = evaluateTitleGeometryReality(probes([group({ groupWidth: 100, leftGap: 50.1 })]))
    expect(r.verdict).toBe('block')
  })

  it.each([
    ['groupWidth=0', { groupWidth: 0 }],
    ['leftGap 缺失', { leftGap: undefined }],
    ['leftGap 非数字', { leftGap: 'oops' }],
    ['groupWidth 非数字', { groupWidth: null }],
  ])('证据不可用（%s）⇒ 不命中，不误伤', (_label, over) => {
    const r = evaluateTitleGeometryReality(probes([group(over)]))
    expect(r.shouldBlock).toBe(false)
    expect(r.distributed).toBe(0)
  })

  it.each([
    ['renderProbes=null', null],
    ['renderProbes={}', {}],
    ['titleGroups 非数组', probes('oops')],
    ['titleGroups=null', probes(null)],
    ['titleGroups 空数组', probes([])],
  ])('缺证据（%s）⇒ no-evidence fail-open', (_label, input) => {
    const r = evaluateTitleGeometryReality(input as any)
    expect(r.verdict).toBe('no-evidence')
    expect(r.evaluated).toBe(0)
    expect(r.shouldBlock).toBe(false)
    expect(r.bad).toEqual([])
  })

  it('多组混合：仅坏组进 bad，好组零误伤', () => {
    const r = evaluateTitleGeometryReality(
      probes([group({ titleText: '今日累计', leftGap: 4 }), group(), group({ justify: 'center' })]),
    )
    expect(r.total).toBe(3)
    expect(r.distributed).toBe(2)
    expect(r.bad).toHaveLength(1)
    expect(r.bad[0].el).toContain('forecast-title-wrap')
  })

  it('判据常量单一来源：分布集合 3 项 / 阈值 0.5', () => {
    expect(DISTRIBUTED_JUSTIFY).toEqual(['space-between', 'space-around', 'space-evenly'])
    expect(Object.isFrozen(DISTRIBUTED_JUSTIFY)).toBe(true)
    expect(LEFT_GAP_RATIO).toBe(0.5)
  })
})
