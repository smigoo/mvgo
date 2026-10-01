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

    <!-- R21：交付弹层（发布到公共池 / 推 GitLab） -->
    <div v-if="deliverTarget" class="wb-confirm-overlay" @click.self="closeDeliverDialog">
      <div class="wb-confirm-dialog deliver-dialog">
        <h3>交付组件</h3>
        <p class="deliver-sub">「<strong>{{ deliverTarget.componentName }}</strong>」交付到：</p>

        <!-- 交付结果 -->
        <div v-if="deliverResult" class="deliver-result" :class="deliverResult.success ? 'ok' : 'fail'">
          {{ deliverResult.message }}
        </div>

        <div v-else class="deliver-options">
          <button class="deliver-option" :disabled="deliverLoading" @click="doPublish">
            <span class="do-icon">🌐</span>
            <span class="do-text">
              <span class="do-label">{{ deliverLoading ? '发布中…' : '发布到公共组件池' }}</span>
              <span class="do-desc">团队可浏览、可复用</span>
            </span>
          </button>
          <button class="deliver-option" :disabled="deliverLoading" @click="doPushGitlab">
            <span class="do-icon">🐙</span>
            <span class="do-text">
              <span class="do-label">推送到 GitLab</span>
              <span class="do-desc">生成代码提交到仓库</span>
            </span>
          </button>
        </div>

        <div class="wb-confirm-actions">
          <button class="btn-cancel" @click="closeDeliverDialog">关闭</button>
        </div>
      </div>
    </div>

    <!-- R20：版本历史弹层（列版本 + 一键回滚） -->
    <div v-if="versionTarget" class="wb-confirm-overlay" @click.self="closeVersionDialog">
      <div class="wb-confirm-dialog version-dialog">
        <h3>版本历史</h3>
        <p class="deliver-sub">「<strong>{{ versionTarget.componentName }}</strong>」的历史版本</p>

        <div v-if="versionResult" class="deliver-result" :class="versionResult.success ? 'ok' : 'fail'">
          {{ versionResult.message }}
        </div>

        <div v-if="versionLoading" class="version-empty">加载中…</div>
        <div v-else-if="!versionList.length && !versionResult" class="version-empty">暂无版本记录</div>

        <div v-else class="version-list">
          <div
            v-for="rev in versionList"
            :key="rev.revision"
            class="version-item"
            :class="{ current: rev.revision === versionCurrent.lastGood }"
          >
            <div class="vi-meta">
              <span class="vi-status" :class="'st-' + rev.status">{{ versionStatusLabel(rev.status) }}</span>
              <span v-if="rev.revision === versionCurrent.lastGood" class="vi-current-tag">当前</span>
              <span v-else-if="rev.revision === versionCurrent.candidate" class="vi-cand-tag">候选</span>
              <span class="vi-time">{{ formatTime(rev.createdAt) }}</span>
            </div>
            <div class="vi-sub">
              {{ rev.files?.length || 0 }} 个文件<span v-if="rev.stage"> · {{ rev.stage }}</span>
              <span v-if="rev.rejectionReason" class="vi-reason">{{ rev.rejectionReason }}</span>
            </div>
            <button
              class="vi-rollback"
              :disabled="versionRolling === rev.revision || rev.revision === versionCurrent.lastGood"
              @click="doRollback(rev.revision)"
            >
              {{ versionRolling === rev.revision ? '回滚中…' : (rev.revision === versionCurrent.lastGood ? '当前版本' : '回滚到此版本') }}
            </button>
          </div>
        </div>

        <div class="wb-confirm-actions">
          <button class="btn-cancel" @click="closeVersionDialog">关闭</button>
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
        @clear-component="handleClearComponentAnchor"
      />
      
      <ChatArea
        v-if="store.currentConversation"
        :messages="store.currentMessages"
        :sending="store.sending"
        @confirm="handleCardConfirm"
        @cancel="handleCardCancel"
        @quick-send="handleQuickSend"
        @quick-focus="handleQuickFocus"
        @action="handleCardAction"
        @edit="handleEditMessage"
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
        ref="chatInputRef"
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
import { getComponentFiles, getComponentBySessionId, publishComponent } from '@/api/component';
import { fetchLatestTaskCodeSnapshot, fetchTaskCodeSnapshotFile, fetchTaskCodeSnapshotRevisions, rollbackTaskCodeSnapshot } from '@/api/generator/generator';
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

// R21：交付弹层（发布到公共池 / 推 GitLab）
const deliverTarget = ref(null);
const deliverLoading = ref(false);
const deliverResult = ref(null);

// R20：版本历史弹层（列版本 + 一键回滚）
const versionTarget = ref(null); // { sessionId, componentName }
const versionList = ref([]);
const versionCurrent = ref({ candidate: null, lastGood: null, partial: null });
const versionLoading = ref(false);
const versionRolling = ref(''); // 正在回滚的 revision
const versionResult = ref(null); // { success, message }

// 输入框引用（R8 快捷入口「从截图/Figma 生成」点击后聚焦输入框）
const chatInputRef = ref(null);

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

// ========== R22：完成通知（浏览器 Notification） ==========
// 只通知一次：按 sessionId 去重，避免消息流每次刷新都重复弹。
const notifiedSessions = new Set();

function notifyCompleted(sessionId, componentName) {
  if (!sessionId || notifiedSessions.has(sessionId)) return;
  notifiedSessions.add(sessionId);
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification('组件生成完成', {
      body: `「${componentName || '组件'}」已生成完毕，可查看、体检与交付`,
      tag: `mvgo-${sessionId}`,
    });
  } catch (err) {
    console.warn('完成通知失败（忽略）:', err);
  }
}

// 组件挂载后尽力请求通知权限（部分浏览器要求用户手势，失败静默降级为无通知）
onMounted(() => {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission?.().catch(() => {});
  }
});

// 扫描消息流：进度卡从 running → completed 时触发通知
watch(
  () => store.currentMessages,
  (msgs) => {
    if (!Array.isArray(msgs)) return;
    for (const msg of msgs) {
      if (msg?.role !== 'assistant' || !Array.isArray(msg.cards)) continue;
      for (const card of msg.cards) {
        if (card?.type === 'progress' && card?.data?.status === 'completed' && card?.data?.sessionId) {
          notifyCompleted(card.data.sessionId, card.data.componentName || '组件');
        }
      }
    }
  },
  { deep: true }
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
 * R7 锚点清除：用户点击「当前组件」chip 的 ×，同步后端 + 本地
 */
async function handleClearComponentAnchor() {
  const conv = store.currentConversation;
  if (!conv?.conversationId) return;
  try {
    await store.clearComponentAnchor(conv.conversationId);
    // 锚点清除后刷新产物列表（不再按 currentComponentId 拉已注册组件文件）
    loadConversationArtifacts();
  } catch (err) {
    console.error('清除组件锚点失败:', err);
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

/**
 * R8 首屏快捷入口：直接发一条预设意图消息（查组件/查任务）
 */
function handleQuickSend(prompt) {
  if (!prompt) return;
  handleSend(prompt);
}

/**
 * R8 首屏快捷入口：需要素材的工具（截图/Figma），聚焦输入框并提示
 */
function handleQuickFocus(placeholder) {
  if (chatInputRef.value && typeof chatInputRef.value.focusWithPlaceholder === 'function') {
    chatInputRef.value.focusWithPlaceholder(placeholder);
  }
}

/**
 * R22 编辑重发：把用户旧消息回填输入框，用户改完 Enter 重发
 */
function handleEditMessage(message) {
  const text = message?.content || '';
  if (!text) return;
  if (chatInputRef.value && typeof chatInputRef.value.focusWithText === 'function') {
    chatInputRef.value.focusWithText(text);
  }
}

/**
 * R11/R12 续做/重试动作分发。
 * - modify/bind/push 依赖 R7 已回写的 currentComponentId（后端 agent 分支读取）
 * - again/retry 需要重新提供素材，聚焦输入框引导
 */
function handleCardAction(payload) {
  const data = payload?.data || payload;
  const type = data?.type;
  const componentName = data?.componentName || '这个组件';

  switch (type) {
    case 'modify':
      handleQuickFocus(`想怎么改「${componentName}」？例如：把标题改成蓝色、加圆角`);
      break;
    case 'bind':
      handleSend('绑定 API');
      break;
    case 'deliver':
      openDeliverDialog(data);
      break;
    case 'versions':
      openVersionDialog(data);
      break;
    case 'again':
      handleQuickFocus('再来一个：粘贴新截图或 Figma 链接…');
      break;
    case 'retry':
      handleQuickFocus(`重新生成「${componentName}」：请重新粘贴截图或 Figma 链接…`);
      break;
    case 'card-action':
      // R13：操作卡按钮带 prompt 时直接发送
      if (data?.action?.prompt) handleSend(data.action.prompt);
      break;
    default:
      break;
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

// ========== R21：交付（发布到公共池 / 推 GitLab） ==========
function openDeliverDialog(data) {
  deliverTarget.value = {
    sessionId: data?.sessionId,
    componentName: data?.componentName || data?.sessionId,
  };
  deliverLoading.value = false;
  deliverResult.value = null;
}

function closeDeliverDialog() {
  deliverTarget.value = null;
  deliverLoading.value = false;
  deliverResult.value = null;
}

async function doPublish() {
  const sid = deliverTarget.value?.sessionId;
  if (!sid || deliverLoading.value) return;
  deliverLoading.value = true;
  deliverResult.value = null;
  try {
    // sessionId → 组件记录（拿 Mongo _id）。发布接口严格要求组件 id（ObjectId）
    const record = await getComponentBySessionId(sid);
    if (!record?._id) {
      deliverResult.value = {
        success: false,
        message: '组件尚未入库，无法发布到公共组件池',
      };
      return;
    }
    const res = await publishComponent(String(record._id));
    deliverResult.value = {
      success: !!res?.success,
      message: res?.message || '已发布到公共组件池',
      visibility: res?.data?.visibility,
      sharedAt: res?.data?.sharedAt,
    };
  } catch (err) {
    deliverResult.value = {
      success: false,
      message: err?.response?.data?.message || err?.message || '发布失败',
    };
  } finally {
    deliverLoading.value = false;
  }
}

function doPushGitlab() {
  const name = deliverTarget.value?.componentName || '';
  closeDeliverDialog();
  handleSend('推送到 GitLab');
}

// ========== R20：版本历史 + 一键回滚 ==========
async function openVersionDialog(data) {
  const sid = data?.sessionId;
  if (!sid) return;
  versionTarget.value = {
    sessionId: sid,
    componentName: data?.componentName || sid,
  };
  versionLoading.value = true;
  versionResult.value = null;
  versionRolling.value = '';
  versionList.value = [];
  try {
    const res = await fetchTaskCodeSnapshotRevisions(sid);
    versionList.value = res?.revisions || [];
    versionCurrent.value = res?.current || { candidate: null, lastGood: null, partial: null };
  } catch (err) {
    versionResult.value = {
      success: false,
      message: err?.response?.data?.message || err?.message || '加载版本历史失败',
    };
  } finally {
    versionLoading.value = false;
  }
}

function closeVersionDialog() {
  versionTarget.value = null;
  versionList.value = [];
  versionCurrent.value = { candidate: null, lastGood: null, partial: null };
  versionRolling.value = '';
  versionResult.value = null;
}

async function doRollback(revision) {
  const sid = versionTarget.value?.sessionId;
  if (!sid || !revision || versionRolling.value) return;
  versionRolling.value = revision;
  versionResult.value = null;
  try {
    await rollbackTaskCodeSnapshot(sid, revision);
    // 刷新版本列表（current 指针已变）与右侧产物面板
    await openVersionDialog({ sessionId: sid, componentName: versionTarget.value?.componentName });
    versionResult.value = { success: true, message: '已回滚到该版本' };
    loadConversationArtifacts();
  } catch (err) {
    versionResult.value = {
      success: false,
      message: err?.response?.data?.message || err?.message || '回滚失败',
    };
  } finally {
    versionRolling.value = '';
  }
}

// 版本状态 → 中文标签（与后端 TaskCodeSnapshotStatus 对齐）
function versionStatusLabel(status) {
  return {
    'last-good': '当前可用',
    candidate: '候选',
    validating: '校验中',
    partial: '半成品',
    rejected: '已拒绝',
  }[status] || status;
}

// ISO 时间 → 短格式（YYYY-MM-DD HH:mm）
function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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

/* R21：交付弹层（发布到公共池 / 推 GitLab） */
.deliver-dialog {
  .deliver-sub {
    margin-bottom: 4px;
  }

  .deliver-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 18px;
  }

  .deliver-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--wb-border, #e5e7eb);
    border-radius: 10px;
    background: var(--wb-surface, #fff);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;

    &:hover:not(:disabled) {
      border-color: var(--wb-primary, #4f46e5);
      background: var(--wb-primary-bg, #f5f3ff);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .do-icon {
      font-size: 22px;
      line-height: 1;
      flex-shrink: 0;
    }

    .do-text {
      display: flex;
      flex-direction: column;
      gap: 2px;

      .do-label {
        font-size: 14px;
        font-weight: 600;
        color: var(--wb-text, #1a1a2e);
      }

      .do-desc {
        font-size: 12px;
        color: var(--wb-text-muted, #9ca3af);
      }
    }
  }

  .deliver-result {
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.6;
    margin-bottom: 18px;

    &.ok {
      background: var(--wb-success-bg, #ecfdf5);
      color: var(--wb-success, #10b981);
      border: 1px solid var(--wb-success, #10b981);
    }

    &.fail {
      background: var(--wb-danger-bg, #fef2f2);
      color: var(--wb-danger, #ef4444);
      border: 1px solid var(--wb-danger, #ef4444);
    }
  }
}

/* R20：版本历史弹层 */
.version-dialog {
  max-width: 520px;
  width: 90vw;

  .version-empty {
    padding: 24px 0;
    text-align: center;
    font-size: 13px;
    color: var(--wb-text-muted, #9ca3af);
    margin-bottom: 12px;
  }

  .version-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 340px;
    overflow-y: auto;
    margin-bottom: 18px;
  }

  .version-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--wb-border, #e5e7eb);
    border-radius: 8px;
    background: var(--wb-surface, #fff);
    transition: all 0.15s;

    &.current {
      border-color: var(--wb-success, #10b981);
      background: var(--wb-success-bg, #ecfdf5);
    }

    .vi-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .vi-status {
      font-size: 11px;
      padding: 1px 7px;
      border-radius: 999px;
      background: var(--wb-surface-alt, #f2f3f5);
      color: var(--wb-text-secondary, #6b7280);
      flex-shrink: 0;

      &.st-last-good {
        background: var(--wb-success-bg, #ecfdf5);
        color: var(--wb-success, #10b981);
      }
      &.st-candidate {
        background: var(--wb-info-bg, #eff6ff);
        color: var(--wb-info, #3b82f6);
      }
      &.st-validating {
        background: var(--wb-warning-bg, #fffbeb);
        color: var(--wb-warning, #f59e0b);
      }
      &.st-partial {
        background: var(--wb-warning-bg, #fffbeb);
        color: var(--wb-warning, #f59e0b);
      }
      &.st-rejected {
        background: var(--wb-danger-bg, #fef2f2);
        color: var(--wb-danger, #ef4444);
      }
    }

    .vi-current-tag {
      font-size: 11px;
      color: var(--wb-success, #10b981);
      font-weight: 600;
      flex-shrink: 0;
    }
    .vi-cand-tag {
      font-size: 11px;
      color: var(--wb-info, #3b82f6);
      flex-shrink: 0;
    }

    .vi-time {
      font-size: 12px;
      color: var(--wb-text-muted, #9ca3af);
      flex-shrink: 0;
    }

    .vi-sub {
      flex: 1;
      min-width: 0;
      font-size: 12px;
      color: var(--wb-text-secondary, #6b7280);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      .vi-reason {
        margin-left: 6px;
        color: var(--wb-danger, #ef4444);
      }
    }

    .vi-rollback {
      flex-shrink: 0;
      padding: 5px 12px;
      border-radius: 6px;
      border: 1px solid var(--wb-border, #e5e7eb);
      background: var(--wb-surface, #fff);
      color: var(--wb-primary, #4f46e5);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;

      &:hover:not(:disabled) {
        border-color: var(--wb-primary, #4f46e5);
        background: var(--wb-primary-bg, #f5f3ff);
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }
    }
  }
}
</style>
