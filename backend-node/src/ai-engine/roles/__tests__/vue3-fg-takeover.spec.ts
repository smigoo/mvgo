/**
 * 🛡️ Phase 3.5（2026-10-31 治理方案）：vue3 管线接管行为 spec —— Phase A 前置。
 *
 * 治理方案 §6.4 影响面评审：`collectFoldedGridTakeover` 为双管线共用
 *（microcode-engineer / code-generator / **vue3-engineer(:769)** / vue3-prompt /
 * orphan-style-rule-guard），但 vue3 侧此前无接管行为 spec ⇒ A 动刀时 vue3 管线
 * 是回归盲区。本 spec 挂在 A 之前补齐这块覆盖。
 *
 * 断言口径 = vue3-engineer.js:769-795 的**真实消费链**：
 *   collectFoldedGridTakeover（与 microcode 同一实现）
 *   → matchFgTakeoverTargets（vue3 专属两级映射：名命中跳 LLM chunk / section-id 覆写）
 *   → 主组件硬护栏 / unmatched fail-open。
 * 输入复用 Phase C fixture 单一来源（vision-forms/stat-value-elements-parts.json），
 * 不复制形态样本。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  collectFoldedGridTakeover,
  matchFgTakeoverTargets,
} from '../../utils/folded-grid-section-takeover.js';
import { assignSectionComponentNames } from '../../utils/section-tree.js';
import { validateVueSfc } from '../../utils/sfc-syntax-validation.js';

const FIXTURE = JSON.parse(
  readFileSync(
    join(__dirname, '../../utils/__tests__/__fixtures__/vision-forms/stat-value-elements-parts.json'),
    'utf8',
  ),
);

/** 最小 figma 树（与 folded-grid-list-takeover.spec 同款几何，fixture icon figmaNode 10:3/10:6 对齐） */
const FIGMA = {
  id: 'root', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 },
  children: [
    { id: '10:2', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 72 }, children: [
      { id: '10:3', type: 'FRAME', absoluteBoundingBox: { x: 20, y: 16, width: 40, height: 40 }, children: [] },
    ] },
    { id: '10:5', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 92, width: 400, height: 72 }, children: [
      { id: '10:6', type: 'FRAME', absoluteBoundingBox: { x: 20, y: 108, width: 40, height: 40 }, children: [] },
    ] },
  ],
};

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

describe('Phase 3.5 · vue3 管线接管行为（collectFoldedGridTakeover 双管线共用，A 前置覆盖）', () => {
  // vue3-engineer.js:769 同参形态
  const takeover = collectFoldedGridTakeover({
    treeSections: [clone(FIXTURE.form)],
    figmaNodeData: FIGMA,
    resourceMapping: [],
    componentName: 'c-demo-vue3',
    logger: { info() {}, warn() {} },
  });
  const tag = [...takeover.map.keys()][0];
  const tr = takeover.map.get(tag);

  it('折叠列表叶（769789af 形态④）⇒ listHits=1、map 携带 vue 产物与契约字段', () => {
    expect(takeover.evaluated).toBe(1);
    expect(takeover.listHits).toBe(1);
    expect(takeover.map.size).toBe(1);
    expect(tr.kind).toBe('list');
    expect(tr.sectionId).toBe('48:5798');
    expect(tr.suppressed).toBe(false);
    // 统计右值真值在 vue 产物里（形态④ parts 数值不丢——vue3 侧同判据）
    expect(tr.vue).toContain('3,792');
    expect(tr.vue).toContain('28');
  });

  it('map 键 = plan 确定性命名（assignSectionComponentNames 单一来源）', () => {
    const nameOf = assignSectionComponentNames([clone(FIXTURE.form)]);
    expect(nameOf.get('48:5798')).toBe(tag);
  });

  it('接管 vue 产物过 SFC 语法闸（刀24，落盘门禁同判据）', () => {
    const r = validateVueSfc(tr.vue, `package/components/${tag}.vue`);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  describe('matchFgTakeoverTargets · vue3 专属两级映射（engineer:782 消费口径）', () => {
    it('① 名命中：subPath=package/components/<tag>.vue ⇒ byName 且 unmatched 空', () => {
      const m = matchFgTakeoverTargets({
        takeoverMap: takeover.map,
        subPaths: [`package/components/${tag}.vue`],
      });
      expect(m.nameHits).toBe(1);
      expect(m.byName.get(`package/components/${tag}.vue`)?.kind).toBe('list');
      expect(m.unmatched).toEqual([]);
    });

    it('② section-id 命中：LLM 自由命名 ≠ tag，但产物带 data-section-id ⇒ bySectionId', () => {
      const m = matchFgTakeoverTargets({
        takeoverMap: takeover.map,
        subPaths: ['package/components/FreeName.vue'],
        fileContents: {
          'package/components/FreeName.vue': `<template><div data-section-id="${tr.sectionId}"></div></template>`,
        },
      });
      expect(m.sectionIdHits).toBe(1);
      expect(m.bySectionId.get('package/components/FreeName.vue')?.kind).toBe('list');
    });

    it('🔴 主组件硬护栏：index.vue 即使带 data-section-id 也不匹配（防整件被叶段顶替）', () => {
      const m = matchFgTakeoverTargets({
        takeoverMap: takeover.map,
        subPaths: ['package/index.vue'],
        fileContents: {
          'package/index.vue': `<template><div data-section-id="${tr.sectionId}"></div></template>`,
        },
      });
      expect(m.evaluated).toBe(0);
      expect(m.byName.size).toBe(0);
      expect(m.bySectionId.size).toBe(0);
    });

    it('fail-open：两级都不中 ⇒ 只进 unmatched 留痕，不动文件', () => {
      const m = matchFgTakeoverTargets({
        takeoverMap: takeover.map,
        subPaths: ['package/components/Other.vue'],
      });
      expect(m.nameHits).toBe(0);
      expect(m.sectionIdHits).toBe(0);
      expect(m.unmatched).toEqual(['package/components/Other.vue']);
    });

    it('空 takeoverMap ⇒ 全零输出（零命中与零问题可区分的计数前提）', () => {
      const m = matchFgTakeoverTargets({ takeoverMap: new Map(), subPaths: ['package/components/X.vue'] });
      expect(m.evaluated).toBe(0);
      expect(m.nameHits).toBe(0);
      expect(m.byName.size).toBe(0);
    });
  });
});
