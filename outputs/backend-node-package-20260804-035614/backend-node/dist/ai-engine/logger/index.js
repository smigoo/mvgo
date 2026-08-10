/**
 * 日志系统统一导出
 */

export { Logger, getDefaultLogger, createLogger } from './logger.js'

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
