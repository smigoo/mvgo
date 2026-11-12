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

// ═══════════════════════════════════════════════════════════════
// 🛡️ v3 半提升回收（2026-11-12 · mc-1794474674611-37ed205e / 97af5197 实锤）
//   vision 把 section 的部分直接子提升为顶层（1744:127/128 柱状图组被提走），
//   all-or-nothing 判据放弃 ⇒ 柱状图拆成独立组件挂页面底部。
//   回收判据 = 树父子关系（唯一、防抢占）∧ bbox 完整包含（容差 2px）。
// ═══════════════════════════════════════════════════════════════
describe('v3 半提升回收', () => {
  // 流量监测真实坐标（微缩版）：
  //   1744:125 slot-con(426×745 @y158)
  //     88:33 当日总流量(426×556 @y158) —— 树上 4 子：88:32/2:3660/1744:127/1744:128
  //     2:3438 车型分布(387×142 @y573)  —— 注意：bbox 几乎全落 88:33 框内（slot 重叠死区）
  //     83:30 流量预测(378×174 @y730)
  //   vision 顶层只给了 [1744:125(嵌套 88:33/2:3438/83:30), 1744:127, 1744:128]
  const trafficFigma = {
    document: {
      id: 'root',
      name: 'root',
      type: 'DOCUMENT',
      absoluteBoundingBox: { x: 0, y: 0, width: 500, height: 1100 },
      children: [
        {
          id: '1744:125',
          name: 'slot-con',
          type: 'FRAME',
          absoluteBoundingBox: { x: 10, y: 158, width: 426, height: 745 },
          children: [
            {
              id: '88:33',
              name: 'slot-当日总流量',
              type: 'FRAME',
              absoluteBoundingBox: { x: 10, y: 158, width: 426, height: 556 },
              children: [
                { id: '88:32', name: 'sub-header', type: 'FRAME', absoluteBoundingBox: { x: 35, y: 158, width: 380, height: 30 }, children: [] },
                { id: '2:3660', name: '统计', type: 'FRAME', absoluteBoundingBox: { x: 10, y: 196, width: 426, height: 91 }, children: [] },
                { id: '1744:127', name: '1', type: 'FRAME', absoluteBoundingBox: { x: 33, y: 287, width: 379, height: 131 }, children: [] },
                { id: '1744:128', name: '2', type: 'FRAME', absoluteBoundingBox: { x: 33, y: 428, width: 379, height: 131 }, children: [] },
              ],
            },
            {
              id: '2:3438',
              name: 'slot-车型分布',
              type: 'FRAME',
              absoluteBoundingBox: { x: 30, y: 573, width: 387, height: 142 },
              children: [],
            },
            {
              id: '83:30',
              name: 'slot-流量预测',
              type: 'FRAME',
              absoluteBoundingBox: { x: 30, y: 730, width: 378, height: 174 },
              children: [],
            },
          ],
        },
      ],
    },
  }

  it('① 半提升形态：被 vision 提为顶层的树直接子（1744:127/128）回收进 88:33，按 y 序排尾', () => {
    const layout = {
      sections: [
        {
          id: '1744:125',
          name: 'slot-con',
          role: 'content-container',
          layoutSource: 'container-rebuild',
          children: [
            { id: '88:33', name: '当日总流量', role: '常驻', layout: 'vertical' },
            { id: '2:3438', name: '车型分布', role: '常驻', layout: 'vertical' },
            { id: '83:30', name: '流量预测', role: '常驻', layout: 'vertical' },
          ],
        },
        { id: '1744:127', name: '江阴靖江长江隧道流量', role: '常驻', layout: 'vertical' },
        { id: '1744:128', name: '江阴大桥流量', role: '常驻', layout: 'vertical' },
      ],
    }
    const out = rebuildSlotConContainers(layout, trafficFigma as any)
    // 顶层不再有 1744:127/128
    expect(out.sections.find((s: any) => s.id === '1744:127')).toBeUndefined()
    expect(out.sections.find((s: any) => s.id === '1744:128')).toBeUndefined()
    // 回收进 88:33.children（树对象，非 body 镜像克隆）
    const daily = out.sections[0].children.find((c: any) => c.id === '88:33')
    expect(daily.children.map((c: any) => c.id)).toEqual(['1744:127', '1744:128'])
    expect(daily.reclaimedChildren).toEqual(['1744:127', '1744:128'])
  })

  it('② 阴性钉：bbox 包含但非树直接子（2:3438 落 88:33 框内）绝不被抢走', () => {
    const layout = {
      sections: [
        {
          id: '1744:125',
          name: 'slot-con',
          children: [
            { id: '88:33', name: '当日总流量' },
            { id: '2:3438', name: '车型分布' },
            { id: '83:30', name: '流量预测' },
          ],
        },
      ],
    }
    const out = rebuildSlotConContainers(layout, trafficFigma as any)
    const con = out.sections[0]
    // 2:3438 仍属 1744:125，没有被 88:33 抢走（虽然它 bbox 几乎全落 88:33 框内）
    expect(con.children.map((c: any) => c.id)).toEqual(['88:33', '2:3438', '83:30'])
  })

  it('③ 幂等：回收后再跑一遍结果不变', () => {
    const layout = {
      sections: [
        {
          id: '1744:125',
          name: 'slot-con',
          children: [
            { id: '88:33', name: '当日总流量' },
            { id: '2:3438', name: '车型分布' },
            { id: '83:30', name: '流量预测' },
          ],
        },
        { id: '1744:127', name: '1' },
        { id: '1744:128', name: '2' },
      ],
    }
    const once = rebuildSlotConContainers(layout, trafficFigma as any)
    const twice = rebuildSlotConContainers(once, trafficFigma as any)
    expect(JSON.stringify(twice)).toEqual(JSON.stringify(once))
  })
})
