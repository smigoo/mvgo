// T-030 浏览器端真实音频采集（浏览器胶水层；算法在 audio-dsp.js，Node 冒烟脚本共用）
// 边界：只做本地采集与归一化，不上传、不落库、不调用任何云 ASR。
// 用 ScriptProcessorNode 而非 AudioWorklet，避免 dev 工作台额外加载模块文件；
// 输出接 0 增益节点再连 destination，保证回调触发但不回放麦克风声音（防啸叫）。

import { computeRms, normalizeAudio } from './audio-dsp.js'

export function isCaptureSupported() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  return Boolean(
    navigator.mediaDevices?.getUserMedia &&
      (window.AudioContext || window.webkitAudioContext)
  )
}

function concat(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Float32Array(total)
  let offset = 0
  chunks.forEach((c) => {
    out.set(c, offset)
    offset += c.length
  })
  return out
}

export async function startCapture({ onLevel } = {}) {
  if (!isCaptureSupported()) {
    throw new Error('当前环境不支持 getUserMedia / AudioContext（需 HTTPS 或 localhost）')
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
  })
  const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = new Ctx()
  try {
    await ctx.resume()
  } catch {
    // 部分浏览器 resume 会抛错，采集仍可继续
  }
  const source = ctx.createMediaStreamSource(stream)
  const processor = ctx.createScriptProcessor(4096, 1, 1)
  const silent = ctx.createGain()
  silent.gain.value = 0
  const chunks = []
  source.connect(processor)
  processor.connect(silent)
  silent.connect(ctx.destination)
  processor.onaudioprocess = (event) => {
    const data = event.inputBuffer.getChannelData(0)
    chunks.push(new Float32Array(data))
    if (typeof onLevel === 'function') onLevel(computeRms(data))
  }
  return {
    stream,
    ctx,
    source,
    processor,
    silent,
    chunks,
    sampleRate: ctx.sampleRate,
    startedAt: Date.now()
  }
}

// 采集中取「到此刻为止」的原始 PCM 快照（源采样率，单声道）。
// 用途：录制过程中做增量转写——只读已采集样本，不打断采集、不清空缓冲。
// 注意：返回的是拼接快照，不是内部缓冲引用，调用方可安全持有。
export function collectCaptureSamples(handle) {
  if (!handle || !Array.isArray(handle.chunks)) return new Float32Array(0)
  return concat(handle.chunks)
}

export async function stopCapture(handle) {
  if (!handle) throw new Error('stopCapture 需要 startCapture 返回的句柄')
  const { stream, ctx, source, processor, silent, chunks, sampleRate, startedAt } = handle
  processor.onaudioprocess = null
  try {
    processor.disconnect()
    silent.disconnect()
    source.disconnect()
  } catch {
    // 已断开
  }
  stream.getTracks().forEach((track) => track.stop())
  try {
    await ctx.close()
  } catch {
    // 已关闭
  }
  const samples = concat(chunks)
  const result = normalizeAudio({ samples, sourceRate: sampleRate, channels: 1 })
  return {
    ...result,
    capturedMs: Date.now() - startedAt,
    sourceLabel: 'browser_microphone'
  }
}
