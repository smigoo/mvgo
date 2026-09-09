/**
 * SSE 断开恢复工具
 *
 * 当 SSE onerror 触发时，立即通过 API 检查任务真实状态：
 * - completed / failed / cancelled -> 调用对应回调恢复 UI
 * - running -> 启动周期性轮询（15s），直到任务终态或 isStillGenerating() 返回 false
 *
 * 用法:
 *   const recovery = createSseRecovery({
 *     onCompleted: (sid) => { ... },
 *     onFailed: (sid, err) => { ... },
 *     onCancelled: (sid) => { ... },
 *     isStillGenerating: () => isGenerating.value,
 *     log: (level, msg) => addLog(level, msg)
 *   })
 *   // SSE onerror:
 *   eventSource.onerror = () => { recovery.checkAndRecover(sessionId) }
 *   // 生成开始时:
 *   recovery.startFallback(sessionId)
 *   // 终态/清理时:
 *   recovery.stopFallback()
 */
import http from '@/core/http'

export type RecoveryLogLevel = 'info' | 'warn' | 'error'

export interface SseRecoveryOptions {
  /** 任务完成时的回调 */
  onCompleted: (sessionId: string) => void
  /** 任务失败时的回调 */
  onFailed: (sessionId: string, error?: string) => void
  /** 任务被取消时的回调（可选） */
  onCancelled?: (sessionId: string) => void
  /** SSE 重连回调：当任务仍在运行且需要重建连接时调用（可选） */
  onReconnect?: (sessionId: string) => void
  /** 判断 SSE 连接是否仍然存活（返回 true 时跳过重建，避免无谓重连） */
  isConnectionAlive?: () => boolean
  /** 判断是否仍在生成中（用于决定是否启动/停止轮询） */
  isStillGenerating: () => boolean
  /** 日志函数（可选） */
  log?: (level: RecoveryLogLevel, message: string) => void
  /** 轮询间隔毫秒数，默认 15000 */
  intervalMs?: number
}

export interface SseRecovery {
  /** SSE onerror 时调用：立即检查任务状态，若终态则恢复 UI，若运行中则启动轮询 */
  checkAndRecover: (sessionId: string) => Promise<void>
  /** 开始周期性轮询 */
  startFallback: (sessionId: string) => void
  /** 停止周期性轮询 */
  stopFallback: () => void
}

export function createSseRecovery(options: SseRecoveryOptions): SseRecovery {
  const { onCompleted, onFailed, onCancelled, onReconnect, isConnectionAlive, isStillGenerating, log, intervalMs = 15000 } = options
  let fallbackTimer: ReturnType<typeof setInterval> | null = null
  let recovering = false // 防止并发恢复

  async function checkAndRecover(sessionId: string): Promise<void> {
    // 防止多个 onerror 同时触发导致重复恢复
    if (recovering) return
    recovering = true
    try {
      const data = await http.get(`/api/tasks/status/${sessionId}`)
      const st = data?.data?.task?.status

      if (st === 'completed') {
        log?.('info', '\u2705 \u68c0\u6d4b\u5230\u4efb\u52a1\u5df2\u5b8c\u6210\uff08SSE \u65ad\u5f00\u6062\u590d\uff09')
        stopFallback()
        onCompleted(sessionId)
      } else if (st === 'failed') {
        log?.('error', `\u274c \u68c0\u6d4b\u5230\u4efb\u52a1\u5931\u8d25\uff08SSE \u65ad\u5f00\u6062\u590d\uff09: ${data?.data?.task?.error || ''}`)
        stopFallback()
        onFailed(sessionId, data?.data?.task?.error)
      } else if (st === 'cancelled') {
        log?.('warn', '\ud83d\uded1 \u68c0\u6d4b\u5230\u4efb\u52a1\u5df2\u53d6\u6d88\uff08SSE \u65ad\u5f00\u6062\u590d\uff09')
        stopFallback()
        onCancelled?.(sessionId)
      } else {
        // running 或未知状态：仅在 SSE 连接已断开时才重建，避免每 15s 无谓重连
        const alive = isConnectionAlive?.()
        if (!alive) {
          log?.('info', '⏳ 任务仍在运行中，重建 SSE 连接...')
          onReconnect?.(sessionId)
        }
        // 如果还没有启动轮询且仍在生成中，启动轮询
        if (!fallbackTimer && isStillGenerating()) {
          startFallback(sessionId)
        }
      }
    } catch {
      // API 查询失败，静默处理（下次 onerror 或 fallback 会重试）
    } finally {
      recovering = false
    }
  }

  function startFallback(sessionId: string): void {
    stopFallback()
    fallbackTimer = setInterval(() => {
      if (!isStillGenerating()) {
        stopFallback()
        return
      }
      checkAndRecover(sessionId)
    }, intervalMs)
  }

  function stopFallback(): void {
    if (fallbackTimer) {
      clearInterval(fallbackTimer)
      fallbackTimer = null
    }
  }

  return { checkAndRecover, startFallback, stopFallback }
}
