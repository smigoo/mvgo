/**
 * 步骤 0（2026-11-15 · mc-max-1794752955560-c0cb00f1「流量预测折线图不出现」实锤）：
 * chart 守恒观测基线的阴阳对照。
 *
 * 阴性（真错必须被判出来）：视觉声明 3 个 chart，段内容轨只剩 2 个 bar，产物只有
 *   2 个图表宿主文件 ⇒ missing=['2:3573']、verdict='plan-gap'、配方指向宿主段 2:3571。
 * 阳性（不误伤）：声明补齐后守恒；零图表 / plan 缺席 / 产物缺席不下假结论；
 *   装饰 icon、折叠 list、v-for、容器段、chartSpec 规格、internalSubcomponents 另一轨
 *   逐条不命中；精确相等不接受子串假命中。
 *
 * 判据与验证刻意不同源：本 spec 用独立字面量构造 plan / files / layout，
 *   不 import 判据内部的 CHART_TYPES / SKIP_KEYS / 归一化函数（改的人 = 验的人 = 假绿）。
 */
import {
  auditChartConservation,
  chartConservationPlanFields,
  chartConservationCounts,
} from './chart-conservation-audit.js'

const vision = [
  { section: '2:7625', type: 'bar', series: ['北京方向', '上海方向'] },
  { section: '2:7794', type: 'bar', series: ['北京方向', '上海方向'] },
  { section: '2:3573', type: 'line', series: ['实际流量', '预测流量'] },
]

const barDecls = [
  { id: '2:7626', figmaNode: '2:7625', role: 'chart', type: 'bar', name: '分时流量柱状图' },
  { id: '2:7795', figmaNode: '2:7794', role: 'chart', type: 'bar', name: '分时流量柱状图' },
]
const lineDecl = { id: '2:3574', figmaNode: '2:3573', role: 'chart', type: 'line', name: '流量预测折线图' }

/** 本单同构：7 段，尾段只有标题 icon，折线子段被回收在 layout.children 里 */
function makePlan(children: any[] = barDecls) {
  return {
    effectiveSections: [
      { id: '2:3559', body: { children: [{ id: '2:3561', role: '装饰', type: 'icon' }] } },
      { id: '2:3660', declaredContent: { items: [{ id: '2:3683', content: { elements: [{ type: 'value', text: '34,620' }] } }] } },
      { id: '1744:127', declaredContent: { children: [children[0]] } },
      { id: '1744:128', declaredContent: { children: [children[1]] } },
      { id: '2:3439', declaredContent: [{ id: '2:3441', role: '装饰', type: 'icon' }] },
      { id: '1263:38', items: [{ id: '2:3446', type: 'stat-item', value: '22350' }] },
      { id: '2:3571', declaredContent: { children: [{ id: '2:3572', role: '装饰', type: 'icon' }] } },
    ],
  }
}

function makeLayout() {
  return [
    { id: '2:3559', header: { title: '当日总流量' } },
    {
      id: '2:3571',
      reclaimedChildren: ['2:3573'],
      children: [{ id: '2:3573', body: { children: [lineDecl] } }],
    },
  ]
}

/** full-truth files map：两个图表宿主文件，各自 init 两次（主路径 + ResizeObserver 兜底） */
function makeFiles(extra: Record<string, string> = {}) {
  return {
    'package/components/ContentTunnel.vue': 'const c = echarts.init(ref.value)\nif (!c) chart = echarts.init(ref.value)',
    'package/components/ContentBridge.vue': 'const c = echarts.init(ref.value)\nif (!c) chart = echarts.init(ref.value)',
    'package/components/TabsSection.vue': '<template><div>流量预测</div></template>',
    'resources/styles/index.css': '.a { color: red }',
    ...extra,
  }
}

describe('步骤 0 · chart 守恒观测（纯附加，不接门禁）', () => {
  test('① 阴性：本单真错 3/2/2 ⇒ missing 折线、verdict=plan-gap、配方带归属段', () => {
    const a = auditChartConservation({
      visionCharts: vision, plan: makePlan(), files: makeFiles(),
      layoutSections: makeLayout(), stage: 'artifact',
    })
    expect(a.visionCharts).toBe(3)
    expect(a.planChartDeclarations).toBe(2)
    expect(a.artifactChartMountPoints).toBe(2)
    expect(a.initCallSites).toBe(4) // 原始调用点仍可观测，但不参与计数
    expect(a.missingChartIds).toEqual(['2:3573'])
    expect(a.gapCount).toBe(1)
    expect(a.verdict).toBe('plan-gap')
    expect(a.recipes[0]).toMatchObject({
      missingChartId: '2:3573', chartType: 'line',
      hostSectionId: '2:3571', hostMount: 'section.reclaimedChildren',
      status: 'resolvable',
    })
    expect(a.recipes[0].series).toEqual(['实际流量', '预测流量'])
  })

  test('② 阳性：补齐折线声明与产物 ⇒ 3/3/3 conserved，不误伤', () => {
    const plan = makePlan([...barDecls, lineDecl])
    plan.effectiveSections[3].declaredContent.children.push(lineDecl as any)
    const a = auditChartConservation({
      visionCharts: vision, plan, layoutSections: makeLayout(),
      files: makeFiles({ 'package/components/ContentForecast.vue': 'chart = echarts.init(el)' }),
    })
    expect(a.planChartDeclarations).toBe(3)
    expect(a.artifactChartMountPoints).toBe(3)
    expect(a.missingChartIds).toEqual([])
    expect(a.verdict).toBe('conserved')
  })

  test('③ 真错仍 FAIL：plan 内容轨全空，不得判 conserved', () => {
    const plan = { effectiveSections: [{ id: 'x', declaredContent: { children: [] } }] }
    const a = auditChartConservation({ visionCharts: vision, plan, files: makeFiles() })
    expect(a.planChartDeclarations).toBe(0)
    expect(a.missingChartIds).toHaveLength(3)
    expect(a.verdict).toBe('plan-gap')
    expect(a.verdict).not.toBe('conserved')
  })

  test('④ planner 点产物缺席 ⇒ null + artifactAvailable=false，绝不编 0', () => {
    const a = auditChartConservation({ visionCharts: vision, plan: makePlan(), stage: 'plan' })
    expect(a.artifactChartMountPoints).toBeNull()
    expect(a.artifactAvailable).toBe(false)
    expect(a.initCallSites).toBe(0)
    // 不因产物缺席把真错抹平
    expect(a.missingChartIds).toEqual(['2:3573'])
    expect(a.verdict).toBe('plan-gap')
    expect(chartConservationCounts(a).artifactChartMountPoints).toBeNull()
    expect(chartConservationPlanFields(a).ccArtifactAvailable).toBe(0)
  })

  test('⑤ 零图表 ⇒ no-charts + skipped，不误报缺口', () => {
    const a = auditChartConservation({ visionCharts: [], plan: makePlan(), files: makeFiles() })
    expect(a.verdict).toBe('no-charts')
    expect(a.skipped).toBe(true)
    expect(a.skippedReason).toBe('no-vision-charts')
    expect(a.missingChartIds).toEqual([])
    expect(a.recipes).toEqual([])
  })

  test('⑥ plan 缺席 ⇒ plan-unavailable，不把「没读到」当「0 个声明」', () => {
    const a = auditChartConservation({ visionCharts: vision, files: makeFiles() })
    expect(a.planAvailable).toBe(false)
    expect(a.verdict).toBe('plan-unavailable')
    expect(a.missingChartIds).toEqual([])
    expect(chartConservationCounts(a).planAvailable).toBe(0)
  })

  test('⑦ 其它类型逐条不命中：装饰 icon / 折叠 list / v-for / 容器段 / chartSpec / internalSubcomponents', () => {
    const plan = {
      effectiveSections: [
        { id: 'a', declaredContent: { children: [{ id: 'i1', role: '装饰', type: 'icon' }] } },
        { id: 'b', collapsed: true, items: [{ id: 'it1', type: 'stat-item', value: '22350' }] },
        { id: 'c', renderHint: 'v-for', children: [{ id: 'it2', type: 'text', text: '客车' }] },
        { id: 'd', isLayoutContainer: true, children: [{ id: 'it3', type: 'label', text: '标题' }] },
        { id: 'e', chartSpec: { type: 'line', series: ['实际流量'] } },
        { id: 'f', internalSubcomponents: [{ id: 'sub1', type: 'chart-component', chartSpec: { type: 'line' } }] },
        { id: 'g', styles: { figmaHeightPx: 24 }, layoutMetadata: { direction: 'row' } },
      ],
    }
    const a = auditChartConservation({ visionCharts: vision, plan, files: makeFiles() })
    expect(a.planChartDeclarations).toBe(0)
    expect(a.missingChartIds).toHaveLength(3)
    expect(a.verdict).toBe('plan-gap')
  })

  test('⑧ 容器段递归命中（低概率形态不漏）：children 里的 chart 要数到', () => {
    const plan = { effectiveSections: [{ id: 'container', children: [{ id: 'inner', body: { children: barDecls } }] }] }
    const a = auditChartConservation({ visionCharts: vision, plan })
    expect(a.planChartDeclarations).toBe(2)
    expect(a.missingChartIds).toEqual(['2:3573'])
  })

  test('⑨ 同一 chart 在 body.children 与 children 双重声明 ⇒ 按引用去重算 1，不虚增', () => {
    const decl = barDecls[0]
    const plan = { effectiveSections: [{ id: 's', body: { children: [decl] }, children: [decl] }] }
    const a = auditChartConservation({ visionCharts: [vision[0]], plan })
    expect(a.planChartDeclarations).toBe(1)
    expect(a.missingChartIds).toEqual([])
  })

  test('⑩ 精确相等：id 是子串 / 超串都不算命中（禁 covers 假命中）', () => {
    const plan = { effectiveSections: [{ id: 's', declaredContent: { children: [
      { id: '2:357', figmaNode: '2:35730', role: 'chart', type: 'line' },
    ] } }] }
    const a = auditChartConservation({ visionCharts: [vision[2]], plan })
    expect(a.missingChartIds).toEqual(['2:3573']) // 精确引用差集仍可见
    expect(a.gapCount).toBe(0)                    // 但数量守恒 ⇒ 不判缺口
    expect(a.planChartDeclarations).toBe(1)
    expect(a.verdict).not.toBe('plan-gap')
    expect(a.recipes).toEqual([])
  })

  test('⑪ 产物不可读 / 非 .vue ⇒ available=false + count=null，不编 0', () => {
    const a = auditChartConservation({ visionCharts: vision, plan: makePlan(), files: { 'resources/styles/index.css': '.a{}' } })
    expect(a.artifactAvailable).toBe(false)
    expect(a.artifactChartMountPoints).toBeNull()
    const b = auditChartConservation({ visionCharts: vision, plan: makePlan(), files: { 'a.vue': { title: 'no content' } } })
    expect(b.artifactAvailable).toBe(false)
    expect(b.artifactChartMountPoints).toBeNull()
  })

  test('⑫ 产物比视觉多 ⇒ artifact-extra（臆造图表可观测）', () => {
    const a = auditChartConservation({
      visionCharts: vision.slice(0, 2), plan: makePlan(),
      files: makeFiles({ 'package/components/Extra.vue': 'echarts.init(el)' }),
    })
    expect(a.planChartDeclarations).toBe(2)
    expect(a.missingChartIds).toEqual([])
    expect(a.artifactChartMountPoints).toBe(3)
    expect(a.verdict).toBe('artifact-extra')
  })

  test('⑬ 配方「指空段 = 没给」：layout 找不到归属段 ⇒ hostSectionId=null', () => {
    const a = auditChartConservation({ visionCharts: vision, plan: makePlan(), layoutSections: [{ id: 'other', header: {} }] })
    const recipe = a.recipes.find((r) => r.missingChartId === '2:3573')
    expect(recipe?.hostSectionId).toBeNull()
    expect(recipe?.status).toBe('no-host')
  })

  test('⑭ 纯附加：plan 字段组不覆盖既有 [vision-truth] 任何键', () => {
    const a = auditChartConservation({ visionCharts: vision, plan: makePlan(), stage: 'plan' })
    const fields = chartConservationPlanFields(a)
    for (const k of ['visionCharts', 'exitChartSubcomponents', 'chartSubMountPoints', 'withChartSpec', 'ids', 'planSource', 'planSourceBasis']) {
      expect(fields).not.toHaveProperty(k)
    }
    expect(Object.keys(fields).every((k) => k.startsWith('cc'))).toBe(true)
  })

  test('⑮ 恒打计数行：全空入参仍返回完整键（0 也打）', () => {
    const counts = chartConservationCounts(auditChartConservation({}))
    expect(counts.visionCharts).toBe(0)
    expect(counts.planChartDeclarations).toBe(0)
    expect(counts.artifactChartMountPoints).toBeNull()
    expect(counts.missingChartIds).toEqual([])
    expect(counts.verdict).toBe('no-charts')
    expect(counts.skipped).toBe(1)
    expect(counts.stage).toBe('observe')
  })

  test('⑯ 防假红回归：数量守恒但视觉/段计划 id 建模口径不同（06673ffa / 89b32111 形态）', () => {
    const driftVision = [{ section: '2:7625' }, { section: '2:7794' }, { section: '2:3565' }]
    const plan = { effectiveSections: [
      { id: '1744:127', declaredContent: { children: [{ id: '2:7627', type: 'chart' }] } },
      { id: '1744:128', declaredContent: { children: [{ id: '2:7796', type: 'chart' }] } },
      { id: '2:3604', declaredContent: { children: [{ id: '2:3572', type: 'chart' }] } },
    ] }
    const files = {
      'a.vue': 'echarts.init(a)', 'b.vue': 'echarts.init(b)', 'c.vue': 'echarts.init(c)',
    }
    const a = auditChartConservation({ visionCharts: driftVision, plan, files })
    expect(a.planChartDeclarations).toBe(3)
    expect(a.artifactChartMountPoints).toBe(3)
    expect(a.exactRefMissCount).toBe(3) // 差集照实保留，供配方定位
    expect(a.gapCount).toBe(0)
    expect(a.verdict).toBe('conserved')
    expect(a.recipes).toEqual([])
  })

  test('⑰ 防假绿回归：plan 声明多于视觉（97d8dc97 形态）⇒ plan-extra', () => {
    const plan = { effectiveSections: [
      { id: '2:7881', declaredContent: { children: [{ id: '2:7941', role: 'chart', type: 'bar' }] } },
      { id: '2:7898', declaredContent: { children: [{ id: '2:7898', role: 'chart', type: 'bar' }] } },
      { id: 'chart-section', declaredContent: { children: [{ id: 'chart-section', role: 'chart', type: 'line' }] } },
    ] }
    const a = auditChartConservation({ visionCharts: [{ section: 'chart-section' }], plan, files: { 'a.vue': 'echarts.init(a)' } })
    expect(a.planChartDeclarations).toBe(3)
    expect(a.missingChartIds).toEqual([])
    expect(a.verdict).toBe('plan-extra')
    expect(a.verdict).not.toBe('conserved')
    expect(a.recipes).toEqual([])
  })
})
