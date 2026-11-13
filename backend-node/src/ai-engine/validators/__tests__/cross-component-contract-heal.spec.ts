/**
 * 根治⑯ 跨组件 props 契约确定性修复 spec（2026-11-13）
 * 钉子：mc-1794535248015-2ca2eb59 真实病灶——BridgeBarChart.vue 消费
 * businessProps.chartData（declare 空 ⇒ 运行期必然空渲染 + PROP-BIND BLOCK 三轮不收敛），
 * 而父组件 ContentBridge 已正确传 :chart-data="barChartData"（含 Figma 真值数据）。
 */
import {
  rebindInternalChildDeadProps,
} from '../cross-component-contract-heal.js';

// 2ca2eb59 真实产物节选（病灶原样）
const BRIDGE_BAR_CHART = `<template>
  <div class="c-traffic-monitor-bridge-bar-chart" v-bind="$attrs">
    <div class="c-traffic-monitor-bridge-bar-chart__body">
      <div v-for="(item, index) in categoryList" :key="index" class="c-traffic-monitor-bridge-bar-chart__item">
        <div class="c-traffic-monitor-bridge-bar-chart__label">{{ item.label }}</div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'

// === $mcComponentBuilder 初始化（声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const title = computed(() => componentProps.title || '车流量趋势')

const chartData = computed(() => businessProps.chartData || { categories: [], series: [] })

const seriesColors = ['#2E8BFF', '#00D8A0']
</script>`;

const CONTENT_BRIDGE = `<template>
  <div class="c-traffic-monitor-bridge" data-section-id="1744:128" v-bind="$attrs">
    <div class="c-traffic-monitor-chart c-traffic-monitor-bridge-chart-wrap">
      <BridgeBarChart
        :chart-data="barChartData"
        :chart-config="barChartConfig"
        @legend-click="onLegendClick"
      />
    </div>
  </div>
</template>
<script setup>
import BridgeBarChart from './BridgeBarChart.vue'
const barChartData = { categories: ['16时'], series: [] }
</script>`;

const EMPTY_DECLARE = JSON.stringify({
  businessConfig: {},
  businessStatuses: {},
  businessEvents: {},
});

const FILE = 'package/components/BridgeBarChart.vue';
const PARENT = 'package/components/ContentBridge.vue';
const DECLARE = 'package/declare.json';

describe('根治⑯ · rebindInternalChildDeadProps', () => {
  test('① 档1（2ca2eb59 真实病灶）：父传 :chart-data ⇒ businessProps.chartData 改绑 props.chartData + 注入 defineProps', () => {
    const files = {
      [FILE]: BRIDGE_BAR_CHART,
      [PARENT]: CONTENT_BRIDGE,
      [DECLARE]: EMPTY_DECLARE,
    };
    const r = rebindInternalChildDeadProps(files);
    const out = r.files[FILE];
    // 改绑完成
    expect(out).toContain('props.chartData');
    expect(out).not.toContain('businessProps.chartData');
    // defineProps 注入在 $mcComponentBuilder 之后
    const dp = /const props = defineProps\(\{[\s\S]*?\}\)/.exec(out);
    expect(dp).toBeTruthy();
    expect(out.indexOf('$mcComponentBuilder')).toBeLessThan(out.indexOf('const props = defineProps'));
    expect(dp[0]).toContain('chartData');
    // fallback 链保留
    expect(out).toContain('props.chartData || { categories: [], series: [] }');
    // 父组件零接触
    expect(r.files[PARENT]).toBe(CONTENT_BRIDGE);
    expect(r.healed).toHaveLength(1);
  });

  test('② 档1 已有 defineProps 缺键 ⇒ 补键 + 用既有 const 名', () => {
    const withDp = BRIDGE_BAR_CHART.replace(
      "const title = computed",
      "const props = defineProps({\n  title: { type: String, default: '' }\n})\nconst title = computed",
    );
    const r = rebindInternalChildDeadProps({
      [FILE]: withDp,
      [PARENT]: CONTENT_BRIDGE,
      [DECLARE]: EMPTY_DECLARE,
    });
    const out = r.files[FILE];
    expect(out).toContain('props.chartData');
    // 补键进 defineProps
    const dp = /const props = defineProps\(\{[\s\S]*?\}\)/.exec(out);
    expect(dp[0]).toContain('chartData');
    expect(dp[0]).toContain('title');
    // 未重复声明 defineProps
    expect(out.match(/defineProps\(/g) || []).toHaveLength(1);
  });

  test('③ 档1 裸 defineProps ⇒ 改为 const props = defineProps', () => {
    const bareDp = BRIDGE_BAR_CHART.replace(
      "const title = computed",
      "defineProps({\n  title: { type: String, default: '' }\n})\nconst title = computed",
    );
    const r = rebindInternalChildDeadProps({
      [FILE]: bareDp,
      [PARENT]: CONTENT_BRIDGE,
      [DECLARE]: EMPTY_DECLARE,
    });
    expect(r.files[FILE]).toContain('const props = defineProps(');
    expect(r.files[FILE]).toContain('props.chartData');
  });

  test('④ 档2 无父传同名 prop ⇒ skipped 不动（保持 BLOCK，不臆造数据）', () => {
    const noPassParent = CONTENT_BRIDGE.replace(':chart-data="barChartData"', 'title="大桥"');
    const r = rebindInternalChildDeadProps({
      [FILE]: BRIDGE_BAR_CHART,
      [PARENT]: noPassParent,
      [DECLARE]: EMPTY_DECLARE,
    });
    expect(r.files[FILE]).toBe(BRIDGE_BAR_CHART); // 零接触
    expect(r.healed).toHaveLength(0);
    expect(r.skipped.some((s) => s.includes('无父传同名 prop'))).toBe(true);
  });

  test('⑤ declare 已声明该键 ⇒ 非死键，零接触', () => {
    const declared = JSON.stringify({
      businessConfig: { chartData: { name: 'chartData', type: 'object' } },
      businessStatuses: {},
      businessEvents: {},
    });
    const r = rebindInternalChildDeadProps({
      [FILE]: BRIDGE_BAR_CHART,
      [PARENT]: CONTENT_BRIDGE,
      [DECLARE]: declared,
    });
    expect(r.files[FILE]).toBe(BRIDGE_BAR_CHART);
    expect(r.healed).toHaveLength(0);
  });

  test('⑥ 幂等：改绑后重跑零变化', () => {
    const r1 = rebindInternalChildDeadProps({
      [FILE]: BRIDGE_BAR_CHART,
      [PARENT]: CONTENT_BRIDGE,
      [DECLARE]: EMPTY_DECLARE,
    });
    const r2 = rebindInternalChildDeadProps(r1.files);
    expect(r2.healed).toHaveLength(0);
    expect(r2.files[FILE]).toBe(r1.files[FILE]);
  });

  test('⑦ kebab→camel：父传 :series-colors ⇒ 匹配 businessProps.seriesColors', () => {
    const consumer = BRIDGE_BAR_CHART.replace(
      'businessProps.chartData || { categories: [], series: [] }',
      'businessProps.seriesColors || []',
    );
    const parent = CONTENT_BRIDGE.replace(
      ':chart-data="barChartData"',
      ':series-colors="colors"',
    );
    const r = rebindInternalChildDeadProps({
      [FILE]: consumer,
      [PARENT]: parent,
      [DECLARE]: EMPTY_DECLARE,
    });
    expect(r.files[FILE]).toContain('props.seriesColors');
    expect(r.files[FILE]).not.toContain('businessProps.seriesColors');
  });

  test('⑧ 无 declare.json ⇒ fail-open（与 PROP-BIND 门禁同口径），零接触', () => {
    const r = rebindInternalChildDeadProps({
      [FILE]: BRIDGE_BAR_CHART,
      [PARENT]: CONTENT_BRIDGE,
    });
    expect(r.files[FILE]).toBe(BRIDGE_BAR_CHART);
    expect(r.healed).toHaveLength(0);
  });
});
