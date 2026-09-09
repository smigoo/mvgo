import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { promises as fs, existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, statSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve, sep } from 'path';
import { resolveFrontendWorkspace } from '../config/workspace.config';
import { dataDir, customComponentsDir, vue3ComponentsDir, tempComponentsDir, workspaceRoot } from '../config/backend-root';
import { Component, ComponentDocument } from '../schemas/component.schema';
import { TaskQueueService } from '../queue/task-queue.service';
import type { ProgressService } from '../progress/progress.service';
import { ModuleRef } from '@nestjs/core';
import { redactSecrets } from '../common/utils/redact';
import { validateVueSfcDirectory } from '../ai-engine/utils/sfc-syntax-validation.js';
import { markSessionLocked } from '../ai-engine/utils/session-lock-registry.js';

const { ZipArchive } = require('archiver');

const MAX_IN_MEMORY = 500;
const MAX_PERSISTED = 2000;
const ZOMBIE_TIMEOUT = 2 * 60 * 60 * 1000; // 2小时

interface TaskMetadata {
  /** 任务启动时冻结的有效配置快照（去 secret 后可落盘审计） */
  configSnapshot?: Record<string, any>;
  /** workspace 业务组件号，不等同于 MongoDB _id */
  componentId?: string;
  /** 组件所属群组，Vue3 workspace 定位必需 */
  groupId?: string;
  componentName?: string;
  nodeId?: string;
  fileKey?: string;
  target?: string;
  /** 生成档位：lite | max */
  generationTier?: 'lite' | 'max';
  /** 输入来源：screenshot | figma | html */
  sourceType?: 'screenshot' | 'figma' | 'html';
  /** 生成中间产物目录，用于失败恢复和重试定位 */
  outputPath?: string;
  /** 最近完成的生成阶段，后续 checkpoint 续跑使用 */
  lastCompletedStage?: string;
  /** checkpoint 状态：none | partial | ready | invalid */
  checkpointStatus?: string;
  /** 面板类型：default-panel | model-panels | aio-panel | empty */
  panelKey?: string;
  /** 任务类型：page(页面批量) | component(单组件) | api(接口生成) | workflow(工作流) */
  taskType?: string;
  /** 父任务 sessionId（页面生成下的子组件任务用） */
  parentId?: string;
  /** 创建者 userId（数据隔离用） */
  userId?: string;
  
  // === 队列调度相关字段 ===
  /** 队列优先级（数字越大优先级越高，默认 0） */
  queuePriority?: number;
  /** 入队时间（用于计算排队等待时长） */
  enqueuedAt?: number;
  /** 配额恢复时间戳（rate_limited 状态下，预计可执行时间） */
  quotaResetAt?: number;
  /** 限流/排队原因（Phase 7 契约，用于前端展示不同文案） */
  rateLimitReason?: RateLimitReason;
  /** 幂等键（批次子任务防重复执行） */
  idempotencyKey?: string;
  /** 子任务已尝试次数（批次持久化用） */
  attemptCount?: number;
  /** 最近错误信息（批次持久化用） */
  lastError?: string;
}

/** 人工审核记录：创建者可将失败的 Vue3 任务人工判定为成功，以便继续对接接口 */
export interface HumanReviewRecord {
  /** 审核人 userId（仅创建者本人） */
  reviewedBy: string;
  /** 审核人显示名（来自 session.username，便于审计展示） */
  reviewedByName?: string;
  /** 审核动作发生时间（epoch ms） */
  reviewedAt: number;
  /** 审核前的原始状态快照（用于撤回还原） */
  previousStatus: 'failed';
  /** 审核前的原始错误快照（用于撤回还原） */
  previousError?: string;
  /** 审核结论：passed=标记为成功；warned=标记为成功但保留质量警告标记 */
  overrideStatus: 'passed' | 'warned';
  /** 审核备注（不含 secret/token/password 关键字，避免被 persist 脱敏） */
  reason?: string;
  /** 最新动作：pass=当前已审核通过；revoke=已撤回（仍保留审计记录） */
  action: 'pass' | 'revoke';
  /** 撤回动作发生时间（epoch ms） */
  revokedAt?: number;
  /** 撤回人显示名或 userId */
  revokedBy?: string;
  /** 🛡️ P2#6：半成品（partial 快照缺关键文件）审核通过标记，防静默转正 */
  partialIncomplete?: boolean;
  /** 审核时缺失的关键文件清单（partialIncomplete 为 true 时有值） */
  missingFiles?: string[];
}

export interface Task {
  sessionId: string;
  /** 任务启动时冻结的有效配置快照（已脱敏），避免运行时配置漂移 */
  configSnapshot?: Record<string, any>;
  /** workspace 业务组件号，不等同于 MongoDB _id */
  componentId: string;
  /** 组件所属群组，Vue3 workspace 定位必需 */
  groupId?: string;
  status: TaskStatus;
  startTime: number;
  endTime?: number;
  duration?: number;
  progress: any[];
  progressCount: number;
  result?: any;
  error?: string;
  buffer: any[];
  componentName: string;
  /** 组件中文显示名（早提取自 Figma 根节点名，权威值来自 declare.json componentName）。
   *  仅展示用：监控浮窗/任务中心/任务详情优先显示；retry/outputPath 等逻辑仍用 componentName。 */
  displayName?: string;
  nodeId: string;
  fileKey: string;
  target?: string; // 'microcode' | 'vue3'
  /** 生成档位：lite | max（Lite 管线产物；普通管线无此字段） */
  generationTier?: 'lite' | 'max';
  /** 输入来源：screenshot | figma | html（Lite 管线产物；普通管线可从 fileKey/nodeId 推断） */
  sourceType?: 'screenshot' | 'figma' | 'html';
  /** 设计画布逻辑尺寸，用于前端预览缩放 */
  figmaDimensions?: { width: number; height: number };
  /** 生成中间产物目录，用于失败恢复和重试定位 */
  outputPath?: string;
  /** 最近完成的生成阶段，后续 checkpoint 续跑使用 */
  lastCompletedStage?: string;
  /** checkpoint 状态：none | partial | ready | invalid */
  checkpointStatus?: string;
  /** 面板类型：default-panel | model-panels | aio-panel | empty */
  panelKey: string;
  /** 任务类型：page | component | api | workflow */
  taskType?: string;
  /** 父任务 sessionId */
  parentId?: string;
  /** 子任务 sessionId 列表（仅 page 类型有值） */
  childIds?: string[];
  /** 创建者 userId（数据隔离用） */
  userId?: string;
  /** 质量门禁语义：passed=文本、运行时与视觉均通过；warned=可运行但仍需继续优化 */
  qualityGate?: 'passed' | 'warned';
  /** P0-3: 视觉分析降级标志（视觉超时→Figma 兜底 或 完全降级），「最近生成」卡片展示用 */
  visualDegraded?: boolean;
  /** P0-3: 布局结构来源（figma=兜底重建 / degraded=完全降级 / structure-order-failed=门禁重试后仍颠倒） */
  visualLayoutSource?: string | null;
  /** P0-3: 降级原因（如 "LLM invoke timeout after 90000ms"） */
  visualDegradeReason?: string | null;
  /** 实际完成使用的模型（vision/text 各实际用了哪个，换模型重试后为最终兜底模型） */
  completionModels?: { visionModel?: string; textModel?: string } | null;
  /** 是否已具备可预览、可编辑的正式组件骨架 */
  artifactReady?: boolean;
  /** 🛡️ 渐进式就绪级别：'full' 完整骨架 / 'partial' 草稿（主组件未完）/ false 无产物 */
  artifactReadyLevel?: 'full' | 'partial' | false;
  /** 🛡️ partial 模式下尚未就绪的关键文件清单（如 ['package/index.vue']），供前端提示条 */
  missingEntryFiles?: string[];
  /** 🛡️ 脚本子段降级清单（state/lifecycle/charts 段生成失败但已降级兜底），供「不完整，可二次生成」标签 */
  degradedScriptParts?: string[];
  /** 🛡️ P1-4 坏文件隔离降级清单（子组件 SFC 编译失败被剔除，主组件与其余子组件保留），供「不完整，可二次生成」标签 */
  degradedFiles?: string[];
  /** 🛡️ #10 静默失败降级：Vue SFC 写盘门禁跳过的文件清单（已生成但未落盘），供前端展示缺失提示 */
  gateSkippedFiles?: string[];
  /** 人工审核记录：创建者将失败任务人工判定为成功后写入；action 表示最新动作 */
  humanReview?: HumanReviewRecord;
  /** 用户极速通过（运行中跳过剩余阶段）标记 */
  userApproved?: boolean;
  /** 极速通过记录 */
  approval?: SpeedPassRecord | LockSatisfiedRecord;

  // === 队列调度相关字段 ===
  /** 队列优先级（数字越大优先级越高，默认 0） */
  queuePriority?: number;
  /** 入队时间（用于计算排队等待时长） */
  enqueuedAt?: number;
  /** 配额恢复时间戳（rate_limited 状态下，预计可执行时间） */
  quotaResetAt?: number;
  /** 重试次数（retry_scheduled 状态下，已重试次数） */
  retryCount?: number;
  /** 下次重试时间（retry_scheduled 状态下） */
  nextRetryAt?: number;
  /** 限流/排队原因（Phase 7 契约，用于前端展示不同文案） */
  rateLimitReason?: RateLimitReason;
  /** 幂等键（批次子任务防重复执行） */
  idempotencyKey?: string;
  /** 子任务已尝试次数（批次持久化用） */
  attemptCount?: number;
  /** 最近错误信息（批次持久化用） */
  lastError?: string;
  /** 队列调度时绑定的执行函数（由 controller 传入，队列服务调用） */
  executeFn?: () => Promise<void>;
}

/** 极速通过（用户运行中主动跳过剩余阶段）记录 */
export interface SpeedPassRecord {
  by: 'user';
  type: 'speed-pass';
  /** 被跳过的阶段 id 列表（代码生成之后的全部阶段） */
  skippedStages: string[];
  at: number;
}

/** 锁定满意版本（运行中用户主动锁定当前快照，终止后续阶段并发布）记录 */
export interface LockSatisfiedRecord {
  by: 'user';
  type: 'lock-satisfied';
  /** 锁定时固化的代码快照 revision（无快照时为 null） */
  revision?: string | null;
  at: number;
}

/** 任务状态枚举 */
export type TaskStatus =
  | 'queued'          // 排队等待调度（配额不足或系统繁忙）
  | 'rate_limited'    // 被限流，等待配额恢复
  | 'retry_scheduled' // 已安排重试（等待重试时间）
  | 'running'         // 正在执行
  | 'paused'          // 用户暂停
  | 'completed'       // 成功完成
  | 'failed'          // 执行失败
  | 'cancelled';      // 已取消

/** 任务被限流或排队的原因（Phase 7 契约） */
export type RateLimitReason =
  | 'USER_HOURLY_QUOTA'      // 用户小时配额用完
  | 'USER_DAILY_QUOTA'       // 用户日配额用完
  | 'PLATFORM_QUEUE'         // 平台并发槽位满
  | 'PROVIDER_RATE_LIMIT';   // 供应商 API 返回 429

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private tasks: Map<string, Task> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private persistFile: string;
  private persistInFlight: Promise<void> | null = null;
  private persistAgain = false;

  /**
   * 产物就绪快照缓存（进程内）：sessionId -> { ready, level, missing, missingFiles, status, at }。
   * hasTaskArtifacts/artifactReadyLevel/missingEntryFiles/getPartialMissingFiles 内部多次
   * 同步 existsSync/读快照清单，71 任务全量 = 数百次 fs/请求（2026-09-02 实测首次冷 15.9s）。
   * - 终态任务（completed/failed/cancelled）产物已冻结 → 缓存不设 TTL，仅当 status 变化才失效；
   *   前端 15s 轮询 > 固定 TTL 10s，若每轮都过期重算则缓存形同虚设（2026-09-02 实测仍 6s/9s）。
   * - 非终态任务（running/queued…）产物随生成推进变化 → 10s TTL。
   */
  private readonly artifactCheckCache = new Map<
    string,
    {
      ready: boolean;
      level: 'full' | 'partial' | false;
      missing: string[];
      missingFiles: string[];
      status: string;
      at: number;
    }
  >();
  private static readonly ARTIFACT_CACHE_TTL_MS = 10 * 1000;

  // 队列服务引用（两个服务都是全局模块，直接注入无循环依赖）
  private queueService: TaskQueueService;

  constructor(
    @InjectModel(Component.name)
    private readonly componentModel?: Model<ComponentDocument>,
    @Optional() @Inject(forwardRef(() => TaskQueueService)) queueService?: TaskQueueService,
    private readonly moduleRef?: ModuleRef,
  ) {
    if (queueService) {
      this.queueService = queueService;
      this.logger.log('队列服务已注入，暂停/取消/恢复任务时将联动槽位调度');
    }
    // data/tasks.json
    this.persistFile = join(dataDir, 'tasks.json');

    // 启动时同步加载历史任务（改为同步，避免竞态条件）
    this.loadSync();
  }

  /**
   * NestJS 生命周期钩子：异步初始化（在服务完全启动后执行）
   */
  async onModuleInit() {
    // 僵尸任务恢复和队列清理（异步执行，不阻塞服务启动）
    await this.recoverZombieTasks();

    // 周期性垃圾回收（每5分钟）
    setInterval(() => this.gc(), 5 * 60 * 1000);

    // 定期持久化（每30秒），防止进程被 kill 时丢失最近状态
    setInterval(() => {
      if (this.tasks.size > 0) this.persist();
    }, 30 * 1000);

    // 优雅关闭：进程退出前同步持久化
    process.on('SIGTERM', () => {
      this.persist();
      process.exit(0);
    });
    process.on('SIGINT', () => {
      this.persist();
      process.exit(0);
    });
  }

  /**
   * 恢复僵尸任务：标记 running/paused 状态的任务为 failed，清理队列中的任务
   */
  private async recoverZombieTasks() {
    let zombieCount = 0;
    let recoveredCount = 0;
    for (const [, task] of this.tasks) {
      if (task.status !== 'running' && task.status !== 'paused') continue;

      // 尝试断点恢复：检查 temp-components 中是否有已生成完毕的代码
      const recovered = await this._tryRecoverTask(task);
      if (recovered) {
        recoveredCount++;
      } else {
        task.status = 'failed';
        // 🛡️ F6（2026-09-01）：已有终态 error 不覆盖——保留真实根因（如 L0-B 质量门禁失败），
        // 避免「失败已落库但 status 尚未持久化迁移」窗口被通用文案抹掉，污染 A/B 分类
        // （mc-max-1788252098143-12469472 实锤：error 被覆写成「服务重启导致任务中断」）。
        if (!task.error) {
          task.error = '服务重启导致任务中断，请重新发起生成';
        }
        if (!task.endTime) {
          task.endTime = Date.now();
        }
        zombieCount++;
      }
    }

    // 服务重启后，等待队列已清空：把磁盘上 queued 的任务重新入队恢复执行。
    // 注意：必须延迟执行，因为 Phase2Controller / Vue3Controller 的 restore executor
    // 在它们的 onModuleInit 中才注册，而 TasksService 的 onModuleInit 往往先执行。
    // 如果立即恢复，restoreExecutors 尚未注册，排队任务会被误判为"无法恢复"而标记失败。
    const queuedTasks: Task[] = [];
    for (const [, task] of this.tasks) {
      if (task.status === 'queued') queuedTasks.push(task);
    }

    if (zombieCount > 0 || recoveredCount > 0) {
      const parts: string[] = [];
      if (zombieCount > 0) parts.push(`${zombieCount} 个标记为 failed`);
      if (recoveredCount > 0) parts.push(`${recoveredCount} 个自动恢复完成`);
      console.log(`[TasksService] 僵尸任务清理: ${parts.join('，')}（服务重启恢复）`);
      this.persist();
    }

    // 延迟 3 秒恢复排队任务，确保各 target 的 restore executor 已注册完毕
    if (queuedTasks.length > 0) {
      setTimeout(async () => {
        let queuedRecovered = 0;
        let queuedCleaned = 0;
        for (const task of queuedTasks) {
          // 状态可能被其他流程改变，跳过非 queued
          if (task.status !== 'queued') continue;

          const restored = this.queueService
            ? await this.queueService.restoreQueuedTask(task)
            : false;
          if (restored) {
            queuedRecovered++;
          } else {
            task.status = 'failed';
            // 🛡️ F6：已有终态 error 不覆盖（同 recoverZombieTasks 守卫）
            if (!task.error) {
              task.error = '服务重启导致队列清空，请重新发起生成';
            }
            if (!task.endTime) {
              task.endTime = Date.now();
            }
            queuedCleaned++;
          }
        }

        if (queuedRecovered > 0 || queuedCleaned > 0) {
          console.log(
            `[TasksService] 排队任务恢复: ${queuedRecovered} 个已恢复入队，${queuedCleaned} 个已清理（服务重启恢复）`,
          );
          this.persist();
        }
      }, 3000);
    }
  }

  /**
   * 从磁盘同步加载历史任务（改为同步，避免竞态条件）
   */
  private loadSync() {
    try {
      if (!existsSync(this.persistFile)) {
        // 尝试从 .tmp 恢复
        if (existsSync(this.persistFile + '.tmp')) {
          const { renameSync } = require('fs');
          renameSync(this.persistFile + '.tmp', this.persistFile);
        } else {
          return;
        }
      }
      const { readFileSync } = require('fs');
      const raw = readFileSync(this.persistFile, 'utf-8');
      if (!raw || raw.trim() === '') {
        // 空文件：尝试从 .tmp 恢复
        if (existsSync(this.persistFile + '.tmp')) {
          const { renameSync } = require('fs');
          const tmpRaw = readFileSync(this.persistFile + '.tmp', 'utf-8');
          if (tmpRaw && tmpRaw.trim()) {
            renameSync(this.persistFile + '.tmp', this.persistFile);
            return this.loadSync();
          }
        }
        return;
      }
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return;

      for (const task of list) {
        if (!task || !task.sessionId) continue;
        // 迁移：旧任务缺少 target 字段，从 result.target 推断
        if (!task.target && task.result?.target) {
          task.target = task.result.target;
        }
        if (!task.target) task.target = 'microcode';
        // 迁移：旧任务尚未拆分任务号与业务组件号，二者按原 sessionId 兼容
        if (!task.componentId) {
          task.componentId = task.result?.componentId || task.sessionId;
        }
        if (!task.groupId && task.result?.groupId) {
          task.groupId = task.result.groupId;
        }
        // 迁移：旧任务缺少 taskType，从 sessionId 前缀推断
        if (!task.taskType) {
          // 子任务 sessionId 格式：page-{parentSessionId}-{compKey}
          // 父任务 sessionId 格式：page-{timestamp}-{hex}
          if (task.sessionId.startsWith('page-page-')) {
            // 双重 page- 前缀 = 子组件任务，尝试提取父 sessionId
            task.taskType = 'component';
            // 匹配 page-{parentSid}-{compKey}，parentSid 格式为 page-{timestamp}-{hex}
            const m = task.sessionId.match(/^page-(page-\d+-[a-f0-9]+)-.+$/);
            if (m) task.parentId = m[1];
          } else if (task.sessionId.startsWith('page-')) {
            task.taskType = 'page';
          } else {
            task.taskType = 'component';
          }
        }
        if (!task.childIds) task.childIds = [];
        // 迁移：已完成任务不得保留早期并发分支写入的失败信息
        if (task.status === 'completed' && task.error) {
          task.error = undefined;
        }
        // 迁移：旧任务缺少 panelKey
        if (!task.panelKey) task.panelKey = 'default-panel';
        this.tasks.set(task.sessionId, task);
      }

      console.log(`[TasksService] 已恢复 ${list.length} 个历史任务`);

      // 迁移后重建父子关系：遍历所有有 parentId 的任务，将它们注册到父任务的 childIds
      for (const [, task] of this.tasks) {
        if (task.parentId) {
          const parent = this.tasks.get(task.parentId);
          if (parent) {
            if (!parent.childIds) parent.childIds = [];
            if (!parent.childIds.includes(task.sessionId)) {
              parent.childIds.push(task.sessionId);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[TasksService] 加载持久化任务失败:', err.message);
    }
  }

  /**
   * 断点恢复：只接受具备正式组件骨架的中间产物
   * 微码必须同时具备 declare.json 和 package/index.vue；Vue3 必须具备 package/index.vue。
   * 恢复动作：复制到 workspace，标记任务为 completed
   */
  private hasRecoverableArtifacts(task: Task, componentDir: string, packageDir: string): boolean {
    if (task.target === 'microcode' || !task.target) {
      return this.hasMicrocodeEntryFile(componentDir);
    }
    if (task.target === 'vue3') {
      return this.hasVue3EntryFile(componentDir);
    }
    return existsSync(join(packageDir, 'index.vue')) && statSync(join(packageDir, 'index.vue')).isFile();
  }

  private async _tryRecoverTask(task: Task): Promise<boolean> {
    try {
      for (const baseTemp of this.getTempRoots()) {
        const groupDirs = task.groupId
          ? [task.groupId]
          : await fs.readdir(baseTemp).catch(() => [] as string[]);

        for (const groupId of groupDirs) {
          const componentDir = await this.findTempComponentDir(
            baseTemp,
            groupId,
            task.componentId,
          );
          if (!componentDir) continue;

          const packageDir = join(componentDir, 'package');
          if (!this.hasRecoverableArtifacts(task, componentDir, packageDir)) continue;

          const syntaxErrors = this.validateVueArtifacts(packageDir);
          if (syntaxErrors.length > 0) {
            console.warn(
              `[TasksService] 拒绝恢复不可编译产物 ${task.sessionId}: ${syntaxErrors[0]}`,
            );
            continue;
          }

          await this.restoreWorkspaceArtifacts(task, componentDir, packageDir, groupId);

          // 检查是否还有进行中的步骤（避免把 running 任务误判为 completed）
          const hasRunningStep = (task.progress || []).some(
            (p: any) => p.type === 'progress' && p.status === 'running'
          );

          if (hasRunningStep) {
            // 仍有步骤在运行：恢复产物但不改状态，让任务继续跑完
            task.groupId = groupId;
            if (!task.result) task.result = {};
            task.result.recovered = true;
            task.result.message = '服务重启后自动恢复：产物已同步，任务仍在运行中';
            console.log(
              `[TasksService] ⚠️ 断点恢复（任务仍在运行）: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`,
            );
          } else {
            // 所有步骤已完成：正常标记为 completed
            task.groupId = groupId;
            task.status = 'completed';
            task.endTime = Date.now();
            task.duration = task.endTime - task.startTime;
            task.error = undefined;
            if (!task.result) task.result = {};
            task.result.componentId = task.componentId;
            task.result.groupId = groupId;
            task.result.target = task.target;
            task.result.recovered = true;
            task.result.message = '服务重启后自动恢复：代码已在重启前生成完毕，已补完 workspace 同步';
            console.log(
              `[TasksService] ✅ 断点恢复成功: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`,
            );
          }
          return true;
        }
      }

      return false;
    } catch (err) {
      console.warn(`[TasksService] 断点恢复失败 ${task.sessionId}: ${err.message}`);
      return false;
    }
  }

  /**
   * 🔄 公开接口：手动恢复被中断的任务
   * 前端「恢复任务」按钮调用，复用 _tryRecoverTask 逻辑
   */
  recoverTask(sessionId: string, userId: string): { success: boolean; message?: string; error?: string } {
    const task = this.tasks.get(sessionId);
    if (!task) {
      return { success: false, error: '任务不存在' };
    }
    // 允许恢复 failed 或 cancelled 状态的任务
    if (task.status !== 'failed' && task.status !== 'cancelled') {
      return { success: false, error: `当前状态为 ${task.status}，仅 failed/cancelled 状态的任务可恢复` };
    }
    // 同步执行恢复（非 async，因为涉及文件 I/O）
    // 策略1：从 temp-components 中间产物恢复
    const recovered = this._tryRecoverTaskSync(task);
    if (recovered) {
      this.persist();
      return { success: true, message: '任务已恢复：中间产物已同步到 workspace' };
    }
    // 策略2：temp-components 已清理，但 workspace 中已有代码（之前部分恢复过）
    const wsRecovered = this._tryRecoverFromWorkspace(task);
    if (wsRecovered) {
      this.persist();
      return { success: true, message: '任务已恢复：workspace 中已有完整代码' };
    }
    // 策略3（🆕）：代码未生成，但 .checkpoint 有分析缓存 → 从断点续跑（跳过已完成分析阶段）
    // 动态导入 phase2.service 避免循环依赖；若续跑成功，任务会异步进入 running 继续生成
    try {
      const outputPath = task.outputPath || this._findOutputPathFromTemp(task);
      if (outputPath) {
        // 异步触发续跑（不阻塞响应；成功后任务在后台继续）
        void (async () => {
          try {
            const { loadCheckpoint } = await import('../ai-engine/utils/checkpoint-loader.js');
            const cp = loadCheckpoint(outputPath);
            if (cp.stage !== 'full' && cp.stage !== 'figma-cached') return;

            const { Phase2Service } = await import('../phase2/phase2.service.js');
            // 通过全局实例引用拿 Phase2Service（避免循环依赖）
            const phase2Service = (global as any).__phase2ServiceInstance;
            if (!phase2Service) {
              this.logger.warn(`[recoverTask] Phase2Service 实例未注册，无法续跑 ${sessionId}`);
              return;
            }
            const resumeResult = await phase2Service.resumeFromCheckpoint(sessionId, {
              componentName: task.componentName || task.sessionId,
              fileKey: task.fileKey,
              nodeId: task.nodeId,
              outputPath,
              groupId: task.groupId || '',
              userId: task.userId,
              panelType: task.panelKey || 'default-panel',
              target: task.target || 'microcode',
            });
            if (resumeResult.success) {
              // 续跑启动成功：任务状态回到 running（由 executeGeneration 异步推进）
              task.status = 'running';
              task.error = undefined;
              this.persist();
              this.logger.log(`[recoverTask] 断点续跑已启动: ${sessionId}`);
            }
          } catch (err: any) {
            this.logger.warn(`[recoverTask] 断点续跑启动失败 ${sessionId}: ${err.message}`);
          }
        })();
        return { success: true, message: '已从断点继续生成（跳过已完成的分析阶段）' };
      }
    } catch (err: any) {
      this.logger.warn(`[recoverTask] checkpoint 检测失败 ${sessionId}: ${err.message}`);
    }
    return {
      success: false,
      error: '无法恢复：未找到已生成的代码（temp-components 和 workspace 均无），请使用「重新生成」',
    };
  }

  /** 辅助：从 temp-components 推断任务输出目录（任务记录缺失 outputPath 时） */
  private _findOutputPathFromTemp(task: Task): string | null {
    try {
      for (const baseTemp of this.getTempRoots()) {
        const groupDirs = task.groupId
          ? [task.groupId]
          : readdirSync(baseTemp).filter((f) => statSync(join(baseTemp, f)).isDirectory());
        for (const groupId of groupDirs) {
          const dir = this.findTempComponentDirSync(baseTemp, groupId, task.componentId);
          if (dir) return dir;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * 同步版本的断点恢复（供 recoverTask 调用）
   */
  private _tryRecoverTaskSync(task: Task): boolean {
    try {
      for (const baseTemp of this.getTempRoots()) {
        const groupDirs = task.groupId
          ? [task.groupId]
          : readdirSync(baseTemp).filter((f) => statSync(join(baseTemp, f)).isDirectory());

        for (const groupId of groupDirs) {
          const componentDir = this.findTempComponentDirSync(
            baseTemp,
            groupId,
            task.componentId,
          );
          if (!componentDir) continue;

          const packageDir = join(componentDir, 'package');
          if (!this.hasRecoverableArtifacts(task, componentDir, packageDir)) continue;

          const syntaxErrors = this.validateVueArtifacts(packageDir);
          if (syntaxErrors.length > 0) {
            console.warn(
              `[TasksService] 拒绝手动恢复不可编译产物 ${task.sessionId}: ${syntaxErrors[0]}`,
            );
            continue;
          }

          this.restoreWorkspaceArtifactsSync(task, componentDir, packageDir, groupId);

          // 检查是否还有进行中的步骤（避免把 running 任务误判为 completed）
          const hasRunningStep = (task.progress || []).some(
            (p: any) => p.type === 'progress' && p.status === 'running'
          );

          if (hasRunningStep) {
            task.groupId = groupId;
            if (!task.result) task.result = {};
            task.result.recovered = true;
            task.result.message = '手动恢复：产物已同步，任务仍在运行中';
            console.log(
              `[TasksService] ⚠️ 手动恢复（任务仍在运行）: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`,
            );
          } else {
            task.groupId = groupId;
            task.status = 'completed';
            task.endTime = Date.now();
            task.duration = task.endTime - task.startTime;
            task.error = undefined;
            if (!task.result) task.result = {};
            task.result.componentId = task.componentId;
            task.result.groupId = groupId;
            task.result.target = task.target;
            task.result.recovered = true;
            task.result.message = '手动恢复：代码已在重启前生成完毕，已补完 workspace 同步';
            console.log(
              `[TasksService] ✅ 手动恢复成功: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`,
            );
          }
          return true;
        }
      }
      return false;
    } catch (err: any) {
      console.warn(`[TasksService] 手动恢复失败 ${task.sessionId}: ${err.message}`);
      return false;
    }
  }

  /**
   * 策略2：从 workspace 恢复（temp-components 已被清理的情况）
   * 检查 frontend/backend workspace 中是否已有该组件的 index.vue
   */
  private _tryRecoverFromWorkspace(task: Task): boolean {
    try {
      const isVue3 = task.target === 'vue3';
      const backendBase = isVue3
        ? vue3ComponentsDir
        : customComponentsDir;
      if (!existsSync(backendBase)) return false;

      const groupDirs = isVue3
        ? task.groupId
          ? [task.groupId]
          : readdirSync(backendBase).filter((f) => statSync(join(backendBase, f)).isDirectory())
        : [''];

      for (const groupId of groupDirs) {
        const componentBase = isVue3
          ? join(backendBase, groupId, task.componentId)
          : join(backendBase, task.componentId);
        const wsIndex = isVue3
          ? join(componentBase, 'package', 'index.vue')
          : join(componentBase, 'package', 'index.vue');
        if (!wsIndex || !existsSync(wsIndex)) continue;

        const syntaxErrors = this.validateVueArtifacts(join(componentBase, 'package'));
        if (syntaxErrors.length > 0) {
          console.warn(
            `[TasksService] 拒绝从 workspace 恢复不可编译产物 ${task.sessionId}: ${syntaxErrors[0]}`,
          );
          continue;
        }

        const content = readFileSync(wsIndex, 'utf8');
        if (content.includes('<template') && content.length > 200) {
          // 检查是否还有进行中的步骤（避免把 running 任务误判为 completed）
          const hasRunningStep = (task.progress || []).some(
            (p: any) => p.type === 'progress' && p.status === 'running'
          );

          if (hasRunningStep) {
            task.groupId = groupId || task.groupId;
            if (!task.result) task.result = {};
            task.result.recovered = true;
            task.result.message = '从 workspace 恢复：产物已存在，任务仍在运行中';
            console.log(
              `[TasksService] ⚠️ 从 workspace 恢复（任务仍在运行）: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`,
            );
          } else {
            task.groupId = groupId || task.groupId;
            task.status = 'completed';
            task.endTime = Date.now();
            task.duration = task.endTime - task.startTime;
            task.error = undefined;
            if (!task.result) task.result = {};
            task.result.componentId = task.componentId;
            task.result.groupId = task.groupId;
            task.result.target = task.target;
            task.result.recovered = true;
            task.result.message = '从 workspace 恢复：代码已存在于 workspace（temp-components 已清理）';
            console.log(
              `[TasksService] ✅ 从 workspace 恢复成功: ${task.sessionId} -> ${task.componentId} (${task.target}, ${groupId})`,
            );
          }

          const frontendWs = isVue3
            ? join(resolveFrontendWorkspace(), 'vue3-components', groupId, task.componentId)
            : join(resolveFrontendWorkspace(), 'custom-components', task.componentId);
          if (!existsSync(frontendWs)) {
            mkdirSync(frontendWs, { recursive: true });
            cpSync(componentBase, frontendWs, { recursive: true });
          }
          return true;
        }
      }
      return false;
    } catch (err: any) {
      console.warn(`[TasksService] workspace 恢复失败 ${task.sessionId}: ${err.message}`);
      return false;
    }
  }

  private validateVueArtifacts(packageDir: string): string[] {
    return validateVueSfcDirectory(packageDir);
  }

  private getTempRoots(): string[] {
    return [
      tempComponentsDir,
    ].filter((dir, index, all) => all.indexOf(dir) === index && existsSync(dir));
  }

  private async findTempComponentDir(
    baseTemp: string,
    groupId: string,
    componentId: string,
  ): Promise<string | null> {
    const groupDir = join(baseTemp, groupId);
    const exact = join(groupDir, componentId);
    if (existsSync(exact)) return exact;
    const entries = await fs
      .readdir(groupDir, { withFileTypes: true })
      .catch(() => [] as import('fs').Dirent[]);
    const match = entries.find(
      (entry) => entry.isDirectory() && entry.name.startsWith(`${componentId}-`),
    );
    return match ? join(groupDir, match.name) : null;
  }

  private findTempComponentDirSync(
    baseTemp: string,
    groupId: string,
    componentId: string,
  ): string | null {
    const groupDir = join(baseTemp, groupId);
    const exact = join(groupDir, componentId);
    if (existsSync(exact)) return exact;
    if (!existsSync(groupDir)) return null;
    const match = readdirSync(groupDir, { withFileTypes: true }).find(
      (entry) => entry.isDirectory() && entry.name.startsWith(`${componentId}-`),
    );
    return match ? join(groupDir, match.name) : null;
  }

  private async restoreWorkspaceArtifacts(
    task: Task,
    componentDir: string,
    packageDir: string,
    groupId: string,
  ): Promise<void> {
    const isVue3 = task.target === 'vue3';
    const targets = isVue3
      ? [
          join(vue3ComponentsDir, groupId, task.componentId),
          join(resolveFrontendWorkspace(), 'vue3-components', groupId, task.componentId),
        ]
      : [
          join(customComponentsDir, task.componentId),
          join(resolveFrontendWorkspace(), 'custom-components', task.componentId),
        ];

    for (const target of targets) {
      await fs.mkdir(target, { recursive: true });
      if (isVue3) {
        await fs.cp(packageDir, join(target, 'package'), { recursive: true });
        const resourcesDir = join(componentDir, 'resources');
        if (existsSync(resourcesDir)) {
          await fs.cp(resourcesDir, join(target, 'resources'), { recursive: true });
        }
      } else {
        await fs.cp(componentDir, target, {
          recursive: true,
          filter: (src) => !src.endsWith('index.html'),
        });
        await this.ensureMicrocodeEntry(target, componentDir);
      }
    }
  }

  private restoreWorkspaceArtifactsSync(
    task: Task,
    componentDir: string,
    packageDir: string,
    groupId: string,
  ): void {
    const isVue3 = task.target === 'vue3';
    const targets = isVue3
      ? [
          join(vue3ComponentsDir, groupId, task.componentId),
          join(resolveFrontendWorkspace(), 'vue3-components', groupId, task.componentId),
        ]
      : [
          join(customComponentsDir, task.componentId),
          join(resolveFrontendWorkspace(), 'custom-components', task.componentId),
        ];

    for (const target of targets) {
      mkdirSync(target, { recursive: true });
      if (isVue3) {
        cpSync(packageDir, join(target, 'package'), { recursive: true });
        const resourcesDir = join(componentDir, 'resources');
        if (existsSync(resourcesDir)) {
          cpSync(resourcesDir, join(target, 'resources'), { recursive: true });
        }
      } else {
        cpSync(componentDir, target, {
          recursive: true,
          filter: (src) => !src.endsWith('index.html'),
        });
        this.ensureMicrocodeEntrySync(target, componentDir);
      }
    }
  }

  private async ensureMicrocodeEntry(target: string, componentDir: string): Promise<void> {
    const styleImport = existsSync(join(componentDir, 'resources', 'styles', 'index.css'))
      ? "import './resources/styles/index.css'"
      : existsSync(join(componentDir, 'resources', 'styles', 'index.less'))
        ? "import './resources/styles/index.less'"
        : '// No CSS/LESS file found';
    await fs.writeFile(
      join(target, 'component.js'),
      `import component from './package/index.vue'\n${styleImport}\nexport default component\n`,
      'utf-8',
    );
  }

  private ensureMicrocodeEntrySync(target: string, componentDir: string): void {
    const styleImport = existsSync(join(componentDir, 'resources', 'styles', 'index.css'))
      ? "import './resources/styles/index.css'"
      : existsSync(join(componentDir, 'resources', 'styles', 'index.less'))
        ? "import './resources/styles/index.less'"
        : '// No CSS/LESS file found';
    writeFileSync(
      join(target, 'component.js'),
      `import component from './package/index.vue'\n${styleImport}\nexport default component\n`,
      'utf-8',
    );
  }


  /**
   * 持久化任务到磁盘
   */
  private persist() {
    if (this.persistInFlight) {
      this.persistAgain = true;
      return this.persistInFlight;
    }

    this.persistInFlight = this.flushPersistQueue()
      .finally(() => {
        this.persistInFlight = null;
        if (this.persistAgain) {
          this.persistAgain = false;
          this.persist();
        }
      });

    return this.persistInFlight;
  }

  private async flushPersistQueue() {
    try {
      const list = Array.from(this.tasks.values())
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, MAX_PERSISTED)
        .map((task) => redactSecrets({
          ...task,
          // 只保留最近 200 条 progress，节省空间同时保留日志/统计可用性
          progress: (task.progress || []).slice(-200),
          buffer: [],
        }));

      const dir = join(this.persistFile, '..');
      if (!existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }

      const json = JSON.stringify(list, null, 2);
      // 原子化替换：先写唯一 .tmp 再 rename，避免并发持久化互相删除临时文件。
      // 🛡️ 2026-09-02：环境 safe-delete 钩子会拦截 Node fs（曾观测 tmp 写完后、
      // rename 前被移除 → ENOENT）。write 后 access 复核，被劫走则换名重试一次。
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const tmpFile = `${this.persistFile}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
        try {
          await fs.writeFile(tmpFile, json, 'utf-8');
          await fs.access(tmpFile);
          await fs.rename(tmpFile, this.persistFile);
          return;
        } catch (err) {
          lastErr = err;
          // tmp 已消失（被外部清理）或 rename 失败：换名重试一次；最终失败落 warn
        }
      }
      throw lastErr;
    } catch (err) {
      console.warn('[TasksService] 持久化任务失败:', err.message);
    }
  }

  /**
   * 垃圾回收
   */
  private gc() {
    const now = Date.now();
    let needsPersist = false;

    // 清理僵尸任务
    for (const [sessionId, task] of this.tasks) {
      if (task.status === 'running' || task.status === 'paused') {
        const lastUpdate = task.progress.length
          ? task.progress[task.progress.length - 1].timestamp
          : task.startTime;

        if (now - lastUpdate > ZOMBIE_TIMEOUT) {
          task.status = 'failed';
          // 🛡️ F6：已有终态 error 不覆盖（同 recoverZombieTasks 守卫）
          if (!task.error) {
            task.error = '任务超时（服务可能已重启）';
          }
          if (!task.endTime) {
            task.endTime = now;
          }
          needsPersist = true;
          // 🆕 释放并发槽位：避免幽灵任务长期占用槽位，导致等待队列永不调度
          if (this.queueService) {
            void this.queueService.releaseSlot(sessionId).catch((err) => {
              console.warn(`[TasksService] 释放僵尸任务槽位失败: ${sessionId}`, err);
            });
          }
        }
      }
    }

    // 超额淘汰
    const completed = Array.from(this.tasks.entries())
      .filter(([, t]) => t.status !== 'running' && t.status !== 'paused')
      .sort((a, b) => a[1].startTime - b[1].startTime);

    if (completed.length > MAX_IN_MEMORY) {
      const removeCount = completed.length - MAX_IN_MEMORY;
      for (let i = 0; i < removeCount; i++) {
        this.tasks.delete(completed[i][0]);
      }
      needsPersist = true;
    }

    if (needsPersist) {
      this.persist();
    }
  }

  /**
   * 创建新任务
   */
  createTask(sessionId: string, metadata: TaskMetadata = {}, initialStatus?: TaskStatus) {
      const task: Task = {
      sessionId,
      configSnapshot: metadata.configSnapshot ? redactSecrets(metadata.configSnapshot) : undefined,
      componentId: metadata.componentId || sessionId,
      groupId: metadata.groupId,
      status: initialStatus || 'running',
      startTime: Date.now(),
      progress: [],
      progressCount: 0,
      result: null,
      error: undefined,
      buffer: [],
      componentName: metadata.componentName || '',
      nodeId: metadata.nodeId || '',
      fileKey: metadata.fileKey || '',
      target: metadata.target || 'microcode',
      generationTier: metadata.generationTier,
      sourceType: metadata.sourceType,
      outputPath: metadata.outputPath,
      lastCompletedStage: metadata.lastCompletedStage,
      checkpointStatus: metadata.checkpointStatus || 'none',
      panelKey: metadata.panelKey || 'default-panel',
      taskType: metadata.taskType || 'component',
      parentId: metadata.parentId,
      childIds: [],
      userId: metadata.userId,
    };

    this.tasks.set(sessionId, task);

    // 如果有 parentId，将当前任务注册到父任务的 childIds 中
    if (metadata.parentId) {
      const parent = this.tasks.get(metadata.parentId);
      if (parent) {
        if (!parent.childIds) parent.childIds = [];
        if (!parent.childIds.includes(sessionId)) {
          parent.childIds.push(sessionId);
        }
      }
    }

    this.persist();

    return task;
  }

  /**
   * 获取任务
   */
  getTask(sessionId: string): Task | undefined {
    return this.tasks.get(sessionId);
  }

  getTaskByComponentId(componentId: string): Task | undefined {
    const direct = this.tasks.get(componentId);
    if (direct?.componentId === componentId) return direct;
    return Array.from(this.tasks.values())
      .filter((task) => task.componentId === componentId)
      .sort((a, b) => b.startTime - a.startTime)[0];
  }

  /**
   * 打包失败/取消任务的现有代码，不改变任务状态。
   * 优先使用 workspace；服务中断尚未同步时回退到 outputPath/temp-components。
   */
  async packageTaskCode(sessionId: string, userId: string): Promise<{ buffer: Buffer; filename: string }> {
    const task = this.tasks.get(sessionId);
    if (!task || (task.userId && task.userId !== userId)) {
      throw new Error('任务不存在或无权访问');
    }
    if (task.status !== 'failed' && task.status !== 'cancelled') {
      throw new Error(`当前状态为 ${task.status}，仅失败或已取消任务使用此下载接口`);
    }

    const candidates: string[] = [];
    const isVue3 = task.target === 'vue3';
    if (isVue3 && task.groupId) {
      candidates.push(
        join(vue3ComponentsDir, task.groupId, task.componentId),
        join(resolveFrontendWorkspace(), 'vue3-components', task.groupId, task.componentId),
      );
    } else {
      candidates.push(
        join(customComponentsDir, task.componentId),
        join(resolveFrontendWorkspace(), 'custom-components', task.componentId),
      );
    }

    if (task.outputPath) {
      const allowedRoots = [
        ...this.getTempRoots(),
        workspaceRoot,
        resolveFrontendWorkspace(),
      ].map((root) => `${resolve(root)}${sep}`);
      const normalizedOutputPath = `${resolve(task.outputPath)}${sep}`;
      if (allowedRoots.some((root) => normalizedOutputPath.startsWith(root))) {
        candidates.push(task.outputPath);
      }
    }
    for (const baseTemp of this.getTempRoots()) {
      const groupIds = task.groupId
        ? [task.groupId]
        : readdirSync(baseTemp, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);
      for (const groupId of groupIds) {
        const tempDir = this.findTempComponentDirSync(baseTemp, groupId, task.componentId);
        if (tempDir) candidates.push(tempDir);
      }
    }

    const sourceDir = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isDirectory());
    if (!sourceDir) {
      throw new Error('未找到可下载的 workspace 或中间代码产物');
    }

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
      archive.directory(sourceDir, task.componentId);
      archive.finalize();
    });

    return { buffer, filename: `${task.componentId}-failed-code.zip` };
  }

  /**
   * 手动将失败/取消任务的现有代码发布到 workspace（供 Playground 预览）。
   * 不改变任务状态，仅复制产物到 backend + frontend workspace。
   */
  async publishToWorkspace(sessionId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const task = this.tasks.get(sessionId);
    if (!task || (task.userId && task.userId !== userId)) {
      throw new Error('任务不存在或无权访问');
    }
    if (task.status !== 'failed' && task.status !== 'cancelled') {
      throw new Error(`当前状态为 ${task.status}，仅失败或已取消任务使用此发布接口`);
    }

    // 定位产物目录（复用 packageTaskCode 的查找逻辑）
    const candidates: string[] = [];
    const isVue3 = task.target === 'vue3';
    if (isVue3 && task.groupId) {
      candidates.push(
        join(vue3ComponentsDir, task.groupId, task.componentId),
        join(resolveFrontendWorkspace(), 'vue3-components', task.groupId, task.componentId),
      );
    } else {
      candidates.push(
        join(customComponentsDir, task.componentId),
        join(resolveFrontendWorkspace(), 'custom-components', task.componentId),
      );
    }

    if (task.outputPath) {
      const allowedRoots = [
        ...this.getTempRoots(),
        workspaceRoot,
        resolveFrontendWorkspace(),
      ].map((root) => `${resolve(root)}${sep}`);
      const normalizedOutputPath = `${resolve(task.outputPath)}${sep}`;
      if (allowedRoots.some((root) => normalizedOutputPath.startsWith(root))) {
        candidates.push(task.outputPath);
      }
    }
    for (const baseTemp of this.getTempRoots()) {
      const groupIds = task.groupId
        ? [task.groupId]
        : readdirSync(baseTemp, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);
      for (const groupId of groupIds) {
        const tempDir = this.findTempComponentDirSync(baseTemp, groupId, task.componentId);
        if (tempDir) candidates.push(tempDir);
      }
    }

    // 发布目标目录（与 Phase2Service.copyToWorkspace 的双写目标一致）。
    // 必须先把它们从候选源里排除：若产物已在 workspace，再拿 workspace 当源会被 cp 成
    // 「复制给自己」→ EINVAL（反复点「强制预览」第二次必炸）。
    const targetPaths = new Set(
      isVue3 && task.groupId
        ? [
            join(vue3ComponentsDir, task.groupId, task.componentId),
            join(resolveFrontendWorkspace(), 'vue3-components', task.groupId, task.componentId),
          ]
        : [
            join(customComponentsDir, task.componentId),
            join(resolveFrontendWorkspace(), 'custom-components', task.componentId),
          ],
    );

    // 必须含 package/：copyToWorkspace 以此为产物根，只有目录存在会报「产物目录不存在: .../package」。
    const isPublishable = (dir: string) =>
      existsSync(dir) && statSync(dir).isDirectory() && existsSync(join(dir, 'package'));

    // 幂等：目标目录已有完整产物 → 无需重复复制，直接视为已发布。
    const alreadyPublished = [...targetPaths].some((dir) => isPublishable(dir));
    const sourceDir = alreadyPublished
      ? ''
      : candidates.find((candidate) => !targetPaths.has(candidate) && isPublishable(candidate));

    // 回退：temp 中间产物常被清理，但代码快照仍在 —— 直接从快照 revision 发布，
    // 保证「不管门禁是否通过，历史失败任务也能看到效果」。
    let finalSourceDir = sourceDir || '';
    let sourceNote = '';
    // 从快照发布时必须走临时副本：copyToWorkspace 会先跑 fixPackageImagePaths 就地改写
    // 资源路径，直接在快照目录上操作会污染不可变 revision（并再次造成 manifest 索引漂移）。
    let stagedDir = '';
    if (!finalSourceDir && this.moduleRef) {
      try {
        const { TaskCodeSnapshotService } = require('./task-code-snapshot.service');
        const snapshotSvc = this.moduleRef.get(TaskCodeSnapshotService, { strict: false }) as any;
        const fromSnapshot = snapshotSvc?.resolvePublishSourceDir?.(sessionId) as
          | { dir: string; revision: string }
          | null
          | undefined;
        if (fromSnapshot) {
          const snapshotDir: string = fromSnapshot.dir;
          stagedDir = join(tmpdir(), `mvgo-publish-${sessionId}-${Date.now()}`);
          cpSync(snapshotDir, stagedDir, { recursive: true });
          finalSourceDir = stagedDir;
          sourceNote = `（来源：代码快照 ${fromSnapshot.revision}）`;
        }
      } catch (err: any) {
        this.logger.warn(`[publishToWorkspace] 读取代码快照失败（非致命）：${err?.message || err}`);
      }
    }
    if (!finalSourceDir && alreadyPublished) {
      // 快照也拿不到，但 workspace 里已有完整产物：不重复复制，直接判定可预览。
      return { success: true, message: '产物已在 workspace 中，可直接在 Playground 预览' };
    }
    if (!finalSourceDir) {
      throw new Error('未找到可发布的 workspace 或中间代码产物，且该任务没有可用的代码快照');
    }

    // 调用 Phase2Service 的 copyToWorkspace（已改为 public）
    try {
      const phase2Service = (global as any).__phase2ServiceInstance;
      if (!phase2Service) {
        throw new Error('Phase2Service 实例未注册，无法发布到 workspace');
      }

      await phase2Service.copyToWorkspace(
        finalSourceDir,
        task.componentId,
        task.target || 'microcode',
        task.groupId || 'default-group',
      );

      this.logger.log(
        `[publishToWorkspace] 失败任务产物已发布到 workspace: ${sessionId} ${sourceNote} (from=${finalSourceDir})`,
      );
      return { success: true, message: `产物已发布到 workspace，可在 Playground 预览${sourceNote}` };
    } finally {
      // 临时副本用完即清：不留存中间产物，也避免污染 tmp。
      if (stagedDir) {
        try {
          rmSync(stagedDir, { recursive: true, force: true });
        } catch (err: any) {
          this.logger.warn(`[publishToWorkspace] 清理临时发布目录失败（非致命）：${err?.message || err}`);
        }
      }
    }
  }

  /**
   * 获取任务状态（精简版）
   */
  getTaskStatus(sessionId: string, userId?: string) {
    const task = this.tasks.get(sessionId);

    if (!task) {
      return {
        success: false,
        error: '任务不存在',
      };
    }

    // 数据隔离：如果提供了 userId，验证所有权
    if (userId && task.userId && task.userId !== userId) {
      return {
        success: false,
        error: '无权访问此任务',
      };
    }

    // 🛡️ P2#7 统一产物完整度：仅失败任务读 partial 缺失清单。
    const missingFiles = task.status === 'failed' ? this.getPartialMissingFiles(task) : [];
    const artifactIncomplete =
      (task.degradedScriptParts?.length || 0) +
        (task.degradedFiles?.length || 0) +
        (task.gateSkippedFiles?.length || 0) +
        missingFiles.length >
      0;

    return {
      success: true,
      task: {
        sessionId: task.sessionId,
        componentId: task.componentId,
        groupId: task.groupId,
        status: task.status,
        startTime: task.startTime,
        endTime: task.endTime,
        duration: task.duration,
        progressCount: task.progressCount,
        componentName: task.componentName,
        displayName: task.displayName, // 🏷️ 组件中文名（展示优先于 componentName）
        error: task.error,
        progress: task.progress, // 🆕 返回完整的流程历史
        result: task.result,
        // 🆕 返回 fileKey/nodeId，供前端「重试」重建 Figma URL
        fileKey: task.fileKey,
        nodeId: task.nodeId,
        target: task.target,
        panelKey: task.panelKey,
        taskType: task.taskType,
        parentId: task.parentId,
        childIds: task.childIds,
        // 🆕 档位和来源（任务详情页展示用，与 getAllTasks 对齐）
        generationTier: task.generationTier,
        sourceType: task.sourceType,
        artifactReady: this.hasTaskArtifacts(task),
        // 🆕 渐进式就绪级别（partial 草稿 vs full 完整）+ 缺失关键文件（供 Playground 入口提示）
        artifactReadyLevel: this.getArtifactReadyLevel(task),
        missingEntryFiles: this.getMissingEntryFiles(task),
        // 🛡️ 统一产物完整度（degradedScriptParts + degradedFiles + partial missingFiles 合并为单一来源）
        missingFiles: missingFiles.length > 0 ? missingFiles : undefined,
        artifactIncomplete,
        degradedScriptParts: task.degradedScriptParts?.length ? task.degradedScriptParts : undefined,
        // 🛡️ P1-4 坏文件隔离降级清单（子组件编译失败被剔除，供前端「N 个子组件生成不完整，可二次生成」）
        degradedFiles: task.degradedFiles?.length ? task.degradedFiles : undefined,
        // 🛡️ #10 静默失败降级：Vue SFC 写盘门禁跳过的文件清单，供前端展示缺失提示
        gateSkippedFiles: task.gateSkippedFiles?.length ? task.gateSkippedFiles : undefined,
        // 🆕 实际完成模型（vision/text 各实际用了哪个）+ 配置快照（任务详情页展示模型用）
        completionModels: task.completionModels,
        configSnapshot: task.configSnapshot ? redactSecrets(task.configSnapshot) : undefined,
      },
    };
  }

  /**
   * 获取所有任务（按 userId 过滤，admin 可查看全部）
   */
  /**
   * 获取当前用户的任务统计摘要
   */
  getTaskSummary(userId?: string) {
    const all = Array.from(this.tasks.values()).filter(t => {
      if (userId) return t.userId === userId;
      return true;
    });

    const total = all.length;
    let vue3 = 0;
    let microcode = 0;
    let completed = 0;
    let failed = 0;
    let running = 0;
    let queued = 0;
    let screenshot = 0;
    let figma = 0;
    let todayGenerated = 0;
    const todayStart = (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })();

    for (const t of all) {
      const target = t.target || (t.sessionId?.startsWith('mv-') ? 'vue3' : 'microcode');
      if (target === 'vue3') vue3++;
      else microcode++;

      if (t.status === 'completed') completed++;
      else if (t.status === 'failed') failed++;
      else if (t.status === 'running') running++;
      else if (t.status === 'queued') queued++;

      if ((t.startTime || 0) >= todayStart) todayGenerated++;

      const src = t.sourceType
        || (t.sessionId?.startsWith('ml-') ? 'screenshot'
          : t.sessionId?.startsWith('mv-lite-') || t.sessionId?.startsWith('mc-lite-') ? 'screenshot'
          : t.sessionId?.startsWith('mv-max-') || t.sessionId?.startsWith('mc-max-') ? 'figma'
          : t.sessionId?.startsWith('mv-') || t.sessionId?.startsWith('mc-') ? 'figma'
          : 'unknown');
      if (src === 'screenshot') screenshot++;
      else if (src === 'figma') figma++;
    }

    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      vue3,
      microcode,
      completed,
      failed,
      running,
      queued,
      screenshot,
      figma,
      todayGenerated,
      successRate,
    };
  }

  /**
   * 产物就绪快照（含缓存）：一次算齐 ready/level/missing/missingFiles 四项，
   * 替代 getAllTasks 原「3 项独立检查 + failed 任务再单独读缺失清单」的重复 fs。
   * 缓存失效规则见 artifactCheckCache 字段注释（终态冻结 / 非终态 10s TTL / status 变化强失效）。
   */
  private getArtifactSnapshot(task: Task): {
    ready: boolean;
    level: 'full' | 'partial' | false;
    missing: string[];
    missingFiles: string[];
  } {
    const sid = task.sessionId || '';
    const status = task.status || '';
    const terminal = status === 'completed' || status === 'failed' || status === 'cancelled';
    const cached = this.artifactCheckCache.get(sid);
    if (
      cached &&
      cached.status === status &&
      (terminal || Date.now() - cached.at < TasksService.ARTIFACT_CACHE_TTL_MS)
    ) {
      return {
        ready: cached.ready,
        level: cached.level,
        missing: cached.missing,
        missingFiles: cached.missingFiles,
      };
    }
    const level = this.getArtifactReadyLevel(task);
    const snapshot = {
      ready: this.hasTaskArtifacts(task),
      level,
      // missing 仅在 partial 时有意义（getMissingEntryFiles 内部会再判一次 level，partial 任务极少）
      missing: level === 'partial' ? this.getMissingEntryFiles(task) : [],
      // 🛡️ P2#7：仅失败任务读 partial 缺失清单（completed 不查，避免全量磁盘读）
      missingFiles: status === 'failed' ? this.getPartialMissingFiles(task) : [],
    };
    if (this.artifactCheckCache.size > 600) this.artifactCheckCache.clear();
    this.artifactCheckCache.set(sid, { ...snapshot, status, at: Date.now() });
    return snapshot;
  }

  /**
   * @param opts.limit 只返回最近 N 条（按 startTime 降序取前 N）。2026-09-02：limit
   *   在产物就绪检查（每任务多次同步 existsSync）**之前**截断——recent?limit=N 只需对
   *   N 个任务做 fs，不再全量 71 任务付账后再 slice（原实现实测 6s）。
   * @param opts.slim 列表瘦身（默认 true）：progress 截最近 20 条、剔除 result
   *   重负载字段（figmaNodeData/figmaStyleTree/code 等，仅详情页需要）。
   *   2026-09-02：全量响应 5.6MB（71 任务），拖慢前端轮询；瘦身实测 → KB 级。
   *   全部为浅拷贝覆盖，不污染内存中的原任务对象。
   */
  getAllTasks(userId?: string, opts?: { limit?: number; slim?: boolean }) {
    const slim = opts?.slim !== false;
    const limited = opts?.limit && opts.limit > 0 ? Math.max(1, Math.floor(opts.limit)) : 0;
    const entries = Array.from(this.tasks.entries()).filter(([, task]) => {
      // 每个用户只看自己的任务
      if (userId) return task.userId === userId;
      return true;
    });
    // 先按 startTime 降序、再截断到 limit（若有），最后才做昂贵的产物检查 map。
    entries.sort((a, b) => (b[1].startTime || 0) - (a[1].startTime || 0));
    const scoped = limited > 0 ? entries.slice(0, limited) : entries;
    return scoped.map(([, task]) => {
      const sid = task.sessionId || '';
      // 产物就绪快照走进程内缓存（终态冻结/非终态 10s TTL），内部才做 existsSync
      const snap = this.getArtifactSnapshot(task);
      const missingFiles = snap.missingFiles;
      const artifactIncomplete =
        (task.degradedScriptParts?.length || 0) +
          (task.degradedFiles?.length || 0) +
          missingFiles.length >
        0;

        const item: any = {
          ...task,
          // 兜底：旧任务可能缺少 target，从 result.target 推断
          target: task.target || task.result?.target || 'microcode',
          taskType: task.taskType || (sid.startsWith('page-') && !task.parentId ? 'page' : 'component'),
          parentId: task.parentId,
          childIds: task.childIds || [],
          // 档位和来源（前端展示用）
          generationTier: task.generationTier || undefined,
          sourceType: task.sourceType || undefined,
        // 🛡️ 统一产物完整度（degradedScriptParts + partial missingFiles 合并为单一来源）
          missingFiles: missingFiles.length > 0 ? missingFiles : undefined,
          artifactIncomplete,
        };

        // 产物就绪三件套已在 map 开头随快照一次算好（含进程内缓存），直接取用，勿再单独 fs 检查
        item.artifactReady = snap.ready;
        // 🆕 渐进式就绪级别（partial 草稿 vs full 完整）+ 缺失关键文件（供 Playground 入口提示）
        item.artifactReadyLevel = snap.level;
        item.missingEntryFiles = snap.missing;

        if (slim) {
          // 列表瘦身：progress 只留最近 20 条（列表展示足够，详情页走 status/:sessionId 全量）
          item.progress = (task.progress || []).slice(-20);
          item.buffer = [];
          if (task.result && typeof task.result === 'object') {
            const slimResult = { ...task.result };
            // 重负载字段剔除：Figma 节点树/样式树/代码产物/校验缓存，详情接口才返回
            delete slimResult.figmaNodeData;
            delete slimResult.figmaStyleTree;
            delete slimResult.code;
            delete slimResult._l0FilesForCheck;
            delete slimResult._visualParserCache;
            delete slimResult.resourceDomMapping;
            delete slimResult.layoutStructure;
            item.result = slimResult;
          }
        }

        return item;
    });
  }

  /**
   * 统计当前「活跃」（占用或等待生成槽位）的任务数。
   * 纯内存遍历，不构造响应体；供保存 AI 配置接口判断「是否有进行中的生成任务」，
   * 前端据此提示「配置修改将在下次生成/重试时生效」（不热切换正在运行的任务）。
   * 与 WorkflowMonitor 的 active 口径对齐：running/queued/rate_limited/retry_scheduled/paused。
   */
  countActiveTasks(userId?: string): number {
    let n = 0;
    for (const [, t] of this.tasks.entries()) {
      if (userId && t.userId && t.userId !== userId) continue;
      const s = t.status;
      if (
        s === 'running' ||
        s === 'queued' ||
        s === 'rate_limited' ||
        s === 'retry_scheduled' ||
        s === 'paused'
      ) {
        n++;
      }
    }
    return n;
  }

  /**
   * 获取子任务列表
   */
  getChildren(parentId: string): Task[] {
    const parent = this.tasks.get(parentId);
    if (!parent || !parent.childIds || parent.childIds.length === 0) return [];
    return parent.childIds
      .map((id) => this.tasks.get(id))
      .filter((t): t is Task => !!t);
  }

  /**
   * 获取任务树（父任务 + 子任务列表）
   */
  getTaskTree(sessionId: string, userId?: string) {
    const task = this.tasks.get(sessionId);
    if (!task) return null;
    // 数据隔离
    if (userId && task.userId && task.userId !== userId) return null;
    const children = this.getChildren(sessionId);
    return {
      ...task,
      children: children.map((c) => ({
        sessionId: c.sessionId,
        componentId: c.componentId,
        groupId: c.groupId,
        status: c.status,
        componentName: c.componentName,
        nodeId: c.nodeId,
        fileKey: c.fileKey,
        target: c.target,
        panelKey: c.panelKey,
        taskType: c.taskType,
        startTime: c.startTime,
        endTime: c.endTime,
        duration: c.duration,
        progressCount: c.progressCount,
        error: c.error,
        result: c.result,
      })),
    };
  }

  /**
   * 添加进度
   */
  addProgress(sessionId: string, progressData: any) {
    const task = this.tasks.get(sessionId);
    if (!task) return;

    // 刷新队列侧的心跳时间戳，避免正常长任务被幽灵任务健康检查误杀
    if (this.queueService && task.status === 'running') {
      this.queueService.touchRunning(sessionId);
    }

    const progressEntry = {
      ...progressData,
      timestamp: Date.now(),
    };

    task.progress.push(progressEntry);
    task.buffer.push(progressEntry);
    task.progressCount = task.progress.length;
  }

  /**
   * 清空缓冲区
   */
  clearBuffer(sessionId: string) {
    const task = this.tasks.get(sessionId);
    if (task) {
      const buffer = [...task.buffer];
      task.buffer = [];
      return buffer;
    }
    return [];
  }

  /**
   * 标记完成
   */
  completeTask(sessionId: string, result: any) {
    const task = this.tasks.get(sessionId);
    if (!task || task.status === 'cancelled') return;

    task.status = 'completed';
    task.error = undefined;
    // 最终状态契约：completed 只表示任务有产物；qualityGate 必须同时核验文本、运行时和视觉结果。
    const checkResult = result?.checkResult;
    const qScore = (checkResult?.qualityScore ?? result?.finalQualityScore ?? 0);
    const runtimePass = result?.runtimeGate?.status === 'PASS';
    const visualReport = result?.visualComparisonReport;
    const visualRequired = task.target === 'vue3' && !!task.fileKey && !!task.nodeId;
    const visualPass = !visualRequired || visualReport?.pass === true;
    const checkerPass = checkResult?.checkResult !== 'needs_revision';
    const critiques = Array.isArray(checkResult?.critiques) ? checkResult.critiques : [];
    const hasHighCritique = critiques.some((item: any) => item?.severity === 'high');
    const hasWarnings = (result?.warnings?.length || 0) > 0;
    const QUALITY_GATE_THRESHOLD = parseInt(process.env.QUALITY_GATE_THRESHOLD || '75', 10);
    const qualityGate: 'passed' | 'warned' =
      runtimePass &&
      visualPass &&
      checkerPass &&
      !hasHighCritique &&
      qScore >= QUALITY_GATE_THRESHOLD &&
      !hasWarnings
        ? 'passed'
        : 'warned';
    task.qualityGate = qualityGate;
    //  P0-3: 视觉分析降级标志（视觉超时→Figma 兜底 或 完全降级）持久化到任务，供「最近生成」卡片展示
    task.visualDegraded = result?._visualDegraded === true;
    task.visualLayoutSource = result?._visualLayoutSource || null;
    task.visualDegradeReason = result?._visualDegradeReason || null;
    //  实际完成模型（vision/text 各实际用了哪个）持久化，供任务详情页展示
    task.completionModels = result?._completionModels || null;
    // 🛡️ 脚本子段降级清单（lifecycle/charts 段生成失败但已降级兜底）持久化，供「不完整，可二次生成」标签
    task.degradedScriptParts = Array.isArray(result?.degradedScriptParts) ? result.degradedScriptParts : [];
    // 🛡️ P1-4 坏文件隔离降级清单（子组件编译失败被剔除）持久化，与 degradedScriptParts 并列计入完整度
    task.degradedFiles = Array.isArray(result?.degradedFiles) ? result.degradedFiles : [];
    // 🛡️ #10 静默失败降级：gateSkippedFiles 持久化（Vue SFC 写盘门禁跳过的文件），供前端缺失提示
    task.gateSkippedFiles = Array.isArray(result?.gateSkippedFiles) ? result.gateSkippedFiles : [];
    task.result = result;
    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;
    this.persist();
  }

  /**
   * 标记失败
   */
  failTask(sessionId: string, error: any) {
    const task = this.tasks.get(sessionId);
    if (!task || task.status === 'cancelled' || task.status === 'completed') return;

    task.status = 'failed';
    // 🆕 S1 友好提示优先：error.friendlyMessage（人话）> error.message（技术）> error
    task.error = error.friendlyMessage || error.message || error;
    // 保留经过业务侧构造的结构化诊断，任务详情/Playground 可恢复文件、行、列信息。
    if (error?.lessCompileGate || error?.runtimeGate || error?.codeValidationResult) {
      task.result = {
        ...(task.result || {}),
        ...(error.lessCompileGate ? { lessCompileGate: error.lessCompileGate } : {}),
        ...(error.runtimeGate ? { runtimeGate: error.runtimeGate } : {}),
        ...(error.codeValidationResult ? { codeValidationResult: error.codeValidationResult } : {}),
      };
    }
    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;
    this.persist();
  }

  /**
   * 终止任务
   */
  async cancelTask(sessionId: string, userId?: string) {
    const task = this.tasks.get(sessionId);

    if (!task) {
      return { success: false, message: '任务不存在' };
    }

    // 数据隔离
    if (userId && task.userId && task.userId !== userId) {
      return { success: false, message: '无权操作此任务' };
    }

    if (task.status !== 'running' && task.status !== 'paused' && task.status !== 'queued') {
      return {
        success: false,
        message: `无法终止：当前状态为「${task.status}」`,
      };
    }

    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      try {
        controller.abort();
      } catch (e) {
        console.warn('[TasksService] AbortController执行失败:', e.message);
      }
    }

    const originalStatus = task.status;
    
    task.status = 'cancelled';
    task.error = '用户主动终止';
    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;

    this.removeAbortController(sessionId);
    this.persist();

    // 释放并发槽位（仅对 running 任务释放，queued 任务不占槽位）
    if (originalStatus === 'running' && this.queueService) {
      try {
        await this.queueService.releaseSlot(sessionId);
      } catch (err: any) {
        this.logger.warn(`取消任务释放槽位失败: ${err.message}`);
      }
    }
    
    // 如果是 queued 状态，从队列中移除
    if (originalStatus === 'queued' && this.queueService) {
      this.queueService.dequeue(sessionId);
    }

    return { success: true, message: '任务已成功终止' };
  }

  /**
   * 暂停任务（仅修改状态标记，不 abort——管线节点自行检查状态）
   * 释放并发槽位，让排队中的任务可以自动顶上
   */
  async pauseTask(sessionId: string, userId?: string) {
    const task = this.tasks.get(sessionId);

    if (!task) {
      return { success: false, message: '任务不存在' };
    }

    // 数据隔离
    if (userId && task.userId && task.userId !== userId) {
      return { success: false, message: '无权操作此任务' };
    }

    if (task.status !== 'running') {
      return {
        success: false,
        message: `无法暂停：当前状态为「${task.status}」`,
      };
    }

    task.status = 'paused';
    this.persist();

    // 释放并发槽位，让排队中的任务自动顶上
    if (this.queueService) {
      try {
        await this.queueService.releaseSlot(sessionId);
      } catch (err: any) {
        this.logger.warn(`暂停任务释放槽位失败: ${err.message}`);
      }
    }

    return { success: true, message: '任务已暂停' };
  }

  /**
   * 恢复暂停的任务
   * 有可用槽位则立即恢复运行；槽位不足时保持 paused，避免生成线程等待不到 running 状态
   */
  resumeTask(sessionId: string, userId?: string) {
    const task = this.tasks.get(sessionId);

    if (!task) {
      return { success: false, message: '任务不存在' };
    }

    // 数据隔离
    if (userId && task.userId && task.userId !== userId) {
      return { success: false, message: '无权操作此任务' };
    }

    if (task.status !== 'paused') {
      return {
        success: false,
        message: `无法恢复：当前状态为「${task.status}」`,
      };
    }

    // 尝试重新注册为运行中；暂停任务已有原执行线程，不能重新入队二次启动。
    if (this.queueService && !this.queueService.tryReRegister(sessionId)) {
      return {
        success: false,
        message: '当前并发槽位已满，任务保持暂停，请等待其他任务完成后再恢复',
      };
    }

    task.status = 'running';
    this.persist();

    return {
      success: true,
      message: '任务已恢复',
    };
  }

  /**
   * 通用任务状态更新方法（Phase 7 新增）
   * 支持部分字段更新，用于排队状态、限流状态等灵活更新场景
   */
  updateTask(sessionId: string, updates: Partial<Task>): void {
    const task = this.tasks.get(sessionId);
    if (!task) return;
    
    Object.assign(task, updates);
    this.persist();
  }

  /**
   * 删除任务（级联清理组件记录与磁盘文件）
   * 删除后组件代码将不可恢复，前端需给出明确提示
   */
  async removeTask(sessionId: string, userId?: string): Promise<boolean> {
    return this.removeTaskInternal(sessionId, userId, { deleteComponentRecords: true });
  }

  /**
   * 批量删除任务（级联清理组件记录与磁盘文件）
   */
  async removeTasksBatch(sessionIds: string[], userId?: string): Promise<{
    requested: number;
    removed: string[];
    failed: Array<{ sessionId: string; reason: string }>;
  }> {
    const uniqueIds = [...new Set((sessionIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    const removed: string[] = [];
    const failed: Array<{ sessionId: string; reason: string }> = [];

    for (const sessionId of uniqueIds) {
      const ok = await this.removeTaskInternal(sessionId, userId, { deleteComponentRecords: true });
      if (ok) {
        removed.push(sessionId);
      } else {
        failed.push({ sessionId, reason: '任务不存在或无权操作' });
      }
    }

    return {
      requested: uniqueIds.length,
      removed,
      failed,
    };
  }

  /**
   * 组件删除时反向删除关联任务，避免 ComponentService 与 TasksService 互相递归。
   */
  async removeTasksByComponentId(componentId: string, userId?: string): Promise<number> {
    const matched = Array.from(this.tasks.values())
      .filter((task) => this.getTaskIdentifiers(task).includes(componentId));

    let removed = 0;
    for (const task of matched) {
      const ok = await this.removeTaskInternal(task.sessionId, userId, { deleteComponentRecords: false });
      if (ok) removed++;
    }
    return removed;
  }

  private async removeTaskInternal(
    sessionId: string,
    userId?: string,
    options: { deleteComponentRecords: boolean } = { deleteComponentRecords: true },
  ): Promise<boolean> {
    const task = this.tasks.get(sessionId);
    if (!task) return false;
    // 数据隔离
    if (userId && task.userId && task.userId !== userId) return false;

    if (task.status === 'running' || task.status === 'paused') {
      const controller = this.abortControllers.get(sessionId);
      try {
        controller?.abort();
      } catch (err) {
        console.warn(`[TasksService] 删除任务时终止执行失败: ${sessionId}`, err);
      }
      this.removeAbortController(sessionId);
    }

    if (this.queueService) {
      if (task.status === 'queued' || task.status === 'rate_limited' || task.status === 'retry_scheduled') {
        this.queueService.dequeue(sessionId);
      }
      this.queueService.unregisterExecuteFn(sessionId);
    }

    try {
      this.cleanupTaskArtifacts(task);
    } catch (err) {
      // 文件清理失败不影响任务记录删除，仅记录日志
      console.warn(`[TasksService] 清理任务文件失败: ${sessionId}`, err);
    }

    if (options.deleteComponentRecords) {
      try {
        await this.deleteComponentRecordsForTask(task, userId);
      } catch (err) {
        console.warn(`[TasksService] 清理任务关联组件记录失败: ${sessionId}`, err);
      }
    }

    if (task.parentId) {
      const parent = this.tasks.get(task.parentId);
      if (parent?.childIds) {
        parent.childIds = parent.childIds.filter((id) => id !== sessionId);
      }
    }
    if (task.childIds?.length) {
      for (const childId of [...task.childIds]) {
        await this.removeTaskInternal(childId, userId, { deleteComponentRecords: options.deleteComponentRecords });
      }
    }

    const deleted = this.tasks.delete(sessionId);
    if (deleted) this.persist();
    return deleted;
  }

  private getTaskIdentifiers(task: Task): string[] {
    return [...new Set([
      task.sessionId,
      task.componentId,
      task.result?.componentId,
      task.result?.sessionId,
    ].filter(Boolean).map(String))];
  }

  private getComponentRecordIdentifiers(component: ComponentDocument): string[] {
    return [...new Set([
      component.componentId,
      component.taskId,
      component.metadata?.componentId,
      component.metadata?.sessionId,
      component.metadata?.taskId,
    ].filter(Boolean).map(String))];
  }

  private cleanupTaskArtifacts(task: Task): number {
    const target = task.target || 'microcode';
    const ids = this.getTaskIdentifiers(task);
    const paths = new Set<string>();

    for (const id of ids) {
      for (const tempRoot of this.getTempRoots()) {
        paths.add(join(tempRoot, id));
        if (task.groupId) paths.add(join(tempRoot, task.groupId, id));
      }
    }

    if (task.outputPath && this.isAllowedGeneratedPath(task.outputPath)) {
      paths.add(task.outputPath);
    }

    if (target === 'vue3' && task.groupId) {
      for (const id of ids) {
        paths.add(join(vue3ComponentsDir, task.groupId, id));
        paths.add(join(resolveFrontendWorkspace(), 'vue3-components', task.groupId, id));
      }
    } else {
      for (const id of ids) {
        paths.add(join(customComponentsDir, id));
        paths.add(join(resolveFrontendWorkspace(), 'custom-components', id));
      }
    }

    return this.removeGeneratedPaths([...paths]);
  }

  private cleanupComponentArtifacts(component: ComponentDocument): number {
    const target = component.target || component.metadata?.target ||
      (component.metadata?.type === 'vue3' ? 'vue3' : 'microcode');
    const groupId = component.groupId?.toString() || component.metadata?.groupId;
    const ids = this.getComponentRecordIdentifiers(component);
    const paths = new Set<string>();

    if (target === 'vue3' && groupId) {
      for (const id of ids) {
        paths.add(join(vue3ComponentsDir, groupId, id));
        paths.add(join(resolveFrontendWorkspace(), 'vue3-components', groupId, id));
      }
    } else {
      for (const id of ids) {
        paths.add(join(customComponentsDir, id));
        paths.add(join(resolveFrontendWorkspace(), 'custom-components', id));
      }
    }

    return this.removeGeneratedPaths([...paths]);
  }

  private removeGeneratedPaths(paths: string[]): number {
    let removed = 0;
    const allowedRoots = [
      ...this.getTempRoots(),
      workspaceRoot,
      resolveFrontendWorkspace(),
    ].map((root) => `${resolve(root)}${sep}`);

    for (const rawPath of [...new Set(paths)]) {
      const normalized = `${resolve(rawPath)}${sep}`;
      if (!allowedRoots.some((root) => normalized.startsWith(root))) continue;
      if (!existsSync(rawPath)) continue;
      rmSync(rawPath, { recursive: true, force: true });
      removed++;
    }
    return removed;
  }

  private isAllowedGeneratedPath(rawPath: string): boolean {
    const normalized = `${resolve(rawPath)}${sep}`;
    return [
      ...this.getTempRoots(),
      workspaceRoot,
      resolveFrontendWorkspace(),
    ].map((root) => `${resolve(root)}${sep}`).some((root) => normalized.startsWith(root));
  }

  private async deleteComponentRecordsForTask(task: Task, userId?: string): Promise<number> {
    const identifiers = this.getTaskIdentifiers(task);
    const filter: any = {
      $or: [
        { componentId: { $in: identifiers } },
        { taskId: { $in: identifiers } },
        { 'metadata.componentId': { $in: identifiers } },
        { 'metadata.sessionId': { $in: identifiers } },
        { 'metadata.taskId': { $in: identifiers } },
      ],
    };
    if (userId && Types.ObjectId.isValid(userId)) {
      filter.creatorId = new Types.ObjectId(userId);
    } else if (userId) {
      filter.creatorId = userId;
    }
    if (!this.componentModel) return 0;
    const result = await this.componentModel.deleteMany(filter);
    return result.deletedCount || 0;
  }

  async removeComponentCascade(componentId: string, userId?: string): Promise<{ deletedTasks: number; deletedFiles: number }> {
    if (!this.componentModel) return { deletedTasks: 0, deletedFiles: 0 };
    const component = Types.ObjectId.isValid(componentId)
      ? await this.componentModel.findById(componentId)
      : await this.componentModel.findOne({
          $or: [
            { componentId },
            { taskId: componentId },
            { 'metadata.componentId': componentId },
            { 'metadata.sessionId': componentId },
          ],
        });
    if (!component) return { deletedTasks: 0, deletedFiles: 0 };

    const ids = this.getComponentRecordIdentifiers(component);
    const deletedFiles = this.cleanupComponentArtifacts(component);
    let deletedTasks = 0;
    for (const id of ids) {
      deletedTasks += await this.removeTasksByComponentId(id, userId);
    }
    return { deletedTasks, deletedFiles };
  }

  async cleanupOrphans(userId?: string): Promise<{
    orphanComponents: number;
    orphanTasks: number;
    deletedFiles: number;
  }> {
    if (!this.componentModel) {
      return { orphanComponents: 0, orphanTasks: 0, deletedFiles: 0 };
    }

    const componentFilter: any = {};
    if (userId && Types.ObjectId.isValid(userId)) {
      componentFilter.creatorId = new Types.ObjectId(userId);
    } else if (userId) {
      componentFilter.creatorId = userId;
    }
    const components = await this.componentModel.find(componentFilter);
    const activeTaskIds = new Set<string>();
    for (const task of this.tasks.values()) {
      for (const id of this.getTaskIdentifiers(task)) activeTaskIds.add(id);
    }

    let orphanComponents = 0;
    let orphanTasks = 0;
    let deletedFiles = 0;

    for (const component of components) {
      const ids = this.getComponentRecordIdentifiers(component);
      if (ids.length === 0 || ids.some((id) => activeTaskIds.has(id))) continue;
      deletedFiles += this.cleanupComponentArtifacts(component);
      await this.componentModel.findByIdAndDelete(component._id);
      orphanComponents++;
    }

    const componentIds = new Set<string>();
    const remainingComponents = await this.componentModel.find(componentFilter);
    for (const component of remainingComponents) {
      for (const id of this.getComponentRecordIdentifiers(component)) componentIds.add(id);
    }

    for (const task of Array.from(this.tasks.values())) {
      if (task.status === 'running' || task.status === 'paused') continue;
      if (userId && task.userId && task.userId !== userId) continue;
      const ids = this.getTaskIdentifiers(task);
      if (ids.some((id) => componentIds.has(id))) continue;
      deletedFiles += this.cleanupTaskArtifacts(task);
      this.tasks.delete(task.sessionId);
      orphanTasks++;
    }

    if (orphanTasks > 0) this.persist();
    return { orphanComponents, orphanTasks, deletedFiles };
  }

  /**
   * 批量删除过期任务（仅删除当前用户的）
   */
  removeExpiredTasks(userId?: string) {
    let removed = 0;
    for (const [sessionId, task] of this.tasks) {
      if (task.status !== 'running') {
        // 数据隔离：如果提供了 userId，只删除该用户的任务
        if (userId && task.userId && task.userId !== userId) continue;
        this.tasks.delete(sessionId);
        removed++;
      }
    }
    if (removed > 0) this.persist();
    return { removed, remaining: this.tasks.size };
  }

  /**
   * 注册AbortController
   */
  registerAbortController(sessionId: string, controller: AbortController) {
    this.abortControllers.set(sessionId, controller);
  }

  /**
   * 移除AbortController
   */
  removeAbortController(sessionId: string) {
    this.abortControllers.delete(sessionId);
  }

  /**
   * 🆕 极速通过：运行中跳过剩余阶段，直接标记任务完成
   * 用户在「代码生成」阶段完成后点击「跳过剩余阶段」触发。
   * 终止后续 LLM 调用（abort），并广播 complete 事件让前端进入成功态。
   */
  async speedPassTask(sessionId: string, userId?: string) {
    const task = this.tasks.get(sessionId);
    if (!task) {
      return { success: false, message: '任务不存在' };
    }
    // 数据隔离
    if (userId && task.userId && task.userId !== userId) {
      return { success: false, message: '无权操作此任务' };
    }
    if (task.status !== 'running' && task.status !== 'paused') {
      return {
        success: false,
        message: `无法极速通过：当前状态为「${task.status}」`,
      };
    }

    const skippedStages = [
      'code-structure-validator',
      'parallel-refine',
      'refine-feedback',
      'adversarial-checker',
      'revision-decision',
    ];

    // 标记用户已批准：编排器 finally 据此跳过失败广播，避免覆盖本次完成态
    task.userApproved = true;
    task.approval = {
      by: 'user',
      type: 'speed-pass',
      skippedStages,
      at: Date.now(),
    };

    // 终止后续阶段（省 token），正在运行的 LLM 调用会抛 CanceledError
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      try {
        controller.abort();
      } catch (e: any) {
        this.logger.warn(`[TasksService] 极速通过 abort 失败: ${e?.message}`);
      }
    }
    this.removeAbortController(sessionId);

    // 懒加载 ProgressService（避免与 ProgressService→TasksService 的循环依赖）
    // 用 require 运行时取值，避免顶部对 progress.service 的值导入造成模块级循环依赖
    const ProgressSvc = require('../progress/progress.service').ProgressService;
    const progressService = this.moduleRef?.get<ProgressService>(ProgressSvc, { strict: false });
    if (progressService) {
      await progressService.sendComplete(sessionId, {
        success: true,
        completedBy: 'user',
        userApproved: true,
        approvalType: 'speed-pass',
        skippedStages,
        outputPath: task.outputPath,
        target: task.target,
        taskId: sessionId,
        componentId: sessionId,
        groupId: task.groupId,
      });
    }

    // sendComplete 内部 completeTask 已设 status=completed；补持久化 approval 标记
    task.userApproved = true;
    task.approval = {
      by: 'user',
      type: 'speed-pass',
      skippedStages,
      at: task.approval?.at || Date.now(),
    };
    this.persist();

    return { success: true, message: '已极速通过，跳过剩余阶段', skippedStages };
  }

  /**
   * 🛡️ 修复 2.1（锁定终态，2026-09-02）：用户对中途效果满意，点「满意，锁定此版本」。
   * 把当前候选快照（candidate → partial → last-good 第一个含 package/index.vue 的 revision）
   * 发布到 workspace，标记会话锁（engineer 后续覆写/落盘被跳过），并终止任务（abort + sendComplete）。
   *
   * 与 speed-pass 的区别：speed-pass 只跳过剩余阶段、不保证产物=当前满意快照；
   * 本方法先「固化当前版本到 workspace」，再锁定 + 终止，避免后续全局重生成/覆写改坏已满意产物。
   */
  async lockTask(sessionId: string, userId?: string, revision?: string) {
    const task = this.tasks.get(sessionId);
    if (!task) {
      return { success: false, message: '任务不存在' };
    }
    if (userId && task.userId && task.userId !== userId) {
      return { success: false, message: '无权操作此任务' };
    }
    if (task.status !== 'running' && task.status !== 'paused') {
      return {
        success: false,
        message: `无法锁定：当前状态为「${task.status}」`,
      };
    }

    // 1. 从代码快照固化当前满意版本到 workspace（不改变任务状态，仅复制产物）
    let publishMsg = '';
    let lockedRevision = '';
    try {
      const { TaskCodeSnapshotService } = require('./task-code-snapshot.service');
      const snapshotSvc = this.moduleRef?.get(TaskCodeSnapshotService, { strict: false }) as any;
      const fromSnapshot = snapshotSvc?.resolvePublishSourceDir?.(sessionId) as
        | { dir: string; revision: string }
        | null
        | undefined;
      if (fromSnapshot) {
        // 从快照发布必须走临时副本：copyToWorkspace 会就地改写资源路径，直接操作会污染不可变 revision
        const stagedDir = join(tmpdir(), `mvgo-lock-${sessionId}-${Date.now()}`);
        cpSync(fromSnapshot.dir, stagedDir, { recursive: true });
        const phase2Service = (global as any).__phase2ServiceInstance;
        if (phase2Service) {
          await phase2Service.copyToWorkspace(
            stagedDir,
            task.componentId,
            task.target || 'microcode',
            task.groupId || 'default-group',
          );
          lockedRevision = fromSnapshot.revision;
          publishMsg = `（来源：代码快照 ${fromSnapshot.revision}）`;
        } else {
          this.logger.warn('[lockTask] Phase2Service 实例未注册，无法发布到 workspace');
        }
        try {
          rmSync(stagedDir, { recursive: true, force: true });
        } catch (e: any) {
          this.logger.warn(`[lockTask] 清理临时发布目录失败（非致命）：${e?.message || e}`);
        }
      } else {
        this.logger.warn('[lockTask] 未找到可用代码快照，仅标记锁定不强制发布');
      }
    } catch (err: any) {
      this.logger.warn(`[lockTask] 发布快照失败（非致命）：${err?.message || err}`);
    }

    // 2. 标记会话锁：engineer 在覆写/终态落盘前检查 isSessionLocked → 跳过写盘，保留已发布好版本
    markSessionLocked(sessionId);

    // 3. 终止后续阶段 + 广播完成（复用 speed-pass 的 abort/sendComplete 链路）
    task.userApproved = true;
    task.approval = {
      by: 'user',
      type: 'lock-satisfied',
      revision: lockedRevision || revision || null,
      at: Date.now(),
    };

    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      try {
        controller.abort();
      } catch (e: any) {
        this.logger.warn(`[lockTask] abort 失败: ${e?.message}`);
      }
    }
    this.removeAbortController(sessionId);

    const ProgressSvc = require('../progress/progress.service').ProgressService;
    const progressService = this.moduleRef?.get<ProgressService>(ProgressSvc, { strict: false });
    if (progressService) {
      await progressService.sendComplete(sessionId, {
        success: true,
        completedBy: 'user',
        userApproved: true,
        approvalType: 'lock-satisfied',
        skippedStages: [],
        outputPath: task.outputPath,
        target: task.target,
        taskId: sessionId,
        componentId: sessionId,
        groupId: task.groupId,
      });
    }

    task.userApproved = true;
    this.persist();

    return {
      success: true,
      message: `已锁定当前版本并发布到 workspace${publishMsg}`,
      revision: lockedRevision || revision || null,
    };
  }

  /**
   * 🆕 获取失败任务的可重试元数据
   * 用于「重新配置后重试」——提取 fileKey/nodeId/componentName/outputPath 等参数
   */
  getRetryMetadata(sessionId: string, userId?: string) {
    const task = this.tasks.get(sessionId);
    if (!task) return null;

    // 数据隔离
    if (userId && task.userId && task.userId !== userId) return null;

    // 只允许 failed/cancelled 状态重试
    if (task.status !== 'failed' && task.status !== 'cancelled') {
      return { error: `任务状态为「${task.status}」，无法重试（仅失败/已取消任务可重试）` };
    }

    return {
      sessionId: task.sessionId,
      componentId: task.componentId,
      groupId: task.groupId,
      fileKey: task.fileKey,
      nodeId: task.nodeId,
      componentName: task.componentName,
      target: task.target,
      panelKey: task.panelKey,
      taskType: task.taskType,
      parentId: task.parentId,
      outputPath: task.outputPath || task.result?.outputPath || null,
      lastCompletedStage: task.lastCompletedStage || task.result?.lastCompletedStage || null,
      checkpointStatus: task.checkpointStatus || 'none',
      // 保留原错误信息供前端展示
      originalError: task.error,
      originalDuration: task.duration,
    };
  }

  /**
   * 🆕 标记任务为「重试中」（创建新的重试会话）
   * 不改变原任务状态，新建一个 running 任务，记录关联
   */
  createRetryTask(sessionId: string, retrySessionId: string, userId?: string) {
    const task = this.tasks.get(sessionId);
    if (!task) return null;

    // 数据隔离
    if (userId && task.userId && task.userId !== userId) return null;

    const retryTask: Task = {
      sessionId: retrySessionId,
      configSnapshot: task.configSnapshot ? redactSecrets(task.configSnapshot) : undefined,
      componentId: task.componentId,
      groupId: task.groupId,
      status: 'running',
      startTime: Date.now(),
      progress: [],
      progressCount: 0,
      result: null,
      error: undefined,
      buffer: [],
      componentName: task.componentName,
      nodeId: task.nodeId,
      fileKey: task.fileKey,
      target: task.target || 'microcode',
      outputPath: task.outputPath,
      lastCompletedStage: task.lastCompletedStage,
      checkpointStatus: task.checkpointStatus || 'none',
      panelKey: task.panelKey || 'default-panel',
      taskType: task.taskType || 'component',
      parentId: task.parentId,
      childIds: [],
      userId: userId || task.userId,
    };

    this.tasks.set(retrySessionId, retryTask);
    this.persist();
    return retryTask;
  }

  /**
   * 🆕 S1 断点续跑重试：失败/取消任务重试时，优先复用旧 outputPath 的 checkpoint 缓存，
   * 跳过已完成的 Figma 拉取/资源下载/视觉分析，换模型只重跑失败阶段。
   * 未命中 checkpoint → 返回元数据，前端走全量重新生成。
   */
  async retryWithResume(
    sessionId: string,
    userId?: string,
    config?: { model?: string; endpoint?: string; apiKey?: string },
  ) {
    const task = this.tasks.get(sessionId);
    if (!task) return { success: false, error: '任务不存在或无权访问' };
    if (userId && task.userId && task.userId !== userId) {
      return { success: false, error: '无权访问此任务' };
    }
    if (task.status !== 'failed' && task.status !== 'cancelled') {
      return { success: false, error: `任务状态为「${task.status}」，无法重试（仅失败/已取消任务可重试）` };
    }

    // 换模型配置（可选）：写入环境变量，由 provider 池 / 配置解析在续跑时生效
    if (config?.apiKey) process.env.MC_GEN_TEXT_API_KEY = config.apiKey;
    if (config?.endpoint) process.env.MC_GEN_TEXT_ENDPOINT = config.endpoint;
    if (config?.model) process.env.MC_GEN_TEXT_MODEL = config.model;

    // 断点续跑：outputPath 下有 figma/visual/analysis checkpoint → 复用缓存续跑
    const outputPath = task.outputPath || this._findOutputPathFromTemp(task);
    if (outputPath) {
      try {
        const { loadCheckpoint } = await import('../ai-engine/utils/checkpoint-loader.js');
        const cp = loadCheckpoint(outputPath);
        if (cp.stage === 'figma-cached' || cp.stage === 'full') {
          const phase2Service = (global as any).__phase2ServiceInstance;
          if (!phase2Service) {
            return { success: false, error: '生成服务未就绪，无法续跑' };
          }
          // 🛡️ P1-3：任务级 retry 注入上轮失败指导（解析 task.error → 工程师 prompt，重试不再是掷骰子）
          const failureGuidance = this.buildFailureGuidance(task.error);
          if (failureGuidance) {
            this.logger.log(`[retryWithResume] P1-3 注入上轮失败指导: ${sessionId}`);
          }
          const resumeResult = await phase2Service.resumeFromCheckpoint(sessionId, {
            componentName: task.componentName || task.sessionId,
            fileKey: task.fileKey,
            nodeId: task.nodeId,
            outputPath,
            groupId: task.groupId || '',
            userId: task.userId || userId,
            panelType: task.panelKey || 'default-panel',
            target: task.target || 'microcode',
            failureGuidance,
          });
          if (resumeResult.success) {
            // 续跑异步执行中，任务状态回到 running（resumeFromCheckpoint 内部不负责状态回写）
            this.updateTask(sessionId, { status: 'running', error: undefined });
            return {
              success: true,
              resumed: true,
              stage: cp.stage,
              message: cp.stage === 'full'
                ? '已复用缓存续跑（跳过 Figma/视觉分析，从代码生成继续）'
                : '已复用设计稿缓存续跑（换模型重跑视觉分析）',
            };
          }
          return { success: false, error: resumeResult.error || '断点续跑启动失败' };
        }
      } catch (err: any) {
        this.logger.warn(`[retryWithResume] checkpoint 检测失败: ${err.message}`);
      }
    }

    // 未命中缓存 → 返回元数据，前端全量重新生成
    const meta = this.getRetryMetadata(sessionId, userId);
    return {
      success: true,
      resumed: false,
      meta,
      message: '未检测到可复用缓存，请重新发起生成',
    };
  }

  /**
   * 🛡️ P1-3：从上轮任务失败信息构建确定性重试指导（注入新一轮 engineer prompt）。
   * 覆盖两类高频失败：L0-B 资源未使用（提取变量名清单）、LESS 未定义变量。
   */
  private buildFailureGuidance(error?: string): string | undefined {
    if (!error || typeof error !== 'string' || error.trim().length === 0) return undefined;
    const lines: string[] = [];

    // 1) L0-B 资源未使用：`背景资源 bg2（bg，bg区域）未被任何组件代码引用`
    const unusedRes = [...error.matchAll(/(?:背景|图标|图片)资源\s+(\w+)\s*[（(]/g)].map((m) => m[1]);
    if (/资源未使用/.test(error) && unusedRes.length > 0) {
      const uniq = [...new Set(unusedRes)];
      lines.push(
        `- 上轮有 ${uniq.length} 个资源未被引用（${uniq.join('、')}）：这些 bg/icon 变量必须在对应区域容器的 :style（backgroundImage）或 <img :src> 中真实使用，禁止只声明不引用。`,
      );
    }

    // 2) LESS 未定义变量：`variable @card-bg-device is undefined`
    const undefinedVars = [...error.matchAll(/variable\s+(@[\w-]+)\s+is\s+undefined/g)].map((m) => m[1]);
    if (undefinedVars.length > 0) {
      const uniq = [...new Set(undefinedVars)];
      lines.push(
        `- 上轮子组件引用了未定义的 less 变量（${uniq.join('、')}）：本轮 theme-vars.less 必须定义这些变量，或子组件不得引用它们。`,
      );
    }

    if (lines.length === 0) return undefined;
    return `\n\n# 🟡 上轮任务失败指导（任务级重试注入，本轮务必修正）\n\n${lines.join('\n')}\n`;
  }

  private hasVue3Artifacts(task: Task): boolean {
    if ((task.target || 'microcode') !== 'vue3') return false;

    const candidates: string[] = [];
    const componentId = task.componentId || task.sessionId;

    if (task.groupId) {
      candidates.push(
        join(vue3ComponentsDir, task.groupId, componentId),
        join(resolveFrontendWorkspace(), 'vue3-components', task.groupId, componentId),
      );
    }

    if (task.outputPath) {
      const allowedRoots = [
        ...this.getTempRoots(),
        workspaceRoot,
        resolveFrontendWorkspace(),
      ].map((root) => `${resolve(root)}${sep}`);
      const normalizedOutputPath = `${resolve(task.outputPath)}${sep}`;
      if (allowedRoots.some((root) => normalizedOutputPath.startsWith(root))) {
        candidates.push(task.outputPath);
      }
    }

    for (const baseTemp of this.getTempRoots()) {
      const groupIds = task.groupId
        ? [task.groupId]
        : readdirSync(baseTemp, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);
      for (const groupId of groupIds) {
        const tempDir = this.findTempComponentDirSync(baseTemp, groupId, componentId);
        if (tempDir) candidates.push(tempDir);
      }
    }

    return candidates.some((candidate) => this.hasVue3EntryFile(candidate));
  }

  private hasVue3EntryFile(componentDir: string): boolean {
    if (!componentDir || !existsSync(componentDir) || !statSync(componentDir).isDirectory()) {
      return false;
    }
    return existsSync(join(componentDir, 'package', 'index.vue')) &&
      statSync(join(componentDir, 'package', 'index.vue')).isFile();
  }

  /**
   * 统一产物检查：根据 task.target 分发到对应检查方法。
   * 🛡️ 半成品抢救（2026-08-26）：磁盘 workspace 无产物时，追加 partial 快照兜底，
   * 使「生成过程失败但已落半成品快照」的任务也能预览、进 PG 手动补全（而非 fail-closed 无产物）。
   * 🛡️ 渐进式就绪（2026-08-27）：微码新增 hasPartialMicrocodeArtifacts——生成较早落盘子组件即可进 PG，
   * 不再被「主组件 index.vue 必须已写完」卡住（解决「有产物但进不去 Playground」痛点）。
   */
  private hasTaskArtifacts(task: Task): boolean {
    const target = task.target || 'microcode';
    if (target === 'vue3') return this.hasVue3Artifacts(task) || this.hasPartialSnapshotArtifacts(task);
    if (target === 'microcode') return this.hasMicrocodeArtifacts(task) || this.hasPartialMicrocodeArtifacts(task) || this.hasPartialSnapshotArtifacts(task);
    return this.hasPartialSnapshotArtifacts(task);
  }

  /**
   * 渐进式产物检查（微码）：生成中途子组件先落盘、主组件 index.vue 尚未写完时，
   * 只要具备 declare.json + ≥1 个 .vue 文件即视为「部分就绪」，可进 Playground 预览/编辑子组件。
   * 与 hasMicrocodeEntryFile（要求 declare.json + package/index.vue 同时存在）相比，放宽主组件硬约束。
   */
  private hasPartialMicrocodeArtifacts(task: Task): boolean {
    const componentId = task.componentId || task.sessionId;
    const candidates: string[] = [
      join(customComponentsDir, componentId),
      join(resolveFrontendWorkspace(), 'custom-components', componentId),
    ];
    if (task.outputPath) {
      const allowedRoots = [
        ...this.getTempRoots(),
        workspaceRoot,
        resolveFrontendWorkspace(),
      ].map((root) => `${resolve(root)}${sep}`);
      const normalizedOutputPath = `${resolve(task.outputPath)}${sep}`;
      if (allowedRoots.some((root) => normalizedOutputPath.startsWith(root))) {
        candidates.push(task.outputPath);
      }
    }
    return candidates.some((candidate) => this.hasPartialMicrocodeEntry(candidate));
  }

  /** 递归判断目录内是否存在 declare.json + 任意 .vue 文件（用于渐进式就绪判定） */
  private hasPartialMicrocodeEntry(componentDir: string): boolean {
    if (!componentDir || !existsSync(componentDir) || !statSync(componentDir).isDirectory()) return false;
    if (!(existsSync(join(componentDir, 'declare.json')) && statSync(join(componentDir, 'declare.json')).isFile())) return false;
    const walk = (dir: string): boolean => {
      let entries: any[];
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return false; }
      for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (walk(p)) return true; }
        else if (e.isFile() && e.name.endsWith('.vue')) return true;
      }
      return false;
    };
    return walk(componentDir);
  }

  /**
   * 产物就绪级别（供前端区分「部分草稿」vs「完整产物」并展示不同提示）：
   * - 'full'：完整可运行骨架（微码 declare.json + package/index.vue；vue3 package/index.vue）
   * - 'partial'：渐进式草稿（有 declare.json + 部分 .vue，但主组件 index.vue 尚未落盘/生成进行中）
   * - false：无产物
   */
  getArtifactReadyLevel(task: Task): 'full' | 'partial' | false {
    const target = task.target || 'microcode';
    if (target === 'vue3') {
      return this.hasVue3Artifacts(task) ? 'full' : (this.hasPartialSnapshotArtifacts(task) ? 'partial' : false);
    }
    if (this.hasMicrocodeArtifacts(task)) return 'full';
    if (this.hasPartialMicrocodeArtifacts(task)) return 'partial';
    if (this.hasPartialSnapshotArtifacts(task)) return 'partial';
    return false;
  }

  /**
   * partial 模式下尚未就绪的关键文件清单（供前端提示条）。
   * 主组件 index.vue 仍未落盘 → ['package/index.vue']；否则空。
   */
  getMissingEntryFiles(task: Task): string[] {
    if (this.getArtifactReadyLevel(task) !== 'partial') return [];
    const componentId = task.componentId || task.sessionId;
    const candidates: string[] = [
      join(customComponentsDir, componentId),
      join(resolveFrontendWorkspace(), 'custom-components', componentId),
    ];
    if (task.outputPath) candidates.push(task.outputPath);
    for (const c of candidates) {
      if (c && existsSync(join(c, 'package', 'index.vue'))) return [];
    }
    return ['package/index.vue'];
  }

  /**
   * partial 快照兜底：失败任务在语义/结构拦截前已提交完整 allFiles 候选快照并 markPartial，
   * 磁盘 workspace 因校验在写盘前 throw 而缺产物，但快照内有完整代码文件。
   * 判定标准与 hasMicrocodeEntryFile 对齐：至少具备 declare.json + package/index.vue。
   */
  private hasPartialSnapshotArtifacts(task: Task): boolean {
    const sessionId = task.sessionId;
    if (!sessionId || !this.moduleRef) return false;
    try {
      // 懒加载 TaskCodeSnapshotService（避免与 TasksService→快照服务 的循环依赖）
      const { TaskCodeSnapshotService } = require('./task-code-snapshot.service');
      const snapshotSvc = this.moduleRef.get(TaskCodeSnapshotService, { strict: false }) as any;
      const partial = snapshotSvc?.getPartialManifest?.(sessionId);
      if (!partial) return false;
      const paths = new Set((partial.files || []).map((f: any) => f.path));
      return paths.has('declare.json') && paths.has('package/index.vue');
    } catch {
      return false;
    }
  }

  /**
   * 🛡️ P2#6：获取 partial 快照的缺失关键文件清单（供人工审核「不完整」标记）。
   * 仅当存在 partial 快照且 missingFiles 非空时返回；无 partial 或缺失清单为空返回 []。
   */
  private getPartialMissingFiles(task: Task): string[] {
    const sessionId = task.sessionId;
    if (!sessionId || !this.moduleRef) return [];
    try {
      const { TaskCodeSnapshotService } = require('./task-code-snapshot.service');
      const snapshotSvc = this.moduleRef.get(TaskCodeSnapshotService, { strict: false }) as any;
      const partial = snapshotSvc?.getPartialManifest?.(sessionId);
      if (!partial || partial.status !== 'partial') return [];
      return Array.isArray(partial.missingFiles) ? partial.missingFiles : [];
    } catch {
      return [];
    }
  }

  /**
   * 检查微码组件任务是否有真实产物
   * 微码产物位于 workspace/custom-components/{componentId}/
   * 关键文件: component.js, declare.json, package/index.vue 等
   */
  private hasMicrocodeArtifacts(task: Task): boolean {
    const componentId = task.componentId || task.sessionId;
    const candidates: string[] = [];

    // workspace/custom-components/{componentId}
    candidates.push(
      join(customComponentsDir, componentId),
      join(resolveFrontendWorkspace(), 'custom-components', componentId),
    );

    // outputPath（如果在 custom-components 路径下）
    if (task.outputPath) {
      const allowedRoots = [
        ...this.getTempRoots(),
        workspaceRoot,
        resolveFrontendWorkspace(),
      ].map((root) => `${resolve(root)}${sep}`);
      const normalizedOutputPath = `${resolve(task.outputPath)}${sep}`;
      if (allowedRoots.some((root) => normalizedOutputPath.startsWith(root))) {
        candidates.push(task.outputPath);
      }
    }

    return candidates.some((candidate) => this.hasMicrocodeEntryFile(candidate));
  }

  private hasMicrocodeEntryFile(componentDir: string): boolean {
    if (!componentDir || !existsSync(componentDir) || !statSync(componentDir).isDirectory()) {
      return false;
    }
    // 可预览的微码组件必须同时具备声明和 Vue 入口；图片、缓存分块或单个 component.js 均不算正式产物。
    return [
      join(componentDir, 'declare.json'),
      join(componentDir, 'package', 'index.vue'),
    ].every((entry) => existsSync(entry) && statSync(entry).isFile());
  }

  /**
   * ✅ 人工审核：任务创建者把失败的任务（Vue3/微码）判定为通过
   * - 严格归属校验（仅创建者本人）
   * - 必须 target=vue3|microcode 且 status=failed
   * - 必须有真实产物
   * - 快照 previousStatus/previousError，供撤回还原
   * - 状态变更：failed → completed
   */
  submitHumanReview(params: {
    sessionId: string;
    userId: string;
    overrideStatus: 'passed' | 'warned';
    reviewerName?: string;
    comment?: string;
  }) {
    const { sessionId, userId, overrideStatus, reviewerName, comment } = params;

    const task = this.tasks.get(sessionId);
    if (!task) {
      return { success: false, message: '任务不存在' };
    }

    // 1. 严格归属：创建者本人
    if (!task.userId || task.userId !== userId) {
      return { success: false, message: '仅任务创建者可进行人工审核' };
    }

    // 2. 仅 Vue3 组件任务 或 微码组件任务
    const supportedTargets = ['vue3', 'microcode'];
    if (!supportedTargets.includes(task.target || 'microcode')) {
      return { success: false, message: '仅 Vue3 组件或微码组件任务支持人工审核' };
    }

    // 3. 仅 failed 状态
    if (task.status !== 'failed') {
      return { success: false, message: `当前状态为「${task.status}」，仅失败任务可审核` };
    }

    // 4. 必须有真实产物
    if (!this.hasTaskArtifacts(task)) {
      return { success: false, message: '未检测到组件产物，无法审核通过' };
    }

    // 🛡️ P2#6：半成品（partial 缺关键文件）审核通过时带「不完整」标记，防静默转正。
    const partialMissing = this.getPartialMissingFiles(task);

    // 5. 快照并变更状态
    task.humanReview = {
      reviewedBy: userId,
      reviewedByName: reviewerName || userId,
      reviewedAt: Date.now(),
      overrideStatus,
      reason: comment || undefined,
      previousStatus: 'failed',
      previousError: task.error,
      action: 'pass',
      partialIncomplete: partialMissing.length > 0,
      missingFiles: partialMissing.length > 0 ? partialMissing : undefined,
    };

    task.status = 'completed';
    task.error = undefined;
    task.endTime = task.endTime || Date.now();
    task.duration = task.duration || task.endTime - task.startTime;

    this.persist();

    return {
      success: true,
      message: '人工审核通过',
      review: task.humanReview,
    };
  }

  /**
   * ↩️ 撤回人工审核：还原到 failed 状态
   * - 严格归属校验
   * - 仅当 humanReview 存在且 action=pass 时可撤回
   * - 还原 previousStatus/previousError
   * - 审计记录：action 改为 'revoke'，保留原记录字段
   */
  revokeHumanReview(params: { sessionId: string; userId: string; reviewerName?: string }) {
    const { sessionId, userId, reviewerName } = params;

    const task = this.tasks.get(sessionId);
    if (!task) {
      return { success: false, message: '任务不存在' };
    }

    if (!task.userId || task.userId !== userId) {
      return { success: false, message: '仅任务创建者可撤回审核' };
    }

    if (!task.humanReview) {
      return { success: false, message: '该任务无人工审核记录' };
    }

    if (task.humanReview.action === 'revoke') {
      return { success: false, message: '该审核已被撤回，无需重复操作' };
    }

    // 还原状态
    task.status = (task.humanReview.previousStatus as Task['status']) || 'failed';
    task.error = task.humanReview.previousError;
    task.endTime = undefined;
    task.duration = undefined;

    // 审计：保留原审核记录，action 改为 revoke
    task.humanReview.action = 'revoke';
    task.humanReview.revokedAt = Date.now();
    task.humanReview.revokedBy = reviewerName || userId;

    this.persist();

    return { success: true, message: '已撤回人工审核，任务还原为失败状态' };
  }

  /**
   * 📋 列出当前用户可审核的失败任务（Vue3 + 微码）
   * - 条件：target=vue3|microcode、status=failed、有真实产物
   * - 给每个任务标注 reviewable 字段
   */
  getReviewableTasks(userId: string) {
    const result: Array<Task & { reviewable: boolean }> = [];
    const supportedTargets = ['vue3', 'microcode'];
    for (const task of this.tasks.values()) {
      if (task.userId !== userId) continue;
      if (!supportedTargets.includes(task.target || 'microcode')) continue;
      if (task.status !== 'failed') continue;

      const reviewable = this.hasTaskArtifacts(task);
      result.push({ ...task, reviewable });
    }

    // 按时间倒序
    return result.sort((a, b) => b.startTime - a.startTime);
  }
}
