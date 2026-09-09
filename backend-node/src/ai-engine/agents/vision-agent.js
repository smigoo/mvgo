/**
 * Vision Agent - 图像分析智能体
 * 支持 Anthropic Claude 和 OpenAI 兼容的 API（如通义千问）
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { readFileSync } from 'fs';
import axios from 'axios';
import sharp from 'sharp';
import { createLogger } from '../logger/index.js';
import {
  getMaxTokens,
  coerceLLMUsage,
  coerceLLMText,
  estimateTokens,
  normalizeRequestTemperature,
} from '../utils/model-config.js';
import { VISION_DEFAULTS } from '../utils/ai-defaults.js';
import {
  attachUnifiedInvoke,
  executeModelRequest,
} from '../utils/ai-request-gateway.js';
import { buildChatUrl } from '../utils/chat-url.js';
import { getProviderPool } from '../utils/provider-pool.js';
import { isOpenAICompatibleBaseURL } from '../utils/provider-utils.js';

const logger = createLogger({ name: 'vision-agent' });

// Vision 分析的输出上限。复杂组件（max 级：多 section + 大量 effects/resources）的
// preview-analysis JSON 会远超 8192 tokens，历史多次在 ~29k 字符处被 max_tokens 硬截断
// （finish_reason=length），导致 sections/charts/interactions 全空、触发 fail-closed 阻断。
// 默认提到 16000；若仍截断，analyzeImage 会用 32000 重试一次。
const VISION_DEFAULT_MAX_TOKENS = 16000;
const VISION_TRUNCATION_RETRY_MAX_TOKENS = 32000;

export class VisionAgent {
  constructor(config = {}) {
    this.model = config.model || VISION_DEFAULTS.model;
    // temperature 归一化：推理类模型（kimi-k3/kimi-thinking/deepseek-reasoner/qwq/o1/o3 等）
    // 服务端硬性 temperature=1，强制为 1；非推理模型尊重显式配置，未配置时保持原样。
    this.temperature = normalizeRequestTemperature(
      this.model,
      config.temperature,
    );
    this.maxTokens = getMaxTokens(
      this.model,
      config.maxTokens || VISION_DEFAULT_MAX_TOKENS,
    );

    // 🔒 强制用户配置：不再回退到环境变量
    if (!config.apiKey) {
      throw new Error(
        'VisionAgent: 缺少 API Key 配置，请在用户配置中设置视觉模型 API 密钥',
      );
    }
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || VISION_DEFAULTS.baseURL;
    //显式 provider 类型：openai-compatible / anthropic / auto
    this.providerType = config.providerType || 'auto';
    //供应商池：resolveVisionConfig 透传的 provider id（无则走单一配置）
    this.providerId = config.providerId || null;

    // Token 用量记录钩子（由外部注入，非阻塞）
    this.onTokenUsage = config.onTokenUsage || null;

    // 🔍 调试日志：显示实际读取到的配置
    logger.info('🔍 VisionAgent 配置', {
      model: this.model,
      baseURL: this.baseURL,
      apiKeyPrefix: this.apiKey
        ? this.apiKey.substring(0, 10) + '...'
        : 'undefined',
      hasBaseURL: !!this.baseURL,
      providerType: this.providerType,
    });

    //判断使用哪种 API：优先用显式 providerType，否则自动识别
    this.isOpenAICompatible = this._resolveProviderCompatibility();

    if (!this.isOpenAICompatible) {
      // 使用 Anthropic Claude API
      logger.info('使用 Anthropic Claude API', { model: this.model });
      const llmConfig = {
        modelName: this.model,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        anthropicApiKey: this.apiKey,
        streaming: true,
      };

      if (this.baseURL) {
        llmConfig.anthropicApiUrl = this.baseURL;
      }

      this.llm = new ChatAnthropic(llmConfig);
      attachUnifiedInvoke(this.llm, {
        context: 'vision-agent',
        provider: 'anthropic',
        model: this.model,
        providerId: config.providerId,
        maxTokens: this.maxTokens,
        // 🔀 方案 A：主 provider 熔断后自动切换备用 vision provider
        // excludeIds：排除上一次 attempt 刚失败的 provider，实现「超时 → 切换大模型」故障转移。
        refreshProvider: ({ excludeIds = [] } = {}) => {
          const p = getProviderPool().pick('vision', { excludeIds });
          if (!p || !p.apiKey) return null;
          return {
            providerId: p.id,
            apiKey: p.apiKey,
            baseURL: p.baseURL || '',
            model: p.model || '',
            providerType: p.providerType || 'auto',
          };
        },
        createLLM: (snap) => this._buildLLM(snap),
      });
    } else {
      // 注意：此分支是「OpenAI 兼容协议」，实际模型/供应商由传入配置决定（可能是 gpt-5.5 或千问等），
      // 不要在文案里硬编码「通义千问」，否则会误导排查（曾导致误判 vision 用错了模型）
      logger.info('使用 OpenAI 兼容 API', {
        baseURL: this.baseURL,
        model: this.model,
        providerId: config.providerId,
      });
      // provider 切换/模型信息推送在 callOpenAICompatibleAPI 的 operation 内按 attempt 刷新，
      // 不走 ChatOpenAI/attachUnifiedInvoke（vision 消息格式 + response_format 走 raw axios 更稳）
    }
  }

  /**
   * 方案 A：按 provider 快照构建 LLM 客户端（主 provider 熔断切换备用时重建）
   * @param {{apiKey?:string,baseURL?:string,model?:string,providerType?:string}} [snapshot]
   */
  _buildLLM(snapshot = {}) {
    const apiKey = snapshot.apiKey || this.apiKey;
    const rawBaseURL = snapshot.baseURL || this.baseURL;
    const model = snapshot.model || this.model;
    // 熔断切换 provider 后 model 可能变化，temperature 必须按最终模型重新归一化
    const temperature = normalizeRequestTemperature(model, this.temperature);
    const providerType = snapshot.providerType || this.providerType || 'auto';
    // 🐛 2026-09-02 修复「只有 qwen 可用」根因：协议判定必须基于「原始 baseURL」，
    // 与 base-agent._buildLLM 同款修复。原先先剥 /chat/completions 再判定，
    // glm/lkeap 完整 endpoint 剥尾后丢失特征被误判 anthropic → 拼 /v1/messages → 404。
    const isOpenAICompatible =
      providerType === 'openai-compatible'
        ? true
        : providerType === 'anthropic'
          ? false
          : isOpenAICompatibleBaseURL(rawBaseURL);

    let baseURL = rawBaseURL;
    if (isOpenAICompatible) {
      // 规范化（仅在确认 OpenAI 兼容后）：截断到 /chat/completions 之前
      // （与 chat-url.buildChatUrl 的截断逻辑一致）。anthropic 端点不含该后缀，保持原样。
      const ccIdx = rawBaseURL.toLowerCase().indexOf('/chat/completions');
      if (ccIdx !== -1) baseURL = rawBaseURL.slice(0, ccIdx).replace(/\/+$/, '');
    }

    if (isOpenAICompatible) {
      return new ChatOpenAI({
        modelName: model,
        temperature: temperature,
        maxTokens: this.maxTokens,
        apiKey: apiKey,
        configuration: {
          baseURL: baseURL,
        },
      });
    }
    return new ChatAnthropic({
      modelName: model,
      temperature: temperature,
      maxTokens: this.maxTokens,
      anthropicApiKey: apiKey,
      anthropicApiUrl: baseURL || undefined,
      streaming: true,
    });
  }

  /**
   *解析 provider 兼容性
   * 优先级：显式 providerType > 自动识别（基于 baseURL 特征）
   */
  _resolveProviderCompatibility() {
    // 1. 显式指定 openai-compatible → 走 OpenAI 兼容协议
    if (this.providerType === 'openai-compatible') {
      logger.info('Provider 类型：显式 openai-compatible（OpenAI 兼容协议）', {
        baseURL: this.baseURL,
      });
      return true;
    }

    // 2. 显式指定 anthropic → 走 Anthropic 原生协议
    if (this.providerType === 'anthropic') {
      logger.info('Provider 类型：显式 anthropic（Anthropic 原生协议）', {
        baseURL: this.baseURL,
      });
      return false;
    }

    // 3. auto（默认）：基于 baseURL 特征自动识别（兼容旧配置，统一走共享判断）
    const autoDetected = isOpenAICompatibleBaseURL(this.baseURL);
    logger.info('🔍 API 类型判断（auto 模式）', {
      isOpenAICompatible: autoDetected,
      baseURLCheck: this.baseURL,
    });
    return autoDetected;
  }

  /**
   * 调用 OpenAI 兼容的 API（通义千问）
   * @private
   * @returns {{ content: string, usage: object }} 返回内容和 token 用量
   */
  async callOpenAICompatibleAPI(messages, options = {}) {
    // 🔀 每次尝试（含 gateway 内部重试）前重新从供应商池 pick：
    // 主 provider 挂起/超时后，重试会自动落到备用 provider，
    // 避免「同一 provider 撞墙两次」导致整个视觉分析降级。
    let lastSnap = null;
    let currentSnap = null;
    const pickSnapshot = ({ excludeIds = [] } = {}) => {
      // 显式 providerId（如配置页连通性测试指定了单个 provider）时固定用该 provider，不走池 pick。
      // 🛡️ 但若该 provider 已被本次 excludeIds 排除（刚超时/失败），必须回退到池 pick 故障转移，
      // 否则「显式 providerId 恒命中」会让重试永远撞同一面墙（mc-max-1787717640370 实锤：
      // 第 1 次 attempt 超时后，第 2 次 attempt 仍用同一 provider，备用 vision provider 始终未被选中）。
      if (this.providerId && !excludeIds.includes(this.providerId)) {
        // 🛡️ __primary__ 撞槽修复（2026-09-04 实锤）：text 与 vision 两个槽的「第一选择」条目
        // 都叫 __primary__，而 get() 固定先查 text 槽 → vision 请求的第一选择永远命中 text 槽
        // （日志实证 model=deepseek-v4-flash __primary__），配置的 vision 模型从未被用过。
        // 语义：vision 角色找「第一选择」必须只在 vision 槽内（跟随用户对 vision 角色的配置，
        // 不硬编码任何模型）；排除刚失败的 provider（故障转移语义不变）。
        const entry =
          this.providerId === '__primary__'
            ? getProviderPool().pick('vision', { excludeIds })
            : getProviderPool().get(this.providerId);
        if (entry && entry.apiKey) {
          return {
            providerId: entry.id,
            apiKey: entry.apiKey,
            baseURL: entry.baseURL || this.baseURL || '',
            model: entry.model || this.model,
          };
        }
      }
      // 🔀 排除上一次 attempt 刚失败的 provider，实现「超时 → 切换视觉模型」故障转移
      const picked = getProviderPool().pick('vision', { excludeIds });
      if (picked && picked.apiKey) {
        return {
          providerId: picked.id,
          apiKey: picked.apiKey,
          baseURL: picked.baseURL || this.baseURL || '',
          model: picked.model || this.model,
        };
      }
      // 池为空/未初始化时回退构造配置
      return {
        providerId: this.providerId || null,
        apiKey: this.apiKey,
        baseURL: this.baseURL || '',
        model: this.model,
      };
    };

    const response = await executeModelRequest({
      context: options.context || 'vision-agent',
      provider: 'openai-compatible',
      model: this.model,
      providerId: this.providerId,
      tokenEstimate: estimateTokens(messages, this.maxTokens),
      signal: options.signal,
      onProgress: options.onProgress,
      requestConcurrency: options.requestConcurrency,
      requestQueueTimeoutMs: options.requestQueueTimeoutMs,
      requestTimeoutMs: options.requestTimeoutMs,
      requestMaxRetries: options.requestMaxRetries,
      // 🔀 熔断记账/令牌桶绑定「本次 attempt 实际 pick 的 provider」，而非构造时的 this.providerId
      resolveAttempt: ({ previousProviderId } = {}) => {
        currentSnap = pickSnapshot({
          excludeIds: previousProviderId ? [previousProviderId] : [],
        });
        return {
          providerId: currentSnap.providerId,
          model: currentSnap.model,
          provider: 'openai-compatible',
        };
      },
      operation: ({ signal, attempt }) => {
        const snap = currentSnap || pickSnapshot();
        // 模型信息推送：首次或 provider/模型切换时，写后端日志 + 推前端进度
        const switched =
          !lastSnap ||
          lastSnap.providerId !== snap.providerId ||
          lastSnap.model !== snap.model;
        if (switched) {
          logger.info(`🔀 [vision-agent] provider 已就绪`, {
            attempt: attempt || 1,
            providerId: snap.providerId,
            model: snap.model,
            baseURL: snap.baseURL,
          });
          if (typeof options.onProgress === 'function') {
            // 🆕 S1 降级阶梯提示：区分「首次就绪」vs「超时切换备用」，让用户知道系统在自动容错
            const isRetrySwitch = !!(
              lastSnap && lastSnap.providerId !== snap.providerId
            );
            options.onProgress({
              stage: 'vision-agent',
              message: isRetrySwitch
                ? `🔀 视觉模型响应超时，已自动切换备用模型: ${snap.model}`
                : `🤖 模型: ${snap.model}`,
              status: isRetrySwitch ? 'warning' : 'running',
              meta: {
                type: 'agent-model',
                agent: 'vision-agent',
                model: snap.model,
                providerId: snap.providerId,
                switched: isRetrySwitch,
              },
            });
          }
        }
        lastSnap = snap;
        // temperature 按最终模型重新归一化（熔断切换后模型可能变化）
        const temperature = normalizeRequestTemperature(
          snap.model,
          this.temperature,
        );
        // 支持调用方动态覆盖 max_tokens（截断重试用更高上限）
        const maxTokens =
          Number(options.maxTokens) > 0 ? options.maxTokens : this.maxTokens;
        return axios.post(
          buildChatUrl(snap.baseURL),
          {
            model: snap.model,
            messages,
            temperature,
            max_tokens: maxTokens,
            ...(options.responseFormat
              ? { response_format: options.responseFormat }
              : {}),
          },
          {
            headers: {
              Authorization: `Bearer ${snap.apiKey}`,
              'Content-Type': 'application/json',
            },
            signal,
          },
        );
      },
    });

    return {
      content: coerceLLMText(response.data.choices[0].message.content),
      usage: response.data.usage || {},
      finishReason:
        response.data.choices?.[0]?.finish_reason ||
        response.data.choices?.[0]?.stop_reason ||
        null,
    };
  }

  /**
   * 分析图片
   */
  async analyzeImage(imagePath, prompt, options = {}) {
    const startTime = Date.now();
    logger.info('🔍 开始分析图片', { imagePath });

    try {
      // 读取图片
      const readStart = Date.now();
      const imageBuffer = readFileSync(imagePath);
      const readDuration = Date.now() - readStart;
      const originalSize = (imageBuffer.length / 1024).toFixed(2);
      logger.info(`📖 图片读取完成 (${readDuration}ms)`, {
        size: `${originalSize}KB`,
      });

      // 🗜️ 压缩图片（优化 API 调用速度）
      const compressStart = Date.now();
      const compressedBuffer = await sharp(imageBuffer)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
      const compressDuration = Date.now() - compressStart;
      const compressedSize = (compressedBuffer.length / 1024).toFixed(2);
      const compressionRatio = (
        (1 - compressedBuffer.length / imageBuffer.length) *
        100
      ).toFixed(1);
      logger.info(`🗜️ 图片压缩完成 (${compressDuration}ms)`, {
        originalSize: `${originalSize}KB`,
        compressedSize: `${compressedSize}KB`,
        compressionRatio: `${compressionRatio}%`,
      });

      // 转换为 base64
      const encodeStart = Date.now();
      const base64Image = compressedBuffer.toString('base64');
      const encodeDuration = Date.now() - encodeStart;
      logger.info(`🔐 Base64编码完成 (${encodeDuration}ms)`, {
        base64Size: `${(base64Image.length / 1024).toFixed(2)}KB`,
      });

      // sharp 压缩后统一输出 JPEG，MIME 必须用 jpeg 而非原文件扩展名
      // 否则 kimi-k3 等严格校验的供应商会解码失败返回 400
      const imageFormat = 'jpeg';

      if (this.isOpenAICompatible) {
        // 使用 OpenAI 格式调用通义千问
        const messages = [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ];

        logger.info('🚀 开始调用 Vision API...', {
          model: this.model,
          baseURL: this.baseURL,
          requestTimeoutMs: options.requestTimeoutMs,
          requestMaxRetries: options.requestMaxRetries,
        });
        const apiStart = Date.now();

        let {
          content: result,
          usage: rawUsage,
          finishReason,
        } = await this.callOpenAICompatibleAPI(messages, {
          context: 'vision-agent.analyzeImage',
          signal: options.signal,
          onProgress: options.onProgress || this.onProgress,
          requestConcurrency: options.requestConcurrency,
          requestTimeoutMs: options.requestTimeoutMs,
          requestMaxRetries: options.requestMaxRetries,
          responseFormat: options.responseFormat,
          maxTokens: options.maxTokens,
        });

        // 🛡️ 截断检测：finish_reason=length / stop_reason=max_tokens 表示输出达到上限被硬截断。
        // 复杂组件（max 级）的视觉分析 JSON 会超出默认上限，这里用更高上限重试一次，
        // 避免截断后的半截 JSON 在 visual-parser 里被判定为退化而 fail-closed 阻断整个生成。
        // 仅在「调用方未显式指定 maxTokens」时触发，避免覆盖调用方的显式意图。
        const isTruncated =
          finishReason === 'length' || finishReason === 'max_tokens';
        if (isTruncated && !options.maxTokens) {
          logger.warn(
            '⚠️ Vision 输出被 max_tokens 截断 (finish_reason=length)，用更高上限重试',
            {
              firstMaxTokens: this.maxTokens,
              retryMaxTokens: VISION_TRUNCATION_RETRY_MAX_TOKENS,
            },
          );
          ({
            content: result,
            usage: rawUsage,
            finishReason,
          } = await this.callOpenAICompatibleAPI(messages, {
            context: 'vision-agent.analyzeImage',
            signal: options.signal,
            onProgress: options.onProgress || this.onProgress,
            requestConcurrency: options.requestConcurrency,
            requestTimeoutMs: options.requestTimeoutMs,
            requestMaxRetries: options.requestMaxRetries,
            responseFormat: options.responseFormat,
            maxTokens: VISION_TRUNCATION_RETRY_MAX_TOKENS,
          }));
        }

        const apiDuration = Date.now() - apiStart;
        const totalDuration = Date.now() - startTime;

        //修复：提取并记录 token 用量（之前 callOpenAICompatibleAPI 丢弃了 usage 数据）
        const tokenUsage = coerceLLMUsage({ usage: rawUsage });
        logger.info(
          `✅ 图片分析完成 (API: ${apiDuration}ms, 总计: ${totalDuration}ms)`,
          {
            inputTokens: tokenUsage.inputTokens,
            outputTokens: tokenUsage.outputTokens,
            totalTokens: tokenUsage.totalTokens,
          },
        );

        // 通过钩子记录 Token 用量（非阻塞）
        if (this.onTokenUsage && tokenUsage.totalTokens > 0) {
          try {
            this.onTokenUsage({
              nodeName: 'vision-agent',
              model: this.model,
              modelType: 'vision',
              inputTokens: tokenUsage.inputTokens,
              outputTokens: tokenUsage.outputTokens,
              totalTokens: tokenUsage.totalTokens,
              duration: totalDuration,
              timestamp: new Date().toISOString(),
            });
          } catch (e) {
            // 静默失败
          }
        }

        // 🛡️ 完整性自愈：模型可能「正常完成（finish_reason 非 length）但输出损坏 JSON」（中部非法字符）。
        // 既有截断检测只覆盖 max_tokens 截断，不覆盖「完成但损坏」。这里补一层：解析校验失败则
        // 临时提升 temperature + 依赖 provider 熔断重新生成一次，避免损坏 JSON 直达 visual-parser 被判降级阻断。
        if (!options._integrityRetry && !this._isAnalysisIntact(result)) {
          logger.warn(
            '⚠️ Vision 输出完成但 JSON 损坏（非截断），启动完整性自愈重试一次',
            { finishReason },
          );
          const savedTemp = this.temperature;
          this.temperature = normalizeRequestTemperature(
            this.model,
            Math.min(0.6, (this.temperature || 0.2) + 0.3),
          );
          try {
            result = await this.analyzeImage(imagePath, prompt, {
              ...options,
              _integrityRetry: true,
            });
          } finally {
            this.temperature = savedTemp;
          }
        }

        return result;
      } else {
        // 使用 Anthropic Claude API
        const message = new HumanMessage({
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/${imageFormat};base64,${base64Image}`,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        });

        const response = await this.llm.invoke([message], {
          __mvgoRequestOptions: {
            context: 'vision-agent.analyzeImage',
            signal: options.signal,
            onProgress: options.onProgress || this.onProgress,
            requestConcurrency: options.requestConcurrency,
            requestQueueTimeoutMs: options.requestQueueTimeoutMs,
            requestTimeoutMs: options.requestTimeoutMs,
            requestMaxRetries: options.requestMaxRetries,
          },
        });
        const totalDuration = Date.now() - startTime;

        // 提取并记录 token 用量
        const tokenUsage = coerceLLMUsage(response);
        logger.info('✅ 图片分析完成 (Claude)', {
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          totalTokens: tokenUsage.totalTokens,
        });

        // 通过钩子记录 Token 用量（非阻塞）
        if (this.onTokenUsage && tokenUsage.totalTokens > 0) {
          try {
            this.onTokenUsage({
              nodeName: 'vision-agent',
              model: this.model,
              modelType: 'vision',
              inputTokens: tokenUsage.inputTokens,
              outputTokens: tokenUsage.outputTokens,
              totalTokens: tokenUsage.totalTokens,
              duration: totalDuration,
              timestamp: new Date().toISOString(),
            });
          } catch (e) {
            // 静默失败
          }
        }

        // 🛡️ 完整性自愈（同 OpenAI 分支）：模型「完成但 JSON 损坏」时截断检测无法捕获，
        // 这里解析校验失败则临时提升 temperature + 重新生成一次，避免损坏 JSON 被判降级阻断。
        if (
          !options._integrityRetry &&
          !this._isAnalysisIntact(response.content)
        ) {
          logger.warn(
            '⚠️ Vision(Claude) 输出完成但 JSON 损坏，启动完整性自愈重试一次',
          );
          const savedTemp = this.temperature;
          this.temperature = normalizeRequestTemperature(
            this.model,
            Math.min(0.6, (this.temperature || 0.2) + 0.3),
          );
          try {
            response.content = await this.analyzeImage(imagePath, prompt, {
              ...options,
              _integrityRetry: true,
            });
          } finally {
            this.temperature = savedTemp;
          }
        }

        return response.content;
      }
    } catch (error) {
      logger.error('图片分析失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 🛡️ Vision 输出完整性校验：模型「正常完成（finish_reason 非 length）但 JSON 中部损坏」时，
   * 截断检测（finish_reason=length）无法捕获，损坏内容会直达 visual-parser 被判降级并 fail-closed 阻断整个生成。
   * 这里用严格 JSON.parse + 关键字段非空判定，提前识别损坏，供 analyzeImage 触发自愈重试。
   * @param {string} content 模型原始输出
   * @returns {boolean} 是否为「结构完整、非降级」的有效分析 JSON
   */
  _isAnalysisIntact(content) {
    if (!content || typeof content !== 'string') return false;
    try {
      const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(content);
      const raw = (fence ? fence[1] : content).trim();
      if (!raw) return false;
      const parsed = JSON.parse(raw); // 严格：损坏即抛错（对应 visual-parser 的「直接解析失败」路径）
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return false;
      const sections = parsed.layout?.sections || parsed.sections;
      const charts = parsed.charts || parsed.layout?.charts;
      const interactions = parsed.interactions;
      const hasStruct =
        (Array.isArray(sections) && sections.length > 0) ||
        (Array.isArray(charts) && charts.length > 0) ||
        (Array.isArray(interactions) && interactions.length > 0);
      return hasStruct;
    } catch {
      return false;
    }
  }

  /**
   * 分析预览图
   */
  async analyzePreviewImage(imagePath) {
    const prompt = `请仔细分析这张微码组件设计稿图片，并按照以下 JSON Schema 提取结构化数据。

**UI 元素识别清单（按从上到下、从左到右的顺序仔细查找）：**

1. **页面标题** - 通常位于顶部，字体较大，如"环境监测"、"数据看板"
2. **标签/选项卡按钮组** - 横向排列的多个可点击文字（可能带下划线、背景色、边框），如"二氧化碳 能见度 洞内照明"
3. **控制按钮/图标** - 右上角或边缘的小图标按钮（切换、设置、刷新等）
4. **徽章/标记** - 带数字的小圆点，通常是红色，如"6"
5. **图表** - 折线图、柱状图、饼图、仪表盘等
6. **列表/表格** - 行列式数据展示
7. **输入框/表单** - 可编辑的输入区域
8. **其他交互元素** - 开关、滑块、下拉框等

**返回格式（严格按照此 JSON Schema）：**

{
  "generatedAt": "ISO时间戳",
  "stage": "preview-analysis",
  "target": "组件目标名称（如：环境监测看板、设备卡片）",
  "type": "主要交互类型（click/hover/input/display）",
  "description": "组件功能描述",
  "defaultState": "默认状态（常驻/弹窗/浮层）",
  "evidence": "设计证据描述",
  "imageEvidence": ["视觉证据1", "视觉证据2"],

  "layout": {
    "type": "布局类型（vertical/horizontal/grid/flex）",
    "direction": "方向（top-to-bottom/left-to-right等）",
    "sections": [
      {
        "id": "section-唯一标识",
        "name": "区块名称",
        "role": "区块角色（常驻/弹窗/浮层）",
        "layout": "区块布局（vertical/horizontal）",
        "headerRelation": "header与内容的关系（content-below-title等）",
        "slotCandidate": null,
        "header": {
          "title": "标题文字（如：环境监测）",
          "controls": [
            {
              "type": "控制类型（icon-button/badge/toggle等）",
              "label": "控制标签",
              "icon": "图标描述",
              "action": "动作描述"
            }
          ]
        },
        "body": {
          "layout": "内容布局类型（single-chart/tab-content/list等）",
          "children": [
            {
              "id": "child-唯一标识",
              "name": "子元素名称",
              "role": "角色（chart/list/form/tabs等）",
              "chartRef": 0
            }
          ]
        }
      }
    ]
  },

  "styles": {
    "theme": "主题（dark/light/blue等）",
    "colors": ["主色值", "辅色值"],
    "background": "背景色值或类型",
    "decorations": ["装饰元素"],
    "emphasis": ["强调元素"],
    "backgroundBrightness": "背景亮度（dark/light）"
  },

  "interactions": [
    {
      "type": "交互类型（tab-switch/button-click/toggle/input等）",
      "target": "交互目标元素（如：二氧化碳标签）",
      "action": "触发的动作（如：切换显示内容）",
      "feedback": "反馈形式（如：高亮、内容切换）",
      "options": ["选项1", "选项2"]
    }
  ],

  "charts": [
    {
      "section": "所属section的id",
      "type": "图表类型（line/bar/pie/gauge/map等）",
      "series": ["系列1名称", "系列2名称"],
      "legend": ["图例1", "图例2"],
      "legendPosition": "图例位置（top-right/bottom等）",
      "seriesColors": ["#颜色1", "#颜色2"],
      "legendType": "图例类型（horizontal/vertical）",
      "axes": "坐标轴描述（如：X轴为时间，Y轴为数值）",
      "tooltip": "提示信息描述",
      "notes": ["特殊标记1", "特殊标记2"]
    }
  ]
}

**关键要求：**

1. **sections 必须包含完整的 header 结构**：
   - header.title 必须是实际的标题文字（如"环境监测"），不是"environment monitoring"
   - header.controls 必须包含所有可见的控制按钮（图标按钮、徽章等）

2. **interactions 必须识别所有交互元素**：
   - 标签/选项卡按钮组 → type: "tab-switch", options: ["选项1", "选项2", ...]
   - 单个按钮 → type: "button-click"
   - 开关 → type: "toggle"

3. **charts 必须详细描述**：
   - 明确 section 归属
   - 提取系列名称（legend）
   - 提取颜色值
   - 记录特殊标记（预警线、阈值线等）

4. **颜色值提取**：
   - 必须提取实际的 16 进制颜色值（如 #52c41a）
   - 不要使用"绿色"、"红色"等描述性文字

**示例（环境监测组件）：**
- 顶部标题"环境监测" → sections[0].header.title = "环境监测"
- 4个标签按钮 → interactions 中添加 type: "tab-switch", options: ["二氧化碳", "能见度", "洞内照明", "洞外光强"]
- 右上角图标 → sections[0].header.controls 中添加对应按钮
- 红色徽章"6" → sections[0].header.controls 中添加 type: "badge"

**输出要求：**
- 必须返回严格的 JSON 格式
- 不要包含注释或额外的文本
- 可以用 \`\`\`json 代码块包裹

请直接返回 JSON。`;

    const result = await this.analyzeImage(imagePath, prompt, {
      responseFormat: { type: 'json_object' },
    });

    try {
      // 尝试解析 JSON
      let jsonStr = result.trim();

      // 如果结果被包裹在代码块中，提取出来
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }

      const parsed = JSON.parse(jsonStr);

      // 确保必要字段存在，提供默认值
      return {
        generatedAt: parsed.generatedAt || new Date().toISOString(),
        stage: 'preview-analysis',
        target: parsed.target || '未知组件',
        type: parsed.type || 'display',
        description: parsed.description || '',
        defaultState: parsed.defaultState || '常驻',
        evidence: parsed.evidence || '',
        imageEvidence: parsed.imageEvidence || [],
        layout: {
          type: parsed.layout?.type || 'vertical',
          direction: parsed.layout?.direction || 'top-to-bottom',
          sections: parsed.layout?.sections || [],
        },
        styles: {
          theme: parsed.styles?.theme || '未知',
          colors: parsed.styles?.colors || [],
          background: parsed.styles?.background || '',
          decorations: parsed.styles?.decorations || [],
          emphasis: parsed.styles?.emphasis || [],
          backgroundBrightness: parsed.styles?.backgroundBrightness || 'dark',
        },
        interactions: parsed.interactions || [],
        charts: parsed.charts || [],
      };
    } catch (error) {
      logger.error('解析预览图分析结果失败', {
        error: error.message,
        result: result?.substring(0, 500),
      });
      // 返回最小结构，避免后续流程崩溃
      return {
        generatedAt: new Date().toISOString(),
        stage: 'preview-analysis',
        target: '解析失败',
        type: 'display',
        description: result?.substring(0, 500) || '分析失败',
        defaultState: '常驻',
        evidence: '解析错误',
        imageEvidence: [],
        layout: {
          type: 'vertical',
          direction: 'top-to-bottom',
          sections: [],
        },
        styles: {
          theme: '未知',
          colors: [],
          background: '',
          decorations: [],
          emphasis: [],
          backgroundBrightness: 'dark',
        },
        interactions: [],
        charts: [],
      };
    }
  }

  /**
   * 检测图片格式
   */
  detectImageFormat(imagePath) {
    const ext = imagePath.split('.').pop().toLowerCase();
    const formatMap = {
      jpg: 'jpeg',
      jpeg: 'jpeg',
      png: 'png',
      gif: 'gif',
      webp: 'webp',
    };
    return formatMap[ext] || 'jpeg';
  }

  /**
   * 比对两张图片（视觉差异分析）
   * @param {string} image1Path - 第一张图片路径（通常是 Figma 原图）
   * @param {string} image2Path - 第二张图片路径（通常是渲染截图）
   * @param {string} prompt - 比对提示词
   * @returns {Promise<string>} AI 返回的比对结果（JSON 字符串）
   */
  async compareImages(image1Path, image2Path, prompt, options = {}) {
    const startTime = Date.now();
    logger.info('开始比对图片', { image1: image1Path, image2: image2Path });

    try {
      // 压缩两张图片
      const [buf1, buf2] = await Promise.all([
        sharp(readFileSync(image1Path))
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 75 })
          .toBuffer(),
        sharp(readFileSync(image2Path))
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 75 })
          .toBuffer(),
      ]);

      const base64_1 = buf1.toString('base64');
      const base64_2 = buf2.toString('base64');
      // sharp 压缩后统一输出 JPEG，MIME 必须用 jpeg
      const format1 = 'jpeg';
      const format2 = 'jpeg';

      if (this.isOpenAICompatible) {
        // OpenAI 兼容 API（通义千问）
        const messages = [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64_1}` },
              },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64_2}` },
              },
            ],
          },
        ];
        const { content: result, usage: rawUsage } =
          await this.callOpenAICompatibleAPI(messages, {
            context: 'vision-agent.compareImages',
            signal: options.signal,
            onProgress: options.onProgress || this.onProgress,
            requestConcurrency: options.requestConcurrency,
            requestTimeoutMs: options.requestTimeoutMs,
            requestMaxRetries: options.requestMaxRetries,
          });
        const tokenUsage = coerceLLMUsage({ usage: rawUsage });
        if (this.onTokenUsage && tokenUsage.totalTokens > 0) {
          try {
            this.onTokenUsage({
              nodeName: 'visual-comparator',
              model: this.model,
              modelType: 'vision',
              inputTokens: tokenUsage.inputTokens,
              outputTokens: tokenUsage.outputTokens,
              totalTokens: tokenUsage.totalTokens,
              duration: Date.now() - startTime,
              timestamp: new Date().toISOString(),
            });
          } catch (e) {}
        }
        logger.info(`图片比对完成 (${Date.now() - startTime}ms)`, {
          totalTokens: tokenUsage.totalTokens,
        });
        return result;
      } else {
        // Anthropic Claude API
        const message = new HumanMessage({
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64_1}` },
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64_2}` },
            },
          ],
        });
        const response = await this.llm.invoke([message], {
          __mvgoRequestOptions: {
            context: 'vision-agent.compareImages',
            signal: options.signal,
            onProgress: options.onProgress || this.onProgress,
            requestConcurrency: options.requestConcurrency,
            requestQueueTimeoutMs: options.requestQueueTimeoutMs,
            requestTimeoutMs: options.requestTimeoutMs,
            requestMaxRetries: options.requestMaxRetries,
          },
        });
        const tokenUsage = coerceLLMUsage(response);
        if (this.onTokenUsage && tokenUsage.totalTokens > 0) {
          try {
            this.onTokenUsage({
              nodeName: 'visual-comparator',
              model: this.model,
              modelType: 'vision',
              inputTokens: tokenUsage.inputTokens,
              outputTokens: tokenUsage.outputTokens,
              totalTokens: tokenUsage.totalTokens,
              duration: Date.now() - startTime,
              timestamp: new Date().toISOString(),
            });
          } catch (e) {}
        }
        logger.info(`图片比对完成 (Claude, ${Date.now() - startTime}ms)`, {
          totalTokens: tokenUsage.totalTokens,
        });
        return response.content;
      }
    } catch (error) {
      logger.error('图片比对失败', { error: error.message });
      throw error;
    }
  }
}
