/**
 * 日志系统统一导出
 */

export { Logger, getDefaultLogger, createLogger, safeLogger } from './logger.js'
// 单独再导出一次零依赖实现：下游可只拿 safeLogger 而不被 backend-root 依赖链拖累
export { safeLogger as safeLoggerStandalone } from './safe-logger.js'

// 提供快捷方法
import { getDefaultLogger } from './logger.js'

/**
 * 快捷日志方法
 */
export const log = {
  debug: (message, meta) => getDefaultLogger().debug(message, meta),
  info: (message, meta) => getDefaultLogger().info(message, meta),
  warn: (message, meta) => getDefaultLogger().warn(message, meta),
  error: (message, meta) => getDefaultLogger().error(message, meta),
  fatal: (message, meta) => getDefaultLogger().fatal(message, meta)
}
