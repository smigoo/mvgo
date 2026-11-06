/**
 * 会议语音转写错误码（单一事实源）
 *
 * 为什么单独拆成一个无依赖的 .js：
 * - `src/views/meeting/mock/server-asr.js` 是要能被 Node 冒烟脚本（.dev-loop/mock-smoke.mjs）
 *   直接 import 的纯模块，不能走 `.ts`、也不能用 `@/` 别名；
 * - 而这些码必须与后端 `backend-node/src/meeting-asr/meeting-asr.service.ts` 严丝合缝，
 *   两边各写一份必然漂移（历史上就出现过「未配置密钥」被前端当成「音频有问题」）。
 * 因此抽成纯常量模块，由 API 层与适配层共同引用。
 *
 * 改动约定：新增/修改任何码，必须同步三处
 *   1) 本文件
 *   2) 后端 meeting-asr.service.ts 的 MEETING_ASR_ERROR_CODES
 *   3) server-asr.js 的 SERVER_ASR_FAILURES 文案表
 */
export const MEETING_ASR_CODES = Object.freeze({
  /** 服务端未配置密钥（后端 503） */
  CONFIG_MISSING: 'asr_config_missing',
  /** 音频不可用：空文件 / 非 WAV / 头损坏（后端 400） */
  BAD_AUDIO: 'asr_bad_audio',
  /** 音频超长或体积超限（后端 413） */
  AUDIO_TOO_LARGE: 'asr_audio_too_large',
  /** 上游鉴权失败（401/403） */
  AUTH_FAILED: 'asr_auth_failed',
  /** 上游限流（429） */
  RATE_LIMITED: 'asr_rate_limited',
  /** 上游超时（后端 504） */
  TIMEOUT: 'asr_timeout',
  /** 上游返回错误（其他 4xx/5xx，后端 502） */
  UPSTREAM_ERROR: 'asr_upstream_error',
  /** 网络层不可达（后端 502） */
  NETWORK_ERROR: 'asr_network_error',
  /** 上游返回体无法解析（后端 502） */
  BAD_RESPONSE: 'asr_bad_response',

  // ---- 以下仅前端本地产生，后端不会返回 ----
  /** 未接入上传通道（调用方漏传 transport）：属编程错误，必须显式暴露 */
  TRANSPORT_MISSING: 'asr_transport_missing',
  /** 后端未返回可解析的业务码（如 401 会话失效、网关拦截） */
  REQUEST_FAILED: 'asr_request_failed'
})

/** 全部码字面量数组，供归一化时做白名单判定 */
export const MEETING_ASR_CODE_VALUES = Object.freeze(Object.values(MEETING_ASR_CODES))
