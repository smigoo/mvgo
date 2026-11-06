<template>
  <div class="fbv-root">
    <header class="fbv-header">
      <div>
        <h1 class="fbv-title">任务反馈</h1>
        <p class="fbv-sub">
          用户在任务详情页提交的「一键反馈」处置台；快照内日志已脱敏 + 截断（≤512KB），Figma Token 仅存指纹
        </p>
      </div>
      <a-button :loading="loading" @click="loadList">刷新</a-button>
    </header>

    <!-- 状态统计条（同时作为状态筛选 tab） -->
    <div class="fbv-summary">
      <button
        v-for="tab in STATUS_TABS"
        :key="tab.value"
        type="button"
        class="fbv-summary-item"
        :class="{ 'fbv-summary-item--on': statusFilter === tab.value }"
        @click="onStatusTab(tab.value)"
      >
        <span class="fbv-summary-value" :class="`is-${tab.value}`">{{ counts[tab.value] ?? 0 }}</span>
        <span class="fbv-summary-label">{{ tab.label }}</span>
      </button>
    </div>

    <section class="fbv-section">
      <div class="fbv-filters">
        <a-select v-model:value="categoryFilter" class="fbv-filter-cat" @change="onSearch">
          <a-select-option value="all">全部类别</a-select-option>
          <a-select-option v-for="c in CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</a-select-option>
        </a-select>
        <a-input-search
          v-model:value="keyword"
          class="fbv-search"
          placeholder="搜索任务号 / 提交人 / 组件 / 描述"
          allow-clear
          @search="onSearch"
        />
      </div>

      <a-table
        class="fbv-table"
        size="middle"
        :columns="columns"
        :data-source="list"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1080 }"
        row-key="_id"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'createdAt'">
            <span class="fbv-muted">{{ formatTime(record.createdAt) }}</span>
          </template>
          <template v-else-if="column.key === 'category'">
            <a-tag :color="categoryMeta(record.category).color">
              {{ categoryMeta(record.category).label }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'sessionId'">
            <a-tooltip :title="record.sessionId">
              <span class="fbv-mono fbv-ellipsis">{{ record.sessionId }}</span>
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'component'">
            <a-tooltip :title="componentName(record)">
              <span class="fbv-ellipsis">{{ componentName(record) }}</span>
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'submitter'">
            <a-tooltip :title="record.userId">
              <span class="fbv-ellipsis">{{ record.username || record.userId || '-' }}</span>
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusMeta(record.status).color">{{ statusMeta(record.status).label }}</a-tag>
          </template>
          <template v-else-if="column.key === 'attachment'">
            <a-tag v-if="record.attachment" color="cyan">有</a-tag>
            <span v-else class="fbv-muted">—</span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-button type="link" size="small" @click="openDetail(record)">查看</a-button>
            <a-button type="link" size="small" danger @click="confirmDelete(record)">删除</a-button>
          </template>
          <template v-else>
            <span>{{ record[column.key] ?? '-' }}</span>
          </template>
        </template>
      </a-table>
    </section>

    <!-- 详情抽屉：日志正文只在此处拉取（列表接口已排除，避免响应 MB 级） -->
    <a-drawer
      v-model:open="detailOpen"
      placement="right"
      :width="760"
      :body-style="{ padding: 0 }"
      :title="drawerTitle"
      @close="onDrawerClose"
    >
      <div v-if="detailLoading" class="fbv-detail-loading">
        <a-spin />
        <span>加载详情…</span>
      </div>

      <div v-else-if="detail" class="fbv-detail">
        <!-- 概览 -->
        <div class="fbv-detail-head">
          <a-tag :color="categoryMeta(detail.category).color">{{ categoryMeta(detail.category).label }}</a-tag>
          <a-tag :color="statusMeta(detail.status).color">{{ statusMeta(detail.status).label }}</a-tag>
          <span class="fbv-muted">{{ formatTime(detail.createdAt, true) }}</span>
          <span class="fbv-muted">·</span>
          <span class="fbv-muted">{{ detail.username || detail.userId || '匿名' }}</span>
        </div>

        <!-- 任务快照 -->
        <div class="fbv-card">
          <div class="fbv-card-title">任务快照</div>
          <div class="fbv-kv">
            <span class="fbv-k">任务号</span>
            <span class="fbv-v">
              <span class="fbv-mono">{{ detail.sessionId }}</span>
              <a-button type="link" size="small" @click="copyText(detail.sessionId, '任务号已复制')">复制</a-button>
            </span>
          </div>
          <div class="fbv-kv">
            <span class="fbv-k">产物类型</span>
            <span class="fbv-v">{{ detail.snapshot?.target || '-' }}</span>
          </div>
          <div class="fbv-kv">
            <span class="fbv-k">组件</span>
            <span class="fbv-v">{{ componentName(detail) }}</span>
          </div>
          <div class="fbv-kv">
            <span class="fbv-k">提交时任务状态</span>
            <span class="fbv-v">{{ detail.snapshot?.taskStatus || '-' }}</span>
          </div>
          <div v-if="detail.snapshot?.taskError" class="fbv-kv">
            <span class="fbv-k">任务错误</span>
            <span class="fbv-v fbv-error">{{ detail.snapshot.taskError }}</span>
          </div>
          <div v-if="detail.snapshot?.pageUrl" class="fbv-kv">
            <span class="fbv-k">来源页面</span>
            <span class="fbv-v fbv-mono fbv-break">{{ detail.snapshot.pageUrl }}</span>
          </div>
          <!-- 🆕 2026-11-06 自动随附的任务图片（输入图 / 输出效果图，服务端快照自动带） -->
          <div v-if="taskImageUrls.length" class="fbv-kv">
            <span class="fbv-k">任务图片</span>
            <span class="fbv-v">
              <div class="fbv-images">
                <div v-for="img in taskImageUrls" :key="img.label" class="fbv-img-card">
                  <!-- 🔴 2026-11-06 修：历史快照里可能记着已不存在的路径（截图器未产出），
                       裂图降级为「图片已丢失」占位，避免管理员以为链接坏了。 -->
                  <div v-if="brokenTaskImages.has(img.label)" class="fbv-img-missing">
                    <span>图片已丢失</span>
                  </div>
                  <a v-else :href="img.url" target="_blank" rel="noopener noreferrer" title="点击查看大图">
                    <img
                      :src="img.url"
                      :alt="img.label"
                      class="fbv-img"
                      loading="lazy"
                      @error="markTaskImageBroken(img.label)"
                    />
                  </a>
                  <span class="fbv-img-label">{{ img.label }}</span>
                </div>
              </div>
            </span>
          </div>
        </div>

        <!-- 随附数据 -->
        <div class="fbv-card">
          <div class="fbv-card-title">
            随附数据
            <span class="fbv-card-note">用户勾选：{{ includedLabels(detail).join('、') || '无' }}</span>
          </div>
          <div class="fbv-kv">
            <span class="fbv-k">模型</span>
            <span class="fbv-v">
              <template v-if="(detail.snapshot?.modelsUsed || []).length">
                <a-tag v-for="m in detail.snapshot?.modelsUsed" :key="m" class="fbv-model-tag">{{ m }}</a-tag>
              </template>
              <span v-else class="fbv-muted">未提交</span>
            </span>
          </div>
          <div class="fbv-kv">
            <span class="fbv-k">Figma 链接</span>
            <span class="fbv-v">
              <a
                v-if="detail.snapshot?.figmaUrl"
                :href="detail.snapshot.figmaUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="fbv-link"
              >{{ detail.snapshot.figmaUrl }}</a>
              <span v-else class="fbv-muted">未提交</span>
            </span>
          </div>
          <div class="fbv-kv">
            <span class="fbv-k">Token 指纹</span>
            <span class="fbv-v">
              <template v-if="detail.snapshot?.tokenFingerprint">
                <div class="fbv-fp-row">
                  <span class="fbv-fp-label">任务使用</span>
                  <span class="fbv-mono">{{ detail.snapshot.tokenFingerprint }}</span>
                  <a-tag v-if="detail.snapshot.tokenFingerprintSource" class="fbv-fp-tag">
                    {{ detail.snapshot.tokenFingerprintSource === 'pipeline' ? '实际执行' : '创建时点' }}
                  </a-tag>
                </div>
                <div v-if="detail.snapshot.tokenFingerprintCurrent" class="fbv-fp-row">
                  <span class="fbv-fp-label">提交时配置</span>
                  <span class="fbv-mono">{{ detail.snapshot.tokenFingerprintCurrent }}</span>
                </div>
                <div v-if="detail.snapshot.tokenFingerprintChanged === true" class="fbv-fp-warn">
                  任务使用的 Token 与提交时配置的 Token 不是同一个 —— 排查时请以「任务使用」这一侧为准。
                </div>
                <div v-else-if="detail.snapshot.tokenFingerprintChanged === false" class="fbv-fp-ok">
                  两侧一致，Token 未在任务期间被切换。
                </div>
                <div v-else class="fbv-muted">缺少一侧指纹，无法比对是否换过 Token。</div>
              </template>
              <template v-else>
                <span class="fbv-muted">未提交</span>
                <span
                  v-if="detail.snapshot?.tokenFingerprintCurrent"
                  class="fbv-muted fbv-fp-inline"
                >（提交时配置为 {{ detail.snapshot.tokenFingerprintCurrent }}，该任务无 Token 使用记录）</span>
              </template>
            </span>
          </div>
          <div class="fbv-kv">
            <span class="fbv-k">日志体积</span>
            <span class="fbv-v">
              <template v-if="detail.snapshot?.logBytes">
                {{ formatBytes(detail.snapshot.logBytes) }}
                <span class="fbv-muted">
                  （原始 {{ formatBytes(detail.snapshot.logOriginalBytes) }}<template
                    v-if="detail.snapshot.logTruncated"
                  >，已截断</template>）
                </span>
              </template>
              <span v-else class="fbv-muted">未提交日志</span>
            </span>
          </div>
        </div>

        <!-- 问题描述 -->
        <div class="fbv-card">
          <div class="fbv-card-title">问题描述</div>
          <div class="fbv-desc">{{ detail.description || '-' }}</div>
        </div>

        <!-- 任务日志 -->
        <div class="fbv-card">
          <div class="fbv-card-title">
            任务日志
            <span class="fbv-card-actions">
              <a-button size="small" :disabled="!logText" @click="copyText(logText, '日志已复制')">复制</a-button>
              <a-button size="small" :disabled="!logText" @click="downloadLog">下载</a-button>
            </span>
          </div>
          <pre v-if="logText" class="fbv-log">{{ logText }}</pre>
          <div v-else class="fbv-muted fbv-empty">用户未提交日志</div>
        </div>

        <!-- 截图 -->
        <div class="fbv-card">
          <div class="fbv-card-title">
            截图
            <span v-if="detail.attachment" class="fbv-card-note">
              {{ detail.attachment.filename }} · {{ formatBytes(detail.attachment.size) }}
            </span>
          </div>
          <div v-if="!detail.attachment" class="fbv-muted fbv-empty">无截图</div>
          <template v-else>
            <div v-if="attachError" class="fbv-error">{{ attachError }}</div>
            <div v-else-if="!attachUrl" class="fbv-muted fbv-empty">截图加载中…</div>
            <template v-else>
              <img class="fbv-shot" :src="attachUrl" alt="反馈截图" />
              <div class="fbv-shot-actions">
                <a-button size="small" @click="openShotInNewTab">新窗口查看</a-button>
                <a-button size="small" @click="downloadShot">下载截图</a-button>
              </div>
            </template>
          </template>
        </div>

        <!-- 处置 -->
        <div class="fbv-card fbv-card--handle">
          <div class="fbv-card-title">处置</div>
          <div class="fbv-status-group">
            <button
              v-for="s in HANDLE_STATUSES"
              :key="s.value"
              type="button"
              class="fbv-status-btn"
              :class="{ 'fbv-status-btn--on': pendingStatus === s.value }"
              @click="pendingStatus = s.value"
            >
              {{ s.label }}
            </button>
          </div>
          <textarea
            v-model="adminNote"
            class="fbv-note"
            maxlength="2000"
            placeholder="处置备注（可选，会记录在反馈上）"
          />
          <div class="fbv-handle-foot">
            <span v-if="detail.handledAt" class="fbv-muted">
              上次处置：{{ detail.handledByName || detail.handledBy || '-' }} ·
              {{ formatTime(detail.handledAt, true) }}
            </span>
            <span v-else class="fbv-muted">尚未处置</span>
            <span class="fbv-handle-btns">
              <a-button danger @click="confirmDelete(detail)">删除反馈</a-button>
              <a-button type="primary" :loading="saving" @click="saveStatus">保存处置</a-button>
            </span>
          </div>
        </div>
      </div>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Modal, message } from 'ant-design-vue'
import {
  deleteFeedback,
  fetchFeedbackAttachmentBlob,
  getFeedbackDetail,
  listFeedbacks,
  updateFeedbackStatus,
} from '@/api/feedback'
import type { FeedbackItem, FeedbackStatus } from '@/api/feedback'

// ─────────────── 文案与配色口径（与提交端 TaskFeedbackDrawer 保持一致） ───────────────
const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'bug', label: '功能异常' },
  { value: 'quality', label: '生成质量' },
  { value: 'suggestion', label: '体验建议' },
  { value: 'other', label: '其他' },
]

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  bug: { label: '功能异常', color: 'red' },
  quality: { label: '生成质量', color: 'orange' },
  suggestion: { label: '体验建议', color: 'blue' },
  other: { label: '其他', color: 'default' },
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'gold' },
  processing: { label: '处理中', color: 'blue' },
  resolved: { label: '已解决', color: 'green' },
  rejected: { label: '已驳回', color: 'default' },
}

/** 统计条顺序：待办在前，「全部」收尾 */
const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'resolved', label: '已解决' },
  { value: 'rejected', label: '已驳回' },
  { value: 'all', label: '全部' },
]

/** 处置区可选状态（不含 all） */
const HANDLE_STATUSES = STATUS_TABS.filter((t) => t.value !== 'all')

const INCLUDED_LABELS: Record<string, string> = {
  logs: '任务日志',
  models: '模型',
  figmaUrl: 'Figma 链接',
  token: 'Token 指纹',
}

const categoryMeta = (v?: string) => CATEGORY_META[v || ''] || { label: v || '-', color: 'default' }
const statusMeta = (v?: string) => STATUS_META[v || ''] || { label: v || '-', color: 'default' }

// ─────────────── 列表 ───────────────
const list = ref<FeedbackItem[]>([])
const loading = ref(false)
const statusFilter = ref<string>('all')
const categoryFilter = ref<string>('all')
const keyword = ref('')
const counts = ref<Record<string, number>>({ pending: 0, processing: 0, resolved: 0, rejected: 0, all: 0 })

const columns = [
  { title: '提交时间', key: 'createdAt', width: 150 },
  { title: '类别', key: 'category', width: 100 },
  { title: '任务号', key: 'sessionId', width: 190, ellipsis: true },
  { title: '组件', key: 'component', ellipsis: true },
  { title: '提交人', key: 'submitter', width: 120, ellipsis: true },
  { title: '状态', key: 'status', width: 100 },
  { title: '截图', key: 'attachment', width: 80 },
  { title: '操作', key: 'actions', width: 130, fixed: 'right' },
]

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
})

async function loadList() {
  loading.value = true
  try {
    const data = await listFeedbacks({
      page: pagination.current,
      pageSize: pagination.pageSize,
      status: statusFilter.value,
      category: categoryFilter.value,
      keyword: keyword.value.trim() || undefined,
    })
    list.value = (data?.list as FeedbackItem[]) || []
    pagination.total = data?.total || 0
    if (data?.counts) counts.value = data.counts
  } catch (e: any) {
    message.error(e?.message || '加载反馈列表失败')
  } finally {
    loading.value = false
  }
}

function onStatusTab(value: string) {
  statusFilter.value = value
  pagination.current = 1
  loadList()
}

function onSearch() {
  pagination.current = 1
  loadList()
}

function onTableChange(pag: any) {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  loadList()
}

// ─────────────── 详情 ───────────────
const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref<FeedbackItem | null>(null)
const pendingStatus = ref<FeedbackStatus>('pending')
const adminNote = ref('')
const saving = ref(false)

const drawerTitle = computed(() => (detail.value ? `反馈详情 · ${detail.value._id}` : '反馈详情'))
const logText = computed(() => detail.value?.snapshot?.logExcerpt || '')

/** 加载失败的任务图（按 label 记）→ 渲染「图片已丢失」占位 */
const brokenTaskImages = ref<Set<string>>(new Set())
const markTaskImageBroken = (label: string) => {
  const next = new Set(brokenTaskImages.value)
  next.add(label)
  brokenTaskImages.value = next
}
watch(detail, () => {
  if (brokenTaskImages.value.size) brokenTaskImages.value = new Set()
})

/**
 * 🆕 2026-11-06 自动随附的任务图片（服务端快照 snapshot.taskImages 引用路径 → 取图 URL）。
 * 管理员看他人产物：/api/component/:cid/file 的归属校验由后端 admin 通道放行
 * （adminService 同口径）；图已丢失时 <img> 自然裂图，不影响其他字段。
 */
const taskImageUrls = computed(() => {
  const d = detail.value
  const images = d?.snapshot?.taskImages as { input?: string; output?: string } | undefined
  if (!images) return []
  const cid = (d as any)?.snapshot?.componentId || d?.sessionId
  if (!cid) return []
  const fileUrl = (path: string) =>
    `/api/component/${encodeURIComponent(String(cid))}/file?path=${encodeURIComponent(path)}&raw=1`
  const list: Array<{ label: string; url: string }> = []
  if (images.input) list.push({ label: '输入图', url: fileUrl(images.input) })
  if (images.output) list.push({ label: '输出效果', url: fileUrl(images.output) })
  return list
})

async function openDetail(record: FeedbackItem) {
  detailOpen.value = true
  detailLoading.value = true
  detail.value = null
  resetAttachment()
  pendingStatus.value = record.status
  adminNote.value = record.adminNote || ''
  try {
    const doc = await getFeedbackDetail(record._id)
    detail.value = doc
    pendingStatus.value = doc.status
    adminNote.value = doc.adminNote || ''
    // 截图是二进制且需鉴权头，必须拉 Blob 后再预览（<img src> 无法带 Token 头）
    if (doc.attachment) await loadAttachment(doc._id)
  } catch (e: any) {
    message.error(e?.message || '加载反馈详情失败')
  } finally {
    detailLoading.value = false
  }
}

async function saveStatus() {
  if (!detail.value) return
  saving.value = true
  try {
    const updated = await updateFeedbackStatus(detail.value._id, {
      status: pendingStatus.value,
      adminNote: adminNote.value,
    })
    if (updated) detail.value = { ...detail.value, ...updated }
    message.success('处置已保存')
    await loadList()
  } catch (e: any) {
    message.error(e?.message || '保存处置失败')
  } finally {
    saving.value = false
  }
}

function confirmDelete(record: FeedbackItem) {
  Modal.confirm({
    title: '确认删除这条反馈？',
    content: '删除后不可恢复；已落盘的截图文件不会随记录自动清理。',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        await deleteFeedback(record._id)
        message.success('已删除')
        if (detail.value && detail.value._id === record._id) detailOpen.value = false
        await loadList()
      } catch (e: any) {
        message.error(e?.message || '删除失败')
      }
    },
  })
}

// ─────────────── 截图（Blob 预览） ───────────────
const attachUrl = ref('')
const attachError = ref('')
let attachTimer: ReturnType<typeof setTimeout> | null = null

async function loadAttachment(id: string) {
  try {
    const blob = await fetchFeedbackAttachmentBlob(id)
    attachUrl.value = URL.createObjectURL(blob)
  } catch (e: any) {
    attachError.value = e?.message || '截图加载失败'
  }
}

function resetAttachment() {
  if (attachUrl.value) URL.revokeObjectURL(attachUrl.value)
  attachUrl.value = ''
  attachError.value = ''
  if (attachTimer) {
    clearTimeout(attachTimer)
    attachTimer = null
  }
}

function onDrawerClose() {
  resetAttachment()
  detail.value = null
}

function openShotInNewTab() {
  if (attachUrl.value) window.open(attachUrl.value, '_blank', 'noopener')
}

function downloadShot() {
  if (!attachUrl.value) return
  const name = detail.value?.attachment?.filename || 'feedback-screenshot.png'
  const a = document.createElement('a')
  a.href = attachUrl.value
  a.download = name
  a.click()
}

// ─────────────── 小工具 ───────────────
function componentName(record: any): string {
  return record?.snapshot?.componentName || record?.snapshot?.componentId || '-'
}

function includedLabels(record: any): string[] {
  const arr: string[] = record?.snapshot?.included || []
  return arr.map((v) => INCLUDED_LABELS[v] || v)
}

function formatTime(v?: string, withSeconds = false): string {
  if (!v) return '-'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '-'
  const p = (n: number) => String(n).padStart(2, '0')
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  return withSeconds ? `${base}:${p(d.getSeconds())}` : base
}

function formatBytes(n?: number): string {
  if (!n || n <= 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

async function copyText(text: string, okMsg: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    message.success(okMsg)
  } catch {
    message.warning('复制失败，请手动选中复制')
  }
}

function downloadLog() {
  if (!logText.value) return
  const blob = new Blob([logText.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `feedback-${detail.value?._id || 'log'}.log.txt`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(loadList)
onBeforeUnmount(resetAttachment)
</script>

<style lang="less" scoped>
.fbv-root {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.fbv-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.fbv-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.fbv-sub {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 状态统计条 */
.fbv-summary {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.fbv-summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 110px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.fbv-summary-item:hover {
  border-color: var(--brand);
}

.fbv-summary-item--on {
  border-color: var(--brand);
  background: var(--brand-bg);
}

.fbv-summary-value {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-primary);
}

.fbv-summary-value.is-pending {
  color: var(--warning);
}

.fbv-summary-value.is-processing {
  color: var(--brand);
}

.fbv-summary-value.is-resolved {
  color: var(--success);
}

.fbv-summary-label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.fbv-section {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 16px;
}

.fbv-filters {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.fbv-filter-cat {
  width: 140px;
}

.fbv-search {
  width: 320px;
}

.fbv-muted {
  color: var(--text-secondary);
}

.fbv-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.fbv-ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.fbv-break {
  word-break: break-all;
}

/* ── 🆕 2026-11-06 自动随附任务图片（输入图 / 输出效果） ── */
.fbv-images {
  display: flex;
  gap: 10px;
}
.fbv-img-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.fbv-img {
  width: 100%;
  height: 110px;
  object-fit: cover;
  object-position: top;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #f3f4f6;
  display: block;
}
.fbv-img-label {
  font-size: 11px;
  color: #6b7280;
  text-align: center;
}
/* 图丢失占位（与 .fbv-img 同高，避免详情抽屉跳动） */
.fbv-img-missing {
  width: 100%;
  height: 110px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px dashed #d1d5db;
  background: #f9fafb;
  color: #9ca3af;
  font-size: 12px;
}

/* ── Figma 凭证指纹双轨（任务使用 vs 提交时配置） ── */
.fbv-fp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}

.fbv-fp-label {
  flex: 0 0 68px;
  font-size: 12px;
  color: var(--text-secondary);
}

.fbv-fp-tag {
  margin-inline-end: 0;
}

.fbv-fp-inline {
  margin-left: 4px;
}

.fbv-fp-warn {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--warning);
}

.fbv-fp-ok {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--success);
}

.fbv-error {
  color: var(--error);
  word-break: break-word;
}

/* 抽屉 */
.fbv-detail-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 60px 0;
  color: var(--text-secondary);
}

.fbv-detail {
  padding: 16px 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fbv-detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
}

.fbv-card {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  background: var(--bg-card);
}

.fbv-card--handle {
  border-color: var(--brand);
}

.fbv-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.fbv-card-note {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
}

.fbv-card-actions {
  display: flex;
  gap: 8px;
}

.fbv-kv {
  display: flex;
  gap: 10px;
  padding: 4px 0;
  font-size: 13px;
}

.fbv-k {
  flex: 0 0 92px;
  color: var(--text-secondary);
}

.fbv-v {
  flex: 1;
  min-width: 0;
  color: var(--text-primary);
  word-break: break-word;
}

.fbv-model-tag {
  margin: 0 4px 4px 0;
}

.fbv-link {
  color: var(--brand);
  word-break: break-all;
}

.fbv-desc {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.fbv-log {
  max-height: 320px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
}

.fbv-empty {
  font-size: 12px;
}

.fbv-shot {
  display: block;
  max-width: 100%;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
}

.fbv-shot-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

/* 处置区 */
.fbv-status-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.fbv-status-btn {
  min-width: 86px;
  padding: 6px 14px;
  font-size: 13px;
  color: var(--text-primary);
  background: transparent;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all 0.2s;
}

.fbv-status-btn:hover {
  border-color: var(--brand);
}

.fbv-status-btn--on {
  color: var(--text-on-brand);
  background: var(--brand);
  border-color: var(--brand);
}

.fbv-note {
  width: 100%;
  min-height: 76px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  resize: vertical;
  outline: none;
}

.fbv-note:focus {
  border-color: var(--brand);
}

.fbv-handle-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
  font-size: 12px;
}

.fbv-handle-btns {
  display: flex;
  gap: 8px;
}
</style>
