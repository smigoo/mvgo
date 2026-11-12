/**
 * 🛡️ C 层：plan.gridColumns 确定性落地（2026-11-12 · mc-1794428749650-cc633474 实锤）
 *
 * 事故：plan 有 gridColumns:4（item 126×30、行宽 564 ⇒ gap 20），prompt 也写了硬约束，
 * 但产物只写 `display:flex;flex-direction:row` ⇒ 渲成 5 列。
 * 本刀按 plan 真值把列数写进承载 v-for 的容器 style，幂等且 fail-open。
 */
import { enforceGridColumnTruth, collectGridColumnTruth } from './layout-truth-healer.js'

/** 真实事故产物模板（CardGrid.vue 原样：data-section-id + v-for 容器无列宽） */
const CARD_GRID_TEMPLATE = `<template>
  <div class="c-cc6334-card-grid" data-section-id="38:3137-list" v-bind="$attrs" style="padding:0">
    <div class="c-cc6334-frame-2136638432">
      <span class="c-cc6334-group-title">战略合作厂商</span>
    </div>
    <div class="c-cc6334-frame-2136639905">
      <div
        v-for="(item, index) in vendorList"
        :key="index"
        class="c-cc6334-vendor-card c-cc6334-frame-2136639903"
      >
        <span class="c-cc6334-vendor-name">{{ item.name }}</span>
        <span class="c-cc6334-vendor-count">{{ item.count }}台</span>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
.c-cc6334-frame-2136639905 {  display: flex;
  flex-direction: row;

  min-height: 0;
}
</style>
`

const sections = [
  {
    id: '38:3137-list',
    type: 'grid',
    layout: 'grid',
    gridColumns: 4,
    figmaBox: { x: 0, y: 0, width: 564, height: 161 },
    items: [{ absoluteBoundingBox: { width: 126, height: 30 } }],
  },
]

describe('C 层 · gridColumns 真值落地', () => {
  test('真值解析：K=4 / itemW=126 ⇒ gap 由段宽反算 = 20', () => {
    const truth = collectGridColumnTruth(sections)
    expect(truth.get('38:3137-list')).toEqual({
      cols: 4,
      itemW: 126,
      gap: 20,
      boxW: 564,
    })
  })

  test('阳性：v-for 容器无列宽 ⇒ 注入 repeat(4, 126px) + gap 20', () => {
    const out = enforceGridColumnTruth(
      { 'package/components/CardGrid.vue': CARD_GRID_TEMPLATE },
      { effectiveSections: sections },
    )
    const content = out.files['package/components/CardGrid.vue']
    expect(content).toContain('grid-template-columns:repeat(4, 126px)')
    expect(content).toContain('column-gap:20px')
    expect(content).toContain('display:grid')
    // 冲突声明被剥除，避免 flex row 与 grid 打架
    expect(content).not.toMatch(/flex-direction:row[^;"]*;?[^"]*grid-template-columns/)
    expect(out.changes).toHaveLength(1)
    expect(out.stats.fixed).toBe(1)
    // 原有非冲突声明保留
    expect(content).toContain('padding:0')
  })

  test('阴性1：已落地同列数 ⇒ 幂等不改（resolved）', () => {
    const healed = CARD_GRID_TEMPLATE.replace(
      'class="c-cc6334-frame-2136639905"',
      'class="c-cc6334-frame-2136639905" style="display:grid;grid-template-columns:repeat(4, 126px);column-gap:20px"',
    )
    const out = enforceGridColumnTruth(
      { 'package/components/CardGrid.vue': healed },
      { effectiveSections: sections },
    )
    expect(out.changes).toHaveLength(0)
    expect(out.stats.resolved).toBe(1)
    expect(out.files['package/components/CardGrid.vue']).toBe(healed)
  })

  test('阴性2：段内无 v-for（静态列表）⇒ 不改（noVfor 留痕）', () => {
    const staticTpl = CARD_GRID_TEMPLATE.replace(/\s+v-for="[^"]*"/, '').replace(
      /\s+:key="[^"]*"/,
      '',
    )
    const out = enforceGridColumnTruth(
      { 'package/components/CardGrid.vue': staticTpl },
      { effectiveSections: sections },
    )
    expect(out.changes).toHaveLength(0)
    expect(out.stats.noVfor).toBe(1)
  })

  test('阴性3：无 gridColumns 的段（普通纵向列表）⇒ 不改', () => {
    const out = enforceGridColumnTruth(
      { 'package/components/CardGrid.vue': CARD_GRID_TEMPLATE },
      { effectiveSections: [{ id: '38:3137-list', type: 'list', items: [] }] },
    )
    expect(out.changes).toHaveLength(0)
  })

  test('阴性4：无 sections ⇒ 完全不动（fail-open）', () => {
    const out = enforceGridColumnTruth(
      { 'package/components/CardGrid.vue': CARD_GRID_TEMPLATE },
      {},
    )
    expect(out.changes).toHaveLength(0)
    expect(out.files['package/components/CardGrid.vue']).toBe(CARD_GRID_TEMPLATE)
  })
})
