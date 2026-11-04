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

    // 🔴 2026-11-04 (a) 可见性扩展（CS1 刀口，(b) 的纯观测伴刀，产物一字不改）
    it('(a) 🔴 深度 ≥2 嵌套后代纯 class 规则的 box-shadow 双定义可被检出', () => {
      // 真机形态：面板 chrome 发光（box-shadow）写在父选择器内的嵌套后代 class 上（§3.6 a2），
      // 原实现只提「深度 1」声明 ⇒ ⑩ 漏报。扩展后归属到「最近的纯 class 层」。
      const r = findCrossFileClassRuleConflicts({
        'resources/styles/common.less': `.c-chrome {
  box-shadow: 0 0 8px #ffc800;
}`,
        'package/components/A.vue': `<style scoped>
.c-wrap {
  .c-chrome {
    box-shadow: 0 0 8px #00ff00;
  }
}
</style>`,
      });

      expect(r.conflicts).toHaveLength(1);
      expect(r.conflicts[0].className).toBe('c-chrome');
      expect(r.conflicts[0].attrs).toContain('box-shadow');
    });

    it('(a) 🔴 非纯 class 嵌套层（:deep / & / >）内部声明一律不计入（防假阳性）', () => {
      // 容器 class 里嵌 :deep(.ant-btn) / &:hover / > .child 是标准写法，其声明不属本 class。
      // 构造反例：若误把嵌套层拆成 .ant-btn / .child，会与 less 的同名 class 撞出冲突。
      const r = findCrossFileClassRuleConflicts({
        'resources/styles/common.less': `.c-x { box-shadow: 0 0 8px #ffc800; }
.ant-btn { box-shadow: 0 0 8px #00ff00; }
.child { box-shadow: 0 0 8px #0000ff; }`,
        'package/components/A.vue': `<style scoped>
.c-x {
  box-shadow: 0 0 8px #ffc800;

  :deep(.ant-btn) {
    box-shadow: 0 0 8px #ff00ff;
  }
  &:hover {
    box-shadow: 0 0 8px #00ffff;
  }
  > .child {
    box-shadow: 0 0 8px #ffff00;
  }
}
</style>`,
      });

      // .c-x 顶层同值 ⇒ 不冲突；三个嵌套层全部被排除 ⇒ 0 冲突。
      expect(r.conflicts).toHaveLength(0);
    });

    it('(a) box-shadow 已入冲突白名单：同 class 取值不同即报', () => {
      const r = findCrossFileClassRuleConflicts({
        'resources/styles/common.less': `.p { box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2); }`,
        'package/components/A.vue': `<style scoped>.p { box-shadow: none; }</style>`,
      });

      expect(r.conflicts).toHaveLength(1);
      expect(r.conflicts[0].attrs).toEqual(['box-shadow']);
    });

    it('(a) box-shadow 主题变量别名双写 = 语义同值，不报（回归：归一仍生效）', () => {
      // @panel-shadow（less）与 var(--panelShadow)（SFC）编译后同源 ⇒ 归一为 var(panelshadow) ⇒ 不冲突。
      const r = findCrossFileClassRuleConflicts({
        'resources/styles/common.less': `.p { box-shadow: @panel-shadow; }`,
        'package/components/A.vue': `<style scoped>.p { box-shadow: var(--panelShadow); }</style>`,
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
