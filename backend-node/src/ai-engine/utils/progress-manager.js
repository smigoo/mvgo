/**
 * 进度事件管理器
 * 使用 Server-Sent Events (SSE) 推送实时进度
 * 支持断线重连，任务状态独立于连接
 */

import { EventEmitter } from 'events'
import { taskManager } from './task-manager.js'

class ProgressManager extends EventEmitter {
  constructor() {
    super()
    this.sessions = new Map() // sessionId -> response
  }

  /**
   * 注册 SSE 连接（支持重连）
   */
  register(sessionId, res) {
    // 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })

    // 检查是否是重连
    const existingTask = taskManager.getTask(sessionId)
    const isReconnect = !!existingTask

    // 发送初始连接消息
    this.sendEvent(res, {
      type: 'connected',
      sessionId,
      isReconnect,
      timestamp: Date.now()
    })

    // 如果是重连，发送任务当前状态
    if (isReconnect) {
      this.sendEvent(res, {
        type: 'task-status',
        status: existingTask.status,
        progressCount: existingTask.progress.length,
        timestamp: Date.now()
      })

      //任务已是终态：主动推送终态事件给重连客户端，避免前端卡死
      if (existingTask.status === 'completed' && existingTask.result) {
        this.sendEvent(res, {
          type: 'complete',
          ...existingTask.result,
          timestamp: Date.now()
        })
        // 终态事件已发送，立即关闭连接（无需长连）
        res.end()
        return res
      } else if (existingTask.status === 'failed') {
        this.sendEvent(res, {
          type: 'error',
          message: existingTask.error || '任务失败',
          timestamp: Date.now()
        })
        res.end()
        return res
      } else if (existingTask.status === 'cancelled') {
        this.sendEvent(res, {
          type: 'progress',
          stage: 'cancelled',
          status: 'cancelled',
          message: '🛑 任务已被用户终止',
          timestamp: Date.now()
        })
        res.end()
        return res
      }

      // 仍在 running：发送缓冲的进度更新
      const bufferedProgress = taskManager.clearBuffer(sessionId)
      for (const progress of bufferedProgress) {
        this.sendEvent(res, {
          type: 'progress',
          ...progress
        })
      }
    }

    // 保存连接
    this.sessions.set(sessionId, res)

    // 监听客户端断开连接
    res.on('close', () => {
      this.sessions.delete(sessionId)
      // 注意：不删除任务状态，允许重连
    })

    return res
  }

  /**
   * 发送事件到客户端（使用默认 message 事件）
   */
  sendEvent(res, data) {
    // 不使用命名事件，直接发送 data，这样 EventSource.onmessage 可以接收
    const message = `data: ${JSON.stringify(data)}\n\n`
    // 防御性检查：res 可能不是有效的可写流（如连接已关闭/被覆盖）
    if (typeof res?.write !== 'function') {
      return
    }
    res.write(message)
  }

  /**
   * 发送进度更新（同时保存到任务状态）
   */
  sendProgress(sessionId, progressData) {
    // 1. 保存到任务状态（无论是否有连接），标记 type 以便前端区分 progress vs log
    taskManager.addProgress(sessionId, { type: 'progress', ...progressData })

    // 2. 如果有活动连接，立即发送
    const res = this.sessions.get(sessionId)
    if (res) {
      this.sendEvent(res, {
        type: 'progress',
        ...progressData,
        timestamp: Date.now()
      })
    }
    // 如果没有连接，进度已被缓存到buffer，等待重连时发送
  }

  /**
   * 发送日志消息
   */
  sendLog(sessionId, level, message, meta = {}) {
    // 持久化日志到任务对象（与 sendProgress 一致），前端可从 /api/tasks/status 拉取历史
    const task = taskManager.getTask(sessionId)
    if (task) {
      taskManager.addProgress(sessionId, {
        type: 'log',
        level,
        message,
        meta
      })
    }

    const res = this.sessions.get(sessionId)
    if (res) {
      this.sendEvent(res, {
        type: 'log',
        level,
        message,
        meta,
        timestamp: Date.now()
      })
    }
  }

  /**
   * 发送完成消息（标记任务完成）
   */
  sendComplete(sessionId, result) {
    // 1. 标记任务完成
    taskManager.completeTask(sessionId, result)

    // 2. 如果有连接，发送完成消息并关闭
    const res = this.sessions.get(sessionId)
    if (res) {
      this.sendEvent(res, {
        type: 'complete',
        ...result,
        timestamp: Date.now()
      })
      res.end()
      this.sessions.delete(sessionId)
    }
    // 如果没有连接，状态已保存，客户端重连时会收到 task-status
  }

  /**
   * 发送错误消息（标记任务失败）
   */
  sendError(sessionId, error) {
    // 1. 标记任务失败
    taskManager.failTask(sessionId, error)

    // 2. 如果有连接，发送错误消息并关闭
    const res = this.sessions.get(sessionId)
    if (res) {
      this.sendEvent(res, {
        type: 'error',
        message: error.message || error,
        timestamp: Date.now()
      })
      res.end()
      this.sessions.delete(sessionId)
    }
    // 如果没有连接，状态已保存，客户端重连时会收到 task-status
  }

  /**
   * 关闭连接
   */
  close(sessionId) {
    const res = this.sessions.get(sessionId)
    if (res) {
      res.end()
      this.sessions.delete(sessionId)
    }
  }
}

// 单例
export const progressManager = new ProgressManager()

export default progressManager
