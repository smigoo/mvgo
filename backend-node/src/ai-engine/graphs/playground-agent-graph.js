/**
 * Playground Agent — 对话式组件代码修改助手
 *
 * v2.0 改造（2026-07-29）：
 *   - 对话式单轮交互（非自主长循环），maxIterations=5 足够 read→write→respond
 *   - 模型配置从硬编码 → resolveTextConfig() 多级回退
 *   - 支持 OpenAI 兼容 API（DashScope/DeepSeek）+ Anthropic 原生 API
 *   - 新增 list_files 工具
 *   - write_file 自动触发修改快照（在 playground-tools.js 中实现）
 *   - system prompt 调整为对话式（用户掌控节奏，非自主循环）
 */

import { StateGraph, END, Annotation } from '@langchain/langgraph'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import {
  readComponentFile,
  writeComponentFile,
  listComponentFiles,
  restoreBackup,
} from '../tools/playground-tools.js'
import { resolveTextConfig } from '../utils/ai-defaults.js'
import { normalizeRequestTemperature } from '../utils/model-config.js'
import { createLogger } from '../logger/index.js'
import { attachUnifiedInvoke } from '../utils/ai-request-gateway.js'
import { isOpenAICompatibleBaseURL } from '../utils/provider-utils.js'

const logger = createLogger('playground-agent')

/**
 * 为 LangChain ChatOpenAI 提取 baseURL 前缀（不含 /chat/completions）
 * LangChain 会自动拼接 /chat/completions，所以传入含完整路径的 baseURL 会导致 404
 */
function extractBaseURLPrefix(url) {
  let trimmed = String(url || '').trim().replace(/\/+$/, '')
  const idx = trimmed.toLowerCase().indexOf('/chat/completions')
  if (idx !== -1) {
    return trimmed.slice(0, idx).replace(/\/+$/, '')
  }
  return trimmed
}

const MAX_ITERATIONS = 12

function inferRequiresWrite(message) {
  return /(?:修改|改成|调整|优化|修复|新增|添加|删除|拆分|创建|生成|替换|移动|重构|实现|完善|保存|写入|update|modify|fix|add|remove|delete|split|create|generate|replace|refactor|implement)/i.test(
    message || '',
  )
}

/**
 * 端点不接受显式 temperature 的模型（2026-09-10 实锤）
 *
 * 现象：部分 Claude 中继端点返回 400「temperature is not supported for xxx
 * when set to non-default values」—— 只能不传该字段（用服务端默认）。
 * 命中一次即写入本集合，同进程后续请求直接跳过，避免每次都先撞一次 400。
 */
const TEMPERATURE_LOCKED_MODELS = new Set()

/** 错误信息是否表示「该模型不接受显式 temperature」 */
function isTemperatureUnsupportedError(error) {
  const msg = String(error?.message || error || '')
  return /temperature is not supported/i.test(msg)
}

/**
 * 创建 LLM 实例（支持 OpenAI 兼容 + Anthropic）
 * @param {object} [overrides] - 可选配置覆盖
 *   { apiKey?, baseURL?, model?, noTemperature?: boolean }
 *   优先级：前端传入 → 环境变量 → 已保存配置 → 硬编码默认
 */
function createLLM(overrides = {}) {
  const config = resolveTextConfig({
    textApiKey: overrides.apiKey || undefined,
    textBaseURL: overrides.baseURL || undefined,
    textModel: overrides.model || undefined,
  })
  const { apiKey, baseURL, model } = config

  if (!apiKey) {
    throw new Error(
      'API Key 未配置，请设置环境变量 MC_GEN_TEXT_API_KEY / TEXT_API_KEY / ANTHROPIC_API_KEY，或在「AI 设置」中配置文本模型',
    )
  }

  const isOpenAICompatible = isOpenAICompatibleBaseURL(baseURL)

  // temperature 策略：
  //   1) 端点/模型已确认不接受 → 不传（用服务端默认）
  //   2) 配置里显式给了温度 → 用它（与生成管线一致）
  //   3) 都没给 → 不传（交给 SDK/服务端默认），避免硬编码 0.2 触发 400
  const locked =
    overrides.noTemperature === true ||
    TEMPERATURE_LOCKED_MODELS.has(String(model || '').toLowerCase())
  const requested =
    config.temperature !== undefined && config.temperature !== null && config.temperature !== ''
      ? Number(config.temperature)
      : undefined
  const normalized = normalizeRequestTemperature(model, requested)
  const temperature =
    locked || normalized === undefined || Number.isNaN(normalized) ? undefined : normalized

  if (isOpenAICompatible) {
    // LangChain ChatOpenAI 会自动拼接 /chat/completions，需要去掉 baseURL 中已有的路径后缀
    const langChainBaseURL = extractBaseURLPrefix(baseURL)
    logger.info('使用 OpenAI 兼容 API', { model, baseURL, langChainBaseURL, temperature })
    return attachUnifiedInvoke(
      new ChatOpenAI({
        modelName: model,
        ...(temperature !== undefined ? { temperature } : {}),
        apiKey,
        configuration: { baseURL: langChainBaseURL },
      }),
      {
        context: 'playground-agent',
        provider: 'openai-compatible',
        model,
      },
    )
  }

  logger.info('使用 Anthropic API', { model, baseURL: baseURL || '(默认)', temperature })
  return attachUnifiedInvoke(
    new ChatAnthropic({
      modelName: model,
      ...(temperature !== undefined ? { temperature } : {}),
      anthropicApiKey: apiKey,
      anthropicApiUrl: baseURL || undefined,
      streaming: true,
    }),
    {
      context: 'playground-agent',
      provider: 'anthropic',
      model,
    },
  )
}

/**
 * 将工具函数包装为 LangChain 工具
 */
function createTools(componentId) {
  const readFileTool = new DynamicStructuredTool({
    name: 'read_file',
    description: '读取组件文件的内容。用于分析代码、查看现有实现。',
    schema: z.object({
      filePath: z
        .string()
        .describe('文件路径，相对于组件根目录，例如：package/index.vue 或 declare.json'),
    }),
    func: async ({ filePath }) => {
      const result = await readComponentFile({ componentId, filePath })
      return JSON.stringify(result, null, 2)
    },
  })

  const writeFileTool = new DynamicStructuredTool({
    name: 'write_file',
    description:
      '修改并保存文件内容。写入前会自动创建版本快照（用户可通过「后退」撤销）。用于修改代码、优化实现。',
    schema: z.object({
      filePath: z.string().describe('文件路径'),
      content: z.string().describe('新的文件内容（完整内容，不是片段）'),
    }),
    func: async ({ filePath, content }) => {
      const result = await writeComponentFile({ componentId, filePath, content, createBackup: true })
      return JSON.stringify(result, null, 2)
    },
  })

  const listFilesTool = new DynamicStructuredTool({
    name: 'list_files',
    description: '列出组件目录下的所有文件。用于了解组件结构、查找要修改的文件。',
    schema: z.object({}),
    func: async () => {
      const result = await listComponentFiles({ componentId })
      return JSON.stringify(result, null, 2)
    },
  })

  const restoreTool = new DynamicStructuredTool({
    name: 'restore_backup',
    description: '恢复文件的备份版本。用于撤回单个文件的修改。',
    schema: z.object({
      filePath: z.string().describe('文件路径'),
      backupTimestamp: z
        .string()
        .optional()
        .describe('备份时间戳，不指定则恢复最新备份'),
    }),
    func: async ({ filePath, backupTimestamp }) => {
      const result = await restoreBackup({ componentId, filePath, backupTimestamp })
      return JSON.stringify(result, null, 2)
    },
  })

  return [readFileTool, writeFileTool, listFilesTool, restoreTool]
}

/**
 * 智能体状态定义
 */
const AgentState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  componentId: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  selectedFiles: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  attachments: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  iterations: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  modifiedFiles: Annotation({
    reducer: (x, y) => Array.from(new Set([...(x || []), ...(y || [])])),
    default: () => [],
  }),
  toolErrors: Annotation({
    reducer: (x, y) => [...(x || []), ...(y || [])],
    default: () => [],
  }),
})

/**
 * 创建 Playground Agent（对话式）
 * @param {string} componentId
 * @param {object} options - 可选回调（M2 阶段用于 SSE 推送）
 */
export function createPlaygroundAgent(componentId, options = {}) {
  const { onToolCall, onToolResult, llmConfig } = options

  const tools = createTools(componentId)

  // 模型实例持有在闭包里：命中「端点不接受 temperature」时可原地重建（去掉温度）重试，
  // 并把该模型记入 TEMPERATURE_LOCKED_MODELS，后续请求不再重复撞 400。
  let currentModelName = ''
  const buildBoundModel = (opts = {}) => {
    const llm = createLLM({ ...llmConfig, ...opts })
    currentModelName = String(llm.modelName || llm.model || '')
    return llm.bindTools(tools)
  }
  let boundModel = buildBoundModel()

  const invokeModel = async (messages) => {
    const reqOpts = {
      __mvgoRequestOptions: {
        context: 'playground-agent',
        model: currentModelName || 'unknown',
      },
    }
    try {
      return await boundModel.invoke(messages, reqOpts)
    } catch (err) {
      if (!isTemperatureUnsupportedError(err)) throw err
      TEMPERATURE_LOCKED_MODELS.add(currentModelName.toLowerCase())
      logger.warn('端点不接受显式 temperature，已去掉该字段重试', {
        model: currentModelName,
        error: err.message,
      })
      boundModel = buildBoundModel({ noTemperature: true })
      return await boundModel.invoke(messages, reqOpts)
    }
  }

  const workflow = new StateGraph(AgentState)

  // 节点：LLM 推理
  workflow.addNode('agent', async (state) => {
    const newIterations = state.iterations + 1
    logger.info('Agent 推理', { iteration: newIterations, componentId })

    const systemPrompt = `你是一个专业的 Vue 3 组件代码修改助手，正在与用户对话式交互。

**工作模式：**
- 用户会描述想要的修改，你需要理解需求并执行
- 修改代码的标准流程：read_file 读取 → 分析 → write_file 写入完整内容 → 告诉用户改了什么
- 如果用户给的上下文不够，可以先用 list_files 查看组件结构，再 read_file 读取相关文件
- 每次修改只做用户要求的事，不要自行扩展修改范围

**用户已选择的文件：**
${state.selectedFiles.length > 0 ? state.selectedFiles.map((f) => `- ${f.name || f.path} (路径: ${f.path})`).join('\n') : '（用户未选择文件，请用 list_files 和 read_file 自行查看）'}

**用户本轮附件：**
${state.attachments.length > 0 ? state.attachments.map((f) => `- ${f.name || '截图'} (${f.type || 'image'}, ${f.size || 0} bytes)`).join('\n') : '（无附件）'}

如果用户消息中包含“## 截图视觉分析”，说明后端视觉模型已经分析了截图。你必须结合视觉摘要、用户文字和代码文件判断问题；不要凭视觉摘要臆造截图中没有的信息。不确定时先读取相关文件确认，再决定是否修改。

**重要规则：**
1. 当用户要求修改代码时，你**必须**实际调用 write_file 工具来执行，而不是只显示代码片段
2. write_file 需要传入文件的**完整内容**，不是 diff 或片段
3. 修改完成后，简要告诉用户改了什么（1-3 句话），不要重复显示完整代码
4. 如果用户的问题不需要改代码（只是提问），直接回答即可
5. 如果修改来源于截图视觉分析，回复中要说明解决了截图里的哪个可见问题
6. 工具调用数量应与任务规模匹配；创建多个子组件时，每个新文件都必须实际调用 write_file，并在全部写入成功后再总结。

7. **运行时 import 白名单（强制，违反即预览 404）**：预览运行时基于 vue3-sfc-loader，仅内置以下 4 个 npm 包，import 其余 npm 包会触发 404 使预览整页崩溃：
   - vue（内置）
   - echarts
   - microvideo-request
   - ant-design-vue
   你必须遵守：
   - **禁止** import 任何不在此表的 npm 包，尤其是 '@ant-design/icons-vue'、'@ant-design/icons'、'lodash'、'dayjs'、'axios' 等（这些在运行时不存在，必然 404）。
   - 需要图标时 **不要** 引入 '@ant-design/icons-vue'。组件运行时已通过 app.use(ant-design-vue) 全局注册了全部图标，模板里直接写 <search-outlined />、<user-outlined /> 等（kebab 或 PascalCase 均可，无需 import）即可。
   - 若需在 <script setup> 中引用图标，从主包导入：import { SearchOutlined } from 'ant-design-vue'（主包已 re-export 全部图标），绝不可写 '@ant-design/icons-vue'。
   - 若业务确实依赖白名单之外的第三方库，先判断能否用上述已注入包替代；不能确定时，明确告知用户该库预览运行时不可用并请其确认，不要擅自 import 导致预览失败。

**可用工具：**
- list_files(): 列出组件所有文件
- read_file(filePath): 读取文件内容
- write_file(filePath, content): 保存文件（自动创建版本快照，用户可撤销）
- restore_backup(filePath, backupTimestamp?): 恢复备份

记住：你是助手，用户掌控节奏。做用户要求的，做完就回复。`

    const messages = [new SystemMessage(systemPrompt), ...state.messages]

    const response = await invokeModel(messages)

    return {
      messages: [response],
      iterations: newIterations,
    }
  })

  // 节点：执行工具调用
  workflow.addNode('tools', async (state) => {
    const lastMessage = state.messages[state.messages.length - 1]
    const toolCalls = lastMessage.tool_calls || []

    if (toolCalls.length === 0) {
      return state
    }

    logger.info('执行工具调用', { toolCount: toolCalls.length })

    if (onToolCall) {
      for (const tc of toolCalls) {
        try {
          onToolCall(tc)
        } catch {}
      }
    }

    const toolMessages = []
    const modifiedFiles = []
    const toolErrors = []
    for (const toolCall of toolCalls) {
      const tool = tools.find((t) => t.name === toolCall.name)
      if (tool) {
        try {
          const result = await tool.func(toolCall.args)
          const resultContent =
            typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          toolMessages.push(new ToolMessage({
            content: resultContent,
            tool_call_id: toolCall.id,
            name: toolCall.name,
          }))

          let parsedResult = result
          if (typeof result === 'string') {
            try {
              parsedResult = JSON.parse(result)
            } catch {}
          }
          if (toolCall.name === 'write_file') {
            if (parsedResult?.success) {
              modifiedFiles.push(parsedResult.filePath || toolCall.args?.filePath)
            } else {
              toolErrors.push(parsedResult?.error || `文件写入失败: ${toolCall.args?.filePath || '未知文件'}`)
            }
          }

          if (onToolResult) {
            try {
              onToolResult({ name: toolCall.name, args: toolCall.args, result })
            } catch {}
          }
        } catch (error) {
          logger.error('工具执行失败', { tool: toolCall.name, error: error.message })
          toolErrors.push(`${toolCall.name}: ${error.message}`)
          toolMessages.push(new ToolMessage({
            content: `错误: ${error.message}`,
            tool_call_id: toolCall.id,
            name: toolCall.name,
          }))
        }
      }
    }

    return {
      messages: toolMessages,
      modifiedFiles,
      toolErrors,
    }
  })

  workflow.setEntryPoint('agent')

  // 条件边：检查��否需要工具调用，超过硬上限强制终止
  workflow.addConditionalEdges('agent', (state) => {
    const lastMessage = state.messages[state.messages.length - 1]
    const hasToolCalls = lastMessage.tool_calls && lastMessage.tool_calls.length > 0
    // 超过硬上限时强制终止，但允许最后一轮工具调用正常执行
    if (state.iterations > MAX_ITERATIONS) {
      logger.info('超过最大迭代次数，强制终止', { iterations: state.iterations })
      return END
    }
    return hasToolCalls ? 'tools' : END
  })

  workflow.addEdge('tools', 'agent')

  return workflow.compile()
}

/**
 * 运行 Playground Agent（对话式）
 * @param {object} params
 * @param {string} params.message - 用户消息
 * @param {string} params.componentId - 组件 ID
 * @param {Array} params.selectedFiles - 用户选择的文件列表 [{ path, name, content }]
 * @param {Array} params.attachments - 本轮附件 [{ name, type, size, dataUrl }]
 * @param {Array} params.history - 对话历史 [{ role, content }]
 * @param {object} params.callbacks - 可选回调 { onToolCall, onToolResult }
 * @param {object} [params.llmConfig] - 可选模型配置覆盖 { apiKey?, baseURL?, model? }（来自前端全局配置）
 * @returns {Promise<{ content: string, success: boolean, iterations: number }>}
 */
export async function runPlaygroundAgent({
  message,
  componentId,
  selectedFiles = [],
  attachments = [],
  history = [],
  callbacks = {},
  llmConfig = {},
  requiresWrite,
}) {
  try {
    logger.info('启动 Playground Agent', { componentId, filesCount: selectedFiles.length, attachmentsCount: attachments.length, hasLlmConfig: !!llmConfig?.apiKey })

    const agent = createPlaygroundAgent(componentId, { ...callbacks, llmConfig })

    // 将历史对话转换为 LangChain 消息格式
    const historyMessages = history.map((msg) => {
      if (msg.role === 'user') {
        return new HumanMessage(msg.content)
      } else if (msg.role === 'assistant') {
        return new AIMessage(msg.content)
      }
      return null
    }).filter(Boolean)

    const initialState = {
      messages: [...historyMessages, new HumanMessage(message)],
      componentId,
      selectedFiles,
      attachments,
      iterations: 0,
      modifiedFiles: [],
      toolErrors: [],
    }

    const result = await agent.invoke(initialState)

    // 提取最终响应
    const lastMessage = result.messages[result.messages.length - 1]

    let content = '处理完成'
    if (typeof lastMessage.content === 'string') {
      content = lastMessage.content
    } else if (Array.isArray(lastMessage.content)) {
      content = lastMessage.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
    } else if (lastMessage.content && typeof lastMessage.content === 'object') {
      content = lastMessage.content.text || JSON.stringify(lastMessage.content)
    }

    const modifiedFiles = result.modifiedFiles || []
    const toolErrors = result.toolErrors || []
    const writeRequired = requiresWrite ?? inferRequiresWrite(message)
    const lastToolCalls = Array.isArray(lastMessage.tool_calls) ? lastMessage.tool_calls : []
    const iterationLimitReached = result.iterations > MAX_ITERATIONS && lastToolCalls.length > 0
    const writeCompleted = modifiedFiles.length > 0 && toolErrors.length === 0
    const success = !iterationLimitReached && (!writeRequired || writeCompleted)

    if (!success) {
      if (iterationLimitReached) {
        toolErrors.push(`达到最大迭代次数 ${MAX_ITERATIONS}，仍有工具调用未执行`)
      } else if (writeRequired && modifiedFiles.length === 0) {
        toolErrors.push('本轮未成功执行 write_file，代码没有实际修改')
      }
      const failureSummary = toolErrors.length > 0
        ? `\n\n文件修改未完整完成：${Array.from(new Set(toolErrors)).join('；')}`
        : '\n\n文件修改未完整完成。'
      content = `${content}${failureSummary}`
    }

    logger.info('Playground Agent 完成', {
      iterations: result.iterations,
      success,
      writeRequired,
      modifiedFiles,
      toolErrors,
    })

    return {
      content,
      success,
      iterations: result.iterations,
      modifiedFiles,
      toolErrors: Array.from(new Set(toolErrors)),
    }
  } catch (error) {
    logger.error('Playground Agent 执行失败', { error: error.message, stack: error.stack })
    return {
      content: `抱歉，处理您的请求时出错：${error.message}`,
      success: false,
      iterations: 0,
      modifiedFiles: [],
      toolErrors: [error.message],
    }
  }
}
