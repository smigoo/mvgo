<!--
  RightPanel.vue —— 工作台右侧面板（P0）
  功能：文件列表 + 代码编辑器（只读）+ Tab 切换
  响应式：≥1400px 默认展开，<1400px 默认收起
-->
<template>
  <div class="right-panel" :class="{ collapsed: !panelVisible }" :style="panelStyle">
    <!-- 拖拽调整宽度手柄 -->
    <div class="resize-handle" @mousedown="startResize"></div>

    <!-- 面板头部 -->
    <div class="panel-header">
      <div class="panel-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'code' }"
          title="代码"
          @click="activeTab = 'code'"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'preview' }"
          title="预览"
          @click="activeTab = 'preview'"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'ai-chat' }"
          title="AI 代码助手 (Ctrl+Q)"
          @click="activeTab = 'ai-chat'"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'history' }"
          title="版本历史对比 (Ctrl+H)"
          @click="activeTab = 'history'"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 8v4l3 3"></path>
            <path d="M3.05 11a9 9 0 1 1 1.9 5.37"></path>
            <polyline points="1 12 3 14 5 12"></polyline>
          </svg>
        </button>
      </div>

      <!-- 组件切换 -->
      <div v-if="artifacts.length > 1" class="component-switcher">
        <select
          class="component-select"
          :value="selectedIndex"
          @change="$emit('select-artifact', Number($event.target.value))"
        >
          <option v-for="(art, i) in artifacts" :key="art.id" :value="i">
            {{ art.name || art.id.slice(-8) }}
          </option>
        </select>
      </div>

      <!-- 当前组件操作：打开 Playground / 下载整个组件 -->
      <div v-if="currentArtifact && currentArtifact.id" class="header-actions">
        <button
          class="header-action-btn"
          title="在 Playground 中打开此组件"
          @click="openPlayground"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="12" y1="18" x2="12" y2="12"></line>
            <line x1="9" y1="15" x2="15" y2="15"></line>
          </svg>
          <span>Playground</span>
        </button>
        <button
          class="header-action-btn"
          title="下载整个组件（ZIP）"
          @click="downloadComponent"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>下载</span>
        </button>
      </div>

      <button class="collapse-btn" @click="togglePanel" :title="panelVisible ? '收起面板' : '展开面板'">
        <svg v-if="panelVisible" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="11 17 6 12 11 7"></polyline>
          <polyline points="18 17 13 12 18 7"></polyline>
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="13 17 18 12 13 7"></polyline>
          <polyline points="6 17 1 12 6 7"></polyline>
        </svg>
      </button>
    </div>

    <!-- 代码 Tab：VS Code 风格左右布局 -->
    <div v-show="activeTab === 'code'" class="panel-body">
      <!-- 左侧文件树（树结构：目录可折叠） -->
      <div class="file-tree" v-if="files.length > 0">
        <div class="file-tree-header">文件</div>
        <div class="file-list">
          <div
            v-for="node in flatTree"
            :key="node.type + ':' + node.path"
            class="tree-node"
            :class="{
              'is-dir': node.type === 'dir',
              active: node.type === 'file' && selectedFile === node.path,
            }"
            :style="{ paddingLeft: (8 + node.depth * 12) + 'px' }"
            @click="node.type === 'dir' ? toggleDir(node.path) : selectFile(node.path)"
          >
            <!-- 目录节点 -->
            <template v-if="node.type === 'dir'">
              <svg class="tree-arrow" :class="{ expanded: isExpanded(node.path) }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
              <svg class="tree-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"></path>
              </svg>
              <span class="file-name">{{ node.name }}</span>
            </template>
            <!-- 文件节点 -->
            <template v-else>
              <span class="tree-arrow-spacer"></span>
              <svg v-if="isImageFile(node.path)" class="tree-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <svg v-else class="tree-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <span class="file-name">{{ node.name }}</span>
            </template>
          </div>
        </div>
      </div>

      <!-- 右侧编辑器区域 -->
      <div class="editor-area" v-if="files.length > 0">
        <!-- 标签栏 -->
        <div class="editor-tab" v-if="selectedFile">
          <span class="tab-label">{{ getFileName(selectedFile) }}</span>
          <span class="tab-close" title="关闭">×</span>
        </div>

        <!-- 代码编辑器（文本文件） -->
        <div class="editor-wrap" v-if="selectedFile && !isImageFile(selectedFile)">
          <MonacoEditor
            :model-value="selectedFileContent"
            :language="getLanguage(selectedFile)"
            :theme="isDark ? 'vs-dark' : 'vs'"
            :options="editorOptions"
            :read-only="true"
          />
        </div>

        <!-- 图片预览（二进制文件） -->
        <div class="image-preview" v-else-if="selectedFile && isImageFile(selectedFile)">
          <img :src="imageSrc" :alt="getFileName(selectedFile)" />
          <div class="image-info">{{ getFileName(selectedFile) }}</div>
        </div>

        <!-- 未选中文件提示 -->
        <div class="editor-empty" v-else>
          <span>选择文件以查看内容</span>
        </div>

        <!-- 底部操作栏 -->
        <div class="panel-footer">
          <button class="footer-btn" @click="copyCode" :disabled="isImageFile(selectedFile)" title="复制当前文件代码 (Ctrl+C)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
            </svg>
            复制
          </button>
          <button class="footer-btn" @click="downloadFile" title="下载当前文件 (Ctrl+D)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            下载
          </button>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="files.length === 0" class="empty-panel">
        <div class="empty-icon">📄</div>
        <p>暂无生成文件</p>
        <p class="hint">完成组件生成后将在此处显示代码</p>
      </div>
    </div>

    <!-- 预览 Tab：复用成熟的 /preview/:componentId 运行时预览（快照源 / workspace 源由 preview-resolver 统一装配） -->
    <div v-show="activeTab === 'preview'" class="panel-body preview-panel">
      <div v-if="!previewUrl" class="empty-panel">
        <div class="empty-icon">👁️</div>
        <p>暂无可预览的组件</p>
        <p class="hint">完成组件生成后将在此处显示实时预览</p>
      </div>

      <div v-else class="preview-container">
        <!-- 加载状态（iframe 首次加载前展示） -->
        <div v-if="previewLoading" class="preview-loading">
          <div class="loading-spinner"></div>
          <p>正在加载组件预览...</p>
        </div>

        <!-- 预览 iframe：加载成熟预览页，组件加载/错误反馈由预览页自身承接 -->
        <iframe
          v-show="!previewLoading"
          :key="previewReloadKey"
          :src="previewUrl"
          class="preview-iframe"
          sandbox="allow-scripts allow-same-origin allow-popups"
          @load="onPreviewFrameLoad"
        ></iframe>
      </div>
    </div>

    <!-- AI 对话 Tab（P2：与 AI 对话联动） -->
    <div v-show="activeTab === 'ai-chat'" class="panel-body ai-chat-panel">
      <div class="chat-messages">
        <div v-if="chatMessages.length === 0" class="chat-empty">
          <div class="chat-empty-icon">🤖</div>
          <p>AI 代码助手</p>
          <p class="chat-hint">选中文件后，可让 AI 解释或直接修改组件代码</p>
        </div>
        <div v-for="(msg, idx) in chatMessages" :key="idx" class="chat-message" :class="msg.role">
          <div class="msg-avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
          <div class="msg-content">
            <div class="msg-bubble" :class="{ 'msg-error': msg.isError }">{{ msg.content }}</div>
            <div class="msg-time">{{ formatTime(msg.timestamp) }}</div>
          </div>
        </div>
      </div>
      <div class="chat-input-area">
        <!-- 上下文文件 chip：默认附带当前选中文件，点击切换 -->
        <div
          v-if="selectedFile && !isImageFile(selectedFile)"
          class="chat-context-chip"
          :class="{ off: !chatUseFileContext }"
          :title="chatUseFileContext ? '点击移除该文件上下文' : '点击附带该文件上下文'"
          @click="chatUseFileContext = !chatUseFileContext"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <span>{{ getFileName(selectedFile) }}</span>
          <span class="chip-state">{{ chatUseFileContext ? '✕' : '+' }}</span>
        </div>
        <textarea
          v-model="chatInput"
          class="chat-input"
          placeholder="输入修改需求，例如：把标题文字改小一些 / 去掉某段文字..."
          @keydown.enter.exact="onEnterSend"
          @compositionstart="chatComposing = true"
          @compositionend="chatComposing = false"
          rows="2"
        ></textarea>
        <button class="chat-send-btn" @click="sendChatMessage" :disabled="!chatInput.trim() || chatLoading">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
          </svg>
        </button>
      </div>
    </div>
    <!-- 版本历史对比 Tab（P2-9） -->
    <div v-show="activeTab === 'history'" class="panel-body history-panel">
      <!-- 版本数量不足时提示 -->
      <div v-if="artifacts.length < 2" class="empty-panel">
        <div class="empty-icon">📋</div>
        <p>暂无历史版本可对比</p>
        <p class="hint">至少需要 2 个版本才能进行对比</p>
      </div>
      
      <div v-else class="history-container">
        <!-- 版本选择器 -->
        <div class="version-selector">
          <div class="version-select-group">
            <label>基准版本</label>
            <select v-model.number="diffOldIndex" class="version-select">
              <option v-for="(art, i) in artifacts" :key="`old-${art.id}`" :value="i">
                V{{ i + 1 }} {{ art.name || art.id.slice(-8) }}
              </option>
            </select>
          </div>
          <span class="version-arrow">→</span>
          <div class="version-select-group">
            <label>对比版本</label>
            <select v-model.number="diffNewIndex" class="version-select">
              <option v-for="(art, i) in artifacts" :key="`new-${art.id}`" :value="i">
                V{{ i + 1 }} {{ art.name || art.id.slice(-8) }}
              </option>
            </select>
          </div>
        </div>
        
        <!-- 文件列表（显示变更量） -->
        <div class="diff-file-selector" v-if="diffFiles.length > 0">
          <div
            v-for="file in diffFiles"
            :key="file.path"
            class="diff-file-item"
            :class="{ active: diffSelectedFile === file.path }"
            @click="selectDiffFile(file.path)"
          >
            <svg v-if="isImageFile(file.path)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <span class="file-name">{{ getFileName(file.path) }}</span>
            <span v-if="file.status === 'added'" class="diff-badge added">+{{ file.added }}</span>
            <span v-else-if="file.status === 'removed'" class="diff-badge removed">-{{ file.removed }}</span>
            <span v-else-if="file.diffLines > 0" class="diff-badge modified">+{{ file.added }} -{{ file.removed }}</span>
            <span v-else class="diff-badge unchanged">0</span>
          </div>
        </div>
        
        <!-- Diff 视图 -->
        <div class="diff-view" v-if="diffSelectedFile && diffResult.length > 0">
          <div class="diff-stats">
            <span class="stat-added">+{{ diffStats.added }}</span>
            <span class="stat-removed">-{{ diffStats.removed }}</span>
          </div>
          <div class="diff-content">
            <div
              v-for="(line, idx) in diffResult"
              :key="idx"
              class="diff-line"
              :class="line.type"
            >
              <span class="diff-line-num">{{ line.oldNum }}</span>
              <span class="diff-line-num">{{ line.newNum }}</span>
              <span class="diff-line-sign">{{ line.sign }}</span>
              <pre class="diff-line-text">{{ line.content }}</pre>
            </div>
          </div>
        </div>
        
        <!-- 无变更文件提示 -->
        <div class="diff-empty" v-else-if="diffFiles.length > 0 && diffSelectedFile">
          <span>该文件无变更</span>
        </div>
        
        <!-- 未选中文件提示 -->
        <div class="diff-empty" v-else-if="diffFiles.length > 0">
          <span>选择文件以查看差异</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 快捷键提示 Toast -->
  <Transition name="toast-fade">
    <div class="shortcut-toast" v-if="showShortcutToast">
      <span class="shortcut-icon">✓</span>
      <span>{{ shortcutToastText }}</span>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import MonacoEditor from '@/components/MonacoEditor.vue';
import { useTheme } from '@/composables/useTheme';
import { downloadByUrl } from '@/utils/download-file';
import { resolveComponentType } from '@/utils/task-actions';
import { buildPreviewUrl, resolvePreviewDescriptor } from '@/utils/preview-resolver';
import http from '@/core/http';

const props = defineProps({
  visible: { type: Boolean, default: false },
  files: { type: Array, default: () => [] },
  // 文件格式：{ path: 'index.vue', content: '...' }
  artifacts: { type: Array, default: () => [] },
  selectedIndex: { type: Number, default: 0 },
});

const emit = defineEmits(['update:visible', 'resize', 'select-artifact', 'refresh']);

const router = useRouter();
const { isDark } = useTheme();

const activeTab = ref('code');
const selectedFile = ref('');
const panelWidth = ref(480);
let isResizing = false;
let startX = 0;
let startWidth = 0;

// 预览状态：复用成熟 /preview/:componentId 页面（iframe 运行时预览）
const previewLoading = ref(false);

// P2：键盘快捷键 & AI 对话
const chatMessages = ref([]);
const chatInput = ref('');
const chatLoading = ref(false);
// 是否把当前选中文件作为上下文发给 AI（输入框上方 chip 可切换）
const chatUseFileContext = ref(true);
// 中文输入法组合态标记：组合期间按回车（确认候选词）不应触发发送
const chatComposing = ref(false);
const showShortcutToast = ref(false);
const shortcutToastText = ref('');

// P2-9：版本历史对比
const diffOldIndex = ref(0);
const diffNewIndex = ref(1);
const diffFiles = ref([]);
const diffSelectedFile = ref('');
const diffResult = ref([]);
const diffStats = ref({ added: 0, removed: 0 });

function showToast(text) {
  shortcutToastText.value = text;
  showShortcutToast.value = true;
  setTimeout(() => { showShortcutToast.value = false; }, 2000);
}

function formatTime(date) {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// 回车发送（Enter 非 shift）：中文输入法组合期间回车是「确认候选词」，不应触发发送。
function onEnterSend(e) {
  if (e.isComposing || chatComposing.value) return;
  e.preventDefault();
  sendChatMessage();
}

// 发送 AI 对话消息：对接后端 Playground Agent（/api/demo/ai-chat/stream，SSE 流式）。
// AI 可直接读取并修改 workspace 中的组件代码（write_file），修改完成后通知父组件刷新文件。
async function sendChatMessage() {
  const question = chatInput.value.trim();
  if (!question || chatLoading.value) return;

  const art = currentArtifact.value;
  if (!art?.id) {
    chatMessages.value.push({
      role: 'assistant',
      content: '当前没有选中的组件，请先生成或选择一个组件。',
      isError: true,
      timestamp: new Date(),
    });
    return;
  }

  chatMessages.value.push({ role: 'user', content: question, timestamp: new Date() });
  chatInput.value = '';
  chatLoading.value = true;

  // 上下文：当前选中文件（含内容），可通过 chip 关闭
  const selectedFiles = [];
  if (chatUseFileContext.value && selectedFile.value && !isImageFile(selectedFile.value)) {
    const file = props.files.find((f) => f.path === selectedFile.value);
    if (file) {
      selectedFiles.push({
        path: file.path,
        name: getFileName(file.path),
        content: file.content || '',
      });
    }
  }

  // 流式占位消息（通过数组索引经 reactive proxy 更新，保证流式刷新）
  chatMessages.value.push({ role: 'assistant', content: '正在分析您的请求...', timestamp: new Date() });
  const streamIdx = chatMessages.value.length - 1;
  const setStream = (text) => { chatMessages.value[streamIdx].content = text; };

  try {
    // 读取全局 LLM 配置（与 Playground 一致），后端 Playground Agent 依赖 llmConfig 调用文本模型
    const { useConfigStore } = await import('@/stores/config');
    const configStore = useConfigStore();
    const globalConfig = configStore.config || {};
    const llmConfig = {
      apiKey: globalConfig.textApiKey || globalConfig.aiApiKey || undefined,
      baseURL: globalConfig.textBaseURL || globalConfig.aiBaseURL || undefined,
      model: globalConfig.textModel || globalConfig.aiModel || undefined,
    };

    // 未配置文本模型时直接给出友好提示，避免后端抛「API Key 未配置」
    if (!llmConfig.apiKey) {
      setStream('未配置文本模型。请先在「AI 设置」中配置文本模型（API Key / Base URL / Model），或设置环境变量 TEXT_API_KEY。');
      chatMessages.value[streamIdx].isError = true;
      return;
    }

    const response = await http.stream('/api/demo/ai-chat/stream', {
      message: question,
      componentId: art.id,
      selectedFiles,
      history: chatMessages.value
        .slice(0, streamIdx)
        .slice(-20)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
      llmConfig,
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalContent = '';
    let toolBusy = '';
    let modifiedFiles = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.name && ev.args) {
            // tool_call 事件
            toolBusy = `🔧 正在调用 ${ev.name}...`;
            setStream(toolBusy);
          } else if (ev.type === 'done') {
            // 结束事件：最终回复 + 修改文件清单
            finalContent = typeof ev.content === 'string' ? ev.content : finalContent;
            modifiedFiles = Array.isArray(ev.modifiedFiles) ? ev.modifiedFiles : [];
          } else if (typeof ev.content === 'string') {
            finalContent = ev.content;
          } else if (ev.message) {
            // status / error 事件
            setStream(ev.message);
          }
        } catch {}
      }
    }

    let text = finalContent || '处理完成';
    if (modifiedFiles.length > 0) {
      text += `\n\n✅ 已修改 ${modifiedFiles.length} 个文件：${modifiedFiles.join('、')}`;
      // AI 已写盘：清 Vite 缓存 + 强制预览重载 + 通知父组件重载代码文件
      await reloadPreviewAfterAiEdit();
      emit('refresh');
    }
    setStream(text);
  } catch (err) {
    setStream(`请求失败：${err?.message || '未知错误'}`);
    chatMessages.value[streamIdx].isError = true;
  } finally {
    chatLoading.value = false;
  }
}

const panelVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
});

const selectedFileContent = computed(() => {
  const file = props.files.find(f => f.path === selectedFile.value);
  if (!file) return '';
  
  // 图片文件不走文本 content（由 imageSrc 走 raw 二进制接口预览）
  if (isImageFile(file.path)) {
    return '';
  }
  
  return file.content ?? '';
});

// 当前选中产物的来源与 revision（用于拼接 raw 图片 URL）
const currentArtifact = computed(() => {
  const idx = props.selectedIndex;
  if (idx < 0 || idx >= props.artifacts.length) return null;
  return props.artifacts[idx];
});

// 打开当前组件 Playground（微码 / Vue3 组件统一走 /demo/:componentId）
function openPlayground() {
  const art = currentArtifact.value;
  if (!art?.id) return;
  const query = {};
  if (art.source === 'task') {
    // 任务快照：带 taskId 让 demo 页按快照 revision 加载
    query.taskId = art.id;
    if (art.revision) query.revision = art.revision;
  }
  const type = resolveComponentType(art.id);
  if (type) query.type = type;
  router.push({ path: `/demo/${encodeURIComponent(art.id)}`, query });
}

// 下载整个组件 ZIP（带 token 走 downloadByUrl，兼容生产 SessionGuard）
function downloadComponent() {
  const art = currentArtifact.value;
  if (!art?.id) return;
  const name = `${art.name || art.id}.zip`;
  downloadByUrl(`/api/component/download/${encodeURIComponent(art.id)}`, name);
}

// 图片 src：直接指向后端 raw 二进制接口（浏览器原生带 cookie 加载）
const imageSrc = computed(() => {
  if (!selectedFile.value || !isImageFile(selectedFile.value)) return '';
  // 已有 content 且是 data URL / http / blob 时直接复用
  const file = props.files.find(f => f.path === selectedFile.value);
  if (file?.content && (
    file.content.startsWith('data:') ||
    file.content.startsWith('http') ||
    file.content.startsWith('blob:')
  )) {
    return file.content;
  }

  // 否则直接指向后端 raw 二进制接口
  const art = currentArtifact.value;
  if (!art?.id) return '';
  const path = encodeURIComponent(selectedFile.value);
  if (art.source === 'task') {
    if (!art.revision) return '';
    return `/api/tasks/${encodeURIComponent(art.id)}/code-snapshots/${art.revision}/file?path=${path}`;
  }
  return `/api/component/${encodeURIComponent(art.id)}/file?path=${path}&raw=1`;
});

const panelStyle = computed(() => ({
  width: panelWidth.value + 'px',
}));

const editorOptions = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 12,
  lineHeight: 19,
  fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', Menlo, Consolas, 'Courier New', monospace",
  fontLigatures: true,
  lineNumbers: 'on',
  lineNumbersMinChars: 4,
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  renderWhitespace: 'none',
  padding: { top: 10, bottom: 10 },
  scrollbar: {
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
  },
};

// 文件扩展名 → Monaco 语言
const langMap = {
  '.vue': 'vue',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.jsx': 'javascript',
  '.tsx': 'typescript',
  '.less': 'less',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.json': 'json',
  '.md': 'markdown',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

function getLanguage(path) {
  const ext = path.substring(path.lastIndexOf('.'));
  return langMap[ext] || 'plaintext';
}

function getFileName(path) {
  return path.split('/').pop();
}

// ===== 文件树结构（目录层级 + 折叠展开）=====
const expandedDirs = ref(new Set());

// 按 path 的 / 拆分构建目录树（叶子=文件，中间=目录）
const fileTree = computed(() => {
  const root = [];
  for (const file of props.files) {
    const parts = (file.path || '').split('/').filter(Boolean);
    if (parts.length === 0) continue;
    let level = root;
    let accPath = '';
    parts.forEach((part, i) => {
      accPath = accPath ? `${accPath}/${part}` : part;
      const isLast = i === parts.length - 1;
      const type = isLast ? 'file' : 'dir';
      let node = level.find((n) => n.name === part && n.type === type);
      if (!node) {
        node = { name: part, path: accPath, type, children: [] };
        level.push(node);
      }
      if (!isLast) level = node.children;
    });
  }
  return root;
});

// 文件列表首次到达时默认展开全部目录（能看到完整层级）
watch(fileTree, (tree) => {
  const set = new Set();
  const collect = (nodes) => {
    for (const node of nodes) {
      if (node.type === 'dir') {
        set.add(node.path);
        collect(node.children);
      }
    }
  };
  collect(tree);
  expandedDirs.value = set;
}, { immediate: true });

// 扁平化渲染列表：折叠的目录不输出其子节点
const flatTree = computed(() => {
  const out = [];
  const walk = (nodes, depth) => {
    for (const node of nodes) {
      out.push({ ...node, depth });
      if (node.type === 'dir' && expandedDirs.value.has(node.path)) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(fileTree.value, 0);
  return out;
});

function isExpanded(path) {
  return expandedDirs.value.has(path);
}

function toggleDir(path) {
  const set = new Set(expandedDirs.value);
  if (set.has(path)) set.delete(path);
  else set.add(path);
  expandedDirs.value = set;
}

// 判断是否为图片文件
const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
function isImageFile(path) {
  if (!path) return false;
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
  return imageExtensions.includes(ext);
}

function selectFile(path) {
  selectedFile.value = path;
}

// 默认选中文件：优先组件入口（package/index.vue > index.vue > component.js）。
// 后端 getComponentFiles 返回的文件列表里 _figma-size.json 等元数据 JSON 常排在首位，
// 若按 files[0] 默认选中，代码编辑器会先展示 JSON 元数据（用户误以为是预览内容）。
function pickDefaultFile(files) {
  if (!files || files.length === 0) return '';
  const prefer = ['package/index.vue', 'index.vue', 'component.js', 'component.ts'];
  for (const p of prefer) {
    const hit = files.find((f) => f.path === p);
    if (hit) return hit.path;
  }
  return files[0].path;
}

function togglePanel() {
  panelVisible.value = !panelVisible.value;
}

function copyCode() {
  if (!selectedFileContent.value) return;
  navigator.clipboard.writeText(selectedFileContent.value).then(() => {
    // TODO: 显示 toast 提示
    console.log('代码已复制到剪贴板');
  }).catch(err => {
    console.error('复制失败:', err);
  });
}

function downloadFile() {
  if (!selectedFileContent.value) return;
  const blob = new Blob([selectedFileContent.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getFileName(selectedFile.value);
  a.click();
  URL.revokeObjectURL(url);
}

// 拖拽调整宽度
function startResize(e) {
  isResizing = true;
  startX = e.clientX;
  startWidth = panelWidth.value;
  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', stopResize);
  e.preventDefault();
}

function onResize(e) {
  if (!isResizing) return;
  const delta = startX - e.clientX;
  const newWidth = Math.max(320, Math.min(800, startWidth + delta));
  panelWidth.value = newWidth;
  emit('resize', newWidth);
}

function stopResize() {
  isResizing = false;
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
}

// 文件列表到达/变化时默认选中组件入口（避免展示 _figma-size.json 等元数据 JSON）
watch(() => props.files, (newFiles) => {
  if (newFiles && newFiles.length > 0) {
    selectedFile.value = pickDefaultFile(newFiles);
  }
}, { immediate: true });

// 切换对话/组件时清空选中
watch(() => props.files.length, () => {
  if (props.files.length === 0) {
    selectedFile.value = '';
  }
});

// 切换组件时无需单独处理：files watcher（上）监听 files 变化会统一重选默认入口。
// 若这里再写 selectedFile='' 会因 watcher 声明顺序靠后而覆盖 files watcher 已选中的入口。

// P2-9：版本历史对比 —— 统一 diff 计算
function computeDiff() {
  if (diffOldIndex.value === diffNewIndex.value || artifacts.length < 2) {
    diffFiles.value = [];
    diffResult.value = [];
    diffStats.value = { added: 0, removed: 0 };
    return;
  }

  const oldArt = artifacts[diffOldIndex.value] || {};
  const newArt = artifacts[diffNewIndex.value] || {};
  const oldFilesMap = {};
  const newFilesMap = {};
  (oldArt.files || []).forEach(f => { oldFilesMap[f.path] = f.content || ''; });
  (newArt.files || []).forEach(f => { newFilesMap[f.path] = f.content || ''; });

  const allPaths = [...new Set([...Object.keys(oldFilesMap), ...Object.keys(newFilesMap)])];
  const fileDiffs = [];

  allPaths.forEach(path => {
    const oldContent = oldFilesMap[path] ?? null;
    const newContent = newFilesMap[path] ?? null;
    let status = 'modified';
    if (oldContent === null) status = 'added';
    else if (newContent === null) status = 'removed';

    const oldText = oldContent || '';
    const newText = newContent || '';
    const diffLines = computeLineDiff(oldText, newText);
    const added = diffLines.filter(l => l.type === 'added').length;
    const removed = diffLines.filter(l => l.type === 'removed').length;
    fileDiffs.push({ path, status, diffLines, added, removed });
  });

  diffFiles.value = fileDiffs.sort((a, b) => {
    const order = { added: 0, removed: 1, modified: 2, unchanged: 3 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });
  diffSelectedFile.value = diffFiles.value[0]?.path || '';
}

function computeLineDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result = [];
  let added = 0;
  let removed = 0;

  // 简单行级 diff（类 LCS）
  const m = oldLines.length;
  const n = newLines.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯得到 diff 行
  let i = m;
  let j = n;
  const tempResult = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      tempResult.push({ type: 'unchanged', oldNum: i, newNum: j, sign: ' ', content: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tempResult.push({ type: 'added', oldNum: '', newNum: j, sign: '+', content: newLines[j - 1] });
      added++;
      j--;
    } else if (i > 0) {
      tempResult.push({ type: 'removed', oldNum: i, newNum: '', sign: '-', content: oldLines[i - 1] });
      removed++;
      i--;
    }
  }
  result.push(...tempResult.reverse());
  return result;
}

function selectDiffFile(path) {
  diffSelectedFile.value = path;
  const file = diffFiles.value.find(f => f.path === path);
  if (!file || file.diffLines.length === 0) {
    diffResult.value = [];
    return;
  }
  diffResult.value = file.diffLines;
  diffStats.value = { added: file.added, removed: file.removed };
}

// P2-9：监听版本变化自动计算 diff
watch([diffOldIndex, diffNewIndex], () => {
  computeDiff();
});

// 切换到历史 Tab 时自动计算
watch(activeTab, (tab) => {
  if (tab === 'history' && artifacts.length >= 2) {
    computeDiff();
  }
});

// 判定组件类型（单一事实源）：
// sessionId 形态（mc-/mv-）按前缀；语义化 componentId（c-xxx）按文件结构区分微码/vue3。
function resolveArtifactType(art) {
  const byId = resolveComponentType(art?.id);
  if (byId) return byId;
  const files = art?.files || [];
  const hasDeclare = files.some(
    (f) => f.path === 'declare.json' || f.path === 'declare.js' || (f.path || '').startsWith('resources/')
  );
  if (hasDeclare) return 'microcode';
  const hasIndexVue = files.some((f) => f.path === 'package/index.vue' || f.path === 'index.vue');
  if (hasIndexVue) return 'vue3';
  return 'microcode';
}

// 预览 URL：复用 /preview/:componentId 运行时预览页。
// task 源带 revision 走快照源（/api/tasks/:sid/code-snapshots/:rev/file）；
// registered 源不带 revision 走 workspace 源（frontend/workspace/<custom|vue3>-components/<id>）。
// previewReloadKey 作为 _t cacheKey：AI 修改落盘后递增，强制 iframe 重载拿到新代码。
const previewReloadKey = ref(0);
const previewUrl = computed(() => {
  const art = currentArtifact.value;
  if (!art?.id) return '';
  const type = resolveArtifactType(art);
  const descriptor = resolvePreviewDescriptor(
    {
      componentId: art.id,
      sessionId: art.id,
      groupId: 'default-group',
      target: type,
      taskType: type,
      artifactReady: true,
    },
    art.source === 'task' && art.revision
      ? { candidate: { revision: art.revision, status: 'candidate' } }
      : {},
    type,
  );
  return buildPreviewUrl(descriptor, { cacheKey: previewReloadKey.value });
});

function onPreviewFrameLoad() {
  previewLoading.value = false;
}

// AI 修改落盘后的预览刷新（与 Playground reloadAllFiles 同一链路）：
// 1. /__invalidate（vite.config.js dev 中间件）清 Vite transform 缓存 —— workspace 目录被
//    Vite watch 忽略，不清缓存的话 iframe 重载后 import.meta.glob 仍返回旧模块；
// 2. previewReloadKey++ → 预览 URL 带 _t + iframe :key 重挂载，强制重新加载。
async function reloadPreviewAfterAiEdit() {
  try {
    await fetch('/__invalidate', { method: 'GET' });
  } catch {}
  previewReloadKey.value++;
}

// URL 变化（切换组件/产物）时重置加载态，切换期间展示 loading，待 iframe 加载完成再显示
watch(previewUrl, (url) => {
  previewLoading.value = !!url;
});

// P2：键盘快捷键处理
function handleKeyboardShortcut(e) {
  // Ctrl/Cmd + Q: 切换到 AI 对话
  if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
    e.preventDefault();
    activeTab.value = 'ai-chat';
    showToast('已切换到 AI 助手');
  }
  // Ctrl/Cmd + E: 切换到代码编辑
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
    e.preventDefault();
    activeTab.value = 'code';
    showToast('已切换到代码视图');
  }
  // Ctrl/Cmd + P: 切换到预览
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
    e.preventDefault();
    activeTab.value = 'preview';
    showToast('已切换到预览');
  }
  // Ctrl/Cmd + C (非 Monaco 编辑器内): 复制当前文件
  if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !isImageFile(selectedFile.value)) {
    // 检查焦点是否在 Monaco 编辑器内（避免拦截编辑器的复制）
    const activeEl = document.activeElement;
    const isInEditor = activeEl?.closest('.monaco-editor') || activeEl?.tagName === 'TEXTAREA' || activeEl?.tagName === 'INPUT';
    if (!isInEditor && selectedFileContent.value) {
      e.preventDefault();
      copyCode();
      showToast('代码已复制');
    }
  }
  // Ctrl/Cmd + D: 下载当前文件
  if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    e.preventDefault();
    downloadFile();
    showToast('文件已开始下载');
  }
  // Ctrl/Cmd + 1/2/3: 快速切换文件
  if ((e.ctrlKey || e.metaKey) && ['1', '2', '3'].includes(e.key)) {
    const idx = parseInt(e.key) - 1;
    if (props.files[idx]) {
      e.preventDefault();
      selectFile(props.files[idx].path);
      showToast(`已切换到 ${getFileName(props.files[idx].path)}`);
    }
  }
  // Escape: 收起面板
  if (e.key === 'Escape' && panelVisible.value) {
    togglePanel();
  }
}

onMounted(() => {
  // 检查屏幕宽度，≥1400px 默认展开
  if (window.innerWidth >= 1400) {
    panelVisible.value = true;
  }
  // P2：注册键盘快捷键
  window.addEventListener('keydown', handleKeyboardShortcut);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
  window.removeEventListener('keydown', handleKeyboardShortcut);
});
</script>

<style scoped lang="less">
.right-panel {
  display: flex;
  flex-direction: column;
  background: var(--wb-surface);
  border-left: 1px solid var(--wb-border);
  transition: width 0.2s ease, opacity 0.2s ease;
  position: relative;
  overflow: hidden;

  &.collapsed {
    width: 0 !important;
    border-left: none;
    opacity: 0;
    pointer-events: none;
  }

  .resize-handle {
    position: absolute;
    left: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    z-index: 10;
    background: transparent;

    &:hover {
      background: var(--wb-primary);
      opacity: 0.3;
    }
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 40px;
  border-bottom: 1px solid var(--wb-border);
  flex-shrink: 0;
  gap: 8px;

  .panel-tabs {
    display: flex;
    gap: 0;

    .tab-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px 10px;
      border: none;
      background: transparent;
      color: var(--wb-text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s;

      &:hover {
        color: var(--wb-text);
      }

      &.active {
        color: var(--wb-primary);
        border-bottom-color: var(--wb-primary);
      }
    }
  }

  .component-switcher {
    flex-shrink: 0;
    
    .component-select {
      max-width: 140px;
      padding: 4px 8px;
      border: 1px solid var(--wb-border);
      border-radius: 4px;
      background: var(--wb-surface-alt);
      color: var(--wb-text);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        border-color: var(--wb-primary);
      }
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;

    .header-action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 26px;
      padding: 0 10px;
      border: none;
      background: #1a1a2e;
      color: #fff;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.15s;

      &:hover {
        background: #2a2a45;
        color: #fff;
      }

      &:active {
        filter: brightness(0.9);
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }
  }

  .collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: var(--wb-text-secondary);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;

    &:hover {
      background: var(--wb-surface-alt);
      color: var(--wb-text);
    }
  }
}

.panel-body {
  flex: 1;
  display: flex;
  flex-direction: row; // 左右布局
  overflow: hidden;
  min-height: 0;
}

// 左侧文件树
.file-tree {
  width: 180px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--wb-border);
  background: var(--wb-surface-alt);
  overflow: hidden;

  .file-tree-header {
    padding: 10px 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--wb-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--wb-border);
    flex-shrink: 0;
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px 0;
  }

  .tree-node {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    cursor: pointer;
    font-size: 12px;
    color: var(--wb-text-secondary);
    transition: background 0.1s;
    white-space: nowrap;
    user-select: none;

    &:hover {
      background: var(--wb-surface);
      color: var(--wb-text);
    }

    &.active {
      background: var(--wb-primary-light);
      color: var(--wb-primary);
      font-weight: 500;
    }

    &.is-dir {
      font-weight: 500;
      color: var(--wb-text);
    }

    .tree-arrow {
      flex-shrink: 0;
      transition: transform 0.15s;
      color: var(--wb-text-muted);

      &.expanded {
        transform: rotate(90deg);
      }
    }

    .tree-arrow-spacer {
      width: 12px;
      flex-shrink: 0;
    }

    .tree-icon {
      flex-shrink: 0;
      color: var(--wb-text-muted);
    }

    &.active .tree-icon {
      color: var(--wb-primary);
    }

    .file-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

// 右侧编辑器区域
.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.editor-tab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 32px;
  background: var(--wb-surface-alt);
  border-bottom: 1px solid var(--wb-border);
  flex-shrink: 0;

  .tab-label {
    font-size: 12px;
    color: var(--wb-text);
    font-weight: 500;
  }

  .tab-close {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: var(--wb-text-muted);
    cursor: pointer;
    border-radius: 3px;
    transition: all 0.15s;

    &:hover {
      background: var(--wb-surface);
      color: var(--wb-text);
    }
  }
}

.editor-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

// 图片预览
.image-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--wb-bg);
  overflow: auto;

  img {
    max-width: 100%;
    max-height: calc(100% - 30px);
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .image-info {
    margin-top: 12px;
    font-size: 12px;
    color: var(--wb-text-secondary);
  }
}

// 编辑器空状态
.editor-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--wb-text-muted);
  font-size: 13px;
}

.panel-footer {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--wb-border);
  flex-shrink: 0;

  .footer-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--wb-border);
    border-radius: 4px;
    background: var(--wb-surface-alt);
    color: var(--wb-text-secondary);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      border-color: var(--wb-primary);
      color: var(--wb-primary);
    }
  }
}

.empty-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--wb-text-muted);
  text-align: center;
  padding: 24px;

  .empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }

  p {
    margin: 0;
    font-size: 13px;
  }

  .hint {
    margin-top: 8px;
    font-size: 12px;
    color: var(--wb-text-muted);
  }
}

.preview-panel {
  background: var(--wb-bg);
}

.preview-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.preview-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  color: var(--wb-text-muted);

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--wb-border);
    border-top-color: var(--wb-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 12px;
  }

  p {
    margin: 0;
    font-size: 13px;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.preview-iframe {
  flex: 1;
  width: 100%;
  border: none;
  background: white;
}

// P2：AI 对话面板
.ai-chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  background: var(--wb-bg);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--wb-text-muted);

  .chat-empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }

  p {
    margin: 0;
    font-size: 13px;
  }

  .chat-hint {
    margin-top: 8px;
    font-size: 12px;
    color: var(--wb-text-muted);
  }
}

.chat-message {
  display: flex;
  gap: 8px;
  align-items: flex-start;

  &.user {
    flex-direction: row-reverse;

    .msg-bubble {
      background: var(--wb-primary);
      color: white;
      border-bottom-right-radius: 4px;
    }
  }

  .msg-avatar {
    font-size: 20px;
    flex-shrink: 0;
  }

  .msg-content {
    max-width: 85%;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .msg-bubble {
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--wb-surface);
    color: var(--wb-text);
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    border: 1px solid var(--wb-border);

    &.loading {
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  .msg-time {
    font-size: 11px;
    color: var(--wb-text-muted);
    padding: 0 4px;
  }
}

// AI 回复错误态
.msg-bubble.msg-error {
  border-color: var(--wb-danger);
  color: var(--wb-danger);
  background: var(--wb-danger-bg);
}

.chat-input-area {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--wb-border);
  background: var(--wb-surface);
  align-items: flex-end;
}

// 上下文文件 chip：独占一行，显示当前将随消息发给 AI 的文件
.chat-context-chip {
  flex-basis: 100%;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  cursor: pointer;
  user-select: none;
  background: var(--wb-primary-light);
  color: var(--wb-primary);
  border: 1px solid var(--wb-primary);

  .file-name,
  span:not(.chip-state) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-state {
    flex-shrink: 0;
    opacity: 0.7;
  }

  &.off {
    background: transparent;
    color: var(--wb-text-muted);
    border-color: var(--wb-border);
    text-decoration: line-through;
  }
}

.chat-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--wb-border);
  border-radius: 8px;
  background: var(--wb-surface-alt);
  color: var(--wb-text);
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;

  &:focus {
    border-color: var(--wb-primary);
  }

  &::placeholder {
    color: var(--wb-text-muted);
  }
}

.chat-send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: var(--wb-primary);
  color: white;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// P2：快捷键提示 Toast
.shortcut-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: var(--wb-surface);
  border: 1px solid var(--wb-border);
  border-radius: 8px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--wb-text);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  opacity: 0;
  pointer-events: none;
  transition: all 0.2s ease;
  z-index: 1000;

  &.visible {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  .shortcut-icon {
    font-size: 16px;
  }
}

// P2-9：版本历史对比面板
.history-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--wb-bg);
}

.history-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.version-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid var(--wb-border);
  background: var(--wb-surface-alt);
  flex-shrink: 0;

  .version-select-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;

    label {
      font-size: 11px;
      color: var(--wb-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .version-select {
      padding: 6px 8px;
      border: 1px solid var(--wb-border);
      border-radius: 4px;
      background: var(--wb-surface);
      color: var(--wb-text);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        border-color: var(--wb-primary);
      }

      &:focus {
        outline: none;
        border-color: var(--wb-primary);
      }
    }
  }

  .version-arrow {
    font-size: 16px;
    color: var(--wb-primary);
    flex-shrink: 0;
  }
}

.diff-file-selector {
  padding: 8px;
  overflow-y: auto;
  border-bottom: 1px solid var(--wb-border);
  flex-shrink: 0;
  max-height: 160px;

  .diff-file-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    color: var(--wb-text-secondary);
    transition: all 0.15s;

    &:hover {
      background: var(--wb-surface);
      color: var(--wb-text);
    }

    &.active {
      background: var(--wb-primary-light);
      color: var(--wb-primary);
      font-weight: 500;
    }

    .file-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .diff-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      font-weight: 600;

      &.added {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }

      &.removed {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      &.modified {
        background: rgba(59, 130, 246, 0.15);
        color: #3b82f6;
      }

      &.unchanged {
        background: var(--wb-surface-alt);
        color: var(--wb-text-muted);
      }
    }
  }
}

.diff-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;

  .diff-stats {
    padding: 8px 12px;
    border-bottom: 1px solid var(--wb-border);
    background: var(--wb-surface-alt);
    font-size: 12px;
    font-weight: 500;
    flex-shrink: 0;

    .stat-added {
      color: #22c55e;
      margin-right: 12px;
    }

    .stat-removed {
      color: #ef4444;
    }
  }

  .diff-content {
    flex: 1;
    overflow: auto;
    font-family: 'Fira Code', 'Cascadia Code', 'SF Mono', 'Consolas', monospace;
    font-size: 12px;
    line-height: 1.5;
  }

  .diff-line {
    display: flex;
    align-items: baseline;
    padding: 0 12px;
    border-left: 3px solid transparent;

    &.unchanged {
      background: var(--wb-surface);
      color: var(--wb-text-secondary);

      .diff-line-sign {
        color: var(--wb-text-muted);
      }
    }

    &.added {
      background: rgba(34, 197, 94, 0.08);
      border-left-color: #22c55e;

      .diff-line-sign {
        color: #22c55e;
      }

      .diff-line-text {
        color: #16a34a;
      }
    }

    &.removed {
      background: rgba(239, 68, 68, 0.08);
      border-left-color: #ef4444;

      .diff-line-sign {
        color: #ef4444;
      }

      .diff-line-text {
        color: #dc2626;
      }
    }

    .diff-line-num {
      width: 40px;
      flex-shrink: 0;
      text-align: right;
      color: var(--wb-text-muted);
      user-select: none;
      font-size: 10px;
    }

    .diff-line-sign {
      width: 16px;
      flex-shrink: 0;
      text-align: center;
      font-weight: 600;
      margin-left: 8px;
    }

    .diff-line-text {
      flex: 1;
      white-space: pre;
      overflow-x: auto;
      margin-left: 8px;
    }
  }
}

.diff-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--wb-text-muted);
  font-size: 13px;
}
</style>
