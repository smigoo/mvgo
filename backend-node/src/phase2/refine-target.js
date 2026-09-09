/**
 * P4（增量补丁式更新 · 增量修改）：精修范围映射。
 *
 * ## 问题
 * `phase2.controller.ts` 的 `refineType` 有 `layout` / `style` / `both` 三种取值，
 * 但 `phase2.service.ts` 的 `executeRefine` **只用 refineType 决定「跑哪个 refiner」，
 * 没有把它传成 refiner 的 `_reviseTarget`**。
 *
 * 后果：两种 refiner 的默认值都是 `_reviseTarget = 'full'` →
 *   - 用户选「仅布局」→ LayoutRefiner 仍按 `全面精修` 跑（`layout-refiner.js:357`）
 *   - 用户选「仅样式」→ StyleRefiner 仍按 `全面精修` 跑（`style-refiner.js:72`）
 *
 * 于是 LLM 会「顺手」改动不属于本次精修类型的内容——改布局却动了样式、改样式却重排了
 * 结构。这正是用户反馈「为什么不是增量修改」的典型表现。**意图在传递途中被丢掉了**。
 *
 * ## 修复
 * 把 refineType 翻译成 refiner 认识的 `_reviseTarget`，显式传下去。
 *
 * ## 保守优先契约
 * 未知 / 缺失 / 非法值一律回退 `'full'`（最宽范围）。理由：**收窄过当会导致「该改的
 * 没改」**，这种错误比「多改了一点」更隐蔽、更难发现；宁可多改，不可漏改。
 */

/**
 * refineType → refiner 的 _reviseTarget。
 * key 必须与 `phase2.controller.ts:198` 的白名单 `['layout','style','both']` 严格一致。
 */
export const REFINE_TARGET_BY_TYPE = Object.freeze({
  layout: 'layout',
  style: 'stylistic',
  both: 'full',
});

/** 兜底值：最宽范围，绝不猜窄 */
export const DEFAULT_REFINE_TARGET = 'full';

/**
 * @param {string} [refineType] 来自 controller 的精修类型
 * @returns {'layout'|'stylistic'|'full'} refiner 的 _reviseTarget
 */
export function resolveRefineTarget(refineType) {
  if (typeof refineType !== 'string') return DEFAULT_REFINE_TARGET;
  const mapped = REFINE_TARGET_BY_TYPE[refineType];
  return typeof mapped === 'string' ? mapped : DEFAULT_REFINE_TARGET;
}
