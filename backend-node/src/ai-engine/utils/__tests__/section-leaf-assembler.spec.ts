/**
 * 🛡️ S3 第一片（**命名无关版**）：真值文案**原地填槽**。
 * 治「丢内容 / 标题数值错位」且**不动结构/class**（保住样式锚点）。
 * 命名无关：真值取 characters、序取视觉序(y→x)、槽位取 DOM 序，不做"标题/数值"语义判定。
 */
import {
  fillTruthTextSlots,
  collectTextOnlyLeafTexts,
  extractTextSlots,
  findFigmaNodeById,
  isLeafTextAssemblyEnabled,
} from '../section-leaf-assembler.js';

const figma = {
  document: {
    id: 'root',
    name: 'cp',
    type: 'FRAME',
    children: [
      {
        id: '2:3464',
        name: 'Frame 2136637410', // 命名不可信：本模块不用它
        type: 'FRAME',
        children: [
          // 视觉序：y=10 的在上、y=30 的在下（故意在数组里打乱）
          { id: 'a', type: 'TEXT', name: 'd', characters: '16270', absoluteBoundingBox: { x: 0, y: 30 } },
          { id: 'b', type: 'TEXT', name: 't', characters: '货车', absoluteBoundingBox: { x: 0, y: 10 } },
          { id: 'c', type: 'TEXT', name: 'x', characters: '隐藏', visible: false },
        ],
      },
      {
        id: '89:41',
        name: 'chart',
        type: 'FRAME',
        children: [
          { id: 't1', type: 'TEXT', characters: '标题', absoluteBoundingBox: { x: 0, y: 0 } },
          { id: 'v1', type: 'VECTOR', absoluteBoundingBox: { x: 0, y: 20 } },
        ],
      },
    ],
  },
};

const vue = (inner: string) => `<template>
  <div class="c-test-card" data-section-id="2:3464" v-bind="$attrs">
${inner}
  </div>
</template>

<script setup>
const a = 1
</script>

<style lang="less" scoped>
.c-test-card { width: 100%; }
</style>`;

const SLOTS_EMPTY_AND_MISPLACED = `    <div class="c-test-card-label"><span class="c-test-card-label-text"></span></div>
    <div class="c-test-card-value"><span class="c-test-card-value-text">货车</span></div>`;

const run = (files: Record<string, string>, over: Record<string, any> = {}) =>
  fillTruthTextSlots(
    files,
    {
      leafTextAssembly: true,
      figmaNodeData: figma,
      _indexTemplateFacts: { sectionRoots: [{ id: '2:3464', component: 'Card', type: 'body' }] },
      ...over,
    },
    figma,
    { logger: { info: () => {} } },
  );

const KEY = 'package/components/Card.vue';

describe('S3 真值填槽（命名无关）', () => {
  it('真值取 characters、按视觉序(y→x)、跳过隐藏层（不看节点名）', () => {
    const texts = collectTextOnlyLeafTexts(findFigmaNodeById(figma.document, '2:3464'));
    expect(texts!.map((t) => t.t)).toEqual(['货车', '16270']);
  });

  it('含非 TEXT 后代的 section → 非「纯文本叶子」→ 不处理', () => {
    expect(collectTextOnlyLeafTexts(findFigmaNodeById(figma.document, '89:41'))).toBeNull();
  });

  it('extractTextSlots：只取叶子元素，排除 img/svg 等非文本标签', () => {
    const { slots } = extractTextSlots(
      `<div class="a"><span>x</span><img src="a.png"/><svg><path d="1"/></svg><i class="ic"></i></div>`,
    );
    expect(slots.map((s) => s.tag)).toEqual(['span', 'i']);
  });

  it('灰度关（默认）→ 一律不填', () => {
    const src = vue(SLOTS_EMPTY_AND_MISPLACED);
    const r = run({ [KEY]: src }, { leafTextAssembly: false });
    expect(r.filled).toHaveLength(0);
    expect(r.files[KEY]).toBe(src);
  });

  it('空槽补 + 错槽纠：按序写入，**结构/class 一字不动**', () => {
    const src = vue(SLOTS_EMPTY_AND_MISPLACED);
    const r = run({ [KEY]: src });
    expect(r.filled).toHaveLength(1);
    const out = r.files[KEY];
    expect(out).toContain('<span class="c-test-card-label-text">货车</span>');
    expect(out).toContain('<span class="c-test-card-value-text">16270</span>');
    const cls = (s: string) => [...s.matchAll(/class="([^"]*)"/g)].map((m) => m[1]).join('|');
    const tags = (s: string) => [...s.matchAll(/<([a-zA-Z][\w-]*)/g)].map((m) => m[1]).join('|');
    expect(cls(out)).toBe(cls(src));
    expect(tags(out)).toBe(tags(src));
    expect(out.slice(out.indexOf('<style'))).toBe(src.slice(src.indexOf('<style')));
  });

  it('已正确 → 不改（幂等）', () => {
    const src = vue(
      `    <div class="c-test-card-label"><span class="c-test-card-label-text">货车</span></div>
    <div class="c-test-card-value"><span class="c-test-card-value-text">16270</span></div>`,
    );
    const r = run({ [KEY]: src });
    expect(r.filled).toHaveLength(0);
    expect(r.files[KEY]).toBe(src);
  });

  it('槽位数 ≠ 真值条数 → 不猜（no-op）', () => {
    const src = vue(`    <div class="c-test-card-label"><span class="c-test-card-label-text">货车</span></div>`);
    expect(run({ [KEY]: src }).filled).toHaveLength(0);
  });

  it('槽位含动态绑定 {{ }} → 排除后数量不等 → 不填', () => {
    const src = vue(
      `    <div class="c-test-card-label"><span class="c-test-card-label-text">{{ x }}</span></div>
    <div class="c-test-card-value"><span class="c-test-card-value-text"></span></div>`,
    );
    expect(run({ [KEY]: src }).filled).toHaveLength(0);
  });

  it('现有非空槽位文案 ∉ 真值集合 → 拒绝（防在该 section 无关的模板上误填）', () => {
    const src = vue(
      `    <div class="c-test-card-label"><span class="c-test-card-label-text">完全无关的文字</span></div>
    <div class="c-test-card-value"><span class="c-test-card-value-text"></span></div>`,
    );
    expect(run({ [KEY]: src }).filled).toHaveLength(0);
  });

  it('根元素锚点与 section 不一致 → 拒绝', () => {
    const src = vue(SLOTS_EMPTY_AND_MISPLACED).replace('data-section-id="2:3464"', 'data-section-id="9:999"');
    expect(run({ [KEY]: src }).filled).toHaveLength(0);
  });

  it('无 sectionRoots / 无 figma → fail-open', () => {
    const src = vue(SLOTS_EMPTY_AND_MISPLACED);
    expect(run({ [KEY]: src }, { _indexTemplateFacts: {} }).filled).toHaveLength(0);
    expect(fillTruthTextSlots({ [KEY]: src }, { leafTextAssembly: true }, null).filled).toHaveLength(0);
  });

  it('不修改入参（纯函数）', () => {
    const src = vue(SLOTS_EMPTY_AND_MISPLACED);
    const files = { [KEY]: src };
    run(files);
    expect(files[KEY]).toBe(src);
  });

  it('isLeafTextAssemblyEnabled：默认关，显式可开', () => {
    expect(isLeafTextAssemblyEnabled({})).toBe(false);
    expect(isLeafTextAssemblyEnabled({ leafTextAssembly: true })).toBe(true);
  });
});
