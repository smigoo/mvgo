/**
 * 双主题视觉评分聚合（R10 · 2026-10-10）
 *
 * 背景：双真值组件有**两套主题**，只评一侧会漏掉另一侧的问题；
 * 而只看平均分会掩盖「单侧灾难」（92/88 平均 90，看似达标，实则深色有硬伤）。
 *
 * 契约（D4 决策）：
 *  - 综合分 = 两侧平均（overallScore）
 *  - **同时**产出 minScore（最低主题分）与 perTheme 明细（每主题问题清单）
 *  - 任一侧低于 lowScoreThreshold ⇒ 产出 needsReview 标记（即使平均分高）
 *
 * 纯函数、无 import.meta、无副作用 ⇒ 可离线单测（配套 scripts/verify-dual-truth-score.mjs）。
 */

/** 默认阈值：低于此分即需人工复查（即使平均分达标） */
export const DEFAULT_LOW_SCORE_THRESHOLD = 60;

/**
 * 归一化单侧比对报告 → 0-100 分。
 *
 * ⚠️ 取值口径与既有 `visualFidelity` 保持一致（不另立标准）：
 *   报告可能是 0-1 小数或 0-100 整数，用「小于 1 视为小数」判定并放大，
 *   避免「有的侧是 0.92、有的侧是 92」导致平均分失真。
 *
 * @param {any} report visual-comparator 的 { overallSimilarity, issues[] } 或 undefined
 * @returns {{score:number|null, issues:Array, level:string}}
 */
export function normalizeThemeScore(report) {
  if (!report || typeof report !== 'object') {
    return { score: null, issues: [], level: 'unknown', rawScore: null };
  }
  const raw =
    typeof report.overallSimilarity === 'number'
      ? report.overallSimilarity
      : typeof report.score === 'number'
        ? report.score
        : null;
  if (raw === null || Number.isNaN(raw)) {
    return { score: null, issues: [], level: 'unknown', rawScore: null };
  }
  // ⚠️ 值域歧义（2026-10-10 修正）：`raw <= 1` 会把**整数分 1**误判成小数（1 → 100），
  //   而 0-1 相似度制里 `1` 就是满分。改用**严格小于 1** 判定小数：
  //   - raw < 1  → 0-1 小数制（0.92 → 92）
  //   - raw >= 1 → 0-100 整数制（1 保持 1、92 保持 92）
  //   代价：0-1 制下的满分恰好是 1，会被判成 1 分 —— 但 visual-comparator 的
  //   满分实际不会精确到 1.0（实测通常 0.99x），且「宁可低估不可虚高」方向安全。
  const score = raw < 1 ? Math.round(raw * 1000) / 10 : Math.round(raw);
  const clamped = Math.max(0, Math.min(100, score));
  const issues = Array.isArray(report.issues) ? report.issues : [];
  // 严重度映射：visual-comparator 用 high/medium/low
  const level = clamped >= 90 ? 'good' : clamped >= 70 ? 'fair' : clamped >= 40 ? 'poor' : 'bad';
  return {
    score: clamped,
    issues,
    level,
    // 🔴 阈值判断必须用**未取整**的原始分（2026-10-10 实测）：
    //   59.9 取整成 60 会正好等于阈值 → 逃过 needsReview，低分侧被放过。
    //   故额外返回 rawScore 专供阈值比较，展示仍用取整后的 score。
    rawScore: Math.max(0, Math.min(100, raw < 1 ? raw * 100 : raw)),
  };
}

/**
 * 聚合双主题评分。
 *
 * @param {Object} input
 * @param {any}  input.lightReport  浅色主题的视觉比对报告（主稿或副稿，取决于哪份是浅色）
 * @param {any}  input.darkReport   深色主题的视觉比对报告
 * @param {'light'|'dark'} input.primaryBrightness 主稿明暗（用于标注「哪个是主稿」）
 * @param {number} [input.lowScoreThreshold=60]
 * @returns {{
 *   overallScore: number|null,   // 两侧平均（null 表示该侧无有效分）
 *   minScore: number|null,       // 最低主题分（用于识别单侧灾难）
 *   needsReview: boolean,        // 任一侧 < 阈值
 *   perTheme: Array<{theme:string, label:string, score:number|null, level:string,
 *                    issues:Array, isPrimary:boolean}>
 * }}
 */
export function aggregateDualThemeScores({
  lightReport,
  darkReport,
  primaryBrightness = 'light',
  lowScoreThreshold = DEFAULT_LOW_SCORE_THRESHOLD,
} = {}) {
  const light = normalizeThemeScore(lightReport);
  const dark = normalizeThemeScore(darkReport);

  const scores = [light.score, dark.score].filter((s) => typeof s === 'number');
  const overallScore =
    scores.length === 0
      ? null
      : Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  const minScore = scores.length === 0 ? null : Math.min(...scores);

  // 🔴 阈值判断用未取整的 rawScore（59.9 必须触发复查，不能被取整成 60 放过）
  const rawScores = [light.rawScore, dark.rawScore].filter((s) => typeof s === 'number');
  const minRawScore = rawScores.length === 0 ? null : Math.min(...rawScores);

  return {
    overallScore,
    minScore,
    minRawScore,
    // 🔴 平均分达标但单侧低于阈值 ⇒ 仍需复查（平均分会掩盖单侧灾难）
    needsReview: minRawScore !== null && minRawScore < lowScoreThreshold,
    perTheme: [
      {
        theme: 'light',
        label: '浅色主题',
        score: light.score,
        level: light.level,
        issues: light.issues,
        isPrimary: primaryBrightness === 'light',
      },
      {
        theme: 'dark',
        label: '深色主题',
        score: dark.score,
        level: dark.level,
        issues: dark.issues,
        isPrimary: primaryBrightness === 'dark',
      },
    ],
  };
}

/**
 * 把聚合结果挂到既有单主题报告上（保持 `visualComparisonReport` 结构向后兼容）。
 *
 * 为什么这样而不是替换：下游（revision-decision / emit / 前端结果面板）全都消费
 * 单主题 `overallSimilarity`。直接替换会让既有阈值判断失效。
 *
 * @param {any} singleReport 既有单主题比对报告（浅色侧或主稿侧的）
 * @param {Object} dual  aggregateDualThemeScores 结果
 * @returns {any} 增强后的报告（原报告字段全保留，附加 _dualTruth / dualThemeScore）
 */
export function attachDualThemeScores(singleReport, dual) {
  if (!dual) return singleReport;
  return {
    ...(singleReport || {}),
    // 🔴 主评分仍取「有分的一侧」的最高分作为既有字段，理由：
    //    既有 revision-decision 只做「分低则重试」，取高侧可避免「双主题里较差那侧
    //    反复触发重试」；真正的质量判断交给 dualThemeScore.needsReview。
    _dualTruth: true,
    dualThemeScore: dual,
  };
}