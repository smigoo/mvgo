/**
 * 🛡️ 规则②/⑥ `;!important` 坏串治本回归（2026-11-17 · mc-max-1794845320233-c584dc52 白屏实锤）
 *
 * 病灶：resource-mounter 规则② 的 flex 改写正则尾部 `\s*;?` 把 flex 值后的**空格**吞进
 * 匹配段，替换串 `flex: X Y Z;` 以 `;` 硬收尾 ⇒ 原文残留的 `!important` 被顶成分号后缀
 * ⇒ `flex: 0.143 1 0;!important` ⇒ LESS `Unrecognised input` ⇒ 组件加载失败白屏。
 * 触发组合：11-16 layoutStyle（code-generator :1611）开始给段高规则落 `!important`，
 * 与老规则②相遇才爆——`!important` 是「layoutStyle 权威落定」的语义标记，规则②/⑥
 * 本就不得覆盖带它的声明。
 *
 * 治本：① 带 `!important` 的 flex 声明整体不碰（回调内终点检查，前瞻会被回溯绕过）；
 * ② 其余改写保留被消耗的分号（防 `;;` 或丢分号）。
 */
jest.mock('../../logger/index.js', () => ({
  createLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
}))

import { fixSectionHeightsForResource } from './resource-mounter.js';

const CTX = {
  sectionHeights: { 'c-x-sech-5': 0.143, 'c-x-sech-1': 0.5 },
  path: 'package/index.vue',
  files: {},
};

describe('规则② `;!important` 坏串治本（c584dc52 白屏回归）', () => {
  it('阳性（病灶原文）：layoutStyle 带重要标记的 flex 声明 ⇒ 原样保留，不产出 ;!important', () => {
    const input = `<template>
  <div class="c-x-root">
    <ContentSection5 class="c-x-sech-5" />
  </div>
</template>
<script setup>
const x = 1
</script>
<style lang="less" scoped>
.c-x-sech-5 { flex: 0.143 1 0 !important; min-height: 0; margin-top: 20px !important;
  display: flex;
  flex-direction: column;}
</style>`;
    const out = fixSectionHeightsForResource(input, CTX);
    // !important 声明整体不碰（layoutStyle 权威语义）
    expect(out).toContain('flex: 0.143 1 0 !important');
    // 🔴 旧 bug 产出（绝对禁止回归）
    expect(out).not.toContain(';!important');
    // LESS 编译可行性：分号后紧跟 !important 即非法
    expect(out).not.toMatch(/;!/);
  });

  it('阴性（规则②本职）：ratio 量级错误系数仍被权威改写，分号不丢不加', () => {
    const input = `<template>
  <div class="c-x-root">
    <ContentSection5 class="c-x-sech-5" />
  </div>
</template>
<script setup>
const x = 1
</script>
<style lang="less" scoped>
.c-x-sech-5 { display: flex; flex-direction: row; flex: 3.73 1 0; min-height: 0; }
</style>`;
    const out = fixSectionHeightsForResource(input, CTX);
    expect(out).toContain('flex: 0.143 1 0;');
    expect(out).not.toContain(';;');
    expect(out).not.toContain(';!');
  });

  it('形态覆盖：双值简写改写、超 ratioMax 阈值不碰', () => {
    const input = `<template>
  <div class="c-x-root">
    <ContentSection5 class="c-x-sech-5" />
    <ContentSection5 class="c-x-sech-1" />
  </div>
</template>
<script setup>
const x = 1
</script>
<style lang="less" scoped>
.c-x-sech-5 { display: flex; flex: 2 1; }
.c-x-sech-1 { display: flex; flex: 25 1 0; }
</style>`;
    const out = fixSectionHeightsForResource(input, CTX);
    // 双值简写补齐三值并改写权威系数
    expect(out).toContain('flex: 0.143 1 0;');
    // 超 ratioMax(19) 不碰
    expect(out).toContain('flex: 25 1 0;');
    expect(out).not.toContain(';;');
  });
});
