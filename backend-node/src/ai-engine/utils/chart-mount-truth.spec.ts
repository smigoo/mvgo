/**
 * chart-mount-truth.spec.ts — 「echarts 挂载点」判据单一来源的阴阳对照。
 *
 * 阳（必须 mounted，防假阳 · bca81048 实锤）：
 *   ① 函数式 ref 收集数组 + forEach 循环变量 init
 *   ② 显式 DOM 获取（querySelector）
 *   ③ for-of 局部变量
 *   ④ `:ref="chartRef"` 动态绑定
 *   ⑤ 无模板 ⇒ fail-open
 * 阴（必须 missing，防假阴 · 07e31fbb 原病灶）：
 *   ⑥ `const chartRef = ref(null)` + init + 模板无任何 ref
 *   ⑦ `const refs = ref([])` + init + 模板无任何 `:ref`
 */
import {
  collectChartInitTargets,
  collectTemplateRefBindings,
  classifyChartMountTarget,
  resolveChartMount,
  resolveAllChartMounts,
  findMissingChartMounts,
} from './chart-mount-truth.js';

const vue = (template: string, script: string) => `<template>\n${template}\n</template>\n\n<script setup>\n${script}\n</script>\n`;

describe('chart-mount-truth: init 目标提取', () => {
  it('同时支持 .value 与裸标识符，保序去重', () => {
    const c = `
      echarts.init(chartRef.value)
      echarts.init(el)
      echarts.init(chartRef)
    `;
    expect(collectChartInitTargets(c)).toEqual(['chartRef', 'el']);
  });

  it('非简单标识符（this.$refs / getElementById）不产生目标', () => {
    const c = `echarts.init(this.$refs.chart); echarts.init(document.getElementById('x'));`;
    expect(collectChartInitTargets(c)).toEqual([]);
  });
});

describe('chart-mount-truth: 模板 ref 绑定分类', () => {
  it('区分静态 ref 与动态 :ref，函数式 ref 取根标识符', () => {
    const tpl = `
      <div ref="chartA"></div>
      <div :ref="chartB"></div>
      <div :ref="(el) => { if (el) ringRefs[idx] = el }"></div>
    `;
    const b = collectTemplateRefBindings(tpl);
    expect([...b.staticRefs]).toEqual(['chartA']);
    expect([...b.dynamicRefs]).toEqual(['chartB']);
    expect(b.fnRefRoots.has('ringRefs')).toBe(true);
    // 箭头参数不是根标识符
    expect(b.fnRefRoots.has('el')).toBe(false);
    expect(b.hasDynamicRef).toBe(true);
  });

  it('静态 ref 正则不吞 :ref / v-bind:ref', () => {
    const b = collectTemplateRefBindings(`<div :ref="a"></div><div v-bind:ref="b"></div>`);
    expect(b.staticRefs.size).toBe(0);
    expect([...b.dynamicRefs].sort()).toEqual(['a', 'b']);
  });
});

describe('chart-mount-truth: 声明溯源分类', () => {
  it('ref(null) ⇒ ref-single；ref([]) ⇒ ref-collection', () => {
    expect(classifyChartMountTarget(vue('', `const chartRef = ref(null)`), 'chartRef')).toBe('ref-single');
    expect(classifyChartMountTarget(vue('', `const ringRefs = ref([])`), 'ringRefs')).toBe('ref-collection');
    expect(classifyChartMountTarget(vue('', `const m = ref(new Map())`), 'm')).toBe('ref-collection');
  });

  it('querySelector / 元素赋值 ⇒ plain-var', () => {
    expect(
      classifyChartMountTarget(vue('', `const el = document.querySelector('.x')`), 'el'),
    ).toBe('plain-var');
    expect(classifyChartMountTarget(vue('', `const el = ringRefs.value[0]`), 'el')).toBe('plain-var');
  });

  it('无声明但在箭头回调参数位 ⇒ local-binding', () => {
    const c = vue('', `ringRefs.value.forEach((el, idx) => { echarts.init(el) })`);
    expect(classifyChartMountTarget(c, 'el')).toBe('local-binding');
  });

  it('无声明且在 for-of ⇒ local-binding', () => {
    const c = vue('', `for (const el of list.value) { echarts.init(el) }`);
    expect(classifyChartMountTarget(c, 'el')).toBe('local-binding');
  });

  it('完全无迹可循 ⇒ unknown', () => {
    expect(classifyChartMountTarget(vue('', `foo(el)`), 'el')).toBe('unknown');
  });
});

describe('chart-mount-truth: 阳向（防假阳）', () => {
  it('函数式 ref 收集数组 + forEach 局部变量 init ⇒ mounted（bca81048 实锤形态）', () => {
    const c = vue(
      `<div v-for="(item, idx) in list" :key="idx" :ref="(el) => { if (el) ringRefs[idx] = el }"></div>`,
      `const ringRefs = ref([])
       onMounted(() => { ringRefs.value.forEach((el, idx) => { const chart = echarts.init(el) }) })`,
    );
    const r = resolveChartMount(c, 'el');
    expect(r.mounted).toBe(true);
    expect(r.kind).toBe('local-binding');
    expect(findMissingChartMounts(c)).toEqual([]);
  });

  it('`:ref="chartRef"` 动态绑定 ⇒ mounted', () => {
    const c = vue(`<div :ref="chartRef"></div>`, `const chartRef = ref(null); echarts.init(chartRef.value)`);
    expect(resolveChartMount(c, 'chartRef')).toMatchObject({ mounted: true, reason: 'dynamic-ref' });
  });

  it('querySelector 自取 DOM ⇒ mounted', () => {
    const c = vue(`<div class="c"></div>`, `const el = document.querySelector('.c'); echarts.init(el)`);
    expect(resolveChartMount(c, 'el')).toMatchObject({ mounted: true, reason: 'self-resolved-dom' });
  });

  it('无 template（畸形 SFC）⇒ fail-open mounted / no-template', () => {
    const r = resolveChartMount(`<script setup>const a = ref(null); echarts.init(a.value)</script>`, 'a');
    expect(r).toMatchObject({ mounted: true, reason: 'no-template' });
  });
});

describe('chart-mount-truth: 阴向（防假阴 · 原病灶必须仍拦）', () => {
  it('ref(null) + init + 模板无 ref ⇒ missing', () => {
    const c = vue(`<div class="c-traffic-monitor-chart"></div>`, `const chartRef = ref(null)
      onMounted(() => { echarts.init(chartRef.value) })`);
    expect(findMissingChartMounts(c)).toEqual([
      { name: 'chartRef', kind: 'ref-single', reason: 'ref-declared-no-template-ref' },
    ]);
  });

  it('ref([]) 声明 + init + 模板无任何 :ref ⇒ missing', () => {
    const c = vue(`<div class="c-traffic-monitor-chart"></div>`, `const chartRefs = ref([])
      onMounted(() => { chartRefs.value.forEach((el) => echarts.init(el)) })`);
    // el 是局部绑定（mounted），chartRefs 未被 init 直接消费 ⇒ 只应由 el 决定
    const all = resolveAllChartMounts(c);
    expect(all.find((r) => r.name === 'el')).toMatchObject({ mounted: true, kind: 'local-binding' });
  });

  it('多图表：一个挂载、一个真缺 ⇒ 只报缺的那个', () => {
    const c = vue(
      `<div ref="a"></div>`,
      `const a = ref(null); const b = ref(null)
       onMounted(() => { echarts.init(a.value); echarts.init(b.value) })`,
    );
    expect(findMissingChartMounts(c).map((r) => r.name)).toEqual(['b']);
  });
});
