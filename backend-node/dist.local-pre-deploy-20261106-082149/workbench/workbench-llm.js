"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWorkbenchLLM = runWorkbenchLLM;
const anthropic_1 = require("@langchain/anthropic");
const openai_1 = require("@langchain/openai");
const messages_1 = require("@langchain/core/messages");
const ai_defaults_js_1 = require("../ai-engine/utils/ai-defaults.js");
const model_config_js_1 = require("../ai-engine/utils/model-config.js");
const ai_request_gateway_js_1 = require("../ai-engine/utils/ai-request-gateway.js");
const provider_utils_js_1 = require("../ai-engine/utils/provider-utils.js");
const workbench_tools_1 = require("./workbench-tools");
const logger = {
    info: (msg, meta) => console.log(`[workbench-llm] ${msg}`, meta || ''),
    warn: (msg, meta) => console.warn(`[workbench-llm] ${msg}`, meta || ''),
    error: (msg, meta) => console.error(`[workbench-llm] ${msg}`, meta || ''),
};
const MAX_LLM_ITERATIONS = 5;
function toLangChainMessages(messages) {
    const out = [];
    for (const m of messages || []) {
        if (m.role === 'user') {
            out.push(new messages_1.HumanMessage(m.content));
        }
        else if (m.role === 'assistant') {
            const text = typeof m.content === 'string' ? m.content : '';
            if (text.trim())
                out.push(new messages_1.AIMessage(text));
        }
    }
    return out;
}
function extractText(response) {
    if (!response)
        return '';
    const c = response.content;
    if (typeof c === 'string')
        return c;
    if (Array.isArray(c)) {
        return c
            .filter((b) => !b || b.type === 'text')
            .map((b) => (typeof b === 'string' ? b : b?.text || ''))
            .join('');
    }
    if (c && typeof c === 'object' && 'text' in c)
        return c.text;
    return '';
}
function extractCurrentComponentId(r) {
    const d = r.data;
    if (!d)
        return undefined;
    if (typeof d.sessionId === 'string' && d.sessionId)
        return d.sessionId;
    if (Array.isArray(d.sessionIds) && d.sessionIds.length > 0)
        return d.sessionIds[0];
    return undefined;
}
function buildBoundModel(llmConfig = {}) {
    const config = (0, ai_defaults_js_1.resolveTextConfig)({
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
    });
    const { apiKey, baseURL, model } = config;
    if (!apiKey) {
        throw new Error('文本模型未配置 API Key');
    }
    const isOpenAICompatible = (0, provider_utils_js_1.isOpenAICompatibleBaseURL)(baseURL);
    const temperature = (0, model_config_js_1.normalizeRequestTemperature)(model, config.temperature);
    const thinkingType = config.thinkingType || '';
    const offParams = thinkingType && thinkingType !== 'skip' ? (0, model_config_js_1.buildThinkingOffParams)(model, baseURL) : null;
    if (isOpenAICompatible) {
        let langChainBaseURL = String(baseURL || '').trim().replace(/\/+$/, '');
        const ccIdx = langChainBaseURL.toLowerCase().indexOf('/chat/completions');
        if (ccIdx !== -1)
            langChainBaseURL = langChainBaseURL.slice(0, ccIdx).replace(/\/+$/, '');
        const llm = new openai_1.ChatOpenAI({
            modelName: model,
            ...(temperature !== undefined && !Number.isNaN(temperature) ? { temperature } : {}),
            apiKey,
            ...(offParams && Object.keys(offParams).length ? { modelKwargs: offParams } : {}),
            configuration: { baseURL: langChainBaseURL },
        });
        return {
            bound: (0, ai_request_gateway_js_1.attachUnifiedInvoke)(llm, {
                context: 'workbench-agent',
                provider: 'openai-compatible',
                model,
            }).bind({ tools: workbench_tools_1.WORKBENCH_TOOLS, tool_choice: 'auto' }),
            modelName: String(model || ''),
        };
    }
    const llm = new anthropic_1.ChatAnthropic({
        modelName: model,
        ...(temperature !== undefined && !Number.isNaN(temperature) ? { temperature } : {}),
        anthropicApiKey: apiKey,
        anthropicApiUrl: baseURL || undefined,
        streaming: true,
    });
    return {
        bound: (0, ai_request_gateway_js_1.attachUnifiedInvoke)(llm, {
            context: 'workbench-agent',
            provider: 'anthropic',
            model,
        }).bind({ tools: workbench_tools_1.WORKBENCH_TOOLS, tool_choice: 'auto' }),
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
async function runWorkbenchLLM(params) {
    const { messages, currentComponentId, toolContext, llmConfig } = params;
    const { bound, modelName } = buildBoundModel(llmConfig || {});
    logger.info(`工作台 Agent 走真 LLM Function Calling（模型: ${modelName}）`);
    const sysText = SYSTEM_PROMPT.replace('{currentComponentId || \'无\'}', currentComponentId || '无');
    let convo = [new messages_1.SystemMessage(sysText), ...toLangChainMessages(messages)];
    let latestComponentId = currentComponentId;
    const cards = [];
    for (let i = 0; i < MAX_LLM_ITERATIONS; i++) {
        const response = await bound.invoke(convo, {
            __mvgoRequestOptions: { context: 'workbench-agent', model: modelName },
        });
        const toolCalls = response?.tool_calls || [];
        if (toolCalls.length === 0) {
            const text = extractText(response);
            if (!text.trim())
                throw new Error('LLM 返回空内容');
            return { response: text, cards, currentComponentId: latestComponentId };
        }
        const toolMessages = [];
        for (const tc of toolCalls) {
            logger.info(`LLM 发起工具调用: ${tc.name}`, tc.args || {});
            let result;
            try {
                result = await (0, workbench_tools_1.executeTool)(tc.name, tc.args || {}, toolContext);
            }
            catch (err) {
                result = { success: false, error: err?.message || '工具执行异常' };
            }
            if (result.card)
                cards.push(result.card);
            const cid = extractCurrentComponentId(result);
            if (cid)
                latestComponentId = cid;
            toolMessages.push(new messages_1.ToolMessage({
                content: JSON.stringify(result),
                tool_call_id: tc.id,
                name: tc.name,
            }));
        }
        convo = [...convo, response, ...toolMessages];
    }
    throw new Error('LLM 工具循环达到上限');
}
//# sourceMappingURL=workbench-llm.js.map