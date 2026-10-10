/**
 * I9 图表 resize 自适应不变量 —— 单元测试
 *
 * 事故回归：产物 6a7599af6eb9eebf9fba56cd（mc-max-1787623728679-f7fed228）
 *   echarts.init 在 onMounted 内 nextTick 调用、无任何 resize 监听
 *   → 容器尺寸变化时图表不重绘；且在 1:1 保真预览下完全不可见。
 *
 * 判据纪律（同前端审计脚本踩过的坑，见下「阴性对照」两例）：
 *   分母必须是「真的创建了 chart 实例」，不能是「import 了 echarts」，
 *   也不能是「有 initCharts 函数名」——空实现伪图表会污染分母造成长期误报。
 */

import { runArtifactInvariants } from './artifact-invariants.js';

const withScript = (script: string) => `<template><div ref="c"/></template>\n<script setup>\n${script}\n</script>`;

/** 真实缺陷样本（按事故产物形态）：有 init、无 resize 监听 */
const BAD = withScript(`
import * as echarts from 'echarts'
const chartRef = ref(null)
let chart = null
onMounted(() => {
  nextTick(() => { if (chartRef.value) { chart = echarts.init(chartRef.value); chart.setOption({}) } })
})
onUnmounted(() => { chart?.dispose() })
`);

/** 正样本 1：ResizeObserver 形态 */
const GOOD_RO = withScript(`
import * as echarts from 'echarts'
const chartRef = ref(null)
let chart = null
onMounted(() => {
  chart = echarts.init(chartRef.value)
  const ro = new ResizeObserver(() => { chart && chart.resize() })
  ro.observe(chartRef.value)
})
`);

/** 正样本 2：window.resize 形态 */
const GOOD_WINDOW = withScript(`
import * as echarts from 'echarts'
const chartRef = ref(null)
let chart = null
onMounted(() => { chart = echarts.init(chartRef.value) })
window.addEventListener('resize', () => { chart && chart.resize() })
`);

/** 非分母样本：vue-echarts 组件形态（由组件内部处理自适应，不要求产物写监听） */
const GOOD_COMPONENT = `<template><VChart :option="opt"/></template>\n<script setup>\nimport VChart from 'vue-echarts'\n</script>`;

function i9(files: Record<string, string>) {
  return runArtifactInvariants(files).violations.filter((v) => v.id === 'I9');
}

describe('I9 图表 resize 自适应不变量', () => {
  it('检出：创建了 chart 实例但无任何 resize 监听（事故形态）', () => {
    const vs = i9({ 'package/index.vue': BAD });
    expect(vs.length).toBeGreaterThanOrEqual(1);
    expect(vs[0].severity).toBe('error');
    expect(vs[0].message).toContain('resize');
  });

  it('放行：ResizeObserver 形态', () => {
    expect(i9({ 'package/index.vue': GOOD_RO }).length).toBe(0);
  });

  it('放行：window.addEventListener("resize") 形态', () => {
    expect(i9({ 'package/index.vue': GOOD_WINDOW }).length).toBe(0);
  });

  it('放行：vue-echarts 组件形态不进分母（组件内部自行处理自适应）', () => {
    // ⚠️ 这不是「组件形态一定安全」，而是「I9 不扩大 CODE-012 的判据口径」：
    // CODE-012 的 AST 判据只认 4 类信号，不认组件形态；I9 复用同一判据，
    // 故也必须把组件形态排除，否则两者口径漂移、误伤面比门禁更大。
    expect(i9({ 'package/index.vue': GOOD_COMPONENT }).length).toBe(0);
  });

  // ── 阴性对照：这两例若被误报，说明分母口径错了 ──────────────
  it('阴性对照：只 import echarts、从未创建实例 → 不报', () => {
    const noChart = withScript(`
import * as echarts from 'echarts'
function initCharts() {
  // 当前设计稿无图表区域（视觉分析 charts 为空），无需初始化
  void echarts
}
`);
    expect(i9({ 'package/index.vue': noChart }).length).toBe(0);
  });

  it('阴性对照：有 initCharts 空实现 → 不报（函数名不是判据）', () => {
    const emptyImpl = withScript(`
function initCharts() {
  // 当前设计稿无图表区域，无需初始化
}
function handleResize() {
  // 当前设计稿无图表区域，无需重绘
}
`);
    expect(i9({ 'package/index.vue': emptyImpl }).length).toBe(0);
  });

  it('阴性对照：非 .vue 文件不参与判定', () => {
    expect(i9({ 'package/helper.js': 'chart = echarts.init(node)' }).length).toBe(0);
  });

  it('无 script 段的产物不误杀', () => {
    expect(i9({ 'package/index.vue': '<template><div>echarts</div></template>' }).length).toBe(0);
  });

  it('I9 违规会让 passed 变 false', () => {
    const r = runArtifactInvariants({ 'package/index.vue': BAD });
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('I9');
  });

  it('阳性对照：判据确实能抓真实缺陷（注入 remove 即须报错）', () => {
    // 从正样本抽掉 resize 监听 → 必须变 I9 违规
    const stripped = GOOD_WINDOW.replace(/window\.addEventListener[\s\S]*?\n/, '');
    expect(stripped).not.toContain('addEventListener');
    expect(i9({ 'package/index.vue': stripped }).length).toBeGreaterThanOrEqual(1);
  });
});
