/**
 * A1 文本真值配额（2026-10-26 · mc-max-1793005707963-47b42841 `81:7` 设备属性表实锤）
 *
 * 病灶：`81:7` 的 figma 真值是 24 条直接 TEXT（4 列 × 6 行 label/value 对），
 *   但计划层 `.slice(0, 12)` 硬截断 ⇒ `body.items` 只有 12 条，而 `elementCount` 仍写 24
 *   ⇒ 计划自身不自洽，下游「必还原文本清单」在计划层就丢了半张表。
 *
 * 本 spec 的对照设计（防假绿）：
 *   ① 阳性：grid 4 列 × 6 行 = 24 条 ⇒ **全部保留**（证明配额不是恒 12）
 *   ② 阴性：竖排正文 20 条 ⇒ **仍按 12 截断**（证明不是"一律放开"，叙述型文本不膨胀）
 *   ③ 纯函数：按行整行取 —— 尾行放不下则**整行放弃**，绝不保留半行（半行=只有 label 无 value）
 *   ④ 纯函数：单行自身超限 ⇒ 行内硬切（否则会退化成 0 条）
 */

jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: '/tmp/mvgo-test-workspace',
  backendRoot: '/Users/smigoo/工作/mvgo/backend-node',
  projectRoot: '/Users/smigoo/工作/mvgo',
  logsDir: '/tmp/mvgo-test-logs',
  dataDir: '/tmp/mvgo-test-data',
  tempComponentsDir: '/tmp/mvgo-test-temp-components',
}), { virtual: true })

import {
  SubcomponentPlanner,
  resolveTextItemCap,
  takeTextItemsByRow,
  TEXT_ITEM_QUOTA,
  TEXT_ROW_TOLERANCE_PX,
} from '../subcomponent-planner.js'

// 🛡️ 2026-10-30 第2步：默认结构骨架已切 vision。本套件判据针对 E1（Figma 树骨架）
// 路径（A1 文本真值配额），统一锁定 structureSource='figma' 保留回归防护，断言语义不变。
const planE1 = (layout: any, opts: any = {}) =>
  new SubcomponentPlanner().plan(layout, { structureSource: 'figma', ...opts });

/**
 * 4 列 × 6 行 = 24 条 TEXT 的 GROUP（对齐 81:7 `Group 2136638454` 440×135.25）。
 * 列 x 间距 120 / 列宽 100 ⇒ `detectGridColumns` 的 `bx - prevX > avgW*0.5` 稳定分 4 列。
 */
function grid24Figma(): any {
  const kids: any[] = []
  let n = 0
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 4; col++) {
      n++
      kids.push({
        id: `7:${100 + n}`,
        name: `t${n}`,
        type: 'TEXT',
        characters: `字段${n}`,
        absoluteBoundingBox: { x: 100 + col * 120, y: 200 + row * 30, width: 100, height: 20 },
      })
    }
  }
  return {
    id: '7:1',
    name: 'cp-属性表',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 1000, height: 600 },
    children: [
      {
        id: '7:2',
        name: 'Group 2136638454',
        type: 'GROUP',
        absoluteBoundingBox: { x: 100, y: 200, width: 460, height: 170 },
        children: kids,
      },
    ],
  }
}

/** 竖排正文：20 条 TEXT 同 x、逐行下移（无网格、非横排） */
function column20Figma(): any {
  const kids: any[] = []
  for (let i = 0; i < 20; i++) {
    kids.push({
      id: `8:${100 + i}`,
      name: `p${i}`,
      type: 'TEXT',
      characters: `正文第${i}段`,
      absoluteBoundingBox: { x: 50, y: 100 + i * 24, width: 400, height: 18 },
    })
  }
  return {
    id: '8:1',
    name: 'cp-说明',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 700 },
    children: [
      {
        id: '8:2',
        name: 'desc',
        type: 'GROUP',
        absoluteBoundingBox: { x: 50, y: 100, width: 400, height: 480 },
        children: kids,
      },
    ],
  }
}

function findSection(secs: any[], id: string): any {
  let hit: any = null
  const walk = (list: any[]) => {
    for (const s of list || []) {
      if (s.id === id) hit = s
      walk(s.children || [])
    }
  }
  walk(secs)
  return hit
}

describe('A1 文本真值配额', () => {
  let planner: InstanceType<typeof SubcomponentPlanner>

  beforeEach(() => {
    planner = new SubcomponentPlanner()
  })

  test('① 阳性：grid 24 条文本全部保留（不再砍成 12）', () => {
    const result: any = planE1(
      { layout: { sections: [] }, sections: [] },
      { figmaNodeData: grid24Figma(), minSectionsForced: 1 },
    )
    const target = findSection(result.effectiveSections, '7:2')
    expect(target).toBeTruthy()
    expect(target.layout).toBe('grid')
    const items = target.body?.items || []
    expect(items).toHaveLength(24)
    // 计划自洽：item 数与 elementCount 一致（旧实现是 12 vs 24）
    expect(items.length).toBe(target.elementCount)
    // 首尾都在（不是只留前 12）
    const texts = items.map((it: any) => it.text)
    expect(texts[0]).toBe('字段1')
    expect(texts[23]).toBe('字段24')
  })

  test('② 阴性：竖排正文 20 条仍按 12 截断（不是一律放开）', () => {
    const result: any = planE1(
      { layout: { sections: [] }, sections: [] },
      { figmaNodeData: column20Figma(), minSectionsForced: 1 },
    )
    const target = findSection(result.effectiveSections, '8:2')
    expect(target).toBeTruthy()
    const items = target.body?.items || []
    expect(items).toHaveLength(TEXT_ITEM_QUOTA.default)
  })
})

describe('A1 配额纯函数', () => {
  test('cap 随布局与 elementCount 抬升，但不越封顶', () => {
    expect(resolveTextItemCap('grid', 24)).toBe(24)
    expect(resolveTextItemCap('grid', 200)).toBe(TEXT_ITEM_QUOTA.grid)
    expect(resolveTextItemCap('grid', 3)).toBe(TEXT_ITEM_QUOTA.default)
    expect(resolveTextItemCap('horizontal', 30)).toBe(TEXT_ITEM_QUOTA.horizontal)
    expect(resolveTextItemCap('vertical', 24)).toBe(TEXT_ITEM_QUOTA.default)
    expect(resolveTextItemCap('', 24)).toBe(TEXT_ITEM_QUOTA.default)
    expect(resolveTextItemCap('grid', NaN)).toBe(TEXT_ITEM_QUOTA.grid)
  })

  test('③ 按行整行取：放不下的整行放弃，不留半行', () => {
    // 3 行 × 4 条，cap=10 ⇒ 只能取 2 整行（8 条），第 3 行整行放弃
    const hits: any[] = []
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        hits.push({ t: `r${row}c${col}`, y: row * 30, x: col * 100 })
      }
    }
    const kept = takeTextItemsByRow(hits, 10)
    expect(kept).toHaveLength(8)
    expect(kept.every((h: any) => h.y < 60)).toBe(true)
  })

  test('④ 首行自身超限 ⇒ 行内硬切（不退化成 0 条）', () => {
    const hits: any[] = Array.from({ length: 8 }, (_, i) => ({
      t: `same${i}`,
      y: 10,
      x: i * 10,
    }))
    const kept = takeTextItemsByRow(hits, 3)
    expect(kept).toHaveLength(3)
  })

  test('Y 缺失的条目按逐条行处理；cap 非法回落到默认值', () => {
    const hits: any[] = Array.from({ length: 20 }, (_, i) => ({ t: `n${i}` }))
    expect(takeTextItemsByRow(hits, NaN)).toHaveLength(TEXT_ITEM_QUOTA.default)
    // 无 y ⇒ 每条自成一行 ⇒ cap=5 取前 5 条
    expect(takeTextItemsByRow(hits, 5)).toHaveLength(5)
  })

  test('行容差是 6px：差 6px 内视为同行', () => {
    expect(TEXT_ROW_TOLERANCE_PX).toBe(6)
    const kept = takeTextItemsByRow(
      [
        { t: 'a', y: 100, x: 0 },
        { t: 'b', y: 106, x: 50 },
        { t: 'c', y: 200, x: 0 },
      ],
      2,
    )
    // 100 与 106 同行（2 条刚好占满 cap），200 单独一行被放弃
    expect(kept.map((h: any) => h.t)).toEqual(['a', 'b'])
  })
})
