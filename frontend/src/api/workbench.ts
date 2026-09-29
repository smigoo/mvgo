import http from '@/core/http';

const BASE = '/api/workbench';

/**
 * 创建新对话
 */
export async function createConversation(title?: string) {
  const res = await http.post(`${BASE}/conversations`, { title });
  return res.data;
}

/**
 * 获取对话列表
 */
export async function listConversations(limit = 20) {
  const res = await http.get(`${BASE}/conversations?limit=${limit}`);
  return res.data;
}

/**
 * 获取单个对话详情
 */
export async function getConversation(conversationId: string) {
  const res = await http.get(`${BASE}/conversations/${conversationId}`);
  return res.data;
}

/**
 * 发送消息
 */
export async function sendMessage(conversationId: string, content: string, attachments?: any[], pendingToolCall?: any) {
  const res = await http.post(`${BASE}/conversations/${conversationId}/messages`, {
    content,
    attachments,
    pendingToolCall,
  });
  return res.data;
}

/**
 * 删除对话
 */
export async function deleteConversation(conversationId: string) {
  const res = await http.delete(`${BASE}/conversations/${conversationId}`);
  return res.data;
}

/**
 * 更新对话上下文
 */
export async function updateContext(conversationId: string, context: Record<string, any>) {
  const res = await http.post(`${BASE}/conversations/${conversationId}/context`, context);
  return res.data;
}

/**
 * 搜索对话
 */
export async function searchConversations(query: string, limit = 10) {
  const res = await http.get(`${BASE}/conversations/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  return res.data;
}

/**
 * 获取对话统计
 */
export async function getStats() {
  const res = await http.get(`${BASE}/stats`);
  return res.data;
}

/**
 * 重命名对话
 */
export async function renameConversation(conversationId: string, title: string) {
  const res = await http.post(`${BASE}/conversations/${conversationId}/rename`, { title });
  return res.data;
}

/**
 * 批量删除对话
 */
export async function batchDeleteConversations(conversationIds: string[]) {
  const res = await http.post(`${BASE}/conversations/batch-delete`, { conversationIds });
  return res.data;
}

/**
 * 移动对话到分组
 */
export async function moveToGroup(conversationIds: string[], group: string | null) {
  const res = await http.post(`${BASE}/conversations/move-to-group`, { conversationIds, group });
  return res.data;
}

/**
 * 获取所有分组
 */
export async function getGroups() {
  const res = await http.get(`${BASE}/groups`);
  return res.data;
}

/**
 * 新建分组
 */
export async function createGroup(name: string) {
  const res = await http.post(`${BASE}/groups`, { name });
  return res.data;
}

/**
 * 重命名分组
 */
export async function renameGroup(name: string, newName: string) {
  const res = await http.patch(
    `${BASE}/groups/${encodeURIComponent(name)}`,
    { newName },
  );
  return res.data;
}

/**
 * 删除分组（组内有对话时后端会拒绝）
 */
export async function deleteGroup(name: string, force = false) {
  const res = await http.delete(
    `${BASE}/groups/${encodeURIComponent(name)}${force ? '?force=true' : ''}`,
  );
  return res.data;
}

/**
 * 获取对话的工具凭据配置（Figma/Apifox/GitLab）
 */
export async function getToolCredentials(conversationId: string) {
  const res = await http.get(`${BASE}/conversations/${conversationId}/credentials`);
  return res.data;
}

/**
 * 更新对话的工具凭据配置
 */
export async function updateToolCredentials(
  conversationId: string,
  credentials: {
    figmaToken?: string;
    apifoxToken?: string;
    gitlabToken?: string;
    gitlabProjectUrl?: string;
  },
) {
  const res = await http.post(`${BASE}/conversations/${conversationId}/credentials`, credentials);
  return res.data;
}
