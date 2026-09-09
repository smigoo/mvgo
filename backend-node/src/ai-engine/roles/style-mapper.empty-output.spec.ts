/**
 * 单测：style-mapper 空串防御（R8 修复锁死）
 *
 * 背景（2026-08-31 日志取证）：
 * deepseek-v4-flash 推理模型 maxTokens=6144，推理吃光全部输出预算，
 * outputTokens 恰好 6144 且 content 为空串。
 *
 * 修复前两处缺口：
 *   1. style-mapper.map() 直读 response.content，绕过 extractModelText() 的
 *      reasoning_content 兜底（DeepSeek 等推理模型把思考写在 reasoning_content）。
 *   2. invokeWithTimeout 不透传 treatEmptyAsFailure，空串被网关当"成功"返回，
 *      下游 robustJSONParse 报 empty_input:empty_string 后走劣质合成兜底。
 *
 * 本单测锁死：
 *   A. invokeLangChainModel({ treatEmptyAsFailure: true }) 时网关对空 content
 *      抛 MODEL_EMPTY_OUTPUT（熔断 + 换 provider 重试）。
 *   B. map() 走 extractModelText：content 空 + reasoning_content 有值时仍能解析。
 *   C. map() 调用 invokeWithTimeout 时启用了 treatEmptyAsFailure: true。
 */

jest.mock('../logger/index.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// 🚨 base-agent.js 使用 import.meta（jest CJS 基线问题，无法加载），
// mock 为最小桩；extractModelText 与 base-agent.js:426-453 真实实现同逻辑
// （本测试场景只需 string 分支 + reasoning_content 兜底两个分支）。
jest.mock('../agents/base-agent.js', () => ({
  BaseAgent: class BaseAgent {
    constructor(config = {}) {
      Object.assign(this, config)
    }
    loadReferenceFiles() {
      return {}
    }
    extractModelText(response) {
      const raw = response?.content
      let text = ''
      if (typeof raw === 'string') text = raw
      if (text && text.trim()) return text
      const reasoning =
        response?.additional_kwargs?.reasoning_content || response?.reasoning_content
      return reasoning ? String(reasoning) : ''
    }
  },
}))

// 把 style-mapper 对 invokeWithTimeout 的依赖替换为可观测的 mock。
jest.mock('../utils/llm-timeout.js', () => ({
  invokeWithTimeout: jest.fn(),
}))

// 🚨 provider-pool.js 经 backend-root.js 间接使用 import.meta（jest CJS 基线问题），
// virtual mock 掉。注意：必须放在 require 之前。
jest.mock('../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  dataDir: process.cwd() + '/data',
  workspaceDir: process.cwd() + '/workspace',
  backendRoot: process.cwd(),
}), { virtual: true })

// 网关的 provider-pool 依赖也一并 mock（记录超时/熔断，不影响断言主线）
jest.mock('../utils/provider-pool.js', () => ({
  getProviderPool: () => ({
    recordTimeout: jest.fn(),
    recordSuccess: jest.fn(),
    pick: () => null,
    pickProvider: () => null,
  }),
  ProviderPool: class {},
}), { virtual: true })

const { attachUnifiedInvoke, invokeLangChainModel } = require('../utils/ai-request-gateway.js')
const { StyleMapper } = require('./style-mapper.js')
const { invokeWithTimeout: mockedInvoke } = require('../utils/llm-timeout.js')

describe('style-mapper 空串防御（R8）', () => {
  beforeEach(() => {
    mockedInvoke.mockReset()
  })

  it('A. treatEmptyAsFailure: true 时网关对空 content 抛 MODEL_EMPTY_OUTPUT（而非成功返回空串）', async () => {
    const rawInvoke = jest.fn(async () => ({ content: '' }))
    const llm = { invoke: rawInvoke, modelName: 'deepseek-v4-flash' }
    attachUnifiedInvoke(llm, { context: 'empty-gate', model: 'deepseek-v4-flash' })

    await expect(
      invokeLangChainModel({
        llm,
        prompt: 'test',
        context: 'empty-gate',
        treatEmptyAsFailure: true,
        requestTimeoutMs: 2000,
        requestMaxRetries: 0,
      }),
    ).rejects.toMatchObject({ code: 'MODEL_EMPTY_OUTPUT' })
  })

  it('B. map() 走 extractModelText：content 空 + reasoning_content 有值时仍解析出主题变量', async () => {
    // 模拟 deepseek-v4-flash 推理模型：正文被截断为空，思考写在 reasoning_content
    const validMapping = {
      themeVars: { '--colorPrimary': '#1890ff' },
      lessVariables: { colorPrimary: '#1890ff' },
      cssClasses: {},
      tokenCoverage: 0.8,
    }
    mockedInvoke.mockResolvedValueOnce({
      content: '',
      additional_kwargs: {
        reasoning_content: '```json\n' + JSON.stringify(validMapping) + '\n```',
      },
    })

    const mapper = new StyleMapper({ model: 'test-model' })
    const parsed = await mapper.map([{ type: 'color', value: '#1890ff', description: '主色' }])

    expect(parsed.themeVars).toEqual({ '--colorPrimary': '#1890ff' })
    expect(parsed.tokenCoverage).toBe(0.8)
  })

  it('C. map() 调用 invokeWithTimeout 时启用 treatEmptyAsFailure: true', async () => {
    mockedInvoke.mockResolvedValueOnce({
      content: JSON.stringify({
        themeVars: { '--colorPrimary': '#1890ff' },
        lessVariables: {},
        cssClasses: {},
        tokenCoverage: 0.5,
      }),
    })

    const mapper = new StyleMapper({ model: 'test-model' })
    await mapper.map([{ type: 'color', value: '#1890ff', description: '主色' }])

    expect(mockedInvoke).toHaveBeenCalledTimes(1)
    // invokeWithTimeout(llm, prompt, timeoutMs, context, onProgress, options)
    const options = mockedInvoke.mock.calls[0][5]
    expect(options.treatEmptyAsFailure).toBe(true)
  })
})
