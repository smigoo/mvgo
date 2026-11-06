/**
 * 任务反馈 API
 *
 * 前端 → 后端契约：
 * - 提交：multipart（截图是二进制）+ 勾选项 JSON 字符串
 * - 管理端：列表/详情/状态流转/删除，全部需 admin
 *
 * ⚠️ URL 必须写全 `/api/` 前缀：`core/http` 的 resolveUrl 对以 `/` 开头的路径
 * 原样透传（不补前缀），写 `/tasks/...` 会直连 Vite 而 404。
 */
import http from '@/core/http'

/** 全局响应信封（ResponseEnvelopeInterceptor）解包 */
const unwrap = (res: any) => (res && typeof res === 'object' && 'data' in res ? res.data : res)

/** 构造带后端 message 的错误（与 mc-spec.ts 的约定一致） */
const fail = (data: any, fallback: string): never => {
  const text = data?.message || data?.error || fallback
  const err: any = new Error(text)
  err.data = { message: text }
  throw err
}

export type FeedbackCategory = 'bug' | 'quality' | 'suggestion' | 'other'
export type FeedbackStatus = 'pending' | 'processing' | 'resolved' | 'rejected'
/** 可勾选的数据项 */
export type FeedbackInclude = 'logs' | 'models' | 'figmaUrl' | 'token'

export interface SubmitFeedbackPayload {
  category: FeedbackCategory
  description: string
  includes: FeedbackInclude[]
  /** 用户当前视图的日志文本（后端再脱敏 + 截断 ≤512KB） */
  logsText?: string
  pageUrl?: string
  screenshot?: File | null
}

export interface SubmitFeedbackResult {
  success: boolean
  message?: string
  duplicate?: boolean
  feedback?: { id: string; sessionId: string; status: FeedbackStatus; createdAt?: string }
}

/**
 * 提交任务反馈。
 * 后端会做归属校验（非任务所有者 403）、10 分钟去重、24h 限流。
 */
export async function submitTaskFeedback(
  sessionId: string,
  payload: SubmitFeedbackPayload,
): Promise<SubmitFeedbackResult> {
  const fd = new FormData()
  fd.append('category', payload.category)
  fd.append('description', payload.description)
  fd.append('includes', JSON.stringify(payload.includes))
  if (payload.logsText) fd.append('logsText', payload.logsText)
  if (payload.pageUrl) fd.append('pageUrl', payload.pageUrl)
  if (payload.screenshot) fd.append('file', payload.screenshot, payload.screenshot.name || 'screenshot.png')

  const res: any = await http.upload(`/api/tasks/${encodeURIComponent(sessionId)}/feedback`, fd)
  const data = unwrap(res) ?? res
  // 信封内层可能仍是 { success:false }（去重/限流走的是业务失败而非 HTTP 4xx）
  if (data && data.success === false && !data.duplicate) fail(data, '反馈提交失败')
  return data as SubmitFeedbackResult
}

export interface FeedbackListParams {
  page?: number
  pageSize?: number
  status?: FeedbackStatus | 'all'
  category?: FeedbackCategory | 'all'
  sessionId?: string
  keyword?: string
}

export interface FeedbackItem {
  _id: string
  sessionId: string
  userId: string
  username?: string
  category: FeedbackCategory
  description: string
  status: FeedbackStatus
  snapshot?: {
    taskStatus?: string
    target?: string
    componentId?: string
    componentName?: string
    taskError?: string
    figmaUrl?: string
    modelsUsed?: string[]
    /** 脱敏 + 截断后的日志正文（仅详情接口返回；列表接口已排除以避免响应过大） */
    logExcerpt?: string
    logBytes?: number
    logOriginalBytes?: number
    logTruncated?: boolean
    tokenFingerprint?: string
    /**
     * `tokenFingerprint` 的来源：
     * - pipeline = 任务记录里管线实际使用的那个（权威）
     * - create   = 任务创建时刻的用户配置（兜底，任务未跑到 token 解析）
     * - 缺省     = 旧反馈（改造前落库），值为**提交时刻**的配置，与任务无绑定
     */
    tokenFingerprintSource?: 'pipeline' | 'create'
    /** 提交这一刻用户配置里生效的 Token 指纹（与 tokenFingerprint 比对用） */
    tokenFingerprintCurrent?: string
    /** 两侧是否不一致；任一侧缺失时为 undefined（无法比对，不代表一致） */
    tokenFingerprintChanged?: boolean
    included?: string[]
    pageUrl?: string
    /**
     * 🆕 2026-11-06 自动随附的任务产物图（服务端按任务产物路径自动写，非勾选项）：
     * input=Figma 输入图、output=产物渲染截图；引用路径，取图走 component file 接口。
     */
    taskImages?: {
      input?: string
      output?: string
    }
  }
  attachment?: { filename: string; size: number; mimeType: string } | null
  adminNote?: string
  handledBy?: string
  handledByName?: string
  handledAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface FeedbackListResult {
  success: boolean
  list: FeedbackItem[]
  total: number
  counts: { pending: number; processing: number; resolved: number; rejected: number; all: number }
}

/** 管理端：反馈列表（列表已排除日志正文） */
export async function listFeedbacks(params: FeedbackListParams = {}): Promise<FeedbackListResult> {
  const res: any = await http.get('/api/admin/feedbacks', params)
  const data = unwrap(res) ?? res
  if (data && data.success === false) fail(data, '加载反馈列表失败')
  return data as FeedbackListResult
}

/** 管理端：反馈详情（含日志正文） */
export async function getFeedbackDetail(id: string): Promise<FeedbackItem> {
  const res: any = await http.get(`/api/admin/feedbacks/${encodeURIComponent(id)}`)
  const data = unwrap(res) ?? res
  if (data && data.success === false) fail(data, '加载反馈详情失败')
  return (data?.feedback ?? data) as FeedbackItem
}

/** 管理端：状态流转 + 处置备注 */
export async function updateFeedbackStatus(
  id: string,
  payload: { status: FeedbackStatus; adminNote?: string },
): Promise<FeedbackItem> {
  const res: any = await http.post(`/api/admin/feedbacks/${encodeURIComponent(id)}/status`, payload)
  const data = unwrap(res) ?? res
  if (data && data.success === false) fail(data, '更新反馈状态失败')
  return (data?.feedback ?? data) as FeedbackItem
}

/** 管理端：删除反馈 */
export async function deleteFeedback(id: string): Promise<void> {
  const res: any = await http.post(`/api/admin/feedbacks/${encodeURIComponent(id)}/delete`)
  const data = unwrap(res) ?? res
  if (data && data.success === false) fail(data, '删除反馈失败')
}

/**
 * 管理端：拉取截图 Blob。
 * 用 Blob 而非直链的原因：鉴权依赖 `Token` 请求头，`<img src>` 无法携带；
 * 拿到 Blob 后再 `URL.createObjectURL` 才能稳定预览（调用方负责 revoke）。
 */
export async function fetchFeedbackAttachmentBlob(id: string): Promise<Blob> {
  return http.download(`/api/admin/feedbacks/${encodeURIComponent(id)}/attachment`)
}
