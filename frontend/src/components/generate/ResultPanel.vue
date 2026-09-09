<template>
  <div class="result-panel-shell">
    <div class="canvas result-canvas">
      <div class="canvas-overview">
        <div class="overview-top">
          <div class="overview-left">
            <span class="plugin-id">{{ sessionId || '任务初始化中' }}</span>
            <div class="tag-row">
              <span class="tag-pill tag-type">{{ componentTypeLabel }}</span>
              <span class="tag-pill tag-source">{{ sourceLabel }}</span>
              <span class="tag-pill">{{ tierLabel }}</span>
            </div>
          </div>
          <div class="acceptance-badge" :class="{ 'badge-success': percent >= 100 }">
            <template v-if="percent >= 100">
              ✓ 完成 <span class="ab-pct">100%</span>
            </template>
            <template v-else>
              ✓ 验收 <span class="ab-pct">{{ roundedPercent }}%</span>
            </template>
          </div>
        </div>

        <div class="progress-section">
          <div class="progress-header">
            <div class="ph-left">
              <span class="ph-status" :class="{ 'ph-done': percent >= 100 }">
                <span class="ph-dot" :class="{ 'ph-dot-done': percent >= 100 }"></span>
                {{ percent >= 100 ? '生成完成' : '组件生成中' }}
              </span>
              <span class="ph-hint">
                {{ progressHint }}
              </span>
            </div>
            <div class="overview-right-meta">
              <span v-if="elapsed" class="meta-pill">已用 {{ elapsed }}</span>
              <span v-if="eta && percent < 100" class="meta-pill meta-pill-warn">预计剩余 ~{{ eta }}</span>
            </div>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :class="{ 'fill-done': percent >= 100 }" :style="{ width: `${roundedPercent}%` }"></div>
          </div>
        </div>
      </div>

      <div class="canvas-divider"></div>

      <div class="canvas-header">
        <div class="ch-name-row">
          <span class="ch-name">{{ componentName || '未命名组件' }}</span>
          <span v-if="userApproved" class="speed-pass-mark" title="用户点击“跳过剩余阶段”极速通过">
            ⚡ 跳过剩余
          </span>
        </div>
      </div>

      <div class="ch-tabs">
        <button class="ch-tab" :class="{ active: activeTab === 'steps' }" @click="activeTab = 'steps'">
          解锁
          <span class="ct-count">{{ completedSteps }}</span>
        </button>
        <button class="ch-tab" :class="{ active: activeTab === 'logs' }" @click="activeTab = 'logs'">
          日志
          <span class="ct-hotkey">(H)</span>
        </button>
        <button class="ch-tab" :class="{ active: activeTab === 'stats' }" @click="activeTab = 'stats'">
          统计
        </button>
      </div>

      <div class="canvas-divider"></div>

      <div v-show="activeTab === 'steps'" class="timeline-body">
        <div v-for="(step, index) in timelineSteps" :key="step.key || index" class="step-item" :class="step.state">
          <div class="step-dot-wrap">
            <div class="step-dot">
              <svg v-if="step.state === 'completed'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span v-else-if="step.state === 'active'" class="dot-active">●</span>
              <span v-else>{{ index + 1 }}</span>
            </div>
          </div>
          <div class="step-content">
            <div class="step-head">
              <span class="step-name" :class="{ 'text-muted': step.state === 'pending' }">{{ step.name }}</span>
              <span class="step-time" :class="{ 'text-muted': step.state === 'pending' }">{{ step.timeLabel }}</span>
            </div>
            <div class="step-desc" :class="{ 'text-muted': step.state === 'pending' }">{{ step.desc }}</div>
            <div v-if="step.message && step.message !== step.desc" class="step-note">{{ step.message }}</div>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'logs'" class="log-panel visible">
        <div class="log-toolbar">
          <div class="log-filter">
            <button class="log-filter-btn" :class="{ active: logFilter === 'all' }" @click="logFilter = 'all'">全部</button>
            <button class="log-filter-btn" :class="{ active: logFilter === 'info' }" @click="logFilter = 'info'">INFO</button>
            <button class="log-filter-btn" :class="{ active: logFilter === 'warn' }" @click="logFilter = 'warn'">WARN</button>
            <button class="log-filter-btn" :class="{ active: logFilter === 'error' }" @click="logFilter = 'error'">ERROR</button>
          </div>
          <div class="log-actions">
            <button class="log-tool-btn" title="复制日志" @click="copyLogs">📋</button>
            <button class="log-tool-btn" title="下载日志" @click="downloadLogs">↓</button>
          </div>
        </div>
        <div ref="logRef" class="log-body">
          <template v-if="filteredLogs.length">
            <div v-for="(log, idx) in filteredLogs" :key="idx" class="log-line">
              <span class="log-ts">[{{ log.time }}]</span>
              <span :class="`log-lv-${log.level}`">{{ log.label }}</span>
              <span class="log-msg">{{ log.message }}</span>
            </div>
          </template>
          <div v-else class="log-empty-hint">暂无日志输出</div>
        </div>
        <div class="log-footer">
          <div class="log-footer-left">
            <span class="lf-item"><span class="lf-dot"></span> 实时流式输出中</span>
            <span class="lf-item">{{ normalizedLogs.length }} 行</span>
          </div>
          <span>按 <kbd class="kbd-hint">H</kbd> 切换面板</span>
        </div>
      </div>

      <div class="stats-panel" :class="{ visible: activeTab === 'stats' }">
        <div class="stat-card">
          <div class="stat-icon stat-ic-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </div>
          <div class="stat-num">{{ completedSteps }}</div>
          <div class="stat-label">已完成阶段</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-ic-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div class="stat-num">{{ totalSteps }}</div>
          <div class="stat-label">阶段总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-ic-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div class="stat-num">{{ elapsed || '--' }}</div>
          <div class="stat-label">已用时间</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-ic-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <div class="stat-num">{{ eta || '--' }}</div>
          <div class="stat-label">预计剩余</div>
        </div>
      </div>

      <div class="canvas-actions">
        <button v-if="canLock" class="btn-lock" @click="confirmLock">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          满意，锁定此版本
        </button>
        <button v-if="canSpeedPass" class="btn-upgrade" @click="confirmSpeedPass">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="13 17 18 12 13 7" />
            <polyline points="6 17 11 12 6 7" />
          </svg>
          跳过剩余阶段
        </button>
        <button class="btn-cancel-op canvas-actions-end" @click="$emit('cancel')">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          取消生成
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Modal, message } from 'ant-design-vue'
import { speedPassTask, lockTask } from '@/api/generator/generator'

const props = defineProps({
  percent: { type: Number, default: 0 },
  eta: { type: String, default: '' },
  elapsed: { type: String, default: '' },
  stages: { type: Array, default: () => [] },
  logs: { type: Array, default: () => [] },
  sessionId: { type: String, default: '' },
  running: { type: Boolean, default: false },
  userApproved: { type: Boolean, default: false },
  componentName: { type: String, default: '未命名组件' },
  componentTypeLabel: { type: String, default: 'Vue3' },
  tierLabel: { type: String, default: 'Lite' },
  sourceLabel: { type: String, default: '图片/截图' }
})

defineEmits(['cancel'])

const activeTab = ref<'steps' | 'logs' | 'stats'>('steps')
const logFilter = ref<'all' | 'info' | 'warn' | 'error'>('all')
const logRef = ref<HTMLElement | null>(null)

const roundedPercent = computed(() => Math.max(0, Math.min(100, Math.round(props.percent || 0))))
const totalSteps = computed(() => props.stages.length || 0)
const completedSteps = computed(() => props.stages.filter((step: any) => step.status === 'completed').length)

const currentStage = computed(() => {
  return props.stages.find((s: any) => s.status === 'running')
    || props.stages.filter((s: any) => s.status === 'completed').at(-1)
    || props.stages[0]
    || null
})

const progressHint = computed(() => {
  if (roundedPercent.value >= 100) {
    return props.elapsed ? `总耗时 ${props.elapsed}` : '全部阶段完成'
  }
  if (currentStage.value?.desc) return currentStage.value.desc
  if (currentStage.value?.message) return currentStage.value.message
  return `已完成 ${completedSteps.value}/${totalSteps.value} 个阶段`
})

const timelineSteps = computed(() => {
  return props.stages.map((step: any) => {
    const state = step.status === 'completed'
      ? 'completed'
      : step.status === 'failed'
        ? 'failed'
        : step.status === 'running'
          ? 'active'
          : 'pending'

    let timeLabel = '等待中'
    if (state === 'completed') timeLabel = '完成'
    else if (state === 'active') timeLabel = '进行中'
    else if (state === 'failed') timeLabel = '失败'

    return {
      ...step,
      key: step.key,
      name: step.label || step.key || '未命名阶段',
      desc: step.desc || step.message || '等待执行',
      message: step.message || '',
      state,
      timeLabel
    }
  })
})

const normalizedLogs = computed(() => {
  return props.logs.map((log: any) => {
    const rawText = typeof log?.text === 'string' ? log.text : String(log?.message || '')
    const upper = rawText.toUpperCase()
    const level = /ERROR|失败|❌/.test(upper)
      ? 'error'
      : /WARN|WARNING|警告/.test(upper)
        ? 'warn'
        : /SUCCESS|完成|✅/.test(upper)
          ? 'success'
          : 'info'

    return {
      time: log?.time || '--:--:--',
      level,
      label: level.toUpperCase(),
      message: rawText
    }
  })
})

const filteredLogs = computed(() => {
  if (logFilter.value === 'all') return normalizedLogs.value
  return normalizedLogs.value.filter((log) => log.level === logFilter.value)
})

const canSpeedPass = computed(() => {
  if (!props.running) return false
  const gen = props.stages.find((s: any) => s.key === 'generate')
  const quality = props.stages.find((s: any) => s.key === 'quality')
  return gen?.status === 'completed' && quality?.status !== 'completed'
})

// 🛡️ 锁定终态：generate 阶段已开始（分块生成中可随时满意锁定），任务未完成且未锁定
const canLock = computed(() => {
  if (!props.running || props.userApproved) return false
  const gen = props.stages.find((s: any) => s.key === 'generate')
  return gen?.status === 'running' || gen?.status === 'completed'
})

function scrollLogToBottom() {
  nextTick(() => {
    if (logRef.value) {
      logRef.value.scrollTop = logRef.value.scrollHeight
    }
  })
}

async function copyLogs() {
  try {
    const text = normalizedLogs.value.map((log) => `[${log.time}] ${log.label} ${log.message}`).join('\n')
    await navigator.clipboard.writeText(text)
    message.success('日志已复制')
  } catch (error: any) {
    message.error(error?.message || '复制失败')
  }
}

function downloadLogs() {
  const text = normalizedLogs.value.map((log) => `[${log.time}] ${log.label} ${log.message}`).join('\n')
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.sessionId || 'task'}-logs.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key.toLowerCase() === 'h' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const target = event.target as HTMLElement | null
    const tag = target?.tagName?.toLowerCase()
    if (tag === 'input' || tag === 'textarea') return
    activeTab.value = activeTab.value === 'logs' ? 'steps' : 'logs'
  }
}

function confirmSpeedPass() {
  if (!props.sessionId) return
  Modal.confirm({
    title: '跳过剩余阶段？',
    content:
      '确认极速通过？任务将跳过“代码校验、串行精修、对抗检查、迭代修订”等剩余阶段，最终产物不再经过 AI 对抗性修正，可能存在布局或样式问题。',
    okText: '跳过剩余阶段',
    okType: 'warning',
    cancelText: '我再看看',
    onOk: async () => {
      try {
        const resp = await speedPassTask(props.sessionId)
        if (resp?.success) message.success('已极速通过，跳过剩余阶段')
        else message.error(resp?.message || '操作失败')
      } catch (e: any) {
        message.error(`操作失败：${e?.message || e}`)
      }
    }
  })
}

function confirmLock() {
  if (!props.sessionId) return
  Modal.confirm({
    title: '满意，锁定当前版本？',
    content:
      '将把当前预览版本固化到工作区，并立即终止后续生成。后续的全局重生成、覆写、精修都不会再改动这个版本。',
    okText: '满意，锁定',
    okType: 'primary',
    cancelText: '再等等',
    onOk: async () => {
      try {
        const resp = await lockTask(props.sessionId)
        if (resp?.success) message.success('已锁定当前版本')
        else message.error(resp?.message || '操作失败')
      } catch (e: any) {
        message.error(`操作失败：${e?.message || e}`)
      }
    }
  })
}

watch(() => props.logs.length, scrollLogToBottom)
watch(activeTab, (tab) => {
  if (tab === 'logs') scrollLogToBottom()
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.result-panel-shell {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.result-canvas {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.canvas-overview {
  padding: 20px 24px;
}

.overview-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.overview-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.plugin-id {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 4px 10px;
  border-radius: 4px;
  white-space: nowrap;
}

.tag-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag-pill {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.tag-pill.tag-type {
  background: var(--c-blue-50);
  color: var(--c-blue-700);
}

.tag-pill.tag-source {
  background: var(--c-purple-50);
  color: var(--c-purple-700);
}

.acceptance-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 16px;
  background: var(--task-running-bg);
  color: var(--task-running-text);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.acceptance-badge.badge-success {
  background: var(--task-success-bg);
  color: var(--task-success-text);
}

.ab-pct {
  font-variant-numeric: tabular-nums;
}

.progress-section {
  margin-top: 16px;
}

.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.ph-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.ph-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.ph-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c-blue-500);
  animation: pulse-dot 1.5s ease-in-out infinite;
}

.ph-dot.ph-dot-done {
  background: var(--task-success);
  animation: none;
}

.ph-status.ph-done {
  color: var(--task-success-text);
}

.ph-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  min-width: 0;
}

.overview-right-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 600;
}

.meta-pill-warn {
  background: color-mix(in srgb, var(--c-orange-500) 10%, transparent);
  color: var(--c-orange-700);
}

.progress-track {
  height: 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c-blue-500), var(--c-blue-600));
  border-radius: 4px;
  transition: width 0.3s ease;
  position: relative;
}

.progress-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  animation: shimmer 2s ease-in-out infinite;
}

.progress-fill.fill-done {
  background: linear-gradient(90deg, var(--c-green-500), var(--c-green-600));
}

.canvas-divider {
  height: 1px;
  background: var(--border-default);
}

.canvas-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
}

.ch-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ch-name {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.speed-pass-mark {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--c-green-50);
  color: var(--c-green-700);
  font-weight: 600;
  white-space: nowrap;
}

.ch-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 24px;
  background: transparent;
}

.ch-tab {
  height: 40px;
  padding: 0 18px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  border-bottom: 2px solid transparent;
  transition: all var(--transition-fast);
}

.ch-tab.active {
  color: var(--brand);
  font-weight: 600;
  border-bottom-color: var(--brand);
}

.ct-count {
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-tertiary);
  font-weight: 600;
}

.ch-tab.active .ct-count {
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  color: var(--brand);
}

.ct-hotkey {
  font-size: 10px;
  color: var(--text-tertiary);
  margin-left: 2px;
}

.timeline-body {
  padding: 24px 28px;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.step-item {
  display: flex;
  gap: 16px;
  position: relative;
  padding-bottom: 28px;
}

.step-item:last-child {
  padding-bottom: 0;
}

.step-item::before {
  content: '';
  position: absolute;
  left: 14px;
  top: 28px;
  bottom: 0;
  width: 2px;
  background: var(--border-default);
}

.step-item:last-child::before {
  display: none;
}

.step-item.completed::before {
  background: var(--task-success);
}

.step-item.active::before {
  background: linear-gradient(180deg, var(--task-running) 0%, var(--border-default) 100%);
}

.step-dot-wrap {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}

.step-dot {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-dot);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--border-default);
  background: var(--bg-card);
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 700;
  transition: all var(--transition-base);
}

.step-item.completed .step-dot {
  background: var(--task-success);
  border-color: var(--task-success);
  color: #fff;
}

.step-item.active .step-dot {
  background: var(--task-running-bg);
  border-color: var(--task-running);
  color: var(--task-running-text);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--task-running) 15%, transparent);
  animation: active-glow 2s ease-in-out infinite;
}

.step-item.pending .step-dot {
  background: var(--bg-disabled);
  color: var(--text-disabled);
}

.step-item.failed .step-dot {
  background: var(--task-failed);
  border-color: var(--task-failed);
  color: #fff;
}

.step-dot svg {
  width: 14px;
  height: 14px;
}

.dot-active {
  font-size: 10px;
  line-height: 1;
}

.step-content {
  flex: 1;
  min-width: 0;
  padding-top: 3px;
}

.step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.step-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.step-time {
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace;
}

.step-desc {
  font-size: 12.5px;
  color: var(--text-secondary);
  margin-top: 3px;
  line-height: 1.5;
}

.step-note {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--text-tertiary);
  padding: 8px 10px;
  border-radius: 4px;
  background: var(--bg-secondary);
}

.text-muted {
  color: var(--text-tertiary);
}

.log-panel {
  display: none;
  background: linear-gradient(180deg, #fafbfc 0%, #f5f6f8 100%);
  flex: 1;
  min-height: 0;
}

.log-panel.visible {
  display: flex;
  flex-direction: column;
}

.log-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-default);
}

.log-filter {
  display: flex;
  align-items: center;
  gap: 4px;
}

.log-filter-btn {
  height: 28px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
}

.log-filter-btn.active {
  color: var(--brand);
  background: var(--bg-card);
  border-color: var(--border-default);
  box-shadow: var(--shadow-sm);
  font-weight: 600;
}

.log-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.log-tool-btn {
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.log-body {
  padding: 16px 20px;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 11.8px;
  line-height: 1.75;
  color: var(--c-gray-700);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: linear-gradient(180deg, #fafbfc 0%, #f7f8fa 100%);
}

.log-line {
  display: flex;
  gap: 12px;
  padding: 1px 0;
  border-radius: 4px;
}

.log-ts {
  color: var(--text-tertiary);
  flex-shrink: 0;
  user-select: none;
  opacity: 0.65;
  font-size: 11px;
}

.log-lv-info {
  color: var(--c-blue-600);
  font-weight: 600;
}

.log-lv-warn {
  color: var(--c-orange-600);
  font-weight: 600;
}

.log-lv-error {
  color: var(--c-red-500);
  font-weight: 600;
}

.log-lv-success {
  color: var(--c-green-600);
  font-weight: 600;
}

.log-msg {
  flex: 1;
  word-break: break-all;
}

.log-empty-hint {
  text-align: center;
  padding: 40px;
  color: var(--text-tertiary);
  font-size: 12px;
}

.log-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-default);
  font-size: 11px;
  color: var(--text-tertiary);
}

.log-footer-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lf-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.lf-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-dot);
  background: var(--task-running);
  animation: pulse-dot 2s ease-in-out infinite;
}

.kbd-hint {
  font-size: 10px;
  padding: 1px 5px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-card);
  font-family: inherit;
}

.stats-panel {
  display: none;
  padding: 20px 24px;
  flex: 1;
  min-height: 0;
}

.stats-panel.visible {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  align-content: start;
}

.stat-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 18px 16px;
  text-align: center;
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  margin: 0 auto 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.stat-card:nth-child(1) .stat-icon {
  background: var(--c-blue-50);
  color: var(--c-blue-600);
}

.stat-card:nth-child(2) .stat-icon {
  background: var(--c-green-50);
  color: var(--c-green-600);
}

.stat-card:nth-child(3) .stat-icon {
  background: var(--c-orange-50);
  color: var(--c-orange-600);
}

.stat-card:nth-child(4) .stat-icon {
  background: var(--c-purple-50);
  color: var(--c-purple-600);
}

.stat-num {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.stat-card:nth-child(1) .stat-num {
  color: var(--c-blue-600);
}

.stat-card:nth-child(2) .stat-num {
  color: var(--c-green-600);
}

.stat-card:nth-child(3) .stat-num {
  color: var(--c-orange-600);
}

.stat-card:nth-child(4) .stat-num {
  color: var(--c-purple-600);
}

.stat-label {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

.canvas-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 12px 24px;
  gap: 8px;
  border-top: 1px solid var(--border-default);
  background: var(--bg-hover);
}

.canvas-actions-end {
  margin-left: auto;
}

.btn-upgrade {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--c-orange-300);
  border-radius: 4px;
  background: var(--c-orange-50);
  color: var(--c-orange-600);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.btn-lock {
  height: 32px;
  padding: 0 14px;
  border: 1px solid rgba(22, 163, 74, 0.4);
  border-radius: 4px;
  background: var(--c-green-50);
  color: var(--c-green-600);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.btn-cancel-op {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--c-red-300);
  border-radius: 4px;
  background: var(--c-red-50);
  color: var(--c-red-600);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

@keyframes active-glow {
  0%,
  100% {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--task-running) 12%, transparent);
  }
  50% {
    box-shadow: 0 0 0 8px color-mix(in srgb, var(--task-running) 6%, transparent);
  }
}

[data-theme='dark'] .log-panel {
  background: linear-gradient(180deg, #151c28 0%, #111827 100%);
}

[data-theme='dark'] .log-body {
  color: #b4bfd0;
  background: linear-gradient(180deg, #151d2a 0%, #111827 100%);
}

[data-theme='dark'] .log-lv-info {
  color: var(--c-blue-400);
}

[data-theme='dark'] .log-lv-warn {
  color: var(--c-orange-400);
}

[data-theme='dark'] .log-lv-error {
  color: var(--c-red-400);
}

[data-theme='dark'] .log-lv-success {
  color: var(--c-green-400);
}

[data-theme='dark'] .stat-card:nth-child(1) .stat-num {
  color: var(--c-blue-400);
}

[data-theme='dark'] .stat-card:nth-child(2) .stat-num {
  color: var(--c-green-400);
}

[data-theme='dark'] .stat-card:nth-child(3) .stat-num {
  color: var(--c-orange-400);
}

[data-theme='dark'] .stat-card:nth-child(4) .stat-num {
  color: var(--c-purple-400);
}

@media (max-width: 900px) {
  .canvas-overview,
  .canvas-header,
  .ch-tabs,
  .timeline-body,
  .stats-panel,
  .canvas-actions {
    padding-left: 16px;
    padding-right: 16px;
  }

  .overview-top,
  .progress-header,
  .step-head,
  .log-toolbar,
  .log-footer,
  .canvas-actions {
    flex-direction: column;
    align-items: flex-start;
  }

  .overview-right-meta {
    justify-content: flex-start;
  }

  .stats-panel.visible {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
