/**
 * 工作流编辑器 API
 * 改用 http 统一封装，自动注入 Token（与 core/http.js 一致）
 */
import http from '@/core/http'

const BASE = '/api'

export interface WorkflowNode {
  id: string
  label: string
  type: 'agent' | 'condition' | 'start' | 'end'
  handler?: string
  position: { x: number; y: number }
  config?: Record<string, any>
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  condition?: string
  label?: string
}

export interface Workflow {
  name: string
  label: string
  description?: string
  entryNode: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface HandlerInfo {
  label: string
  description: string
  category: string
  configSchema: Record<string, any>
}

export interface NodeTypeInfo {
  label: string
  color: string
  description: string
}

// 获取 Handler 和节点类型元数据
export async function fetchWorkflowMeta() {
  const res = await http.get(`${BASE}/workflows/meta/handlers`)
  return (res.data || res) as {
    handlers: Record<string, HandlerInfo>
    nodeTypes: Record<string, NodeTypeInfo>
  }
}

// 列出所有工作流
export async function listWorkflows() {
  const res = await http.get(`${BASE}/workflows`)
  const data = Array.isArray(res) ? res : (res.data || [])
  return data as { name: string; label: string; description: string; nodeCount: number; edgeCount: number }[]
}

// 保存工作流
export async function saveWorkflow(workflow: Workflow) {
  const res = await http.post(`${BASE}/workflows/save`, workflow)
  return res
}

// 删除工作流（POST /workflows/:name/delete）
export async function deleteWorkflow(name: string) {
  const res = await http.post(`${BASE}/workflows/${name}/delete`)
  return res
}

// 加载工作流
export async function loadWorkflow(name: string) {
  const res = await http.post(`${BASE}/workflows/load`, { name })
  return (res.data || res) as Workflow & { mermaid?: string; graphJSON?: any }
}

// 获取原始图管线拓扑（phase2 | vue3 | page-generation | apifox-generation）
export async function fetchGraphTopology(type: 'phase2' | 'vue3' | 'page-generation' | 'apifox-generation') {
  const res = await http.get(`${BASE}/workflows/graph/${type}`)
  return (res.data || res) as Workflow & { isOriginal?: boolean }
}

// 运行工作流（用编排的定义驱动生成；figmaUrl 可替代 fileKey/nodeId 自动解析）
export async function runWorkflow(name: string, params: {
  componentName: string
  fileKey: string
  nodeId: string
  figmaUrl?: string
  config?: Record<string, any>
}) {
  const res = await http.post(`${BASE}/workflows/${name}/run`, params)
  return res as { success: boolean; sessionId: string; message: string; error?: string }
}

export interface ModelOption {
  value: string
  label: string
  url?: string  // 自定义模型的 API 地址
  key?: string  // 自定义模型的 API Key
}

// 获取可用 AI 模型列表
export async function fetchModels() {
  const res = await http.get(`${BASE}/models`)
  return (res.data || res) as ModelOption[]
}

// ========== Agent Builder（编排页新建智能体） ==========

export interface TemplateResourceField {
  key: string
  type: string
  required?: boolean
  desc?: string
}

export interface TemplateResourceParam {
  key: string
  label: string
  type: string
  required?: boolean
  desc?: string
  example?: string
}

export interface TemplateResources {
  inputs: TemplateResourceField[]
  outputs: TemplateResourceField[]
  params: TemplateResourceParam[]
  requires: { model: boolean; prompt: boolean }
}

export interface AgentTemplateInfo {
  id: string
  label: string
  description: string
  resources?: TemplateResources | null
}

export interface AgentCreatePayload {
  name: string
  label: string
  description?: string
  category?: string
  logicType: 'tool' | 'llm'
  templateId: string
  inputs?: Array<{ key: string; type: string; required?: boolean }>
  outputs?: Array<{ key: string; type: string }>
  params?: Record<string, any>
  model?: string
}

// 获取模板目录（工具 + AI）
export async function fetchAgentTemplates() {
  const res = await http.get(`${BASE}/agent-builder/templates`)
  return (res.data || res) as { tool: AgentTemplateInfo[]; llm: AgentTemplateInfo[] }
}

// 创建智能体（渲染 → 注册 → 冒烟）
export async function createAgent(payload: AgentCreatePayload) {
  const res = await http.post(`${BASE}/agent-builder/create`, payload)
  return res as {
    success: boolean
    data?: { name: string; label: string; smoke: string; logicType?: 'tool' | 'llm' }
    message?: string
  }
}

// 动态智能体列表
export async function listAgents() {
  const res = await http.get(`${BASE}/agent-builder/list`)
  return (res.data || res) as Array<{ name: string; label: string; logicType: string }>
}

// 上传参考资源（文档/图片/schema）→ 返回文件元信息供创建时引用
export async function uploadAgentResource(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await http.upload(`${BASE}/agent-builder/upload`, fd)
  return res as {
    success: boolean
    data?: { name: string; url: string; type: string; size: number }
    error?: string
  }
}

// 单节点试跑（创建后即建即测）
export async function testAgent(name: string, input: Record<string, any>) {
  const res = await http.post(`${BASE}/agent-builder/test`, { name, input })
  return res as {
    ok: boolean
    data?: Record<string, any>
    error?: string
  }
}

// ========== 场景配方库（Recipe Library） ==========

export interface RecipeSummary {
  name: string
  label: string
  description: string
  scenario: string
  source: 'builtin' | 'user'
  author?: string
  nodeCount: number
}

export interface RecipeDetail extends RecipeSummary {
  workflow: {
    entryNode: string
    nodes: any[]
    edges: any[]
  }
}

// 配方列表（精简视图）
export async function fetchRecipes() {
  const res = await http.get(`${BASE}/recipes`)
  return (res.data || res) as RecipeSummary[]
}

// 配方详情（含拓扑）
export async function fetchRecipe(name: string) {
  const res = await http.get(`${BASE}/recipes/${name}`)
  return (res.data || res) as RecipeDetail
}

// 另存为模板（当前画布 → 用户配方）
export async function saveRecipe(payload: {
  name: string
  label: string
  description?: string
  scenario?: string
  workflow: { entryNode: string; nodes: any[]; edges: any[] }
}) {
  const res = await http.post(`${BASE}/recipes/save`, payload)
  return res as { success: boolean; data?: RecipeSummary; message?: string }
}

// 删除用户配方
export async function deleteRecipe(name: string) {
  const res = await http.post(`${BASE}/recipes/${name}/delete`)
  return res as { success: boolean; message?: string }
}

// 节点运行快照（可观测性）：按 sessionId 返回各节点输入/输出
export async function fetchNodeSnapshots(sessionId: string) {
  const res = await http.get(`${BASE}/workflows/${sessionId}/nodes`)
  return (res.data || res) as Array<{
    nodeId: string
    nodeLabel: string
    handler: string
    type: string
    inputKeys: string[]
    output: Record<string, any>
    status: string
    durationMs: number
    ts: number
  }>
}

// 能力缺口反馈（模板搜不到时提交需求）
export async function submitAgentFeedback(need: string, query?: string) {
  const res = await http.post(`${BASE}/agent-builder/feedback`, { need, query })
  return res as { success: boolean; data?: { total: number }; message?: string }
}
