/**
 * 智能体基类
 * 提供所有智能体的通用功能
 */

import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createLogger } from '../logger/index.js'
import { TEXT_DEFAULTS } from '../utils/ai-defaults.js'
import { coerceLLMUsage } from '../utils/model-config.js'
import { attachUnifiedInvoke } from '../utils/ai-request-gateway.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class BaseAgent {
  constructor(config) {
    this.name = config.name
    this.description = config.description
    this.model = config.model || TEXT_DEFAULTS.model
    this.temperature = config.temperature
    this.maxTokens = config.maxTokens

    // 初始化日志器
    this.logger = createLogger({
      name: `agent:${this.name}`,
      level: config.logLevel || 'info'
    })

    // 初始化状态
    this.state = {}
    this.history = []

    // 初始化工具
    this.tools = config.tools || []

    // Token 用量记录钩子（由外部注入，非阻塞）
    this.onTokenUsage = config.onTokenUsage || null

    // 加载 Prompt 模板
    this.promptTemplate = this.loadPromptTemplate(config.promptTemplate)

    // 加载参考文件
    this.referenceFiles = this.loadReferenceFiles(config.referenceFiles || [])

    // 初始化 LLM - 支持阿里云 DashScope、OpenAI 兼容和 Anthropic
    // BaseAgent 用于文本任务，优先使用 TEXT_* 配置（Claude）
    const apiKey = config.apiKey || process.env.TEXT_API_KEY || process.env.ANTHROPIC_API_KEY || TEXT_DEFAULTS.apiKey
    const baseURL = config.baseURL || process.env.TEXT_BASE_URL || process.env.ANTHROPIC_BASE_URL || TEXT_DEFAULTS.baseURL
    const isOpenAICompatible = baseURL && (
      baseURL.includes('dashscope.aliyuncs.com') ||
      baseURL.includes('openai.com') ||
      baseURL.includes('api.deepseek.com') ||
      baseURL.includes('openai.') ||
      baseURL.includes('/v1')
    )

    if (isOpenAICompatible) {
      this.llm = new ChatOpenAI({
        modelName: this.model,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        apiKey: apiKey,
        configuration: {
          baseURL: baseURL
        }
      })
    } else {
      this.llm = new ChatAnthropic({
        modelName: this.model,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        anthropicApiKey: apiKey,
        anthropicApiUrl: baseURL || undefined,
        // 启用流式：当 maxTokens 较大时，Anthropic SDK 要求长请求（预估 >10 分钟）必须使用流式，否则报错
        streaming: true
      })
    }

    attachUnifiedInvoke(this.llm, {
      context: this.name,
      provider: isOpenAICompatible ? 'openai-compatible' : 'anthropic',
      model: this.model,
    })
  }

  /**
   * 加载 Prompt 模板
   */
  loadPromptTemplate(templatePath) {
    if (!templatePath) return ''

    try {
      const fullPath = join(__dirname, '../../', templatePath)
      return readFileSync(fullPath, 'utf-8')
    } catch (error) {
      console.warn(`Warning: Could not load prompt template: ${templatePath}`)
      return ''
    }
  }

  /**
   * 加载参考文件
   */
  loadReferenceFiles(filePaths) {
    const references = {}
    const projectRoot = BaseAgent._resolveProjectRoot(__dirname)

    for (const filePath of filePaths) {
      try {
        const fullPath = join(projectRoot, filePath)
        const content = readFileSync(fullPath, 'utf-8')
        references[filePath] = content
      } catch (error) {
        console.warn(`Warning: Could not load reference file: ${filePath}`)
      }
    }

    return references
  }

  /**
   * 🆕 暂停检查：在分块生成间隙调用。
   * 如果 pauseChecker 返回 true（任务状态为 paused），则轮询等待直到恢复（running）或取消（cancelled）。
   * - pauseChecker: async () => 'running' | 'paused' | 'cancelled' | null（null=无任务/不支持的检查）
   * - 返回值: 'running'（继续） | 'cancelled'（中止）
   */
  async _awaitIfPaused(pauseChecker) {
    if (!pauseChecker || typeof pauseChecker !== 'function') return 'running'
    const status = await pauseChecker()
    if (status !== 'paused') return status || 'running'

    logger?.info?.('⏸ 任务已暂停，等待恢复...', {}) || console.log('[pause] ⏸ 任务已暂停，等待恢复...')
    // 轮询等待，每 1.5s 检查一次，超时 30min 自动恢复（防死锁）
    const POLL_INTERVAL = 1500
    const MAX_WAIT = 30 * 60 * 1000
    const start = Date.now()
    while (Date.now() - start < MAX_WAIT) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL))
      const s = await pauseChecker()
      if (s === 'running') {
        logger?.info?.('▶ 任务已恢复，继续生成', {}) || console.log('[pause] ▶ 任务已恢复，继续生成')
        return 'running'
      }
      if (s === 'cancelled') return 'cancelled'
      // s === 'paused' 继续等待
    }
    logger?.warn?.('⏸ 暂停超时(30min)，自动恢复生成', {}) || console.warn('[pause] ⏸ 暂停超时(30min)，自动恢复生成')
    return 'running'
  }

  /**
   * 向上逐级查找包含 references/ 目录的项目根。
   * 兼容从 backend/src 或 backend/dist 运行；旧写法固定上溯层级会解析到 backend/dist/ 导致 references 全部丢失。
   */
  static _resolveProjectRoot(startDir) {
    let dir = startDir
    for (let i = 0; i < 8; i++) {
      if (existsSync(join(dir, 'references'))) {
        return dir
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return join(startDir, '../../')
  }

  /**
   * 构建最终 Prompt
   * 子类可以覆盖此方法来自定义 Prompt 构建逻辑
   */
  buildPrompt(input) {
    let prompt = this.promptTemplate

    // 替换参考文件占位符 {{references/xxx.md}}
    for (const [filePath, content] of Object.entries(this.referenceFiles)) {
      const placeholder = `{{${filePath}}}`
      prompt = prompt.replace(placeholder, content)
    }

    // 替换输入占位符 {{input}}
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input, null, 2)
    prompt = prompt.replace('{{input}}', inputStr)

    return prompt
  }

  /**
   * 调用 LLM
   */
  async invoke(input, config = {}) {
    const startTime = Date.now()

    try {
      // 构建 Prompt
      const prompt = this.buildPrompt(input)

      // 详细日志：输入信息
      this.logger.info(`[${this.name}] 开始调用`, {
        inputSize: JSON.stringify(input).length,
        inputPreview: JSON.stringify(input).substring(0, 200)
      })

      // 详细日志：Prompt信息
      this.logger.debug(`[${this.name}] Prompt构建完成`, {
        promptSize: prompt.length,
        promptPreview: prompt.substring(0, 300)
      })

      // 调用 LLM
      this.logger.info(`[${this.name}] 正在请求AI...`)
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
        }
      })

      // 详细日志：AI响应
      // 处理content可能是数组或字符串的情况
      const contentText = Array.isArray(response.content)
        ? response.content
            .filter(c => !c || (c.type !== 'thinking' && c.type !== 'reasoning'))
            .map(c => typeof c === 'string' ? c : c.text || '')
            .join('')
        : String(response.content || '')

      this.logger.debug(`[${this.name}] AI响应接收`, {
        responseSize: contentText.length,
        responsePreview: contentText.substring(0, 300)
      })

      // 解析输出
      this.logger.info(`[${this.name}] 正在解析响应...`)
      const parsed = this.parseOutput(contentText)

      // 记录历史
      this.recordHistory(input, parsed)

      // 记录日志
      const duration = Date.now() - startTime

      // 🔧 修复：使用 coerceLLMUsage 归一化不同 provider 的 token usage 格式
      // 之前仅读 response.usage?.input_tokens（Anthropic 格式），
      // 导致 OpenAI 兼容模型（Qwen）的 token 统计始终为 0
      const tokenUsage = coerceLLMUsage(response)

      this.logger.info(`[${this.name}] 完成`, {
        duration: `${duration}ms`,
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        totalTokens: tokenUsage.totalTokens
      })

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
            sessionId: config.sessionId || null
          })
        } catch (e) {
          // 静默失败，不影响主流程
        }
      }

      return parsed

    } catch (error) {
      const duration = Date.now() - startTime
      this.logger.error(`[${this.name}] 执行失败`, {
        duration: `${duration}ms`,
        error: error.message,
        stack: error.stack
      })
      throw error
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
        return rawOutput
      }

      // 如果不是字符串，转换为字符串
      if (typeof rawOutput !== 'string') {
        rawOutput = String(rawOutput)
      }

      // 查找 JSON 代码块
      const jsonMatch = rawOutput.match(/```json\n([\s\S]*?)\n```/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1])
      }

      // 尝试直接解析
      return JSON.parse(rawOutput)
    } catch (error) {
      // 如果无法解析，返回原始文本
      return { rawOutput }
    }
  }

  /**
   * 记录历史
   * @private
   */
  recordHistory(input, output) {
    this.history.push({
      timestamp: new Date().toISOString(),
      input,
      output
    })

    // 限制历史记录数量
    if (this.history.length > 100) {
      this.history = this.history.slice(-100)
    }
  }

  /**
   * 更新状态
   */
  updateState(updates) {
    this.state = { ...this.state, ...updates }
    this.logger.debug('状态已更新', { updates })
  }

  /**
   * 获取状态
   */
  getState() {
    return { ...this.state }
  }

  /**
   * 重置状态
   */
  resetState() {
    this.state = {}
    this.logger.debug('状态已重置')
  }

  /**
   * 获取历史记录
   */
  getHistory(limit = 10) {
    return this.history.slice(-limit)
  }

  /**
   * 清空历史记录
   */
  clearHistory() {
    this.history = []
    this.logger.debug('历史已清空')
  }

  /**
   * 注册工具
   */
  registerTool(tool) {
    this.tools.push(tool)
    this.logger.debug('工具已注册', { tool: tool.name })
  }

  /**
   * 调用工具
   */
  async callTool(toolName, params) {
    const tool = this.tools.find(t => t.name === toolName)

    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`)
    }

    this.logger.debug('调用工具', { tool: toolName, params })

    try {
      const result = await tool.execute(params)
      this.logger.debug('工具执行成功', { tool: toolName })
      return result
    } catch (error) {
      this.logger.error('工具执行失败', {
        tool: toolName,
        error: error.message
      })
      throw error
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
      historyCount: this.history.length
    }
  }

  /**
   * 验证输出格式
   * 子类可以覆盖此方法来验证输出是否符合预期格式
   */
  validateOutput(output) {
    return true
  }
}
