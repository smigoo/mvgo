/**
 * Batch Orchestrator — 页面级组件批量调度器
 * 支持串行和并行两种执行模式，concurrency 可配置
 *
 * 核心流程：
 * 1. PageDecomposer 拆解页面 → 组件列表
 * 2. 根据执行模式（serial/parallel）逐个/分批调用现有 Phase2 管线
 * 3. 收集所有结果，推送进度到前端
 */

import { createLogger } from '../logger/index.js'
import { findCpComponents } from './page-decomposer.js'

const logger = createLogger({ name: 'batch-orchestrator' })

export class BatchOrchestrator {
  constructor(options = {}) {
    this.progressManager = options.progressManager
    this.sessionId = options.sessionId    // 页面级 sessionId
    this.figmaConnector = options.figmaConnector  // FigmaConnector 实例
    this.phase2Service = options.phase2Service     // Phase2Service 或 McGenWorkflow
    this.concurrency = options.concurrency || 2
    this.executionMode = options.executionMode || 'parallel'
  }

  /**
   * 页面级生成入口
   * @param {string} fileKey - Figma file key
   * @param {string} nodeId - 页面级 node-id
   * @param {string} groupId - 群组 ID
   * @param {Object} config - 生成配置（模型、API key 等）
   * @returns {Promise<Array>} 每个组件的生成结果
   */
  async generate(fileKey, nodeId, groupId, config = {}) {
    // Step 1: 获取页面节点树
    this.sendProgress('页面分析', '正在获取页面节点树...', 'running')

    let nodeTree
    try {
      nodeTree = await this.figmaConnector.fetchNodeData(fileKey, nodeId)
      // fetchNodeData 已返回 document 本体（非 { document: ... } 结构）
      if (!nodeTree) {
        throw new Error('Figma API 返回数据为空')
      }
    } catch (error) {
      logger.error(`❌ 获取页面节点树失败: ${error.message}`)
      this.sendProgress('页面分析', `获取页面节点树失败: ${error.message}`, 'failed')
      throw error
    }

    // Step 2: 识别 cp-xxx 组件
    this.sendProgress('页面分析', '正在识别 cp-xxx 组件...', 'running')
    const components = findCpComponents(nodeTree)

    if (components.length === 0) {
      const msg = '页面中未发现任何 cp-xxx 组件，请确保 Figma 中使用了 cp- 前缀命名'
      logger.warn(msg)
      this.sendProgress('页面分析', msg, 'completed')
      return []
    }

    // 输出组件列表到进度日志
    const componentList = components.map(c => `${c.figmaNodeName} (${c.folderName})`).join('\n  ')
    logger.info(`📋 页面分析完成: 发现 ${components.length} 个组件:\n  ${componentList}`)
    this.sendProgress('页面分析', `发现 ${components.length} 个组件: ${components.map(c => c.figmaNodeName).join(', ')}`, 'completed')

    // Step 3: 根据执行模式选择调度策略
    if (this.executionMode === 'serial') {
      return this.serialGenerate(components, fileKey, groupId, config)
    } else {
      return this.parallelGenerate(components, fileKey, groupId, config)
    }
  }

  /**
   * 串行生成：逐个执行，每个完成后再开始下一个
   */
  async serialGenerate(components, fileKey, groupId, config) {
    logger.info(`🔄 串行模式: 逐个生成 ${components.length} 个组件`)
    this.sendProgress('调度启动', `串行模式: 共 ${components.length} 个组件`, 'running')

    const results = []

    for (let i = 0; i < components.length; i++) {
      const comp = components[i]
      this.sendProgress(
        `${comp.figmaNodeName}`,
        `开始生成 (${i + 1}/${components.length})`,
        'running'
      )

      try {
        const result = await this.runSingleComponent(fileKey, comp, groupId, config)
        results.push({ component: comp.figmaNodeName, ...comp, success: true, ...result })
        logger.info(`✅ [${comp.figmaNodeName}] 生成完成 (${i + 1}/${components.length})`)
        this.sendProgress(
          `${comp.figmaNodeName}`,
          `✅ 生成完成 (${i + 1}/${components.length})`,
          'completed'
        )
      } catch (error) {
        results.push({ component: comp.figmaNodeName, ...comp, success: false, error: error.message })
        logger.error(`❌ [${comp.figmaNodeName}] 生成失败: ${error.message}`)
        this.sendProgress(
          `${comp.figmaNodeName}`,
          `❌ 生成失败: ${error.message}`,
          'failed'
        )
        // 串行模式下，某个组件失败不影响后续组件继续生成
      }
    }

    const successCount = results.filter(r => r.success).length
    this.sendProgress('全部完成', `${successCount}/${components.length} 个组件生成成功`, 'completed')
    logger.info(`📊 页面生成汇总: ${successCount}/${components.length} 成功`)

    return results
  }

  /**
   * 并行生成：分批并行，每批 concurrency 个
   */
  async parallelGenerate(components, fileKey, groupId, config) {
    const concurrency = Math.min(this.concurrency, components.length)

    // concurrency <= 1 时等价于串行
    if (concurrency <= 1) {
      return this.serialGenerate(components, fileKey, groupId, config)
    }

    logger.info(`🚀 并行模式: concurrency=${concurrency}, 共 ${components.length} 个组件`)
    this.sendProgress('调度启动', `并行模式: concurrency=${concurrency}, 共 ${components.length} 个组件`, 'running')

    const results = []

    // concurrency >= 组件数时全量并行
    if (concurrency >= components.length) {
      const allResults = await Promise.allSettled(
        components.map(comp => this.runSingleComponent(fileKey, comp, groupId, config))
      )

      for (let i = 0; i < allResults.length; i++) {
        const comp = components[i]
        const r = allResults[i]
        if (r.status === 'fulfilled') {
          results.push({ component: comp.figmaNodeName, ...comp, success: true, ...r.value })
          this.sendProgress(`${comp.figmaNodeName}`, '✅ 生成完成', 'completed')
        } else {
          results.push({ component: comp.figmaNodeName, ...comp, success: false, error: r.reason?.message })
          this.sendProgress(`${comp.figmaNodeName}`, `❌ 生成失败: ${r.reason?.message}`, 'failed')
        }
      }
    } else {
      // 分批并行
      for (let i = 0; i < components.length; i += concurrency) {
        const batch = components.slice(i, i + concurrency)
        const batchNum = Math.floor(i / concurrency) + 1
        const totalBatches = Math.ceil(components.length / concurrency)

        logger.info(`🚀 执行第 ${batchNum}/${totalBatches} 批 (${batch.length} 个组件)`)
        this.sendProgress(
          '批次调度',
          `第 ${batchNum}/${totalBatches} 批: ${batch.map(c => c.figmaNodeName).join(', ')}`,
          'running'
        )

        const batchResults = await Promise.allSettled(
          batch.map(comp => this.runSingleComponent(fileKey, comp, groupId, config))
        )

        for (let j = 0; j < batchResults.length; j++) {
          const comp = batch[j]
          const r = batchResults[j]
          if (r.status === 'fulfilled') {
            results.push({ component: comp.figmaNodeName, ...comp, success: true, ...r.value })
            logger.info(`✅ [${comp.figmaNodeName}] 生成完成`)
            this.sendProgress(`${comp.figmaNodeName}`, '✅ 生成完成', 'completed')
          } else {
            results.push({ component: comp.figmaNodeName, ...comp, success: false, error: r.reason?.message })
            logger.error(`❌ [${comp.figmaNodeName}] 生成失败: ${r.reason?.message}`)
            this.sendProgress(`${comp.figmaNodeName}`, `❌ 生成失败: ${r.reason?.message}`, 'failed')
          }
        }
      }
    }

    const successCount = results.filter(r => r.success).length
    this.sendProgress('全部完成', `${successCount}/${components.length} 个组件生成成功`, 'completed')
    logger.info(`📊 页面生成汇总: ${successCount}/${components.length} 成功`)

    return results
  }

  /**
   * 调用现有 Phase2 管线生成单个组件
   * 这是关键桥接点——复用已有的单组件生成流程，不做任何修改
   */
  async runSingleComponent(fileKey, comp, groupId, config) {
    const nodeId = this.normalizeNodeId(comp.figmaNodeId)

    //A6修复：page-decomposer 返回字段为 componentName/folderName（没有 name 字段），
    // 此前 comp.name 恒为 undefined → 所有子组件 sessionId/componentId 相同
    // （page-<pageSession>-undefined），并行时输出目录互相覆盖、预览图/缓存互相污染。
    // 统一优先 comp.name，缺失时用 figmaNodeId 派生 ASCII 唯一键（2:7879 → 2-7879）。
    const compKey = comp.name || String(comp.figmaNodeId || nodeId).replace(/:/g, '-')

    // 构造和单组件生成完全一致的请求参数
    const singleDto = {
      fileKey,
      nodeId,
      groupId,
      componentName: comp.folderName,  // c-guanxia
      componentId: compKey,             // guanxia（缺失时回退节点键 2-7879）
      panelType: comp.panelKey || 'aio-panel',
      target: comp.target || config.target || 'microcode',
      config,
    }

    logger.info(`🔄 [${comp.figmaNodeName}] 启动 Phase2 管线: nodeId=${nodeId}, componentName=${comp.folderName}, compKey=${compKey}`)

    // 子组件 sessionId（与 page-generator.service.ts 中 createTask 的 sessionId 一致）
    const childSessionId = `page-${this.sessionId}-${compKey}`

    // 调用 Phase2Service 的生成方法
    if (this.phase2Service && typeof this.phase2Service.startGeneration === 'function') {
      // NestJS 环境下，Phase2Service 会异步执行并推送 SSE 进度
      // 这里需要等待实际完成，而不是仅仅启动任务
      const result = await this.phase2Service.startGenerationAndWait(
        childSessionId,
        singleDto,
        groupId
      )
      // 显式返回任务号与业务组件号，父任务和前端无需再从前缀推断
      return {
        ...result,
        childSessionId,
        taskId: childSessionId,
        componentId: childSessionId,
        groupId,
        target: singleDto.target,
      }
    }

    // 直接调用 McGenWorkflow（非 NestJS 环境）
    if (this.phase2Service && typeof this.phase2Service.execute === 'function') {
      const result = await this.phase2Service.execute(singleDto)
      return {
        ...result,
        childSessionId,
        taskId: childSessionId,
        componentId: childSessionId,
        groupId,
        target: singleDto.target,
      }
    }

    throw new Error('phase2Service 未提供有效的生成方法')
  }

  /**
   * Figma nodeId 格式转换（URL 中的 '2-8417' → API 用的 '2:8417'）
   */
  normalizeNodeId(nodeId) {
    if (!nodeId) return nodeId
    return nodeId.replace(/-/g, ':')
  }

  /**
   * 推送进度到前端
   */
  sendProgress(stage, message, status) {
    if (this.progressManager && this.sessionId) {
      this.progressManager.sendProgress(this.sessionId, {
        type: 'progress',
        stage,
        message,
        status,
        timestamp: Date.now(),
      })
    }
    logger.info(`📊 进度推送: ${stage} - ${message}`, { status })
  }
}
