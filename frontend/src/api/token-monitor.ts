/**
 * Token 监控 Mock 数据层
 *
 * 生成 30 天 × 12 用户 × 4 群组 × 4 模型的确定性 mock 数据。
 * 函数签名与真实后端 API 对齐，后期切真实平台只需替换 import 源。
 */
import type {
  MonitorData,
  UserTokenUsage,
  UserGroup,
  ModelTokenUsage,
  TimeSeriesPoint,
  MonitorQueryParams,
  DrillDownContext,
  DayDetail,
  DailyCallRecord,
  UserCallRecord,
  ModelUserRanking,
} from '@/types/token-usage'

// ─── 基础配置 ───

const MODELS = [
  { name: 'GPT-4o',      inputPrice: 2.50,  outputPrice: 10.00 },
  { name: 'GPT-4o-mini', inputPrice: 0.15,  outputPrice: 0.60  },
  { name: 'Claude-3.5',  inputPrice: 3.00,  outputPrice: 15.00 },
  { name: 'DeepSeek-V3', inputPrice: 0.27,  outputPrice: 1.10  },
]

const GROUPS: { id: string; name: string }[] = [
  { id: 'g-dev',     name: '开发组' },
  { id: 'g-product', name: '产品组' },
  { id: 'g-design',  name: '设计组' },
  { id: 'g-test',    name: '测试组' },
]

const USERS: { id: string; name: string; groupId: string }[] = [
  { id: 'u01', name: '张三', groupId: 'g-dev'     },
  { id: 'u02', name: '李四', groupId: 'g-dev'     },
  { id: 'u03', name: '王五', groupId: 'g-dev'     },
  { id: 'u04', name: '赵六', groupId: 'g-product' },
  { id: 'u05', name: '钱七', groupId: 'g-product' },
  { id: 'u06', name: '孙八', groupId: 'g-product' },
  { id: 'u07', name: '周九', groupId: 'g-design'  },
  { id: 'u08', name: '吴十', groupId: 'g-design'  },
  { id: 'u09', name: '郑一', groupId: 'g-design'  },
  { id: 'u10', name: '陈二', groupId: 'g-test'    },
  { id: 'u11', name: '刘三', groupId: 'g-test'    },
  { id: 'u12', name: '黄四', groupId: 'g-test'    },
]

// ─── 确定性随机（基于种子，保证同一输入始终同一输出） ───

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

// ─── 生成时间序列 ───

function generateTimeSeries(days: number): TimeSeriesPoint[] {
  const rng = seededRandom(42)
  const points: TimeSeriesPoint[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const base = 50000 + rng() * 200000
    const inOutRatio = 0.55 + rng() * 0.15
    const callCount = Math.floor(20 + rng() * 80)
    points.push({
      time: dateStr,
      totalTokens: Math.round(base),
      inputTokens: Math.round(base * inOutRatio),
      outputTokens: Math.round(base * (1 - inOutRatio)),
      callCount,
      estimatedCost: calculateCost(base * inOutRatio, base * (1 - inOutRatio), 'GPT-4o'),
    })
  }
  return points
}

// ─── 生成用户用量 ───

function generateUserUsage(days: number): UserTokenUsage[] {
  const users: UserTokenUsage[] = []
  for (let i = 0; i < USERS.length; i++) {
    const user = USERS[i]
    const group = GROUPS.find(g => g.id === user.groupId)!
    const rng = seededRandom(100 + i * 7)

    // 每个用户使用 1-3 个模型
    const modelCount = 1 + Math.floor(rng() * 3)
    const models: UserTokenUsage['models'] = []
    let totalTokens = 0
    let totalInput = 0
    let totalOutput = 0
    let totalCost = 0
    let callCount = 0

    for (let m = 0; m < modelCount; m++) {
      const model = MODELS[(i + m) % MODELS.length]
      const base = 30000 + rng() * 180000
      const inOutRatio = 0.5 + rng() * 0.2
      const input = Math.round(base * inOutRatio)
      const output = Math.round(base * (1 - inOutRatio))
      const total = input + output
      const calls = Math.floor(10 + rng() * 50)
      models.push({
        model: model.name,
        totalTokens: total,
        callCount: calls,
      })
      totalInput += input
      totalOutput += output
      totalTokens += total
      totalCost += calculateTotalCost(model.name, input, output)
      callCount += calls
    }

    // 最近活跃日期
    const lastActive = new Date()
    lastActive.setDate(lastActive.getDate() - Math.floor(rng() * days))
    const lastActiveStr = lastActive.toISOString().slice(0, 10)

    // 不同用户用量差异大（开发组最多，设计组中等，产品/测试较少）
    const groupMultiplier =
      user.groupId === 'g-dev' ? 1.8 :
      user.groupId === 'g-design' ? 1.0 :
      user.groupId === 'g-product' ? 0.6 : 0.4
    const adjustedTokens = Math.round(totalTokens * groupMultiplier)
    const adjustedInput = Math.round(totalInput * groupMultiplier)
    const adjustedOutput = Math.round(totalOutput * groupMultiplier)
    const adjustedCost = totalCost * groupMultiplier
    const adjustedCalls = Math.round(callCount * groupMultiplier)

    // 随机头像色和活跃天数
    const avatarColors = ['#722ed1', '#1677ff', '#52c41a', '#fa8c16', '#13c2c2', '#eb2f96', '#f5222d', '#2f54eb']
    const activeDays = Math.max(3, days - Math.floor(rng() * 5))

    users.push({
      userId: user.id,
      userName: user.name,
      groupId: user.groupId,
      groupName: group.name,
      totalTokens: adjustedTokens,
      inputTokens: adjustedInput,
      outputTokens: adjustedOutput,
      estimatedCost: adjustedCost,
      callCount: adjustedCalls,
      percentage: 0, // 后面统一计算
      models,
      lastActive: lastActiveStr,
      activeDays,
      avatarColor: avatarColors[i % avatarColors.length],
    })
  }

  // 计算百分比
  const grandTotal = users.reduce((s, u) => s + u.totalTokens, 0)
  for (const u of users) {
    u.percentage = grandTotal > 0 ? Math.round((u.totalTokens / grandTotal) * 10000) / 100 : 0
  }

  return users
}

// ─── 生成模型分布 ───

function generateModelStats(users: UserTokenUsage[]): ModelTokenUsage[] {
  const map = new Map<string, { input: number; output: number; users: Set<string>; cost: number }>()
  for (const user of users) {
    for (const m of user.models) {
      const entry = map.get(m.model) || { input: 0, output: 0, users: new Set(), cost: 0 }
      // 按比例分摊用户用量到各模型
      const ratio = user.models.length > 0 ? 1 / user.models.length : 1
      entry.input += Math.round(user.inputTokens * ratio)
      entry.output += Math.round(user.outputTokens * ratio)
      entry.cost += user.estimatedCost * ratio
      entry.users.add(user.userId)
      map.set(m.model, entry)
    }
  }
  const models: ModelTokenUsage[] = []
  const grandTotal = [...map.values()].reduce((s, v) => s + v.input + v.output, 0)
  for (const [model, data] of map) {
    const total = data.input + data.output
    models.push({
      model,
      totalTokens: total,
      inputTokens: data.input,
      outputTokens: data.output,
      percentage: grandTotal > 0 ? Math.round((total / grandTotal) * 10000) / 100 : 0,
      userCount: data.users.size,
      estimatedCost: Math.round(data.cost * 100) / 100,
    })
  }
  return models.sort((a, b) => b.totalTokens - a.totalTokens)
}

// ─── 下钻维度 Mock 生成器 ───

/** 生成某用户的时间序列 */
function generateUserTimeSeries(userId: string, days: number): TimeSeriesPoint[] {
  const idx = USERS.findIndex(u => u.id === userId)
  const rng = seededRandom(500 + (idx >= 0 ? idx : 0) * 13)
  const points: TimeSeriesPoint[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const base = 5000 + rng() * 30000
    const inOutRatio = 0.5 + rng() * 0.2
    const total = Math.round(base)
    const callCount = Math.floor(3 + rng() * 20)
    points.push({
      time: dateStr,
      totalTokens: total,
      inputTokens: Math.round(total * inOutRatio),
      outputTokens: Math.round(total * (1 - inOutRatio)),
      callCount,
      estimatedCost: calculateCost(Math.round(total * inOutRatio), Math.round(total * (1 - inOutRatio)), 'GPT-4o'),
    })
  }
  return points
}

/** 生成某模型的用户排行 */
function generateModelUserRanking(model: string, days: number): ModelUserRanking[] {
  const rankings: ModelUserRanking[] = []
  const modelIdx = MODELS.findIndex(m => m.name === model)
  for (let i = 0; i < USERS.length; i++) {
    const user = USERS[i]
    const group = GROUPS.find(g => g.id === user.groupId)!
    const rng = seededRandom(600 + i * 11 + (modelIdx >= 0 ? modelIdx : 0) * 37)
    const usesThisModel = rng() > 0.2 // 80% 几率使用该模型
    if (!usesThisModel) continue
    const total = Math.round(5000 + rng() * 80000)
    const groupMultiplier =
      user.groupId === 'g-dev' ? 1.5 :
      user.groupId === 'g-design' ? 1.0 :
      user.groupId === 'g-product' ? 0.6 : 0.5
    const adjustedTotal = Math.round(total * groupMultiplier)
    rankings.push({
      userId: user.id,
      userName: user.name,
      groupName: group.name,
      totalTokens: adjustedTotal,
      percentage: 0, // 后面统一计算
      callCount: Math.floor(5 + rng() * 40),
    })
  }
  // 计算百分比
  const grandTotal = rankings.reduce((s, u) => s + u.totalTokens, 0)
  for (const r of rankings) {
    r.percentage = grandTotal > 0 ? Math.round((r.totalTokens / grandTotal) * 10000) / 100 : 0
  }
  return rankings.sort((a, b) => b.totalTokens - a.totalTokens)
}

/** 生成某群组的时间序列 */
function generateGroupTimeSeries(groupId: string, days: number): { total: TimeSeriesPoint[]; members: { userName: string; userId: string; values: number[] }[] } {
  const groupUsers = USERS.filter(u => u.groupId === groupId)
  const rng = seededRandom(700 + GROUPS.findIndex(g => g.id === groupId) * 19)
  const points: TimeSeriesPoint[] = []
  const now = new Date()
  const memberMultiplier = groupUsers.length / 3

  // 每成员的时序
  const memberSeries = groupUsers.map(u => {
    const mrng = seededRandom(1000 + USERS.indexOf(u) * 31)
    const values: number[] = []
    for (let i = days - 1; i >= 0; i--) {
      const base = (8000 + mrng() * 25000) * (u.groupId === 'g-dev' ? 1.4 : 1.0)
      values.push(Math.round(base))
    }
    return { userName: u.name, userId: u.id, values }
  })

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const base = (15000 + rng() * 60000) * memberMultiplier
    const inOutRatio = 0.5 + rng() * 0.2
    const total = Math.round(base)
    const callCount = Math.floor(8 + rng() * 30)
    points.push({
      time: dateStr,
      totalTokens: total,
      inputTokens: Math.round(total * inOutRatio),
      outputTokens: Math.round(total * (1 - inOutRatio)),
      callCount,
      estimatedCost: calculateCost(Math.round(total * inOutRatio), Math.round(total * (1 - inOutRatio)), 'GPT-4o'),
    })
  }
  return { total: points, members: memberSeries }
}

/** 生成某日的调用明细 */
function generateDayDetail(date: string): DayDetail {
  const rng = seededRandom(800 + new Date(date).getDate() * 41)
  const records: DailyCallRecord[] = []
  const activeCount = Math.floor(5 + rng() * (USERS.length - 5)) // 至少5人活跃
  const shuffled = [...USERS].sort(() => rng() - 0.5).slice(0, activeCount)

  for (const user of shuffled) {
    const group = GROUPS.find(g => g.id === user.groupId)!
    const modelCount = 1 + Math.floor(rng() * 2)
    for (let m = 0; m < modelCount; m++) {
      const model = MODELS[(USERS.indexOf(user) + m) % MODELS.length]
      const base = 500 + rng() * 15000
      const inOutRatio = 0.5 + rng() * 0.2
      const input = Math.round(base * inOutRatio)
      const output = Math.round(base * (1 - inOutRatio))
      records.push({
        userId: user.id,
        userName: user.name,
        model: model.name,
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
        groupId: user.groupId,
        groupName: group.name,
      })
    }
  }
  records.sort((a, b) => b.totalTokens - a.totalTokens)
  const totalTokens = records.reduce((s, r) => s + r.totalTokens, 0)
  return {
    date,
    records,
    summary: {
      totalTokens,
      callCount: records.length,
      userCount: new Set(records.map(r => r.userId)).size,
    },
  }
}

/** 生成某用户的调用记录 */
function generateUserCallRecords(userId: string, days: number): UserCallRecord[] {
  const idx = USERS.findIndex(u => u.id === userId)
  const rng = seededRandom(900 + (idx >= 0 ? idx : 0) * 17)
  const records: UserCallRecord[] = []
  const now = new Date()
  const recordCount = Math.floor(days * 2 + rng() * days * 2)
  for (let i = 0; i < recordCount; i++) {
    const dayOffset = Math.floor(rng() * days)
    const d = new Date(now)
    d.setDate(d.getDate() - dayOffset)
    const model = MODELS[Math.floor(rng() * MODELS.length)]
    const base = 500 + rng() * 15000
    const inOutRatio = 0.5 + rng() * 0.2
    const input = Math.round(base * inOutRatio)
    const output = Math.round(base * (1 - inOutRatio))
    records.push({
      time: d.toISOString().slice(0, 10),
      model: model.name,
      inputTokens: input,
      outputTokens: output,
      totalTokens: input + output,
    })
  }
  return records.sort((a, b) => b.time.localeCompare(a.time))
}

function calculateCost(inputTokens: number, outputTokens: number, modelName: string): number {
  const model = MODELS.find(m => m.name === modelName)
  if (!model) return 0
  return (inputTokens / 1_000_000) * model.inputPrice + (outputTokens / 1_000_000) * model.outputPrice
}

function calculateTotalCost(modelName: string, inputTokens: number, outputTokens: number): number {
  return calculateCost(inputTokens, outputTokens, modelName)
}

// ─── API 函数（与真实后端签名一致） ───

/** 模拟网络延迟 */
function delay(ms = 200): Promise<void> {
  return new Promise(r => setTimeout(r, ms + Math.random() * 150))
}

/**
 * 获取监控看板数据（支持多维下钻）
 * @param params 查询参数（period, days, search, groupId, model, context）
 */
export async function getMonitorData(params: MonitorQueryParams = {}): Promise<MonitorData> {
  await delay()

  const days = params.days || 7
  const period = params.period || 'daily'
  const ctx = params.context

  // ─── 基���数据 ───
  const allUsers = generateUserUsage(days)
  const allModels = generateModelStats(allUsers)
  const groups: UserGroup[] = GROUPS.map(g => ({
    ...g,
    memberCount: USERS.filter(u => u.groupId === g.id).length,
  }))

  // ─── 全量视图（默认） ───
  if (!ctx || ctx.type === 'all') {
    let users = allUsers
    let models = allModels
    let timeSeries = generateTimeSeries(days)

    if (params.search) {
      const kw = params.search.toLowerCase()
      users = users.filter(u => u.userName.toLowerCase().includes(kw) || u.groupName.toLowerCase().includes(kw))
    }
    if (params.groupId) {
      users = users.filter(u => u.groupId === params.groupId)
    }
    if (params.model) {
      users = users.filter(u => u.models.some(m => m.model === params.model))
    }

    const filteredTotal = users.reduce((s, u) => s + u.totalTokens, 0)
    for (const u of users) {
      u.percentage = filteredTotal > 0 ? Math.round((u.totalTokens / filteredTotal) * 10000) / 100 : 0
    }
    users.sort((a, b) => b.totalTokens - a.totalTokens)

    return {
      period, days,
      overview: {
        totalTokens: users.reduce((s, u) => s + u.totalTokens, 0),
        estimatedCost: Math.round(users.reduce((s, u) => s + u.estimatedCost, 0) * 100) / 100,
        activeUsers: users.length,
        avgTokensPerUser: users.length > 0
          ? Math.round(users.reduce((s, u) => s + u.totalTokens, 0) / users.length) : 0,
        totalCallCount: users.reduce((s, u) => s + u.callCount, 0),
      },
      users, groups, models, timeSeries,
      context: { type: 'all', label: '全量' },
    }
  }

  // ─── 用户视图 ───
  if (ctx.type === 'user' && ctx.userId) {
    const user = allUsers.find(u => u.userId === ctx.userId)
    if (!user) throw new Error(`User ${ctx.userId} not found`)

    // 该用户的模型分布（柱状图）
    const userModelBars = user.models.map(m => ({
      userId: user.userId,
      userName: user.userName,
      groupName: user.groupName,
      totalTokens: m.totalTokens,
      percentage: 0,
      callCount: m.callCount,
    }))
    const barTotal = userModelBars.reduce((s, m) => s + m.totalTokens, 0)
    for (const m of userModelBars) {
      m.percentage = barTotal > 0 ? Math.round((m.totalTokens / barTotal) * 10000) / 100 : 0
    }

    const userTimeSeries = generateUserTimeSeries(ctx.userId, days)
    const userRecords = generateUserCallRecords(ctx.userId, days)

    // 该用户的模型占比（环形图）
    const userModels: ModelTokenUsage[] = user.models.map(m => ({
      model: m.model,
      totalTokens: m.totalTokens,
      inputTokens: Math.round(m.totalTokens * 0.6),
      outputTokens: Math.round(m.totalTokens * 0.4),
      percentage: barTotal > 0 ? Math.round((m.totalTokens / barTotal) * 10000) / 100 : 0,
      userCount: 1,
      estimatedCost: calculateTotalCost(m.model, Math.round(m.totalTokens * 0.6), Math.round(m.totalTokens * 0.4)),
    }))

    return {
      period, days,
      context: ctx,
      overview: {
        totalTokens: user.totalTokens,
        estimatedCost: Math.round(user.estimatedCost * 100) / 100,
        activeUsers: 1,
        avgTokensPerUser: user.totalTokens,
        totalCallCount: user.callCount,
        userName: user.userName,
      },
      users: [user],
      groups,
      models: userModels,
      timeSeries: userTimeSeries,
      userCallRecords: userRecords,
    }
  }

  // ─── 模型视图 ───
  if (ctx.type === 'model' && ctx.model) {
    const modelRanking = generateModelUserRanking(ctx.model, days)
    const modelTimeSeries = generateTimeSeries(days).map(p => ({
      ...p,
      totalTokens: Math.round(p.totalTokens * 0.35),
      inputTokens: Math.round(p.inputTokens * 0.35),
      outputTokens: Math.round(p.outputTokens * 0.35),
      callCount: Math.round(p.callCount * 0.3),
      estimatedCost: p.estimatedCost * 0.35,
    }))
    const rankingTotal = modelRanking.reduce((s, r) => s + r.totalTokens, 0)
    const modelUsers: UserTokenUsage[] = modelRanking.map(r => {
      const origUser = allUsers.find(u => u.userId === r.userId)
      return {
        userId: r.userId,
        userName: r.userName,
        groupId: origUser?.groupId || '',
        groupName: r.groupName,
        totalTokens: r.totalTokens,
        inputTokens: Math.round(r.totalTokens * 0.6),
        outputTokens: Math.round(r.totalTokens * 0.4),
        estimatedCost: calculateTotalCost(ctx.model!, Math.round(r.totalTokens * 0.6), Math.round(r.totalTokens * 0.4)),
        callCount: r.callCount,
        percentage: rankingTotal > 0 ? Math.round((r.totalTokens / rankingTotal) * 10000) / 100 : 0,
        models: [{ model: ctx.model!, totalTokens: r.totalTokens, callCount: r.callCount }],
        lastActive: new Date().toISOString().slice(0, 10),
      }
    })

    // 该模型的高亮环形图
    const modelData: ModelTokenUsage[] = [{
      model: ctx.model,
      totalTokens: rankingTotal,
      inputTokens: Math.round(rankingTotal * 0.6),
      outputTokens: Math.round(rankingTotal * 0.4),
      percentage: 100,
      userCount: modelRanking.length,
      estimatedCost: modelUsers.reduce((s, u) => s + u.estimatedCost, 0),
    }]

    return {
      period, days,
      context: ctx,
      overview: {
        totalTokens: rankingTotal,
        estimatedCost: modelUsers.reduce((s, u) => s + u.estimatedCost, 0),
        activeUsers: modelRanking.length,
        avgTokensPerUser: modelRanking.length > 0 ? Math.round(rankingTotal / modelRanking.length) : 0,
        totalCallCount: modelRanking.reduce((s, r) => s + r.callCount, 0),
        modelName: ctx.model,
        inputOutputRatio: modelUsers.length > 0
          ? Math.round((modelUsers.reduce((s, u) => s + u.inputTokens, 0) / Math.max(1, modelUsers.reduce((s, u) => s + u.outputTokens, 0))) * 10) / 10
          : 0,
      },
      users: modelUsers,
      groups,
      models: modelData,
      timeSeries: modelTimeSeries,
      modelUserRanking: modelRanking,
    }
  }

  // ─── 群组视图 ───
  if (ctx.type === 'group' && ctx.groupId) {
    const group = GROUPS.find(g => g.id === ctx.groupId)
    if (!group) throw new Error(`Group ${ctx.groupId} not found`)

    let groupUsers = allUsers.filter(u => u.groupId === ctx.groupId)
    const groupTotal = groupUsers.reduce((s, u) => s + u.totalTokens, 0)
    for (const u of groupUsers) {
      u.percentage = groupTotal > 0 ? Math.round((u.totalTokens / groupTotal) * 10000) / 100 : 0
    }
    groupUsers.sort((a, b) => b.totalTokens - a.totalTokens)

    const groupModels = generateModelStats(groupUsers)
    const groupTs = generateGroupTimeSeries(ctx.groupId, days)

    return {
      period, days,
      context: ctx,
      overview: {
        totalTokens: groupTotal,
        estimatedCost: Math.round(groupUsers.reduce((s, u) => s + u.estimatedCost, 0) * 100) / 100,
        activeUsers: groupUsers.length,
        avgTokensPerUser: groupUsers.length > 0 ? Math.round(groupTotal / groupUsers.length) : 0,
        totalCallCount: groupUsers.reduce((s, u) => s + u.callCount, 0),
        groupName: group.name,
      },
      users: groupUsers,
      groups,
      models: groupModels,
      timeSeries: groupTs.total,
      memberBreakdown: groupTs.members,
    }
  }

  // ─── 日期视图 ───
  if (ctx.type === 'date' && ctx.date) {
    const dayDetail = generateDayDetail(ctx.date)
    const allData = await getMonitorData({ ...params, context: undefined })

    return {
      ...allData,
      context: ctx,
      dayDetail,
    }
  }

  // fallback
  const timeSeriesRaw = generateTimeSeries(days)
  return {
    period, days,
    overview: {
      totalTokens: allUsers.reduce((s, u) => s + u.totalTokens, 0),
      estimatedCost: Math.round(allUsers.reduce((s, u) => s + u.estimatedCost, 0) * 100) / 100,
      activeUsers: allUsers.length,
      avgTokensPerUser: allUsers.length > 0
        ? Math.round(allUsers.reduce((s, u) => s + u.totalTokens, 0) / allUsers.length) : 0,
      totalCallCount: allUsers.reduce((s, u) => s + u.callCount, 0),
    },
    users: allUsers, groups, models: allModels, timeSeries: timeSeriesRaw,
  }
}

/**
 * 获取群组列表
 */
export async function getGroups(): Promise<UserGroup[]> {
  await delay(80)
  return GROUPS.map(g => ({
    ...g,
    memberCount: USERS.filter(u => u.groupId === g.id).length,
  }))
}

export default {
  getMonitorData,
  getGroups,
}
