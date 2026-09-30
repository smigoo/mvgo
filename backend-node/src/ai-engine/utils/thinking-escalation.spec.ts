/**
 * 🧠 思考模式第一批（2026-09-30）单测：
 *  - resolveThinkingType 厂商前缀归一（deepseek/deepseek-v4.1-flash 漏发关思考参数实锤修复）
 *  - buildThinkingOffParamCandidates 有序方言候选（第一批骨架：首位=现状行为兼容）
 *  - assessBurnoutEscalation / buildBreakerExhaustedMessage（烧光升级 + 熔断耗尽文案）
 *
 * ⚠️ backend-root.js 在 jest CJS transform 下 `import.meta.url` 不可用 ⇒ dataDir undefined
 *   加载即崩（code-parser.spec 同款），故整链 mock 掉。
 */
jest.mock('../../config/backend-root.js', () => ({
  dataDir: '/tmp/mvgo-test-data',
  backendRoot: '/tmp/mvgo-test-backend',
  projectRoot: '/tmp/mvgo-test',
  workspaceRoot: '/tmp/mvgo-test-backend/workspace',
  customComponentsDir: '/tmp/mvgo-test-backend/workspace/custom-components',
  vue3ComponentsDir: '/tmp/mvgo-test-backend/workspace/vue3-components',
  logsDir: '/tmp/mvgo-test-backend/logs',
  configDir: '/tmp/mvgo-test-backend/config',
}))

import { resolveThinkingType } from './ai-defaults.js'
import {
  buildThinkingOffParamCandidates,
  buildThinkingOffParams,
  markThinkingDialectRouteFailed,
  markThinkingDialectVerified,
  _resetThinkingDialectStateForTest,
} from './model-config.js'
import {
  assessBurnoutEscalation,
  buildBreakerExhaustedMessage,
} from './thinking-escalation.js'

describe('resolveThinkingType 厂商前缀归一（🔴 本次修复的不变量）', () => {
  it('🔴 带 vendor/ 前缀的 deepseek id 也能命中 disabled（原 /^deepseek-v4/ 锚定漏发）', () => {
    expect(resolveThinkingType('deepseek/deepseek-v4.1-flash')).toBe('disabled')
  })
  it('裸 deepseek-v4 id 行为不变', () => {
    expect(resolveThinkingType('deepseek-v4.1-flash')).toBe('disabled')
    expect(resolveThinkingType('deepseek-v4-flash')).toBe('disabled')
  })
  it('推理模型（关不掉）仍是 skip，且前缀形态同样命中', () => {
    expect(resolveThinkingType('deepseek-reasoner')).toBe('skip')
    expect(resolveThinkingType('kimi-k3')).toBe('skip')
  })
  it('其它族带前缀同样归一（qwen）', () => {
    expect(resolveThinkingType('qwen/qwen3.8-max')).toBe('disabled')
  })
  it('非思考模型返回 undefined（不注入）', () => {
    expect(resolveThinkingType('gpt-4o')).toBeUndefined()
    expect(resolveThinkingType('')).toBeUndefined()
  })
})

describe('buildThinkingOffParamCandidates 有序方言候选（第一批骨架）', () => {
  it('🔴 首位 = 现有单一事实源结果（行为兼容，不改变现有调用方）', () => {
    const primary = buildThinkingOffParams('deepseek-v4.1-flash', 'https://api.deepseek.com')
    const candidates = buildThinkingOffParamCandidates('deepseek-v4.1-flash', 'https://api.deepseek.com')
    expect(candidates[0]).toEqual(primary)
    expect(candidates[0]).toEqual({ thinking: { type: 'disabled' } })
  })

  it('microvideo 中转 qwen：主方言 enable_thinking 在首位，无重复', () => {
    const candidates = buildThinkingOffParamCandidates('qwen3.8-max', 'https://relay.microvideo.cn/v1')
    expect(candidates[0]).toEqual({ enable_thinking: false })
    const keys = candidates.map((c) => JSON.stringify(c))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('未知模型/网关时给全部兜底方言（非空）', () => {
    const candidates = buildThinkingOffParamCandidates('some-new-model', '')
    expect(candidates.length).toBeGreaterThanOrEqual(3)
  })

  it('兜底方言按 OpenRouter → enable_thinking → thinking 的顺序追加', () => {
    const candidates = buildThinkingOffParamCandidates('deepseek-v4.1-flash', 'https://api.deepseek.com')
    expect(candidates).toEqual([
      { thinking: { type: 'disabled' } },
      { reasoning: { enabled: false } },
      { enable_thinking: false },
    ])
  })
})

describe('buildThinkingOffParams 方言路由（🔴 2026-09-30 遥测定案）', () => {
  it('🔴 deepseek 经 microvideo 中转：模型族优先，发 thinking:disabled（不再被网关子句劫持成 enable_thinking）', () => {
    // 生产 mc-max 烧光 ×3 根因：旧顺序 u.includes('microvideo') 先命中 ⇒ 发了渠道忽略的 enable_thinking
    expect(
      buildThinkingOffParams('deepseek/deepseek-v4.1-flash', 'https://token.microvideo.cn/v1'),
    ).toEqual({ thinking: { type: 'disabled' } })
    expect(
      buildThinkingOffParams('deepseek-v4-flash', 'https://token.microvideo.cn/v1'),
    ).toEqual({ thinking: { type: 'disabled' } })
  })
  it('qwen 经 microvideo 中转：仍发 enable_thinking:false（行为不变）', () => {
    expect(
      buildThinkingOffParams('qwen3.8-max', 'https://token.microvideo.cn/v1'),
    ).toEqual({ enable_thinking: false })
  })
  it('无模型族匹配但经 microvideo：网关子句仍兜底 enable_thinking:false（行为不变）', () => {
    expect(
      buildThinkingOffParams('z-ai/glm-5.3-flash', 'https://token.microvideo.cn/v1'),
    ).toEqual({ enable_thinking: false })
  })
  it('deepseek 官方直连：行为不变', () => {
    expect(
      buildThinkingOffParams('deepseek-v4.1-flash', 'https://api.deepseek.com'),
    ).toEqual({ thinking: { type: 'disabled' } })
  })
})

describe('关思考方言「自愈顺延 + 实测缓存」（2026-09-30 第二批）', () => {
  const MV = 'https://token.microvideo.cn/v1'
  const DS = 'deepseek/deepseek-v4.1-flash'

  beforeEach(() => {
    // ⚠️ markThinkingDialectVerified 会落盘 model-capability-cache.json（mock dataDir 下），
    // 不清理会跨 run 污染静态路由断言（已实测抓到）。
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('fs').unlinkSync('/tmp/mvgo-test-data/model-capability-cache.json')
    } catch { /* 文件不存在即可 */ }
    _resetThinkingDialectStateForTest()
  })

  it('🔴 烧光标记一次 ⇒ 顺延下一候选；两次 ⇒ 再顺延；全部失效 ⇒ 返回 {}（不发送）', () => {
    expect(buildThinkingOffParams(DS, MV)).toEqual({ thinking: { type: 'disabled' } })
    markThinkingDialectRouteFailed(DS, MV)
    expect(buildThinkingOffParams(DS, MV)).toEqual({ reasoning: { enabled: false } })
    markThinkingDialectRouteFailed(DS, MV)
    expect(buildThinkingOffParams(DS, MV)).toEqual({ enable_thinking: false })
    markThinkingDialectRouteFailed(DS, MV)
    expect(buildThinkingOffParams(DS, MV)).toEqual({})
  })

  it('失效标记按 host 隔离：同模型走别的网关不受影响', () => {
    markThinkingDialectRouteFailed(DS, MV)
    expect(buildThinkingOffParams(DS, 'https://api.deepseek.com')).toEqual({
      thinking: { type: 'disabled' },
    })
  })

  it('实测验证缓存（markThinkingDialectVerified）优先于静态路由', () => {
    markThinkingDialectVerified(DS, MV, { enable_thinking: false }, 'probe')
    expect(buildThinkingOffParams(DS, MV)).toEqual({ enable_thinking: false })
    // host 不一致 → 不命中缓存，回静态路由
    expect(buildThinkingOffParams(DS, 'https://api.deepseek.com')).toEqual({
      thinking: { type: 'disabled' },
    })
  })

  it('无参数 / 空对象不写入缓存', () => {
    markThinkingDialectVerified(DS, MV, {}, 'probe')
    // 未命中缓存 ⇒ 仍走静态路由
    expect(buildThinkingOffParams(DS, MV)).toEqual({ thinking: { type: 'disabled' } })
    // 防御：params 非法输入不抛错（JS 模块导入为 any，运行时校验兜底）
    expect(() => markThinkingDialectVerified('', '', null, 'probe')).not.toThrow()
  })

  it('candidates 首位与 buildThinkingOffParams 有效路由一致（含自愈顺延后）', () => {
    markThinkingDialectRouteFailed(DS, MV)
    const effective = buildThinkingOffParams(DS, MV)
    const candidates = buildThinkingOffParamCandidates(DS, MV)
    expect(candidates[0]).toEqual(effective)
  })
})

describe('assessBurnoutEscalation 烧光升级判定', () => {
  it('第 1 次 → notice（归因提示）', () => {
    expect(assessBurnoutEscalation(1)).toBe('notice')
  })
  it('第 2 次起 → escalate（建议立即换模型）', () => {
    expect(assessBurnoutEscalation(2)).toBe('escalate')
    expect(assessBurnoutEscalation(5)).toBe('escalate')
  })
  it('异常输入（0/undefined）按 notice 处理，不抛错', () => {
    expect(assessBurnoutEscalation(0)).toBe('notice')
    expect(assessBurnoutEscalation(undefined as unknown as number)).toBe('notice')
  })
})

describe('buildBreakerExhaustedMessage 熔断耗尽文案', () => {
  it('包含模型名、停止重试语义与建议名单', () => {
    const msg = buildBreakerExhaustedMessage({
      model: 'deepseek-v4.1-flash',
      cooldownWaits: 1,
      suggestions: ['qwen3.8-max', 'glm-5.3-flash'],
    })
    expect(msg).toContain('deepseek-v4.1-flash')
    expect(msg).toContain('停止重试')
    expect(msg).toContain('qwen3.8-max / glm-5.3-flash')
  })
  it('无建议名单时给出明确指引（配备用 provider）', () => {
    const msg = buildBreakerExhaustedMessage({ model: 'x', cooldownWaits: 2, suggestions: [] })
    expect(msg).toContain('池内暂无其它可用 provider')
  })
})
