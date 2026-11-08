/**
 * 🧱 段内结构事实（P-4 internalGeometry）透传 + prompt 下发单测
 * （2026-11-08 · mc-1794126061219-cbcac19a 实锤）
 *
 * 病灶链：
 *   planner 已采集 `internalGeometry`（日志 internalGeometryFilled:3）
 *   → `normalizeSectionNode` 白名单重建把它剥掉 → production 输入全 undefined
 *   → prompt 里段只剩一句 responsibility → LLM 把「一行两张 193×64.8 卡」画成一张卡铺满
 *   → 底图箭头 2 倍拉伸、卡内 4 组数据挤成一行溢出。
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
import { formatInternalStructureFact } from '../utils/internal-structure-facts.js'

const GEO_TWO_CARDS = [
  { x: 1486, y: 475, w: 193.4, h: 64.8 },
  { x: 1689, y: 475, w: 193.4, h: 64.8 },
]

describe('internalGeometry 透传（白名单第二断点）', () => {
  test('段内结构事实被透传并按几何归一化（取整 + 文本截断）', () => {
    const input = assembleGenerationContext({
      subComponentPlan: {
        effectiveSections: [
          {
            id: '2:8787',
            figmaAnchorId: '89:38',
            internalGeometry: [
              { x: 1485.9999971674945, y: 475.0001136165336, w: 193.39992043504458, h: 64.80017935221639 },
              { x: 1688.9999971674945, y: 475.0001136165336, w: 193.39992043504458, h: 64.80017935221639, text: '总数56302' },
            ],
          },
        ],
      },
    })
    const sec = input.componentPlan.effectiveSections[0]
    expect(Array.isArray(sec.internalGeometry)).toBe(true)
    expect(sec.internalGeometry).toHaveLength(2)
    expect(sec.internalGeometry[0]).toEqual({ x: 1486, y: 475, w: 193, h: 65 })
    expect(sec.internalGeometry[1].text).toBe('总数56302')
  })

  test('非法项被丢弃、上限 24 项、全空则不产键', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 0, w: 10, h: 10 }))
    const input = assembleGenerationContext({
      subComponentPlan: {
        effectiveSections: [
          { id: 'a', internalGeometry: many },
          { id: 'b', internalGeometry: [{ w: 0, h: 0 }, { w: -1, h: 5 }, null] },
          { id: 'c' },
        ],
      },
    })
    const [a, b, c] = input.componentPlan.effectiveSections
    expect(a.internalGeometry).toHaveLength(24)
    expect(Object.prototype.hasOwnProperty.call(b, 'internalGeometry')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(c, 'internalGeometry')).toBe(false)
  })

  test('不再落入 droppedKeys（可观测性口径）', () => {
    const input = assembleGenerationContext({
      subComponentPlan: {
        effectiveSections: [{ id: '2:8787', internalGeometry: GEO_TWO_CARDS }],
      },
    })
    const dropped = input.componentPlan.normalization?.droppedKeys || {}
    expect(dropped.internalGeometry).toBeUndefined()
  })
})

describe('itemSkeleton 透传（卡内骨架 H 契约）', () => {
  test('卡内骨架「文本列竖排 + icon 左」被透传', () => {
    const input = assembleGenerationContext({
      subComponentPlan: {
        effectiveSections: [
          {
            id: '2:8437',
            itemSkeleton: {
              textDirection: 'column',
              gapPx: 4,
              texts: ['摄像机', '(2/484)'],
              icon: { widthPx: 26.6, heightPx: 32 },
              iconPosition: 'left',
            },
          },
        ],
      },
    })
    const sec = input.componentPlan.effectiveSections[0]
    expect(sec.itemSkeleton).toEqual({
      textDirection: 'column',
      gapPx: 4,
      texts: ['摄像机', '(2/484)'],
      icon: { widthPx: 27, heightPx: 32 },
      iconPosition: 'left',
    })
  })

  test('缺 textDirection 或 texts 为空 ⇒ 不产键', () => {
    const input = assembleGenerationContext({
      subComponentPlan: {
        effectiveSections: [
          { id: 'a', itemSkeleton: { texts: ['x'] } },
          { id: 'b', itemSkeleton: { textDirection: 'row', texts: [] } },
          { id: 'c' },
        ],
      },
    })
    const [a, b, c] = input.componentPlan.effectiveSections
    for (const s of [a, b, c]) {
      expect(Object.prototype.hasOwnProperty.call(s, 'itemSkeleton')).toBe(false)
    }
  })

  test('非法 icon 尺寸被丢弃，其余事实保留', () => {
    const input = assembleGenerationContext({
      subComponentPlan: {
        effectiveSections: [
          {
            id: '2:8437',
            itemSkeleton: { textDirection: 'column', texts: ['A'], icon: { widthPx: 0, heightPx: -1 } },
          },
        ],
      },
    })
    const sk = input.componentPlan.effectiveSections[0].itemSkeleton
    expect(sk.textDirection).toBe('column')
    expect(sk.texts).toEqual(['A'])
    expect(sk.icon).toBeUndefined()
  })

  test('不再落入 droppedKeys（可观测性口径）', () => {
    const input = assembleGenerationContext({
      subComponentPlan: {
        effectiveSections: [{ id: '2:8437', itemSkeleton: { textDirection: 'column', texts: ['A'] } }],
      },
    })
    const dropped = input.componentPlan.normalization?.droppedKeys || {}
    expect(dropped.itemSkeleton).toBeUndefined()
  })
})

describe('formatInternalStructureFact（prompt 下发）', () => {
  test('两张同构卡且无任何结构声明 ⇒ 输出「2 个并列同构块」', () => {
    const out = formatInternalStructureFact({
      id: '2:8787',
      internalGeometry: GEO_TWO_CARDS,
    })
    expect(out).toContain('2 个并列同构块')
    expect(out).toContain('193×65')
    expect(out).toContain('禁止合并成 1 块')
    expect(out).toContain('块1')
    expect(out).toContain('块2')
  })

  test('块自带直接文本时逐块列出', () => {
    const out = formatInternalStructureFact({
      internalGeometry: [
        { x: 0, y: 0, w: 100, h: 50, text: '江阴大桥' },
        { x: 120, y: 0, w: 100, h: 50, text: '隧道' },
      ],
    })
    expect(out).toContain('块1：文本「江阴大桥」')
    expect(out).toContain('块2：文本「隧道」')
  })

  test('阴性①：只有 1 项 ⇒ 不输出', () => {
    expect(formatInternalStructureFact({ internalGeometry: [GEO_TWO_CARDS[0]] })).toBe('')
  })

  test('阴性②：几何不同构（尺寸各异）⇒ 不输出', () => {
    const out = formatInternalStructureFact({
      internalGeometry: [
        { x: 0, y: 0, w: 100, h: 50 },
        { x: 120, y: 80, w: 300, h: 200 },
      ],
    })
    expect(out).toBe('')
  })

  test('阴性③：已有 internalSubcomponents ⇒ 不重复提示（避免过度拆分）', () => {
    const out = formatInternalStructureFact({
      internalGeometry: GEO_TWO_CARDS,
      internalSubcomponents: [{ id: 'g1' }, { id: 'g2' }],
    })
    expect(out).toBe('')
  })

  test('阴性④：已有 children ⇒ 不重复提示', () => {
    const out = formatInternalStructureFact({
      internalGeometry: GEO_TWO_CARDS,
      children: [{ id: 'k1' }, { id: 'k2' }],
    })
    expect(out).toBe('')
  })

  test('阴性⑤：无 internalGeometry ⇒ 空串', () => {
    expect(formatInternalStructureFact({ id: 'x' })).toBe('')
  })
})
