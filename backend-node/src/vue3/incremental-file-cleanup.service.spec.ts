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
