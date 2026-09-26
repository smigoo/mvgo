import {
  detectChartSignal,
  injectChartSectionIfMissing,
} from './chart-section.js';
import { collectLeafSections } from './section-tree.js';

/**
 * 图表 section 兜底注入（2026-09-16 扩展，c-d7334a-d7334a67 实锤）。
 * 验证「vision 顶层 charts[] 有真值但 Figma 节点无 @echarts 标记」时也能触发注入。
 */

describe('detectChartSignal：charts[] 真值也作为信号（2026-09-16 扩展）', () => {
  it('charts[] 有真值 → true（无需 @echarts 标记）', () => {
    expect(detectChartSignal({ charts: [{ type: 'doughnut', series: ['A', 'B'] }] })).toBe(true);
  });
  it('figmaNodeData 有 @echarts 标记 → true（原信号）', () => {
    const figmaNodeData = { name: 'root', children: [{ name: '@echarts/pie', id: '1:1' }] };
    expect(detectChartSignal({ figmaNodeData })).toBe(true);
  });
  it('两者皆空 → false', () => {
    expect(detectChartSignal({})).toBe(false);
    expect(detectChartSignal({ charts: [], figmaNodeData: { name: 'root', children: [] } })).toBe(false);
  });
});

describe('injectChartSectionIfMissing：charts 真值兜底注入', () => {
  const doughnutTruth = [
    {
      section: '2:200',
      type: 'doughnut',
      series: ['交通事故', '车辆故障', '施工养护', '恶劣天气'],
      legend: [],
      seriesColors: ['#ff6262', '#f8bd1f', '#06acd3', '#13cad1'],
    },
  ];

  it('charts 有真值但 effectiveSections 无 chart section → 注入（chartType 归一化 doughnut→pie）', () => {
    const plan = { effectiveSections: [{ id: 's1', type: 'header' }], isForced: false };
    const out = injectChartSectionIfMissing(plan, true, { charts: doughnutTruth });
    expect(out).not.toBe(plan);
    const chart = out.effectiveSections.find((s) => s.type === 'chart');
    expect(chart).toBeTruthy();
    expect(chart.chartType).toBe('pie');
    expect(chart.chartSeries).toEqual(['交通事故', '车辆故障', '施工养护', '恶劣天气']);
    expect(chart.chartColors).toEqual(['#ff6262', '#f8bd1f', '#06acd3', '#13cad1']);
  });

  it('已有 chart section 时不重复注入', () => {
    const plan = {
      effectiveSections: [
        { id: 's1', type: 'header' },
        { id: 'chart-1', type: 'chart', chartType: 'pie' },
      ],
      isForced: false,
    };
    const out = injectChartSectionIfMissing(plan, true, { charts: doughnutTruth });
    expect(out).toBe(plan);
  });

  it('chartSignal=false 时不注入', () => {
    const plan = { effectiveSections: [{ id: 's1', type: 'header' }] };
    const out = injectChartSectionIfMissing(plan, false, { charts: doughnutTruth });
    expect(out).toBe(plan);
  });

  it('@echarts 标记节点兜底仍生效（原逻辑不回退）', () => {
    const figmaNodeData = {
      name: 'root',
      children: [{ name: '@echarts/pie', id: '1:9', absoluteBoundingBox: { y: 10, height: 200 } }],
    };
    const plan = { effectiveSections: [{ id: 's1', type: 'header' }], isForced: false };
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData });
    const chart = out.effectiveSections.find((s) => s.type === 'chart');
    expect(chart).toBeTruthy();
    expect(chart.sourceNodeIds).toEqual(['1:9']);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 🛡️ 消重（2026-09-26 · mc-max-1790430725365-1652d1b7 / mc-max-1790420477334 实锤）
// @echarts 节点已以「同 id 的容器 section」存在于树中 → 必须**就地替换**，
// 否则同一图表区被产成两个 echarts 组件（2 个图表），且注入项被追加到根 → tabs 比例被压扁。
// ══════════════════════════════════════════════════════════════════════════
describe('injectChartSectionIfMissing：@echarts 节点已存在于树中 → 就地替换（消重）', () => {
  // 真机树形（env-monitor，node 2:7879）：89:41 > [89:42(tabs 条), 2:7898(@echarts/line > 2:7899)]
  const envFigma = () => ({
    name: 'root', id: '2:7879',
    children: [
      {
        name: 'con', id: '89:41', absoluteBoundingBox: { x: 0, y: 880, width: 400, height: 145 },
        children: [
          {
            name: 'sub-t', id: '89:42', absoluteBoundingBox: { x: 0, y: 898, width: 400, height: 32 },
            children: [{ name: 'tabs-icon', id: '89:43', absoluteBoundingBox: { x: 0, y: 898, width: 40, height: 32 }, children: [] }],
          },
          {
            name: '@echarts/line', id: '2:7898', absoluteBoundingBox: { x: 0, y: 930, width: 400, height: 113 },
            children: [{ name: 'Group 2136637691', id: '2:7899', absoluteBoundingBox: { x: 0, y: 930, width: 400, height: 113 }, children: [] }],
          },
        ],
      },
    ],
  })

  const envPlan = () => ({
    isForced: true,
    effectiveSections: [
      {
        id: '89:41', type: 'container', isLayoutContainer: true, layout: 'vertical',
        title: 'con', sourceNodeIds: [],
        children: [
          {
            id: '89:42', type: 'container', isLayoutContainer: true, layout: 'horizontal',
            title: 'sub-t', sourceNodeIds: [],
            children: [{ id: '89:43', type: 'tabs', title: 'tabs-icon', elementCount: 8, sourceNodeIds: ['89:43'] }],
          },
          {
            id: '2:7898', type: 'container', isLayoutContainer: true, layout: 'horizontal',
            title: '@echarts/line', sourceNodeIds: [],
            children: [{ id: '2:7899', type: 'undefined', title: 'Group 2136637691', elementCount: 35, sourceNodeIds: ['2:7899'] }],
          },
        ],
      },
    ],
  })

  it('同 id 容器存在 → 就地替换（唯一的 chart leaf 落在 89:41 内、89:42 之后），不追加到根', () => {
    const plan = envPlan()
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData: envFigma() })

    const charts = collectLeafSections(out.effectiveSections).filter((s) => s.type === 'chart')
    expect(charts).toHaveLength(1)
    expect(charts[0].id).toBe('chart-2:7898')

    // 位置：仍在 89:41 内，且排在 89:42（tabs 条）之后 → tabs 在前，比例 32:113 不失真
    const root89 = out.effectiveSections[0]
    expect(root89.id).toBe('89:41')
    expect(root89.children.map((c) => c.id)).toEqual(['89:42', 'chart-2:7898'])
    // 被替换掉的通用叶子不再存在（否则会产出第二个 echarts 组件）
    expect(collectLeafSections(out.effectiveSections).some((s) => s.id === '2:7899')).toBe(false)
    // 原计划对象未被污染
    expect(plan.effectiveSections[0].children).toHaveLength(2)
  })

  it('@echarts 节点不在树中（vision 真造）→ 维持旧的根级追加（零回归）', () => {
    const plan = { effectiveSections: [{ id: 's1', type: 'header' }], isForced: false }
    const out = injectChartSectionIfMissing(plan, true, {
      figmaNodeData: { name: 'root', children: [{ name: '@echarts/pie', id: '9:9', children: [] }] },
    })
    expect(out.effectiveSections.map((s) => s.id)).toEqual(['s1', 'chart-9:9'])
  })
})

// ──────────────────────────────────────────────────────────────────────────
// 🛡️ 宿主语义守卫（2026-09-26 · 全语料审计结论固化）
// @echarts 分支 68 例撞 id 的宿主 100% 是图表容器 → 就地替换安全；
// 但 chartsTruth 分支的 sourceNodeIds[0] 来自 vision 复用的 c.section（不唯一），
// 若撞上真实**非图表** section，无校验的替换会连带删掉其子树 → 必须守卫。
// ──────────────────────────────────────────────────────────────────────────
describe('injectChartSectionIfMissing：宿主语义守卫（防误删真实内容）', () => {
  it('宿主 id 撞车但语义非图表 → 不替换，改为根级追加，原子树不丢', () => {
    const plan = {
      isForced: false,
      effectiveSections: [
        {
          id: '426:807', type: 'container', isLayoutContainer: true, layout: 'vertical',
          title: 'con', sourceNodeIds: [],
          children: [{ id: 'x1', type: 'stats', title: '统计数据', elementCount: 3, sourceNodeIds: ['x1'] }],
        },
      ],
    };
    // vision 复用了同一个 id（真机形态：同节点可承载多个不同图表）
    const figma = { name: 'root', children: [{ name: '@echarts/line', id: '426:807', children: [] }] };
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData: figma, charts: [] });
    expect(out.effectiveSections.map((s) => s.id)).toEqual(['426:807', 'chart-426:807']);
    // 原容器及其子树完好
    expect(collectLeafSections(out.effectiveSections).some((s) => s.id === 'x1')).toBe(true);
  });

  it('宿主语义是图表 → 仍就地替换（审计已证 68/68 安全，行为不回退）', () => {
    const plan = {
      isForced: false,
      effectiveSections: [
        {
          id: '2:7898', type: 'container', isLayoutContainer: true, layout: 'horizontal',
          title: '@echarts/line', sourceNodeIds: [],
          children: [{ id: '2:7899', type: 'content', title: 'Group', elementCount: 35, sourceNodeIds: ['2:7899'] }],
        },
      ],
    };
    const figma = { name: 'root', children: [{ name: '@echarts/line', id: '2:7898', children: [] }] };
    const out = injectChartSectionIfMissing(plan, true, { figmaNodeData: figma, charts: [] });
    expect(out.effectiveSections.map((s) => s.id)).toEqual(['chart-2:7898']);
  });
});
