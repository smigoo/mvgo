/**
 * Workflow Handlers 注册表
 * 对应 src/roles/ 目录下的角色处理器
 */
export const HANDLER_REGISTRY = {
  'figma-connector': {
    label: 'Figma 数据获取',
    description: '从 Figma API 获取设计稿的节点数据和样式信息',
    category: '数据源',
    inputs: ['fileKey', 'nodeId', 'figmaToken'],
    outputs: ['figmaNodeData', 'styleTree', 'resources', 'imageMap'],
    configSchema: {
      model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
      temperature: { type: 'number', label: '温度', default: 0, min: 0, max: 1, help: '控制模型输出的随机性。0 = 稳定确定，1 = 富有创造性。代码生成建议设为 0。' }
    }
  },
  'visual-parser': {
    label: '视觉分析',
    description: '解析 Figma 节点树，提取布局结构、视觉元素和层级关系',
    category: '分析',
    inputs: ['figmaNodeData', 'previewImage'],
    outputs: ['layoutStructure', 'elementStyleMap', 'coverageReport'],
    configSchema: {
      model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
      temperature: { type: 'number', label: '温度', default: 0, min: 0, max: 1, help: '控制模型输出的随机性。0 = 稳定确定，1 = 富有创造性。解析任务建议设为 0。' }
    }
  },
  'layout-reviewer': {
    label: '布局审查',
    description: '审查生成的布局结构是否符合微码组件规范，检查容器嵌套和 flex 布局',
    category: '审查',
    inputs: ['layoutStructure'],
    outputs: ['layoutReview', 'layoutIssues'],
    configSchema: {
      model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
      temperature: { type: 'number', label: '温度', default: 0, min: 0, max: 0.3, help: '控制模型输出的随机性。0 = 稳定确定，1 = 富有创造性。审查工作建议设 0~0.3。' }
    }
  },
  'style-mapper': {
    label: '样式映射',
    description: '将 Figma 样式（颜色、字体、圆角、阴影等）映射为微码组件的 CSS 变量',
    category: '转换',
    inputs: ['figmaNodeData', 'elementStyleMap'],
    outputs: ['styleVariables', 'cssVarConfig'],
    configSchema: {
      model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
      temperature: { type: 'number', label: '温度', default: 0, min: 0, max: 1, help: '控制模型输出的随机性。0 = 稳定确定，1 = 富有创造性。样式映射建议设为 0。' }
    }
  },
  'microcode-engineer': {
    label: '代码生成',
    description: '根据布局结构和样式映射，生成符合微码规范的 Vue 组件代码',
    category: '生成',
    inputs: ['layoutStructure', 'elementStyleMap', 'figmaNodeData', 'requirementDoc'],
    outputs: ['generatedFiles', 'componentCode', 'componentId'],
    configSchema: {
      model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
      temperature: { type: 'number', label: '温度', default: 0, min: 0, max: 0.2, help: '控制模型输出的随机性。0 = 稳定确定，1 = 富有创造性。代码生成必须设 0~0.2 以确保一致性。' },
      maxTokens: { type: 'number', label: '最大 Token', default: 8192, min: 1024, max: 32768, help: '模型单次输出的最大长度，越大生成代码越完整但消耗更多额度。' }
    }
  },
  'adversarial-checker': {
    label: '对抗检查',
    description: '以对抗视角审查生成代码，检查规范合规性、潜在问题和优化建议',
    category: '审查',
    inputs: ['generatedFiles', 'componentCode'],
    outputs: ['adversarialReport', 'qualityScore'],
    configSchema: {
      model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
      temperature: { type: 'number', label: '温度', default: 0, min: 0, max: 0.3, help: '控制模型输出的随机性。0 = 稳定确定，1 = 富有创造性。审查工作建议设 0~0.3。' }
    }
  },
  'doc-analyzer': {
    label: '文档分析',
    description: '分析微码组件需求文档，提取页面元素、交互设计、接口配置和初始化参数等关键信息，输出结构化JSON分析结果',
    category: '分析',
    inputs: ['requirementDoc', 'document'],
    outputs: ['docAnalysis', 'analysisResult'],
    configSchema: {
      model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
      temperature: { type: 'number', label: '温度', default: 0.3, min: 0, max: 0.5, help: '控制分析结果的多样性和创造性。文档分析建议设 0.2~0.4。' }
    }
  },
  'config-generator': {
    label: '配置生成',
    description: '基于文档分析结果生成四个配置章节（businessEvents业务事件、businessStatuses业务状态、businessConfig业务配置、cssVariableConfig CSS变量配置）的Markdown内容',
    category: '生成',
    inputs: ['docAnalysis', 'analysisResult'],
    outputs: ['configs', 'configMarkdown'],
    configSchema: {
      model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
      temperature: { type: 'number', label: '温度', default: 0.3, min: 0, max: 0.5, help: '控制配置生成的确定性。配置生成建议设 0.2~0.4。' }
    }
  },
  'hello-agent': {
    label: 'Hello 示例 Agent',
    description: '最小智能体示例：透传组件名并输出欢迎信息（不调用 LLM，用于验证自定义管线链路）',
    category: '示例',
    inputs: ['componentName'],
    outputs: ['hello', 'message'],
    configSchema: {
      greeting: { type: 'text', label: '欢迎语', default: 'Hello', help: 'execute 时输出的问候前缀。' }
    }
  },
  'url-parser-agent': {
    label: 'Figma URL 解析',
    description: '解析 Figma 链接为 fileKey/nodeId（确定性，无 LLM），输出注入 fileKey/nodeId 供下游 figma-connector 使用',
    category: '数据源',
    inputs: ['figmaUrl'],
    outputs: ['fileKey', 'nodeId', 'urlParseResult', 'cleanUrl'],
    configSchema: {}
  },
  'layout-refiner': {
    label: '布局精修',
    description: '精修布局结构（容器嵌套/flex/间距），输入 layoutStructure，输出 refinedLayout（phase2 生产节点开放）',
    category: '精修',
    inputs: ['layoutStructure'],
    outputs: ['refinedLayout'],
    configSchema: {}
  },
  'style-refiner': {
    label: '样式精修',
    description: '精修样式映射（颜色/字体/尺寸精确化），输入 styleMappings，输出 refinedStyles（phase2 生产节点开放）',
    category: '精修',
    inputs: ['styleMappings'],
    outputs: ['refinedStyles'],
    configSchema: {}
  },
  'layout-style-refiner': {
    label: '布局样式合并精修',
    description: '布局+样式一体化精修 v3.8，输入 layoutStructure/styleMappings，输出 refinedLayout/refinedStyles',
    category: '精修',
    inputs: ['layoutStructure', 'styleMappings'],
    outputs: ['refinedLayout', 'refinedStyles'],
    configSchema: {}
  },
  'vue3-engineer': {
    label: 'Vue3 组件生成',
    description: '生成普通 Vue3 SFC 组件（非微码），输入 layoutStructure/figmaNodeData，输出组件代码（新管线 C2/C3）',
    category: '生成',
    configSchema: {}
  },
  'screenshot-renderer': {
    label: '截图渲染',
    description: '渲染组件截图（puppeteer），输出截图路径（适配器包装，phase2 生产节点开放）',
    category: '渲染',
    configSchema: {}
  },
  'visual-comparator': {
    label: '视觉比对',
    description: '截图 vs Figma 预览图视觉比对，输出相似度与差异报告（适配器包装，需 vision 模型）',
    category: '审查',
    configSchema: {}
  },
  'subcomponent-planner': {
    label: '子组件规划',
    description: '基于 layoutStructure 规划子组件拆分清单（纯确定性，无 LLM）',
    category: '分析',
    configSchema: {}
  }
};

/**
 * ⑥ 术语统一：节点类型定义
 * 旧术语 agent / condition 保留兼容；新术语 skill / gate 同步注册。
 * 前端编辑器可逐步从 agent → skill / condition → gate 迁移。
 */
export const NODE_TYPES = {
  agent: { label: 'Skill 节点', color: '#3CCF91', description: '执行 AI 角色任务的节点（旧称 Agent）' },
  condition: { label: '条件分支', color: '#FF9800', description: '根据条件判断路由到不同分支' },
  gate: { label: '校验门', color: '#E91E63', description: '执行校验器（Preview/CodeStructure），输出 checkResult 后路由' },
  start: { label: '入口节点', color: '#2196F3', description: '工作流的起点' },
  end: { label: '结束节点', color: '#9E9E9E', description: '工作流的终点' }
};

// ⑥ 术语统一：SKILL_REGISTRY 作为 HANDLER_REGISTRY 的别名
// 新代码优先使用 SKILL_REGISTRY，旧代码仍可用 HANDLER_REGISTRY
export const SKILL_REGISTRY = HANDLER_REGISTRY;
