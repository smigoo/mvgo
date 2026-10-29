/**
 * 刀 32 spec：颜色归属律守卫（只报不改）。
 * 覆盖：阳性（借用后代色 / 借用兄弟色）、反向（自身 fills / 祖先链 / 自身背景层 / 臆造色不越界 /
 * 渐变跳过 / inline 优先 / 未解析变量跳过）、归一化与合成后缀 id。
 */
import {
  auditSectionColorAttribution,
  subtreeProminentKeys,
  selfFillKeys,
  backdropKeys,
  isUnjudgeable,
} from './section-color-attribution-guard.js';

const solid = (r, g, b, a = 1, opacity = 1) => ({
  type: 'SOLID',
  visible: true,
  color: { r, g, b, a },
  opacity,
});
const N = (v) => v / 255;

/** 通用 figma 树：P:1 下 S:1(GROUP 无 fills，含后代卡 C:1) + T:1(FRAME 兄弟面板) */
function buildFigma(overrides = {}) {
  const S1 = {
    id: 'S:1',
    type: 'GROUP',
    name: 'slot-con',
    absoluteBoundingBox: { x: 0, y: 0, width: 1000, height: 800 },
    fills: [],
    children: [
      {
        id: 'C:1',
        type: 'RECTANGLE',
        name: 'card-1-active',
        absoluteBoundingBox: { x: 0, y: 0, width: 900, height: 60 },
        fills: [solid(N(166), N(206), N(255), 1)],
      },
    ],
    ...(overrides.S1 || {}),
  };
  const T1 = {
    id: 'T:1',
    type: 'FRAME',
    name: 'other-panel',
    absoluteBoundingBox: { x: 0, y: 800, width: 1000, height: 200 },
    fills: [solid(N(226), N(208), N(132), 1, 0.2)],
    children: [],
    ...(overrides.T1 || {}),
  };
  return {
    document: {
      id: '0:0',
      type: 'FRAME',
      name: 'root',
      absoluteBoundingBox: { x: 0, y: 0, width: 1000, height: 1000 },
      children: [
        {
          id: 'P:1',
          type: 'FRAME',
          name: 'parent',
          absoluteBoundingBox: { x: 0, y: 0, width: 1000, height: 1000 },
          fills: [],
          children: [S1, T1],
        },
      ],
    },
  };
}

const vueWith = (sectionId, cls, inline = '') => `
<template>
  <div class="${cls}" data-section-id="${sectionId}"${inline ? ` style="${inline}"` : ''}></div>
</template>
<style lang="less" scoped>@import '../resources/styles/common.less';</style>
`;

const commonLess = `
.current-card-con { background: @color-bg-card-active; }
@media md { .x { color: red; } }
`;
// 与真实产物同构：theme-vars.less 的变量定义在 mixin 体内、**独占一行**（缩进后顶格起）
// ——这是 parseLessVars（/^\s*@…/gm）唯一能解析的形态；写成「mixin 与变量同行」是假 fixture。
const themeVars = `
.common() {
  @fontSize: var(--fontSize);
  @font-size-sm: 12px;
}

.theme-light() {
  @color-bg-card-active: rgba(166, 206, 255, 1);
}

.theme-dark() {
  @color-bg-card-active: #141e29;
}
`;

function filesWith(entries) {
  const files = {
    '/p/package/index.vue': entries.vue,
    '/p/resources/styles/common.less': entries.less ?? commonLess,
    '/p/resources/styles/themes/theme-vars.less': themeVars,
  };
  return files;
}

describe('刀32 颜色归属律守卫', () => {
  it('阳性：容器无 fills，class 背景 = 后代小图形色（@var 解析后）→ descendant', () => {
    const figma = buildFigma();
    const files = filesWith({
      vue: vueWith('S:1', 'current-card-con'),
      less: `.current-card-con { background: @color-bg-card-active; }`,
    });
    const r = auditSectionColorAttribution(files, figma);
    expect(r.skipped).toBe(false);
    // 阳性对照：@var 必须真被解析并进入判定。若解析回归（变量只在 mixin 同行出现等），
    // 该计数会掉到 0、findings 也会是空——用例必须立刻转红，不许静默变绿。
    expect(r.stats.judged).toBe(1);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ sectionId: 'S:1', source: 'descendant', norm: '#a6ceff' });
  });

  it('阳性：容器声明色 = 兄弟子树醒目色 → sibling', () => {
    const figma = buildFigma();
    const files = filesWith({
      vue: vueWith('S:1', 'current-card-con'),
      // S:1 声明卡级高亮的兄弟面板黄（rgba(226,208,132,.2) = 兄弟 T:1 的 fills）
      less: `.current-card-con { background: rgba(226, 208, 132, 0.2); }`,
    });
    const r = auditSectionColorAttribution(files, figma);
    expect(r.stats.judged).toBe(1);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ sectionId: 'S:1', source: 'sibling', norm: '#e2d084@0.2' });
  });

  it('反向：容器自身 fills 含该色 → 合法，不报', () => {
    const figma = buildFigma({ S1: { fills: [solid(N(166), N(206), N(255), 1)] } });
    const files = filesWith({
      vue: vueWith('S:1', 'current-card-con'),
      less: `.current-card-con { background: @color-bg-card-active; }`,
    });
    const r = auditSectionColorAttribution(files, figma);
    expect(r.findings).toHaveLength(0);
    expect(r.stats.judged).toBe(1);
  });

  it('反向：色来自祖先链 fills → 合法，不报', () => {
    const figma = buildFigma({ T1: {}, S1: {} });
    // 给 P:1 加 fills = #a6ceff（祖先背景真值）
    figma.document.children[0].fills = [solid(N(166), N(206), N(255), 1)];
    const files = filesWith({
      vue: vueWith('S:1', 'current-card-con'),
      less: `.current-card-con { background: @color-bg-card-active; }`,
    });
    const r = auditSectionColorAttribution(files, figma);
    expect(r.findings).toHaveLength(0);
  });

  it('反向：色 = 自身直接子级背景层（面积≥60% 纯图形）→ 合法，不报', () => {
    const figma = buildFigma({
      S1: {
        fills: [],
        children: [
          {
            id: 'C:bg',
            type: 'RECTANGLE',
            name: 'panel-bg',
            absoluteBoundingBox: { x: 0, y: 0, width: 1000, height: 800 },
            fills: [solid(N(166), N(206), N(255), 1)],
          },
        ],
      },
    });
    const files = filesWith({
      vue: vueWith('S:1', 'current-card-con'),
      less: `.current-card-con { background: @color-bg-card-active; }`,
    });
    const r = auditSectionColorAttribution(files, figma);
    expect(r.findings).toHaveLength(0);
  });

  it('反向：臆造色（设计里根本不存在）→ 不越界，不报', () => {
    const figma = buildFigma();
    const files = filesWith({
      vue: vueWith('S:1', 'current-card-con'),
      less: `.current-card-con { background: rgba(1, 2, 3, 1); }`,
    });
    const r = auditSectionColorAttribution(files, figma);
    expect(r.findings).toHaveLength(0);
  });

  it('反向：渐变 / url / transparent / 未解析变量一律跳过', () => {
    const figma = buildFigma();
    for (const v of [
      'linear-gradient(180deg, #a6ceff, #fff)',
      "url('/img/a.png')",
      'transparent',
      '@unknown-var',
    ]) {
      const files = filesWith({
        vue: vueWith('S:1', 'current-card-con'),
        less: `.current-card-con { background: ${v}; }`,
      });
      const r = auditSectionColorAttribution(files, figma);
      expect(r.findings).toHaveLength(0);
    }
  });

  it('反向：inline style 优先（合法）时，class 的借色不再判', () => {
    const figma = buildFigma({ S1: { fills: [solid(N(166), N(206), N(255), 1)] } });
    const files = filesWith({
      vue: vueWith('S:1', 'current-card-con', 'background:rgba(166,206,255,1)'),
      less: `.current-card-con { background: rgba(9, 9, 9, 1); }`,
    });
    const r = auditSectionColorAttribution(files, figma);
    expect(r.findings).toHaveLength(0);
  });

  it('合成后缀 id（S:1-list）归一到基 id 判定', () => {
    const figma = buildFigma();
    const files = filesWith({
      vue: vueWith('S:1-list', 'current-card-con'),
      less: `.current-card-con { background: @color-bg-card-active; }`,
    });
    const r = auditSectionColorAttribution(files, figma);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].source).toBe('descendant');
  });

  it('无 figma / 无样式源 → skipped', () => {
    expect(auditSectionColorAttribution({}, null).skipped).toBe(true);
    expect(
      auditSectionColorAttribution({ '/p/a.vue': '<div></div>' }, buildFigma()).skipped,
    ).toBe(true);
  });

  it('helper：selfFillKeys / backdropKeys / subtreeProminentKeys 口径', () => {
    const figma = buildFigma();
    const S1 = figma.document.children[0].children[0];
    expect([...selfFillKeys(S1)]).toEqual([]);
    expect([...backdropKeys(S1)]).toEqual([]); // 后代卡面积 900*60 / (1000*800) = 6.75% < 60%
    const keys = subtreeProminentKeys(S1, 1000 * 1000, 0.01);
    expect(keys.has('#a6ceff')).toBe(true); // 900*60/1e6 = 5.4% ≥ 1%
  });

  it('helper：isUnjudgeable 只拦渐变 / url / 关键词 / 未解析变量', () => {
    for (const v of [
      'linear-gradient(180deg, #a6ceff, #fff)',
      "url('/img/a.png')",
      'transparent',
      'inherit',
      'none',
      'currentColor',
      'var(--color-bg)',
      '@color-bg-card-active',
    ]) {
      expect(isUnjudgeable(v)).toBe(true);
    }
    for (const v of ['#a6ceff', 'rgba(166, 206, 255, 1)', '#fff', '#141e29']) {
      expect(isUnjudgeable(v)).toBe(false);
    }
  });
});
