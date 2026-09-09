/**
 * 背景尺寸四件套推断测试（P2-1，2026-08-30）
 *
 * 覆盖 R11 修复：
 *   ① VECTOR 渐变全链路无 `scaleMode` 真值（src 下 grep 零命中），只能靠几何推断 size；
 *   ② `repeat` 仅按面积比 0.5 判断会把「激活态渐变条」误判为平铺纹理；
 *   ③ 无图（纯渐变/纯色）分支此前只写 `background:` 简写，四件套全丢。
 *
 * 基线数据来自组件一 mc-max-1788065970150-62e42150 的
 * `.mc-gen/resource-dom-mapping.json`（真实产物，非构造）。
 */
import { describe, it, expect } from '@jest/globals'
import {
  COVER_RATIO,
  REPEAT_AREA_RATIO,
  REPEAT_DIM_RATIO,
  boxIntersection,
  coverageRatio,
  backgroundBoxSize,
  isCoveringBackground,
  inferBackgroundSize,
  inferBackgroundRepeat,
  inferBackgroundPosition,
  inferBackgroundStyle,
} from '../background-size-inference.js'

const box = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
})

// ── 组件一真实数据 ────────────────────────────────────────────────
/** bg-7890：tabs 底，295×27，与父容器完全重合 */
const BG_7890 = {
  resourceName: 'bg',
  figmaBox: box(1495, 903, 295.00000118020694, 26.999999543419108),
  parentBox: box(1495, 903, 295, 27),
  visualMeta: { width: 295, height: 27, fillsSummary: 'linear-gradient(#b5deff 0%, #d1ecff 100%)' },
}
/** bg-tab-active-7891：激活态渐变条 78×21，位于 295×27 的 tabs-list 内偏移 (5,3) */
const BG_TAB_ACTIVE = {
  resourceName: 'bg-tab-active',
  figmaBox: box(1500, 906.000000405209, 78.0000009179389, 20.999999594791007),
  parentBox: box(1495, 903, 295, 27),
  visualMeta: { width: 78, height: 21, fillsSummary: 'linear-gradient(#1099b1 0%, #038fff 100%)' },
}
/** bg-7880：整块容器背景 420×186，与父容器完全重合（skipMount） */
const BG_7880 = {
  resourceName: 'bg',
  figmaBox: box(1475, 865, 420, 186),
  parentBox: box(1475, 865, 420, 186),
  visualMeta: { width: 420, height: 186, fillsSummary: '#edf4fbb2' },
}
/** bg num：14×14 红色圆点，铺满父容器 */
const BG_NUM = {
  resourceName: 'bg',
  figmaBox: box(1861, 898, 14, 14),
  parentBox: box(1861, 898, 14, 14),
  visualMeta: { width: 14, height: 14, fillsSummary: '#f53f3f' },
}

describe('boxIntersection', () => {
  it('完全重合时返回自身', () => {
    const r = boxIntersection(box(0, 0, 10, 10), box(0, 0, 10, 10))
    expect(r).toEqual({ x: 0, y: 0, width: 10, height: 10 })
  })

  it('部分重叠时返回交集', () => {
    const r = boxIntersection(box(0, 0, 10, 10), box(5, 5, 10, 10))
    expect(r).toEqual({ x: 5, y: 5, width: 5, height: 5 })
  })

  it('不相交返回 null', () => {
    expect(boxIntersection(box(0, 0, 10, 10), box(20, 20, 5, 5))).toBeNull()
  })

  it('任一侧尺寸非正返回 null（除零防护）', () => {
    expect(boxIntersection(box(0, 0, 0, 10), box(0, 0, 10, 10))).toBeNull()
    expect(boxIntersection(null as any, box(0, 0, 10, 10))).toBeNull()
  })
})

describe('coverageRatio', () => {
  it('完全重合为 1', () => {
    expect(coverageRatio(box(0, 0, 10, 10), box(0, 0, 10, 10))).toBe(1)
  })

  it('无 parentBox 返回 null', () => {
    expect(coverageRatio(box(0, 0, 10, 10), undefined)).toBeNull()
  })

  it('父容器面积为 0 返回 null（NaN 防护）', () => {
    expect(coverageRatio(box(0, 0, 10, 10), box(0, 0, 0, 0))).toBeNull()
  })

  it('完全不相交为 0', () => {
    expect(coverageRatio(box(100, 100, 10, 10), box(0, 0, 10, 10))).toBe(0)
  })

  it('组件一 bg-tab-active 覆盖率约 0.206', () => {
    const c = coverageRatio(BG_TAB_ACTIVE.figmaBox, BG_TAB_ACTIVE.parentBox)!
    expect(c).toBeCloseTo(1638 / 7965, 3)
  })
})

describe('backgroundBoxSize', () => {
  it('figmaBox 优先，取整', () => {
    expect(backgroundBoxSize(BG_7890)).toEqual({ width: 295, height: 27 })
  })

  it('无 figmaBox 时回落 visualMeta', () => {
    expect(backgroundBoxSize({ visualMeta: { width: 12.6, height: 3.2 } })).toEqual({
      width: 13,
      height: 3,
    })
  })

  it('都没有时为 0', () => {
    expect(backgroundBoxSize({})).toEqual({ width: 0, height: 0 })
  })
})

describe('isCoveringBackground', () => {
  it('组件一：铺满的三条 bg 全部判定为 cover', () => {
    expect(isCoveringBackground(BG_7890)).toBe(true)
    expect(isCoveringBackground(BG_7880)).toBe(true)
    expect(isCoveringBackground(BG_NUM)).toBe(true)
  })

  it('组件一：局部激活态背景不是 cover', () => {
    expect(isCoveringBackground(BG_TAB_ACTIVE)).toBe(false)
  })

  it('无 parentBox 时保守返回 false（不无依据放大背景）', () => {
    expect(isCoveringBackground({ figmaBox: box(0, 0, 10, 10) })).toBe(false)
  })
})

describe('inferBackgroundSize', () => {
  it('铺满 → 100% 100%（响应式，优于写死像素）', () => {
    const r = inferBackgroundSize(BG_7890)
    expect(r.size).toBe('100% 100%')
    expect(r.cover).toBe(true)
  })

  it('局部 → figmaBox 实际尺寸', () => {
    const r = inferBackgroundSize(BG_TAB_ACTIVE)
    expect(r.size).toBe('78px 21px')
    expect(r.cover).toBe(false)
  })

  it('无尺寸真值 → 兜底 100% 100%（与旧行为一致）', () => {
    expect(inferBackgroundSize({}).size).toBe('100% 100%')
  })

  it('有尺寸但无 parentBox → 保留写死像素（不臆断铺满）', () => {
    const r = inferBackgroundSize({ figmaBox: box(0, 0, 30, 40) })
    expect(r.size).toBe('30px 40px')
    expect(r.cover).toBe(false)
  })
})

describe('inferBackgroundRepeat', () => {
  it('★ 组件一 bg-tab-active：旧逻辑判 repeat（bug），新逻辑判 no-repeat', () => {
    // 旧判据：78*21=1638 < 7965*0.5=3982.5 → repeat ❌
    // 且即使把阈值收到 0.25：1638 < 1991.25 仍成立 → 依然 repeat ❌
    // 新判据叠加维度约束：fh/ph = 21/27 = 0.778 > 0.5 → no-repeat ✅
    expect(inferBackgroundRepeat(BG_TAB_ACTIVE)).toBe('no-repeat')
  })

  it('铺满的背景不 repeat', () => {
    expect(inferBackgroundRepeat(BG_7890)).toBe('no-repeat')
    expect(inferBackgroundRepeat(BG_7880)).toBe('no-repeat')
    expect(inferBackgroundRepeat(BG_NUM)).toBe('no-repeat')
  })

  it('两维都远小于父容器且面积够小 → repeat（真纹理）', () => {
    // 8×8 点阵铺在 400×300 容器内
    expect(
      inferBackgroundRepeat({ figmaBox: box(0, 0, 8, 8), parentBox: box(0, 0, 400, 300) }),
    ).toBe('repeat')
  })

  it('宽度是纹理但高度接近父容器 → no-repeat（竖条纹不应竖向平铺）', () => {
    // 2×40 竖线铺在 400×50 容器内：fw/pw=0.005 满足，fh/ph=0.8 不满足
    expect(
      inferBackgroundRepeat({ figmaBox: box(0, 0, 2, 40), parentBox: box(0, 0, 400, 50) }),
    ).toBe('no-repeat')
  })

  it('高度是纹理但宽度接近父容器 → no-repeat（横条不应横向平铺）', () => {
    expect(
      inferBackgroundRepeat({ figmaBox: box(0, 0, 390, 2), parentBox: box(0, 0, 400, 50) }),
    ).toBe('no-repeat')
  })

  it('面积比小于 0.25 但维度不满足 → no-repeat（面积阈值单独不够用）', () => {
    // 60×20 在 400×300 内：面积 1200 < 120000*0.25=30000 ✅，但 fh/ph=0.067<0.5 且 fw/pw=0.15<0.5
    // 两维都满足 → 这条实际会 repeat，改为构造「一维接近」的用例
    expect(
      inferBackgroundRepeat({ figmaBox: box(0, 0, 40, 280), parentBox: box(0, 0, 400, 300) }),
    ).toBe('no-repeat')
  })

  it('无 parentBox → no-repeat（无依据不平铺）', () => {
    expect(inferBackgroundRepeat({ figmaBox: box(0, 0, 8, 8) })).toBe('no-repeat')
  })

  it('父容器面积为 0 → no-repeat（NaN 防护）', () => {
    expect(
      inferBackgroundRepeat({ figmaBox: box(0, 0, 8, 8), parentBox: box(0, 0, 0, 0) }),
    ).toBe('no-repeat')
  })

  it('常量口径：面积阈值 0.5 → 0.25，维度阈值 0.5', () => {
    expect(REPEAT_AREA_RATIO).toBe(0.25)
    expect(REPEAT_DIM_RATIO).toBe(0.5)
    expect(COVER_RATIO).toBe(0.9)
  })
})

describe('inferBackgroundPosition', () => {
  it('按相对 parentBox 的偏移取整', () => {
    expect(inferBackgroundPosition(BG_TAB_ACTIVE)).toBe('5px 3px')
  })

  it('★ cover 时强制归零（size 已铺满，带偏移会露白边）', () => {
    expect(inferBackgroundPosition(BG_7890, true)).toBe('0px 0px')
    // 不传 cover 时仍按几何计算（此处本就是 0）
    expect(inferBackgroundPosition(BG_7890, false)).toBe('0px 0px')
  })

  it('偏移为负也如实反映', () => {
    expect(
      inferBackgroundPosition({
        figmaBox: box(10, 10, 20, 20),
        parentBox: box(30, 40, 100, 100),
      }),
    ).toBe('-20px -30px')
  })

  it('缺 parentBox → 0px 0px', () => {
    expect(inferBackgroundPosition({ figmaBox: box(10, 10, 20, 20) })).toBe('0px 0px')
  })
})

describe('inferBackgroundStyle（总入口）', () => {
  it('组件一 bg-7890：铺满 → 100% 100% / 0 0 / no-repeat', () => {
    expect(inferBackgroundStyle(BG_7890)).toMatchObject({
      size: '100% 100%',
      position: '0px 0px',
      repeat: 'no-repeat',
      cover: true,
    })
  })

  it('组件一 bg-tab-active：78px 21px / 5px 3px / no-repeat', () => {
    expect(inferBackgroundStyle(BG_TAB_ACTIVE)).toMatchObject({
      size: '78px 21px',
      position: '5px 3px',
      repeat: 'no-repeat',
      cover: false,
    })
  })

  it('组件一 bg-7880 / bg num：铺满 → 100% 100%', () => {
    expect(inferBackgroundStyle(BG_7880).size).toBe('100% 100%')
    expect(inferBackgroundStyle(BG_NUM).size).toBe('100% 100%')
  })

  it('返回 coverage 供调试与日志', () => {
    const r = inferBackgroundStyle(BG_TAB_ACTIVE)
    expect(r.coverage).toBeCloseTo(0.206, 2)
  })

  it('空 mapping 不抛异常', () => {
    expect(() => inferBackgroundStyle()).not.toThrow()
    expect(inferBackgroundStyle(null as any).size).toBe('100% 100%')
  })
})
