/**
 * Token 用量相关前端类型定义
 */

export interface TokenUsageRecord {
  nodeName: string
  model: string
  modelType: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  duration: number
  timestamp: string | Date
}

export interface TaskUsageSummary {
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  callCount: number
  avgDuration: number
  estimatedCost: number
}

export interface NodeBreakdown {
  nodeName: string
  totalTokens: number
  callCount: number
}

export interface TaskUsageResponse {
  sessionId: string
  records: TokenUsageRecord[]
  summary: TaskUsageSummary
  byNode: NodeBreakdown[]
}

export interface ModelBreakdown {
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  callCount: number
  estimatedCost: number
}

export interface DailyUsage {
  date: string
  totalTokens: number
  callCount: number
  estimatedCost: number
}

export interface TokenStatsResponse {
  overall: TaskUsageSummary
  byModel: ModelBreakdown[]
  byNode: NodeBreakdown[]
  daily: DailyUsage[]
}

export interface BudgetStatus {
  sessionId: string
  used: number
  budget: number
  remaining: number
  usagePercent: number
  warning: boolean
  exceeded: boolean
  warningThreshold: number
}

export interface ModelPricing {
  model: string
  modelType: 'vision' | 'text'
  inputPricePerMillion: number
  outputPricePerMillion: number
}

export interface PricingTableResponse {
  models: ModelPricing[]
  currency: string
}

/** SSE metrics 事件中的 token 数据 */
export interface MetricsTokenData {
  input: number
  output: number
  total: number
}

export interface MetricsBudgetData {
  used: number
  budget: number
  remaining: number
  usagePercent: number
  warning: boolean
  exceeded: boolean
  warningThreshold: number
  estimatedCost: number
}

export interface MetricsEventData {
  type: 'metrics'
  node: string
  model: string
  tokens: MetricsTokenData
  budget: MetricsBudgetData
  timestamp: number
}

// ─── Token 监控看板扩展类型 ───

/** 用户群组 */
export interface UserGroup {
  id: string
  name: string
  memberCount: number
}

/** 用户的单模型用量 */
export interface UserModelUsage {
  model: string
  totalTokens: number
  callCount: number
}

/** 用户 Token 用量聚合 */
export interface UserTokenUsage {
  userId: string
  userName: string
  groupId: string
  groupName: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  callCount: number
  percentage: number       // 占总量百分比
  models: UserModelUsage[]
  lastActive: string       // ISO date
  activeDays?: number      // 活跃天数（用户视图用）
  avatarColor?: string     // 头像底色（Mock 生成）
}

/** 模型用量聚合（跨用户） */
export interface ModelTokenUsage {
  model: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  percentage: number
  userCount: number
  estimatedCost: number
}

/** 时间序列数据点 */
export interface TimeSeriesPoint {
  time: string             // 日期 YYYY-MM-DD 或小时 HH:00
  totalTokens: number
  inputTokens: number
  outputTokens: number
  callCount: number
  estimatedCost: number
}

/** 群组视图：每个成员的时序折线 */
export interface MemberTimeSeries {
  userName: string
  userId: string
  values: number[]          // 每日 Token 总量，顺序对应 timeSeries[].time
}

/** 监控看板完整数据 */
export interface MonitorData {
  period: 'daily' | 'weekly' | 'monthly'
  days: number
  overview: {
    totalTokens: number
    estimatedCost: number
    activeUsers: number
    avgTokensPerUser: number
    totalCallCount: number
    groupName?: string       // 群组视图下的群组名
    userName?: string         // 用户视图下的用户名
    modelName?: string        // 模型视图下的模型名
    inputOutputRatio?: number // 模型视图：输入/输出比值
  }
  users: UserTokenUsage[]
  groups: UserGroup[]
  models: ModelTokenUsage[]
  timeSeries: TimeSeriesPoint[]
  // ─── 下钻专属数据 ───
  context?: DrillDownContext
  userCallRecords?: UserCallRecord[]      // 用户视图：调用记录
  modelUserRanking?: ModelUserRanking[]   // 模型视图：用户排行
  dayDetail?: DayDetail                   // 日期视图：当日明细
  memberBreakdown?: MemberTimeSeries[]    // 群组视图：成员多线趋势
}

/** 查询参数 */
export interface MonitorQueryParams {
  period?: 'daily' | 'weekly' | 'monthly'
  days?: number
  search?: string          // 用户名或群组名搜索
  groupId?: string         // 群组过滤
  model?: string           // 模型过滤
  context?: DrillDownContext // 下钻上下文
}

// ─── 多维下钻分析类型 ───

/** 下钻视图上下文（驱动全看板联动） */
export interface DrillDownContext {
  type: 'all' | 'user' | 'group' | 'model' | 'date'
  userId?: string
  groupId?: string
  model?: string
  date?: string              // YYYY-MM-DD
  label: string              // 面包屑显示名，如 "张三"
  parent?: DrillDownContext  // 上级上下文（面包屑链）
}

/** 单日调用记录 */
export interface DailyCallRecord {
  userId: string
  userName: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  groupId: string
  groupName: string
}

/** 当日明细 */
export interface DayDetail {
  date: string
  records: DailyCallRecord[]
  summary: { totalTokens: number; callCount: number; userCount: number }
}

/** 用户调用记录（用户视图下的表格数据） */
export interface UserCallRecord {
  time: string               // 日期 YYYY-MM-DD
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/** 模型用户排行（模型视图下的柱状图数据） */
export interface ModelUserRanking {
  userId: string
  userName: string
  groupName: string
  totalTokens: number
  percentage: number
  callCount: number
}
