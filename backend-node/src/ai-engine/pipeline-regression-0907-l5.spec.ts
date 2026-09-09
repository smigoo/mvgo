/**
 * 0907 管线回归 · Phase 2 装配层 v1 资源表（L5）
 *
 * 根因（资源错绑）：chunk 生成 prompt 把整张 resourceDomMapping 全量下发给 LLM，
 * LLM 在「全量资源里自由选名字相邻图」→ traffic 组件灾难级错绑
 * （icon1 属当日总流量却被绑到车型分布、bg2 属车型分布被绑到流量预测）。
 *
 * L5 单一事实源：buildResourceManifest(mappings) 按 figmaPath 的 slot-* 段
 * 把资源聚合成 per-section 资源表；L6 据此给每个 chunk 只下发「本 section 归属」
 * 的资源，从管线层消除跨 section 错绑。
 *
 * 本 spec 为 TDD 红→绿：buildResourceManifest 未实现时 tryRequire 返回 null → 全红；
 * L5 落地后逐项转绿。覆盖 env/traffic/device 三组件 section→资源归属。
 */

import * as fs from 'fs'
import * as path from 'path'

const AI_ENGINE_DIR = __dirname
const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/0907')

function loadJson(rel: string): any {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, rel), 'utf8'))
}

/** 动态探测尚未实现的函数（L5 落地后转绿），不存在时返回 null。 */
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

// ---------------------------------------------------------------------------
// T5 · 资源 Manifest 按 section 聚合（L5 落地后转绿）
// ---------------------------------------------------------------------------
describe('T5 资源 Manifest 按 section 聚合（资源错绑治本·fact source）', () => {
  test('T5a buildResourceManifest 已实现并可加载', async () => {
    const build = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    expect(build).not.toBeNull()
  })

  test('T5b traffic：3 个 slot section + 1 个面板级资源（根 bg skipMount）', async () => {
    const build = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    if (!build) return
    const mappings = loadJson('traffic/resource-dom-mapping.json')
    const manifest = build(mappings)
    expect(Object.keys(manifest.sections).sort()).toEqual(
      ['slot-当日总流量', 'slot-车型分布', 'slot-流量预测'].sort(),
    )
    // 根容器 bg（cp-流量监测/bg-[m]，skipMount）无 slot 段 → 落 panel
    expect(manifest.panel.length).toBe(1)
    expect(manifest.panel[0].skipMount).toBe(true)
    expect(manifest.unassigned.length).toBe(0)
  })

  test('T5c traffic：错绑拦截——各 section 资源不串门', async () => {
    const build = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    if (!build) return
    const mappings = loadJson('traffic/resource-dom-mapping.json')
    const manifest = build(mappings)
    const vars = (sec: string) => (manifest.sections[sec] || []).map((m: any) => m.assignedVarName)
    // icon1 属当日总流量；bg2 属车型分布；icon3 属流量预测
    expect(vars('slot-当日总流量')).toContain('icon1')
    expect(vars('slot-车型分布')).toContain('bg2')
    expect(vars('slot-流量预测')).toContain('icon3')
    // 跨 section 串门必须为空（这是错绑根因的治本断言）
    expect(vars('slot-车型分布')).not.toContain('icon1')
    expect(vars('slot-当日总流量')).not.toContain('bg2')
    expect(vars('slot-当日总流量')).not.toContain('icon3')
  })

  test('T5d env：slot-con 占位段下钻到业务容器，拆为 3 个细化 key（tabs-list/tabs-icon/num）', async () => {
    const build = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    if (!build) return
    const mappings = loadJson('env/resource-dom-mapping.json')
    const manifest = build(mappings)
    // 0907 治本②：slot-con 是 antd Tabs 容器壳，其下 tabs-list/tabs-icon/num 才是真实归属单元
    expect(Object.keys(manifest.sections).sort()).toEqual(
      ['slot-con/num', 'slot-con/tabs-icon', 'slot-con/tabs-list'].sort(),
    )
    const roles = (sec: string) => (manifest.sections[sec] || []).map((m: any) => m.previewAnalysisRole).sort()
    expect(roles('slot-con/tabs-list')).toEqual(['bg'])
    expect(roles('slot-con/tabs-icon')).toEqual(['icon', 'icon'])
    expect(roles('slot-con/num')).toEqual(['bg'])
  })

  test('T5e device：slot-con 占位段下钻到 Group NNNNN，12 图标拆为 12 个独立归属 key', async () => {
    const build = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    if (!build) return
    const mappings = loadJson('device/resource-dom-mapping.json')
    const manifest = build(mappings)
    // 0907 治本②：device 12 图标 figmaPath 全为 slot-con/@antd/tab/cons/Group NNNNN/icon，
    // 旧实现只取首个 slot-* 段 → 全归 slot-con → 同区错绑不拦。下钻后每个 Group 独立成 key。
    const keys = Object.keys(manifest.sections)
    expect(keys.length).toBe(12)
    expect(keys.every((k) => k.startsWith('slot-con/Group '))).toBe(true)
    // 每个 key 各含 1 个图标资源
    expect(keys.every((k) => manifest.sections[k].length === 1 && manifest.sections[k][0].previewAnalysisRole === 'icon')).toBe(true)
    // 跨 Group 串门必须为空（同区错绑治本断言）
    expect(manifest.sections['slot-con/Group 2136637321'][0].assignedVarName).toBe('icon1')
    expect(manifest.sections['slot-con/Group 2136637552'][0].assignedVarName).toBe('icon2')
  })

  test('T5f resolveSectionKey：section 标题去 slot- 前缀可解析回 key（L6 接线用）', async () => {
    const resolve = await tryRequire<any>('./utils/resource-manifest.js', 'resolveSectionKey')
    expect(resolve).not.toBeNull()
    if (!resolve) return
    const build = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    if (!build) return
    const manifest = build(loadJson('traffic/resource-dom-mapping.json'))
    expect(resolve(manifest, '当日总流量')).toBe('slot-当日总流量')
    expect(resolve(manifest, 'slot-车型分布')).toBe('slot-车型分布')
    expect(resolve(manifest, '流量预测')).toBe('slot-流量预测')
  })

  test('T5g ownerRole/ownerSectionId：manifest 内资源携带权威归属字段', async () => {
    const build = await tryRequire<any>('./utils/resource-manifest.js', 'buildResourceManifest')
    expect(build).not.toBeNull()
    if (!build) return
    const manifest = build(loadJson('traffic/resource-dom-mapping.json'))
    const vehicleBg = manifest.sections['slot-车型分布'].find((m: any) => m.assignedVarName === 'bg2')
    expect(vehicleBg.ownerRole).toBe('section')
    expect(vehicleBg.ownerSectionId).toBe('slot-车型分布')
    expect(manifest.panel[0].ownerRole).toBe('panel')
    expect(manifest.panel[0].ownerSectionId).toBeNull()
  })

  test('T5h annotateResourceOwnership 不污染原 mapping 对象', async () => {
    const annotate = await tryRequire<any>('./utils/resource-manifest.js', 'annotateResourceOwnership')
    expect(annotate).not.toBeNull()
    if (!annotate) return
    const input = [{ figmaPath: 'cp/slot-A/icon', assignedVarName: 'icon1' }]
    const out = annotate(input)
    expect(out[0]).not.toBe(input[0])
    expect(out[0].ownerSectionId).toBe('slot-A')
    expect(input[0]).not.toHaveProperty('ownerSectionId')
  })
})
