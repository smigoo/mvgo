/**
 * 🛡️ S1（2026-09-28 · (b) 切片一）：子组件模板根节点注入 `data-section-id`。
 *
 * 背景：子组件模板由 LLM 整文件即兴写，根节点普遍没有 section 锚点（全语料审计 1084/1200=90% 缺失），
 * 导致 ① section 级事实/校验无法定位 ② resource-mounter 的 `[data-section-id=…]` 落空。
 * 事实源 = 确定性 index 装配透出的 `input._indexTemplateFacts.sectionRoots`。
 */
import { injectSectionAnchorsIntoSubComponents } from './code-fix-rules.js';

const vue = (open: string) => `<template>
  ${open}
    <span class="c-test-cons-num">1280</span>
  </div>
</template>

<script setup>
const a = 1
</script>

<style lang="less" scoped>
.c-test-cons-num { color: red; }
</style>`;

const inputWith = (sectionRoots: any) => ({ _indexTemplateFacts: { sectionRoots } });

describe('S1 injectSectionAnchorsIntoSubComponents', () => {
  const ROOTS = [{ id: '2:8437', component: 'ContentCons', type: 'body' }];

  it('根元素缺锚点 → 注入 data-section-id（值 = 该 section 的 Figma 节点 id）', () => {
    const files = { 'package/components/ContentCons.vue': vue('<div class="c-test-cons">') };
    const r = injectSectionAnchorsIntoSubComponents(files, inputWith(ROOTS));
    expect(r.injected).toEqual(['package/components/ContentCons.vue ← 2:8437']);
    // 属性顺序无关（Vue 不依赖顺序），只要锚点进了根元素开标签
    expect(r.files['package/components/ContentCons.vue']).toMatch(
      /<div[^>]*\bdata-section-id="2:8437"[^>]*>/,
    );
    // 其余文件不受影响
    expect(Object.keys(r.files)).toEqual(['package/components/ContentCons.vue']);
  });

  it('已有锚点 → 幂等跳过（内容逐字不变）', () => {
    const src = vue('<div class="c-test-cons" data-section-id="2:8437">');
    const files = { 'package/components/ContentCons.vue': src };
    const r = injectSectionAnchorsIntoSubComponents(files, inputWith(ROOTS));
    expect(r.injected).toHaveLength(0);
    expect(r.files['package/components/ContentCons.vue']).toBe(src);
  });

  it('无 sectionRoots 事实 → fail-open（原样返回）', () => {
    const src = vue('<div class="c-test-cons">');
    const files = { 'package/components/ContentCons.vue': src };
    expect(injectSectionAnchorsIntoSubComponents(files, {}).files['package/components/ContentCons.vue']).toBe(src);
    expect(injectSectionAnchorsIntoSubComponents(files, inputWith([])).injected).toHaveLength(0);
  });

  it('不修改入参（纯函数）', () => {
    const src = vue('<div class="c-test-cons">');
    const files = { 'package/components/ContentCons.vue': src };
    injectSectionAnchorsIntoSubComponents(files, inputWith(ROOTS));
    expect(files['package/components/ContentCons.vue']).toBe(src);
  });

  it('子组件文件不存在 → 跳过，不抛', () => {
    const r = injectSectionAnchorsIntoSubComponents(
      { 'package/index.vue': '<template><div/></template>' },
      inputWith(ROOTS),
    );
    expect(r.injected).toHaveLength(0);
  });
});
