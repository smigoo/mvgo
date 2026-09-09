<template>
  <div class="html-split-batch-detail unified-task-detail">
    <div class="page-header-bar">
      <div class="header-bar-content">
        <div class="header-bar-main">
          <button class="btn-back" @click="$router.push('/generator/components')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <div class="header-bar-text">
            <h1 class="header-bar-title">HTML 拆分批次</h1>
            <span class="header-session">{{ batch?.batchId || batchId }}</span>
          </div>
        </div>
        <div class="header-bar-actions">
          <span v-if="batch" class="bp-status-badge" :class="batch.status">{{ statusLabel(batch.status) }}</span>
        </div>
      </div>
    </div>

    <div class="detail-body" v-if="batch">
      <aside class="config-panel">
        <div class="config-panel-inner is-locked">
          <div class="panel-heading">
            <span class="panel-heading-text">批次信息</span>
          </div>
          <div class="cfg-section source-section">
            <div class="cfg-section-title">拆分文件</div>
            <div class="source-tabs-readonly">
              <button type="button" class="source-tab active" disabled>HTML</button>
            </div>
          </div>
          <div class="cfg-section">
            <div class="cfg-section-title">概览</div>
            <div class="summary-grid">
              <div class="summary-item"><span>文件</span><strong>{{ batch.htmlFileName || '-' }}</strong></div>
              <div class="summary-item"><span>总数</span><strong>{{ batch.total }}</strong></div>
              <div class="summary-item"><span>完成</span><strong>{{ batch.completed }}</strong></div>
              <div class="summary-item"><span>失败</span><strong>{{ batch.failed }}</strong></div>
            </div>
          </div>
          <div class="cfg-section">
            <div class="cfg-section-title">进度</div>
            <div class="batch-progress-bar">
              <div class="batch-progress-fill" :style="{ width: progressPct + '%' }"></div>
            </div>
            <div class="batch-progress-text">{{ batch.completed }}/{{ batch.total }} 完成</div>
          </div>
        </div>
      </aside>

      <section class="result-panel">
        <div class="result-panel-inner">
          <div class="panel-heading">
            <span class="panel-heading-text">子任务列表</span>
          </div>
          <div v-if="items.length" class="task-list-like">
            <div class="task-card mini" v-for="item in items" :key="item.sessionId" :class="item.status">
              <div class="task-main">
                <div class="task-info">
                  <div class="task-name-row">
                    <span class="task-name" :title="item.sessionId">{{ item.name || item.itemId || item.sessionId }}</span>
                    <span class="task-type-badge page">HTML</span>
                  </div>
                  <div class="task-meta">
                    <span class="task-status" :class="item.status">{{ statusLabel(item.status) }}</span>
                    <span v-if="item.message" class="task-time">{{ item.message }}</span>
                  </div>
                </div>
                <div class="task-actions">
                  <router-link v-if="item.sessionId" :to="`/tasks/${item.sessionId}`" class="btn-task icon-only neutral">详情</router-link>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="task-empty compact">
            <h3>暂无子任务</h3>
            <p>请返回生成页重新提交 HTML 拆分。</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createLiteProgressStream } from '@/api/lite'

const route = useRoute()
const router = useRouter()
const batchId = computed(() => route.params.batchId as string)
const batch = ref<any>(null)
const items = ref<any[]>([])
const streams = new Map<string, EventSource>()
const progressPct = computed(() => {
  if (!batch.value) return 0
  const total = batch.value.total || batch.value.items?.length || 1
  return Math.round(((batch.value.completed || 0) / total) * 100)
})

function readBatchSnapshot() {
  try {
    const raw = sessionStorage.getItem(`mvgo-html-split-batch:${batchId.value}`)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '等待中',
    queued: '排队中',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    paused: '已暂停',
    partially_completed: '部分完成',
  }
  return map[status] || status || '-'
}

function updateBatchCount() {
  const completed = items.value.filter(item => item.status === 'completed').length
  const failed = items.value.filter(item => item.status === 'failed').length
  if (!batch.value) return
  batch.value.completed = completed
  batch.value.failed = failed
  batch.value.total = items.value.length
  batch.value.status = failed > 0 && completed > 0 ? 'partially_completed' : completed === items.value.length ? 'completed' : 'running'
}

function bindItemStream(item: any) {
  if (!item?.sessionId || streams.has(item.sessionId)) return
  const stream = createLiteProgressStream(item.sessionId)
  streams.set(item.sessionId, stream)
  stream.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data)
      const current = items.value.find(x => x.sessionId === item.sessionId)
      if (!current) return
      if (d.type === 'progress') {
        current.message = d.message || current.message || ''
        current.status = d.status || current.status
      } else if (d.type === 'complete') {
        current.status = 'completed'
        current.message = d.message || '生成完成'
        current.componentId = d.componentId || item.sessionId
      } else if (d.type === 'error') {
        current.status = 'failed'
        current.message = d.message || '生成失败'
      }
      updateBatchCount()
    } catch {
      // ignore
    }
  }
  stream.onerror = () => {
    const current = items.value.find(x => x.sessionId === item.sessionId)
    if (current && current.status !== 'completed' && current.status !== 'failed') {
      current.status = 'failed'
      current.message = '进度连接中断'
      updateBatchCount()
    }
    const s = streams.get(item.sessionId)
    s?.close()
    streams.delete(item.sessionId)
  }
}

onMounted(() => {
  const snapshot = readBatchSnapshot()
  if (snapshot) {
    batch.value = {
      batchId: snapshot.batchId,
      htmlFileName: snapshot.htmlFileName,
      status: 'running',
      total: snapshot.items?.length || 0,
      completed: 0,
      failed: 0,
      items: snapshot.items || [],
    }
    items.value = (snapshot.items || []).map((item: any) => ({ ...item, message: item.message || '', status: item.status || 'pending', name: item.name || item.itemId || item.sessionId }))
    items.value.forEach(bindItemStream)
    updateBatchCount()
  }
})

onUnmounted(() => {
  streams.forEach(stream => stream?.close())
  streams.clear()
})
</script>

<style scoped>
.html-split-batch-detail{min-height:100vh;padding:24px;background:var(--bg-page);color:var(--text-primary)}
.page-header-bar{margin-bottom:20px}
.header-bar-content{display:flex;align-items:center;justify-content:space-between;gap:16px}
.header-bar-main{display:flex;align-items:center;gap:14px;min-width:0}
.btn-back{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;border:1px solid var(--border-default);background:var(--bg-card);color:var(--text-primary);cursor:pointer}
.header-bar-text{display:flex;flex-direction:column;gap:4px;min-width:0}
.header-bar-title{margin:0;font-size:22px}
.header-session{font-size:12px;color:var(--text-tertiary);word-break:break-all}
.bp-status-badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;background:var(--bg-secondary);color:var(--text-primary)}
.bp-status-badge.completed{background:rgba(34,197,94,.14);color:var(--task-success)}
.bp-status-badge.failed{background:rgba(239,68,68,.14);color:var(--error)}
.bp-status-badge.running,.bp-status-badge.queued,.bp-status-badge.pending{background:rgba(59,130,246,.14);color:var(--brand-cta)}
.detail-body{display:grid;grid-template-columns:320px minmax(0,1fr);gap:20px;align-items:start}
.config-panel,.result-panel{min-width:0}
.config-panel-inner,.result-panel-inner{padding:18px;border:1px solid var(--border-default);border-radius:16px;background:var(--bg-card)}
.panel-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.panel-heading-text{font-size:15px;font-weight:600}
.cfg-section{margin-top:16px}
.cfg-section:first-of-type{margin-top:0}
.cfg-section-title{font-size:13px;color:var(--text-tertiary);margin-bottom:10px}
.source-tabs-readonly{display:flex;gap:8px;flex-wrap:wrap}
.source-tab{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:8px 12px;border-radius:999px;border:1px solid var(--border-default);background:var(--bg-secondary);color:var(--text-primary)}
.source-tab.active{background:rgba(59,130,246,.14);border-color:rgba(59,130,246,.22);color:var(--brand-cta)}
.summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.summary-item{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:12px;background:var(--bg-secondary);font-size:12px;color:var(--text-tertiary)}
.summary-item strong{color:var(--text-primary);font-size:13px;word-break:break-all}
.batch-progress-bar{height:8px;border-radius:999px;background:var(--bg-secondary);overflow:hidden}
.batch-progress-fill{height:100%;background:var(--brand-cta)}
.batch-progress-text{margin-top:8px;font-size:12px;color:var(--text-tertiary)}
.task-list-like{display:flex;flex-direction:column;gap:12px}
.task-card.mini{padding:0;border:none;background:transparent;box-shadow:none}
.task-card.mini .task-main{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:1px solid var(--border-default);border-radius:14px;background:var(--bg-secondary)}
.task-card.mini.completed .task-main{border-color:rgba(34,197,94,.22)}
.task-card.mini.failed .task-main{border-color:rgba(239,68,68,.22)}
.task-card.mini .task-info{flex:1;min-width:0}
.task-card.mini .task-name-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.task-card.mini .task-name{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.task-card.mini .task-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px;min-width:0}
.task-card.mini .task-time{font-size:12px;color:var(--text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.task-card.mini .task-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
.task-empty.compact{padding:20px 0;text-align:center;color:var(--text-tertiary)}
.task-empty.compact h3{margin:0 0 8px;font-size:16px;color:var(--text-primary)}
.task-empty.compact p{margin:0;font-size:13px}
@media (max-width: 1024px){.detail-body{grid-template-columns:1fr}.header-bar-content{align-items:flex-start;flex-direction:column}}
</style>