/**
 * 🛡️ 刀 13b（2026-09-13）：LESS 嵌套选择器的**父选择器栈解析**（单一事实源）。
 *
 * 缺陷背景（事故 mc-1789308308127-356073d1，设备监测）：
 * 同一激活态在产物里有两种写法 ——
 *   ① 平铺：`.c-x-switch-item.is-active { … }` —— 行内自带基类，归一器/契约层都能处理；
 *   ② 嵌套：`.c-x-switch-item { … &.is-active { … } &:not(.is-active) { … } }`
 *      —— 行内只有 `&` + 别名，**看不见基类**。
 * 于是模板侧已被 R1 归一为 `c-x-switch-item--active`，而 `common.less` 的嵌套规则仍是
 * `&.is-active`：
 *   - 规则永不命中 → 用主题变量写的激活态样式成**死样式**（主题切换不跟随）；
 *   - 契约层报 `[C4] & .is-active`「样式修饰符规则无模板使用」。
 *
 * 本模块提供**唯一**的 `&` 解析实现，二个消费方共用（不各自造一套）：
 *   - `class-dialect-normalizer`（样式侧归一：`&.is-active` → `&--active`）
 *   - `classname-contract#extractModifierRules`（契约层：先把 `&` 还原成完整选择器再抽 token，
 *     否则归一后的 `&--active` 因「选择器里没有 `.` token」而**完全不可见** → 制造新盲区）
 *
 * 保守边界：
 *   - 只按「本行一个 `{`」的常见形态入栈；多开一行（`@media { .x {`）压**空占位**（未知父）；
 *   - 父选择器自身含 `&` 时向上递归解析（上限 4 层）；解析不出 → 存空串（消费方据此跳过）；
 *   - 纯函数、无 import.meta，供 jest 直接加载。
 */

/** `&` 向上递归解析的层数上限（防 `&` 自引用死循环） */
const AMP_RESOLVE_DEPTH = 4;

/**
 * 用父选择器栈解析选择器里的 `&`。
 * @param {string} selector 可能含 `&` 的选择器
 * @param {string[]} stack 已入栈的（已解析）父选择器栈，栈顶为最内层
 * @returns {string} 解析后的选择器；无法解析（父未知 / 仍残留 `&`）返回 ''
 */
function resolveAmp(selector, stack) {
  let sel = String(selector || '');
  for (let depth = 0; depth < AMP_RESOLVE_DEPTH && sel.includes('&'); depth += 1) {
    const parent = stack.length > 0 ? stack[stack.length - 1] : '';
    if (!parent) return '';
    sel = sel.replace(/&/g, parent);
  }
  return sel.includes('&') ? '' : sel;
}

/**
 * 逐行计算「该行所处的父选择器」（已解析 `&`）。
 *
 * @param {string} css 样式源全文（.less / .vue <style> 内容）
 * @returns {string[]} 与行数等长；`parents[i]` = 第 i 行的嵌套父选择器
 *          （顶层 / 无法确定时为空串）
 */
export function buildParentSelectorMap(css = '') {
  const lines = String(css).split('\n');
  const parents = new Array(lines.length).fill('');
  const stack = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    parents[i] = stack.length > 0 ? stack[stack.length - 1] : '';
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    if (opens > 0) {
      const selector = line.replace(/\{[\s\S]*$/, '').trim();
      if (opens === 1 && selector) {
        const resolved = selector.includes('&') ? resolveAmp(selector, stack) : selector;
        stack.push(resolved); // 解析不出 → 压空串（子级据此跳过，不臆造父基类）
      } else {
        stack.push('');
      }
    }
    for (let k = 0; k < closes; k += 1) stack.pop();
    if (stack.length < 0) stack.length = 0;
  }
  return parents;
}

/**
 * 把一行选择器展开为「完整选择器」（解析 `&`）。
 * @param {string} selector 行选择器文本（不含 `{`）
 * @param {string} parent 该行的父选择器（buildParentSelectorMap 产出）
 * @returns {string} 无 `&` 时原样返回；含 `&` 且父已知 → 展开；含 `&` 但父未知 → ''
 */
export function expandAmpSelector(selector, parent = '') {
  const sel = String(selector || '').trim();
  if (!sel.includes('&')) return sel;
  if (!parent) return '';
  return sel.replace(/&/g, parent);
}
