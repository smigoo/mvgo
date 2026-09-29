<template>
  <div class="rich-card" :class="[card.type]">
    <!-- 进度卡片 -->
    <template v-if="card.type === 'progress'">
      <div class="card-header">
        <span class="card-icon" :class="{ 'pulse-icon': isRunning }">⚡</span>
        <span class="card-title">生成进度</span>
        <span class="card-status" :class="{ 'pulse-text': isRunning }">
          <template v-if="progressData.status === 'completed'">已完成</template>
          <template v-else-if="progressData.status === 'failed'">失败</template>
          <template v-else-if="progressData.status === 'paused'">已暂停</template>
          <template v-else>进行中 {{ progressData.progress || 0 }}%</template>
        </span>
      </div>
      <div class="progress-bar">
        <div
          class="progress-fill"
          :class="{ 'progress-stripe': isRunning }"
          :style="{ width: (progressData.progress || 0) + '%' }"
        ></div>
      </div>
      <div class="progress-body">
        <!-- 左：进度主体 -->
        <div class="progress-main">
          <!-- 后端真实阶段文案（"看得见在动"的关键） -->
          <div v-if="isRunning && progressData.currentMessage" class="progress-message">
            <span class="msg-spinner"></span>
            <span class="msg-text">{{ progressData.currentMessage }}</span>
          </div>

          <div class="progress-steps" v-if="progressData.steps">
            <div
              v-for="(step, idx) in progressData.steps"
              :key="idx"
              class="step"
              :class="{
                done: idx < progressData.currentStep,
                active: idx === progressData.currentStep,
                pending: idx > progressData.currentStep
              }"
            >
              <span class="step-icon">
                <template v-if="idx < progressData.currentStep">✅</template>
                <template v-else-if="idx === progressData.currentStep && isRunning">🔄</template>
                <template v-else>⏳</template>
              </span>
              <span class="step-label">{{ step }}</span>
            </div>
          </div>

          <!-- 完成后展示产物，否则用户只看到 100% 却"没有结果" -->
          <div v-if="progressData.status === 'completed'" class="progress-result">
            <span class="result-icon">🎉</span>
            <div class="result-info">
              <div class="result-name">{{ progressData.componentName || '组件' }}</div>
              <div class="result-meta">已生成完毕</div>
            </div>
            <a :href="`/tasks/${progressData.sessionId}`" target="_blank" class="result-link">
              查看产物 →
            </a>
          </div>

          <div v-else-if="progressData.status === 'failed'" class="progress-result failed">
            <span class="result-icon">⚠️</span>
            <div class="result-info">
              <div class="result-name">生成失败</div>
              <div class="result-meta">{{ progressData.currentMessage || '请查看任务详情了解原因' }}</div>
            </div>
            <a :href="`/tasks/${progressData.sessionId}`" target="_blank" class="result-link">
              查看详情 →
            </a>
          </div>

          <div class="progress-footer" v-if="progressData.sessionId">
            <div
              class="progress-actions"
              v-if="progressData.status === 'running' || progressData.status === 'paused'"
            >
              <button @click="pauseTask" class="action-btn" :disabled="actionLoading">
                {{ progressData.status === 'paused' ? '恢复' : '暂停' }}
              </button>
              <button @click="cancelTask" class="action-btn danger" :disabled="actionLoading">
                取消生成
              </button>
            </div>
            <a :href="`/tasks/${progressData.sessionId}`" target="_blank" class="detail-link">
              查看任务详情 →
            </a>
          </div>
        </div>

        <!-- 右：来源缩略图（让用户知道"在生成哪张图"） -->
        <div v-if="progressData.imageUrl" class="progress-thumb">
          <img :src="progressData.imageUrl" :alt="progressData.componentName || '来源图'" />
        </div>
      </div>
    </template>

    <!-- 预览卡片 -->
    <template v-else-if="card.type === 'preview'">
      <div class="card-header">
        <span class="card-icon">🖼️</span>
        <span class="card-title">组件预览</span>
      </div>
      <div class="preview-content">
        <img v-if="card.data.imageUrl" :src="card.data.imageUrl" :alt="card.data.componentName" />
        <div v-else class="preview-placeholder">预览图加载中...</div>
      </div>
      <div class="preview-footer">
        <span class="component-name">{{ card.data.componentName }}</span>
        <div class="preview-actions">
          <button class="action-btn">查看详情</button>
          <button class="action-btn primary">采纳</button>
        </div>
      </div>
    </template>

    <!-- 确认卡片 -->
    <template v-else-if="card.type === 'confirm'">
      <div class="card-header">
        <span class="card-icon">📋</span>
        <span class="card-title">{{ card.data.title || '参数确认' }}</span>
      </div>
      <div class="confirm-content">
        <div v-for="(param, idx) in card.data.params" :key="idx" class="param-row">
          <span class="param-key">{{ param.key }}</span>
          <span class="param-value">{{ param.value }}</span>
        </div>
      </div>

      <!-- 可切换：组件类型 / 规格。改这里即改最终执行的参数，不必重发一句话 -->
      <div v-if="isGeneratableConfirm" class="confirm-pickers">
        <div class="picker">
          <span class="picker-label">组件类型</span>
          <div class="picker-options">
            <button
              v-for="opt in targetOptions"
              :key="opt.value"
              class="picker-btn"
              :class="{ active: pickedTarget === opt.value }"
              @click="pickedTarget = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div class="picker">
          <span class="picker-label">规格</span>
          <div class="picker-options">
            <button
              v-for="opt in tierOptions"
              :key="opt.value"
              class="picker-btn"
              :class="{ active: pickedTier === opt.value }"
              @click="pickedTier = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <p v-if="tierNote" class="picker-note">{{ tierNote }}</p>
      </div>

      <div class="confirm-actions">
        <button class="confirm-btn cancel" @click="onCancel">取消</button>
        <button class="confirm-btn ok" @click="onConfirm">按以上设置生成</button>
      </div>
    </template>

    <!-- 统计卡片 -->
    <template v-else-if="card.type === 'stats'">
      <div class="card-header">
        <span class="card-icon">📊</span>
        <span class="card-title">{{ card.data.title || '统计数据' }}</span>
      </div>
      <div class="stats-grid">
        <div v-for="(metric, idx) in card.data.metrics" :key="idx" class="stat-item">
          <div class="stat-value">{{ metric.value }}</div>
          <div class="stat-label">{{ metric.label }}</div>
        </div>
      </div>
    </template>

    <!-- 列表卡片 -->
    <template v-else-if="card.type === 'list'">
      <div class="card-header">
        <span class="card-icon">📦</span>
        <span class="card-title">{{ card.data.title || '列表' }}</span>
      </div>
      <div class="list-content">
        <div v-for="(item, idx) in card.data.items" :key="idx" class="list-item">
          <div class="item-icon">{{ item.icon || '📄' }}</div>
          <div class="item-info">
            <div class="item-name">{{ item.name }}</div>
            <div class="item-meta">{{ item.meta }}</div>
          </div>
        </div>
      </div>
    </template>

    <!-- 操作卡片 -->
    <template v-else-if="card.type === 'action'">
      <div class="card-header">
        <span class="card-icon">🚀</span>
        <span class="card-title">{{ card.data.title || '可用操作' }}</span>
      </div>
      <div class="action-content">
        <div v-if="card.data.message" class="action-message">{{ card.data.message }}</div>
        <div class="action-buttons">
          <button
            v-for="(action, idx) in card.data.actions"
            :key="idx"
            class="action-btn"
            :class="{ primary: action.primary }"
          >
            {{ action.label }}
          </button>
        </div>
      </div>
    </template>

    <!-- 代码变更卡片 -->
    <template v-else-if="card.type === 'diff'">
      <div class="card-header">
        <span class="card-icon">📝</span>
        <span class="card-title">代码变更</span>
        <span class="diff-stats">
          <span class="additions">+{{ card.data.summary?.additions || 0 }}</span>
          <span class="deletions">-{{ card.data.summary?.deletions || 0 }}</span>
        </span>
      </div>
      <div class="diff-content">
        <div v-for="(change, idx) in card.data.changes" :key="idx" class="diff-file">
          <div class="file-name">{{ change.file }}</div>
          <pre class="diff-code">{{ change.diff }}</pre>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import http from '@/core/http'

const props = defineProps({
  card: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['confirm', 'cancel'])

// 进度卡片轮询逻辑
const progressData = ref({ ...props.card.data })
const pollingTimer = ref(null)
const isPolling = ref(false)
const actionLoading = ref(false)

// 是否运行中（用于控制动画）
const isRunning = computed(() => {
  const s = progressData.value.status
  return s !== 'completed' && s !== 'failed' && s !== 'cancelled'
})

/**
 * 后端 stage（英文 key）→ 卡片步骤索引。
 *
 * 实测收集到的 stage（Lite 管线）：precheck / analyzing / vision-agent / generating；
 * Phase2 管线另有 figma-* / codegen 等。此前前端用 `stage.includes(中文步骤名)` 匹配，
 * 英文 key 永远匹配不上 ⇒ 恒为索引 0 ⇒ 进度条 0%、步骤全 ⏳，用户以为没在跑。
 */
// 后端真实 stage（Lite 管线实测）：precheck / analyzing / vision-agent / generating
// Phase2 管线另有 figma-* / codegen / gate 等。
//
// ⚠️ 用**显式数值映射**而非关键词匹配：关键词会错配——例如 precheck 的关键词含"校验"，
// 会被匹配到靠后的「质量校验」(索引3)，导致进度条开场就跳到 66%。
const STAGE_STEP_INDEX_5 = {
  precheck: 0,
  'figma-fetch': 0,
  'figma-parse': 0,
  analyzing: 0,
  analysis: 0,
  'vision-agent': 0,
  vision: 0,
  layout: 1,
  generating: 2,
  codegen: 2,
  generate: 2,
  quality: 3,
  gate: 3,
  snapshot: 4,
  persist: 4
}

// 4 步版（旧默认步骤名）：解析 → 视觉分析 → 代码生成 → 质量门禁
const STAGE_STEP_INDEX_4 = {
  precheck: 0,
  'figma-fetch': 0,
  'figma-parse': 0,
  analyzing: 1,
  analysis: 1,
  'vision-agent': 1,
  vision: 1,
  layout: 1,
  generating: 2,
  codegen: 2,
  generate: 2,
  quality: 3,
  gate: 3,
  snapshot: 3,
  persist: 3
}

function mapStageToStepIndex(stage, stepNames, completedStages = []) {
  if (!stage) return 0
  const key = String(stage).toLowerCase()
  const table = stepNames.length >= 5 ? STAGE_STEP_INDEX_5 : STAGE_STEP_INDEX_4

  // 1) 显式映射命中
  if (Object.prototype.hasOwnProperty.call(table, key)) {
    return Math.min(table[key], stepNames.length - 1)
  }

  // 2) 未登记的 stage：按已完成 stage 数线性推进，保证进度条会动
  const seen = new Set(completedStages)
  if (!seen.has(stage)) seen.add(stage)
  return Math.min(Math.max(seen.size - 1, 0), stepNames.length - 1)
}

// 暂停/恢复任务
async function pauseTask() {
  const sessionId = progressData.value.sessionId
  if (!sessionId || actionLoading.value) return
  actionLoading.value = true
  try {
    const isPaused = progressData.value.status === 'paused'
    const action = isPaused ? 'resume' : 'pause'
    // 🛡️ 2026-09-29：改用统一 http 客户端（自动注入 Token 头）。
    // 原生 fetch 不带 Token → SessionGuard 401（生产 mc-max-1790692008530 取消/暂停 401 实锤）。
    await http.post(`/api/tasks/${action}/${sessionId}`)
    // 立即刷新一次进度
    await fetchTaskProgress()
  } catch (error) {
    console.error('暂停/恢复操作出错:', error)
  } finally {
    actionLoading.value = false
  }
}

// 取消任务：交给父组件弹二次确认（不用原生 confirm），确认后回调 doCancelTask
function cancelTask() {
  const sessionId = progressData.value.sessionId
  if (!sessionId || actionLoading.value) return
  emit('cancel', {
    ...progressData.value,
    __confirmCancel: true,
    cancelTitle: progressData.value.componentName || '该生成任务',
    onConfirmed: () => doCancelTask(sessionId)
  })
}

async function doCancelTask(sessionId) {
  if (actionLoading.value) return
  actionLoading.value = true
  try {
    // 🛡️ 2026-09-29：同上，原生 fetch 不带 Token → 401，改用统一 http 客户端
    await http.post(`/api/tasks/cancel/${sessionId}`)
    await fetchTaskProgress()
    stopPolling()
  } catch (error) {
    console.error('取消操作出错:', error)
  } finally {
    actionLoading.value = false
  }
}

// 监听 card.data 变化，同步到 progressData
// ⚠️ 必须合并而非替换：fetchTaskProgress 设置的 currentStep/status/progress/currentMessage
// 会被父组件更新 card.data 时的 { ...newData } 覆盖掉（newData 不含这些字段），
// 导致"任务已完成但步骤只高亮第一个"的 bug。
watch(
  () => props.card.data,
  (newData) => {
    progressData.value = { ...progressData.value, ...newData }
  },
  { deep: true }
)

// 获取任务进度
async function fetchTaskProgress() {
  const sessionId = progressData.value.sessionId
  if (!sessionId) return

  try {
    // 🛡️ 2026-09-29：同上，改用统一 http 客户端（自动注入 Token）
    const res = await http.get(`/api/tasks/status/${sessionId}`)
    // 后端返回 { data: { task } }，兼容直接的 { task }
    const task = res?.data?.task || res?.task
    if (!task) return

    // 从 progress 数组中提取阶段
    const progressSteps = task.progress || []
    const runningStep = progressSteps.find((p) => p.type === 'progress' && p.status === 'running')
    const completedStages = progressSteps
      .filter((p) => p.type === 'progress' && p.status === 'completed' && p.stage)
      .map((p) => p.stage)

    // 卡片步骤（中文）
    const stepNames = progressData.value.steps || [
      '视觉分析',
      '布局解析',
      '代码生成',
      '质量校验'
    ]

    // 后端 stage 是英文 key，与中文步骤名无法直接字符串匹配，必须走映射表
    let currentStepIndex = 0
    if (runningStep) {
      currentStepIndex = mapStageToStepIndex(runningStep.stage, stepNames, completedStages)
    } else if (task.status === 'completed') {
      currentStepIndex = stepNames.length
    } else {
      // 无 running 片段时用已完成 stage 推进，避免长时间停在 0
      const lastStage = completedStages[completedStages.length - 1]
      currentStepIndex = lastStage
        ? mapStageToStepIndex(lastStage, stepNames, completedStages) + 1
        : 0
    }
    currentStepIndex = Math.min(currentStepIndex, stepNames.length)

    // 进度百分比（阶段内平滑推进 + 单调不回退）
    const totalSteps = stepNames.length
    let progressPercent
    if (task.status === 'completed') {
      progressPercent = 100
    } else if (task.status === 'failed') {
      progressPercent = progressData.value.progress || 0
    } else {
      const within =
        runningStep && runningStep.stage
          ? Math.min(
              0.9,
              progressSteps.filter((p) => p.stage === runningStep.stage).length * 0.15
            )
          : 0
      progressPercent = Math.round(Math.min(((currentStepIndex + within) / totalSteps) * 100, 99))
      progressPercent = Math.max(progressPercent, progressData.value.progress || 0)
    }

    // 当前阶段文案：优先 running.message，否则最后一条 log
    let currentMessage = ''
    if (task.status !== 'completed' && task.status !== 'failed') {
      currentMessage = runningStep?.message || ''
      if (!currentMessage) {
        const lastLog = [...progressSteps].reverse().find((p) => p.type === 'log' && p.message)
        currentMessage = lastLog?.message || ''
      }
    }

    // 更新进度数据
    progressData.value = {
      ...progressData.value,
      progress: progressPercent,
      currentStep: currentStepIndex,
      status: task.status,
      currentMessage
    }

    // 如果任务完成或失败，停止轮询
    if (task.status === 'completed' || task.status === 'failed') {
      stopPolling()
    }
  } catch (error) {
    console.error('轮询任务进度出错:', error)
  }
}

// 启动轮询
function startPolling() {
  if (isPolling.value || pollingTimer.value) return

  isPolling.value = true
  // 立即执行一次
  fetchTaskProgress()
  // 每 1.5 秒轮询一次（原 3s 太慢，用户会觉得"卡住没在动"）
  pollingTimer.value = setInterval(fetchTaskProgress, 1500)
}

// 停止轮询
function stopPolling() {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value)
    pollingTimer.value = null
  }
  isPolling.value = false
}

// 组件挂载时启动轮询（仅进度卡片）
onMounted(() => {
  if (props.card.type === 'progress' && progressData.value.sessionId) {
    startPolling()
  }
})

// 组件卸载时清理定时器
onUnmounted(() => {
  stopPolling()
})

/**
 * 确认卡上的「组件类型 / 规格」可切换选择器。
 *
 * 背景：用户要求「vue3 却被告知是微码」「截图无法生成 max」——
 * 此前这两个参数只能靠在对话里打字指定，识别不到就沿用默认（microcode + max），
 * 且卡片上没有任何可改的入口。现在直接在卡片上切换，确认时写回 pendingToolCall。
 */
const targetOptions = [
  { value: 'microcode', label: '微码组件' },
  { value: 'vue3', label: 'Vue3 组件' }
]

const pendingCall = computed(() => props.card.data?.pendingToolCall)

// 截图来源只支持 Lite
const isScreenshot = computed(
  () => pendingCall.value?.name === 'create_component_from_screenshot'
)

const tierOptions = computed(() => {
  // 截图来源只支持 Lite，Max 选项直接隐藏（避免用户选了却被回退）
  if (isScreenshot.value) {
    return [{ value: 'lite', label: 'Lite 轻量' }]
  }
  return [
    { value: 'lite', label: 'Lite 轻量' },
    { value: 'max', label: 'Max 完整' }
  ]
})

// 仅对支持 target/tier 的生成类工具展示选择器
const isGeneratableConfirm = computed(() => {
  const n = pendingCall.value?.name
  return n === 'create_component_from_screenshot' || n === 'create_component_from_figma'
})

// 初始值取自 pendingToolCall，用户可在卡片上改
const pickedTarget = ref(pendingCall.value?.arguments?.target || 'microcode')
// 截图来源强制 lite（Max 选项已隐藏，初始值也要对齐）
const pickedTier = ref(
  isScreenshot.value
    ? 'lite'
    : (pendingCall.value?.arguments?.tier || 'max')
)

// 截图下 max 选项已隐藏，不再需要 tierNote 提示
const tierNote = computed(() => '')

function onConfirm() {
  const data = { ...props.card.data }

  // 把用户在卡片上的选择写回待执行参数
  if (isGeneratableConfirm.value && data.pendingToolCall) {
    data.pendingToolCall = {
      ...data.pendingToolCall,
      arguments: {
        ...data.pendingToolCall.arguments,
        target: pickedTarget.value,
        tier: pickedTier.value
      }
    }
  }

  emit('confirm', data)
}

function onCancel() {
  emit('cancel', props.card.data)
}
</script>

<style scoped lang="less">
/*
 * 卡片色板集中为变量，浅色为默认值。
 * 深色下用户反馈「文字看不见」——根因是这里大量硬编码浅底深字（#fafafa/#e8e8e8/#262626），
 * 容器变深后文字与背景糊成一片。故补 prefers-color-scheme: dark 分支整体反色。
 */
.rich-card {
  --rc-bg: #fafafa;
  --rc-border: #e8e8e8;
  --rc-text: #262626;
  --rc-text-muted: #8c8c8c;
  --rc-surface: #fff;
  --rc-track: #f0f0f0;
  --rc-bar: #52c41a;
  --rc-accent: #1890ff;
  --rc-danger: #ff4d4f;
  --rc-success-bg: #f6ffed;
  --rc-info-bg: #e6f7ff;
  background: var(--rc-bg);
  border: 1px solid var(--rc-border);
  border-radius: 8px;
  padding: 16px;

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;

    .card-icon {
      font-size: 18px;
    }

    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--rc-text);
      flex: 1;
    }

    .card-status {
      font-size: 12px;
      color: var(--rc-text-muted);
    }

    .diff-stats {
      display: flex;
      gap: 8px;
      font-size: 12px;

      .additions {
        color: #52c41a;
      }

      .deletions {
        color: var(--rc-danger);
      }
    }
  }
}

// 进度卡片
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

@keyframes stripe-move {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: 40px 0;
  }
}

.pulse-icon {
  animation: pulse 1.5s ease-in-out infinite;
}

.pulse-text {
  animation: pulse 1.5s ease-in-out infinite;
  color: #1890ff;
}

// 进度主体：左信息 + 右缩略图
.progress-body {
  display: flex;
  gap: 12px;
  align-items: flex-start;

  .progress-main {
    flex: 1;
    min-width: 0;
  }

  .progress-thumb {
    width: 84px;
    height: 84px;
    flex-shrink: 0;
    border: 1px solid var(--rc-border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--rc-surface);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }
}

// 当前阶段真实文案 + 转圈（让用户明确看到"在动"）
.progress-message {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 12px;
  color: #1890ff;
  line-height: 1.5;

  .msg-text {
    min-width: 0;
    word-break: break-word;
  }

  .msg-spinner {
    width: 11px;
    height: 11px;
    flex-shrink: 0;
    border: 2px solid rgba(24, 144, 255, 0.25);
    border-top-color: #1890ff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.progress-bar {
  height: 6px;
  background: var(--rc-track);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 12px;

  .progress-fill {
    height: 100%;
    background: var(--rc-accent);
    border-radius: 3px;
    transition: width 0.5s ease;

    &.progress-stripe {
      background-image: linear-gradient(
        45deg,
        rgba(255, 255, 255, 0.15) 25%,
        transparent 25%,
        transparent 50%,
        rgba(255, 255, 255, 0.15) 50%,
        rgba(255, 255, 255, 0.15) 75%,
        transparent 75%,
        transparent
      );
      background-size: 40px 40px;
      animation: stripe-move 1s linear infinite;
    }
  }
}
.progress-steps {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;

  .step {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--rc-bg);
    border: 1px solid var(--rc-border);
    border-radius: 12px;
    font-size: 12px;
    color: var(--rc-text-muted);
    transition: all 0.3s ease;

    .step-icon {
      font-size: 12px;
      line-height: 1;
    }

    .step-label {
      white-space: nowrap;
    }

    &.done {
      background: var(--rc-success-bg);
      border-color: #b7eb8f;
      color: #52c41a;
    }

    &.active {
      background: var(--rc-info-bg);
      border-color: #91d5ff;
      color: #1890ff;
      font-weight: 500;
    }

    &.pending {
      opacity: 0.6;
    }
  }
}

// 完成态产物区（否则用户只看到 100% 却"没有结果"）
.progress-result {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--rc-success-bg);

  .result-icon {
    font-size: 20px;
  }

  .result-info {
    flex: 1;
    min-width: 0;

    .result-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--rc-text);
      word-break: break-all;
    }

    .result-meta {
      font-size: 11px;
      color: var(--rc-text-muted);
      margin-top: 2px;
    }
  }

  .result-link {
    font-size: 12px;
    color: var(--rc-accent);
    text-decoration: none;
    flex-shrink: 0;

    &:hover {
      text-decoration: underline;
    }
  }

  &.failed {
    background: rgba(255, 77, 79, 0.08);
  }
}

.progress-footer {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;

  /* 按钮组：加 gap 避免"暂停/取消生成"挤在一起 */
  .progress-actions {
    display: flex;
    align-items: center;
    gap: 10px;

    .action-btn {
      padding: 7px 16px;
      line-height: 1.4;
      white-space: nowrap;
    }

    /* 危险操作与常规操作之间再拉开一点，降低误触 */
    .action-btn.danger {
      margin-left: 2px;
    }
  }

  .detail-link {
    font-size: 12px;
    color: #1890ff;
    text-decoration: none;
    cursor: pointer;
    transition: color 0.2s;

    &:hover {
      color: #40a9ff;
      text-decoration: underline;
    }
  }
}

// 预览卡片
.preview-content {
  margin-bottom: 12px;
  border-radius: 6px;
  overflow: hidden;
  background: white;

  img {
    width: 100%;
    display: block;
  }

  .preview-placeholder {
    padding: 40px;
    text-align: center;
    color: var(--rc-text-muted);
    font-size: 13px;
  }
}

.preview-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .component-name {
    font-size: 13px;
    color: var(--rc-text-muted);
  }

  .preview-actions {
    display: flex;
    gap: 8px;
  }
}

// 确认卡片
.confirm-content {
  margin-bottom: 16px;

  .param-row {
    display: flex;
    padding: 8px 0;
    border-bottom: 1px solid var(--rc-track);

    &:last-child {
      border-bottom: none;
    }

    .param-key {
      width: 120px;
      color: var(--rc-text-muted);
      font-size: 13px;
    }

    .param-value {
      flex: 1;
      color: var(--rc-text);
      font-size: 13px;
    }
  }
}

.confirm-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;

  .confirm-btn {
    padding: 6px 16px;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    border: 1px solid var(--rc-border);
    background: white;
    transition: all 0.2s;

    &.cancel {
      &:hover {
        border-color: var(--rc-danger);
        color: var(--rc-danger);
      }
    }

    &.ok {
      background: var(--rc-accent);
      border-color: #1890ff;
      color: white;

      &:hover {
        background: var(--rc-accent);
        border-color: #40a9ff;
      }
    }
  }
}

// 统计卡片
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;

  .stat-item {
    background: white;
    padding: 16px;
    border-radius: 6px;
    text-align: center;

    .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: #1890ff;
      margin-bottom: 4px;
    }

    .stat-label {
      font-size: 12px;
      color: var(--rc-text-muted);
    }
  }
}

// 列表卡片
.list-content {
  .list-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    background: white;
    border-radius: 6px;
    margin-bottom: 8px;

    &:last-child {
      margin-bottom: 0;
    }

    .item-icon {
      font-size: 24px;
    }

    .item-info {
      flex: 1;

      .item-name {
        font-size: 14px;
        color: var(--rc-text);
        margin-bottom: 2px;
      }

      .item-meta {
        font-size: 12px;
        color: var(--rc-text-muted);
      }
    }
  }
}

// 操作卡片
.action-content {
  .action-message {
    margin-bottom: 12px;
    font-size: 13px;
    color: var(--rc-text-muted);
  }

  .action-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
}

// 代码变更卡片
.diff-content {
  .diff-file {
    margin-bottom: 12px;

    &:last-child {
      margin-bottom: 0;
    }

    .file-name {
      font-size: 13px;
      color: var(--rc-text-muted);
      margin-bottom: 8px;
      font-weight: 600;
    }

    .diff-code {
      background: white;
      padding: 12px;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.6;
      overflow-x: auto;
      margin: 0;
      font-family: 'Courier New', monospace;
    }
  }
}

// 通用按钮样式
.action-btn {
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid var(--rc-border);
  background: white;
  color: var(--rc-text-muted);
  transition: all 0.2s;

  &:hover {
    border-color: #1890ff;
    color: #1890ff;
  }

  &.primary {
    background: var(--rc-accent);
    border-color: #1890ff;
    color: white;

    &:hover {
      background: var(--rc-accent);
      border-color: #40a9ff;
    }
  }

  /* 危险操作：红字红框，与「暂停」明确区分，避免误触 */
  &.danger {
    color: var(--rc-danger);

    &:hover {
      border-color: var(--rc-danger);
      color: var(--rc-danger);
      background: rgba(255, 77, 79, 0.06);
    }
  }
}

/* 确认卡上的「组件类型 / 规格」选择器 */
.confirm-pickers {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--rc-border);
  display: flex;
  flex-direction: column;
  gap: 10px;

  .picker {
    display: flex;
    align-items: center;
    gap: 10px;

    .picker-label {
      font-size: 12px;
      color: var(--rc-text-muted);
      width: 56px;
      flex-shrink: 0;
    }

    .picker-options {
      display: flex;
      gap: 6px;
    }

    .picker-btn {
      padding: 5px 12px;
      font-size: 12px;
      border-radius: 999px;
      border: 1px solid var(--rc-border);
      background: var(--rc-surface);
      color: var(--rc-text);
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        border-color: var(--rc-accent);
        color: var(--rc-accent);
      }

      &.active {
        background: var(--rc-accent);
        border-color: var(--rc-accent);
        color: #fff;
        font-weight: 500;
      }
    }
  }

  .picker-note {
    margin: 0;
    font-size: 11px;
    line-height: 1.6;
    color: #d46b08;
  }
}

</style>

<!-- 深色模式样式必须放在非 scoped 的 style 块中
     原因：scoped 会给选择器添加 [data-v-xxx] 属性，
     html[data-theme='dark'] 会被编译成 html[data-theme='dark'][data-v-xxx]，
     但 <html> 元素不会有 scoped 属性，导致深色模式样式永远无法匹配 -->
<style lang="less">
html[data-theme='dark'] {
  .rich-card {
    --rc-bg: #1f1f1f;
    --rc-border: #3a3a3a;
    --rc-text: #e8e8e8;
    --rc-text-muted: #a0a0a0;
    --rc-surface: #2a2a2a;
    --rc-track: #3a3a3a;
    --rc-bar: #52c41a;
    --rc-accent: #3aa0ff;
    --rc-danger: #ff7875;
    --rc-success-bg: #173a1e;
    --rc-info-bg: #123146;
  }

  .rich-card .action-btn,
  .rich-card .confirm-btn.cancel,
  .rich-card .picker-btn {
    background: #2a2a2a;
    color: #e8e8e8;
  }

  .rich-card .action-btn.danger:hover {
    background: rgba(255, 120, 117, 0.12);
  }

  .rich-card .progress-steps .step.pending .step-label {
    color: #9a9a9a;
  }

  .rich-card .progress-message {
    color: #6cb6ff;

    .msg-spinner {
      border-color: rgba(108, 182, 255, 0.25);
      border-top-color: #6cb6ff;
    }
  }

  .rich-card .picker-note {
    color: #ffc069;
  }
}
</style>
