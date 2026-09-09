/**
 * 🛡️ LLM 尾部垃圾剥离（统一工具，三层共用：解析层 / 清洗层 / 门禁层）
 *
 * 背景（三个同族实锤，2026-08-28）：
 *  - visual-parser.js：prompt 模板串内围栏未转义（自身代码 bug）
 *  - 任务快照 common.less：内存 files map 带 LLM 尾部围栏，快照冻结污染版
 *  - mc-max-1787920512973：分块输出「文件内容 + ``` 尾围栏 + 说明文字」，
 *    分隔符解析只认分隔符边界、不截断尾部说明段 → 26 行垃圾随文件落盘 →
 *    SFC 门禁把说明文字当 template 解析 → "Element is missing end tag" @174:12 →
 *    整轮重试（模型行为不变，注定再失败）→ 预算耗尽 → 任务失败。
 *
 * 结论：LLM 输出泄漏 Markdown 围栏/说明是系统性模式，必须在「文件内容提取」处
 * 做确定性截断——结构闭合点之后的非空白内容，对 .vue/.less/.css 恒非法。
 *
 * 规则（锚点 + 防误杀双校验）：
 *  1. 围栏锚点（主场景「围栏 + 说明」）：结构闭合点之后出现独立围栏行（行首 ```），
 *     且从围栏行到 EOF 的内容不含 `}`（防截到真代码）→ 从围栏行整体截断。
 *  2. 纯文本尾巴（次场景，无围栏）：闭合点后内容非空白、不含任何结构 token
 *     （`{` `}` `</`）、不像 SFC 顶层注释 → 截断。
 *
 * 恒安全依据：Vue SFC 规范 = 顶层块（<template>/<script>/<style>）闭合后只允许空白
 * 与 `<!-- -->` 注释；LESS/CSS = 最后一个 `}` 后只允许空白与块注释。
 */

/** SFC 顶层闭合标签行（</template> / </script> / </style>） */
const SFC_CLOSE_TAG_LINE_RE = /^[ \t]*<\/(?:template|script|style)>[ \t]*$/;

/** 独立 Markdown 围栏行（行首 ```，可带语言标注） */
const FENCE_LINE_RE = /^[ \t]*```[^\r\n]*$/;

/** 行内含 } 的行（用于定位 LESS/CSS 最后结构行） */
function lastLineWithBrace(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('}')) return i;
  }
  return -1;
}

function lastSfcCloseLine(lines) {
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (SFC_CLOSE_TAG_LINE_RE.test(lines[i])) last = i;
  }
  return last;
}

/** 尾部是否为合法的 SFC 顶层注释（<!-- ... --> 单段，无嵌套） */
function isBlankOrVueTopComment(tailText) {
  const t = String(tailText || '').trim();
  if (!t) return true;
  if (!t.startsWith('<!--') || !t.endsWith('-->')) return false;
  return !t.slice(4, -3).includes('<!--');
}

/** 尾部是否为合法的 LESS/CSS 块注释组合（/* ... *\/ 若干段） */
function isBlankOrCssBlockComment(tailText) {
  const t = String(tailText || '').trim();
  if (!t) return true;
  return /^(?:\/\*[\s\S]*?\*\/\s*)+$/.test(t);
}

/**
 * 行级结构判定（防误杀）：尾部是否含「真结构行」。
 * 说明文字里引用 `<style>`、`${...}` 字样是常态，字符级判定会误拦；
 * 只有整行是顶层开始/闭合标签、或含 `}` 的行（样式规则结束）才算真结构。
 */
function tailHasStructuralLine(tailLines, isVue) {
  const OPEN_TAG_LINE_RE = /^[ \t]*<(?:template|script|style)\b/;
  for (const line of tailLines) {
    if (SFC_CLOSE_TAG_LINE_RE.test(line)) return true;
    if (isVue && OPEN_TAG_LINE_RE.test(line)) return true;
    if (!isVue && line.includes('}')) return true;
  }
  return false;
}

/**
 * 🛡️ G2: 统计顶层 <template> 数量（depth tracking）。
 * 用于检测 LLM 重复输出的双 template 垃圾。
 * @param {string} content - SFC 内容
 * @returns {number} 顶层 template 数量
 */
function countTopLevelTemplates(content) {
  let count = 0;
  let depth = 0;
  // 匹配 <template 或 </template>，包括带属性的开标签
  const re = /<\/?template[\s>]/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    if (match[0].startsWith('</')) {
      // 闭合标签
      depth--;
      if (depth === 0) count++;
    } else {
      // 开标签
      depth++;
    }
  }
  return count;
}

/**
 * 🛡️ G2: 找到第一个顶层 <template> 的闭合位置（行号）。
 * 支持多行（<template> 和 </template> 各占一行）和单行（同行开闭）两种格式。
 * @param {string[]} lines - 按行分割的内容
 * @returns {number} 第一个顶层 </template> 所在行号，未找到返回 -1
 */
function findFirstTopLevelTemplateCloseLine(lines) {
  let depth = 0;
  let hasOpen = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opens = (line.match(/<template[\s>]/g) || []).length;
    const closes = (line.match(/<\/template>/g) || []).length;
    depth += opens - closes;
    if (opens > 0) hasOpen = true;
    if (hasOpen && depth <= 0) return i;
  }
  return -1;
}

/**
 * 剥离 LLM 尾部垃圾（围栏 + 说明文字）。
 * @param {string} filePath 文件相对路径（按扩展名分派）
 * @param {string} content 文件内容
 * @returns {{content: string, stripped: boolean, strippedLines: number, reason: string}}
 */
export function stripLlmTailGarbage(filePath, content) {
  const path = String(filePath || '');
  if (typeof content !== 'string' || !content) {
    return { content: content || '', stripped: false, strippedLines: 0, reason: '' };
  }
  // .json 由 robustJSONParse 兜底；.js 模板字符串可合法含围栏，不处理
  const isVue = /\.vue$/i.test(path);
  const isStyle = /\.(?:less|css)$/i.test(path);
  if (!isVue && !isStyle) {
    return { content, stripped: false, strippedLines: 0, reason: '' };
  }

  const lines = content.split('\n');

  // 🛡️ G2: 双 template 检测（优先级最高）
  // LLM 重复输出导致 SFC 出现多个顶层 <template> → 截断到第一个顶层 template 闭合
  if (isVue) {
    const templateCount = countTopLevelTemplates(content);
    if (templateCount > 1) {
      const firstCloseLine = findFirstTopLevelTemplateCloseLine(lines);
      if (firstCloseLine >= 0) {
        const kept = lines.slice(0, firstCloseLine + 1).join('\n') + '\n';
        return {
          content: kept,
          stripped: true,
          strippedLines: lines.length - (firstCloseLine + 1),
          reason: 'duplicate-template',
        };
      }
    }
  }

  const closeLine = isVue ? lastSfcCloseLine(lines) : lastLineWithBrace(lines);
  if (closeLine < 0 || closeLine >= lines.length - 1) {
    return { content, stripped: false, strippedLines: 0, reason: '' };
  }

  const tailLines = lines.slice(closeLine + 1);
  const tailText = tailLines.join('\n');

  // 合法尾部（空白 / 注释）→ 不动
  if (isVue ? isBlankOrVueTopComment(tailText) : isBlankOrCssBlockComment(tailText)) {
    return { content, stripped: false, strippedLines: 0, reason: '' };
  }

  // 主场景：尾部从围栏行开始（围栏 + 说明文字）。从首个围栏行截到 EOF。
  // 防误杀（行级）：截掉部分含顶层标签行 / 含 } 的行（真代码）→ 保守不动，交给门禁。
  let cutFrom = -1;
  for (let i = 0; i < tailLines.length; i++) {
    if (FENCE_LINE_RE.test(tailLines[i])) {
      cutFrom = i;
      break;
    }
  }
  if (cutFrom >= 0 && !tailHasStructuralLine(tailLines.slice(cutFrom), isVue)) {
    const kept = lines.slice(0, closeLine + 1).join('\n') + '\n';
    return {
      content: kept,
      stripped: true,
      strippedLines: lines.length - (closeLine + 1),
      reason: 'fence-tail',
    };
  }

  // 次场景：无围栏的纯说明尾巴（无任何结构行且非注释）→ 整体截断
  if (!tailHasStructuralLine(tailLines, isVue)) {
    const kept = lines.slice(0, closeLine + 1).join('\n') + '\n';
    return {
      content: kept,
      stripped: true,
      strippedLines: lines.length - (closeLine + 1),
      reason: 'text-tail',
    };
  }

  // 尾部含结构 token：可能是真内容（多 style 块等罕见场景），保守不动
  return { content, stripped: false, strippedLines: 0, reason: 'structural-tail' };
}

/**
 * 批量版本：对 files map 逐个剥离，返回新 map（不修改入参）。
 * @param {Record<string, string>} files
 * @param {(msg: string) => void} [log] 可选日志函数
 * @returns {{files: Record<string,string>, strippedFiles: Array<{path:string, lines:number, reason:string}>}}
 */
export function stripLlmTailGarbageFromFiles(files, log) {
  const out = { ...files };
  const strippedFiles = [];
  for (const [path, content] of Object.entries(files)) {
    try {
      const r = stripLlmTailGarbage(path, content);
      if (r.stripped) {
        out[path] = r.content;
        strippedFiles.push({ path, lines: r.strippedLines, reason: r.reason });
        log?.(`🧹 LLM 尾部垃圾剥离: ${path}（-${r.strippedLines} 行，${r.reason}）`);
      }
    } catch {
      /* 单文件剥离异常不影响其它文件 */
    }
  }
  return { files: out, strippedFiles };
}
