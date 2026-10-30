/**
 * 🛡️ 设计画布裁定 + 栅格倍率 单一来源判据（2026-10-30）
 *
 * 真实病灶：mc-lite-1793331286822-99dd9b08「产物所有尺寸 = 原组件一半」。
 * 本 spec 守两件事，缺一不可：
 *   A. **行为**：同一张 510×665 的 1x 截图必须裁出 510×665 画布（老实现给 255×333）；
 *      而 html 源、figma 源不得被误伤（阴性对照）。
 *   B. **结构**：画布口径与 prompt 倍率必须由同一 rasterScale 派生；
 *      lite.service 不得再出现「栅格 / 2」或「rasterWidth / logicalWidth」——
 *      后者的杀伤力在于画布错则倍率同步错，两处互相印证 ⇒ 永远发现不了。
 *
 * 判据取源码文本 + 纯函数双轨：纯函数断言行为，源码文本断言接线。
 * 每条源码断言都配阳性对照（把源码字符串变异后必须变红），保证判据本身有牙。
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_RASTER_SCALE,
  FIGMA_EXPORT_SCALE,
  isCanvasScaleConsistent,
  normalizeRasterScale,
  resolveDesignCanvas,
} from './utils/design-canvas'

const svcSrc = readFileSync(join(__dirname, 'lite.service.ts'), 'utf-8')

/** 截图链路「画布与倍率同源」的源码判据（正向断言 + 阳性对照共用） */
function assertCanvasSingleSource(text: string) {
  // ① 画布由 resolveDesignCanvas 一次裁定
  expect(text).toMatch(/resolveDesignCanvas\(\{/)
  // ② 导出倍率与默认倍率共用常量（防「注释说 1x、代码在 ÷2」再次裂开）
  expect(text).toMatch(/scale:\s*FIGMA_EXPORT_SCALE/)
  // ③ 不得再无条件折半
  expect(text).not.toMatch(/rasterWidth\s*\/\s*2/)
  expect(text).not.toMatch(/rasterHeight\s*\/\s*2/)
  // ④ 倍率不得由「栅格 / 逻辑画布」反推（病灶的传导路径）
  expect(text).not.toMatch(/rasterWidth\s*\/\s*logicalWidth/)
  // ⑤ 标定铁律必须按 rasterScale 分支（1:1 时不得再说「÷ N」）
  expect(text).toContain('1:1 栅格')
  expect(text).toMatch(/normalizeRasterScale\(/)
}

describe('设计画布裁定：倍率是显式输入，不是对栅格像素的猜测', () => {
  it('常量自洽：Figma 导出倍率与图源默认倍率都是 1（1x）', () => {
    expect(FIGMA_EXPORT_SCALE).toBe(1)
    expect(DEFAULT_RASTER_SCALE).toBe(1)
  })

  it('🔴 真实样本回归：510×665 的 1x 截图 → 画布 510×665（不再是 255×333）', () => {
    const canvas = resolveDesignCanvas({
      sourceType: 'screenshot',
      rasterWidth: 510,
      rasterHeight: 665,
    })
    expect(canvas).toEqual({
      width: 510,
      height: 665,
      rasterScale: 1,
      origin: 'raster-scale',
    })
  })

  it('阳性对照：同一张图显式声明 2x 时才折半（老行为可复现，说明判据不是恒真）', () => {
    const canvas = resolveDesignCanvas({
      sourceType: 'screenshot',
      rasterWidth: 510,
      rasterHeight: 665,
      rasterScale: 2,
    })
    expect(canvas.width).toBe(255)
    expect(canvas.height).toBe(333)
    expect(canvas.rasterScale).toBe(2)
  })

  it('显式 2x 的标准场景：1020×1330 Retina 截图 → 510×665', () => {
    const canvas = resolveDesignCanvas({
      sourceType: 'screenshot',
      rasterWidth: 1020,
      rasterHeight: 1330,
      rasterScale: 2,
    })
    expect(canvas.width).toBe(510)
    expect(canvas.height).toBe(665)
  })

  it('阴性对照：html 源恒 1:1，即使误传 rasterScale=2 也不得折半', () => {
    const canvas = resolveDesignCanvas({
      sourceType: 'html',
      rasterWidth: 1280,
      rasterHeight: 720,
      rasterScale: 2,
    })
    expect(canvas).toEqual({
      width: 1280,
      height: 720,
      rasterScale: 1,
      origin: 'html-raster',
    })
  })

  it('阴性对照：figma 源仍取权威逻辑尺寸（preview > node > 栅格/scale）', () => {
    const byPreview = resolveDesignCanvas({
      sourceType: 'figma',
      rasterWidth: 510,
      rasterHeight: 665,
      previewWidth: 510,
      previewHeight: 665,
      logicalWidth: 255,
      logicalHeight: 333,
    })
    expect(byPreview.origin).toBe('preview')
    expect([byPreview.width, byPreview.height]).toEqual([510, 665])

    const byNode = resolveDesignCanvas({
      sourceType: 'figma',
      rasterWidth: 510,
      rasterHeight: 665,
      logicalWidth: 510,
      logicalHeight: 665,
    })
    expect(byNode.origin).toBe('figma-node')
    expect([byNode.width, byNode.height]).toEqual([510, 665])

    const byRaster = resolveDesignCanvas({
      sourceType: 'figma',
      rasterWidth: 510,
      rasterHeight: 665,
      logicalWidth: 0,
      logicalHeight: 0,
    })
    expect(byRaster.origin).toBe('raster-scale')
    expect([byRaster.width, byRaster.height]).toEqual([510, 665])
    expect(byRaster.rasterScale).toBe(FIGMA_EXPORT_SCALE)
  })

  it('脏倍率字段不得让画布崩成 NaN/0（回退默认，非「猜」）', () => {
    for (const bad of [0, -1, NaN, Infinity, 'abc', null, undefined]) {
      expect(normalizeRasterScale(bad, DEFAULT_RASTER_SCALE)).toBe(1)
      const canvas = resolveDesignCanvas({
        sourceType: 'screenshot',
        rasterWidth: 510,
        rasterHeight: 665,
        rasterScale: bad as number,
      })
      expect(canvas.width).toBe(510)
      expect(canvas.height).toBe(665)
    }
  })
})

describe('画布与倍率自洽守卫（旧实现永远发现不了的那个缺口）', () => {
  it('截图 1:1 自洽', () => {
    const canvas = resolveDesignCanvas({
      sourceType: 'screenshot',
      rasterWidth: 510,
      rasterHeight: 665,
    })
    expect(isCanvasScaleConsistent(canvas, 510)).toBe(true)
  })

  it('栅格 1020 但画布 510 且声明 scale=1 → 自洽判定必须为 false（会被 logger.warn 抓住）', () => {
    const canvas = resolveDesignCanvas({
      sourceType: 'figma',
      rasterWidth: 1020,
      rasterHeight: 1330,
      previewWidth: 510,
      previewHeight: 665,
    })
    expect(isCanvasScaleConsistent(canvas, 1020)).toBe(false)
  })

  it('画布宽为 0 时视为不自洽（不得静默通过）', () => {
    expect(isCanvasScaleConsistent({ width: 0, rasterScale: 1 }, 510)).toBe(false)
  })
})

describe('接线判据：画布口径与 prompt 倍率单一来源', () => {
  it('lite.service.ts 满足全部 5 条源码判据', () => {
    assertCanvasSingleSource(svcSrc)
  })

  it('阳性对照：判据有牙 —— 把源码变异回病灶形态必须变红', () => {
    // ① 把「栅格 / 2」塞回去
    const halved = svcSrc.replace(
      'const width = canvas.width;',
      'const width = Math.round(rasterWidth / 2);',
    )
    expect(halved).not.toBe(svcSrc)
    expect(() => assertCanvasSingleSource(halved)).toThrow()

    // ② 把倍率反推塞回去
    const reDerived = svcSrc.replace(
      'const rasterScale = normalizeRasterScale(',
      'const rasterScale = Number((rasterWidth / logicalWidth).toFixed(1)) || normalizeRasterScale(',
    )
    expect(reDerived).not.toBe(svcSrc)
    expect(() => assertCanvasSingleSource(reDerived)).toThrow()

    // ③ 导出倍率改硬编码（与常量脱钩）
    const decoupled = svcSrc.replace(
      "scale: FIGMA_EXPORT_SCALE",
      "scale: 1",
    )
    expect(decoupled).not.toBe(svcSrc)
    expect(() => assertCanvasSingleSource(decoupled)).toThrow()
  })
})
