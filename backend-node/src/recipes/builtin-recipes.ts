/**
 * 内置场景配方库（built-in recipes）
 * 复杂智能体 = 配方（六要素）。内置配方提供"整机蓝图"，用户选一个改参数即用。
 * 节点 handler 全部使用已注册内置节点（不依赖动态节点），保证开箱即用。
 */

const POS = (x: number, y: number) => ({ x, y });

export interface BuiltinRecipe {
  name: string;
  label: string;
  description: string;
  scenario: string;
  source: 'builtin';
  workflow: {
    entryNode: string;
    nodes: any[];
    edges: any[];
  };
}

const AGENT = (id: string, label: string, handler: string, y: number, config: any = {}) => ({
  id,
  label,
  type: 'agent',
  handler,
  position: POS(180, y),
  config,
});

const START = (id: string, y: number) => ({ id, label: '入口节点', type: 'start', position: POS(40, y), config: {} });
const END = (id: string, y: number) => ({ id, label: '结束节点', type: 'end', position: POS(620, y), config: {} });
const EDGE = (source: string, target: string) => ({ id: `edge-${source}-${target}`, source, target });

export const BUILTIN_RECIPES: BuiltinRecipe[] = [
  {
    name: 'component-gen',
    label: '组件生成（微码）',
    description: 'Figma 链接 → 微码组件。取数 → 视觉分析 → 布局审查 → 代码生成 → 对抗检查',
    scenario: '组件生成',
    source: 'builtin',
    workflow: {
      entryNode: 'start',
      nodes: [
        START('start', 120),
        AGENT('figma', 'Figma 数据获取', 'figma-connector', 100, { model: 'qwen3.7-plus' }),
        AGENT('visual', '视觉分析', 'visual-parser', 180),
        AGENT('layout', '布局审查', 'layout-reviewer', 260),
        AGENT('code', '代码生成', 'microcode-engineer', 340, { model: 'qwen3.7-plus' }),
        AGENT('adversarial', '对抗检查', 'adversarial-checker', 420),
        END('end', 120),
      ],
      edges: [
        EDGE('start', 'figma'),
        EDGE('figma', 'visual'),
        EDGE('visual', 'layout'),
        EDGE('layout', 'code'),
        EDGE('code', 'adversarial'),
        EDGE('adversarial', 'end'),
      ],
    },
  },
  {
    name: 'vue3-gen',
    label: 'Vue3 组件生成',
    description: 'Figma 链接 → 普通 Vue3 SFC 组件。取数 → 视觉分析 → Vue3 代码生成',
    scenario: '组件生成',
    source: 'builtin',
    workflow: {
      entryNode: 'start',
      nodes: [
        START('start', 120),
        AGENT('figma', 'Figma 数据获取', 'figma-connector', 100, { model: 'qwen3.7-plus' }),
        AGENT('visual', '视觉分析', 'visual-parser', 180),
        AGENT('code', 'Vue3 代码生成', 'vue3-engineer', 260, { model: 'qwen3.7-plus' }),
        END('end', 120),
      ],
      edges: [
        EDGE('start', 'figma'),
        EDGE('figma', 'visual'),
        EDGE('visual', 'code'),
        EDGE('code', 'end'),
      ],
    },
  },
  {
    name: 'doc-config',
    label: '文档转配置',
    description: '需求文档 → 组件配置四件套（业务事件/状态/配置/CSS 变量）。文档分析 → 配置生成',
    scenario: '文档处理',
    source: 'builtin',
    workflow: {
      entryNode: 'start',
      nodes: [
        START('start', 120),
        AGENT('doc', '文档分析', 'doc-analyzer', 100),
        AGENT('config', '配置生成', 'config-generator', 180, { model: 'qwen3.7-plus' }),
        END('end', 120),
      ],
      edges: [
        EDGE('start', 'doc'),
        EDGE('doc', 'config'),
        EDGE('config', 'end'),
      ],
    },
  },
  {
    name: 'url-pipeline',
    label: 'URL 解析演示',
    description: 'Figma 链接自动解析 fileKey/nodeId → 欢迎节点透传。入门示例：理解节点间数据流动',
    scenario: '示例',
    source: 'builtin',
    workflow: {
      entryNode: 'start',
      nodes: [
        START('start', 120),
        AGENT('parse', 'Figma URL 解析', 'url-parser-agent', 100),
        AGENT('hello', 'Hello 透传', 'hello-agent', 180, { greeting: '解析结果' }),
        END('end', 120),
      ],
      edges: [
        EDGE('start', 'parse'),
        EDGE('parse', 'hello'),
        EDGE('hello', 'end'),
      ],
    },
  },
  {
    name: 'render-compare',
    label: '渲染对比',
    description: '取数 → 截图渲染 → 视觉比对。验证渲染产物与设计稿的一致性',
    scenario: '质量验证',
    source: 'builtin',
    workflow: {
      entryNode: 'start',
      nodes: [
        START('start', 120),
        AGENT('figma', 'Figma 数据获取', 'figma-connector', 100, { model: 'qwen3.7-plus' }),
        AGENT('shot', '截图渲染', 'screenshot-renderer', 180),
        AGENT('compare', '视觉比对', 'visual-comparator', 260),
        END('end', 120),
      ],
      edges: [
        EDGE('start', 'figma'),
        EDGE('figma', 'shot'),
        EDGE('shot', 'compare'),
        EDGE('compare', 'end'),
      ],
    },
  },
];
