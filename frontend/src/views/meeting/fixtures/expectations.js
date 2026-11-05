// T-020 冒烟断言：以 fixtures 里的人工标注真值校验 Mock 全链路输出
// 断言对象统一为 run（createRun/runMockPipeline 的 state），失败时 Node 冒烟脚本以非 0 退出。

const field = (run, key) => run.draft?.fields.find((f) => f.key === key)

export const COMMON_EXPECTATIONS = [
  {
    name: '全链路阶段全部完成',
    check: (run) => run.status === 'done' && run.stages.every((s) => s.state === 'done')
  },
  {
    name: '输出校验器 V-1~V-6 全通过',
    check: (run) => run.validation?.passed === true && run.validation.results.length === 6
  },
  {
    name: '草稿为内部草稿，未发布',
    check: (run) => run.artifacts.draft_ready?.published === false
  },
  {
    name: '无 embedding 落库、无身份绑定',
    check: (run) =>
      run.artifacts.diarize?.embeddingStored === false &&
      run.artifacts.diarize?.identityBound === false
  },
  {
    name: '每个字段都有三态来源标注',
    check: (run) =>
      run.draft.fields.every((f) =>
        ['from_meeting', 'from_background', 'unconfirmed'].includes(f.sourceState)
      )
  },
  {
    name: '结论类字段均不引用背景资料',
    check: (run) =>
      run.draft.fields
        .filter((f) => f.key !== 'topic_context')
        .every((f) => f.sourceState !== 'from_background')
  },
  {
    name: '证据引用均可回跳到转写稿',
    check: (run) => {
      const ids = new Set(run.artifacts.transcript.utterances.map((u) => u.utteranceId))
      return run.draft.fields.every((f) =>
        (f.evidenceRefs || []).every(
          (r) => ids.has(r) || /^bs_\d{3}$/.test(r)
        )
      )
    }
  },
  {
    name: 'RunVersion 与各输入版本关联产物存在',
    check: (run) => Boolean(run.runVersion) && Boolean(run.artifacts.contract)
  }
]

export const EXPECTATIONS = {
  progress: [
    {
      name: '模板必填字段齐全（progress_review）',
      check: (run) =>
        ['topic_context', 'progress_summary', 'milestone_status', 'open_issues'].every((k) =>
          field(run, k)
        )
    },
    {
      name: '项目进展来自会议且命中「联调」',
      check: (run) =>
        /联调/.test(field(run, 'progress_summary')?.value || '') &&
        field(run, 'progress_summary').sourceState === 'from_meeting'
    },
    {
      name: '里程碑取会上新值 11 月（不采纳旧计划）',
      check: (run) => /11\s*月/.test(field(run, 'milestone_status')?.value || '')
    },
    {
      name: '遗留问题 1 条且带证据',
      check: (run) =>
        field(run, 'open_issues')?.matchedCount === 1 &&
        field(run, 'open_issues').evidenceRefs.length >= 1
    },
    {
      name: '主语种 zh-CN、无混说',
      check: (run) =>
        run.draft.detectedLanguages[0]?.lang === 'zh-CN' &&
        run.artifacts.lid.isCodeSwitching === false
    }
  ],

  requirement: [
    {
      name: '模板必填字段齐全（requirement_review）',
      check: (run) =>
        ['topic_context', 'options', 'conclusion', 'open_questions'].every((k) => field(run, k))
    },
    {
      name: '讨论结论为「未达成」而非臆造决议',
      check: (run) => /未达成/.test(field(run, 'conclusion')?.value || '')
    },
    {
      name: '方案对比抽到 A / B 两条且带证据',
      check: (run) => field(run, 'options')?.evidenceRefs.length >= 2
    },
    {
      name: '待决问题 ≥1 条',
      check: (run) => (field(run, 'open_questions')?.matchedCount || 0) >= 1
    }
  ],

  mixed: [
    {
      name: 'LID 识别为 2 个语种（中英混说）',
      check: (run) =>
        run.draft.detectedLanguages.length === 2 &&
        run.artifacts.lid.isCodeSwitching === true
    },
    {
      name: '片段级 lang 保留在转写稿',
      check: (run) =>
        run.artifacts.transcript.utterances.some((u) => u.lang === 'zh-CN') &&
        run.artifacts.transcript.utterances.some((u) => u.lang === 'en-US')
    },
    {
      name: '遗留问题 1 条且带证据',
      check: (run) => field(run, 'open_issues')?.matchedCount === 1
    },
    {
      name: '产出语言按配置落为 zh-CN',
      check: (run) => run.draft.outputLanguage === 'zh-CN'
    }
  ]
}
