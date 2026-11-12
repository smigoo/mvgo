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
const chat_url_js_1 = require("../ai-engine/utils/chat-url.js");
const provider_utils_js_1 = require("../ai-engine/utils/provider-utils.js");
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
        const correctedBindings = this.correctRefNames(bindings, slots);
        const matched = correctedBindings.filter((b) => b.moduleName && b.functionName).length;
        const summary = `共分析 ${correctedBindings.length} 个数据需求，${matched} 个匹配成功，${correctedBindings.length - matched} 个无匹配（已建议模拟数据）`;
        this.logger.log(`[DocAnalyzer] 分析完成: ${summary}`);
        return { success: true, bindings: correctedBindings, summary };
    }
    correctRefNames(bindings, slots) {
        if (!bindings.length || !slots.length)
            return bindings;
        const validNames = new Set();
        const chartSeriesNames = [];
        const tableListNames = [];
        for (const s of slots) {
            const top = String(s.refName || '');
            if (top)
                validNames.add(top);
            for (const c of s.children || []) {
                const child = String(c.refName || '');
                if (!child)
                    continue;
                validNames.add(child);
                const role = String(c.role || '');
                const type = String(s.slotType || '');
                if (role.includes('chart.series') || child.toLowerCase().includes('series')) {
                    chartSeriesNames.push(child);
                }
                if (type === 'table' || type === 'list' || role.includes('table') || role.includes('list')) {
                    tableListNames.push(child);
                }
            }
            if (String(s.slotType || '') === 'chart') {
                const topName = top.toLowerCase();
                if (topName.includes('option') || topName.includes('ref'))
                    chartSeriesNames.push(top);
            }
        }
        const corrected = [];
        const seenRefs = new Set();
        for (const b of bindings) {
            const raw = String(b.refName || '').trim();
            const slotType = String(b.slotType || 'stat').toLowerCase();
            if (!raw)
                continue;
            if (validNames.has(raw)) {
                if (!seenRefs.has(raw)) {
                    seenRefs.add(raw);
                    corrected.push(b);
                }
                continue;
            }
            const normalized = raw.toLowerCase();
            let resolved = null;
            if (slotType === 'chart' || /chart|option|series/.test(normalized)) {
                resolved =
                    chartSeriesNames.find((n) => /series|data/.test(n.toLowerCase())) ||
                        chartSeriesNames[0] ||
                        null;
            }
            if (!resolved && (slotType === 'table' || slotType === 'list' || /table|list|record|row/.test(normalized))) {
                resolved = tableListNames[0] || null;
            }
            if (resolved && !seenRefs.has(resolved)) {
                seenRefs.add(resolved);
                this.logger.warn(`[DocAnalyzer] refName 校正: "${raw}" (${slotType}) → "${resolved}"（组件真实数据槽）`);
                corrected.push({ ...b, refName: resolved });
            }
            else {
                this.logger.warn(`[DocAnalyzer] refName 丢弃: "${raw}" (${slotType})——组件无对应数据槽，绑定将无效`);
            }
        }
        return corrected;
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
        const validSlotNames = new Set();
        for (const s of slots) {
            validSlotNames.add(String(s.refName || ''));
            for (const c of s.children || [])
                validSlotNames.add(String(c.refName || ''));
        }
        const slotNamesBrief = [...validSlotNames].filter(Boolean).join(', ');
        const slotsBrief = slots.length
            ? slots.map((s) => `- ${s.refName} [${s.slotType}] 行${s.sourceLine}: ${s.sourceContext}${s.children?.length ? ` | 数据源: ${s.children.map((c) => c.refName).join(', ')}` : ''}`).join('\n')
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

## 🛡️ refName 硬性约束（必须遵守）
- "refName" 字段**只能**从上面「已检测到的数据槽」中精确选取（顶层 refName 或其"数据源"子项），
  例如数据源列表中的 seriesData.value、xAxisFullData.value 等。
- **禁止**自行编造或改写变量名（如把 seriesData 臆造成 chartData、把告警数据臆造成 tableData）。
- 若某个数据需求对应不到任何已检测槽位，说明该数据不是组件 UI 需要的数据，请直接丢弃该条，
  不要新造一个 refName。
- 唯一可用的 refName 白名单：${slotNamesBrief || '（无，此时应返回空数组）'}

返回 JSON 数组（不要包含 markdown 代码围栏，直接返回纯 JSON）：
[
  {
    "refName": "seriesData",
    "slotType": "chart",
    "description": "环境监测24小时趋势曲线数据",
    "moduleName": "device",
    "functionName": "getMonitor",
    "confidence": "high",
    "reason": "需求要求展示24小时趋势图，seriesData 是图表系列数据源，device.getMonitor 返回监测数据"
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
        const apiKey = (aiConfig?.textApiKey || '').trim();
        const baseURL = (aiConfig?.textBaseURL || '').trim();
        const model = (aiConfig?.textModel || '').trim();
        if (!apiKey || !baseURL) {
            throw new common_1.BadRequestException('AI 配置缺失：请在前端设置面板配置文本 API Key 和 Base URL，或在请求中传入 aiConfig');
        }
        const isOpenAICompatible = (0, provider_utils_js_1.isOpenAICompatibleBaseURL)(baseURL);
        if (isOpenAICompatible) {
            this.logger.debug(`[DocAnalyzer] 使用 OpenAI 兼容端点: ${baseURL}, model: ${model}`);
            const url = (0, chat_url_js_1.buildChatUrl)(baseURL);
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