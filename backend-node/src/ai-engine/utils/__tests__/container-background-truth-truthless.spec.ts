/**
 * M1（2026-11-03 · mc-1793718100141-30ba57ca 实锤）：无来源背景剥除 判据单测。
 *
 * 真机形态：卡片区真值仅 IMAGE 背景（bg-126），LLM 在 common.less / scoped style
 * 臆造 linear-gradient 叠到卡片主体/装饰条 → 双重上色。
 * 判据：背景声明值必须能在 Figma 全树 fills 找到等值来源，无来源剥除；
 * transparent/url()/CSS var/未解析 @变量 一律 fail-open 保留。
 */
import {
  healContainerBackgroundTruth,
  collectBackgroundTruthSet,
  hasBackgroundTruthSource,
  normalizeCss,
} from '../container-background-truth.js';

/** 真值：一张 IMAGE 卡片底 + 一条合法蓝渐变（供阳性对照的「合法保留」用） */
function buildFigma() {
  return {
    id: '136:127',
    type: 'FRAME',
    absoluteBoundingBox: { width: 425, height: 75 },
    children: [
      {
        id: '136:129',
        type: 'RECTANGLE',
        absoluteBoundingBox: { width: 10, height: 10 },
        fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.4, b: 0.6 } }],
      },
      {
        id: '136:128',
        type: 'RECTANGLE',
        absoluteBoundingBox: { width: 141, height: 75 },
        fills: [
          { type: 'IMAGE', visible: true },
          {
            type: 'GRADIENT_LINEAR',
            visible: true,
            gradientStops: [
              { position: 0, color: { r: 0.12, g: 0.62, b: 0.9, a: 1 } },
              { position: 1, color: { r: 0.02, g: 0.4, b: 0.75, a: 1 } },
            ],
          },
        ],
      },
    ],
  };
}

describe('M1 无来源背景剥除', () => {
  it('真值集合含合法渐变（归一化）', () => {
    const set = collectBackgroundTruthSet(buildFigma());
    expect(set.size).toBeGreaterThan(0);
    expect([...set].some((v) => v.includes('gradient'))).toBe(true);
  });

  it('阳性对照：臆造渐变被剥除，合法真值渐变保留', () => {
    const legit = 'linear-gradient(180deg, rgba(31, 158, 230, 1) 0%, rgba(5, 102, 191, 1) 100%)';
    // 与真值 stops 等值（0.12*255≈31 / 0.62*255≈158 / 0.9*255≈230；0.02*255≈5 / 0.4*255≈102 / 0.75*255≈191）
    const files = {
      'resources/styles/common.less': `
.c-vehicle-monitor-stat-card-top {
  height: 15px;
  background: linear-gradient(180deg, rgba(0, 145, 255, 0.3) 8%, rgba(31, 158, 255, 0.3) 100%);
}
.c-vehicle-monitor-legit {
  background: ${legit};
}
.c-vehicle-monitor-image {
  background: url('../resources/images/bg-126.png');
}
`,
    };
    const { changes } = healContainerBackgroundTruth(files, { figmaRoot: buildFigma() });
    const stripped = changes.filter((c) => c.reason === 'truthless-bg');
    expect(stripped.length).toBe(1);
    expect(stripped[0].selector).toContain('stat-card-top');
    const out = files['resources/styles/common.less'];
    expect(out).not.toContain('rgba(0, 145, 255, 0.3)');
    expect(out).toContain(legit); // 合法真值渐变原样保留
    expect(out).toContain('url('); // 图片背景豁免
    expect(out).toContain('height: 15px'); // 只剥声明，不动其它属性
  });

  it('scoped style 内的臆造渐变同样剥除（StatsSection.vue 形态）', () => {
    const files = {
      'package/components/StatsSection.vue': `<template><div class="x"/></template>
<style lang="less" scoped>
.x-body {
  display: flex;
  background: linear-gradient(180deg, rgba(31, 158, 255, 0.3) 0%, rgba(0, 145, 255, 0.3) 92%);
}
</style>`,
    };
    const { changes } = healContainerBackgroundTruth(files, { figmaRoot: buildFigma() });
    expect(changes.filter((c) => c.reason === 'truthless-bg').length).toBe(1);
    expect(files['package/components/StatsSection.vue']).not.toContain('rgba(31, 158, 255, 0.3)');
    expect(files['package/components/StatsSection.vue']).toContain('display: flex');
  });

  it('fail-open：transparent / @变量 / CSS var 不剥', () => {
    const lessVars = new Map();
    const truthSet = collectBackgroundTruthSet(buildFigma());
    expect(hasBackgroundTruthSource('transparent', { truthSet, lessVars })).toBe(true);
    expect(hasBackgroundTruthSource('@color-bg-unknown', { truthSet, lessVars })).toBe(true);
    expect(hasBackgroundTruthSource('var(--x-bg)', { truthSet, lessVars })).toBe(true);
    expect(hasBackgroundTruthSource('url("a.png")', { truthSet, lessVars })).toBe(true);
  });

  it('hex 与真值 rgba 双形态等值 → 保留；无来源 hex → 剥除', () => {
    const lessVars = new Map();
    const truthSet = collectBackgroundTruthSet(buildFigma());
    // 真值含 SOLID rgba(51,102,153,1) = #336699（hex→rgba 双形态等值）
    expect(hasBackgroundTruthSource('#336699', { truthSet, lessVars })).toBe(true);
    expect(hasBackgroundTruthSource('#ff0000', { truthSet, lessVars })).toBe(false);
  });

  it('无 figmaRoot / 真值空集 → 整体跳过', () => {
    const files = { 'resources/styles/common.less': '.a { background: #ff0000; }' };
    const r1 = healContainerBackgroundTruth(files, {});
    expect(r1.changes.filter((c) => c.reason === 'truthless-bg').length).toBe(0);
    const r2 = healContainerBackgroundTruth(files, { figmaRoot: { id: 'x', type: 'FRAME' } });
    expect(r2.changes.filter((c) => c.reason === 'truthless-bg').length).toBe(0);
  });

  it('幂等：剥除后再跑一遍无新增变更', () => {
    const files = {
      'resources/styles/common.less':
        '.a { background: linear-gradient(180deg, rgba(1,2,3,0.5) 0%, rgba(4,5,6,0.5) 100%); }',
    };
    healContainerBackgroundTruth(files, { figmaRoot: buildFigma() });
    const second = healContainerBackgroundTruth({ ...files }, { figmaRoot: buildFigma() });
    expect(second.changes.filter((c) => c.reason === 'truthless-bg').length).toBe(0);
  });
});
