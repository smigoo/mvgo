/**
 * @file figma-effects.js — Figma `effects[]` → CSS 值（**单一来源**）。
 *
 * 为什么要抽出来：同一段「阴影/发光转 CSS」的判据原先只内联在 `section-tree.js` 的
 * prompt 构建闭包里（无法复用），刀 42 需要在下发真值的**同时**让自愈链也能读到同一份
 * 结果 —— 两份实现必然漂移（记忆铁律：同判据 ≥2 份 = 事故温床）。
 *
 * 语义（与 section-tree 原实现逐字一致）：
 *   · 只认类型含 `SHADOW` 的 effect（`DROP_SHADOW` / `INNER_SHADOW`），`visible:false` 跳过；
 *   · `INNER_SHADOW` → 加 `inset ` 前缀；
 *   · 偏移/模糊/扩散取整为 px；颜色 `rgba(r, g, b, a)`（figma 分量 0~1）；
 *   · 多条阴影按原顺序逗号拼接；无可用阴影返回 null（fail-open，绝不臆造）。
 */

const round255 = (v) => Math.round((Number(v) || 0) * 255);

/**
 * Figma color（{r,g,b,a} 分量 0~1）→ `rgba(...)`；无颜色返回 null。
 * @param {{r?:number,g?:number,b?:number,a?:number}} color
 * @param {number} [alphaFallback] 显式 alpha（缺 `color.a` 时用）
 */
export function figmaColorToCss(color, alphaFallback) {
  if (!color || typeof color !== 'object') return null;
  const rawA = typeof color.a === 'number' ? color.a : typeof alphaFallback === 'number' ? alphaFallback : 1;
  return `rgba(${round255(color.r)}, ${round255(color.g)}, ${round255(color.b)}, ${Number(rawA.toFixed(3))})`;
}

/**
 * Figma `effects` 数组 → `box-shadow` 值。
 * @param {Array} effects
 * @returns {string|null}
 */
export function effectsToBoxShadow(effects) {
  if (!Array.isArray(effects) || effects.length === 0) return null;
  const shadows = effects.filter(
    (e) => e && e.visible !== false && /SHADOW/.test(String(e.type || '')),
  );
  if (shadows.length === 0) return null;
  return shadows
    .map((e) => {
      const inset = String(e.type || '').toUpperCase() === 'INNER_SHADOW' ? 'inset ' : '';
      const c = figmaColorToCss(e.color, e.color?.a);
      if (!c) return null;
      const ox = Math.round(e.offset?.x || 0);
      const oy = Math.round(e.offset?.y || 0);
      const blur = Math.round(e.radius || 0);
      const spread = Math.round(e.spread || 0);
      return `${inset}${ox}px ${oy}px ${blur}px ${spread}px ${c}`;
    })
    .filter(Boolean)
    .join(', ') || null;
}

export default effectsToBoxShadow;
