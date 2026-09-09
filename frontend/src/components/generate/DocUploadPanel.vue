<template>
  <div class="doc-upload-panel" :class="{ expanded: isExpanded, disabled: props.disabled }">
    <!-- 面板头（折叠/展开） -->
    <div class="panel-header" @click="!props.disabled && (isExpanded = !isExpanded)">
      <span class="header-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>
      <span class="header-title">需求文档</span>
      <span class="header-badge optional">可选</span>
      <span v-if="analysis" class="header-badge success">已解析 ✓</span>
      <span class="header-hint" v-if="!document && !props.disabled">上传文档可让 AI 一次写对数据字段，省 ~40% Token</span>
      <span v-if="props.disabled" class="header-hint disabled-hint">生成进行中，暂不可编辑</span>
      <span class="header-toggle">{{ isExpanded ? '▲' : '▼' }}</span>
    </div>

    <div v-show="isExpanded" class="panel-body">
      <!-- 文档输入区 -->
      <div class="doc-input-row">
        <textarea
          v-model="localDocument"
          class="doc-textarea"
          :class="{ 'has-content': localDocument, 'drag-over': isDragOver }"
          placeholder="粘贴需求文档（Markdown），拖拽文件到此处，或点击右侧上传 .md 文件…"
          rows="5"
          :disabled="analyzing || props.disabled"
          @input="onDocChange"
          @dragover.prevent="!props.disabled && (isDragOver = true)"
          @dragleave.prevent="!props.disabled && (isDragOver = false)"
          @drop.prevent="!props.disabled && onDrop($event)"
        ></textarea>
        <div class="doc-actions">
          <input ref="fileInputRef" type="file" accept=".md,.markdown,.txt" style="display: none" @change="onFileSelect" />
          <button class="doc-btn" :disabled="analyzing || props.disabled" @click="fileInputRef?.click()">上传</button>
          <button v-if="localDocument" class="doc-btn danger" :disabled="analyzing || props.disabled" @click="clearDoc">✕ 清除</button>
        </div>
      </div>

      <!-- 操作行 -->
      <div class="analyze-row" v-if="localDocument">
        <div class="doc-meta">{{ docCharCount }} 字符</div>
        <button class="btn-analyze" :disabled="!canAnalyze || analyzing || props.disabled" @click="analyzeDoc">
          <span v-if="analyzing" class="mini-spinner"></span>
          {{ analyzing ? '分析中…' : analysis ? '重新分析' : '分析文档' }}
        </button>
      </div>

      <!-- 分析结果 -->
      <Transition name="result-fade">
        <div v-if="analysis" class="analysis-result">
          <div class="result-header">
            <span class="result-title">文档解析结果</span>
            <span v-if="analysis.extractionMeta?.fullConfigDetected" class="config-badge full">微码四配置 ✓</span>
            <span v-else class="config-badge partial">部分配置</span>
            <span v-if="degraded" class="config-badge warn" title="未配置文本AI，交互设计维度未提取">降级</span>
          </div>

          <div class="dimension-chips">
            <span class="chip" :class="{ empty: !dimCount('events') }">事件 {{ dimCount('events') }}</span>
            <span class="chip" :class="{ empty: !dimCount('apis') }">接口 {{ dimCount('apis') }}</span>
            <span class="chip" :class="{ empty: !dimCount('config') }">配置 {{ dimCount('config') }}</span>
            <span class="chip" :class="{ empty: !dimCount('css') }">CSS 变量 {{ dimCount('css') }}</span>
            <span class="chip" :class="{ empty: !dimCount('ui') }">元素 {{ dimCount('ui') }}</span>
            <span class="chip" :class="{ empty: !dimCount('mappings') }">字段映射 {{ dimCount('mappings') }}</span>
            <span class="chip" :class="{ empty: !dimCount('interactions') }">交互 {{ dimCount('interactions') }}</span>
          </div>

          <div v-if="analysis.moduleInfo?.moduleName" class="module-line">
            模块：{{ analysis.moduleInfo.moduleName }}<span v-if="analysis.moduleInfo.moduleCode" class="module-code">{{ analysis.moduleInfo.moduleCode }}</span>
          </div>
        </div>
      </Transition>

      <div v-if="analyzeError" class="analyze-error">{{ analyzeError }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useConfigStore } from '@/stores/config'
import http from '@/core/http'

const props = defineProps<{
  document?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:document': [val: string]
  'analysis-change': [analysis: any]
}>()

const configStore = useConfigStore()

const isExpanded = ref(false)
const localDocument = ref(props.document || '')
const analyzing = ref(false)
const analysis = ref<any>(null)
const degraded = ref(false)
const analyzeError = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)

const docCharCount = computed(() => localDocument.value.length)
const canAnalyze = computed(() => localDocument.value.trim().length >= 20 && !analyzing.value)

watch(
  () => props.document,
  (val) => {
    if (val !== localDocument.value) localDocument.value = val || ''
  },
)

function onDocChange() {
  emit('update:document', localDocument.value)
  // 内容变更后旧分析失效
  if (analysis.value) {
    analysis.value = null
    emit('analysis-change', null)
  }
  analyzeError.value = ''
}

function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  readFile(file)
  ;(e.target as HTMLInputElement).value = ''
}

function readFile(file: File) {
  const reader = new FileReader()
  reader.onload = () => {
    localDocument.value = String(reader.result || '')
    onDocChange()
    isExpanded.value = true
  }
  reader.readAsText(file)
}

function onDrop(e: DragEvent) {
  if (props.disabled) return
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !['md', 'markdown', 'txt'].includes(ext)) {
    analyzeError.value = `不支持 .${ext} 文件，请上传 .md 或 .txt 文件`
    return
  }
  readFile(file)
}

function clearDoc() {
  localDocument.value = ''
  analysis.value = null
  analyzeError.value = ''
  emit('update:document', '')
  emit('analysis-change', null)
}

function dimCount(key: string): number {
  const a = analysis.value
  if (!a) return 0
  switch (key) {
    case 'events': return a.events?.length || 0
    case 'apis': return a.dataBinding?.apis?.length || 0
    case 'config': return (a.businessConfig?.length || 0)
    case 'css': return a.cssVariableConfig?.length || 0
    case 'ui': return a.uiElements?.length || 0
    case 'mappings': return a.dataBinding?.fieldMappings?.length || 0
    case 'interactions': return a.interactions?.length || 0
    default: return 0
  }
}

async function analyzeDoc() {
  if (!canAnalyze.value) return
  analyzing.value = true
  analyzeError.value = ''

  try {
    const raw = configStore.config as any
    const c = raw?.value !== undefined ? raw.value : raw
    const body: any = {
      document: localDocument.value,
      source: 'paste',
    }
    if (c?.textApiKey && c?.textBaseURL) {
      body.aiConfig = {
        textApiKey: c.textApiKey,
        textBaseURL: c.textBaseURL,
        textModel: c.textModel,
      }
    }

    const data = await http.post('/api/phase2/analyze-doc', body)
    if (!data.success) throw new Error(data.message || data.data.error || '文档分析失败')

    analysis.value = data.data.analysis
    degraded.value = !!data.data.degraded
    emit('analysis-change', data.data.analysis)
  } catch (err: any) {
    analyzeError.value = err.message || '文档分析失败'
  } finally {
    analyzing.value = false
  }
}
</script>

<style scoped>
.doc-upload-panel {
  margin-top: 12px;
  margin-bottom: 4px;
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--bg-hover);
  overflow: hidden;
  transition: border-color 0.2s;
}
.doc-upload-panel.expanded { border-color: var(--brand); background: var(--bg-card); }
.doc-upload-panel.disabled { opacity: 0.85; background: var(--bg-disabled, var(--bg-hover)); }
.doc-upload-panel.disabled .panel-header { cursor: not-allowed; }
.doc-upload-panel.disabled .panel-header:hover { background: transparent; }

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.panel-header:hover { background: var(--brand-bg); }
.header-icon { font-size: 16px; }
.header-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.header-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: var(--radius-md);
  font-weight: 600;
}
.header-badge.optional { background: var(--border-light); color: var(--text-secondary); }
.header-badge.success { background: var(--task-success-bg); color: var(--task-success-text); border-color: var(--task-success-border); }
.header-hint {
  flex: 1;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-hint.disabled-hint { color: var(--warning-text); font-weight: 500; }
.header-toggle { font-size: 11px; color: var(--text-secondary); }

.panel-body { padding: 0 16px 16px; }

.doc-input-row { display: flex; gap: 10px; }
.doc-textarea {
  flex: 1;
  background: var(--bg-hover);
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'SF Mono', Consolas, monospace;
  line-height: 1.6;
  padding: 10px 12px;
  resize: vertical;
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;
}
.doc-textarea:focus { border-color: var(--brand); background: var(--bg-card); box-shadow: 0 0 0 3px var(--brand-bg-active); }
.doc-textarea.has-content { border-color: var(--brand-border); }
.doc-textarea.drag-over {
  border-color: var(--brand);
  background: var(--brand-bg);
  box-shadow: 0 0 0 3px var(--brand-bg-active);
}
.doc-textarea::placeholder { color: var(--text-quaternary); }

.doc-actions { display: flex; flex-direction: column; gap: 6px; }
.doc-btn {
  padding: 7px 14px;
  background: var(--button-secondary-bg);
  border: 1.5px solid var(--button-secondary-border);
  border-radius: var(--radius-md);
  color: var(--button-secondary-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  font-family: inherit;
}
.doc-btn:hover:not(:disabled) { background: var(--button-secondary-bg-hover); border-color: var(--button-secondary-border-hover); color: var(--button-secondary-text); }
.doc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.doc-btn.danger { color: var(--button-danger-soft-text); border-color: var(--button-danger-border); background: var(--button-danger-soft-bg); }
.doc-btn.danger:hover:not(:disabled) { background: var(--button-danger-soft-bg-hover); border-color: var(--button-danger-border-hover); color: var(--button-danger-soft-text); }

.analyze-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}
.doc-meta { font-size: 12px; color: var(--text-tertiary); }
.btn-analyze {
  padding: 8px 18px;
  background: var(--button-primary-bg);
  border: none;
  border-radius: var(--radius-md);
  color: var(--button-primary-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}
.btn-analyze:hover:not(:disabled) { background: var(--button-primary-bg-hover); transform: translateY(-1px); box-shadow: var(--shadow-md); }
.btn-analyze:disabled { opacity: 0.5; cursor: not-allowed; }

.mini-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.analysis-result {
  margin-top: 12px;
  padding: 14px;
  background: var(--brand-bg);
  border: 1px solid var(--brand-border);
  border-radius: var(--radius-md);
}
.result-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.result-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.config-badge { font-size: 10px; padding: 2px 8px; border-radius: var(--radius-md); font-weight: 600; border: 1px solid transparent; }
.config-badge.full { background: var(--task-success-bg); color: var(--task-success-text); border-color: var(--task-success-border); }
.config-badge.partial { background: var(--warning-bg); color: var(--warning-text); border-color: var(--warning-border); }
.config-badge.warn { background: var(--warning-bg); color: var(--warning-text); border-color: var(--warning-border); }

.dimension-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  font-size: 11px;
  padding: 4px 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  color: var(--text-secondary);
  font-weight: 500;
}
.chip.empty { opacity: 0.55; }

.module-line { margin-top: 10px; font-size: 12px; color: var(--text-secondary); }
.module-code {
  margin-left: 6px;
  padding: 1px 6px;
  background: var(--border-light);
  border-radius: var(--radius-xs);
  font-family: monospace;
  font-size: 10px;
  color: var(--text-secondary);
}

.analyze-error {
  margin-top: 10px;
  font-size: 12px;
  color: var(--error);
  background: var(--error-bg);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
}

.result-fade-enter-active { transition: all 0.3s ease; }
.result-fade-enter-from { opacity: 0; transform: translateY(-6px); }
</style>
