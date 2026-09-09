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

/**
 * S3: 大分块拆分 — 多图表 section 按图表二次拆分为独立分块条目
 *
 * 测试覆盖：
 * 1. 单 section 含 3 个图表 → 拆为 3 个独立 chartChunk
 * 2. 单 section 含 1 个图表 → 不拆分（保持原 chunk）
 * 3. 单 section 含 2 个图表 + 其他元素 → 图表独立 + 其他元素归入杂项 chunk
 * 4. 无图表 section → 不拆分
 */
describe('S3: 大分块拆分（多图表 section 二次拆分）', () => {
  test('含 3 个图表的 section 应拆为 3 个独立 chartChunk', () => {
    const plan = {
      effectiveSections: [
        {
          id: 'section-charts',
          responsibility: '多图表区',
          elementCount: 15,
          title: '综合看板',
          internalSubcomponents: [
            { type: 'chart-component', id: 'chart1', name: '趋势图', parentSectionId: 'section-charts' },
            { type: 'chart-component', id: 'chart2', name: '柱状图', parentSectionId: 'section-charts' },
            { type: 'chart-component', id: 'chart3', name: '饼图', parentSectionId: 'section-charts' },
          ],
        },
      ],
    }

    const { splitMultiChartSectionIntoChunks } = require('../subcomponent-planner.js')
    const chunks = splitMultiChartSectionIntoChunks(plan)

    // 3 个图表 → 3 个独立 chunk
    expect(chunks).toHaveLength(3)
    expect(chunks[0].segmentType).toBe('chart')
    expect(chunks[0].files).toContain('package/components/TrendChart.vue')
    expect(chunks[1].segmentType).toBe('chart')
    expect(chunks[2].segmentType).toBe('chart')
  })

  test('单图表 section 不应拆分', () => {
    const plan = {
      effectiveSections: [
        {
          id: 'section-chart',
          responsibility: '图表区',
          elementCount: 5,
          title: '趋势分析',
          internalSubcomponents: [
            { type: 'chart-component', id: 'chart1', name: '折线图', parentSectionId: 'section-chart' },
          ],
        },
      ],
    }

    const { splitMultiChartSectionIntoChunks } = require('../subcomponent-planner.js')
    const chunks = splitMultiChartSectionIntoChunks(plan)

    // 只有 1 个图表，不拆分，返回原始 section 级 chunk
    expect(chunks).toHaveLength(1)
    expect(chunks[0].segmentType).toBe('chart')
  })

  test('2 个图表 + 其他元素的 section 应图表独立 + 杂项 chunk', () => {
    const plan = {
      effectiveSections: [
        {
          id: 'section-mixed',
          responsibility: '混合区',
          elementCount: 12,
          title: '数据面板',
          internalSubcomponents: [
            { type: 'chart-component', id: 'chart1', name: '柱状图', parentSectionId: 'section-mixed' },
            { type: 'chart-component', id: 'chart2', name: '饼图', parentSectionId: 'section-mixed' },
            { type: 'element-group', id: 'group1', name: '统计卡片', parentSectionId: 'section-mixed' },
          ],
        },
      ],
    }

    const { splitMultiChartSectionIntoChunks } = require('../subcomponent-planner.js')
    const chunks = splitMultiChartSectionIntoChunks(plan)

    // 2 图表独立 + 1 杂项 = 3 chunks
    expect(chunks).toHaveLength(3)
    const chartChunks = chunks.filter(c => c.segmentType === 'chart')
    const miscChunks = chunks.filter(c => c.segmentType !== 'chart')
    expect(chartChunks).toHaveLength(2)
    expect(miscChunks).toHaveLength(1)
  })

  test('无图表 section 不应触发拆分', () => {
    const plan = {
      effectiveSections: [
        {
          id: 'section-tabs',
          responsibility: '标签区',
          elementCount: 8,
          title: '切换面板',
          internalSubcomponents: [],
        },
      ],
    }

    const { splitMultiChartSectionIntoChunks } = require('../subcomponent-planner.js')
    const chunks = splitMultiChartSectionIntoChunks(plan)

    // 无图表，返回空或原样
    expect(chunks.length).toBeLessThanOrEqual(1)
  })
})
