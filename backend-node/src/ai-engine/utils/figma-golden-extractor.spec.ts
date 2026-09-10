/**
 * figma-golden-extractor.spec.ts — Loop 4 接入层 TDD
 *
 * 验收（来自 docs/pipeline-loop-234-execution-2026-09-10.md §Loop 4）：
 *  - 从输入侧（Figma 树 + 资源下载结果）独立生成与 Working Manifest 同构 JSON
 *    （含 sections / resources / contracts 结构，供 graph 注入 this.goldenManifest）。
 *  - 与装配层零代码共享：不 import engineer / mounter / parser。
 *  - 输出含 hash（锁样指纹，CI/重建任务可按 hash 比对回归）。
 */

import { describe, it, expect } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { extractGoldenManifest, hashGolden, GOLDEN_VERSION } from './figma-golden-extractor.js'

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/0907')

function loadFixture(sample: string, file: string): any {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, sample, file), 'utf8'))
}

describe('Loop 4 figma-golden-extractor — 接入层同构产出', () => {
  it('device：产出 sections/resources 同构结构并带 hash', () => {
    const figmaNodeData = loadFixture('device', 'figma-node-data.json')
    const resourceDomMapping = loadFixture('device', 'resource-dom-mapping.json')
    const g = extractGoldenManifest({
      figmaNodeData,
      resourceDomMapping,
      meta: { sample: 'device', fileKey: figmaNodeData.fileKey, nodeId: figmaNodeData.nodeId },
    })
    expect(g.version).toBe('wm-1')
    expect(g.sections).toBeDefined()
    expect(typeof g.sections).toBe('object')
    expect(g.resources).toBeDefined()
    expect(Array.isArray(g.resources)).toBe(true)
    expect(g.golden.goldenVersion).toBe(GOLDEN_VERSION)
    expect(GOLDEN_VERSION).toBe('g-1')
    expect(typeof g.golden.hash).toBe('string')
    // hash 稳定（同输入两次一致）
    const g2 = extractGoldenManifest({
      figmaNodeData,
      resourceDomMapping,
      meta: { sample: 'device' },
    })
    expect(g2.golden.hash).toBe(g.golden.hash)
  })

  it('env：纯树派生 100% 命中（provenance.treeHits>0）', () => {
    const figmaNodeData = loadFixture('env', 'figma-node-data.json')
    const resourceDomMapping = loadFixture('env', 'resource-dom-mapping.json')
    const g = extractGoldenManifest({ figmaNodeData, resourceDomMapping, meta: { sample: 'env' } })
    expect(g.golden.provenance.treeIndexed).toBe(true)
    expect(g.golden.provenance.treeHits).toBeGreaterThan(0)
  })

  it('hashGolden 对同一 JSON 稳定', () => {
    const a = { x: 1, y: [2, 3], z: 'ok' }
    expect(hashGolden(a)).toBe(hashGolden(JSON.parse(JSON.stringify(a))))
  })
})
