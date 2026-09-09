import { normalizeFlexSourceConflicts, normalizeFlexSiblingScale, detectFlexSiblingIssues } from './flex-sibling-guard.js';

/**
 * FLEX-003 确定性归一回归（2026-09-02，mc-max-1788362388732-1ae956dc 重试耗尽实锤）
 */
describe('normalizeFlexSourceConflicts —— FLEX-003 量纲归一', () => {
  it('同 class 跨文件：scoped 像素量级 113 vs common.less 比例量级 1 → 对齐到 113', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template><div class="c-root"></div></template>
<style lang="less" scoped>
.c-env-monitor-chart-section { flex: 113 1 0; min-height: 80px; }
</style>`,
      },
      {
        path: 'resources/styles/common.less',
        content: `.c-env-monitor-chart-section { flex: 1 1 0; display: flex; flex-direction: column; min-height: 0; }\n`,
      },
    ];
    const out = normalizeFlexSourceConflicts(files);
    const common = out.find((f) => f.path.endsWith('common.less'))!.content;
    // grow 对齐到像素量级
    expect(common).toMatch(/flex:\s*113\s+1\s+0/);
    // 其它属性保留
    expect(common).toMatch(/display:\s*flex/);
    expect(common).toMatch(/flex-direction:\s*column/);
    expect(common).toMatch(/min-height:\s*0/);
    // 像素量级那份不动
    expect(out.find((f) => f.path.endsWith('index.vue'))!.content).toMatch(
      /flex:\s*113\s+1\s+0/,
    );
  });

  it('裸简写 flex:1 → 对齐到像素量级', () => {
    const files = [
      { path: 'package/index.vue', content: '<style scoped>.c-sec { flex: 180 1 0; }</style>' },
      { path: 'resources/styles/common.less', content: '.c-sec { flex: 1; }' },
    ];
    const out = normalizeFlexSourceConflicts(files)!;
    expect(out.find((f) => f.path.endsWith('common.less'))!.content).toMatch(
      /flex:\s*180\s+1\s+0/,
    );
  });

  it('grow=0 附属区不参与归一（不改写）', () => {
    const files = [
      { path: 'package/index.vue', content: '<style scoped>.c-sec { flex: 200 1 0; }</style>' },
      { path: 'resources/styles/common.less', content: '.c-sec { flex: 0 1 0; }' },
    ];
    const out = normalizeFlexSourceConflicts(files);
    expect(out.find((f) => f.path.endsWith('common.less'))!.content).toMatch(
      /flex:\s*0\s+1\s+0/,
    );
  });

  it('无跨文件量纲冲突 → 返回原引用（幂等，不误改）', () => {
    const files = [
      { path: 'package/index.vue', content: '<style scoped>.c-sec { flex: 113 1 0; }</style>' },
      { path: 'resources/styles/common.less', content: '.c-sec { flex: 113 1 0; }' },
    ];
    expect(normalizeFlexSourceConflicts(files)).toBe(files);
  });

  it('单文件 / 非数组 → 原样返回', () => {
    expect(normalizeFlexSourceConflicts([{ path: 'a.less', content: '.x{flex:1 1 0;}' }])).toHaveLength(1);
    expect(normalizeFlexSourceConflicts([])).toEqual([]);
  });
});

/**
 * FLEX-005 确定性归一回归（2026-09-03，mc-max-1788373364090 重试耗尽实锤；
 * 2026-09-08 归一方向修正：mc-max-1788917942199-ba330e3e 等分抹平比例实锤）。
 *
 * 不同兄弟 class 量纲混用（flex:1 比例 vs flex:317 像素）→ 把像素量级兄弟按同组
 * 像素兄弟占比归一化为 flex:<proportion> 1 0，保留设计稿相对比例。
 *
 * ⛔ 量纲铁律：严禁统一归一化为 flex:1 1 0（等分）→ 丢失比例（事故 mc-max-1788917942199）。
 */
describe('normalizeFlexSiblingScale —— FLEX-005 量纲归一（像素→比例）', () => {
  it('单像素兄弟：SummaryCards flex:1 + TabAndContent flex:317 → 归一为 flex:1.000 1 0', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template><div class="c-monitor-body"><SummaryCards /><TabAndContent /></div></template>`,
      },
      {
        path: 'package/components/SummaryCards.vue',
        content: `<template><div class="c-monitor-summary-cards"></div></template>
<style scoped>.c-monitor-summary-cards { flex: 1 1 0; }</style>`,
      },
      {
        path: 'package/components/TabAndContent.vue',
        content: `<template><div class="c-monitor-tab-content"></div></template>
<style scoped>.c-monitor-tab-content { flex: 317 1 0; }</style>`,
      },
      {
        path: 'resources/styles/common.less',
        content: '.c-monitor-body { display: flex; flex-direction: column; }\n',
      },
    ];
    // 归一化前 FLEX-005 命中
    expect(detectFlexSiblingIssues(files).filter((i) => i.id === 'FLEX-005').length).toBe(1);
    const out = normalizeFlexSiblingScale(files);
    // 单像素兄弟(317) 占比 = 317/317 = 1.000
    expect(out.find((f) => f.path.includes('TabAndContent'))!.content).toMatch(/flex:\s*1\.000\s+1\s+0/);
    // 比例兄弟不动
    expect(out.find((f) => f.path.includes('SummaryCards'))!.content).toMatch(/flex:\s*1\s+1\s+0/);
    // 归一化后 FLEX-005 归零
    expect(detectFlexSiblingIssues(out).filter((i) => i.id === 'FLEX-005').length).toBe(0);
  });

  it('双像素兄弟 131:174 混比例兄弟 → 归一为 flex:0.430 1 0 和 flex:0.570 1 0（保留比例）', () => {
    const files = [
      {
        path: 'package/index.vue',
        content: `<template><div class="c-test-body"><BridgeChart /><FlowPrediction /><OtherSibling /></div></template>`,
      },
      {
        path: 'package/components/BridgeChart.vue',
        content: `<template><div class="c-test-bridge"></div></template>
<style scoped>.c-test-bridge { flex: 131 1 0; }</style>`,
      },
      {
        path: 'package/components/FlowPrediction.vue',
        content: `<template><div class="c-test-prediction"></div></template>
<style scoped>.c-test-prediction { flex: 174 1 0; }</style>`,
      },
      {
        path: 'package/components/OtherSibling.vue',
        content: `<template><div class="c-test-other"></div></template>`,
      },
      {
        path: 'resources/styles/common.less',
        content: `.c-test-body { display: flex; flex-direction: column; }
.c-test-other { flex: 1 1 0; }
`,
      },
    ];
    // 归一化前 FLEX-005 命中（scoped 像素 131/174 + common 比例 1 → 混排）
    expect(detectFlexSiblingIssues(files).filter((i) => i.id === 'FLEX-005').length).toBe(1);
    const out = normalizeFlexSiblingScale(files);
    // 131/(131+174) ≈ 0.430
    expect(out.find((f) => f.path.includes('BridgeChart'))!.content).toMatch(/flex:\s*0\.430\s+1\s+0/);
    // 174/(131+174) ≈ 0.570
    expect(out.find((f) => f.path.includes('FlowPrediction'))!.content).toMatch(/flex:\s*0\.570\s+1\s+0/);
    // 比例兄弟不动（无 scoped style，不参与归一）
    expect(out.find((f) => f.path.includes('OtherSibling'))!.content).not.toMatch(/flex:\s*0\./);
    expect(detectFlexSiblingIssues(out).filter((i) => i.id === 'FLEX-005').length).toBe(0);
  });

  it('全比例量级同组 → 不改写（幂等）', () => {
    const files = [
      { path: 'package/index.vue', content: '<template><div class="c-body"><A /><B /></div></template>' },
      { path: 'package/components/A.vue', content: '<template><div class="c-a"></div></template><style scoped>.c-a { flex: 1 1 0; }</style>' },
      { path: 'package/components/B.vue', content: '<template><div class="c-b"></div></template><style scoped>.c-b { flex: 1 1 0; }</style>' },
      { path: 'resources/styles/common.less', content: '.c-body { display: flex; flex-direction: column; }' },
    ];
    expect(normalizeFlexSiblingScale(files)).toBe(files);
  });
});
