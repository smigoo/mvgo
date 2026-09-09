import { resolveRefineTarget, REFINE_TARGET_BY_TYPE } from './refine-target.js'

describe('P4 · 精修范围收窄（refineType → _reviseTarget）', () => {
  it('layout → layout（仅布局修正，不动样式）', () => {
    expect(resolveRefineTarget('layout')).toBe('layout')
  })

  it('style → stylistic（仅样式修正，不动布局）', () => {
    expect(resolveRefineTarget('style')).toBe('stylistic')
  })

  it('both → full（两类都改，无法收窄，属正确行为）', () => {
    expect(resolveRefineTarget('both')).toBe('full')
  })

  it('⭐ 未知/缺失/非法值一律回退 full（保守优先，绝不猜窄）', () => {
    // 收窄过当会导致「该改的没改」——比「多改了」更难发现，故一律回退到最宽范围
    expect(resolveRefineTarget(undefined)).toBe('full')
    expect(resolveRefineTarget(null)).toBe('full')
    expect(resolveRefineTarget('')).toBe('full')
    expect(resolveRefineTarget('unknown')).toBe('full')
    expect(resolveRefineTarget('LAYOUT')).toBe('full')
    expect(resolveRefineTarget(123 as any)).toBe('full')
    expect(resolveRefineTarget({} as any)).toBe('full')
  })

  it('映射表覆盖 controller 白名单的全部三种取值', () => {
    // phase2.controller.ts:198 的白名单是 ['layout','style','both']，
    // 三者必须都有显式映射，否则会静默回退 full（等于白名单失效）
    for (const t of ['layout', 'style', 'both']) {
      expect(REFINE_TARGET_BY_TYPE[t]).toBeDefined()
      expect(resolveRefineTarget(t)).not.toBeUndefined()
    }
    expect(Object.keys(REFINE_TARGET_BY_TYPE).sort()).toEqual(['both', 'layout', 'style'])
  })
})
