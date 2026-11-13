/**
 * 根治⑩（2026-11-12 · mc-max-1794480764511-f3085ec6 实锤）：vision section 消毒单测。
 * 用流量监测平铺树真值坐标钉死：
 *   R1 背景板剔除（BOOLEAN bg-[m] 807px 被当内容区 flex:0.841 的根源）
 *   R2 标题条锚点纠偏（父块优先：组内 sub-title；兄弟回退：独立 sub-header）
 *   + 幂等 / 阴性（嵌套正常树零改动）/ 无 figmaData 零回归 / 卡片 bgPlaceholder 不误伤
 */
import { sanitizeVisionSections } from './vision-section-sanitizer.js'

/** 按真实坐标构建节点 */
function node(
  id: string,
  name: string,
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
  children: any[] = [],
) {
  return { id, name, type, absoluteBoundingBox: { x, y, width: w, height: h }, children }
}

/** f3085ec6 真值树（用户平铺整理后）：slot-con 直挂 8 块，图表组内含 sub-title */
const flatTree = {
  document: node('2:9778', 'cp-流量监测', 'FRAME', 10, 109, 425.8, 807, [
    node('2:3436', 'bg-[m]', 'BOOLEAN_OPERATION', 15.8, 109, 420, 807, [
      node('2:3437', 'Vector', 'VECTOR', 15.8, 109, 420, 807),
    ]),
    node('2:3550', 'header-', 'GROUP', 35.8, 119.1, 380, 32.5, [
      node('2:3551', 'tit', 'TEXT', 35.8, 119.1, 100, 24),
    ]),
    node('1744:125', 'slot-con', 'FRAME', 10, 158.7, 425.8, 745.3, [
      node('88:32', '0sub-header', 'FRAME', 35.8, 158.7, 380, 30.4, [
        node('2:3545', '@ant/select', 'GROUP', 35.8, 158.7, 120, 30.4),
        node('2:3559', '标题', 'GROUP', 300, 161.8, 60, 24.3),
      ]),
      node('2:3660', '1统计', 'FRAME', 10, 196, 425.8, 91.4, [
        node('88:34', 'bg-[m]', 'FRAME', 10, 196, 425.8, 91.4),
        node('1744:126', 'cards', 'FRAME', 20, 215.7, 400, 52),
      ]),
      node('1744:127', '2charts', 'FRAME', 33.8, 287, 379, 131, [
        node('2:7625', 'sub-title', 'FRAME', 33.8, 287, 118, 21),
        node('2:7459', '@echarts/bar-1', 'GROUP', 33.8, 291, 379, 127),
      ]),
      node('1744:128', '3charts', 'FRAME', 33.8, 428, 379, 131, [
        node('2:7794', 'sub-title', 'FRAME', 33.8, 428, 62, 21),
        node('2:7628', '@echarts/bar-2', 'GROUP', 33.8, 432, 379, 127),
      ]),
      node('2:3439', '4sub-header', 'GROUP', 36.8, 573, 86, 24.3, [
        node('2:3440', '车型分布', 'TEXT', 36.8, 573, 60, 24.3),
        node('2:3441', 'icon', 'GROUP', 100, 576, 18, 18.3),
      ]),
      node('1263:38', '5cards', 'FRAME', 32.8, 601, 387, 114, [
        node('2:3446', 'card', 'FRAME', 32.8, 601, 180, 114),
        node('2:3496', 'card', 'FRAME', 225, 601, 180, 114),
      ]),
      node('2:3565', '6sub-header', 'GROUP', 35.8, 730, 378, 24.3, [
        node('2:3566', '@antd/tab', 'FRAME', 35.8, 733, 60, 18),
        node('2:3571', 'tit', 'GROUP', 100, 730, 60, 24.3),
      ]),
      node('2:3604', '@echarts/line-7', 'GROUP', 43.8, 764.3, 363, 140.7, [
        node('83:31', 'charts', 'FRAME', 43.8, 764.3, 363, 140.7),
        node('2:3636', '图例', 'FRAME', 43.8, 764.3, 120, 18),
      ]),
    ]),
  ]),
}

/** f3085ec6 vision 真实输出：bg 当 section + 5 个内容锚全在标题条上 */
function visionLayout() {
  return {
    type: 'vertical-stack',
    sections: [
      {
        id: '2:3436',
        name: '面板背景',
        role: '装饰',
        layout: 'absolute',
        bgPlaceholder: 'section-bg-2-3436',
        styles: {},
      },
      { id: '2:3550', name: '头部区域', role: '常驻', layout: 'horizontal', styles: {} },
      { id: '88:32', name: '当日总流量', role: '常驻', layout: 'vertical', styles: {} },
      { id: '2:7625', name: '江阴靖江长江隧道流量图表', role: '常驻', layout: 'vertical', styles: {} },
      { id: '2:7794', name: '江阴大桥流量图表', role: '常驻', layout: 'vertical', styles: {} },
      { id: '2:3439', name: '车型分布', role: '常驻', layout: 'vertical', styles: {} },
      { id: '2:3565', name: '流量预测', role: '常驻', layout: 'vertical', styles: {} },
    ],
  }
}

describe('sanitizeVisionSections · R1 背景板剔除', () => {
  it('BOOLEAN bg-[m] 顶层 section 被剔除，其余保留', () => {
    const meta = { removed: [] as string[], reanchored: [] as any[] }
    const out = sanitizeVisionSections(visionLayout() as any, flatTree as any, meta)
    const ids = out.sections.map((s: any) => s.id)
    expect(ids).not.toContain('2:3436')
    expect(out.sections.length).toBe(6)
    expect(meta.removed).toEqual(['2:3436'])
  })

  it('vision role=装饰 且无内容children也剔除（节点解析不到时兜底）', () => {
    const tree = { document: node('r', 'root', 'FRAME', 0, 0, 400, 800, []) }
    const layout = {
      sections: [
        { id: 'X:1', name: '面板背景', role: '装饰', bgPlaceholder: 'section-bg-x', styles: {} },
        { id: 'X:2', name: '正常区', role: '常驻', styles: {} },
      ],
    }
    const out = sanitizeVisionSections(layout as any, tree as any)
    expect(out.sections.map((s: any) => s.id)).toEqual(['X:2'])
  })

  it('内容卡片带 bgPlaceholder 但有 children ⇒ 不误伤', () => {
    const tree = {
      document: node('r', 'root', 'FRAME', 0, 0, 400, 800, [
        node('C:1', 'card-统计', 'FRAME', 10, 10, 380, 91, [
          node('C:11', 'bg', 'FRAME', 10, 10, 380, 91),
        ]),
      ]),
    }
    const layout = {
      sections: [
        {
          id: 'C:1',
          name: '统计卡片',
          role: '常驻',
          bgPlaceholder: 'card-bg-1',
          children: [{ id: 'C:11', name: 'bg' }],
          styles: {},
        },
      ],
    }
    const out = sanitizeVisionSections(layout as any, tree as any)
    expect(out.sections.length).toBe(1)
    expect(out.sections[0].id).toBe('C:1')
  })
})

describe('sanitizeVisionSections · R2 标题条锚点纠偏', () => {
  it('f3085ec6 真实形态：组内 sub-title 重锚到父块，独立 sub-header 重锚到正下方兄弟', () => {
    const meta = { removed: [] as string[], reanchored: [] as any[] }
    const out = sanitizeVisionSections(visionLayout() as any, flatTree as any, meta)
    const byId = new Map(out.sections.map((s: any) => [s.reanchoredFrom || s.id, s]))

    // 组内标题 → 父块（策略 a）
    expect(byId.get('2:7625').id).toBe('1744:127')
    expect(byId.get('2:7794').id).toBe('1744:128')
    // 独立标题条 → 正下方更高兄弟（策略 b）
    expect(byId.get('88:32').id).toBe('2:3660') // 当日总流量 → 1统计 91px
    expect(byId.get('2:3439').id).toBe('1263:38') // 车型分布 → 5cards 114px
    expect(byId.get('2:3565').id).toBe('2:3604') // 流量预测 → @echarts/line 140.7px
    // 头部区域语义保护：锚不变
    const header = out.sections.find((s: any) => s.name === '头部区域')
    expect(header.id).toBe('2:3550')
    expect(header.reanchoredFrom).toBeUndefined()
    // meta 计数
    expect(meta.reanchored.length).toBe(5)
    // 重锚后 figmaHeightPx 回真值
    expect(byId.get('88:32').styles.figmaHeightPx).toBeCloseTo(91.44, 1)
    expect(byId.get('2:7625').styles.figmaHeightPx).toBeCloseTo(131, 1)
    expect(byId.get('2:3565').styles.figmaHeightPx).toBeCloseTo(140.66, 1)
  })

  it('纠偏后 flex 真值：5 个内容块高度比回归 91/131/131/114/141', () => {
    const out = sanitizeVisionSections(visionLayout() as any, flatTree as any)
    const heights = out.sections
      .filter((s: any) => s.reanchoredFrom)
      .map((s: any) => s.styles.figmaHeightPx as number)
    expect(heights.sort((a: number, b: number) => a - b).map((h: number) => Math.round(h))).toEqual([
      91, 114, 131, 131, 141,
    ])
  })

  // 🛡️ 改锚领土回收（2026-11-13 · 7dfc01e9「车型分布」标题丢失实锤）
  it('改锚领土回收：原锚并入 sourceNodeIds，段盒扩为原锚∪新锚联合盒', () => {
    const out = sanitizeVisionSections(visionLayout() as any, flatTree as any)
    // 车型分布：锚 2:3439(y573 h24.3) → 1263:38(y601 h114)，联合盒应含标题行
    const car = out.sections.find((s: any) => s.reanchoredFrom === '2:3439')
    expect(car).toBeDefined()
    expect(car.sourceNodeIds).toContain('2:3439')
    expect(car.absoluteBoundingBox.y).toBeCloseTo(573, 1)
    expect(car.absoluteBoundingBox.height).toBeCloseTo(601 + 114 - 573, 1)
    // 流量预测：锚 2:3565(y730) → 2:3604(y764.3 h140.7)
    const forecast = out.sections.find((s: any) => s.reanchoredFrom === '2:3565')
    expect(forecast.sourceNodeIds).toContain('2:3565')
    expect(forecast.absoluteBoundingBox.y).toBeCloseTo(730, 1)
    expect(forecast.absoluteBoundingBox.height).toBeCloseTo(764.34 + 140.66 - 730, 1)
    // 策略 a（组内 sub-title → 父块）：父块盒本就含标题条，联合盒=父块盒，零扩大
    const chart = out.sections.find((s: any) => s.reanchoredFrom === '2:7625')
    expect(chart.absoluteBoundingBox.y).toBeCloseTo(287, 1)
    expect(chart.absoluteBoundingBox.height).toBeCloseTo(131, 1)
  })

  it('领土回收不改变 flex 主高：figmaHeightPx 仍取新锚', () => {
    const out = sanitizeVisionSections(visionLayout() as any, flatTree as any)
    const car = out.sections.find((s: any) => s.reanchoredFrom === '2:3439')
    expect(car.styles.figmaHeightPx).toBeCloseTo(114, 1) // 新锚 5cards 高，非联合 142
  })
})

describe('sanitizeVisionSections · 幂等与阴性', () => {
  it('幂等：消毒产物再跑一遍零改动', () => {
    const once = sanitizeVisionSections(visionLayout() as any, flatTree as any)
    const meta2 = { removed: [] as string[], reanchored: [] as any[] }
    const twice = sanitizeVisionSections(once, flatTree as any, meta2)
    expect(meta2.removed.length).toBe(0)
    expect(meta2.reanchored.length).toBe(0)
    expect(twice.sections.map((s: any) => s.id)).toEqual(once.sections.map((s: any) => s.id))
  })

  it('阴性：嵌套正常树（bg 被容器包裹、锚在内容块上）零改动', () => {
    const nestedTree = {
      document: node('R', 'root', 'FRAME', 0, 0, 420, 800, [
        node('N:panel', 'panel', 'FRAME', 10, 10, 400, 780, [
          node('N:bg', 'bg-[m]', 'BOOLEAN_OPERATION', 10, 10, 400, 780),
          node('N:stats', '统计', 'FRAME', 20, 60, 380, 120),
          node('N:chart', '2charts', 'FRAME', 20, 200, 380, 200),
        ]),
      ]),
    }
    const layout = {
      sections: [
        { id: 'N:stats', name: '统计', role: '常驻', styles: {} },
        { id: 'N:chart', name: '图表', role: '常驻', styles: {} },
      ],
    }
    const meta = { removed: [] as string[], reanchored: [] as any[] }
    const out = sanitizeVisionSections(layout as any, nestedTree as any, meta)
    expect(meta.removed.length).toBe(0)
    expect(meta.reanchored.length).toBe(0)
    expect(out.sections.map((s: any) => s.id)).toEqual(['N:stats', 'N:chart'])
  })

  it('大锚不纠偏（h>40px）', () => {
    const out = sanitizeVisionSections(visionLayout() as any, flatTree as any)
    const header = out.sections.find((s: any) => s.id === '2:3550')
    expect(header).toBeDefined()
    expect(header.reanchoredFrom).toBeUndefined()
  })

  it('无 figmaData / 空 sections 零回归', () => {
    const layout = visionLayout() as any
    expect(sanitizeVisionSections(layout, null as any)).toBe(layout)
    expect(sanitizeVisionSections({ sections: [] } as any, flatTree as any).sections).toEqual([])
  })
})
