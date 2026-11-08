/**
 * 🧱 刀53 卡内文本列方向单测（2026-11-08 · mc-1794143134686-ad63598d 实锤）
 *
 * 病灶：网格卡模板固定 `display:flex`（默认 row）⇒「icon + 名称 + 数值」全横排。
 * 实测 117 宽卡内：名称 x=39→75、数值 x=81→138 ⇒ 右边界 138 超出卡宽被裁 21px。
 * 真值：`摄像机` rel=(39,13) 36×18 与 `(2/484)` rel=(39,35) 55×21
 *      —— **x 对齐、y 递增**（竖排两行），垂直间距 4px。
 *
 * 判据（几何、零命名）：≥2 run 且「各 run 起点 x 差 ≤ 2px」且「y 严格递增」⇒ column。
 */
import { cardTruth } from './folded-grid-section-takeover.js'

const CARD_LEFT = 1518
const CARD_TOP = 550

function text(id, chars, relX, relY, w, h, fontSize, color) {
  return {
    id,
    type: 'TEXT',
    characters: chars,
    absoluteBoundingBox: { x: CARD_LEFT + relX, y: CARD_TOP + relY, width: w, height: h },
    style: { fontSize, fontWeight: 400 },
    fills: [{ type: 'SOLID', visible: true, color }],
  }
}

function card(children) {
  return {
    id: '2:8438',
    name: 'Group 2136637321',
    type: 'GROUP',
    absoluteBoundingBox: { x: CARD_LEFT, y: CARD_TOP, width: 117, height: 64 },
    // 卡底色是 cardTruth 的硬前提（`!bg && !bgImage ⇒ null`），真机是渐变子层，此处用 SOLID 简化
    fills: [{ type: 'SOLID', visible: true, color: { r: 0.28, g: 0.65, b: 0.98, a: 1 } }],
    children,
  }
}

const DARK = { r: 0.2, g: 0.2, b: 0.2, a: 1 }
const WHITE = { r: 1, g: 1, b: 1, a: 1 }

describe('cardTruth 文本列方向', () => {
  test('真机形态：名称 (39,13) 与 数值 (39,35) 同 x 递增 y ⇒ column + 垂直 gap 4px', () => {
    const t = cardTruth(
      card([
        text('2:8442', '摄像机', 39, 13, 36, 18, 12, DARK),
        text('2:8443', '(2/484)', 39, 35, 55, 21, 16, WHITE),
      ]),
      null,
    )
    expect(t).not.toBeNull()
    expect(t.textDir).toBe('column')
    expect(t.stackGap).toBe(4)
    expect(t.runs).toHaveLength(2)
    // 颜色/字号仍按真值（阴性保护：不因新增方向判断改动既有字段）
    expect(t.runs[0]).toMatchObject({ text: '摄像机', fs: 12 })
    expect(t.runs[1]).toMatchObject({ text: '(2/484)', fs: 16 })
  })

  test('横排形态（y 相同、x 递增）⇒ row，且不产 stackGap', () => {
    const t = cardTruth(
      card([
        text('a', '标签', 10, 25, 30, 14, 12, DARK),
        text('b', '值', 50, 25, 20, 14, 12, WHITE),
      ]),
      null,
    )
    expect(t.textDir).toBe('row')
    expect(t.stackGap).toBeUndefined()
  })

  test('单文本 ⇒ row（无法判定方向时不猜）', () => {
    const t = cardTruth(card([text('only', '摄像机', 39, 24, 36, 18, 12, DARK)]), null)
    expect(t.textDir).toBe('row')
    expect(t.runs).toHaveLength(1)
  })

  test('x 未对齐（差 > 2px）⇒ row', () => {
    const t = cardTruth(
      card([
        text('a', '摄像机', 39, 13, 36, 18, 12, DARK),
        text('b', '(2/484)', 45, 35, 55, 21, 16, WHITE),
      ]),
      null,
    )
    expect(t.textDir).toBe('row')
  })
})
