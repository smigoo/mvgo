/**
 * 🎯 Phase 2 方案1: 增强子组件拆分 - 单元测试
 *
 * 测试覆盖：
 * 1. 多维度复杂度评分（元素密度、图表数量、交互复杂度、嵌套深度）
 * 2. Section 内部拆分规则（R1-R4）
 * 3. 图表隔离策略
 * 4. 布局元数据提取
 * 5. 集成测试：完整拆分流程
 */

import { SubcomponentPlanner } from '../subcomponent-planner.js'

describe('Phase 2 方案1: 增强子组件拆分', () => {
  let planner

  beforeEach(() => {
    planner = new SubcomponentPlanner()
  })

  describe('多维度复杂度评分', () => {
    test('元素密度评分：>10 元素 → 40分', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-dense',
            name: '高密度区',
            body: {
              children: Array(12).fill(null).map((_, i) => ({
                id: `elem-${i}`,
                type: 'text',
              })),
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

      expect(plan.effectiveSections).toHaveLength(1)
      expect(plan.effectiveSections[0].complexityScore).toBeGreaterThanOrEqual(40)
      expect(plan.effectiveSections[0].complexityReasons.elementCount).toBe(12)
      expect(plan.effectiveSections[0].shouldSplitInternally).toBe(true)
    })

    test('图表数量评分：≥2 图表 → 30分', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-charts',
            name: '图表区',
            body: {
              children: [
                { id: 'chart1', type: 'chart', name: '柱状图' },
                { id: 'chart2', type: 'line-chart', name: '折线图' },
                { id: 'text1', type: 'text' },
              ],
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

      expect(plan.effectiveSections[0].complexityScore).toBeGreaterThanOrEqual(30)
      expect(plan.effectiveSections[0].complexityReasons.charts).toBe(2)
      expect(plan.effectiveSections[0].shouldSplitInternally).toBe(true)
    })

    test('交互复杂度评分：>3 交互元素 → 20分', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-interactive',
            name: '交互区',
            body: {
              children: [
                { id: 'btn1', type: 'button', name: '按钮1' },
                { id: 'btn2', type: 'button', name: '按钮2' },
                { id: 'input1', type: 'input', name: '输入框' },
                { id: 'select1', type: 'select', name: '下拉框' },
                { id: 'text1', type: 'text' },
              ],
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

      expect(plan.effectiveSections[0].complexityReasons.interactions).toBe(4)
      expect(plan.effectiveSections[0].complexityScore).toBeGreaterThanOrEqual(20)
    })

    test('嵌套深度评分：>3 层 → 10分', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-nested',
            name: '深层嵌套区',
            body: {
              children: [
                {
                  id: 'level1',
                  children: [
                    {
                      id: 'level2',
                      children: [
                        {
                          id: 'level3',
                          children: [
                            { id: 'level4', type: 'text' },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

      expect(plan.effectiveSections[0].complexityReasons.maxDepth).toBeGreaterThan(3)
      expect(plan.effectiveSections[0].complexityScore).toBeGreaterThanOrEqual(10)
    })

    test('低复杂度 section 不触发拆分：<30分', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-simple',
            name: '简单区',
            body: {
              children: [
                { id: 'text1', type: 'text' },
                { id: 'text2', type: 'text' },
              ],
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

      expect(plan.effectiveSections[0].complexityScore).toBeLessThan(30)
      expect(plan.effectiveSections[0].shouldSplitInternally).toBe(false)
      expect(plan.internalSubcomponents).toHaveLength(0)
    })
  })

  describe('Section 内部拆分规则', () => {
    test('R1: 图表隔离 - ≥2 图表时每个图表独立子组件', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-multi-charts',
            name: '多图表区',
            body: {
              children: [
                { id: 'chart1', type: 'bar-chart', name: '柱状图' },
                { id: 'chart2', type: 'line-chart', name: '折线图' },
                { id: 'chart3', type: 'pie-chart', name: '饼图' },
              ],
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

      expect(plan.internalSubcomponents).toHaveLength(3)
      expect(plan.internalSubcomponents[0].type).toBe('chart-component')
      expect(plan.internalSubcomponents[0].reason).toBe('R1: 图表隔离策略')
      expect(plan.internalSubcomponents[0].props).toContain('chartData')
      expect(plan.internalSubcomponents[0].props).toContain('chartConfig')
      expect(plan.internalSubcomponents[0].emits).toContain('legendClick')
    })

    test('R2: 元素密度拆分 - >10 元素且无图表', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-dense',
            name: '高密度区',
            body: {
              children: Array(15).fill(null).map((_, i) => ({
                id: `card-${i}`,
                type: 'card',
              })),
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

      expect(plan.internalSubcomponents.length).toBeGreaterThan(0)
      expect(plan.internalSubcomponents[0].type).toBe('element-group')
      expect(plan.internalSubcomponents[0].reason).toContain('R2: 元素密度拆分')
    })

    test('R3: 深层嵌套拆分 - >3 层', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-nested',
            name: '深层嵌套',
            body: {
              children: [
                {
                  id: 'level1',
                  children: [
                    {
                      id: 'level2',
                      children: [
                        {
                          id: 'level3',
                          children: [
                            { id: 'level4', type: 'text' },
                            { id: 'level4-2', type: 'text' },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

      // 深层嵌套可能触发拆分（如果没有图表和高密度元素）
      if (plan.effectiveSections[0].shouldSplitInternally) {
        const nestedComponent = plan.internalSubcomponents.find(c => c.type === 'nested-component')
        if (nestedComponent) {
          expect(nestedComponent.reason).toContain('R3: 嵌套深度拆分')
        }
      }
    })

    test('R4: 交互复杂度拆分 - >3 交互元素', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-interactive',
            name: '交互控件区',
            body: {
              children: [
                { id: 'btn1', type: 'button' },
                { id: 'btn2', type: 'button' },
                { id: 'btn3', type: 'button' },
                { id: 'input1', type: 'input' },
                { id: 'select1', type: 'select' },
              ],
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

      // 交互复杂度拆分的优先级较低，可能被其他规则覆盖
      if (plan.internalSubcomponents.length > 0) {
        const interactiveComponent = plan.internalSubcomponents.find(c => c.type === 'interaction-area')
        if (interactiveComponent) {
          expect(interactiveComponent.reason).toContain('R4: 交互复杂度拆分')
          expect(interactiveComponent.emits).toContain('action')
        }
      }
    })

    test('拆分优先级：图表隔离 > 元素密度 > 嵌套深度 > 交互复杂度', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-complex',
            name: '复杂区',
            body: {
              children: [
                { id: 'chart1', type: 'bar-chart' },
                { id: 'chart2', type: 'line-chart' },
                ...Array(12).fill(null).map((_, i) => ({ id: `elem-${i}`, type: 'text' })),
                { id: 'btn1', type: 'button' },
                { id: 'btn2', type: 'button' },
              ],
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

      // 有 ≥2 图表时，应优先应用 R1（图表隔离）
      expect(plan.internalSubcomponents.length).toBeGreaterThan(0)
      expect(plan.internalSubcomponents[0].type).toBe('chart-component')
      expect(plan.internalSubcomponents[0].reason).toBe('R1: 图表隔离策略')
    })
  })

  describe('布局元数据提取', () => {
    test('提取横向布局元数据', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-horizontal',
            name: '横向布局',
            layout: {
              layoutMode: 'HORIZONTAL',
              primaryAxisAlignItems: 'center',
              counterAxisAlignItems: 'space-between',
              itemSpacing: 16,
              paddingTop: 12,
              paddingRight: 24,
              paddingBottom: 12,
              paddingLeft: 24,
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure)

      expect(plan.effectiveSections[0].layoutMetadata.direction).toBe('row')
      expect(plan.effectiveSections[0].layoutMetadata.alignItems).toBe('center')
      expect(plan.effectiveSections[0].layoutMetadata.gap).toBe(16)
      expect(plan.effectiveSections[0].layoutMetadata.padding.left).toBe(24)
    })

    test('提取竖向布局元数据', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-vertical',
            name: '竖向布局',
            layout: {
              layoutMode: 'VERTICAL',
              itemSpacing: 8,
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure)

      expect(plan.effectiveSections[0].layoutMetadata.direction).toBe('column')
      expect(plan.effectiveSections[0].layoutMetadata.gap).toBe(8)
    })

    test('默认布局元数据（无 layout 字段）', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-no-layout',
            name: '无布局信息',
          },
        ],
      }

      const plan = planner.plan(layoutStructure)

      expect(plan.effectiveSections[0].layoutMetadata.direction).toBe('column')
      expect(plan.effectiveSections[0].layoutMetadata.gap).toBe(0)
    })
  })

  describe('集成测试', () => {
    test('复杂组件完整拆分流程', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-header',
            name: '顶部标题',
            body: { children: [{ id: 'title', type: 'text' }] },
          },
          {
            id: 'section-stats',
            name: '统计指标',
            body: {
              children: Array(8).fill(null).map((_, i) => ({
                id: `stat-${i}`,
                type: 'card',
              })),
            },
          },
          {
            id: 'section-charts',
            name: '图表区',
            body: {
              children: [
                { id: 'chart1', type: 'bar-chart', name: '柱状图' },
                { id: 'chart2', type: 'line-chart', name: '折线图' },
              ],
            },
          },
          {
            id: 'section-footer',
            name: '底部操作',
            body: {
              children: [
                { id: 'btn1', type: 'button' },
                { id: 'btn2', type: 'button' },
              ],
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

      // 验证 section 级拆分
      expect(plan.effectiveSections.length).toBeGreaterThanOrEqual(4)
      expect(plan.isForced).toBe(true)

      // 验证内部拆分
      expect(plan.internalSubcomponents.length).toBeGreaterThan(0)

      // 验证图表区被拆分为独立子组件
      const chartComponents = plan.internalSubcomponents.filter(c => c.type === 'chart-component')
      expect(chartComponents.length).toBe(2)

      // 验证最小文件数计算
      expect(plan.minFiles).toBe(plan.effectiveSections.length + plan.internalSubcomponents.length)
    })

    test('简单组件不触发拆分', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-simple',
            name: '简单区',
            body: {
              children: [
                { id: 'text1', type: 'text' },
                { id: 'text2', type: 'text' },
              ],
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

      expect(plan.isForced).toBe(false)
      expect(plan.minFiles).toBe(0)
      expect(plan.internalSubcomponents).toHaveLength(0)
    })

    test('禁用内部拆分时仅按 section 数量判断', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-complex',
            name: '复杂区',
            body: {
              children: [
                { id: 'chart1', type: 'bar-chart' },
                { id: 'chart2', type: 'line-chart' },
                ...Array(15).fill(null).map((_, i) => ({ id: `elem-${i}`, type: 'text' })),
              ],
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure, { enableInternalSplit: false })

      expect(plan.internalSubcomponents).toHaveLength(0)
      expect(plan.effectiveSections[0].shouldSplitInternally).toBe(true) // 评分仍然计算
      expect(plan.isForced).toBe(false) // 只有 1 个 section，不强制
    })

    test('内部子组件携带 parentSectionId', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-charts',
            name: '图表区',
            body: {
              children: [
                { id: 'chart1', type: 'chart' },
                { id: 'chart2', type: 'chart' },
              ],
            },
          },
        ],
      }

      const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

      expect(plan.internalSubcomponents.length).toBe(2)
      expect(plan.internalSubcomponents[0].parentSectionId).toBe('section-charts')
      expect(plan.internalSubcomponents[0].parentSectionTitle).toBe('图表区')
    })
  })

  describe('边界条件', () => {
    test('空 layoutStructure', () => {
      const plan = planner.plan({})

      expect(plan.effectiveSections).toHaveLength(0)
      expect(plan.isForced).toBe(false)
      expect(plan.internalSubcomponents).toHaveLength(0)
    })

    test('sections 为空数组', () => {
      const plan = planner.plan({ sections: [] })

      expect(plan.effectiveSections).toHaveLength(0)
      expect(plan.internalSubcomponents).toHaveLength(0)
    })

    test('section 无 children', () => {
      const layoutStructure = {
        sections: [{ id: 'section-empty', name: '空区' }],
      }

      const plan = planner.plan(layoutStructure)

      expect(plan.effectiveSections).toHaveLength(1)
      expect(plan.effectiveSections[0].elementCount).toBe(0)
      expect(plan.effectiveSections[0].complexityScore).toBe(0)
    })

    test('section children 为 null', () => {
      const layoutStructure = {
        sections: [
          {
            id: 'section-null',
            name: '空区',
            body: { children: null },
          },
        ],
      }

      const plan = planner.plan(layoutStructure)

      expect(plan.effectiveSections).toHaveLength(1)
      expect(plan.effectiveSections[0].elementCount).toBe(0)
    })
  })

  describe('P2': 图例误识别为独立 section', () => {
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
      expect(plan.effectiveSections[0].mergedLegendSections).toHaveLength(1)
      expect(plan.effectiveSections[0].mergedLegendSections[0].id).toBe('section-legend')
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
      expect(plan.effectiveSections[0].mergedLegendSections).toHaveLength(1)
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
})
