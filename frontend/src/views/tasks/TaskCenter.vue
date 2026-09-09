<template>
  <div class="task-center">
    <!-- 页面标题 -->
    <PageHeader
      title="任务中心"
      description="管理所有组件/页面生成任务，查看历史记录与执行状态"
    >
      <template #actions>
        <AppButton
          variant="primary"
          size="sm"
          :icon="PlusOutlined"
          @click="router.push('/generator/components')"
        >
          新建生成任务
        </AppButton>
        <AppButton
          variant="secondary"
          size="sm"
          :icon="ReloadOutlined"
          :loading="loading"
          @click="loadTasks"
        >
          {{ loading ? '加载中...' : '刷新' }}
        </AppButton>
      </template>
    </PageHeader>

    <div class="tc-top">
    <!-- 总览仪表盘：环形完成率 + 状态磁贴（点击磁贴即快速筛选） -->
    <section class="tc-overview">
      <div
        class="tc-hero"
        :class="{ active: isCardActive('all') }"
        role="button"
        :title="statCards.find((c) => c.key === 'all')?.hint"
        @click="clickStatCard('all')"
      >
        <div class="tc-ring">
          <svg viewBox="0 0 84 84">
            <circle class="tc-ring-bg" cx="42" cy="42" r="36" />
            <circle
              class="tc-ring-fg"
              cx="42"
              cy="42"
              r="36"
              :stroke-dasharray="ringCircumference"
              :stroke-dashoffset="ringOffset"
            />
          </svg>
          <div class="tc-ring-pct"><b>{{ completionRate }}%</b><small>完成率</small></div>
        </div>
        <div class="tc-hero-meta">
          <span class="tc-hero-label">任务总数</span>
          <span class="tc-hero-total">{{ stats.total }}</span>
          <span class="tc-hero-hint" v-if="stats.today > 0">今日生成 {{ stats.today }}</span>
        </div>
      </div>

      <div class="tc-tiles">
        <button
          v-for="card in overviewTiles"
          :key="card.key"
          type="button"
          class="tc-tile"
          :class="[card.key, { active: isCardActive(card.key) }]"
          :title="card.hint"
          @click="clickStatCard(card.key)"
        >
          <span class="tc-tile-ic"><component :is="card.icon" /></span>
          <span class="tc-tile-body">
            <span class="tc-tile-num">{{ card.value }}</span>
            <span class="tc-tile-name">{{ card.label }}</span>
          </span>
        </button>
      </div>
    </section>

    <!-- 筛选 + 搜索 + 排序 -->
    <div class="filter-bar">
      <div class="filter-left">
        <div class="segmented">
          <button
            v-for="opt in statusOptions"
            :key="opt.value"
            type="button"
            class="segmented-item"
            :class="{ active: filterStatus === opt.value && !isTodayFilter }"
            @click="setStatusFilter(opt.value)"
          >{{ opt.label }}</button>
        </div>
        <select v-model="filterTarget" class="filter-select" @change="currentPage = 1">
          <option value="">全部类型</option>
          <option value="microcode">微码组件</option>
          <option value="vue3">普通组件</option>
          <option value="page">页面生成</option>
        </select>
        <select v-model="filterSource" class="filter-select" @change="currentPage = 1">
          <option value="">全部来源</option>
          <option value="screenshot">截图输入</option>
          <option value="figma">Figma 输入</option>
          <option value="html">HTML 输入</option>
          <option value="traditional">传统生成</option>
        </select>
        <AppButton
          v-if="filterStatus || filterTarget || filterSource || isTodayFilter"
          variant="ghost"
          size="sm"
          @click="clearFilter"
        >
          清除筛选
        </AppButton>
      </div>
      <div class="filter-right">
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="搜索组件名称..."
          @input="currentPage = 1"
        />
        <select v-model="sortBy" class="filter-select sort-select" @change="currentPage = 1">
          <option value="newest">最新优先</option>
          <option value="oldest">最早优先</option>
          <option value="name">名称排序</option>
        </select>
      </div>
    </div>

    <!-- 批量操作栏 -->
    <div class="batch-bar" v-if="paginatedTasks.length > 0">
      <label class="batch-select-all" @click.stop>
        <input
          type="checkbox"
          :checked="isCurrentPageAllSelected"
          :indeterminate="isCurrentPageIndeterminate"
          @change="toggleSelectCurrentPage"
        />
        <span>本页全选</span>
      </label>
      <span class="batch-count">已选 {{ selectedTaskIds.size }} 个任务</span>
      <AppButton
        variant="danger"
        size="sm"
        :icon="DeleteOutlined"
        :loading="batchDeleting"
        :disabled="selectedTaskIds.size === 0"
        @click="confirmBatchDelete"
      >
        {{ batchDeleting ? '删除中...' : '批量删除' }}
      </AppButton>
      <AppButton
        v-if="selectedTaskIds.size > 0"
        variant="ghost"
        size="sm"
        @click="clearSelection"
      >
        取消选择
      </AppButton>
    </div>
    </div><!-- /tc-top -->

    <!-- 可滚动任务列表区：仅此区域出现滚动条 -->
    <div class="tc-scroll">

    <!-- 任务列表 -->
    <div class="task-list" v-if="paginatedTasks.length > 0">
      <ListItem
        v-for="task in paginatedTasks"
        :key="task.sessionId"
        density="rich"
        :clickable="true"
        :selected="selectedTaskIds.has(task.sessionId)"
        :class="['task-status-card', task.status]"
        @click="openTaskDetail(task)"
      >
        <template #leading>
          <label class="task-select" @click.stop>
            <input
              type="checkbox"
              :checked="selectedTaskIds.has(task.sessionId)"
              :aria-label="`选择任务 ${task.sessionId}`"
              @change="toggleTaskSelection(task.sessionId)"
            />
          </label>
        </template>
        <div class="task-info">
          <div class="task-name-row">
            <span class="task-name" :title="`${componentTitle(task)}（任务号：${task.sessionId}）`">{{ componentTitle(task) }}</span>
            <span class="task-type-badge" :class="task.target">{{ typeLabel(task.target) }}</span>
            <span v-if="getTaskTier(task)" class="task-tier-badge" :class="getTaskTier(task)">{{ tierLabel(getTaskTier(task)) }}</span>
            <span v-if="getTaskSource(task)" class="task-source-box">
              {{ sourceLabel(getTaskSource(task)) }}
            </span>
          </div>
          <div class="task-subtitle-row">
            <span class="task-subtitle" :title="`任务号：${task.sessionId} · ${componentInfo(task)}`">任务号：{{ task.sessionId }}</span>
          </div>
          <div class="task-meta">
            <span class="task-status" :class="task.status">{{ statusLabel(task.status) }}</span>
            <span v-if="task.humanReview" class="task-status human-review" :title="reviewTooltip(task)">
              {{ task.humanReview.action === 'passed' ? '人工通过*' : '人工警告*' }}
            </span>
            <span v-if="task.userApproved" class="task-status speed-pass" :title="`用户点击「跳过剩余阶段」极速通过，产物未经 AI 对抗性修正（跳过阶段：${(task.approval?.skippedStages || []).join('、')}）`">
              ⚡ 跳过剩余
            </span>
            <span class="task-time">{{ formatTime(task.startTime) }}</span>
            <span class="task-duration">{{ formatDuration(task.duration) }}</span>
            <span v-if="task.status === 'failed' && task.error" class="task-error-inline" :title="task.error">{{ task.error }}</span>
          </div>
        </div>
        <template #actions>
          <div class="task-actions">
            <button
              v-if="task.status === 'running'"
              class="btn-task icon-only warn icon-tooltip"
              @click="pauseTaskDirect(task.sessionId)"
              :data-tooltip="'暂停'"
              aria-label="暂停任务"
            >
              <PauseCircleOutlined />
            </button>
            <button
              v-if="task.status === 'paused'"
              class="btn-task icon-only brand icon-tooltip"
              @click="resumeTaskDirect(task.sessionId)"
              :data-tooltip="'恢复'"
              aria-label="恢复任务"
            >
              <PlayCircleOutlined />
            </button>
            <button
              v-if="task.status === 'queued' || task.status === 'rate_limited' || task.status === 'retry_scheduled'"
              class="btn-task icon-only brand icon-tooltip"
              @click="startQueuedTaskDirect(task.sessionId)"
              :data-tooltip="'开始'"
              aria-label="开始排队任务"
            >
              <PlayCircleOutlined />
            </button>
            <button
              v-if="task.status === 'running' || task.status === 'paused' || task.status === 'queued' || task.status === 'rate_limited' || task.status === 'retry_scheduled'"
              class="btn-task icon-only danger icon-tooltip"
              @click="task.status === 'queued' || task.status === 'rate_limited' || task.status === 'retry_scheduled' ? cancelQueuedTaskDirect(task.sessionId) : cancelTaskDirect(task.sessionId)"
              :data-tooltip="task.status === 'queued' || task.status === 'rate_limited' || task.status === 'retry_scheduled' ? '取消排队' : '取消'"
              aria-label="取消任务"
            >
              <CloseOutlined />
            </button>
            <!-- 人工审核按钮已隐藏 -->
            <!-- <button
              v-if="task.status === 'failed' && !task.humanReview"
              class="btn-task review"
              @click="openReviewModal(task)"
              title="人工审核"
            >
              人工审核
            </button> -->
            <!-- 撤回审核按钮已隐藏 -->
            <!-- <button
              v-if="task.humanReview"
              class="btn-task revoke"
              @click="revokeReview(task)"
              title="撤回审核"
            >
              撤回审核
            </button> -->
            <button
              v-if="task.status === 'completed'"
              class="btn-task icon-only neutral icon-tooltip"
              type="button"
              @click="downloadTaskZip(task)"
              data-tooltip="下载"
              aria-label="下载组件包"
            >
              <DownloadOutlined />
            </button>
            <button
              v-if="canOpenTaskPlayground(task)"
              class="btn-task playground"
              type="button"
              @click="openPlayground(task)"
              title="在 Playground 中查看和编辑组件"
            >
              <CodeOutlined />
              Playground
            </button>
            <button
              class="btn-task icon-only btn-delete icon-tooltip"
              :class="{ disabled: task.status === 'running' || task.status === 'paused' }"
              @click="deleteTask(task)"
              :data-tooltip="
                task.status === 'running' || task.status === 'paused'
                  ? '运行中或暂停中的任务请先取消，不能直接删除'
                  : '删除任务'
              "
              aria-label="删除任务"
            >
              <DeleteOutlined />
            </button>
          </div>
        </template>
      </ListItem>
    </div>

    <!-- 空状态 -->
    <EmptyState
      v-else
      title="暂无任务记录"
      description="去组件生成开始你的第一个任务吧"
    >
      <template #actions>
        <AppButton variant="primary" size="sm" @click="router.push('/generator/components')">
          去组件生成
        </AppButton>
      </template>
    </EmptyState>

    <!-- 分页 -->
    <div class="pagination" v-if="totalPages > 1">
      <AppButton
        variant="secondary"
        size="sm"
        :icon="LeftOutlined"
        :disabled="currentPage <= 1"
        @click="currentPage--"
      >
        上一页
      </AppButton>
      <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
      <AppButton
        variant="secondary"
        size="sm"
        :icon="RightOutlined"
        :disabled="currentPage >= totalPages"
        @click="currentPage++"
      >
        下一页
      </AppButton>
    </div>
    </div><!-- /tc-scroll -->

    <!-- 人工审核对话框 -->
    <Modal
      v-model:open="reviewModalVisible"
      title="人工审核任务"
      :confirm-loading="reviewSubmitting"
      @ok="submitReview"
      @cancel="cancelReview"
      ok-text="提交审核"
      cancel-text="取消"
    >
      <div v-if="reviewingTask" class="review-modal">
        <div class="review-task-info">
          <p><strong>任务：</strong>{{ reviewingTask.componentName || reviewingTask.sessionId }}</p>
          <p><strong>当前状态：</strong><span class="task-status failed">失败</span></p>
          <p v-if="reviewingTask.error"><strong>失败原因：</strong>{{ reviewingTask.error }}</p>
        </div>
        
        <div class="review-form">
          <div class="form-item">
            <label>审核结果 <span class="required">*</span></label>
            <div class="radio-group">
              <label class="radio-item">
                <input type="radio" v-model="reviewAction" value="passed" />
                <span class="radio-label">通过</span>
                <span class="radio-desc">标记为成功，可以继续后续操作</span>
              </label>
              <label class="radio-item">
                <input type="radio" v-model="reviewAction" value="warned" />
                <span class="radio-label">警告通过</span>
                <span class="radio-desc">存在问题但可接受，会显示警告标记</span>
              </label>
            </div>
          </div>
          
          <div class="form-item">
            <label>审核备注 <span class="optional">(可选)</span></label>
            <textarea
              v-model="reviewReason"
              placeholder="说明审核通过的原因..."
              rows="3"
              class="review-textarea"
            ></textarea>
          </div>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  DeleteOutlined,
  DownloadOutlined,
  LeftOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SyncOutlined,
  UndoOutlined,
  UnorderedListOutlined
} from '@ant-design/icons-vue'
import {
  fetchAllTasks,
  deleteTask as apiDeleteTask,
  batchDeleteTasks,
  pauseTask,
  resumeTask,
  cancelTask,
  startQueuedTask,
  submitHumanReview,
  revokeHumanReview,
  cancelQueuedTask,
  getQueueStats
} from '@/api/generator/generator'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ListItem from '@/components/common/ListItem.vue'
import AppButton from '@/components/common/AppButton.vue'
import {
  buildTaskPlaygroundLocation,
  canOpenTaskPlayground
} from '@/utils/task-actions'
import { downloadByUrl } from '@/utils/download-file'

const router = useRouter()
const route = useRoute()
const baseURL = import.meta.env.VITE_LANGGRAPH_API || 'http://localhost:3000/api'

// ── 数据 ──
const allTasks = ref<any[]>([])
const loading = ref(false)
const selectedTaskIds = ref(new Set<string>())
const batchDeleting = ref(false)
const queueStats = ref<{ queued: number; rate_limited: number; retry_scheduled: number }>({
  queued: 0,
  rate_limited: 0,
  retry_scheduled: 0
})

// ── 人工审核 ──
const reviewModalVisible = ref(false)
const reviewingTask = ref<any>(null)
const reviewAction = ref<'passed' | 'warned'>('passed')
const reviewReason = ref('')
const reviewSubmitting = ref(false)

function openReviewModal(task: any) {
  reviewingTask.value = task
  reviewAction.value = 'passed'
  reviewReason.value = ''
  reviewModalVisible.value = true
}

function cancelReview() {
  reviewModalVisible.value = false
  reviewingTask.value = null
}

async function submitReview() {
  if (!reviewingTask.value) return
  reviewSubmitting.value = true
  try {
    await submitHumanReview(reviewingTask.value.sessionId, reviewAction.value, reviewReason.value)
    message.success('审核已提交')
    await loadTasks()
  } catch (e: any) {
    message.error('提交失败: ' + (e.message || String(e)))
  } finally {
    reviewSubmitting.value = false
    reviewModalVisible.value = false
  }
}

async function revokeReview(task: any) {
  Modal.confirm({
    title: '撤回人工审核',
    content: `撤回后任务将恢复为失败状态，确定继续？`,
    okText: '确认撤回',
    cancelText: '取消',
    onOk: async () => {
      try {
        await revokeHumanReview(task.sessionId)
        message.success('已撤回')
        await loadTasks()
      } catch (e: any) {
        message.error('撤回失败: ' + (e.message || String(e)))
      }
    }
  })
}

// ── 筛选 / 搜索 / 分页 ──
// 从 URL query 恢复筛选状态（支持返回时保持）
const filterStatus = ref((route.query.status as string) || '')
const filterTarget = ref((route.query.target as string) || '')
const filterSource = ref((route.query.source as string) || '')
const searchQuery = ref((route.query.search as string) || '')
// 时间维度筛选：与状态维度互斥（同一时刻只能激活一个快速筛选）
const isTodayFilter = ref(route.query.today === '1' || route.query.today === 'true')
const currentPage = ref(1)
const pageSize = 15
// 排序维度（列表展示顺序，不与筛选冲突）
const sortBy = ref<'newest' | 'oldest' | 'name'>('newest')

// 状态分段筛选（与统计卡片的状态快速筛选共用 filterStatus）
const statusOptions = [
  { value: '', label: '全部' },
  { value: 'running', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'queued', label: '排队中' }
]

function clearFilter() {
  filterStatus.value = ''
  filterTarget.value = ''
  filterSource.value = ''
  isTodayFilter.value = false
  currentPage.value = 1
}

// 状态分段控件点击：直接设置状态筛选（不切换，与统计卡片的 toggle 行为区分）
function setStatusFilter(val: string) {
  filterStatus.value = val
  isTodayFilter.value = false
  currentPage.value = 1
}

// 点击统计卡片 = 快速筛选（再次点击同一张 = 取消）
function clickStatCard(key: 'all' | 'completed' | 'running' | 'failed' | 'today') {
  if (key === 'all') {
    filterStatus.value = ''
    isTodayFilter.value = false
  } else if (key === 'today') {
    isTodayFilter.value = !isTodayFilter.value
    if (isTodayFilter.value) filterStatus.value = ''
  } else {
    filterStatus.value = filterStatus.value === key ? '' : key
    isTodayFilter.value = false
  }
  currentPage.value = 1
}

// 卡片是否处于激活态
function isCardActive(key: string): boolean {
  if (key === 'all') return !filterStatus.value && !isTodayFilter.value
  if (key === 'today') return isTodayFilter.value
  return filterStatus.value === key
}

// 下拉框手动切换时，若选了具体状态，自动清除 today 维度
watch(filterStatus, (val) => {
  if (val) isTodayFilter.value = false
})

// 筛选状态变化时同步到 URL query（replace 模式，不产生新历史记录）
watch(
  [filterStatus, filterTarget, filterSource, searchQuery],
  () => {
    const query: any = {}
    if (filterStatus.value) query.status = filterStatus.value
    if (filterTarget.value) query.target = filterTarget.value
    if (filterSource.value) query.source = filterSource.value
    if (searchQuery.value) query.search = searchQuery.value

    router.replace({ query })
  },
  { deep: true }
)

// ── 档位推断（从 sessionId 提取，兼容旧数据无 generationTier 字段） ──
function getTaskTier(task: any): string {
  if (task.generationTier) return task.generationTier
  const parts = (task.sessionId || '').split('-')
  if (parts.length >= 2) {
    if (parts[1] === 'lite') return 'lite'
    if (parts[1] === 'max') return 'max'
  }
  return ''
}

// ── 输入来源识别 ──
function getTaskSource(task: any): 'screenshot' | 'figma' | 'html' | 'traditional' {
  const source = task.metadata?.sourceType || task.sourceType
  if (source === 'screenshot') return 'screenshot'
  if (source === 'figma') return 'figma'
  if (source === 'html') return 'html'
  // 从 sessionId 推断：*-lite-* = 截图，*-max-* = Figma
  const parts = (task.sessionId || '').split('-')
  if (parts.length >= 2) {
    if (parts[1] === 'lite') return 'screenshot'
    if (parts[1] === 'max') return 'figma'
  }
  // 旧版 ml- 前缀 = 截图
  if ((task.sessionId || '').startsWith('ml-')) return 'screenshot'
  return 'traditional'
}

function sourceLabel(source: 'screenshot' | 'figma' | 'html' | 'traditional') {
  const map = { screenshot: '截图', figma: 'Figma', html: 'HTML', traditional: '传统' }
  return map[source]
}

// 生成档位：lite / max
function tierLabel(tier: string) {
  if (!tier) return ''
  const map = { lite: 'Lite', max: 'Max' }
  return map[tier] || tier || ''
}

const filteredTasks = computed(() => {
  let tasks = allTasks.value
  if (filterStatus.value) tasks = tasks.filter((t) => t.status === filterStatus.value)
  if (isTodayFilter.value) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStart = today.getTime()
    tasks = tasks.filter((t) => (t.startTime || 0) >= todayStart)
  }
  if (filterTarget.value) tasks = tasks.filter((t) => t.target === filterTarget.value)
  if (filterSource.value) {
    tasks = tasks.filter((t) => getTaskSource(t) === filterSource.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    // 🏷️ 中文名（displayName）与 componentName 都可搜索
    tasks = tasks.filter((t) => `${t.displayName || ''} ${t.componentName || ''}`.toLowerCase().includes(q))
  }
  const sorted = tasks.slice()
  if (sortBy.value === 'name') {
    const nameOf = (t: any) => t.displayName || t.componentName || ''
    sorted.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'zh'))
  } else if (sortBy.value === 'oldest') {
    sorted.sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
  } else {
    sorted.sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
  }
  return sorted
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredTasks.value.length / pageSize)))
const paginatedTasks = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredTasks.value.slice(start, start + pageSize)
})

const currentPageTaskIds = computed(() => paginatedTasks.value.map((task) => task.sessionId).filter(Boolean))
const isCurrentPageAllSelected = computed(() => {
  const ids = currentPageTaskIds.value
  return ids.length > 0 && ids.every((id) => selectedTaskIds.value.has(id))
})
const isCurrentPageIndeterminate = computed(() => {
  const ids = currentPageTaskIds.value
  const selectedCount = ids.filter((id) => selectedTaskIds.value.has(id)).length
  return selectedCount > 0 && selectedCount < ids.length
})

const stats = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStart = today.getTime()
  return {
    total: allTasks.value.length,
    completed: allTasks.value.filter((t) => t.status === 'completed').length,
    running: allTasks.value.filter((t) => t.status === 'running').length,
    failed: allTasks.value.filter((t) => t.status === 'failed').length,
    today: allTasks.value.filter((t) => (t.startTime || 0) >= todayStart).length
  }
})

// 统计卡片配置（驱动模板 v-for；带语义色与图标，呼应 prototype 概览条）
const statCards = computed(() => [
  {
    key: 'all',
    label: '总任务数',
    value: stats.value.total,
    color: 'brand',
    icon: UnorderedListOutlined,
    hint: '点击：清除所有快速筛选'
  },
  {
    key: 'completed',
    label: '已完成',
    value: stats.value.completed,
    color: 'success',
    icon: CheckCircleOutlined,
    hint: '点击：只看已完成'
  },
  {
    key: 'running',
    label: '运行中',
    value: stats.value.running,
    color: 'running',
    icon: SyncOutlined,
    hint: '点击：只看运行中'
  },
  {
    key: 'failed',
    label: '失败',
    value: stats.value.failed,
    color: 'failed',
    icon: CloseCircleOutlined,
    hint: '点击：只看失败'
  },
  {
    key: 'today',
    label: '今日生成',
    value: stats.value.today,
    color: 'queued',
    icon: ClockCircleOutlined,
    hint: '点击：只看今日生成'
  }
])

// 总览仪表盘：去掉「总任务」卡片，其余 4 张作为状态磁贴
const overviewTiles = computed(() => statCards.value.filter((c) => c.key !== 'all'))

// 完成率（已完成 / 总数）
const completionRate = computed(() => {
  const total = stats.value.total
  if (!total) return 0
  return Math.round((stats.value.completed / total) * 100)
})

// 环形进度条几何（半径 36）
const ringCircumference = 2 * Math.PI * 36
const ringOffset = computed(() => ringCircumference * (1 - completionRate.value / 100))

// ── 工具函数 ──
function typeLabel(target: string) {
  const map: Record<string, string> = { microcode: 'MC', vue3: 'V3', page: '页面' }
  return map[target] || target || '未知'
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    queued: '排队中',
    rate_limited: '配额不足',
    retry_scheduled: '等待重试'
  }
  return map[status] || status
}

function formatTime(ts: number) {
  if (!ts) return '-'
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function reviewTooltip(task: any) {
  const r = task.humanReview
  if (!r) return ''
  const action = r.action === 'passed' ? '人工通过' : '人工警告'
  const reason = r.reason ? `原因：${r.reason}` : '未填写原因'
  return `${action} | ${reason} | ${r.reviewedBy || ''} ${r.reviewedAt ? new Date(r.reviewedAt).toLocaleString() : ''}`
}

function formatDuration(ms?: number) {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}min`
}

/**
 * 主名称：组件中文名 + 组件ID（2026-09-03）。
 * 此前主名称显示「任务号：mc-max-xxx」，长且不直观；组件信息只在副标题。
 * 现主名称=组件名+组件号，任务号降级到副标题（信息不丢、不重复）。
 */
function componentTitle(task: any) {
  const name = task.displayName || task.componentName || '未命名组件'
  const componentId = task.componentId || task.result?.componentId || ''
  if (componentId && componentId !== task.sessionId && componentId !== name) {
    return `${name} · ${componentId}`
  }
  return name
}

function componentInfo(task: any) {
  // 🏷️ 优先组件中文名
  const name = task.displayName || task.componentName || '未命名组件'
  const componentId = task.componentId || task.result?.componentId || ''
  if (componentId && componentId !== task.sessionId && componentId !== name) {
    return `组件：${name} · 组件号：${componentId}`
  }
  return `组件：${name}`
}

function downloadUrl(sessionId: string) {
  return `${baseURL}/phase2/download/${sessionId}`
}

// 🛡️ 2026-09-04：原生 <a :href download> 不带 Token 头 → 生产 Java 401 → Chrome「请先尝试登录」。
// 统一 fetch(带 Token) → Blob → a[download]（utils/download-file.js）。
function downloadTaskZip(task: any) {
  if (!task?.sessionId) return
  const name = `${task.componentId || task.sessionId}.zip`
  void downloadByUrl(downloadUrl(task.sessionId), name)
}

// ── 打开任务详情页（携带当前筛选状态，返回时可恢复） ──
function openTaskDetail(task: any) {
  const query: any = {}
  if (filterStatus.value) query.status = filterStatus.value
  if (filterTarget.value) query.target = filterTarget.value
  if (searchQuery.value) query.search = searchQuery.value
  router.push({ path: `/tasks/${task.sessionId}`, query })
}

function openPlayground(task: any) {
  if (!canOpenTaskPlayground(task)) return
  router.push(buildTaskPlaygroundLocation(task))
}

// ── 直接操作任务（列表上操作）──
async function pauseTaskDirect(sessionId: string) {
  try {
    const resp = await pauseTask(sessionId)
    if (resp?.success) {
      message.success('已暂停')
      await loadTasks()
    } else {
      message.error(resp?.message || '暂停失败')
    }
  } catch (e: any) {
    message.error('暂停失败: ' + (e.message || String(e)))
  }
}

async function resumeTaskDirect(sessionId: string) {
  try {
    const resp = await resumeTask(sessionId)
    if (resp?.success) {
      message.success('已恢复')
      await loadTasks()
    } else {
      message.error(resp?.message || '恢复失败')
    }
  } catch (e: any) {
    message.error('恢复失败: ' + (e.message || String(e)))
  }
}

async function startQueuedTaskDirect(sessionId: string) {
  try {
    const resp = await startQueuedTask(sessionId)
    if (resp?.success) {
      message.success(resp.message || '已触发启动')
      await loadTasks()
    } else {
      message.error(resp?.message || '启动失败')
    }
  } catch (e: any) {
    message.error('启动失败: ' + (e.message || String(e)))
  }
}

async function cancelTaskDirect(sessionId: string) {
  try {
    const resp = await cancelTask(sessionId)
    if (resp?.success) {
      message.success('已取消')
      await loadTasks()
    } else {
      message.error(resp?.message || '取消失败')
    }
  } catch (e: any) {
    message.error('取消失败: ' + (e.message || String(e)))
  }
}

// ── 数据加载 ──
async function loadTasks() {
  loading.value = true
  try {
    const [tasksResp, statsResp] = await Promise.all([
      fetchAllTasks(),
      getQueueStats()
    ])
    if (tasksResp?.success && Array.isArray(tasksResp.data?.tasks)) {
      allTasks.value = tasksResp.data.tasks
      const validIds = new Set(allTasks.value.map((task) => task.sessionId).filter(Boolean))
      updateSelection([...selectedTaskIds.value].filter((id) => validIds.has(id)))
    } else {
      message.warning('加载任务列表失败：响应格式异常')
    }
    if (statsResp?.success && statsResp.data?.stats) {
      queueStats.value = statsResp.data.stats
    }
  } catch (error) {
    console.error('[TaskCenter] 加载任务列表失败:', error)
    message.error('加载任务列表失败：' + (error?.message || '网络错误'))
  } finally {
    loading.value = false
  }
}

// ── 取消排队中的任务 ──
async function cancelQueuedTaskDirect(sessionId: string) {
  try {
    const resp = await cancelQueuedTask(sessionId)
    if (resp?.success) {
      message.success('已取消排队')
      await loadTasks()
    } else {
      message.error(resp?.message || '取消失败')
    }
  } catch (e: any) {
    message.error('取消失败: ' + (e.message || String(e)))
  }
}

function updateSelection(nextIds: Iterable<string>) {
  selectedTaskIds.value = new Set(nextIds)
}

function toggleTaskSelection(sessionId: string) {
  if (!sessionId) return
  const next = new Set(selectedTaskIds.value)
  if (next.has(sessionId)) next.delete(sessionId)
  else next.add(sessionId)
  updateSelection(next)
}

function toggleSelectCurrentPage(event: Event) {
  const checked = (event.target as HTMLInputElement)?.checked
  const next = new Set(selectedTaskIds.value)
  for (const id of currentPageTaskIds.value) {
    if (checked) next.add(id)
    else next.delete(id)
  }
  updateSelection(next)
}

function clearSelection() {
  updateSelection([])
}

async function deleteTask(task: any) {
  const sessionId = task?.sessionId
  if (!sessionId) return

  const taskName = task?.displayName || task?.componentName || '未命名'
  const isActiveTask = task?.status === 'running' || task?.status === 'paused'

  const confirmContent = isActiveTask
    ? `任务「${taskName}」正在执行中。\n\n⚠️ 删除将同时清除：\n   · 任务记录与生成进度\n   · workspace 中已生成的组件代码（原文件）\n\n此操作不可撤销，请确认是否继续？`
    : `即将删除任务「${taskName}」。\n\n⚠️ 删除将同时清除：\n   · 任务记录\n   · workspace 中已生成的组件代码（原文件），删除后无法再下载或预览\n\n此操作不可撤销，请确认是否继续？`

  Modal.confirm({
    title: isActiveTask ? '确认删除任务（含原文件）？' : '确认删除任务（含原文件）？',
    content: confirmContent,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    centered: true,
    onOk: async () => {
      try {
        await apiDeleteTask(sessionId)
        allTasks.value = allTasks.value.filter((t) => t.sessionId !== sessionId)
        const next = new Set(selectedTaskIds.value)
        next.delete(sessionId)
        updateSelection(next)
        message.success('任务已删除')
      } catch {
        message.error('删除失败')
      }
    }
  })
}

function confirmBatchDelete() {
  const ids = [...selectedTaskIds.value]
  if (ids.length === 0) return
  const selectedTasks = allTasks.value.filter((task) => ids.includes(task.sessionId))
  const activeCount = selectedTasks.filter((task) => task.status === 'running' || task.status === 'paused').length
  const title = activeCount > 0 ? '确认批量删除任务（含原文件）？' : '确认批量删除任务（含原文件）？'
  const content = activeCount > 0
    ? `将删除 ${ids.length} 个任务，其中 ${activeCount} 个正在执行或暂停中。\n\n⚠️ 删除将同时清除：\n   · 任务记录与生成进度\n   · workspace 中已生成的组件代码（原文件）\n\n此操作不可撤销，请确认是否继续？`
    : `将删除 ${ids.length} 个任务。\n\n⚠️ 删除将同时清除：\n   · 任务记录\n   · workspace 中已生成的组件代码（原文件），删除后无法再下载或预览\n\n此操作不可撤销，请确认是否继续？`

  Modal.confirm({
    title,
    content,
    okText: `确认删除 ${ids.length} 个任务`,
    okType: 'danger',
    cancelText: '取消',
    centered: true,
    onOk: async () => {
      batchDeleting.value = true
      try {
        const resp = await batchDeleteTasks(ids)
        const respData = resp?.data || {}
        const removedIds = Array.isArray(respData.removed) ? respData.removed : ids
        allTasks.value = allTasks.value.filter((task) => !removedIds.includes(task.sessionId))
        updateSelection([...selectedTaskIds.value].filter((id) => !removedIds.includes(id)))
        if (respData.failed?.length) {
          message.warning(resp?.message || `已删除 ${removedIds.length} 个任务，${respData.failed.length} 个失败`)
        } else {
          message.success(resp?.message || `已删除 ${removedIds.length} 个任务`)
        }
        await loadTasks()
      } catch (e: any) {
        message.error('批量删除失败: ' + (e?.message || String(e)))
      } finally {
        batchDeleting.value = false
      }
    }
  })
}

// ── 生命周期 ──
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  loadTasks()
  // 有运行中任务时自动刷新
  autoRefreshTimer = setInterval(() => {
    const hasRunning = allTasks.value.some((t) => t.status === 'running')
    if (hasRunning) loadTasks()
  }, 5000)
})

onUnmounted(() => {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer)
})
</script>

<style scoped>
.task-center {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 104px);
  min-height: 0;
  overflow: hidden;
  background: var(--bg-page);
}

/* 顶部固定区：页头 + 总览 + 筛选 + 批量，不随列表滚动 */
.tc-top {
  flex: 0 0 auto;
  overflow-x: hidden;
}

/* 可滚动列表区：仅此区域出现滚动条 */
.tc-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 24px 8px;
}
.tc-scroll::-webkit-scrollbar {
  width: 8px;
}
.tc-scroll::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--text-tertiary) 50%, transparent);
  border-radius: 4px;
  border: 2px solid var(--bg-page);
}
.tc-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--text-secondary) 62%, transparent);
}
.tc-scroll::-webkit-scrollbar-track {
  background: transparent;
}

/* ── 页面标题（紧凑化） ── */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  padding: 10px 24px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-default);
}
.header-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.header-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--bg-alt);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}
.header-copy {
  min-width: 0;
}
.page-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.2;
}
.page-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 4px 0 0;
}
.btn-refresh {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
  font-family: inherit;
}
.btn-refresh:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text-primary);
  background: var(--bg-hover);
}
.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 总览仪表盘（紧凑指标条：只留数字+标签，不占首屏） ── */
.tc-overview {
  display: grid;
  grid-template-columns: minmax(0, 240px) minmax(0, 1fr);
  gap: 12px;
  padding: 12px 24px;
  overflow-x: hidden;
}

/* 左侧 Hero：任务总数 + 完成率 */
.tc-hero {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: linear-gradient(
    160deg,
    var(--bg-card) 0%,
    color-mix(in srgb, var(--bg-card) 92%, var(--brand-bg)) 35%,
    color-mix(in srgb, var(--bg-card) 85%, var(--brand-bg)) 70%,
    color-mix(in srgb, var(--bg-card) 78%, var(--brand-bg)) 100%
  );
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.tc-hero:hover {
  border-color: var(--border-strong);
  box-shadow: 0 2px 10px -2px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}
.tc-hero.active {
  border-color: var(--brand);
  box-shadow: 0 2px 10px -2px color-mix(in srgb, var(--brand) 18%, transparent);
}
.tc-ring {
  position: relative;
  width: 56px;
  height: 56px;
  flex: 0 0 auto;
}
.tc-ring svg {
  width: 56px;
  height: 56px;
  transform: rotate(-90deg);
}
.tc-ring-bg {
  fill: none;
  stroke: #e2e8f0;
  stroke-width: 7;
}
.tc-ring-fg {
  fill: none;
  stroke: var(--task-success);
  stroke-width: 7;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.6s ease;
}
.tc-ring-pct {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.tc-ring-pct b {
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  color: var(--task-success);
  letter-spacing: -0.3px;
}
.tc-ring-pct small {
  font-size: 8px;
  color: var(--text-quaternary);
  margin-top: 1px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.tc-hero-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.tc-hero-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.2px;
}
.tc-hero-total {
  font-size: 22px;
  font-weight: 800;
  line-height: 1;
  color: var(--text-primary);
  font-family: 'DIN';
  letter-spacing: -0.5px;
}
.tc-hero-hint {
  font-size: 11px;
  margin-top: 2px;
  color: var(--text-tertiary);
}

/* 右侧状态磁贴 */
.tc-tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.tc-tile {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--bg-card) 0%, color-mix(in srgb, var(--tile-accent) 5%, var(--bg-card)) 100%);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  box-shadow: var(--shadow-sm);
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}
.tc-tile::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--tile-accent, var(--border-default));
}
.tc-tile:hover {
  transform: translateY(-1px);
  border-color: var(--border-strong);
  box-shadow: 0 4px 10px -3px color-mix(in srgb, var(--tile-accent) 40%, transparent);
}
.tc-tile.active {
  background: linear-gradient(135deg, color-mix(in srgb, var(--tile-accent) 14%, var(--bg-card)) 0%, color-mix(in srgb, var(--tile-accent) 6%, var(--bg-card)) 100%);
  border-color: color-mix(in srgb, var(--tile-accent) 60%, var(--border-default));
  box-shadow: 0 3px 10px -4px color-mix(in srgb, var(--tile-accent) 45%, transparent);
}
.tc-tile-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.tc-tile-ic {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  line-height: 1;
  background: color-mix(in srgb, var(--tile-accent) 16%, var(--bg-card));
  color: var(--tile-accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tile-accent) 22%, transparent);
}
.tc-tile-num {
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
  color: var(--text-primary);
  font-family: 'DIN';
  letter-spacing: -0.3px;
}
.tc-tile-name {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
}
/* 各类磁贴语义色 */
.tc-tile.completed {
  --tile-accent: var(--task-success);
}
.tc-tile.running {
  --tile-accent: var(--task-running);
}
.tc-tile.failed {
  --tile-accent: var(--task-failed);
}
.tc-tile.today {
  --tile-accent: var(--task-queued);
}

/* ── 筛选工具栏（浮动卡片风格） ── */
.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  padding: 10px 20px;
  margin: 0 24px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  flex-wrap: wrap;
}
.filter-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.filter-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.filter-select {
  height: 32px;
  padding: 0 28px 0 11px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-full);
  font-size: 12px;
  color: var(--text-primary);
  background: var(--bg-alt) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' fill='none' stroke-width='1.2' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 10px center / 10px;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  font-family: inherit;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.filter-select:hover {
  border-color: var(--border-strong);
}
.filter-select:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 15%, transparent);
}

/* ── 状态分段控件（pill 分段器） ── */
.segmented {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px;
  background: var(--bg-alt);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
.segmented-item {
  height: 28px;
  padding: 0 13px;
  border: none;
  background: transparent;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition:
    color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.12s ease;
}
.segmented-item:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--text-primary) 7%, transparent);
}
.segmented-item.active {
  background: var(--bg-card);
  color: var(--brand);
  box-shadow: 0 1px 5px -1px color-mix(in srgb, var(--brand) 35%, transparent);
  font-weight: 600;
}
.sort-select {
  width: auto;
  flex-shrink: 0;
}
.btn-clear-filter {
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--border-light);
  background: transparent;
  border-radius: var(--radius-full);
  font-size: 12px;
  color: var(--text-tertiary);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.18s ease;
}
.btn-clear-filter:hover {
  color: var(--error-text);
  border-color: color-mix(in srgb, var(--error) 25%, var(--border-default));
  background: color-mix(in srgb, var(--error-bg) 22%, transparent);
}
.search-input {
  height: 32px;
  padding: 0 34px 0 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-full);
  font-size: 12px;
  color: var(--text-primary);
  background: var(--bg-alt) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' viewBox='0 0 24 24'%3E%3Ccircle cx='11' cy='11' r='7' stroke='%23999' stroke-width='2'/%3E%3Cpath d='M16 16l4.5 4.5' stroke='%23999' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 10px center / 14px;
  outline: none;
  width: 200px;
  font-family: inherit;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, width 0.24s ease;
}
.search-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 15%, transparent);
  width: 240px;
  background-color: var(--bg-card);
}
.search-input::placeholder {
  color: var(--text-quaternary);
}

/* ── 批量操作（蓝色强调条） ── */
.batch-bar {
  min-height: 40px;
  margin: 0 24px 14px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--brand) 7%, transparent) 0%, color-mix(in srgb, var(--brand) 3%, transparent) 100%);
  border: 1px solid color-mix(in srgb, var(--brand) 22%, var(--border-default));
  border-left: 3px solid var(--brand);
  border-radius: var(--radius-lg);
  color: var(--text-secondary);
  font-size: 12px;
}
.batch-select-all {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  user-select: none;
  color: var(--text-primary);
  font-weight: 500;
}
.batch-select-all input,
.task-select input {
  width: 15px;
  height: 15px;
  accent-color: var(--brand-cta);
  cursor: pointer;
}
.batch-count {
  color: var(--text-tertiary);
}
.batch-delete-btn,
.batch-clear-btn {
  height: 28px;
  padding: 0 11px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.18s ease;
}
.batch-delete-btn {
  margin-left: auto;
  color: #fff;
  border: 1px solid var(--error);
  background: var(--error);
}
.batch-delete-btn:hover:not(:disabled) {
  box-shadow: 0 2px 8px -2px color-mix(in srgb, var(--error) 50%, transparent);
  transform: translateY(-1px);
}
.batch-delete-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.batch-clear-btn {
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  background: var(--bg-card);
}
.batch-clear-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
  background: var(--bg-hover);
}

/* ── 任务列表 ── */
.task-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}
.task-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-left: 2px solid var(--border-default);
  border-radius: var(--radius-md);
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  cursor: pointer;
  min-width: 0;
  overflow: hidden;
}
.task-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
  box-shadow: 0 1px 6px var(--shadow-sm);
}
.task-card.selected {
  border-color: color-mix(in srgb, var(--brand-cta) 56%, var(--border-default));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand-cta) 18%, transparent);
}
.task-card.completed {
  border-left-color: var(--task-success);
  background: color-mix(in srgb, var(--task-success-bg) 18%, var(--bg-card));
}
.task-card.failed {
  border-left-color: var(--task-failed);
}
.task-card.running {
  border-left-color: var(--task-running);
  background: color-mix(in srgb, var(--task-running-bg) 22%, var(--bg-card));
}
.task-card.queued,
.task-card.rate_limited,
.task-card.retry_scheduled {
  border-left-color: var(--task-queued);
}
.task-card.cancelled {
  border-left-color: var(--task-muted);
}
.task-main {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
}
.task-select {
  width: 18px;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  cursor: pointer;
}
.task-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.task-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.task-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'DIN';
}
.task-subtitle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.task-subtitle {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-type-badge {
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 400;
  flex-shrink: 0;
  border: 1px solid transparent;
  letter-spacing: 0.3px;
  box-shadow: 0 1px 4px rgba(15, 23, 42, .12);
  color: var(--component-vue3-contrast);
}
.task-type-badge.microcode {
  background: var(--component-microcode);
  color: var(--component-microcode-contrast);
}
.task-type-badge.vue3 {
  background: var(--component-vue3);
  color: var(--component-vue3-contrast);
}
.task-type-badge.page {
  background: var(--bg-alt);
  color: var(--text-secondary);
  border-color: var(--border-default);
  box-shadow: none;
}
.task-source-badge {
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
  border: 1px solid transparent;
  letter-spacing: 0;
}
.task-source-badge.screenshot {
  background: color-mix(in srgb, var(--task-queued-bg) 42%, var(--bg-card));
  color: var(--task-queued-text);
  border-color: color-mix(in srgb, var(--task-queued-border) 70%, var(--border-default));
}
.task-source-badge.figma {
  background: color-mix(in srgb, var(--task-success-bg) 42%, var(--bg-card));
  color: var(--task-success-text);
  border-color: color-mix(in srgb, var(--task-success-border) 70%, var(--border-default));
}
.task-source-badge.traditional {
  background: var(--task-muted-bg);
  color: var(--task-muted-text);
  border-color: var(--task-muted-border);
}
/* 来源标签：浅色白底黑线，深色模式反色；来源不再使用状态色 */
.task-source-box {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid var(--source-box-border, #111827);
  background: var(--source-box-bg, #ffffff);
  color: var(--source-box-text, #111827);
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0;
  flex-shrink: 0;
  margin-left: 2px;
}
html[data-theme="dark"] .task-source-box {
  --source-box-bg: #111827;
  --source-box-text: #f8fafc;
  --source-box-border: #f8fafc;
}

/* 生成档位徽章：lite 轻盈/快速，max 高级/完整（能力层级色，非状态色）→ 渐变胶囊 */
.task-tier-badge {
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
  border: 1px solid transparent;
  letter-spacing: 0;
  box-shadow: 0 1px 4px rgba(15, 23, 42, .12);
}
.task-tier-badge.lite {
  background: var(--tier-lite-grad);
  color: var(--tier-lite-text);
}
.task-tier-badge.max {
  background: var(--tier-max-grad);
  color: var(--tier-max-text);
}
.task-meta {
  display: flex;
  align-items: center;
  gap: 7px;
}
.task-status {
  padding: 1px 7px;
  border-radius: var(--radius-xs);
  font-size: 11px;
  font-weight: 600;
  position: relative;
}
/* 运行中：浅绿描边 + 左侧脉动绿点（呼吸灯）— 表达"动"的状态 */
.task-status.running {
  background: color-mix(in srgb, var(--task-running-bg) 54%, var(--bg-card));
  color: var(--task-running-text);
  border: 1px solid var(--task-running-border);
  padding-left: 16px;
}
.task-status.running::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 50%;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--task-running);
  transform: translateY(-50%);
  animation: task-status-pulse 1.6s ease-in-out infinite;
}
@keyframes task-status-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--task-running) 55%, transparent); opacity: 1; }
  50%      { box-shadow: 0 0 0 4px color-mix(in srgb, var(--task-running) 0%, transparent); opacity: .65; }
}
/* 已完成：深绿实心白字 — 表达"已落定"的实心落地感 */
.task-status.completed {
  background: var(--task-success);
  color: #ffffff;
  border: 1px solid color-mix(in srgb, var(--task-success) 65%, #000000);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--task-success) 35%, transparent);
}
.task-status.failed {
  background: color-mix(in srgb, var(--task-failed-bg) 54%, var(--bg-card));
  color: var(--task-failed-text);
  border: 1px solid var(--task-failed-border);
}
.task-status.queued,
.task-status.rate_limited,
.task-status.retry_scheduled {
  background: color-mix(in srgb, var(--task-queued-bg) 54%, var(--bg-card));
  color: var(--task-queued-text);
  border: 1px solid var(--task-queued-border);
}
.task-status.cancelled {
  background: color-mix(in srgb, var(--task-muted-bg) 54%, var(--bg-card));
  color: var(--task-muted-text);
  border: 1px solid var(--task-muted-border);
}
/* 极速通过标记：橙色，区别于绿色「已完成」与人工审核标记 */
.task-status.speed-pass {
  background: var(--warning-bg);
  color: var(--warning);
  border: 1px solid var(--warning-border);
}
.task-time,
.task-duration {
  font-size: 12px;
  color: var(--text-tertiary);
}
.task-error {
  font-size: 12px;
  color: var(--error-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 失败原因内联（跟在时间后面同一行） */
.task-error-inline {
  font-size: 12px;
  color: var(--error-text);
  margin-left: 6px;
  padding-left: 6px;
  border-left: 1.5px solid color-mix(in srgb, var(--error) 30%, transparent);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

/* ── 任务操作按钮（统一紧凑风格） ── */
.task-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
.btn-task {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  min-width: 28px;
  padding: 0 9px;
  background: transparent;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  cursor: pointer;
  text-decoration: none;
  transition: all 0.16s ease;
  font-family: inherit;
  white-space: nowrap;
  flex-shrink: 0;
}
.btn-task:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
  color: var(--text-primary);
}
.btn-task.icon-only {
  width: 28px;
  padding: 0;
  font-size: 13px;
}
/* 下载 */
.btn-task.neutral:hover {
  color: var(--brand);
  border-color: color-mix(in srgb, var(--brand) 35%, var(--border-default));
}
/* Playground（黑色强调） */
.btn-task.playground {
  gap: 4px;
  height: 28px;
  padding: 0 13px;
  color: #fff;
  background: #1a1a1a;
  border-color: #2a2a2a;
  font-weight: 600;
  font-size: 11.5px;
}
.btn-task.playground:hover {
  background: #333;
  border-color: #555;
}
/* 开始 / 恢复（品牌色） */
.btn-task.brand {
  color: var(--brand);
  border-color: color-mix(in srgb, var(--brand) 30%, var(--border-default));
}
.btn-task.brand:hover {
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  border-color: var(--brand);
}
/* 暂停（琥珀色） */
.btn-task.warn {
  color: var(--task-queued-text);
  border-color: color-mix(in srgb, var(--task-queued-border) 50%, var(--border-default));
}
.btn-task.warn:hover {
  background: color-mix(in srgb, var(--task-queued-bg) 35%, transparent);
  border-color: var(--task-queued-border);
}
/* 取消 / 删除（红色） */
.btn-task.danger,
.btn-delete {
  color: var(--error-text);
  border-color: color-mix(in srgb, var(--error) 22%, var(--border-default));
}
.btn-task.danger:hover,
.btn-delete:hover {
  color: var(--error);
  background: color-mix(in srgb, var(--error-bg) 30%, transparent);
  border-color: color-mix(in srgb, var(--error) 40%, var(--border-default));
}
.btn-delete.disabled {
  opacity: 0.38;
  color: var(--text-disabled);
  border-color: transparent;
  cursor: not-allowed;
  background: transparent;
}
.btn-delete.disabled:hover {
  background: transparent;
  border-color: transparent;
  color: var(--text-disabled);
  transform: none;
}
/* 人工审核 / 撤回审核（小文字胶囊） */
.btn-task.review {
  height: 26px;
  padding: 0 10px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--task-success-text);
  border-color: var(--task-success-border);
  background: color-mix(in srgb, var(--task-success-bg) 25%, transparent);
}
.btn-task.review:hover {
  background: color-mix(in srgb, var(--task-success-bg) 45%, transparent);
  border-color: var(--task-success-border);
  color: var(--task-success-text);
}
.btn-task.revoke {
  height: 26px;
  padding: 0 10px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-secondary);
  border-color: var(--border-light);
}

/* ── 空状态 ── */
.task-empty {
  text-align: center;
  padding: 64px 24px;
}
.task-empty .empty-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 16px;
  opacity: 0.5;
}
.task-empty h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
}
.task-empty p {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
}
.empty-link {
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
}
.empty-link:hover {
  text-decoration: underline;
}

/* ── 分页 ── */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-top: 24px;
  padding: 16px 0;
}
.page-btn {
  padding: 8px 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.page-btn:hover:not(:disabled) {
  border-color: var(--brand);
  color: var(--brand);
}
.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.page-info {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

@media (max-width: 900px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    width: 100%;
  }

  .btn-refresh {
    width: 100%;
    justify-content: center;
  }

  .tc-overview {
    grid-template-columns: 1fr;
  }

  .tc-tiles {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* ── 人工审核按钮 ── */
.btn-task.review {
  color: var(--task-success-text);
  background: var(--bg-card);
  border-color: var(--task-success-border);
}

.btn-task.review:hover {
  color: var(--task-success-text);
  border-color: color-mix(in srgb, var(--task-success-border) 72%, var(--border-default));
  background: color-mix(in srgb, var(--task-success-bg) 40%, var(--bg-card));
}

.btn-task.revoke {
  color: var(--task-queued-text);
  background: var(--bg-card);
  border-color: var(--task-queued-border);
}

.btn-task.revoke:hover {
  color: var(--task-queued-text);
  border-color: color-mix(in srgb, var(--task-queued-border) 72%, var(--border-default));
  background: color-mix(in srgb, var(--task-queued-bg) 40%, var(--bg-card));
}

/* ── 人工审核对话框 ── */
.review-modal {
  padding: 8px 0;
}

.review-task-info {
  background: var(--bg-hover);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  margin-bottom: 20px;
}

.review-task-info p {
  margin: 4px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.review-task-info strong {
  color: var(--text-primary);
  font-weight: 600;
}

.review-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-item label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.form-item .required {
  color: var(--error);
}

.form-item .optional {
  color: var(--text-tertiary);
  font-weight: 400;
  font-size: 12px;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.radio-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition: all 0.2s;
}

.radio-item:hover {
  background: var(--bg-hover);
  border-color: var(--brand);
}

.radio-item input[type="radio"] {
  margin-top: 2px;
  cursor: pointer;
}

.radio-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.radio-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: 8px;
}

.review-textarea {
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-card);
  resize: vertical;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}

.review-textarea:focus {
  border-color: var(--brand);
}

.review-textarea::placeholder {
  color: var(--text-tertiary);
}
</style>
