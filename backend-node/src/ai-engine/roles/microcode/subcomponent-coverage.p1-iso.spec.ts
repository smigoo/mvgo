/**
 * 🧩 P1-3 契约：同构段收敛后覆盖度按「逻辑组」对账（2026-11-12 · 8b15a757 实锤）。
 *
 * 真机病灶：planner R2 密度拆分记账 minFiles=9（三厂商段拆成 group1/2/3），刀66 同构
 * 收敛把三段收成 1 个 v-for + 1 份模板（物理文件 2 个）⇒ expected=9 generated=2
 * missing=7 假缺口；且锚串「大华股份 8台」被产物拆成 {"name":"大华股份","value":"8台"}
 * 后整串不存在 ⇒ anchors-not-materialized 假阳。
 *
 * 红线（阴阳对照）：
 *   · 阴性（豁免生效）：同构组内派生组 + 锚点在产物可寻（整串或拆分形态）⇒ 不算缺失；
 *   · 阳性（不误放水）：①非派生组缺失照拦 ②派生组锚点真缺席照拦 ③不传
 *     isoGroupedSectionIds ⇒ 完全走原判据（零行为变更）。
 */
import { assessSubComponentCoverage } from './subcomponent-coverage.js';

/** 8b15a757 真机同形：planner 记账（minFiles=9 + 5 个派生组） */
const PLAN = {
  isForced: true,
  minFiles: 9,
  internalSubcomponents: [
    {
      id: '38:3162-group1',
      responsibility: '元素分组 1',
      textTruths: ['大华股份 8台', '宇视科技 7台'],
      elementNames: [],
    },
    {
      id: '38:3162-group2',
      responsibility: '元素分组 2',
      textTruths: ['ABB中国 0台', '中科曙光 0台'],
      elementNames: [],
    },
    {
      id: '38:3206-group1',
      responsibility: '元素分组 1',
      textTruths: ['特来电 8台', '金溢科技 8台'],
      elementNames: [],
    },
    {
      id: '38:3137', // 代表段（leaf 段 id = 段 id 本身，无派生后缀）
      responsibility: '段组件',
      textTruths: ['华为技术 8台'],
      elementNames: [],
    },
  ],
}

/** 8b15a757 真机同形产物：v-for 数据行（name/value 拆分形态） */
const FILES_ISO = {
  'package/index.vue': `
const ISO_REPEAT_CONTENT_SECTION = [
  { id: "38:3162", title: "优质厂商", items: [{"name":"大华股份","value":"8台"},{"name":"宇视科技","value":"7台"},{"name":"ABB中国","value":"0台"},{"name":"中科曙光","value":"0台"}] },
  { id: "38:3206", title: "普通厂商", items: [{"name":"特来电","value":"8台"},{"name":"金溢科技","value":"8台"}] }
]`,
  'package/components/ContentSection.vue': '<template><div>{{ title }}</div></template>',
  'package/components/StatsSection.vue': '<template><div>33</div></template>',
}

const ISO_IDS = ['38:3137', '38:3162', '38:3206']

describe('P1-3 · 同构收敛覆盖度豁免（v-for 复用算 1 组 N 实例）', () => {
  it('阴性基线：不传 isoGroupedSectionIds ⇒ 原判据零行为变更（missing 仍虚高）', () => {
    const r = assessSubComponentCoverage({ subPlan: PLAN, files: FILES_ISO })
    expect(r.expected).toBe(9)
    expect(r.generated).toBe(2)
    expect(r.missing).toBe(7)
    expect(r.ok).toBe(false)
    expect(r.missingSubcomponents.length).toBeGreaterThan(0)
  })

  it('豁免生效：同构组内派生组锚点可寻 ⇒ expected 折算、无假缺口', () => {
    const r = assessSubComponentCoverage({
      subPlan: PLAN,
      files: FILES_ISO,
      isoGroupedSectionIds: ISO_IDS,
    })
    // 3 个派生组折算：expected 9 → 6；generated 2 ⇒ missing 4（数量口径仍保守）
    expect(r.expected).toBe(6)
    // 派生组锚点全寻到 ⇒ 不进 missingSubcomponents
    const derived = r.missingSubcomponents.filter((m) => /-group\d/.test(String(m.subId)))
    expect(derived).toEqual([])
    expect(r.anchoredGroups).toBe(3)
  })

  it('阳性红线：派生组锚点真缺席（产物没有该文本）⇒ 照拦不豁免', () => {
    const filesNoAnchor = {
      'package/index.vue': 'const X = []',
      'package/components/ContentSection.vue': '<template><div>空</div></template>',
    }
    const r = assessSubComponentCoverage({
      subPlan: PLAN,
      files: filesNoAnchor,
      isoGroupedSectionIds: ISO_IDS,
    })
    const derived = r.missingSubcomponents.filter((m) => /-group\d/.test(String(m.subId)))
    expect(derived.length).toBe(3)
    expect(r.ok).toBe(false)
  })

  it('阳性红线：非派生组（leaf 段）锚点缺席不受豁免影响', () => {
    const r = assessSubComponentCoverage({
      subPlan: PLAN,
      files: FILES_ISO,
      isoGroupedSectionIds: ISO_IDS,
    })
    // 38:3137-leaf 的锚「华为技术 8台」不在产物（拆分后 value 丢）⇒ 照拦
    const leaf = r.missingSubcomponents.find((m) => m.subId === '38:3137')
    expect(leaf).toBeTruthy()
    expect(leaf.reason).toBe('anchors-not-materialized')
  })

  it('豁免后锚串拆分形态可寻：value 回填（P1-2 联动）⇒ leaf 组也寻到', () => {
    const filesWithValue = {
      ...FILES_ISO,
      'package/index.vue': `${FILES_ISO['package/index.vue']}\n,{"name":"华为技术","value":"8台"}`,
    }
    const r = assessSubComponentCoverage({
      subPlan: PLAN,
      files: filesWithValue,
      isoGroupedSectionIds: ISO_IDS,
    })
    const leaf = r.missingSubcomponents.find((m) => m.subId === '38:3137')
    expect(leaf).toBeFalsy()
  })
})
