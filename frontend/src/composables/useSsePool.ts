/**
 * SSE 连接池 composable
 *
 * 管理多个 SSE 连接的全局池，提供统一的进度事件收集和生命周期管理。
 *
 * 核心特性：
 * - 全局单例池，上限 3 条连接（LRU 淘汰）
 * - 打开详情自动建连，关闭自动断连
 * - 历史进度恢复（先 fetch 任务状态，再追加实时事件）
 * - 支持多管线（微码/vue3/页面/大屏）
 * - 事件持久化，切换面板不丢失
 */

import { ref, shallowRef, reactive, onUnmounted } from 'vue'
import { fetchTaskStatus, createProgressStream } from '@/api/generator'

// ---- 类型定义 ----

export interface SseProgressEvent {
  type: 'progress' | 'log' | 'complete' | 'error' | 'metrics' | 'budget-warning' | 'budget-exceeded'
  stage?: string
  message?: string
  status?: string
  level?: string
  data?: any
  meta?: any
  timestamp?: number
  /** 事件来源：history=从 fetchTaskStatus 恢复，realtime=SSE 实时推送 */
  source?: 'history' | 'realtime'
}

export interface SseConnectionState {
  sessionId: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  events: SseProgressEvent[]
  result: any | null
  error: string | null
  eventSource: EventSource | null
  lastActivityAt: number
  /** 该连接关联的组件 key 集合（用于追踪引用） */
  refKeys: Set<string>
}

// ---- 全局连接池 ----

const MAX_CONNECTIONS = 3
const pool = new Map<string, SseConnectionState>()

// ---- 事件去重 ----
// 历史恢复与 SSE 实时推送可能产生同一条 progress，按 type+stage+message 去重

/** 事件去重 key：{type}|{stage}|{message} */
function eventKey(e: SseProgressEvent): string {
  return `${e.type || 'progress'}|${e.stage || ''}|${e.message || ''}`
}

/** 去重追加事件，返回实际是否追加（有重复则跳过） */
function pushEvent(state: SseConnectionState, evt: SseProgressEvent): boolean {
  const key = eventKey(evt)
  // 用 WeakMap 会复杂，这里 Map 可以接受（事件数通常<500）
  const seen = (state as any).__seenKeys as Set<string>
  if (seen.has(key)) return false
  seen.add(key)
  state.events.push(evt)
  return true
}

/** 获取或创建连接状态 */
function getOrCreate(sessionId: string, refKey: string): SseConnectionState {
  let state = pool.get(sessionId)
  if (!state) {
    state = reactive({
      sessionId,
      status: 'disconnected' as const,
      events: [],
      result: null,
      error: null,
      eventSource: null,
      lastActivityAt: Date.now(),
      refKeys: new Set(),
    })
    ;(state as any).__seenKeys = new Set<string>()
    pool.set(sessionId, state)
  }
  state.refKeys.add(refKey)
  state.lastActivityAt = Date.now()
  return state
}

/** LRU 淘汰最久未活动的连接 */
function evictIfNeeded() {
  if (pool.size <= MAX_CONNECTIONS) return
  const entries = [...pool.entries()]
    .map(([sid, s]) => ({ sid, last: s.lastActivityAt }))
    .filter(e => e.sid !== '') // 不淘汰当前正连接的
    .sort((a, b) => a.last - b.last)

  while (pool.size > MAX_CONNECTIONS && entries.length > 0) {
    const victim = entries.shift()!
    pool.get(victim.sid)?.eventSource?.close()
    pool.delete(victim.sid)
  }
}

/**
 * 建立 SSE 连接并恢复历史进度
 *
 * @param sessionId - 任务 sessionId
 * @param refKey - 引用标识（用于追踪，通常是组件名称）
 * @returns SseConnectionState（响应式）
 */
export function connectSse(sessionId: string, refKey: string): SseConnectionState {
  const state = getOrCreate(sessionId, refKey)

  // 如果已连接，直接复用
  if (state.status === 'connected' || state.status === 'connecting') {
    state.lastActivityAt = Date.now()
    return state
  }

  // 如果有旧的 EventSource，先关闭
  if (state.eventSource) {
    state.eventSource.close()
    state.eventSource = null
  }

  state.status = 'connecting'
  evictIfNeeded()

  // 🔧 Step 1: 先建立 SSE 连接接收实时事件
  // 后端 SSE 对 running 任务会重放缓冲进度（progress.service register 的 clearBuffer），
  // 对终态任务会推送 complete/error 后 res.end()，对未创建任务会 keep-alive 等进度，
  // 因此无需先 fetchTaskStatus 拉历史——先拉历史反而造成建连延迟，错过早期进度。
  establishSseConnection(sessionId, state)

  // Step 2: 异步拉取历史进度（仅作终态兜底 + 补齐建连前的事件，pushEvent 去重处理重叠）
  fetchTaskStatus(sessionId)
    .then((resp) => {
      if (!resp?.success || !resp.data?.task) return
      const task = resp.data.task

      // 恢复历史进度事件（去重追加）
      if (Array.isArray(task.progress) && task.progress.length > 0) {
        for (const p of task.progress) {
          pushEvent(state, {
            type: p.type || 'progress',
            stage: p.stage || p.node,
            message: p.message,
            status: p.status,
            level: p.level,
            data: p.data || p.tokens,
            meta: p.meta,
            timestamp: p.timestamp || p.time || task.startTime,
            source: 'history' as const,
          })
        }
      }

      // 终态兜底（SSE 已建连，但若任务已终态而 SSE 未推送，这里补齐）
      if (task.status === 'completed' && task.result) {
        state.result = task.result
        state.status = 'connected'
        // 模拟一条 complete 事件（去重）
        pushEvent(state, {
          type: 'complete',
          message: '任务已完成',
          timestamp: Date.now(),
          source: 'history',
          ...task.result,
        })
        return
      }
      if (task.status === 'failed') {
        state.error = task.error || '任务失败'
        state.status = 'error'
        pushEvent(state, {
          type: 'error',
          message: task.error || '任务失败',
          timestamp: Date.now(),
          source: 'history',
        })
        return
      }
      if (task.status === 'cancelled') {
        state.status = 'error'
        state.error = '任务已被取消'
        return
      }
    })
    .catch(() => {
      // fetch 失败不阻断（SSE 已建连，实时事件仍能接收）
    })

  return state
}

function establishSseConnection(sessionId: string, state: SseConnectionState) {
  const es = createProgressStream(sessionId)

  let connected = false

  es.onopen = () => {
    connected = true
    state.status = 'connected'
  }

  es.onmessage = (event) => {
    state.lastActivityAt = Date.now()
    try {
      const data = JSON.parse(event.data)

      if (data.type === 'connected') {
        // 连接确认，忽略
        return
      }

      if (data.type === 'keep-alive') {
        return
      }

      // 统一事件格式
      const evt: SseProgressEvent = {
        type: data.type || 'progress',
        stage: data.stage,
        message: data.message,
        status: data.status,
        level: data.level,
        data: data.data,
        meta: data.meta,
        timestamp: data.timestamp || Date.now(),
        source: 'realtime',
      }

      // 去重追加（历史恢复 + 实时可能产生相同事件）
      pushEvent(state, evt)

      // 处理终态
      if (data.type === 'complete') {
        state.result = data
        state.status = 'connected' // 保持 connected 以显示结果
        pushEvent(state, {
          type: 'complete',
          message: '生成完成',
          timestamp: Date.now(),
          source: 'realtime',
          ...data,
        })
        es.close()
        state.eventSource = null
      } else if (data.type === 'error') {
        state.error = data.message || '任务失败'
        state.status = 'error'
        es.close()
        state.eventSource = null
      }
    } catch {
      // 忽略解析错误
    }
  }

  es.onerror = () => {
    if (!connected) {
      state.status = 'error'
      state.error = 'SSE 连接失败'
    }
    // readyState 为 CLOSED 时 EventSource 已不可恢复
    if (es.readyState === EventSource.CLOSED) {
      if (state.status !== 'error') {
        state.status = 'disconnected'
      }
      state.eventSource = null
    }
  }

  state.eventSource = es
}

/**
 * 断开 SSE 连接（移除引用计数，引用归零才真关闭）
 */
export function disconnectSse(sessionId: string, refKey: string) {
  const state = pool.get(sessionId)
  if (!state) return

  state.refKeys.delete(refKey)

  // 还有引用，不关闭
  if (state.refKeys.size > 0) return

  state.eventSource?.close()
  state.eventSource = null
  state.status = 'disconnected'
}

/**
 * 获取连接的响应式事件列表
 */
export function getSseEvents(sessionId: string): SseProgressEvent[] {
  return pool.get(sessionId)?.events || []
}

/**
 * 获取连接状态
 */
export function getSseState(sessionId: string): SseConnectionState | undefined {
  return pool.get(sessionId)
}

/**
 * 在组件销毁时自动清理该组件关联的所有 SSE 连接
 */
export function useSsePoolCleanup(refKey: string) {
  onUnmounted(() => {
    for (const [sid, state] of pool) {
      if (state.refKeys.has(refKey)) {
        disconnectSse(sid, refKey)
      }
    }
  })
}
