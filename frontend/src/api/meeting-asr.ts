/**
 * @Description: 会议语音转写接口（backend-node /api/meeting-asr/*）
 *
 * 链路：浏览器采集 PCM → 16k mono WAV → POST 本接口 → 后端调云端 ASR → 返回文字。
 *
 * 与后端契约（务必对齐，改后端先改这里）：
 * - GET  /api/meeting-asr/status      就绪度（是否已配置密钥）；**响应绝不含 apiKey**
 * - POST /api/meeting-asr/transcribe  multipart 上传，字段名 `file`，可选 `language`
 *   - 成功：经 ResponseEnvelopeInterceptor 包一层 → 业务体在 `data` 下
 *   - 失败：经 HttpExceptionFilter 包一层 → 业务错误码在 **`detail.code`**
 *
 * 诚实性边界（与后端 meeting-asr.service.ts / 前端 local-asr.js 同一条线）：
 * - 上游失败一律抛错，**绝不**把失败包装成「没有语音内容」；
 * - 文本为空就是空（`text: ''`），由页面按 0 句如实展示，这里不做任何兜底稿；
 * - 本版后端**不返回句级时间戳**（`granularity: 'none'`），段级边界由调用方按分段真实拼装。
 */
import http from '@/core/http'
// 错误码抽到无依赖的 .js：server-asr.js 要能在纯 Node 下被冒烟脚本 import，
// 两边共用同一份常量，避免「后端码改了、前端文案表没改」这类漂移。
import { MEETING_ASR_CODES, MEETING_ASR_CODE_VALUES } from './meeting-asr-codes.js'

export { MEETING_ASR_CODES }

export type MeetingAsrCode = (typeof MEETING_ASR_CODES)[keyof typeof MEETING_ASR_CODES]

/** GET /api/meeting-asr/status 的响应体（脱敏，不含密钥） */
export interface MeetingAsrStatus {
  /** 服务端是否已配置可用密钥 */
  configured: boolean
  baseURL: string
  model: string
  providerKind: 'openai-compatible' | 'dashscope'
  /** 服务端默认语言提示；未配置为 null */
  language: string | null
  timeoutMs: number
  maxBytes: number
  /** 密钥来源：env / file / none —— 便于排查「key 从哪来」，不泄露 key 本身 */
  keySource: 'env' | 'file' | 'none'
  /** 时间戳粒度：none = 本版无句级时间戳 */
  granularity: 'none'
  /** 配置文件绝对路径（服务端本地路径，便于运维定位） */
  configFile: string
}

/** 句级片段。本版后端恒为空数组，仅为二期（Filetrans）预留同形 */
export interface MeetingAsrSegment {
  text: string
  startMs: number
  endMs: number
}

/** POST /api/meeting-asr/transcribe 的响应体 */
export interface MeetingAsrResult {
  /** 识别文本；无语音时为 ''（不是错误） */
  text: string
  /** 本版恒为 [] */
  segments: MeetingAsrSegment[]
  /** 时间戳粒度 */
  granularity: 'none' | 'segment'
  /** 服务端由 WAV 头解析的音频时长；解析失败为 null */
  durationMs: number | null
  /** 实际上游模型名 */
  model: string
  /** 上游 request id，便于对账 */
  requestId: string
  /** 服务端耗时（毫秒） */
  elapsedMs: number
}

/** 统一错误对象：把 HttpError + 后端 `detail.code` 归一成页面可判别的形态 */
export class MeetingAsrError extends Error {
  code: MeetingAsrCode
  httpStatus: number
  /** 上游原始信息（后端截断后的），仅用于排查，不含密钥 */
  upstream: string

  constructor(
    code: MeetingAsrCode,
    message: string,
    options: { httpStatus?: number; upstream?: string } = {}
  ) {
    super(message)
    this.name = 'MeetingAsrError'
    this.code = code
    this.httpStatus = options.httpStatus ?? 0
    this.upstream = options.upstream ?? ''
  }
}

/** 后端统一响应包装为 { success, code, message, data }，core/http 只解析不解包 */
const unwrap = (res: any) => (res && typeof res === 'object' && 'data' in res ? res.data : res)

/**
 * 把任意异常归一成 MeetingAsrError。
 *
 * 关键点：core/http 抛的 HttpError 已带 `status` 与解析后的 `data`，
 * 而业务错误码藏在 `data.detail.code`（HttpExceptionFilter 白名单透传）。
 * 只读 `data.message` 会丢掉错误码，页面就只能笼统说「失败了」——
 * 那正是「未配置密钥」被误当成「音频有问题」的根源。
 */
export function normalizeMeetingAsrError(err: unknown): MeetingAsrError {
  if (err instanceof MeetingAsrError) return err

  const anyErr = err as any
  const status = Number(anyErr?.status) || 0
  const body = anyErr?.data
  const rawCode = body?.detail?.code
  const message =
    (typeof body?.message === 'string' && body.message) ||
    (typeof anyErr?.message === 'string' && anyErr.message) ||
    '转写请求失败'

  // 已知后端码直接透传；未知则按 HTTP 状态给一个前端码（不猜业务语义）
  const code: MeetingAsrCode = (MEETING_ASR_CODE_VALUES as string[]).includes(rawCode)
    ? (rawCode as MeetingAsrCode)
    : status === 401
      ? MEETING_ASR_CODES.AUTH_FAILED
      : MEETING_ASR_CODES.REQUEST_FAILED

  return new MeetingAsrError(code, message, {
    httpStatus: status,
    upstream: typeof body?.detail?.upstream === 'string' ? body.detail.upstream : ''
  })
}

/**
 * 读取服务端就绪度。
 *
 * 默认 `silent401`：本接口用于「进入录制前先探一下是否已配置」，
 * 会话失效时提示由业务动作（真正上传）去报，避免一进页面就弹登录过期。
 */
export async function fetchMeetingAsrStatus(silent401 = true): Promise<MeetingAsrStatus> {
  try {
    const res: any = await http.get('/api/meeting-asr/status', undefined, { silent401 })
    return unwrap(res) as MeetingAsrStatus
  } catch (err) {
    throw normalizeMeetingAsrError(err)
  }
}

// ⚠️ 必须写全路径 `/api/...`：core/http.js 的 resolveUrl 对以 `/` 开头的 URL
// 原样透传、不补 /api 前缀，写成 '/meeting-asr/transcribe' 会请求到站点根路径直接 404。

/**
 * 上传一段 WAV 音频并取回转写文本。
 *
 * @param blob    16k mono 16bit WAV
 * @param opts.language 语言提示（如 'zh'）；留空则用服务端默认
 * @param opts.fileName 上传文件名（仅用于服务端日志定位）
 */
export async function transcribeMeetingAudio(
  blob: Blob,
  opts: { language?: string; fileName?: string } = {}
): Promise<MeetingAsrResult> {
  if (!blob || !blob.size) {
    throw new MeetingAsrError(MEETING_ASR_CODES.BAD_AUDIO, '待上传音频为空')
  }
  const fd = new FormData()
  // 第三参显式给文件名：浏览器默认会写成 "blob"，服务端日志里看不出是第几段
  fd.append('file', blob, opts.fileName || 'segment.wav')
  if (opts.language) fd.append('language', opts.language)

  let res: any
  try {
    // FormData 交给浏览器自行设置 multipart 边界，不要手动指定 Content-Type
    res = await http.upload('/api/meeting-asr/transcribe', fd)
  } catch (err) {
    throw normalizeMeetingAsrError(err)
  }

  const data = unwrap(res) ?? res
  // 防御：后端若以 HTTP 200 + success:false 返回（例如未来改成软失败），这里也要判失败
  const envelopeFailed = res && typeof res === 'object' && res.success === false
  if (envelopeFailed || (data && data.success === false)) {
    throw new MeetingAsrError(
      MEETING_ASR_CODES.REQUEST_FAILED,
      data?.message || '转写失败',
      { upstream: typeof data?.message === 'string' ? data.message : '' }
    )
  }
  return data as MeetingAsrResult
}
