/**
 * 刀 51 —— 段内「标题行」几何契约（header row geometry）
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━ 病灶（④ 的剩余一半） ━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 刀 50 把面板段的 padding / 间距 / 子项高度都钉到了 Figma 真值后，三段第一次统一。
 * 但**段内标题行自身**仍各不相同，因为三个 header 组件是三套实现：
 *
 * | | HeaderText（战略） | HeaderText2（优质） | HeaderText3（普通） |
 * |---|---|---|---|
 * | 根 class | `.c-db2d65-header-text` | `.c-db2d65-header-block-quality` | `.c-db2d65-normal-header` |
 * | 结构 | 根 = img + span | 根 > `.header-title-row` > img + span | 根 = img + span |
 * | 自身 padding | `0 calc(@fontSize*0.6)` = **7.2px** | 同（且在根上） | 同 |
 * | icon↔标题 gap | `6px` | `calc(@fontSize*0.5)` = **7px** | 同 |
 * | 标题 line-height | 16px | `1.2` | `1.2` |
 *
 * 真值（三个面板**完全一致**）：`padding 0` / `gap 8px` / 行高 `16px`。
 * 于是标题被推到 x=49（真值 44），三段的图标与标题横向位置还差 1~2px。
 *
 * 根因：这是「**行内排布**」而不是「段间排布」—— 刀 50 只管段的 padding 与子项间距，
 * 段内部件（组件自身的根元素）怎么排没有任何人负责，LLM 各写一套。
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━ 判据（纯几何、命名无关、fail-open） ━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 真值来源**只有 Figma 树**，不需要 plan：
 *   ① 组件里恰有 **1 个** `<img>`，其 `:src` 绑定变量能通过资源映射反查到 `figmaNodeId`
 *   ② 该 icon 节点在 Figma 里存在且有 bbox
 *   ③ 同一父节点下「同一行」（`|Δy| ≤ 2px`）的兄弟 ≥ 2
 *   ④ 其中 `TEXT|CHARACTER` 节点**恰好 1 个**，且在 icon 右侧
 *   ⑤ `gap = text.x − (icon.x + icon.w)` ∈ [0, 48]
 *   ⑥ icon 是**方形**（`|w−h| ≤ 2`）
 *   ⑦ icon 是该行**最左**元素 ⇒ 行自身 `padding-left` 真值 0（行内不重复父容器已给的留白）
 *   ⑧ 行高 = `max(icon.h, text.h)` ⇒ 上下 padding 真值 0
 * 任一不满足 ⇒ 不判不改。
 *
 * 命中面天然收敛：真机 8 条资源里只有 `icon4/icon5/icon6`（三个面板标题图标）通过 ③④；
 * `icon1`（弹窗 header 箭头）/ `icon2`、`icon3`（统计卡 53×56 图标）的父节点同行没有 TEXT
 * ⇒ 自动 fail-open，不需要任何白名单。
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━ 输出形态 ━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 给「`<img>` 的直接父元素」写内联：`display:flex;flex-direction:row;align-items:center;
 * gap:Gpx;height:Hpx;padding:0`（同属性先剥后写，见 `border-without-strokes#stripDeclsFromInline`
 * 的通用谓词版，不另写一套）。
 * 若该父元素不是组件根元素（HeaderText2 形态），根元素再补 `padding:0`
 * —— 否则根上的 `0 7.2px` 仍然把整行右推 7.2px。
 *
 * 🔴 只写**内联**，绝不改 class 规则：`.c-db2d65-icon` 被 3 个元素共用（刀 49 的教训）。
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━ 挂载点 ━━━━━━━━━━━━━━━━━━━━━━━━━━
 * `file-writer.js#writeFiles`（**唯一写盘出口**）。不放 `pre-write-self-healing`：
 * 那之后还有 4 个会覆写/回退内容的步骤（CODE-020 类名前缀 / 根容器布局归一 /
 * 覆写后语义回退到 allFiles / absolute 遮罩层），刀 43 实测 pre-write 阶段零命中。
 *
 * @module utils/header-row-geometry
 */

import { indexFigmaNodes } from './section-tree.js';
import { stripDeclsFromInline } from './border-without-strokes.js';
import { parseInlineDecls } from './icon-slot-size-contract.js';

/** 同一行的判定容差（px） */
const ROW_EPS = 2;
/** gap 合理上界（超过即不是「图标+标题」紧排） */
const MAX_GAP = 48;
/** gap 允许为 0（紧贴），但不允许负值（重叠语义不明） */
const VOID_TAGS = new Set([
  'img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area',
  'base', 'col', 'embed', 'param', 'track', 'wbr',
]);

const TAG_RE =
  /<!--[\s\S]*?-->|<\/([A-Za-z][\w.:-]*)\s*>|<([A-Za-z][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function boxOf(bb) {
  if (!bb || typeof bb !== 'object') return null;
  const x = num(bb.x);
  const y = num(bb.y);
  const w = num(bb.width ?? bb.w);
  const h = num(bb.height ?? bb.h);
  if (x == null || y == null || w == null || h == null) return null;
  if (!(w > 0) || !(h > 0)) return null;
  return { x, y, w, h };
}

/**
 * 模板标签扫描（元素栈）。只做语法事实，不做业务裁决。
 * @returns {Array<{tag:string,name:string,attrs:string,start:number,end:number,
 *   closeStart:number|null,parent:object|null}>}
 */
export function scanElementStack(tpl) {
  const stack = [];
  const events = [];
  const src = String(tpl || '');
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(src))) {
    const closeName = m[1];
    const openName = m[2];
    if (!closeName && !openName) continue; // 注释，跳过
    if (closeName) {
      const name = closeName.toLowerCase();
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) {
          stack[i].closeStart = m.index;
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const name = openName.toLowerCase();
    const ev = {
      tag: openName,
      name,
      attrs: m[3] || '',
      start: m.index,
      end: m.index + m[0].length,
      closeStart: null,
      parent: stack.length > 0 ? stack[stack.length - 1] : null,
    };
    events.push(ev);
    if (!m[4] && !VOID_TAGS.has(name)) stack.push(ev);
  }
  return events;
}

/**
 * 标题行真值（唯一判据实现；检测与自愈共用）。
 *
 * @param {string} iconNodeId icon 的 Figma 节点 id（来自资源映射 `figmaNodeId`）
 * @param {Map} idx `indexFigmaNodes(figmaRoot)` 产物
 * @returns {{ok:boolean, reason?:string, gap?:number, rowHeight?:number,
 *   text?:string, iconBox?:object, textBox?:object}}
 */
export function resolveHeaderRowTruth(iconNodeId, idx) {
  if (!iconNodeId || !idx || typeof idx.get !== 'function') {
    return { ok: false, reason: 'no-index' };
  }
  const icon = idx.get(String(iconNodeId));
  const ib = boxOf(icon?.bbox);
  if (!ib) return { ok: false, reason: 'icon-bbox-unknown' };
  if (!icon.parentId) return { ok: false, reason: 'icon-no-parent' };

  const parentNode = idx.get(String(icon.parentId))?.rawNode;
  const sibs = (Array.isArray(parentNode?.children) ? parentNode.children : [])
    .map((c) => (c?.id != null ? idx.get(String(c.id)) : null))
    .filter(Boolean);
  if (sibs.length < 2) return { ok: false, reason: 'no-row-peers' };

  // 同一行 = 顶边对齐（**不是**竖向重叠：面板底色 Rect 与整段竖向重叠，会把「最左」判死）
  const rowPeers = [];
  for (const s of sibs) {
    const b = boxOf(s.bbox);
    if (!b) continue;
    if (Math.abs(b.y - ib.y) > ROW_EPS) continue;
    rowPeers.push({ entry: s, box: b });
  }
  if (rowPeers.length < 2) return { ok: false, reason: 'no-row-peers' };

  const texts = rowPeers.filter((p) => /^(TEXT|CHARACTER)$/i.test(String(p.entry.type)));
  if (texts.length !== 1) return { ok: false, reason: 'text-peer-not-unique' };
  const t = texts[0];

  if (t.box.x < ib.x + ib.w - 1) return { ok: false, reason: 'text-not-right-of-icon' };
  const gap = Math.round(t.box.x - (ib.x + ib.w));
  if (gap < 0 || gap > MAX_GAP) return { ok: false, reason: 'gap-out-of-range' };

  // icon 必须是方形（防止把 53×56 这类装饰图当成图标）
  if (Math.abs(ib.w - ib.h) > 2) return { ok: false, reason: 'icon-not-square' };

  // icon 必须是该行最左 ⇒ 行自身 padding-left 真值 0
  const leftmost = rowPeers.every((p) => p.box.x >= ib.x - 1);
  if (!leftmost) return { ok: false, reason: 'icon-not-leftmost' };

  const rowHeight = Math.round(Math.max(ib.h, t.box.h));
  return {
    ok: true,
    gap,
    rowHeight,
    text: String(t.entry.rawNode?.characters || '').trim(),
    iconBox: ib,
    textBox: t.box,
  };
}

/** 目标声明（行元素） */
function rowDecls(truth) {
  return [
    { prop: 'display', value: 'flex' },
    { prop: 'flex-direction', value: 'row' },
    { prop: 'align-items', value: 'center' },
    { prop: 'gap', value: `${truth.gap}px` },
    { prop: 'height', value: `${truth.rowHeight}px` },
    { prop: 'padding', value: '0' },
  ];
}

const ROOT_DECLS = [{ prop: 'padding', value: '0' }];

function samePx(a, b) {
  const na = num(String(a ?? '').replace(/px$/i, ''));
  const nb = num(String(b ?? '').replace(/px$/i, ''));
  if (na != null && nb != null) return Math.abs(na - nb) < 0.5;
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

/** 标签内联样式里这些声明是否**已等于**期望值（幂等判据） */
/** 标签内联样式里这些声明是否**已等于**期望值（幂等判据；刀 52 复用同一实现） */
export function declsSatisfied(tagText, decls) {
  const m = /(?:^|\s)style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tagText);
  const current = parseInlineDecls(m ? (m[2] ?? m[3] ?? '') : '');
  return decls.every((d) => {
    const cur = current[d.prop];
    if (cur == null) return false;
    return samePx(cur, d.value);
  });
}

/**
 * 把声明写进标签的 `style`：先按属性名剥旧（含 `padding` ↔ `padding-*` 互相覆盖），再追加。
 * 复刻 `stripDeclsFromInline`（刀 38 通用谓词版），不另写一套解析。
 */
export function upsertInlineDecls(tagText, decls) {
  const props = new Set(decls.map((d) => d.prop.toLowerCase()));
  const isConflict = (p) => {
    const k = String(p || '').toLowerCase();
    if (props.has(k)) return true;
    if (k === 'padding' || k.startsWith('padding-')) {
      return props.has('padding') || props.has(k);
    }
    return false;
  };
  const declText = decls.map((d) => `${d.prop}:${d.value}`).join(';');
  const styleMatch = /(\sstyle\s*=\s*)("([^"]*)"|'([^']*)')/i.exec(tagText);

  if (styleMatch) {
    const quote = styleMatch[2][0];
    const old = styleMatch[3] ?? styleMatch[4] ?? '';
    const kept = stripDeclsFromInline(old, isConflict);
    const next = kept ? `${kept};${declText}` : declText;
    const head = tagText.slice(0, styleMatch.index);
    const tail = tagText.slice(styleMatch.index + styleMatch[0].length);
    return `${head}${styleMatch[1]}${quote}${next}${quote}${tail}`;
  }

  const gt = tagText.lastIndexOf('>');
  if (gt < 0) return tagText;
  const selfClosing = /\/\s*>$/.test(tagText);
  const insertAt = selfClosing ? tagText.lastIndexOf('/', gt) : gt;
  const head = tagText.slice(0, insertAt).replace(/\s+$/, '');
  const tail = tagText.slice(insertAt);
  return `${head} style="${declText}"${tail}`;
}

function bump(stats, key) {
  stats.skipped[key] = (stats.skipped[key] || 0) + 1;
}

/**
 * 文件里是否存在 `default: '<文案>'`（props 默认值 === Figma 文案）。
 * 用于「模板用 `{{ text }}` 插值、无字面量」时的同源证据。
 */
export function hasPropDefault(content, text) {
  const needle = String(text ?? '').trim();
  if (!needle || typeof content !== 'string') return false;
  const re = /default\s*:\s*(['"])([\s\S]*?)\1/g;
  let m;
  while ((m = re.exec(content))) {
    if (String(m[2]).trim() === needle) return true;
  }
  return false;
}

/**
 * 检测：哪些组件文件的「标题行」几何与 Figma 真值不符。
 *
 * @param {Record<string,string>} files 产物文件集（键 = 相对路径）
 * @param {{figmaRoot?:object, resourceDomMapping?:Array}} opts
 * @returns {{issues:Array, stats:object}}
 */
export function detectHeaderRowIssues(files, opts = {}) {
  const issues = [];
  const stats = { evaluated: 0, singleImg: 0, mapped: 0, matched: 0, skipped: {} };
  const root = opts?.figmaRoot?.document ?? opts?.figmaRoot;
  // 调用方（writeFiles 逐文件循环）可复用同一份索引，避免 N 次全树 walk
  const idx =
    opts?.figmaIndex && typeof opts.figmaIndex.get === 'function' && opts.figmaIndex.size > 0
      ? opts.figmaIndex
      : indexFigmaNodes(root);
  if (idx.size === 0) {
    bump(stats, 'noFigma');
    return { issues, stats };
  }

  const varToNode = new Map();
  for (const e of Array.isArray(opts?.resourceDomMapping) ? opts.resourceDomMapping : []) {
    if (e?.assignedVarName && e?.figmaNodeId) {
      varToNode.set(String(e.assignedVarName), String(e.figmaNodeId));
    }
  }
  if (varToNode.size === 0) {
    bump(stats, 'noMapping');
    return { issues, stats };
  }

  for (const [file, content] of Object.entries(files || {})) {
    if (!file.endsWith('.vue') || typeof content !== 'string') continue;
    stats.evaluated += 1;

    const tplM = /<template\b[^>]*>([\s\S]*)<\/template>/i.exec(content);
    if (!tplM) {
      bump(stats, 'noTemplate');
      continue;
    }
    const tplBody = tplM[1];
    const tplStart = content.indexOf(tplBody, tplM.index);

    const events = scanElementStack(tplBody);
    const imgs = events.filter((e) => e.name === 'img');
    if (imgs.length !== 1) {
      bump(stats, 'imgNotSingle');
      continue;
    }
    stats.singleImg += 1;

    const img = imgs[0];
    // 🔴 不能用 `\b:src`：`:` 是非单词字符，前一字符是空格时 `\b` 边界**不成立**
    //    （2026-10-22 实测：整链静默判成 noBoundSrc，一个都不命中）
    const varM = /(?:^|\s):src\s*=\s*["']([A-Za-z_$][\w$]*)["']/.exec(img.attrs);
    if (!varM) {
      bump(stats, 'noBoundSrc');
      continue;
    }
    const nodeId = varToNode.get(varM[1]);
    if (!nodeId) {
      bump(stats, 'varUnmapped');
      continue;
    }
    stats.mapped += 1;

    const truth = resolveHeaderRowTruth(nodeId, idx);
    if (!truth.ok) {
      bump(stats, truth.reason || 'truth-fail');
      continue;
    }

    const row = img.parent;
    if (!row || /^[A-Z]/.test(String(row.tag))) {
      bump(stats, 'parentNotElement');
      continue;
    }
    const rowInner = tplBody.slice(row.end, row.closeStart ?? row.end);
    // 文案同源证据（2026-10-22 真机实锤）：标题行有两种写法 —— 字面量 `普通厂商`，
    //   或 `{{ text }}` 由 props 驱动。后者在模板里**没有字面量**，旧判据一律判
    //   `textNotInRow` ⇒ 三段里只有一段命中（真机 matched=1/3）。
    //   补证据链：模板出现插值 **且** 本文件 `props.default` 恰等于 Figma 文案 ⇒ 认定
    //   是同一行（可辩驳：default 不等、或模板无插值，都不放行）。
    const literalInRow = !!truth.text && rowInner.includes(truth.text);
    const interpolationInRow = !!truth.text && /\{\{[^}]*\}\}/.test(rowInner);
    if (!literalInRow && !(interpolationInRow && hasPropDefault(content, truth.text))) {
      bump(stats, 'textNotInRow');
      continue;
    }
    stats.matched += 1;

    const rowTag = tplBody.slice(row.start, row.end);
    const edits = [];
    if (!declsSatisfied(rowTag, rowDecls(truth))) {
      edits.push({
        start: tplStart + row.start,
        end: tplStart + row.end,
        tag: row.tag,
        role: 'row',
        decls: rowDecls(truth),
      });
    }
    // 根元素 ≠ 行元素 ⇒ 根上的 padding 也要清（HeaderText2 形态）
    const firstEl = events.find((e) => e.parent === null);
    if (firstEl && firstEl.start !== row.start) {
      const rootTag = tplBody.slice(firstEl.start, firstEl.end);
      if (!declsSatisfied(rootTag, ROOT_DECLS)) {
        edits.push({
          start: tplStart + firstEl.start,
          end: tplStart + firstEl.end,
          tag: firstEl.tag,
          role: 'root',
          decls: ROOT_DECLS,
        });
      }
    }

    if (edits.length > 0) {
      issues.push({ file, iconNodeId: nodeId, truth, edits });
    }
  }

  return { issues, stats };
}

/**
 * 自愈：把检测出的编辑应用到文件内容（自后向前替换，保持索引有效）。
 *
 * @returns {{files:object, healed:Array, failed:Array}}
 */
export function healHeaderRowGeometry(files, issues) {
  const out = { ...files };
  const healed = [];
  const failed = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    const src = out[issue.file];
    if (typeof src !== 'string') {
      failed.push({ file: issue.file, reason: 'file-missing' });
      continue;
    }
    let next = src;
    let ok = true;
    const edits = [...issue.edits].sort((a, b) => b.start - a.start);
    for (const e of edits) {
      const oldTag = next.slice(e.start, e.end);
      if (oldTag !== src.slice(e.start, e.end)) {
        ok = false;
        break;
      }
      next = next.slice(0, e.start) + upsertInlineDecls(oldTag, e.decls) + next.slice(e.end);
    }
    if (!ok || next === src) {
      failed.push({ file: issue.file, reason: 'edit-mismatch' });
      continue;
    }
    out[issue.file] = next;
    healed.push({
      file: issue.file,
      iconNodeId: issue.iconNodeId,
      gap: issue.truth.gap,
      rowHeight: issue.truth.rowHeight,
      edits: issue.edits.map((e) => e.role),
    });
  }
  return { files: out, healed, failed };
}

/** 便捷入口：检测 + 自愈 */
export function enforceHeaderRowGeometry(files, opts = {}) {
  const det = detectHeaderRowIssues(files, opts);
  if (det.issues.length === 0) {
    return { files, changed: false, healed: [], stats: det.stats };
  }
  const res = healHeaderRowGeometry(files, det.issues);
  return {
    files: res.files,
    changed: res.healed.length > 0,
    healed: res.healed,
    failed: res.failed,
    stats: det.stats,
  };
}

export default enforceHeaderRowGeometry;
