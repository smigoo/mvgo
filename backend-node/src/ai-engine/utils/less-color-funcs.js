/**
 * 🛡️ 刀 15 / 16b（2026-09-13）：LESS **编译期颜色函数**与「可求值颜色」的单一事实源。
 *
 * 缺陷家族（两次事故同源）：
 *   ① 刀 15：`@colorPrimary` 被改写成 CSS **运行时** `var(--colorPrimary, #409EFF)`
 *      → `lighten(@colorPrimary, 30%)` 在 LESS **编译期**无法求值 → 报
 *      `Error evaluating function \`lighten\`: Argument cannot be evaluated to a color`
 *      → 整个 `<style>` 块编译失败 → P1-4 坏文件隔离降级 → **子组件整块消失**。
 *      三条注入路径：`file-writer#safeLessVarValue` / `less-variable-checker` 优先级 1 /
 *      `code-healer#healPresetLiteralDecls`。
 *   ② 刀 16b：**不是** var() 也一样致死 —— `safeLessVarValue` 的兜底 `unset`、
 *      以及名字分支给出的**非颜色**值（`0px` / `1.5` / `1`），被颜色函数当实参时同样
 *      `Argument cannot be evaluated to a color`。
 *
 * 核心认知：**`var()`（运行时）与 `lighten()`（编译期）根本冲突**；
 * 且「是不是颜色」**不能只看变量名** —— 名字分支会给 `@line-alpha` 猜出 `1`。
 * 因此判据必须是**消费端**：该变量是否出现在颜色函数的实参位置。
 *
 * 本模块是**唯一**实现，三个消费方共用（不各自造一套）：
 *   - `code-healer#healPresetLiteralDecls`（豁免被颜色函数引用的变量，不做 var 化）
 *   - `file-writer#safeLessVarValue`（合成兜底值时的颜色可求值保障）
 *   - `less-variable-checker`（扫描收集颜色函数实参变量 → 兜底给真颜色）
 *
 * 保守边界：纯函数、无 import.meta、无外部依赖，供 jest 直接加载。
 */

/**
 * LESS 编译期颜色函数 —— 实参必须是「可求值的颜色」（#hex / rgba() / 具名色）。
 * 传入 var() / unset / px / 无单位数值都会在编译期抛错。
 */
export const LESS_COLOR_FUNCS = [
  'lighten',
  'darken',
  'fade',
  'fadein',
  'fadeout',
  'saturate',
  'desaturate',
  'spin',
  'mix',
  'tint',
  'shade',
  'greyscale',
  'contrast',
];

/**
 * 颜色函数实参不可求值时的中立兜底色。
 * 必须是**真颜色**（可被颜色函数求值），且为中性灰 —— 避免把「猜不出的变量」
 * 渲染成刺眼的品牌色；真正修好应由主题变量提供真值。
 */
export const NEUTRAL_LESS_COLOR = '#333333';

/**
 * 颜色字面量判据。
 * ⚠️ 刻意**只认**我们合成器会产出的颜色形态（`#hex` / `rgb*()` / `hsl*()` / `hsv*()`）：
 * `unset` / `inherit` / `0px` / `1` / `var(--x)` 全部判为不可求值 ——
 * 若把「纯字母关键词」也放行，`unset` 会因 `/^[a-z]+$/` 被误判成颜色（写这条时的踩坑）。
 */
const COLOR_EVALUABLE_RX = /^(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|hsva?\()/;

/**
 * 该值能否被 LESS 颜色函数在**编译期**求值。
 * @param {string} value
 * @returns {boolean}
 */
export function isColorEvaluable(value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return false;
  if (/^var\(/i.test(v)) return false;
  return COLOR_EVALUABLE_RX.test(v);
}

/** 正则转义（变量名理论上只含 [\w-]，但防御性处理） */
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 该变量是否被 Less 颜色函数（作为实参）引用。
 * 只认「同一份样式文本内」的引用 —— 调用方负责把范围收敛到单个 `<style>` 块
 * 或 .less 全文；跨文件引用（theme-vars → 业务文件）由注入侧各自保障。
 * @param {string} content 样式文本
 * @param {string} varName 变量名（可带 @ 前缀）
 * @returns {boolean}
 */
export function isUsedByLessColorFn(content, varName) {
  const name = String(varName == null ? '' : varName).replace(/^@/, '');
  if (!name || typeof content !== 'string' || !content) return false;
  const re = new RegExp(
    `\\b(?:${LESS_COLOR_FUNCS.join('|')})\\s*\\([^)]*@${escapeRe(name)}\\b`,
    'i',
  );
  return re.test(content);
}

/**
 * 收集样式文本中**出现在颜色函数实参位置**的全部变量名。
 * 供「只有变量名、拿不到原始样式文本」的消费方（如 less-variable-checker 的
 * 目录扫描）预先算出集合，再按 `{ usedByColorFn }` 传给 `safeLessVarValue`。
 * @param {string} styleText
 * @returns {Set<string>} 不含 @ 的变量名
 */
export function collectColorFnVars(styleText) {
  const out = new Set();
  const text = typeof styleText === 'string' ? styleText : '';
  if (!text) return out;
  for (const fn of LESS_COLOR_FUNCS) {
    const re = new RegExp(`\\b${fn}\\s*\\(([^)]*)`, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
      for (const vm of m[1].matchAll(/@([a-zA-Z_][\w-]*)/g)) out.add(vm[1]);
    }
  }
  return out;
}

/**
 * 「该变量是否被颜色函数消费」的统一判据 —— 消费方可二选一提供事实：
 * 直接传 `styleText`（现场推断），或传预计算的 `usedByColorFn`（集合查表）。
 * @param {string} varName
 * @param {{styleText?: string, usedByColorFn?: boolean}} [ctx]
 * @returns {boolean}
 */
export function isColorFnConsumer(varName, ctx = {}) {
  if (ctx && ctx.usedByColorFn === true) return true;
  if (ctx && typeof ctx.styleText === 'string' && ctx.styleText) {
    return isUsedByLessColorFn(ctx.styleText, varName);
  }
  return false;
}
