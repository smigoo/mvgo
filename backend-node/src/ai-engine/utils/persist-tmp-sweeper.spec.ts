/**
 * persist-tmp-sweeper 单测（fsImpl 依赖注入，环境无关）：
 *
 * ⚠️ 本环境不能做真实 fs 集成验证（均为 WorkBuddy node-language-shim 所致）：
 *   1. fs.unlinkSync 对 .tmp 名文件 100% 阻断（EPERM）——正是生产 tmp 泄漏的同款机制；
 *   2. fs.utimesSync 存在 ms→s 单位错译，mtime 被写成未来时间（实测 2262 年）；
 *   3. jest 下 ESM/CJS interop 使 fs 模块级 spy 失效（util 内的 fs 绑定≠spec 的 fs）。
 * 故走 util 自带的 fsImpl 注入点：真实 fs 负责文件创建/读取，statSync/unlinkSync 注入可控 fake。
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { isStalePersistTmpName, sweepStalePersistTmp } from './persist-tmp-sweeper.js'

/** 真实 fs 的包装：statSync 支持按路径覆盖 mtimeMs；unlinkSync 记录调用、可选抛错 */
function makeFakeFs(
  {
    mtimes = new Map<string, number>(),
    unlinkError = null,
    unlinked = [],
  }: {
    mtimes?: Map<string, number>
    unlinkError?: NodeJS.ErrnoException | null
    unlinked?: string[]
  } = {},
) {
  return {
    existsSync: (p) => fs.existsSync(p),
    readdirSync: (p) => fs.readdirSync(p),
    statSync: (p) => {
      const real = fs.statSync(p)
      const mtimeMs = mtimes.get(String(p))
      return mtimeMs !== undefined ? { ...real, isFile: () => real.isFile(), mtimeMs } : real
    },
    unlinkSync: (p) => {
      unlinked.push(String(p))
      if (unlinkError) throw unlinkError
      fs.unlinkSync(p) // 真实删除（测试文件无 .tmp 命名时可用；.tmp 名被 shim 拦也仅影响清理不影响断言）
    },
  }
}

describe('persist-tmp-sweeper', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-sweeper-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const write = (name: string, size = 10) => {
    const full = path.join(dir, name)
    fs.writeFileSync(full, Buffer.alloc(size))
    return full
  }

  it('命名匹配：pid.ts.hex.tmp 与 prev 变体命中，普通文件/探针不命中', () => {
    expect(isStalePersistTmpName('tasks.json.80473.1793958142529.a948893867f81.tmp')).toBe(true)
    expect(isStalePersistTmpName('tasks.json.prev.80473.1793953268737.edfd95ad9d873.tmp')).toBe(true)
    expect(isStalePersistTmpName('batches.json.20580.1793924259730.6e91e7ad2a3d6.tmp')).toBe(true)
    expect(isStalePersistTmpName('task-manager.json.1.2.abc.tmp')).toBe(true)
    expect(isStalePersistTmpName('tasks.json')).toBe(false)
    expect(isStalePersistTmpName('.rename-probe-1793905254423.tmp')).toBe(false)
    expect(isStalePersistTmpName('.restart-probe.tmp')).toBe(false)
    expect(isStalePersistTmpName('ai-config.json')).toBe(false)
  })

  it('对超龄 tmp 调用 unlink 并统计释放字节数；新鲜 tmp 与非匹配文件不触碰', () => {
    const stale1 = write('tasks.json.111.1000.aaaa.tmp', 100)
    const stale2 = write('batches.json.prev.222.2000.bbbb.tmp', 50)
    const fresh = write('tasks.json.333.3000.cccc.tmp', 70)
    const normal = write('ai-config.json', 30)
    const probe = write('.rename-probe-123.tmp', 5)

    const hourAgo = Date.now() - 2 * 60 * 60 * 1000
    const now = Date.now()
    const unlinked: string[] = []
    const fakeFs = makeFakeFs({
      mtimes: new Map([
        [stale1, hourAgo],
        [stale2, hourAgo],
        [fresh, now], // 刚写入 → 在途保护
        [normal, hourAgo],
        [probe, hourAgo],
      ]),
      unlinked,
    })

    const r = sweepStalePersistTmp(dir, { maxAgeMs: 60 * 60 * 1000, fsImpl: fakeFs })

    expect(r.deleted).toBe(2)
    expect(r.freedBytes).toBe(150)
    expect(r.failed).toBe(0)
    expect(unlinked).toContain(stale1)
    expect(unlinked).toContain(stale2)
    expect(unlinked).not.toContain(fresh)
    expect(unlinked).not.toContain(normal)
    expect(unlinked).not.toContain(probe)
  })

  it('目录不存在返回零结果不抛出', () => {
    const r = sweepStalePersistTmp(path.join(dir, 'not-exist'))
    expect(r.deleted).toBe(0)
    expect(r.matched).toBe(0)
  })

  it('unlink 抛错仅计数不向上抛', () => {
    const stale = write('tasks.json.555.5000.eeee.tmp', 10)
    const unlinked: string[] = []
    const e: NodeJS.ErrnoException = new Error('Operation not permitted')
    e.code = 'EPERM'
    const fakeFs = makeFakeFs({
      mtimes: new Map([[stale, Date.now() - 2 * 60 * 60 * 1000]]),
      unlinkError: e,
      unlinked,
    })

    const r = sweepStalePersistTmp(dir, { fsImpl: fakeFs })

    expect(r.deleted).toBe(0)
    expect(r.failed).toBe(1)
    expect(r.matched).toBe(1)
    expect(unlinked).toContain(stale)
  })
})
