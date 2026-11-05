/**
 * 智能体配置
 * 定义所有智能体的模型、温度、Prompt 等配置
 */

export default {
  // Figma 数据解析师
  figmaDataAnalyst: {
    name: 'Figma数据解析师',
    description: '从 Figma API 提取设计 Token',
    model: process.env.FIGMA_DATA_ANALYST_MODEL || 'claude-sonnet-4-6',
    temperature: 0.1,
    maxTokens: 4096,
    promptTemplate: 'prompts/agents/figma-data-analyst.md',
    referenceFiles: []
  },

  // 样式精修师
  styleRefiner: {
    name: '样式精修师',
    description: '精修 CSS 样式，确保与 Figma 像素级对齐',
    model: process.env.STYLE_REFINER_MODEL || 'claude-sonnet-4-6',
    temperature: 0.2,
    maxTokens: 4096,
    promptTemplate: 'prompts/agents/style-refiner.md',
    referenceFiles: [
      'prompts/references/css-variable-pattern.md',
      'prompts/references/ai-generation-constraints.md'
    ]
  },

  // 布局精修师
  layoutRefiner: {
    name: '布局精修师',
    description: '精修布局结构，确保与 Figma 一致',
    model: process.env.LAYOUT_REFINER_MODEL || 'claude-sonnet-4-6',
    temperature: 0.2,
    maxTokens: 4096,
    promptTemplate: 'prompts/agents/layout-refiner.md',
    referenceFiles: [
      'prompts/references/multi-layout-pattern.md',
      'prompts/references/ai-generation-constraints.md'
    ]
  },

  // 间距精修师
  spacingRefiner: {
    name: '间距精修师',
    description: '精修间距系统，确保与 Figma 精确匹配',
    model: process.env.SPACING_REFINER_MODEL || 'claude-sonnet-4-6',
    temperature: 0.2,
    maxTokens: 4096,
    promptTemplate: 'prompts/agents/spacing-refiner.md',
    referenceFiles: [
      'prompts/references/ai-generation-constraints.md'
    ]
  },

  // 对抗性验证师
  adversarialValidator: {
    name: '对抗性验证师',
    description: '挑战和质疑其他智能体的输出，检测幻觉',
    model: process.env.ADVERSARIAL_VALIDATOR_MODEL || 'claude-opus-4-8',
    temperature: 0.1,
    maxTokens: 8192,
    promptTemplate: 'prompts/agents/adversarial-validator.md',
    referenceFiles: []
  },

  // 仲裁师
  arbiter: {
    name: '仲裁师',
    description: '处理智能体之间的冲突',
    model: process.env.ARBITER_MODEL || 'claude-opus-4-8',
    temperature: 0.1,
    maxTokens: 8192,
    promptTemplate: 'prompts/agents/arbiter.md',
    referenceFiles: []
  },

  // 微码规范守护者
  codeValidator: {
    name: '微码规范守护者',
    description: '验证代码是否符合微码规范',
    model: process.env.CODE_VALIDATOR_MODEL || 'claude-sonnet-4-6',
    temperature: 0.1,
    maxTokens: 4096,
    promptTemplate: 'prompts/agents/code-validator.md',
    referenceFiles: [
      'prompts/references/stage-gate-rules.md',
      'prompts/references/ai-generation-constraints.md'
    ]
  }
}
