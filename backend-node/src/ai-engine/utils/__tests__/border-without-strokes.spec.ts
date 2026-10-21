/**
 * 刀 38 spec（2026-10-21 · e3ab048a 实锤）：真值无描边 ⇒ 产物不得有边框。
 *
 * 事故形态：统计卡 1（`38:3260`，class `.c-stats-con`）写成
 *   `border: 1px solid #a0c1ff; border-radius: 4px;`，而真值 `strokes = []`；
 *   `#a0c1ff` 在整棵 figma 树里不存在。同一张卡 2 因走刀 37 的「背景缺失」分支被修对
 *   ⇒ 同系列两卡一有框一无框。
 */
import {
  isStrokeFree,
  collectClassUsages,
  isClassExclusiveTo,
  stripBorderDeclsFromBody,
  stripBorderFromInline,
  stripBorderDeclsFromClassRules,
  healBorderWithoutStrokes,
} from '../border-without-strokes.js';

const box = (x, y, w, h) => ({ x, y, width: w, height: h });

/** card1 无描边；card2 有真实描边（阴性对照）；panel 无描边但有 INNER_SHADOW（不得误删） */
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
        strokes: [],
        children: [],
      },
      {
        id: 'card2',
        name: 'Group card2',
        type: 'GROUP',
        absoluteBoundingBox: box(300, 0, 265, 76),
        strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
        children: [],
      },
      {
        id: 'panel',
        name: 'Group 战略',
        type: 'GROUP',
        absoluteBoundingBox: box(0, 200, 800, 200),
        strokes: [],
        children: [],
      },
      {
        id: 'card-hidden-stroke',
        name: 'Group hidden',
        type: 'GROUP',
        absoluteBoundingBox: box(0, 500, 100, 40),
        strokes: [{ type: 'SOLID', visible: false, color: { r: 1, g: 0, b: 0, a: 1 } }],
        children: [],
      },
    ],
  },
});

const COMMON_LESS = `.c-stats-con {
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #d4e3ff 0%, #c1d6ff 100%);
  border: 1px solid #a0c1ff;
  border-radius: 4px;
}

.c-card2-con {
  display: flex;
  border: 1px solid #000000;
}

.c-panel-group-con {
  display: flex;
  box-shadow: inset 0px 0px 16px 0px #ffc800;
  border-radius: 12px;
}

.c-shared-con {
  display: flex;
  border-top: 1px solid #cccccc;
}
`;

const INDEX_VUE = `<template>
  <div class="c-slot" data-section-id="root">
    <div class="c-stats-con" data-section-id="card1" style="flex:1;min-width:0;border:1px solid #a0c1ff;"></div>
    <div class="c-card2-con" data-section-id="card2" style="flex:1;"></div>
    <div class="c-panel-group-con" data-section-id="panel" style="flex:1;"></div>
    <div class="c-shared-con" data-section-id="card-hidden-stroke" style="flex:1;"></div>
  </div>
</template>
<script setup>
</script>
`;

const buildFiles = () => ({
  'package/index.vue': INDEX_VUE,
  'resources/styles/common.less': COMMON_LESS,
});

describe('刀 38 判据构件', () => {
  it('isStrokeFree：空数组 / 全不可见 ⇒ true；有可见描边 ⇒ false', () => {
    expect(isStrokeFree({ strokes: [] })).toBe(true);
    expect(isStrokeFree({ strokes: [{ visible: false }] })).toBe(true);
    expect(isStrokeFree({ strokes: [{ visible: true }] })).toBe(false);
    // 无 strokes 字段 ⇒ 视为无描边（figma 缺省）
    expect(isStrokeFree({})).toBe(true);
  });

  it('stripBorderDeclsFromBody：删边框、**保留 border-radius**', () => {
    const body = `
  display: flex;
  border: 1px solid #a0c1ff;
  border-radius: 4px;
  box-shadow: inset 0 0 16px #ffc800;
  border-top-width: 2px;
`;
    const out = stripBorderDeclsFromBody(body);
    expect(out).not.toContain('border: 1px solid');
    expect(out).not.toContain('border-top-width');
    // 阴性：圆角与阴影必须保留（INNER_SHADOW 是真值、radius 不是边框）
    expect(out).toContain('border-radius: 4px');
    expect(out).toContain('box-shadow: inset 0 0 16px #ffc800');
    expect(out).toContain('display: flex');
  });

  it('stripBorderFromInline：删边框段、其余声明原样保留', () => {
    expect(stripBorderFromInline('flex:1;min-width:0;border:1px solid #a0c1ff;')).toBe(
      'flex:1;min-width:0',
    );
    // 阴性：border-radius / 非边框属性不得动
    expect(stripBorderFromInline('border-radius:4px;color:red')).toBe('border-radius:4px;color:red');
    // 已是 none/0 ⇒ 无变更（幂等）
    expect(stripBorderFromInline('border:none')).toBe('border:none');
    expect(stripBorderFromInline('border:0')).toBe('border:0');
  });

  it('stripBorderDeclsFromClassRules：只改目标 class，别的 class 一字不动', () => {
    const out = stripBorderDeclsFromClassRules(COMMON_LESS, ['c-stats-con']);
    expect(out).not.toContain('border: 1px solid #a0c1ff');
    expect(out).toContain('border-radius: 4px');
    // 阴性：其它 class 的 border 必须保留
    expect(out).toContain('.c-card2-con');
    expect(out).toContain('border: 1px solid #000000');
  });

  it('collectClassUsages / isClassExclusiveTo：共享 class 判为不安全', () => {
    const files = buildFiles();
    const usages = collectClassUsages(files);
    expect(isClassExclusiveTo('c-stats-con', 'card1', usages)).toBe(true);
    // 同一 class 出现在两个不同 section ⇒ 不安全
    const files2 = {
      'package/index.vue': `<template>
  <div class="c-x" data-section-id="a"></div>
  <div class="c-x" data-section-id="b"></div>
</template>`,
    };
    const u2 = collectClassUsages(files2);
    expect(isClassExclusiveTo('c-x', 'a', u2)).toBe(false);
    // 也被无 section-id 的元素用过 ⇒ 不安全
    const files3 = {
      'package/index.vue': `<template>
  <div class="c-y" data-section-id="a"></div>
  <span class="c-y"></span>
</template>`,
    };
    const u3 = collectClassUsages(files3);
    expect(isClassExclusiveTo('c-y', 'a', u3)).toBe(false);
  });
});

describe('刀 38 healBorderWithoutStrokes', () => {
  it('① 阳性：卡 1 无描边 ⇒ inline 与 class 的 border 都被删，radius 保留', () => {
    const { files: out, changes } = healBorderWithoutStrokes(buildFiles(), { figmaRoot: buildFigma() });
    const vue = out['package/index.vue'];
    const card1Line = vue.split('\n').find((l) => l.includes('data-section-id="card1"'));
    expect(card1Line).not.toContain('border');

    const less = out['resources/styles/common.less'];
    expect(less).not.toContain('border: 1px solid #a0c1ff');
    expect(less).toContain('border-radius: 4px');
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.some((c) => c.sectionId === 'card1' && c.where === 'inline')).toBe(true);
  });

  it('② 阴性：真值有描边（card2）⇒ 一字不改', () => {
    const { files: out } = healBorderWithoutStrokes(buildFiles(), { figmaRoot: buildFigma() });
    expect(out['resources/styles/common.less']).toContain('border: 1px solid #000000');
    const card2Line = out['package/index.vue'].split('\n').find((l) => l.includes('data-section-id="card2"'));
    expect(card2Line).toContain('c-card2-con');
  });

  it('③ 阴性：INNER_SHADOW 不是边框 ⇒ box-shadow 必须保留', () => {
    const { files: out } = healBorderWithoutStrokes(buildFiles(), { figmaRoot: buildFigma() });
    expect(out['resources/styles/common.less']).toContain('box-shadow: inset 0px 0px 16px 0px #ffc800');
    expect(out['resources/styles/common.less']).toContain('border-radius: 12px');
  });

  it('④ 阴性：共享 class（也被无 section-id 元素用）⇒ 规则不动', () => {
    const files = buildFiles();
    files['package/other.vue'] = `<template><span class="c-shared-con"></span></template>`;
    const { files: out } = healBorderWithoutStrokes(files, { figmaRoot: buildFigma() });
    // c-shared-con 由 card-hidden-stroke（无可见描边）使用，但共享 ⇒ 不得改
    expect(out['resources/styles/common.less']).toContain('border-top: 1px solid #cccccc');
  });

  it('⑤ strokes 全为 invisible ⇒ 仍按无描边处理（独占 class 的边框被删）', () => {
    expect(isStrokeFree(buildFigma().document.children[3])).toBe(true);
    const { files: out, changes } = healBorderWithoutStrokes(buildFiles(), { figmaRoot: buildFigma() });
    // 本用例里 c-shared-con 只被 card-hidden-stroke 使用 ⇒ 独占 ⇒ 应被删
    expect(out['resources/styles/common.less']).not.toContain('border-top: 1px solid #cccccc');
    expect(changes.some((c) => c.cls === 'c-shared-con')).toBe(true);
  });

  it('⑥ 幂等：纠偏后复跑零变更', () => {
    const first = healBorderWithoutStrokes(buildFiles(), { figmaRoot: buildFigma() });
    const second = healBorderWithoutStrokes({ ...first.files }, { figmaRoot: buildFigma() });
    expect(second.changes).toHaveLength(0);
  });

  it('⑦ 阴性：无 figmaRoot ⇒ 全量不动', () => {
    const files = buildFiles();
    const before = JSON.stringify(files);
    const { changes } = healBorderWithoutStrokes(files, {});
    expect(changes).toHaveLength(0);
    expect(JSON.stringify(files)).toBe(before);
  });
});
