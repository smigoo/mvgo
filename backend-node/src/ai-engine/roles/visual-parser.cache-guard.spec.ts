/**
 * 🔴 N-V1-c 单测（2026-11-18 · mc-max-1795008711331-d5bd7800 实锤）
 *
 * 病灶：写缓存前只用 isVisualAnalysisDegraded 判「结构是否为空」，而 Figma 兜底重建的
 * **降级结果有 sections** ⇒ 被判「非退化」⇒ 写入 24h 缓存；_readCache 与命中分支都没有
 * 降级过滤 ⇒ 同分组内重试必命中这份降级结果 ⇒ 跳过 AI 直接再降级再阻断。
 * 实证缓存文件含 `degraded:true` / `visualDegraded:true` / `layoutSource:'figma'`。
 *
 * 判据：isCacheableVisionResult(result)，写侧（execute 出口）与读侧（_readCache）**共用**。
 *
 * ⚠️ visual-parser.js 模块体内含 import.meta（:264 构造器 projectRoot 解析），
 * 本仓 jest 为 CJS transform，整文件直接 import 会 SyntaxError ⇒ 沿用该文件既有 spec
 * 的惯例：源码文本提取 + new Function 执行（同时锁「实现形状」与「行为」）。
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC_PATH = join(__dirname, 'visual-parser.js')
const src = readFileSync(SRC_PATH, 'utf-8')

/** 从源码切出 `export function <name>` 到首个行首 `}` 的函数体 */
function sliceFn(name: string): string {
  const start = src.indexOf(`export function ${name}`)
  expect(start).toBeGreaterThan(-1)
  const end = src.indexOf('\n}', start + 40)
  expect(end).toBeGreaterThan(start)
  return src.slice(start, end + 2).replace('export function', 'function')
}

/** 编译 isCacheableVisionResult（依赖 isVisualAnalysisDegraded，一并注入） */
function loadCacheGuard(): (result: unknown) => boolean {
  const degraded = sliceFn('isVisualAnalysisDegraded')
  const cacheable = sliceFn('isCacheableVisionResult')
  // eslint-disable-next-line no-new-func
  return new Function(`${degraded}\n${cacheable}\nreturn isCacheableVisionResult;`)()
}

const isCacheable = loadCacheGuard()

/** 扁平形态的正常成功结果（vision 真实产出，无降级标志、无 layoutSource 顶层字段） */
function okFlat() {
  return {
    generatedAt: '2026-11-18T00:00:00.000Z',
    stage: 'preview-analysis',
    layout: { type: 'vertical', sections: [{ header: { title: 'A' } }, { header: { title: 'B' } }] },
    styles: { theme: 'dark' },
    interactions: [],
    charts: [],
  }
}

/** 包装形态的正常成功结果（executeResult：sections 埋在 layoutStructure.layout.sections） */
function okWrapped() {
  return {
    generatedAt: '2026-11-18T00:00:00.000Z',
    stage: 'preview-analysis',
    layoutStructure: { layout: { sections: [{ header: { title: 'A' } }] } },
    interactions: [],
    charts: [],
  }
}

describe('isCacheableVisionResult —— 降级结果不得入缓存（N-V1-c）', () => {
  it('正常成功结果（扁平形态，有 sections）⇒ 可缓存', () => {
    expect(isCacheable(okFlat())).toBe(true)
  })

  it('正常成功结果（包装形态）⇒ 可缓存（11-16 形态归一语义不回归）', () => {
    expect(isCacheable(okWrapped())).toBe(true)
  })

  it('🔴 核心回归锚：degraded:true 但**有 sections**（Figma 兜底重建）⇒ 不可缓存（旧判据会放行）', () => {
    const degradedWithSections = {
      ...okFlat(),
      degraded: true,
      layoutSource: 'figma',
      degradeReason: 'LLM invoke timeout after 90000ms [__primary_vision__]',
    }
    // 前提：结构非空 ⇒ 旧判据 isVisualAnalysisDegraded 返回 false（放行）
    expect(isCacheable(degradedWithSections)).toBe(false)
  })

  it('visualDegraded:true ⇒ 不可缓存（即使结构非空）', () => {
    expect(isCacheable({ ...okFlat(), visualDegraded: true })).toBe(false)
  })

  it('layoutSource 非 vision（figma / degraded）⇒ 不可缓存', () => {
    expect(isCacheable({ ...okFlat(), layoutSource: 'figma' })).toBe(false)
    expect(isCacheable({ ...okFlat(), layoutSource: 'degraded' })).toBe(false)
  })

  it('layoutSource === vision ⇒ 可缓存（不误拒显式标注的正常结果）', () => {
    expect(isCacheable({ ...okFlat(), layoutSource: 'vision' })).toBe(true)
  })

  it('结构全空（三全空）⇒ 不可缓存（11-16 既有语义逐字保留）', () => {
    expect(isCacheable({ stage: 'preview-analysis', layout: { sections: [] }, charts: [], interactions: [] })).toBe(false)
    expect(isCacheable({})).toBe(false)
  })

  it('非对象入参 ⇒ 不可缓存（null / 数组 / 字符串）', () => {
    expect(isCacheable(null)).toBe(false)
    expect(isCacheable(undefined)).toBe(false)
    expect(isCacheable([])).toBe(false)
    expect(isCacheable('{}')).toBe(false)
  })

  it('真机重放 mc-max-1795008711331-d5bd7800 缓存同形对象 ⇒ 不可缓存', () => {
    // 取自该任务 .mc-gen/cache/vision-cache/*.json 的实际形状（degraded+visualDegraded+layoutSource:'figma'）
    const cached = {
      generatedAt: '2026-11-18T21:38:30.195Z',
      stage: 'preview-analysis',
      degraded: true,
      degradeReason: 'LLM invoke timeout after 90000ms [__primary_vision__]',
      layoutSource: 'figma',
      visualDegraded: true,
      layoutStructure: { layout: { type: 'vertical', sections: [{ header: { title: '环境监测' } }] } },
      styles: { theme: 'dark' },
      interactions: [],
      charts: [],
      _cachedAt: 1795009110195,
    }
    expect(isCacheable(cached)).toBe(false)
  })
})

describe('N-V1-c 接线契约（写侧与读侧必须共用同一判据，防「写侧修了、读侧漏了」）', () => {
  it('写侧 execute 出口使用 isCacheableVisionResult 决定是否 _writeCache', () => {
    // 截取写缓存段（从「写入 Vision 缓存」注释到 return executeResult）
    const start = src.indexOf('写入 Vision 缓存')
    expect(start).toBeGreaterThan(-1)
    const seg = src.slice(start, src.indexOf('return executeResult', start))
    expect(seg).toContain('isCacheableVisionResult(executeResult)')
    expect(seg).toContain('_writeCache(cacheKey, cacheDir, executeResult)')
    // 反证：不得再退回只看结构是否为空
    expect(seg).not.toMatch(/if \(isVisualAnalysisDegraded\(executeResult\)\)/)
  })

  it('读侧 _readCache 在返回前用 isCacheableVisionResult 拒绝降级缓存', () => {
    const start = src.indexOf('_readCache(cacheKey, cacheDir) {')
    expect(start).toBeGreaterThan(-1)
    const seg = src.slice(start, src.indexOf('_writeCache(', start))
    expect(seg).toContain('isCacheableVisionResult(result)')
    // 拒绝即 return null（不得把降级结果原样交回调用方）
    expect(seg).toMatch(/if \(!isCacheableVisionResult\(result\)\) \{[\s\S]*?return null/)
  })

  it('isVisualAnalysisDegraded 本体未被改动（另有 :1095 拒绝半截数据消费者）', () => {
    const body = sliceFn('isVisualAnalysisDegraded')
    // 两条形态路径仍在（11-16 修复不得回退）
    expect(body).toContain('parsed.layoutStructure?.layout?.sections?.length')
    expect(body).toContain('parsed.layoutStructure?.sections?.length')
    // 不得把降级标志判据塞进本体（职责分离：本体只判结构，缓存判据在 isCacheableVisionResult）
    expect(body).not.toContain('degraded')
    expect(body).not.toContain('layoutSource')
  })
})
