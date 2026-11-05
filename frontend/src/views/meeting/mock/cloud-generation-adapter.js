// T-047：CloudGenerationAdapter 骨架 —— 与 mockGenerationAdapter 保持同构契约
// 只固化接口、依赖就绪度与「未连接即拒绝」行为；不接真云、不调用 LLM、不伪造生成结果。
// 未实现项（需服务端 / 密钥）：JSON mode + schema 约束、解析失败 2 次重试、E-11 返回转写稿 + 部分字段。

export const GENERATION_CONTRACT_METHODS = Object.freeze(['generate'])

export const GENERATION_OUTPUT_FIELDS = Object.freeze([
  'runVersion',
  'template',
  'detectedLanguages',
  'outputLanguage',
  'warnings',
  'truncatedRatio',
  'injectionEvents',
  'fields'
])

export const CLOUD_GENERATION_DEPENDENCIES = Object.freeze([
  { id: 'D-01', name: '云 LLM API 密钥', level: '阻塞', ready: false },
  { id: 'T-047-A', name: 'JSON mode + draft_schema_v1 输出约束', level: '阻塞', ready: false },
  { id: 'T-047-B', name: '解析失败 2 次重试 + E-11 部分字段降级', level: '阻塞', ready: false }
])

export function cloudGenerationReadiness() {
  const missing = CLOUD_GENERATION_DEPENDENCIES.filter((d) => !d.ready)
  return {
    ready: missing.length === 0,
    adapterMode: 'mock',
    missing,
    contractMethods: [...GENERATION_CONTRACT_METHODS],
    outputFields: [...GENERATION_OUTPUT_FIELDS],
    note: '生成侧云适配器未连接；切换 adapter_mode 前需先完成密钥与重试/降级策略'
  }
}

function notConnected(method) {
  return async () => {
    const error = new Error(
      `CloudGenerationAdapter.${method} 未连接：需先完成云 LLM 密钥 / JSON mode schema 约束 / 2 次重试与 E-11 降级（当前 adapter_mode=mock）`
    )
    error.code = 'NOT_CONNECTED'
    error.method = method
    throw error
  }
}

export const cloudGenerationAdapter = Object.freeze({
  id: 'cloud-generation-v1',
  adapterMode: 'cloud',
  supportedLanguages: ['zh-CN', 'en-US'],
  generate: notConnected('generate')
})

// 契约测试：mock / cloud 两个适配器必须实现同一组方法（T-038 生成侧部分）
export function generationAdapterContractCheck(mockAdapter) {
  const mockOk = GENERATION_CONTRACT_METHODS.every(
    (m) => typeof mockAdapter?.[m] === 'function'
  )
  const cloudOk = GENERATION_CONTRACT_METHODS.every(
    (m) => typeof cloudGenerationAdapter[m] === 'function'
  )
  return {
    ok: mockOk && cloudOk,
    methods: [...GENERATION_CONTRACT_METHODS],
    mockOk,
    cloudOk,
    note: '同构校验只覆盖方法签名；cloud 返回真实结构需等依赖就绪后补 T-038 契约测试'
  }
}
