/**
 * P3 装饰叶子分账判据 · 单测（2026-11-03）
 *
 * 治理门禁要求（docs/2026-11-02-写盘前pass执行顺序总纲.md 同族）：
 *   ① 阳性对照：真实现有落地证据 ⇒ 必须判 verified
 *   ② 阴性对照：同一 Figma 真值、产物侧色值整体扰动（RGB+70 / alpha±0.35，
 *      与离线探针 probe-p3-04-validity 同法）⇒ 必须判 unverified
 *   ③ 判据盲区必须显式豁免，不得混入 unverified 制造假缺陷
 *
 * 关键设计取舍（实测支撑）：只做颜色单通道，**不采用几何通道**——
 * 离线 273 目录双态实测 阳性 geomOnly=6 / 阴性 geomOnly=234（零区分力）。
 */
import {
  isNonSemanticName,
  isResourceWrapperName,
  describeDecorLeaf,
  collectDecorLeaves,
  parseCssColor,
  buildColorIndex,
  colorPresent,
  colorPresentWithAlpha,
  judgeDecorLeaves,
  DECOR_LEAF_THRESHOLDS,
} from './decor-leaf-truth.js'

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

type Paint = { type: string; color?: { r: number; g: number; b: number; a?: number }; opacity?: number; gradientStops?: Paint[] }

const solid = (r: number, g: number, b: number, opacity?: number): Paint => {
  const p: Paint = { type: 'SOLID', color: { r: r / 255, g: g / 255, b: b / 255, a: 1 } }
  if (opacity != null) p.opacity = opacity
  return p
}

const gradient = (stops: Array<[number, number, number, number]>): Paint => ({
  type: 'GRADIENT_LINEAR',
  gradientStops: stops.map(([r, g, b, a]) => ({ type: 'SOLID', color: { r: r / 255, g: g / 255, b: b / 255, a } })),
})

const node = (
  id: string,
  name: string,
  type: string,
  w: number,
  h: number,
  fills: Paint[] = [],
  extra: Record<string, any> = {},
): any => ({
  id,
  name,
  type,
  absoluteBoundingBox: { width: w, height: h },
  fills,
  children: [],
  ...extra,
})

const root = (...children: any[]): any => ({
  id: '0:0',
  name: 'Page',
  type: 'FRAME',
  absoluteBoundingBox: { width: 800, height: 600 },
  children,
})

const files = (...contents: string[]): Array<{ path: string; content: string }> =>
  contents.map((content, i) => ({ path: `f${i}.vue`, content }))

/** 与离线探针 probe-p3-04-validity 同法：RGB 各 +70（mod 256）、alpha ±0.35 */
const perturb = (c: { r: number; g: number; b: number; a: number }) => ({
  r: (c.r + 70) % 256,
  g: (c.g + 70) % 256,
  b: (c.b + 70) % 256,
  a: c.a >= 0.5 ? c.a - 0.35 : c.a + 0.35,
})

// ---------------------------------------------------------------------------
// ① 名称判据（visual-parser 已委托本模块，行为必须逐字保持）
// ---------------------------------------------------------------------------

describe('名称判据（单一来源，visual-parser 委托）', () => {
  it('Figma 自动编号 / 通用占位名 / 结构占位名 ⇒ 无语义', () => {
    expect(isNonSemanticName('Group 2136638523')).toBe(true)
    expect(isNonSemanticName('Vector')).toBe(true)
    expect(isNonSemanticName('Rectangle 26')).toBe(true)
    expect(isNonSemanticName('Frame 1280')).toBe(true)
    expect(isNonSemanticName('bg')).toBe(true)
    expect(isNonSemanticName('icon')).toBe(true)
    expect(isNonSemanticName('slot-icon')).toBe(true)
    expect(isNonSemanticName('')).toBe(true)
    expect(isNonSemanticName('   ')).toBe(true)
  })

  it('真实语义名 ⇒ 非无语义（阴性：不得被误判进装饰分账）', () => {
    expect(isNonSemanticName('流量预测')).toBe(false)
    expect(isNonSemanticName('危化品车数量')).toBe(false)
    expect(isNonSemanticName('title-bar')).toBe(false)
  })

  it('资源封装判据只认资源/技术组件，不含 header/footer/tab 结构容器', () => {
    expect(isResourceWrapperName('@echarts/bar')).toBe(true)
    expect(isResourceWrapperName('@chartjs/line')).toBe(true)
    expect(isResourceWrapperName('g')).toBe(true)
    expect(isResourceWrapperName('bg-image')).toBe(true)
    // 关键回归锁：结构容器不是资源封装（其内部常有真实内容，剪枝会丢内容）
    expect(isResourceWrapperName('header')).toBe(false)
    expect(isResourceWrapperName('footer')).toBe(false)
    expect(isResourceWrapperName('tab-bar')).toBe(false)
    // g-xxx 这类真实命名不得因「矢量组 g」被误伤
    expect(isResourceWrapperName('g-tunnel-stats')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ② 采集边界
// ---------------------------------------------------------------------------

describe('collectDecorLeaves 采集边界', () => {
  it('无语义名 + 有可见填充 + 20×20 ⇒ 收录', () => {
    const leaf = node('1:1', 'Rectangle 26', 'RECTANGLE', 20, 20, [solid(20, 105, 169, 0.37)])
    const m = collectDecorLeaves(root(leaf))
    expect(m.size).toBe(1)
    expect([...m.values()][0]).toMatchObject({ id: '1:1', type: 'RECTANGLE', fillType: 'SOLID', w: 20, h: 20 })
  })

  it('有语义名 ⇒ 不收录（阴性：真实内容不走装饰分账）', () => {
    const leaf = node('1:2', '流量预测', 'FRAME', 200, 120, [solid(20, 105, 169)])
    expect(collectDecorLeaves(root(leaf)).size).toBe(0)
  })

  it('TEXT 叶子 ⇒ 不收录（文本真值由 TEXT-TRUTH 单独负责，不重复计）', () => {
    const leaf = node('1:3', 'Group 1', 'TEXT', 40, 20, [solid(0, 0, 0)])
    leaf.characters = ''
    expect(collectDecorLeaves(root(leaf)).size).toBe(0)
  })

  it('面积 < 24（3×3）⇒ 不收录；12×2 面积恰好 24 ⇒ 收录（边界由面积决定，非最长边）', () => {
    expect(collectDecorLeaves(root(node('1:4', 'Rectangle 26', 'RECTANGLE', 3, 3, [solid(0, 0, 0)]))).size).toBe(0)
    expect(collectDecorLeaves(root(node('1:5', 'Rectangle 27', 'RECTANGLE', 12, 2, [solid(0, 0, 0)]))).size).toBe(1)
  })

  it('无填充但有可见描边 ⇒ 收录且 fillType=STROKE_ONLY', () => {
    const leaf = node('1:6', 'Line 3', 'RECTANGLE', 100, 6, [], { strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }] })
    const m = collectDecorLeaves(root(leaf))
    expect(m.size).toBe(1)
    expect([...m.values()][0].fillType).toBe('STROKE_ONLY')
  })

  it('既无填充也无描边 ⇒ 不收录', () => {
    expect(collectDecorLeaves(root(node('1:7', 'Rectangle 28', 'RECTANGLE', 50, 50, []))).size).toBe(0)
  })

  it('资源封装子树整枝剪枝（@echarts/bar 下的叶子不收录）', () => {
    const inner = node('2:1', 'Vector', 'VECTOR', 30, 30, [solid(1, 2, 3)])
    const wrapper = node('2:0', '@echarts/bar', 'GROUP', 300, 200, [], { children: [inner] })
    expect(collectDecorLeaves(root(wrapper)).size).toBe(0)
  })

  it('@库/组件 技术栈标记（非资源封装）⇒ 不收录（:2156 分支对 UI 技术栈不生效）', () => {
    const leaf = node('3:1', '@antd/Button', 'FRAME', 80, 32, [solid(20, 105, 169)])
    expect(collectDecorLeaves(root(leaf)).size).toBe(0)
  })

  it('深度剪枝：depth=5 收录、depth=6 不收录（与 _traverse / :2156 pruned 同源）', () => {
    const mk = (id: string) => node(id, 'Frame', 'FRAME', 400, 400, [], { children: [] })
    const leaf5 = node('L5', 'Rectangle 40', 'RECTANGLE', 20, 20, [solid(1, 1, 1)])
    const d5 = [mk('a'), mk('b'), mk('c'), mk('d')]
    d5[0].children = [d5[1]]
    d5[1].children = [d5[2]]
    d5[2].children = [d5[3]]
    d5[3].children = [leaf5]
    expect(collectDecorLeaves(root(d5[0])).size).toBe(1) // leaf 在 depth 5

    const leaf6 = node('L6', 'Rectangle 41', 'RECTANGLE', 20, 20, [solid(1, 1, 1)])
    const d6 = [mk('a'), mk('b'), mk('c'), mk('d'), mk('e')]
    d6[0].children = [d6[1]]
    d6[1].children = [d6[2]]
    d6[2].children = [d6[3]]
    d6[3].children = [d6[4]]
    d6[4].children = [leaf6]
    expect(collectDecorLeaves(root(d6[0])).size).toBe(0) // leaf 在 depth 6 ⇒ pruned
  })

  it('包装体形态 {fileKey,nodeId,tokenHash,cachedAt,document} ⇒ 必须解包（否则 total 恒 0 静默空转）', () => {
    // 真实落盘：findFigmaNodeData 返回 273/273 都是这个包装体
    const inner = node('43:5688', 'Rectangle 26', 'RECTANGLE', 6, 218, [solid(20, 105, 169, 0.37)])
    const wrapped = { fileKey: 'k', nodeId: '43:5688', tokenHash: 'h', cachedAt: 0, document: root(inner) }
    expect(collectDecorLeaves(wrapped as any).size).toBe(1)
    const r = judgeDecorLeaves(wrapped as any, files('.a{background:rgba(20,105,169,0.37)}'))!
    expect(r.total).toBe(1)
    expect(r.verified.solid).toBe(1)
  })

  it('不可见填充 / visible:false 描边不构成可见证据', () => {
    const hidden = node('4:1', 'Rectangle 42', 'RECTANGLE', 50, 50, [{ type: 'SOLID', visible: false, color: { r: 1, g: 1, b: 1, a: 1 } }])
    expect(collectDecorLeaves(root(hidden)).size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// ③ 颜色索引
// ---------------------------------------------------------------------------

describe('产物颜色索引', () => {
  it('hex（3/6/8 位）与 rgb/rgba 均可解析，渐变与 url 返回 null', () => {
    expect(parseCssColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseCssColor('#1469A9')).toEqual({ r: 20, g: 105, b: 169, a: 1 })
    expect(parseCssColor('#1469a9ff')).toEqual({ r: 20, g: 105, b: 169, a: 1 })
    expect(parseCssColor('rgba(20,105,169,0.37)')).toEqual({ r: 20, g: 105, b: 169, a: 0.37 })
    expect(parseCssColor('rgb(20, 105, 169)')).toEqual({ r: 20, g: 105, b: 169, a: 1 })
    expect(parseCssColor('linear-gradient(#fff, #000)')).toBeNull()
    expect(parseCssColor('url(./a.png)')).toBeNull()
  })

  it('buildColorIndex 同时统计渐变声明数（区分「有渐变但色值不同」）', () => {
    const { colors, gradientCssCount } = buildColorIndex(
      files('.a{background:linear-gradient(#fff,#000);color:rgba(20,105,169,0.37)}', '.b{background:radial-gradient(#123456,#654321)}'),
    )
    expect(gradientCssCount).toBe(2)
    expect(colorPresent(colors, { r: 20, g: 105, b: 169, a: 1 })).toBe(true)
    expect(colorPresent(colors, { r: 18, g: 52, b: 86, a: 1 })).toBe(true)
  })

  it('RGB 容差边界：±3 命中、±4 不命中', () => {
    const { colors } = buildColorIndex(files('.a{color:rgba(20,105,169,1)}'))
    expect(colorPresent(colors, { r: 23, g: 105, b: 169, a: 1 }, 3)).toBe(true)
    expect(colorPresent(colors, { r: 24, g: 105, b: 169, a: 1 }, 3)).toBe(false)
  })

  it('alpha 容差边界：差 0.08 命中、差 0.09 不命中', () => {
    // 基色 alpha=0.5（二进制可精确表示），避免 0.45-0.37=0.08000000000000002 这类 IEEE 浮点边界假阴性。
    const { colors } = buildColorIndex(files('.a{background:rgba(20,105,169,0.5)}'))
    expect(colorPresentWithAlpha(colors, { r: 20, g: 105, b: 169, a: 0.58 }, 3, 0.08)).toBe(true)
    expect(colorPresentWithAlpha(colors, { r: 20, g: 105, b: 169, a: 0.59 }, 3, 0.08)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ④ 判定：阳性 / 阴性对照（核心判据区分力）
// ---------------------------------------------------------------------------

describe('judgeDecorLeaves · SOLID 阳性对照', () => {
  const figma = root(node('43:5688', 'Rectangle 26', 'RECTANGLE', 6, 218, [solid(20, 105, 169, 0.37)]))

  it('产物含同色同 alpha ⇒ verified.solid=1、unverified=0', () => {
    const r = judgeDecorLeaves(figma, files('.c-slot{background:rgba(20,105,169,0.37);border-radius:3px}'))!
    expect(r.total).toBe(1)
    expect(r.verified.solid).toBe(1)
    expect(r.verified.total).toBe(1)
    expect(r.unverified.count).toBe(0)
    expect(r.byFillType).toEqual({ SOLID: 1 })
  })

  it('产物用 hex 等价色（#1469a9）但 alpha=1 ⇒ 判 unverified（半透明底写成不透明是真实视觉差异）', () => {
    const r = judgeDecorLeaves(figma, files('.c-slot{background:#1469a9}'))!
    expect(r.verified.solid).toBe(0)
    expect(r.unverified.count).toBe(1)
    expect(r.unverified.items[0]).toMatchObject({ id: '43:5688', reason: 'solid-color-absent' })
  })
})

describe('judgeDecorLeaves · SOLID 阴性对照（扰动色必须不命中）', () => {
  const figma = root(node('43:5688', 'Rectangle 26', 'RECTANGLE', 6, 218, [solid(20, 105, 169, 0.37)]))

  it('产物色整体扰动（RGB+70 / alpha-0.35）⇒ unverified=1（证明命中不是巧合共现）', () => {
    const p = perturb({ r: 20, g: 105, b: 169, a: 0.37 })
    const r = judgeDecorLeaves(figma, files(`.c{background:rgba(${p.r},${p.g},${p.b},${p.a.toFixed(2)})}`))!
    expect(r.verified.solid).toBe(0)
    expect(r.unverified.count).toBe(1)
  })

  it('产物完全无该色 ⇒ unverified=1 且明细带 Figma 节点 id 与色值（可定位）', () => {
    const r = judgeDecorLeaves(figma, files('.c{color:#ff0000}'))!
    expect(r.unverified.count).toBe(1)
    expect(r.unverified.items[0]).toMatchObject({
      id: '43:5688',
      type: 'RECTANGLE',
      w: 6,
      h: 218,
      fillType: 'SOLID',
      color: 'rgba(20,105,169,0.37)',
    })
  })
})

// ---------------------------------------------------------------------------
// ⑤ 判定：渐变
// ---------------------------------------------------------------------------

describe('judgeDecorLeaves · GRADIENT', () => {
  it('不透明 stop 命中 ⇒ gradient verified（透明端 alpha<0.1 不参与判定）', () => {
    // 362×6 标题渐变装饰线：白 → 全透明白
    const figma = root(node('10:1', 'Rectangle 12', 'RECTANGLE', 362, 6, [gradient([[255, 255, 255, 1], [255, 255, 255, 0]])]))
    const r = judgeDecorLeaves(figma, files('.t{background:linear-gradient(90deg,#ffffff,rgba(255,255,255,0))}'))!
    expect(r.verified.gradient).toBe(1)
    expect(r.unverified.count).toBe(0)
    expect(r.exempt.gradientTransparentOnly).toBe(0)
  })

  it('全部 stop 均透明（alpha<0.1）⇒ 计入 exempt，不算缺失', () => {
    const figma = root(node('10:2', 'Rectangle 13', 'RECTANGLE', 100, 40, [gradient([[255, 255, 255, 0.05], [255, 255, 255, 0]])]))
    const r = judgeDecorLeaves(figma, files('.t{color:#000}'))!
    expect(r.exempt.gradientTransparentOnly).toBe(1)
    expect(r.unverified.count).toBe(0)
  })

  it('不透明 stop 色缺 ⇒ unverified 且 reason=gradient-stops-absent（渐变遮罩真未实现）', () => {
    const figma = root(node('10:3', 'Group 2136638431', 'GROUP', 265, 76, [gradient([[0, 0, 0, 0.8], [255, 255, 255, 1]])]))
    const r = judgeDecorLeaves(figma, files('.t{background:linear-gradient(90deg,#ff0000,#00ff00)}'))!
    expect(r.verified.gradient).toBe(0)
    expect(r.unverified.count).toBe(1)
    expect(r.unverified.items[0].reason).toBe('gradient-stops-absent')
    expect(r.unverified.items[0].stops).toEqual(['rgba(0,0,0,0.8)', 'rgba(255,255,255,1)'])
  })
})

// ---------------------------------------------------------------------------
// ⑥ 判据盲区显式豁免（不得混入 unverified 造假缺陷）
// ---------------------------------------------------------------------------

describe('judgeDecorLeaves · 盲区豁免', () => {
  it('<12px VECTOR 图标色缺 ⇒ iconVectorBlind（产物用 svg fill，颜色不进 CSS 字面量）', () => {
    const figma = root(node('36:1697', 'Vector', 'VECTOR', 9.86, 9.85, [solid(0, 110, 254)]))
    const r = judgeDecorLeaves(figma, files('<svg fill="#ff0000"/>'))!
    expect(r.exempt.iconVectorBlind).toBe(1)
    expect(r.unverified.count).toBe(0)
  })

  it('≥12px VECTOR 色缺 ⇒ 仍判 unverified（盲区不得放大）', () => {
    const figma = root(node('36:1698', 'Vector', 'VECTOR', 24, 24, [solid(0, 110, 254)]))
    const r = judgeDecorLeaves(figma, files('<svg fill="#ff0000"/>'))!
    expect(r.exempt.iconVectorBlind).toBe(0)
    expect(r.unverified.count).toBe(1)
  })

  it('仅描边 / 未知填充类型 ⇒ exempt，不判缺失', () => {
    const strokeOnly = node('11:1', 'Line 5', 'RECTANGLE', 200, 1, [], {
      strokes: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
    })
    const imageFill = node('11:2', 'Rectangle 44', 'RECTANGLE', 100, 100, [{ type: 'IMAGE', imageRef: 'x' }])
    const r = judgeDecorLeaves(root(strokeOnly, imageFill), files(''))!
    expect(r.exempt.strokeOnly).toBe(1)
    expect(r.exempt.unknownFillType).toBe(1)
    expect(r.unverified.count).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// ⑦ 结构与 fail-open
// ---------------------------------------------------------------------------

describe('judgeDecorLeaves · 结构与 fail-open', () => {
  it('figmaRoot 缺失 ⇒ 返回 null（不抛，调用方 ?. 安全）', () => {
    expect(judgeDecorLeaves(null as any, files(''))).toBeNull()
    expect(judgeDecorLeaves(undefined as any, files(''))).toBeNull()
    expect(judgeDecorLeaves('x' as any, files(''))).toBeNull()
  })

  it('空产物 ⇒ 全部 unverified，且 total / byFillType 计数仍正确', () => {
    const figma = root(
      node('12:1', 'Rectangle 45', 'RECTANGLE', 50, 50, [solid(10, 20, 30)]),
      node('12:2', 'Group 9', 'GROUP', 50, 50, [solid(40, 50, 60)]),
    )
    const r = judgeDecorLeaves(figma, [])!
    expect(r.total).toBe(2)
    expect(r.byFillType).toEqual({ SOLID: 2 })
    expect(r.unverified.count).toBe(2)
    expect(r.verified.total).toBe(0)
    expect(r.unverified.rate).toBe(1)
  })

  it('明细上限 sampleLimit 生效（count 全量、items 截断）', () => {
    const leaves = Array.from({ length: 50 }, (_, i) => node(`13:${i}`, `Rectangle ${i}`, 'RECTANGLE', 20, 20, [solid(i, i, i)]))
    const r = judgeDecorLeaves(root(...leaves), files(''))!
    expect(r.total).toBe(50)
    expect(r.unverified.count).toBe(50)
    expect(r.unverified.items.length).toBe(DECOR_LEAF_THRESHOLDS.sampleLimit)
  })

  it('阈值回传（前端/审计可直接读判定口径，不猜）', () => {
    const r = judgeDecorLeaves(root(), files(''))!
    expect(r.version).toBe('v1')
    expect(r.thresholds).toMatchObject({ rgbTol: 3, alphaTol: 0.08, iconVectorMaxSide: 12, transparentAlpha: 0.1 })
    expect(typeof r.judgedAt).toBe('string')
    expect(r.colorPool.size).toBe(0)
  })

  it('describeDecorLeaf 独立可用：几何不合规返回 null', () => {
    expect(describeDecorLeaf(node('14:1', 'R', 'RECTANGLE', 0, 0, [solid(1, 1, 1)]))).toBeNull()
    expect(describeDecorLeaf(node('14:2', 'R', 'RECTANGLE', 2, 2, [solid(1, 1, 1)]))).toBeNull()
    expect(describeDecorLeaf(node('14:3', 'R', 'RECTANGLE', 10, 10, []))).toBeNull()
    expect(describeDecorLeaf(node('14:4', 'R', 'RECTANGLE', 10, 10, [solid(1, 1, 1)]))).toMatchObject({
      id: '14:4',
      fillType: 'SOLID',
      area: 100,
    })
  })
})
