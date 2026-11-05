/**
 * 样式精修师
 * 负责精修 CSS 样式，确保与 Figma 像素级对齐
 */

import { BaseAgent } from '../base-agent.js'

export class StyleRefiner extends BaseAgent {
  constructor(config) {
    super(config)
  }

  /**
   * 解析输出
   * 验证输出格式是否符合要求
   */
  parseOutput(rawOutput) {
    const output = super.parseOutput(rawOutput)

    // 验证必填字段
    if (!output.refinedCSS) {
      throw new Error('输出缺少 refinedCSS 字段')
    }
    if (!output.changes) {
      throw new Error('输出缺少 changes 字段')
    }
    if (!output.evidenceChain) {
      throw new Error('输出缺少 evidenceChain 字段（证据链）')
    }
    if (output.confidence === undefined) {
      throw new Error('输出缺少 confidence 字段')
    }

    // 验证证据链
    for (const change of output.changes) {
      if (!change.source) {
        throw new Error(`变更缺少 source 字段: ${change.property}`)
      }
    }

    return output
  }

  /**
   * 构建输入
   * 准备传递给 Prompt 的数据
   */
  buildInput(state) {
    return {
      figmaNode: state.figmaNode,
      figmaStyles: state.figmaStyles,
      currentVueCode: state.vueCode || '',
      currentCSSRules: this.extractCurrentCSSRules(state.vueCode || '')
    }
  }

  /**
   * 提取当前 Vue 代码中的 CSS 规则
   */
  extractCurrentCSSRules(vueCode) {
    const rules = {}

    // 简单的 CSS 提取（实际可能需要更复杂的解析）
    const styleMatch = vueCode.match(/<style[^>]*>([\s\S]*?)<\/style>/)
    if (styleMatch) {
      const cssCode = styleMatch[1]

      // 提取选择器和规则（简化版）
      const ruleMatches = cssCode.matchAll(/([.#\w-]+)\s*{([^}]+)}/g)
      for (const match of ruleMatches) {
        const selector = match[1].trim()
        const declarations = match[2].trim()

        const properties = {}
        const declarationMatches = declarations.matchAll(/([^:]+):\s*([^;]+);?/g)
        for (const declMatch of declarationMatches) {
          const property = declMatch[1].trim()
          const value = declMatch[2].trim()
          properties[property] = value
        }

        rules[selector] = properties
      }
    }

    return rules
  }

  /**
   * 调用智能体
   */
  async invoke(state, config = {}) {
    // 构建输入
    const input = this.buildInput(state)

    // 调用基类的 invoke
    const output = await super.invoke(input, config)

    // 返回更新后的状态
    return {
      ...state,
      styleRefinement: output
    }
  }
}
