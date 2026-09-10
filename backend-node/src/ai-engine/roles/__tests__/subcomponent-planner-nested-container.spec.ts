/**
 * A′ Phase 5：planner 保留 container-rebuild 嵌套，不再 flatten。
 * 本文件 mock logger，切断 import.meta（与 collapse spec 同套路）。
 */
jest.mock('../../logger/index.js', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}))

import {
  SubcomponentPlanner,
  collectLeafSections,
  isLayoutContainerSection,
} from '../subcomponent-planner.js'

describe('SubcomponentPlanner 保留嵌套容器', () => {
  const planner = new SubcomponentPlanner()

  function deviceLikeLayout() {
    return {
      sections: [
        {
          id: 'section-header',
          name: '头部统计指标区',
          body: { children: [{ role: 'statistic' }] },
        },
        {
          id: '89:40',
          name: 'slot-con',
          layout: 'vertical',
          layoutSource: 'container-rebuild',
          children: [
            {
              id: '89:38',
              name: 'switch',
              body: { children: [{ role: 'toggle' }, { role: 'label' }] },
            },
            {
              id: '89:37',
              name: '@antd/tab',
              body: { children: [{ role: 'tab' }, { role: 'panel' }] },
            },
          ],
        },
        {
          id: '2:8437',
          name: 'cons',
          layout: 'horizontal',
          layoutSource: 'inline-row',
          body: { children: [{ role: 'card' }, { role: 'card' }] },
        },
      ],
    }
  }

  test('slot-con 作为布局容器保留 children，switch/tab 不升顶层', () => {
    const plan = planner.plan(deviceLikeLayout(), { enableInternalSplit: false })
    const container = plan.effectiveSections.find((s: any) => s.id === '89:40')
    expect(container).toBeDefined()
    expect(isLayoutContainerSection(container)).toBe(true)
    expect(container.isLayoutContainer).toBe(true)
    expect(container.type).toBe('container')
    expect(container.children.map((c: any) => c.id)).toEqual(['89:38', '89:37'])
    expect(plan.effectiveSections.find((s: any) => s.id === '89:38')).toBeUndefined()
    expect(plan.effectiveSections.find((s: any) => s.id === '89:37')).toBeUndefined()
    expect(plan).not.toHaveProperty('containerHints')
  })

  test('minFiles / isForced 按叶子计数，容器不占独立 .vue 槽', () => {
    const plan = planner.plan(deviceLikeLayout(), { enableInternalSplit: false })
    const leaves = collectLeafSections(plan.effectiveSections)
    expect(leaves.map((s: any) => s.id)).toEqual(['section-header', '89:38', '89:37', '2:8437'])
    expect(plan.effectiveSections).toHaveLength(3)
    expect(plan.minFiles).toBe(leaves.length)
    expect(plan.reason).toMatch(/叶子 sections=4/)
  })

  test('无容器时行为不变（env 形态）', () => {
    const plan = planner.plan(
      {
        sections: [
          { id: 'section-tabs', name: 'Tab切换栏', body: { children: [{ role: 'tab' }] } },
          { id: '89:42', name: 'sub-t', body: { children: [{ role: 'title' }] } },
          { id: 'section-chart', name: '趋势图', body: { children: [{ role: 'chart' }] } },
        ],
      },
      { enableInternalSplit: false },
    )
    expect(plan.effectiveSections.map((s: any) => s.id)).toEqual([
      'section-tabs',
      '89:42',
      'section-chart',
    ])
    expect(plan.effectiveSections.every((s: any) => !s.isLayoutContainer)).toBe(true)
    expect(plan.minFiles).toBe(3)
  })
})
