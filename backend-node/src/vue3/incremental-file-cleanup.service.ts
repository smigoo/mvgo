import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  existsSync,
  lstatSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { resolveFrontendWorkspace } from '../config/workspace.config';
import { vue3ComponentsDir, dataDir } from '../config/backend-root';

interface CleanupJob {
  rootPath: string;
  files: string[];
  directories: string[];
  attempts: Map<string, number>;
  prepared: boolean;
}

@Injectable()
export class IncrementalFileCleanupService implements OnModuleInit {
  private static readonly DELETE_BATCH_SIZE = 20;
  private static readonly MAX_DELETE_ATTEMPTS = 5;
  private readonly logger = new Logger(IncrementalFileCleanupService.name);
  private readonly jobs: CleanupJob[] = [];
  private draining = false;

  /**
   * 启动时恢复上一进程生命周期内遗留的增量清理任务。
   *
   * 本服务的 job 队列保存在内存中，后端进程重启（今天 PID 多次跳变）会清空待清理
   * 队列，导致被 detachAndSchedule 隔离出来的 *.cleanup-* 目录永久滞留磁盘。
   * 这里在模块初始化时扫描已知的 workspace / 事务根目录，把仍是 *.cleanup-* 的孤儿
   * 目录重新入队，使残留可自愈，无需人工巡检。
   */
  onModuleInit(): void {
    const roots = [
      vue3ComponentsDir,
      join(resolveFrontendWorkspace(), 'vue3-components'),
      join(dataDir, '.api-binding-transactions'),
    ];

    let resumed = 0;
    for (const root of roots) {
      resumed += this.scanAndResume([root]);
    }

    if (resumed > 0) {
      this.logger.log(`启动扫描恢复 ${resumed} 个遗漏的增量清理任务`);
    }
  }

  /**
   * 扫描给定根目录树下的 *.cleanup-* 目录并重新入队（假设它们已是被隔离的残留）。
   * 返回本次新入队的目录数量。
   */
  scanAndResume(roots: string[]): number {
    let resumed = 0;
    for (const root of roots) {
      if (!existsSync(root)) continue;
      for (const dir of this.collectCleanupDirs(root, 3)) {
        if (this.jobs.some((job) => job.rootPath === dir)) continue;
        this.scheduleDetached(dir);
        resumed += 1;
      }
    }
    return resumed;
  }

  private collectCleanupDirs(root: string, maxDepth: number): string[] {
    const found: string[] = [];
    const walk = (current: string, depth: number): void => {
      if (depth > maxDepth) return;
      let entries: string[];
      try {
        entries = readdirSync(current);
      } catch {
        return;
      }
      for (const name of entries) {
        const full = join(current, name);
        let stat;
        try {
          stat = lstatSync(full);
        } catch {
          continue;
        }
        if (stat.isDirectory() && !stat.isSymbolicLink()) {
          if (/\.cleanup-/.test(name)) found.push(full);
          walk(full, depth + 1);
        }
      }
    };
    walk(root, 0);
    return found;
  }


  /**
   * Atomically removes a path from its active location, then deletes its contents
   * in small event-loop batches so bulk-delete protection is never tripped.
   */
  detachAndSchedule(targetPath: string): string | null {
    if (!existsSync(targetPath)) return null;

    const detachedPath = `${targetPath}.cleanup-${process.pid}-${Date.now()}-${randomBytes(3).toString('hex')}`;
    renameSync(targetPath, detachedPath);
    this.scheduleDetached(detachedPath);
    return detachedPath;
  }

  scheduleDetached(detachedPath: string): void {
    if (!existsSync(detachedPath)) return;
    this.jobs.push({
      rootPath: detachedPath,
      files: [],
      directories: [],
      attempts: new Map<string, number>(),
      prepared: false,
    });
    this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.draining) return;
    this.draining = true;
    setTimeout(() => this.drainNextBatch(), 0);
  }

  private drainNextBatch(): void {
    const job = this.jobs[0];
    if (!job) {
      this.draining = false;
      return;
    }

    if (!job.prepared) {
      this.collectEntries(job.rootPath, job.files, job.directories);
      job.directories.sort((left, right) => right.length - left.length);
      job.prepared = true;
    }

    let operations = 0;
    const fileBatchSize = Math.min(job.files.length, IncrementalFileCleanupService.DELETE_BATCH_SIZE);
    for (let index = 0; index < fileBatchSize; index += 1) {
      const filePath = job.files.shift()!;
      try {
        unlinkSync(filePath);
        job.attempts.delete(filePath);
      } catch (error) {
        this.retryOrAbandon(job, job.files, filePath, '文件', error as Error);
      }
      operations += 1;
    }

    if (job.files.length === 0) {
      const directoryBatchSize = Math.min(
        job.directories.length,
        IncrementalFileCleanupService.DELETE_BATCH_SIZE - operations,
      );
      for (let index = 0; index < directoryBatchSize; index += 1) {
        const directoryPath = job.directories.shift()!;
        try {
          rmdirSync(directoryPath);
          job.attempts.delete(directoryPath);
        } catch (error) {
          this.retryOrAbandon(job, job.directories, directoryPath, '目录', error as Error);
        }
      }
    }

    if (job.files.length === 0 && job.directories.length === 0) {
      this.jobs.shift();
    }

    setTimeout(() => this.drainNextBatch(), 10);
  }

  private retryOrAbandon(
    job: CleanupJob,
    queue: string[],
    targetPath: string,
    targetType: '文件' | '目录',
    error: Error,
  ): void {
    const attempts = (job.attempts.get(targetPath) || 0) + 1;
    if (attempts < IncrementalFileCleanupService.MAX_DELETE_ATTEMPTS) {
      job.attempts.set(targetPath, attempts);
      queue.push(targetPath);
      this.logger.warn(`增量清理${targetType}失败，将重试 ${attempts}/${IncrementalFileCleanupService.MAX_DELETE_ATTEMPTS}: ${targetPath}; ${error.message}`);
      return;
    }

    job.attempts.delete(targetPath);
    this.logger.error(`增量清理${targetType}连续失败，停止自动重试并保留路径: ${targetPath}; ${error.message}`);
  }

  private collectEntries(rootPath: string, files: string[], directories: string[]): void {
    if (!existsSync(rootPath)) return;

    const stat = lstatSync(rootPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      files.push(rootPath);
      return;
    }

    for (const entry of readdirSync(rootPath)) {
      this.collectEntries(join(rootPath, entry), files, directories);
    }
    directories.push(rootPath);
  }
}
