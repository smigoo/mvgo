/**
 * 🛡️ P1.8 微码平台骨架生成器 + 字体归一器 · 单测（2026-09-11）
 *
 * 事故：lite 产物微码规范检查全红（M2-3/M2-4/M3-5/M3-6/M4-8）—— 根因是 lite 自造精简骨架，
 * 缺 css-vars.js / common.less / themes/*；且不过字体归一链（M5-6/M5-7）。
 * 本 spec 锁定：① 骨架文件集完备且自洽；② 完整性校验能抓出缺失；③ 字体归一符合 max 契约。
 */
import {
  buildMcSkeleton,
  buildIndexLess,
  buildThemeVarsLess,
  buildCommonLessSkeleton,
  checkSkeletonCompleteness,
  REQUIRED_SKELETON_FILES,
} from '../mc-skeleton.js';
import { normalizeFontSizeLiterals, normalizeFontSizesInFiles } from '../font-size-normalizer.js';

describe('buildMcSkeleton（单一骨架生成器）', () => {
  const sk = buildMcSkeleton({ componentName: 'env-monitor', rootClass: 'c-env-monitor' });

  it('产出全部必需骨架文件', () => {
    for (const req of REQUIRED_SKELETON_FILES) {
      if (req.path === 'declare.json') continue; // 由调用方写入（内容来自模型/契约）
      expect(Object.keys(sk)).toContain(req.path);
    }
  });

  it('index.less 含 @import theme-vars + 默认主题调用 + common.less 引入（M4-5/M4-6）', () => {
    const idx = buildIndexLess();
    expect(idx).toContain(`@import './themes/theme-vars.less'`);
    expect(idx).toContain('.common();');
    expect(idx).toContain('.theme-light();');
    expect(idx).toContain(`@import (multiple) './common.less'`);
    expect(idx).toContain(`@import './themes/dark.less'`);
  });

  it('theme-vars.less 含三 mixin 且 @fontSize 为 var(--fontSize) 精确映射（M5-6）', () => {
    const tv = buildThemeVarsLess();
    expect(tv).toContain('.common() {');
    expect(tv).toContain('.theme-light() {');
    expect(tv).toContain('.theme-dark() {');
    expect(tv).toMatch(/@fontSize:\s*var\(--fontSize\);/);
    expect(tv).not.toMatch(/@fontSize:\s*\d+px/);
  });

  it('common.less 骨架引 theme-vars 并调 .common()（否则 @fontSize 不可用）', () => {
    const cl = buildCommonLessSkeleton({ componentName: 'x', rootClass: 'c-x' });
    expect(cl).toContain(`@import './themes/theme-vars.less'`);
    expect(cl).toContain('.common();');
    expect(cl).toContain('.c-x {');
  });

  it('css-vars.js 导出 common/dark/light（M4-4）', () => {
    expect(sk['resources/config/css-vars.js']).toMatch(/export\s*\{\s*common,\s*dark,\s*light\s*\}/);
  });

  it('declare.js 传入 cssVars（M4-2）', () => {
    expect(sk['declare.js']).toMatch(/cssVars:\s*\{\s*common,\s*dark,\s*light\s*\}/);
  });

  it('component.js 导出 package/index.vue（M4-3）', () => {
    expect(sk['component.js']).toContain(`import component from './package/index.vue'`);
  });
});

describe('checkSkeletonCompleteness（门禁 CODE-026 判据）', () => {
  const base = {
    'package/index.vue': `<template><div class="c-x"></div></template>
<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>`,
    'declare.json': '{}',
    ...buildMcSkeleton({ componentName: 'x' }),
  };

  it('骨架完整 + index.vue 引用 index.less → 零违规', () => {
    expect(checkSkeletonCompleteness(base)).toEqual([]);
  });

  it('缺 css-vars.js / themes → 逐项报出（lite 事故形态）', () => {
    const broken = { ...base };
    delete broken['resources/config/css-vars.js'];
    delete broken['resources/styles/themes/theme-vars.less'];
    delete broken['resources/styles/common.less'];
    const v = checkSkeletonCompleteness(broken);
    expect(v.map((x) => x.code).sort()).toEqual(['M2-3', 'M2-4', 'M3-6']);
  });

  it('index.vue 未引用 styles/index.less → M4-8', () => {
    const broken = {
      ...base,
      'package/index.vue': `<template><div class="c-x"></div></template>\n<style scoped>.c-x{color:red}</style>`,
    };
    const v = checkSkeletonCompleteness(broken);
    expect(v.some((x) => x.code === 'M4-8')).toBe(true);
  });

  it('非微码产物（无 declare.json）不适用 → 零违规（不误伤 vue3 路径）', () => {
    const vue3 = { 'package/index.vue': '<template><div/></template>' };
    expect(checkSkeletonCompleteness(vue3)).toEqual([]);
  });
});

describe('normalizeFontSizeLiterals（M5-6/M5-7）', () => {
  it('基准值 14px → var(--fontSize, 14px)', () => {
    const r = normalizeFontSizeLiterals('.a { font-size: 14px; }');
    expect(r.text).toContain('var(--fontSize, 14px)');
  });

  it('非基准值 → calc(var(--fontSize, 14px) * ratio)（与 max 合格产物同款）', () => {
    const r = normalizeFontSizeLiterals('.a { font-size: 12px; }\n.b { font-size: 26px; }');
    expect(r.text).toContain('calc(var(--fontSize, 14px) * 0.8571)');
    expect(r.text).toContain('calc(var(--fontSize, 14px) * 1.8571)');
    expect(r.changes.length).toBe(2);
  });

  it('≤5px 视为非字体量 → 不动', () => {
    const src = '.a { font-size: 4px; }';
    expect(normalizeFontSizeLiterals(src).text).toBe(src);
  });

  it('注释里的示例不被改', () => {
    const src = '/* font-size: 20px */\n.a { color: red; }';
    expect(normalizeFontSizeLiterals(src).text).toBe(src);
  });

  it('只作用于 .vue 的 <style> 块与 .less/.css（JS 字符串不动）', () => {
    const files = {
      'package/index.vue': `<script setup>\nconst s = 'font-size: 20px'\n</script>\n<style scoped>.a { font-size: 20px; }</style>`,
      'resources/styles/common.less': '.b { font-size: 18px; }',
    };
    const { files: out, changes } = normalizeFontSizesInFiles(files);
    expect(out['package/index.vue']).toContain(`const s = 'font-size: 20px'`);
    expect(out['package/index.vue']).toContain('calc(var(--fontSize, 14px) * 1.4286)');
    expect(out['resources/styles/common.less']).toContain('calc(var(--fontSize, 14px) * 1.2857)');
    expect(changes.length).toBe(2);
  });

  it('幂等：二次执行零改动', () => {
    const once = normalizeFontSizeLiterals('.a { font-size: 20px; }');
    const twice = normalizeFontSizeLiterals(once.text);
    expect(twice.changes).toEqual([]);
    expect(twice.text).toBe(once.text);
  });
});
