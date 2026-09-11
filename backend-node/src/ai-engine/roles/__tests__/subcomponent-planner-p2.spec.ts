/**
 * P2': 图例误识别为独立 section — 单元测试
 *
 * 测试覆盖：
 * 1. 图例 section（色块+短文本，无交互）合并到相邻图表 section
 * 2. 图例在图表前方也合并
 * 3. 含交互元素不合并
 * 4. 远离图表不合并
 * 5. 非图例特征不合并
 */

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: '/tmp/mvgo-test-workspace',
  backendRoot: '/Users/smigoo/工作/mvgo/backend-node',
  projectRoot: '/Users/smigoo/工作/mvgo',
  logsDir: '/tmp/mvgo-test-logs',
  dataDir: '/tmp/mvgo-test-data',
  tempComponentsDir: '/tmp/mvgo-test-temp-components',
}), { virtual: true })

import { SubcomponentPlanner } from '../subcomponent-planner.js'

describe("P2': 图例误识别为独立 section", () => {
  let planner: InstanceType<typeof SubcomponentPlanner>

  beforeEach(() => {
    planner = new SubcomponentPlanner()
  })

  test('图例 section（色块+短文本，无交互）应合并到相邻图表 section', () => {
    const layoutStructure = {
      sections: [
        {
          id: 'section-chart',
          name: '趋势图',
          body: {
            children: [
              { id: 'chart1', type: 'line-chart', name: '折线图' },
            ],
          },
        },
        {
          id: 'section-legend',
          name: '图例',
          body: {
            children: [
              { id: 'legend1', type: 'color-block', name: '红色' },
              { id: 'legend2', type: 'text', name: '系列A' },
              { id: 'legend3', type: 'color-block', name: '蓝色' },
              { id: 'legend4', type: 'text', name: '系列B' },
            ],
          },
        },
      ],
    }

    const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

    // 图例 section 应被合并，effectiveSections 只保留图表 section
    expect(plan.effectiveSections).toHaveLength(1)
    expect(plan.effectiveSections[0].id).toBe('section-chart')
  })

  test('图例 section 在图表前方也应合并', () => {
    const layoutStructure = {
      sections: [
        {
          id: 'section-legend',
          name: '图例区',
          body: {
            children: [
              { id: 'legend1', type: 'color-block', name: '红色' },
              { id: 'legend2', type: 'text', name: '系列A' },
            ],
          },
        },
        {
          id: 'section-chart',
          name: '柱状图',
          body: {
            children: [
              { id: 'chart1', type: 'bar-chart', name: '柱状图' },
            ],
          },
        },
      ],
    }

    const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

    expect(plan.effectiveSections).toHaveLength(1)
    expect(plan.effectiveSections[0].id).toBe('section-chart')
  })

  test('含交互元素的图例 section 不应合并', () => {
    const layoutStructure = {
      sections: [
        {
          id: 'section-chart',
          name: '趋势图',
          body: {
            children: [
              { id: 'chart1', type: 'line-chart', name: '折线图' },
            ],
          },
        },
        {
          id: 'section-legend',
          name: '图例',
          body: {
            children: [
              { id: 'legend1', type: 'color-block', name: '红色' },
              { id: 'btn1', type: 'button', name: '切换' },
            ],
          },
        },
      ],
    }

    const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

    // 含交互元素，不应合并，保留为独立 section
    expect(plan.effectiveSections).toHaveLength(2)
    expect(plan.effectiveSections[0].id).toBe('section-chart')
    expect(plan.effectiveSections[1].id).toBe('section-legend')
  })

  test('远离图表的图例 section 不应合并', () => {
    const layoutStructure = {
      sections: [
        {
          id: 'section-chart',
          name: '趋势图',
          body: {
            children: [
              { id: 'chart1', type: 'line-chart', name: '折线图' },
            ],
          },
        },
        {
          id: 'section-text',
          name: '说明文字',
          body: {
            children: [
              { id: 'text1', type: 'text', name: '说明内容' },
            ],
          },
        },
        {
          id: 'section-legend',
          name: '图例',
          body: {
            children: [
              { id: 'legend1', type: 'color-block', name: '红色' },
              { id: 'legend2', type: 'text', name: '系列A' },
            ],
          },
        },
      ],
    }

    const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

    // 图例与图表不相邻，不应合并
    expect(plan.effectiveSections).toHaveLength(3)
  })

  test('非图例特征的 section 不应合并（即使相邻）', () => {
    const layoutStructure = {
      sections: [
        {
          id: 'section-chart',
          name: '趋势图',
          body: {
            children: [
              { id: 'chart1', type: 'line-chart', name: '折线图' },
            ],
          },
        },
        {
          id: 'section-stats',
          name: '统计指标',
          body: {
            children: [
              { id: 'stat1', type: 'card', name: '指标卡' },
              { id: 'stat2', type: 'card', name: '指标卡2' },
            ],
          },
        },
      ],
    }

    const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

    // 统计指标区不是图例，不应合并
    expect(plan.effectiveSections).toHaveLength(2)
  })
})
