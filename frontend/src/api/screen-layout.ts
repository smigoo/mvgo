// ============================================================
// 大屏布局编辑器 — API 函数
// ============================================================

import type { ScreenLayout, ScreenLayoutDownloadRequest } from '@/types/screen-layout'
import http from '@/core/http'
import { createProgressStream } from '@/api/generator'

const BASE = '/api/screen-layout'

/**
 * 空间分析报告类型
 */
export interface SpatialReport {
  meta: {
    analyzerVersion: string
    analyzedAt: string
    canvasWidth: number
    canvasHeight: number
    gridSize: number
  }
  summary: {
    totalComponents: number
    headerComponents: number
    bodyComponents: number
    footerComponents: number
    totalZones: number
    detectedRows: number
    detectedColumns: number
    totalOverlaps: number
    majorOverlaps: number
    intentionalOverlays: number
    minorOverlaps: number
    snapXRate: number
    snapYRate: number
    avgComponentWidth: number
    avgComponentHeight: number
  }
  rows: RowInfo[]
  columns: ColumnInfo[]
  /** 按 Zone 分组的行列分析（更有意义） */
  zoneAnalysis: ZoneAnalysis[]
  overlapAnalysis: OverlapInfo[]
  zoneTree: ZoneTreeInfo
  responsiveHints: ResponsiveHints
  components: ComponentAnalysisInfo[]
}

export interface ZoneAnalysis {
  zoneId: string
  region: string
  zoneDepth: number
  componentCount: number
  rows: ZoneRowInfo[]
  columns: ZoneColumnInfo[]
}

export interface ZoneRowInfo {
  rowIndex: number
  y: number
  height: number
  componentCount: number
  componentIds: string[]
}

export interface ZoneColumnInfo {
  colIndex: number
  x: number
  width: number
  componentCount: number
  componentIds: string[]
}

export interface RowInfo {
  rowIndex: number
  y: number
  height: number
  avgComponentHeight: number
  componentCount: number
  componentIds: string[]
  xRange: { min: number; max: number }
  gapToNext: number | null
  zoneId?: string
  region?: string
}

export interface ColumnInfo {
  colIndex: number
  x: number
  width: number
  avgComponentWidth: number
  componentCount: number
  componentIds: string[]
  yRange: { min: number; max: number }
  gapToNext: number | null
  zoneId?: string
  region?: string
}

export interface OverlapInfo {
  componentA: string
  componentB: string
  nameA: string
  nameB: string
  overlapArea: number
  overlapRatio: number
  type: 'major_overlap' | 'intentional_overlay' | 'minor_overlap' | 'edge_touch'
  zIndexOrder: string
  recommendation: string | null
}

export interface ZoneTreeInfo {
  headerActive: boolean
  headerComponents: number
  footerActive: boolean
  footerComponents: number
  bodyZones: ZoneTreeNode[]
  maxDepth: number
}

export interface ZoneTreeNode {
  id: string
  colIndex: number
  layoutMode: string
  contentType: string
  depth: number
  componentCount: number
  children: ZoneTreeNode[]
  totalDescendantComponents: number
}

export interface ResponsiveHints {
  detectedGridPattern: string
  gridPatternConfidence: number
  gridPatternDescription: string
  breakpointSuggestions: BreakpointSuggestion[]
  fixedElements: string[]
  fluidElements: string[]
  criticalOverlaps: { a: string; b: string; ratio: number }[]
  complexityScore: number
}

export interface BreakpointSuggestion {
  width: number
  strategy: string
  description: string
}

export interface ComponentAnalysisInfo {
  id: string
  name: string
  zone: string
  zoneDepth: number
  region: string
  x: number
  y: number
  w: number
  h: number
  center: { x: number; y: number }
  zIndex: number
  snapped: { x: boolean; y: boolean }
}

/**
 * 空间分析
 * POST /api/screen-layout/analyze-spatial
 */
export async function analyzeSpatialLayout(layout: ScreenLayout): Promise<SpatialReport> {
  const json = await http.post(`${BASE}/analyze-spatial`, { layout })
  if (!json?.success) {
    throw new Error(json.data.error || '分析失败')
  }
  return json.data as SpatialReport
}

/**
 * 下载大屏布局 ZIP
 * 后端返回 application/zip 流，前端触发浏览器下载
 */
export async function downloadScreenLayout(layout: ScreenLayout): Promise<void> {
  const blob = await http.download(`${BASE}/download`, {
    method: 'POST',
    body: { layout } satisfies ScreenLayoutDownloadRequest,
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${layout.name || 'screen-layout'}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ============================================================
// 响应式 AI 生成
// ============================================================

/** 响应式分析进度事件 */
export interface ResponsiveProgress {
  stage: string
  message: string
  data?: {
    componentCount?: number
    detectedRows?: number
    detectedColumns?: number
    totalZones?: number
    complexityScore?: number
    codeLength?: number
    checks?: Record<string, boolean>
    passedChecks?: number
    totalChecks?: number
    breakpoints?: string[]
    [key: string]: any
  }
}

/** 响应式生成完成结果 */
export interface ResponsiveResult {
  summary: {
    componentName: string
    codeLength: number
    breakpoints: string[]
    zoneCount: number
    qualityScore: number
    analysisSummary?: any
  }
  codePreview: string
  previewBreakpoints: string[]
  hasAnalysisResult: boolean
}

/**
 * 启动 AI 响应式生成
 * POST /api/screen-layout/analyze-responsive
 * 返回 sessionId，前端通过 SSE 订阅进度
 */
export async function startResponsiveAnalysis(layout: ScreenLayout): Promise<string> {
  const json = await http.post(`${BASE}/analyze-responsive`, { layout })
  if (!json?.success) {
    throw new Error(json.data.error || '启动失败')
  }
  return json.data.sessionId as string
}

/**
 * 建立 SSE 连接，监听响应式生成进度
 * GET /api/screen-layout/progress/:sessionId
 */
export function connectProgressStream(
  sessionId: string,
  onProgress: (data: ResponsiveProgress) => void,
  onComplete: (result: ResponsiveResult) => void,
  onError: (error: string) => void,
): () => void {
  const es = createProgressStream(sessionId)

  es.addEventListener('progress', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as ResponsiveProgress
      onProgress(data)
    } catch (_) { /* 忽略解析错误 */ }
  })

  es.addEventListener('complete', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as ResponsiveResult
      onComplete(data)
    } catch (_) {
      onComplete({ summary: { componentName: '', codeLength: 0, breakpoints: [], zoneCount: 0, qualityScore: 0 }, codePreview: '', previewBreakpoints: [], hasAnalysisResult: false })
    } finally {
      es.close()
    }
  })

  es.addEventListener('error', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      onError(data?.message || '生成失败')
    } catch (_) {
      // 可能是连接关闭事件（EventSource 本身会在连接失败时触发 error 事件）
      // 检查 readyState 判断是否是连接层面的错误
      if (es.readyState === EventSource.CLOSED) {
        onError('SSE 连接已关闭')
      }
    } finally {
      es.close()
    }
  })

  // 返回取消函数
  return () => es.close()
}

/**
 * 下载响应式生成结果 ZIP
 * GET /api/screen-layout/download-responsive/:sessionId
 */
export async function downloadResponsiveZip(sessionId: string): Promise<void> {
  const blob = await http.download(`${BASE}/download-responsive/${sessionId}`)

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `responsive-${sessionId}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
