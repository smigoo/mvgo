/**
 * A′（2026-09-10）：容器层级重建单测。
 * 用 device 真值结构钉死：纵向容器重建 / 横向容器重建（T-TOPO 2026-11-05）/ env 安全跳过 /
 * 无 figmaData 零回归 / 非候选（子不在顶层）不重建。
 */
import {
  rebuildSlotConContainers,
  flattenContainerSections,
} from './container-rebuilder.js'

// device 真值（figma.json）：slot-con(89:40) 含 switch(89:38, y475 h65 横向) + @antd/tab(89:37, y538 h317 竖向)
function figmaNode(
  id: string,
  name: string,
  y: number,
  w: number,
  h: number,
  children?: any[],
  x = 1475,
) {
  return {
    id,
    name,
    type: 'FRAME',
    absoluteBoundingBox: { x, y, width: w, height: h },
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

  it('非候选：容器自身已是顶层 section 或子节点不在顶层 ⇒ 不重建（与方向无关）', () => {
    const out = rebuildSlotConContainers({ sections: sections.slice() }, figmaTree)
    // 2:8437(cons) 的 12 个 cons-i 子节点都不在顶层 sections ⇒ allChildrenInSections=false
    expect(out.sections.find((s: any) => s.id === '2:8437')).toBeUndefined()
    // 原顶层 sections 不受影响（除被消费的 switch/tab 与新增的 89:40）
    expect(out.sections.find((s: any) => s.id === 'section-header')).toBeDefined()
    expect(out.sections.find((s: any) => s.id === 'section-main')).toBeDefined()
  })

  // 🛡️ T-TOPO（2026-11-05 · mc-max-1793880532372-38f97905 实锤）：横向容器必须重建。
  //   旧实现把横向「交给 merger」，但 merger 在 `preserveVisionStructure:true` 下只做浅拷贝
  //   ⇒ 89:37 @antd/tab 的左右两栏变成平级段 ⇒ 生成 flex-direction: column（本刀要修的 bug）。
  describe('T-TOPO 横向容器重建', () => {
    // 真机结构：89:37 @antd/tab = 左栏 89:39 tabs(46×317) + 右栏 2:8437 cons(367×295)
    // figma children 刻意**倒序**（右栏在前），用于证明 children 按 bbox.x 升序而非数组顺序。
    const topoFigma = {
      document: figmaNode('root', 'root', 0, 420, 800, [
        figmaNode('2:8417', 'cp-设备监测', 433, 420, 425, [
          figmaNode('89:37', '@antd/tab', 538, 407, 317, [
            figmaNode('2:8437', 'cons', 550, 367, 295, undefined, 1518),
            figmaNode('89:39', 'tabs', 538, 46, 317, undefined, 1475),
          ]),
        ]),
      ]),
    }
    const topoSections = [
      { id: '2:8419', name: '设备监测', type: 'stats', body: { children: [] } },
      { id: '89:39', name: '左侧导航Tab', type: 'tabs', body: { children: [] } },
      { id: '2:8437', name: '设备卡片网格', type: 'grid', body: { children: [] } },
    ]

    it('89:37 被重建为 layout:horizontal 的嵌套容器', () => {
      const out = rebuildSlotConContainers({ sections: topoSections.slice() }, topoFigma)
      const c = out.sections.find((s: any) => s.id === '89:37')
      expect(c).toBeDefined()
      expect(c.layoutSource).toBe('container-rebuild')
      expect(c.layout).toBe('horizontal')
      expect(c.body.layout).toBe('horizontal')
      // 左右两栏不再是顶层平级
      expect(out.sections.find((s: any) => s.id === '89:39')).toBeUndefined()
      expect(out.sections.find((s: any) => s.id === '2:8437')).toBeUndefined()
      // 顶层从 3 段收敛为 2 段：2:8419 叶 + 89:37 容器
      expect(out.sections.map((s: any) => s.id)).toEqual(['2:8419', '89:37'])
    })

    it('children 按 bbox.x 升序（与 figma children 数组顺序无关）', () => {
      const out = rebuildSlotConContainers({ sections: topoSections.slice() }, topoFigma)
      const c = out.sections.find((s: any) => s.id === '89:37')
      expect(c.children.map((k: any) => k.id)).toEqual(['89:39', '2:8437'])
    })

    it('横向容器展平后子项带 parentContainerId（下游 planner 提示不丢）', () => {
      const out = rebuildSlotConContainers({ sections: topoSections.slice() }, topoFigma)
      const flat = flattenContainerSections(out.sections)
      expect(flat.map((s: any) => s.id)).toEqual(['2:8419', '89:39', '2:8437'])
      expect(flat.find((s: any) => s.id === '89:39').parentContainerId).toBe('89:37')
    })

    it('纵向容器仍判 vertical（方向判据未被 T-TOPO 改坏）', () => {
      // 上下堆叠：y 不重叠 ⇒ vertical
      const vFigma = {
        document: figmaNode('root', 'root', 0, 420, 800, [
          figmaNode('c-v', 'stack', 0, 400, 300, [
            figmaNode('a', 'A', 10, 400, 100, undefined, 1475),
            figmaNode('b', 'B', 150, 400, 100, undefined, 1475),
          ]),
        ]),
      }
      const vSections = [
        { id: 'a', name: 'A', body: { children: [] } },
        { id: 'b', name: 'B', body: { children: [] } },
      ]
      const out = rebuildSlotConContainers({ sections: vSections.slice() }, vFigma)
      const c = out.sections.find((s: any) => s.id === 'c-v')
      expect(c).toBeDefined()
      expect(c.layout).toBe('vertical')
    })
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
