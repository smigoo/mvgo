/**
 * 🛡️ ECHARTS-SYMBOL（2026-11-17 · mc-max-1794911859161-cf8ca3f5 实锤）
 *
 * 病灶：LLM 自由写 echarts option 时臆造 `symbol: true`（布尔），视觉真值只有
 * `seriesTypes:["line","line"]`，无任何 symbol 指令。echarts 6.1.0 的 `createSymbol`
 * 对 symbol 调 `.indexOf()` ⇒ `TypeError: symbolType.indexOf is not a function`
 * ⇒ 预览 render-error ⇒ RUNTIME-004 硬 BLOCK ⇒ 整个 mc-max 任务失败。
 *
 * 判据（单一来源，确定性 + 幂等 + fail-open）：
 *   - 只处理 echarts option 里的 **series.symbol** 字段值为**布尔字面量**（true/false）。
 *   - true  → 'circle'（模型意图=显示标记点；circle 是 echarts 默认合法 symbol）
 *   - false → 'none'  （模型意图=隐藏标记点）
 *   - 其他值（字符串/数组/对象/表达式）一律原样放过——不臆断、不吞真错。
 *   - 只匹配 `symbol:` 后紧跟 true/false 的字面量；带引号的 `'true'` 不动（那是合法字符串）。
 *
 * 边界：不解析 AST（写盘出口是字符串流，AST 解析会引入新依赖且拖慢所有 .vue 写盘）；
 *   用有界正则 + 字段上下文约束（前面必须是 `symbol` 属性键），误伤面仅限该键。
 *
 * @param {string} code 源文件内容
 * @returns {{content:string, changed:boolean, replacements:Array<{from:string,to:string}>}}
 */
export function sanitizeEchartsSymbolLiterals(code) {
  const noop = { content: code, changed: false, replacements: [] };
  if (typeof code !== 'string' || code.length === 0) return noop;
  // 快速短路：无 `symbol:` 字面量直接返回（绝大多数 .vue 文件）
  if (!/\bsymbol\s*:/.test(code)) return noop;

  const replacements = [];
  // 匹配属性键 symbol + 布尔字面量；保留键值间空白与结尾分隔符。
  // 前置负向断言排除 `'symbol':` / `"symbol":`（那些是字符串键，同样归一，但需单独覆盖）。
  const BOOLEAN_SYMBOL_RE = /(\bsymbol\s*:\s*)(true|false)(\s*[,}\n])/g;
  const content = code.replace(BOOLEAN_SYMBOL_RE, (whole, prefix, literal, suffix) => {
    const normalized = literal === 'true' ? "'circle'" : "'none'";
    replacements.push({ from: literal, to: normalized });
    return `${prefix}${normalized}${suffix}`;
  });

  if (replacements.length === 0) return noop;
  return { content, changed: true, replacements };
}
