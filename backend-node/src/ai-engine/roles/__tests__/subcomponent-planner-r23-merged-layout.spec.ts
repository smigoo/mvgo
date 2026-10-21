/**
 * R23（2026-10-21 · mc-max-1792554799450-66d79bff「合作厂商弹窗」实锤）：
 * **归并后的容器方向复算** —— 判据不变，只换输入（原生 children → 归并后的内容节点）。
 *
 * 背景：卡片在真值树里只有「整卡背景 + icon」两个子节点，`label`/`value` 是根级兄弟 TEXT。
 * 用原生 children 判方向必然 `0/1 = 0 ⇒ column(high)`；用归并后的内容节点判得 `2/3 = 0.667 ⇒ row`。
 *
 * 本 spec 的对照设计（防假绿）：
 *   ① 阳性：归并发生 + 无 Auto-Layout ⇒ 翻成 horizontal
 *   ② 阴性：归并后仍是竖排（同 x 上下叠）⇒ **保持 vertical** —— 证明不是「恒改 horizontal」
 *   ③ 阴性：派生集合 == 原生集合 ⇒ 不动（输入没变，不重复判）
 *   ④ 阴性：figma 真实 `layoutMode=VERTICAL` ⇒ 不动（声明事实优先于几何推断）
 *   ⑤ 阴性：`e1Derived=false`（vision 路径）⇒ 不动（判定域闸门）
 */
jest.mock('../../logger/index.js', () => ({
  createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
}))

import { refineDerivedContainerLayout } from '../subcomponent-planner.js'
import { indexFigmaNodes } from '../../utils/section-tree.js'

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

/**
 * 卡 `1:10`（265×76）：原生 children = 背景 `1:11`（铺满） + icon `1:12`（53×55 靠左）
 * 根级兄弟 TEXT：`1:13`（值，右侧下方） / `1:14`（标签，右侧上方）
 */
function makeFigma(opts: { layoutMode?: string } = {}) {
  return {
    id: '1:1',
    name: 'root',
    type: 'FRAME',
    absoluteBoundingBox: box(0, 0, 660, 868),
    children: [
      {
        id: '1:10',
        name: 'card',
        type: 'GROUP',
        absoluteBoundingBox: box(0, 0, 265, 76),
        ...(opts.layoutMode ? { layoutMode: opts.layoutMode } : {}),
        children: [
          { id: '1:11', name: 'bg', type: 'VECTOR', absoluteBoundingBox: box(0, 0, 265, 76) },
          { id: '1:12', name: 'icon', type: 'GROUP', absoluteBoundingBox: box(20, 13, 53, 55) },
        ],
      },
      { id: '1:13', name: '33', type: 'TEXT', absoluteBoundingBox: box(97, 38, 28, 28) },
      { id: '1:14', name: '合作厂商', type: 'TEXT', absoluteBoundingBox: box(97, 13, 64, 24) },
    ],
  }
}

/** 归并后的派生 section：icon 在左，两个文本在右（一上一下） */
function mergedCard(overrides: Record<string, any> = {}) {
  return {
    id: '1:10',
    name: 'card',
    layout: 'vertical',
    children: [{ id: '1:12' }, { id: '1:13' }, { id: '1:14' }],
    ...overrides,
  }
}

const ctxOf = (figma: any, e1Derived = true) => ({
  e1Derived,
  figmaIndex: indexFigmaNodes(figma),
})

describe('R23 归并后容器方向复算', () => {
  test('① 归并发生（3 ≠ 2 且无 Auto-Layout）⇒ 翻成 horizontal', () => {
    const sec = mergedCard()
    refineDerivedContainerLayout(sec, ctxOf(makeFigma()))
    expect(sec.layout).toBe('horizontal')
  })

  test('② 阴性对照：归并后仍竖排（同 x 上下叠）⇒ 保持 vertical（不是恒改 horizontal）', () => {
    const figma: any = makeFigma()
    // 把两个文本挪到 icon 正下方（同 x），此时 3 个节点全部上下叠 ⇒ 必须仍是 vertical
    figma.children[1].absoluteBoundingBox = box(20, 80, 28, 28)
    figma.children[2].absoluteBoundingBox = box(20, 115, 64, 24)
    const sec = mergedCard()
    refineDerivedContainerLayout(sec, ctxOf(figma))
    expect(sec.layout).toBe('vertical')
  })

  test('③ 阴性对照：派生集合 == 原生集合 ⇒ 不动（输入没变不重复判）', () => {
    const sec = mergedCard({ children: [{ id: '1:11' }, { id: '1:12' }] })
    refineDerivedContainerLayout(sec, ctxOf(makeFigma()))
    expect(sec.layout).toBe('vertical')
  })

  test('④ 阴性对照：figma 真实 layoutMode=VERTICAL ⇒ 不动（声明事实优先）', () => {
    const sec = mergedCard()
    refineDerivedContainerLayout(sec, ctxOf(makeFigma({ layoutMode: 'VERTICAL' })))
    expect(sec.layout).toBe('vertical')
  })

  test('⑤ 阴性对照：e1Derived=false（vision 路径）⇒ 不动', () => {
    const sec = mergedCard()
    refineDerivedContainerLayout(sec, ctxOf(makeFigma(), false))
    expect(sec.layout).toBe('vertical')
  })

  test('⑥ 缺 figma 索引 / 节点不存在 ⇒ fail-open 不抛不改', () => {
    const sec = mergedCard()
    refineDerivedContainerLayout(sec, { e1Derived: true, figmaIndex: null })
    expect(sec.layout).toBe('vertical')
    refineDerivedContainerLayout(sec, ctxOf(makeFigma()))
    refineDerivedContainerLayout({ id: '9:99', layout: 'vertical', children: [{ id: '1:12' }, { id: '1:13' }] } as any, ctxOf(makeFigma()))
  })
})
