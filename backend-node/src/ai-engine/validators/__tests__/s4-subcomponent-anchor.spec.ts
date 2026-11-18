/**
 * S4-h + S4-g spec（2026-11-18 · 流量监测 mc-s4-tabblock 插顶完整机制实锤）
 *
 * 完整病根：宿主段 2:3604 被拆成子组件 ContentForecast（根锚在子组件）⇒ 旧 targetFile
 * 判定第一循环命中子组件（含 tabParentSibs 锚）⇒ S4-f 在子组件 src 里命中 2:3604 ⇒
 * tab 样板插进子组件内部顶部（段头之前）⇒ 视觉顺序错乱。
 * 双刀修复：S4-h targetFile 恒优先 index.vue；S4-g index 无宿主锚时探测子组件、
 * 插到 index 中该子组件标签之前。
 */
import { injectTabInteractivity } from '../code-fix-rules.js';

function makeFigma() {
  const tab = { id: '2:3566', name: '@antd/tab', type: 'INSTANCE', children: [
    { id: '2:3567', name: '江阴靖江长江隧道', type: 'TEXT', characters: '江阴靖江长江隧道' },
    { id: '2:3568', name: '江阴大桥', type: 'TEXT', characters: '江阴大桥' } ] };
  const section = { id: '2:3604', name: '流量预测', type: 'FRAME', children: [tab] };
  return { document: { id: '0:0', type: 'FRAME', name: 'root', children: [section] } };
}

const INDEX_NO_STATE = `<template>
  <base-panel>
    <div class="c-traffic-monitor-slot-con" style="display:flex;flex-direction:column;">
      <ContentDailyTotalFlow />
      <ContentForecast style="flex:0.189;" />
    </div>
  </base-panel>
</template>
<script setup>
import ContentForecast from './components/ContentForecast.vue'
</script>`;

const FORECAST_WITH_ANCHOR = `<template>
  <div class="c-traffic-monitor-forecast-section" data-section-id="2:3604" v-bind="$attrs">
    <div ref="chartRef"></div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
const chartRef = ref(null)
</script>`;

describe('S4-h+S4-g：tab 样板恒入 index、宿主在子组件时插其标签前', () => {
  test('P1 子组件持宿主锚 ⇒ block 写入 index 且在 <ContentForecast 标签之前、子组件不被污染', () => {
    const files: Record<string, string> = {
      'package/index.vue': INDEX_NO_STATE,
      'package/components/ContentForecast.vue': FORECAST_WITH_ANCHOR,
    };
    const r = injectTabInteractivity(files as any, makeFigma() as any, () => ['2:3566']);
    expect(r.stats.s4SubComponentAnchor).toBe(1);
    expect(r.stats.blockInjected).toBe(1);
    const idx = r.files['package/index.vue'];
    const blockAt = idx.indexOf('mc-s4-tabblock');
    const tagAt = idx.indexOf('<ContentForecast');
    expect(blockAt).toBeGreaterThan(-1);
    expect(blockAt).toBeLessThan(tagAt);
    // 子组件文件不被污染（旧病根：block 插进子组件内部顶部）
    expect(r.files['package/components/ContentForecast.vue'].includes('mc-s4-tabblock')).toBe(false);
  });

  test('P2 幂等：子组件已有 mcTabs 状态 ⇒ 跨文件跳过，index 不注入', () => {
    const forecastWithState = FORECAST_WITH_ANCHOR.replace(
      'const chartRef = ref(null)',
      "const chartRef = ref(null)\nconst activeTab = ref(0)", // 与真实产物同款状态变量名（S4-e 判据命中）
    );
    const files: Record<string, string> = {
      'package/index.vue': INDEX_NO_STATE,
      'package/components/ContentForecast.vue': forecastWithState,
    };
    const r = injectTabInteractivity(files as any, makeFigma() as any, () => ['2:3566']);
    expect(r.stats.skippedTabStateElsewhere).toBe(1);
    expect(r.files['package/index.vue'].includes('mc-s4-tabblock')).toBe(false);
  });

  test('N1 宿主锚无处可寻（子组件也不含）⇒ S4-g 不误插，回退既有逻辑', () => {
    const files: Record<string, string> = {
      'package/index.vue': INDEX_NO_STATE,
      'package/components/ContentForecast.vue': '<template><div class="x">y</div></template>',
    };
    const r = injectTabInteractivity(files as any, makeFigma() as any, () => ['2:3566']);
    expect(r.stats.s4SubComponentAnchor).toBe(0);
  });

  test('N2 宿主锚就在 index（非拆分形态）⇒ 走既有 S4-f，S4-g 不介入', () => {
    const idxWithAnchor = INDEX_NO_STATE.replace(
      '<ContentForecast style="flex:0.189;" />',
      '<div data-section-id="2:3604"><ContentForecast /></div>',
    );
    const files: Record<string, string> = {
      'package/index.vue': idxWithAnchor,
      'package/components/ContentForecast.vue': '<template><div class="x">y</div></template>',
    };
    const r = injectTabInteractivity(files as any, makeFigma() as any, () => ['2:3566']);
    expect(r.stats.s4SubComponentAnchor).toBe(0);
    expect(r.stats.blockInjected).toBe(1);
    const idx = r.files['package/index.vue'];
    // S4-f：插在 2:3604 锚之前
    expect(idx.indexOf('mc-s4-tabblock')).toBeLessThan(idx.indexOf('data-section-id="2:3604"'));
  });
});