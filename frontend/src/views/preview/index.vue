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
  <div
    class="mc-preview-stage-shell"
    :class="{ 'is-standalone': !isEmbedded, 'is-responsive': previewMode === 'responsive' }"
  >
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
    <!-- 🎨 主题切换控件（R12 · 2026-10-10 双主题 / 🆕🆕 2026-10-12 N 主题）
     - N 主题：按 declare.json 的 themeConfig.list **动态渲染**（不再硬编码两段）
     - 单主题：只渲染 list 里那一个
     徽标数据源：declare.json 的 themeConfig.dualTruth（后端 normalizeDeclareJson 写入），
     预览页本就已在读 declare.json ⇒ 本控件零新增请求。 -->
    <div v-if="!isVue3 && !isEmbedded" class="mc-theme-switcher" :class="resolvedThemeClass">
      <div class="mc-theme-seg" role="radiogroup" aria-label="主题切换">
        <button
          v-for="t in selectableThemes"
          :key="t.key"
          type="button"
          class="mc-theme-seg-btn"
          :class="{ active: resolvedThemeClass === t.key, builtin: t.readonly }"
          role="radio"
          :aria-checked="resolvedThemeClass === t.key"
          :title="t.readonly && t.coreColors
            ? `切换到「${t.name}」主题（内置预设色：主色 ${t.coreColors.colorPrimary}，不含设计稿真值）`
            : `切换到「${t.name}」主题`"
          @click="switchPreviewTheme(t.key)"
        >
          <svg v-if="t.brightness !== 'dark'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
          <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
          <span>{{ t.name }}</span>
        </button>
      </div>
      <!-- 全真值徽标：多主题且全为设计真值时显示 -->
      <span
        v-if="isDualTruth"
        class="mc-theme-badge"
        :title="`共 ${selectableThemes.length} 套主题，色值均取自设计稿`"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        {{ selectableThemes.length > 2 ? `${selectableThemes.length} 主题` : '双真值' }}
      </span>
      <!-- 单稿组件：明示另一侧是派生值，避免误读（R12 反误读设计） -->
      <span v-else class="mc-theme-derived">
        {{ resolvedThemeClass === 'dark' ? '浅色侧为派生值' : '深色侧为派生值' }}
      </span>
    </div>
    <!-- 主题提示条（保留原信息：演示面板说明） -->
    <div v-if="!isVue3 && !isEmbedded" class="mc-theme-hint" :class="resolvedThemeClass">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
      当前为演示主题面板（{{ resolvedThemeClass === 'dark' ? '深色' : '浅色' }}），实际项目中可在面板配置中切换主题
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
        :timeout="30000"
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
            <!-- 🛡️ 2026-09-29 治本：错误卡正文随「失败性质」切换。
                 原来写死「这是组件自身的问题（如文件缺失…）」，会把
                 「前端资源版本问题」「取源服务 5xx」也一并栽给组件产物，
                 与下方具体提示（如“与组件产物无关”）自相矛盾。 -->
            <div class="mc-preview-error-desc">
              <template v-if="loadErrorScope === 'environment'">
                这是
                <strong>预览环境的临时问题</strong>
                （前端资源或取源服务），
                <strong>组件产物本身未被判定为有错</strong>
                。请按下方具体提示刷新或稍后重试。
              </template>
              <template v-else>
                这是
                <strong>组件自身的问题</strong>
                （如文件缺失、样式编译错误或引用了不支持的资源），
                <strong>不会影响系统其他功能</strong>
                。可重新加载，或检查该组件的源码。
              </template>
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
  precompileVueLess,
  PREVIEW_FAIL_KIND,
} from '@/utils/loadVue3Runtime'
import { BINARY_EXTS as BINARY_EXTS_SHARED, extOf } from '@/utils/sfc-loader-binary'
import { buildSnapshotFileUrl, hasPreviewEntry, resolvePreviewDescriptor } from '@/utils/preview-resolver'
import http from '@/core/http'
import appConfig from '@/config'
import { getComponentBySessionId, getRouteUrl } from '@/api/component'

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
// snapshot=0 必须压过 URL 里残留的 sessionId+revision（Playground 编辑态）。
const forceWorkspaceSource = String(route.query.snapshot || '') === '0'
const hasExplicitSource = !forceWorkspaceSource && !!(route.query.sessionId && route.query.revision)

async function ensureLatestSnapshot() {
  if (hasExplicitSource) return
  // 2026-09-10：Playground / 编辑态入口带 `snapshot=0`，强制走 workspace 源。
  // 原因：AI 修复与代码编辑都写 workspace，而快照是生成时的旧内容，
  // 走快照会出现「代码已改但预览不变」。只有生成中（workspace 尚无产物）才需要快照。
  if (forceWorkspaceSource) return
  if (latestSnapshotSource.value) return
  // path 段是 componentId 可能是 componentId 或 sessionId（看入口），query.sessionId 优先；都没有就用 componentId
  const sessionId = String(route.query.sessionId || componentId || '')
  if (!sessionId) return
  // 🛡️ 2026-09-28 治本（"生成完成后组件加载失败：未找到组件 mc-max-*，刷新就好"）：
  //   快照与组件记录都比「完成」事件晚落库 —— 实测同一任务 lastGood 创建于 06:39:24.301、
  //   组件记录 createdAt 06:39:27.878（**相差 ~3.6s**）。而本函数原**零重试**、单次探测：
  //   首开时 latest 查不到 → latestSnapshotSource 留 null → 退到 workspace 源并按 sessionId 拼目录
  //   → 必然 404「未找到组件」。resolveWorkspaceComponentId 的 3s 退避也刚好差 ~0.4s 追不上记录落库，
  //   所以「刷新一下就好」（那时两者都在）。
  //   治本：**有界退避重试**（与记录反查同构），命中即停 → 不拖慢正常路径（正常 1 次即返回）。
  //   ⚠️ 仅对「sessionId 形态」重试：URL 带 sessionId query、或 path 段本身就是 mc-*/mv-*。
  //   若入口只给了语义 componentId（latest 按 sessionId 建索引，必然 404）→ 不重试，避免白等 6s。
  const retryable = !!route.query.sessionId || /^(mc|mv)-/.test(sessionId)
  const maxAttempt = retryable ? 5 : 1
  for (let attempt = 0; attempt < maxAttempt; attempt++) {
    await attemptFetchLatestSnapshot(sessionId)
    if (latestSnapshotSource.value) return
    if (attempt < maxAttempt - 1) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
  }
}

/** 单次拉取 latest 快照（含 componentId→sessionId 反查兜底）。成功时写 latestSnapshotSource。 */
async function attemptFetchLatestSnapshot(sessionId: string) {
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
    // 🛡️ 2026-10-01 治本（"每次生成结束跳预览报 未找到组件 mc-max-*，刷新就好"）：
    //   candidate/partial 可能是 chunk 级中间态（实测缺 package/index.vue 入口）。
    //   旧逻辑 snap = lastGood || candidate || partial 来者不拒 —— 完成跳转的一刹那
    //   若只查到无入口的 candidate，快照分支直接抛「未找到组件」且不再退 workspace。
    //   治本：只接受**含入口文件**的快照（lastGood > candidate > partial，逐级探 manifest），
    //   没有就保持 null → 交给重试循环继续等 lastGood / 最终走 workspace 源。
    const snap = [lastGood, candidate, partial].find((s) => s?.revision && hasPreviewEntry(s))
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
          // 🛡️ 同上：只接受含入口文件的快照（lastGood > candidate > partial）
          const snap = [rd?.lastGood, rd?.candidate, rd?.partial].find((s) => s?.revision && hasPreviewEntry(s))
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
  // 🛡️ 2026-09-26（预览竞态兜底）：后端组件记录可能比「完成」事件晚落库，
  // 生成完成一刹那跳预览时 by-session 可能仍为空 → 旧逻辑直接回退原始 session 名
  // → custom-components/<session> 找不到 → 「未找到组件」。
  // 🛡️ 2026-09-28 加长：实测记录 createdAt 比 lastGood 快照晚 **~3.6s**（06:39:27.878 vs 06:39:24.301），
  //   原 4 次≈3s 刚好差 ~0.4s 追不上。改为 6 次（≈0.4+0.8+1.2+1.6+2.0s≈6s），与 ensureLatestSnapshot 同预算。
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const component = await getComponentBySessionId(id)
      if (component?.componentId) return component.componentId
    } catch {
      // 单次失败 → 继续退避重试
    }
    if (attempt < 5) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
  }
  return id
}

const snapshotSource = computed(() => {
  if (forceWorkspaceSource) return null
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
// 失败性质：'artifact' = 组件产物自身问题（默认，保持既有文案）；
//          'environment' = 前端资源 / 取源服务等预览环境问题（不归咎组件产物）。
// 由 handleLoadError 按加载器标注的 previewFailKind 判定（常量单一事实源见 @/utils/loadVue3Runtime）。
const loadErrorScope = shallowRef('artifact')
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

// 预览环境注入主题 class（微码组件样式挂在 .dark/.light 父选择器下）
// 不注入则所有样式规则匹配失败，导致样式完全失效
// 优先级：手动切换 > URL query > Playground postMessage > declare.json themeConfig.default > 'dark' 兜底
const playgroundTheme = ref(null) // 从 Playground 下发的主题（postMessage 实时联动）
// 🆕 R12（2026-10-10）：用户在本页手动切换的主题。
//   放最高优先级 —— 手动点击是用户的即时意图，应压过 URL query 与 Playground 下发；
//   但 Playground 切换时需让位（见下方 watcher），否则外部联动会「抢不回」控制权。
const manualTheme = ref(null)

/**
 * 🆕🆕 2026-10-12 N 主题：key 合法性判定。
 *
 * key 集合来自 declare.json 的 themeConfig.list（用户自填名 slug 化后的结果）。
 * ⚠️ 必须白名单校验：URL query 是外部可控输入，直接当 class 用等于
 *   `class="mc-preview-stage <任意串>"`，会引入不可预期类名。
 * computed 是惰性的 —— 下面才声明的 selectableThemes 在此处访问是安全的。
 */
const isValidThemeKey = (key) =>
  !!key && typeof key === 'string' && selectableThemes.value.some((t) => t.key === key)

const resolvedThemeClass = computed(() => {
  // 0. 手动切换（R12，最高优先级）
  if (manualTheme.value && isValidThemeKey(manualTheme.value)) return manualTheme.value
  // 1. URL query 强制指定
  const themeQuery = route.query.theme
  if (isValidThemeKey(themeQuery)) return themeQuery
  // 2. Playground 实时下发（postMessage 联动）
  if (isValidThemeKey(playgroundTheme.value)) return playgroundTheme.value
  // 3. 从 declare.json 读取默认主题（key 可能是用户自填名）
  const declareDefault = microcodeDeclare.value?.themeConfig?.default
  if (isValidThemeKey(declareDefault)) return declareDefault
  // 4. 兜底 dark
  return 'dark'
})

// 🆕 R12：主题切换（多真值组件让用户当场验证各套配色）
//   - 同步写回 URL query，使预览可分享/刷新保持（与既有 ?theme= 机制同源）
//   - 样式 class 由 resolvedThemeClass 派生，CSS 变量注入已监听该值（applyPreviewCssVars）
//   ⚠️ key 不再限定 light/dark：N 主题下 key 是用户自填名经 slug 化的结果（如「黄昏模式」）。
//      合法集合以 selectableThemes 为准，避免 URL 里塞任意字符串污染 class。
const switchPreviewTheme = (theme) => {
  if (!selectableThemes.value.some((t) => t.key === theme)) return
  manualTheme.value = theme
  // Playground 通过 postMessage 下发主题时会抢回控制权，这里主动清掉，让手动切换生效
  if (playgroundTheme.value) playgroundTheme.value = null
  try {
    const q = { ...route.query, theme }
    router.replace({ query: q })
  } catch {
    // router 不可用（嵌入宿主 iframe 等）时静默降级：主题已切换，仅 URL 不同步
  }
}

// 🆕 R12：双真值徽标（declare.json themeConfig.dualTruth，由后端 normalizeDeclareJson 写入）
const isDualTruth = computed(() => microcodeDeclare.value?.themeConfig?.dualTruth === true)

/**
 * 🔴 2026-10-12：安全解析主题预览图 URL。
 *
 * 为什么不能直接拼字符串：declare.json 里的 `previewName` 来自生成管线
 *   （理论上受 check M2-6 约束必须是 `mc-preview*.png`，但**主题维度 check 不管**），
 *   且本页的 declare 来自 HTTP 快照/静态 import —— 一旦名字异常，
 *   直接拼 URL 只会得到一个坏<img>，**不能让整个主题切换控件崩掉**。
 *
 * 因此：白名单校验（前缀 + 不含路径穿越）→ 通过才拼 URL，否则返回 null
 *   （模板里对 null 渲染占位，不显示坏图）。
 */
const safePreviewUrl = (name) => {
  const n = String(name || '').trim()
  // 只允许 `mc-preview` 开头的纯文件名（禁 / 与..，防目录穿越）
  if (!n.startsWith('mc-preview') || !/\.png$/i.test(n) || n.includes('/') || n.includes('..')) {
    return null
  }
  // ⚠️ 本页**不走 `createMcDeclare`**（直接读 declare.json 原始 JSON），
  //   所以 `core.js` 补的 `themeConfig[].previewUrl` 到不了这里；
  //   `attribute.imgUrl` 在 raw declare 里是 `null`，也不能当基址。
  // ⇒ 复用本页**现成**的文件读取入口 `snapshotFileUrl(path)`（:397），
  //   它已处理「快照源 /工作区源」两种模式，避免重复实现 base 路径推导。
  return snapshotFileUrl(`resources/images/${n}`)
}

/**
 * 🆕🆕 2026-10-12 N 主题：可切换主题清单。
 *
 * 数据源 declare.json 的 `themeConfig.list`（后端在多真值分支逐主题写入
 * `{key, name, brightness}`）。单稿产物 list 是既有的 `[{浅色主题},{深色主题}]`，
 * 形状同构 ⇒ 这里统一读它，存量前端读取代码不必分叉。
 *
 * ⚠️ 兜底：读不到 list 时给 `light`/`dark` 两项，保证控件永远有内容可渲染
 *   （否则 N 主题组件在 declare 读取失败时会退化成空白控件）。
 */
const selectableThemes = computed(() => {
  const list = microcodeDeclare.value?.themeConfig?.list
  if (Array.isArray(list) && list.length > 0) {
    return list
      .filter((t: any) => t && t.key)
      .map((t: any) => ({
        key: String(t.key),
        name: String(t.name || t.key),
        brightness: t.brightness === 'dark' ? 'dark' : 'light',
        // 🔴 2026-10-12：这三个字段**必须显式透传** ——
        //   上面的 map 是白名单式构造（不 spread 原对象），漏了会被静默丢弃。
        //   作用：给系统占位 `dark` 打「内置预设色」标记（readonly/builtin/coreColors）。
        readonly: t.readonly === true,
        builtin: t.builtin === true,
        coreColors: t.coreColors || null,
        // 主题预览图（管线已产出 `mc-preview-<key>.png`）。
        // ⚠️ 本页**直接读 declare.json 原始 JSON**（不走 `createMcDeclare`），
        //   所以 `core.js` 里补的 previewUrl 到不了这里 ⇒ 必须**本页本地解析**。
        //   无 `previewName` 的（如系统占位 dark）⇒ 回退主图（用户决策：dark 使用主图）。
        previewUrl: t.previewName
          ? safePreviewUrl(String(t.previewName))
          : safePreviewUrl('mc-preview.png'),
      }))
  }
  return [
    { key: 'light', name: '浅色', brightness: 'light', readonly: false, builtin: false, coreColors: null, previewUrl: safePreviewUrl('mc-preview.png') },
    { key: 'dark', name: '深色', brightness: 'dark', readonly: false, builtin: false, coreColors: null, previewUrl: safePreviewUrl('mc-preview.png') },
  ]
})

// 🆕 R12：已加载的组件 cssVars 源对象（模块级，不随组件重载丢）。
//   主题切换时据此重注入 —— 只有 class 变而 CSS 变量不变的话，
//   双真值组件的 var(--colorPrimary) / var(--colorTextBase) 会停留在旧主题（实测语义）。
let previewCssVars = null

// 主题变化 → 重新注入 CSS 变量（R12）
// 放在模块级而非组件内，确保 playground 下发主题（postMessage）也走同一条路径。
watch(
  () => resolvedThemeClass.value,
  (theme) => {
    if (!previewCssVars) return
    const applied = applyPreviewCssVars(previewCssVars, theme)
    console.log(`🎨 [Preview] 主题切换，重新注入 cssVars ${applied} 项（theme=${theme}）`)
  }
)

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

// 🔴 N 主题（2026-10-12）：本函数注入过的 CSS 变量键集合。
//   用于区分「自己写的」与「父层/宿主推送的」—— 只有前者才允许在换主题时被覆盖。
//   ⚠️ 必须在模块顶层声明（cleanupPreviewInjectedStyles 也用它），
//     放在 applyPreviewCssVars 之前会造成 TDZ 风险。
const injectedKeys = new Set()

function cleanupPreviewInjectedStyles() {
  document
    .querySelectorAll(`style[data-preview-style-scope="${previewStyleScopeId}"]`)
    .forEach((node) => node.remove())
  document
    .querySelectorAll(`style[data-preview-css="${componentId}"]`)
    .forEach((node) => node.remove())
  // 预览页只接收父层注入的 cssVars，组件卸载/重载后必须清掉，避免前一个组件的主题变量串到下一个组件
  document.documentElement.removeAttribute('style')
  // 🔴 同步清空「本函数注入过哪些键」的记账（2026-10-12 N 主题）：
  //   否则下次加载组件时，上一批的键会被误判为「自己注入的」而被覆盖，
  //   破坏「父层推送值优先」的原约定。
  injectedKeys.clear()
}

// 📐 Figma 实际尺寸约束（1:1 原始尺寸展示，超出容器时等比缩小）
const figmaAspectRatio = ref(null) // null = 未知，number = W/H 比值
const figmaOriginalWidth = ref(null) // 原始宽度
const figmaOriginalHeight = ref(null) // 原始高度

// ===================================================================
// 预览模式：fidelity（保真，默认）| responsive（响应式测试）
// -------------------------------------------------------------------
// 为什么必须拆成两种互斥语义：
//   保真模式下 stage 写死 Figma 原始像素宽高（1:1 还原，供视觉比对/截图）。
//   此时若只把外层 iframe 拖窄，stage 宽度不变 → 布局视口可用宽度没变 →
//   @media 命不中、vw 单位不变，用户只会看到「裁切 + 横向滚动」，响应式无从验证。
//   所以「拖拽调尺」必须同时切到 responsive 分支放开这道尺寸锁。
//
//   保真分支的代码路径保持原样不动（视觉保真是已验证的核心价值，不可退化）。
// ===================================================================
type PreviewMode = 'fidelity' | 'responsive'
const previewMode = ref<PreviewMode>('fidelity')

/** 响应式模式下的视口尺寸（由父页面经 postMessage 下发，或本页 URL query 初始化） */
const responsiveWidth = ref(0)
const responsiveHeight = ref(0)

function isResponsiveMode() {
  return previewMode.value === 'responsive' && responsiveWidth.value > 0
}

const componentRootStyle = computed(() => {
  // 关键约束在 stageStyle（stage 才是被写死像素的那一层）：
  //   stage 放开 → 组件根的 100% 才有可流动的宽度。
  // 保真期无 figma 尺寸时不写内联样式（保持原行为，避免影响既有自适应布局）。
  if (!isResponsiveMode() && (!figmaOriginalWidth.value || !figmaOriginalHeight.value)) {
    return undefined
  }
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
  // ── 响应式测试模式：stage 跟随视口真实尺寸，不写死设计稿像素 ──
  // iframe 元素尺寸变化 → 本页 window.innerWidth 变化 → @media / vw 自动重匹配
  // （浏览器原生行为，无需向内层发消息）。
  if (isResponsiveMode()) {
    return {
      width: `${responsiveWidth.value}px`,
      height: `${responsiveHeight.value}px`,
      flex: '0 0 auto',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      overflow: 'visible'
    }
  }

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
    // 先解析 sessionId → 语义化 componentId（workspace 目录是语义化名）
    const resolvedId = snapshotSource.value ? componentId : await resolveWorkspaceComponentId(componentId)
    const basePath = isVue3
      ? `vue3-components/${groupId}/${resolvedId}`
      : `custom-components/${resolvedId}`

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
        // 🛡️ I 类治本（2026-09-16）：dev 兜底必须用 resolvedId（语义化 componentId）。
        // 旧写法用裸 componentId（=sessionId）→ custom-components/<sessionId> 不存在 →
        // Vite dev 命中 SPA fallback 返回 HTML → `import()` 解析 HTML 抛错 → 整页报错卡。
        // 与 :610 loadMicrocodeDeclare 同款「?exists=1 探测 + 非阻断」，并改用 resolvedId（同 :498 basePath）。
        const declareUrl = `/__raw/workspace/custom-components/${resolvedId}/declare.json`
        const existsData = await safeJson(await fetch(`${declareUrl}?exists=1`))
        if (existsData?.exists) {
          try {
            const mod = await import(
              /* @vite-ignore */ `../../../workspace/custom-components/${resolvedId}/declare.json`
            )
            declare = mod.default || mod
          } catch {
            // declare.json 仅用于尺寸兜底与 componentName，读不到不阻断预览
          }
        }
      } else {
        declare = await http.get(`/api/preview/${groupId}/${resolvedId}/declare.json`)
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

// 🛡️ P-05（2026-09-17 · 窄组件预览文字极小实锤）：独立窗口态锁定 rem 基准。
//   rem.js 全局按 1920 设计稿缩放（rem = vW × 16/1920），420px 视口 → html font-size 3.5px
//   → 微码字号全 rem（fontSize=0.75rem）渲染仅 2.6px。嵌入态有父窗口字号兜底（rem.js:16），
//   独立预览窗口（质量截图 / 新标签打开）无父窗口 → 兜底失效。
//   治本：独立窗口态把 html font-size 锁定为 pxtorem.baseSize（真实像素基准），
//   组件按 Figma 原始尺寸 1:1 渲染——预览即所见。嵌入态不动（尊重宿主缩放）。
if (!isEmbedded.value) {
  const baseSize = appConfig?.pxtorem?.baseSize || 16
  document.documentElement.style.fontSize = baseSize + 'px'
  // 阻断 rem.js 的 resize 重算（其计算值小于基准时会被锁值覆盖回来）
  window.addEventListener('resize', () => {
    document.documentElement.style.fontSize = baseSize + 'px'
  })
}

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

/**
 * 🔴 2026-10-12 治本 A：切到**深色**主题时自动切到「一体化/深色面板」
 *（`aio-panel`，底色 `#424242`），其余主题用「默认/浅色面板」（`default-panel`）。
 *
 * 背景（用户决策）：深色主题的验收**要结合一体化面板预览** ——
 *   官方的一体化深色预览方式不是「让组件自己实现两套配色」，而是
 *   「换一个深色底的面板容器」（`aio-panel` vs `aio-light-panel` 是两个独立面板组件，
 *   `grep dark` 零命中：它们都**不注入** `dark` class，只靠自身底色区分深浅）。
 *
 * 为什么要联动：组件的语义槽位在 deep 主题下是**推断值**（治本 B），
 *   未必与真实深色底协调；而深色底 + 浅色组件 = 立刻能看出对比度问题。
 *
 * ⚠️ 只在「用户没手动选过面板」时自动跟随（`userPickedPanel=false`），
 *   否则会覆盖用户显式选择（例如组件声明要 `model-panels` 弹窗面板）。
 */
const AUTO_LIGHT_PANEL = 'default-panel'
const AUTO_DARK_PANEL = 'aio-panel'
const userPickedPanel = ref(false)
/**
 * 🔴 只在**外部/用户**改动面板时置位，`autoApplyingPanel` 期间不算。
 *
 * 踩坑记录（2026-10-12）：原先写成 `watch(globalPanelType, () => userPickedPanel = true)`，
 * 会被下面联动 watch **自己的赋值**触发（Vue watch 回调异步排队，下一 tick 必触发）
 * ⇒ 首次 `immediate` 联动后 `userPickedPanel` 就变true ⇒ **联动只生效一次**，
 *   之后用户切主题面板不再跟随。
 */
const autoApplyingPanel = ref(false)
watch(globalPanelType, () => {
  if (autoApplyingPanel.value) return
  userPickedPanel.value = true
})

watch(resolvedThemeClass, (themeKey) => {
  if (userPickedPanel.value) return
  const want = isDarkThemeKey(themeKey) ? AUTO_DARK_PANEL : AUTO_LIGHT_PANEL
  if (globalPanelType.value !== want) {
    // 🔴 必须置守卫位：否则本次赋值会被上面那个 watch 当成「用户手动选」⇒ 联动只生效一次。
    autoApplyingPanel.value = true
    globalPanelType.value = want
    // 下一 tick 复位（watch 回调已排队执行完）
    nextTick(() => { autoApplyingPanel.value = false })
  }
}, { immediate: true })

/** 主题 key 是否属「深色」范畴 —— 按 themeConfig.list[].brightness 判定，缺省回退 key 名。 */
function isDarkThemeKey(themeKey) {
  const item = (selectableThemes.value || []).find((t) => t.key === themeKey)
  if (item) return item.brightness === 'dark'
  return /dark|深色|夜|night/i.test(String(themeKey || ''))
}

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
  // 🛡️ P1-1 · workspace 路径必须用语义化 componentId（c-xxx-<尾8hex>），
  // 而不是 sessionId（mc-max-*）。与 loadAspectRatio 共用 resolveWorkspaceComponentId。
  const resolvedId = snapshotSource.value ? componentId : await resolveWorkspaceComponentId(componentId)
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
        `/__raw/workspace/custom-components/${resolvedId}/declare.json?exists=1`,
      )
      if (probe.ok) {
        const probeData = await probe.json().catch(() => ({ exists: false }))
        if (probeData?.exists) {
          const mod = await import(
            /* @vite-ignore */ `../../../workspace/custom-components/${resolvedId}/declare.json`,
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

/**
 * 🛡️ 1.2 修法 A（2026-09-28 · c-device-monitor-aa799337 / c-traffic-monitor-afd08494 实锤）
 *
 * 现象：`label` 与 `value` 字号应当不同（设计 14/20，比值 1.4286 已正确写进
 *   `calc(@fontSize * 1.429)`），独立预览里却**完全同号**（实测两段 ink 高都 ≈17px）。
 *
 * 根因：微码产物的 `theme-vars.less` 里 `@fontSize: var(--fontSize)` 是 **mc-check M5-6 的
 *   精确形态要求（不能带 fallback）**，`--fontSize` 的**注入方是「组件容器」**——
 *   `core.js#setComponentProps` 把 `getCssVarsConfig()` 的结果塞进 `componentProps.style`，
 *   由容器内联到组件根元素。而独立预览（`?componentId=` 直开，含**质量预览截图**
 *   `screenshot-renderer.js` 的 `page.goto(previewUrl)`）**没有这个容器**：
 *   `--fontSize` 全仓静态定义 0 处，只有 `demo/index.vue` 会用 postMessage 推。
 *   → 产物里 108 处 `var(--fontSize)` 全部 invalid at computed-value time
 *   → `font-size` 回落 `inherit` → 所有基于 @fontSize 的字号/间距一起塌成父级字号。
 *
 * 修法：预览页按**组件自己声明的** `resources/config/css-vars.js`（唯一事实源，零硬编码）
 *   把 `{...common, ...[theme]}` 写到 `documentElement` 上作为**默认值**。
 *   · 只补**尚未设置**的键（`getPropertyValue` 已存在则跳过）→ 父层 demo 页推送的
 *     自定义值优先；宿主/门户注入的是组件根上的**内联**值，优先级高于 `:root` → 生产不受影响。
 *   · 任一步失败（取不到 / 解析失败 / 运行时未就绪）**一律跳过**（fail-open）→ 最差等于今天的行为。
 *   · `cleanupPreviewInjectedStyles()` 已有 `documentElement.removeAttribute('style')`，
 *     组件卸载/重载不会把变量串给下一个组件。
 *
 * 🔴🔴 N 主题修正（2026-10-12 真机实测）：原实现「`already` 非空就跳过」在**多主题下是错的**
 *   —— 首次注入 theme_1 后，`root.style` 上已有本函数自己写进去的值；切到 theme_2 时
 *   这些值会被误判成「父层推送的默认值」而跳过 ⇒ **切主题只换 class、CSS 变量不变**
 *     （实测三套主题 `--colorPrimary` 全是 `#a6ceff`）。
 *   修法：用 `injectedKeys` 记住**自己**写过的键，只跳过「不是自己写的」那些
 *   （那才是父层/宿主推送的，需保留优先级）。
 */
function applyPreviewCssVars(cssVars, theme) {
  if (!cssVars || typeof cssVars !== 'object') return 0
  const merged = { ...(cssVars.common || {}), ...(cssVars[theme] || {}) }
  const root = document.documentElement
  let applied = 0
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || typeof value === 'object') continue
    const prop = `--${key}`
    let already = ''
    try {
      already = root.style.getPropertyValue(prop)
    } catch {
      already = ''
    }
    // 🔴 已被**自己**注入过 ⇒ 必须覆盖（换主题）；否则才认为是父层/宿主推送的默认值，跳过
    const injectedBySelf = injectedKeys.has(prop)
    if (already && !injectedBySelf) continue
    root.style.setProperty(prop, String(remToPx(value)))
    injectedKeys.add(prop) // 🔴 记账：下次换主题时这些键允许被覆盖
    applied += 1
  }
  return applied
}

/**
 * 🛡️ A2（2026-09-28）：预览把 rem 值**按设计基准折算成 px** 后再注入。
 *
 * 为什么必须折算：微码产物尺寸一律 `calc(var(--fontSize) * N)`，而
 * `--fontSize = $mcCssBuilder.getCssSize(<设计px>) = <设计px>/pxtorem.baseSize rem`。
 * 生产门户在 ~1920 宽屏时 `rem.js` 把 html font-size 调到 ≈baseSize → 组件 1:1；
 * 但预览窗口被全局 `reset.less` 的 `html { font-size: 12px }` 兜住（实测 420/900/1440/1920 四视口恒 12）
 * → 组件只有 12/16 = **0.75×**（label 9px / value 12.86px，设计 14/20）。
 *
 * 预览的唯一目标是与设计稿 1:1，故把「纯 `Nrem` / `N.Nrem`」形态换算成 `N*baseSize px`：
 * 折算后 `0.875rem → 14px`、`calc(var(--fontSize)*1.429) → 20px` = 设计值精确一致。
 * 只影响**组件自身声明的变量**（不动 html font-size / 全局 CSS / rem.js）⇒ 生产零影响；
 * 非 rem 形态（px / 颜色 / 数字）原样透传，不做任何猜测。
 *
 * @param {string|number} value 组件声明的变量值
 * @returns {string|number} 折算后的值
 */
function remToPx(value) {
  const m = /^\s*(-?\d*\.?\d+)rem\s*$/.exec(String(value))
  if (!m) return value
  // 与 rem.js 同源（同一个 @/config 全局配置），不新增事实源
  const base = Number(appConfig?.pxtorem?.baseSize) || 16
  return `${Number((Number(m[1]) * base).toFixed(4))}px`
}

/** 把 ESM 源码文本当模块求值（Blob 模块，避开 eval/new Function）。仅用于 prod/快照源。 */
async function importModuleFromText(text) {
  const blob = new Blob([String(text)], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  try {
    return await import(/* @vite-ignore */ url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 取组件声明的 cssVars 并注入根默认值；微码专用，失败静默跳过。 */
async function loadMicrocodeCssVars() {
  if (isVue3) return
  const rel = 'resources/config/css-vars.js'
  try {
    const resolvedId = snapshotSource.value ? componentId : await resolveWorkspaceComponentId(componentId)
    let mod = null
    if (snapshotSource.value) {
      // A · 快照源
      const res = await http.raw(snapshotFileUrl(rel))
      if (!res?.ok) return
      mod = await importModuleFromText(await res.text())
    } else if (import.meta.env.DEV) {
      // B · dev 静态 import（与 declare.json 同款「先 ?exists=1 探测再 import」）
      const probe = await fetch(`/__raw/workspace/custom-components/${resolvedId}/${rel}?exists=1`)
      if (!probe.ok) return
      const probeData = await probe.json().catch(() => ({ exists: false }))
      if (!probeData?.exists) return
      mod = await import(/* @vite-ignore */ `../../../workspace/custom-components/${resolvedId}/${rel}`)
    } else {
      // C · prod 静态拉取
      const res = await http.raw(`/api/preview/${groupId}/${resolvedId}/${rel}`)
      if (!res?.ok) return
      mod = await importModuleFromText(await res.text())
    }
    const cssVars = mod?.default || mod
    // 🆕 R12：缓存 cssVars 源对象，供主题切换时重新注入（否则手动切换只改 class、
    //   CSS 变量仍是旧主题的值 ⇒ 双真值组件 var(--colorPrimary) 不变）。
    previewCssVars = cssVars && typeof cssVars === 'object' ? cssVars : null
    // 主题取值统一走 resolvedThemeClass（含手动切换优先级），
    // 不再直接读 playgroundTheme —— 否则手动切换后注入的是旧主题变量。
    const theme = resolvedThemeClass.value
    const applied = applyPreviewCssVars(previewCssVars, theme)
    if (applied > 0) {
      console.log(`🎨 [Preview] 已注入组件声明 cssVars ${applied} 项（theme=${theme}）`)
    }
  } catch (e) {
    console.warn('[预览] 组件 cssVars 注入失败（跳过，不影响渲染）:', e?.message || e)
  }
}

async function loadDev() {
  // 预览环境默认走 mock：绑定 API 的组件不真实调用业务接口（业务服务在本平台不可达）
  window.__MVGO_PREVIEW_MOCK__ = true
  // 🛡️ F3-全：URL 缺带 revision 时先 await latest API 拿快照 revision，
  // 让 B 分支（dev 静态 import）退化到 A 分支（快照源），不依赖 workspace 目录。
  await ensureLatestSnapshot()
  // 🛡️ 2026-09-13 治本：workspace 源按语义化 componentId 定位，而跳转 URL 带的是 sessionId。
  // 快照源按 sessionId 命中（快照按 sessionId 存），workspace 源必须反查语义化名，否则「未找到组件」。
  // 🛡️ 2026-10-01：let —— 快照源失败退 workspace 时需按原始 id 重新反查语义名。
  let resolvedId = snapshotSource.value ? componentId : await resolveWorkspaceComponentId(componentId)
  if (snapshotSource.value) {
    try {
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
    } catch (e) {
      // 🛡️ 2026-10-01 治本（"生成结束跳预览报 未找到组件，刷新就好"）：
      //   快照源（尤其 candidate 中间态）缺入口/文件不齐时，旧逻辑直接把错误卡抛给用户。
      //   治本：自动退回 workspace 源（语义化 componentId 已发布）重试一次 ——
      //   与「用户手动刷新」等效，但无需用户操作。显式指定快照源（sessionId+revision）时不退。
      if (hasExplicitSource || forceWorkspaceSource) throw e
      console.warn('[预览] 快照源加载失败，自动退回 workspace 源重试:', e?.message || e)
      latestSnapshotSource.value = null
      resolvedId = await resolveWorkspaceComponentId(componentId)
    }
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
  // 🛡️ 2026-10-01：let —— 快照源失败退 workspace 时需按原始 id 重新反查语义名。
  let resolvedId = snapshotSource.value ? componentId : await resolveWorkspaceComponentId(componentId)
  if (snapshotSource.value) {
    try {
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
    } catch (e) {
      // 🛡️ 2026-10-01 治本：同 loadDev —— 快照源失败自动退 workspace 源重试（prod 同链路）。
      if (hasExplicitSource || forceWorkspaceSource) throw e
      console.warn('[预览] 快照源加载失败，自动退回 workspace 源重试:', e?.message || e)
      latestSnapshotSource.value = null
      resolvedId = await resolveWorkspaceComponentId(componentId)
    }
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

  const [{ loadModule }, Vue, echarts, { $mcComponentBuilder }, BasePanel, lessMod, antDesignVue] = await Promise.all([
    import('vue3-sfc-loader'),
    import('vue'),
    import('echarts'),
    import('@/utils/auto-import/common.js'),
    import('@/components/base-components/base-panel/index.vue'),
    import('less'),
    // 🛡️ 2026-10-08 治本：预览白名单补注 ant-design-vue——Lite 线生成规范明确教表单类组件
    // `import { Table as ATable } from 'ant-design-vue'`（lite.service.ts 生成规范），且
    // loadVue3Runtime（Vue3 运行时）moduleCache 已注入该模块；本预览页漏注入 →
    // 「找不到文件: ant-design-vue」→ 白名单报错（实锤 c-operation-logs-a7c6c270）。
    // ant-design-vue v4 为 CSS-in-JS：组件样式随模块运行时注入 document.head，无需额外引 CSS。
    import('ant-design-vue')
  ])
  // 🛡️ 2026-09-16：app 内置 less 编译器——微码子组件带 <style lang="less">，不预编译会触发
  // vue3-sfc-loader 的 getFile('less')（dev/prod 都无该资源 → 404 →「找不到文件: less」→ 组件加载失败）。
  const less = lessMod.default || lessMod

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
  // 🛡️ 2026-10-08：记录 index.css 是否真的取到——Lite 线历史产物没有 index.css
  // （P1.10 之后才有），此时不能剥 index.vue 的 <style>（precompileVueLess 已把它
  // 编译成纯 CSS），否则样式全丢（实锤 mc-lite-1791457057133-19acf57d 整页无样式）。
  let precompiledCssOk = false
  if (!isVue3) {
    try {
      const cssRes = await http.raw(`${base}/resources/styles/index.css`)
      if (cssRes.ok) {
        precompiledCssOk = true
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
    moduleCache: { vue: Vue, echarts, 'ant-design-vue': antDesignVue },
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
      // 🛡️ 2026-09-16 治本（mc-max-...-dcc8b98d「找不到文件: less」+ ...-3912b7b3「一片蓝色什么都没有」同源实锤）：
      // 微码**子组件**（package/components/*.vue）带 <style lang="less">（含 less 变量/嵌套/@import，
      // 全语料 988 个 style 块中 202 有变量 / 421 有嵌套）→ 原实现只剥 index.vue，子组件未处理 →
      // vue3-sfc-loader 调 getFile('less') 拉编译器 → dev/prod 都无该资源 → 404 → 组件加载整体失败。
      // 对齐 Vue3 路径：用 app 内置 less 预编译成纯 CSS（去掉 lang），保留全部私有样式。
      src = await precompileVueLess(src, less, `${base}/${rel}`)
      // 微码组件：剥掉入口 .vue 的 <style> 块（CSS 已预编译注入 index.css）
      // Vue3 组件：保留 <style scoped>，由 vue3-sfc-loader 编译
      // 🛡️ 仅当 index.css 确实取到才剥——Lite 历史产物无 index.css，保留 style
      // 块由 precompileVueLess 编译内联，避免「内容在但样式全丢」。
      if (!isVue3 && rel.endsWith('index.vue') && precompiledCssOk) {
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
//
// 🛡️ 2026-09-29 治本：原来只按 `e.message` 字符串分流，导致三类**性质完全不同**的失败
//   （① 前端加载器 chunk 取不到 ② 取源请求传输层失败 ③ 服务端 5xx）
//   连同真正的「产物缺失（HTTP 404）」一起被压成同一句「组件资源加载失败（网络错误 / 404）」，
//   用户看到的提示与真实修复动作完全脱节（实测：前端资源版本问题被误当成组件坏了）。
//   现改为**先按加载器标注的 `previewFailKind` 分流**（常量单一事实源见
//   `@/utils/loadVue3Runtime#PREVIEW_FAIL_KIND`），未标注的旧路径仍走下面的字符串兜底。
function classifyLoadError(e) {
  const msg = (e?.message || String(e)) + ''
  const kind = e?.previewFailKind || ''
  if (kind === PREVIEW_FAIL_KIND.LOADER_CHUNK) {
    return (
      '预览加载器依赖未就绪（前端资源已更新或被中断，与组件产物无关）。\n' +
      '请强制刷新页面（Ctrl/Cmd + Shift + R）后重试。\n\n原始错误：' +
      msg
    )
  }
  if (kind === PREVIEW_FAIL_KIND.SOURCE_NETWORK) {
    return (
      '取源请求失败（网络中断 / 服务重启窗口，已自动重试仍失败）。\n' +
      '请稍后重试或刷新；若持续出现请检查后端与网关是否可达。\n\n原始错误：' +
      msg
    )
  }
  if (kind === PREVIEW_FAIL_KIND.SOURCE_SERVER) {
    return (
      `取源服务异常（HTTP ${e?.status || '5xx'}，非组件产物问题）。\n` +
      '请检查后端 / 网关路由是否正常。\n\n原始错误：' +
      msg
    )
  }
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
  // 只有加载器**明确标注**了 previewFailKind 时才归为「预览环境问题」；
  // 其余（含既有的产物类错误）一律保持 'artifact'，不改既有语义。
  loadErrorScope.value = e?.previewFailKind ? 'environment' : 'artifact'
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
  window.open(getRouteUrl(`/demo/${componentId}?${query.toString()}`), '_blank')
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
    // 🛡️ 1.2 修法 A（2026-09-28）：独立预览无宿主容器注入 cssVars → 补根默认值。
    //   必须在组件加载**之后**（loadVue3Runtime 已把 $mcCssBuilder 等注册到 globalThis，
    //   组件自己声明的 css-vars.js 才能被求值）；失败静默跳过；已设置的键不覆盖。
    await loadMicrocodeCssVars()
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

  // 2026-09-15：主题切换下发：Playground 内容主题下拉 → iframe 内实时生效
  if (data.type === 'set-theme') {
    const theme = data.theme
    if (theme === 'light' || theme === 'dark') {
      // 🆕 R12：父页面显式下发 ⇒ 清掉本页手动选择，让 Playground 的控制权生效。
      //   否则用户在本页点过切换后，父页面下拉会「失效」（手动值恒压过 postMessage）。
      manualTheme.value = null
      playgroundTheme.value = theme
      console.log('🎨 [Preview] 父页面下发主题:', theme)
    } else if (isValidThemeKey(theme)) {
      // 🆕🆕 N 主题：父页面可下发自定义 key（如「黄昏模式」）
      manualTheme.value = null
      playgroundTheme.value = theme
      console.log('🎨 [Preview] 父页面下发主题:', theme)
    }
    return
  }

  // 响应式测试模式下发：父页面拖拽/切档位后把真实视口尺寸送进来。
  // 只改 stage 的尺寸锁，不重载组件、不改 iframe src（避免拖拽过程频繁重编译）。
  if (data.type === 'set-preview-viewport') {
    const w = Number(data.width)
    const h = Number(data.height)
    const mode: PreviewMode = data.mode === 'responsive' ? 'responsive' : 'fidelity'
    // 🛡️ 修复：fidelity 消息不带尺寸（TaskDetail 切回保真时下发，清残留状态）——
    // 此前 w>0 校验在 mode 判定之前，fidelity(w=0) 直接被拒 → 响应式状态永久残留
    if (mode === 'responsive' && (!(w > 0) || !(h > 0))) return
    const changed = mode !== previewMode.value || w !== responsiveWidth.value || h !== responsiveHeight.value
    previewMode.value = mode
    responsiveWidth.value = w
    responsiveHeight.value = h
    // 切回保真时清掉尺寸，让 stageStyle 重新走 figma 分支
    if (mode === 'fidelity') {
      responsiveWidth.value = 0
      responsiveHeight.value = 0
    }
    if (changed) {
      document.documentElement.setAttribute('data-preview-mode', mode)
      console.log('📐 [Preview] 视口下发:', mode, `${w}×${h}`)
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

  // 响应式测试模式初始化（新窗口打开场景）：
  // 父页面 iframe 无法用时（如独立窗口/预览链接），允许 URL 直接指定视口。
  // ?previewMode=responsive&w=375&h=667
  const urlMode = String(route.query.previewMode || '')
  const urlW = Number(route.query.w)
  const urlH = Number(route.query.h)
  if (urlMode === 'responsive' && urlW > 0 && urlH > 0) {
    previewMode.value = 'responsive'
    responsiveWidth.value = Math.round(urlW)
    responsiveHeight.value = Math.round(urlH)
    document.documentElement.setAttribute('data-preview-mode', 'responsive')
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

// 重试等待期间页面已卸载/替换 → 放弃重试（防止卸载后仍发请求）
let previewLoadDisposed = false

// 提取组件加载逻辑为独立函数，供 onMounted 和 watch 复用
async function loadPreviewComponent() {
  // 🛡️ 2026-10-03 治本（"生成完成跳预览报 未找到组件，刷新就好"）：
  //   第一起（83885ba4）是快照竞态（candidate 中间态缺入口）——已由 hasPreviewEntry 门禁 + workspace 降级修复；
  //   第二起（f7e57ac6）与第三起（65808cdd）根因相同：**并行会话重启后端与任务完成撞车**——
  //   跳转瞬间后端整个不可达，前端所有请求失败 → 报「未找到组件」（tried 是裸 sessionId，
  //   连 componentId 反查都没成功）。
  //   实测该重启模式空窗可达**分钟级**（杀进程后隔数分钟才拉起；20:13 那次失败重启后间隔 ~8min），
  //   首版固定退避表（3s+6s，预算 ~19s）在第三起被实测击穿。
  //   治本：**探活驱动的整体重试**——失败且疑似临时性时进入探活循环（每 3s 探一次），
  //   后端一恢复立即整体重跑（等效替用户刷新一次），总预算 120s。
  //   探活判据：/api/tasks 收到任意 status<500 的响应（401/404 也是 Nest 发的）= 后端已恢复；
  //   >=500（vite proxy/nginx 在 upstream 挂时返回）= 仍未恢复。
  //   真正的组件缺陷（语法错/资源缺失）不带临时性特征 → 立即报错误卡片，不受预算影响。
  let lastErr: unknown = null
  const deadline = Date.now() + LOAD_RETRY_BUDGET_MS
  let attempt = 0
  for (;;) {
    try {
      await runLoadPreviewOnce()
      return
    } catch (e) {
      lastErr = e
      attempt++
      if (!isTransientLoadError(e)) break
      if (Date.now() >= deadline || previewLoadDisposed) break
      console.warn(
        `[预览] 加载失败（疑似后端暂时不可达），等待后端恢复后整体重试（已试 ${attempt} 次）:`,
        (lastErr as any)?.message || lastErr,
      )
    }
    // 探活等待：后端一恢复立即重跑；预算耗尽/页面卸载 → 放弃
    const ready = await waitBackendReady(deadline)
    if (!ready || previewLoadDisposed) break
  }
  if (previewLoadDisposed) return
  handleLoadError(lastErr)
}

const LOAD_RETRY_BUDGET_MS = 120000
const LOAD_RETRY_PROBE_INTERVAL_MS = 3000

/** 探活：后端恢复（收到 status<500 响应，401/404 亦算）返回 true；预算耗尽或持续 5xx 返回 false。 */
async function waitBackendReady(deadline: number): Promise<boolean> {
  while (Date.now() < deadline) {
    if (previewLoadDisposed) return false
    try {
      const resp = await fetch('/api/tasks', { headers: { token: String(route.query.token || 'dev') } })
      if (resp.status < 500) return true
    } catch {
      /* 网络错误 → 未恢复，继续探 */
    }
    await new Promise((r) => setTimeout(r, LOAD_RETRY_PROBE_INTERVAL_MS))
  }
  return false
}

/** 疑似「后端暂时不可达 / 数据短暂未就绪」的临时性错误特征。组件自身缺陷不在此列。 */
function isTransientLoadError(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e ?? '')
  return (
    msg.includes('未找到组件') ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Network Error') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('socket hang up') ||
    /\b50[0-4]\b/.test(msg) // 500/502/503/504（vite proxy/nginx 在 upstream 不可达时的返回）
  )
}

async function runLoadPreviewOnce() {
  cleanupPreviewInjectedStyles()
  markLoading()
  // 🛡️ 加载期不受渲染超时影响：组件加载（sfc 编译 + 资源下载）本身可能 >10s，
  // 首次加载必须在开始前停止 ErrorBoundary 的超时计时器，否则大组件/慢网络会被误判「加载超时」。
  errorBoundaryRef.value?.markLoaded()
  await loadAspectRatio()
  if (!componentId) throw new Error('缺少组件 ID')
  rtComponent.value = import.meta.env.DEV ? await loadDev() : await loadProd()
  // 🛡️ 1.2 修法 A（2026-09-28）：独立预览无宿主容器注入 cssVars → 补根默认值。
  //   必须在组件加载**之后**（loadVue3Runtime 已把 $mcCssBuilder 等注册到 globalThis，
  //   组件自己声明的 css-vars.js 才能被求值）；失败静默跳过；已设置的键不覆盖。
  await loadMicrocodeCssVars()
  // 🛡️ P2（2026-09-03）：CSS 在 loadModule 编译期注入，早于组件 DOM 挂载，
  // 故在渲染完成后（nextTick）补做作用域化：剥离失效的 [data-v-*] + 加预览容器前缀。
  await nextTick()
  applyScopeToPreviewStyles(previewStyleScopeId)
  await markReadyAfterRender()
  // 组件加载成功，停止超时计时器
  errorBoundaryRef.value?.markLoaded()
}

onUnmounted(() => {
  previewLoadDisposed = true
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

/* 响应式测试模式：视口即真实设备宽度，禁止居中留白与等比缩放。
 * 内容按视口顶部对齐，超出部分由 shell 滚动 —— 溢出本身就是被测对象。 */
.mc-preview-stage-shell.is-responsive {
  justify-content: flex-start;
  align-items: flex-start;
  background: #ffffff;
}
.mc-preview-stage-shell.is-responsive .mc-preview-stage {
  overflow: visible;
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

/* ══════════════════════════════════════════════════════════════
   🆕 主题切换控件（R12 · 2026-10-10 双主题）
   位置：提示条上方一排（提示条 top:70px ⇒ 本控件 top:16px），居中对齐。
   交互：分段按钮可点，切换即时生效（resolvedThemeClass 派生样式 class）。
   ══════════════════════════════════════════════════════════════ */
.mc-theme-switcher {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 10px 5px 5px;
  border-radius: 999px;
  font-size: 13px;
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
}
.mc-theme-switcher.dark {
  background: rgba(30, 30, 40, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e5e7eb;
}
.mc-theme-switcher.light {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: #374151;
}

/* 分段控件本体 */
.mc-theme-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
}
.mc-theme-switcher.dark .mc-theme-seg {
  background: rgba(255, 255, 255, 0.08);
}
.mc-theme-switcher.light .mc-theme-seg {
  background: rgba(0, 0, 0, 0.04);
}
.mc-theme-seg-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 13px;
  border: 0;
  border-radius: 999px;
  font-size: 13px;
  font-family: inherit;
  background: transparent;
  cursor: pointer;
  transition: background 0.18s, color 0.18s;
}
.mc-theme-switcher.dark .mc-theme-seg-btn {
  color: #9ca3af;
}
.mc-theme-switcher.dark .mc-theme-seg-btn.active {
  background: rgba(255, 255, 255, 0.16);
  color: #f3f4f6;
}
.mc-theme-switcher.light .mc-theme-seg-btn {
  color: #6b7280;
}
.mc-theme-switcher.light .mc-theme-seg-btn.active {
  background: #ffffff;
  color: #111827;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
.mc-theme-seg-btn:hover {
  color: inherit;
}
.mc-theme-switcher.dark .mc-theme-seg-btn.active:hover {
  background: rgba(255, 255, 255, 0.22);
}
.mc-theme-switcher.light .mc-theme-seg-btn.active:hover {
  background: #ffffff;
}

/* 🔴 2026-10-12：系统占位主题（`dark`）的「内置预设」标记。
   目标：让用户一眼看出这个主题是内置色（mc-check M4-10 硬枚举）、
     **不含设计稿真值**，而非用户自己定义的主题。
   做法：右上角一个小圆点，零布局影响（absolute，不占位）。
   不改 active 态的底色/阴影 —— 避免与既有视觉回归冲突。 */
.mc-theme-seg-btn.builtin::after {
  content: '';
  position: absolute;
  top: 3px;
  right: 3px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.45;
}
.mc-theme-seg-btn.builtin { position: relative; }
.mc-theme-seg-btn.builtin:hover::after { opacity: 0.85; }

/* 双真值徽标（绿＝已验证达标态，与旁边评分同语义组） */
.mc-theme-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(34, 197, 94, 0.16);
  color: #4ade80;
  white-space: nowrap;
}
/* 单稿：明示另一侧为派生值，防止用户误以为两侧都是真值 */
.mc-theme-derived {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  white-space: nowrap;
}
.mc-theme-switcher.dark .mc-theme-derived {
  color: #9ca3af;
  border: 1px solid rgba(255, 255, 255, 0.14);
}
.mc-theme-switcher.light .mc-theme-derived {
  color: #6b7280;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.mc-theme-hint {
  position: fixed;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  pointer-events: none;
}
.mc-theme-hint.dark {
  background: rgba(30, 30, 40, 0.9);
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.mc-theme-hint.light {
  background: rgba(255, 255, 255, 0.95);
  color: #374151;
  border: 1px solid rgba(0, 0, 0, 0.08);
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
