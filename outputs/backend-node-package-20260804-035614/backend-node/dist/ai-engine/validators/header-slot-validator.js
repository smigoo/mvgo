/**
 * 头部插槽验证器
 * 基于Figma节点Y坐标验证头部插槽，避免硬编码关键词判断
 */

import { createLogger } from '../logger/index.js'

const logger = createLogger({ name: 'header-slot-validator' })

/**
 * 头部插槽验证器
 */
export class HeaderSlotValidator {
  constructor(figmaConnector) {
    this.figmaConnector = figmaConnector
  }

  /**
   * 基于Figma节点坐标验证头部插槽
   * @param {Object} figmaNodeData - Figma节点树
   * @param {Array} headerSlotsFromPreview - 预览图分析的插槽候选
   * @param {Object} options - 配置选项
   * @param {string} options.componentType - 组件类型: 'microcode' | 'vue3'，默认 'microcode'
   * @returns {Object} 验证结果
   */
  validateHeaderSlots(figmaNodeData, headerSlotsFromPreview = [], options = {}) {
    const componentType = options.componentType || 'microcode'

    const result = {
      validatedSlots: [],
      rejectedNodes: [],
      warnings: [],
      componentType
    }

    // Vue3 组件：不做插槽验证（Vue3 没有 base-panel 插槽），
    // 只做同行节点检测（确保标题栏控件不被遗漏）
    if (componentType === 'vue3') {
      logger.info('Vue3 组件: 跳过微码插槽验证，仅检测标题栏控件完整性')
      return this._validateVue3HeaderControls(figmaNodeData, headerSlotsFromPreview, options, result)
    }

    // 微码组件：完整的插槽验证流程
    // 步骤1：定位标题节点
    const titleNode = this.figmaConnector.findPanelTitleNode(figmaNodeData)
    if (!titleNode) {
      result.warnings.push('未找到面板标题节点')
      logger.warn('未找到面板标题节点，跳过头部插槽验证')
      return result
    }

    logger.info(`找到标题节点: "${titleNode.name}"`)

    // 继续验证逻辑...
    return this._performValidation(figmaNodeData, titleNode, headerSlotsFromPreview, options, result)
  }

  /**
   * Vue3 专属：验证标题栏控件完整性（不检查插槽，只确保控件不被遗漏）
   * @private
   */
  _validateVue3HeaderControls(figmaNodeData, headerSlotsFromPreview, options, result) {
    // 步骤1：定位标题节点
    const titleNode = this.figmaConnector.findPanelTitleNode(figmaNodeData)
    if (!titleNode) {
      result.warnings.push('未找到面板标题节点')
      logger.info('Vue3: 未找到标题节点，跳过控件完整性检查')
      return result
    }

    logger.info(`Vue3: 找到标题节点: "${titleNode.name}"`)

    // 步骤2：获取header容器和动态计算阈值
    const headerContainer = this.figmaConnector.findHeaderContainer(figmaNodeData)
    const headerHeight = headerContainer?.absoluteBoundingBox?.height || 40
    const THRESHOLD_RATIO = options.thresholdRatio || 0.3
    const SAME_ROW_THRESHOLD = Math.round(headerHeight * THRESHOLD_RATIO)

    // 步骤3：计算标题baseline和同行范围
    const bbox = titleNode.absoluteBoundingBox
    const titleBaseline = bbox.y + bbox.height / 2
    const sameRowRange = {
      min: titleBaseline - SAME_ROW_THRESHOLD,
      max: titleBaseline + SAME_ROW_THRESHOLD
    }

    // 步骤4：筛选同行节点
    const sameRowNodes = this._findSameRowNodes(figmaNodeData, titleNode, titleBaseline, sameRowRange)
    logger.info(`Vue3: 找到 ${sameRowNodes.length} 个标题栏同行节点`)

    // 步骤5：检测是否有控件在预览分析中被遗漏
    this._checkVue3ControlCompleteness(sameRowNodes, headerSlotsFromPreview, result)

    return result
  }

  /**
   * Vue3 专属：检查标题栏控件是否完整（不遗漏）
   * @private
   */
  _checkVue3ControlCompleteness(sameRowNodes, headerSlotsFromPreview, result) {
    // 对每个同行节点，检查是否在预览分析的 headerSlots 中有对应
    // Vue3 中这些控件应该渲染为真实 DOM，不需要放入插槽
    sameRowNodes.forEach(({ node, yOffset }) => {
      const nodeName = node.name?.toLowerCase() || ''
      
      // 判断这个节点是否是重要的控件（按钮、Tab、统计指标等）
      const isImportantControl = 
        node.type === 'COMPONENT' || 
        node.type === 'INSTANCE' ||
        nodeName.includes('button') ||
        nodeName.includes('tab') ||
        nodeName.includes('icon') ||
        nodeName.includes('switch') ||
        (node.type === 'TEXT' && /\d+/.test(node.characters || ''))

      if (isImportantControl) {
        // 检查是否在预览分析中被识别
        const matchedInPreview = headerSlotsFromPreview?.some(slot => 
          slot.controlType && (
            slot.controlType.includes('Tab') ||
            slot.controlType.includes('统计') ||
            slot.controlType.includes('图标')
          )
        )

        if (!matchedInPreview) {
          result.warnings.push(
            `Vue3: Figma 标题栏发现控件"${node.name}" (Y偏移: ${yOffset.toFixed(1)}px)，请确保在 <template> 中渲染为真实 DOM`
          )
        }
      }
    })
  }

  /**
   * 执行验证逻辑
   * @private
   */
  _performValidation(figmaNodeData, titleNode, headerSlotsFromPreview, options, result) {
    // 步骤2：获取header容器和动态计算阈值
    const headerContainer = this.figmaConnector.findHeaderContainer(figmaNodeData)
    const headerHeight = headerContainer?.absoluteBoundingBox?.height || 40
    const THRESHOLD_RATIO = options.thresholdRatio || 0.3
    const SAME_ROW_THRESHOLD = Math.round(headerHeight * THRESHOLD_RATIO)

    logger.info(`Header高度: ${headerHeight}px, Y坐标阈值: ±${SAME_ROW_THRESHOLD}px`)

    // 步骤3：计算标题baseline和同行范围
    const bbox = titleNode.absoluteBoundingBox
    const titleBaseline = bbox.y + bbox.height / 2
    const sameRowRange = {
      min: titleBaseline - SAME_ROW_THRESHOLD,
      max: titleBaseline + SAME_ROW_THRESHOLD
    }

    logger.info(`标题baseline: ${titleBaseline.toFixed(1)}px, 同行范围: [${sameRowRange.min.toFixed(1)}, ${sameRowRange.max.toFixed(1)}]`)

    // 步骤4：筛选同行节点
    const sameRowNodes = this._findSameRowNodes(figmaNodeData, titleNode, titleBaseline, sameRowRange)

    logger.info(`找到${sameRowNodes.length}个同行节点`)

    // 步骤5：匹配预览图插槽候选
    this._matchSlotCandidates(sameRowNodes, headerSlotsFromPreview, result)

    // 步骤6：检测未匹配的同行节点
    this._checkUnmatchedNodes(sameRowNodes, result)

    return result
  }

  /**
   * 查找与标题同行的节点
   * @private
   */
  _findSameRowNodes(figmaNodeData, titleNode, titleBaseline, sameRowRange) {
    const sameRowNodes = []

    this.figmaConnector.traverseFigmaTree(figmaNodeData, (node) => {
      // 跳过标题自身
      if (node.id === titleNode.id) return

      const bbox = node.absoluteBoundingBox
      if (!bbox || !bbox.y || !bbox.height) return

      const nodeBaseline = bbox.y + bbox.height / 2
      const yOffset = Math.abs(nodeBaseline - titleBaseline)

      // 判断是否在同行范围内
      if (nodeBaseline >= sameRowRange.min && nodeBaseline <= sameRowRange.max) {
        // 只收集可能是插槽控件的节点
        if (this.figmaConnector.isLikelySlotControl(node)) {
          sameRowNodes.push({
            node,
            yOffset,
            baseline: nodeBaseline
          })
          logger.debug(`同行节点: "${node.name}" (Y偏移: ${yOffset.toFixed(1)}px)`)
        }
      }
    })

    return sameRowNodes
  }

  /**
   * 匹配预览图插槽候选与Figma节点
   * @private
   */
  _matchSlotCandidates(sameRowNodes, headerSlotsFromPreview, result) {
    if (!headerSlotsFromPreview || headerSlotsFromPreview.length === 0) {
      logger.info('预览图未检测到插槽候选')
      return
    }

    headerSlotsFromPreview.forEach(slotCandidate => {
      const matchedNode = this._findBestMatchNode(sameRowNodes, slotCandidate)

      if (matchedNode) {
        result.validatedSlots.push({
          slotType: slotCandidate.slotType,
          controlType: slotCandidate.controlType,
          figmaNode: matchedNode.node,
          yOffset: matchedNode.yOffset,
          validated: true
        })
        logger.info(`✅ 匹配成功: ${slotCandidate.controlType} → "${matchedNode.node.name}"`)
      } else {
        result.warnings.push(
          `预览图检测到${slotCandidate.controlType}，但Figma中未找到同行节点`
        )
        logger.warn(`⚠️ 未匹配: ${slotCandidate.controlType}`)
      }
    })
  }

  /**
   * 根据插槽候选找到最佳匹配的Figma节点
   * @private
   */
  _findBestMatchNode(sameRowNodes, slotCandidate) {
    const controlType = slotCandidate.controlType

    // 根据控件类型筛选候选节点
    const candidates = sameRowNodes.filter(({ node }) => {
      const name = node.name?.toLowerCase() || ''
      const nodeType = node.type

      if (controlType === '统计指标') {
        // 统计指标：TEXT节点且包含数字
        return nodeType === 'TEXT' && /\d+/.test(node.characters || '')
      }
      if (controlType === 'Tab切换') {
        // Tab切换：名称包含tab/switch/segmented
        return name.includes('tab') || name.includes('switch') || name.includes('segmented')
      }
      if (controlType === '图标操作') {
        // 图标操作：COMPONENT/INSTANCE或名称包含icon
        return nodeType === 'COMPONENT' || nodeType === 'INSTANCE' || name.includes('icon')
      }
      if (controlType === '辅助文字') {
        // 辅助文字：小号TEXT节点
        return nodeType === 'TEXT' && (node.style?.fontSize || 14) <= 14
      }

      return false
    })

    if (candidates.length === 0) return null

    // 返回Y坐标偏移最小的
    return candidates.sort((a, b) => a.yOffset - b.yOffset)[0]
  }

  /**
   * 检查预览图未发现但Figma中存在的同行节点
   * @private
   */
  _checkUnmatchedNodes(sameRowNodes, result) {
    sameRowNodes.forEach(({ node, yOffset }) => {
      const alreadyMatched = result.validatedSlots.some(
        slot => slot.figmaNode.id === node.id
      )

      if (!alreadyMatched) {
        result.warnings.push(
          `Figma中发现同行节点"${node.name}" (Y偏移: ${yOffset.toFixed(1)}px)，但预览图未检测到，请人工确认`
        )
        logger.warn(`⚠️ Figma中发现未匹配的同行节点: "${node.name}"`)
      }
    })
  }
}
