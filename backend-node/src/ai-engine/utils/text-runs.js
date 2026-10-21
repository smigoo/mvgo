/**
 * 🛡️ R19 · 文本 run 真值（2026-10-21 · c-bb8-304bb8d3 实锤）
 *
 * ── 事故（为什么要一个「run」模型）────────────────────────────────────────
 *
 * 「一行文字有多种样式」在设计侧只有两种表达：
 *   · **A 形态**：同一行由**两个独立 TEXT 节点**构成（`华为技术` + `8台`，
 *     chip 容器 `horizontal` + itemSpacing=4）。
 *   · **B 形态**：**单个 TEXT 节点内**用 `characterStyleOverrides` + `styleOverrideTable`
 *     按字符分段着色（`(2/484)` 的「2」红、「0」青、其余蓝）。
 *
 * 旧链路对两形态各写半套采集，结果都不是同一份真值：
 *   · `section-tree#collectSubtreeTexts` 只有 `fontSize/fontWeight`，**无 color**，
 *     且按文本去重（同行两个 `8台` 必丢一个）；
 *   · `repeated-section-collapser#enrichItemData` 只有 `styles.color`（条件 push 还会错位），
 *     **无字号/字重**；
 *   · `post-process#extractPerCharTextTruth` 只认 B 形态，A 形态完全不产。
 *   ⇒ prompt 把两者压成「`texts: a/b | colors: x/y`」两个平行数组靠 `/` 拼，
 *     无下标绑定契约；实测产物三套写法各自猜（语义推断补位 / 色塞进恒假的 `&--active` / 跨段串色）。
 *
 * ── 本模块（唯一事实源）──────────────────────────────────────────────────
 *
 * 把两形态归一为同一个 `Run`：
 *   `{ text, color, fontSize, fontWeight, nodeId }`
 *   · 颜色 `rgb(r,g,b)` / `rgba(r,g,b,a)`（与 P-11 `injectPerCharTextSegments` 既有格式一致，
 *     不让下游多一套格式分支）。
 *
 * 产出两张表：
 *   · `byNode: Map<textNodeId, Run[]>`   —— 每个 TEXT 节点自身的 run 序列（B 形态在此展开；
 *     A 形态的每个节点恒 1 run）。
 *   · `lines: Map<containerId, Line[]>`  —— 每个容器的「直接 TEXT 子级」按**行**聚类后的
 *     run 序列。`Line = { y, runs: Run[] }`。A 形态在此合并（跨节点按 x 排序）。
 *
 * 判据全部确定、可辩驳（**零图层名参与**，契约 09-30）：
 *   ① 只有 `type` 为 `TEXT` / `CHARACTER` 且 `characters` 非空者算文本承载；
 *   ② 分行按 y 中心差 ≤ `max(4, min(h1,h2) * 0.4)`（同一行不跨行）；
 *   ③ 行内相邻 run 的 x 区间重叠超过较窄者 50% ⇒ **不合并**（叠字不是"一行两段"，不臆造）；
 *   ④ 行内按 x 升序（视觉左右序）；
 *   ⑤ 无 bbox ⇒ 不产 line（不猜顺序）；单 run 行也产（便于下游统一按行取值）。
 *
 * ⚠️ 本模块**不做** `@` 技术栈截断：它只回答"文本自己长什么样"，
 *   容器级样式（fills/padding/effects）与 `@` 递归策略属 style-tree 的职责。
 *
 * ⚠️ 与 `utils/text-truth-guard.js#collectFigmaTextRuns` 的分工（**不是重复实现**）：
 *   · `collectFigmaTextRuns` → `Set<string>`：只有"有哪些文本"，服务 TEXT-COVERAGE 覆盖率；
 *   · 本模块 → `Run[]`：带 `color/fontSize/fontWeight` 与段边界，服务样式**落位**判据。
 *   两者输入同源（Figma 节点树）、输出维度不同，不得合并，也不得互相替代。
 */

/** Figma color → CSS 颜色串（与 P-11 既有格式一致）。 */
export function normalizeColor(c) {
  if (!c || typeof c !== 'object') return null;
  const r = Math.round((c.r || 0) * 255);
  const g = Math.round((c.g || 0) * 255);
  const b = Math.round((c.b || 0) * 255);
  const a = typeof c.a === 'number' ? c.a : 1;
  return a >= 0.999 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

/** 取节点首个可见 SOLID fill（text 节点顶层 `fills`，REST 契约）。 */
function solidFillColor(node) {
  const fills = Array.isArray(node?.fills) ? node.fills : [];
  const solid = fills.find(
    (f) => f && f.visible !== false && f.type === 'SOLID' && f.color,
  );
  return normalizeColor(solid?.color);
}

/** 节点 bbox（绝对坐标优先，回落相对 bbox）。 */
function nodeBox(node) {
  const b = node?.absoluteBoundingBox || node?.bbox || null;
  if (!b) return null;
  const x = Number(b.x);
  const y = Number(b.y);
  const w = Number(b.width ?? b.w);
  const h = Number(b.height ?? b.h);
  if (![x, y, w, h].every((v) => Number.isFinite(v))) return null;
  return { x, y, w, h };
}

function isTextNode(n) {
  const t = String(n?.type || '');
  return t === 'TEXT' || t === 'CHARACTER';
}

/**
 * 单节点 run 序列。
 * B 形态（有 per-char 覆盖）：逐字符求样式，相邻同样式合并成一段。
 * A 形态：整节点 1 段。默认样式缺失（无 fill）时 `color: null`——**不臆造**。
 */
export function runsOfTextNode(node) {
  if (!node || !isTextNode(node)) return [];
  const characters = typeof node.characters === 'string' ? node.characters : '';
  if (!characters) return [];

  const baseColor = solidFillColor(node);
  const baseSize = Number(node?.style?.fontSize) || null;
  const baseWeight = Number(node?.style?.fontWeight) || null;
  const nodeId = String(node.id ?? '');

  const ovs = Array.isArray(node.characterStyleOverrides)
    ? node.characterStyleOverrides
    : [];
  const table = node.styleOverrideTable && typeof node.styleOverrideTable === 'object'
    ? node.styleOverrideTable
    : null;

  // 无 per-char 覆盖（或覆盖表为空）⇒ 单段
  if (ovs.length === 0 || !table || Object.keys(table).length === 0) {
    return [{ text: characters, color: baseColor, fontSize: baseSize, fontWeight: baseWeight, nodeId }];
  }

  const chars = [...characters];
  const runs = [];
  let cur = null;
  for (let i = 0; i < chars.length; i += 1) {
    const key = String(ovs[i]);
    const ov = table[key];
    const ovFill = ov?.fills?.[0]?.color;
    const color = normalizeColor(ovFill) || baseColor;
    const fontSize = Number(ov?.fontSize) || baseSize;
    const fontWeight = Number(ov?.fontWeight) || baseWeight;
    const sig = `${color}|${fontSize}|${fontWeight}`;
    if (cur && cur.sig === sig) {
      cur.text += chars[i];
    } else {
      cur = { sig, text: chars[i], color, fontSize, fontWeight, nodeId };
      runs.push(cur);
    }
  }
  // 去掉内部 sig（对外契约只留 5 字段）
  return runs.map(({ sig, ...r }) => r);
}

/** 两 bbox 的 x 区间重叠是否过大（叠字，不能算"同一行两段"）。 */
function xOverlapTooMuch(a, b) {
  const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  if (overlap <= 0) return false;
  const narrow = Math.min(a.w, b.w);
  if (narrow <= 0) return false;
  return overlap / narrow > 0.5;
}

/**
 * 把一组「直接兄弟 TEXT 节点」按行聚类。
 * @param {Array<{node:Object, box:Object, runs:Array}>} members
 * @returns {Array<{y:number, runs:Array}>}
 */
export function clusterTextLines(members) {
  const list = (members || [])
    .filter((m) => m && m.box && Array.isArray(m.runs) && m.runs.length > 0)
    .map((m) => ({ ...m, cy: m.box.y + m.box.h / 2, cx: m.box.x }))
    .sort((a, b) => a.cy - b.cy || a.cx - b.cx);

  const lines = [];
  for (const m of list) {
    let line = null;
    for (const l of lines) {
      const tol = Math.max(4, Math.min(l.h, m.box.h) * 0.4);
      if (Math.abs(l.cy - m.cy) <= tol) {
        line = l;
        break;
      }
    }
    if (!line) {
      line = { cy: m.cy, h: m.box.h, members: [] };
      lines.push(line);
    }
    line.h = Math.min(line.h, m.box.h);
    line.members.push(m);
  }

  const out = [];
  for (const l of lines) {
    const members = [...l.members].sort((a, b) => a.cx - b.cx);
    // 叠字检测：任一相邻对 x 重叠过大 ⇒ 该行不成立（宁缺不臆造）
    let tainted = false;
    for (let i = 1; i < members.length; i += 1) {
      if (xOverlapTooMuch(members[i - 1].box, members[i].box)) {
        tainted = true;
        break;
      }
    }
    if (tainted) continue;
    out.push({
      y: Math.round(l.cy * 100) / 100,
      runs: members.flatMap((m) => m.runs),
    });
  }
  return out;
}

/**
 * 从 Figma 节点树提取文本 run 真值。
 *
 * @param {Object} figmaRoot 节点树本体，或 `{ document }` wrapper（两种输入契约都兼容；
 *   wrapper 顶层没有 `type`/`children`，直接遍历会得 0 条且无日志——历史踩过两次）。
 * @param {Object} [opts]
 * @param {number} [opts.maxDepth=60] 防御性深度上限
 * @returns {{byNode: Map<string, Array>, lines: Map<string, Array>, stats: Object}}
 */
export function extractTextRuns(figmaRoot, opts = {}) {
  const maxDepth = Number.isFinite(opts.maxDepth) ? opts.maxDepth : 60;
  const byNode = new Map();
  const lines = new Map();
  const stats = {
    textNodes: 0,
    multiRunNodes: 0,
    lineContainers: 0,
    multiRunLines: 0,
    crossNodeLines: 0,
  };

  const root = figmaRoot && typeof figmaRoot === 'object'
    ? (figmaRoot.document || figmaRoot)
    : null;
  if (!root) return { byNode, lines, stats };

  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > maxDepth) return;

    // ① 本节点自身（若为 TEXT）
    if (isTextNode(node)) {
      const runs = runsOfTextNode(node);
      if (runs.length > 0) {
        byNode.set(String(node.id ?? ''), runs);
        stats.textNodes += 1;
        if (runs.length > 1) stats.multiRunNodes += 1;
      }
    }

    // ② 以本节点为「行容器」：直接 TEXT 子级按行聚类
    const kids = Array.isArray(node.children) ? node.children : [];
    const textKids = [];
    for (const c of kids) {
      if (!isTextNode(c)) continue;
      const runs = byNode.get(String(c.id ?? '')) || runsOfTextNode(c);
      if (runs.length === 0) continue;
      const box = nodeBox(c);
      if (!box) continue;
      textKids.push({ node: c, box, runs });
    }
    if (textKids.length > 0) {
      const ls = clusterTextLines(textKids);
      if (ls.length > 0) {
        const id = String(node.id ?? '');
        lines.set(id, ls);
        stats.lineContainers += 1;
        for (const l of ls) {
          if (l.runs.length > 1) stats.multiRunLines += 1;
        }
        if (ls.some((l) => new Set(l.runs.map((r) => r.nodeId)).size > 1)) {
          stats.crossNodeLines += 1;
        }
      }
    }

    for (const c of kids) walk(c, depth + 1);
  };

  walk(root, 0);
  return { byNode, lines, stats };
}

/** 节点级便利取用：容器 → 全部行；TEXT → 单行包装。 */
export function linesForNode(textRuns, nodeId) {
  const id = String(nodeId ?? '');
  if (!id || !textRuns) return [];
  const ls = textRuns.lines?.get(id);
  if (Array.isArray(ls) && ls.length > 0) return ls;
  const runs = textRuns.byNode?.get(id);
  return Array.isArray(runs) && runs.length > 0 ? [{ y: null, runs }] : [];
}

/** run 序列是否真的「多种样式」（色/字号/字重任一不同）。 */
export function hasMixedRunStyles(runs) {
  if (!Array.isArray(runs) || runs.length < 2) return false;
  const sig = (r) => `${r.color}|${r.fontSize}|${r.fontWeight}`;
  const first = sig(runs[0]);
  return runs.some((r) => sig(r) !== first);
}

export default { extractTextRuns, linesForNode, hasMixedRunStyles, normalizeColor, runsOfTextNode, clusterTextLines };
