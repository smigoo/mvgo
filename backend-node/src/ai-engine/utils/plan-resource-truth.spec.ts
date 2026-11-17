/**
 * 🛡️ P0-R（2026-11-17 · mc-max-1794878113452-ebc85839 实锤）：plan 段资源字段事实源校正。
 * plan 的 body.children[].resourceFile 是 LLM 分段时自己填的——1:477（icon-statistics
 * 24×24 统计小图标）被填成 icon-1-385.png（桥图标）⇒ 桥图标脱离告警行渲染在页面中部，
 * 正确资源零消费。以 mapping 的 figmaNodeId 精确匹配（唯一事实源）校正。
 */
import { correctPlanResourceFiles } from './plan-resource-truth.js'

const MAPPING = [
  { figmaNodeId: '1:385', name: 'icon-1', resourceFile: '../resources/images/icon-1-385.png', semanticVarName: 'icon1', downloadStatus: 'success' },
  { figmaNodeId: '1:397', name: 'icon-1', resourceFile: '../resources/images/icon-1-385.png', semanticVarName: 'icon1_2', downloadStatus: 'success' },
  { figmaNodeId: '1:409', name: 'icon-2', resourceFile: '../resources/images/icon-2-409.png', semanticVarName: 'icon2', downloadStatus: 'success' },
  { figmaNodeId: '1:477', name: 'icon-statistics', resourceFile: '../resources/images/icon-statistics-477.png', semanticVarName: 'iconstatistics', downloadStatus: 'success' },
]

describe('correctPlanResourceFiles · plan 资源字段事实源校正（ebc85839 实锤）', () => {
  it('阳性：错配（1:477 填了 icon-1-385）⇒ 校正为 mapping 真值 + varName 同步', () => {
    const sections = [
      { id: '1:477', body: { children: [{ id: '1:477', figmaNode: '1:477', resourceFile: '../resources/images/icon-1-385.png', resourceVarName: 'icon1' }] } },
    ]
    const stats = correctPlanResourceFiles(sections, MAPPING)
    expect(stats.corrected).toBe(1)
    expect(sections[0].body.children[0].resourceFile).toContain('icon-statistics-477')
    expect(sections[0].body.children[0].resourceVarName).toBe('iconstatistics')
  })

  it('阴性：同名复用合法（1:397 用 icon-1-385.png，mapping 本身如此）⇒ 不动', () => {
    const sections = [
      { id: '1:388', body: { children: [{ id: '1:397', figmaNode: '1:397', resourceFile: '../resources/images/icon-1-385.png', resourceVarName: 'icon1_2' }] } },
    ]
    expect(correctPlanResourceFiles(sections, MAPPING).corrected).toBe(0)
  })

  it('阴性：正确条目零改动', () => {
    const sections = [
      { id: '1:377', body: { children: [{ id: '1:385', figmaNode: '1:385', resourceFile: '../resources/images/icon-1-385.png' }] } },
      { id: '1:400', body: { children: [{ id: '1:409', figmaNode: '1:409', resourceFile: '../resources/images/icon-2-409.png' }] } },
    ]
    expect(correctPlanResourceFiles(sections, MAPPING).corrected).toBe(0)
  })

  it('幂等：校正后复跑零增量', () => {
    const sections = [
      { id: '1:477', body: { children: [{ id: '1:477', figmaNode: '1:477', resourceFile: '../resources/images/icon-1-385.png', resourceVarName: 'icon1' }] } },
    ]
    correctPlanResourceFiles(sections, MAPPING)
    expect(correctPlanResourceFiles(sections, MAPPING).corrected).toBe(0)
  })

  it('fail-open：mapping 非数组/为空 ⇒ 零计数不抛', () => {
    const sections = [{ id: 'a', body: { children: [{ id: 'a', resourceFile: 'x.png' }] } }]
    expect(correctPlanResourceFiles(sections, null).corrected).toBe(0)
    expect(correctPlanResourceFiles(sections, []).corrected).toBe(0)
    expect(correctPlanResourceFiles(null, MAPPING).corrected).toBe(0)
  })

  it('downloadStatus 非 success 的 mapping 条目不作为事实源', () => {
    const sections = [
      { id: 'x', body: { children: [{ id: '1:477', figmaNode: '1:477', resourceFile: '../resources/images/icon-1-385.png' }] } },
    ]
    const badMapping = [{ figmaNodeId: '1:477', resourceFile: '../resources/images/missing.png', downloadStatus: 'missing' }]
    expect(correctPlanResourceFiles(sections, badMapping).corrected).toBe(0)
  })
})
