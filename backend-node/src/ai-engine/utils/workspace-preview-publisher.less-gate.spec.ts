/**
 * 🛡️ 2026-11-11 · 发布前 LESS 终验（单一收口点）阳性/阴性对照
 *
 * 事故背景：mc-lite-1794382414032-bff01bf7 —— Lite 产物 `index.vue` 的 <style lang="less">
 * 里残留一行悬空 `color: `（分块输出被截断的残片），结构门只查标签闭合 ⇒ 放行 ⇒ 同步 workspace
 * ⇒ 前端浏览器内 less 编译报 `Unrecognised input` ⇒ 预览整页红卡，任务仍显示「完整 100%」。
 *
 * 本 spec 钉住三条契约：
 *   ① 可确定性修复的形态（缺右大括号）必须在发布前被 heal 并写回磁盘；
 *   ② 不可确定性修复的形态（悬空声明）必须显式落 `.less-gate.json` 标记，不得假绿；
 *   ③ 健康产物不得被多余改动、不得残留标记。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

jest.mock('../../config/backend-root.js', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mvgo-lessgate-root-'));
  // 供用例读取实际根目录（jest.mock 工厂与用例之间唯一可传递的通道）
  (global as any).__MVGO_LESS_GATE_ROOT__ = root;
  return {
    projectRoot: root,
    workspaceRoot: path.join(root, 'workspace'),
    logsDir: path.join(root, 'logs'),
    customComponentsDir: path.join(root, 'workspace', 'custom-components'),
    vue3ComponentsDir: path.join(root, 'workspace', 'vue3-components'),
    frontendCustomComponentsDir: path.join(root, 'frontend', 'custom-components'),
    frontendVue3ComponentsDir: path.join(root, 'frontend', 'vue3-components'),
    resolveFrontendWorkspacePath: () => path.join(root, 'frontend'),
    tempComponentsDir: path.join(root, 'temp-components'),
  };
}, { virtual: true });

jest.mock('../../config/runtime-env.js', () => ({
  getFrontendCandidates: () => [],
}), { virtual: true });

import { __testing } from './workspace-preview-publisher.js';

function makeOutput(files: Record<string, string>): string {
  const outputPath = mkdtempSync(join(tmpdir(), 'mvgo-lessgate-out-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(outputPath, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }
  return outputPath;
}

function bracesBalanced(text: string): boolean {
  return (text.match(/\{/g) || []).length === (text.match(/\}/g) || []).length;
}

const INDEX_LESS = `@import './theme-vars.less';

.common();

@import (multiple) './common.less';
`;

describe('selfHealLessBeforePublish（发布前 LESS 终验）', () => {
  it('阳性对照：缺右大括号的 common.less 在发布前被 heal 并写回磁盘，编译转 PASS', async () => {
    const broken = `.c-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;

.c-panel-body {
  flex: 1 1 0;
  overflow: auto;
}
`;
    const outputPath = makeOutput({
      'package/index.vue': '<template><div class="c-panel"><div class="c-panel-body" /></div></template>',
      'resources/styles/index.less': INDEX_LESS,
      'resources/styles/theme-vars.less': '@import "theme-vars-placeholder";\n',
      'resources/styles/common.less': broken,
    });
    // theme-vars 占位写法会让编译失败，先写一份最小可编译版本，确保只让「括号不平衡」成为唯一变量
    writeFileSync(
      join(outputPath, 'resources', 'styles', 'theme-vars.less'),
      '.common() {}\n.theme-light() {}\n.theme-dark() {}\n',
      'utf-8',
    );

    expect(bracesBalanced(broken)).toBe(false);

    const result = await (__testing as any).selfHealLessBeforePublish(outputPath);

    const healedText = readFileSync(join(outputPath, 'resources', 'styles', 'common.less'), 'utf-8');
    expect(bracesBalanced(healedText)).toBe(true);
    expect(result?.pass).toBe(true);
    expect(existsSync(join(outputPath, '.less-gate.json'))).toBe(false);
  });

  it('阴性对照：悬空声明（截断残片）必须被自动修好而不是留标记', async () => {
    const broken = `.c-panel {
  display: flex;
}

color: 

.c-panel-body {
  flex: 1 1 0;
}
`;
    const outputPath = makeOutput({
      'package/index.vue': '<template><div class="c-panel"><div class="c-panel-body" /></div></template>',
      'resources/styles/index.less': INDEX_LESS,
      'resources/styles/theme-vars.less': '.common() {}\n.theme-light() {}\n.theme-dark() {}\n',
      'resources/styles/common.less': broken,
    });

    const result = await (__testing as any).selfHealLessBeforePublish(outputPath);

    expect(result?.pass).toBe(true);
    expect(readFileSync(join(outputPath, 'resources', 'styles', 'common.less'), 'utf-8')).not.toMatch(
      /^\s*color:\s*$/m,
    );
    expect(existsSync(join(outputPath, '.less-gate.json'))).toBe(false);
  });

  it('真阴性：不可确定性修复的形态（根级自定义属性）必须落 .less-gate.json 标记，不假绿', async () => {
    // `--x: v;` 在 LESS 根作用域非法，但它承载整份主题色板 —— 自愈**刻意拒绝删除**，
    // 只如实报缺陷 ⇒ 这条契约保证「不静默劣化」。
    const broken = `--em-bg-color: #edf4fb;
`;
    const outputPath = makeOutput({
      'package/index.vue': '<template><div class="c-panel" /></div></template>',
      'resources/styles/index.less': INDEX_LESS,
      'resources/styles/theme-vars.less': '.common() {}\n.theme-light() {}\n.theme-dark() {}\n',
      'resources/styles/common.less': broken,
    });

    const result = await (__testing as any).selfHealLessBeforePublish(outputPath);

    expect(result).toBeTruthy();
    expect(result.pass).toBe(false);

    const markerPath = join(outputPath, '.less-gate.json');
    expect(existsSync(markerPath)).toBe(true);
    const marker = JSON.parse(readFileSync(markerPath, 'utf-8'));
    expect(marker.pass).toBe(false);
    expect(marker.blockCount).toBeGreaterThan(0);
    // 报错必须能指到真实文件与行号，供运维直接定位
    expect(JSON.stringify(marker.diagnostics)).toContain('common.less');
    // 🆕 标记必须自带可操作结论与任务号：否则运维拿到标记仍不知该重生成还是人工修
    expect(marker.sessionId).toBeTruthy();
    expect(marker.hint).toContain('重新生成');
    expect(marker.hint).toContain('verify:less-gate');
    // 未被删除（主题变量必须保住）
    expect(readFileSync(join(outputPath, 'resources', 'styles', 'common.less'), 'utf-8')).toContain(
      '--em-bg-color',
    );
  });

  it('健康产物：不产生标记、不阻断', async () => {
    const outputPath = makeOutput({
      'package/index.vue': '<template><div class="c-panel"><div class="c-panel-body" /></div></template>',
      'resources/styles/index.less': INDEX_LESS,
      'resources/styles/theme-vars.less': '.common() {}\n.theme-light() {}\n.theme-dark() {}\n',
      'resources/styles/common.less': `.c-panel { display: flex; }
.c-panel-body { flex: 1 1 0; }
`,
    });

    const result = await (__testing as any).selfHealLessBeforePublish(outputPath);

    expect(result?.pass).toBe(true);
    expect(existsSync(join(outputPath, '.less-gate.json'))).toBe(false);
  });

  it('无样式也无入口 SFC 的产物直接跳过（不制造噪声）', async () => {
    const outputPath = mkdtempSync(join(tmpdir(), 'mvgo-lessgate-empty-'));
    const result = await (__testing as any).selfHealLessBeforePublish(outputPath);
    expect(result).toBeNull();
  });
});
