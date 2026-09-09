/**
 * Lite 轻量组件生成 API
 * Phase 1-7: 截图/Figma → Vue3/微码，含批量生成、配额预检、批次控制
 */

import axios from 'axios'
import { getAuthToken } from '@/utils/api-token'
import { createProgressStream, fetchTaskStatus, cancelTask } from './generator/generator'

const baseURL = import.meta.env.VITE_LANGGRAPH_API || 'http://localhost:3000/api'

const liteRequest = axios.create({
  baseURL,
  withCredentials: true,
})

liteRequest.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) config.headers['Token'] = token
  return config
})

// ─── 类型定义 ───

export interface GenerateLiteParams {
  imageBase64?: string
  htmlContent?: string
  htmlFileName?: string
  componentName?: string
  componentType?: 'vue3' | 'microcode'
  groupId?: string
  generationTier?: 'lite' | 'max'
  figmaUrl?: string
  config?: Record<string, any>
  panelType?: string
  requirementDoc?: string
  docAnalysis?: any
}

export interface GenerateLiteResponse {
  success: boolean
  sessionId: string
  sourceType: 'screenshot' | 'figma' | 'html'
  componentType: 'vue3' | 'microcode'
  generationTier: 'lite' | 'max'
  queued?: boolean
  queuePosition?: number
  rateLimitReason?: string
  quotaResetAt?: number
  waitMinutes?: number
  message?: string
}

// ─── 批量生成类型 ───

export interface BatchItem {
  imageBase64?: string
  figmaUrl?: string
  componentName?: string
  componentType?: 'vue3' | 'microcode'
  generationTier?: 'lite' | 'max'
  config?: Record<string, any>
  panelType?: string
  requirementDoc?: string
  docAnalysis?: any
}

export interface BatchGenerateParams {
  items: BatchItem[]
  groupId?: string
}

export interface BatchPreCheckResult {
  success: boolean
  requestedCount: number
  availableNow: number
  availableLater: number
  recommendedAction: 'all_now' | 'partial' | 'all_wait'
  message: string
  hourly: { used: number; limit: number; remaining: number; resetAt: number; waitMinutes: number }
  daily: { used: number; limit: number; remaining: number; resetAt: number; waitMinutes: number }
}

export interface BatchGenerateResponse {
  success: boolean
  batchId: string
  totalItems: number
  immediateItems: number
  deferredItems: number
  quotaResetAt?: number
  message: string
  queued?: boolean
  requestCount?: number
  availableNow?: number
  availableLater?: number
  recommendedAction?: string
  quotaDetails?: any
  waitMinutes?: number
}

export interface BatchSummary {
  batchId: string
  status: string
  totalItems: number
  completedItems: number
  failedItems: number
  createdAt: number
  updatedAt: number
}

export interface BatchDetail extends BatchSummary {
  completedAt?: number
  items: Array<{
    sessionId: string
    itemId: string
    status: string
    attemptCount: number
    lastError?: string
    completedAt?: number
    nextRetryAt?: number
    rateLimitReason?: string
  }>
}

// ─── API 方法 ───

/**
 * 发起轻量组件生成请求
 * POST /api/lite/generate
 */
export async function generateLite(
  params: GenerateLiteParams
): Promise<GenerateLiteResponse> {
  const response = await liteRequest.post('/lite/generate', params)
  return response.data
}

/**
 * Phase 7 #208：批量生成配额预检
 * POST /api/lite/batch/pre-check
 */
export async function batchPreCheck(
  params: BatchGenerateParams
): Promise<BatchPreCheckResult> {
  const response = await liteRequest.post('/lite/batch/pre-check', params)
  return response.data
}

/**
 * Phase 7 #207：创建批量生成任务
 * POST /api/lite/batch/generate
 */
export async function batchGenerate(
  params: BatchGenerateParams
): Promise<BatchGenerateResponse> {
  const response = await liteRequest.post('/lite/batch/generate', params)
  return response.data
}

/**
 * Phase 7 #210：获取用户批次列表
 * GET /api/lite/batch/list
 */
export async function batchList(): Promise<{ success: boolean; batches: BatchSummary[] }> {
  const response = await liteRequest.get('/lite/batch/list')
  return response.data
}

/**
 * Phase 7 #210：获取批次详情
 * GET /api/lite/batch/:batchId
 */
export async function batchDetail(batchId: string): Promise<{ success: boolean; batch: BatchDetail }> {
  const response = await liteRequest.get(`/lite/batch/${batchId}`)
  return response.data
}

/**
 * Phase 7 #210：取消批次
 * POST /api/lite/batch/:batchId/cancel
 */
export async function batchCancel(batchId: string): Promise<{ success: boolean; message: string }> {
  const response = await liteRequest.post(`/lite/batch/${batchId}/cancel`)
  return response.data
}

/**
 * Phase 7 #210：暂停批次
 * POST /api/lite/batch/:batchId/pause
 */
export async function batchPause(batchId: string): Promise<{ success: boolean; message: string }> {
  const response = await liteRequest.post(`/lite/batch/${batchId}/pause`)
  return response.data
}

/**
 * Phase 7 #210：恢复批次
 * POST /api/lite/batch/:batchId/resume
 */
export async function batchResume(batchId: string): Promise<{ success: boolean; message: string }> {
  const response = await liteRequest.post(`/lite/batch/${batchId}/resume`)
  return response.data
}

/**
 * Phase 7 #210：重试失败项
 * POST /api/lite/batch/:batchId/retry-failed
 */
export async function batchRetryFailed(batchId: string): Promise<{ success: boolean; message: string; retryCount: number }> {
  const response = await liteRequest.post(`/lite/batch/${batchId}/retry-failed`)
  return response.data
}

/**
 * 获取可恢复的批次列表
 * GET /api/lite/batch/recoverable
 */
export async function batchRecoverable(): Promise<{ success: boolean; batches: BatchSummary[] }> {
  const response = await liteRequest.get('/lite/batch/recoverable')
  return response.data
}

/**
 * 创建 SSE 进度流（复用 generator 的实现）
 */
export function createLiteProgressStream(sessionId: string): EventSource {
  return createProgressStream(sessionId)
}

/**
 * 获取任务状态（复用 generator 的实现）
 */
export { fetchTaskStatus, cancelTask }

export default {
  generateLite,
  batchPreCheck,
  batchGenerate,
  batchList,
  batchDetail,
  batchCancel,
  batchPause,
  batchResume,
  batchRetryFailed,
  batchRecoverable,
  createLiteProgressStream,
  fetchTaskStatus,
  cancelTask,
}
