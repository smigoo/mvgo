/**
 * chunk-timeout 单元测试（S1 治理单元）
 *
 * 覆盖 computeChunkTimeoutMs 的分级超时逻辑：
 * - 小分块（estTokens < 1500）→ 90s
 * - 中分块（1500 ≤ estTokens < 4000）→ 180s
 * - 大分块（estTokens ≥ 4000）→ 300s
 * - style/component 分块 → 300s（无论 estTokens）
 * - 无 estTokens 时回退到默认 180s
 */

import { computeChunkTimeoutMs } from './chunk-timeout.js'

// jest.mock 处理 import.meta 依赖
jest.mock('../../config/backend-root.js', () => ({ workspaceRoot: process.cwd(), logsDir: '/tmp/mvgo-test-logs' }), { virtual: true })

describe('computeChunkTimeoutMs — S1 分级超时', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('按 estTokens 分级', () => {
    it('小分块（estTokens < 1500）应返回 90s', () => {
      expect(computeChunkTimeoutMs({ estTokens: 800, segmentType: 'script' })).toBe(90000)
      expect(computeChunkTimeoutMs({ estTokens: 100, segmentType: 'template' })).toBe(90000)
      expect(computeChunkTimeoutMs({ estTokens: 1499, segmentType: 'script' })).toBe(90000)
    })

    it('中分块（1500 ≤ estTokens < 4000）应返回 180s', () => {
      expect(computeChunkTimeoutMs({ estTokens: 1500, segmentType: 'script' })).toBe(180000)
      expect(computeChunkTimeoutMs({ estTokens: 2500, segmentType: 'script' })).toBe(180000)
      expect(computeChunkTimeoutMs({ estTokens: 3999, segmentType: 'template' })).toBe(180000)
    })

    it('大分块（estTokens ≥ 4000）应返回 300s', () => {
      expect(computeChunkTimeoutMs({ estTokens: 4000, segmentType: 'script' })).toBe(300000)
      expect(computeChunkTimeoutMs({ estTokens: 6000, segmentType: 'script' })).toBe(300000)
      expect(computeChunkTimeoutMs({ estTokens: 10000, segmentType: 'template' })).toBe(300000)
    })
  })

  describe('特殊分块类型（style/component）', () => {
    it('style 分块应始终返回 300s（无论 estTokens）', () => {
      expect(computeChunkTimeoutMs({ estTokens: 500, segmentType: 'style' })).toBe(300000)
      expect(computeChunkTimeoutMs({ estTokens: 0, segmentType: 'style' })).toBe(300000)
      expect(computeChunkTimeoutMs({ segmentType: 'style' })).toBe(300000)
    })

    it('component 分块应始终返回 300s（无论 estTokens）', () => {
      expect(computeChunkTimeoutMs({ estTokens: 500, segmentType: 'component' })).toBe(300000)
      expect(computeChunkTimeoutMs({ estTokens: 0, segmentType: 'component' })).toBe(300000)
      expect(computeChunkTimeoutMs({ segmentType: 'component' })).toBe(300000)
    })
  })

  describe('边界情况', () => {
    it('无 estTokens 时应回退到默认 180s', () => {
      expect(computeChunkTimeoutMs({ segmentType: 'script' })).toBe(180000)
      expect(computeChunkTimeoutMs({ estTokens: 0, segmentType: 'script' })).toBe(180000)
      expect(computeChunkTimeoutMs({ estTokens: -1, segmentType: 'script' })).toBe(180000)
    })

    it('无 segmentType 时应按 estTokens 分级', () => {
      expect(computeChunkTimeoutMs({ estTokens: 800 })).toBe(90000)
      expect(computeChunkTimeoutMs({ estTokens: 2500 })).toBe(180000)
      expect(computeChunkTimeoutMs({ estTokens: 5000 })).toBe(300000)
    })

    it('空输入应返回默认 180s', () => {
      expect(computeChunkTimeoutMs({})).toBe(180000)
      expect(computeChunkTimeoutMs()).toBe(180000)
    })
  })

  describe('环境变量覆盖', () => {
    it('ENGINEER_CHUNK_TIMEOUT_MS 应覆盖默认值', () => {
      process.env.ENGINEER_CHUNK_TIMEOUT_MS = '120000'
      // 重新导入以获取新 env
      jest.resetModules()
      const { computeChunkTimeoutMs: freshFn } = require('./chunk-timeout.js')
      expect(freshFn({ segmentType: 'script' })).toBe(120000)
    })

    it('STYLE_CHUNK_TIMEOUT_MS 应覆盖 style 分块超时', () => {
      process.env.STYLE_CHUNK_TIMEOUT_MS = '240000'
      jest.resetModules()
      const { computeChunkTimeoutMs: freshFn } = require('./chunk-timeout.js')
      expect(freshFn({ segmentType: 'style' })).toBe(240000)
    })

    it('SUBCOMPONENT_CHUNK_TIMEOUT_MS 应覆盖 component 分块超时', () => {
      process.env.SUBCOMPONENT_CHUNK_TIMEOUT_MS = '360000'
      jest.resetModules()
      const { computeChunkTimeoutMs: freshFn } = require('./chunk-timeout.js')
      expect(freshFn({ segmentType: 'component' })).toBe(360000)
    })
  })
})
