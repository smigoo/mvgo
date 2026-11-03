/**
 * 模型推荐功能测试
 */

import { describe, it, expect } from '@jest/globals'
import { buildModelSuggestion, isModelSufficientForComplexity } from '../model-suggestion.js'
import { markModelCapabilityIdentified } from '../model-config.js'

describe('模型推荐功能', () => {
  describe('buildModelSuggestion', () => {
    it('当前模型能力充足时，不推荐升级', () => {
      const result = buildModelSuggestion(6000, 'qwen-max')
      expect(result.needUpgrade).toBe(false)
      expect(result.currentLimit).toBe(32768)
    })

    it('组件复杂度超出低输出模型能力时，推荐升级到中输出模型', () => {
      const result = buildModelSuggestion(12000, 'qwen-plus')
      expect(result.needUpgrade).toBe(true)
      expect(result.currentLimit).toBe(8192)
      expect(result.recommendedTier).toBe('mid')
      expect(result.tierInfo.outputLimit).toBe(16384)
    })

    it('组件复杂度超出中输出模型能力时，推荐升级到高输出模型', () => {
      const result = buildModelSuggestion(20000, 'gpt-4o')
      expect(result.needUpgrade).toBe(true)
      expect(result.currentLimit).toBe(16384)
      expect(result.recommendedTier).toBe('high')
      expect(result.tierInfo.outputLimit).toBe(32768)
    })

    it('超大组件需要高输出模型', () => {
      const result = buildModelSuggestion(28000, 'qwen-plus')
      expect(result.needUpgrade).toBe(true)
      expect(result.recommendedTier).toBe('high')
      expect(result.message).toContain('高输出模型')
    })

    it('生成的友好提示包含关键信息', () => {
      const result = buildModelSuggestion(12000, 'qwen-plus')
      expect(result.message).toContain('预估输出')
      expect(result.message).toContain('模型上限')
      expect(result.message).toContain('建议方案')
      expect(result.message).toContain('升级模型')
    })

    it('内置表模型超限 → 已识别且上限可知（允许硬报错）', () => {
      const result = buildModelSuggestion(20000, 'qwen-plus')
      expect(result.needUpgrade).toBe(true)
      expect(result.identified).toBe(true)
      expect(result.limitKnown).toBe(true)
      expect(result.capabilitySource).toBe('table')
    })

    it('未知模型（不在能力表且未实测）超限 → 未识别、上限未知（上游应提示去测试而非硬报错）', () => {
      const result = buildModelSuggestion(20000, 'totally-unknown-model-xyz-12345')
      expect(result.needUpgrade).toBe(true)
      expect(result.identified).toBe(false)
      expect(result.limitKnown).toBe(false)
      expect(result.capabilitySource).toBe('fallback')
    })

    it('未知模型实测连通后（未确认具体上限）→ 已识别但上限仍未知（不视为可硬报错）', () => {
      markModelCapabilityIdentified('totally-unknown-model-xyz-12345', { source: 'test' })
      const result = buildModelSuggestion(20000, 'totally-unknown-model-xyz-12345')
      expect(result.needUpgrade).toBe(true)
      expect(result.identified).toBe(true)
      expect(result.limitKnown).toBe(false)
      expect(result.capabilitySource).toBe('test-unknown-limit')
    })

    it('未知模型实测并确认输出上限 → 已识别且上限可知（允许基于真实上限硬报错）', () => {
      markModelCapabilityIdentified('totally-unknown-model-xyz-12345', { source: 'test', outputTokens: 32768 })
      const result = buildModelSuggestion(20000, 'totally-unknown-model-xyz-12345')
      expect(result.needUpgrade).toBe(true)
      expect(result.identified).toBe(true)
      expect(result.limitKnown).toBe(true)
      expect(result.capabilitySource).toBe('test')
      expect(result.currentLimit).toBe(32768)
    })
  })

  describe('isModelSufficientForComplexity', () => {
    it('低复杂度组件，低输出模型充足', () => {
      expect(isModelSufficientForComplexity(5000, 'qwen-plus')).toBe(true)
    })

    it('中复杂度组件，低输出模型不足', () => {
      expect(isModelSufficientForComplexity(10000, 'qwen-plus')).toBe(false)
    })

    it('高复杂度组件，中输出模型不足', () => {
      expect(isModelSufficientForComplexity(20000, 'gpt-4o')).toBe(false)
    })

    it('考虑10%安全边际', () => {
      // qwen-plus 上限 8192，安全阈值 8192 * 0.9 = 7372.8
      expect(isModelSufficientForComplexity(7300, 'qwen-plus')).toBe(true)
      expect(isModelSufficientForComplexity(7400, 'qwen-plus')).toBe(false)
    })
  })
})
