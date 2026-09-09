import { Injectable, Logger } from '@nestjs/common';
import { buildChatUrl } from '../ai-engine/utils/chat-url.js';
import { normalizeRequestTemperature, markModelCapabilityIdentified } from '../ai-engine/utils/model-config.js';

export interface TestResult {
  success: boolean;
  error?: string;
  detail?: string;
  latency?: number;
}

interface LLMTestOptions {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature?: number;
  timeoutMs?: number;
  /**
   * 协议类型：'openai-compatible' | 'anthropic' | 'auto'
   * - openai-compatible：强制走 OpenAI /chat/completions
   * - anthropic：强制走 Anthropic /v1/messages（x-api-key + anthropic-version）
   * - auto / undefined：按 OpenAI 兼容探测（与生成链路 base-agent auto 行为对齐）
   */
  providerType?: string;
  /**
   * 🆕 可选：用户在「模型能力测试」时确认/输入的模型单次输出上限。
   * 传入后写入能力缓存，使容量门禁可基于真实上限判断（而非保守默认）。
   */
  outputTokens?: number;
}

interface VisionTestOptions extends LLMTestOptions {}

interface FigmaTestOptions {
  token: string;
  timeoutMs?: number;
}

interface ApifoxTestOptions {
  token: string;
  timeoutMs?: number;
}

@Injectable()
export class ConfigTestService {
  private readonly logger = new Logger(ConfigTestService.name);

  /**
   * 测试文本 LLM 连通性
   * 发送最轻量的 prompt（10 token 以内），验证：
   * 1. API Key 有效（非 401/403）
   * 2. 模型存在（非 404）
   * 3. 额度足够（非 429）
   * 4. 返回内容非空
   */
  async testTextLLM(opts: LLMTestOptions): Promise<TestResult> {
    const { apiKey, baseURL, model, temperature, timeoutMs = 15000, providerType } = opts;

    const start = Date.now();
    // 推理类模型（kimi-k2.6/k3/deepseek-reasoner 等）服务端硬性 temperature=1，
    // 与生成链路保持一致，避免 400 invalid temperature。
    const effectiveTemp = normalizeRequestTemperature(model, temperature);
    try {
      // 协议分支：anthropic 走 /v1/messages，其余走 OpenAI 兼容
      if (providerType === 'anthropic') {
        return await this.testAnthropicText({ apiKey, baseURL, model, effectiveTemp, timeoutMs, start });
      }

      const url = buildChatUrl(baseURL);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
          // 推理模型（deepseek-v4-flash / deepseek-reasoner 等）会把额度先花在 reasoning 上，
          // max_tokens 太小会导致 content 为空。给到足以产出正文的空间。
          max_tokens: 64,
          ...(effectiveTemp !== undefined ? { temperature: effectiveTemp } : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latency = Date.now() - start;

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          success: false,
          latency,
          error: this.classifyHTTPError(res.status, body),
          detail: `实际请求: ${url}`,
        };
      }

      const data = await res.json();
      // 推理模型可能把正文放在 reasoning_content，content 为空。
      // 连通性测试只看"模型是否真的回了内容"，任一非空即视为成功。
      const msg = data?.choices?.[0]?.message || {};
      const content = (msg.content || msg.reasoning_content || '').trim();

      if (!content) {
        return {
          success: false,
          latency,
          error: '返回内容为空',
        };
      }

      return {
        success: true,
        latency,
        detail: `响应: "${content.slice(0, 50)}"`,
      };
    } catch (err: any) {
      const latency = Date.now() - start;
      if (err.name === 'AbortError') {
        return {
          success: false,
          latency,
          error: `请求超时（>${timeoutMs}ms）`,
        };
      }
      return {
        success: false,
        latency,
        error: `网络错误: ${err.message}`,
      };
    }
  }

  /**
   * Anthropic 原生协议文本测试
   * 走 /v1/messages，Header 用 x-api-key + anthropic-version
   */
  private async testAnthropicText(opts: {
    apiKey: string;
    baseURL: string;
    model: string;
    effectiveTemp: number | undefined;
    timeoutMs: number;
    start: number;
  }): Promise<TestResult> {
    const { apiKey, baseURL, model, effectiveTemp, timeoutMs, start } = opts;
    // 拼 Anthropic 端点：baseURL 可能已含 /v1，去重后补 /messages
    const cleanBase = baseURL.replace(/\/v1\/?$/, '');
    const url = `${cleanBase}/v1/messages`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 64,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        ...(effectiveTemp !== undefined ? { temperature: effectiveTemp } : {}),
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latency = Date.now() - start;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        success: false,
        latency,
        error: this.classifyHTTPError(res.status, body),
        detail: `实际请求: ${url}（Anthropic 协议）`,
      };
    }

    const data = await res.json();
    // Anthropic 响应结构：{ content: [{ type: 'text', text: '...' }], ... }
    const content = (data?.content?.[0]?.text || '').trim();

    if (!content) {
      return {
        success: false,
        latency,
        error: '返回内容为空',
      };
    }

    return {
      success: true,
      latency,
      detail: `响应（Anthropic）: "${content.slice(0, 50)}"`,
    };
  }

  /**
   * 测试视觉 LLM 连通性
   * 发送一张小测试图（base64），验证模型是否支持图像输入
   * 注意：如果模型不支持视觉，会返回 400/bad_request 类错误
   */
  async testVisionLLM(opts: VisionTestOptions): Promise<TestResult> {
    const { apiKey, baseURL, model, temperature, timeoutMs = 30000, providerType } = opts;

    const start = Date.now();
    // 推理类模型（kimi-k2.6/k3/deepseek-reasoner 等）服务端硬性 temperature=1，
    // 与生成链路保持一致，避免 400 invalid temperature。
    const effectiveTemp = normalizeRequestTemperature(model, temperature);
    try {
      // Anthropic 协议走独立分支
      if (providerType === 'anthropic') {
        return await this.testAnthropicVision({ apiKey, baseURL, model, effectiveTemp, timeoutMs, start });
      }

      const url = buildChatUrl(baseURL);

      // 使用一张 20x20 红色 PNG 作为测试图（dashscope 等部分 API 要求宽或高 >= 10px）
      const testImageData =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAG0lEQVR4nGP4z8BANiJf56jmUc2jmkc1U0UzADHNjoAymaoJAAAAAElFTkSuQmCC';

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Describe this image in one word.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: testImageData,
                  },
                },
              ],
            },
          ],
          max_tokens: 64,
          ...(effectiveTemp !== undefined ? { temperature: effectiveTemp } : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latency = Date.now() - start;

      if (!res.ok) {
        const body = await res.text().catch(() => '');

        // 检查是否是"不支持视觉"类错误
        if (this.isVisionNotSupportedError(res.status, body)) {
          return {
            success: false,
            latency,
            error: '该模型不支持图像输入（视觉能力）',
            detail: `模型 "${model}" 是纯文本模型，无法处理截图分析。\n\n建议方案：\n1. 切换到分别模式，为视觉任务单独配置 qwen-vl-max 或 gpt-4o\n2. 统一模式下选择多模态模型（如 claude-3-opus、gpt-4-vision）\n3. 如果只需要代码生成，可以忽略此警告`,
          };
        }

        return {
          success: false,
          latency,
          error: this.classifyHTTPError(res.status, body),
          detail: `实际请求: ${url}`,
        };
      }

      const data = await res.json();
      // 🔍 视觉测试只看 content 字段，不 fallback 到 reasoning_content。
      // 纯文本模型（如 deepseek-v4-pro）收到 image_url 时不报错，而是静默忽略图片、
      // 把推理过程放在 reasoning_content 里返回。真正的视觉分析结果在 content 中。
      const vmsg = data?.choices?.[0]?.message || {};
      const content = (vmsg.content || '').trim();

      if (!content) {
        return {
          success: false,
          latency,
          error: '该模型不支持图像输入（视觉能力）',
          detail: `模型 "${model}" 未返回视觉分析结果（content 为空），可能是纯文本模型。\n\n建议方案：\n1. 切换到分别模式，为视觉任务单独配置 qwen-vl-max 或 gpt-4o\n2. 统一模式下选择多模态模型（如 claude-3-opus、gpt-4-vision）\n3. 如果只需要代码生成，可以忽略此警告`,
        };
      }

      // 🔍 启发式检测：部分纯文本模型（如 deepseek-v4-pro）收到 image_url 时不报错，
      // 而是静默忽略图片只处理文本 prompt，返回"I can't see"类通用回复。
      // 真正的视觉模型至少会描述颜色/形状等视觉元素。
      const contentLower = content.toLowerCase();
      const cantSeePatterns = [
        "i can't see",
        "i cannot see",
        "i don't have access",
        "i cannot view",
        "i can't view",
        "no image",
        "unable to see",
        "unable to view",
        "cannot process image",
        "can't process image",
        "text-only model",
        "does not support vision",
        "i am a text",
        "i'm a text",
      ];
      if (cantSeePatterns.some((p) => contentLower.includes(p))) {
        return {
          success: false,
          latency,
          error: '该模型不支持图像输入（视觉能力）',
          detail: `模型 "${model}" 是纯文本模型，无法处理截图分析（API 未报错但回复表明未看到图片）。\n\n建议方案：\n1. 切换到分别模式，为视觉任务单独配置 qwen-vl-max 或 gpt-4o\n2. 统一模式下选择多模态模型（如 claude-3-opus、gpt-4-vision）\n3. 如果只需要代码生成，可以忽略此警告`,
        };
      }

      return {
        success: true,
        latency,
        detail: `视觉响应: "${content.slice(0, 50)}"`,
      };
    } catch (err: any) {
      const latency = Date.now() - start;
      if (err.name === 'AbortError') {
        return {
          success: false,
          latency,
          error: `请求超时（>${timeoutMs}ms）`,
        };
      }
      return {
        success: false,
        latency,
        error: `网络错误: ${err.message}`,
      };
    }
  }

  /**
   * Anthropic 原生协议视觉测试
   * 走 /v1/messages，内容格式：{ type: 'image', source: { type: 'base64', media_type, data } }
   */
  private async testAnthropicVision(opts: {
    apiKey: string;
    baseURL: string;
    model: string;
    effectiveTemp: number | undefined;
    timeoutMs: number;
    start: number;
  }): Promise<TestResult> {
    const { apiKey, baseURL, model, effectiveTemp, timeoutMs, start } = opts;
    const cleanBase = baseURL.replace(/\/v1\/?$/, '');
    const url = `${cleanBase}/v1/messages`;

    // Anthropic 视觉格式：content 数组含 text + image（base64 source）
    const testImageData =
      'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAG0lEQVR4nGP4z8BANiJf56jmUc2jmkc1U0UzADHNjoAymaoJAAAAAElFTkSuQmCC';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 64,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image in one word.' },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: testImageData,
                },
              },
            ],
          },
        ],
        ...(effectiveTemp !== undefined ? { temperature: effectiveTemp } : {}),
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latency = Date.now() - start;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (this.isVisionNotSupportedError(res.status, body)) {
        return {
          success: false,
          latency,
          error: '该模型不支持图像输入（视觉能力）',
          detail: `模型 "${model}" 是纯文本模型，无法处理截图分析。\n\n建议方案：\n1. 切换到分别模式，为视觉任务单独配置 qwen-vl-max 或 gpt-4o\n2. 统一模式下选择多模态模型（如 claude-3-opus、gpt-4-vision）\n3. 如果只需要代码生成，可以忽略此警告`,
        };
      }
      return {
        success: false,
        latency,
        error: this.classifyHTTPError(res.status, body),
        detail: `实际请求: ${url}（Anthropic 协议）`,
      };
    }

    const data = await res.json();
    const content = (data?.content?.[0]?.text || '').trim();

    if (!content) {
      return {
        success: false,
        latency,
        error: '返回内容为空',
      };
    }

    return {
      success: true,
      latency,
      detail: `视觉响应（Anthropic）: "${content.slice(0, 50)}"`,
    };
  }

  /**
   * 检测模型是否具备推理（逻辑）能力
   * 发送一个需要推理的提示词，检测响应里是否有 reasoning_content 字段（推理模型的标志）。
   * deepseek-reasoner / kimi-k2.6 / GLM-Z1 等推理模型会在 content 之外输出思考过程。
   */
  async testReasoningLLM(opts: LLMTestOptions): Promise<TestResult> {
    const { apiKey, baseURL, model, temperature, timeoutMs = 15000, providerType } = opts;
    const start = Date.now();
    const effectiveTemp = normalizeRequestTemperature(model, temperature);
    try {
      // Anthropic 协议：响应结构不同（无 reasoning_content 字段，Claude 用 thinking blocks）
      // 这里暂保持 OpenAI 探测；anthropic 用户测推理会返回"未返回推理内容"
      if (providerType === 'anthropic') {
        return {
          success: false,
          latency: Date.now() - start,
          error: 'Anthropic 协议推理检测暂未实现（Claude thinking blocks 协议不同）',
        };
      }
      const url = buildChatUrl(baseURL);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'What is 25 * 4? Reply with the number only.' }],
          max_tokens: 256,
          ...(effectiveTemp !== undefined ? { temperature: effectiveTemp } : {}),
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latency = Date.now() - start;
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          success: false,
          latency,
          error: this.classifyHTTPError(res.status, body),
          detail: `实际请求: ${url}`,
        };
      }
      const data = await res.json();
      const msg = data?.choices?.[0]?.message || {};
      const reasoning = (msg.reasoning_content || msg.reasoning || '').trim();
      if (reasoning) {
        return { success: true, latency, detail: `推理内容: "${reasoning.slice(0, 50)}"` };
      }
      return { success: false, latency, error: '未返回推理内容（非推理模型）' };
    } catch (err: any) {
      const latency = Date.now() - start;
      if (err.name === 'AbortError') {
        return {
          success: false,
          latency,
          error: `请求超时（>${timeoutMs}ms）`,
        };
      }
      return {
        success: false,
        latency,
        error: `网络错误: ${err.message}`,
      };
    }
  }

  /**
   * 检测模型综合能力：文本 + 视觉 + 推理（三维）
   * 供前端「自动识别能力」使用，返回各维度 TestResult。
   */
  async testModelCapability(opts: LLMTestOptions) {
    const [text, vision, reasoning] = await Promise.all([
      this.testTextLLM(opts),
      this.testVisionLLM(opts),
      this.testReasoningLLM(opts),
    ]);
    // 🆕 识别能力：任一维度连通即视为模型可达，持久化「已识别」标记，
    // 供生成链路容量门禁使用（未识别的模型不硬报错，改为提示用户去测试）。
    // 若调用方随测试传入已知 outputTokens（用户在设置中确认的模型输出上限），一并记录，
    // 使容量判断可基于真实上限而非保守默认。
    const reachable = text.success || vision.success || reasoning.success;
    if (reachable && opts?.model) {
      const outTok = opts.outputTokens;
      const identifiedOpts: { source: string; outputTokens?: number } = { source: 'test' };
      if (typeof outTok === 'number' && Number.isFinite(outTok) && outTok > 0) {
        identifiedOpts.outputTokens = outTok;
      }
      markModelCapabilityIdentified(opts.model, identifiedOpts);
    }
    return { text, vision, reasoning };
  }

  /**
   * 测试 Figma Token
   * 调用 GET /v1/me 接口验证 token 有效性
   */
  async testFigmaToken(opts: FigmaTestOptions): Promise<TestResult> {
    const { token, timeoutMs = 10000 } = opts;

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch('https://api.figma.com/v1/me', {
        method: 'GET',
        headers: {
          'X-Figma-Token': token,
        },
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latency = Date.now() - start;

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return {
            success: false,
            latency,
            error: 'Token 无效或已过期',
          };
        }
        return {
          success: false,
          latency,
          error: `HTTP ${res.status}`,
        };
      }

      const data = await res.json();
      const handle = data?.handle || data?.email || '未知用户';

      return {
        success: true,
        latency,
        detail: `已连接：${handle}`,
      };
    } catch (err: any) {
      const latency = Date.now() - start;
      if (err.name === 'AbortError') {
        return {
          success: false,
          latency,
          error: `请求超时（>${timeoutMs}ms）`,
        };
      }
      return {
        success: false,
        latency,
        error: `网络错误: ${err.message}`,
      };
    }
  }

  /**
   * 测试 Apifox Token
   * 调用 GET /openapi/v1/projects 验证 token
   */
  async testApifoxToken(opts: ApifoxTestOptions): Promise<TestResult> {
    const { token, timeoutMs = 10000 } = opts;

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      // 用 /v1/versions 验证 token，轻量无项目依赖
      const res = await fetch('https://api.apifox.com/v1/versions', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Apifox-Api-Version': '2024-03-28',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latency = Date.now() - start;

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return {
            success: false,
            latency,
            error: 'Token 无效或已过期',
          };
        }
        return {
          success: false,
          latency,
          error: `HTTP ${res.status}`,
        };
      }

      const data = await res.json();
      // /v1/versions 返回版本数组
      const versions = Array.isArray(data) ? data : [];

      return {
        success: true,
        latency,
        detail: `已连接，API 可用（${versions.length} 个版本）`,
      };
    } catch (err: any) {
      const latency = Date.now() - start;
      if (err.name === 'AbortError') {
        return {
          success: false,
          latency,
          error: `请求超时（>${timeoutMs}ms）`,
        };
      }
      return {
        success: false,
        latency,
        error: `网络错误: ${err.message}`,
      };
    }
  }

  /**
   * 测试 GitLab Token
   * 调用公司 GitLab /api/v4/user 验证 token
   */
  async testGitlabToken(opts: { token: string; timeoutMs?: number }): Promise<TestResult> {
    const { token, timeoutMs = 10000 } = opts;

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const apiBase = 'https://scm.microvideo.cn/gitlab/api/v4';
      const res = await fetch(`${apiBase}/user`, {
        method: 'GET',
        headers: { 'PRIVATE-TOKEN': token },
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latency = Date.now() - start;

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return { success: false, latency, error: 'Token 无效或已过期' };
        }
        return { success: false, latency, error: `HTTP ${res.status}` };
      }

      const user = await res.json();
      return {
        success: true,
        latency,
        detail: `已连接，用户：${user.username || user.name || '未知'}`,
      };
    } catch (err: any) {
      const latency = Date.now() - start;
      if (err.name === 'AbortError') {
        return { success: false, latency, error: `请求超时（>${timeoutMs}ms）` };
      }
      return { success: false, latency, error: `网络错误: ${err.message}` };
    }
  }

  /**
   * 分类 HTTP 错误
   */
  private classifyHTTPError(status: number, body: string): string {
    const bodyLower = body.toLowerCase();

    switch (status) {
      case 401:
        return 'API Key 无效';
      case 403:
        return '无权访问（检查 API Key 或账户权限）';
      case 429:
        return '请求过于频繁或额度已用完';
      case 404:
        // 区分「模型不存在」与「接口不存在」：
        // - DashScope 等对无效模型返回 InvalidParameter + "model not found"（含 model/invalidparameter）
        // - 网关/代理对无效路径返回通用 Not Found（仅含 not found）
        if (
          bodyLower.includes('model') ||
          bodyLower.includes('模型') ||
          bodyLower.includes('invalidparameter') ||
          bodyLower.includes('does not exist') ||
          bodyLower.includes('no such')
        ) {
          return '模型不存在（检查模型名）';
        }
        // 附上真实响应体摘要，帮助用户判断是路径还是供应商问题
        return body
          ? `接口不存在（检查 Base URL）：${body.slice(0, 100)}`
          : '接口不存在（检查 Base URL）';
      case 500:
      case 502:
      case 503:
      case 504:
        return '服务端错误（稍后重试）';
      default:
        return `HTTP ${status}: ${body.slice(0, 100)}`;
    }
  }

  /**
   * 检测"不支持视觉"类错误
   */
  private isVisionNotSupportedError(status: number, body: string): boolean {
    const bodyLower = body.toLowerCase();
    return (
      // 明确的"不支持视觉"类错误
      bodyLower.includes('does not support') ||
      bodyLower.includes('multimodal') ||
      // 排除尺寸相关错误（这类错误说明模型支持视觉，只是图片规格不对）
      (bodyLower.includes('vision') && !bodyLower.includes('height') && !bodyLower.includes('width')) ||
      (bodyLower.includes('unsupported') && bodyLower.includes('image') && !bodyLower.includes('larger')) ||
      // 兜底：400 + 明确提到"不支持图像"
      (status === 400 && bodyLower.includes('not support') && bodyLower.includes('image')) ||
      // 🆕 DeepSeek 等 Rust 后端在「模型不支持视觉 / 模型名不可识别」时返回反序列化错误
      // 典型文案：Failed to deserialize the JSON body into the target type: messages[0]: unknown
      (status === 400 && (bodyLower.includes('deserialize') || bodyLower.includes('messages[0]') || bodyLower.includes('unknown')))
    );
  }
}
