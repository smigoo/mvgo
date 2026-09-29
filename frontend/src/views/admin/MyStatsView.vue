<template>
  <div class="my-stats-view">
    <div class="page-header">
      <h2>我的任务统计</h2>
      <div class="time-filter">
        <a-radio-group v-model:value="timePreset" button-style="solid" @change="loadMyStats">
          <a-radio-button value="d7">近7天</a-radio-button>
          <a-radio-button value="d30">近30天</a-radio-button>
          <a-radio-button value="d90">近90天</a-radio-button>
          <a-radio-button value="all">全部</a-radio-button>
        </a-radio-group>
      </div>
    </div>

    <a-spin :spinning="loading">
      <!-- KPI 卡片 -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">我的任务总数</div>
          <div class="kpi-value">{{ myStats.overview.totalTasks }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">已完成</div>
          <div class="kpi-value success">{{ myStats.overview.completedTasks }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">失败</div>
          <div class="kpi-value danger">{{ myStats.overview.failedTasks }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">成功率</div>
          <div class="kpi-value">{{ formatPercent(myStats.overview.successRate) }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">一次成功率</div>
          <div class="kpi-value">{{ formatPercent(myStats.overview.firstTrySuccessRate) }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">平均耗时</div>
          <div class="kpi-value">{{ formatDuration(myStats.overview.avgDurationMs) }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">消耗 Tokens</div>
          <div class="kpi-value">{{ formatNumber(myStats.overview.totalTokens) }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">我的成本</div>
          <div class="kpi-value">¥{{ myStats.overview.totalCost?.toFixed(2) || '0.00' }}</div>
        </div>
      </div>

      <!-- 常用模型排行 -->
      <div class="section" v-if="myStats.myModels?.length">
        <h3>常用模型排行</h3>
        <a-table
          :dataSource="myStats.myModels"
          :columns="modelColumns"
          :pagination="false"
          rowKey="model"
          size="small"
        />
      </div>

      <div class="window-label" v-if="myStats.windowLabel">
        统计时间窗口：{{ myStats.windowLabel }}
      </div>
    </a-spin>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import http from '@/core/http'

const loading = ref(false)
const timePreset = ref('d30')

const myStats = ref({
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
  },
  myModels: [],
  windowLabel: '',
})

const modelColumns = [
  { title: '模型', dataIndex: 'model', key: 'model' },
  { title: '任务数', dataIndex: 'taskCount', key: 'taskCount', sorter: (a, b) => a.taskCount - b.taskCount },
  { title: '成功率', dataIndex: 'successRate', key: 'successRate', customRender: ({ text }) => formatPercent(text) },
  { title: '平均耗时(s)', dataIndex: 'avgDurationSec', key: 'avgDurationSec', customRender: ({ text }) => text?.toFixed(1) || '-' },
  { title: '消耗 Tokens', dataIndex: 'totalTokens', key: 'totalTokens', customRender: ({ text }) => formatNumber(text) },
]

const formatPercent = (val) => {
  if (val === null || val === undefined) return '-'
  return (val * 100).toFixed(1) + '%'
}

const formatDuration = (ms) => {
  if (!ms) return '-'
  if (ms < 1000) return ms + 'ms'
  return (ms / 1000).toFixed(1) + 's'
}

const formatNumber = (num) => {
  if (!num) return '0'
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

const loadMyStats = async () => {
  loading.value = true
  try {
    const res = await http.get(`/api/task-stats/my-dashboard?preset=${timePreset.value}`)
    if (res && res.success && res.data) {
      myStats.value = {
        overview: res.data.overview || myStats.value.overview,
        myModels: res.data.myModels || [],
        windowLabel: res.data.windowLabel || '',
      }
    }
  } catch (err) {
    console.error('Failed to load my stats:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadMyStats()
})
</script>

<style scoped>
.my-stats-view {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.kpi-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 16px 20px;
}

.kpi-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.kpi-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}

.kpi-value.success {
  color: #52c41a;
}

.kpi-value.danger {
  color: #ff4d4f;
}

.section {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
}

.section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
}

.window-label {
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  margin-top: 16px;
}
</style>
