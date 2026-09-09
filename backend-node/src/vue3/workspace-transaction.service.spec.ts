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
