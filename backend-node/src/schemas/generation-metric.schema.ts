import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GenerationMetricDocument = GenerationMetric & Document;

/** 终态取值的契约类型（与 TasksService#TaskStatus 的终态子集保持一致） */
export type GenerationMetricStatus = 'completed' | 'failed' | 'cancelled';

/** 单条门禁结论（P0-3 埋点后填充；此前为空数组，不阻断统计） */
export interface GenerationGateResult {
  /** 门禁规则名，如 L0-A / L0-B / TEXT-TRUTH / RUNTIME-001 */
  rule: string;
  /** 级别：block=阻断（拒收） / warn=告警 */
  level: 'block' | 'warn';
  /** 本轮是否通过 */
  pass: boolean;
  /** 阻断项计数 */
  blockCount: number;
  /** 告警项计数 */
  warnCount: number;
  /** 问题条目数 */
  issueCount: number;
  /** 该门禁触发的重试轮次（0 表示一次通过） */
  retry?: number;
  /** 是否被人工改判（tasks.controller 的 review-override），用于区分自动判定与人工结论 */
  humanOverride?: boolean;
}

/**
 * 生成管线指标宽表（终态一条）。
 *
 * 定位：**唯一**的管理员监控统计事实源。由 `TasksService#finalizeTask` 在任务进入
 * completed / failed / cancelled 时写入（fire-and-forget），**只对新任务生效**，
 * 历史任务不回溯（见 docs/product/pipeline-monitoring/prd.md §9）。
 *
 * 设计要点：
 * - `sessionId` 唯一：同一任务重放（如人工审核改判）走 upsert，不产生重复行。
 * - `deptName`/`orgName` 是**任务时快照**：门户 `portalInfo` 是登录时快照且整包覆盖，
 *   用户换部门后历史无法还原，因此必须在此固化。
 * - `rootDomains` 由任务启动时冻结的 `configSnapshot` 的 textBaseURL / visionBaseURL 推导；
 *   若运行时发生供应商熔断切换，精确归属需查 `token_usages.providerId`（P0-3）。
 * - `excluded` 标记测试账号等不计入统计的记录；默认统计口径应过滤 `excluded: true`。
 */
@Schema({ collection: 'generation_metrics', timestamps: true })
export class GenerationMetric {
  /** 生成任务号（唯一） */
  @Prop({ required: true, unique: true, index: true })
  sessionId: string;

  /** 任务创建者 userId（字符串形式，可能为空：早期任务或系统任务） */
  @Prop({ index: true, sparse: true })
  userId?: string;

  /** 用户名快照 */
  @Prop()
  username?: string;

  /** 门户 uid（非用户名，用于排除清单与身份排查） */
  @Prop({ index: true, sparse: true })
  uid?: string;

  /** 部门名（任务时快照，来自 portalInfo.deptName） */
  @Prop()
  deptName?: string;

  /** 组织名（任务时快照，来自 portalInfo.orgName） */
  @Prop()
  orgName?: string;

  /** 组件目标类型 */
  @Prop({ enum: ['microcode', 'vue3'], index: true })
  target?: 'microcode' | 'vue3';

  /** 输入来源 */
  @Prop({ enum: ['figma', 'screenshot', 'html'], index: true })
  sourceType?: 'figma' | 'screenshot' | 'html';

  /** 生成档位 */
  @Prop({ enum: ['max', 'lite'] })
  generationTier?: 'max' | 'lite';

  /** 任务类型：component / page / api / workflow */
  @Prop({ index: true })
  taskType?: string;

  /** 终态 */
  @Prop({ required: true, enum: ['completed', 'failed', 'cancelled'], index: true })
  status: GenerationMetricStatus;

  /** 取消原因（P0-3 埋点后填充）：user_cancel / queue_evict / timeout / superseded */
  @Prop()
  cancelReason?: string;

  /** 业务组件号 */
  @Prop()
  componentId?: string;

  /** 组件名 */
  @Prop()
  componentName?: string;

  /** 任务开始时间（epoch ms） */
  @Prop({ index: true })
  startTime?: number;

  /** 任务结束时间（epoch ms） */
  @Prop()
  endTime?: number;

  /** 端到端耗时（ms，含排队） */
  @Prop()
  duration?: number;

  /** 失败原因摘要 */
  @Prop()
  error?: string;

  /** 质量门禁（注意：目前只有 warned / 缺省，无 pass/fail 二值，见 PRD §4.1） */
  @Prop({ enum: ['passed', 'warned'] })
  qualityGate?: 'passed' | 'warned';

  /** 文本侧实际使用的模型（来自 completionModels） */
  @Prop()
  textModel?: string;

  /** 视觉侧实际使用的模型（来自 completionModels） */
  @Prop()
  visionModel?: string;

  /** 文本侧端点归属根域名 */
  @Prop()
  textRootDomain?: string;

  /** 视觉侧端点归属根域名 */
  @Prop()
  visionRootDomain?: string;

  /** 归属根域名去重并集，供按域名分组统计 */
  @Prop({ type: [String], default: [], index: true })
  rootDomains: string[];

  /** 门禁结论（P0-3 埋点后填充） */
  @Prop({ type: [Object], default: [] })
  gates: GenerationGateResult[];

  /** 是否排除出统计口径（测试账号等） */
  @Prop({ default: false, index: true })
  excluded: boolean;

  /** 排除原因 */
  @Prop()
  excludedReason?: string;
}

export const GenerationMetricSchema = SchemaFactory.createForClass(GenerationMetric);

// 看板主查询：按时间倒序 + 多维过滤
GenerationMetricSchema.index({ startTime: -1 });
GenerationMetricSchema.index({ userId: 1, startTime: -1 });
GenerationMetricSchema.index({ deptName: 1, startTime: -1 });
