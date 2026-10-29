/**
 * Figma 覆盖去重单测（2026-10-15 · A 方案 · c-aiot-dpjh-bsjd-91544b38 实锤）
 *
 * 病灶形态：同一批卡片节点被「vision items 轨」（48:5798 带 body.items=6 张卡）与
 * 「collapse 折叠轨」（48:5813-list）各解释一次 ⇒ 两个子组件 ⇒ 卡 2 双渲染。
 * 判据：折叠段的 Figma 覆盖闭包 ⊆ items 段的覆盖闭包 ⇒ 移除折叠段。
 */
import {
  buildFigmaClosureIndex,
  sectionCoverageSet,
  dedupeSectionsByCoverage,
} from './figma-coverage-dedupe.js'

/** 最小 Figma 树：两卡（各带 2 个内部节点）+ 一个尾部 footer 文本 */
const makeFigma = () => ({
  id: '0:1',
  type: 'FRAME',
  name: 'root',
  absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 500 },
  children: [
    {
      id: '48:5798',
      type: 'GROUP',
      name: 'card1',
      absoluteBoundingBox: { x: 0, y: 40, width: 400, height: 80 },
      children: [
        { id: '48:5799', type: 'TEXT', name: '节点', characters: '节点' },
        { id: '48:5800', type: 'TEXT', name: '在线', characters: '在线' },
      ],
    },
    {
      id: '48:5813',
      type: 'GROUP',
      name: 'card2',
      absoluteBoundingBox: { x: 0, y: 120, width: 400, height: 80 },
      children: [
        { id: '48:5814', type: 'TEXT', name: '节点', characters: '节点' },
        { id: '48:5815', type: 'TEXT', name: '在线', characters: '在线' },
      ],
    },
    { id: '48:5888', type: 'TEXT', name: '共 6 个节点', characters: '共 6 个节点' },
    { id: '48:5889', type: 'TEXT', name: '接入设备 10810', characters: '接入设备 10810' },
    { id: '48:5890', type: 'TEXT', name: 'x1', characters: 'x1' },
    { id: '48:5891', type: 'TEXT', name: 'x2', characters: 'x2' },
    { id: '48:5892', type: 'TEXT', name: 'x3', characters: 'x3' },
  ],
})

/** items 轨段落：sourceNodeIds + body.items（每项带卡组 id）双证据覆盖 6 张卡 */
const itemsSection = () => ({
  id: '48:5798',
  sourceNodeIds: ['48:5798', '48:5813'],
  body: { items: [{ id: '48:5798' }, { id: '48:5813' }] },
  children: [{ id: '48:5799' }],
})

/** collapse 折叠轨段落：合成 id `48:5813-list`，锚点全是卡 2 的内部节点 */
const listSection = (extraIds: string[] = []) => ({
  id: '48:5813-list',
  sourceNodeIds: ['48:5813', '48:5814', '48:5815', ...extraIds],
  children: [{ id: '48:5815' }],
})

describe('buildFigmaClosureIndex', () => {
  test('闭包 = 自身 + 全部后代 id', () => {
    const idx = buildFigmaClosureIndex(makeFigma())!
    expect([...idx.get('48:5798')!].sort()).toEqual(['48:5798', '48:5799', '48:5800'])
    expect([...idx.get('48:5813')!].sort()).toEqual(['48:5813', '48:5814', '48:5815'])
    expect([...idx.get('48:5888')!]).toEqual(['48:5888'])
  })

  test('document 包装 / 无效输入：兼容前者、后者 fail-open 返回 null', () => {
    expect(buildFigmaClosureIndex({ document: makeFigma() })!.size).toBeGreaterThan(0)
    expect(buildFigmaClosureIndex(null)).toBeNull()
    expect(buildFigmaClosureIndex({})).toBeNull()
  })
})

describe('sectionCoverageSet', () => {
  test('锚点展开为后代闭包（含 body.items 与 children）', () => {
    const idx = buildFigmaClosureIndex(makeFigma())!
    const cov = sectionCoverageSet(itemsSection(), idx)
    expect([...cov].sort()).toEqual([
      '48:5798',
      '48:5799',
      '48:5800',
      '48:5813',
      '48:5814',
      '48:5815',
    ])
  })

  test('索引外的合成 id 不计入（否则子集判据永远差一个 id）', () => {
    const idx = buildFigmaClosureIndex(makeFigma())!
    const cov = sectionCoverageSet({ id: '48:5813-list', sourceNodeIds: [] }, idx)
    expect(cov.size).toBe(0)
  })
})

describe('dedupeSectionsByCoverage', () => {
  const idx = () => buildFigmaClosureIndex(makeFigma())!

  test('① 全包含去重（真机形态）：48:5813-list 被 48:5798 完全覆盖 ⇒ 移除', () => {
    const r = dedupeSectionsByCoverage([itemsSection(), listSection()], idx())
    expect(r.sections).toHaveLength(1)
    expect(r.sections[0].id).toBe('48:5798')
    expect(r.removed).toHaveLength(1)
    expect(r.removed[0].id).toBe('48:5813-list')
    expect(r.removed[0].coveredBy).toBe('48:5798')
  })

  test('② 部分覆盖（重叠 < 75%）⇒ 保留（宁可多渲染，不可漏渲染）', () => {
    const r = dedupeSectionsByCoverage(
      [itemsSection(), listSection(['48:5888', '48:5890', '48:5891', '48:5892'])],
      idx(),
    )
    expect(r.sections).toHaveLength(2)
    expect(r.removed).toHaveLength(0)
  })

  test('②b 二段判据（真机 0397a327 形态·嵌套层）：折叠段 ≥75% 节点已被兄弟渲染 ⇒ 判重复', () => {
    // 折叠段覆盖 4 个节点，其中 3 个（卡 2 子树）已被 items 段渲染 ⇒ ratio=0.75。
    // ⚠️ 真机折叠段挂在容器（/565:3）内 ⇒ 必须走嵌套层（顶层不进二段，见 ②c）。
    const con = { id: '565:3', children: [itemsSection(), listSection(['48:5888'])] }
    const r = dedupeSectionsByCoverage([con], idx())
    expect((r.sections[0] as any).children).toHaveLength(1)
    expect(r.removed[0]).toMatchObject({
      id: '48:5813-list',
      coveredBy: '48:5798',
      reason: 'partial',
      ratio: 0.75,
      path: '/565:3',
    })
  })

  test('②c 阴性：顶层段不进二段判据（防 header/内容容器被误删）', () => {
    // 真机 c-aiot-dpjh-bsjd-3b06a019：顶层 565:2 ⨯ 565:3 覆盖完全重叠（header vs 内容容器），
    // 二段判据作用域收窄到嵌套层 ⇒ 顶层即便「像列表段」也绝不删。
    const a = { id: 'X-list', sourceNodeIds: ['48:5798', '48:5888'] }
    const r = dedupeSectionsByCoverage([a, itemsSection()], idx())
    expect(r.sections).toHaveLength(2)
    expect(r.removed).toHaveLength(0)
  })

  test('③ 零交集段（footer）⇒ 保留', () => {
    const footer = { id: 'footer', sourceNodeIds: ['48:5888'] }
    const r = dedupeSectionsByCoverage([itemsSection(), footer], idx())
    expect(r.sections.map((s: any) => s.id)).toEqual(['48:5798', 'footer'])
    expect(r.removed).toHaveLength(0)
  })

  test('④ 无 Figma 索引 ⇒ 原样返回（fail-open）', () => {
    const input = [itemsSection(), listSection()]
    const r = dedupeSectionsByCoverage(input, null as any)
    expect(r.sections).toBe(input)
    expect(r.removed).toHaveLength(0)
  })

  test('⑤ 无 Figma 归属的段不参与删除（永不误删）', () => {
    const ghost = { id: 'ghost', sourceNodeIds: [] }
    const r = dedupeSectionsByCoverage([itemsSection(), ghost], idx())
    expect(r.sections).toHaveLength(2)
  })

  test('⑥ 嵌套层去重：removed 跨层级聚合（path 留痕）', () => {
    const container = {
      id: '565:3',
      isLayoutContainer: true,
      children: [itemsSection(), listSection()],
    }
    const r = dedupeSectionsByCoverage([container], idx())
    expect(r.removed).toHaveLength(1)
    expect(r.removed[0].path).toBe('/565:3')
    expect((r.sections[0] as any).children).toHaveLength(1)
  })

  test('⑦ 等闭包（互相包含）⇒ 保留靠前者 + 幂等', () => {
    const a = { id: 'A', sourceNodeIds: ['48:5798'] }
    const b = { id: 'B', sourceNodeIds: ['48:5798'] }
    const once = dedupeSectionsByCoverage([a, b], idx())
    expect(once.sections.map((s: any) => s.id)).toEqual(['A'])
    const twice = dedupeSectionsByCoverage(once.sections, idx())
    expect(twice.sections.map((s: any) => s.id)).toEqual(['A'])
    expect(twice.removed).toHaveLength(0)
  })

  test('⑧ 去重结果幂等（真机形态跑两遍一致）', () => {
    const once = dedupeSectionsByCoverage([itemsSection(), listSection()], idx())
    const twice = dedupeSectionsByCoverage(once.sections, idx())
    expect(twice.sections).toHaveLength(1)
    expect(twice.removed).toHaveLength(0)
  })
})

describe('刀22：折叠列表段的吸收者必须是列表内容携带者（mc-max-1793185156712-b2086a9c 实锤）', () => {
  const idx = () => buildFigmaClosureIndex(makeFigma())!
  // 本次形态：E1 把 48:5798 推成**容器**（无 body.items），折叠段 48:5813-list
  // 是 6 卡内容的唯一载体；父容器锚点的后代闭包天然全包含 ⇒ 旧判据误删 ⇒ 全列只剩首卡
  const bareContainer = () => ({
    id: '48:5798',
    isLayoutContainer: true,
    sourceNodeIds: ['48:5798', '48:5813'],
    children: [{ id: '48:5799' }],
  })

  test('⭐ 阳性：吸收者无 items（裸容器）⇒ 折叠段保留（一段）', () => {
    const r = dedupeSectionsByCoverage([bareContainer(), listSection()], idx())
    expect(r.sections).toHaveLength(2)
    expect(r.removed).toHaveLength(0)
  })

  test('⭐ 阳性：二段判据同样守——裸容器 75%+ 重叠也不删', () => {
    const con = { id: '565:3', children: [bareContainer(), listSection(['48:5888'])] }
    const r = dedupeSectionsByCoverage([con], idx())
    expect((r.sections[0] as any).children).toHaveLength(2)
    expect(r.removed).toHaveLength(0)
  })

  test('反向回归：吸收者带 body.items≥2（91544b38 形态）⇒ 仍删（既有 ① 保持）', () => {
    const r = dedupeSectionsByCoverage([itemsSection(), listSection()], idx())
    expect(r.sections).toHaveLength(1)
    expect(r.removed[0]?.id).toBe('48:5813-list')
  })

  test('反向：吸收者顶层 items≥2 ⇒ 仍删', () => {
    const carrier = { ...bareContainer(), items: [{ id: '48:5798' }, { id: '48:5813' }] }
    const r = dedupeSectionsByCoverage([carrier, listSection()], idx())
    expect(r.sections).toHaveLength(1)
    expect(r.removed[0]?.id).toBe('48:5813-list')
  })

  test('反向：非折叠段（普通 section）不受新闸影响 ⇒ 全包含仍删', () => {
    const plain = { id: '48:5813', sourceNodeIds: ['48:5813', '48:5814'] }
    const r = dedupeSectionsByCoverage([itemsSection(), plain], idx())
    expect(r.sections).toHaveLength(1)
    expect(r.removed[0]?.id).toBe('48:5813')
  })
})

describe('刀28b：非列表段的吸收证据不含 items 锚点展开（mc-max-1793252160457-54ae6ee3 实锤）', () => {
  const idx = () => buildFigmaClosureIndex(makeFigma())!
  // 本轮形态：vision 把尾部文本「共 6 个节点」(48:5888) 也塞成 items 条目 ⇒
  // items 段（48:5798）闭包被杂散锚点吹大 ⇒ 尾部文本段被「全包含」误删（footer 消失）。
  // items[].id 是 vision 自由发挥锚点，不得充当「覆盖非列表兄弟」的证据；
  // 折叠列表段候选不受影响（91544b38 阳性保持）。
  const inflatedItemsSection = () => ({
    id: '48:5798',
    sourceNodeIds: ['48:5798', '48:5813'],
    body: { items: [{ id: '48:5798' }, { id: '48:5813' }, { id: '48:5888' }] },
    children: [{ id: '48:5799' }],
  })

  test('⭐ 阳性：footer 锚点仅出现在吸收者 items 里 ⇒ 保留', () => {
    const footer = { id: '565:3-tail-text', sourceNodeIds: ['48:5888'] }
    const r = dedupeSectionsByCoverage([inflatedItemsSection(), footer], idx())
    expect(r.sections).toHaveLength(2)
    expect(r.removed).toHaveLength(0)
  })

  test('反向：折叠列表段仍按完整闭包吸收（91544b38 阳性保持）', () => {
    const r = dedupeSectionsByCoverage([inflatedItemsSection(), listSection()], idx())
    expect(r.sections).toHaveLength(1)
    expect(r.removed[0]?.id).toBe('48:5813-list')
  })

  test('反向：非列表段被严格闭包全包含（sourceNodeIds 直接锚定，非 items 证据）⇒ 仍删', () => {
    const plain = { id: '48:5813', sourceNodeIds: ['48:5813'] }
    const r = dedupeSectionsByCoverage([inflatedItemsSection(), plain], idx())
    expect(r.sections).toHaveLength(1)
    expect(r.removed[0]?.id).toBe('48:5813')
  })
})
