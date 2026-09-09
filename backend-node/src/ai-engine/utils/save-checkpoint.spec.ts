import { mkdtempSync, readFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// shared-cache 是被测模块动态 import 的依赖，必须 mock（否则会真写 S3/磁盘全局缓存）
const saveSharedCache = jest.fn()
jest.mock('./shared-cache.js', () => ({
  saveSharedCache: (...args: any[]) => saveSharedCache(...args),
}))

import { saveCheckpoint } from './save-checkpoint.js'

let dir: string
const silentLogger: any = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

/**
 * ⭐ 依赖 this 的 logger 替身 —— 复现真实 logger（ai-engine/logger/logger.js）的实现方式。
 *
 * 真实 logger 内部是 `this.log('warn', message, meta)`。若被测模块写成
 * `const warn = logger.warn` 取出**裸引用**，调用时 this === undefined →
 * TypeError: Cannot read properties of undefined (reading 'log') → **整个 Node 进程崩溃**。
 *
 * 普通对象 mock（`{ warn: jest.fn() }`）不依赖 this，**测不出**这个 bug ——
 * 本模块收编后 9 个用例全绿，首次真实生成即崩溃（2026-09-02 实锤）。
 */
class ThisBoundLogger {
  calls: string[] = []
  log(level: string, message: string) {
    this.calls.push(`${level}:${message}`)
  }
  info(message: string) {
    this.log('info', message)
  }
  warn(message: string) {
    this.log('warn', message)
  }
  error(message: string) {
    this.log('error', message)
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mvgo-cp-'))
  saveSharedCache.mockClear()
  silentLogger.info.mockClear()
  silentLogger.warn.mockClear()
})

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
})

describe('P2 收编 · saveCheckpoint（phase2 / vue3 两个 graph 的重复实现合并为单一实现）', () => {
  it('写盘到 .checkpoint/{name}.json，内容为 2 空格缩进 JSON', async () => {
    await saveCheckpoint({
      outputPath: dir, name: 'figma', data: { a: 1 }, logger: silentLogger,
    })

    const p = join(dir, '.checkpoint', 'figma.json')
    expect(existsSync(p)).toBe(true)
    expect(readFileSync(p, 'utf-8')).toBe(JSON.stringify({ a: 1 }, null, 2))
  })

  it('目录不存在时自动递归创建', async () => {
    const nested = join(dir, 'a', 'b')
    await saveCheckpoint({ outputPath: nested, name: 'visual', data: {}, logger: silentLogger })
    expect(existsSync(join(nested, '.checkpoint', 'visual.json'))).toBe(true)
  })

  it('⭐ outputPath 为空时不写盘、不抛错（两个 graph 都是这个契约）', async () => {
    await expect(
      saveCheckpoint({ outputPath: null, name: 'figma', data: {}, logger: silentLogger }),
    ).resolves.toBe(false)
    await expect(
      saveCheckpoint({ outputPath: '', name: 'figma', data: {}, logger: silentLogger }),
    ).resolves.toBe(false)
    expect(saveSharedCache).not.toHaveBeenCalled()
  })

  it('name=figma 时写全局共享缓存（键为 figmaNodeData）', async () => {
    await saveCheckpoint({
      outputPath: dir, name: 'figma', data: { node: 'x' },
      fileKey: 'FK', nodeId: '2:1', logger: silentLogger,
    })
    expect(saveSharedCache).toHaveBeenCalledTimes(1)
    expect(saveSharedCache).toHaveBeenCalledWith(dir, 'FK', '2:1', { figmaNodeData: { node: 'x' } })
  })

  it('name=visual 时写 previewAnalysis + resourceDomMapping（优先顶层，回退 layoutStructure）', async () => {
    await saveCheckpoint({
      outputPath: dir, name: 'visual',
      data: { preview: 1, layoutStructure: { resourceDomMapping: [{ id: 'bg1' }] } },
      fileKey: 'FK', nodeId: '2:1', logger: silentLogger,
    })
    expect(saveSharedCache).toHaveBeenCalledWith(dir, 'FK', '2:1', {
      previewAnalysis: { preview: 1, layoutStructure: { resourceDomMapping: [{ id: 'bg1' }] } },
      resourceDomMapping: [{ id: 'bg1' }],
    })
  })

  it('name=analysis 时不写全局共享缓存（只落本地 checkpoint）', async () => {
    await saveCheckpoint({
      outputPath: dir, name: 'analysis', data: { r: 1 },
      fileKey: 'FK', nodeId: '2:1', logger: silentLogger,
    })
    expect(saveSharedCache).not.toHaveBeenCalled()
    expect(existsSync(join(dir, '.checkpoint', 'analysis.json'))).toBe(true)
  })

  it('⭐ 写盘抛错不冒泡（catch + warn，不阻断生成主流程）', async () => {
    // outputPath 传成一个文件路径而非目录 → mkdirSync 会抛 ENOTDIR/EEXIST
    const fileAsDir = join(dir, 'not-a-dir')
    require('fs').writeFileSync(fileAsDir, 'x')

    await expect(
      saveCheckpoint({ outputPath: fileAsDir, name: 'figma', data: {}, logger: silentLogger }),
    ).resolves.toBe(false)
    expect(silentLogger.warn).toHaveBeenCalled()
  })

  it('⭐ 共享缓存写失败不影响本地 checkpoint（内层独立 try/catch）', async () => {
    saveSharedCache.mockImplementation(() => { throw new Error('S3 不可用') })

    await saveCheckpoint({
      outputPath: dir, name: 'figma', data: { a: 1 },
      fileKey: 'FK', nodeId: '2:1', logger: silentLogger,
    })

    // 本地 checkpoint 必须仍然落盘成功
    expect(existsSync(join(dir, '.checkpoint', 'figma.json'))).toBe(true)
  })

  it('成功时返回 true', async () => {
    await expect(
      saveCheckpoint({ outputPath: dir, name: 'figma', data: {}, logger: silentLogger }),
    ).resolves.toBe(true)
  })

  it('⭐ logger 为「依赖 this 的类实例」时 info/warn 均可用（防裸引用丢 this → 进程崩溃）', async () => {
    const logger = new ThisBoundLogger()

    // 走 info 路径：写盘成功
    await expect(
      saveCheckpoint({ outputPath: dir, name: 'figma', data: { a: 1 }, logger: logger as any }),
    ).resolves.toBe(true)

    // 走 warn 路径：写盘失败（outputPath 是文件而非目录 → mkdirSync 抛 ENOTDIR）
    const fileAsDir = join(dir, 'not-a-dir-2')
    require('fs').writeFileSync(fileAsDir, 'x')
    await expect(
      saveCheckpoint({ outputPath: fileAsDir, name: 'figma', data: {}, logger: logger as any }),
    ).resolves.toBe(false)

    // 裸引用实现会在这里抛 TypeError（this 丢失），根本走不到断言
    expect(logger.calls.some((c) => c.startsWith('info:'))).toBe(true)
    expect(logger.calls.some((c) => c.startsWith('warn:'))).toBe(true)
  })
})
