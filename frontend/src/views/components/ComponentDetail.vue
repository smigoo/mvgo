<template>
  <div class="component-detail">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-container">
      <div class="spinner"></div>
      <p>加载组件中...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-container">
      <p>{{ error }}</p>
      <button @click="loadComponent" class="retry-btn">重试</button>
      <button @click="$router.back()" class="back-btn">返回</button>
    </div>

    <!-- 组件内容 -->
    <div v-else-if="component" class="detail-container">
      <!-- 顶部工具栏 -->
      <header class="detail-header">
        <button @click="$router.back()" class="back-button">
          ← 返回列表
        </button>

        <div class="header-info">
          <h1 class="component-title">
            {{ component.name }}
            <span class="type-badge" :class="isVue3Component ? 'vue3' : 'phase2'">
              {{ isVue3Component ? 'Vue3组件' : '微码组件' }}
            </span>
            <span v-if="isPublicComponent" class="public-badge">公共</span>
          </h1>
          <p class="component-meta">
            创建者: {{ component.creatorId?.username || '未知' }} ·
            创建于 {{ formatDate(component.createdAt) }} ·
            更新于 {{ formatDate(component.updatedAt) }}
            <template v-if="isPublicComponent && component.sharedAt"> ·
              发布于 {{ formatDate(component.sharedAt) }}
            </template>
          </p>
        </div>

        <div class="header-actions">
          <button
            v-if="isOwnComponent && !isPublicComponent"
            @click="publishCurrentComponent"
            class="action-button publish-btn"
            :disabled="publishing"
            title="发布到公共组件池，所有用户可见可下载"
          >
            {{ publishing ? '处理中…' : '发布到公共池' }}
          </button>
          <button
            v-if="isOwnComponent && isPublicComponent"
            @click="unpublishCurrentComponent"
            class="action-button"
            :disabled="publishing"
            title="从公共组件池下架，个人副本保留"
          >
            {{ publishing ? '处理中…' : '下架' }}
          </button>
          <button v-if="figmaUrl" @click="regenerate" class="action-button" title="用相同 Figma 源重新生成">
            重新生成
          </button>
          <button @click="openInNewTab" class="action-button" title="在新标签页打开">
            新标签页
          </button>
          <button @click="refreshPreview" class="action-button" title="刷新预览">
            刷新
          </button>
          <button
            v-if="isVue3Component && !bindingStatus.bound"
            @click="openBindingWizard"
            class="action-button binding-btn"
            title="对接接口"
          >
            对接接口
          </button>
          <button
            v-if="isVue3Component && bindingStatus.bound"
            @click="confirmUnbind"
            class="action-button binding-btn binding-btn--bound"
            :disabled="rollingBack"
            title="撤回接口对接"
          >
            {{ rollingBack ? '撤回中…' : '撤回对接' }}
          </button>
          <button
            @click="openAnalysisDrawer"
            class="action-button analysis-btn"
            title="对比真实预览与 Figma 标准预览图，输出只读分析报告"
          >
            AI 对比分析
          </button>
          <McSpecCheckButton
            v-if="!isVue3Component && businessComponentId"
            :component-id="businessComponentId"
          />
          <button
            v-if="!isVue3Component"
            @click="toggleDocPanel"
            class="action-button doc-btn"
            title="上传需求文档纠偏（微码组件，UI 缓存复用只重跑代码生成）"
          >
            文档纠偏
          </button>
          <button v-if="isOwnComponent" @click="editComponent" class="action-button primary" :title="editorOpen ? '隐藏源码' : '编辑源码'">
            {{ editorOpen ? '隐藏代码' : '编辑代码' }}
          </button>
        </div>
      </header>

      <!-- Figma 源链接 -->
      <div v-if="figmaUrl" class="figma-source-bar">
        <span class="figma-source-label">Figma 源:</span>
        <a :href="figmaUrl" target="_blank" rel="noopener" class="figma-source-link" :title="figmaUrl">
          {{ figmaUrl }}
        </a>
      </div>

      <!-- 编辑 + 预览 分屏 -->
      <div class="edit-preview-split" :class="{ 'editor-collapsed': !editorOpen }">
        <!-- 左：源码编辑器（内联，默认展开，无需进入编辑态再点一次） -->
        <div v-if="editorOpen" class="editor-pane">
          <div class="editor-pane-bar">
            <span class="editor-file">index.vue</span>
            <span class="editor-status">
              <template v-if="editorLoading">加载中…</template>
              <template v-else-if="editorError"><span class="editor-err">{{ editorError }}</span></template>
              <template v-else-if="editorSaving">保存中…</template>
              <template v-else-if="editorModified"><span class="editor-dirty">● 未保存</span></template>
              <template v-else>已保存</template>
            </span>
          </div>
          <div class="editor-host">
            <MonacoEditor
              v-model="editorContent"
              language="html"
              theme="vs-dark"
              @update:modelValue="onEditorChange"
            />
          </div>
        </div>

        <!-- 右：实时预览 -->
        <div class="preview-pane">
          <div class="preview-section">
            <!-- 视口切换器 -->
            <div class="viewport-toolbar">
              <div class="viewport-buttons">
                <button
                  v-for="vp in viewports"
                  :key="vp.name"
                  :class="['viewport-btn', { active: viewport === vp.name }]"
                  @click="viewport = vp.name"
                  :title="vp.title"
                >
                  {{ vp.label }}
                </button>
              </div>

              <div class="preview-url">
                <input
                  :value="previewUrl"
                  readonly
                  class="url-input"
                  @click="($event.target as HTMLInputElement).select()"
                />
                <button @click="copyUrl" class="copy-btn icon-tooltip" data-tooltip="复制链接" aria-label="复制链接">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                </button>
              </div>
            </div>

            <!-- iframe预览 -->
            <div class="preview-frame-container" :class="`viewport-${viewport}`">
              <iframe
                :key="iframeKey"
                :src="previewUrl"
                class="preview-iframe"
                :style="previewIframeStyle"
                sandbox="allow-scripts"
                @load="onIframeLoad"
              />
            </div>

            <!-- 组件加载失败的非阻塞提示（来自 iframe 内 postMessage） -->
            <PreviewErrorBanner :message="previewError" @dismiss="clearPreviewError" />
          </div>
        </div>
      </div>

      <!-- 组件信息面板（可选） -->
      <aside class="info-panel" v-if="showInfo">
        <h3>组件信息</h3>
        <div class="info-item">
          <label>组件名称:</label>
          <span>{{ component.name }}</span>
        </div>
        <div class="info-item">
          <label>描述:</label>
          <span>{{ component.description || '无' }}</span>
        </div>
        <div class="info-item">
          <label>群组ID:</label>
          <span>{{ component.groupId }}</span>
        </div>
        <div class="info-item">
          <label>组件ID:</label>
          <span>{{ businessComponentId }}</span>
        </div>
      </aside>

      <!-- 文档纠偏面板（S15 路径B — 微码组件补文档再生成 + 新旧并排） -->
      <div v-if="docPanelOpen" class="doc-panel-section">
        <DocComparePanel
          :componentId="businessComponentId"
          :groupId="component?.groupId || ''"
          :oldDeclare="oldDeclare"
          @overwritten="onDocOverwritten"
          @discarded="docPanelOpen = false"
        />
      </div>

      <!-- 接口对接向导：由根级 App.vue 全局挂载（含 iframe 内触发），本页不再重复挂载 -->
    </div>

    <ComponentAnalysisDrawer
      v-model:visible="analysisDrawerVisible"
      :loading="analysisLoading"
      :error="analysisError"
      :report="analysisReport"
    />

    <!-- 推送到公共池弹窗 -->
    <PublishToPoolModal
      v-model:open="publishModalOpen"
      :component="component"
      :submitting="publishing"
      @ok="onPublishOk"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { analyzeComponentVisual, getComponent, getPreviewUrl, getVue3PreviewUrl, getMcPreviewUrl, getRouteUrl, unpublishComponent, type Component } from '@/api/component'
import { publishToPublicPool } from '@/utils/component-pool'
import PublishToPoolModal from '@/components/PublishToPoolModal.vue'
import { useUserStore } from '@/store'
import { resolveComponentType } from '@/utils/task-actions'
import ComponentAnalysisDrawer from '@/components/ComponentAnalysisDrawer.vue'
import McSpecCheckButton from '@/components/McSpecCheckButton.vue'
import DocComparePanel from '@/components/doc-binding/DocComparePanel.vue'
import MonacoEditor from '@/components/MonacoEditor.vue'
import PreviewErrorBanner from '@/components/PreviewErrorBanner.vue'
import { usePreviewErrorBridge } from '@/composables/usePreviewErrorBridge'
import { API_BINDING_REFRESH_EVENT } from '@/composables/useApiBindingBridge'
import http from '@/core/http'

const route = useRoute()
const router = useRouter()

// 状态
const component = ref<Component | null>(null)
const loading = ref(false)
const error = ref('')
const iframeKey = ref(0)
// 缓存破坏键：每次 refreshPreview() 更新，确保 iframe URL 唯一 → 跳过浏览器/SPA/运行时编译器缓存
const previewCacheKey = ref(Date.now())
// Figma 原始尺寸：用于桌面视图下预览 iframe 按原始比例缩放
const figmaDimensions = ref<{ width: number; height: number } | null>(null)
// 预览 iframe 内组件加载失败的非阻塞提示（来自 postMessage）
const { previewError, clearPreviewError } = usePreviewErrorBridge()

// ── 实时编辑预览（Playground 内联源码编辑器）──
// 编辑器直接读写组件 index.vue 源码：dev 经 /__raw（与预览读取同源），prod 经后端文件接口。
// 保存后刷新预览 iframe → /__raw 拉取最新源码 → 浏览器内 vue3-sfc-loader 重编译。
// 即便改出语法错误，也只在 iframe 内被 ErrorBoundary 捕获，绝不污染父 Playground。
const editorOpen = ref(true)
const editorContent = ref('')
const editorOriginal = ref('')
const editorSaving = ref(false)
const editorLoading = ref(false)
const editorError = ref('')
const editorModified = computed(() => editorContent.value !== editorOriginal.value)
const businessComponentId = computed(() =>
  component.value?.componentId ||
  component.value?.metadata?.componentId ||
  component.value?.metadata?.sessionId ||
  ''
)
const sessionId = computed(() => businessComponentId.value)
const groupId = computed(() => component.value?.groupId || 'default-group')

// 🛡️ 2026-09-03：接口对接状态（已绑定 → 按钮切换「撤回对接」，与 TaskDetail 行为一致）
const bindingStatus = ref<{ bound: boolean; bindingId: string }>({ bound: false, bindingId: '' })
const rollingBack = ref(false)
async function loadBindingStatus(cid: string) {
  try {
    const resp: any = await http.get(`/api/vue3/bindings?componentId=${encodeURIComponent(cid)}`)
    const list = resp?.data?.bindings || resp?.bindings || []
    if (Array.isArray(list) && list.length > 0) {
      bindingStatus.value = { bound: true, bindingId: list[0]?.bindingId || '' }
    } else {
      bindingStatus.value = { bound: false, bindingId: '' }
    }
  } catch (e) {
    bindingStatus.value = { bound: false, bindingId: '' }
  }
}
async function handleUnbind() {
  if (!bindingStatus.value.bindingId) return
  rollingBack.value = true
  try {
    const resp: any = await http.post(`/api/vue3/bindings/${bindingStatus.value.bindingId}/delete`)
    if (resp?.success || resp?.data?.success) {
      alert('已撤回对接，组件已恢复')
      bindingStatus.value = { bound: false, bindingId: '' }
      refreshPreview()
    } else {
      alert(resp?.data?.error || resp?.message || '撤回失败')
    }
  } catch (err: any) {
    alert('撤回失败: ' + (err?.message || err))
  } finally {
    rollingBack.value = false
  }
}
let saveTimer: ReturnType<typeof setTimeout> | null = null
const viewport = ref<'desktop' | 'tablet' | 'mobile'>('desktop')
const showInfo = ref(false)
// 文档纠偏面板（S15 路径B）
const docPanelOpen = ref(false)
const oldDeclare = ref<any>(null)
const analysisDrawerVisible = ref(false)
const analysisLoading = ref(false)
const analysisError = ref('')
const analysisReport = ref<any | null>(null)

const isVue3Component = computed(() => {
  const target = component.value?.target || component.value?.metadata?.target
  const metaType = component.value?.metadata?.type
  const componentId = businessComponentId.value

  if (target === 'vue3' || metaType === 'vue3') return true
  if (target === 'microcode' || metaType === 'phase2' || metaType === 'microcode') return false

  // 历史数据兜底，后续应随数据迁移移除（单一真相源 resolveComponentType）。
  const prefixType = resolveComponentType(componentId)
  if (prefixType === 'vue3') return true
  if (prefixType === 'microcode') return false

  return true
})

// ── 公共组件池：发布状态与权限 ──
const userStore = useUserStore()
const publishing = ref(false)
const publishModalOpen = ref(false)

/** 是否当前用户自己的组件（creatorId 可能是 populate 对象或裸 id） */
const isOwnComponent = computed(() => {
  const myId = (userStore.userInfo as any)?.id || (userStore.userInfo as any)?._id
  const creatorRaw = component.value?.creatorId as any
  const creatorId = creatorRaw?._id || creatorRaw
  return Boolean(myId && creatorId && String(creatorId) === String(myId))
})

const isPublicComponent = computed(() => component.value?.visibility === 'public')

// 发布到公共组件池（弹窗确认，名称可改、类型带入）
function publishCurrentComponent() {
  if (!component.value) return
  publishModalOpen.value = true
}

async function onPublishOk(payload: { name: string }) {
  const record = component.value
  if (!record || publishing.value) return
  publishing.value = true
  try {
    await publishToPublicPool(record, payload)
    publishModalOpen.value = false
    await loadComponent()
  } catch (err: any) {
    alert(err.response?.data?.message || '发布失败')
  } finally {
    publishing.value = false
  }
}

// 从公共组件池下架（个人副本保留）
async function unpublishCurrentComponent() {
  if (!component.value || publishing.value) return
  if (!confirm(`确定将组件"${component.value.name}"从公共组件池下架吗？下架后仅自己可见。`)) return
  publishing.value = true
  try {
    await unpublishComponent(component.value._id)
    await loadComponent()
  } catch (err: any) {
    alert(err.response?.data?.message || '下架失败')
  } finally {
    publishing.value = false
  }
}

/** 加载组件 declare.json（旧版四配置，供新旧对比） */
async function loadOldDeclare() {
  const cid = businessComponentId.value
  if (!cid) return
  try {
    const data = await http.get(`/api/component/${cid}/files`)
    const declareText = data?.data?.files?.['declare.json'] || data?.data?.['declare.json']
    if (declareText) {
      oldDeclare.value = typeof declareText === 'string' ? JSON.parse(declareText) : declareText
    }
  } catch (e) {
    console.warn('加载 declare.json 失败（非阻塞）', e)
  }
}

async function toggleDocPanel() {
  docPanelOpen.value = !docPanelOpen.value
  if (docPanelOpen.value && !oldDeclare.value) {
    await loadOldDeclare()
  }
}

/** 确认覆盖后：关闭面板 + 刷新组件数据与预览 */
async function onDocOverwritten() {
  docPanelOpen.value = false
  await loadComponent()
  refreshPreview()
}

// 视口配置
const viewports = [
  { name: 'desktop', label: '桌面', icon: '', title: '桌面视图 (100%)' },
  { name: 'tablet', label: '平板', icon: '', title: '平板视图 (768px)' },
  { name: 'mobile', label: '手机', icon: '', title: '手机视图 (375px)' },
]

// 预览URL（根据组件类型选择路由，带缓存破坏参数）
const previewUrl = computed(() => {
  if (!component.value) return ''
  const sid = sessionId.value
  const gid = component.value.groupId
  const cb = `&_t=${previewCacheKey.value}`

  if (isVue3Component.value) {
    // Vue3 组件：走 /preview/{sessionId}?type=vue3，传入 Figma 原始尺寸以保持比例
    const params = new URLSearchParams({ type: 'vue3', groupId: gid })
    if (figmaDimensions.value) {
      params.set('w', String(figmaDimensions.value.width))
      params.set('h', String(figmaDimensions.value.height))
    }
    const base = sid ? getRouteUrl(`/preview/${sid}?${params.toString()}`) : getPreviewUrl(gid, component.value._id)
    return base + (base.includes('?') ? cb : `?_t=${previewCacheKey.value}`)
  }
  // 微码组件：走 /mc-component/{sessionId}，传入设计稿尺寸
  const mcParams = new URLSearchParams({ groupId: gid })
  if (figmaDimensions.value) {
    mcParams.set('w', String(figmaDimensions.value.width))
    mcParams.set('h', String(figmaDimensions.value.height))
  }
  const mcBase = sid ? getMcPreviewUrl(sid) + '?' + mcParams.toString() : getPreviewUrl(gid, component.value._id)
  return mcBase + (mcBase.includes('?') ? cb : `?_t=${previewCacheKey.value}`)
})

// 桌面视图下预览 iframe 按 Figma 原始尺寸 1:1 展示（原始多大就多大），保持比例
// maxWidth:100% + aspect-ratio：容器窄于原始宽度时 iframe 自动等比收缩，绝不超出容器
const previewIframeStyle = computed(() => {
  if (viewport.value !== 'desktop' || !figmaDimensions.value) return {}
  const displayW = figmaDimensions.value.width
  const displayH = figmaDimensions.value.height
  return {
    width: `${displayW}px`,
    height: 'auto',
    maxWidth: '100%',
    aspectRatio: `${displayW} / ${displayH}`,
    margin: '0 auto',
  }
})

// Figma 源链接（从 metadata 构建）
const figmaUrl = computed(() => {
  if (!component.value?.metadata) return ''
  const { figmaFileKey, figmaNodeId } = component.value.metadata
  if (!figmaFileKey || !figmaNodeId) return ''
  const nodeId = figmaNodeId.replace('-', ':')
  return `https://www.figma.com/design/${figmaFileKey}?node-id=${nodeId}`
})

// 重新生成（带 Figma URL 跳转到生成页）
function regenerate() {
  if (!figmaUrl.value) return
  const target = component.value?.target || component.value?.metadata?.target
  const type = target || (isVue3Component.value ? 'vue3' : 'microcode')
  router.push({
    path: '/generator/components',
    query: { figmaUrl: figmaUrl.value, type }
  })
}

// 加载组件数据
async function loadComponent() {
  const componentId = route.params.id as string
  if (!componentId) {
    error.value = '组件ID无效'
    return
  }

  loading.value = true
  error.value = ''

  try {
    component.value = await getComponent(componentId)
    // 防静默空白：解析/权限/记录缺失统一落 error（曾因响应解包格式不一致返回 null）
    if (!component.value) {
      error.value = '组件不存在或无权访问'
      return
    }
    // 🛡️ 2026-09-03：加载对接状态（决定「对接接口」/「撤回对接」按钮）
    const cid = businessComponentId.value
    if (cid && isVue3Component.value) {
      await loadBindingStatus(cid)
    } else {
      bindingStatus.value = { bound: false, bindingId: '' }
    }
    // 提取 Figma 原始尺寸，用于桌面视图下按原始比例缩放预览
    const meta = component.value?.metadata
    if (meta?.figmaWidth && meta?.figmaHeight) {
      figmaDimensions.value = {
        width: Number(meta.figmaWidth),
        height: Number(meta.figmaHeight),
      }
    } else {
      figmaDimensions.value = null
    }
  } catch (err: any) {
    // 检查是否为未登录错误
    if (err.response?.status === 401 || err.response?.status === 403) {
      // 门户内刷新父页面重新鉴权（登录页已移除，门户鉴权模式）
      if (window.parent !== window && typeof window.parent.getToken === 'function') {
        window.parent.location.reload()
        return
      }
      // 非门户场景：登录页已移除，仅回落错误提示，不再跳转登录页
      return
    }

    error.value = err.response?.data?.message || '加载组件失败'
    console.error('加载组件失败:', err)
  } finally {
    loading.value = false
  }
}

// 刷新预览
function refreshPreview() {
  clearPreviewError() // iframe 即将重载，清除旧的错误提示
  previewCacheKey.value = Date.now() // 缓存破坏：让 previewUrl computed 产出全新 URL
  iframeKey.value++ // 强制 Vue 销毁/重建 <iframe> DOM 元素
  // 🛡️ 2026-09-03：向导绑定成功/撤回后同步按钮状态
  const cid = businessComponentId.value
  if (cid) loadBindingStatus(cid)
}

// 在新标签页打开
function openInNewTab() {
  if (previewUrl.value) {
    window.open(previewUrl.value, '_blank')
  }
}

// 复制URL
async function copyUrl() {
  try {
    await navigator.clipboard.writeText(previewUrl.value)
    alert('链接已复制到剪贴板')
  } catch {
    alert('复制失败，请手动复制')
  }
}

// 编辑组件：切换内联源码编辑器显隐（默认展开，无需额外点击进入编辑态）
function editComponent() {
  editorOpen.value = !editorOpen.value
  if (editorOpen.value && !editorOriginal.value && !editorLoading.value) {
    loadEditorSource()
  }
}

// 编辑器读写路径（统一：所有版本都是 package/index.vue）
const editorFilePath = computed(() => {
  const sid = sessionId.value
  const gid = groupId.value
  if (isVue3Component.value) {
    return `/workspace/vue3-components/${gid}/${sid}/package/index.vue`
  }
  return `/workspace/custom-components/${sid}/package/index.vue`
})

// 加载组件 index.vue 源码到编辑器
async function loadEditorSource() {
  if (!sessionId.value) return
  // 安全网：dev 预览按 localStorage.currentGroupId 解析 group，写入保证一致
  try { localStorage.setItem('currentGroupId', groupId.value) } catch {}
  editorLoading.value = true
  editorError.value = ''
  try {
    let content = ''
    if (import.meta.env.DEV) {
      const res = await fetch(`/__raw${editorFilePath.value}`)
      if (!res.ok) throw new Error(`加载失败 (${res.status})`)
      content = await res.text()
    } else {
      const data = await http.get(`/api/component/${sessionId.value}/file`, {
        path: 'package/index.vue'
      })
      if (!data.success) throw new Error(data.error || '加载失败')
      content = data.content || ''
    }
    editorContent.value = content
    editorOriginal.value = content
  } catch (e: any) {
    editorError.value = e?.message || String(e)
    console.error('编辑器加载源码失败:', e)
  } finally {
    editorLoading.value = false
  }
}

// 编辑器内容变化：标记脏 + 防抖自动保存
function onEditorChange() {
  if (!editorModified.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveEditorSource, 800)
}

// 防抖自动保存 → 写回源码 → 刷新预览
async function saveEditorSource() {
  if (!editorModified.value || !sessionId.value) return
  editorSaving.value = true
  try {
    let ok = false
    if (import.meta.env.DEV) {
      const res = await fetch(`/__raw${editorFilePath.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: editorContent.value,
      })
      const data = await res.json().catch(() => ({}))
      ok = res.ok && data.success
    } else {
      const data = await http.post(
        `/api/component/${sessionId.value}/file?path=package/index.vue`,
        { content: editorContent.value }
      )
      ok = data?.success
    }
    if (ok) {
      editorOriginal.value = editorContent.value
      refreshPreview() // iframe 重载 → /__raw 读最新源码 → 浏览器内重编译
    } else {
      alert('保存失败，请重试')
    }
  } catch (e: any) {
    console.error('保存失败:', e)
    alert('保存失败: ' + (e?.message || e))
  } finally {
    editorSaving.value = false
  }
}

// 打开接口对接向导：通过 postMessage 触发根级全局向导（全屏），避免受本页 iframe 尺寸影响
function confirmUnbind() {
  if (window.confirm('撤回接口对接？\n\n将移除组件内注入的接口代码与 API 文件，恢复到对接前状态。')) {
    handleUnbind()
  }
}

function openBindingWizard() {
  const c = component.value
  if (!c) return
  // 后端 analyze-slots / bind-api 需要 workspace 业务组件号
  const cid = businessComponentId.value
  window.postMessage(
    {
      type: 'MVGO_OPEN_API_BINDING',
      componentId: cid,
      groupId: c.groupId || '',
      componentName: c.name || cid,
    },
    window.location.origin,
  )
}

async function openAnalysisDrawer() {
  if (!businessComponentId.value) return
  analysisDrawerVisible.value = true
  analysisLoading.value = true
  analysisError.value = ''
  analysisReport.value = null
  try {
    analysisReport.value = await analyzeComponentVisual(businessComponentId.value)
  } catch (err: any) {
    analysisReport.value = null
    analysisError.value = err?.response?.data?.message || err?.message || 'AI 对比分析失败'
  } finally {
    analysisLoading.value = false
  }
}

// iframe加载完成
function onIframeLoad() {
  console.log('预览加载完成')
}

// 格式化日期
function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 初始化
onMounted(async () => {
  await loadComponent()
  // 全局向导「刷新预览」后重载本页预览 iframe
  window.addEventListener(API_BINDING_REFRESH_EVENT, refreshPreview)
  // Vue3 组件：默认展开内联编辑器并加载源码（微码组件不自动展开编辑器）
  if (editorOpen.value && isVue3Component.value) {
    loadEditorSource()
  }
})

onUnmounted(() => {
  window.removeEventListener(API_BINDING_REFRESH_EVENT, refreshPreview)
})
</script>

<style scoped>
.component-detail {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-alt);
}

/* 加载/错误状态 */
.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 20px;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 5px solid var(--border-light);
  border-top: 5px solid var(--brand);
  border-radius: var(--radius-full);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.retry-btn,
.back-btn {
  padding: 10px 24px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
}

.retry-btn {
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
}

.retry-btn:hover {
  background: var(--button-primary-bg-hover);
}

.back-btn {
  background: var(--border-light);
  color: var(--text-primary);
}

.back-btn:hover {
  background: var(--border-default);
}

/* 详情容器 */
.detail-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* 顶部工具栏 */
.detail-header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 16px 24px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.back-button {
  padding: 8px 16px;
  background: var(--border-light);
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.3s;
}

.back-button:hover {
  background: var(--border-default);
}

.header-info {
  flex: 1;
}

.component-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: var(--text-primary);
}

.component-title .type-badge {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  margin-left: 10px;
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  border: 1px solid transparent;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.18);
}

.component-title .type-badge.vue3 {
  background: var(--component-vue3);
  color: var(--component-vue3-contrast);
  border-color: color-mix(in srgb, var(--component-vue3-strong) 60%, transparent);
}

.component-title .type-badge.phase2 {
  background: var(--component-microcode);
  color: var(--component-microcode-contrast);
  border-color: color-mix(in srgb, var(--component-microcode-strong) 60%, transparent);
}

.component-title .public-badge {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  margin-left: 8px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: #f59e0b;
  color: #ffffff;
}

.publish-btn {
  background: #f59e0b;
  border-color: #d97706;
  color: #ffffff;
}

.publish-btn:hover:not(:disabled) {
  background: #d97706;
}

.component-meta {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-button {
  padding: 8px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
}

.action-button:hover {
  border-color: var(--brand);
  color: var(--brand);
}

.action-button.primary {
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
  border-color: var(--button-primary-border);
  box-shadow: var(--button-primary-shadow);
}

.action-button.primary:hover {
  background: var(--button-primary-bg-hover);
  border-color: var(--button-primary-border-hover);
  box-shadow: var(--button-primary-shadow-hover);
}

.action-button.binding-btn {
  background: var(--task-success-bg);
  border-color: var(--task-success-border);
  color: var(--task-success-text);
}

.action-button.binding-btn:hover {
  background: var(--task-success-bg);
  border-color: var(--task-success);
}

/* 🛡️ 2026-09-03：撤回对接（危险红，与 TaskDetail 的撤回态一致） */
.action-button.binding-btn--bound {
  background: var(--task-danger-bg, rgba(217, 83, 79, 0.12));
  border-color: var(--task-danger-border, #e5484d);
  color: var(--task-danger-text, #e5484d);
}

.action-button.binding-btn--bound:hover {
  background: var(--task-danger-bg, rgba(217, 83, 79, 0.22));
  border-color: #dc3d43;
}

.action-button.analysis-btn {
  background: var(--brand-bg);
  border-color: var(--brand-border);
  color: var(--brand-text);
}

.action-button.analysis-btn:hover {
  background: var(--brand-bg-active);
  border-color: var(--brand);
}

.action-button.doc-btn {
  background: var(--feature-bg);
  border-color: var(--c-purple-300);
  color: var(--feature);
}

.action-button.doc-btn:hover {
  background: var(--feature-bg);
  border-color: var(--c-purple-400);
}

/* 文档纠偏面板区（S15 路径B） */
.doc-panel-section {
  margin: 0 24px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  box-shadow: 0 2px 8px var(--shadow-sm);
  overflow: hidden;
}

/* Figma 源链接栏 */
.figma-source-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 24px;
  background: var(--brand-bg);
  border-bottom: 1px solid var(--brand-border);
  flex-shrink: 0;
}

.figma-source-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-light);
  white-space: nowrap;
}

.figma-source-link {
  font-size: 12px;
  color: var(--brand);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Monaco', 'Menlo', monospace;
  transition: color 0.3s;
}

.figma-source-link:hover {
  color: var(--brand-light);
  text-decoration: underline;
}

/* 预览区域 */
.preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.viewport-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.viewport-buttons {
  display: flex;
  gap: 8px;
}

.viewport-btn {
  padding: 6px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.3s;
}

.viewport-btn:hover {
  border-color: var(--brand);
  color: var(--brand);
}

.viewport-btn.active {
  background: var(--brand);
  color: var(--text-on-brand);
  border-color: var(--brand);
}

.preview-url {
  display: flex;
  gap: 8px;
  align-items: center;
}

.url-input {
  padding: 6px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: 12px;
  width: 300px;
  background: var(--bg-hover);
  font-family: 'Monaco', 'Menlo', monospace;
}

.copy-btn {
  padding: 6px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.3s;
}

.copy-btn:hover {
  border-color: var(--brand);
}

/* iframe容器 */
.preview-frame-container {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background: var(--bg-alt);
  overflow: auto;
}

.preview-frame-container.viewport-desktop {
  padding: 0;
}

.preview-frame-container.viewport-tablet .preview-iframe {
  width: 768px;
  max-width: 100%;
  height: calc(100vh - 200px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 16px var(--shadow-md);
}

.preview-frame-container.viewport-mobile .preview-iframe {
  width: 375px;
  max-width: 100%;
  height: 667px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  box-shadow: 0 4px 16px var(--shadow-md);
}

.preview-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: var(--bg-card);
}

/* ── 编辑 + 预览 分屏 ── */
.edit-preview-split {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* 左：源码编辑器 */
.editor-pane {
  flex: 0 0 46%;
  display: flex;
  flex-direction: column;
  min-width: 340px;
  max-width: 70%;
  background: #1e1e1e; /* 与 Monaco vs-dark 一致 */
  border-right: 1px solid var(--border-default);
  overflow: hidden;
}

.editor-pane-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  font-size: 12px;
  background: #252526;
  color: #cccccc;
  border-bottom: 1px solid #333;
}

.editor-file {
  font-family: 'Monaco', 'Menlo', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.editor-status {
  flex-shrink: 0;
  white-space: nowrap;
}

.editor-err {
  color: #f48771;
}

.editor-dirty {
  color: #e2c08d;
}

.editor-host {
  flex: 1;
  min-height: 0;
  position: relative;
}

/* 右：实时预览 */
.preview-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 信息面板 */
.info-panel {
  position: fixed;
  right: 0;
  top: 60px;
  bottom: 0;
  width: 300px;
  background: var(--bg-card);
  border-left: 1px solid var(--border-default);
  padding: 20px;
  overflow-y: auto;
}

.info-panel h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: var(--text-primary);
}

.info-item {
  margin-bottom: 12px;
  font-size: 13px;
}

.info-item label {
  display: block;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.info-item span {
  display: block;
  color: var(--text-primary);
  word-break: break-all;
}
</style>
