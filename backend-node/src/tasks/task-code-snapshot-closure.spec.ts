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
import { validateVueSfcExpressions } from '../ai-engine/utils/sfc-syntax-validation.js';

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

  const readPreview = (revision: string) =>
    service.readPreviewFile(SESSION, revision, 'package/index.vue').toString('utf-8');

  const markPartial = (revision: string) =>
    service.markPartial(SESSION, revision, 'fixture partial', { sfc: 'passed' });

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

  it('同级双顶层 template → 不可渲染', () => {
    const malformed = [
      '<template><div>first</div></template>',
      '<template><div>second</div></template>',
      '<script setup>const value = 1</script>',
      '<style scoped>.root { color: red; }</style>',
    ].join('\n');
    const rev = write({
      'package/index.vue': malformed,
      'package/components/A.vue': '<template><i>A</i></template>',
      'package/components/B.vue': '<template><i>B</i></template>',
    });
    expect(renderable(rev)).toBe(false);
  });

  it('合法嵌套 template slot + script/style → 仍可渲染', () => {
    const validWithSlot = [
      '<template><section><template><span>fallback</span></template></section></template>',
      '<script setup>const value = 1</script>',
      '<style scoped>.root { color: red; }</style>',
    ].join('\n');
    const rev = write({
      'package/index.vue': validWithSlot,
      'package/components/A.vue': '<template><i>A</i></template>',
      'package/components/B.vue': '<template><i>B</i></template>',
    });
    expect(renderable(rev)).toBe(true);
  });

  it('真机 Lite 形态：<style lang="less"> + 相对 @import + @fontSize 主题变量 → 可渲染（修复 422 假阳性）', () => {
    // mc-lite-1794398124528-997fd90f 实锤：revision 已落盘，但 isRenderableRevision
    // 用相对路径调 validateVueSfc → 相对 @import 被剥 → @fontSize undefined 假阳性
    // → 前端「查看代码」422。修复后传绝对路径，完整编译真实 import 链。
    const liteSfc = [
      '<template><div class="c-demo"><span>流量监测</span></div></template>',
      '<script setup>const n = 34620</script>',
      '<style lang="less">',
      "@import '../resources/styles/index.less';",
      '.c-demo { font-size: calc(@fontSize * 1.1429); }',
      '</style>',
    ].join('\n');
    const rev = write({
      'package/index.vue': liteSfc,
      'resources/styles/index.less': '@fontSize: 14px;\n',
    });
    expect(renderable(rev)).toBe(true);
    expect(readPreview(rev)).toBe(liteSfc);
  });

  it('阴性对照：@import 指向的 index.less 缺失 → 仍不可渲染（绝对路径模式不放行坏产物）', () => {
    const liteSfc = [
      '<template><div class="c-demo"><span>流量监测</span></div></template>',
      '<script setup>const n = 1</script>',
      '<style lang="less">',
      "@import '../resources/styles/index.less';",
      '.c-demo { font-size: calc(@fontSize * 1.1429); }',
      '</style>',
    ].join('\n');
    const rev = write({ 'package/index.vue': liteSfc });
    expect(renderable(rev)).toBe(false);
  });

  it('无有效 last-good 时，预览拒绝畸形快照；查看代码仍读该 revision 原文（读写判据解耦）', () => {
    const malformed = [
      '<template><div>first</div></template>',
      '<template><div>second</div></template>',
      '<script setup>const value = 1</script>',
      '<style scoped>.root { color: red; }</style>',
    ].join('\n');
    const revision = write({
      'package/index.vue': malformed,
      'package/components/A.vue': '<template><i>A</i></template>',
      'package/components/B.vue': '<template><i>B</i></template>',
    });

    // 预览侧判据一字未放宽：畸形产物仍不得进 iframe。
    expect(() => readPreview(revision)).toThrow('结构无效，且没有可回退的有效版本');
    // 🔴 2026-11-11 治本：查看代码是纯文本读取，不再套用预览渲染级判据。
    // 必须拿到「这个 revision 的原始畸形文本」用于排查，而不是 422、也不是回退到别的版本。
    expect(service.readFile(SESSION, revision, 'package/index.vue').toString('utf-8')).toBe(
      malformed,
    );
  });

  it('合法 partial 在无 last-good 时仍可预览和编辑', () => {
    const revision = write({
      'package/index.vue': ENTRY,
      'package/components/A.vue': '<template><i>A</i></template>',
      'package/components/B.vue': '<template><i>B</i></template>',
    });
    markPartial(revision);

    expect(readPreview(revision)).toBe(ENTRY);
    expect(service.getPartialManifest(SESSION)?.revision).toBe(revision);
  });

  it('存在有效 last-good 时，结构损坏快照预览回退到 last-good', () => {
    const validFiles = {
      'package/index.vue': ENTRY,
      'package/components/A.vue': '<template><i>A</i></template>',
      'package/components/B.vue': '<template><i>B</i></template>',
    };
    const lastGood = write(validFiles);
    service.publishLastGood(SESSION, lastGood, { sfc: 'passed' });
    const malformed = [
      '<template><div>first</div></template>',
      '<template><div>second</div></template>',
      '<script setup>const value = 1</script>',
      '<style scoped>.root { color: red; }</style>',
    ].join('\n');
    const candidate = write({
      'package/index.vue': malformed,
      'package/components/A.vue': '<template><i>A</i></template>',
      'package/components/B.vue': '<template><i>B</i></template>',
    });

    expect(readPreview(candidate)).toBe(ENTRY);
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

  /**
   * 2026-11-11 真机根治：mc-max-1794404217588-830ae7bd 等 31 个 max 会话「查看代码」422。
   * 形态 = index.vue 本身合法（<style> 只有一行 @import），但 resources/styles/index.less
   * 含生成期语法损坏（裸属性 / 回答正文混入 CSS）⇒ 绝对路径完整编译 import 链失败。
   * 每个用例用独立 sessionId，避免受前面 publishLastGood 留下的指针影响。
   */
  const BAD_LESS_INDEX = [
    '<template><div class="c-demo"><span>流量监测</span></div></template>',
    '<script setup>const n = 34620</script>',
    '<style lang="less">',
    "@import '../resources/styles/index.less';",
    '</style>',
  ].join('\n');
  const BAD_LESS = '@spacing-gap: 8px;\ndisplay: flex;}\n';
  const GOOD_ENTRY = '<template><div class="ok">GOOD</div></template>';

  const writeFor = (sid: string, files: Record<string, string>) =>
    service.createCandidate({
      sessionId: sid,
      componentId: 'c-test-read-decouple',
      groupId: 'g-1',
      target: 'microcode' as never,
      files,
    }).revision;

  // 🔴 判据必须按用例自己的 sessionId 求值；复用 renderable(rev) 会因绑死 SESSION 恒 false ⇒ 假绿。
  const renderableFor = (sid: string, rev: string) =>
    (
      service as unknown as {
        isRenderableRevision: (s: string, r: string) => boolean;
      }
    ).isRenderableRevision(sid, rev);

  it('真机 max 形态：LESS import 链损坏 → 预览仍拒绝，查看代码读到 index.vue 与 .less 原文', () => {
    const sid = 'mc-test-read-bad-less';
    const rev = writeFor(sid, {
      'package/index.vue': BAD_LESS_INDEX,
      'resources/styles/index.less': BAD_LESS,
    });

    expect(renderableFor(sid, rev)).toBe(false);
    expect(() => service.readPreviewFile(sid, rev, 'package/index.vue')).toThrow(
      '结构无效，且没有可回退的有效版本',
    );
    expect(service.readFile(sid, rev, 'package/index.vue').toString('utf-8')).toBe(BAD_LESS_INDEX);
    expect(service.readFile(sid, rev, 'resources/styles/index.less').toString('utf-8')).toBe(
      BAD_LESS,
    );
  });

  it('阴性对照：路径越界 / 文件缺失 / 清单不存在仍 fail-closed（解耦≠放开安全校验）', () => {
    const sid = 'mc-test-read-negative';
    const rev = writeFor(sid, { 'package/index.vue': BAD_LESS_INDEX });
    expect(() => service.readFile(sid, rev, '../outside.vue')).toThrow();
    expect(() => service.readFile(sid, rev, 'package/missing.vue')).toThrow();
    // 必须给「格式合法但磁盘不存在」的 revision：格式非法会先被 SAFE_REVISION 拦下，
    // 测不到 manifest 缺失这层校验。
    expect(() =>
      service.readFile(sid, 'r-00000000-0000-4000-8000-000000000000', 'package/index.vue'),
    ).toThrow('代码快照不存在');
  });

  it('有 last-good 时：预览照旧回退，查看代码不回退（读的是所选 revision）', () => {
    const sid = 'mc-test-read-no-fallback';
    const good = writeFor(sid, { 'package/index.vue': GOOD_ENTRY });
    service.publishLastGood(sid, good, { sfc: 'passed' });
    const bad = writeFor(sid, {
      'package/index.vue': BAD_LESS_INDEX,
      'resources/styles/index.less': BAD_LESS,
    });

    expect(service.readPreviewFile(sid, bad, 'package/index.vue').toString('utf-8')).toBe(
      GOOD_ENTRY,
    );
    expect(service.readFile(sid, bad, 'package/index.vue').toString('utf-8')).toBe(
      BAD_LESS_INDEX,
    );
  });

  it('回归对照：合法 revision 的 readFile / readPreviewFile 行为不变', () => {
    const sid = 'mc-test-read-healthy';
    const rev = writeFor(sid, { 'package/index.vue': GOOD_ENTRY });
    expect(renderableFor(sid, rev)).toBe(true);
    expect(service.readPreviewFile(sid, rev, 'package/index.vue').toString('utf-8')).toBe(
      GOOD_ENTRY,
    );
    expect(service.readFile(sid, rev, 'package/index.vue').toString('utf-8')).toBe(GOOD_ENTRY);
  });
});

/**
 * 🛡️ 2026-11-16（mc-max-1794761757056-0d15ab1b 实锤）：任务级终态 onFilesReady 绕过
 * chunk 推送守卫，把「两份完整 SFC 叠加」的坏 index.vue 推成 candidate ⇒ 422 + 空白。
 * createCandidate 是所有候选快照的单一入口，必须在冻结前确定性归一。
 */
describe('TaskCodeSnapshotService#createCandidate（SFC 叠加结构自愈）', () => {
  const ROOT = join(tmpdir(), 'mvgo-snapshot-closure-test');
  let svc: TaskCodeSnapshotService;

  const INNER = [
    '<template>',
    '  <base-panel panelKey="default-panel">',
    '    <div class="c-demo-root"><ContentSection /><ChartTrend /></div>',
    '  </base-panel>',
    '</template>',
  ].join('\n');
  const SCRIPT = ['<script setup>', "const title = 'demo'", '</script>'].join('\n');
  // 不带 less @import：isRenderableRevision 用绝对路径跑 validateVueSfc 会编译
  // 真实 @import 依赖链，临时 revision 里没有 resources/styles ⇒ 假阳判 false。
  // 本用例只验「叠加归一」，不验 less 链（既有用例已覆盖）。
  const STYLE = ['<style scoped>', '.c-demo-root { color: #fff; }', '</style>'].join('\n');
  const STACKED = `<template>\n${INNER}\n${SCRIPT}\n${STYLE}\n</template>\n${SCRIPT}\n${STYLE}`;
  const GOOD = `${INNER}\n${SCRIPT}\n${STYLE}`;

  const create = (sid: string, index: string) =>
    svc.createCandidate({
      sessionId: sid,
      componentId: 'c-test-stacked',
      groupId: 'g-1',
      target: 'microcode' as never,
      files: { 'package/index.vue': index },
    }).revision;

  beforeAll(() => {
    svc = new TaskCodeSnapshotService();
  });

  afterAll(() => {
    rmSync(join(ROOT, 'temp-components', '.task-code-snapshots'), {
      recursive: true,
      force: true,
    });
  });

  it('坏入口推成 candidate 时先归一 → revision 内文件合法且可渲染', () => {
    const sid = 'mc-test-stacked-heal';
    const rev = create(sid, STACKED);
    const content = svc.readPreviewFile(sid, rev, 'package/index.vue').toString('utf-8');

    expect(content).not.toBe(STACKED);
    expect(validateVueSfcExpressions(content, 'package/index.vue').valid).toBe(true);
    expect((content.match(/<script setup>/g) || []).length).toBe(1);
    expect(content).toContain('<ContentSection');
    expect(content).toContain('<ChartTrend');
    expect(
      (
        svc as unknown as {
          isRenderableRevision: (s: string, r: string) => boolean;
        }
      ).isRenderableRevision(sid, rev),
    ).toBe(true);
  });

  it('阴性对照：合法入口逐字冻结，不被改写', () => {
    const sid = 'mc-test-stacked-healthy';
    const rev = create(sid, GOOD);
    expect(svc.readPreviewFile(sid, rev, 'package/index.vue').toString('utf-8')).toBe(GOOD);
  });
});

/**
 * 🛡️ 2026-11-16：last-good 晋级出口 SFC 结构门禁（mc-max-1794819915607-80954ead 实锤）。
 *
 * 病灶：坏版 index.vue（根 <div 缺 '<' → 游离 </div> ⇒ Invalid end tag）写盘门禁已拦，
 * 但内存 allFiles 经任务级 onFilesReady → createCandidate 落 revision，再被
 * publishLastGood() 无校验晋级 last-good ⇒ 坏版成为默认预览源、回退无可用版本 ⇒ 422。
 * 治本：publishLastGood() 晋级前用唯一判据复核 SFC 结构，非法不写 last-good 指针。
 */
describe('TaskCodeSnapshotService#publishLastGood SFC 结构门禁', () => {
  const TEST_ROOT = join(tmpdir(), 'mvgo-snapshot-closure-test');
  const svc = new TaskCodeSnapshotService();

  const write = (sid: string, files: Record<string, string>) =>
    svc.createCandidate({
      sessionId: sid,
      componentId: 'c-promotion-gate',
      groupId: 'g-1',
      target: 'microcode' as never,
      files,
    }).revision;

  const gate = (sid: string, rev: string) =>
    (svc as unknown as { isRevisionSfcRenderable: (s: string, r: string) => boolean })
      .isRevisionSfcRenderable(sid, rev);

  // 真实坏形态（mc-max-1794819915607-80954ead）：第三个 section 的 <div 丢左尖括号，
  // 退化成纯文本 `div ...>`；原本配对它的 </div> 于是多出 ⇒ 编译器报 Invalid end tag。
  const BAD_STRAY_CLOSER = [
    '<template>',
    '  <base-panel panelKey="default-panel">',
    '    <div class="root">',
    '      <Child />',
    '      <div class="a"><i>1</i></div>',
    '      <div class="b"><i>2</i></div>',
    '      div :style="{}" class="c" data-section-id="1:400" style="flex:0.237;">',
    '        <Child />',
    '      </div>',
    '    </div>',
    '  </base-panel>',
    '</template>',
    '<script setup>import Child from \'./components/Child.vue\'</script>',
  ].join('\n');
  const GOOD_ENTRY = [
    '<template><div class="root"><Child /></div></template>',
    "<script setup>import Child from './components/Child.vue'</script>",
  ].join('\n');
  const CHILD = '<template><i>child</i></template>';

  beforeAll(() => {
    rmSync(join(TEST_ROOT, 'temp-components'), { recursive: true, force: true });
  });
  afterAll(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('真实游离 </div> 坏版：门禁判不可渲染，publishLastGood 不写 last-good 指针', () => {
    const sid = 'mc-promo-bad-stray';
    const badRev = write(sid, {
      'package/index.vue': BAD_STRAY_CLOSER,
      'package/components/Child.vue': CHILD,
    });

    expect(gate(sid, badRev)).toBe(false);
    const result = svc.publishLastGood(sid, badRev, { sfc: 'passed' });
    // 坏版降级为 candidate，不得成为 last-good。
    expect(result.status).toBe('candidate');
    expect(result.validation?.sfc).toBe('blocked');
    expect(svc.getLastGoodManifest(sid)?.revision).not.toBe(badRev);
  });

  it('已有合法 last-good 时，坏版晋级被拒，last-good 保持旧值（预览自动回退）', () => {
    const sid = 'mc-promo-keep-good';
    const goodRev = write(sid, {
      'package/index.vue': GOOD_ENTRY,
      'package/components/Child.vue': CHILD,
    });
    expect(gate(sid, goodRev)).toBe(true);
    svc.publishLastGood(sid, goodRev, { sfc: 'passed' });

    const badRev = write(sid, {
      'package/index.vue': BAD_STRAY_CLOSER,
      'package/components/Child.vue': CHILD,
    });
    const result = svc.publishLastGood(sid, badRev, { sfc: 'passed' });

    expect(result.status).toBe('candidate');
    expect(svc.getLastGoodManifest(sid)?.revision).toBe(goodRev);
    expect(svc.readPreviewFile(sid, badRev, 'package/index.vue').toString('utf-8')).toBe(GOOD_ENTRY);
  });

  it('阴性对照：合法 revision 经 publishLastGood 正常晋级，行为零变化', () => {
    const sid = 'mc-promo-healthy';
    const goodRev = write(sid, {
      'package/index.vue': GOOD_ENTRY,
      'package/components/Child.vue': CHILD,
    });
    const result = svc.publishLastGood(sid, goodRev, { sfc: 'passed' });
    expect(result.status).toBe('last-good');
    expect(svc.getLastGoodManifest(sid)?.revision).toBe(goodRev);
  });
});
