/**
 * 会议管线状态机（Node 侧权威副本）
 *
 * 🔴 与前端契约 `frontend/src/views/meeting/contracts/api-contract.js` 的
 *    `RUN_TRANSITIONS` / `CONSENT_TRANSITIONS` 是**同一份语义的两处落点**。
 *    为什么必须重复而不能 import 前端：本仓 tsconfig `allowJs` 未开（见 memory），
 *    Node 构建期无法消费前端 JS；跨子仓（frontend / backend-node 各自独立 Git）
 *    也不共享 tsconfig 与路径别名。
 *
 *    重复的代价必须被钉住：`meeting-contract-parity.spec.ts` 把**转移表逐条**写死断言，
 *    任何一侧改表而另一侧不动，spec 立刻红。改这里 ⇄ 必须同步改前端契约（或反之）。
 *
 * 语义要点（与契约注释一致，勿凭直觉改）：
 *   · 已定稿 → 无出边（FR-12：定稿冻结后不可回草稿态）；
 *   · 失败 → 处理中（断点续跑唯一入口）；
 *   · 已撤回 → 只能回征集中，**不可直接回已通过**（否则「撤回」这件事被抹掉）。
 */

export const RUN_STATUS = ['排队中', '处理中', '待确认', '已定稿', '失败'] as const;
export type RunStatus = (typeof RUN_STATUS)[number];

export const RUN_TRANSITIONS: Record<string, readonly string[]> = Object.freeze({
  排队中: ['处理中', '失败'],
  处理中: ['待确认', '失败'],
  待确认: ['已定稿', '失败'],
  已定稿: [],
  失败: ['处理中'],
});

export function canTransition(from: string, to: string): boolean {
  return (RUN_TRANSITIONS[from] || []).includes(to);
}

export const CONSENT_STATUS = ['未发起', '征集中', '已通过', '已阻断', '已撤回'] as const;
export type ConsentStatus = (typeof CONSENT_STATUS)[number];

export const CONSENT_TRANSITIONS: Record<string, readonly string[]> = Object.freeze({
  未发起: ['征集中'],
  征集中: ['已通过', '已阻断', '已撤回'],
  已通过: ['已阻断', '已撤回'],
  已阻断: ['已撤回', '征集中'],
  已撤回: ['征集中'],
});

export function canConsentTransition(from: string, to: string): boolean {
  return (CONSENT_TRANSITIONS[from] || []).includes(to);
}

/**
 * 模板必填字段：与前端 `contracts/draft-schema.js#TEMPLATE_SCHEMAS` **同源**
 * （由 parity spec 逐条钉住 id / version / label / required 四项；任一侧改而另一侧不动即红）。
 *
 * `required` 不是装饰：E-07 定稿前会据此清点「必填字段是否已有人工确认」，
 * 缺了它定稿门禁就退化成「只要有 draftAi 就行」。
 */
export const TEMPLATE_SCHEMAS = Object.freeze({
  progress_review: {
    id: 'progress_review',
    version: 'v1',
    label: '工作进度会',
    required: Object.freeze(['topic_context', 'progress_summary', 'milestone_status', 'open_issues']),
  },
  requirement_review: {
    id: 'requirement_review',
    version: 'v1',
    label: '需求方案会',
    required: Object.freeze(['topic_context', 'options', 'conclusion', 'open_questions']),
  },
  other: {
    id: 'other',
    version: 'v1',
    label: '其他会议',
    required: Object.freeze(['topic_context', 'progress_summary', 'open_issues']),
  },
});

/** 模板必填字段清单（E-07 定稿门禁用）；未知名返回 other 的清单 */
export function requiredFieldsOf(meetingType: string): readonly string[] {
  return ((TEMPLATE_SCHEMAS as any)[meetingType] || TEMPLATE_SCHEMAS.other).required ?? [];
}

export function schemaOf(meetingType: string): { id: string; version: string; label: string } {
  return (TEMPLATE_SCHEMAS as any)[meetingType] || TEMPLATE_SCHEMAS.other;
}

/** 字段确认态：与前端 `draft-schema.js#CONFIRM_STATES` 同源 */
export const CONFIRM_STATES = ['未确认', '编辑中', '已确认', '已驳回'] as const;

/** 三态来源标注：与前端 `draft-schema.js#SOURCE_STATES` 同源 */
export const SOURCE_STATES = ['from_meeting', 'from_background', 'unconfirmed'] as const;
