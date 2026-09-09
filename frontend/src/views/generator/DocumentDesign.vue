<template>
  <div class="document-design-page">
    <div class="page-header">
      <h1>微码文档在线生成</h1>
      <p class="subtitle">输入需求文档，一键生成微码设计配置</p>
      <div class="header-links">
        <router-link to="/generator" class="header-link">← 返回开发界面</router-link>
        <!-- <router-link to="/generator/api-docs" class="header-link">📡 API文档</router-link> -->
      </div>
    </div>

    <div class="toolbar">
      <button class="btn-tool" @click="handleNew">新建</button>
      <button class="btn-tool" @click="handleSave">保存草稿</button>
      <button class="btn-tool" @click="handleExport">导出MD</button>
      <button class="btn-primary" @click="handleGenerate" :disabled="generating">
        <span v-if="generating" class="spinner"></span>
        {{ generating ? "生成中..." : "生成配置 →" }}
      </button>
    </div>

    <div class="content-layout">
      <!-- 展开按钮（侧边栏收起时显示） -->
      <button
        v-if="sidebarCollapsed"
        @click="sidebarCollapsed = false"
        class="btn-expand icon-tooltip"
        data-tooltip="展开文档列表"
        aria-label="展开文档列表"
      >
        →
      </button>

      <!-- 左侧文档列表 -->
      <div class="document-sidebar" :class="{ collapsed: sidebarCollapsed }">
        <div class="sidebar-header">
          <h3>历史文档</h3>
          <button
            @click="sidebarCollapsed = !sidebarCollapsed"
            class="btn-collapse icon-tooltip"
            :data-tooltip="sidebarCollapsed ? '展开文档列表' : '收起文档列表'"
            :aria-label="sidebarCollapsed ? '展开文档列表' : '收起文档列表'"
          >
            {{ sidebarCollapsed ? '→' : '←' }}
          </button>
        </div>

        <div class="sidebar-search">
          <input
            v-model="searchQuery"
            placeholder="搜索文档..."
            class="search-input"
          />
        </div>

        <div class="document-list">
          <div
            v-for="doc in filteredDocuments"
            :key="doc._id"
            class="document-item"
            :class="{ active: currentDocId === doc._id }"
            @click="loadDocument(doc._id)"
          >
            <div class="doc-title">{{ doc.title }}</div>
            <div class="doc-meta">{{ formatDate(doc.updatedAt) }}</div>
            <div class="doc-actions">
              <button @click.stop="handleRename(doc._id)" class="icon-tooltip" data-tooltip="重命名" aria-label="重命名"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
              <button @click.stop="handleDelete(doc._id)" class="icon-tooltip" data-tooltip="删除" aria-label="删除"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
          </div>

          <div v-if="filteredDocuments.length === 0" class="empty-state">
            暂无文档
          </div>
        </div>
      </div>

      <!-- 右侧编辑器区域 -->
      <div class="editor-area">
    <div class="split-editor">
      <div class="editor-pane">
        <label class="pane-label">原始文档</label>
        <textarea
          v-model="originalDoc"
          class="editor-textarea"
          placeholder="请输入需求文档内容..."
          rows="20"
        ></textarea>
      </div>

      <div class="editor-pane">
        <div class="pane-header">
          <label class="pane-label">生成的微码设计文档</label>
          <div class="pane-header-actions">
            <div v-if="generatedDoc" class="view-mode-toggle">
              <button
                :class="['icon-tooltip', { active: viewMode === 'preview' }]"
                @click="viewMode = 'preview'"
                data-tooltip="预览渲染效果"
                aria-label="预览渲染效果"
              >预览</button>
              <button
                :class="['icon-tooltip', { active: viewMode === 'edit' }]"
                @click="viewMode = 'edit'"
                data-tooltip="编辑 Markdown 源码"
                aria-label="编辑 Markdown 源码"
              >编辑</button>
              <button
                :class="['icon-tooltip', { active: viewMode === 'split' }]"
                @click="viewMode = 'split'"
                data-tooltip="左侧编辑、右侧实时预览"
                aria-label="左侧编辑、右侧实时预览"
              >分栏</button>
            </div>
            <button
              v-if="generatedDoc"
              class="btn-copy-doc icon-tooltip"
              @click="handleCopy"
              data-tooltip="复制文档内容"
              aria-label="复制文档内容"
            >复制</button>
          </div>
        </div>
        <div class="editor-container">
          <!-- 预览模式：HTML 渲染 -->
          <div
            v-if="generatedDoc && viewMode === 'preview'"
            class="editor-preview"
            v-html="renderedHtml"
          ></div>

          <!-- 编辑模式：Markdown 源码编辑 -->
          <textarea
            v-else-if="generatedDoc && viewMode === 'edit'"
            v-model="generatedDoc"
            class="editor-textarea"
            placeholder="编辑 Markdown 文档..."
          ></textarea>

          <!-- 分栏模式：左编辑 + 右实时预览 -->
          <div v-else-if="generatedDoc && viewMode === 'split'" class="split-view">
            <textarea
              v-model="generatedDoc"
              class="editor-textarea split-left"
              placeholder="编辑 Markdown 文档..."
            ></textarea>
            <div class="editor-preview split-right" v-html="renderedHtml"></div>
          </div>

          <!-- 空状态提示 -->
          <div v-else class="editor-placeholder">
            生成的文档将显示在这里...
          </div>

          <!-- Loading遮罩 -->
          <div v-if="generating" class="loading-overlay">
            <div class="loading-content">
              <div class="loading-spinner"></div>
              <p class="loading-text">正在生成配置...</p>
              <p class="loading-hint">AI正在分析文档并生成四个配置章节</p>
            </div>
          </div>
        </div>
      </div>
    </div>
      </div>  <!-- 闭合 editor-area -->
    </div>  <!-- 闭合 content-layout -->
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import { generateDocConfigs } from '@/api/generator'
import { marked } from 'marked'
import http from '@/core/http'

// 响应式状态
const originalDoc = ref('')      // 原始文档
const generatedDoc = ref('')     // 生成的文档
const generating = ref(false)    // 生成中状态
const viewMode = ref('preview')  // 右侧显示模式：preview | edit | split

// 文档管理状态
const documents = ref([])        // 文档列表
const currentDocId = ref(null)   // 当前文档ID
const searchQuery = ref('')      // 搜索关键词
const sidebarCollapsed = ref(false) // 侧边栏折叠状态

// 本地存储key
const STORAGE_KEY = 'microcode-doc-draft'

// 过滤后的文档列表
const filteredDocuments = computed(() => {
  if (!searchQuery.value) return documents.value
  const query = searchQuery.value.toLowerCase()
  return documents.value.filter(doc =>
    doc.title.toLowerCase().includes(query)
  )
})

// 格式化日期
const formatDate = (date) => {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// 计算属性：渲染带高亮的HTML
const renderedHtml = computed(() => {
  if (!generatedDoc.value) return ''

  // 标记新增的配置章节（用特殊class包裹）
  let html = generatedDoc.value

  // 匹配四个配置章节并添加高亮标记
  const configSections = [
    'businessEvents（业务事件）',
    'businessStatuses（业务状态）',
    'businessConfig（业务配置）',
    'cssVariableConfig（CSS变量配置）'
  ]

  configSections.forEach(section => {
    const regex = new RegExp(`(#{1,6}\\s*${section}[\\s\\S]*?)(?=#{1,6}\\s|$)`, 'g')
    html = html.replace(regex, '<div class="new-section">$1</div>')
  })

  // 渲染markdown为HTML
  return marked(html)
})

// 页面加载时恢复草稿
onMounted(() => {
  const draft = localStorage.getItem(STORAGE_KEY)
  if (draft) {
    try {
      const data = JSON.parse(draft)
      originalDoc.value = data.originalDoc || ''
      generatedDoc.value = data.generatedDoc || ''
      if (generatedDoc.value) viewMode.value = 'preview'
    } catch (e) {
      console.error('恢复草稿失败:', e)
    }
  }
})

// 新建 - 清空编辑器
const handleNew = () => {
  if (originalDoc.value || generatedDoc.value) {
    if (!confirm('确定要清空当前内容吗？未保存的内容将丢失。')) {
      return
    }
  }
  originalDoc.value = ''
  generatedDoc.value = ''
  viewMode.value = 'preview'
  message.success('已清空')
}

// 加载文档
const loadDocument = async (id) => {
  try {
    const doc = await http.get(`/api/documents/${id}`)
    originalDoc.value = doc.data.content
    generatedDoc.value = doc.data.generatedContent || ''
    viewMode.value = generatedDoc.value ? 'preview' : 'preview'
    currentDocId.value = id
  } catch (error) {
    message.error('加载文档失败')
  }
}

// 重命名文档
const handleRename = async (id) => {
  const newTitle = prompt('请输入新标题：')
  if (!newTitle) return
  try {
    await http.post(`/api/documents/${id}`, { title: newTitle })
    await fetchDocuments()
    message.success('重命名成功')
  } catch (error) {
    message.error('重命名失败')
  }
}

// 删除文档
const handleDelete = async (id) => {
  if (!confirm('确定要删除这个文档吗？')) return
  try {
    await http.post(`/api/documents/${id}/delete`)
    await fetchDocuments()
    if (currentDocId.value === id) {
      currentDocId.value = null
      originalDoc.value = ''
    }
    message.success('删除成功')
  } catch (error) {
    message.error('删除失败')
  }
}

// 获取文档列表
const fetchDocuments = async () => {
  try {
    documents.value = (await http.get('/api/documents')).data || []
  } catch (error) {
    console.error('获取文档列表失败:', error)
  }
}

// 保存草稿（改为保存到云端）
const handleSave = async () => {
  if (!originalDoc.value.trim()) {
    message.warning('文档内容为空')
    return
  }

  try {
    const title = originalDoc.value.split('\n')[0].substring(0, 50) || '未命名文档'

    if (currentDocId.value) {
      // 更新现有文档
      await http.post(`/api/documents/${currentDocId.value}`, {
        content: originalDoc.value,
        generatedContent: generatedDoc.value || '',
        title
      })
      message.success('文档已更新')
    } else {
      // 创建新文档
      const doc = await http.post('/api/documents', {
        title,
        content: originalDoc.value,
        generatedContent: generatedDoc.value || '',
        type: 'microcode-design'
      })
      currentDocId.value = doc.data._id
      message.success('文档已保存')
    }

    await fetchDocuments()
  } catch (error) {
    message.error('保存失败')
  }
}

// 导出MD文件
const handleExport = () => {
  if (!generatedDoc.value) {
    message.warning('没有可导出的内容')
    return
  }

  const blob = new Blob([generatedDoc.value], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `microcode-design-${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(url)
  message.success('导出成功')
}

// 生成配置
const handleGenerate = async () => {
  // 验证输入
  if (!originalDoc.value.trim()) {
    message.warning('请先输入原始文档内容')
    return
  }

  generating.value = true

  try {
    // 调用API生成配置
    const response = await generateDocConfigs({
      document: originalDoc.value
    })

    if (response.success && response.merged) {
      generatedDoc.value = response.merged
      viewMode.value = 'preview'  // 生成完成后默认预览
      message.success('配置生成成功！')
    } else {
      message.error(response.error || '生成失败')
    }
  } catch (error) {
    console.error('生成配置失败:', error)
    message.error(error.message || '网络请求失败')
  } finally {
    generating.value = false
  }
}

// 复制文档内容
const handleCopy = async () => {
  if (!generatedDoc.value) {
    message.warning('没有可复制的内容')
    return
  }

  try {
    await navigator.clipboard.writeText(generatedDoc.value)
    message.success('已复制到剪贴板')
  } catch (error) {
    console.error('复制失败:', error)
    message.error('复制失败')
  }
}

// 组件挂载时加载文档列表
onMounted(() => {
  fetchDocuments()
})
</script>

<style scoped>
.document-design-page {
  max-width: 1500px;
  margin: 0 auto;
  padding: 24px 24px 60px;
}

.page-header {
  text-align: center;
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 36px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -1px;
  line-height: 1.2;
}

.subtitle {
  font-size: 15px;
  color: var(--text-secondary);
  margin-top: 12px;
  line-height: 1.6;
}

.header-links {
  display: flex;
  justify-content: center;
  margin-top: 16px;
  gap: 20px;
}

.header-link {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  background: white;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s;
  white-space: nowrap;
}

.header-link:hover {
  background: var(--brand-bg-hover);
  border-color: var(--brand);
  color: var(--brand);
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 24px;
}

.btn-tool {
  padding: 10px 20px;
  background: var(--bg-card);
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-lg);
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.btn-tool:hover {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--brand-bg-hover);
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  background: var(--text-primary);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius-lg);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.btn-primary:hover:not(:disabled) {
  background: var(--text-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--shadow-md);
}

.btn-primary:disabled {
  background: #d4d4d4;
  color: var(--text-tertiary);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: var(--radius-full);
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.content-layout {
  display: flex;
  gap: 24px;
}

.document-sidebar {
  width: 280px;
  background: white;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 16px;
  transition: all 0.3s;
  flex-shrink: 0;
}

.document-sidebar.collapsed {
  width: 0;
  padding: 0;
  border: none;
  overflow: hidden;
}

.btn-expand {
  position: fixed;
  left: 24px;
  top: 140px;
  padding: 8px 12px;
  background: white;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px var(--shadow-dropdown);
  z-index: 10;
}

.btn-expand:hover {
  border-color: var(--brand);
  background: var(--brand-bg-hover);
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.sidebar-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.btn-collapse {
  padding: 4px 8px;
  background: var(--bg-alt);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-collapse:hover {
  background: var(--border-default);
}

.sidebar-search {
  margin-bottom: 12px;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 13px;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--brand);
}

.document-list {
  max-height: calc(100vh - 300px);
  overflow-y: auto;
}

.document-item {
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.document-item:hover {
  border-color: var(--brand);
  background: var(--brand-bg-hover);
}

.document-item.active {
  border-color: var(--brand);
  background: var(--brand-bg-active);
}

.doc-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-meta {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}

.doc-actions {
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s;
}

.document-item:hover .doc-actions {
  opacity: 1;
}

.doc-actions button {
  padding: 4px 8px;
  background: white;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.doc-actions button:hover {
  border-color: var(--brand);
  background: var(--brand-bg);
}

.editor-area {
  flex: 1;
  min-width: 0;
}

.split-editor {
  display: flex;
  gap: 24px;
}

.editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.pane-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.pane-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.view-mode-toggle {
  display: flex;
  background: var(--bg-alt);
  border-radius: var(--radius-md);
  padding: 3px;
  gap: 2px;
}

.view-mode-toggle button {
  padding: 5px 14px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.view-mode-toggle button:hover {
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.05);
}

.view-mode-toggle button.active {
  background: white;
  color: var(--text-primary);
  font-weight: 600;
  box-shadow: 0 1px 3px var(--shadow-dropdown);
}

.btn-copy-doc {
  padding: 6px 12px;
  background: white;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  white-space: nowrap;
}

.btn-copy-doc:hover {
  background: var(--brand);
  border-color: var(--brand);
  color: white;
  transform: translateY(-1px);
}

.editor-container {
  position: relative;
  flex: 1;
  display: flex;
  overflow: hidden;          /* 防止子元素撑开 */
  min-width: 0;
}

.editor-textarea {
  flex: 1;
  min-height: 480px;
  max-height: 480px;
  padding: 16px 20px;
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-lg);
  font-size: 14px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace;
  line-height: 1.7;
  color: var(--text-primary);
  background: var(--bg-card);
  resize: none;
  overflow: auto;
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
  word-break: break-word;
  white-space: pre-wrap;
  min-width: 0;
}

.editor-textarea::placeholder {
  color: var(--text-quaternary);
}

.editor-textarea:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-bg);
}

.editor-textarea[readonly] {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

/* Loading遮罩样式 */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  z-index: 10;
}

.loading-content {
  text-align: center;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  margin: 0 auto 20px;
  border: 4px solid var(--border-default);
  border-top-color: var(--brand);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

.loading-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.loading-hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

/* 右侧预览区域样式 */
.editor-preview {
  flex: 1;
  min-height: 480px;
  max-height: 480px;
  padding: 16px 20px;
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-lg);
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  background: var(--bg-card);
  overflow: auto;           /* 同时处理 x/y 溢出 */
  word-break: break-word;
  min-width: 0;
}

.editor-placeholder {
  flex: 1;
  min-height: 480px;
  padding: 16px 20px;
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-quaternary);
  font-size: 14px;
  background: var(--bg-hover);
}

/* 分栏模式 */
.split-view {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 480px;
  overflow: hidden;
  min-width: 0;
}

.split-left {
  flex: 1;
  min-width: 0;
  max-width: 50%;
}

.split-right {
  flex: 1;
  min-width: 0;
  max-width: 50%;
  margin: 0;  /* 覆盖默认 margin */
}

/* Markdown样式美化 */
.editor-preview :deep(h1) {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 24px 0 16px;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--border-default);
}

.editor-preview :deep(h2) {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 20px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-light);
}

.editor-preview :deep(h3) {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 18px 0 10px;
}

.editor-preview :deep(h4),
.editor-preview :deep(h5),
.editor-preview :deep(h6) {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 16px 0 8px;
}

/* 表格样式 */
.editor-preview :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  font-size: 13px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.editor-preview :deep(thead) {
  background: var(--bg-hover);
}

.editor-preview :deep(th) {
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border-default);
  border-right: 1px solid var(--border-light);
}

.editor-preview :deep(th:last-child) {
  border-right: none;
}

.editor-preview :deep(td) {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
  border-right: 1px solid var(--border-light);
  color: var(--text-secondary);
}

.editor-preview :deep(td:last-child) {
  border-right: none;
}

.editor-preview :deep(tbody tr:last-child td) {
  border-bottom: none;
}

.editor-preview :deep(tbody tr:hover) {
  background: var(--brand-bg-hover);
}

/* 代码块样式 */
.editor-preview :deep(code) {
  background: var(--bg-alt);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 12px;
  color: #d63384;
}

.editor-preview :deep(pre) {
  background: var(--bg-hover);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  margin: 16px 0;
  overflow-x: auto;
}

.editor-preview :deep(pre code) {
  background: none;
  padding: 0;
  color: var(--text-primary);
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 列表样式 */
.editor-preview :deep(ul),
.editor-preview :deep(ol) {
  margin: 12px 0;
  padding-left: 24px;
}

.editor-preview :deep(li) {
  margin: 6px 0;
  line-height: 1.6;
  color: var(--text-secondary);
}

.editor-preview :deep(ul li) {
  list-style-type: disc;
}

.editor-preview :deep(ol li) {
  list-style-type: decimal;
}

/* 段落和文本样式 */
.editor-preview :deep(p) {
  margin: 12px 0;
  line-height: 1.7;
  color: var(--text-secondary);
}

.editor-preview :deep(strong) {
  font-weight: 600;
  color: var(--text-primary);
}

.editor-preview :deep(em) {
  font-style: italic;
}

.editor-preview :deep(blockquote) {
  border-left: 3px solid var(--brand);
  padding-left: 16px;
  margin: 16px 0;
  color: var(--text-secondary);
  font-style: italic;
}

/* Git Diff风格 - 新增内容高亮 */
.editor-preview :deep(.new-section) {
  background: rgba(34, 197, 94, 0.12);
  border-left: 3px solid var(--success-light);
  padding: 12px 16px;
  margin: 16px 0;
  border-radius: var(--radius-sm);
}

.editor-preview :deep(.new-section::before) {
  content: '+ 新增配置';
  display: inline-block;
  background: var(--success-light);
  color: white;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-xs);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-right: 20px;
}

@media (max-width: 768px) {
  .split-editor {
    flex-direction: column;
  }

  .toolbar {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}</style>
