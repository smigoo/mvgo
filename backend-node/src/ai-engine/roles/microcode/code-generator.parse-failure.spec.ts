import { jest } from '@jest/globals'

// ⚠️ 加载期拦截：下列模块内部使用 import.meta，jest 未启用 --experimental-vm-modules
// （CJS 模式）时直接 import 会让整个套件加载失败（既有 13 个套件失败的同一根因）。
// 用工厂函数提供替身，工厂不加载原模块，故不会触发 import.meta 解析错误。
// 必须同时提供 logsDir：logger.js:8 从本模块导入 logsDir，
// 缺失时 new Logger() 会因 join(undefined, ...) 抛错导致套件加载失败。
// 日志目录指向 tmpdir，避免测试真实写日志污染项目。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  logsDir: require('os').tmpdir(),
  dataDir: require('os').tmpdir(),
  tempComponentsDir: require('os').tmpdir(),
}), { virtual: true })

jest.mock('../../utils/sfc-semantics.js', () => ({
  dedupeScriptImports: (s: string) => s,
  dedupeScriptDeclarations: (s: string) => s,
  dedupeMcComponentBuilder: (s: string) => s,
  dedupeLifecycleHooks: (s: string) => s,
  validateVueScriptSemantics: () => ({ issues: [] }),
  extractComponentTagNames: () => [],
  VUE_BUILTIN_COMPONENTS: [],
}))

// prompt-loader.js / resource-import-guard.js 同样在模块顶层使用 import.meta
// （fileURLToPath），必须一并拦截，否则加载 prompt-builder.js 时会连带触发解析错误。
// 注：buildRetryPrompt 只透传 retry-prompt.js、并不消费 prompt-loader 的返回值，
// 故这里给空实现即可，不影响被测行为。
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
  getProviderPool: () => ({
    recordTimeout: () => {},
    get: () => null,
  }),
}))

// 🎯 被测行为的核心替身：控制 LLM 返回内容
jest.mock('../../utils/llm-timeout.js', () => ({
  invokeWithTimeout: jest.fn(),
}))

import { generateSingleChunk } from './code-generator.js'
import { invokeWithTimeout } from '../../utils/llm-timeout.js'

const mockInvoke = invokeWithTimeout as unknown as jest.Mock

describe('P0 · parse_failure 纳入重试（事故 mc-max-1788272805835-1e2fe5ad 行为回归）', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  const chunk = { files: ['package/index.vue'], contextFiles: [] }
  const input = { componentName: 'demo', outputPath: '/tmp/mvgo-parse-failure-test' }
  const options = { llm: {}, model: 'test-model', name: 'microcode-engineer' }

  it('LLM 输出缺 files 时：进入重试（而非让异常直接穿透）', async () => {
    // 既不是分隔符格式、也不是合法 JSON —— parseCodeOutput 会抛「缺少 files 字段」
    const illegal = '抱歉，我无法按要求生成该组件的完整代码。以下是一段说明文字。'
    mockInvoke.mockResolvedValue({ content: illegal, usage: {} })

    await expect(
      generateSingleChunk('原始完整 prompt', chunk, input, options),
    ).rejects.toThrow(/无法解析/)

    // maxAttempts 默认 2 → LLM 应被调用 2 次（第 1 次失败 + 第 2 次重试）
    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })

  it('重试时携带 parse_failure 修复提示（要求重新输出含 files 的合规 JSON）', async () => {
    const illegal = '这不是合规 JSON，没有 files 字段，无法解析。'
    mockInvoke.mockResolvedValue({ content: illegal, usage: {} })

    await expect(
      generateSingleChunk('原始完整 prompt', chunk, input, options),
    ).rejects.toThrow()

    const firstPrompt = mockInvoke.mock.calls[0][1]
    const retryPrompt = mockInvoke.mock.calls[1][1]

    // 第 1 次用原始 prompt
    expect(firstPrompt).toBe('原始完整 prompt')
    // 第 2 次必须是 buildRetryPrompt 产出的精简重试 prompt，且带 parse_failure 专属提示
    expect(retryPrompt).not.toBe(firstPrompt)
    expect(retryPrompt).toContain('files')
    expect(retryPrompt).toContain('JSON')
    expect(retryPrompt).toContain('重新输出')
  })

  it('重试耗尽后抛「准确」错误，不再误报为截断/语义不完整', async () => {
    const illegal = '无法解析的输出文本'
    mockInvoke.mockResolvedValue({ content: illegal, usage: {} })

    let err: Error | null = null
    try {
      await generateSingleChunk('原始完整 prompt', chunk, input, options)
    } catch (e) {
      err = e as Error
    }

    expect(err).not.toBeNull()
    expect(err!.message).toContain('无法解析')
    // 旧行为会走第 992 行通用错误，误报成「输出被截断或语义不完整」
    expect(err!.message).not.toContain('输出被截断或语义不完整')
  })

  it('对照：LLM 输出合规时能正常返回，不误触发重试', async () => {
    const legal = JSON.stringify({
      files: { 'package/index.vue': '<template><div>ok</div></template>' },
    })
    mockInvoke.mockResolvedValue({ content: legal, usage: {} })

    const res = await generateSingleChunk('原始完整 prompt', chunk, input, options)

    expect(res.files['package/index.vue']).toContain('<template>')
    // 一次成功，不重试
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })
})
