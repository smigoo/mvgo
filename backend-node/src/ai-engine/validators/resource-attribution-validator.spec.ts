/**
 * resource-attribution-validator 单元测试（1.C 错绑剥离 + 跨区检测）。
 * 自包含：内联 RDM，不依赖缺失的 fixtures/0907。
 */

import {
  detectCrossSectionResourceBindings,
  stripCrossSectionResourceBindings,
} from './resource-attribution-validator.js'
import { buildResourceManifest } from '../utils/resource-manifest.js'

// 两个 section 的资源：icon1 归 slot-secA，icon2 归 slot-secB（section 由 figmaPath 的 slot- 段派生）
const RDM = [
  { assignedVarName: 'icon1', downloadStatus: 'success', figmaPath: 'slot-secA/icon-1.png' },
  { assignedVarName: 'icon2', downloadStatus: 'success', figmaPath: 'slot-secB/icon-2.png' },
  { assignedVarName: 'bgA', downloadStatus: 'success', figmaPath: 'slot-secA/bg-a.png' },
]

const fileSectionMap = {
  'package/components/CompA.vue': 'slot-secA',
  'package/components/CompB.vue': 'slot-secB',
}

describe('detectCrossSectionResourceBindings', () => {
  test('A 文件引用 B 的 icon2 → BLOCK', () => {
    const manifest = buildResourceManifest(RDM)
    const files = {
      'package/components/CompA.vue': `<img :src="icon2">`,
      'package/components/CompB.vue': `<img :src="icon1">`,
    }
    const issues = detectCrossSectionResourceBindings(manifest, files, fileSectionMap)
    expect(issues.map((i) => i.varName).sort()).toEqual(['icon1', 'icon2'])
    expect(issues.every((i) => i.severity === 'BLOCK')).toBe(true)
  })

  test('无 fileSectionMap → 只 WARN 不 BLOCK（Loop 0.D）', () => {
    const manifest = buildResourceManifest(RDM)
    const files = { 'package/components/CompA.vue': `<img :src="icon2">` }
    const issues = detectCrossSectionResourceBindings(manifest, files, null)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.every((i) => i.severity !== 'BLOCK')).toBe(true)
  })
})

describe('stripCrossSectionResourceBindings（1.C 确定性剥离）', () => {
  test('剥离错绑 DOM 引用 + import，且不删本 section 资源', () => {
    const manifest = buildResourceManifest(RDM)
    const files = {
      'package/components/CompA.vue':
        `import icon2 from '../../resources/images/icon-2.png';\n` +
        `<img :src="icon2">\n` +
        `background-image: url(${'$'}{bgA});\n` +
        `import bgA from '../../resources/images/bg-a.png';`,
      'package/components/CompB.vue': `<img :src="icon1">`,
    }
    const { files: out, removed } = stripCrossSectionResourceBindings(manifest, files, fileSectionMap)

    // CompA 属 secA，icon2 属 secB → 被剥
    const a = out['package/components/CompA.vue']
    expect(a).not.toContain('icon2')
    expect(a).not.toContain('import icon2')
    // 本 section 的 bgA 保留
    expect(a).toContain('bgA')
    // CompB 属 secB，icon1 属 secA → 被剥
    const b = out['package/components/CompB.vue']
    expect(b).not.toContain('icon1')

    expect(removed.map((r) => r.varName).sort()).toEqual(['icon1', 'icon2'])
  })

  test('无 fileSectionMap 时不删（返回原样）', () => {
    const manifest = buildResourceManifest(RDM)
    const files = { 'package/components/CompA.vue': `<img :src="icon2">` }
    const { files: out, removed } = stripCrossSectionResourceBindings(manifest, files, null)
    expect(removed.length).toBe(0)
    expect(out['package/components/CompA.vue']).toContain('icon2')
  })
})
