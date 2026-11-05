// T-030 多轨采集：每个音频输入设备一轨，按「能量主导」在统一时间轴上选轨合成一路。
//
// 为什么这么做：没有声纹模型时，说话人分离没有可靠解；但会议室里「一人一麦」是常态。
// 谁在说话就取谁那一路的样本 —— 既压掉串音，又天然带出「这句话是谁说的」，
// 而且时间轴一根不变，增量转写 / 重叠去重 / 证据回跳全部可以直接复用。
//
// 边界（勿放宽）：
// 1. 只做本地采集与归一化，不上传、不落库、不调用云端识别；
// 2. 不产生、不留存任何声纹 embedding —— 归属依据是「设备轨」，不是声纹；
// 3. 一麦一人时归属准确；一麦多人（共用设备）仍会合并，页面必须如实说明；
// 4. 抢话/重叠不硬归到某一轨：照旧取能量最大轨，但标 overlap，
//    页面可以显示「两人同时说话」而不是假装只有一个人在讲。

import { computeRms, normalizeAudio } from './audio-dsp.js'

export const MULTI_TRACK_LIMITS = Object.freeze({
  maxTracks: 4,
  frameMs: 20,
  // 与 VAD_DEFAULTS.energyThreshold 对齐：低于它算无人说话，该帧填 0
  silenceRms: 0.01,
  // 次强轨达到最强轨的这个比例（约 -3dB）就认为有串音或抢话，如实标记而不是硬选一个
  overlapRatio: 0.7,
  // 换轨迟滞：连续这么多帧都指向新轨才真的切，避免逐帧抖动把一句话切成几截
  switchHysteresisMs: 60,
  // 短于它的 run 会被桥接进同轨邻居，避免 20ms 级碎片
  minRunMs: 200
})

function concatFloat32(chunks = []) {
  const total = chunks.reduce((sum, c) => sum + (c?.length || 0), 0)
  const out = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    if (!c?.length) continue
    out.set(c, offset)
    offset += c.length
  }
  return out
}

// 帧归属 → 连续 run。过短的 run 若前后是同一条轨，说明只是停顿/串音造成的切口，
// 桥接回去，不要把一句话拆成三段。
function buildRuns(owners, overlaps, { frameSize, sampleRate, trackMeta, minRunMs }) {
  const msPerFrame = (frameSize / sampleRate) * 1000
  const raw = []
  for (let f = 0; f < owners.length; f += 1) {
    const trackIndex = owners[f]
    const last = raw[raw.length - 1]
    if (last && last.trackIndex === trackIndex) {
      last.endFrame = f
      if (overlaps[f]) last.overlapFrames += 1
    } else {
      raw.push({ trackIndex, startFrame: f, endFrame: f, overlapFrames: overlaps[f] ? 1 : 0 })
    }
  }

  const kept = []
  for (let i = 0; i < raw.length; i += 1) {
    const run = raw[i]
    const durMs = (run.endFrame - run.startFrame + 1) * msPerFrame
    const prev = kept[kept.length - 1]
    const next = raw[i + 1]
    const bridgeable =
      durMs < minRunMs &&
      Boolean(prev) &&
      Boolean(next) &&
      prev.trackIndex === next.trackIndex &&
      next.trackIndex >= 0
    if (bridgeable) {
      prev.endFrame = run.endFrame
      prev.overlapFrames += run.overlapFrames
      continue
    }
    if (prev && prev.trackIndex === run.trackIndex && run.trackIndex >= 0) {
      prev.endFrame = run.endFrame
      prev.overlapFrames += run.overlapFrames
      continue
    }
    kept.push({ ...run })
  }

  return kept.map((run) => {
    const frames = run.endFrame - run.startFrame + 1
    return {
      startMs: Math.round(run.startFrame * msPerFrame),
      endMs: Math.round((run.endFrame + 1) * msPerFrame),
      durationMs: Math.round(frames * msPerFrame),
      trackIndex: run.trackIndex,
      trackLabel:
        run.trackIndex >= 0 ? trackMeta[run.trackIndex]?.label || `轨 ${run.trackIndex + 1}` : '',
      silent: run.trackIndex < 0,
      overlap: run.overlapFrames > 0,
      overlapRatio: Number((run.overlapFrames / frames).toFixed(2))
    }
  })
}

// 增量混音器：调用方每轮把「各轨到此刻为止的累积样本」丢进来，
// 这里只处理新攒够的整帧，已经混过的帧不重算（长会议下每 2.5s 一次，不能是 O(n²)）。
export function createDominanceMixer({ sampleRate, tracks = [], options = {} } = {}) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error(`createDominanceMixer 需要合法采样率，收到 ${sampleRate}`)
  }
  const o = { ...MULTI_TRACK_LIMITS, ...options }
  const trackMeta = tracks.map((t, i) => ({
    index: i,
    label: t?.label || `轨 ${i + 1}`,
    deviceId: t?.deviceId || ''
  }))
  const frameSize = Math.max(1, Math.round((sampleRate * o.frameMs) / 1000))
  const hysteresisFrames = Math.max(1, Math.round(o.switchHysteresisMs / o.frameMs))

  const chunks = []
  const frameOwner = []
  const frameOverlap = []
  const stats = trackMeta.map((meta) => ({ ...meta, voicedFrames: 0, peakRms: 0 }))

  let currentTrack = -1
  let pendingTrack = -1
  let pendingFrames = 0
  let driftSamples = 0
  let cachedMixed = new Float32Array(0)
  let dirty = false

  function push(trackBuffers = []) {
    const count = trackBuffers.length
    if (!count) return { frames: 0, added: 0 }
    // 各轨长度可能不等（某设备晚启动 / 丢帧）：取最短作为公共长度，
    // 差值如实记进 driftSamples，不假装各轨严格对齐。
    let commonLen = Infinity
    for (const buf of trackBuffers) {
      const len = buf?.length || 0
      if (len < commonLen) commonLen = len
    }
    if (!Number.isFinite(commonLen)) return { frames: 0, added: 0 }
    for (const buf of trackBuffers) {
      driftSamples = Math.max(driftSamples, (buf?.length || 0) - commonLen)
    }

    const totalFrames = Math.floor(commonLen / frameSize)
    const from = frameOwner.length
    if (totalFrames <= from) return { frames: 0, added: 0 }

    for (let f = from; f < totalFrames; f += 1) {
      const offset = f * frameSize
      let bestTrack = -1
      let bestRms = 0
      let secondRms = 0
      for (let t = 0; t < count; t += 1) {
        const buf = trackBuffers[t]
        const rms =
          buf && buf.length >= offset + frameSize
            ? computeRms(buf.subarray(offset, offset + frameSize))
            : 0
        if (stats[t] && rms > stats[t].peakRms) stats[t].peakRms = rms
        if (rms > bestRms) {
          secondRms = bestRms
          bestRms = rms
          bestTrack = t
        } else if (rms > secondRms) {
          secondRms = rms
        }
      }

      const voiced = bestRms >= o.silenceRms
      const want = voiced && bestTrack >= 0 ? bestTrack : -1
      const overlap = voiced && secondRms >= bestRms * o.overlapRatio

      if (want === currentTrack) {
        pendingTrack = -1
        pendingFrames = 0
      } else if (want === pendingTrack) {
        pendingFrames += 1
      } else {
        pendingTrack = want
        pendingFrames = 1
      }
      if (pendingFrames >= hysteresisFrames) {
        currentTrack = pendingTrack
        pendingTrack = -1
        pendingFrames = 0
      }

      frameOwner.push(currentTrack)
      frameOverlap.push(overlap)
      if (currentTrack >= 0 && stats[currentTrack]) stats[currentTrack].voicedFrames += 1

      // 只取主导轨这一段样本；无人说话就填 0（静音），不拿别的轨凑数
      const chunk = new Float32Array(frameSize)
      if (currentTrack >= 0) {
        const buf = trackBuffers[currentTrack]
        if (buf && buf.length >= offset + frameSize) {
          chunk.set(buf.subarray(offset, offset + frameSize))
        }
      }
      chunks.push(chunk)
    }

    dirty = true
    return { frames: totalFrames, added: totalFrames - from, frameSize }
  }

  function snapshot() {
    if (dirty || !frameOwner.length) {
      cachedMixed = concatFloat32(chunks)
      dirty = false
    }
    const totalFrames = frameOwner.length
    let silenceFrames = 0
    let overlapFrames = 0
    for (let f = 0; f < totalFrames; f += 1) {
      if (frameOwner[f] < 0) silenceFrames += 1
      if (frameOverlap[f]) overlapFrames += 1
    }
    return {
      sampleRate,
      frameMs: o.frameMs,
      frames: totalFrames,
      durationMs: Math.round(((totalFrames * frameSize) / sampleRate) * 1000),
      mixed: cachedMixed,
      runs: buildRuns(frameOwner, frameOverlap, {
        frameSize,
        sampleRate,
        trackMeta,
        minRunMs: o.minRunMs
      }),
      trackStats: stats.map((s) => ({
        index: s.index,
        label: s.label,
        deviceId: s.deviceId,
        voicedMs: Math.round(s.voicedFrames * o.frameMs),
        voicedRatio: totalFrames ? Number((s.voicedFrames / totalFrames).toFixed(3)) : 0,
        peakRms: Number(s.peakRms.toFixed(4))
      })),
      silenceMs: Math.round(silenceFrames * o.frameMs),
      overlapMs: Math.round(overlapFrames * o.frameMs),
      // 归属依据写死在返回值里，页面与导出都不能把它说成「声纹分离」
      basis: 'device_track',
      driftSamples
    }
  }

  function reset() {
    chunks.length = 0
    frameOwner.length = 0
    frameOverlap.length = 0
    stats.forEach((s) => {
      s.voicedFrames = 0
      s.peakRms = 0
    })
    currentTrack = -1
    pendingTrack = -1
    pendingFrames = 0
    driftSamples = 0
    cachedMixed = new Float32Array(0)
    dirty = false
  }

  return { push, snapshot, reset, frameSize, sampleRate }
}

// 一次性混音（离线 / 冒烟用）：与增量版同一套判定，避免两条实现漂移。
export function mixByDominance(tracks = [], options = {}) {
  if (!Array.isArray(tracks) || !tracks.length) {
    throw new Error('mixByDominance 至少需要一轨')
  }
  const sampleRate = tracks[0]?.sampleRate
  for (const t of tracks) {
    if (t?.sampleRate !== sampleRate) {
      throw new Error('mixByDominance 各轨采样率必须一致（不同采样率要先归一）')
    }
  }
  const mixer = createDominanceMixer({ sampleRate, tracks, options })
  mixer.push(tracks.map((t) => t.samples || new Float32Array(0)))
  return mixer.snapshot()
}

// 给定时间点查归属：找不到就返回 null，不猜一个说话人上去。
export function speakerAt(runs = [], ms) {
  if (!Array.isArray(runs) || !Number.isFinite(ms)) return null
  for (const run of runs) {
    if (ms >= run.startMs && ms < run.endMs) return run.trackIndex >= 0 ? run : null
  }
  return null
}

// ---- 浏览器采集层（Node 侧只用到上面的纯函数）----

export function isMultiTrackSupported() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  return Boolean(
    navigator.mediaDevices?.enumerateDevices &&
      navigator.mediaDevices?.getUserMedia &&
      (window.AudioContext || window.webkitAudioContext)
  )
}

// 列出可用音频输入。未授权时 label 是空串 —— 给一个可区分的占位名，
// 不要编成「会议室主麦」这种虚构名字。
export async function listAudioInputs() {
  if (!isMultiTrackSupported()) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      groupId: d.groupId || '',
      label: d.label || `音频输入 ${i + 1}`,
      labelKnown: Boolean(d.label)
    }))
}

export async function startMultiTrackCapture({ deviceIds = [], labels = {}, onLevel, options = {} } = {}) {
  if (!isMultiTrackSupported()) {
    throw new Error('当前环境不支持多轨采集（需 enumerateDevices + getUserMedia，HTTPS 或 localhost）')
  }
  const ids = (deviceIds || [])
    .filter((id) => typeof id === 'string')
    .slice(0, MULTI_TRACK_LIMITS.maxTracks)
  if (!ids.length) throw new Error('startMultiTrackCapture 至少需要一个音频输入设备')

  const Ctx = window.AudioContext || window.webkitAudioContext
  // 关键：所有轨共用一个 AudioContext。各自 new 一个会让时间轴不同源，
  // 帧对齐失效，说话人归属就会错位。
  const ctx = new Ctx()
  try {
    await ctx.resume()
  } catch {
    // 部分浏览器 resume 会抛错，采集仍可继续
  }

  const tracks = []
  const failed = []
  for (let i = 0; i < ids.length; i += 1) {
    const deviceId = ids[i]
    try {
      const constraints = {
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      }
      // 空 deviceId（未授权拿不到）不能用 exact，否则部分浏览器直接抛
      if (deviceId) constraints.audio.deviceId = { exact: deviceId }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      const silent = ctx.createGain()
      silent.gain.value = 0
      const track = {
        index: tracks.length,
        deviceId,
        label: labels[deviceId] || `音频输入 ${tracks.length + 1}`,
        stream,
        source,
        processor,
        silent,
        chunks: [],
        startedAt: Date.now()
      }
      source.connect(processor)
      processor.connect(silent)
      silent.connect(ctx.destination)
      processor.onaudioprocess = (event) => {
        const data = event.inputBuffer.getChannelData(0)
        track.chunks.push(new Float32Array(data))
        if (typeof onLevel === 'function') {
          onLevel({ index: track.index, label: track.label, rms: computeRms(data) })
        }
      }
      tracks.push(track)
    } catch (e) {
      // 单个设备打不开不该毁掉整场录制：记下来，其余轨照常采
      failed.push({ deviceId, reason: (e && e.message) || String(e) })
    }
  }

  if (!tracks.length) {
    try {
      await ctx.close()
    } catch {
      // 已关闭
    }
    throw new Error(
      `所有音频输入都无法打开：${failed.map((f) => f.reason).join('；') || '未知原因'}`
    )
  }

  const mixer = createDominanceMixer({ sampleRate: ctx.sampleRate, tracks, options })
  return {
    ctx,
    tracks,
    mixer,
    sampleRate: ctx.sampleRate,
    failed,
    startedAt: Date.now()
  }
}

// 采集中取「到此刻为止」的按轨混音快照（源采样率）。
// 用途：录制过程中做增量转写 —— 只读已采集样本，不打断采集、不清空缓冲。
export function collectMultiTrackSnapshot(handle) {
  if (!handle || !Array.isArray(handle.tracks)) return null
  const buffers = handle.tracks.map((t) => concatFloat32(t.chunks))
  handle.mixer.push(buffers)
  return handle.mixer.snapshot()
}

export async function stopMultiTrackCapture(handle) {
  if (!handle) throw new Error('stopMultiTrackCapture 需要 startMultiTrackCapture 返回的句柄')
  const { ctx, tracks, mixer, startedAt, sampleRate, failed } = handle
  for (const t of tracks) {
    t.processor.onaudioprocess = null
    try {
      t.processor.disconnect()
      t.silent.disconnect()
      t.source.disconnect()
    } catch {
      // 已断开
    }
    t.stream.getTracks().forEach((tr) => tr.stop())
  }
  try {
    await ctx.close()
  } catch {
    // 已关闭
  }

  // 收尾时把剩下的整帧全部喂进去，再统一降到 16k（重采样只做一次）
  mixer.push(tracks.map((t) => concatFloat32(t.chunks)))
  const attribution = mixer.snapshot()
  const normalized = normalizeAudio({
    samples: attribution.mixed,
    sourceRate: sampleRate,
    channels: 1
  })
  return {
    ...normalized,
    trackCount: tracks.length,
    tracks: tracks.map((t) => ({ index: t.index, label: t.label, deviceId: t.deviceId })),
    attribution: {
      runs: attribution.runs,
      trackStats: attribution.trackStats,
      overlapMs: attribution.overlapMs,
      silenceMs: attribution.silenceMs,
      frameMs: attribution.frameMs,
      basis: attribution.basis,
      driftSamples: attribution.driftSamples
    },
    failed: failed || [],
    capturedMs: Date.now() - startedAt,
    sourceLabel: 'browser_microphone_multitrack'
  }
}
