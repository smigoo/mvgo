/**
 * Loop 2.1.A：把 inlineCompositeRows（bbox 检测到的同行兄弟）真正合并进
 * `layout.sections`，成为 horizontal block 的 children，而不只是写旁路字段。
 * 下游 planner/engineer 优先采用 bbox 推导的 horizontal 行，避免 Vision 误拆竖排。
 */
import { mergeInlineRowsIntoSections } from './inline-row-merger.js'

describe('Loop 2.1.A mergeInlineRowsIntoSections', () => {
  const baseLayout = {
    type: 'vertical',
    direction: 'top-to-bottom',
    sections: [
      { id: 'sec-1', name: '当日总流量', role: 'header', layout: 'vertical', body: { layout: 'vertical', children: [] } },
      { id: 'sec-2', name: '车型分布', role: 'chart', layout: 'vertical', body: { layout: 'vertical', children: [] } },
    ],
  }
  const rows = [
    {
      id: 'parent-1',
      name: 'top-bar',
      layout: 'horizontal',
      members: ['tabs-1', 'icon-2', 'stat-3'],
    },
  ]

  test('空 rows 不改 sections', () => {
    const out = mergeInlineRowsIntoSections(baseLayout, [])
    expect(out.sections).toHaveLength(2)
  })

  test('同行兄弟合并为 horizontal block 的 children', () => {
    const out = mergeInlineRowsIntoSections(baseLayout, rows)
    const inlineBlock = out.sections.find((s) => s.id === 'parent-1')
    expect(inlineBlock).toBeDefined()
    expect(inlineBlock.layout).toBe('horizontal')
    // members 顺序保留（bbox 已是左→右序），figmaNode 指回原始节点 id
    expect(inlineBlock.children.map((c) => c.figmaNode)).toEqual(['tabs-1', 'icon-2', 'stat-3'])
    expect(inlineBlock.figmaNodeId).toBe('parent-1')
  })

  test('合并后原 sections 仍保留（不删业务区块）', () => {
    const out = mergeInlineRowsIntoSections(baseLayout, rows)
    const names = out.sections.map((s) => s.name)
    expect(names).toContain('当日总流量')
    expect(names).toContain('车型分布')
    expect(names).toContain('top-bar')
  })

  test('layoutSource 标记为 inline-row（可供下游优先采用）', () => {
    const out = mergeInlineRowsIntoSections(baseLayout, rows)
    const inlineBlock = out.sections.find((s) => s.id === 'parent-1')
    expect(inlineBlock.layoutSource).toBe('inline-row')
  })
})
