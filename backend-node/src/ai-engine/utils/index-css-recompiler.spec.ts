import { recompileIndexCss, hasLessFile } from './index-css-recompiler.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

// mock less：返回最小合法 CSS 产物
const mockLess = {
  render: async (source: string) => ({ css: source.replace(/\.panel\s*\{/, '.panel-compiled {') }),
};

describe('index-css-recompiler', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join('/tmp', `recompile-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(tmpDir, 'resources', 'styles'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('hasLessFile 正确识别 .less 文件', () => {
    expect(hasLessFile(['resources/styles/index.less'])).toBe(true);
    expect(hasLessFile(['package/index.vue', 'resources/styles/common.less'])).toBe(true);
    expect(hasLessFile(['package/index.vue'])).toBe(false);
    expect(hasLessFile([])).toBe(false);
    expect(hasLessFile(null as any)).toBe(false);
  });

  it('index.less 不存在时返回 false 且不抛异常', async () => {
    const result = await recompileIndexCss(tmpDir, null, mockLess);
    expect(result).toBe(false);
  });

  it('将 index.less 编译为 index.css（注入 mock less）', async () => {
    writeFileSync(
      join(tmpDir, 'resources', 'styles', 'index.less'),
      '.panel { display: flex; color: #fff; }\n',
      'utf-8',
    );

    const result = await recompileIndexCss(tmpDir, null, mockLess);
    expect(result).toBe(true);

    const cssPath = join(tmpDir, 'resources', 'styles', 'index.css');
    expect(existsSync(cssPath)).toBe(true);
    const css = readFileSync(cssPath, 'utf-8');
    expect(css).toContain('.panel-compiled');
  });

  it('编译失败时返回 false 且不抛异常（非阻断）', async () => {
    writeFileSync(
      join(tmpDir, 'resources', 'styles', 'index.less'),
      '.panel { display: flex; color: #fff;\n',
      'utf-8',
    );

    const failingLess = {
      render: async () => { throw new Error('syntax error'); },
    };
    const result = await recompileIndexCss(tmpDir, null, failingLess);
    expect(result).toBe(false);
  });
});
