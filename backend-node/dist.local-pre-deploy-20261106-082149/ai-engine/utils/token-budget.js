/**
 * Token 预算管控与熔断
 * 在 Graph 执行过程中累积 Token 用量，达到阈值时触发警告或降级
 */

import { estimateCost } from './model-pricing.js'

export class TokenBudget {
  /**
   * @param {object} config
   * @param {number} config.budget - Token 预算上限
   * @param {number} config.warningThreshold - 警告阈值 (0-1)
   * @param {function|null} config.onWarning - 警告回调
   * @param {function|null} config.onExceeded - 超限回调
   */
  constructor(config = {}) {
    this.budget = config.budget || parseInt(process.env.TOKEN_BUDGET || '50000', 10)
    this.warningThreshold = config.warningThreshold || parseFloat(process.env.BUDGET_WARNING_THRESHOLD || '0.8')
    this.warningLimit = Math.floor(this.budget * this.warningThreshold)
    this.onWarning = config.onWarning || null
    this.onExceeded = config.onExceeded || null

    this.used = 0
    this.estimatedCost = 0
    this._warningFired = false
    this._exceededFired = false

    // 记录每个节点的用量
    this.nodeBreakdown = new Map()
  }

  /**
   * 累积 Token 用量并检查预算
   * @param {number} tokens - 本次消耗的 token 数
   * @param {string} nodeName - 节点名（可选）
   * @param {string} model - 模型名（可选，用于成本估算）
   * @param {{ inputTokens: number, outputTokens: number }} breakdown - 输入输出明细（可选）
   * @returns {{ used: number, budget: number, remaining: number, usagePercent: number, warning: boolean, exceeded: boolean, estimatedCost: number }}
   */
  track(tokens, nodeName = '', model = '', breakdown = null) {
    this.used += tokens

    // 按节点累计
    if (nodeName) {
      const existing = this.nodeBreakdown.get(nodeName) || 0
      this.nodeBreakdown.set(nodeName, existing + tokens)
    }

    // 成本估算
    if (model && breakdown) {
      this.estimatedCost += estimateCost(model, breakdown.inputTokens || 0, breakdown.outputTokens || 0)
    }

    const status = this.getStatus()

    // 触发警告（仅一次）
    if (status.warning && !this._warningFired) {
      this._warningFired = true
      if (this.onWarning) {
        try {
          this.onWarning(status)
        } catch (e) {
          // 静默失败
        }
      }
    }

    // 触发超限（仅一次）
    if (status.exceeded && !this._exceededFired) {
      this._exceededFired = true
      if (this.onExceeded) {
        try {
          this.onExceeded(status)
        } catch (e) {
          // 静默失败
        }
      }
    }

    return status
  }

  /**
   * 获取当前预算状态
   */
  getStatus() {
    return {
      used: this.used,
      budget: this.budget,
      remaining: Math.max(0, this.budget - this.used),
      usagePercent: this.budget > 0 ? +((this.used / this.budget) * 100).toFixed(1) : 0,
      warning: this.used >= this.warningLimit,
      exceeded: this.used > this.budget,
      warningThreshold: this.warningThreshold,
      estimatedCost: +this.estimatedCost.toFixed(4),
    }
  }

  /**
   * 获取按节点的 Token 用量分布
   */
  getNodeBreakdown() {
    return Object.fromEntries(this.nodeBreakdown)
  }
}

export default TokenBudget
