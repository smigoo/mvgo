/**
 * 日志系统基础类
 * 提供统一的日志接口，支持多种日志级别和输出方式
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'

// 全局sessionId存储（用于日志推送）
let currentSessionId = null
let progressManagerInstance = null

export class Logger {
  // 静态方法：设置当前sessionId（在API入口调用）
  static setSessionContext(sessionId, progressManager) {
    currentSessionId = sessionId
    progressManagerInstance = progressManager
  }

  // 静态方法：清除sessionId
  static clearSessionContext() {
    currentSessionId = null
    progressManagerInstance = null
  }

  constructor(options = {}) {
    this.name = options.name || 'default'
    this.level = options.level || 'debug' // 默认使用debug级别，输出详细日志
    this.enableConsole = options.enableConsole !== false
    this.enableFile = options.enableFile !== false // 默认开启文件日志

    // 使用 cwd 相对路径，确保所有日志写入 backend/logs
    this.logDir = options.logDir || join(process.cwd(), 'logs')

    this.logFilePath = options.logFilePath || this.getLogFilePath()
    this.format = options.format || 'text' // text | json
    this.maxLogDays = options.maxLogDays || 7 // 保留最近7天的日志
    this.sessionId = options.sessionId || null // 用于推送日志到前端
    this.progressManager = options.progressManager || null

    // 日志级别优先级
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      fatal: 4
    }

    // 初始化日志目录
    if (this.enableFile) {
      this.initLogDirectory()
    }
  }

  /**
   * 获取日志文件路径（按日期）
   * @private
   */
  getLogFilePath() {
    const date = new Date().toISOString().split('T')[0]
    return join(this.logDir, `app-${date}.log`)
  }

  /**
   * 初始化日志目录
   * @private
   */
  initLogDirectory() {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true })
    }
    // 清理过期日志
    this.cleanOldLogs()
  }

  /**
   * 检查是否应该记录该级别的日志
   * @private
   */
  shouldLog(level) {
    return this.levels[level] >= this.levels[this.level]
  }

  /**
   * 格式化日志消息
   * @private
   */
  formatMessage(level, message, meta) {
    const timestamp = new Date().toISOString()

    // 🛡️ P0-1: 守卫 meta 为 undefined/null/非对象的情况，防止 ...meta 展开崩溃
    const safeMeta = (meta && typeof meta === 'object' && !Array.isArray(meta)) ? meta : {}

    if (this.format === 'json') {
      return JSON.stringify({
        timestamp,
        level,
        logger: this.name,
        message,
        ...safeMeta
      })
    }

    // 文本格式
    const metaStr = Object.keys(safeMeta).length > 0
      ? ` ${JSON.stringify(safeMeta)}`
      : ''
    return `[${timestamp}] [${level.toUpperCase()}] [${this.name}] ${message}${metaStr}`
  }

  /**
   * 记录日志的核心方法
   * @private
   */
  log(level, message, meta) {
    // 🛡️ P0-1: 守卫 meta，防止 null/undefined 传播到 formatMessage 和 SSE 推送
    const safeMeta = (meta && typeof meta === 'object' && !Array.isArray(meta)) ? meta : {}

    if (!this.shouldLog(level)) {
      return
    }

    const formattedMessage = this.formatMessage(level, message, safeMeta)

    // 输出到控制台
    if (this.enableConsole) {
      this.outputToConsole(level, formattedMessage)
    }

  // 输出到文件
  if (this.enableFile) {
      this.outputToFile(formattedMessage)
    }

    // 推送到前端（优先使用实例的sessionId，否则使用全局sessionId）
    // ⚠️ 关键修复：日志推送到前端(SSE)失败绝不能中断正常业务逻辑
    // （例如 Figma 图片下载过程中 logger.debug 触发 SSE 写入异常，
    //   会向上抛出 "res.write is not a function" 并伪装成业务逻辑错误）
    const sessionId = this.sessionId || currentSessionId
    const progressManager = this.progressManager || progressManagerInstance

    if (sessionId && progressManager) {
      try {
        progressManager.sendLog(sessionId, level, message, {
          ...safeMeta,
          logger: this.name
        })
      } catch (pushErr) {
        // SSE 推送失败（连接已关闭 / res.write 异常等）仅告警，不影响主流程
        console.error(`[Logger] 日志推送到前端失败（已忽略，不影响主流程）: ${pushErr?.message}`)
      }
    }
  }

  /**
   * 输出到控制台
   * @private
   */
  outputToConsole(level, message) {
    const consoleMethods = {
      debug: console.debug,
      info: console.info,
      warn: console.warn,
      error: console.error,
      fatal: console.error
    }

    const method = consoleMethods[level] || console.log
    method(message)
  }

  /**
   * 输出到文件
   * @private
   */
  outputToFile(message) {
    try {
      // 检查是否需要切换日志文件（新的一天）
      const currentLogPath = this.getLogFilePath()
      if (currentLogPath !== this.logFilePath) {
        this.logFilePath = currentLogPath
        this.cleanOldLogs()
      }

      // 追加写入日志
      appendFileSync(this.logFilePath, message + '\n', 'utf-8')
    } catch (error) {
      console.error('写入日志文件失败:', error.message)
    }
  }

  /**
   * 清理旧日志
   * @private
   */
  cleanOldLogs() {
    try {
      if (!existsSync(this.logDir)) return

      const files = readdirSync(this.logDir)
      const now = Date.now()
      const maxAge = this.maxLogDays * 24 * 60 * 60 * 1000

      for (const file of files) {
        if (!file.endsWith('.log')) continue

        const filePath = join(this.logDir, file)
        const stats = statSync(filePath)
        const age = now - stats.mtimeMs

        if (age > maxAge) {
          unlinkSync(filePath)
          console.log(`已删除过期日志: ${file}`)
        }
      }
    } catch (error) {
      console.error('清理旧日志失败:', error.message)
    }
  }

  /**
   * DEBUG 级别日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 附加元数据
   */
  debug(message, meta = {}) {
    this.log('debug', message, meta)
  }

  /**
   * INFO 级别日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 附加元数据
   */
  info(message, meta = {}) {
    this.log('info', message, meta)
  }

  /**
   * WARN 级别日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 附加元数据
   */
  warn(message, meta = {}) {
    this.log('warn', message, meta)
  }

  /**
   * ERROR 级别日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 附加元数据
   */
  error(message, meta = {}) {
    this.log('error', message, meta)
  }

  /**
   * FATAL 级别日志（严重错误）
   * @param {string} message - 日志消息
   * @param {Object} meta - 附加元数据
   */
  fatal(message, meta = {}) {
    this.log('fatal', message, meta)
  }

  /**
   * 创建子日志器
   * @param {string} name - 子日志器名称
   * @returns {Logger} 子日志器实例
   */
  child(name) {
    return new Logger({
      name: `${this.name}:${name}`,
      level: this.level,
      enableConsole: this.enableConsole,
      enableFile: this.enableFile,
      logFilePath: this.logFilePath,
      format: this.format
    })
  }

  /**
   * 设置日志级别
   * @param {string} level - 新的日志级别
   */
  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.level = level
    }
  }

  /**
   * 性能计时开始
   */
  time(label) {
    if (!this.timers) {
      this.timers = new Map()
    }
    this.timers.set(label, Date.now())
    this.debug(`⏱️  开始计时: ${label}`)
  }

  /**
   * 性能计时结束
   */
  timeEnd(label) {
    if (!this.timers || !this.timers.has(label)) {
      this.warn(`计时器 ${label} 不存在`)
      return
    }

    const startTime = this.timers.get(label)
    const duration = Date.now() - startTime
    this.timers.delete(label)

    this.info(`⏱️  ${label}: ${duration}ms`)
    return duration
  }

  /**
   * 记录结构化数据
   */
  logStructured(data) {
    this.info('结构化数据', data)
  }

  /**
   * 记录 API 请求
   */
  logRequest(method, url, params = {}) {
    this.info(`📡 API 请求: ${method} ${url}`, params)
  }

  /**
   * 记录 API 响应
   */
  logResponse(method, url, status, duration) {
    this.info(`✅ API 响应: ${method} ${url} - ${status} (${duration}ms)`)
  }

  /**
   * 记录 Agent 执行
   */
  logAgent(agentName, action, data = {}) {
    this.info(`🤖 [${agentName}] ${action}`, data)
  }

  /**
   * 记录工作流步骤
   */
  logWorkflowStep(stepName, status, data = {}) {
    const icon = status === 'start' ? '▶️' : status === 'complete' ? '✅' : '⏸️'
    this.info(`${icon} 工作流步骤: ${stepName}`, data)
  }
}

// 默认全局日志器实例
let defaultLogger = null

/**
 * 获取默认日志器
 * @returns {Logger}
 */
export function getDefaultLogger() {
  if (!defaultLogger) {
    defaultLogger = new Logger({
      name: 'langgraph-server',
      level: 'info'
    })
  }
  return defaultLogger
}

/**
 * 创建新的日志器实例
 * @param {Object} options - 日志器配置
 * @returns {Logger}
 */
export function createLogger(options) {
  return new Logger(options)
}
