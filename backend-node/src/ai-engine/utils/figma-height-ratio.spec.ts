import {
  collectFigmaNodes,
  collectSiblingGroups,
  collectSectionRegions,
  elementMatchPatterns,
  findFigmaNodeForElement,
  applyFigmaElementHeightRatios,
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
