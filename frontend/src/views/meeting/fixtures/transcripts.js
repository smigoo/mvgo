// 离线标注转写稿（全部虚构脱敏，人名一律用说话人标签，项目名用项目 A/B）
// 对应开发计划 T-020：不依赖云密钥即可跑通全链路
// 每条 utterance 必须带 id / 时间戳 / lang / speaker / text / confidence

export const fixtures = {
  progress: {
    id: 'fx_progress',
    label: '进度会 · 项目 A',
    meetingType: 'progress_review',
    primaryLanguage: 'zh-CN',
    languages: [{ lang: 'zh-CN', share: 1, confidence: 0.98 }],
    utterances: [
      { id: 'u_0017', startMs: 12000, endMs: 17500, lang: 'zh-CN', speaker: '说话人 1', text: '项目 A 的联调已经做完了，剩下压测', confidence: 0.94 },
      { id: 'u_0021', startMs: 18000, endMs: 23500, lang: 'zh-CN', speaker: '说话人 2', text: '压测环境资源还没批下来，我这边跟运维催一下', confidence: 0.91 },
      { id: 'u_0102', startMs: 41000, endMs: 46000, lang: 'zh-CN', speaker: '说话人 1', text: '上线时间改到 11 月，原来写的 12 月不算了', confidence: 0.95 },
      { id: 'u_0088', startMs: 52000, endMs: 57000, lang: 'zh-CN', speaker: '说话人 2', text: '那遗留问题就一条，压测环境资源待确认', confidence: 0.89 },
      { id: 'u_0120', startMs: 58000, endMs: 63000, lang: 'zh-CN', speaker: '说话人 1', text: '这条我来跟，下周三前给结论', confidence: 0.9 },
      { id: 'u_0135', startMs: 71000, endMs: 76000, lang: 'zh-CN', speaker: '说话人 2', text: '另外用量看板也要补一下', confidence: 0.87 },
      { id: 'u_0140', startMs: 77000, endMs: 81000, lang: 'zh-CN', speaker: '说话人 1', text: '看板放到下个迭代，这次先不动', confidence: 0.86 }
    ],
    // 人工标注真值，供评测集与冒烟断言使用
    expected: {
      projectName: '项目 A',
      progressSummary: '联调已完成，待压测',
      milestone: '11 月',
      openIssueCount: 1
    }
  },

  requirement: {
    id: 'fx_requirement',
    label: '需求会 · 接口方案讨论',
    meetingType: 'requirement_review',
    primaryLanguage: 'zh-CN',
    languages: [{ lang: 'zh-CN', share: 1, confidence: 0.97 }],
    utterances: [
      { id: 'u_0201', startMs: 8000, endMs: 13000, lang: 'zh-CN', speaker: '说话人 1', text: '这次主要定一下接口鉴权方案', confidence: 0.93 },
      { id: 'u_0202', startMs: 14000, endMs: 20000, lang: 'zh-CN', speaker: '说话人 2', text: '方案 A 用网关统一鉴权，改动小但扩展性一般', confidence: 0.9 },
      { id: 'u_0203', startMs: 21000, endMs: 27000, lang: 'zh-CN', speaker: '说话人 3', text: '方案 B 每个服务自己鉴权，灵活但重复建设', confidence: 0.88 },
      { id: 'u_0204', startMs: 33000, endMs: 38000, lang: 'zh-CN', speaker: '说话人 1', text: '两边都有顾虑，今天先不定，等压测数据出来再说', confidence: 0.92 },
      { id: 'u_0205', startMs: 39000, endMs: 44000, lang: 'zh-CN', speaker: '说话人 2', text: '那我先把两种方案的对比文档补上', confidence: 0.87 }
    ],
    expected: {
      conclusion: '未达成',
      openQuestionCount: 1
    }
  },

  mixed: {
    id: 'fx_mixed',
    label: '中英混说 · 联调同步',
    meetingType: 'progress_review',
    primaryLanguage: 'mix:zh-en',
    languages: [
      { lang: 'zh-CN', share: 0.62, confidence: 0.95 },
      { lang: 'en-US', share: 0.38, confidence: 0.92 }
    ],
    utterances: [
      { id: 'u_0301', startMs: 6000, endMs: 11000, lang: 'zh-CN', speaker: '说话人 1', text: '先过一下 deploy 的进度', confidence: 0.92 },
      { id: 'u_0302', startMs: 11500, endMs: 16500, lang: 'en-US', speaker: '说话人 2', text: 'The staging pipeline is green now', confidence: 0.9 },
      { id: 'u_0303', startMs: 17000, endMs: 22000, lang: 'zh-CN', speaker: '说话人 1', text: '那生产环境的灰度今天可以开', confidence: 0.89 },
      { id: 'u_0304', startMs: 22500, endMs: 27500, lang: 'en-US', speaker: '说话人 2', text: 'But we still need the rollback script reviewed', confidence: 0.86 },
      { id: 'u_0305', startMs: 28000, endMs: 33000, lang: 'zh-CN', speaker: '说话人 1', text: '回滚脚本我下午补，算遗留问题', confidence: 0.88 }
    ],
    expected: {
      langCount: 2,
      openIssueCount: 1
    }
  }
}

export const fixtureList = Object.values(fixtures).map(({ id, label, meetingType }) => ({
  id,
  label,
  meetingType
}))
