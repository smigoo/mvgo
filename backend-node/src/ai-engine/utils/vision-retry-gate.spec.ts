/**
 * 图表「无段承载」判据 —— 单测。
 *
 * 判据来源：mc-max-1794723552731-13daa0e4 真机实锤 —— vision 只吐 3 个标题段，
 * `charts[]` 仍声明 2 张图并指向 `2:7625` / `2:7794`，而没有任何段的子树提到这两个 id；
 * 产物只剩两个空标题组件却标 completed 并发布预览（渲染图几乎全白）。
 *
 * 判据：声称有 N 张图 ⇒ 至少有一个段「承载」它（段子树内出现该 id，或段级 charts 引用它，
 * 或 section 直接用段名）。零阈值、零命名，445 支历史任务 corpus 上 0 误伤。
 */
import {
  countOrphanChartCarriers,
  shouldRetryVisionAnalysis,
  pickBetterVisionAnalysis,
  VISION_SECTION_CONTRACT_MIN,
} from './vision-retry-gate.js'

const section = (id: string, name: string, extra: Record<string, any> = {}) => ({
  id,
  name,
  figmaNodeId: id,
  ...extra,
})

const vision = (sections: any[], charts: any[] = [], chartDataHints: any[] = []) => ({
  charts,
  chartDataHints,
  layoutStructure: { layout: { sections }, charts, chartDataHints },
})

describe('countOrphanChartCarriers · 阳性：图表声明无段承载', () => {
  test('真机残缺支形态：3 个标题段 + 2 张图全无承载 ⇒ orphanCount=2', () => {
    const parsed = vision(
      [section('2:3550', '面板标题区'), section('2:3439', '车型分布标题区'), section('2:3565', '流量预测标题区')],
      [
        { section: '2:7625', type: 'bar' },
        { section: '2:7794', type: 'bar' },
      ],
    )
    const r = countOrphanChartCarriers(parsed)
    expect(r.orphanCount).toBe(2)
    expect(r.orphans).toEqual(['2:7625', '2:7794'])
    expect(r.evaluated).toBe(2)
  })

  test('段数不少（5 段）但图表仍无承载 ⇒ 照样命中（不依赖段数阈值）', () => {
    const parsed = vision(
      ['2:1', '2:2', '2:3', '2:4', '2:5'].map((id, i) => section(id, `段${i}`)),
      [{ section: '9:9', type: 'line' }],
    )
    expect(countOrphanChartCarriers(parsed).orphanCount).toBe(1)
  })

  test('同一 id 在四处声明重复出现 ⇒ 只算一次（按 section 值去重）', () => {
    const parsed = vision(
      [section('2:3550', '面板标题区')],
      [{ section: '2:7625' }, { section: '2:7625' }],
      [{ section: '2:7625' }, { section: '2:7625' }],
    )
    const r = countOrphanChartCarriers(parsed)
    expect(r.evaluated).toBe(1)
    expect(r.orphanCount).toBe(1)
  })
})

describe('countOrphanChartCarriers · 阴性：已承载/不裁决的一律不动', () => {
  test('段级 charts 引用该 id ⇒ 视为已承载', () => {
    const parsed = vision(
      [section('1744:127', '隧道流量', { charts: [{ section: '2:7625' }] })],
      [{ section: '2:7625' }],
    )
    expect(countOrphanChartCarriers(parsed).orphanCount).toBe(0)
  })

  test('reanchoredFrom 记录了原锚 ⇒ 视为已承载（真机正常支形态）', () => {
    const parsed = vision(
      [section('1744:127', '隧道流量', { reanchoredFrom: '2:7625' })],
      [{ section: '2:7625' }],
    )
    expect(countOrphanChartCarriers(parsed).orphanCount).toBe(0)
  })

  test('段内任意层级的 figmaNodeId 命中 ⇒ 视为已承载', () => {
    const parsed = vision(
      [section('1744:127', '隧道流量', { body: { children: [{ id: '1744:127', figmaNodeId: '2:7625' }] } })],
      [{ section: '2:7625' }],
    )
    expect(countOrphanChartCarriers(parsed).orphanCount).toBe(0)
  })

  test('chart.section 直接写段名 ⇒ 视为已承载', () => {
    const parsed = vision([section('1744:127', '江阴靖江长江隧道分时流量')], [
      { section: '江阴靖江长江隧道分时流量' },
    ])
    expect(countOrphanChartCarriers(parsed).orphanCount).toBe(0)
  })

  test('chart.section 是合成锚（chart-section / chart-1）⇒ 不裁决', () => {
    const parsed = vision([section('2:7879', '环境监测')], [
      { section: 'chart-section' },
      { section: 'chart-1' },
    ])
    const r = countOrphanChartCarriers(parsed)
    expect(r.orphanCount).toBe(0)
    expect(r.evaluated).toBe(2)
  })

  test('chart.section 为空 ⇒ 跳过（归属由 chart-anchor-resolver 负责）', () => {
    const parsed = vision([section('2:7879', '环境监测')], [{ section: null }, { section: '' }])
    const r = countOrphanChartCarriers(parsed)
    expect(r.orphanCount).toBe(0)
    expect(r.evaluated).toBe(0)
  })

  test('无段 / 无图表 / 畸形输入 ⇒ 零（fail-open）', () => {
    expect(countOrphanChartCarriers(null).orphanCount).toBe(0)
    expect(countOrphanChartCarriers({}).orphanCount).toBe(0)
    expect(countOrphanChartCarriers(vision([], [{ section: '2:7625' }])).orphanCount).toBe(0)
    expect(countOrphanChartCarriers(vision([section('2:1', 's')])).orphanCount).toBe(0)
  })

  test('幂等：连跑两次结果相同，且不改写入参', () => {
    const parsed = vision([section('2:3550', 'h')], [{ section: '2:7625' }])
    const before = JSON.stringify(parsed)
    const a = countOrphanChartCarriers(parsed)
    const b = countOrphanChartCarriers(parsed)
    expect(a).toEqual(b)
    expect(JSON.stringify(parsed)).toBe(before)
  })
})

describe('shouldRetryVisionAnalysis · 第三支判据', () => {
  test('3 段 + 无承载图表 ⇒ 触发重试（原段数契约要求 <3，恰好漏掉本例）', () => {
    const r = shouldRetryVisionAnalysis({ sections: 3, truthLeafSections: 6, orphanCharts: 2 })
    expect(r.retry).toBe(true)
    expect(r.fewSections).toBe(false)
    expect(r.orphanCharts).toBe(true)
  })

  test('无承载图表为 0 ⇒ 行为与旧版完全一致（3 段不重试）', () => {
    const r = shouldRetryVisionAnalysis({ sections: 3, truthLeafSections: 6, orphanCharts: 0 })
    expect(r.retry).toBe(false)
  })

  test('旧两支判据不受影响', () => {
    expect(shouldRetryVisionAnalysis({ sections: 1, truthLeafSections: 6 }).retry).toBe(true)
    expect(shouldRetryVisionAnalysis({ sections: 7, lowCoverage: true }).retry).toBe(true)
    expect(shouldRetryVisionAnalysis({}).retry).toBe(false)
  })
})

/**
 * 🛡️ 2026-11-15 事故回归锚（mc-max-1794727523599-4b4b4449）：
 *   旧实现 `sections*1000 + rate - orphans*1e6` 把「段数 1 / rate 83 / orphan 0」
 *   判优于「段数 8 / rate 90 / orphan 2」⇒ 选了只剩一个内容容器的退化结构 ⇒
 *   acceptance 连锁 FAIL（E3-v4 / D1）→ DO-NOT-INVENT 硬失败、零产物。
 *   本组用例锁死分层顺序：结构差 ≥2 段 > 覆盖率差 ≥2pp > orphan 破平。
 */
describe('pickBetterVisionAnalysis · 分层裁决（结构 > 覆盖率 > orphan）', () => {
  test('真机事故形态：1段/83/0 vs 8段/90/2 ⇒ 必须选重试支（段数多）', () => {
    const choice = pickBetterVisionAnalysis(
      { sections: 1, rate: 83, orphans: 0 },
      { sections: 8, rate: 90, orphans: 2 },
    )
    expect(choice).toBe('retry')
  })

  test('段数差 ≥2 时 orphan 无权否决（5段/0 vs 9段/2 ⇒ retry）', () => {
    const choice = pickBetterVisionAnalysis(
      { sections: 5, rate: 70, orphans: 0 },
      { sections: 9, rate: 70, orphans: 2 },
    )
    expect(choice).toBe('retry')
  })

  test('段数差 ≤1 时用覆盖率：差 ≥2pp 才分胜负', () => {
    expect(
      pickBetterVisionAnalysis({ sections: 5, rate: 70, orphans: 0 }, { sections: 6, rate: 75, orphans: 0 }),
    ).toBe('retry')
    expect(
      pickBetterVisionAnalysis({ sections: 5, rate: 75, orphans: 0 }, { sections: 6, rate: 70, orphans: 0 }),
    ).toBe('first')
  })

  test('段数与覆盖率都同档 ⇒ 才用 orphan 破平（少者胜）', () => {
    expect(
      pickBetterVisionAnalysis({ sections: 5, rate: 70, orphans: 8 }, { sections: 5, rate: 70, orphans: 0 }),
    ).toBe('retry')
    expect(
      pickBetterVisionAnalysis({ sections: 5, rate: 70, orphans: 0 }, { sections: 5, rate: 70, orphans: 2 }),
    ).toBe('first')
  })

  test('无 orphan 维度时退回旧行为（段数优先）', () => {
    expect(pickBetterVisionAnalysis({ sections: 3, rate: 70 }, { sections: 7, rate: 60 })).toBe('retry')
    expect(pickBetterVisionAnalysis({ sections: 7, rate: 70 }, { sections: 3, rate: 60 })).toBe('first')
  })

  test('缺字段全按 0 处理，不抛错', () => {
    expect(pickBetterVisionAnalysis({}, {})).toBe('retry')
    expect(pickBetterVisionAnalysis(undefined, { sections: 3 })).toBe('retry')
  })
})

/**
 * 🔴 2026-11-18 真机事故回归锚（mc-max-1795012976783-9778c031）。
 *
 * 病灶链：vision 首次把整组件塌成 **1 段**（`2:1169`「策略类型分布」），而元素召回仍
 *   `13/13 = 100%`；系统据段数契约自动重跑，得 **2 段**（`287:4`/`287:5`）但召回 **67%**。
 *   旧实现：段数差 `|2-1| = 1 < SECTION_GAP_DECISIVE(2)` ⇒ 不比段数 ⇒ 转覆盖率，
 *   `|67-100| = 33 ≥ RATE_GAP_DECISIVE(2)` ⇒ 取覆盖率高的 `'first'`（保留塌陷版）。
 *   后果：`contract-audit sections:1` ⇒ 确定性模板 `sectionRoots:1`，且该唯一段是图表段
 *   （`chartOwned` 让给 LLM）⇒ 产物 `<div class="…-slot-con">` 空壳、零子组件、`<style>` 只剩注释。
 *
 * 机理：`coverageRate = coreMatched/(coreMatched+coreMissing)` 是**元素召回**口径，
 *   与**段结构正交** —— 把 N 个元素全塞进一个容器，召回不扣分。故「结构塌陷」必须
 *   有独立否决权，不能用覆盖率补。
 */
describe('pickBetterVisionAnalysis · 结构性塌陷否决权（段数 < 契约下界时段数多者胜）', () => {
  test('真机 A 任务形态：1段/100% vs 2段/67% ⇒ 必须选重试支（塌陷不可用覆盖率补）', () => {
    expect(
      pickBetterVisionAnalysis(
        { sections: 1, rate: 100, orphans: 0 },
        { sections: 2, rate: 67, orphans: 0 },
      ),
    ).toBe('retry')
  })

  test('反向入参：2段/67% vs 1段/100% ⇒ 选首支（判据只看段数，与顺序无关）', () => {
    expect(
      pickBetterVisionAnalysis(
        { sections: 2, rate: 67, orphans: 0 },
        { sections: 1, rate: 100, orphans: 0 },
      ),
    ).toBe('first')
  })

  test('两侧都塌陷但不等 ⇒ 仍选段数多者（更接近真值）', () => {
    expect(pickBetterVisionAnalysis({ sections: 1, rate: 90 }, { sections: 2, rate: 30 })).toBe('retry')
  })

  test('两侧段数均达标（≥3）⇒ 本支不介入，回落到 ② 覆盖率裁决', () => {
    // 3 vs 4：差 1 未达 ①；覆盖率差 20pp ≥ 2 ⇒ 取高者
    expect(pickBetterVisionAnalysis({ sections: 3, rate: 60 }, { sections: 4, rate: 80 })).toBe('retry')
    expect(pickBetterVisionAnalysis({ sections: 3, rate: 80 }, { sections: 4, rate: 60 })).toBe('first')
  })

  test('段数相等且都塌陷 ⇒ 本支不介入（并列走 ② 覆盖率）', () => {
    expect(pickBetterVisionAnalysis({ sections: 2, rate: 90 }, { sections: 2, rate: 40 })).toBe('first')
  })

  test('契约下界为单一来源：VISION_SECTION_CONTRACT_MIN 驱动本支开关', () => {
    // 阈值 = min + 1（两侧均达标）⇒ 不介入；阈值 = min（一侧塌陷）⇒ 介入
    expect(
      pickBetterVisionAnalysis({ sections: VISION_SECTION_CONTRACT_MIN, rate: 70 }, { sections: VISION_SECTION_CONTRACT_MIN + 1, rate: 60 }),
    ).toBe('first') // 达标两侧：① 差 1 不决、② 覆盖率 70 > 60 ⇒ first
    expect(
      pickBetterVisionAnalysis({ sections: VISION_SECTION_CONTRACT_MIN - 1, rate: 70 }, { sections: VISION_SECTION_CONTRACT_MIN, rate: 60 }),
    ).toBe('retry') // 一侧塌陷 ⇒ 段数多者胜
  })
})
