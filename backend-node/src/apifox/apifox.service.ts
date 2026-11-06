import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { join, resolve, sep } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { RecordApifoxDto } from './dto/record-apifox.dto';
import { dataDir, apiCatalogsDir, apifoxZipsDir } from '../config/backend-root';

/**
 * 🔒 2026-11-06 治本：会参与 `join(dir, id + '.json')` 拼路径的 ID 只允许这个字符集。
 * 原实现把外部可控的 taskId/catalogId 直接拼进路径，`../../xxx` 可越出
 * api-catalogs 目录读写/删除任意 `.json`。
 */
const SAFE_ID_RE = /^[A-Za-z0-9._-]{1,120}$/;

/**
 * 🔒 平台用户 ID 的形态契约：`session.guard.ts` 写入的是 `user._id.toString()`
 * （Mongo ObjectId 的 24 位十六进制），全仓 session.userId 只有这一种形态。
 * 用途见 `normalizeOwnerId`。
 */
const OWNER_ID_RE = /^[0-9a-fA-F]{24}$/;

/**
 * 把调用方给的归属候选值收敛成「可落库的 ownerId」，非平台用户 ID 一律丢弃。
 *
 * 🔴 为什么不能盲写（2026-11-06 实锤，修 ownerId 缺陷时新引入的风险）：
 *   apifox-api-generator Skill 的 `SKILL.md` 把 `userId` 缺省值写成 `default-user`。
 *   若把它原样落进 `ownerId`，`listMine(真实userId)` 的过滤条件
 *   （`t.ownerId === ownerId || !t.ownerId`）两条都不成立 ⇒ 这条记录对**所有人
 *   （含作者）永久不可见**，比原来的「所有人可见」更坏，且完全没有报错。
 *   ⇒ 只接受形态上确实是平台用户 ID 的值；其余丢弃并保留「无 owner」旧口径。
 *
 * 只做形态判定、不查库：查库会把 recordTask 变成异步并引入 mongoose CastError
 * 分支，而形态不符的值本来就不可能是本系统的用户 ID（单一来源见上）。
 */
export function normalizeOwnerId(candidate?: unknown): string | undefined {
  if (typeof candidate !== 'string') return undefined;
  const value = candidate.trim();
  return OWNER_ID_RE.test(value) ? value : undefined;
}

/** `recordTask` 的入参（DTO 之外的内部派生字段；单一来源，避免两处各写一份交集类型） */
export type RecordTaskInput = RecordApifoxDto & {
  ownerId?: string;
  projectName?: string;
  apifoxProjectId?: string;
  taskType?: 'full' | 'single';
};

/**
 * 幂等登记的合并规则（纯函数，判据见 `apifox-owner.spec.ts`）。
 *
 * 🔴 更新分支必须「新值缺省时保留旧 ownerId」：同一 taskId 二次登记若走的是
 *   Skill 通路（不带归属）或浏览器通路之外的通路，`{ ...old, ...next }` 会把
 *   已有 ownerId 覆盖成 undefined ⇒ 一条私有记录瞬间退回「所有人可见」。
 *   这类回退没有任何报错，只能在合并处收口。
 */
export function mergeTaskRecord(
  existing: ApifoxTask | undefined,
  incoming: RecordTaskInput,
  now: string,
): ApifoxTask {
  if (existing) {
    return {
      ...existing,
      ...incoming,
      // 旧 ownerId 优先保留：只有本次明确算出归属时才覆盖
      ownerId: incoming.ownerId ?? existing.ownerId,
      createdAt: existing.createdAt,
    };
  }
  const task: ApifoxTask = { ...incoming, ownerId: incoming.ownerId, createdAt: now };
  if (!task.downloadUrl) {
    task.downloadUrl = `/api/apifox/download?taskId=${task.taskId}`;
  }
  return task;
}


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

  // ─── 🔒 安全边界（2026-11-06 治本，判据见 spec）─────────────
  // 三件事各自只有一个实现处，避免「写入侧收敛了、读取侧忘了」这类漂移：
  //   assertSafeId        —— ID 不允许路径穿越
  //   assertZipInsideDir  —— 产物文件只允许落在 apifoxZipsDir 内
  //   assertTaskOwner     —— 传了 ownerId 就只认自己的任务（旧数据无 ownerId 放行）

  private assertSafeId(id: string, label: string): void {
    if (typeof id !== 'string' || id.includes('..') || !SAFE_ID_RE.test(id)) {
      throw new BadRequestException(`${label} 格式非法`);
    }
  }

  /**
   * 把「可被 sendFile 的产物路径」收敛到唯一目录 apifoxZipsDir 之内。
   * 关键：`record` 接口的 `zipPath` 来自调用方 body 且原先原样落库，
   * `download` 又原样 `res.sendFile(task.zipPath)` —— 两者组合等于
   * 「任何人 POST 一个 zipPath:"/etc/passwd" 就能读回服务器任意文件」。
   * 只 resolve 不 realpath：目录可能被软链挂载，此处按前缀判定已足够，
   * 越权的必要条件是解析后仍在 root 之内。
   */
  private assertZipInsideDir(zipPath: string): string {
    const abs = resolve(zipPath);
    const root = resolve(apifoxZipsDir);
    if (abs !== root && !abs.startsWith(root + sep)) {
      throw new NotFoundException('产物文件不存在');
    }
    return abs;
  }

  private assertTaskOwner(task: ApifoxTask, ownerId?: string): void {
    if (ownerId && task.ownerId && task.ownerId !== ownerId) {
      throw new NotFoundException(`任务不存在: ${task.taskId}`);
    }
  }

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

  recordTask(dto: RecordTaskInput): ApifoxTask {
    this.assertSafeId(dto.taskId, 'taskId');
    // zipPath 是唯一「调用方可控 + 后续会进 sendFile」的字段，落库前先收敛。
    // 内部生成器（apifox-generator / apifox-mcp）写入的本来就在 apifoxZipsDir 内，
    // 收敛对它们零影响；只有外部伪造的越界路径会被挡下。
    const safeDto: RecordTaskInput = dto.zipPath
      ? { ...dto, zipPath: this.assertZipInsideDir(dto.zipPath) }
      : { ...dto };
    // 归属收敛：形态不是平台用户 ID 的值不落库（否则记录对所有人不可见）
    const ownerId = normalizeOwnerId(safeDto.ownerId);
    if (safeDto.ownerId && !ownerId) {
      this.logger.warn(
        `忽略非法 ownerId="${safeDto.ownerId}"（taskId=${safeDto.taskId}）：非平台用户 ID，按旧数据口径保持公共可见`,
      );
    }
    const tasks = this.readTasks();
    const idx = tasks.findIndex((t) => t.taskId === dto.taskId);
    const isNew = idx < 0;
    // 合并规则单一来源（含「不覆盖已有 ownerId」），见 mergeTaskRecord
    const task = mergeTaskRecord(isNew ? undefined : tasks[idx], { ...safeDto, ownerId }, new Date().toISOString());
    if (isNew) {
      tasks.push(task);
    } else {
      tasks[idx] = task;
    }
    this.writeTasks(tasks);
    if (isNew) {
      this.logger.log(`Apifox 任务登记: ${dto.taskId} (${dto.moduleName})`);
    }
    return task;
  }

  /**
   * 列出当前用户的任务
   * - 传 ownerId 时：只返回该用户的任务
   * - 不传 ownerId 时：返回所有任务（兼容旧调用方/未登录场景）
   *
   * 🔴 `|| !t.ownerId` 兜底是**刻意的向后兼容**，不是漏写（2026-11-06 定调）：
   *   2026-11-06 之前 Skill 通路落库的记录全都没有 ownerId（根因见 RecordApifoxDto
   *   的字段注释：whitelist 剥离）。若在这里改成严格相等，这批历史记录会对
   *   **所有人（含作者本人）**同时消失 —— 属于不可逆的可见性事故，且用户无从得知
   *   记录还在不在。所以：旧无主记录保持可见，新记录必须带 ownerId（写入侧见
   *   ApifoxController.record + normalizeOwnerId），可见性严格性靠「不再产生新无主
   *   记录」逐步收敛，而不是一次性翻脸。
   *   若确认要收紧历史数据，需先做一次性回填（把无主 task 归到具体用户）再删兜底。
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
    this.assertSafeId(taskId, 'taskId');
    const tasks = this.readTasks();
    const idx = tasks.findIndex((t) => t.taskId === taskId);
    if (idx < 0) {
      throw new NotFoundException(`任务不存在: ${taskId}`);
    }
    const task = tasks[idx];

    // 权限校验：仅 owner 可删；旧数据无 ownerId 时放行
    this.assertTaskOwner(task, ownerId);

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

  /**
   * 直接返回 ZIP 文件路径，由 controller 流式发送
   * 🔒 2026-11-06：原先只查「task 存在 + 文件存在」，既不校验 owner，
   * 也不校验 zipPath 落在哪个目录 —— 配合无守卫的 download 端点，
   * 等于「拿到任意 taskId 即可匿名下载他人产物」+「伪造 zipPath 即可匿名读任意文件」。
   * @param ownerId 当前用户（来自 SessionGuard）；旧数据无 ownerId 时放行
   */
  getZipPath(taskId: string, ownerId?: string): string {
    this.assertSafeId(taskId, 'taskId');
    const task = this.readTasks().find((t) => t.taskId === taskId);
    if (!task) {
      throw new NotFoundException(`任务不存在: ${taskId}`);
    }
    this.assertTaskOwner(task, ownerId);
    const zipPath = task.zipPath ? this.assertZipInsideDir(task.zipPath) : '';
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

  /**
   * @param ownerId 可选。传入时按 catalog index 的 ownerId 做归属校验
   * （旧数据无 ownerId 视为公共，放行）。内部调用方（api-binding / doc-analyzer /
   * workbench-tools / mcp）不传 → 行为不变；只有 HTTP 端点会传。
   */
  getCatalog(catalogId: string, ownerId?: string): ApiCatalog {
    this.assertSafeId(catalogId, 'catalogId');
    if (ownerId) {
      const entry = this.readCatalogIndex().find((c) => c.catalogId === catalogId);
      if (entry?.ownerId && entry.ownerId !== ownerId) {
        throw new NotFoundException(`API 目录不存在: ${catalogId}`);
      }
    }
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
