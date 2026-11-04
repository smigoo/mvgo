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
  healPanelTitleSlot,
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

  /**
   * ⑩ class 级兜底（2026-10-22 · mc-1792635089793-2d4305b7 真机）：战略标题组件根 div
   *   漏了 `data-section-id`，元素级判据恒 `isClassExclusiveTo=false` ⇒ 摘不掉。真机截图里
   *   战略段是「面板金框 + 里面又一条金条」，另两段正常 ⇒ 三段看着仍不统一。
   */
  it('⑩ 阳性（class 级兜底）：装饰类只被「无 section 归属」的元素使用 ⇒ 也摘', () => {
    const headerVue = `<template>
  <div class="c-header-text" v-bind="$attrs"></div>
</template>
`;
    const files = { ...buildFiles(), 'package/components/HeaderText.vue': headerVue };
    const { files: out, changes } = healPanelChromeMisplacement(files, { figmaRoot: buildFigma() });
    const less = out['resources/styles/common.less'];
    expect(less).not.toContain('border-radius: 12px');
    expect(less).not.toContain('#ffc800');
    const hit = changes.find((c) => c.cls === 'c-header-text');
    expect(hit.where).toBe('class-orphan');
    expect(hit.owner).toBe('panel-gold');
  });

  it('⑪ 阴性（class 级兜底）：该 class 正是面板自己的 ⇒ 不动', () => {
    const indexVue = `<template>
  <div class="c-header-text" data-section-id="panel-gold" style="display:flex;"></div>
</template>
`;
    const files = { ...buildFiles(), 'package/index.vue': indexVue };
    const { files: out, changes } = healPanelChromeMisplacement(files, { figmaRoot: buildFigma() });
    expect(out['resources/styles/common.less']).toBe(COMMON_LESS);
    expect(changes).toHaveLength(0);
  });

  it('⑫ 阴性（class 级兜底）：被另一个「有自己面板真值」的 section 使用 ⇒ 不动', () => {
    const cardVue = `<template>
  <div class="c-header-text" data-section-id="card-blue" v-bind="$attrs"></div>
</template>
`;
    const files = { ...buildFiles(), 'package/components/Card.vue': cardVue };
    const { files: out, changes } = healPanelChromeMisplacement(files, { figmaRoot: buildFigma() });
    expect(out['resources/styles/common.less']).toBe(COMMON_LESS);
    expect(changes).toHaveLength(0);
  });
});

/**
 * 🛡️ A0 零命中留痕计数行（2026-11-04 · c-b04f22-b04f223c 实锤）：
 *   本刀原先只在 `changes.length > 0` 时留痕 ⇒ 事后无法区分「跑过但零命中」「未跑到」
 *   「被哪条 continue 筛掉」——这正是 CS1 案查不动 3 轮的直接原因（与 G14b 同款缺口）。
 *   `stats` 为**纯观测**计数，判据一字未动；本组即计数行自身的阳性对照。
 */
describe('刀 42-B A0 零命中计数行', () => {
  it('① 阳性：命中场景下分母与分支归因都在（class 已被元素级收入 ⇒ AlreadyStripped）', () => {
    const { changes, stats } = healPanelChromeMisplacement(buildFiles(), { figmaRoot: buildFigma() });
    expect(changes.length).toBeGreaterThan(0); // 确有命中
    expect(stats.scanned).toBe(2); // 2 个带 data-section-id 的元素
    expect(stats.skippedSelfPanel).toBe(1); // 面板真值元素自己（panel-gold）
    expect(stats.classLevelSkipAlreadyStripped).toBe(1); // c-header-text 已被元素级 ③ 收入
    // 归因守恒：②-b 的「总」= 各分支之和
    const sum =
      stats.classLevelSkipAlreadyStripped +
      stats.classLevelSkipNoShadow +
      stats.classLevelSkipUnused +
      stats.classLevelSkipShared +
      stats.classLevelSkipUnresolved +
      stats.classLevelSkipNoOwner +
      stats.classLevelSkipOccupied;
    expect(stats.classLevelSkipped).toBe(sum);
  });

  it('② CS1 病灶归因阳性：`@var: unset` 遮蔽 ⇒ classLevelSkipUnresolved === 1（零命中但有留痕）', () => {
    // 复刻真机形态：SFC scoped 的 `box-shadow: @vendor-panel-shadow`（= unset）遮蔽了
    // common.less 的金发光；装饰 class 挂在**无 data-section-id** 的元素上（元素级够不着）。
    const themeVars = `@vendor-panel-shadow: unset;
@color-bg-vendor-gold: rgba(226, 208, 132, 0.2);
@radius-panel: 12px;
`;
    const less = `.c-deco {
  border-radius: 12px;
  box-shadow: @vendor-panel-shadow;
}
`;
    const decoVue = `<template>
  <div class="c-deco" v-bind="$attrs"></div>
</template>
`;
    const files = {
      'package/index.vue': INDEX_VUE,
      'package/components/Deco.vue': decoVue,
      'resources/styles/common.less': less,
      'resources/styles/themes/theme-vars.less': themeVars,
    };
    const { changes, stats } = healPanelChromeMisplacement(files, { figmaRoot: buildFigma() });
    expect(changes).toHaveLength(0); // 零命中
    expect(stats.classLevelScanned).toBe(1); // 但确实跑到了 ②-b
    expect(stats.classLevelSkipUnresolved).toBe(1); // 且点名落在「解析不出真值」这条
  });

  it('③ 三态可分：「跑过但零命中」(scanned>0) ≠「未跑到」(scanned=0)', () => {
    const files = {
      'package/index.vue': INDEX_VUE, // 面板真值元素 ⇒ skippedSelfPanel
      'package/components/Plain.vue': `<template>
  <div class="c-plain" data-section-id="x-1" style="display:flex"></div>
</template>
`,
      'resources/styles/common.less': '',
      'resources/styles/themes/theme-vars.less': THEME_VARS,
    };
    const ran = healPanelChromeMisplacement(files, { figmaRoot: buildFigma() });
    expect(ran.changes).toHaveLength(0);
    expect(ran.stats.scanned).toBe(2); // 跑过（分母非零）
    expect(ran.stats.skippedMissingDecl).toBe(1); // 无三件套声明 ⇒ 落此分支

    const notRun = healPanelChromeMisplacement(files, {});
    expect(notRun.stats.scanned).toBe(0); // 未跑到 ⇒ 全 0
    expect(notRun.skipped?.[0]?.reason).toBe('no-figma-root'); // 且带早退原因
  });

  it('④ 早退留痕：无面板真值 ⇒ 全 0 且带 no-panel-truth（不是静默返回）', () => {
    const noPanelFigma = {
      document: { id: 'root', type: 'FRAME', absoluteBoundingBox: box(0, 0, 100, 100), children: [] },
    };
    const { stats, skipped } = healPanelChromeMisplacement(buildFiles(), { figmaRoot: noPanelFigma });
    expect(stats.scanned).toBe(0);
    expect(stats.classLevelScanned).toBe(0);
    expect(skipped?.[0]?.reason).toBe('no-panel-truth');
  });
});

/**
 * 🛡️ 42-B (b)（2026-11-04 · CS1 段1 实锤）：**无效 stub 下沉**。
 *   病灶：`cssSources` 首源（SFC `<style>`）把 class 的 `box-shadow` 声明成
 *   `@vendor-panel-shadow`（= `unset`）⇒ first-wins 永远取到 stub，**后面那份有效发光声明**
 *   （`common.less` 顶层金发光）读不到 ⇒ 在 `Unresolved` 静默丢弃、`changes=0`。
 *   口径（用户 2026-11-04 裁决）：**只认 `unset`** —— 它是「LLM 未填」的 stub 语义，须继续
 *   下查；`none` 是**有意**的「无阴影」声明，不得下查（否则会误「复活」被有意取消的阴影）。
 *   本组即「首源 stub 遮蔽时仍能下沉取到真值」的**两源阳性对照**（⑤ 走元素级 `declaredProp`、
 *   ⑥ 走 class 级 ②-b `putValid`），⑦ 为 `none` 不下沉的阴性对照。
 */
describe('刀 42-B (b) 无效 stub 下沉（首源 unset 遮蔽）', () => {
  const themeVarsStub = `@vendor-panel-shadow: unset;
@color-bg-vendor-gold: rgba(226, 208, 132, 0.2);
@radius-panel: 12px;
`;

  it('⑤ 元素级阳性：SFC 首源 `box-shadow: @var(unset)` 遮蔽 ⇒ 下沉取到 common.less 金发光并摘除', () => {
    const headerVue = `<template>
  <div class="c-header-text" data-section-id="panel-gold-tail-text" v-bind="$attrs"></div>
</template>
<style scoped>
.c-header-text {
  height: 100%;
  background: @color-bg-vendor-gold;
  border-radius: 12px;
  box-shadow: @vendor-panel-shadow;
}
</style>
`;
    const less = `.c-header-text {
  background: @color-bg-vendor-gold;
  border-radius: 12px;
  box-shadow: inset 0px 0px 16px 0px #ffc800;
}
`;
    const files = {
      'package/index.vue': INDEX_VUE,
      'package/components/HeaderText.vue': headerVue,
      'resources/styles/common.less': less,
      'resources/styles/themes/theme-vars.less': themeVarsStub,
    };
    const { files: out, changes, stats } = healPanelChromeMisplacement(files, { figmaRoot: buildFigma() });
    // 不再掉进「解析不出真值」
    expect(stats.skippedUnresolvedValue).toBe(0);
    expect(changes.some((c) => c.cls === 'c-header-text' && c.owner === 'panel-gold')).toBe(true);
    // 三件套（含被 stub 遮蔽的发光）被摘净
    expect(out['resources/styles/common.less']).not.toContain('#ffc800');
    expect(out['resources/styles/common.less']).not.toContain('border-radius: 12px');
  });

  it('⑥ class 级（②-b）阳性：无 data-section-id 的装饰 class，首源 stub 下沉后仍摘除', () => {
    const decoVue = `<template>
  <div class="c-deco" v-bind="$attrs"></div>
</template>
<style scoped>
.c-deco {
  border-radius: 12px;
  box-shadow: @vendor-panel-shadow;
}
</style>
`;
    const less = `.c-deco {
  border-radius: 12px;
  box-shadow: inset 0px 0px 16px 0px #ffc800;
}
`;
    const files = {
      'package/index.vue': INDEX_VUE,
      'package/components/Deco.vue': decoVue,
      'resources/styles/common.less': less,
      'resources/styles/themes/theme-vars.less': themeVarsStub,
    };
    const { changes, stats } = healPanelChromeMisplacement(files, { figmaRoot: buildFigma() });
    expect(stats.classLevelSkipUnresolved).toBe(0); // 不再被 stub 卡在 Unresolved
    expect(
      changes.some((c) => c.cls === 'c-deco' && c.where === 'class-orphan' && c.owner === 'panel-gold'),
    ).toBe(true);
  });

  it('⑦ 阴性：`none` 不是 stub ⇒ 不下沉（有意的「无阴影」不得被复活）', () => {
    const decoVue = `<template>
  <div class="c-deco" v-bind="$attrs"></div>
</template>
<style scoped>
.c-deco {
  border-radius: 12px;
  box-shadow: none;
}
</style>
`;
    const less = `.c-deco {
  border-radius: 12px;
  box-shadow: inset 0px 0px 16px 0px #ffc800;
}
`;
    const files = {
      'package/index.vue': INDEX_VUE,
      'package/components/Deco.vue': decoVue,
      'resources/styles/common.less': less,
      'resources/styles/themes/theme-vars.less': themeVarsStub,
    };
    const { files: out, changes, stats } = healPanelChromeMisplacement(files, { figmaRoot: buildFigma() });
    // 首源 `none` 是有意声明 ⇒ 保住 `none` ⇒ shadowColorKey('none')=null ⇒ Unresolved，不下沉
    expect(stats.classLevelSkipUnresolved).toBe(1);
    expect(changes.some((c) => c.cls === 'c-deco')).toBe(false);
    expect(out['resources/styles/common.less']).toContain('#ffc800');
  });
});

/**
 * 刀 57 / 方案 E（2026-10-23 · mc-max-1792718704810-f98f7463 实锤）：双标题。
 *   index.vue 把 Figma 标题组件挂 `#header-right`，default-panel chrome 又无条件渲染
 *   `{{ componentName }}`（title == Figma 标题文本）⇒ 同一标题出现两次。
 * 五判据全中 ⇒ `#header-right` → `#title-left`（只改 slot 名，内容不动）。
 */
describe('刀 57 · healPanelTitleSlot 面板标题槽位归属', () => {
  const TS_PLAN = { effectiveSections: [{ id: '807:3', type: 'header' }] };

  const tsFigma = (textCount = 1) => ({
    document: {
      id: 'root',
      type: 'FRAME',
      children: [
        {
          id: '807:3',
          type: 'FRAME',
          children: Array.from({ length: textCount }, (_, i) => ({
            id: `807:${5 + i}`,
            type: 'TEXT',
            characters: i === 0 ? '设备列表' : '设备列表2',
          })),
        },
      ],
    },
  });

  const tsIndex = (slotInner) => `<template>
  <base-panel title="设备列表">
    <template #header-right>
      ${slotInner}
    </template>
    <ContentSection />
  </base-panel>
</template>
`;

  const tsFiles = (slotInner = '<HeaderSection />') => ({
    'package/index.vue': tsIndex(slotInner),
    'package/components/HeaderSection.vue': '<template>\n  <div data-section-id="807:3">设备列表</div>\n</template>\n',
  });

  it('① 阳性：五判据全中 ⇒ #header-right → #title-left（内容一字不动）', () => {
    const { files, changes } = healPanelTitleSlot(tsFiles(), { plan: TS_PLAN, figmaRoot: tsFigma() });
    const out = files['package/index.vue'];
    expect(out).toContain('#title-left');
    expect(out).not.toContain('#header-right');
    // slot 内容不动
    expect(out).toContain('<HeaderSection />');
    expect(files['package/components/HeaderSection.vue']).toContain('data-section-id="807:3"');
    expect(changes).toEqual([
      { file: 'package/index.vue', component: 'HeaderSection', sectionId: '807:3', from: 'header-right', to: 'title-left' },
    ]);
  });

  it('② 幂等：heal 后同文件已含 #title-left ⇒ 复跑零变更', () => {
    const first = healPanelTitleSlot(tsFiles(), { plan: TS_PLAN, figmaRoot: tsFigma() });
    const second = healPanelTitleSlot(first.files, { plan: TS_PLAN, figmaRoot: tsFigma() });
    expect(second.changes).toHaveLength(0);
    expect(second.files['package/index.vue']).toBe(first.files['package/index.vue']);
  });

  it('③ 阴性：slot 直接内容是多元素 ⇒ 不猜', () => {
    const { files, changes } = healPanelTitleSlot(
      tsFiles('<HeaderSection /><span>x</span>'),
      { plan: TS_PLAN, figmaRoot: tsFigma() },
    );
    expect(changes).toHaveLength(0);
    expect(files['package/index.vue']).toContain('#header-right');
  });

  it('④ 阴性：slot 内容是原生元素（非 PascalCase 组件）⇒ 不猜', () => {
    const { changes } = healPanelTitleSlot(tsFiles('<div class="x"></div>'), { plan: TS_PLAN, figmaRoot: tsFigma() });
    expect(changes).toHaveLength(0);
  });

  it('⑤ 阴性：组件文件无 data-section-id ⇒ 不猜', () => {
    const files = tsFiles();
    files['package/components/HeaderSection.vue'] = '<template>\n  <div>设备列表</div>\n</template>\n';
    const { changes } = healPanelTitleSlot(files, { plan: TS_PLAN, figmaRoot: tsFigma() });
    expect(changes).toHaveLength(0);
  });

  it('⑥ 阴性：plan 段 type 非 header（如 content）⇒ 不猜', () => {
    const plan = { effectiveSections: [{ id: '807:3', type: 'content' }] };
    const { changes } = healPanelTitleSlot(tsFiles(), { plan, figmaRoot: tsFigma() });
    expect(changes).toHaveLength(0);
  });

  it('⑦ 阴性：sid 段不在 plan ⇒ 不猜', () => {
    const plan = { effectiveSections: [{ id: '999:1', type: 'header' }] };
    const { changes } = healPanelTitleSlot(tsFiles(), { plan, figmaRoot: tsFigma() });
    expect(changes).toHaveLength(0);
  });

  it('⑧ 阴性：Figma 子树 TEXT 数 ≠ 1（0 个 / 2 个）⇒ 不猜', () => {
    expect(healPanelTitleSlot(tsFiles(), { plan: TS_PLAN, figmaRoot: tsFigma(0) }).changes).toHaveLength(0);
    expect(healPanelTitleSlot(tsFiles(), { plan: TS_PLAN, figmaRoot: tsFigma(2) }).changes).toHaveLength(0);
  });

  it('⑨ 阴性：无 plan / 无 figmaRoot / index 无 base-panel ⇒ fail-open 且带 skippedReason', () => {
    expect(healPanelTitleSlot(tsFiles(), { figmaRoot: tsFigma() })).toMatchObject({ changes: [], skippedReason: 'no-plan-sections' });
    expect(healPanelTitleSlot(tsFiles(), { plan: TS_PLAN })).toMatchObject({ changes: [], skippedReason: 'no-figma-root' });
    const files = tsFiles();
    files['package/index.vue'] = files['package/index.vue'].replace('<base-panel', '<my-panel');
    expect(healPanelTitleSlot(files, { plan: TS_PLAN, figmaRoot: tsFigma() }))
      .toMatchObject({ changes: [], skippedReason: 'no-base-panel-index' });
  });

  it('⑩ 阳性：注释 + 自闭合标签 + document 包装树形态照常命中（真机形态）', () => {
    // 真机 index.vue：slot 内带 HTML 注释；figmaRoot 直接传 .document 本体（非包装）
    const files = tsFiles('<!-- 标题 -->\n      <HeaderSection />');
    const figmaDoc = tsFigma().document;
    const { changes } = healPanelTitleSlot(files, { plan: TS_PLAN, figmaRoot: figmaDoc });
    expect(changes).toHaveLength(1);
    expect(changes[0].to).toBe('title-left');
  });
});
