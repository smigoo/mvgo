<template>
  <div class="unified-generate gen-v4">
    <div class="workbench">
      <main class="main-col">
        <h1 class="page-title">组件生成 · 新管线测试台<span class="ct-ver">v2</span></h1>
        <p class="page-sub">选择来源并填写信息，AI 将按所选规范生成组件。</p>
        <p class="page-sub-extra">/generator/components-test · 后端 /api/v2/pipeline（仅非生产环境可达）</p>

        <a-alert
          v-if="catalog.registryWarnings && catalog.registryWarnings.length"
          type="warning"
          show-icon
          class="ct-alert"
          message="规范注册表告警"
          :description="catalog.registryWarnings.join('；')"
        />
        <a-alert
          v-if="healthInfo && !healthInfo.generationReady"
          type="warning"
          show-icon
          class="ct-alert"
          message="引擎未就绪：缺少模型凭证"
          description="到「设置 - 模型配置」中设置文本模型与视觉模型并保存，本页才能真正发起生成。catalog / health / preview 三项元数据查询不受影响。"
        />

        <!-- ═══ 来源 Tab ═══ -->
        <div class="source-tabs" role="tablist" aria-label="输入来源">
          <button
            type="button"
            class="source-tab"
            :class="{ active: form.sourceType === 'screenshot' }"
            :aria-selected="form.sourceType === 'screenshot'"
            role="tab"
            @click="selectSource('screenshot')"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="8.5" cy="9" r="1.5" />
              <path d="m21 15-5-5L5 20" />
            </svg>
            上传截图
          </button>
          <button
            type="button"
            class="source-tab"
            :class="{ active: form.sourceType === 'figma' }"
            :aria-selected="form.sourceType === 'figma'"
            role="tab"
            @click="selectSource('figma')"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path d="M8 3h4v6H8a3 3 0 0 1 0-6Z" />
              <path d="M12 3h4a3 3 0 0 1 0 6h-4V3Z" />
              <path d="M8 9h4v6H8a3 3 0 0 1 0-6Z" />
              <circle cx="16" cy="12" r="3" />
              <path d="M8 15h4v3a3 3 0 1 1-3-3Z" />
            </svg>
            Figma 链接
          </button>
        </div>

        <!-- 隐藏文件输入 -->
        <input ref="imageFileInput" type="file" accept="image/*" hidden @change="onImageFile" />
        <input ref="specFileInput" type="file" accept=".json,application/json" hidden @change="handleSpecUpload" />

        <!-- ═══ 画布 ═══ -->
        <div class="canvas ct-canvas">
          <!-- 截图 -->
          <div class="field" v-show="form.sourceType === 'screenshot'">
            <div
              v-if="!form.imageBase64"
              class="drop-zone"
              :class="{ 'is-dragging': isDragging }"
              tabindex="0"
              @dragover.prevent="onDragOver"
              @dragleave.prevent="onDragLeave"
              @drop.prevent="onDrop"
              @click="triggerImagePick"
              @keydown.enter.prevent="triggerImagePick"
              @keydown.space.prevent="triggerImagePick"
            >
              <span class="upload-icon">
                <svg
                  viewBox="0 0 24 24"
                  width="32"
                  height="32"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  aria-hidden="true"
                >
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M5 14v5h14v-5" />
                </svg>
              </span>
              <strong>上传设计稿截图开始</strong>
              <span>支持 PNG / JPG / WebP，拖拽或点击选择</span>
            </div>
            <div v-else class="ct-shot">
              <img :src="form.imageBase64" alt="screenshot" class="ct-shot-img" />
              <div class="ct-shot-bar">
                <span class="ct-dim">已载入 ({{ imageSizeKb }} KB)</span>
                <button type="button" class="ct-text-action" @click="triggerImagePick">替换</button>
                <button type="button" class="ct-text-action danger" @click="clearImage">移除</button>
              </div>
            </div>
          </div>

          <!-- Figma -->
          <div class="field" v-show="form.sourceType === 'figma'">
            <input
              v-model="form.figmaUrl"
              type="text"
              class="figma-inline-input"
              placeholder="粘贴 figma.com 链接"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              @input="onConfigChange"
            />
            <p class="source-hint">支持文件链接或单个 Frame/组件节点链接</p>
          </div>
        </div>

        <!-- ═══ 底部操作行 ═══ -->
        <div class="action-row">
          <div class="spec-picker">
            <a-select
              v-model:value="form.spec"
              class="ct-spec-select"
              :bordered="false"
              placeholder="选择规范"
              @change="onConfigChange"
            >
              <a-select-opt-group v-for="g in specGroups" :key="g.label" :label="g.label">
                <a-select-option v-for="s in g.items" :key="s.id" :value="s.id">
                  {{ s.label }}（{{ s.id }} · v{{ s.version }}）
                </a-select-option>
              </a-select-opt-group>
            </a-select>
            <button type="button" class="spec-upload-btn" :disabled="uploadLoading" @click="triggerSpecUpload">
              {{ uploadLoading ? '上传中…' : '上传' }}
            </button>
          </div>
          <div class="seg-wrap">
            <TierToggle v-model="form.tier" @change="onTierChange" />
          </div>
          <RippleButton
            class="cta cta-theme-light"
            :disabled="!canGenerate || generateLoading"
            ripple-color="rgba(59,130,246,0.5)"
            :duration="650"
            @click="doGenerate"
          >
            {{ generateButtonText }}
          </RippleButton>
        </div>

        <!-- ═══ 高级选项（默认收起）═══ -->
        <div class="adv-options" :class="{ open: advOpen }">
          <button class="adv-toggle" type="button" @click="advOpen = !advOpen">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>高级选项</span>
            <span v-if="form.componentName" class="adv-chip">组件名</span>
            <span v-if="configurableNodes.length" class="adv-chip">{{ configurableNodes.length }} 节点覆盖</span>
            <svg class="adv-caret" :class="{ up: advOpen }" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <div v-show="advOpen" class="adv-body">
            <div class="adv-field">
              <div class="adv-label-row">
                <label>组件名</label>
                <span class="adv-opt-tag">选填 · 不填自动生成</span>
              </div>
              <div class="adv-id-row">
                <input v-model="form.componentName" class="adv-id-input" type="text" placeholder="如 c-lljc-test" />
              </div>
            </div>

            <div class="adv-field" v-if="configurableNodes.length">
              <div class="adv-label-row">
                <label>节点模型覆盖</label>
                <span class="adv-opt-tag">{{ configurableNodes.length }} 个可换模型的节点</span>
              </div>
              <div class="ct-hint">
                留空 = 走通道默认（设置 - 模型配置）。这里填的只覆盖本节点，用于「视觉用便宜模型、代码用强模型」这类实验。
              </div>
              <div v-for="n in configurableNodes" :key="n.nodeId" class="ct-noderow">
                <span class="ct-nodename">{{ n.nodeId }}</span>
                <a-tag :color="n.channel === 'vision' ? 'purple' : 'blue'">{{ n.channel }}</a-tag>
                <a-input
                  v-model:value="form.modelOverrides[n.nodeId]"
                  size="small"
                  class="ct-grow"
                  placeholder="留空 = 通道默认"
                />
              </div>
            </div>

            <div class="adv-field">
              <div class="adv-label-row">
                <label>原始数据</label>
                <span class="adv-opt-tag">排障用</span>
              </div>
              <a-collapse ghost>
                <a-collapse-panel key="catalog" header="catalog（规范 / 档位 / 可配节点）">
                  <pre class="ct-pre">{{ pretty(catalog) }}</pre>
                </a-collapse-panel>
                <a-collapse-panel key="health" header="health（引擎自检）">
                  <pre class="ct-pre">{{ pretty(healthInfo) }}</pre>
                </a-collapse-panel>
                <a-collapse-panel key="preview" header="preview（含节点模型表）">
                  <pre class="ct-pre">{{ pretty(previewResult) }}</pre>
                </a-collapse-panel>
              </a-collapse>
            </div>
          </div>
        </div>

        <!-- ═══ 执行计划预览（默认收起）═══ -->
        <div class="adv-options" :class="{ open: planOpen }">
          <button class="adv-toggle" type="button" @click="planOpen = !planOpen">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span>执行计划预览</span>
            <span v-if="previewResult" class="adv-chip">{{ (previewResult.steps || []).length }} 步</span>
            <span v-if="previewResult" class="adv-chip">
              LLM {{ previewResult.llmCallCount }}/{{ expectedLlmCalls || '-' }}
            </span>
            <svg class="adv-caret" :class="{ up: planOpen }" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <div v-show="planOpen" class="adv-body">
            <div class="ct-inline">
              <a-button type="primary" ghost :loading="previewLoading" @click="doPreview">预览配置</a-button>
              <a-button @click="resetForm">重置</a-button>
              <span class="ct-dim">预览不调 LLM，只装配</span>
            </div>

            <a-empty v-if="!previewResult" description="尚未预览 —— 点「预览配置」" />

            <template v-else>
              <a-descriptions size="small" bordered :column="2" class="ct-desc">
                <a-descriptions-item label="规范">
                  {{ previewResult.spec ? previewResult.spec.label : '-' }}
                  <span class="ct-dim">v{{ previewResult.spec ? previewResult.spec.version : '-' }}</span>
                </a-descriptions-item>
                <a-descriptions-item label="档位">
                  {{ previewResult.tier ? previewResult.tier.label : '-' }}
                </a-descriptions-item>
                <a-descriptions-item label="LLM 调用">
                  <a-tag :color="llmCountMatched ? 'green' : 'orange'">
                    {{ previewResult.llmCallCount }} / {{ expectedLlmCalls || '-' }}
                  </a-tag>
                </a-descriptions-item>
                <a-descriptions-item label="凭证">
                  <a-tag :color="previewResult.credentialsOk ? 'green' : 'red'">
                    {{ previewResult.credentialsOk ? '齐备' : '缺失' }}
                  </a-tag>
                </a-descriptions-item>
              </a-descriptions>

              <a-alert
                v-if="!previewResult.credentialsOk"
                type="error"
                show-icon
                class="ct-alert"
                message="凭证缺失，无法执行"
                :description="missingText"
              />

              <div class="ct-block-title">节点序列（{{ (previewResult.steps || []).length }} 步）</div>
              <div class="ct-steps">
                <span v-for="(s, i) in previewResult.steps || []" :key="i" class="ct-chip">
                  <em>{{ i + 1 }}</em>{{ s }}
                </span>
              </div>

              <div class="ct-block-title">节点明细</div>
              <a-table
                size="small"
                :columns="nodeColumns"
                :data-source="previewResult.nodes || []"
                row-key="nodeId"
                :pagination="false"
                :scroll="{ y: 240 }"
              />
            </template>
          </div>
        </div>

        <!-- ═══ 执行状态区 ═══ -->
        <div v-if="taskStatus || taskError || progressLogs.length || taskResult" class="ct-exec">
          <div class="ct-exec-head">
            <span class="ct-exec-title">执行状态</span>
            <a-tag v-if="taskStatus" :color="statusTag.color">{{ statusTag.text }}</a-tag>
            <code v-if="sessionId" class="ct-route ct-grow">{{ sessionId }}</code>
          </div>

          <a-alert
            v-if="taskError"
            type="error"
            show-icon
            class="ct-alert"
            message="执行失败"
            :description="taskError"
          />

          <div v-if="progressLogs.length" ref="logBox" class="ct-log">
            <div v-for="(l, i) in progressLogs" :key="i" class="ct-logline">
              <span class="ct-logt">{{ fmtTime(l.timestamp || l.ts || l.time) }}</span>
              <a-tag :color="logTagColor(l)" class="ct-logtag">{{ l.type || l.status || 'info' }}</a-tag>
              <span class="ct-logm">{{ l.stage ? '[' + l.stage + '] ' : '' }}{{ l.message || '' }}</span>
            </div>
          </div>

          <div v-if="taskResult" class="ct-result">
            <div class="ct-block-title">产出</div>
            <pre class="ct-pre">{{ pretty(taskResult) }}</pre>
          </div>
        </div>
      </main>

      <!-- ═══ 右栏：今日概览 + 最近生成 ═══ -->
      <aside class="right-panel">
        <div class="r-head">
          <div class="r-title">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3" y="3" width="7" height="9" rx="1" />
              <rect x="14" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="12" width="7" height="9" rx="1" />
              <rect x="3" y="16" width="7" height="5" rx="1" />
            </svg>
            今日概览
          </div>
          <router-link class="r-link" to="/tasks">查看全部</router-link>
        </div>

        <div class="ov-grid">
          <div class="ov-card">
            <div class="ov-num">{{ taskSummary?.total ?? 0 }}</div>
            <div class="ov-label">总任务</div>
          </div>
          <div class="ov-card done">
            <div class="ov-num">{{ taskSummary?.completed ?? 0 }}</div>
            <div class="ov-label">已完成</div>
          </div>
          <div class="ov-card prog">
            <div class="ov-num">{{ taskSummary?.running ?? 0 }}</div>
            <div class="ov-label">进行中</div>
          </div>
          <div class="ov-card fail">
            <div class="ov-num">{{ taskSummary?.failed ?? 0 }}</div>
            <div class="ov-label">失败</div>
          </div>
        </div>

        <div class="recent-head">
          <div class="recent-title">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M12 8v4l3 2" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            最近生成
          </div>
          <router-link class="r-link" to="/tasks">更多</router-link>
        </div>
        <div class="task-list">
          <div
            v-for="(t, i) in recent"
            :key="`${t.sessionId || t.name}-${i}`"
            class="task-item"
            :class="{ 'is-failed': t.status === 'failed' }"
            role="button"
            tabindex="0"
            @click="openTask(t)"
            @keydown.enter.prevent="openTask(t)"
            @keydown.space.prevent="openTask(t)"
          >
            <span class="state-dot" :class="historyDotClass(t.status)"></span>
            <div class="task-main">
              <div class="task-name" :title="t.name">{{ t.name }}</div>
              <div class="task-time">{{ historyTimeText(t) }}</div>
              <div class="task-meta" v-if="t.status !== 'running'">
                <span class="task-source" v-if="getRecentSource(t)">{{ sourceLabel(getRecentSource(t)) }}</span>
                <span class="task-duration" v-if="t.duration">{{ formatRecentDuration(t.duration) }}</span>
              </div>
            </div>
            <span class="task-tag" :class="historyTagClass(t)">{{ historyTagText(t) }}</span>
          </div>
        </div>
        <div v-if="!recent.length" class="empty-state">
          <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="4" y="8" width="32" height="24" rx="3" opacity=".5" />
            <path d="M12 18h16M12 24h10" stroke-linecap="round" opacity=".4" />
          </svg>
          <span class="es-text">暂无任务记录</span>
          <span class="es-hint">生成组件后将在此显示</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { createProgressStream } from '@/api/generator'
import { getAuthToken } from '@/utils/api-token'
import { readJson } from '@/utils/safe-json'
import http from '@/core/http'
import TierToggle from '@/components/common/TierToggle.vue'
import RippleButton from '@/components/inspira-ui/RippleButton.vue'

const router = useRouter()

// ========== 常量 ==========
const apiBase = '/api/v2/pipeline'

/**
 * 与全站 axios 拦截器同口径地注入门户 Token。
 *
 * 🔴 裸 fetch 必须显式带 Token：后端 `req.session` 只由守卫（SessionGuard /
 * OptionalSessionGuard）从 `headers['token']` 建立，本仓没有全局 session 中间件。
 * 不带 Token 时 `req.session?.userId` 恒为 undefined ⇒ 引擎读到空配置
 * ⇒ 页面误报「凭证缺失 / 模型未配置」，与用户实际已保存的模型配置无关。
 */
function authHeaders(extra = {}) {
  const headers = { ...extra }
  const token = getAuthToken()
  if (token) headers.Token = token
  return headers
}

// ========== 状态 ==========
const catalogLoading = ref(false)
const healthLoading = ref(false)
const catalog = ref({
  specs: [],
  tiers: [],
  sourceTypes: [],
  defaults: {},
  registryWarnings: [],
})
const healthInfo = ref(null)

const form = ref({
  spec: 'microcode',
  tier: 'lite',
  sourceType: 'screenshot',
  imageBase64: '',
  figmaUrl: '',
  componentName: '',
  modelOverrides: {},
})

const uploadLoading = ref(false)
const specFileInput = ref(null)
const imageFileInput = ref(null)
const isDragging = ref(false)

const previewResult = ref(null)
const previewLoading = ref(false)
const generateLoading = ref(false)

const sessionId = ref('')
const taskStatus = ref('') // running | completed | failed
const progressLogs = ref([])
const taskResult = ref(null)
const taskError = ref('')
const logBox = ref(null)

// 折叠区
const advOpen = ref(false)
const planOpen = ref(false)

// 右栏：今日概览 + 最近生成
const recent = ref([])
const taskSummary = ref(null)
const historyTick = ref(0)
const elapsed = ref('')

let eventSource = null
let recentTimer = null

// 生成耗时计时器（对齐参照页 components.vue:3190-3201）
let genStartAt = 0
let genTimer = null

function startGenTimer() {
  genStartAt = Date.now()
  genTimer = setInterval(() => {
    const s = Math.floor((Date.now() - genStartAt) / 1000)
    elapsed.value = `${Math.floor(s / 60)}分${s % 60}秒`
  }, 1000)
}
function stopGenTimer() {
  if (genTimer) clearInterval(genTimer)
  genTimer = null
}

// ========== 计算属性 ==========
const specGroups = computed(() => {
  const specs = catalog.value.specs || []
  return [
    { label: '内置规范', items: specs.filter(s => s.source !== 'user') },
    { label: '用户规范', items: specs.filter(s => s.source === 'user') },
  ].filter(g => g.items.length)
})

const currentTier = computed(() => (catalog.value.tiers || []).find(t => t.id === form.value.tier))
const configurableNodes = computed(() => (currentTier.value && currentTier.value.configurableNodes) || [])
const expectedLlmCalls = computed(() => (currentTier.value ? currentTier.value.expectedLlmCalls : null))

const llmCountMatched = computed(() => {
  if (!previewResult.value || expectedLlmCalls.value == null) return false
  return previewResult.value.llmCallCount === expectedLlmCalls.value
})

const statusTag = computed(() => {
  const map = {
    running: { color: 'blue', text: '执行中' },
    completed: { color: 'green', text: '已完成' },
    failed: { color: 'red', text: '已失败' },
  }
  return map[taskStatus.value] || { color: 'default', text: taskStatus.value }
})

const missingText = computed(() => {
  const miss = (previewResult.value && previewResult.value.missingCredentials) || []
  if (!miss.length) return ''
  return miss.map(m => `${m.channel}.${m.field} —— ${m.hint || ''}`).join('\n')
})

const imageSizeKb = computed(() => {
  if (!form.value.imageBase64) return 0
  const base64 = form.value.imageBase64.split(',')[1] || ''
  return Math.round((base64.length * 3) / 4 / 1024)
})

const canGenerate = computed(() => {
  if (generateLoading.value) return false
  if (form.value.sourceType === 'screenshot') return Boolean(form.value.imageBase64)
  return Boolean(form.value.figmaUrl)
})

const tierShort = computed(() => (form.value.tier === 'max' ? 'Max' : 'Lite'))
const specLabel = computed(() => {
  const s = (catalog.value.specs || []).find(x => x.id === form.value.spec)
  return s ? s.label : (form.value.spec || '')
})
const generateButtonText = computed(() =>
  generateLoading.value ? '生成中…' : `生成 ${tierShort.value} ${specLabel.value}`
)

const nodeColumns = [
  { title: '节点', dataIndex: 'nodeId', width: 168, ellipsis: true },
  { title: '模式', dataIndex: 'mode', width: 96 },
  { title: 'LLM', dataIndex: 'callsLlm', width: 64, customRender: ({ text }) => (text ? '是' : '否') },
  { title: '模型', dataIndex: 'model', width: 140, ellipsis: true },
  { title: '来源', dataIndex: 'modelSource', width: 80 },
  { title: 'Prompt 字数', dataIndex: 'promptChars', width: 100 },
]

// ========== v2 元数据 API ==========
async function fetchCatalog() {
  catalogLoading.value = true
  try {
    const res = await fetch(`${apiBase}/catalog`, { headers: authHeaders() })
    const data = await readJson(res)
    if (data.success) {
      catalog.value = data.data
      const defaults = data.data.defaults || {}
      if (defaults.spec) form.value.spec = defaults.spec
      if (defaults.tier) form.value.tier = defaults.tier
      syncOverrideKeys()
    } else {
      message.error(data.message || '加载配置目录失败')
    }
  } catch (e) {
    message.error('加载配置目录失败: ' + e.message)
  } finally {
    catalogLoading.value = false
  }
}

async function fetchHealth() {
  healthLoading.value = true
  try {
    const res = await fetch(`${apiBase}/health`, { headers: authHeaders() })
    const data = await readJson(res)
    if (data.success) healthInfo.value = data.data
  } catch (e) {
    message.error('健康检查失败: ' + e.message)
  } finally {
    healthLoading.value = false
  }
}

function buildRequestBody() {
  const body = {
    spec: form.value.spec,
    tier: form.value.tier,
    sourceType: form.value.sourceType,
  }
  if (form.value.componentName) body.componentName = form.value.componentName
  if (form.value.sourceType === 'screenshot') {
    body.imageBase64 = form.value.imageBase64
  } else {
    body.figmaUrl = form.value.figmaUrl
  }
  const overrides = {}
  for (const [k, v] of Object.entries(form.value.modelOverrides || {})) {
    if (v) overrides[k] = v
  }
  if (Object.keys(overrides).length) body.modelOverrides = overrides
  return body
}

async function doPreview() {
  previewLoading.value = true
  try {
    const res = await fetch(`${apiBase}/preview`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(buildRequestBody()),
    })
    const data = await readJson(res)
    // 成功：{ success, data: { preview } }；失败：引擎报错原样透出在 message
    if (res.ok && data.success && data.data && data.data.preview) {
      previewResult.value = data.data.preview
      planOpen.value = true
    } else {
      previewResult.value = null
      message.error((data && data.message) || '预览失败')
    }
  } catch (e) {
    message.error('预览请求失败: ' + e.message)
  } finally {
    previewLoading.value = false
  }
}

async function doGenerate() {
  if (!canGenerate.value) return
  generateLoading.value = true
  progressLogs.value = []
  taskResult.value = null
  taskError.value = ''
  taskStatus.value = 'running'
  elapsed.value = ''
  startGenTimer()

  try {
    const res = await fetch(`${apiBase}/generate`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(buildRequestBody()),
    })
    const data = await readJson(res)
    if (!res.ok || !data.success) {
      taskStatus.value = 'failed'
      taskError.value = (data && data.message) || '启动失败'
      stopGenTimer()
      message.error(taskError.value)
      return
    }
    sessionId.value = data.data.sessionId
    message.success('任务已启动，正在订阅进度')
    subscribeProgress(data.data.sessionId)
  } catch (e) {
    taskStatus.value = 'failed'
    taskError.value = '启动请求失败: ' + e.message
    stopGenTimer()
  } finally {
    generateLoading.value = false
  }
}

function subscribeProgress(sid) {
  if (eventSource) eventSource.close()
  eventSource = createProgressStream(sid)
  eventSource.onmessage = evt => {
    let data
    try {
      data = JSON.parse(evt.data)
    } catch (e) {
      return
    }
    progressLogs.value.push(data)
    // 终态以 type 判定（服务端契约）；进度事件用 status 区分阶段
    if (data.type === 'complete' || data.status === 'completed') {
      taskStatus.value = 'completed'
      taskResult.value = data.result || data
      eventSource.close()
      stopGenTimer()
      fetchRecent()
      fetchSummary()
    } else if (data.type === 'error' || data.status === 'failed' || data.status === 'error') {
      taskStatus.value = 'failed'
      taskError.value = data.message || '任务执行失败'
      eventSource.close()
      stopGenTimer()
      fetchRecent()
      fetchSummary()
    }
  }
  eventSource.onerror = () => {
    message.warning('进度推送连接断开')
    if (eventSource) eventSource.close()
  }
}

// ========== 规范上传（用户规范包 = 可插拔规范） ==========
function triggerSpecUpload() {
  if (specFileInput.value) specFileInput.value.click()
}

async function handleSpecUpload(evt) {
  const file = evt.target.files && evt.target.files[0]
  if (!file) return
  uploadLoading.value = true
  try {
    const text = await file.text()
    let specDef
    try {
      specDef = JSON.parse(text)
    } catch (e) {
      message.error('JSON 解析失败: ' + e.message)
      return
    }
    if (!specDef.id) {
      specDef.id = file.name.replace(/\.json$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-' + Date.now()
    }
    if (!specDef.label) specDef.label = specDef.id
    if (!specDef.version) specDef.version = '0.1.0'

    const res = await fetch(`${apiBase}/specs/upload`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(specDef),
    })
    const data = await readJson(res)
    if (res.ok && data.success) {
      message.success(data.message || '规范上传成功')
      await fetchCatalog()
      // 🔴 严格纯嵌套信封：业务字段在 data.data 下（控制器返回里的 message 会被提升为顶层信封 message）
      form.value.spec = data.data?.id || data.id || specDef.id
      onConfigChange()
    } else {
      message.error((data && data.message) || '上传失败')
    }
  } catch (e) {
    message.error('上传异常: ' + e.message)
  } finally {
    uploadLoading.value = false
    if (specFileInput.value) specFileInput.value.value = ''
  }
}

// ========== 交互 ==========
function selectSource(mode) {
  if (form.value.sourceType === mode) return
  form.value.sourceType = mode
  onConfigChange()
}

function loadImageFile(file) {
  if (!file) return
  const reader = new FileReader()
  reader.onload = e => {
    form.value.imageBase64 = e.target.result
    onConfigChange()
  }
  reader.readAsDataURL(file)
}

function onImageFile(evt) {
  const file = evt.target.files && evt.target.files[0]
  loadImageFile(file)
  evt.target.value = ''
}

function triggerImagePick() {
  if (imageFileInput.value) imageFileInput.value.click()
}

function onDragOver() {
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

function onDrop(evt) {
  isDragging.value = false
  const file = evt.dataTransfer && evt.dataTransfer.files && evt.dataTransfer.files[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    message.warning('请上传图片文件')
    return
  }
  loadImageFile(file)
}

function clearImage() {
  form.value.imageBase64 = ''
  onConfigChange()
}

function onConfigChange() {
  previewResult.value = null
}

function onTierChange() {
  syncOverrideKeys()
  previewResult.value = null
}

/** 档位切换后，按新的可配节点重建覆盖键（保留已填值） */
function syncOverrideKeys() {
  const next = {}
  for (const n of configurableNodes.value) {
    if (form.value.modelOverrides[n.nodeId]) next[n.nodeId] = form.value.modelOverrides[n.nodeId]
  }
  form.value.modelOverrides = next
}

function resetForm() {
  form.value.imageBase64 = ''
  form.value.figmaUrl = ''
  form.value.componentName = ''
  form.value.modelOverrides = {}
  previewResult.value = null
  progressLogs.value = []
  taskResult.value = null
  taskError.value = ''
  taskStatus.value = ''
  sessionId.value = ''
}

// ========== 右栏数据（今日概览 + 最近生成） ==========
async function fetchRecent() {
  try {
    const j = await http.get('/api/tasks/recent', { limit: 10 })
    const list = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : j.data?.tasks || []
    recent.value = list.slice(0, 10).map(t => ({
      name: t.displayName || t.componentName || t.sessionId || '未命名',
      status: t.status || 'unknown',
      sessionId: t.sessionId,
      startTime: t.startTime || t.endTime || null,
      duration: t.duration || (t.startTime && t.endTime ? t.endTime - t.startTime : 0),
      componentType: t.target || t.componentType || t.codeType || 'microcode',
      sourceType: t.sourceType || '',
      metadata: t.metadata || null,
    }))
  } catch {
    recent.value = []
  }
}

async function fetchSummary() {
  try {
    const j = await http.get('/api/tasks/summary')
    if (j && j.success && j.data?.summary) {
      taskSummary.value = j.data.summary
    }
  } catch {
    taskSummary.value = null
  }
}

function openTask(t) {
  if (!t || !t.sessionId) return
  router.push(`/tasks/${t.sessionId}`)
}

// ========== 展示辅助（逐字复用 components.vue） ==========
function historyDotClass(status) {
  if (status === 'running') return 'prog'
  if (status === 'failed') return 'fail'
  if (status === 'completed' || status === 'success') return 'done'
  return ''
}

function historyTagClass(task) {
  return task?.componentType === 'microcode' ? 'tag-mc' : 'tag-vue3'
}

function historyTagText(task) {
  return task?.componentType === 'microcode' ? 'MC' : 'V3'
}

function historyTimeText(task) {
  if (!task) return '—'
  void historyTick.value // 响应式依赖：驱动定时刷新
  if (task.status === 'queued') return '排队中'
  if (task.status === 'rate_limited') return '限流等待中'
  if (task.status === 'retry_scheduled') return '等待重试'
  if (task.status === 'running') return elapsed.value ? `进行中 · ${elapsed.value}` : '进行中'
  if (task.status === 'paused') return '已暂停'
  const ts = task.startTime
  if (!ts) return task.status || '—'
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  return `${day} 天前`
}

function getRecentSource(task) {
  const source = task?.metadata?.sourceType || task?.sourceType
  if (source === 'screenshot') return 'screenshot'
  if (source === 'figma') return 'figma'
  if (source === 'html') return 'html'
  const parts = (task?.sessionId || '').split('-')
  if (parts.length >= 2) {
    if (parts[1] === 'lite') return 'screenshot'
    if (parts[1] === 'max') return 'figma'
  }
  if ((task?.sessionId || '').startsWith('ml-')) return 'screenshot'
  return 'retry'
}

function sourceLabel(source) {
  const map = { screenshot: '截图', figma: 'Figma', html: 'HTML', retry: '重试' }
  return map[source]
}

function formatRecentDuration(ms) {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}min`
}

function logTagColor(l) {
  const key = l.type || l.status || ''
  if (key === 'complete' || key === 'completed' || key === 'success') return 'green'
  if (key === 'error' || key === 'failed') return 'red'
  if (key === 'progress' || key === 'running') return 'blue'
  return 'default'
}

function fmtTime(ts) {
  if (!ts) return '--:--:--'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '--:--:--'
  return d.toLocaleTimeString('zh-CN', { hour12: false })
}

function pretty(v) {
  if (v == null) return '（空）'
  try {
    return JSON.stringify(v, null, 2)
  } catch (e) {
    return String(v)
  }
}

// 进度日志自动滚到底
watch(
  () => progressLogs.value.length,
  () => {
    nextTick(() => {
      const el = logBox.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }
)

// ========== 生命周期 ==========
onMounted(() => {
  fetchCatalog()
  fetchHealth()
  fetchRecent()
  fetchSummary()
  // 每 15s 重新拉取右栏数据 + 刷新相对时间显示
  recentTimer = setInterval(() => {
    historyTick.value++
    fetchRecent()
    fetchSummary()
  }, 15000)
})

onUnmounted(() => {
  if (eventSource) eventSource.close()
  if (recentTimer) clearInterval(recentTimer)
  stopGenTimer()
})
</script>

<style scoped>
/* ══════════════════════════════════════════════════
   gen-v4 外壳样式 —— 复制自 src/views/generate/components.vue
   （scoped 下不会外泄；数值一律不改）
   ══════════════════════════════════════════════════ */

/* 变量挂在组件根元素上（scoped 下 :root 不会匹配） */
.unified-generate.gen-v4 {
  --c-primary: #2563eb;
  --c-primary-soft: #eff6ff;
  --c-cta: #059669;
  --c-cta-hover: #047857;
  --c-danger: #dc2626;
  --c-warn: #d97706;
  --bg: #f5f7fa;
  --surface: #ffffff;
  --surface-2: #f8fafc;
  --surface-3: #f1f5f9;
  --border: #e5e7eb;
  --border-soft: #f1f5f9;
  --txt-1: #0f172a;
  --txt-2: #475569;
  --txt-3: #94a3b8;
  --s1: 4px;
  --s2: 8px;
  --s3: 12px;
  --s4: 16px;
  --s5: 20px;
  --s6: 24px;
  --s7: 32px;
  --s8: 40px;
  --r-sm: 6px;
  --r-md: 8px;
  --r-lg: 12px;
  --r-xl: 16px;
  --r-pill: 9999px;
  --fs-xs: 12px;
  --fs-sm: 14px;
  --fs-base: 15px;
  --fs-lg: 16px;
  --fs-xl: 18px;
  --fs-2xl: 22px;
  --fs-3xl: 28px;
  --right-w: 340px;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui,
    sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --shadow-xs: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.08);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.08);
  --shadow-lg: 0 12px 32px rgba(15, 23, 42, 0.14);
  --focus: 0 0 0 3px rgba(37, 99, 235, 0.18);
  /* 工具型页面：默认禁止误选文本，仅输入框 / 错误提示等恢复可选 */
  -webkit-user-select: none;
  user-select: none;
}

/* 输入框、可编辑区：保持可选（粘贴 / 复制文本） */
.unified-generate.gen-v4 input,
.unified-generate.gen-v4 textarea,
.unified-generate.gen-v4 [contenteditable] {
  -webkit-user-select: text;
  user-select: text;
}

/* 技术栈 / 规格切换：浅灰页面下增强对比与层次（仅亮色模式，暗色沿用 token 默认） */
html:not([data-theme='dark']) .unified-generate.gen-v4 {
  --tier-toggle-track: #ffffff;
}
html:not([data-theme='dark']) .unified-generate.gen-v4 :deep(.tier-toggle) {
  border-color: var(--c-gray-300, #cbd5e1);
  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.1),
    0 1px 2px rgba(15, 23, 42, 0.06);
}
html:not([data-theme='dark']) .unified-generate.gen-v4 :deep(.tier-toggle__opt) {
  font-weight: 700;
}

/* ══ 禁用选项 — 明显视觉区分（亮/暗通用） ══ */
.unified-generate.gen-v4 :deep(.tier-toggle__opt[disabled]) {
  opacity: 0.38 !important;
  color: var(--txt-3, #9ca3af) !important;
  cursor: not-allowed !important;
  text-decoration: line-through;
  text-decoration-color: var(--c-gray-400, #94a3b8);
}
.unified-generate.gen-v4 :deep(.tier-toggle__opt[disabled]:hover) {
  background: transparent !important;
  color: var(--txt-3, #9ca3af) !important;
  transform: none !important;
}

html[data-theme='dark'] .unified-generate.gen-v4 {
  --c-primary: #58a6ff;
  --c-primary-soft: rgba(56, 139, 253, 0.14);
  --c-cta: #3fb950;
  --c-cta-hover: #56d364;
  --c-danger: #f85149;
  --c-warn: #d29922;
  --bg: #0d1117;
  --surface: #161b22;
  --surface-2: #1c2128;
  --surface-3: #21262d;
  --border: #30363d;
  --border-soft: #21262d;
  --txt-1: #e6edf3;
  --txt-2: #8b949e;
  --txt-3: #6e7681;
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.5);
  --shadow-sm: 0 2px 5px rgba(0, 0, 0, 0.55);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.6);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.65);
  --focus: 0 0 0 3px rgba(56, 139, 253, 0.35);
}
.unified-generate.gen-v4 * {
  box-sizing: border-box;
}
.unified-generate.gen-v4 [hidden] {
  display: none !important;
}
.unified-generate.gen-v4 {
  height: calc(100vh - 40px - 64px);
  display: flex;
  flex-direction: column;
  color: var(--txt-1);
  font-family: var(--font);
  font-size: var(--fs-base);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ══ workbench ══ */
.workbench {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.main-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: var(--s7) var(--s8);
  overflow-y: auto;
}
.page-title {
  font-size: var(--fs-3xl);
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 var(--s2);
}
.page-sub {
  font-size: var(--fs-base);
  color: var(--txt-2);
  margin: 0 0 var(--s6);
  line-height: 1.6;
}

/* ══ source tabs（flex 等分 100%） ══ */
.source-tabs {
  display: flex;
  gap: var(--s1, 4px);
  padding: var(--s1, 4px);
  border-radius: var(--r-pill, 9999px);
  margin-bottom: var(--s5);
  background: var(--surface-2, var(--surface-3));
}
.source-tab {
  flex: 1;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s2);
  background: transparent;
  color: var(--txt-2);
  font-size: var(--fs-sm, 13px);
  font-weight: 500;
  border-radius: var(--r-pill, 9999px);
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  border: none;
  position: relative;
  white-space: nowrap;
}
.source-tab:hover {
  background: var(--surface);
  color: var(--txt-1);
}
.source-tab.active {
  background: var(--c-primary-soft, rgba(37, 99, 235, 0.1));
  color: var(--c-primary);
  font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.18);
}
.source-tab:active {
  transform: scale(0.97);
}
.source-tab:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.source-tab:disabled:hover {
  background: transparent;
  color: var(--txt-2);
}
.source-tab svg {
  width: 15px;
  height: 15px;
  opacity: 0.85;
  flex-shrink: 0;
}
.source-tab.active svg {
  opacity: 1;
}

/* ══ 单一画布 ══ */
.canvas {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-bottom: var(--s6);
}
.field {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 拖拽画布 */
.drop-zone {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s4);
  border: 2px dashed var(--border);
  border-radius: var(--r-xl, 16px);
  background: radial-gradient(circle at 50% 0%, var(--surface-2), var(--surface) 70%);
  color: var(--txt-2);
  text-align: center;
  padding: var(--s7);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}
.drop-zone::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 120%, var(--c-primary-soft), transparent 60%);
  opacity: 0;
  transition: opacity 0.25s;
  pointer-events: none;
}
.drop-zone:hover,
.drop-zone:focus-visible,
.drop-zone.is-dragging {
  border-color: var(--c-primary);
  background: radial-gradient(circle at 50% 0%, var(--c-primary-soft), var(--surface) 70%);
  color: var(--c-primary);
  outline: none;
  box-shadow: var(--focus);
  transform: translateY(-2px);
}
.drop-zone:hover::after,
.drop-zone.is-dragging::after {
  opacity: 1;
}
.drop-zone .upload-icon {
  color: var(--c-primary);
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border-radius: var(--r-pill);
  background: var(--c-primary-soft);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.16);
  transition: transform 0.2s;
}
.drop-zone:hover .upload-icon,
.drop-zone.is-dragging .upload-icon {
  transform: translateY(-4px) scale(1.05);
}
.drop-zone strong {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--txt-1);
  letter-spacing: -0.01em;
}
.drop-zone span {
  font-size: var(--fs-sm);
  max-width: 320px;
  line-height: 1.6;
}
.drop-zone small {
  font-size: var(--fs-xs);
  color: var(--txt-3);
  background: var(--surface-2);
  padding: 4px 10px;
  border-radius: var(--r-pill);
}

.source-hint {
  font-size: var(--fs-xs);
  color: var(--txt-3);
  margin: var(--s2) 0 0;
  line-height: 1.5;
}

/* ══ Figma 内联（保留原逻辑样式） ══ */
.figma-inline-bar {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  height: 100%;
}
.figma-inline-input-row {
  display: flex;
  gap: var(--s2);
  align-items: center;
  position: relative;
}
.figma-inline-input {
  flex: 1;
  height: 54px;
  padding: 0 var(--s5);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--txt-1);
  font-size: var(--fs-base);
  font-family: var(--mono);
  transition: 0.12s;
}
.figma-inline-input:focus {
  outline: none;
  border-color: var(--c-primary);
  box-shadow: var(--focus);
}
.figma-inline-input::placeholder {
  color: var(--txt-3);
  font-family: var(--font);
}

/* ══ 底部操作行 ══ */
.action-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  margin-bottom: 4px;
}
.tech-chips {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.seg-wrap {
  display: flex;
  flex-shrink: 0;
}
.seg-wrap :deep(.tier-toggle) {
  width: 140px;
  height: 48px;
}
.seg-wrap :deep(.tier-toggle__opt) {
  font-size: 16px;
  font-weight: 500;
  padding: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ══ 高级选项折叠条 ══ */
.adv-options {
  margin-bottom: var(--s3);
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  overflow: hidden;
  transition: border-color 0.15s ease;
}
.adv-options.open {
  border-color: #d1d5db;
}
.adv-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  transition: color 0.15s ease;
}
.adv-toggle:hover:not(:disabled) {
  color: #374151;
}
.adv-toggle:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.adv-caret {
  margin-left: auto;
  transition: transform 0.18s ease;
}
.adv-caret.up {
  transform: rotate(180deg);
}
.adv-chip {
  padding: 1px 8px;
  border-radius: 9999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.5;
}
.adv-body {
  padding: 4px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.adv-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.adv-label-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.adv-label-row label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}
.adv-opt-tag {
  font-size: 10px;
  color: #9ca3af;
}
.adv-id-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.adv-id-input {
  flex: 1;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #e5e7eb;
  border-radius: 9999px;
  background: #fff;
  font-size: 12px;
  color: #1f2937;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.adv-id-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}
.adv-id-input::placeholder {
  color: #c0c6d0;
}

/* ══ CTA 按钮（:deep 穿透到 RippleButton 子组件） ══ */
:deep(.cta) {
  flex: 1 1 auto;
  min-width: 220px;
  height: 48px;
  border-radius: var(--radius-full, 9999px);
  background: linear-gradient(135deg, #0d9488 0%, #5eead4 100%);
  color: #fff;
  font-size: 16px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s2);
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  letter-spacing: 0.01em;
  border: none;
  box-shadow:
    0 2px 8px rgba(13, 148, 136, 0.18),
    0 1px 2px rgba(13, 148, 136, 0.12);
}
:deep(.cta:hover) {
  transform: translateY(-1px);
  box-shadow:
    0 4px 14px rgba(13, 148, 136, 0.24),
    0 2px 4px rgba(13, 148, 136, 0.16);
}
:deep(.cta:active) {
  transform: translateY(0);
}
:deep(.cta:disabled) {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* ══ right panel ══ */
.right-panel {
  width: var(--right-w);
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%);
  border-left: 1px solid var(--border-soft);
  overflow: hidden;
  padding: var(--s6) var(--s5);
}
.r-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--s4);
}
.r-title {
  font-size: var(--fs-sm);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--s2);
  color: var(--txt-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.r-title svg {
  width: 15px;
  height: 15px;
  color: var(--c-primary);
  opacity: 0.7;
}
.r-link {
  font-size: var(--fs-xs);
  color: var(--c-primary);
  text-decoration: none;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: var(--r-pill);
  transition: 0.12s;
}
.r-link:hover {
  background: var(--c-primary-soft);
  text-decoration: none;
}

/* ── 概览统计卡片 ── */
.ov-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s3);
  margin-bottom: var(--s5);
}
.ov-card {
  border: none;
  border-radius: var(--r-lg);
  padding: var(--s4) var(--s4) var(--s3);
  background: var(--surface);
  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.06),
    0 1px 2px rgba(15, 23, 42, 0.04);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}
.ov-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 2px 0 0 2px;
  opacity: 0.7;
}
.ov-num {
  font-size: 28px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-feature-settings: 'tnum';
}
.ov-label {
  font-size: var(--fs-xs);
  color: var(--txt-3);
  margin-top: var(--s1);
  font-weight: 500;
}
/* 默认态 — 蓝灰 */
.ov-card {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
}
.ov-card::before {
  background: linear-gradient(180deg, #94a3b8, #cbd5e1);
}
.ov-card .ov-num {
  color: #475569;
}
/* 已完成 — 绿 */
.ov-card.done {
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
}
.ov-card.done::before {
  background: linear-gradient(180deg, #059669, #34d399);
}
.ov-card.done .ov-num {
  color: #047857;
}
/* 进行中 — 蓝 */
.ov-card.prog {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
}
.ov-card.prog::before {
  background: linear-gradient(180deg, #2563eb, #60a5fa);
}
.ov-card.prog .ov-num {
  color: #1d4ed8;
}
/* 失败 — 红 */
.ov-card.fail {
  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
}
.ov-card.fail::before {
  background: linear-gradient(180deg, #dc2626, #f87171);
}
.ov-card.fail .ov-num {
  color: #b91c1c;
}

/* ── 最近生成 ── */
.recent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--s3);
}
.recent-title {
  font-size: var(--fs-sm);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--s2);
  color: var(--txt-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.recent-title svg {
  width: 15px;
  height: 15px;
  color: var(--c-primary);
  opacity: 0.7;
}
.task-list {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.task-list::-webkit-scrollbar {
  width: 6px;
}
.task-list::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: var(--radius-xs);
}
.task-list:hover::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
}
.task-item {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  border: none;
  border-radius: var(--r-md);
  background: var(--surface);
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.task-item:hover {
  transform: translateX(3px);
  box-shadow:
    0 4px 12px rgba(15, 23, 42, 0.08),
    0 1px 3px rgba(15, 23, 42, 0.06);
  background: var(--surface);
}
.state-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--r-pill);
  flex: none;
  background: var(--txt-3);
  transition: 0.12s;
}
.state-dot.done {
  background: var(--c-cta);
  box-shadow: 0 0 6px rgba(5, 150, 105, 0.35);
}
.state-dot.prog {
  background: var(--c-primary);
  box-shadow: 0 0 6px rgba(37, 99, 235, 0.35);
  animation: pulse-dot 2s ease-in-out infinite;
}
.state-dot.fail {
  background: var(--c-danger);
  box-shadow: 0 0 6px rgba(220, 38, 38, 0.35);
}
@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.25);
  }
}
.task-main {
  flex: 1;
  min-width: 0;
}
.task-name {
  font-size: var(--fs-sm);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-time {
  font-size: var(--fs-xs);
  color: var(--txt-3);
  margin-top: 2px;
}
.task-meta {
  font-size: var(--fs-xs);
  color: var(--txt-2);
  margin-top: 2px;
  display: flex;
  gap: 6px;
  align-items: center;
}
.task-source {
  color: var(--txt-3);
  opacity: 0.75;
}
.task-duration {
  color: var(--txt-3);
  opacity: 0.75;
}
.task-tag {
  font-size: var(--fs-xs);
  font-weight: 500;
  flex: none;
  padding: 2px 8px;
  border-radius: var(--r-pill);
  background: var(--surface-3);
  color: var(--txt-2);
}
.task-tag.done {
  background: #ecfdf5;
  color: var(--c-cta);
}
.task-tag.prog {
  background: var(--c-primary-soft);
  color: var(--c-primary);
}
.task-tag.fail {
  background: #fef2f2;
  color: var(--c-danger);
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s2);
  padding: var(--s6) var(--s4);
  color: var(--txt-3);
  text-align: center;
}
.empty-state svg {
  width: 40px;
  height: 40px;
}
.es-text {
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--txt-2);
}
.es-hint {
  font-size: var(--fs-xs);
}

/* ══ right panel — 暗色覆盖 ══ */
html[data-theme='dark'] .unified-generate.gen-v4 .right-panel {
  background: linear-gradient(180deg, #161b22 0%, #1c2128 100%);
  border-left-color: #30363d;
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card {
  background: linear-gradient(135deg, #1c2128 0%, #21262d 100%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card::before {
  background: linear-gradient(180deg, #388bfd, #58a6ff);
  opacity: 0.45;
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card .ov-num {
  color: #e6edf3;
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card.done {
  background: linear-gradient(135deg, rgba(63, 185, 80, 0.13) 0%, rgba(35, 134, 54, 0.06) 100%);
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card.done .ov-num {
  color: #56d364;
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card.prog {
  background: linear-gradient(135deg, rgba(56, 139, 253, 0.14) 0%, rgba(38, 103, 179, 0.07) 100%);
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card.prog .ov-num {
  color: #58a6ff;
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card.fail {
  background: linear-gradient(135deg, rgba(248, 81, 73, 0.14) 0%, rgba(218, 57, 53, 0.07) 100%);
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card.fail .ov-num {
  color: #f85149;
}
html[data-theme='dark'] .unified-generate.gen-v4 .task-item {
  background: #161b22;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
html[data-theme='dark'] .unified-generate.gen-v4 .task-item:hover {
  background: #1c2128;
}

/* ══ source tabs — 暗色 ══ */
html[data-theme='dark'] .unified-generate.gen-v4 .source-tabs {
  background: #21262d;
}
html[data-theme='dark'] .unified-generate.gen-v4 .source-tab:hover {
  background: #30363d;
}
html[data-theme='dark'] .unified-generate.gen-v4 .source-tab.active {
  box-shadow: inset 0 0 0 1px rgba(56, 139, 253, 0.28);
}

/* ══════════════════════════════════════════════════
   本页自有补充样式（.ct- 前缀，避免与外壳样式撞车）
   ══════════════════════════════════════════════════ */

/* 版本徽章 */
.ct-ver {
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: var(--c-primary);
  border-radius: var(--r-pill);
  vertical-align: middle;
}

/* 路由 / 环境说明 */
.page-sub-extra {
  font-size: 12px;
  color: var(--txt-3);
  margin: -16px 0 var(--s6);
  line-height: 1.5;
}

/* 规范选择 pill 容器（含 select + 上传按钮） */
.spec-picker {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  height: 48px;
  padding: 0 4px 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  background: var(--surface);
}
.spec-picker :deep(.ant-select) {
  flex: 1;
  min-width: 0;
}
.spec-picker :deep(.ant-select-selector) {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  border-radius: var(--r-pill) !important;
  padding-left: 6px !important;
}
.spec-upload-btn {
  flex: none;
  height: 38px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  background: var(--surface-2);
  color: var(--txt-2);
  font-size: var(--fs-sm);
  font-weight: 500;
  cursor: pointer;
  transition: 0.15s;
}
.spec-upload-btn:hover:not(:disabled) {
  border-color: var(--c-primary);
  color: var(--c-primary);
  background: var(--c-primary-soft);
}
.spec-upload-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 画布最小高度兜底（避免折叠区内容把 drop-zone 压扁） */
.canvas.ct-canvas {
  min-height: 240px;
}

/* 截图已选态 */
.ct-shot {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  align-items: flex-start;
}
.ct-shot-img {
  max-width: 100%;
  max-height: 180px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.ct-shot-bar {
  display: flex;
  align-items: center;
  gap: var(--s3);
}
.ct-text-action {
  border: none;
  background: transparent;
  padding: 0;
  font-size: var(--fs-sm);
  color: var(--c-primary);
  cursor: pointer;
}
.ct-text-action.danger {
  color: var(--c-danger);
}
.ct-text-action:hover {
  text-decoration: underline;
}

/* 执行状态区容器 */
.ct-exec {
  margin-top: var(--s3);
}
.ct-exec-head {
  display: flex;
  align-items: center;
  gap: var(--s2);
  margin-bottom: var(--s3);
}
.ct-exec-title {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--txt-1);
}

/* 通用展示类：保留（仍在用） */
.ct-alert {
  margin-bottom: 12px;
}
.ct-dim {
  font-size: 12px;
  color: var(--txt-3);
}
.ct-grow {
  flex: 1;
  min-width: 0;
}
.ct-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ct-hint {
  margin: 4px 0 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--txt-3);
}
.ct-route {
  padding: 1px 6px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--txt-2);
  background: var(--bg-alt, var(--surface-2));
  border-radius: 4px;
}
.ct-noderow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}
.ct-nodename {
  width: 130px;
  flex-shrink: 0;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--txt-2);
}
.ct-desc {
  margin-bottom: 12px;
}
.ct-block-title {
  margin: 14px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--txt-2);
}
.ct-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ct-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--txt-2);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
}
.ct-chip em {
  font-style: normal;
  font-weight: 600;
  color: var(--txt-3);
}
.ct-log {
  max-height: 260px;
  margin-top: 8px;
  padding: 8px 10px;
  overflow-y: auto;
  font-size: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.ct-logline {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 1px 0;
}
.ct-logt {
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--txt-3);
}
.ct-logtag {
  flex-shrink: 0;
  transform: scale(0.9);
  transform-origin: left center;
}
.ct-logm {
  color: var(--txt-2);
  word-break: break-all;
}
.ct-result {
  margin-top: 12px;
}
.ct-pre {
  max-height: 340px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
  color: var(--txt-2);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
}

/* ══ 响应式 ══ */
@media (max-width: 1024px) {
  .workbench {
    flex-direction: column;
    overflow: auto;
  }
  .main-col {
    order: 1;
    padding: var(--s5) var(--s4);
  }
  .right-panel {
    order: 2;
    width: auto;
    border-left: none;
    border-top: 1px solid var(--border);
  }
}
@media (max-width: 640px) {
  .action-row {
    flex-direction: column;
    align-items: stretch;
  }
  .tech-chips,
  .seg-wrap,
  .spec-picker {
    width: 100%;
  }
  :deep(.cta) {
    width: 100%;
  }
  .page-title {
    font-size: var(--fs-2xl);
  }
  .main-col {
    padding: var(--s5) var(--s4);
  }
}
</style>
