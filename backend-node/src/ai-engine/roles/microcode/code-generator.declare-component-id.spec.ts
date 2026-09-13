import { jest } from '@jest/globals'

// ⚠️ 加载期拦截：backend-root.js 内部使用 import.meta，jest CJS 模式下直接 import 会加载失败
//（与 code-generator.deterministic-template.spec.ts / parse-failure.spec.ts 同款替身）。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  logsDir: require('os').tmpdir(),
  dataDir: require('os').tmpdir(),
  tempComponentsDir: require('os').tmpdir(),
}), { virtual: true })

// sfc-semantics.js 内部使用 import.meta（jest CJS 模式不可解析）→ 同款替身
jest.mock('../../utils/sfc-semantics.js', () => ({
  dedupeScriptImports: (s: string) => s,
  dedupeScriptDeclarations: (s: string) => s,
  dedupeMcComponentBuilder: (s: string) => s,
  dedupeLifecycleHooks: (s: string) => s,
  validateVueScriptSemantics: () => ({ issues: [] }),
  extractComponentTagNames: () => [],
  VUE_BUILTIN_COMPONENTS: [],
}))

jest.mock('../../utils/prompt-loader.js', () => ({
  loadMd: () => '',
  validatePromptsDir: () => true,
  buildSharedSections: () => '',
  trimConstraintsForContext: (c = '') => c,
  buildConcerns: () => '',
  formatAssetsList: () => '',
  buildTextInventorySection: () => '',
  buildStructureMarkersSection: () => '',
  buildFigmaStage: () => '',
}))

jest.mock('../../utils/resource-import-guard.js', () => ({
  extractResourceVarNames: () => [],
  resolveResourceDomMapping: () => ({}),
}))

jest.mock('../../utils/provider-pool.js', () => ({
  getProviderPool: () => ({ recordTimeout: () => {}, get: () => null }),
}))

jest.mock('../../utils/llm-timeout.js', () => ({ invokeWithTimeout: jest.fn() }))

/**
 * 🛡️ 刀 8a（2026-09-13）· declare.componentId 确定性装配 · 单测
 *
 * 真实事故：phase2 微码链路 engineer input 顶层无 sessionId（只在 input.ctx 内），
 * 而 safeGenerateDeclareJson 读 input.sessionId → 恒空 → 走
 * Math.random().toString(36).slice(2,10) 随机兜底 → componentId 出现不可剥离的
 * base36 随机段（c-device-monitor-00g6b7vh-075b13a4）→ classPrefixOf 剥离失效 →
 * CODE-003 全量误判 + autoFix 双前缀叠加（common.less ~半数死样式）。
 *
 * 本 spec 锁定：① 顶层 sessionId 优先；② ctx.sessionId 兜底；③ options.sessionId 兜底；
 * ④ 全都缺 → 不注入随机尾段（componentId 保持干净）；⑤ 尾段非 hex → 不附加。
 */
import { resolveDeclareComponentId } from './code-generator.js'
import { classPrefixOf } from '../../utils/component-naming.js'

const SID = 'mc-1789284222821-075b13a4' // 尾 8 hex = 075b13a4

describe('刀 8a: resolveDeclareComponentId', () => {
  it('顶层 sessionId → c-<语义>-<尾8hex>', () => {
    const r = resolveDeclareComponentId({ componentName: 'device-monitor', sessionId: SID })
    expect(r.componentId).toBe('c-device-monitor-075b13a4')
    expect(r.sessionIdSuffix).toBe('075b13a4')
  })

  it('顶层缺失 → 回退 input.ctx.sessionId（本次事故的直接修法）', () => {
    const r = resolveDeclareComponentId({
      componentName: 'device-monitor',
      ctx: { sessionId: SID },
    })
    expect(r.componentId).toBe('c-device-monitor-075b13a4')
  })

  it('顶层缺失 → 回退 options.sessionId', () => {
    const r = resolveDeclareComponentId(
      { componentName: 'device-monitor' },
      { sessionId: SID },
    )
    expect(r.componentId).toBe('c-device-monitor-075b13a4')
  })

  it('全缺 → 不注入随机尾段（绝不把不可剥离的随机段写进 componentId）', () => {
    const r = resolveDeclareComponentId({ componentName: 'device-monitor' })
    expect(r.componentId).toBe('c-device-monitor')
    expect(r.sessionIdSuffix).toBe('')
    // 反例守卫：旧实现此处会产出 c-device-monitor-<8位base36随机>，形如
    // c-device-monitor-00g6b7vh —— 8 位 [a-z0-9] 且非纯 hex，正是事故形态。
    expect(r.componentId).not.toMatch(/-[a-z0-9]{8}$/)
  })

  it('sessionId 尾段非 hex → 不附加（保持可剥离性契约）', () => {
    const r = resolveDeclareComponentId({
      componentName: 'device-monitor',
      sessionId: 'mc-1789284222821-00g6b7vh',
    })
    expect(r.componentId).toBe('c-device-monitor')
    expect(r.sessionIdSuffix).toBe('')
  })

  it('componentName 已带 c- 前缀 → 幂等，不双写 c-', () => {
    const r = resolveDeclareComponentId({ componentName: 'c-device-monitor', sessionId: SID })
    expect(r.componentId).toBe('c-device-monitor-075b13a4')
  })

  it('不变量：装配结果经 classPrefixOf 还原 === 语义干（CODE-003 契约）', () => {
    const r = resolveDeclareComponentId({
      componentName: 'device-monitor',
      ctx: { sessionId: SID },
    })
    expect(classPrefixOf(r.componentId)).toBe('c-device-monitor')
  })
})
