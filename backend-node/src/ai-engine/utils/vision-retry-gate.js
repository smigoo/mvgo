/**
 * 🛡️ 2026-11-14：视觉分析「是否重跑」与「择优」判据（纯函数、无依赖、可单测）。
 *
 * 真机事实（同一张图、同一 prompt sha1、temperature=0）：五次运行分别产出 6 / 1 / 8 / 5 / 5 段
 *   ⇒ 非确定性来自服务端；而既有重试只看覆盖率，"只切出 1 段"（coverage 57%）不触发。
 */
/**
 * 🛡️ 2026-11-14：视觉分析「是否重跑」判据（纯函数，易测）。
 *
 * 真机事实（同一张图、同一 prompt sha1、temperature=0）：五次运行分别产出
 * 6 / 1 / 8 / 5 / 5 段 —— 服务端非确定性。既有重试只看覆盖率，1 段那种退化
 * （coverage 57%）不触发，于是"只切出一段"的分析被当正常结果派工。
 *
 * 判据：覆盖率判 LOW_COVERAGE **或** 段数 < `minSections`（且真值叶段 ≥ `minSections`）。
 */
export function shouldRetryVisionAnalysis({
  sections = 0,
  truthLeafSections = 0,
  lowCoverage = false,
  minSections = 3,
} = {}) {
  const few = Number(sections) < Number(minSections) && Number(truthLeafSections) >= Number(minSections);
  return { retry: Boolean(lowCoverage) || few, fewSections: few };
}

/**
 * 🛡️ 择优：段数优先（结构性），覆盖率次之（完整性）。
 * @returns {'retry'|'first'}
 */
export function pickBetterVisionAnalysis(first, retry) {
  const score = (s, rate) => (Number(s) || 0) * 1000 + (Number(rate) || 0);
  const a = score(first?.sections, first?.rate);
  const b = score(retry?.sections, retry?.rate);
  return b >= a ? 'retry' : 'first';
}
