/**
 * 🛡️ C 层之二：兄弟段主轴方向（2026-11-12 · mc-1794428749650-cc633474 实锤）
 *
 * 真值：两个统计卡 y 相同、x 相邻（26900/27229，各 265 宽，gap 64）⇒ 必须并排；
 * 产物写成 flex-direction:column 竖排、各占 24% 高。
 */
import { enforceSiblingRowDirection } from './layout-truth-healer.js'

const INDEX_VUE = `<template>
  <base-panel panelKey="default-panel">
    <div class="c-cc6334-slot-con" style="display:flex; flex-direction:column; height:100%; min-height:0">
      <StatsSection style="flex:0.243;min-height:0;" />
      <StatsSection2 style="flex:0.243;min-height:0;" />
      <CardGrid style="flex:0.514;min-height:0;margin-top:33px;" />
    </div>
  </base-panel>
</template>

<script setup>
import StatsSection from './components/StatsSection.vue'
</script>
`

const sections = [
  { id: '38:3260', absoluteBoundingBox: { x: 26900, y: 51483, width: 265, height: 76 } },
  { id: '38:3282', absoluteBoundingBox: { x: 27229, y: 51483, width: 265, height: 76 } },
  { id: '38:3137', absoluteBoundingBox: { x: 26894, y: 51592, width: 604, height: 161 } },
]

/** 组件文件（带 data-section-id，作为 sid→组件名 权威映射） */
const COMPONENT_FILES = {
  'package/components/StatsSection.vue': '<template><div class="s1" data-section-id="38:3260">33</div></template>',
  'package/components/StatsSection2.vue': '<template><div class="s2" data-section-id="38:3282">66</div></template>',
  'package/components/CardGrid.vue': '<template><div class="g" data-section-id="38:3137">x</div></template>',
}

describe('C 层之二 · 并排段 row 方向', () => {
  test('阳性：两张统计卡 y 相同、x 相邻 ⇒ 包进 row 容器、gap=64，第三段不动', () => {
    const out = enforceSiblingRowDirection(
      { 'package/index.vue': INDEX_VUE, ...COMPONENT_FILES },
      { effectiveSections: sections },
    )
    const c = out.files['package/index.vue']
    expect(c).toContain('class="mc-sibling-row"')
    expect(c).toContain('flex-direction:row')
    expect(c).toContain('column-gap:64px')
    // 两个统计组件都在 row 容器内
    const rowStart = c.indexOf('mc-sibling-row')
    const rowBlock = c.slice(rowStart, c.indexOf('</div>', rowStart))
    expect(rowBlock).toContain('<StatsSection')
    expect(rowBlock).toContain('<StatsSection2')
    // 分组段未被卷入
    expect(rowBlock).not.toContain('<CardGrid')
    expect(out.stats.wrapped).toBe(1)
  })

  test('阴性1：纵向排列（y 不同）⇒ 不包', () => {
    const vert = [
      { id: 'a', absoluteBoundingBox: { x: 0, y: 0, width: 265, height: 76 } },
      { id: 'b', absoluteBoundingBox: { x: 0, y: 100, width: 265, height: 76 } },
      { id: 'c', absoluteBoundingBox: { x: 0, y: 200, width: 604, height: 161 } },
    ]
    const out = enforceSiblingRowDirection(
      { 'package/index.vue': INDEX_VUE },
      { effectiveSections: vert },
    )
    expect(out.changes).toHaveLength(0)
    expect(out.files['package/index.vue']).toBe(INDEX_VUE)
  })

  test('阴性2：宽度不等（非同一并排卡组）⇒ 不包', () => {
    const mixed = [
      { id: 'a', absoluteBoundingBox: { x: 0, y: 0, width: 265, height: 76 } },
      { id: 'b', absoluteBoundingBox: { x: 300, y: 0, width: 120, height: 76 } },
      { id: 'c', absoluteBoundingBox: { x: 0, y: 100, width: 604, height: 161 } },
    ]
    const out = enforceSiblingRowDirection(
      { 'package/index.vue': INDEX_VUE },
      { effectiveSections: mixed },
    )
    expect(out.changes).toHaveLength(0)
  })

  test('阴性3：并排段之间夹了别的子组件（不紧邻）⇒ 跳过不改结构', () => {
    const tpl = `<template>
  <div class="slot">
    <StatsSection />
    <MidThing />
    <StatsSection2 />
    <CardGrid />
  </div>
</template>`
    const out = enforceSiblingRowDirection(
      { 'package/index.vue': tpl, ...COMPONENT_FILES },
      { effectiveSections: sections },
    )
    expect(out.changes).toHaveLength(0)
    expect(out.stats.skipped).toBeGreaterThan(0)
  })
})
