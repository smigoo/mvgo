// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（file-writer.diff-skip 等同款惯例）。
jest.mock('../config/backend-root.js', () => {
  const cwd = process.cwd()
  return {
    backendRoot: cwd,
    projectRoot: cwd,
    workspaceRoot: cwd,
    customComponentsDir: cwd,
    vue3ComponentsDir: cwd,
    resolveFrontendWorkspacePath: () => cwd,
    frontendCustomComponentsDir: () => cwd,
    frontendVue3ComponentsDir: () => cwd,
    tempComponentsDir: cwd,
    dataDir: cwd,
    logsDir: '/tmp/mvgo-test-logs',
    configDir: cwd,
    chatAttachmentsDir: cwd,
    apifoxZipsDir: cwd,
    apiCatalogsDir: cwd,
  }
}, { virtual: true })
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WorkspaceTransactionService } from './workspace-transaction.service';
import { IncrementalFileCleanupService } from './incremental-file-cleanup.service';

describe('WorkspaceTransactionService', () => {
  let root: string;
  const service = new WorkspaceTransactionService(new IncrementalFileCleanupService());

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mvgo-workspace-transaction-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function createDir(name: string, value: string): string {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'value.txt'), value, 'utf-8');
    return dir;
  }

  it('commits all prepared targets together', async () => {
    const firstTarget = createDir('first-target', 'old-first');
    const secondTarget = createDir('second-target', 'old-second');
    const firstStage = createDir('first-stage', 'new-first');
    const secondStage = createDir('second-stage', 'new-second');

    await service.commit([
      { targetPath: firstTarget, stagingPath: firstStage },
      { targetPath: secondTarget, stagingPath: secondStage },
    ]);

    expect(readFileSync(join(firstTarget, 'value.txt'), 'utf-8')).toBe('new-first');
    expect(readFileSync(join(secondTarget, 'value.txt'), 'utf-8')).toBe('new-second');
    expect(existsSync(firstStage)).toBe(false);
    expect(existsSync(secondStage)).toBe(false);
  });

  it('rolls back every target when committed-state validation fails', async () => {
    const firstTarget = createDir('first-target', 'old-first');
    const secondTarget = createDir('second-target', 'old-second');
    const firstStage = createDir('first-stage', 'new-first');
    const secondStage = createDir('second-stage', 'new-second');

    await expect(service.commit(
      [
        { targetPath: firstTarget, stagingPath: firstStage },
        { targetPath: secondTarget, stagingPath: secondStage },
      ],
      async () => {
        throw new Error('runtime preflight blocked');
      },
    )).rejects.toThrow('runtime preflight blocked');

    expect(readFileSync(join(firstTarget, 'value.txt'), 'utf-8')).toBe('old-first');
    expect(readFileSync(join(secondTarget, 'value.txt'), 'utf-8')).toBe('old-second');
  });
});
