/**
 * 🛡️ `:style` 绑定残留归一器（2026-11-12 · mc-1794463362140-8fa6d6f3 实锤，根治②）。
 *
 * 病灶形态（写盘产物实锤）：
 *   `<div style="display:flex;flex-direction:column" data-section-id="2:3446"
 *         :style="{ backgroundImage: 'url(' + bg4 + ')', ... };display:flex;flex-direction:row;align-items:center"
 *         class="...">`
 *   `:style` 的**对象字面量 `}` 之后、属性闭合引号之前**被拼了 CSS 声明残留
 *   （`;display:flex;...`）⇒ vue 编译器对表达式跑 babel 解析报
 *   `Error parsing JavaScript expression: Unexpected token, expected ","`
 *   ⇒ 前端「组件加载失败」。
 *
 * 来源定性：bg 挂载链在多轮注入/自愈间把目标标签**原有的静态 style 值**残留拼进了
 *   `:style` 引号内（对照组：同链注入、无静态 style 的标签完全正常）。
 *   注入路径分散（microcode-engineer 写盘出口多钩子），与其逐点堵，不如对**契约形态**
 *   做确定性归一：残留 CSS 声明归位到静态 `style` 属性（Vue 中静态 style 与 :style
 *   合并，两者本就可共存），`:style` 恢复纯对象。
 *
 * 误伤防护（判据从严）：
 *   - 仅当 `:style` 值为「平衡对象字面量 + 分号开头的 CSS 声明序列」才动；
 *   - `:style="cond ? { a } : null"`（合法三元）⇒ `}` 后是 ` : null`，不匹配 ⇒ 不动；
 *   - 静态 style 已有同属性由浏览器/Vue 后者覆盖语义兜底（与 LLM 原始重复声明一致）。
 *
 * 幂等：修复后 `:style` 为纯对象 ⇒ 再次调用零改动。
 */

/** 平衡扫描：从 `start`（指向 `{`）找到匹配 `}` 的下标；跳过字符串/模板字符串。 */
function findMatchingBrace(text, start) {
  let depth = 0;
  let inStr = null;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (ch === inStr && text[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 残留是否为「分号开头的 CSS 声明序列」（` ;k:v;k:v`），防误伤合法表达式尾巴。 */
function isCssDeclResidue(rest) {
  const s = String(rest || '').trim();
  if (!s.startsWith(';')) return false;
  const decls = s
    .slice(1)
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);
  if (decls.length === 0) return false;
  return decls.every((d) => /^[a-zA-Z-]+\s*:[^:]+$/.test(d));
}

/**
 * @param {string} source .vue 全文
 * @returns {{healed: boolean, content: string, fixes: string[]}}
 */
export function healStyleBindingResidue(source = '') {
  const text = String(source || '');
  if (!text.includes(':style="')) {
    return { healed: false, content: text, fixes: [] };
  }
  const fixes = [];
  // 开标签扫描：属性值内不会出现 `>` 之外还嵌套开标签的可能（模板属性引号内有 `>` 的
  // 形态极罕见，与 resource-mount-plan 的 tagRe 同口径容忍）。
  const tagRe = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let out = text;
  let m;
  while ((m = tagRe.exec(text)) !== null) {
    const tag = m[0];
    const styleIdx = tag.indexOf(':style="');
    if (styleIdx < 0) continue;
    const valStart = styleIdx + ':style="'.length;
    // :style 值以 `{` 开头才可能产生本病灶
    let objOpen = -1;
    for (let i = valStart; i < tag.length; i += 1) {
      if (tag[i] === '{') { objOpen = i; break; }
      if (!/\s/.test(tag[i])) break;
    }
    if (objOpen < 0) continue;
    const objClose = findMatchingBrace(tag, objOpen);
    if (objClose < 0) continue;
    const quoteEnd = tag.indexOf('"', objClose + 1);
    if (quoteEnd < 0) continue; // 无闭合引号（畸形他因），不碰
    const residue = tag.slice(objClose + 1, quoteEnd);
    if (!residue || !isCssDeclResidue(residue)) continue;

    // 归一：`:style` 截回纯对象；残留 CSS 声明并入静态 style
    const objText = tag.slice(objOpen, objClose + 1); // 纯 {...}
    const declsText = residue
      .trim()
      .replace(/^;+/, '')
      .replace(/;+$/, '');
    const objAttr = ':style="' + objText + '"';
    let newTag = tag.slice(0, styleIdx) + objAttr + tag.slice(quoteEnd + 1);
    const staticStyleRe = /\sstyle="([^"]*)"/;
    const sm = newTag.match(staticStyleRe);
    if (sm) {
      const prev = sm[1].trim().replace(/;+$/, '');
      newTag = newTag.replace(
        staticStyleRe,
        ` style="${prev ? prev + ';' : ''}${declsText}"`,
      );
    } else {
      newTag = newTag.replace(
        objAttr,
        `style="${declsText}" ${objAttr}`,
      );
    }
    out = out.split(tag).join(newTag);
    fixes.push(
      `:style 对象后 CSS 残留已归位静态 style（残留 ${declsText.length} 字符：${declsText.slice(0, 40)}…）`,
    );
  }
  return { healed: fixes.length > 0, content: out, fixes };
}

export default healStyleBindingResidue;
