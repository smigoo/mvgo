/**
 * SubcomponentPlanner Node 适配器
 * 将 SubcomponentPlanner（plan 接口，纯确定性）包装为标准 BaseAgent 节点，
 * 供 dynamic-workflow-graph 调度（execute(state) 契约）。
 */

import { BaseAgent } from '../agents/base-agent.js'
import { createLogger } from '../logger/index.js'
import { SubcomponentPlanner } from './subcomponent-planner.js'

const logger = createLogger({ name: 'subcomponent-planner-node' })

export class SubcomponentPlannerNode extends BaseAgent {
  constructor(config = {}) {
    super({
      name: 'subcomponent-planner',
      description: '基于 layoutStructure 规划子组件清单（纯确定性，无 LLM）',
      model: config.model || 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 1024,
      skipLLM: true,
      ...config,
    })
    this.planner = new SubcomponentPlanner()
  }

  async execute(params) {
    const { layoutStructure, target = 'microcode', onProgress = null } = params

    if (!layoutStructure) {
      logger.warn('缺少 layoutStructure，子组件规划跳过')
      return { subcomponentPlan: { effectiveSections: [], isForced: false, reason: 'missing-layout-structure' } }
    }

    onProgress?.({
      stage: 'subcomponent-planner',
      message: '🧩 规划子组件清单...',
      status: 'running',
    })

    const plan = this.planner.plan(layoutStructure, {
      skipPanelHeaderFilter: target === 'vue3',
    })
    logger.info('子组件规划完成', { count: plan.effectiveSections?.length, reason: plan.reason })
    return { subcomponentPlan: plan }
  }

  parseOutput(rawOutput) {
    return rawOutput
  }
}
