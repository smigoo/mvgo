import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as workbenchApi from '@/api/workbench';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  cards?: any[];
  createdAt: string;
}

export interface Conversation {
  conversationId: string;
  title: string;
  messages: Message[];
  messageCount: number;
  lastActiveAt: string;
  currentComponentId?: string;
  context?: Record<string, any>;
  group?: string;
  pinned?: boolean;
  toolCredentials?: {
    figmaToken?: boolean;
    apifoxToken?: boolean;
    gitlabToken?: boolean;
    gitlabProjectUrl?: boolean;
  };
}

/** 单个组件/任务的产物 */
export interface ComponentArtifact {
  /** 唯一标识：已注册组件用 componentId，进行中任务用 sessionId */
  id: string;
  /** 组件名称（从消息卡片 / 组件记录中提取） */
  name?: string;
  /** 来源：'registered' = 已登记组件，'task' = 任务快照 */
  source: 'registered' | 'task';
  /** 任务快照的 revision（仅 source === 'task' 时存在，用于读取二进制图片） */
  revision?: string;
  /** 文件列表（含内容；图片文件 content 为空，需走 raw 二进制接口） */
  files: Array<{ path: string; content: string }>;
}

export const useWorkbenchStore = defineStore('workbench', () => {
  // State
  const conversations = ref<Conversation[]>([]);
  const currentConversation = ref<Conversation | null>(null);
  const loading = ref(false);
  const sending = ref(false);

  // Getters
  const sortedConversations = computed(() => {
    return [...conversations.value].sort(
      (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );
  });

  const currentMessages = computed(() => {
    return currentConversation.value?.messages || [];
  });

  // Actions
  async function fetchConversations() {
    loading.value = true;
    try {
      const res = await workbenchApi.listConversations();
      // 防御：兼容 { data: [...] } 和直接 [...] 两种返回形态
      const list = Array.isArray(res) ? res : (res?.data ?? []);
      conversations.value = list.filter(Boolean);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
      conversations.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function loadConversation(conversationId: string) {
    loading.value = true;
    try {
      const res = await workbenchApi.getConversation(conversationId);
      currentConversation.value = res?.data ?? res ?? null;
    } catch (err) {
      console.error('Failed to load conversation:', err);
      currentConversation.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function createNewConversation(title?: string) {
    try {
      const res = await workbenchApi.createConversation(title);
      const newConv = res?.data ?? res;
      if (!newConv?.conversationId) {
        throw new Error('创建对话失败：返回数据缺少 conversationId');
      }
      conversations.value.unshift(newConv);
      currentConversation.value = newConv;
      return newConv;
    } catch (err) {
      console.error('Failed to create conversation:', err);
      throw err;
    }
  }

  async function send(content: string, attachments?: any[], pendingToolCall?: any) {
    if (!currentConversation.value) {
      throw new Error('No active conversation');
    }

    sending.value = true;
    try {
      const res = await workbenchApi.sendMessage(
        currentConversation.value.conversationId,
        content,
        attachments,
        pendingToolCall
      );

      // 防御：兼容 { data: {...} } 和直接 {...} 两种返回形态
      const payload = res?.data ?? res;
      const { userMessage, assistantMessage, conversation } = payload;

      if (currentConversation.value && userMessage && assistantMessage) {
        currentConversation.value.messages.push(userMessage);
        currentConversation.value.messages.push(assistantMessage);
        if (conversation) {
          currentConversation.value.messageCount = conversation.messageCount;
          currentConversation.value.title = conversation.title;
          currentConversation.value.lastActiveAt = conversation.lastActiveAt;
          // R7 锚点：生成类工具成功后后端回写 currentComponentId，这里同步到本地，
          // 供 ChatHeader 渲染「当前组件」chip。
          if ('currentComponentId' in conversation) {
            currentConversation.value.currentComponentId = conversation.currentComponentId;
          }
        }
      }

      // 更新对话列表中的标题和时间
      if (conversation) {
        const idx = conversations.value.findIndex(
          c => c.conversationId === currentConversation.value?.conversationId
        );
        if (idx >= 0) {
          conversations.value[idx].title = conversation.title;
          conversations.value[idx].lastActiveAt = conversation.lastActiveAt;
        }
      }

      return { userMessage, assistantMessage };
    } catch (err) {
      console.error('Failed to send message:', err);
      throw err;
    } finally {
      sending.value = false;
    }
  }

  async function removeConversation(conversationId: string) {
    try {
      await workbenchApi.deleteConversation(conversationId);
      conversations.value = conversations.value.filter(c => c.conversationId !== conversationId);
      if (currentConversation.value?.conversationId === conversationId) {
        currentConversation.value = null;
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      throw err;
    }
  }

  function setCurrentConversation(conversation: Conversation | null) {
    currentConversation.value = conversation;
  }

  async function renameConversation(conversationId: string, title: string) {
    await workbenchApi.renameConversation(conversationId, title);
    // workbenchApi 已解包到 data 层（无 success 字段），请求成功才会走到这里，故无条件同步本地状态。
    const conv = conversations.value.find(c => c.conversationId === conversationId);
    if (conv) {
      conv.title = title;
    }
    if (currentConversation.value?.conversationId === conversationId) {
      currentConversation.value.title = title;
    }
  }

  async function batchDeleteConversations(conversationIds: string[]) {
    const res = await workbenchApi.batchDeleteConversations(conversationIds);
    // 无条件同步本地状态（workbenchApi 已解包到 data 层，成功才走到这里）
    conversations.value = conversations.value.filter(
      c => !conversationIds.includes(c.conversationId)
    );
    if (currentConversation.value && conversationIds.includes(currentConversation.value.conversationId)) {
      currentConversation.value = null;
    }
    return res;
  }

  async function moveToGroup(conversationIds: string[], group: string) {
    await workbenchApi.moveToGroup(conversationIds, group);
    // 无条件同步本地状态（workbenchApi 已解包到 data 层，成功才走到这里）
    conversations.value.forEach(conv => {
      if (conversationIds.includes(conv.conversationId)) {
        conv.group = group;
      }
    });
    if (currentConversation.value && conversationIds.includes(currentConversation.value.conversationId)) {
      currentConversation.value.group = group;
    }
  }

  async function getGroups() {
    const res = await workbenchApi.getGroups();
    // workbenchApi.getGroups 已 return res.data（解包到分组数组），与 listConversations 同口径。
    // 旧写法 res?.data || [] 在 res 已是数组时恒返回 []，导致「新建分组后列表不出现」。
    return Array.isArray(res) ? res : (res?.data ?? []);
  }

  async function createGroup(name: string) {
    return await workbenchApi.createGroup(name);
  }

  async function renameGroup(name: string, newName: string) {
    await workbenchApi.renameGroup(name, newName);
    // 无条件同步本地状态（workbenchApi 已解包到 data 层，成功才走到这里）
    conversations.value.forEach(conv => {
      if (conv.group === name) conv.group = newName;
    });
    if (currentConversation.value?.group === name) {
      currentConversation.value.group = newName;
    }
  }

  async function deleteGroup(name: string, force = false) {
    return await workbenchApi.deleteGroup(name, force);
  }

  // 工具凭据状态
  const toolCredentials = ref<{
    figmaToken: boolean;
    apifoxToken: boolean;
    gitlabToken: boolean;
    gitlabProjectUrl: boolean;
  } | null>(null);

  async function fetchToolCredentials(conversationId: string) {
    try {
      const res = await workbenchApi.getToolCredentials(conversationId);
      // workbenchApi 已解包到 data 层（脱敏凭据对象），无需再取 .data
      toolCredentials.value = res ?? null;
      return toolCredentials.value;
    } catch (err) {
      console.error('Failed to fetch tool credentials:', err);
      return null;
    }
  }

  async function saveToolCredentials(
    conversationId: string,
    credentials: {
      figmaToken?: string;
      apifoxToken?: string;
      gitlabToken?: string;
      gitlabProjectUrl?: string;
    },
  ) {
    try {
      const res = await workbenchApi.updateToolCredentials(conversationId, credentials);
      // workbenchApi 已解包到 data 层（无 success/data 嵌套），无条件同步本地状态
      toolCredentials.value = res;
      const conv = conversations.value.find(c => c.conversationId === conversationId);
      if (conv) {
        conv.toolCredentials = res;
      }
      return res;
    } catch (err) {
      console.error('Failed to save tool credentials:', err);
      throw err;
    }
  }

  // R7 锚点：清除当前组件锚点（同步后端 + 本地）
  async function clearComponentAnchor(conversationId: string) {
    await workbenchApi.clearComponentAnchor(conversationId);
    if (currentConversation.value?.conversationId === conversationId) {
      currentConversation.value.currentComponentId = undefined;
    }
    const conv = conversations.value.find(c => c.conversationId === conversationId);
    if (conv) {
      conv.currentComponentId = undefined;
    }
  }

  // ========== 右侧面板状态 ==========
  const rightPanelVisible = ref(false);

  /** 单个组件/任务的产物（内部引用） */
  // ComponentArtifact interface moved to module level

  /** 当前对话的所有产物（一个对话可能有多个组件/版本） */
  const artifacts = ref<ComponentArtifact[]>([]);
  /** 当前选中的产物索引 */
  const selectedArtifactIndex = ref(0);

  function setRightPanelVisible(visible: boolean) {
    rightPanelVisible.value = visible;
  }

  /** 设置当前对话的全部产物 */
  function setArtifacts(items: ComponentArtifact[]) {
    artifacts.value = items;
    selectedArtifactIndex.value = items.length > 0 ? 0 : -1;
    if (items.length > 0) {
      rightPanelVisible.value = true;
    }
  }

  /** 选中某个产物（切换组件） */
  function selectArtifact(index: number) {
    if (index >= 0 && index < artifacts.value.length) {
      selectedArtifactIndex.value = index;
    }
  }

  /** 当前选中产物的文件列表（供 RightPanel 消费） */
  const currentArtifactFiles = computed(() => {
    const idx = selectedArtifactIndex.value;
    if (idx < 0 || idx >= artifacts.value.length) return [];
    return artifacts.value[idx].files;
  });

  function clearArtifacts() {
    artifacts.value = [];
    selectedArtifactIndex.value = -1;
  }

  return {
    // State
    conversations,
    currentConversation,
    loading,
    sending,
    toolCredentials,
    rightPanelVisible,
    artifacts,
    selectedArtifactIndex,
    // Getters
    sortedConversations,
    currentMessages,
    currentArtifactFiles,
    // Actions
    fetchConversations,
    loadConversation,
    createNewConversation,
    send,
    removeConversation,
    setCurrentConversation,
    renameConversation,
    batchDeleteConversations,
    moveToGroup,
    getGroups,
    createGroup,
    renameGroup,
    deleteGroup,
    fetchToolCredentials,
    saveToolCredentials,
    clearComponentAnchor,
    setRightPanelVisible,
    setArtifacts,
    selectArtifact,
    clearArtifacts,
  };
});
