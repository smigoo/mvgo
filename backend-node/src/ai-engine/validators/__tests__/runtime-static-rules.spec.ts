import {
  RUNTIME_CODES,
  RUNTIME_STATIC_RULES,
  resolveStaticCode,
  getStaticRule,
  validateStaticRuleRegistry,
} from '../runtime-static-rules.js'

describe('RUNTIME-STATIC-* 规则编号中心表（立项 G3）', () => {
  it('中心表自洽：无格式/重复/空值/未知运行时码', () => {
    expect(validateStaticRuleRegistry()).toEqual([])
  })

  it('已落地的生成期静态拦截项均登记在册（防命名分叉）', () => {
    const legacyIds = RUNTIME_STATIC_RULES.map((r) => r.legacyId)
    // 本轮/上轮落地的三类「生成期可静态判定的运行时错误」
    expect(legacyIds).toContain('SFC-TDZ-REF') // 引用型/赋值型 TDZ
    expect(legacyIds).toContain('VUE-VIF-VFOR-001') // v-if+v-for 同元素
    expect(legacyIds).toContain('CSS-CALC-SELFREF-001') // calc var 自引用双写
  })

  it('每条静态规则都标注了它预防的运行时 RUNTIME-* 码', () => {
    for (const r of RUNTIME_STATIC_RULES) {
      expect(r.runtimeCodes.length).toBeGreaterThan(0)
      for (const c of r.runtimeCodes) {
        expect(RUNTIME_CODES[c]).toBeTruthy()
      }
    }
  })

  it('TDZ 静态规则映射到 pageerror/console（RUNTIME-009/010）', () => {
    const tdz = getStaticRule('RUNTIME-STATIC-001')
    expect(tdz).toBeTruthy()
    expect(tdz.legacyId).toBe('SFC-TDZ-REF')
    expect(tdz.runtimeCodes).toEqual(['RUNTIME-009', 'RUNTIME-010'])
  })

  it('v-if+v-for 静态规则映射到 pageerror/console（RUNTIME-009/010）', () => {
    const r = resolveStaticCode('VUE-VIF-VFOR-001')
    expect(r).toBe('RUNTIME-STATIC-002')
    expect(getStaticRule(r)?.runtimeCodes).toEqual(['RUNTIME-009', 'RUNTIME-010'])
  })

  it('legacyId 反查：未登记的规则号返回 null（不臆造）', () => {
    expect(resolveStaticCode('NOT-A-REAL-RULE')).toBeNull()
    expect(getStaticRule('RUNTIME-STATIC-999')).toBeNull()
  })

  it('staticId 唯一且形如 RUNTIME-STATIC-\\d{3}', () => {
    const ids = RUNTIME_STATIC_RULES.map((r) => r.staticId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^RUNTIME-STATIC-\d{3}$/)
  })

  it('RUNTIME_CODES 覆盖运行时门禁实际使用的码（RUNTIME-004/009/010 必在）', () => {
    expect(RUNTIME_CODES['RUNTIME-004']).toBeTruthy()
    expect(RUNTIME_CODES['RUNTIME-009']).toBeTruthy()
    expect(RUNTIME_CODES['RUNTIME-010']).toBeTruthy()
  })
})
