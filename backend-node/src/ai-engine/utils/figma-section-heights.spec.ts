import { buildSectionHeightsMap } from './figma-section-heights.js';

/**
 * TASK #523：A4 比例确定性落到 CSS —— 验证子组件根 class → Figma 高度 px 映射构建正确。
 * 用 25e40782（2:8417）真实产物结构的最小复刻做回归断言。
 */

const indexVue = `<template>
  <base-panel class="c-mc-xxx" panelKey="default-panel">
    <template #header-right>
      <div class="c-monitor-header-stats">
        <div class="c-monitor-header-stat"><span class="c-monitor-header-stat-label">设备类型</span></div>
      </div>
    </template>

    <div class="c-monitor-root">
      <OverviewCards />
      <DeviceListArea />
    </div>
  </base-panel>
</template>
<script setup>
import OverviewCards from './components/OverviewCards.vue'
import DeviceListArea from './components/DeviceListArea.vue'
</script>`;

const overviewCardsVue = `<template>
  <div class="c-monitor-overview-cards">
    <div class="c-monitor-stat-card">...</div>
  </div>
</template>`;

const deviceListAreaVue = `<template>
  <div class="c-monitor-device-list">
    <div class="c-monitor-sidebar-tabs">...</div>
  </div>
</template>`;

const modelFiles = {
  'package/index.vue': indexVue,
  'package/components/OverviewCards.vue': overviewCardsVue,
  'package/components/DeviceListArea.vue': deviceListAreaVue,
};

function layoutWithHeights(heights: number[]) {
  // 🎯 2026-09-09 配对修正：buildSectionHeightsMap 只认 A4 归一化系数 styles.flexGrow
  // （avg=1 量纲），figmaHeightPx 仅审计用、不参与映射。旧测试靠坏像素 fallback
  // （pxOf||Math.round(layoutMetadata.height)）通过，已随量纲 bug 修复移除该 fallback。
  // 此处按「真实 A4 算法」把高度转成归一化系数（avg=1），与 figma-height-ratio.js:421 一致。
  const avg = heights.reduce((a, b) => a + b, 0) / heights.length;
  const grows = heights.map((h) => Number((h / avg).toFixed(3)));
  return {
    layout: {
      sections: grows.map((g, i) => ({
        id: `sec-${i}`,
        title: `区块${i}`,
        styles: { flexGrow: g },
      })),
    },
  };
}

describe('buildSectionHeightsMap (A4→CSS)', () => {
  it('真实 25e40782 结构：按 A4 归一化系数返回 { overview-cards:0.5, device-list:1.5 }', () => {
    // [100,300] 归一化 avg=200 → flexGrow=[0.5,1.5]（系数量纲，非像素）
    const layout = layoutWithHeights([100, 300]);
    const map = buildSectionHeightsMap(modelFiles, layout, {});
    expect(map).toEqual({
      'c-monitor-overview-cards': 0.5,
      'c-monitor-device-list': 1.5,
    });
  });

  it('plan.effectiveSections 同源对齐时同样生效（系数来自 rawSections.styles.flexGrow）', () => {
    const layout = layoutWithHeights([100, 300]);
    const params = {
      subComponentPlan: {
        effectiveSections: [
          { id: 'sec-0', layoutMetadata: { height: 100 } },
          { id: 'sec-1', layoutMetadata: { height: 300 } },
        ],
      },
    };
    const map = buildSectionHeightsMap(modelFiles, layout, params);
    expect(map).toEqual({
      'c-monitor-overview-cards': 0.5,
      'c-monitor-device-list': 1.5,
    });
  });

  it('顶层 sections 缺 flexGrow 系数（量纲缺失） → fail-open 返回 null', () => {
    // 🎯 2026-09-09：只认 styles.flexGrow（A4 系数），无系数即 fail-open，
    // 不再回退像素 figmaHeightPx（否则系数/像素混排 → flex:800 1 0 量纲冲突）。
    const layout = {
      layout: {
        sections: [
          { id: 'sec-0', title: '区块0', styles: {} },
          { id: 'sec-1', title: '区块1', styles: {} },
        ],
      },
    };
    expect(buildSectionHeightsMap(modelFiles, layout, {})).toBeNull();
  });

  it('子组件数量与 section 数量不等 → fail-open 返回 null', () => {
    // 只有 1 个子组件（删掉 DeviceListArea）
    const mono = {
      'package/index.vue': indexVue.replace('      <DeviceListArea />\n', ''),
      'package/components/OverviewCards.vue': overviewCardsVue,
    };
    const layout = layoutWithHeights([65, 317]);
    expect(buildSectionHeightsMap(mono, layout, {})).toBeNull();
  });

  it('顶层 sections < 2 → fail-open 返回 null', () => {
    expect(buildSectionHeightsMap(modelFiles, layoutWithHeights([65]), {})).toBeNull();
  });
});
