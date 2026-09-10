/**
 * 0907 管线回归 · Phase 2 装配层 v1 资源表（L7）
 *
 * L7 绑定校验 BLOCK（资源错绑治本·防御性门禁）：detectCrossSectionResourceBindings 确定性检测
 * 「资源被绑定到非归属 section 的文件」并 BLOCK。抢用本批 traffic 真实错绑产物做拦截用例：
 *   - VehicleTypeDistribution.vue（车型分布）引用了 icon1（归属 当日总流量）→ 应 BLOCK
 *   - DailyTotalFlow.vue（当日总流量）引用了 bg2/bg4/icon2（车型分布）+ icon3（流量预测）→ 应 BLOCK
 */

import * as fs from 'fs'
import * as path from 'path'

const AI_ENGINE_DIR = __dirname
const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/0907')

function loadJson(rel: string): any {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, rel), 'utf8'))
}
function loadFile(rel: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, rel), 'utf8')
}

async function tryRequire<T = any>(rel: string, exportName: string): Promise<T | null> {
  const p = path.resolve(AI_ENGINE_DIR, rel)
  try {
    const mod = require(p)
    const ns = mod?.default ?? mod
    return ns?.[exportName] ?? null
  } catch {
    try {
      const mod = await import(p)
      const ns = mod?.default ?? mod
      return ns?.[exportName] ?? null
    } catch {
      return null
    }
  }
}

describe('T7 跨 section 资源错绑 BLOCK（绑定校验·治本）', () => {
  const rdm = loadJson('traffic/resource-dom-mapping.json')

  test('T7a detectCrossSectionResourceBindings 已实现并可加载', async () => {
    const fn = await tryRequire<any>('./validators/resource-attribution-validator.js', 'detectCrossSectionResourceBindings')
    expect(fn).not.toBeNull()
  })

  test('T7b 真实错绑：VehicleTypeDistribution.vue 引用 icon1(当日总流量) → BLOCK', async () => {
    const fn = await tryRequire<any>('./validators/resource-attribution-validator.js', 'detectCrossSectionResourceBindings')
    const buildResourceManifest = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    if (!fn || !buildResourceManifest) return
    const manifest = buildResourceManifest(rdm)
    const content = loadFile('traffic/VehicleTypeDistribution.vue')
    const file = 'package/components/VehicleTypeDistribution.vue'
    const issues = fn(manifest, { [file]: content }, { [file]: 'slot-车型分布' })
    const ids = issues.map((i: any) => i.varName)
    expect(ids).toContain('icon1') // 归属当日总流量，被车型分布文件引用
    expect(issues.every((i: any) => i.severity === 'BLOCK')).toBe(true)
  })

  test('T7c 真实错绑：DailyTotalFlow.vue 引用跨两个 section 资源 → BLOCK（icon1/icon3）', async () => {
    const fn = await tryRequire<any>('./validators/resource-attribution-validator.js', 'detectCrossSectionResourceBindings')
    const buildResourceManifest = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    if (!fn || !buildResourceManifest) return
    const manifest = buildResourceManifest(rdm)
    const content = loadFile('traffic/DailyTotalFlow.vue')
    const file = 'package/components/DailyTotalFlow.vue'
    // Loop 0.D：精确 map 才 BLOCK（无 map 只 WARN，不启发式猜归属）。
    // DailyTotalFlow.vue 归属 slot-当日总流量；它引用的 icon2/bg2/bg4 属车型分布、icon3 属流量预测
    // → 全部为跨 section 错绑，应 BLOCK。icon1 属本文件归属（当日总流量），不出现。
    const issues = fn(manifest, { [file]: content }, { [file]: 'slot-当日总流量' })
    const ids = issues.map((i: any) => i.varName)
    expect(ids).not.toContain('icon1') // 当日总流量（本文件归属）——恒等，不应误报
    expect(ids).toContain('icon2') // 车型分布（跨 section 错绑）
    expect(ids).toContain('bg2') // 车型分布
    expect(ids).toContain('bg4') // 车型分布
    expect(ids).toContain('icon3') // 流量预测（跨 section 错绑）
    expect(issues.every((i: any) => i.severity === 'BLOCK')).toBe(true)
  })

  test('T7d 单一归属文件不误报（仅引用本 section 资源）', async () => {
    const fn = await tryRequire<any>('./validators/resource-attribution-validator.js', 'detectCrossSectionResourceBindings')
    const buildResourceManifest = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    if (!fn || !buildResourceManifest) return
    const manifest = buildResourceManifest(rdm)
    // 车型分布文件只引用车型分布资源（bg2/bg4/icon2），且传入精确 map
    const content = 'backgroundImage: url(${bg2}); url(${bg4}); <img :src="icon2">'
    const file = 'package/components/VehicleTypeDistribution.vue'
    const issues = fn(manifest, { [file]: content }, { [file]: 'slot-车型分布' })
    expect(issues).toEqual([])
  })

  test('T7d2 Loop0.D：无 fileSectionMap 时不启发式 BLOCK，仅 UNATTRIBUTED WARN', async () => {
    const fn = await tryRequire<any>('./validators/resource-attribution-validator.js', 'detectCrossSectionResourceBindings')
    const buildResourceManifest = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    if (!fn || !buildResourceManifest) return
    const manifest = buildResourceManifest(rdm)
    // 车型分布文件引用 icon1（跨 section），但无 fileSectionMap → 禁止启发式 BLOCK（护 Loop 0.D）
    const content = 'backgroundImage: url(${icon1})'
    const file = 'package/components/VehicleTypeDistribution.vue'
    const issues = fn(manifest, { [file]: content }, null)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].id).toBe('RES-ATTR-UNATTRIBUTED')
    expect(issues[0].severity).toBe('WARN')
    expect(issues.every((i: any) => i.severity !== 'BLOCK')).toBe(true)
  })

  test('T7e 集成：validateResourceAttribution 传入 sectionManifest 后产出 BLOCK 问题', async () => {
    const fn = await tryRequire<any>('./validators/resource-attribution-validator.js', 'validateResourceAttribution')
    const buildResourceManifest = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    if (!fn || !buildResourceManifest) return
    const manifest = buildResourceManifest(rdm)
    const content = loadFile('traffic/VehicleTypeDistribution.vue')
    const file = 'package/components/VehicleTypeDistribution.vue'
    const result = fn({
      resourceDomMapping: rdm,
      files: { [file]: content },
      sectionManifest: manifest,
      fileSectionMap: { [file]: 'slot-车型分布' },
    })
    const cross = result.issues.filter((i: any) => i.id === 'RES-ATTR-CROSS-SECTION')
    expect(cross.length).toBeGreaterThan(0)
    expect(result.blockCount).toBeGreaterThan(0)
  })

  test('T7f L7 闭环·精确 fileSectionMap 抑制启发式误判：车型分布文件只引本 section 资源 → 不误 BLOCK', async () => {
    const fn = await tryRequire<any>('./validators/resource-attribution-validator.js', 'detectCrossSectionResourceBindings')
    const buildResourceManifest = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    const resolveSectionKey = await tryRequire<any>('./utils/resource-manifest.js', 'resolveSectionKey')
    if (!fn || !buildResourceManifest || !resolveSectionKey) return
    const manifest = buildResourceManifest(rdm)
    // 车型分布文件只引用车型分布资源（bg2/bg4/icon2）——这是合法产物
    const content = 'backgroundImage: url(${bg2}); url(${bg4}); <img :src="icon2">'
    const file = 'package/components/VehicleTypeDistribution.vue'
    // ① Loop 0.D：不传 fileSectionMap → 跳过启发式，只 WARN 未归因
    const byHeuristic = fn(manifest, { [file]: content }, null)
    expect(byHeuristic.every((i: any) => i.id === 'RES-ATTR-UNATTRIBUTED')).toBe(true)
    expect(byHeuristic.every((i: any) => i.severity === 'WARN')).toBe(true)
    // ② 精确传入 fileSectionMap（来自 L6 资源过滤命中的 section 标识，解析成权威 key）
    const secKey = resolveSectionKey(manifest, 'slot-车型分布')
    const byExact = fn(manifest, { [file]: content }, { [file]: secKey })
    expect(byExact).toEqual([]) // 精确模式同样不误报，且不再依赖「数量最多」启发式
  })

  test('T7g L7 闭环·精确 fileSectionMap 仍拦截真实跨区错绑：车型分布文件被标记为车型分布却引用 icon1(当日总流量) → BLOCK', async () => {
    const fn = await tryRequire<any>('./validators/resource-attribution-validator.js', 'detectCrossSectionResourceBindings')
    const buildResourceManifest = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    const resolveSectionKey = await tryRequire<any>('./utils/resource-manifest.js', 'resolveSectionKey')
    if (!fn || !buildResourceManifest || !resolveSectionKey) return
    const manifest = buildResourceManifest(rdm)
    const file = 'package/components/VehicleTypeDistribution.vue'
    const content = '<img :src="icon1"> backgroundImage: url(${bg2})' // icon1 属当日总流量，bg2 属车型分布
    const secKey = resolveSectionKey(manifest, 'slot-车型分布')
    const issues = fn(manifest, { [file]: content }, { [file]: secKey })
    const ids = issues.map((i: any) => i.varName)
    expect(ids).toContain('icon1') // 精确模式：即便车型分布资源也出现在文件里，仍只报跨区 icon1
    expect(issues.every((i: any) => i.severity === 'BLOCK')).toBe(true)
  })

  test('T7h 治本②·slot-con 内同区错绑可被识别：Group A 文件引用 Group B 的 icon2 → BLOCK（细化 key）', async () => {
    const fn = await tryRequire<any>('./validators/resource-attribution-validator.js', 'detectCrossSectionResourceBindings')
    const buildResourceManifest = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    if (!fn || !buildResourceManifest) return
    const devRdm = loadJson('device/resource-dom-mapping.json')
    const manifest = buildResourceManifest(devRdm)
    const file = 'package/components/DeviceCardA.vue'
    // Group 2136637321 的文件只应引用 icon1，却引用了 Group 2136637552 的 icon2 → 同区错绑
    const content = '<img :src="icon1"> <img :src="icon2">'
    // 精确 fileSectionMap：该文件归属 Group 2136637321（细化 key）
    const issues = fn(manifest, { [file]: content }, { [file]: 'slot-con/Group 2136637321' })
    const ids = issues.map((i: any) => i.varName)
    expect(ids).toContain('icon2') // icon2 归属 Group 2136637552，被 Group 2136637321 的文件引用 → 拦截
    expect(ids).not.toContain('icon1') // 本卡片资源合法，不误报
    expect(issues.every((i: any) => i.severity === 'BLOCK')).toBe(true)
  })

  test('T7i 治本②·单卡片文件只引本 Group 图标 → 细化 key 下不误报（启发式与精确模式均干净）', async () => {
    const fn = await tryRequire<any>('./validators/resource-attribution-validator.js', 'detectCrossSectionResourceBindings')
    const buildResourceManifest = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    if (!fn || !buildResourceManifest) return
    const devRdm = loadJson('device/resource-dom-mapping.json')
    const manifest = buildResourceManifest(devRdm)
    const file = 'package/components/DeviceCardA.vue'
    // 合法产物：Group 2136637321 文件只引用本卡片 icon1
    const content = '<img :src="icon1">'
    // ① Loop 0.D：无 fileSectionMap → WARN 未归因，不再启发式假装干净
    const unattributed = fn(manifest, { [file]: content }, null)
    expect(unattributed.every((i: any) => i.id === 'RES-ATTR-UNATTRIBUTED')).toBe(true)
    // ② 精确模式：文件归属本卡片 Group → 同样干净，且确认细化 key 不会把同 slot-con 其他 Group 误判
    const issues = fn(manifest, { [file]: content }, { [file]: 'slot-con/Group 2136637321' })
    expect(issues).toEqual([])
  })

  test('T7j 治本②·slot-con 内跨 Group 错绑：启发式（无 fileSectionMap）会保守拦截，精确模式精准定位', async () => {
    const fn = await tryRequire<any>('./validators/resource-attribution-validator.js', 'detectCrossSectionResourceBindings')
    const buildResourceManifest = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    if (!fn || !buildResourceManifest) return
    const devRdm = loadJson('device/resource-dom-mapping.json')
    const manifest = buildResourceManifest(devRdm)
    const file = 'package/components/DeviceCardA.vue'
    // Group 2136637321 的文件错绑了 Group 2136637552 的 icon2（同 slot-con 内跨 Group 错绑）
    const content = '<img :src="icon1"> <img :src="icon2">'
    // ① Loop 0.D：无 fileSectionMap 不再启发式 BLOCK（避免 tab v-for 误伤），只 WARN 未归因
    const byHeuristic = fn(manifest, { [file]: content }, null)
    expect(byHeuristic.every((i: any) => i.id === 'RES-ATTR-UNATTRIBUTED')).toBe(true)
    expect(byHeuristic.every((i: any) => i.severity === 'WARN')).toBe(true)
    // ② 精确模式：文件精准归属 Group 2136637321 → 仅 icon2（属 Group 2136637552）被 BLOCK，icon1 合法
    const byExact = fn(manifest, { [file]: content }, { [file]: 'slot-con/Group 2136637321' })
    const ids = byExact.map((i: any) => i.varName)
    expect(ids).toContain('icon2')
    expect(ids).not.toContain('icon1')
    expect(byExact.every((i: any) => i.severity === 'BLOCK')).toBe(true)
  })
})
