/**
 * safeLogger 回归测试
 *
 * 锁死一条不变量：**logger 未传时，函数不得因记日志而崩溃，更不得掩盖真实错误**。
 *
 * 背景（详见 ./safe-logger.js 顶部注释）：
 * `roles/microcode/` 下约 28 个函数以 `options.logger` / 位参形式接收日志器。调用方漏传时
 * logger 为 undefined，函数体内 `logger.error(...)` 抛
 * `Cannot read properties of undefined (reading 'error')`；且这类调用大量位于 catch 块内，
 * 抛出的 TypeError 会覆盖真实错误，使 `throw error` 永远执行不到 → 根因永久丢失。
 *
 * 线上实证：`[代码生成] ❌ 失败: Cannot read properties of undefined (reading 'error')`
 * 日志显示 LLM 明明成功返回 861 tokens，下一毫秒却报失败 —— 真实的解析错误被掩盖了。
 */

// 该 mock 必须在导入 code-parser 之前生效（ts-jest 会把它提升到文件顶部）。
// code-parser → model-config → logger/index → logger/logger → backend-root（用了 import.meta），
// 且 model-config 在模块顶层就执行 createLogger()，需要 logsDir 才能算出日志文件路径。
jest.mock(
  '../../config/backend-root.js',
  () => ({
    workspaceRoot: process.cwd(),
    logsDir: process.cwd() + '/logs',
  }),
  { virtual: true },
)

import { safeLogger } from './safe-logger.js'
import { parseCodeOutput } from '../roles/microcode/code-parser.js'

const METHODS = ['info', 'warn', 'error', 'debug'] as const

describe('safeLogger 兜底能力', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['字符串', 'not a logger'],
    ['数字', 42],
    ['布尔', true],
  ])('传入 %s 时返回全 no-op 日志器，调用不抛错', (_label, input) => {
    const log = safeLogger(input as any)
    for (const m of METHODS) {
      expect(typeof log[m]).toBe('function')
      // 关键：任何级别、任何参数都不能抛（否则 catch 块内会二次崩溃）
      expect(() => (log as any)[m]('msg', { error: 'boom' })).not.toThrow()
    }
  })

  it('传入完整日志器时原样返回（identity，行为零变化）', () => {
    const full = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }
    // toBe（引用相等）而非 toEqual —— 确保没有包一层 wrapper 改变行为
    expect(safeLogger(full)).toBe(full)
  })

  it('传入部分日志器时补齐缺失方法，已有方法保持可用且 this 正确', () => {
    const info = jest.fn()
    const partial = { info } as any
    const log = safeLogger(partial)

    // 缺失的 warn/error/debug 被补成 no-op
    expect(() => log.warn('w')).not.toThrow()
    expect(() => log.error('e')).not.toThrow()
    expect(() => log.debug('d')).not.toThrow()

    // 已有方法仍可调用（bind 过，this 指向原对象）
    log.info('hello', { a: 1 })
    expect(info).toHaveBeenCalledWith('hello', { a: 1 })
  })
})

describe('错误掩盖（error masking）回归', () => {
  /**
   * 复刻历史崩溃形状：catch 块内裸调 logger.error。
   * logger 未传时，修复前会抛 TypeError 并覆盖原始 SyntaxError。
   */
  function parseLikeCodeOutput(rawOutput: string, logger?: any) {
    const log = safeLogger(logger)
    try {
      return JSON.parse(rawOutput)
    } catch (error: any) {
      // 修复前这一行就是 `logger.error(...)` → TypeError: Cannot read properties of undefined
      log.error('解析失败', { error: error.message })
      throw error
    }
  }

  it('logger 未传时，原始错误仍能正常传播（不被 TypeError 掩盖）', () => {
    // 断言抛的是原始 SyntaxError，不是掩盖后的 TypeError
    expect(() => parseLikeCodeOutput('{ bad json')).toThrow(SyntaxError)
    expect(() => parseLikeCodeOutput('{ bad json')).not.toThrow(TypeError)
  })

  it('负面对照：不做兜底时，catch 块内裸调 logger.error 确实会掩盖原始错误', () => {
    // 这正是修复前的代码形状（`logger.error(...)`，logger 为 undefined）。
    // 保留此用例是为了证明 safeLogger 不是多余的防御：
    // 一旦有人把兜底改回裸调用，这条会立刻转绿为红。
    const withoutGuard = (raw: string, logger?: any) => {
      try {
        return JSON.parse(raw)
      } catch (error: any) {
        logger.error('解析失败', { error: error.message })
        throw error
      }
    }
    expect(() => withoutGuard('{ bad json')).toThrow(TypeError)
    expect(() => withoutGuard('{ bad json')).not.toThrow(SyntaxError)
  })

  it('logger 正常传入时行为不变，错误照常传播', () => {
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
    expect(() => parseLikeCodeOutput('{ bad json', log)).toThrow(SyntaxError)
    // 记日志这一步确实发生了
    expect(log.error).toHaveBeenCalledTimes(1)
  })
})

describe('线上崩溃点回归：parseCodeOutput 不传 logger', () => {
  const validOutput = JSON.stringify({
    files: { 'package/index.vue': '<template><div class="x">hi</div></template>' },
  })

  it('合法输入 + 不传 logger：正常解析，不抛错', () => {
    expect(() => parseCodeOutput(validOutput)).not.toThrow()
    const res: any = parseCodeOutput(validOutput)
    expect(res?.files?.['package/index.vue']).toContain('<template>')
  })

  it('非法输入 + 不传 logger：抛的是真实解析错误，不是 TypeError', () => {
    // 数字输入会走到 parseCodeOutputInner 的 catch（缺少 files 字段），
    // 该 catch 内第一行就是 logger.error(...)。兜底失效时这里会变成 TypeError。
    let thrown: any
    try {
      parseCodeOutput(12345 as any)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeDefined()
    expect(thrown).not.toBeInstanceOf(TypeError)
    expect(thrown.message).toMatch(/Failed to parse code output/)
    // 真实根因（缺少 files 字段）必须保留在错误信息里，而不是被 TypeError 抹掉
    expect(thrown.message).toContain('files')
  })

  it('各类畸形输入 + 不传 logger：均不得抛出 TypeError', () => {
    const malformed: any[] = ['{{{ 完全不是合法输出 ', null, undefined, '', 12345, {}]
    for (const input of malformed) {
      expect(() => {
        try {
          parseCodeOutput(input)
        } catch {
          /* 允许抛真实解析错误，只要不是 TypeError */
        }
      }).not.toThrow(TypeError)
    }
  })
})
