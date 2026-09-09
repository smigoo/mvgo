/**
 * 响应式 AI 分析组合式 API
 * 封装启动分析 → SSE 进度监听 → 结果处理 → 下载 的完整流程
 */

import { ref, shallowRef } from 'vue'
import {
  startResponsiveAnalysis,
  connectProgressStream,
  downloadResponsiveZip,
  type ResponsiveProgress,
  type ResponsiveResult,
} from '@/api/screen-layout'
import type { ScreenLayout } from '@/types/screen-layout'

export interface StageInfo {
  stage: string
  message: string
  timestamp: number
}

export function useResponsiveAnalysis() {
  /** 是否正在分析中 */
  const analyzing = ref(false)

  /** 当前会话 ID */
  const sessionId = ref<string | null>(null)

  /** 阶段列表（用于展示进度历程） */
  const stages = ref<StageInfo[]>([])

  /** 当前阶段信息 */
  const currentStage = ref<ResponsiveProgress | null>(null)

  /** 生成完成结果 */
  const result = shallowRef<ResponsiveResult | null>(null)

  /** 错误信息 */
  const error = ref<string | null>(null)

  /** SSE 取消函数 */
  let closeSSE: (() => void) | null = null

  /**
   * 启动 AI 响应式分析
   * @param layout - 原始 ScreenLayout
   * @returns Promise<void>
   */
  async function start(layout: ScreenLayout): Promise<void> {
    // 重置状态
    analyzing.value = true
    sessionId.value = null
    stages.value = []
    currentStage.value = null
    result.value = null
    error.value = null

    try {
      // 1. 启动后端分析任务
      const sid = await startResponsiveAnalysis(layout)
      sessionId.value = sid

      addStage('init', `任务已启动 (${sid.slice(0, 12)}...)`)

      // 2. 建立 SSE 连接
      closeSSE = connectProgressStream(
        sid,
        (progress) => {
          currentStage.value = progress
          addStage(progress.stage, progress.message)
        },
        (completeResult) => {
          result.value = completeResult
          analyzing.value = false
          addStage('done', '✅ 生成完成')
        },
        (errMessage) => {
          error.value = errMessage
          analyzing.value = false
          addStage('error', `❌ ${errMessage}`)
        },
      )
    } catch (e: any) {
      error.value = e.message || '启动失败'
      analyzing.value = false
      addStage('error', `❌ ${e.message || '启动失败'}`)
    }
  }

  /**
   * 取消分析
   */
  function cancel() {
    if (closeSSE) {
      closeSSE()
      closeSSE = null
    }
    analyzing.value = false
    addStage('cancelled', '分析已取消')
  }

  /**
   * 下载响应式 ZIP
   */
  async function download(): Promise<void> {
    if (!sessionId.value) {
      throw new Error('没有可用的会话 ID')
    }
    await downloadResponsiveZip(sessionId.value)
  }

  /**
   * 重置所有状态
   */
  function reset() {
    if (closeSSE) {
      closeSSE()
      closeSSE = null
    }
    analyzing.value = false
    sessionId.value = null
    stages.value = []
    currentStage.value = null
    result.value = null
    error.value = null
  }

  // --- 内部辅助 ---

  function addStage(stage: string, message: string) {
    stages.value.push({
      stage,
      message,
      timestamp: Date.now(),
    })
  }

  return {
    analyzing,
    sessionId,
    stages,
    currentStage,
    result,
    error,
    start,
    cancel,
    download,
    reset,
  }
}
