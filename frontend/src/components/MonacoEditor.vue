<!--
  MonacoEditor.vue —— Playground 内嵌的代码编辑器（monaco-editor v0.45.0）

  加载链路：CDN 多镜像 fallback + 加载状态可观察 + 可预热。
  实现细节见 @/utils/monaco-loader.js；本组件只负责挂载 + 状态可视化。
-->
<template>
  <div class="monaco-editor-wrap" :data-state="state">
    <div ref="editorContainer" class="monaco-editor-container" v-show="state === 'ready'"></div>

    <!-- 加载中：spinner + 文案 + 已耗时计时，给用户清晰进度感 -->
    <div v-if="state === 'loading'" class="monaco-loading">
      <span class="monaco-spinner" aria-hidden="true"></span>
      <div class="monaco-loading-text">
        <div class="monaco-loading-title">正在初始化代码编辑器…</div>
        <div class="monaco-loading-sub" v-if="elapsedSec > 1">
          首次加载约需 3–10 秒<span v-if="elapsedSec > 3">（已等待 {{ elapsedSec }} 秒）</span>
        </div>
        <div class="monaco-loading-progress">
          <span
            v-for="(_, i) in progressDots"
            :key="i"
            class="progress-dot"
            :style="{ animationDelay: (i * 0.18) + 's' }"
          />
        </div>
      </div>
    </div>

    <!-- 失败：所有 CDN 都不可用 -->
    <div v-if="state === 'error'" class="monaco-error">
      <div class="monaco-error-icon" aria-hidden="true">⚠</div>
      <div class="monaco-error-title">代码编辑器加载失败</div>
      <div class="monaco-error-desc">{{ errorMsg || '所有 CDN 镜像均不可达，请检查网络后重试。' }}</div>
      <button class="monaco-error-btn" @click="retry">重试</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { loadMonaco, preloadMonaco as loaderPreload, resetMonacoLoader } from '@/utils/monaco-loader'

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'javascript' },
  theme: { type: String, default: 'vs-dark' },
  options: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['update:modelValue'])

const editorContainer = ref(null)
let editor = null
let monaco = null

// ── 加载状态机：loading | ready | error ────────────────────────────
const state = ref('loading')
const errorMsg = ref('')
const elapsedSec = ref(0)
let elapsedTimer = null
const progressDots = [0, 1, 2, 3]

onMounted(async () => {
  // 后台预热：如外部已经启动则跳过；未启动则兜底。
  loaderPreload()
  elapsedTimer = setInterval(() => { elapsedSec.value++ }, 1000)
  try {
    await loadMonaco()
    initEditor()
    state.value = 'ready'
  } catch (e) {
    errorMsg.value = (e && e.message) || String(e)
    state.value = 'error'
    console.error('[MonacoEditor] 加载失败：', e)
  } finally {
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
  }
})

onBeforeUnmount(() => {
  if (editor) { editor.dispose(); editor = null }
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
})

watch(() => props.modelValue, (newValue) => {
  if (editor && newValue !== editor.getValue()) editor.setValue(newValue)
})

watch(() => props.language, (newLanguage) => {
  if (editor) {
    const model = editor.getModel()
    monaco.editor.setModelLanguage(model, newLanguage)
  }
})

function revealPosition(line = 1, column = 1) {
  if (!editor) return false
  const position = {
    lineNumber: Math.max(1, Number(line) || 1),
    column: Math.max(1, Number(column) || 1)
  }
  editor.revealPositionInCenter(position)
  editor.setPosition(position)
  editor.focus()
  return true
}

function setDiagnosticMarker(diagnostic = {}) {
  if (!editor || !monaco) return false
  const model = editor.getModel()
  if (!model) return false
  const lineNumber = Math.max(1, Number(diagnostic.line) || 1)
  const column = Math.max(1, Number(diagnostic.column) || 1)
  monaco.editor.setModelMarkers(model, 'mvgo-less-gate', [{
    startLineNumber: lineNumber,
    startColumn: column,
    endLineNumber: lineNumber,
    endColumn: Math.max(column + 1, model.getLineMaxColumn(lineNumber)),
    message: diagnostic.message || 'LESS 编译失败',
    severity: monaco.MarkerSeverity.Error
  }])
  return revealPosition(lineNumber, column)
}

function retry() {
  state.value = 'loading'
  errorMsg.value = ''
  elapsedSec.value = 0
  resetMonacoLoader()
  elapsedTimer = setInterval(() => { elapsedSec.value++ }, 1000)
  loadMonaco()
    .then(() => {
      initEditor()
      state.value = 'ready'
      if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
    })
    .catch((e) => {
      errorMsg.value = (e && e.message) || String(e)
      state.value = 'error'
      if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
    })
}

defineExpose({ revealPosition, setDiagnosticMarker, preloadMonaco: loaderPreload, retry })

function initEditor() {
  if (!editorContainer.value || !window.monaco) return
  monaco = window.monaco
  editor = monaco.editor.create(editorContainer.value, {
    value: props.modelValue,
    language: props.language,
    theme: props.theme,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    lineNumbers: 'on',
    lineNumbersMinChars: 5,
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    // 确保 lineNumbers 不被外部 options 覆盖为 off
    ...props.options,
    lineNumbers: props.options?.lineNumbers || 'on',
    lineNumbersMinChars: props.options?.lineNumbersMinChars || 5,
  })
  editor.onDidChangeModelContent(() => emit('update:modelValue', editor.getValue()))
}
</script>

<style scoped>
.monaco-editor-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
  background: #1e1e1e; /* vs-dark 背景，避免加载前闪烁 */
  overflow: hidden;
}

.monaco-editor-container {
  width: 100%;
  height: 100%;
}

/* ── Loading 骨架屏 ───────────────────────────────────────────── */
.monaco-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  color: #d4d4d4;
  font-size: 13px;
  background: #1e1e1e;
  user-select: none;
}

.monaco-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(120, 167, 255, 0.18);
  border-top-color: #78a7ff;
  border-radius: 50%;
  animation: monaco-spin 0.9s linear infinite;
  flex-shrink: 0;
}

@keyframes monaco-spin {
  to { transform: rotate(360deg); }
}

.monaco-loading-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.monaco-loading-title {
  font-size: 14px;
  color: #f0f0f0;
}

.monaco-loading-sub {
  font-size: 12px;
  color: #8b8b8b;
}

.monaco-loading-progress {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.progress-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #78a7ff;
  opacity: 0.3;
  animation: monaco-pulse 1.4s ease-in-out infinite;
}

@keyframes monaco-pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* ── 错误态 ───────────────────────────────────────────────── */
.monaco-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #f0f0f0;
  background: #1e1e1e;
  text-align: center;
  padding: 24px;
}

.monaco-error-icon {
  font-size: 36px;
  color: #ffa940;
}

.monaco-error-title {
  font-size: 15px;
  font-weight: 600;
}

.monaco-error-desc {
  font-size: 12px;
  color: #8b8b8b;
  max-width: 360px;
  line-height: 1.5;
  word-break: break-word;
}

.monaco-error-btn {
  margin-top: 12px;
  padding: 6px 16px;
  background: transparent;
  border: 1px solid #4096ff;
  color: #4096ff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.monaco-error-btn:hover {
  background: #4096ff;
  color: #fff;
}
</style>