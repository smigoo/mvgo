/**
 * lite-lab 真值回填实验管线 API（dev 专用，生产端点 404）
 *
 * 两阶段实验：Stage A lite 布局（复用 LiteService）→
 * Stage B/C Figma node 真值（颜色/字号/几何/图片）文本锚点匹配回填。
 */

import axios from 'axios'
import { getAuthToken } from '@/utils/api-token'

const baseURL = import.meta.env.VITE_LANGGRAPH_API || 'http://localhost:3000/api'

const labRequest = axios.create({
  baseURL,
  withCredentials: true,
})

labRequest.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) config.headers['Token'] = token
  return config
})

// 🔴 全局响应信封解包：{success, code, message, data, source} 五特征同现才剥
function unwrap<T = any>(payload: any): T {
  const d = payload
  if (d && typeof d === 'object' && 'data' in d && 'code' in d && 'source' in d) {
    return d.data as T
  }
  return d as T
}

export interface RunLabParams {
  figmaUrl: string
  componentType?: 'microcode' | 'vue3'
  componentName?: string
  groupId?: string
  config?: Record<string, any>
  applyColor?: boolean
  applyFontSize?: boolean
  applySizes?: boolean
}

export interface RunLabResponse {
  success: boolean
  sessionId: string
  fileKey?: string
  nodeId?: string
  componentType?: string
  progressUrl?: string
  message?: string
}

export interface LabEditRecord {
  tag: string
  anchorText: string
  figmaNodeId: string
  matchType: 'exact' | 'substr'
  applied: Record<string, string>
  beforeStyle: string | null
}

export interface LabReport {
  status: 'done' | 'error'
  sessionId: string
  fileKey?: string
  nodeId?: string
  stats?: Record<string, number>
  assets?: Array<{ nodeId: string; name: string; fileName?: string }>
  files?: Array<{ path: string; changed: boolean; editCount: number }>
  outputPath?: string
  error?: string
  finishedAt?: string
  edits?: Array<{ path: string; changed: boolean; edits: LabEditRecord[] }>
}

export async function runLiteLab(params: RunLabParams): Promise<RunLabResponse> {
  const response = await labRequest.post('/lite-lab/run', params)
  return unwrap<RunLabResponse>(response.data)
}

export async function fetchLabReport(sessionId: string): Promise<LabReport> {
  const response = await labRequest.get(`/lite-lab/report/${sessionId}`)
  return unwrap<LabReport>(response.data)
}

/** 产物文件访问 URL（图片直接 <img> 用；带 token 兼容 query 鉴权） */
export function labArtifactUrl(sessionId: string, path: string): string {
  const token = getAuthToken()
  const q = `path=${encodeURIComponent(path)}${token ? `&token=${encodeURIComponent(token)}` : ''}`
  return `${baseURL}/lite-lab/artifact/${sessionId}?${q}`
}
