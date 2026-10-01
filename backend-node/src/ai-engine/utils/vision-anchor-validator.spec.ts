/**
 * 🛡️ P1-7 单测（2026-10-01 · c-a812-07a812f7 实锤）：vision 锚点真值校验。
 *
 * 真机基线：该任务 vision 返回 25 个 `N:M` 锚点，18 个不存在（validRatio 28%），
 * 其中 `210:45650` 是 `210:45649 + 1` 的顺延臆造；真值树共 45 个节点 id。
 */
import { collectFigmaNodeIds, validateVisionAnchors } from './vision-anchor-validator.js'

const box = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h })

/** 真值子树量级取自 c-a812-07a812f7（45 个节点，此处截取关键链路） */
const figma = () => ({
  id: '210:45457',
  name: 'cp-选择登录用户',
  type: 'FRAME',
  absoluteBoundingBox: box(0, 0, 575, 389),
  children: [
    {
      id: '210:45641',
      name: '@antd/table',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 20, 575, 173),
      children: [
        {
          id: '210:45642',
          name: 'Frame 列1',
          type: 'FRAME',
          absoluteBoundingBox: box(0, 20, 70, 173),
          children: [
            { id: '210:45645', name: '姓名', type: 'TEXT', characters: '姓名' },
            {
              id: '210:45646',
              name: 'Frame 单元格',
              type: 'FRAME',
              children: [
                { id: '210:45918', name: '@antd/radio', type: 'GROUP', children: [] },
                { id: '210:45648', name: '张斌', type: 'TEXT', characters: '张斌' },
              ],
            },
            { id: '210:45649', name: 'Frame 单元格2', type: 'FRAME', children: [] },
          ],
        },
      ],
    },
    { id: '210:45458', name: '选择登录的用户', type: 'FRAME', children: [] },
  ],
})

describe('collectFigmaNodeIds（真值 id 收集）', () => {
  it('收集全部 N:M 节点 id；document 包装与裸根等价', () => {
    const root = figma()
    const bare = collectFigmaNodeIds(root)
    expect(bare.has('210:45641')).toBe(true)
    expect(bare.has('210:45649')).toBe(true)
    expect(bare.has('210:45918')).toBe(true)
    expect(bare.size).toBe(9)
    // document 包装等价
    expect(collectFigmaNodeIds({ document: root })).toEqual(bare)
  })

  it('空输入 → 空集合', () => {
    expect(collectFigmaNodeIds(null).size).toBe(0)
    expect(collectFigmaNodeIds({}).size).toBe(0)
  })
})

describe('validateVisionAnchors（幻觉锚点标注）', () => {
  it('真实事故形态：真实 id 通过，顺延臆造 id 标注 anchorValid:false', () => {
    const analysis = {
      layout: {
        sections: [
          { id: '210:45458', name: '选择登录的用户', role: '常驻' },
          {
            id: '210:45649',
            name: '内容区',
            role: '常驻',
            body: {
              children: [
                {
                  id: '210:45650', // ← 210:45649 + 1，真值树不存在
                  name: '表格',
                  role: 'table',
                  gridColumns: 3,
                  children: [
                    { id: '210:45648', name: '表头', role: 'table-header' }, // 真值存在（但语义错位）
                  ],
                },
              ],
            },
          },
        ],
      },
    }
    const r = validateVisionAnchors(analysis, figma())
    expect(r.checked).toBe(4)
    expect(r.valid).toBe(3)
    expect(r.invalid).toBe(1)
    expect(r.invalidDetail[0]).toEqual({ path: 'layout.sections.1.body.children.0', key: 'id', id: '210:45650' })
    // 原地标注：确证不存在的才写 anchorValid:false；存在的对象不得被污染
    expect((analysis.layout.sections[1].body.children[0] as any).anchorValid).toBe(false)
    expect((analysis.layout.sections[0] as any).anchorValid).toBeUndefined()
    expect((analysis.layout.sections[1] as any).anchorValid).toBeUndefined()
    expect((analysis.layout.sections[1].body.children[0].children[0] as any).anchorValid).toBeUndefined()
  })

  it('figmaNodeId 同样参与校验（headerSlots 形态）', () => {
    const analysis = {
      headerSlots: [
        { slotType: 'header-right', elementType: 'statistic', content: '在线 12', figmaNodeId: '9:9' },
        { slotType: 'header-right', elementType: 'icon', content: '设置', figmaNodeId: '210:45458' },
      ],
    }
    const r = validateVisionAnchors(analysis, figma())
    expect(r.checked).toBe(2)
    expect(r.invalid).toBe(1)
    expect(r.invalidDetail[0]).toEqual({ path: 'headerSlots.0', key: 'figmaNodeId', id: '9:9' })
    expect((analysis.headerSlots[0] as any).anchorValid).toBe(false)
    expect((analysis.headerSlots[1] as any).anchorValid).toBeUndefined()
  })

  it('非 N:M 的 id（合成 section 名）跳过，不误报', () => {
    const analysis = {
      layout: { sections: [{ id: 'section-vehicle-type', name: '车型分布' }] },
      charts: [{ type: 'bar', title: 'x' }],
    }
    const r = validateVisionAnchors(analysis, figma())
    expect(r.checked).toBe(0)
    expect(r.invalid).toBe(0)
    expect(r.validRatio).toBeNull()
  })

  it('按域聚合 byArea（layout / headerSlots 分账）', () => {
    const analysis = {
      layout: { sections: [{ id: '210:45458' }, { id: '1:1' }] },
      headerSlots: [{ figmaNodeId: '2:2' }],
    }
    const r = validateVisionAnchors(analysis, figma())
    expect(r.byArea.layout).toEqual({ checked: 2, invalid: 1 })
    expect(r.byArea.headerSlots).toEqual({ checked: 1, invalid: 1 })
  })

  it('真值树为空 / 输入为空 → 零计数 fail-open', () => {
    expect(validateVisionAnchors({ layout: { sections: [{ id: '1:1' }] } }, null).checked).toBe(0)
    expect(validateVisionAnchors(null, figma()).checked).toBe(0)
  })

  it('循环引用不爆炸（WeakSet 防护）', () => {
    const a: any = { id: '210:45458' }
    const b: any = { id: '210:45649' }
    a.self = a
    b.peer = a
    const r = validateVisionAnchors({ root: a, other: b }, figma())
    expect(r.checked).toBe(2)
    expect(r.invalid).toBe(0)
  })
})
