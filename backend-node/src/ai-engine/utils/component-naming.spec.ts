import {
  autoFixNonAsciiClassNames,
} from './component-naming.js';

/**
 * 🛡️ §六 #3 类名净化（2026-09-30 · f8116aa6「class 出现了中文」实锤）：
 * 中文 Figma 层名进 class → 确定性出口映射为语义英文，模板/CSS/common.less 同步重命名。
 */
describe('autoFixNonAsciiClassNames 类名净化', () => {
  it('⭐ f8116aa6 实锤形态：模板 class + :class 绑定 + scoped style 全同步重命名', () => {
    const input = `<template>
  <div class="c-f8116a-小标题">
    <div class="c-f8116a-点背景">
      <div class="c-f8116a-分割线"><img :src="icon2" class="c-f8116a-分割线-img" alt="" /></div>
    </div>
    <button
      class="c-f8116a-激活"
      :class="{ 'c-f8116a-激活--active': activeTab === 'lastMonth' }"
    ><span>上月</span></button>
  </div>
</template>
<style scoped>
.c-f8116a-小标题 { font-size: 16px; }
.c-f8116a-点背景 { background: #fff; }
.c-f8116a-分割线-img { width: 100%; }
.c-f8116a-激活 { color: #0af; }
.c-f8116a-激活--active { color: #f80; }
</style>`;
    const files = { 'package/components/HeaderSection.vue': input };
    const report = autoFixNonAsciiClassNames(files, {});
    expect(report.remaining).toEqual([]);
    const out = report.files['package/components/HeaderSection.vue'];
    // class 语境不得残留中文（静态 class 与 :class 绑定内引号串）
    expect(out).not.toMatch(/class="[^"]*[\u4e00-\u9fa5]/);
    expect(out).not.toMatch(/'[^']*[\u4e00-\u9fa5][^']*'\s*:/);
    // 词表映射：小标题→subtitle / 点背景→dot-bg / 分割线→divider / 激活→active
    expect(out).toContain('c-f8116a-subtitle');
    expect(out).toContain('c-f8116a-dot-bg');
    expect(out).toContain('c-f8116a-divider-img');
    expect(out).toContain("'c-f8116a-active--active'");
    expect(out).toContain('.c-f8116a-active--active');
    // 文本内容裸中文不误伤
    expect(out).toContain('<span>上月</span>');
  });

  it('common.less 与 .vue 同一 token 同步改名（跨文件一致）', () => {
    const vue = `<template><div class="c-bf3612-默认"><span class="c-bf3612-默认-text">x</span></div></template>
<style scoped>.c-bf3612-默认 { display: flex; }</style>`;
    const less = `.c-bf3612-默认 { padding: 4px; }\n.c-bf3612-默认-text { color: red; }`;
    const files = {
      'package/components/A.vue': vue,
      'resources/styles/common.less': less,
    };
    const report = autoFixNonAsciiClassNames(files, {});
    expect(report.files['resources/styles/common.less']).toContain('.c-bf3612-default');
    expect(report.files['resources/styles/common.less']).toContain('.c-bf3612-default-text');
    expect(report.files['package/components/A.vue']).toContain('c-bf3612-default-text');
    expect(report.files['package/components/A.vue']).not.toMatch(/[\u4e00-\u9fa5]/);
  });

  it('长 token 优先：默认-text 先替换，默认 子串替换不产生残段/双重应用', () => {
    const vue = `<template><div class="c-x-默认"><span class="c-x-默认-text">t</span></div></template>`;
    const files = { 'package/components/A.vue': vue };
    const report = autoFixNonAsciiClassNames(files, {});
    const out = report.files['package/components/A.vue'];
    expect(out).toContain('class="c-x-default"');
    expect(out).toContain('class="c-x-default-text"');
    expect(out).not.toContain('c-x-default-default');
  });

  it('未命中段 zh<N> 兜底：同一中文原文跨文件编号一致', () => {
    const files = {
      'package/components/A.vue':
        '<template><div class="value-施工养护">x</div></template>',
      'package/components/B.vue':
        '<template><div class="value-施工养护">y</div></template>',
    };
    const report = autoFixNonAsciiClassNames(files, {});
    expect(report.files['package/components/A.vue']).toContain('value-zh1');
    expect(report.files['package/components/B.vue']).toContain('value-zh1');
  });

  it('文本内容裸中文绝不误伤（收集只认 class 语境）', () => {
    const vue = `<template>
  <div class="plain-box">
    <span>场区污水</span>
    <p>昨日车流量 1200 辆</p>
  </div>
</template>`;
    const files = { 'package/components/A.vue': vue };
    const report = autoFixNonAsciiClassNames(files, {});
    expect(report.renamed).toEqual([]);
    expect(report.files).toEqual({});
    // 佐证：文本中文原样保留
    expect(files['package/components/A.vue']).toContain('场区污水');
  });

  it('幂等：净化后二次运行零改动', () => {
    const vue = `<template><div class="c-x-默认-text"><span class="c-traffic-文字">a</span></div></template>
<style scoped>.c-x-默认-text { color: red; }</style>`;
    const first = autoFixNonAsciiClassNames(
      { 'package/components/A.vue': vue },
      {},
    );
    const once = first.files['package/components/A.vue'];
    const second = autoFixNonAsciiClassNames(
      { 'package/components/A.vue': once },
      {},
    );
    expect(second.renamed).toEqual([]);
    expect(second.files).toEqual({});
  });

  it('无中文类名 → 零改动零重命名', () => {
    const vue = `<template><div class="c-monitor-root"><span>你好</span></div></template>`;
    const files = { 'package/components/A.vue': vue };
    const report = autoFixNonAsciiClassNames(files, {});
    expect(report.renamed).toEqual([]);
    expect(report.files).toEqual({});
  });
});
