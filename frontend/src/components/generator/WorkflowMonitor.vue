<template>
  <!-- 浮动监控入口（支持拖拽移动） -->
  <div
    ref="fabRef"
    class="wm-fab"
    :class="{
      dragging: isDragging,
      'has-active': runningCount + queuedCount + pausedCount > 0,
      'panel-open': panelExpanded,
      'panel-right': isPanelOnRight,
    }"
    :style="fabStyle"
    @click="onFabClick"
    @mousedown.prevent="onFabMouseDown"
    @touchstart.prevent="onFabTouchStart"
    title="任务监控（按住拖拽可移动位置）"
  >
    <!-- 空闲态：小图标 + 文字 -->
    <div v-if="totalCount === 0" class="wm-fab-idle">
      <svg class="wm-fab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <span class="wm-fab-label">监控</span>
    </div>

    <!-- 有任务态：大数字 + 彩色点 -->
    <div v-else class="wm-fab-stats">
      <!-- 顶部并发槽位占用：运行数（容量信息见面板顶部 chip，避免与「任务数」混淆）-->
      <div
        class="wm-fab-total"
        :class="[totalClass, { 'slots-full': slotsFull }]"
        :title="slotsFull ? `并发已满（${runningCount}/${maxConcurrent}），${queuedCount} 个任务排队中` : `${runningCount} 个任务正在运行（并发上限 ${maxConcurrent}）`"
      >
        <span class="wm-fab-total-num">{{ runningCount }}</span>
        <span class="wm-fab-total-label">运行</span>
      </div>

      <!-- 分隔线 -->
      <div class="wm-fab-divider"></div>

      <!-- 各状态色点（running 已在顶部体现，此处不重复）-->
      <div v-if="queuedCount > 0" class="wm-fab-stat-row" :title="`${queuedCount} 个任务排队中`">
        <span class="wm-fab-dot queued"></span>
        <span class="wm-fab-stat-num">{{ queuedCount }}</span>
      </div>
      <div v-if="pausedCount > 0" class="wm-fab-stat-row" :title="`${pausedCount} 个任务已暂停`">
        <span class="wm-fab-dot paused"></span>
        <span class="wm-fab-stat-num">{{ pausedCount }}</span>
      </div>
      <div v-if="failedCount > 0" class="wm-fab-stat-row">
        <span class="wm-fab-dot failed"></span>
        <span class="wm-fab-stat-num">{{ failedCount }}</span>
      </div>
    </div>

    <!-- 展开箭头 -->
    <span class="wm-fab-arrow" :class="{ expanded: panelExpanded }">›</span>

    <!-- 面板作为 FAB 子元素，用 CSS absolute 定位永远紧贴 FAB -->
    <transition name="wm-pop">
      <div v-if="panelExpanded" class="wm-panel" @click.stop>
        <!-- 面板头部 -->
        <div class="wm-panel-header">
          <div class="wm-panel-title">
            <span>任务监控</span>
            <div class="wm-header-chips">
              <span v-if="runningCount > 0" class="wm-chip running">{{ runningCount }}/{{ maxConcurrent }} 运行</span>
              <span
                v-if="queuedCount > 0"
                class="wm-chip queued"
                :title="slotsFull ? '并发槽位已满，等待运行中的任务结束后自动开始' : '槽位空闲，数秒内自动调度'"
              >{{ queuedCount }} 排队</span>
              <span v-if="pausedCount > 0" class="wm-chip paused">{{ pausedCount }} 暂停</span>
            </div>
          </div>
          <button class="wm-panel-close icon-btn" aria-label="关闭面板" data-tooltip="关闭面板" @click="panelExpanded = false">✕</button>
        </div>

        <!-- 活跃任务列表 -->
        <div class="wm-panel-body">
          <div v-if="activeTasks.length === 0" class="wm-panel-empty">
            <span class="wm-empty-icon">✓</span>
            <span>当前无活跃任务</span>
          </div>

          <template v-else>
            <div
              v-for="task in activeTasks"
              :key="task.sessionId"
              class="wm-task-card"
              :class="[task.status, { expanded: selectedTaskId === task.sessionId }]"
            >
              <!-- 任务摘要行 -->
              <div class="wm-task-summary" @click="toggleTaskDetail(task)">
                <div class="wm-task-dot" :class="task.status"></div>
                <div class="wm-task-info">
                  <div class="wm-task-name-row">
                    <span class="wm-task-name">{{ getTaskDisplayName(task) }}</span>
                    <span class="wm-task-type" :class="getTaskTypeClass(task)">{{ getTaskTypeLabel(task) }}</span>
                    <span v-if="getTaskTier(task)" class="wm-task-type wm-task-tier" :class="getTaskTier(task)">{{ getTaskTier(task) === 'lite' ? 'Lite' : 'Max' }}</span>
                    <span v-if="getTaskSource(task)" class="wm-task-type wm-task-source" :class="getTaskSource(task)">{{ getTaskSource(task) === 'screenshot' ? '截图' : 'Figma' }}</span>
                  </div>
                  <!-- 运行中：当前阶段 -->
                  <div v-if="task.status === 'running'" class="wm-task-stage">
                    <template v-if="getCurrentStage(task)">
                      <span class="wm-stage-step">{{ getCurrentStage(task).step }}/{{ getCurrentStage(task).total }}</span>
                      <span class="wm-stage-name">{{ getCurrentStage(task).stage }}</span>
                      <span class="wm-stage-msg">{{ getCurrentStage(task).message }}</span>
                    </template>
                    <span v-else class="wm-stage-msg">等待启动...</span>
                  </div>
                  <!-- 暂停 -->
                  <div v-else-if="task.status === 'paused'" class="wm-task-paused">
                    ⏸ 已暂停
                  </div>
                  <!-- 排队等待 -->
                  <div v-else-if="task.status === 'queued' || task.status === 'rate_limited' || task.status === 'retry_scheduled'" class="wm-task-queued">
                    ⏳ {{ getQueuedLabel(task) }}
                  </div>
                </div>
                <div class="wm-task-right">
                  <span class="wm-task-duration">{{ formatDuration(task) }}</span>
                  <span class="wm-task-chevron" :class="{ rotated: selectedTaskId === task.sessionId }">›</span>
                </div>
              </div>

              <!-- 展开详情：紧凑摘要 -->
              <transition name="wm-detail">
                <div v-if="selectedTaskId === task.sessionId" class="wm-task-detail">
                  <!-- 阶段进度条 -->
                  <div class="wm-detail-stages">
                    <div
                      v-for="(stage, idx) in taskPipelineStages(task)"
                      :key="idx"
                      class="wm-detail-stage"
                      :class="stage.cls"
                    >
                      <div class="wm-detail-stage-dot"></div>
                      <div class="wm-detail-stage-info">
                        <span class="wm-detail-stage-name">{{ stage.name }}</span>
                        <span v-if="stage.sub" class="wm-detail-stage-sub">{{ stage.sub }}</span>
                      </div>
                      <span v-if="stage.time" class="wm-detail-stage-time">{{ stage.time }}</span>
                    </div>
                  </div>
                  <!-- 操作按钮 -->
                  <div class="wm-detail-actions">
                    <button v-if="task.status === 'running'" class="wm-detail-btn" @click="pauseTaskHandler(task)">暂停</button>
                    <button v-if="task.status === 'queued' || task.status === 'rate_limited' || task.status === 'retry_scheduled'" class="wm-detail-btn primary" @click="startQueuedTaskHandler(task)">开始</button>
                    <button v-if="task.status === 'queued' || task.status === 'rate_limited' || task.status === 'retry_scheduled'" class="wm-detail-btn danger" @click="deleteTaskHandler(task)">删除</button>
                    <button v-if="task.status === 'running' || task.status === 'paused'" class="wm-detail-btn danger" @click="cancelTaskHandler(task)">终止</button>
                    <button v-if="task.status !== 'queued' && task.status !== 'rate_limited' && task.status !== 'retry_scheduled'" class="wm-detail-btn primary" @click="handleNavigate(task)">跳转</button>
                  </div>
                </div>
              </transition>
            </div>
          </template>
        </div>

        <!-- 面板底部 -->
        <div class="wm-panel-footer">
          <button class="wm-footer-link" @click="goToTaskCenter">
            查看全部任务 →
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  fetchAllTasks, deleteTask,
  pauseTask, resumeTask, cancelTask, startQueuedTask,
  generateComponent, generateVue3Component,
  getQueueStats, retryTask,
} from '@/api/generator/generator'
import { getComponentBySessionId, getRouteUrl } from '@/api/component'
import { downloadByUrl } from '@/utils/download-file'
import { useConfigStore } from '@/stores/config'
import ProgressDetailPanel from './ProgressDetailPanel.vue'

const router = useRouter()
const configStore = useConfigStore()
const baseURL = import.meta.env.VITE_LANGGRAPH_API || 'http://localhost:3000/api'

// ── 状态 ──
const fabRef = ref<HTMLElement | null>(null)
const panelExpanded = ref(false)
const tasks = ref<any[]>([])
const selectedTaskId = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null

// ── FAB 几何常量（避免魔数散落各处） ──
const FAB_WIDTH = 56 // 与 CSS .wm-fab width 一致
const FAB_DEFAULT_TOP = 76 // = 64(header) + 12(margin)，与 CSS top calc 一致
const EDGE_MARGIN = 20 // 贴边距

// 初始贴右：在 mount 时把"right: EDGE_MARGIN"翻译成 left 像素。
// fabStyle 完全用 left/top 表达，避免 right/left 反复切换造成的 px 漂移。
function getInitialRightAnchor() {
  return Math.max(EDGE_MARGIN, window.innerWidth - FAB_WIDTH - EDGE_MARGIN)
}

// ── 拖拽 ──
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const fabStartLeft = ref(0)
const fabStartTop = ref(0)
const dragDistance = ref(0)

// 初始位置：直接给一个默认值，避免 mount 前 fab 渲染到左上角（CSS 只剩 top）。
// mount 时 initFabPosition 会再次按 window.innerWidth 计算一次精确值（处理 SSR/已存在 DOM 的边缘）。
const initialRightAnchor = (typeof window !== 'undefined')
  ? Math.max(EDGE_MARGIN, window.innerWidth - FAB_WIDTH - EDGE_MARGIN)
  : 0
const fabStyle = ref<Record<string, string>>({
  left: `${initialRightAnchor}px`,
  top: `${FAB_DEFAULT_TOP}px`,
})

// 标记用户是否实际拖动过 FAB（决定 resize 时是否回贴右）。
// fabLeft 始终有值（mount 时已初始化），不能用 null 判断。
const userHasDragged = ref(false)

// FAB 实时位置（拖拽中用 ref 追踪）
const fabLeft = ref<number | null>(initialRightAnchor)
const fabTop = ref<number | null>(FAB_DEFAULT_TOP)

// 面板方向：FAB 在左半屏时面板在右侧。
// 优先读 fabRef 的真实 DOM 几何（响应式 + 跟 has-active/box-sizing 同步）。
const isPanelOnRight = computed(() => {
  const el = fabRef.value
  if (!el) return false
  const rect = el.getBoundingClientRect()
  return rect.left + rect.width / 2 < window.innerWidth / 2
})

// 区分 click 与拖拽：超过 5px 视为拖拽
const DRAG_THRESHOLD = 5

function onFabClick() {
  if (dragDistance.value >= DRAG_THRESHOLD) return
  togglePanel()
}

function onFabMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  beginDrag(e.clientX, e.clientY)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onFabTouchStart(e: TouchEvent) {
  const touch = e.touches[0]
  if (!touch) return
  beginDrag(touch.clientX, touch.clientY)
  document.addEventListener('touchmove', onTouchMove, { passive: false })
  document.addEventListener('touchend', onTouchEnd)
}

function beginDrag(cx: number, cy: number) {
  const el = fabRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  dragStartX.value = cx
  dragStartY.value = cy
  fabStartLeft.value = rect.left
  fabStartTop.value = rect.top
  dragDistance.value = 0
  isDragging.value = true
  // 只同步 fabLeft/fabTop 状态，不修改 fabStyle；
  // fabStyle 仍是上一次 endDrag 留下的 left/top，DOM 位置不变
  fabLeft.value = rect.left
  fabTop.value = rect.top
}

function onMouseMove(e: MouseEvent) {
  applyDrag(e.clientX, e.clientY)
}

function onTouchMove(e: TouchEvent) {
  const touch = e.touches[0]
  if (touch) { applyDrag(touch.clientX, touch.clientY); e.preventDefault() }
}

function applyDrag(cx: number, cy: number) {
  if (!isDragging.value) return
  const dx = cx - dragStartX.value
  const dy = cy - dragStartY.value
  // 用欧氏距离而不是 Manhattan：斜向小抖动（dx=3, dy=3 → 合计 6）不该越过 5px 阈值。
  dragDistance.value = Math.hypot(dx, dy)
  if (dragDistance.value < DRAG_THRESHOLD) return
  const el = fabRef.value
  const width = el?.offsetWidth ?? FAB_WIDTH
  const height = el?.offsetHeight ?? 80
  let left = fabStartLeft.value + dx
  let top  = fabStartTop.value + dy
  // 限制不超出可视区域
  left = Math.max(0, Math.min(left, window.innerWidth - width))
  top  = Math.max(0, Math.min(top,  window.innerHeight - height))
  fabLeft.value = left
  fabTop.value = top
  userHasDragged.value = true
  fabStyle.value = { left: `${left}px`, top: `${top}px` }
}

function endDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  document.removeEventListener('touchmove', onTouchMove)
  document.removeEventListener('touchend', onTouchEnd)

  // 不再吸附：用户拖到哪就停在哪，只做 boundary check 防止出屏。
  // 旧实现吸附到最近边缘 → 用户拖到中间想停却被吸到右侧，体验突兀。
  const el = fabRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const width = rect.width || FAB_WIDTH
  const height = rect.height || 80
  const maxLeft = Math.max(0, window.innerWidth - width)
  const maxTop = Math.max(0, window.innerHeight - height)
  const left = Math.max(0, Math.min(rect.left, maxLeft))
  const top = Math.max(0, Math.min(rect.top, maxTop))
  fabLeft.value = left
  fabTop.value = top
  // 仅当发生实际移动才标"用户拖动过"
  if (left !== fabStartLeft.value || top !== fabStartTop.value) userHasDragged.value = true
  fabStyle.value = { left: `${left}px`, top: `${top}px` }
}

function onMouseUp() { endDrag() }
function onTouchEnd() { endDrag() }

// ── 计数 ──
const runningCount = computed(() => tasks.value.filter(t => t.status === 'running').length)
const queuedCount = computed(() => tasks.value.filter(t => t.status === 'queued' || t.status === 'rate_limited' || t.status === 'retry_scheduled').length)
const pausedCount = computed(() => tasks.value.filter(t => t.status === 'paused').length)
const completedCount = computed(() => tasks.value.filter(t => t.status === 'completed').length)
const failedCount = computed(() => tasks.value.filter(t => t.status === 'failed').length)
const totalCount = computed(() => tasks.value.length)

// 后端并发上限（由 /tasks/queue/stats 提供，拉取失败时回退到 2）
const maxConcurrent = ref(2)

// 槽位是否已满：满槽才是"排队不动"的正当理由
const slotsFull = computed(() => runningCount.value >= maxConcurrent.value)

// 总活跃数 CSS 类（用于着色）
const totalClass = computed(() => {
  if (runningCount.value > 0) return 'running'
  if (queuedCount.value > 0) return 'queued'
  if (pausedCount.value > 0) return 'paused'
  return ''
})

// ── 活跃任务（运行中 + 排队中 + 暂停）──
const activeTasks = computed(() => {
  return tasks.value
    .filter(t => !t.parentId && (t.status === 'running' || t.status === 'queued' || t.status === 'rate_limited' || t.status === 'retry_scheduled' || t.status === 'paused'))
    .sort((a, b) => {
      // 运行中优先 → 排队中 → 暂停 → 其他
      const order: Record<string, number> = { running: 0, queued: 1, rate_limited: 1, retry_scheduled: 1, paused: 2 }
      const oa = order[a.status] ?? 3
      const ob = order[b.status] ?? 3
      if (oa !== ob) return oa - ob
      return (b.startTime || 0) - (a.startTime || 0)
    })
})

// ── 面板切换 ──
function togglePanel() {
  panelExpanded.value = !panelExpanded.value
  if (!panelExpanded.value) {
    selectedTaskId.value = ''
  }
}

function toggleTaskDetail(task: any) {
  const sid = task.sessionId
  selectedTaskId.value = selectedTaskId.value === sid ? '' : sid
}

function goToTaskCenter() {
  panelExpanded.value = false
  selectedTaskId.value = ''
  router.push('/tasks')
}

// ── 轮询 ──
const currentInterval = ref(3000)

// 并发上限只需拉一次（后端启动后不变）
async function loadMaxConcurrent() {
  try {
    const stats = await getQueueStats()
    if (stats?.maxConcurrent > 0) maxConcurrent.value = stats.maxConcurrent
  } catch { /* 静默，沿用默认值 2 */ }
}

async function pollTasks() {
  try {
    const resp = await fetchAllTasks()
    if (resp?.success) {
      // 🛡️ 排除终态（cancelled/deleted/completed/failed）任务，避免「取消+删除」后任务卡在列表里造成
      // 「应该空闲却显示 N 个任务」的错觉。终态任务本就不应出现在「运行监控」中。
      const all = resp.data.tasks || []
      tasks.value = all.filter((t: any) => {
        const s = t.status
        return s !== 'cancelled' && s !== 'deleted' && s !== 'completed' && s !== 'failed'
      })
      // 同步展开的任务对象
      if (selectedTaskId.value) {
        const exists = tasks.value.some(t => t.sessionId === selectedTaskId.value)
        if (!exists) selectedTaskId.value = ''
      }
    }
  } catch { /* 静默 */ }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    await pollTasks()
    adjustPollInterval()
  }, currentInterval.value)
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

function adjustPollInterval() {
  const desired = (runningCount.value + queuedCount.value + pausedCount.value) > 0 ? 3000 : 10000
  if (desired !== currentInterval.value) {
    currentInterval.value = desired
    startPolling()
  }
}

// ── 任务工具函数 ──
function getQueuedLabel(task: any): string {
  switch (task.status) {
    case 'queued': return '排队等待中…'
    case 'rate_limited': return '配额不足，等待恢复…'
    case 'retry_scheduled': return '等待重试…'
    default: return '排队等待中…'
  }
}

// ── 阶段管道（展开详情用）──
const PIPELINE_STAGES = [
  '初始化', 'Figma数据获取', '视觉分析', '并行分析',
  '代码生成', '串行精修', '质量检查', '迭代修订', '完成'
]

// 后端节点 ID → 中文阶段名映射（后端发送的 stage 通常是节点原始 ID，与中文名不一致）
const NODE_STAGE_MAP: Record<string, string> = {
  'init': '初始化',
  'figma': 'Figma数据获取',
  'figma-connector': 'Figma数据获取',
  'visual-parser': '视觉分析',
  'preview-validator': '视觉分析',
  'parallel-analysis': '并行分析',
  'layout-reviewer': '并行分析',
  'style-mapper': '并行分析',
  'microcode-engineer': '代码生成',
  'vue3-engineer': '代码生成',
  'code-structure-validator': '质量检查',
  'adversarial-checker': '质量检查',
  'parallel-quality-check': '质量检查',
  'visual-comparator': '质量检查',
  'revision-decision': '迭代修订',
  'parallel-refine': '串行精修',
  'layout-style-refiner': '串行精修',
  'complete': '完成',
}

function getCurrentStage(task: any) {
  if (task.status !== 'running') return null
  const progress = task.progress
  if (!Array.isArray(progress) || progress.length === 0) return null
  for (let i = progress.length - 1; i >= 0; i--) {
    const p = progress[i]
    if (p.stage && p.status === 'running') {
      const mappedStage = NODE_STAGE_MAP[p.stage] || p.stage
      const stepIdx = PIPELINE_STAGES.indexOf(mappedStage)
      return {
        stage: mappedStage,
        message: (p.message || '').replace(/^[^\u4e00-\u9fa5a-zA-Z]+/, '').slice(0, 30),
        step: stepIdx >= 0 ? stepIdx + 1 : 1, // fallback 到 1 而非 0
        total: PIPELINE_STAGES.length - 1,
      }
    }
  }
  return null
}

function getTaskTypeLabel(task: any) {
  if (task.taskType === 'page') return '页面'
  if (task.taskType === 'api') return '接口'
  if (task.taskType === 'workflow') return '工作流'
  if (task.taskType === 'component') {
    return task.target === 'vue3' ? 'V3' : 'MC'
  }
  const sid = task.sessionId || ''
  if (sid.startsWith('page-') && !task.parentId) return '页面'
  if (task.parentId) return '子组件'
  return task.target === 'vue3' ? 'V3' : 'MC'
}

function getTaskTypeClass(task: any) {
  if (task.taskType === 'page' || (task.sessionId || '').startsWith('page-')) return 'page'
  if (task.taskType === 'api') return 'api'
  if (task.taskType === 'workflow') return 'workflow'
  if (task.parentId) return 'sub'
  return task.target === 'vue3' ? 'vue3' : 'microcode'
}

function getTaskDisplayName(task: any) {
  // 🏷️ 优先组件中文名（Figma 根节点名/declare.json 回写的 displayName）
  if (task.displayName) return task.displayName
  const name = task.componentName || task.sessionId || '未知'
  return name.replace(/^(page|mc|vue3|phase2|lr)-[\d]+-[a-f0-9]+-/, '')
}

// 档位推断（兼容旧任务无 generationTier 字段）
function getTaskTier(task: any): string {
  if (!task) return ''
  if (task.generationTier) return task.generationTier
  const parts = (task.sessionId || '').split('-')
  if (parts.length >= 2) {
    if (parts[1] === 'lite') return 'lite'
    if (parts[1] === 'max') return 'max'
  }
  return ''
}

// 输入来源识别：优先 sourceType，其次从 fileKey/nodeId 推断，最后从 sessionId 推断
function getTaskSource(task: any): 'screenshot' | 'figma' | null {
  if (!task) return null
  const source = task.sourceType
  if (source === 'screenshot' || source === 'figma') return source
  if (task.fileKey && task.nodeId) return 'figma'
  // 从 sessionId 推断
  const parts = (task.sessionId || '').split('-')
  if (parts.length >= 2) {
    if (parts[1] === 'lite') return 'screenshot'
    if (parts[1] === 'max') return 'figma'
  }
  // 旧版 ml- 前缀 = 截图
  if ((task.sessionId || '').startsWith('ml-')) return 'screenshot'
  return null
}

function formatDuration(task: any) {
  const start = task.startTime
  if (!start) return '--'
  const end = task.endTime || (task.status === 'running' ? Date.now() : start)
  const seconds = Math.floor((end - start) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`
}

// ── 阶段管道（展开详情用）──
function taskPipelineStages(task: any) {
  const progress = Array.isArray(task.progress) ? task.progress : []
  const currentStage = getCurrentStage(task)
  const currentIdx = currentStage ? PIPELINE_STAGES.indexOf(currentStage.stage) : -1

  return PIPELINE_STAGES.map((name, idx) => {
    const p = progress.find(x => {
      const mapped = NODE_STAGE_MAP[x.stage] || x.stage
      return mapped === name
    })
    let cls = ''
    if (p?.status === 'running' || (currentIdx === idx && task.status === 'running')) cls = 'running'
    else if (p?.status === 'success' || p?.status === 'completed') cls = 'done'
    else if (p?.status === 'failed' || p?.status === 'error') cls = 'error'
    else if (idx < currentIdx || (currentIdx >= 0 && idx < currentIdx)) cls = 'done'

    return {
      name,
      sub: p?.message ? (p.message.replace(/^[^\u4e00-\u9fa5a-zA-Z]+/, '').slice(0, 25)) : '',
      time: p?.duration ? `${Math.floor(p.duration / 1000)}s` : '',
      cls,
    }
  }).filter(s => s.cls !== '') // 只显示已触发的阶段
}

// ── ProgressDetailPanel 事件处理 ───
async function pauseTaskHandler(task: any) {
  try {
    const resp = await pauseTask(task.sessionId)
    if (resp?.success) { message.success('已暂停'); await pollTasks() }
    else message.error(resp?.message || '暂停失败')
  } catch (e: any) { message.error('暂停失败: ' + (e.message || String(e))) }
}

async function cancelTaskHandler(task: any) {
  if (!confirm(`确定要终止任务「${getTaskDisplayName(task)}」吗？`)) return
  try {
    const resp = await cancelTask(task.sessionId)
    if (resp?.success) { message.success('已取消'); await pollTasks() }
    else message.error(resp?.message || '取消失败')
  } catch (e: any) { message.error('取消失败: ' + (e.message || String(e))) }
}

async function deleteTaskHandler(task: any) {
  if (!confirm(`确定要删除排队中的任务「${getTaskDisplayName(task)}」吗？`)) return
  try {
    const resp = await deleteTask(task.sessionId)
    if (resp?.success) { message.success('已删除'); await pollTasks() }
    else message.error(resp?.message || '删除失败')
  } catch (e: any) { message.error('删除失败: ' + (e.message || String(e))) }
}

async function startQueuedTaskHandler(task: any) {
  try {
    const resp = await startQueuedTask(task.sessionId)
    if (resp?.success) { message.success(resp.message || '已触发启动'); await pollTasks() }
    else message.error(resp?.message || '启动失败')
  } catch (e: any) { message.error('启动失败: ' + (e.message || String(e))) }
}

function handleDownload(task: any) {
  // 🛡️ 2026-09-04：window.open 是导航请求、带不上 Token → 生产 Java 401；统一 Blob 下载
  if (!task?.sessionId) return
  const name = `${task.componentId || task.sessionId}.zip`
  void downloadByUrl(`${baseURL}/phase2/download/${task.sessionId}`, name)
}

async function handleDetail(task: any) {
  try {
    const component = await getComponentBySessionId(task.sessionId)
    if (component?._id) {
      router.push(`/components/${component._id}`)
    } else {
      throw new Error('记录为空')
    }
  } catch {
    const groupId = localStorage.getItem('currentGroupId') || 'default-group'
    window.open(window.location.origin + getRouteUrl(`/preview/${task.sessionId}?groupId=${groupId}`), '_blank')
  }
}

function handlePlayground(task: any) {
  router.push(`/demo/${task.sessionId}`)
}

function handleNavigate(task: any) {
  const sid = task.sessionId || ''
  if (!sid) {
    message.warning('缺少会话 ID，无法跳转')
    return
  }
  router.push({ path: `/tasks/${sid}` })
}

async function handleRetry(task: any) {
  const sessionId = task.sessionId
  if (!sessionId) { message.warning('缺少会话 ID，无法重试'); return }
  try {
    const response = await retryTask(sessionId)
    if (response.success) {
      message.success(response.resumed ? (response.message || '已复用缓存续跑') : (response.message || '重试已启动'))
      selectedTaskId.value = ''
      await pollTasks()
    } else message.error(response.error || '重试请求失败')
  } catch (e: any) { message.error('重试失败: ' + (e.message || String(e))) }
}

async function handleRetryWithConfig(task: any, config: { model?: string; endpoint?: string; apiKey?: string }) {
  const sessionId = task.sessionId
  if (!sessionId) { message.warning('缺少会话 ID，无法重试'); return }
  try {
    const response = await retryTask(sessionId, config)
    if (response.success) {
      message.success(response.resumed ? (response.message || '已复用缓存续跑（新配置）') : (response.message || '重试已启动（新配置）'))
      selectedTaskId.value = ''
      await pollTasks()
    } else message.error(response.error || '重试请求失败')
  } catch (e: any) { message.error('重试失败: ' + (e.message || String(e))) }
}

// ── 生命周期 ──
function resetFabToRightAnchor() {
  const left = getInitialRightAnchor()
  fabLeft.value = left
  fabTop.value = FAB_DEFAULT_TOP
  fabStyle.value = { left: `${left}px`, top: `${FAB_DEFAULT_TOP}px` }
}

function handleResize() {
  // 未被用户拖动过：直接贴右（处理窗口变宽 / 旋转屏幕）
  if (!userHasDragged.value) {
    resetFabToRightAnchor()
    return
  }
  // 已经拖动过：仅做 boundary check 防止 fab 落到屏幕外，不强制回贴右
  const el = fabRef.value
  if (!el) return
  const width = el.offsetWidth || FAB_WIDTH
  const height = el.offsetHeight || 80
  const maxLeft = window.innerWidth - width
  const maxTop = window.innerHeight - height
  const curLeft = fabLeft.value ?? 0
  const curTop = fabTop.value ?? FAB_DEFAULT_TOP
  if (curLeft > maxLeft || curLeft < 0 || curTop > maxTop || curTop < 0) {
    const newLeft = Math.max(0, Math.min(curLeft, maxLeft))
    const newTop = Math.max(0, Math.min(curTop, maxTop))
    fabLeft.value = newLeft
    fabTop.value = newTop
    fabStyle.value = { left: `${newLeft}px`, top: `${newTop}px` }
  }
}

onMounted(() => {
  resetFabToRightAnchor()
  loadMaxConcurrent()
  pollTasks()
  startPolling()
  window.addEventListener('resize', handleResize)
})
onUnmounted(() => {
  stopPolling()
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  document.removeEventListener('touchmove', onTouchMove)
  document.removeEventListener('touchend', onTouchEnd)
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
/* ========================================
   FAB 浮动监控按钮
   ======================================== */
.wm-fab {
  position: fixed;
  /* position 由 :style="fabStyle" 完全控制，避免 right/left 切换造成 px 漂移 */
  top: calc(64px + 12px);
  width: 56px;
  min-height: 80px;
  padding: 10px 0 8px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-card) 96%, transparent);
  box-shadow: 0 2px 10px var(--shadow-sm);
  border: 1.5px solid var(--border-default);
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: grab;
  z-index: 1000;
  transition: border-color 0.16s ease, background 0.16s ease;
  user-select: none;
}
/* 有活跃任务：外发光脉冲（直接动画 box-shadow，无伪元素间隔） */
.wm-fab.has-active {
  border-color: var(--task-running-border);
  border-width: 2px;
  animation: wm-fab-glow 2s ease-in-out infinite;
}
.wm-fab.has-active:hover {
  border-color: var(--task-running);
}
.wm-fab.dragging {
  cursor: grabbing;
  box-shadow: var(--shadow-md);
  transition: none;
}
.wm-fab:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--border-strong);
}

/* 外发光脉冲：直接动画 box-shadow，无间隔 */
@keyframes wm-fab-glow {
  0%, 100% {
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--task-running) 30%, transparent),
      0 0 12px 3px color-mix(in srgb, var(--task-running) 35%, transparent),
      0 2px 8px var(--shadow-sm);
  }
  50% {
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--task-running) 60%, transparent),
      0 0 24px 8px color-mix(in srgb, var(--task-running) 50%, transparent),
      0 0 48px 16px color-mix(in srgb, var(--task-running) 20%, transparent),
      0 2px 8px var(--shadow-sm);
  }
}

/* ── 空闲态 ── */
.wm-fab-idle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
}
.wm-fab-icon {
  width: 20px;
  height: 20px;
  color: var(--text-tertiary);
}
.wm-fab-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  letter-spacing: 1px;
}

/* ── 有任务态 ─ */
.wm-fab-stats {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  padding: 0 4px;
}

/* 顶部总活跃数 */
.wm-fab-total {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
  padding-top: 2px;
}
.wm-fab-total-num {
  font-size: 20px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  letter-spacing: -0.5px;
}
.wm-fab-total-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: 3px;
  letter-spacing: 0;
}

/* 并发上限分母（小一号、弱化） */
.wm-fab-total-max {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
}

/* 总活跃数着色 */
.wm-fab-total.running .wm-fab-total-num { color: var(--task-running); }
.wm-fab-total.queued  .wm-fab-total-num { color: var(--task-queued); }
.wm-fab-total.paused  .wm-fab-total-num { color: var(--task-muted); }

/* 槽位已满：分母也着色，提示"排队是因为满槽而非卡住" */
.wm-fab-total.slots-full .wm-fab-total-max { color: var(--task-queued); }

/* 分隔线 */
.wm-fab-divider {
  width: 16px;
  height: 1px;
  background: var(--border-default);
  margin: 6px 0 4px;
}

/* 色点 + 数字行 */
.wm-fab-stat-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 0;
}
.wm-fab-stat-num {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 10px;
  text-align: center;
}

/* 色点 */
.wm-fab-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
.wm-fab-dot.running {
  background: var(--task-running);
  animation: wm-dot-pulse 1.5s ease-in-out infinite;
}
.wm-fab-dot.queued  { background: var(--task-queued); }
.wm-fab-dot.paused  { background: var(--task-muted); }
.wm-fab-dot.failed  { background: var(--task-failed); }

@keyframes wm-dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.5; transform: scale(0.85); }
}

/* 展开箭头 */
.wm-fab-arrow {
  display: block;
  font-size: 12px;
  line-height: 1;
  color: var(--text-tertiary);
  transition: transform 0.2s;
  margin-top: 2px;
  font-weight: 700;
}
.wm-fab-arrow.expanded {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .wm-fab-dot.running,
  .wm-task-dot.running,
  .wm-detail-stage.running .wm-detail-stage-dot {
    animation: none;
  }
}


/* ===== 浮动面板（FAB 子元素，absolute 定位紧贴 FAB） ===== */
.wm-panel {
  position: absolute;
  right: calc(100% + 8px);
  top: 0;
  width: 360px;
  max-height: 520px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-strong);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06);
  z-index: 999;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform-origin: right top;
}
/* 顶部蓝色色条 */
.wm-panel::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--task-running, #3b82f6);
  border-radius: 12px 12px 0 0;
  z-index: 1;
}

/* FAB 在左半屏时，面板出现在右侧 */
.wm-fab.panel-right .wm-panel {
  right: auto;
  left: calc(100% + 8px);
  transform-origin: left top;
}
.wm-fab.panel-right .wm-panel::before {
  border-radius: 12px 12px 0 0;
}

/* 面板弹出动画 */
.wm-pop-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.wm-pop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.wm-pop-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}
.wm-pop-leave-to {
  opacity: 0;
  transform: scale(0.97);
}

/* ===== 面板头部 ===== */
.wm-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}
.wm-panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}
.wm-header-chips {
  display: flex;
  gap: 6px;
}
.wm-chip {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}
.wm-chip.running { color: var(--task-running-text); background: color-mix(in srgb, var(--task-running-bg) 48%, var(--bg-card)); }
.wm-chip.paused { color: var(--task-muted-text); background: color-mix(in srgb, var(--task-muted-bg) 48%, var(--bg-card)); }
.wm-chip.queued { color: var(--task-queued-text); background: color-mix(in srgb, var(--task-queued-bg) 48%, var(--bg-card)); }
.wm-panel-close {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}
.wm-panel-close:hover { background: var(--bg-alt); color: var(--text-primary); }

/* ===== 面板内容区 ===== */
.wm-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

/* 空状态 */
.wm-panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  gap: 10px;
  color: var(--text-quaternary);
}
.wm-empty-icon {
  font-size: 24px;
  color: var(--success);
}
.wm-panel-empty span {
  font-size: 13px;
}

/* ===== 任务卡片 ===== */
.wm-task-card {
  margin-bottom: 8px;
  border: 1.5px solid var(--border-light);
  border-left: 3px solid var(--border-default);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  background: var(--bg-card);
}
.wm-task-card.running {
  border-left-color: var(--task-running);
  background: color-mix(in srgb, var(--task-running-bg) 25%, var(--bg-card));
  box-shadow: 0 2px 8px color-mix(in srgb, var(--task-running) 15%, transparent);
}
.wm-task-card.paused {
  border-left-color: var(--task-muted);
  background: color-mix(in srgb, var(--task-muted-bg) 30%, var(--bg-card));
}
.wm-task-card.queued,
.wm-task-card.rate_limited,
.wm-task-card.retry_scheduled { border-left-color: var(--task-queued); }
/* 静：深绿/红实心 + tint 背景，与 TaskCenter 一致 */
.wm-task-card.completed { border-left-color: var(--task-success); background: color-mix(in srgb, var(--task-success-bg) 18%, var(--bg-card)); }
.wm-task-card.failed { border-left-color: var(--task-failed); background: color-mix(in srgb, var(--task-failed-bg) 18%, var(--bg-card)); }
.wm-task-card.expanded {
  border-color: color-mix(in srgb, var(--task-running) 50%, var(--border-default));
  border-left-color: var(--task-running);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--task-running) 20%, transparent);
}

.wm-task-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  cursor: pointer;
  transition: background 0.15s;
}
.wm-task-summary:hover { background: var(--bg-hover); }

.wm-task-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
.wm-task-dot.running { background: var(--task-running); animation: wm-pulse 1.5s ease-in-out infinite; }
.wm-task-dot.paused { background: var(--task-muted); }
.wm-task-dot.queued,
.wm-task-dot.rate_limited,
.wm-task-dot.retry_scheduled { background: var(--task-queued); }
/* 静：深绿实心，无动画 — 与 running 脉动形成动/静二分 */
.wm-task-dot.completed { background: var(--task-success); }
.wm-task-dot.failed { background: var(--task-failed); }

@keyframes wm-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.wm-task-info {
  flex: 1;
  min-width: 0;
}
.wm-task-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.wm-task-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wm-task-type {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-tertiary);
  background: var(--bg-alt);
  padding: 2px 8px;
  border-radius: 6px;
  flex-shrink: 0;
  border: 1px solid transparent;
  letter-spacing: 0.3px;
}
.wm-task-type.vue3 {
  background: var(--component-vue3);
  color: var(--component-vue3-contrast);
  box-shadow: 0 1px 3px rgba(15, 23, 42, .12);
}
.wm-task-type.microcode {
  background: var(--component-microcode);
  color: var(--component-microcode-contrast);
  box-shadow: 0 1px 3px rgba(15, 23, 42, .12);
}
.wm-task-type.page {
  color: var(--component-vue3-strong);
  background: color-mix(in srgb, var(--component-vue3-bg) 48%, var(--bg-card));
  border-color: var(--component-vue3-border);
}
.wm-task-type.api {
  color: var(--feature);
  background: color-mix(in srgb, var(--feature-bg) 48%, var(--bg-card));
  border-color: rgba(168, 85, 247, 0.2);
}
.wm-task-type.workflow {
  color: var(--task-muted-text);
  background: var(--task-muted-bg);
  border-color: var(--task-muted-border);
}
.wm-task-type.sub {
  color: var(--task-muted-text);
  background: var(--task-muted-bg);
  border-color: var(--task-muted-border);
}
/* 生成档位（lite/max）→ 渐变胶囊；来源统一为描边方框 */
.wm-task-tier {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  box-shadow: 0 1px 4px rgba(15, 23, 42, .12);
  font-weight: 600;
}
.wm-task-tier::before { display: none; }
.wm-task-source {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid var(--source-box-border, #111827);
  background: var(--source-box-bg, #ffffff);
  color: var(--source-box-text, #111827);
  font-size: 10px;
  font-weight: 400;
  line-height: 1;
  letter-spacing: 0;
  box-shadow: none;
}
.wm-task-tier.lite {
  background: var(--tier-lite-grad);
  color: var(--tier-lite-text);
}
.wm-task-tier.max {
  background: var(--tier-max-grad);
  color: var(--tier-max-text);
}
html[data-theme="dark"] .wm-task-source {
  --source-box-bg: #111827;
  --source-box-text: #f8fafc;
  --source-box-border: #f8fafc;
}
.wm-task-stage {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}
.wm-stage-step {
  font-weight: 700;
  color: var(--task-running-text);
  background: color-mix(in srgb, var(--task-running-bg) 46%, var(--bg-card));
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
}
.wm-stage-name {
  font-weight: 600;
  color: var(--text-primary);
  flex-shrink: 0;
}
.wm-stage-msg {
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.wm-task-paused {
  font-size: 11px;
  font-weight: 600;
  color: var(--task-muted-text);
}
.wm-task-queued {
  font-size: 11px;
  font-weight: 600;
  color: var(--task-queued-text);
}

.wm-task-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.wm-task-duration {
  font-size: 11px;
  color: var(--text-tertiary);
}
.wm-task-chevron {
  font-size: 16px;
  color: var(--text-tertiary);
  transition: transform 0.2s;
}
.wm-task-chevron.rotated { transform: rotate(90deg); }

/* ===== 展开详情：紧凑模式 ===== */
.wm-task-detail {
  padding: 0 8px 8px;
}

/* 阶段进度条 */
.wm-detail-stages {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0;
}

.wm-detail-stage {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 11px;
}

.wm-detail-stage-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  background: var(--border-default);
}

.wm-detail-stage.running .wm-detail-stage-dot {
  background: var(--task-running);
  animation: wm-pulse 1.5s ease-in-out infinite;
}

.wm-detail-stage.done .wm-detail-stage-dot {
  background: var(--task-success);
}

.wm-detail-stage.error .wm-detail-stage-dot {
  background: var(--task-failed);
}

.wm-detail-stage-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.wm-detail-stage-name {
  color: var(--text-primary);
  font-weight: 500;
  white-space: nowrap;
}

.wm-detail-stage.running .wm-detail-stage-name {
  color: var(--task-running-text);
  font-weight: 600;
}

.wm-detail-stage.done .wm-detail-stage-name {
  color: var(--task-success-text);
}

.wm-detail-stage.error .wm-detail-stage-name {
  color: var(--task-failed-text);
}

.wm-detail-stage-sub {
  color: var(--text-tertiary);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}

.wm-detail-stage-time {
  font-size: 10px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

/* 操作按钮行 */
.wm-detail-actions {
  display: flex;
  gap: 6px;
  padding: 8px 0 2px;
  border-top: 1px solid var(--border-light);
  margin-top: 4px;
}

.wm-detail-btn {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

.wm-detail-btn:hover {
  background: var(--bg-alt);
  color: var(--text-primary);
}

.wm-detail-btn.primary {
  background: var(--bg-card);
  border-color: var(--task-running-border);
  color: var(--task-running-text);
  font-weight: 600;
}

.wm-detail-btn.primary:hover {
  background: color-mix(in srgb, var(--task-running-bg) 48%, var(--bg-card));
  color: var(--task-running-text);
}

.wm-detail-btn.danger {
  color: var(--task-failed-text);
  border-color: var(--task-failed-border);
}

.wm-detail-btn.danger:hover {
  background: var(--task-failed);
  color: #fff;
}

.wm-detail-enter-active,
.wm-detail-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}
.wm-detail-enter-from,
.wm-detail-leave-to {
  opacity: 0;
  max-height: 0;
}
.wm-detail-enter-to,
.wm-detail-leave-from {
  opacity: 1;
  max-height: 800px;
}

/* ===== 面板底部 ===== */
.wm-panel-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}
.wm-footer-link {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--brand);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.wm-footer-link:hover {
  background: color-mix(in srgb, var(--brand-bg) 46%, var(--bg-card));
  border-color: var(--brand);
}
</style>
