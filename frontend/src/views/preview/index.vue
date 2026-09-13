<!--
 * 单个微码组件的独立预览页（无页头页脚、全屏定高、免登录）
 * 解决组件 height:100% 链在普通布局下塌陷为 0 的问题。
 *
 * 两种取源，统一对外路由 /preview/:componentId：
 *   - 开发环境：import.meta.glob 直接加载 workspace 组件（build-time + HMR，快）
 *   - 生产环境：vue3-sfc-loader 运行时编译，从后端 /api/preview 拉原始 .vue 源码，
 *     CSS 由后端预编译好单独加载（浏览器不跑 LESS）。复用 playground 已有运行时。
 -->
<template>
  <!-- 全屏居中容器：预览舞台默认水平+垂直居中；已知尺寸时舞台内部再按视口等比缩放 -->
  <div class="mc-preview-stage-shell" :class="{ 'is-standalone': !isEmbedded }">
    <!-- 🎨 面板类型切换器（仅微码组件）
         嵌入父页面（TaskDetail）时，由父页面预览区右上角的「面板类型」下拉统一控制，
         这里不再重复渲染，避免浮层压在组件内容上。仅独立窗口打开时才显示。 -->
    <div v-if="!isVue3 && !isEmbedded" class="mc-panel-switcher">
      <label>面板类型：</label>
      <select v-model="globalPanelType" class="mc-panel-select">
        <option value="">使用默认</option>
        <option value="default-panel">默认/浅色面板</option>
        <option value="model-panels">弹窗面板</option>
        <option value="aio-panel">一体化/深色面板</option>
        <option value="empty">无面板</option>
      </select>
    </div>
    <div
      class="mc-preview-stage"
      :class="[
        isVue3 ? 'preview-vue3' : 'preview-microcode',
        // 预览环境默认注入暗色主题 class：微码组件样式全部挂在 .dark/.light 父选择器下，
        // 不注入则所有样式规则匹配失败（预览样式失效的根本原因）。
        resolvedThemeClass
      ]"
      :style="stageStyle"
      :data-preview-status="previewStatus"
      :data-preview-error-type="previewErrorType"
      :data-preview-scope="previewStyleScopeId"
    >
      <div v-if="structurePreviewMode" class="mc-structure-preview-badge">
        无样式结构预览 · 不代表质量门禁通过
      </div>

      <ErrorBoundary
        ref="errorBoundaryRef"
        :onRetry="reloadComponent"
        :onAiFix="handleAiFixRenderError"
        :timeout="10000"
        @error="handleRenderError"
        @recovered="markLoading"
      >
        <!-- 🛡️ P2（2026-09-03）：作用域属性放在 .mc-preview-stage 父容器上（组件根是它的后代）。
             若放在 <component> 上会落到组件根元素自身——后代选择器 [scope] .root 永不匹配，
             组件根自身的规则（背景/宽高）全部失效 → 白屏（实测实锤）。 -->
        <component
          :is="rtComponent"
          v-if="rtComponent"
          v-bind="componentProps"
          class="mc-preview-component-root"
          :style="componentRootStyle"
        />
        <!-- 加载阶段失败（非渲染期）：清晰告知「组件自身问题，不影响系统」 -->
        <div v-else-if="loadError" class="mc-preview-error-card">
          <!-- AI 修复进行中：覆盖式 loading，醒目且带实时计时 -->
          <div v-if="aiFixing" class="mc-ai-fix-overlay">
            <span class="mc-ai-fix-spinner"></span>
            <div class="mc-ai-fix-title">AI 正在修复组件…</div>
            <div class="mc-ai-fix-sub">
              预计需要 1–3 分钟，请耐心等待（已等待 {{ aiFixSeconds }} 秒）
            </div>
            <button
              class="mc-preview-error-btn ghost"
              :disabled="aiFixCancelling"
              @click="cancelAiFix"
            >
              {{ aiFixCancelling ? '取消中…' : '取消修复' }}
            </button>
          </div>
          <template v-else>
            <div class="mc-preview-error-icon">
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div class="mc-preview-error-title">组件加载失败</div>
            <div class="mc-preview-error-desc">
              这是
              <strong>组件自身的问题</strong>
              （如文件缺失、样式编译错误或引用了不支持的资源），
              <strong>不会影响系统其他功能</strong>
              。可重新加载，或检查该组件的源码。
            </div>
            <pre class="mc-preview-error-detail">{{ loadError }}</pre>
            <div v-if="loadDiagnostic" class="mc-preview-error-location">
              {{ loadDiagnostic.file }}:{{ loadDiagnostic.line }}:{{ loadDiagnostic.column }}
            </div>
            <div class="mc-preview-error-actions">
              <button class="mc-preview-error-btn" @click="reloadComponent">重新加载</button>
              <button class="mc-preview-error-btn" @click="openSource(false)">查看代码</button>
              <button v-if="loadDiagnostic" class="mc-preview-error-btn" @click="openSource(true)">
                定位错误
              </button>
              <button class="mc-preview-error-btn" @click="enableStructurePreview">
                无样式结构预览
              </button>
              <button class="mc-preview-error-btn primary" @click="handleAiFixLoadError">
                AI 修复
              </button>
              <button class="mc-preview-error-btn ghost" @click="copyError">复制错误信息</button>
            </div>
            <div v-if="aiFixMessage" class="mc-preview-ai-fix-status" :class="aiFixLevel">
              {{ aiFixMessage }}
              <button
                v-if="aiFixLevel === 'error'"
                class="mc-ai-fix-retry"
                @click="handleAiFixLoadError"
              >
                重试
              </button>
            </div>
          </template>
        </div>
        <div v-else class="mc-preview-tip">
          <span class="mc-preview-spinner"></span>
          正在加载组件...
        </div>
      </ErrorBoundary>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  shallowRef,
  provide,
  onMounted,
  onUnmounted,
  getCurrentInstance,
  defineAsyncComponent,
  watch,
  computed,
  nextTick
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import {
  loadVue3FromWorkspace,
  injectVueAutoImports,
  applyScopeToPreviewStyles,
} from '@/utils/loadVue3Runtime'
import { BINARY_EXTS as BINARY_EXTS_SHARED, extOf } from '@/utils/sfc-loader-binary'
import { buildSnapshotFileUrl, resolvePreviewDescriptor } from '@/utils/preview-resolver'
import http from '@/core/http'
import { getComponentBySessionId } from '@/api/component'

const route = useRoute()
const router = useRouter()
const componentId = String(route.params.componentId || '')
const previewDescriptor = resolvePreviewDescriptor(
  {
    componentId,
    sessionId: String(route.query.sessionId || componentId),
    groupId: String(route.query.groupId || 'default-group'),
    target: String(route.query.type || ''),
    taskType: String(route.query.type || ''),
    artifactReady: true
  },
  route.query.sessionId && route.query.revision
    ? {
        candidate: {
          revision: String(route.query.revision),
          status: String(route.query.source || 'candidate')
        }
      }
    : {},
  String(route.query.type || '')
)
const groupId = previewDescriptor?.groupId || 'default-group'
const explicitType = previewDescriptor?.target || 'microcode'
const isPage = explicitType === 'page'
const isVue3 = isPage || explicitType === 'vue3'

// 🛡️ F3-全场景闭环：URL 缺带 revision 也能预览（未发布前 / 判定失败 / WorkflowMonitor / ComponentDetail 等所有入口）。
// 通过 /api/tasks/{sessionId}/code-snapshots/latest 主动拿 candidate/partial/lastGood 任一可用快照的 revision，
// 让 snapshotSource 在缺 URL 参数时自动补全 → 走「快照源」分支（不依赖 frontend/workspace 目录存在）。
const latestSnapshotSource = ref(null)
const hasExplicitSource = !!(route.query.sessionId && route.query.revision)

async function ensureLatestSnapshot() {
  if (hasExplicitSource) return
  // 2026-09-10：Playground / 编辑态入口带 `snapshot=0`，强制走 workspace 源。
  // 原因：AI 修复与代码编辑都写 workspace，而快照是生成时的旧内容，
  // 走快照会出现「代码已改但预览不变」。只有生成中（workspace 尚无产物）才需要快照。
  if (String(route.query.snapshot || '') === '0') return
  if (latestSnapshotSource.value) return
  // path 段是 componentId 可能是 componentId 或 sessionId（看入口），query.sessionId 优先；都没有就用 componentId
  const sessionId = String(route.query.sessionId || componentId || '')
  if (!sessionId) return
  try {
    // latest 接口返回 { candidate, lastGood, partial }；优先级 lastGood > candidate > partial。
    // 🛡️ 2026-09-13 治本（"找不到文件 package/components/XxxSection.vue，刷新后消失"）：
    // candidate 可能是 chunk 级中间态（缺某些子组件文件，实测 r-3b40de29/r-9e368c21 缺 TabsSection.vue），
    // 而 lastGood 是完整最终快照。生成完成跳转预览应优先 lastGood，避免加载不完整候选。
    const resp = await http.get(`/api/tasks/${encodeURIComponent(sessionId)}/code-snapshots/latest`, undefined, { silent401: true })
    // 🛡️ 2026-09-13 根因：NestJS 全局拦截器把返回包成 { success, code, message, data:{...} }，
    // candidate/lastGood 嵌套在 data 里。旧代码取顶层 data?.candidate 永远 undefined → 快照源（含 lastGood）从未生效。
    const d = resp?.data ?? resp
    const candidate = d?.candidate
    const partial = d?.partial
    const lastGood = d?.lastGood
    const snap = lastGood || candidate || partial
    if (snap?.revision) {
      latestSnapshotSource.value = {
        sessionId,
        revision: snap.revision,
        kind: lastGood ? 'last-good' : (candidate ? 'candidate' : 'partial'),
      }
    }
  } catch (e) {
    // 🛡️ P0-2（2026-09-09）：componentId 直查 latest 404 时，先调 resolve-session 反查真实 sessionId，
    // 再用真实 sessionId 重试。避免因入口只传了 componentId 没传 sessionId 导致 RUNTIME-007。
    if (route.query.sessionId !== sessionId && componentId && componentId !== sessionId) {
      try {
        const resolveResp = await http.get('/api/tasks/resolve-session', { componentId })
        const rd0 = resolveResp?.data ?? resolveResp
        if (rd0?.success && rd0.sessionId) {
          const retry = await http.get(`/api/tasks/${encodeURIComponent(rd0.sessionId)}/code-snapshots/latest`, undefined, { silent401: true })
          const rd = retry?.data ?? retry
          const snap = rd?.lastGood || rd?.candidate || rd?.partial
          if (snap?.revision) {
            latestSnapshotSource.value = {
              sessionId: rd0.sessionId,
              revision: snap.revision,
              kind: rd.lastGood ? 'last-good' : (rd.candidate ? 'candidate' : 'partial'),
            }
          }
        }
      } catch {
        // resolve 也失败 → 留 null，由现有 B/C 分支 + F1 容错兜底
      }
    }
  }
}

// 🛡️ 2026-09-13 治本（"未找到组件 mc-max-*，刷新后消失"）：
// workspace 目录用语义化 componentId（c-xxx-<尾8hex>），而跳转预览 URL 用的是 sessionId（mc-max-*/mv-*）。
// 快照源能按 sessionId 命中（快照按 sessionId 存），但 workspace 源按 sessionId 拼目录永远找不到。
// 生成完成一刹那快照源未就绪时退到 workspace 源 → 报「未找到组件」。这里在走 workspace 源前，
// 把 sessionId 反查成语义化 componentId（component/by-session 接口），使 workspace 源能命中语义化名目录。
async function resolveWorkspaceComponentId(id: string): Promise<string> {
  if (!id || !/^(mc|mv)-/.test(id)) return id
  try {
    const component = await getComponentBySessionId(id)
    if (component?.componentId) return component.componentId
  } catch {
    // 反查失败 → 回退原 id（保持现有容错，不阻断）
  }
  return id
}

const snapshotSource = computed(() => {
  if (hasExplicitSource) {
    return {
      sessionId: String(route.query.sessionId),
      revision: String(route.query.revision),
      kind: String(route.query.source || 'candidate'),
    }
  }
  return latestSnapshotSource.value
})
const snapshotFileUrl = (path) =>
  snapshotSource.value
    ? buildSnapshotFileUrl(
        snapshotSource.value.sessionId,
        snapshotSource.value.revision,
        path,
        true,
        // 随预览刷新变化，避免浏览器缓存返回旧代码
        (route.query._t as string) || '',
      )
    : ''

const rtComponent = shallowRef(null)
const microcodeDeclare = shallowRef(null)
// 加载阶段（import/编译）的错误信息；渲染期错误由 ErrorBoundary 内部捕获
const loadError = shallowRef('')
const loadDiagnostic = shallowRef(null)
const structurePreviewMode = ref(false)
const errorBoundaryRef = ref(null)
const aiFixing = ref(false)
const aiFixMessage = ref('') // AI 修复状态反馈文案
const aiFixLevel = ref('') // 反馈级别：'' | 'success' | 'error' | 'warn'
// 统一设置反馈文案与级别，避免用 emoji 前缀判断状态
function setAiFixMessage(text, level = '') {
  aiFixMessage.value = text
  aiFixLevel.value = text ? level : ''
}
const aiFixSeconds = ref(0) // 已等待秒数（实时计时）
const aiFixCancelling = ref(false) // 取消中
const AI_FIX_TIMEOUT_MS = 190000
// 模块级 AbortController：进行中只允许一个请求
let aiFixController = null
let aiFixTimer = null // 计时器 handle
const previewStatus = ref('loading')
const previewErrorType = ref('')
const instance = getCurrentInstance()
const previewStyleScopeId = `preview-${groupId}-${componentId}`

// 预览环境默认注入暗色主题 class（微码组件样式全部挂在 .dark/.light 父选择器下）
// 不注入则所有样式规则匹配失败，导致样式完全失效
const resolvedThemeClass = computed(() => {
  // 支持从 URL query 强制指定主题（?theme=light 或 ?theme=dark）
  const themeQuery = route.query.theme
  if (themeQuery === 'light') return 'light'
  // 默认暗色主题（与系统默认主题保持一致）
  return 'dark'
})

// 🎯 组件 Props：微码需要传 componentId 和 groupId；Vue3 组件按需传递（避免硬编码）
const componentProps = computed(() => {
  if (isVue3) {
    // Vue3 组件通常不需要硬编码 componentId（可由组件内部自行获取或不需要）
    return {}
  }
  // 微码组件需要明确传递
  return {
    componentId,
    groupId,
    componentName: microcodeDeclare.value?.componentName
  }
})

function markLoading() {
  previewStatus.value = 'loading'
  previewErrorType.value = ''
}

async function markReadyAfterRender() {
  await nextTick()
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  if (rtComponent.value && !loadError.value && previewStatus.value === 'loading') {
    previewStatus.value = 'ready'
    previewErrorType.value = ''
    notifyParentReady()
  }
}

function notifyParentReady() {
  if (!isEmbedded.value || !window.parent) return
  window.parent.postMessage(
    {
      type: 'MVGO_PREVIEW_READY',
      componentId,
      groupId,
      sessionId: snapshotSource?.sessionId || '',
      revision: snapshotSource?.revision || '',
      source: snapshotSource?.kind || 'workspace'
    },
    window.location.origin
  )
}

function handleRenderError(payload) {
  previewStatus.value = 'render-error'
  previewErrorType.value = payload?.info === 'timeout' ? 'timeout' : 'vue-render'
}

function cleanupPreviewInjectedStyles() {
  document
    .querySelectorAll(`style[data-preview-style-scope="${previewStyleScopeId}"]`)
    .forEach((node) => node.remove())
  document
    .querySelectorAll(`style[data-preview-css="${componentId}"]`)
    .forEach((node) => node.remove())
  // 预览页只接收父层注入的 cssVars，组件卸载/重载后必须清掉，避免前一个组件的主题变量串到下一个组件
  document.documentElement.removeAttribute('style')
}

// 📐 Figma 实际尺寸约束（1:1 原始尺寸展示，超出容器时等比缩小）
const figmaAspectRatio = ref(null) // null = 未知，number = W/H 比值
const figmaOriginalWidth = ref(null) // 原始宽度
const figmaOriginalHeight = ref(null) // 原始高度

const componentRootStyle = computed(() => {
  if (!figmaOriginalWidth.value || !figmaOriginalHeight.value) return undefined
  return {
    width: '100%',
    height: '100%',
    minWidth: '0',
    minHeight: '0',
    maxWidth: '100%',
    maxHeight: '100%',
    flex: '0 0 100%',
    boxSizing: 'border-box'
  }
})

const stageStyle = computed(() => {
  // 已知原始尺寸：舞台始终使用设计稿的真实像素宽高。
  // 外层 iframe / shell 负责滚动，不在预览页内改写布局宽高或放大缩小组件。
  if (figmaOriginalWidth.value && figmaOriginalHeight.value) {
    return {
      width: `${figmaOriginalWidth.value}px`,
      height: `${figmaOriginalHeight.value}px`,
      flex: '0 0 auto',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }
  }

  // 只有宽高比无法推导真实像素尺寸，不能据此压成 100vh 正方形。
  // 让组件按 iframe 可用空间正常布局，避免缺失元数据时发生二次缩放。
  // 兜底高度提升到 80vh，确保含图表的组件有足够空间展示（无 figma-size 时不再塌陷）。
  return {
    width: '100%',
    height: '100%',
    minHeight: 'min(80vh, 1080px)',
    flex: '0 0 auto',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
  }
})

async function loadAspectRatio() {
  // 辅助：从一个 Response 安全解析 JSON（404 / 非 JSON 时返回 null，不抛错）
  const safeJson = async (res) => {
    try {
      if (!res || !res.ok) return null
      const t = await res.text()
      if (!t || t.trim().startsWith('<')) return null
      return JSON.parse(t)
    } catch {
      return null
    }
  }

  try {
    // **所有组件**：优先从 URL query 读取 Figma 原始尺寸（由父页面 TaskDetail 传入）
    const urlW = Number(route.query.w)
    const urlH = Number(route.query.h)
    if (urlW > 0 && urlH > 0) {
      figmaOriginalWidth.value = urlW
      figmaOriginalHeight.value = urlH
      figmaAspectRatio.value = urlW / urlH
      return
    }

    // 页面骨架：从 page-meta.json 读取截图/设计稿原始尺寸
    if (isPage) {
      try {
        const meta = await http.get(`/api/preview/page/${groupId}/${componentId}/page-meta.json`)
        const sw = Number(meta?.data?.structure?.imageWidth)
        const sh = Number(meta?.data?.structure?.imageHeight)
        if (sw > 0 && sh > 0) {
          figmaOriginalWidth.value = Math.round(sw)
          figmaOriginalHeight.value = Math.round(sh)
          figmaAspectRatio.value = sw / sh
          return
        }
      } catch {
        // 未读到尺寸时继续兜底
      }
    }

    // 【统一规则】第一步：尝试从 _figma-size.json 读取 Figma 原始尺寸（所有管线都会产出）
    // 文件名不带「.」前缀：NestJS @Get('*path') 通配符不支持「.」开头的路径段，prod 端点会 404
    let figmaData = null
    const basePath = isVue3
      ? `vue3-components/${groupId}/${componentId}`
      : `custom-components/${componentId}`

    if (snapshotSource.value) {
      figmaData = await safeJson(await http.raw(snapshotFileUrl('_figma-size.json')))
    } else if (import.meta.env.DEV) {
      // dev 先走 exists 探测，缺文件也返回 200，避免浏览器控制台产生误导性的 404。
      const figmaSizeUrl = `/__raw/workspace/${basePath}/_figma-size.json`
      const existsData = await safeJson(await fetch(`${figmaSizeUrl}?exists=1`))
      if (existsData?.exists) {
        figmaData = await safeJson(await fetch(figmaSizeUrl))
      }
    } else {
      const url = `/api/preview/${groupId}/${componentId}/_figma-size.json`
      figmaData = await safeJson(await http.raw(url))
    }
    const bbox = figmaData?.document?.absoluteBoundingBox
    if (bbox?.width > 0 && bbox?.height > 0) {
      figmaOriginalWidth.value = Math.round(bbox.width)
      figmaOriginalHeight.value = Math.round(bbox.height)
      figmaAspectRatio.value = bbox.width / bbox.height
      return
    }

    // 【第二步】_figma-size.json 读不到 → 仅微码组件兜底 declare.json。
    // Vue3 组件没有 declare.json，禁止再错误请求 custom-components/${componentId}。
    if (!isVue3) {
      let declare = null
      if (snapshotSource.value) {
        declare = await safeJson(await http.raw(snapshotFileUrl('declare.json')))
      } else if (import.meta.env.DEV) {
        const mod = await import(
          /* @vite-ignore */ `../../../workspace/custom-components/${componentId}/declare.json`
        )
        declare = mod.default || mod
      } else {
        declare = await http.get(`/api/preview/${groupId}/${componentId}/declare.json`)
      }
      const size = declare?.size || declare?.data?.size // 兼容顶层/旧规范
      if (size?.width > 0 && size?.height > 0) {
        figmaOriginalWidth.value = size.width
        figmaOriginalHeight.value = size.height
        figmaAspectRatio.value = size.width / size.height
        return
      }
      const ar = declare?.attribute?.aspectRatio || declare?.data?.attribute?.aspectRatio // 兼容顶层/旧规范
      if (Array.isArray(ar) && ar.length >= 2 && ar[1] !== 0) {
        figmaAspectRatio.value = ar[0] / ar[1]
        return
      }
    }

    // 兜底：都读不到 → 1:1 比例（100vh 见方）
    figmaAspectRatio.value = 1
  } catch {
    // 任何异常 → 使用默认比例
    figmaAspectRatio.value = 1
  }
}

const isEmbedded = computed(() => !!window.parent && window.parent !== window)

// 🎨 全局面板类型（用于实时切换预览）
const globalPanelType = ref('')
provide('globalPanelType', globalPanelType)

// 🔍 调试：监听面板类型变化
watch(
  globalPanelType,
  (newVal, oldVal) => {
    console.log('🎨 [Preview] 面板类型切换:', oldVal, '→', newVal)
  },
  { immediate: true }
)

// 🎨 独立窗口：面板类型变化时同步到 URL query（?panelType=）
watch(globalPanelType, (val) => {
  if (isEmbedded.value) return
  const query = { ...route.query }
  if (val) query.panelType = val
  else delete query.panelType
  router.replace({ query }).catch(() => {})
})

// ============ 开发环境：运行时编译（iframe 沙箱隔离） ============
// Vue3 组件：通过 vue3-sfc-loader 在浏览器内运行时编译，源码来自 Vite /__raw 端点
//           （绕过 Vite transform 管线，Vite 不会对 .vue 做 SFC/LESS 编译，
//            因此损坏组件不会触发 HMR 错误广播 → 父窗口 Playground 永不被污染）。
// 微码组件：与 Vue3 同等待遇 —— /__raw 原文 + vue3-sfc-loader 运行时编译沙箱，
//           编译全在浏览器内完成，任何语法/LESS/引用错误均不进入 Vite transform 管线。
async function loadMicrocodeDeclare() {
  if (isVue3 || microcodeDeclare.value) return microcodeDeclare.value

  // 🛡️ declare.json 只用于 Figma 宽高比 + base-panel 组件名，不是渲染入口组件必需。
  // 任何路径（snapshot / dev / prod）取不到都「不阻断」预览渲染（统一容错返回 null）。
  // 与同文件 _figma-size.json (:393-399)、同项目 loadVue3Runtime.js (:405-413)
  // 「先 ?exists=1 探测再读取」的既有模式保持一致 —— 零新概念、零新分支。
  try {
    if (snapshotSource.value) {
      // A · 快照源（带 revision 走 /api/tasks/{sid}/code-snapshots/{rev}/file）。
      // HTTP 失败 → 留 null，由 loadAspectRatio(:442) 兜底 1:1 比例。
      const res = await http.raw(snapshotFileUrl('declare.json'))
      if (res.ok) microcodeDeclare.value = await res.json()
    } else if (import.meta.env.DEV) {
      // B · dev 静态 import（URL 没带 revision 时退化到此）。
      // workspace 缺失 → 探测失败 → 留 null，不抛、不出 404 噪音。
      const probe = await fetch(
        `/__raw/workspace/custom-components/${componentId}/declare.json?exists=1`,
      )
      if (probe.ok) {
        const probeData = await probe.json().catch(() => ({ exists: false }))
        if (probeData?.exists) {
          const mod = await import(
            /* @vite-ignore */ `../../../workspace/custom-components/${componentId}/declare.json`,
          )
          microcodeDeclare.value = mod.default || mod
        }
      }
    } else {
      // C · prod 静态拉取。后端无产物 → 留 null，不阻断。
      try {
        microcodeDeclare.value = await http.get(`/api/preview/${groupId}/${componentId}/declare.json`)
      } catch {
        microcodeDeclare.value = null
      }
    }
  } catch (e) {
    // 任何意外 → 不阻断预览
    console.warn('[预览] 加载 declare.json 失败，使用默认值:', e?.message || e)
    microcodeDeclare.value = null
  }
  return microcodeDeclare.value
}

async function loadDev() {
  // 预览环境默认走 mock：绑定 API 的组件不真实调用业务接口（业务服务在本平台不可达）
  window.__MVGO_PREVIEW_MOCK__ = true
  // 🛡️ F3-全：URL 缺带 revision 时先 await latest API 拿快照 revision，
  // 让 B 分支（dev 静态 import）退化到 A 分支（快照源），不依赖 workspace 目录。
  await ensureLatestSnapshot()
  // 🛡️ 2026-09-13 治本：workspace 源按语义化 componentId 定位，而跳转 URL 带的是 sessionId。
  // 快照源按 sessionId 命中（快照按 sessionId 存），workspace 源必须反查语义化名，否则「未找到组件」。
  const resolvedId = snapshotSource.value ? componentId : await resolveWorkspaceComponentId(componentId)
  if (snapshotSource.value) {
    if (!isVue3) await loadMicrocodeDeclare()
    return await loadVue3FromWorkspace(componentId, {
      isProd: false,
      explicitGroupId: groupId,
      instance,
      styleScopeId: previewStyleScopeId,
      ignoreStyles: structurePreviewMode.value,
      workspacePath: isVue3 ? 'vue3-components' : 'custom-components',
      snapshotSource: snapshotSource.value
    })
  }

  if (isPage) {
    return await loadVue3FromWorkspace(resolvedId, {
      isProd: false,
      explicitGroupId: groupId,
      instance,
      styleScopeId: previewStyleScopeId,
      ignoreStyles: structurePreviewMode.value,
      workspacePath: 'vue3-pages'
    })
  }

  if (isVue3) {
    return await loadVue3FromWorkspace(resolvedId, {
      isProd: false,
      explicitGroupId: groupId,
      instance,
      styleScopeId: previewStyleScopeId,
      ignoreStyles: structurePreviewMode.value
    })
  }

  // 微码组件在独立预览中没有 wujie childAppData，需显式加载 declare.json，
  // 并通过根组件 props 把 componentName 交给 $mcComponentBuilder → base-panel。
  await loadMicrocodeDeclare()
  return await loadVue3FromWorkspace(resolvedId, {
    isProd: false,
    workspacePath: 'custom-components',
    instance,
    styleScopeId: previewStyleScopeId,
    ignoreStyles: structurePreviewMode.value
  })
}

// ============ 生产环境：运行时编译 ============
async function loadProd() {
  // 预览环境默认走 mock：绑定 API 的组件不真实调用业务接口（业务服务在本平台不可达）
  window.__MVGO_PREVIEW_MOCK__ = true
  // 🛡️ F3-全：URL 缺带 revision 时先 await latest API 拿快照 revision。
  await ensureLatestSnapshot()
  // 🛡️ 2026-09-13 治本：workspace 源按语义化 componentId 定位，sessionId 反查（同 loadDev）。
  const resolvedId = snapshotSource.value ? componentId : await resolveWorkspaceComponentId(componentId)
  if (snapshotSource.value) {
    if (!isVue3) await loadMicrocodeDeclare()
    return await loadVue3FromWorkspace(componentId, {
      isProd: true,
      explicitGroupId: groupId,
      instance,
      styleScopeId: previewStyleScopeId,
      ignoreStyles: structurePreviewMode.value,
      workspacePath: isVue3 ? 'vue3-components' : 'custom-components',
      snapshotSource: snapshotSource.value
    })
  }

  // 页面骨架：走 vue3-pages 运行时编译
  if (isPage) {
    return await loadVue3FromWorkspace(resolvedId, {
      isProd: true,
      explicitGroupId: groupId,
      instance,
      styleScopeId: previewStyleScopeId,
      ignoreStyles: structurePreviewMode.value,
      workspacePath: 'vue3-pages'
    })
  }

  // Vue3 普通组件：复用统一的运行时编译加载器（含 LESS 预编译，避免 getFile('less') 失败）
  if (isVue3) {
    return await loadVue3FromWorkspace(resolvedId, {
      isProd: true,
      explicitGroupId: groupId,
      instance,
      styleScopeId: previewStyleScopeId,
      ignoreStyles: structurePreviewMode.value
    })
  }

  await loadMicrocodeDeclare()

  const [{ loadModule }, Vue, echarts, { $mcComponentBuilder }, BasePanel] = await Promise.all([
    import('vue3-sfc-loader'),
    import('vue'),
    import('echarts'),
    import('@/utils/auto-import/common.js'),
    import('@/components/base-components/base-panel/index.vue')
  ])

  // 注入全局 $mcComponentBuilder（源码里是自由变量，原靠 auto-import）
  globalThis.$mcComponentBuilder = $mcComponentBuilder.default || $mcComponentBuilder

  // 全局注册 base-panel（运行时编译组件共享当前 appContext 即可 resolveComponent）
  const app = instance?.appContext?.app
  if (app && !app.component('base-panel')) {
    app.component('base-panel', BasePanel.default || BasePanel)
  }

  const base = `/api/preview/${groupId}/${resolvedId}`

  // Vue3 普通组件：入口是 index.vue（可能在 package/ 子目录或根目录），CSS 内联在 SFC 中
  const entryPath = isVue3
    ? `/${resolvedId}/package/index.vue`
    : `/${resolvedId}/package/index.vue`

  // 注入后端预编译好的 CSS（仅微码组件需要，Vue3 SFC 的 <style scoped> 由 vue3-sfc-loader 处理）
  if (!isVue3) {
    try {
      const cssRes = await http.raw(`${base}/resources/styles/index.css`)
      if (cssRes.ok) {
        const css = await cssRes.text()
        const style = document.createElement('style')
        style.setAttribute('data-preview-css', resolvedId)
        style.setAttribute('data-preview-style-scope', previewStyleScopeId)
        style.textContent = css
        document.head.appendChild(style)
      }
    } catch (e) {
      console.warn('[预览] 预编译 CSS 加载失败，样式可能缺失:', e)
    }
  }

  // 二进制资源扩展名集合 —— 单一真相源见 sfc-loader-binary.js（与 Vue3 生产路径共用，
  // 避免两边扩展名列表漂移导致某类资源在一个环境能加载、另一个环境损坏）。
  const BINARY_EXTS = BINARY_EXTS_SHARED
  const resolveRelPath = (p) => {
    const mm = String(p).match(new RegExp(`${resolvedId}/(.+)$`))
    return mm ? mm[1] : String(p).replace(/^\.?\//, '')
  }

  const options = {
    moduleCache: { vue: Vue, echarts },
    async getFile(pathArg) {
      const p = String(pathArg)
      const rel = resolveRelPath(p)
      // 二进制资源：不读取内容（res.text() 会损坏二进制），返回空占位，
      // 实际 URL 由 handleModule 返回，浏览器直接 fetch 二进制文件
      const ext = extOf(rel)
      if (BINARY_EXTS.has(ext)) return ''
      const res = await http.raw(`${base}/${rel}`)
      if (!res.ok) throw new Error(`找不到文件: ${rel}`)
      let src = await res.text()
      // 兜底 import.meta（vue3-sfc-loader 类 CJS 上下文不支持 import.meta）：
      // 将其重写为当前文件绝对 URL 对象，与 Vue3 运行时 loadVue3Runtime 的 shim 保持一致，
      // 消除「微码/vue3」「dev/prod」之间的不对称（微码规范不写 import.meta，此处理论上不会触发，仅作兜底）。
      const fileUrl = `${location.origin}${base}/${rel}`
      src = src.replace(/\bimport\.meta\b/g, `({ url: ${JSON.stringify(fileUrl)} })`)
      // 补齐运行时编译绕过的 Vite AutoImport：生成组件常省略 `import { ref } from 'vue'`，
      // 直接依赖 auto-import；此处与 loadVue3Runtime 的 getFile 保持一致，避免 prod 微码预览
      // 因 ref/computed 等未定义而崩溃（dev 与 Vue3 prod 路径已通过 loadVue3FromWorkspace 注入）。
      src = injectVueAutoImports(src)
      // 微码组件：剥掉入口 .vue 的 <style> 块（CSS 已预编译注入）
      // Vue3 组件：保留 <style scoped>，由 vue3-sfc-loader 编译
      if (!isVue3 && rel.endsWith('index.vue')) {
        src = src.replace(/<style[\s\S]*?<\/style>/gi, '')
      }
      return src
    },
    addStyle(textContent) {
      const style = document.createElement('style')
      style.setAttribute('data-preview-style-scope', previewStyleScopeId)
      style.textContent = textContent
      document.head.appendChild(style)
    },
    // handleModule 第二参是 getContentData 函数（非字符串）
    async handleModule(type, getContentData, modulePath) {
      if (type === '.json') {
        return JSON.parse(String(await getContentData(false)))
      }
      // 图片/字体等二进制资源：将 import xxx from '...png' 解析为绝对 URL 字符串，
      // 浏览器直接 fetch 该 URL（后端 /api/preview 的 CSP 已允许同源图片）。
      // 修复前缺失此分支，微码组件 import 本地图片会被当成文本读取而损坏，
      // 导致生产预览“连静态资源都没加载出来”。
      if (BINARY_EXTS.has(type)) {
        const rel = resolveRelPath(modulePath || '')
        return `${base}/${rel}`
      }
      return undefined
    }
  }

  return await loadModule(entryPath, options)
}

// 把原始错误归类成用户能看懂的提示（区分：文件缺失 / LESS 编译失败 / 不支持的图片资源 / 网络404）
function classifyLoadError(e) {
  const msg = (e?.message || String(e)) + ''
  if (/\.(png|jpe?g|gif|webp|svg)/i.test(msg) || msg.includes('Unable to handle')) {
    return (
      '组件引用了不支持的本地图片资源（.png/.jpg 等）。请改为在线 URL 或 base64 内联。\n\n原始错误：' +
      msg
    )
  }
  if (msg.includes('LESS 编译失败')) {
    return '组件样式（LESS）编译失败，请检查 <style lang="less"> 块语法。\n\n原始错误：' + msg
  }
  const missingFile = msg.match(/找不到文件:\s*([^\n]+)/)
  const missingPath = missingFile?.[1]?.trim() || ''
  const isBareModule = missingPath && !missingPath.includes('/') && !missingPath.includes('.')
  if (isBareModule) {
    return '组件引用了预览运行时尚未注入的依赖模块，请将该模块加入预览白名单。\n\n原始错误：' + msg
  }
  if (msg.includes('未找到 Vue3 组件') || msg.includes('找不到文件')) {
    return '组件文件缺失或路径不正确（groupId / componentId 不匹配）。\n\n原始错误：' + msg
  }
  if (msg.includes('404') || msg.includes('Failed to fetch')) {
    return '组件资源加载失败（网络错误 / 404）。\n\n原始错误：' + msg
  }
  return '组件加载失败（组件自身问题，不影响系统其他功能）。\n\n原始错误：' + msg
}

// 通知父页面（嵌入 iframe 时）：组件加载失败，便于父页面显示非阻塞警告
function notifyParentError(message, diagnostic = null) {
  if (isEmbedded.value && window.parent) {
    window.parent.postMessage(
      {
        type: 'MVGO_PREVIEW_ERROR',
        componentId,
        groupId,
        sessionId: snapshotSource?.sessionId || '',
        revision: snapshotSource?.revision || '',
        source: snapshotSource?.kind || 'workspace',
        message,
        diagnostic
      },
      window.location.origin
    )
  }
}

// 通知父页面：AI 已修复并且当前 iframe 重新加载完成，父页面应清旧错误并刷新任务/预览状态。
// payload 可为字符串（兼容旧调用）或对象（含 status/success 详细状态）
function notifyParentFixed(payload) {
  if (isEmbedded.value && window.parent) {
    const data =
      typeof payload === 'string'
        ? { type: 'MVGO_PREVIEW_FIXED', componentId, groupId, summary: payload }
        : { type: 'MVGO_PREVIEW_FIXED', componentId, groupId, ...payload }
    window.parent.postMessage(data, '*')
  }
}

function handleLoadError(e) {
  const friendly = classifyLoadError(e)
  const diagnostic = e?.lessCompileGate?.diagnostics?.[0] || null
  loadError.value = friendly
  loadDiagnostic.value = diagnostic
  rtComponent.value = null
  previewStatus.value = 'load-error'
  previewErrorType.value = 'component-load'
  console.error('[预览] 加载失败:', e)
  // 加载阶段错误由外层错误卡片承接，必须停止 ErrorBoundary 的超时计时器，
  // 否则用户点击 AI 修复或重新加载前就会先触发 10s 超时。
  errorBoundaryRef.value?.markLoaded()
  notifyParentError(friendly, diagnostic)
}

function normalizeDiagnosticFile(file = '') {
  const decoded = decodeURIComponent(String(file))
  const componentMarker = `/${componentId}/`
  const markerIndex = decoded.lastIndexOf(componentMarker)
  return markerIndex >= 0
    ? decoded.slice(markerIndex + componentMarker.length)
    : decoded.split('/').pop() || 'index.vue'
}

function openSource(locate = false) {
  const diagnostic = loadDiagnostic.value
  const file = normalizeDiagnosticFile(diagnostic?.file || 'package/index.vue')
  const query = new URLSearchParams({
    type: isPage ? 'page' : isVue3 ? 'vue3' : 'microcode',
    groupId: String(groupId),
    file
  })
  if (locate && diagnostic) {
    query.set('line', String(diagnostic.line || 1))
    query.set('column', String(diagnostic.column || 1))
  }
  window.open(`/demo/${componentId}?${query.toString()}`, '_blank')
}

async function enableStructurePreview() {
  structurePreviewMode.value = true
  document.documentElement.dataset.structurePreview = 'true'
  await reloadComponent({ ignoreStyles: true })
}

async function getLlmConfig() {
  const { useConfigStore } = await import('@/stores/config')
  const configStore = useConfigStore()
  const globalConfig = configStore.config || {}
  return {
    apiKey: globalConfig.textApiKey || globalConfig.aiApiKey || undefined,
    baseURL: globalConfig.textBaseURL || globalConfig.aiBaseURL || undefined,
    model: globalConfig.textModel || globalConfig.aiModel || undefined
  }
}

// 启动实时计时（每秒 +1），用于覆盖层显示已等待时长
function startAiFixTimer() {
  aiFixSeconds.value = 0
  if (aiFixTimer) window.clearInterval(aiFixTimer)
  aiFixTimer = window.setInterval(() => {
    aiFixSeconds.value++
  }, 1000)
}
function stopAiFixTimer(reset = false) {
  if (aiFixTimer) {
    window.clearInterval(aiFixTimer)
    aiFixTimer = null
  }
  if (reset) aiFixSeconds.value = 0
}

// 用户主动取消进行中的 AI 修复
function cancelAiFix() {
  if (!aiFixController) return
  aiFixCancelling.value = true
  aiFixController.abort()
  // abort 后 fetch 会走 catch，由 finally 统一清理；这里仅给出即时反馈
  setAiFixMessage('已取消修复', 'warn')
}

async function requestAiFix(errorPayload) {
  // ── 严格单请求：进行中直接忽略，不重复发请求 ──
  if (aiFixing.value) {
    return false
  }
  aiFixing.value = true
  aiFixCancelling.value = false
  setAiFixMessage('')
  startAiFixTimer()

  const controller = new AbortController()
  aiFixController = controller
  const timeoutTimer = window.setTimeout(() => {
    controller.abort()
  }, AI_FIX_TIMEOUT_MS)
  let result: any = null
  try {
    result = await http.post(
      '/api/demo/ai-fix-render-error',
      {
        componentId,
        groupId,
        errorMessage:
          errorPayload?.message ||
          String(errorPayload?.error || loadError.value || '未知组件预览错误'),
        stack: errorPayload?.stack || loadError.value || '',
        info: errorPayload?.info || previewErrorType.value || '',
        llmConfig: await getLlmConfig()
      },
      { signal: controller.signal }
    )

    if (!result?.success) {
      const message = result?.message || result?.data?.summary || 'AI 修复失败'
      console.error('[预览] AI 修复失败:', message)
      // 失败时保持 loading 覆盖层不关闭，用内联消息替代 alert
      if (result?.data?.alreadyRunning) {
        setAiFixMessage(message, 'warn')
      } else {
        setAiFixMessage(message, 'error')
      }
      return false
    }

    console.log('[预览] AI 修复完成:', result.data.summary)
    setAiFixMessage('修复完成，正在重新加载预览…', 'success')
    loadError.value = ''
    await reloadComponent()

    // 可靠通知父页面：等一个微任务周期后取最终状态
    await nextTick()
    const finalStatus = previewStatus.value
    const isLoadOk = finalStatus === 'ready' || (rtComponent.value && !loadError.value)

    notifyParentFixed({
      summary: result.data.summary || 'AI 修复完成',
      status: finalStatus,
      success: isLoadOk
    })

    if (isLoadOk) {
      setAiFixMessage('组件已修复并正常显示', 'success')
    } else {
      setAiFixMessage('修复已应用但预览仍有问题（' + finalStatus + '）', 'warn')
    }

    if (isLoadOk) {
      setTimeout(() => {
        if (!aiFixing.value) setAiFixMessage('')
      }, 3000)
    }
    return true
  } catch (e) {
    // 主动取消（含超时 abort）→ 不弹窗
    if (e?.name === 'AbortError') {
      if (aiFixCancelling.value) {
        console.log('[预览] 用户取消 AI 修复')
      } else {
        setAiFixMessage(
          `修复超过 ${Math.round(AI_FIX_TIMEOUT_MS / 1000)} 秒仍未返回，请检查后端模型配置、额度或稍后重试。`,
          'error'
        )
      }
      return false
    }
    // 网络异常等 → 同样用内联消息，不弹窗
    console.error('[预览] AI 修复请求失败:', e)
    setAiFixMessage('请求异常：' + (e?.message || e), 'error')
    return false
  } finally {
    if (aiFixController === controller) {
      window.clearTimeout(timeoutTimer)
      aiFixController = null
    }
    // 停止 interval 但保留最终秒数，让 UI 显示实际等待时长
    if (aiFixTimer) {
      window.clearInterval(aiFixTimer)
      aiFixTimer = null
    }
    aiFixing.value = false
    // 3 秒后重置秒数（等用户看到最终等待时长）
    setTimeout(() => {
      aiFixSeconds.value = 0
    }, 3000)
  }
}

async function handleAiFixRenderError(payload) {
  return await requestAiFix(payload)
}

async function handleAiFixLoadError() {
  return await requestAiFix({
    message: loadError.value || '组件加载失败',
    stack: loadError.value || '',
    info: 'load-error'
  })
}

async function reloadComponent(options = {}) {
  if (typeof options?.ignoreStyles === 'boolean') {
    structurePreviewMode.value = options.ignoreStyles
  }
  cleanupPreviewInjectedStyles()
  rtComponent.value = null
  loadError.value = ''
  loadDiagnostic.value = null
  markLoading()
  // 重置边界状态并停止旧超时计时器，避免上一次加载/修复遗留的 timeout 在新加载期间误触发
  errorBoundaryRef.value?.setError(null)
  errorBoundaryRef.value?.markLoaded()
  await loadAspectRatio()
  try {
    if (!componentId) throw new Error('缺少组件 ID')
    rtComponent.value = import.meta.env.DEV ? await loadDev() : await loadProd()
    // 🛡️ P2（2026-09-03）：CSS 在 loadModule 编译期注入，早于组件 DOM 挂载，
    // 故在渲染完成后（nextTick）补做作用域化：剥离失效的 [data-v-*] + 加预览容器前缀。
    await nextTick()
    applyScopeToPreviewStyles(previewStyleScopeId)
    await markReadyAfterRender()
    // 组件加载成功，停止超时计时器
    errorBoundaryRef.value?.markLoaded()
  } catch (e) {
    handleLoadError(e)
  }
}

async function copyError() {
  try {
    await navigator.clipboard.writeText(loadError.value || '')
    // 轻提示（don't break if toast unavailable）
    console.log('[预览] 错误信息已复制')
  } catch {
    /* 忽略复制失败 */
  }
}

// 通知父页面：预览页已挂载完成，父页面可在此刻下发初始配置（如面板类型）。
// 仅 postMessage 不可靠地依赖 iframe @load —— 那时 iframe 内的 Vue 可能尚未 mounted，
// 消息会被丢弃；由子页面主动握手可保证父页面总是把当前设置补发过来。
function notifyParentMounted() {
  if (!isEmbedded.value || !window.parent) return
  window.parent.postMessage(
    { type: 'mvgo-preview-mounted', componentId, groupId },
    window.location.origin
  )
}

// 接收父页面 / Playground 推送的指令（postMessage 桥接实时联动）
function onPreviewMessage(event) {
  const data = event.data
  if (!data || typeof data.type !== 'string') return
  // 跨 iframe 来源校验：父窗口推送仅接受同源
  if (event.origin !== window.location.origin) return

  // 🎨 面板类型下发：TaskDetail 预览区右上角下拉 → iframe 内实时生效
  if (data.type === 'set-panel-type') {
    const next = typeof data.panelType === 'string' ? data.panelType : ''
    if (next !== globalPanelType.value) {
      globalPanelType.value = next
      console.log('🎨 [Preview] 父页面下发面板类型:', next || '(使用默认)')
    }
    return
  }

  if (data.type !== 'apply-css-vars') return
  const cssVars = data.cssVars || {}
  const root = document.documentElement
  Object.entries(cssVars).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    root.style.setProperty(`--${key}`, String(value))
  })
}

onMounted(async () => {
  window.addEventListener('message', onPreviewMessage)
  notifyParentMounted()

  // 🎨 独立窗口：从 URL query 读取面板类型（?panelType=base-panel）
  if (!isEmbedded.value) {
    const pt = String(route.query.panelType || '')
    if (pt) globalPanelType.value = pt
  }

  await loadPreviewComponent()
})

// 监听 URL 参数变化（如 _t 时间戳），自动重新加载组件
// 父页面通过改变 iframe src 来刷新预览，预览页需要响应这种变化
watch(
  () => route.query._t,
  async () => {
    // _t 参数变化时重新加载组件
    await loadPreviewComponent()
  }
)

// 提取组件加载逻辑为独立函数，供 onMounted 和 watch 复用
async function loadPreviewComponent() {
  cleanupPreviewInjectedStyles()
  markLoading()
  await loadAspectRatio()
  try {
    if (!componentId) throw new Error('缺少组件 ID')
    rtComponent.value = import.meta.env.DEV ? await loadDev() : await loadProd()
    // 🛡️ P2（2026-09-03）：CSS 在 loadModule 编译期注入，早于组件 DOM 挂载，
    // 故在渲染完成后（nextTick）补做作用域化：剥离失效的 [data-v-*] + 加预览容器前缀。
    await nextTick()
    applyScopeToPreviewStyles(previewStyleScopeId)
    await markReadyAfterRender()
    // 组件加载成功，停止超时计时器
    errorBoundaryRef.value?.markLoaded()
  } catch (e) {
    handleLoadError(e)
  }
}

onUnmounted(() => {
  window.removeEventListener('message', onPreviewMessage)
  cleanupPreviewInjectedStyles()
})
</script>

<style scoped>
/* 原尺寸画布：空间足够时居中，不足时由容器滚动，禁止压缩组件本身。 */
.mc-preview-stage-shell {
  width: 100%;
  height: 100vh;
  min-width: 100%;
  min-height: 100%;
  display: flex;
  justify-content: safe center;
  align-items: safe center;
  overflow: auto;
  background: #ffffff;
}
/* 独立窗口模式（非 iframe 嵌入）：
 * 组件按原始尺寸（figma 尺寸）居中展示，超出窗口时由容器滚动，不再拉伸放大。
 * 2026-09-01：此前 width/height 100% !important 会把 420px 设计稿拉伸到全屏（1200px 窗口 ≈ 2.86 倍），
 * 造成「还原 2 倍」的视觉误判；有 figma 尺寸的组件由 stageStyle 给定原尺寸，无尺寸的组件仍自适应全宽。 */
html:root .mc-preview-stage-shell.is-standalone .mc-preview-stage {
  min-width: 0 !important;
  min-height: 0 !important;
}
.mc-preview-stage {
  overflow: hidden;
  /* 纯白背景：确保 iframe 内部与外层淡蓝页面形成鲜明对比 */
  background: #ffffff;
}

/* ===================================================================
 * 类型化样式特殊处理（样式层兜底）
 * -------------------------------------------------------------------
 * 微码：面板外壳（header / 背景 / padding / 阴影）由宿主 <base-panel>
 *      统一提供，微码「内容根节点」自身不应再画这些，否则与宿主面板
 *      叠加成「双重面板」。此处对内容根节点做样式层重置，作为生成阶段
 *      （已过滤 bg/header 资源）之外的双保险，防止 LLM 在根节点再次
 *      生成 padding/阴影/背景导致内边距/外框叠加。
 *      仅作用于微码（.preview-microcode），Vue3 不受影响。
 *      注意：嵌套 wrapper 里的背景/自建 header 是生成阶段过滤的范畴，
 *            这里只兜底「写在根节点」的 padding/阴影/背景/边框/外边距。
 * =================================================================== */
.preview-microcode :deep(.pannel-content) > *,
.preview-microcode :deep(.base-panel-content-main) > * {
  padding: 0 !important;
  margin: 0 !important;
  box-shadow: none !important;
  border: none !important;
  background: none !important;
  background-image: none !important;
}

/* Vue3：纯组件、不套任何面板，仅按组件自身尺寸（loadAspectRatio 控制）展示。
 * 此处不附加任何外壳样式，保留此 class 仅作类型标记。 */
.preview-vue3 {
  /* Vue3 组件自带完整设计（含自身背景/外框），预览页不包裹面板。 */
}

/* 已知原始画布尺寸时，组件根节点必须服从画布宽高。
 * 生成代码中的 min-height: 500px 等通用兜底不能反向撑破 Figma 原始尺寸。 */
.preview-vue3 > :deep(.error-boundary) > :deep(.mc-preview-component-root),
.preview-vue3 > :deep(.mc-preview-component-root) {
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: 100% !important;
  max-height: 100% !important;
  flex: 0 0 100%;
  box-sizing: border-box;
}
.mc-preview-tip {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100vh;
  color: #5f5e5a;
  font-size: 13px;
  padding: 24px;
  text-align: center;
  overflow: auto;
}
.mc-preview-spinner {
  width: 22px;
  height: 22px;
  border: 3px solid #d3d1c7;
  border-top-color: #378add;
  border-radius: var(--radius-full);
  animation: mc-spin 0.8s linear infinite;
  flex: none;
}
@keyframes mc-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ===== 组件加载失败错误卡片（明确告知是组件自身问题，不影响系统） ===== */
.mc-preview-error-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100vh;
  padding: 24px;
  text-align: center;
  overflow: auto;
  box-sizing: border-box;
}
.mc-preview-error-icon {
  font-size: 40px;
  line-height: 1;
}
.mc-preview-error-title {
  font-size: 18px;
  font-weight: 600;
  color: #f56c6c;
}
.mc-preview-error-desc {
  max-width: 520px;
  font-size: 13px;
  line-height: 1.7;
  color: #5f5e5a;
}
.mc-preview-error-desc strong {
  color: #e37318;
}
.mc-preview-error-detail {
  max-width: 560px;
  max-height: 32vh;
  width: 100%;
  margin: 0;
  padding: 12px;
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.5;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  text-align: left;
}
.mc-preview-error-location {
  width: 100%;
  max-width: 560px;
  padding: 8px 12px;
  border: 1px solid #f0c36d;
  border-radius: var(--radius-sm);
  background: #fff8e6;
  color: #8a5a00;
  font:
    12px/1.5 'SF Mono',
    'Monaco',
    'Menlo',
    monospace;
  text-align: left;
}
.mc-preview-error-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
.mc-structure-preview-badge {
  position: fixed;
  top: 12px;
  left: 50%;
  z-index: 9999;
  transform: translateX(-50%);
  padding: 7px 12px;
  border: 1px solid #e5a100;
  border-radius: var(--radius-sm);
  background: #fff6d8;
  color: #7a5100;
  font-size: 12px;
  font-weight: 600;
}
.mc-preview-error-btn {
  padding: 8px 18px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}
.mc-preview-error-btn:hover {
  background: var(--button-primary-bg-hover);
}
.mc-preview-error-btn:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.mc-preview-error-btn.ghost {
  background: transparent;
  color: var(--button-ghost-text);
  border: 1px solid var(--brand-border);
}
.mc-preview-error-btn.ghost:hover {
  background: var(--button-ghost-bg-hover);
}
.mc-preview-error-btn.primary {
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
}
.mc-preview-error-btn.primary:hover {
  background: var(--button-primary-bg-hover);
}

/* AI 修复状态反馈 */
.mc-preview-ai-fix-status {
  font-size: 12px;
  line-height: 1.6;
  padding: 8px 14px;
  border-radius: var(--radius-sm, 4px);
  max-width: 520px;
  word-break: break-word;
  display: flex;
  align-items: center;
  gap: 8px;
}
.mc-preview-ai-fix-status.success {
  background: rgba(103, 194, 58, 0.1);
  color: var(--color-success, #67c23a);
}
.mc-preview-ai-fix-status.error {
  background: rgba(245, 108, 108, 0.1);
  color: var(--color-danger, #f56c6c);
}
.mc-preview-ai-fix-status.warn {
  background: rgba(230, 162, 60, 0.1);
  color: var(--color-warning, #e6a23c);
}
.mc-ai-fix-retry {
  margin-left: 6px;
  font-size: 12px;
  padding: 2px 10px;
  border: 1px solid currentColor;
  border-radius: var(--radius-xs, 2px);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

/* AI 修复进行中：覆盖式 loading */
.mc-ai-fix-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 36px 20px;
  text-align: center;
  border-radius: var(--radius-md, 8px);
  background: var(--bg-elevated, #fff);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}
.mc-ai-fix-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(var(--primary-rgb, 64, 158, 255), 0.2);
  border-top-color: var(--color-primary, #409eff);
  border-radius: var(--radius-full, 50%);
  animation: mc-ai-fix-spin 0.9s linear infinite;
}
@keyframes mc-ai-fix-spin {
  to {
    transform: rotate(360deg);
  }
}
.mc-ai-fix-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #303133);
}
.mc-ai-fix-sub {
  font-size: 13px;
  color: var(--text-secondary, #909399);
  max-width: 320px;
  line-height: 1.6;
}

/* 🎨 面板切换器样式 */
.mc-panel-switcher {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: var(--radius-md);
  box-shadow: 0 2px 12px var(--shadow-md);
  font-size: 14px;
  color: var(--text-primary);
  backdrop-filter: blur(10px);
}

.mc-panel-switcher label {
  font-weight: 500;
  white-space: nowrap;
}

.mc-panel-select {
  padding: 6px 12px;
  border: 1px solid #dcdfe6;
  border-radius: var(--radius-xs);
  background: white;
  font-size: 14px;
  color: #606266;
  cursor: pointer;
  transition: border-color 0.3s;
  min-width: 160px;
}

.mc-panel-select:hover {
  border-color: var(--brand-light);
}

.mc-panel-select:focus {
  outline: none;
  border-color: var(--brand-light);
}
</style>

<!-- 全局样式：预览页完全独立，覆盖 App.vue 全局样式 -->
<style>
html,
body,
#app {
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  scrollbar-width: none;
}
html::-webkit-scrollbar,
body::-webkit-scrollbar,
#app::-webkit-scrollbar {
  display: none;
}
</style>
