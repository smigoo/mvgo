<template>
  <div class="lite-generate-page">
    <!-- 顶部导航栏 -->
    <header class="lg-header">
      <div class="lg-header-inner">
        <div class="lg-header-left">
          <button class="lg-back-btn" @click="router.back()" title="返回">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <div class="lg-header-title-group">
            <h1 class="lg-header-title">轻量生成</h1>
            <span class="lg-header-badge">Lite</span>
          </div>
        </div>
        <div class="lg-header-right">
          <router-link to="/generator/components" class="lg-header-link">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
            Figma 生成
          </router-link>
        </div>
      </div>
    </header>

    <main class="lg-main">
      <!-- 左栏：输入配置 -->
      <aside class="lg-config-panel">
        <div class="lg-config-inner">

      <!-- 输入源切换 -->
      <div class="lg-section">
        <label class="lg-section-label">输入来源</label>
        <div class="lg-input-source-switch">
          <button
            class="lg-source-btn"
            :class="{ active: inputSource === 'screenshot' }"
            :disabled="isGenerating"
            @click="inputSource = 'screenshot'"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            截图上传
          </button>
          <button
            class="lg-source-btn"
            :class="{ active: inputSource === 'figma' }"
            :disabled="isGenerating"
            @click="inputSource = 'figma'"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"/>
              <path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z"/>
              <path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"/>
              <path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"/>
              <path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"/>
            </svg>
            Figma 链接
          </button>
        </div>
      </div>

      <!-- 截图上传区 -->
      <div v-if="inputSource === 'screenshot'" class="lg-section">
        <label class="lg-section-label">截图</label>
        <div
          class="lg-upload-zone"
          :class="{ 'is-dragging': isDragging, 'has-image': !!imagePreview, 'is-disabled': isGenerating }"
          @dragover.prevent="onDragOver"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="onDrop"
          @click="triggerFileInput"
        >
          <input
            ref="fileInputRef"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style="display: none"
            @change="onFileSelected"
          />

          <div v-if="!imagePreview" class="lg-upload-placeholder">
            <div class="lg-upload-icon">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
            <p class="lg-upload-text">点击上传或拖拽截图到此处</p>
            <p class="lg-upload-hint">支持 PNG / JPEG / WebP，最大 10MB</p>
          </div>

          <div v-else class="lg-upload-preview">
            <img :src="imagePreview" alt="截图预览" />
            <button class="lg-upload-clear" @click.stop="clearImage" title="清除图片">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <p v-if="imageError" class="lg-field-error">{{ imageError }}</p>
      </div>

      <!-- Figma URL 输入 -->
      <div v-if="inputSource === 'figma'" class="lg-section">
        <label class="lg-section-label">Figma 链接</label>
        <input
          v-model="figmaUrl"
          type="text"
          class="lg-text-input"
          placeholder="https://www.figma.com/design/xxxxx/..."
          :disabled="isGenerating"
        />
        <p class="lg-field-hint">
          支持 Figma 设计链接,需包含 file key 和 node id
        </p>
        <p v-if="figmaUrlError" class="lg-field-error">{{ figmaUrlError }}</p>
      </div>

          <!-- 组件类型 -->
          <div class="lg-section">
            <label class="lg-section-label">组件类型</label>
            <div class="lg-type-switch">
              <button
                class="lg-type-btn"
                :class="{ active: componentType === 'vue3' }"
                :disabled="isGenerating"
                @click="componentType = 'vue3'"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/>
                </svg>
                Vue3 组件
              </button>
              <button
                class="lg-type-btn"
                :class="{ active: componentType === 'microcode' }"
                :disabled="isGenerating"
                @click="componentType = 'microcode'"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
                </svg>
                微码组件
              </button>
            </div>
            <p class="lg-field-hint">{{ componentType === 'microcode' ? '生成含 declare.json + Less 的微码组件' : '生成 Vue3 单文件组件 (SFC)' }}</p>
          </div>

          <!-- 组件名称 -->
          <div class="lg-section">
            <label class="lg-section-label">组件名称 <span class="lg-optional">(可选)</span></label>
            <input
              v-model="componentName"
              type="text"
              class="lg-text-input"
              placeholder="例如：c-stat-card"
              :disabled="isGenerating"
            />
            <p class="lg-field-hint">留空则自动生成名称</p>
          </div>

          <!-- Phase 7 批量生成面板 -->
          <LiteBatchPanel
            ref="batchPanelRef"
            :disabled="isGenerating"
            @confirm-batch="handleBatchGenerate"
            @update:batchMode="onBatchModeChange"
          />

          <!-- 操作按钮 -->
          <div v-if="!isBatchMode" class="lg-section lg-action-section">
            <!-- 开始生成（禁止重复点击与异步请求期间提交） -->
            <button
              v-if="!isGenerating"
              class="lg-generate-btn"
              :disabled="!canGenerate || isGenerating"
              @click="handleGenerate()"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
                <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
              </svg>
              <span>开始生成</span>
              <span class="lg-tier-badge" :class="inputSource === 'screenshot' ? 'tier-lite' : 'tier-max'">
                {{ inputSource === 'screenshot' ? 'Lite' : 'Max' }}
              </span>
            </button>
            <!-- 生成中 → 终止按钮（独立，避免主按钮双重职责导致重复提交） -->
            <button
              v-else
              class="lg-generate-btn is-generating"
              @click="handleCancel()"
            >
              <span class="lg-spinner"></span>
              <span>终止生成</span>
            </button>
          </div>

          <!-- 提示信息 -->
          <div class="lg-info-card">
            <div class="lg-info-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            </div>
            <div class="lg-info-body">
              <p class="lg-info-title">输入模式说明</p>
              <ul class="lg-info-list">
                <li><strong>截图上传</strong>：快速生成（Lite 模式）</li>
                <li><strong>Figma 链接</strong>：精准还原（Max 模式）</li>
                <li>支持 Vue3 组件与微码组件</li>
              </ul>
            </div>
          </div>
        </div>
      </aside>

      <!-- 右栏：输出面板 -->
      <section class="lg-output-panel">
        <!-- 空状态 -->
        <div v-if="!isGenerating && !showPreview" class="lg-empty-state">
          <div class="lg-empty-icon">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <p class="lg-empty-title">上传截图，一键生成组件</p>
          <p class="lg-empty-hint">无需 Figma 链接，快速生成 Vue3 组件</p>
        </div>

        <!-- Phase 7 批量进度 -->
        <div v-if="activeBatchId" class="lg-progress-area">
          <LiteBatchProgress :batchId="activeBatchId" />
        </div>

        <!-- 生成中状态 -->
        <div v-if="isGenerating" class="lg-progress-area">
          <div class="lg-progress-card">
            <div class="lg-progress-header">
              <div class="lg-progress-indicator" :class="{ 'is-success': generationComplete, 'is-error': generationFailed }">
                <span v-if="generationComplete" class="lg-check-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
                <span v-else-if="generationFailed" class="lg-error-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
                </span>
                <span v-else class="lg-spinner-small"></span>
              </div>
              <span class="lg-progress-title">
                {{ generationComplete ? '生成完成' : generationFailed ? '生成失败' : '正在生成...' }}
              </span>
            </div>
            <div class="lg-progress-stages">
              <div
                v-for="(stage, idx) in stages"
                :key="idx"
                class="lg-stage-item"
                :class="{ 'is-active': stage.status === 'running', 'is-done': stage.status === 'done', 'is-error': stage.status === 'error' }"
              >
                <span class="lg-stage-dot"></span>
                <span class="lg-stage-label">{{ stage.label }}</span>
                <span v-if="stage.status === 'running'" class="lg-stage-spinner"></span>
                <span v-else-if="stage.status === 'done'" class="lg-stage-check">✓</span>
                <span v-else-if="stage.status === 'error'" class="lg-stage-error">✗</span>
              </div>
            </div>
          </div>

          <!-- 实时日志 -->
          <div v-if="logs.length > 0" class="lg-log-area">
            <div class="lg-log-header" @click="logsExpanded = !logsExpanded">
              <span class="lg-log-title">生成日志</span>
              <span class="lg-log-toggle">{{ logsExpanded ? '收起' : '展开' }}</span>
            </div>
            <div v-if="logsExpanded" class="lg-log-body">
              <div v-for="(log, idx) in logs" :key="idx" class="lg-log-line" :class="`lg-log-${log.type}`">
                <span class="lg-log-time">{{ log.time }}</span>
                <span class="lg-log-msg">{{ log.message }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 预览区域 -->
        <div v-if="showPreview" class="lg-preview-area">
          <div class="lg-preview-toolbar">
            <span class="lg-preview-title">组件预览</span>
            <div class="lg-preview-actions">
              <button class="lg-preview-btn" @click="openInNewTab" title="在新标签页打开">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </button>
              <button class="lg-preview-btn" @click="copyComponentId" title="复制组件 ID">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          </div>
          <div class="lg-preview-frame-wrapper">
            <iframe
              v-if="previewUrl"
              :src="previewUrl"
              class="lg-preview-iframe"
              frameborder="0"
              sandbox="allow-scripts"
              allowfullscreen
            ></iframe>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { generateLite, createLiteProgressStream, fetchTaskStatus, batchGenerate } from '@/api/lite'
import { getVue3PreviewUrl } from '@/api/component'
import LiteBatchPanel from './LiteBatchPanel.vue'
import LiteBatchProgress from './LiteBatchProgress.vue'

const router = useRouter()

// ─── 状态 ───
const fileInputRef = ref<HTMLInputElement | null>(null)
const imageBase64 = ref('')
const imagePreview = ref('')
const imageError = ref('')
const figmaUrl = ref('')
const figmaUrlError = ref('')
const inputSource = ref<'screenshot' | 'figma'>('screenshot')
const componentName = ref('')
const componentType = ref<'vue3' | 'microcode'>('vue3')
const isGenerating = ref(false)
const generationComplete = ref(false)
const generationFailed = ref(false)
const showPreview = ref(false)
const previewUrl = ref('')
const logsExpanded = ref(true)

const sessionId = ref('')
let eventSource: EventSource | null = null
let currentSessionId = ''
let sseRetryCount = 0
const SSE_MAX_RETRY = 3

// SSE 断线重连
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_BASE_DELAY = 1000
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

// ─── 批量模式 (Phase 7) ───
const isBatchMode = ref(false)
const batchPanelRef = ref<InstanceType<typeof LiteBatchPanel> | null>(null)
const activeBatchId = ref('')
const batchMessage = ref('')

// 监听批量模式切换
function onBatchModeChange(val: boolean) {
  isBatchMode.value = val
}

// 批量生成确认（来自 LiteBatchPanel）
async function handleBatchGenerate(items: any[]) {
  isGenerating.value = true
  activeBatchId.value = ''
  batchMessage.value = ''

  try {
    const result = await batchGenerate({
      items: items.map((item) => ({
        imageBase64: item.base64,
        componentName: item.name?.replace(/\.[^.]+$/, '') || 'component',
        componentType: 'vue3',
      })),
    })

    if (result.success && result.batchId) {
      activeBatchId.value = result.batchId
      batchMessage.value = result.message
    } else {
      batchMessage.value = result.message || '批量生成启动失败'
    }
  } catch (err: any) {
    batchMessage.value = err?.response?.data?.message || '批量生成失败'
  } finally {
    isGenerating.value = false
  }
}

const stages = ref([
  { label: '预检', status: 'pending' },
  { label: '视觉分析', status: 'pending' },
  { label: '代码生成', status: 'pending' },
  { label: '保存产物', status: 'pending' },
])

const logs = ref<{ type: string; message: string; time: string }[]>([])

// ─── 任务持久化 ───
const STORAGE_KEY = 'lite-generate-task'

interface PersistedTask {
  sessionId: string
  componentType: 'vue3' | 'microcode'
  createdAt: number
}

function persistTask(sessionId: string, componentType: 'vue3' | 'microcode') {
  const task: PersistedTask = {
    sessionId,
    componentType,
    createdAt: Date.now(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(task))
}

function restoreTask(): PersistedTask | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    
    const task: PersistedTask = JSON.parse(stored)
    // 超过 1 小时的任务视为过期
    if (Date.now() - task.createdAt > 3600000) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return task
  } catch {
    return null
  }
}

function clearPersistedTask() {
  localStorage.removeItem(STORAGE_KEY)
}

// 页面加载时恢复任务状态
onMounted(async () => {
  const restored = restoreTask()
  if (restored) {
    try {
      // 查询任务状态
      const status = await fetchTaskStatus(restored.sessionId)
      if (status && status.state !== 'completed' && status.state !== 'failed') {
        // 任务还在运行，恢复进度
        sessionId.value = restored.sessionId
        currentSessionId = restored.sessionId
        isGenerating.value = true
        componentType.value = restored.componentType
        
        addLog('info', '检测到未完成的生成任务，正在恢复进度...')
        bindSseEvents(restored.sessionId)
      } else {
        // 任务已完成或失败，清理存储
        clearPersistedTask()
      }
    } catch (err) {
      // 查询失败，可能是任务不存在，清理存储
      clearPersistedTask()
    }
  }

  // Phase 7: 全局粘贴截图监听
  document.addEventListener('paste', onPagePaste)
})

// ─── 计算属性 ───
const canGenerate = computed(() => {
  if (inputSource.value === 'screenshot') {
    return !!imageBase64.value && !imageError.value;
  } else {
    return !!figmaUrl.value && !figmaUrlError.value;
  }
});

const generationTier = computed(() => {
  return inputSource.value === 'figma' ? 'max' : 'lite';
});

// ─── 拖拽上传 ───
const isDragging = ref(false)

function onDragOver(e: DragEvent) {
  if (isGenerating.value) return
  isDragging.value = true
}

function onDrop(e: DragEvent) {
  if (isGenerating.value) return
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    handleImageFile(files[0])
  }
}

function triggerFileInput() {
  if (isGenerating.value) return
  fileInputRef.value?.click()
}

function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    handleImageFile(target.files[0])
  }
}

function handleImageFile(file: File) {
  imageError.value = ''

  // 校验类型
  const validTypes = ['image/png', 'image/jpeg', 'image/webp']
  if (!validTypes.includes(file.type)) {
    imageError.value = '仅支持 PNG / JPEG / WebP 格式'
    return
  }

  // 校验大小（10MB）
  if (file.size > 10 * 1024 * 1024) {
    imageError.value = '图片大小不能超过 10MB'
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    const result = e.target?.result as string
    imagePreview.value = result
    // 提取 base64 数据（去掉 data:image/xxx;base64, 前缀）
    imageBase64.value = result.split(',')[1] || result
  }
  reader.readAsDataURL(file)
}

function clearImage() {
  imageBase64.value = ''
  imagePreview.value = ''
  imageError.value = ''
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

// ─── 生成逻辑 ───
async function handleGenerate() {
  if (!canGenerate.value) return

  isGenerating.value = true
  generationComplete.value = false
  generationFailed.value = false
  showPreview.value = false
  previewUrl.value = ''
  logs.value = []
  stages.value = [
    { label: '预检', status: 'pending' },
    { label: '视觉分析', status: 'pending' },
    { label: '代码生成', status: 'pending' },
    { label: '保存产物', status: 'pending' },
  ]

  addLog('info', '开始轻量组件生成...')

  try {
    const params = {
      componentName: componentName.value || undefined,
      componentType: componentType.value,
      ...(inputSource.value === 'screenshot'
        ? { imageBase64: imageBase64.value }
        : { figmaUrl: figmaUrl.value }),
    }

    const response = await generateLite(params)

    if (!response.success) {
      throw new Error('请求失败')
    }

    sessionId.value = response.sessionId
    currentSessionId = response.sessionId
    
    // 持久化任务信息
    persistTask(response.sessionId, componentType.value)
    
    addLog('info', `任务已创建: ${response.sessionId}`)

    // 绑定 SSE
    bindSseEvents(response.sessionId)
  } catch (err: any) {
    addLog('error', `生成失败: ${err?.message || '未知错误'}`)
    isGenerating.value = false
    generationFailed.value = true
  }
}

function bindSseEvents(sid: string) {
  if (eventSource) {
    eventSource.close()
  }

  eventSource = createLiteProgressStream(sid)

  // 连接成功时重置重连计数
  eventSource.onopen = () => {
    reconnectAttempts = 0
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)

      if (data.type === 'progress') {
        const stage = data.stage || ''
        const message = data.message || ''
        addLog('info', `${stage}: ${message}`)

        // 更新阶段状态
        if (stage.includes('预检') || stage.includes('precheck')) {
          stages.value[0].status = 'running'
        } else if (stage.includes('分析') || stage.includes('analyze') || stage.includes('vision')) {
          stages.value[0].status = 'done'
          stages.value[1].status = 'running'
        } else if (stage.includes('生成') || stage.includes('generate') || stage.includes('code')) {
          stages.value[1].status = 'done'
          stages.value[2].status = 'running'
        } else if (stage.includes('保存') || stage.includes('save') || stage.includes('workspace')) {
          stages.value[2].status = 'done'
          stages.value[3].status = 'running'
        }
      } else if (data.type === 'complete') {
        stages.value.forEach((s) => (s.status = 'done'))
        generationComplete.value = true
        isGenerating.value = false
        clearPersistedTask()
        addLog('success', '组件生成完成！')

        // 打开预览
        const groupId = localStorage.getItem('currentGroupId') || 'default-group'
        previewUrl.value = getVue3PreviewUrl(groupId, sid)
        showPreview.value = true
      } else if (data.type === 'error') {
        generationFailed.value = true
        isGenerating.value = false
        clearPersistedTask()
        addLog('error', `生成失败: ${data.message || '未知错误'}`)
      }
    } catch (e) {
      console.warn('[Lite SSE] 解析失败:', e)
    }
  }

  eventSource.onerror = () => {
    console.warn('[Lite SSE] 连接断开, readyState:', eventSource?.readyState)

    // 只在 CONNECTING 或 OPEN 状态时触发重连
    // CLOSED = 2 表示主动关闭，不应重连
    if (eventSource?.readyState === EventSource.CLOSED) {
      eventSource = null
      return
    }

    eventSource?.close()
    eventSource = null

    // 超过重试次数，标记为断开状态
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      addLog('warn', `SSE 重连失败 ${MAX_RECONNECT_ATTEMPTS} 次，连接已断开`)
      reconnectAttempts = 0
      // 检查任务最终状态
      checkTaskAndRecover(sid)
      return
    }

    // 指数退避重连
    reconnectAttempts++
    const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1)
    addLog('warn', `SSE 连接断开，${delay / 1000}s 后尝试第 ${reconnectAttempts} 次重连...`)

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (isGenerating.value) {
        bindSseEvents(sid)
      }
    }, delay)
  }
}

async function checkTaskAndRecover(sid: string) {
  try {
    const resp = await fetchTaskStatus(sid)
    if (resp?.success && resp.data.task) {
      const task = resp.data.task
      if (task.status === 'success' || task.status === 'completed') {
        stages.value.forEach((s) => (s.status = 'done'))
        generationComplete.value = true
        isGenerating.value = false
        clearPersistedTask()
        const groupId = localStorage.getItem('currentGroupId') || 'default-group'
        previewUrl.value = getVue3PreviewUrl(groupId, sid)
        showPreview.value = true
      } else if (task.status === 'failed') {
        generationFailed.value = true
        isGenerating.value = false
        clearPersistedTask()
      } else {
        // 仍在运行，重建 SSE
        addLog('info', '任务仍在运行，重新连接...')
        bindSseEvents(sid)
      }
    }
  } catch (err) {
    console.error('[Lite] 任务状态检查失败:', err)
  }
}

async function handleCancel() {
  if (!sessionId.value) return
  try {
    // 调用取消 API（复用 generator 的 cancelTask）
    const { cancelTask } = await import('@/api/lite')
    await cancelTask(sessionId.value)
    addLog('info', '已发送终止请求')
    isGenerating.value = false
    clearPersistedTask()
    eventSource?.close()
    eventSource = null
  } catch (err: any) {
    addLog('error', `终止失败: ${err?.message}`)
  }
}

function addLog(type: string, message: string) {
  const now = new Date()
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
  logs.value.push({ type, message, time })
}

function openInNewTab() {
  if (previewUrl.value) {
    window.open(previewUrl.value, '_blank')
  }
}

// ─── 截图粘贴支持 ───
function onPagePaste(e: ClipboardEvent) {
  if (isGenerating.value) return
  const items = e.clipboardData?.items
  if (!items) return

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const blob = item.getAsFile()
      if (!blob) continue

      const reader = new FileReader()
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string)?.split(',')[1] || ''
        const preview = ev.target?.result as string
        const name = `paste-${Date.now()}.png`

        if (isBatchMode.value) {
          batchPanelRef.value?.batchItems?.push({ name, preview, base64 })
          addLog('info', `已粘贴截图到批量列表 (${Math.round(base64.length / 1024)}KB)`)
        } else {
          imageBase64.value = base64
          imagePreview.value = preview
          imageError.value = ''
          addLog('info', `已粘贴截图 (${Math.round(base64.length / 1024)}KB)`)
        }
      }
      reader.readAsDataURL(blob)
      break
    }
  }
}

function copyComponentId() {
  if (sessionId.value) {
    navigator.clipboard.writeText(sessionId.value)
    addLog('info', `已复制组件 ID: ${sessionId.value}`)
  }
}

// ─── 生命周期 ───
onUnmounted(() => {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  document.removeEventListener('paste', onPagePaste)
})
</script>

<style scoped lang="less">
.lite-generate-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary, #f5f7fa);
}

// ─── 顶部导航栏 ───
.lg-header {
  height: 56px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-secondary, #fff);
  flex-shrink: 0;
}

.lg-header-inner {
  max-width: 1400px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.lg-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lg-back-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #e5e7eb);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-primary, #374151);
  transition: all 0.15s;

  &:hover {
    background: var(--bg-hover, #f3f4f6);
  }
}

.lg-header-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lg-header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #111827);
  margin: 0;
}

.lg-header-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--tier-max-bg);
  color: var(--tier-max-text);
  border: 1px solid var(--tier-max-border);
  letter-spacing: 0.5px;
}

.lg-header-right {
  display: flex;
  align-items: center;
}

.lg-header-link {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  text-decoration: none;
  padding: 6px 10px;
  border-radius: 6px;
  transition: all 0.15s;

  &:hover {
    color: var(--text-primary, #111827);
    background: var(--bg-hover, #f3f4f6);
  }
}

// ─── 主体布局 ───
.lg-main {
  flex: 1;
  display: flex;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  padding: 24px;
  gap: 24px;
}

// ─── 左栏：配置面板 ───
.lg-config-panel {
  width: 360px;
  flex-shrink: 0;
}

.lg-config-inner {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.lg-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lg-section-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #374151);
}

.lg-optional {
  font-weight: 400;
  color: var(--text-tertiary, #9ca3af);
  font-size: 12px;
}

// ─── 截图上传区 ───
.lg-upload-zone {
  border: 2px dashed var(--border-color, #d1d5db);
  border-radius: 12px;
  padding: 32px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-secondary, #fff);
  position: relative;
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover:not(.is-disabled) {
    border-color: var(--button-primary-border);
    background: var(--button-ghost-bg-hover);
  }

  &.is-dragging {
    border-color: var(--button-primary-border);
    background: var(--button-ghost-bg-active);
    transform: scale(1.01);
  }

  &.has-image {
    padding: 12px;
    border-style: solid;
    border-color: var(--border-color, #e5e7eb);
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.lg-upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.lg-upload-icon {
  color: var(--text-tertiary, #9ca3af);
  margin-bottom: 4px;
}

.lg-upload-text {
  font-size: 14px;
  color: var(--text-primary, #374151);
  margin: 0;
}

.lg-upload-hint {
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  margin: 0;
}

.lg-upload-preview {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    max-width: 100%;
    max-height: 240px;
    border-radius: 8px;
    object-fit: contain;
  }
}

.lg-upload-clear {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(0, 0, 0, 0.8);
    transform: scale(1.1);
  }
}

.lg-field-error {
  font-size: 12px;
  color: #ef4444;
  margin: 0;
}

.lg-field-hint {
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  margin: 0;
}

// ─── 输入源切换 ───
.lg-input-source-switch {
  display: flex;
  gap: 8px;
  background: var(--bg-secondary, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  padding: 4px;
}

.lg-source-btn {
  flex: 1;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    color: var(--text-primary, #111827);
    background: var(--bg-hover, #f3f4f6);
  }

  &.active {
    color: var(--button-primary-text);
    background: var(--button-primary-bg);
    box-shadow: var(--button-primary-shadow);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// ─── 组件类型切换 ───
.lg-type-switch {
  display: flex;
  gap: 8px;
}

.lg-type-btn {
  flex: 1;
  height: 36px;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 8px;
  background: var(--bg-secondary, #fff);
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover:not(:disabled) {
    border-color: var(--button-primary-border);
    color: var(--button-ghost-text);
    background: var(--button-ghost-bg-hover);
  }

  &.active {
    border-color: var(--button-primary-border);
    color: var(--button-ghost-text);
    background: var(--button-ghost-bg-active);
    font-weight: 600;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// ─── 档位徽章（渐变胶囊）───
.lg-tier-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  margin-left: 6px;
  border: 1px solid transparent;
  box-shadow: 0 1px 4px rgba(15, 23, 42, .12);

  &.tier-lite {
    background: var(--tier-lite-grad);
    color: var(--tier-lite-text);
  }

  &.tier-max {
    background: var(--tier-max-grad);
    color: var(--tier-max-text);
  }
}

.lg-text-input {
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-primary, #374151);
  background: var(--bg-secondary, #fff);
  transition: all 0.15s;

  &:focus {
    outline: none;
    border-color: var(--button-primary-border);
    box-shadow: var(--shadow-focus);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

// ─── 操作按钮 ───
.lg-action-section {
  margin-top: 8px;
}

.lg-generate-btn {
  width: 100%;
  height: 44px;
  border-radius: 10px;
  border: 1px solid var(--button-primary-border);
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: var(--button-primary-shadow);

  &:hover:not(:disabled) {
    background: var(--button-primary-bg-hover);
    border-color: var(--button-primary-border-hover);
    transform: translateY(-1px);
    box-shadow: var(--button-primary-shadow-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  &.is-generating {
    background: var(--button-danger-bg);
    border-color: var(--button-danger-border);
    box-shadow: var(--button-danger-shadow);

    &:hover {
      background: var(--button-danger-bg-hover);
      border-color: var(--button-danger-border-hover);
      box-shadow: var(--button-danger-shadow-hover);
    }
  }
}

.lg-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: lg-spin 0.8s linear infinite;
}

@keyframes lg-spin {
  to {
    transform: rotate(360deg);
  }
}

// ─── 提示卡片 ───
.lg-info-card {
  display: flex;
  gap: 10px;
  padding: 14px;
  border-radius: 10px;
  background: var(--bg-info, #eff6ff);
  border: 1px solid var(--border-info, #bfdbfe);
}

.lg-info-icon {
  flex-shrink: 0;
  color: #3b82f6;
  margin-top: 1px;
}

.lg-info-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lg-info-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #1e40af);
  margin: 0;
}

.lg-info-list {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--text-secondary, #3b82f6);
  line-height: 1.6;

  li {
    margin: 0;
  }
}

// ─── 右栏：输出面板 ───
.lg-output-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

// ─── 空状态 ───
.lg-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
}

.lg-empty-icon {
  color: var(--text-tertiary, #d1d5db);
  margin-bottom: 8px;
}

.lg-empty-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary, #374151);
  margin: 0;
}

.lg-empty-hint {
  font-size: 13px;
  color: var(--text-tertiary, #9ca3af);
  margin: 0;
}

// ─── 进度区域 ───
.lg-progress-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lg-progress-card {
  background: var(--bg-secondary, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  padding: 20px;
}

.lg-progress-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.lg-progress-indicator {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--task-running);

  &.is-success {
    background: var(--task-success);
  }

  &.is-error {
    background: var(--task-failed);
  }
}

.lg-check-icon,
.lg-error-icon {
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lg-spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: lg-spin 0.8s linear infinite;
}

.lg-progress-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #374151);
}

// ─── 阶段列表 ───
.lg-progress-stages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lg-stage-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  transition: all 0.2s;

  &.is-active {
    background: var(--task-running-bg);
    color: var(--task-running-text);
    font-weight: 500;
  }

  &.is-done {
    color: var(--task-success-text);
  }

  &.is-error {
    color: var(--task-failed-text);
  }
}

.lg-stage-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border-color, #d1d5db);
  flex-shrink: 0;

  .is-active & {
    background: var(--task-running);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--task-running) 20%, transparent);
  }

  .is-done & {
    background: var(--task-success);
  }

  .is-error & {
    background: var(--task-failed);
  }
}

.lg-stage-label {
  flex: 1;
}

.lg-stage-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid color-mix(in srgb, var(--task-running) 30%, transparent);
  border-top-color: var(--task-running);
  border-radius: 50%;
  animation: lg-spin 0.8s linear infinite;
}

.lg-stage-check {
  font-size: 12px;
  font-weight: 600;
}

.lg-stage-error {
  font-size: 12px;
  font-weight: 600;
}

// ─── 日志区域 ───
.lg-log-area {
  background: var(--bg-secondary, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  overflow: hidden;
}

.lg-log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--border-color, #e5e7eb);

  &:hover {
    background: var(--bg-hover, #f9fafb);
  }
}

.lg-log-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #374151);
}

.lg-log-toggle {
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
}

.lg-log-body {
  max-height: 240px;
  overflow-y: auto;
  padding: 12px 16px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
}

.lg-log-line {
  display: flex;
  gap: 8px;
  padding: 2px 0;

  &.lg-log-info {
    color: var(--text-secondary, #6b7280);
  }

  &.lg-log-success {
    color: var(--task-success);
  }

  &.lg-log-error {
    color: var(--task-failed);
  }

  &.lg-log-warn {
    color: var(--warning);
  }
}

.lg-log-time {
  color: var(--text-tertiary, #9ca3af);
  flex-shrink: 0;
}

.lg-log-msg {
  word-break: break-all;
}

// ─── 预览区域 ───
.lg-preview-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  overflow: hidden;
  min-height: 400px;
}

.lg-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.lg-preview-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #374151);
}

.lg-preview-actions {
  display: flex;
  gap: 6px;
}

.lg-preview-btn {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #e5e7eb);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary, #6b7280);
  transition: all 0.15s;

  &:hover {
    background: var(--bg-hover, #f3f4f6);
    color: var(--text-primary, #374151);
  }
}

.lg-preview-frame-wrapper {
  flex: 1;
  padding: 16px;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
}

.lg-preview-iframe {
  width: 100%;
  height: 100%;
  min-height: 360px;
  border: none;
  border-radius: 8px;
  background: var(--bg-primary, #f5f7fa);
}

// ─── 响应式 ───
@media (max-width: 900px) {
  .lg-main {
    flex-direction: column;
    padding: 16px;
  }

  .lg-config-panel {
    width: 100%;
  }
}
</style>