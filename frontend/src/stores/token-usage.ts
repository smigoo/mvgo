import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  TaskUsageResponse,
  TokenStatsResponse,
  BudgetStatus,
  MetricsBudgetData,
  MonitorData,
  UserGroup,
  MonitorQueryParams,
  DrillDownContext,
  DayDetail,
} from '@/types/token-usage'
import {
  getTaskTokenUsage,
  getTokenStats,
  getBudgetStatus,
} from '@/api/generator/generator'
import { getMonitorData } from '@/api/token-monitor'

export const useTokenUsageStore = defineStore('token-usage', () => {
  // ─── State ───

  /** 当前任务的实时 token 状态（从 SSE metrics 事件更新） */
  const liveBudget = ref<MetricsBudgetData | null>(null)

  /** 当前任务的 token 用量明细 */
  const taskUsage = ref<TaskUsageResponse | null>(null)

  /** 聚合统计数据 */
  const stats = ref<TokenStatsResponse | null>(null)

  /** 预算状态 */
  const budgetStatus = ref<BudgetStatus | null>(null)

  /** 加载状态 */
  const loading = ref(false)

  // ─── Getters ───

  /** 实时用量百分比 */
  const liveUsagePercent = computed(() => liveBudget.value?.usagePercent || 0)

  /** 实时已用 token */
  const liveUsed = computed(() => liveBudget.value?.used || 0)

  /** 实时预算 */
  const liveBudgetTotal = computed(() => liveBudget.value?.budget || 50000)

  /** 实时预估成本 */
  const liveCost = computed(() => liveBudget.value?.estimatedCost || 0)

  /** 是否超预算 */
  const isBudgetWarning = computed(() => liveBudget.value?.warning || false)
  const isBudgetExceeded = computed(() => liveBudget.value?.exceeded || false)

  // ─── Actions ───

  /**
   * 从 SSE metrics 事件更新实时 token 状态
   */
  function updateFromMetrics(budget: MetricsBudgetData) {
    liveBudget.value = budget
  }

  /**
   * 重置实时状态（新任务开始时调用）
   */
  function resetLive() {
    liveBudget.value = null
  }

  /**
   * 拉取任务 token 明细
   */
  async function fetchTaskUsage(sessionId: string) {
    try {
      loading.value = true
      taskUsage.value = await getTaskTokenUsage(sessionId)
    } catch (err) {
      console.error('[token-usage] fetchTaskUsage failed:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 拉取聚合统计
   */
  async function fetchStats(
    period: 'daily' | 'weekly' | 'monthly' = 'daily',
    days: number = 7,
  ) {
    try {
      loading.value = true
      stats.value = await getTokenStats(period, days)
    } catch (err) {
      console.error('[token-usage] fetchStats failed:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 拉取预算状态
   */
  async function fetchBudgetStatus(sessionId: string) {
    try {
      budgetStatus.value = await getBudgetStatus(sessionId)
    } catch (err) {
      console.error('[token-usage] fetchBudgetStatus failed:', err)
    }
  }

  // ─── 监控看板 State ───

  const monitorData = ref<MonitorData | null>(null)
  const monitorLoading = ref(false)
  const monitorQuery = ref<MonitorQueryParams>({
    period: 'daily',
    days: 7,
    search: '',
    groupId: '',
    model: '',
  })

  // ─── 监控看板 Getters ───

  /** 当前视图中过滤后的用户列表（前端过滤，支持搜索+群组） */
  const filteredUsers = computed(() => {
    if (!monitorData.value) return []
    let users = [...monitorData.value.users]
    const q = monitorQuery.value

    if (q.search) {
      const kw = q.search.toLowerCase()
      users = users.filter(
        u => u.userName.toLowerCase().includes(kw) || u.groupName.toLowerCase().includes(kw),
      )
    }
    if (q.groupId) {
      users = users.filter(u => u.groupId === q.groupId)
    }
    if (q.model) {
      users = users.filter(u => u.models.some(m => m.model === q.model))
    }
    return users
  })

  /** Top 10 用户（用于柱状图） */
  const topUsers = computed(() => filteredUsers.value.slice(0, 10))

  // ─── 监控看板 Actions ───

  /** 获取监控看板数据（Mock 模式下走本地，真实模式下走后端） */
  async function fetchMonitorData(params?: MonitorQueryParams) {
    try {
      monitorLoading.value = true
      if (params) {
        monitorQuery.value = { ...monitorQuery.value, ...params }
      }
      monitorData.value = await getMonitorData(monitorQuery.value)
    } catch (err) {
      console.error('[token-usage] fetchMonitorData failed:', err)
    } finally {
      monitorLoading.value = false
    }
  }

  /** 设置查询参数并自动刷新 */
  function setMonitorQuery(partial: Partial<MonitorQueryParams>) {
    monitorQuery.value = { ...monitorQuery.value, ...partial }
    fetchMonitorData()
  }

  // ─── 多维下钻 State ───

  const drillDownContext = ref<DrillDownContext>({ type: 'all', label: '全量' })
  const dayDetail = ref<DayDetail | null>(null)
  const dayDetailVisible = ref(false)

  // ─── 多维下钻 Getters ───

  /** 面包屑路径（从 root 到当前） */
  const breadcrumbPath = computed(() => {
    const path: DrillDownContext[] = []
    let ctx: DrillDownContext | undefined = drillDownContext.value
    while (ctx) {
      path.unshift(ctx)
      ctx = ctx.parent
    }
    return path
  })

  /** 图表标题（自动带上下文标注） */
  const chartTitles = computed(() => {
    const ctx = drillDownContext.value
    const suffix = ctx.type === 'all' ? '' : ` — ${ctx.label}`
    return {
      bar: `用户用量排行${suffix}`,
      ring: `模型用量分布${suffix}`,
      trend: `Token 消耗趋势${suffix}`,
    }
  })

  /** 当前视图标识文本 */
  const currentViewLabel = computed(() => {
    const ctx = drillDownContext.value
    if (ctx.type === 'all') return '全量'
    const typeMap: Record<string, string> = {
      user: '👤',
      group: '👥',
      model: '🤖',
      date: '📅',
    }
    return `${typeMap[ctx.type] || ''} ${ctx.label}`
  })

  // ─── 多维下钻 Actions ───

  /** 下钻到指定维度 */
  function drillTo(target: DrillDownContext) {
    const current = drillDownContext.value
    // 同类维度切换（group→group、user→user、model→model）→ 替换，保持父级不变
    // 跨维度下钻（all→group、group→user）→ 叠加，当前作为父级
    if (target.type === current.type) {
      target.parent = current.parent
    } else {
      target.parent = { ...current }
    }
    drillDownContext.value = target
    dayDetailVisible.value = false
    fetchMonitorData({ ...monitorQuery.value, context: target })
  }

  /** 面包屑点击返回第 index 级 */
  function drillBack(index: number) {
    const path = breadcrumbPath.value
    if (index >= 0 && index < path.length - 1) {
      drillDownContext.value = { ...path[index] }
      // 清除 parent 之后的链
      drillDownContext.value.parent = index > 0 ? path[index - 1] : undefined
      dayDetailVisible.value = false
      fetchMonitorData({ ...monitorQuery.value, context: drillDownContext.value })
    }
  }

  /** 清除所有下钻，回到全量视图 */
  function clearDrillDown() {
    drillDownContext.value = { type: 'all', label: '全量' }
    dayDetail.value = null
    dayDetailVisible.value = false
    fetchMonitorData()
  }

  /** 打开当日明细面板 */
  async function showDayDetail(date: string) {
    try {
      const { getMonitorData } = await import('@/api/token-monitor')
      const data = await getMonitorData({
        ...monitorQuery.value,
        context: { type: 'date', date, label: date },
      })
      dayDetail.value = data.dayDetail || null
      dayDetailVisible.value = true
    } catch (err) {
      console.error('[token-usage] showDayDetail failed:', err)
    }
  }

  /** 关闭当日明细面板 */
  function closeDayDetail() {
    dayDetailVisible.value = false
  }

  return {
    // state
    liveBudget,
    taskUsage,
    stats,
    budgetStatus,
    loading,
    // getters
    liveUsagePercent,
    liveUsed,
    liveBudgetTotal,
    liveCost,
    isBudgetWarning,
    isBudgetExceeded,
    // actions
    updateFromMetrics,
    resetLive,
    fetchTaskUsage,
    fetchStats,
    fetchBudgetStatus,

    // ─── 监控看板 ───
    monitorData,
    monitorLoading,
    monitorQuery,
    filteredUsers,
    topUsers,
    fetchMonitorData,
    setMonitorQuery,

    // ─── 多维下钻 ───
    drillDownContext,
    dayDetail,
    dayDetailVisible,
    breadcrumbPath,
    chartTitles,
    currentViewLabel,
    drillTo,
    drillBack,
    clearDrillDown,
    showDayDetail,
    closeDayDetail,
  }
})
