import {
  detectChartSignal,
  injectChartSectionIfMissing,
} from './chart-section.js';

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
