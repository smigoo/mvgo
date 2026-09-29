# 感智晓界 · 工作台模式产品需求文档

**版本**：v1.0  
**日期**：2026-09-29  
**作者**：smigoo  
**状态**：草案

---

## 一、背景与问题

### 1.1 现状

感智晓界（mvgo）当前采用**表单驱动的多页面模式**，每个功能模块独占一个页面入口。用户完成一个完整任务链需要跨 4-6 个页面跳转：

| 当前功能模块 | 路由路径 | 核心能力 |
|---|---|---|
| 组件生成（v4 画布） | /generator/components | 截图/Figma/HTML → 组件 |
| 页面生成 | /generator/page | Figma 页面 → 批量组件 |
| API 接口生成 | /generator/api | Apifox → 前端 API 代码 |
| 轻量生成 | /generator/lite | 截图/Figma → 快速组件 |
| 任务中心 | /tasks | 任务列表/状态/完成率 |
| 任务详情 | /tasks/:sessionId | 进度/产物/规范检查 |
| 工作流编辑器 | /generator/workflow | 可视化管线编排 |
| 组件库 | /components | 我的/公共组件管理 |
| 深度研究 | /workspace | AI 编程助手 |
| 大屏布局 | /screen | 大屏布局开发 |
| 页面骨架 | /generator/page-skeleton | 大屏截图 → 页面骨架 |
| Playground | /demo/:componentId | 组件试玩/AI 修改 |

### 1.2 核心痛点

| 痛点 | 具体表现 | 影响 |
|------|---------|------|
| **上下文割裂** | 每次跳转页面，之前的配置/状态丢失 | 用户需要重新建立心智模型 |
| **学习成本高** | 10+ 个入口，新用户不知从哪开始 | 上手周期长，依赖培训 |
| **迭代不连贯** | "把背景色改成蓝色"也要找到对应入口 | 小修改的操作成本过高 |
| **流程串联靠人肉** | 生成→对接→预览→推送没有自动串联 | 效率低，易遗漏步骤 |
| **跨模块数据不通** | 组件生成页不知道用户刚在 API 页生成了什么 | 各模块信息孤岛 |

### 1.3 目标愿景

**一句话**：用户在一个对话界面里，用自然语言完成感智晓界 80% 的核心功能——生成、修改、管理、发布。

**对标产品**：

| 对标产品 | 核心模式 | 可借鉴点 |
|---------|---------|---------|
| Codex（OpenAI） | 对话式代码生成→测试→提交 | 任务链自动串联 |
| WorkBuddy | 对话式文件操作→代码编写→部署 | 本地文件+对话混合交互 |
| v0.dev（Vercel） | 对话式 UI 生成→迭代→导出 | 实时预览+对话修改 |

---

## 二、用户场景

### 2.1 核心场景矩阵

| # | 场景 | 用户输入示例 | 系统行为 | 对话适配度 |
|---|------|-----------|---------|-----------|
| 1 | **快速生成** | "帮我把这个截图变成微码组件" + 拖入图片 | 识别意图→调截图生成→返回预览+组件 ID | ⭐⭐⭐⭐⭐ |
| 2 | **Figma 生成** | "用这个 Figma 链接生成 Max 规格的 Vue3 组件" + 贴 URL | 解析 URL→确认参数→提交→轮询→返回结果 | ⭐⭐⭐⭐⭐ |
| 3 | **迭代修改** | "把标题颜色改成 #1890ff" | 定位当前组件→调 AI 修改器→返回 diff 预览 | ⭐⭐⭐⭐⭐ |
| 4 | **接口对接** | "给这个组件接上设备监控的 API" | 识别组件→匹配 Apifox 目录→生成绑定→预览 | ⭐⭐⭐⭐ |
| 5 | **批量操作** | "把最近失败的 3 个任务重新跑一遍" | 查任务→筛选失败→批量重建→返回进度 | ⭐⭐⭐⭐ |
| 6 | **查询统计** | "我上周生成了多少个组件？成功率多少？" | 查统计→返回可视化摘要 | ⭐⭐⭐⭐⭐ |
| 7 | **页面生成** | "把这个 Figma 页面里的组件批量生成" | 分析页面→列清单→确认→批量执行 | ⭐⭐⭐⭐ |
| 8 | **工作流执行** | "用上次那个配方跑一下" | 加载配方→确认→执行→返回结果 | ⭐⭐⭐ |
| 9 | **发布交付** | "把这个组件推到 GitLab" | 触发推送→返回 MR 链接 | ⭐⭐⭐⭐ |
| 10 | **新手引导** | "我该怎么用这个平台？" | 返回交互式引导/推荐路径 | ⭐⭐⭐⭐⭐ |

### 2.2 典型任务流对比

**当前流程（表单模式）**：

```
/generator/components → 选 Tab → 填参数 → 提交
    → /tasks/:sessionId → 等进度 → 查产物
    → /preview/:componentId → 预览
    → ApiBindingWizard(抽屉) → 对接接口
    → /components/:id → 管理
    → 推送 GitLab
```

**工作台模式（对话式）**：

```
用户：[拖入截图] "帮我生成微码组件"
AI：识别为数据面板，建议 Max 规格，确认？
用户：确认
AI：生成中... ████████░░ 80% → 完成！[预览卡片]
用户：标题颜色改成蓝色
AI：已修改 [Diff 预览卡片]
用户：接上设备监控 API
AI：匹配到 3 个 API，推荐 device-monitor [确认卡片]
用户：第一个
AI：已对接 [预览卡片]
用户：推到 GitLab
AI：已推送，MR 链接：[链接卡片]
```

**对比**：6 次页面跳转 → 1 个对话窗口内完成。

---

## 三、信息架构

### 3.1 页面布局

```
┌─────────────────────────────────────────────────────────────────────┐
│  感智晓界 · 工作台                                     [设置] [帮助] │
├────────────────┬────────────────────────────────────────────────────┤
│                │                                                    │
│  💬 对话列表    │              主对话区                               │
│                │                                                    │
│  [+ 新对话]    │  ┌──────────────────────────────────────────────┐  │
│                │  │ 🤖 欢迎使用感智晓界工作台                       │  │
│  ─ 今天 ─      │  │                                              │  │
│  ● 设备监控    │  │ 我可以帮你：                                   │  │
│    组件生成    │  │  📸 截图/Figma → 组件生成                     │  │
│                │  │  📄 需求文档 → 接口生成                        │  │
│  ─ 昨天 ─      │  │  🔧 对话式组件修改                             │  │
│  ● 大屏页面    │  │  📦 组件库管理 / 任务管理                      │  │
│    批量生成    │  │  🚀 一键发布到 GitLab                         │  │
│                │  │                                              │  │
│  ─ 上周 ─      │  │ 试试说："帮我生成一个设备监控面板"              │  │
│  ● 交通预测    │  └──────────────────────────────────────────────┘  │
│    卡片优化    │                                                    │
│                │  ┌──────────────────────────────────────────────┐  │
│                │  │ 👤 帮我把这个截图变成微码组件                    │  │
│                │  │    [📎 screenshot.png]                        │  │
│                │  └──────────────────────────────────────────────┘  │
│                │                                                    │
│                │  ┌──────────────────────────────────────────────┐  │
│                │  │ 🤖 收到！正在分析截图...                        │  │
│                │  │                                              │  │
│                │  │  📊 识别结果：                                 │  │
│                │  │  ├─ 类型：数据面板                              │  │
│                │  │  ├─ 建议规格：Max（含图表）                     │  │
│                │  │  └─ 建议代码类型：微码 (MC)                     │  │
│                │  │                                              │  │
│                │  │  确认参数后我将开始生成，是否继续？              │  │
│                │  │                                              │  │
│                │  │  [✅ 确认生成]  [⚙️ 调整参数]  [❌ 取消]       │  │
│                │  └──────────────────────────────────────────────┘  │
│                │                                                    │
│                ├────────────────────────────────────────────────────┤
│                │  [输入消息... 支持拖入图片/文件]          [发送 ▶]  │
│                └────────────────────────────────────────────────────┘
└────────────────┴────────────────────────────────────────────────────┘
```

### 3.2 导航定位

工作台作为**独立入口**，与现有表单模式**并存**：

- 路由路径：`/workbench`
- 顶栏入口：在 mainTabs 新增「工作台」Tab
- 与现有 `/workspace`（深度研究）的关系：工作台是深度研究的超集，深度研究作为工作台的一个"模式"保留
- 现有表单页面全部保留，高级用户仍可直接使用

---

## 四、功能分层设计

### 4.1 对话适配度分层

不是所有功能都适合对话化。按适配度分三层：

| 层级 | 能力 | 适配度 | 理由 |
|------|------|--------|------|
| **L1 原生对话** | 截图/Figma 生成、迭代修改、查询统计、新手引导 | ⭐⭐⭐⭐⭐ | 输入天然适合自然语言 |
| **L2 对话+确认** | 页面批量生成、API 对接、工作流执行、GitLab 推送 | ⭐⭐⭐⭐ | 需要参数确认步骤 |
| **L3 对话入口** | 工作流编排、Admin 管理、Token 配置 | ⭐⭐⭐ | 复杂配置仍需表单，对话可快捷跳转 |

### 4.2 与现有功能的映射

```
工作台（对话入口）
  │
  ├── 意图识别层（LLM Function Calling）
  │     ├── "生成组件" → /api/tasks/create
  │     ├── "修改组件" → Playground AI 修改器
  │     ├── "对接接口" → ApiBindingWizard 后端
  │     ├── "查任务"   → /api/tasks + 统计聚合
  │     ├── "批量生成" → /api/page/analyze + batch
  │     ├── "推送代码" → /api/tasks/:id/push-gitlab
  │     ├── "查组件库" → /api/component/list
  │     └── "执行工作流" → /api/workflow/:id/run
  │
  ├── 上下文管理
  │     ├── 当前组件上下文（最近操作的组件 ID）
  │     ├── 会话历史（多轮修改保持上下文）
  │     └── 用户偏好（默认代码类型/规格/工作流配方）
  │
  └── 富交互组件（对话内嵌卡片）
        ├── 参数确认卡片
        ├── 进度卡片（实时生成进度条）
        ├── 预览卡片（缩略图 + 全屏预览链接）
        ├── Diff 卡片（修改前后对比）
        └── 操作按钮卡片（确认/取消/调整）
```

---

## 五、意图识别技术方案

### 5.1 方案选型

| 方案 | 原理 | 优点 | 缺点 | 适用场景 |
|------|------|------|------|---------|
| **A. LLM Function Calling** | 所有功能封装为 Tool，LLM 自主选择 | 灵活、可扩展、支持复杂参数 | 依赖模型能力、1-3s 延迟 | 功能多、参数复杂 |
| **B. 规则+关键词** | 预定义意图关键词表，正则匹配 | 确定性强、零延迟 | 扩展差、维护成本高 | 功能少、表达固定 |
| **C. 分类模型** | 训练意图分类模型 | 快速（<100ms） | 需训练数据 | 高频、延迟敏感 |

**选择方案 A（LLM Function Calling）**，理由：

1. mvgo 功能多（10+ 模块），规则方案维护成本爆炸
2. 已有 LangGraph 基础设施，Function Calling 是原生能力
3. 参数复杂（截图/Figma URL/组件 ID/规格/代码类型），需 LLM 提取结构化参数
4. 用户表达多样（"改颜色" / "把背景换成蓝色" / "标题颜色不对"），规则难覆盖
5. 内部部署，模型调用成本可控

### 5.2 Tool 定义（OpenAI Function Calling 格式）

每个功能封装为一个 Tool，定义 name、description、parameters：

```javascript
// backend-node/src/workbench/tools/index.js

export const WORKBENCH_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_component_from_screenshot',
      description: '从截图生成微码或 Vue3 组件。用户上传图片并要求生成组件时调用。',
      parameters: {
        type: 'object',
        properties: {
          image_url: { type: 'string', description: '截图的 URL 或 base64' },
          code_type: { type: 'string', enum: ['mc', 'vue3'], description: '代码类型' },
          spec: { type: 'string', enum: ['lite', 'max'], description: '规格' },
          component_name: { type: 'string', description: '组件名称（可选）' }
        },
        required: ['image_url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_component_from_figma',
      description: '从 Figma 链接生成组件。用户提供 Figma URL 并要求生成时调用。',
      parameters: {
        type: 'object',
        properties: {
          figma_url: { type: 'string', description: 'Figma 设计稿 URL' },
          code_type: { type: 'string', enum: ['mc', 'vue3'] },
          spec: { type: 'string', enum: ['lite', 'max'] }
        },
        required: ['figma_url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'modify_component',
      description: '对话式修改已有组件。用户说"改颜色""调整布局"等修改指令时调用。',
      parameters: {
        type: 'object',
        properties: {
          component_id: { type: 'string', description: '组件 ID' },
          modification: { type: 'string', description: '修改指令' }
        },
        required: ['component_id', 'modification']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_task_status',
      description: '查询任务状态。用户问"我的任务怎么样了"时调用。',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: '任务 ID（可选）' },
          status_filter: { type: 'string', enum: ['all', 'running', 'success', 'failed'] }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bind_api_to_component',
      description: '给组件对接 API 接口。用户说"接上 API""对接接口"时调用。',
      parameters: {
        type: 'object',
        properties: {
          component_id: { type: 'string', description: '组件 ID' },
          api_catalog_id: { type: 'string', description: 'Apifox 目录 ID' },
          api_name: { type: 'string', description: 'API 名称关键词' }
        },
        required: ['component_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'push_to_gitlab',
      description: '推送组件代码到 GitLab。用户说"提交代码""推送到 GitLab"时调用。',
      parameters: {
        type: 'object',
        properties: {
          component_id: { type: 'string', description: '组件 ID' },
          branch: { type: 'string', description: '目标分支' }
        },
        required: ['component_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_components',
      description: '查询组件库。用户问"我有哪些组件"时调用。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词' },
          scope: { type: 'string', enum: ['my', 'public', 'all'] },
          limit: { type: 'number', description: '返回数量' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_task_statistics',
      description: '获取任务统计数据。用户问"成功率多少"时调用。',
      parameters: {
        type: 'object',
        properties: {
          time_range: { type: 'string', enum: ['today', 'week', 'month', 'all'] },
          metric: { type: 'string', enum: ['count', 'success_rate', 'duration'] }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'batch_generate_from_page',
      description: '从 Figma 页面批量生成组件。',
      parameters: {
        type: 'object',
        properties: {
          figma_page_url: { type: 'string', description: 'Figma 页面 URL' },
          execution_mode: { type: 'string', enum: ['serial', 'parallel'] },
          concurrency: { type: 'number' }
        },
        required: ['figma_page_url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_workflow',
      description: '执行工作流。用户说"用那个配方跑一下"时调用。',
      parameters: {
        type: 'object',
        properties: {
          workflow_id: { type: 'string' },
          workflow_name: { type: 'string', description: '工作流名称（模糊匹配）' },
          input_params: { type: 'object' }
        }
      }
    }
  }
];
```

### 5.3 LangGraph Agent 状态机

```javascript
// backend-node/src/workbench/agent.js

import { StateGraph, END } from '@langgraph/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { WORKBENCH_TOOLS } from './tools/index.js';
import { toolExecutors } from './tool-executors.js';

const agentState = {
  messages: [],                  // 对话历史
  current_component_id: null,    // 当前上下文组件
  user_preferences: {},          // 用户偏好
  pending_confirmation: null,    // 待确认操作
  tool_calls: [],                // 本轮工具调用
};

const workbenchAgent = new StateGraph(agentState)
  // 节点 1：调用 LLM
  .addNode('llm_call', async (state) => {
    const llm = new ChatOpenAI({ model: 'qwen-plus', temperature: 0 });
    const llmWithTools = llm.bindTools(WORKBENCH_TOOLS);
    const response = await llmWithTools.invoke(state.messages);
    return { messages: [...state.messages, response], tool_calls: response.tool_calls || [] };
  })
  // 节点 2：执行工具调用
  .addNode('tool_executor', async (state) => {
    const results = [];
    for (const toolCall of state.tool_calls) {
      const executor = toolExecutors[toolCall.name];
      const result = await executor(toolCall.args, state);
      results.push({ tool_call_id: toolCall.id, result });
    }
    return { messages: [...state.messages, { role: 'tool', content: results }], tool_calls: [] };
  })
  // 节点 3：生成回复
  .addNode('response_generator', async (state) => {
    const lastResult = state.messages[state.messages.length - 1];
    if (lastResult.requires_confirmation) {
      return {
        messages: [...state.messages, { role: 'assistant', content: '确认执行？', card: { type: 'confirmation', ...lastResult } }],
        pending_confirmation: lastResult
      };
    }
    const llm = new ChatOpenAI({ model: 'qwen-plus', temperature: 0.7 });
    const response = await llm.invoke([...state.messages, { role: 'user', content: '根据工具结果生成回复' }]);
    return { messages: [...state.messages, response] };
  })
  // 边
  .addEdge('START', 'llm_call')
  .addConditionalEdges('llm_call', (state) => {
    if (state.tool_calls.length > 0) return 'tool_executor';
    return 'response_generator';
  })
  .addEdge('tool_executor', 'response_generator')
  .addEdge('response_generator', END);

export const workbenchGraph = workbenchAgent.compile();
```

### 5.4 工具执行器（桥接现有 API）

```javascript
// backend-node/src/workbench/tool-executors.js

export const toolExecutors = {
  create_component_from_screenshot: async (args, state) => {
    const task = await taskService.createTask({
      source_type: 'screenshot',
      image_url: args.image_url,
      code_type: args.code_type || state.user_preferences.default_code_type || 'mc',
      spec: args.spec || state.user_preferences.default_spec || 'max',
      component_name: args.component_name,
      user_id: state.user_id
    });
    return {
      success: true,
      task_id: task.sessionId,
      message: `已创建任务 ${task.sessionId}`,
      card: { type: 'task_progress', task_id: task.sessionId, status: 'running' }
    };
  },

  create_component_from_figma: async (args, state) => {
    const figmaData = await figmaConnector.parseFigmaUrl(args.figma_url);
    return {
      success: true,
      requires_confirmation: true,
      action: 'create_component_from_figma',
      params: { figma_url: args.figma_url, node_name: figmaData.nodeName, code_type: args.code_type || 'mc', spec: args.spec || 'max' },
      message: `检测到 Figma 节点：${figmaData.nodeName}，确认生成？`
    };
  },

  modify_component: async (args, state) => {
    const result = await playgroundService.modifyComponent({
      component_id: args.component_id || state.current_component_id,
      modification: args.modification
    });
    return {
      success: true,
      card: { type: 'diff_preview', before: result.before_code, after: result.after_code, preview_url: `/preview/${args.component_id}` },
      message: '修改完成'
    };
  },

  query_task_status: async (args, state) => {
    let task = args.task_id
      ? await taskService.getTask(args.task_id)
      : (await taskService.listTasks({ user_id: state.user_id, limit: 1, sort: 'created_at:desc' }))[0];
    if (!task) return { success: false, message: '未找到任务' };
    return {
      success: true,
      card: { type: 'task_status', task_id: task.sessionId, status: task.status, progress: task.progress },
      message: `任务 ${task.sessionId} 状态：${task.status}`
    };
  },

  get_task_statistics: async (args, state) => {
    const stats = await taskService.getStatistics({ user_id: state.user_id, time_range: args.time_range || 'week' });
    return {
      success: true,
      card: { type: 'statistics', data: stats },
      message: `过去${args.time_range}：共 ${stats.total} 个组件，成功率 ${stats.success_rate}%`
    };
  }
};
```

### 5.5 关键设计要点

| 要点 | 说明 |
|------|------|
| Tool 描述要清晰 | LLM 根据 description 选择工具，描述模糊会导致误选 |
| 参数校验 | 工具执行器要做参数校验，LLM 可能传错参数 |
| 上下文管理 | 维护 current_component_id，用户说"改颜色"时不用每次传组件 ID |
| 确认机制 | 危险操作（删除/推送）返回确认卡片，用户点确认才执行 |
| 错误处理 | 工具执行失败返回友好错误信息，不抛异常 |
| 流式输出 | SSE 流式返回，提升体验 |

---

## 六、富交互卡片设计

### 6.1 卡片类型

| 卡片类型 | 触发场景 | 内容 | 交互 |
|---------|---------|------|------|
| **参数确认卡片** | 生成前确认 | 规格/代码类型/来源 | 确认/调整/取消 |
| **进度卡片** | 生成中 | Phase 进度条 + 当前阶段 | 暂停/取消 |
| **预览卡片** | 生成完成 | 组件缩略图 + 名称 + ID | 点击全屏预览 |
| **Diff 卡片** | 修改完成 | 修改前后代码对比 | 接受/拒绝 |
| **统计卡片** | 查询统计 | 数字+趋势图 | 展开详情 |
| **列表卡片** | 组件查询 | 组件列表（缩略图+名称） | 点击选中 |
| **操作按钮卡片** | 推送/对接 | 操作说明 + 按钮 | 一键执行 |

### 6.2 前端渲染

```vue
<!-- MessageBubble.vue 内根据 card.type 渲染不同卡片 -->
<template>
  <div class="message">
    <div class="content">{{ message.content }}</div>
    <component v-if="message.card" :is="cardComponent(message.card.type)" :data="message.card" />
  </div>
</template>
```

---

## 七、后端架构

### 7.1 新增模块

| 模块 | 路径 | 职责 |
|------|------|------|
| **对话引擎** | backend-node/src/workbench/agent.js | LangGraph Agent，管理多轮对话状态 |
| **意图路由器** | 内置于 LLM Function Calling | 识别用户意图→分发到对应 Function |
| **Tool 注册表** | backend-node/src/workbench/tools/index.js | 每个 API 封装为 Tool |
| **工具执行器** | backend-node/src/workbench/tool-executors.js | 桥接现有 API |
| **上下文管理器** | backend-node/src/workbench/context.js | 维护会话级上下文 |
| **对话存储** | MongoDB workbench_conversations 集合 | 持久化对话历史 |
| **SSE 推送** | 复用现有 SSE 基础设施 | 流式推送对话内容 |

### 7.2 API 设计

| 端点 | 方法 | 说明 |
|------|------|------|
| /api/workbench/chat | POST | 发送消息，SSE 流式返回 |
| /api/workbench/conversations | GET | 获取对话列表 |
| /api/workbench/conversations/:id | GET | 获取单个对话详情 |
| /api/workbench/conversations/:id | DELETE | 删除对话 |
| /api/workbench/context/:id | GET | 获取当前上下文（当前组件等） |

### 7.3 数据模型

```javascript
// MongoDB: workbench_conversations
{
  _id: ObjectId,
  user_id: String,
  title: String,              // 对话标题（自动生成）
  messages: [{
    role: 'user' | 'assistant' | 'tool',
    content: String,
    card: { type, data },     // 富卡片
    attachments: [{ type, url, name }],
    created_at: Date
  }],
  context: {
    current_component_id: String,
    user_preferences: { default_code_type, default_spec, default_workflow }
  },
  created_at: Date,
  updated_at: Date
}
```

### 7.4 与现有系统的关系

**核心原则：所有现有 API 零改动。** 工作台只是一个新的调用方，通过 Tool 定义桥接现有能力。

```
工作台 Agent
  │
  ├── Tool: create_component_from_screenshot
  │     └── 调用 → POST /api/tasks/create（现有 API）
  │
  ├── Tool: modify_component
  │     └── 调用 → Playground AI 修改器（现有服务）
  │
  ├── Tool: query_task_status
  │     └── 调用 → GET /api/tasks/:id（现有 API）
  │
  └── ... 其他 Tool 同理
```

---

## 八、前端实现

### 8.1 路由与布局

```javascript
// frontend/src/router/workbench-route.js
export default {
  path: '/workbench',
  name: 'Workbench',
  component: () => import('@/layouts/WorkspaceLayout.vue'),
  children: [
    { path: '', component: () => import('@/views/workbench/WorkbenchView.vue') },
    { path: ':conversationId', component: () => import('@/views/workbench/WorkbenchView.vue') }
  ]
};
```

### 8.2 核心组件

| 组件 | 路径 | 职责 |
|------|------|------|
| WorkbenchView.vue | views/workbench/ | 主页面（左栏+右栏） |
| ConversationList.vue | components/workbench/ | 左侧对话列表 |
| ChatArea.vue | components/workbench/ | 右侧主对话区 |
| MessageBubble.vue | components/workbench/ | 消息气泡（含卡片渲染） |
| ChatInput.vue | components/workbench/ | 输入框（支持拖入文件） |
| ProgressCard.vue | components/workbench/cards/ | 进度卡片 |
| PreviewCard.vue | components/workbench/cards/ | 预览卡片 |
| DiffCard.vue | components/workbench/cards/ | Diff 对比卡片 |
| ConfirmCard.vue | components/workbench/cards/ | 确认操作卡片 |
| StatsCard.vue | components/workbench/cards/ | 统计卡片 |

### 8.3 SSE 流式对接

```javascript
// frontend/src/api/workbench.js
export const workbenchApi = {
  chat(conversationId, message, attachments) {
    return new EventSource(`/api/workbench/chat`, {
      body: JSON.stringify({ conversation_id: conversationId, message, attachments })
    });
  },
  getConversations() { return request.get('/api/workbench/conversations'); },
  getConversation(id) { return request.get(`/api/workbench/conversations/${id}`); },
  deleteConversation(id) { return request.delete(`/api/workbench/conversations/${id}`); }
};
```

---

## 九、分阶段实施路线

### 9.1 路线图

| 阶段 | 范围 | 核心交付 | 预计工期 | 价值 |
|------|------|---------|---------|------|
| **P0 · MVP** | 生成+查询 | 对话式截图/Figma 生成 + 任务状态查询 + 结果预览 | 2 周 | 验证对话交互模式可行性 |
| **P1 · 闭环** | +修改+对接 | 对话式迭代修改 + API 对接 + GitLab 推送 | 2 周 | 打通"生成→修改→发布"完整链路 |
| **P2 · 智能** | +批量+工作流 | 批量生成 + 工作流执行 + 智能推荐 | 2 周 | 覆盖高级用户场景 |
| **P3 · 平台** | +编排+生态 | 用户自定义 Tool + MCP 接入 + Skills 生态 | 3 周 | 开放平台能力 |

### 9.2 P0 MVP 详细拆解

| 周次 | 任务 | 交付物 |
|------|------|--------|
| 第 1 周 | 后端 Agent + Tool 定义 + 2 个生成 Tool + SSE | 对话 API 可用 |
| 第 1 周 | 前端布局 + 对话组件 + 消息渲染 | 基础 UI 可用 |
| 第 2 周 | 查询 Tool + 富卡片（进度/预览/确认） | 完整交互链路 |
| 第 2 周 | 联调 + 冒烟测试 + 修 bug | P0 上线 |

### 9.3 验收标准（P0）

| # | 验收项 | 标准 |
|---|--------|------|
| 1 | 截图生成 | 拖入截图 → 对话确认参数 → 生成 → 预览卡片展示，全链路 < 5 分钟 |
| 2 | Figma 生成 | 贴 URL → 确认节点 → 生成 → 预览，全链路