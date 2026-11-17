/**
 * 🏢 宿主外壳（base-panel）内联背景剥离 —— M6-3a/3b 判据的**唯一实现**。
 *
 * 平台硬约束：组件内容是透明底，`<base-panel>` 及其**首子元素**禁止任何内联背景样式
 * （背景由平台统一管理，重复生成会导致双层背景/底色不透明）。
 *
 * 为什么单独成模块（2026-11-17 · ef014f7d 实锤）：
 *   该判据原先只在 `code-validator.js` 内部（`validateAndFixGeneratedFiles` 阶段）执行，
 *   而**背景注入 pass 在它之后仍可能给 base-panel 挂图**（ef014f7d 产物：
 *   `<base-panel :style="{ backgroundImage: 'url(' + bgctive414 + ')' ... }">`，把 tab
 *   激活态胶囊图 100%×100% 铺满整块面板）。落盘前自愈（pre-write-self-healing）也需要
 *   同一条判据做**终局兜底**；若两边各写一份正则，必然漂移 ⇒ 判据单一来源，故抽出本模块，
 *   两侧共同 import（code-validator 保留 re-export 兼容既有引用）。
 *
 * 覆盖两种形态：
 *   ① 静态 `style="background:...; background-image:..."` —— 剥 background 系列声明；
 *   ② 动态 `:style="{ backgroundImage: 'url(' + bg + ')', backgroundSize: '100% 100%' }"` ——
 *      剥 background* 键（驼峰/连字符均识别），对象清空则移除整个 :style 属性。
 *
 * fail-open：无法安全判定（如 `:style` 为三元表达式）时原样返回，不误伤。
 */

/**
 * 按分隔符切分，但忽略字符串字面量与括号/方括号/花括号内的分隔符。
 * 用于安全解析 :style 对象字面量（逗号）与 style 静态声明（分号）。
 */
export function splitTopLevel(s, sep) {
  const out = [];
  let depth = 0;
  let inStr = null;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      cur += ch;
      if (ch === inStr && s[i - 1] !== '\\') inStr = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      cur += ch;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      cur += ch;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      cur += ch;
    } else if (ch === sep && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * 剥离 `<base-panel>`（含首子元素）上的全部内联背景样式。
 *
 * @param {string} content package/index.vue 全文
 * @returns {string} 已剥离后的全文（无变化则引用相等）
 */
export function stripBasePanelInlineBackground(content) {
  if (typeof content !== 'string' || !content.includes('<base-panel')) return content;

  const stripInlineBg = (tag) => {
    if (!tag) return tag;
    // ① 静态 style="..."：剥 background 系列声明（含 background / background-color / background-image / background-size ...）
    let out = tag.replace(
      /style\s*=\s*(["'])([\s\S]*?)\1/gi,
      (m, q, body) => {
        const cleaned = splitTopLevel(body, ';')
          .map((p) => p.trim())
          .filter((p) => p && !/^background(-[a-z]+)?\s*:/i.test(p))
          .join('; ');
        const trimmed = cleaned.replace(/;\s*$/, '').trim();
        return trimmed ? `style=${q}${trimmed}${q}` : '';
      },
    );
    // ② 动态 :style / v-bind:style 对象字面量：剥 background* 键（驼峰/连字符均识别）
    // 锚点用 (^|[\s<]) 而非 \b：`:` 非单词字符，\b 在 `:` 前不成立；
    // 该前缀同时保证 `:style` 不会误匹配 `v-bind:style` 内部的 `:style`。
    out = out.replace(
      /(^|[\s<])(v-bind:style|:style)\s*=\s*(["'])\s*\{([\s\S]*?)\}\3/gi,
      (m, pre, attr, q, objBody) => {
        if (/[?]/.test(objBody)) return m; // 三元表达式，保守跳过，fail-open
        const kept = splitTopLevel(objBody, ',')
          .map((p) => p.trim())
          .filter((p) => p && !/^background[A-Za-z]*\s*:/i.test(p))
          .join(', ');
        return kept.trim() ? `${pre}${attr}=${q}{${kept}}${q}` : '';
      },
    );
    // 兜底：残留空属性移除
    out = out.replace(/\s+style\s*=\s*["']\s*["']/g, '');
    out = out.replace(/\s+(?::style|v-bind:style)\s*=\s*["']\s*\{\}\s*["']/g, '');
    return out;
  };

  let result = content.replace(/<base-panel\b[^>]*>/gi, (tag) => stripInlineBg(tag));
  // 首子元素（首个非空白子标签，与 M6-3b 判据同口径：open 内第一个 <...>）
  const firstChildMatch = result.match(/<base-panel\b[^>]*>\s*<([a-zA-Z][\w-]*)\b[^>]*>/i);
  if (firstChildMatch) {
    const childOpenTag = firstChildMatch[0].slice(firstChildMatch[0].lastIndexOf('<'));
    const strippedChild = stripInlineBg(childOpenTag);
    if (strippedChild !== childOpenTag) {
      result = result.replace(childOpenTag, strippedChild);
    }
  }
  // 🛡️ S3-BG（2026-11-15 · 0fde9c29 实锤）：承载 div 的背景 `:style` 被剥后，
  //   首子元素会退化成「只有 data-section-id + 尺寸」的空壳 div（孤儿方块）。
  //   只清 `<base-panel>` 紧跟的首子元素位置，且只认两种确定性承载形态：
  //     ① 新形态：class="mc-bg-carrier-*"，无子内容；
  //     ② 旧形态：static style 仅含 width/height px，无子内容。
  //   其余空 div（LLM 有意写的占位容器）一律不动。
  result = result.replace(
    /(<base-panel\b[^>]*>\s*)<div\b[^>]*class="mc-bg-carrier-[^"]*"[^>]*>\s*<\/div>/gi,
    '$1',
  );
  result = result.replace(
    /(<base-panel\b[^>]*>\s*)<div\b[^>]*data-section-id="[^"]+"[^>]*style="\s*width\s*:\s*\d+px\s*;\s*height\s*:\s*\d+px\s*;?\s*"[^>]*>\s*<\/div>/gi,
    '$1',
  );
  return result;
}
