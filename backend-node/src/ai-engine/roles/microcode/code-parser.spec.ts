jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
}), { virtual: true });

import { parseCodeOutput } from './code-parser.js';

/**
 * EMPTY_ARTIFACT 回归测试（#B，2026-09-01 任务 mc-max-1788248984779-862c6b29 前两轮）。
 *
 * 根因：LLM 输出 index.vue 时既非分隔符格式、也非合法 JSON，robustJSONParse
 * 失败返回 fallback `{ files: {} }`（空对象）。第 8 步 `if (!parsed || !parsed.files)`
 * 中 `parsed.files = {}` 是 truthy（空对象）→ 判定 false → 跳过 recoverFilesFromRawText
 * 兜底恢复（本可从 ```vue 代码围栏重建 index.vue）→ chunk 静默返回空 files → 写盘无
 * package/index.vue → L0-B EMPTY_ARTIFACT → 重试空转耗预算。
 *
 * 修复：第 8 步条件改为显式检查「空 files」，让「解析失败的空兜底」也走兜底恢复。
 */
describe('parseCodeOutput 空兜底短路修复（#B EMPTY_ARTIFACT）', () => {
  it('事故复现：```vue 代码围栏输出（非分隔符/非 JSON）→ 兜底恢复救回 index.vue', () => {
    const raw = '```vue\n<template><div class="root">hello</div></template>\n```';
    const result = parseCodeOutput(raw, null);
    expect(result).toBeTruthy();
    expect(result.files).toBeTruthy();
    expect(Object.keys(result.files).length).toBeGreaterThan(0);
    expect(result.files['package/index.vue']).toContain('hello');
  });

  it('正面对照：合法 JSON（含 files）→ 正常解析不回归', () => {
    const raw = JSON.stringify({
      files: {
        'package/index.vue':
          '<template><div class="root">ok</div></template>',
      },
    });
    const result = parseCodeOutput(raw, null);
    expect(result.files['package/index.vue']).toContain('ok');
  });

  it('负面对照：declare 业务片段（无 files、有 componentName）→ 透传 declare.json 不回归', () => {
    const raw = JSON.stringify({ componentName: '环境监测', panelKey: 'env' });
    const result = parseCodeOutput(raw, null);
    expect(result.files).toBeTruthy();
    expect(result.files['declare.json']).toBeTruthy();
  });

  it('纯乱码（无围栏/无 JSON/无字段）→ 仍抛错（不静默空兜底）', () => {
    expect(() => parseCodeOutput('随便一段不是代码的文本', null)).toThrow();
  });
});
