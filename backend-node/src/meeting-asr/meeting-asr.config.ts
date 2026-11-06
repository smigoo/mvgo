// 2026-11-06 源文件丢失后由 dist 编译产物（dist/meeting-asr/meeting-asr.config.js + .d.ts）机械重建，
// 逻辑与 dist 产物逐行对应。
import * as fs from 'node:fs'
import * as path from 'node:path'
import { dataDir } from '../config/backend-root'

export const MEETING_ASR_CONFIG_FILE = path.join(dataDir, 'meeting-asr-config.json')

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const DEFAULT_MODEL = 'qwen3-asr-flash'
const DEFAULT_TIMEOUT_MS = 90_000
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024

export type MeetingAsrProviderKind = 'openai-compatible' | 'dashscope'

export interface MeetingAsrRuntimeConfig {
  apiKey: string
  baseURL: string
  model: string
  providerKind: MeetingAsrProviderKind
  language: string
  timeoutMs: number
  maxBytes: number
  source: 'env' | 'file' | 'none'
}

interface MeetingAsrFileConfig {
  apiKey?: string
  baseURL?: string
  model?: string
  providerKind?: string
  language?: string
  timeoutMs?: number | string
  maxBytes?: number | string
}

/** 密钥解析顺序：MEETING_ASR_API_KEY → DASHSCOPE_API_KEY → data/meeting-asr-config.json → 内置默认（本地回退） */
function readFileConfig(): MeetingAsrFileConfig {
  try {
    if (!fs.existsSync(MEETING_ASR_CONFIG_FILE)) return {}
    const raw = fs.readFileSync(MEETING_ASR_CONFIG_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function pickString(...values: Array<string | undefined>): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function pickNumber(fallback: number, ...values: Array<number | string | undefined>): number {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.trim())
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return fallback
}

/** 允许把完整 chat/completions 地址粘进 baseURL，统一剥尾斜杠与端点路径 */
function normalizeBaseURL(url: string): string {
  return url.replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
}

export function resolveMeetingAsrConfig(): MeetingAsrRuntimeConfig {
  const file = readFileConfig()
  const envKey = pickString(process.env.MEETING_ASR_API_KEY, process.env.DASHSCOPE_API_KEY)
  const fileKey = pickString(file.apiKey)
  const apiKey = envKey || fileKey
  const baseURL = normalizeBaseURL(
    pickString(process.env.MEETING_ASR_BASE_URL, file.baseURL, DEFAULT_BASE_URL),
  )
  const model = pickString(process.env.MEETING_ASR_MODEL, file.model, DEFAULT_MODEL)
  const kindRaw = pickString(process.env.MEETING_ASR_PROVIDER, file.providerKind).toLowerCase()
  const providerKind: MeetingAsrProviderKind = kindRaw === 'dashscope' ? 'dashscope' : 'openai-compatible'
  return {
    apiKey,
    baseURL,
    model,
    providerKind,
    language: pickString(process.env.MEETING_ASR_LANGUAGE, file.language),
    timeoutMs: pickNumber(DEFAULT_TIMEOUT_MS, process.env.MEETING_ASR_TIMEOUT_MS, file.timeoutMs),
    maxBytes: pickNumber(DEFAULT_MAX_BYTES, process.env.MEETING_ASR_MAX_BYTES, file.maxBytes),
    source: envKey ? 'env' : fileKey ? 'file' : 'none',
  }
}

/** /status 返回的就绪度描述：绝不含 apiKey 本体 */
export function describeMeetingAsrConfig() {
  const cfg = resolveMeetingAsrConfig()
  return {
    configured: Boolean(cfg.apiKey),
    baseURL: cfg.baseURL,
    model: cfg.model,
    providerKind: cfg.providerKind,
    language: cfg.language || null,
    timeoutMs: cfg.timeoutMs,
    maxBytes: cfg.maxBytes,
    keySource: cfg.source,
    granularity: 'none' as const,
    configFile: MEETING_ASR_CONFIG_FILE,
  }
}
