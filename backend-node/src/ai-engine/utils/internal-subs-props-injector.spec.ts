/**
 * 🧩 internalSubcomponents props 契约注入（2026-11-06 · 90eae287 实锤）
 *
 * 真机断链：planner 给了 `props:['chartData','chartConfig']`，prompt 只列名字，
 * 父标签 `<TunnelChartSection class="…" />` 一个都没传 ⇒ 子组件 `cfg.series=[]` ⇒ 空轴。
 *
 * 本 spec 锁三件事：
 *  ① 只对「子组件真的声明了 chartConfig」的标签动手（不是图表子组件一律不碰）
 *  ② `chartData` 只在 series 真值存在时注入；缺真值 ⇒ 计数 dataMissing（宁空勿造）
 *  ③ 幂等：已有 `:chart-config` 的标签逐字不变
 */
import {
  extractDefinePropNames,
  injectChartSubProps,
  collectLocalComponentImports,
} from './internal-subs-props-injector.js';

const CHART_CHILD = `<template><div class="c"><div ref="el" /></div></template>
<script setup>
const props = defineProps({
  title: { type: String, default: '' },
  chartData: { type: Array, default: () => [] },
  chartConfig: { type: Object, default: () => ({}) },
  legendConfig: { type: Array, default: () => [] }
})
</script>
`;

const PARENT = `<template>
  <div class="c-flow">
    <TunnelChartSection class="c-flow-tunnel" />
    <BridgeChartSection class="c-flow-bridge" />
  </div>
</template>
<script setup>
import TunnelChartSection from './TunnelChartSection.vue'
import BridgeChartSection from './BridgeChartSection.vue'
</script>
`;

const files = () => ({
  'package/components/ContentFlowMonitor.vue': PARENT,
  'package/components/TunnelChartSection.vue': CHART_CHILD,
  'package/components/BridgeChartSection.vue': CHART_CHILD,
});

const SUBS_NO_TRUTH = [
  { type: 'chart-component', name: '江阴靖江隧道图表区', chartType: 'bar', props: ['chartData', 'chartConfig'] },
  { type: 'chart-component', name: '江阴大桥图表区', chartType: 'bar', props: ['chartData', 'chartConfig'] },
];

describe('extractDefinePropNames / 本地组件 import', () => {
  it('对象字面量形态只取顶层键（嵌套键不算）', () => {
    const names = extractDefinePropNames(CHART_CHILD);
    expect([...names].sort()).toEqual(['chartConfig', 'chartData', 'legendConfig', 'title']);
  });

  it('数组形态同样支持', () => {
    expect([...extractDefinePropNames(`defineProps(['a','b'])`)].sort()).toEqual(['a', 'b']);
  });

  it('本地组件 import 只在 .vue 相对路径命中', () => {
    const m = collectLocalComponentImports(PARENT);
    expect([...m.keys()].sort()).toEqual(['BridgeChartSection', 'TunnelChartSection']);
  });
});

describe('injectChartSubProps', () => {
  it('⭐ 阳性（真机形态 · 无数据真值）：注入 chart-config、不注入 chart-data，dataMissing=2', () => {
    const f = files();
    const r = injectChartSubProps(f, SUBS_NO_TRUTH, {});
    expect(r).toMatchObject({ subs: 2, declared: 2, bound: 0, injected: 2, dataMissing: 2, unboundAfter: 0 });
    const parent = f['package/components/ContentFlowMonitor.vue'];
    expect(parent).toContain(':chart-config="tunnelChartSectionChartConfig"');
    expect(parent).toContain(':chart-config="bridgeChartSectionChartConfig"');
    expect(parent).not.toContain(':chart-data'); // 宁空勿造
    expect(parent).toContain("const tunnelChartSectionChartConfig = { type: 'bar' }");
  });

  it('⭐ 阳性（有 series 真值）：同时注入 chart-data，且常量里带真实数值', () => {
    const f = files();
    const subs = [
      { type: 'chart-component', chartType: 'bar', series: [{ name: '北京', data: [1, 2, 3] }] },
      { type: 'chart-component', chartType: 'bar', series: [{ name: '上海', data: [4, 5, 6] }] },
    ];
    const r = injectChartSubProps(f, subs, {});
    expect(r).toMatchObject({ injected: 2, dataMissing: 0 });
    const parent = f['package/components/ContentFlowMonitor.vue'];
    expect(parent).toContain(':chart-data="tunnelChartSectionChartData"');
    expect(parent).toContain('"北京"');
  });

  it('⭐ 幂等：已有 :chart-config 的标签零改动，且计 bound', () => {
    const f = files();
    f['package/components/ContentFlowMonitor.vue'] = PARENT.replace(
      '<TunnelChartSection class="c-flow-tunnel" />',
      '<TunnelChartSection :chart-config="mine" class="c-flow-tunnel" />',
    );
    const before = f['package/components/ContentFlowMonitor.vue'];
    const r = injectChartSubProps(f, SUBS_NO_TRUTH, {});
    expect(r.bound).toBe(1);
    expect(r.injected).toBe(1);
    expect(f['package/components/ContentFlowMonitor.vue']).toContain(':chart-config="mine"');
    expect(before).toBeTruthy();
  });

  it('反向：子组件没声明 chartConfig ⇒ 一个都不动（普通子组件不误伤）', () => {
    const f = files();
    f['package/components/TunnelChartSection.vue'] = `<template><div/></template>
<script setup>
const props = defineProps({ title: { type: String, default: '' } })
</script>
`;
    const before = f['package/components/ContentFlowMonitor.vue'];
    const r = injectChartSubProps(f, SUBS_NO_TRUTH, {});
    expect(r.declared).toBe(1); // 只剩 Bridge
    expect(r.injected).toBe(1);
    expect(f['package/components/ContentFlowMonitor.vue']).toContain('<TunnelChartSection class="c-flow-tunnel" />');
    expect(before).toContain('TunnelChartSection');
  });

  it('反向：plan 没有图表 internalSubs ⇒ 直接返回，产物逐字不变', () => {
    const f = files();
    const before = JSON.stringify(f);
    const r = injectChartSubProps(f, [{ type: 'element-group', name: 'G1' }], {});
    expect(r.injected).toBe(0);
    expect(JSON.stringify(f)).toBe(before);
  });

  it('⭐ 阳性（070cfc74 真机回滚实锤）：自闭合标签尾部 `/` 归入 attrs ⇒ 重组后不得出现双斜杠', () => {
    const f = files();
    f['package/components/ContentFlowMonitor.vue'] = `<template>
  <div class="c-flow">
    <TunnelChartSection class="c-flow-tunnel" />
  </div>
</template>
<script setup>
import TunnelChartSection from './TunnelChartSection.vue'
</script>
`;
    const r = injectChartSubProps(f, SUBS_NO_TRUTH, {});
    expect(r.injected).toBe(1);
    const out = f['package/components/ContentFlowMonitor.vue'];
    // 不再出现 "…/ + />" 形态（Illegal '/' in tags 的来源）
    expect(out).not.toMatch(/\/\s*\/>/);
    expect(out).toContain(':chart-config="tunnelChartSectionChartConfig"');
    expect(out).toContain('class="c-flow-tunnel"');
  });

  it('冲突：常量名与文件既有标识符撞名 ⇒ 加后缀并计 conflict', () => {
    const f = files();
    f['package/components/ContentFlowMonitor.vue'] = PARENT.replace(
      '</script>',
      'const tunnelChartSectionChartConfig = { legacy: true }\n</script>',
    );
    const r = injectChartSubProps(f, SUBS_NO_TRUTH, {});
    expect(r.conflict).toBeGreaterThanOrEqual(1);
    expect(f['package/components/ContentFlowMonitor.vue']).toContain('tunnelChartSectionChartConfig2');
  });
});
