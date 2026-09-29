<template>
  <div class="workbench-container" :data-theme="theme">
    <!-- 取消生成的二次确认 -->
    <div v-if="cancelTarget" class="wb-confirm-overlay" @click.self="cancelTarget = null">
      <div class="wb-confirm-dialog">
        <h3>取消生成</h3>
        <p>
          确定要取消「<strong>{{ cancelTarget.cancelTitle }}</strong>」的生成任务吗？<br />
          已生成的内容不会保留，此操作不可撤销。
        </p>
        <div class="wb-confirm-actions">
          <button class="btn-cancel" @click="cancelTarget = null">继续生成</button>
          <button class="btn-danger" @click="confirmCancelTask">确认取消</button>
        </div>
      </div>
    </div>

    <!-- 左侧对话列表 -->
    <ConversationList
      :conversations="store.sortedConversations"
      :current-id="store.currentConversation?.conversationId"
      :loading="store.loading"
      @select="handleSelectConversation"
      @create="handleCreateConversation"
      @delete="handleDeleteConversation"
    />

    <!-- 右侧聊天区域 -->
    <div class="chat-area">
      <!-- 右侧面板收起时的展开按钮 -->
      <button
        v-if="!store.rightPanelVisible"
        class="expand-right-btn"
        @click="store.setRightPanelVisible(true)"
        title="展开代码面板"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="13 17 18 12 13 7"></polyline>
          <polyline points="6 17 1 12 6 7"></polyline>
        </svg>
      </button>

      <ChatHeader
        v-if="store.currentConversation"
        :conversation="store.currentConversation"
        :is-dark="isDark"
        @open-config="showConfig = true"
        @toggle-theme="toggleTheme"
      />
      
      <ChatArea
        v-if="store.currentConversation"
        :messages="store.currentMessages"
        :sending="store.sending"
        @confirm="handleCardConfirm"
        @cancel="handleCardCancel"
      />

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <div class="empty-icon">💬</div>
        <h3>欢迎使用工作台</h3>
        <p>通过自然语言对话完成组件生成、修改、管理</p>
        <button class="primary-btn" @click="handleCreateConversation">
          开始新对话
        </button>
      </div>

      <!-- 输入区域 -->
      <ChatInput
        v-if="store.currentConversation"
        :disabled="store.sending"
        @send="handleSend"
      />
    </div>

    <!-- 右侧面板（代码/文件列表） -->
    <RightPanel
      :visible="store.rightPanelVisible"
      :artifacts="store.artifacts"
      :files="store.currentArtifactFiles"
      :selected-index="store.selectedArtifactIndex"
      @update:visible="store.setRightPanelVisible"
      @select-artifact="store.selectArtifact"
      @refresh="loadConversationArtifacts"
    />

    <!-- 全局配置面板 -->
    <ConfigPanel v-if="showConfig" v-model:visible="showConfig" />

    <!-- 任务监控面板（浮动 FAB，自包含轮询全局任务接口） -->
    <WorkflowMonitor />
  </div>
</template>

<script setup>
import { onMounted, ref, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useWorkbenchStore } from '@/stores/workbench';
import { useTheme } from '@/composables/useTheme';
import { getComponentFiles } from '@/api/component';
import { fetchLatestTaskCodeSnapshot, fetchTaskCodeSnapshotFile } from '@/api/generator/generator';
import http from '@/core/http';
import ConfigPanel from '@/components/generator/ConfigPanel.vue';
import ConversationList from './components/ConversationList.vue';
import ChatHeader from './components/ChatHeader.vue';
import ChatArea from './components/ChatArea.vue';
import ChatInput from './components/ChatInput.vue';
import RightPanel from './components/RightPanel.vue';
import WorkflowMonitor from '@/components/generator/WorkflowMonitor.vue';

const route = useRoute();
const router = useRouter();
const store = useWorkbenchStore();

// ========== 主题 ==========
// 统一使用主应用的 useTheme() composable，与 AppHeader / components.vue 完全一致
const { isDark, toggleTheme } = useTheme();
const theme = computed(() => isDark.value ? 'dark' : 'light');

// ========== 全局配置面板 ==========
const showConfig = ref(false);

// 取消生成的二次确认目标（由进度卡传入）
const cancelTarget = ref(null);

/**
 * 从消息历史中提取所有进度卡（一个对话可能有多个组件生成）
 */
function extractAllArtifactsFromMessages(messages) {
  if (!messages || !Array.isArray(messages)) return [];
  const seen = new Set();
  const items = [];
  // 从旧到新遍历，保证顺序
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.cards) {
      for (const card of msg.cards) {
        if (card.type === 'progress' && card.data?.sessionId) {
          const sid = card.data.sessionId;
          if (!seen.has(sid)) {
            seen.add(sid);
            items.push({
              sessionId: sid,
              componentName: card.data.componentName || sid,
            });
          }
        }
      }
    }
  }
  // 最新的排前面
  return items.reverse();
}

/**
 * 加载当前对话的产物（代码文件）—— 支持多个组件
 * 优先级：currentComponentId > 消息中的 sessionId（全部收集）
 */
async function loadConversationArtifacts() {
  const conv = store.currentConversation;
  if (!conv) {
    store.clearArtifacts();
    return;
  }

  const artifactsList = [];

  // 图片扩展名：这些文件不拉文本 content，改由 RightPanel 走 raw 二进制接口预览
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
  const isImagePath = (p) => imageExts.includes((p || '').slice((p || '').lastIndexOf('.')).toLowerCase());

  // 1. 优先加载 currentComponentId（已注册的组件）
  if (conv.currentComponentId) {
    try {
      const filesList = await getComponentFiles(conv.currentComponentId);
      const codeFiles = (filesList || []).filter(f => !f.isDirectory);
      if (codeFiles.length > 0) {
        const filesWithContent = await Promise.all(
          codeFiles.map(async (f) => {
            // 图片文件不拉文本 content（utf-8 读二进制会乱码），留空由 raw 接口预览
            if (isImagePath(f.path)) {
              return { path: f.path, content: '' };
            }
            try {
              const res = await http.get(`/api/component/${conv.currentComponentId}/file`, {
                params: { path: f.path },
              });
              return { path: f.path, content: res?.success ? res.content : `/* 读取失败 */` };
            } catch {
              return { path: f.path, content: '/* 读取失败 */' };
            }
          })
        );
        artifactsList.push({
          id: conv.currentComponentId,
          name: conv.currentComponentId,
          source: 'registered',
          files: filesWithContent,
        });
      }
    } catch (err) {
      console.warn('加载已注册组件文件失败:', err);
    }
  }

  // 2. 从消息历史中提取所有进度卡，加载任务快照
  const progressItems = extractAllArtifactsFromMessages(store.currentMessages);
  for (const item of progressItems) {
    // 避免与已注册组件重复
    if (artifactsList.some(a => a.id === item.sessionId)) continue;

    try {
      const snapshot = await fetchLatestTaskCodeSnapshot(item.sessionId);
      const manifest = snapshot?.candidate || snapshot?.lastGood || snapshot?.partial;
      if (!manifest || !manifest.files || manifest.files.length === 0) continue;

      const revision = manifest.revision;
      const filesWithContent = await Promise.all(
        manifest.files.map(async (f) => {
          // 图片文件不拉文本 content，留空由 raw 接口预览
          if (isImagePath(f.path)) {
            return { path: f.path, content: '' };
          }
          try {
            const content = await fetchTaskCodeSnapshotFile(item.sessionId, revision, f.path);
            return { path: f.path, content };
          } catch {
            return { path: f.path, content: '/* 读取失败 */' };
          }
        })
      );
      artifactsList.push({
        id: item.sessionId,
        name: item.componentName,
        source: 'task',
        revision,
        files: filesWithContent,
      });
    } catch {
      // 单个快照加载失败不影响其他产物
    }
  }

  if (artifactsList.length > 0) {
    store.setArtifacts(artifactsList);
  } else {
    store.clearArtifacts();
  }
}

// 初始化加载对话列表
onMounted(async () => {
  await store.fetchConversations();
  
  // 如果 URL 中有 conversationId，加载对应对话
  const conversationId = route.params.conversationId;
  if (conversationId) {
    await store.loadConversation(conversationId);
  } else if (store.sortedConversations.length > 0) {
    // 没有指定对话时，自动加载最近一次对话
    const latestConv = store.sortedConversations[0];
    await store.loadConversation(latestConv.conversationId);
    router.replace(`/workbench/${latestConv.conversationId}`);
  }
});

// 监听路由变化
watch(() => route.params.conversationId, async (newId) => {
  if (newId && newId !== store.currentConversation?.conversationId) {
    await store.loadConversation(newId);
  }
});

// 初始加载完成后也触发一次产物加载（immediate: true 保证 onMounted 后自动执行）
// 同时监听消息长度变化——当新消息带 progress 卡时自动刷新产物列表
watch(
  () => [store.currentConversation?.conversationId, store.currentMessages.length],
  () => {
    loadConversationArtifacts();
  },
  { immediate: true }
);

async function handleSelectConversation(conversationId) {
  await store.loadConversation(conversationId);
  router.push(`/workbench/${conversationId}`);
}

async function handleCreateConversation() {
  try {
    const newConv = await store.createNewConversation();
    if (newConv?.conversationId) {
      router.push(`/workbench/${newConv.conversationId}`);
    }
  } catch (err) {
    console.error('Failed to create conversation:', err);
  }
}

async function handleDeleteConversation(conversationId) {
  await store.removeConversation(conversationId);
  if (store.currentConversation?.conversationId === conversationId) {
    router.push('/workbench');
  }
}

/**
 * 发送消息。兼容两种调用形态：
 * - 来自 ChatInput 的 payload 对象：{ text, attachments }
 * - 内部（卡片确认/取消等）直接传字符串
 */
async function handleSend(payload, attachmentsArg) {
  if (!store.currentConversation) return;

  let text = payload;
  let attachments = attachmentsArg;
  let pendingToolCall = undefined;

  if (payload && typeof payload === 'object' && ('text' in payload)) {
    text = payload.text;
    attachments = payload.attachments;
    pendingToolCall = payload.pendingToolCall;
  }

  try {
    await store.send(text, attachments, pendingToolCall);
  } catch (err) {
    console.error('Send failed:', err);
    // TODO: 显示错误提示
  }
}

function handleCardConfirm({ data }) {
  // 用户点击确认卡片，发送确认消息触发实际生成
  const sessionId = data?.sessionId;
  const componentName = data?.params?.find(p => p.key === '组件名称')?.value || '未知组件';

  // 必须把更新后的 pendingToolCall 传给后端（用户在卡片上改了 target/tier）
  // 否则后端从历史消息取到的仍是原始参数（target: 'microcode'），导致"选了 Vue3 却生成微码"
  const payload = {
    text: `确认生成组件「${componentName}」${sessionId ? ` (sessionId: ${sessionId})` : ''}`,
  };
  if (data?.pendingToolCall) {
    payload.pendingToolCall = { ...data.pendingToolCall };
  }
  handleSend(payload);
}

function handleCardCancel({ data }) {
  // 进度卡的「取消生成」：走二次确认弹窗（不用原生 confirm）
  if (data?.__confirmCancel && typeof data.onConfirmed === 'function') {
    cancelTarget.value = data;
    return;
  }
  // 其它卡片（如参数确认卡）的取消：照旧发取消消息
  handleSend('取消生成');
}

function confirmCancelTask() {
  const fn = cancelTarget.value?.onConfirmed;
  cancelTarget.value = null;
  if (typeof fn === 'function') fn();
}
</script>

<style scoped lang="less">
/* 主题变量：挂在容器上（勿放 :root——scoped 编译后匹配不到 html） */
.workbench-container {
  --wb-bg: #f7f8fa;
  --wb-surface: #ffffff;
  --wb-surface-alt: #f2f3f5;
  --wb-border: #e5e7eb;
  --wb-border-light: #f0f0f0;
  --wb-text: #1a1a2e;
  --wb-text-secondary: #6b7280;
  --wb-text-muted: #9ca3af;
  --wb-primary: #4f46e5;
  --wb-primary-light: #eef2ff;
  --wb-primary-bg: #f5f3ff;
  --wb-success: #10b981;
  --wb-success-bg: #ecfdf5;
  --wb-warning: #f59e0b;
  --wb-warning-bg: #fffbeb;
  --wb-danger: #ef4444;
  --wb-danger-bg: #fef2f2;
  --wb-info: #3b82f6;
  --wb-info-bg: #eff6ff;
  --wb-radius: 10px;
  --wb-radius-sm: 6px;
  --wb-radius-lg: 14px;
  --wb-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);

  /* 深色主题：data-theme 驱动，所有子组件经 CSS 变量继承 */
  &[data-theme='dark'] {
    --wb-bg: #17181c;
    --wb-surface: #1f2126;
    --wb-surface-alt: #26282e;
    --wb-border: #34363d;
    --wb-border-light: #2b2d33;
    --wb-text: #e8e9eb;
    --wb-text-secondary: #a2a6ae;
    --wb-text-muted: #7a7e87;
    --wb-primary: #6366f1;
    --wb-primary-light: #2b2d45;
    --wb-primary-bg: #26283a;
    --wb-success: #34d399;
    --wb-success-bg: #12301f;
    --wb-warning: #fbbf24;
    --wb-warning-bg: #33270e;
    --wb-danger: #f87171;
    --wb-danger-bg: #3a1c1c;
    --wb-info: #60a5fa;
    --wb-info-bg: #14283c;
    --wb-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }

  display: flex;
  height: 100vh;
  background: var(--wb-bg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: var(--wb-text);
  overflow: hidden;
  position: relative;
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--wb-surface);
  position: relative;
  min-width: 0;
}

/* 右侧面板收起时的展开按钮 */
.expand-right-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  width: 28px;
  height: 56px;
  border: 1px solid var(--wb-border);
  border-right: none;
  border-radius: 6px 0 0 6px;
  background: var(--wb-surface);
  color: var(--wb-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &:hover {
    background: var(--wb-primary-light);
    color: var(--wb-primary);
    border-color: var(--wb-primary);
  }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--wb-text-muted);

  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }

  h3 {
    font-size: 20px;
    color: var(--wb-text);
    margin: 0 0 8px 0;
    font-weight: 600;
  }

  p {
    font-size: 14px;
    margin: 0 0 24px 0;
  }

  .primary-btn {
    padding: 10px 24px;
    background: var(--wb-primary);
    color: white;
    border: none;
    border-radius: var(--wb-radius-sm);
    font-size: 14px;
    cursor: pointer;
    transition: opacity 0.2s;
    font-weight: 500;

    &:hover {
      opacity: 0.88;
    }
  }
}

/* 取消生成的二次确认弹窗 */
.wb-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 2500;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.wb-confirm-dialog {
  background: var(--wb-surface, #fff);
  border-radius: 14px;
  padding: 20px;
  min-width: 320px;
  max-width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);

  h3 {
    margin: 0 0 12px;
    font-size: 16px;
    font-weight: 600;
    color: var(--wb-text, #1a1a2e);
  }

  p {
    margin: 0 0 18px;
    font-size: 13px;
    line-height: 1.65;
    color: var(--wb-text-secondary, #6b7280);

    strong {
      color: var(--wb-text, #1a1a2e);
    }
  }

  .wb-confirm-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;

    button {
      padding: 7px 16px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      border: 1px solid var(--wb-border, #e5e7eb);
      background: var(--wb-surface, #fff);
      color: var(--wb-text, #1a1a2e);
      transition: all 0.15s;

      &.btn-cancel:hover {
        border-color: var(--wb-primary, #4f46e5);
        color: var(--wb-primary, #4f46e5);
      }

      &.btn-danger {
        background: #ef4444;
        border-color: #ef4444;
        color: #fff;

        &:hover {
          opacity: 0.88;
        }
      }
    }
  }
}
</style>
