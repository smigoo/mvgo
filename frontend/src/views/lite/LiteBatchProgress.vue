<template>
  <div v-if="batch" class="batch-progress">
    <!-- 批次头部 -->
    <div class="bp-header">
      <div class="bp-header-left">
        <span class="bp-batch-id">{{ batch.batchId }}</span>
        <span class="bp-status-badge" :class="batch.status">
          {{ statusLabel(batch.status) }}
        </span>
      </div>
      <div class="bp-header-right">
        <span class="bp-time">{{ formatTime(batch.updatedAt) }}</span>
      </div>
    </div>

    <!-- 进度条 -->
    <div class="bp-progress-bar">
      <div class="bp-progress-track">
        <div class="bp-progress-fill completed" :style="{ width: completedPct + '%' }" />
        <div class="bp-progress-fill failed" :style="{ width: failedPct + '%', left: completedPct + '%' }" />
      </div>
      <div class="bp-progress-text">
        {{ batch.completedItems + batch.failedItems }}/{{ batch.totalItems }}
        <span class="bp-progress-detail">(完成 {{ batch.completedItems }}，失败 {{ batch.failedItems }})</span>
      </div>
    </div>

    <!-- 状态分布 -->
    <div class="bp-status-breakdown" v-if="statusBreakdown">
      <span v-for="(count, key) in statusBreakdown" :key="key" v-show="count > 0" class="bp-status-chip" :class="key">
        {{ statusLabel(key) }}: {{ count }}
      </span>
    </div>

    <!-- 操作栏 -->
    <div class="bp-actions" v-if="canControl">
      <button
        v-if="batch.status === 'running' || batch.status === 'pending'"
        class="bp-action-btn pause"
        :disabled="isActing"
        @click="doPause"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        暂停
      </button>
      <button
        v-if="batch.status === 'paused' || batch.status === 'awaiting_recovery'"
        class="bp-action-btn resume"
        :disabled="isActing"
        @click="doResume"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        恢复
      </button>
      <button
        v-if="batch.failedItems > 0 && batch.status !== 'cancelled'"
        class="bp-action-btn retry"
        :disabled="isActing"
        @click="doRetryFailed"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
        重试失败项
      </button>
      <button
        v-if="batch.status !== 'completed' && batch.status !== 'cancelled'"
        class="bp-action-btn cancel"
        :disabled="isActing"
        @click="doCancel"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
        取消
      </button>
    </div>

    <!-- 需关注项列表 -->
    <div v-if="attentionItems.length > 0" class="bp-attention">
      <div class="bp-attention-title">需要关注 ({{ attentionItems.length }})</div>
      <div v-for="item in attentionItems.slice(0, 5)" :key="item.sessionId" class="bp-attention-item">
        <span class="att-item-name">{{ item.itemId }}</span>
        <span class="att-item-status" :class="item.status">{{ statusLabel(item.status) }}</span>
        <span v-if="item.lastError" class="att-item-error">{{ truncate(item.lastError, 60) }}</span>
        <span v-if="item.nextRetryAt && item.nextRetryAt > Date.now()" class="att-item-retry">
          预计 {{ formatTime(item.nextRetryAt) }} 重试
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { batchDetail, batchPause, batchResume, batchCancel, batchRetryFailed } from '@/api/lite'

const props = defineProps({
  batchId: { type: String, required: true },
})

const emit = defineEmits(['status-change', 'batch-done'])

const batch = ref(null)
const isActing = ref(false)
const statusBreakdown = ref(null)
const attentionItems = ref([])

const completedPct = computed(() => {
  if (!batch.value) return 0
  return batch.value.totalItems > 0 ? Math.round((batch.value.completedItems / batch.value.totalItems) * 100) : 0
})

const failedPct = computed(() => {
  if (!batch.value) return 0
  return batch.value.totalItems > 0 ? Math.round((batch.value.failedItems / batch.value.totalItems) * 100) : 0
})

const canControl = computed(() => {
  const s = batch.value?.status
  return s !== 'completed' && s !== 'cancelled'
})

// 自动轮询批次状态
let pollTimer = null
function startPolling() {
  stopPolling()
  pollTimer = setInterval(fetchBatchStatus, 3000)
  fetchBatchStatus()
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function fetchBatchStatus() {
  try {
    const result = await batchDetail(props.batchId)
    batch.value = result.batch

    // 统计状态分布
    const breakdown = {}
    const attnItems = []
    for (const item of result.batch.items || []) {
      breakdown[item.status] = (breakdown[item.status] || 0) + 1
      if (item.status === 'failed' || item.status === 'rate_limited') {
        attnItems.push(item)
      }
    }
    statusBreakdown.value = breakdown
    attentionItems.value = attnItems

    emit('status-change', result.batch)

    // 终态停止轮询
    if (result.batch.status === 'completed' || result.batch.status === 'cancelled' || result.batch.status === 'failed') {
      stopPolling()
      emit('batch-done', result.batch)
    }
  } catch (err) {
    // 批次不存在时停止轮询
    if (err?.response?.status === 404) stopPolling()
  }
}

async function doPause() {
  isActing.value = true
  try {
    await batchPause(props.batchId)
    await fetchBatchStatus()
  } finally { isActing.value = false }
}

async function doResume() {
  isActing.value = true
  try {
    await batchResume(props.batchId)
    startPolling()
  } finally { isActing.value = false }
}

async function doCancel() {
  if (!confirm('确定取消此批次？已完成的结果不受影响。')) return
  isActing.value = true
  try {
    await batchCancel(props.batchId)
    await fetchBatchStatus()
  } finally { isActing.value = false }
}

async function doRetryFailed() {
  isActing.value = true
  try {
    await batchRetryFailed(props.batchId)
    statusBreakdown.value = null
    attentionItems.value = []
    startPolling()
  } finally { isActing.value = false }
}

function statusLabel(status) {
  const map = {
    pending: '等待中',
    queued: '排队中',
    running: '运行中',
    rate_limited: '限流等待',
    retry_scheduled: '等待重试',
    paused: '已暂停',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    partially_completed: '部分完成',
    awaiting_recovery: '等待恢复',
  }
  return map[status] || status
}

function formatTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

function truncate(str, max) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '...' : str
}

// 生命周期
import { onMounted, onUnmounted } from 'vue'
onMounted(() => startPolling())
onUnmounted(() => stopPolling())
</script>

<style scoped>
.batch-progress {
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 10px;
  overflow: hidden;
}

.bp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--bg-secondary, #f8f8f8);
  border-bottom: 1px solid var(--border, #f0f0f0);
}

.bp-batch-id {
  font-size: 12px;
  font-family: monospace;
  color: var(--text-muted, #999);
}

.bp-status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  margin-left: 8px;
}

.bp-status-badge.running, .bp-status-badge.pending { background: #e8f5e9; color: #2e7d32; }
.bp-status-badge.completed { background: #e3f2fd; color: #1565c0; }
.bp-status-badge.failed, .bp-status-badge.partially_completed { background: #ffebee; color: #c62828; }
.bp-status-badge.paused, .bp-status-badge.awaiting_recovery { background: #fff3e0; color: #ef6c00; }
.bp-status-badge.cancelled { background: #f3e5f5; color: #7b1fa2; }

.bp-time { font-size: 11px; color: var(--text-muted, #bbb); }

.bp-progress-bar {
  padding: 12px 14px 8px;
}

.bp-progress-track {
  position: relative;
  height: 8px;
  background: var(--bg-secondary, #f0f0f0);
  border-radius: 4px;
  overflow: hidden;
}

.bp-progress-fill {
  position: absolute;
  top: 0;
  height: 100%;
  transition: width 0.3s ease;
}

.bp-progress-fill.completed { background: var(--task-success); border-radius: 4px; }
.bp-progress-fill.failed { background: var(--task-failed); }

.bp-progress-text {
  margin-top: 6px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary, #666);
}

.bp-progress-detail { color: var(--text-muted, #999); font-size: 11px; }

.bp-status-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 14px 8px;
}

.bp-status-chip {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-secondary, #f5f5f5);
  color: var(--text-secondary, #666);
}

.bp-status-chip.completed { background: var(--task-success-bg); color: var(--task-success-text); }
.bp-status-chip.failed { background: var(--task-failed-bg); color: var(--task-failed-text); }
.bp-status-chip.rate_limited { background: var(--task-queued-bg); color: var(--task-queued-text); }

.bp-actions {
  display: flex;
  gap: 6px;
  padding: 8px 14px;
  border-top: 1px solid var(--border, #f0f0f0);
}

.bp-action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  color: #fff;
}

.bp-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.bp-action-btn.pause { background: var(--task-muted); }
.bp-action-btn.pause:hover:not(:disabled) { background: var(--task-muted-text); }
.bp-action-btn.resume { background: var(--task-success); }
.bp-action-btn.resume:hover:not(:disabled) { background: var(--task-success-text); }
.bp-action-btn.retry { background: var(--button-primary-bg); }
.bp-action-btn.retry:hover:not(:disabled) { background: var(--button-primary-bg-hover); }
.bp-action-btn.cancel { background: var(--task-failed); }
.bp-action-btn.cancel:hover:not(:disabled) { background: var(--task-failed-text); }

.bp-attention {
  border-top: 1px solid var(--border, #f0f0f0);
  padding: 10px 14px;
}

.bp-attention-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--task-failed);
  margin-bottom: 8px;
}

.bp-attention-item {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  padding: 6px 8px;
  margin-bottom: 4px;
  background: var(--task-failed-bg);
  border-radius: 4px;
  font-size: 11px;
}

.att-item-name { font-weight: 500; color: var(--text-primary, #333); }
.att-item-status { padding: 1px 6px; border-radius: 3px; font-size: 10px; }
.att-item-status.failed { background: var(--task-failed-bg); color: var(--task-failed-text); }
.att-item-status.rate_limited { background: var(--task-queued-bg); color: var(--task-queued-text); }
.att-item-error { color: #999; flex-basis: 100%; }
.att-item-retry { color: var(--task-queued); font-size: 10px; }
</style>
