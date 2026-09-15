/**
 * PreviewAnalysisValidator 图表完整性规则回归
 *
 * 🛡️ 2026-09-15（mc-1789445437366-5b19ce4f 实锤）：
 * 视觉分析把「图例/阈值线」的事实丢在了事实源之外 ——
 *   - `legend: []` 却填 `legendPosition/legendType` → 下游「有图例必生成 legend」无着力点 → 图例丢失
 *   - 阈值线只写在 `notes` 里 → 被拆成图表容器外的 DOM 标注（markLine 归属错误）
 * 本 spec 锁死这两条反向一致性判据（同一 CHART-xx 规则族，不新增规则族）。
 */
import { PreviewAnalysisValidator } from './preview-analysis-validator'

const baseAnalysis = (charts: any[]) => ({
  layout: { sections: [{ id: 'chart-section', name: '图表', body: { layout: 'vertical', children: [] } }] },
  styles: { backgroundBrightness: 'light', theme: '浅色数据监测风' },
  interactions: [],
  charts,
})

const ids = (res: any) => res.errors.map((e: any) => e.id)
const msgs = (res: any) => res.errors.map((e: any) => e.message).join('\n')

describe('PreviewAnalysisValidator —— 图表图例/阈值线反向一致性', () => {
  it('legendPosition 已填但 legend 为空 → 报 CHART-01-c（真机 6004/5437 形态）', () => {
    const res = PreviewAnalysisValidator.validate(
      baseAnalysis([
        {
          section: 'chart-section',
          type: 'area',
          series: ['一氧化碳浓度'],
          legend: [],
          legendPosition: 'top-right',
          legendType: 'horizontal',
        },
      ]),
    )

    expect(ids(res)).toContain('CHART-01-c')
    expect(msgs(res)).toContain('legend 为空')
    expect(res.warnCount).toBeGreaterThan(0)
    // WARN 级不阻塞
    expect(res.pass).toBe(true)
  })

  it('图例字段配齐（legend + position + type + colors）→ 不报图例类告警', () => {
    const res = PreviewAnalysisValidator.validate(
      baseAnalysis([
        {
          section: 'chart-section',
          type: 'area',
          series: ['北京方向', '上海方向'],
          legend: ['北京方向', '上海方向'],
          legendPosition: 'top-right',
          seriesColors: ['#1890ff', '#52c41a'],
          legendType: 'horizontal',
        },
      ]),
    )

    expect(ids(res).filter((id: string) => /^CHART-01/.test(id))).toEqual([])
  })

  it('notes 提到阈值线但缺 markLine → 报 CHART-01-d', () => {
    const res = PreviewAnalysisValidator.validate(
      baseAnalysis([
        {
          section: 'chart-section',
          type: 'area',
          series: ['一氧化碳浓度'],
          legend: ['一氧化碳浓度'],
          legendPosition: 'top-right',
          seriesColors: ['#0fcd7d'],
          legendType: 'horizontal',
          notes: ['红色虚线标注阈值线（约30位置）'],
        },
      ]),
    )

    expect(ids(res)).toContain('CHART-01-d')
    expect(msgs(res)).toContain('markLine')
  })

  it('markLine 结构化后 → 不再报 CHART-01-d', () => {
    const res = PreviewAnalysisValidator.validate(
      baseAnalysis([
        {
          section: 'chart-section',
          type: 'area',
          series: ['一氧化碳浓度'],
          legend: ['一氧化碳浓度'],
          legendPosition: 'top-right',
          seriesColors: ['#0fcd7d'],
          legendType: 'horizontal',
          markLine: [
            { axis: 'y', value: 30, label: '预警线', color: '#ff5555', lineStyle: 'dashed' },
          ],
          notes: ['红色虚线标注阈值线（约30位置）'],
        },
      ]),
    )

    expect(ids(res)).not.toContain('CHART-01-d')
  })

  it('无图例且无阈值线的普通图表 → 不误报', () => {
    const res = PreviewAnalysisValidator.validate(
      baseAnalysis([
        {
          section: 'chart-section',
          type: 'bar',
          series: ['流量'],
          legend: [],
          notes: ['X轴为小时'],
        },
      ]),
    )

    expect(ids(res).filter((id: string) => /^CHART-/.test(id))).toEqual([])
  })

  it('chart.section 不在 layout.sections（id/name 均不匹配）→ 报 CHART-01-e（07e31fbb 归属缺失）', () => {
    const res = PreviewAnalysisValidator.validate(
      baseAnalysis([
        {
          section: 'chart-container', // 不在 layout.sections（只有 chart-section）
          type: 'doughnut',
          series: ['交通事故'],
          legend: ['交通事故'],
          legendPosition: 'top-right',
          seriesColors: ['#ff6262'],
          legendType: 'horizontal',
        },
      ]),
    )

    expect(ids(res)).toContain('CHART-01-e')
    expect(msgs(res)).toContain('chart-container')
    expect(res.warnCount).toBeGreaterThan(0)
    expect(res.pass).toBe(true) // WARN 不阻塞
  })

  it('chart.section 与 layout.sections.id 匹配 → 不报归属告警', () => {
    const res = PreviewAnalysisValidator.validate(
      baseAnalysis([
        {
          section: 'chart-section',
          type: 'bar',
          series: ['流量'],
          legend: [],
          notes: ['X轴为小时'],
        },
      ]),
    )

    expect(ids(res)).not.toContain('CHART-01-e')
  })
})
