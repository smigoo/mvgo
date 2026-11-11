/**
 * 🛡️ 2026-11-11 · index.less → index.css 真编译自愈（红卡根治的单一收口点）
 *
 * 事故背景：lite.service.ts P1.10 只把 `recompileIndexCss` 的 false 当「非阻断」放过，
 * 坏的 common.less 静默进预览 ⇒ 浏览器现编 LESS 失败 ⇒ 用户看到红卡，任务却显示「完整 100%」。
 *
 * 本 spec 钉住四条契约：
 *   ① 确定性坏形态（横幅残片 / 悬空声明）→ 自动修好并产出 index.css；
 *   ② 枚举之外的坏形态（heal 全链覆盖不到）→ 以 less 报错行号为 oracle 定点手术，仍能修好；
 *   ③ 不可修复（根级自定义属性，删除会静默丢主题）→ reason='invalid'，**不产出** index.css；
 *   ④ 无样式入口 → reason='missing'，不阻断。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { compileIndexCssStrict } from './index-css-recompiler.js';

const INDEX_LESS = `@import './theme-vars.less';

.common();

@import (multiple) './common.less';
`;

const THEME_VARS = `.common() {}
.theme-light() {}
.theme-dark() {}
`;

function makeOutput(commonLess: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mvgo-indexcss-'));
  mkdirSync(join(dir, 'resources', 'styles'), { recursive: true });
  writeFileSync(join(dir, 'resources', 'styles', 'index.less'), INDEX_LESS, 'utf-8');
  writeFileSync(join(dir, 'resources', 'styles', 'theme-vars.less'), THEME_VARS, 'utf-8');
  writeFileSync(join(dir, 'resources', 'styles', 'index.css'), '/* stale */', 'utf-8');
  writeFileSync(join(dir, 'resources', 'styles', 'common.less'), commonLess, 'utf-8');
  return dir;
}

describe('compileIndexCssStrict', () => {
  it('① 确定性坏形态（横幅残片 + 悬空声明）→ 自动修好并产出 index.css', async () => {
    const dir = makeOutput(`.c-panel {
  color: #fff;
}============== 左侧垂直 Tab ====================

color:

.c-panel-body {
  height: 100%;
}
`);
    const result = await compileIndexCssStrict(dir);

    expect(result.ok).toBe(true);
    expect(result.reason).toBe('ok');
    expect(result.applied.length).toBeGreaterThan(0);
    const css = readFileSync(join(dir, 'resources', 'styles', 'index.css'), 'utf-8');
    expect(css).toContain('.c-panel');
    expect(css).not.toContain('/* stale */');
  });

  it('② 枚举之外的坏形态 → 以 less 报错行号为 oracle 定点手术（heal 全链覆盖不到）', async () => {
    // 单独一行 `@` 是非法 at-rule：healLessFull 不动它、scan 也不报它
    // ⇒ 只有真编译能发现，靠 oracle 手术删行修好。
    const dir = makeOutput(`.c-panel {
  color: #fff;
}
@
.c-panel-body {
  height: 100%;
}
`);
    const result = await compileIndexCssStrict(dir);

    expect(result.ok).toBe(true);
    expect(result.applied.some((a) => /drop-line/.test(a))).toBe(true);
    expect(readFileSync(join(dir, 'resources', 'styles', 'common.less'), 'utf-8')).not.toMatch(/^@\s*$/m);
  });

  it('③ 不可修复形态（根级自定义属性）→ reason=invalid 且不产出 index.css，不得静默劣化', async () => {
    const dir = makeOutput(`--em-bg-color: #edf4fb;
`);
    const result = await compileIndexCssStrict(dir);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid');
    expect(result.error).toBeTruthy();
    // 旧 css 保留（不清空），主题变量一个都没被删
    expect(readFileSync(join(dir, 'resources', 'styles', 'index.css'), 'utf-8')).toContain('/* stale */');
    expect(readFileSync(join(dir, 'resources', 'styles', 'common.less'), 'utf-8')).toContain('--em-bg-color');
  });

  it('④ 无 index.less → reason=missing（不阻断非微码产物）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mvgo-indexcss-empty-'));
    const result = await compileIndexCssStrict(dir);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing');
    expect(existsSync(join(dir, 'resources', 'styles', 'index.css'))).toBe(false);
  });

  it('阴性：健康产物零修复，直接产出 index.css', async () => {
    const dir = makeOutput(`.c-panel {
  display: flex;
  color: #fff;
}
`);
    const result = await compileIndexCssStrict(dir);

    expect(result.ok).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.cssSize).toBeGreaterThan(0);
  });
});
