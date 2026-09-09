/**
 * VisualComparator Node 适配器
 * 将 VisualComparator（compare 接口）包装为标准 BaseAgent 节点，
 * 供 dynamic-workflow-graph 调度（execute(state) 契约）。
 */

import { BaseAgent } from '../agents/base-agent.js'
import { createLogger } from '../logger/index.js'
import { VisualComparator } from './visual-comparator.js'

const logger = createLogger({ name: 'visual-comparator-node' })

export class VisualComparatorNode extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'visual-comparator',
      description: '截图 vs Figma 预览图视觉比对，输出相似度与差异报告',
      model: config.model || 'gpt-4o',
      temperature: 0,
      maxTokens: 4096,
      ...config,
    })
    this.comparator = new VisualComparator(config)
  }

  async execute(params) {
    const {
      figmaImagePath,
      renderedImagePath,
      screenshotResult,
      previewImagePath,
      onProgress = null,
    } = params

    const figma = figmaImagePath || previewImagePath
    const rendered = renderedImagePath || screenshotResult?.screenshotPath

    if (!figma || !rendered) {
      logger.warn('视觉比对缺少图片路径，跳过（不阻断管线）', { figma, rendered })
      return { comparisonResult: { skipped: true, reason: 'missing-image-paths' } }
    }

    onProgress?.({
      stage: 'visual-comparator',
      message: '🔍 视觉比对中...',
      status: 'running',
    })

    try {
      const report = await this.comparator.compare(figma, rendered)
      logger.info('视觉比对完成', { similarity: report?.similarity })
      return { comparisonResult: report || {} }
    } catch (e) {
      logger.warn(`视觉比对失败（不阻断管线）: ${e.message}`)
      return { comparisonResult: { error: e.message, skipped: true } }
    }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}
