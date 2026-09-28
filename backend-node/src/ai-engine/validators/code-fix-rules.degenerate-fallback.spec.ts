/**
 * 🛡️ S2（2026-09-28 · (b) 切片二 · 窄触发）：退化子组件模板的确定性兜底。
 *
 * 触发必须同时满足：①绑定 declare.json **未声明**的 businessProps 键（⇒ 运行期必空）
 * ②根元素有 data-section-id（S1 注入）且该 section 的 Figma 子树有真值文案。
 * ⇒ **正常产物永不触发**；动作仅在根元素末尾**追加**真值文案块，不改动 LLM 已写的 markup。
 */
import { healDegenerateSubComponentContent, DEGENERATE_FALLBACK_CLASS } from './code-fix-rules.js';

const figma = {
  document: {
    id: 'root',
    name: 'cp',
    type: 'FRAME',
    children: [
      {
        id: '2:8437',
        name: 'header',
        type: 'FRAME',
        children: [
          { id: 't2', type: 'TEXT', characters: '完好率', absoluteBoundingBox: { x: 20, y: 30 } },
          { id: 't1', type: 'TEXT', characters: '设备类型', absoluteBoundingBox: { x: 0, y: 0 } },
          { id: 't3', type: 'TEXT', characters: '68562', absoluteBoundingBox: { x: 0, y: 0 } },
          { id: 't4', type: 'TEXT', characters: '隐藏文字', visible: false },
        ],
      },
    ],
  },
};

const DECLARE_EMPTY = { 'declare.json': JSON.stringify({ businessConfig: {} }) };
const DECLARE_OK = {
  'declare.json': JSON.stringify({ businessConfig: { actions: { key: 'actions', name: '操作', type: 'array', default: [] } } }),
};

const vue = (open: string, inner: string) => `<template>
    ${open}
      ${inner}
    </div>
  </template>

<script setup>
</script>
`;

describe('S2 healDegenerateSubComponentContent（窄触发兜底）', () => {
  const ANCHOR = 'data-section-id="2:8437"';
  const DEAD = `v-for="(item, index) in businessProps.actions"`;

  it('绑定未声明 props + 有锚点 + section 有真值 → 根元素末尾追加真值块（视觉序、排除隐藏层）', () => {
    const files = {
      ...DECLARE_EMPTY,
      'package/components/HeaderSection.vue': vue(
        `<div class="c-test-header" ${ANCHOR}>`,
        `<span ${DEAD}>{{ item.label }}</span>`,
      ),
    };
    const r = healDegenerateSubComponentContent(files, figma);
    expect(r.healed).toHaveLength(1);
    const out = r.files['package/components/HeaderSection.vue'];
    expect(out).toContain(DEGENERATE_FALLBACK_CLASS);
    // 视觉序：y=0 的「设备类型」「68562」在 y=30 的「完好率」之前（同 y 按 x）
    expect(out).toMatch(
      new RegExp(
        `${DEGENERATE_FALLBACK_CLASS}"[^>]*><span>设备类型</span><span>68562</span><span>完好率</span>`,
      ),
    );
    expect(out).not.toContain('隐藏文字'); // visible:false 不入真值
    // 不改动 LLM 原 markup
    expect(out).toContain(DEAD);
  });

  it('绑定已声明的键 → 不触发（正常产物零影响）', () => {
    const files = {
      ...DECLARE_OK,
      'package/components/HeaderSection.vue': vue(`<div class="c-test-header" ${ANCHOR}>`, `<span ${DEAD}>{{ item.label }}</span>`),
    };
    expect(healDegenerateSubComponentContent(files, figma).healed).toHaveLength(0);
  });

  it('无 data-section-id 锚点 → 不触发（不猜 section）', () => {
    const files = {
      ...DECLARE_EMPTY,
      'package/components/HeaderSection.vue': vue(`<div class="c-test-header">`, `<span ${DEAD}>{{ item.label }}</span>`),
    };
    expect(healDegenerateSubComponentContent(files, figma).healed).toHaveLength(0);
  });

  it('幂等：已含兜底块 → 不重复追加', () => {
    const base = vue(`<div class="c-test-header" ${ANCHOR}>`, `<span ${DEAD}>{{ item.label }}</span>`);
    const once = healDegenerateSubComponentContent(
      { ...DECLARE_EMPTY, 'package/components/HeaderSection.vue': base },
      figma,
    ).files['package/components/HeaderSection.vue'];
    const twice = healDegenerateSubComponentContent(
      { ...DECLARE_EMPTY, 'package/components/HeaderSection.vue': once },
      figma,
    );
    expect(twice.healed).toHaveLength(0);
    expect(twice.files['package/components/HeaderSection.vue']).toBe(once);
  });

  it('无 declare.json / 无 figmaNodeData → fail-open', () => {
    const files = { 'package/components/HeaderSection.vue': vue(`<div class="c-test-header" ${ANCHOR}>`, `<span ${DEAD}></span>`) };
    expect(healDegenerateSubComponentContent(files, figma).healed).toHaveLength(0);
    expect(
      healDegenerateSubComponentContent({ ...DECLARE_EMPTY, ...files }, null).healed,
    ).toHaveLength(0);
  });

  it('不修改入参（纯函数）', () => {
    const src = vue(`<div class="c-test-header" ${ANCHOR}>`, `<span ${DEAD}></span>`);
    const files = { ...DECLARE_EMPTY, 'package/components/HeaderSection.vue': src };
    healDegenerateSubComponentContent(files, figma);
    expect(files['package/components/HeaderSection.vue']).toBe(src);
  });
});
