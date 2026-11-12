/**
 * 根治⑨ chart-mount-healer spec（2026-11-12 · mc-max-1794478507437-9abc87d3 实锤钉）
 *
 * 判据与 do-not-invent-validator#detectEchartsMountPointMissing 逐字同口径：
 * init 提取 `echarts.init(X[.value])` 简单标识符；挂载判定 `ref\s*=\s*["']X["']`。
 */
import { healChartMountPoints } from '../chart-mount-healer.js';

/** 9abc87d3 真实病灶形态（ChartChart2.vue 缩样）：script 完整、template 无 ref 挂载 */
const BROKEN_9ABC = `<template>
  <div class="c-traffic-monitor-chart" data-section-id="chart-246:31">
    <div class="c-traffic-monitor-chart-ring-wrap">
      <div class="c-traffic-monitor-chart-ring c-traffic-monitor-chart-ring--outer"></div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import * as echarts from 'echarts'

const chartRef = ref(null)

const initChart = () => {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
}
</script>
`;

describe('healChartMountPoints（根治⑨：echarts 挂载点缺失自愈）', () => {
  test('① 9abc87d3 真实形态：注入 ref 挂载 div 到根元素闭合前', () => {
    const r = healChartMountPoints(BROKEN_9ABC);
    expect(r.healed).toBe(true);
    expect(r.fixes).toEqual([{ refName: 'chartRef' }]);
    expect(r.content).toMatch(/ref=["']chartRef["']/);
    // 注入位置：根元素 </div> 之前（ring-wrap 之后仍是根子级）
    const inner = r.content.slice(
      r.content.indexOf('<template>') + 10,
      r.content.lastIndexOf('</template>'),
    );
    const rootClose = inner.lastIndexOf('</div>');
    expect(inner.indexOf('ref="chartRef"')).toBeGreaterThan(-1);
    expect(inner.indexOf('ref="chartRef"')).toBeLessThan(rootClose);
  });

  test('② 注入后满足门禁口径：ref\\s*=\\s*["\']chartRef["\'] 命中 template', () => {
    const r = healChartMountPoints(BROKEN_9ABC);
    const inner = r.content.slice(
      r.content.indexOf('<template>') + 10,
      r.content.lastIndexOf('</template>'),
    );
    expect(new RegExp('ref\\s*=\\s*["\']chartRef["\']').test(inner)).toBe(true);
  });

  test('③ 幂等：修过的内容再跑零改动', () => {
    const once = healChartMountPoints(BROKEN_9ABC).content;
    const twice = healChartMountPoints(once);
    expect(twice.healed).toBe(false);
    expect(twice.fixes).toEqual([]);
    expect(twice.content).toBe(once);
  });

  test('④ 阴性：挂载点已存在的健康文件零改动', () => {
    const healthy = BROKEN_9ABC.replace(
      '<div class="c-traffic-monitor-chart-ring-wrap">',
      '<div ref="chartRef" class="c-traffic-monitor-chart-ring-wrap">',
    );
    const r = healChartMountPoints(healthy);
    expect(r.healed).toBe(false);
    expect(r.content).toBe(healthy);
  });

  test('⑤ 阴性：无 echarts 的文件零改动', () => {
    const plain = BROKEN_9ABC.replace(/echarts[^]*$/, '</script>\n');
    const r = healChartMountPoints(plain);
    expect(r.healed).toBe(false);
    expect(r.content).toBe(plain);
  });

  test('⑥ 多 init ref 全部补齐', () => {
    const two = BROKEN_9ABC.replace(
      'const chartRef = ref(null)',
      'const chartRef = ref(null)\nconst pieRef = ref(null)',
    ).replace('echarts.init(chartRef.value)', 'echarts.init(chartRef.value); echarts.init(pieRef.value)');
    const r = healChartMountPoints(two);
    expect(r.healed).toBe(true);
    expect(r.fixes.map((f) => f.refName).sort()).toEqual(['chartRef', 'pieRef']);
    expect(r.content).toMatch(/ref=["']pieRef["']/);
  });

  test('⑦ echarts.init(this.$refs.x) 非简单标识符不误注入', () => {
    const domRef = BROKEN_9ABC.replace(
      'echarts.init(chartRef.value)',
      'echarts.init(this.$refs.chartBox)',
    );
    const r = healChartMountPoints(domRef);
    // init 提取不到简单标识符 ⇒ 零改动（与门禁口径一致：跳过）
    expect(r.healed).toBe(false);
  });

  test('⑧ 畸形模板（根闭合扫不到）宁可不修', () => {
    const broken = `<template>
  <div class="root">
    <span>未闭合
</template>

<script setup>
import * as echarts from 'echarts'
const chartRef = ref(null)
echarts.init(chartRef.value)
</script>
`;
    const r = healChartMountPoints(broken);
    // 未闭合标签让深度扫描无法配对 ⇒ 零改动（自愈不是依赖，不可改坏）
    expect(r.content).toBe(broken);
  });

  test('⑨ 根元素自闭合时插在其后', () => {
    const selfClose = `<template>
  <div class="root" data-x="1" />
</template>

<script setup>
import * as echarts from 'echarts'
const chartRef = ref(null)
echarts.init(chartRef.value)
</script>
`;
    const r = healChartMountPoints(selfClose);
    expect(r.healed).toBe(true);
    const inner = r.content.slice(
      r.content.indexOf('<template>') + 10,
      r.content.lastIndexOf('</template>'),
    );
    expect(inner.indexOf('ref="chartRef"')).toBeGreaterThan(inner.indexOf('data-x'));
  });

  test('⑩ 注入 div 携带尺寸兜底样式（width:100%;min-height:120px）', () => {
    const r = healChartMountPoints(BROKEN_9ABC);
    expect(r.content).toContain('style="width:100%;min-height:120px;"');
  });

  test('⑪ 无 <template> 块返回原内容', () => {
    const noTpl = `<script setup>
import * as echarts from 'echarts'
const chartRef = ref(null)
echarts.init(chartRef.value)
</script>
`;
    const r = healChartMountPoints(noTpl);
    expect(r.healed).toBe(false);
    expect(r.content).toBe(noTpl);
  });
});
