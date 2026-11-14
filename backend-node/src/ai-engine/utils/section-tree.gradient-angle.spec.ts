/**
 * 🛡️ P0-9（2026-11-14 · mc-max-1794651128303-1d3ccbb5 实锤）：渐变角度公式纠错。
 *
 * 病灶：旧实现 `atan2(dy, dx)` 把"自上而下"(dx=0,dy=1) 算成 **90deg**（CSS 里是向右）
 *   ⇒ 真机 `36:1694` 的竖向渐变在产物里写成 `linear-gradient(90deg, …)`，方向完全错；
 *   且与 `figma-connector#_gradientAngleDeg`（`atan2(dx,-dy)`）给出不同结果 = 双真值。
 *
 * 正解：CSS `0deg`=向上、顺时针 ⇒ `deg = atan2(dx, -dy)`，负值 +360 归一。
 */
import { gradientAngleDeg, fillsToCss } from './section-tree.js';

const grad = (h0: [number, number], h1: [number, number]) => ({
  type: 'GRADIENT_LINEAR',
  gradientHandlePositions: [
    { x: h0[0], y: h0[1] },
    { x: h1[0], y: h1[1] },
  ],
  gradientStops: [
    { color: { r: 0.83, g: 0.89, b: 1, a: 1 }, position: 0 },
    { color: { r: 0.76, g: 0.84, b: 1, a: 1 }, position: 1 },
  ],
});

describe('渐变角度（CSS 语义：0deg 向上、顺时针）', () => {
  it('自上而下 ⇒ 180（真机 36:1694 修复前是 90）', () => {
    expect(gradientAngleDeg(grad([0.5, 0], [0.5, 1]))).toBe(180);
  });

  it('自下而上 ⇒ 0', () => {
    expect(gradientAngleDeg(grad([0.5, 1], [0.5, 0]))).toBe(0);
  });

  it('从左到右 ⇒ 90', () => {
    expect(gradientAngleDeg(grad([0, 0.5], [1, 0.5]))).toBe(90);
  });

  it('从右到左 ⇒ 270（负角归一）', () => {
    expect(gradientAngleDeg(grad([1, 0.5], [0, 0.5]))).toBe(270);
  });

  it('右下 / 左下 ⇒ 135 / 225', () => {
    expect(gradientAngleDeg(grad([0, 0], [1, 1]))).toBe(135);
    expect(gradientAngleDeg(grad([1, 0], [0, 1]))).toBe(225);
  });

  it('缺 handle / 退化 ⇒ 默认 180（自上而下）', () => {
    expect(gradientAngleDeg({ type: 'GRADIENT_LINEAR' })).toBe(180);
    expect(gradientAngleDeg(grad([0.5, 0.5], [0.5, 0.5]))).toBe(180);
  });

  it('fillsToCss 组合：竖向渐变产出 180deg（与 container-absorbed-bg 同口径）', () => {
    const css = fillsToCss([grad([0.5, 0], [0.5, 1])]);
    expect(css).toMatch(/^linear-gradient\(180deg, /);
    expect(css).toContain('#d4e3ff 0%'); // alpha=1 时 cssRgba 走 hex
  });

  it('fillsToCss 组合：横向渐变产出 90deg', () => {
    const css = fillsToCss([grad([0, 0.5], [1, 0.5])]);
    expect(css).toMatch(/^linear-gradient\(90deg, /);
  });
});
