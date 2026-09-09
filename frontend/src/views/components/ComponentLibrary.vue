<template>
  <div class="component-library">
    <!-- 头部 -->
    <header class="library-header">
      <div class="header-left">
        <h1>组件库</h1>
        <!-- 可见范围 Tab：我的 / 公共组件池 / 全部 -->
        <div class="scope-tabs">
          <button
            v-for="tab in scopeTabs"
            :key="tab.value"
            class="scope-tab"
            :class="{ active: activeScope === tab.value }"
            @click="switchScope(tab.value)"
          >{{ tab.label }}</button>
        </div>
        <span class="total-count">({{ totalComponents }} 个组件)</span>
      </div>

      <div class="header-right">
        <!-- 搜索框 -->
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索组件..."
          class="search-input"
          @input="handleSearch"
        />

        <select v-model="sortBy" class="filter-select" @change="handleSortChange">
          <option value="lastEdited">最近编辑</option>
          <option value="created">创建时间</option>
          <option value="name">名称</option>
          <option value="shared">最近发布</option>
        </select>

        <!-- 批量管理（公共池为平台级范围，隐藏批量删除） -->
        <template v-if="batchMode && activeScope !== 'public'">
          <button
            class="batch-btn"
            @click="selectAll"
          >全选</button>
          <button
            class="batch-btn"
            @click="selectedIds.clear()"
          >取消</button>
          <button
            class="batch-btn batch-delete-btn"
            :disabled="selectedIds.size === 0 || batchDeleting"
            @click="batchDelete"
          >删除 ({{ selectedIds.size }})</button>
          <button
            class="batch-btn"
            @click="exitBatchMode"
          >完成</button>
        </template>
        <button
          v-else-if="activeScope !== 'public'"
          class="batch-btn"
          @click="enterBatchMode"
        >批量管理</button>
      </div>
    </header>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button @click="loadComponents" class="retry-btn">重试</button>
    </div>

    <!-- 组件内容：公共池用表格，我的/全部保留卡片网格 -->
    <div v-else-if="components.length > 0" class="component-list-area">
      <!-- ══ 公共组件池：表格视图 ══ -->
      <table v-if="activeScope === 'public'" class="pool-table">
        <thead>
          <tr>
            <th class="col-thumb"></th>
            <th class="col-name">组件名</th>
            <th class="col-type">组件类型</th>
            <th class="col-code">组件编码</th>
            <th class="col-spec">组件规格</th>
            <th class="col-group">所属群组</th>
            <th class="col-time">生产时间</th>
            <th class="col-provider">上传者</th>
            <th class="col-time">上池时间</th>
            <th class="col-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="component in components"
            :key="component._id"
            class="pool-row"
          >
            <td class="col-thumb">
              <div class="thumb-wrap">
                <img
                  v-if="!previewError[component._id]"
                  :src="getCardPreviewUrl(component)"
                  class="thumb-img"
                  loading="lazy"
                  alt="预览"
                  @load="onPreviewLoaded(component._id)"
                  @error="onPreviewError(component._id)"
                />
                <span v-else class="thumb-fallback">无预览</span>
              </div>
            </td>
            <td class="col-name">
              <div class="row-name" :title="component.name">{{ component.name }}</div>
              <div class="row-desc" v-if="component.description && component.description !== component.name">
                {{ component.description }}
              </div>
            </td>
            <td class="col-type">
              <span class="pub-type-chip" :class="componentTypeClass(component)">
                {{ componentTypeClass(component) === 'vue3' ? 'Vue3' : '微码' }}
              </span>
            </td>
            <td class="col-code">
              <span class="code-text" :title="getBusinessComponentId(component)">
                {{ getBusinessComponentId(component).slice(0, 20) }}{{ getBusinessComponentId(component).length > 20 ? '…' : '' }}
              </span>
              <button class="copy-btn" title="复制组件编码" @click.stop="copyComponentCode(component)">⧉</button>
            </td>
            <td class="col-spec">{{ componentModeText(component) }}</td>
            <td class="col-group"><span :title="groupText(component).title">{{ groupText(component).label }}</span></td>
            <td class="col-time">{{ formatDateTime(component.createdAt) }}</td>
            <td class="col-provider">{{ providerName(component) }}</td>
            <td class="col-time">{{ component.sharedAt ? formatDateTime(component.sharedAt) : '—' }}</td>
            <td class="col-actions" @click.stop>
              <button class="row-act" title="下载 ZIP" @click="downloadComponentZip(component)">
                <DownloadOutlined class="row-act-icon" />
                <span>下载</span>
              </button>
              <button class="row-act" title="预览" @click="openPreview(component)">
                <EyeOutlined class="row-act-icon" />
                <span>预览</span>
              </button>
              <template v-if="isOwnComponent(component)">
                <button
                  class="row-act"
                  title="从公共池下架"
                  :disabled="publishingId === component._id"
                  @click="unpublishComponentConfirm(component)"
                >
                  <StopOutlined class="row-act-icon" />
                  <span>下架</span>
                </button>
                <button
                  class="row-act row-act-danger"
                  title="删除"
                  @click="deleteComponentConfirm(component)"
                >
                  <DeleteOutlined class="row-act-icon" />
                  <span>删除</span>
                </button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 我的/全部：卡片网格 -->
      <div v-else class="components-grid">
      <div
        v-for="component in components"
        :key="component._id"
        class="component-card"
        :class="{ 'selected': selectedIds.has(component._id), 'batch-mode': batchMode, [componentTypeClass(component)]: true }"
        :data-component-id="component._id"
        @click="onCardClick(component)"
      >
        <!-- 批量选择复选框：非自己的组件禁勾（公共池删除仅限提供者） -->
        <div v-if="batchMode" class="card-checkbox" @click.stop>
          <input
            type="checkbox"
            :checked="selectedIds.has(component._id)"
            :disabled="!isOwnComponent(component)"
            @change="toggleSelect(component._id)"
          />
        </div>
        <!-- 预览缩略图 -->
        <div class="card-preview">
          <!-- 标准预览图。图片进入视口附近才加载，不在列表页运行组件 iframe。 -->
          <img
            v-if="visiblePreviewIds.has(component._id) && !previewError[component._id]"
            :src="getCardPreviewUrl(component)"
            class="preview-image"
            loading="lazy"
            alt="组件预览图"
            @load="onPreviewLoaded(component._id)"
            @error="onPreviewError(component._id)"
          />

          <div v-else-if="!previewError[component._id]" class="preview-placeholder">
            <span>滚动后加载预览</span>
          </div>

          <div
            v-if="previewLoading[component._id] !== false && visiblePreviewIds.has(component._id) && !previewError[component._id]"
            class="preview-loading"
          >
            <div class="preview-spinner"></div>
            <span class="preview-loading-text">加载预览中...</span>
          </div>

          <!-- 错误占位图 -->
          <div
            v-if="previewError[component._id]"
            class="preview-error"
          >
            <div class="error-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <span class="error-text">预览加载失败</span>
            <button class="retry-btn-small" @click.stop="retryPreview(component._id)">重试</button>
          </div>

          <!-- 类型标签 -->
          <span class="type-badge" :class="componentTypeClass(component)">
            {{ componentTypeClass(component) === 'vue3' ? 'Vue3' : '微码' }}
          </span>

          <!-- 公共组件池徽标 -->
          <span v-if="component.visibility === 'public'" class="public-badge">公共</span>

          <div class="quality-panel">
            <span class="quality-score">{{ formatQualityScore(component) }}</span>
            <span class="quality-gate" :class="qualityGateClass(component)">{{ qualityGateText(component) }}</span>
          </div>
        </div>

        <!-- 组件信息 -->
        <div class="card-info">
          <h3 class="component-name" :title="component.name">{{ component.name }}</h3>
          <p class="component-meta">
            <span class="creator">{{ component.creatorId?.username || '未知' }}</span>
            <span class="time">编辑于 {{ formatTime(component.updatedAt) }}</span>
          </p>
          <div class="quality-flags">
            <span :class="['quality-flag', passClass(component.runtimePass)]">运行 {{ passText(component.runtimePass) }}</span>
            <span :class="['quality-flag', passClass(component.visualPass)]">视觉 {{ passText(component.visualPass) }}</span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="card-actions" @click.stop>
          <button @click="openInPlayground(component)" class="action-btn icon-tooltip" data-tooltip="Playground" aria-label="Playground">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          </button>
          <button @click="downloadComponentZip(component)" class="action-btn icon-tooltip" data-tooltip="下载" aria-label="下载">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <!-- 发布到公共池：仅自己的私有组件显示 -->
          <button
            v-if="isOwnComponent(component) && component.visibility !== 'public'"
            @click="publishComponentConfirm(component)"
            class="action-btn icon-tooltip"
            data-tooltip="发布到公共池"
            aria-label="发布到公共池"
            :disabled="publishingId === component._id"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </button>
          <!-- 下架：仅自己的已发布组件显示 -->
          <button
            v-if="isOwnComponent(component) && component.visibility === 'public'"
            @click="unpublishComponentConfirm(component)"
            class="action-btn icon-tooltip"
            data-tooltip="从公共池下架"
            aria-label="从公共池下架"
            :disabled="publishingId === component._id"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          </button>
          <button v-if="isOwnComponent(component)" @click="editComponent(component)" class="action-btn icon-tooltip" data-tooltip="编辑" aria-label="编辑">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button v-if="isOwnComponent(component)" @click="deleteComponentConfirm(component)" class="action-btn danger icon-tooltip" data-tooltip="删除" aria-label="删除">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>
      </div><!-- /.components-grid -->
    </div><!-- /.component-list-area -->

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <p>{{ activeScope === 'public' ? '公共组件池暂无组件' : '暂无组件' }}</p>
      <button v-if="activeScope !== 'public'" @click="$router.push('/generator')" class="create-btn">
        创建第一个组件
      </button>
    </div>

    <div v-if="components.length > 0" ref="loadMoreSentinel" class="load-more-sentinel">
      <span v-if="loadingMore">继续加载中...</span>
      <span v-else-if="hasMore">向下滚动加载更多</span>
      <span v-else>已加载全部组件</span>
    </div>

    <!-- 推送到公共池弹窗 -->
    <PublishToPoolModal
      :open="Boolean(publishTarget)"
      :component="publishTarget"
      :submitting="publishingId === publishTarget?._id"
      @close="publishTarget = null"
      @ok="onPublishOk"
    />
  </div>
</template>

<script setup lang="ts">
// 导入
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  listComponents,
  deleteComponent,
  batchDeleteComponents,
  unpublishComponent,
  getVue3PreviewUrl,
  getMcPreviewUrl,
  type Component,
} from '@/api/component'
import { resolveComponentType } from '@/utils/task-actions'
import { publishToPublicPool } from '@/utils/component-pool'
import PublishToPoolModal from '@/components/PublishToPoolModal.vue'
import { useUserStore } from '@/store'
import { message, Modal } from 'ant-design-vue'
import { DownloadOutlined, EyeOutlined, StopOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import http from '@/core/http'

const router = useRouter()
const route = useRoute()

// 状态
const components = ref<Component[]>([])
const loading = ref(false)
const error = ref('')

// 每个组件预览图的加载状态 { [componentId]: boolean }
const previewLoading = ref<Record<string, boolean>>({})

// 预览错误状态 { [componentId]: boolean }
const previewError = ref<Record<string, boolean>>({})

// 进入视口附近的卡片才会真正请求标准预览图
const visiblePreviewIds = ref<Set<string>>(new Set())
const loadMoreSentinel = ref<HTMLElement | null>(null)
let previewObserver: IntersectionObserver | null = null
let loadMoreObserver: IntersectionObserver | null = null

// 查询参数
const searchQuery = ref('')
const sortBy = ref<'lastEdited' | 'created' | 'name' | 'shared'>('shared')

// 可见范围 Tab：public=公共组件池（默认）；mine=我的组件
type ScopeValue = 'mine' | 'public' | 'all'
const scopeTabs: Array<{ value: ScopeValue; label: string }> = [
  { value: 'public', label: '公共组件池' },
  { value: 'mine', label: '我的组件' },
]
const activeScope = ref<ScopeValue>('public')

// 发布/下架进行中的组件 id（防重复点击）
const publishingId = ref('')
// 待发布的组件（弹窗打开即赋值，确认后发布）
const publishTarget = ref<Component | null>(null)

const userStore = useUserStore()

/** 是否当前用户自己的组件（creatorId 为 populate 后的对象） */
function isOwnComponent(component: Component): boolean {
  const myId = (userStore.userInfo as any)?.id || (userStore.userInfo as any)?._id
  const creatorId = (component.creatorId as any)?._id || (component.creatorId as any)
  return Boolean(myId && creatorId && String(creatorId) === String(myId))
}

function switchScope(scope: ScopeValue) {
  if (activeScope.value === scope) return
  activeScope.value = scope
  exitBatchMode()
  // 公共池默认按「最近发布」排序；其余范围回到「最近编辑」
  sortBy.value = scope === 'public' ? 'shared' : 'lastEdited'
  loadComponents(true)
}

// 发布到公共组件池（弹窗确认，名称可改、类型带入）
function publishComponentConfirm(component: Component) {
  publishTarget.value = component
}

async function onPublishOk(payload: { name: string }) {
  const record = publishTarget.value
  if (!record) return
  publishingId.value = record._id
  try {
    await publishToPublicPool(record, payload)
    publishTarget.value = null
    loadComponents(true)
  } catch (err: any) {
    message.error(err.response?.data?.message || '发布失败')
  } finally {
    publishingId.value = ''
  }
}

// 从公共组件池下架（个人副本保留）
function unpublishComponentConfirm(component: Component) {
  Modal.confirm({
    title: '从公共组件池下架',
    content: `确定将组件"${component.name}"从公共组件池下架吗？下架后仅自己可见。`,
    okText: '确认下架',
    cancelText: '取消',
    centered: true,
    onOk: async () => {
      publishingId.value = component._id
      try {
        await unpublishComponent(component._id)
        loadComponents(true)
      } catch (err: any) {
        message.error(err.response?.data?.message || '下架失败')
      } finally {
        publishingId.value = ''
      }
    },
  })
}
// ── 公共池表格辅助 ──
/** 组件规格：从业务组件编码前缀提取生成模式 Max / Lite（mc-max-* / mc-lite-* 等同理） */
function componentModeText(component: Component): string {
  const id = getBusinessComponentId(component).toLowerCase()
  if (id.includes('lite')) return 'Lite'
  if (id.includes('max')) return 'Max'
  return '—'
}

/** 具体日期时间：YYYY-MM-DD HH:mm:ss（含秒） */
function formatDateTime(dateString: string): string {
  const d = new Date(dateString)
  if (isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 上传者/提供者显示名 */
function providerName(component: Component): string {
  const c = component.creatorId as any
  return c?.username || c?.name || c?._id?.toString().slice(-6) || '未知'
}

/** 复制组件编码 */
async function copyComponentCode(component: Component) {
  const code = getBusinessComponentId(component)
  try {
    await navigator.clipboard.writeText(code)
    message.success(`已复制组件编码: ${code}`)
  } catch {
    message.error(`复制失败，组件编码: ${code}`)
  }
}

/** 所属群组显示：优先 populate 后的 groupName，回退短码（全码 tooltip） */
function groupText(component: Component): { label: string; title: string } {
  if (component.groupName) {
    return { label: component.groupName, title: component.groupName }
  }
  const gid = String(component.groupId || '')
  return { label: gid ? `组 ${gid.slice(-6)}` : '—', title: gid }
}
const currentPage = ref(1)
const pageSize = 12
const totalComponents = ref(0)
const totalPages = ref(0)
const loadingMore = ref(false)
const hasMore = ref(false)

// 批量管理模式
const batchMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const batchDeleting = ref(false)

function getBusinessComponentId(component: Component): string {
  return component.componentId || component.metadata?.componentId || component.metadata?.sessionId || component._id
}

function getComponentTarget(component: Component): 'vue3' | 'microcode' {
  const target = component.target || component.metadata?.target
  const type = component.metadata?.type
  if (target === 'vue3' || type === 'vue3') return 'vue3'
  if (target === 'microcode' || type === 'phase2' || type === 'microcode') return 'microcode'

  // 历史数据兜底：只在没有 target/type 时使用前缀（单一真相源 resolveComponentType）。
  const cid = getBusinessComponentId(component)
  return resolveComponentType(cid) || 'microcode'
}

// 组件库卡片只加载标准截图，不运行 iframe 预览。
function getCardPreviewUrl(component: Component): string {
  if (component.previewUrl) return component.previewUrl
  const componentId = getBusinessComponentId(component)
  return `/api/component/${encodeURIComponent(componentId)}/file?path=resources/images/mc-preview.png&raw=1`
}

// 统一判定组件类型 class（vue3 = 普通组件，其余 = 微码组件）
function componentTypeClass(component: Component): 'vue3' | 'phase2' {
  return getComponentTarget(component) === 'vue3' ? 'vue3' : 'phase2'
}

// 加载组件列表。reset=true 用于搜索/筛选重载；否则追加下一页。
async function loadComponents(reset = true) {
  if (reset) {
    loading.value = true
    currentPage.value = 1
    components.value = []
    previewLoading.value = {}
    previewError.value = {}
    visiblePreviewIds.value = new Set()
  } else {
    if (loadingMore.value || !hasMore.value) return
    loadingMore.value = true
  }
  error.value = ''

  try {
    // 所有 scope 都不按当前群组过滤：
    // - public/all 是平台级范围
    // - mine 应展示用户跨所有群组创建的组件，不应被 currentGroupId 限制
    const groupId = undefined
    const pageToLoad = reset ? 1 : currentPage.value + 1

    const result = await listComponents({
      groupId,
      search: searchQuery.value || undefined,
      scope: activeScope.value,
      sortBy: sortBy.value,
      page: pageToLoad,
      pageSize,
    })

    components.value = reset ? result.components : [...components.value, ...result.components]
    currentPage.value = result.page
    totalComponents.value = result.total
    totalPages.value = result.totalPages
    hasMore.value = result.page < result.totalPages

    const loadingMap: Record<string, boolean> = reset ? {} : { ...previewLoading.value }
    result.components.forEach((c: Component) => {
      loadingMap[c._id] = true
    })
    previewLoading.value = loadingMap
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      // 门户内刷新父页面重新鉴权（登录页已移除，门户鉴权模式）
      if (window.parent !== window && typeof window.parent.getToken === 'function') {
        window.parent.location.reload()
        return
      }
      // 非门户场景：登录页已移除，仅回落错误提示，不再跳转登录页
      return
    }

    error.value = err.response?.data?.message || '加载失败，请重试'
    console.error('加载组件列表失败:', err)
  } finally {
    loading.value = false
    loadingMore.value = false
    // ⚠️ 必须等 loading=false 渲染完卡片 DOM 后再 observe：
    // 卡片区是 v-else-if="components.length > 0"（loading 时不渲染），
    // 若在 loading=true 的 nextTick 里 observe，querySelectorAll 拿到空集合，
    // IntersectionObserver 永远不触发 → 所有卡片停留在「滚动后加载预览」占位。
    await nextTick()
    observePreviewCards()
    observeLoadMore()
  }
}

// 搜索防抖
let searchTimeout: number
function handleSearch() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    loadComponents(true)
  }, 300)
}

// 排序变化
function handleSortChange() {
  loadComponents(true)
}

// 打开组件详情
function openComponent(component: Component) {
  router.push(`/components/${component._id}`)
}

// 直接在独立预览页打开组件（走 /preview 运行时，微码/Vue3 按类型分流）
function openPreview(component: Component) {
  const sid = getBusinessComponentId(component)
  const gid = String(component.groupId || '')
  const isVue3 = getComponentTarget(component) === 'vue3'
  const url = isVue3
    ? getVue3PreviewUrl(gid, sid)
    : getMcPreviewUrl(sid) + `&groupId=${encodeURIComponent(gid)}`
  window.open(url, '_blank')
}

// 卡片点击（批量模式下切换选择）
function onCardClick(component: Component) {
  if (batchMode.value) {
    toggleSelect(component._id)
  } else {
    openComponent(component)
  }
}

// 批量管理模式
function enterBatchMode() {
  batchMode.value = true
  selectedIds.value = new Set()
}

function exitBatchMode() {
  batchMode.value = false
  selectedIds.value = new Set()
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedIds.value = next
}

function selectAll() {
  // 公共池/全部范围下只全选自己的组件（删除权限仅提供者）
  selectedIds.value = new Set(components.value.filter(c => isOwnComponent(c)).map(c => c._id))
}

async function batchDelete() {
  if (selectedIds.value.size === 0) return
  const count = selectedIds.value.size

  Modal.confirm({
    title: `批量删除 ${count} 个组件`,
    content: `确定要删除选中的 ${count} 个组件吗？此操作不可恢复。`,
    okText: `确认删除 ${count} 个`,
    okType: 'danger',
    cancelText: '取消',
    centered: true,
    onOk: async () => {
      batchDeleting.value = true
      try {
        const result = await batchDeleteComponents([...selectedIds.value])
        message.success(result.message)
        exitBatchMode()
        loadComponents(true)
      } catch (err: any) {
        message.error(err.response?.data?.message || '批量删除失败')
      } finally {
        batchDeleting.value = false
      }
    },
  })
}

// 编辑组件
function editComponent(component: Component) {
  // @deferred v2: 编辑组件 — 打开编辑对话框或跳转编辑页，当前仅 console.log 占位
  console.log('编辑组件:', component)
}

function observePreviewCards() {
  if (typeof IntersectionObserver === 'undefined') {
    visiblePreviewIds.value = new Set(components.value.map(c => c._id))
    return
  }
  if (!previewObserver) {
    previewObserver = new IntersectionObserver((entries) => {
      const next = new Set(visiblePreviewIds.value)
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        const id = (entry.target as HTMLElement).dataset.componentId
        if (id) next.add(id)
        previewObserver?.unobserve(entry.target)
      })
      visiblePreviewIds.value = next
    }, { rootMargin: '360px 0px' })
  }
  document.querySelectorAll<HTMLElement>('.component-card[data-component-id]').forEach((card) => {
    const id = card.dataset.componentId
    if (id && !visiblePreviewIds.value.has(id)) previewObserver?.observe(card)
  })
}

function observeLoadMore() {
  if (typeof IntersectionObserver === 'undefined' || !loadMoreSentinel.value) return
  if (!loadMoreObserver) {
    loadMoreObserver = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) loadComponents(false)
    }, { rootMargin: '640px 0px' })
  }
  loadMoreObserver.disconnect()
  loadMoreObserver.observe(loadMoreSentinel.value)
}

// 预览加载错误
function onPreviewError(componentId: string) {
  previewError.value[componentId] = true
  previewLoading.value[componentId] = false
}

// 重试预览
function retryPreview(componentId: string) {
  previewError.value[componentId] = false
  previewLoading.value[componentId] = true
  const next = new Set(visiblePreviewIds.value)
  next.delete(componentId)
  visiblePreviewIds.value = next
  nextTick(() => {
    const restored = new Set(visiblePreviewIds.value)
    restored.add(componentId)
    visiblePreviewIds.value = restored
  })
}

// 删除组件确认
function deleteComponentConfirm(component: Component) {
  Modal.confirm({
    title: '删除组件',
    content: `确定要删除组件"${component.name}"吗？此操作不可恢复。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    centered: true,
    onOk: async () => {
      try {
        await deleteComponent(component._id)
        message.success('删除成功')
        loadComponents(true)
      } catch (err: any) {
        message.error(err.response?.data?.message || '删除失败')
      }
    },
  })
}

// 预览图加载完成
function onPreviewLoaded(componentId: string) {
  previewLoading.value[componentId] = false
}

// 打开Playground。Playground 是 workspace 语义，必须使用业务组件号。
function openInPlayground(component: Component) {
  const componentId = getBusinessComponentId(component)
  const target = getComponentTarget(component)
  router.push({
    path: `/demo/${componentId}`,
    query: { type: target === 'vue3' ? 'vue3' : 'microcode' },
  })
}

// 下载组件ZIP。下载是 workspace 语义，必须使用业务组件号。
async function downloadComponentZip(component: Component) {
  try {
    const componentId = getBusinessComponentId(component)
    const blob = await http.download(`/api/demo/download/${componentId}`)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${componentId}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err: any) {
    message.error(err.message || '下载失败')
  }
}

function formatQualityScore(component: Component) {
  return typeof component.qualityScore === 'number' ? `${Math.round(component.qualityScore)}分` : '未评分'
}

function qualityGateText(component: Component) {
  if (component.qualityGate === 'passed') return '质量通过'
  if (component.qualityGate === 'failed') return '失败'
  return '需优化'
}

function qualityGateClass(component: Component) {
  if (component.qualityGate === 'passed') return 'passed'
  if (component.qualityGate === 'failed') return 'failed'
  return 'warned'
}

function passText(value?: boolean) {
  if (value === true) return '通过'
  if (value === false) return '未过'
  return '未知'
}

function passClass(value?: boolean) {
  if (value === true) return 'passed'
  if (value === false) return 'failed'
  return 'unknown'
}

// 格式化时间
function formatTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`

  return date.toLocaleDateString('zh-CN')
}

// 初始化
onMounted(() => {
  loadComponents(true)
})

onBeforeUnmount(() => {
  previewObserver?.disconnect()
  loadMoreObserver?.disconnect()
  clearTimeout(searchTimeout)
})
</script>

<style scoped>
.component-library {
  padding: 0;
  min-height: 100%;
}

.library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-default);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 可见范围 Tab（我的 / 公共组件池 / 全部） */
.scope-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  background: var(--bg-page, #f3f4f6);
  border-radius: 999px;
}

.scope-tab {
  padding: 5px 14px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.scope-tab:hover {
  color: var(--text-primary, #111827);
}

.scope-tab.active {
  background: var(--bg-card, #ffffff);
  color: var(--text-primary, #111827);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.header-left h1 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.total-count {
  font-size: 13px;
  color: var(--text-secondary);
}

.header-right {
  display: flex;
  gap: 12px;
}

.search-input {
  padding: 6px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 13px;
  width: 180px;
  background: var(--bg-card);
  color: var(--text-primary);
  transition: border-color 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--brand);
}

.filter-select {
  padding: 6px 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 13px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.2s;
}

.filter-select:hover {
  border-color: var(--brand);
}

/* 批量管理按钮 */
.batch-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 13px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.batch-btn:hover {
  border-color: var(--brand);
  color: var(--brand);
}
.batch-delete-btn {
  background: var(--error-bg, #fff1f0);
  border-color: var(--error-border, #ffa39e);
  color: var(--error);
}
.batch-delete-btn:hover:not(:disabled) {
  background: var(--error);
  color: #fff;
  border-color: var(--error);
}
.batch-delete-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 加载/错误状态 */
.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-secondary);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-light);
  border-top: 3px solid var(--brand);
  border-radius: var(--radius-full);
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.retry-btn,
.create-btn {
  margin-top: 16px;
  padding: 8px 20px;
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.retry-btn:hover,
.create-btn:hover {
  background: var(--button-primary-bg-hover);
}

/* 组件列表区：公共池表格在卡片样式前定义，无冲突 */
.component-list-area {
  margin: 16px 20px 0;
}

/* ══ 公共组件池表格 ══ */
.pool-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  overflow: hidden;
  font-size: 12px;
  table-layout: fixed;
}
.pool-table thead th {
  text-align: left;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  background: #f8fafc;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}
.pool-table tbody td {
  padding: 6px 12px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
  overflow: hidden;
}
.pool-row {
  transition: background 0.12s;
}
.pool-row:hover {
  background: #f8fafc;
}
.pool-row:last-child td {
  border-bottom: none;
}
.col-thumb { width: 64px; }
.col-name { width: 26%; }
.col-type { width: 88px; }
.col-code { width: 190px; }
.col-spec { width: 100px; }
.col-group { width: 110px; }
.col-time { width: 120px; }
.col-provider { width: 100px; }
.col-status { width: 130px; }
.col-actions { width: 300px; text-align: left; white-space: nowrap; }
.thumb-wrap {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  border: 1px solid var(--border-default);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
}
.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-fallback {
  font-size: 11px;
  color: #9ca3af;
}
.row-name {
  font-weight: 600;
  color: var(--text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-desc {
  margin-top: 2px;
  font-size: 12px;
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pub-type-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.pub-type-chip.vue3 {
  background: #e6f7f0;
  color: #0a7d4f;
  border: 1px solid #a7e3c9;
}
.pub-type-chip.phase2 {
  background: #e8f1fe;
  color: #1c64c8;
  border: 1px solid #b9d4f8;
}
.code-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #374151;
}
.copy-btn {
  margin-left: 6px;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 5px;
  color: #6b7280;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 2px 5px;
  vertical-align: middle;
}
.copy-btn:hover {
  color: var(--brand);
  border-color: var(--brand);
}
.row-status {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.status-chip {
  display: inline-flex;
  align-self: flex-start;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.status-flags {
  display: inline-flex;
  gap: 8px;
  font-size: 11px;
  color: #9ca3af;
}
.sf.pass-true { color: #16a34a; }
.sf.pass-false { color: #dc2626; }
.sf.pass-unknown { color: #9ca3af; }
.row-act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  border-radius: 8px;
  color: #374151;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.4;
  padding: 4px 8px;
  margin-right: 6px;
  vertical-align: middle;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.row-act-icon {
  font-size: 14px;
  line-height: 1;
}
.row-act:hover:not(:disabled) {
  color: #3b82f6;
  border-color: #3b82f6;
  background: #eff6ff;
}
.row-act:active:not(:disabled) {
  color: #2563eb;
  border-color: #2563eb;
}
.row-act:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.row-act-danger {
  color: #dc2626;
  border-color: #dc2626;
}
.row-act-danger:hover:not(:disabled) {
  color: #dc2626;
  border-color: #dc2626;
  background: #fef2f2;
}
.row-act-danger:active:not(:disabled) {
  color: #b91c1c;
  border-color: #b91c1c;
}

/* 组件网格 */
.components-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  margin: 16px 20px 20px;
}

.component-card {
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.component-card:hover {
  border-color: var(--brand);
  box-shadow: var(--shadow-sm);
}

/* 批量模式：卡片选择态 */
.component-card.selected {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px var(--brand-border, rgba(22,119,255,0.3));
}
.component-card.batch-mode {
  cursor: pointer;
}

/* 批量选择复选框 */
.card-checkbox {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.9);
  border-radius: var(--radius-xs);
  box-shadow: var(--shadow-sm);
}
.card-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--brand);
  cursor: pointer;
  margin: 0;
}

.card-preview {
  width: 100%;
  height: 200px;
  background: var(--bg-alt);
  position: relative;
  overflow: hidden;
}

.type-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  pointer-events: none;
  box-shadow: var(--shadow-sm);
}

.type-badge .badge-icon {
  font-size: 14px;
  line-height: 1;
}

/* Vue3 普通组件：翡翠绿；微码组件：电气青蓝，避开品牌蓝 */
.type-badge.vue3 {
  background: var(--component-vue3);
  color: var(--component-vue3-contrast);
  border: 1px solid var(--component-vue3-strong);
}

.type-badge.phase2 {
  background: var(--component-microcode);
  color: var(--component-microcode-contrast);
  border: 1px solid var(--component-microcode-strong);
}

/* 公共组件池徽标（右上角，避开左上类型标签） */
.public-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 5;
  padding: 4px 10px;
  border-radius: 999px;
  background: #f59e0b;
  color: #ffffff;
  border: 1px solid #d97706;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

/* 卡片顶部色条：Vue3 绿 / 微码青蓝 */
.component-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  z-index: 4;
  pointer-events: none;
}

.component-card.vue3::before {
  background: linear-gradient(90deg, var(--component-vue3-strong), var(--component-vue3));
}

.component-card.phase2::before {
  background: linear-gradient(90deg, var(--component-microcode-strong), var(--component-microcode));
}

.preview-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  background: var(--bg-alt);
}

.preview-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
  background: var(--bg-alt);
}

.preview-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--bg-alt);
  z-index: 2;
  transition: opacity 0.3s ease;
}

.preview-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-light);
  border-top: 3px solid var(--brand);
  border-radius: var(--radius-full);
  animation: spin 1s linear infinite;
}

.preview-loading-text {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 预览错误占位 */
.preview-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--bg-alt);
  z-index: 2;
}

.preview-error .error-icon {
  font-size: 32px;
  opacity: 0.6;
}

.preview-error .error-text {
  font-size: 13px;
  color: var(--text-tertiary);
}

.retry-btn-small {
  padding: 4px 12px;
  border: 1px solid var(--button-secondary-border);
  border-radius: var(--radius-xs);
  background: var(--button-secondary-bg);
  color: var(--button-secondary-text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.retry-btn-small:hover {
  border-color: var(--button-secondary-border-hover);
  color: var(--brand);
}

.quality-panel {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  pointer-events: none;
}

.quality-score,
.quality-gate {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 9px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.65);
  background: rgba(255, 255, 255, 0.92);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}

.quality-gate.passed {
  color: var(--success);
}

.quality-gate.warned {
  color: var(--warning);
}

.quality-gate.failed {
  color: var(--error);
}

.card-info {
  padding: 12px 16px;
}

.component-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 6px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.component-meta {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
  display: flex;
  justify-content: space-between;
}

.quality-flags {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.quality-flag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  background: var(--bg-hover);
  color: var(--text-tertiary);
  font-size: 11px;
}

.quality-flag.passed {
  border-color: var(--success-border, #b7eb8f);
  background: var(--success-bg, #f6ffed);
  color: var(--success);
}

.quality-flag.failed {
  border-color: var(--error-border, #ffa39e);
  background: var(--error-bg, #fff1f0);
  color: var(--error);
}

.card-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.3s;
}

.component-card:hover .card-actions {
  opacity: 1;
}

.action-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(255, 255, 255, 0.9);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  box-shadow: var(--shadow-sm);
}

.action-btn:hover {
  transform: scale(1.05);
  background: var(--bg-card);
}

.action-btn.danger:hover {
  background: var(--error);
}

.load-more-sentinel {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 56px;
  color: var(--text-tertiary);
  font-size: 13px;
}
</style>
