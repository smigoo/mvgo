import axios from 'axios'
import { router } from '@/router'
import { message } from 'ant-design-vue'
import { getAuthToken } from '@/utils/api-token'
import type {
  TaskUsageResponse,
  TokenStatsResponse,
  BudgetStatus,
  PricingTableResponse,
} from '@/types/token-usage'

// 临时类型定义（后续可以从types中导入）
type GenerateRequest = any
type GenerateResponse = any
type DocGenerateRequest = any
type DocGenerateResponse = any

// API基础配置
const baseURL = import.meta.env.VITE_LANGGRAPH_API || 'http://localhost:3000/api'

let redirectingToLogin = false

const isPreviewRoute = () => {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash || ''
  const path = hash.startsWith('#') ? hash.slice(1) : window.location.pathname || ''
  return path.startsWith('/preview/')
}

const generatorRequest = axios.create({
  baseURL,
  withCredentials: true,
})

generatorRequest.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) config.headers['Token'] = token
  return config
})

generatorRequest.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && !redirectingToLogin) {
      if (isPreviewRoute()) {
        return Promise.reject(error)
      }
      redirectingToLogin = true
      localStorage.removeItem('user')
      localStorage.removeItem('currentGroupId')
      sessionStorage.removeItem('currentSessionId')
      // 门户内刷新父页面重新鉴权；非门户仅提示（登录页已移除，不再跳转）
      if (window.parent !== window && typeof window.parent.getToken === 'function') {
        window.parent.location.reload()
      } else {
        message.warning('登录已过期，请重新登录')
      }
      redirectingToLogin = false
    }
    return Promise.reject(error)
  },
)

// 发起组件生成请求
export async function generateComponent(params: GenerateRequest): Promise<GenerateResponse> {
  const response = await generatorRequest.post('/phase2/generate', params)
  return response.data
}

// 获取 Figma 预览图（生成前确认）
export async function fetchFigmaPreview(
  params: { figmaUrl: string; figmaToken?: string; config?: any },
  options: { signal?: AbortSignal } = {},
): Promise<any> {
  const response = await generatorRequest.post('/phase2/figma-preview', params, {
    signal: options.signal,
  })
  return response.data
}

// 发起普通 Vue3 组件生成请求（复用 /phase2/generate 端点，由后端按 target:'vue3' 路由到 vue3 图）
export async function generateVue3Component(params: GenerateRequest): Promise<GenerateResponse> {
  const response = await generatorRequest.post('/phase2/generate', { ...params, target: 'vue3' })
  return response.data
}

// 创建 SSE 连接监听进度
export function createProgressStream(sessionId: string): EventSource {
  const baseURL = import.meta.env.VITE_LANGGRAPH_API || 'http://localhost:3000/api'
  const token = getAuthToken()
  const url = token
    ? `${baseURL}/progress/${sessionId}?token=${encodeURIComponent(token)}`
    : `${baseURL}/progress/${sessionId}`
  // SSE 与普通 API 使用同一 session。浏览器原生 EventSource 不能自定义 Header，
  // 所以这里把门户 Token 拼到 query 里；后端 SessionGuard 会兼容 query token。
  return new EventSource(url, { withCredentials: true })
}

// 生成文档配置
export async function generateDocConfigs(params: DocGenerateRequest): Promise<DocGenerateResponse> {
  const response = await generatorRequest.post('/microcode/doc/generate-configs', params)
  return response.data
}

// 取消正在进行的任务（后端 POST /api/tasks/cancel/:sessionId 已实现）
export async function cancelTask(
  sessionId: string
): Promise<{ success: boolean; message?: string }> {
  const response = await generatorRequest.post(`/tasks/cancel/${sessionId}`)
  return response.data
}

// 暂停正在运行的任务
export async function pauseTask(
  sessionId: string
): Promise<{ success: boolean; message?: string }> {
  const response = await generatorRequest.post(`/tasks/pause/${sessionId}`)
  return response.data
}

// 恢复已暂停的任务
export async function resumeTask(
  sessionId: string
): Promise<{ success: boolean; message?: string }> {
  const response = await generatorRequest.post(`/tasks/resume/${sessionId}`)
  return response.data
}

// 🆕 S1 断点续跑重试：失败/取消任务换模型重试，后端命中 checkpoint 则复用缓存续跑
export async function retryTask(
  sessionId: string,
  config?: { model?: string; endpoint?: string; apiKey?: string }
): Promise<{ success: boolean; resumed?: boolean; stage?: string; message?: string; error?: string }> {
  const response = await generatorRequest.post(`/tasks/retry/${sessionId}`, { config })
  return response.data
}

// 页面级组件生成请求
export interface GeneratePageParams {
  fileKey: string
  nodeId: string
  groupId: string
  executionMode?: 'serial' | 'parallel'
  concurrency?: number
  config?: any
}

export async function generatePage(params: GeneratePageParams): Promise<any> {
  const response = await generatorRequest.post('/page-generator/generate', params)
  return response.data
}

// 仅分析页面结构（不生成）
export async function analyzePage(params: GeneratePageParams): Promise<any> {
  const response = await generatorRequest.post('/page-generator/analyze', params)
  return response.data
}

// ─── Task 查询 API ───

export interface TaskCodeSnapshotFile {
  path: string
  size: number
  hash: string
  /** 文件行数（后端快照生成时统计；旧快照可能缺失） */
  lines?: number
}

export interface TaskCodeSnapshotManifest {
  version: 1
  sessionId: string
  componentId: string
  groupId?: string
  target: 'microcode' | 'vue3'
  revision: string
  status: 'candidate' | 'validating' | 'last-good' | 'rejected' | 'partial'
  createdAt: string
  stage?: string
  files: TaskCodeSnapshotFile[]
  lastGoodRevision?: string
  rejectionReason?: string
  parentRevision?: string
  editSource?: string
  /** 🛡️ P2#5 缺失文件清单（partial 快照） */
  missingFiles?: string[]
  validation?: Record<string, 'pending' | 'passed' | 'warning' | 'blocked'>
}

/** 逐文件质量诊断项：与后端 SnapshotQualityService / LESS 门禁诊断结构对齐。 */
export interface QualityIssue {
  id: string
  severity: 'BLOCK' | 'WARN' | 'INFO'
  sourceType: 'shared-less' | 'standalone-less' | 'sfc-style' | 'sfc-semantics' | 'structure'
  file: string
  line: number
  column: number
  message: string
  extract?: string[]
  /** line 为整个文件的行号，与 issue.line 同基准，可直接用于展示与跳转 */
  snippet?: Array<{ line?: number; code: string; current?: boolean }>
  hint?: { suggestion?: string }
  healApplied?: boolean
}

export interface SnapshotQualityResult {
  success: boolean
  sessionId: string
  revision: string
  pass: boolean
  blockCount: number
  issues: QualityIssue[]
  validation?: Record<string, 'pending' | 'passed' | 'warning' | 'blocked'>
  /** 本次校验发现并已自动对账的快照索引漂移（磁盘内容为准回写 manifest） */
  integrityDrifted?: string[]
  checkedAt: string
}

/** 获取任务最新候选和 last-good 代码快照。 */
export async function fetchLatestTaskCodeSnapshot(sessionId: string): Promise<{
  success: boolean
  candidate: TaskCodeSnapshotManifest | null
  lastGood: TaskCodeSnapshotManifest | null
  partial: TaskCodeSnapshotManifest | null
}> {
  const response = await generatorRequest.get(`/tasks/${sessionId}/code-snapshots/latest`)
  const envelope = response.data
  return envelope?.data || envelope
}

/** 获取指定 revision 的不可变文件清单。 */
export async function fetchTaskCodeSnapshotManifest(
  sessionId: string,
  revision: string,
): Promise<TaskCodeSnapshotManifest> {
  const response = await generatorRequest.get(
    `/tasks/${sessionId}/code-snapshots/${revision}/manifest`,
  )
  const envelope = response.data
  return envelope?.data?.manifest || envelope?.manifest
}

/** 将快照中的单个文件写回为新的 candidate revision。 */
export async function editTaskCodeSnapshotFile(
  sessionId: string,
  revision: string,
  path: string,
  content: string,
): Promise<TaskCodeSnapshotManifest> {
  const response = await generatorRequest.post(
    `/tasks/${sessionId}/code-snapshots/${revision}/edit`,
    { path, content, source: 'playground' },
  )
  const envelope = response.data
  return envelope?.data?.manifest || envelope?.manifest
}

/** 手动把任务现有代码发布到 workspace（供预览直接读取，不改变任务状态）。 */
export async function publishTaskToWorkspace(sessionId: string): Promise<any> {
  const response = await generatorRequest.post(`/tasks/${sessionId}/publish-to-workspace`)
  return response?.data?.data || response?.data
}

/**
 * 对指定 revision 重跑质量门禁，返回逐文件结构化诊断（file/line/column/snippet/hint）。
 * 用于「用户手改 → 保存 → 重新校验 → 刷新预览」闭环。
 */
export async function validateTaskCodeSnapshot(
  sessionId: string,
  revision: string,
): Promise<SnapshotQualityResult> {
  const response = await generatorRequest.post(
    `/tasks/${sessionId}/code-snapshots/${revision}/validate`,
  )
  const envelope = response.data
  return envelope?.data || envelope
}

/** 按 revision 读取单个生成中文件，避免与其他 workspace 版本混读。 */
export async function fetchTaskCodeSnapshotFile(
  sessionId: string,
  revision: string,
  path: string,
): Promise<string> {
  const response = await generatorRequest.get(
    `/tasks/${sessionId}/code-snapshots/${revision}/file`,
    { params: { path }, responseType: 'text' },
  )
  return response.data
}

/** 按 revision 读取单个生成中文件为 Blob（用于图片/字体等二进制文件预览）。 */
export async function fetchTaskCodeSnapshotFileBlob(
  sessionId: string,
  revision: string,
  path: string,
): Promise<Blob> {
  const response = await generatorRequest.get(
    `/tasks/${sessionId}/code-snapshots/${revision}/file`,
    { params: { path }, responseType: 'blob' },
  )
  return response.data as Blob
}

/** 获取单个任务状态（用于恢复进度） */
export async function fetchTaskStatus(sessionId: string): Promise<any> {
  const response = await generatorRequest.get(`/tasks/status/${sessionId}`)
  return response.data
}

/** 获取所有任务列表（用于全局监控边栏） */
export async function fetchAllTasks(): Promise<any> {
  const response = await generatorRequest.get('/tasks')
  return response.data
}

/** 获取任务树（父任务 + 子任务列表） */
export async function fetchTaskTree(sessionId: string): Promise<any> {
  const response = await generatorRequest.get(`/tasks/tree/${sessionId}`)
  return response.data
}

/** 取消任务（POST /tasks/:sessionId/delete） */
export async function deleteTask(sessionId: string): Promise<any> {
  const response = await generatorRequest.post(`/tasks/${sessionId}/delete`)
  return response.data
}

/** 批量删除任务（级联删除任务记录与组件产出物） */
export async function batchDeleteTasks(sessionIds: string[]): Promise<any> {
  const response = await generatorRequest.post('/tasks/batch-delete', { sessionIds })
  return response.data
}

export default {
  generateComponent,
  generateVue3Component,
  createProgressStream,
  generateDocConfigs,
  cancelTask,
  pauseTask,
  resumeTask,
  generatePage,
  analyzePage,
  fetchTaskStatus,
  editTaskCodeSnapshotFile,
  fetchAllTasks,
  fetchTaskTree,
  deleteTask,
  batchDeleteTasks,
  getTaskTokenUsage,
  getTokenStats,
  getBudgetStatus,
  getPricing,
}

// ─── Token 用量 API ───

/** 按任务查询 Token 明细 */
export async function getTaskTokenUsage(sessionId: string): Promise<TaskUsageResponse> {
  const response = await generatorRequest.get(`/token-usage/task/${sessionId}`)
  return response.data.data
}

/** 聚合统计 */
export async function getTokenStats(
  period: 'daily' | 'weekly' | 'monthly' = 'daily',
  days: number = 7,
): Promise<TokenStatsResponse> {
  const response = await generatorRequest.get('/token-usage/stats', {
    params: { period, days },
  })
  return response.data.data
}

/** 检查任务预算状态 */
export async function getBudgetStatus(sessionId: string): Promise<BudgetStatus> {
  const response = await generatorRequest.get(`/token-usage/budget/${sessionId}`)
  return response.data.data
}

/** 获取模型定价表 */
export async function getPricing(): Promise<PricingTableResponse> {
  const response = await generatorRequest.get('/token-usage/pricing')
  return response.data.data
}

// ─── 人工审核 API ───

/** 提交人工审核（将失败任务覆盖为 passed/warned） */
export async function submitHumanReview(
  sessionId: string,
  overrideStatus: 'passed' | 'warned',
  comment?: string
): Promise<any> {
  const response = await generatorRequest.post(`/tasks/${sessionId}/human-review`, {
    overrideStatus,
    comment,
  })
  return response.data
}

/** 撤回人工审核（POST /tasks/:sessionId/human-review/delete） */
export async function revokeHumanReview(sessionId: string): Promise<any> {
  const response = await generatorRequest.post(`/tasks/${sessionId}/human-review/delete`)
  return response.data
}

/** 极速通过（运行中跳过剩余阶段，直接标记任务完成） */
export async function speedPassTask(sessionId: string): Promise<any> {
  const response = await generatorRequest.post(`/tasks/${sessionId}/speed-pass`)
  return response.data
}

/** 锁定终态（用户对中途效果满意，固化当前快照到 workspace 并终止任务） */
export async function lockTask(sessionId: string, revision?: string): Promise<any> {
  const response = await generatorRequest.post(`/tasks/${sessionId}/lock`, { revision })
  return response.data
}

// ─── 队列管理 API ───

/** 获取队列状态 */
export async function getQueueStatus(): Promise<any> {
  const response = await generatorRequest.get('/tasks/queue')
  return response.data
}

/** 获取队列统计信息 */
export async function getQueueStats(): Promise<any> {
  const response = await generatorRequest.get('/tasks/queue/stats')
  return response.data.stats ?? response.data
}

/** 获取单个任务的队列状态 */
export async function getTaskQueueStatus(sessionId: string): Promise<any> {
  const response = await generatorRequest.get(`/tasks/queue/status/${sessionId}`)
  return response.data
}

/** 取消排队中的任务 */
export async function cancelQueuedTask(sessionId: string): Promise<any> {
  const response = await generatorRequest.post(`/tasks/queue/cancel/${sessionId}`)
  return response.data
}

/** 手动启动排队中的任务 */
export async function startQueuedTask(sessionId: string): Promise<any> {
  const response = await generatorRequest.post(`/tasks/queue/start/${sessionId}`)
  return response.data
}
