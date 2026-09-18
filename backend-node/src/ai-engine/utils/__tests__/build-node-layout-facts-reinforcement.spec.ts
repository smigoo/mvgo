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
