/**
 * assignSectionComponentNames 确定性子组件命名单测（2026-09-10，R2 Loop 2b）
 * 治「模板段/脚本段/子组件文件名三者各自由不同 LLM chunk 自定 → 命名不一致 → 死代码」。
 */
import {
  assignSectionComponentNames,
  collectLeafSections,
  formatSectionTreeForPrompt,
} from './section-tree.js'

describe('assignSectionComponentNames 确定性命名', () => {
  test('不同 type 映射到不同稳定名', () => {
    const tree = [
      { id: 's1', type: 'chart', responsibility: '流量图表', title: '图表区' },
      { id: 's2', type: 'tabs', responsibility: '标签切换', title: 'Tab' },
      { id: 's3', type: 'stats', responsibility: '统计指标', title: '统计栏' },
      { id: 's4', type: 'body', responsibility: '主内容区', title: '主体' },
    ]
    const m = assignSectionComponentNames(tree)
    expect(m.get('s1')).toBe('ChartSection')
    expect(m.get('s2')).toBe('TabsSection')
    expect(m.get('s3')).toBe('StatsSection')
    expect(m.get('s4')).toBe('MainSection')
  })

  test('同 type 多个 section 去重加序号', () => {
    const tree = [
      { id: 'a', type: 'chart', responsibility: '图表1' },
      { id: 'b', type: 'chart', responsibility: '图表2' },
      { id: 'c', type: 'chart', responsibility: '图表3' },
    ]
    const m = assignSectionComponentNames(tree)
    expect(m.get('a')).toBe('ChartSection')
    expect(m.get('b')).toBe('ChartSection2')
    expect(m.get('c')).toBe('ChartSection3')
  })

  test('容器 section 不命名，叶子才命名', () => {
    const tree = [
      {
        id: 'slot-con',
        isLayoutContainer: true,
        children: [
          { id: 'switch', responsibility: '切换开关' },
          { id: 'tab', type: 'tabs', responsibility: '标签' },
        ],
      },
    ]
    const m = assignSectionComponentNames(tree)
    const leaves = collectLeafSections(tree).map((s) => s.id)
    expect(leaves).toEqual(['switch', 'tab'])
    expect(m.has('slot-con')).toBe(false)
    expect(m.get('switch')).toBe('SwitchSection')
    expect(m.get('tab')).toBe('TabsSection')
  })

  test('确定性：同输入两次调用结果一致', () => {
    const tree = [
      { id: 'x', type: 'chart', responsibility: '图表' },
      { id: 'y', responsibility: '设备网格' },
    ]
    const m1 = assignSectionComponentNames(tree)
    const m2 = assignSectionComponentNames(tree)
    expect(m1.get('x')).toBe(m2.get('x'))
    expect(m1.get('y')).toBe(m2.get('y'))
    expect(m1.get('y')).toBe('CardGrid')
  })

  test('空输入返回空 Map，不抛异常', () => {
    expect(assignSectionComponentNames([]).size).toBe(0)
    expect(assignSectionComponentNames(undefined).size).toBe(0)
  })

  test('type 优先：统计区 responsibility 含「标签」二字不误判为 tabs', () => {
    // 实锤：header-stats 的 responsibility = "数据统计指标区（数字+标签+趋势）"，
    // 若关键词匹配排在 type 之前，「标签」会把 stats 误判成 TabsSection。
    const tree = [
      { id: 'hs', type: 'stats', responsibility: '数据统计指标区（数字+标签+趋势）' },
      { id: 'vt', type: 'tabs', responsibility: '标签页切换区' },
    ]
    const m = assignSectionComponentNames(tree)
    expect(m.get('hs')).toBe('StatsSection')
    expect(m.get('vt')).toBe('TabsSection')
  })
})

describe('formatSectionTreeForPrompt 结构树单一事实源（R1）', () => {
  test('叶子输出含布局方向（非 vertical 时标注）', () => {
    const tree = [
      { id: 's1', type: 'chart', responsibility: '图表', layout: 'horizontal', elementCount: 3 },
    ]
    const out = formatSectionTreeForPrompt(tree)
    expect(out).toContain('布局 horizontal')
    expect(out).toContain('s1')
  })

  test('vertical 布局不标注（默认，避免噪音）', () => {
    const out = formatSectionTreeForPrompt([
      { id: 's2', type: 'stats', responsibility: '统计', layout: 'vertical' },
    ])
    expect(out).not.toContain('布局 vertical')
  })

  test('容器标注「不单独生成 .vue」+ 子区块顺序', () => {
    const tree = [
      {
        id: 'slot-con',
        isLayoutContainer: true,
        title: '插槽容器',
        children: [
          { id: 'switch', responsibility: '切换' },
          { id: 'tab', responsibility: '标签页切换区' },
        ],
      },
    ]
    const out = formatSectionTreeForPrompt(tree)
    expect(out).toContain('不单独生成 .vue')
    expect(out).toContain('switch → tab')
  })
})
