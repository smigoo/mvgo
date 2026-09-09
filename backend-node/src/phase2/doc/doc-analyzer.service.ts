import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage } from '@langchain/core/messages';
import { attachUnifiedInvoke, executeModelRequest } from '../../ai-engine/utils/ai-request-gateway.js';
import { coerceLLMText } from '../../ai-engine/utils/model-config.js';
import { buildChatUrl } from '../../ai-engine/utils/chat-url.js'
import { isOpenAICompatibleBaseURL } from '../../ai-engine/utils/provider-utils.js';

// CJS 模块（doc/ 目录，与 NestJS 编译产物兼容）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const docAnalyzer = require('./doc-analyzer.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const docAnalysisStore = require('./doc-analysis-store.js');

export interface AnalyzeDocDto {
  document: string;
  source?: 'upload' | 'paste' | 'file';
  aiConfig?: {
    textApiKey?: string;
    textBaseURL?: string;
    textModel?: string;
  };
}

export interface AnalyzeDocResult {
  success: boolean;
  analysis: any;
  fromCache: boolean;
  llmUsed: string[];
  degraded: boolean;
}

@Injectable()
export class DocAnalyzerService {
  private readonly logger = new Logger(DocAnalyzerService.name);
  private readonly cache = new Map<string, { at: number; analysis: any }>();
  private readonly CACHE_TTL = 30 * 60 * 1000;

  /**
   * POST /phase2/analyze-doc 主逻辑
   * D0→D1 确定性必跑；D2 有 aiConfig 才跑（无配置降级不阻塞）
   */
  async analyzeDocument(dto: AnalyzeDocDto): Promise<AnalyzeDocResult> {
    if (!dto.document || dto.document.trim().length < 20) {
      throw new BadRequestException('文档内容过短（至少 20 字符）');
    }

    // docHash 内存缓存（二次调用 <1s）
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(dto.document).digest('hex');
    const hit = this.cache.get(hash);
    if (hit && Date.now() - hit.at < this.CACHE_TTL) {
      this.logger.log(`[DocAnalyzer] docHash 缓存命中: ${hash.slice(0, 12)}...`);
      return { success: true, analysis: hit.analysis, fromCache: true, llmUsed: hit.analysis.extractionMeta?.llmUsed || [], degraded: false };
    }

    // 组装 invokeLLM（无配置则 undefined → D2 降级）
    const invokeLLM = this.buildInvokeLLM(dto.aiConfig);
    const degraded = !invokeLLM;
    if (degraded) {
      this.logger.warn('[DocAnalyzer] 无 AI 配置，D2（interactions/funcDesc）降级跳过');
    }

    const analysis = await docAnalyzer.analyze(dto.document, {
      invokeLLM,
      source: dto.source || 'paste',
    });

    // schema 校验（产物不合规直接报错，防下游消费脏数据）
    const v = docAnalysisStore.validate(analysis);
    if (!v.valid) {
      this.logger.error(`[DocAnalyzer] schema 校验失败: ${v.errors.join('; ')}`);
      throw new BadRequestException(`文档分析产物校验失败: ${v.errors.slice(0, 3).join('; ')}`);
    }

    this.cache.set(hash, { at: Date.now(), analysis });
    this.logger.log(
      `[DocAnalyzer] 分析完成: ${analysis.extractionMeta?.deterministicFields || 0} 字段确定性, ` +
        `LLM维度: ${analysis.extractionMeta?.llmUsed?.join('+') || '无'}${degraded ? '（降级）' : ''}`,
    );

    return { success: true, analysis, fromCache: false, llmUsed: analysis.extractionMeta?.llmUsed || [], degraded };
  }

  /**
   * 组装 LLM 调用器（沿用 doc-analyzer.service.ts 同款双协议：OpenAI 兼容 / Anthropic）
   * 配置优先级：DTO aiConfig > 环境变量
   */
  private buildInvokeLLM(aiConfig?: AnalyzeDocDto['aiConfig']) {
    const apiKey =
      aiConfig?.textApiKey ||
      process.env.MC_GEN_TEXT_API_KEY ||
      process.env.TEXT_API_KEY ||
      process.env.ANTHROPIC_API_KEY;
    const baseURL =
      aiConfig?.textBaseURL ||
      process.env.MC_GEN_TEXT_ENDPOINT ||
      process.env.TEXT_BASE_URL ||
      process.env.ANTHROPIC_BASE_URL;
    const model =
      aiConfig?.textModel ||
      process.env.MC_GEN_TEXT_MODEL ||
      process.env.TEXT_MODEL ||
      process.env.ANTHROPIC_MODEL;

    if (!apiKey || !baseURL) return undefined;

    const isOpenAICompatible = isOpenAICompatibleBaseURL(baseURL);

    return async (prompt: string): Promise<string> => {
      if (isOpenAICompatible) {
        const url = buildChatUrl(baseURL);
        const response = await executeModelRequest({
          context: 'phase2-doc-analyzer',
          provider: 'openai-compatible',
          model,
          operation: ({ signal, requestPolicy }) =>
            axios.post(
              url,
              { model, messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 2048 },
              {
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: requestPolicy.requestTimeoutMs,
                signal,
              },
            ),
        });
        return response.data.choices[0].message.content;
      }
      const llm = attachUnifiedInvoke(
        new ChatAnthropic({
          modelName: model,
          anthropicApiKey: apiKey,
          anthropicApiUrl: baseURL || undefined,
          temperature: 0.2,
          maxTokens: 2048,
        }),
        {
          context: 'phase2-doc-analyzer',
          provider: 'anthropic',
          model,
        },
      );
      const response = await llm.invoke([new HumanMessage({ content: prompt })], {
        __mvgoRequestOptions: {
          context: 'phase2-doc-analyzer',
          model,
        },
      });
      return coerceLLMText(response.content);
    };
  }
}
