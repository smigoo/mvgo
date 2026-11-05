// T-031 预留：CloudAudioAdapter 骨架（与 MockAudioAdapter 同构的 AudioPipelineAdapter 契约）
// 重要：云服务商密钥 / 后端上传接口 / SEC-05 委托处理协议均未就绪，本适配器**不接真云**。
// 任何方法调用都抛 NOT_CONNECTED，严禁伪造云端转写结果；readiness() 供页面展示依赖就绪度。

export const CLOUD_DEPENDENCIES = Object.freeze([
  {
    id: 'D-01',
    name: '云 ASR 服务商选型与密钥',
    ready: false,
    level: '阻塞',
    owner: '需求方 / 后端',
    note: '密钥不入库、不写进前端；未就绪时 adapter_mode 保持 mock'
  },
  {
    id: 'T-013',
    name: '后端音频上传接口',
    ready: false,
    level: '阻塞',
    owner: '后端',
    note: '前端只做本地采集与归一化，不上传'
  },
  {
    id: 'SEC-05',
    name: '委托处理协议法务确认',
    ready: false,
    level: '阻塞',
    owner: '法务',
    note: '需明确不用于训练 / 不留存音频 / 出境合规'
  },
  {
    id: 'Q-07',
    name: '语种清单与供应商支持列表',
    ready: false,
    level: '并行',
    owner: '产品',
    note: '按 v1.2 默认假设 L1 先行，不阻塞 S3 启动'
  }
])

// 与 mock/audio-adapter.js 的 mockAudioAdapter 方法名集合一致；供契约同构断言使用
export const CONTRACT_METHODS = Object.freeze([
  'normalize',
  'detectLanguage',
  'diarize',
  'transcribe',
  'classifyGender'
])

export function cloudReadiness() {
  const blockers = CLOUD_DEPENDENCIES.filter((d) => d.level === '阻塞')
  const missing = blockers.filter((d) => !d.ready)
  return {
    ready: missing.length === 0,
    missing,
    dependencies: CLOUD_DEPENDENCIES,
    adapterMode: missing.length === 0 ? 'cloud' : 'mock'
  }
}

function notConnected(method) {
  return async () => {
    const error = new Error(
      `CloudAudioAdapter.${method} 未连接：需先完成云密钥 / 后端上传接口 / SEC-05 协议（当前 adapter_mode=mock）`
    )
    error.code = 'NOT_CONNECTED'
    error.method = method
    throw error
  }
}

export const cloudAudioAdapter = {
  id: 'cloud-audio-v1',
  adapterMode: 'cloud',
  supportedLanguages: [],
  readiness: cloudReadiness,
  normalize: notConnected('normalize'),
  detectLanguage: notConnected('detectLanguage'),
  diarize: notConnected('diarize'),
  transcribe: notConnected('transcribe'),
  classifyGender: notConnected('classifyGender')
}
