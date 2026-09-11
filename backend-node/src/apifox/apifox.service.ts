import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { RecordApifoxDto } from './dto/record-apifox.dto';
import { dataDir, apiCatalogsDir } from '../config/backend-root';

export interface ApifoxTask {
  taskId: string;
  moduleName: string;
  /** 真实 Apifox 项目名（来自 spec.info.title），用于历史列表展示 */
  projectName?: string;
  /** Apifox 项目 ID */
  apifoxProjectId?: string;
  /** 任务类型：'full' 全量生成 | 'single' 单模块生成 */
  taskType?: 'full' | 'single';
  /** 所有者用户 ID（用于隔离 history 列表） */
  ownerId?: string;
  fileNames?: string[];
  apiCount?: number;
  zipPath?: string;
  downloadUrl?: string;
  createdAt: string;
}

export interface ApiCatalogFunction {
  name: string;
  method: string;
  path: string;
  summary: string;
  tags: string[];
  params: {
    name: string;
    in: string;
    required: boolean;
    type: string;
    description: string;
    enumValues?: (string | number)[];
    example?: any;
  }[];
  hasBody: boolean;
  responsePreview: string;
}

export interface ApiCatalogModule {
  moduleName: string;
  service: string;
  functions: ApiCatalogFunction[];
}

export interface ApiCatalog {
  catalogId: string;
  apifoxProjectId: string;
  projectName?: string;
  generatedAt: string;
  zipPath: string;
  totalApiCount: number;
  totalModuleCount: number;
  modules: ApiCatalogModule[];
}

@Injectable()
export class ApifoxService {
  private readonly logger = new Logger(ApifoxService.name);
  private readonly storePath = join(dataDir, 'apifox-tasks.json');
  private readonly catalogDir = apiCatalogsDir;
  private readonly catalogIndexPath = join(apiCatalogsDir, 'index.json');

  private readTasks(): ApifoxTask[] {
    if (!existsSync(this.storePath)) return [];
    try {
      return JSON.parse(readFileSync(this.storePath, 'utf-8'));
    } catch {
      return [];
    }
  }

  private writeTasks(tasks: ApifoxTask[]): void {
    const dir = dataDir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.storePath, JSON.stringify(tasks, null, 2), 'utf-8');
  }

  recordTask(dto: RecordApifoxDto & { ownerId?: string; projectName?: string; apifoxProjectId?: string; taskType?: 'full' | 'single' }): ApifoxTask {
    const tasks = this.readTasks();
    const createdAt = new Date().toISOString();
    const idx = tasks.findIndex((t) => t.taskId === dto.taskId);
    if (idx >= 0) {
      // 保留 createdAt；其他字段以 dto 为准（含新增的 ownerId/projectName 等）
      tasks[idx] = { ...tasks[idx], ...dto, createdAt: tasks[idx].createdAt };
      this.writeTasks(tasks);
      return tasks[idx];
    }
    const task: ApifoxTask = { ...dto, createdAt };
    if (!task.downloadUrl) {
      task.downloadUrl = `/api/apifox/download?taskId=${task.taskId}`;
    }
    tasks.push(task);
    this.writeTasks(tasks);
    this.logger.log(`Apifox 任务登记: ${dto.taskId} (${dto.moduleName})`);
    return task;
  }

  /**
   * 列出当前用户的任务
   * - 传 ownerId 时：只返回该用户的任务
   * - 不传 ownerId 时：返回所有任务（兼容旧调用方/未登录场景）
   */
  listMine(ownerId?: string): ApifoxTask[] {
    const tasks = this.readTasks();
    if (!ownerId) return tasks;
    return tasks.filter((t) => t.ownerId === ownerId || !t.ownerId);
  }

  /**
   * 删除任务：删 task 条目 + zip 文件；若为 catalog（taskId 以 cat- 开头）同时删 catalog json + 更新 index
   * @param taskId  任务 ID
   * @param ownerId 当前用户 ID（用于权限校验，仅 owner 可删；旧数据无 ownerId 时允许任意登录用户删）
   */
  deleteTask(taskId: string, ownerId?: string): void {
    const tasks = this.readTasks();
    const idx = tasks.findIndex((t) => t.taskId === taskId);
    if (idx < 0) {
      throw new NotFoundException(`任务不存在: ${taskId}`);
    }
    const task = tasks[idx];

    // 权限校验：仅 owner 可删；旧数据无 ownerId 时放行
    if (ownerId && task.ownerId && task.ownerId !== ownerId) {
      throw new NotFoundException(`任务不存在: ${taskId}`);
    }

    // 1. 删 zip 文件
    if (task.zipPath && existsSync(task.zipPath)) {
      try {
        unlinkSync(task.zipPath);
      } catch (err) {
        this.logger.warn(`删除 zip 失败: ${task.zipPath} — ${(err as Error).message}`);
      }
    }

    // 2. 删除对应的 catalog json（不限 cat- 前缀，单模块也有 catalog json）
    const catalogPath = join(this.catalogDir, `${taskId}.json`);
    if (existsSync(catalogPath)) {
      try {
        unlinkSync(catalogPath);
      } catch (err) {
        this.logger.warn(`删除 catalog json 失败: ${catalogPath} — ${(err as Error).message}`);
      }
      // 同时从 catalog index 移除
      const index = this.readCatalogIndex();
      const newIndex = index.filter((c) => c.catalogId !== taskId);
      if (newIndex.length !== index.length) {
        writeFileSync(this.catalogIndexPath, JSON.stringify(newIndex, null, 2), 'utf-8');
      }
    }

    // 3. 从 tasks 列表中移除
    tasks.splice(idx, 1);
    this.writeTasks(tasks);
    this.logger.log(`Apifox 任务已删除: ${taskId}`);
  }

  /** 直接返回 ZIP 文件路径，由 controller 流式发送 */
  getZipPath(taskId: string): string {
    const task = this.readTasks().find((t) => t.taskId === taskId);
    if (!task) {
      throw new NotFoundException(`任务不存在: ${taskId}`);
    }
    const zipPath = task.zipPath;
    if (!zipPath || !existsSync(zipPath)) {
      throw new NotFoundException(`ZIP 文件不存在: ${taskId}`);
    }
    return zipPath;
  }

  // ─── API 目录持久化 ─────────────────────────────────
  saveCatalog(catalog: ApiCatalog, ownerId?: string): void {
    if (!existsSync(this.catalogDir)) mkdirSync(this.catalogDir, { recursive: true });
    // 保存完整目录
    const catalogPath = join(this.catalogDir, `${catalog.catalogId}.json`);
    writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf-8');
    // 更新索引（写入 ownerId 用于用户隔离）
    const index = this.readCatalogIndex();
    const idx = index.findIndex((c) => c.catalogId === catalog.catalogId);
    const summary: any = {
      catalogId: catalog.catalogId,
      apifoxProjectId: catalog.apifoxProjectId,
      projectName: catalog.projectName,
      generatedAt: catalog.generatedAt,
      totalApiCount: catalog.totalApiCount,
      totalModuleCount: catalog.totalModuleCount,
    };
    if (ownerId) summary.ownerId = ownerId;
    if (idx >= 0) {
      index[idx] = summary;
    } else {
      index.push(summary);
    }
    writeFileSync(this.catalogIndexPath, JSON.stringify(index, null, 2), 'utf-8');
    this.logger.log(`API 目录已保存: ${catalog.catalogId} (${catalog.totalApiCount} 个接口, ${catalog.totalModuleCount} 个模块)`);
  }

  getCatalog(catalogId: string): ApiCatalog {
    const catalogPath = join(this.catalogDir, `${catalogId}.json`);
    if (!existsSync(catalogPath)) {
      throw new NotFoundException(`API 目录不存在: ${catalogId}`);
    }
    return JSON.parse(readFileSync(catalogPath, 'utf-8'));
  }

  listCatalogs(ownerId?: string): { catalogId: string; apifoxProjectId: string; projectName?: string; generatedAt: string; totalApiCount: number; totalModuleCount: number }[] {
    const all = this.readCatalogIndex();
    if (!ownerId) return all;
    // 按 ownerId 过滤；历史无 ownerId 的记录视为公共（兼容老数据）
    return all.filter((c) => !c.ownerId || c.ownerId === ownerId);
  }

  private readCatalogIndex(): any[] {
    if (!existsSync(this.catalogIndexPath)) return [];
    try {
      return JSON.parse(readFileSync(this.catalogIndexPath, 'utf-8'));
    } catch {
      return [];
    }
  }
}
