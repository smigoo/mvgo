/**
 * A′（2026-09-10）：纵向容器层级重建单测。
 * 用 device 真值结构钉死：容器重建 / 横向不重建 / env 安全跳过 / 无 figmaData 零回归。
 */
import {
  rebuildSlotConContainers,
  flattenContainerSections,
} from './container-rebuilder.js'

// device 真值（figma.json）：slot-con(89:40) 含 switch(89:38, y475 h65 横向) + @antd/tab(89:37, y538 h317 竖向)
function figmaNode(id: string, name: string, y: number, w: number, h: number, children?: any[]) {
  return {
    id,
    name,
    type: 'FRAME',
    absoluteBoundingBox: { x: 1475, y, width: w, height: h },
    children: children || [],
  }
}

const figmaTree = {
  document: figmaNode('root', 'root', 0, 420, 800, [
    figmaNode('2:8417', 'cp-设备监测', 433, 420, 425, [
      figmaNode('89:40', 'slot-con', 475, 407, 380, [
        figmaNode('89:38', 'switch', 475, 396, 65),
        figmaNode('89:37', '@antd/tab', 538, 46, 317),
      ]),
      // 横向 grid 容器（不应被重建）：cons 含 12 个左右并列子
      figmaNode(
        '2:8437',
        'cons',
        550,
        367,
        295,
        Array.from({ length: 12 }, (_, i) =>
          figmaNode(`cons-${i}`, 'Group', 550 + (i % 3) * 117, 117, 64),
        ),
      ),
    ]),
  ]),
}

const sections = [
  { id: 'section-header', name: '头部统计指标区', role: '常驻', layout: 'horizontal', body: { layout: 'vertical', children: [] } },
  { id: 'section-main', name: '主内容区', role: '常驻', layout: 'horizontal', body: { layout: 'vertical', children: [] } },
  { id: '89:38', name: 'switch', layoutSource: 'inline-row', body: { layout: 'horizontal', children: [] } },
  { id: '89:37', name: '@antd/tab', layoutSource: 'inline-row', body: { layout: 'vertical', children: [] } },
]

describe('rebuildSlotConContainers', () => {
  it('device 真值：slot-con 纵向容器被重建为嵌套 section（children=[switch, tab]）', () => {
    const out = rebuildSlotConContainers({ sections: sections.slice() }, figmaTree)
    const rebuilt = out.sections.find((s: any) => s.id === '89:40')
    expect(rebuilt).toBeDefined()
    expect(rebuilt.layoutSource).toBe('container-rebuild')
    expect(rebuilt.layout).toBe('vertical')
    expect(rebuilt.children.map((c: any) => c.id)).toEqual(['89:38', '89:37'])
    // member 不再作为顶层平级 section
    expect(out.sections.find((s: any) => s.id === '89:38')).toBeUndefined()
    expect(out.sections.find((s: any) => s.id === '89:37')).toBeUndefined()
    // 容器插入到原 switch 的位置（保持 Y 顺序）
    const idx = out.sections.findIndex((s: any) => s.id === '89:40')
    expect(out.sections[idx - 1].id).toBe('section-main')
  })

  it('横向容器（device cons 12 子 grid）不被重建，保留 merger 行为', () => {
    const out = rebuildSlotConContainers({ sections: sections.slice() }, figmaTree)
    expect(out.sections.find((s: any) => s.id === '2:8437')).toBeUndefined()
    // 原顶层 sections 不受影响（除被消费的 switch/tab 与新增的 89:40）
    expect(out.sections.find((s: any) => s.id === 'section-header')).toBeDefined()
    expect(out.sections.find((s: any) => s.id === 'section-main')).toBeDefined()
  })

  it('env 样本：slot-con 仅 1 子命中顶层 → 安全跳过，原样返回', () => {
    // env 89:41 含 2 子，但只有 89:42 在顶层 sections
    const envFigma = {
      document: figmaNode('root', 'root', 0, 380, 400, [
        figmaNode('89:41', 'slot-con', 898, 380, 145, [
          figmaNode('89:42', 'sub-t', 898, 380, 32),
          figmaNode('2:7898', '@echarts/line', 930, 380, 113),
        ]),
      ]),
    }
    const envSections = [
      { id: 'section-tabs', name: 'Tab切换栏', body: { children: [] } },
      { id: '89:42', name: 'sub-t', layoutSource: 'inline-row', body: { children: [] } },
    ]
    const out = rebuildSlotConContainers({ sections: envSections }, envFigma)
    // 不重建 89:41（仅 1 子命中）
    expect(out.sections.find((s: any) => s.id === '89:41')).toBeUndefined()
    expect(out.sections.map((s: any) => s.id)).toEqual(['section-tabs', '89:42'])
  })

  it('无 figmaData → 零回归，原样返回', () => {
    const input = { sections: sections.slice() }
    const out = rebuildSlotConContainers(input, null as any)
    expect(out.sections.map((s: any) => s.id)).toEqual(sections.map((s) => s.id))
  })

  it('flattenContainerSections：容器展平为带 parentContainerId 的子项', () => {
    const out = rebuildSlotConContainers({ sections: sections.slice() }, figmaTree)
    const flat = flattenContainerSections(out.sections)
    // 容器本身不在 flat 列表，其 children 展开为顶层项并带 parentContainerId
    expect(flat.find((s: any) => s.id === '89:40')).toBeUndefined()
    const sw = flat.find((s: any) => s.id === '89:38')
    const tab = flat.find((s: any) => s.id === '89:37')
    expect(sw).toBeDefined()
    expect(tab).toBeDefined()
    expect(sw.parentContainerId).toBe('89:40')
    expect(tab.parentContainerId).toBe('89:40')
    // 总项数：section-header + section-main + 2 展开子 = 4（原 4 项，容器替换 2 项）
    expect(flat.length).toBe(4)
  })
})
