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
  buildChildrenMap,
  collectSubtreeTexts,
  normalizeFigmaTextName,
  getFigmaBox,
  areBoxesSideBySide,
  figmaSectionBox,
  dropHallucinatedSections,
  applyHallucinationDrop,
  stripFabricatedSourceIds,
  uniqueSectionIds,
  deriveSectionsFromFigmaTree,
  buildSectionStyleFacts,
  semanticClassKeywords,
  headerIsChromeOnly,
  clusterItemsByColumnX,
  reorganizeCenteredChartLayout,
  splitTitleValueByStyle,
} from './section-tree.js'

describe('底层 Figma 事实索引', () => {
  test('保留原始节点并提供稳定父子邻接与文本归一化', () => {
    const root: any = {
      id: 'root', name: 'root', type: 'FRAME', children: [
        {
          id: 'section', name: 'section', type: 'FRAME', children: [
            {
              id: 'title', name: 't-设备监测', type: 'TEXT', characters: '设备监测',
              style: { fontSize: 12, fontWeight: 400 },
              absoluteBoundingBox: { x: 10, y: 20, width: 40, height: 12 },
            },
            {
              id: 'value', name: 'd-28', type: 'TEXT', characters: '28',
              style: { fontSize: 24, fontWeight: 700 },
              absoluteBoundingBox: { x: 60, y: 20, width: 20, height: 12 },
            },
          ],
        },
      ],
    }
    const index = indexFigmaNodes(root)
    expect(index.get('section')?.rawNode).toBe(root.children[0])
    expect(buildChildrenMap(index).get('section')).toEqual(['title', 'value'])
    expect(normalizeFigmaTextName('t-设备监测')).toBe('设备监测')
    // 🔴 命名无关：只产出 文案 + 样式 + 几何 三类真值，**无 isTitle**
    expect(collectSubtreeTexts('section', index)).toEqual([
      { text: '设备监测', x: 10, y: 20, fontSize: 12, fontWeight: 400 },
      { text: '28', x: 60, y: 20, fontSize: 24, fontWeight: 700 },
    ])
    const items = collectSubtreeTexts('section', index)
    expect(items.every((i: any) => !('isTitle' in i))).toBe(true)
    // 角色由**样式**判定（字号大者 = 数值），与图层名无关
    expect(splitTitleValueByStyle(items)).toEqual({ title: '设备监测', value: '28', by: 'style' })
  })

  test('无效索引或节点 id 时 fail-open 返回空事实', () => {
    expect(buildChildrenMap(null)).toEqual(new Map())
    expect(collectSubtreeTexts('missing', new Map())).toEqual([])
    expect(normalizeFigmaTextName(null)).toBe('')
  })

  test('统一几何 primitive 同时接受原始节点与索引记录', () => {
    const raw = { absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 } }
    const indexed = { bbox: { x: 105, y: 0, width: 100, height: 40 } }
    expect(getFigmaBox(raw)).toEqual({ x: 0, y: 0, w: 100, h: 40 })
    expect(getFigmaBox(indexed)).toEqual({ x: 105, y: 0, w: 100, h: 40 })
    expect(areBoxesSideBySide(raw, indexed)).toBe(true)
    expect(areBoxesSideBySide(raw, { absoluteBoundingBox: { x: 20, y: 0, width: 100, height: 40 } })).toBe(false)
  })
})

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
// 🛡️ 治本（2026-09-15 · c-device-monitor-228b63d5 实锤）：清洗「编造 id 空间」污染
//
// 背景：Vision 偶发编造整套 Figma 格式 id（`8439:8500` 设备类型网格区 / `8788:8439` 切换控制区 /
//   `3550:194` 江阴靖江隧道小时流量），collectSourceNodeIds 只认 `数字:数字` 把假 id 也塞进
//   sourceNodeIds → 假 section 伪装「有归属壳」→ anchor 的 isShell 判据恒 false、dedupe 的
//   「无归属壳判别力」失效：真 chart 壳不再锚定、假 grid 壳被拆成独立 CardGrid。
// 治本：anchor 之前清掉「Figma 格式但真值树不存在」的假 id，让编造 section 回到无归属壳状态，
//   由既有 anchor（锚定真 chart）+ dedupe（剔假壳）正确接管。语义 id（slot-xxx）原样保留。
// ──────────────────────────────────────────────
describe('stripFabricatedSourceIds（编造 id 空间清洗）', () => {
  const deviceFigma: any = {
    id: '2:8417', name: 'cp-设备监测', type: 'FRAME',
    children: [
      { id: '2:8419', name: 'header', type: 'FRAME', children: [] },
      { id: '89:38', name: 'switch', type: 'FRAME', children: [] },
      { id: '89:37', name: '@antd/tab', type: 'FRAME', children: [] },
    ],
  };

  it('清掉 Figma 格式但真值树不存在的假 id，保留真实 id', () => {
    const sections: any[] = [
      { id: '2:8419', type: 'header', sourceNodeIds: ['2:8419'] },
      { id: '89:37', type: 'tabs', sourceNodeIds: ['89:37', '89:39'] },
      { id: '8439:8500', type: 'grid', sourceNodeIds: ['8439:8500'] },
      { id: '8788:8439', type: 'tabs', sourceNodeIds: ['8788:8439', '8788:8789', '8807:8808'] },
    ];
    const r = stripFabricatedSourceIds(sections, deviceFigma);
    expect(r[0].sourceNodeIds).toEqual(['2:8419']);
    expect(r[1].sourceNodeIds).toEqual(['89:37']); // 89:39 假 → 清
    expect(r[2].sourceNodeIds).toEqual([]); // 8439:8500 全假 → 空
    expect(r[3].sourceNodeIds).toEqual([]); // 8788:* 全假 → 空
  });

  it('语义 id（slot-xxx）原样保留，不参与真假判定', () => {
    const fig: any = {
      id: '2:8417', name: 'cp', type: 'FRAME',
      children: [{ id: '2:3438', name: 'slot-车型分布', type: 'FRAME', children: [] }],
    };
    const sections: any[] = [
      { id: 'slot-车型分布', type: null, sourceNodeIds: ['slot-车型分布', '2:3438'] },
    ];
    const r = stripFabricatedSourceIds(sections, fig);
    // 语义 id slot-车型分布 非 Figma 格式 → 原样保留；2:3438 真实存在 → 保留
    expect(r[0].sourceNodeIds).toEqual(['slot-车型分布', '2:3438']);
  });

  it('递归处理容器 children', () => {
    const container: any = {
      id: 'c1', isLayoutContainer: true,
      children: [
        { id: '8439:8500', type: 'grid', sourceNodeIds: ['8439:8500'] },
        { id: '89:37', type: 'tabs', sourceNodeIds: ['89:37'] },
      ],
    };
    const r = stripFabricatedSourceIds([container], deviceFigma);
    expect(r[0].children[0].sourceNodeIds).toEqual([]);
    expect(r[0].children[1].sourceNodeIds).toEqual(['89:37']);
  });

  it('无 figmaRoot / 空索引 → 原样返回同一引用（零回归）', () => {
    const sections: any[] = [{ id: '8439:8500', sourceNodeIds: ['8439:8500'] }];
    expect(stripFabricatedSourceIds(sections, null)).toBe(sections);
    expect(stripFabricatedSourceIds(sections, { fileKey: 'k' })).toBe(sections);
  });

  it('幂等：清洗结果再清洗零变化', () => {
    const sections: any[] = [
      { id: '8439:8500', type: 'grid', sourceNodeIds: ['8439:8500'] },
      { id: '89:37', type: 'tabs', sourceNodeIds: ['89:37'] },
    ];
    const once = stripFabricatedSourceIds(sections, deviceFigma);
    const twice = stripFabricatedSourceIds(once, deviceFigma);
    expect(twice).toEqual(once);
  });

  it('端到端·228b63d5：假 grid/tabs 壳清洗后，dedupe 剔假壳、anchor 锚定真 tabs', () => {
    // 真实 effectiveSections（节选）：header/switch/tabs 真实有归属，
    // 假 8788:8439(tabs) / 8439:8500(grid) sourceNodeIds 全是编造 id。
    const real = [
      { id: '2:8419', type: 'header', title: 'header', elementCount: 6, sourceNodeIds: ['2:8419', '2:8427', '2:8428', '2:8431', '2:8434', '2:8426', '2:8856'] },
      { id: '89:38', title: 'switch', elementCount: 2, sourceNodeIds: ['89:38', '2:8787', '2:8806'] },
      { id: '89:37', type: 'tabs', title: '@antd/tab', elementCount: 2, sourceNodeIds: ['89:37', '89:39', '2:8437'] },
      { id: '8788:8439', type: 'tabs', title: '切换控制区', elementCount: 2, sourceNodeIds: ['8788:8439', '8788:8789', '8807:8808'] },
      { id: '8439:8500', type: 'grid', title: '设备类型网格区', elementCount: 0, sourceNodeIds: ['8439:8500'] },
    ];
    const stripped = stripFabricatedSourceIds(real, {
      id: '2:8417', name: 'cp-设备监测', type: 'FRAME',
      children: [
        { id: '2:8419', name: 'header', type: 'FRAME', children: [] },
        { id: '2:8427', name: 'x', type: 'FRAME', children: [] },
        { id: '2:8428', name: 'x', type: 'FRAME', children: [] },
        { id: '2:8431', name: 'x', type: 'FRAME', children: [] },
        { id: '2:8434', name: 'x', type: 'FRAME', children: [] },
        { id: '2:8426', name: 'x', type: 'FRAME', children: [] },
        { id: '2:8856', name: 'x', type: 'FRAME', children: [] },
        { id: '89:38', name: 'switch', type: 'FRAME', children: [] },
        { id: '2:8787', name: 'x', type: 'FRAME', children: [] },
        { id: '2:8806', name: 'x', type: 'FRAME', children: [] },
        { id: '89:37', name: '@antd/tab', type: 'FRAME', children: [] },
        { id: '89:39', name: 'x', type: 'FRAME', children: [] },
        { id: '2:8437', name: 'x', type: 'FRAME', children: [] },
      ],
    });
    // 清洗后：假 id 清空 → 8788:8439 / 8439:8500 变无归属壳
    const gridShell = stripped.find((s) => s.id === '8439:8500');
    const tabsShell = stripped.find((s) => s.id === '8788:8439');
    expect(gridShell.sourceNodeIds).toEqual([]);
    expect(tabsShell.sourceNodeIds).toEqual([]);
    // 真实 section 归属不变
    expect(stripped.find((s) => s.id === '89:37').sourceNodeIds).toEqual(['89:37', '89:39', '2:8437']);
    // dedupe 后：假 tabs/grid 壳（无归属）被判别力剔除，回到 3 个真实 section
    const r = dedupeDuplicateSections(stripped);
    expect(r.map((s) => s.id)).toEqual(['2:8419', '89:38', '89:37']);
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

/**
 * dropHallucinatedSections（2026-09-15 · mc-max-1789446564243-f64ecbed 实锤）
 * 治「Vision 凭空产出设计里不存在的 section → planner 多生成一个 .vue → 内容重复 + 多占一行挤走图表」。
 * 判据刻意取窄：只剔「自身无任何节点身份（id 非 Figma 形态 且无 figmaNodeId/figmaNode/sourceNodeIds）
 * 却引用了真值不存在的 Figma 格式 id」的伪容器 —— 162 份真机 vision 缓存实测命中 1 条真阳性、零误伤。
 */
describe('dropHallucinatedSections 幻觉 section 剔除', () => {
  // 真机 Figma 真值（简化）：root → slot-con(89:41) → [sub-t(89:42), @echarts/line(2:7898)]
  const realFigma: any = {
    fileKey: 'k', nodeId: '2:7879',
    document: {
      id: '2:7879', name: 'cp-环境监测', type: 'FRAME',
      children: [
        { id: '89:41', name: 'slot-con', type: 'FRAME', children: [
          { id: '89:42', name: 'sub-t', type: 'FRAME', children: [
            { id: '2:7889', name: 'tabs-list', type: 'FRAME', children: [] },
            { id: '89:43', name: 'tabs-icon', type: 'FRAME', children: [] },
            { id: '2:7949', name: 'num', type: 'FRAME', children: [] },
          ] },
          { id: '2:7898', name: '@echarts/line', type: 'FRAME', children: [] },
        ] },
      ],
    },
  }

  it('真机形态：无节点身份却引用不存在的 89:37 → 整节剔除', () => {
    const sections: any[] = [
      { id: '89:42', name: 'sub-t', role: 'inline-row', figmaNodeId: '89:42', body: { children: [
        { id: '89:42-m1', figmaNode: '2:7889' },
        { id: '89:42-m3', figmaNode: '2:7949' },
      ] } },
      { id: 'chart-section', name: '趋势图表', role: '常驻', body: { children: [
        { id: 'chart-container', role: 'chart', type: 'area-line' },
      ] } },
      { id: 'badge-indicator', name: '数值角标', role: '常驻', slotCandidate: 'header-right',
        body: { children: [{ id: '89:37', role: 'badge', value: '3' }] } },
    ]
    const out = dropHallucinatedSections(sections, realFigma)
    expect(out.map((s) => s.id)).toEqual(['89:42', 'chart-section'])
  })

  it('防误伤：自身 id 就是 Figma 形态（编造整套 id 空间的真 section）→ 保留', () => {
    const sections: any[] = [
      { id: '8000:8010', name: '统计指标行', role: '常驻',
        body: { children: [{ id: '8000:8011', name: '次数统计' }, { id: '8000:8012', text: '次' }] } },
      { id: '8100:8110', name: '图表区域', role: '常驻',
        body: { children: [{ id: '8100:8120', role: 'chart', type: 'area' }] } },
    ]
    expect(dropHallucinatedSections(sections, realFigma)).toBe(sections)
  })

  it('防误伤：显式声明 figmaNodeId（无论真假）→ 保留', () => {
    const sections: any[] = [
      { id: 'badge-indicator', name: '数值角标', figmaNodeId: '89:37',
        body: { children: [{ id: '89:37', role: 'badge' }] } },
    ]
    expect(dropHallucinatedSections(sections, realFigma)).toBe(sections)
  })

  it('防误伤：子元素引用真实节点 → 保留（含 sourceNodeIds 形态）', () => {
    const sections: any[] = [
      { id: 'shell-a', name: '语义壳', sourceNodeIds: ['89:42'], body: { children: [] } },
      { id: 'shell-b', name: '无引用壳', body: { children: [{ id: '2:7949', role: 'item' }] } },
    ]
    expect(dropHallucinatedSections(sections, realFigma)).toBe(sections)
  })

  it('容器 children 递归剔除，剔后容器仍保留', () => {
    const sections: any[] = [
      { id: '89:41', name: 'slot-con', layout: 'vertical', figmaNodeId: '89:41', children: [
        { id: '89:42', name: 'sub-t', figmaNodeId: '89:42', body: { children: [] } },
        { id: 'badge-indicator', name: '数值角标', body: { children: [{ id: '89:37' }] } },
      ] },
    ]
    const out = dropHallucinatedSections(sections, realFigma)
    expect(out).toHaveLength(1)
    expect(out[0].children.map((c: any) => c.id)).toEqual(['89:42'])
  })

  it('无 figmaRoot / 空索引 → 原样返回同一引用（零回归）', () => {
    const sections: any[] = [{ id: 'badge-indicator', body: { children: [{ id: '89:37' }] } }]
    expect(dropHallucinatedSections(sections, null)).toBe(sections)
    expect(dropHallucinatedSections(sections, { fileKey: 'k' })).toBe(sections)
  })

  it('幂等：剔除结果再调用零变化', () => {
    const sections: any[] = [
      { id: '89:42', figmaNodeId: '89:42', body: { children: [] } },
      { id: 'badge-indicator', body: { children: [{ id: '89:37' }] } },
    ]
    const once = dropHallucinatedSections(sections, realFigma)
    expect(dropHallucinatedSections(once, realFigma)).toEqual(once)
  })
});

/**
 * applyHallucinationDrop —— 全链路共用的形态适配器（2026-09-15）。
 * 关键约束：**就地写回**（`_postProcessAnalysis` 之后调用方继续用同一个 parsed 引用；
 * 若只返回新对象不写回，全新路径的剔除会静默失效 —— 实现过程中真实踩过）。
 */
describe('applyHallucinationDrop 形态适配 + 就地写回', () => {
  const figma: any = {
    document: {
      id: 'root', name: 'root', type: 'FRAME',
      children: [{ id: '89:42', name: 'sub-t', type: 'FRAME', children: [] }],
    },
  }
  const ghost = { id: 'badge-indicator', name: '数值角标', body: { children: [{ id: '89:37' }] } }
  const real = { id: '89:42', figmaNodeId: '89:42', body: { children: [] } }

  it('扁平形态（layout.sections）→ 就地剔除，返回同一引用', () => {
    const parsed: any = { layout: { sections: [real, ghost] } }
    const out = applyHallucinationDrop(parsed, figma)
    expect(out).toBe(parsed)
    expect(parsed.layout.sections.map((s: any) => s.id)).toEqual(['89:42'])
  })

  it('包装态（layoutStructure.layout.sections）→ 就地剔除', () => {
    const parsed: any = { layoutStructure: { layout: { sections: [real, ghost] } } }
    applyHallucinationDrop(parsed, figma)
    expect(parsed.layoutStructure.layout.sections.map((s: any) => s.id)).toEqual(['89:42'])
  })

  it('layoutStructure.sections（无 layout 层）→ 就地剔除', () => {
    const parsed: any = { layoutStructure: { sections: [real, ghost] } }
    applyHallucinationDrop(parsed, figma)
    expect(parsed.layoutStructure.sections.map((s: any) => s.id)).toEqual(['89:42'])
  })

  it('混合态：两处都有 sections → 两处都剔除（缓存形态常如此）', () => {
    const parsed: any = {
      layout: { sections: [real, ghost] },
      layoutStructure: { layout: { sections: [real, ghost] } },
    }
    applyHallucinationDrop(parsed, figma)
    expect(parsed.layout.sections).toHaveLength(1)
    expect(parsed.layoutStructure.layout.sections).toHaveLength(1)
  })

  it('无 figmaData / 空对象 → 零改动且返回同一引用', () => {
    const parsed: any = { layout: { sections: [real, ghost] } }
    expect(applyHallucinationDrop(parsed, null)).toBe(parsed)
    expect(parsed.layout.sections).toHaveLength(2)
    expect(applyHallucinationDrop(null, figma)).toBeNull()
  })

  it('幂等：重复调用结果不变', () => {
    const parsed: any = { layout: { sections: [real, ghost] } }
    applyHallucinationDrop(parsed, figma)
    const snapshot = JSON.stringify(parsed)
    applyHallucinationDrop(parsed, figma)
    expect(JSON.stringify(parsed)).toBe(snapshot)
  })
});


describe('uniqueSectionIds（E1 治本 · 重复 id 唯一化，2026-09-16 c-traffic-monitor-bc0c25aa）', () => {
  it('3 个同 id 图表 section → 加 -2/-3 后缀，保留第一个原样', () => {
    const sections = [
      { id: '426:807', type: 'chart', title: '江阴靖江长江隧道', sourceNodeIds: ['2:7459'] },
      { id: '426:807', type: 'chart', title: '江阴大桥', sourceNodeIds: ['2:7628'] },
      { id: '426:807', type: 'chart', title: '流量预测', sourceNodeIds: ['2:3604'] },
    ]
    const out = uniqueSectionIds(sections)
    expect(out.map((s) => s.id)).toEqual(['426:807', '426:807-2', '426:807-3'])
    // sourceNodeIds 不变（下游对齐事实源不受影响）
    expect(out.map((s) => s.sourceNodeIds)).toEqual([['2:7459'], ['2:7628'], ['2:3604']])
  })

  it('无重复 id → 返回原引用（不拷贝）', () => {
    const sections = [{ id: 'a' }, { id: 'b' }]
    expect(uniqueSectionIds(sections)).toBe(sections)
  })

  it('递归处理 children 树', () => {
    const sections = [
      { id: 'x', children: [{ id: 'dup' }, { id: 'dup' }] },
      { id: 'y' },
    ]
    const out = uniqueSectionIds(sections)
    expect(out[0].children.map((c) => c.id)).toEqual(['dup', 'dup-2'])
  })

  it('幂等：再跑一次 id 不变', () => {
    const sections = [
      { id: '426:807', title: 'A' },
      { id: '426:807', title: 'B' },
      { id: '426:807', title: 'C' },
    ]
    const once = uniqueSectionIds(sections)
    const twice = uniqueSectionIds(once)
    expect(twice.map((s) => s.id)).toEqual(once.map((s) => s.id))
  })
})

describe('deriveSectionsFromFigmaTree（E1 治本 · Figma 节点树确定性推导 section）', () => {
  const box = (x, y, w, h) => ({ x, y, width: w, height: h })

  const traffic5 = {
    document: {
      id: 'root', name: 'cp-流量监测', type: 'FRAME',
      absoluteBoundingBox: box(0, 109, 425, 807),
      children: [
        { id: 'bg1', name: 'bg-[m]', type: 'BOOLEAN_OPERATION', absoluteBoundingBox: box(0, 109, 420, 807) },
        { id: 'h1', name: 'header-', type: 'GROUP', absoluteBoundingBox: box(0, 119, 380, 32.5), children: [] },
        { id: 's1', name: 'slot-当日总流量', type: 'FRAME', absoluteBoundingBox: box(0, 158.7, 425, 556.3), children: [] },
        { id: 's2', name: 'slot-车型分布', type: 'GROUP', absoluteBoundingBox: box(0, 573, 387, 142), children: [] },
        { id: 's3', name: 'slot-流量预测', type: 'FRAME', absoluteBoundingBox: box(0, 730, 378, 174), children: [] },
      ],
    },
  }

  it('5 子节点：4 section + 1 背景，header 归 header、slot 去前缀', () => {
    const r = deriveSectionsFromFigmaTree(traffic5)
    expect(r).not.toBeNull()
    expect(r.sections).toHaveLength(4)
    expect(r.backgrounds).toHaveLength(1)
    expect(r.backgrounds[0].name).toBe('bg-[m]')
    // header 归 header
    expect(r.sections[0].type).toBe('header')
    // slot 去前缀
    expect(r.sections[1].name).toBe('当日总流量')
    expect(r.sections[2].name).toBe('车型分布')
  })

  it('高度确定性透传：section 带 absoluteBoundingBox.height', () => {
    const r = deriveSectionsFromFigmaTree(traffic5)
    const s1 = r.sections.find((s) => s.id === 's1')
    expect(s1.absoluteBoundingBox.height).toBe(556.3)
    expect(s1.styles.figmaHeightPx).toBe(556.3)
  })

  it('按 y 升序排序（视觉从上到下）', () => {
    const r = deriveSectionsFromFigmaTree(traffic5)
    const ys = r.sections.map((s) => s.absoluteBoundingBox.y)
    expect(ys).toEqual([119, 158.7, 573, 730])
  })

  it('2 子节点（header + slot-con，无背景）', () => {
    const two = {
      document: {
        id: 'root', name: 'cp-环境监测', type: 'FRAME',
        children: [
          { id: 'h', name: 'header', type: 'GROUP', absoluteBoundingBox: box(0, 875, 380, 28) },
          { id: 'c', name: 'slot-con', type: 'FRAME', absoluteBoundingBox: box(0, 898, 420, 145) },
        ],
      },
    }
    const r = deriveSectionsFromFigmaTree(two)
    expect(r.sections).toHaveLength(2)
    expect(r.backgrounds).toHaveLength(0)
    expect(r.sections[0].type).toBe('header')
  })

  it('无 FRAME 根 / 空输入 → null', () => {
    expect(deriveSectionsFromFigmaTree(null)).toBeNull()
    expect(deriveSectionsFromFigmaTree({})).toBeNull()
    expect(deriveSectionsFromFigmaTree({ document: { type: 'TEXT', name: 'x' } })).toBeNull()
  })

  // 🛡️ 治本（2026-09-29 · mc-max-1790693732608-b6e018d6 实锤）：
  //   findRootFrame 旧口径「深度优先第一个有 children 的 FRAME」在
  //   「GROUP 业务根 + FRAME header 子」树形下会把头部条当根 ⇒ 顶层 sections
  //   变成 header 条内部结构、header 事实丢失、slot-con 图表区被踢出树。
  //   新口径：doc 自身是容器且有 children ⇒ doc 即根（GROUP 也算）。
  it('GROUP 业务根 + FRAME header 子：根不选错，header/slot-con 两段齐全（b6e018d6 树形）', () => {
    const groupRoot = {
      document: {
        id: '1:2077', name: 'cp-环保减污', type: 'GROUP',
        absoluteBoundingBox: box(1440, 840, 460, 225),
        children: [
          { id: '17:57', name: 'bg', type: 'RECTANGLE', absoluteBoundingBox: box(1440, 840, 460, 225) },
          {
            id: '1:2078', name: 'header', type: 'FRAME',
            absoluteBoundingBox: box(1440, 840, 460, 34),
            children: [
              {
                id: '1:2100', name: 'slot-tabs', type: 'GROUP',
                absoluteBoundingBox: box(1794, 846, 91, 21),
                children: [
                  { id: '1:2102', name: '激活', type: 'GROUP', absoluteBoundingBox: box(1794, 846, 46, 21), children: [] },
                  { id: '1:2105', name: '默认', type: 'GROUP', absoluteBoundingBox: box(1839, 846, 46, 21), children: [] },
                ],
              },
            ],
          },
          {
            id: '17:59', name: 'slot-con', type: 'FRAME',
            absoluteBoundingBox: box(1452, 885, 436, 165),
            children: [
              { id: '1:2112', name: '@echarts/bars+lines', type: 'GROUP', absoluteBoundingBox: box(1452, 885, 436, 165), children: [] },
            ],
          },
        ],
      },
    }
    const r = deriveSectionsFromFigmaTree(groupRoot)
    expect(r).not.toBeNull()
    // 顶层两段：header + con（bg 归 backgrounds），不是 header 条的内部结构
    expect(r.sections.map((s) => s.id)).toEqual(['1:2078', '17:59'])
    expect(r.sections[0].type).toBe('header')
    expect(r.sections[0].chromeOnly).toBe(false)
    // 上月/本年 tabs 在 header children（item 化），不再丢进 body
    const tabs = r.sections[0].children.find((s) => s.id === '1:2100')
    expect(tabs).toBeTruthy()
    expect(r.backgrounds.map((b) => b.id)).toEqual(['17:57'])
  })
})

describe('deriveSectionsFromFigmaTree · @echarts 图表语义（收尾）', () => {
  const box = (x, y, w, h) => ({ x, y, width: w, height: h })
  it('直接子节点含 @echarts 标记 → section 推导为 chart 类型', () => {
    const figma = {
      document: {
        id: 'root', name: 'cp-流量监测', type: 'FRAME',
        children: [
          { id: 'h', name: 'header-', type: 'GROUP', absoluteBoundingBox: box(0, 119, 380, 32), children: [] },
          {
            id: 's1', name: 'slot-当日总流量', type: 'FRAME', absoluteBoundingBox: box(0, 158, 425, 556),
            children: [
              { id: 'c1', name: '@echarts/bar', type: 'GROUP', absoluteBoundingBox: box(0, 160, 200, 130) },
              { id: 'c2', name: '@echarts/bar', type: 'GROUP', absoluteBoundingBox: box(200, 160, 200, 130) },
            ],
          },
          { id: 's2', name: 'slot-车型分布', type: 'GROUP', absoluteBoundingBox: box(0, 573, 387, 142), children: [] },
        ],
      },
    }
    const r = deriveSectionsFromFigmaTree(figma)
    const s1 = r.sections.find((s) => s.id === 's1')
    const s2 = r.sections.find((s) => s.id === 's2')
    // 含 @echarts 的 section 推导为 chart，无图表的保持无 type
    expect(s1.type).toBe('chart')
    expect(s2.type).toBeUndefined()
    // @echarts 标记保留在 children 里，供下游 extractCharts 识别子类型
    expect(s1.children.map((c) => c.name)).toEqual(['@echarts/bar', '@echarts/bar'])
  })
})

describe('buildSectionStyleFacts（E1 治本 · 语义化样式事实）', () => {
  const box = (x, y, w, h) => ({ x, y, width: w, height: h })

  // 模拟设备监测的 tabs section：激活 tab 深蓝渐变 + 普通 tab 浅蓝渐变
  const figma = {
    document: {
      id: 'root', name: 'cp-设备监测', type: 'FRAME',
      children: [
        {
          id: '89:39', name: 'tabs', type: 'FRAME', absoluteBoundingBox: box(1475, 538, 46, 317),
          children: [
            {
              id: '2:8825', name: 'tab-active', type: 'GROUP', absoluteBoundingBox: box(1475, 538, 46, 54),
              children: [
                {
                  id: '2:8826', name: 'bg', type: 'RECTANGLE', absoluteBoundingBox: box(1475, 538, 34, 44),
                  fills: [{ type: 'GRADIENT_LINEAR', visible: true, gradientStops: [
                    { color: { r: 0.192, g: 0.541, b: 1 }, position: 0 },
                    { color: { r: 0.439, g: 0.749, b: 1 }, position: 1 },
                  ] }],
                },
                { id: '2:8827', name: 't-监控', type: 'TEXT', characters: '监控', absoluteBoundingBox: box(1475, 538, 15, 36), style: { fontSize: 14, fontWeight: 700 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] },
              ],
            },
            {
              id: '2:8830', name: 'tab', type: 'GROUP', absoluteBoundingBox: box(1475, 591, 37, 44),
              children: [
                {
                  id: '2:8831', name: 'bg', type: 'VECTOR', absoluteBoundingBox: box(1475, 591, 34, 40),
                  fills: [{ type: 'GRADIENT_LINEAR', visible: true, gradientStops: [
                    { color: { r: 0.522, g: 0.729, b: 1 }, position: 0 },
                    { color: { r: 0.749, g: 0.886, b: 1 }, position: 1 },
                  ] }],
                },
                { id: '2:8832', name: 'd-照明', type: 'TEXT', characters: '照明', absoluteBoundingBox: box(1475, 591, 15, 32), style: { fontSize: 14 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0.231, g: 0.502, b: 0.906 } }] },
              ],
            },
          ],
        },
      ],
    },
  }

  const treeSections = [
    {
      id: '89:39', type: 'tabs', title: 'tabs', responsibility: '标签页切换区',
      sourceNodeIds: ['89:39', '2:8825', '2:8830'],
    },
  ]

  test('语义化样式：激活 tab 深蓝渐变 + 白字，普通 tab 浅蓝渐变 + 蓝字（可区分）', () => {
    const out = buildSectionStyleFacts(treeSections, figma)
    expect(out).toContain('tabs')
    // 激活 tab 背景（#318aff 约等于 #318aff）
    expect(out).toContain('#318aff')
    // 普通 tab 背景（#85baff）
    expect(out).toContain('#85baff')
    // 文字色：监控白字 + 照明蓝字
    expect(out).toContain('监控')
    expect(out).toContain('照明')
    // 激活 vs 普通 tab 背景不同（关键：不能统一成同一颜色）
    const activeIdx = out.indexOf('#318aff')
    const normalIdx = out.indexOf('#85baff')
    expect(activeIdx).not.toBe(-1)
    expect(normalIdx).not.toBe(-1)
    expect(activeIdx).not.toBe(normalIdx)
  })

  test('无语义树 / 无 Figma 数据 → 返回空字符串', () => {
    expect(buildSectionStyleFacts([], figma)).toBe('')
    expect(buildSectionStyleFacts(treeSections, null)).toBe('')
  })

  test('type undefined 叶子也提取 + opacity 叠加（设备卡半透明背景）', () => {
    // 设备卡：GROUP opacity=0.5 包 Vector（蓝色渐变），此前 type undefined 被跳过 + opacity 丢失
    const figma2 = {
      document: {
        id: 'root', name: 'cp-设备监测', type: 'FRAME',
        children: [
          {
            id: '2:8438', name: 'Group 2136637321', type: 'GROUP', absoluteBoundingBox: box(1518, 550, 117, 64),
            children: [
              {
                id: '2:8439', name: 'bg', type: 'GROUP', absoluteBoundingBox: box(1518, 550, 117, 64), opacity: 0.5,
                children: [
                  {
                    id: '2:8440', name: 'Vector', type: 'VECTOR', absoluteBoundingBox: box(1518, 550, 117, 64), opacity: 0.8,
                    fills: [{ type: 'GRADIENT_LINEAR', visible: true, gradientStops: [
                      { color: { r: 0.278, g: 0.651, b: 0.980 }, position: 0 },
                      { color: { r: 0.278, g: 0.651, b: 0.980 }, position: 1 },
                    ] }],
                  },
                ],
              },
              { id: '2:8442', name: '摄像机', type: 'TEXT', characters: '摄像机', absoluteBoundingBox: box(1518, 560, 36, 18), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }] },
            ],
          },
        ],
      },
    }
    // cons 叶子 type=undefined，只有 title
    const consTree = [{ id: '2:8437', type: 'container', title: 'cons', isLayoutContainer: true, children: [
      { id: '2:8438', title: 'Group 2136637321', sourceNodeIds: ['2:8438'] },
    ] }]
    const out = buildSectionStyleFacts(consTree, figma2)
    // type undefined 叶子（title=Group 2136637321）也提取了
    expect(out).toContain('Group 2136637321')
    // 半透明背景被提取（opacity 0.5 × 0.8 = 0.4）
    expect(out).toContain('透明度')
    expect(out).toContain('摄像机')
  })

  test('12 卡同构网格：内部横向布局 + 文字色进入事实，不被 12 张卡挤出', () => {
    const makeCard = (id, x, y, label, value) => ({
      id, name: `Group ${id}`, type: 'GROUP', absoluteBoundingBox: box(x, y, 117, 64),
      children: [
        { id: `${id}-bg`, name: 'bg', type: 'GROUP', absoluteBoundingBox: box(x, y, 117, 64) },
        { id: `${id}-icon`, name: 'icon', type: 'GROUP', absoluteBoundingBox: box(x + 6, y + 16, 27, 32) },
        { id: `${id}-label`, name: label, type: 'TEXT', characters: label, absoluteBoundingBox: box(x + 39, y + 13, 36, 18), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }] },
        { id: `${id}-value`, name: value, type: 'TEXT', characters: value, absoluteBoundingBox: box(x + 39, y + 35, 55, 21), style: { fontSize: 16 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] },
      ],
    })
    const cards = Array.from({ length: 12 }, (_, i) => makeCard(`c${i}`, 1518 + (i % 3) * 125, 550 + Math.floor(i / 3) * 77, '摄像机', '(2/484)'))
    const figma3 = {
      document: {
        id: 'root', name: 'cp-设备监测', type: 'FRAME',
        children: [{
          id: '2:8437', name: 'cons', type: 'FRAME', absoluteBoundingBox: box(1475, 538, 367, 295),
          children: cards,
        }],
      },
    }
    const tree = [{
      id: '2:8437', title: 'cons', figmaNodeId: '2:8437',
      sourceNodeIds: ['2:8437', ...cards.flatMap((c) => [c.id, `${c.id}-bg`, `${c.id}-icon`, `${c.id}-label`, `${c.id}-value`])],
    }]
    const out = buildSectionStyleFacts(tree, figma3)
    expect(out).toContain('重复单元×12')
    expect(out).toContain('横向 flex')
    expect(out).toContain('左侧 icon')
    // 🛡️ 2026-09-27 强化：右侧文字列须显式要求 column（治 cons-text 漏方向横排）
    expect(out).toContain('flex-direction:column')
    expect(out).toContain('#ffffff')
    expect(out).toContain('#333333')
    expect(out).toContain('(2/484)')
  })

  test('🛡️ 深度递归不抛 ReferenceError（walkChildren 漏定义回归，2026-09-17 73137ad9）', () => {
    // 实锤：collect() 末尾误写 `walkChildren(node)`（该函数从未定义）→ ReferenceError:
    //   walkChildren is not defined → buildChunkMiddle 崩溃 → 任务 fail
    //   （mc-max-1789625514255-73137ad9 实锤）。治本：改回 collect 递归。
    // 本用例构造 4 层嵌套（超过 maxDepth=3 也需要安全返回），确保不再有未定义符号。
    const deep = {
      document: {
        id: 'root', name: 'cp-策略类型分布', type: 'FRAME',
        children: [{
          id: 'slot', name: 'slot-con', type: 'FRAME', absoluteBoundingBox: box(0, 0, 400, 300),
          children: [{
            id: 'mid', name: '中间图表', type: 'FRAME', absoluteBoundingBox: box(10, 10, 200, 200),
            children: [{
              id: 'inner', name: 'inner-group', type: 'GROUP', absoluteBoundingBox: box(20, 20, 100, 100),
              children: [{
                id: 'deep', name: 'deep-text', type: 'TEXT', characters: '28%',
                absoluteBoundingBox: box(30, 30, 40, 20), style: { fontSize: 14 },
                fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }],
              }],
            }],
          }],
        }],
      },
    }
    const sections = [{ id: 'slot', title: 'slot-con', figmaNodeId: 'slot', sourceNodeIds: ['slot'] }]
    // 核心断言：不抛异常，且能提取到子树样式（证明递归真的走通了）
    expect(() => buildSectionStyleFacts(sections, deep)).not.toThrow()
    const out = buildSectionStyleFacts(sections, deep)
    expect(out).toContain('28%')
  })

  test('图例条 fill.opacity=0.1 + 同色描边写入事实（d70a19bf）', () => {
    const red = { r: 1, g: 98 / 255, b: 98 / 255 }
    const figma = {
      document: {
        id: 'root', name: 'cp', type: 'FRAME',
        children: [{
          id: '3:74', name: 'Frame 2136638592', type: 'FRAME',
          absoluteBoundingBox: box(303, 2282, 220, 32),
          fills: [{ type: 'SOLID', visible: true, opacity: 0.1, color: red }],
          strokes: [{ type: 'SOLID', visible: true, color: red }],
          strokeWeight: 1,
          children: [
            { id: '3:74-t', name: '交通事故', type: 'TEXT', characters: '交通事故',
              absoluteBoundingBox: box(320, 2286, 56, 21),
              fills: [{ type: 'SOLID', visible: true, color: red }] },
          ],
        }],
      },
    }
    const tree = [{
      id: '287:5-left', type: 'stats', title: '统计数据-left',
      sourceNodeIds: ['3:74', '3:74-t'],
    }]
    const out = buildSectionStyleFacts(tree, figma)
    expect(out).toContain('rgba(255,98,98,0.1)')
    expect(out).toContain('描边:1px #ff6262')
    expect(out).toContain('交通事故')
  })

  test('🛡️ Fix2 段首禁令：透明度归属铁律注入（防父组上提 opacity 双重透明发蓝）', () => {
    // 实锤 mc-max-1790496527811 设备组件「整体发蓝」= 父组挂 opacity 与 PNG 自身透明叠加成双重透明。
    // 治本：在样式真值首段注入铁律，明确透明度只作用于自身图层、严禁上提父容器。
    const fg = {
      document: {
        id: 'root', name: 'cp-设备监测', type: 'FRAME',
        children: [{
          id: '89:39', name: 'cons', type: 'FRAME', absoluteBoundingBox: box(1475, 538, 367, 295),
          children: [
            { id: '2:9', name: '摄像机', type: 'TEXT', characters: '摄像机', absoluteBoundingBox: box(1475, 560, 36, 18), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }] },
            { id: '2:10', name: 'bg', type: 'VECTOR', absoluteBoundingBox: box(1475, 580, 27, 32), fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }] },
          ],
        }],
      },
    }
    const tree = [{ id: '89:39', type: 'container', title: 'cons', sourceNodeIds: ['89:39'] }]
    const out = buildSectionStyleFacts(tree, fg)
    // 首段（leafUsed===0）必须注入透明度归属铁律
    expect(out).toContain('透明度归属铁律')
    expect(out).toContain('严禁把子节点透明度上提到父容器')
    expect(out).toContain('双重透明')
  })

  test('🛡️ Fix3 几何判定：纵向文本块（≥2 直接 TEXT 子节点、同左/同右对齐、y 递增）→ 提示 flex-direction:column', () => {
    // 实锤 mc-max-1790496527811 设备 cons 区：标签在上、数值在下，漏 column 被横排挤一行。
    // 纯几何判定（同左或同右对齐、y 递增），不按组件名/class。
    const fg = {
      document: {
        id: 'root', name: 'cp-设备监测', type: 'FRAME',
        children: [{
          id: 'cons', name: 'cons', type: 'FRAME', absoluteBoundingBox: box(1475, 538, 367, 80),
          children: [
            { id: '2:a', name: 'label', type: 'TEXT', characters: '在线设备', absoluteBoundingBox: box(1475, 540, 60, 18), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }] },
            { id: '2:b', name: 'value', type: 'TEXT', characters: '128', absoluteBoundingBox: box(1476, 570, 55, 24), style: { fontSize: 20 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] },
          ],
        }],
      },
    }
    const tree = [{ id: 'cons', type: 'container', title: 'cons', sourceNodeIds: ['cons'] }]
    const out = buildSectionStyleFacts(tree, fg)
    expect(out).toContain('文本块纵向(纯文本块·同左或同右对齐、y递增)：标签在上数值在下 → 该容器用 flex-direction:column')
  })

  test('🛡️ T1（2026-09-29）：右对齐纵向文本块（左边缘不齐但右边缘对齐）→ 仍提示 column', () => {
    // 实锤 mc-max-1790650861294 任务 2:3683（当日总流量数字卡）：
    //   「34,620」(x=94,w=77,右=171) 与「江阴靖江长江隧道」(x=43,w=128,右=171)
    //   左边缘差 51px ⇒ 原「同 x」判据判不齐 ⇒ 纵向事实缺失 ⇒ 数字卡顺序无约束。
    const fg = {
      document: {
        id: 'root', name: 'cp-交通监测', type: 'FRAME',
        children: [{
          id: 'grp', name: 'Group 1321318553', type: 'GROUP', absoluteBoundingBox: box(43, 212, 128, 52),
          children: [
            { id: '3:a', name: 'd', type: 'TEXT', characters: '34,620', absoluteBoundingBox: box(94, 236, 77, 28), style: { fontSize: 24 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0.4, b: 0.9 } }] },
            { id: '3:b', name: 't', type: 'TEXT', characters: '江阴靖江长江隧道', absoluteBoundingBox: box(43, 212, 128, 24), style: { fontSize: 16 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }] },
          ],
        }],
      },
    }
    const tree = [{ id: 'grp', type: 'container', title: 'grp', sourceNodeIds: ['grp'] }]
    const out = buildSectionStyleFacts(tree, fg)
    expect(out).toContain('文本块纵向(纯文本块·同左或同右对齐、y递增)：标签在上数值在下 → 该容器用 flex-direction:column')
  })

  test('🛡️ 布局事实独立轨（2026-09-29）：布局事实与样式事实**分段**输出，且布局段自带结构强指令', () => {
    // 背景：四类布局事实（重复单元 / 内部布局嵌套 / 横向顺序 / 文本块纵向）原与 `bg:` `color:` `尺寸:`
    //   同属 secLines、同格式逐条输出，「文本块纵向」更被 parts.join(' | ') 拼进样式行 ⇒
    //   下游 LLM 把它当**样式属性**而非**结构指令** ⇒ 事实下发却未被遵循
    //   （实锤 mc-max-1790654134322-bc91bb18：`con` 子序仍环形最左、数字卡仍数值在上）。
    const fg = {
      document: {
        id: 'root', name: 'cp-x', type: 'FRAME',
        children: [{
          id: 'grp', name: 'Group 1321318553', type: 'GROUP', absoluteBoundingBox: box(43, 212, 128, 52),
          children: [
            { id: '3:a', name: 'd', type: 'TEXT', characters: '34,620', absoluteBoundingBox: box(94, 236, 77, 28), style: { fontSize: 24 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0.4, b: 0.9 } }] },
            { id: '3:b', name: 't', type: 'TEXT', characters: '江阴靖江长江隧道', absoluteBoundingBox: box(43, 212, 128, 24), style: { fontSize: 16 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }] },
          ],
        }],
      },
    }
    const tree = [{ id: 'grp', type: 'container', title: 'grp', sourceNodeIds: ['grp'] }]
    const out = buildSectionStyleFacts(tree, fg)

    // ① 布局段存在，且带结构强指令（不是样式建议）
    expect(out).toContain('布局与顺序真值')
    expect(out).toContain('（布局与顺序真值 · 模板必须照此写）')
    expect(out).toContain('违反上述顺序属于**结构缺陷**')
    // ② 布局段**先于**样式段
    expect(out.indexOf('（布局与顺序真值 · 模板必须照此写）')).toBeLessThan(
      out.indexOf('（内部元素样式真值）'),
    )
    // ③ 样式段仍然存在（分段不是替换）
    expect(out).toContain('（内部元素样式真值）')
    // ④ 回归防线：布局事实**不得**再被拼进样式行（原形态 `尺寸:131×52 | 文本块纵向(...)`）
    expect(out).not.toMatch(/尺寸:\d+×\d+ \| 文本块纵向/)
  })

  test('🛡️ T1 增强（2026-09-29）：DOM 序 ≠ 视觉 y 序 → 必须指名「从上到下」的具体元素顺序', () => {
    // 审计（全语料 40 样本）：命中「纵向文本块」容器 76 个，其中 **19 个（25%）DOM 序与视觉序相反**
    //   （实锤 2:3683 跨 8+ 轮任务稳定复现：DOM `[34,620, 江阴靖江长江隧道]`，
    //     视觉 `[江阴靖江长江隧道, 34,620]`）⇒ 只给方向提示不够，LLM 照 DOM 序写即「数值在上」。
    const fg = {
      document: {
        id: 'root', name: 'cp-x', type: 'FRAME',
        children: [{
          id: 'grp', name: 'Group 1321318553', type: 'GROUP', absoluteBoundingBox: box(43, 212, 128, 52),
          children: [
            { id: '3:a', name: 'd', type: 'TEXT', characters: '34,620', absoluteBoundingBox: box(94, 236, 77, 28), style: { fontSize: 24 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0.4, b: 0.9 } }] },
            { id: '3:b', name: 't', type: 'TEXT', characters: '江阴靖江长江隧道', absoluteBoundingBox: box(43, 212, 128, 24), style: { fontSize: 16 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }] },
          ],
        }],
      },
    }
    const tree = [{ id: 'grp', type: 'container', title: 'grp', sourceNodeIds: ['grp'] }]
    const out = buildSectionStyleFacts(tree, fg)
    expect(out).toContain('（⚠️ DOM 序与视觉序不符：从上到下应为 「江阴靖江长江隧道」 → 「34,620」）')
  })

  test('🛡️ T1 反例（2026-09-29）：DOM 序 == 视觉 y 序 → 不追加顺序提示（避免噪声）', () => {
    // 审计：76 个纵向文本块中 57 个（75%）DOM 序与视觉序一致 ⇒ 这些**不该**收到冗余提示。
    const fg = {
      document: {
        id: 'root', name: 'cp-x', type: 'FRAME',
        children: [{
          id: 'grp', name: 'Group 1321318553', type: 'GROUP', absoluteBoundingBox: box(43, 212, 128, 52),
          children: [
            { id: '4:a', name: 't', type: 'TEXT', characters: '江阴大桥', absoluteBoundingBox: box(43, 212, 128, 24), style: { fontSize: 16 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }] },
            { id: '4:b', name: 'd', type: 'TEXT', characters: '82,379', absoluteBoundingBox: box(43, 240, 128, 28), style: { fontSize: 24 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0.4, b: 0.9 } }] },
          ],
        }],
      },
    }
    const tree = [{ id: 'grp', type: 'container', title: 'grp', sourceNodeIds: ['grp'] }]
    const out = buildSectionStyleFacts(tree, fg)
    // 方向事实仍在（标签在上数值在下）
    expect(out).toContain('文本块纵向(纯文本块·同左或同右对齐、y递增)：标签在上数值在下 → 该容器用 flex-direction:column')
    // 但**不**追加「DOM 序与视觉序不符」
    expect(out).not.toContain('DOM 序与视觉序不符')
  })

  test('🛡️ C1（2026-09-29 · 根源判据）：面积 <3% 但承载成词文本的窄条 → 仍提升为 section', () => {
    // 实锤 mc-max-1790650861294：图表小标题 Frame 2136639396（118x21）占父容器（426x556）
    //   仅 1.05%，被 3% 相对面积阈值当「装饰性小元素」过滤 ⇒ 从未进 section 计划
    //   ⇒ 产物永远没有图表小标题。
    // 判据（**不含与设计稿耦合的绝对尺寸**）：直接子有成词 TEXT（≥2 字符）且其宽 ≥ 容器宽 50%。
    // ⚠️ 用例必须放在**第二层**：顶层 section（root 直接子）只过滤 BG_TYPES/bg-*，无条件提升，
    //    不走 shouldPromoteToSection（放顶层会让本测试变成假阳性）。
    const fg = {
      document: {
        id: 'root', name: 'cp-x', type: 'FRAME', absoluteBoundingBox: box(0, 0, 426, 556),
        children: [{
          id: 'slot', name: 'slot-当日总流量', type: 'FRAME', absoluteBoundingBox: box(0, 0, 426, 556),
          children: [{
            id: 'title', name: 'Frame 2136639396', type: 'FRAME', absoluteBoundingBox: box(0, 0, 118, 21),
            children: [
              { id: 'ico', name: 'icon', type: 'VECTOR', absoluteBoundingBox: box(0, 4, 3, 12) },
              { id: 'txt', name: 't', type: 'TEXT', characters: '江阴靖江长江隧道', absoluteBoundingBox: box(4, 0, 112, 21), style: { fontSize: 14 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }] },
            ],
          }],
        }],
      },
    }
    const d = deriveSectionsFromFigmaTree(fg)
    const slot = (d?.sections || []).find((s) => String(s.id) === 'slot')
    expect(slot).toBeTruthy()
    // ⚠️ 必须断言 `isNestedSection === true`（真被提升），不能只断言"存在于 children"：
    //    `deriveNestedSections` 在**无任何**子节点被提升时会 fail-open 回退成 item 列表，
    //    那种情况下节点也在 children 里，但**不是** section（该断言原版是假阳性）。
    const title = (slot.children || []).find((c) => String(c.id) === 'title')
    expect(title?.isNestedSection).toBe(true)
  })

  test('🛡️ C1 反例：微型徽章（14x14 含单字符「6」）→ 仍被 3% 面积阈值过滤（不提升）', () => {
    // 全语料 40 样本实证：`num`(14x14, 内容「6」) 是唯一被「文本宽 ≥50%」判据误纳的形态
    //   ⇒ 加「成词（≥2 字符）」闸门后排除，结果与旧绝对尺寸判据逐条一致。
    const fg = {
      document: {
        id: 'root', name: 'cp-x', type: 'FRAME', absoluteBoundingBox: box(0, 0, 400, 300),
        children: [{
          id: 'slot', name: 'slot-x', type: 'FRAME', absoluteBoundingBox: box(0, 0, 400, 300),
          children: [{
            id: 'num', name: 'num', type: 'FRAME', absoluteBoundingBox: box(0, 0, 14, 14),
            children: [
              { id: 'n', name: 'n', type: 'TEXT', characters: '6', absoluteBoundingBox: box(3, 2, 8, 10), style: { fontSize: 10 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] },
            ],
          }],
        }],
      },
    }
    const d = deriveSectionsFromFigmaTree(fg)
    const slot = (d?.sections || []).find((s) => String(s.id) === 'slot')
    expect(slot).toBeTruthy()
    const num = (slot.children || []).find((c) => String(c.id) === 'num')
    // 未被提升为嵌套 section（仍可能作为 item 保留 —— fail-open 回退，见上）
    expect(num?.isNestedSection).not.toBe(true)
  })

  test('🛡️ Fix3 收窄反例：混合容器（含 bg/icon 兄弟 + 2 纵排 TEXT）→ 不提示 column（卡片实为 row）', () => {
    // 全语料实证（2026-09-27）：仅凭「≥2 同x、y递增 TEXT」会把设备卡片 Group(bg+icon+2 TEXT)
    // 与装饰图标组误判成纯文本块（占命中 96.2%）。卡片真实布局是 row（icon 左、文本列右），
    // 由 describeRepeatedItemLayout 正确描述；此处不得再发 column 造成矛盾。
    const fg = {
      document: {
        id: 'root', name: 'cp-设备监测', type: 'FRAME',
        children: [{
          id: 'card', name: 'Group 2136637321', type: 'GROUP', absoluteBoundingBox: box(1518, 550, 117, 64),
          children: [
            { id: 'bg', name: 'bg', type: 'GROUP', absoluteBoundingBox: box(1518, 550, 117, 64), children: [
              { id: 'v', name: 'Vector', type: 'VECTOR', absoluteBoundingBox: box(1518, 550, 117, 64) },
            ] },
            { id: 't1', name: '摄像机', type: 'TEXT', characters: '摄像机', absoluteBoundingBox: box(1557, 563, 36, 18), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }] },
            { id: 't2', name: '(2/484)', type: 'TEXT', characters: '(2/484)', absoluteBoundingBox: box(1557, 585, 55, 21), style: { fontSize: 16 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] },
            { id: 'icon', name: 'icon', type: 'GROUP', absoluteBoundingBox: box(1524, 566, 27, 32), children: [
              { id: 'r', name: 'Rectangle', type: 'RECTANGLE', absoluteBoundingBox: box(1524, 566, 26, 26) },
            ] },
          ],
        }],
      },
    }
    const tree = [{ id: 'card', type: 'container', title: 'card', sourceNodeIds: ['card'] }]
    const out = buildSectionStyleFacts(tree, fg)
    expect(out).not.toContain('该容器用 flex-direction:column')
  })

  test('🛡️ Fix3 反例：横向 TEXT（同 y、x 递增）→ 不提示 column（避免误改横向块）', () => {
    const fg = {
      document: {
        id: 'root', name: 'cp', type: 'FRAME',
        children: [{
          id: 'row', name: 'row', type: 'FRAME', absoluteBoundingBox: box(100, 100, 200, 30),
          children: [
            { id: '2:a', name: 'label', type: 'TEXT', characters: 'label', absoluteBoundingBox: box(100, 105, 40, 18), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }] },
            { id: '2:b', name: 'value', type: 'TEXT', characters: '128', absoluteBoundingBox: box(150, 106, 55, 18), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] },
          ],
        }],
      },
    }
    const tree = [{ id: 'row', type: 'container', title: 'row', sourceNodeIds: ['row'] }]
    const out = buildSectionStyleFacts(tree, fg)
    expect(out).not.toContain('该容器用 flex-direction:column')
  })

  test('🛡️ Fix1 嵌套布局：DOM 序 ≠ 视觉序的容器（switch 药丸 row[col,col]）→ 输出列分组事实', () => {
    // 实锤 device-monitor e8c97bf8：active 药丸真实 row[ 左列(icon↓title), 右列(stat1↓stat2) ]，
    // 但 DOM 序为 icon→title→line1→line2（与视觉行优先序不同）→ LLM 按 DOM 序填 2×2 grid 会错位。
    const fg = {
      document: {
        id: 'root', name: 'cp', type: 'FRAME',
        children: [{
          id: 'active', name: 'active', type: 'GROUP', absoluteBoundingBox: box(1486, 475, 193, 65),
          children: [
            { id: 'bg', name: 'bg', type: 'GROUP', absoluteBoundingBox: box(1486, 475, 193, 65) }, // 满尺寸背景 → 排除
            { id: 't', name: 't-隧道设备', type: 'TEXT', characters: '隧道设备', absoluteBoundingBox: box(1500, 514, 45, 16), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] },
            { id: 'l1', name: 'line1', type: 'FRAME', absoluteBoundingBox: box(1550, 481, 105, 23), children: [
              { id: 'l1a', name: 't-总数:', type: 'TEXT', characters: '总数:', absoluteBoundingBox: box(1550, 482, 46, 21), style: { fontSize: 14 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] },
              { id: 'l1b', name: 'd-56302', type: 'TEXT', characters: '56302', absoluteBoundingBox: box(1597, 481, 58, 23), style: { fontSize: 20 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] },
            ] },
            { id: 'l2', name: 'line2', type: 'FRAME', absoluteBoundingBox: box(1550, 510, 59, 23), children: [
              { id: 'l2a', name: 't-异常数:', type: 'TEXT', characters: '异常数:', absoluteBoundingBox: box(1550, 511, 46, 21), style: { fontSize: 14 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] },
              { id: 'l2b', name: 'd-5', type: 'TEXT', characters: '5', absoluteBoundingBox: box(1597, 510, 12, 23), style: { fontSize: 20 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] },
            ] },
            { id: 'ic', name: 'icon', type: 'GROUP', absoluteBoundingBox: box(1504, 483, 35, 28) },
          ],
        }],
      },
    }
    const tree = [{ id: 'active', type: 'active', title: 'active', sourceNodeIds: ['active'] }]
    const out = buildSectionStyleFacts(tree, fg)
    expect(out).toContain('内部布局(几何 · 嵌套)：2 列 × 2 行')
    expect(out).toContain('第1列(x≈1500，上→下): icon → 「隧道设备」')
    expect(out).toContain('第2列(x≈1550，上→下): 「总数:56302」 → 「异常数:5」')
  })

  test('🛡️ Fix1 反例：DOM 序 == 视觉阅读序 → 不输出（LLM 不会错位）', () => {
    const fg = {
      document: {
        id: 'root', name: 'cp', type: 'FRAME',
        children: [{
          id: 'g2', name: 'g2', type: 'FRAME', absoluteBoundingBox: box(100, 100, 300, 80),
          children: [
            { id: 'a', name: 'a', type: 'TEXT', characters: 'a', absoluteBoundingBox: box(100, 100, 60, 20), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }] },
            { id: 'b', name: 'b', type: 'TEXT', characters: 'b', absoluteBoundingBox: box(220, 100, 60, 20), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }] },
            { id: 'c', name: 'c', type: 'TEXT', characters: 'c', absoluteBoundingBox: box(100, 150, 60, 20), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }] },
            { id: 'd', name: 'd', type: 'TEXT', characters: 'd', absoluteBoundingBox: box(220, 150, 60, 20), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }] },
          ],
        }],
      },
    }
    const tree = [{ id: 'g2', type: 'container', title: 'g2', sourceNodeIds: ['g2'] }]
    expect(buildSectionStyleFacts(tree, fg)).not.toContain('内部布局(几何 · 嵌套)')
  })

  test('🛡️ Fix1 反例：图表段不输出嵌套布局（轴标签/图例会被误读）', () => {
    const fg = {
      document: {
        id: 'root', name: 'cp', type: 'FRAME',
        children: [{
          id: 'chart', name: 'chart', type: 'FRAME', absoluteBoundingBox: box(0, 0, 300, 200),
          children: [
            { id: 'x1', name: 'label', type: 'TEXT', characters: '4000', absoluteBoundingBox: box(34, 180, 40, 16), style: { fontSize: 10 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }] },
            { id: 'x2', name: 'label2', type: 'TEXT', characters: '3000', absoluteBoundingBox: box(120, 180, 40, 16), style: { fontSize: 10 }, fills: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }] },
            { id: 'y1', name: 'bar', type: 'RECTANGLE', absoluteBoundingBox: box(34, 100, 40, 60), fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.6, b: 1 } }] },
            { id: 'y2', name: 'bar2', type: 'RECTANGLE', absoluteBoundingBox: box(120, 80, 40, 80), fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.6, b: 1 } }] },
          ],
        }],
      },
    }
    const tree = [{ id: 'chart', type: 'chart', title: 'chart', sourceNodeIds: ['chart'] }]
    expect(buildSectionStyleFacts(tree, fg)).not.toContain('内部布局(几何 · 嵌套)')
  })
})


describe("semanticClassKeywords（中英文语义鸿沟桥接）", () => {
  test("中文容器名展开为英文 class 关键词", () => {
    expect(semanticClassKeywords("中间图表")).toEqual(["chart"])
    expect(semanticClassKeywords("统计数据")).toEqual(["stats", "data"])
    expect(semanticClassKeywords("switch")).toEqual(["switch"])
  })
  test("空输入返回空数组", () => {
    expect(semanticClassKeywords("")).toEqual([])
    expect(semanticClassKeywords(null)).toEqual([])
  })
})

describe("headerIsChromeOnly（纯 chrome 标题栏判定）", () => {
  test("纯装饰标题栏（VECTOR×N + circle/path + 单标题文本）→ chrome", () => {
    const envHeader = {
      type: "GROUP",
      name: "header",
      children: [
        { type: "VECTOR", name: "Vector 1484" },
        {
          type: "GROUP",
          name: "g",
          children: [
            { type: "VECTOR", name: "circle" },
            { type: "VECTOR", name: "circle" },
            { type: "VECTOR", name: "path" },
          ],
        },
        { type: "VECTOR", name: "Vector 1476" },
        { type: "TEXT", name: "环境监测", characters: "环境监测" },
      ],
    }
    expect(headerIsChromeOnly(envHeader)).toBe(true)
  })

  test("业务 header（含 tabs FRAME）→ 非 chrome", () => {
    const vehHeader = {
      type: "FRAME",
      name: "header",
      children: [
        {
          type: "FRAME",
          name: "tabs",
          children: [{ type: "TEXT", name: "江阴靖江长江隧道" }],
        },
        {
          type: "GROUP",
          name: "小标题",
          children: [
            { type: "TEXT", name: "重点车辆监测" },
            { type: "TEXT", name: "*数据实时更新" },
          ],
        },
      ],
    }
    expect(headerIsChromeOnly(vehHeader)).toBe(false)
  })

  test("业务 header（双文本小标题，无 FRAME）→ 非 chrome", () => {
    const header = {
      type: "GROUP",
      name: "header",
      children: [
        { type: "GROUP", name: "g" },
        { type: "TEXT", name: "标题" },
        { type: "TEXT", name: "副标题说明" },
      ],
    }
    expect(headerIsChromeOnly(header)).toBe(false)
  })

  test("业务 header（含 tab 语义命名 GROUP）→ 非 chrome", () => {
    const header = {
      type: "GROUP",
      name: "header",
      children: [
        { type: "GROUP", name: "tab-switch" },
        { type: "TEXT", name: "标题" },
      ],
    }
    expect(headerIsChromeOnly(header)).toBe(false)
  })

  test("空/非法输入/无子节点 → 保守保留（不剥离）", () => {
    expect(headerIsChromeOnly(null)).toBe(false)
    expect(headerIsChromeOnly(undefined)).toBe(false)
    expect(headerIsChromeOnly({ type: 'GROUP', name: 'header', children: [] })).toBe(false)
  })
})

describe("clusterItemsByColumnX（按 x 坐标聚类分列）", () => {
  const item = (x: number, y: number, id = `${x}:${y}`) => ({
    id,
    name: id,
    role: 'item',
    figmaNode: id,
    absoluteBoundingBox: { x, y, width: 220, height: 32 },
  })
  test("8 项按 x 聚成左右两列（各 4 项，y 递增）→ 2 列", () => {
    const items = [
      item(303, 2282, '3:74'), item(806, 2282, '3:110'),
      item(303, 2328, '3:75'), item(806, 2328, '3:115'),
      item(303, 2374, '3:80'), item(806, 2374, '3:120'),
      item(303, 2420, '3:85'), item(806, 2420, '3:125'),
    ]
    const cols = clusterItemsByColumnX(items)
    expect(cols).toHaveLength(2)
    expect(cols![0].columnX).toBe(303)
    expect(cols![1].columnX).toBe(806)
    expect(cols![0].items).toHaveLength(4)
    expect(cols![1].items).toHaveLength(4)
    // 每列内部按 y 升序
    expect(cols![0].items[0].id).toBe('3:74')
    expect(cols![0].items[3].id).toBe('3:85')
  })

  test("单列（同一 x）→ null（不拆）", () => {
    const items = [
      item(303, 100, 'a'), item(303, 132, 'b'),
      item(303, 164, 'c'), item(303, 196, 'd'),
    ]
    expect(clusterItemsByColumnX(items)).toBeNull()
  })

  test("item 总数 < 4 → null", () => {
    expect(clusterItemsByColumnX([item(303, 100), item(806, 100)])).toBeNull()
  })

  test("某列仅 1 项（不均匀）→ null（保守不拆）", () => {
    const items = [
      item(303, 100), item(303, 132),
      item(806, 100),
    ]
    expect(clusterItemsByColumnX(items)).toBeNull()
  })

  test("空/非法输入 → null", () => {
    expect(clusterItemsByColumnX([])).toBeNull()
    expect(clusterItemsByColumnX(null)).toBeNull()
  })
})

describe("reorganizeCenteredChartLayout（图表居中 + 图例分两侧）", () => {
  const stat = (x: number, y: number, id: string) => ({
    id, name: id, role: 'item', figmaNode: id,
    absoluteBoundingBox: { x, y, width: 220, height: 32 },
  })
  const statsSection = {
    id: '287:5',
    name: '统计数据',
    type: 'stats',
    figmaNodeId: '287:5',
    layout: 'horizontal',
    absoluteBoundingBox: { x: 303, y: 2282, width: 723, height: 170 },
    children: [
      stat(303, 2282, '3:74'), stat(806, 2282, '3:110'),
      stat(303, 2328, '3:75'), stat(806, 2328, '3:115'),
      stat(303, 2374, '3:80'), stat(806, 2374, '3:120'),
      stat(303, 2420, '3:85'), stat(806, 2420, '3:125'),
    ],
  }
  const chartSection = {
    id: '287:4',
    name: '中间图表',
    type: 'chart',
    figmaNodeId: '287:4',
    absoluteBoundingBox: { x: 561, y: 2267, width: 207, height: 207 },
    children: [],
  }

  test("chart 居中于 stats 两列空档 → 重组为 [left-stats, chart, right-stats]", () => {
    const out = reorganizeCenteredChartLayout([chartSection, statsSection])
    expect(out).toHaveLength(3)
    expect(out.map((s) => s.type)).toEqual(['stats', 'chart', 'stats'])
    expect(out[0].id).toBe('287:5-left')
    expect(out[1].id).toBe('287:4')
    expect(out[2].id).toBe('287:5-right')
    // 左列 4 项（交通事故列）、右列 4 项
    expect(out[0].children).toHaveLength(4)
    expect(out[2].children).toHaveLength(4)
    expect(out[0].children[0].id).toBe('3:74')
    expect(out[2].children[0].id).toBe('3:110')
    // 🛡️ figmaNodeId 唯一化：left/right 各用子列首项，防止 planner enrich 按 figmaNodeId
    //   回填时把两个 stats 都覆盖成原 stats 的 figmaNodeId（287:5）→ 左右列语义丢失。
    expect(out[0].figmaNodeId).toBe('3:74')
    expect(out[2].figmaNodeId).toBe('3:110')
    expect(out[0].figmaNodeId).not.toBe(out[2].figmaNodeId)
  })

  test("chart 不在两列空档（偏左）→ 原样返回", () => {
    const offChart = { ...chartSection, absoluteBoundingBox: { x: 200, y: 2267, width: 207, height: 207 } }
    const out = reorganizeCenteredChartLayout([offChart, statsSection])
    expect(out).toHaveLength(2)
    expect(out[0].id).toBe('287:4')
  })

  test("无 chart 或无 stats → 原样返回", () => {
    expect(reorganizeCenteredChartLayout([statsSection])).toHaveLength(1)
    expect(reorganizeCenteredChartLayout([])).toEqual([])
    expect(reorganizeCenteredChartLayout(null)).toBeNull()
  })

  test("stats 内部非两列 → 原样返回（不误拆）", () => {
    const singleColStats = {
      ...statsSection,
      children: [
        stat(303, 100, 'a'), stat(303, 132, 'b'),
        stat(303, 164, 'c'), stat(303, 196, 'd'),
      ],
    }
    const out = reorganizeCenteredChartLayout([chartSection, singleColStats])
    expect(out).toHaveLength(2)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// 🛡️ ⑤ chart 多真值豁免（2026-09-26 · 离线复现实锤）
// vision 会把「同一 Figma 容器下的多个不同图表」标成同一个 section；chartsTruth 分支
// 因此产出 N 条 sourceNodeIds 相同的 chart section，且 elementCount 全为 1（平局）
// → 原行为确定性只保留 1 条、丢掉 N-1 个图表（探针实测 bar/pie/line → 只剩 bar）。
// ══════════════════════════════════════════════════════════════════════════
describe('⑤ dedupeDuplicateSections：chart 多真值豁免', () => {
  const mkChart = (id: string, chartType: string, series: number, title?: string) => ({
    id, type: 'chart', chartType, elementCount: 1,
    title: title || '图表', sourceNodeIds: ['426:807'],
    chartSeries: Array.from({ length: series }, (_, i) => 's' + i),
  })

  it('两条 chart 共享 sourceNodeIds 但签名不同 → 都保留（不丢图表）', () => {
    const a = mkChart('chart-truth-0', 'bar', 2, '图表1')
    const b = mkChart('chart-truth-1', 'pie', 2, '图表2')
    const c = mkChart('chart-truth-2', 'line', 2, '图表3')
    const out = dedupeDuplicateSections([a, b, c])
    expect(out.filter((s: any) => s.type === 'chart')).toHaveLength(3)
  })

  it('签名完全相同 → 视为真重复，收敛为 1 条（收敛能力不丢）', () => {
    const a = mkChart('chart-truth-0', 'bar', 2, '图表')
    const b = mkChart('chart-truth-1', 'bar', 2, '图表')
    const out = dedupeDuplicateSections([a, b])
    expect(out.filter((s: any) => s.type === 'chart')).toHaveLength(1)
  })

  it('作用域收窄：chart ↔ 非 chart 共享 id → 维持原行为（elementCount 大者胜）', () => {
    const container = { id: '89:42', type: undefined as any, elementCount: 3, sourceNodeIds: ['89:42'] }
    const chart = { id: '89:38', type: 'chart', chartType: 'bar', elementCount: 23, sourceNodeIds: ['89:42'] }
    expect(dedupeDuplicateSections([container, chart])).toHaveLength(1)
    expect(dedupeDuplicateSections([chart, container])).toHaveLength(1)
  })
})

/**
 * 2026-09-29 判据修正：`describeRepeatedItemLayout` 的「重复单元」识别。
 * 事故（mc-max-1790667854851-5f5bce3a）：3 项列表项（icon 左 / 文字右）宽度随内容变化
 *   （141/120/140），旧判据「宽高各差 <8px」⇒ similar 只剩 2 ⇒ 无事实 ⇒ 产物竖排堆叠、数值被裁。
 * 修正：similar = 同高(<8px) + 宽度相近（相对差 ≤20%，或绝对差 <8px）。
 * 全语料审计：现状生效 1591 → 新增 94 例，父名 100% 为 Group 2136639043，零噪声。
 */
describe('buildSectionStyleFacts — 重复单元识别（2026-09-29 判据修正）', () => {
  const box = (x, y, w, h) => ({ x, y, width: w, height: h })
  const asText = (out) => (typeof out === 'string' ? out : JSON.stringify(out))

  // 单个列表项：bg(整块背景) + icon(左) + 文字组(右上) + 数值组(右下)
  const listItem = (id, name, x, w) => ({
    id, name, type: 'GROUP', absoluteBoundingBox: box(x, 984, w, 74),
    children: [
      { id: id + '-bg', name: 'bg', type: 'FRAME', absoluteBoundingBox: box(x, 984, w, 74) },
      { id: id + '-icon', name: 'icon', type: 'GROUP', absoluteBoundingBox: box(x + 4, 995, 48, 52) },
      {
        id: id + '-label', name: 'Group 2136638345', type: 'GROUP', absoluteBoundingBox: box(x + 52, 1000, 50, 18),
        children: [{ id: id + '-t1', name: 'label', type: 'TEXT', characters: '危化品车', absoluteBoundingBox: box(x + 52, 1000, 50, 18), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] }],
      },
      {
        id: id + '-value', name: 'Group 2136638342', type: 'GROUP', absoluteBoundingBox: box(x + 53, 1022, 39, 23),
        children: [{ id: id + '-t2', name: 'value', type: 'TEXT', characters: '51', absoluteBoundingBox: box(x + 53, 1022, 39, 23), style: { fontSize: 16 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] }],
      },
    ],
  })

  const listFg = (kids) => ({
    document: {
      id: 'root', name: 'cp', type: 'FRAME',
      children: [{
        id: '2:8023', name: 'Group 2136639043', type: 'GROUP', absoluteBoundingBox: box(37, 984, 378, 74),
        children: kids,
      }],
    },
  })

  it('⭐ 3 项列表、宽度随内容变化（141/120/140）→ 输出「重复单元×3 + 横向 flex + icon 左」', () => {
    const fg = listFg([
      listItem('136:127', '3', 274, 141),
      listItem('136:128', '2', 166, 120),
      listItem('136:129', '1', 37, 140),
    ])
    const txt = asText(buildSectionStyleFacts([{ id: 'list-section', figmaNodeId: '2:8023', name: 'list' }], fg))
    // 旧行为：宽差 21px > 8 ⇒ similar=2 ⇒ 完全无此事实 ❌
    expect(txt).toContain('重复单元×3')
    expect(txt).toContain('横向 flex')
    expect(txt).toContain('左侧 icon')
  })

  it('🛡️ 反例：sub-header（标题 204 + 按钮 86 + 按钮 67，同高同行但宽差 3 倍）→ 不输出重复单元事实', () => {
    // 「只判高度」的方案会在此新增 132 例误报；加「宽度相近」后全部排除。
    const mk = (id, name, x, w, h) => ({
      id, name, type: 'FRAME', absoluteBoundingBox: box(x, 733, w, h),
      children: [{ id: id + '-t', name: 't', type: 'TEXT', characters: 'x', absoluteBoundingBox: box(x, 733, w, h), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] }],
    })
    const fg = {
      document: {
        id: 'root', name: 'cp', type: 'FRAME',
        children: [{
          id: '2:3565', name: 'sub-header', type: 'FRAME', absoluteBoundingBox: box(36, 730, 378, 24),
          children: [mk('h1', 'title', 128, 204, 18), mk('h2', 'btn-active', 36, 86, 24), mk('h3', 'btn', 347, 67, 18)],
        }],
      },
    }
    const txt = asText(buildSectionStyleFacts([{ id: 'hdr', figmaNodeId: '2:3565', name: 'header' }], fg))
    expect(txt).not.toContain('重复单元×3（')
  })

  it('回归保护：4 个同尺寸子项（旧判据同样生效）→ 仍输出重复单元×4（新判据严格包含旧判据）', () => {
    // 数证：新宽判据 max(8, w0*0.2) ≥ 8 恒成立 ⇒ 旧判据命中的容器新判据必然命中，零回归。
    const fg = listFg([
      listItem('a', '1', 0, 120),
      listItem('b', '2', 120, 120),
      listItem('c', '3', 240, 120),
      listItem('d', '4', 360, 120),
    ])
    const txt = asText(buildSectionStyleFacts([{ id: 'list-section', figmaNodeId: '2:8023', name: 'list' }], fg))
    expect(txt).toContain('重复单元×4')
  })
})

/**
 * 2026-09-29 治本：**祖先「布局容器」的重复单元事实**。
 *
 * 事故（mc-max-1790669176199-94b3bc69）：planner 把重复单元容器 `2:8023` 标成
 *   `layoutSource='container-rebuild'`（`isLayoutContainerSection` 为真），`walkLeaves`
 *   对容器**穿透跳过** ⇒ `describeRepeatedItemLayout(2:8023)` 从不执行 ⇒ **零「重复单元」事实**；
 *   穿透后落地的 leaf 是**重复项原型**（`136:127-list`，itemCount=3），在单张卡身上
 *   `describeRepeatedItemLayout` 必然 null ⇒ LLM 只能按 DOM 序把 icon/label/value 竖排堆叠
 *   （产物 `.list-item{flex-direction:column}`，Figma 真值是 row）。
 *
 * 治本：给 leaf 的**祖先容器 section 根节点**补一次 `describeRepeatedItemLayout`（只跑这一条轨）。
 * 全语料审计（388 产物 / 同一口径）：新增 `重复单元×3` ×82 行、`重复单元×8` ×16 行，
 *   **删除布局事实 0、删除样式真值行 0**（纯增量）。
 */
describe('buildSectionStyleFacts — 祖先布局容器的重复单元事实（2026-09-29 治本）', () => {
  const box = (x, y, w, h) => ({ x, y, width: w, height: h })

  // 单个列表项：bg(整块背景) + icon(左) + 文字组(右上) + 数值组(右下)
  const listItem = (id, name, x, w, h = 74, y = 984) => ({
    id, name, type: 'GROUP', absoluteBoundingBox: box(x, y, w, h),
    children: [
      { id: id + '-bg', name: 'bg', type: 'FRAME', absoluteBoundingBox: box(x, y, w, h) },
      { id: id + '-icon', name: 'icon', type: 'GROUP', absoluteBoundingBox: box(x + 4, y + 11, 48, 52) },
      {
        id: id + '-label', name: 'Group 2136638345', type: 'GROUP', absoluteBoundingBox: box(x + 52, y + 16, 50, 18),
        children: [{ id: id + '-t1', name: 'label', type: 'TEXT', characters: '危化品车', absoluteBoundingBox: box(x + 52, y + 16, 50, 18), style: { fontSize: 12 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] }],
      },
      {
        id: id + '-value', name: 'Group 2136638342', type: 'GROUP', absoluteBoundingBox: box(x + 53, y + 38, 39, 23),
        children: [{ id: id + '-t2', name: 'value', type: 'TEXT', characters: '51', absoluteBoundingBox: box(x + 53, y + 38, 39, 23), style: { fontSize: 16 }, fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 1, b: 1 } }] }],
      },
    ],
  })

  // figma 树：136:121(slot) → 2:8023(Group) → N 个同尺寸子项
  const nestedFg = (items) => ({
    document: {
      id: 'root', name: 'cp', type: 'FRAME',
      children: [{
        id: '136:121', name: 'slot', type: 'FRAME', absoluteBoundingBox: box(37, 963, 377, 86),
        children: [{
          id: '2:8023', name: 'Group 2136639043', type: 'GROUP', absoluteBoundingBox: box(37, 984, 378, 74),
          children: items,
        }],
      }],
    },
  })

  // section 树（复刻真机形态）：容器(136:121) → 容器(2:8023) → leaf(136:127-list，重复项原型)
  const nestedSections = () => ([{
    id: '136:121', title: 'slot', type: 'container', isLayoutContainer: true, layoutSource: 'container-rebuild',
    children: [{
      id: '2:8023', title: 'Group 2136639043', type: 'container', isLayoutContainer: true, layoutSource: 'container-rebuild',
      children: [{ id: '136:127-list', title: '3', type: 'list', itemCount: 3, sourceNodeIds: ['136:127'] }],
    }],
  }])

  it('⭐ 重复单元容器被标为 container：仍产出「重复单元×3 + 单元之间横向并排」（真机 94b3bc69 形态）', () => {
    const fg = nestedFg([
      listItem('136:127', '3', 274, 141),
      listItem('136:128', '2', 166, 120),
      listItem('136:129', '1', 37, 140),
    ])
    const txt = String(buildSectionStyleFacts(nestedSections(), fg))
    // 修复前：walkLeaves 穿透容器 ⇒ 完全无「重复单元」事实 ⇒ LLM 把 icon/label/value 竖排堆叠
    expect(txt).toContain('重复单元×3')
    expect(txt).toContain('横向并排')
    expect(txt).toContain('横向 flex')
    expect(txt).toContain('左侧 icon')
  })

  it('🛡️ 纵向堆叠的 8 项统计表：必须判「纵向堆叠」而非「横向并排」', () => {
    const items = Array.from({ length: 8 }, (_, i) => listItem(`s${i}`, String(i), 100, 220, 32, 100 + i * 34))
    const fg = nestedFg(items)
    const sections = [{
      id: '136:121', title: 'slot', type: 'container', isLayoutContainer: true, layoutSource: 'container-rebuild',
      children: [{
        id: '2:8023', title: '统计数据', type: 'container', isLayoutContainer: true, layoutSource: 'container-rebuild',
        children: [{ id: 's0-list', title: '统计', type: 'list', itemCount: 8, sourceNodeIds: ['s0'] }],
      }],
    }]
    const txt = String(buildSectionStyleFacts(sections, fg))
    expect(txt).toContain('重复单元×8')
    expect(txt).toContain('纵向堆叠')
    expect(txt).not.toContain('重复单元×8（220×32）：8 个单元之间 **横向并排**')
  })

  it('🛡️ 容器祖先不是重复单元（只有 2 个子项）→ 不产出重复单元事实', () => {
    const fg = nestedFg([
      listItem('c1', 'A', 37, 180),
      listItem('c2', 'B', 220, 180),
    ])
    const txt = String(buildSectionStyleFacts(nestedSections(), fg))
    expect(txt).not.toContain('重复单元×')
  })
})

/**
 * 🎯 2026-09-30 治本：文案真值 = Figma TEXT 的 `characters`，不是图层名 `name`。
 *
 * 真机实锤 `c-traffic-monitor-6d7082a1`：section `2:3446`（当日总流量卡）子树的
 * 「客车」「货车」TEXT 节点**图层名是单字母 `t`**，真文案在 `characters`；而邻居
 * section `2:3496`（车型分布卡）的图层名**恰好就是文本本身**。旧实现只读 `name` ⇒
 * §2:3446 真值文本全丢 ⇒ 独占性守卫误判「§2:3446 借用了 §2:3496 的客车/货车」⇒
 * 自愈器把**本属于 §2:3446** 的文本从它自己的组件里删掉。
 */
describe('collectSubtreeTexts · 文案真值取 characters（2026-09-30 治本）', () => {
  const mk = (children: any[]) =>
    indexFigmaNodes({ id: 'root', name: 'root', type: 'FRAME', children })

  test('图层名是单字母 t/d，真文案在 characters → 取 characters', () => {
    const index = mk([
      { id: 's', name: 'card', type: 'FRAME', children: [
        { id: 'a', name: 't', type: 'TEXT', characters: '客车', absoluteBoundingBox: { x: 10, y: 0, width: 20, height: 10 } },
        { id: 'b', name: 'd', type: 'TEXT', characters: '22350', absoluteBoundingBox: { x: 40, y: 0, width: 30, height: 10 } },
      ] },
    ])
    expect(collectSubtreeTexts('s', index)).toEqual([
      { text: '客车', x: 10, y: 0, fontSize: null, fontWeight: null },
      { text: '22350', x: 40, y: 0, fontSize: null, fontWeight: null },
    ])
  })

  test('图层名带语义前缀、characters 才是真文案 → characters 优先', () => {
    const index = mk([
      { id: 's', name: 's', type: 'FRAME', children: [
        { id: 'a', name: 'but-节假日预测[m]', type: 'TEXT', characters: '节假日预测' },
      ] },
    ])
    expect(collectSubtreeTexts('s', index)).toEqual([
      { text: '节假日预测', x: null, y: null, fontSize: null, fontWeight: null },
    ])
  })

  test('无 characters（旧语料/非 TEXT）→ 回退图层名归一化，行为不变', () => {
    const index = mk([
      { id: 's', name: 's', type: 'FRAME', children: [
        { id: 'a', name: 't-设备监测', type: 'TEXT' },
        { id: 'b', name: 'd-28', type: 'TEXT' },
      ] },
    ])
    expect(collectSubtreeTexts('s', index)).toEqual([
      { text: '设备监测', x: null, y: null, fontSize: null, fontWeight: null },
      { text: '28', x: null, y: null, fontSize: null, fontWeight: null },
    ])
  })

  test('characters 为纯空白 → 回退图层名（不被空白顶掉）', () => {
    const index = mk([
      { id: 's', name: 's', type: 'FRAME', children: [
        { id: 'a', name: 't-标题', type: 'TEXT', characters: '   ' },
      ] },
    ])
    expect(collectSubtreeTexts('s', index)).toEqual([
      { text: '标题', x: null, y: null, fontSize: null, fontWeight: null },
    ])
  })

  test('🔴 命名无关：t-/d-/裸 t 图层名一律不参与角色判定（isTitle 已删除）', () => {
    const index = mk([
      { id: 's', name: 's', type: 'FRAME', children: [
        { id: 'a', name: 't-标题', type: 'TEXT', characters: '标题', style: { fontSize: 12 }, absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } },
        { id: 'b', name: 't', type: 'TEXT', characters: '客车', style: { fontSize: 24 }, absoluteBoundingBox: { x: 0, y: 20, width: 10, height: 10 } },
      ] },
    ])
    const r = collectSubtreeTexts('s', index)
    expect(r.every((i: any) => !('isTitle' in i))).toBe(true)
    // 两个都带 `t` 字样，角色仍按字号判定：大字号 = 数值
    expect(splitTitleValueByStyle(r)).toEqual({ title: '标题', value: '客车', by: 'style' })
  })

  test('splitTitleValueByStyle：字号并列 ⇒ 几何兜底（靠下=数值）；也分不出 ⇒ null（不臆造）', () => {
    const sameBoth = [
      { text: 'A', x: 0, y: 0, fontSize: 12, fontWeight: null },
      { text: 'B', x: 0, y: 30, fontSize: 12, fontWeight: null },
    ]
    expect(splitTitleValueByStyle(sameBoth)).toEqual({ title: 'A', value: 'B', by: 'geometry' })
    // 字号并列 + y 也相同 ⇒ 不可确定
    expect(
      splitTitleValueByStyle([
        { text: 'A', x: 0, y: 0, fontSize: 12, fontWeight: null },
        { text: 'B', x: 0, y: 0, fontSize: 12, fontWeight: null },
      ]),
    ).toBeNull()
    // 非「恰好 2 个文本」的形态一律 null
    expect(splitTitleValueByStyle([])).toBeNull()
    expect(splitTitleValueByStyle([sameBoth[0]])).toBeNull()
    expect(splitTitleValueByStyle([...sameBoth, { text: 'C', x: 0, y: 40, fontSize: 10, fontWeight: null }])).toBeNull()
  })

  test('两 section 的子树都含同一真文案（一靠 characters、一靠图层名）→ 双归属', () => {
    const index = mk([
      {
        id: 'a', name: 'card', type: 'FRAME', children: [
          { id: 'a1', name: 't', type: 'TEXT', characters: '客车' },
        ],
      },
      {
        id: 'b', name: 'card', type: 'FRAME', children: [
          { id: 'b1', name: '客车', type: 'TEXT', characters: '客车' },
        ],
      },
    ])
    expect(collectSubtreeTexts('a', index).map((i) => i.text)).toEqual(['客车'])
    expect(collectSubtreeTexts('b', index).map((i) => i.text)).toEqual(['客车'])
  })

  test('characters 为多行（含换行）→ 原样保留（仅去首尾空白）', () => {
    const index = mk([
      { id: 's', name: 's', type: 'FRAME', children: [
        { id: 'a', name: 't-x', type: 'TEXT', characters: ' 南北接线\n设备 ' },
      ] },
    ])
    expect(collectSubtreeTexts('s', index)[0].text).toBe('南北接线\n设备')
  })
})
