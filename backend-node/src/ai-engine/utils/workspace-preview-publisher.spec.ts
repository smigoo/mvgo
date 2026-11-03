import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const BACKEND_ROOT = process.cwd();
const PROJECT_ROOT = join(BACKEND_ROOT, '..');
const BACKEND_WORKSPACE = join(BACKEND_ROOT, 'workspace', 'custom-components');
const FRONTEND_WORKSPACE = join(PROJECT_ROOT, 'frontend', 'workspace', 'custom-components');
// 直接执行构建产物：ESM .js 对 ../../config/*.js 的引用只在 dist 中完整存在。
const MODULE_PATH = join(BACKEND_ROOT, 'dist', 'ai-engine', 'utils', 'workspace-preview-publisher.js');
const NODE_BIN = process.execPath;

function runModuleScript(code: string, extraEnv: Record<string, string> = {}) {
  return execFileSync(NODE_BIN, ['--input-type=module', '-e', code], {
    env: {
      ...process.env,
      FRONTEND_WORKSPACE: join(PROJECT_ROOT, 'frontend', 'workspace'),
      ...extraEnv,
    },
    encoding: 'utf-8',
  });
}

describe('workspace-preview-publisher', () => {
  let outputRoot: string;
  let componentId: string;
  let backendTarget: string;
  let frontendTarget: string;

  beforeEach(() => {
    outputRoot = mkdtempSync(join(tmpdir(), 'mvgo-workspace-publisher-'));
    componentId = `mc-spec-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    backendTarget = join(BACKEND_WORKSPACE, componentId);
    frontendTarget = join(FRONTEND_WORKSPACE, componentId);

    mkdirSync(join(outputRoot, 'package'), { recursive: true });
    mkdirSync(join(outputRoot, 'resources', 'styles'), { recursive: true });
    writeFileSync(join(outputRoot, 'package', 'index.vue'), '<template><div>next</div></template>', 'utf-8');
    writeFileSync(join(outputRoot, 'resources', 'styles', 'index.less'), '.demo{}', 'utf-8');
  });

  afterEach(() => {
    rmSync(outputRoot, { recursive: true, force: true });
    rmSync(backendTarget, { recursive: true, force: true });
    rmSync(frontendTarget, { recursive: true, force: true });
  });

  function seedWorkspace(content: string) {
    for (const targetPath of [backendTarget, frontendTarget]) {
      mkdirSync(join(targetPath, 'package'), { recursive: true });
      mkdirSync(join(targetPath, 'resources', 'styles'), { recursive: true });
      writeFileSync(join(targetPath, 'package', 'index.vue'), content, 'utf-8');
      writeFileSync(join(targetPath, 'resources', 'styles', 'index.less'), '.old{}', 'utf-8');
    }
  }

  it('publishes backend and frontend workspaces from the same staged output', () => {
    seedWorkspace('<template><div>old</div></template>');

    runModuleScript(`
      import { __testing } from ${JSON.stringify(`file://${MODULE_PATH}`)};
      const preparedTargets = [
        ${JSON.stringify(backendTarget)},
        ${JSON.stringify(frontendTarget)},
      ].map((targetPath) => __testing.buildStagingCopy({
        outputPath: ${JSON.stringify(outputRoot)},
        targetPath,
        target: 'microcode',
      }));
      __testing.publishPreparedTargets(preparedTargets);
      await new Promise((resolve) => setTimeout(resolve, 80));
    `);

    const backendContent = readFileSync(join(backendTarget, 'package', 'index.vue'), 'utf-8');
    const frontendContent = readFileSync(join(frontendTarget, 'package', 'index.vue'), 'utf-8');

    expect(backendContent).toBe('<template><div>next</div></template>');
    expect(frontendContent).toBe(backendContent);
  });

  it('can roll back a promoted target to its previous version', () => {
    seedWorkspace('<template><div>old</div></template>');

    runModuleScript(`
      import { __testing } from ${JSON.stringify(`file://${MODULE_PATH}`)};
      const preparedTarget = __testing.buildStagingCopy({
        outputPath: ${JSON.stringify(outputRoot)},
        targetPath: ${JSON.stringify(backendTarget)},
        target: 'microcode',
      });
      __testing.promotePreparedTarget(preparedTarget);
      __testing.rollbackPreparedTarget(preparedTarget);
      await new Promise((resolve) => setTimeout(resolve, 80));
    `);

    const backendContent = readFileSync(join(backendTarget, 'package', 'index.vue'), 'utf-8');
    expect(backendContent).toBe('<template><div>old</div></template>');
  });

  it('re-enqueues orphaned cleanup directories on startup scan', () => {
    const orphan = `${frontendTarget}.quality-backup-1.cleanup-123`;
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, 'stale.txt'), 'stale', 'utf-8');

    runModuleScript(`
      import { __testing } from ${JSON.stringify(`file://${MODULE_PATH}`)};
      __testing.ensureStartupCleanupScan();
      await new Promise((resolve) => setTimeout(resolve, 120));
    `);

    expect(existsSync(orphan)).toBe(false);
  });
});

/**
 * 🛡️ 2026-11-03（真机实锤）：journal 原子写不得阻断生成。
 * 背景：`writePreviewTransactionJournal` 旧实现「写 tmp → renameSync」，rename 抛
 * `EPERM: operation not permitted` 时**整单生成失败**。journal 仅是崩溃恢复用的
 * 尽力而为持久化，绝不能因它写不成而让用户任务挂掉。
 */
describe('workspace-preview-publisher · journal 原子写容错', () => {
  const journalDir = join(PROJECT_ROOT, 'temp-components', '.preview-transactions');

  afterEach(() => {
    // 清掉本 spec 可能留下的唯一命名探针，避免污染真实 journal 目录
    try {
      for (const name of readdirSync(journalDir)) {
        if (name.startsWith('spec-') || name.includes('.spec-probe.')) {
          rmSync(join(journalDir, name), { recursive: true, force: true });
        }
      }
    } catch {
      /* 目录不存在则忽略 */
    }
  });

  it('启动恢复清扫未完成的 journal 临时文件（*.json.tmp-*）', () => {
    mkdirSync(journalDir, { recursive: true });
    const stale = join(journalDir, 'spec-stale.json.tmp-999-1-abcdef');
    writeFileSync(stale, '{"partial":true}', 'utf-8');

    runModuleScript(`
      import { __testing } from ${JSON.stringify(`file://${MODULE_PATH}`)};
      __testing.recoverPreviewTransactions();
    `);

    expect(existsSync(stale)).toBe(false);
  });

  it('原子重命名失败（目标被目录占位）时不得抛出，且不残留 tmp', () => {
    mkdirSync(journalDir, { recursive: true });
    const key = `spec-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const digest = createHash('sha256').update(key).digest('hex');
    const journalPath = join(journalDir, `${digest}.json`);
    // 目标路径用**目录**占位 ⇒ renameSync 必失败（EISDIR/ENOTDIR），逼近 EPERM 场景
    mkdirSync(journalPath, { recursive: true });

    // runModuleScript 在子进程非 0 退出时抛错 ⇒ 若 writePreviewTransactionJournal 冒泡异常，本用例直接失败
    const out = runModuleScript(`
      import { __testing } from ${JSON.stringify(`file://${MODULE_PATH}`)};
      __testing.writePreviewTransactionJournal({ transactionKey: ${JSON.stringify(key)} });
      console.log('NO_THROW');
    `);
    expect(String(out)).toContain('NO_THROW');

    // tmp 必须被清理，不留残骸
    const leftovers = readdirSync(journalDir).filter(
      (n) => n.startsWith(digest) && n.includes('.tmp-'),
    );
    expect(leftovers).toEqual([]);

    rmSync(journalPath, { recursive: true, force: true });
  });
});

/**
 * P0 组件重名保护（2026-09-03）。
 * 背景：englishId 由 LLM 自由生成且管线无唯一性校验，撞名时 publish 会把其他任务的
 * workspace 产物整体覆盖。resolveUniqueComponentId 通过 .preview-source.json 标记做同源判定。
 *
 * ⚠️ 回归教训：P0 只改了落名侧、未同步事务上下文侧 → commit 用原 id 找不到事务 →
 * 误判「候选预览发布事务提交失败」（mc-max-1788444537578 实锤）。故落名一旦变化，
 * 调用方必须用 publisher 返回的 componentId 构造事务上下文（见 phase2/lite 调用处）。
 */
describe('resolveUniqueComponentId（P0 组件重名保护）', () => {
  let probeRoot: string;

  beforeEach(() => {
    probeRoot = mkdtempSync(join(tmpdir(), 'mvgo-unique-id-'));
  });

  afterEach(() => {
    rmSync(probeRoot, { recursive: true, force: true });
  });

  /** 在 dist 模块中执行表达式并返回其 JSON 结果 */
  function resolveId(dir: string, desiredId: string, sessionId: string, seedSessionId?: string) {
    const setup = seedSessionId
      ? `mkdirSync(${JSON.stringify(dir)}, { recursive: true });
         writeFileSync(${JSON.stringify(join(dir, '.preview-source.json'))}, ${JSON.stringify(JSON.stringify({ sessionId: seedSessionId }))}, 'utf-8');`
      : '';
    const stdout = runModuleScript(`
      import { mkdirSync, writeFileSync } from 'fs';
      ${setup}
      const { resolveUniqueComponentId } = await import(${JSON.stringify(`file://${MODULE_PATH}`)});
      console.log(JSON.stringify(resolveUniqueComponentId(
        ${JSON.stringify(dir)},
        ${JSON.stringify(desiredId)},
        ${JSON.stringify(sessionId)},
        {},
      )));
    `);
    return JSON.parse(String(stdout).trim().split('\n').pop() as string);
  }

  it('目录不存在 → 沿用原名', () => {
    expect(resolveId(join(probeRoot, 'c-monitor'), 'c-monitor', 'sess-A')).toBe('c-monitor');
  });

  it('异源撞名 → 追加 -2 后缀（防覆盖其他任务产物）', () => {
    const dir = join(probeRoot, 'c-monitor');
    mkdirSync(dir, { recursive: true });
    expect(resolveId(dir, 'c-monitor', 'sess-B')).toBe('c-monitor-2');
  });

  it('同源再发布（标记 sessionId 相同）→ 沿用原名覆盖更新', () => {
    const dir = join(probeRoot, 'c-monitor');
    expect(resolveId(dir, 'c-monitor', 'sess-A', 'sess-A')).toBe('c-monitor');
  });

  it('-2 已被占用 → 顺延到 -3', () => {
    const dir = join(probeRoot, 'c-monitor');
    mkdirSync(dir, { recursive: true });
    mkdirSync(`${dir}-2`, { recursive: true });
    expect(resolveId(dir, 'c-monitor', 'sess-C')).toBe('c-monitor-3');
  });

  it('无标记的老目录 → 保守加后缀（不覆盖历史组件）', () => {
    const dir = join(probeRoot, 'c-legacy');
    mkdirSync(dir, { recursive: true }); // 存在但没有 .preview-source.json
    expect(resolveId(dir, 'c-legacy', 'sess-D')).toBe('c-legacy-2');
  });
});
