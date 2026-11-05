// T-030 音频归一化与 VAD：纯计算、无 DOM 依赖
// 浏览器实时采集与 Node 冒烟脚本共用同一套算法，避免两端行为漂移。
// 对应《会议智能纪要-Q07-Q09收敛与T-030启动-v1.2.md》§4.3 / §4.4。

export const TARGET_SAMPLE_RATE = 16000

// 工程默认值，可在 normalizeAudio / detectVoiceSegments 调用时覆盖；S3 联调时用真实录音重新标定
export const VAD_DEFAULTS = Object.freeze({
  frameMs: 20,
  energyThreshold: 0.01,
  zcrMax: 0.35,
  minSpeechMs: 200,
  minSilenceMs: 300,
  hangoverMs: 100
})

export function computeRms(samples) {
  if (!samples || !samples.length) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

// 多轨下混：逐样本取算术均值，单轨直接拷贝
export function downmixToMono(channels) {
  if (!Array.isArray(channels) || !channels.length) return new Float32Array(0)
  if (channels.length === 1) return Float32Array.from(channels[0])
  const len = Math.min(...channels.map((c) => c.length))
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    let sum = 0
    for (let c = 0; c < channels.length; c++) sum += channels[c][i]
    out[i] = sum / channels.length
  }
  return out
}

// 声道数 > 1 时，输入按交织 PCM 处理（[L0,R0,L1,R1,...]），逐帧取均值下混
export function interleaveToMono(samples, channels) {
  const len = Math.floor(samples.length / channels)
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++) sum += samples[i * channels + c]
    out[i] = sum / channels
  }
  return out
}

// 任意采样率 → 16k：线性插值；同源采样率时恒等拷贝
export function resampleTo16k(input, sourceRate) {
  if (!Number.isFinite(sourceRate) || sourceRate <= 0) {
    throw new Error(`非法采样率: ${sourceRate}`)
  }
  if (sourceRate === TARGET_SAMPLE_RATE) return Float32Array.from(input)
  const ratio = sourceRate / TARGET_SAMPLE_RATE
  const outLen = Math.max(0, Math.floor(input.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(input.length - 1, i0 + 1)
    const t = pos - i0
    out[i] = input[i0] * (1 - t) + input[i1] * t
  }
  return out
}

function makeSegment(startFrame, endFrame, frameSize, pcm) {
  const startSample = startFrame * frameSize
  const endSample = Math.min(endFrame * frameSize, pcm.length)
  const startMs = Math.round((startSample / TARGET_SAMPLE_RATE) * 1000)
  const endMs = Math.round((endSample / TARGET_SAMPLE_RATE) * 1000)
  let sum = 0
  for (let i = startSample; i < endSample; i++) sum += pcm[i] * pcm[i]
  const count = Math.max(0, endSample - startSample)
  return {
    startMs,
    endMs,
    durationMs: endMs - startMs,
    rms: count ? Number(Math.sqrt(sum / count).toFixed(4)) : 0
  }
}

// VAD：逐帧 RMS + 过零率双条件判定，再用起音/静音/拖尾状态机合并成段
export function detectVoiceSegments(pcm, options = {}) {
  const o = { ...VAD_DEFAULTS, ...options }
  const frameSize = Math.max(1, Math.round((TARGET_SAMPLE_RATE * o.frameMs) / 1000))
  const frameCount = Math.floor(pcm.length / frameSize)
  const flags = new Array(frameCount)

  for (let f = 0; f < frameCount; f++) {
    const start = f * frameSize
    const end = start + frameSize
    let sumSq = 0
    let crossings = 0
    let prev = 0
    for (let i = start; i < end; i++) {
      const v = pcm[i]
      sumSq += v * v
      if (i > start && ((v >= 0 && prev < 0) || (v < 0 && prev >= 0))) crossings += 1
      prev = v
    }
    const rms = Math.sqrt(sumSq / frameSize)
    const zcr = crossings / frameSize
    flags[f] = rms >= o.energyThreshold && zcr <= o.zcrMax
  }

  const minSpeechFrames = Math.ceil(o.minSpeechMs / o.frameMs)
  const minSilenceFrames = Math.ceil(o.minSilenceMs / o.frameMs)
  const hangoverFrames = Math.ceil(o.hangoverMs / o.frameMs)

  const segments = []
  let state = 'silence'
  let speechRun = 0
  let silenceRun = 0
  let segStart = 0
  let lastVoiced = -1

  for (let f = 0; f < flags.length; f++) {
    if (flags[f]) {
      lastVoiced = f
      speechRun += 1
      silenceRun = 0
    } else {
      silenceRun += 1
      speechRun = 0
    }
    if (state === 'silence' && speechRun >= minSpeechFrames) {
      state = 'speech'
      segStart = Math.max(0, f - minSpeechFrames + 1)
    } else if (state === 'speech' && silenceRun >= minSilenceFrames + hangoverFrames) {
      const endFrame = Math.min(flags.length, lastVoiced + 1 + hangoverFrames)
      segments.push(makeSegment(segStart, endFrame, frameSize, pcm))
      state = 'silence'
      speechRun = 0
      silenceRun = 0
    }
  }
  if (state === 'speech') {
    const endFrame = Math.min(flags.length, lastVoiced + 1 + hangoverFrames)
    segments.push(makeSegment(segStart, endFrame, frameSize, pcm))
  }
  return segments
}

// 16-bit PCM / mono WAV，标准 44 字节头
export function encodeWav(pcm) {
  const dataLen = pcm.length * 2
  const buffer = new ArrayBuffer(44 + dataLen)
  const view = new DataView(buffer)
  const str = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  str(0, 'RIFF')
  view.setUint32(4, 36 + dataLen, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, TARGET_SAMPLE_RATE, true)
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  str(36, 'data')
  view.setUint32(40, dataLen, true)
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

// 统一入口：任意采样率/声道 → 16k mono + VAD 分段 + WAV
// 注意：只做本地归一化，不上传、不调云 ASR（云端链路属 Blocker）
export function normalizeAudio({ samples, sourceRate, channels = 1, vad } = {}) {
  if (!samples || typeof samples.length !== 'number') {
    throw new Error('normalizeAudio 需要 samples（Float32Array 或数组）')
  }
  const mono = channels > 1 ? interleaveToMono(samples, channels) : Float32Array.from(samples)
  const pcm = resampleTo16k(mono, sourceRate)
  return {
    sampleRate: TARGET_SAMPLE_RATE,
    channels: 1,
    frameCount: pcm.length,
    durationMs: Math.round((pcm.length / TARGET_SAMPLE_RATE) * 1000),
    sourceRate,
    sourceChannels: channels,
    pcm,
    segments: detectVoiceSegments(pcm, vad),
    wav: encodeWav(pcm)
  }
}
