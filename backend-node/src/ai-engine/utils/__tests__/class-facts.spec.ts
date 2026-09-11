/**
 * 🛡️ P1.1 类名事实单一采集实现 · 单测（2026-09-11）
 *
 * 核心保证（260ff122 事故后固化）：
 *  ① 修饰符（`--mod`）逐字保留、独立成键，禁止跨修饰符合并；
 *  ② 解析结果与模板属性书写顺序无关（消除「攻击面随写法漂移」）；
 *  ③ 精确命中优先；基名无修饰符形态唯一时重组 `DOM基名 + 后缀`；
 *  ④ 实例前缀长类的内层语义别名补位（scoped 短类 → DOM 长类对齐）。
 */
import {
  splitModifier,
  hasModifier,
  normalizeModifierSuffix,
  collectDomTokensFromTemplate,
  collectFileClassFact,
  resolveDomClass,
  collectClassFacts,
} from '../class-facts.js';

const TPL_STATIC_FIRST = `<template>
  <div class="c-x-tab-item" :class="{ 'c-x-tab-item--active': active === 'a' }">A</div>
  <div class="c-x-tab-item" :class="{ 'c-x-tab-item--active': active === 'b' }">B</div>
</template>`;

const TPL_CLASS_BINDING_FIRST = `<template>
  <div :class="{ 'c-x-tab-item--active': active === 'a' }" class="c-x-tab-item">A</div>
  <div :class="{ 'c-x-tab-item--active': active === 'b' }" class="c-x-tab-item">B</div>
</template>`;

describe('splitModifier / hasModifier', () => {
  it('BEM 双横线修饰符切分（后缀原样保留）', () => {
    expect(splitModifier('c-x-tab-item--active')).toEqual({
      base: 'c-x-tab-item',
      suffix: '--active',
    });
    expect(hasModifier('c-x-tab-item--active')).toBe(true);
  });

  it('单横线激活类兼容切分', () => {
    expect(splitModifier('c-x-tab-item-active')).toEqual({
      base: 'c-x-tab-item',
      suffix: '-active',
    });
  });

  it('无修饰符类后缀为空', () => {
    expect(splitModifier('c-x-tab-item')).toEqual({ base: 'c-x-tab-item', suffix: '' });
    expect(hasModifier('c-x-tab-item')).toBe(false);
  });

  it('别名归一（is-active / on → --active）', () => {
    expect(normalizeModifierSuffix('is-active')).toBe('--active');
    expect(normalizeModifierSuffix('--on')).toBe('--active');
    expect(normalizeModifierSuffix('--selected')).toBe('--selected');
  });
});

describe('collectDomTokensFromTemplate', () => {
  it('静态 class 与 :class 对象 key 都采集（原样保留）', () => {
    const toks = collectDomTokensFromTemplate(TPL_STATIC_FIRST);
    expect(toks).toContain('c-x-tab-item');
    expect(toks).toContain('c-x-tab-item--active');
  });

  it('数组形态 :class 采集', () => {
    const toks = collectDomTokensFromTemplate(
      `<template><div :class="['c-x-a', {'c-x-b--on': on}]"></div></template>`,
    );
    expect(toks).toContain('c-x-a');
    expect(toks).toContain('c-x-b--on');
  });
});

describe('顺序无关性（本次事故根治的核心保证）', () => {
  it('属性书写顺序反转 → 解析结果逐项一致', () => {
    const f1 = collectFileClassFact(TPL_STATIC_FIRST);
    const f2 = collectFileClassFact(TPL_CLASS_BINDING_FIRST);
    expect(JSON.stringify(resolveDomClass(f1, 'c-x-tab-item'))).toBe(
      JSON.stringify(resolveDomClass(f2, 'c-x-tab-item')),
    );
    expect(JSON.stringify(resolveDomClass(f1, 'c-x-tab-item--active'))).toBe(
      JSON.stringify(resolveDomClass(f2, 'c-x-tab-item--active')),
    );
  });

  it('修饰符类独立成键：基类与激活类互不覆盖', () => {
    const f = collectFileClassFact(TPL_STATIC_FIRST);
    expect(resolveDomClass(f, 'c-x-tab-item')?.variants).toEqual(['c-x-tab-item']);
    expect(resolveDomClass(f, 'c-x-tab-item--active')?.variants).toEqual([
      'c-x-tab-item--active',
    ]);
  });

  it('旧实现在此形态下会把激活选择器收敛成基类（回归断言）', () => {
    const f = collectFileClassFact(TPL_STATIC_FIRST);
    const active = resolveDomClass(f, 'c-x-tab-item--active');
    expect(active?.variants).not.toEqual(['c-x-tab-item']);
    expect(active?.variants[0]).toMatch(/--active$/);
  });
});

describe('实例前缀长类对齐（④ #648/#649 语义保留）', () => {
  const LONG_TPL = `<template>
  <div class="c-demo-card-malvtjd5-c-demo-card-wrap">
    <span class="c-demo-card-malvtjd5-c-demo-card-title--active">t</span>
  </div>
</template>`;

  it('DOM 全长形：scoped 短类 → 长类', () => {
    const f = collectFileClassFact(LONG_TPL);
    expect(resolveDomClass(f, 'c-demo-card-wrap')?.variants).toEqual([
      'c-demo-card-malvtjd5-c-demo-card-wrap',
    ]);
  });

  it('DOM 长形 + 修饰符：短类带修饰符 → 长类带修饰符（后缀逐字保留）', () => {
    const f = collectFileClassFact(LONG_TPL);
    const r = resolveDomClass(f, 'c-demo-card-title--active');
    expect(r?.variants).toEqual(['c-demo-card-malvtjd5-c-demo-card-title--active']);
  });

  it('混合 DOM：短类真实存在时优先短类，不臆造前缀', () => {
    const f = collectFileClassFact(`<template>
  <div class="c-demo-mix-malvtjd5-c-demo-mix-long">
    <span class="c-demo-mix-short">短</span>
  </div>
</template>`);
    expect(resolveDomClass(f, 'c-demo-mix-short')?.variants).toEqual(['c-demo-mix-short']);
    expect(resolveDomClass(f, 'c-demo-mix-long')?.variants).toEqual([
      'c-demo-mix-malvtjd5-c-demo-mix-long',
    ]);
  });

  it('DOM 无该基名 → null（fail-open 保留原选择器）', () => {
    const f = collectFileClassFact(LONG_TPL);
    expect(resolveDomClass(f, 'c-unknown-item')).toBeNull();
  });
});

describe('collectClassFacts（产物级）', () => {
  it('按文件采集，非 .vue 与无 template 文件跳过', () => {
    const facts = collectClassFacts({
      'package/index.vue': '<template><div class="c-idx-root"></div></template>',
      'package/components/A.vue': TPL_STATIC_FIRST,
      'resources/styles/common.less': '.c-x {}',
      'package/components/NoTpl.vue': '<script setup></script>',
    });
    expect(Object.keys(facts.byFile).sort()).toEqual([
      'package/components/A.vue',
      'package/index.vue',
    ]);
    expect(resolveDomClass(facts.byFile['package/components/A.vue'], 'c-x-tab-item')).toBeTruthy();
  });
});
