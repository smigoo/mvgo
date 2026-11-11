/**
 * 🛡️ 兄弟卡背景组（2026-11-11 · 重点车辆监测 mc-max-1794407888630-408d924a 实锤）。
 *
 * 实锤形态：3 张同构兄弟卡 FRAME（136:129/128/127，同 y=984、同高 ≈74.2、x=37/166/274
 * 相邻铺排）被折叠接管折叠为一个 section（锚 = 单卡 id 136:127）+ v-for ×3 渲染。
 * 旧路径结局：bg-126（锚卡）挂段根被 100%×100% 拉伸铺满整行；bg-124/125 的 owner
 * 容器（136:128/129）不在任何 section sourceNodeIds ⇒ 锚点 none ⇒ fail-closed 丢弃；
 * LLM 又把三张散挂到 icon img / value-wrap ⇒ E3-v4 拒交付（三连败 22:38–22:40）。
 *
 * 治本：计划层识别「同父同 y 等高 x 相邻 + 混合锚点态」背景组 ⇒ 按 x 序轮换注入
 * v-for item（FG_CARD_BGS 常量 + item :style），同时剥除错位 LLM 挂载。
 */
// backend-root.js ESM 风格在 ts-jest CJS 下与模块包装器参数撞名 ⇒ 工厂 mock 绕过
// （resource-mount-plan.spec.ts 同款惯例）。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true });

import {
  buildResourceMountPlan,
  mountCardBgGroups,
  mountPlannedResources,
} from './resource-mount-plan.js';

// ── 真实形态 fixture：408d924a（.mc-gen/resource-dom-mapping.json 逐字段）──
const mapping408d = [
  {
    figmaNodeId: '136:125',
    previewAnalysisRole: 'bg',
    downloadStatus: 'success',
    resourceFile: '../resources/images/bg-125.png',
    assignedVarName: 'bg1',
    ownerSectionId: '136:129',
    ancestorIds: ['136:129', '2:8023', '136:121', '2:7952'],
    targetDomSelector: '[data-section-id="136:129"]',
    figmaBox: { x: 37, y: 984, width: 140.48, height: 74.2 },
    parentBox: { x: 37, y: 984, width: 140.48, height: 74.2 },
    bgRole: 'container',
    mountTarget: 'slot',
  },
  {
    figmaNodeId: '136:124',
    previewAnalysisRole: 'bg',
    downloadStatus: 'success',
    resourceFile: '../resources/images/bg-124.png',
    assignedVarName: 'bg2',
    ownerSectionId: '136:128',
    ancestorIds: ['136:128', '2:8023', '136:121', '2:7952'],
    targetDomSelector: '[data-section-id="136:128"]',
    figmaBox: { x: 166, y: 984, width: 120, height: 74.2 },
    parentBox: { x: 166, y: 984, width: 120, height: 74.2 },
    bgRole: 'container',
    mountTarget: 'slot',
  },
  {
    figmaNodeId: '136:126',
    previewAnalysisRole: 'bg',
    downloadStatus: 'success',
    resourceFile: '../resources/images/bg-126.png',
    assignedVarName: 'bg3',
    ownerSectionId: '136:127',
    ancestorIds: ['136:127', '2:8023', '136:121', '2:7952'],
    targetDomSelector: '[data-section-id="136:127"]',
    figmaBox: { x: 274, y: 984, width: 141, height: 74.2 },
    parentBox: { x: 274, y: 984, width: 141, height: 74.2 },
    bgRole: 'container',
    mountTarget: 'slot',
  },
];

const sections408d = [
  { id: '136:118', type: 'header', responsibility: '顶部标题区', elementCount: 4, sourceNodeIds: ['136:118'] },
  { id: '2:7954', type: 'tabs', responsibility: '标签页切换区', elementCount: 2, sourceNodeIds: ['2:7954'] },
  { id: '136:122', type: 'content', responsibility: '今日累计内容区', elementCount: 3, sourceNodeIds: ['136:122'] },
  { id: '136:127', type: 'grid', responsibility: '统计卡行', elementCount: 3, sourceNodeIds: ['136:127', '136:126'] },
];

// 产物实况：components/StatsSection.vue（活文件，index.vue import）+ 散挂三连
const STATS_LIVE = `<template>
  <div class="mc-stats" data-section-id="136:127" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
    <div class="mc-stat-card" v-for="item in statCards" :key="item.label">
      <img :src="item.icon" :style="{ backgroundImage: 'url(' + bg2 + ')', backgroundSize: '100% 100%' }"/>
      <div class="mc-stat-value" :style="{ backgroundImage: 'url(' + bg1 + ')' }">{{ item.value }}</div>
    </div>
  </div>
</template>
<script setup>
import bg3 from '../../resources/images/bg-126.png'
import bg2 from '../../resources/images/bg-124.png'
import bg1 from '../../resources/images/bg-125.png'
const statCards = [{ label: 'a' }, { label: 'b' }, { label: 'c' }]
</script>`;

const INDEX_VUE = `<template>
  <base-panel>
    <StatsSection />
  </base-panel>
</template>
<script setup>
import StatsSection from './components/StatsSection.vue'
</script>`;

function build408dFiles() {
  return {
    'package/index.vue': INDEX_VUE,
    'package/components/StatsSection.vue': STATS_LIVE,
    // 确定性骨架死文件（index.vue 不 import）——绝不落入
    'package/sections/StatsSection.vue': '<template><div data-section-id="136:127"></div></template>',
  };
}

describe('buildResourceMountPlan · 兄弟卡背景组识别', () => {
  it('① 阳性（408d924a 实锤形态）：混合锚点态 ⇒ 成组，anchorId=锚卡，members 按 x 序', () => {
    const plan = buildResourceMountPlan(sections408d, mapping408d, {
      productAnchorIds: new Set(['136:127']),
    });
    expect(Array.isArray(plan.cardBgGroups)).toBe(true);
    expect(plan.cardBgGroups).toHaveLength(1);
    const g = plan.cardBgGroups[0];
    expect(g.anchorId).toBe('136:127');
    expect(g.members.map((m) => m.varName)).toEqual(['bg1', 'bg2', 'bg3']); // x 序
  });

  it('② 阴性：全员已锚定（产物按独立段建模）⇒ 不成组', () => {
    const plan = buildResourceMountPlan(sections408d, mapping408d, {
      productAnchorIds: new Set(['136:127', '136:128', '136:129']),
    });
    expect(plan.cardBgGroups).toHaveLength(0);
  });

  it('③ 阴性：几何异类（y 相差大）⇒ 不成组', () => {
    const scattered = mapping408d.map((m, i) => ({
      ...m,
      figmaBox: { ...m.figmaBox, y: 984 + i * 200 },
      parentBox: { ...m.parentBox, y: 984 + i * 200 },
    }));
    const plan = buildResourceMountPlan(sections408d, scattered, {
      productAnchorIds: new Set(['136:127']),
    });
    expect(plan.cardBgGroups).toHaveLength(0);
  });
});

// ── 2ffdaae3 形态（折叠锚=父行）：mc-max-1794409272887-2ffdaae3 逐字段实锤 ──
// 折叠接管把整行 136:121 建为一个 section（v-for ×3 渲染三张卡），三张 bg 的 owner
// （136:129/128/126）都不在产物锚点集 ⇒ 全员未锚定；但 ancestorIds 都含 136:121
// ⇒ 判据③b 公共产物祖先锚 ⇒ 成组，锚=父行 section 本身。
const mapping2ffd = [
  {
    figmaNodeId: '136:125',
    previewAnalysisRole: 'bg',
    downloadStatus: 'success',
    resourceFile: '../resources/images/bg-125.png',
    assignedVarName: 'bg1',
    ownerSectionId: '136:129',
    ancestorIds: ['136:129', '2:8023', '136:121', '2:7952'],
    targetDomSelector: '[data-section-id="136:129"]',
    figmaBox: { x: 37, y: 984, width: 140.48, height: 74.195 },
    parentBox: { x: 37, y: 984, width: 140.48, height: 74.195 },
    bgRole: 'container',
    mountTarget: 'slot',
  },
  {
    figmaNodeId: '136:124',
    previewAnalysisRole: 'bg',
    downloadStatus: 'success',
    resourceFile: '../resources/images/bg-124.png',
    assignedVarName: 'bg2',
    ownerSectionId: '136:128',
    ancestorIds: ['136:128', '2:8023', '136:121', '2:7952'],
    targetDomSelector: '[data-section-id="136:128"]',
    figmaBox: { x: 166, y: 984, width: 120, height: 74.195 },
    parentBox: { x: 166, y: 984, width: 120, height: 74.195 },
    bgRole: 'container',
    mountTarget: 'slot',
  },
  {
    figmaNodeId: '136:126',
    previewAnalysisRole: 'bg',
    downloadStatus: 'success',
    resourceFile: '../resources/images/bg-126.png',
    assignedVarName: 'bg3',
    ownerSectionId: '136:126',
    ancestorIds: ['136:126', '2:8023', '136:121', '2:7952'],
    targetDomSelector: '[data-section-id="136:126"]',
    figmaBox: { x: 274, y: 984, width: 141, height: 74.195 },
    parentBox: { x: 274, y: 984, width: 141, height: 74.195 },
    bgRole: 'container',
    mountTarget: 'slot',
  },
];

const sections2ffd = [
  { id: '2:7954', type: 'tabs', responsibility: '标签页切换区', elementCount: 2, sourceNodeIds: ['2:7954'] },
  { id: '136:122', type: 'sub-header', responsibility: '今日累计标题区', elementCount: 2, sourceNodeIds: ['136:122'] },
  { id: '136:121', type: 'content', responsibility: '统计卡行（整行折叠）', elementCount: 6, sourceNodeIds: ['136:121'] },
];

const STATS_2FFD = `<template>
  <div class="c-vehicle-monitor-stats" data-section-id="136:121">
    <div class="stat-card" v-for="item in statItems" :key="item.label">{{ item.value }}</div>
  </div>
</template>
<script setup>
const statItems = [1, 2, 3]
</script>`;

describe('buildResourceMountPlan · 判据③b 公共产物祖先锚（2ffdaae3 父行折叠形态）', () => {
  it('④ 阳性：全员未锚定但三张 bg 公共祖先含产物段 136:121 ⇒ 成组，anchorId=136:121', () => {
    const plan = buildResourceMountPlan(sections2ffd, mapping2ffd, {
      productAnchorIds: new Set(['136:121']),
    });
    expect(plan.cardBgGroups).toHaveLength(1);
    const g = plan.cardBgGroups[0];
    expect(g.anchorId).toBe('136:121');
    expect(g.members.map((m) => m.varName)).toEqual(['bg1', 'bg2', 'bg3']); // x 序
  });

  it('⑤ 阴性：全员未锚定且无公共产物祖先锚 ⇒ 落点无据不成组', () => {
    const plan = buildResourceMountPlan(sections2ffd, mapping2ffd, {
      productAnchorIds: new Set(['2:7954']), // 136:121 不在产物锚点集
    });
    expect(plan.cardBgGroups).toHaveLength(0);
  });

  it('⑥ 集成：父行锚落点注入（执行器按 data-section-id="136:121" 找活文件）', () => {
    const allFiles = {
      'package/index.vue': INDEX_VUE,
      'package/components/StatsSection.vue': STATS_2FFD,
      'package/sections/StatsSection.vue': '<template><div data-section-id="136:121"></div></template>',
    };
    const plan = buildResourceMountPlan(sections2ffd, mapping2ffd, {
      productAnchorIds: new Set(['136:121']),
    });
    const { mounted, diagnostics } = mountPlannedResources(allFiles, plan, { logger: null });
    const out = allFiles['package/components/StatsSection.vue'];
    expect(out).toContain('const FG_CARD_BGS = [bg1, bg2, bg3]');
    expect(out).toMatch(/class="stat-card"[^>]*FG_CARD_BGS\[/);
    expect(mounted.some((m) => m.mountTarget === 'v-for-item-rotation')).toBe(true);
    // 主循环按锚点把 bg1 挂段根、bg2/3 报 anchor-occupied 属良性留痕（随后被轮换剥除纠正）；
    // 真正的失败形态是 card-bg-group-* 诊断（锚点落点不存在/无 v-for/SFC 自检失败）。
    expect(diagnostics.filter((d) => String(d.reason || '').startsWith('card-bg-group'))).toHaveLength(0);
    // 段根的 bg1 错位挂载已被剥除
    const rootTag2ffd = out.match(/<div class="c-vehicle-monitor-stats"[^>]*>/);
    expect(rootTag2ffd[0]).not.toContain('bg1');
    expect(allFiles['package/sections/StatsSection.vue']).not.toContain('FG_CARD_BGS');
  });
});

describe('mountCardBgGroups · 轮换挂载执行器', () => {
  const plan408d = () =>
    buildResourceMountPlan(sections408d, mapping408d, {
      productAnchorIds: new Set(['136:127']),
    });

  it('① 集成（buildResourceMountPlan + mountPlannedResources）：剥错位 + 轮换 + 常量注入', () => {
    const allFiles = build408dFiles();
    const plan = plan408d();
    const { mounted } = mountPlannedResources(allFiles, plan, { logger: null });
    const out = allFiles['package/components/StatsSection.vue'];
    // x 序常量（轮换事实链）
    expect(out).toContain('const FG_CARD_BGS = [bg1, bg2, bg3]');
    // v-for 补索引 + item 轮换 :style
    expect(out).toContain('(item, _fgBgI) in statCards');
    expect(out).toMatch(/class="mc-stat-card"[^>]*FG_CARD_BGS\[_fgBgI % FG_CARD_BGS\.length\]/);
    // 错位消费全剥：段根 bg3 / icon img bg2 / value-wrap bg1
    const rootTag = out.match(/<div class="mc-stats"[^>]*>/);
    expect(rootTag).toBeTruthy();
    expect(rootTag[0]).not.toContain('bg3');
    const imgTag = out.match(/<img [^>]*>/);
    expect(imgTag[0]).not.toContain('bg2');
    const valueTag = out.match(/<div class="mc-stat-value"[^>]*>/);
    expect(valueTag[0]).not.toContain('bg1');
    // 挂载留痕
    expect(mounted.some((m) => m.mountTarget === 'v-for-item-rotation' && m.role === 'bg')).toBe(true);
  });

  it('② 幂等：二次执行不再改动', () => {
    const allFiles = build408dFiles();
    const plan = plan408d();
    mountPlannedResources(allFiles, plan, { logger: null });
    const once = allFiles['package/components/StatsSection.vue'];
    const r2 = mountCardBgGroups(allFiles, plan, { logger: null });
    expect(r2.mounted).toHaveLength(0);
    expect(allFiles['package/components/StatsSection.vue']).toBe(once);
  });

  it('③ 落点选择：index.vue 实际 import 的活文件优先，sections/ 死文件绝不落入', () => {
    const allFiles = build408dFiles();
    const plan = plan408d();
    mountCardBgGroups(allFiles, plan, { logger: null });
    expect(allFiles['package/components/StatsSection.vue']).toContain('FG_CARD_BGS');
    expect(allFiles['package/sections/StatsSection.vue']).not.toContain('FG_CARD_BGS');
  });

  it('④ fail-closed：落点无 v-for item ⇒ 诊断留痕且不写盘', () => {
    const allFiles = {
      'package/index.vue': INDEX_VUE,
      // 无 v-for 的扁平落点
      'package/components/StatsSection.vue':
        '<template><div data-section-id="136:127"><span>x</span></div></template>',
    };
    const plan = {
      cardBgGroups: [
        {
          anchorId: '136:127',
          members: [
            { file: '../resources/images/bg-125.png', varName: 'bg1', x: 37 },
            { file: '../resources/images/bg-124.png', varName: 'bg2', x: 166 },
          ],
        },
      ],
    };
    const { mounted, diagnostics } = mountCardBgGroups(allFiles, plan, { logger: null });
    expect(mounted).toHaveLength(0);
    expect(diagnostics.some((d) => d.reason === 'card-bg-group-no-vfor-item')).toBe(true);
    expect(allFiles['package/components/StatsSection.vue']).not.toContain('FG_CARD_BGS');
  });

  it('⑤ fail-closed：item 已有 :style ⇒ 不合并复杂表达式，放弃', () => {
    const allFiles = {
      'package/index.vue': INDEX_VUE,
      'package/components/StatsSection.vue': `<template>
  <div data-section-id="136:127">
    <div class="mc-stat-card" v-for="item in statCards" :key="item.label" :style="{ flex: 1 }">x</div>
  </div>
</template>
<script setup>
const statCards = [1, 2]
</script>`,
    };
    const plan = {
      cardBgGroups: [
        {
          anchorId: '136:127',
          members: [
            { file: '../resources/images/bg-125.png', varName: 'bg1', x: 37 },
            { file: '../resources/images/bg-124.png', varName: 'bg2', x: 166 },
          ],
        },
      ],
    };
    const { mounted, diagnostics } = mountCardBgGroups(allFiles, plan, { logger: null });
    expect(mounted).toHaveLength(0);
    expect(diagnostics.some((d) => d.reason === 'card-bg-group-item-style-occupied')).toBe(true);
  });

  it('⑥ v-for 已带索引 ⇒ 复用既有索引名，不重复包参', () => {
    const allFiles = {
      'package/index.vue': INDEX_VUE,
      'package/components/StatsSection.vue': `<template>
  <div data-section-id="136:127">
    <div class="mc-stat-card" v-for="(item, idx) in statCards" :key="idx">x</div>
  </div>
</template>
<script setup>
import bg1 from '../../resources/images/bg-125.png'
import bg2 from '../../resources/images/bg-124.png'
const statCards = [1, 2]
</script>`,
    };
    const plan = {
      cardBgGroups: [
        {
          anchorId: '136:127',
          members: [
            { file: '../resources/images/bg-125.png', varName: 'bg1', x: 37 },
            { file: '../resources/images/bg-124.png', varName: 'bg2', x: 166 },
          ],
        },
      ],
    };
    const { mounted } = mountCardBgGroups(allFiles, plan, { logger: null });
    expect(mounted).toHaveLength(1);
    const out = allFiles['package/components/StatsSection.vue'];
    expect(out).toContain('v-for="(item, idx) in statCards"'); // 原样保留
    expect(out).toContain('FG_CARD_BGS[idx % FG_CARD_BGS.length]');
    expect(out).toContain('const FG_CARD_BGS = [bg1, bg2]');
  });
});
