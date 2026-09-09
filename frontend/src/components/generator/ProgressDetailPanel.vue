<template>
  <div class="pdp-root" v-if="visible">
    <!-- 基本信息头部 -->
    <div class="pdp-header">
      <div class="pdp-header-info">
        <span class="pdp-status-badge" :class="displayStatus">{{ statusLabel }}</span>
        <span class="pdp-name">{{ taskDisplayName }}</span>
        <span class="pdp-type-tag" :class="taskTypeClass">{{ taskTypeLabel }}</span>
        <!-- 连接状态指示灯（合并到头部） -->
        <span v-if="taskStatus === 'running'" class="pdp-conn-inline" :class="sseStatus" :title="connTitle">
          <span class="pdp-conn-dot-inline" :class="sseStatus"></span>
          <span class="pdp-conn-label-inline">{{ connLabel }}</span>
          <button v-if="sseStatus === 'disconnected' || sseStatus === 'error'" class="pdp-reconnect-mini" @click="handleReconnect">重连</button>
          <span v-if="lastActivityStuck" class="pdp-stuck-mini">卡住</span>
        </span>
      </div>
    </div>

    <!-- 页签导航 -->
    <div class="pdp-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="pdp-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span class="pdp-tab-count" v-if="tab.count != null">({{ tab.count }})</span>
      </button>
    </div>

    <!-- 页签内容：阶段 -->
    <div v-if="activeTab === 'stages'" class="pdp-tab-content" ref="stagesRef">
      <template v-if="pipelineStages.length === 0">
        <div class="pdp-empty">暂无阶段数据</div>
      </template>
      <div
        v-for="(stage, idx) in pipelineStages"
        :key="stage.key"
        class="pdp-stage-item"
        :class="stage.status"
      >
        <div class="pdp-stage-line">
          <div class="pdp-stage-dot" :class="stage.status"></div>
          <div v-if="idx < pipelineStages.length - 1" class="pdp-stage-connector" :class="stage.status"></div>
        </div>
        <div class="pdp-stage-body" :class="{ active: stage.status === 'running' }">
          <div class="pdp-stage-header">
            <span class="pdp-stage-name">{{ stage.label }}</span>
            <span class="pdp-stage-duration" v-if="stage.duration">{{ stage.duration }}</span>
          </div>
          <div class="pdp-stage-msg" v-if="stage.message && stage.status !== 'success'">{{ stage.message }}</div>
          <div class="pdp-stage-events" v-if="stage.eventCount > 0 && stage.status === 'running'">
            <span class="pdp-stage-event-count">{{ stage.eventCount }} 条事件</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 页签内容：日志 -->
    <div v-if="activeTab === 'logs'" class="pdp-tab-content">
      <!-- 日志筛选条 -->
      <div class="pdp-log-filter">
        <button
          v-for="lvl in logLevels"
          :key="lvl"
          class="pdp-log-filter-btn"
          :class="{ active: logFilter === lvl }"
          @click="logFilter = lvl"
        >
          {{ lvl === 'all' ? '全部' : lvl }}
          <span class="pdp-log-filter-count" v-if="lvl !== 'all'">{{ logLevelCount(lvl) }}</span>
        </button>
      </div>
      <div class="pdp-log-list-full" ref="logListRef">
        <template v-if="filteredLogItems.length === 0">
          <div class="pdp-empty">暂无日志</div>
        </template>
        <div
          v-for="(log, idx) in filteredLogItems"
          :key="idx"
          class="pdp-log-item"
          :class="log.level"
        >
          <span class="pdp-log-time">{{ formatTime(log.timestamp) }}</span>
          <span class="pdp-log-level">{{ (log.level || 'INFO').toUpperCase() }}</span>
          <span class="pdp-log-msg">{{ log.message }}<span v-if="log.count > 1" class="pdp-log-fold"> x{{ log.count }}</span></span>
        </div>
      </div>
    </div>

    <!-- 页签内容：统计 -->
    <div v-if="activeTab === 'stats'" class="pdp-tab-content">
      <template v-if="allEvents.length === 0">
        <div class="pdp-empty">暂无统计数据</div>
      </template>
      <div v-else class="pdp-stats-layout">
        <div class="pdp-stats-hero">
          <div class="pdp-stats-hero-main">
            <div class="pdp-stats-kicker">任务概览</div>
            <div class="pdp-stats-hero-value">{{ allEvents.length }}</div>
            <div class="pdp-stats-hero-label">总事件</div>
            <div class="pdp-stats-hero-hint">{{ statsSummaryText }}</div>
          </div>
          <div class="pdp-stats-hero-side">
            <div class="pdp-stat-emphasis">
              <span class="pdp-stat-emphasis-label">总耗时</span>
              <strong class="pdp-stat-emphasis-value">{{ statsTotalDuration }}</strong>
              <span class="pdp-stat-emphasis-note">本次任务执行周期</span>
            </div>
            <div class="pdp-stat-emphasis" :class="statsHealthTone">
              <span class="pdp-stat-emphasis-label">运行健康</span>
              <strong class="pdp-stat-emphasis-value">{{ statsHealthLabel }}</strong>
              <span class="pdp-stat-emphasis-note">{{ statsErrorCount > 0 ? '优先处理错误事件' : '当前未发现异常事件' }}</span>
            </div>
          </div>
        </div>

        <div class="pdp-stats-grid">
          <div class="pdp-stat-card emphasis llm">
            <div class="pdp-stat-label">LLM 调用</div>
            <div class="pdp-stat-value">{{ statsLlmCalls }}</div>
            <div class="pdp-stat-meta">占全部事件 {{ statsLlmPct }}%</div>
          </div>
          <div class="pdp-stat-card log">
            <div class="pdp-stat-label">日志事件</div>
            <div class="pdp-stat-value">{{ statsLogCount }}</div>
            <div class="pdp-stat-meta">占比 {{ statsLogPct }}%</div>
          </div>
          <div class="pdp-stat-card progress">
            <div class="pdp-stat-label">进度事件</div>
            <div class="pdp-stat-value">{{ statsProgressCount }}</div>
            <div class="pdp-stat-meta">占比 {{ statsProgressPct }}%</div>
          </div>
          <div class="pdp-stat-card error-card" :class="{ risk: statsErrorCount > 0 }">
            <div class="pdp-stat-label">错误事件</div>
            <div class="pdp-stat-value" :class="{ error: statsErrorCount > 0 }">{{ statsErrorCount }}</div>
            <div class="pdp-stat-meta">占比 {{ statsErrorPct }}%</div>
          </div>
          <div class="pdp-stat-card muted other">
            <div class="pdp-stat-label">其他事件</div>
            <div class="pdp-stat-value">{{ statsOtherCount }}</div>
            <div class="pdp-stat-meta">占比 {{ statsOtherPct }}%</div>
          </div>
        </div>

        <div v-if="allEvents.length > 0" class="pdp-stats-bar">
          <div class="pdp-stats-bar-header">
            <div>
              <div class="pdp-stats-bar-title">事件分布</div>
              <div class="pdp-stats-bar-desc">日志、进度与异常事件的结构占比</div>
            </div>
            <div class="pdp-stats-bar-total">总计 {{ allEvents.length }} 条</div>
          </div>
          <div class="pdp-stats-bar-track">
            <div
              v-if="statsLogCount > 0"
              class="pdp-stats-bar-seg log"
              :style="{ width: statsLogPct + '%' }"
              :title="`日志 ${statsLogCount}`"
            ></div>
            <div
              v-if="statsProgressCount > 0"
              class="pdp-stats-bar-seg progress"
              :style="{ width: statsProgressPct + '%' }"
              :title="`进度 ${statsProgressCount}`"
            ></div>
            <div
              v-if="statsErrorCount > 0"
              class="pdp-stats-bar-seg error"
              :style="{ width: statsErrorPct + '%' }"
              :title="`错误 ${statsErrorCount}`"
            ></div>
            <div
              v-if="statsOtherCount > 0"
              class="pdp-stats-bar-seg other"
              :style="{ width: statsOtherPct + '%' }"
              :title="`其他 ${statsOtherCount}`"
            ></div>
          </div>
          <div class="pdp-stats-bar-legend">
            <span v-if="statsLogCount > 0" class="pdp-stats-bar-legend-item log">日志 {{ statsLogCount }} · {{ statsLogPct }}%</span>
            <span v-if="statsProgressCount > 0" class="pdp-stats-bar-legend-item progress">进度 {{ statsProgressCount }} · {{ statsProgressPct }}%</span>
            <span v-if="statsErrorCount > 0" class="pdp-stats-bar-legend-item error">错误 {{ statsErrorCount }} · {{ statsErrorPct }}%</span>
            <span v-if="statsOtherCount > 0" class="pdp-stats-bar-legend-item other">其他 {{ statsOtherCount }} · {{ statsOtherPct }}%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 错误信息 -->
    <div v-if="errorText" class="pdp-error-box">
      <div class="pdp-error-title">错误信息</div>
      <pre class="pdp-error-text">{{ errorText }}</pre>
    </div>

    <!-- 完成结果摘要 -->
    <div v-if="taskStatus === 'completed' && resultSummary" class="pdp-section">
      <div class="pdp-section-title">生成结果</div>
      <div class="pdp-result-list">
        <div v-for="(val, key) in resultSummary" :key="key" class="pdp-result-row">
          <span class="pdp-result-key">{{ key }}</span>
          <span class="pdp-result-val" :title="String(val)">{{ val }}</span>
        </div>
      </div>
    </div>

    <!-- 视觉比对结果（已暂时注释掉，2026-08-01） -->
    <!--
    <div v-if="taskStatus === 'completed' && visualComparison" class="pdp-section">
      <div class="pdp-section-title">
        视觉比对
        <span class="pdp-vc-mode-badge">{{ visualComparison.qualityMode === 'fast' ? '快速模式' : '标准模式' }}</span>
      </div>
      <div class="pdp-vc-score-row">
        <div class="pdp-vc-score-ring" :style="{ borderColor: visualComparison.scoreColor }">
          <span class="pdp-vc-score-num" :style="{ color: visualComparison.scoreColor }">{{ visualComparison.similarity }}</span>
          <span class="pdp-vc-score-unit">%</span>
        </div>
        <div class="pdp-vc-score-info">
          <div class="pdp-vc-score-label" :style="{ color: visualComparison.scoreColor }">{{ visualComparison.scoreLabel }}</div>
          <div class="pdp-vc-pass-badge" :class="visualComparison.pass ? 'pass' : 'fail'">
            {{ visualComparison.pass ? '✓ 通过' : '✗ 未通过' }}
          </div>
          <div v-if="visualComparison.degraded" class="pdp-vc-degraded-tag">降级评估</div>
        </div>
      </div>
      <div class="pdp-vc-bar-track">
        <div class="pdp-vc-bar-fill" :style="{ width: visualComparison.similarity + '%', background: visualComparison.scoreColor }"></div>
      </div>
      <div v-if="visualComparison.totalIssues > 0" class="pdp-vc-issues">
        <div class="pdp-vc-issues-header" @click="showVisualIssues = !showVisualIssues">
          <span class="pdp-vc-issues-title">
            发现 {{ visualComparison.totalIssues }} 个差异
            <span v-if="visualComparison.highIssues.length" class="pdp-vc-issue-count high">{{ visualComparison.highIssues.length }} 严重</span>
            <span v-if="visualComparison.mediumIssues.length" class="pdp-vc-issue-count medium">{{ visualComparison.mediumIssues.length }} 中等</span>
            <span v-if="visualComparison.lowIssues.length" class="pdp-vc-issue-count low">{{ visualComparison.lowIssues.length }} 轻微</span>
          </span>
          <span class="pdp-vc-issues-toggle">{{ showVisualIssues ? '收起 ▲' : '展开 ▼' }}</span>
        </div>
        <div v-if="showVisualIssues" class="pdp-vc-issues-list">
          <div v-for="(issue, idx) in visualComparison.highIssues" :key="'h' + idx" class="pdp-vc-issue-item severity-high">
            <span class="pdp-vc-issue-sev" :class="issue.severity">{{ issue.severity === 'high' ? '严重' : issue.severity === 'medium' ? '中等' : '轻微' }}</span>
            <span class="pdp-vc-issue-desc">{{ issue.description }}</span>
            <span v-if="issue.region" class="pdp-vc-issue-region">{{ issue.region }}</span>
          </div>
          <div v-for="(issue, idx) in visualComparison.mediumIssues" :key="'m' + idx" class="pdp-vc-issue-item severity-medium">
            <span class="pdp-vc-issue-sev medium">中等</span>
            <span class="pdp-vc-issue-desc">{{ issue.description }}</span>
            <span v-if="issue.region" class="pdp-vc-issue-region">{{ issue.region }}</span>
          </div>
          <div v-for="(issue, idx) in visualComparison.lowIssues" :key="'l' + idx" class="pdp-vc-issue-item severity-low">
            <span class="pdp-vc-issue-sev low">轻微</span>
            <span class="pdp-vc-issue-desc">{{ issue.description }}</span>
            <span v-if="issue.region" class="pdp-vc-issue-region">{{ issue.region }}</span>
          </div>
        </div>
      </div>
    </div>
    -->

    <!-- 🆕 重新配置并重试弹窗 -->
    <div v-if="showRetryConfig" class="pdp-modal-overlay" @click.self="showRetryConfig = false">
      <div class="pdp-modal">
        <div class="pdp-modal-header">
          <span class="pdp-modal-title">重新配置 API 并重试</span>
          <button class="pdp-modal-close icon-btn" aria-label="关闭" data-tooltip="关闭" @click="showRetryConfig = false">✕</button>
        </div>
        <div class="pdp-modal-body">
          <p class="pdp-modal-desc">原任务因 API 额度耗尽(429)或配置问题失败，请填入新配置后重试。留空则沿用当前配置。</p>
          <div class="pdp-form-group">
            <label>模型名称</label>
            <input v-model="retryConfig.model" placeholder="例如: gpt-5.5, claude-sonnet-4-20250514" class="pdp-input" />
          </div>
          <div class="pdp-form-group">
            <label>API Endpoint</label>
            <input v-model="retryConfig.endpoint" placeholder="例如: https://api.fenno.ai/v1" class="pdp-input" />
          </div>
          <div class="pdp-form-group">
            <label>API Key</label>
            <input v-model="retryConfig.apiKey" type="password" placeholder="sk-..." class="pdp-input" />
          </div>
          <div v-if="retryError" class="pdp-retry-error">{{ retryError }}</div>
          <div v-if="retrySuccess" class="pdp-retry-success">{{ retrySuccess }}</div>
        </div>
        <div class="pdp-modal-footer">
          <button class="pdp-btn pdp-btn-secondary" @click="showRetryConfig = false" :disabled="retrying">取消</button>
          <button class="pdp-btn pdp-btn-primary" @click="handleRetryWithConfig" :disabled="retrying">
            {{ retrying ? '重试中...' : '确认重试' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { connectSse, disconnectSse, getSseState, useSsePoolCleanup, type SseProgressEvent } from '@/composables/useSsePool'

const REF_KEY = 'ProgressDetailPanel'

// Props
const props = defineProps<{
  /** 任务对象 */
  task: any
  /** 面板显示控制 */
  visible?: boolean
}>()

// Emits
const emit = defineEmits<{
  pause: []
  cancel: []
  download: []
  view: []
  retry: []
  navigate: []
  playground: []
  detail: []
  /** 🆕 重新配置并重试（断点续跑） */
  retryWithConfig: [config: { model?: string; endpoint?: string; apiKey?: string }]
}>()

// 状态
const activeTab = ref<'stages' | 'logs' | 'stats'>('stages')
const timelineRef = ref<HTMLElement>()
const logListRef = ref<HTMLElement>()
const stagesRef = ref<HTMLElement>()

// 页签定义
const tabs = computed(() => [
  { key: 'stages', label: '阶段', count: pipelineStages.value.filter(s => s.status !== 'pending').length },
  { key: 'logs', label: '日志', count: logItems.value.length },
  { key: 'stats', label: '统计', count: null },
])

// 🆕 重新配置并重试
const showRetryConfig = ref(false)
const retrying = ref(false)
const retryError = ref('')
const retrySuccess = ref('')
const retryConfig = ref({
  model: '',
  endpoint: '',
  apiKey: '',
})

async function handleRetryWithConfig() {
  const sessionId = props.task?.sessionId
  if (!sessionId) {
    retryError.value = '任务 ID 缺失'
    return
  }

  retrying.value = true
  retryError.value = ''

  const configPayload: any = {}
  if (retryConfig.value.model) configPayload.model = retryConfig.value.model
  if (retryConfig.value.endpoint) configPayload.endpoint = retryConfig.value.endpoint
  if (retryConfig.value.apiKey) configPayload.apiKey = retryConfig.value.apiKey

  // 关闭弹窗，通知父组件（父组件调后端并管理状态）
  showRetryConfig.value = false
  emit('retryWithConfig', configPayload)
  retrying.value = false
}

// SSE 连接管理
const sessionId = computed(() => props.task?.sessionId || '')
const taskStatus = computed(() => props.task?.status || 'unknown')

// 监听 visible 变化，控制 SSE 连接
// 🔧 修复：不再依赖 taskStatus === 'running'（来自 3s 轮询，会导致建连延迟最多 3s，
// 错过早期进度）。后端 SSE 对 running 任务会重放缓冲进度、对终态任务会推送
// complete/error 后 res.end、对未创建任务会 keep-alive 等进度，均为安全行为，
// 因此只要面板可见 + 有 sessionId 就立即建连。
watch(
  () => props.visible && !!sessionId.value,
  (shouldConnect) => {
    if (shouldConnect && sessionId.value) {
      connectSse(sessionId.value, REF_KEY)
    }
  },
  { immediate: true },
)

// 面板关闭时断连（但保留事件缓存）
watch(
  () => props.visible,
  (visible) => {
    if (!visible && sessionId.value) {
      disconnectSse(sessionId.value, REF_KEY)
    }
  },
)

// 获取 SSE 状态
const sseState = computed(() => (sessionId.value ? getSseState(sessionId.value) : undefined))
const sseStatus = computed(() => sseState.value?.status || 'disconnected')
const sseEvents = computed(() => sseState.value?.events || [])
const sseResult = computed(() => sseState.value?.result)
const sseError = computed(() => sseState.value?.error)

// 手动重连
function handleReconnect() {
  if (sessionId.value) {
    connectSse(sessionId.value, REF_KEY)
  }
}

// 混合事件：来自 SSE 连接池的实时事件 + 当前轮询快照的 progress
const allEvents = computed(() => {
  // 如果有 SSE 实时事件，优先使用
  if (sseEvents.value.length > 0) {
    return sseEvents.value
  }
  // 否则从 task.progress 构建基础事件
  const progress = props.task?.progress
  if (!Array.isArray(progress) || progress.length === 0) return []
  return progress.map((p: any) => ({
    type: p.type || 'progress',
    stage: p.stage || p.node,
    message: p.message,
    status: p.status,
    level: p.level,
    source: 'history' as const,
    timestamp: p.timestamp || p.time || props.task?.startTime,
  }))
})

// ---- 管线阶段定义与聚合 ----
type PipelineStageKey = 'init' | 'figma' | 'visual' | 'parallel' | 'codegen' | 'refine' | 'quality' | 'revision' | 'complete'
type PipelineStageStatus = 'pending' | 'running' | 'success' | 'error'

const PIPELINE_STAGE_LABELS: Record<PipelineStageKey, string> = {
  init: '初始化',
  figma: 'Figma 数据获取',
  visual: '视觉分析',
  parallel: '并行分析',
  codegen: '代码生成',
  refine: '串行精修',
  quality: '质量检查',
  revision: '迭代修订',
  complete: '完成',
}

const MAX_PIPELINE_STAGE_KEYS: PipelineStageKey[] = ['init', 'figma', 'visual', 'parallel', 'codegen', 'refine', 'quality', 'revision', 'complete']
const LITE_SCREENSHOT_STAGE_KEYS: PipelineStageKey[] = ['init', 'visual', 'codegen', 'complete']
const LITE_FIGMA_STAGE_KEYS: PipelineStageKey[] = ['init', 'figma', 'visual', 'codegen', 'complete']

const taskTier = computed(() => {
  const t = props.task || {}
  const explicit = t.generationTier || t.tier || t.config?.generationTier || t.metadata?.generationTier
  if (explicit) return String(explicit).toLowerCase()

  const parts = String(t.sessionId || '').split('-')
  if (parts[1] === 'lite') return 'lite'
  if (parts[1] === 'max') return 'max'
  return ''
})

const taskSource = computed(() => {
  const t = props.task || {}
  const explicit = t.sourceType || t.source || t.inputSource || t.config?.sourceType || t.metadata?.sourceType
  if (explicit) return String(explicit).toLowerCase()
  if (t.fileKey && t.nodeId) return 'figma'

  const sid = String(t.sessionId || '')
  const parts = sid.split('-')
  if (parts[1] === 'lite' || sid.startsWith('ml-')) return 'screenshot'
  if (parts[1] === 'max') return 'figma'
  return ''
})

const pipelineStageKeys = computed<PipelineStageKey[]>(() => {
  const tier = taskTier.value
  const source = taskSource.value
  const sid = String(props.task?.sessionId || '')

  // Lite 是轻量生成链路，不应展示 Max/Phase2 的并行分析、精修、迭代修订等阶段。
  if (tier === 'lite' || sid.startsWith('lite-')) {
    return source === 'figma' ? LITE_FIGMA_STAGE_KEYS : LITE_SCREENSHOT_STAGE_KEYS
  }

  // Max/Phase2 保留完整管线，Figma 来源会出现 Figma 数据获取阶段。
  return MAX_PIPELINE_STAGE_KEYS
})

function mapStageToKey(stage: string): PipelineStageKey | '' {
  const s = (stage || '').trim().toLowerCase()
  if (!s) return ''
  if (s.includes('precheck') || s.includes('初始化') || s.includes('init')) return 'init'
  if (s.includes('upgrade-fetch') || s.includes('figma')) return 'figma'
  if (s.includes('analyzing') || s.includes('analysis_done') || s.includes('upgrade-analysis') || s.includes('视觉') || s.includes('visual')) return 'visual'
  if (s.includes('并行') || s.includes('parallel') || s.includes('l0-a') || s.includes('l0-b')) return 'parallel'
  if (s.includes('generating') || s.includes('codegen') || s.includes('codegen_done') || s.includes('upgrade-download') || s.includes('upgrade-sync') || s.includes('代码') || s.includes('微码') || s.includes('microcode')) return 'codegen'
  if (s.includes('精修') || s.includes('refine')) return 'refine'
  if (s.includes('质量') || s.includes('quality') || s.includes('对抗') || s.includes('adversarial')) return 'quality'
  if (s.includes('resuming') || s.includes('修订') || s.includes('revision')) return 'revision'
  if (s.includes('完成') || s.includes('complete')) return 'complete'
  return ''
}

const pipelineStages = computed(() => {
  const stageMap: Record<string, {
    key: string
    label: string
    status: PipelineStageStatus
    message: string
    startTime: number
    endTime: number
    duration: string
    eventCount: number
  }> = {}

  // 初始化当前任务适用的阶段为 pending
  for (const key of pipelineStageKeys.value) {
    if (key === 'complete') continue
    stageMap[key] = {
      key,
      label: PIPELINE_STAGE_LABELS[key],
      status: 'pending',
      message: '',
      startTime: 0,
      endTime: 0,
      duration: '',
      eventCount: 0,
    }
  }

  // 遍历事件，更新阶段状态
  for (const evt of allEvents.value) {
    const stageKey = mapStageToKey(evt.stage || '')
    if (!stageKey) continue

    const stage = stageMap[stageKey]
    if (!stage) continue

    stage.eventCount++

    // 更新消息
    if (evt.message) {
      stage.message = evt.message.length > 80 ? evt.message.slice(0, 80) + '...' : evt.message
    }

    // 更新时间
    if (evt.timestamp && (!stage.startTime || evt.timestamp < stage.startTime)) {
      stage.startTime = evt.timestamp
    }
    if (evt.timestamp && evt.timestamp > stage.endTime) {
      stage.endTime = evt.timestamp
    }

    // 更新状态
    if (evt.type === 'error') {
      stage.status = 'error'
    } else if (evt.type === 'complete') {
      // complete 事件更新当前阶段为 success
      if (stage.status === 'running') stage.status = 'success'
    } else if (evt.status === 'running') {
      if (stage.status === 'pending') stage.status = 'running'
    } else if (evt.status === 'completed') {
      if (stage.status !== 'error') stage.status = 'success'
    }
  }

  // 计算持续时间
  const now = Date.now()
  for (const stage of Object.values(stageMap)) {
    if (stage.startTime && stage.endTime) {
      const ms = stage.endTime - stage.startTime
      if (ms < 1000) stage.duration = `${ms}ms`
      else if (ms < 60000) stage.duration = `${(ms / 1000).toFixed(1)}s`
      else stage.duration = `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`
    } else if (stage.startTime && stage.status === 'running') {
      const ms = now - stage.startTime
      if (ms < 60000) stage.duration = `${Math.floor(ms / 1000)}s`
      else stage.duration = `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`
    }
  }

  // 完成任务应把适用阶段补齐为成功，避免历史事件缺失或阶段名不匹配时出现“已完成但全灰”。
  if (taskStatus.value === 'completed') {
    for (const stage of Object.values(stageMap)) {
      if (stage.status === 'pending') {
        stage.status = 'success'
        stage.message = stage.message || '已完成'
      }
    }

    stageMap['complete'] = {
      key: 'complete',
      label: PIPELINE_STAGE_LABELS['complete'],
      status: 'success',
      message: '',
      startTime: 0,
      endTime: 0,
      duration: '',
      eventCount: 0,
    }
    return Object.values(stageMap)
  }

  return Object.values(stageMap)
})

// 日志项（完整日志 + 连续相同 message 折叠）
const logItems = computed(() => {
  let count = 0
  let lastMsg = ''
  let lastItem: any = null
  const result: Array<{
    level: string
    message: string
    timestamp: number
    count: number
  }> = []
  const now = Date.now()

  for (const e of allEvents.value) {
    // 接受所有带 message 的事件（兼容不同后端的 type 标记）
    if (!e.message) continue
    const msg = (e.message || '').trim()
    if (!msg) continue

    count++

    if (msg === lastMsg) {
      // 连续相同消息：折叠计数
      if (lastItem) lastItem.count++
      continue
    }

    // 刷新上一项到结果
    if (lastItem) result.push(lastItem)

    lastMsg = msg
    lastItem = {
      level: e.level || (e.type === 'error' ? 'error' : 'info'),
      message: msg,
      timestamp: e.timestamp || now,
      count: 1,
    }
  }
  // 刷出最后一项
  if (lastItem) result.push(lastItem)

  return result.slice(-200)
})

/** 日志原始条数（折叠前） */
const logItemRawCount = computed(() =>
  allEvents.value.filter((e: any) =>
    (e.type === 'log' || e.type === 'progress') && e.message
  ).length
)

// ---- 日志筛选 ----
const logFilter = ref('all')
const logLevels = ['all', 'INFO', 'WARN', 'ERROR']

function logLevelCount(level: string): number {
  return logItems.value.filter(l => l.level === level.toLowerCase()).length
}

const filteredLogItems = computed(() => {
  if (logFilter.value === 'all') return logItems.value
  return logItems.value.filter(l => l.level === logFilter.value.toLowerCase())
})

// ---- 统计页签数据 ----
const statsTotalDuration = computed(() => {
  const start = props.task?.startTime
  if (!start) return '--'
  const end = props.task?.endTime || (taskStatus.value === 'running' ? Date.now() : start)
  return formatDuration(start, end)
})

const statsLlmCalls = computed(() => {
  // 从事件中统计 LLM 调用
  return allEvents.value.filter((e: any) => {
    const msg = (e.message || e.stage || '').toLowerCase()
    return msg.includes('llm') || msg.includes('调用') || msg.includes('invoke') || msg.includes('模型')
  }).length
})

const statsLogCount = computed(() =>
  allEvents.value.filter((e: any) => e.type === 'log').length
)
const statsProgressCount = computed(() =>
  allEvents.value.filter((e: any) => e.type === 'progress').length
)
const statsErrorCount = computed(() =>
  allEvents.value.filter((e: any) => e.type === 'error').length
)
const statsOtherCount = computed(() =>
  Math.max(0, allEvents.value.length - statsLogCount.value - statsProgressCount.value - statsErrorCount.value)
)

function calcStatsPct(count: number) {
  if (allEvents.value.length === 0) return 0
  return Math.round((count / allEvents.value.length) * 100)
}

const statsLlmPct = computed(() => calcStatsPct(statsLlmCalls.value))
const statsLogPct = computed(() => calcStatsPct(statsLogCount.value))
const statsProgressPct = computed(() => calcStatsPct(statsProgressCount.value))
const statsErrorPct = computed(() => calcStatsPct(statsErrorCount.value))
const statsOtherPct = computed(() => {
  if (allEvents.value.length === 0) return 0
  return Math.max(0, 100 - statsLogPct.value - statsProgressPct.value - statsErrorPct.value)
})
const statsSummaryText = computed(() => {
  if (statsErrorCount.value > 0) {
    return `发现 ${statsErrorCount.value} 条错误事件，需要优先关注异常阶段。`
  }
  if (statsProgressCount.value > 0) {
    return `本次任务共记录 ${statsProgressCount.value} 条进度推进事件。`
  }
  return '当前任务已记录完整执行轨迹。'
})
const statsHealthLabel = computed(() => {
  if (statsErrorCount.value > 0) return '需关注'
  if (taskStatus.value === 'running') return '运行中'
  return '稳定'
})
const statsHealthTone = computed(() => {
  if (statsErrorCount.value > 0) return 'risk'
  if (taskStatus.value === 'running') return 'active'
  return 'safe'
})

// ---- 最后活动时间追踪 ----
const lastActivityAt = ref(Date.now())

// 监听事件列表变化，每次新增事件更新最后活动时间
watch(allEvents, (events) => {
  if (events.length > 0) {
    lastActivityAt.value = Date.now()
  }
})

const lastActivityMs = ref(0)
let lastActivityTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  lastActivityTimer = setInterval(() => {
    lastActivityMs.value = Date.now() - lastActivityAt.value
  }, 5000)
})

onUnmounted(() => {
  if (lastActivityTimer) clearInterval(lastActivityTimer)
})

const lastActivityStale = computed(() => lastActivityMs.value > 30000)     // >30s
const lastActivityStuck = computed(() => lastActivityMs.value > 300000)    // >5min

const lastActivityText = computed(() => {
  if (lastActivityMs.value < 5000) return ''
  if (lastActivityMs.value < 60000) return `${Math.floor(lastActivityMs.value / 1000)}s`
  const m = Math.floor(lastActivityMs.value / 60000)
  return `${m}m`
})

// 连接状态标签（精简版，合并到头部）
const connLabel = computed(() => {
  const map: Record<string, string> = {
    connecting: '连接中',
    connected: '',
    disconnected: '断开',
    error: '异常',
  }
  return map[sseStatus.value] || ''
})
const connTitle = computed(() => {
  if (lastActivityStuck.value) return '任务可能卡住（>5min 无活动）'
  if (lastActivityStale.value) return `最后更新 ${lastActivityText.value} 前`
  return ''
})

// 错误文本：完成态不展示历史残留 error，避免“已完成但仍报错”的矛盾状态。
const errorText = computed(() => {
  if (taskStatus.value === 'completed') return ''
  return sseError.value || props.task?.error || ''
})

// 结果摘要
const resultSummary = computed(() => {
  const r = sseResult.value || props.task?.result
  if (!r) return null
  const summary: Record<string, string> = {}
  if (r.componentName) summary['组件名'] = r.componentName
  if (r.summary?.componentName) summary['组件名'] = r.summary.componentName
  if (r.summary?.codeLength) summary['代码长度'] = `${r.summary.codeLength} 字符`
  if (r.summary?.qualityScore) summary['质量评分'] = `${r.summary.qualityScore} 分`
  if (r.totalComponents !== undefined) summary['总组件数'] = String(r.totalComponents)
  if (r.successCount !== undefined) summary['成功'] = String(r.successCount)
  if (r.failedCount !== undefined) summary['失败'] = String(r.failedCount)
  return Object.keys(summary).length > 0 ? summary : null
})

// 视觉比对报告
const showVisualIssues = ref(false)

interface VisualIssue {
  severity: string
  category?: string
  region?: string
  description: string
  suggestion?: string
}

interface VisualComparisonData {
  overallSimilarity: number
  pass: boolean
  issues: VisualIssue[]
  degraded?: boolean
}

const visualComparison = computed(() => {
  const r = sseResult.value || props.task?.result
  if (!r) return null

  const report = r.visualComparisonReport
  if (!report || report.overallSimilarity == null) return null

  const qualityMode = r.qualityMode || 'standard'

  // 分类 issues
  const highIssues = (report.issues || []).filter((i: VisualIssue) => i.severity === 'high')
  const mediumIssues = (report.issues || []).filter((i: VisualIssue) => i.severity === 'medium')
  const lowIssues = (report.issues || []).filter((i: VisualIssue) => i.severity === 'low')

  // 相似度颜色
  let scoreColor = 'var(--success)'
  let scoreLabel = '优秀'
  if (report.overallSimilarity < 50) {
    scoreColor = 'var(--error)'
    scoreLabel = '较差'
  } else if (report.overallSimilarity < 80) {
    scoreColor = 'var(--warning)'
    scoreLabel = '一般'
  }

  return {
    similarity: report.overallSimilarity,
    pass: report.pass,
    degraded: report.degraded || false,
    qualityMode,
    scoreColor,
    scoreLabel,
    highIssues,
    mediumIssues,
    lowIssues,
    totalIssues: (report.issues || []).length,
  }
})

// 进度计数（统一基数：去重后的事件总数）
const progressCount = computed(() => allEvents.value.length)

// 显示状态
const displayStatus = computed(() => {
  if (taskStatus.value === 'running' && sseStatus.value === 'connected') return 'running'
  return taskStatus.value
})

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    running: '进行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    paused: '已暂停',
  }
  return map[taskStatus.value] || taskStatus.value
})

const taskDisplayName = computed(() => {
  const name = props.task?.componentName || props.task?.sessionId || '未知'
  return name.replace(/^(page|mc|vue3|phase2|lr)-[\d]+-[a-f0-9]+-/, '')
})

const taskTypeLabel = computed(() => {
  const t = props.task
  if (!t) return ''
  if (t.taskType === 'page') return '页面生成'
  if (t.taskType === 'api') return '接口生成'
  if (t.taskType === 'workflow') return '工作流'
  if (t.taskType === 'component') return t.target === 'vue3' ? 'Vue3组件' : '微码组件'
  const sid = t.sessionId || ''
  if (sid.startsWith('page-') && !t.parentId) return '页面生成'
  if (sid.startsWith('lr-')) return '大屏布局'
  if (t.target === 'vue3') return 'Vue3组件'
  return '任务'
})

const taskTypeClass = computed(() => {
  const t = props.task
  if (!t) return ''
  if (t.taskType === 'page' || (t.sessionId || '').startsWith('page-')) return 'page'
  if (t.taskType === 'api') return 'api'
  if (t.taskType === 'workflow') return 'workflow'
  if (t.taskType === 'component' || t.target) return t.target === 'vue3' ? 'vue3' : 'microcode'
  if ((t.sessionId || '').startsWith('lr-')) return 'screen'
  return ''
})

// 运行时长
const elapsedText = computed(() => {
  const start = props.task?.startTime
  if (!start) return '--'
  const end = props.task?.endTime || (taskStatus.value === 'running' ? Date.now() : start)
  return formatDuration(start, end)
})

// 工具函数
function formatDuration(start: number, end: number) {
  const seconds = Math.floor((end - start) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function formatTime(ts: number) {
  if (!ts) return '--:--:--'
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

// 新日志自动滚动到底部
watch([logItems, activeTab], () => {
  nextTick(() => {
    if (activeTab.value === 'logs' && logListRef.value) {
      logListRef.value.scrollTop = logListRef.value.scrollHeight
    }
  })
})

// 清理
useSsePoolCleanup(REF_KEY)

onUnmounted(() => {
  if (sessionId.value) {
    disconnectSse(sessionId.value, REF_KEY)
  }
})
</script>

<style scoped>
/* ===== 根容器 ===== */
.pdp-root {
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 14px;
  box-shadow: 0 1px 4px var(--shadow-sm);
  font-size: 13px;
  color: var(--text-primary);
}

/* ===== 头部 ===== */
.pdp-header {
  margin-bottom: 12px;
}
.pdp-header-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 0;
  flex-wrap: wrap;
}
.pdp-status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}
.pdp-status-badge.running { color: var(--brand); background: var(--brand-bg); }
.pdp-status-badge.completed { color: var(--success); background: var(--success-bg); }
.pdp-status-badge.failed { color: var(--error); background: var(--error-bg); }
.pdp-status-badge.cancelled { color: var(--text-tertiary); background: var(--bg-alt); }
.pdp-status-badge.paused { color: var(--warning); background: var(--warning-bg); }

.pdp-name {
  font-weight: 700;
  font-size: 14px;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'DIN';
}
.pdp-type-tag {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-alt);
  padding: 4px 10px;
  border-radius: 6px;
  flex-shrink: 0;
  border: 1px solid transparent;
  font-family: inherit;
  letter-spacing: 0.2px;
  box-shadow: 0 1px 4px rgba(15, 23, 42, .12);
}
.pdp-type-tag.microcode {
  color: var(--component-microcode-contrast);
  background: var(--component-microcode);
  border-color: transparent;
}
.pdp-type-tag.vue3 {
  color: var(--component-vue3-contrast);
  background: var(--component-vue3);
  border-color: transparent;
}
.pdp-type-tag.page {
  color: var(--text-secondary);
  background: var(--bg-alt);
  border-color: var(--border-default);
  box-shadow: none;
}
.pdp-type-tag.screen {
  color: var(--warning);
  background: var(--warning-bg);
  border-color: var(--warning-border);
  box-shadow: none;
}
.pdp-type-tag.api {
  color: var(--c-teal-500);
  background: rgba(20, 184, 166, 0.12);
  border-color: rgba(20, 184, 166, 0.3);
  box-shadow: none;
}
.pdp-type-tag.workflow {
  color: var(--c-pink-400);
  background: rgba(244, 114, 182, 0.12);
  border-color: rgba(244, 114, 182, 0.3);
  box-shadow: none;
}

/* ===== 行内连接状态指示器（紧凑版） ===== */
.pdp-conn-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: 4px;
}
.pdp-conn-dot-inline {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
.pdp-conn-dot-inline.connecting { background: var(--warning); animation: pdp-pulse 1s ease-in-out infinite; }
.pdp-conn-dot-inline.connected { background: var(--success); }
.pdp-conn-dot-inline.disconnected { background: var(--border-strong); }
.pdp-conn-dot-inline.error { background: var(--error); }
.pdp-conn-label-inline {
  font-size: 10px;
}
.pdp-reconnect-mini {
  font-size: 10px;
  padding: 1px 6px;
  border: 1px solid var(--brand-border);
  border-radius: var(--radius-xs);
  background: var(--bg-card);
  color: var(--brand);
  cursor: pointer;
}
.pdp-reconnect-mini:hover {
  background: var(--brand-bg);
}
.pdp-stuck-mini {
  font-size: 10px;
  color: var(--error);
  background: var(--error-bg);
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--error-border);
}

@keyframes pdp-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ===== 页签导航 ===== */
.pdp-tabs {
  display: flex;
  gap: 0;
  background: transparent;
  border-radius: 0;
  padding: 0;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-light);
}
.pdp-tab {
  flex: 1;
  padding: 8px 0;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s;
  border-radius: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.pdp-tab:hover {
  color: var(--text-secondary);
  background: transparent;
}
.pdp-tab.active {
  color: var(--text-primary);
  background: transparent;
  font-weight: 600;
  box-shadow: none;
  border-bottom-color: var(--brand);
}
.pdp-tab-count {
  font-size: 10px;
  font-weight: 400;
  color: var(--text-tertiary);
  margin-left: 2px;
}
.pdp-tab.active .pdp-tab-count {
  color: var(--text-secondary);
}

/* ===== 页签内容容器 ===== */
.pdp-tab-content {
  max-height: 360px;
  overflow-y: auto;
  padding: 14px 6px 10px;
}
.pdp-empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 20px 0;
  font-size: 12px;
}

/* ===== 阶段时间线 ===== */
.pdp-stage-item {
  display: flex;
  gap: 10px;
  position: relative;
  min-height: 42px;
}
.pdp-stage-line {
  width: 20px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}
.pdp-stage-dot {
  width: 9px;
  height: 9px;
  border-radius: var(--radius-full);
  margin-top: 4px;
  z-index: 1;
  flex-shrink: 0;
}
.pdp-stage-dot.running {
  background: var(--brand);
  box-shadow: 0 0 0 3px rgba(22,119,255,0.18);
}
.pdp-stage-dot.success { background: var(--success); }
.pdp-stage-dot.error { background: var(--error); }
.pdp-stage-dot.pending { background: var(--border-strong); }

.pdp-stage-connector {
  width: 1.5px;
  flex: 1;
  min-height: 12px;
  background: var(--border-default);
}
.pdp-stage-connector.success { background: var(--success-border); }
.pdp-stage-connector.running { background: var(--border-default); }

.pdp-stage-body {
  flex: 1;
  min-width: 0;
  padding: 6px 0 14px 10px;
  border-radius: var(--radius-sm);
}
.pdp-stage-body.active {
  background: var(--brand-bg);
  padding-left: 10px;
  border-left: 2px solid var(--brand);
}
.pdp-stage-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.pdp-stage-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}
.pdp-stage-item.pending .pdp-stage-name {
  color: var(--text-tertiary);
  font-weight: 400;
}
.pdp-stage-item.error .pdp-stage-name {
  color: var(--error);
}
.pdp-stage-duration {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.pdp-stage-body.active .pdp-stage-duration {
  color: var(--brand);
}
.pdp-stage-msg {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-top: 3px;
  word-break: break-all;
}
.pdp-stage-events {
  margin-top: 4px;
}
.pdp-stage-event-count {
  display: inline-block;
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-alt);
  padding: 1px 7px;
  border-radius: var(--radius-md);
}

/* ===== 日志筛选 ===== */
.pdp-log-filter {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
  padding: 0 2px;
  flex-wrap: wrap;
}
.pdp-log-filter-btn {
  font-size: 11px;
  padding: 3px 9px;
  border: 0.5px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 3px;
}
.pdp-log-filter-btn:hover {
  color: var(--text-secondary);
  border-color: var(--border-strong);
}
.pdp-log-filter-btn.active {
  color: var(--text-on-brand);
  background: var(--brand);
  border-color: var(--brand);
}
.pdp-log-filter-count {
  font-size: 9px;
  opacity: 0.8;
}
.pdp-log-filter-btn.active .pdp-log-filter-count {
  opacity: 1;
}

/* ===== 日志列表全高 ===== */
.pdp-log-list-full {
  max-height: 280px;
  overflow-y: auto;
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 6px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 11px;
}

.pdp-log-item {
  display: flex;
  gap: 8px;
  padding: 2px 4px;
  border-radius: var(--radius-xs);
  line-height:2;
  min-width: 0;
}
.pdp-log-item:hover {
  background: rgba(0,0,0,0.03);
}
.pdp-log-item.error {
  color: var(--error);
}
.pdp-log-item.warn {
  color: var(--warning);
}
.pdp-log-item.info {
  color: var(--text-secondary);
}

.pdp-log-time {
  color: var(--text-secondary);
  flex-shrink: 0;
}
.pdp-log-level {
  font-weight: 600;
  flex-shrink: 0;
  width: 36px;
}
.pdp-log-msg {
  flex: 1;
  word-break: break-all;
}
.pdp-log-fold {
  display: inline-block;
  margin-left: 4px;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-inverse);
  background: var(--text-tertiary);
  border-radius: var(--radius-md);
  line-height: 1.6;
  vertical-align: middle;
}

/* ===== 统计页签 ===== */
.pdp-stats-layout {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pdp-stats-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(240px, 0.85fr);
  gap: 10px;
}
.pdp-stats-hero-main,
.pdp-stats-hero-side,
.pdp-stats-bar {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-card);
}
.pdp-stats-hero-main {
  padding: 12px 14px;
  border-color: color-mix(in srgb, var(--brand-border) 72%, var(--border-light));
  background: var(--brand-bg);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--brand-bg) 55%, transparent);
}
.pdp-stats-kicker {
  font-size: 10px;
  font-weight: 600;
  color: color-mix(in srgb, var(--brand) 82%, var(--text-secondary));
  margin-bottom: 6px;
}
.pdp-stats-hero-value {
  font-size: 32px;
  line-height: 1;
  font-weight: 700;
  color: var(--text-primary);
  font-family: 'DIN';
}
.pdp-stats-hero-label {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}
.pdp-stats-hero-hint {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
}
.pdp-stats-hero-side {
  padding: 10px;
  display: grid;
  gap: 8px;
  background: color-mix(in srgb, var(--bg-alt) 72%, var(--bg-card));
}
.pdp-stat-emphasis {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.32);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pdp-stat-emphasis.active {
  border-color: color-mix(in srgb, var(--brand-border) 78%, var(--border-light));
  background: var(--brand-bg);
}
.pdp-stat-emphasis.safe {
  border-color: color-mix(in srgb, var(--success-border) 78%, var(--border-light));
  background: var(--success-bg);
}
.pdp-stat-emphasis.risk {
  border-color: color-mix(in srgb, var(--error-border) 76%, var(--border-light));
  background: var(--error-bg);
}
.pdp-stat-emphasis-label {
  font-size: 10px;
  color: var(--text-tertiary);
}
.pdp-stat-emphasis-value {
  font-size: 21px;
  line-height: 1.05;
  font-weight: 700;
  color: var(--text-primary);
  font-family: 'DIN';
}
.pdp-stat-emphasis.active .pdp-stat-emphasis-value {
  color: color-mix(in srgb, var(--brand) 80%, var(--text-primary));
}
.pdp-stat-emphasis.safe .pdp-stat-emphasis-value {
  color: color-mix(in srgb, var(--success) 86%, var(--text-primary));
}
.pdp-stat-emphasis.risk .pdp-stat-emphasis-value {
  color: color-mix(in srgb, var(--error) 84%, var(--text-primary));
}
.pdp-stat-emphasis-note {
  font-size: 10px;
  line-height: 1.4;
  color: var(--text-secondary);
}
.pdp-stats-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.pdp-stat-card {
  padding: 10px 9px;
  background: color-mix(in srgb, var(--bg-alt) 80%, var(--bg-card));
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
  text-align: left;
}
.pdp-stat-card.emphasis,
.pdp-stat-card.llm {
  border-color: color-mix(in srgb, var(--brand-border) 72%, var(--border-light));
  background: var(--brand-bg);
}
.pdp-stat-card.log {
  border-color: color-mix(in srgb, var(--brand-border) 54%, var(--border-light));
  background: var(--brand-bg);
}
.pdp-stat-card.progress {
  border-color: color-mix(in srgb, var(--success-border) 58%, var(--border-light));
  background: var(--success-bg);
}
.pdp-stat-card.error-card,
.pdp-stat-card.risk {
  border-color: color-mix(in srgb, var(--error-border) 58%, var(--border-light));
  background: var(--error-bg);
}
.pdp-stat-card.other,
.pdp-stat-card.muted {
  border-color: color-mix(in srgb, var(--border-default) 78%, var(--border-light));
  background: var(--bg-alt);
}
.pdp-stat-label {
  font-size: 10px;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}
.pdp-stat-value {
  font-size: 21px;
  line-height: 1.05;
  font-weight: 700;
  color: var(--text-primary);
  font-family: 'DIN';
}
.pdp-stat-card.llm .pdp-stat-value,
.pdp-stat-card.log .pdp-stat-value {
  color: color-mix(in srgb, var(--brand) 80%, var(--text-primary));
}
.pdp-stat-card.progress .pdp-stat-value {
  color: color-mix(in srgb, var(--success) 84%, var(--text-primary));
}
.pdp-stat-card.other .pdp-stat-value,
.pdp-stat-card.muted .pdp-stat-value {
  color: var(--text-secondary);
}
.pdp-stat-value.error {
  color: var(--error);
}
.pdp-stat-meta {
  margin-top: 6px;
  font-size: 10px;
  color: var(--text-secondary);
}

/* 事件分布条 */
.pdp-stats-bar {
  padding: 12px;
  border-color: color-mix(in srgb, var(--border-default) 82%, var(--border-light));
  background: var(--bg-alt);
}
.pdp-stats-bar-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.pdp-stats-bar-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 3px;
}
.pdp-stats-bar-desc {
  font-size: 10px;
  color: var(--text-tertiary);
}
.pdp-stats-bar-total {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}
.pdp-stats-bar-track {
  display: flex;
  height: 8px;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--bg-alt);
  margin-bottom: 8px;
}
.pdp-stats-bar-seg {
  height: 100%;
  transition: width 0.3s ease;
}
.pdp-stats-bar-seg.log { background: var(--brand); }
.pdp-stats-bar-seg.progress { background: var(--success); }
.pdp-stats-bar-seg.error { background: var(--error); }
.pdp-stats-bar-seg.other { background: var(--border-strong); }

.pdp-stats-bar-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.pdp-stats-bar-legend-item {
  font-size: 10px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}
.pdp-stats-bar-legend-item::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
}
.pdp-stats-bar-legend-item.log::before { background: var(--brand); }
.pdp-stats-bar-legend-item.progress::before { background: var(--success); }
.pdp-stats-bar-legend-item.error::before { background: var(--error); }
.pdp-stats-bar-legend-item.other::before { background: var(--border-strong); }

/* ===== 错误信息 ===== */
.pdp-error-box {
  margin-bottom: 10px;
  padding: 10px 12px;
  background: var(--error-bg);
  border: 1px solid var(--error-border);
  border-radius: var(--radius-md);
}
.pdp-error-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--error);
  margin-bottom: 4px;
}
.pdp-error-text {
  font-size: 11px;
  color: var(--error-text);
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 100px;
  overflow-y: auto;
  line-height: 1.5;
}

/* ===== 结果摘要 ===== */
.pdp-section {
  margin-bottom: 14px;
}
.pdp-section-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.pdp-result-list {
  display: flex;
  flex-direction: column;
}
.pdp-result-row {
  display: flex;
  gap: 8px;
  padding: 2px 4px;
  border-radius: var(--radius-xs);
  line-height: 1.5;
  min-width: 0;
}
.pdp-result-row:hover {
  background: rgba(0,0,0,0.03);
}
.pdp-result-key {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  flex-shrink: 0;
  width: 80px;
}
.pdp-result-val {
  font-size: 12px;
  color: var(--text-secondary);
  flex: 1;
  word-break: break-all;
}

/* ===== 视觉比对 ===== */
.pdp-vc-mode-badge {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--bg-alt);
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  margin-left: 8px;
  vertical-align: middle;
}

.pdp-vc-score-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 10px;
}

.pdp-vc-score-ring {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  border: 4px solid;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pdp-vc-score-num {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}

.pdp-vc-score-unit {
  font-size: 10px;
  color: var(--text-tertiary);
  margin-top: 1px;
}

.pdp-vc-score-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

@media (max-width: 900px) {
  .pdp-stats-hero {
    grid-template-columns: 1fr;
  }

  .pdp-stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .pdp-root {
    padding: 12px;
  }

  .pdp-header-info {
    align-items: flex-start;
  }

  .pdp-name {
    width: 100%;
    flex: 0 0 100%;
    white-space: normal;
    word-break: break-all;
  }

  .pdp-conn-inline {
    margin-left: 0;
    flex-wrap: wrap;
  }

  .pdp-tabs {
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .pdp-tab {
    flex: 0 0 auto;
    min-width: 88px;
    padding: 10px 12px;
    white-space: nowrap;
  }

  .pdp-tab-content {
    padding: 12px 0 8px;
  }

  .pdp-stage-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .pdp-log-filter-btn {
    flex: 1 1 calc(50% - 4px);
    justify-content: center;
  }

  .pdp-log-list-full {
    max-height: 240px;
    padding: 6px 4px;
  }

  .pdp-log-item {
    flex-wrap: wrap;
    gap: 2px 8px;
    line-height: 1.6;
  }

  .pdp-log-level {
    width: auto;
  }

  .pdp-log-msg {
    flex-basis: 100%;
  }

  .pdp-stats-grid {
    grid-template-columns: 1fr;
  }

  .pdp-stats-bar-header {
    flex-direction: column;
  }

  .pdp-result-row {
    flex-direction: column;
    gap: 2px;
  }

  .pdp-result-key {
    width: auto;
  }

  .pdp-vc-score-row {
    align-items: flex-start;
    flex-direction: column;
  }
}

.pdp-vc-score-label {
  font-size: 14px;
  font-weight: 700;
}

.pdp-vc-pass-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-xs);
  display: inline-block;
  width: fit-content;
}
.pdp-vc-pass-badge.pass {
  color: var(--success);
  background: var(--success-bg);
}
.pdp-vc-pass-badge.fail {
  color: var(--error);
  background: var(--error-bg);
}

.pdp-vc-degraded-tag {
  font-size: 10px;
  color: var(--warning);
  font-weight: 600;
}

/* 相似度进度条 */
.pdp-vc-bar-track {
  height: 6px;
  background: var(--bg-alt);
  border-radius: var(--radius-xs);
  margin-bottom: 10px;
  overflow: hidden;
}
.pdp-vc-bar-fill {
  height: 100%;
  border-radius: var(--radius-xs);
  transition: width 0.6s ease;
  min-width: 2px;
}

/* 问题列表 */
.pdp-vc-issues {
  margin-top: 6px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.pdp-vc-issues-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--bg-alt);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.pdp-vc-issues-header:hover {
  background: var(--bg-hover);
}

.pdp-vc-issues-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.pdp-vc-issue-count {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--radius-xs);
}
.pdp-vc-issue-count.high {
  color: var(--error);
  background: var(--error-bg);
}
.pdp-vc-issue-count.medium {
  color: var(--warning);
  background: var(--warning-bg);
}
.pdp-vc-issue-count.low {
  color: var(--text-tertiary);
  background: var(--bg-alt);
}

.pdp-vc-issues-toggle {
  font-size: 10px;
  color: var(--text-tertiary);
}

.pdp-vc-issues-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 4px;
}

.pdp-vc-issue-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-xs);
  font-size: 11px;
  line-height: 1.4;
}
.pdp-vc-issue-item:hover {
  background: var(--bg-hover);
}

.pdp-vc-issue-sev {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
  white-space: nowrap;
}
.pdp-vc-issue-sev.high, .pdp-vc-issue-sev[class*="high"] {
  color: var(--error);
  background: var(--error-bg);
}
.pdp-vc-issue-sev.medium {
  color: var(--warning);
  background: var(--warning-bg);
}
.pdp-vc-issue-sev.low {
  color: var(--text-tertiary);
  background: var(--bg-alt);
}

.pdp-vc-issue-desc {
  flex: 1;
  color: var(--text-primary);
  word-break: break-all;
}

.pdp-vc-issue-region {
  font-size: 10px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  background: var(--bg-alt);
  padding: 1px 5px;
  border-radius: var(--radius-xs);
}

.pdp-btn {
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.pdp-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.pdp-btn-primary { background: var(--button-primary-bg); color: var(--button-primary-text); border: 1px solid var(--button-primary-border); box-shadow: var(--button-primary-shadow); }
.pdp-btn-primary:hover:not(:disabled) { background: var(--button-primary-bg-hover); border-color: var(--button-primary-border-hover); box-shadow: var(--button-primary-shadow-hover); }
.pdp-btn-secondary { background: var(--button-secondary-bg); color: var(--button-secondary-text); border: 1px solid var(--button-secondary-border); }
.pdp-btn-secondary:hover:not(:disabled) { background: var(--button-secondary-bg-hover); border-color: var(--button-secondary-border-hover); }
.pdp-btn-warn { background: var(--warning); color: var(--text-on-brand); }
.pdp-btn-warn:hover:not(:disabled) { background: var(--warning-light); }
.pdp-btn-danger { background: var(--button-danger-bg); color: var(--button-danger-text); border: 1px solid var(--button-danger-border); }
.pdp-btn-danger:hover:not(:disabled) { background: var(--button-danger-bg-hover); border-color: var(--button-danger-border-hover); }
.pdp-btn-retry { background: var(--button-primary-bg); color: var(--button-primary-text); }
.pdp-btn-retry:hover:not(:disabled) { background: var(--button-primary-bg-hover); }
.pdp-btn-playground { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #fff; border-color: #1a1a2e; box-shadow: 0 10px 24px rgba(26, 26, 46, 0.18); }
.pdp-btn-playground:hover:not(:disabled) { background: linear-gradient(135deg, #252542 0%, #1e2a4a 100%); border-color: #252542; box-shadow: 0 14px 30px rgba(26, 26, 46, 0.26); }
html[data-theme="dark"] .pdp-btn-playground {
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  color: #0f172a;
  border-color: #f8fafc;
  box-shadow: 0 10px 24px rgba(255, 255, 255, 0.12);
}
html[data-theme="dark"] .pdp-btn-playground:hover:not(:disabled) {
  background: linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%);
  color: #0f172a;
  border-color: #ffffff;
  box-shadow: 0 14px 30px rgba(255, 255, 255, 0.18);
}
.pdp-btn-retry-config { background: var(--warning); color: var(--text-on-brand); }
.pdp-btn-retry-config:hover:not(:disabled) { background: var(--warning-light); }

/* 🆕 重新配置弹窗 */
.pdp-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.pdp-modal {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 440px;
  max-width: 90vw;
  overflow: hidden;
}
.pdp-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-default);
}
.pdp-modal-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}
.pdp-modal-close {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
}
.pdp-modal-close:hover {
  background: var(--bg-alt);
  color: var(--text-primary);
}
.pdp-modal-body {
  padding: 16px 18px;
}
.pdp-modal-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0 0 14px 0;
  line-height: 1.5;
}
.pdp-form-group {
  margin-bottom: 12px;
}
.pdp-form-group label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.pdp-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.pdp-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.15);
}
.pdp-input::placeholder {
  color: var(--text-tertiary);
}
.pdp-retry-error {
  margin-top: 10px;
  padding: 8px 10px;
  background: var(--error-bg);
  border: 1px solid var(--error-border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--error);
}
.pdp-retry-success {
  margin-top: 10px;
  padding: 8px 10px;
  background: var(--success-bg);
  border: 1px solid var(--success-border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--success);
}
  .pdp-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-default);
  background: var(--bg-alt);
}

@media (max-width: 1080px) {
  .pdp-stats-hero {
    grid-template-columns: 1fr;
  }

  .pdp-stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .pdp-tab-content {
    padding-inline: 0;
  }

  .pdp-stats-hero-main {
    padding: 12px;
  }

  .pdp-stats-hero-value {
    font-size: 28px;
  }

  .pdp-stat-emphasis-value,
  .pdp-stat-value {
    font-size: 19px;
  }

  .pdp-stats-grid {
    grid-template-columns: 1fr;
  }

  .pdp-stats-bar-header {
    flex-direction: column;
  }

  .pdp-stats-bar-total {
    white-space: normal;
  }
}
</style>
