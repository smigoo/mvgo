import {
  findFontSizeMultiplierSizing,
  findCrossFileClassRuleConflicts,
  scanProductStyleIssues,
} from './style-conflict-detector.js';

// 🛡️ 2026-10-03：mc-max-1791030024001-f7e57ac6 实锤回归
// （按钮本体样式错写容器 class → 容器收缩 + 字号乘数换算尺寸失真 60×40 → 51×34）。
describe('style-conflict-detector', () => {
  describe('findFontSizeMultiplierSizing', () => {
    it('hits the f7e57ac6 font-multiplier regression (var form)', () => {
      const src = `.c-f7e57a-antd-button {
  width: calc(var(--fontSize, 14px) * 4.29);
  height: calc(var(--fontSize, 14px) * 2.86);
}`;
      const r = findFontSizeMultiplierSizing(src, 'resources/styles/common.less');

      expect(r.hits).toHaveLength(2);
      expect(r.warnings[0]).toContain('Figma 真值 px');
      expect(r.warnings[0]).toContain('resources/styles/common.less');
    });

    it('hits the @fontSize form and min- prefixed variants', () => {
      const src = `.a { width: calc(@fontSize * 2.86); }
.b { min-width: calc(var(--fontSize) * 1.5); }`;
      const r = findFontSizeMultiplierSizing(src, 'a.less');

      expect(r.hits).toHaveLength(2);
    });

    it('does not flag integer multipliers, non-font calc, or non-dimension props', () => {
      const src = `.a { width: calc(@fontSize * 2); }
.b { width: calc(100% - 12px); }
.c { line-height: calc(var(--fontSize, 14px) * 1.5); }
.d { padding: calc(var(--fontSize, 14px) * 0.71) 0; }`;
      const r = findFontSizeMultiplierSizing(src, 'a.less');

      expect(r.hits).toHaveLength(0);
      expect(r.warnings).toHaveLength(0);
    });
  });

  describe('findCrossFileClassRuleConflicts', () => {
    const LESS_FILE = {
      'resources/styles/common.less': `.c-f7e57a-antd-button {
  display: inline-flex;
  width: calc(var(--fontSize, 14px) * 4.29);
  background: var(--colorPrimary, #3965ff);
  border-radius: 8px;
}`,
    };
    const SFC_FILE = {
      'package/components/HeaderSection2.vue': `<template><div class="c-f7e57a-antd-button"><a-button /></template>
<style lang="less" scoped>
.c-f7e57a-antd-button {
  display: flex;
  width: 100%;
  justify-content: center;

  :deep(.ant-btn) {
    width: 60px;
    height: 40px;
    background: @color-primary;
  }
}
</style>`,
    };

    it('hits the f7e57ac6 container/body double-definition regression', () => {
      const r = findCrossFileClassRuleConflicts({ ...LESS_FILE, ...SFC_FILE });

      expect(r.conflicts).toHaveLength(1);
      expect(r.conflicts[0].className).toBe('c-f7e57a-antd-button');
      expect(r.conflicts[0].attrs).toContain('width');
      expect(r.warnings[0]).toContain('静默覆盖');
    });

    it('does not flag :deep nested declarations as container conflicts', () => {
      // SFC 里容器 class 只有 width；:deep(.ant-btn) 的 width/height 属嵌套块（本体），
      // 不得计入容器属性集 —— 但本体样式与 common.less 同 class 无关（class 名不同）。
      const r = findCrossFileClassRuleConflicts({
        'resources/styles/common.less': `.card { width: 100%; padding: 8px; }`,
        'package/components/A.vue': `<style scoped>
.card {
  color: red;

  :deep(.ant-btn) {
    width: 60px;
    padding: 0;
  }
}
</style>`,
      });

      expect(r.conflicts).toHaveLength(0);
    });

    it('does not flag attributes outside the conflict whitelist', () => {
      const r = findCrossFileClassRuleConflicts({
        'resources/styles/common.less': `.card { color: red; cursor: pointer; }`,
        'package/components/A.vue': `<style scoped>.card { color: blue; }</style>`,
      });

      expect(r.conflicts).toHaveLength(0);
    });

    it('does not flag when the class only exists on one side', () => {
      const r = findCrossFileClassRuleConflicts({
        'resources/styles/common.less': `.only-less { width: 100%; }`,
      });

      expect(r.conflicts).toHaveLength(0);
    });
  });

  describe('scanProductStyleIssues', () => {
    it('summarizes both issue kinds over the product file set', () => {
      const r = scanProductStyleIssues({
        'resources/styles/common.less': `.btn { width: calc(var(--fontSize, 14px) * 4.29); }`,
        'package/components/HeaderSection2.vue': `<style scoped>.btn { width: 100%; }</style>`,
        'package/index.vue': `<template><div /></template>`,
      });

      expect(r.fontSizeSizing).toBe(1);
      expect(r.classConflicts).toBe(1);
      expect(r.warnings.length).toBeGreaterThanOrEqual(2);
    });

    it('returns zeros for a clean product', () => {
      const r = scanProductStyleIssues({
        'resources/styles/common.less': `.card { width: 100%; }`,
        'package/components/A.vue': `<style scoped>.card-own { height: 40px; }</style>`,
      });

      expect(r.fontSizeSizing).toBe(0);
      expect(r.classConflicts).toBe(0);
      expect(r.warnings).toHaveLength(0);
    });
  });
});
