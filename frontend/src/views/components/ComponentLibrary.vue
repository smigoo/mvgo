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

    <!-- 组件内容：全部范围统一使用公共组件池的表格列表样式 -->
    <div v-else-if="components.length > 0" class="component-list-area">
      <table class="pool-table">
        <thead>
          <tr>
            <th v-if="showBatchColumn" class="col-check">
              <input type="checkbox" :checked="allOwnSelected" title="全选" @change="toggleSelectAll" />
            </th>
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
            :class="{ selected: selectedIds.has(component._id) }"
          >
            <td v-if="showBatchColumn" class="col-check" @click.stop>
              <input
                type="checkbox"
                :checked="selectedIds.has(component._id)"
                :disabled="!isOwnComponent(component)"
                @change="toggleSelect(component._id)"
              />
            </td>
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
                  v-if="component.visibility !== 'public'"
                  class="row-act"
                  title="发布到公共组件池"
                  :disabled="publishingId === component._id"
                  @click="publishComponentConfirm(component)"
                >
                  <CloudUploadOutlined class="row-act-icon" />
                  <span>发布</span>
                </button>
                <button
                  v-else
                  class="row-act"
                  title="从公共组件池下架"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
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
import { DownloadOutlined, EyeOutlined, StopOutlined, DeleteOutlined, CloudUploadOutlined } from '@ant-design/icons-vue'
import http from '@/core/http'

const router = useRouter()
const route = useRoute()

// 状态
const components = ref<Component[]>([])
const loading = ref(false)
const error = ref('')

// 预览错误状态 { [componentId]: boolean }
const previewError = ref<Record<string, boolean>>({})

const loadMoreSentinel = ref<HTMLElement | null>(null)
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

// 表格勾选列：仅非公共池范围显示（公共池是平台级范围，不允许批量删除）
const showBatchColumn = computed(() => batchMode.value && activeScope.value !== 'public')
// 全选态：自己的组件是否已全部勾选
const allOwnSelected = computed(() => {
  const own = components.value.filter(c => isOwnComponent(c))
  return own.length > 0 && own.every(c => selectedIds.value.has(c._id))
})
function toggleSelectAll() {
  if (allOwnSelected.value) selectedIds.value = new Set()
  else selectAll()
}

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
    previewError.value = {}
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
    await nextTick()
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

// 直接在独立预览页打开组件（走 /preview 运行时，微码/Vue3 按类型分流）
// 我的组件与公共组件池共用同一预览页，统一入口
function openPreview(component: Component) {
  const sid = getBusinessComponentId(component)
  const gid = String(component.groupId || '')
  const isVue3 = getComponentTarget(component) === 'vue3'
  const url = isVue3
    ? getVue3PreviewUrl(gid, sid)
    : getMcPreviewUrl(sid) + `&groupId=${encodeURIComponent(gid)}`
  window.open(url, '_blank')
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

// 初始化
onMounted(() => {
  loadComponents(true)
})

onBeforeUnmount(() => {
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
/* 批量勾选态 */
.pool-row.selected {
  background: #eff6ff;
}
.pool-row:last-child td {
  border-bottom: none;
}
.col-check { width: 44px; }
.col-check input[type="checkbox"] {
  width: 15px;
  height: 15px;
  accent-color: var(--brand);
  cursor: pointer;
  margin: 0;
  display: block;
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

.load-more-sentinel {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 56px;
  color: var(--text-tertiary);
  font-size: 13px;
}
</style>
