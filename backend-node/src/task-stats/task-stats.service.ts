import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TokenUsage,
  TokenUsageDocument,
} from '../schemas/token-usage.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { AdminService } from '../admin/admin.service';
import { TasksService } from '../tasks/tasks.service';
import { TaskCodeSnapshotService } from '../tasks/task-code-snapshot.service';
import { percentileMs, resolveWindows, inWindow, UsagePreset } from '../admin/usage-export';
import { readFileSync } from 'fs';
import { join } from 'path';

// 加载模型定价配置
const modelPricingPath = join(__dirname, '../config/model-pricing.json');
let modelPricing: any = { pricing: { default: { input: 0.004, output: 0.012 } } };
try {
  modelPricing = JSON.parse(readFileSync(modelPricingPath, 'utf-8'));
} catch (err) {
  console.warn('[task-stats] Failed to load model-pricing.json, using defaults');
}

/** 失败原因分类（PRD §6.4）：质量失败归模型，环境/其他不归模型 */
export type FailType = 'quality' | 'env' | 'other';

export interface TaskStatsFilter {
  preset?: UsagePreset | string;
  from?: string;
  to?: string;
}

/**
 * 任务统计（管理员视角）：任务日志明细 + 模型 × 代理效果对比。
 *
 * 数据源（三源 join）：
 * - tasks.json（TasksService 内存台账）：userId / status / duration / configSnapshot(模型+baseURL) / error(失败原因)
 * - token_usages（Mongo）：按 sessionId / model 聚合 token 量与调用次数
 * - 快照 manifest（TaskCodeSnapshotService）：files[].lines → 文件数 / 代码行数
 *
 * 归因口径（与 PRD §6 对齐）：
 * - 效果（成功率）用 configSnapshot 归因（含失败任务），不能用 completionModels（仅成功任务）。
 * - token 是调用级精确（token_usages.model）；文件数/行数是任务级参与（快照产出）。
 * - 时间窗复用 usage-export 的 resolveWindows（week/d30/d60/custom，上海时区口径一致）。
 */
@Injectable()
export class TaskStatsService {
  constructor(
    private readonly adminService: AdminService,
    private readonly tasksService: TasksService,
    private readonly snapshotService: TaskCodeSnapshotService,
    @InjectModel(TokenUsage.name)
    private readonly tokenUsageModel: Model<TokenUsageDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /** 复用管理后台统一鉴权（数据库 isAdmin / 白名单 / QS 权限码） */
  async assertAdmin(userId: string): Promise<void> {
    await this.adminService.assertAdmin(userId);
  }

  /**
   * R11 历史回填：从 tasks.json 的 configSnapshot 读取 baseURL，回填到历史 token 记录
   * @returns 回填结果统计
   */
  async backfillTokenBaseURLs(): Promise<{
    scanned: number;
    updated: number;
    skipped: number;
    errors: number;
  }> {
    const result = { scanned: 0, updated: 0, skipped: 0, errors: 0 };

    // 1. 读取所有无 baseURL 的 token 记录
    const tokensWithoutBaseURL = await this.tokenUsageModel
      .find({ baseURL: { $exists: false } })
      .lean()
      .exec();

    result.scanned = tokensWithoutBaseURL.length;

    // 2. 按 sessionId 分组，减少任务查找次数
    const tokensBySession = new Map<string, any[]>();
    for (const token of tokensWithoutBaseURL) {
      if (!tokensBySession.has(token.sessionId)) {
        tokensBySession.set(token.sessionId, []);
      }
      tokensBySession.get(token.sessionId)!.push(token);
    }

    // 3. 遍历每个 session，从 tasks.json 读取 configSnapshot
    for (const [sessionId, tokens] of tokensBySession) {
      try {
        const task = this.tasksService.getTask(sessionId);
        if (!task) {
          result.skipped += tokens.length;
          continue;
        }

        const configSnapshot = task.configSnapshot || {};
        const textModel = configSnapshot.textModel;
        const visionModel = configSnapshot.visionModel;
        const textBaseURL = configSnapshot.textBaseURL;
        const visionBaseURL = configSnapshot.visionBaseURL;

        // 4. 为每个 token 匹配对应的 baseURL
        for (const token of tokens) {
          let baseURL: string | undefined;

          if (token.model === textModel && textBaseURL) {
            baseURL = textBaseURL;
          } else if (token.model === visionModel && visionBaseURL) {
            baseURL = visionBaseURL;
          }

          if (baseURL) {
            await this.tokenUsageModel.updateOne(
              { _id: token._id },
              { $set: { baseURL } },
            );
            result.updated++;
          } else {
            result.skipped++;
          }
        }
      } catch (err) {
        result.errors += tokens.length;
      }
    }

    return result;
  }

  /**
   * 失败原因分类（PRD §6.4）。
   * 优先级：环境失败 → 质量失败 → 其他（管线 bug / 未归类）。
   */
  private classifyFailure(error: string | undefined): FailType {
    const e = (error || '').toLowerCase();
    if (!e) return 'other';
    // 环境失败（不归模型）：服务重启 / 超时 / API Key / 图片 / 视觉能力未就绪
    if (
      /(服务重启|重启|超时|timeout|api\s*key|key\s*错误|图片格式|图片|视觉识别未完成|视觉能力尚未检测|视觉能力|尚未检测不支持|未检测不支持)/.test(
        e,
      )
    ) {
      return 'env';
    }
    // 质量失败（归模型）：质量门禁 / LESS 编译 / 分块解析失败 / 输出截断 / 模型能力
    if (
      /(质量检查|质量门禁|编译门禁|less|分块生成失败|合规\s*json|无法解析|超出单次生成上限|超出当前模型能力|模型生成代码存在缺陷|引用了未定义变量|unexpected|unrecognised|截断)/.test(
        e,
      )
    ) {
      return 'quality';
    }
    // 其他（管线 bug）：运行时未定义引用 / 模块找不到
    if (/(is not defined|未定义|cannot find module|找不到模块)/.test(e)) {
      return 'other';
    }
    return 'other';
  }

  /** 解析时间窗（复用 usage-export 口径），返回过滤后的任务与窗标签 */
  private resolveWindow(tasks: any[], filter?: TaskStatsFilter) {
    if (!filter || (!filter.preset && !filter.from && !filter.to)) {
      return { filtered: tasks, windowLabel: '全部时间' };
    }
    try {
      const { current } = resolveWindows({
        preset: (filter.preset as UsagePreset) || 'week',
        from: filter.from,
        to: filter.to,
      });
      const filtered = tasks.filter((t) => {
        const ts = Number(t?.startTime);
        return Number.isFinite(ts) && ts > 0 && inWindow(ts, current);
      });
      return { filtered, windowLabel: current.label };
    } catch (err: any) {
      // 时间窗参数非法时降级为不过滤，避免整页报错
      return { filtered: tasks, windowLabel: `时间窗无效：${err?.message || err}` };
    }
  }

  /** 任务日志明细：所有用户的任务列表（支持时间窗过滤） */
  async listAllTasks(filter?: TaskStatsFilter) {
    const all = this.tasksService.getAllTasks(undefined, { slim: true });
    const { filtered, windowLabel } = this.resolveWindow(all, filter);

    // token 按 sessionId 聚合（调用级，无 userId/baseURL，仅总量）
    const tokenRows = await this.tokenUsageModel.aggregate([
      {
        $group: {
          _id: '$sessionId',
          totalTokens: { $sum: '$totalTokens' },
          callCount: { $sum: 1 },
        },
      },
    ]);
    const tokenMap = new Map<
      string,
      { totalTokens: number; callCount: number }
    >();
    for (const r of tokenRows) {
      tokenMap.set(r._id, {
        totalTokens: r.totalTokens || 0,
        callCount: r.callCount || 0,
      });
    }

    // 收集所有 userId，批量查询用户名
    // tasks.json 中的 userId 是字符串（如 "6a7596e81d47bda8ab8b7e07"）
    // Mongoose 会自动将字符串 _id 转换为 ObjectId 进行查询
    const userIds = [...new Set(filtered.map((t: any) => t.userId).filter(Boolean))];
    const userMap = new Map<string, string>();
    if (userIds.length > 0) {
      const users = await this.userModel
        .find({ _id: { $in: userIds } } as any)
        .select('_id username')
        .lean()
        .exec();
      for (const u of users) {
        userMap.set((u._id as any).toString(), u.username);
      }
    }

    const list = filtered.map((task: any) => {
      const cs = task.configSnapshot || {};
      const cm = task.completionModels || {};
      const tok = tokenMap.get(task.sessionId);
      const snap = this.snapshotService.getLatestManifest(task.sessionId);
      const files = snap?.files || [];
      const hasLines = files.some((f: any) => typeof f.lines === 'number');
      const lineCount = hasLines
        ? files.reduce((s: number, f: any) => s + (f.lines || 0), 0)
        : undefined;

      return {
        sessionId: task.sessionId,
        userId: task.userId || '',
        username: userMap.get(task.userId) || task.userId || '',
        status: task.status,
        target: task.target || 'microcode',
        startTime: task.startTime,
        duration: task.duration,
        // 归因模型：configSnapshot（含失败任务）优先，completionModels 兜底
        textModel: cs.textModel || cm.textModel || undefined,
        visionModel: cs.visionModel || cm.visionModel || undefined,
        textBaseURL: cs.textBaseURL || undefined,
        visionBaseURL: cs.visionBaseURL || undefined,
        totalTokens: tok?.totalTokens || 0,
        callCount: tok?.callCount || 0,
        fileCount: files.length,
        lineCount,
        componentName: task.componentName || undefined,
        // R6：失败原因分类（仅 failed 有值）
        failType:
          task.status === 'failed'
            ? this.classifyFailure(task.error || task.reason)
            : undefined,
        failReason:
          task.status === 'failed'
            ? task.error || task.reason || ''
            : undefined,
      };
    });

    return { list, count: list.length, windowLabel };
  }

  /** 模型 × 代理聚合：成功率 + 耗时 p50/p90 + token + 组件数（支持时间窗过滤） */
  async modelCompare(filter?: TaskStatsFilter) {
    const all = this.tasksService.getAllTasks(undefined, { slim: true });
    const { filtered, windowLabel } = this.resolveWindow(all, filter);

    // R10+R11：token 按 (model, baseURL) 聚合（去掉 modelType，因 token 记录 modelType 恒为 vision 不可靠）
    // 历史 token 记录无 baseURL 字段，$ifNull 兜底为空字符串，不会丢数据
    const tokenByModel = await this.tokenUsageModel.aggregate([
      {
        $group: {
          _id: {
            model: '$model',
            baseURL: { $ifNull: ['$baseURL', ''] },
          },
          totalTokens: { $sum: '$totalTokens' },
          callCount: { $sum: 1 },
        },
      },
    ]);
    const tokenMap = new Map<
      string,
      { totalTokens: number; callCount: number }
    >();
    for (const r of tokenByModel) {
      // 同时存 model-only key 作为兜底（baseURL 缺失时按 model 匹配）
      tokenMap.set(
        `${r._id.model}:${r._id.baseURL}`,
        {
          totalTokens: r.totalTokens || 0,
          callCount: r.callCount || 0,
        },
      );
    }

    // 效率指标：按 sessionId 聚合 token（任务级别配对 duration/lineCount/tokens）
    const tokenBySession = await this.tokenUsageModel.aggregate([
      {
        $group: {
          _id: '$sessionId',
          totalTokens: { $sum: '$totalTokens' },
        },
      },
    ]);
    const tokenSessionMap = new Map<string, number>();
    for (const r of tokenBySession) {
      tokenSessionMap.set(r._id, r.totalTokens || 0);
    }

    // 任务展开到 (type, model, baseURL) 两行（text + vision），按 configSnapshot 归因
    type EfficiencySample = {
      durationMs: number;
      lineCount: number;
      tokens: number;
    };
    type Bucket = {
      type: string;
      model: string;
      baseURL: string;
      total: number;
      completed: number;
      qualityFail: number;
      envFail: number;
      otherFail: number;
      durations: number[];
      lineCounts: number[]; // 成功任务的代码行数
      efficiencySamples: EfficiencySample[]; // 配对样本
    };
    const buckets = new Map<string, Bucket>();
    for (const task of filtered as any[]) {
      if (task.status === 'cancelled') continue;
      // 跳过 running 任务，等完成后再统计
      if (task.status === 'running' || task.status === 'pending') continue;
      const cs = task.configSnapshot || {};
      const pairs = [
        { type: 'text', model: cs.textModel, baseURL: cs.textBaseURL },
        { type: 'vision', model: cs.visionModel, baseURL: cs.visionBaseURL },
      ];
      // 计算任务代码行数（从 manifest 或 task 本身）
      let taskLineCount: number | undefined;
      if (task.status === 'completed') {
        const snap = this.snapshotService.getLatestManifest(task.sessionId);
        const files = snap?.files || [];
        const hasLines = files.some((f: any) => typeof f.lines === 'number');
        if (hasLines) {
          taskLineCount = files.reduce((s: number, f: any) => s + (f.lines || 0), 0);
        }
      }
      for (const p of pairs) {
        if (!p.model) continue;
        const key = `${p.type}:${p.model}:${p.baseURL || ''}`;
        let b = buckets.get(key);
        if (!b) {
          b = {
            type: p.type,
            model: p.model,
            baseURL: p.baseURL || '',
            total: 0,
            completed: 0,
            qualityFail: 0,
            envFail: 0,
            otherFail: 0,
            durations: [],
            lineCounts: [],
            efficiencySamples: [],
          };
          buckets.set(key, b);
        }
        b.total++;
        if (task.status === 'completed') {
          b.completed++;
          if (task.duration && task.duration > 0) b.durations.push(task.duration);
          if (taskLineCount && taskLineCount > 0) b.lineCounts.push(taskLineCount);
          // 收集配对样本（duration 和 lineCount 都有值时）
          if (task.duration && task.duration > 0 && taskLineCount && taskLineCount > 0) {
            b.efficiencySamples.push({
              durationMs: task.duration,
              lineCount: taskLineCount,
              tokens: tokenSessionMap.get(task.sessionId) || 0,
            });
          }
        } else if (task.status === 'failed') {
          const ft = this.classifyFailure(task.error || task.reason);
          if (ft === 'quality') b.qualityFail++;
          else if (ft === 'env') b.envFail++;
          else b.otherFail++;
        }
      }
    }

    const list = [...buckets.values()]
      .map((b) => {
        // R10+R11：token 按 (model, baseURL) 匹配，兜底按 model-only
        const tok =
          tokenMap.get(`${b.model}:${b.baseURL}`) ||
          tokenMap.get(`${b.model}:`);
        const ok = b.completed;
        const qualityFail = b.qualityFail;
        const envFail = b.envFail;
        const otherFail = b.otherFail;
        const totalFail = qualityFail + envFail + otherFail;
        const totalDenom = ok + totalFail;
        // R6：质量成功率 = 排除环境/其他失败后的更准效果
        const qualityDenom = ok + qualityFail;
        
        // 效率指标：每百行耗时(秒) / 每百行Token(K)
        // 公式：secPer100Lines = durationMs / lineCount × 100 / 1000
        //       tokenKPer100Lines = totalTokens / lineCount × 100 / 1000
        const efficiencySamples = b.efficiencySamples;
        let secPer100LinesP50: number | null = null;
        let secPer100LinesP90: number | null = null;
        let tokenKPer100LinesP50: number | null = null;
        let tokenKPer100LinesP90: number | null = null;

        if (efficiencySamples.length > 0) {
          const secPer100Arr = efficiencySamples
            .map((s) => (s.durationMs / s.lineCount) * 100 / 1000)
            .sort((a, b) => a - b);
          const tokenKPer100Arr = efficiencySamples
            .map((s) => (s.tokens / s.lineCount) * 100 / 1000)
            .sort((a, b) => a - b);

          secPer100LinesP50 = percentileMs(secPer100Arr, 50);
          secPer100LinesP90 = percentileMs(secPer100Arr, 90);
          tokenKPer100LinesP50 = percentileMs(tokenKPer100Arr, 50);
          tokenKPer100LinesP90 = percentileMs(tokenKPer100Arr, 90);
        }

        return {
          type: b.type,
          model: b.model,
          baseURL: b.baseURL,
          taskCount: b.total,
          completed: ok,
          failed: totalFail,
          qualityFail,
          envFail,
          otherFail,
          successRate: totalDenom > 0 ? +(ok / totalDenom).toFixed(4) : null,
          qualitySuccessRate:
            qualityDenom > 0 ? +(ok / qualityDenom).toFixed(4) : null,
          durationP50Ms: percentileMs(b.durations, 50),
          durationP90Ms: percentileMs(b.durations, 90),
          componentCount: ok, // 1 任务 = 1 组件，参与产出
          totalTokens: tok?.totalTokens || 0,
          callCount: tok?.callCount || 0,
          // 平均代码行数（成功任务）
          avgLineCount:
            b.lineCounts.length > 0
              ? Math.round(
                  b.lineCounts.reduce((s, n) => s + n, 0) / b.lineCounts.length,
                )
              : 0,
          // 效率指标：每百行耗时(秒) / 每百行Token(K)
          secPer100LinesP50,
          secPer100LinesP90,
          tokenKPer100LinesP50,
          tokenKPer100LinesP90,
          efficiencySampleCount: efficiencySamples.length,
          // R8：样本量 < 3 标注「样本不足」
          smallSample: b.total < 3,
        };
      })
      .sort(
        (a, b) =>
          (b.successRate ?? -1) - (a.successRate ?? -1) ||
          b.taskCount - a.taskCount,
      );

    return { list, count: list.length, windowLabel };
  }

  /**
   * R12 效果趋势：按时间维度聚合成功率/耗时/token 曲线
   * @param filter 时间窗过滤
   * @param metric 指标类型：successRate | duration | tokens | taskCount
   * @param granularity 时间粒度：day | week（默认 day）
   */
  async trends(
    filter?: TaskStatsFilter,
    metric: 'successRate' | 'duration' | 'tokens' | 'taskCount' = 'successRate',
    granularity: 'day' | 'week' = 'day',
  ) {
    const all = this.tasksService.getAllTasks(undefined, { slim: true });
    const { filtered, windowLabel } = this.resolveWindow(all, filter);

    // 按时间粒度分桶
    const buckets = new Map<
      string,
      {
        timestamp: number;
        total: number;
        completed: number;
        durations: number[];
        tokens: number;
      }
    >();

    // token 按 sessionId 聚合
    const tokenBySession = await this.tokenUsageModel.aggregate([
      {
        $group: {
          _id: '$sessionId',
          totalTokens: { $sum: '$totalTokens' },
        },
      },
    ]);
    const tokenMap = new Map<string, number>();
    for (const r of tokenBySession) {
      tokenMap.set(r._id, r.totalTokens || 0);
    }

    for (const task of filtered as any[]) {
      if (task.status === 'cancelled') continue;
      const startTime = Number(task.startTime);
      if (!Number.isFinite(startTime) || startTime <= 0) continue;

      // 计算时间桶 key
      const date = new Date(startTime);
      let bucketKey: string;
      let bucketTimestamp: number;

      if (granularity === 'week') {
        // 按周：取本周一
        const dayOfWeek = date.getDay();
        const monday = new Date(date);
        monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        monday.setHours(0, 0, 0, 0);
        bucketKey = monday.toISOString().split('T')[0];
        bucketTimestamp = monday.getTime();
      } else {
        // 按天
        bucketKey = date.toISOString().split('T')[0];
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        bucketTimestamp = dayStart.getTime();
      }

      let bucket = buckets.get(bucketKey);
      if (!bucket) {
        bucket = {
          timestamp: bucketTimestamp,
          total: 0,
          completed: 0,
          durations: [],
          tokens: 0,
        };
        buckets.set(bucketKey, bucket);
      }

      bucket.total++;
      if (task.status === 'completed') {
        bucket.completed++;
        if (task.duration && task.duration > 0) {
          bucket.durations.push(task.duration);
        }
      }
      bucket.tokens += tokenMap.get(task.sessionId) || 0;
    }

    // 转换为时间序列
    const series = [...buckets.values()]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((bucket) => {
        const totalDenom = bucket.total;
        const successRate =
          totalDenom > 0 ? +(bucket.completed / totalDenom).toFixed(4) : null;
        const durationP50 = percentileMs(bucket.durations, 50);
        const durationP90 = percentileMs(bucket.durations, 90);

        return {
          timestamp: bucket.timestamp,
          taskCount: bucket.total,
          completed: bucket.completed,
          successRate,
          durationP50Ms: durationP50,
          durationP90Ms: durationP90,
          totalTokens: bucket.tokens,
        };
      });

    return {
      series,
      metric,
      granularity,
      count: series.length,
      windowLabel,
    };
  }

  /**
   * 用户维度聚合统计（宏观维护视角）
   * 按用户聚合：任务数、成功率、耗时 p50/p90、最近使用时间、常用模型、部门
   */
  async userStats(filter?: TaskStatsFilter) {
    const all = this.tasksService.getAllTasks(undefined, { slim: true });
    const { filtered, windowLabel } = this.resolveWindow(all, filter);

    // 收集所有 userId，批量查询用户名和部门
    const userIds = [...new Set(filtered.map((t: any) => t.userId).filter(Boolean))];
    const userMap = new Map<string, { username: string; department: string }>();
    if (userIds.length > 0) {
      const users = await this.userModel
        .find({ _id: { $in: userIds } } as any)
        .select('_id username portalInfo')
        .lean()
        .exec();
      for (const u of users) {
        // portalInfo 可能包含 deptName / department / orgName 等字段
        const dept = u.portalInfo?.deptName || u.portalInfo?.department || u.portalInfo?.orgName || '';
        userMap.set((u._id as any).toString(), {
          username: u.username,
          department: dept,
        });
      }
    }

    // 按用户聚合
    type UserBucket = {
      userId: string;
      username: string;
      department: string;
      total: number;
      completed: number;
      failed: number;
      cancelled: number;
      durations: number[];
      lastUsedAt: number;
      models: Map<string, number>; // model -> count
    };
    const userBuckets = new Map<string, UserBucket>();

    for (const task of filtered as any[]) {
      const userId = task.userId || '';
      if (!userId) continue;

      let bucket = userBuckets.get(userId);
      if (!bucket) {
        const userInfo = userMap.get(userId);
        bucket = {
          userId,
          username: userInfo?.username || userId,
          department: userInfo?.department || '',
          total: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
          durations: [],
          lastUsedAt: 0,
          models: new Map(),
        };
        userBuckets.set(userId, bucket);
      }

      bucket.total++;
      if (task.status === 'completed') {
        bucket.completed++;
        if (task.duration && task.duration > 0) {
          bucket.durations.push(task.duration);
        }
      } else if (task.status === 'failed') {
        bucket.failed++;
      } else if (task.status === 'cancelled') {
        bucket.cancelled++;
      }

      // 最近使用时间
      const startTime = Number(task.startTime);
      if (Number.isFinite(startTime) && startTime > bucket.lastUsedAt) {
        bucket.lastUsedAt = startTime;
      }

      // 常用模型（text + vision）
      const cs = task.configSnapshot || {};
      if (cs.textModel) {
        bucket.models.set(cs.textModel, (bucket.models.get(cs.textModel) || 0) + 1);
      }
      if (cs.visionModel) {
        bucket.models.set(cs.visionModel, (bucket.models.get(cs.visionModel) || 0) + 1);
      }
    }

    // 转换为列表
    const list = [...userBuckets.values()]
      .map((b) => {
        const totalDenom = b.completed + b.failed; // 排除 cancelled
        const successRate = totalDenom > 0 ? +(b.completed / totalDenom).toFixed(4) : null;

        // 常用模型 top 3
        const topModels = [...b.models.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([model, count]) => ({ model, count }));

        return {
          userId: b.userId,
          username: b.username,
          department: b.department,
          taskCount: b.total,
          completed: b.completed,
          failed: b.failed,
          cancelled: b.cancelled,
          successRate,
          durationP50Ms: percentileMs(b.durations, 50),
          durationP90Ms: percentileMs(b.durations, 90),
          lastUsedAt: b.lastUsedAt,
          topModels,
          // R8：样本量 < 3 标注「样本不足」
          smallSample: b.total < 3,
        };
      })
      .sort((a, b) => b.taskCount - a.taskCount); // 按任务数降序

    // 按部门聚合（宏观视角）
    const deptMap = new Map<string, {
      department: string;
      userCount: number;
      taskCount: number;
      completed: number;
      failed: number;
      durations: number[];
    }>();

    for (const item of list) {
      const dept = item.department || '未分配部门';
      let deptBucket = deptMap.get(dept);
      if (!deptBucket) {
        deptBucket = {
          department: dept,
          userCount: 0,
          taskCount: 0,
          completed: 0,
          failed: 0,
          durations: [],
        };
        deptMap.set(dept, deptBucket);
      }
      deptBucket.userCount++;
      deptBucket.taskCount += item.taskCount;
      deptBucket.completed += item.completed;
      deptBucket.failed += item.failed;
      if (item.durationP50Ms) deptBucket.durations.push(item.durationP50Ms);
    }

    const departments = [...deptMap.values()]
      .map((d) => {
        const totalDenom = d.completed + d.failed;
        const successRate = totalDenom > 0 ? +(d.completed / totalDenom).toFixed(4) : null;
        return {
          department: d.department,
          userCount: d.userCount,
          taskCount: d.taskCount,
          completed: d.completed,
          failed: d.failed,
          successRate,
          durationP50Ms: percentileMs(d.durations, 50),
        };
      })
      .sort((a, b) => b.taskCount - a.taskCount);

    return { list, departments, count: list.length, windowLabel };
  }

  /**
   * 仪表台聚合：全局概览 + 模型效率排行 + 效率趋势 + 失败归因 + 部门汇总
   * 默认时间窗：近 30 天
   */
  async dashboard(filter?: TaskStatsFilter) {
    const all = this.tasksService.getAllTasks(undefined, { slim: true });
    // 默认近 30 天
    const defaultFilter: TaskStatsFilter = filter?.preset || filter?.from || filter?.to
      ? filter!
      : { preset: 'd30' };
    const { filtered, windowLabel } = this.resolveWindow(all, defaultFilter);

    // token 按 sessionId 聚合（包含 input/output tokens 和模型信息用于成本计算）
    const tokenBySession = await this.tokenUsageModel.aggregate([
      {
        $group: {
          _id: '$sessionId',
          totalTokens: { $sum: '$totalTokens' },
          inputTokens: { $sum: '$inputTokens' },
          outputTokens: { $sum: '$outputTokens' },
          models: { $addToSet: '$model' },
        },
      },
    ]);
    const tokenSessionMap = new Map<string, number>();
    const costSessionMap = new Map<string, number>();
    for (const r of tokenBySession) {
      tokenSessionMap.set(r._id, r.totalTokens || 0);
      
      // 计算成本：取第一个模型的价格（通常一个任务用一个模型）
      const model = r.models?.[0] || 'default';
      const pricing = modelPricing.pricing[model] || modelPricing.pricing.default;
      const cost = ((r.inputTokens || 0) * pricing.input + (r.outputTokens || 0) * pricing.output) / 1000;
      costSessionMap.set(r._id, cost);
    }

    // 收集 userId 查询用户名
    const userIds = [...new Set(filtered.map((t: any) => t.userId).filter(Boolean))];
    const userMap = new Map<string, { username: string; department: string }>();
    if (userIds.length > 0) {
      const users = await this.userModel
        .find({ _id: { $in: userIds } } as any)
        .select('_id username portalInfo')
        .lean()
        .exec();
      for (const u of users) {
        const dept = u.portalInfo?.deptName || u.portalInfo?.department || u.portalInfo?.orgName || '';
        userMap.set((u._id as any).toString(), {
          username: u.username,
          department: dept,
        });
      }
    }

    // === 1. 全局概览 ===
    let totalTasks = 0;
    let completedTasks = 0;
    let failedTasks = 0;
    let totalDuration = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let firstTrySuccessCount = 0; // 一次成功任务数
    const activeUserIds = new Set<string>();
    const failBreakdown = { quality: 0, env: 0, other: 0 };

    for (const task of filtered as any[]) {
      if (task.status === 'cancelled') continue;
      totalTasks++;
      activeUserIds.add(task.userId);

      if (task.status === 'completed') {
        completedTasks++;
        if (task.duration && task.duration > 0) {
          totalDuration += task.duration;
        }
        totalTokens += tokenSessionMap.get(task.sessionId) || 0;
        totalCost += costSessionMap.get(task.sessionId) || 0;
        
        // 一次成功：retryCount 为 0 或 undefined
        if (!task.retryCount || task.retryCount === 0) {
          firstTrySuccessCount++;
        }
      } else if (task.status === 'failed') {
        failedTasks++;
        const ft = this.classifyFailure(task.error || task.reason);
        failBreakdown[ft]++;
      }
    }

    const overview = {
      totalTasks,
      completedTasks,
      failedTasks,
      successRate: totalTasks > 0 ? +(completedTasks / totalTasks).toFixed(4) : null,
      firstTrySuccessRate: completedTasks > 0 ? +(firstTrySuccessCount / completedTasks).toFixed(4) : null,
      avgDurationMs: completedTasks > 0 ? Math.round(totalDuration / completedTasks) : 0,
      totalTokens,
      totalCost: +totalCost.toFixed(2),
      avgCostPerTask: completedTasks > 0 ? +(totalCost / completedTasks).toFixed(4) : 0,
      activeUsers: activeUserIds.size,
      windowLabel,
    };

    // === 2. 模型效率排行（复用 model-compare 逻辑） ===
    const modelCompareResult = await this.modelCompare(defaultFilter);
    const modelRanking = modelCompareResult.list
      .filter((m) => !m.smallSample) // 过滤样本不足
      .slice(0, 10) // top 10
      .map((m) => ({
        type: m.type,
        model: m.model,
        baseURL: m.baseURL,
        taskCount: m.taskCount,
        successRate: m.successRate,
        qualitySuccessRate: m.qualitySuccessRate,
        secPer100LinesP50: m.secPer100LinesP50,
        tokenKPer100LinesP50: m.tokenKPer100LinesP50,
      }));

    // === 2.1 模型性价比矩阵（散点图数据） ===
    const modelScatterData = modelCompareResult.list
      .filter((m) => !m.smallSample) // 过滤样本不足
      .map((m) => {
        // 计算成本：使用 tokenKPer100LinesP50 和模型定价
        const pricing = modelPricing.pricing[m.model] || modelPricing.pricing.default;
        const avgCostPer100Lines = (m.tokenKPer100LinesP50 || 0) * (pricing.input + pricing.output) / 2;
        
        return {
          model: m.model,
          type: m.type,
          taskCount: m.taskCount,
          successRate: m.successRate,
          avgCostPer100Lines: +avgCostPer100Lines.toFixed(4),
          secPer100LinesP50: m.secPer100LinesP50,
          tokenKPer100LinesP50: m.tokenKPer100LinesP50,
        };
      })
      .filter((m) => (m.successRate ?? 0) > 0 && (m.avgCostPer100Lines ?? 0) > 0); // 过滤无效数据

    // === 3. 效率趋势（近 30 天，按天聚合） ===
    const trendsResult = await this.trends(defaultFilter, 'successRate', 'day');
    const trends = trendsResult.series.map((p: any) => ({
      timestamp: p.timestamp,
      successRate: p.successRate,
      durationP50Ms: p.durationP50Ms,
      taskCount: p.taskCount,
    }));

    // === 4. 失败归因 ===
    const failTotal = failBreakdown.quality + failBreakdown.env + failBreakdown.other;
    
    // 收集失败任务的详细错误信息（按类型分组）
    const failDetails: { quality: any[]; env: any[]; other: any[] } = {
      quality: [],
      env: [],
      other: [],
    };
    for (const task of filtered as any[]) {
      if (task.status !== 'failed') continue;
      const ft = this.classifyFailure(task.error || task.reason);
      failDetails[ft].push({
        sessionId: task.sessionId,
        componentName: task.componentName || task.sessionId,
        error: task.error || task.reason || '未知错误',
        startTime: task.startTime,
      });
    }
    
    const failDistribution = {
      quality: failBreakdown.quality,
      qualityRate: failTotal > 0 ? +(failBreakdown.quality / failTotal).toFixed(4) : 0,
      qualityDetails: failDetails.quality.slice(0, 20), // 最多返回 20 条
      env: failBreakdown.env,
      envRate: failTotal > 0 ? +(failBreakdown.env / failTotal).toFixed(4) : 0,
      envDetails: failDetails.env.slice(0, 20),
      other: failBreakdown.other,
      otherRate: failTotal > 0 ? +(failBreakdown.other / failTotal).toFixed(4) : 0,
      otherDetails: failDetails.other.slice(0, 20),
      total: failTotal,
    };

    // === 5. 部门汇总（复用 user-stats 逻辑） ===
    const userStatsResult = await this.userStats(defaultFilter);
    const departmentSummary = userStatsResult.departments;

    return {
      overview,
      modelRanking,
      modelScatterData,
      trends,
      failDistribution,
      departmentSummary,
      windowLabel,
    };
  }

  /**
   * 我的统计（用户视角）
   */
  async myDashboard(userId: string, filter?: TaskStatsFilter) {
    const all = this.tasksService.getAllTasks(undefined, { slim: true });
    // 默认近 30 天
    const defaultFilter: TaskStatsFilter = filter?.preset || filter?.from || filter?.to
      ? filter!
      : { preset: 'd30' };
    const { filtered, windowLabel } = this.resolveWindow(all, defaultFilter);

    // 只统计当前用户的任务
    const myTasks = filtered.filter((t: any) => t.userId === userId);

    // token 按 sessionId 聚合
    const tokenBySession = await this.tokenUsageModel.aggregate([
      {
        $match: { userId },
        $group: {
          _id: '$sessionId',
          totalTokens: { $sum: '$totalTokens' },
          inputTokens: { $sum: '$inputTokens' },
          outputTokens: { $sum: '$outputTokens' },
          models: { $addToSet: '$model' },
        },
      },
    ]);
    const tokenSessionMap = new Map<string, number>();
    const costSessionMap = new Map<string, number>();
    for (const r of tokenBySession) {
      tokenSessionMap.set(r._id, r.totalTokens || 0);
      
      // 计算成本
      const model = r.models?.[0] || 'default';
      const pricing = modelPricing.pricing[model] || modelPricing.pricing.default;
      const cost = ((r.inputTokens || 0) * pricing.input + (r.outputTokens || 0) * pricing.output) / 1000;
      costSessionMap.set(r._id, cost);
    }

    // === 1. 我的概览 ===
    let totalTasks = 0;
    let completedTasks = 0;
    let failedTasks = 0;
    let totalDuration = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let firstTrySuccessCount = 0;
    const modelUsage = new Map<string, { count: number; success: number }>();

    for (const task of myTasks as any[]) {
      if (task.status === 'cancelled') continue;
      totalTasks++;

      // 统计模型使用
      const model = task.configSnapshot?.textModel || task.configSnapshot?.visionModel || 'unknown';
      if (!modelUsage.has(model)) {
        modelUsage.set(model, { count: 0, success: 0 });
      }
      const modelStat = modelUsage.get(model)!;
      modelStat.count++;

      if (task.status === 'completed') {
        completedTasks++;
        modelStat.success++;
        if (task.duration && task.duration > 0) {
          totalDuration += task.duration;
        }
        totalTokens += tokenSessionMap.get(task.sessionId) || 0;
        totalCost += costSessionMap.get(task.sessionId) || 0;
        
        if (!task.retryCount || task.retryCount === 0) {
          firstTrySuccessCount++;
        }
      } else if (task.status === 'failed') {
        failedTasks++;
      }
    }

    const overview = {
      totalTasks,
      completedTasks,
      failedTasks,
      successRate: totalTasks > 0 ? +(completedTasks / totalTasks).toFixed(4) : null,
      firstTrySuccessRate: completedTasks > 0 ? +(firstTrySuccessCount / completedTasks).toFixed(4) : null,
      avgDurationMs: completedTasks > 0 ? Math.round(totalDuration / completedTasks) : 0,
      totalTokens,
      totalCost: +totalCost.toFixed(2),
      avgCostPerTask: completedTasks > 0 ? +(totalCost / completedTasks).toFixed(4) : 0,
      windowLabel,
    };

    // === 2. 我的常用模型 ===
    const myModels = Array.from(modelUsage.entries())
      .map(([model, stat]) => ({
        model,
        taskCount: stat.count,
        successCount: stat.success,
        successRate: stat.count > 0 ? +(stat.success / stat.count).toFixed(4) : 0,
      }))
      .sort((a, b) => b.taskCount - a.taskCount)
      .slice(0, 10);

    return {
      overview,
      myModels,
      windowLabel,
    };
  }
}
