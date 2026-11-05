// T-030 A1：文件格式归一化（wav / mp3 / m4a …）
// 两段路径：
//   1) WAV → parseWav 纯函数（Node 可直接测）
//   2) 压缩格式 → 浏览器 AudioContext.decodeAudioData
//
// 第二段原先把浏览器硬编码在函数体内（首行 `typeof window === 'undefined'` 直接抛错 +
// 函数体里直取 `window.AudioContext`），导致 Node 侧完全注入不进去，这条路径的回归保护为零。
// 本轮改为依赖注入 + 纯函数化：decodeAudioFile(file, { env }) 可传 mock env，
// 于是格式嗅探 / 双形态调用 / 错误分类 / ctx 释放全部能在 Node 侧自动断言。
// 只做本地解码 + 16k mono 归一化，不上传、不落库。

import { normalizeAudio } from './audio-dsp.js'

export const SUPPORTED_EXTENSIONS = Object.freeze(['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac'])

// 扩展名 → 允许的真实容器。
// 不追求一一对应：.aac 既可能是 ADTS 裸流，也可能是 ISO-BMFF 容器被改名，故归组。
// 目的只是「完全不相干」时报提示（如 .mp3 实为 wav），不做阻断 —— 阻断太容易误伤。
export const EXT_FORMAT_GROUPS = Object.freeze({
  wav: ['wav'],
  mp3: ['mp3'],
  m4a: ['m4a'],
  aac: ['aac', 'm4a'],
  ogg: ['ogg'],
  flac: ['flac']
})

// 解码失败的可操作提示。裸 DOMException 文案对用户没有意义，
// 尤其是 Safari 不支持 flac/ogg 时只会抛 NotSupportedError。
export const DECODE_ERROR_HINTS = Object.freeze({
  EncodingError: '文件无法解码：可能已损坏，或该浏览器不支持此编码（建议转成 wav 或 mp3 再试）',
  NotSupportedError: '当前浏览器不支持该音频编码（Safari 对 flac / ogg 常不支持，建议转成 mp3）',
  AbortError: '解码被中断，请重新选择文件',
  TypeError: '浏览器解码接口调用异常，请重新选择文件',
  DECODE_TIMEOUT: '解码长时间无响应，文件可能过大或编码不受支持',
  DECODE_EMPTY: '解码没有返回有效音频数据（该编码可能不受支持）',
  NO_AUDIO_CONTEXT: '当前环境不支持 AudioContext，无法解码压缩音频',
  UNSUPPORTED_EXT: '不支持的文件格式'
})

const tagOf = (buffer, offset, len) =>
  String.fromCharCode(...new Uint8Array(buffer, offset, len))

function makeDecodeError(code, message, cause) {
  const error = new Error(message)
  error.code = code
  if (cause) error.cause = cause
  return error
}

/**
 * 按真实字节嗅探音频容器。
 * 之所以不只看扩展名：用户把 wav 改名成 mp3 是很常见的操作（尤其从微信/钉钉导出的文件），
 * 按扩展名走会把一个完好的 wav 送进 decodeAudioData 然后报「无法解码」，误导成文件损坏。
 */
export function sniffAudioFormat(buffer) {
  const unknown = { format: 'unknown', detail: 'insufficient-bytes' }
  if (!buffer || typeof buffer.byteLength !== 'number' || buffer.byteLength < 4) return unknown
  const u8 = new Uint8Array(buffer)

  // RIFF....WAVE
  if (u8.length >= 12 && tagOf(buffer, 0, 4) === 'RIFF' && tagOf(buffer, 8, 4) === 'WAVE') {
    return { format: 'wav', detail: 'RIFF/WAVE' }
  }
  if (tagOf(buffer, 0, 4) === 'fLaC') return { format: 'flac', detail: 'fLaC' }
  if (tagOf(buffer, 0, 4) === 'OggS') return { format: 'ogg', detail: 'OggS' }
  // ISO-BMFF：偏移 4 起为 ftyp（m4a/mp4 都在此列）
  if (u8.length >= 12 && tagOf(buffer, 4, 4) === 'ftyp') {
    return { format: 'm4a', detail: `ISO-BMFF:${tagOf(buffer, 8, 4).trim()}` }
  }
  // MP3 带 ID3v2 标签
  if (tagOf(buffer, 0, 3) === 'ID3') return { format: 'mp3', detail: 'ID3v2' }
  // 裸帧头：11 位 sync（0xFF + 高 3 位全 1）
  if (u8[0] === 0xff && u8.length >= 2 && (u8[1] & 0xe0) === 0xe0) {
    // byte1 的 bit2-1 为 layer：0 是 ADTS(AAC)，其余是 MPEG audio(MP3)
    const layer = (u8[1] >> 1) & 0x03
    if (layer === 0) return { format: 'aac', detail: 'ADTS' }
    return { format: 'mp3', detail: 'MPEG-frame' }
  }
  return unknown
}

/** 真实格式与扩展名是否相容。认不出（unknown）一律视为相容，避免嗅探表覆盖不到时误报。 */
export function formatMatchesExtension(format, ext) {
  if (!format || format === 'unknown') return true
  const allowed = EXT_FORMAT_GROUPS[ext]
  if (!allowed) return true
  return allowed.includes(format)
}

/** 把解码异常翻译成用户能照做的提示；不能归类时保留原文，不吞信息。 */
export function classifyDecodeError(error) {
  const name = (error && error.name) || ''
  const hint = DECODE_ERROR_HINTS[name]
  if (hint) {
    return { code: name, message: hint, raw: (error && error.message) || '', actionable: true }
  }
  const code = (error && error.code) || name || 'UNKNOWN'
  const message = DECODE_ERROR_HINTS[code]
  if (message) {
    return { code, message, raw: (error && error.message) || '', actionable: true }
  }
  return {
    code,
    message: (error && error.message) || '解码失败',
    raw: (error && error.message) || '',
    actionable: false
  }
}

function attachDecodeHint(error) {
  const hint = classifyDecodeError(error)
  const target = error && typeof error === 'object' ? error : new Error(hint.message)
  target.hintCode = hint.code
  if (!target.originalMessage) target.originalMessage = (error && error.message) || hint.raw || ''
  if (hint.actionable) target.message = hint.message
  return target
}

/**
 * 释放 AudioContext，**永不向外抛**。
 * 原来写在 finally 里 `await ctx.close()`：一旦 close 本身 reject（对已关闭/已中断的 ctx
 * 再 close 在部分浏览器上会 reject），finally 的异常会顶掉真正的 decode 异常，
 * 用户看到的就成了「关闭上下文失败」，排查方向完全跑偏。
 */
export async function closeContextQuietly(ctx) {
  if (!ctx || typeof ctx.close !== 'function') return { closed: false, error: null, skipped: true }
  try {
    await ctx.close()
    return { closed: true, error: null, skipped: false }
  } catch (error) {
    return { closed: false, error, skipped: false }
  }
}

/**
 * 用给定的 AudioContext 解码，**同时支持 Promise 与 callback 两种 decodeAudioData 形态**。
 *
 * 关键点：一次三参调用即可覆盖两者 ——
 *   · 标准实现忽略第 2/3 个参数，仍返回 Promise；
 *   · Safari 14 之前只认回调，返回 undefined，结果从回调进。
 * 这样无需「先试 Promise、拿到 undefined 再重解一遍」，不会把文件解两次。
 */
export async function decodeWithContext(ctx, buffer, options = {}) {
  if (!ctx || typeof ctx.decodeAudioData !== 'function') {
    throw makeDecodeError('NO_AUDIO_CONTEXT', DECODE_ERROR_HINTS.NO_AUDIO_CONTEXT)
  }
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000
  // decodeAudioData 会 detach 传入的 ArrayBuffer，必须给独立副本
  const slice = buffer.slice(0)
  const started = Date.now()

  const outcome = await new Promise((resolve, reject) => {
    let settled = false
    let timer = null
    const done = (via, value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({ decoded: value, via, elapsedMs: Date.now() - started })
    }
    const fail = (error) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      reject(error)
    }
    if (timeoutMs > 0) {
      timer = setTimeout(
        () => fail(makeDecodeError('DECODE_TIMEOUT', DECODE_ERROR_HINTS.DECODE_TIMEOUT)),
        timeoutMs
      )
    }
    let returned
    try {
      returned = ctx.decodeAudioData(slice, (v) => done('callback', v), (e) => fail(e))
    } catch (error) {
      fail(error)
      return
    }
    if (returned && typeof returned.then === 'function') {
      returned.then((v) => done('promise', v), (e) => fail(e))
    }
  })

  const decoded = outcome.decoded
  // 兜底：任何没拿到有效 AudioBuffer 的路径都转成可读错误，
  // 而不是让上层撞上 `Cannot read properties of undefined (reading 'numberOfChannels')`。
  if (
    !decoded ||
    typeof decoded.numberOfChannels !== 'number' ||
    typeof decoded.length !== 'number' ||
    typeof decoded.getChannelData !== 'function'
  ) {
    throw makeDecodeError('DECODE_EMPTY', DECODE_ERROR_HINTS.DECODE_EMPTY)
  }

  const channels = decoded.numberOfChannels
  const frames = decoded.length
  const interleaved = new Float32Array(frames * channels)
  for (let c = 0; c < channels; c += 1) {
    const data = decoded.getChannelData(c)
    for (let i = 0; i < frames; i += 1) interleaved[i * channels + c] = data[i]
  }
  return {
    samples: interleaved,
    sourceRate: decoded.sampleRate,
    channels,
    frames,
    via: outcome.via,
    elapsedMs: outcome.elapsedMs
  }
}

// 解析 PCM WAV：8 / 16 / 24 / 32 bit，多声道返回交织样本
export function parseWav(buffer) {
  const view = new DataView(buffer)
  if (view.byteLength < 44) throw new Error('WAV 文件过短')
  if (tagOf(buffer, 0, 4) !== 'RIFF' || tagOf(buffer, 8, 4) !== 'WAVE') {
    throw new Error('不是有效的 RIFF/WAVE 文件')
  }
  let offset = 12
  let fmt = null
  let dataOffset = null
  let dataLen = 0
  while (offset + 8 <= view.byteLength) {
    const id = tagOf(buffer, offset, 4)
    const size = view.getUint32(offset + 4, true)
    if (id === 'fmt ') {
      fmt = {
        format: view.getUint16(offset + 8, true),
        channels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        bits: view.getUint16(offset + 22, true)
      }
    }
    if (id === 'data') {
      dataOffset = offset + 8
      dataLen = size
    }
    offset += 8 + size + (size % 2)
  }
  if (!fmt || dataOffset === null) throw new Error('WAV 缺少 fmt 或 data 块')
  if (fmt.format !== 1) throw new Error(`仅支持 PCM WAV（format=${fmt.format}）`)
  if (![8, 16, 24, 32].includes(fmt.bits)) throw new Error(`不支持位深 ${fmt.bits}`)

  const bytesPerSample = fmt.bits / 8
  const frames = Math.floor(dataLen / (bytesPerSample * fmt.channels))
  const samples = new Float32Array(frames * fmt.channels)
  for (let i = 0; i < samples.length; i++) {
    const pos = dataOffset + i * bytesPerSample
    if (fmt.bits === 8) samples[i] = (view.getUint8(pos) - 128) / 128
    else if (fmt.bits === 16) samples[i] = view.getInt16(pos, true) / 32768
    else if (fmt.bits === 24) {
      const raw = view.getUint8(pos) | (view.getUint8(pos + 1) << 8) | (view.getUint8(pos + 2) << 16)
      samples[i] = (raw << 8) / 2147483648
    } else samples[i] = view.getInt32(pos, true) / 2147483648
  }
  return {
    samples,
    sourceRate: fmt.sampleRate,
    channels: fmt.channels,
    bits: fmt.bits,
    frames
  }
}

export function fileExtension(name) {
  return String(name || '').split('.').pop().toLowerCase()
}

/**
 * 任意受支持格式 → 16k mono + VAD + WAV。
 *
 * options.env 用于注入宿主环境（默认取全局 window），Node 侧传 mock env 即可全路径断言：
 *   decodeAudioFile(file, { env: { AudioContext: MockCtx } })
 * options.timeoutMs 传给解码看门狗。
 */
export async function decodeAudioFile(file, options = {}) {
  const env = options.env || (typeof window !== 'undefined' ? window : null)
  const ext = fileExtension(file && file.name)
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw makeDecodeError(
      'UNSUPPORTED_EXT',
      `不支持的格式 .${ext}（支持 ${SUPPORTED_EXTENSIONS.join('/')}）`
    )
  }
  const buffer = await file.arrayBuffer()
  const sniffed = sniffAudioFormat(buffer)
  const mismatch = !formatMatchesExtension(sniffed.format, ext)
  const warning = mismatch
    ? `扩展名 .${ext} 与实际容器 ${sniffed.format} 不符，已按实际内容解码`
    : null

  // 真实格式优先：
  //   · 真 wav → 纯函数解析（哪怕扩展名写的是 mp3）
  //   · 认不出且扩展名是 wav → 仍走 parseWav，让它给出「不是有效的 RIFF/WAVE」
  //   · 其余 → 交给 decodeAudioData 尽力解码（嗅探表不可能穷举所有容器）
  const useWavPath = sniffed.format === 'wav' || (sniffed.format === 'unknown' && ext === 'wav')

  let parsed
  if (useWavPath) {
    parsed = parseWav(buffer)
  } else {
    const Ctx = env && (env.AudioContext || env.webkitAudioContext)
    if (!Ctx) {
      throw makeDecodeError('NO_AUDIO_CONTEXT', DECODE_ERROR_HINTS.NO_AUDIO_CONTEXT)
    }
    const ctx = new Ctx()
    try {
      parsed = await decodeWithContext(ctx, buffer, options)
    } catch (error) {
      throw attachDecodeHint(error)
    } finally {
      // 不抛，绝不顶掉上面的 primary error
      await closeContextQuietly(ctx)
    }
  }

  const result = normalizeAudio({
    samples: parsed.samples,
    sourceRate: parsed.sourceRate,
    channels: parsed.channels
  })
  return {
    ...result,
    fileName: file.name,
    // 展示真实格式而非扩展名，避免「标着 mp3 其实是 wav」继续误导下游
    format: sniffed.format === 'unknown' ? ext : sniffed.format,
    requestedFormat: ext,
    detectedFormat: sniffed.format,
    formatWarning: warning,
    decodeVia: parsed.via || 'wav-parser'
  }
}
