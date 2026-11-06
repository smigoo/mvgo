// 服务端远程转写适配器（真实录音 → 文字，走 backend-node /api/meeting-asr）
//
// 为什么要有这一层，而不是在页面里直接 fetch：
//   页面（index.vue）的增量转写框架已经稳定 —— 按窗口切片、重叠去重、时间游标推进、
//   失败分类、逐句「设备轨」归属。这些逻辑不该为「换一个转写后端」重写一遍。
//   所以这里保持与 local-asr.js **同构**的对外契约：
//     createXxx({ model, onPhase, onProgress }) → { phase, progress, load(), transcribe(), toUtterances(), describe() }
//   页面只换引擎实例，其余链路（含 0 句分流、错误分类渲染）原样复用。
//
// 与 local-asr.js 的三点实质差异（不对称的地方必须写清楚，别让后来人以为只是换个 URL）：
//   1. 音频会离开本机：单段封成 16k mono WAV 后**上传到后端**，再由后端调云端 ASR。
//      因此不再有「PCM 只在本页内存」这条边界，页面对应文案必须同步改。
//   2. 没有权重下载：不存在「加载模型」阶段，load() 改成探测服务端就绪度
//      （是否配了密钥）。未配置时**立即如实失败**，而不是每个窗口都白跑一次。
//   3. 无句级时间戳：上游 Qwen3-ASR-Flash 的 OpenAI 兼容模式不返回时间戳，
//      所以只有**段级真实边界**（本段确实从 offsetMs 开始、持续 sliceMs），
//      页面如实标「段级」，不得伪造成句级。
//
// 本文件是**纯模块**：不 import `@/` 别名、不 import `.ts`，只做相对导入，
// 以便 .dev-loop 的 Node 冒烟脚本直接 import 做断言。也因此 transport 由页面注入。

import { ASR_PHASES } from './local-asr.js'
import { encodeWav } from './audio-dsp.js'
import { MEETING_ASR_CODES } from '../../../api/meeting-asr-codes.js'

/** 引擎展示名。页面文案同步用这个常量，避免两处写死字符串 */
export const SERVER_ASR_LABEL = '云端转写（服务端）'

/** 服务端转写失败分类：把后端错误码翻成「人话结论 + 可照做的下一步」 */
export const SERVER_ASR_FAILURES = Object.freeze({
  [MEETING_ASR_CODES.CONFIG_MISSING]: {
    label: '服务端未配置转写密钥',
    hint:
      '在 backend-node 配 MEETING_ASR_API_KEY（或 DASHSCOPE_API_KEY）环境变量，' +
      '或写入 data/meeting-asr-config.json 后重启后端。未配置时不会降级成示例稿，就是没有文字。'
  },
  [MEETING_ASR_CODES.BAD_AUDIO]: {
    label: '音频无法被服务端识别',
    hint:
      '服务端当前只接受 16k 单声道 WAV（本项目上传的就是这个格式）。' +
      '若换成 mp3 / m4a 等格式，需先在服务端加转码能力，本版未支持。'
  },
  [MEETING_ASR_CODES.AUDIO_TOO_LARGE]: {
    label: '单段音频超过服务端上限',
    hint:
      '单次上传上限默认 10MB（16k mono WAV 约 5.2 分钟）。' +
      '本页按 ~30s 切段，正常不会触发；若调大过单窗时长，请改回 30s 以内。'
  },
  [MEETING_ASR_CODES.AUTH_FAILED]: {
    label: '转写密钥被上游拒绝',
    hint:
      '上游返回 401/403：确认密钥有效且未过期，并已开通该 ASR 模型（默认 qwen3-asr-flash）的调用权限。'
  },
  [MEETING_ASR_CODES.RATE_LIMITED]: {
    label: '上游限流（429）',
    hint: '并发过高或额度耗尽：等几十秒再重试；持续 429 请检查账户余额与并发配额。'
  },
  [MEETING_ASR_CODES.TIMEOUT]: {
    label: '上游转写超时',
    hint:
      '服务端等待超过配置上限（默认 90s）。缩短单段时长（本页已按 30s 切段），' +
      '或在服务端调大 MEETING_ASR_TIMEOUT_MS。'
  },
  [MEETING_ASR_CODES.UPSTREAM_ERROR]: {
    label: '上游转写服务返回错误',
    hint:
      '上游返回 4xx/5xx：本接口只回 HTTP 状态码与概述，不含上游原文，' +
      '详细原因看后端日志（模型名拼错、参数形态不被接受等）。'
  },
  [MEETING_ASR_CODES.NETWORK_ERROR]: {
    label: '服务端连不上上游转写服务',
    hint: '后端所在机器到 ASR 端点的网络不通（DNS / 出网策略 / 代理）：在服务器上直接 curl 该端点验证。'
  },
  [MEETING_ASR_CODES.BAD_RESPONSE]: {
    label: '上游返回体无法解析',
    hint: '上游回的不是预期 JSON：可能是网关拦截页，或服务端 providerKind 与实际端点形态不匹配。'
  },
  [MEETING_ASR_CODES.TRANSPORT_MISSING]: {
    label: '前端未接入上传通道',
    hint:
      '创建引擎时漏传 transport（应为 @/api/meeting-asr 的 transcribeMeetingAudio）。' +
      '这是代码接线问题，不是音频问题。'
  },
  [MEETING_ASR_CODES.REQUEST_FAILED]: {
    label: '后端未返回可识别的业务错误',
    hint:
      '常见于会话失效（401）或网关拦截：刷新页面重新登录后重试；' +
      '若持续失败，打开控制台 Network 看该请求的响应体。'
  },
  unknown: {
    label: '云端转写失败',
    hint: '未识别的失败：打开浏览器控制台查看原始报错，再按报错内容排查。'
  }
})

/** 本地产生的引擎错误（服务端错误由 API 层抛出，形态一致：都带 .code 与 .httpStatus） */
export class ServerAsrError extends Error {
  constructor(code, message, httpStatus = 0, upstream = '') {
    super(message)
    this.name = 'ServerAsrError'
    this.code = code
    this.httpStatus = httpStatus
    this.upstream = upstream
  }
}

function buildFailure(code, raw = '') {
  const meta = SERVER_ASR_FAILURES[code] || SERVER_ASR_FAILURES.unknown
  return {
    code,
    label: meta.label,
    hint: meta.hint,
    raw,
    // 页面主文案：人话结论 + 原始报错（原始报错只作定位，不替代结论）
    text: raw ? `${meta.label}（${raw}）` : meta.label
  }
}

/**
 * 把一次服务端转写失败归到可操作分类上。
 *
 * 与 local-asr.js 的 describeAsrFailure 分开的原因：两边失败面完全不同 ——
 * 本地是「权重下载 / wasm 内核 / 内存」，服务端是「密钥 / 上游限流 / 超时 / 网关」。
 * 硬套同一张表只会给出误导性的下一步。
 *
 * @param {unknown} error 抛出的异常（API 层的 MeetingAsrError 带 .code）
 * @returns {{ code: string, label: string, hint: string, raw: string, text: string }}
 */
export function describeServerAsrFailure(error) {
  if (error && typeof error === 'object' && typeof error.code === 'string' && error.code) {
    const known = SERVER_ASR_FAILURES[error.code]
    if (known) {
      // 目前 controller 只透传 { code, message }（upstream 被全局 filter 白名单剔除），
      // 所以 raw 实际总是取 message；保留 upstream 分支是为了将来后端透传时不用改这里。
      const raw = String(error.upstream || error.message || '').slice(0, 200)
      return buildFailure(error.code, raw)
    }
  }
  const raw =
    error instanceof Error
      ? String(error.message || error.name || '')
      : error == null
        ? ''
        : String(error)
  return buildFailure('unknown', raw.slice(0, 200))
}

/** 16k mono 每毫秒的采样点数（与 audio-dsp.js 的 TARGET_SAMPLE_RATE 一致） */
const SAMPLES_PER_MS = 16
/** 段最短时长：不足 0.1s 的碎片没有识别价值，跳过（与 local-asr 同口径） */
const MIN_SLICE_SAMPLES = 1600
/** 默认单段时长（ms）：与页面 ASR_MAX_WINDOW_MS 一致；16k mono 30s ≈ 960KB，远低于 10MB 上限 */
const DEFAULT_MAX_CHUNK_MS = 30000

/**
 * 创建服务端转写引擎。
 *
 * @param {object} options
 * @param {(blob: Blob, opts: {language?: string, fileName?: string}) => Promise<object>} options.transport
 *        上传通道，由页面注入（`transcribeMeetingAudio`）。**必填**：本模块刻意不 import
 *        `@/api/*`，以保证 Node 冒烟脚本能直接 import 本文件。
 * @param {() => Promise<object>} [options.probeStatus] 就绪度探测（`fetchMeetingAsrStatus`）。不传则不预检。
 * @param {string} [options.language] 语言提示；留空用服务端默认
 * @param {number} [options.maxChunkMs] 单段上限
 * @param {Function} [options.onPhase]
 * @param {Function} [options.onProgress]
 */
export function createServerAsr(options = {}) {
  const transport = typeof options.transport === 'function' ? options.transport : null
  const probeStatus = typeof options.probeStatus === 'function' ? options.probeStatus : null
  const optLanguage = String(options.language || '').trim()
  const maxChunkMs = Number.isFinite(options.maxChunkMs) && options.maxChunkMs > 0
    ? options.maxChunkMs
    : DEFAULT_MAX_CHUNK_MS
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {}
  const onPhase = typeof options.onPhase === 'function' ? options.onPhase : () => {}

  let phase = ASR_PHASES.idle
  let loadPromise = null
  // 就绪后由服务端告知的真实模型名 / 时间戳粒度 / 端点，供 describe() 如实上报
  let resolvedModel = String(options.model || '')
  let granularity = 'none'
  let baseURL = ''
  let keySource = 'none'
  let lastProgress = { file: '', loaded: 0, total: 0, percent: 0 }
  // 语言提示优先级：服务端配置 > 创建时传入 > 不指定（让模型自己判）
  let langHint = optLanguage

  function setPhase(next, detail = '') {
    phase = next
    onPhase(next, detail)
  }

  /**
   * 预检服务端就绪度。
   * 为什么值得单独一步：不预检的话，「没配密钥」会在每个窗口重试一次，
   * 页面持续显示上一次失败、录音却在推进，用户看到的是「一直在转但没结果」。
   * 预检失败即 throw，由页面按失败分类立刻给出「去配密钥」的结论。
   */
  async function load() {
    if (loadPromise) return loadPromise
    loadPromise = (async () => {
      if (!transport) {
        setPhase(ASR_PHASES.error, 'transport missing')
        throw new ServerAsrError(
          MEETING_ASR_CODES.TRANSPORT_MISSING,
          '未注入上传通道（transport），无法进行服务端转写'
        )
      }
      if (!probeStatus) {
        // 未提供探测能力：不假装已就绪，直接放行让首次上传如实报错
        setPhase(ASR_PHASES.ready, SERVER_ASR_LABEL)
        return true
      }
      setPhase(ASR_PHASES.loading, SERVER_ASR_LABEL)
      const status = await probeStatus()
      resolvedModel = String(status?.model || resolvedModel || '')
      baseURL = String(status?.baseURL || '')
      keySource = String(status?.keySource || 'none')
      granularity = String(status?.granularity || 'none')
      if (!status?.configured) {
        setPhase(ASR_PHASES.error, MEETING_ASR_CODES.CONFIG_MISSING)
        throw new ServerAsrError(
          MEETING_ASR_CODES.CONFIG_MISSING,
          '服务端未配置语音转写密钥，无法转写',
          503
        )
      }
      // 服务端配了默认语言就以它为准：前端猜的语种不如服务端配置权威
      if (status?.language) langHint = String(status.language).trim()
      setPhase(ASR_PHASES.ready, resolvedModel || SERVER_ASR_LABEL)
      return true
    })().catch((error) => {
      loadPromise = null
      throw error
    })
    return loadPromise
  }

  /**
   * 转写一段 16k mono PCM。
   *
   * 分段：与 local-asr.js 完全同口径（按 maxChunkMs 切、不足 0.1s 跳过）。
   * 时间戳：**段级真实边界**。每段确实是从 offsetMs 起的一段连续音频，
   * 起止由采样数算出（不是模型给的时间戳，也不会伪造成句级）。
   *
   * @param {Float32Array} pcm 16k mono
   * @param {{ offsetMs?: number, language?: string, maxChunkMs?: number }} runOptions
   */
  async function transcribe(pcm, runOptions = {}) {
    if (!pcm || !pcm.length) {
      return { text: '', chunks: [], durationMs: 0, model: resolvedModel, granularity }
    }
    const offsetMs = Number.isFinite(runOptions.offsetMs) ? runOptions.offsetMs : 0
    const chunkMs = Number.isFinite(runOptions.maxChunkMs) && runOptions.maxChunkMs > 0
      ? runOptions.maxChunkMs
      : maxChunkMs

    await load()
    // ⚠️ 语言提示必须在 load() 之后取：服务端下发的语种是在探测阶段写进 langHint 的，
    //    提前取会拿到创建时的空值，等于把「服务端说用 zh」这个信息丢掉。
    const language = String(runOptions.language || '').trim() || langHint
    setPhase(ASR_PHASES.running, resolvedModel || SERVER_ASR_LABEL)

    // 先收集所有有效切片，这样进度分母（共几段）是确定的，而不是事后才知道
    const slices = []
    const step = Math.max(1000, chunkMs) * SAMPLES_PER_MS
    for (let start = 0; start < pcm.length; start += step) {
      const slice = pcm.subarray(start, Math.min(start + step, pcm.length))
      if (slice.length < MIN_SLICE_SAMPLES) continue
      slices.push({ start, slice })
    }

    const chunks = []
    let text = ''
    let elapsedMs = 0

    for (let i = 0; i < slices.length; i += 1) {
      const { start, slice } = slices[i]
      // encodeWav 固定输出 16k mono 16bit、标准 44 字节头 ——
      // 正是服务端 parseWavDurationMs 能解析、且上游 input_audio 能吃的格式
      const wav = encodeWav(slice)
      const blob = new Blob([wav], { type: 'audio/wav' })
      const out = await transport(blob, {
        language,
        // 文件名带上段序号：服务端日志里能直接看出是哪一段失败
        fileName: `seg-${i + 1}-of-${slices.length}.wav`
      })

      if (out && typeof out.model === 'string' && out.model) resolvedModel = out.model
      if (out && typeof out.granularity === 'string' && out.granularity) granularity = out.granularity
      elapsedMs += Number(out?.elapsedMs) || 0

      // 段基准与段长都用采样数换算：samples / 16 = 毫秒（16k 下每毫秒 16 个采样点）。
      // 不要再乘 1000 —— 那是「秒 → 毫秒」的系数，这里已经是毫秒了。
      const baseMs = offsetMs + start / SAMPLES_PER_MS
      const sliceMs = slice.length / SAMPLES_PER_MS
      const pieceText = String(out?.text || '').trim()
      // 段间用空格连接键：与 local-asr 一致，便于页面直接渲染
      if (pieceText) text += (text ? ' ' : '') + pieceText

      const segs = Array.isArray(out?.segments) ? out.segments : []
      if (segs.length) {
        // 二期（Filetrans）接入时走这里：句级时间戳相对本段开头，加上本段基准
        segs.forEach((seg) => {
          const segText = String(seg?.text || '').trim()
          if (!segText) return
          const from = Number.isFinite(seg?.startMs) ? seg.startMs : 0
          const to = Number.isFinite(seg?.endMs) ? seg.endMs : from
          chunks.push({
            text: segText,
            startMs: Math.round(baseMs + from),
            endMs: Math.round(baseMs + to)
          })
        })
      } else if (pieceText) {
        // 本版无句级时间戳：如实给出**段的真实边界**，不拆分、不编造句边界
        chunks.push({
          text: pieceText,
          startMs: Math.round(baseMs),
          endMs: Math.round(baseMs + sliceMs)
        })
      }

      lastProgress = {
        file: `seg-${i + 1}-of-${slices.length}.wav`,
        loaded: i + 1,
        total: slices.length,
        percent: Math.round(((i + 1) / slices.length) * 100)
      }
      onProgress(lastProgress)
    }

    setPhase(ASR_PHASES.ready, resolvedModel || SERVER_ASR_LABEL)
    return {
      text,
      chunks,
      // 同口径：pcm.length / 16 已经是毫秒，不要再乘 1000
      durationMs: Math.round(pcm.length / SAMPLES_PER_MS),
      model: resolvedModel,
      granularity,
      elapsedMs
    }
  }

  /**
   * 转写结果 → 会话 utterance。同构于 local-asr.toUtterances。
   * speaker 固定 S1 且 speakerDiarized=false：云端 ASR 不给说话人归属，
   * 多轨「设备轨」归属由页面用采集侧的时间片数据另行覆写（那是设备依据，不是声纹）。
   */
  function toUtterances(result, { seqStart = 1, idPrefix = 'asr' } = {}) {
    const list = Array.isArray(result?.chunks) ? result.chunks : []
    return list.map((c, i) => ({
      id: `${idPrefix}-${seqStart + i}`,
      seq: seqStart + i,
      speaker: 'S1',
      speakerDiarized: false,
      speakerLabel: '说话人未区分',
      lang: 'zh',
      startMs: c.startMs,
      endMs: c.endMs,
      text: c.text,
      // confidence 不编造：云端 ASR 未返回逐句置信度，置 null 由页面显示「—」
      confidence: null,
      source: 'server_asr'
    }))
  }

  return {
    get model() {
      return resolvedModel
    },
    get phase() {
      return phase
    },
    get progress() {
      return lastProgress
    },
    /** 时间戳粒度：'none' = 仅段级边界；'segment' = 上游给了句级 */
    get granularity() {
      return granularity
    },
    load,
    transcribe,
    toUtterances,
    describe() {
      return {
        model: resolvedModel || 'unknown',
        label: SERVER_ASR_LABEL,
        baseURL,
        keySource,
        granularity,
        // 与 local-asr 对齐的两个布尔：页面据此决定文案（这里音频确实会出本机）
        uploaded: true,
        remote: true,
        diarization: false,
        phase
      }
    }
  }
}
