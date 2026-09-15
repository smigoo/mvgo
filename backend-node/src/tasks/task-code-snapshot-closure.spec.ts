/**
 * 预览取源「可渲染」判据的 import 闭包单测（2026-09-15 · mc-max-1789446564243-f64ecbed 实锤）。
 *
 * 根因：子组件**并行**生成，index.vue 先于某个子组件 chunk 完成即被推成 candidate；
 * 原判据只看 `<template>` → 该中间态被判「可渲染」→ 预览拉悬空文件 404
 * → 前端报「组件文件缺失或路径不正确（groupId / componentId 不匹配）。原始错误：找不到文件: …」。
 *
 * 纯函数（extractRelativeVueImports / resolveRelativeModulePath）+ 服务级行为两块都覆盖：
 * 前者可在无文件系统依赖下断言，后者用真实 revision 目录 + manifest 端到端验证。
 */
import { rmSync } from 'fs';
import { join } from 'path';

// backend-root.js 走 `import.meta.url`，jest CJS 运行时无法加载（既有 17 个 suite 同因）。
// 单一事实源：与 tasks.service.spec.ts 同款 mock，把落盘根指到固定临时目录。
jest.mock('../config/backend-root', () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const root = path.join(os.tmpdir(), 'mvgo-snapshot-closure-test');
  fs.mkdirSync(root, { recursive: true });
  return {
    backendRoot: path.join(root, 'backend-node'),
    projectRoot: root,
    workspaceRoot: path.join(root, 'workspace'),
    customComponentsDir: path.join(root, 'workspace', 'custom-components'),
    vue3ComponentsDir: path.join(root, 'workspace', 'vue3-components'),
    tempComponentsDir: path.join(root, 'temp-components'),
  };
});

import {
  TaskCodeSnapshotService,
  extractRelativeVueImports,
  resolveRelativeModulePath,
} from './task-code-snapshot.service';

import { tmpdir } from 'os';

describe('提取相对 .vue import', () => {
  it('覆盖默认/具名/命名空间/副作用导入与 export ... from', () => {
    const src = [
      "import ContentSubT from './components/ContentSubT.vue'",
      "import { A, B } from './components/Named.vue'",
      "import * as NS from './components/NS.vue'",
      "import './side-effect.vue'",
      "export { default as Re } from './components/Re.vue'",
      "import { ref } from 'vue'",
      "import * as echarts from 'echarts'",
      "import bg from '../../resources/images/bg-7890.png'",
    ].join('\n');
    expect(extractRelativeVueImports(src)).toEqual([
      './components/ContentSubT.vue',
      './components/Named.vue',
      './components/NS.vue',
      './side-effect.vue',
      './components/Re.vue',
    ]);
  });

  it('裸模块与资源文件不进入闭包；空输入返回空数组', () => {
    expect(extractRelativeVueImports('')).toEqual([]);
    expect(extractRelativeVueImports("import x from 'vue'")).toEqual([]);
    expect(extractRelativeVueImports("import p from './a.png'")).toEqual([]);
  });
});

describe('相对路径解析', () => {
  it('同级 / 上级 / 多级回退', () => {
    expect(resolveRelativeModulePath('package/index.vue', './components/A.vue')).toBe(
      'package/components/A.vue',
    );
    expect(resolveRelativeModulePath('package/components/A.vue', '../shared/B.vue')).toBe(
      'package/shared/B.vue',
    );
  });

  it('逃出 revision 根 → null（判为不完整）', () => {
    expect(resolveRelativeModulePath('package/index.vue', '../../outside.vue')).toBeNull();
    expect(resolveRelativeModulePath('index.vue', '../x.vue')).toBeNull();
  });
});

describe('TaskCodeSnapshotService#isRenderableRevision（import 闭包）', () => {
  const TEST_ROOT = join(tmpdir(), 'mvgo-snapshot-closure-test');
  const SESSION = 'mc-test-closure';
  const ENTRY = [
    '<template><div><A /><B /></div></template>',
    '<script setup>',
    "import A from './components/A.vue'",
    "import B from './components/B.vue'",
    '</script>',
  ].join('\n');

  let service: TaskCodeSnapshotService;

  const write = (files: Record<string, string>) =>
    service.createCandidate({
      sessionId: SESSION,
      componentId: 'c-test-closure',
      groupId: 'g-1',
      target: 'microcode' as never,
      files,
    }).revision;

  const renderable = (revision: string) =>
    (
      service as unknown as {
        isRenderableRevision: (s: string, r: string) => boolean;
      }
    ).isRenderableRevision(SESSION, revision);

  beforeAll(() => {
    rmSync(join(TEST_ROOT, 'temp-components'), { recursive: true, force: true });
    service = new TaskCodeSnapshotService();
  });

  afterAll(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('index.vue + 全部子组件齐全 → 可渲染', () => {
    const rev = write({
      'package/index.vue': ENTRY,
      'package/components/A.vue': '<template><i>A</i></template>',
      'package/components/B.vue': '<template><i>B</i></template>',
    });
    expect(renderable(rev)).toBe(true);
  });

  it('真机形态：index.vue 有 <template> 但子组件缺失 → 不可渲染（触发回退 last-good）', () => {
    const rev = write({
      'package/index.vue': ENTRY,
      'package/components/A.vue': '<template><i>A</i></template>',
      // B.vue 缺失：生成中间态
    });
    expect(renderable(rev)).toBe(false);
  });

  it('传递闭包：子组件再 import 的孙组件缺失同样判不可渲染', () => {
    const rev = write({
      'package/index.vue': ENTRY,
      'package/components/A.vue':
        "<template><x /></template>\n<script setup>import X from './sub/X.vue'</script>",
      'package/components/B.vue': '<template><i>B</i></template>',
      // package/components/sub/X.vue 缺失
    });
    expect(renderable(rev)).toBe(false);
  });

  it('缺 <template>（旧判据场景）仍判不可渲染', () => {
    const rev = write({
      'package/index.vue': '<script setup>const a = 1</script>',
      'package/components/A.vue': '<template><i>A</i></template>',
      'package/components/B.vue': '<template><i>B</i></template>',
    });
    expect(renderable(rev)).toBe(false);
  });

  it('资源等非 .vue 相对引用不参与闭包（png 未落盘不影响判定）', () => {
    const rev = write({
      'package/index.vue': ENTRY,
      'package/components/A.vue':
        '<template><img :src="bg" /></template>\n<script setup>import bg from \'../../resources/images/bg.png\'</script>',
      'package/components/B.vue': '<template><i>B</i></template>',
    });
    expect(renderable(rev)).toBe(true);
  });
});
