// T-021 MockAudioAdapter
// 实现《技术方案 v1.1》的 AudioPipelineAdapter 契约，数据源为离线标注 fixture。
// 硬约束：不产生、不留存任何声纹 embedding；说话人编号按首次发声顺序确定性生成，不做身份绑定。
// 本文件纯 JS、无 DOM 依赖，Node 冒烟脚本与浏览器共用。

export const mockAudioAdapter = {
  id: 'mock-audio-v1',
  adapterMode: 'offline_fixture',
  supportedLanguages: ['zh-CN', 'en-US'],

  // audio 传了就是本机真实采集结果（真实时长/采样率），没传才按示例稿推导。
  // 页面要能区分这两种来源，不许拿示例稿时长冒充真实录音时长。
  normalize(fixture, audio = null) {
    if (audio && Number.isFinite(audio.durationMs)) {
      return {
        audioRef: audio.audioRef || 'browser_microphone_recording',
        source: audio.source || 'browser_microphone',
        durationMs: audio.durationMs,
        sampleRate: audio.sampleRate || 16000,
        channels: audio.channels || 1,
        normalized: true
      }
    }
    const durationMs = fixture.utterances.reduce((max, u) => Math.max(max, u.endMs), 0)
    return {
      audioRef: fixture.id,
      source: 'offline_fixture',
      durationMs,
      sampleRate: 16000,
      channels: 1,
      normalized: true
    }
  },

  // LID：由片段级 lang 按时长加权聚合；code-switching 时保留各语种 share
  detectLanguage(normalized, fixture) {
    const buckets = new Map()
    let total = 0
    fixture.utterances.forEach((u) => {
      const dur = u.endMs - u.startMs
      total += dur
      const cur = buckets.get(u.lang) || { lang: u.lang, durationMs: 0, confSum: 0, confCount: 0 }
      cur.durationMs += dur
      // 只有真的带置信度的句子才参与平均；null（本地 Whisper）不能当成 0 分拉低整体
      if (typeof u.confidence === 'number' && Number.isFinite(u.confidence)) {
        cur.confSum += u.confidence
        cur.confCount += 1
      }
      buckets.set(u.lang, cur)
    })
    const segments = [...buckets.values()]
      .map((b) => ({
        lang: b.lang,
        share: total ? Number((b.durationMs / total).toFixed(2)) : 0,
        // 没有任何置信度就报 null，不编一个数出来
        confidence: b.confCount ? Number((b.confSum / b.confCount).toFixed(2)) : null,
        durationMs: b.durationMs
      }))
      .sort((a, b) => b.share - a.share)
    return {
      segments,
      primary: segments[0]?.lang || 'zh-CN',
      isCodeSwitching: segments.length > 1,
      durationMs: normalized.durationMs
    }
  },

  // 说话人分离：聚类结果按 firstStartMs 确定性编号，仅本场有效
  // 若这批转写压根没做声纹分离（speakerDiarized === false，例如本地 Whisper），
  // 返回空数组——不把占位说话人硬编成「说话人 1」。
  diarize(fixture) {
    const utterances = fixture.utterances || []
    if (!utterances.some((u) => u.speakerDiarized !== false)) return []
    const order = []
    const durations = new Map()
    utterances.forEach((u) => {
      if (!order.includes(u.speaker)) order.push(u.speaker)
      durations.set(u.speaker, (durations.get(u.speaker) || 0) + (u.endMs - u.startMs))
    })
    return order.map((raw, i) => ({
      clusterId: `spk_${i + 1}`,
      label: `说话人 ${i + 1}`,
      rawLabel: raw,
      firstStartMs: utterances.find((u) => u.speaker === raw).startMs,
      totalDurationMs: durations.get(raw),
      embedding: null,
      identityBound: false
    }))
  },

  // 转写：每条 utterance 保留 lang / utteranceId / 置信度，供证据回跳与 V-2 校验
  transcribe(fixture, speakerSegments) {
    const labelOf = new Map(speakerSegments.map((s) => [s.rawLabel, s.label]))
    return fixture.utterances.map((u) => ({
      utteranceId: u.id,
      startMs: u.startMs,
      endMs: u.endMs,
      lang: u.lang,
      // 未做分离时用转写自带的标签（「说话人未区分」），不退化成原始占位符 S1
      speakerLabel:
        labelOf.get(u.speaker) || u.speakerLabel || (u.speakerDiarized === false ? '说话人未区分' : u.speaker),
      text: u.text,
      asrConfidence: u.confidence,
      // Whisper 不返回逐句置信度（null）：不能当成「低置信」，也不编一个数
      lowConfidence: typeof u.confidence === 'number' && u.confidence < 0.7,
      untranscribable: false
    }))
  },

  // 性别标签是可选展示属性；Mock 不产出，避免伪造 男a/男b/女a/女b
  classifyGender() {
    return {
      mode: 'disabled',
      genderByCluster: {},
      note: 'Mock 链路不产出性别标签；需 S3 真实音频 + 用户显式开启，低置信一律「未判定」'
    }
  }
}
