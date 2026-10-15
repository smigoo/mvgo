/**
 * 尾部孤儿文本段补回单测（2026-10-15 · c-aiot-dpjh-bsjd-91544b38 footer 全丢实锤）
 *
 * 病灶：E1 确定性推导只提升容器类型节点 ⇒ 容器直接子级的裸 TEXT
 *   （slot-con 下的 footer「共 6 个节点 / 接入设备 10810」）永不进 section 树，
 *   而 E1 又整体替代 vision sections ⇒ footer 随段消失（产物零渲染）。
 * 判据：只补「位于所有已提升兄弟之下 + 未被任何兄弟覆盖 + TEXT 且非空」的尾部孤儿。
 */
import { deriveSectionsFromFigmaTree, collectLeafSections } from './section-tree.js'

const box = (x: number, y: number, w: number, h: number) => ({
  x,
  y,
  width: w,
  height: h,
})

const card = (id: string, y: number, textId: string) => ({
  id,
  type: 'GROUP',
  name: `card-${id}`,
  absoluteBoundingBox: box(0, y, 400, 80),
  children: [
    { id: textId, type: 'TEXT', name: '节点', characters: '江苏联网节点', absoluteBoundingBox: box(10, y + 10, 120, 20) },
  ],
})

/** 内容容器：3 张卡 + 尾部两行 footer 文本 + 一个装饰 VECTOR（滚动条） */
const makeFigmaWithFooter = () => ({
  id: '0:1',
  type: 'FRAME',
  name: 'cp-test',
  absoluteBoundingBox: box(0, 0, 400, 560),
  children: [
    {
      id: '565:3',
      type: 'GROUP',
      name: 'slot-con',
      absoluteBoundingBox: box(0, 40, 400, 520),
      children: [
        card('48:5798', 40, '48:5799'),
        card('48:5813', 130, '48:5814'),
        card('48:5828', 220, '48:5829'),
        { id: '48:5888', type: 'TEXT', name: '共 6 个节点', characters: '共 6 个节点', absoluteBoundingBox: box(0, 500, 120, 20) },
        { id: '48:5889', type: 'TEXT', name: '接入设备 10810', characters: '接入设备 10810', absoluteBoundingBox: box(200, 500, 140, 20) },
        { id: '48:5904', type: 'VECTOR', name: '滚动条', absoluteBoundingBox: box(390, 60, 6, 420) },
      ],
    },
  ],
})

describe('尾部孤儿文本段补回（footer）', () => {
  test('① 容器尾部裸 TEXT ⇒ 补回为独立 footer section', () => {
    const r = deriveSectionsFromFigmaTree(makeFigmaWithFooter(), null)
    const con = r!.sections.find((s: any) => s.id === '565:3')!
    const tail = con.children.find((c: any) => c.id === '565:3-tail-text')
    expect(tail).toBeTruthy()
    expect(tail.type).toBe('footer')
    expect(tail.sourceNodeIds).toEqual(['48:5888', '48:5889'])
    expect(tail.layout).toBe('horizontal') // 同行（y 极差 0）⇒ 横排
    expect(tail.orphanTailText).toBe(true)
    // 文本真值必须随 children 下传，否则 LLM 无从知道写什么
    expect(tail.children.map((c: any) => c.text)).toEqual(['共 6 个节点', '接入设备 10810'])
  })

  test('② 补回段成为叶子 ⇒ 会拿到独立 .vue 槽（footer 真的被渲染）', () => {
    const r = deriveSectionsFromFigmaTree(makeFigmaWithFooter(), null)
    const leaves = collectLeafSections(r!.sections)
    expect(leaves.map((s: any) => s.id)).toContain('565:3-tail-text')
  })

  test('③ 装饰节点（VECTOR 滚动条）不补', () => {
    const r = deriveSectionsFromFigmaTree(makeFigmaWithFooter(), null)
    const con = r!.sections.find((s: any) => s.id === '565:3')!
    const ids = con.children.map((c: any) => String(c.id))
    expect(ids).not.toContain('48:5904')
  })

  test('④ 阴性：文本位于兄弟上方（非尾部）⇒ 不补（绝不插中间）', () => {
    const f = makeFigmaWithFooter()
    const con = f.children[0]
    con.children[3].absoluteBoundingBox = box(0, 45, 120, 20) // footer 提到卡片上方
    con.children[4].absoluteBoundingBox = box(200, 45, 140, 20)
    const r = deriveSectionsFromFigmaTree(f, null)
    const c = r!.sections.find((s: any) => s.id === '565:3')!
    expect(c.children.map((x: any) => x.id)).not.toContain('565:3-tail-text')
  })

  test('⑤ 阴性：文本已被兄弟覆盖 ⇒ 不补（防重复渲染）', () => {
    const f = makeFigmaWithFooter()
    const con = f.children[0]
    // 把 footer 文本挪进最后一张卡的子树（已被该卡 sourceNodeIds 覆盖）
    con.children[5] = {
      ...con.children[2],
      children: [...con.children[2].children, con.children[3], con.children[4]],
    } as any
    con.children.splice(3, 2)
    const r = deriveSectionsFromFigmaTree(f, null)
    const c = r!.sections.find((s: any) => s.id === '565:3')!
    expect(c.children.map((x: any) => x.id)).not.toContain('565:3-tail-text')
  })

  test('⑥ 阴性：无已提升兄弟的容器 ⇒ 不补（避免把普通内容区整段改写）', () => {
    const f = {
      id: '0:1',
      type: 'FRAME',
      name: 'root',
      absoluteBoundingBox: box(0, 0, 400, 200),
      children: [
        {
          id: '9:9',
          type: 'GROUP',
          name: 'text-only',
          absoluteBoundingBox: box(0, 0, 400, 100),
          children: [
            { id: '9:10', type: 'TEXT', name: 'a', characters: '共 6 个节点', absoluteBoundingBox: box(0, 10, 100, 20) },
          ],
        },
      ],
    }
    const r = deriveSectionsFromFigmaTree(f, null)
    expect(r).toBeTruthy()
    const ids = JSON.stringify(r)
    expect(ids).not.toContain('tail-text')
  })
})
