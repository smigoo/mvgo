/**
 * ScreenshotRenderer Node 适配器
 * 将函数式导出的 screenshot-renderer 包装为标准 BaseAgent 节点，
 * 供 dynamic-workflow-graph 调度（execute(state) 契约）。
 */

import { BaseAgent } from '../agents/base-agent.js'
import { createLogger } from '../logger/index.js'
import { renderScreenshot } from './screenshot-renderer.js'

const logger = createLogger({ name: 'screenshot-renderer-node' })

export class ScreenshotRendererNode extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'screenshot-renderer',
      description: '渲染组件截图（puppeteer），输出截图路径与 issueCount',
      model: config.model || 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 1024,
      skipLLM: true, // 纯 puppeteer 渲染，无 LLM 依赖
      ...config,
    })
  }

  async execute(params) {
    const {
      componentName,
      outputPath,
      target = 'microcode',
      onProgress = null,
      sessionId,
      groupId,
    } = params

    onProgress?.({
      stage: 'screenshot-renderer',
      message: '📸 渲染组件截图...',
      status: 'running',
    })

    try {
      const result = await renderScreenshot({
        componentName,
        sessionId,
        groupId,
        target,
        outputPath,
      })
      logger.info('截图渲染完成', { screenshotPath: result?.screenshotPath })
      return {
        screenshotResult: result || {},
        screenshotPath: result?.screenshotPath || null,
      }
    } catch (e) {
      logger.warn(`截图渲染失败（不阻断管线）: ${e.message}`)
      return { screenshotResult: { error: e.message }, screenshotPath: null }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}
