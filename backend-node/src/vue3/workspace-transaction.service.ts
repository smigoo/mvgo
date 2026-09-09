import { Injectable } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  renameSync,
} from 'fs';
import { dirname } from 'path';
import { IncrementalFileCleanupService } from './incremental-file-cleanup.service';

export interface WorkspaceTransactionTarget {
  targetPath: string;
  stagingPath: string | null;
}

interface PreparedTarget extends WorkspaceTransactionTarget {
  backupPath: string;
  movedExisting: boolean;
  committed: boolean;
}

@Injectable()
export class WorkspaceTransactionService {
  constructor(private readonly cleanup: IncrementalFileCleanupService) {}

  async commit(
    targets: WorkspaceTransactionTarget[],
    validateCommittedState?: () => Promise<void>,
  ): Promise<void> {
    const transactionId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const prepared: PreparedTarget[] = targets.map((target, index) => ({
      ...target,
      backupPath: `${target.targetPath}.binding-backup-${transactionId}-${index}`,
      movedExisting: false,
      committed: false,
    }));

    let committedSuccessfully = false;
    let rolledBack = false;
    try {
      for (const target of prepared) {
        mkdirSync(dirname(target.targetPath), { recursive: true });
        if (target.stagingPath && !existsSync(target.stagingPath)) {
          throw new Error(`事务暂存目标不存在: ${target.stagingPath}`);
        }
      }

      for (const target of prepared) {
        if (existsSync(target.targetPath)) {
          renameSync(target.targetPath, target.backupPath);
          target.movedExisting = true;
        }
        if (target.stagingPath) {
          renameSync(target.stagingPath, target.targetPath);
        }
        target.committed = true;
      }

      if (validateCommittedState) {
        await validateCommittedState();
      }

      committedSuccessfully = true;
      for (const target of prepared) {
        if (target.movedExisting && existsSync(target.backupPath)) {
          this.cleanup.detachAndSchedule(target.backupPath);
        }
      }
    } catch (error) {
      let rollbackError: Error | null = null;
      for (const target of [...prepared].reverse()) {
        try {
          if (target.committed && existsSync(target.targetPath)) {
            // 原子移出新目标后即可立即恢复备份，物理删除在后台分批完成。
            this.cleanup.detachAndSchedule(target.targetPath);
          }
          if (target.movedExisting && existsSync(target.backupPath)) {
            renameSync(target.backupPath, target.targetPath);
          }
        } catch (restoreError) {
          rollbackError ||= restoreError as Error;
        }
      }
      rolledBack = rollbackError === null;
      if (rollbackError) {
        throw new Error(
          `事务提交失败且自动回滚不完整: ${(error as Error).message}; rollback: ${rollbackError.message}`,
        );
      }
      throw error;
    } finally {
      for (const target of prepared) {
        if (target.stagingPath && existsSync(target.stagingPath)) {
          this.cleanup.detachAndSchedule(target.stagingPath);
        }
        if ((committedSuccessfully || rolledBack) && existsSync(target.backupPath)) {
          this.cleanup.detachAndSchedule(target.backupPath);
        }
      }
    }
  }

}
