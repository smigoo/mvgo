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
 * ⑧ 刀 42-c（2026-10-22 · mc-1792635568116-472784ae 实锤）：面板横跨父级（段自身宽 ≥ 父宽 95%）
 *    而元素 inline/class 都没声明 `width` ⇒ 补 `width:100%`。
 *    病灶：父级 `.c-…-icon-con` 写的是 `align-items:flex-start`（**不拉伸**），面板容器又没有
 *    `width:100%` ⇒ 面板缩成内容宽（截图里战略段金面板只有半幅宽）。判据纯几何（宽度比），
 *    只看「面板是否横跨父级」，不看它左右是谁。
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

/* ──────────────────────────────────────────────────────────────────────────
 * 🛡️ M1（2026-11-03 · mc-1793718100141-30ba57ca 实锤）：无来源背景剥除（判据推广）
 *
 * 病灶：卡片底色已烤进背景图（真值仅 `bg: bg-126 backgroundBlock`，fills 无渐变），
 *   LLM 却在 common.less / scoped style 里臆造 linear-gradient 叠到卡片主体与装饰条上
 *   ⇒ 双重上色。既有 刀37/42 只纠「已锚定 section 元素的背景错/缺」，管不到未锚定
 *   后代 class 的**凭空新增**背景。
 *
 * 判据（单一真值源 = Figma fills，命名无关）：
 *   产物样式块里任何 background / background-color 声明，其值（less 变量解析后）
 *   必须能在**全组件 Figma 真值 fills 集合**中找到等值来源（渐变方向不可证时按 stops 比）。
 *   无来源 = 臆造 ⇒ 剥除该条声明（不动选择器其它属性，不删规则）。
 *
 * fail-open 豁免（一律保留）：
 *   - transparent / url(...) / 含 CSS var() 的值
 *   - 解析不出的 @变量、命名色（white/black 等非常见字面量）、currentColor 等关键字
 *   - 真值集合为空（无 figmaRoot / 无任何 fills）时整体跳过
 * 设计约束：只扫样式块（.vue <style> 与 common.less），**不碰 inline style**——
 *   inline 是 刀37/42 等真值守卫的注入位，避免互相拆台。
 * ──────────────────────────────────────────────────────────────────────── */

/** hex → rgba() 归一（#rgb / #rrggbb / #rrggbbaa），非法返回 null */
function hexToRgbaCss(hex) {
  const m = /^#([0-9a-f]{3,8})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

/** 收集 figma 树全部 fills 的合法背景真值集合（归一化；含 hex/rgba 双形态与 stops 级变体） */
export function collectBackgroundTruthSet(figmaRoot) {
  const truth = new Set();
  const root = figmaRoot?.document ?? figmaRoot;
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    for (const f of n.fills || []) {
      if (!f || f.visible === false) continue;
      const css = fillsToCss([f]);
      if (!css) continue;
      truth.add(normalizeCss(css));
      if (/gradient\(/.test(css)) truth.add(normalizeCss(stripGradientAngle(css)));
    }
    for (const c of n.children || []) walk(c);
  };
  walk(root);
  return truth;
}

/** 单个背景声明值是否有真值来源 */
export function hasBackgroundTruthSource(rawValue, { truthSet, lessVars }) {
  const value = String(rawValue || '').trim();
  if (!value) return true;
  // 豁免：透明/图片/CSS 变量/关键字
  if (/^(transparent|none|currentColor|inherit|initial|unset)$/i.test(value)) return true;
  if (/url\s*\(|var\s*\(/.test(value)) return true;
  const resolved = resolveVars(value, lessVars);
  if (/@/.test(resolved)) return true; // 变量解析不出 → fail-open
  const norm = normalizeCss(resolved);
  if (truthSet.has(norm)) return true;
  if (/gradient\(/.test(norm) && truthSet.has(normalizeCss(stripGradientAngle(norm)))) return true;
  // hex → rgba 双形态比较
  const hexM = /#[0-9a-f]{3,8}/i.exec(resolved);
  if (hexM) {
    const asRgba = hexToRgbaCss(hexM[0]);
    if (asRgba && truthSet.has(normalizeCss(asRgba))) return true;
    // 含 hex 的渐变：把每个 stop 色转 rgba 后再比 stops
    if (/gradient\(/.test(resolved)) {
      const converted = resolved.replace(/#[0-9a-f]{3,8}/gi, (h) => hexToRgbaCss(h) || h);
      const n2 = normalizeCss(stripGradientAngle(converted));
      if (truthSet.has(n2)) return true;
    }
    return false;
  }
  // rgba()/rgb() 字面量直接比（normalizeCss 已归一空白）
  if (/^rgba?\(/.test(norm) || /gradient\(/.test(norm)) return false;
  return true; // 其它形态（命名色等）fail-open
}

const BG_DECL_RE = /(^|;)(\s*)(background(?:-color)?\s*:\s*)([^;]+)(?=;|$)/g;

/**
 * 无来源背景剥除主体。扫 .vue <style> 块与 common.less；返回变更留痕。
 * @returns {{ files, changes: Array<{file:string, selector:string|null, value:string}> }}
 */
export function stripTruthlessBackgrounds(files, { figmaRoot, logger } = {}) {
  const changes = [];
  if (!files || typeof files !== 'object' || !figmaRoot) return { files, changes };
  const truthSet = collectBackgroundTruthSet(figmaRoot);
  if (truthSet.size === 0) return { files, changes };

  const lessVars = (() => {
    const merged = new Map();
    for (const [p, c] of Object.entries(files)) {
      if (typeof c === 'string' && /theme-vars\.less$/.test(p)) {
        for (const [k, v] of parseLessVars(c)) if (!merged.has(k)) merged.set(k, v);
      }
    }
    return merged;
  })();

  const stripFromCss = (css, file) => {
    let out = css;
    // 按规则块处理，留痕选择器；顶层与嵌套块同样处理（剥声明不拆结构）
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    out = out.replace(ruleRe, (whole, selector, body) => {
      if (!/background(?:-color)?\s*:/.test(body)) return whole;
      const nextBody = body.replace(BG_DECL_RE, (decl, lead, ws, prop, value) => {
        if (hasBackgroundTruthSource(value, { truthSet, lessVars })) return decl;
        changes.push({ file, selector: selector.trim().slice(0, 120), value: value.trim() });
        return lead + ws; // 剥除整条声明，保留规则体其它内容
      });
      return nextBody === body ? whole : `${selector}{${nextBody}}`;
    });
    return out;
  };

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    if (/\.vue$/.test(path)) {
      let next = content.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (whole, open, body, close) => {
        const stripped = stripFromCss(body, path);
        return stripped === body ? whole : open + stripped + close;
      });
      if (next !== content) files[path] = next;
    } else if (/common\.less$/.test(path)) {
      const next = stripFromCss(content, path);
      if (next !== content) files[path] = next;
    }
  }

  if (changes.length > 0) {
    logger?.warn?.(`🛡️ M1 无来源背景剥除 bgTruthlessStripped=${changes.length}`, {
      items: changes.slice(0, 8),
    });
  }
  return { files, changes };
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
  // 🔴 P3（2026-11-03）索引形状容错 —— 本仓有**两个** `indexFigmaNodes`：
  //   本模块的（条目 `{node, parentId}`）与 `section-tree.js` 的（条目
  //   `{id, name, type, bbox, parentId, rawNode}`）。折叠段接管器（刀 53）用的是后者
  //   ⇒ 只读 `entry.node` 时 `sec` 为 undefined，`:205` 立刻 TypeError **崩溃**
  //   （真机只要命中一个 icon/header 叶就崩；单测因夹具用的是**合成 id**
  //   `…-tail-text` 提前 `return null` 而完全测不到 —— 假绿）。
  //   `rawNode` 与 `node` 是同一节点的原始引用，语义等价 ⇒ 取其一，不引入第二套口径。
  const sec = entry.node || entry.rawNode;
  if (!sec) return null;
  const secArea = areaOf(sec.absoluteBoundingBox);
  if (!secArea) return null;
  // 段自身是否横跨父级（判「面板必须 width:100%」，纯几何、命名无关）
  const parentEntry =
    entry.parentId != null ? figmaIndex.get(String(entry.parentId)) : null;
  const parentBox = (parentEntry?.node || parentEntry?.rawNode)?.absoluteBoundingBox;
  const fullWidth =
    Number(parentBox?.width) > 0 && Number(sec.absoluteBoundingBox?.width) / parentBox.width >= 0.95;
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
      fullWidth,
      ...(kind === 'gradient' ? { angleGuessed: !hasGradientHandles(child.fills) } : {}),
    };
  }
  return null;
}

/**
 * 🛡️ P3（2026-11-03）—— 面板「三件套」→ inline 声明 **唯一来源**。
 *
 * 为什么必须抽出来（根因）：刀 53 的**终裁覆写**在 `file-writer.js` 用
 * `_fgTakeoverFiles` 快照**整包替换** sanitizedContent；该快照拍在
 * `microcode-engineer.js:2012`（LLM 分块**之前**），而刀 37/42 的
 * `healContainerBackgroundTruth` 跑在 `:8539`（快照**之后**）⇒ **接管文件上的 heal
 * 修复被整包回滚**。全库实测：fg 接管元素里 icon `0/110`、header `0/219` 携带背景
 * —— 即「同一个病（面板底色/圆角/发光缺失）在新机制（刀 53）下系统性复发」。
 *
 * 治本 = 接管渲染器**自持**面板真值，与 heal 共用下面这组构造器 ⇒
 * **禁止**在 `folded-grid-section-takeover.js` 或任何地方另写
 * `border-radius:${r}px` / `box-shadow:${s}` 之类的副本（第二套口径 = 分叉温床）。
 *
 * 逐项判据与 heal 内的 `decls.push(...)` **逐字一致**（改这里 = 同时改 heal，
 * 两侧任一改动必须同步跑两态回归）。
 */
export const panelDeclBackground = (value) => (value ? `background:${value}` : null);
export const panelDeclRadius = (panel) =>
  Number(panel?.radius) > 0 ? `border-radius:${panel.radius}px` : null;
export const panelDeclShadow = (panel) => (panel?.shadow ? `box-shadow:${panel.shadow}` : null);
export const panelDeclWidth = (panel) => (panel?.fullWidth ? 'width:100%' : null);

/**
 * 面板三件套（+ 满宽）→ 完整 inline CSS 片段（`;` 连接、无尾分号）。无 panel ⇒ `''`。
 * 顺序与 heal 的 `decls` 拼装顺序严格一致：background → border-radius → box-shadow → width。
 *
 * @param {object|null} panel `resolveSectionPanel()` 结果
 * @param {{ background?: string }} [opts] 背景值覆盖（方向不可证时由调用方合并角度后传入）
 * @returns {string}
 */
export function buildPanelInlineCss(panel, opts = {}) {
  if (!panel) return '';
  const bg = opts.background !== undefined ? opts.background : panel.css;
  return [
    panelDeclBackground(bg),
    panelDeclRadius(panel),
    panelDeclShadow(panel),
    panelDeclWidth(panel),
  ]
    .filter(Boolean)
    .join(';');
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
    // 只认规则体**顶层（depth 0）**的声明：嵌套后代规则里的属性属于后代，不能记到本 class
    // 头上。否则 `.a { .a-item { background: X } }` 会把 X 误记成 `.a` 的背景
    // （刀 32 实锤：`.c-device-grid { … .c-device-grid-item { background: @color-grid-row-bg } }`
    // 被读成 `.c-device-grid` 自有白底 ⇒ 颜色归属律假阳性）。字符串/注释里的花括号
    // 与括号配对本身同样不识别，属既有同等限制，此处不额外处理。
    let top = '';
    let d = 0;
    for (let j = 0; j < body.length; j++) {
      const ch = body[j];
      if (ch === '{') d++;
      else if (ch === '}') d--;
      else if (d === 0) top += ch;
    }
    const hit = propRx.exec(top);
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

  // 🛡️ M1：无来源背景剥除（真值源相同、不新增 pass、不改顺序）。
  // 必须在刀37/42 主循环**之后**执行：让「渐变写错=mismatch / 主题变量豁免」等既有判据
  // 先定性，M1 只清残余臆造，不改变既有 reason 语义（两态回归实锤）。
  const runTruthlessStrip = () => {
    const stripped = stripTruthlessBackgrounds(files, { figmaRoot, logger: arguments[1]?.logger });
    for (const c of stripped.changes) {
      changes.push({ file: c.file, sectionId: null, reason: 'truthless-bg', selector: c.selector, removedValue: c.value });
    }
  };

  // ① 全量 section 面板真值（底色 + 圆角 + 发光；同样供「借用了谁的背景」反查）
  const bgBySection = new Map(); // secId → { css, kind, layerId, radius, shadow }
  for (const id of figmaIndex.keys()) {
    const panel = resolveSectionPanel(id, figmaIndex);
    if (panel) bgBySection.set(id, panel);
  }
  if (bgBySection.size === 0) {
    // 纯 IMAGE 填充组件（无 SOLID/GRADIENT 面板真值）恰恰最需要 M1：底色全在图里，
    // 任何字面量背景都是臆造。早退前仍执行剥除。
    runTruthlessStrip();
    return { files, changes, skipped: [{ reason: 'no-bg-truth' }] };
  }

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
    width: collectClassProp(css, 'width'),
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
          decls.push(panelDeclBackground(bgValue));
          reasons.push(reason);
        }
      }

      // ── ② 圆角（⑥）：只补「inline 与任何 class 都没声明」的，已声明值一律尊重
      //   （子项常与父项共用 class，改写会波及别的元素 —— 双身份教训）
      if (truth.radius > 0 && !/\bborder-radius\s*:/.test(inlineStyle)) {
        const declaredR = classes.some((cls) => declaredProp(cls, 'border-radius', propMaps));
        if (!declaredR) {
          decls.push(panelDeclRadius(truth));
          reasons.push('missing-radius');
        }
      }

      // ── ③ 外发光（⑦）：figma 面板底的 SHADOW effects（三段金/绿/青 INNER_SHADOW）
      if (truth.shadow && !/\bbox-shadow\s*:/.test(inlineStyle)) {
        const declaredS = classes.some((cls) => declaredProp(cls, 'box-shadow', propMaps));
        if (!declaredS) {
          decls.push(panelDeclShadow(truth));
          reasons.push('missing-glow');
        }
      }

      // ── ④ 宽度（⑧）：面板横跨父级（宽 ≥ 父 95%）且没声明 width ⇒ 补 100%
      //   病灶：父级 `align-items:flex-start` 不拉伸 + 面板无 width ⇒ 面板缩成内容宽
      //   （真机 mc-1792635568116：战略段金面板只有半幅宽）。用 `(^|;)` 锚定，
      //   避免把 `min-width` 误判成已声明 width。
      if (truth.fullWidth && !/(?:^|;)\s*width\s*:/.test(inlineStyle)) {
        const declaredW = classes.some((cls) => declaredProp(cls, 'width', propMaps));
        if (!declaredW) {
          decls.push(panelDeclWidth(truth));
          reasons.push('missing-width');
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

  runTruthlessStrip();
  return { files, changes };
}
