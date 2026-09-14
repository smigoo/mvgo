/**
 * assignSectionComponentNames 确定性子组件命名单测（2026-09-10，R2 Loop 2b）
 * 治「模板段/脚本段/子组件文件名三者各自由不同 LLM chunk 自定 → 命名不一致 → 死代码」。
 */
import {
  assignSectionComponentNames,
  collectLeafSections,
  formatSectionTreeForPrompt,
  dedupeDuplicateSections,
  anchorPhantomSections,
  sortSectionsByFigmaY,
  indexFigmaNodes,
  figmaSectionBox,
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

  test('同 type 多个 section：语义后缀命名（替代裸序号）', () => {
    // 2026-09-14 · mc-max-1789376057659-2290591b 实锤：3 chart 原产出 ChartSection/2/3，
    // 裸序号不友好。改造后按 title 派生语义后缀（拼接在类别词干上，不加 Section）。
    const tree = [
      { id: 'slot-hourly-chart-jinjiang', type: 'chart', title: '江阴靖江长江隧道' },
      { id: 'slot-hourly-chart-bridge', type: 'chart', title: '江阴大桥' },
      { id: 'slot-流量预测', type: 'chart', title: '流量预测' },
    ]
    const m = assignSectionComponentNames(tree)
    expect(m.get('slot-hourly-chart-jinjiang')).toBe('ChartTunnel')
    expect(m.get('slot-hourly-chart-bridge')).toBe('ChartBridge')
    expect(m.get('slot-流量预测')).toBe('ChartForecast')
  })

  test('单 chart section：保持干净 base 名 ChartSection（不加后缀）', () => {
    const tree = [{ id: 'c1', type: 'chart', title: '流量图表' }]
    expect(assignSectionComponentNames(tree).get('c1')).toBe('ChartSection')
  })

  test('4 个 type=None 子内容区：用 title/id 派生语义后缀（不再全落 ContentSection2~4）', () => {
    // 2290591b 真实形态：planner 给 4 个 section 标 type=None，title 带语义。
    const tree = [
      { id: '88:32', title: 'sub-header', type: null, responsibility: 'sub-header（请按功能拆分）' },
      { id: '2:3660', title: 'Group 2136636802', type: null, responsibility: 'Group 2136636802（请按功能拆分）' },
      { id: '2:3438', title: 'slot-车型分布', type: null, responsibility: 'slot-车型分布（请按功能拆分）' },
      { id: '2:3565', title: 'sub-header', type: null, responsibility: 'sub-header（请按功能拆分）' },
    ]
    const m = assignSectionComponentNames(tree)
    const names = [...m.values()]
    // 四个都应有语义后缀、且互不相同（无裸序号 2/3/4）
    expect(names).toContain('ContentVehicleDist') // slot-车型分布 → 车型分布
    expect(new Set(names).size).toBe(4) // 无重名
    names.forEach((n) => expect(n).not.toMatch(/ContentSection[2-9]/)) // 不再出现 ContentSection2~9
  })

  test('标题退化（header-/空/Group）回退用 id 抽取语义 token', () => {
    const tree = [
      { id: 'slot-车型分布', title: '', type: null },
      { id: '2:3660', title: 'Group 2136636802', type: null },
    ]
    const m = assignSectionComponentNames(tree)
    expect(m.get('slot-车型分布')).toBe('ContentVehicleDist')
    expect(m.has('2:3660')).toBe(true)
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

  // ── P1（2026-09-14 · c-device-monitor-485d724d / a612a9f7 双实证）：无归属壳判别力 ──
  it('485d724d 形态：超集壳（≥有归属兄弟合计）优先，丢弃有归属子集 tabs/switch', () => {
    // 真实复现 485d724d：壳 elementCount=32、sourceNodeIds=[]，三个有归属兄弟合计 6+2+2=10
    const header = { id: '2:8419', type: 'header', responsibility: '顶部标题区', elementCount: 6, sourceNodeIds: ['2:8419'] };
    const sw = { id: '89:38', type: 'switch', responsibility: '切换卡', elementCount: 2, sourceNodeIds: ['89:38'] };
    const tab = { id: '89:37', type: 'tabs', responsibility: '标签页切换区', elementCount: 2, sourceNodeIds: ['89:37'] };
    const shellDup = { id: 'section-main-content', title: '主内容区', type: 'body', responsibility: '主内容区', elementCount: 32, sourceNodeIds: [] };
    const r = dedupeDuplicateSections([header, sw, tab, shellDup]);
    // header 保留、switch/tabs 被壳覆盖丢弃、壳保留
    expect(r.map((s) => s.id)).toEqual(['2:8419', 'section-main-content']);
  });

  it('a612a9f7 形态：碎片壳（<有归属兄弟合计）被丢弃，只留真实有归属子集', () => {
    // 真实复现 a612a9f7：壳 header-stats(7)/device-grid(0) 均无归属，
    // 有归属兄弟 header(6)+switch(2)+tabs(2)=10。壳是「碎片重述」，应丢壳、留子集。
    const header = { id: '2:8419', type: 'header', responsibility: '顶部标题区', elementCount: 6, sourceNodeIds: ['2:8419'] };
    const sw = { id: '89:38', type: 'switch', responsibility: '切换卡', elementCount: 2, sourceNodeIds: ['89:38'] };
    const tab = { id: '89:37', type: 'tabs', responsibility: '@antd/tab', elementCount: 2, sourceNodeIds: ['89:37'] };
    const statShell = { id: 'header-stats', type: 'stats', responsibility: '头部统计指标区', elementCount: 7, sourceNodeIds: [] };
    const gridShell = { id: 'device-grid', type: 'grid', responsibility: '设备卡片网格区', elementCount: 0, sourceNodeIds: [] };
    const r = dedupeDuplicateSections([header, sw, tab, statShell, gridShell]);
    // 两个壳都被丢，保留 3 个真实有归属 section
    expect(r.map((s) => s.id)).toEqual(['2:8419', '89:38', '89:37']);
  });

  it('碎片壳情况下：TabsSection 与 SwitchSection 都保留（设计稿本就左 Tab 窄列 + 右切换卡共线）', () => {
    const sw = { id: '89:38', type: 'switch', responsibility: '切换卡', elementCount: 2, sourceNodeIds: ['89:38'] };
    const tab = { id: '89:37', type: 'tabs', responsibility: '标签页切换区', elementCount: 2, sourceNodeIds: ['89:37'] };
    const gridShell = { id: 'device-grid', type: 'grid', responsibility: '设备卡片网格区', elementCount: 0, sourceNodeIds: [] };
    const r = dedupeDuplicateSections([sw, tab, gridShell]);
    // 壳 0 < 兄弟合计 4 → 丢壳；tabs+switch 都真实有归属 → 都保留
    expect(r.map((s) => s.id)).toEqual(['89:38', '89:37']);
  });

  it('非竞争正文/统计有归属子集不被误丢（即便有超集壳）', () => {
    // a 是普通 body 子块（非竞争类型）→ 即使有超集壳也保留
    const a = { id: 'x1', type: 'body', responsibility: '主体块', elementCount: 6, sourceNodeIds: ['89:1'] };
    const tab = { id: '89:37', type: 'tabs', responsibility: '标签页切换区', elementCount: 2, sourceNodeIds: ['89:37'] };
    const shell = { id: 'shell', type: 'body', responsibility: '壳', elementCount: 32, sourceNodeIds: [] };
    // 壳 32 ≥ 兄弟合计 8 → 超集：丢竞争类 tab，保留非竞争 body
    const r = dedupeDuplicateSections([a, tab, shell]);
    expect(r.map((s) => s.id)).toEqual(['x1', 'shell']);
  });

  it('整区壳规则不误伤：仅一个子集时不去重', () => {
    const only = { id: '89:37', type: 'tabs', responsibility: '标签页切换区', elementCount: 2, sourceNodeIds: ['89:37'] };
    const shell = { id: 'shell', type: 'body', responsibility: '壳', elementCount: 32, sourceNodeIds: [] };
    const r = dedupeDuplicateSections([only, shell]);
    // ownedSiblings.length < 2 → 规则不触发
    expect(r).toHaveLength(2);
  });

  it('整区壳不丢弃 header（即使 header 有归属）', () => {
    const header = { id: '2:8419', type: 'header', responsibility: '顶部标题区', elementCount: 6, sourceNodeIds: ['2:8419'] };
    const sw = { id: '89:38', type: 'switch', responsibility: '切换卡', elementCount: 2, sourceNodeIds: ['89:38'] };
    const shell = { id: 'shell', type: 'body', responsibility: '壳', elementCount: 32, sourceNodeIds: [] };
    // header 在 ownedSiblings 之后会被显式排除
    const r = dedupeDuplicateSections([header, sw, shell]);
    expect(r.map((s) => s.id)).toEqual(['2:8419', 'shell']);
  });

  it('a612a9f7 端到端：丢 device-grid 碎片壳时把 gridColumns=3 合并进 TabsSection 宿主（信息不丢失）', () => {
    // 真实复现：视觉分析给出 device-grid 的 gridColumns=3，planner 透传后，
    // P1 判别力把无归属碎片壳(device-grid, ec=0)丢弃，但其栅格列数事实必须并入保留的 tabs 宿主。
    const header = { id: '2:8419', type: 'header', responsibility: '顶部标题区', elementCount: 6, sourceNodeIds: ['2:8419'] };
    const sw = { id: '89:38', type: 'switch', responsibility: '切换卡', elementCount: 2, sourceNodeIds: ['89:38'] };
    const tab = { id: '89:37', type: 'tabs', responsibility: '@antd/tab', elementCount: 2, sourceNodeIds: ['89:37'], layout: 'horizontal' };
    const statShell = { id: 'header-stats', type: 'stats', responsibility: '头部统计指标区', elementCount: 7, sourceNodeIds: [] };
    const gridShell = { id: 'device-grid', type: 'grid', responsibility: '设备卡片网格区', elementCount: 0, sourceNodeIds: [], layout: 'grid', gridColumns: 3, body: { layout: 'grid', gridColumns: 3 } };
    const r = dedupeDuplicateSections([header, sw, tab, statShell, gridShell]);
    // 残留 3 个真实 section
    expect(r.map((s) => s.id)).toEqual(['2:8419', '89:38', '89:37']);
    // gridColumns 事实被并入 tabs 宿主（而非随壳丢失）
    const host = r.find((s) => s.id === '89:37');
    expect(host.gridColumns).toBe(3);
    expect(host.body?.gridColumns).toBe(3);
    // 宿主自身 layout 不被覆盖（@antd/tab 内部是 horizontal 横向双列，网格列数是其嵌套事实）
    expect(String(host.layout)).toBe('horizontal');
  });

  it('gridColumns 合并只并入内容宿主（body/tabs/grid/list），不污染 header/switch', () => {
    // 仅 header + 无归属栅格壳 → 壳被丢，但 header 不应挂 gridColumns（header 不是内容宿主）
    const header = { id: 'h1', type: 'header', responsibility: '标题区', elementCount: 3, sourceNodeIds: ['1:1'] };
    const gridShell = { id: 'device-grid', type: 'grid', responsibility: '网格', elementCount: 0, sourceNodeIds: [], layout: 'grid', gridColumns: 4, body: { layout: 'grid', gridColumns: 4 } };
    const r = dedupeDuplicateSections([header, gridShell]);
    // 只有一个有归属兄弟 → ownedSiblings.length<2 → 规则不触发，两者都保留（不丢壳，也不污染）
    expect(r).toHaveLength(2);
    expect(r.find((s) => s.id === 'h1').gridColumns).toBeUndefined();
  });

  it('端到端·真实数据 a612a9f7：碎片壳全丢，只留 3 个真实有归属 section', () => {
    // 来自 c-device-monitor-a612a9f7/.checkpoint/analysis.json 的真实 effectiveSections（节选）。
    // 关键：header-stats(ec=7,src=[]) 与 device-grid(ec=0,src=[]) 是无归属碎片壳，
    // 有归属兄弟 header(6)+switch(2)+tabs(2)=10 > 碎片壳 → 壳是「碎片重述」，应丢壳留子集。
    const real = [
      { id: '2:8419', type: 'header', title: 'header', elementCount: 6, sourceNodeIds: ['2:8419', '2:8427', '2:8428', '2:8431', '2:8434', '2:8426', '2:8856'] },
      { id: '89:38', title: 'switch', elementCount: 2, sourceNodeIds: ['89:38', '2:8787', '2:8806'] },
      { id: '89:37', type: 'tabs', title: '@antd/tab', elementCount: 2, sourceNodeIds: ['89:37', '89:39', '2:8437'] },
      { id: 'header-stats', type: 'stats', title: '头部统计指标区', elementCount: 7, sourceNodeIds: [] },
      { id: 'device-grid', type: 'grid', title: '设备卡片网格区', sourceNodeIds: [] },
    ];
    const r = dedupeDuplicateSections(real);
    expect(r.map((s) => s.id)).toEqual(['2:8419', '89:38', '89:37']);
  });

  it('端到端·真实数据 485d724d：超集壳保留，丢竞争类有归属切片', () => {
    // 来自 c-device-monitor-485d724d 的真实 effectiveSections（节选）。
    // 壳 section-main-content(ec=32,src=[]) 覆盖整块 > 有归属兄弟合计 10 → 超集，丢 tabs/switch 切片。
    const real = [
      { id: '2:8419', type: 'header', title: 'header', elementCount: 6, sourceNodeIds: ['2:8419'] },
      { id: '89:38', title: 'switch', elementCount: 2, sourceNodeIds: ['89:38'] },
      { id: '89:37', type: 'tabs', title: '@antd/tab', elementCount: 2, sourceNodeIds: ['89:37'] },
      { id: 'section-main-content', title: '主内容区（Tab切换+设备网格）', type: 'body', elementCount: 32, sourceNodeIds: [] },
    ];
    const r = dedupeDuplicateSections(real);
    expect(r.map((s) => s.id)).toEqual(['2:8419', 'section-main-content']);
  });
});

// ──────────────────────────────────────────────
// 🛡️ 治本（2026-09-14 · c-traffic-monitor-34750940 实锤）：无归属壳锚定真实 Figma 节点
//
// 背景：vision schema 示例教 LLM 用语义 id（"daily-total"）起 section 名 →
//   collectSourceNodeIds 只认 `数字:数字` → 壳 src=[]。同一槽位的兄弟（sub-header/Group）
//   有归属、@echarts 图表节点反被臆造成语义壳 → dedupeByWholeRegionShell 双输：
//   真图表壳（ec 小）被当碎片杀掉（产物缺 ChartSection），假壳（ec 大）被判超集存活。
// 治本：丢弃/保留裁决**之前**，先拿 figma 节点树把壳锚定回真实节点（事实源），
//   锚定成功 → 补 sourceNodeIds 救回；锚定失败 → 维持原判别力逻辑。
// ──────────────────────────────────────────────
describe('anchorPhantomSections（臆造壳锚定真实 Figma 节点）', () => {
  // 最小化但结构忠实的 traffic figma 树（.checkpoint/figma.json 节选）
  const trafficFigma: any = {
    id: '2:9778', name: 'cp-流量监测', type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 425, height: 807 },
    children: [
      { id: '88:33', name: 'slot-当日总流量', type: 'FRAME', children: [
        { id: '88:32', name: 'sub-header', type: 'FRAME', absoluteBoundingBox: { x: 23, y: 158.7, width: 379, height: 38 } },
        { id: '2:3660', name: 'Group 2136636802', type: 'GROUP', absoluteBoundingBox: { x: 23, y: 196, width: 379, height: 80 } },
        { id: '2:7459', name: '@echarts/bar', type: 'GROUP', absoluteBoundingBox: { x: 33.8, y: 287, width: 379, height: 131 } },
        { id: '2:7628', name: '@echarts/bar', type: 'GROUP', absoluteBoundingBox: { x: 33.8, y: 428, width: 379, height: 131 } },
      ] },
      { id: '2:3438', name: 'slot-车型分布', type: 'FRAME', children: [
        { id: '2:3446', name: 'donut-1', type: 'GROUP', children: [
          { id: '246:30', name: '@echarts', type: 'FRAME', absoluteBoundingBox: { x: 102.5, y: 650, width: 52.1, height: 52.5 } },
        ] },
      ] },
      { id: '83:30', name: 'slot-流量预测', type: 'FRAME', children: [
        { id: '2:3565', name: 'sub-header', type: 'GROUP', absoluteBoundingBox: { x: 23, y: 730, width: 379, height: 30 } },
        { id: '2:3604', name: '@echarts/line', type: 'GROUP', absoluteBoundingBox: { x: 43.8, y: 764.3, width: 363, height: 140.7 } },
      ] },
    ],
  };

  // 真实 effectiveSections（analysis.json 原样，3 个臆造壳 src=[]）
  const trafficSections: any[] = [
    { id: '2:3550', type: 'header', title: 'header-', elementCount: 2, sourceNodeIds: ['2:3550', '2:3557', '2:3558'] },
    { id: '88:32', title: 'sub-header', elementCount: 2, sourceNodeIds: ['88:32', '2:3545', '2:3559'] },
    { id: '2:3660', title: 'Group 2136636802', elementCount: 2, sourceNodeIds: ['2:3660', '2:3680', '2:3683'] },
    { id: '2:3438', title: 'slot-车型分布', elementCount: 2, sourceNodeIds: ['2:3438', '2:3446', '2:3496'] },
    { id: '2:3565', title: 'sub-header', elementCount: 3, sourceNodeIds: ['2:3565', '2:3571', '2:3566'] },
    { id: 'tunnel-hourly-chart', type: 'chart', title: '江阴靖江长江隧道', elementCount: 2, sourceNodeIds: [], complexityReasons: { charts: 1 } },
    { id: 'bridge-hourly-chart', type: 'chart', title: '江阴大桥', elementCount: 2, sourceNodeIds: [], complexityReasons: { charts: 1 } },
    { id: 'flow-prediction', title: '流量预测', elementCount: 11, sourceNodeIds: [], complexityReasons: { charts: 6 } },
  ];

  it('标题匹配：flow-prediction(title=流量预测) 锚定到 slot-流量预测 下的 @echarts/line 2:3604', () => {
    const r = anchorPhantomSections(trafficSections, trafficFigma);
    const flow = r.find((s) => s.id === 'flow-prediction');
    expect(flow.sourceNodeIds).toEqual(['2:3604']);
  });

  it('顺序对齐：两个 chart 壳按数组序锚定到按 y 排序的未覆盖 @echarts/bar（tunnel→2:7459, bridge→2:7628）', () => {
    const r = anchorPhantomSections(trafficSections, trafficFigma);
    expect(r.find((s) => s.id === 'tunnel-hourly-chart').sourceNodeIds).toEqual(['2:7459']);
    expect(r.find((s) => s.id === 'bridge-hourly-chart').sourceNodeIds).toEqual(['2:7628']);
  });

  it('锚定后无 type 壳按节点事实补 type=chart（语义识别来自事实源，非关键词）', () => {
    const r = anchorPhantomSections(trafficSections, trafficFigma);
    const flow = r.find((s) => s.id === 'flow-prediction');
    expect(flow.type).toBe('chart');
  });

  it('已被有归属 section 子树覆盖的 @echarts 节点不再参与锚定（246:30 在 2:3438 子树内）', () => {
    const r = anchorPhantomSections(trafficSections, trafficFigma);
    const allSrc = r.flatMap((s) => s.sourceNodeIds || []);
    expect(allSrc).not.toContain('246:30');
  });

  it('锚定 + dedupe 端到端：8 个 section 全保留（真图表不再被碎片分支误杀）', () => {
    const anchored = anchorPhantomSections(trafficSections, trafficFigma);
    const r = dedupeDuplicateSections(anchored);
    expect(r).toHaveLength(8);
    expect(r.map((s) => s.id)).toContain('tunnel-hourly-chart');
    expect(r.map((s) => s.id)).toContain('bridge-hourly-chart');
  });

  it('无 figmaRoot 时原样返回（向后兼容：无 figma 数据的调用方零影响）', () => {
    const r = anchorPhantomSections(trafficSections, null);
    expect(r).toBe(trafficSections);
  });

  it('不可锚定壳维持 src=[]（dedupe 原判别力逻辑兜底，485d724d/a612a9f7 形态不回归）', () => {
    // figma 树中所有 @echarts 均已被覆盖 → 壳锚定失败
    const figmaAllCovered: any = {
      id: '1:1', name: 'root', type: 'FRAME', children: [
        { id: '9:9', name: 'slot-图表', type: 'FRAME', children: [
          { id: '9:10', name: '@echarts/bar', type: 'GROUP', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 } },
        ] },
      ],
    };
    const sections: any[] = [
      { id: '9:9', title: 'slot-图表', elementCount: 3, sourceNodeIds: ['9:9'] },
      { id: 'some-shell', type: 'chart', title: '图表', elementCount: 2, sourceNodeIds: [] },
    ];
    const r = anchorPhantomSections(sections, figmaAllCovered);
    expect(r.find((s) => s.id === 'some-shell').sourceNodeIds).toEqual([]);
  });

  it('幂等：锚定结果再次调用零变化', () => {
    const once = anchorPhantomSections(trafficSections, trafficFigma);
    const twice = anchorPhantomSections(once, trafficFigma);
    expect(twice.find((s) => s.id === 'tunnel-hourly-chart').sourceNodeIds).toEqual(['2:7459']);
    expect(twice).toHaveLength(once.length);
  });

  it('非图表壳且无标题匹配 → 不锚定（header/stats 壳不抢图表节点）', () => {
    const sections: any[] = [
      { id: '2:3565', title: 'sub-header', elementCount: 3, sourceNodeIds: ['2:3565'] },
      { id: 'header-stats', type: 'stats', title: '统计指标区', elementCount: 7, sourceNodeIds: [] },
    ];
    const r = anchorPhantomSections(sections, trafficFigma);
    expect(r.find((s) => s.id === 'header-stats').sourceNodeIds).toEqual([]);
  });
});

// ──────────────────────────────────────────────
// 🛡️ 治本（2026-09-14 · c-traffic-monitor-21e2afd6 实锤）：effectiveSections 顺序
//   必须来自 Figma absoluteBoundingBox（唯一事实源），而不是 vision 输出数组序。
//   事故：vision 数组序把「车型分布」排在第 4，两张柱状图由 anchorPhantomSections
//   追加到尾部 → 产物里车型分布在两张图之上，与设计稿上下颠倒。
// ──────────────────────────────────────────────
describe('sortSectionsByFigmaY（按 Figma 视觉坐标重排 section）', () => {
  // 真实 bbox（.mc-gen/cache/figma-node-data.json 原值，节点 2:9778 子树）
  const figma: any = {
    id: '2:9778', name: 'cp-流量监测', type: 'FRAME',
    absoluteBoundingBox: { x: 10, y: 109, width: 425.83, height: 807 },
    children: [
      { id: '2:3550', name: 'header-', type: 'GROUP', absoluteBoundingBox: { x: 35.83, y: 119.14, width: 357, height: 32.54 } },
      { id: '88:32', name: 'sub-header', type: 'FRAME', absoluteBoundingBox: { x: 35.83, y: 158.69, width: 357, height: 30.42 } },
      { id: '2:3660', name: 'Group 2136636802', type: 'GROUP', absoluteBoundingBox: { x: 10, y: 196, width: 405.83, height: 91.44 } },
      { id: '2:7459', name: '@echarts/bar', type: 'GROUP', absoluteBoundingBox: { x: 33.83, y: 287, width: 379, height: 131 } },
      { id: '2:7628', name: '@echarts/bar', type: 'GROUP', absoluteBoundingBox: { x: 33.83, y: 428, width: 379, height: 131 } },
      { id: '2:3438', name: 'slot-车型分布', type: 'GROUP', absoluteBoundingBox: { x: 32.83, y: 573, width: 379, height: 142 } },
      { id: '2:3565', name: 'sub-header', type: 'GROUP', absoluteBoundingBox: { x: 35.83, y: 730, width: 379, height: 24.34 } },
      { id: '2:3604', name: '@echarts/line', type: 'GROUP', absoluteBoundingBox: { x: 43.83, y: 764.34, width: 363, height: 140.66 } },
      { id: '2:3545', name: '24小时', type: 'TEXT', absoluteBoundingBox: { x: 300, y: 160, width: 60, height: 30 } },
      { id: '2:3559', name: '当日总流量', type: 'TEXT', absoluteBoundingBox: { x: 40, y: 160, width: 90, height: 24 } },
    ],
  }

  // analysis.json 的 effectiveSections 原样（锚定完成后的真实形态，含 sourceNodeIds）
  const effectiveSections: any[] = [
    { id: '2:3550', type: 'header', title: 'header-', sourceNodeIds: ['2:3550', '2:3557', '2:3558'] },
    { id: '88:32', title: 'sub-header', sourceNodeIds: ['88:32', '2:3545', '2:3559'] },
    { id: '2:3660', title: 'Group 2136636802', sourceNodeIds: ['2:3660', '2:3680', '2:3683'] },
    { id: '2:3438', title: 'slot-车型分布', sourceNodeIds: ['2:3438', '2:3446', '2:3496'] },
    { id: '2:3565', title: 'sub-header', sourceNodeIds: ['2:3565', '2:3571', '2:3566'] },
    { id: 'slot-hourly-chart-jinjiang', type: 'chart', title: '江阴靖江长江隧道', sourceNodeIds: ['2:7459'] },
    { id: 'slot-hourly-chart-bridge', type: 'chart', title: '江阴大桥', sourceNodeIds: ['2:7628'] },
    { id: 'slot-流量预测', type: 'chart', title: '流量预测', sourceNodeIds: ['2:3604'] },
  ]

  it('真机形态：还原设计稿上下顺序（车型分布回到两张柱状图之后）', () => {
    const ordered = sortSectionsByFigmaY(effectiveSections, figma)
    expect(ordered.map((s) => s.id)).toEqual([
      '2:3550',                    // 顶部标题区      y=119.14
      '88:32',                     // 当日总流量      y=158.69
      '2:3660',                    // 总流量统计      y=196
      'slot-hourly-chart-jinjiang', // 隧道柱状图     y=287
      'slot-hourly-chart-bridge',   // 大桥柱状图     y=428
      '2:3438',                    // 车型分布        y=573
      '2:3565',                    // 流量预测标题    y=730
      'slot-流量预测',              // 预测折线图      y=764.34
    ])
  })

  it('不改入参数组（纯函数），且幂等', () => {
    const before = effectiveSections.map((s) => s.id)
    const once = sortSectionsByFigmaY(effectiveSections, figma)
    const twice = sortSectionsByFigmaY(once, figma)
    expect(effectiveSections.map((s) => s.id)).toEqual(before)
    expect(twice.map((s) => s.id)).toEqual(once.map((s) => s.id))
  })

  it('几何缺失者保持原位，不参与比较也不被挤走', () => {
    const sections: any[] = [
      { id: 'a', sourceNodeIds: ['2:3438'] }, // y=573
      { id: 'unknown', sourceNodeIds: [] },   // 无几何 → 原位
      { id: 'b', sourceNodeIds: ['2:3660'] }, // y=196
    ]
    const ordered = sortSectionsByFigmaY(sections, figma)
    // b(196) 与 a(573) 互换，但 unknown 仍停在第 2 个槽位
    expect(ordered.map((s) => s.id)).toEqual(['b', 'unknown', 'a'])
  })

  it('可解析者 < 2 或无 figmaRoot → 原样返回同一引用（零影响旧调用方）', () => {
    const one: any[] = [{ id: 'only', sourceNodeIds: ['2:3660'] }]
    expect(sortSectionsByFigmaY(one, figma)).toBe(one)

    const many: any[] = [
      { id: 'x', sourceNodeIds: ['2:3660'] },
      { id: 'y', sourceNodeIds: ['2:3438'] },
    ]
    expect(sortSectionsByFigmaY(many, null)).toBe(many)
    expect(sortSectionsByFigmaY(many, { id: 'other', children: [] })).toBe(many)
  })

  it('figmaSectionBox 取 sourceNodeIds 中最上（最小 y）节点，与排列顺序无关', () => {
    const index = indexFigmaNodes(figma)
    // 逆序给出：子文本在前、section 根在后 → 仍须取根盒
    const box = figmaSectionBox({ sourceNodeIds: ['2:3559', '88:32', '2:3545'] }, index)
    expect(box?.y).toBe(158.69)
    expect(box?.height).toBe(30.42)
    expect(figmaSectionBox({ sourceNodeIds: [] }, index)).toBeNull()
  })
});

