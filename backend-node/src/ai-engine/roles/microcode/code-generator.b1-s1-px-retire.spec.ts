/**
 * 🎯 B1-S1 px carrier 退役单测（2026-11-16 · 68783bf6/c1ac194a/fdbb799d 实锤）
 *
 * 病灶：`buildDeterministicIndexTemplate` 产出的段高 less 规则形态为
 * `.sech-N { flex: 0 1 <px>px !important }` —— px basis 与容器高无函数关系，
 * Σ 从未与根高约束（68783bf6 Σ714>868 留白 / c1ac194a Σ518>348 溢出 /
 * fdbb799d 12×14px 常量），4/6 样本全 px carrier ⇒ 100% 与根高脱钩。
 *
 * 修复：layoutStyle 改产 `.sech-N { flex: <r> 1 0 !important }`，r 直接取
 * `__sectionGeometries[].ratioStyle` 的 flex 值（h/(Σh+Σgap)，Σ=1 同层归一，
 * 与 inline 逐字同源）；margin-top 保留 px（兄弟间距真值，pxtorem 转 rem）。
 *
 * ⚠️ 源码提取式断言（同 visual-parser.degraded-form.spec.ts 惯例）：
 *   code-generator.js 依赖链含 import.meta（acorn-optional-loader），本仓 jest
 *   为 CJS transform，直接 import 会 SyntaxError。此处读源码做**字面量契约**断言。
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(__dirname, 'code-generator.js'), 'utf-8')

function layoutStyleBlock(): string {
  const m = src.match(/const layoutStyle = __sectionGeometries([\s\S]*?)\.join\('\\n'\)/)
  expect(m).toBeTruthy()
  return m![1]
}

describe('B1-S1 layoutStyle px carrier 退役（源码契约）', () => {
  it('旧 px basis 形态绝迹：不得再用 heightPx 拼 `flex: 0 1 <px>px`', () => {
    expect(src).not.toContain('flex: 0 1 ${g.heightPx}px !important')
    expect(layoutStyleBlock()).not.toContain('g.heightPx')
  })

  it('新形态从 ratioStyle 同源提取 grow（与 inline 逐字同源，无二次换算）', () => {
    const block = layoutStyleBlock()
    expect(block).toContain('g.ratioStyle')
    expect(block).toMatch(/flex:\s*\$\{_grow\} 1 0 !important/)
    // 比例值来源只有 ratioStyle 的 flex: 声明
    expect(block).toMatch(/\/flex:\\s\*\(\[\\d\.\]\+\)\//)
  })

  it('margin-top 保留 px（兄弟间距真值，pxtorem 转 rem，与段高比例无关）', () => {
    expect(layoutStyleBlock()).toContain('margin-top: ${g.gapPx}px !important')
  })

  it('min-height:auto（2026-11-17 方案 A · RUNTIME-016 根治）：段不得压穿内容 min-content', () => {
    // 🛡️ 本轮刻意翻转 11-16 的「min-height:0 保留」：footer flex:0.024 在 617px 容器仅
    //   14.9px < 内容 24px，min-height:0 允许坍缩 ⇒ 表格末行与 footer 图例相撞（真机实锤）。
    //   auto 让浏览器用原生 min-content 做下界，治本；不再保留 0 的收缩约束。
    expect(layoutStyleBlock()).toContain('min-height: auto')
    expect(layoutStyleBlock()).not.toContain('min-height: 0;')
  })

  it('carrier 判定不变：仍只对叶子段（sech class）产 less 规则', () => {
    expect(layoutStyleBlock()).toContain("g.carrier === 'less'")
  })
})
