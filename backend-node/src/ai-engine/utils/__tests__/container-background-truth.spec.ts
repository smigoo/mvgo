/**
 * 刀 37 spec（2026-10-21 · 07ae49a2 实锤）：容器背景跨块错绑 / 渐变缺失 ⇒ 按 figma 背景层真值纠偏。
 *
 * 真机形态：卡 2 的 class 背景 = `@color-border-yellow` = rgba(226,208,132,.2)，
 * 那正是「战略合作厂商」面板（38:3137 / bg 层 38:3138）的底色；卡 2 真值 bg 层 38:3283
 * 与卡 1 的 38:3261 是同一条水平蓝渐变。
 */
import {
  fillsToCss,
  normalizeCss,
  indexFigmaNodes,
  resolveSectionBackground,
  resolveSectionPanel,
  parseLessVars,
  collectClassBackgrounds,
  healContainerBackgroundTruth,
} from '../container-background-truth.js';

const NOOP_LOGGER = { info() {}, warn() {}, error() {}, debug() {} };

const GRADIENT_BLUE = {
  type: 'GRADIENT_LINEAR',
  opacity: 0.4,
  gradientHandlePositions: [
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
    { x: 0, y: 3.85 },
  ],
  gradientStops: [
    { position: 0, color: { r: 0.8313725590705872, g: 0.8901960849761963, b: 0.9960784316062927, a: 1 } },
    { position: 0.5, color: { r: 0, g: 0.5166666507720947, b: 1, a: 1 } },
    { position: 1, color: { r: 0.8352941274642944, g: 0.8901960849761963, b: 0.9960784316062927, a: 1 } },
  ],
};

const SOLID_YELLOW = {
  type: 'SOLID',
  opacity: 0.2,
  color: { r: 0.8879582285881042, g: 0.8138772249221802, b: 0.5175531506538391, a: 1 },
};

const box = (x, y, w, h) => ({ x, y, width: w, height: h });

/** 复刻真机结构：两张同形卡 + 一个黄底面板 */
const buildFigma = () => ({
  document: {
    id: 'root',
    name: 'panel',
    type: 'FRAME',
    absoluteBoundingBox: box(0, 0, 800, 900),
    children: [
      {
        id: 'card1',
        name: 'Group card1',
        type: 'GROUP',
        absoluteBoundingBox: box(0, 0, 265, 76),
        children: [
          { id: 'card1-bg', name: 'Rectangle', type: 'VECTOR', absoluteBoundingBox: box(0, 0, 265, 76), fills: [GRADIENT_BLUE] },
          { id: 'card1-icon', name: 'icon', type: 'GROUP', absoluteBoundingBox: box(20, 13, 53, 55), children: [] },
        ],
      },
      {
        id: 'card2',
        name: 'Group card2',
        type: 'GROUP',
        absoluteBoundingBox: box(300, 0, 265, 76),
        children: [
          { id: 'card2-bg', name: 'Rectangle', type: 'VECTOR', absoluteBoundingBox: box(300, 0, 265, 76), fills: [GRADIENT_BLUE] },
          { id: 'card2-icon', name: 'icon', type: 'GROUP', absoluteBoundingBox: box(320, 13, 53, 55), children: [] },
        ],
      },
      {
        id: 'panel-yellow',
        name: 'Group 战略',
        type: 'GROUP',
        absoluteBoundingBox: box(0, 200, 800, 200),
        children: [
          { id: 'panel-yellow-bg', name: 'Rectangle', type: 'RECTANGLE', absoluteBoundingBox: box(0, 200, 800, 200), fills: [SOLID_YELLOW] },
        ],
      },
    ],
  },
});

const THEME_VARS = `// light
@color-border-yellow: rgba(226, 208, 132, 0.2);
@color-border-green: rgba(216, 255, 233, 0.32);
`;

const COMMON_LESS = `.c-card2-group-con {
  background: @color-border-yellow;
  min-width: 0;
}

.c-panel-group-con {
  background: @color-border-yellow;
}
`;

const INDEX_VUE = `<template>
  <div class="c-slot" data-section-id="root">
    <div class="c-card-con" data-section-id="card1" style="flex:1;">
      <CardOne style="flex:1;" />
    </div>
    <div class="c-card2-group-con" data-section-id="card2" style="flex:1;">
      <CardTwo style="flex:1;" />
    </div>
    <div class="c-panel-group-con" data-section-id="panel-yellow" style="flex:1;"></div>
  </div>
</template>
<script setup>
import CardOne from './components/CardOne.vue'
import CardTwo from './components/CardTwo.vue'
</script>
`;

const CARD_ONE = `<template>
  <div class="c-card-con" data-section-id="card1" v-bind="$attrs"></div>
</template>
`;
const CARD_TWO = `<template>
  <div class="c-card2-group-con" data-section-id="card2" v-bind="$attrs"></div>
</template>
`;

const buildFiles = () => ({
  'package/index.vue': INDEX_VUE,
  'package/components/CardOne.vue': CARD_ONE,
  'package/components/CardTwo.vue': CARD_TWO,
  'resources/styles/common.less': COMMON_LESS,
  'resources/styles/themes/theme-vars.less': THEME_VARS,
});

describe('刀 37 fillsToCss', () => {
  it('GRADIENT_LINEAR：角度按 handle 方向、opacity 折算进 alpha', () => {
    const css = fillsToCss([GRADIENT_BLUE]);
    expect(css).toBe(
      'linear-gradient(90deg, rgba(212, 227, 254, 0.4) 0%, rgba(0, 132, 255, 0.4) 50%, rgba(213, 227, 254, 0.4) 100%)',
    );
  });

  it('SOLID：opacity 折算', () => {
    expect(fillsToCss([SOLID_YELLOW])).toBe('rgba(226, 208, 132, 0.2)');
  });

  it('阴性：不可见填充 / 缺 stops / 空数组 ⇒ null（fail-open）', () => {
    expect(fillsToCss([])).toBe(null);
    expect(fillsToCss([{ type: 'SOLID', visible: false, color: SOLID_YELLOW.color }])).toBe(null);
    expect(fillsToCss([{ type: 'GRADIENT_LINEAR', gradientStops: [] }])).toBe(null);
  });
});

describe('刀 37 判据构件', () => {
  it('resolveSectionBackground：只认 ≥60% 面积的纯图形子级', () => {
    const idx = indexFigmaNodes(buildFigma());
    expect(resolveSectionBackground('card1', idx)).toMatchObject({ layerId: 'card1-bg', kind: 'gradient' });
    expect(resolveSectionBackground('panel-yellow', idx)).toMatchObject({ kind: 'solid' });
    // 无背景层的容器 ⇒ null
    expect(resolveSectionBackground('card1-icon', idx)).toBe(null);
  });

  it('collectClassBackgrounds / parseLessVars 能解析出真实声明', () => {
    expect(collectClassBackgrounds(COMMON_LESS).get('c-card2-group-con')).toBe('@color-border-yellow');
    expect(parseLessVars(THEME_VARS).get('color-border-yellow')).toBe('rgba(226, 208, 132, 0.2)');
  });

  it('normalizeCss：忽略大小写/空格', () => {
    expect(normalizeCss('rgba(226, 208, 132, 0.2)')).toBe(normalizeCss('RGBA(226,208,132,.2)'.replace('.2', '0.2')));
  });
});

describe('刀 37 healContainerBackgroundTruth', () => {
  it('① 借用他人背景（card2 = 黄面板色）⇒ 改成本卡真值渐变', () => {
    const files = buildFiles();
    const { files: out, changes } = healContainerBackgroundTruth(files, { figmaRoot: buildFigma() });
    const idx = out['package/index.vue'];
    const card2Line = idx.split('\n').find((l) => l.includes('data-section-id="card2"'));
    expect(card2Line).toContain('background:linear-gradient(90deg');
    // 变更理由能定位到具体槽位（可辩驳证据）
    const hit = changes.find((c) => c.sectionId === 'card2');
    expect(hit.reason).toBe('borrowed:c-card2-group-con=@color-border-yellow');
  });

  it('② 渐变缺失（card1 无任何背景声明）⇒ 补齐真值', () => {
    const { files: out, changes } = healContainerBackgroundTruth(buildFiles(), { figmaRoot: buildFigma() });
    const card1Line = out['package/index.vue'].split('\n').find((l) => l.includes('data-section-id="card1"'));
    expect(card1Line).toContain('background:linear-gradient(90deg');
    expect(changes.some((c) => c.sectionId === 'card1' && c.reason === 'missing-gradient')).toBe(true);
  });

  it('③ 阴性：面板背景 = 自己的真值（不是借用）⇒ 一字不动', () => {
    const files = buildFiles();
    const { files: out } = healContainerBackgroundTruth(files, { figmaRoot: buildFigma() });
    const panelLine = out['package/index.vue'].split('\n').find((l) => l.includes('data-section-id="panel-yellow"'));
    expect(panelLine).not.toContain('background');
  });

  it('④ 阴性：无 figmaRoot ⇒ 全量不动', () => {
    const files = buildFiles();
    const before = JSON.stringify(files);
    const { changes } = healContainerBackgroundTruth(files, {});
    expect(changes).toHaveLength(0);
    expect(JSON.stringify(files)).toBe(before);
  });

  it('⑤ 幂等：纠偏后复跑零变更', () => {
    const first = healContainerBackgroundTruth(buildFiles(), { figmaRoot: buildFigma() });
    const second = healContainerBackgroundTruth({ ...first.files }, { figmaRoot: buildFigma() });
    expect(second.changes).toHaveLength(0);
  });

  it('⑥ 不改既有 class 规则文本（只写 inline）', () => {
    const { files: out } = healContainerBackgroundTruth(buildFiles(), { figmaRoot: buildFigma() });
    expect(out['resources/styles/common.less']).toBe(COMMON_LESS);
  });
});

/**
 * ④ 判据（2026-10-21 · e3ab048a 实锤）：真值是渐变、产物**也声明了**背景，但解析后
 *   ≠ 本节真值 ⇒ 写错，按真值覆盖。
 *   实证：卡 1 写成 `linear-gradient(180deg,#d4e3ff,#c1d6ff)`（凭空色值、丢 opacity 0.4），
 *   而卡 2 因「原未声明」被 ③ 修对 ⇒ 同系列两卡一修一漏。
 */
describe('刀 37 判据 ④：已声明但与真值不符 ⇒ 覆盖', () => {
  /** 复刻卡 1 的错写法：与任何 section 真值都不相等（不会走 borrowed 分支） */
  const WRONG_GRADIENT_LESS = `.c-card-con {
  background: linear-gradient(180deg, #d4e3ff 0%, #c1d6ff 100%);
  min-width: 0;
}
`;

  it('阳性：错渐变 ⇒ 覆盖成本节真值，reason 记 mismatch', () => {
    const files = { ...buildFiles(), 'resources/styles/common.less': WRONG_GRADIENT_LESS + COMMON_LESS };
    const { files: out, changes } = healContainerBackgroundTruth(files, { figmaRoot: buildFigma() });
    const card1Line = out['package/index.vue'].split('\n').find((l) => l.includes('data-section-id="card1"'));
    expect(card1Line).toContain('background:linear-gradient(90deg');
    expect(card1Line).toContain('rgba(0, 132, 255, 0.4)');
    const hit = changes.find((c) => c.sectionId === 'card1');
    expect(hit.reason).toContain('mismatch:c-card-con=');
  });

  it('阴性 A：class 声明的就是本节真值 ⇒ 一字不动（幂等基线）', () => {
    const okLess = `.c-card-con {
  background: linear-gradient(90deg, rgba(212, 227, 254, 0.4) 0%, rgba(0, 132, 255, 0.4) 50%, rgba(213, 227, 254, 0.4) 100%);
}
`;
    const files = { ...buildFiles(), 'resources/styles/common.less': okLess + COMMON_LESS };
    const { files: out, changes } = healContainerBackgroundTruth(files, { figmaRoot: buildFigma() });
    const card1Line = out['package/index.vue'].split('\n').find((l) => l.includes('data-section-id="card1"'));
    expect(card1Line).not.toContain('background');
    expect(changes.some((c) => c.sectionId === 'card1')).toBe(false);
  });

  it('阴性 B：纯色面板声明了「不是自己真值」的纯色 ⇒ 不动（主题变量豁免）', () => {
    // panel-yellow 真值是黄，class 写成绿（@color-border-green = 216,255,233,.32）
    // —— 该值不是任何 section 的真值 ⇒ 不走 borrowed；真值非渐变 ⇒ 不走 ④
    const less = `.c-panel-group-con {
  background: @color-border-green;
}
`;
    const files = { ...buildFiles(), 'resources/styles/common.less': less };
    const { files: out, changes } = healContainerBackgroundTruth(files, { figmaRoot: buildFigma() });
    const panelLine = out['package/index.vue'].split('\n').find((l) => l.includes('data-section-id="panel-yellow"'));
    expect(panelLine).not.toContain('background');
    expect(changes.some((c) => c.sectionId === 'panel-yellow')).toBe(false);
  });

  it('缺 gradientHandlePositions ⇒ 结果标 angleGuessed（方向不可证，不当确定真值）', () => {
    const noHandle = { ...GRADIENT_BLUE, gradientHandlePositions: undefined };
    const figma = buildFigma();
    figma.document.children[0].children[0].fills = [noHandle];
    const idx = indexFigmaNodes(figma);
    const bg = resolveSectionBackground('card1', idx);
    expect(bg.kind).toBe('gradient');
    expect(bg.angleGuessed).toBe(true);
    // 带 handle 时不得标 guessed
    expect(resolveSectionBackground('card1', indexFigmaNodes(buildFigma())).angleGuessed).toBe(false);
  });
});

/**
 * 刀 42（2026-10-21 · mc-1792580653375-60212fb6 实锤）：面板「三件套」真值。
 *
 * 真机形态：三段面板容器（38:3137/3162/3206）class `c-60212f-container` 只有
 *   `display:flex; flex-direction:column; width:100%; min-height:0`，inline 只有
 *   `flex:0.204/min-height:0/display:flex` ⇒ **零 background / 零 border-radius / 零 box-shadow**。
 * 旧实现「纯色且未声明 ⇒ continue（交主题变量）」在该层没有任何槽位 ⇒ 永远不补 ⇒
 *   用户看到的就还是三张白纸（「三个 section 依旧没有统一样式」）。
 */
const SOLID_GOLD = {
  type: 'SOLID',
  opacity: 0.2,
  color: { r: 0.888, g: 0.814, b: 0.518 },
};
const INNER_GLOW_GOLD = {
  type: 'INNER_SHADOW',
  offset: { x: 0, y: 0 },
  radius: 16,
  spread: 0,
  color: { r: 1, g: 0.7843137254901961, b: 0, a: 1 },
};

/** 面板：底色纯色 + r=12 + INNER_SHADOW 发光 */
const buildPanelFigma = (bgRectExtra: Record<string, any> = {}) => ({
  document: {
    id: 'root',
    name: 'panel-root',
    type: 'FRAME',
    absoluteBoundingBox: box(0, 0, 1200, 600),
    children: [
      {
        id: 'panel-gold',
        name: 'Group 战略',
        type: 'GROUP',
        absoluteBoundingBox: box(0, 0, 600, 400),
        children: [
          {
            id: 'panel-gold-bg',
            name: 'Rectangle',
            type: 'RECTANGLE',
            absoluteBoundingBox: box(0, 0, 600, 400),
            fills: [SOLID_GOLD],
            cornerRadius: 12,
            effects: [INNER_GLOW_GOLD],
            ...bgRectExtra,
          },
        ],
      },
    ],
  },
});

const PANEL_LESS = `.c-panel-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
}
`;

const PANEL_VUE = `<template>
  <div class="c-panel-container" data-section-id="panel-gold" style="flex:1;min-height:0;display:flex;flex-direction:column;"></div>
</template>
`;

const buildPanelFiles = () => ({
  'package/index.vue': PANEL_VUE,
  'resources/styles/common.less': PANEL_LESS,
});

const panelTag = (vue: string) =>
  String(vue)
    .split('\n')
    .find((l) => l.includes('data-section-id="panel-gold"')) || '';

describe('刀 42 resolveSectionPanel：面板三件套真值', () => {
  it('阳性：底色 + 圆角 + INNER_SHADOW → box-shadow（inset 前缀）', () => {
    const panel = resolveSectionPanel('panel-gold', indexFigmaNodes(buildPanelFigma()));
    expect(panel).toMatchObject({ kind: 'solid', layerId: 'panel-gold-bg', radius: 12 });
    expect(panel.css).toBe('rgba(226, 208, 132, 0.2)');
    expect(panel.shadow).toBe('inset 0px 0px 16px 0px rgba(255, 200, 0, 1)');
  });

  it('阳性：只给 rectangleCornerRadii（无 cornerRadius）也能取到圆角', () => {
    const figma = buildPanelFigma({ cornerRadius: undefined, rectangleCornerRadii: [12, 12, 12, 12] });
    expect(resolveSectionPanel('panel-gold', indexFigmaNodes(figma)).radius).toBe(12);
  });

  it('阴性：无 effects / 无圆角 ⇒ radius=0 且 shadow=null（绝不臆造）', () => {
    const figma = buildPanelFigma({ effects: [], cornerRadius: 0 });
    const panel = resolveSectionPanel('panel-gold', indexFigmaNodes(figma));
    expect(panel.radius).toBe(0);
    expect(panel.shadow).toBe(null);
  });

  it('阴性：inheritEffects=false 的不可见发光被跳过', () => {
    const figma = buildPanelFigma({ effects: [{ ...INNER_GLOW_GOLD, visible: false }] });
    expect(resolveSectionPanel('panel-gold', indexFigmaNodes(figma)).shadow).toBe(null);
  });
});

describe('刀 42 healContainerBackgroundTruth：三件套补齐', () => {
  it('① 阳性：纯色未声明 ⇒ 同时补底色/圆角/发光，三条 reason 全在', () => {
    const { files, changes } = healContainerBackgroundTruth(buildPanelFiles(), {
      figmaRoot: buildPanelFigma(),
    });
    const tag = panelTag(files['package/index.vue']);
    expect(tag).toContain('background:rgba(226, 208, 132, 0.2)');
    expect(tag).toContain('border-radius:12px');
    expect(tag).toContain('box-shadow:inset 0px 0px 16px 0px rgba(255, 200, 0, 1)');
    // 原有 inline 声明不得丢
    expect(tag).toContain('flex:1');
    expect(changes).toHaveLength(1);
    expect(changes[0].reason).toBe('missing-solid+missing-radius+missing-glow');
    expect(changes[0]).toMatchObject({ radius: 12, background: 'rgba(226, 208, 132, 0.2)' });
  });

  it('② 幂等：补齐后复跑零变更', () => {
    const first = healContainerBackgroundTruth(buildPanelFiles(), { figmaRoot: buildPanelFigma() });
    const second = healContainerBackgroundTruth({ ...first.files }, { figmaRoot: buildPanelFigma() });
    expect(second.changes).toHaveLength(0);
    expect(second.files['package/index.vue']).toBe(first.files['package/index.vue']);
  });

  it('③ 阴性：已有 inline 圆角/发光 ⇒ 一律不动（只补缺失的底色）', () => {
    const vue = PANEL_VUE.replace(
      'style="flex:1;',
      'style="border-radius:8px;box-shadow:inset 0 0 10px 0 rgba(0, 0, 0, 0.5);flex:1;',
    );
    const { files, changes } = healContainerBackgroundTruth(
      { ...buildPanelFiles(), 'package/index.vue': vue },
      { figmaRoot: buildPanelFigma() },
    );
    const tag = panelTag(files['package/index.vue']);
    expect(tag).toContain('background:rgba(226, 208, 132, 0.2)'); // 底色补
    expect(tag).toContain('border-radius:8px'); // 原值保留
    expect(tag).not.toContain('border-radius:12px');
    expect(tag).toContain('rgba(0, 0, 0, 0.5)'); // 原发光保留
    expect(changes[0].reason).toBe('missing-solid');
  });

  it('④ 阴性：class 已声明 border-radius / box-shadow ⇒ 不改写共用 class 的值', () => {
    const less = PANEL_LESS.replace(
      'min-height: 0;',
      'min-height: 0;\n  border-radius: 4px;\n  box-shadow: none;',
    );
    const { files, changes } = healContainerBackgroundTruth(
      { ...buildPanelFiles(), 'resources/styles/common.less': less },
      { figmaRoot: buildPanelFigma() },
    );
    const tag = panelTag(files['package/index.vue']);
    expect(tag).toContain('background:rgba(226, 208, 132, 0.2)');
    expect(tag).not.toContain('border-radius:12px');
    expect(tag).not.toContain('inset 0px 0px 16px');
    expect(files['resources/styles/common.less']).toBe(less);
    expect(changes[0].reason).toBe('missing-solid');
  });

  it('⑤ 阴性：真值只有底色（无圆角/无发光）⇒ 只补底色，不臆造另两件', () => {
    const figma = buildPanelFigma({ effects: [], cornerRadius: 0 });
    const { files } = healContainerBackgroundTruth(buildPanelFiles(), { figmaRoot: figma });
    const tag = panelTag(files['package/index.vue']);
    expect(tag).toContain('background:rgba(226, 208, 132, 0.2)');
    expect(tag).not.toContain('border-radius');
    expect(tag).not.toContain('box-shadow');
  });
});
