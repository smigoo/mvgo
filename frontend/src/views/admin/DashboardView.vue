<template>
  <div class="mg-root">
    <header class="mg-header">
      <div>
        <h1 class="mg-title">平台概览</h1>
        <p class="mg-sub">管理员 · 核心指标与趋势</p>
      </div>
      <a-tag color="blue" class="mg-readonly-tag">管理员</a-tag>
    </header>

    <!-- 时间窗选择 -->
    <div class="ts-window-bar">
      <span class="ts-window-label">时间窗</span>
      <a-select v-model="timePreset" class="ts-window-select" @change="loadDashboard">
        <a-select-option value="all">全部时间</a-select-option>
        <a-select-option value="week">本周</a-select-option>
        <a-select-option value="d30">近 30 天</a-select-option>
        <a-select-option value="d60">近 60 天</a-select-option>
      </a-select>
      <span class="ts-window-info">{{ dashboard.windowLabel || '加载中...' }}</span>
      <a-button size="small" @click="loadDashboard">刷新</a-button>
    </div>

    <!-- KPI 卡片 -->
    <div class="dashboard-kpi-grid">
      <div class="dashboard-kpi-card">
        <div class="dashboard-kpi-label">任务总量</div>
        <div class="dashboard-kpi-value">{{ dashboard.overview?.totalTasks || 0 }}</div>
        <div class="dashboard-kpi-sub">
          成功 {{ dashboard.overview?.completedTasks || 0 }} · 失败 {{ dashboard.overview?.failedTasks || 0 }}
        </div>
      </div>
      <div class="dashboard-kpi-card">
        <div class="dashboard-kpi-label">整体成功率</div>
        <div class="dashboard-kpi-value" :style="{ color: successRateColor(dashboard.overview?.successRate) }">
          {{ rateText(dashboard.overview?.successRate) }}
        </div>
        <div class="dashboard-kpi-sub">目标 ≥ 80%</div>
      </div>
      <div class="dashboard-kpi-card">
        <div class="dashboard-kpi-label">一次成功率</div>
        <div class="dashboard-kpi-value" :style="{ color: successRateColor(dashboard.overview?.firstTrySuccessRate) }">
          {{ rateText(dashboard.overview?.firstTrySuccessRate) }}
        </div>
        <div class="dashboard-kpi-sub">无需重试</div>
      </div>
      <div class="dashboard-kpi-card">
        <div class="dashboard-kpi-label">平均耗时</div>
        <div class="dashboard-kpi-value">{{ formatDurationMs(dashboard.overview?.avgDurationMs || 0) }}</div>
        <div class="dashboard-kpi-sub">仅成功任务</div>
      </div>
      <div class="dashboard-kpi-card">
        <div class="dashboard-kpi-label">Token 消耗</div>
        <div class="dashboard-kpi-value">{{ formatTokens(dashboard.overview?.totalTokens || 0) }}</div>
        <div class="dashboard-kpi-sub">活跃用户 {{ dashboard.overview?.activeUsers || 0 }}</div>
      </div>
      <div class="dashboard-kpi-card">
        <div class="dashboard-kpi-label">总成本</div>
        <div class="dashboard-kpi-value">¥{{ (dashboard.overview?.totalCost || 0).toFixed(2) }}</div>
        <div class="dashboard-kpi-sub">平均 ¥{{ (dashboard.overview?.avgCostPerTask || 0).toFixed(4) }}/任务</div>
      </div>
    </div>

    <!-- 两栏布局：模型排行 + 失败归因 -->
    <div class="dashboard-two-col">
      <div class="dashboard-card">
        <h3 class="dashboard-card-title">🏆 模型效率排行（Top 10）</h3>
        <div v-if="loading" class="dashboard-loading">加载中...</div>
        <div v-else-if="dashboard.modelRanking?.length === 0" class="dashboard-empty">暂无数据</div>
        <div v-else class="dashboard-model-ranking">
          <div v-for="(m, idx) in dashboard.modelRanking" :key="idx" class="dashboard-model-row">
            <div class="dashboard-model-rank">{{ idx + 1 }}</div>
            <div class="dashboard-model-info">
              <div class="dashboard-model-name" :title="m.model">
                <a-tag :color="m.type === 'vision' ? 'purple' : 'cyan'" size="small">
                  {{ m.type === 'vision' ? '视觉' : '文本' }}
                </a-tag>
                {{ shortModel(m.model) }}
              </div>
              <div class="dashboard-model-meta">
                <span>成功率 {{ rateText(m.successRate) }}</span>
                <span v-if="m.secPer100LinesP50 !== null">· {{ m.secPer100LinesP50.toFixed(1) }}s/百行</span>
                <span v-if="m.tokenKPer100LinesP50 !== null">· {{ m.tokenKPer100LinesP50.toFixed(2) }}K/百行</span>
              </div>
            </div>
            <div class="dashboard-model-tasks">{{ m.taskCount }} 任务</div>
          </div>
        </div>
      </div>

      <div class="dashboard-card">
        <h3 class="dashboard-card-title">🔍 失败归因分布</h3>
        <div v-if="loading" class="dashboard-loading">加载中...</div>
        <div v-else-if="dashboard.failDistribution?.total === 0" class="dashboard-empty">暂无失败</div>
        <div v-else class="dashboard-fail-distribution">
          <div class="dashboard-fail-bar">
            <div
              class="dashboard-fail-segment quality"
              :style="{ width: `${(dashboard.failDistribution?.qualityRate || 0) * 100}%` }"
            >
              {{ (dashboard.failDistribution?.qualityRate || 0) > 0.1 ? `${((dashboard.failDistribution?.qualityRate || 0) * 100).toFixed(0)}%` : '' }}
            </div>
            <div
              class="dashboard-fail-segment env"
              :style="{ width: `${(dashboard.failDistribution?.envRate || 0) * 100}%` }"
            >
              {{ (dashboard.failDistribution?.envRate || 0) > 0.1 ? `${((dashboard.failDistribution?.envRate || 0) * 100).toFixed(0)}%` : '' }}
            </div>
            <div
              class="dashboard-fail-segment other"
              :style="{ width: `${(dashboard.failDistribution?.otherRate || 0) * 100}%` }"
            >
              {{ (dashboard.failDistribution?.otherRate || 0) > 0.1 ? `${((dashboard.failDistribution?.otherRate || 0) * 100).toFixed(0)}%` : '' }}
            </div>
          </div>
          <div class="dashboard-fail-legend">
            <div class="dashboard-fail-item">
              <span class="dashboard-fail-dot quality"></span>
              <span>质量失败（归模型）</span>
              <span class="dashboard-fail-count">{{ dashboard.failDistribution?.quality || 0 }}</span>
            </div>
            <div class="dashboard-fail-item">
              <span class="dashboard-fail-dot env"></span>
              <span>环境失败（归基础设施）</span>
              <span class="dashboard-fail-count">{{ dashboard.failDistribution?.env || 0 }}</span>
            </div>
            <div class="dashboard-fail-item">
              <span class="dashboard-fail-dot other"></span>
              <span>其他（归管线 bug）</span>
              <span class="dashboard-fail-count">{{ dashboard.failDistribution?.other || 0 }}</span>
            </div>
          </div>
          <div class="dashboard-fail-total">共 {{ dashboard.failDistribution?.total || 0 }} 次失败</div>
        </div>
      </div>
    </div>

    <!-- 模型性价比矩阵 -->
    <div class="dashboard-card">
      <h3 class="dashboard-card-title">💎 模型性价比矩阵</h3>
      <div v-if="loading" class="dashboard-loading">加载中...</div>
      <div v-else-if="dashboard.modelScatterData?.length === 0" class="dashboard-empty">暂无数据</div>
      <div v-else class="dashboard-scatter-chart">
        <svg :viewBox="`0 0 ${scatterChartWidth} ${scatterChartHeight}`" class="dashboard-scatter-svg">
          <!-- 背景网格 -->
          <line
            v-for="(tick, i) in scatterYTicks"
            :key="'ygrid-' + i"
            :x1="scatterChartPadding"
            :y1="tick.y"
            :x2="scatterChartWidth - scatterChartPadding"
            :y2="tick.y"
            stroke="#f0f0f0"
            stroke-width="1"
          />
          <line
            v-for="(tick, i) in scatterXTicks"
            :key="'xgrid-' + i"
            :x1="tick.x"
            :y1="scatterChartPadding"
            :x2="tick.x"
            :y2="scatterChartHeight - scatterChartPadding"
            stroke="#f0f0f0"
            stroke-width="1"
          />
          <!-- Y 轴 -->
          <line
            :x1="scatterChartPadding"
            :y1="scatterChartPadding"
            :x2="scatterChartPadding"
            :y2="scatterChartHeight - scatterChartPadding"
            stroke="#d9d9d9"
            stroke-width="1"
          />
          <!-- X 轴 -->
          <line
            :x1="scatterChartPadding"
            :y1="scatterChartHeight - scatterChartPadding"
            :x2="scatterChartWidth - scatterChartPadding"
            :y2="scatterChartHeight - scatterChartPadding"
            stroke="#d9d9d9"
            stroke-width="1"
          />
          <!-- Y 轴刻度 -->
          <text
            v-for="(tick, i) in scatterYTicks"
            :key="'ytick-' + i"
            :x="scatterChartPadding - 8"
            :y="tick.y + 4"
            text-anchor="end"
            font-size="11"
            fill="#666"
          >
            {{ tick.label }}
          </text>
          <!-- X 轴刻度 -->
          <text
            v-for="(tick, i) in scatterXTicks"
            :key="'xtick-' + i"
            :x="tick.x"
            :y="scatterChartHeight - scatterChartPadding + 18"
            text-anchor="middle"
            font-size="11"
            fill="#666"
          >
            {{ tick.label }}
          </text>
          <!-- 轴标签 -->
          <text
            :x="scatterChartWidth / 2"
            :y="scatterChartHeight - 5"
            text-anchor="middle"
            font-size="12"
            fill="#666"
          >
            成本（元/百行）
          </text>
          <text
            :x="12"
            :y="scatterChartHeight / 2"
            text-anchor="middle"
            font-size="12"
            fill="#666"
            :transform="`rotate(-90, 12, ${scatterChartHeight / 2})`"
          >
            成功率
          </text>
          <!-- 散点 -->
          <circle
            v-for="(point, i) in scatterPoints"
            :key="'scatter-' + i"
            :cx="point.x"
            :cy="point.y"
            :r="point.r"
            :fill="point.color"
            :opacity="0.7"
            :stroke="point.color"
            stroke-width="2"
          >
            <title>{{ point.tooltip }}</title>
          </circle>
          <!-- 图例 -->
          <circle :cx="scatterChartWidth - 100" :cy="20" r="6" fill="#1890ff" opacity="0.7" />
          <text :x="scatterChartWidth - 88" :y="24" font-size="12" fill="#666">文本模型</text>
          <circle :cx="scatterChartWidth - 100" :cy="40" r="6" fill="#722ed1" opacity="0.7" />
          <text :x="scatterChartWidth - 88" :y="44" font-size="12" fill="#666">视觉模型</text>
        </svg>
      </div>
    </div>

    <!-- 效率趋势 -->
    <div class="dashboard-card">
      <h3 class="dashboard-card-title">📈 效率趋势</h3>
      <div v-if="loading" class="dashboard-loading">加载中...</div>
      <div v-else-if="dashboard.trends?.length === 0" class="dashboard-empty">暂无数据</div>
      <div v-else class="dashboard-trend-chart">
        <svg :viewBox="`0 0 ${trendChartWidth} ${trendChartHeight}`" class="dashboard-trend-svg">
          <!-- 背景网格 -->
          <line
            v-for="(tick, i) in trendTicks"
            :key="'grid-' + i"
            :x1="trendChartPadding"
            :y1="tick.y"
            :x2="trendChartWidth - trendChartPadding"
            :y2="tick.y"
            stroke="#f0f0f0"
            stroke-width="1"
          />
          <!-- 80% 参考线 -->
          <line
            :x1="trendChartPadding"
            :y1="trendChartPadding + (trendChartHeight - 2 * trendChartPadding) * 0.2"
            :x2="trendChartWidth - trendChartPadding"
            :y2="trendChartPadding + (trendChartHeight - 2 * trendChartPadding) * 0.2"
            stroke="#52c41a"
            stroke-width="1"
            stroke-dasharray="4,4"
            opacity="0.5"
          />
          <text
            :x="trendChartWidth - trendChartPadding + 5"
            :y="trendChartPadding + (trendChartHeight - 2 * trendChartPadding) * 0.2 + 4"
            font-size="10"
            fill="#52c41a"
          >
            80%
          </text>
          <!-- Y 轴 -->
          <line
            :x1="trendChartPadding"
            :y1="trendChartPadding"
            :x2="trendChartPadding"
            :y2="trendChartHeight - trendChartPadding"
            stroke="#d9d9d9"
            stroke-width="1"
          />
          <!-- X 轴 -->
          <line
            :x1="trendChartPadding"
            :y1="trendChartHeight - trendChartPadding"
            :x2="trendChartWidth - trendChartPadding"
            :y2="trendChartHeight - trendChartPadding"
            stroke="#d9d9d9"
            stroke-width="1"
          />
          <!-- Y 轴刻度 -->
          <text
            v-for="(tick, i) in trendTicks"
            :key="'y-' + i"
            :x="trendChartPadding - 8"
            :y="tick.y + 4"
            text-anchor="end"
            font-size="11"
            fill="#666"
          >
            {{ tick.label }}
          </text>
          <!-- 面积填充 -->
          <polygon :points="trendAreaPoints" fill="url(#trendGradient)" opacity="0.3" />
          <!-- 折线 -->
          <polyline
            :points="trendLinePoints"
            fill="none"
            stroke="#1890ff"
            stroke-width="2.5"
            stroke-linejoin="round"
          />
          <!-- 数据点 -->
          <circle
            v-for="(point, i) in trendPoints"
            :key="'p-' + i"
            :cx="point.x"
            :cy="point.y"
            r="4"
            fill="#fff"
            stroke="#1890ff"
            stroke-width="2"
          >
            <title>{{ point.tooltip }}</title>
          </circle>
          <!-- X 轴标签 -->
          <text
            v-for="(point, i) in trendPoints.filter((_, idx) => idx % Math.ceil((dashboard.trends?.length || 1) / 8) === 0)"
            :key="'x-' + i"
            :x="point.x"
            :y="trendChartHeight - trendChartPadding + 18"
            text-anchor="middle"
            font-size="11"
            fill="#666"
          >
            {{ point.dateLabel }}
          </text>
          <!-- 渐变定义 -->
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#1890ff" stop-opacity="0.4" />
              <stop offset="100%" stop-color="#1890ff" stop-opacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import http from '@/core/http'

const loading = ref(false)
const timePreset = ref('d30')

const dashboard = ref({
  overview: {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    successRate: null,
    firstTrySuccessRate: null,
    avgDurationMs: 0,
    totalTokens: 0,
    totalCost: 0,
    avgCostPerTask: 0,
    activeUsers: 0,
  },
  modelRanking: [],
  modelScatterData: [],
  failDistribution: {
    quality: 0,
    env: 0,
    other: 0,
    total: 0,
    qualityRate: 0,
    envRate: 0,
    otherRate: 0,
  },
  trends: [],
  windowLabel: '',
})

// 加载仪表台数据
async function loadDashboard() {
  loading.value = true
  try {
    const res = await http.get(`/api/task-stats/dashboard?preset=${timePreset.value}`)
    // http.get 返回响应体本身，后端返回 { success, data: { overview, modelRanking, ... }, source }
    if (res && res.success && res.data) {
      dashboard.value = {
        overview: res.data.overview || dashboard.value.overview,
        modelRanking: res.data.modelRanking || [],
        modelScatterData: res.data.modelScatterData || [],
        failDistribution: res.data.failDistribution || dashboard.value.failDistribution,
        trends: res.data.trends || [],
        windowLabel: res.data.windowLabel || '',
      }
    }
  } catch (err) {
    console.error('[DashboardView] 加载失败:', err)
  } finally {
    loading.value = false
  }
}

// 工具函数
function rateText(rate) {
  if (rate === null || rate === undefined) return '-'
  return `${(rate * 100).toFixed(1)}%`
}

function successRateColor(rate) {
  if (rate === null || rate === undefined) return '#666'
  if (rate >= 0.8) return '#52c41a'
  if (rate >= 0.6) return '#faad14'
  return '#f5222d'
}

function formatDurationMs(ms) {
  if (!ms || ms <= 0) return '-'
  if (ms < 1000) return `${ms}ms`
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const remainSec = sec % 60
  return `${min}m ${remainSec}s`
}

function formatTokens(tokens) {
  if (!tokens || tokens <= 0) return '-'
  if (tokens < 1000) return `${tokens}`
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`
  return `${(tokens / 1000000).toFixed(2)}M`
}

function shortModel(model) {
  if (!model) return '-'
  // 提取模型名称的最后部分（去掉 provider 前缀）
  const parts = model.split('/')
  return parts[parts.length - 1] || model
}

// 趋势图配置
const trendChartWidth = 800
const trendChartHeight = 300
const trendChartPadding = 40

const trendTicks = computed(() => {
  const ticks = []
  const steps = [0, 0.25, 0.5, 0.75, 1]
  for (const step of steps) {
    const y = trendChartPadding + (trendChartHeight - 2 * trendChartPadding) * step
    const value = (1 - step) * 100
    ticks.push({ y, label: `${value.toFixed(0)}%` })
  }
  return ticks
})

const trendPoints = computed(() => {
  const trends = dashboard.value.trends || []
  if (trends.length === 0) return []

  const chartWidth = trendChartWidth - 2 * trendChartPadding
  const chartHeight = trendChartHeight - 2 * trendChartPadding

  return trends.map((point, idx) => {
    const x = trendChartPadding + (chartWidth * idx) / Math.max(trends.length - 1, 1)
    const rate = point.successRate || 0
    const y = trendChartPadding + chartHeight * (1 - rate)

    const date = new Date(point.timestamp)
    const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`
    const tooltip = `${dateLabel}: 成功率 ${(rate * 100).toFixed(1)}%`

    return { x, y, dateLabel, tooltip }
  })
})

const trendLinePoints = computed(() => {
  return trendPoints.value.map((p) => `${p.x},${p.y}`).join(' ')
})

const trendAreaPoints = computed(() => {
  const points = trendPoints.value
  if (points.length === 0) return ''

  const bottomY = trendChartHeight - trendChartPadding
  const firstX = points[0].x
  const lastX = points[points.length - 1].x

  return `${firstX},${bottomY} ${trendLinePoints.value} ${lastX},${bottomY}`
})

// 散点图配置
const scatterChartWidth = 800
const scatterChartHeight = 400
const scatterChartPadding = 60

const scatterYTicks = computed(() => {
  const ticks = []
  const steps = [0, 0.25, 0.5, 0.75, 1]
  for (const step of steps) {
    const y = scatterChartPadding + (scatterChartHeight - 2 * scatterChartPadding) * step
    const value = (1 - step) * 100
    ticks.push({ y, label: `${value.toFixed(0)}%` })
  }
  return ticks
})

const scatterXTicks = computed(() => {
  const data = dashboard.value.modelScatterData || []
  if (data.length === 0) return []
  
  const maxCost = Math.max(...data.map(d => d.avgCostPer100Lines || 0))
  const ticks = []
  const steps = [0, 0.25, 0.5, 0.75, 1]
  const chartWidth = scatterChartWidth - 2 * scatterChartPadding
  
  for (const step of steps) {
    const x = scatterChartPadding + chartWidth * step
    const value = step * maxCost
    ticks.push({ x, label: `¥${value.toFixed(2)}` })
  }
  return ticks
})

const scatterPoints = computed(() => {
  const data = dashboard.value.modelScatterData || []
  if (data.length === 0) return []
  
  const maxCost = Math.max(...data.map(d => d.avgCostPer100Lines || 0))
  const maxTasks = Math.max(...data.map(d => d.taskCount || 1))
  const chartWidth = scatterChartWidth - 2 * scatterChartPadding
  const chartHeight = scatterChartHeight - 2 * scatterChartPadding
  
  return data.map(d => {
    const cost = d.avgCostPer100Lines || 0
    const successRate = d.successRate || 0
    const taskCount = d.taskCount || 1
    const isVision = d.type === 'vision'
    
    const x = scatterChartPadding + (chartWidth * cost) / Math.max(maxCost, 0.01)
    const y = scatterChartPadding + chartHeight * (1 - successRate)
    const r = Math.max(6, Math.min(20, 6 + (taskCount / maxTasks) * 14))
    const color = isVision ? '#722ed1' : '#1890ff'
    
    const tooltip = `${d.model}\n成功率: ${(successRate * 100).toFixed(1)}%\n成本: ¥${cost.toFixed(4)}/百行\n任务数: ${taskCount}`
    
    return { x, y, r, color, tooltip, model: d.model }
  })
})

onMounted(() => {
  loadDashboard()
})
</script>

<style scoped>
.mg-root {
  max-width: 1400px;
  margin: 0 auto;
}

.mg-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.mg-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: rgba(0, 0, 0, 0.85);
}

.mg-sub {
  font-size: 14px;
  color: rgba(0, 0, 0, 0.45);
  margin: 0;
}

.mg-readonly-tag {
  margin-top: 4px;
}

.ts-window-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #fafafa;
  border-radius: 6px;
  margin-bottom: 24px;
}

.ts-window-label {
  font-size: 14px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.85);
}

.ts-window-select {
  width: 140px;
}

.ts-window-info {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  margin-left: auto;
}

.dashboard-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.dashboard-kpi-card {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 20px;
  transition: box-shadow 0.2s;
}

.dashboard-kpi-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.dashboard-kpi-label {
  font-size: 14px;
  color: rgba(0, 0, 0, 0.45);
  margin-bottom: 8px;
}

.dashboard-kpi-value {
  font-size: 32px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.85);
  margin-bottom: 8px;
  line-height: 1;
}

.dashboard-kpi-sub {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
}

.dashboard-two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}

.dashboard-card {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.dashboard-card-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: rgba(0, 0, 0, 0.85);
}

.dashboard-loading,
.dashboard-empty {
  text-align: center;
  padding: 40px;
  color: rgba(0, 0, 0, 0.45);
  font-size: 14px;
}

.dashboard-model-ranking {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dashboard-model-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 6px;
  transition: background 0.2s;
}

.dashboard-model-row:hover {
  background: #fafafa;
}

.dashboard-model-rank {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.65);
}

.dashboard-model-info {
  flex: 1;
  min-width: 0;
}

.dashboard-model-name {
  font-size: 14px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.85);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-model-meta {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.dashboard-model-tasks {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.65);
  white-space: nowrap;
}

.dashboard-fail-distribution {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dashboard-fail-bar {
  display: flex;
  height: 32px;
  border-radius: 6px;
  overflow: hidden;
  background: #f5f5f5;
}

.dashboard-fail-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  transition: width 0.3s;
}

.dashboard-fail-segment.quality {
  background: #f5222d;
}

.dashboard-fail-segment.env {
  background: #faad14;
}

.dashboard-fail-segment.other {
  background: #8c8c8c;
}

.dashboard-fail-legend {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dashboard-fail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.65);
}

.dashboard-fail-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.dashboard-fail-dot.quality {
  background: #f5222d;
}

.dashboard-fail-dot.env {
  background: #faad14;
}

.dashboard-fail-dot.other {
  background: #8c8c8c;
}

.dashboard-fail-count {
  margin-left: auto;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.85);
}

.dashboard-fail-total {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
  text-align: right;
  margin-top: 8px;
}

.dashboard-trend-chart {
  width: 100%;
  overflow-x: auto;
}

.dashboard-trend-svg {
  width: 100%;
  height: auto;
  min-height: 300px;
}

.dashboard-scatter-chart {
  width: 100%;
  overflow-x: auto;
}

.dashboard-scatter-svg {
  width: 100%;
  height: auto;
  min-height: 400px;
}
</style>
