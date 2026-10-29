/**
 * @file section-color-attribution-guard.js — 刀 32（2026-10-29 · 6eafb2f7 / 07ae49a2 实锤）
 *   **颜色归属律**：section 容器声明的背景色，必须来自「自身背景真值 ∪ 祖先链背景真值」；
 *   若某色**只存在于该容器的后代子树或兄弟子树** ⇒ 借用错挂（把局部色提为容器/整卡底）。
 *
 * 事故形态（两例同源）：
 *   ① `mc-max-1793258602028-6eafb2f7`：内容容器 `.c-aiot-dpjh-bsjd-con-con`
 *      （`data-section-id="565:3"`）写了 `background: @color-bg-card-active`
 *      （= rgba(166,206,255,1) = `#a6ceff`）——**那是第 1 张卡的高亮底色**
 *      （figma `48:5799`，470×72），而 565:3 自身与祖先 `48:5796` **都没有 fills**。
 *      结果整个内容区被染成卡级高亮蓝，与设计稿「仅首卡高亮」不符。
 *   ② `c-d79b-07ae49a2`：卡 2（`38:3282`）写了 `@color-border-yellow`
 *      （= rgba(226,208,132,.2)）——那是**兄弟面板「战略合作厂商」的底色**（刀 37 原始事故）。
 *
 * 判据（自锚定、命名无关、零硬编码色值）：
 *   对产物中每个带 `data-section-id="S"` 的元素：
 *     ① V = 元素声明的背景色（inline `background*` 优先，否则在产物样式表里按 class 反查 →
 *        解析 Less `@var` → 归一化为颜色键）。渐变 / `url()` / 未解析变量 / 关键词一律跳过。
 *     ② L(S) = 合法背景来源：
 *          · S 自身可见 SOLID fills；
 *          · 祖先链（含 S 自身）每个节点的可见 SOLID fills；
 *          · 祖先链每个节点的「背景层」= 直接子级里纯图形（VECTOR/RECTANGLE/ELLIPSE/…）
 *            且面积 ≥ 父 60% 的 SOLID fills（与 container-background-truth 同口径）。
 *        V ∈ L(S) ⇒ 合法，跳过。
 *     ③ D(S) = 后代子树「醒目色」集合（SOLID fills ∪ strokes，面积比 ≥ minAreaRatio，相对 root）；
 *        Sib(S) = 兄弟子树醒目色集合（父节点的其它子级）。
 *        V ∈ D(S) ⇒ `descendant`（借用后代色）；否则 V ∈ Sib(S) ⇒ `sibling`（借用兄弟色）。
 *     ④ V 既不在 L 也不在 D/Sib ⇒ **不报**：设计稿里压根没有这个色，属「臆造色」，
 *        由真值落地门禁 / do-not-invent 类守卫负责，本守卫不越界（单向、fail-open）。
 *
 * 判定为 **只报不改**（WARN）：主题变量引用的容器背景可能是「有意为之的主题化底色」，
 *   强行改写会丢主题能力（见 container-background-truth 的同类顾虑），故只立判据、不改产物。
 *
 * 与刀 31 互补：刀 31 让正确的色落到正确的槽位，刀 32 禁止色上错坟。
 * 纯函数、零 import.meta，可独立单测；与 truth-color-usage-guard（N1）同构复用 indexFigmaNodes /
 * normalizeCssColor / parseLessVars，判据单一来源。
 */

import { indexFigmaNodes, parseLessVars, collectClassBackgrounds } from './container-background-truth.js';
import { normalizeCssColor } from './truth-color-usage-guard.js';

const GRAPHIC_TYPES = new Set([
  'VECTOR',
  'RECTANGLE',
  'ELLIPSE',
  'BOOLEAN_OPERATION',
  'POLYGON',
  'STAR',
]);

/** 节点面积 */
function areaOf(node) {
  const b = node?.absoluteBoundingBox;
  const w = Number(b?.width);
  const h = Number(b?.height);
  return w > 0 && h > 0 ? w * h : 0;
}

/** figma SOLID fill → 归一化颜色键（与 normalizeCssColor 同口径：#rrggbb 或 #rrggbb@alpha） */
function fillKey(fill) {
  if (!fill || fill.visible === false || String(fill.type || '') !== 'SOLID') return null;
  const c = fill.color;
  if (!c || typeof c !== 'object') return null;
  const to255 = (v) => Math.max(0, Math.min(255, Math.round((Number(v) || 0) * 255)));
  const r = to255(c.r);
  const g = to255(c.g);
  const b = to255(c.b);
  const a = (typeof c.a === 'number' ? c.a : 1) * (typeof fill.opacity === 'number' ? fill.opacity : 1);
  if (!Number.isFinite(a)) return null;
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  return a >= 0.999 ? hex : `${hex}@${Number(a.toFixed(3))}`;
}

/** 节点自身可见 SOLID fill 色键 */
export function selfFillKeys(node) {
  const out = new Set();
  for (const f of node?.fills || []) {
    const k = fillKey(f);
    if (k) out.add(k);
  }
  return out;
}

/** 节点的「背景层」色键：直接子级纯图形、面积 ≥ 父 60% 的 SOLID fills */
export function backdropKeys(node) {
  const out = new Set();
  const a = areaOf(node);
  if (!a) return out;
  for (const ch of node?.children || []) {
    if (!GRAPHIC_TYPES.has(String(ch?.type || '').toUpperCase())) continue;
    const ca = areaOf(ch);
    if (!ca || ca / a < 0.6) continue;
    for (const k of selfFillKeys(ch)) out.add(k);
  }
  return out;
}

/** 子树醒目色键集合（面积比 ≥ minRatio，相对 rootArea；fills ∪ strokes） */
export function subtreeProminentKeys(node, rootArea, minRatio) {
  const out = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    const ratio = rootArea > 0 ? areaOf(n) / rootArea : 0;
    if (ratio >= minRatio) {
      for (const k of selfFillKeys(n)) out.add(k);
      for (const s of n.strokes || []) {
        const k = fillKey(s);
        if (k) out.add(k);
      }
    }
    for (const c of n.children || []) walk(c);
  };
  walk(node);
  return out;
}

/** SFC 里所有 style 块正文 */
function styleBodies(content) {
  return [...String(content || '').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
}

/** 元素开标签里的 class 列表 */
function classTokens(tagText) {
  const m = /\bclass="([^"]*)"/.exec(tagText || '');
  return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

/** 解析 Less `@var` 引用（浅层一次，解析不出返回原串） */
function resolveVars(value, lessVars) {
  return String(value || '').replace(/@([\w-]+)/g, (all, name) =>
    lessVars.has(name) ? lessVars.get(name) : all,
  );
}

/** 产物声明值里是否含渐变 / url / 关键词 / 未解析变量（这类不判归属） */
export function isUnjudgeable(value) {
  return /gradient|url\(|transparent|inherit|currentcolor|none|var\(|@/i.test(String(value || ''));
}

/** section id 归一（`565:3-list` → 也试 `565:3`） */
function lookupSection(index, sid) {
  const raw = String(sid || '');
  if (index.has(raw)) return index.get(raw);
  const base = raw.includes(':') ? raw.split('-')[0] : raw;
  if (index.has(base)) return index.get(base);
  return null;
}

/**
 * 刀 32 主体：审计 section 容器背景色的归属。
 *
 * @param {Record<string,string>} files 产物文件集（path → 内容）
 * @param {object} figmaRoot figma 根（兼容 {document:…} 与裸根）
 * @param {{minAreaRatio?:number}} [options]
 * @returns {{skipped:boolean, reason?:string, findings:Array, stats:{sections:number,judged:number}}}
 */
export function auditSectionColorAttribution(files, figmaRoot, options = {}) {
  const minRatio = Number(options.minAreaRatio ?? 0.01);
  const empty = { skipped: true, findings: [], stats: { sections: 0, judged: 0 } };
  if (!files || typeof files !== 'object') return { ...empty, reason: 'no-files' };
  if (!figmaRoot) return { ...empty, reason: 'no-figma-root' };

  const index = indexFigmaNodes(figmaRoot);
  if (index.size === 0) return { ...empty, reason: 'empty-figma-index' };
  const rootNode = figmaRoot?.document ?? figmaRoot;
  const rootArea = areaOf(rootNode) || 0;

  // 产物样式源（.vue 的 style 块 + .less/.css）里的 class → background 表
  const cssSources = [];
  const vueByPath = new Map();
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (/\.vue$/.test(p)) {
      vueByPath.set(p, c);
      cssSources.push(...styleBodies(c));
    } else if (/\.(less|css)$/.test(p)) {
      cssSources.push(c);
    }
  }
  if (vueByPath.size === 0 || cssSources.length === 0) {
    return { ...empty, reason: 'no-style-source' };
  }
  const bgMaps = cssSources.map((css) => collectClassBackgrounds(css));
  const lessVars = (() => {
    const merged = new Map();
    for (const [p, c] of Object.entries(files)) {
      if (typeof c === 'string' && /theme-vars\.less$/.test(p)) {
        for (const [k, v] of parseLessVars(c)) if (!merged.has(k)) merged.set(k, v);
      }
    }
    return merged;
  })();
  const declaredBg = (cls) => {
    for (const mp of bgMaps) {
      const v = mp.get(cls);
      if (v) return v;
    }
    return null;
  };

  const findings = [];
  const seen = new Set();
  let sections = 0;
  let judged = 0;

  for (const [path, content] of vueByPath) {
    const tagRe = /<([a-zA-Z][\w-]*)\b[^>]*\bdata-section-id="([^"]+)"[^>]*>/g;
    let m;
    while ((m = tagRe.exec(content))) {
      const tag = m[0];
      const sid = m[2];
      const entry = lookupSection(index, sid);
      if (!entry) continue;
      sections++;
      const node = entry.node;

      // ① 产物声明的背景值 V
      let rawVal = null;
      const styleAttr = /\bstyle="([^"]*)"/.exec(tag);
      const inline = styleAttr ? styleAttr[1] : '';
      const im = /(?:^|;)\s*background(?:-color|-image)?\s*:\s*([^;]+)/.exec(inline);
      if (im) rawVal = resolveVars(im[1].trim(), lessVars);
      if (!rawVal) {
        for (const cls of classTokens(tag)) {
          const v = declaredBg(cls);
          if (v) {
            rawVal = resolveVars(v, lessVars);
            break;
          }
        }
      }
      if (!rawVal || isUnjudgeable(rawVal)) continue;
      const V = normalizeCssColor(rawVal);
      if (!V) continue;
      judged++;

      // ② 合法来源 L(S)
      const L = new Set();
      for (const k of selfFillKeys(node)) L.add(k);
      for (const k of backdropKeys(node)) L.add(k);
      let pid = entry.parentId;
      let guard = 0;
      while (pid != null && guard++ < 128) {
        const pe = index.get(String(pid));
        if (!pe) break;
        for (const k of selfFillKeys(pe.node)) L.add(k);
        for (const k of backdropKeys(pe.node)) L.add(k);
        pid = pe.parentId;
      }
      if (L.has(V)) continue;

      // ③ 后代 / 兄弟醒目色
      const D = subtreeProminentKeys(node, rootArea, minRatio);
      const Sib = new Set();
      const pe = index.get(String(entry.parentId));
      if (pe) {
        for (const sib of pe.node.children || []) {
          if (String(sib.id) === String(node.id)) continue;
          for (const k of subtreeProminentKeys(sib, rootArea, minRatio)) Sib.add(k);
        }
      }
      let source = null;
      if (D.has(V)) source = 'descendant';
      else if (Sib.has(V)) source = 'sibling';
      if (!source) continue;

      const key = `${sid}|${V}|${source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        file: path,
        sectionId: sid,
        source,
        value: rawVal,
        norm: V,
        nodeId: String(node.id || ''),
        nodeName: String(node.name || ''),
      });
    }
  }

  return { skipped: false, findings, stats: { sections, judged } };
}
