/**
 * 🛡️ S3 第一片（**命名无关版** · 2026-09-28）：把 section 的 Figma 真值文案
 * **原地填进产物的文本槽位**（空槽补、错槽纠）。
 *
 * 为什么不是"重写模板"：上一版（`assembleTextLeafSections`）被**真实数据证伪** ——
 *   LLM 写的包装层类名（`-label` / `-value`）是**样式的锚点**，替换结构 = 换掉样式锚点 ⇒ 视觉更差。
 * 真实样本（mc-max-1790577363045-e2967edf / ContentSection9 / section 2:3464）：
 *   真值 `["货车","16270"]`，产物 `<span class="…-label-text"></span>`（空）+ `…-value-text` 写了"货车"
 *   ⇒ 标题错位 + 数值丢失；而"重写模板"会把 `-label`/`-value` 两层也抹掉。
 *
 * ## 命名无关（硬约束）
 *   设计稿节点名不可信（实测 `t` / `d` / `Frame 2136637410`），凡靠命名的判据都会失明：
 *   管线既有 `collectSubtreeTexts` 用 `/^[tT]-/` 判「标题」（`t` 无横杠 ⇒ 两条都被判成数值 ⇒
 *   `member-shape-mismatch` ⇒ 统计行 healer 从不执行）——**本模块不复用该口径**。
 *   · 文案真值 = Figma TEXT 的 **characters**（不是节点名）
 *   · 顺序     = **视觉序**（absoluteBoundingBox 先 y 后 x）
 *   · 槽位     = 产物里「**叶子元素**（无子元素）且非资源/非动态绑定」按 **DOM 序**
 *   · **不判断"标题/数值"语义** —— 槽位[i] ← 真值[i] 1:1 写入
 *   · **不新增/修改任何 class 或属性**（只改文字）⇒ 样式与结构链路完全不变
 *
 * ## 前置（不满足即 no-op，绝不猜）
 *   ① 该 section 子树**仅 TEXT** ② 真值条数 == 可用槽位数 ≥ 1 ③ 槽位内不得含 Vue 动态绑定 `{{ }}`
 *   ④ 根元素若带 `data-section-id`，必须等于本 section（不一致 ⇒ 拒绝）
 *   ⑤ **现有非空槽位的文案必须全部 ∈ 真值集合**（防在"与该 section 无关的模板"上误填）
 *   ⚠️ 不再要求"同一父元素"：真实产物里 label/value 各在自己的 wrapper 内（实测 `parents=2`），
 *      过严会整片失效；而"DOM 序 == 视觉序"由既有 TEXT-001（视觉阅读序是唯一事实源）保证。
 *
 * ## 灰度开关
 *   `MC_LEAF_TEXT_ASSEMBLY=1` 或 `input.leafTextAssembly === true`；默认**关**。
 *
 * 纯函数（不读盘、不改入参）；任何不确定 → 原样返回。
 */

/** 灰度开关判定（导出以便测试与调用方复用同一口径）。 */
export function isLeafTextAssemblyEnabled(input = {}) {
  if (input?.leafTextAssembly === true) return true;
  return String(process.env.MC_LEAF_TEXT_ASSEMBLY || '') === '1';
}

/** 在 Figma 树里按 id 找节点。 */
export function findFigmaNodeById(root, id) {
  if (!root || !id) return null;
  const stack = [root];
  let seen = 0;
  while (stack.length && seen < 8000) {
    const n = stack.pop();
    seen += 1;
    if (!n || typeof n !== 'object') continue;
    if (String(n.id || '') === String(id)) return n;
    if (Array.isArray(n.children)) for (const c of n.children) if (c) stack.push(c);
  }
  return null;
}

/**
 * 「纯文本叶子」section 的真值文案（**视觉序** y→x）。
 * 严格判定：根可以是 TEXT；否则要求**直接子节点全部是 TEXT**（嵌套结构一律判否 ⇒ 交给原路径）。
 * 命名无关：只看 `type` / `characters` / `absoluteBoundingBox` / `visible`。
 */
export function collectTextOnlyLeafTexts(node) {
  if (!node || typeof node !== 'object') return null;
  const texts = [];
  const walk = (n, isRoot) => {
    if (!n || typeof n !== 'object') return false;
    if (n.type === 'TEXT') {
      if (n.visible !== false) {
        const t = String(n.characters ?? '').replace(/\s+/g, ' ').trim();
        if (t) {
          texts.push({
            t,
            y: Number(n.absoluteBoundingBox?.y ?? 0),
            x: Number(n.absoluteBoundingBox?.x ?? 0),
          });
        }
      }
      return true;
    }
    if (!isRoot) return false;
    const kids = Array.isArray(n.children) ? n.children.filter(Boolean) : [];
    if (kids.length === 0) return false;
    return kids.every((c) => walk(c, false));
  };
  if (!walk(node, true)) return null;
  if (texts.length === 0) return null;
  texts.sort((a, b) => a.y - b.y || a.x - b.x);
  return texts;
}

/** 永不承载文案的标签（避免把图标/媒体元素当成文本槽位）。 */
const NON_TEXT_TAGS = new Set([
  'img', 'svg', 'canvas', 'video', 'audio', 'source', 'picture', 'input', 'textarea',
  'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'use', 'defs',
  'iframe', 'object', 'embed', 'br', 'hr', 'col', 'meta', 'link',
]);

/**
 * 解析 `<template>` 内层为轻量元素树（够用即可：标签开/闭/自闭合 + 纯文本段）。
 * 返回 `{ root, slots }`；slots（DOM 序）= 叶子元素中「可承载静态文案」者。
 */
export function extractTextSlots(templateInner) {
  const seg = String(templateInner || '');
  const tagRe = /<\/?([A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>])*)>|([^<]+)/g;
  const stack = [];
  let root = null;
  let m;
  while ((m = tagRe.exec(seg))) {
    const [raw, tag, attrs, text] = m;
    if (text !== undefined) {
      const t = String(text).replace(/\s+/g, ' ').trim();
      if (t && stack.length) stack[stack.length - 1].text += t;
      continue;
    }
    const isClose = raw.startsWith('</');
    const selfClose = /\/\s*$/.test(attrs || '');
    if (isClose) {
      const node = stack.pop();
      if (!node) continue;
      node.closeStart = m.index;
      node.closeEnd = m.index + raw.length;
      node.isLeaf = node.children.length === 0;
      continue;
    }
    const node = {
      tag: String(tag).toLowerCase(),
      attrs: attrs || '',
      openStart: m.index,
      openEnd: m.index + raw.length,
      text: '',
      children: [],
      isLeaf: false,
      selfClose,
      parent: stack.length ? stack[stack.length - 1] : null,
    };
    if (node.parent) {
      node.parent.children.push(node);
      node.parent.text = ''; // 有元素子节点 ⇒ 自身不再是文本叶子
    } else if (!root && !selfClose) {
      root = node;
    }
    if (!selfClose) stack.push(node);
  }
  const slots = [];
  const collect = (n) => {
    if (!n) return;
    if (
      n.isLeaf &&
      !n.selfClose &&
      n.closeStart !== undefined &&
      !NON_TEXT_TAGS.has(n.tag) &&
      !/\b:?src\s*=/.test(n.attrs)
    ) {
      slots.push(n);
    }
    for (const c of n.children) collect(c);
  };
  collect(root);
  return { root, slots };
}

/** 槽位是否可用于写入：已闭合、非自闭合、静态（无 `{{ }}` 绑定）。 */
function slotUsable(slot) {
  if (!slot || slot.selfClose) return false;
  if (slot.closeStart === undefined) return false;
  if (/\{\{/.test(slot.text)) return false; // 动态绑定 → 不覆盖
  return true;
}

/**
 * 原地按序填槽（命名无关）。
 *
 * @param {Object<string,string>} modelFiles path → content
 * @param {Object} input 生成上下文（`_indexTemplateFacts.sectionRoots`、`leafTextAssembly`）
 * @param {object} figmaNodeData Figma 节点树
 * @param {object} [options] { logger }
 * @returns {{files: Object<string,string>, filled: string[]}}
 */
export function fillTruthTextSlots(modelFiles, input = {}, figmaNodeData = null, options = {}) {
  const out = { files: modelFiles, filled: [] };
  if (!modelFiles || typeof modelFiles !== 'object' || !figmaNodeData) return out;
  if (!isLeafTextAssemblyEnabled(input)) return out;
  const roots = input?._indexTemplateFacts?.sectionRoots;
  if (!Array.isArray(roots) || roots.length === 0) return out;
  const figmaRoot = figmaNodeData.document || figmaNodeData;
  const next = { ...modelFiles };
  for (const r of roots) {
    const comp = String(r?.component || '').trim();
    const id = String(r?.id || '').trim();
    if (!comp || !id) continue;
    const p = `package/components/${comp}.vue`;
    const src = modelFiles[p];
    if (typeof src !== 'string' || !src) continue;
    const node = findFigmaNodeById(figmaRoot, id);
    if (!node) continue;
    const texts = collectTextOnlyLeafTexts(node);
    if (!texts || texts.length === 0) continue; // 非「纯文本叶子」⇒ 本片不碰
    const tplOpen = src.indexOf('<template>');
    const tplClose = src.lastIndexOf('</template>');
    if (tplOpen < 0 || tplClose < tplOpen) continue;
    const innerStart = tplOpen + '<template>'.length;
    const { root, slots } = extractTextSlots(src.slice(innerStart, tplClose));
    const usable = slots.filter(slotUsable);
    if (usable.length !== texts.length) continue; // 数量不等 ⇒ 不猜
    // ④ 根元素若已带锚点，必须与本 section 一致（不一致说明映射错位 ⇒ 拒绝）
    const rootAnchor = /\bdata-section-id="([^"]+)"/.exec(root?.attrs || '')?.[1];
    if (rootAnchor && rootAnchor !== id) continue;
    // ⑤ 现有非空槽位文案必须 ∈ 真值集合（防在与该 section 无关的模板上误填）
    const truthSet = new Set(texts.map((t) => t.t.replace(/\s+/g, '')));
    const loose = usable.filter((s) => s.text);
    if (loose.some((s) => !truthSet.has(s.text.replace(/\s+/g, '')))) continue;
    // 逆序替换避免位移；只改文字，不动标签/属性
    let content = src;
    let changed = false;
    for (let i = usable.length - 1; i >= 0; i--) {
      const s = usable[i];
      const t = texts[i].t;
      const bodyStart = innerStart + s.openEnd;
      const bodyEnd = innerStart + s.closeStart;
      if (content.slice(bodyStart, bodyEnd) === t) continue;
      content = content.slice(0, bodyStart) + t + content.slice(bodyEnd);
      changed = true;
    }
    if (changed) {
      next[p] = content;
      out.filled.push(`${p} ← ${id}（${texts.length} 处：${texts.map((x) => x.t).join(' / ')}）`);
    }
  }
  out.files = next;
  if (out.filled.length > 0 && options?.logger?.info) {
    options.logger.info('🧩 S3 真值文案原地填槽（命名无关）', {
      count: out.filled.length,
      samples: out.filled.slice(0, 4),
    });
  }
  return out;
}

export default fillTruthTextSlots;
