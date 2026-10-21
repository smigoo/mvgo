/**
 * 刀 42（2026-10-21）：`figma effects → box-shadow` **单一来源** spec。
 *
 * 抽出来的理由：同一段转换原先内联在 `section-tree.js` 的 prompt 闭包里，而刀 42 的自愈链
 * 也要读它 —— 两份实现必然漂移。语义必须与内联版本逐字一致（含 `inset ` 前缀与取整）。
 */
import { figmaColorToCss, effectsToBoxShadow } from '../figma-effects.js';

const INNER_GLOW_GOLD = {
  type: 'INNER_SHADOW',
  offset: { x: 0, y: 0 },
  radius: 16,
  spread: 0,
  color: { r: 1, g: 0.7843137254901961, b: 0, a: 1 },
};

const DROP_SHADOW = {
  type: 'DROP_SHADOW',
  offset: { x: 0, y: 4 },
  radius: 12,
  spread: 2,
  color: { r: 0, g: 0, b: 0, a: 0.24 },
};

describe('刀 42 figmaColorToCss', () => {
  it('0~1 分量 → 0~255 + alpha 三位小数', () => {
    expect(figmaColorToCss({ r: 1, g: 0.5, b: 0, a: 0.5 })).toBe('rgba(255, 128, 0, 0.5)');
  });

  it('缺 color.a 时用 fallback；都没有 ⇒ 1', () => {
    expect(figmaColorToCss({ r: 0, g: 0, b: 0 }, 0.2)).toBe('rgba(0, 0, 0, 0.2)');
    expect(figmaColorToCss({ r: 0, g: 0, b: 0 })).toBe('rgba(0, 0, 0, 1)');
  });

  it('阴性：无 color ⇒ null（不臆造黑）', () => {
    expect(figmaColorToCss(null)).toBe(null);
    expect(figmaColorToCss(undefined)).toBe(null);
  });
});

describe('刀 42 effectsToBoxShadow', () => {
  it('INNER_SHADOW ⇒ inset 前缀（三段面板的金/绿/青发光）', () => {
    expect(effectsToBoxShadow([INNER_GLOW_GOLD])).toBe('inset 0px 0px 16px 0px rgba(255, 200, 0, 1)');
  });

  it('DROP_SHADOW ⇒ 无 inset，偏移/扩散按 px 取整', () => {
    expect(effectsToBoxShadow([DROP_SHADOW])).toBe('0px 4px 12px 2px rgba(0, 0, 0, 0.24)');
  });

  it('多条阴影按原顺序逗号拼接', () => {
    expect(effectsToBoxShadow([INNER_GLOW_GOLD, DROP_SHADOW])).toBe(
      'inset 0px 0px 16px 0px rgba(255, 200, 0, 1), 0px 4px 12px 2px rgba(0, 0, 0, 0.24)',
    );
  });

  it('阴性：visible:false / 非 SHADOW 类型 / 空数组 / 非数组 ⇒ null（fail-open）', () => {
    expect(effectsToBoxShadow([{ ...INNER_GLOW_GOLD, visible: false }])).toBe(null);
    expect(effectsToBoxShadow([{ type: 'LAYER_BLUR', radius: 8 }])).toBe(null);
    expect(effectsToBoxShadow([])).toBe(null);
    expect(effectsToBoxShadow(null)).toBe(null);
  });

  it('阴性：缺 offset/radius/spread ⇒ 补 0 而不报错', () => {
    expect(effectsToBoxShadow([{ type: 'INNER_SHADOW', color: { r: 0, g: 0, b: 0, a: 1 } }])).toBe(
      'inset 0px 0px 0px 0px rgba(0, 0, 0, 1)',
    );
  });
});
