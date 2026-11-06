// 2026-11-06 源文件丢失后由 dist 编译产物（dist/meeting-asr/meeting-asr.service.js + .d.ts）机械重建，
// 逻辑与 dist 产物逐行对应。
import { Injectable, Logger } from '@nestjs/common'
import { resolveMeetingAsrConfig, type MeetingAsrRuntimeConfig } from './meeting-asr.config'

export const MEETING_ASR_ERROR_CODES = {
  CONFIG_MISSING: 'asr_config_missing',
  BAD_AUDIO: 'asr_bad_audio',
  AUDIO_TOO_LARGE: 'asr_audio_too_large',
  AUTH_FAILED: 'asr_auth_failed',
  RATE_LIMITED: 'asr_rate_limited',
  TIMEOUT: 'asr_timeout',
  UPSTREAM_ERROR: 'asr_upstream_error',
  NETWORK_ERROR: 'asr_network_error',
  BAD_RESPONSE: 'asr_bad_response',
} as const

export type MeetingAsrErrorCode = (typeof MEETING_ASR_ERROR_CODES)[keyof typeof MEETING_ASR_ERROR_CODES]

export class MeetingAsrError extends Error {
  constructor(
    readonly code: MeetingAsrErrorCode,
    message: string,
    readonly httpStatus: number,
    readonly upstream?: string | undefined,
  ) {
    super(message)
    this.name = 'MeetingAsrError'
  }
}

/** 从 WAV 头解析真实时长（RIFF/WAVE 校验 + fmt 的 byteRate + data chunk 大小），解析不出返回 null */
export function parseWavDurationMs(buffer: Buffer): number | null {
  try {
    if (buffer.length < 44) return null
    if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null
    if (buffer.toString('ascii', 8, 12) !== 'WAVE') return null
    let offset = 12
    let byteRate = 0
    let dataSize = 0
    while (offset + 8 <= buffer.length) {
      const chunkId = buffer.toString('ascii', offset, offset + 4)
      const chunkSize = buffer.readUInt32LE(offset + 4)
      const body = offset + 8
      if (chunkId === 'fmt ') {
        if (body + 16 > buffer.length) return null
        byteRate = buffer.readUInt32LE(body + 8)
      } else if (chunkId === 'data') {
        dataSize = Math.min(chunkSize, buffer.length - body)
        break
      }
      offset = body + chunkSize + (chunkSize % 2)
    }
    if (!byteRate || !dataSize) return null
    return Math.round((dataSize / byteRate) * 1000)
  } catch {
    return null
  }
}

export interface MeetingAsrTranscribeResult {
  text: string
  segments: Array<{ text: string; startMs: number; endMs: number }>
  granularity: 'none'
  durationMs: number | null
  model: string
  requestId: string
  elapsedMs: number
}

@Injectable()
export class MeetingAsrService {
  private readonly logger = new Logger(MeetingAsrService.name)

  describe(): MeetingAsrRuntimeConfig {
    return resolveMeetingAsrConfig()
  }

  async transcribe(
    buffer: Buffer,
    opts: { mime?: string; language?: string; fileName?: string } = {},
  ): Promise<MeetingAsrTranscribeResult> {
    const cfg = resolveMeetingAsrConfig()
    const startedAt = Date.now()
    if (!cfg.apiKey) {
      throw new MeetingAsrError(
        MEETING_ASR_ERROR_CODES.CONFIG_MISSING,
        '服务端未配置语音转写密钥（MEETING_ASR_API_KEY 或 data/meeting-asr-config.json），无法转写',
        503,
      )
    }
    if (!buffer?.length) {
      throw new MeetingAsrError(MEETING_ASR_ERROR_CODES.BAD_AUDIO, '音频内容为空', 400)
    }
    if (buffer.length > cfg.maxBytes) {
      throw new MeetingAsrError(
        MEETING_ASR_ERROR_CODES.AUDIO_TOO_LARGE,
        `音频体积 ${buffer.length} 字节超过上限 ${cfg.maxBytes} 字节`,
        413,
      )
    }
    const durationMs = parseWavDurationMs(buffer)
    if (durationMs === null) {
      throw new MeetingAsrError(
        MEETING_ASR_ERROR_CODES.BAD_AUDIO,
        '音频不是可解析的 WAV（RIFF/WAVE 头缺失或损坏）',
        400,
      )
    }
    const mime = opts.mime || 'audio/wav'
    const language = (opts.language || cfg.language || '').trim()
    const body = this.buildRequestBody(cfg, buffer, mime, language)
    const url = `${cfg.baseURL}/chat/completions`
    let res: Response
    try {
      res = await this.fetchWithTimeout(url, cfg.apiKey, body, cfg.timeoutMs)
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new MeetingAsrError(
          MEETING_ASR_ERROR_CODES.TIMEOUT,
          `上游转写超时（>${cfg.timeoutMs}ms）`,
          504,
        )
      }
      throw new MeetingAsrError(
        MEETING_ASR_ERROR_CODES.NETWORK_ERROR,
        `无法连接上游转写服务：${err?.message || String(err)}`,
        502,
      )
    }
    const rawText = await res.text()
    if (!res.ok) {
      const code = this.classifyUpstreamStatus(res.status)
      throw new MeetingAsrError(
        code,
        `上游转写失败（HTTP ${res.status}）`,
        res.status === 429 ? 429 : 502,
        rawText.slice(0, 500),
      )
    }
    let json: any
    try {
      json = JSON.parse(rawText)
    } catch {
      throw new MeetingAsrError(
        MEETING_ASR_ERROR_CODES.BAD_RESPONSE,
        '上游返回体不是合法 JSON',
        502,
        rawText.slice(0, 500),
      )
    }
    const text = this.extractText(json, cfg).trim()
    const requestId = String(json?.request_id || json?.id || '')
    if (!text) {
      this.logger.log(
        `[meeting-asr] 上游返回空文本 model=${cfg.model} durationMs=${durationMs} file=${opts.fileName || '-'}`,
      )
    }
    return {
      text,
      segments: [],
      granularity: 'none',
      durationMs,
      model: cfg.model,
      requestId,
      elapsedMs: Date.now() - startedAt,
    }
  }

  private buildRequestBody(cfg: MeetingAsrRuntimeConfig, buffer: Buffer, mime: string, language: string) {
    const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`
    const payload: Record<string, any> = {
      model: cfg.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: dataUrl },
            },
          ],
        },
      ],
      stream: false,
    }
    if (language) {
      payload.asr_options = { language }
    }
    return payload
  }

  private async fetchWithTimeout(url: string, apiKey: string, body: unknown, timeoutMs: number): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  private classifyUpstreamStatus(status: number): MeetingAsrErrorCode {
    if (status === 401 || status === 403) return MEETING_ASR_ERROR_CODES.AUTH_FAILED
    if (status === 429) return MEETING_ASR_ERROR_CODES.RATE_LIMITED
    if (status === 413) return MEETING_ASR_ERROR_CODES.AUDIO_TOO_LARGE
    return MEETING_ASR_ERROR_CODES.UPSTREAM_ERROR
  }

  private extractText(json: any, cfg: MeetingAsrRuntimeConfig): string {
    const content = json?.choices?.[0]?.message?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .map((part: any) => (typeof part === 'string' ? part : String(part?.text || '')))
        .join('')
    }
    const legacy = json?.output?.text ?? json?.output?.output?.sentence?.text
    if (typeof legacy === 'string') return legacy
    if (cfg.providerKind === 'dashscope') return ''
    return ''
  }
}
