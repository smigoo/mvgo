import {
  buildSectionHeightsMap,
  buildSectionLayoutFacts,
  resolveSubComponentPlan,
} from './figma-section-heights.js';
import { resolvePlanSource, PLAN_SOURCE } from './resolve-plan-source.js';

/**
 * TASK #523：A4 比例确定性落到 CSS —— 验证子组件根 class → Figma 高度 px 映射构建正确。
 * 用 25e40782（2:8417）真实产物结构的最小复刻做回归断言。
 */

describe('resolveSubComponentPlan（G04 2026-11-14：判据层全保真原形优先）', () => {
  const legacy = { effectiveSections: [{ id: 's1' }], isForced: true, minFiles: 1, reason: 'legacy' };
  const genPlan = { effectiveSections: [{ id: 's2' }], isForced: false, minFiles: 2, reason: 'gen' };

  // G02 决策 1：subComponentPlan = 唯一判据事实源；componentPlan 保留但 deprecated，
  // 只兼容旧断点（有损投影逐段保留率 27.9%~46.5%，不得再当判据来源）。
  it('优先取 subComponentPlan（planner 全保真原形）', () => {
    expect(resolveSubComponentPlan({ componentPlan: genPlan }, legacy)).toBe(legacy);
  });
  it('subComponentPlan 缺省时兼容回退 componentPlan（仅旧断点）', () => {
    expect(resolveSubComponentPlan({ componentPlan: genPlan }, null)).toBe(genPlan);
    expect(resolveSubComponentPlan({ componentPlan: genPlan }, undefined)).toBe(genPlan);
  });
  it('generationInput 无 componentPlan 时取 subComponentPlan', () => {
    expect(resolveSubComponentPlan({}, legacy)).toBe(legacy);
    expect(resolveSubComponentPlan(null, legacy)).toBe(legacy);
  });
  it('full 有对象但无有效段 ⇒ 回退投影口（兼容，source 可观测）', () => {
    expect(resolveSubComponentPlan({ componentPlan: genPlan }, { effectiveSections: [] })).toBe(genPlan);
  });
  it('两者皆空返回空兜底（真错仍 FAIL，不伪造段）', () => {
    const r = resolveSubComponentPlan(null, null);
    expect(Array.isArray(r.effectiveSections)).toBe(true);
    expect(r.effectiveSections.length).toBe(0);
    expect(r.isForced).toBe(false);
    expect(r.reason).toBeTruthy();
  });
});

describe('resolvePlanSource（G04 单一解析器 · 阴阳对照）', () => {
  const full = { effectiveSections: [{ id: 's1', body: { children: [{ id: 'chart', charts: [] }] } }] };
  const projected = { effectiveSections: [{ id: 's1', declaredContent: { children: [] } }] };

  it('A1 全保真优先且 degraded=false', () => {
    const r = resolvePlanSource({ componentPlan: projected }, full);
    expect(r.source).toBe(PLAN_SOURCE.FULL);
    expect(r.plan).toBe(full);
    expect(r.degraded).toBe(false);
  });
  it('A2 兼容回退必须留痕 degraded=true', () => {
    const r = resolvePlanSource({ componentPlan: projected }, null);
    expect(r.source).toBe(PLAN_SOURCE.PROJECTED);
    expect(r.degraded).toBe(true);
  });
  it('N1 投影口带臆造段也不得被采用', () => {
    const evil = { effectiveSections: [...projected.effectiveSections, { id: 'INVENTED' }] };
    const r = resolvePlanSource({ componentPlan: evil }, full);
    expect(r.source).toBe(PLAN_SOURCE.FULL);
    expect(r.plan.effectiveSections.some((s: any) => s.id === 'INVENTED')).toBe(false);
  });
  it('A3 真错不伪造', () => {
    const r = resolvePlanSource(null, null);
    expect(r.source).toBe(PLAN_SOURCE.NONE);
    expect(r.plan.effectiveSections).toHaveLength(0);
    expect(r.plan.reason).toBeTruthy();
  });
});

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
// 🎯 2026-11-03 Loop 2 治本（mc-max-1793675440559-c46c2631 实锤）：
// plan.effectiveSections 已由 planner 滤除 header，「计划里只剩 1 个内容段」是合法形态。
// 旧双重守卫（planLeaves >= 2 + tags.length < 2）把这档打进 raw fallback 后仍对不上 →
// fail-open → A4 写的 1.508 永远到不了产物（写而不消费第三断点）。
// ──────────────────────────────────────────────
describe('buildSectionHeightsMap · Loop 2：plan 单一内容段容错', () => {
  // 真实样本复刻：vision 2 sections = 标题栏(2:7959, 0.492) + 今日累计(136:122, 1.508)；
  // generationInput.componentPlan.effectiveSections 仅 1 leaf「今日累计」(layoutMetadata.flexGrow=1.508)；
  // 产物 index.vue 仅 1 个大写标签 <ContentSection>（header 被 LLM 吞、tab 被提出 base-panel）。
  const vmIndexVue = `<template>
  <div class="c-vehicle-monitor-slot-con-tabs" style="display:flex;gap:8px;margin-bottom:12px;">
    <div class="c-vehicle-monitor-tab">今日累计</div>
  </div>
  <base-panel panelKey="default-panel">
    <div class="c-vehicle-monitor-slot-con c-mc-xxx" style="display:flex; flex-direction:column">
      <ContentSection style="flex:1;min-height:0;" />
    </div>
  </base-panel>
</template>
<script setup>
import ContentSection from './components/ContentSection.vue'
</script>`;

  const contentSectionVue = `<template>
  <div class="c-vehicle-monitor-content">
    <div class="c-vehicle-monitor-stat">...</div>
  </div>
</template>`;

  const vmModelFiles = {
    'package/index.vue': vmIndexVue,
    'package/components/ContentSection.vue': contentSectionVue,
  };

  const vmLayout = {
    layout: {
      sections: [
        { id: '2:7959', title: '标题栏', styles: { flexGrow: 0.492 } },
        { id: '136:122', title: '今日累计', styles: { flexGrow: 1.508 } },
      ],
    },
  };

  const vmPlan = {
    effectiveSections: [
      {
        id: '136:122',
        title: '今日累计',
        layoutMetadata: { flexGrow: 1.508, height: 86 },
      },
    ],
  };

  it('阳性：plan 1 leaf（header 已滤）+ 产物 1 标签 → 唯一标签映射 1.508（第三断点闭合）', () => {
    const map = buildSectionHeightsMap(vmModelFiles, vmLayout, {
      subComponentPlan: vmPlan,
    });
    expect(map).toEqual({ 'c-vehicle-monitor-content': 1.508 });
  });

  it('阴性 A：plan 1 leaf 但产物 2 标签 → 数量不严格相等，fail-open 不猜', () => {
    const twoTagFiles = {
      ...vmModelFiles,
      'package/components/HeaderSection.vue': `<template>
  <div class="c-vehicle-monitor-header">...</div>
</template>`,
      'package/index.vue': vmIndexVue.replace(
        '  <base-panel panelKey="default-panel">',
        '  <HeaderSection />\n  <base-panel panelKey="default-panel">',
      ),
    };
    expect(
      buildSectionHeightsMap(twoTagFiles, vmLayout, { subComponentPlan: vmPlan }),
    ).toBeNull();
  });

  it('阴性 B：plan leaf 与 raw section 双缺 flexGrow（量纲缺失）→ fail-open 返回 null', () => {
    const noCoeffLayout = {
      layout: {
        sections: [
          { id: '2:7959', title: '标题栏', styles: {} },
          { id: '136:122', title: '今日累计', styles: {} },
        ],
      },
    };
    const noCoeffPlan = {
      effectiveSections: [
        { id: '136:122', title: '今日累计', layoutMetadata: { height: 86 } },
      ],
    };
    expect(
      buildSectionHeightsMap(vmModelFiles, noCoeffLayout, {
        subComponentPlan: noCoeffPlan,
      }),
    ).toBeNull();
  });

  it('边界 C：单文件组件（tags===0）+ plan 1 leaf → 单文件路径仍要求 >=2 直接子类，fail-open', () => {
    const singleFile = {
      'package/index.vue': `<template>
  <div class="c-vehicle-monitor-root">
    <div class="c-vehicle-monitor-content">...</div>
  </div>
</template>`,
    };
    expect(
      buildSectionHeightsMap(singleFile, vmLayout, { subComponentPlan: vmPlan }),
    ).toBeNull();
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
      // 🎯 M2.1-A（2026-09-16）：grid 容器**不产出 flexDirection**（改前误产 'column'）。
      // display 已是 grid，flexDirection 无意义；且让 FLEX-006 无法区分
      // 「真值就是 column」与「压根没有真值」。此处 null = 无真值。
      flexGrow: 1.2, heightPx: 264, display: 'grid', gridColumns: 3, flexDirection: null,
    });
  });

  it('🎯 M2.1-A：非 horizontal/vertical 的 layout（grid / 缺失）→ flexDirection 为 null（无真值）', () => {
    // 改前 `layout === 'horizontal' ? 'row' : 'column'` 会把 grid / undefined 一律写成 'column'，
    // 静默写错方向且不可辨识。现只认明确值。
    for (const L of ['grid', undefined, '', 'unknown-value']) {
      const layout: any = { layout: { sections: [
        { id: '2:8440', layout: L, styles: { flexGrow: 1 } },
        { id: '2:7459', layout: L, styles: { flexGrow: 2 } },
      ] } };
      const facts = buildSectionLayoutFacts(mkFiles(gridSub, chartSub), layout, {});
      expect(facts['c-monitor-device-grid'].flexDirection).toBeNull();
      expect(facts['c-monitor-hourly-chart'].flexDirection).toBeNull();
    }
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

  it('⭐ 2026-09-16（c-vehicle-monitor-b82c9d84）：reuseCache 时 layoutStructure 空，但 plan.effectiveSections 有视觉真值 → 回退 eff 本身对齐成功', () => {
    // layoutStructure 空（{}），plan.effectiveSections 的 section 自带 layout/layoutMetadata.flexGrow
    const layout: any = {};
    const plan = {
      effectiveSections: [
        { id: '2:7959', layout: 'horizontal', layoutMetadata: { flexGrow: 0.606 } },
        { id: '2:7954', layout: 'horizontal', layoutMetadata: { flexGrow: 0.549 } },
      ],
    };
    // 两个子组件标签对应两个叶子
    const files = {
      'package/index.vue': '<template><div><AaaSection /><BbbSection /></div></template>',
      'package/components/AaaSection.vue': '<template><div class="c-monitor-a"></div></template>',
      'package/components/BbbSection.vue': '<template><div class="c-monitor-b"></div></template>',
    };
    const facts = buildSectionLayoutFacts(files, layout, { subComponentPlan: plan });
    expect(facts).not.toBeNull();
    expect(facts!['c-monitor-a'].flexDirection).toBe('row');
    expect(facts!['c-monitor-a'].flexGrow).toBe(0.606);
    expect(facts!['c-monitor-b'].flexDirection).toBe('row');
    expect(facts!['c-monitor-b'].flexGrow).toBe(0.549);
  });
});
