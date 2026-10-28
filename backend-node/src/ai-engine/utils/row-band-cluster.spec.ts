/**
 * 刀 12 · 2D 行簇重建（row-band-cluster）spec
 * 实锤来源：mc-max-1793096891762-ad8939a5 `.checkpoint/figma.json` 的 `801:3`
 * （设备头部 547×493，左图右文 + 参数网格 + 产品描述，被纵切七段）。
 */
import { planRowBands, planColumnGroups, crossAxisCenterStyle } from './row-band-cluster.js'

// 801:3 内容子项真实 bbox（背景层 36:1695 已被刀 7 吸收，不参与）
const B = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
const AD8939A5_KIDS = [
  { ref: '36:1708-产品描述', box: B(24772, 51824, 64, 16) },
  { ref: '36:1719-描述正文', box: B(24772, 51849, 496, 90) },
  { ref: '81:7-参数网格', box: B(24745, 51630, 440, 135.25) },
  { ref: '36:1722-pill', box: B(24905, 51553, 72, 22) },
  { ref: '36:1724-标题', box: B(24864, 51514, 147, 24) },
  // orphan-text-1 = 编码+爆闪灯 已合成横排段（merged box）
  { ref: '801:3-orphan-text-1', box: B(24864, 51556, 173, 16) },
  { ref: '36:1725-img', box: B(24745, 51499, 98, 98) },
]

// 类型修正：spec 里树叶用 tag 名当 ref 即可
type BandNode = any
const dirs = (n: BandNode): any =>
  n.children
    ? { d: n.direction, kids: n.children.map(dirs) }
    : { leaf: n.ref }

describe('刀12 · planRowBands（2D 行簇重建）', () => {
  it('⭐ 阳性（实锤复刻）：801:3 七子项 ⇒ 4 带，首带成行（img | 右列）', () => {
    const tree = planRowBands(AD8939A5_KIDS)
    expect(tree).not.toBeNull()
    expect(tree.direction).toBe('column')
    // 4 带：头部带 / 参数网格 / 产品描述 label / 描述正文
    expect(tree.children).toHaveLength(4)
    // 单元素带保持叶子（网格/描述两带不被包装）
    expect(tree.children[1].ref).toBe('81:7-参数网格')
    expect(tree.children[2].ref).toBe('36:1708-产品描述')
    expect(tree.children[3].ref).toBe('36:1719-描述正文')
    // 首带 = row(img, column(标题, stacked[pill, orphan-text-1]))
    const band1 = tree.children[0]
    expect(band1.direction).toBe('row')
    expect(band1.children).toHaveLength(2)
    expect(band1.children[0].ref).toBe('36:1725-img') // 左图
    const rightCol = band1.children[1]
    expect(rightCol.direction).toBe('column') // 右列：标题在上
    expect(rightCol.children[0].ref).toBe('36:1724-标题')
    // pill 与 orphan-text-1（编码+爆闪灯 merged box）x 互穿 ⇒ stacked 纵排兜底（不臆造）
    const stack = rightCol.children[1]
    expect(stack.direction).toBe('column')
    expect(stack.children.map((c: any) => c.ref)).toEqual([
      '36:1722-pill',
      '801:3-orphan-text-1',
    ])
    // 带盒 = 成员并集
    expect(band1.box.y).toBe(51499)
    expect(Math.round(band1.box.h)).toBe(98)
  })

  it('阴性：纯纵流（无任何带成行）⇒ null（零行为变化）', () => {
    const tree = planRowBands([
      { ref: 'a', box: B(0, 0, 200, 40) },
      { ref: 'b', box: B(0, 60, 200, 40) },
      { ref: 'c', box: B(0, 120, 200, 40) },
    ])
    expect(tree).toBeNull()
  })

  it('阴性：单带（纯横行）⇒ null（属 horizontal 分支管辖）', () => {
    const tree = planRowBands([
      { ref: 'a', box: B(0, 0, 90, 40) },
      { ref: 'b', box: B(100, 0, 90, 40) },
      { ref: 'c', box: B(200, 0, 90, 40) },
    ])
    expect(tree).toBeNull()
  })

  it('阴性：两带但全带单元素 ⇒ null', () => {
    const tree = planRowBands([
      { ref: 'a', box: B(0, 0, 200, 40) },
      { ref: 'b', box: B(0, 60, 200, 40) },
      { ref: 'c', box: B(0, 120, 200, 40) },
      { ref: 'd', box: B(0, 180, 200, 40) },
    ])
    expect(tree).toBeNull()
  })

  it('阳性：头带左右双栏 + 下带通栏 ⇒ 头带成行', () => {
    const tree = planRowBands([
      { ref: 'logo', box: B(0, 0, 100, 60) },
      { ref: 'title', box: B(120, 10, 200, 20) },
      { ref: 'body', box: B(0, 80, 320, 200) },
    ])
    expect(tree).not.toBeNull()
    expect(tree.direction).toBe('column')
    expect(tree.children).toHaveLength(2)
    expect(tree.children[0].direction).toBe('row')
    expect(tree.children[0].children.map((c: any) => c.ref)).toEqual(['logo', 'title'])
    expect(tree.children[1].ref).toBe('body')
  })

  it('fail-open：任一 box 缺失/非法 ⇒ null', () => {
    expect(
      planRowBands([
        { ref: 'a', box: B(0, 0, 100, 40) },
        { ref: 'b', box: null },
        { ref: 'c', box: B(0, 60, 100, 40) },
      ] as any),
    ).toBeNull()
    expect(
      planRowBands([
        { ref: 'a', box: B(0, 0, 0, 40) }, // 0 宽
        { ref: 'b', box: B(120, 0, 100, 40) },
        { ref: 'c', box: B(0, 60, 100, 40) },
      ]),
    ).toBeNull()
    expect(planRowBands([])).toBeNull()
    expect(planRowBands(null as any)).toBeNull()
  })

  it('带内 x 互穿且 y 互穿（真交叠）⇒ stacked 兜底不判行', () => {
    // 两个元素 y 同带但 x 大范围互穿（绝对定位叠层），不得判成 row
    const tree = planRowBands([
      { ref: 'a', box: B(0, 0, 200, 50) },
      { ref: 'b', box: B(50, 10, 200, 50) }, // 与 a 双向互穿
      { ref: 'c', box: B(0, 120, 250, 40) },
    ])
    expect(tree).toBeNull() // 唯一多元素带切不出行 ⇒ 整体 null
  })
})

describe('刀17a · planColumnGroups（横排内含纵排组，6bba7218 `38:3260` 实锤）', () => {
  // 实锤几何（.mc-gen/cache/figma-node-data.json）：组 38:3260(26900,51483,265,76)
  // icon 187:262(26920,51496,53,55.4) ｜ 标题 38:3263(26997.7,51496,64,24) ｜ 数字 38:3262(26997,51521.9,28,28)
  const G3260 = [
    { ref: '187:262-icon', box: B(26920, 51496, 53, 55.4) },
    { ref: '38:3263-标题', box: B(26997.7, 51496, 64, 24) },
    { ref: '38:3262-数字', box: B(26997, 51521.9, 28, 28) },
  ]

  it('⭐ 阳性（实锤复刻）：根 row = [icon 叶, column 组(标题, 数字)]', () => {
    const tree = planColumnGroups(G3260)
    expect(tree).not.toBeNull()
    expect(tree.direction).toBe('row')
    expect(tree.children).toHaveLength(2)
    // 组1 = icon 叶
    expect(tree.children[0].ref).toBe('187:262-icon')
    // 组2 = column(标题, 数字) 纵排
    const g2 = tree.children[1]
    expect(g2.direction).toBe('column')
    expect(g2.children.map((c: any) => c.ref)).toEqual(['38:3263-标题', '38:3262-数字'])
    // 组盒并集：文本块 51496–51549.9
    expect(g2.box.h).toBeCloseTo(53.9, 1)
  })

  it('反向：纯横行三并列卡 ⇒ null（horizontal 既有分支管辖）', () => {
    const row = [
      { ref: 'a', box: B(0, 0, 100, 50) },
      { ref: 'b', box: B(120, 0, 100, 50) },
      { ref: 'c', box: B(240, 0, 100, 50) },
    ]
    expect(planColumnGroups(row)).toBeNull()
  })

  it('反向：纯纵列 ⇒ null（vertical 分支管辖）', () => {
    const col = [
      { ref: 'a', box: B(0, 0, 100, 50) },
      { ref: 'b', box: B(0, 60, 100, 50) },
      { ref: 'c', box: B(0, 120, 100, 50) },
    ]
    expect(planColumnGroups(col)).toBeNull()
  })

  it('反向：缺几何 fail-open null', () => {
    const bad = [G3260[0], G3260[1], { ref: 'c', box: null }]
    expect(planColumnGroups(bad as any)).toBeNull()
  })
})

describe('刀17b · crossAxisCenterStyle（横向容器交叉轴居中，6bba7218 实锤）', () => {
  const CONT = B(26900, 51483, 265, 76) // 带中心 51521

  it('⭐ 阳性：icon+文本块 中心偏移 ≤3px、高度 55.4/53.9 < 92% ⇒ center', () => {
    const kids = [B(26920, 51496, 53, 55.4), B(26997, 51496, 64.7, 53.9)]
    expect(crossAxisCenterStyle(kids, CONT)).toBe('align-items:center;')
    expect(crossAxisCenterStyle(kids, CONT, true)).toBe('align-self:center;')
  })

  it('反向：一子项填满（h ≥ 92% 容器）⇒ 空串（stretch 等效，零行为变化）', () => {
    const kids = [B(26920, 51483, 53, 76), B(26997, 51496, 64.7, 53.9)]
    expect(crossAxisCenterStyle(kids, CONT)).toBe('')
  })

  it('反向：一子项中心偏移超容差 ⇒ 空串', () => {
    const kids = [B(26920, 51496, 53, 55.4), B(26997, 51483, 64.7, 12)] // 中心 51489 偏 32
    expect(crossAxisCenterStyle(kids, CONT)).toBe('')
  })

  it('反向：容器/子项 box 非法、空列表 ⇒ 空串 fail-open', () => {
    expect(crossAxisCenterStyle([], CONT)).toBe('')
    expect(crossAxisCenterStyle([B(26920, 51496, 53, 55.4)], null as any)).toBe('')
    expect(crossAxisCenterStyle([{ x: 0, y: 0, w: 0, h: 10 } as any], CONT)).toBe('')
  })
})
