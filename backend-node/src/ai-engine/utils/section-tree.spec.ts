/**
 * assignSectionComponentNames 确定性子组件命名单测（2026-09-10，R2 Loop 2b）
 * 治「模板段/脚本段/子组件文件名三者各自由不同 LLM chunk 自定 → 命名不一致 → 死代码」。
 */
import {
  assignSectionComponentNames,
  collectLeafSections,
  formatSectionTreeForPrompt,
  dedupeDuplicateSections,
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

// ──────────────────────────────────────────────
// 🛡️ 治本（2026-09-11 · c-device-monitor-hsvmkuvd-cfb53488）：planner 双重解释去重
// ──────────────────────────────────────────────
describe('dedupeDuplicateSections（planner 双重解释去重）', () => {
  const shell = {
    id: '89:37', title: '@antd/tab', type: 'tabs',
    responsibility: '标签页切换区', elementCount: 2,
  };
  const shellDup = {
    id: 'section-main-content', title: '主内容区（Tab切换+设备网格）', type: 'tabs',
    responsibility: '标签页切换区', elementCount: 16,
    internalSubcomponents: [{ id: 'g1' }, { id: 'g2' }],
  };
  const header = { id: '2:8419', type: 'header', responsibility: '顶部标题区' };
  const stats = { id: 'section-summary-cards', type: 'stats', responsibility: '数据统计指标区', elementCount: 6 };

  it('同 type=tabs 同 responsibility → 保留 elementCount 更大的一份', () => {
    const r = dedupeDuplicateSections([header, shell, shellDup, stats]);
    expect(r).toHaveLength(3);
    const tabs = r.filter((s) => s.type === 'tabs');
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe('section-main-content'); // 16 > 2
  });

  it('responsibility 不同 → 视为不同区域，不去重', () => {
    const other = { id: 'x:1', type: 'tabs', responsibility: '筛选切换区', elementCount: 3 };
    const r = dedupeDuplicateSections([shell, other]);
    expect(r).toHaveLength(2);
  });

  it('非 tabs 类型不去重（两个 stats 同 responsibility 保留）', () => {
    const s1 = { id: 'a', type: 'stats', responsibility: '统计区', elementCount: 2 };
    const s2 = { id: 'b', type: 'stats', responsibility: '统计区', elementCount: 5 };
    const r = dedupeDuplicateSections([s1, s2]);
    expect(r).toHaveLength(2);
  });

  it('递归处理容器 children', () => {
    const container = {
      id: 'c1', isLayoutContainer: true,
      children: [shell, shellDup],
    };
    const r = dedupeDuplicateSections([container]);
    expect(r[0].children).toHaveLength(1);
    expect(r[0].children[0].id).toBe('section-main-content');
  });

  it('幂等：去重结果再次调用零变化', () => {
    const once = dedupeDuplicateSections([header, shell, shellDup, stats]);
    const twice = dedupeDuplicateSections(once);
    expect(twice).toHaveLength(once.length);
  });

  it('空/非数组输入原样返回', () => {
    expect(dedupeDuplicateSections([])).toEqual([]);
    expect(dedupeDuplicateSections(null)).toBeNull();
  });

  // ── R1-1：sourceNodeIds 单一归属（不依赖措辞） ──
  it('sourceNodeIds 交集 → 保留 elementCount 更大者（即使 type 不同）', () => {
    // 同一 Figma 节点 89:37 被 chart 与 stats 两个叶子双重解释（type/responsibility 不同，
    // 措辞兜底漏网）；靠 sourceNodeIds 交集去重。
    const a = {
      id: 'x1', type: 'chart', responsibility: '图表区', elementCount: 3,
      sourceNodeIds: ['89:37', '89:38'],
    };
    const b = {
      id: 'x2', type: 'stats', responsibility: '统计区', elementCount: 9,
      sourceNodeIds: ['89:37'],
    };
    const r = dedupeDuplicateSections([a, b]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('x2'); // 9 > 3
  });

  it('sourceNodeIds 无交集 → 不去重', () => {
    const a = { id: 'x1', type: 'chart', responsibility: '图表区', elementCount: 3, sourceNodeIds: ['89:37'] };
    const b = { id: 'x2', type: 'chart', responsibility: '图表区2', elementCount: 5, sourceNodeIds: ['89:99'] };
    const r = dedupeDuplicateSections([a, b]);
    expect(r).toHaveLength(2);
  });

  it('layout 容器不参与 sourceNodeIds 归属冲突（递归 children）', () => {
    const container = {
      id: 'c1', isLayoutContainer: true,
      children: [
        { id: 'leaf1', type: 'body', responsibility: '主体', elementCount: 4, sourceNodeIds: ['89:37'] },
        { id: 'leaf2', type: 'body', responsibility: '主体副本', elementCount: 8, sourceNodeIds: ['89:37'] },
      ],
    };
    const r = dedupeDuplicateSections([container]);
    expect(r[0].children).toHaveLength(1);
    expect(r[0].children[0].id).toBe('leaf2');
  });
});
