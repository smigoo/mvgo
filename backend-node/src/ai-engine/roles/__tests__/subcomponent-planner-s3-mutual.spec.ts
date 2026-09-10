/**
 * 治本 D（2026-09-10）：S3 多图表拆分 与 planner 内部拆分 互斥。
 *
 * 根因：S3（splitMultiChartSectionIntoChunks）消费 planner R1 已拆出的 chart-component
 * 再包一层 chunk，与 planner 内部拆分正交叠加 → traffic 1 张图裂成 X轴/柱体/分组/图例 各自成件。
 *
 * 本 spec 验证：planner 已对该 section 内部拆分（internalSubcomponents 非空）时，
 * S3 不再二次拆分——一个 section 的图表只产出一次 chunk。
 */
jest.mock('../../logger/index.js', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

import { splitMultiChartSectionIntoChunks } from '../subcomponent-planner.js'

describe('治本D S3 与 planner 内部拆分互斥', () => {
  test('planner 已内部拆分的 section → S3 仅一次产出，不翻倍', () => {
    const plan = {
      effectiveSections: [
        {
          id: 'sec-chart',
          title: '趋势图',
          shouldSplitInternally: true,
          internalSubcomponents: [
            { type: 'chart-component', id: 'chart-1', name: '折线图' },
            { type: 'chart-component', id: 'chart-2', name: '柱状图' },
          ],
        },
      ],
    }
    const chunks = splitMultiChartSectionIntoChunks(plan)
    // planner 已拆 2 个 chart-component → S3 直接映射为 2 chunk（不按每图再二次切）
    expect(chunks.filter((c) => c.segmentType === 'chart')).toHaveLength(2)
  })

  test('planner 未内部拆分的 section → S3 仍按原逻辑拆（行为不变）', () => {
    const plan = {
      effectiveSections: [
        {
          id: 'sec-chart',
          title: '趋势图',
          shouldSplitInternally: false,
          internalSubcomponents: [
            { type: 'chart-component', id: 'chart-1', name: '折线图' },
            { type: 'chart-component', id: 'chart-2', name: '柱状图' },
          ],
        },
      ],
    }
    const chunks = splitMultiChartSectionIntoChunks(plan)
    expect(chunks.filter((c) => c.segmentType === 'chart')).toHaveLength(2)
  })

  test('无 internalSubcomponents 的 section → S3 跳过', () => {
    const plan = { effectiveSections: [{ id: 'sec-plain', internalSubcomponents: [] }] }
    expect(splitMultiChartSectionIntoChunks(plan)).toHaveLength(0)
  })
})
