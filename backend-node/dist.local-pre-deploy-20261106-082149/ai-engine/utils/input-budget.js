/**
 * P1-B：输入侧 Token 预算硬门禁（纯函数，零业务依赖，便于单测）。
 *
 * 与 TokenBudget（Graph 级事后累计熔断）不同，本工具在「模型调用前」对单次 Prompt 做：
 * 1. 估算输入 token（中英文混合启发式，不依赖外部分词器）
 * 2. 超预算时按确定性规则裁剪冗余段落，且绝不删除关键段
 * 3. 返回裁剪报告，供日志与门禁决策使用
 *
 * 默认不裁剪（maxInputTokens 为 Infinity 时原样返回），
 * 由调用方通过 env ENGINEER_MAX_INPUT_TOKENS 决定是否启用真实裁剪。
 */

/**
 * 估算文本输入 token 数（启发式）。
 * CJK 字符约 1.5 字/token，其余（英文/数字/符号）约 4 字符/token。
 *
 * @param {string} text
 * @returns {number}
 */
export function estimateInputTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  const chars = text.length;
  const cjk = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || [])
    .length;
  const nonCjk = chars - cjk;
  return Math.ceil(cjk / 1.5 + nonCjk / 4);
}

// 🎯 方案3: 增强裁剪保护规则 - 这些段落承载生成契约，裁剪时绝不删除
const KEEP_ANY =
  /(目标文件|必须输出|关键约束|不可违反|⚠️|===|\/\/ @file|修复|组件名-onload|\$mcComponentBuilder|🧱|组件结构骨架|布局方向|权威来源|资源变量白名单|禁止臆造|layoutStructure|resourceDomMapping|elementStyleMap)/;

/**
 * 将 Prompt 裁剪到输入 token 预算内。
 *
 * 策略（确定性、幂等、最小语义损失）：
 * - 按标题行（# / ##）切分段落；
 * - 必留段 = 含关键契约关键词的段 + 首个非空段（角色定位）；
 * - 从「可删段」按长度降序删除，直到估算 token <= 预算或无可删段。
 *
 * @param {string} prompt - 待发送的完整 Prompt
 * @param {number} maxInputTokens - 输入 token 预算上限（Infinity 表示不裁剪）
 * @returns {{ prompt: string, trimmed: boolean, originalChars: number, finalChars: number, estTokens: number, maxInputTokens: number, droppedSections: string[] }}
 */
export function trimPromptToBudget(prompt, maxInputTokens) {
  const result = {
    prompt,
    trimmed: false,
    originalChars: 0,
    finalChars: 0,
    estTokens: 0,
    maxInputTokens,
    droppedSections: [],
  };
  if (!prompt || typeof prompt !== 'string') return result;
  result.originalChars = prompt.length;
  result.finalChars = prompt.length;
  result.estTokens = estimateInputTokens(prompt);
  if (!Number.isFinite(maxInputTokens) || result.estTokens <= maxInputTokens)
    return result;

  // 按标题切分段落，保留标题分隔
  const sections = prompt.split(/(?=\n#{1,2}\s)/);
  const headIndex = sections.findIndex((s) => s.trim().length > 0);
  const keepIdx = new Set();
  const droppable = [];
  sections.forEach((section, idx) => {
    if (idx === headIndex || KEEP_ANY.test(section)) keepIdx.add(idx);
    else droppable.push(idx);
  });

  // 按长度降序，优先删最长的冗余规范段
  droppable.sort((a, b) => sections[b].length - sections[a].length);

  const current = sections.slice();
  const droppedSections = [];
  for (const idx of droppable) {
    const tentative = current.filter((s) => s != null).join('');
    if (estimateInputTokens(tentative) <= maxInputTokens) break;
    if (current[idx] == null) continue;
    droppedSections.push(current[idx].slice(0, 80).replace(/\s+/g, ' '));
    current[idx] = null;
  }

  const finalPrompt = current.filter((s) => s != null).join('');
  result.prompt = finalPrompt;
  result.trimmed = true;
  result.finalChars = finalPrompt.length;
  result.estTokens = estimateInputTokens(finalPrompt);
  result.droppedSections = droppedSections;
  return result;
}

/**
 * 门禁入口：返回 { prompt, report }，供调用方在 invoke 前使用。
 * 超预算时裁剪并给出结构化报告；未超预算原样返回。
 *
 * @param {string} prompt
 * @param {number} [maxInputTokens] - 预算上限（默认 Infinity，不裁剪）
 */
export function enforceInputBudget(prompt, maxInputTokens = Infinity) {
  const out = trimPromptToBudget(prompt, maxInputTokens);
  const report = {
    originalChars: out.originalChars,
    finalChars: out.finalChars,
    originalTokens: estimateInputTokens(prompt),
    finalTokens: out.estTokens,
    trimmed: out.trimmed,
    droppedSections: out.droppedSections,
  };
  return { prompt: out.prompt, report };
}
