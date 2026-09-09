/**
 * 分块档位分类与 P95 校准（S2 治理单元）
 *
 * 职责：
 * 1. classifyChunkTier: 按 estTokens + segmentType 将分块归类为档位
 * 2. computeCalibratedTimeoutMs: 结合 provider 延迟画像的 P95 校准超时
 *
 * 与 S1 的关系：
 * - S1 (chunk-timeout.js) 提供静态分级超时（无画像时的基线）
 * - S2 在此基础上叠加 P95 动态校准（有画像时覆盖静态值）
 */

import { computeChunkTimeoutMs } from './chunk-timeout.js'

/**
 * 分块档位分类
 *
 * @param {Object} chunk - 分块信息
 * @param {number} [chunk.estTokens] - 预估输出 tokens
 * @param {string} [chunk.segmentType] - 分块类型
 * @returns {'small'|'medium'|'large'|'style'|'component'} 档位标识
 *
 * 分类规则：
 * - segmentType === 'style' → 'style'
 * - segmentType === 'component' → 'component'
 * - estTokens < 1500 → 'small'
 * - 1500 ≤ estTokens < 4000 → 'medium'
 * - estTokens ≥ 4000 → 'large'
 * - 无 estTokens 或 estTokens ≤ 0 → 'small'
 */
export function classifyChunkTier(chunk = {}) {
  const { estTokens, segmentType = '' } = chunk

  // 特殊类型优先判定
  if (segmentType === 'style') return 'style'
  if (segmentType === 'component') return 'component'

  // 按 estTokens 分档
  if (!estTokens || estTokens <= 0) return 'small'
  if (estTokens < 1500) return 'small'
  if (estTokens < 4000) return 'medium'
  return 'large'
}

/**
 * 计算经 P95 校准的分块超时时间
 *
 * @param {Object} chunk - 分块信息（estTokens, segmentType）
 * @param {Function} getLatencyProfile - 获取延迟画像的函数
 *   签名: (providerId?: string) => { p95Ms: number, samples: number } | null
 * @param {Object} [options] - 可选配置
 * @param {string} [options.providerId] - provider ID（用于查询画像）
 * @param {number} [options.safetyFactor=1.3] - P95 安全系数
 * @param {number} [options.maxMs=360000] - 超时上限（默认 6 分钟）
 * @param {number} [options.minSamples=5] - 最小样本数（低于此值回退静态分级）
 * @returns {number} 超时时间（毫秒）
 *
 * 算法：
 * 1. style/component 类型 → 固定 300s（不受 P95 影响）
 * 2. 查询 provider 延迟画像（按档位维度）
 * 3. 有画像且样本 ≥ minSamples → P95 × safetyFactor，夹在 [静态基线, maxMs]
 * 4. 无画像或样本不足 → 回退 S1 静态分级
 */
export function computeCalibratedTimeoutMs(chunk, getLatencyProfile, options = {}) {
  const {
    providerId,
    safetyFactor = 1.3,
    maxMs = 360000,
    minSamples = 5,
  } = options

  // S1 静态基线（作为下限）
  const staticBaselineMs = computeChunkTimeoutMs(chunk)

  // style/component 类型固定 300s，不参与 P95 校准
  const tier = classifyChunkTier(chunk)
  if (tier === 'style' || tier === 'component') {
    return staticBaselineMs
  }

  // 查询延迟画像
  if (typeof getLatencyProfile !== 'function') {
    return staticBaselineMs
  }

  const profile = getLatencyProfile(providerId, tier)
  if (!profile || !profile.p95Ms || !Number.isFinite(profile.p95Ms)) {
    return staticBaselineMs
  }

  // 样本不足 → 回退静态分级
  if (profile.samples < minSamples) {
    return staticBaselineMs
  }

  // P95 × safetyFactor，夹在 [静态基线, maxMs]
  const calibratedMs = Math.round(profile.p95Ms * safetyFactor)
  return Math.min(maxMs, Math.max(staticBaselineMs, calibratedMs))
}
