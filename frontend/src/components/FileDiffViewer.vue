<!--
  FileDiffViewer.vue —— 基于 Monaco 的双向 Diff 编辑器
  用于 Playground「文件比较」：传入 left / right 两个 { name, content, language }，
  渲染只读的并排差异视图。monaco 由 MonacoEditor 预热后挂载在 window.monaco。
-->
<template>
  <div class="file-diff-viewer">
    <div ref="container" class="diff-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { loadMonaco } from '@/utils/monaco-loader'

const props = defineProps({
  left: { type: Object, default: null }, // { name, content, language }
  right: { type: Object, default: null },
})

const container = ref(null)
let editor = null
let monaco = null
let ready = false
let curOriginal = null
let curModified = null

function updateModels() {
  if (!editor || !monaco) return
  const L = props.left || { content: '', language: 'plaintext', name: 'left' }
  const R = props.right || { content: '', language: 'plaintext', name: 'right' }
  if (curOriginal) curOriginal.dispose()
  if (curModified) curModified.dispose()
  curOriginal = monaco.editor.createModel(L.content || '', L.language || 'plaintext')
  curModified = monaco.editor.createModel(R.content || '', R.language || 'plaintext')
  editor.setModel({ original: curOriginal, modified: curModified })
}

async function init() {
  if (!container.value) return
  monaco = window.monaco
  if (!monaco) {
    try {
      await loadMonaco()
      monaco = window.monaco
    } catch (e) {
      console.error('[FileDiffViewer] monaco 加载失败', e)
      return
    }
  }
  editor = monaco.editor.createDiffEditor(container.value, {
    automaticLayout: true,
    readOnly: true,
    renderSideBySide: true,
    minimap: { enabled: false },
    fontSize: 13,
    scrollBeyondLastLine: false,
  })
  ready = true
  updateModels()
}

onMounted(() => {
  if (window.monaco) init()
  else loadMonaco().then(init)
})

onBeforeUnmount(() => {
  if (curOriginal) { curOriginal.dispose(); curOriginal = null }
  if (curModified) { curModified.dispose(); curModified = null }
  if (editor) { editor.dispose(); editor = null }
})

watch(
  () => [props.left, props.right],
  () => { if (ready) updateModels() },
  { deep: true },
)
</script>

<style scoped>
.file-diff-viewer {
  width: 100%;
  height: 100%;
  min-height: 420px;
  background: #1e1e1e;
}
.diff-container {
  width: 100%;
  height: 100%;
}
</style>
