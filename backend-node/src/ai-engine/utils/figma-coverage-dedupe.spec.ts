/**
 * Figma 覆盖去重单测（2026-10-15 · A 方案 · c-aiot-dpjh-bsjd-91544b38 实锤）
 *
 * 病灶形态：同一批卡片节点被「vision items 轨」（48:5798 带 body.items=6 张卡）与
 * 「collapse 折叠轨」（48:5813-list）各解释一次 ⇒ 两个子组件 ⇒ 卡 2 双渲染。
 * 判据：折叠段的 Figma 覆盖闭包 ⊆ items 段的覆盖闭包 ⇒ 移除折叠段。
 */
import {
  buildFigmaClosureIndex,
  buildFigmaTextIdSet,
  buildFigmaTextCharactersIndex,
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

describe('R8-9：整容器 + 合成子切片的祖先覆盖去重（设备详情 36:1693 形态）', () => {
  const idx = () => buildFigmaClosureIndex(makeFigma())!

  test('阳性：declaredContent 整容器完整携带内容 ⇒ 被吸收的同源子切片只保留一次', () => {
    const whole = {
      id: '48:5798',
      sourceNodeIds: ['48:5798'],
      declaredContent: { items: [{ text: '节点' }, { text: '在线' }] },
    }
    const slice = { id: 'group-props/card-desc', sourceNodeIds: ['48:5799', '48:5800'] }
    const r = dedupeSectionsByCoverage([whole, slice], idx(), { requireContentCarrier: true })
    expect(r.sections.map((s: any) => s.id)).toEqual(['48:5798'])
    expect(r.removed[0]).toMatchObject({ id: 'group-props/card-desc', coveredBy: '48:5798', reason: 'full' })
  })

  test('阴性：整容器未携带 declaredContent ⇒ 不删唯一内容子切片', () => {
    const whole = { id: '48:5798', sourceNodeIds: ['48:5798'] }
    const slice = { id: 'group-props/card-desc', sourceNodeIds: ['48:5799', '48:5800'] }
    const r = dedupeSectionsByCoverage([whole, slice], idx(), { requireContentCarrier: true })
    expect(r.sections).toHaveLength(2)
    expect(r.removed).toHaveLength(0)
  })

  test('阴性：子切片含整容器外的独有节点 ⇒ 覆盖不完整，保留', () => {
    const whole = {
      id: '48:5798',
      sourceNodeIds: ['48:5798'],
      declaredContent: { children: [{ text: '节点' }, { text: '在线' }] },
    }
    const slice = { id: 'group-props/card-desc', sourceNodeIds: ['48:5799', '48:5888'] }
    const r = dedupeSectionsByCoverage([whole, slice], idx(), { requireContentCarrier: true })
    expect(r.sections).toHaveLength(2)
  })

  test('无锚子切片：文本被整容器 body 完整覆盖 ⇒ 去重；含独有文本 ⇒ 保留', () => {
    const whole = {
      id: '801:3', sourceNodeIds: ['48:5798'],
      body: { children: [{ content: { elements: [{ text: '所属产品' }, { text: '爆闪灯' }, { text: '设备类型' }] } }] },
    }
    const duplicate = { id: '801:3-attrs', sourceNodeIds: [], body: { items: [{ label: '所属产品', value: '爆闪灯' }] } }
    const unique = { id: '801:3-extra', sourceNodeIds: [], body: { items: [{ label: '独有字段', value: '不可丢' }] } }
    const r = dedupeSectionsByCoverage([whole, duplicate, unique], idx(), { requireContentCarrier: true })
    expect(r.sections.map((s: any) => s.id)).toEqual(['801:3', '801:3-extra'])
    expect(r.removed[0]).toMatchObject({ id: '801:3-attrs', coveredBy: '801:3', reason: 'declared-content' })
  })

  test('幂等：去重后再次评估零移除', () => {
    const whole = {
      id: '48:5798', sourceNodeIds: ['48:5798'],
      declaredContent: { elements: [{ text: '节点' }, { text: '在线' }] },
    }
    const slice = { id: 'group-props/card-desc', sourceNodeIds: ['48:5799'] }
    const once = dedupeSectionsByCoverage([whole, slice], idx(), { requireContentCarrier: true })
    const twice = dedupeSectionsByCoverage(once.sections, idx(), { requireContentCarrier: true })
    expect(once.sections).toHaveLength(1)
    expect(twice.removed).toHaveLength(0)
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

describe('C0.2 三段判据：祖先/后代单一归属（mc-max-1793750471950-b93589ae 实锤）', () => {
  // 拓扑复刻真机：根 Frame 36:1693（壳：bg RECTANGLE + header VECTOR，无 TEXT 余量）
  // 内含子 Group 801:3（全部业务文本）。两段平级 ⇒ 旧管线双渲染。
  const makeAncestorFigma = () => ({
    id: '0:1',
    type: 'FRAME',
    name: 'root',
    children: [
      {
        id: '36:1693',
        type: 'FRAME',
        name: 'cp-设备详情',
        children: [
          { id: '36:1694', type: 'RECTANGLE', name: 'bg' },
          { id: '36:1697', type: 'VECTOR', name: 'header' },
          {
            id: '801:3',
            type: 'GROUP',
            name: 'slot-icon',
            children: [
              { id: '36:1695', type: 'RECTANGLE', name: 'r' },
              { id: '36:1698', type: 'TEXT', name: '编码', characters: '编码' },
              { id: '36:1708', type: 'TEXT', name: '产品描述', characters: '产品描述' },
            ],
          },
        ],
      },
    ],
  })
  const idx = () => buildFigmaClosureIndex(makeAncestorFigma())!
  const texts = () => buildFigmaTextIdSet(makeAncestorFigma())!
  const opts = () => ({
    textIdSet: texts(),
    textCharIndex: buildFigmaTextCharactersIndex(makeAncestorFigma())!,
  })

  test('buildFigmaTextIdSet：只收 TEXT 节点、document 包装兼容、无效输入 fail-open', () => {
    expect([...texts()].sort()).toEqual(['36:1698', '36:1708'])
    expect(buildFigmaTextIdSet({ document: makeAncestorFigma() })!.size).toBe(2)
    expect(buildFigmaTextIdSet(null)).toBeNull()
  })

  test('⭐ 阳性：纯壳祖先被删、结构后代保留（requireContentCarrier 挡不住的场景）', () => {
    const ancestor = { id: '36:1693', sourceNodeIds: ['36:1693'] } // 壳：余量只有 RECTANGLE/VECTOR
    const descendant = { id: '801:3', sourceNodeIds: ['801:3'] } // 承接全部 TEXT
    const r = dedupeSectionsByCoverage([ancestor, descendant], idx(), {
      ...opts(),
      requireContentCarrier: true,
    })
    expect(r.sections.map((s: any) => s.id)).toEqual(['801:3'])
    expect(r.removed).toHaveLength(1)
    expect(r.removed[0]).toMatchObject({ id: '36:1693', coveredBy: '801:3', reason: 'ancestor-shell' })
  })

  test('反向：祖先余量含 TEXT（壳外还有自己的文本）⇒ 保留（宁多勿漏）', () => {
    const figma = makeAncestorFigma()
    figma.children[0].children.push({ id: '36:9999', type: 'TEXT', name: '标题', characters: '标题' })
    const ancestor = { id: '36:1693', sourceNodeIds: ['36:1693'] }
    const descendant = { id: '801:3', sourceNodeIds: ['801:3'] }
    const r = dedupeSectionsByCoverage([ancestor, descendant], buildFigmaClosureIndex(figma)!, {
      textIdSet: buildFigmaTextIdSet(figma)!,
      requireContentCarrier: true,
    })
    expect(r.sections).toHaveLength(2)
    expect(r.removed).toHaveLength(0)
  })

  test('方向性（ab7bb76c 教训）：删壳留内容——容器壳消失、内部业务段全部保留', () => {
    // 容器 807:2 的子树 = 两个业务段节点；自身无 TEXT ⇒ 壳被删，业务段全留
    const figma = {
      id: '0:1',
      type: 'FRAME',
      name: 'root',
      children: [
        {
          id: '807:2',
          type: 'GROUP',
          name: '底部',
          children: [
            { id: '807:10', type: 'GROUP', name: '统计卡', children: [{ id: '807:11', type: 'TEXT', characters: '卡' }] },
            { id: '807:20', type: 'GROUP', name: '表格', children: [{ id: '807:21', type: 'TEXT', characters: '表' }] },
          ],
        },
      ],
    }
    const shell = { id: '807:2', sourceNodeIds: ['807:2'] }
    const card = { id: '807:10', sourceNodeIds: ['807:10'] }
    const table = { id: '807:20', sourceNodeIds: ['807:20'] }
    const r = dedupeSectionsByCoverage([shell, card, table], buildFigmaClosureIndex(figma)!, {
      textIdSet: buildFigmaTextIdSet(figma)!,
      requireContentCarrier: true,
    })
    expect(r.sections.map((s: any) => s.id).sort()).toEqual(['807:10', '807:20'])
    expect(r.removed[0]).toMatchObject({ id: '807:2', reason: 'ancestor-shell' })
  })

  test('反向：祖先是列表内容携带者（items ≥2）⇒ 不触发删壳（刀 22 同源防御）', () => {
    const ancestor = {
      id: '36:1693',
      sourceNodeIds: ['36:1693'],
      body: { items: [{ id: '801:3' }, { id: '0:1' }] },
    }
    const descendant = { id: '801:3', sourceNodeIds: ['801:3'] }
    const r = dedupeSectionsByCoverage([ancestor, descendant], idx(), opts())
    // 祖先携带 items ⇒ 三段不删壳；后代走一段全包含判据被吸收（旧行为）
    expect(r.sections.map((s: any) => s.id)).toEqual(['36:1693'])
    expect(r.removed.filter((x: any) => x.reason === 'ancestor-shell')).toHaveLength(0)
  })

  test('反向：无 textIdSet ⇒ 三段不启用（fail-open，行为与旧版一致：一段判据照常）', () => {
    const ancestor = { id: '36:1693', sourceNodeIds: ['36:1693'] }
    const descendant = { id: '801:3', sourceNodeIds: ['801:3'] }
    const r = dedupeSectionsByCoverage([ancestor, descendant], idx())
    expect(r.sections).toHaveLength(1)
    expect(r.removed[0]).toMatchObject({ id: '801:3', reason: 'full' })
  })

  test('幂等：壳删后再跑一遍无新增删除', () => {
    const ancestor = { id: '36:1693', sourceNodeIds: ['36:1693'] }
    const descendant = { id: '801:3', sourceNodeIds: ['801:3'] }
    const once = dedupeSectionsByCoverage([ancestor, descendant], idx(), opts())
    const twice = dedupeSectionsByCoverage(once.sections, idx(), opts())
    expect(once.sections).toHaveLength(1)
    expect(twice.removed).toHaveLength(0)
  })

  test('⭐ 声明承接（7d7925d2 真机教训）：壳段声明 vision 独有文本（无 TEXT 真值锚点）⇒ 保留', () => {
    // 组件根 807:2 壳（树中无 TEXT 节点）+ 误锚根的 footer 段声明「运行中」——
    // Figma 树里不存在该文本 ⇒ 删壳即丢内容 ⇒ 必须保留
    const figma = {
      id: '807:2',
      type: 'FRAME',
      name: 'root',
      children: [
        { id: '43:4892', type: 'GROUP', name: 'stats', children: [] },
        { id: '43:4788', type: 'GROUP', name: 'list', children: [] },
      ],
    }
    const stats = { id: '43:4893', sourceNodeIds: ['43:4892'] }
    const footer = { id: '807:2', sourceNodeIds: ['807:2'], body: { children: [{ type: 'label', text: '运行中' }] } }
    const list = { id: '43:4788', sourceNodeIds: ['43:4788'] }
    const r = dedupeSectionsByCoverage([stats, footer, list], buildFigmaClosureIndex(figma)!, {
      textIdSet: buildFigmaTextIdSet(figma)!,
      textCharIndex: buildFigmaTextCharactersIndex(figma)!,
      requireContentCarrier: true,
    })
    expect(r.sections.map((s: any) => s.id)).toEqual(['43:4893', '807:2', '43:4788'])
    expect(r.removed).toHaveLength(0)
  })

  test('⭐ 声明承接（b93589ae 完整形态）：壳段声明文本全部锚定在后代闭包 TEXT ⇒ 删壳零丢失', () => {
    // 壳 36:1693 声明的文本（编码/产品描述）锚定的 TEXT 节点全在 801:3 闭包内
    const ancestor = {
      id: '36:1693',
      sourceNodeIds: ['36:1693'],
      body: { children: [{ text: '编码' }, { text: '产品描述' }] },
    }
    const descendant = { id: '801:3', sourceNodeIds: ['801:3'] }
    const r = dedupeSectionsByCoverage([ancestor, descendant], idx(), {
      ...opts(),
      requireContentCarrier: true,
    })
    expect(r.sections.map((s: any) => s.id)).toEqual(['801:3'])
    expect(r.removed[0]).toMatchObject({ id: '36:1693', reason: 'ancestor-shell' })
  })

  test('buildFigmaTextCharactersIndex：TEXT characters trim 后索引、无效输入 fail-open', () => {
    const m = buildFigmaTextCharactersIndex(makeAncestorFigma())!
    expect([...m.get('编码')!]).toEqual(['36:1698'])
    expect(m.get('不存在')).toBeUndefined()
    expect(buildFigmaTextCharactersIndex(null)).toBeNull()
  })
})
