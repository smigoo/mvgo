import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const BACKEND_ROOT = process.cwd();
const MODULE_PATH = join(BACKEND_ROOT, 'dist', 'ai-engine', 'utils', 'rename-with-copy-fallback.js');
const NODE_BIN = process.execPath;

function runModuleScript(code: string) {
  return execFileSync(NODE_BIN, ['--input-type=module', '-e', code], {
    env: { ...process.env },
    encoding: 'utf-8',
  });
}

describe('rename-with-copy-fallback（EPERM 风暴降级）', () => {
  let workRoot: string;

  beforeEach(() => {
    workRoot = mkdtempSync(join(tmpdir(), 'mvgo-rename-fallback-'));
  });

  afterEach(() => {
    rmSync(workRoot, { recursive: true, force: true });
  });

  it('rename 正常时走 rename，不复制', () => {
    const out = runModuleScript(`
      import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
      import { renameWithCopyFallback } from ${JSON.stringify(`file://${MODULE_PATH}`)};
      const root = ${JSON.stringify(workRoot)};
      const src = root + '/src-a', dst = root + '/dst-a';
      mkdirSync(src, { recursive: true });
      writeFileSync(src + '/a.txt', 'hello');
      const result = renameWithCopyFallback(src, dst);
      if (result.mode !== 'rename') throw new Error('应走 rename，实际 ' + result.mode);
      if (!result.srcRemoved) throw new Error('rename 后源应消失');
      if (existsSync(src)) throw new Error('源目录仍存在');
      if (readFileSync(dst + '/a.txt', 'utf-8') !== 'hello') throw new Error('内容不符');
      console.log('PASS_NORMAL_RENAME');
    `);
    expect(out).toContain('PASS_NORMAL_RENAME');
  });

  it('阳性对照：renameSync 抛 EPERM 时降级复制落名，内容完整', () => {
    const out = runModuleScript(`
      import fs, { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
      // 先 patch 再动态 import：builtin 命名导出是动态视图，patch 对后续 import 生效
      const origRename = fs.renameSync;
      fs.renameSync = () => { const e = new Error('operation not permitted, rename'); e.code = 'EPERM'; throw e; };
      const { renameWithCopyFallback } = await import(${JSON.stringify(`file://${MODULE_PATH}`)});
      const root = ${JSON.stringify(workRoot)};
      const src = root + '/src-b', dst = root + '/dst-b';
      mkdirSync(src + '/nested', { recursive: true });
      writeFileSync(src + '/nested/b.txt', 'fallback-content');
      const result = renameWithCopyFallback(src, dst);
      if (result.mode !== 'copy') throw new Error('应降级 copy，实际 ' + result.mode);
      if (readFileSync(dst + '/nested/b.txt', 'utf-8') !== 'fallback-content') throw new Error('复制内容不符');
      // rmSync 未 patch，源应被清掉
      if (!result.srcRemoved) throw new Error('源应清理成功');
      if (existsSync(src)) throw new Error('源目录仍存在');
      fs.renameSync = origRename;
      console.log('PASS_EPERM_FALLBACK');
    `);
    expect(out).toContain('PASS_EPERM_FALLBACK');
  });

  it('rename 与 rm 同时 EPERM 时仍落名成功，srcRemoved=false（残留待自愈）', () => {
    const out = runModuleScript(`
      import fs, { mkdirSync, writeFileSync, readFileSync } from 'fs';
      fs.renameSync = () => { const e = new Error('operation not permitted'); e.code = 'EPERM'; throw e; };
      fs.rmSync = () => { const e = new Error('operation not permitted'); e.code = 'EPERM'; throw e; };
      const { renameWithCopyFallback } = await import(${JSON.stringify(`file://${MODULE_PATH}`)});
      const root = ${JSON.stringify(workRoot)};
      const src = root + '/src-c', dst = root + '/dst-c';
      mkdirSync(src, { recursive: true });
      writeFileSync(src + '/c.txt', 'residue-ok');
      const result = renameWithCopyFallback(src, dst);
      if (result.mode !== 'copy') throw new Error('应降级 copy');
      if (result.srcRemoved) throw new Error('rm 被 patch 时 srcRemoved 应为 false');
      if (readFileSync(dst + '/c.txt', 'utf-8') !== 'residue-ok') throw new Error('复制内容不符');
      console.log('PASS_RESIDUE_TOLERATED');
    `);
    expect(out).toContain('PASS_RESIDUE_TOLERATED');
  });

  it('文件→已存在文件：rename/unlink 全 EPERM 时仍直覆成功（ca91718c 回归）', () => {
    const out = runModuleScript(`
      import fs, { mkdirSync, writeFileSync, readFileSync } from 'fs';
      fs.renameSync = () => { const e = new Error('operation not permitted'); e.code = 'EPERM'; throw e; };
      fs.unlinkSync = () => { const e = new Error('operation not permitted'); e.code = 'EPERM'; throw e; };
      fs.rmSync = () => { const e = new Error('operation not permitted'); e.code = 'EPERM'; throw e; };
      const { renameWithCopyFallback } = await import(${JSON.stringify(`file://${MODULE_PATH}`)});
      const root = ${JSON.stringify(workRoot)};
      const src = root + '/m.tmp', dst = root + '/manifest.json';
      writeFileSync(src, 'NEW-MANIFEST');
      writeFileSync(dst, 'OLD-MANIFEST');
      const result = renameWithCopyFallback(src, dst);
      if (result.mode !== 'copy') throw new Error('应降级 copy');
      if (readFileSync(dst, 'utf-8') !== 'NEW-MANIFEST') throw new Error('目标未被直覆: ' + readFileSync(dst, 'utf-8'));
      console.log('PASS_OVERWRITE_EXISTING_FILE');
    `);
    expect(out).toContain('PASS_OVERWRITE_EXISTING_FILE');
  });

  it('非降级错误（如 ENOENT）原样抛出，不掩盖真 bug', () => {
    const out = runModuleScript(`
      import { renameWithCopyFallback } from ${JSON.stringify(`file://${MODULE_PATH}`)};
      const root = ${JSON.stringify(workRoot)};
      try {
        renameWithCopyFallback(root + '/not-exist', root + '/dst-d');
        throw new Error('应抛 ENOENT');
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        console.log('PASS_ENOENT_PASSTHROUGH');
      }
    `);
    expect(out).toContain('PASS_ENOENT_PASSTHROUGH');
  });
});
