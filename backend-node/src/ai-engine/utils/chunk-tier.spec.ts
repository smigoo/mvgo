/**
 * chunk-tier 单元测试（S2 治理单元）
 *
 * 覆盖：
 * - classifyChunkTier(): 按 estTokens + segmentType 分档
 * - computeCalibratedTimeoutMs(): P95 校准超时（有画像时覆盖静态分级）
 */

import { classifyChunkTier, computeCalibratedTimeoutMs } from './chunk-tier.js'

jest.mock('../../config/backend-root.js', () => ({ workspaceRoot: process.cwd(), logsDir: '/tmp/mvgo-test-logs' }), { virtual: true })

describe('classifyChunkTier — S2 分块档位分类', () => {
  describe('segmentType 优先', () => {
    it('style 类型始终返回 tier=style', () => {
      expect(classifyChunkTier({ estTokens: 500, segmentType: 'style' })).toBe('style')
      expect(classifyChunkTier({ estTokens: 10000, segmentType: 'style' })).toBe('style')
    })

    it('component 类型始终返回 tier=component', () => {
      expect(classifyChunkTier({ estTokens: 200, segmentType: 'component' })).toBe('component')
      expect(classifyChunkTier({ estTokens: 8000, segmentType: 'component' })).toBe('component')
    })
  })

  describe('按 estTokens 分档', () => {
    it('estTokens < 1500 → small', () => {
      expect(classifyChunkTier({ estTokens: 0, segmentType: 'script' })).toBe('small')
      expect(classifyChunkTier({ estTokens: 800, segmentType: 'script' })).toBe('small')
      expect(classifyChunkTier({ estTokens: 1499, segmentType: 'template' })).toBe('small')
    })

    it('1500 ≤ estTokens < 4000 → medium', () => {
      expect(classifyChunkTier({ estTokens: 1500, segmentType: 'script' })).toBe('medium')
      expect(classifyChunkTier({ estTokens: 2500, segmentType: 'script' })).toBe('medium')
      expect(classifyChunkTier({ estTokens: 3999, segmentType: 'template' })).toBe('medium')
    })

    it('estTokens ≥ 4000 → large', () => {
      expect(classifyChunkTier({ estTokens: 4000, segmentType: 'script' })).toBe('large')
      expect(classifyChunkTier({ estTokens: 6000, segmentType: 'script' })).toBe('large')
      expect(classifyChunkTier({ estTokens: 10000, segmentType: 'template' })).toBe('large')
    })
  })

  describe('边界情况', () => {
    it('无 estTokens 且无 segmentType → small', () => {
      expect(classifyChunkTier({})).toBe('small')
      expect(classifyChunkTier()).toBe('small')
    })

    it('负 estTokens → small', () => {
      expect(classifyChunkTier({ estTokens: -100, segmentType: 'script' })).toBe('small')
    })
  })
})

describe('computeCalibratedTimeoutMs — S2 P95 校准', () => {
  const mockGetLatencyProfile = jest.fn()

  beforeEach(() => {
    mockGetLatencyProfile.mockReset()
  })

  describe('无画像样本 → 回退静态分级', () => {
    it('小分块无画像 → 90s', () => {
      mockGetLatencyProfile.mockReturnValue(null)
      const result = computeCalibratedTimeoutMs(
        { estTokens: 800, segmentType: 'script' },
        mockGetLatencyProfile,
      )
      expect(result).toBe(90000)
    })

    it('大分块无画像 → 300s', () => {
      mockGetLatencyProfile.mockReturnValue(null)
      const result = computeCalibratedTimeoutMs(
        { estTokens: 5000, segmentType: 'script' },
        mockGetLatencyProfile,
      )
      expect(result).toBe(300000)
    })
  })

  describe('有画像样本 → P95 × safetyFactor 校准', () => {
    it('P95=160s × 1.3 = 208s，高于静态基线 180s → 208000ms', () => {
      mockGetLatencyProfile.mockReturnValue({ p95Ms: 160000, samples: 20 })
      const result = computeCalibratedTimeoutMs(
        { estTokens: 2500, segmentType: 'script' },
        mockGetLatencyProfile,
      )
      expect(result).toBe(208000)
    })

    it('P95=50s × 1.3 = 65s，低于静态档位 90s → 取 90s（不低于静态基线）', () => {
      mockGetLatencyProfile.mockReturnValue({ p95Ms: 50000, samples: 20 })
      const result = computeCalibratedTimeoutMs(
        { estTokens: 800, segmentType: 'script' },
        mockGetLatencyProfile,
      )
      // calibrated = 65000, but static baseline for small = 90000, so max(90000, 65000) = 90000
      expect(result).toBe(90000)
    })

    it('P95=300s × 1.3 = 390s，超过 maxMs=360s → 夹到 360000ms', () => {
      mockGetLatencyProfile.mockReturnValue({ p95Ms: 300000, samples: 20 })
      const result = computeCalibratedTimeoutMs(
        { estTokens: 5000, segmentType: 'script' },
        mockGetLatencyProfile,
        { maxMs: 360000 },
      )
      expect(result).toBe(360000)
    })

    it('样本不足（<5）→ 回退静态分级', () => {
      mockGetLatencyProfile.mockReturnValue({ p95Ms: 200000, samples: 3 })
      const result = computeCalibratedTimeoutMs(
        { estTokens: 2500, segmentType: 'script' },
        mockGetLatencyProfile,
      )
      expect(result).toBe(180000) // medium static fallback
    })
  })

  describe('style/component 类型不受 P95 影响', () => {
    it('style 有画像仍返回 300s', () => {
      mockGetLatencyProfile.mockReturnValue({ p95Ms: 60000, samples: 20 })
      const result = computeCalibratedTimeoutMs(
        { estTokens: 500, segmentType: 'style' },
        mockGetLatencyProfile,
      )
      expect(result).toBe(300000)
    })

    it('component 有画像仍返回 300s', () => {
      mockGetLatencyProfile.mockReturnValue({ p95Ms: 60000, samples: 20 })
      const result = computeCalibratedTimeoutMs(
        { estTokens: 500, segmentType: 'component' },
        mockGetLatencyProfile,
      )
      expect(result).toBe(300000)
    })
  })
})
