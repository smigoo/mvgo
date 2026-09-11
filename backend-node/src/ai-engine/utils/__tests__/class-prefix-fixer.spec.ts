/**
 * 层③（2026-09-11）：fixMissingClassPrefixes — CODE-020 确定性自愈单测
 */
import { fixMissingClassPrefixes } from '../class-prefix-fixer.js';

describe('层③ fixMissingClassPrefixes（模板类名统一补前缀）', () => {
  const less = {
    path: 'package/resources/styles/common.less',
    content: `.c-device-monitor-0quu3hqa-c-device-monitor-tab-item { color: red; }\n.c-device-monitor-real { color: blue; }`,
  };

  it('模板漏前缀 → 改写为 CSS 唯一后缀命中形态', () => {
    const vue = {
      path: 'package/index.vue',
      content: `<template><div class="c-device-monitor-tab-item c-device-monitor-real">x</div></template>`,
    };
    const r = fixMissingClassPrefixes([less, vue]);
    expect(r.fixes).toEqual([
      {
        path: 'package/index.vue',
        from: 'c-device-monitor-tab-item',
        to: 'c-device-monitor-0quu3hqa-c-device-monitor-tab-item',
      },
    ]);
    expect(r.files[1].content).toContain('c-device-monitor-0quu3hqa-c-device-monitor-tab-item');
    // 精确命中的类不被改写
    expect(r.files[1].content).toContain('c-device-monitor-real');
  });

  it('幂等：改写后再次调用零副作用', () => {
    const vue = {
      path: 'package/index.vue',
      content: `<template><div class="c-device-monitor-tab-item"></div></template>`,
    };
    const once = fixMissingClassPrefixes([less, vue]);
    const twice = fixMissingClassPrefixes(once.files);
    expect(twice.fixes).toEqual([]);
  });

  it('css 连后缀都没有（占位类）→ 不改写（与 CODE-020 口径一致）', () => {
    const vue = {
      path: 'package/index.vue',
      content: `<template><div class="c-device-monitor-frame-2136638825"></div></template>`,
    };
    const r = fixMissingClassPrefixes([less, vue]);
    expect(r.fixes).toEqual([]);
    expect(r.files[1].content).toContain('c-device-monitor-frame-2136638825');
  });

  it('.vue 自有 <style> 定义的类算已定义 → 不改写', () => {
    const vue = {
      path: 'package/components/X.vue',
      content: `<template><div class="c-x-foo"></div></template>\n<style scoped>.c-x-foo { color: red; }</style>`,
    };
    const r = fixMissingClassPrefixes([less, vue]);
    expect(r.fixes).toEqual([]);
  });

  it('豁免 c-mc-max- / c-mc- 前缀', () => {
    const vue = {
      path: 'package/index.vue',
      content: `<template><div class="c-mc-max-root c-mc-badge"></div></template>`,
    };
    const r = fixMissingClassPrefixes([less, vue]);
    expect(r.fixes).toEqual([]);
  });

  it(':class 数组与对象键同步改写', () => {
    const vue = {
      path: 'package/index.vue',
      content: `<template><div :class="['c-device-monitor-tab-item', { 'c-device-monitor-tab-item': active }]"></div></template>`,
    };
    const r = fixMissingClassPrefixes([less, vue]);
    expect(r.fixes.length).toBe(1);
    expect(r.files[1].content).not.toContain("'c-device-monitor-tab-item'");
    expect(r.files[1].content).toContain("'c-device-monitor-0quu3hqa-c-device-monitor-tab-item'");
  });

  it('不改写 .less 文件本身', () => {
    const r = fixMissingClassPrefixes([less]);
    expect(r.fixes).toEqual([]);
    expect(r.files[0].content).toBe(less.content);
  });

  it('多候选取最短（确定性）', () => {
    const lessMulti = {
      path: 'package/resources/styles/common.less',
      content: `.c-a-1-c-a-foo { } .c-a-1-x-c-a-foo { }`,
    };
    const vue = {
      path: 'package/index.vue',
      content: `<template><div class="c-a-foo"></div></template>`,
    };
    const r = fixMissingClassPrefixes([lessMulti, vue]);
    expect(r.fixes[0].to).toBe('c-a-1-c-a-foo');
  });
});
