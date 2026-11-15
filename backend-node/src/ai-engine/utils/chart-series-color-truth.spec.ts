/**
 * 图表系列配色真值落地（2026-11-15 · mc-max-1794725297064-b532dc69 实锤）。
 *
 * 真机：`charts[].seriesColors` = ['#388dff','#18c02e']（实际流量/预测流量），
 *   但产物 series 里一个 color 都没有 ⇒ echarts 默认调色板 ⇒ 设计稿蓝+青双线
 *   变成「黄单线 + 灰填充」。本 spec 锁死「匹配才注入 / 有不覆盖 / 不猜色」三条边界。
 */
import {
  injectSeriesColorTruth,
  findSeriesBlock,
  extractSeriesNames,
} from './chart-series-color-truth.js';

const CHART = (seriesBody) => `<template>
  <div ref="c" class="c-fc-canvas"></div>
</template>
<script setup>
import * as echarts from 'echarts'
const buildOption = () => ({
  grid: { left: 36, right: 12, top: 22, bottom: 30 },
  xAxis: [{ type: 'category', data: ['-2h', '-1h', '0h'] }],
  yAxis: [{ type: 'value' }],
  series: [${seriesBody}]
})
const initChart = () => { chart = echarts.init(chartRef.value) }
</script>`;

const SERIES_2 = `
    { name: '实际流量', type: 'line', data: [1, 2, 3] },
    { name: '预测流量', type: 'line', data: [2, 3, 4] }`;

const CHARTS = [
  {
    section: '2:3565',
    series: ['实际流量', '预测流量'],
    seriesColors: ['#388dff', '#18c02e'],
  },
];

describe('findSeriesBlock / extractSeriesNames', () => {
  it('括号配对不被内层 data 数组截断', () => {
    const code = CHART(SERIES_2);
    const b = findSeriesBlock(code);
    expect(b).not.toBeNull();
    expect(b.text.startsWith('[')).toBe(true);
    expect(b.text.endsWith(']')).toBe(true);
    expect(b.text).toContain("'预测流量'");
  });

  it('按出现顺序抓系列名并去重', () => {
    const b = findSeriesBlock(CHART(SERIES_2));
    expect(extractSeriesNames(b.text)).toEqual(['实际流量', '预测流量']);
  });
});

describe('injectSeriesColorTruth', () => {
  it('系列名与 charts[].series 完全一致 ⇒ 注入 option.color', () => {
    const res = injectSeriesColorTruth(CHART(SERIES_2), { charts: CHARTS });
    expect(res.applied).toBe(true);
    expect(res.reason).toBe('injected');
    expect(res.colors).toEqual(['#388dff', '#18c02e']);
    expect(res.chartSection).toBe('2:3565');
    expect(res.code).toContain("color: ['#388dff', '#18c02e'],");
    // 注入位置必须在 series 之前（同层），且系列数据未被破坏
    expect(res.code.indexOf("color: ['#388dff'")).toBeLessThan(res.code.indexOf('series: ['));
    expect(res.code).toContain("data: [2, 3, 4]");
  });

  it('已有顶层 color 数组 ⇒ 不动（尊重作者显式配色）', () => {
    const code = CHART(SERIES_2).replace('series: [', "color: ['#ff0000'],\n  series: [");
    const res = injectSeriesColorTruth(code, { charts: CHARTS });
    expect(res.applied).toBe(false);
    expect(res.reason).toBe('already-colored');
  });

  it('series 项内已有 itemStyle ⇒ 不动', () => {
    const body = `
    { name: '实际流量', type: 'line', itemStyle: { color: '#111111' }, data: [1] },
    { name: '预测流量', type: 'line', data: [2] }`;
    const res = injectSeriesColorTruth(CHART(body), { charts: CHARTS });
    expect(res.applied).toBe(false);
    expect(res.reason).toBe('already-colored');
  });

  it('系列数不同 ⇒ 不猜（no-matching-chart）', () => {
    const body = `{ name: '实际流量', type: 'line', data: [1] }`;
    const res = injectSeriesColorTruth(CHART(body), { charts: CHARTS });
    expect(res.applied).toBe(false);
    expect(res.reason).toBe('no-matching-chart');
  });

  it('系列名不同 ⇒ 不把别的图的配色贴过来', () => {
    const body = `
    { name: '北京方向', type: 'bar', data: [1] },
    { name: '上海方向', type: 'bar', data: [2] }`;
    const res = injectSeriesColorTruth(CHART(body), { charts: CHARTS });
    expect(res.applied).toBe(false);
    expect(res.reason).toBe('no-matching-chart');
  });

  it('真值不是 hex（如 rgb()）⇒ 不猜（colors-not-hex）', () => {
    const charts = [
      { section: '2:3565', series: ['实际流量', '预测流量'], seriesColors: ['rgb(1,2,3)', '#18c02e'] },
    ];
    const res = injectSeriesColorTruth(CHART(SERIES_2), { charts });
    expect(res.applied).toBe(false);
    expect(res.reason).toBe('colors-not-hex');
  });

  it('非图表文件（无 echarts.init）⇒ not-a-chart', () => {
    const res = injectSeriesColorTruth('<template><div/></template>', { charts: CHARTS });
    expect(res.applied).toBe(false);
    expect(res.reason).toBe('not-a-chart');
  });

  it('幂等：注入后再跑 ⇒ already-colored（不重复插）', () => {
    const first = injectSeriesColorTruth(CHART(SERIES_2), { charts: CHARTS });
    const second = injectSeriesColorTruth(first.code, { charts: CHARTS });
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-colored');
    expect(second.code).toBe(first.code);
  });

  it('三系列时按顺序取前 N 个颜色', () => {
    const body = `
    { name: 'A', type: 'line', data: [1] },
    { name: 'B', type: 'line', data: [2] },
    { name: 'C', type: 'line', data: [3] }`;
    const charts = [{ section: 's', series: ['A', 'B', 'C'], seriesColors: ['#111111', '#222222', '#333333'] }];
    const res = injectSeriesColorTruth(CHART(body), { charts });
    expect(res.applied).toBe(true);
    expect(res.colors).toEqual(['#111111', '#222222', '#333333']);
  });
});
