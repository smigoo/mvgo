"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NODE_TYPES = exports.HANDLER_REGISTRY = void 0;
exports.HANDLER_REGISTRY = {
    'figma-connector': {
        label: 'Figma 数据获取',
        description: '从 Figma API 获取设计稿的节点数据和样式信息',
        category: '数据源',
        configSchema: {
            model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
            temperature: { type: 'number', label: '温度', default: 0, min: 0, max: 1, help: '控制模型输出的随机性。0 = 稳定确定，1 = 富有创造性。代码生成建议设为 0。' }
        }
    },
    'visual-parser': {
        label: '视觉分析',
        description: '解析 Figma 节点树，提取布局结构、视觉元素和层级关系',
        category: '分析',
        configSchema: {
            model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
            temperature: { type: 'number', label: '温度', default: 0, min: 0, max: 1, help: '控制模型输出的随机性。0 = 稳定确定，1 = 富有创造性。解析任务建议设为 0。' }
        }
    },
    'layout-reviewer': {
        label: '布局审查',
        description: '审查生成的布局结构是否符合微码组件规范，检查容器嵌套和 flex 布局',
        category: '审查',
        configSchema: {
            model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
            temperature: { type: 'number', label: '温度', default: 0, min: 0, max: 0.3, help: '控制模型输出的随机性。0 = 稳定确定，1 = 富有创造性。审查工作建议设 0~0.3。' }
        }
    },
    'style-mapper': {
        label: '样式映射',
        description: '将 Figma 样式（颜色、字体、圆角、阴影等）映射为微码组件的 CSS 变量',
        category: '转换',
        configSchema: {
            model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
            temperature: { type: 'number', label: '温度', default: 0, min: 0, max: 1, help: '控制模型输出的随机性。0 = 稳定确定，1 = 富有创造性。样式映射建议设为 0。' }
        }
    },
    'microcode-engineer': {
        label: '代码生成',
        description: '根据布局结构和样式映射，生成符合微码规范的 Vue 组件代码',
        category: '生成',
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
        configSchema: {
            model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
            temperature: { type: 'number', label: '温度', default: 0, min: 0, max: 0.3, help: '控制模型输出的随机性。0 = 稳定确定，1 = 富有创造性。审查工作建议设 0~0.3。' }
        }
    },
    'doc-analyzer': {
        label: '文档分析',
        description: '分析微码组件需求文档，提取页面元素、交互设计、接口配置和初始化参数等关键信息，输出结构化JSON分析结果',
        category: '分析',
        configSchema: {
            model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
            temperature: { type: 'number', label: '温度', default: 0.3, min: 0, max: 0.5, help: '控制分析结果的多样性和创造性。文档分析建议设 0.2~0.4。' }
        }
    },
    'config-generator': {
        label: '配置生成',
        description: '基于文档分析结果生成四个配置章节（businessEvents业务事件、businessStatuses业务状态、businessConfig业务配置、cssVariableConfig CSS变量配置）的Markdown内容',
        category: '生成',
        configSchema: {
            model: { type: 'select', label: 'AI 模型', default: 'claude-sonnet-4-6' },
            temperature: { type: 'number', label: '温度', default: 0.3, min: 0, max: 0.5, help: '控制配置生成的确定性。配置生成建议设 0.2~0.4。' }
        }
    }
};
exports.NODE_TYPES = {
    agent: { label: 'Agent 节点', color: '#3CCF91', description: '执行 AI 角色任务的节点' },
    condition: { label: '条件分支', color: '#FF9800', description: '根据条件判断路由到不同分支' },
    start: { label: '入口节点', color: '#2196F3', description: '工作流的起点' },
    end: { label: '结束节点', color: '#9E9E9E', description: '工作流的终点' }
};
//# sourceMappingURL=workflow.constants.js.map