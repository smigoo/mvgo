// S4 后端契约固化：接口 / 状态机 / 数据落点 / 依赖就绪度
// 重要边界：这里只固化「契约与状态机」，不实现服务端、不起服务、不连数据库、不部署。
// 对应技术方案 §6 接口契约、§7 数据模型、§8 DB 状态机 + 单 Worker 轮询。

// ---- 产出落点（直接回答「最后的产出在哪里」）----
export const OUTPUT_TARGETS = Object.freeze({
  dev: {
    status: '已实现（dev 工作台）',
    draftOverlay: {
      type: 'browser-localStorage',
      keyPattern: 'mvgo.meeting.draft.<ownerId>.<runVersion>',
      indexKey: 'mvgo.meeting.draft.<ownerId>.index',
      note: 'AI 原草稿不可变；人工编辑只写 field_overlay，重跑新版本不覆盖。' +
        '🔴 key 必带 ownerId（2026-11-06 补）：同浏览器换账号登录时，' +
        '无前缀的 key 会把上一个用户的草稿直接呈现给下一个用户（dev 态越权）。'
    },
    frozenSnapshot: {
      type: 'browser-localStorage · state.snapshot',
      note: '发布后 frozen=true，不可回草稿态。快照随草稿同 key 分区（<ownerId>.<runVersion>）'
    },
    audio: {
      type: 'memory-only',
      note: '本地 16k mono PCM / WAV 只存在内存，不上传、不落盘'
    },
    exportFile: {
      type: '浏览器下载目录（用户点击导出才生成）',
      formats: ['json', 'markdown', 'csv', 'article(markdown)', 'html', 'word(doc 兼容)', 'pdf(browser_print)'],
      degraded: {
        word: 'Word 兼容 HTML .doc，非 OOXML .docx',
        pdf: '浏览器打印另存为 PDF，不生成 .pdf 文件'
      },
      hardConstraints: ['仅已定稿版本可导出', '跨格式保留内部声明 / 三态来源 / 证据引用 / RunVersion', '字段值按数据渲染并做 HTML 转义'],
      note: '导出物带内部草稿声明；未发布版本禁止对外分发（FR-11 / Q-13）'
    },
    composition: {
      type: 'localCompositionAdapter · 本地确定性整合（未调用云 LLM）',
      output: 'article_schema_v1 · 5 段式整合稿件 + 三态来源 + 证据索引',
      storage: '内存态；导出时才生成文件，不落库',
      note: 'CloudCompositionAdapter 骨架已固化，云 LLM 密钥未就绪时调用抛 NOT_CONNECTED'
    }
  },
  production: {
    status: '契约已定义，未实现（不自行部署）',
    draftOverlay: {
      type: 'DB · field_overlay 表',
      keyPattern: 'run_version + field_id',
      note: '需 T-050 服务端实现'
    },
    frozenSnapshot: { type: 'DB · meeting_minute 表 + 对象存储快照', note: '需 T-052 服务端实现' },
    audio: { type: '对象存储（临时，按留存策略到期删除）', note: '需 T-013 上传接口 + SEC-05 协议' },
    exportFile: {
      type: '服务端导出接口',
      formats: ['json', 'markdown', 'csv', 'article', 'html', 'docx', 'pdf'],
      blockers: ['docx 库 / OOXML 渲染', 'CJK 中文字体授权与嵌入', 'PDF 渲染服务'],
      note: '需 T-053；真 docx/pdf 未就绪前按 dev 降级路径（Word 兼容 .doc / 浏览器打印）'
    },
    composition: {
      type: '服务端合成接口（DB · article 表 + 对象存储）',
      output: 'article_schema_v1',
      note: '需 E-09 + 云 LLM 依赖；未实现、未部署'
    }
  }
})

// ---- 接口契约 ----
// 约定：implemented=false 表示「形状已冻结、服务端未实现」，不得对外宣称已接通。
//
// 归属（ownership）字段（2026-11-06 补）：每一条都必须显式声明「这份数据按谁的 ownerId 隔离」。
// 补它的原因：此前 18 条零归属字段，导致「新功能要按用户独立」这件事在契约里无处可查，
// 只能靠读实现反推 —— 实现一改，隔离口径就静默漂移。
//   run.ownerId      —— 归属落在 meeting run 上的 ownerId（创建者唯一写入，读写都要过归属闸）
//   retention.actor  —— 归属落在留存审计条目的 actor（E-17 只清自己名下，E-18 只看自己记录）
//   global           —— 全局单例配置（留存策略），不按 owner 分区；但**仍要求已登录**
// requiresAuth=true ⇒ 服务端必须挂阻断型身份守卫；只有 requireAuth=false 才允许匿名可达。
// Node 侧由 src/meeting/meeting.controller.ts 的类级 `@UseGuards(MeetingDevOnlyGuard, SessionGuard)`
// 逐条兑现，并由 backend-node/src/meeting/meeting-contract-parity.spec.ts 双向钉住。
export const BACKEND_ENDPOINTS = Object.freeze([
  { id: 'E-01', method: 'POST', path: '/api/meeting/runs', purpose: '创建 RunVersion（三路输入 + 模板 + 语种配置）', ownership: 'run.ownerId', requiresAuth: true, implemented: false },
  // E-02 门禁约束：前端 consent.canRecord() 只是本地镜像，服务端必须再判一次，
  // 否则改前端/直接调接口即可绕过 FR-03「任一人拒绝即禁止处理」。
  { id: 'E-02', method: 'POST', path: '/api/meeting/runs/:id/audio', purpose: '音频上传，返回 audio_ref（服务端须二次校验同意门禁，不信任前端判定）', ownership: 'run.ownerId', requiresAuth: true, implemented: false },
  { id: 'E-03', method: 'GET', path: '/api/meeting/runs/:id', purpose: '轮询阶段状态与 partial_artifacts', ownership: 'run.ownerId', requiresAuth: true, implemented: false },
  { id: 'E-04', method: 'POST', path: '/api/meeting/runs/:id/retry', purpose: '断点续跑，只重跑失败阶段及之后', ownership: 'run.ownerId', requiresAuth: true, implemented: false },
  { id: 'E-05', method: 'GET', path: '/api/meeting/runs/:id/draft', purpose: '读取 draft_ai + field_overlay 合并结果', ownership: 'run.ownerId', requiresAuth: true, implemented: false },
  { id: 'E-06', method: 'PATCH', path: '/api/meeting/runs/:id/draft/fields/:fieldId', purpose: '编辑 / 确认 / 驳回，写 field_overlay', ownership: 'run.ownerId', requiresAuth: true, implemented: false },
  { id: 'E-07', method: 'POST', path: '/api/meeting/runs/:id/publish', purpose: '人工确认齐备后定稿冻结快照', ownership: 'run.ownerId', requiresAuth: true, implemented: false },
  { id: 'E-08', method: 'GET', path: '/api/meeting/runs/:id/export', purpose: '按格式导出 md / html / word / pdf / csv / json / 整合稿件（过 FR-11 发布门禁；不得含原始音频）', ownership: 'run.ownerId', requiresAuth: true, implemented: false },
  { id: 'E-09', method: 'POST', path: '/api/meeting/runs/:id/compose', purpose: '整合草稿 + 转写稿 + 证据为输出稿件（过 V-1~V-6 与 FR-11）', ownership: 'run.ownerId', requiresAuth: true, implemented: false },
  // ---- FR-03 告知同意（SEC-01）：判定权威在服务端 ----
  { id: 'E-10', method: 'POST', path: '/api/meeting/runs/:id/consent/disclosure', purpose: '发起告知，返回 disclosure_version 与待表态参会人清单', ownership: 'run.ownerId', requiresAuth: true, implemented: false },
  { id: 'E-11', method: 'POST', path: '/api/meeting/runs/:id/consent/decisions', purpose: '提交单人参会人的同意 / 拒绝，逐人留痕', ownership: 'run.ownerId', requiresAuth: true, implemented: false },
  { id: 'E-12', method: 'GET', path: '/api/meeting/runs/:id/consent', purpose: '查询权威门禁状态（canRecord / blockers / blocking），前端据此展示与放行', ownership: 'run.ownerId', requiresAuth: true, implemented: false },
  { id: 'E-13', method: 'POST', path: '/api/meeting/runs/:id/consent/withdraw', purpose: '撤回同意：停止处理并触发产物删除；不可直接改回同意', ownership: 'run.ownerId', requiresAuth: true, implemented: false },
  { id: 'E-14', method: 'GET', path: '/api/meeting/runs/:id/consent/audit', purpose: '查询逐人同意留痕（declare / accepted / declined / withdraw 全链路 + 告知版本）', ownership: 'run.ownerId', requiresAuth: true, implemented: false },
  // ---- FR-14 留存与数据生命周期（SEC-07）----
  { id: 'E-15', method: 'GET', path: '/api/meeting/retention/policy', purpose: '读取留存策略（未配置时返回默认 90 天并标 source=default）', ownership: 'global', requiresAuth: true, implemented: false },
  { id: 'E-16', method: 'PUT', path: '/api/meeting/retention/policy', purpose: '管理员写入留存天数（合法区间 1~3650），写审计', ownership: 'global', requiresAuth: true, implemented: false },
  { id: 'E-17', method: 'POST', path: '/api/meeting/retention/purge', purpose: '执行到期清理：删音频 / 转写 / 中间产物 / embedding，保留脱敏统计与审计', ownership: 'retention.actor', requiresAuth: true, implemented: false },
  { id: 'E-18', method: 'GET', path: '/api/meeting/retention/audit', purpose: '查询删除审计（expire_purge / user_delete，仅脱敏计数，无正文）', ownership: 'retention.actor', requiresAuth: true, implemented: false }
])

// 归属合法取值（自检与 parity 判据共用；新增取值必须同步 Node 侧 parity spec）
export const OWNERSHIP_SCOPES = Object.freeze(['run.ownerId', 'retention.actor', 'global'])

// ---- 状态机（DB 条件更新 + 单 Worker 轮询，v1 不引入 MQ / K8s）----
export const RUN_STATUS = Object.freeze([
  '排队中',
  '处理中',
  '待确认',
  '已定稿',
  '失败'
])

export const RUN_TRANSITIONS = Object.freeze({
  排队中: ['处理中', '失败'],
  处理中: ['待确认', '失败'],
  待确认: ['已定稿', '失败'],
  已定稿: [],
  失败: ['处理中']
})

export function canTransition(from, to) {
  return (RUN_TRANSITIONS[from] || []).includes(to)
}

export function assertTransition(from, to) {
  if (!RUN_STATUS.includes(from) || !RUN_STATUS.includes(to)) return false
  return canTransition(from, to)
}

// ---- FR-03 同意状态机 ----
// 硬约束：任一参会人拒绝 → 整场「已阻断」；「已撤回」不可直接回到「已通过」
// （否则撤回这件事被抹掉），只能重新从「征集中」走一遍。
export const CONSENT_STATUS = Object.freeze(['未发起', '征集中', '已通过', '已阻断', '已撤回'])

export const CONSENT_TRANSITIONS = Object.freeze({
  未发起: ['征集中'],
  征集中: ['已通过', '已阻断', '已撤回'],
  已通过: ['已阻断', '已撤回'],
  已阻断: ['已撤回', '征集中'],
  已撤回: ['征集中']
})

export function canConsentTransition(from, to) {
  return (CONSENT_TRANSITIONS[from] || []).includes(to)
}

// ---- 数据模型（19 张表，与技术方案 §7 对齐，此处只固化名称与用途）----
export const DB_TABLES = Object.freeze([
  { name: 'meeting', purpose: '会议主记录' },
  { name: 'run_version', purpose: '一次生成运行，关联各输入版本' },
  { name: 'audio_ref', purpose: '音频引用与归一化信息' },
  { name: 'utterance', purpose: '转写片段（含片段级 lang / speaker）' },
  { name: 'speaker_segment', purpose: '说话人分离片段' },
  { name: 'background_doc', purpose: '背景资料（v1 仅纯文本，不解析 PDF/PPT）' },
  { name: 'background_span', purpose: '背景切分 span，仅实体消歧' },
  { name: 'instruction', purpose: '产出要求（软约束白名单）' },
  { name: 'template', purpose: '会议类型模板' },
  { name: 'draft_ai', purpose: 'AI 原始草稿，不可变' },
  { name: 'field_overlay', purpose: '人工编辑 / 确认 / 驳回，重跑不覆盖' },
  { name: 'evidence_ref', purpose: '证据引用（utterance_id / background_span_id）' },
  { name: 'validation_result', purpose: '输出校验器 V-1~V-6 结果' },
  { name: 'meeting_minute', purpose: '定稿快照' },
  { name: 'audit_log', purpose: '操作审计' },
  { name: 'consent_disclosure', purpose: '告知文案版本（FR-03：版本号 + 要点 + 生效时间）' },
  { name: 'consent_record', purpose: '逐人同意记录（decision / disclosure_version / 时间，不可覆盖只能追加）' },
  { name: 'retention_policy', purpose: '留存策略（天数 + 配置人 + 来源 default/admin）' },
  { name: 'retention_audit', purpose: '删除审计（仅脱敏计数，不含正文；与 audit_log 分表以免被常规日志轮转清掉）' }
])

// ---- 依赖就绪度：任何一项未就绪，都不得伪装成「后端已接通」----
export const BACKEND_DEPENDENCIES = Object.freeze([
  { id: 'D-01', name: '云 ASR / LLM 密钥', level: '阻塞', ready: false },
  { id: 'T-013', name: '后端音频上传接口', level: '阻塞', ready: false },
  { id: 'SEC-05', name: '云服务商委托处理协议（法务）', level: '阻塞', ready: false },
  { id: 'SEC-01', name: '告知文案法务审定（FR-03 disclosure v1）', level: '阻塞', ready: false },
  { id: 'Q-04', name: '留存天数产品 / 法务确认（默认 90 天为估算值）', level: '阻塞', ready: false }
])

// FR-03 / FR-14 的服务端契约自检：形状不全就不要声称「契约已固化」。
export function consentRetentionContractCheck() {
  const errors = []
  const requiredEndpoints = [
    ['E-10', '/consent/disclosure'],
    ['E-11', '/consent/decisions'],
    ['E-12', '/consent'],
    ['E-13', '/consent/withdraw'],
    ['E-14', '/consent/audit'],
    ['E-15', '/retention/policy'],
    ['E-16', '/retention/policy'],
    ['E-17', '/retention/purge'],
    ['E-18', '/retention/audit']
  ]
  requiredEndpoints.forEach(([id, fragment]) => {
    const found = BACKEND_ENDPOINTS.find((e) => e.id === id)
    if (!found) errors.push(`缺少接口 ${id}`)
    else if (!found.path.includes(fragment)) errors.push(`${id} 路径应含 ${fragment}`)
  })
  const requiredTables = ['consent_disclosure', 'consent_record', 'retention_policy', 'retention_audit']
  requiredTables.forEach((name) => {
    if (!DB_TABLES.some((t) => t.name === name)) errors.push(`缺少数据表 ${name}`)
  })
  if (canConsentTransition('已撤回', '已通过')) errors.push('已撤回不得直接回到已通过')
  if (!canConsentTransition('征集中', '已阻断')) errors.push('征集中应可转已阻断')
  // 除「未发起」外每个状态都应有出边，避免死状态
  CONSENT_STATUS.forEach((state) => {
    if (state !== '未发起' && !(CONSENT_TRANSITIONS[state] || []).length) {
      errors.push(`状态 ${state} 无出边（死状态）`)
    }
  })
  return {
    ok: errors.length === 0,
    errors,
    endpointCount: BACKEND_ENDPOINTS.length,
    tableCount: DB_TABLES.length,
    consentEndpointIds: BACKEND_ENDPOINTS.filter((e) => e.path.includes('/consent')).map((e) => e.id),
    retentionEndpointIds: BACKEND_ENDPOINTS.filter((e) => e.path.includes('/retention')).map((e) => e.id)
  }
}

export function backendReadiness() {
  const missing = BACKEND_DEPENDENCIES.filter((d) => !d.ready)
  return {
    ready: missing.length === 0,
    adapterMode: 'mock',
    endpointCount: BACKEND_ENDPOINTS.length,
    implementedCount: BACKEND_ENDPOINTS.filter((e) => e.implemented).length,
    tableCount: DB_TABLES.length,
    missing,
    outputTarget: OUTPUT_TARGETS.dev,
    note: '契约已固化；服务端未实现、未部署。dev 态产出落 localStorage，生产态落 DB + 对象存储（契约已定义）'
  }
}

export function selfCheckApiContract() {
  const problems = []
  if (BACKEND_ENDPOINTS.some((e) => e.implemented)) problems.push('出现已实现标记，与未部署边界冲突')
  if (BACKEND_ENDPOINTS.length !== 18) problems.push('接口清单数量异常')
  if (DB_TABLES.length !== 19) problems.push('数据表数量异常')
  // 归属口径自检（2026-11-06 补）：18 条全部显式声明 ownership 且取值合法、一律 requiresAuth。
  // 缺这一层，隔离口径就只存在于实现里，契约（这份「单一来源」）反而查不到 —— 正是本次要治的病。
  const badOwnership = BACKEND_ENDPOINTS.filter((e) => !OWNERSHIP_SCOPES.includes(e.ownership)).map((e) => e.id)
  if (badOwnership.length) problems.push(`接口未声明 ownership 或取值非法：${badOwnership.join('/')}`)
  const noAuth = BACKEND_ENDPOINTS.filter((e) => e.requiresAuth !== true).map((e) => e.id)
  if (noAuth.length) problems.push(`会议接口必须要求身份（requiresAuth=true），异常：${noAuth.join('/')}`)
  if (canTransition('已定稿', '待确认')) problems.push('定稿冻结后可回草稿态，违反 FR-12')
  if (!canTransition('处理中', '待确认')) problems.push('处理中 → 待确认 迁移缺失')
  // FR-03 / FR-14 服务端契约形状（E-10~E-18 + 4 张新表 + 同意状态机）并入主自检，
  // 避免出现「主自检通过、但合规契约缺项」的两套真相。
  const consentRetention = consentRetentionContractCheck()
  if (!consentRetention.ok) {
    consentRetention.errors.forEach((e) => problems.push(`FR-03/FR-14 契约：${e}`))
  }
  return { ok: problems.length === 0, problems, consentRetention }
}
