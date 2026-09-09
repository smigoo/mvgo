<template>
  <div class="logs-page">
    <div class="page-header">
      <button @click="router.back()" class="btn-back">← 返回</button>
      <h1>生成日志</h1>
      <span class="session-id">Session: {{ sessionId }}</span>
    </div>

    <div class="status-bar" :class="overallStatus">
      {{ statusText }}
    </div>

    <div class="log-container" ref="logContainer">
      <div
        v-for="(log, idx) in logs"
        :key="idx"
        class="log-item"
        :class="log.type"
      >
        <span class="log-icon">{{ logIcon(log) }}</span>
        <div class="log-body">
          <span class="log-message">{{ log.message }}
            <span v-if="log.count > 1" class="log-count">({{ log.count }})</span>
          </span>
          <pre v-if="log.detail" class="log-detail">{{ log.detail }}</pre>
        </div>
        <span class="log-time">{{ formatTime(log.timestamp) }}</span>
      </div>
    </div>

    <div v-if="isDone" class="actions">
      <router-link to="/generator" class="btn-secondary">新建组件</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createProgressStream } from '@/api/generator'
import { createSseRecovery } from '@/utils/sse-recovery'

const route = useRoute()
const router = useRouter()
const sessionId = route.params.sessionId as string

const logs = ref<any[]>([])
const overallStatus = ref('running')
const logContainer = ref<HTMLElement | null>(null)

let eventSource: EventSource | null = null
let sseWatchdog: number | null = null
const SSE_WATCHDOG_MS = 35000 // 35秒看门狗（比后端30秒心跳稍宽）

// SSE 断开恢复：onerror 时立即检查任务真实状态，运行中则周期轮询
const sseRecovery = createSseRecovery({
  onCompleted: () => {
    overallStatus.value = 'completed'
    stopWatchdog()
    eventSource?.close()
    eventSource = null
  },
  onFailed: (_sid, err) => {
    overallStatus.value = 'error'
    stopWatchdog()
    pushLog({
      type: 'error',
      message: `❌ 任务失败（SSE 断开恢复）: ${err || ''}`,
      timestamp: Date.now()
    })
    eventSource?.close()
    eventSource = null
  },
  isStillGenerating: () => overallStatus.value === 'running',
  isConnectionAlive: () => eventSource?.readyState === EventSource.OPEN,
  log: (level, message) => {
    pushLog({ type: 'log', level, message, timestamp: Date.now() })
  }
})

const isDone = computed(() => ['completed', 'error'].includes(overallStatus.value))

const statusText = computed(() => ({
  running: '⚡ 生成中...',
  completed: '✅ 生成完成',
  error: '❌ 生成失败'
}[overallStatus.value] || ''))

function logIcon(log: any) {
  if (log.type === 'progress' && log.status === 'completed') return '✅'
  if (log.type === 'progress') return '⚡'
  if (log.type === 'error') return '❌'
  if (log.level === 'warn') return '⚠️'
  return '📋'
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString()
}

function formatDetail(meta: any): string | null {
  if (!meta || Object.keys(meta).length === 0) return null
  const skip = ['logger']
  const filtered = Object.fromEntries(
    Object.entries(meta).filter(([k]) => !skip.includes(k))
  )
  return Object.keys(filtered).length > 0 ? JSON.stringify(filtered, null, 2) : null
}

async function scrollToBottom() {
  await nextTick()
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
}

function startWatchdog() {
  if (sseWatchdog) clearTimeout(sseWatchdog)
  sseWatchdog = window.setTimeout(() => {
    if (overallStatus.value === 'running') {
      pushLog({
        type: 'log',
        level: 'warn',
        message: `⏱️ ${SSE_WATCHDOG_MS / 1000} 秒内未收到任何 SSE 消息，正在检查任务状态...`,
        timestamp: Date.now()
      })
      // 看门狗触发时也通过 API 检查真实状态，而非直接标记失败
      sseRecovery.checkAndRecover(sessionId)
    }
    eventSource?.close()
    eventSource = null
    sseWatchdog = null
  }, SSE_WATCHDOG_MS)
}

function stopWatchdog() {
  if (sseWatchdog) {
    clearTimeout(sseWatchdog)
    sseWatchdog = null
  }
}

function pushLog(entry: any) {
  const last = logs.value[logs.value.length - 1]
  if (last && last.type === entry.type && last.level === entry.level && last.message === entry.message && last.detail === entry.detail) {
    last.count = (last.count || 1) + 1
    last.timestamp = entry.timestamp
  } else {
    entry.count = 1
    logs.value.push(entry)
  }
}

onMounted(() => {
  eventSource = createProgressStream(sessionId)
  startWatchdog()

  eventSource.onmessage = (event) => {
    startWatchdog() // 每次收到消息重置看门狗
    const data = JSON.parse(event.data)

    if (data.type === 'connected') return

    if (data.type === 'progress') {
      pushLog({
        type: 'progress',
        status: data.status,
        message: `[${data.stage}] ${data.message}`,
        detail: data.details ? JSON.stringify(data.details.result || data.details, null, 2) : null,
        timestamp: data.timestamp
      })
    } else if (data.type === 'log') {
      const detail = formatDetail(data.meta)
      pushLog({
        type: 'log',
        level: data.level,
        message: data.message,
        detail,
        timestamp: data.timestamp
      })
    } else if (data.type === 'complete') {
      overallStatus.value = 'completed'
      stopWatchdog()
      sseRecovery.stopFallback()
      eventSource?.close()
    } else if (data.type === 'error') {
      overallStatus.value = 'error'
      stopWatchdog()
      sseRecovery.stopFallback()
      pushLog({
        type: 'error',
        message: data.message,
        timestamp: data.timestamp
      })
      eventSource?.close()
    }

    scrollToBottom()
  }

  eventSource.onerror = () => {
    // 已收到终态时主动关闭，阻止自动重连死循环
    if (overallStatus.value !== 'running') {
      eventSource?.close()
      return
    }
    // SSE 断开时立即通过 API 检查任务真实状态
    sseRecovery.checkAndRecover(sessionId)
  }
})

onUnmounted(() => {
  stopWatchdog()
  sseRecovery.stopFallback()
  eventSource?.close()
})
</script>

<style scoped>
.logs-page {
  max-width: 1500px;
  margin: 0 auto;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px);
  box-sizing: border-box;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 600;
  flex: 1;
}

.session-id {
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: monospace;
}

.btn-back {
  background: none;
  border: 1px solid var(--border-default);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
}

.status-bar {
  padding: 10px 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 16px;
}

.status-bar.running { background: #e8f4ff; color: var(--brand); }
.status-bar.completed { background: var(--success-bg); color: var(--success); }
.status-bar.error { background: var(--error-bg); color: var(--error); }

.log-container {
  flex: 1;
  overflow-y: auto;
  background: var(--text-primary);
  border-radius: var(--radius-md);
  padding: 16px;
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 13px;
}

.log-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.log-item.error .log-message { color: #ff6b6b; }
.log-item.progress .log-message { color: #74b9ff; }
.log-item .log-message { color: #b2bec3; }

.log-icon { width: 20px; flex-shrink: 0; }

.log-body { flex: 1; min-width: 0; }

.log-detail {
  margin: 4px 0 0;
  font-size: 11px;
  color: #636e72;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-count {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-left: 4px;
  opacity: 0.8;
}

.log-time {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.btn-secondary {
  padding: 10px 20px;
  background: var(--bg-alt);
  color: var(--text-primary);
  border-radius: var(--radius-md);
  text-decoration: none;
  font-size: 14px;
}
</style>
