/**
 * P2-1：网格段禁用 R2 内部拆分（2026-11-12）
 *
 * 病灶（mc-max-1794456716158-7f427bd3 / mc-max-1794459006953-e85319b7 实锤）：
 *   优质组 12 元素、普通组 15 元素触发 R2「元素密度拆分」。4 列网格里 x 间距
 *   146 > 50 ⇒ R2 的列聚类把 4 列拆成 4 个「单元素列」，`every(col => count>=2)`
 *   不成立 ⇒ 落到「轮流分配 idx % groupCount」⇒ 视觉序第 1/3/5 元素给 Group1、
 *   第 2/4/6 给 Group2 —— 4 列网格被**交错劈成两半**。
 *   实测产物：只剩 QualityGroupA/B（各半张网），战略组/普通组整体消失，
 *   预览下半页完全空白。
 *
 * 治本判据（单一来源 `row-metrics`，不复制阈值）：
 *   段 → 几何列数 ≥ 2 即网格 ⇒ 整段一个 v-for，R2 直接返回 []。
 *
 * 🔴 关键修订：判据不能只看 `section.body.children` 的几何 —— 真机 layoutStructure
 *   经装配后元素只剩语义字段（figmaBox 被裁掉），必须回退 **Figma 节点树**
 *   （`opts.figmaNodeData` → `indexFigmaNodes` → `deriveGridColumnsFromNode`）。
 *
 * ⚠️ 历史坑：本组用例最初写在 `subcomponent-planner-phase2.test.js`，
 *   而 jest `testRegex = .*\.spec\.ts$` ⇒ **.test.js 从未被执行**（死测试）。
 *   故迁到本 spec 文件。
 */

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: '/tmp/mvgo-test-workspace',
  backendRoot: '/Users/smigoo/工作/mvgo/backend-node',
  projectRoot: '/Users/smigoo/工作/mvgo',
  logsDir: '/tmp/mvgo-test-logs',
  dataDir: '/tmp/mvgo-test-data',
  tempComponentsDir: '/tmp/mvgo-test-temp-components',
}), { virtual: true })

import { SubcomponentPlanner } from '../subcomponent-planner.js'

const plan = (layout: any, opts: any = {}) =>
  new SubcomponentPlanner().plan(layout, { enableInternalSplit: true, ...opts })

/** 4 列 × N 行的卡片网格（元素自带几何，模拟几何未被裁剪的路径） */
function gridSectionWithBoxes(id: string, count: number) {
  const card = (i: number) => ({
    id: `${id}-card-${i}`,
    type: 'card',
    figmaBox: { x: (i % 4) * 146, y: Math.floor(i / 4) * 96, width: 126, height: 76 },
  })
  return {
    id,
    name: '厂商网格',
    body: { gridColumns: 4, children: Array.from({ length: count }, (_, i) => card(i)) },
  }
}

/** 真机 Figma 节点树：3 个行带 × 4 张等宽卡（564 = 4×126 + 3×20） */
function figmaGridTruth(sectionId: string) {
  const card = (x: number, y: number) => ({
    id: `c-${x}-${y}`,
    type: 'FRAME',
    absoluteBoundingBox: { x, y, width: 126, height: 40 },
  })
  const rowBand = (y: number, i: number) => ({
    id: `row-${i}`,
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y, width: 564, height: 40 },
    children: [0, 1, 2, 3].map((k) => card(20 + k * 146, y)),
  })
  return {
    document: {
      id: 'root',
      type: 'FRAME',
      children: [
        {
          id: sectionId,
          type: 'GROUP',
          absoluteBoundingBox: { x: 0, y: 0, width: 604, height: 240 },
          children: [
            { id: 'bg', type: 'RECTANGLE', name: 'bg', absoluteBoundingBox: { x: 0, y: 0, width: 604, height: 240 } },
            rowBand(0, 0),
            rowBand(60, 1),
            rowBand(120, 2),
            rowBand(180, 3),
          ],
        },
      ],
    },
  }
}

describe('P2-1 网格段禁用 R2', () => {
  test('阳性：段元素自带几何的 4 列 15 元素网格不触发 R2', () => {
    const result = plan({ sections: [gridSectionWithBoxes('38:3162', 15)] })

    expect(result.effectiveSections).toHaveLength(1)
    expect(result.internalSubcomponents).toHaveLength(0)
    expect(result.effectiveSections[0].gridColumns).toBe(4)
  })

  test('阳性兜底：段元素几何被裁剪时用 Figma 节点树判列数', () => {
    // 真机形态：body.children 只有语义字段（无 figmaBox）
    const layout = {
      sections: [
        {
          id: '38:3162',
          name: '优质厂商',
          layout: 'vertical',
          body: {
            children: Array.from({ length: 12 }, (_, i) => ({
              id: `e-${i}`,
              name: `元素${i}`,
              type: 'TEXT',
            })),
          },
        },
      ],
    }

    const result = plan(layout, {
      figmaNodeData: figmaGridTruth('38:3162'),
      structureSource: 'vision',
    })

    expect(result.internalSubcomponents).toHaveLength(0)
    expect(result.effectiveSections[0].gridColumns).toBe(4)
  })

  test('阴性对照：既无段几何也无 Figma 真值时，R2 行为不变（fail-open）', () => {
    const layout = {
      sections: [
        {
          id: 'section-dense',
          name: '高密度区',
          body: {
            children: Array.from({ length: 15 }, (_, i) => ({ id: `card-${i}`, type: 'card' })),
          },
        },
      ],
    }

    const result = plan(layout)

    // 判据拿不到几何 ⇒ 不干预，仍按原 R2 逻辑拆分
    expect(result.internalSubcomponents.length).toBeGreaterThan(0)
    expect(result.internalSubcomponents[0].type).toBe('element-group')
  })
})
