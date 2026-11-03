/**
 * A1 样式真值强化 + B1 未匹配项可观测性 —— 单测（2026-11-03）
 *
 * A1：`buildStyleTruthReinforcement` 把 cornerRadius / padding / strokes 的 Figma 真值
 *     下发为「逐节点强制样式约束」，与 layoutMode 通道（buildNodeLayoutFactsReinforcement）对等。
 *     根因（mc-max-1793668153798-e0bf38e9 实锤）：真值 20.46px 的 tab 圆角生成成 4px ——
 *     LLM 照抄了同一份 prompt 里 `border-radius: 4px; // 从 cornerRadius 获取` 的示例字面量。
 * B1：`scoreDimension` 的「最近产物值」计算移出 `if (fuzzyOk)`，让 missed[] 的
 *     closestActualValue / closestActualSource / diff 可达 —— **判定结果必须逐字不变**。
 */
import {
  buildStyleTruthReinforcement,
  buildAllConstraintReinforcements,
} from './constraint-reinforcement.js'
import { computeStyleScore } from './quality-score-v1.js'

// ────────────────────────── Fixtures ──────────────────────────
// 形状对齐真机两条 tab（2:7955 激活 / 2:7957 未激活）
const TAB_ACTIVE: any = {
  id: '2:7955',
  name: 'Frame 2136638771',
  type: 'FRAME',
  cornerRadius: 20.461538314819336,
  paddingLeft: 10.230769157409668,
  paddingRight: 10.230769157409668,
  strokeWeight: 0.7307692170143127,
  strokes: [{ type: 'SOLID', color: { r: 0.78, g: 0.878, b: 1, a: 1 }, opacity: 1 }],
  fills: [{ type: 'SOLID', color: { r: 0.098, g: 0.565, b: 1, a: 1 } }],
  children: [
    {
      id: '2:7956',
      name: '江阴靖江长江隧道',
      type: 'TEXT',
      style: { fontSize: 14 },
      characters: '江阴靖江长江隧道',
    },
  ],
}

const wrap = (children: any[]): any => ({
  document: { id: '0:1', name: 'cp-重点车辆监测', type: 'FRAME', children },
})

// ────────────────────────── A1 ──────────────────────────
describe('buildStyleTruthReinforcement — A1 样式真值通道', () => {
  it('无 figma 数据 → 空串（不产生空标题、不炸）', () => {
    expect(buildStyleTruthReinforcement(null, 'c-x')).toBe('')
    expect(buildStyleTruthReinforcement(undefined, 'c-x')).toBe('')
    expect(buildStyleTruthReinforcement({}, 'c-x')).toBe('')
  })

  it('无任何样式真值（只有布局） → 空串，绝不输出空区块', () => {
    const tree = wrap([{ id: '9:1', name: 'Empty', type: 'FRAME', layoutMode: 'HORIZONTAL' }])
    expect(buildStyleTruthReinforcement(tree, 'c-x')).toBe('')
  })

  it('圆角真值按 Figma cornerRadius 取整下发（20.46 → 20px）', () => {
    const out = buildStyleTruthReinforcement(wrap([TAB_ACTIVE]), 'c-vehicle-monitor')
    expect(out).toContain('🛡️ 样式真值确定性约束')
    expect(out).toContain('`20px`')
    // 真值 20px 必须出现，且「看起来顺眼」的示例值被显式列为臆造
    expect(out).toContain('4px / 8px / 12px')
    expect(out).toContain('一律视为臆造')
  })

  it('内边距真值逐节点下发（10.23 → padding-left/right: 10px）', () => {
    const out = buildStyleTruthReinforcement(wrap([TAB_ACTIVE]), 'c-vehicle-monitor')
    expect(out).toContain('padding-left: 10px; padding-right: 10px')
    expect(out).not.toContain('padding-left: 12px')
  })

  it('描边真值下发（strokeWeight 0.731 + SOLID → border: 0.73px solid #c7e0ff）', () => {
    const out = buildStyleTruthReinforcement(wrap([TAB_ACTIVE]), 'c-vehicle-monitor')
    expect(out).toContain('border: 0.73px solid #c7e0ff')
    expect(out).toContain('禁止省略')
  })

  it('锚点带 figma 节点 id 与人类可读路径（能定位到设计稿哪一层）', () => {
    const out = buildStyleTruthReinforcement(wrap([TAB_ACTIVE]), 'c-vehicle-monitor')
    expect(out).toContain('`2:7955`')
    expect(out).toContain('路径：cp-重点车辆监测 / Frame 2136638771')
  })

  it('自动生成层名（Frame 2136638771）不给 class 契约，语义层名才给', () => {
    const autoNamed = buildStyleTruthReinforcement(wrap([TAB_ACTIVE]), 'c-vehicle-monitor')
    expect(autoNamed).not.toContain('.c-vehicle-monitor-frame-2136638771')

    const semantic = wrap([{ ...TAB_ACTIVE, id: '3:1', name: 'TabsSection' }])
    const semanticOut = buildStyleTruthReinforcement(semantic, 'c-vehicle-monitor')
    expect(semanticOut).toContain('对应 class `.c-vehicle-monitor-tabs-section`')
  })

  it('componentName 已带 c- 前缀时 class 契约不出现双前缀', () => {
    const tree = wrap([{ ...TAB_ACTIVE, id: '3:1', name: 'TabsSection' }])
    const out = buildStyleTruthReinforcement(tree, 'c-vehicle-monitor')
    expect(out).not.toContain('.c-c-')
  })

  it('ELLIPSE 的 cornerRadius 不进入真值（与判据同口径，圆形不是 CSS 圆角）', () => {
    const tree = wrap([{ id: '4:1', name: 'Circle', type: 'ELLIPSE', cornerRadius: 75, fills: [] }])
    expect(buildStyleTruthReinforcement(tree, 'c-x')).toBe('')
  })

  it('顶层可见 fill 为 IMAGE 的节点不进入圆角/描边真值（P4 位图豁免同口径）', () => {
    const tree = wrap([
      {
        id: '5:1',
        name: 'Bitmap',
        type: 'RECTANGLE',
        cornerRadius: 12,
        strokeWeight: 2,
        strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
        fills: [{ type: 'IMAGE', imageRef: 'abc' }],
      },
    ])
    expect(buildStyleTruthReinforcement(tree, 'c-x')).toBe('')
  })

  it('设计稿真有 8px 圆角时，不再把 8px 写成「视为臆造」（避免 prompt 自相矛盾）', () => {
    const tree = wrap([{ id: '6:1', name: 'Card', type: 'FRAME', cornerRadius: 8, fills: [] }])
    const out = buildStyleTruthReinforcement(tree, 'c-x')
    expect(out).toContain('`8px`')
    const blacklistLine = out.split('\n').find((l) => l.includes('一律视为臆造')) || ''
    expect(blacklistLine).not.toContain('8px')
    expect(blacklistLine).toContain('4px')
  })

  it('多节点同值圆角只展开一次，并标注同值节点数（防 prompt 膨胀）', () => {
    const tree = wrap([
      { id: '7:1', name: 'A', type: 'FRAME', cornerRadius: 20, fills: [] },
      { id: '7:2', name: 'B', type: 'FRAME', cornerRadius: 20, fills: [] },
    ])
    const out = buildStyleTruthReinforcement(tree, 'c-x')
    expect(out.match(/`border-radius` \*\*必须\*\*写为 `20px`/g)).toHaveLength(1)
    expect(out).toContain('同值节点共 2 处')
  })

  it('大图集不失控：三个子块各有上限，缺省时给出「未展开」提示', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `8:${i}`,
      name: `N${i}`,
      type: 'FRAME',
      cornerRadius: i + 1,
      strokeWeight: i + 1,
      strokes: [{ type: 'SOLID', color: { r: i / 30, g: 0.5, b: 0.5, a: 1 } }],
      fills: [],
    }))
    const out = buildStyleTruthReinforcement(wrap(many), 'c-x')
    expect(out).toContain('未展开')
    expect(out.length).toBeLessThan(6000)
  })
})

describe('buildAllConstraintReinforcements — A1 注入且不破坏既有铁律', () => {
  it('样式真值块与既有四条铁律并存', () => {
    const out = buildAllConstraintReinforcements({
      layoutStructure: {
        componentId: 'c-vehicle-monitor',
        sections: [{ name: 'header', layout: 'horizontal' }],
      },
      availableResources: [{ assignedVarName: 'bg1' }],
      figmaNodeData: wrap([TAB_ACTIVE]),
    })
    // 既有断言（回归保护）
    expect(out).toContain('🔴 关键约束铁律')
    expect(out).toContain('🚫 布局约束铁律')
    expect(out).toContain('🖼️ 资源约束铁律')
    expect(out).toContain('🎨 样式约束铁律')
    // A1 新增
    expect(out).toContain('🛡️ 样式真值确定性约束')
    expect(out).toContain('`20px`')
  })

  it('无 figma 数据时不注入该块，其余铁律照常', () => {
    const out = buildAllConstraintReinforcements({
      layoutStructure: { sections: [{ name: 'header' }] },
    })
    expect(out).not.toContain('🛡️ 样式真值确定性约束')
    expect(out).toContain('🎨 样式约束铁律')
  })
})

// ────────────────────────── B1 ──────────────────────────
describe('scoreDimension — B1 未匹配项带出「最近产物值」', () => {
  const score = (expected: any, actual: any) =>
    computeStyleScore(expected, actual).dimensions.radius

  it('未匹配项现在带有 closestActualValue / diff（此前恒 null）', () => {
    const r = score({ radius: ['20px'], spacing: [], font: [], color: [] }, { radius: ['4px'] })
    expect(r.matched).toBe(0)
    expect(r.missed).toHaveLength(1)
    expect(r.missed[0].value).toBe('20px')
    expect(r.missed[0].closestActualValue).toBe('4px')
    expect(r.missed[0].diff).toBe(16)
    expect(r.missed[0].unit).toBe('px')
  })

  it('🔒 判定不变性：跨元素容差命中仍按原口径（20px+2px vs 4px → matched=1 / score=50）', () => {
    // 冻结现状：2px 与 4px 差 2 ≤ tolerance 3 ⇒ 模糊命中。
    // 这是 B2（元素锚点）要治的问题，B1 不得顺手改掉它 —— 改判定就不是零回归。
    const r = score(
      { radius: ['20px', '2px'], spacing: [], font: [], color: [] },
      { radius: ['4px'] },
    )
    expect(r.matched).toBe(1)
    expect(r.score).toBe(50)
    expect(r.missed).toHaveLength(1)
    expect(r.missed[0].value).toBe('20px')
    // 而 20px 这一条现在能说清「差多远」
    expect(r.missed[0].closestActualValue).toBe('4px')
    expect(r.missed[0].diff).toBe(16)
  })

  it('🔒 fuzzyMatches 内容不变（命中时仍是 matchedTo + distance）', () => {
    // 差 3：pxMatch 精确匹配的 tol=2 放不过（20 vs 21 是精确命中，不入 fuzzy），
    // 落到 numericFuzzyMatch(tolerance=3) 才成为模糊命中 —— 这正是要冻结的路径。
    const r = score({ radius: ['20px'], spacing: [], font: [], color: [] }, { radius: ['23px'] })
    expect(r.matched).toBe(1)
    expect(r.fuzzyMatches).toHaveLength(1)
    expect(r.fuzzyMatches[0]).toMatchObject({ expected: '20px', matchedTo: '23px', unit: 'px' })
  })

  it('颜色维度同样可达（未匹配色给出最接近的产物色）', () => {
    const r = computeStyleScore(
      { radius: [], spacing: [], font: [], color: ['rgba(102,128,160,0.34)'] },
      { radius: [], spacing: [], font: [], color: ['#2f6bff'] },
    ).dimensions.color
    expect(r.missed[0].value).toBe('rgba(102,128,160,0.34)')
    expect(r.missed[0].closestActualValue).toBe('#2f6bff')
    expect(typeof r.missed[0].diff).toBe('number')
  })

  it('产物侧完全无值时不炸，最近值仍为 null', () => {
    const r = score({ radius: ['20px'], spacing: [], font: [], color: [] }, { radius: [] })
    expect(r.matched).toBe(0)
    expect(r.missed[0].closestActualValue).toBeNull()
    expect(r.missed[0].diff).toBeNull()
  })
})
