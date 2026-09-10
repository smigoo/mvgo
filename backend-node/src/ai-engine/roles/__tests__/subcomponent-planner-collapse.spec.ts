/**
 * planner.plan() 接线：同构重复卡片折叠为 list/grid。
 *
 * 不放进 planner-p2.spec：该套件静态 import logger → backend-root.js 的 import.meta，
 * jest CJS 下整套件加载失败（既有基线）。本文件 mock logger 切断该边。
 */
jest.mock('../../logger/index.js', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}))

import { SubcomponentPlanner } from '../subcomponent-planner.js'

function card(id: string, groupNo: string) {
  return {
    id,
    name: `Group ${groupNo}`,
    body: {
      children: [
        { id: `${id}-a`, role: 'item' },
        { id: `${id}-b`, role: 'item' },
        { id: `${id}-c`, role: 'item' },
      ],
    },
  }
}

function deco(id: string) {
  return {
    id,
    name: 'Group 1321317970',
    body: {
      children: [
        { id: `${id}-a`, role: 'item' },
        { id: `${id}-b`, role: 'item' },
      ],
    },
  }
}

describe('SubcomponentPlanner 重复同构折叠', () => {
  const planner = new SubcomponentPlanner()

  test('device 形态：12 卡 + 12 装饰交错 → 1 个 grid + v-for，不再拆 41 个 section', () => {
    const sections: Array<Record<string, unknown>> = [
      { id: 'header-stats', name: '顶部统计区', body: { children: [{ role: 'statistic' }] } },
      { id: 'content-area', name: '主内容区', body: { children: [{ role: 'sidebar' }, { role: 'body' }] } },
      { id: '89:37', name: '@antd/tab', body: { children: [{ role: 'tab' }, { role: 'panel' }] } },
    ]
    for (let i = 0; i < 12; i++) {
      sections.push(card(`card-${i}`, `2136637${100 + i}`))
      sections.push(deco(`deco-${i}`))
    }

    const plan = planner.plan({ sections }, { enableInternalSplit: true })
    const lists = plan.effectiveSections.filter(
      (s: { collapsed?: boolean; renderHint?: string; type?: string }) =>
        s.collapsed === true || s.renderHint === 'v-for' || s.type === 'grid' || s.type === 'list',
    )

    expect(plan.effectiveSections.length).toBeLessThan(10)
    expect(plan.effectiveSections.length).toBeGreaterThanOrEqual(3)
    expect(lists).toHaveLength(1)
    expect(lists[0].itemCount).toBe(12)
    expect(lists[0].renderHint).toBe('v-for')
    expect(String(lists[0].responsibility)).toMatch(/v-for/)
    expect(lists[0].shouldSplitInternally).toBe(false)
    expect(lists[0].type).toBe('grid')
    expect(lists[0].internalSubcomponents).toHaveLength(0)
    expect(Array.isArray(lists[0].items)).toBe(true)
    expect(lists[0].items).toHaveLength(12)
  })
})
