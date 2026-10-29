/**
 * #138 续：assembleGenerationContext#normalizeSectionNode 白名单重建必须透传 E1 互挂真值 rowPeerIds。
 *
 * 断点链（60dee79d/d7abdee8 实锤）：
 *   planner buildEffectiveSection 已透传 rowPeerIds（e35c944 修复）
 *   → 但 normalizeComponentPlan → normalizeSectionNode 白名单重建再次剥掉
 *   → engineer 的 resolveSubComponentPlan **优先取 generationInput.componentPlan**（本函数产物）
 *   → 刀32 真值条件恒 false、fail-open 静默跳过 → 两卡恒上下堆叠。
 */
jest.mock('../logger/index.js', () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}))

import { assembleGenerationContext } from './generation-context-assembler.js'

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

describe('刀29b：normalizeSectionNode 透传几何三件套（mc-max-1793255115028-7ec263c9 实锤）', () => {
  // 断点链：planner 刀28c 给宿主/折叠叶带整列并集几何（470x517）
  // → normalizeComponentPlan 白名单重建剥掉 absoluteBoundingBox/figmaBox
  // → resolveSubComponentPlan 优先取 generationInput.componentPlan ⇒ 装配回查
  //   figma id（首卡 GROUP 72px）⇒ 列表挤进 72px 壳。与 #138 rowPeerIds 同款。
  const state = {
    subComponentPlan: {
      effectiveSections: [
        {
          id: '565:3',
          title: 'slot-con',
          isLayoutContainer: true,
          absoluteBoundingBox: { x: 20831, y: 51606, width: 470, height: 571 },
          figmaBox: { x: 20831, y: 51606, width: 470, height: 571 },
          children: [
            {
              id: '48:5798',
              title: 'list-host',
              isLayoutContainer: true,
              absoluteBoundingBox: { x: 20831, y: 51606, width: 470, height: 517 },
              figmaBox: { x: 20831, y: 51606, width: 470, height: 517 },
              children: [
                {
                  id: '48:5798-list',
                  collapsed: true,
                  renderHint: 'v-for',
                  absoluteBoundingBox: { x: 20831, y: 51606, width: 470, height: 517 },
                  figmaBox: { x: 20831, y: 51606, width: 470, height: 517 },
                  styles: { figmaHeightPx: 517 },
                },
              ],
            },
            { id: '565:3-tail-text', title: 'footer' },
          ],
        },
      ],
      isForced: true,
      minFiles: 5,
    },
  }

  test('⭐ 阳性：宿主/折叠叶的 absoluteBoundingBox/figmaBox/figmaHeightPx 全保留', () => {
    const input = assembleGenerationContext(state)
    const secs = input.componentPlan.effectiveSections
    const host = secs[0].children.find((c: any) => c.id === '48:5798')
    expect(host.absoluteBoundingBox).toEqual({ x: 20831, y: 51606, width: 470, height: 517 })
    expect(host.figmaBox).toEqual({ x: 20831, y: 51606, width: 470, height: 517 })
    const leaf = host.children.find((c: any) => c.id === '48:5798-list')
    expect(leaf.absoluteBoundingBox.height).toBe(517)
    expect(leaf.figmaBox.height).toBe(517)
    expect(leaf.styles.figmaHeightPx).toBe(517)
  })

  test('反向：无几何的 section 不产几何键（零副作用）', () => {
    const input = assembleGenerationContext(state)
    const secs = input.componentPlan.effectiveSections
    const tail = secs[0].children.find((c: any) => c.id === '565:3-tail-text')
    expect(Object.prototype.hasOwnProperty.call(tail, 'absoluteBoundingBox')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(tail, 'figmaBox')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(tail, 'styles')).toBe(false)
  })
})
