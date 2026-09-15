import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GenerationMetric,
  GenerationMetricDocument,
  GenerationMetricStatus,
} from '../schemas/generation-metric.schema';
import { User, UserDocument } from '../schemas/user.schema';
import type { Task } from './tasks.service';

/** 两级公共后缀（够用即可，不引入 psl 依赖） */
const TWO_LEVEL_TLDS = ['com.cn', 'net.cn', 'org.cn', 'gov.cn', 'co.jp', 'co.uk'];

/**
 * 取 URL 的归属根域名。
 * 例：`https://dashscope.aliyuncs.com/compatible-mode/v1` → `aliyuncs.com`
 */
export function rootDomainOf(url?: string): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  try {
    const host = new URL(url).hostname;
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    const last2 = parts.slice(-2).join('.');
    return TWO_LEVEL_TLDS.includes(last2) ? parts.slice(-3).join('.') : last2;
  } catch {
    return undefined;
  }
}

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

/**
 * 生成管线指标宽表写入器（P0-2）。
 *
 * 职责单一：把 TasksService 的**终态任务**固化成 `generation_metrics` 的一行，
 * 供管理员监控看板聚合。语义约定：
 * - **fire-and-forget**：写入失败只记日志，绝不影响任务主流程（与 TokenTrackerService 同策略）。
 * - **upsert by sessionId**：同一任务重放（人工审核改判后再次落终态）不产生重复行。
 * - **只写新任务**：不做历史回填（PRD §9），宽表数据起始时间即上线时间。
 *
 * 依赖必须是可选注入：`tasks.service.spec.ts` 用 `new TasksService()` 无参构造，
 * 新增依赖若非可选会让 29 条既有断言全红。
 */
@Injectable()
export class PipelineMetricsService {
  private readonly logger = new Logger(PipelineMetricsService.name);

  constructor(
    @Optional()
    @InjectModel(GenerationMetric.name)
    private readonly metricModel?: Model<GenerationMetricDocument>,
    @Optional()
    @InjectModel(User.name)
    private readonly userModel?: Model<UserDocument>,
  ) {}

  /**
   * 排除出统计口径的门户 uid 清单（默认排除本地开发账号 dev-local）。
   * 每次调用读取 env，便于改配置后免重启生效。
   */
  private excludedUids(): string[] {
    return (process.env.PIPELINE_METRICS_EXCLUDE_UIDS ?? 'dev-local')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * 终态落库（非阻塞）。由 `TasksService#finalizeTask` 调用，是宽表的**唯一写入入口**。
   */
  recordTerminal(
    task: Task,
    status: GenerationMetricStatus,
    opts: { cancelReason?: string } = {},
  ): void {
    if (!this.metricModel || !task?.sessionId) return;
    void this.write(task, status, opts).catch((err: any) => {
      this.logger.warn(
        `指标宽表写入失败: ${err?.message || err} (sessionId=${task?.sessionId})`,
      );
    });
  }

  /**
   * 反向：任务被还原出终态（撤回人工审核）时移除记录。
   * 宽表只承载终态，还原后该任务不应再被统计。
   */
  recordRevert(sessionId: string): void {
    if (!this.metricModel || !sessionId) return;
    void this.metricModel
      .deleteOne({ sessionId })
      .exec()
      .catch((err: any) => {
        this.logger.warn(`指标宽表回滚失败: ${err?.message || err} (sessionId=${sessionId})`);
      });
  }

  // ─── 内部实现 ───

  private async write(
    task: Task,
    status: GenerationMetricStatus,
    opts: { cancelReason?: string },
  ): Promise<void> {
    // 1. 用户 + 部门快照（portalInfo 是登录时快照且整包覆盖，必须在此固化）
    let username: string | undefined;
    let uid: string | undefined;
    let deptName: string | undefined;
    let orgName: string | undefined;

    if (task.userId && OBJECT_ID_RE.test(String(task.userId)) && this.userModel) {
      try {
        const user: any = await this.userModel.findById(task.userId).lean().exec();
        if (user) {
          username = user.username || undefined;
          uid = user.uid || undefined;
          const portal = (user.portalInfo || {}) as Record<string, any>;
          deptName = portal.deptName || undefined;
          orgName = portal.orgName || undefined;
        }
      } catch (err: any) {
        // 用户查询失败不阻断：该行仍要落库，只是缺部门维度
        this.logger.warn(
          `指标宽表用户快照失败: ${err?.message || err} (userId=${task.userId})`,
        );
      }
    }

    // 2. 模型 + 归属根域名（来自任务启动时冻结的 configSnapshot）
    const cs: Record<string, any> = (task.configSnapshot as Record<string, any>) || {};
    const completion: Record<string, any> = (task.completionModels as Record<string, any>) || {};
    const unified = cs.modelMode === 'unified';

    const textModel = completion.textModel || (unified ? cs.unifiedModel : cs.textModel) || undefined;
    const visionModel =
      completion.visionModel || (unified ? cs.unifiedModel : cs.visionModel) || undefined;
    const textRootDomain = rootDomainOf(unified ? cs.unifiedBaseURL : cs.textBaseURL);
    const visionRootDomain = rootDomainOf(unified ? cs.unifiedBaseURL : cs.visionBaseURL);
    const rootDomains = Array.from(
      new Set([textRootDomain, visionRootDomain].filter(Boolean) as string[]),
    );

    // 3. 测试账号排除（按门户 uid，而非用户名——改名不会重新混入）
    const excludedUids = this.excludedUids();
    const excluded = Boolean(uid && excludedUids.includes(uid));

    const doc: Partial<GenerationMetric> = {
      sessionId: task.sessionId,
      userId: task.userId ? String(task.userId) : undefined,
      username,
      uid,
      deptName,
      orgName,
      target: (task.target as any) || undefined,
      sourceType: (task.sourceType as any) || undefined,
      generationTier: (task.generationTier as any) || undefined,
      taskType: task.taskType || undefined,
      status,
      cancelReason: opts.cancelReason,
      componentId: task.componentId || undefined,
      componentName: task.componentName || task.displayName || undefined,
      startTime: task.startTime || undefined,
      endTime: task.endTime || undefined,
      duration: task.duration || undefined,
      error: typeof task.error === 'string' ? task.error : undefined,
      qualityGate: (task.qualityGate as any) || undefined,
      textModel,
      visionModel,
      textRootDomain,
      visionRootDomain,
      rootDomains,
      gates: (task as any).gates || [],
      excluded,
      excludedReason: excluded ? `uid 在排除清单内（${excludedUids.join(',')}）` : undefined,
    };

    await this.metricModel!
      .updateOne({ sessionId: task.sessionId }, { $set: doc }, { upsert: true })
      .exec();
  }
}
