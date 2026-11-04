/**
 * V-2 chart 归属强制解析单测（2026-11-04 · bf0f0342 实锤）。
 * 判据链：已锚 → bbox containment → title 语义 → sectionUnresolved 显式标注。
 */
import { resolveChartSectionAnchors } from './chart-anchor-resolver.js'

function node(id, name, x, y, w, h, children) {
  return {
    id,
    name,
    type: 'FRAME',
    absoluteBoundingBox: { x, y, width: w, height: h },
    children: children || [],
  }
}

describe('resolveChartSectionAnchors', () => {
  const figma = node('0:1', 'root', 0, 0, 420, 400, [
    node('2:1', 'tab-bar', 0, 0, 420, 40),
    node('2:2', 'chart-area', 0, 40, 420, 200),
    node('2:3', 'list', 0, 240, 420, 160),
  ])
  const sections = [
    { id: '2:1', name: 'tab-bar' },
    { id: '2:2', name: 'chart-area' },
    { id: '2:3', name: 'list' },
  ]

  test('bf0f0342 场景：section 为 null/None 且无 bbox/title ⇒ 显式 sectionUnresolved，不硬造', () => {
    const charts = [
      { type: 'bar', section: null, title: '', name: '' },
      { type: 'ring', section: 'None' },
    ]
    const stats = resolveChartSectionAnchors(charts, sections, figma)
    expect(stats.total).toBe(2)
    expect(stats.unresolved).toBe(2)
    expect(charts[0].section).toBeNull()
    expect(charts[0].sectionUnresolved).toBe(true)
    expect(charts[1].sectionUnresolved).toBe(true)
    expect(stats.unresolvedDetail.length).toBe(2)
  })

  test('已锚（section 匹配段 id）⇒ alreadyAnchored 且不改写', () => {
    const charts = [{ type: 'bar', section: '2:2' }]
    const stats = resolveChartSectionAnchors(charts, sections, figma)
    expect(stats.alreadyAnchored).toBe(1)
    expect(charts[0].section).toBe('2:2')
    expect(charts[0].sectionUnresolved).toBeUndefined()
  })

  test('bbox containment ⇒ 写入中心点落入的最小段 id', () => {
    const charts = [{ type: 'bar', section: null, bbox: { x: 10, y: 60, width: 100, height: 80 } }]
    const stats = resolveChartSectionAnchors(charts, sections, figma)
    expect(stats.resolvedByBBox).toBe(1)
    expect(charts[0].section).toBe('2:2')
    expect(charts[0].sectionUnresolved).toBeUndefined()
  })

  test('title 与 section.name 互相包含 ⇒ 语义匹配写归属', () => {
    const charts = [{ type: 'line', section: null, title: '车流量趋势图' }]
    const sectionsNamed = [{ id: '2:2', name: '车流量趋势' }]
    const stats = resolveChartSectionAnchors(charts, sectionsNamed, figma)
    expect(stats.resolvedByName).toBe(1)
    expect(charts[0].section).toBe('2:2')
  })

  test('validator 同款包含判据：section 指向段 name 子串 ⇒ alreadyAnchored', () => {
    const charts = [{ type: 'bar', section: 'chart-area' }]
    const stats = resolveChartSectionAnchors(charts, sections, figma)
    expect(stats.alreadyAnchored).toBe(1)
  })

  test('空 charts / 缺 sections / 缺 figma ⇒ skippedReason 且零处理', () => {
    expect(resolveChartSectionAnchors([], sections, figma).skippedReason).toBe('no-charts')
    expect(resolveChartSectionAnchors([{ type: 'bar' }], [], figma).skippedReason).toBe(
      'no-sections-or-figma',
    )
    expect(resolveChartSectionAnchors([{ type: 'bar' }], sections, null).skippedReason).toBe(
      'no-sections-or-figma',
    )
  })
})
