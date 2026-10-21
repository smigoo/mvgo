/**
 * 刀 42-B spec（2026-10-21 · mc-1792580653375-60212fb6 实锤）：
 *   面板装饰（底色/圆角/外发光）被搬到**标题行 class** 上 ⇒ 从子元素移除。
 *
 * 真机证据（产物 common.less 原文）：
 *   `.c-60212f-header-text  { background: @color-bg-vendor-gold; border-radius: 12px; box-shadow: inset 0px 0px 16px 0px #ffc800; }`
 *   `.c-60212f-header-text2 { background: @color-bg-vendor-mint; border-radius: 12px; box-shadow: inset 0px 0px 16px 0px rgba(53, 190, 82, 0.82); }`
 *   而三段面板容器 `.c-60212f-container` 只有 `display:flex; width:100%`。
 */
import {
  shadowColorKey,
  radiusNumber,
  isPanelChromeProp,
  healPanelChromeMisplacement,
} from '../panel-chrome-misplacement.js';

const box = (x, y, w, h) => ({ x, y, width: w, height: h });

const GOLD = { r: 226 / 255, g: 208 / 255, b: 132 / 255, a: 0.2 };
const GLOW_GOLD = {
  type: 'INNER_SHADOW',
  offset: { x: 0, y: 0 },
  radius: 16,
  spread: 0,
  color: { r: 1, g: 200 / 255, b: 0, a: 1 },
};

const buildFigma = () => ({
  document: {
    id: 'root',
    type: 'FRAME',
    absoluteBoundingBox: box(0, 0, 1200, 600),
    children: [
      {
        id: 'panel-gold',
        type: 'GROUP',
        absoluteBoundingBox: box(0, 0, 1200, 240),
        children: [
          {
            id: 'panel-gold-bg',
            type: 'RECTANGLE',
            absoluteBoundingBox: box(0, 0, 1200, 240),
            cornerRadius: 12,
            fills: [{ type: 'SOLID', opacity: 1, color: GOLD }],
            effects: [GLOW_GOLD],
          },
        ],
      },
      {
        id: 'card-blue',
        type: 'GROUP',
        absoluteBoundingBox: box(0, 260, 265, 76),
        children: [
          {
            id: 'card-blue-bg',
            type: 'VECTOR',
            absoluteBoundingBox: box(0, 260, 265, 76),
            cornerRadius: 6,
            fills: [{ type: 'SOLID', opacity: 1, color: { r: 0.2, g: 0.5, b: 0.9, a: 1 } }],
          },
        ],
      },
    ],
  },
});

const THEME_VARS = `@color-bg-vendor-gold: rgba(226, 208, 132, 0.2);
@radius-panel: 12px;
`;

/** 真机形态：标题 class 上挂着面板三件套 */
const COMMON_LESS = `.c-panel-container {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.c-header-text {
  height: 100%;
  background: @color-bg-vendor-gold;
  border-radius: 12px;
  box-shadow: inset 0px 0px 16px 0px #ffc800;
  display: flex;
}
`;

const INDEX_VUE = `<template>
  <div class="c-panel-container" data-section-id="panel-gold" style="display:flex;flex-direction:column;"></div>
</template>
`;

const HEADER_VUE = `<template>
  <div class="c-header-text" data-section-id="panel-gold-tail-text" v-bind="$attrs"></div>
</template>
`;

const buildFiles = () => ({
  'package/index.vue': INDEX_VUE,
  'package/components/HeaderText.vue': HEADER_VUE,
  'resources/styles/common.less': COMMON_LESS,
  'resources/styles/themes/theme-vars.less': THEME_VARS,
});

describe('刀 42-B 判据构件', () => {
  it('shadowColorKey：hex / rgba 都归一到 r,g,b（忽略 alpha）', () => {
    expect(shadowColorKey('inset 0px 0px 16px 0px #ffc800')).toBe('255,200,0');
    expect(shadowColorKey('inset 0 0 16px 0 rgba(25, 181, 186, 0.67)')).toBe('25,181,186');
    expect(shadowColorKey('inset 0 0 16px 0 rgba(53,190,82,0.82)')).toBe('53,190,82');
  });

  it('shadowColorKey 阴性：无颜色 token ⇒ null', () => {
    expect(shadowColorKey('none')).toBe(null);
    expect(shadowColorKey('0 0 4px currentColor')).toBe(null);
    expect(shadowColorKey('')).toBe(null);
  });

  it('radiusNumber：取首个数值', () => {
    expect(radiusNumber('12px')).toBe(12);
    expect(radiusNumber('12px 12px 0 0')).toBe(12);
    expect(radiusNumber('0.5rem')).toBe(0.5);
    expect(radiusNumber('none')).toBe(null);
  });

  it('isPanelChromeProp 只认三件套（border 不在此列，归刀 38）', () => {
    expect(isPanelChromeProp('background')).toBe(true);
    expect(isPanelChromeProp('background-color')).toBe(true);
    expect(isPanelChromeProp('border-radius')).toBe(true);
    expect(isPanelChromeProp('box-shadow')).toBe(true);
    expect(isPanelChromeProp('border')).toBe(false);
    expect(isPanelChromeProp('color')).toBe(false);
  });
});

describe('刀 42-B healPanelChromeMisplacement', () => {
  it('① 阳性：标题 class 上的三件套全部删除（面板容器不动）', () => {
    const { files, changes } = healPanelChromeMisplacement(buildFiles(), { figmaRoot: buildFigma() });
    const less = files['resources/styles/common.less'];
    expect(less).not.toContain('background: @color-bg-vendor-gold');
    expect(less).not.toContain('border-radius: 12px');
    expect(less).not.toContain('#ffc800');
    // 非三件套的声明必须留下
    expect(less).toContain('display: flex');
    expect(less).toContain('height: 100%');
    // 面板容器与 theme-vars 一字不动
    expect(files['package/index.vue']).toBe(INDEX_VUE);
    expect(files['resources/styles/themes/theme-vars.less']).toBe(THEME_VARS);
    expect(changes.some((c) => c.cls === 'c-header-text')).toBe(true);
  });

  it('② 幂等：删除后复跑零变更', () => {
    const first = healPanelChromeMisplacement(buildFiles(), { figmaRoot: buildFigma() });
    const second = healPanelChromeMisplacement({ ...first.files }, { figmaRoot: buildFigma() });
    expect(second.changes).toHaveLength(0);
  });

  it('③ 阴性：圆角与面板真值不符（卡片 r6）⇒ 不动', () => {
    const less = `.c-card-text {
  background: rgba(226, 208, 132, 0.2);
  border-radius: 6px;
  box-shadow: inset 0px 0px 16px 0px #ffc800;
}
`;
    const cardVue = `<template>
  <div class="c-card-text" data-section-id="panel-gold-tail-text" v-bind="$attrs"></div>
</template>
`;
    const files = {
      ...buildFiles(),
      'package/components/HeaderText.vue': cardVue,
      'resources/styles/common.less': less,
    };
    const { files: out, changes } = healPanelChromeMisplacement(files, { figmaRoot: buildFigma() });
    expect(out['resources/styles/common.less']).toBe(less);
    expect(changes).toHaveLength(0);
  });

  it('④ 阴性：发光颜色不属于任何面板 ⇒ 不动（证据不足）', () => {
    const less = `.c-header-text {
  background: @color-bg-vendor-gold;
  border-radius: 12px;
  box-shadow: inset 0px 0px 16px 0px #123456;
}
`;
    const files = { ...buildFiles(), 'resources/styles/common.less': less };
    const { changes } = healPanelChromeMisplacement(files, { figmaRoot: buildFigma() });
    expect(changes).toHaveLength(0);
  });

  it('⑤ 阴性：缺 box-shadow（只有底色+圆角）⇒ 不触发（需双证据）', () => {
    const less = `.c-header-text {
  background: @color-bg-vendor-gold;
  border-radius: 12px;
}
`;
    const files = { ...buildFiles(), 'resources/styles/common.less': less };
    const { changes } = healPanelChromeMisplacement(files, { figmaRoot: buildFigma() });
    expect(changes).toHaveLength(0);
  });

  it('⑥ 阴性：class 被别的元素共用 ⇒ 不删（共享 class 铁律）', () => {
    const sharedVue = `<template>
  <div class="c-header-text" data-section-id="panel-gold-tail-text" v-bind="$attrs"></div>
</template>
`;
    const otherVue = `<template>
  <div class="c-header-text"></div>
</template>
`;
    const files = { ...buildFiles(), 'package/components/Other.vue': otherVue };
    const { files: out } = healPanelChromeMisplacement(files, { figmaRoot: buildFigma() });
    expect(out['resources/styles/common.less']).toBe(COMMON_LESS);
    expect(out['package/components/HeaderText.vue']).toBe(sharedVue);
  });

  it('⑦ 阴性：元素自身有面板底真值 ⇒ 跳过（三件套是它的）', () => {
    // 面板本身（panel-gold）声明了同样的三件套 —— 属于自己，不得删
    const indexVue = `<template>
  <div class="c-panel-container" data-section-id="panel-gold" style="background:rgba(226, 208, 132, 0.2);border-radius:12px;box-shadow:inset 0px 0px 16px 0px #ffc800;"></div>
</template>
`;
    const files = { ...buildFiles(), 'package/index.vue': indexVue };
    const { files: out, changes } = healPanelChromeMisplacement(files, { figmaRoot: buildFigma() });
    expect(out['package/index.vue']).toBe(indexVue);
    // 只有标题行（tail-text）被判误置；面板自身绝不进变更名单
    expect(changes.every((c) => c.sectionId !== 'panel-gold')).toBe(true);
  });

  it('⑧ 阳性：inline 风格的三件套也删（元素级，不受共享 class 限制）', () => {
    const headerVue = `<template>
  <div class="c-header-text" data-section-id="panel-gold-tail-text" style="background:rgba(226, 208, 132, 0.2);border-radius:12px;box-shadow:inset 0px 0px 16px 0px #ffc800;flex:1;" v-bind="$attrs"></div>
</template>
`;
    const files = { ...buildFiles(), 'package/components/HeaderText.vue': headerVue };
    const { files: out, changes } = healPanelChromeMisplacement(files, { figmaRoot: buildFigma() });
    const line = out['package/components/HeaderText.vue'].split('\n').find((l) => l.includes('data-section-id'));
    expect(line).toContain('flex:1');
    expect(line).not.toContain('border-radius');
    expect(line).not.toContain('box-shadow');
    expect(changes.some((c) => c.where === 'inline')).toBe(true);
  });

  it('⑨ 阴性：无 figmaRoot ⇒ 全量不动', () => {
    const files = buildFiles();
    const before = JSON.stringify(files);
    const { changes } = healPanelChromeMisplacement(files, {});
    expect(changes).toHaveLength(0);
    expect(JSON.stringify(files)).toBe(before);
  });
});
