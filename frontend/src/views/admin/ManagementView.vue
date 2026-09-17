<template>
  <div class="mg-root">
    <header class="mg-header">
      <div>
        <h1 class="mg-title">操作日志</h1>
        <p class="mg-sub">异常请求监控台，聚焦错误、慢请求与敏感操作；支持筛选、删除与定时清理</p>
      </div>
      <a-tag color="default" class="mg-readonly-tag">可清理</a-tag>
    </header>

    <!-- 异常摘要条 -->
    <div class="diagnostic-summary-bar">
      <div class="diagnostic-summary-item">
        <span class="diagnostic-summary-value danger">{{ summary.errorCount }}</span>
        <span class="diagnostic-summary-label">错误请求</span>
      </div>
      <div class="diagnostic-summary-item">
        <span class="diagnostic-summary-value warning">{{ summary.slowCount }}</span>
        <span class="diagnostic-summary-label">慢请求（>1s）</span>
      </div>
      <div class="diagnostic-summary-item">
        <span class="diagnostic-summary-value info">{{ summary.sensitiveCount }}</span>
        <span class="diagnostic-summary-label">敏感操作</span>
      </div>
    </div>

    <section class="mg-section">
      <div class="mg-section-head">
        <h2 class="mg-section-title">异常监控</h2>
        <div class="mg-log-filters">
          <a-select v-model:value="logFilterType" class="mg-filter-select" @change="onLogSearch">
            <a-select-option value="all">全部异常</a-select-option>
            <a-select-option value="error">仅错误（4xx/5xx）</a-select-option>
            <a-select-option value="slow">仅慢请求（>1s）</a-select-option>
            <a-select-option value="sensitive">仅敏感操作</a-select-option>
          </a-select>
          <a-input-search
            v-model:value="logSearch"
            placeholder="按路径搜索"
            class="mg-search"
            allow-clear
            @search="onLogSearch"
          />
          <a-input-search
            v-model:value="logUser"
            placeholder="按用户名搜索"
            class="mg-search"
            allow-clear
            @search="onLogSearch"
          />
          <a-select
            v-model:value="logTimeRange"
            class="mg-time-select"
            @change="onLogSearch"
          >
            <a-select-option value="all">全部时间</a-select-option>
            <a-select-option value="today">今日</a-select-option>
            <a-select-option value="week">本周</a-select-option>
            <a-select-option value="month">本月</a-select-option>
          </a-select>
        </div>
      </div>

      <div class="mg-actions">
        <a-button
          type="primary"
          danger
          :disabled="selectedRowKeys.length === 0"
          @click="deleteSelected"
        >
          删除选中 ({{ selectedRowKeys.length }})
        </a-button>
        <a-button @click="cleanupOld">清理 90 天前日志</a-button>
        <span class="mg-actions-tip">每日凌晨自动清理超过保留天数的旧日志</span>
      </div>

      <a-table
        class="mg-table"
        size="middle"
        :columns="logColumns"
        :data-source="filteredLogs"
        :loading="logLoading"
        :pagination="logPagination"
        :row-selection="rowSelection"
        row-key="id"
        @change="onLogTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'category'">
            <a-tag :color="getCategoryColor(record)">{{ getCategoryLabel(record) }}</a-tag>
          </template>
          <template v-else-if="column.key === 'user'">
            <span>{{ logUserName(record) }}</span>
          </template>
          <template v-else-if="column.key === 'method'">
            <a-tag :color="methodColor(record.method)">{{ record.method }}</a-tag>
          </template>
          <template v-else-if="column.key === 'path'">
            <a-tooltip :title="record.path">
              <span class="mg-path-ellipsis">{{ shortPath(record.path) }}</span>
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="record.statusCode < 400 ? 'green' : 'red'">{{ record.statusCode }}</a-tag>
          </template>
          <template v-else-if="column.key === 'createdAt'">
            <span class="mg-muted">{{ formatTime(record.createdAt) }}</span>
          </template>
          <template v-else-if="column.key === 'duration'">
            <span :class="record.durationMs > 1000 ? 'mg-duration-slow' : 'mg-muted'">
              {{ record.durationMs }}ms
            </span>
          </template>
          <template v-else>
            <span>{{ record[column.key] || '-' }}</span>
          </template>
        </template>
      </a-table>

      <a-alert
        v-if="logError"
        type="error"
        :message="logError"
        show-icon
        class="mg-alert"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import http from '@/core/http'

function formatTime(v: any): string {
  if (!v) return '-'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '-'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ---------- 操作日志 ----------
const logs = ref<any[]>([])
const logLoading = ref(false)
const logError = ref('')
const logSearch = ref('')
const logUser = ref('')
const logTimeRange = ref('all')
const logFilterType = ref('all')

// 敏感路径关键词（写操作、管理操作）
const SENSITIVE_KEYWORDS = ['/delete', '/cleanup', '/admin', '/user', '/auth', '/config']

// 异常摘要
const summary = computed(() => {
  const all = logs.value
  return {
    errorCount: all.filter(l => l.statusCode >= 400).length,
    slowCount: all.filter(l => l.durationMs > 1000).length,
    sensitiveCount: all.filter(l => SENSITIVE_KEYWORDS.some(k => l.path?.includes(k))).length,
  }
})

// 异常过滤
const filteredLogs = computed(() => {
  return logs.value.filter((l) => {
    if (logFilterType.value === 'error' && l.statusCode < 400) return false
    if (logFilterType.value === 'slow' && l.durationMs <= 1000) return false
    if (logFilterType.value === 'sensitive' && !SENSITIVE_KEYWORDS.some(k => l.path?.includes(k))) return false
    return true
  })
})

const logColumns = [
  { title: '类型', key: 'category', width: 80 },
  { title: '时间', key: 'createdAt', width: 140 },
  { title: '用户', key: 'user', width: 100 },
  { title: '方法', key: 'method', width: 70 },
  { title: '路径', key: 'path', ellipsis: true },
  { title: '状态', key: 'status', width: 70 },
  { title: 'IP', key: 'ip', width: 120, ellipsis: true },
  { title: '耗时', key: 'duration', width: 80 },
]

// 分类标签
function getCategoryLabel(record: any): string {
  if (record.statusCode >= 500) return '服务端错误'
  if (record.statusCode >= 400) return '客户端错误'
  if (record.durationMs > 1000) return '慢请求'
  if (SENSITIVE_KEYWORDS.some(k => record.path?.includes(k))) return '敏感操作'
  return '正常'
}

function getCategoryColor(record: any): string {
  if (record.statusCode >= 500) return 'red'
  if (record.statusCode >= 400) return 'orange'
  if (record.durationMs > 1000) return 'gold'
  if (SENSITIVE_KEYWORDS.some(k => record.path?.includes(k))) return 'purple'
  return 'default'
}

// 路径缩写
function shortPath(path: string): string {
  if (!path) return '-'
  // 去掉 /api 前缀，保留有意义的部分
  const cleaned = path.replace(/^\/api/, '')
  // 取最后两段
  const parts = cleaned.split('/').filter(Boolean)
  if (parts.length <= 2) return cleaned
  return '/' + parts.slice(-2).join('/')
}

// ---------- 行选择 + 删除 / 清理 ----------
const selectedRowKeys = ref<string[]>([])
const rowSelection = {
  selectedRowKeys,
  onChange: (keys: (string | number)[]) => {
    selectedRowKeys.value = keys as string[]
  },
}

async function deleteSelected() {
  const ids = [...selectedRowKeys.value]
  if (ids.length === 0) return
  Modal.confirm({
    title: `确认删除选中的 ${ids.length} 条操作日志？`,
    content: '删除后不可恢复，仅删除当前勾选的记录。',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        const res = await http.post('/api/admin/operation-log/delete', { ids })
        const deleted = res?.data?.deleted ?? ids.length
        message.success(`已删除 ${deleted} 条操作日志`)
        selectedRowKeys.value = []
        await loadLogs()
      } catch (e: any) {
        message.error(e?.response?.data?.message || e?.message || '删除失败')
      }
    },
  })
}

async function cleanupOld() {
  Modal.confirm({
    title: '确认清理 90 天前的旧操作日志？',
    content: '将删除创建时间早于 90 天前的全部日志，删除后不可恢复。系统也会每日凌晨自动执行同样清理。',
    okText: '清理',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        const res = await http.post('/api/admin/operation-log/delete', { beforeDays: 90 })
        const deleted = res?.data?.deleted ?? 0
        message.success(`已清理 ${deleted} 条旧操作日志`)
        await loadLogs()
      } catch (e: any) {
        message.error(e?.response?.data?.message || e?.message || '清理失败')
      }
    },
  })
}

const logPagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
})

function logUserName(record: any): string {
  const u = record.user
  if (u && (u.username || u.email)) return u.username || u.email
  return '匿名'
}
function methodColor(method: string): string {
  switch (method) {
    case 'GET': return 'blue'
    case 'POST': return 'green'
    case 'PUT': return 'orange'
    case 'DELETE': return 'red'
    case 'PATCH': return 'purple'
    default: return 'default'
  }
}

async function loadLogs() {
  logLoading.value = true
  logError.value = ''
  try {
    const params: Record<string, any> = {
      page: logPagination.current,
      pageSize: logPagination.pageSize,
    }
    if (logSearch.value.trim()) params.path = logSearch.value.trim()
    if (logUser.value.trim()) params.username = logUser.value.trim()
    const st = logRangeStart(logTimeRange.value)
    if (st !== null) params.startTime = st
    const data = await http.get('/api/operation-log', params)
    logs.value = data?.data?.list || []
    logPagination.total = data?.data?.total || 0
  } catch (e: any) {
    logError.value = e?.response?.data?.message || e?.message || '加载操作日志失败'
    if (e?.status === 401 || e?.status === 403) message.error('无权限或登录已过期')
  } finally {
    logLoading.value = false
  }
}

function logRangeStart(range: string): number | null {
  if (range === 'all') return null
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (range === 'today') return start.getTime()
  if (range === 'week') {
    const daysFromMonday = (now.getDay() + 6) % 7
    start.setDate(start.getDate() - daysFromMonday)
    return start.getTime()
  }
  if (range === 'month') {
    start.setDate(1)
    return start.getTime()
  }
  return null
}

function onLogSearch() {
  logPagination.current = 1
  loadLogs()
}
function onLogTableChange(pag: any) {
  logPagination.current = pag.current
  logPagination.pageSize = pag.pageSize
  loadLogs()
}

onMounted(() => {
  loadLogs()
})
</script>

<style lang="less" scoped>
.mg-log-filters {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.mg-filter-select {
  width: 140px;
}

.mg-time-select {
  width: 130px;
}

.mg-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.mg-actions-tip {
  color: var(--mg-muted, #8c8c8c);
  font-size: 12px;
}

.mg-path-ellipsis {
  display: inline-block;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mg-duration-slow {
  color: #fa8c16;
  font-weight: 600;
}

/* 异常摘要条 */
.diagnostic-summary-bar {
  display: flex;
  gap: 24px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #fff5f5 0%, #fff 100%);
  border: 1px solid #ffccc7;
  border-radius: 8px;
  margin: 0 16px 16px;
}

.diagnostic-summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 120px;
}

.diagnostic-summary-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary, #333);
  line-height: 1.2;
}

.diagnostic-summary-value.danger {
  color: #ff4d4f;
}

.diagnostic-summary-value.warning {
  color: #fa8c16;
}

.diagnostic-summary-value.info {
  color: #722ed1;
}

.diagnostic-summary-label {
  font-size: 12px;
  color: var(--text-secondary, #888);
  margin-top: 4px;
}
</style>
