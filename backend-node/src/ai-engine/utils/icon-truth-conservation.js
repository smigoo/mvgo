/**
 * 🛡️ 图标真值守恒（2026-11-15 · mc-max-1794710719020-d8887ee9 实锤）— 纯函数、零 IO。
 *
 * 病灶（同一产物三种形态）：
 *   ① `ContentForecast.vue` 标题行 `<span class="...-icon"></span>` 是**空占位**，
 *      Figma mapping 里该 section 明明有 `icon-3561.png` 静态资源真值，却没有 `<img>`；
 *      空 span 又占住 `justify-content:space-between` 的第一端 ⇒ 文字被推到右侧。
 *   ② `ContentVehicleDist.vue` 已有 `<img :src="icon2">`，旁边还留着
 *      `<div class="...-icon"><i class="...-outer"></i><i class="...-inner"></i></div>`
 *      一整套 CSS 画出来的假图标 ⇒ 用户看到「除了自己的 ICON 还有其它图形」。
 *   ③ `ContentBridge/Tunnel.vue` 标题行两个空 span，CSS 里用 border-radius/transform 画图形。
 *   根因链：刀 45 只在「零 img」时补 `<img>`，**从不清理 CSS 假图标**；M1 无来源背景剥除
 *   按「颜色值是否出现在全组件 fills 集合」判定 ⇒ 同色真值被误剥、变量型 `@color-primary`
 *   因 fail-open 豁免漏剥，两者都管不到「图标位该由静态资源独占」这件事。
 *
 * ── 判据（可辩驳；节点归属化，不按类名/图层名枚举硬判）─────────────────────
 *   真值侧（唯一来源）：`resourceDomMapping` 中按 `candidatesForSection` 归属到该组件
 *     section 的 icon 资源（角色判据复用刀 45 的 `isIconRole`/`usageIsImg`）。
 *   产物侧「假图标块」= 同时满足：
 *     Ⓐ 子树内**没有任何文本、`{{ }}`、img/svg/canvas、动态渲染指令**（纯图形绘制）；
 *     Ⓑ 该子树的 class 在**本产物样式表**（.vue <style> / common.less / index.css）里
 *        确有图形绘制声明（background/gradient/border-radius/transform/box-shadow/
 *        clip-path/filter），即「用 CSS 画了个图形」这一事实；
 *     Ⓒ 它不是父容器的唯一子元素（是同行的装饰槽，不是整块容器）；
 *     Ⓓ 命中块只取**最外层**（`<div><i/><i/></div>` 整块算一个，不重复计数）。
 *   ⇒ 类名只是「节点归属到样式表」的键，判据本身是 DOM 结构 + 样式事实，不认类名语义。
 *
 * ── 守恒动作（真值 1 个 icon ⇒ 产物恰好 1 份 `<img>`，不多不少）──────────────
 *   · 已有 `<img>` 引用该资源 ⇒ 删除**全部**假图标块（多余图形）；
 *   · 零 `<img>` 且有尺寸真值 ⇒ 首个假图标块替换为 `<img>`（尺寸取 figmaBox），其余删除；
 *   · 零 `<img>` 且尺寸真值缺失 ⇒ **不替换、不删除**（不编尺寸、不把唯一图标弄丢）。
 *   · 无 mapping 但产物自身已 import 图标资源且已渲染 ⇒ 仍可清多余假图形（Lite 象限）。
 *   · 真值缺失 / 样式表缺失 / 无 template ⇒ 一律 fail-open 原样返回。
 *
 * 幂等：替换后模板有 `<img>` 且假块已删 ⇒ 再跑零命中。不改共享 CSS 规则（避免
 *   `class 被多元素复用 ⇒ 改一处污染多处`），只增删 DOM 节点；遗留的无引用规则无害。
 *
 * 与 M1 的关系：本模块只收窄「图标槽」这一明确边界做节点归属，**不改 M1 全局背景判据**。
 *   M1 全量节点归属化属独立根治项，不在本轮范围（不得把本模块报成 M1 已根治）。
 */

import {
  templateRange,
  collectSectionIds,
  candidatesForSection,
  varNameOf,
  isDeclared,
  insertImport,
} from './resource-img-src-healer.js';
import { isIconRole, usageIsImg } from './missing-icon-render-healer.js';

/** 图形绘制声明：只认「真的画了东西」的属性，display/flex/width/height 不算。 */
const DRAW_DECL_RE =
  /(?:^|;)\s*(background(?:-color|-image)?|border-radius|transform|box-shadow|clip-path|filter)\s*:\s*([^;]*)/gi;
const DRAW_VALUE_EXEMPT = /^(?:transparent|none|inherit|initial|unset)$/i;
const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base']);
const RENDER_TAGS = new Set(['img', 'svg', 'canvas', 'video', 'picture']);

/* ── 真值侧 ─────────────────────────────────────────────────────────────── */

function sizeOf(mapping) {
  const b = mapping?.figmaBox;
  const w = Number(b?.width);
  const h = Number(b?.height);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
    ? { w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100 }
    : null;
}

/**
 * 按 section 归属抽图标真值（候选归属唯一实现 = candidatesForSection，角色判据复用刀 45）。
 *
 * 🛡️ P0-c（2026-11-15 · c60fbe6f 实锤）：真实 Figma 里图标的 `ownerSectionId` 常是**中间
 *   group**（`2:3571` / `2:3559` / `2:7625`），而产物输出的是上层 section
 *   （`2:3565` / `88:32` / `1744:127`）。此时 `candidatesForSection` 精确命中为空 ⇒
 *   `truthIcons=0` ⇒ 整个文件被 `no-icon-truth` 跳过（实测 9 个图形块只处理 1 个）。
 *   兜底判据（与 P0-a 同源、纯结构、不猜名字）：当传入**全量 section 集合**时，某 icon
 *   若其 `ancestorIds` 中「第一个属于该集合的 id」恰是本 section，则归属本 section。
 *   取「最近 section 祖先」而非「任意包含」——否则根 section 会把所有子孙图标都收走。
 *   未传 `allSectionIds` ⇒ 行为与旧版完全一致（零回归）。
 *
 * @param {Array} mappings
 * @param {string[]} sectionIds 本文件自身的 section id（`data-section-id`）
 * @param {Set<string>} [allSectionIds] 产物全量 section id（兜底用；不传则不兜底）
 * @returns {Array<{varName,resourceFile,fileName,size}>}
 */
export function collectIconTruth(mappings, sectionIds, allSectionIds) {
  const out = [];
  const seen = new Set();
  const sids = sectionIds.length > 0 ? sectionIds : [''];
  const hasAll = allSectionIds instanceof Set && allSectionIds.size > 0;
  const iconPool = hasAll
    ? (Array.isArray(mappings) ? mappings : []).filter(
        (m) => m?.resourceFile && isIconRole(m) && usageIsImg(m),
      )
    : [];
  for (const sid of sids) {
    let candidates = sid ? candidatesForSection(mappings, sid) : [];
    if (candidates.length === 0 && sid && hasAll) {
      // 最近 section 祖先 === 本 section 才兜底（不按名字、不按顺序猜测）
      candidates = iconPool.filter((m) => nearestSectionAncestor(m, allSectionIds) === String(sid));
    }
    for (const m of candidates) {
      if (!m?.resourceFile || !isIconRole(m) || !usageIsImg(m)) continue;
      const fileName = String(m.resourceFile).split('/').pop();
      const key = `${fileName}|${varNameOf(m) || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        varName: varNameOf(m) || '',
        resourceFile: m.resourceFile,
        fileName,
        size: sizeOf(m),
      });
    }
  }
  return out;
}

/** `ancestorIds`（最近父→根）中第一个落在全量 section 集合内的 id；无则 null。 */
export function nearestSectionAncestor(mapping, allSectionIds) {
  if (!(allSectionIds instanceof Set) || allSectionIds.size === 0) return null;
  const anc = Array.isArray(mapping?.ancestorIds) ? mapping.ancestorIds : [];
  for (const a of anc) {
    const id = String(a);
    if (allSectionIds.has(id)) return id;
  }
  return null;
}

/** 产物全量 section id 集合（跨文件；写盘出口循环外预建，供 collectIconTruth 兜底）。 */
export function collectAllSectionIds(files) {
  const out = new Set();
  if (!files || typeof files !== 'object') return out;
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !/\.vue$/.test(path)) continue;
    for (const id of collectSectionIds(content)) out.add(id);
  }
  return out;
}

/** 产物自身已声明/已渲染的图标资源（Lite 无 mapping 时的证据；不臆造新资源）。 */
export function collectDeclaredIconVars(code) {
  const declared = new Map();
  const rx = /import\s+([A-Za-z_$\u4e00-\u9fa5][\w$\u4e00-\u9fa5]*)\s+from\s+["']([^"']*resources\/images\/[^"']+)["']/g;
  let m;
  while ((m = rx.exec(String(code || ''))) !== null) {
    declared.set(m[1], m[2].split('/').pop());
  }
  return declared;
}

/** 模板里已被 `<img :src="X">` 真实渲染的资源变量名集合。 */
export function collectRenderedImgVars(templateBody) {
  const out = new Set();
  const rx = /<img\b[^>]*>/gi;
  let m;
  while ((m = rx.exec(String(templateBody || ''))) !== null) {
    const b = /(?::src|v-bind:src)\s*=\s*["']([^"']+)["']/i.exec(m[0]);
    if (b && /^[A-Za-z_$\u4e00-\u9fa5][\w$\u4e00-\u9fa5]*$/.test(b[1].trim())) {
      out.add(b[1].trim());
    }
  }
  return out;
}

/* ── 样式表事实（节点归属）──────────────────────────────────────────────── */

/**
 * 从全产物样式文件建「哪些 class 确实画了图形」索引。
 * 只做事实采集，不含阈值/裁决；复合选择器（.light .x / .x:hover）同样归属到 .x。
 */
export function buildDrawClassIndex(files) {
  const index = new Set();
  const take = (css) => {
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let r;
    while ((r = ruleRe.exec(String(css || ''))) !== null) {
      const body = r[2];
      let draws = /gradient\s*\(/i.test(body);
      if (!draws) {
        DRAW_DECL_RE.lastIndex = 0;
        let d;
        while ((d = DRAW_DECL_RE.exec(body)) !== null) {
          if (!DRAW_VALUE_EXEMPT.test(d[2].trim())) { draws = true; break; }
        }
      }
      if (!draws) continue;
      const clsRe = /\.(-?[_a-zA-Z]+[\w-]*)/g;
      let c;
      while ((c = clsRe.exec(r[1])) !== null) index.add(c[1]);
    }
  };
  for (const [p, content] of Object.entries(files || {})) {
    if (typeof content !== 'string') continue;
    if (/\.vue$/.test(p)) {
      const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
      let s;
      while ((s = styleRe.exec(content)) !== null) take(s[1]);
    } else if (/\.(less|css)$/.test(p)) {
      take(content);
    }
  }
  return index;
}

/* ── 模板结构（轻量标签栈，自包含、容错、不依赖 DOM 环境）───────────────── */

const TAG_RE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

function classesOf(attrs) {
  const m = /class\s*=\s*["']([^"']*)["']/i.exec(attrs || '');
  return m ? m[1].trim().split(/\s+/).filter(Boolean) : [];
}

function parseTemplateTree(body) {
  const roots = [];
  const stack = [];
  const rx = new RegExp(TAG_RE.source, 'g');
  let last = 0;
  let m;
  const addText = (text) => {
    if (!text) return;
    const parent = stack[stack.length - 1];
    if (!parent) return;
    if (text.trim()) parent.hasText = true;
    if (/\{\{/.test(text)) parent.hasRenderable = true;
  };
  while ((m = rx.exec(body)) !== null) {
    addText(body.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[2] === undefined) continue; // HTML 注释
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] || '';
    if (closing) {
      let idx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) { idx = i; break; }
      }
      if (idx === -1) continue;
      const node = stack[idx];
      node.closeStart = m.index;
      node.closeEnd = last;
      stack.length = idx;
      continue;
    }
    const selfClose = /\/\s*$/.test(attrs) || VOID_TAGS.has(tag);
    const parent = stack[stack.length - 1] || null;
    const node = {
      tag,
      attrs,
      classes: classesOf(attrs),
      parent,
      children: [],
      openStart: m.index,
      openEnd: last,
      closeStart: selfClose ? last : null,
      closeEnd: selfClose ? last : null,
      hasText: false,
      hasRenderable:
        RENDER_TAGS.has(tag) ||
        /\b(?:v-for|v-if|v-else-if|v-else|v-html|v-text|v-show)\b/.test(attrs) ||
        /\b(?::src|v-bind:src|src)\s*=/i.test(attrs),
    };
    if (parent) parent.children.push(node);
    else roots.push(node);
    if (!selfClose) stack.push(node);
  }
  addText(body.slice(last));
  return roots;
}

function subtreeHasContent(node) {
  if (node.hasText || node.hasRenderable) return true;
  return node.children.some(subtreeHasContent);
}

function subtreeClasses(node, acc = []) {
  acc.push(...node.classes);
  for (const c of node.children) subtreeClasses(c, acc);
  return acc;
}

function hasHitAncestor(node, set) {
  let p = node.parent;
  while (p) {
    if (set.has(p)) return true;
    p = p.parent;
  }
  return false;
}

/**
 * 找「CSS 假图标块」——只取最外层命中节点。
 * @returns {Array<{openStart,openEnd,closeStart,closeEnd,classes,tag}>}
 */
export function findGraphicIconBlocks(templateBody, drawIndex) {
  const roots = parseTemplateTree(String(templateBody || ''));
  const hits = [];
  const walk = (node) => {
    const ok =
      node.parent &&
      node.parent.children.length >= 2 &&
      !subtreeHasContent(node) &&
      subtreeClasses(node).some((c) => drawIndex.has(c));
    if (ok) hits.push(node);
    for (const c of node.children) walk(c);
  };
  for (const r of roots) walk(r);
  const hitSet = new Set(hits);
  return hits
    .filter((n) => !hasHitAncestor(n, hitSet))
    .filter((n) => n.closeEnd != null && n.closeEnd > n.openStart)
    .map((n) => ({
      openStart: n.openStart,
      openEnd: n.openEnd,
      closeStart: n.closeStart,
      closeEnd: n.closeEnd,
      classes: n.classes,
      tag: n.tag,
    }));
}

/* ── 主体 ───────────────────────────────────────────────────────────────── */

/** 恒打计数行的唯一格式来源（三处接线共用；0 也打，杜绝「没跑」与「零命中」不可分）。 */
export function formatIconTruthConservationLog(stats) {
  const s = stats || {};
  return {
    message:
      `iconTruthConservation:evaluated=${Number(s.evaluated) || 0},` +
      `files=${Number(s.files) || 0},truthIcons=${Number(s.truthIcons) || 0},` +
      `renderedImgs=${Number(s.renderedImgs) || 0},` +
      `graphicBlocks=${Number(s.graphicBlocks) || 0},` +
      `replaced=${Number(s.replaced) || 0},removed=${Number(s.removed) || 0},` +
      `verdict=${s.verdict || 'no-evidence'}`,
    meta: { skipped: (s.skipped || []).slice(0, 8) },
  };
}

export function mergeIconTruthStats(a, b) {
  if (!a) return { ...b, skipped: [...(b?.skipped || [])] };
  const out = { ...a };
  for (const k of ['evaluated', 'files', 'truthIcons', 'renderedImgs', 'graphicBlocks', 'replaced', 'removed']) {
    out[k] = (Number(a[k]) || 0) + (Number(b[k]) || 0);
  }
  out.verdict = out.replaced + out.removed > 0 ? 'healed' : a.verdict === 'healed' ? 'healed' : b.verdict;
  out.skipped = [...(a.skipped || []), ...(b.skipped || [])];
  return out;
}

function emptyStats(reason) {
  return {
    evaluated: 0,
    files: 0,
    truthIcons: 0,
    renderedImgs: 0,
    graphicBlocks: 0,
    replaced: 0,
    removed: 0,
    verdict: 'no-evidence',
    skipped: [reason],
  };
}

/**
 * 图标真值守恒自愈。入参 files 会被**原地修改**（与 pre-write 链其它刀一致）。
 * @param {Record<string,string>} files
 * @param {{mappings?:Array, relBaseOf?:(path:string)=>string, logger?:object,
 *           drawIndex?:Set<string>, silent?:boolean}} [opts]
 *   drawIndex 由调用方用**全量样式文件**预建后传入（写盘出口逐文件循环时，单文件对象
 *   里没有 common.less ⇒ 不传就会 fail-open 假绿）。silent=true 时不在模块内打日志，
 *   由调用方汇总后用 formatIconTruthConservationLog 恒打一行。
 * @returns {{files:object, stats:object, changes:Array}}
 */
export function healIconTruthConservation(files, opts = {}) {
  if (!files || typeof files !== 'object') return { files, stats: emptyStats('no-files'), changes: [] };
  const { mappings, relBaseOf, logger } = opts;
  // 🛡️ P0-c：全量 section 集合（写盘出口循环外预建）；不传则退化为旧判据（零回归）
  const allSectionIds =
    opts.allSectionIds instanceof Set && opts.allSectionIds.size > 0 ? opts.allSectionIds : null;
  const drawIndex = opts.drawIndex instanceof Set ? opts.drawIndex : buildDrawClassIndex(files);
  if (drawIndex.size === 0) return { files, stats: emptyStats('no-style-draw-facts'), changes: [] };

  const stats = {
    evaluated: 1,
    files: 0,
    truthIcons: 0,
    renderedImgs: 0,
    graphicBlocks: 0,
    replaced: 0,
    removed: 0,
    verdict: 'clean',
    skipped: [],
  };
  const changes = [];

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !/\.vue$/.test(path)) continue;
    const range = templateRange(content);
    if (!range) { stats.skipped.push(`${path}:no-template`); continue; }
    stats.files += 1;

    const sectionIds = collectSectionIds(content);
    const truth = collectIconTruth(mappings, sectionIds, allSectionIds);
    const declared = collectDeclaredIconVars(content);
    const rendered = collectRenderedImgVars(range.body);
    const truthVars = new Set(truth.map((t) => t.varName).filter(Boolean));
    for (const [v] of declared) if (rendered.has(v)) truthVars.add(v);

    const blocks = findGraphicIconBlocks(range.body, drawIndex);
    stats.truthIcons += truth.length;
    stats.renderedImgs += rendered.size;
    stats.graphicBlocks += blocks.length;
    if (blocks.length === 0) continue;

    // 真值缺失 ⇒ 一律不动（宁可留假图形，也不把唯一图标删掉）
    if (truthVars.size === 0 && truth.length === 0) {
      stats.skipped.push(`${path}:no-icon-truth`);
      continue;
    }

    const hasRenderedTruth = [...truthVars].some((v) => rendered.has(v));
    let replaceIdx = -1;
    let replaceTruth = null;
    if (!hasRenderedTruth) {
      const sized = truth.find((t) => t.varName && t.size);
      if (!sized) {
        stats.skipped.push(`${path}:no-size-truth`);
        continue;
      }
      replaceIdx = 0;
      replaceTruth = sized;
    }

    const edits = [];
    blocks.forEach((b, i) => {
      if (i === replaceIdx) {
        const { w, h } = replaceTruth.size;
        edits.push({
          start: range.start + b.openStart,
          end: range.start + b.closeEnd,
          text:
            `<img :src="${replaceTruth.varName}" ` +
            `style="width:${w}px;height:${h}px;object-fit:contain;flex:none;" alt="" />`,
          kind: 'replace',
        });
      } else {
        edits.push({
          start: range.start + b.openStart,
          end: range.start + b.closeEnd,
          text: '',
          kind: 'remove',
        });
      }
    });

    let next = content;
    for (let i = edits.length - 1; i >= 0; i--) {
      const e = edits[i];
      next = next.slice(0, e.start) + e.text + next.slice(e.end);
    }

    if (replaceTruth && !isDeclared(next, replaceTruth.varName)) {
      const base = typeof relBaseOf === 'function'
        ? relBaseOf(path)
        : /^package\/components\//.test(path)
          ? '../../resources/images/'
          : '../resources/images/';
      const rel = String(base).endsWith('/')
        ? `${base}${replaceTruth.fileName}`
        : `${base}/${replaceTruth.fileName}`;
      const withImport = insertImport(next, replaceTruth.varName, rel);
      if (withImport == null) {
        stats.skipped.push(`${path}:no-script-setup`);
        continue; // 未落盘，保持原内容
      }
      next = withImport;
    }

    if (next !== content) {
      files[path] = next;
      const fileReplaced = edits.filter((e) => e.kind === 'replace').length;
      const fileRemoved = edits.filter((e) => e.kind === 'remove').length;
      stats.replaced += fileReplaced;
      stats.removed += fileRemoved;
      changes.push({ file: path, replaced: fileReplaced, removed: fileRemoved, blocks: blocks.length });
    }
  }

  stats.verdict = stats.replaced + stats.removed > 0 ? 'healed' : 'clean';
  if (!opts.silent && logger) {
    const line = formatIconTruthConservationLog(stats);
    logger.info?.(line.message, line.meta);
  }
  return { files, stats, changes };
}
