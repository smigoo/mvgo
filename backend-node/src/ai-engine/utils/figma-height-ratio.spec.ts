import {
  collectFigmaNodes,
  collectSiblingGroups,
  collectSectionRegions,
  elementMatchPatterns,
  findFigmaNodeForElement,
  applyFigmaSectionRatios,
  applyFigmaElementHeightRatios,
  mergeVisualRows,
} from './figma-height-ratio.js'

/**
 * A4 元素级**高度比例**覆盖（2026-09-03，实测修正匹配键）。
 *
 * 关键修正：vision 元素 name/role 多为中文、figma 节点为英文
 * （tab/switch）→ 原「按 name 精确匹配」在真实数据上全 miss（no-op）。
 * 改为以元素 `type`（英文）+ 文档顺序配对，与现有 section 级 role 关键词覆盖一致。
 *
 * 约束：
 *  ① 高度是**比例**不是固定 px（组件需自适应宿主高度）；
 *  ② 同组统一比例量级（~1），不触犯 FLEX-004 的「flex-grow 量纲混用」；
 *  ③ 放主生成链：generate 模式跳过 layout-refiner（原比例修正环节）。
 */

function figmaDoc(children: any[]) {
  return {
    name: 'cp-demo',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 425 },
    children,
  }
}

describe('collectFigmaNodes', () => {
  it('@技术栈节点取子节点最大宽高作为有效尺寸', () => {
    const doc = figmaDoc([
      {
        id: 't1',
        name: '@antd/tab',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [
          { id: 't2', name: 'tabs', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 46, height: 317 } },
        ],
      },
    ])
    const nodes = collectFigmaNodes(doc)
    const tab = nodes.find((n) => n.name === '@antd/tab')
    expect(tab?.isTechComponent).toBe(true)
    expect(tab?.effectiveW).toBe(46)
    expect(tab?.effectiveH).toBe(317)
    expect(tab?._id).toBe('t1')
  })

  it('无名称/无 bbox 的节点被跳过', () => {
    const doc = {
      type: 'FRAME',
      children: [{ type: 'FRAME' }, { name: 'x', type: 'TEXT' }],
    }
    expect(collectFigmaNodes(doc).length).toBe(0)
  })
})

describe('collectSiblingGroups（兼容 children 与 items）', () => {
  it('children 递归收集所有兄弟组（含嵌套）', () => {
    const body = { children: [{ id: 'a' }, { id: 'b', children: [{ id: 'b1' }, { id: 'b2' }] }] }
    const groups = collectSiblingGroups(body)
    expect(groups.length).toBe(2)
    expect(groups[0].map((n: any) => n.id)).toEqual(['a', 'b'])
    expect(groups[1].map((n: any) => n.id)).toEqual(['b1', 'b2'])
  })

  it('items schema 同样收集', () => {
    const body = { items: [{ id: 'x' }, { id: 'y' }] }
    const groups = collectSiblingGroups(body)
    expect(groups.length).toBe(1)
    expect(groups[0].map((n: any) => n.id)).toEqual(['x', 'y'])
  })
})

describe('elementMatchPatterns / findFigmaNodeForElement', () => {
  it('type 关键词命中 figma 节点（中英文名不匹配的实测场景）', () => {
    const nodes = collectFigmaNodes(figmaDoc([
      { id: 'f1', name: 'tab-active', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 46, height: 54 } },
      { id: 'f2', name: 'tab', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 54, width: 37, height: 44 } },
    ]))
    const el = { type: 'tab', name: '标签' } // 中文名，不应靠 name 命中
    const cursor = new Map()
    const hit = findFigmaNodeForElement(el, nodes, cursor)
    expect(hit?._id).toBe('f1') // type 命中，且取首个（顺序配对）
  })

  it('figmaNodeId 直接命中优先于 type', () => {
    const nodes = collectFigmaNodes(figmaDoc([
      { id: 'real', name: 'switch', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 396, height: 64 } },
    ]))
    const el = { type: 'switch-card', figmaNodeId: 'real' }
    const hit = findFigmaNodeForElement(el, nodes, new Map())
    expect(hit?._id).toBe('real')
  })

  it('同名多实例按文档顺序配对（禁止最近邻）', () => {
    const nodes = collectFigmaNodes(figmaDoc([
      { id: 'a', name: 'tab', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 54 } },
      { id: 'b', name: 'tab', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 54, width: 10, height: 44 } },
      { id: 'c', name: 'tab', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 98, width: 10, height: 40 } },
    ]))
    const cursor = new Map()
    const els = [{ type: 'tab' }, { type: 'tab' }, { type: 'tab' }]
    const hits = els.map((e) => findFigmaNodeForElement(e, nodes, cursor)?._id)
    expect(hits).toEqual(['a', 'b', 'c']) // 顺序配对，非全取首个
  })

  it('无 type、仅 role=tab-item + 唯一 id 的实例共享稳定配对键（回归：曾全塌成 tab-active）', () => {
    // 实测场景：vision tab-item 无 type，只有 role=tab-item，id 唯一（tab-monitor/…）。
    // 若把唯一 id 折进配对键 → 每实例 idx=0 → 全命中 candidates[0]=tab-active(54)。
    // 稳定键须只取 role（语义类），使 6 实例共享游标、按文档顺序消费 6 个 tab 节点。
    const nodes = collectFigmaNodes(figmaDoc([
      { id: 'n1', name: 'tab-active', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 46, height: 54 } },
      { id: 'n2', name: 'tab', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 54, width: 37, height: 44 } },
      { id: 'n3', name: 'tab', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 98, width: 34, height: 40 } },
    ]))
    const cursor = new Map()
    const els = [
      { id: 'tab-monitor', name: '监控', role: 'tab-item' },
      { id: 'tab-lighting', name: '照明', role: 'tab-item' },
      { id: 'tab-ventilation', name: '通风', role: 'tab-item' },
    ]
    const hits = els.map((e) => findFigmaNodeForElement(e, nodes, cursor)?._id)
    expect(hits).toEqual(['n1', 'n2', 'n3']) // 顺序分布，而非 ['n1','n1','n1']
  })

  it('非 ASCII（中文）token 只允许全等命中：d-消防 不得被 消防 子串命中', () => {
    const nodes = collectFigmaNodes(figmaDoc([
      { id: 'act', name: 'tab-active', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 46, height: 54 } },
      // d-消防：设计稿里设备分类标签（d- 前缀 + 中文名），不是 tab 按钮
      { id: 'd-fire', name: 'd-消防', type: 'TEXT', absoluteBoundingBox: { x: 0, y: 60, width: 60, height: 32 } },
      { id: 'tab2', name: 'tab', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 100, width: 37, height: 56 } },
    ]))
    const cursor = new Map()
    const els = [
      { id: 'tab-monitor', name: '监控', role: 'tab-item' },
      { id: 'tab-fire', name: '消防', role: 'tab-item' }, // 含中文名 token 消防
    ]
    const hits = els.map((e) => findFigmaNodeForElement(e, nodes, cursor)?._id)
    expect(hits).toEqual(['act', 'tab2']) // 第二实例命中 tab(56)，而非 d-消防(32)
  })

  it('isFixedSizeElement 同时看 role：tab-counter 视为固定尺寸元素', () => {
    const parsed: any = {
      layoutStructure: {
        layout: {
          sections: [
            {
              id: 'tabs',
              body: {
                children: [
                  { id: 'tab-counter', role: 'tab-counter' }, // 无 type，role 表明是计数器
                  { id: 'm1', role: 'tab-item', name: '监控' },
                  { id: 'm2', role: 'tab-item', name: '照明' },
                ],
              },
            },
          ],
        },
      },
    }
    const figmaData = figmaDoc([
      { id: 'a', name: 'tab-active', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 46, height: 54 } },
      { id: 'b', name: 'tab', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 54, width: 37, height: 44 } },
    ])
    expect(applyFigmaElementHeightRatios(parsed, figmaData)).toBe(2)
    const [counter, m1, m2] = parsed.layoutStructure.layout.sections[0].body.children
    expect(counter.styles).toBeUndefined() // 固定尺寸元素不参与比例
    const avg = (54 + 44) / 2
    expect(m1.styles.flexGrow).toBeCloseTo(54 / avg, 2)
    expect(m2.styles.flexGrow).toBeCloseTo(44 / avg, 2)
  })

  it('顶层 section 1:1 顺序配对（bg 剔除、包装容器展开）', () => {
    const parsed: any = {
      layoutStructure: {
        layout: {
          sections: [
            { id: 'header-stats', name: '头部统计' },
            { id: 'device-switch', name: '设备类型切换' },
            { id: 'device-tabs', name: '设备分类导航与内容' },
          ],
        },
      },
    }
    const figmaData = figmaDoc([
      { id: 'bg', name: 'bg', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 425 } },
      { id: 'h', name: 'header', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 30 } },
      {
        id: 'sc', name: 'slot-con', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 30, width: 420, height: 380 },
        children: [
          { id: 'sw', name: 'switch', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 30, width: 420, height: 65 } },
          { id: 'at', name: '@antd/tab', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 95, width: 420, height: 10 }, children: [
            { id: 'atc', name: 'tabs', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 95, width: 420, height: 317 } },
          ] },
        ],
      },
    ])
    expect(applyFigmaElementHeightRatios(parsed, figmaData)).toBe(3)
    const [s0, s1, s2] = parsed.layoutStructure.layout.sections
    expect(s0.styles.figmaHeightPx).toBe(30) // header
    expect(s1.styles.figmaHeightPx).toBe(65) // switch
    expect(s2.styles.figmaHeightPx).toBe(317) // @antd/tab 取子节点最大高
    const avg = (30 + 65 + 317) / 3
    expect(s1.styles.flexGrow).toBeCloseTo(65 / avg, 2) // device-switch 按父列比例被约束
    expect(s1.styles.flexGrow).toBeLessThan(s2.styles.flexGrow as number)
  })

  it('header 容错：regions 多 1 且首项为 header 时剥掉再 1:1（回归 mc-max-1788454423557：header 走 panel slot 不进 sections）', () => {
    const parsed: any = {
      layout: {
        sections: [
          { id: 'overview', name: '设备概览统计' },
          { id: 'device-list', name: '设备分类列表' },
        ],
      },
    }
    const figmaData = figmaDoc([
      { id: 'bg', name: 'bg', type: 'VECTOR', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 425 } },
      { id: 'h', name: 'header', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 8, width: 420, height: 30 } },
      {
        id: 'sc', name: 'slot-con', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 42, width: 420, height: 380 },
        children: [
          { id: 'sw', name: 'switch', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 42, width: 396, height: 65 } },
          { id: 'at', name: '@antd/tab', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 105, width: 46, height: 317 } },
        ],
      },
    ])
    // 扁平 layout.sections 形态（与 analyze() post-process 阶段一致）
    expect(applyFigmaElementHeightRatios(parsed, figmaData)).toBe(2)
    const [s0, s1] = parsed.layout.sections
    expect(s0.styles.figmaHeightPx).toBe(65) // switch（概览区）
    expect(s1.styles.figmaHeightPx).toBe(317) // @antd/tab（列表区）
    const avg = (65 + 317) / 2
    expect(s0.styles.flexGrow).toBeCloseTo(65 / avg, 2) // ≈0.34，远小于列表区
    expect(s1.styles.flexGrow).toBeCloseTo(317 / avg, 2) // ≈1.66
  })

  it('header 容错不滥用：首项非 header 名称或过高时维持跳过不猜', () => {
    const parsed: any = {
      layout: { sections: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }] },
    }
    // 首项叫 banner（非 header 类名称）→ 不剥，数量不等 → 跳过
    const figmaData = figmaDoc([
      { id: 'x', name: 'banner', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 30 } },
      { id: 'y', name: 'switch', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 30, width: 420, height: 65 } },
      { id: 'z', name: 'list', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 95, width: 420, height: 317 } },
    ])
    expect(applyFigmaElementHeightRatios(parsed, figmaData)).toBe(0)
    expect(parsed.layout.sections[0].styles).toBeUndefined()
    // 首项名为 header 但高度 120（不像头部条）→ 不剥 → 跳过
    const parsed2: any = { layout: { sections: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }] } }
    const figmaData2 = figmaDoc([
      { id: 'x', name: 'header', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 120 } },
      { id: 'y', name: 'switch', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 120, width: 420, height: 65 } },
      { id: 'z', name: 'list', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 185, width: 420, height: 317 } },
    ])
    expect(applyFigmaElementHeightRatios(parsed2, figmaData2)).toBe(0)
    expect(parsed2.layout.sections[0].styles).toBeUndefined()
  })
})

describe('applyFigmaElementHeightRatios（A4）', () => {
  it('兄弟组按 Figma 高度比写入比例量纲的 flexGrow（不写固定 px）', () => {
    const parsed: any = {
      layoutStructure: {
        layout: {
          sections: [
            {
              id: 'tabs',
              body: {
                children: [
                  { id: 'tab-active', type: 'tab' },
                  { id: 'tab1', type: 'tab' },
                  { id: 'tab2', type: 'tab' },
                ],
              },
            },
          ],
        },
      },
    }
    const figmaData = figmaDoc([
      { id: 'a', name: 'tab-active', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 46, height: 54 } },
      { id: 'b', name: 'tab', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 54, width: 37, height: 44 } },
      { id: 'c', name: 'tab', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 98, width: 34, height: 40 } },
    ])

    expect(applyFigmaElementHeightRatios(parsed, figmaData)).toBe(3)

    const [a, b, c] = parsed.layoutStructure.layout.sections[0].body.children
    const avg = (54 + 44 + 40) / 3
    expect(a.styles.flexGrow).toBeCloseTo(54 / avg, 2)
    expect(b.styles.flexGrow).toBeCloseTo(44 / avg, 2)
    expect(c.styles.flexGrow).toBeCloseTo(40 / avg, 2)
    for (const el of [a, b, c]) {
      expect(el.styles.flexGrow).toBeLessThan(3) // 比例量级（~1），非像素量级
      expect(el.styles.flexShrink).toBe(1)
      expect(el.styles.flexBasis).toBe(0)
      expect(el.styles.figmaHeightPx).toBeGreaterThan(0) // 仅审计
      expect(el.styles.height).toBeUndefined() // 禁止写区块固定高度
    }
  })

  it('switch-card 兄弟组（device-switch 内层）按类型命中并给比例', () => {
    const parsed: any = {
      layoutStructure: {
        layout: {
          sections: [
            {
              id: 'device-switch',
              body: {
                items: [
                  { id: 'card1', type: 'switch-card' },
                  { id: 'card2', type: 'switch-card' },
                ],
              },
            },
          ],
        },
      },
    }
    const figmaData = figmaDoc([
      { id: 's1', name: 'switch', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 30 } },
      { id: 's2', name: 'switch', type: 'FRAME', absoluteBoundingBox: { x: 200, y: 0, width: 200, height: 34 } },
    ])
    expect(applyFigmaElementHeightRatios(parsed, figmaData)).toBe(2)
    const [c1, c2] = parsed.layoutStructure.layout.sections[0].body.items
    expect(c1.styles.flexGrow).toBeCloseTo(30 / 32, 2)
    expect(c2.styles.flexGrow).toBeCloseTo(34 / 32, 2)
  })

  it('单元素组不猜比例（避免误伤固定尺寸元素）', () => {
    const parsed: any = {
      layoutStructure: {
        layout: {
          sections: [
            { id: 's', body: { children: [{ id: 'switch', type: 'switch-card' }] } },
          ],
        },
      },
    }
    const figmaData = figmaDoc([
      { id: 'x', name: 'switch', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 396.4, height: 64.8 } },
    ])
    expect(applyFigmaElementHeightRatios(parsed, figmaData)).toBe(0)
    expect(parsed.layoutStructure.layout.sections[0].body.children[0].styles).toBeUndefined()
  })

  it('Figma 无匹配节点则跳过（禁止最近邻，防串位）', () => {
    const parsed: any = {
      layoutStructure: {
        layout: {
          sections: [
            { id: 's', body: { children: [{ type: 'tab' }, { type: 'tab' }] } },
          ],
        },
      },
    }
    const figmaData = figmaDoc([
      { id: 'z', name: 'xxx', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
    ])
    expect(applyFigmaElementHeightRatios(parsed, figmaData)).toBe(0)
  })

  it('开关 disabled 生效', () => {
    const parsed: any = {
      layoutStructure: {
        layout: { sections: [{ id: 's', body: { children: [{ type: 'tab' }, { type: 'tab' }] } }] },
      },
    }
    const figmaData = figmaDoc([
      { id: 'a', name: 'tab', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 46, height: 54 } },
      { id: 'b', name: 'tab', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 54, width: 37, height: 44 } },
    ])
    expect(applyFigmaElementHeightRatios(parsed, figmaData, { disabled: true })).toBe(0)
  })

  it('扁平 layout.sections 形态也生效（回归：analyze() 内 post-process 阶段 parsed 无 layoutStructure 壳）', () => {
    // 2026-09-04 实锤：visual-parser.parseAnalysisResult 返回 { layout:{sections} }（无
    // layoutStructure 包裹，见 visual-parser.js:1663 注释），layoutStructure 壳在落盘/喂
    // engineer 时才套上 → A4 在 v3 管线 post-process 里恒 0 静默空转。
    // 此测试锁定：只给扁平 layout 也能命中并写入比例。
    const parsed: any = {
      layout: {
        type: 'column',
        direction: 'vertical',
        sections: [
          { id: 'tabs', body: { children: [{ type: 'tab' }, { type: 'tab' }] } },
        ],
      },
    }
    const figmaData = figmaDoc([
      { id: 'a', name: 'tab-active', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 46, height: 54 } },
      { id: 'b', name: 'tab', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 54, width: 37, height: 44 } },
    ])
    expect(parsed.layoutStructure).toBeUndefined() // 前置：确认测的是扁平形态
    expect(applyFigmaElementHeightRatios(parsed, figmaData)).toBe(2)
    const [a, b] = parsed.layout.sections[0].body.children
    const avg = (54 + 44) / 2
    expect(a.styles.flexGrow).toBeCloseTo(54 / avg, 2)
    expect(b.styles.flexGrow).toBeCloseTo(44 / avg, 2)
  })
})

describe('collectSectionRegions（2026-09-04 BG 增强）', () => {
  it('bg-[m] 隐藏层（铺满）应被剔除', () => {
    const root = figmaDoc([
      { id: 'bg', name: 'bg-[m]', type: 'BOOLEAN_OPERATION', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 425 } },
      { id: 'h', name: 'header', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 30 } },
      { id: 'a', name: 'card-a', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 30, width: 420, height: 200 } },
    ])
    const regions = collectSectionRegions(root)
    expect(regions.map((r: any) => r.id)).toEqual(['h', 'a'])
  })

  it('bg-_m-35 资源层（铺满）应被剔除', () => {
    const root = figmaDoc([
      { id: 'bg', name: 'bg-_m-35', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 425 } },
      { id: 'a', name: 'card', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 100 } },
    ])
    expect(collectSectionRegions(root).map((r: any) => r.id)).toEqual(['a'])
  })

  it('业务性 bg-card 命名但尺寸小（不铺满）应保留（不误剥）', () => {
    const root = figmaDoc([
      { id: 'bg', name: 'bg-card', type: 'FRAME', absoluteBoundingBox: { x: 10, y: 10, width: 100, height: 50 } },
      { id: 'a', name: 'content', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 425 } },
    ])
    expect(collectSectionRegions(root).map((r: any) => r.id)).toEqual(['bg', 'a'])
  })

  it('无 absoluteBoundingBox 的根 → 所有子级保留', () => {
    const root = { type: 'FRAME', absoluteBoundingBox: { width: 420, height: 425 }, children: [
      { id: 'bg', name: 'bg-[m]', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 425 } },
      { id: 'x', name: 'x', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 } },
    ]}
    // 根 bbox 有 → 铺满判定生效，bg-[m] 仍被剥
    expect(collectSectionRegions(root).map((r: any) => r.id)).toEqual(['x'])
  })
})

describe('复合 region 展开（2026-09-04 不同构场景）', () => {
  it('slot 复合卡含 sub-header/Group/bar/bar → 展开剥 sub-header 后 1:1 配对 5 sections', () => {
    // mc-max-1788485095835-e1432017 真实 fixture（425.8x807）：
    // root children = [bg-[m](铺满 807), header-(32.5), 88:33 slot-当日总流量(556.3, 4 kids),
    //                  2:3438 slot-车型分布(142), 83:30 slot-流量预测(174)]
    // 88:33 children = [sub-header(30.4), Group2136636802(91.4 stat), bar 隧道(131), bar 大桥(131)]
    // vision sections = [当日总流量(stat), 隧道图, 大桥图, 车型, 流量预测] = 5
    // 期望 A4 配对：sections[0]←Group(91) / sections[1]←bar(131) / sections[2]←bar(131) /
    //              sections[3]←2:3438(142) / sections[4]←83:30(174)
    const root = figmaDoc([
      { id: 'bg', name: 'bg-[m]', type: 'BOOLEAN_OPERATION', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 425 } },
      { id: 'header', name: 'header-', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 32.5 } },
      {
        id: '88-33', name: 'slot-当日总流量', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 32.5, width: 420, height: 556.3 },
        children: [
          { id: 'sub-h', name: 'sub-header', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 32.5, width: 420, height: 30.4 } },
          { id: 'grp', name: 'Group 2136636802', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 62.9, width: 420, height: 91.4 } },
          { id: 'bar1', name: '@echarts/bar', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 154.3, width: 420, height: 131 } },
          { id: 'bar2', name: '@echarts/bar', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 285.3, width: 420, height: 131 } },
        ],
      },
      { id: 'v-type', name: 'slot-车型分布', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 588.8, width: 420, height: 142 } },
      { id: 'fc', name: 'slot-流量预测', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 730.8, width: 420, height: 174 } },
    ])
    const parsed: any = {
      layoutStructure: {
        layout: {
          sections: [
            { id: 'section-daily-total', name: '当日总流量' },
            { id: 'section-chart-tunnel', name: '江阴靖江长江隧道流量' },
            { id: 'section-chart-bridge', name: '江阴大桥流量' },
            { id: 'section-vehicle-type', name: '车型分布' },
            { id: 'section-forecast', name: '流量预测' },
          ],
        },
      },
    }
    expect(applyFigmaElementHeightRatios(parsed, root)).toBe(5)
    const px_list = parsed.layoutStructure.layout.sections.map((s: any) => s.styles.figmaHeightPx)
    expect(px_list).toEqual([91, 131, 131, 142, 174])
    const avg = (91 + 131 + 131 + 142 + 174) / 5
    const flexGrows = parsed.layoutStructure.layout.sections.map((s: any) => s.styles.flexGrow)
    expect(flexGrows[0]).toBeCloseTo(91 / avg, 2)
    expect(flexGrows[1]).toBeCloseTo(131 / avg, 2)
    expect(flexGrows[3]).toBeCloseTo(142 / avg, 2)
    expect(flexGrows[4]).toBeCloseTo(174 / avg, 2)
    for (const s of parsed.layoutStructure.layout.sections) {
      expect(s.styles.flexGrow).toBeLessThan(3) // 比例量级 ~1（非像素量级）
      expect(s.styles.flexBasis).toBe(0)
      expect(s.styles.height).toBeUndefined() // 严禁固定高度
    }
  })

  it('复合 region 展开失败（无大区域可展）时维持 skip 不猜', () => {
    // 全部 region 已是叶子且数量不足 → 不强行配对
    const root = figmaDoc([
      { id: 'bg', name: 'bg-[m]', type: 'BOOLEAN_OPERATION', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 425 } },
      { id: 'a', name: 'card-a', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 200 } },
      { id: 'b', name: 'card-b', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 200, width: 420, height: 100 } },
    ])
    const parsed: any = {
      layoutStructure: {
        layout: {
          sections: [
            { id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }, { id: 's5' },
          ],
        },
      },
    }
    expect(applyFigmaElementHeightRatios(parsed, root)).toBe(0)
    for (const s of parsed.layoutStructure.layout.sections) {
      expect(s.styles).toBeUndefined()
    }
  })
})

/**
 * A4 视觉行归并回归（2026-10-30，mc-max-1793349441153-c3b958e0 实锤）。
 *
 * 病灶：collectSectionRegions 返回**图元级**节点，vision sections 是**视觉语义级**。
 * 一个视觉区块在 Figma 里常被拆成多个平级图元（底部图例 = Group+Group+TEXT+icon，y 全为 52138），
 * 外加滚动条 / 小图标等装饰图元 → regions 数远超 sections 数 → 原实现「数量不等即跳过不猜」
 * → A4 写入 0 → mounter 退等分 → 产物 flex:1.000 / 1 / 1，渲染 171/171/171，
 * 与设计稿 66/388/14 完全不符。
 *
 * 修法：数量不等时先做「装饰剔除 + 纵向行归并」，对齐 sections 数才采纳（按 y 升序配对，
 * 顺带修掉 Figma children 文档顺序 ≠ 视觉顺序 的串列风险）。
 */
describe('mergeVisualRows —— 视觉行归并（regions 粒度 → 视觉语义粒度）', () => {
  /** 实锤数据：slot-con 807:2，根 483×515，直接子节点 7 个（文档顺序 ≠ 视觉顺序） */
  const slotConDoc = () => ({
    name: 'slot-con',
    id: '807:2',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 51637, width: 483, height: 515 },
    children: [
      { id: 'f2', name: 'Frame 2136639921', type: 'FRAME', absoluteBoundingBox: { x: 7, y: 51728, width: 470, height: 388 } },
      { id: 'g1', name: 'Group 2136638436', type: 'GROUP', absoluteBoundingBox: { x: 8, y: 52138, width: 53, height: 14 } },
      { id: 'g2', name: 'Group 2136638438', type: 'GROUP', absoluteBoundingBox: { x: 90, y: 52138, width: 39, height: 14 } },
      { id: 't1', name: '点击查看详情', type: 'TEXT', absoluteBoundingBox: { x: 380, y: 52138, width: 84, height: 14 } },
      { id: 'f1', name: 'Frame 2136639911', type: 'FRAME', absoluteBoundingBox: { x: 7, y: 51637, width: 470, height: 66 } },
      { id: 'ic', name: 'icon', type: 'FRAME', absoluteBoundingBox: { x: 466, y: 52141, width: 8, height: 8 } },
      { id: 'rb', name: 'Rectangle 346242323', type: 'RECTANGLE', absoluteBoundingBox: { x: 477, y: 51815, width: 6, height: 218 } },
    ],
  })

  it('7 个图元归并为 3 个视觉行（66 / 388 / 14），剔除滚动条与 8×8 图标', () => {
    const regions = collectSectionRegions(slotConDoc())
    expect(regions).toHaveLength(7) // 原实现输出：图元级 7 个

    const rows = mergeVisualRows(regions)
    expect(rows).toHaveLength(3)
    // 🔴 必须按 y 升序：文档顺序首项是 y=51728 的第 2 行，直接 1:1 会串列
    expect(rows.map((r: any) => r.absoluteBoundingBox.height)).toEqual([66, 388, 14])
    expect(rows.map((r: any) => r.absoluteBoundingBox.y)).toEqual([51637, 51728, 52138])
    // 装饰图元不被保留为独立行
    expect(rows.some((r: any) => r.name === 'icon')).toBe(false)
    expect(rows.some((r: any) => /Rectangle 346242323/.test(String(r.name)))).toBe(false)
    // 合成行不带 children（否则后段「复合 region 展开」会把它再拆开）
    expect(rows[2].children).toBeUndefined()
    // g1 + g2 + t1 三个（8×8 icon 在前置装饰剔除阶段就已移除，不进归并）
    expect((rows[2] as any)._mergedCount).toBe(3)
  })

  it('端到端：applyFigmaSectionRatios 写入 3 个比例系数（0.423 / 2.487 / 0.090）', () => {
    const sections: any[] = [
      { name: '统计卡片组' },
      { name: '设备列表' },
      { name: '底部图例与链接' },
    ]
    expect(applyFigmaSectionRatios(sections, { document: slotConDoc() })).toBe(3)

    expect(sections[0].styles.figmaHeightPx).toBe(66)
    expect(sections[1].styles.figmaHeightPx).toBe(388)
    expect(sections[2].styles.figmaHeightPx).toBe(14)

    const avg = (66 + 388 + 14) / 3
    expect(sections[0].styles.flexGrow).toBeCloseTo(66 / avg, 2) // ≈0.423
    expect(sections[1].styles.flexGrow).toBeCloseTo(388 / avg, 2) // ≈2.487
    expect(sections[2].styles.flexGrow).toBeCloseTo(14 / avg, 2) // ≈0.090
    for (const s of sections) {
      expect(s.styles.flexGrow).toBeLessThan(3) // 比例量级（~1），非像素量级 → 不触 FLEX-005
      expect(s.styles.flexGrow).toBeGreaterThan(0)
      expect(s.styles.flexShrink).toBe(1)
      expect(s.styles.flexBasis).toBe(0)
      expect(s.styles.height).toBeUndefined() // 禁止写区块固定高度
    }
  })

  it('数量本就相等时不启用归并（不误合相邻真实区块）', () => {
    // 两个真实区块，纵向间隙 2px（< ROW_GAP 8）——若盲目归并会合并成 1 行导致错位
    const doc = {
      name: 'cp',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 200 },
      children: [
        { id: 'a', name: 'card-a', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 99 } },
        { id: 'b', name: 'card-b', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 101, width: 420, height: 99 } },
      ],
    }
    const sections: any[] = [{ name: '甲' }, { name: '乙' }]
    expect(applyFigmaSectionRatios(sections, { document: doc })).toBe(2)
    expect(sections[0].styles.figmaHeightPx).toBe(99)
    expect(sections[1].styles.figmaHeightPx).toBe(99)
  })
})

describe('根下直配（2026-11-03 治本 · mc-max-1793669737047-17691193）', () => {
  it('header+slot 两区域 vs 两 section 直接 1:1（回归：曾配错成 74/24 反了）', () => {
    const sections: any[] = [
      { id: '2:7959', name: '头部标题栏' },
      { id: '136:122', name: '今日累计' },
    ]
    // Figma 根下非 bg 节点 = [header(28), slot(86)]，与 2 个 section 天然 1:1
    const doc = {
      name: 'cp-重点车辆监测',
      type: 'FRAME',
      absoluteBoundingBox: { x: 16, y: 922, width: 420, height: 147 },
      children: [
        { id: '2:7953', name: 'bg', type: 'VECTOR', absoluteBoundingBox: { x: 16, y: 922, width: 420, height: 147 } },
        { id: '136:120', name: 'header', type: 'FRAME', absoluteBoundingBox: { x: 36, y: 932, width: 380, height: 28 } },
        {
          id: '136:121', name: 'slot', type: 'FRAME', absoluteBoundingBox: { x: 37, y: 963, width: 377, height: 86 },
          children: [
            { id: '2:8023', name: 'Group 2136639043', type: 'GROUP', absoluteBoundingBox: { x: 37, y: 984, width: 378, height: 74 } },
            { id: '136:122', name: 'sub-header', type: 'FRAME', absoluteBoundingBox: { x: 36, y: 963, width: 86, height: 24 } },
          ],
        },
      ],
    }
    expect(applyFigmaSectionRatios(sections, { document: doc })).toBe(2)
    // 🔴 修复前：头部被配成 74（三卡）、内容被配成 24（sub-header），正好反了
    expect(sections[0].styles.figmaHeightPx).toBe(28)
    expect(sections[1].styles.figmaHeightPx).toBe(86)
    const avg = (28 + 86) / 2
    expect(sections[0].styles.flexGrow).toBeCloseTo(28 / avg, 2) // ≈0.49
    expect(sections[1].styles.flexGrow).toBeCloseTo(86 / avg, 2) // ≈1.51
    expect(sections[0].styles.flexGrow).toBeLessThan(sections[1].styles.flexGrow as number)
  })

  it('根下节点数 ≠ sections 数时不触发直配（仍走展开/容错链，防误接管）', () => {
    const sections: any[] = [{ name: '甲' }, { name: '乙' }]
    // 根下 3 个非 bg 节点（header + switch + list）≠ 2 sections → 直配不触发
    const doc = {
      name: 'cp',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 425 },
      children: [
        { id: 'h', name: 'header', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 30 } },
        { id: 'sw', name: 'switch', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 30, width: 420, height: 65 } },
        { id: 'lst', name: 'list', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 95, width: 420, height: 317 } },
      ],
    }
    // 数量不等 → 走 header 容错剥 header 后 [switch(65), list(317)] 与两 section 配对
    expect(applyFigmaSectionRatios(sections, { document: doc })).toBe(2)
    expect(sections[0].styles.figmaHeightPx).toBe(65)
    expect(sections[1].styles.figmaHeightPx).toBe(317)
  })
})

describe('section.id 直配（2026-11-03 治本 · mc-max-1793675066942-7396124c 实锤）', () => {
  it('阳性：根下 slot-icon 不匹配 WRAPPER_RE 时，sections.id 命中 figma 节点 → 直配真值高度', () => {
    // 实锤：合作厂商根下 [bg, header(10), slot-icon(787, 9 kids)]，slot-icon 不匹配
    // WRAPPER_RE（精确匹配 slot）→ collectSectionRegions 只得 2 region → 复合展开成
    // 9 图元 → 10≠4 → 旧实现写入 0。而 4 个 sections.id 恰为 figma 节点 id。
    // （Loop 3 后 ② 路径展开后再归并也会得 [76,161,212,265]——见下方交叉验证用例；
    //   ①-β 排在 ② 之前仍优先生效，本用例计数行须保持 idDirect=4。）
    const sections: any[] = [
      { id: '38:3260', name: '顶部统计卡片' },
      { id: '38:3137', name: '战略合作厂商' },
      { id: '38:3162', name: '优质厂商' },
      { id: '38:3206', name: '普通厂商' },
    ]
    const doc = {
      name: 'cp-合作厂商弹窗',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 660, height: 868 },
      children: [
        { id: '38:3135', name: 'bg', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 660, height: 868 } },
        { id: '38:3136', name: 'header', type: 'VECTOR', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
        {
          id: '796:3', name: 'slot-icon', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 10, width: 604, height: 787 },
          children: [
            { id: '38:3137', name: 'Group 2136638432', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 161, width: 604, height: 161 } },
            { id: '38:3162', name: 'Group 2136638433', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 372, width: 604, height: 212 } },
            { id: '38:3206', name: 'Group 2136638434', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 604, width: 604, height: 265 } },
            { id: '38:3260', name: 'Group 2136638431', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 10, width: 265, height: 76 } },
            { id: '38:3262', name: '33', type: 'TEXT', absoluteBoundingBox: { x: 0, y: 20, width: 20, height: 28 } },
            { id: '38:3263', name: '合作厂商', type: 'TEXT', absoluteBoundingBox: { x: 0, y: 48, width: 60, height: 24 } },
            { id: '38:3282', name: 'Group 2136638435', type: 'GROUP', absoluteBoundingBox: { x: 300, y: 10, width: 265, height: 76 } },
            { id: '38:3284', name: '66', type: 'TEXT', absoluteBoundingBox: { x: 300, y: 20, width: 20, height: 28 } },
            { id: '38:3285', name: '在线设备', type: 'TEXT', absoluteBoundingBox: { x: 300, y: 48, width: 60, height: 24 } },
          ],
        },
      ],
    }
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, { document: doc }, stats)).toBe(4)
    expect(sections.map((s: any) => s.styles.figmaHeightPx)).toEqual([76, 161, 212, 265])
    expect(stats.idDirect).toBe(4) // 计数行取证：走了 id 直配分支
    const avg = (76 + 161 + 212 + 265) / 4
    expect(sections[0].styles.flexGrow).toBeCloseTo(76 / avg, 2)
    expect(sections[3].styles.flexGrow).toBeCloseTo(265 / avg, 2)
  })

  it('⭐ Loop 3 阳性（设备详情）：语义 id 不命中 → ①-β 放弃，② 路径复合展开后再归并成功 [98,135,193]', () => {
    // 设备详情实锤 fixture：sections.id 是语义 id（attributes-section），figmaNodes 中无此 id；
    // 根下 slot-icon(801:3) 不匹配 WRAPPER_RE → regions 仅 2 → 复合展开成 9 图元。
    // Loop 3 前：10≠3 → 顺序配对不成立 → 写入 0（A4 全链路无系数 → mounter 退等分 flex:1）。
    // Loop 3 后：展开 + 剥离循环结束后再跑一次 mergeVisualRows（恰好 3 行才采纳）→
    //   [头部信息=98(img+GD-Robot-04+徽标+编码/爆闪灯), 设备属性=135.25(Group 24 kids), 产品描述=193(矩形+标签+描述)]
    const sections: any[] = [
      { id: 'header-section', name: '头部信息' },
      { id: 'attributes-section', name: '设备属性' },
      { id: 'description-section', name: '产品描述' },
    ]
    const doc = {
      name: 'cp-设备详情',
      type: 'FRAME',
      absoluteBoundingBox: { x: 24717, y: 51464, width: 603, height: 555 },
      children: [
        { id: '36:1694', name: 'bg', type: 'RECTANGLE', absoluteBoundingBox: { x: 24717, y: 51464, width: 603, height: 555 } },
        { id: '36:1697', name: 'header', type: 'VECTOR', absoluteBoundingBox: { x: 24745, y: 51464, width: 10, height: 10 } },
        {
          id: '801:3', name: 'slot-icon', type: 'GROUP', absoluteBoundingBox: { x: 24745, y: 51499, width: 547, height: 493 },
          children: [
            { id: '36:1695', name: 'Rectangle 346242326', type: 'RECTANGLE', absoluteBoundingBox: { x: 24745, y: 51799, width: 547, height: 193 } },
            { id: '36:1698', name: '编码', type: 'TEXT', absoluteBoundingBox: { x: 24864, y: 51556, width: 32, height: 16 } },
            { id: '36:1708', name: '产品描述', type: 'TEXT', absoluteBoundingBox: { x: 24772, y: 51824, width: 64, height: 16 } },
            { id: '36:1719', name: '该设备为太阳能供电一体化爆闪灯', type: 'TEXT', absoluteBoundingBox: { x: 24772, y: 51849, width: 496, height: 90 } },
            { id: '81:7', name: 'Group 2136638454', type: 'GROUP', absoluteBoundingBox: { x: 24745, y: 51630, width: 440, height: 135.25 } },
            { id: '36:1721', name: '爆闪灯', type: 'TEXT', absoluteBoundingBox: { x: 24989, y: 51556, width: 48, height: 16 } },
            { id: '36:1722', name: 'Frame 2136639901', type: 'FRAME', absoluteBoundingBox: { x: 24905, y: 51553, width: 72, height: 22 } },
            { id: '36:1724', name: 'GD-Robot-04', type: 'TEXT', absoluteBoundingBox: { x: 24864, y: 51514, width: 147, height: 24 } },
            { id: '36:1725', name: 'img', type: 'GROUP', absoluteBoundingBox: { x: 24745, y: 51499, width: 98, height: 98 } },
          ],
        },
      ],
    }
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, { document: doc }, stats)).toBe(3)
    expect(stats.idDirect).toBeUndefined()
    expect(stats.idDirectMiss).toBe(3)
    expect(stats.order).toBe(3) // 计数行取证：走了 ② 顺序配对（复合展开后再归并）
    expect(sections.map((s: any) => s.styles.figmaHeightPx)).toEqual([98, 135, 193])
    const avg = (98 + 135.25 + 193) / 3
    expect(sections[0].styles.flexGrow).toBeCloseTo(98 / avg, 2)
    expect(sections[1].styles.flexGrow).toBeCloseTo(135.25 / avg, 2)
    expect(sections[2].styles.flexGrow).toBeCloseTo(193 / avg, 2)
    // 视觉行高递增 ⇒ 系数单调递增（头部信息 < 设备属性 < 产品描述）
    expect(sections[0].styles.flexGrow).toBeLessThan(sections[1].styles.flexGrow as number)
    expect(sections[1].styles.flexGrow).toBeLessThan(sections[2].styles.flexGrow as number)
  })

  it('Loop 3 阴性：展开后归并出 3 行 ≠ 5 sections → 不采纳，维持 fail-open 0（不猜）', () => {
    // 同一设备详情几何，但 sections=5：归并只能出 3 个视觉行 → 数量不严格相等 → 不采纳
    // → pairRegions 保持 10 图元 → 10≠5 → 顺序配对不成立 → 0（纪律优先于覆盖）。
    const sections: any[] = [
      { id: 'header-section', name: '头部信息' },
      { id: 'attributes-section', name: '设备属性' },
      { id: 'description-section', name: '产品描述' },
      { id: 'extra-a', name: '附加一' },
      { id: 'extra-b', name: '附加二' },
    ]
    const doc = {
      name: 'cp-设备详情',
      type: 'FRAME',
      absoluteBoundingBox: { x: 24717, y: 51464, width: 603, height: 555 },
      children: [
        { id: '36:1694', name: 'bg', type: 'RECTANGLE', absoluteBoundingBox: { x: 24717, y: 51464, width: 603, height: 555 } },
        { id: '36:1697', name: 'header', type: 'VECTOR', absoluteBoundingBox: { x: 24745, y: 51464, width: 10, height: 10 } },
        {
          id: '801:3', name: 'slot-icon', type: 'GROUP', absoluteBoundingBox: { x: 24745, y: 51499, width: 547, height: 493 },
          children: [
            { id: '36:1695', name: 'Rectangle 346242326', type: 'RECTANGLE', absoluteBoundingBox: { x: 24745, y: 51799, width: 547, height: 193 } },
            { id: '36:1698', name: '编码', type: 'TEXT', absoluteBoundingBox: { x: 24864, y: 51556, width: 32, height: 16 } },
            { id: '36:1708', name: '产品描述', type: 'TEXT', absoluteBoundingBox: { x: 24772, y: 51824, width: 64, height: 16 } },
            { id: '36:1719', name: '该设备为太阳能供电一体化爆闪灯', type: 'TEXT', absoluteBoundingBox: { x: 24772, y: 51849, width: 496, height: 90 } },
            { id: '81:7', name: 'Group 2136638454', type: 'GROUP', absoluteBoundingBox: { x: 24745, y: 51630, width: 440, height: 135.25 } },
            { id: '36:1721', name: '爆闪灯', type: 'TEXT', absoluteBoundingBox: { x: 24989, y: 51556, width: 48, height: 16 } },
            { id: '36:1722', name: 'Frame 2136639901', type: 'FRAME', absoluteBoundingBox: { x: 24905, y: 51553, width: 72, height: 22 } },
            { id: '36:1724', name: 'GD-Robot-04', type: 'TEXT', absoluteBoundingBox: { x: 24864, y: 51514, width: 147, height: 24 } },
            { id: '36:1725', name: 'img', type: 'GROUP', absoluteBoundingBox: { x: 24745, y: 51499, width: 98, height: 98 } },
          ],
        },
      ],
    }
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, { document: doc }, stats)).toBe(0)
    expect(stats.order).toBeUndefined()
    for (const s of sections) expect(s.styles).toBeUndefined()
  })

  it('⭐ Loop 3 交叉验证（合作厂商 ② 路径隔离）：语义 id 场景下展开后归并得 [76,161,212,265]，与 ①-β id 直配逐项一致', () => {
    // 同一合作厂商几何，但 sections.id 改用语义 id（绕过 ①-β，隔离 ② 路径）：
    // 复合展开 slot-icon → 10 图元 → 展开后再归并 → 4 视觉行 [76,161,212,265]。
    // 与 ①-β 阳性用例（sections.id=figma id）的结果逐项相等 ⇒ 两条独立路径互为交叉验证；
    // 且与 context-shadow.json 中 planner 修复值 fg=[0.426,0.902,1.188,1.485] 同源吻合。
    const sections: any[] = [
      { id: 'sec-top', name: '顶部统计卡片' },
      { id: 'sec-strategy', name: '战略合作厂商' },
      { id: 'sec-quality', name: '优质厂商' },
      { id: 'sec-normal', name: '普通厂商' },
    ]
    const doc = {
      name: 'cp-合作厂商弹窗',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 660, height: 868 },
      children: [
        { id: '38:3135', name: 'bg', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 660, height: 868 } },
        { id: '38:3136', name: 'header', type: 'VECTOR', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
        {
          id: '796:3', name: 'slot-icon', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 10, width: 604, height: 787 },
          children: [
            { id: '38:3137', name: 'Group 2136638432', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 161, width: 604, height: 161 } },
            { id: '38:3162', name: 'Group 2136638433', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 372, width: 604, height: 212 } },
            { id: '38:3206', name: 'Group 2136638434', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 604, width: 604, height: 265 } },
            { id: '38:3260', name: 'Group 2136638431', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 10, width: 265, height: 76 } },
            { id: '38:3262', name: '33', type: 'TEXT', absoluteBoundingBox: { x: 0, y: 20, width: 20, height: 28 } },
            { id: '38:3263', name: '合作厂商', type: 'TEXT', absoluteBoundingBox: { x: 0, y: 48, width: 60, height: 24 } },
            { id: '38:3282', name: 'Group 2136638435', type: 'GROUP', absoluteBoundingBox: { x: 300, y: 10, width: 265, height: 76 } },
            { id: '38:3284', name: '66', type: 'TEXT', absoluteBoundingBox: { x: 300, y: 20, width: 20, height: 28 } },
            { id: '38:3285', name: '在线设备', type: 'TEXT', absoluteBoundingBox: { x: 300, y: 48, width: 60, height: 24 } },
          ],
        },
      ],
    }
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, { document: doc }, stats)).toBe(4)
    expect(stats.idDirect).toBeUndefined() // 语义 id → ①-β 不接手
    expect(stats.idDirectMiss).toBe(4)
    expect(stats.order).toBe(4) // ② 顺序配对（展开后再归并）
    expect(sections.map((s: any) => s.styles.figmaHeightPx)).toEqual([76, 161, 212, 265])
    const avg = (76 + 161 + 212 + 265) / 4
    expect(sections[0].styles.flexGrow).toBeCloseTo(76 / avg, 2) // ≈0.426
    expect(sections[3].styles.flexGrow).toBeCloseTo(265 / avg, 2) // ≈1.485
  })

  it('顺序保护：根下直配必须先于 section.id 直配（重点车辆监测保持 28/86，不被 28/24 抢走）', () => {
    // 重点车辆监测 sections.id 指向**内部子节点**（2:7959 小标题 28、136:122 sub-header 24），
    // 若 id 直配优先会得 28/24（错）；根下直配得 28/86（对）⇒ 根下直配必须胜出。
    const sections: any[] = [
      { id: '2:7959', name: '标题栏' },
      { id: '136:122', name: '今日累计' },
    ]
    const doc = {
      name: 'cp-重点车辆监测',
      type: 'FRAME',
      absoluteBoundingBox: { x: 16, y: 922, width: 420, height: 147 },
      children: [
        { id: '2:7953', name: 'bg', type: 'VECTOR', absoluteBoundingBox: { x: 16, y: 922, width: 420, height: 147 } },
        { id: '136:120', name: 'header', type: 'FRAME', absoluteBoundingBox: { x: 36, y: 932, width: 380, height: 28 } },
        {
          id: '136:121', name: 'slot', type: 'FRAME', absoluteBoundingBox: { x: 37, y: 963, width: 377, height: 86 },
          children: [
            { id: '2:8023', name: 'Group 2136639043', type: 'GROUP', absoluteBoundingBox: { x: 37, y: 984, width: 378, height: 74 } },
            { id: '136:122', name: 'sub-header', type: 'FRAME', absoluteBoundingBox: { x: 36, y: 963, width: 86, height: 24 } },
          ],
        },
      ],
    }
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, { document: doc }, stats)).toBe(2)
    expect(sections.map((s: any) => s.styles.figmaHeightPx)).toEqual([28, 86])
    expect(stats.rootDirect).toBe(2) // 走的是根下直配，不是 id 直配
    expect(stats.idDirect).toBeUndefined()
  })
})

// ============================================================
// 🆕 2026-11-03 治本：collapsed list section 高度取逐项并集
// 实锤 mc-max-1793682828131-09063447：①-β id 直配命中 48:5798（Figma 里只是
// 首卡 GROUP 72px，非 6 卡列表容器 532px）⇒ flexGrow 1.636/0.364 + 刀16 gap
// 483px 全错 ⇒ 列表压成一条缝。与 planner resolveVisionSectionBox 同源判据。
// ============================================================
describe('collapsed list 逐项并集（2026-11-03 治本 · 09063447 实锤）', () => {
  it('阳性：id 直配命中首卡，body.items ≥2 逐项命中 → 并集 532 替代 72', () => {
    // 09063447 真机形态（cp-aiot-dpjh-bsjd）：slot-con 下 6 卡各 72px、gap 20
    const items = ['48:5799', '48:5813', '48:5828', '48:5843', '48:5858', '48:5873']
    const listChildren = items.map((id, i) => ({
      id,
      name: `Group ${i}`,
      type: 'GROUP',
      absoluteBoundingBox: { x: 20811, y: 51606 + i * 92, width: 470, height: 72 },
    }))
    const sections: any[] = [
      { id: '48:5890', name: '图区' },
      { id: '48:5798', name: '节点列表', body: { layout: 'vertical', items: items.map((id) => ({ id })) } },
      { id: '48:5888', name: '底部汇总' },
    ]
    const doc = {
      name: 'cp-aiot-dpjh-bsjd',
      type: 'FRAME',
      absoluteBoundingBox: { x: 20811, y: 51533, width: 510, height: 665 },
      children: [
        { id: '48:5797', name: 'bg', type: 'RECTANGLE', absoluteBoundingBox: { x: 20811, y: 51533, width: 510, height: 665 } },
        { id: '565:2', name: 'header', type: 'GROUP', absoluteBoundingBox: { x: 20811, y: 51551, width: 470, height: 30 } },
        {
          id: '565:3', name: 'slot-con', type: 'GROUP', absoluteBoundingBox: { x: 20811, y: 51606, width: 483, height: 571 },
          children: [
            { id: '48:5798', name: 'Group 2136638415', type: 'GROUP', absoluteBoundingBox: { x: 20811, y: 51606, width: 470, height: 72 } },
            ...listChildren,
            { id: '48:5888', name: '共 6 个节点', type: 'TEXT', absoluteBoundingBox: { x: 20811, y: 52161, width: 72, height: 16 } },
            { id: '48:5889', name: '接入设备 10810', type: 'TEXT', absoluteBoundingBox: { x: 20891, y: 52161, width: 107, height: 16 } },
          ],
        },
        // 面板标题栏（48:5890）：真机在 header GROUP 内，这里作为根下节点保证 id 直配可命中
        { id: '48:5890', name: '标题img', type: 'FRAME', absoluteBoundingBox: { x: 20811, y: 51551, width: 470, height: 30 } },
      ],
    }
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, { document: doc }, stats)).toBe(3)
    expect(stats.idDirect).toBe(3)
    // 6×72 + 5×20 = 532（首卡 72 → 并集 532）
    expect(sections[1].styles.figmaHeightPx).toBe(532)
    // 非列表段不受影响
    expect(sections[0].styles.figmaHeightPx).toBe(30)
    expect(sections[2].styles.figmaHeightPx).toBe(16)
    // 比例：30:532:16，列表占绝对大头
    expect(sections[1].styles.flexGrow).toBeGreaterThan(sections[0].styles.flexGrow * 5)
  })

  it('阴性：配对节点已是整段容器（并集 ≤ 配对高）→ 不覆盖', () => {
    const sections: any[] = [
      { id: 'a:1', name: '段一', body: { items: [{ id: 'a:1' }, { id: 'a:2' }] } },
      { id: 'b:1', name: '段二' },
    ]
    const doc = {
      name: 'cp-x', type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
      children: [
        { id: 'a:1', name: 'container', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 200 },
          children: [
            { id: 'a:2', name: 'row', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 90 } },
          ] },
        { id: 'b:1', name: 'footer', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 200, width: 400, height: 100 } },
      ],
    }
    const stats: any = {}
    applyFigmaSectionRatios(sections, { document: doc }, stats)
    expect(sections[0].styles.figmaHeightPx).toBe(200) // 容器 200 保持（子项并集 90 < 200）
  })

  it('阴性：body.items < 2 或 item 不命中 → 行为不变', () => {
    const sections: any[] = [
      { id: 'a:1', name: '段一', body: { items: [{ id: 'zzz' }] } },
      { id: 'b:1', name: '段二' },
    ]
    const doc = {
      name: 'cp-y', type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
      children: [
        { id: 'a:1', name: 'one', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 120 } },
        { id: 'b:1', name: 'two', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 120, width: 400, height: 180 } },
      ],
    }
    const stats: any = {}
    applyFigmaSectionRatios(sections, { document: doc }, stats)
    expect(sections[0].styles.figmaHeightPx).toBe(120)
  })
})

// ============================================================
// 🆕 2026-11-03 治本：段标题节点上溯 `slot-{段名}` 同名容器
// 实锤 mc-max-1793683866145-ec1db095（流量监测）：vision section.id 锚到 Figma 里的
// **段标题 GROUP**（2:3559 标题 24px / 2:3439 sub-header 24px / 2:3571 tit 24px），
// ①-β id 直配「全命中即采纳」⇒ A4 比例 24:21:24:24 近均分 + 刀16 用标题 y 差算出
// 242/124/133px margin-top ⇒ 大面积空白 + 文字互叠。真值容器是祖先 `slot-{业务名}`
// （Figma 命名约定，业务名与 section.name 精确同名）：556 / 142 / 174。
// 判据：沿 parentId 上溯 ≤4 跳、祖先名 trim 后严格全等、只升级不降级、fail-open。
// ============================================================
describe('slot 同名容器上溯（2026-11-03 治本 · ec1db095 实锤）', () => {
  it('父链事实：collectFigmaNodes 记录 parentId（上溯的纯结构前提）', () => {
    const doc = figmaDoc([
      {
        id: 'p', name: 'slot-x', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [{ id: 'c', name: 'kid', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 5, height: 5 } }],
      },
    ])
    const nodes = collectFigmaNodes(doc)
    expect(nodes.find((n) => n._id === 'c')?.parentId).toBe('p')
    // 根下节点无父 id（figmaDoc 根未给 id）→ null（链到此终止）
    expect(nodes.find((n) => n._id === 'p')?.parentId).toBe(null)
  })

  it('阳性：段标题 GROUP(24) 上溯 slot-{段名} 容器 → [556,142,174]（24→556 修正）', () => {
    const sections: any[] = [
      { id: '2:3559', name: '当日总流量' },
      { id: '2:3439', name: '车型分布' },
      { id: '2:3571', name: '流量预测' },
    ]
    const doc = {
      name: 'cp-流量监测',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 944 },
      children: [
        { id: 'bg', name: 'bg-[m]', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 944 } },
        {
          id: '88:33', name: 'slot-当日总流量', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 30, width: 420, height: 556 },
          children: [
            {
              id: '88:32', name: 'sub-header', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 30, width: 420, height: 30 },
              children: [
                { id: '2:3559', name: '标题', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 32, width: 120, height: 24 } },
              ],
            },
          ],
        },
        {
          id: '2:3438', name: 'slot-车型分布', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 590, width: 420, height: 142 },
          children: [
            { id: '2:3439', name: 'sub-header', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 592, width: 120, height: 24 } },
          ],
        },
        {
          id: '83:30', name: 'slot-流量预测', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 740, width: 420, height: 174 },
          children: [
            {
              id: '2:3565', name: 'sub-header', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 742, width: 420, height: 30 },
              children: [
                { id: '2:3571', name: 'tit', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 744, width: 80, height: 24 } },
              ],
            },
          ],
        },
      ],
    }
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, { document: doc }, stats)).toBe(3)
    expect(stats.idDirect).toBe(3) // 仍走 ①-β id 直配，仅采纳值被上溯替换
    expect(stats.slotAncestor).toBe(3) // 计数行取证：3 段全部上溯生效
    expect(sections.map((s: any) => s.styles.figmaHeightPx)).toEqual([556, 142, 174])
    const avg = (556 + 142 + 174) / 3
    expect(sections[0].styles.flexGrow).toBeCloseTo(556 / avg, 2) // ≈1.913
    expect(sections[1].styles.flexGrow).toBeCloseTo(142 / avg, 2) // ≈0.489
    expect(sections[2].styles.flexGrow).toBeCloseTo(174 / avg, 2) // ≈0.599
    for (const s of sections) {
      expect(s.styles.flexBasis).toBe(0)
      expect(s.styles.height).toBeUndefined() // 仍是比例，不写固定 px
    }
  })

  it('阴性：祖先名不精确相等（slot-车型分布2 / slot-其他）→ 不上溯，保持配对值', () => {
    const sections: any[] = [
      { id: 'x1', name: '车型分布' },
      { id: 'x2', name: '流量预测' },
    ]
    const doc = {
      name: 'cp-neg1', type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
      children: [
        {
          id: 'p1', name: 'slot-车型分布2', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 142 },
          children: [{ id: 'x1', name: 'sub-header', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 24 } }],
        },
        {
          id: 'p2', name: 'slot-其他', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 200, width: 400, height: 174 },
          children: [{ id: 'x2', name: 'tit', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 200, width: 120, height: 24 } }],
        },
      ],
    }
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, { document: doc }, stats)).toBe(2)
    expect(stats.idDirect).toBe(2)
    expect(stats.slotAncestor).toBe(0) // 严格全等不成立 ⇒ 恒 0（判据未失效，是名字不精确）
    expect(sections.map((s: any) => s.styles.figmaHeightPx)).toEqual([24, 24])
  })

  it('阴性（保护）：顺序配对路径不上溯 —— 复合展开把 slot 段拆成子块时子块不得被撑成整段', () => {
    // e1432017 契约：`slot-当日总流量` 自身就是 section，② 路径复合展开把它拆成
    // sub-header/Group/bar/bar 多个 section。若顺序配对也做同名上溯，子块会被撑回 556
    // ⇒ 打挂复合展开（既有 5-section 用例）。故上溯只挂在 id 直配/id 命中的采纳值上。
    const sections: any[] = [
      { id: 'section-daily-total', name: '当日总流量' },
      { id: 'section-forecast', name: '流量预测' },
    ]
    const doc = {
      name: 'cp-neg2', type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 944 },
      children: [
        { id: 'bg', name: 'bg-[m]', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 944 } },
        { id: '88:33', name: 'slot-当日总流量', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 30, width: 420, height: 556 } },
        { id: '83:30', name: 'slot-流量预测', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 740, width: 420, height: 174 } },
      ],
    }
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, { document: doc }, stats)).toBe(2)
    expect(stats.order).toBe(2) // 走的是 ② 顺序配对（语义 id 在 figmaNodes 中不命中）
    expect(stats.slotAncestor).toBe(0)
    expect(sections.map((s: any) => s.styles.figmaHeightPx)).toEqual([556, 174])
  })
})

describe('①-β 追认幻觉缺项（2026-11-03 治本 · ec1db095 实锤）', () => {
  /**
   * 真实 fixture：mc-max-1793683866145-ec1db095（流量监测 2:9778）上 14:00 复测的 6 sections。
   * 真值（.checkpoint dump 逐字）：
   *   - 根 cp-流量监测(2:9778) 根下 [bg-[m], header-(2:3550,32.54), slot-当日总流量(88:33,556.31),
   *     slot-车型分布(2:3438,142.0), slot-流量预测(83:30,174)]
   *   - 5 段 id 直命中；1 段 `2:3580 江阴大桥柱状图` 是 Vision 把 `@antd/tab` 第二个选项文字
   *     **误升格为 section**（真值树不存在 ⇒ validateVisionAnchors 已标 anchorValid:false）。
   *   - 旧「全命中才采纳」被这一项打破 ⇒ idDirect 整体放弃 ⇒ 顺序配对 6≠regions 也 miss ⇒
   *     A4 全灭（真机 stats 原文 {"slotAncestor":0,"idDirectMiss":1,"miss":1}）。
   */
  const cpFlowMonitor = () => ({
    document: {
      id: '2:9778',
      name: 'cp-流量监测',
      type: 'FRAME',
      absoluteBoundingBox: { x: 10, y: 109, width: 425.8275146484375, height: 807 },
      children: [
        { id: '2:3436', name: 'bg-[m]', type: 'BOOLEAN_OPERATION', absoluteBoundingBox: { x: 10, y: 109, width: 425.83, height: 807 } },
        { id: '2:3550', name: 'header-', type: 'GROUP', absoluteBoundingBox: { x: 10, y: 109, width: 425.83, height: 32.54178237915039 } },
        {
          id: '88:33', name: 'slot-当日总流量', type: 'FRAME', absoluteBoundingBox: { x: 10, y: 150, width: 425.83, height: 556.3101196289062 },
          children: [
            {
              id: '88:32', name: 'sub-header', type: 'FRAME', absoluteBoundingBox: { x: 10, y: 150, width: 425.83, height: 30.422534942626953 },
              children: [
                { id: '2:3559', name: '标题', type: 'GROUP', absoluteBoundingBox: { x: 10, y: 152, width: 120, height: 24.338027954101562 } },
              ],
            },
          ],
        },
        {
          id: '2:3438', name: 'slot-车型分布', type: 'GROUP', absoluteBoundingBox: { x: 10, y: 720, width: 425.83, height: 142.000244140625 },
          children: [
            { id: '2:3439', name: 'sub-header', type: 'GROUP', absoluteBoundingBox: { x: 10, y: 722, width: 120, height: 24.338027954101562 } },
          ],
        },
        {
          id: '83:30', name: 'slot-流量预测', type: 'FRAME', absoluteBoundingBox: { x: 10, y: 880, width: 425.83, height: 174 },
          children: [
            {
              id: '2:3565', name: 'sub-header', type: 'FRAME', absoluteBoundingBox: { x: 10, y: 882, width: 425.83, height: 24.338027954101562 },
              children: [
                {
                  id: '2:3566', name: '@antd/tab', type: 'FRAME', absoluteBoundingBox: { x: 10, y: 882, width: 425.83, height: 19 },
                  children: [
                    {
                      id: '2:3569', name: 'btn', type: 'FRAME', absoluteBoundingBox: { x: 10, y: 882, width: 100, height: 19 },
                      children: [
                        { id: '2:3570', name: '江阴大桥', type: 'TEXT', absoluteBoundingBox: { x: 10, y: 882, width: 60, height: 10 } },
                      ],
                    },
                  ],
                },
                { id: '2:3571', name: 'tit', type: 'GROUP', absoluteBoundingBox: { x: 10, y: 885, width: 80, height: 24.338027954101562 } },
              ],
            },
          ],
        },
      ],
    },
  })

  const realSections = (): any[] => [
    { id: '2:3550', name: '流量监测标题' },
    { id: '2:3559', name: '当日总流量' },
    { id: '2:3570', name: '江阴靖江长江隧道柱状图' },
    { id: '2:3580', name: '江阴大桥柱状图', anchorValid: false }, // Vision 幻觉升格段
    { id: '2:3439', name: '车型分布' },
    { id: '2:3571', name: '流量预测' },
  ]

  it('⭐ 阳性：未命中项全部 anchorValid===false ⇒ 追认命中项，A4 由全灭变为 [33,556,10,142,174]', () => {
    const sections = realSections()
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, cpFlowMonitor(), stats)).toBe(5)
    // 计数行取证：走了 ①-β 且追认了 1 个幻觉缺项
    expect(stats.idDirect).toBe(5)
    expect(stats.idDirectSkipHallucinated).toBe(1)
    expect(stats.slotAncestor).toBe(3) // 556/142/174 三段走上溯（与 B 组剔除幻觉后逐项一致）
    expect(stats.idDirectMiss).toBeUndefined() // 不再整体放弃
    // 命中 5 项各自写入比例；幻觉项（下标 3）保持无 styles
    expect(sections.map((s: any) => s.styles?.figmaHeightPx)).toEqual([33, 556, 10, undefined, 142, 174])
    // 幻觉项本身完全不给比例（fail-open ⇒ 交宿主默认 flex，不猜不混配）
    expect(sections[3].styles).toBeUndefined()
    const avg = (32.54178237915039 + 556.3101196289062 + 10 + 142.000244140625 + 174) / 5
    expect(sections[0].styles.flexGrow).toBeCloseTo(32.54178237915039 / avg, 2) // ≈0.178
    expect(sections[1].styles.flexGrow).toBeCloseTo(556.3101196289062 / avg, 2) // ≈3.04
    expect(sections[2].styles.flexGrow).toBeCloseTo(10 / avg, 2) // ≈0.055
    expect(sections[4].styles.flexGrow).toBeCloseTo(142.000244140625 / avg, 2) // ≈0.776
    expect(sections[5].styles.flexGrow).toBeCloseTo(174 / avg, 2) // ≈0.951
  })

  it('阴性（上界）：幻觉缺项数 > 命中数 ⇒ 不采纳（防「大半段臆造」静默劣化）', () => {
    // 2 真命中 + 3 幻觉缺项：hallucinatedMiss(3) > matched(2) → 判定样本已不可信，维持放弃。
    const sections: any[] = [
      { id: '2:3550', name: '流量监测标题' },
      { id: '2:3559', name: '当日总流量' },
      { id: '9:9001', name: '臆造一', anchorValid: false },
      { id: '9:9002', name: '臆造二', anchorValid: false },
      { id: '9:9003', name: '臆造三', anchorValid: false },
    ]
    const stats: any = {}
    applyFigmaSectionRatios(sections, cpFlowMonitor(), stats)
    expect(stats.idDirect).toBeUndefined()
    expect(stats.idDirectSkipHallucinated).toBe(0) // 计数行「0 也打」：未追认不是判据失效
    expect(stats.idDirectMiss).toBe(3)
  })

  it('阴性：未命中项无 anchorValid===false 标记（可能真·错配）⇒ 整体放弃，不放松', () => {
    // 语义 id（attributes-section 类）在 figmaNodes 中天然不命中，且没有幻觉标记 ⇒ 维持旧行为。
    const sections: any[] = [
      { id: '2:3550', name: '流量监测标题' },
      { id: '2:3559', name: '当日总流量' },
      { id: 'semantic-section', name: '语义段落' },
    ]
    const stats: any = {}
    applyFigmaSectionRatios(sections, cpFlowMonitor(), stats)
    expect(stats.idDirect).toBeUndefined()
    expect(stats.idDirectSkipHallucinated).toBe(0)
    expect(stats.idDirectMiss).toBe(1)
  })

  it('阴性：anchorValid===true（锚点仍被判为可信但配对未命中）⇒ 不追认', () => {
    const sections: any[] = [
      { id: '2:3550', name: '流量监测标题' },
      { id: '2:3559', name: '当日总流量' },
      { id: '2:9999', name: '未收录但标记可信', anchorValid: true },
    ]
    const stats: any = {}
    applyFigmaSectionRatios(sections, cpFlowMonitor(), stats)
    expect(stats.idDirect).toBeUndefined()
    expect(stats.idDirectSkipHallucinated).toBe(0)
    expect(stats.idDirectMiss).toBe(1)
  })

  it('阴性：全命中（idDirectMiss===0）时 idDirectSkipHallucinated 恒 0（回归原行为）', () => {
    const sections: any[] = [
      { id: '2:3550', name: '流量监测标题' },
      { id: '2:3559', name: '当日总流量' },
    ]
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, cpFlowMonitor(), stats)).toBe(2)
    expect(stats.idDirect).toBe(2)
    expect(stats.idDirectSkipHallucinated).toBe(0)
  })
})

/**
 * ①-γ section.id 部分命中 + 剩余区域兜底（2026-11-04 治本 · mc-max-1793765119169-4cbe82a2 实锤）。
 *
 * 真实 fixture（`.mc-gen/cache/figma-node-data.json` 逐字）：cp-环境监测 2:7879 420×186，
 * 根下 [bg(铺满), header(28.09), slot-con(145)]；slot-con 下**文档序**为
 * [@echarts/line(113, y930), sub-t(32, y898)]——图表在前、标签行在后，与视觉顺序相反。
 * vision 4 段：3 段 id 精确命中（2:7889/89:43/2:7949），第 4 段 `chart-section` 是自造壳
 * （Figma 树无此 id、无 anchorValid 标记）⇒ ①-β 整体放弃 ⇒ ② 顺序配对把 113px 的图表
 * 配给「标签切换栏」（真机 flexGrow 2.539 vs 图表 0.539，产物图表压成 13.5%）。
 */
describe('①-γ id 部分命中 + 剩余区域兜底（2026-11-04 治本 · 4cbe82a2 实锤）', () => {
  const cpEnvMonitor = () => ({
    document: {
      id: '2:7879',
      name: 'cp-环境监测',
      type: 'FRAME',
      absoluteBoundingBox: { x: 1475, y: 865, width: 420, height: 186 },
      children: [
        { id: '2:7880', name: 'bg', type: 'VECTOR', absoluteBoundingBox: { x: 1475, y: 865, width: 420, height: 186 } },
        {
          id: '2:7881', name: 'header', type: 'GROUP',
          absoluteBoundingBox: { x: 1495, y: 875, width: 377, height: 28.08984375 },
          children: [
            { id: '2:7888', name: '环境监测', type: 'TEXT', absoluteBoundingBox: { x: 1495, y: 875, width: 64, height: 19 } },
          ],
        },
        {
          id: '89:41', name: 'slot-con', type: 'FRAME',
          absoluteBoundingBox: { x: 1495, y: 898, width: 380, height: 145 },
          children: [
            { id: '2:7898', name: '@echarts/line', type: 'GROUP', absoluteBoundingBox: { x: 1495, y: 930, width: 380, height: 113 } },
            {
              id: '89:42', name: 'sub-t', type: 'FRAME',
              absoluteBoundingBox: { x: 1495, y: 898, width: 380, height: 32 },
              children: [
                { id: '2:7889', name: 'tabs-list', type: 'GROUP', absoluteBoundingBox: { x: 1495, y: 903, width: 295, height: 27 } },
                { id: '89:43', name: 'tabs-icon', type: 'FRAME', absoluteBoundingBox: { x: 1816, y: 905, width: 52, height: 24 } },
                { id: '2:7949', name: 'num', type: 'GROUP', absoluteBoundingBox: { x: 1861, y: 898, width: 14, height: 14 } },
              ],
            },
          ],
        },
      ],
    },
  })

  it('⭐ 阳性：3 段 id 命中 + 1 段自造壳 → 剩余区域兜底，图表回到 113px（63.5%）', () => {
    const sections: any[] = [
      { id: '2:7889', name: '标签切换栏' },
      { id: '89:43', name: '操作按钮' },
      { id: '2:7949', name: '角标' },
      { id: 'chart-section', name: '图表区域' },
    ]
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, cpEnvMonitor(), stats)).toBe(4)
    // 计数行取证：走 ①-γ，且不再退化成 ② 顺序配对、不再整体放弃
    expect(stats.idDirectLeftover).toBe(1)
    expect(stats.idDirect).toBeUndefined()
    expect(stats.order).toBeUndefined()
    expect(stats.idDirectMiss).toBe(1)
    // 修复前：标签栏 113 / 图表 24（正好反了）；修复后按 Figma 图元真值
    expect(sections.map((s: any) => s.styles.figmaHeightPx)).toEqual([27, 24, 14, 113])
    const avg = (27 + 24 + 14 + 113) / 4 // 44.5
    expect(sections[0].styles.flexGrow).toBeCloseTo(27 / avg, 2) // ≈0.607
    expect(sections[1].styles.flexGrow).toBeCloseTo(24 / avg, 2) // ≈0.539
    expect(sections[2].styles.flexGrow).toBeCloseTo(14 / avg, 2) // ≈0.315
    expect(sections[3].styles.flexGrow).toBeCloseTo(113 / avg, 2) // ≈2.539
    // 比例量纲（avg=1，和 = 段数），图表段独占设计事实的 63.5%
    const sum = sections.reduce((a: number, s: any) => a + s.styles.flexGrow, 0)
    expect(sum).toBeCloseTo(4, 2)
    expect(113 / 178).toBeCloseTo(0.635, 3)
    // header 走 base-panel header slot：28.09 的区域被容错剥掉，不得被任何段认领
    expect(sections.some((s: any) => s.styles.figmaHeightPx === 28)).toBe(false)
  })

  it('阴性（等量纪律）：剩余区域数 ≠ 未命中段数 ⇒ 不采纳，退回 ②（不猜）', () => {
    const sections: any[] = [
      { id: '2:7889', name: '标签切换栏' },
      { id: '89:43', name: '操作按钮' },
      { id: '2:7949', name: '角标' },
      { id: 'chart-section', name: '图表区域' },
      { id: 'extra-section', name: '多出的臆造段' },
    ]
    const stats: any = {}
    applyFigmaSectionRatios(sections, cpEnvMonitor(), stats)
    expect(stats.idDirectLeftover).toBe(0)
    expect(stats.idDirectLeftoverMiss).toBe(1)
    // ② 路径原样生效（展开 sub-t 后 5 图元 == 5 sections），证明 ①-γ 未越权接管
    expect(stats.order).toBe(5)
    expect(sections[0].styles.figmaHeightPx).toBe(28) // header 28.09 → ② 路径的结果
  })

  it('阴性（证据门槛）：id 命中 < 2 段 ⇒ 不启用 ①-γ（孤例不猜）', () => {
    const sections: any[] = [
      { id: '2:7889', name: '标签切换栏' },
      { id: 'semantic-a', name: '语义段甲' },
      { id: 'semantic-b', name: '语义段乙' },
    ]
    const stats: any = {}
    applyFigmaSectionRatios(sections, cpEnvMonitor(), stats)
    expect(stats.idDirectLeftover).toBe(0)
    expect(stats.idDirectLeftoverMiss).toBeUndefined() // 门槛未过，连校验都不进入
  })

  /**
   * 多剩余场景的**顺序纪律**：剩余区域按 Figma y 视觉序升序与未命中段逐位配对。
   *
   * 病灶复现（同一类型，非实测产物）：`slot-con` 的文档序把视觉在下的 `high-region(160, y240)`
   * 排在视觉在上的 `low-region(40, y40)` 之前（cp-环境监测 2:7879 的 `slot-con` 就是
   * `[@echarts/line(113, y930), sub-t(32, y898)]` 这种倒序）⇒ 若按文档序兜底，
   * 「横带区」会拿到 160px、「大板区」拿到 40px，**正好反了**，等于把 4cbe82a2 的病灶换个位置复发。
   */
  it('⭐ 阳性（顺序纪律）：剩余区域按 Figma y 视觉序配对，不被文档序串列', () => {
    const figma = () => ({
      document: {
        id: '3:100',
        name: 'cp-双剩余',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
        children: [
          { id: '3:101', name: 'bg', type: 'VECTOR', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 } },
          { id: '3:102', name: 'header', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 24 } },
          {
            id: '3:103', name: 'slot-con', type: 'FRAME',
            absoluteBoundingBox: { x: 0, y: 40, width: 400, height: 360 },
            children: [
              // 🔴 文档序：视觉在下的排在前（与 cp-环境监测 同款倒序）
              { id: '3:104', name: 'high-region', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 240, width: 400, height: 160 } },
              { id: '3:105', name: 'low-region', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 40, width: 400, height: 40 } },
              {
                id: '3:106', name: 'inner', type: 'FRAME',
                absoluteBoundingBox: { x: 0, y: 300, width: 400, height: 100 },
                children: [
                  { id: '3:107', name: 'hit-a', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 310, width: 400, height: 30 } },
                  { id: '3:108', name: 'hit-b', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 350, width: 400, height: 30 } },
                ],
              },
            ],
          },
        ],
      },
    })
    // vision 顺序 = 视觉序（上→下）：两个未命中段在前（y40 / y240），命中的两段在容器内（y310 / y350）
    const sections: any[] = [
      { id: 'band', name: '横带区' },
      { id: 'board', name: '大板区' },
      { id: '3:107', name: '指标甲' },
      { id: '3:108', name: '指标乙' },
    ]
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, figma(), stats)).toBe(4)
    expect(stats.idDirectLeftover).toBe(2)
    expect(stats.idDirectMiss).toBe(2)
    expect(stats.order).toBeUndefined()
    // 若按文档序兜底：[160, 40, 30, 30]（错）；按 y 视觉序：[40, 160, 30, 30]（对）
    expect(sections.map((s: any) => s.styles.figmaHeightPx)).toEqual([40, 160, 30, 30])
    const avg = (40 + 160 + 30 + 30) / 4 // 65
    expect(sections[0].styles.flexGrow).toBeCloseTo(40 / avg, 2) // ≈0.615
    expect(sections[1].styles.flexGrow).toBeCloseTo(160 / avg, 2) // ≈2.462
    // header(24) 被容错剥掉，未被任何段认领
    expect(sections.some((s: any) => s.styles.figmaHeightPx === 24)).toBe(false)
  })

  /**
   * 🛡️ 2026-11-04 评审补刀（判据裁决冲突）：①-β 上界裁决「幻觉缺项数 > 命中数 ⇒ 样本不可信」
   * 之后代码会落入 ①-γ；若剩余区域数恰等，旧实现会把**已判臆造的段**（anchorValid===false）
   * 又配回真实区域——等于用位置兜底推翻 id 层面的可信度裁决。修法：缺项混入任一幻觉标记
   * 即不接管（含混合场景），该域完全交给 ①-β/② 既有口径。
   */
  it('阴性（幻觉域隔离）：缺项含 anchorValid===false ⇒ ①-γ 不接管，退回既有 ② 口径', () => {
    const figma = () => ({
      document: {
        id: '4:200',
        name: 'cp-幻觉域',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
        children: [
          { id: '4:201', name: 'bg', type: 'VECTOR', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 } },
          {
            id: '4:202', name: 'slot-con', type: 'FRAME',
            absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 400 },
            children: [
              { id: '4:203', name: 'w1', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 50 } },
              { id: '4:204', name: 'w2', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 60, width: 400, height: 60 } },
              { id: '4:205', name: 'w3', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 130, width: 400, height: 70 } },
              {
                id: '4:206', name: 'inner', type: 'FRAME',
                absoluteBoundingBox: { x: 0, y: 210, width: 400, height: 190 },
                children: [
                  { id: '4:207', name: 'hit-a', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 220, width: 400, height: 30 } },
                  { id: '4:208', name: 'hit-b', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 260, width: 400, height: 30 } },
                ],
              },
            ],
          },
        ],
      },
    })
    // 3 个幻觉缺项（> 2 命中 ⇒ ①-β 上界明确放弃）；剩余区域恰为 [w1,w2,w3] 数量相等
    // —— 旧实现会在 ①-γ 把臆造段配回 w1/w2/w3。
    const sections: any[] = [
      { id: 'fake-1', name: '臆造一', anchorValid: false },
      { id: 'fake-2', name: '臆造二', anchorValid: false },
      { id: 'fake-3', name: '臆造三', anchorValid: false },
      { id: '4:207', name: '指标甲' },
      { id: '4:208', name: '指标乙' },
    ]
    const stats: any = {}
    applyFigmaSectionRatios(sections, figma(), stats)
    // ①-γ 未接管：无 leftover 计数（连 miss 计数都不进）
    expect(stats.idDirectLeftover).toBe(0)
    expect(stats.idDirectLeftoverMiss).toBeUndefined()
    // 落回既有链路：①-β 放弃（缺项登记 3），② 顺序配对接管（复合展开 inner 后 5==5）
    expect(stats.idDirect).toBeUndefined()
    expect(stats.idDirectMiss).toBe(3)
    expect(stats.order).toBe(5)
  })
})

/**
 * 🛡️ 2026-11-05 治本：② 顺序配对必须按**视觉序**而非 Figma 文档序
 *
 * 事故 mc-max-1793840255758-76bb6b43（cp-环境监测 2:7879）：vision 只切出 2 段
 * （`89:42 Tab切换栏` 真 id + `chart-section` 自造壳），①-γ 要求 id 精确命中 ≥2 段 ⇒ 不接管
 * ⇒ 落 ②。`collectSectionRegions` 的文档序是 `[@echarts/line(113), sub-t(32)]`，与视觉上下序
 * 相反 ⇒ 113px 的图表区被配给 Tab 栏（flexGrow 1.559）⇒ 产物 Tab 栏撑到 78%、图表压成 22%。
 *
 * A4 方案 §9.3.2 已登记为残留并指明修法：抽公共 sortByVisualOrder 供 ②/①-γ 共用。
 */
describe('② 顺序配对视觉序（2026-11-05 治本 · 76bb6b43 实锤）', () => {
  // 与 ①-γ 用例同一棵真值树（cp-环境监测），此处独立定义避免跨 describe 依赖
  const cpEnvMonitor = () => ({
    document: {
      id: '2:7879',
      name: 'cp-环境监测',
      type: 'FRAME',
      absoluteBoundingBox: { x: 1475, y: 865, width: 420, height: 186 },
      children: [
        { id: '2:7880', name: 'bg', type: 'VECTOR', absoluteBoundingBox: { x: 1475, y: 865, width: 420, height: 186 } },
        {
          id: '2:7881', name: 'header', type: 'GROUP',
          absoluteBoundingBox: { x: 1495, y: 875, width: 377, height: 28.08984375 },
          children: [
            { id: '2:7888', name: '环境监测', type: 'TEXT', absoluteBoundingBox: { x: 1495, y: 875, width: 64, height: 19 } },
          ],
        },
        {
          id: '89:41', name: 'slot-con', type: 'FRAME',
          absoluteBoundingBox: { x: 1495, y: 898, width: 380, height: 145 },
          children: [
            // 🔴 文档序在前、视觉序在后（y930 > y898）——正是本案病灶
            { id: '2:7898', name: '@echarts/line', type: 'GROUP', absoluteBoundingBox: { x: 1495, y: 930, width: 380, height: 113 } },
            {
              id: '89:42', name: 'sub-t', type: 'FRAME',
              absoluteBoundingBox: { x: 1495, y: 898, width: 380, height: 32 },
              children: [
                { id: '2:7889', name: 'tabs-list', type: 'GROUP', absoluteBoundingBox: { x: 1495, y: 903, width: 295, height: 27 } },
          ]},
        ]},
      ],
    },
  })

  it('⭐ 阳性：文档序与视觉序相反 ⇒ 按 y 视觉序配对（Tab 32px / 图表 113px）', () => {
    // 都不带 id ⇒ ①-β/①-γ 均不接管，强制走 ② 顺序配对
    const sections: any[] = [
      { name: 'Tab切换栏' },
      { name: 'CO浓度趋势图' },
    ]
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, cpEnvMonitor(), stats)).toBe(2)
    expect(stats.order).toBe(2)
    // 修复前：[113, 32] —— 图表与标签栏对调，正是用户报「Tab 栏占了半个组件」
    expect(sections.map((s: any) => s.styles.figmaHeightPx)).toEqual([32, 113])
    const avg = (32 + 113) / 2
    expect(sections[0].styles.flexGrow).toBeCloseTo(32 / avg, 2) // ≈0.441
    expect(sections[1].styles.flexGrow).toBeCloseTo(113 / avg, 2) // ≈1.559
    // 比例量纲 avg=1（和为段数）
    const sum = sections.reduce((a: number, s: any) => a + s.styles.flexGrow, 0)
    expect(sum).toBeCloseTo(2, 2)
    // header 28.09 仍被容错剥掉，不得被任何段认领
    expect(sections.some((s: any) => s.styles.figmaHeightPx === 28)).toBe(false)
  })

  it('阴性（零位移）：文档序即视觉序 ⇒ 配对结果与文档序一致', () => {
    const sequential = {
      document: {
        id: 'root',
        name: 'root',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
        children: [
          { id: 'a', name: 'block-a', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 100 } },
          { id: 'b', name: 'block-b', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 100, width: 400, height: 200 } },
        ],
      },
    }
    const sections: any[] = [{ name: '上段' }, { name: '下段' }]
    applyFigmaSectionRatios(sections, sequential, {})
    expect(sections.map((s: any) => s.styles.figmaHeightPx)).toEqual([100, 200])
  })

  /**
   * 🛡️ 2026-11-05 追认补闭环：A4 方案 §3(:52) 否决的「四段行内图元」场景必须 fail-open。
   * 文档序 `[chart(113,y930), num(14,y898), tabs-list(27,y903), tabs-icon(24,y905)]`
   * 中后三者 y 区间互相交叠 ⇒ hasNonOverlappingVerticalBoxes=false ⇒ 不按 y 排序。
   * 若误排会得到 `[14,27,24,113]`（num 排首位），正是 §3 否决「② 按 y 排序」的理由。
   */
  it('阴性（A4 §3 否决场景）：行内图元 y 区间重叠 ⇒ 不按 y 排序，保持文档序', () => {
    const overlappingRow = {
      document: {
        id: 'root',
        name: 'root',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 890, width: 400, height: 160 },
        children: [
          // 🔴 文档序：视觉在下的图表区排在最前（与 A4 §2 根因链同款）
          { id: 'd', name: 'chart-block', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 930, width: 400, height: 113 } },
          { id: 'a', name: 'num', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 898, width: 40, height: 14 } },
          { id: 'b', name: 'tabs-list', type: 'GROUP', absoluteBoundingBox: { x: 45, y: 903, width: 295, height: 27 } },
          { id: 'c', name: 'tabs-icon', type: 'GROUP', absoluteBoundingBox: { x: 345, y: 905, width: 40, height: 24 } },
        ],
      },
    }
    const sections: any[] = [{ name: '段1' }, { name: '段2' }, { name: '段3' }, { name: '段4' }]
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, overlappingRow, stats)).toBe(4)
    // 不排序 ⇒ 与文档序逐位一致；误排会得到 [14, 27, 24, 113]
    expect(sections.map((s: any) => s.styles.figmaHeightPx)).toEqual([113, 14, 27, 24])
    expect(stats.orderVisualSort).toBe(0)
    expect(stats.orderVisualSortSkippedOverlap).toBe(1)
  })
})
