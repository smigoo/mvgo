import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TokenUsage,
  TokenUsageDocument,
} from '../schemas/token-usage.schema';
import {
  TokenUsageRecord,
  TaskUsageResponse,
  TokenStatsResponse,
  BudgetStatusResponse,
  StatsQuery,
  ModelPricing,
} from './dto/token-usage.dto';

/**
 * 模型定价表 (CNY per 1M tokens)
 * 数据来源：各模型官方定价页，按人民币折算
 */
const MODEL_PRICING: ModelPricing[] = [
  {
    model: 'claude-opus-4-8',
    modelType: 'text',
    inputPricePerMillion: 108,
    outputPricePerMillion: 540,
  },
  {
    model: 'claude-opus-4',
    modelType: 'text',
    inputPricePerMillion: 108,
    outputPricePerMillion: 540,
  },
  {
    model: 'claude-sonnet-4-6',
    modelType: 'text',
    inputPricePerMillion: 22,
    outputPricePerMillion: 110,
  },
  {
    model: 'claude-sonnet-4',
    modelType: 'text',
    inputPricePerMillion: 22,
    outputPricePerMillion: 110,
  },
  {
    model: 'claude-haiku-4',
    modelType: 'text',
    inputPricePerMillion: 5,
    outputPricePerMillion: 25,
  },
  {
    model: 'gpt-4o',
    modelType: 'text',
    inputPricePerMillion: 18,
    outputPricePerMillion: 72,
  },
  {
    model: 'gpt-4o-mini',
    modelType: 'text',
    inputPricePerMillion: 1,
    outputPricePerMillion: 4,
  },
  {
    model: 'qwen3.7-plus',
    modelType: 'vision',
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 2.0,
  },
  {
    model: 'qwen-vl-plus',
    modelType: 'vision',
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 2.0,
  },
  {
    model: 'deepseek-v3',
    modelType: 'text',
    inputPricePerMillion: 2,
    outputPricePerMillion: 8,
  },
  {
    model: 'gemini-2.5-pro',
    modelType: 'text',
    inputPricePerMillion: 10,
    outputPricePerMillion: 40,
  },
];

/** 默认定价（未知模型兜底） */
const DEFAULT_PRICING: ModelPricing = {
  model: 'unknown',
  modelType: 'text',
  inputPricePerMillion: 10,
  outputPricePerMillion: 40,
};

@Injectable()
export class TokenTrackerService {
  private readonly logger = new Logger(TokenTrackerService.name);

  constructor(
    @InjectModel(TokenUsage.name)
    private tokenUsageModel: Model<TokenUsageDocument>,
  ) {}

  // ─── 写入 ───

  /**
   * 记录单次 LLM 调用的 Token 用量
   * 异步非阻塞：fire-and-forget，写入失败仅记日志，不影响主流程
   */
  recordUsage(data: TokenUsageRecord): void {
    // 使用 setImmediate 确保 DB 写入不阻塞当前事件循环
    setImmediate(async () => {
      try {
        await this.tokenUsageModel.create({
          sessionId: data.sessionId,
          nodeName: data.nodeName,
          model: data.model,
          modelType: data.modelType,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          totalTokens: data.totalTokens,
          duration: data.duration,
          timestamp: data.timestamp || new Date(),
          componentName: data.componentName,
          fileKey: data.fileKey,
          nodeId: data.nodeId,
        } as Record<string, unknown>);
      } catch (err) {
        // 静默失败：token 记录不应影响生成流程
        this.logger.warn(
          `Token 记录写入失败: ${err.message} (sessionId=${data.sessionId}, node=${data.nodeName})`,
        );
      }
    });
  }

  // ─── 查询 ───

  /**
   * 按任务查询 Token 明细
   */
  async getTaskUsage(sessionId: string): Promise<TaskUsageResponse> {
    const records = await this.tokenUsageModel
      .find({ sessionId })
      .sort({ timestamp: 1 })
      .lean()
      .exec();

    // 汇总
    const totalInputTokens = records.reduce((s, r) => s + r.inputTokens, 0);
    const totalOutputTokens = records.reduce((s, r) => s + r.outputTokens, 0);
    const totalTokens = records.reduce((s, r) => s + r.totalTokens, 0);
    const callCount = records.length;
    const avgDuration =
      callCount > 0
        ? Math.round(records.reduce((s, r) => s + (r.duration || 0), 0) / callCount)
        : 0;

    // 按节点汇总
    const nodeMap = new Map<string, { totalTokens: number; callCount: number }>();
    for (const r of records) {
      const existing = nodeMap.get(r.nodeName) || { totalTokens: 0, callCount: 0 };
      existing.totalTokens += r.totalTokens;
      existing.callCount += 1;
      nodeMap.set(r.nodeName, existing);
    }

    // 成本估算
    let estimatedCost = 0;
    for (const r of records) {
      estimatedCost += this.estimateCost(r.model, r.inputTokens, r.outputTokens);
    }

    return {
      sessionId,
      records: records.map((r) => ({
        nodeName: r.nodeName,
        model: r.model,
        modelType: r.modelType,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        totalTokens: r.totalTokens,
        duration: r.duration,
        timestamp: r.timestamp,
      })),
      summary: {
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
        callCount,
        avgDuration,
        estimatedCost: +estimatedCost.toFixed(4),
      },
      byNode: Array.from(nodeMap.entries()).map(([nodeName, v]) => ({
        nodeName,
        totalTokens: v.totalTokens,
        callCount: v.callCount,
      })),
    };
  }

  /**
   * 聚合统计（按时间段）
   */
  async getStats(query: StatsQuery): Promise<TokenStatsResponse> {
    const days = query.days || 7;
    const startDate = this.computeStartDate(query.period, days);

    const result = await this.tokenUsageModel.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $facet: {
          overall: [
            {
              $group: {
                _id: null,
                totalInputTokens: { $sum: '$inputTokens' },
                totalOutputTokens: { $sum: '$outputTokens' },
                totalTokens: { $sum: '$totalTokens' },
                callCount: { $sum: 1 },
                avgDuration: { $avg: '$duration' },
              },
            },
          ],
          byModel: [
            {
              $group: {
                _id: '$model',
                inputTokens: { $sum: '$inputTokens' },
                outputTokens: { $sum: '$outputTokens' },
                totalTokens: { $sum: '$totalTokens' },
                callCount: { $sum: 1 },
              },
            },
          ],
          byNode: [
            {
              $group: {
                _id: '$nodeName',
                totalTokens: { $sum: '$totalTokens' },
                callCount: { $sum: 1 },
              },
            },
          ],
          daily: [
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
                },
                totalTokens: { $sum: '$totalTokens' },
                callCount: { $sum: 1 },
                inputTokens: { $sum: '$inputTokens' },
                outputTokens: { $sum: '$outputTokens' },
              },
            },
            { $sort: { _id: 1 } },
          ],
          modelDetails: [
            {
              $group: {
                _id: { model: '$model', inputTokens: '$inputTokens', outputTokens: '$outputTokens' },
              },
            },
          ],
        },
      },
    ]);

    const facet = result[0] || {};

    // 整体统计
    const overallRaw = facet.overall?.[0] || {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      callCount: 0,
      avgDuration: 0,
    };

    // 按模型统计 + 成本估算
    const byModel = (facet.byModel || []).map((m: any) => {
      const cost = this.estimateCost(m._id, m.inputTokens, m.outputTokens);
      return {
        model: m._id,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        totalTokens: m.totalTokens,
        callCount: m.callCount,
        estimatedCost: +cost.toFixed(4),
      };
    });

    // 整体成本
    let overallCost = 0;
    for (const m of byModel) {
      overallCost += m.estimatedCost;
    }

    return {
      overall: {
        totalInputTokens: overallRaw.totalInputTokens || 0,
        totalOutputTokens: overallRaw.totalOutputTokens || 0,
        totalTokens: overallRaw.totalTokens || 0,
        callCount: overallRaw.callCount || 0,
        avgDuration: Math.round(overallRaw.avgDuration || 0),
        estimatedCost: +overallCost.toFixed(4),
      },
      byModel,
      byNode: (facet.byNode || []).map((n: any) => ({
        nodeName: n._id,
        totalTokens: n.totalTokens,
        callCount: n.callCount,
      })),
      daily: (facet.daily || []).map((d: any) => {
        const cost = this.estimateCost('unknown', d.inputTokens, d.outputTokens);
        return {
          date: d._id,
          totalTokens: d.totalTokens,
          callCount: d.callCount,
          estimatedCost: +cost.toFixed(4),
        };
      }),
    };
  }

  /**
   * 检查任务的预算状态
   */
  async getBudgetStatus(sessionId: string): Promise<BudgetStatusResponse> {
    const budget = parseInt(process.env.TOKEN_BUDGET || '50000', 10);
    const warningThreshold = parseFloat(
      process.env.BUDGET_WARNING_THRESHOLD || '0.8',
    );

    const result = await this.tokenUsageModel.aggregate([
      { $match: { sessionId } },
      { $group: { _id: null, used: { $sum: '$totalTokens' } } },
    ]);

    const used = result[0]?.used || 0;

    return {
      sessionId,
      used,
      budget,
      remaining: Math.max(0, budget - used),
      usagePercent: budget > 0 ? +((used / budget) * 100).toFixed(1) : 0,
      warning: used >= budget * warningThreshold,
      exceeded: used > budget,
      warningThreshold,
    };
  }

  // ─── 定价 ───

  /**
   * 获取模型定价表
   */
  getPricing(): ModelPricing[] {
    return MODEL_PRICING;
  }

  /**
   * 估算单次调用的成本 (CNY)
   */
  estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing =
      MODEL_PRICING.find((p) => model?.toLowerCase().includes(p.model.toLowerCase())) ||
      DEFAULT_PRICING;
    const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePerMillion;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePerMillion;
    return inputCost + outputCost;
  }

  // ─── 内部工具 ───

  private computeStartDate(period?: string, days: number = 7): Date {
    const now = new Date();
    if (period === 'monthly') {
      return new Date(now.getFullYear(), now.getMonth() - (days - 1), 1);
    }
    if (period === 'weekly') {
      const start = new Date(now);
      start.setDate(start.getDate() - days * 7);
      return start;
    }
    // daily (default)
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return start;
  }
}
