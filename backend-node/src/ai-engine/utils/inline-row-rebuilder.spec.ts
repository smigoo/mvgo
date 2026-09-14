/**
 * 🛡️ 治本回归（2026-09-14 · c-traffic-monitor-21e2afd6 实锤）：inline-row 成员顺序。
 *
 * 契约：`members` 必须是**视觉左→右**，事实源是 Figma bbox.**x**（不是 y，也不是数组序）。
 * 事故：旧实现用 `groups[g].map(...)`，而 groups 是按 **y 升序**扫描得到的 —— 行内兄弟
 * y 相同/近似，稳定排序等于保留原始数组序 → members 可能是「右→左」→ LLM 按
 * 「数组序 = 左到右」生成 → 内容左右对调（总流量统计的「江阴大桥 / 江阴靖江长江隧道」
 * 被写反，class 与被挂的值也错位）。
 *
 * bbox 数值全部取自 .mc-gen/cache/figma-node-data.json 真值（节点 2:9778 子树）。
 */
import { rebuildSectionsPreservingInlineRows } from './inline-row-rebuilder.js'
import { mergeInlineRowsIntoSections } from './inline-row-merger.js'

/** 把成员挂到一个水平行节点下；根节点自身无需 bbox */
function wrapRow(rowId: string, members: any[]) {
  return {
    id: '2:9778',
    children: [
      {
        id: rowId,
        name: rowId,
        type: 'GROUP',
        absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 60 },
        children: members,
      },
    ],
  }
}

const membersOf = (doc: any, rowId: string) => {
  const rows = rebuildSectionsPreservingInlineRows(doc)
  return rows.find((r) => r.id === rowId)?.members
}

describe('rebuildSectionsPreservingInlineRows：members 按 Figma x 升序（视觉左→右）', () => {
  test('2:3660 总流量统计：数组序为「右→左」时必须纠正为「左→右」', () => {
    // 真值：2:3680 x=271.83（江阴大桥 82,379，右）；2:3683 x=42.83（34,620 隧道，左）
    const doc = wrapRow('2:3660', [
      { id: '2:3680', name: '江阴大桥82,379', type: 'GROUP', absoluteBoundingBox: { x: 271.83, y: 212, width: 77, height: 52 } },
      { id: '2:3683', name: '34,620江阴靖江长江隧道', type: 'GROUP', absoluteBoundingBox: { x: 42.83, y: 212, width: 128, height: 52 } },
    ])
    expect(membersOf(doc, '2:3660')).toEqual(['2:3683', '2:3680'])
  })

  test('88:32：y 序与 x 序相反时，以 x 为准（24小时 y 更小但在右）', () => {
    // 真值：2:3545 x=315.83 y=158.69（24小时，右，框更高 → y 更小）；2:3559 x=35.83 y=161.82（当日总流量，左）
    const doc = wrapRow('88:32', [
      { id: '2:3545', name: '24小时', type: 'GROUP', absoluteBoundingBox: { x: 315.83, y: 158.69, width: 100, height: 30.42 } },
      { id: '2:3559', name: '当日总流量', type: 'GROUP', absoluteBoundingBox: { x: 35.83, y: 161.82, width: 102, height: 24.34 } },
    ])
    // 旧实现（y 升序）会得到 ['2:3545','2:3559'] = 右在前
    expect(membersOf(doc, '88:32')).toEqual(['2:3559', '2:3545'])
  })

  test('本就 x 升序的行保持原序（零回归）', () => {
    const doc = wrapRow('2:3438', [
      { id: '2:3446', name: '江阴靖江长江隧道客车22350货车16270', type: 'FRAME', absoluteBoundingBox: { x: 32.83, y: 601.0, width: 192, height: 114 } },
      { id: '2:3496', name: '客车66109货车16270江阴大桥', type: 'FRAME', absoluteBoundingBox: { x: 227.83, y: 601.0, width: 192, height: 114 } },
    ])
    expect(membersOf(doc, '2:3438')).toEqual(['2:3446', '2:3496'])
  })

  test('三成员行同样按 x 升序（2:3565 流量预测 / tabs / 节假日预测）', () => {
    const doc = wrapRow('2:3565', [
      { id: '2:3577', name: '节假日预测>', type: 'TEXT', absoluteBoundingBox: { x: 346.83, y: 733, width: 67, height: 18 } },
      { id: '2:3566', name: '江阴靖江长江隧道江阴大桥', type: 'FRAME', absoluteBoundingBox: { x: 127.83, y: 733, width: 204, height: 18 } },
      { id: '2:3571', name: '流量预测', type: 'GROUP', absoluteBoundingBox: { x: 35.83, y: 730, width: 86, height: 24.34 } },
    ])
    expect(membersOf(doc, '2:3565')).toEqual(['2:3571', '2:3566', '2:3577'])
  })

  test('契约下游：merger 产出的 children 顺序即视觉左→右（LLM 无从对调）', () => {
    const doc = wrapRow('2:3660', [
      { id: '2:3680', name: '江阴大桥82,379', type: 'GROUP', absoluteBoundingBox: { x: 271.83, y: 212, width: 77, height: 52 } },
      { id: '2:3683', name: '34,620江阴靖江长江隧道', type: 'GROUP', absoluteBoundingBox: { x: 42.83, y: 212, width: 128, height: 52 } },
    ])
    const rows = rebuildSectionsPreservingInlineRows(doc)
    const merged: any = mergeInlineRowsIntoSections({ type: 'vertical', direction: 'column', sections: [] }, rows, doc)
    const row = merged.sections.find((s: any) => s.id === '2:3660')
    expect(row.children.map((c: any) => c.figmaNode)).toEqual(['2:3683', '2:3680'])
    expect(row.body.children.map((c: any) => c.figmaNode)).toEqual(['2:3683', '2:3680'])
  })
})
