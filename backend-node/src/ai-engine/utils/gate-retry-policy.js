/**
 * 🛡️ 门禁重试预算分级（2026-11-16 · P0-b「只有真硬伤才配花 LLM 轮次」）
 *
 * 背景（真实数据，docs/2026-11-16-门禁误伤评审与瘦身建议.md §1）：
 *   51 个 completed 任务 100% 带 BLOCK/FAIL 信号，却最终全部降级放行；为这些「报了但不决定
 *   成败」的判据累计白烧 152 次生成轮次（L0-B 57 + acceptance 95），46 单打满 2 轮验收、
 *   19 单打满 3 轮代码校验。也就是说：**重试预算被形态/语义类判据吃光了，真硬伤反而只有
 *   l0MaxRetry 次机会**。
 *
 * 本模块只做一件事：给出「这条 BLOCK 值不值得回 engineer 重做一轮」的单一判据。
 *   - 值得（A 档）：产物**确定不可用**——空产物 / 白屏 / 运行时崩 / 整层内容消失 /
 *     语法编译不过 / 引用不存在的标识符。这类 LLM 重做一轮有实际收益。
 *   - 不值得（B/C 档）：静态形态、语义标签、几何欠佳、命名规范。这类修复轮实测
 *     `effective=false` 高频（改 A 引入 B），零重试直接降级交付更划算。
 *
 * 🔴 纪律：
 *   - 判据**不删**，只决定「要不要花重试预算」；severity / 计数行 / 台账全部保留。
 *   - 纯函数、无副作用；⛔ 不得引入 fs / import.meta（jest CJS 环境共用）。
 *   - 与 gate-score.js 的维度归属同源（dimensionOf 单一来源），避免两处各写一套分类。
 *
 * 开关（零改码可调）：
 *   ACCEPTANCE_MAX_RETRY=<n>  → acceptance 定向修复轮上限（默认 1，原硬编码 2）
 *   MVGO_GATE_RETRY_POLICY=legacy → 回到旧行为（任何 BLOCK 都占重试预算）
 */

import { dimensionOf } from './gate-score.js';
import { ESCALATED_SUFFIX } from './gate-severity.js';

/** 旧口径回退开关（true = 任何 BLOCK 都重试，等价改动前行为） */
export const ENV_RETRY_POLICY = 'MVGO_GATE_RETRY_POLICY';

/** acceptance 定向修复轮上限 env */
export const ENV_ACCEPTANCE_MAX_RETRY = 'ACCEPTANCE_MAX_RETRY';

/** acceptance 重试轮数默认值（原硬编码 2；实测第二轮 `effective=false` 占多数） */
export const DEFAULT_ACCEPTANCE_MAX_RETRY = 1;

/**
 * 「值得花一轮 LLM 重做」的 BLOCK 判据（A 档）。
 * 每条都能说出「产物确定不可用」的机制，否则不进来 —— 判据要可辩驳。
 */
export const RETRY_WORTHY_PATTERNS = Object.freeze([
  // ── 空产物 / 主体被掏空：用户拿到白板 ──
  /^EMPTY_ARTIFACT$/,
  /^EMPTY_SHELL$/,
  /^EMPTY_BODY$/,
  /^ARTIFACT_INCOMPLETE$/,
  // ── 真机 DOM 事实：预览不可达 / 无可见根节点 / pageerror / 全白 / 文本坍缩 / 零宽图表 ──
  /^RUNTIME-00[1-6]$/,
  /^RUNTIME-0(09|1[1-7])$/,
  // ── 运行时必崩：引用未声明的运行时标识符 / 未声明资源 URL ──
  /^CODE-029/,
  /^RES-URL-UNDECLARED$/,
  /^RESOURCE-003$/,
  /^CODE-015$/,
  // ── 类名契约（致败率 100%，是本项目唯一「零容忍」形态判据） ──
  /^CLASS-MUST-EXIST$/,
  // ── 语法/编译不过：坏文件落盘 = 白屏 ──
  /^SFC-/,
  /^sfc-/,
  /^LESS-COMPILE/,
  // ── 整层内容缺失（A 档边界）：重试 1 轮值得，再多没意义 ──
  /^TEXT-COVERAGE-GATE$/,
  /^SECTION-ANCHOR-MISSING$/,
  // ── acceptance 唯一 blocking 码：index 引用的组件未落盘 ⇒ 打不开 ──
  /^Dangling$/,
]);

/**
 * 单个 issue 是否值得占重试预算。
 * @param {{id?:string, severity?:string}} issue
 * @returns {boolean}
 */
export function isRetryWorthyIssue(issue = {}) {
  const severity = String(issue?.severity || '').toUpperCase();
  if (severity !== 'BLOCK') return false;
  const id = String(issue?.id || '').trim();
  if (!id) return false;
  // WARN 升级合成的 BLOCK（<id>-ESCALATED）属「跨轮未愈合的欠佳项」，不占重试预算：
  // 它存在的意义是「重试耗尽后禁止发布」，不是「再修一轮」。
  if (id.endsWith(ESCALATED_SUFFIX)) return false;
  return RETRY_WORTHY_PATTERNS.some((re) => re.test(id));
}

/**
 * issues 里是否存在「值得再修一轮」的 BLOCK。条件边唯一判据。
 * @param {Array<object>} issues
 * @returns {boolean}
 */
export function shouldRetryL0B(issues = []) {
  const list = Array.isArray(issues) ? issues : [];
  return list.some((i) => isRetryWorthyIssue(i));
}

/** 只挑出值得重试的 BLOCK（供修复指导只列这些，避免噪声误导修复轮） */
export function pickRetryWorthyIssues(issues = []) {
  const list = Array.isArray(issues) ? issues : [];
  return list.filter((i) => isRetryWorthyIssue(i));
}

/** 旧口径回退判定（MVGO_GATE_RETRY_POLICY=legacy ⇒ 任何 BLOCK 都重试） */
export function isLegacyRetryPolicy(env = process.env) {
  return String(env?.[ENV_RETRY_POLICY] ?? '').trim().toLowerCase() === 'legacy';
}

/**
 * acceptance 定向修复轮上限。原为 `const _accMaxRetry = 2` 硬编码（无 env、日志亦写死）。
 * @param {Record<string,string|undefined>} [env]
 * @returns {number} 0..3
 */
export function resolveAcceptanceMaxRetry(env = process.env) {
  const n = parseInt(String(env?.[ENV_ACCEPTANCE_MAX_RETRY] ?? ''), 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_ACCEPTANCE_MAX_RETRY;
  return Math.min(n, 3);
}

/**
 * 把「不占重试预算」的 issue 聚合成一行汇总（P3：降 token、降噪声，但不丢可观测性）。
 * 明细仍由调用方照旧打日志，这里只产出**回灌 prompt 的那一行**。
 * @param {Array<object>} issues
 * @returns {{noise:number, counts:Record<string,number>, line:string}}
 */
export function summarizeNoiseIssues(issues = []) {
  const list = Array.isArray(issues) ? issues : [];
  const counts = { 结构: 0, 资源: 0, 类名: 0, 语义: 0 };
  let noise = 0;
  for (const i of list) {
    if (isRetryWorthyIssue(i)) continue;
    noise += 1;
    counts[dimensionOf(i?.id)] += 1;
  }
  const detail = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}=${n}`)
    .join(' ');
  return {
    noise,
    counts,
    line: noise
      ? `⚠️ 其余 ${noise} 项为欠佳/观测类（不占重试预算，仅供留痕）：${detail}`
      : '',
  };
}

export default {
  RETRY_WORTHY_PATTERNS,
  isRetryWorthyIssue,
  shouldRetryL0B,
  pickRetryWorthyIssues,
  isLegacyRetryPolicy,
  resolveAcceptanceMaxRetry,
  summarizeNoiseIssues,
};
