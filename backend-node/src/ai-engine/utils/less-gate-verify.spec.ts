/**
 * 发布前只读体检（npm run verify:less-gate）判据。
 *
 * 背景：publisher 对「不可确定性修复」的产物只写 `.less-gate.json` 且**不阻断发布**，
 * 此前没有任何消费方 ⇒ 信号静默放行。体检脚本必须把标记显式汇总并以非零退出码暴露。
 *
 * 判据口径：
 *  阳性：pass:false 标记 / 标记文件损坏 ⇒ exit 2 + 显式 BLOCK 汇总；
 *  阴性：健康产物无标记 ⇒ exit 0；
 *  阳性对照：pass:true 的历史残留标记 ⇒ 不得计入 BLOCK（防「文件存在就报警」的假绿）；
 *  不破坏既有判据：index.less 真编译失败且无标记 ⇒ 仍 exit 2。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { spawnSync } from 'child_process';

const SCRIPT = resolve(__dirname, '../../../scripts/repair-less-artifacts.mjs');
const CWD = resolve(__dirname, '../../..');

const makeRoot = () => mkdtempSync(join(tmpdir(), 'mvgo-lessgate-verify-'));

function makeComponent(
  root: string,
  name: string,
  opts: { marker?: string | Record<string, unknown>; less?: string } = {},
) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'resources', 'styles'), { recursive: true });
  writeFileSync(
    join(dir, 'resources', 'styles', 'index.less'),
    opts.less ?? '.healthy { color: red; }\n',
    'utf-8',
  );
  if (opts.marker !== undefined) {
    writeFileSync(
      join(dir, '.less-gate.json'),
      typeof opts.marker === 'string' ? opts.marker : JSON.stringify(opts.marker),
      'utf-8',
    );
  }
  return dir;
}

const run = (root: string) =>
  spawnSync(process.execPath, [SCRIPT, '--root', root], {
    encoding: 'utf-8',
    cwd: CWD,
    env: { ...process.env },
  });

const BLOCK_MARKER = {
  pass: false,
  sessionId: 'mc-lite-verify-1',
  blockCount: 2,
  diagnostics: [{ file: 'resources/styles/common.less', line: 17, column: 3, message: 'Unrecognised input' }],
  checkedAt: '2026-11-11T11:00:00.000Z',
  hint: '请重新生成，或人工修复后重跑 npm run verify:less-gate 确认。',
};

describe('verify:less-gate 只读体检', () => {
  let root: string;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('阳性：pass:false 标记 ⇒ exit 2，显式汇总并带可操作 hint 与真实文件行号', () => {
    root = makeRoot();
    makeComponent(root, 'c-broken', { marker: BLOCK_MARKER });
    const r = run(root);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('发布前门禁 BLOCK 标记 1 个');
    expect(r.stdout).toContain('c-broken');
    expect(r.stdout).toContain('common.less:17:3');
    expect(r.stdout).toContain('重新生成');
    expect(r.stdout).toContain('门禁 BLOCK 1');
  });

  it('阴性：健康产物无标记 ⇒ exit 0，零噪声', () => {
    root = makeRoot();
    makeComponent(root, 'c-healthy');
    const r = run(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('合计：健康 1 · 坏 0 · 门禁 BLOCK 0');
    expect(r.stdout).not.toContain('发布前门禁 BLOCK 标记');
  });

  it('阳性对照：pass:true 的历史残留标记不得计入 BLOCK', () => {
    root = makeRoot();
    makeComponent(root, 'c-stale', { marker: { ...BLOCK_MARKER, pass: true } });
    const r = run(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('门禁 BLOCK 0');
  });

  it('边界：标记文件损坏本身也是异常信号，不静默跳过', () => {
    root = makeRoot();
    makeComponent(root, 'c-corrupt', { marker: '{not-json' });
    const r = run(root);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('标记文件解析失败');
  });

  it('不破坏既有判据：index.less 真编译失败且无标记 ⇒ 仍 exit 2', () => {
    root = makeRoot();
    makeComponent(root, 'c-bad-less', { less: '.a { color: ; }=========\n' });
    const r = run(root);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('坏 1');
  });

  it('钉回真值：npm script 两处 root 已登记（后端 + 前端 workspace）', () => {
    const pkg = JSON.parse(
      require('fs').readFileSync(join(CWD, 'package.json'), 'utf-8'),
    );
    const cmd = String(pkg.scripts['verify:less-gate'] || '');
    expect(cmd).toContain('--root workspace/custom-components');
    expect(cmd).toContain('--root ../frontend/workspace/custom-components');
    expect(cmd).not.toContain('--write'); // 只读体检，发布前检查绝不能写磁盘
  });
});
