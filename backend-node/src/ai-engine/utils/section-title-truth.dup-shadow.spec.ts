/**
 * 🛡️ 2026-11-17（设计稿叠字废稿层去重 · mc-max-1794874512632-3c86927e 实锤）
 *
 * 病灶链（监测预警 73:3）：设计稿标题区三层堆叠——`1:471 GROUP` 含 `1:472`+`1:473`
 *   两条**同 bbox 同文本**的 TEXT「小标题」（废稿叠层，被上层白字盖住）+ `1:474 白字`
 *   含真标题「监测预警」。`header-slot-validator#deriveHeaderSlotsFromFigma` 的
 *   collectTexts 三层全收 ⇒「小标题 小标题」被推导成 header-right/label 契约 ⇒
 *   tab 栏被错误安进面板标题条（真值 tab 在内容区 y=173）⇒ 与面板标题 bbox 相交 ⇒
 *   RUNTIME-016 反复报（D2 回灌 3 轮不收敛——契约来自真值）。
 *
 * 治本（上游链头）：`markDuplicateShadowTexts` 预标记 `_dupShadow`，采集方跳过。
 *   ① 同位叠字：同父、文本相等、bbox 交叠/较小者 ≥0.8 ⇒ 保留源序靠后者；
 *   ② 被覆盖隐藏层：与不同文本 TEXT 重叠 ≥0.8、源序更早 ⇒ 废稿层；
 *   fail-open：异常不阻断推导。
 */
import { markDuplicateShadowTexts, pickSectionTitle } from './section-title-truth.js'

/** 真机 73:3 标题区形态缩样 */
const buildTitleStack = () => ({
  document: {
    id: '73:3',
    name: 'cp-监测预警',
    type: 'FRAME',
    children: [
      {
        id: '1:449',
        name: 'header',
        type: 'GROUP',
        children: [
          {
            id: '1:468',
            name: '标题',
            type: 'FRAME',
            children: [
              {
                id: '1:470',
                name: '标题',
                type: 'GROUP',
                children: [
                  {
                    id: '1:471',
                    name: 'Group',
                    type: 'GROUP',
                    children: [
                      { id: '1:472', name: '小标题', type: 'TEXT', characters: '小标题', absoluteBoundingBox: { x: 1811.72, y: 130.08, width: 82, height: 36 } },
                      { id: '1:473', name: '小标题', type: 'TEXT', characters: '小标题', absoluteBoundingBox: { x: 1811.72, y: 130.08, width: 82, height: 36 } },
                    ],
                  },
                  {
                    id: '1:474',
                    name: '白字',
                    type: 'GROUP',
                    children: [
                      { id: '1:475', name: '监测预警', type: 'TEXT', characters: '监测预警', absoluteBoundingBox: { x: 1810.12, y: 124.84, width: 96, height: 31 } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
})

const node = (figma, ids) => {
  let cur = figma.document
  for (const id of ids) cur = cur.children.find((c) => c.id === id)
  return cur
}

describe('markDuplicateShadowTexts · 叠字废稿层去重（3c86927e 链头根治）', () => {
  test('① 同位叠字 + 跨组覆盖：小标题两条全标记、真标题不标（三轮补后实测）', () => {
    const figma = buildTitleStack()
    const stats = markDuplicateShadowTexts(figma)
    // 🛡️ 订正（三轮补 · 跨 GROUP 覆盖链）：1:472 同位叠字底层标记；
    //   1:473（可见侧）与 1:475（白字真标题，渲染序更晚）重叠 0.72 ≥0.7 ⇒ 同为废稿层。
    //   检测力提升：headerSlots 采集彻底见不到「小标题」。
    expect(stats.markedIds).toEqual(expect.arrayContaining(['1:472', '1:473']))
    expect(node(figma, ['1:449', '1:468', '1:470', '1:471', '1:472'])._dupShadow).toBe(true)
    expect(node(figma, ['1:449', '1:468', '1:470', '1:471', '1:473'])._dupShadow).toBe(true)
    // 真标题层不受影响
    expect(node(figma, ['1:449', '1:468', '1:470', '1:474', '1:475'])._dupShadow).toBeUndefined()
  })

  test('② 被覆盖隐藏层：不同文本、源序更早、重叠 ≥0.8 ⇒ 标记', () => {
    const figma = {
      document: {
        id: 'r',
        type: 'FRAME',
        children: [
          {
            id: 'g',
            type: 'GROUP',
            children: [
              { id: 'ghost', name: '旧标题', type: 'TEXT', characters: '旧标题占位', absoluteBoundingBox: { x: 10, y: 10, width: 90, height: 30 } },
              { id: 'real', name: '标题', type: 'TEXT', characters: '监测预警', absoluteBoundingBox: { x: 10, y: 12, width: 92, height: 30 } },
            ],
          },
        ],
      },
    }
    const stats = markDuplicateShadowTexts(figma)
    expect(stats.markedIds).toContain('ghost')
    expect(figma.document.children[0].children[0]._dupShadow).toBe(true)
    expect(figma.document.children[0].children[1]._dupShadow).toBeUndefined()
  })

  test('③ 阴性：正常并排文本（零重叠）零标记', () => {
    const figma = {
      document: {
        id: 'r',
        type: 'FRAME',
        children: [
          {
            id: 'tabs',
            type: 'FRAME',
            children: [
              { id: 'a', type: 'TEXT', characters: '全部', absoluteBoundingBox: { x: 0, y: 0, width: 63, height: 21 } },
              { id: 'b', type: 'TEXT', characters: '桥梁监测', absoluteBoundingBox: { x: 90, y: 0, width: 63, height: 21 } },
              { id: 'c', type: 'TEXT', characters: '边坡监测', absoluteBoundingBox: { x: 180, y: 0, width: 63, height: 21 } },
            ],
          },
        ],
      },
    }
    const stats = markDuplicateShadowTexts(figma)
    expect(stats.marked).toBe(0)
  })

  test('④ 阴性：低重叠（<0.8）不标记（允许轻微错位的设计层）', () => {
    const figma = {
      document: {
        id: 'r',
        type: 'FRAME',
        children: [
          {
            id: 'g',
            type: 'GROUP',
            children: [
              { id: 'a', type: 'TEXT', characters: '同一句', absoluteBoundingBox: { x: 0, y: 0, width: 80, height: 20 } },
              { id: 'b', type: 'TEXT', characters: '同一句', absoluteBoundingBox: { x: 0, y: 24, width: 80, height: 20 } },
            ],
          },
        ],
      },
    }
    expect(markDuplicateShadowTexts(figma).marked).toBe(0)
  })

  test('⑤ 幂等：重复调用零增量', () => {
    const figma = buildTitleStack()
    const first = markDuplicateShadowTexts(figma)
    const second = markDuplicateShadowTexts(figma)
    expect(first.marked).toBe(2) // 1:472 同位叠字 + 1:473 跨组覆盖
    expect(second.marked).toBe(0)
  })

  test('⑥ fail-open：空/非对象入参零计数不抛', () => {
    expect(markDuplicateShadowTexts(null).marked).toBe(0)
    expect(markDuplicateShadowTexts(undefined).marked).toBe(0)
    expect(markDuplicateShadowTexts({}).marked).toBe(0)
  })

  test('⑦ 邻域零回归：pickSectionTitle 行为不受本改动影响', () => {
    expect(pickSectionTitle({ header: { title: '战略合作厂商' } })).toBe('战略合作厂商')
    expect(pickSectionTitle({ header: { title: 'Frame 123' } })).toBe('')
  })
})

describe('三轮补 · 跨 GROUP 覆盖链（836f1e17：可见侧小标题仍漏标）', () => {
  /** 真机完整形态：标题组 > [小标题组(两条叠字), 白字组(真标题)]——小标题组整组被盖 */
  const buildFullStack = () => ({
    document: {
      id: '73:3',
      type: 'FRAME',
      children: [
        {
          id: '1:470',
          type: 'GROUP',
          children: [
            {
              id: '1:471',
              type: 'GROUP',
              children: [
                { id: '1:472', type: 'TEXT', characters: '小标题', absoluteBoundingBox: { x: 1811.72, y: 130.08, width: 82, height: 36 } },
                { id: '1:473', type: 'TEXT', characters: '小标题', absoluteBoundingBox: { x: 1811.72, y: 130.08, width: 82, height: 36 } },
              ],
            },
            {
              id: '1:474',
              name: '白字',
              type: 'GROUP',
              children: [
                { id: '1:475', name: '监测预警', type: 'TEXT', characters: '监测预警', absoluteBoundingBox: { x: 1810.12, y: 124.84, width: 96, height: 31 } },
              ],
            },
          ],
        },
      ],
    },
  })

  test('跨组：小标题组的两条（含可见侧 1:473）全标记、白字真标题不标', () => {
    const figma = buildFullStack()
    const stats = markDuplicateShadowTexts(figma)
    const g = figma.document.children[0]
    expect(stats.markedIds).toEqual(expect.arrayContaining(['1:472', '1:473']))
    expect(g.children[0].children[0]._dupShadow).toBe(true)  // 1:472 同位叠字底层
    expect(g.children[0].children[1]._dupShadow).toBe(true)  // 1:473 跨组被白字盖
    expect(g.children[1].children[0]._dupShadow).toBeUndefined() // 1:475 真标题
  })

  test('无辅助引用残留：__dupParent 不出现在真值树', () => {
    const figma = buildFullStack()
    markDuplicateShadowTexts(figma)
    expect(JSON.stringify(figma)).not.toContain('__dupParent')
  })
})
