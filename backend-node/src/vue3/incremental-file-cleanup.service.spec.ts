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
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { IncrementalFileCleanupService } from './incremental-file-cleanup.service';

describe('IncrementalFileCleanupService', () => {
  let root: string;
  let service: IncrementalFileCleanupService;

  beforeEach(() => {
    jest.useFakeTimers();
    root = mkdtempSync(join(tmpdir(), 'mvgo-incremental-cleanup-'));
    service = new IncrementalFileCleanupService();
  });

  afterEach(() => {
    jest.useRealTimers();
    rmSync(root, { recursive: true, force: true });
  });

  it('detaches the active path synchronously before background deletion', () => {
    const target = join(root, 'target');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'value.txt'), 'value', 'utf-8');

    const detached = service.detachAndSchedule(target);

    expect(existsSync(target)).toBe(false);
    expect(detached).not.toBeNull();
    expect(existsSync(detached!)).toBe(true);

    jest.runAllTimers();
    expect(existsSync(detached!)).toBe(false);
  });

  it('deletes no more than one small batch per timer turn', () => {
    const target = join(root, 'large-target');
    mkdirSync(target, { recursive: true });
    for (let index = 0; index < 55; index += 1) {
      writeFileSync(join(target, `file-${index}.txt`), String(index), 'utf-8');
    }

    const detached = service.detachAndSchedule(target)!;
    jest.advanceTimersToNextTimer();

    expect(existsSync(detached)).toBe(true);
    expect(readdirSync(detached)).toHaveLength(35);

    jest.runAllTimers();
    expect(existsSync(detached)).toBe(false);
  });

  it('re-enqueues orphaned *.cleanup-* directories found by startup scan', () => {
    const orphan = join(root, 'leftover.cleanup-123-456-abc');
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, 'stale.txt'), 'stale', 'utf-8');

    const resumed = service.scanAndResume([root]);

    expect(resumed).toBe(1);
    expect(existsSync(orphan)).toBe(true);

    jest.runAllTimers();
    expect(existsSync(orphan)).toBe(false);
  });

  it('does not double-enqueue an already scheduled *.cleanup-* directory', () => {
    const orphan = join(root, 'leftover.cleanup-123-456-def');
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, 'stale.txt'), 'stale', 'utf-8');

    expect(service.scanAndResume([root])).toBe(1);
    expect(service.scanAndResume([root])).toBe(0);
  });
});
