/**
 * 内部语义树回挂（2026-10-27 · d072d085 / 2ec8acc7 实锤）单元测试
 *
 * 背景：vision 的 `body.children` 是「内部结构」的唯一语义真值源 ——
 *   `label-value`（label+value 配对）、`stat-card`（title+value+背景图）、
 *   `table-header`（每列）、`list-item`（每格）。
 *   d072d085 的 12 对属性此前 100% 蒸发：plan 只剩 24 条平铺 `{text,figmaNode}`
 *   ⇒ 产物把「2 列 × 6 行 × 12 对」猜成 `repeat(4,1fr)` × 6 行。
 *
 * 根因（本条治的就是它）：一段匹配 `enrich` 按 `figmaNodeId||id` 匹配，把
 *   「聚合级 vision section」贴给了容器里**同 id 的单个 TEXT 叶子**，并置
 *   `_consumed = true`，使 F1 的**文本重合度**匹配整段跳过。
 *
 * 治本：同一条 F1 循环里按文本重合度找宿主，把 vision 内部树写进**新字段
 *   `internalTree`**（绝不碰 `body`）⇒ 对既有下游零行为变化。
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

// 🛡️ 2026-10-30 第2步：默认结构骨架已切 vision。本套件判据针对 E1（Figma 树骨架）
// 路径（内部语义树回挂），统一锁定 structureSource='figma' 保留回归防护，断言语义不变。
const planE1 = (layout: any, opts: any = {}) =>
  new SubcomponentPlanner().plan(layout, { structureSource: 'figma', ...opts });

/**
 * 属性网格的真值几何（对齐 d072d085 的 `81:7`）：
 *   x 唯一值多个、间距非等距 `[15,13,43,188,…]` ⇒ `buildGridContract#uniformPitch` 恒 null
 *   ⇒ `noGridContract` ⇒ 几何通道救不了，只能靠语义。
 */
function propertyGridFigma(): any {
  return {
    id: '801:3',
    name: 'slot-icon',
    type: 'GROUP',
    absoluteBoundingBox: { x: 24745, y: 51499, width: 547, height: 493 },
    children: [
      {
        id: '81:7',
        name: 'Group 2136638454',
        type: 'GROUP',
        absoluteBoundingBox: { x: 24745, y: 51630, width: 440, height: 135 },
        children: [
          { id: '36:1699', name: '所属产品', type: 'TEXT', characters: '所属产品', absoluteBoundingBox: { x: 24745, y: 51630, width: 56, height: 14 } },
          { id: '36:1710', name: '爆闪灯', type: 'TEXT', characters: '爆闪灯', absoluteBoundingBox: { x: 24816, y: 51630, width: 42, height: 14 } },
          { id: '36:1700', name: '所属路公司', type: 'TEXT', characters: '所属路公司', absoluteBoundingBox: { x: 25004, y: 51654, width: 70, height: 14 } },
          { id: '36:1711', name: '江苏通行宝', type: 'TEXT', characters: '江苏通行宝', absoluteBoundingBox: { x: 25089, y: 51654, width: 70, height: 14 } },
        ],
      },
    ],
  }
}

function labelValuePair(id: string, label: string, value: string): any {
  return {
    id,
    name: label,
    role: 'info-item',
    type: 'label-value',
    layout: 'horizontal',
    children: [
      { type: 'label', text: label, styles: { fontSize: '14px', color: 'rgba(84,104,129,1)' } },
      { type: 'value', text: value, styles: { fontSize: '14px', color: 'rgba(51,51,51,1)' } },
    ],
  }
}

/**
 * vision 的聚合级 section。
 * 🔴 `id` 刻意取 `36:1699` —— 撞上容器内那个「所属产品」TEXT 的真 id，复现一段匹配错贴。
 */
function propertyGridVision(): any {
  return {
    layout: {
      sections: [
        {
          id: '36:1699',
          name: '设备属性信息',
          role: '常驻',
          layout: 'grid',
          headerRelation: 'content-below-title',
          slotCandidate: null,
          header: { title: '', controls: [] },
          body: {
            layout: 'grid',
            gridColumns: 2,
            bgPlaceholder: null,
            children: [
              labelValuePair('36:1699', '所属产品', '爆闪灯'),
              labelValuePair('36:1700', '所属路公司', '江苏通行宝'),
            ],
          },
        },
      ],
    },
  }
}

function findBySectionId(list: any[], id: string): any {
  for (const s of list || []) {
    if (s?.id === id) return s
    const hit = findBySectionId(s?.children || [], id)
    if (hit) return hit
  }
  return null
}

describe('内部语义树回挂（vision body.children → plan.internalTree）', () => {
  let planner: InstanceType<typeof SubcomponentPlanner>

  beforeEach(() => {
    planner = new SubcomponentPlanner()
  })

  test('vision id 撞上容器内 TEXT 真 id 时，内部树仍按文本重合度挂到正确宿主', () => {
    const result: any = planE1(propertyGridVision(), {
      figmaNodeData: propertyGridFigma(),
      minSectionsForced: 1,
    })
    const secs: any[] = result.effectiveSections || []
    const target = findBySectionId(secs, '81:7')

    expect(target).toBeTruthy()
    expect(target.internalTree).toBeTruthy()
    // 列数真值 2 得以保留（否则下游只能猜成 4 列）
    expect(target.internalTree.gridColumns).toBe(2)
    expect(target.internalTree.layout).toBe('grid')
    expect(target.internalTree.nodeCount).toBe(2)
    expect(target.internalTree.sourceSectionId).toBe('36:1699')
    // 配对语义原样保留：label-value + label/value 双层
    expect(target.internalTree.children[0].type).toBe('label-value')
    expect(target.internalTree.children[0].children[0]).toMatchObject({
      type: 'label',
      text: '所属产品',
    })
    expect(target.internalTree.children[0].children[1]).toMatchObject({
      type: 'value',
      text: '爆闪灯',
    })
  })

  test('内部树是纯加法：body 仍是扁平文本 items，行为不回归', () => {
    const result: any = planE1(propertyGridVision(), {
      figmaNodeData: propertyGridFigma(),
      minSectionsForced: 1,
    })
    const target = findBySectionId(result.effectiveSections || [], '81:7')

    expect(target).toBeTruthy()
    // 既有承载「有哪些文案」的 body.items 未被改写
    const texts = (target.body?.items || []).map((it: any) => it.text)
    expect(texts).toEqual(
      expect.arrayContaining(['所属产品', '爆闪灯', '所属路公司', '江苏通行宝']),
    )
    // internalTree 只承载「怎么配对」，不复制 items 的 key
    expect(target.internalTree.items).toBeUndefined()
  })

  test('vision 无 body.children 时不产 internalTree 键（fail-open，零副作用）', () => {
    const vision: any = {
      layout: {
        sections: [
          {
            id: '36:1699',
            name: '设备属性信息',
            role: '常驻',
            layout: 'grid',
            header: { title: '', controls: [] },
            body: { layout: 'grid', gridColumns: 2 },
          },
        ],
      },
    }
    const result: any = planE1(vision, {
      figmaNodeData: propertyGridFigma(),
      minSectionsForced: 1,
    })
    const target = findBySectionId(result.effectiveSections || [], '81:7')

    expect(target).toBeTruthy()
    expect(target.internalTree).toBeUndefined()
  })
})
