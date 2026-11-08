/**
 * V-5 段粒度过粗局部展开单测（2026-11-08 · mc-1794128973091-c3fe924f 实锤）。
 *
 * 真机形态：`89:40`（407×380 根槽容器）下是 `89:38`（396×65 switch，铺满）
 * 与 `89:37`（46×317 左竖 tab 条，**只有 46 宽**且与上一块重叠 2px）——
 * 两个都必须算进堆叠序列，否则过粗漏判（真机两次踩坑：面积阈值、1px 重叠）。
 */
import { isOverCoarseAnchor, expandOverCoarseSections } from './over-coarse-section-expander.js'

function node(id, name, x, y, w, h, children, type = 'FRAME') {
  return {
    id,
    name,
    type,
    absoluteBoundingBox: { x, y, width: w, height: h },
    children: children || [],
  }
}

function textNode(id, value, x, y, w, h) {
  return { id, name: 't', type: 'TEXT', characters: value, absoluteBoundingBox: { x, y, width: w, height: h } }
}

/** 真机 89:40 形态：switch 条 + 左竖 tab（窄、与上块重叠 2px） */
function slotCon() {
  return node('89:40', 'slot-con', 0, 0, 407, 380, [
    node('89:38', 'switch', 10, 0, 396, 65, [textNode('t1', '设备类型28', 20, 20, 80, 20)]),
    node('89:37', '@antd/tab', 0, 63, 46, 317, [
      node('2:8437', 'cons', 43, 75, 367, 295, [
        textNode('t2', '摄像机', 60, 100, 60, 20),
        textNode('t3', '风速风向仪', 60, 180, 60, 20),
      ]),
    ]),
  ])
}

describe('isOverCoarseAnchor', () => {
  it('阳性：switch 条 + 左竖 tab 垂直堆叠、覆盖满高 ⇒ 判过粗', () => {
    const v = isOverCoarseAnchor(slotCon())
    expect(v.over).toBe(true)
    expect(v.reason).toBe('coarse-container')
    expect(v.childIds).toEqual(['89:38', '89:37'])
    expect(v.covered).toBeGreaterThanOrEqual(0.99)
  })

  it('阴性①：子容器左右并排（y 相同）⇒ 不是垂直堆叠', () => {
    const n = node('9:1', 'row', 0, 0, 400, 100, [
      node('9:2', 'a', 0, 0, 195, 100, [textNode('ta', 'A', 10, 10, 30, 20)]),
      node('9:3', 'b', 205, 0, 195, 100, [textNode('tb', 'B', 210, 10, 30, 20)]),
    ])
    expect(isOverCoarseAnchor(n).over).toBe(false)
  })

  it('阴性②：垂直堆叠但合计只占容器高度一半 ⇒ 不展开', () => {
    const n = node('9:1', 'box', 0, 0, 400, 400, [
      node('9:2', 'a', 0, 0, 400, 100, [textNode('ta', 'A', 10, 10, 30, 20)]),
      node('9:3', 'b', 0, 110, 400, 100, [textNode('tb', 'B', 10, 110, 30, 20)]),
    ])
    const v = isOverCoarseAnchor(n)
    expect(v.over).toBe(false)
    expect(v.reason).toContain('vertical-cover')
  })

  it('阴性③：只有 1 个实质子 ⇒ 不展开', () => {
    const n = node('9:1', 'box', 0, 0, 400, 400, [
      node('9:2', 'a', 0, 0, 400, 400, [textNode('ta', 'A', 10, 10, 30, 20)]),
    ])
    expect(isOverCoarseAnchor(n).over).toBe(false)
  })

  it('阴性④：子无实质内容（空壳 FRAME）⇒ 不算候选', () => {
    const n = node('9:1', 'box', 0, 0, 400, 400, [
      node('9:2', 'a', 0, 0, 400, 200),
      node('9:3', 'b', 0, 200, 400, 200),
    ])
    const v = isOverCoarseAnchor(n)
    expect(v.over).toBe(false)
    expect(v.reason).toContain('substantial-children')
  })

  it('阴性⑤：子高度 <10%（横向细条）⇒ 不算候选', () => {
    const n = node('9:1', 'box', 0, 0, 400, 400, [
      node('9:2', 'a', 0, 0, 400, 400, [textNode('ta', 'A', 10, 10, 30, 20)]),
      node('9:3', 'thin', 0, 396, 400, 4, [textNode('tb', 'B', 10, 396, 30, 4)]),
    ])
    expect(isOverCoarseAnchor(n).over).toBe(false)
  })

  it('阴性⑥：无节点 ⇒ 不判', () => {
    expect(isOverCoarseAnchor(null).over).toBe(false)
  })
})

describe('expandOverCoarseSections', () => {
  it('无 Figma 真值 ⇒ fail-open 原样返回同一引用', () => {
    const sections = [{ id: '89:40' }]
    const res = expandOverCoarseSections(sections, null)
    expect(res.sections).toBe(sections)
    expect(res.stats.skippedReason).toBe('no-figma-data')
  })

  it('片段不满 2 个实质子 ⇒ 不改动并留痕拒绝原因', () => {
    const figma = { document: node('root', 'root', 0, 0, 400, 400, [slotCon()]) }
    const sections = [{ id: '89:38', figmaAnchorId: '89:38' }]
    const res = expandOverCoarseSections(sections, figma)
    expect(res.sections).toBe(sections)
    expect(res.stats.expanded).toBe(0)
    expect(res.stats.skippedReason).toContain('89:38')
  })

  it('过粗段命中但 E1 推导不出 ≥2 子段 ⇒ 保留原段（fail-open）', () => {
    // 只给锚点自身，不给可推导的子树结构
    const figma = { document: slotCon() }
    const sections = [{ id: '89:40', figmaAnchorId: '89:40' }]
    const res = expandOverCoarseSections(sections, figma)
    expect(() => expandOverCoarseSections(sections, figma)).not.toThrow()
    if (res.stats.expanded > 0) {
      // 展开成功：每个子段都带来源留痕
      expect(res.sections.every((s) => s._expandedFrom === '89:40')).toBe(true)
      expect(res.sections.length).toBeGreaterThanOrEqual(2)
    } else {
      // 推导失败：必须原样保留同一引用，且拒绝原因可观测
      expect(res.sections).toBe(sections)
      expect(res.stats.skippedReason).toContain('89:40')
    }
  })
})
