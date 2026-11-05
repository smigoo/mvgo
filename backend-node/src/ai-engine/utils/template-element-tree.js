/**
 * 🛡️ α3（2026-11-05 · `c-env-monitor-c324a730` 实锤）：模板元素树（配平扫描）——单一来源。
 *
 * 用途：资源挂载锚点补标（`resource-anchor-injector.js`）需要在产物模板里按
 * 「section 树父子结构 ↔ 模板 DOM 父子结构」对位定位内层元素。
 *
 * 🔴 为什么不用正则硬解（治理 Phase 2 反面教材）：quality-score-v1 的
 *   `extractActualResourceMounts` 用非贪婪正则切模板，在第一个内层闭合处截断，
 *   曾致 118/544 目录误判。本模块用**逐字符配平扫描**：跟踪引号（属性值里可含 `</div>`）、
 *   自闭合、HTML 注释、void 元素，杜绝同类事故。
 *
 * 纯函数、无 IO、无副作用；不依赖 import.meta，可单测。
 */

/** HTML void 元素（无闭合标签）；见 WHATWG HTML 规范 */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * 解析模板片段为元素树。
 * @param {string} html 模板片段（建议传 `extractSfcTemplateRegion` 的结果）
 * @returns {Array<{tag:string, attrs:string, children:Array, start:number, openEnd:number, end:number}>}
 *   - `attrs`：完整开标签原文（`<div class="x" :style="{...}">`），供属性检查
 *   - `start`/`openEnd`/`end`：开标签起点 / 开标签结束（`>` 后一位）/ 闭合标签结束（未闭合时 == openEnd）
 */
export function parseTemplateElementTree(html) {
  const root = {
    tag: '#root', attrs: '', children: [],
    start: 0, openEnd: html ? html.length : 0, end: html ? html.length : 0,
  };
  if (!html || typeof html !== 'string') return root.children;
  const stack = [root];
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    // ① 注释
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    // ② doctype / CDATA / 处理指令
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const gt = html.indexOf('>', lt);
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    // ③ 闭合标签
    if (html[lt + 1] === '/') {
      const gt = html.indexOf('>', lt);
      if (gt < 0) break;
      const name = html.slice(lt + 2, gt).trim().toLowerCase();
      // 就近回退到同名开标签（容忍浏览器级容错，但绝不下探到不匹配的层）
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].tag === name) {
          stack[s].end = gt + 1;
          stack.length = s;
          break;
        }
      }
      i = gt + 1;
      continue;
    }
    // ④ 开标签：引号感知扫描到 '>'
    let j = lt + 1;
    let inStr = null;
    while (j < n) {
      const ch = html[j];
      if (inStr) {
        if (ch === inStr) inStr = null;
      } else if (ch === '"' || ch === "'") {
        inStr = ch;
      } else if (ch === '>') {
        break;
      }
      j++;
    }
    if (j >= n) break;
    const raw = html.slice(lt, j + 1);
    const m = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(raw);
    if (!m) {
      i = lt + 1; // 不是标签（如文本中的 '<'），跳过
      continue;
    }
    const tag = m[1].toLowerCase();
    const selfClosed = /\/\s*>$/.test(raw);
    const node = {
      tag, attrs: raw, children: [],
      start: lt, openEnd: j + 1, end: j + 1,
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosed && !VOID_TAGS.has(tag)) stack.push(node);
    i = j + 1;
  }
  return root.children;
}

/**
 * 在元素树中找「开标签含 `attr="value"`」的第一个元素（深度优先）。
 * @returns {Object|null}
 */
export function findElementByAttr(nodes, attr, value) {
  if (!Array.isArray(nodes)) return null;
  const needle = `${attr}="${value}"`;
  for (const n of nodes) {
    if (typeof n?.attrs === 'string' && n.attrs.includes(needle)) return n;
    const hit = findElementByAttr(n.children, attr, value);
    if (hit) return hit;
  }
  return null;
}

/**
 * 读取元素的 class 词集（去连字符分段、小写、去复数；保留中文分段）。
 * 供「语义弱校验」比对 section 节点 name/role 词集。
 * @returns {Set<string>}
 */
export function classTokensOf(el) {
  const out = new Set();
  const attrs = typeof el?.attrs === 'string' ? el.attrs : '';
  const m =
    /\bclass\s*=\s*"([^"]*)"/.exec(attrs) ||
    /\bclass\s*=\s*'([^']*)'/.exec(attrs);
  if (!m) return out;
  for (const t of tokenizeWords(m[1])) out.add(t);
  return out;
}

/**
 * 词形归一分词：非 `[a-z0-9中文-]` 均为分隔符；拉丁段 ≥4 字符且以 s 结尾时去尾 s
 * （与 `resource-mounter.findTagByClassKeyword` 的 dePlural 同一口径，勿另造第二套）。
 * @returns {string[]}
 */
export function tokenizeWords(s) {
  const out = [];
  for (const raw of String(s || '').toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5-]+/)) {
    for (const seg of raw.split('-')) {
      if (!seg) continue;
      out.push(seg.length >= 4 && /s$/.test(seg) ? seg.slice(0, -1) : seg);
    }
  }
  return out;
}
