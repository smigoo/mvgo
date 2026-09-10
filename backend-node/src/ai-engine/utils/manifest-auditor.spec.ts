/**
 * manifest-auditor.spec.ts — Loop 4 双裁判门禁 TDD
 *
 * 验收（来自 docs/pipeline-loop-234-execution-2026-09-10.md §Loop 4）：
 *  - A) Golden 锁死样本（device/env/traffic）与自身 diff → BLOCK 数 = 0（同构不误杀）
 *  - B) 人为注入错绑（同变量改挂不同 section / 臆造变量 / 结构 bbox 偏移）→ 必 BLOCK（fail-closed）
 *  - C) contracts 制度未启用（working.contracts 为空）→ 不误 BLOCK（宁可漏报不可误杀）
 *
 * Golden 由 figma-golden-extractor 从 fixtures/0907 真实输入侧独立生成，与装配层零代码共享。
 */

import { describe, it, expect, beforeAll } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import {
  extractGoldenManifest,
  hashGolden,
} from './figma-golden-extractor.js'
import {
  diffManifest,
  diffResources,
  diffStructural,
  diffContracts,
  verifyProduct,
  audit,
  auditSelfConsistency,
} from './manifest-auditor.js'

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/0907')
const GOLDEN_DIR = path.resolve(
  '/Users/smigoo/工作/mvgo/docs/golden-manifests',
)

function loadGolden(sample: string): any {
  return JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, `${sample}.json`), 'utf8'))
}
function loadFixture(sample: string, file: string): any {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, sample, file), 'utf8'))
}

describe('Loop 4 manifest-auditor — 验收 A：Golden 锁死样本自身 diff BLOCK=0', () => {
  for (const s of ['device', 'env', 'traffic']) {
    it(`${s}：golden 与自身 diff 不 BLOCK`, () => {
      const golden = loadGolden(s)
      const res = diffManifest(golden, golden)
      expect(res.blocked).toBe(false)
      expect(res.summary.blocked).toBe(0)
    })
  }

  it('device golden 与由 fixture 实时重建的 golden 同构（hash 稳定）', () => {
    const figmaNodeData = loadFixture('device', 'figma-node-data.json')
    const resourceDomMapping = loadFixture('device', 'resource-dom-mapping.json')
    const fresh = extractGoldenManifest({
      figmaNodeData,
      resourceDomMapping,
      meta: { sample: 'device', fileKey: figmaNodeData.fileKey, nodeId: figmaNodeData.nodeId },
    })
    const onDisk = loadGolden('device')
    expect(hashGolden(fresh)).toBe(onDisk.golden.hash)
  })
})

describe('Loop 4 manifest-auditor — 验收 B：人为注入错绑必 BLOCK（fail-closed）', () => {
  it('resource.misbound：同变量改挂不同 section → BLOCK', () => {
    const golden = loadGolden('device')
    const working = JSON.parse(JSON.stringify(golden))
    // 把 icon1 从 slot-con/Group 2136637321 挪到最后一个 section
    const target = working.sectionOrder[working.sectionOrder.length - 1]
    const src = working.sectionOrder[0]
    const idx = working.sections[src].findIndex((m: any) => m.assignedVarName === 'icon1')
    if (idx >= 0) {
      const [m] = working.sections[src].splice(idx, 1)
      m.ownerSectionId = target
      m.ownerBlockId = target
      working.sections[target].push(m)
    }
    const res = diffResources(golden, working)
    expect(res.some((i: any) => i.code === 'resource.misbound' && i.severity === 'BLOCK')).toBe(true)
  })

  it('resource.misbound：Working 臆造 Golden 不存在的变量 → BLOCK', () => {
    const golden = loadGolden('env')
    const working = JSON.parse(JSON.stringify(golden))
    // 注入一个 Golden 没有的变量到某 section（模拟跨样本串绑）
    const sec = working.sectionOrder[0]
    working.sections[sec].push({
      ...working.sections[sec][0],
      assignedVarName: 'icon999',
      semanticVarName: null,
    })
    const res = diffResources(golden, working)
    expect(res.some((i: any) => /icon999/.test(i.id) && i.severity === 'BLOCK')).toBe(true)
  })

  it('structural.shifted：bbox 偏移 >8px / >5% → BLOCK', () => {
    const golden = loadGolden('device')
    const working = JSON.parse(JSON.stringify(golden))
    const struct = (working.golden.structural = working.golden.structural || [])
    if (struct.length > 0) {
      const s0 = struct[0]
      s0.bbox = { ...s0.bbox, x: (s0.bbox?.x ?? 0) + 50, width: (s0.bbox?.width ?? 100) + 50 }
      const res = diffStructural(golden, working)
      expect(res.some((i: any) => i.code === 'structural.shifted' && i.severity === 'BLOCK')).toBe(true)
    } else {
      // device 有 2 个 structural 节点，必然非空；为空则直接放行
      expect(struct.length).toBeGreaterThan(0)
    }
  })
})

describe('Loop 4 manifest-auditor — 验收 C：契约制度未启用不误 BLOCK', () => {
  it('working.contracts 为空 → diffContracts / verifyProduct 不 BLOCK', () => {
    const golden = loadGolden('device')
    const working = JSON.parse(JSON.stringify(golden))
    working.contracts = []
    const c = diffContracts(golden, working)
    expect(c.length).toBe(0)
    const v = verifyProduct(working, { 'package/index.vue': '' })
    expect(v.blocked).toBe(false)
  })

  it('audit(golden, golden, files) 整体不 BLOCK', () => {
    const golden = loadGolden('traffic')
    const res = audit(golden, golden, {})
    expect(res.blocked).toBe(false)
    expect(res.summary.blocked).toBe(0)
  })
})

describe('Loop 4 接入层 — auditSelfConsistency（无 Golden 活流量自洽门禁）', () => {
  it('无 Golden + 契约完整 → 不 BLOCK（避免 audit(null) 把每个资源判臆造）', () => {
    const working = { contracts: [] }
    const files = { 'package/index.vue': `import bg1 from '../resources/images/bg1.png'` }
    const res = auditSelfConsistency(working, files)
    expect(res.blocked).toBe(false)
    expect(res.summary.blocked).toBe(0)
  })

  it('无 Golden + contracts 声明变量但产物未 import → BLOCK（验 CODE-018 确定性探测）', () => {
    const working = {
      contracts: [
        { file: 'package/index.vue', parentMustPass: ['bg1'], blockIds: ['slot-con'] },
      ],
    }
    const files = { 'package/index.vue': '<template><div>no import</div></template>' }
    const res = auditSelfConsistency(working, files)
    expect(res.blocked).toBe(true)
    expect(
      res.issues.some((i: any) => i.code === 'contract.missingPass' && /bg1/.test(i.id)),
    ).toBe(true)
  })
})
