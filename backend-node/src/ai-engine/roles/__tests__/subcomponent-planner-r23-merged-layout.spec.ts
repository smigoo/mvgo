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
 *   `801:3` 是 `GROUP`、无 `layoutMode`，原生 **9 个子节点里有 5 个 TEXT**
 *   ⇒ `buildNodeLayoutFacts` 用原生 9 子判得 `column(high)` —— **这是对的**。
 *   R23 却把它改成了 `horizontal`：E1 归并后派生集合只剩 4 个真 id
 *   （`36:1725`/`36:1722`/`36:1698`/`81:7`，其余内容文本被收进 `-orphan-text-N` 伪 id
 *   并被 `FIGMA_ID_RE` 过滤掉）⇒ pair 总数 36⇒6、side-by-side 7⇒3
 *   ⇒ `ratio=0.5 ⇒ low` ⇒ 命中 `figma-node-layout-facts.js:147` 的 `low ⇒ 'row'` 兜底 ⇒ 臆造横向。
 *
 * 🎯 判别面 = **闸⑤ 事实优先（两条件合取）**：
 *   条件 A：原生 `children` 含 `type==='TEXT'` 的**内容文本**；
 *   条件 B：既有 A 类事实 `confidence === 'high'`（用**同一实现** `decideLayoutForBoxes` 复算）；
 *   两条件**同时满足** ⇒ 既有方向就是可信事实，不复算。缺一不可：
 *     · 只看 A 不行 —— `807:2` 原生确有 1 个 TEXT，但既有事实是 `row/`**low**
 *       （7 项落模糊带 ⇒ 命中 `:147` 的 `low ⇒ row` 兜底，**不是判出来的**；真机几何 dump 为竖排：
 *       header 51637/h66 → 内容框 51728/h388 → 底部行 52138，另有 6×218 竖分隔条）
 *       ⇒ 拦住 R23 等于把「猜出来的 row」当事实保留 ⇒ 9 个组件反向回归。
 *     · 只看 B 也不行 —— R23 立身原案（卡片 `38:3260`：原生只有 bg VECTOR + icon，
 *       文本是根级兄弟）既有事实**也是** `column/high`（0/1=0 的假高置信），
 *       复算得 `row/low` 才是对的 ⇒ 单看置信度会直接推翻原案。
 *   ⇒ 两条件合取后：原案原生无 TEXT ⇒ 放行；`801:3` 两条都满足 ⇒ 拦住。
 *
 * 全语料实测（165 个组件 / 29 个含派生伪 id 的 section；`scripts/tmp-a2-gate5b-scan.mjs`）：
 *   · A∧B ⇒ 拦 **16**：`565:3`×13（基线 `column/high`，现网已 vertical ⇒ 不变）
 *                       + `801:3`×3（基线 vertical，现网被 R23 臆造 horizontal ⇒ 本闸修复）；
 *   · A∧¬B ⇒ 放 **9**：全为 `807:2`（基线 `row/low`，现网 vertical ⇒ R23 保留其正向修复）；
 *   · ¬A ⇒ 放 **4**：全为 `287:6`（基线 `column/high(0.000)`）—— 闸⑤ 与它们无关，
 *     行为与改动前完全一致。
 *   ⇒ 拦下的方向与既有判定一致，且不牺牲 R23 对 `807:2` 的正向修复。
 *
 * ⚠️ 判别面是**输入前提（原生是否已含内容文本）× 既有事实置信度**，
 *   **不是**派生侧复算结果的置信度：R23 的立身原案（`1:10` 三子项 `2/3=0.667 ⇒ low ⇒ row`）
 *   **本身就跑在 low 上**，若按「复算 low 就不覆盖」设闸会直接推翻它。
 *
 * 🚫 已废弃的 A2 初版思路「补回伪 id 几何再复算」：`807:2` 的唯一伪 id 是 `-tail-text`
 *   （末尾游离单行文本），补进判定后 pair 6⇒10、side-by-side 1⇒3
 *   ⇒ `ratio 0.1667(high/column) ⇒ 0.3(low)` ⇒ `low ⇒ row` 兜底
 *   ⇒ **把本来正确的 `vertical` 翻成 `horizontal`**。⑩ 用例把这条反证固化下来。
 *
 * 对照设计（防假绿）：
 *   ⑦  闸⑤ A∧B ⇒ 拦：`801:3`（原生 5 TEXT + 既有 high）派生取**真机 R23 时刻的 4 真 id**
 *       ⇒ 维持 vertical（若无闸⑤，该派生集会算得 `row/low` ⇒ horizontal，故本用例有判别力）
 *   ⑦-b 条件 A 反证：同夹具但原生 TEXT 全降级（¬A）⇒ 闸⑤ 不拦 ⇒ **确实翻成 horizontal**
 *       （证明 ⑦ 的「不翻」来自闸⑤，而不是复算链路坏掉）
 *   ⑦-c 条件 B 反证（关键）：`807:2`（原生 1 TEXT 但既有 low）⇒ 闸⑤ 放行 ⇒ R23 复算翻成 vertical
 *   ⑧  闸④ 阴性：原生无 TEXT + 伪 id 无自带几何且 `sourceNodeIds` 也解不出 ⇒ 跳过不覆盖
 *   ⑨  闸④ 兜底：原生无 TEXT + 伪 id 可经 `sourceNodeIds` 解出 ⇒ 补证据参与复算（判 vertical）
 *   ⑨-b 兜底反向对照：同样原生无 TEXT，但删掉 4 条孤儿带 ⇒ 翻成 horizontal（证明 ⑨ 是补证据而非关功能）
 *   ⑩  误伤回归：`807:2` 真机几何 + `-tail-text` ⇒ 直接用同一实现 `decideLayoutForBoxes`
 *       反证「若走补证据会得 row/low」⇒ 故该思路不可作主修
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

/**
 * `801:3` 的**真机 R23 时刻**派生集合：4 个真 id（`36:1698` 是原生 TEXT 之一，
 * 被归并保留下来的那条）—— 与真机日志 `derivedKids:["36:1725","36:1722","36:1698","81:7"]`
 * 逐字一致。⚠️ 不带伪 id：真机 R23 运行时 `-orphan-text-N` 尚未生成。
 */
function derived801Real4(): any[] {
  return [{ id: '36:1725' }, { id: '36:1722' }, { id: '36:1698' }, { id: '81:7' }]
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

/**
 * `807:2` 的**真机 R23 时刻**派生集合：4 个容器真 id（无 `-tail-text`）。
 * ⚠️ 真机日志 `derivedKids:["43:4892","43:4784","43:4869","43:4875"]` 即此；
 *   `-tail-text` 是 R23 **之后**才补上的，用它做输入属仿真失真（见 `derived807WithTail`）。
 */
function derived807Real4(): any[] {
  return [{ id: '43:4892' }, { id: '43:4784' }, { id: '43:4869' }, { id: '43:4875' }]
}

/** `807:2` 派生 5 子：4 真 id + 1 条 `-tail-text` 伪 id（src=43:4878）—— 仅供 ⑩ 反证使用 */
function derived807WithTail(): any[] {
  return [...derived807Real4(), { id: '807:2-tail-text', type: 'text', sourceNodeIds: ['43:4878'] }]
}

describe('A2 不臆造方向 · 闸⑤ 事实优先（A：原生含内容 TEXT  ∧  B：既有事实 high ⇒ 不复算）', () => {
  test('⑦ A∧B ⇒ 拦：801:3 原生 5 TEXT + 既有 column/high ⇒ 维持 vertical', () => {
    // 派生取真机 R23 时刻的 4 真 id ⇒ 若闸⑤ 不生效会算得 row/low ⇒ horizontal（本用例有判别力）
    const sec: any = { id: '801:3', name: 'slot-icon', layout: 'vertical', children: derived801Real4() }
    refineDerivedContainerLayout(sec, ctxOf(deviceDetail801Figma()))
    expect(sec.layout).toBe('vertical')
  })

  test('⑦-b 条件 A 反证：同夹具原生 TEXT 全降级（¬A）⇒ 闸⑤ 不拦 ⇒ 确实翻成 horizontal', () => {
    // 证明 ⑦ 的「不翻」来自闸⑤ 生效，而不是复算链路坏掉
    const sec: any = { id: '801:3', name: 'slot-icon', layout: 'vertical', children: derived801Real4() }
    refineDerivedContainerLayout(sec, ctxOf(deviceDetail801NoRawText()))
    expect(sec.layout).toBe('horizontal')
  })

  test('⑦-c 条件 B 反证（关键）：807:2 原生含 1 TEXT 但既有 row/low（¬B）⇒ 放行 ⇒ R23 翻成 vertical', () => {
    // 只看条件 A 会把这条拦掉 ⇒ 保留错误的 horizontal（真机 9 个 807:2 组件反向回归）
    const sec: any = { id: '807:2', name: 'dialog-card', layout: 'horizontal', children: derived807Real4() }
    refineDerivedContainerLayout(sec, ctxOf(device807Figma()))
    expect(sec.layout).toBe('vertical')
  })
})

describe('A2 不臆造方向 · 闸④ 输入完整性（闸⑤ 放行后的兜底）', () => {
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

describe('A2 废弃思路反证 → 已转为「low 置信方向闸」回归护栏（807:2 形态）', () => {
  // 历史：本用例曾是「补回伪 id 几何会误伤 807:2」的反证 —— 当时 `decideGeometricLayout`
  // 对 `confidence:'low'` **无条件兜底 `row`**，于是 807:2 补 tail-text 后
  // （pair 6→10、side-by-side 1→3 ⇒ ratio 0.3 low）被翻成 `row` ⇒ 正确方向被误伤 ⇒
  // 「补伪 id 几何」不能当 A2 的主修。
  //
  // 2026-10-27（mc-1793064994649-2ec8acc7 实锤）：该兜底已收窄为「两事实合取」——
  // 仅当 ① 几何多数判 column ∧ ② 容器自身高>宽 才保留 column，其余仍兜底 row。
  // 807:2（483×515）两条都满足 ⇒ 现在得 `column`，反证前提不再成立。
  // 本用例因此改为**该闸的回归护栏**：807:2 这个具体形态补伪 id 后必须仍是 column，
  // 一旦有人把兜底改回「无条件 row」，这里会立刻转红。
  test('⑩ 807:2 补 tail-text 后仍判 column/low（low 置信方向闸生效）', () => {
    const figma = device807Figma()
    const idx = indexFigmaNodes(figma) as any
    const nodes = derived807Real4()
      .map((c) => idx.get(c.id)?.rawNode)
      .filter(Boolean)
    // 补进 tail-text 的并集框（src 只有 43:4878 一个 TEXT）
    nodes.push({ id: '807:2-tail-text', type: 'TEXT', absoluteBoundingBox: { x: 30001, y: 52138, width: 84, height: 14 } })
    const decide = decideLayoutForBoxes(nodes, figma.children[0].absoluteBoundingBox)
    expect(decide?.flexDirection).toBe('column') // ← 真值纵排（三段 y=51637/51728/52138）
    expect(decide?.confidence).toBe('low')
  })
})
