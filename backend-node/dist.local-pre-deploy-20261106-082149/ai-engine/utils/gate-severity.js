/**
 * 🛡️ 层 7（2026-10-26 · 方案 A / 门禁分级）：WARN 升级策略 —— 单一真相源。
 *
 * 背景（原机制 2026-10-20 · #128 ③）：
 *   「只 WARN 不修」的判据长期「看见但放行」——模型每轮重试都不修，WARN 在日志里刷屏，
 *   最终**带病产物出厂**。原机制只做「同一 WARN id 连续 ≥2 轮检出 ⇒ 写 failOpenEvents 留痕」，
 *   作者注释自认「是否升级为 BLOCK/heal 由各规则独立决策」——本模块就是那个授权口。
 *
 * 本层做的事：
 *   把「留痕」升级为**可选的 BLOCK 化**。同一 WARN id 连续 ≥ afterStreak 轮 L0-B 检出
 *   （跨重试未愈合）⇒ 按策略表 action 处置：
 *     · 'WARN'  → 仅留痕（component-meta.json failOpenEvents[] + logger.warn）＝ 原语义
 *     · 'BLOCK' → 注入合成 BLOCK issue（id = `<id>-ESCALATED`）+ result.pass = false
 *                 ⇒ 重试耗尽后经 hasHardPublishBlock 判定 → l0b-fail（fail-closed，禁止发布）
 *
 * 🔴 为什么 BLOCK 化必须「逐 id 决策」而不能全量升级：
 *   BLOCK 会 fail-closed —— **该轮一个组件都不产出**。对「产物带此缺陷但仍可迭代」的判据
 *   （如冗余 flex、class 命名用实例 ID），fail-closed 比「带病出厂」更差（用户是拿截图迭代的）。
 *   所以只有「产物带此缺陷 ≈ 不可用 / 保真度确定性崩坏」的判据才配进入 BLOCK 集合。
 *
 * 🔴 为什么注入后**不清** `result._bypassed` / `_degraded`：
 *   降级旁路（连续失败 ≥ bypassThreshold）会把 `codeValidatorRetryCount` 重置为 0；
 *   若此处清掉 `_bypassed`，条件边 `!pass && !_bypassed && retryCount <= maxRetry` 会
 *   重新拿到完整重试预算 ⇒ 「降级 → 重置 → 重试 → 又降级」的预算复位死循环。
 *   保持降级态 ⇒ 条件边直接落到 `hasHardPublishBlock(r.issues)` 分支 ⇒ 重试次数天然有界。
 *
 * 开关（全部零改码可调）：
 *   MVGO_GATE_WARN_ESCALATE=0            → 整体关闭（连留痕都不做）
 *   MVGO_GATE_ESCALATE_MAX=<n>           → 连续轮次阈值（默认 2）
 *   MVGO_GATE_ESCALATE_BLOCK_IDS=a,b     → 改写 BLOCK 集合（'none' = 清空 / 'all' = 全候选）
 */

/** 升级后的合成 issue id 后缀。gate-score 的发布硬闸按此后缀识别。 */
export const ESCALATED_SUFFIX = '-ESCALATED';

/** 默认「连续多少轮未愈合」才升级 */
export const DEFAULT_AFTER_STREAK = 2;

export const ENV_ESCALATE_ENABLE = 'MVGO_GATE_WARN_ESCALATE';
export const ENV_ESCALATE_STREAK = 'MVGO_GATE_ESCALATE_MAX';
export const ENV_ESCALATE_BLOCK_IDS = 'MVGO_GATE_ESCALATE_BLOCK_IDS';

/**
 * WARN 升级策略表（**单一真相源**）。键 = L0-B 产出的 WARN issue id。
 * action:
 *   'BLOCK' = 连续 ≥ afterStreak 轮未愈合 ⇒ 升级为阻断（重试耗尽即 fail-closed）
 *   'WARN'  = 只留痕（产物仍放行）
 * rationale 必须写清「为什么」——判据要可辩驳，见本项目铁律。
 *
 * ⚠️ 表里未列出的 WARN id 一律按 DEFAULT_ACTION（'WARN'）处置（宁漏不误）。
 */
export const WARN_ESCALATION_POLICY = Object.freeze({
  // ── 升级为 BLOCK（布局保真确定性地崩坏，与 mc-max-1792985029695-58de7d47 病灶同源）──
  'FLEX-004': {
    action: 'BLOCK',
    rationale:
      'flex-grow 量纲混用（像素量级与比例量级同组）⇒ 兄弟区块高度比例严重失真（131 与 17 同组 → 前者独占 88% 空间），真值 Y 比例被确定性破坏，不是「欠佳」而是「错」。',
  },
  'TEXT-AXIS': {
    action: 'BLOCK',
    rationale:
      '真值是「N 条文本纵向堆叠」，产物却做成横向/嵌套 ⇒ 文本轴错位。真机 36:1698 即此形态：真值 TEXT「编码」32×16 被产物当 12 行属性列表容器，行列互换。',
  },

  // ── 显式保持 WARN（升级会 fail-closed，得不偿失；在此列表是为了「决策留痕」）──
  'FLEX-002': {
    action: 'WARN',
    rationale: 'column-flex 容器无任何 flex 子属性 ⇒ 与块级布局等价，纯冗余；产物完全可用。',
  },
  'STYLE-002': {
    action: 'WARN',
    rationale: 'class 名用实例 ID ⇒ 命名规范问题，与渲染结果无关（且与「文本/命名无关」既有取向一致）。',
  },
  'STYLE-003': {
    action: 'WARN',
    rationale: '子组件根元素设置了 margin ⇒ 间距欠佳，子组件仍能渲染。',
  },
  'RESOURCE-001': {
    action: 'WARN',
    rationale: '已下载资源未被使用 ⇒ 还原度可提升，非硬伤。',
  },
  'VAR-UNUSED': {
    action: 'WARN',
    rationale: '资源型 LESS 变量零消费 ⇒ 挂载断尾；但同族已由 CODE-022 硬闸覆盖，避免同一缺陷双重阻断。',
  },
});

/** 表中未列的 WARN id 的默认动作 */
export const DEFAULT_ACTION = 'WARN';
export const DEFAULT_RATIONALE = '未在 WARN_ESCALATION_POLICY 中显式声明 ⇒ 只留痕（宁漏不误）。';

/** 策略表中声明为 BLOCK 的 id 集合 */
export function policyBlockIds() {
  return Object.keys(WARN_ESCALATION_POLICY).filter(
    (id) => WARN_ESCALATION_POLICY[id]?.action === 'BLOCK',
  );
}

function truthyOff(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '0' || s === 'false' || s === 'off' || s === 'no';
}

/** 升级机制总开关（默认开） */
export function isEscalationEnabled(env = process.env) {
  return !truthyOff(env?.[ENV_ESCALATE_ENABLE]);
}

/** 连续轮次阈值（默认 2；非法值回落默认） */
export function resolveAfterStreak(env = process.env) {
  const n = parseInt(String(env?.[ENV_ESCALATE_STREAK] ?? ''), 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_AFTER_STREAK;
}

/**
 * 生效的 BLOCK 集合。
 * 环境变量 `MVGO_GATE_ESCALATE_BLOCK_IDS` 为**替换**语义（非追加）：
 *   'none' ⇒ 清空（等于「只留痕」＝原语义）；'all' ⇒ 全部候选；'a,b' ⇒ 指定集合。
 */
export function resolveBlockActionIds(env = process.env) {
  const raw = String(env?.[ENV_ESCALATE_BLOCK_IDS] ?? '').trim();
  const lower = raw.toLowerCase();
  if (lower === 'none') return new Set();
  if (lower === 'all') {
    return new Set([...policyBlockIds(), ...Object.keys(WARN_ESCALATION_POLICY)]);
  }
  if (raw) return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  return new Set(policyBlockIds());
}

/**
 * 判定一个（升级后的）issue id 是否为「策略表认可的发布硬闸」。
 * 供 gate-score#hasHardPublishBlock 使用 —— 这样硬闸口径与策略表同源，
 * 不会出现「graph 升级了但 service/publisher 不认」的双真相。
 */
export function isEscalatedBlockId(id, env = process.env) {
  const s = String(id || '');
  if (!s.endsWith(ESCALATED_SUFFIX)) return false;
  return resolveBlockActionIds(env).has(s.slice(0, -ESCALATED_SUFFIX.length));
}

/** 取某 id 的策略（含默认兜底） */
export function actionOf(id) {
  return WARN_ESCALATION_POLICY[id]?.action || DEFAULT_ACTION;
}

export function rationaleOf(id) {
  return WARN_ESCALATION_POLICY[id]?.rationale || DEFAULT_RATIONALE;
}

/**
 * 纯函数：按 issues + 上一轮 streak 计算本轮升级结果。
 * @param {object} p
 * @param {Array<{id:string,severity:string,file?:string,message?:string}>} p.issues
 * @param {Record<string,number>} [p.prevStreak] 上一轮 `_warnStreak`
 * @param {Record<string,string|undefined>} [p.env]
 * @returns {{
 *   enabled:boolean, afterStreak:number,
 *   warnStreak:Record<string,number>,
 *   escalated:Array<{id:string,streak:number,action:string,blockId:string,rationale:string}>,
 *   blockIssues:Array<object>
 * }}
 */
export function resolveWarnEscalations({ issues = [], prevStreak = {}, env = process.env } = {}) {
  const enabled = isEscalationEnabled(env);
  const afterStreak = resolveAfterStreak(env);
  const blockIds = resolveBlockActionIds(env);
  const list = Array.isArray(issues) ? issues : [];

  const warnIds = [
    ...new Set(
      list
        .filter((i) => i && i.severity === 'WARN' && i.id)
        .map((i) => String(i.id)),
    ),
  ];
  const prev = prevStreak && typeof prevStreak === 'object' ? prevStreak : {};
  const warnStreak = {};
  for (const id of warnIds) warnStreak[id] = (Number(prev[id]) || 0) + 1;

  const escalated = [];
  if (enabled) {
    for (const [id, streak] of Object.entries(warnStreak)) {
      if (streak < afterStreak) continue;
      const action = blockIds.has(id) ? 'BLOCK' : DEFAULT_ACTION;
      escalated.push({
        id,
        streak,
        action,
        blockId: `${id}${ESCALATED_SUFFIX}`,
        rationale: rationaleOf(id),
      });
    }
  }

  const blockIssues = escalated
    .filter((e) => e.action === 'BLOCK')
    .map((e) => ({
      id: e.blockId,
      severity: 'BLOCK',
      escalatedFrom: e.id,
      streak: e.streak,
      message:
        `[WARN 升级] ${e.id} 连续 ${e.streak} 轮 L0-B 检出且模型未修复 ⇒ 升级为 BLOCK。` +
        `原因：${e.rationale}`,
    }));

  return { enabled, afterStreak, warnStreak, escalated, blockIssues };
}

export default {
  WARN_ESCALATION_POLICY,
  resolveWarnEscalations,
  isEscalatedBlockId,
  resolveBlockActionIds,
  resolveAfterStreak,
  isEscalationEnabled,
  policyBlockIds,
};
