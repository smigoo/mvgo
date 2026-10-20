/**
 * #138 续：assembleGenerationContext#normalizeSectionNode 白名单重建必须透传 E1 互挂真值 rowPeerIds。
 *
 * 断点链（60dee79d/d7abdee8 实锤）：
 *   planner buildEffectiveSection 已透传 rowPeerIds（e35c944 修复）
 *   → 但 normalizeComponentPlan → normalizeSectionNode 白名单重建再次剥掉
 *   → engineer 的 resolveSubComponentPlan **优先取 generationInput.componentPlan**（本函数产物）
 *   → 刀32 真值条件恒 false、fail-open 静默跳过 → 两卡恒上下堆叠。
 */
jest.mock('../../logger/index.js', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}))

import { assembleGenerationContext } from '../generation-context-assembler.js'

describe('normalizeSectionNode 透传 rowPeerIds（#138 续）', () => {
  const state = {
    subComponentPlan: {
      effectiveSections: [
        {
          id: '796:3',
          title: 'icon-con',
          isLayoutContainer: true,
          elementCount: 20,
          children: [
            {
              id: '38:3260',
              title: 'stats-con',
              rowPeerIds: ['38:3282'],
              elementCount: 8,
            },
            {
              id: '38:3282',
              title: 'group-con',
              rowPeerIds: ['38:3260'],
              elementCount: 8,
            },
            {
              id: '38:3137',
              title: 'panel',
              elementCount: 10,
            },
          ],
        },
      ],
      isForced: true,
      minFiles: 3,
    },
  }

  test('normalize 后互挂对保留（generationInput.componentPlan 链路）', () => {
    const input = assembleGenerationContext(state)
    const secs = input.componentPlan.effectiveSections
    const container = secs.find((s: any) => s.id === '796:3')
    expect(container).toBeDefined()
    const a = container.children.find((c: any) => c.id === '38:3260')
    const b = container.children.find((c: any) => c.id === '38:3282')
    expect(a?.rowPeerIds).toEqual(['38:3282'])
    expect(b?.rowPeerIds).toEqual(['38:3260'])
  })

  test('无互挂的 section 不产 rowPeerIds 键（零副作用）', () => {
    const input = assembleGenerationContext(state)
    const secs = input.componentPlan.effectiveSections
    const plain = secs[0].children.find((c: any) => c.id === '38:3137')
    expect(Object.prototype.hasOwnProperty.call(plain, 'rowPeerIds')).toBe(false)
  })
})
