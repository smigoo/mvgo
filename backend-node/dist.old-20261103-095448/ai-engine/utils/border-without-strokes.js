/**
 * @file border-without-strokes.js — 刀 38（2026-10-21 · e3ab048a 实锤）：
 *   「真值无描边 ⇒ 产物不得有边框」。
 *
 * 事故：统计卡 1（`data-section-id="38:3260"`，class `.c-e3ab04-stats-con`）产物写成
 *   `border: 1px solid #a0c1ff; border-radius: 4px;`，而真值 `38:3260.strokes === []`
 *   —— `#a0c1ff` 在整棵 figma 树里根本不存在（只等于 `theme-vars.less` 的 `@color-bg-design`）。
 *   同一张卡 2 因为走了刀 37 的「背景缺失」分支反而被修对 ⇒ 同系列两卡一卡有框一卡无框。
 *   既有判据为何全盲：N1 `truth-color-usage-guard` 判据②「纯色才判、渐变跳过」，而这张卡
 *   的真值是渐变填充 + 渐变描边 ⇒ 整条跳过。
 *
 * 判据（命名无关、零硬编码色值）：
 *   ① 真值：某 section 根节点 `strokes` 为空（或全部 `visible:false`）⇒ 该 section 不得有边框。
 *   ② 产物：该 section 元素的 inline `style`、或**仅被该 section 使用**的 class 规则里
 *      出现 `border` / `border-*` / `outline` / `outline-*` 且值不是 none/0 ⇒ 删除该声明。
 *
 * 三条边界（都是「不得误伤」的阴性对照）：
 *   · **`border-radius` 不是边框** —— 语义是圆角，一律保留。
 *   · **`box-shadow` 不是边框** —— figma 的 `INNER_SHADOW`（本例三段面板各有一个）是真值，
 *     删了会把面板高亮效果抹掉。
 *   · **共享 class 不动** —— 只有当该 class 的全部使用点都是「同一个 section 的根元素」时才改
 *     它的规则；有任何一次被别的元素（无 `data-section-id` 或别的 section）用过就跳过，
 *     避免误伤别处。inline 是元素级的，不受此限。
 *
 * 纯函数、零 import.meta，可独立单测；幂等（值已是 none/0 时不再产生变更）。
 */
import { indexFigmaNodes } from './container-background-truth.js';

const BORDER_PROP_RE = /^(?:border|outline)(?:-[a-z]+)*$/i;
const NO_BORDER_VALUE_RE = /^(?:none|0(?:px|em|rem|%)?|initial|unset|inherit|hidden|medium\s+none)$/i;

/** `border-radius` / `outline-radius` 属于圆角语义，不是描边 */
function isBorderShorthandOrSide(prop) {
  const p = String(prop || '').trim();
  if (!BORDER_PROP_RE.test(p)) return false;
  return !/radius$/i.test(p);
}

function isNoBorderValue(v) {
  return NO_BORDER_VALUE_RE.test(String(v || '').trim());
}

/** 真值：该节点无任何可见描边 */
export function isStrokeFree(node) {
  if (!node || typeof node !== 'object') return false;
  const strokes = Array.isArray(node.strokes) ? node.strokes : [];
  return strokes.every((s) => !s || s.visible === false);
}

/** 元素开标签里的 class 列表 */
function classTokens(tagText) {
  const m = /\bclass="([^"]*)"/.exec(tagText || '');
  return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

/**
 * 全量 class 使用点统计：`cls → { sids:Set<sectionId>, orphanTags:number }`
 * orphanTags = 用了该 class 但**不带** `data-section-id` 的标签数（>0 即不可安全改规则）。
 */
export function collectClassUsages(files) {
  const map = new Map();
  const tagRe = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
  for (const [p, c] of Object.entries(files || {})) {
    if (typeof c !== 'string' || !/\.vue$/.test(p)) continue;
    tagRe.lastIndex = 0;
    let m;
    while ((m = tagRe.exec(c))) {
      const attrs = m[2] || '';
      const clsM = /\bclass="([^"]*)"/.exec(attrs);
      if (!clsM) continue;
      const sidM = /\bdata-section-id="([^"]+)"/.exec(attrs);
      for (const cls of clsM[1].split(/\s+/).filter(Boolean)) {
        const rec = map.get(cls) || { sids: new Set(), orphanTags: 0 };
        if (sidM) rec.sids.add(sidM[1]);
        else rec.orphanTags += 1;
        map.set(cls, rec);
      }
    }
  }
  return map;
}

/** 该 class 的规则是否可安全改写（只服务唯一一个 section 的根元素） */
export function isClassExclusiveTo(cls, sectionId, usages) {
  const rec = usages.get(cls);
  if (!rec) return false;
  if (rec.orphanTags > 0) return false;
  return rec.sids.size === 1 && rec.sids.has(String(sectionId));
}

/**
 * 通用「按谓词删除声明」三条（2026-10-21 刀 42 抽出，供「面板装饰误置」复用同一份块改写逻辑）。
 * 边界与刀 38 完全一致：逐行一条声明、不碰嵌套块、inline 只删目标属性。
 * @param {(prop:string, value:string) => boolean} isTargetProp
 */
export function stripDeclsFromBody(body, isTargetProp) {
  const lines = String(body || '').split('\n');
  const kept = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('/*')) {
      kept.push(line);
      continue;
    }
    const m = /^([a-zA-Z-]+)\s*:\s*([^;]*);?$/.exec(t);
    if (m && isTargetProp(m[1], m[2])) continue;
    kept.push(line);
  }
  return kept.join('\n');
}

export function stripDeclsFromInline(styleText, isTargetProp) {
  const segs = String(styleText || '').split(';');
  const kept = [];
  for (const seg of segs) {
    const t = seg.trim();
    if (!t) continue;
    const m = /^([a-zA-Z-]+)\s*:\s*(.*)$/.exec(t);
    if (m && isTargetProp(m[1], m[2])) continue;
    kept.push(t);
  }
  return kept.join(';');
}

export function hasDeclInInline(styleText, isTargetProp) {
  for (const seg of String(styleText || '').split(';')) {
    const t = seg.trim();
    if (!t) continue;
    const m = /^([a-zA-Z-]+)\s*:\s*(.*)$/.exec(t);
    if (m && isTargetProp(m[1], m[2])) return true;
  }
  return false;
}

export function stripDeclsFromClassRules(css, classes, isTargetProp) {
  let out = String(css || '');
  for (const cls of classes) {
    const esc = String(cls).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\.${esc}(?![\\w-])\\s*\\{`, 'g');
    const blocks = [];
    let m;
    while ((m = re.exec(out))) {
      const bodyStart = m.index + m[0].length;
      let depth = 1;
      let i = bodyStart;
      while (i < out.length && depth > 0) {
        if (out[i] === '{') depth++;
        else if (out[i] === '}') depth--;
        i++;
      }
      if (depth !== 0) break;
      blocks.push({ bodyStart, bodyEnd: i - 1 });
    }
    for (const b of blocks.reverse()) {
      const body = out.slice(b.bodyStart, b.bodyEnd);
      const stripped = stripDeclsFromBody(body, isTargetProp);
      if (stripped !== body) out = out.slice(0, b.bodyStart) + stripped + out.slice(b.bodyEnd);
    }
  }
  return out;
}

/** 从整段规则正文里删除边框声明（逐行，一行一条声明；杜绝误删嵌套块） */
export function stripBorderDeclsFromBody(body) {
  return stripDeclsFromBody(body, (prop, value) => isBorderShorthandOrSide(prop) && !isNoBorderValue(value));
}

/** 从 inline style（`prop:v;prop:v`）里删除边框声明；返回新串（可能为空） */
export function stripBorderFromInline(styleText) {
  return stripDeclsFromInline(
    styleText,
    (prop, value) => isBorderShorthandOrSide(prop) && !isNoBorderValue(value),
  );
}

/**
 * 该 inline style 里**是否真的有**边框声明。
 * 必须单独判：`stripBorderFromInline` 会顺带把结尾分号/空白归一化，若拿它和原文比
 * `!==` 来判「有变更」，会给每个无边框元素产生一次假变更（真机重放实测 6 处假阳性）。
 */
export function hasBorderDeclInInline(styleText) {
  return hasDeclInInline(styleText, (prop, value) => isBorderShorthandOrSide(prop) && !isNoBorderValue(value));
}

/** 在 CSS 文本里逐个 `.cls { ... }` 块删除边框声明（从后往前改，避免位移） */
export function stripBorderDeclsFromClassRules(css, classes) {
  return stripDeclsFromClassRules(
    css,
    classes,
    (prop, value) => isBorderShorthandOrSide(prop) && !isNoBorderValue(value),
  );
}

/** SFC 里所有 style 块（连同位置） */
function styleBlockRanges(content) {
  const out = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(content))) {
    out.push({ start: m.index + m[0].indexOf(m[1]), end: m.index + m[0].indexOf(m[1]) + m[1].length });
  }
  return out;
}

/**
 * 刀 38 主体。
 * @param {Record<string,string>} files 产物文件集
 * @param {object} ctx `{ figmaRoot }`
 * @returns {{ files, changes: Array }}
 */
export function healBorderWithoutStrokes(files, { figmaRoot } = {}) {
  const changes = [];
  if (!files || typeof files !== 'object') return { files, changes };
  if (!figmaRoot) return { files, changes, skipped: [{ reason: 'no-figma-root' }] };

  const figmaIndex = indexFigmaNodes(figmaRoot);
  if (figmaIndex.size === 0) return { files, changes, skipped: [{ reason: 'empty-figma-index' }] };

  const usages = collectClassUsages(files);

  // ① 逐个 .vue 处理 section 根元素的 inline 边框，并收集可安全改写的 class
  const classesToStrip = new Set();
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !/\.vue$/.test(path)) continue;
    const tagRe = /<([a-zA-Z][\w-]*)\b[^>]*\bdata-section-id="([^"]+)"[^>]*>/g;
    const tags = [];
    let m;
    while ((m = tagRe.exec(content))) tags.push({ tag: m[0], sectionId: m[2], index: m.index });

    let next = content;
    let dirty = false;
    for (const t of tags.reverse()) {
      const node = figmaIndex.get(String(t.sectionId))?.node;
      if (!node) continue;
      if (!isStrokeFree(node)) continue;

      let newTag = t.tag;

      // ② inline style（先判「真的有没有边框」，避免只做格式归一化就报变更）
      const inline = /\bstyle="([^"]*)"/.exec(newTag);
      if (inline && hasBorderDeclInInline(inline[1])) {
        const stripped = stripBorderFromInline(inline[1]);
        newTag = stripped.trim()
          ? newTag.replace(inline[0], `style="${stripped}"`)
          : newTag.replace(/\s*style="[^"]*"/, '');
        changes.push({ file: path, sectionId: t.sectionId, where: 'inline' });
        dirty = true;
      }

      // ③ class 规则（仅限专属于该 section 的 class）
      for (const cls of classTokens(newTag)) {
        if (isClassExclusiveTo(cls, t.sectionId, usages)) classesToStrip.add(cls);
      }

      if (newTag !== t.tag) {
        next = next.slice(0, t.index) + newTag + next.slice(t.index + t.tag.length);
      }
    }
    if (dirty) files[path] = next;
  }

  // ④ 改写 class 规则（common.less + 各 SFC 的 style 块）
  if (classesToStrip.size > 0) {
    const list = Array.from(classesToStrip);
    for (const [path, content] of Object.entries(files)) {
      if (typeof content !== 'string') continue;
      if (/common\.less$/.test(path)) {
        const stripped = stripBorderDeclsFromClassRules(content, list);
        if (stripped !== content) {
          files[path] = stripped;
          for (const cls of list) {
            if (stripBorderDeclsFromClassRules(content, [cls]) !== content) {
              changes.push({ file: path, sectionId: null, where: 'class', cls });
            }
          }
        }
        continue;
      }
      if (!/\.vue$/.test(path)) continue;
      const ranges = styleBlockRanges(content);
      let out = content;
      for (const r of ranges.reverse()) {
        const css = out.slice(r.start, r.end);
        const stripped = stripBorderDeclsFromClassRules(css, list);
        if (stripped !== css) {
          out = out.slice(0, r.start) + stripped + out.slice(r.end);
        }
      }
      if (out !== content) {
        files[path] = out;
        for (const cls of list) {
          if (stripBorderDeclsFromClassRules(content, [cls]) !== content) {
            changes.push({ file: path, sectionId: null, where: 'class', cls });
          }
        }
      }
    }
  }

  return { files, changes };
}
