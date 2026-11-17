/**
 * 🛡️ 2026-11-17（D1 段外标题撤出 · mc-max-1794852555195-0f7fb21c 实锤）
 *
 * 病灶：D1 只看 plan 段是否带 header.title，标题不在产物 ⇒ FAIL「分组结构塌陷」。
 *   但标题归属由上游 plan 决定——真机形态：`807:3`（GROUP 'header'）里的 TEXT
 *   「具身机器人设备列表」被判给 stats 段 `43:4892`、`807:2`（GROUP 'slot-con'）直属
 *   TEXT「点击查看详情」被判给 legend 段 `43:4869`；Figma 树里这两个 TEXT 的 parent
 *   都不是段节点（与段同级，属面板标题条/槽位直属文本）⇒ 接管渲染器的段头取值域是
 *   「段的子树 TEXT」（同源：folded-grid-section-takeover#resolveInBoxSectionHeader）
 *   ⇒ 标题永远渲染不出来 ⇒ D1 恒 FAIL + 修复轮配方不可照抄（假 FAIL）。
 *
 * 治本：D1 收紧为「title 必须能被该段子树佐证」：
 *   · 已物化 ⇒ 通过（原逻辑，零回归）；
 *   · 能证明「title 不在该段子树内」⇒ 撤出该条 + WARN 留痕（检测力移交 C1b/TEXT-COVERAGE）；
 *   · 无 figmaNodeData / 段节点不可得 ⇒ 维持旧行为（不因数据缺失判据失效）。
 *
 * 回归锚取自实测（0f7fb21c checkpoint analysis.json + figma.json 核对），不取自注释。
 */
import { runAcceptanceChecks, GROUP_STRUCTURE_CODES } from './index.js'

// ── 真值树夹具（按 0f7fb21c figma.json 真实父子链形态缩样）──────────────
// secHeader 与 secA / secLegend 同级（在面板标题条 GROUP 内），不在任何段子树里。
const FIGMA_DETACHED = {
  document: {
    id: '0:0',
    name: 'cp-设备列表',
    type: 'GROUP',
    children: [
      // 面板标题条：TEXT 挂在 header GROUP 下（父不是任何段）
      { id: '807:3', name: 'header', type: 'GROUP', children: [{ id: '43:4890', name: '文字', type: 'TEXT', characters: '具身机器人设备列表' }] },
      // 槽位容器：TEXT 直属（父不是 legend 段）
      { id: '807:2', name: 'slot-con', type: 'GROUP', children: [{ id: '43:4878', name: '点击查看详情', type: 'TEXT', characters: '点击查看详情' }] },
      // stats 段：子树里只有数字，没有标题
      { id: '43:4892', name: 'Frame 2136639911', type: 'FRAME', children: [{ id: '43:4893', type: 'TEXT', characters: '8' }] },
      // legend 段：子树里只有图例文本
      { id: '43:4869', name: 'Group 2136638436', type: 'GROUP', children: [{ id: '43:4870', type: 'TEXT', characters: '运行中' }] },
    ],
  },
}

// 段子树里确实带标题的对照树（阴性锚）
const FIGMA_ATTACHED = {
  document: {
    id: '0:0',
    type: 'GROUP',
    children: [
      { id: 'secA', type: 'FRAME', children: [{ id: 'tA', type: 'TEXT', characters: '战略合作厂商' }] },
      { id: 'secB', type: 'FRAME', children: [{ id: 'tB', type: 'TEXT', characters: '优质厂商' }] },
    ],
  },
}

// 产物：两条「段外」标题都缺席（模拟接管渲染器正确地不渲染非本段标题）
const FILES_DETACHED = {
  'package/index.vue': '<template><div><StatsSection /><LegendSection /></div></template>',
  'package/components/StatsSection.vue': '<template><div data-section-id="43:4892">8</div></template>',
  'package/components/LegendSection.vue': '<template><div data-section-id="43:4869">运行中</div></template>',
}

// plan：两条标题分别被判给两个段（归属错误的真机形态）
const PLAN_DETACHED = {
  effectiveSections: [
    { id: '43:4892', type: 'stats', header: { title: '具身机器人设备列表' } },
    { id: '43:4869', type: 'legend', header: { title: '点击查看详情' } },
  ],
}

const dCodes = (fails: any[]) =>
  fails.filter((f) => GROUP_STRUCTURE_CODES.includes(f.code)).map((f) => f.code).sort()

describe('D1 段外标题撤出（0f7fb21c：标题归属错误不得判分组塌陷）', () => {
  test('① 阴性：标题不在该段子树内 ⇒ 撤出、不 FAIL，并打 WARN 留痕', () => {
    const r = runAcceptanceChecks({
      files: FILES_DETACHED,
      figmaNodeData: FIGMA_DETACHED,
      componentPlan: PLAN_DETACHED,
    })
    expect(dCodes(r.fails)).toEqual([])
    const w = (r.warns || []).find((x: string) => x.startsWith('D1 段外标题撤出'))
    expect(w).toBeTruthy()
    expect(w).toContain('43:4892')
    expect(w).toContain('具身机器人设备列表')
    expect(w).toContain('43:4869')
    expect(w).toContain('点击查看详情')
  })

  test('② 阳性对照：标题在段子树内、产物真缺席 ⇒ D1 照旧 FAIL（收紧不放水）', () => {
    const files = {
      'package/index.vue': '<template><div><SecA /><SecB /></div></template>',
      'package/components/SecA.vue': '<template><div data-section-id="secA">其他内容</div></template>',
      'package/components/SecB.vue': '<template><div data-section-id="secB">其他内容</div></template>',
    }
    const plan = {
      effectiveSections: [
        { id: 'secA', type: 'grid', header: { title: '战略合作厂商' } },
        { id: 'secB', type: 'grid', header: { title: '优质厂商' } },
      ],
    }
    const r = runAcceptanceChecks({ files, figmaNodeData: FIGMA_ATTACHED, componentPlan: plan })
    expect(dCodes(r.fails)).toEqual(['D1'])
    expect(r.fails.find((f) => f.code === 'D1').detail).toContain('战略合作厂商')
  })

  test('③ 阳性对照：段内标题已物化 ⇒ 通过（原逻辑零回归）', () => {
    const files = {
      'package/index.vue': '<template><div><SecA /><SecB /></div></template>',
      'package/components/SecA.vue': '<template><div data-section-id="secA">战略合作厂商</div></template>',
      'package/components/SecB.vue': '<template><div data-section-id="secB">优质厂商</div></template>',
    }
    const plan = {
      effectiveSections: [
        { id: 'secA', type: 'grid', header: { title: '战略合作厂商' } },
        { id: 'secB', type: 'grid', header: { title: '优质厂商' } },
      ],
    }
    const r = runAcceptanceChecks({ files, figmaNodeData: FIGMA_ATTACHED, componentPlan: plan })
    expect(dCodes(r.fails)).toEqual([])
  })

  test('④ fail-open：无 figmaNodeData 时维持旧行为（真缺席仍 FAIL）', () => {
    const files = {
      'package/index.vue': '<template><div><SecA /><SecB /></div></template>',
      'package/components/SecA.vue': '<template><div data-section-id="secA">x</div></template>',
      'package/components/SecB.vue': '<template><div data-section-id="secB">y</div></template>',
    }
    const plan = {
      effectiveSections: [
        { id: 'secA', type: 'grid', header: { title: '战略合作厂商' } },
        { id: 'secB', type: 'grid', header: { title: '优质厂商' } },
      ],
    }
    const r = runAcceptanceChecks({ files, componentPlan: plan })
    expect(dCodes(r.fails)).toEqual(['D1'])
    expect((r.warns || []).some((x: string) => x.startsWith('D1 段外标题撤出'))).toBe(false)
  })

  test('⑤ fail-open：段节点在真值树里不存在 ⇒ 维持旧行为，不静默失效', () => {
    // FIGMA_DETACHED 里没有 secX 节点 ⇒ 佐证不可得 ⇒ 按旧逻辑判
    const plan = {
      effectiveSections: [
        { id: 'secX', type: 'grid', header: { title: '战略合作厂商' } },
        { id: 'secY', type: 'grid', header: { title: '优质厂商' } },
      ],
    }
    const r = runAcceptanceChecks({
      files: {
        'package/index.vue': '<template><div>x</div></template>',
      },
      figmaNodeData: FIGMA_DETACHED,
      componentPlan: plan,
    })
    expect(dCodes(r.fails)).toEqual(['D1'])
  })
})
