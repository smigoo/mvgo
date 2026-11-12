/**
 * 🎯 P1-1 契约：stats 段「容器横排 + 成员行内横排」真值注入（2026-11-12 · 8b15a757 实锤）。
 *
 * 真机病灶（StatsSection.vue 逐字实证）：
 *   ① `.c-component-group-2136638431` flex-direction:column（两卡纵叠，真值 horizontal-2-columns）；
 *   ② `.c-component-stat-item` 无 display:flex（icon/数值/标签块级堆叠，成员真值 horizontal）；
 *   ③ 两卡共用 icon2（icon-263 零消费 ⇒ E2-v3）。
 *
 * 红线（阴阳对照）：
 *   · 阴性：非 stats 文件 / label 不齐 ⇒ no-op 零改动；
 *   · 阳性：stat-item 纵排/缺 flex ⇒ 注入 row；已正确 row ⇒ 幂等 no-op。
 */
import { injectStatsRowGeometry } from './inline-row-assembler.js';

/** 8b15a757 真机同形：stat-item 缺 display:flex、容器 column */
const SFC_BROKEN = `<template>
  <div class="c-component-stats-section">
    <div class="c-component-group-2136638431">
      <div class="c-component-stat-item">
        <span class="c-component-stat-value">33</span>
        <span class="c-component-stat-label">合作厂商</span>
      </div>
      <div class="c-component-stat-item">
        <span class="c-component-stat-value">66</span>
        <span class="c-component-stat-label">在线设备</span>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
.c-component-group-2136638431 {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.c-component-stat-item {
  align-items: center;
  gap: 16px;
  height: 76px;
}
</style>
`

const TRUTH = {
  members: [
    { label: '合作厂商', value: '33' },
    { label: '在线设备', value: '66' },
  ],
}

describe('P1-1 · injectStatsRowGeometry（stats 段横排真值注入）', () => {
  it('阳性：stat-item 缺 display:flex ⇒ 注入 flex + row', () => {
    const r = injectStatsRowGeometry(SFC_BROKEN, TRUTH)
    expect(r.changed).toBe(true)
    expect(r.content).toMatch(/\.c-component-stat-item\s*\{[^}]*display:\s*flex/)
    expect(r.content).toMatch(/\.c-component-stat-item\s*\{[^}]*flex-direction:\s*row/)
    // 非目标类不动
    expect(r.content).toMatch(/\.c-component-group-2136638431\s*\{[^}]*flex-direction:\s*column/)
  })

  it('幂等：已注入 row 再跑 ⇒ no-op', () => {
    const once = injectStatsRowGeometry(SFC_BROKEN, TRUTH)
    const twice = injectStatsRowGeometry(once.content, TRUTH)
    expect(twice.changed).toBe(false)
  })

  it('阴性：label 不齐（非 stats 宿主）⇒ no-op 零改动', () => {
    const r = injectStatsRowGeometry(SFC_BROKEN, {
      members: [
        { label: '合作厂商', value: '33' },
        { label: '不存在的标签', value: '9' },
      ],
    })
    expect(r.changed).toBe(false)
    expect(r.content).toBe(SFC_BROKEN)
  })

  it('阴性：成员 <2 ⇒ no-op', () => {
    const r = injectStatsRowGeometry(SFC_BROKEN, { members: [{ label: '合作厂商', value: '33' }] })
    expect(r.changed).toBe(false)
  })

  it('阳性变体：stat-item 显式 column ⇒ 翻正为 row', () => {
    const sfc = SFC_BROKEN.replace(
      '.c-component-stat-item {',
      '.c-component-stat-item {\n  display: flex;\n  flex-direction: column;',
    )
    const r = injectStatsRowGeometry(sfc, TRUTH)
    expect(r.changed).toBe(true)
    const block = /\.c-component-stat-item\s*\{[^}]*\}/s.exec(r.content)[0]
    expect(block).toMatch(/flex-direction:\s*row/)
    expect(block).not.toMatch(/flex-direction:\s*column/)
  })
})
