/**
 * Vision Agent - 图像分析智能体
 * 支持 Anthropic Claude 和 OpenAI 兼容的 API（如通义千问）
 */

import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage } from '@langchain/core/messages'
import { readFileSync } from 'fs'
import axios from 'axios'
import sharp from 'sharp'
import { createLogger } from '../logger/index.js'
import { getMaxTokens, coerceLLMUsage, coerceLLMText } from '../utils/model-config.js'
import { VISION_DEFAULTS } from '../utils/ai-defaults.js'
import { attachUnifiedInvoke, executeModelRequest } from '../utils/ai-request-gateway.js'

const logger = createLogger({ name: 'vision-agent' })

export class VisionAgent {
  constructor(config = {}) {
    this.model = config.model || process.env.VISION_MODEL || process.env.ANTHROPIC_MODEL || VISION_DEFAULTS.model
    this.temperature = config.temperature || 0
    this.maxTokens = getMaxTokens(this.model, config.maxTokens || 4096)
    this.apiKey = config.apiKey || process.env.VISION_API_KEY || process.env.ANTHROPIC_API_KEY || VISION_DEFAULTS.apiKey
    this.baseURL = config.baseURL || process.env.VISION_BASE_URL || process.env.ANTHROPIC_BASE_URL || VISION_DEFAULTS.baseURL

    // Token 用量记录钩子（由外部注入，非阻塞）
    this.onTokenUsage = config.onTokenUsage || null

    // 🔍 调试日志：显示实际读取到的配置
    logger.info('🔍 VisionAgent 配置', {
      model: this.model,
      baseURL: this.baseURL,
      apiKeyPrefix: this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'undefined',
      hasBaseURL: !!this.baseURL,
      envBaseURL: process.env.ANTHROPIC_BASE_URL
    })

    if (!this.apiKey) {
      throw new Error('API Key is required')
    }

    // 判断使用哪种 API
    this.isOpenAICompatible = this.baseURL &&
      (this.baseURL.includes('dashscope.aliyuncs.com') ||
       this.baseURL.includes('openai.com'))

    logger.info('🔍 API 类型判断', {
      isOpenAICompatible: this.isOpenAICompatible,
      baseURLCheck: this.baseURL
    })

    if (!this.isOpenAICompatible) {
      // 使用 Anthropic Claude API
      logger.info('使用 Anthropic Claude API', { model: this.model })
      const llmConfig = {
        modelName: this.model,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        anthropicApiKey: this.apiKey,
        streaming: true,
      }

      if (this.baseURL) {
        llmConfig.anthropicApiUrl = this.baseURL
      }

      this.llm = new ChatAnthropic(llmConfig)
      attachUnifiedInvoke(this.llm, {
        context: 'vision-agent',
        provider: 'anthropic',
        model: this.model,
      })
    } else {
      logger.info('使用 OpenAI 兼容 API (通义千问)', {
        baseURL: this.baseURL,
        model: this.model
      })
    }
  }

  /**
   * 调用 OpenAI 兼容的 API（通义千问）
   * @private
   * @returns {{ content: string, usage: object }} 返回内容和 token 用量
   */
  async callOpenAICompatibleAPI(messages, options = {}) {
    const response = await executeModelRequest({
      context: options.context || 'vision-agent',
      provider: 'openai-compatible',
      model: this.model,
      signal: options.signal,
      onProgress: options.onProgress,
      requestConcurrency: options.requestConcurrency,
      requestQueueTimeoutMs: options.requestQueueTimeoutMs,
      requestTimeoutMs: options.requestTimeoutMs,
      requestMaxRetries: options.requestMaxRetries,
      operation: ({ signal }) => axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: this.model,
          messages,
          temperature: this.temperature,
          max_tokens: this.maxTokens
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          signal,
        }
      ),
    })

    return {
      content: coerceLLMText(response.data.choices[0].message.content),
      usage: response.data.usage || {}
    }
  }

  /**
   * 分析图片
   */
  async analyzeImage(imagePath, prompt, options = {}) {
    const startTime = Date.now()
    logger.info('🔍 开始分析图片', { imagePath })

    try {
      // 读取图片
      const readStart = Date.now()
      const imageBuffer = readFileSync(imagePath)
      const readDuration = Date.now() - readStart
      const originalSize = (imageBuffer.length / 1024).toFixed(2)
      logger.info(`📖 图片读取完成 (${readDuration}ms)`, {
        size: `${originalSize}KB`
      })

      // 🗜️ 压缩图片（优化 API 调用速度）
      const compressStart = Date.now()
      const compressedBuffer = await sharp(imageBuffer)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer()
      const compressDuration = Date.now() - compressStart
      const compressedSize = (compressedBuffer.length / 1024).toFixed(2)
      const compressionRatio = ((1 - compressedBuffer.length / imageBuffer.length) * 100).toFixed(1)
      logger.info(`🗜️ 图片压缩完成 (${compressDuration}ms)`, {
        originalSize: `${originalSize}KB`,
        compressedSize: `${compressedSize}KB`,
        compressionRatio: `${compressionRatio}%`
      })

      // 转换为 base64
      const encodeStart = Date.now()
      const base64Image = compressedBuffer.toString('base64')
      const encodeDuration = Date.now() - encodeStart
      logger.info(`🔐 Base64编码完成 (${encodeDuration}ms)`, {
        base64Size: `${(base64Image.length / 1024).toFixed(2)}KB`
      })

      const imageFormat = this.detectImageFormat(imagePath)

      if (this.isOpenAICompatible) {
        // 使用 OpenAI 格式调用通义千问
        const messages = [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/${imageFormat};base64,${base64Image}`
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]

        logger.info('🚀 开始调用 Vision API...', {
          model: this.model,
          baseURL: this.baseURL,
          timeout: '120s'
        })
        const apiStart = Date.now()

        const { content: result, usage: rawUsage } = await this.callOpenAICompatibleAPI(messages, {
          context: 'vision-agent.analyzeImage',
          signal: options.signal,
          onProgress: options.onProgress || this.onProgress,
          requestConcurrency: options.requestConcurrency,
          requestTimeoutMs: options.requestTimeoutMs,
          requestMaxRetries: options.requestMaxRetries,
        })

        const apiDuration = Date.now() - apiStart
        const totalDuration = Date.now() - startTime

        // 🔧 修复：提取并记录 token 用量（之前 callOpenAICompatibleAPI 丢弃了 usage 数据）
        const tokenUsage = coerceLLMUsage({ usage: rawUsage })
        logger.info(`✅ 图片分析完成 (API: ${apiDuration}ms, 总计: ${totalDuration}ms)`, {
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          totalTokens: tokenUsage.totalTokens
        })

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
              timestamp: new Date().toISOString()
            })
          } catch (e) {
            // 静默失败
          }
        }

        return result
      } else {
        // 使用 Anthropic Claude API
        const message = new HumanMessage({
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/${imageFormat};base64,${base64Image}`
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        })

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
        })
        const totalDuration = Date.now() - startTime

        // 提取并记录 token 用量
        const tokenUsage = coerceLLMUsage(response)
        logger.info('✅ 图片分析完成 (Claude)', {
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          totalTokens: tokenUsage.totalTokens
        })

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
              timestamp: new Date().toISOString()
            })
          } catch (e) {
            // 静默失败
          }
        }

        return response.content
      }
    } catch (error) {
      logger.error('图片分析失败', { error: error.message })
      throw error
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

请直接返回 JSON。`

    const result = await this.analyzeImage(imagePath, prompt)

    try {
      // 尝试解析 JSON
      let jsonStr = result.trim()

      // 如果结果被包裹在代码块中，提取出来
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1]
      }

      const parsed = JSON.parse(jsonStr)

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
          sections: parsed.layout?.sections || []
        },
        styles: {
          theme: parsed.styles?.theme || '未知',
          colors: parsed.styles?.colors || [],
          background: parsed.styles?.background || '',
          decorations: parsed.styles?.decorations || [],
          emphasis: parsed.styles?.emphasis || [],
          backgroundBrightness: parsed.styles?.backgroundBrightness || 'dark'
        },
        interactions: parsed.interactions || [],
        charts: parsed.charts || []
      }
    } catch (error) {
      logger.error('解析预览图分析结果失败', { error: error.message, result: result?.substring(0, 500) })
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
          sections: []
        },
        styles: {
          theme: '未知',
          colors: [],
          background: '',
          decorations: [],
          emphasis: [],
          backgroundBrightness: 'dark'
        },
        interactions: [],
        charts: []
      }
    }
  }

  /**
   * 检测图片格式
   */
  detectImageFormat(imagePath) {
    const ext = imagePath.split('.').pop().toLowerCase()
    const formatMap = {
      'jpg': 'jpeg',
      'jpeg': 'jpeg',
      'png': 'png',
      'gif': 'gif',
      'webp': 'webp'
    }
    return formatMap[ext] || 'jpeg'
  }

  /**
   * 比对两张图片（视觉差异分析）
   * @param {string} image1Path - 第一张图片路径（通常是 Figma 原图）
   * @param {string} image2Path - 第二张图片路径（通常是渲染截图）
   * @param {string} prompt - 比对提示词
   * @returns {Promise<string>} AI 返回的比对结果（JSON 字符串）
   */
  async compareImages(image1Path, image2Path, prompt, options = {}) {
    const startTime = Date.now()
    logger.info('开始比对图片', { image1: image1Path, image2: image2Path })

    try {
      // 压缩两张图片
      const [buf1, buf2] = await Promise.all([
        sharp(readFileSync(image1Path)).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer(),
        sharp(readFileSync(image2Path)).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer(),
      ])

      const base64_1 = buf1.toString('base64')
      const base64_2 = buf2.toString('base64')
      const format1 = this.detectImageFormat(image1Path)
      const format2 = this.detectImageFormat(image2Path)

      if (this.isOpenAICompatible) {
        // OpenAI 兼容 API（通义千问）
        const messages = [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/${format1};base64,${base64_1}` } },
            { type: 'image_url', image_url: { url: `data:image/${format2};base64,${base64_2}` } },
          ]
        }]
        const { content: result, usage: rawUsage } = await this.callOpenAICompatibleAPI(messages, {
          context: 'vision-agent.compareImages',
          signal: options.signal,
          onProgress: options.onProgress || this.onProgress,
          requestConcurrency: options.requestConcurrency,
          requestTimeoutMs: options.requestTimeoutMs,
          requestMaxRetries: options.requestMaxRetries,
        })
        const tokenUsage = coerceLLMUsage({ usage: rawUsage })
        if (this.onTokenUsage && tokenUsage.totalTokens > 0) {
          try { this.onTokenUsage({ nodeName: 'visual-comparator', model: this.model, modelType: 'vision', inputTokens: tokenUsage.inputTokens, outputTokens: tokenUsage.outputTokens, totalTokens: tokenUsage.totalTokens, duration: Date.now() - startTime, timestamp: new Date().toISOString() }) } catch (e) {}
        }
        logger.info(`图片比对完成 (${Date.now() - startTime}ms)`, { totalTokens: tokenUsage.totalTokens })
        return result
      } else {
        // Anthropic Claude API
        const message = new HumanMessage({
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/${format1};base64,${base64_1}` } },
            { type: 'image_url', image_url: { url: `data:image/${format2};base64,${base64_2}` } },
          ]
        })
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
        })
        const tokenUsage = coerceLLMUsage(response)
        if (this.onTokenUsage && tokenUsage.totalTokens > 0) {
          try { this.onTokenUsage({ nodeName: 'visual-comparator', model: this.model, modelType: 'vision', inputTokens: tokenUsage.inputTokens, outputTokens: tokenUsage.outputTokens, totalTokens: tokenUsage.totalTokens, duration: Date.now() - startTime, timestamp: new Date().toISOString() }) } catch (e) {}
        }
        logger.info(`图片比对完成 (Claude, ${Date.now() - startTime}ms)`, { totalTokens: tokenUsage.totalTokens })
        return response.content
      }
    } catch (error) {
      logger.error('图片比对失败', { error: error.message })
      throw error
    }
  }
}
