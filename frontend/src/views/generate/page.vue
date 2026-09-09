<template>
  <div class="unified-generate">
    <!-- 恢复状态提示 -->
    <div v-if="recoveryStatus" class="recovery-banner">
      <span class="recovery-spinner"></span>
      <span>{{ recoveryStatus }}</span>
    </div>

    <div class="form-card">
      <!-- 页面类型选择 -->
      <div class="type-selector">
        <label class="type-label">页面类型</label>
        <div class="type-pills">
          <button
            class="type-pill"
            :class="{ active: pageType === 'microcode' }"
            @click="pageType = 'microcode'"
          >
            <span class="pill-text">微码页面</span>
            <span class="pill-hint">分析 cp-xxx 组件并批量生成</span>
          </button>
          <button
            class="type-pill"
            :class="{ active: pageType === 'normal' }"
            @click="pageType = 'normal'"
          >
            <span class="pill-text">普通页面</span>
            <span class="pill-hint">分析布局结构（功能开发中）</span>
          </button>
        </div>
      </div>

      <!-- 微码页面模式 -->
      <template v-if="pageType === 'microcode'">
        <div class="type-notice">
          微码页面：输入 Figma 页面 URL → 分析页面中的 cp-xxx 组件 → 批量生成
        </div>

        <div class="form-group figma-url-group" v-feature="'figma.integration'">
          <label>Figma 页面 URL</label>
          <input
            id="figmaPageDesignUrl"
            v-model="figmaUrlPage"
            type="text"
            name="figmaPageDesignUrl"
            class="form-input"
            placeholder="请输入 Figma 页面链接（含 node-id 参数）..."
            :disabled="isPageGenerating || isPageAnalyzing"
            inputmode="url"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
          />
          <div v-if="urlInfoPage" class="url-info" :class="urlInfoPage.type">
            <span v-html="urlInfoPage.message"></span>
          </div>
        </div>

        <!-- 执行模式 + 并发度 -->
        <div class="form-row-inline" v-if="canAnalyzePage">
          <div class="mode-pills">
            <span class="inline-label">执行模式</span>
            <button :class="{ active: pageExecMode === 'serial' }" @click="pageExecMode = 'serial'">串行</button>
            <button :class="{ active: pageExecMode === 'parallel' }" @click="pageExecMode = 'parallel'">并行</button>
          </div>
          <div class="concurrency-stepper" v-if="pageExecMode === 'parallel'">
            <span class="inline-label">并发度</span>
            <button @click="pageConcurrency = Math.max(1, pageConcurrency - 1)">−</button>
            <span class="concurrency-val">{{ pageConcurrency }}</span>
            <button @click="pageConcurrency = Math.min(10, pageConcurrency + 1)">+</button>
          </div>
        </div>

        <div class="action-row">
          <button class="btn-analyze" :disabled="!canAnalyzePage || isPageAnalyzing || isPageGenerating" @click="handlePageAnalyze">
            {{ isPageAnalyzing ? '分析中...' : '先分析页面' }}
          </button>
          <button class="btn-generate" :class="{ 'is-generating': isPageGenerating }" :disabled="!isPageGenerating && !canAnalyzePage" @click="isPageGenerating ? cancelPageTask() : handlePageGenerate()">
            <span v-if="isPageGenerating" class="spinner"></span>
            {{ isPageGenerating ? '终止' : '开始批量生成' }}
          </button>
        </div>

        <!-- 页面分析结果 -->
        <div v-if="pageAnalyzedComponents.length > 0 && !isPageGenerating" class="analyze-section">
          <div class="analyze-header">
            发现 {{ pageAnalyzedComponents.length }} 个 cp-xxx 组件
          </div>
          <div class="analyze-list">
            <div v-for="comp in pageAnalyzedComponents" :key="comp.figmaNodeId" class="analyze-item">
              <span class="comp-name">{{ comp.componentId || comp.figmaNodeId }}</span>
              <span class="comp-node">{{ comp.figmaNodeId }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- 普通页面模式 -->
      <template v-else>
        <div class="type-notice normal-page-notice">
          普通页面：输入 Figma 页面 URL → 分析布局结构 → 智能生成（功能开发中，敬请期待）
        </div>

        <div class="form-group figma-url-group" v-feature="'figma.integration'">
          <label>Figma 页面 URL</label>
          <input
            id="figmaNormalPageDesignUrl"
            v-model="figmaUrlPage"
            type="text"
            name="figmaNormalPageDesignUrl"
            class="form-input placeholder-stub"
            placeholder="请输入 Figma 页面链接..."
            inputmode="url"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            disabled
          />
          <div class="url-info warning">
            <span>普通页面布局分析功能开发中，此模式暂不可用</span>
          </div>
        </div>

        <div class="action-row">
          <button class="btn-analyze disabled-btn" disabled>
            分析布局结构（开发中）
          </button>
        </div>

        <div class="placeholder-section">
          <div class="placeholder-icon"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="5.5" x2="18.5" y2="18.5"/></svg></div>
          <div class="placeholder-title">功能开发中</div>
          <div class="placeholder-desc">
            普通页面生成将支持：输入 Figma 页面 URL → AI 分析整体布局结构（Header / Sidebar / Content / Footer 等）→ 智能还原页面框架
          </div>
        </div>
      </template>
    </div>

    <!-- 页面生成结果 -->
    <div v-if="pageResults.length > 0" class="results-section">
      <div class="results-header">
        <span class="results-title">生成结果</span>
        <span v-if="pageSummary" class="results-badge" :class="summaryBadgeClass(pageSummary.status)">
          {{ summaryBadgeText(pageSummary.status) }} · {{ pageSummary.success }}/{{ pageSummary.total }}
        </span>
      </div>
      <div class="results-list">
        <div v-for="(r, i) in pageResults" :key="r.childSessionId || i" class="result-card" :class="{ 'result-fail': !r.success }">
          <div class="result-card-header">
            <span class="result-status-icon">{{ r.success ? '✓' : '✕' }}</span>
            <span class="result-name">{{ r.componentName || r.component || r.figmaNodeName || '未命名组件' }}</span>
            <span v-if="r.componentType" class="result-type-tag">{{ r.componentType }}</span>
          </div>
          <div class="result-card-body">
            <div class="result-meta">
              <span v-if="r.figmaNodeId" class="meta-item">{{ r.figmaNodeId }}</span>
              <span v-if="r.duration" class="meta-item">{{ (r.duration / 1000).toFixed(1) }}s</span>
              <span v-if="r.iterations" class="meta-item">{{ r.iterations }} 轮</span>
            </div>
            <div v-if="r.error" class="result-error">{{ r.error }}</div>
          </div>
          <div v-if="r.success && r.childSessionId" class="result-card-actions">
            <button class="btn-result-action" @click="openChildPreview(r.childSessionId, r.componentType)">
              预览
            </button>
            <button type="button" class="btn-result-action" @click="downloadChild(r)">
              下载
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 子组件预览弹窗 -->
    <div v-if="previewChildUrl" class="child-preview-overlay" @click.self="closeChildPreview">
      <div class="child-preview-modal">
        <div class="child-preview-header">
          <span class="child-preview-title">子组件预览</span>
          <div class="child-preview-actions">
            <button class="preview-btn icon-tooltip" @click="refreshChildPreview" data-tooltip="刷新" aria-label="刷新"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg></button>
            <a :href="previewChildUrl" target="_blank" class="preview-btn icon-tooltip" data-tooltip="新窗口" aria-label="新窗口">↗</a>
            <button class="preview-btn icon-tooltip" @click="closeChildPreview" data-tooltip="关闭" aria-label="关闭">✕</button>
          </div>
        </div>
        <iframe :src="previewChildUrl" class="child-preview-iframe" frameborder="0" sandbox="allow-scripts"></iframe>
      </div>
    </div>

    <!-- 页面生成日志 -->
    <div v-if="pageLogs.length > 0" class="logs-section">
      <div class="logs-header">生成日志</div>
      <div class="logs-list">
        <div v-for="(log, i) in pageLogs" :key="i" class="log-item" :class="log.level">
          <span class="log-time">{{ log.time }}</span>
          <span class="log-msg">{{ log.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { analyzePage, generatePage, createProgressStream, fetchTaskStatus, fetchTaskTree, cancelTask } from '@/api/generator'
import { createSseRecovery } from '@/utils/sse-recovery'
import { getRouteUrl } from '@/api/component'
import { downloadByUrl } from '@/utils/download-file'

const route = useRoute()

// ── 全局状态 ──
const configStore = useConfigStore()
const openConfig = inject<any>('openConfig', () => {})
const baseURL = import.meta.env.VITE_LANGGRAPH_API || 'http://localhost:3000/api'

// ── 页面生成状态 ──
const pageType = ref<'microcode' | 'normal'>('microcode')
const figmaUrlPage = ref('')
const pageExecMode = ref<'serial' | 'parallel'>('parallel')
const pageConcurrency = ref(2)
const isPageAnalyzing = ref(false)
const isPageGenerating = ref(false)
const pageAnalyzedComponents = ref<any[]>([])
const pageLogs = ref<{ time: string; level: string; message: string }[]>([])
let pageEventSource: EventSource | null = null
let pageSessionId: string | null = null

// 取消页面生成任务
async function cancelPageTask() {
  if (!pageSessionId) return
  try {
    await cancelTask(pageSessionId)
    addPageLog('info', '已发送终止请求')
    isPageGenerating.value = false
    clearSession()
    pageEventSource?.close()
    pageEventSource = null
    sseRecovery.stopFallback()
  } catch (err: any) {
    addPageLog('error', `终止失败: ${err?.message}`)
  }
}

// SSE 断开恢复工具
const sseRecovery = createSseRecovery({
  onCompleted: (sid) => {
    addPageLog('info', '✓ 任务已完成（SSE 断开恢复）')
    isPageGenerating.value = false
    clearSession()
    pageEventSource?.close()
    pageEventSource = null
    sseRecovery.stopFallback()
  },
  onFailed: (sid, err) => {
    addPageLog('error', `任务失败（SSE 断开恢复）: ${err || ''}`)
    isPageGenerating.value = false
    clearSession()
    pageEventSource?.close()
    pageEventSource = null
    sseRecovery.stopFallback()
  },
  onCancelled: (sid) => {
    addPageLog('warn', '任务已取消（SSE 断开恢复）')
    isPageGenerating.value = false
    clearSession()
    pageEventSource?.close()
    pageEventSource = null
    sseRecovery.stopFallback()
  },
  isStillGenerating: () => isPageGenerating.value,
  isConnectionAlive: () => pageEventSource?.readyState === EventSource.OPEN,
  onReconnect: (sessionId) => {
    // 主动重建 SSE 连接
    pageEventSource?.close()
    pageEventSource = null
    connectSSE(sessionId)
  },
  log: (level, msg) => addPageLog(level, msg),
})

// ── 页面生成结果 ──
const pageResults = ref<any[]>([])
const pageSummary = ref<{ total: number; success: number; failed: number; status: string } | null>(null)
const previewChildSession = ref<string>('')
const previewChildUrl = ref<string>('')

// ── 进度持久化 & 恢复 ──
const STORAGE_KEY = 'page-gen-active-session'
const recoveryStatus = ref<string>('')

function saveSession(sessionId: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    sessionId,
    figmaUrl: figmaUrlPage.value,
    startTime: Date.now(),
  }))
}
function clearSession() { localStorage.removeItem(STORAGE_KEY) }
function loadSession(): { sessionId: string; figmaUrl: string; startTime: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// 从后端 progress 数组恢复日志
function restoreProgressLogs(progressArr: any[]) {
  if (!Array.isArray(progressArr) || progressArr.length === 0) return
  addPageLog('info', `─── 恢复 ${progressArr.length} 条历史进度 ───`)
  for (const p of progressArr) {
    if (p.type === 'metrics' && p.tokens) {
      addPageLog('info', `[${p.node || 'metrics'}] Token: ${p.tokens.total}`)
    } else if (p.type === 'budget-warning' || p.type === 'budget-exceeded') {
      addPageLog(p.type === 'budget-exceeded' ? 'error' : 'warn', `[${p.stage || '预算'}] ${p.message || ''}`)
    } else if (p.message) {
      addPageLog(p.status === 'failed' ? 'error' : p.status === 'warning' ? 'warn' : 'info', `[${p.stage || '进度'}] ${p.message}`)
    }
  }
  addPageLog('info', `─── 历史进度恢复完毕 ───`)
}

// SSE 连接（生成和恢复共用）
function connectSSE(sessionId: string) {
  pageEventSource = createProgressStream(sessionId)
  pageEventSource.onmessage = (event) => {
    const data = JSON.parse(event.data)
    if (data.type === 'connected') {
      addPageLog('info', data.isReconnect ? `SSE 重连成功（${data.progressCount || 0} 条缓冲）` : 'SSE 连接成功')
    } else if (data.type === 'task-status') {
      if (data.status === 'running') addPageLog('info', `任务进行中，已恢复 ${data.progressCount || 0} 条进度`)
    } else if (data.type === 'progress') {
      if (data.status === 'cancelled') {
        addPageLog('warn', `${data.message || '任务已被取消'}`)
        isPageGenerating.value = false
        clearSession()
        sseRecovery.stopFallback()
        pageEventSource?.close()
        pageEventSource = null
      } else {
        addPageLog(data.status === 'failed' ? 'error' : 'info', `[${data.stage}] ${data.message}`)
      }
    } else if (data.type === 'complete') {
      // 🆕 捕获结果数组
      if (data.results && Array.isArray(data.results)) {
        pageResults.value = data.results
        pageSummary.value = {
          total: data.totalComponents || data.results.length,
          success: data.successCount || data.results.filter((r: any) => r.success).length,
          failed: data.failedCount || data.results.filter((r: any) => !r.success).length,
          status: data.summary || (data.failedCount === 0 ? 'all_success' : data.successCount === 0 ? 'all_failed' : 'partial_failure'),
        }
      }
      const summaryText = pageSummary.value
        ? `✓ 页面生成完成: ${pageSummary.value.success}/${pageSummary.value.total} 成功${pageSummary.value.failed > 0 ? `, ${pageSummary.value.failed} 失败` : ''}`
        : '✓ 页面生成完成'
      addPageLog('info', summaryText)
      isPageGenerating.value = false
      clearSession()
      sseRecovery.stopFallback()
      pageEventSource?.close()
      pageEventSource = null
    } else if (data.type === 'error') {
      addPageLog('error', `${data.message}`)
      isPageGenerating.value = false
      clearSession()
      sseRecovery.stopFallback()
      pageEventSource?.close()
      pageEventSource = null
    } else if (data.type === 'cancelled') {
      addPageLog('warn', `${data.message || '任务已取消'}`)
      isPageGenerating.value = false
      clearSession()
      sseRecovery.stopFallback()
      pageEventSource?.close()
      pageEventSource = null
    } else if (data.type === 'log') {
      addPageLog(data.level ?? 'info', data.message ?? '')
    }
  }
  pageEventSource.onerror = () => {
    if (isPageGenerating.value) {
      addPageLog('warn', 'SSE 连接断开，正在检查任务状态...')
      sseRecovery.checkAndRecover(sessionId)
    } else {
      pageEventSource?.close()
      pageEventSource = null
    }
  }
}

// 恢复指定 session
async function recoverSession(sessionId: string, restoreUrl?: string) {
  if (pageEventSource) { pageEventSource.close(); pageEventSource = null }
  pageLogs.value = []
  isPageGenerating.value = false
  if (restoreUrl) figmaUrlPage.value = restoreUrl
  try {
    recoveryStatus.value = '正在检查任务状态...'
    const resp = await fetchTaskStatus(sessionId)
    if (!resp?.success || !resp.data?.task) { recoveryStatus.value = ''; return }
    const task = resp.data.task
    if (task.status === 'running') {
      isPageGenerating.value = true
      const elapsed = Math.round((Date.now() - task.startTime) / 1000)
      recoveryStatus.value = `恢复任务中: ${task.componentName}（已运行 ${elapsed}s）`
      addPageLog('info', `检测到未完成任务，正在重连 SSE...`)
      restoreProgressLogs(task.progress)
      connectSSE(sessionId)
      saveSession(sessionId)
      setTimeout(() => { recoveryStatus.value = '' }, 6000)
    } else if (task.status === 'completed') {
      restoreProgressLogs(task.progress)
      addPageLog('info', '✓ 任务已完成')
      // 🆕 从已完成任务恢复结果
      if (task.result?.results && Array.isArray(task.result.results)) {
        pageResults.value = task.result.results
        pageSummary.value = {
          total: task.result.totalComponents || task.result.results.length,
          success: task.result.successCount || task.result.results.filter((r: any) => r.success).length,
          failed: task.result.failedCount || task.result.results.filter((r: any) => !r.success).length,
          status: task.result.summary || 'all_success',
        }
      }
      clearSession()
      recoveryStatus.value = ''
    } else if (task.status === 'failed') {
      restoreProgressLogs(task.progress)
      addPageLog('error', `任务已失败: ${task.error || '未知错误'}`)
      clearSession()
      recoveryStatus.value = ''
    } else { clearSession(); recoveryStatus.value = '' }
  } catch { recoveryStatus.value = '' }
}

// ── URL 解析（页面）──
const urlInfoPage = computed(() => {
  if (!figmaUrlPage.value) return null
  try {
    const urlObj = new URL(figmaUrlPage.value)
    const pathMatch = urlObj.pathname.match(/\/(file|design)\/([^/]+)/)
    const nodeId = urlObj.searchParams.get('node-id')
    if (pathMatch && nodeId) {
      return {
        type: 'success',
        message: `✓ File Key: <code>${pathMatch[2]}</code> &nbsp; Node ID: <code>${nodeId}</code>`,
        fileKey: pathMatch[2],
        nodeId,
      }
    }
    return { type: 'warning', message: 'URL 需要包含 node-id 参数', fileKey: '', nodeId: '' }
  } catch {
    return { type: 'error', message: '无效的 URL', fileKey: '', nodeId: '' }
  }
})

const canAnalyzePage = computed(() => urlInfoPage.value?.type === 'success')

// ── 工具函数 ──
function addPageLog(level: string, message: string) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  pageLogs.value.push({ time, level, message })
}

// ── 子组件预览/下载 ──
function getChildPreviewUrl(childSessionId: string, componentType?: string) {
  const groupId = localStorage.getItem('currentGroupId') || 'default-group'
  const typeParam = componentType === 'vue3' ? '&type=vue3' : ''
  return getRouteUrl(`/preview/${childSessionId}?groupId=${groupId}${typeParam}`)
}

function getChildDownloadUrl(childSessionId: string) {
  return `${baseURL}/phase2/download/${childSessionId}`
}

// 🛡️ 2026-09-04：原生 <a :href download> 不带 Token → 生产 Java 401；统一 Blob 下载
function downloadChild(r: any) {
  if (!r?.childSessionId) return
  const name = `${r.componentName || r.component || r.childSessionId}.zip`
  void downloadByUrl(getChildDownloadUrl(r.childSessionId), name)
}

function openChildPreview(childSessionId: string, componentType?: string) {
  previewChildSession.value = childSessionId
  previewChildUrl.value = getChildPreviewUrl(childSessionId, componentType)
}

function closeChildPreview() {
  previewChildSession.value = ''
  previewChildUrl.value = ''
}

function refreshChildPreview() {
  if (previewChildUrl.value) {
    const url = previewChildUrl.value
    previewChildUrl.value = ''
    nextTick(() => { previewChildUrl.value = url })
  }
}

// summary 状态映射
function summaryBadgeClass(status: string) {
  if (status === 'all_success') return 'badge-success'
  if (status === 'all_failed') return 'badge-error'
  return 'badge-warn'
}

function summaryBadgeText(status: string) {
  if (status === 'all_success') return '全部成功'
  if (status === 'all_failed') return '全部失败'
  return '部分失败'
}

// ── 页面分析（微码）──
async function handlePageAnalyze() {
  if (!urlInfoPage.value || !canAnalyzePage.value) return

  isPageAnalyzing.value = true
  pageAnalyzedComponents.value = []
  pageLogs.value = []
  addPageLog('info', '开始分析页面...')

  try {
    const response = await analyzePage({
      fileKey: urlInfoPage.value.fileKey,
      nodeId: urlInfoPage.value.nodeId,
      groupId: localStorage.getItem('currentGroupId') || 'default-group',
    } as any)
    if (response.success) {
      pageAnalyzedComponents.value = response.components
      addPageLog('info', `页面分析完成: 发现 ${response.total} 个 cp-xxx 组件`)
    } else {
      addPageLog('error', `页面分析失败: ${response.error || '未知错误'}`)
    }
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || '未知错误'
    addPageLog('error', `分析请求失败: ${msg}`)
  } finally {
    isPageAnalyzing.value = false
  }
}

// ── 页面批量生成（微码）──
async function handlePageGenerate() {
  if (!urlInfoPage.value || !canAnalyzePage.value) return

  isPageGenerating.value = true
  pageAnalyzedComponents.value = []
  pageLogs.value = []
  pageResults.value = []
  pageSummary.value = null
  closeChildPreview()
  addPageLog('info', `开始批量生成: mode=${pageExecMode.value}, concurrency=${pageConcurrency.value}`)

  const params: any = {
    fileKey: urlInfoPage.value.fileKey,
    nodeId: urlInfoPage.value.nodeId,
    groupId: localStorage.getItem('currentGroupId') || 'default-group',
    executionMode: pageExecMode.value,
    concurrency: pageConcurrency.value,
  }
  if (configStore.isConfigured) {
    const raw = configStore.config as any
    const c = raw?.value !== undefined ? raw.value : raw
    params.config = JSON.parse(JSON.stringify(c))
  }

  try {
    const response = await generatePage(params)
    if (!response.success) throw new Error(response.error || '请求失败')

    const sessionId = response.sessionId
    pageSessionId = sessionId
    saveSession(sessionId) // 持久化，关页签后可恢复
    addPageLog('info', `任务已创建: ${sessionId}`)

    connectSSE(sessionId)
  } catch (err: any) {
    addPageLog('error', `生成失败: ${err?.message || '未知错误'}`)
    isPageGenerating.value = false
  }
}

// ─── 页面加载时恢复 ───
onMounted(async () => {
  const querySession = route.query.session as string
  if (querySession) {
    await recoverSession(querySession)
    return
  }
  const saved = loadSession()
  if (!saved) return
  await recoverSession(saved.sessionId, saved.figmaUrl)
})

// 监控边栏点击同页面不同任务时，query 变化触发恢复
watch(() => route.query.session, (newSession) => {
  if (newSession && typeof newSession === 'string') {
    recoverSession(newSession)
  }
})

onUnmounted(() => {
  sseRecovery.stopFallback()
  if (pageEventSource) { pageEventSource.close(); pageEventSource = null }
})
</script>

<style scoped>
/* ── 页面整体 ── */
.unified-generate {
  max-width: 1500px;
  margin: 0 auto;
  padding: 32px 24px 48px;
}

.page-header-bar {
  margin-bottom: 28px;
}

/* 恢复状态横幅 */
.recovery-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 18px;
  background: var(--brand-bg);
  border: 1px solid var(--c-blue-200);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--brand-hover);
  font-weight: 500;
}
.recovery-spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(9,88,217,0.2);
  border-top-color: var(--brand-hover);
  border-radius: var(--radius-full);
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }
.header-bar-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.header-bar-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0 0 4px;
  letter-spacing: -0.5px;
}
.header-bar-desc {
  font-size: 14px;
  color: var(--text-tertiary);
  margin: 0;
}
.btn-header-settings {
  padding: 8px 18px;
  background: transparent;
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.btn-header-settings:hover {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--brand-bg);
}

/* ── 表单卡片 ── */
.form-card {
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  padding: 28px;
  box-shadow: 0 2px 16px var(--shadow-sm);
}

/* ── 类型选择器 ── */
.type-selector { margin-bottom: 24px; }
.type-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;
}
.type-pills {
  display: flex;
  gap: 10px;
}
.type-pill {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 14px;
  background: var(--bg-hover);
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  text-align: center;
}
.type-pill:hover { background: var(--brand-bg); border-color: var(--brand); }
.type-pill.active {
  background: var(--brand-bg);
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-bg);
}
.type-pill:first-child.active {
  background: var(--component-microcode-bg);
  border-color: var(--component-microcode-border);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--component-microcode-bg) 75%, transparent);
}
.type-pill:first-child.active .pill-text,
.type-pill:first-child.active .pill-icon {
  color: var(--component-microcode-strong);
}
.type-pill:last-child.active {
  background: var(--component-vue3-bg);
  border-color: var(--component-vue3-border);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--component-vue3-bg) 75%, transparent);
}
.type-pill:last-child.active .pill-text,
.type-pill:last-child.active .pill-icon {
  color: var(--component-vue3-strong);
}
.pill-icon { font-size: 22px; }
.pill-text { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.pill-hint { font-size: 11px; color: var(--text-tertiary); }
.type-pill.active .pill-text { color: var(--brand); }
.type-pill:first-child.active .pill-text,
.type-pill:first-child.active .pill-icon { color: var(--component-microcode-strong) !important; }
.type-pill:last-child.active .pill-text,
.type-pill:last-child.active .pill-icon { color: var(--component-vue3-strong) !important; }
.type-pill:first-child.active .pill-hint { color: color-mix(in srgb, var(--component-microcode-strong) 72%, var(--text-secondary)); }
.type-pill:last-child.active .pill-hint { color: color-mix(in srgb, var(--component-vue3-strong) 72%, var(--text-secondary)); }

.type-notice {
  margin-top: 12px;
  padding: 10px 14px;
  background: var(--component-microcode-bg);
  border: 1px solid var(--component-microcode-border);
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--component-microcode-strong);
  line-height: 1.6;
}
.type-notice.normal-page-notice { background: var(--success-bg); border-color: var(--success-border); color: var(--success); }

/* ── 表单通用 ── */
.form-group { margin-bottom: 20px; }
.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-lg);
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-hover);
  transition: all 0.2s;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}
.form-input:focus { border-color: var(--brand); background: var(--bg-card); box-shadow: 0 0 0 3px var(--brand-bg-active); }
.form-input:disabled { background: var(--bg-alt); color: var(--text-quaternary); cursor: not-allowed; }

.url-info {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.5;
}
.url-info.success { background: var(--success-bg); color: var(--success); }
.url-info.warning { background: var(--warning-bg); color: var(--warning-text); }
.url-info.error { background: var(--error-bg); color: var(--error-text); }
.url-info :deep(code) { background: rgba(0,0,0,0.05); padding: 1px 6px; border-radius: var(--radius-xs); font-size: 12px; }

/* ── 操作按钮 ── */
.action-row { margin-top: 4px; display: flex; gap: 10px; }
.btn-generate, .btn-analyze {
  padding: 12px 32px;
  border: none;
  border-radius: var(--radius-lg);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.btn-generate {
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
}
.btn-generate:hover:not(:disabled) { background: var(--button-primary-bg-hover); transform: translateY(-1px); box-shadow: var(--shadow-md); }
.btn-generate:disabled { background: var(--button-disabled-bg); color: var(--button-disabled-text); cursor: not-allowed; }
.btn-analyze {
  background: transparent;
  color: var(--brand);
  border: 1.5px solid var(--brand);
}
.btn-analyze:hover:not(:disabled) { background: var(--brand-bg); }
.btn-analyze:disabled { color: var(--text-quaternary); border-color: var(--border-default); cursor: not-allowed; }
.disabled-btn { background: var(--bg-alt) !important; color: var(--text-quaternary) !important; border-color: var(--border-default) !important; cursor: not-allowed !important; }

/* ── 页面生成专用 ── */
.form-row-inline {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
}
.inline-label { font-size: 13px; color: var(--text-tertiary); margin-right: 4px; }
.mode-pills {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-alt);
  border-radius: var(--radius-md);
  padding: 3px;
}
.mode-pills button {
  padding: 7px 16px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-tertiary);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}
.mode-pills button.active { background: var(--bg-card); color: var(--text-primary); box-shadow: var(--shadow-sm); }

.concurrency-stepper {
  display: flex;
  align-items: center;
  gap: 8px;
}
.concurrency-stepper button {
  width: 28px; height: 28px;
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
}
.concurrency-stepper button:hover { border-color: var(--brand); color: var(--brand); }
.concurrency-val { font-size: 14px; font-weight: 700; color: var(--text-primary); min-width: 20px; text-align: center; }

.analyze-section {
  margin-top: 20px;
  background: var(--bg-hover);
  border-radius: var(--radius-lg);
  padding: 16px;
}
.analyze-header {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
}
.analyze-list { display: flex; flex-direction: column; gap: 6px; }
.analyze-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
}
.comp-name { font-size: 13px; font-weight: 600; color: var(--brand); }
.comp-node { font-size: 11px; color: var(--text-tertiary); }

.placeholder-section {
  margin-top: 32px;
  padding: 40px 20px;
  text-align: center;
  border: 2px dashed var(--border-default);
  border-radius: var(--radius-xl);
  background: var(--bg-hover);
}
.placeholder-icon { font-size: 40px; margin-bottom: 12px; }
.placeholder-title { font-size: 16px; font-weight: 700; color: var(--text-tertiary); margin-bottom: 8px; }
.placeholder-desc { font-size: 13px; color: var(--text-quaternary); line-height: 1.6; max-width: 420px; margin: 0 auto; }

/* ── 日志 ── */
.logs-section {
  margin-top: 24px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: 0 2px 12px var(--shadow-sm);
}
.logs-header {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-light);
}
.logs-list { max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.log-item {
  display: flex;
  gap: 12px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  line-height: 1.5;
}
.log-item.error { color: var(--error-text); background: var(--error-bg); }
.log-item.warn { color: var(--warning-text); background: var(--warning-bg); }
.log-time { color: var(--text-tertiary); flex-shrink: 0; }

/* ── 结果列表 ── */
.results-section {
  margin-top: 24px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: 0 2px 12px var(--shadow-sm);
}
.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-light);
}
.results-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.results-badge {
  padding: 3px 12px;
  border-radius: var(--radius-xl);
  font-size: 12px;
  font-weight: 600;
}
.badge-success { background: var(--success-bg); color: var(--success); }
.badge-warn { background: var(--warning-bg); color: var(--warning-text); }
.badge-error { background: var(--error-bg); color: var(--error-text); }

.results-list { display: flex; flex-direction: column; gap: 10px; }
.result-card {
  padding: 14px 16px;
  background: var(--bg-hover);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  transition: border-color 0.2s;
}
.result-card:hover { border-color: var(--border-default); }
.result-card.result-fail { background: var(--error-bg); border-color: var(--error-border); }
.result-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.result-status-icon { font-size: 14px; }
.result-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.result-type-tag {
  padding: 1px 8px;
  background: var(--brand-bg);
  color: var(--brand);
  border-radius: var(--radius-xs);
  font-size: 11px;
  font-weight: 500;
}
.result-card-body { margin-bottom: 8px; }
.result-meta { display: flex; gap: 14px; flex-wrap: wrap; }
.meta-item { font-size: 12px; color: var(--text-tertiary); }
.result-error {
  margin-top: 6px;
  padding: 6px 10px;
  background: var(--error-bg);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--error-text);
}
.result-card-actions { display: flex; gap: 8px; }
.btn-result-action {
  padding: 6px 14px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: inherit;
}
.btn-result-action:hover { border-color: var(--brand); color: var(--brand); background: var(--brand-bg); }

/* ── 子组件预览弹窗 ── */
.child-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}
.child-preview-modal {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 900px;
  height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}
.child-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--text-primary);
  color: var(--text-inverse);
}
.child-preview-title { font-size: 14px; font-weight: 600; }
.child-preview-actions { display: flex; gap: 6px; }
.child-preview-iframe {
  flex: 1;
  width: 100%;
  border: none;
}
</style>
