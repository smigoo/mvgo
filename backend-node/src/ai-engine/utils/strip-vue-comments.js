/**
 * 🛡️ 刀 8（2026-10-27 · TEXT-COVERAGE 假绿治本）：剥除 .vue SFC 源码中的全部注释。
 *
 * 事故实锤（mc-max-1793079162063-8bbcf027）：子组件 ContentSection.vue:8 的注释
 *   `// 设备编码区块：仅渲染本 section 真值文案 ROB004`
 * 含真值串「编码」（「设备编码区块」的子串），TEXT-COVERAGE 全文扫 CJK 时把它计入覆盖
 * ⇒ 「编码」明明没渲染却判已覆盖 = 假绿。
 *
 * 设计：
 *   · 按 SFC 块分别剥（块类型不同，注释语法不同）：
 *       <template>          → 仅 HTML 注释 <!-- ... -->
 *       <script>/<script setup> → JS 行注释 // + 块注释（状态机护住字符串/模板串）
 *       <style>             → 块注释 + less 行注释 //（护住 url(http://...) 未引号形态）
 *   · 判据单一来源：TEXT-COVERAGE（产物侧覆盖语料）与任何后续「扫产物有效文本」的守卫
 *     都必须经本函数，禁止各自再写一套剥注释正则。
 *   · 已知边界（刻意接受，生成产物里未出现）：正则字面量内含 `//`、嵌套模板串。
 */

/** JS/TS 源码剥注释（状态机：字符串 ' " ` 内的 // 与斜杠星 不剥） */
function stripJsComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let quote = null; // null | "'" | '"' | '`'
  while (i < n) {
    const ch = src[i];
    const next = i + 1 < n ? src[i + 1] : '';
    if (quote) {
      out += ch;
      if (ch === '\\' && i + 1 < n) {
        out += src[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      // 行注释 → 剥到行尾（保留换行，维持行号对齐）
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n'; // 保留换行
        i += 1;
      }
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** LESS/CSS 剥注释：块注释 + less 行注释；`://` 前是冒号（未引号 url）时不当行注释 */
function stripStyleComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let quote = null;
  while (i < n) {
    const ch = src[i];
    const next = i + 1 < n ? src[i + 1] : '';
    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      const prev = out.length > 0 ? out[out.length - 1] : '';
      if (prev === ':') {
        // url(http://...) 未引号形态 ⇒ 非注释
        out += ch;
        i += 1;
        continue;
      }
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** HTML 注释 */
function stripHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * 剥除 .vue SFC 全文注释（template/script/style 分块处理）。
 * 非 SFC 文本（找不到块标签）按 JS 处理，保证纯文本输入也能用。
 *
 * @param {string} content
 * @returns {string}
 */
export function stripVueComments(content) {
  if (typeof content !== 'string' || !content) return '';
  let out = '';
  // 依出现顺序逐块切分（一个 SFC 可有多个 style 块）
  const blockRe = /<(template|script|style)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let last = 0;
  let m;
  let sawBlock = false;
  while ((m = blockRe.exec(content))) {
    sawBlock = true;
    // 块间游离文本（罕见）按 JS 处理
    out += stripJsComments(content.slice(last, m.index));
    const tag = m[1].toLowerCase();
    const body = m[2];
    if (tag === 'template') out += stripHtmlComments(body);
    else if (tag === 'style') out += stripStyleComments(body);
    else out += stripJsComments(body);
    last = m.index + m[0].length;
  }
  out += stripJsComments(content.slice(last));
  if (!sawBlock) return stripJsComments(content);
  return out;
}
