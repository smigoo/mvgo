/**
 * 🛡️ D1/D3/D-GRID 验收判据（2026-11-12 · mc-1794428749650-cc633474 实锤）
 *   （原「网格列数」曾用 code D2 ⇒ 与既有「文本重叠 D2」撞码，已改名 D-GRID）
 *
 * 阳性：结构塌陷产物（3 分组被并成 1 个、33 条平铺、两统计卡竖排）必须 FAIL 住；
 * 阴性：结构正确产物必须 PASS；不传 componentPlan 时整体 fail-open（零回归）。
 */
import { runAcceptanceChecks, formatAcceptanceGuidance, GROUP_STRUCTURE_CODES } from './index.js'

const GROUPED_INDEX = `<template>
  <div class="root" style="display:flex; flex-direction:row">
    <StatsSection />
    <StatsSection2 />
    <div class="groups" style="display:flex; flex-direction:column">
      <SectionA /><SectionB /><SectionC />
    </div>
  </div>
</template>`

const GROUPED_SECTION = (title: string, sid: string, cols = true) => `<template>
  <div class="card" data-section-id="${sid}">
    <div class="hd"><span class="t">${title}</span></div>
    <div class="grid"${cols ? ' style="display:grid;grid-template-columns:repeat(4, 126px);column-gap:20px"' : ''}>
      <div v-for="(it, i) in list" :key="i" class="item"><span>{{ it.name }}</span></div>
    </div>
  </div>
</template>`

/** 塌陷产物：只有 1 个分组、无 4 列声明、index 全 column */
const COLLAPSED_FILES = {
  'package/index.vue': `<template>
  <div class="root" style="display:flex; flex-direction:column">
    <StatsSection />
    <StatsSection2 />
    <CardGrid />
  </div>
</template>`,
  'package/components/CardGrid.vue': `<template>
  <div class="card" data-section-id="38:3137-list">
    <div class="hd"><span class="t">战略合作厂商</span></div>
    <div class="grid">
      <div v-for="(it, i) in list" :key="i" class="item"><span>{{ it.name }}</span></div>
    </div>
  </div>
</template>`,
}

/** 正确产物：3 个分组、4 列落地、index 有 row */
const CORRECT_FILES = {
  'package/index.vue': GROUPED_INDEX,
  'package/components/StatsSection.vue': `<template><div data-section-id="38:3260">33</div></template>`,
  'package/components/StatsSection2.vue': `<template><div data-section-id="38:3282">66</div></template>`,
  'package/components/SectionA.vue': GROUPED_SECTION('战略合作厂商', '38:3137'),
  'package/components/SectionB.vue': GROUPED_SECTION('优质厂商', '38:3162'),
  'package/components/SectionC.vue': GROUPED_SECTION('普通厂商', '38:3206'),
}

const COMPONENT_PLAN = {
  effectiveSections: [
    { id: '38:3260', type: 'stats', absoluteBoundingBox: { x: 26900, y: 51483, width: 265, height: 76 } },
    { id: '38:3282', type: 'stats', absoluteBoundingBox: { x: 27229, y: 51483, width: 265, height: 76 } },
    {
      id: '38:3137',
      type: 'grid',
      gridColumns: 4,
      header: { title: '战略合作厂商' },
      absoluteBoundingBox: { x: 26894, y: 51592, width: 604, height: 161 },
    },
    {
      id: '38:3162',
      type: 'grid',
      gridColumns: 4,
      header: { title: '优质厂商' },
      absoluteBoundingBox: { x: 26894, y: 51773, width: 604, height: 212 },
    },
    {
      id: '38:3206',
      type: 'grid',
      gridColumns: 4,
      header: { title: '普通厂商' },
      absoluteBoundingBox: { x: 26894, y: 52005, width: 604, height: 265 },
    },
  ],
}

const dCodes = (fails: any[]) =>
  fails.filter((f) => GROUP_STRUCTURE_CODES.includes(f.code)).map((f) => f.code).sort()

describe('D 层 · 分组结构验收判据', () => {
  test('阳性：塌陷产物 ⇒ D1 缺标题 + D-GRID 无列数 + D3 无 row 全部命中', () => {
    const r = runAcceptanceChecks({ files: COLLAPSED_FILES, componentPlan: COMPONENT_PLAN })
    expect(dCodes(r.fails)).toEqual(['D-GRID', 'D1', 'D3'])
    const d1 = r.fails.find((f) => f.code === 'D1')
    expect(d1.detail).toContain('优质厂商')
    expect(d1.detail).toContain('普通厂商')
  })

  test('阴性：结构正确产物 ⇒ 三条判据全过', () => {
    const r = runAcceptanceChecks({ files: CORRECT_FILES, componentPlan: COMPONENT_PLAN })
    expect(dCodes(r.fails)).toEqual([])
  })

  test('阴性：不传 componentPlan ⇒ 三条判据整体 fail-open（不新增拒绝面）', () => {
    const r = runAcceptanceChecks({ files: COLLAPSED_FILES })
    expect(dCodes(r.fails)).toEqual([])
  })

  test('修复指导：D 判据命中时输出可照抄配方（非自然语言空描述）', () => {
    const r = runAcceptanceChecks({ files: COLLAPSED_FILES, componentPlan: COMPONENT_PLAN })
    const guide = formatAcceptanceGuidance(r.fails)
    expect(guide).toContain('D1/D3/D-GRID 分组结构修复配方')
    expect(guide).toContain('grid-template-columns: repeat(K')
    expect(guide).toContain('禁止只保留第一个')
  })

  test('阳性对照（撞码回归）：文本重叠 D2 降级为 WARN，不得触发分组结构配方', () => {
    // 2026-11-12：改名前 /^D[123]$/ 会把「文本重叠 D2」也拉进分组配方 ⇒ 修复轮被误导。
    // 2026-11-13 安全组：D2 与 RUNTIME-016 同源，已降级为 warns（不再 BLOCK）。
    const r = runAcceptanceChecks({
      files: CORRECT_FILES,
      componentPlan: COMPONENT_PLAN,
      textOverlaps: [{ a: '战略合作厂商', b: '优质厂商' }],
    })
    expect(r.warns.some((w) => w.includes('D2'))).toBe(true) // 文本重叠真的命中（在 warns）
    expect(r.fails.map((f: any) => f.code)).not.toContain('D2') // 已不在 fails
    expect(r.fails.map((f: any) => f.code)).not.toContain('D-GRID') // 列数判据不沾边（产物已 4 列）
    const guide = formatAcceptanceGuidance(r.fails)
    expect(guide).not.toContain('分组结构修复配方') // D2 永远不该拉进分组配方
  })

  test('阴性：单组列表（仅 1 个 header.title）⇒ D1 不判', () => {
    const single = {
      ...COLLAPSED_FILES,
      'package/components/CardGrid.vue': GROUPED_SECTION('战略合作厂商', '38:3137-list', false),
    }
    const r = runAcceptanceChecks({
      files: single,
      componentPlan: {
        effectiveSections: [
          { id: '38:3137-list', type: 'grid', gridColumns: 4, header: { title: '战略合作厂商' } },
        ],
      },
    })
    expect(dCodes(r.fails)).not.toContain('D1')
  })

  test('P1 整改：根容器 3 列网格 ⇒ D3 不再误 FAIL（旧 \b2\b 写死）', () => {
    const files = {
      'package/index.vue':
        '<template><div class="root" style="display:grid;grid-template-columns:repeat(3,1fr)">' +
        '<StatsSection /><StatsSection2 /></div></template>',
      'package/components/StatsSection.vue': '<template><div data-section-id="38:3260">33</div></template>',
      'package/components/StatsSection2.vue': '<template><div data-section-id="38:3282">66</div></template>',
    }
    const r = runAcceptanceChecks({ files, componentPlan: COMPONENT_PLAN })
    expect(dCodes(r.fails)).not.toContain('D3')
  })

  test('P1 整改：根容器 column + header 含 row ⇒ D3 仍 FAIL（消除全局正则假通过）', () => {
    const files = {
      'package/index.vue':
        '<template><div class="root" style="display:flex;flex-direction:column">' +
        '<div class="hd" style="display:flex;flex-direction:row"><span>标题</span><span>图标</span></div>' +
        '<StatsSection /><StatsSection2 /></div></template>',
      'package/components/StatsSection.vue': '<template><div data-section-id="38:3260">33</div></template>',
      'package/components/StatsSection2.vue': '<template><div data-section-id="38:3282">66</div></template>',
    }
    const r = runAcceptanceChecks({ files, componentPlan: COMPONENT_PLAN })
    expect(dCodes(r.fails)).toContain('D3')
  })
})
