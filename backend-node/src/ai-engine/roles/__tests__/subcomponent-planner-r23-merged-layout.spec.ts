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
// ⑩-b 反证用：必须调**同一实现**（副本纪律），不得在 spec 里复刻判据
import { decideLayoutForBoxes } from '../../utils/figma-node-layout-facts.js'

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

/**
 * 🛡️ A2（2026-10-26）：**不臆造方向**。
 *
 * 病灶（真机 `mc-max-1793005714013-2cf7079c` / `...47b42841` 设备详情 `801:3`）：
 *   `801:3` 是 `GROUP`，无 `layoutMode`，原生 **9 个子节点里有 5 个 TEXT**
 *   ⇒ `buildNodeLayoutFacts` 用原生 9 子判得 `column(high)` —— **这是对的**。
 *   R23 却把它改成了 `horizontal`：因为 E1 归并把那些 TEXT 收进
 *   `801:3-orphan-text-N` 伪 id，`FIGMA_ID_RE` 过滤后派生侧只剩 3 个真 id
 *   ⇒ pair 总数 36⇒3、side-by-side 1⇒0 ⇒ `ratio=0.3333 ⇒ low`
 *   ⇒ 命中 `figma-node-layout-facts.js:147` 的 `low ⇒ 'row'` 兜底 ⇒ 臆造横向。
 *
 * ⚠️ 正确的判别面是**输入前提**，不是置信度（R23 原案 `1:10` 本身就跑在 low 上）。
 *
 * 全语料实测（208 个真机 checkpoint / 431 个 section）给出的真实边界：
 *   · 含派生伪 id 的 section 共 29 个，**25 个原生 children 含 TEXT** ——
 *     `801:3`×3（臆造 horizontal）、`807:2`×12 + `565:3`×13（本就正确的 vertical）；
 *   · 余下 4 个 `287:6` 派生真 id 仅 1 条，先被闸② 拦掉；
 *   ⇒ 闸⑤「原生含内容 TEXT ⇒ 不复算」拦住全部 25 个，且拦住的方向与既有判定完全一致。
 *
 * 🚫 已废弃的 A2 初版思路（补回伪 id 几何再复算）：`807:2` 的唯一伪 id 是 `-tail-text`
 *   （末尾游离单行文本），补进判定后 pair 6⇒10、side-by-side 1⇒3
 *   ⇒ `ratio 0.1667(high/column) ⇒ 0.3(low)` ⇒ `low ⇒ row` 兜底
 *   ⇒ **把本来正确的 `vertical` 翻成 `horizontal`**。⑩ 用例把这条反证固化下来。
 *
 * 对照设计（防假绿）：
 *   ⑦ 闸⑤ 阳性：`801:3`（原生含 TEXT）⇒ 维持 vertical
 *   ⑦-b 闸⑤ 是拦因（关键）：同夹具但原生 TEXT 全换成非 TEXT、派生只留 3 真 id
 *       ⇒ **确实翻成 horizontal**，证明 ⑦ 的「不翻」来自闸⑤，不是链路坏了
 *   ⑧ 闸④ 阴性：原生无 TEXT + 伪 id 解不出几何 ⇒ 跳过不覆盖
 *   ⑨ 闸④ 兜底：原生无 TEXT + 伪 id 可解 ⇒ 补证据参与复算（判 vertical）
 *   ⑩ 误伤回归：`807:2` 真机几何（原生 1 TEXT + `-tail-text`）⇒ 维持 vertical；
 *       并直接用 `decideLayoutForBoxes` 反证「若走补证据会得 row」
 */
function deviceDetail801Figma(): any {
  const B = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })
  return {
    id: '36:1693',
    name: 'cp-设备详情',
    type: 'FRAME',
    absoluteBoundingBox: B(24745, 51499, 547, 493),
    children: [
      {
        id: '801:3',
        name: 'slot-icon',
        type: 'GROUP',
        absoluteBoundingBox: B(24745, 51499, 547, 493),
        children: [
          { id: '36:1695', name: 'Rectangle 346242326', type: 'RECTANGLE', absoluteBoundingBox: B(24745, 51799, 547, 193) },
          { id: '36:1698', name: '编码', type: 'TEXT', characters: '编码', absoluteBoundingBox: B(24864, 51556, 32, 16) },
          { id: '36:1708', name: '产品描述', type: 'TEXT', characters: '产品描述', absoluteBoundingBox: B(24772, 51824, 64, 16) },
          {
            id: '36:1719',
            name: '该设备为太阳能供电一体化爆闪灯…',
            type: 'TEXT',
            characters: '该设备为太阳能供电一体化爆闪灯…',
            absoluteBoundingBox: B(24772, 51849, 496, 90),
          },
          {
            id: '81:7',
            name: 'Group 2136638454',
            type: 'GROUP',
            absoluteBoundingBox: B(24745, 51630, 440, 135.25),
            children: [
              { id: '36:1699', name: 'v1', type: 'TEXT', characters: 'v1', absoluteBoundingBox: B(24745, 51630, 100, 16) },
            ],
          },
          { id: '36:1721', name: '爆闪灯', type: 'TEXT', characters: '爆闪灯', absoluteBoundingBox: B(24989, 51556, 48, 16) },
          {
            id: '36:1722',
            name: 'Frame 2136639901',
            type: 'FRAME',
            layoutMode: 'HORIZONTAL',
            absoluteBoundingBox: B(24905, 51553, 72, 22),
          },
          { id: '36:1724', name: 'GD-Robot-04', type: 'TEXT', characters: 'GD-Robot-04', absoluteBoundingBox: B(24864, 51514, 147, 24) },
          {
            id: '36:1725',
            name: 'img',
            type: 'GROUP',
            absoluteBoundingBox: B(24745, 51499, 98, 98),
            children: [{ id: '36:1726', name: 'i', type: 'RECTANGLE', absoluteBoundingBox: B(24745, 51499, 98, 98) }],
          },
        ],
      },
    ],
  }
}

/** 派生 7 子：3 个 figma 原生 id + 4 条孤儿带伪 id（几何取自真机 section-tree 的 band 并集框） */
function derived801Children(opts: { withPseudoGeometry?: boolean; resolvableSources?: boolean } = {}): any[] {
  const { withPseudoGeometry = true, resolvableSources = true } = opts
  const B = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })
  const band = (idx: number, src: string[], bx: any) => ({
    id: `801:3-orphan-text-${idx}`,
    type: 'text',
    sourceNodeIds: resolvableSources ? src : [`dead:${idx}`],
    ...(withPseudoGeometry ? { absoluteBoundingBox: bx } : {}),
  })
  return [
    { id: '36:1725' },
    band(0, ['36:1724'], B(24864, 51514, 147, 24)),
    { id: '36:1722' },
    band(1, ['36:1698', '36:1721'], B(24864, 51556, 173, 16)),
    { id: '81:7' },
    band(2, ['36:1708'], B(24772, 51824, 64, 16)),
    band(3, ['36:1719'], B(24772, 51849, 496, 90)),
  ]
}

/** 把 801:3 原生 children 的 TEXT 全降级成非 TEXT（模拟 `38:3260`「原生无内容文本」形态） */
function deviceDetail801NoRawText(): any {
  const figma: any = deviceDetail801Figma()
  const kids = figma.children[0].children
  for (const c of kids) if (String(c.type).toUpperCase() === 'TEXT') c.type = 'RECTANGLE'
  return figma
}

/** `807:2` 真机几何（`c-device-0a7ab4b1/.checkpoint/figma.json` 逐字复刻） */
function device807Figma(): any {
  const B = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })
  return {
    id: '36:1693',
    name: 'cp-设备详情',
    type: 'FRAME',
    absoluteBoundingBox: B(29636, 51637, 483, 515),
    children: [
      {
        id: '807:2',
        name: 'dialog-card',
        type: 'GROUP',
        absoluteBoundingBox: B(29636, 51637, 483, 515),
        children: [
          { id: '43:4784', type: 'FRAME', layoutMode: 'HORIZONTAL', absoluteBoundingBox: B(29636, 51728, 470, 388) },
          { id: '43:4869', type: 'GROUP', absoluteBoundingBox: B(29636, 52138, 53, 14) },
          { id: '43:4875', type: 'GROUP', absoluteBoundingBox: B(29708, 52138, 39, 14) },
          { id: '43:4878', type: 'TEXT', characters: '点击查看详情', absoluteBoundingBox: B(30001, 52138, 84, 14) },
          { id: '43:4892', type: 'FRAME', layoutMode: 'HORIZONTAL', absoluteBoundingBox: B(29636, 51637, 470, 66) },
          { id: '43:4911', type: 'FRAME', absoluteBoundingBox: B(30095, 52141, 8, 8) },
          { id: '43:5688', type: 'RECTANGLE', absoluteBoundingBox: B(30113, 51815, 6, 218) },
        ],
      },
    ],
  }
}

/** 派生 5 子：4 个容器真 id + 1 条 `-tail-text` 伪 id（src=43:4878） */
function derived807Children(): any[] {
  return [
    { id: '43:4892' },
    { id: '43:4784' },
    { id: '43:4869' },
    { id: '43:4875' },
    { id: '807:2-tail-text', type: 'text', sourceNodeIds: ['43:4878'] },
  ]
}

describe('A2 不臆造方向 · 闸⑤ 适用前提（原生含内容 TEXT ⇒ 不复算）', () => {
  test('⑦ 阳性：801:3 原生含 5 个 TEXT ⇒ 维持 vertical（真机 buildNodeLayoutFacts 的真值）', () => {
    const sec: any = { id: '801:3', name: 'slot-icon', layout: 'vertical', children: derived801Children() }
    refineDerivedContainerLayout(sec, ctxOf(deviceDetail801Figma()))
    expect(sec.layout).toBe('vertical')
  })

  test('⑦-b 拦因对照（关键）：同夹具但原生 TEXT 全降级 + 派生只留 3 真 id ⇒ 确实翻成 horizontal', () => {
    // 这一条证明 ⑦ 的「不翻」来自闸⑤ 生效，而不是复算链路坏掉
    const sec: any = {
      id: '801:3',
      name: 'slot-icon',
      layout: 'vertical',
      children: [{ id: '36:1725' }, { id: '36:1722' }, { id: '81:7' }],
    }
    refineDerivedContainerLayout(sec, ctxOf(deviceDetail801NoRawText()))
    expect(sec.layout).toBe('horizontal')
  })

  test('⑦-c 闸⑤ 前提下即便伪 id 几何齐备也不复算（闸序：⑤ 先于 ④）', () => {
    const sec: any = {
      id: '801:3',
      name: 'slot-icon',
      layout: 'vertical',
      children: derived801Children({ withPseudoGeometry: true }),
    }
    refineDerivedContainerLayout(sec, ctxOf(deviceDetail801Figma()))
    expect(sec.layout).toBe('vertical')
  })

  test('⑩ 误伤回归：807:2 原生含 1 个 TEXT + tail-text ⇒ 维持 vertical', () => {
    const sec: any = { id: '807:2', name: 'dialog-card', layout: 'vertical', children: derived807Children() }
    refineDerivedContainerLayout(sec, ctxOf(device807Figma()))
    expect(sec.layout).toBe('vertical')
  })

  test('⑩-b 反证：807:2 若走「补伪 id 证据再复算」会得 row ⇒ 故该思路已废弃', () => {
    const figma = device807Figma()
    const idx = indexFigmaNodes(figma) as any
    const realKids = ['43:4892', '43:4784', '43:4869', '43:4875']
    const nodes = realKids.map((id) => idx.get(id)?.rawNode).filter(Boolean)
    // 补进 tail-text 的并集框（src 只有 43:4878 一个 TEXT）
    const tailBox = { x: 30001, y: 52138, width: 84, height: 14 }
    nodes.push({ id: '807:2-tail-text', type: 'TEXT', absoluteBoundingBox: tailBox })
    const decide = decideLayoutForBoxes(nodes, figma.children[0].absoluteBoundingBox)
    expect(decide?.flexDirection).toBe('row') // ← 正是这个结果说明不能这么做
    expect(decide?.confidence).toBe('low')
  })
})

describe('A2 不臆造方向 · 闸④ 输入完整性（原生无 TEXT 时的兜底）', () => {
  test('⑧ 阴性：伪 id 既无自带几何、sourceNodeIds 也解不出 ⇒ 跳过不覆盖', () => {
    const sec: any = {
      id: '801:3',
      name: 'slot-icon',
      layout: 'vertical',
      children: derived801Children({ withPseudoGeometry: false, resolvableSources: false }),
    }
    refineDerivedContainerLayout(sec, ctxOf(deviceDetail801NoRawText()))
    expect(sec.layout).toBe('vertical')
  })

  test('⑨ 兜底：伪 id 可经 sourceNodeIds 并集解出 ⇒ 参与复算，判得 vertical', () => {
    // 原生已无 TEXT（闸⑤ 放行），派生 7 项含 4 条孤儿带 ⇒ 补证据后 3/21=0.1429 high column
    const sec: any = {
      id: '801:3',
      name: 'slot-icon',
      layout: 'vertical',
      children: derived801Children({ withPseudoGeometry: false }),
    }
    refineDerivedContainerLayout(sec, ctxOf(deviceDetail801NoRawText()))
    expect(sec.layout).toBe('vertical')
  })

  test('⑨-b 兜底反向对照：同样原生无 TEXT，但删掉 4 条孤儿带 ⇒ 翻成 horizontal（证明 ⑨ 是补证据而非关功能）', () => {
    const sec: any = {
      id: '801:3',
      name: 'slot-icon',
      layout: 'vertical',
      children: [{ id: '36:1725' }, { id: '36:1722' }, { id: '81:7' }],
    }
    refineDerivedContainerLayout(sec, ctxOf(deviceDetail801NoRawText()))
    expect(sec.layout).toBe('horizontal')
  })
})
