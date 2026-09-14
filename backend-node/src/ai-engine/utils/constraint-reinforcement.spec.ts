/**
 * 布局约束强化单测（2026-09-14 · 删减法批次 3 loop 3b）。
 *
 * 背景：`@antd/tab`（Figma 89:37）是双层结构——外层「左 Tab 窄列 | 右内容区」横向 row，
 * 内层内容区（cons）是 3 列设备栅格网格。原实现给 LLM 写具体 CSS 值（flex-direction/grid），
 * 80021ec7 实锤手写值覆盖注入事实 → 12 张设备卡挤成单行。
 *
 * 3b 治本（声明接管）：section 根的 display/flex/grid **由系统注入**（sectionLayoutFacts + 规则⑤），
 * prompt 不再给 LLM 写具体 CSS 值，只声明「布局形态类别 + 勿手写」；
 * **唯一例外**：双层结构的内层栅格目前事实表不能表达，内层栅格子约束**仍要求 LLM 遵守**（防塌缩）。
 */
import {
  buildLayoutConstraintReinforcement,
} from './constraint-reinforcement.js'

describe('buildLayoutConstraintReinforcement 3b 布局接管声明', () => {
  it('外层 horizontal + 内层 gridColumns=3 → 声明外层由系统注入 + 保留内层栅格子约束', () => {
    const out = buildLayoutConstraintReinforcement({
      sections: [{ name: '@antd/tab', layout: 'horizontal', gridColumns: 3 }],
    })
    // 外层方向改为「声明形态」，不再给具体 flex-direction 值
    expect(out).toContain('布局形态：横向排列（row / 两列并排）')
    expect(out).toContain('section 根 display/flex/grid 由系统注入，勿手写')
    // 内层 3 列栅格（事实表未覆盖，必须保留硬约束，防塌缩）
    expect(out).toContain('内层内容区（设备/卡片网格）必须用 `display: grid; grid-template-columns: repeat(3, 1fr)`')
    expect(out).toContain('❌ 内层网格禁止用 `flex-direction: row` 把卡片排成单行')
    expect(out).toContain('❌ 内层列数禁止改为 3 之外的值')
  })

  it('字段名兼容：顶层 gridColumns 与 body.gridColumns 都能读到', () => {
    const a = buildLayoutConstraintReinforcement({
      sections: [{ name: 'x', layout: 'horizontal', gridColumns: 3 }],
    })
    const b = buildLayoutConstraintReinforcement({
      sections: [{ name: 'x', layout: 'horizontal', body: { gridColumns: 3 } }],
    })
    expect(a).toContain('repeat(3, 1fr)')
    expect(b).toContain('repeat(3, 1fr)')
  })

  it('layout=grid + gridColumns → 单层网格：仅声明形态（根布局由系统注入，无内层规则）', () => {
    const out = buildLayoutConstraintReinforcement({
      sections: [{ name: 'device-grid', layout: 'grid', gridColumns: 4 }],
    })
    expect(out).toContain('布局形态：网格（4 列）')
    expect(out).toContain('勿手写')
    // layout=grid 是 section 根网格 → 由系统注入，不再输出内层栅格规则
    expect(out).not.toContain('内层栅格子约束')
  })

  it('纯 vertical section → 声明竖向堆叠 + 声明勿手写根布局', () => {
    const out = buildLayoutConstraintReinforcement({
      sections: [{ name: 'header', layout: 'vertical' }],
    })
    expect(out).toContain('布局形态：竖向堆叠（column）')
    expect(out).toContain('勿手写')
  })
})
