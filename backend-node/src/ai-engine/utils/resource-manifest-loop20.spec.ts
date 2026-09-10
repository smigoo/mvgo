/**
 * Loop 2.0.A：mappingForContract 空契约禁止回全量。
 * 旧行为 allowed.size===0 → return success（forceAll 语义），会把跨区资源重新灌进主组件。
 */
import { mappingForContract, buildResourceManifest } from './resource-manifest.js'

const successList = [
  { assignedVarName: 'icon1', downloadStatus: 'success', ownerBlockId: 'slot-当日总流量' },
  { assignedVarName: 'bg2', downloadStatus: 'success', ownerBlockId: 'slot-con/Group 1' },
  { assignedVarName: 'icon9', downloadStatus: 'missing' },
]

describe('Loop 2.0.A mappingForContract 空契约禁全量', () => {
  test('main 无 contract / 无 contracts / 无 panel → 返回 [] 而不是全量 success', () => {
    const out = mappingForContract(successList, { contracts: [], panel: [] }, null, 'main')
    expect(out).toEqual([])
  })

  test('main 空 parentMustPass 且 manifest 无允许名 → 返回 []', () => {
    const out = mappingForContract(
      successList,
      { contracts: [{ file: 'A.vue', blockIds: [], resourceProps: [], parentMustPass: [] }], panel: [] },
      { parentMustPass: [] },
      'main',
    )
    expect(out).toEqual([])
  })

  test('main 有 parentMustPass 时只返回契约内 success', () => {
    const out = mappingForContract(
      successList,
      { contracts: [], panel: [] },
      { parentMustPass: ['icon1'] },
      'main',
    )
    expect(out.map((m) => m.assignedVarName)).toEqual(['icon1'])
  })

  test('sub 无 blockIds 仍返回 []（不回全量）', () => {
    const out = mappingForContract(successList, {}, { blockIds: [] }, 'sub')
    expect(out).toEqual([])
  })
})

/**
 * Loop 2.0.B：provenance 按来源赋值，不按有无 ownerBlockId 反推。
 * 旧实现：`ownerBlockId ? 'inferred' : (figmaPath ? 'figma-direct' : 'inferred')`
 * —— 任何有 figmaPath 的 section 资源（已带 ownerBlockId）一律被标 'inferred'，
 * 与 v2 `provenance` 纠正（树推导出 path → figma-tree / mapping-fallback，禁止 depend on block）冲突。
 */
describe('Loop 2.0.B withResourceOwner provenance 不再靠 block 反标', () => {
  test('有 figmaPath 的 section 资源 provenance 为 figma-tree（非 inferred）', () => {
    const manifest = buildResourceManifest([
      { assignedVarName: 'icon1', downloadStatus: 'success', figmaPath: 'cp-A/slot-当日总流量/icon' },
    ])
    const res = manifest.resources[0]
    expect(res.ownerBlockId).toBe('slot-当日总流量')
    expect(res.provenance).toBe('figma-tree')
  })

  test('无 figmaPath 资源 provenance 为 mapping-fallback', () => {
    const manifest = buildResourceManifest([
      { assignedVarName: 'icon9', downloadStatus: 'success' },
    ])
    const res = manifest.resources[0]
    expect(res.ownerBlockId).toBeNull()
    expect(res.provenance).toBe('mapping-fallback')
  })

  test('panel 级（无 slot 段）有 figmaPath 仍标 figma-tree', () => {
    const manifest = buildResourceManifest([
      { assignedVarName: 'bg0', downloadStatus: 'success', figmaPath: 'cp-A/bg-[m]' },
    ])
    const res = manifest.resources[0]
    expect(res.ownerRole).toBe('panel')
    expect(res.provenance).toBe('figma-tree')
  })
})
