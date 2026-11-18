/**
 * 🔴 N-V1-a 单测（2026-11-18 · mc-max-1795008711331-d5bd7800 实锤）
 *
 * 病灶：computeVisionDynamicTimeout 原实现 `Math.min(210000, Math.max(90000, p90*1.5))`，
 * 下界 90s **低于本文件自认的正常耗时**（visual-parser.js 顶部注释「正常视觉分析约 97s（实测）」）。
 * 实锤 degradeReason 恰为 `LLM invoke timeout after 90000ms`；同一 Figma 节点
 * （HEDMvb4sr5tobjg82QDb3x / 2:1169）历史有一次 197.9s **成功** ⇒ 不是模型不可用，是超时过紧。
 *
 * 修复：区间改为 [VISION_ANALYSIS_TIMEOUT_MS(240s), VISION_ANALYSIS_TIMEOUT_CEIL_MS(270s)]，
 * 上界受节点 VISUAL_TIMEOUT_MS(600s) 反推约束：2×270s + 等待 ≈ 550s < 600s。
 *
 * ⚠️ visual-parser.js 含 import.meta（CJS transform 下不可直接 import）⇒ 源码提取 + new Function。
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC_PATH = join(__dirname, 'visual-parser.js')
const src = readFileSync(SRC_PATH, 'utf-8')

/** 取模块级数值常量（从源码读，避免 spec 与实现各写一份而漂移） */
function constOf(name: string): number {
  const m = new RegExp(`const ${name} = (\\d+)`).exec(src)
  expect(m).not.toBeNull()
  return Number(m![1])
}

const MIN_MS = constOf('VISION_ANALYSIS_TIMEOUT_MS')
const CEIL_MS = constOf('VISION_ANALYSIS_TIMEOUT_CEIL_MS')
const NODE_TIMEOUT_MS = 10 * 60 * 1000 // mc-component-graph-phase2.js / vue3 的 VISUAL_TIMEOUT_MS

/** 切出非 export 的 `function <name>` 到首个行首 `}` */
function slicePlainFn(name: string): string {
  const start = src.indexOf(`function ${name}(`)
  expect(start).toBeGreaterThan(-1)
  const end = src.indexOf('\n}', start + 40)
  expect(end).toBeGreaterThan(start)
  return src.slice(start, end + 2)
}

/** 编译 computeVisionDynamicTimeout，注入模块级常量与 getProviderPool */
function loadTimeoutFn(getProviderPool: () => any): (fallbackMs: number) => number {
  const body = slicePlainFn('computeVisionDynamicTimeout')
  // eslint-disable-next-line no-new-func
  return new Function(
    'getProviderPool',
    'VISION_ANALYSIS_TIMEOUT_MS',
    'VISION_ANALYSIS_TIMEOUT_CEIL_MS',
    `${body}\nreturn computeVisionDynamicTimeout;`,
  )(getProviderPool, MIN_MS, CEIL_MS)
}

/** 造一个假池：providers 为 Map，latencyProfiles 按 id 取值 */
function fakePool(p90List: number[]): () => any {
  return () => {
    const providers = new Map<string, any>()
    p90List.forEach((_, i) => providers.set(`p${i}`, { id: `p${i}` }))
    return {
      _slots: { vision: { providers } },
      getLatencyProfile: (id: string) => {
        const idx = Number(String(id).replace('p', ''))
        const p90Ms = p90List[idx]
        return p90Ms === undefined ? null : { p90Ms }
      },
    }
  }
}

describe('computeVisionDynamicTimeout 区间（N-V1-a）', () => {
  it('常量锁定：下界 = 240s（原固定设计值）、上界 = 270s', () => {
    expect(MIN_MS).toBe(240000)
    expect(CEIL_MS).toBe(270000)
    expect(MIN_MS).toBeLessThanOrEqual(CEIL_MS)
  })

  it('上界受节点超时约束：2 次 attempt + 余量仍 < 节点 VISUAL_TIMEOUT_MS(600s)', () => {
    // requestMaxRetries=1 ⇒ 2 attempts；留 ≥30s 给重试等待与网络抖动
    expect(CEIL_MS * 2).toBeLessThan(NODE_TIMEOUT_MS - 30000)
  })

  it('下界 ≥ 本文件自认的正常耗时（97s）—— 消除「90s < 97s」自相矛盾', () => {
    const selfClaimedNormalMs = /正常视觉分析约 (\d+)s/.exec(src)
    expect(selfClaimedNormalMs).not.toBeNull()
    expect(MIN_MS).toBeGreaterThanOrEqual(Number(selfClaimedNormalMs![1]) * 1000)
  })

  it('🔴 核心回归锚：p90=60s（本次任务实测 p90×1.5=90s）⇒ 240s，不再是 90000', () => {
    const fn = loadTimeoutFn(fakePool([60000]))
    expect(fn(240000)).toBe(240000)
    expect(fn(240000)).not.toBe(90000)
  })

  it('p90 极小（10s ⇒ 15s）被下界兜住 ⇒ MIN', () => {
    const fn = loadTimeoutFn(fakePool([10000]))
    expect(fn(240000)).toBe(MIN_MS)
  })

  it('p90 中等（160s ⇒ 240s）既不触底也不触顶 ⇒ 240s', () => {
    const fn = loadTimeoutFn(fakePool([160000]))
    expect(fn(240000)).toBe(240000)
  })

  it('p90 极大（300s ⇒ 450s）被上界兜住 ⇒ CEIL（不撞节点超时）', () => {
    const fn = loadTimeoutFn(fakePool([300000]))
    expect(fn(240000)).toBe(CEIL_MS)
  })

  it('多 provider 取最大 p90', () => {
    const fn = loadTimeoutFn(fakePool([20000, 170000]))
    // maxP90=170000 ×1.5=255000 ⇒ [240000,270000] 内 ⇒ 255000
    expect(fn(240000)).toBe(255000)
  })

  it('无画像（空池）⇒ 回退 fallbackMs', () => {
    const fn = loadTimeoutFn(fakePool([]))
    expect(fn(240000)).toBe(240000)
    expect(fn(123456)).toBe(123456)
  })

  it('画像不可用（getProviderPool 抛错）⇒ 回退 fallbackMs（不炸）', () => {
    const fn = loadTimeoutFn(() => {
      throw new Error('pool not ready')
    })
    expect(fn(240000)).toBe(240000)
  })
})

describe('N-V1-a 接线契约', () => {
  it('调用点走动态超时（不是裸常量），且 fallback 为 VISION_ANALYSIS_TIMEOUT_MS', () => {
    const seg = src.slice(src.indexOf('const visionRequestOptions = {'), src.indexOf('let rawResult ='))
    expect(seg).toContain('computeVisionDynamicTimeout(requestOptions.requestTimeoutMs ?? VISION_ANALYSIS_TIMEOUT_MS)')
  })

  it('实现里不再残留 90000 / 210000 硬编码（防回退）', () => {
    const body = slicePlainFn('computeVisionDynamicTimeout')
    expect(body).not.toContain('Math.max(90000')
    expect(body).not.toContain('Math.min(210000')
    expect(body).toContain('Math.max(VISION_ANALYSIS_TIMEOUT_MS')
    expect(body).toContain('Math.min(VISION_ANALYSIS_TIMEOUT_CEIL_MS')
  })

  it('旧注释漂移已订正（不再宣称 [90s, 480s] / 「上限提高到 150s」）', () => {
    expect(src).not.toContain('夹在 [90s, 480s]')
    expect(src).not.toContain('将单次上限提高到 150s')
  })
})
