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
var ConfigTestService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigTestService = void 0;
const common_1 = require("@nestjs/common");
const sharp_1 = __importDefault(require("sharp"));
const chat_url_js_1 = require("../ai-engine/utils/chat-url.js");
const model_config_js_1 = require("../ai-engine/utils/model-config.js");
let ConfigTestService = ConfigTestService_1 = class ConfigTestService {
    logger = new common_1.Logger(ConfigTestService_1.name);
    async testTextLLM(opts) {
        const { apiKey, baseURL, model, temperature, timeoutMs = 15000, providerType, thinkingType } = opts;
        const start = Date.now();
        const effectiveTemp = (0, model_config_js_1.normalizeRequestTemperature)(model, temperature);
        try {
            if (providerType === 'anthropic') {
                return await this.testAnthropicText({ apiKey, baseURL, model, effectiveTemp, timeoutMs, start });
            }
            const url = (0, chat_url_js_1.buildChatUrl)(baseURL);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            const buildBody = (thinkingType) => ({
                model,
                messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
                max_tokens: 64,
                ...(effectiveTemp !== undefined ? { temperature: effectiveTemp } : {}),
                ...(thinkingType ? { thinking: { type: thinkingType } } : {}),
            });
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
                    }
                    else {
                        const retryBody = await res.text().catch(() => '');
                        return {
                            success: false,
                            latency: Date.now() - start,
                            error: this.classifyHTTPError(res.status, retryBody),
                            detail: `实际请求: ${url}（已尝试自动降级到 thinking:low）`,
                        };
                    }
                }
                else {
                    return {
                        success: false,
                        latency,
                        error: this.classifyHTTPError(res.status, body),
                        detail: `实际请求: ${url}`,
                    };
                }
            }
            const data = await res.json();
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
        }
        catch (err) {
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
    async testAnthropicText(opts) {
        const { apiKey, baseURL, model, effectiveTemp, timeoutMs, start } = opts;
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
    async testVisionLLM(opts) {
        const { apiKey, baseURL, model, temperature, timeoutMs = 30000, providerType, thinkingType } = opts;
        const start = Date.now();
        const effectiveTemp = (0, model_config_js_1.normalizeRequestTemperature)(model, 0);
        try {
            if (providerType === 'anthropic') {
                return await this.testAnthropicVision({ apiKey, baseURL, model, effectiveTemp, timeoutMs, start });
            }
            const url = (0, chat_url_js_1.buildChatUrl)(baseURL);
            const expectedDigits = String(100 + Math.floor(Math.random() * 900));
            const testSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120">` +
                `<rect width="100%" height="100%" fill="white"/>` +
                `<text x="50%" y="50%" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="black" text-anchor="middle" dominant-baseline="central">${expectedDigits}</text>` +
                `</svg>`;
            const testPng = await (0, sharp_1.default)(Buffer.from(testSvg)).png().toBuffer();
            const testImageData = 'data:image/png;base64,' + testPng.toString('base64');
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            const routedOff = (0, model_config_js_1.buildThinkingOffParams)(model, baseURL);
            const buildVisionBody = (thinkingType) => ({
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
                max_tokens: 2048,
                ...routedOff,
                ...(effectiveTemp !== undefined ? { temperature: effectiveTemp } : {}),
                ...(thinkingType ? { thinking: { type: thinkingType } } : {}),
            });
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
                    }
                    else {
                        const retryBody = await res.text().catch(() => '');
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
                }
                else {
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
            const vmsg = data?.choices?.[0]?.message || {};
            let content = (vmsg.content || '').trim();
            if (!content) {
                const finishReason = data?.choices?.[0]?.finish_reason;
                const reasoningTokens = data?.usage?.completion_tokens_details?.reasoning_tokens ??
                    data?.usage?.reasoning_tokens ?? 0;
                const reasoningContent = vmsg.reasoning_content;
                const burnedByReasoning = !!(reasoningContent && String(reasoningContent).trim()) ||
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
                                    try {
                                        (0, model_config_js_1.markThinkingDialectVerified)(model, baseURL, off, 'vision-test-selfheal');
                                    }
                                    catch { }
                                    break;
                                }
                            }
                        }
                        catch {
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
            if (!thinkingType && routedOff && Object.keys(routedOff).length) {
                try {
                    (0, model_config_js_1.markThinkingDialectVerified)(model, baseURL, routedOff, 'vision-test');
                }
                catch { }
            }
            return {
                success: true,
                latency,
                expectedDigits,
                detail: `视觉响应: "${content.slice(0, 50)}"`,
            };
        }
        catch (err) {
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
    async testAnthropicVision(opts) {
        const { apiKey, baseURL, model, effectiveTemp, timeoutMs, start } = opts;
        const cleanBase = baseURL.replace(/\/v1\/?$/, '');
        const url = `${cleanBase}/v1/messages`;
        const testImageData = 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAG0lEQVR4nGP4z8BANiJf56jmUc2jmkc1U0UzADHNjoAymaoJAAAAAElFTkSuQmCC';
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
    async testReasoningLLM(opts) {
        const { apiKey, baseURL, model, temperature, timeoutMs = 15000, providerType } = opts;
        const start = Date.now();
        const effectiveTemp = (0, model_config_js_1.normalizeRequestTemperature)(model, temperature);
        try {
            if (providerType === 'anthropic') {
                return {
                    success: false,
                    latency: Date.now() - start,
                    error: 'Anthropic 协议推理检测暂未实现（Claude thinking blocks 协议不同）',
                };
            }
            const url = (0, chat_url_js_1.buildChatUrl)(baseURL);
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
        }
        catch (err) {
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
    async testModelCapability(opts) {
        const [text, vision, reasoning] = await Promise.all([
            this.testTextLLM(opts),
            this.testVisionLLM(opts),
            this.testReasoningLLM(opts),
        ]);
        const reachable = text.success || vision.success || reasoning.success;
        if (reachable && opts?.model) {
            const outTok = opts.outputTokens;
            const identifiedOpts = { source: 'test' };
            if (typeof outTok === 'number' && Number.isFinite(outTok) && outTok > 0) {
                identifiedOpts.outputTokens = outTok;
            }
            identifiedOpts.vision = !!vision.success;
            (0, model_config_js_1.markModelCapabilityIdentified)(opts.model, identifiedOpts);
        }
        return { text, vision, reasoning };
    }
    async testFigmaToken(opts) {
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
        }
        catch (err) {
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
    async testApifoxToken(opts) {
        const { token, timeoutMs = 10000 } = opts;
        const start = Date.now();
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
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
            const versions = Array.isArray(data) ? data : [];
            return {
                success: true,
                latency,
                detail: `已连接，API 可用（${versions.length} 个版本）`,
            };
        }
        catch (err) {
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
    async testGitlabToken(opts) {
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
        }
        catch (err) {
            const latency = Date.now() - start;
            if (err.name === 'AbortError') {
                return { success: false, latency, error: `请求超时（>${timeoutMs}ms）` };
            }
            return { success: false, latency, error: `网络错误: ${err.message}` };
        }
    }
    classifyHTTPError(status, body) {
        const bodyLower = body.toLowerCase();
        switch (status) {
            case 401:
                if (/额度不足|余额不足|欠费|余额|quota|insufficient|balance|credit|billing|payment|exceeded/i.test(body)) {
                    return '额度不足（账户余额/额度已用完，请充值或切换到其他 provider）';
                }
                return 'API Key 无效';
            case 403:
                return '无权访问（检查 API Key 或账户权限）';
            case 429:
                return '请求过于频繁或额度已用完';
            case 404:
                if (bodyLower.includes('model') ||
                    bodyLower.includes('模型') ||
                    bodyLower.includes('invalidparameter') ||
                    bodyLower.includes('does not exist') ||
                    bodyLower.includes('no such')) {
                    return '模型不存在（检查模型名）';
                }
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
    isVisionNotSupportedError(status, body) {
        const bodyLower = body.toLowerCase();
        return (bodyLower.includes('does not support') ||
            bodyLower.includes('multimodal') ||
            (bodyLower.includes('vision') && !bodyLower.includes('height') && !bodyLower.includes('width')) ||
            (bodyLower.includes('unsupported') && bodyLower.includes('image') && !bodyLower.includes('larger')) ||
            (status === 400 && bodyLower.includes('not support') && bodyLower.includes('image')) ||
            (status === 400 && (bodyLower.includes('deserialize') || bodyLower.includes('messages[0]') || bodyLower.includes('unknown'))));
    }
};
exports.ConfigTestService = ConfigTestService;
exports.ConfigTestService = ConfigTestService = ConfigTestService_1 = __decorate([
    (0, common_1.Injectable)()
], ConfigTestService);
//# sourceMappingURL=config-test.service.js.map