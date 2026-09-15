import { buildSectionHeightsMap, buildSectionLayoutFacts } from './figma-section-heights.js';

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

  it('🎯 2026-09-14 真机：planner 已按 Figma 实测高度修复时，数值必须取修复值（不再用 vision 自报系数）', () => {
    // 实锤事故 c-traffic-monitor-3147d679：一对 Figma 高度同为 131px 的等高柱状图，
    // vision 自报 flexGrow = 3.73 / 0.952（3.9 倍失配），planner applyFigmaHeightGrow
    // 已按 Figma 高度归一改写为 1.327 / 1.327。
    // 治本前：顺序取 repaired plan、数值却取 raw styles.flexGrow → 两处不同源 → 错误系数
    // 一路写进 common.less（`flex: 3.73 1 0`）→ 高度塔状失衡（大空白 + 区块挤压重叠）。
    // 治本后：顺序与数值同源于 repaired plan leaf。
    const layout = {
      layout: {
        sections: [
          { id: 'sec-0', title: '区块0', styles: { flexGrow: 3.73 } },
          { id: 'sec-1', title: '区块1', styles: { flexGrow: 0.952 } },
        ],
      },
    };
    const params = {
      subComponentPlan: {
        effectiveSections: [
          { id: 'sec-0', layoutMetadata: { height: 131, flexGrow: 1.327 } },
          { id: 'sec-1', layoutMetadata: { height: 131, flexGrow: 1.327 } },
        ],
      },
    };
    const map = buildSectionHeightsMap(modelFiles, layout, params);
    expect(map).toEqual({
      'c-monitor-overview-cards': 1.327,
      'c-monitor-device-list': 1.327,
    });
  });

  it('plan 叶子未携带修复系数时仍回退 raw section 系数（保持向后兼容 / fail-open 契约不变）', () => {
    const layout = {
      layout: {
        sections: [
          { id: 'sec-0', title: '区块0', styles: { flexGrow: 0.5 } },
          { id: 'sec-1', title: '区块1', styles: { flexGrow: 1.5 } },
        ],
      },
    };
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

  it('🎯 2026-09-15 真机：plan 含冗余 section（@antd/tab 的「设备网格」切片，flexGrow=0）→ dedupe 后对齐，不 fail-open', () => {
    // 实锤事故 c-device-monitor-44384241：vision 把 @antd/tab（含 tabs+设备网格）拆成
    // 两个 section——@antd/tab(89:37) 与冗余切片「设备网格」(8438，flexGrow=None→planner 归一后 0)。
    // 治本前 buildSectionHeightsMap 直接用 plan.effectiveSections（4 叶子含冗余 8438），
    // 而 code-generator 用 resolvePlanSections（dedupe 后 3 叶子）→ 两处不同源 →
    // 叶子数(3, filter 掉 flexGrow=0)≠planLeaves(4) → fail-open null → switch/tab 比例退化为 flex:1。
    // 治本后：先 dedupeDuplicateSections（与 resolvePlanSections 同源）再取叶子 → 对齐成功。
    const layout = {
      layout: {
        sections: [
          { id: 'sec-0', title: '区块0', styles: { flexGrow: 0.5 } },
          { id: 'sec-1', title: '区块1', styles: { flexGrow: 1.5 } },
          { id: 'sec-dup', title: '设备网格(冗余切片)', styles: {} }, // 无 flexGrow
        ],
      },
    };
    const params = {
      subComponentPlan: {
        effectiveSections: [
          { id: 'sec-0', layoutMetadata: { flexGrow: 0.5 }, sourceNodeIds: ['n0'] },
          { id: 'sec-1', layoutMetadata: { flexGrow: 1.5 }, sourceNodeIds: ['n1', 'n2', 'n3'] },
          { id: 'sec-dup', layoutMetadata: { flexGrow: 0 }, sourceNodeIds: ['n2', 'n3'] },
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

  it('嵌套容器不计高度槽：叶子对齐 2 子组件，容器自身不占槽', () => {
    const avg = (100 + 300) / 2;
    const layout = {
      layout: {
        sections: [
          { id: '89:40', title: 'slot-con', styles: { flexGrow: 1 } },
          { id: 'sec-0', title: '区块0', styles: { flexGrow: Number((100 / avg).toFixed(3)) } },
          { id: 'sec-1', title: '区块1', styles: { flexGrow: Number((300 / avg).toFixed(3)) } },
        ],
      },
    };
    const params = {
      subComponentPlan: {
        effectiveSections: [
          {
            id: '89:40',
            isLayoutContainer: true,
            layoutSource: 'container-rebuild',
            children: [
              { id: 'sec-0', layoutMetadata: { height: 100 } },
              { id: 'sec-1', layoutMetadata: { height: 300 } },
            ],
          },
        ],
      },
    };
    const map = buildSectionHeightsMap(modelFiles, layout, params);
    expect(map).toEqual({
      'c-monitor-overview-cards': 0.5,
      'c-monitor-device-list': 1.5,
    });
  });
});

// ──────────────────────────────────────────────
// 🛡️ 删减法批次 3 loop 3a（2026-09-14 · 914 §13）：布局事实单一事实源
// ──────────────────────────────────────────────
describe('buildSectionLayoutFacts（display/gridColumns/flexDirection）', () => {
  const mkFiles = (subA: string, subB: string) => ({
    'package/index.vue': `<template>
  <div class="c-monitor-root">
    <GridSection />
    <ChartSection />
  </div>
</template>`,
    'package/components/GridSection.vue': subA,
    'package/components/ChartSection.vue': subB,
  });
  const gridSub = `<template><div class="c-monitor-device-grid"><span>{{ d.name }}</span></div></template>`;
  const chartSub = `<template><div class="c-monitor-hourly-chart"><div class="c-monitor-chart-canvas"></div></div></template>`;

  it('栅格 section（gridColumns=3）→ display:grid + 列数事实', () => {
    const layout: any = { layout: { sections: [
      { id: '2:8440', layout: 'grid', gridColumns: 3, styles: { flexGrow: 1.2, figmaHeightPx: 264 } },
      { id: '2:7459', layout: 'vertical', styles: { flexGrow: 0.8, figmaHeightPx: 170 } },
    ] } };
    const facts = buildSectionLayoutFacts(mkFiles(gridSub, chartSub), layout, {});
    expect(facts['c-monitor-device-grid']).toEqual({
      flexGrow: 1.2, heightPx: 264, display: 'grid', gridColumns: 3, flexDirection: 'column',
    });
  });

  it('普通 section（无栅格）→ display:flex + 方向事实（horizontal→row）', () => {
    const layout: any = { layout: { sections: [
      { id: '2:8440', layout: 'horizontal', styles: { flexGrow: 1 } },
      { id: '2:7459', layout: 'vertical', styles: { flexGrow: 2 } },
    ] } };
    const facts = buildSectionLayoutFacts(mkFiles(gridSub, chartSub), layout, {});
    expect(facts['c-monitor-device-grid'].display).toBe('flex');
    expect(facts['c-monitor-device-grid'].flexDirection).toBe('row');
    expect(facts['c-monitor-device-grid'].heightPx).toBeNull();
    expect(facts['c-monitor-hourly-chart'].flexDirection).toBe('column');
    expect(facts['c-monitor-hourly-chart'].flexGrow).toBe(2);
  });

  it('对齐失败（标签与 section 数不匹配）→ fail-open 返回 null', () => {
    const layout: any = { layout: { sections: [
      { id: '2:8440', layout: 'grid', gridColumns: 3, styles: { flexGrow: 1 } },
    ] } };
    expect(buildSectionLayoutFacts(mkFiles(gridSub, chartSub), layout, {})).toBeNull();
    expect(buildSectionLayoutFacts(null as any, layout, {})).toBeNull();
  });
});
