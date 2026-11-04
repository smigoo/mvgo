/**
 * V-3 vision 段序几何审计单测（2026-11-04 · 6f926db0 实锤）。
 * 窄判据：锚点全有效 + 严格垂直堆叠 + 数组序≠y 序 ⇒ 按几何纠正；其余一律不动。
 */
import { auditVisionSectionOrder } from './vision-order-auditor.js'

function node(id, name, x, y, w, h, children) {
  return {
    id,
    name,
    type: 'FRAME',
    absoluteBoundingBox: { x, y, width: w, height: h },
    children: children || [],
  }
}

describe('auditVisionSectionOrder', () => {
  const figma = node('0:1', 'root', 0, 0, 420, 400, [
    node('2:1', 'tab-bar', 0, 0, 420, 40),
    node('2:2', 'icon-actions', 0, 40, 420, 60),
    node('2:3', 'chart-area', 0, 100, 420, 300),
  ])

  test('垂直堆叠 + 错序 ⇒ 按 y 序纠正并留痕 from/to', () => {
    const sections = [
      { id: '2:2', name: 'icon-actions' },
      { id: '2:1', name: 'tab-bar' },
      { id: '2:3', name: 'chart-area' },
    ]
    const { sections: out, stats } = auditVisionSectionOrder(sections, figma)
    expect(stats.evaluated).toBe(1)
    expect(stats.mismatch).toBe(1)
    expect(stats.reordered).toBe(true)
    expect(stats.order.from).toEqual(['2:2', '2:1', '2:3'])
    expect(stats.order.to).toEqual(['2:1', '2:2', '2:3'])
    expect(out.map((s) => s.id)).toEqual(['2:1', '2:2', '2:3'])
    expect(sections.map((s) => s.id)).toEqual(['2:2', '2:1', '2:3'])
  })

  test('已按 y 序排列 ⇒ 不动、mismatch=0', () => {
    const sections = [
      { id: '2:1', name: 'tab-bar' },
      { id: '2:2', name: 'icon-actions' },
      { id: '2:3', name: 'chart-area' },
    ]
    const { sections: out, stats } = auditVisionSectionOrder(sections, figma)
    expect(stats.mismatch).toBe(0)
    expect(stats.reordered).toBe(false)
    expect(out).toBe(sections)
  })

  test('锚点缺失 ⇒ skipped=unanchored-sections 且不动', () => {
    const sections = [
      { id: '2:1', name: 'tab-bar' },
      { id: '9:9', name: 'hallucinated' },
    ]
    const { sections: out, stats } = auditVisionSectionOrder(sections, figma)
    expect(stats.skippedReason).toBe('unanchored-sections')
    expect(stats.evaluated).toBe(0)
    expect(out).toBe(sections)
  })

  test('水平并排（x 无重叠）⇒ skipped=not-strictly-vertical 且不动', () => {
    const figmaRow = node('0:2', 'root', 0, 0, 420, 100, [
      node('3:1', 'left', 0, 0, 200, 100),
      node('3:2', 'right', 220, 0, 200, 100),
    ])
    const sections = [
      { id: '3:1', name: 'left' },
      { id: '3:2', name: 'right' },
    ]
    const { sections: out, stats } = auditVisionSectionOrder(sections, figmaRow)
    expect(stats.skippedReason).toBe('not-strictly-vertical')
    expect(out).toBe(sections)
  })

  test('y 相同（同排段）⇒ 稳定保持原相对序，无客观矛盾不重排', () => {
    const figmaSame = node('0:3', 'root', 0, 0, 420, 100, [
      node('4:1', 'a', 0, 0, 400, 40),
      node('4:2', 'b', 0, 40, 400, 40),
      node('4:3', 'c', 0, 40, 400, 40),
    ])
    const sections = [
      { id: '4:1', name: 'a' },
      { id: '4:3', name: 'c' },
      { id: '4:2', name: 'b' },
    ]
    const { sections: out, stats } = auditVisionSectionOrder(sections, figmaSame)
    expect(stats.evaluated).toBe(1)
    expect(stats.mismatch).toBe(0)
    expect(stats.reordered).toBe(false)
    expect(out).toBe(sections)
  })

  test('合成段 id（非 N:M 形态）⇒ 视为未锚定，不动', () => {
    const sections = [
      { id: '2:1-list', name: 'list' },
      { id: '2:3', name: 'chart-area' },
    ]
    const { sections: out, stats } = auditVisionSectionOrder(sections, figma)
    expect(stats.skippedReason).toBe('unanchored-sections')
    expect(out).toBe(sections)
  })

  test('段数不足 / 无 figma 数据 ⇒ 跳过且不动', () => {
    const one = [{ id: '2:1', name: 'tab-bar' }]
    expect(auditVisionSectionOrder(one, figma).stats.skippedReason).toBe('insufficient-sections')
    const two = [
      { id: '2:1', name: 'tab-bar' },
      { id: '2:2', name: 'icon-actions' },
    ]
    expect(auditVisionSectionOrder(two, null).stats.skippedReason).toBe('no-figma-data')
  })
})
