/**
 * 🎯 行带内成员「横向间距」不得串入纵向通道（2026-11-17 · mc-max-1794890428265-8312d0b9 实锤）
 *
 * 病灶：多成员顶层行带（`mc-top-row-band`）内，非首成员的**横向**兄弟间距（正确落点是
 *   `gapStyle` = `margin-left`）被同时写进 `__sectionGeometries[].gapPx`（**纵向**通道，
 *   唯一消费者 = layoutStyle 的 `margin-top`）⇒ class 规则额外产出同值 `margin-top`。
 *   真机：带内 99px 横向间距 ⇒ 行带高 27 → 123px（占面板总高 274 的 35%），
 *   其余段被等比压扁（「c-monitor-mc-top-row-band 这么高」的根因）。
 *
 * 修复：带内成员 `gapPx` 恒 0（无纵向间距语义）；横向真值只由 `gapStyle` 单源承载。
 *   单成员带（:1529）与非带顶层（:1656）的 gapPx 本来就是纵向真值，逐字不变。
 *
 * ⚠️ fixture 必须走**顶层行带分支**（`__topBands`，产 `__sectionGeometries`/`layoutStyle`）：
 *   即 `effectiveSections` 为**多个平级顶层段**，其中两段同 y 横向相邻（band.length≥2）。
 *   反例（勿用）：把多段塞进一个容器的 children ⇒ 走「刀12 2D 行簇」（renderBandNode），
 *   那条路径本来就按轴切换 innerGap，产不出 layoutStyle，无法覆盖本缺陷。
 *
 * fixture 几何（按真机 73:3 = 414×274 抽象）：
 *   带1 = tabs(0,0,263,27) / icon(362,0,24,24) 同 y ⇒ 多成员行带，横向间距 99px；
 *   sec-a / sec-b / sec-c 纵排 ⇒ 单成员带（充当「纵向通道未被误杀」的阳性对照）。
 */

import { jest } from '@jest/globals'
import { readFileSync } from 'fs'
import { join } from 'path'

// ⚠️ 加载期拦截：code-generator.js 依赖链含 import.meta（acorn-optional-loader），
//   本仓 jest 为 CJS transform，直接 import 会 SyntaxError。同 deterministic-template.spec.ts 替身。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  logsDir: require('os').tmpdir(),
  dataDir: require('os').tmpdir(),
  tempComponentsDir: require('os').tmpdir(),
}), { virtual: true })

jest.mock('../../utils/sfc-semantics.js', () => ({
  dedupeScriptImports: (s: string) => s,
  dedupeScriptDeclarations: (s: string) => s,
  dedupeMcComponentBuilder: (s: string) => s,
  dedupeLifecycleHooks: (s: string) => s,
  validateVueScriptSemantics: () => ({ issues: [] }),
  extractComponentTagNames: () => [],
  VUE_BUILTIN_COMPONENTS: [],
}))

jest.mock('../../utils/prompt-loader.js', () => ({
  loadMd: () => '',
  validatePromptsDir: () => true,
  buildSharedSections: () => '',
  trimConstraintsForContext: (c = '') => c,
  buildConcerns: () => '',
  formatAssetsList: () => '',
  buildTextInventorySection: () => '',
  buildStructureMarkersSection: () => '',
  buildFigmaStage: () => '',
}))

jest.mock('../../utils/resource-import-guard.js', () => ({
  extractResourceVarNames: () => [],
  resolveResourceDomMapping: () => ({}),
}))

jest.mock('../../utils/provider-pool.js', () => ({
  getProviderPool: () => ({ recordTimeout: () => {}, get: () => null }),
}))

jest.mock('../../utils/llm-timeout.js', () => ({ invokeWithTimeout: jest.fn() }))

import { buildDeterministicIndexTemplate } from './code-generator.js'

const src = readFileSync(join(__dirname, 'code-generator.js'), 'utf-8')
const B = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h })

// 顶层 5 段平级（**必须平级**，否则退化为刀12 行簇路径，见文件头注释）。
// ⚠️ clusterY 是链式贪心（`y <= 当前带 bottom + TOL(=1)`）：段间**必须留 >1px 垂直间隙**，
//   否则全部链成一带 ⇒ planTopLevelBands 返回 null（要求 bands≥2）⇒ 退化为纯纵排。
function bandPlan(innerGapPx = 99) {
  return {
    isForced: true,
    minFiles: 8,
    effectiveSections: [
      { id: '73:412', title: 'tabs', type: 'content', elementCount: 5, absoluteBoundingBox: B(0, 0, 263, 27) },
      // 与 tabs 同 y、右侧间隔 innerGapPx ⇒ 多成员行带，横向间距 = 263 + innerGapPx
      { id: '1:477', title: 'icon-statistics', type: 'content', elementCount: 1, absoluteBoundingBox: B(263 + innerGapPx, 0, 24, 24) },
      // 之后三段纵排（与上一段留间隙 ⇒ 各自成带）
      { id: '73:420', title: 'sec-a', type: 'content', elementCount: 6, absoluteBoundingBox: B(0, 40, 414, 80) },
      { id: '73:421', title: 'sec-b', type: 'content', elementCount: 6, absoluteBoundingBox: B(0, 135, 414, 60) },
      { id: '73:422', title: 'sec-c', type: 'content', elementCount: 6, absoluteBoundingBox: B(0, 210, 414, 60) },
    ],
  }
}

const build = (plan: any = bandPlan()) => {
  const facts = buildDeterministicIndexTemplate({
    componentName: 'monitor',
    panelType: 'default-panel',
    subComponentPlan: plan,
  })
  expect(facts).not.toBeNull()
  return facts as unknown as { template: string; layoutStyle: string; sectionGeometries: any[] }
}

describe('行带内成员横向间距不得串入纵向通道（mc-max-1794890428265-8312d0b9 实锤）', () => {
  it('⚑ 阳性：多成员行带成员 class 规则**不含** margin-top；横向 99px 只走 gapStyle(margin-left)', () => {
    const f = build()
    // ⓪ 前提：确实走了顶层行带分支（否则本测试失去意义 —— fail 明确）
    expect(f.template).toContain('mc-top-row-band')
    // ① 缺陷形态绝迹：横向间距（99）不得出现在 layoutStyle 的纵向 margin-top 通道
    expect(f.layoutStyle).not.toContain('margin-top: 99px')
    expect(f.layoutStyle).not.toMatch(/margin-top:\s*99/)
    // ② 横向真值单源保留：模板内非首成员仍带 margin-left:99px（gapStyle 承载，未被误删）
    expect(f.template).toContain('margin-left:99px')
    // ③ 写入端真值：带内两成员 gapPx 均为 0；非首成员横向值只落在 gapStyle
    const sg = f.sectionGeometries
    expect(sg[0].gapPx).toBe(0) // 带内首成员
    expect(sg[1].gapPx).toBe(0) // 带内非首成员（旧缺陷：= bandInnerGaps[1] = 99）
    expect(sg[1].gapStyle).toContain('margin-left:99px')
    // ④ 带内成员的 less 规则为「flex + min-height」两段式，不含任何 margin-top
    const iconRule = f.layoutStyle.split('\n').find((l) => /sech-2 \{/.test(l))!
    expect(iconRule).toBeTruthy()
    expect(iconRule).not.toContain('margin-top')
  })

  it('⚑ 纵向通道未被误杀（阳性对照）：单成员带 margin-top 逐字保留', () => {
    const f = build()
    // sec-a/b/c 走单成员带（:1529 写入点未动）⇒ 纵向间距必须原样出现在 layoutStyle
    expect(f.layoutStyle).toMatch(/margin-top:\s*\d+px/)
    const tops = (f.layoutStyle.match(/margin-top:\s*(\d+)px/g) || []).map((s) => Number(s.match(/\d+/)![0]))
    expect(tops).toEqual([13, 15, 15]) // sec-a(带1底 27→40) / sec-b(→135) / sec-c(→210)
    // 证伪护栏：若有人把消费者（layoutStyle 的 gapPx 分支）或 :1529/:1656 一并删掉，上条会红
    expect(f.sectionGeometries[2].gapPx).toBe(13)
  })

  it('阴性对照：带内横向 gap=0 ⇒ 无 margin-top 且无 margin-left（判据由真值驱动，非恒定跳过）', () => {
    const f = build(bandPlan(0))
    // 无横向间距 ⇒ 既无 margin-left 也无（不该有的）margin-top
    expect(f.template).not.toContain('margin-left:99px')
    expect(f.layoutStyle).not.toMatch(/margin-top:\s*99/)
    // 单成员带的纵向间距仍不受影响（真值驱动而不是"整体清空"）
    expect(f.layoutStyle).toMatch(/margin-top:\s*\d+px/)
    expect(f.sectionGeometries[1].gapPx).toBe(0)
  })

  it('写入端契约：带内 push 块 gapPx 恒 0（横向值不再流入纵向通道）', () => {
    // 源码字面量锚：带内 __sectionGeometries.push 的 gapPx 必须是 0
    // （其余两处 :1529 单成员带 / :1656 非带顶层 为纵向真值，不在此列）
    expect(src).toMatch(/gapPx: 0,\s*\n\s*ratioStyle: _ratioStyle,/)
    // 横向值只能经 gapStyle(innerGap) 通道；不得再作为 gapPx 的取值来源
    expect(src).not.toMatch(/gapPx:\s*Math\.round\(bandInnerGaps/)
  })
})
