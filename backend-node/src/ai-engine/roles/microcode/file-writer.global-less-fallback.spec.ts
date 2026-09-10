/**
 * file-writer 跨文件缺失 less 变量全局兜底 spec（2026-09-10 治本，Loop 2.1 验收配套）
 *
 * 根因（c-device-monitor-25hce807-18cf88ae 实锤）：
 * - P0-1 normalizeStyleLessVars 只遍历 .vue 且只在单文件内注入默认值；
 * - 单文件写盘门禁是「逐文件 retry.valid 门禁」——文件若附带其他错误则走「跳过」分支，变量永不补；
 * - .less 文件（common.less）从不被任何一道门禁覆盖 → 顶层 @color-tab-active / @color-tab-active-bg
 *   theme-vars 未声明 → LESS-COMPILE-001 variable is undefined。
 *
 * 治本：writeFiles 落盘后扫全部 .less + .vue 的 @var 引用，凡 theme-vars 未声明、非资源、本文件未声明的，
 * 统一注入 theme-vars.less（单一事实源），不依赖单文件 retry.valid。
 */
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeFiles } from './file-writer.js';

function mkTmp() {
  return mkdtempSync(join(tmpdir(), 'fw-global-fallback-'));
}

describe('file-writer 跨文件缺失 less 变量全局兜底', () => {
  let dir: string;
  afterEach(() => {
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('common.less 顶层引用的 @color-tab-active 未声明 → 注入 theme-vars.less', () => {
    dir = mkTmp();
    const files: Record<string, string> = {
      'resources/styles/themes/theme-vars.less':
        '// theme\n.common() {\n  @color-tab-default: rgba(102,102,102,1);\n}\n',
      'resources/styles/common.less': [
        '.tabs {',
        '  &--active {',
        '    background: @color-tab-active-bg;',
        '    color: @color-tab-active;',
        '  }',
        '}',
        '',
      ].join('\n'),
    };

    writeFiles(files, dir, {});

    const tv = readFileSync(
      join(dir, 'resources/styles/themes/theme-vars.less'),
      'utf-8',
    );
    // 两个未声明的 active 系列变量都被兜底注入
    expect(tv).toContain('@color-tab-active-bg:');
    expect(tv).toContain('@color-tab-active:');
    // 不误伤 mixin 内已声明的 default
    expect(tv.match(/@color-tab-default\s*:/g)?.length).toBe(1);
  });

  it('theme-vars 已声明的变量不重复注入（幂等）', () => {
    dir = mkTmp();
    const files: Record<string, string> = {
      'resources/styles/themes/theme-vars.less':
        '.common() {\n  @color-primary: #409EFF;\n}\n',
      'resources/styles/common.less': '.a { color: @color-primary; }\n',
    };

    writeFiles(files, dir, {});
    const tv = readFileSync(
      join(dir, 'resources/styles/themes/theme-vars.less'),
      'utf-8',
    );
    expect(tv.match(/@color-primary\s*:/g)?.length).toBe(1);
  });

  it('资源变量（assignedVarName）不被兜底注入', () => {
    dir = mkTmp();
    const files: Record<string, string> = {
      'resources/styles/themes/theme-vars.less': '.common() {}\n',
      'resources/styles/common.less': '.b { background: url(@bg1); }\n',
    };

    writeFiles(files, dir, {
      resourceDomMapping: [{ assignedVarName: 'bg1', resourceFile: 'a/b.png' }],
    });
    const tv = readFileSync(
      join(dir, 'resources/styles/themes/theme-vars.less'),
      'utf-8',
    );
    // bg1 是资源变量，归一化由 P0-1 负责，不应作为 theme 变量注入
    expect(tv).not.toContain('@bg1:');
  });
});
