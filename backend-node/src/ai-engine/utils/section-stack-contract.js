/**
 * 刀 52 —— 父容器「垂直堆叠」几何契约（section stack contract）
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━ 病灶 ━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 刀 50 把面板段的**段内**几何钉到真值后，段本身的高度仍然是 `flex:比例`：
 *
 *   `796:3`（slot-icon 容器）的子项 = 两张统计卡（同 y 并列）+ 三个厂商段（纵向）。
 *   plan 层把它们当 5 个平级子项，比例 = 76/76/161/212/265。
 *
 * 但 `796:3` 的真值是：
 *   统计行 76 / 间距 33 / 段1 161 / 间距 20 / 段2 212 / 间距 20 / 段3 265 = 787 = 容器高（剩余 0）
 *
 * 比例分配在数学上等价于「把容器**全部高度**按份额吃掉」，于是：
 *   · 统计行拿到 0.192 × 容器 ≈ 145（真值 76，**多 69px**）；
 *   · 三段拿到 179 / 227 / 278（真值 161 / 212 / 265，各 **+11%**）；
 *   · 段与段之间的 20px 间距**没有任何人表达**（三段紧贴）；
 *   · 最后一段 bottom = 1029.5 / 容器底 1030.3 —— **刚好顶满**，再多 1px 就被裁。
 *
 * 为什么刀 50 治不到这一层：`resolveIntrinsicLayout` 判据要求「子项逐项严格堆叠」，
 * 而两张统计卡**同 y 并列** ⇒ gap = −76 ⇒ 判 `overlap` ⇒ 整段 fail-open。
 * 并列不是重叠：顶边对齐即「同一个高度单元」。
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━ 为什么在写盘期、而不是生成期 ━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 生成期（`buildDeterministicIndexTemplate`）看到的是 **plan 树**：统计卡是 2 个平级子项，
 * 没有「行组」这个概念。而 DOM 里它们被刀 32（`healRowPeersWrap`）包进了
 * `<div data-rowpeers-wrap>` ⇒ **DOM 才是「一个高度单元 ↔ 一个 flex 子项」的真实结构**。
 * 所以本契约在 `file-writer#writeFiles`（唯一写盘出口）按 DOM 直接子元素算，
 * 行组包裹层与普通段**一视同仁**。
 *
 * 判据复用 `section-intrinsic-layout#resolveStackGeometry`（**单一实现**，与刀 50 同一份）：
 *   y 分桶（顶边 ±1px）/ 单元间严格堆叠且间距 ≥ 0 / 不溢出父高。
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━ 输入映射（纯结构，命名无关） ━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 容器：`data-section-id` → Figma 节点 bbox
 * 直接子元素：
 *   · 带 `data-section-id` ⇒ 该节点 bbox
 *   · 带 `data-rowpeers-wrap` ⇒ 其内部所有 `data-section-id` 后代 box 的**并集**
 *   · 两者都没有 ⇒ **整容器放弃**（`unmapped-child`，绝不猜）
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━ 输出形态 ━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 容器：`padding-top:Npx`（真值 0 不写，与刀 50 同约定）
 * 子项：`flex:0 1 <单元高>px;min-height:0;` + `margin-top:<间距>px`（第 1 项与 0 间距时剥掉）
 *   · `flex:0 1 <H>px` = basis 固定真值 + **不伸长**（剩余留底）+ **可压缩**（容器不足时不溢出）；
 *   · 只写**元素级内联**，绝不改 class 规则（`.c-component-container` 被三段共用）。
 *
 * 幂等：`declsSatisfied` 判定「已等于真值」⇒ 零改动。
 * fail-open：任何几何/结构不可解析 ⇒ 不改、不报错。
 *
 * @module utils/section-stack-contract
 */

import { indexFigmaNodes } from './section-tree.js';
import { resolveStackGeometry } from './section-intrinsic-layout.js';
import { scanElementStack, upsertInlineDecls, declsSatisfied } from './header-row-geometry.js';
import { stripDeclsFromInline } from './border-without-strokes.js';

const SECTION_ID_RE = /data-section-id\s*=\s*["']([^"']+)["']/i;
const ROWPEERS_RE = /data-rowpeers-wrap/i;
/** 需要整体重写的属性（先剥后写，避免半新半旧） */
const REPLACE_PROPS = new Set(['flex', 'min-height', 'margin-top']);

function boxOf(bb) {
  if (!bb || typeof bb !== 'object') return null;
  const x = Number(bb.x);
  const y = Number(bb.y);
  const w = Number(bb.width ?? bb.w);
  const h = Number(bb.height ?? bb.h);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  if (!(w > 0) || !(h > 0)) return null;
  return { x, y, w, h };
}

function unionOf(boxes) {
  const list = (Array.isArray(boxes) ? boxes : []).filter(Boolean);
  if (list.length === 0) return null;
  const x1 = Math.min(...list.map((b) => b.x));
  const y1 = Math.min(...list.map((b) => b.y));
  const x2 = Math.max(...list.map((b) => b.x + b.w));
  const y2 = Math.max(...list.map((b) => b.y + b.h));
  if (!(x2 > x1) || !(y2 > y1)) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** 元素（含全部后代）里所有 data-section-id → box 的并集 */
function subtreeUnion(el, childMap, idx) {
  const boxes = [];
  const visit = (node) => {
    const m = SECTION_ID_RE.exec(node.attrs || '');
    if (m) {
      const hit = idx.get(String(m[1]));
      const b = boxOf(hit?.bbox) || boxOf(hit?.rawNode?.absoluteBoundingBox);
      if (b) boxes.push(b);
    }
    for (const k of childMap.get(node) || []) visit(k);
  };
  visit(el);
  return unionOf(boxes);
}

function childBoxOf(el, childMap, idx) {
  const m = SECTION_ID_RE.exec(el.attrs || '');
  if (m) {
    const hit = idx.get(String(m[1]));
    return boxOf(hit?.bbox) || boxOf(hit?.rawNode?.absoluteBoundingBox);
  }
  if (ROWPEERS_RE.test(el.attrs || '')) return subtreeUnion(el, childMap, idx);
  return null;
}

/** 把属性写进标签（先按名剥旧，再追加；无 style 属性时 upsert 会新建） */
function rewriteTagDecls(tagText, decls) {
  const m = /(\sstyle\s*=\s*)("([^"]*)"|'([^']*)')/i.exec(tagText);
  if (!m) return upsertInlineDecls(tagText, decls);
  const quote = m[2][0];
  const kept = stripDeclsFromInline(m[3] ?? m[4] ?? '', (p) =>
    REPLACE_PROPS.has(String(p || '').toLowerCase()),
  );
  const added = decls.map((d) => `${d.prop}:${d.value}`).join(';');
  const next = kept ? `${kept};${added}` : added;
  return tagText.slice(0, m.index) + m[1] + quote + next + quote + tagText.slice(m.index + m[0].length);
}

function bump(stats, key) {
  stats.skipped[key] = (stats.skipped[key] || 0) + 1;
}

/**
 * 检测：哪些「垂直父容器」的子项高度/间距与 Figma 真值不符。
 *
 * @param {Record<string,string>} files 产物文件集（键 = 相对路径）
 * @param {{figmaRoot?:object, figmaIndex?:Map}} opts
 * @returns {{issues:Array, stats:object}}
 */
export function detectStackIssues(files, opts = {}) {
  const issues = [];
  const stats = { evaluated: 0, mapped: 0, matched: 0, skipped: {} };
  const root = opts?.figmaRoot?.document ?? opts?.figmaRoot;
  const idx =
    opts?.figmaIndex && typeof opts.figmaIndex.get === 'function' && opts.figmaIndex.size > 0
      ? opts.figmaIndex
      : indexFigmaNodes(root);
  if (idx.size === 0) {
    bump(stats, 'noFigma');
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

    const childMap = new Map();
    for (const e of events) {
      if (!e.parent) continue;
      if (!childMap.has(e.parent)) childMap.set(e.parent, []);
      childMap.get(e.parent).push(e);
    }

    for (const el of events) {
      const sidM = SECTION_ID_RE.exec(el.attrs || '');
      if (!sidM) continue;
      const kids = childMap.get(el) || [];
      if (kids.length < 2) continue;

      // 父容器必须是列方向（inline 声明，装配层自己写的），否则不属于本契约
      const styleM = /(?:^|\s)style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(el.attrs || '');
      const inline = styleM ? (styleM[2] ?? styleM[3] ?? '') : '';
      if (!/flex-direction\s*:\s*column/i.test(inline)) continue;

      const pbox = boxOf(idx.get(String(sidM[1]))?.bbox);
      if (!pbox) {
        bump(stats, 'container-box-unknown');
        continue;
      }

      const cboxes = kids.map((k) => childBoxOf(k, childMap, idx));
      if (cboxes.some((b) => !b)) {
        bump(stats, 'unmapped-child');
        continue;
      }
      stats.mapped += 1;

      const geo = resolveStackGeometry(pbox, cboxes);
      if (!geo.ok) {
        bump(stats, geo.reason || 'geometry-fail');
        continue;
      }
      stats.matched += 1;
      issues.push({ file, sectionId: String(sidM[1]), tplStart, container: el, kids, geo });
    }
  }
  return { issues, stats };
}

/** 自愈：把真值写进容器 padding 与直接子元素的内联 flex/margin */
export function healStackGeometry(files, issues) {
  const out = { ...files };
  const healed = [];
  const failed = [];

  // 同一文件内从后往前改，避免偏移量失效
  const byFile = new Map();
  for (const it of issues) {
    if (!byFile.has(it.file)) byFile.set(it.file, []);
    byFile.get(it.file).push(it);
  }

  for (const [file, list] of byFile) {
    let content = out[file];
    if (typeof content !== 'string') {
      failed.push({ file, reason: 'file-missing' });
      continue;
    }
    const edits = [];
    for (const it of list) {
      try {
        const { geo, container, kids, tplStart } = it;
        if (geo.paddingTop > 0) {
          const tagText = content.slice(tplStart + container.start, tplStart + container.end);
          const decls = [{ prop: 'padding-top', value: `${geo.paddingTop}px` }];
          if (!declsSatisfied(tagText, decls)) {
            edits.push({
              start: tplStart + container.start,
              end: tplStart + container.end,
              next: rewriteTagDecls(tagText, decls),
              role: 'container',
            });
          }
        }
        for (const u of geo.units) {
          for (const mi of u.members) {
            const el = kids[mi];
            if (!el) continue;
            const decls = [
              { prop: 'flex', value: `0 1 ${u.height}px` },
              { prop: 'min-height', value: '0' },
            ];
            if (u.gapBefore > 0) decls.push({ prop: 'margin-top', value: `${u.gapBefore}px` });
            const tagText = content.slice(tplStart + el.start, tplStart + el.end);
            if (declsSatisfied(tagText, decls)) continue;
            edits.push({
              start: tplStart + el.start,
              end: tplStart + el.end,
              next: rewriteTagDecls(tagText, decls),
              role: u.members.length > 1 ? 'row-unit' : 'child',
            });
          }
        }
        healed.push({
          file,
          sectionId: it.sectionId,
          paddingTop: geo.paddingTop,
          leftover: geo.leftover,
          units: geo.units.map((u) => [u.height, u.gapBefore, u.members.length]),
        });
      } catch (e) {
        failed.push({ file, sectionId: it.sectionId, reason: e?.message || String(e) });
      }
    }

    edits.sort((a, b) => b.start - a.start);
    for (const e of edits) content = content.slice(0, e.start) + e.next + content.slice(e.end);
    out[file] = content;
  }

  return { files: out, healed: healed.filter((h) => h), failed };
}

/** 便捷入口：检测 + 自愈（写盘出口调用） */
export function enforceStackGeometry(files, opts = {}) {
  const det = detectStackIssues(files, opts);
  if (det.issues.length === 0) return { files, changed: false, healed: [], stats: det.stats };
  const res = healStackGeometry(files, det.issues);
  const changed = Object.keys(files).some((f) => res.files[f] !== files[f]);
  return { files: res.files, changed, healed: res.healed, failed: res.failed, stats: det.stats };
}

export default enforceStackGeometry;
