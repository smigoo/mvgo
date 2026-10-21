/**
 * @file container-background-truth.js — 刀 37（2026-10-21 · 07ae49a2 实锤）：容器背景真值纠偏。
 *
 * 事故形态：卡 2（`data-section-id="38:3282"`，class `.c-component-group-2136638435-con`）的
 *   `background` 写成 `@color-border-yellow`（= rgba(226,208,132,.2)）——**那是「战略合作厂商」
 *   面板（38:3137 / bg 38:3138）的底色**；而卡 2 的真值 bg 层（38:3283）与卡 1（38:3261）
 *   是同一条水平蓝渐变。结果：左上卡淡蓝、右上卡淡黄，与设计稿两张同色不符。
 *
 * 判据（**色值反查归属**，命名无关、零硬编码色值）：
 *   ① 真值：某 section S 的直接子级存在「纯图形背景层」（VECTOR/RECTANGLE/ELLIPSE/
 *      BOOLEAN_OPERATION），面积 ≥ S 的 60%，且有可见 fills ⇒ 该 fills 就是 S 的背景真值。
 *   ② 产物：S 对应元素的 class 在某处声明了 `background*`，其解析后的 CSS 值**恰好等于
 *      另一个 section T（T ≠ S）的背景真值** ⇒ 借用他人背景（跨块错绑）。
 *   ③ S 的真值是**渐变**而产物完全没有声明背景 ⇒ 缺失。
 *   ④ S 的真值是**渐变**、产物也声明了，但解析后**不等于本节真值** ⇒ 写错（2026-10-21 新增）。
 *   ⇒ 命中 ②/③/④ 时把真值写成该元素的 inline `background`（精确到该元素，不污染 class，幂等）。
 *
 * 为什么 ④ 只判渐变、不判纯色：纯色面板（38:3137/3162/3206）的 class 背景引用的是
 *   主题变量（`@color-border-*`，明暗两套值），覆盖成字面量会丢主题能力；而卡片的渐变
 *   在产物里根本没有对应槽位，只能按真值下发。
 *   ⚠️ 2026-10-21 刀 42 勘误：上述「交主题变量体系」只在**该 class 真的声明了背景**时成立。
 *   真机三段的面板容器（`c-60212f-container`：`display:flex;width:100%`）**零 background
 *   声明**，压根没有主题变量槽位 ⇒ 旧分支 `纯色且未声明 ⇒ continue` 等于永远不补
 *   （用户反馈「三个 section 依旧没有统一样式」）。故 ⑤ 改为：纯色未声明 ⇒ 按真值补，
 *   并顺带补圆角与外发光（同属该面板底矩形）。
 *   ④ 的实证（e3ab048a）：卡 1 写成 `linear-gradient(180deg,#d4e3ff,#c1d6ff)`（凭空色值、
 *   丢 opacity 0.4），卡 2 因「原未声明」被 ③ 修对 ⇒ 同系列两卡一修一漏。加 ④ 后两者一致。
 *
 * ⚠️ 渐变方向的可证性：`figma.json` 常缺 `gradientHandlePositions`（e3ab048a 的
 *   `38:3261`/`38:3283` 均为 null）⇒ `fillsToCss` 只能默认 `180deg`。此时结果带
 *   `angleGuessed: true`，change 记录里如实标注，不当作确定真值。
 *
 *  ⑤ 刀 42：真值是**纯色**且产物完全没声明背景 ⇒ 缺失（旧实现跳过，见上勘误）。
 *  ⑥ 刀 42：面板底矩形的 `cornerRadius` > 0，而元素 inline 与任何 class 都没声明
 *     `border-radius` ⇒ 补圆角（已声明则尊重，**不改写**——子项常与父项共用 class）。
 *  ⑦ 刀 42：面板底矩形有 `SHADOW` effects（三段的金/绿/青 INNER_SHADOW 外发光），而元素
 *     inline 与任何 class 都没声明 `box-shadow` ⇒ 补发光。
 *   ⇒ 命中 ②/③/④/⑤/⑥/⑦ 时把真值写成该元素的 inline（精确到该元素，不污染 class，幂等）。
 *
 * 为什么圆角/发光只补「完全没声明」的：`border-radius` 与 `box-shadow` 在多处共用 class
 *   时改写会影响别的元素（`c-component-frame-2136639905` 的双身份教训）。**判据判不了
 *   就先不改** —— 只补空白，不猜已有值对不对（fail-open）。
 *
 * 纯函数、零 import.meta，可独立单测。
 */

import { effectsToBoxShadow } from './figma-effects.js';

const GRAPHIC_TYPES = new Set([
  'VECTOR',
  'RECTANGLE',
  'ELLIPSE',
  'BOOLEAN_OPERATION',
  'POLYGON',
  'STAR',
]);

const round255 = (v) => Math.round((Number(v) || 0) * 255);

function rgba(color, opacity = 1) {
  if (!color) return null;
  const a = (typeof color.a === 'number' ? color.a : 1) * (typeof opacity === 'number' ? opacity : 1);
  return `rgba(${round255(color.r)}, ${round255(color.g)}, ${round255(color.b)}, ${Number(a.toFixed(3))})`;
}

/**
 * Figma fills → CSS background 值（只支持本判据需要的三种：SOLID / GRADIENT_LINEAR / GRADIENT_RADIAL）。
 * 不支持的渐变类型返回 null（fail-open，宁可不改）。
 */
export function fillsToCss(fills) {
  const first = (Array.isArray(fills) ? fills : []).find(
    (f) => f && f.visible !== false && (f.type === 'SOLID' || /^GRADIENT_/.test(String(f.type))),
  );
  if (!first) return null;
  if (first.type === 'SOLID') return rgba(first.color, first.opacity);

  const stops = (first.gradientStops || [])
    .map((s) => {
      const c = rgba(s.color, first.opacity);
      return c ? `${c} ${Math.round((Number(s.position) || 0) * 100)}%` : null;
    })
    .filter(Boolean);
  if (stops.length < 2) return null;

  if (first.type === 'GRADIENT_LINEAR') {
    const h = first.gradientHandlePositions || [];
    const dx = (h[1]?.x ?? 1) - (h[0]?.x ?? 0);
    const dy = (h[1]?.y ?? 0) - (h[0]?.y ?? 0);
    // CSS 角度：0deg = 向上，90deg = 向右，180deg = 向下
    const angle = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 90 : 270) : dy >= 0 ? 180 : 0;
    return `linear-gradient(${angle}deg, ${stops.join(', ')})`;
  }
  return `radial-gradient(circle, ${stops.join(', ')})`;
}

/** 归一化 CSS 值用于等值比较（大小写/空白不敏感） */
export function normalizeCss(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/(\d*\.?\d+)px/g, '$1px');
}

/** 去掉 linear-gradient 的方向（只留 stops），供「方向不可证」时的 stops 级比较 */
export function stripGradientAngle(css) {
  return String(css || '').replace(/(linear-gradient\()\s*-?\d+(?:\.\d+)?deg\s*,/i, '$1');
}

/** 取 linear-gradient 的方向角（deg）；无则 null */
export function extractGradientAngle(css) {
  const m = /linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,/i.exec(String(css || ''));
  return m ? Number(m[1]) : null;
}

/** 用给定方向替换 truth 的方向（方向不可证时保留产物已写的角度） */
function mergeGradientAngle(truthCss, angle) {
  if (angle == null) return truthCss;
  return String(truthCss).replace(
    /(linear-gradient\()\s*-?\d+(?:\.\d+)?deg\s*,/i,
    `$1 ${angle}deg,`,
  );
}

/** 节点面积 */
function areaOf(box) {
  return box && Number.isFinite(box.width) && Number.isFinite(box.height)
    ? box.width * box.height
    : 0;
}

/**
 * 从 figma 树建立 { id → node } 索引（兼容 {document} 与裸根）。
 */
export function indexFigmaNodes(figmaRoot) {
  const idx = new Map();
  const root = figmaRoot?.document ?? figmaRoot;
  const walk = (n, parent) => {
    if (!n || typeof n !== 'object') return;
    const id = n.id != null ? String(n.id) : '';
    if (id && !idx.has(id)) idx.set(id, { node: n, parentId: parent });
    for (const c of n.children || []) walk(c, id || parent);
  };
  walk(root, null);
  return idx;
}

/**
 * 该渐变是否**持有真实方向**（figma 的 `gradientHandlePositions` 齐全）。
 * 缺 handle 时 `fillsToCss` 只能默认 180deg ⇒ 结果不算确定真值。
 */
function hasGradientHandles(fills) {
  const g = (Array.isArray(fills) ? fills : []).find((f) =>
    /^GRADIENT_LINEAR/.test(String(f?.type || '')),
  );
  const h = g?.gradientHandlePositions;
  return (
    Array.isArray(h) &&
    h.length >= 2 &&
    Number.isFinite(h[0]?.x) &&
    Number.isFinite(h[0]?.y) &&
    Number.isFinite(h[1]?.x) &&
    Number.isFinite(h[1]?.y)
  );
}

/**
 * 某 section 的「背景层」真值：直接子级中的纯图形、面积 ≥ 父 60%、有 fills。
 * @returns {{ css: string, layerId: string, kind: string, angleGuessed?: boolean } | null}
 */
export function resolveSectionBackground(secId, figmaIndex) {
  const panel = resolveSectionPanel(secId, figmaIndex);
  return panel
    ? {
        css: panel.css,
        layerId: panel.layerId,
        kind: panel.kind,
        // 保持历史形状：渐变时 `angleGuessed` **恒存在**（true/false），不能只在 true 时出现
        // —— 既有断言/下游按 `=== false` 判断「方向可证」。
        ...(panel.angleGuessed !== undefined ? { angleGuessed: panel.angleGuessed } : {}),
      }
    : null;
}

/**
 * 刀 42（2026-10-21）：面板「三件套」真值 —— 底色 + 圆角 + 外发光（同一层）。
 *
 * 事故：`38:3137 / 38:3162 / 38:3206` 三个面板底（`38:3138/3163/3207`）在产物里
 * **全部缺失** ⇒ 三段看起来是三张白纸，用户反馈「三个 section 依旧没有统一样式」。
 * 机制：旧实现 `纯色 + 未声明 ⇒ continue`（怕覆盖主题变量），而这层底色**根本没有任何
 * 主题变量槽位**，于是永远不补；圆角与外发光（figma INNER_SHADOW 发光）更是从没人管。
 *
 * @returns {{ css:string, kind:string, layerId:string, radius:number, shadow:string|null,
 *             angleGuessed?:boolean } | null}
 */
export function resolveSectionPanel(secId, figmaIndex) {
  const entry = figmaIndex.get(String(secId));
  if (!entry) return null;
  const sec = entry.node;
  const secArea = areaOf(sec.absoluteBoundingBox);
  if (!secArea) return null;
  for (const child of sec.children || []) {
    const type = String(child?.type || '').toUpperCase();
    if (!GRAPHIC_TYPES.has(type)) continue;
    const childArea = areaOf(child.absoluteBoundingBox);
    if (!childArea || childArea / secArea < 0.6) continue;
    const css = fillsToCss(child.fills);
    if (!css) continue;
    const kind = css.startsWith('linear-gradient') ? 'gradient' : 'solid';
    // 圆角：优先 `cornerRadius`；四个角分别给值时取最大值（面板底四角等圆角，取 max 不失真）
    const radii = Array.isArray(child.rectangleCornerRadii)
      ? child.rectangleCornerRadii.filter((n) => Number.isFinite(Number(n))).map(Number)
      : [];
    const radius = Number(child.cornerRadius) || (radii.length > 0 ? Math.max(...radii) : 0);
    const shadow = effectsToBoxShadow(child.effects);
    return {
      css,
      layerId: String(child.id || ''),
      kind,
      radius,
      shadow,
      ...(kind === 'gradient' ? { angleGuessed: !hasGradientHandles(child.fills) } : {}),
    };
  }
  return null;
}

/** 解析 less 变量表（取首个声明，通常是 light 主题） */
export function parseLessVars(text) {
  const vars = new Map();
  for (const m of String(text || '').matchAll(/^\s*@([\w-]+)\s*:\s*([^;]+);/gm)) {
    const name = m[1];
    if (!vars.has(name)) vars.set(name, m[2].trim());
  }
  return vars;
}

/** 从 CSS 文本里取某属性的声明（顶层规则）。`prop` 支持 `background`（含 -color/-image 变体）。 */
export function collectClassProp(css, prop) {
  const out = new Map(); // cls → value
  const propRx =
    prop === 'background'
      ? /(?:^|;)\s*background(?:-color|-image)?\s*:\s*([^;]+)/
      : new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`);
  const re = /\.([A-Za-z_][\w-]*)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    if (depth !== 0) break;
    const body = css.slice(bodyStart, i - 1);
    const hit = propRx.exec(body);
    if (hit && !out.has(m[1])) out.set(m[1], hit[1].trim());
  }
  return out;
}

/** 从 CSS 文本里取 class 的 background 声明（顶层规则；`background` / `background-color` / `background-image`） */
export function collectClassBackgrounds(css) {
  return collectClassProp(css, 'background');
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

/** 把 `@var` 引用解析为实际值（浅层一次解析即可，够用；解析不出返回原串） */
function resolveVars(value, lessVars) {
  return String(value || '').replace(/@([\w-]+)/g, (all, name) =>
    lessVars.has(name) ? lessVars.get(name) : all,
  );
}

/**
 * 刀 37 主体。
 * @param {Record<string,string>} files 产物文件集
 * @param {object} ctx `{ figmaRoot }`
 * @returns {{ files, changes: Array }}
 */
export function healContainerBackgroundTruth(files, { figmaRoot } = {}) {
  const changes = [];
  if (!files || typeof files !== 'object') return { files, changes };
  if (!figmaRoot) return { files, changes, skipped: [{ reason: 'no-figma-root' }] };

  const figmaIndex = indexFigmaNodes(figmaRoot);
  if (figmaIndex.size === 0) return { files, changes, skipped: [{ reason: 'empty-figma-index' }] };

  // ① 全量 section 面板真值（底色 + 圆角 + 发光；同样供「借用了谁的背景」反查）
  const bgBySection = new Map(); // secId → { css, kind, layerId, radius, shadow }
  for (const id of figmaIndex.keys()) {
    const panel = resolveSectionPanel(id, figmaIndex);
    if (panel) bgBySection.set(id, panel);
  }
  if (bgBySection.size === 0) return { files, changes, skipped: [{ reason: 'no-bg-truth' }] };

  // 值 → 拥有该背景的 section 集合
  const ownersByCss = new Map();
  for (const [secId, bg] of bgBySection) {
    const key = normalizeCss(bg.css);
    if (!ownersByCss.has(key)) ownersByCss.set(key, new Set());
    ownersByCss.get(key).add(secId);
  }

  const cssSourcesAll = [];
  for (const [p, c] of Object.entries(files)) {
    if (typeof c !== 'string') continue;
    if (/\.vue$/.test(p)) cssSourcesAll.push(...styleBodies(c));
    else if (/common\.less$/.test(p)) cssSourcesAll.push(c);
  }
  const lessVars = (() => {
    const merged = new Map();
    for (const [p, c] of Object.entries(files)) {
      if (typeof c === 'string' && /theme-vars\.less$/.test(p)) {
        for (const [k, v] of parseLessVars(c)) if (!merged.has(k)) merged.set(k, v);
      }
    }
    return merged;
  })();

  // 每个 CSS 源只解析一次三件套（background / border-radius / box-shadow）：
  // 底色判定要按 class 反查、圆角与外发光同理 —— 按 class 反复全量 parse 是 O(cls×src) 次正则。
  const toPropMaps = (css) => ({
    background: collectClassProp(css, 'background'),
    'border-radius': collectClassProp(css, 'border-radius'),
    'box-shadow': collectClassProp(css, 'box-shadow'),
  });
  const globalPropMaps = cssSourcesAll.map(toPropMaps);
  /** 在「本文件 style → 其它源」顺序里找该 class 的某属性声明（首个命中的源胜） */
  const declaredProp = (cls, prop, orderedMaps) => {
    for (const mp of orderedMaps) {
      const v = mp[prop].get(cls);
      if (v) return v;
    }
    return null;
  };

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !/\.vue$/.test(path)) continue;
    const ownStyles = styleBodies(content);
    const propMaps = [...ownStyles.map(toPropMaps), ...globalPropMaps];
    let next = content;
    let dirty = false;

    const tagRe = /<([a-zA-Z][\w-]*)\b[^>]*\bdata-section-id="([^"]+)"[^>]*>/g;
    const tags = [];
    let m;
    while ((m = tagRe.exec(content))) tags.push({ tag: m[0], sectionId: m[2], index: m.index });
    // 从后往前改，避免位移
    for (const t of tags.reverse()) {
      const truth = bgBySection.get(t.sectionId);
      if (!truth) continue;

      const classes = classTokens(t.tag);
      const styleAttr = /\bstyle="([^"]*)"/.exec(t.tag);
      const inlineStyle = styleAttr ? styleAttr[1] : '';
      const decls = []; // 本次要追加的 inline 声明
      const reasons = [];
      let bgValue = null;

      // ── ① 底色：inline 已声明 ⇒ 幂等跳过（只跳过这一项，圆角/发光仍各自判定）
      if (!/\bbackground(?:-color|-image)?\s*:/.test(inlineStyle)) {
        let declared = null;
        for (const cls of classes) {
          const v = declaredProp(cls, 'background', propMaps);
          if (v) { declared = { cls, value: v }; break; }
        }

        let reason = null;
        if (declared) {
          const resolved = normalizeCss(resolveVars(declared.value, lessVars));
          const owners = ownersByCss.get(resolved);
          const borrowedFromOther = owners && !owners.has(t.sectionId);
          if (borrowedFromOther) {
            reason = `borrowed:${declared.cls}=${declared.value}`;
          } else if (truth.kind === 'gradient') {
            // ④（2026-10-21 · e3ab048a 实锤）：已声明但 ≠ 本节真值 ⇒ 写错。
            //   只对渐变生效：纯色的 class 背景引用主题变量（明暗两套），覆盖成字面量会丢主题。
            //   ⚠️ 方向不可证（`angleGuessed`）时**只比 stops**：角度差本身不构成「写错」的
            //   证据（e3ab048a 卡 2 的 class 是 180deg、truth 缺 handle 只能猜 90deg，若按
            //   全串比较会把一个本来正确的背景改写掉）。
            const tCmp = normalizeCss(truth.angleGuessed ? stripGradientAngle(truth.css) : truth.css);
            const dCmp = normalizeCss(truth.angleGuessed ? stripGradientAngle(resolved) : resolved);
            if (tCmp !== dCmp) reason = `mismatch:${declared.cls}=${declared.value}`;
          }
          // 纯色已声明（无论值）⇒ 尊重主题变量体系，不动（fail-open）
        } else if (truth.kind === 'gradient') {
          reason = 'missing-gradient';
        } else {
          // ⑤ 刀 42（2026-10-21 · mc-1792580653375-60212fb6 实锤）：纯色且**完全没声明**
          //   ⇒ 这层根本没有主题变量槽位（class 里只有 display/width），不补就永远是白纸。
          reason = 'missing-solid';
        }

        if (reason) {
          // 方向不可证时保留产物原有的角度，只把 stops 换成真值（不静默硬塞猜出来的 90deg）
          bgValue =
            truth.angleGuessed && declared
              ? mergeGradientAngle(truth.css, extractGradientAngle(resolveVars(declared.value, lessVars)))
              : truth.css;
          decls.push(`background:${bgValue}`);
          reasons.push(reason);
        }
      }

      // ── ② 圆角（⑥）：只补「inline 与任何 class 都没声明」的，已声明值一律尊重
      //   （子项常与父项共用 class，改写会波及别的元素 —— 双身份教训）
      if (truth.radius > 0 && !/\bborder-radius\s*:/.test(inlineStyle)) {
        const declaredR = classes.some((cls) => declaredProp(cls, 'border-radius', propMaps));
        if (!declaredR) {
          decls.push(`border-radius:${truth.radius}px`);
          reasons.push('missing-radius');
        }
      }

      // ── ③ 外发光（⑦）：figma 面板底的 SHADOW effects（三段金/绿/青 INNER_SHADOW）
      if (truth.shadow && !/\bbox-shadow\s*:/.test(inlineStyle)) {
        const declaredS = classes.some((cls) => declaredProp(cls, 'box-shadow', propMaps));
        if (!declaredS) {
          decls.push(`box-shadow:${truth.shadow}`);
          reasons.push('missing-glow');
        }
      }

      if (decls.length === 0) continue;

      const css = decls.join(';');
      const newTag = styleAttr
        ? t.tag.replace(styleAttr[0], `style="${css};${styleAttr[1]}"`)
        : t.tag.replace(/\s*\/?>$/, (tail) => ` style="${css}"${tail}`);
      next = next.slice(0, t.index) + newTag + next.slice(t.index + t.tag.length);
      dirty = true;
      changes.push({
        file: path,
        sectionId: t.sectionId,
        reason: reasons.join('+'),
        ...(bgValue ? { background: bgValue } : {}),
        ...(decls.some((d) => d.startsWith('border-radius')) ? { radius: truth.radius } : {}),
        ...(decls.some((d) => d.startsWith('box-shadow')) ? { shadow: truth.shadow } : {}),
        layer: truth.layerId,
        ...(truth.angleGuessed ? { angleGuessed: true } : {}),
      });
    }

    if (dirty) files[path] = next;
  }

  return { files, changes };
}
