/**
 * 模型能力匹配与推荐
 *
 * 当组件复杂度超过当前模型能力时，给出精确的模型推荐和降级建议。
 */

import { getModelMaxOutputTokens, resolveModelCapability } from './model-config.js';

/**
 * 模型能力分级表（用于推荐）
 */
const MODEL_CAPABILITY_TIERS = {
  low: {
    label: '低输出模型',
    outputLimit: 8192,
    examples: [
      'qwen-vl-plus',
      'qwen-plus',
      'qwen-turbo',
      'claude-haiku-4',
      'deepseek-chat',
    ],
    suitable: '简单组件（≤5个元素，无图表）',
    cost: '💰 低成本',
  },
  mid: {
    label: '中输出模型',
    outputLimit: 16384,
    examples: ['gpt-4o', 'gpt-4o-mini', 'kimi-k3'],
    suitable: '中等组件（5-10个元素，1-2个图表）',
    cost: '💰💰 中等成本',
  },
  high: {
    label: '高输出模型',
    outputLimit: 32768,
    examples: ['claude-opus-4-8', 'claude-sonnet-4', 'qwen-max', 'gpt-4.1'],
    suitable: '复杂组件（>10个元素，多图表，复杂交互）',
    cost: '💰💰💰 较高成本',
  },
};

/**
 * 根据预估 tokens 推荐合适的模型
 * @param {number} estimatedTokens - 预估的输出 token 数
 * @param {string} currentModel - 当前使用的模型
 * @returns {object} 推荐信息
 */
export function buildModelSuggestion(estimatedTokens, currentModel) {
  // 🆕 使用「能力识别」解析：能力是否已识别 + 真实上限是否可知，驱动上游是否允许硬报错
  const cap = resolveModelCapability(currentModel, 16000);
  const currentLimit = cap.tokens;
  const isOverLimit = estimatedTokens > currentLimit;

  if (!isOverLimit) {
    return {
      needUpgrade: false,
      currentModel,
      currentLimit,
      estimatedTokens,
      identified: cap.identified,
      limitKnown: cap.limitKnown,
      capabilitySource: cap.source,
    };
  }

  // 超限，推荐更高能力的模型
  let recommendedTier = null;
  if (estimatedTokens <= 8192) {
    recommendedTier = 'low';
  } else if (estimatedTokens <= 16384) {
    recommendedTier = 'mid';
  } else {
    recommendedTier = 'high';
  }

  const tierInfo = MODEL_CAPABILITY_TIERS[recommendedTier];

  return {
    needUpgrade: true,
    currentModel,
    currentLimit,
    estimatedTokens,
    identified: cap.identified,
    limitKnown: cap.limitKnown,
    capabilitySource: cap.source,
    recommendedTier,
    tierInfo,
    message: buildUserFriendlyMessage(estimatedTokens, currentLimit, tierInfo),
  };
}

/**
 * 构建用户友好的错误提示
 */
function buildUserFriendlyMessage(estimatedTokens, currentLimit, tierInfo) {
  const overBy = estimatedTokens - currentLimit;
  const overPercent = Math.round((overBy / currentLimit) * 100);

  return `
## ⚠️ 组件复杂度超出当前模型能力

**当前情况**:
- 预估输出: ~${estimatedTokens.toLocaleString()} tokens
- 模型上限: ${currentLimit.toLocaleString()} tokens
- 超出: ${overBy.toLocaleString()} tokens (${overPercent}%)

**建议方案**:

### 🎯 方案1: 升级模型 (推荐)
切换到 ${tierInfo.label} (输出上限 ${tierInfo.outputLimit.toLocaleString()} tokens):
${tierInfo.examples.map((m) => `  - ${m}`).join('\n')}

**成本**: ${tierInfo.cost}
**适用场景**: ${tierInfo.suitable}

### ✂️ 方案2: 简化设计
- 减少元素数量 (目标: 减少 ${Math.ceil(overPercent / 10)} 个元素)
- 合并相似区域
- 移除非核心装饰元素

### 🔧 方案3: 拆分组件
将大组件拆分为 2-3 个独立的小组件，分别生成后组合使用。

---

💡 **提示**: 对于复杂的数据大屏或多图表组件，推荐使用高输出模型以获得最佳效果。
`.trim();
}

/**
 * 获取所有可用模型的能力对比表
 */
export function getModelCapabilityTable() {
  // 使用 MODEL_CAPABILITY_TIERS 中的示例模型构建对比表
  const models = Object.entries(MODEL_CAPABILITY_TIERS)
    .flatMap(([tierKey, tierInfo]) =>
      tierInfo.examples.map((modelName) => ({
        name: modelName,
        limit: tierInfo.outputLimit,
        tier: tierKey,
      })),
    )
    .sort((a, b) => b.limit - a.limit);

  return {
    models,
    tiers: MODEL_CAPABILITY_TIERS,
  };
}

/**
 * 检查模型是否适合当前组件复杂度
 * @param {number} estimatedTokens
 * @param {string} modelName
 * @returns {boolean}
 */
export function isModelSufficientForComplexity(estimatedTokens, modelName) {
  const limit = getModelMaxOutputTokens(modelName, 16000);
  // 留 10% 安全边际
  return estimatedTokens <= limit * 0.9;
}

export default {
  buildModelSuggestion,
  getModelCapabilityTable,
  isModelSufficientForComplexity,
};
