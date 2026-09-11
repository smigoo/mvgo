/**
 * 生成错误人话翻译（S1 体验优化）。
 *
 * 把后端抛出的技术错误（如「Vision first-token timeout after 60000ms」）翻译成
 * 用户能看懂、且带「下一步动作」的友好提示，注入到进度流/任务 error，避免前端
 * 直接展示晦涩的裸错误码。
 *
 * 纯函数、零依赖、无副作用；未命中的错误原样返回（不吞掉技术细节，调试仍可见）。
 */

/**
 * @param {string|Error|object|null|undefined} message 原始错误信息
 * @returns {string} 友好提示（未命中映射时返回原 message）
 */
export function humanizeGenerationError(message) {
  const m = String(message || '').trim()
  if (!m) return '生成失败，请重试'

  // 视觉模型超时 / 首 token 超时 / provider 挂起（慢模型首 token 60~97s 或额度不足）
  if (/first-token|首.?token|provider 挂起|无输出|响应超时/.test(m)) {
    return '视觉模型响应超时（可能额度不足或网络抖动）。已切换备用模型，或建议稍后重试'
  }
  // 节点/阶段执行超时
  if (/节点执行超时|执行超时|600000|node.*timeout|总超时/i.test(m)) {
    return '该组件较复杂，分析耗时超过上限。建议换更快的模型，或稍后重试'
  }
  // max_tokens 截断
  if (/截断|max_tokens|maxTokens|超出.*上限/.test(m)) {
    return '组件内容较多，超出单次生成上限。建议换上下文更长的模型重试'
  }
  // 语义不完整 / 自由变量拦截
  if (/语义不完整|自由变量|拒绝产出坏文件|未声明/.test(m)) {
    return '模型生成代码存在缺陷（引用了未定义变量），系统已自动重试修正'
  }
  // 🛡️ 低覆盖率 fail-closed（2026-09-11 治本）：必须先于「臆造/盲生成」分支匹配。
  // 原逻辑把 low-coverage 也归入 /臆造/ → 页面显示「视觉识别未完成，重试会复用设计稿缓存」，
  // 与真实原因（覆盖率不足，且重试是 bypassCache 重新识图）不符，误导用户以为视觉模型没跑完。
  // 治本：带出真实 coverageRate，并说明重试会重新识别而非复用缓存。
  const lowCov = m.match(/(?:low-coverage|覆盖率严重不足)[^0-9]*(\d+)\s*%/i) || m.match(/覆盖率严重不足\s*\((\d+)%\)/)
  if (/low-coverage|覆盖率严重不足/.test(m)) {
    const pct = lowCov ? lowCov[1] : null
    return pct
      ? `视觉分析覆盖率仅 ${pct}%（低于 35% 阈值），已中止以免盲写。重试会重新识别设计稿（不复用缓存），必要时请简化设计稿或换视觉模型`
      : '视觉分析覆盖率不足，已中止以免盲写。重试会重新识别设计稿（不复用缓存）'
  }
  // 视觉分析降级阻断（盲生成保护）
  if (/视觉分析失败或降级|盲生成|臆造/.test(m)) {
    return '视觉识别未完成，为避免盲生成已中止。重试会重新识别设计稿，更快完成'
  }
  // 额度耗尽 / 限流
  if (/429|quota|额度|rate.?limit|exhausted|余额不足/i.test(m)) {
    return '模型额度已用尽或触发限流。建议稍后重试，或切换其他模型'
  }
  // 代码质量门禁
  if (/FLEX-\d|CODE-\d|LESS-COMPILE|结构校验|质量门禁/.test(m)) {
    return '生成代码未通过质量检查，系统已自动重试修正'
  }

  // 默认：原样返回，保留技术细节供调试
  return m
}

export default humanizeGenerationError
