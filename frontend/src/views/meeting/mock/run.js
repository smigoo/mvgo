// T-023 / T-024 / T-025 的前端 Mock 版：阶段状态机 + Worker 轮询推进 + partial_artifacts + 断点续跑
// 设计要点：step() 是纯计算，浏览器用定时器驱动、Node 冒烟脚本用 while 驱动，两者行为完全一致。
// 每个阶段完成即写入 artifacts；失败时保留已完成阶段产物，retryFrom 只重跑失败阶段及之后。

import { fixtures } from '../fixtures/transcripts.js'
import { mockAudioAdapter } from './audio-adapter.js'
import { composeContract } from './constraint-composer.js'
import { mockGenerationAdapter } from './generation-adapter.js'
import { validateDraft } from './validator.js'

export const STAGES = [
  { id: 'queued', label: '排队 / 状态机守卫', pct: 0 },
  { id: 'normalize', label: '音频归一化 16k mono', pct: 8 },
  { id: 'lid', label: '语种识别 LID', pct: 18 },
  { id: 'diarize', label: '说话人分离 + 确定性编号', pct: 30 },
  { id: 'transcribe', label: '按语种转写', pct: 45 },
  { id: 'compose', label: '约束合成（三路输入）', pct: 60 },
  { id: 'generate', label: 'Map-Reduce 生成草稿', pct: 78 },
  { id: 'validate', label: '输出校验器 V-1~V-6', pct: 92 },
  { id: 'draft_ready', label: '待人工确认', pct: 100 }
]

function log(run, type, message) {
  run.events.push({ seq: run.events.length + 1, at: Date.now(), type, message })
}

const STAGE_FNS = {
  queued(run) {
    log(run, 'state', '状态机：处理中（条件更新防并发），RunVersion 关联各输入版本')
  },

  normalize(run) {
    const { fixture, audio } = run.ctx
    // 有真实采集结果就报真实时长/采样率；没有才回落到示例稿推导值
    run.ctx.normalized = mockAudioAdapter.normalize(fixture, audio)
    run.artifacts.normalize = {
      audioRef: run.ctx.normalized.audioRef,
      durationMs: run.ctx.normalized.durationMs,
      sampleRate: run.ctx.normalized.sampleRate,
      channels: run.ctx.normalized.channels,
      source: run.ctx.normalized.source,
      realCapture: Boolean(audio)
    }
    log(
      run,
      'ok',
      `归一化完成 ${run.ctx.normalized.durationMs}ms / 16k mono（${
        audio ? '本机麦克风真实采集，音频未上传' : '离线 fixture，未上传任何音频'
      }）`
    )
  },

  lid(run) {
    const { fixture, normalized } = run.ctx
    run.ctx.languageResult = mockAudioAdapter.detectLanguage(normalized, fixture)
    run.artifacts.lid = {
      segments: run.ctx.languageResult.segments,
      primary: run.ctx.languageResult.primary,
      isCodeSwitching: run.ctx.languageResult.isCodeSwitching
    }
    log(
      run,
      'ok',
      `LID：${run.ctx.languageResult.segments
        .map((s) => `${s.lang} ${Math.round(s.share * 100)}%`)
        .join(' / ')}${run.ctx.languageResult.isCodeSwitching ? ' · 中英混说' : ''}`
    )
  },

  diarize(run) {
    const { fixture } = run.ctx
    run.ctx.speakers = mockAudioAdapter.diarize(fixture)
    // 本地 Whisper 只出文字与时间戳，没做声纹聚类：这里必须如实报「未分离」，
    // 而不是硬编一个「说话人 1」出来充数。
    const performed = run.ctx.speakers.length > 0
    run.artifacts.diarize = {
      speakers: run.ctx.speakers.map((s) => ({
        clusterId: s.clusterId,
        label: s.label,
        firstStartMs: s.firstStartMs
      })),
      diarizationPerformed: performed,
      embeddingStored: false,
      identityBound: false
    }
    log(
      run,
      'ok',
      performed
        ? `分离出 ${run.ctx.speakers.length} 个说话人，按首次发声顺序编号；无 embedding 落库`
        : '本次转写未做声纹分离：说话人统一标注「说话人未区分」，不编造说话人编号'
    )
  },

  transcribe(run) {
    if (run.ctx.injectFailureAt === 'transcribe') {
      throw new Error('故障注入：转写服务模拟超时（E-xx 重试路径）')
    }
    const { fixture, speakers } = run.ctx
    run.ctx.utterances = mockAudioAdapter.transcribe(fixture, speakers)
    run.artifacts.transcript = {
      count: run.ctx.utterances.length,
      utterances: run.ctx.utterances
    }
    log(run, 'ok', `转写 ${run.ctx.utterances.length} 条，保留片段级 lang 与 utteranceId 作为证据锚点`)
  },

  compose(run) {
    const { fixture, utterances, languageResult, config } = run.ctx
    run.ctx.contract = composeContract({
      fixture, utterances, languageResult, config, runSeq: run.ctx.runSeq
    })
    const c = run.ctx.contract
    run.artifacts.contract = {
      meetingType: c.meetingType,
      requiredFields: c.requiredFields,
      outputLanguage: c.outputLanguage,
      priorityRule: c.priorityRule,
      hardConstraints: c.hardConstraints,
      backgroundSpanCount: c.backgroundSpans.length,
      backgroundSpans: c.backgroundSpans,
      injectionEvents: c.injectionEvents,
      truncatedRatio: c.truncatedRatio,
      contextChars: c.contextChars
    }
    log(
      run,
      c.injectionEvents.length ? 'warn' : 'ok',
      `约束合成：${c.requiredFields.length} 个必填字段 / ${c.backgroundSpans.length} 个背景 span / 越权指令 ${c.injectionEvents.length} 条`
    )
  },

  generate(run) {
    const { contract, utterances, fixture } = run.ctx
    run.ctx.rawDraft = mockGenerationAdapter.generate(contract, utterances, fixture)
    run.artifacts.rawDraft = {
      runVersion: run.ctx.rawDraft.runVersion,
      template: run.ctx.rawDraft.template,
      fieldCount: run.ctx.rawDraft.fields.length
    }
    const unresolved = run.ctx.rawDraft.fields.filter((f) => f.value === null).length
    log(run, 'ok', `生成 ${run.ctx.rawDraft.fields.length} 个字段，其中 ${unresolved} 个保持 null 待人工确认（不臆造）`)
  },

  validate(run) {
    const { rawDraft, contract } = run.ctx
    const validation = validateDraft(rawDraft, contract)
    run.validation = validation
    run.draft = validation.draft
    run.artifacts.validation = {
      passed: validation.passed,
      results: validation.results,
      repairs: validation.repairs
    }
    log(
      run,
      validation.passed ? 'ok' : 'warn',
      `校验器 ${validation.results.filter((r) => r.passed).length}/${validation.results.length} 通过，自动修复 ${validation.repairs.length} 处`
    )
  },

  draft_ready(run) {
    run.runVersion = run.ctx.rawDraft.runVersion
    run.artifacts.draft_ready = {
      runVersion: run.runVersion,
      status: '待人工确认',
      published: false,
      note: '内部草稿，人工确认后定稿并冻结快照；本 Mock 不提供发布动作'
    }
    log(run, 'state', '状态机：处理中 → 待确认。AI 产出永远是内部草稿（H-01）')
  }
}

export function createRun(fixtureId, config = {}, options = {}) {
  const fixture = fixtures[fixtureId]
  if (!fixture) throw new Error(`未知 fixture: ${fixtureId}`)
  const runSeq = options.runSeq ?? 1

  // 真实转写优先：传了 utterances（哪怕是空数组）就用真实内容替换示例稿，
  // 下游 diarize/transcribe/抽取/稿件全部基于真实文字，绝不回落 fixture。
  //
  // 判定只看「调用方是否显式给了真实转写数组」，**不看长度**：
  // 真实会议转写 0 句就是 0 句，草稿字段应当全部留空待人工确认；
  // 旧写法用 `Boolean(list.length)` 会在 0 句时静默换回示例稿，
  // 结果把演示文案（联调/压测/里程碑…）当成这场会议的结论，即「总结是硬编码」。
  const hasLiveUtterances = Array.isArray(options.utterances)
  const liveUtterances = hasLiveUtterances ? options.utterances : []
  const useLive = hasLiveUtterances
  const effectiveFixture = useLive
    ? {
        ...fixture,
        id: `${fixture.id}_live`,
        label: `${fixture.label}（本地转写）`,
        // 人工标注真值只对示例稿成立，真实转写时清空，避免冒充已知答案
        expected: {},
        utterances: liveUtterances
      }
    : fixture

  const run = {
    runId: `run_${Date.now().toString(36)}`,
    fixtureId,
    status: 'running',
    stageIndex: 0,
    stages: STAGES.map((s) => ({
      ...s,
      state: 'pending',
      startedAt: null,
      finishedAt: null,
      attempts: 0
    })),
    artifacts: {},
    events: [],
    draft: null,
    validation: null,
    runVersion: null,
    error: null,
    ctx: {
      fixture: effectiveFixture,
      source: useLive ? 'local_whisper' : 'fixture',
      // 真实采集的音频事实（时长/采样率/声道）。不传就表示本次没有真实音频，
      // normalize 阶段只能按示例稿推导——页面必须如实区分这两种情况。
      audio: options.audio || null,
      config: { ...config },
      runSeq,
      normalized: null,
      languageResult: null,
      speakers: null,
      utterances: null,
      contract: null,
      rawDraft: null,
      injectFailureAt: null
    }
  }
  log(
    run,
    'run',
    `创建 ${run.runId} · fixture=${effectiveFixture.id} · 来源=${useLive ? '本地 Whisper 真实转写' : '示例转写稿'} · 模板=${config.meetingType || effectiveFixture.meetingType} · 版本序号 r${runSeq}（重跑新建版本，旧版本保留）`
  )

  return {
    state: run,
    step() {
      return step(run)
    },
    runToEnd(limit = 100) {
      let n = 0
      while (run.status === 'running' && n < limit) {
        step(run)
        n += 1
      }
      if (run.status === 'running') {
        run.status = 'failed'
        run.error = { stageId: 'guard', message: `超过阶段上限 ${limit}，疑似死循环` }
        log(run, 'error', run.error.message)
      }
      return run
    },
    injectFailure(stageId) {
      if (!STAGES.some((s) => s.id === stageId)) throw new Error(`未知阶段: ${stageId}`)
      run.ctx.injectFailureAt = stageId
      log(run, 'warn', `故障注入已挂载于 ${stageId}`)
      return run
    },
    retryFrom(stageId) {
      return retryFrom(run, stageId)
    },
    clearFailure() {
      delete run.ctx.injectFailureAt
      return run
    }
  }
}

function step(run) {
  if (run.status !== 'running') return run
  const stage = run.stages[run.stageIndex]
  if (!stage) {
    run.status = 'done'
    return run
  }
  stage.state = 'running'
  stage.attempts += 1
  stage.startedAt = Date.now()
  try {
    STAGE_FNS[stage.id](run)
    stage.state = 'done'
    stage.finishedAt = Date.now()
    run.stageIndex += 1
    if (!run.stages[run.stageIndex]) {
      run.status = 'done'
      log(run, 'done', 'Mock 全链路完成；草稿待人工确认')
    }
  } catch (e) {
    stage.state = 'failed'
    stage.finishedAt = Date.now()
    run.status = 'failed'
    run.error = { stageId: stage.id, message: e.message }
    log(run, 'error', `${stage.id} 失败：${e.message}；已保留前序 partial_artifacts`)
  }
  return run
}

function retryFrom(run, stageId) {
  const idx = run.stages.findIndex((s) => s.id === stageId)
  if (idx < 0) throw new Error(`未知阶段: ${stageId}`)
  const keep = new Set(STAGES.slice(0, idx).map((s) => s.id))
  Object.keys(run.artifacts).forEach((k) => {
    if (!keep.has(k)) delete run.artifacts[k]
  })
  run.stages.forEach((s, i) => {
    if (i >= idx) {
      s.state = 'pending'
      s.startedAt = null
      s.finishedAt = null
      if (i > idx) s.attempts = 0
    }
  })
  run.stageIndex = idx
  run.status = 'running'
  run.error = null
  run.draft = null
  run.validation = null
  run.runVersion = null
  delete run.ctx.injectFailureAt
  log(
    run,
    'retry',
    `从 ${stageId} 断点续跑，保留前序产物 [${[...keep].join(', ') || '无'}]，重跑 ${run.stages.length - idx} 个阶段`
  )
  return run
}
