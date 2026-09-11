/**
 * 🛡️ P1.5 类名规范化器 · 单测（2026-09-11）
 *
 * 规范化器是「类名单一写入者」，必须运行在 classFacts 采集之前，保证：
 *   ① 布尔方言（is-active）→ `${元素基类}--active`
 *   ② 修饰符类形态与元素基类一致（前缀不混搭）
 *   ③ 保守边界：无基类可依据时**不动**（交门禁报警，不臆造基名）
 */
import {
  pickElementBaseToken,
  normalizeTemplateModifierDialect,
  normalizeStyleModifierDialect,
  normalizeClassNameDialect,
} from '../class-dialect-normalizer.js';

describe('pickElementBaseToken', () => {
  it('优先带实例前缀的长形基类', () => {
    expect(pickElementBaseToken(['c-env-monitor-tab-item', 'c-env-monitor-x5-c-env-monitor-tab-item'])).toBe(
      'c-env-monitor-x5-c-env-monitor-tab-item',
    );
  });

  it('无修饰符候选时返回空（不臆造）', () => {
    expect(pickElementBaseToken(['c-x-item--active', 'is-active'])).toBe('');
  });
});

describe('normalizeTemplateModifierDialect', () => {
  it('R1：布尔方言 is-active → 元素基类 + --active（260ff122/0b95f5cf 形态）', () => {
    const tpl = `<div class="c-demo-784zn8qx-c-demo-tab-item" :class="{ 'is-active': on }">t</div>`;
    const { text, changes } = normalizeTemplateModifierDialect(tpl);
    expect(text).toContain(`'c-demo-784zn8qx-c-demo-tab-item--active'`);
    expect(text).not.toContain('is-active');
    expect(changes.length).toBe(1);
  });

  it('R2：修饰符类形态与基类不一致 → 对齐基类形态（1afdb842 形态）', () => {
    const tpl = `<div class="c-env-x5-c-env-tab-item" :class="{ 'c-env-monitor-tab-item--active': on }">t</div>`;
    const { text } = normalizeTemplateModifierDialect(tpl);
    expect(text).toContain(`'c-env-x5-c-env-tab-item--active'`);
    expect(text).not.toContain(`'c-env-monitor-tab-item--active'`);
  });

  it('静态 class 上的别名同样归一，且原 token 被替换（不残留悬空类）', () => {
    const tpl = `<span class="c-x-item is-active"></span>`;
    const { text } = normalizeTemplateModifierDialect(tpl);
    expect(text).toContain('c-x-item--active');
    expect(text).not.toContain('is-active');
  });

  it('保守：元素上无 c-* 基类 → 不动', () => {
    const tpl = `<div :class="{ 'is-active': on }"></div>`;
    const { text, changes } = normalizeTemplateModifierDialect(tpl);
    expect(text).toBe(tpl);
    expect(changes.length).toBe(0);
  });

  it('已规范的元素零改动（幂等）', () => {
    const tpl = `<div class="c-x-item" :class="{ 'c-x-item--active': on }">t</div>`;
    const { text, changes } = normalizeTemplateModifierDialect(tpl);
    expect(text).toBe(tpl);
    expect(changes.length).toBe(0);
  });
});

describe('normalizeStyleModifierDialect', () => {
  it('R3：.base.is-active → .base--active', () => {
    const css = `.c-device-tab-item.is-active {\n  color: #fff;\n}`;
    const { text } = normalizeStyleModifierDialect(css);
    expect(text).toContain('.c-device-tab-item--active {');
    expect(text).not.toContain('.is-active');
  });

  it('无基类的 .is-active 选择器不动（交门禁 C1）', () => {
    const css = `.is-active {\n  color: #fff;\n}`;
    const { text } = normalizeStyleModifierDialect(css);
    expect(text).toBe(css);
  });

  it('声明行里的 active 字样不被误改', () => {
    const css = `.c-x-item {\n  transition: color 0.2s; /* active state */\n}`;
    const { text } = normalizeStyleModifierDialect(css);
    expect(text).toBe(css);
  });
});

describe('normalizeClassNameDialect（产物级）', () => {
  it('模板 + 样式一起归一；不触碰其它文件', () => {
    const files = {
      'package/components/Tabs.vue': `<template>
  <div class="c-x-item" :class="{ 'is-active': on }">t</div>
</template>
<style lang="less" scoped>
.c-x-item.is-active { color: #fff; }
</style>
`,
      'resources/images/a.png': 'binary',
    };
    const { files: out, changes } = normalizeClassNameDialect(files);
    expect(out['package/components/Tabs.vue']).toContain('c-x-item--active');
    expect(out['package/components/Tabs.vue']).not.toContain('is-active');
    expect(out['resources/images/a.png']).toBe('binary');
    expect(changes.length).toBeGreaterThanOrEqual(2);
  });

  it('带属性 <template class="..."> 也能定位（486ec46 教训）', () => {
    const files = {
      'package/index.vue': `<template class="c-mc-max-1-x">
  <div class="c-x-item" :class="{ 'is-active': on }">t</div>
</template>
<script setup></script>
`,
    };
    const { files: out } = normalizeClassNameDialect(files);
    expect(out['package/index.vue']).toContain('c-x-item--active');
  });
});
