/**
 * 🛡️ 空段判据 + 诚实降级（2026-11-05 · mc-max-1793865322699-ef841b68 实锤）
 *
 * 事故链（用户报「效果变差」，截图一块巨幅蓝色）：
 *   vision 把整个 slot 切成「今日累计 + 统计卡片组」⇒ 统计卡片组单段 elementCount=12
 *   触发 planner R2 密度拆分（internalSubcomponents=2）⇒ prompt 要求内部子组件也必须是
 *   独立 .vue 且命名自由 ⇒ LLM 写 3 个 StatsCard*.vue 引用 ⇒ 子组件发现只跑 index.vue
 *   一层 ⇒ 二级文件从未生成 ⇒ stripDanglingComponentRefs 连 import 带标签剥离 ⇒
 *   StatsSection.vue 空壳、卡片全丢、141×74 卡片背景被 100% 100% 拉满三卡总宽。
 *
 * 判据是三层与门（空壳本身不是缺陷，见 section-coverage-guard#detectEmptySectionComponents）：
 *   ① 排除运行时挂载（echarts）② 排除有意隐藏（display:none）
 *   ③ plan 锚定（data-section-id 命中且声明非标题文本）④ 结构为空
 *
 * 本 spec 覆盖：阳性（真机两态 + 补齐后转绿）、四类阴性排除、plan 缺失不判、降级语义、fail-open。
 */
import { describe, it, expect } from '@jest/globals'
// @ts-ignore js 模块无类型声明
import {
  detectEmptySectionComponents,
  degradeEmptySectionComponents,
  detectDanglingComponentRefs,
  stripDanglingComponentRefs,
} from '../section-coverage-guard.js'
// @ts-ignore js 模块无类型声明
import {
  evaluateArtifactCompleteness,
  resolveArtifactIncomplete,
} from '../bad-file-isolation.js'

/** 真机 LLM 原始 chunk（.mc-gen/cache/code-chunks/6-package_components_StatsSection.vue 摘要） */
const REAL_LLM_CHUNK = `<template>
  <div class="c-vehicle-monitor-stats-section" data-section-id="2:8023">
    <div class="c-vehicle-monitor-stats-row">
      <StatsCardDangerous />
      <StatsCardHeavyTruck />
      <StatsCardOverheight />
    </div>
  </div>
</template>

<script setup>
import StatsCardDangerous from './StatsCardDangerous.vue'
import StatsCardHeavyTruck from './StatsCardHeavyTruck.vue'
import StatsCardOverheight from './StatsCardOverheight.vue'
</script>
`

/** 真机落盘终态（3 个空行 = 3 个被剥离的标签 + 背景被注入） */
const REAL_STRIPPED_EMPTY = `<template>
  <div class="c-vehicle-monitor-stats-section" data-section-id="2:8023" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }" v-bind="$attrs">
    <div class="c-vehicle-monitor-stats-row">
      
      
      
    </div>
  </div>
</template>

<script setup>
import bg3 from '../../resources/images/bg-126.png'
</script>
`

/** 旧版正常产物（三卡 v-for 内联，非空） */
const NON_EMPTY_VFOR = `<template>
  <div class="c-vehicle-monitor-content" data-section-id="136:121">
    <div class="c-vehicle-monitor-today">
      <span class="c-vehicle-monitor-today-title">今日累计</span>
    </div>
    <div class="c-vehicle-monitor-group-2136639043">
      <div v-for="item in statCards" :key="item.label" class="c-vehicle-monitor-stat-card">
        <img :src="item.icon" class="c-vehicle-monitor-stat-icon" alt="" />
        <span class="c-vehicle-monitor-stat-label">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>
`

/** 真机 subComponentPlan 摘要：2:8023「统计卡片组」声明 12 元素、含三卡文本真值 */
const PLAN_STATS = {
  isForced: true,
  effectiveSections: [
    {
      id: '2:8023',
      title: '统计卡片组',
      type: 'stats',
      elementCount: 12,
      body: {
        layout: 'horizontal-3-columns',
        children: [
          {
            type: 'stat-card',
            children: [
              { type: 'label', text: '危化品车' },
              { type: 'value', parts: [{ text: '51' }, { text: '次' }] },
            ],
          },
          {
            type: 'stat-card',
            children: [
              { type: 'label', text: '重型货车' },
              { type: 'value', parts: [{ text: '2' }, { text: '次' }] },
            ],
          },
        ],
      },
    },
  ],
}

const asFiles = (
  entries: Array<[string, string]>,
): Record<string, string> => Object.fromEntries(entries)

describe('detectEmptySectionComponents — 阳性', () => {
  it('①真机落盘终态（3 空行）判为空壳', () => {
    const files = asFiles([
      ['package/index.vue', '<template><div><StatsSection /></div></template>'],
      ['package/components/StatsSection.vue', REAL_STRIPPED_EMPTY],
    ])
    expect(detectEmptySectionComponents(files, PLAN_STATS)).toEqual([
      'package/components/StatsSection.vue',
    ])
  })

  it('②真机 LLM chunk 经 strip 后变空壳（端到端重现病灶）', () => {
    const files = asFiles([
      ['package/index.vue', '<template><div><StatsSection /></div></template>'],
      ['package/components/StatsSection.vue', REAL_LLM_CHUNK],
    ])
    // 剥离前：有内容（三个子组件标签）
    expect(detectEmptySectionComponents(files, PLAN_STATS)).toEqual([])
    // 剥离后：import 与标签一并消失 ⇒ 空壳
    const stripped = stripDanglingComponentRefs(files)
    expect(stripped.stripped.length).toBe(1)
    expect(detectEmptySectionComponents(stripped.files, PLAN_STATS)).toEqual([
      'package/components/StatsSection.vue',
    ])
  })

  it('③二级子组件补齐后：悬空归零、空段归零（C 臂转绿）', () => {
    const files = asFiles([
      ['package/index.vue', '<template><div><StatsSection /></div></template>'],
      ['package/components/StatsSection.vue', REAL_LLM_CHUNK],
    ])
    const dangling = detectDanglingComponentRefs(files) as Array<{ expected: string }>
    expect(dangling.map((d) => d.expected).sort()).toEqual([
      'package/components/StatsCardDangerous.vue',
      'package/components/StatsCardHeavyTruck.vue',
      'package/components/StatsCardOverheight.vue',
    ])
    // 模拟 genSubComponents wave2：把检出到的悬空目标全部补齐
    for (const d of dangling) {
      files[d.expected] =
        '<template><div class="card"><span class="v">{{ 1 }}</span></div></template>'
    }
    const stripped = stripDanglingComponentRefs(files)
    expect(stripped.stripped).toEqual([])
    expect(detectEmptySectionComponents(files, PLAN_STATS)).toEqual([])
    expect(detectDanglingComponentRefs(files)).toEqual([])
  })
})

describe('detectEmptySectionComponents — 阴性（四类排除）', () => {
  it('结构非空：v-for 三卡内联（旧版正常产物）不判空', () => {
    const files = asFiles([
      ['package/components/ContentSection.vue', NON_EMPTY_VFOR],
    ])
    expect(detectEmptySectionComponents(files, PLAN_STATS)).toEqual([])
  })

  it('结构非空：纯文本段不判空', () => {
    const files = asFiles([
      ['package/components/TitleSection.vue', '<template>重点车辆监测</template>'],
    ])
    expect(detectEmptySectionComponents(files, PLAN_STATS)).toEqual([])
  })

  it('结构非空：多根 fragment 不判空', () => {
    const files = asFiles([
      [
        'package/components/FragSection.vue',
        '<template><div class="a" /><div class="b" /></template>',
      ],
    ])
    expect(detectEmptySectionComponents(files, PLAN_STATS)).toEqual([])
  })

  it('结构非空：自闭合根（含 void img）不判空——宁漏不误伤', () => {
    const files = asFiles([
      ['package/components/ImgSection.vue', '<template><img src="a.png" /></template>'],
      ['package/components/BoxSection.vue', '<template><div class="x" /></template>'],
    ])
    expect(detectEmptySectionComponents(files, PLAN_STATS)).toEqual([])
  })

  it('① 排除运行时挂载：echarts 容器空是正确形态（全语料 91.6% 命中在此）', () => {
    const files = asFiles([
      [
        'package/components/ChartSection.vue',
        `<template><div class="chart" data-section-id="2:8023"></div></template>
<script setup>
import * as echarts from '@echarts'
</script>`,
      ],
    ])
    expect(detectEmptySectionComponents(files, PLAN_STATS)).toEqual([])
  })

  it('② 排除有意隐藏：刀53 接管产物用 display:none 整段隐藏', () => {
    const files = asFiles([
      [
        'package/components/CardGrid.vue',
        '<template><div data-section-id="2:8023" class="fg-table" style="display:none;"></div></template>',
      ],
    ])
    expect(detectEmptySectionComponents(files, PLAN_STATS)).toEqual([])
  })

  it('③ plan 锚定：section 未在 plan 中声明 ⇒ 不判', () => {
    const files = asFiles([
      ['package/components/StatsSection.vue', REAL_STRIPPED_EMPTY],
    ])
    expect(detectEmptySectionComponents(files, { effectiveSections: [] })).toEqual([])
  })

  it('③ plan 锚定：纯标题段（内容由 base-panel 外壳渲染）不判空', () => {
    const plan = {
      isForced: true,
      effectiveSections: [{ id: '2:8023', title: '重点车辆监测', elementCount: 1 }],
    }
    const files = asFiles([
      [
        'package/components/TitleSection.vue',
        '<template><div class="h" data-section-id="2:8023"><span class="deco"></span></div></template>',
      ],
    ])
    expect(detectEmptySectionComponents(files, plan)).toEqual([])
  })

  it('③ plan 锚定：无 plan 传入 ⇒ 一律不判（fail-safe）', () => {
    const files = asFiles([
      ['package/components/StatsSection.vue', REAL_STRIPPED_EMPTY],
    ])
    expect(detectEmptySectionComponents(files, undefined as any)).toEqual([])
  })

  it('index.vue 不参与本判据（宿主外壳承接）', () => {
    const files = asFiles([
      ['package/index.vue', '<template><base-panel><div></div></base-panel></template>'],
    ])
    expect(detectEmptySectionComponents(files, PLAN_STATS)).toEqual([])
  })

  it('无 <template> 不判空（fail-open）', () => {
    const files = asFiles([
      ['package/components/NoTpl.vue', '<script setup>const a = 1</script>'],
    ])
    expect(detectEmptySectionComponents(files, PLAN_STATS)).toEqual([])
  })

  it('根内嵌套 <template #slot> 的有内容段不判空', () => {
    const files = asFiles([
      [
        'package/components/PanelSection.vue',
        '<template><div class="p" data-section-id="2:8023"><template #header><span>标题</span></template></div></template>',
      ],
    ])
    expect(detectEmptySectionComponents(files, PLAN_STATS)).toEqual([])
  })

  it('fail-open：异常输入返回空数组', () => {
    expect(detectEmptySectionComponents(null as any, PLAN_STATS)).toEqual([])
    expect(detectEmptySectionComponents('not-an-object' as any, PLAN_STATS)).toEqual([])
  })
})

describe('degradeEmptySectionComponents', () => {
  it('剥掉背景、保留 class / data-section-id / 其它属性', () => {
    const files = asFiles([
      ['package/components/StatsSection.vue', REAL_STRIPPED_EMPTY],
    ])
    const res = degradeEmptySectionComponents(files, false, PLAN_STATS)
    const out = res.files['package/components/StatsSection.vue']
    expect(res.degraded).toEqual([
      { file: 'package/components/StatsSection.vue', bgStripped: true },
    ])
    expect(out).not.toContain('backgroundImage')
    expect(out).not.toContain('backgroundSize')
    expect(out).not.toContain('backgroundPosition')
    expect(out).not.toContain('backgroundRepeat')
    expect(out).toContain('data-section-id="2:8023"')
    expect(out).toContain('c-vehicle-monitor-stats-section')
    expect(out).toContain('v-bind="$attrs"')
    expect(out).toContain(':style="{}"')
  })

  it('CSS 形态 style 里的 background 声明也被剥掉', () => {
    const files = asFiles([
      [
        'package/components/CssSection.vue',
        '<template><div class="c" data-section-id="2:8023" style="width:100%;background:url(a.png) no-repeat;height:100%"></div></template>',
      ],
    ])
    const res = degradeEmptySectionComponents(files, false, PLAN_STATS)
    const out = res.files['package/components/CssSection.vue']
    expect(out).not.toContain('background')
    expect(out).toContain('width:100%')
    expect(out).toContain('height:100%')
    expect(res.degraded[0].bgStripped).toBe(true)
  })

  it('非空段零改动：返回原对象引用', () => {
    const files = asFiles([
      ['package/components/ContentSection.vue', NON_EMPTY_VFOR],
    ])
    const res = degradeEmptySectionComponents(files, false, PLAN_STATS)
    expect(res.empty).toEqual([])
    expect(res.degraded).toEqual([])
    expect(res.files).toBe(files)
  })

  it('mutate=true（写盘出口默认）：原地修改，返回同一引用', () => {
    const files = asFiles([
      ['package/components/StatsSection.vue', REAL_STRIPPED_EMPTY],
    ])
    const before = files['package/components/StatsSection.vue']
    const res = degradeEmptySectionComponents(files, true, PLAN_STATS)
    expect(res.files).toBe(files)
    expect(files['package/components/StatsSection.vue']).not.toBe(before)
    expect(files['package/components/StatsSection.vue']).not.toContain('backgroundImage')
  })

  it('mutate=false：不触碰入参，有改动返回浅拷贝', () => {
    const files = asFiles([
      ['package/components/StatsSection.vue', REAL_STRIPPED_EMPTY],
    ])
    const before = files['package/components/StatsSection.vue']
    const res = degradeEmptySectionComponents(files, false, PLAN_STATS)
    expect(res.files).not.toBe(files)
    expect(res.degraded[0].bgStripped).toBe(true)
    expect(files['package/components/StatsSection.vue']).toBe(before)
    expect(files['package/components/StatsSection.vue']).toContain('backgroundImage')
  })

  it('空壳但无背景：记录 bgStripped=false 且内容不变', () => {
    const files = asFiles([
      [
        'package/components/PlainEmpty.vue',
        '<template><div class="p" data-section-id="2:8023"><div class="inner">\n\n</div></div></template>',
      ],
    ])
    const res = degradeEmptySectionComponents(files, false, PLAN_STATS)
    expect(res.empty).toEqual(['package/components/PlainEmpty.vue'])
    expect(res.degraded).toEqual([
      { file: 'package/components/PlainEmpty.vue', bgStripped: false },
    ])
  })

  it('fail-open：异常输入原样返回', () => {
    const res = degradeEmptySectionComponents(null as any, true, PLAN_STATS)
    expect(res.degraded).toEqual([])
    expect(res.empty).toEqual([])
  })
})

describe('evaluateArtifactCompleteness（空段并入完整性摘要）', () => {
  it('空壳 section ⇒ artifactIncomplete=true，并随结果上抛 emptySections', () => {
    const files = asFiles([
      ['package/index.vue', '<template><div><StatsSection /></div></template>'],
      ['package/components/StatsSection.vue', REAL_STRIPPED_EMPTY],
    ])
    const res = evaluateArtifactCompleteness(files, PLAN_STATS, [])
    expect(res.emptySections).toEqual(['package/components/StatsSection.vue'])
    expect(res.artifactIncomplete).toBe(true)
  })

  it('全健康产物 ⇒ artifactIncomplete=false（阴性对照）', () => {
    const files = asFiles([
      ['package/index.vue', '<template><div><ContentSection /></div></template>'],
      ['package/components/ContentSection.vue', NON_EMPTY_VFOR],
    ])
    const res = evaluateArtifactCompleteness(files, PLAN_STATS, [])
    expect(res.emptySections).toEqual([])
    expect(res.artifactIncomplete).toBe(false)
  })

  // 🧩 2026-11-08（评审修订版 §3②）：planner 强制清单缺件并入同一完整性出口。
  it('子组件清单缺件 ⇒ artifactIncomplete=true，并随结果上抛 missingSubcomponents', () => {
    const files = asFiles([
      ['package/index.vue', '<template><div><StatsSection /></div></template>'],
      ['package/components/StatsSection.vue', NON_EMPTY_VFOR],
    ])
    const subComponentPlan = {
      isForced: true,
      minFiles: 5,
      internalSubcomponents: [
        { id: 'g1', textTruths: ['【锚点A】'] },
        { id: 'g2', textTruths: ['【锚点B】'] },
      ],
    }
    const res = evaluateArtifactCompleteness(files, { effectiveSections: [] }, [], {
      subComponentPlan,
    })
    expect(res.missingSubcomponents.map((s: any) => s.subId)).toEqual(['g1', 'g2'])
    expect(res.artifactIncomplete).toBe(true)
  })

  it('resolveArtifactIncomplete：降级文件 / 门禁跳过 / 清单缺件 任一命中即不完整', () => {
    const base = { codeResult: { artifactIncomplete: false }, degradedFiles: [], gateSkippedFinal: [] }
    expect(resolveArtifactIncomplete(base)).toBe(false)
    expect(resolveArtifactIncomplete({ ...base, degradedFiles: ['package/components/A.vue'] })).toBe(true)
    expect(resolveArtifactIncomplete({ ...base, gateSkippedFinal: ['package/components/B.vue'] })).toBe(true)
    expect(
      resolveArtifactIncomplete({
        ...base,
        coverage: { missing: 0, orphanCheck: 'evaluated', missingSubcomponents: [{ subId: 'g1' }] },
      }),
    ).toBe(true)
    // partial 写盘（没有 index.vue）时数量缺口不可信，不得误报
    expect(
      resolveArtifactIncomplete({
        ...base,
        coverage: { missing: 3, orphanCheck: 'skipped:partial', missingSubcomponents: [] },
      }),
    ).toBe(false)
    // 全量写盘的数量缺口可信
    expect(
      resolveArtifactIncomplete({
        ...base,
        coverage: { missing: 2, orphanCheck: 'evaluated', missingSubcomponents: [] },
      }),
    ).toBe(true)
  })

  it('子组件锚点已落独立 .vue ⇒ 不因该维度置为不完整（阴性对照）', () => {
    const files = asFiles([
      ['package/index.vue', '<template><div><StatsSection /><CardsA /><CardsB /></div></template>'],
      ['package/components/StatsSection.vue', NON_EMPTY_VFOR],
      ['package/components/CardsA.vue', '<template><div>【锚点A】</div></template>'],
      ['package/components/CardsB.vue', '<template><div>【锚点B】</div></template>'],
    ])
    const subComponentPlan = {
      isForced: true,
      minFiles: 3,
      internalSubcomponents: [
        { id: 'g1', textTruths: ['【锚点A】'] },
        { id: 'g2', textTruths: ['【锚点B】'] },
      ],
    }
    const res = evaluateArtifactCompleteness(files, { effectiveSections: [] }, [], {
      subComponentPlan,
    })
    expect(res.missingSubcomponents).toEqual([])
    expect(res.artifactIncomplete).toBe(false)
  })
})
