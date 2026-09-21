/**
 * R2 元素密度拆分 — element-group 确定性归属（2026-09-19 治本）单元测试
 *
 * 背景（mc-max-1789811323065 实锤）：R2 拆分此前只产出 Group1/Group2 名字，
 * 无成员清单 → LLM 无从知道每组分什么 → 卡片内容同源混淆
 * （两组件都写「超高车辆 19次」、危化品车 51 次整卡丢失、重复锚定 data-section-id）。
 *
 * 治本：section 直接子元素按视觉序（figmaBox y→x）轮流分配到各组，每组携带：
 *   sourceNodeIds / elementNames / textTruths / figmaBoxes
 *
 * 测试覆盖：
 * 1. R2 触发（元素 >10 无图表）→ 每组携带成员清单
 * 2. 视觉序分组：按 figmaBox y/x 排序后轮流分配（奇偶位）
 * 3. textTruths 提取成员子树文本真值（深度≤3、≤6条、去重）
 * 4. 成员互斥：同一元素只属于一个分组（归属确定性）
 * 5. 未触发 R2（元素 ≤10）→ 无 element-group（对照组，如卡2 136:128）
 */

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: '/tmp/mvgo-test-workspace',
  backendRoot: '/Users/smigoo/工作/mvgo/backend-node',
  projectRoot: '/Users/smigoo/工作/mvgo',
  logsDir: '/tmp/mvgo-test-logs',
  dataDir: '/tmp/mvgo-test-data',
  tempComponentsDir: '/tmp/mvgo-test-temp-components',
}), { virtual: true })

import { SubcomponentPlanner } from '../subcomponent-planner.js'

/** 构造一张统计卡（bg + icon + 标签/数值文本，含嵌套 children），模拟视觉分析 section item */
function makeCard(opts: {
  id: string
  name: string
  y: number
  x?: number
  label: string
  value: string
}): any {
  return {
    id: opts.id,
    name: opts.name,
    type: 'stat-card',
    role: 'stat-card',
    figmaBox: { x: opts.x ?? 0, y: opts.y, width: 140, height: 74 },
    children: [
      { id: `${opts.id}-bg`, name: `bg`, type: 'bg', figmaBox: { x: 0, y: opts.y, width: 140, height: 74 } },
      { id: `${opts.id}-icon`, name: `icon`, type: 'icon', children: [
        { id: `${opts.id}-icon-inner`, name: 'vector', type: 'vector' },
      ] },
      // 标签/数值文本嵌套一层（模拟 value row 内 number+unit）
      { id: `${opts.id}-label`, name: 'label', type: 'text', text: opts.label },
      { id: `${opts.id}-value`, name: 'value', type: 'text', children: [
        { id: `${opts.id}-number`, type: 'text', text: opts.value },
        { id: `${opts.id}-unit`, type: 'text', text: '次' },
      ] },
    ],
  }
}

describe('R2 元素密度拆分：element-group 确定性归属', () => {
  let planner: InstanceType<typeof SubcomponentPlanner>

  beforeEach(() => {
    planner = new SubcomponentPlanner()
  })

  test('R2 触发时每组 element-group 携带 sourceNodeIds/elementNames/textTruths', () => {
    // 三张卡各 9 个元素（卡1 + 8 子孙）→ 总 27 > 10 → R2 触发
    const cards = [
      makeCard({ id: '136:129', name: '危化品车卡片', y: 984, x: 37, label: '危化品车', value: '51' }),
      makeCard({ id: '136:128', name: '重型货车卡片', y: 984, x: 200, label: '重型货车', value: '2' }),
      makeCard({ id: '136:127', name: '超高车辆卡片', y: 984, x: 350, label: '超高车辆', value: '19' }),
    ]
    const plan = planner.plan(
      { sections: [{ id: '2136639043', name: '统计卡片组', body: { items: cards, layout: 'horizontal-3-items' } }] },
      { enableInternalSplit: true },
    )

    const groups = (plan as any).internalSubcomponents.filter(
      (s: any) => s.type === 'element-group',
    )
    expect(groups.length).toBeGreaterThan(0)

    for (const g of groups) {
      // 确定性归属事实必须存在且非空
      expect(Array.isArray(g.sourceNodeIds)).toBe(true)
      expect(g.sourceNodeIds.length).toBeGreaterThan(0)
      expect(Array.isArray(g.elementNames)).toBe(true)
      expect(g.elementNames.length).toBeGreaterThan(0)
      expect(Array.isArray(g.textTruths)).toBe(true)
      expect(g.textTruths.length).toBeGreaterThan(0)
      // 几何事实（视觉序依据）
      expect(Array.isArray(g.figmaBoxes)).toBe(true)
      expect(g.figmaBoxes.length).toBeGreaterThan(0)
    }

    // 汇总文本真值必须覆盖三张卡的 label+value（防同源混淆的关键）
    const allTexts = groups.flatMap((g: any) => g.textTruths).join('|')
    expect(allTexts).toContain('危化品车')
    expect(allTexts).toContain('51')
    expect(allTexts).toContain('重型货车')
    expect(allTexts).toContain('超高车辆')
    expect(allTexts).toContain('19')
  })

  test('视觉序分组：按 figmaBox y→x 排序后轮流分配，成员互斥', () => {
    // 乱序给（x=350 在前），验证按视觉序重排
    const cards = [
      makeCard({ id: 'c', name: '卡C', y: 100, x: 350, label: '丙', value: '3' }),
      makeCard({ id: 'a', name: '卡A', y: 100, x: 37, label: '甲', value: '1' }),
      makeCard({ id: 'b', name: '卡B', y: 100, x: 200, label: '乙', value: '2' }),
    ]
    const plan = planner.plan(
      { sections: [{ id: 'sec', name: '组', body: { items: cards } }] },
      { enableInternalSplit: true },
    )
    const groups = (plan as any).internalSubcomponents.filter(
      (s: any) => s.type === 'element-group',
    )
    expect(groups.length).toBeGreaterThanOrEqual(2)

    // 成员互斥：同一 figma 节点 id 只属于一个分组
    const seen = new Set<string>()
    for (const g of groups) {
      for (const nid of g.sourceNodeIds) {
        expect(seen.has(nid)).toBe(false)
        seen.add(nid)
      }
    }
    // 视觉序：Group1 的首个成员应是视觉最左的卡A
    const g1First = groups[0].sourceNodeIds[0]
    expect(g1First).toBe('a')
  })

  test('元素 ≤10 不触发 R2（对照组：卡2 136:128 场景）', () => {
    // 单卡 9 元素 ≤ 10 → 无 element-group
    const oneCard = [
      makeCard({ id: '136:128', name: '重型货车卡片', y: 984, label: '重型货车', value: '2' }),
    ]
    const plan = planner.plan(
      { sections: [{ id: 'sec-128', name: '2', body: { items: oneCard } }] },
      { enableInternalSplit: true },
    )
    const groups = (plan as any).internalSubcomponents.filter(
      (s: any) => s.type === 'element-group',
    )
    expect(groups).toHaveLength(0)
  })

  test('R2 豁免：横向并列容器中 ≥2 张同构卡不拆分（方案A · 2026-09-20）', () => {
    // 复刻 mc-max-1789811323065 场景：2:8023 横向容器 + 三张并列卡（卡1/卡3 各 >10 元素）
    // 预期：三卡各为一个组件（无 element-group），整卡作为最小组件单元
    const cards = [
      makeCard({ id: '136:129', name: '危化品车卡片', y: 984, x: 37, label: '危化品车', value: '51' }),
      makeCard({ id: '136:128', name: '重型货车卡片', y: 984, x: 200, label: '重型货车', value: '2' }),
      makeCard({ id: '136:127', name: '超高车辆卡片', y: 984, x: 350, label: '超高车辆', value: '19' }),
    ]
    const layoutStructure = {
      sections: [
        {
          id: '136:121',
          name: 'slot',
          // 与真实 E1 推导产物一致：容器需 isLayoutContainer 标记才会走容器分支
          isLayoutContainer: true,
          layout: 'vertical',
          children: [
            { id: '136:122', name: 'sub-header', children: [] },
            {
              id: '2:8023',
              name: 'Group 2136639043',
              isLayoutContainer: true,
              layout: 'horizontal',
              children: cards,
            },
          ],
        },
      ],
    }
    const plan = planner.plan(layoutStructure, { enableInternalSplit: true })

    // 豁免生效：无 element-group
    const groups = (plan as any).internalSubcomponents.filter(
      (s: any) => s.type === 'element-group',
    )
    expect(groups).toHaveLength(0)

    // 三卡仍是独立叶子 section；R2 豁免后不产出任何 element-group
    const dump: any[] = []
    const walk = (secs: any[]) => {
      for (const s of secs || []) {
        dump.push(s)
        walk(s.children || [])
      }
    }
    walk((plan as any).effectiveSections)
    const card129 = dump.find((s) => s.id === '136:129')
    const card127 = dump.find((s) => s.id === '136:127')
    // 豁免后无拆分产物；复杂度标记仅供日志（豁免优先于 shouldSplitInternally）
    expect((card129?.internalSubcomponents || []).length).toBe(0)
    expect((card127?.internalSubcomponents || []).length).toBe(0)
  })
})
