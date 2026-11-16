/**
 * 🎯 A4-c（2026-11-16 · mc-max-1794805488274-aca64532 / mc-1794808831127-c019cd88
 *   两轮同稿必现实锤）：画布级 header 不得充当段头条。
 *
 * 病灶：aca64532 画布顶面板标题 1:449（h=39.68 ≤ STRIP_MAX_HEIGHT_PX 40，含 TEXT）
 *   被当「本段小标题」吸入 ⇒ 段盒 y172/h208 → y124/h256 ⇒ intrinsic paddingTop=48 +
 *   designH=256 ⇒ 产物 padding-top:48px + max-height:256px（首屏 48px 空白）。
 *
 * 本 spec 锁：①阳性（aca64532 同构形态）——画布顶 header 不吸入、段盒不动；
 *   ②阴性（合法段内小标题 24px）——正常提升保留。
 */
import { mergeAdjacentHeaderStrips } from '../section-plan-coverage.js'

function node(id: string, name: string, x: number, y: number, w: number, h: number, children: any[] = [], extra: any = {}) {
  return { id, name, type: 'FRAME', absoluteBoundingBox: { x, y, width: w, height: h }, children, ...extra }
}

describe('A4-c：画布级 header 不吸入段盒', () => {
  it('阳性①：aca64532 同构——画布顶 header(39.68/274=14.5%) 不抬升段盒', () => {
    const figma = {
      id: '73:3', name: 'cp-监测预警', type: 'FRAME',
      absoluteBoundingBox: { x: 1759, y: 124, width: 414, height: 274 },
      children: [
        node('1:449', 'header', 1765, 124, 391, 39.68, [
          { id: 't1', name: '标题', type: 'TEXT', absoluteBoundingBox: { x: 1780, y: 130, width: 60, height: 18 }, characters: '监测预警' },
        ]),
        node('2016:219', 'slot-con', 1772, 172, 387, 208, [
          node('2016:220', 'tabs', 1772, 172, 387, 27),
          node('1:376', 'list', 1772, 210, 387, 170),
        ]),
      ],
    }
    const sections = [
      {
        id: '2016:219', name: 'slot-con', layout: 'vertical',
        styles: { figmaHeightPx: 208 },
        body: { children: [{ id: '2016:220' }, { id: '1:376' }] },
      },
    ]
    const { sections: out, stats } = mergeAdjacentHeaderStrips({ sections, figmaNodeData: figma } as any)
    const s = out[0]
    // 候选阶段已拒 ⇒ ①sourceNodeIds 不被污染 ②盒不被抬升（函数只在抬升时写 absBB）
    expect(s.sourceNodeIds || []).not.toContain('1:449')
    expect(s.absoluteBoundingBox).toBeUndefined()
    expect(s.styles?.figmaHeightPx).toBe(208)
    expect(stats.lifted).toBe(0)
    expect(stats.canvasHeaderSkipped).toBeGreaterThanOrEqual(1)
  })

  it('阳性②：大屏形态——画布顶 header 占比 9.4%（<12%）由「y==画布顶」兜住', () => {
    const figma = {
      id: 'root', name: 'cp', type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 425 },
      children: [
        node('h1', 'header', 0, 0, 400, 40, [
          { id: 'th', name: '标题', type: 'TEXT', absoluteBoundingBox: { x: 10, y: 10, width: 60, height: 18 }, characters: '设备监测' },
        ]),
        node('sec1', 'slot-con', 10, 50, 400, 360, [
          node('c1', 'content', 10, 50, 400, 360),
        ]),
      ],
    }
    const sections = [
      { id: 'sec1', name: 'slot-con', layout: 'vertical', styles: { figmaHeightPx: 360 }, body: { children: [{ id: 'c1' }] } },
    ]
    const { sections: out, stats } = mergeAdjacentHeaderStrips({ sections, figmaNodeData: figma } as any)
    expect(out[0].sourceNodeIds || []).not.toContain('h1')
    expect(out[0].absoluteBoundingBox).toBeUndefined()
    expect(stats.lifted).toBe(0)
    expect(stats.canvasHeaderSkipped).toBeGreaterThanOrEqual(1)
  })

  it('阴性：合法段内小标题（24px，画布中部）正常提升保留', () => {
    const figma = {
      id: 'root', name: 'cp', type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 420, height: 425 },
      children: [
        // 真机形态：strip 与段锚是同 parent 兄弟（88:32 ↔ 2:3559 同款）
        node('sub-header', '4sub-header', 10, 174, 300, 24, [
          { id: 'sht', name: 't', type: 'TEXT', absoluteBoundingBox: { x: 12, y: 178, width: 80, height: 16 }, characters: '24小时' },
        ]),
        node('chart-sec', '流量预测', 10, 200, 400, 150),
      ],
    }
    const sections = [
      { id: 'chart-sec', name: '流量预测', layout: 'vertical', styles: { figmaHeightPx: 150 }, body: { children: [{ id: 'sub-header' }] } },
    ]
    const { sections: out, stats } = mergeAdjacentHeaderStrips({ sections, figmaNodeData: figma } as any)
    // 小标题在锚点上方（gap=200-(174+24)=2 ∈[-1,32]、lifted=350-174=176>150+0.5）⇒ 正常抬升
    expect(out[0].absoluteBoundingBox?.y).toBe(174)
    expect(out[0].styles?.figmaHeightPx).toBe(176)
    expect(stats.canvasHeaderSkipped || 0).toBe(0)
  })
})
