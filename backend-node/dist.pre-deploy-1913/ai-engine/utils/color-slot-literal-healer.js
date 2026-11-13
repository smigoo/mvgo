/**
 * @file color-slot-literal-healer.js — 🛡️ JS/template 区主题槽位字面量残留兜底（确定性）。
 *
 * 病灶（2026-11-13 · mc-max-1794536353410-358a1476 实锤）：
 *   LLM 把 LESS 槽位写进 **echarts option（JS 字符串）**：`color: '@color-text-base'` ——
 *   LESS 变量在 JS 里是普通字符串，echarts 无法识别 ⇒ tooltip 文字色失效。
 *   prompt 已有禁令（chart-standards.md「禁止 LESS 变量泄漏进 JS formatter」）但无门禁拦。
 *
 * 兜底：写盘时把 .vue 的 script/template 区**引号包裹**的 `@color-* / @border-radius-* /
 *   @spacing-*` 字符串字面量替换为 theme-vars `.theme-light()` 槽位真值。
 *   - `<style>` 块整段占位保护（那里 @slot 是合法 less 引用，替换反而破坏主题槽位）；
 *   - 槽位表里查不到的槽名不动（不臆造）；
 *   - `:style`/JS 表达式里不带引号的裸 @slot 不碰（避免误伤 less 语义）。
 *
 * 已知不完美：JS 常量无法响应运行期主题切换（dark 下用 light 值）——
 * 但「非法值被 echarts 静默丢弃」比「固定合法值」更差；真正按主题响应须
 * getComputedStyle 读 CSS 变量，属生成层治理，不在本兜底范围。
 */

/**
 * @param {string} content .vue 文件全文
 * @param {Record<string,string>} lightSlots theme-vars `.theme-light()` 槽位表（parseThemeVarsMixins().light，键不带 @）
 * @returns {{ text: string, changes: Array<{from:string,to:string,slot:string}> }}
 */
export function healColorSlotLiteralsInVue(content, lightSlots) {
  if (!lightSlots || typeof lightSlots !== 'object') {
    return { text: String(content || ''), changes: [] };
  }
  const changes = [];
  // ① style 块占位保护（合法 less 区，不碰）
  const styleBlocks = [];
  let out = String(content || '').replace(
    /<style[^>]*>[\s\S]*?<\/style>/gi,
    (m) => {
      styleBlocks.push(m);
      return `\u0000SB${styleBlocks.length - 1}\u0000`;
    },
  );
  // ② 引号包裹的槽位字面量 → light 槽值
  out = out.replace(
    /(['"])@((?:color|border-radius|spacing)[a-zA-Z0-9_-]*)\1/g,
    (whole, q, slot) => {
      const val = lightSlots[slot];
      if (typeof val !== 'string' || val.length === 0) return whole;
      changes.push({ from: whole, to: `${q}${val}${q}`, slot });
      return `${q}${val}${q}`;
    },
  );
  // ③ 还原 style 块
  out = out.replace(/\u0000SB(\d+)\u0000/g, (_m, i) => styleBlocks[Number(i)] ?? '');
  return { text: out, changes };
}
