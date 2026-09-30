/**
 * 工作台 Agent 真 LLM Function Calling 层（P0 ②）
 *
 * 复用 Playground Agent（ai-engine/graphs/playground-agent-graph.js）已验证的
 * 「resolveTextConfig + ChatOpenAI/ChatAnthropic + bindTools + tool_calls 循环」模式，
 * 把工作台的 WORKBENCH_TOOLS（OpenAI Function 格式）直接喂给模型做意图识别与工具调度。
 *
 * 设计约束（渐进式、可回退）：
 *   1. 本层只负责「意图识别 + 工具调度 + 最终文本」；工具执行仍走 workbench-tools.executeTool。
 *   2. 调用方（workbench-agent.runWorkbenchAgent）在「用户已配置文本模型」时才启用本层，
 *      LLM 未配置 / 调用失败 / 返回空 → 回退到既有正则 callLLM，保证零回归。
 *   3. currentComponentId 回写口径与 workbench-agent.extractCurrentComponentId 保持一致。
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, AIMessage, ToolMessage, HumanMessage } from '@langchain/core/messages';
import { resolveTextConfig } from '../ai-engine/utils/ai-defaults.js';
import { normalizeRequestTemperature, buildThinkingOffParams } from '../ai-engine/utils/model-config.js';
import { attachUnifiedInvoke } from '../ai-engine/utils/ai-request-gateway.js';
import { isOpenAICompatibleBaseURL } from '../ai-engine/utils/provider-utils.js';
import { WORKBENCH_TOOLS, executeTool, ToolContext, ToolResult } from './workbench-tools';

const logger = {
  info: (msg: string, meta?: any) => console.log(`[workbench-llm] ${msg}`, meta || ''),
  warn: (msg: string, meta?: any) => console.warn(`[workbench-llm] ${msg}`, meta || ''),
  error: (msg: string, meta?: any) => console.error(`[workbench-llm] ${msg}`, meta || ''),
};

const MAX_LLM_ITERATIONS = 5;

/** 用户消息（AgentMessage） → LangChain 消息（不含 system）。 */
function toLangChainMessages(messages: Array<{ role: string; content: string; toolCalls?: any[]; toolCallId?: string }>) {
  const out: any[] = [];
  for (const m of messages || []) {
    if (m.role === 'user') {
      out.push(new HumanMessage(m.content));
    } else if (m.role === 'assistant') {
      // 历史 assistant 消息（含 toolCalls）在此简化处理：只保留文本，避免历史 tool_calls
      // 与当前 Function Calling 循环的 tool_call_id 对不上导致 LangChain 报错。
      const text = typeof m.content === 'string' ? m.content : '';
      if (text.trim()) out.push(new AIMessage(text));
    }
    // role === 'tool' / 'system' 的历史消息不重放（每轮由本层重新生成）。
  }
  return out;
}

/** 从 AIMessage 抽取最终文本（兼容 string / content 块数组）。 */
function extractText(response: any): string {
  if (!response) return '';
  const c = response.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .filter((b: any) => !b || b.type === 'text')
      .map((b: any) => (typeof b === 'string' ? b : b?.text || ''))
      .join('');
  }
  if (c && typeof c === 'object' && 'text' in c) return c.text;
  return '';
}

/** 工具结果里提取「当前组件 id」用于回写（与 workbench-agent.extractCurrentComponentId 同口径）。 */
function extractCurrentComponentId(r: ToolResult): string | undefined {
  const d: any = r.data;
  if (!d) return undefined;
  if (typeof d.sessionId === 'string' && d.sessionId) return d.sessionId;
  if (Array.isArray(d.sessionIds) && d.sessionIds.length > 0) return d.sessionIds[0];
  return undefined;
}

/** 构建 bind 了工作台工具的 LLM（仅支持 OpenAI 兼容 / Anthropic，复用 Playground 判定）。 */
function buildBoundModel(llmConfig: Record<string, any> = {}) {
  const config = resolveTextConfig({
    textApiKey: llmConfig.textApiKey || llmConfig.apiKey || undefined,
    textBaseURL: llmConfig.textBaseURL || llmConfig.baseURL || undefined,
    textModel: llmConfig.textModel || llmConfig.model || undefined,
    modelMode: llmConfig.modelMode,
    temperature: llmConfig.temperature,
    thinkingType: llmConfig.thinkingType,
    providers: llmConfig.providers,
    pickStrategy: llmConfig.pickStrategy,
    unifiedApiKey: llmConfig.unifiedApiKey,
    unifiedBaseURL: llmConfig.unifiedBaseURL,
    unifiedModel: llmConfig.unifiedModel,
    textProviderType: llmConfig.textProviderType,
  } as any);

  const { apiKey, baseURL, model } = config as any;
  if (!apiKey) {
    throw new Error('文本模型未配置 API Key');
  }

  const isOpenAICompatible = isOpenAICompatibleBaseURL(baseURL);
  const temperature = normalizeRequestTemperature(model, config.temperature);

  const thinkingType = config.thinkingType || '';
  const offParams =
    thinkingType && thinkingType !== 'skip' ? buildThinkingOffParams(model, baseURL) : null;

  if (isOpenAICompatible) {
    // 截断到 /chat/completions 之前（LangChain ChatOpenAI 会自动拼接）
    let langChainBaseURL = String(baseURL || '').trim().replace(/\/+$/, '');
    const ccIdx = langChainBaseURL.toLowerCase().indexOf('/chat/completions');
    if (ccIdx !== -1) langChainBaseURL = langChainBaseURL.slice(0, ccIdx).replace(/\/+$/, '');

    const llm = new ChatOpenAI({
      modelName: model,
      ...(temperature !== undefined && !Number.isNaN(temperature) ? { temperature } : {}),
      apiKey,
      ...(offParams && Object.keys(offParams).length ? { modelKwargs: offParams } : {}),
      configuration: { baseURL: langChainBaseURL },
    });
    return {
      bound: attachUnifiedInvoke(llm, {
        context: 'workbench-agent',
        provider: 'openai-compatible',
        model,
      }).bind({ tools: WORKBENCH_TOOLS, tool_choice: 'auto' }),
      modelName: String(model || ''),
    };
  }

  const llm = new ChatAnthropic({
    modelName: model,
    ...(temperature !== undefined && !Number.isNaN(temperature) ? { temperature } : {}),
    anthropicApiKey: apiKey,
    anthropicApiUrl: baseURL || undefined,
    streaming: true,
  });
  return {
    bound: attachUnifiedInvoke(llm, {
      context: 'workbench-agent',
      provider: 'anthropic',
      model,
    }).bind({ tools: WORKBENCH_TOOLS, tool_choice: 'auto' }),
    modelName: String(model || ''),
  };
}

const SYSTEM_PROMPT = `你是感智晓界（mvgo）的工作台助手。用户通过自然语言对话完成组件生成、修改、管理、发布等操作。

## 你的能力（通过工具调用完成）
- 从截图或 Figma 链接生成微码/Vue3 组件
- 修改已有组件、绑定 API 数据源、推送到 GitLab、发布到公共组件池
- 查询任务状态、生成统计、列出组件
- 组件体检、查看版本历史、一键回滚
- 批量生成组件、执行预定义工作流

## 当前上下文
- 当前组件：{currentComponentId || '无'}（后续「修改/绑定/推送/发布/体检/回滚/版本」默认对它操作，无需用户重复指定）

## 交互原则
1. 先理解意图，再调用合适的工具；一条消息通常只调一个工具（除非明确批量）。
2. 工具参数从用户原话里提取；缺失关键参数（如生成缺素材）时，先询问而非编造。
3. 工具执行完，用 1~3 句中文简要总结结果，不要重复输出代码或大量参数。
4. 无法归类到任何工具时，直接文字回复并引导用户。
5. 生成类工具（截图/Figma/批量）是重量级操作，用户已给出素材即视为确认，直接调用即可。
6. 生成组件时，componentName 必须从用户描述提炼为**语义化英文 kebab-case**（如「隧道风机控制」→ c-tunnel-fan-control、c-tunnel-xxx）；用户未明确描述时，按「c- + 用途语义英文」生成。禁止用任务号、sessionId 或时间戳当组件名。`;

/**
 * 跑真 LLM Function Calling：意图识别 → 执行工具 → 生成总结。
 * 任一步失败或超上限抛错，交由调用方回退正则。
 */
export async function runWorkbenchLLM(params: {
  messages: Array<{ role: string; content: string }>;
  currentComponentId?: string;
  toolContext: ToolContext;
  llmConfig?: Record<string, any>;
}): Promise<{ response: string; cards: any[]; currentComponentId?: string }> {
  const { messages, currentComponentId, toolContext, llmConfig } = params;

  const { bound, modelName } = buildBoundModel(llmConfig || {});
  logger.info(`工作台 Agent 走真 LLM Function Calling（模型: ${modelName}）`);

  const sysText = SYSTEM_PROMPT.replace('{currentComponentId || \'无\'}', currentComponentId || '无');
  let convo: any[] = [new SystemMessage(sysText), ...toLangChainMessages(messages as any)];

  let latestComponentId = currentComponentId;
  const cards: any[] = [];

  for (let i = 0; i < MAX_LLM_ITERATIONS; i++) {
    const response = await bound.invoke(convo, {
      __mvgoRequestOptions: { context: 'workbench-agent', model: modelName },
    });

    const toolCalls = response?.tool_calls || [];
    if (toolCalls.length === 0) {
      // 无工具调用 → 最终回复
      const text = extractText(response);
      if (!text.trim()) throw new Error('LLM 返回空内容');
      return { response: text, cards, currentComponentId: latestComponentId };
    }

    // 执行工具
    const toolMessages: any[] = [];
    for (const tc of toolCalls) {
      logger.info(`LLM 发起工具调用: ${tc.name}`, tc.args || {});
      let result: ToolResult;
      try {
        result = await executeTool(tc.name, tc.args || {}, toolContext);
      } catch (err: any) {
        result = { success: false, error: err?.message || '工具执行异常' };
      }
      if (result.card) cards.push(result.card);

      // currentComponentId 回写（生成类工具成功后锚定，供下一轮/后续对话命中）
      const cid = extractCurrentComponentId(result);
      if (cid) latestComponentId = cid;

      toolMessages.push(
        new ToolMessage({
          content: JSON.stringify(result),
          tool_call_id: tc.id,
          name: tc.name,
        }),
      );
    }

    // 回填工具结果，进入下一轮让 LLM 生成总结
    convo = [...convo, response, ...toolMessages];
  }

  throw new Error('LLM 工具循环达到上限');
}
