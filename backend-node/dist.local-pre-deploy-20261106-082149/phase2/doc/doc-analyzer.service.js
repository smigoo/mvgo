"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
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
const ai_request_gateway_js_1 = require("../../ai-engine/utils/ai-request-gateway.js");
const model_config_js_1 = require("../../ai-engine/utils/model-config.js");
const chat_url_js_1 = require("../../ai-engine/utils/chat-url.js");
const provider_utils_js_1 = require("../../ai-engine/utils/provider-utils.js");
const docAnalyzer = require('./doc-analyzer.js');
const docAnalysisStore = require('./doc-analysis-store.js');
let DocAnalyzerService = DocAnalyzerService_1 = class DocAnalyzerService {
    logger = new common_1.Logger(DocAnalyzerService_1.name);
    cache = new Map();
    CACHE_TTL = 30 * 60 * 1000;
    async analyzeDocument(dto) {
        if (!dto.document || dto.document.trim().length < 20) {
            throw new common_1.BadRequestException('文档内容过短（至少 20 字符）');
        }
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(dto.document).digest('hex');
        const hit = this.cache.get(hash);
        if (hit && Date.now() - hit.at < this.CACHE_TTL) {
            this.logger.log(`[DocAnalyzer] docHash 缓存命中: ${hash.slice(0, 12)}...`);
            return { success: true, analysis: hit.analysis, fromCache: true, llmUsed: hit.analysis.extractionMeta?.llmUsed || [], degraded: false };
        }
        const invokeLLM = this.buildInvokeLLM(dto.aiConfig);
        const degraded = !invokeLLM;
        if (degraded) {
            this.logger.warn('[DocAnalyzer] 无 AI 配置，D2（interactions/funcDesc）降级跳过');
        }
        const analysis = await docAnalyzer.analyze(dto.document, {
            invokeLLM,
            source: dto.source || 'paste',
        });
        const v = docAnalysisStore.validate(analysis);
        if (!v.valid) {
            this.logger.error(`[DocAnalyzer] schema 校验失败: ${v.errors.join('; ')}`);
            throw new common_1.BadRequestException(`文档分析产物校验失败: ${v.errors.slice(0, 3).join('; ')}`);
        }
        this.cache.set(hash, { at: Date.now(), analysis });
        this.logger.log(`[DocAnalyzer] 分析完成: ${analysis.extractionMeta?.deterministicFields || 0} 字段确定性, ` +
            `LLM维度: ${analysis.extractionMeta?.llmUsed?.join('+') || '无'}${degraded ? '（降级）' : ''}`);
        return { success: true, analysis, fromCache: false, llmUsed: analysis.extractionMeta?.llmUsed || [], degraded };
    }
    buildInvokeLLM(aiConfig) {
        const apiKey = aiConfig?.textApiKey || '';
        const baseURL = aiConfig?.textBaseURL || '';
        const model = aiConfig?.textModel || '';
        if (!apiKey || !baseURL)
            return undefined;
        const isOpenAICompatible = (0, provider_utils_js_1.isOpenAICompatibleBaseURL)(baseURL);
        return async (prompt) => {
            if (isOpenAICompatible) {
                const url = (0, chat_url_js_1.buildChatUrl)(baseURL);
                const response = await (0, ai_request_gateway_js_1.executeModelRequest)({
                    context: 'phase2-doc-analyzer',
                    provider: 'openai-compatible',
                    model,
                    operation: ({ signal, requestPolicy }) => axios_1.default.post(url, { model, messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 2048 }, {
                        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                        timeout: requestPolicy.requestTimeoutMs,
                        signal,
                    }),
                });
                return response.data.choices[0].message.content;
            }
            const llm = (0, ai_request_gateway_js_1.attachUnifiedInvoke)(new anthropic_1.ChatAnthropic({
                modelName: model,
                anthropicApiKey: apiKey,
                anthropicApiUrl: baseURL || undefined,
                temperature: 0.2,
                maxTokens: 2048,
            }), {
                context: 'phase2-doc-analyzer',
                provider: 'anthropic',
                model,
            });
            const response = await llm.invoke([new messages_1.HumanMessage({ content: prompt })], {
                __mvgoRequestOptions: {
                    context: 'phase2-doc-analyzer',
                    model,
                },
            });
            return (0, model_config_js_1.coerceLLMText)(response.content);
        };
    }
};
exports.DocAnalyzerService = DocAnalyzerService;
exports.DocAnalyzerService = DocAnalyzerService = DocAnalyzerService_1 = __decorate([
    (0, common_1.Injectable)()
], DocAnalyzerService);
//# sourceMappingURL=doc-analyzer.service.js.map