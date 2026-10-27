/**
 * buildNodeLayoutFactsReinforcement 单测（B' P3，2026-09-18）
 * 验证几何布局事实被下发为「逐 figma 节点强制约束」，覆盖 env-monitor 这类内部容器。
 * 注：本仓 .ts spec 走 ts-jest，不剥类型注解，故此处不写 TS 类型（与 build-node-layout-facts.spec.ts 同口径）。
 */
import { buildNodeLayoutFactsReinforcement } from '../constraint-reinforcement.js'
import { compileDesignFacts } from '../../context/design-facts-compiler.js'

describe('buildNodeLayoutFactsReinforcement — B\' P3 提示约束', () => {
  const figmaNodeData = {
    document: {
      id: '0:0',
      children: [
        {
          id: '2:7889',
          name: 'tabs-list',
          children: [
            { id: '89:42', name: 'tab-一氧化碳', absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 40 } },
            { id: '89:43', name: 'tab-能见度', absoluteBoundingBox: { x: 120, y: 0, width: 120, height: 40 } },
          ],
        },
      ],
    },
  }

  it('空事实 → 返回空串（fail-open）', () => {
    expect(buildNodeLayoutFactsReinforcement(null, figmaNodeData)).toBe('')
    expect(buildNodeLayoutFactsReinforcement({}, figmaNodeData)).toBe('')
  })

  it('⭐ env-monitor tabs-list（2:7889）被强制 display:flex; flex-direction:row + 可解析节点名', () => {
    const facts = {
      '2:7889': { display: 'flex', flexDirection: 'row', source: 'geometric-inference', confidence: 'high' },
    }
    const out = buildNodeLayoutFactsReinforcement(facts, figmaNodeData)
    expect(out).toContain('2:7889')
    expect(out).toContain('tabs-list')
    expect(out).toContain('display: flex; flex-direction: row;')
    expect(out).toContain('禁止省略 display')
    expect(out).toContain('禁止用 absolute')
  })

  it('无 figmaNodeData 时退化为仅用 node id（仍可下发约束）', () => {
    const facts = {
      '2:7889': { display: 'flex', flexDirection: 'row', source: 'geometric-inference', confidence: 'high' },
    }
    const out = buildNodeLayoutFactsReinforcement(facts, null)
    expect(out).toContain('2:7889')
    expect(out).toContain('display: flex; flex-direction: row;')
  })

  it('过滤无 display 的残缺事实', () => {
    const facts = { '3:1': { display: null, flexDirection: 'row' } }
    expect(buildNodeLayoutFactsReinforcement(facts, figmaNodeData)).toBe('')
  })

  it('⭐ grid 事实（无 flexDirection）⇒ 不得下发 flex-direction（防 undefined/null 注入）', () => {
    // 2026-10-26 · A2 配套：`display:'grid'` 的事实只带 gridColumns，没有 flexDirection。
    // 原实现无条件拼 `flex-direction: ${fact.flexDirection}` ⇒ prompt 里写
    // `display: grid; flex-direction: undefined;`，LLM 照抄即污染产物。
    const facts = {
      '4:10': { display: 'grid', gridColumns: 4, source: 'geometric-grid-inference', confidence: 'high' },
    }
    const out = buildNodeLayoutFactsReinforcement(facts, figmaNodeData)
    expect(out).toContain('display: grid;')
    // ① 全文不得出现非法键值（这一条与前言措辞无关，永真有效）
    expect(out).not.toMatch(/flex-direction\s*:\s*(undefined|null|NaN|inherit|''|"")/)
    expect(out).not.toContain('undefined')
    // ② 该节点那一行**不得出现 flex-direction 声明**（允许出现「不要写 flex-direction」这类禁止语）
    const nodeLine = out.split('\n').find((l) => l.includes('`4:10`')) || ''
    expect(nodeLine).not.toBe('')
    expect(nodeLine).toContain('display: grid;')
    expect(nodeLine).not.toMatch(/flex-direction\s*:/)
    // ②-b grid 行要给出正确的替代指引（列数走 grid-template-columns）
    expect(nodeLine).toContain('grid-template-columns')
    // ③ 前言也不得再要求「必须原样写入 display / flex-direction」（grid 无方向，会自相矛盾）
    expect(out).not.toContain('必须**原样写入 `display` / `flex-direction`')
    expect(out).toContain('禁止凭排版习惯臆造')
  })

  it('⭐ 混合事实（grid + 有方向的 flex）⇒ 前言仍要求方向，但 grid 行不写方向', () => {
    const facts = {
      '4:10': { display: 'grid', gridColumns: 4, source: 'geometric-grid-inference', confidence: 'high' },
      '2:7889': { display: 'flex', flexDirection: 'row', source: 'geometric-inference', confidence: 'high' },
    }
    const out = buildNodeLayoutFactsReinforcement(facts, figmaNodeData)
    // 有方向事实存在时前言保留完整要求
    expect(out).toContain('必须**原样写入 `display` / `flex-direction`')
    expect(out).not.toMatch(/flex-direction\s*:\s*(undefined|null)/)
    const gridLine = out.split('\n').find((l) => l.includes('`4:10`')) || ''
    expect(gridLine).toContain('display: grid;')
    expect(gridLine).not.toMatch(/flex-direction\s*:/)
    const flexLine = out.split('\n').find((l) => l.includes('`2:7889`')) || ''
    expect(flexLine).toContain('display: flex; flex-direction: row;')
  })

  it('⭐ flex 但 flexDirection 非法（null/undefined/垃圾值）⇒ 只下发 display', () => {
    for (const bad of [null, undefined, 'inherit', '', 0]) {
      const facts = { '4:11': { display: 'flex', flexDirection: bad, source: 'x', confidence: 'low' } }
      const out = buildNodeLayoutFactsReinforcement(facts, figmaNodeData)
      expect(out).toContain('display: flex;')
      expect(out).not.toMatch(/flex-direction\s*:\s*(null|undefined)/)
    }
  })

  it('flex-direction 合法值大小写/空白归一后仍下发', () => {
    const facts = { '4:12': { display: 'flex', flexDirection: '  COLUMN ', source: 'x', confidence: 'high' } }
    const out = buildNodeLayoutFactsReinforcement(facts, figmaNodeData)
    expect(out).toContain('display: flex; flex-direction: column;')
  })

  it('⭐ stack 事实（刀 6 同 bbox 叠层）⇒ 下发 grid+grid-area:1/1 层叠指令，不写 flex-direction / 非法 display:stack', () => {
    // 2026-10-27 · 8bbcf027 `36:1726`：Mask group 3 子矩形 bbox 全等 = 层叠。
    // 旧事实 flex/column/high 会把叠层拉成纵流；prompt 必须给出可执行的层叠写法
    // （容器 display:grid + 每个直接子节点 grid-area:1/1），而不是非法的 display:stack。
    const facts = {
      '36:1726': { display: 'stack', source: 'geometric-stack-inference', confidence: 'high' },
    }
    const out = buildNodeLayoutFactsReinforcement(facts, figmaNodeData)
    const nodeLine = out.split('\n').find((l) => l.includes('`36:1726`')) || ''
    expect(nodeLine).not.toBe('')
    expect(nodeLine).toContain('display: grid;')
    expect(nodeLine).toContain('grid-area: 1 / 1')
    expect(nodeLine).not.toMatch(/flex-direction\s*:/)
    expect(out).not.toContain('display: stack')
    expect(out).not.toContain('undefined')
    // 结构化映射：display 保留 stack（供 injector 识别后跳过方向注入），并显式标 stacked
    const mapping = buildNodeLayoutFactsReinforcement(facts, figmaNodeData, 'c-device-x', true)
    const m = Object.values(mapping)[0]
    expect(m.display).toBe('stack')
    expect(m.stacked).toBe(true)
  })
})

describe('compileDesignFacts — B\' P2 接入 nodeLayoutFacts', () => {
  it('返回对象携带 nodeLayoutFacts（由 figma 几何编译）', () => {
    const figmaNodeData = {
      document: {
        id: '0:0',
        children: [
          {
            id: '2:7889',
            name: 'tabs-list',
            children: [
              { id: '89:42', absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 40 } },
              { id: '89:43', absoluteBoundingBox: { x: 120, y: 0, width: 120, height: 40 } },
            ],
          },
        ],
      },
    }
    const facts = compileDesignFacts({ figmaNodeData })
    expect(facts.nodeLayoutFacts).toBeDefined()
    expect(facts.nodeLayoutFacts['2:7889']).toEqual({
      display: 'flex',
      flexDirection: 'row',
      source: 'geometric-inference',
      confidence: 'high',
    })
  })
})
