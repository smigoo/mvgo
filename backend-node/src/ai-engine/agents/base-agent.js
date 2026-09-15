/**
 * 智能体基类
 * 提供所有智能体的通用功能
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../logger/index.js';
import { TEXT_DEFAULTS } from '../utils/ai-defaults.js';
import {
  coerceLLMUsage,
  normalizeRequestTemperature,
} from '../utils/model-config.js';
import { attachUnifiedInvoke } from '../utils/ai-request-gateway.js';
import { getProviderPool } from '../utils/provider-pool.js';
import { isOpenAICompatibleBaseURL } from '../utils/provider-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class BaseAgent {
  constructor(config) {
    this.name = config.name;
    this.description = config.description;
    this.model = config.model || TEXT_DEFAULTS.model;
    // 🔒 强制用户配置：模型不能为空，必须从用户配置中获取
    if (!this.skipLLM && !this.model) {
      throw new Error(
        `${this.name}: 缺少 AI 模型配置，请在用户配置中设置文本模型`,
      );
    }
    // 📊 会话级模型登记：透传给 attachUnifiedInvoke，使统一 invoke 出口能记录
    // 「sessionId → 当前模型」，供进度日志渲染 [model] 标签。
    this.sessionId = config.sessionId || null;
    // 🛡️ 模型使用信息收集（2026-08-29）：onProgress 在构造时可能尚未就绪（execute 时才拿到
    // graph 的 state.onProgress），此处存一个可变引用，attachUnifiedInvoke 通过 getter 动态读。
    // 根因：base-agent 调 attachUnifiedInvoke 时未传 onProgress → agent-model 事件从不发出 →
    // actualTextModels 恒空 → 详情页 text 模型回退配置值，实际命中的 deepseek/qwen 丢失。
    this.onProgress = config.onProgress || null;
    // 推理类模型（kimi-k3/kimi-thinking/deepseek-reasoner/qwq/o1/o3 等）服务端硬性要求 temperature=1，
    // 归一化时强制为 1，避免 400 invalid temperature；非推理模型尊重显式配置。
    this.temperature = normalizeRequestTemperature(
      this.model,
      config.temperature,
    );
    this.maxTokens = config.maxTokens;

    // 初始化日志器
    this.logger = createLogger({
      name: `agent:${this.name}`,
      level: config.logLevel || 'info',
    });

    // 初始化状态
    this.state = {};
    this.history = [];

    // 初始化工具
    this.tools = config.tools || [];

    // Token 用量记录钩子（由外部注入，非阻塞）
    this.onTokenUsage = config.onTokenUsage || null;

    // 加载 Prompt 模板
    this.promptTemplate = this.loadPromptTemplate(config.promptTemplate);

    // 加载参考文件
    this.referenceFiles = this.loadReferenceFiles(config.referenceFiles || []);

    // 初始化 LLM - 支持阿里云 DashScope、OpenAI 兼容和 Anthropic
    // BaseAgent 用于文本任务，必须通过 config 传入 API 配置
    // 🛡️ skipLLM：纯确定性智能体（不调用 LLM，如 hello-agent 示例/数据转换节点）
    // 可跳过 LLM 客户端构建，避免无 API key 环境构造失败。默认 false 保持向后兼容。
    this.skipLLM = config.skipLLM === true;

    // 🔒 强制用户配置：不再回退到环境变量
    if (!this.skipLLM && !config.apiKey) {
      throw new Error(
        `${this.name}: 缺少 API Key 配置，请在用户配置中设置大模型 API 密钥`,
      );
    }
    this.apiKey = config.apiKey || '';
    this.baseURL = config.baseURL || TEXT_DEFAULTS.baseURL;
    // 可选：per-provider 思考开关（如 deepseek 系支持 thinking:{type:"disabled"} 关推理）。
    // 仅当 provider/models 配置显式声明时才透传，避免给不支持的网关（lkeap/glm 官方）注入未知参数 → 400。
    this.thinkingType = config.thinkingType || '';
    //优先尊重显式 providerType（前端文本接口协议选择），否则回退到 URL 自动识别
    this.providerType = config.providerType || 'auto';
    let isOpenAICompatible;
    if (this.providerType === 'openai-compatible') {
      isOpenAICompatible = true;
    } else if (this.providerType === 'anthropic') {
      isOpenAICompatible = false;
    } else {
      isOpenAICompatible = isOpenAICompatibleBaseURL(this.baseURL);
    }

    this.llm = this.skipLLM ? null : this._buildLLM();

    if (this.skipLLM) {
      // 确定性智能体：不挂统一 LLM 网关
      this.logger.info(
        `智能体 ${this.name} 以 skipLLM 模式初始化（纯确定性，无 LLM 依赖）`,
      );
    } else {
      attachUnifiedInvoke(this.llm, {
        context: this.name,
        provider: isOpenAICompatible ? 'openai-compatible' : 'anthropic',
        model: this.model,
        providerId: config.providerId,
        sessionId: this.sessionId,
        maxTokens: this.maxTokens,
        // 🛡️ 模型收集（2026-08-29）：用 getter 动态读 this.onProgress（execute 时才被赋值为
        // graph 的 state.onProgress），使 agent-model 事件能透传到 phase2 收集 actualTextModels。
        onProgress: (data) => this.onProgress?.(data),
        // 🔀 主 provider 熔断后自动切换备用：每次 attempt 重新 pick 供应商池并重建 llm。
        // excludeIds：排除上一次 attempt 刚失败的 provider，实现「超时 → 切换大模型」故障转移。
        refreshProvider: ({ excludeIds = [] } = {}) => {
          const p = getProviderPool().pick('text', { excludeIds });
          if (!p || !p.apiKey) return null;
          return {
            providerId: p.id,
            apiKey: p.apiKey,
            baseURL: p.baseURL || '',
            model: p.model || this.model || '', // 🛡️ provider 无 model 时回退到实例 model，空则下游抛错
            providerType: p.providerType || 'auto',
            thinkingType: p.thinkingType || '', // 🔧 per-provider 思考开关透传（deepseek disabled 等）
          };
        },
        createLLM: (snap) => this._buildLLM(snap),
      });
    }
  }

  /**
   * 按 provider 快照构建 LLM 客户端（主 provider 熔断切换备用时重建）
   * @param {{apiKey?:string,baseURL?:string,model?:string,providerType?:string}} [snapshot]
   */
  _buildLLM(snapshot = {}) {
    const apiKey = snapshot.apiKey || this.apiKey;
    const rawBaseURL = snapshot.baseURL || this.baseURL;
    const model = snapshot.model || this.model;
    // 熔断切换 provider 后 model 可能变化（如 qwen → kimi-k2.6），temperature 必须按最终模型重新归一化：
    // 推理类模型（kimi-k2.6/k3、deepseek-reasoner、qwq、o1/o3 等）服务端硬性要求 temperature=1，
    // 沿用构造时按旧模型归一化的 this.temperature 会触发 400 invalid temperature。
    const temperature = normalizeRequestTemperature(model, this.temperature);
    const providerType = snapshot.providerType || this.providerType || 'auto';
    // 🐛 2026-09-02 修复「只有 qwen 可用」根因：协议判定必须基于「原始 baseURL」。
    // 原先先剥 /chat/completions 再判定，glm/lkeap 等完整 endpoint 剥尾后丢失关键特征
    // （如 open.bigmodel.cn/api/paas/v4、api.lkeap.../plan/v3 均不含 /v1/dashscope 特征），
    // 被 isOpenAICompatibleBaseURL 误判为 anthropic → ChatAnthropic 拼 /v1/messages
    // → .../v4/v1/messages、.../v3/v1/messages 毫秒级 404 → 熔断冷却 → 池里只剩 qwen 可用。
    const isOpenAICompatible =
      providerType === 'openai-compatible'
        ? true
        : providerType === 'anthropic'
          ? false
          : isOpenAICompatibleBaseURL(rawBaseURL);

    let baseURL = rawBaseURL;
    if (isOpenAICompatible) {
      // 规范化（仅在确认 OpenAI 兼容后）：OpenAI SDK 会在 baseURL 后拼 /chat/completions，
      // 若 baseURL 已含 /chat/completions（用户粘贴完整 endpoint，如 deepseek/bigmodel 网关）会拼出双路径 → 404。
      // 截断到 /chat/completions 之前（与 chat-url.buildChatUrl 的截断规则一致）。
      // anthropic 原生/兼容端点不含该后缀，保持原样交给 SDK 拼 /v1/messages。
      const ccIdx = rawBaseURL.toLowerCase().indexOf('/chat/completions');
      if (ccIdx !== -1) baseURL = rawBaseURL.slice(0, ccIdx).replace(/\/+$/, '');
    }

    if (isOpenAICompatible) {
      const llmOptions = {
        modelName: model,
        temperature: temperature,
        maxTokens: this.maxTokens,
        apiKey: apiKey,
        configuration: {
          baseURL: baseURL,
        },
      };
      // 🔧 per-provider 思考开关（2026-09-02）：配置声明 thinkingType 时注入 thinking 参数。
      // 仅 deepseek 系（实测支持 {type:"disabled"} 关推理 → 解决「推理烧光输出预算→空内容」）；
      // lkeap(kimi/hy4/minimax)/glm官方 实测不接受该参数，必须保持 unset 否则 400，故只在配置显式声明时透传。
      const thinkingType = snapshot.thinkingType || this.thinkingType || '';
      if (thinkingType) {
        llmOptions.modelKwargs = { thinking: { type: thinkingType } };
      }
      return new ChatOpenAI(llmOptions);
    }
    return new ChatAnthropic({
      modelName: model,
      temperature: temperature,
      maxTokens: this.maxTokens,
      anthropicApiKey: apiKey,
      anthropicApiUrl: baseURL || undefined,
      // 启用流式：当 maxTokens 较大时，Anthropic SDK 要求长请求（预估 >10 分钟）必须使用流式，否则报错
      streaming: true,
    });
  }

  /**
   * 加载 Prompt 模板
   */
  loadPromptTemplate(templatePath) {
    if (!templatePath) return '';

    try {
      const fullPath = join(__dirname, '../../', templatePath);
      return readFileSync(fullPath, 'utf-8');
    } catch (error) {
      console.warn(`Warning: Could not load prompt template: ${templatePath}`);
      return '';
    }
  }

  /**
   * 加载参考文件
   */
  loadReferenceFiles(filePaths) {
    const references = {};
    const projectRoot = BaseAgent._resolveProjectRoot(__dirname);

    for (const filePath of filePaths) {
      try {
        const fullPath = join(projectRoot, filePath);
        const content = readFileSync(fullPath, 'utf-8');
        references[filePath] = content;
      } catch (error) {
        console.warn(`Warning: Could not load reference file: ${filePath}`);
      }
    }

    return references;
  }

  /**
   *暂停检查：在分块生成间隙调用。
   * 如果 pauseChecker 返回 true（任务状态为 paused），则轮询等待直到恢复（running）或取消（cancelled）。
   * - pauseChecker: async () => 'running' | 'paused' | 'cancelled' | null（null=无任务/不支持的检查）
   * - 返回值: 'running'（继续） | 'cancelled'（中止）
   */
  async _awaitIfPaused(pauseChecker) {
    if (!pauseChecker || typeof pauseChecker !== 'function') return 'running';
    const status = await pauseChecker();
    if (status !== 'paused') return status || 'running';

    logger?.info?.('⏸ 任务已暂停，等待恢复...', {}) ||
      console.log('[pause] ⏸ 任务已暂停，等待恢复...');
    // 轮询等待，每 1.5s 检查一次，超时 30min 自动恢复（防死锁）
    const POLL_INTERVAL = 1500;
    const MAX_WAIT = 30 * 60 * 1000;
    const start = Date.now();
    while (Date.now() - start < MAX_WAIT) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      const s = await pauseChecker();
      if (s === 'running') {
        logger?.info?.('▶ 任务已恢复，继续生成', {}) ||
          console.log('[pause] ▶ 任务已恢复，继续生成');
        return 'running';
      }
      if (s === 'cancelled') return 'cancelled';
      // s === 'paused' 继续等待
    }
    logger?.warn?.('⏸ 暂停超时(30min)，自动恢复生成', {}) ||
      console.warn('[pause] ⏸ 暂停超时(30min)，自动恢复生成');
    return 'running';
  }

  /**
   * 向上逐级查找包含 references/ 目录的项目根。
   * 兼容从 backend/src 或 backend/dist 运行；旧写法固定上溯层级会解析到 backend/dist/ 导致 references 全部丢失。
   */
  static _resolveProjectRoot(startDir) {
    let dir = startDir;
    for (let i = 0; i < 8; i++) {
      if (existsSync(join(dir, 'references'))) {
        return dir;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return join(startDir, '../../');
  }

  /**
   * 构建最终 Prompt
   * 子类可以覆盖此方法来自定义 Prompt 构建逻辑
   */
  buildPrompt(input) {
    let prompt = this.promptTemplate;

    // 替换参考文件占位符 {{references/xxx.md}}
    for (const [filePath, content] of Object.entries(this.referenceFiles)) {
      const placeholder = `{{${filePath}}}`;
      prompt = prompt.replace(placeholder, content);
    }

    // 替换输入占位符 {{input}}
    const inputStr =
      typeof input === 'string' ? input : JSON.stringify(input, null, 2);
    prompt = prompt.replace('{{input}}', inputStr);

    return prompt;
  }

  /**
   * 调用 LLM
   */
  async invoke(input, config = {}) {
    const startTime = Date.now();

    try {
      // 构建 Prompt
      const prompt = this.buildPrompt(input);

      // 详细日志：输入信息
      this.logger.info(`[${this.name}] 开始调用`, {
        inputSize: JSON.stringify(input).length,
        inputPreview: JSON.stringify(input).substring(0, 200),
      });

      // 详细日志：Prompt信息
      this.logger.debug(`[${this.name}] Prompt构建完成`, {
        promptSize: prompt.length,
        promptPreview: prompt.substring(0, 300),
      });

      // 调用 LLM
      this.logger.info(`[${this.name}] 正在请求AI...`);
      const response = await this.llm.invoke(prompt, {
        __mvgoRequestOptions: {
          context: this.name,
          model: this.model,
          signal: config.signal,
          onProgress: config.onProgress,
          requestConcurrency: config.requestConcurrency,
          requestQueueTimeoutMs: config.requestQueueTimeoutMs,
          requestTimeoutMs: config.requestTimeoutMs,
          requestMaxRetries: config.requestMaxRetries,
        },
      });

      // 详细日志：AI响应
      // 抽取最终文本：兼容 OpenAI 兼容（content 为字符串）、Anthropic
      // （content 为块数组，思考块 type==='thinking'/'reasoning'），以及推理模型
      // maxTokens 不足导致 content 为空时回退 reasoning_content 的退化场景。
      const contentText = this.extractModelText(response);

      this.logger.debug(`[${this.name}] AI响应接收`, {
        responseSize: contentText.length,
        responsePreview: contentText.substring(0, 300),
      });

      // 解析输出
      this.logger.info(`[${this.name}] 正在解析响应...`);
      const parsed = this.parseOutput(contentText);

      // 记录历史
      this.recordHistory(input, parsed);

      // 记录日志
      const duration = Date.now() - startTime;

      //修复：使用 coerceLLMUsage 归一化不同 provider 的 token usage 格式
      // 之前仅读 response.usage?.input_tokens（Anthropic 格式），
      // 导致 OpenAI 兼容模型（Qwen）的 token 统计始终为 0
      const tokenUsage = coerceLLMUsage(response);

      this.logger.info(`[${this.name}] 完成`, {
        duration: `${duration}ms`,
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        totalTokens: tokenUsage.totalTokens,
      });

      // 通过钩子记录 Token 用量（非阻塞，外部传入 onTokenUsage 回调）
      if (this.onTokenUsage && tokenUsage.totalTokens > 0) {
        try {
          this.onTokenUsage({
            nodeName: this.name,
            model: this.model,
            modelType: 'text',
            inputTokens: tokenUsage.inputTokens,
            outputTokens: tokenUsage.outputTokens,
            totalTokens: tokenUsage.totalTokens,
            duration,
            timestamp: new Date().toISOString(),
            sessionId: config.sessionId || null,
          });
        } catch (e) {
          // 静默失败，不影响主流程
        }
      }

      return parsed;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`[${this.name}] 执行失败`, {
        duration: `${duration}ms`,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * 解析 LLM 输出
   * 子类必须实现此方法
   */
  parseOutput(rawOutput) {
    // 默认实现：尝试从输出中提取 JSON
    try {
      // 如果已经是对象，直接返回
      if (typeof rawOutput === 'object' && rawOutput !== null) {
        return rawOutput;
      }

      // 如果不是字符串，转换为字符串
      if (typeof rawOutput !== 'string') {
        rawOutput = String(rawOutput);
      }

      // 查找 JSON 代码块
      const jsonMatch = rawOutput.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // 尝试直接解析
      return JSON.parse(rawOutput);
    } catch (error) {
      // 如果无法解析，返回原始文本
      return { rawOutput };
    }
  }

  /**
   * 从 LLM 响应中抽取最终文本
   * 兼容三种形态：
   * 1. OpenAI 兼容：response.content 为字符串（正文），reasoning_content 在 additional_kwargs
   * 2. Anthropic：response.content 为块数组，正文 type==='text'，思考 type==='thinking'/'reasoning'
   * 3. 推理模型 maxTokens 不足导致 content 为空时，用 reasoning_content 兜底（退化但非空）
   *
   * 注意：reasoning_content 是「思考过程」而非「最终答案」，正常情况下绝不优先使用；
   * 仅当正文 content 为空（通常是额度被推理吃光）时，才回退它以避免整段输出为空。
   *
   * @param {any} response - LangChain AIMessage 或原始响应
   * @returns {string}
   */
  extractModelText(response) {
    const raw = response?.content;
    let text = '';

    if (Array.isArray(raw)) {
      const textBlocks = raw
        .filter((c) => !c || (c.type !== 'thinking' && c.type !== 'reasoning'))
        .map((c) => (typeof c === 'string' ? c : c?.text || ''))
        .join('');
      const reasoningBlocks = raw
        .filter((c) => c && (c.type === 'thinking' || c.type === 'reasoning'))
        .map((c) => (typeof c === 'string' ? c : c?.text || ''))
        .join('');
      // 正文优先；正文为空（推理块被过滤光）时回退思考块
      text = textBlocks || reasoningBlocks;
    } else if (typeof raw === 'string') {
      text = raw;
    }

    if (text && text.trim()) return text;

    // 兜底：OpenAI 兼容推理模型（DeepSeek 等）把思考写在 reasoning_content 字段，
    // content 在额度不足时可能为空，此时用 reasoning_content 退化输出避免整段为空。
    const reasoning =
      response?.additional_kwargs?.reasoning_content ||
      response?.reasoning_content;
    return reasoning ? String(reasoning) : '';
  }

  /**
   * 记录历史
   * @private
   */
  recordHistory(input, output) {
    this.history.push({
      timestamp: new Date().toISOString(),
      input,
      output,
    });

    // 限制历史记录数量
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }
  }

  /**
   * 更新状态
   */
  updateState(updates) {
    this.state = { ...this.state, ...updates };
    this.logger.debug('状态已更新', { updates });
  }

  /**
   * 获取状态
   */
  getState() {
    return { ...this.state };
  }

  /**
   * 重置状态
   */
  resetState() {
    this.state = {};
    this.logger.debug('状态已重置');
  }

  /**
   * 获取历史记录
   */
  getHistory(limit = 10) {
    return this.history.slice(-limit);
  }

  /**
   * 清空历史记录
   */
  clearHistory() {
    this.history = [];
    this.logger.debug('历史已清空');
  }

  /**
   * 注册工具
   */
  registerTool(tool) {
    this.tools.push(tool);
    this.logger.debug('工具已注册', { tool: tool.name });
  }

  /**
   * 调用工具
   */
  async callTool(toolName, params) {
    const tool = this.tools.find((t) => t.name === toolName);

    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    this.logger.debug('调用工具', { tool: toolName, params });

    try {
      const result = await tool.execute(params);
      this.logger.debug('工具执行成功', { tool: toolName });
      return result;
    } catch (error) {
      this.logger.error('工具执行失败', {
        tool: toolName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 获取智能体信息
   */
  getInfo() {
    return {
      name: this.name,
      description: this.description,
      model: this.model,
      temperature: this.temperature,
      toolsCount: this.tools.length,
      historyCount: this.history.length,
    };
  }

  /**
   * 验证输出格式
   * 子类可以覆盖此方法来验证输出是否符合预期格式
   */
  validateOutput(output) {
    return true;
  }
}
