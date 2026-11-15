/**
 * 🛡️ P0-c（2026-11-15 · mc-max-1794714093985-c60fbe6f 实锤）· 图标真值的「section 兜底归属」阴阳对照
 *
 * 病灶：Figma 里图标 ownerSectionId 是中间 group（2:3571 / 2:3559 / 2:7625），
 *   产物 section 是上层（2:3565 / 88:32 / 1744:127）⇒ candidatesForSection 精确命中为空
 *   ⇒ truthIcons=0 ⇒ 整文件 `no-icon-truth` 跳过（实测 9 个图形块只处理 1 个）。
 *
 * 兜底判据：ancestorIds 中**第一个落在全量 section 集合内**的 id === 本 section 才归属。
 *   阴：根 section 不得把子孙图标收走（否则 index.vue 会抢所有图标）。
 */
import {
  collectIconTruth,
  collectAllSectionIds,
  nearestSectionAncestor,
  healIconTruthConservation,
  buildDrawClassIndex,
} from '../icon-truth-conservation.js';

/** 真机形态：owner 是中间 group，ancestorIds = 最近父 → 根 */
const MAPPINGS = [
  // 2:3552 → 直接父 2:3550（标题组）→ 88:32
  {
    figmaNodeId: '2:3552',
    resourceFile: '/resources/images/g-3552.png',
    assignedVarName: 'icon1',
    previewAnalysisRole: 'icon',
    usage: '<img :src="iconX">',
    ownerSectionId: '2:3550',
    ancestorIds: ['2:3550', '88:32', '2:9778'],
    figmaBox: { width: 8, height: 8 },
  },
  // 2:3573 → 2:3571（tit）→ 2:3565
  {
    figmaNodeId: '2:3573',
    resourceFile: '/resources/images/icon-3561.png',
    assignedVarName: 'icon2',
    previewAnalysisRole: 'icon',
    usage: '<img :src="iconX">',
    ownerSectionId: '2:3571',
    ancestorIds: ['2:3571', '2:3565', '2:9778'],
    figmaBox: { width: 18, height: 18.25 },
  },
  // 2:7626 → 2:7625 → 1744:127（3×12 圆角竖条）
  {
    figmaNodeId: '2:7626',
    resourceFile: '/resources/images/icon-7626.png',
    assignedVarName: 'icon3',
    previewAnalysisRole: 'icon',
    usage: '<img :src="iconX">',
    ownerSectionId: '2:7625',
    ancestorIds: ['2:7625', '1744:127', '2:9778'],
    figmaBox: { width: 3, height: 12 },
  },
  // 已在 section 内的精确归属（不受兜底影响）
  {
    figmaNodeId: '2:3441',
    resourceFile: '/resources/images/icon-3561.png',
    assignedVarName: 'icon4',
    previewAnalysisRole: 'icon',
    usage: '<img :src="iconX">',
    ownerSectionId: '2:3439',
    ancestorIds: ['2:3439', '2:9778'],
    figmaBox: { width: 18, height: 18.25 },
  },
];

const ALL_SECTIONS = new Set(['2:9778', '88:32', '2:3565', '1744:127', '2:3439']);

describe('nearestSectionAncestor', () => {
  it('取最近（ancestorIds 顺序首个）命中的 section', () => {
    expect(nearestSectionAncestor(MAPPINGS[1], ALL_SECTIONS)).toBe('2:3565');
    expect(nearestSectionAncestor(MAPPINGS[0], ALL_SECTIONS)).toBe('88:32');
  });

  it('无 ancestorIds / 全不命中 ⇒ null', () => {
    expect(nearestSectionAncestor({}, ALL_SECTIONS)).toBeNull();
    expect(nearestSectionAncestor({ ancestorIds: ['9:9'] }, ALL_SECTIONS)).toBeNull();
  });
});

describe('collectIconTruth · P0-c 兜底归属', () => {
  it('阳性：中间容器 owner 经祖先链兜底归属到本 section', () => {
    const truth = collectIconTruth(MAPPINGS, ['2:3565'], ALL_SECTIONS);
    expect(truth.map((t) => t.varName)).toEqual(['icon2']);
    expect(truth[0].fileName).toBe('icon-3561.png');
    expect(truth[0].size).toEqual({ w: 18, h: 18.25 });
  });

  it('阳性：三处中间容器 owner 各自落到自己的 section（不串味）', () => {
    expect(collectIconTruth(MAPPINGS, ['88:32'], ALL_SECTIONS).map((t) => t.varName)).toEqual(['icon1']);
    expect(collectIconTruth(MAPPINGS, ['1744:127'], ALL_SECTIONS).map((t) => t.varName)).toEqual(['icon3']);
    expect(collectIconTruth(MAPPINGS, ['2:3439'], ALL_SECTIONS).map((t) => t.varName)).toEqual(['icon4']);
  });

  it('阴：根 section 不得把子孙图标全部收走（关键护栏）', () => {
    const truth = collectIconTruth(MAPPINGS, ['2:9778'], ALL_SECTIONS);
    // 精确归属为空；兜底要求「最近 section 祖先 === 2:9778」，四个资源的最近祖先都不是根
    expect(truth).toHaveLength(0);
  });

  it('零回归：不传 allSectionIds ⇒ 走旧判据，中间容器 owner 命中为空', () => {
    expect(collectIconTruth(MAPPINGS, ['2:3565'])).toHaveLength(0);
    // 精确归属仍工作
    expect(collectIconTruth(MAPPINGS, ['2:3439']).map((t) => t.varName)).toEqual(['icon4']);
  });

  it('非 icon 角色 / 非 img usage 不进兜底池', () => {
    const mappings = [
      { ...MAPPINGS[1], previewAnalysisRole: 'bg' },
      { ...MAPPINGS[1], figmaNodeId: '2:9999', usage: ':style="{ backgroundImage: url(bg) }"' },
    ];
    expect(collectIconTruth(mappings, ['2:3565'], ALL_SECTIONS)).toHaveLength(0);
  });
});

describe('healIconTruthConservation · P0-c 端到端', () => {
  const LESS = `
.c-traffic-monitor-forecast-title-icon { transform: rotate(45deg); border-radius: 6px; }
`;

  const FORECAST = `<template>
  <div class="c-traffic-monitor-sec-forecast" data-section-id="2:3565">
    <div class="c-traffic-monitor-forecast-title">
      <span class="c-traffic-monitor-forecast-title-text">流量预测</span>
      <span class="c-traffic-monitor-forecast-title-icon"></span>
    </div>
    <div class="other">节假日预测</div>
  </div>
</template>

<script setup>
</script>
`;

  it('阳性：假图标块被真 <img> 替换（此前是 no-icon-truth 跳过）', () => {
    const files = { 'package/index.vue': FORECAST, 'resources/styles/common.less': LESS };
    const drawIndex = buildDrawClassIndex(files);
    const r = healIconTruthConservation(
      { 'package/index.vue': FORECAST },
      {
        mappings: MAPPINGS,
        drawIndex,
        allSectionIds: collectAllSectionIds(files),
        silent: true,
      },
    );
    const out = r.files['package/index.vue'];
    expect(r.stats.replaced).toBe(1);
    expect(r.stats.verdict).toBe('healed');
    expect(out).toContain('<img :src="icon2"');
    expect(out).toContain('18px');
    // 空 span 假图标已删除
    expect(out).not.toContain('forecast-title-icon"></span>');
    // 文案与 section 不动
    expect(out).toContain('流量预测');
    expect(out).toContain('data-section-id="2:3565"');
  });

  it('阴：不传 allSectionIds ⇒ 仍 no-icon-truth 跳过（证明兜底是唯一变量）', () => {
    const files = { 'package/index.vue': FORECAST, 'resources/styles/common.less': LESS };
    const drawIndex = buildDrawClassIndex(files);
    const r = healIconTruthConservation(
      { 'package/index.vue': FORECAST },
      { mappings: MAPPINGS, drawIndex, silent: true },
    );
    expect(r.files['package/index.vue']).toBe(FORECAST);
    expect(r.stats.skipped).toContain('package/index.vue:no-icon-truth');
  });

  it('collectAllSectionIds 跨文件聚合（索引只建全量才不会假绿）', () => {
    const files = {
      'package/index.vue': `<template><div data-section-id="2:3565"></div></template>`,
      'package/components/A.vue': `<template><div data-section-id="88:32"></div></template>`,
      'resources/styles/common.less': '.a{}',
    };
    expect([...collectAllSectionIds(files)].sort()).toEqual(['2:3565', '88:32'].sort());
  });
});
