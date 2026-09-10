/**
 * Loop 2.0.E：buildContracts 必须在子组件 LLM 调用**之前**算完，
 * 且契约结构完整（file / blockIds / resourceProps / parentMustPass）。
 * 本 spec 钉死纯函数行为；调用顺序由 microcode-engineer.js 内
 * `buildContracts` 出现在 `workers.push(worker())` 之前的 grep 保证。
 */
import { buildContracts, buildResourceManifest } from './resource-manifest.js'

describe('Loop 2.0.E buildContracts 契约结构', () => {
  const manifest = buildResourceManifest([
    { assignedVarName: 'icon1', downloadStatus: 'success', figmaPath: 'cp-A/slot-流量/t1' },
    { assignedVarName: 'bg2', downloadStatus: 'success', figmaPath: 'cp-A/slot-流量/t2' },
    { assignedVarName: 'icon3', downloadStatus: 'missing', figmaPath: 'cp-A/slot-流量/t3' },
  ])

  test('按 fileSectionMap 聚合出 per-file 契约（仅 success 进 resourceProps）', () => {
    const contracts = buildContracts(manifest, { 'components/Flow.vue': 'slot-流量' })
    expect(contracts).toHaveLength(1)
    const c = contracts[0]
    expect(c.file).toBe('components/Flow.vue')
    expect(c.blockIds).toEqual(['slot-流量'])
    // 只含 downloadStatus==='success' 的资源（icon3 missing 被排除）
    expect(c.resourceProps).toEqual(['icon1', 'bg2'])
    expect(c.parentMustPass).toEqual(['icon1', 'bg2'])
  })

  test('无 fileSectionMap / 无 manifest → 返回 []（不抛、不反推 defineProps）', () => {
    expect(buildContracts(manifest, null)).toEqual([])
    expect(buildContracts(null, { 'a.vue': 's1' })).toEqual([])
    expect(buildContracts(manifest, {})).toEqual([])
  })

  test('多文件各自独立聚合', () => {
    const m2 = buildResourceManifest([
      { assignedVarName: 'i1', downloadStatus: 'success', figmaPath: 'cp/slot-A/x' },
      { assignedVarName: 'i2', downloadStatus: 'success', figmaPath: 'cp/slot-B/y' },
    ])
    const contracts = buildContracts(m2, {
      'components/A.vue': 'slot-A',
      'components/B.vue': 'slot-B',
    })
    expect(contracts.map((c) => c.file).sort()).toEqual(['components/A.vue', 'components/B.vue'])
    const a = contracts.find((c) => c.file === 'components/A.vue')
    expect(a.resourceProps).toEqual(['i1'])
  })
})
