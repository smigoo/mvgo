/**
 * 图表 resize 自愈器 —— 单元测试
 *
 * 事故回归：产物 6a7599af6eb9eebf9fba56cd（mc-max-1787623728679-f7fed228）
 *   echarts.init 在 onMounted 内 nextTick、无任何 resize 监听 ⇒ 图表不跟随尺寸变化。
 *
 * 设计要点（每条都对应一个真实踩过的坑）：
 *   1. **幂等**：已有 resize 处理必须 no-op，否则重复注入会叠加多个 observer。
 *   2. **fail-open**：找不到锚点/变量名一律返回原文，绝不盲注入（宁可漏修不可注入坏代码）。
 *   3. **.value 而非 ref 本身**：setup 内`chartRef` 是 ref 对象，
 *      observe(ref) 观察不到尺寸变化，必须 observe(ref.value)。
 *   4. **observe 延后到 onMounted+nextTick**：setup 顶层同步执行时 ref.value 仍为 null。
 *   5. **断开 observer**：不 disconnect 会在组件卸载后泄漏监听。
 */

import { healChartResizeListener } from './chart-resize-healer.js';
import { runArtifactInvariants } from './artifact-invariants.js';

const wrap = (s: string) => `<template><div ref="chartRef"/></template>\n<script setup>\n${s}\n</script>`;

/** 事故产物形态：nextTick 内 init、无监听 */
const BAD = wrap(`
import * as echarts from 'echarts'
const chartRef = ref(null)
let chart = null
onMounted(() => {
  nextTick(() => { if (chartRef.value) { chart = echarts.init(chartRef.value); chart.setOption({}) } })
})
onUnmounted(() => { chart?.dispose() })
`);

describe('chart-resize-healer 图表 resize 自愈器', () => {
  it('注入 ResizeObserver 绑定（事故形态）', () => {
    const r = healChartResizeListener(BAD);
    expect(r.injected).toBe(true);
    expect(r.reason).toBe('injected-resize-observer');
    expect(r.detail).toEqual({ chartVar: 'chart', refName: 'chartRef' });
  });

  it('注入后 I9 违规消失、passed 恢复 true', () => {
    const healed = healChartResizeListener(BAD).content;
    const r = runArtifactInvariants({ 'package/index.vue': healed });
    expect(r.violations.filter((v) => v.id === 'I9')).toHaveLength(0);
    expect(r.passed).toBe(true);
  });

  // ── 设计要点 3/4/5：注入代码的正确性 ────────────────────────
  it('observe 的是 ref.value 而不是 ref 本身', () => {
    const out = healChartResizeListener(BAD).content;
    expect(out).toContain('observe(chartRef.value)');
    // 不可出现 observe(chartRef) 裸 ref
    expect(out).not.toMatch(/observe\(chartRef\)/);
  });

  it('observe 延后到 onMounted + nextTick（setup 顶层 ref.value 仍为 null）', () => {
    const out = healChartResizeListener(BAD).content;
    expect(out).toMatch(/onMounted\(\(\) => nextTick\(/);
  });

  it('卸载时断开 observer（防监听泄漏）', () => {
    const out = healChartResizeListener(BAD).content;
    expect(out).toContain('ResizeObserver.disconnect()');
  });

  it('调用的是 chart.resize()（不是只观察不重绘）', () => {
    const out = healChartResizeListener(BAD).content;
    expect(out).toContain('chart && chart.resize()');
  });

  // ── 幂等 ────────────────────────────────────────────────────
  it('幂等：二次调用 no-op', () => {
    const once = healChartResizeListener(BAD).content;
    const twice = healChartResizeListener(once);
    expect(twice.injected).toBe(false);
    expect(twice.reason).toBe('already-has-resize-listener');
    expect(twice.content).toBe(once);
  });

  it('已有 ResizeObserver 的产物不动手', () => {
    const hasRO = wrap(`
import * as echarts from 'echarts'
const chartRef = ref(null)
let chart = null
onMounted(() => {
  chart = echarts.init(chartRef.value)
  const ro = new ResizeObserver(() => chart.resize())
  ro.observe(chartRef.value)
})
onUnmounted(() => { chart?.dispose() })
`);
    const r = healChartResizeListener(hasRO);
    expect(r.injected).toBe(false);
    expect(r.content).toBe(hasRO);
  });

  it('已有 window resize 监听的产物不动手', () => {
    const hasWin = wrap(`
import * as echarts from 'echarts'
const chartRef = ref(null)
let chart = null
onMounted(() => { chart = echarts.init(chartRef.value) })
window.addEventListener('resize', () => chart.resize())
onUnmounted(() => { chart?.dispose() })
`);
    expect(healChartResizeListener(hasWin).injected).toBe(false);
  });

  // ── fail-open：任何不确定都不动手 ───────────────────────────
  it('fail-open：无 echarts.init 不动手', () => {
    const noChart = wrap(`const a = ref(null)`);
    const r = healChartResizeListener(noChart);
    expect(r.injected).toBe(false);
    expect(r.reason).toBe('no-chart-instance');
    expect(r.content).toBe(noChart);
  });

  it('fail-open：无 onUnmounted 锚点不动手（不盲注入）', () => {
    const noAnchor = wrap(`
import * as echarts from 'echarts'
const chartRef = ref(null)
let chart = null
onMounted(() => { chart = echarts.init(chartRef.value) })
`);
    const r = healChartResizeListener(noAnchor);
    expect(r.injected).toBe(false);
    expect(r.reason).toBe('no-onunmounted-anchor');
    expect(r.content).toBe(noAnchor);
  });

  it('fail-open：空内容 / 非字符串不抛异常', () => {
    expect(healChartResizeListener('').injected).toBe(false);
    expect(healChartResizeListener(null as any).injected).toBe(false);
    expect(healChartResizeListener(undefined as any).injected).toBe(false);
  });

  it('fail-open：无 script 段不动手', () => {
    const tpl = '<template><div>echarts.init(x)</div></template>';
    expect(healChartResizeListener(tpl).injected).toBe(false);
  });

  // ── 阴性对照：不该被改的都不改 ──────────────────────────────
  it('阴性对照：initCharts 空实现伪图表不动手', () => {
    const fake = wrap(`
function initCharts() {
  // 当前设计稿无图表区域，无需初始化
}
`);
    const r = healChartResizeListener(fake);
    expect(r.injected).toBe(false);
    expect(r.content).toBe(fake);
  });

  it('阴性对照：只 import echarts 但从未 init 不动手', () => {
    const onlyImport = wrap(`
import * as echarts from 'echarts'
void echarts
`);
    expect(healChartResizeListener(onlyImport).injected).toBe(false);
  });

  it('阴性对照：非 .vue 内容不受影响', () => {
    const js = 'chart = echarts.init(node); /* onUnmounted(()=>{}) */';
    expect(healChartResizeListener(js).injected).toBe(false);
  });

  // ── 阳性对照：判据真的能抓（从合规样本里抽掉监听必须触发修复）──
  it('阳性对照：从合规样本抽掉监听 → 必须触发修复', () => {
    const compliant = healChartResizeListener(BAD).content;
    // 人为回退成缺陷态（去掉 observer 定义与 observe 调用）
    const broken = compliant
      .replace(/const chartResizeObserver[\s\S]*?\n/, '')
      .replace(/onMounted\(\(\) => nextTick\([\s\S]*?\)\)\n/, '')
      .replace(/onUnmounted\(\(\) => chartResizeObserver\.disconnect\(\)\)\n/, '');
    expect(broken).not.toContain('ResizeObserver');

    const r = healChartResizeListener(broken);
    expect(r.injected).toBe(true);

    // 修复后必须重新合规
    const after = runArtifactInvariants({ 'package/index.vue': r.content });
    expect(after.violations.filter((v) => v.id === 'I9')).toHaveLength(0);
  });
});
