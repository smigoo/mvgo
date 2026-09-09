/**
 * Token 用量相关 DTO 定义
 */

/** 单次 LLM 调用的 Token 记录（从 Agent 钩子传入） */
export interface TokenUsageRecord {
  sessionId: string;
  nodeName: string;
  model: string;
  modelType: 'vision' | 'text';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  duration: number;
  timestamp?: string | Date;
  componentName?: string;
  fileKey?: string;
  nodeId?: string;
}

/** 按任务查询的返回结构 */
export interface TaskUsageResponse {
  sessionId: string;
  records: Array<{
    nodeName: string;
    model: string;
    modelType: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    duration: number;
    timestamp: Date;
  }>;
  summary: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    callCount: number;
    avgDuration: number;
    estimatedCost: number;
  };
  byNode: Array<{
    nodeName: string;
    totalTokens: number;
    callCount: number;
  }>;
}

/** 聚合统计查询参数 */
export interface StatsQuery {
  period?: 'daily' | 'weekly' | 'monthly';
  days?: number;
}

/** 聚合统计返回结构 */
export interface TokenStatsResponse {
  overall: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    callCount: number;
    avgDuration: number;
    estimatedCost: number;
  };
  byModel: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    callCount: number;
    estimatedCost: number;
  }>;
  byNode: Array<{
    nodeName: string;
    totalTokens: number;
    callCount: number;
  }>;
  daily: Array<{
    date: string;
    totalTokens: number;
    callCount: number;
    estimatedCost: number;
  }>;
}

/** 预算状态返回结构 */
export interface BudgetStatusResponse {
  sessionId: string;
  used: number;
  budget: number;
  remaining: number;
  usagePercent: number;
  warning: boolean;
  exceeded: boolean;
  warningThreshold: number;
}

/** 模型定价表项 */
export interface ModelPricing {
  model: string;
  modelType: 'vision' | 'text';
  inputPricePerMillion: number; // CNY per 1M tokens
  outputPricePerMillion: number;
}

/** 定价表返回结构 */
export interface PricingTableResponse {
  models: ModelPricing[];
  currency: string;
}
