/**
 * TierProfile - 档位配置值对象
 *
 * 把散落在 engineer / env 的档位相关配置（轻量模型、阈值、并发、token 上限）
 * 收敛成一个一等公民对象，由 GenerationContext 携带，让 engineer 从 ctx 读取
 * 而非直接读 process.env，从而：
 *   - 加新档位只改 resolve() 一处
 *   - 测试时可直接注入 mock profile，不依赖 env
 *   - 消除 "LLM_LITE_MODEL / ENGINEER_LITE_TOKEN_THRESHOLD / SUBCOMP_CONCURRENCY" 散读
 *
 * 注意：模型分级路由（小块走轻量模型）与业务档位（lite/max）是正交的——
 * 当前系统只要配了 LLM_LITE_MODEL，任意档位的小块都会路由到轻量模型。
 * 本类保留这一正交语义，不按 tier 强制开关。
 */

export class TierProfile {
  /**
   * @param {Object} params
   * @param {'max'|'lite'|'dev'|'pro'} params.tier - 生成档位
   * @param {string|null} params.liteModel - 轻量模型名（LLM_LITE_MODEL），null 表示不路由
   * @param {number} params.liteTokenThreshold - 预估 token 低于此值才走轻量模型（下限 500）
   * @param {number} params.subcompConcurrency - 子组件并行生成并发度
   * @param {number} params.maxTokens - 单 chunk 模型输出上限
   */
  constructor({ tier, liteModel = null, liteTokenThreshold = 4000, subcompConcurrency = 3, maxTokens = 16000 }) {
    this.tier = tier
    this.liteModel = liteModel
    this.liteTokenThreshold = liteTokenThreshold
    this.subcompConcurrency = subcompConcurrency
    this.maxTokens = maxTokens
  }

  /**
   * 从 env 解析某档位的 Profile（fail-safe，任何 env 缺失/非法都不抛错）
   * @param {'max'|'lite'|'dev'|'pro'} tier
   * @returns {TierProfile}
   */
  static resolve(tier) {
    const liteModel = process.env.LLM_LITE_MODEL || null
    const liteTokenThreshold = Math.max(500, parseInt(process.env.ENGINEER_LITE_TOKEN_THRESHOLD || '4000') || 4000)
    const subcompConcurrency = parseInt(process.env.SUBCOMP_CONCURRENCY || '3') || 3
    return new TierProfile({
      tier,
      liteModel,
      liteTokenThreshold,
      subcompConcurrency,
      maxTokens: 16000
    })
  }

  /**
   * 是否配置了轻量模型（业务层判定，与具体 chunk 无关）
   */
  get hasLiteModel() {
    return !!this.liteModel
  }

  /**
   * 某 chunk 是否应使用轻量模型（与现有 useLite 逻辑字节级等价：
   * liteModel 存在 + estTokens>0 + estTokens<阈值 + attempt===1）
   * @param {number} estTokens - 预估输出 token 数
   * @param {number} attempt - 当前重试次数（从 1 开始）
   */
  shouldUseLite(estTokens, attempt = 1) {
    return this.hasLiteModel && estTokens > 0 && estTokens < this.liteTokenThreshold && attempt === 1
  }

  /**
   * 获取档位标签（用于日志/调试）
   */
  getTierLabel() {
    const labels = { max: 'Max', lite: 'Lite', dev: 'Dev', pro: 'Pro' }
    return labels[this.tier] || this.tier
  }
}
