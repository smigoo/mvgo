/**
 * #138：planner buildEffectiveSection 白名单重建必须透传 E1 互挂兄弟真值 rowPeerIds。
 *
 * 事故链（e9165dce 实锤，477e185d/d27c5a1c/e9165dce 三连同根）：
 *   section-tree#nestedSections 挂 rowPeerIds（y 重叠>50% + x 分离 ⇒ 横向并列对）
 *   → planner buildEffectiveSection 白名单重建（显式列字段）把 rowPeerIds 剥掉
 *   → microcode-engineer 刀32（healRowPeersWrap）真值条件永不满足、fail-open 静默跳过
 *   ⇒ 「合作厂商/在线设备」两卡恒上下堆叠。
 *
 * 本 spec 锁定：容器分支与叶子分支的重建产物都保留 rowPeerIds；无该字段不产键。
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

describe('planner 透传 E1 互挂真值 rowPeerIds（#138）', () => {
  const planner = new SubcomponentPlanner()

  function peerSectionsLayout() {
    return {
      sections: [
        {
          id: '796:3',
          name: 'icon-con',
          layout: 'vertical',
          layoutSource: 'container-rebuild',
          children: [
            {
              id: '38:3260',
              name: 'stats-con',
              rowPeerIds: ['38:3282'],
              absoluteBoundingBox: { x: 100, y: 0, width: 300, height: 80 },
              body: { children: [{ role: 'statistic' }, { role: 'label' }] },
            },
            {
              id: '38:3282',
              name: 'group-con',
              rowPeerIds: ['38:3260'],
              absoluteBoundingBox: { x: 420, y: 0, width: 300, height: 80 },
              body: { children: [{ role: 'statistic' }, { role: 'label' }] },
            },
            {
              id: '38:3137',
              name: 'panel',
              absoluteBoundingBox: { x: 100, y: 100, width: 620, height: 200 },
              body: { children: [{ role: 'text' }] },
            },
          ],
        },
      ],
    }
  }

  test('重建后容器子级 section 保留 rowPeerIds（互挂对不丢）', () => {
    const plan = planner.plan(peerSectionsLayout(), { enableInternalSplit: false })
    const container = plan.effectiveSections.find((s: any) => s.id === '796:3')
    expect(container).toBeDefined()
    const a = container.children.find((c: any) => c.id === '38:3260')
    const b = container.children.find((c: any) => c.id === '38:3282')
    expect(Array.isArray(a?.rowPeerIds)).toBe(true)
    expect(a.rowPeerIds).toEqual(['38:3282'])
    expect(Array.isArray(b?.rowPeerIds)).toBe(true)
    expect(b.rowPeerIds).toEqual(['38:3260'])
  })

  test('无互挂的 section 不产 rowPeerIds 键（零副作用）', () => {
    const plan = planner.plan(peerSectionsLayout(), { enableInternalSplit: false })
    const container = plan.effectiveSections.find((s: any) => s.id === '796:3')
    const plain = container.children.find((c: any) => c.id === '38:3137')
    expect(plain).toBeDefined()
    expect(plain.rowPeerIds).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(plain, 'rowPeerIds')).toBe(false)
  })

  test('顶层叶子 section（叶子分支重建）同样透传 rowPeerIds', () => {
    const layout = {
      sections: [
        {
          id: '36:1722',
          name: 'img-block',
          rowPeerIds: ['36:1725'],
          body: { children: [{ role: 'image' }] },
        },
        {
          id: '36:1725',
          name: 'title-block',
          rowPeerIds: ['36:1722'],
          body: { children: [{ role: 'text' }] },
        },
      ],
    }
    const plan = planner.plan(layout, { enableInternalSplit: false })
    const img = plan.effectiveSections.find((s: any) => s.id === '36:1722')
    const title = plan.effectiveSections.find((s: any) => s.id === '36:1725')
    expect(img?.rowPeerIds).toEqual(['36:1725'])
    expect(title?.rowPeerIds).toEqual(['36:1722'])
  })
})
