/**
 * 历史回放回归夹具 —— 组件 mc-max-1786873908060-3b0eb599 视觉分析可信度。
 *
 * 历史事故：视觉分析 reviewResult.coverageReport 报告 matchedCount=0、coverageRate=0，
 * 却又在 layoutStructure / charts 中识别出大量区块与图表，分析结论自相矛盾（可信度存疑）。
 * 旧链路对此直接放行，导致工程师盲写。新门禁 evaluateVisualTrustVerdict 必须将其判为
 * 'conflict'，下游 visual-parser 节点据此标记 _visualDegraded，工程师随之拒绝盲写。
 */
import { evaluateVisualTrustVerdict } from '../utils/visual-trust.js'

describe('regression: mc-max-1786873908060-3b0eb599 视觉可信度', () => {
  it('历史回放：coverageRate=0 却识别结构 → conflict', () => {
    const parsed = {
      coverageReport: { matchedCount: 0, coverageRate: 0 },
      layoutStructure: { sections: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      charts: [{ type: 'line' }],
    }
    const r = evaluateVisualTrustVerdict(parsed)
    expect(r.verdict).toBe('conflict')
    expect(r.coverageRate).toBe(0)
    expect(r.recognizedSections).toBeGreaterThan(0)
  })

  it('历史回放：真实产物快照结构（coverageReport 嵌套在 layoutStructure）也被判 conflict', () => {
    const parsed = {
      layoutStructure: {
        sections: [{ id: 'panel-title' }, { id: 'metric-tabs' }, { id: 'co2-trend-chart' }],
        coverageReport: { matchedCount: 0, coverageRate: 0 },
      },
      charts: [{ type: 'line' }],
    }
    const r = evaluateVisualTrustVerdict(parsed)
    expect(r.verdict).toBe('conflict')
  })

  it('对照：覆盖率正常(>=60) 且结构一致 → trusted', () => {
    const parsed = {
      coverageReport: { matchedCount: 28, coverageRate: 96 },
      layoutStructure: { sections: [{ id: 'a' }] },
    }
    expect(evaluateVisualTrustVerdict(parsed).verdict).toBe('trusted')
  })

  it('对照：无覆盖率数据（纯截图任务）→ warning 而非误判', () => {
    const parsed = { layoutStructure: { sections: [{ id: 'a' }] } }
    const r = evaluateVisualTrustVerdict(parsed)
    expect(r.verdict).toBe('warning')
    expect(r.coverageRate).toBeNull()
  })
})
