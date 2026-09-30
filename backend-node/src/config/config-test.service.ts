import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { buildChatUrl } from '../ai-engine/utils/chat-url.js';
import { normalizeRequestTemperature, markModelCapabilityIdentified, markThinkingDialectVerified, buildThinkingOffParams } from '../ai-engine/utils/model-config.js';

export interface TestResult {
  success: boolean;
  error?: string;
  detail?: string;
  latency?: number;
  /** 🆕 视觉检测：本次测试图中随机生成的数字（供前端展示，便于人工核对模型返回） */
  expectedDigits?: string;
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
  /**
   * 🆕 思考模式类型（2026-09-11）：用户配置的 thinkingType（low/high/max/disabled）
   * 优先使用用户配置，否则硬编码检测 GLM 模型自动注入 'low'
   */
  thinkingType?: string;
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
    const { apiKey, baseURL, model, temperature, timeoutMs = 15000, providerType, thinkingType } = opts;

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

      // 🔒 思考模式参数（2026-09-11）：优先用户配置，否则先尝试关闭思考
      // 如果模型不支持关闭思考（如 GLM 5.3-flash），自动降级到 'low'
      const buildBody = (thinkingType?: string) => ({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        // 推理模型（deepseek-v4-flash / deepseek-reasoner 等）会把额度先花在 reasoning 上，
        // max_tokens 太小会导致 content 为空。给到足以产出正文的空间。
        max_tokens: 64,
        ...(effectiveTemp !== undefined ? { temperature: effectiveTemp } : {}),
        ...(thinkingType ? { thinking: { type: thinkingType } } : {}),
      });

      // 第一次请求：优先用户配置，否则不带 thinking 参数（尝试关闭思考）
      const initialThinking = thinkingType || undefined;
      let res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildBody(initialThinking)),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latency = Date.now() - start;

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        
        // 🔒 自动降级（2026-09-11）：如果模型返回 400 且错误信息包含"不支持关闭思考"，
        // 自动重试带 thinking: { type: 'low' }，用户无需手动设置
        if (res.status === 400 && /不支持关闭思考|thinking.*type.*low|always.*think/i.test(body) && !initialThinking) {
          const retryController = new AbortController();
          const retryTimer = setTimeout(() => retryController.abort(), timeoutMs);
          
          res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(buildBody('low')),
            signal: retryController.signal,
          });
          
          clearTimeout(retryTimer);
          
          if (res.ok) {
            // 降级成功，继续处理响应
          } else {
            const retryBody = await res.text().catch(() => '');
            return {
              success: false,
              latency: Date.now() - start,
              error: this.classifyHTTPError(res.status, retryBody),
              detail: `实际请求: ${url}（已尝试自动降级到 thinking:low）`,
            };
          }
        } else {
          return {
            success: false,
            latency,
            error: this.classifyHTTPError(res.status, body),
            detail: `实际请求: ${url}`,
          };
        }
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
    const { apiKey, baseURL, model, temperature, timeoutMs = 30000, providerType, thinkingType } = opts;

    const start = Date.now();
    // 推理类模型（kimi-k2.6/k3/deepseek-reasoner 等）服务端硬性 temperature=1，
    // 与生成链路保持一致，避免 400 invalid temperature。
    // 🛡️ 视觉探测是确定性 yes/no 判定（能否识别图），必须 temperature=0 才稳定。
    // 直接忽略前端传入的 temperature（设置里 unifiedTemperature 等非 0 会让同图每次结果不同，
    // 即「自动检测模型」一次可以一次不可以、每一次都变的根因），恒用 0；
    // 推理模型经 normalizeRequestTemperature 归一化为 1，符合服务端硬性要求，不报错。
    const effectiveTemp = normalizeRequestTemperature(model, 0);
    try {
      // Anthropic 协议走独立分支
      if (providerType === 'anthropic') {
        return await this.testAnthropicVision({ apiKey, baseURL, model, effectiveTemp, timeoutMs, start });
      }

      const url = buildChatUrl(baseURL);

      // 🛡️ 2026-09-29 治本（增强）：测试图用「每次随机生成的 3 位数字（100-999）+ 白底黑字」。
      // 纯色图 + 「Describe this image in one word」无法区分「真视觉」与「纯文本基模忽略图像
      // 瞎回颜色词」——deepseek-v4-flash 这类推理基模会瞎回 "Red"（非空、无英文否定词），
      // 被误判为支持视觉（实锤：同模型两次检测一次 content 空判 false、一次 "Red" 判 true）。
      // 改用「含唯一可读数字的图 + 回答图中数字 + 返回必须答对该随机数字」判定：
      // 非视觉基模忽略图像瞎回任何无关词，恰好命中本次随机 3 位数概率仅 1/900，几乎不可能蒙中；
      // 即便前端用户反复点「自动检测」，每次随机数不同，也不会因固定答案被缓存/特化而误判。
      // 图与期望答案同源生成（random → expectedDigits → svg 数字），prompt 不泄露答案。
      const expectedDigits = String(100 + Math.floor(Math.random() * 900));
      const testSvg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120">` +
        `<rect width="100%" height="100%" fill="white"/>` +
        `<text x="50%" y="50%" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="black" text-anchor="middle" dominant-baseline="central">${expectedDigits}</text>` +
        `</svg>`;
      const testPng = await sharp(Buffer.from(testSvg)).png().toBuffer();
      const testImageData = 'data:image/png;base64,' + testPng.toString('base64');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      // 🔒 思考模式参数（2026-09-11）：优先用户配置，否则先尝试关闭思考
      // 如果模型不支持关闭思考（如 GLM 5.3-flash），自动降级到 'low'
      // 🧠 2026-09-30（方言缓存）：routedOff = 静态路由的关思考方言；实测成功后持久化，
      //   生成链路 buildThinkingOffParams 将优先采用（跳过静态路由的试错）。
      const routedOff = buildThinkingOffParams(model, baseURL);
      const buildVisionBody = (thinkingType?: string) => ({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'What number is displayed in the image? Answer with only the digits, nothing else.',
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
        // 🛡️ 2026-09-29 治本二：max_tokens 64 → 2048。
        // 推理模型（deepseek-v4-flash/kimi-k3 等）的思考（reasoning_content）同样消耗输出预算：
        // 64 上限时「思考短 → content 有数字 → 判视觉✓；思考长 → 64 token 被 thinking 吃光 →
        // content 为空 → 判视觉✗」，这正是「带思考的模型一次可以一次不可以」的机制
        // （实测：官方 deepseek-v4-flash 能答对随机 3 位数字 202 ⇒ 真有视觉，✗ 是被思考截断）。
        // 放宽到 2048 让 content 稳定产出最终答案，检测结果不再随思考长度抖动。
        max_tokens: 2048,
        // 🛡️ 2026-09-29 治本三：检测端点同步关推理（与生成侧 vision-agent 一致）。
        // 推理模型（deepseek-v4*/kimi/hy4 等）默认开 thinking，不关则思考吃掉 max_tokens
        // 预算 → content 空 → 误判不支持视觉（hy4-preview 即此症）。buildThinkingOffParams
        // 按厂商返回正确关推理参数形态，未命中返回 {} 不发送，不会给不支持的网关注入未知参数。
        ...routedOff,
        ...(effectiveTemp !== undefined ? { temperature: effectiveTemp } : {}),
        ...(thinkingType ? { thinking: { type: thinkingType } } : {}),
      });

      // 第一次请求：优先用户配置，否则不带 thinking 参数（尝试关闭思考）
      const initialThinking = thinkingType || undefined;
      let res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildVisionBody(initialThinking)),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latency = Date.now() - start;

      if (!res.ok) {
        const body = await res.text().catch(() => '');

        // 🔒 自动降级（2026-09-11）：如果模型返回 400 且错误信息包含"不支持关闭思考"，
        // 自动重试带 thinking: { type: 'low' }，用户无需手动设置
        if (res.status === 400 && /不支持关闭思考|thinking.*type.*low|always.*think/i.test(body) && !initialThinking) {
          const retryController = new AbortController();
          const retryTimer = setTimeout(() => retryController.abort(), timeoutMs);
          
          res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(buildVisionBody('low')),
            signal: retryController.signal,
          });
          
          clearTimeout(retryTimer);
          
          if (res.ok) {
            // 降级成功，继续处理响应
          } else {
            const retryBody = await res.text().catch(() => '');
            // 检查是否是"不支持视觉"类错误
            if (this.isVisionNotSupportedError(res.status, retryBody)) {
              return {
                success: false,
                latency: Date.now() - start,
                error: '该模型不支持图像输入（视觉能力）',
                detail: `模型 "${model}" 是纯文本模型，无法处理截图分析。\n\n建议方案：\n1. 切换到分别模式，为视觉任务单独配置 qwen-vl-max 或 gpt-4o\n2. 统一模式下选择多模态模型（如 claude-3-opus、gpt-4-vision）\n3. 如果只需要代码生成，可以忽略此警告`,
              };
            }
            return {
              success: false,
              latency: Date.now() - start,
              error: this.classifyHTTPError(res.status, retryBody),
              detail: `实际请求: ${url}（已尝试自动降级到 thinking:low）`,
            };
          }
        } else {
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
      }

      const data = await res.json();
      // 🔍 视觉测试只看 content 字段，不 fallback 到 reasoning_content。
      // 纯文本模型（如 deepseek-v4-pro）收到 image_url 时不报错，而是静默忽略图片、
      // 把推理过程放在 reasoning_content 里返回。真正的视觉分析结果在 content 中。
      const vmsg = data?.choices?.[0]?.message || {};
      let content = (vmsg.content || '').trim();

      // 🛡️ 2026-09-29 模型无关自愈（治本四）：用户可能配置任意未知推理模型（新出/别名/
      // 中转包装），不在 buildThinkingOffParams 白名单 → 第一次未关推理 → 思考吃掉 max_tokens
      // 预算 → content 空。不依赖模型名白名单，靠「思考烧光预算」信号触发强制关推理重试。
      // 触发信号：content 为空 且（reasoning_content 非空 或 usage.reasoning_tokens>0
      // 或 finish_reason==='length'）。重试对两种关推理形态都试（thinking:{type:'disabled'}
      // 与 enable_thinking:false），覆盖任意厂商网关，任一成功即采用。
      if (!content) {
        const finishReason = data?.choices?.[0]?.finish_reason;
        const reasoningTokens =
          data?.usage?.completion_tokens_details?.reasoning_tokens ??
          data?.usage?.reasoning_tokens ?? 0;
        const reasoningContent = vmsg.reasoning_content;
        const burnedByReasoning =
          !!(reasoningContent && String(reasoningContent).trim()) ||
          (typeof reasoningTokens === 'number' && reasoningTokens > 0) ||
          finishReason === 'length';
        if (burnedByReasoning) {
          const offVariants = [
            { thinking: { type: 'disabled' } },
            { enable_thinking: false },
          ];
          for (const off of offVariants) {
            try {
              const rres = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                  model,
                  messages: buildVisionBody().messages,
                  max_tokens: 2048,
                  ...(effectiveTemp !== undefined ? { temperature: effectiveTemp } : {}),
                  ...off,
                }),
                signal: controller.signal,
              });
              if (rres.ok) {
                const rdata = await rres.json();
                const rcontent = (rdata?.choices?.[0]?.message?.content || '').trim();
                if (rcontent) {
                  content = rcontent;
                  // 🧠 2026-09-30（方言缓存）：自愈成功的关思考方言持久化（权威实测结论）
                  try { markThinkingDialectVerified(model, baseURL, off, 'vision-test-selfheal'); } catch { /* 非阻断 */ }
                  break;
                }
              }
            } catch {
              // 该关推理形态不适用（如 400），试下一种
            }
          }
        }
      }

      if (!content) {
        return {
          success: false,
          latency,
          expectedDigits,
          error: '该模型不支持图像输入（视觉能力）',
          detail: `模型 "${model}" 未返回视觉分析结果（content 为空），可能是纯文本模型，也可能是推理模型思考耗尽输出预算。\n\n建议方案：\n1. 切换到分别模式，为视觉任务单独配置 qwen-vl-max 或 gpt-4o\n2. 统一模式下选择多模态模型（如 claude-3-opus、gpt-4-vision）\n3. 如果只需要代码生成，可以忽略此警告`,
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
          expectedDigits,
          error: '该模型不支持图像输入（视觉能力）',
          detail: `模型 "${model}" 是纯文本模型，无法处理截图分析（API 未报错但回复表明未看到图片）。\n\n建议方案：\n1. 切换到分别模式，为视觉任务单独配置 qwen-vl-max 或 gpt-4o\n2. 统一模式下选择多模态模型（如 claude-3-opus、gpt-4-vision）\n3. 如果只需要代码生成，可以忽略此警告`,
        };
      }

      // 🛡️ 2026-09-29 治本判定（增强）：测试图是白底黑字的随机 3 位数字，真视觉模型回答必含该数字。
      // 纯文本基模（deepseek-v4-flash 等）忽略图像走文本通道，返回任何无关内容
      // （如瞎回 "Red"）都不含本次随机数字 → 判不支持视觉。只验证「返回了内容」不够，
      // 必须验证「答对了图里的内容」——这是唯一能区分「真视觉」与「瞎回」的判据
      // （实锤：deepseek-v4-flash 同请求两次检测，一次 content 空判 false、
      // 一次瞎回 "Red" 被误判 true 并落盘 vision:true，导致生成时被当视觉模型用）。
      // 随机数每次检测独立生成，命中概率 1/900，即使反复检测也不会因固定答案被缓存而误判。
      const digits = String(content).replace(/[^0-9]/g, '');
      if (!digits.includes(expectedDigits)) {
        return {
          success: false,
          latency,
          expectedDigits,
          error: '该模型不支持图像输入（视觉能力）',
          detail: `模型 "${model}" 未识别出测试图中的数字（期望包含 "${expectedDigits}"，实际返回 "${content.slice(0, 50)}"）——极可能是纯文本模型忽略图像后的瞎回，不是真正的视觉理解。\n\n建议方案：\n1. 切换到分别模式，为视觉任务单独配置 qwen-vl-max 或 gpt-4o\n2. 统一模式下选择多模态模型（如 claude-3-opus、gpt-4-vision）\n3. 若确要使用 DeepSeek，视觉模型名为 deepseek-v4-flash-vision-exp（experimental）`,
        };
      }

      // 🧠 2026-09-30（方言缓存）：视觉实测通过 ⇒ 静态路由方言有效，持久化供生成链路优先采用。
      //   用户显式配了 thinkingType 时实际生效的是用户方言，不在此标记（避免毒化缓存）。
      if (!thinkingType && routedOff && Object.keys(routedOff).length) {
        try { markThinkingDialectVerified(model, baseURL, routedOff, 'vision-test'); } catch { /* 非阻断 */ }
      }
      return {
        success: true,
        latency,
        expectedDigits,
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
      const identifiedOpts: { source: string; outputTokens?: number; vision?: boolean } = { source: 'test' };
      if (typeof outTok === 'number' && Number.isFinite(outTok) && outTok > 0) {
        identifiedOpts.outputTokens = outTok;
      }
      // 🆕 持久化视觉能力实测结论（权威事实源）。
      // 组件生成依赖截图/Figma 图像理解，保存闸门与生成闸门都以此判定，
      // 不再依赖任何模型名白名单。连通但视觉调用失败 → 明确记为 vision:false，
      // 使「deepseek 这类纯文本模型被当成视觉模型」在保存/生成前即被拦下。
      identifiedOpts.vision = !!vision.success;
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
        // 🛡️ 2026-09-24 治本（code1.newcli.com 实锤）：401 不一定是「Key 无效」——
        // 中转网关常把「额度不足/欠费/余额耗尽」也返回 401（实测 code1 返回
        // {"error":{"message":"额度不足","type":"authentication_error"}}）。
        // 原逻辑一律报「API Key 无效」，误导用户去改一把其实有效的 key。
        // 现按响应体细分：命中额度/余额类关键词 → 报「额度不足」，否则才报「Key 无效」。
        if (/额度不足|余额不足|欠费|余额|quota|insufficient|balance|credit|billing|payment|exceeded/i.test(body)) {
          return '额度不足（账户余额/额度已用完，请充值或切换到其他 provider）';
        }
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
