/**
 * 🧠 思考模式烧光的升级判定与文案（2026-09-30 第一批 · 纯函数，无副作用）。
 *
 * 背景（mc-max TabsSection 实锤）：deepseek/deepseek-v4.1-flash 经中转关思考参数被静默忽略
 * → 推理烧光输出预算 → 空内容 → 熔断 120s → 重试同 provider（池内无备用）→ ×3 耗尽，
 * 任务 9.2 分钟里 8 分钟是无效等待。
 *
 * 本模块承载两个可单测的纯判定：
 *  - assessBurnoutEscalation(count)：第 1 次烧光 → 'notice'（归因提示）；≥2 → 'escalate'（建议立即换模型）
 *  - buildBreakerExhaustedMessage(...)：熔断冷却等待超过一次且无可用备用时的 fail-fast 文案
 */

/**
 * @param {number} count 同任务同模型的烧光累计次数（1-based）
 * @returns {'notice'|'escalate'}
 */
export function assessBurnoutEscalation(count) {
  const n = Number(count) || 0
  return n <= 1 ? 'notice' : 'escalate'
}

/**
 * 熔断耗尽 fail-fast 文案。要求带「建议切换模型」——没有建议名单时也要说清下一步动作。
 * @param {{model: string, cooldownWaits: number, suggestions?: string[]}} p
 */
export function buildBreakerExhaustedMessage({ model, cooldownWaits, suggestions = [] } = {}) {
  const m = model || '未知模型'
  const waits = Number(cooldownWaits) || 0
  const tip = suggestions.length ? `（可用：${suggestions.join(' / ')}）` : '（池内暂无其它可用 provider，可在模型配置中增加备用）'
  return (
    `模型 ${m} 已连续熔断 ${waits} 次，且等待冷却后仍不可用、池内无可用备用 —— 已停止重试以避免无效等待。` +
    `建议切换非思考模型后重新生成${tip}`
  )
}
