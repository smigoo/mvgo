import { applyFigmaSectionRatios } from './figma-height-ratio.js'

/**
 * P0-5（2026-11-15 治本）：A4 第四条来源 —— **段头完整性下限**。
 *
 * 病灶（mc-max-1794719857954-049e54f6 真机数值）：
 *   vision 的 section 锚点只覆盖**内容区**，段标题条（`0sub-header`/`4sub-header`/`6sub-header`）
 *   是锚点上方的独立节点 ⇒ 前三条分支（逐项并集 / slot 上溯 / 几何并集）全部 miss
 *   ⇒ `figmaHeightPx` 少一整个标题行（车型分布 114 / 真值 142；流量预测 140.7 / 真值 175；
 *   当日总流量 91.4 / 真值 128.7，合计 -99px = 成品比设计稿矮 12% 的全部缺口）。
 *
 * 判据核心是**正间隙**：标题条底边必须在段盒顶「之上」且贴得近（≤16px）。
 * 标题已在段盒内（gap ≤ 0）时绝不并入 —— 这是图1/图2 的阴性对照。
 */

const box = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
})

/** 还原真机 5 段 + 3 条段头 的几何关系（坐标取自 figma-node-data.json） */
function realWorldDoc(extra: any[] = []) {
  return {
    name: 'cp-traffic',
    type: 'FRAME',
    absoluteBoundingBox: box(0, 0, 425.83, 807),
    children: [
      // 段头 ①：当日总流量（158.7..189.1），段盒 196..287.4 ⇒ gap 6.9
      {
        id: 'hdr-day',
        name: '0sub-header',
        type: 'FRAME',
        absoluteBoundingBox: box(35.8, 158.7, 380, 30.4),
        children: [
          { id: 'txt-day', name: '当日总流量', type: 'TEXT', absoluteBoundingBox: box(57.8, 161.8, 80, 24.3) },
        ],
      },
      // 段 ①：统计内容区（不含段头）
      { id: 'sec-day', name: '1统计', type: 'FRAME', absoluteBoundingBox: box(10, 196, 425.83, 91.44) },
      // 段 ②：图表段（标题 2charts 内部，与段顶同 y ⇒ gap 0，阴性对照）
      {
        id: 'sec-chart1',
        name: '2charts',
        type: 'FRAME',
        absoluteBoundingBox: box(33.8, 287, 379, 131),
        children: [
          { id: 'txt-chart1', name: '江阴靖江长江隧道', type: 'TEXT', absoluteBoundingBox: box(39.8, 287, 112, 21) },
        ],
      },
      // 段 ③：第二张图表段
      {
        id: 'sec-chart2',
        name: '3charts',
        type: 'FRAME',
        absoluteBoundingBox: box(33.8, 428, 379, 131),
        children: [
          { id: 'txt-chart2', name: '江阴大桥', type: 'TEXT', absoluteBoundingBox: box(39.8, 428, 112, 21) },
        ],
      },
      // 段头 ③：车型分布（573..597.3），段盒 601..715 ⇒ gap 3.7
      {
        id: 'hdr-cars',
        name: '4sub-header',
        type: 'GROUP',
        absoluteBoundingBox: box(36.8, 573, 86, 24.3),
        children: [
          { id: 'txt-cars', name: '车型分布', type: 'TEXT', absoluteBoundingBox: box(57.8, 573, 64, 24.3) },
        ],
      },
      // 段 ③：车型卡内容区
      { id: 'sec-cars', name: '5cards', type: 'FRAME', absoluteBoundingBox: box(32.8, 601, 387, 114) },
      // 段头 ④：流量预测（730..754.3），段盒 764.3..905 ⇒ gap 10.3
      // 🔴 内部带 @antd/tab —— 技术标记不得成为排除理由（tab 本就长在标题行上）
      {
        id: 'hdr-forecast',
        name: '6sub-header',
        type: 'GROUP',
        absoluteBoundingBox: box(35.8, 730, 378, 24.3),
        children: [
          { id: 'txt-forecast', name: '流量预测', type: 'TEXT', absoluteBoundingBox: box(57.8, 730, 64, 24.3) },
          { id: 'tab-forecast', name: '@antd/tab', type: 'FRAME', absoluteBoundingBox: box(127.8, 733, 204, 18) },
        ],
      },
      // 段 ④：预测图内容区
      { id: 'sec-forecast', name: '@echarts/line-7', type: 'GROUP', absoluteBoundingBox: box(43.8, 764.3, 363, 140.7) },
      ...extra,
    ],
  }
}

function sectionsFor(ids: string[]) {
  return ids.map((fid) => ({ name: `s-${fid}`, figmaNodeId: fid }))
}

describe('A4 ④ 段头完整性下限（headerStripFloorHeight）', () => {
  it('阳性：三个段各补齐自己的标题行（91.4→128.7 / 114→142 / 140.7→175）', () => {
    const sections: any[] = sectionsFor([
      'sec-day',
      'sec-chart1',
      'sec-chart2',
      'sec-cars',
      'sec-forecast',
    ])
    const stats: any = {}
    expect(applyFigmaSectionRatios(sections, { document: realWorldDoc() }, stats)).toBe(5)

    const h = sections.map((s) => s.styles.figmaHeightPx)
    expect(h[0]).toBe(129) // 287.4 - 158.7 = 128.7
    expect(h[1]).toBe(131) // 图表标题在段内 ⇒ 不变
    expect(h[2]).toBe(131)
    expect(h[3]).toBe(142) // 715 - 573 = 142
    expect(h[4]).toBe(175) // 905 - 730 = 175
    expect(stats.headerStrip).toBe(3)
  })

  it('阴性对照：标题已在段盒内（gap = 0）绝不并入 —— 两张图表段零改动', () => {
    const sections: any[] = sectionsFor(['sec-chart1', 'sec-chart2'])
    expect(applyFigmaSectionRatios(sections, { document: realWorldDoc() })).toBe(2)
    expect(sections[0].styles.figmaHeightPx).toBe(131)
    expect(sections[1].styles.figmaHeightPx).toBe(131)
  })

  it('阴性：上方是内容块（h > 40）不算段头', () => {
    const doc = {
      name: 'cp',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 420, 400),
      children: [
        { id: 'big', name: 'chart', type: 'FRAME', absoluteBoundingBox: box(0, 0, 420, 150) },
        { id: 'txt-big', name: '标题', type: 'TEXT', absoluteBoundingBox: box(10, 10, 80, 20) },
        { id: 'sec', name: 'list', type: 'FRAME', absoluteBoundingBox: box(0, 154, 420, 100) },
      ],
    }
    const sections: any[] = sectionsFor(['big', 'sec'])
    expect(applyFigmaSectionRatios(sections, { document: doc })).toBe(2)
    expect(sections[1].styles.figmaHeightPx).toBe(100)
  })

  it('阴性：间隙 > 16px 视为两块无关内容', () => {
    const doc = {
      name: 'cp',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 420, 400),
      children: [
        {
          id: 'hdr',
          name: 'sub-header',
          type: 'GROUP',
          absoluteBoundingBox: box(0, 100, 420, 24),
          children: [{ id: 'txt', name: '标题', type: 'TEXT', absoluteBoundingBox: box(10, 100, 80, 24) }],
        },
        { id: 'sec', name: 'cards', type: 'FRAME', absoluteBoundingBox: box(0, 141, 420, 100) },
      ],
    }
    const sections: any[] = sectionsFor(['hdr', 'sec'])
    applyFigmaSectionRatios(sections, { document: doc })
    expect(sections[1].styles.figmaHeightPx).toBe(100) // 141 - 124 = 17 > 16 ⇒ 不并
  })

  it('阴性：水平不重叠（侧栏标题）不算本段段头', () => {
    const doc = {
      name: 'cp',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 420, 400),
      children: [
        {
          id: 'hdr',
          name: 'sub-header',
          type: 'GROUP',
          absoluteBoundingBox: box(0, 100, 200, 24), // 只覆盖左半
          children: [{ id: 'txt', name: '标题', type: 'TEXT', absoluteBoundingBox: box(10, 100, 80, 24) }],
        },
        { id: 'sec', name: 'cards', type: 'FRAME', absoluteBoundingBox: box(300, 128, 120, 100) },
      ],
    }
    const sections: any[] = sectionsFor(['hdr', 'sec'])
    applyFigmaSectionRatios(sections, { document: doc })
    expect(sections[1].styles.figmaHeightPx).toBe(100)
  })

  it('阴性：候选已被其它段认领（是别人的内容块）不并', () => {
    const doc = {
      name: 'cp',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 420, 400),
      children: [
        {
          id: 'hdr',
          name: 'sub-header',
          type: 'GROUP',
          absoluteBoundingBox: box(0, 100, 420, 24),
          children: [{ id: 'txt', name: '标题', type: 'TEXT', absoluteBoundingBox: box(10, 100, 80, 24) }],
        },
        { id: 'secA', name: 'cards', type: 'FRAME', absoluteBoundingBox: box(0, 128, 420, 50) },
        { id: 'secB', name: 'other', type: 'FRAME', absoluteBoundingBox: box(0, 200, 420, 50) },
      ],
    }
    const sections: any[] = sectionsFor(['hdr', 'secA', 'secB'])
    applyFigmaSectionRatios(sections, { document: doc })
    // hdr 自己就是段（被认领）⇒ secA 不得把 hdr 当自己的段头
    expect(sections[1].styles.figmaHeightPx).toBe(50)
  })

  it('阴性：无文本的装饰薄条不算段头', () => {
    const doc = {
      name: 'cp',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 420, 400),
      children: [
        { id: 'deco', name: 'divider', type: 'RECTANGLE', absoluteBoundingBox: box(0, 100, 420, 8) },
        { id: 'sec', name: 'cards', type: 'FRAME', absoluteBoundingBox: box(0, 112, 420, 100) },
      ],
    }
    const sections: any[] = sectionsFor(['deco', 'sec'])
    applyFigmaSectionRatios(sections, { document: doc })
    expect(sections[1].styles.figmaHeightPx).toBe(100)
  })

  it('量纲纪律：补齐后 flexGrow 仍是 avg=1 比例量级，且不写固定高度', () => {
    const sections: any[] = sectionsFor([
      'sec-day',
      'sec-chart1',
      'sec-chart2',
      'sec-cars',
      'sec-forecast',
    ])
    applyFigmaSectionRatios(sections, { document: realWorldDoc() })
    const total = 129 + 131 + 131 + 142 + 175
    for (const s of sections) {
      expect(s.styles.flexGrow).toBeGreaterThan(0)
      expect(s.styles.flexGrow).toBeLessThan(5)
      expect(s.styles.flexShrink).toBe(1)
      expect(s.styles.flexBasis).toBe(0)
      expect(s.styles.height).toBeUndefined()
      // 几何契约双写：px 真值同步
      expect(s.geometryPx.h).toBe(s.styles.figmaHeightPx)
    }
    expect(sections[0].styles.flexGrow).toBeCloseTo(129 / (total / 5), 2)
  })
})
