/**
 * 任务状态管理器
 * 将任务执行与 SSE 连接解耦，支持断线重连
 *
 * 持久化：任务状态变更（create/complete/fail）写入 data/tasks.json，
 *         服务重启后自动恢复历史任务列表，刷新页面即可看到之前的任务。
 *         进度明细（progress/buffer）仅存内存，不落盘，避免频繁 IO。
 */

import fs from 'fs'
import path from 'path'
import { dataDir } from '../../config/backend-root.js'

const PERSIST_FILE = path.join(dataDir, 'tasks.json')

// 🔒 安全：持久化前递归剥离密钥类字段，避免 figmaToken / apiKey 等明文落盘
const SECRET_FIELD_RE = /(figmaToken|apiKey|api_key|password|secret|token|authorization|access[_-]?token)/i
function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_FIELD_RE.test(k) && typeof v === 'string') {
        out[k] = '***REDACTED***'
      } else {
        out[k] = redactSecrets(v)
      }
    }
    return out
  }
  return value
}

// 内存中保留的最大任务数（LRU 淘汰最老的已完成任务）
const MAX_IN_MEMORY = 500
// 持久化文件保留的最大任务数
const MAX_PERSISTED = 2000
// 运行中任务判定为僵尸的超时时间（无进度更新）
const ZOMBIE_TIMEOUT = 2 * 60 * 60 * 1000 // 2 小时

class TaskManager {
  constructor() {
    // 任务状态存储: sessionId -> { status, progress, result, buffer }
    this.tasks = new Map()

    //中止控制器存储: sessionId -> AbortController（用于取消运行中的任务）
    this.abortControllers = new Map()

    // 启动时加载持久化历史
    this.load()

    // 周期性清理内存中的僵尸/超额任务（每 5 分钟）
    setInterval(() => this.gc(), 5 * 60 * 1000)
  }

  /**
   * 从磁盘加载历史任务
   */
  load() {
    try {
      if (!fs.existsSync(PERSIST_FILE)) return
      const raw = fs.readFileSync(PERSIST_FILE, 'utf-8')
      const list = JSON.parse(raw)
      if (!Array.isArray(list)) return
      for (const task of list) {
        if (!task || !task.sessionId) continue
        // 恢复时进度明细清空（仅恢复元信息用于列表展示）
        task.progress = []
        task.buffer = []
        this.tasks.set(task.sessionId, task)
      }
      console.log(`[TaskManager] 已恢复 ${list.length} 个历史任务`)
    } catch (err) {
      console.warn('[TaskManager] 加载持久化任务失败:', err.message)
    }
  }

  /**
   * 持久化全部任务到磁盘（仅状态变更时调用）
   */
  persist() {
    try {
      const list = Array.from(this.tasks.values())
        // 持久化时裁剪到大容量上限（按开始时间倒序保留较新的）
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, MAX_PERSISTED)
        // 不落盘进度明细与缓冲，减小体积；并递归剥离密钥字段
        .map(({ progress, buffer, ...rest }) => redactSecrets(rest))

      fs.mkdirSync(path.dirname(PERSIST_FILE), { recursive: true })
      fs.writeFileSync(PERSIST_FILE, JSON.stringify(list, null, 2), 'utf-8')
    } catch (err) {
      console.warn('[TaskManager] 持久化任务失败:', err.message)
    }
  }

  /**
   * 内存垃圾回收：清理僵尸运行任务 + 超额淘汰
   */
  gc() {
    const now = Date.now()
    let needsPersist = false

    for (const [sessionId, task] of this.tasks) {
      // 运行中超时且无进度更新 → 标记失败（进程可能已崩溃）
      if (task.status === 'running') {
        const lastUpdate = task.progress.length
          ? task.progress[task.progress.length - 1].timestamp
          : task.startTime
        if (now - lastUpdate > ZOMBIE_TIMEOUT) {
          task.status = 'failed'
          task.error = '任务超时（服务可能已重启）'
          task.endTime = now
          needsPersist = true
        }
      }
    }

    // 超额淘汰最老的已完成/失败任务
    const completed = Array.from(this.tasks.entries())
      .filter(([, t]) => t.status !== 'running')
      .sort((a, b) => a[1].startTime - b[1].startTime)
    if (completed.length > MAX_IN_MEMORY) {
      const removeCount = completed.length - MAX_IN_MEMORY
      for (let i = 0; i < removeCount; i++) {
        this.tasks.delete(completed[i][0])
      }
      needsPersist = true
    }

    // 有任何状态变更或删除操作，同步到文件
    if (needsPersist) {
      this.persist()
    }
  }

  /**
   * 创建新任务
   */
  createTask(sessionId, metadata = {}) {
    const task = {
      sessionId,
      status: 'running', // 'running' | 'completed' | 'failed'
      startTime: Date.now(),
      progress: [],
      progressCount: 0, // 持久化的进度步数，重启后保留
      result: null,
      error: null,
      buffer: [], // 缓存未发送的进度更新
      // 添加元数据，方便用户识别任务
      componentName: metadata.componentName || '',
      nodeId: metadata.nodeId || '',
      fileKey: metadata.fileKey || ''
    }

    this.tasks.set(sessionId, task)
    this.persist()

    return task
  }

  /**
   * 获取任务状态
   */
  getTask(sessionId) {
    return this.tasks.get(sessionId)
  }

  /**
   * 检查任务是否存在
   */
  hasTask(sessionId) {
    return this.tasks.has(sessionId)
  }

  /**
   * 添加进度更新
   */
  addProgress(sessionId, progressData) {
    const task = this.tasks.get(sessionId)
    if (!task) return

    const progressEntry = {
      ...progressData,
      timestamp: Date.now()
    }

    task.progress.push(progressEntry)
    task.buffer.push(progressEntry)
    task.progressCount = task.progress.length
    // 进度更新不触发 persist，避免高频写盘；状态变更时统一落盘
  }

  /**
   * 清空缓冲区（连接建立后调用）
   */
  clearBuffer(sessionId) {
    const task = this.tasks.get(sessionId)
    if (task) {
      const buffer = [...task.buffer]
      task.buffer = []
      return buffer
    }
    return []
  }

  /**
   * 标记任务完成
   */
  completeTask(sessionId, result) {
    const task = this.tasks.get(sessionId)
    if (!task) return

    //保护：cancelled 状态不可被覆盖（用户主动终止的事实应保留）
    if (task.status === 'cancelled') return

    task.status = 'completed'
    task.result = result
    task.endTime = Date.now()
    task.duration = task.endTime - task.startTime
    this.persist()
  }

  /**
   * 标记任务失败
   */
  failTask(sessionId, error) {
    const task = this.tasks.get(sessionId)
    if (!task) return

    //保护：cancelled 状态不可被覆盖（用户主动终止的事实应保留）
    if (task.status === 'cancelled') return

    task.status = 'failed'
    task.error = error.message || error
    task.endTime = Date.now()
    task.duration = task.endTime - task.startTime
    this.persist()
  }

  // ========================================
  //终止任务功能
  // ========================================

  /**
   * 注册中止控制器（任务开始时调用）
   * @param {string} sessionId
   * @param {AbortController} controller
   */
  registerAbortController(sessionId, controller) {
    this.abortControllers.set(sessionId, controller)
    console.log(`[TaskManager] 注册中止控制器: ${sessionId}`)
  }

  /**
   * 移除中止控制器（任务完成时自动清理）
   * @param {string} sessionId
   */
  removeAbortController(sessionId) {
    this.abortControllers.delete(sessionId)
  }

  /**
   * 终止正在运行的任务
   * @param {string} sessionId
   * @returns {{ success: boolean, message: string }}
   */
  cancelTask(sessionId) {
    const task = this.tasks.get(sessionId)

    // 检查任务是否存在
    if (!task) {
      return { success: false, message: '任务不存在' }
    }

    // 检查任务状态（只有运行中的任务才能终止）
    if (task.status !== 'running') {
      return {
        success: false,
        message: `无法终止：当前状态为「${task.status}」（仅 running 状态可终止）`
      }
    }

    // 调用 AbortController 中止任务
    const controller = this.abortControllers.get(sessionId)
    if (controller) {
      try {
        controller.abort()
        console.log(`[TaskManager] 已发送中止信号: ${sessionId}`)
      } catch (e) {
        console.warn('[TaskManager] AbortController 执行失败:', e.message)
      }
    }

    // 更新任务状态为 cancelled
    task.status = 'cancelled'
    task.error = '用户主动终止'
    task.endTime = Date.now()
    task.duration = task.endTime - task.startTime

    // 清理中止控制器
    this.removeAbortController(sessionId)

    // 持久化
    this.persist()

    console.log(`[TaskManager] 任务已终止: ${sessionId}`)

    return { success: true, message: '任务已成功终止' }
  }

  /**
   * 清理任务（保留给外部显式调用，内部改用 gc）
   */
  cleanupTask(sessionId) {
    // 不再主动删除已完成任务（保留历史），仅交由 gc 统一管理
  }

  /**
   * 删除指定任务（用户主动废弃）
   * @param {string} sessionId
   * @returns {boolean} 是否删除成功
   */
  removeTask(sessionId) {
    const deleted = this.tasks.delete(sessionId)
    if (deleted) this.persist()
    return deleted
  }

  /**
   * 一键废弃所有已过期任务（completed 或 failed）
   * @returns {{ removed: number, remaining: number }} 删除数量统计
   */
  removeExpiredTasks() {
    let removed = 0
    for (const [sessionId, task] of this.tasks) {
      if (task.status !== 'running') {
        this.tasks.delete(sessionId)
        removed++
      }
    }
    if (removed > 0) this.persist()
    return { removed, remaining: this.tasks.size }
  }

  /**
   * 获取所有任务列表（包含详细信息）
   * 按开始时间倒序返回（最新在前）
   */
  getAllTasks() {
    return Array.from(this.tasks.entries())
      .map(([sessionId, task]) => ({
        sessionId,
        status: task.status,
        componentName: task.componentName,
        nodeId: task.nodeId,
        fileKey: task.fileKey,
        startTime: task.startTime,
        endTime: task.endTime,
        duration: task.duration,
        progressCount: task.progressCount ?? task.progress.length,
        hasResult: !!task.result,
        hasError: !!task.error,
        error: task.error || null
      }))
      .sort((a, b) => b.startTime - a.startTime)
  }
}

// 单例
export const taskManager = new TaskManager()

export default taskManager
