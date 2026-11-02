/**
 * style-dedup-guard 宿主类方向/display 豁免（R6-B1，2026-11-02 ·
 * mc-max-1793601942419-d140fb11 实锤立项）
 *
 * 病灶（与 R4b-A 同一事故链的第二环）：dedup 正向剥离把 SFC 宿主类的显式
 * `flex-direction: row` 剥掉（前提=shared 表也有同名属性）⇒ 注入器（R4b-A 仲裁）
 * 看到的是「方向缺失」⇒ 按几何 fact 补 column ⇒ 仲裁基础被 dedup 拆掉，
 * 头部仍被写成竖直流。R4b-A 只防「翻转显式声明」，防不住「先剥后补」。
 *
 * R6-B1 治本：**宿主类（模板 `data-section-id` 标签上的 class）的
 * `display` / `flex-direction` 声明豁免正向剥离**。段布局方向是
 * R4b-A 确立的仲裁核心事实，dedup 不得拆其载体；其余布局属性
 * （width/flex/gap/…）剥离行为不变（mc-1788415227440 治本不回退）。
 * 与 R4b-A 同一条纪律：**收敛动作不得破坏方向仲裁的单一来源**。
 *
 * 变异对照：去掉豁免分支 ⇒ 用例 ① 必红。
 */
import {
  pruneDuplicateStyleDecls,
  pruneVueStyleAgainstShared,
} from '../style-dedup-guard.js';

const SHARED = {
  path: 'resources/styles/common.less',
  content: `@fontSize: var(--fontSize);
.c-device-content-header {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 16px;
}
.c-device-code-group {
  display: flex;
  flex-direction: row;
  gap: 8px;
}
`,
};

const VUE_WITH_HOST = {
  path: 'package/components/ContentHeader.vue',
  content: `<template>
  <div class="c-device-content-header" data-section-id="801:3">
    <div class="c-device-code-group"></div>
  </div>
</template>
<style lang="less" scoped>
.c-device-content-header {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 16px;
}
.c-device-code-group {
  display: flex;
  flex-direction: row;
  align-items: center;
}
</style>`,
};

describe('style-dedup-guard R6-B1 宿主类方向/display 豁免', () => {
  it('① d140fb11 复刻：宿主类 display/flex-direction 豁免剥离，其余布局属性照剥', () => {
    const r = pruneDuplicateStyleDecls([SHARED, VUE_WITH_HOST]);
    const vue = r.files.find(
      (f) => f.path === 'package/components/ContentHeader.vue',
    );
    // 豁免：方向与 display 保留产物显式声明（row 不被 shared 的 column 掏空）
    expect(vue.content).toContain('flex-direction: row');
    expect(vue.content).toMatch(/\.c-device-content-header\s*\{[^}]*display:\s*flex/s);
    // 非豁免布局属性照剥（shared 有 gap → SFC 的 gap 剥掉）
    const block = /\.c-device-content-header\s*\{([^}]*)\}/s.exec(vue.content)[1];
    expect(block).not.toContain('gap');
    expect(block).toContain('align-items: flex-start'); // 独有属性保留
    expect(r.changes.length).toBeGreaterThan(0);
  });

  it('② 非宿主类（无 data-section-id）方向/display 照剥 —— 原行为不变', () => {
    const r = pruneDuplicateStyleDecls([SHARED, VUE_WITH_HOST]);
    const vue = r.files.find(
      (f) => f.path === 'package/components/ContentHeader.vue',
    );
    // .c-device-code-group 无 data-section-id → 方向照剥（shared 真值接管）
    const block = /\.c-device-code-group\s*\{([^}]*)\}/s.exec(vue.content)[1];
    expect(block).not.toContain('flex-direction');
  });

  it('③ 回归保护（mc-1788415227440）：非宿主类 width 冲突照剥（全剥空→整块删除）', () => {
    const shared = {
      path: 'resources/styles/common.less',
      content: `.c-tabs-wrapper { width: 160px; flex: 0 0 auto; }`,
    };
    const vue = {
      path: 'package/components/Tabs.vue',
      content: `<template><div class="c-tabs-wrapper"></div></template>
<style scoped>
.c-tabs-wrapper { flex: 1 1 0; width: 100%; padding-top: 4px; }
</style>`,
    };
    const r = pruneDuplicateStyleDecls([shared, vue]);
    const out = r.files.find((f) => f.path === 'package/components/Tabs.vue');
    const block = /\.c-tabs-wrapper\s*\{([^}]*)\}/s.exec(out.content)[1];
    expect(block).not.toContain('width');
    expect(block).not.toContain('flex:');
    expect(block).toContain('padding-top: 4px'); // 独有属性保留
  });

  it('④ 无 data-section-id 的 vue → 行为与旧完全一致', () => {
    const vue = {
      path: 'package/components/Legacy.vue',
      content: `<template><div class="c-device-content-header"></div></template>
<style scoped>
.c-device-content-header { display: flex; flex-direction: row; align-self: auto; }
</style>`,
    };
    const r = pruneDuplicateStyleDecls([SHARED, vue]);
    const out = r.files.find((f) => f.path === 'package/components/Legacy.vue');
    const block = /\.c-device-content-header\s*\{([^}]*)\}/s.exec(out.content)[1];
    expect(block).not.toContain('flex-direction');
    expect(block).not.toContain('display');
    expect(block).toContain('align-self: auto'); // 独有属性保留
  });

  it('⑤ 幂等：豁免后二次执行无变更', () => {
    const once = pruneDuplicateStyleDecls([SHARED, VUE_WITH_HOST]);
    const twice = pruneDuplicateStyleDecls(once.files);
    expect(twice.changes.length).toBe(0);
  });

  it('⑥ pruneVueStyleAgainstShared 直调（hostClasses 显式传入）同样豁免', () => {
    const vue = `<template><div class="c-x" data-section-id="12:34"></div></template>
<style scoped>
.c-x { display: grid; flex-direction: row; }
</style>`;
    const sharedClasses = new Map([
      ['c-x', 'display: flex; flex-direction: column;'],
    ]);
    const r = pruneVueStyleAgainstShared(vue, sharedClasses, new Set(['c-x']));
    expect(r.content).toContain('display: grid');
    expect(r.content).toContain('flex-direction: row');
    expect(r.changes.length).toBe(0);
  });
});
