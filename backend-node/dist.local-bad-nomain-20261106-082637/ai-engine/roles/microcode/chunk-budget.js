/**
 * index.vue 分块输出预算（纯函数 / 零依赖 / 无 import.meta，便于 jest）
 *
 * 单一事实源：容量门禁（microcode-engineer.runCapacityCheck）与分块下发
 * （code-generator.generateIndexVue）必须共用本函数，禁止各写一套分母。
 *
 * 背景（2026-09-10 治本）：
 * - 旧逻辑按「整组件估算 tokens」与模型输出上限比较 → mc-max-1789036112943 实证
 *   44860 > 32768 直接抛 MODEL_CAPACITY_EXCEEDED，本可正常分块生成的组件被误杀。
 * - 中途曾按「进度编号 5 / 7」做等权分母（estTotal / chunkCount）→ 语义错误：
 *   `total: 5|7` 只是前端进度展示编号，真实权重是 template 0.1 / script 0.3（scriptSplit 三段各 0.3）。
 * - 现按真实 chunk 预算判定，且比较的是「实际请求的 maxTokens」（estTokens*1.2+1024，
 *   与 generateSingleChunk 的 dynamicMax 一致），不是裸 estTokens。
 */

/** template 段占整组件预估的比例 */
const TEMPLATE_WEIGHT = 0.1;
/** script 段（scriptSplit 时每一段）占整组件预估的比例 */
const SCRIPT_WEIGHT = 0.3;
/** template 段预算下限（避免过小导致必然截断） */
const TEMPLATE_FLOOR = 300;
/** script 段预算下限 */
const SCRIPT_FLOOR = 500;
/** 与 code-generator.generateSingleChunk 的 dynamicMax + 1024 余量保持一致 */
const DYNAMIC_MARGIN = 1024;
/** 与 code-generator.generateSingleChunk 的 20% 余量保持一致 */
const DYNAMIC_RATIO = 1.2;

/**
 * 计算 index.vue 各真实分块的输出预算。
 *
 * @param {{estTokens?: number, scriptSplit?: boolean}} splitDecision
 *        shouldSplitIndexVue() 的返回值（未拆分时 scriptSplit=false）
 * @returns {Array<{segmentType: string, scriptPart?: string, estTokens: number, requestedMaxTokens: number}>}
 */
export function getIndexVueChunkBudgets(splitDecision = {}) {
  const estTotal = Number(splitDecision?.estTokens) || 0;
  const estTemplate =
    estTotal > 0 ? Math.max(TEMPLATE_FLOOR, Math.round(estTotal * TEMPLATE_WEIGHT)) : 0;
  const estScript =
    estTotal > 0 ? Math.max(SCRIPT_FLOOR, Math.round(estTotal * SCRIPT_WEIGHT)) : 0;

  const chunks = [{ segmentType: 'template', estTokens: estTemplate }];
  if (splitDecision?.scriptSplit) {
    chunks.push(
      { segmentType: 'script', scriptPart: 'state', estTokens: estScript },
      { segmentType: 'script', scriptPart: 'lifecycle', estTokens: estScript },
      { segmentType: 'script', scriptPart: 'charts', estTokens: estScript },
    );
  } else {
    chunks.push({ segmentType: 'script', estTokens: estScript });
  }

  return chunks.map((chunk) => {
    const estTokens = Number(chunk.estTokens) || 0;
    return {
      ...chunk,
      requestedMaxTokens:
        estTokens > 0 ? Math.ceil(estTokens * DYNAMIC_RATIO + DYNAMIC_MARGIN) : 0,
    };
  });
}

/**
 * 取「最大单块」预算（容量门禁判定对象）。
 *
 * @param {{estTokens?: number, scriptSplit?: boolean}} splitDecision
 * @returns {{segmentType: string, scriptPart?: string, estTokens: number, requestedMaxTokens: number}}
 */
export function getMaxIndexVueChunkBudget(splitDecision = {}) {
  return getIndexVueChunkBudgets(splitDecision).reduce(
    (max, chunk) => (chunk.estTokens > max.estTokens ? chunk : max),
    { segmentType: 'unknown', estTokens: 0, requestedMaxTokens: 0 },
  );
}

export default { getIndexVueChunkBudgets, getMaxIndexVueChunkBudget };
