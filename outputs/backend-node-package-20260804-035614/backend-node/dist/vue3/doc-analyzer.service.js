"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var DocAnalyzerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocAnalyzerService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const anthropic_1 = require("@langchain/anthropic");
const messages_1 = require("@langchain/core/messages");
const apifox_service_1 = require("../apifox/apifox.service");
const slot_analyzer_service_1 = require("./slot-analyzer.service");
const ai_request_gateway_js_1 = require("../ai-engine/utils/ai-request-gateway.js");
const model_config_js_1 = require("../ai-engine/utils/model-config.js");
let DocAnalyzerService = DocAnalyzerService_1 = class DocAnalyzerService {
    apifoxService;
    slotAnalyzer;
    logger = new common_1.Logger(DocAnalyzerService_1.name);
    constructor(apifoxService, slotAnalyzer) {
        this.apifoxService = apifoxService;
        this.slotAnalyzer = slotAnalyzer;
    }
    async analyzeFromDoc(dto) {
        const sfcContent = this.slotAnalyzer.readSFC(dto.componentId, dto.groupId);
        const catalog = this.apifoxService.getCatalog(dto.catalogId);
        if (!catalog) {
            throw new common_1.NotFoundException(`API 目录不存在: ${dto.catalogId}`);
        }
        const { slots } = await this.slotAnalyzer.analyzeSlots(dto.componentId, dto.groupId);
        const catalogBrief = this.buildCatalogBrief(catalog);
        const prompt = this.buildPrompt(sfcContent, dto.requirementsDoc, catalogBrief, slots);
        this.logger.log(`[DocAnalyzer] 调用 LLM 分析，组件 ${dto.componentId}`);
        const llmResponse = await this.callLLM(prompt, dto.aiConfig);
        const bindings = this.parseLLMResponse(llmResponse);
        const matched = bindings.filter((b) => b.moduleName && b.functionName).length;
        const summary = `共分析 ${bindings.length} 个数据需求，${matched} 个匹配成功，${bindings.length - matched} 个无匹配（已建议模拟数据）`;
        this.logger.log(`[DocAnalyzer] 分析完成: ${summary}`);
        return { success: true, bindings, summary };
    }
    buildCatalogBrief(catalog) {
        const lines = [];
        for (const mod of catalog.modules) {
            lines.push(`\n### 模块: ${mod.moduleName} (${mod.service})`);
            for (const fn of mod.functions) {
                const params = fn.params.length
                    ? fn.params.map((p) => `${p.name}(${p.in}${p.required ? ',必填' : ''})`).join(', ')
                    : '无';
                lines.push(`- ${fn.method} ${fn.path} → ${fn.name}() | 参数: ${params} | 返回: ${fn.responsePreview} | 说明: ${fn.summary}`);
            }
        }
        return lines.join('\n');
    }
    buildPrompt(sfc, doc, catalog, slots) {
        const slotsBrief = slots.length
            ? slots.map((s) => `- ${s.refName} [${s.slotType}] 行${s.sourceLine}: ${s.sourceContext}`).join('\n')
            : '（未检测到明显数据槽）';
        return `你是一个前端接口对接分析师。

## 组件源码（Vue3 SFC）
\`\`\`vue
${sfc}
\`\`\`

## 需求文档
${doc}

## 已检测到的数据槽（模式A自动分析结果，供参考）
${slotsBrief}

## 可用 API 目录
${catalog}

## 任务
1. 分析需求文档，提取组件需要的数据需求
2. 将每个数据需求对应到 SFC 中的一个变量/ref
3. 从 API 目录中为每个数据需求匹配最合适的接口函数
4. 如果某个数据需求在 API 目录中找不到匹配接口，标记 moduleName=null, functionName=null, confidence="none"

返回 JSON 数组（不要包含 markdown 代码围栏，直接返回纯 JSON）：
[
  {
    "refName": "tableData",
    "slotType": "table",
    "description": "告警记录列表",
    "moduleName": "alarm",
    "functionName": "getAlarmList",
    "confidence": "high",
    "reason": "需求要求展示告警记录列表，alarm 模块的 getAlarmList 返回告警数组"
  }
]

## 置信度说明
- high: 需求文档描述与 API summary 高度匹配
- medium: 部分匹配（函数名相关但不确定）
- low: 勉强匹配，可能有更好选择
- none: API 目录中无匹配接口

请直接返回 JSON 数组，不要有任何额外文字。`;
    }
    async callLLM(prompt, aiConfig) {
        const apiKey = (aiConfig?.textApiKey ||
            process.env.MC_GEN_TEXT_API_KEY ||
            process.env.TEXT_API_KEY ||
            process.env.ANTHROPIC_API_KEY ||
            '').trim();
        const baseURL = (aiConfig?.textBaseURL ||
            process.env.MC_GEN_TEXT_ENDPOINT ||
            process.env.TEXT_BASE_URL ||
            process.env.ANTHROPIC_BASE_URL ||
            '').trim();
        const model = (aiConfig?.textModel ||
            process.env.MC_GEN_TEXT_MODEL ||
            process.env.TEXT_MODEL ||
            process.env.ANTHROPIC_MODEL ||
            'claude-opus-4-8').trim();
        if (!apiKey || !baseURL) {
            throw new common_1.BadRequestException('AI 配置缺失：请在前端设置面板配置文本 API Key 和 Base URL，或在请求中传入 aiConfig');
        }
        const isOpenAICompatible = baseURL.includes('dashscope') ||
            baseURL.includes('openai') ||
            baseURL.includes('deepseek') ||
            baseURL.includes('/v1');
        if (isOpenAICompatible) {
            this.logger.debug(`[DocAnalyzer] 使用 OpenAI 兼容端点: ${baseURL}, model: ${model}`);
            const url = baseURL.endsWith('/chat/completions')
                ? baseURL
                : `${baseURL.replace(/\/$/, '')}/chat/completions`;
            let response;
            try {
                response = await (0, ai_request_gateway_js_1.executeModelRequest)({
                    context: 'vue3-doc-analyzer',
                    provider: 'openai-compatible',
                    model,
                    operation: ({ signal, requestPolicy }) => axios_1.default.post(url, {
                        model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.3,
                        max_tokens: 4096,
                    }, {
                        headers: {
                            Authorization: `Bearer ${apiKey}`,
                            'Content-Type': 'application/json',
                        },
                        timeout: requestPolicy.requestTimeoutMs,
                        signal,
                    }),
                });
            }
            catch (err) {
                const status = err?.response?.status;
                const body = err?.response?.data;
                const bodyStr = typeof body === 'string' ? body : body ? JSON.stringify(body).slice(0, 400) : err.message;
                this.logger.error(`[DocAnalyzer] LLM 调用失败 (HTTP ${status}): ${bodyStr}`);
                if (status === 401) {
                    throw new common_1.BadRequestException('AI 调用返回 401：API Key 无效或缺少权限。请检查当前 Base URL 对应的 Key 是否正确。');
                }
                if (status === 404) {
                    throw new common_1.BadRequestException(`AI 调用返回 404：模型 "${model}" 在 ${baseURL} 上不存在或端点路径错误。请确认 Model 名称与该 Base URL 对应的服务商匹配（如 DashScope 用 qwen-plus/qwen-max；若 qwen3.7-plus 在别的服务商可用，请把 Base URL 改成那个服务商的地址）。`);
                }
                if (status === 429) {
                    throw new common_1.BadRequestException('AI 调用返回 429：API Key 额度已用尽，请更换 Key 或稍后重试。');
                }
                throw new common_1.BadRequestException(`AI 调用失败 (HTTP ${status || '网络错误'})：${bodyStr || err.message}`);
            }
            return response.data.choices[0].message.content;
        }
        else {
            this.logger.debug(`[DocAnalyzer] 使用 Anthropic 端点: ${baseURL}, model: ${model}`);
            const llm = (0, ai_request_gateway_js_1.attachUnifiedInvoke)(new anthropic_1.ChatAnthropic({
                modelName: model,
                anthropicApiKey: apiKey,
                anthropicApiUrl: baseURL || undefined,
                temperature: 0.3,
                maxTokens: 4096,
                streaming: true,
            }), {
                context: 'vue3-doc-analyzer',
                provider: 'anthropic',
                model,
            });
            const response = await llm.invoke([new messages_1.HumanMessage({ content: prompt })], {
                __mvgoRequestOptions: {
                    context: 'vue3-doc-analyzer',
                    model,
                },
            });
            return (0, model_config_js_1.coerceLLMText)(response.content);
        }
    }
    parseLLMResponse(raw) {
        let cleaned = raw.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            cleaned = arrayMatch[0];
        }
        try {
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed)) {
                return parsed;
            }
            this.logger.warn(`[DocAnalyzer] LLM 返回非数组: ${typeof parsed}`);
            return [];
        }
        catch (err) {
            this.logger.error(`[DocAnalyzer] JSON 解析失败: ${err.message}`);
            this.logger.debug(`[DocAnalyzer] 原始返回: ${raw.substring(0, 500)}`);
            return [];
        }
    }
};
exports.DocAnalyzerService = DocAnalyzerService;
exports.DocAnalyzerService = DocAnalyzerService = DocAnalyzerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [apifox_service_1.ApifoxService,
        slot_analyzer_service_1.SlotAnalyzerService])
], DocAnalyzerService);
//# sourceMappingURL=doc-analyzer.service.js.map