<template>
  <div class="doc-compare-panel">
    <!-- 头部：文档输入与操作 -->
    <div class="panel-header">
      <div class="header-left">
        <span class="header-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>
        <span class="header-title">文档纠偏（路径B）</span>
        <span class="header-badge">UI 缓存复用 · 只重跑代码生成</span>
      </div>
      <div class="header-actions">
        <button class="btn primary" :disabled="!canRun || running" @click="startRegen">
          <span v-if="running" class="mini-spinner"></span>
          {{ running ? '纠偏生成中…' : '开始纠偏生成' }}
        </button>
      </div>
    </div>

    <!-- 文档输入区 -->
    <div v-if="!running && !newSessionId" class="doc-input-area">
      <textarea
        v-model="requirementDoc"
        class="doc-textarea"
        rows="6"
        placeholder="粘贴该组件对应的需求文档（含微码组件设计章节最佳）…"
      ></textarea>
      <div class="doc-meta-row">
        <span class="doc-meta">{{ requirementDoc.length }} 字符{{ canRun ? '' : '（至少 20 字符）' }}</span>
        <button class="btn" :disabled="requirementDoc.trim().length < 20 || analyzing" @click="preAnalyze">
          {{ analyzing ? '分析中…' : '预分析文档' }}
        </button>
      </div>

      <!-- 预分析结果 -->
      <div v-if="analysis" class="analysis-summary">
        <span v-if="analysis.extractionMeta?.fullConfigDetected" class="badge success">微码四配置 ✓</span>
        <span class="badge">事件 {{ analysis.events?.length || 0 }}</span>
        <span class="badge">接口 {{ analysis.dataBinding?.apis?.length || 0 }}</span>
        <span class="badge">配置 {{ analysis.businessConfig?.length || 0 }}</span>
        <span class="badge">元素 {{ analysis.uiElements?.length || 0 }}</span>
        <span v-if="analysis.moduleInfo?.moduleName" class="module-name">{{ analysis.moduleInfo.moduleName }}</span>
      </div>
    </div>

    <!-- 进行中：进度 -->
    <div v-if="running" class="running-area">
      <div class="running-title">正在纠偏生成（UI 缓存命中，跳过 Figma/Vision）…</div>
      <div class="running-log" ref="logRef">
        <div v-for="(p, i) in progressList" :key="i" class="log-line" :class="p.status">
          <span class="log-stage">[{{ p.stage }}]</span> {{ p.message }}
        </div>
      </div>
    </div>

    <!-- 完成：新旧并排对比 -->
    <div v-if="newSessionId" class="compare-area">
      <div class="compare-header">
        <span class="compare-title">新旧版本对比</span>
        <div class="compare-actions">
          <button class="btn success" @click="confirmOverwrite">确认覆盖旧版</button>
          <button class="btn danger" @click="discardNew">丢弃新版</button>
        </div>
      </div>
      <div class="compare-grid">
        <div class="compare-col">
          <div class="col-title old">旧版（当前）</div>
          <div class="col-body">
            <div class="config-block">
              <div class="block-title">declare.json 四配置</div>
              <div class="kv-line">事件: {{ oldSummary.events }} 个</div>
              <div class="kv-line">状态: {{ oldSummary.statuses }} 个</div>
              <div class="kv-line">配置: {{ oldSummary.configs }} 个</div>
              <div class="kv-line">CSS变量: {{ oldSummary.cssVars }} 个</div>
            </div>
          </div>
        </div>
        <div class="compare-col">
          <div class="col-title new">新版（文档纠偏）</div>
          <div class="col-body">
            <div class="config-block">
              <div class="block-title">declare.json 四配置</div>
              <div class="kv-line" :class="{ improved: newSummary.events > oldSummary.events }">事件: {{ newSummary.events }} 个 <span v-if="newSummary.events > oldSummary.events" class="delta">+{{ newSummary.events - oldSummary.events }}</span></div>
              <div class="kv-line" :class="{ improved: newSummary.statuses > oldSummary.statuses }">状态: {{ newSummary.statuses }} 个 <span v-if="newSummary.statuses > oldSummary.statuses" class="delta">+{{ newSummary.statuses - oldSummary.statuses }}</span></div>
              <div class="kv-line" :class="{ improved: newSummary.configs > oldSummary.configs }">配置: {{ newSummary.configs }} 个 <span v-if="newSummary.configs > oldSummary.configs" class="delta">+{{ newSummary.configs - oldSummary.configs }}</span></div>
              <div class="kv-line" :class="{ improved: newSummary.cssVars > oldSummary.cssVars }">CSS变量: {{ newSummary.cssVars }} 个 <span v-if="newSummary.cssVars > oldSummary.cssVars" class="delta">+{{ newSummary.cssVars - oldSummary.cssVars }}</span></div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="conflictNotes.length" class="conflict-notes">
        <div class="conflict-title">配置冲突提示（人工裁决）</div>
        <div v-for="(n, i) in conflictNotes" :key="i" class="conflict-line">{{ n }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useConfigStore } from '@/stores/config'
import http from '@/core/http'
import { createProgressStream } from '@/api/generator'

const props = defineProps<{
  componentId: string
  groupId: string
  oldDeclare?: any
}>()

const emit = defineEmits<{
  overwritten: [payload: any]
  discarded: []
}>()

const configStore = useConfigStore()

const requirementDoc = ref('')
const analyzing = ref(false)
const analysis = ref<any>(null)
const running = ref(false)
const newSessionId = ref('')
const progressList = ref<any[]>([])
const logRef = ref<HTMLElement | null>(null)
const newSummary = ref({ events: 0, statuses: 0, configs: 0, cssVars: 0 })
const conflictNotes = ref<string[]>([])

const canRun = computed(() => requirementDoc.value.trim().length >= 20 && !running.value)

const oldSummary = computed(() => {
  const d = props.oldDeclare || {}
  return {
    events: Object.keys(d.businessEvents || {}).length,
    statuses: Object.keys(d.businessStatuses || {}).length,
    configs: (d.businessConfig || []).length,
    cssVars: (d.cssVariableConfig || []).length,
  }
})

function aiConfigBody() {
  const raw = configStore.config as any
  const c = raw?.value !== undefined ? raw.value : raw
  return {
    figmaToken: c?.figmaToken,
    visionApiKey: c?.visionApiKey,
    visionBaseURL: c?.visionBaseURL,
    visionModel: c?.visionModel,
    textApiKey: c?.textApiKey,
    textBaseURL: c?.textBaseURL,
    textModel: c?.textModel,
  }
}

async function preAnalyze() {
  analyzing.value = true
  try {
    const c = aiConfigBody()
    const data = await http.post('/api/phase2/analyze-doc', {
      document: requirementDoc.value,
      source: 'paste',
      aiConfig: c.textApiKey ? { textApiKey: c.textApiKey, textBaseURL: c.textBaseURL, textModel: c.textModel } : undefined,
    })
    if (data.success) analysis.value = data.data.analysis
  } catch {
    // 与原逻辑一致：预分析失败不提示，仅保持原有分析结果
  } finally {
    analyzing.value = false
  }
}

async function startRegen() {
  running.value = true
  progressList.value = []
  try {
    const data = await http.post('/api/phase2/regenerate-with-doc', {
      componentId: props.componentId,
      groupId: props.groupId,
      requirementDoc: requirementDoc.value,
      docAnalysis: analysis.value || undefined,
      config: aiConfigBody(),
    })
    if (!data.success) throw new Error(data.message || '发起失败')
    const sid = data.data.sessionId
    // SSE 监听进度
    const es = createProgressStream(sid)
    es.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'progress' && msg.data) {
          progressList.value.push(msg.data)
          nextTick(() => { logRef.value?.scrollTo(0, logRef.value.scrollHeight) })
        }
        if (msg.type === 'complete') {
          es.close()
          running.value = false
          newSessionId.value = sid
          await loadNewSummary()
        }
        if (msg.type === 'error') {
          es.close()
          running.value = false
          progressList.value.push({ stage: '错误', message: msg.data?.message || '生成失败', status: 'error' })
        }
      } catch {}
    }
    es.onerror = () => { es.close(); running.value = false }
  } catch (e: any) {
    running.value = false
    progressList.value.push({ stage: '错误', message: e.message, status: 'error' })
  }
}

async function loadNewSummary() {
  try {
    // 读取新版 declare.json（经组件文件 API）
    const data = await http.get(`/api/component/${props.componentId}-doc-regen/files`)
    const declareText = data?.data?.files?.['declare.json'] || data?.data?.['declare.json']
    if (declareText) {
      const d = typeof declareText === 'string' ? JSON.parse(declareText) : declareText
      newSummary.value = {
        events: Object.keys(d.businessEvents || {}).length,
        statuses: Object.keys(d.businessStatuses || {}).length,
        configs: (d.businessConfig || []).length,
        cssVars: (d.cssVariableConfig || []).length,
      }
      detectConflicts(d)
    }
  } catch {}
}

function detectConflicts(newDeclare: any) {
  const notes: string[] = []
  const oldCfg = Object.fromEntries(((props.oldDeclare?.businessConfig) || []).map((c: any) => [c.key, c]))
  for (const c of newDeclare.businessConfig || []) {
    const old = oldCfg[c.key]
    if (old && JSON.stringify(old.default) !== JSON.stringify(c.default)) {
      notes.push(`配置「${c.key}」默认值冲突：旧 ${JSON.stringify(old.default)} vs 新 ${JSON.stringify(c.default)}`)
    }
  }
  // 已知单位类冲突探测（refreshInterval 秒 vs pollInterval 毫秒 这类并存）
  const keys = (newDeclare.businessConfig || []).map((c: any) => c.key)
  if (keys.includes('refreshInterval') && keys.includes('pollInterval')) {
    notes.push('refreshInterval 与 pollInterval 并存（可能单位不一致：秒 vs 毫秒），建议人工统一')
  }
  conflictNotes.value = notes
}

function confirmOverwrite() {
  emit('overwritten', { componentId: props.componentId, sessionId: newSessionId.value })
}

function discardNew() {
  newSessionId.value = ''
  emit('discarded')
}
</script>

<style scoped>
.doc-compare-panel { padding: 16px; color: #d5dce4; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.header-left { display: flex; align-items: center; gap: 8px; }
.header-icon { font-size: 16px; }
.header-title { font-size: 14px; font-weight: 600; color: #e0e6ed; }
.header-badge { font-size: 10px; padding: 2px 8px; background: rgba(102,126,234,0.15); color: var(--feature); border-radius: var(--radius-md); }
.btn { padding: 7px 14px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-sm); color: #b8c2cc; font-size: 12px; cursor: pointer; }
.btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn.primary { background: var(--feature); border: none; color: var(--text-on-brand); font-weight: 600; }
.btn.success { background: rgba(82,196,26,0.15); border-color: rgba(82,196,26,0.4); color: var(--success); }
.btn.danger { color: var(--error-light); }

.doc-textarea { width: 100%; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-md); color: #d5dce4; font-size: 12px; font-family: 'SF Mono', Consolas, monospace; line-height: 1.6; padding: 10px 12px; resize: vertical; outline: none; }
.doc-textarea:focus { border-color: var(--feature); }
.doc-meta-row { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.doc-meta { font-size: 11px; color: #6b7684; }

.analysis-summary { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; align-items: center; }
.badge { font-size: 10px; padding: 3px 8px; background: rgba(255,255,255,0.06); border-radius: var(--radius-md); color: #b8c2cc; }
.badge.success { background: rgba(82,196,26,0.15); color: var(--success); }
.module-name { font-size: 11px; color: #8b98a8; margin-left: 6px; }

.running-area { padding: 12px; background: rgba(102,126,234,0.05); border-radius: var(--radius-md); }
.running-title { font-size: 13px; color: var(--feature); margin-bottom: 10px; }
.running-log { max-height: 240px; overflow-y: auto; font-size: 11px; font-family: monospace; }
.log-line { padding: 2px 0; color: #8b98a8; }
.log-line.completed { color: var(--success); }
.log-line.error { color: var(--error-light); }
.log-line.warning { color: var(--warning); }
.log-stage { color: var(--feature); }

.compare-area { margin-top: 4px; }
.compare-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.compare-title { font-size: 14px; font-weight: 600; color: #e0e6ed; }
.compare-actions { display: flex; gap: 8px; }
.compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.compare-col { border: 1px solid rgba(255,255,255,0.08); border-radius: var(--radius-md); overflow: hidden; }
.col-title { padding: 8px 12px; font-size: 12px; font-weight: 600; }
.col-title.old { background: rgba(255,255,255,0.04); color: #8b98a8; }
.col-title.new { background: rgba(102,126,234,0.12); color: var(--feature); }
.col-body { padding: 12px; }
.config-block .block-title { font-size: 11px; color: #6b7684; margin-bottom: 8px; }
.kv-line { font-size: 12px; color: #b8c2cc; padding: 3px 0; }
.kv-line.improved { color: var(--success); }
.delta { font-size: 10px; background: rgba(82,196,26,0.15); padding: 1px 6px; border-radius: var(--radius-sm); margin-left: 4px; }
.conflict-notes { margin-top: 12px; padding: 10px 12px; background: rgba(250,173,20,0.08); border: 1px solid rgba(250,173,20,0.25); border-radius: var(--radius-md); }
.conflict-title { font-size: 12px; color: var(--warning); margin-bottom: 6px; }
.conflict-line { font-size: 11px; color: #d5dce4; padding: 2px 0; }

.mini-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-top-color: var(--text-on-brand); border-radius: var(--radius-full); animation: spin 0.8s linear infinite; margin-right: 4px; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
