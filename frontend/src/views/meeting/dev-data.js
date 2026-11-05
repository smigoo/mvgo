// 会议纪要开发工作台的静态数据源
// 单一事实源：tasks 的 id 同时供 .dev-loop/ttr-loop.mjs 解析任务顺序，勿改 id 格式
// 对应《会议智能纪要-开发实施计划-v1.0.md》第五章 WBS

export const phaseLabels = {
  S0: 'S0 工程骨架与契约',
  S1: 'S1 元数据与同意门禁',
  S2: 'S2 Mock 链路贯通',
  S3: 'S3 音频真实链路',
  S4: 'S4 约束合成与校验器',
  S5: 'S5 确认发布与看板',
  S6: 'S6 评测与压测',
  S7: 'S7 上线（需确认）'
}

export const sourceLabels = {
  from_meeting: '来自会议',
  from_background: '来自背景',
  unconfirmed: '未确认'
}

export const tasks = [
  { id: 'T-000', phase: 'S0', title: '在 mvgo/frontend 建立 dev-only meeting 工作台与 TTR loop', estimate: null },
  { id: 'T-001', phase: 'S0', title: '工程骨架、目录与 TS/lint 配置', estimate: 0.5 },
  { id: 'T-002', phase: 'S0', title: 'contracts：类型 + draft_schema_v1 + 模板 schema', estimate: 0.5 },
  { id: 'T-003', phase: 'S0', title: 'config：特性开关 + 语种清单 + 错误码表', estimate: 0.5 },
  { id: 'T-004', phase: 'S0', title: 'migrations/001_init.sql 落库（15 张表）', estimate: 0.5 },
  { id: 'T-005', phase: 'S0', title: '.env.example + 密钥不入库检查', estimate: 0.25 },
  { id: 'T-006', phase: 'S0', title: 'CI 骨架：typecheck / build / unit test', estimate: 0.25 },
  { id: 'T-010', phase: 'S1', title: 'G1 创建/查询会议接口', estimate: 0.5 },
  { id: 'T-011', phase: 'S1', title: '同意模块 + 服务端前置守卫', estimate: 0.75 },
  { id: 'T-012', phase: 'S1', title: '撤回同意：停止任务 + 删除产物 + 审计', estimate: 0.5 },
  { id: 'T-013', phase: 'S1', title: '音频上传校验：格式/时长/静音/分轨', estimate: 0.75 },
  { id: 'T-014', phase: 'S1', title: '状态机守卫：条件更新防并发', estimate: 0.5 },
  { id: 'T-015', phase: 'S1', title: '审计切面 + 幂等键中间件', estimate: 0.5 },
  { id: 'T-020', phase: 'S2', title: 'fixtures：3 份离线标注转写稿', estimate: 0.5 },
  { id: 'T-021', phase: 'S2', title: 'MockAudioAdapter', estimate: 0.5 },
  { id: 'T-022', phase: 'S2', title: 'MockGenerationAdapter', estimate: 0.5 },
  { id: 'T-023', phase: 'S2', title: 'Worker 轮询 + 阶段状态推进', estimate: 1.0 },
  { id: 'T-024', phase: 'S2', title: '重试 + 断点续跑 + partial_artifacts', estimate: 0.75 },
  { id: 'T-025', phase: 'S2', title: 'GET /runs/:id 进度 + GET /draft', estimate: 0.5 },
  { id: 'T-026', phase: 'S2', title: '前端 P1 配置页 + P2 上传页（接 Mock）', estimate: 1.0 },
  { id: 'T-027', phase: 'S2', title: '前端 P4 草稿页骨架', estimate: 0.5 },
  { id: 'T-030', phase: 'S3', title: '归一化 16k mono + VAD + 对象存储', estimate: 0.75 },
  { id: 'T-031', phase: 'S3', title: 'CloudAudioAdapter 骨架 + 契约测试', estimate: 0.5 },
  { id: 'T-032', phase: 'S3', title: 'LID 阶段：片段级 lang + 清单校验', estimate: 0.75 },
  { id: 'T-033', phase: 'S3', title: '分离 + 确定性编号', estimate: 0.75 },
  { id: 'T-034', phase: 'S3', title: '按语种转写 + 分组热词 + 混说分段', estimate: 0.75 },
  { id: 'T-035', phase: 'S3', title: '性别标注 + overlay 合并/拆分', estimate: 0.75 },
  { id: 'T-036', phase: 'S3', title: 'embedding 内存态检查 + 日志脱敏扫描', estimate: 0.5 },
  { id: 'T-037', phase: 'S3', title: '不可转写标记 + 音频回跳', estimate: 0.5 },
  { id: 'T-038', phase: 'S3', title: 'mock/cloud 契约测试', estimate: 0.25 },
  { id: 'T-040', phase: 'S4', title: '输入契约 + 分片 + 8000 字裁剪', estimate: 0.5 },
  { id: 'T-041', phase: 'S4', title: '规则 R-1~R-5 确定性实现', estimate: 1.0 },
  { id: 'T-042', phase: 'S4', title: '提示注入三层防护', estimate: 1.0 },
  { id: 'T-043', phase: 'S4', title: '实体词典 + 热词按语种分组', estimate: 0.5 },
  { id: 'T-044', phase: 'S4', title: 'Map-Reduce 生成（保留证据 ID 与 lang）', estimate: 1.0 },
  { id: 'T-045', phase: 'S4', title: '输出校验器 V-1~V-6', estimate: 0.75 },
  { id: 'T-046', phase: 'S4', title: '冲突并列 + unconfirmed.candidates', estimate: 0.5 },
  { id: 'T-047', phase: 'S4', title: 'CloudGenerationAdapter + 重试', estimate: 0.75 },
  { id: 'T-048', phase: 'S4', title: 'output_language 提示注入', estimate: 0.25 },
  { id: 'T-050', phase: 'S5', title: 'field_overlay merge（AI 产物不可变）', estimate: 0.5 },
  { id: 'T-051', phase: 'S5', title: '字段编辑/确认/驳回 + 必填校验', estimate: 0.75 },
  { id: 'T-052', phase: 'S5', title: '发布：冻结快照 + 状态防回跳', estimate: 0.5 },
  { id: 'T-053', phase: 'S5', title: '证据回跳', estimate: 0.75 },
  { id: 'T-054', phase: 'S5', title: '说话人合并/拆分前端 + 低置信提示', estimate: 0.5 },
  { id: 'T-055', phase: 'S5', title: '导出 md/csv（仅已发布）', estimate: 0.5 },
  { id: 'T-056', phase: 'S5', title: '版本对比页 P5', estimate: 0.5 },
  { id: 'T-057', phase: 'S5', title: '反馈采集 + 埋点事件', estimate: 0.5 },
  { id: 'T-058', phase: 'S5', title: '指标看板 P6（M-01~M-09）', estimate: 0.75 },
  { id: 'T-059', phase: 'S5', title: '权限矩阵 + 留存清理定时任务', estimate: 0.75 },
  { id: 'T-060', phase: 'S6', title: '评分脚本（M-03/04/05/08/09）', estimate: 0.75 },
  { id: 'T-061', phase: 'S6', title: '8 类评测样本 × 每个语种', estimate: 1.0 },
  { id: 'T-062', phase: 'S6', title: '注入用例集 ≥20 条', estimate: 0.5 },
  { id: 'T-063', phase: 'S6', title: 'E-01~E-19 异常集成测试', estimate: 0.75 },
  { id: 'T-064', phase: 'S6', title: '压测 1h/2h、并发 ≥2、P95', estimate: 0.5 },
  { id: 'T-065', phase: 'S6', title: '全量回归', estimate: 0.5 },
  { id: 'T-066', phase: 'S6', title: '灰度回滚脚本 + runbook', estimate: 0.5 },
  { id: 'T-070', phase: 'S7', title: '法务确认 SEC-05 + 启用 cloud', estimate: 0.25 },
  { id: 'T-071', phase: 'S7', title: 'G1→G2→G3 灰度上线', estimate: null }
]

// 草稿样例：与技术方案 v1.1 的 draft_schema_v1 对齐，用于开发期视觉与契约核对
export const mockDraft = {
  runVersion: 'rv_001',
  template: { id: 'progress_review', version: 'v1' },
  detectedLanguages: [
    { lang: 'zh-CN', share: 0.82, confidence: 0.97 },
    { lang: 'en-US', share: 0.18, confidence: 0.93 }
  ],
  outputLanguage: 'zh-CN',
  warnings: ['背景资料已截断 18%', '已保留必填字段，篇幅要求未完全满足'],
  truncatedRatio: 0.18,
  injectionEvents: [],
  fields: [
    {
      fieldId: 'f_001',
      key: 'topic_context',
      label: '议题背景',
      value: '项目 A 二期联调，背景资料中记录原计划 12 月上线',
      sourceState: 'from_background',
      evidenceRefs: ['bs_003'],
      confidence: 0.96,
      confirmState: '未确认',
      note: '背景引用字段，非结论；结论类字段禁止 from_background'
    },
    {
      fieldId: 'f_002',
      key: 'progress_summary',
      label: '项目进展',
      value: '项目 A 联调已完成，待压测',
      sourceState: 'from_meeting',
      evidenceRefs: ['u_0017', 'u_0021'],
      confidence: 0.91,
      confirmState: '未确认'
    },
    {
      fieldId: 'f_003',
      key: 'milestone_status',
      label: '里程碑',
      value: null,
      sourceState: 'unconfirmed',
      evidenceRefs: [],
      confidence: 0.42,
      confirmState: '未确认',
      reason: 'conflict',
      candidates: [
        { text: '会上改到 11 月', evidenceRefs: ['u_0102'] },
        { text: '资料写 12 月', evidenceRefs: ['bs_003'] }
      ]
    },
    {
      fieldId: 'f_004',
      key: 'open_issues',
      label: '遗留问题',
      value: '压测环境资源未就绪，待运维确认',
      sourceState: 'from_meeting',
      evidenceRefs: ['u_0088'],
      confidence: 0.88,
      confirmState: '未确认'
    }
  ]
}
