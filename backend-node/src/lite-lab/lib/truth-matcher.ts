/**
 * lite-lab · 真值匹配回填器（纯函数，无 IO，可离线 jest）
 *
 * 职责：给定 Figma TEXT/图片真值清单与 lite 产物 SFC 文本，
 * 用「文本锚点」做确定性匹配，并把颜色 / 字号 /（可选）尺寸回填进模板内联样式。
 *
 * 判据单一来源：本文件的 stats 是唯一口径，消费方（service）只透传，不得再算第二套。
 * 0 也必须打：evaluated=0 时 stats 照常输出，禁止静默。
 */

export interface FigmaTextTruth {
  nodeId: string;
  characters: string;
  fontSize?: number;
  /** css 颜色值（hex 或 rgba），无 SOLID fill 时缺省 */
  color?: string;
  width?: number;
  height?: number;
  /** 🆕 画布绝对坐标（几何包含判据用：叶子填充矩形 ↔ 文本归属） */
  x?: number;
  y?: number;
}

export interface FigmaAssetTruth {
  nodeId: string;
  name: string;
  imageRef?: string;
  /** 下载到 .cache/resources 后的文件名（service 层组装） */
  fileName?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /**
   * 🆕 资源挂载锚点：该图片节点**直接父容器**内的 TEXT 文案（父无文本时取祖父一层）。
   * Figma 树内「图标与文本同父」⇒ DOM 侧把 <img> 插到对应文本命中元素旁（确定性，不用 AI 定位）。
   */
  siblingTexts?: string[];
  /** 🆕 bg 结构锚定（83cfb20e 实锤）：父容器**整子树**文本（如设备卡 group 的
   *  ['摄像机','(2/484)']）。整图 bg（卡底图）siblingTexts 常为空，本字段是确定性
   *  结构锚点——service 层拼成确定性 candidate 喂 aiAnchorBackgroundAssets。 */
  parentTexts?: string[];
  /** 🆕 E2N（2026-11-05）：该资源的**直接父容器** nodeId（容器级判定与映射查表用） */
  parentId?: string;
  /**
   * 🆕 容器级资源判定：资源 bbox ≈ 父容器 bbox（±1px）⇒ 它是「容器整块底图」，
   * 挂载点必须是**父容器映射到的产物元素**（而不是某个子元素/状态变体）。
   * 证据完全在 Figma 内部（两侧 bbox 相等），不依赖产物 CSS 里 LLM 写的任何数值。
   */
  containerLevel?: boolean;
  /**
   * 🆕 tx 通道真值（2026-11-06）：直接父容器的 bbox。
   * 与 `containerLevel=true` 合起来才构成「这张图与它的 Figma 容器同尺寸」这条事实 ⇒
   * 产物里该 img 的**专用包裹层**宽高必须等于 `width×height`（否则容器与图不一致 = 裁切/留白）。
   */
  parentBox?: { width: number; height: number };
  /**
   * 🆕 VECTOR 反哺条目的近邻文本（不进模板锚点路径——数据驱动产物模板是插值，
   * 文本锚点必 noAnchor；仅供空 icon 字段按「对象 name」语义锚定用）。
   */
  nearbyTexts?: string[];
  /**
   * 🆕 Q2 容器色真值：图片节点直接父容器的 SOLID fill。
   * undefined = 父容器无 SOLID fill（透明）——icon wrap 臆造深蓝底 → transparent 的判据来源。
   */
  parentFill?: { color: string; opacity: number } | null;
}

export interface TruthInventory {
  texts: FigmaTextTruth[];
  assets: FigmaAssetTruth[];
  /** 容器节点总数（观测用） */
  containerCount: number;
  /** 🆕 Q2 容器 fill 真值：带 SOLID fill 且子树含 ≥1 文本的容器（文本锚定换色用） */
  containers: FigmaContainerTruth[];
  /**
   * 🆕 叶子填充矩形（背景板）真值（2026-11-06）。
   *
   * 为什么单开一类而不复用 `containers`：
   *   `containers` 的锚点是「**直接子级** TEXT」（刻意的：防「后代 badge 被白 header 误吸」）。
   *   但 Figma 里极常见的画法是「bg 矩形 + 内容平级兄弟」——矩形是**叶子**、没有子级文本
   *   ⇒ childTexts 恒空 ⇒ 被 `containers.filter(childTexts.length>0)` 整批丢弃 ⇒ 背景色漏回。
   *   真机（mc-lab-1793898003372-63cc238e）：
   *     · 36:1695 RECTANGLE #e1ebff = 「产品描述」卡的底 → 产物写成 #FFFFFF
   *     · 36:1694 RECTANGLE「bg」GRADIENT_LINEAR #d4e3ff→#c1d6ff = 整屏底 → 产物 transparent
   *     · 36:1727/1728 = 缩略图底两块
   *   采集口径只认 Figma 内部事实（bbox / fills），不看产物 CSS。
   */
  fillRects: FigmaFillRectTruth[];
}

/**
 * 叶子填充矩形（背景板）真值。
 *
 * 锚点用**几何覆盖**而非父子关系：文本 bbox 中心落在矩形内 ⇒ 该文本归此矩形；
 * 多个矩形重叠时归**面积最小**者（最 specific）——36:1694 覆盖全屏，但 36:1695 更小，
 * 「产品描述」两段文本归 36:1695，36:1694 只留其余文本（与视觉层级一致）。
 */
export interface FigmaFillRectTruth {
  nodeId: string;
  name: string;
  /** 画布绝对坐标（px） */
  bbox: { x: number; y: number; width: number; height: number };
  /** 纯色 CSS 值（`#rrggbb` / `rgba()`）；与 gradient 互斥 */
  color?: string;
  /** 渐变 CSS 值（`linear-gradient(180deg, #d4e3ff 0%, #c1d6ff 100%)`） */
  gradient?: string;
  /** 几何覆盖的文本（已按「最小包裹」归属，已归一化） */
  coveredTexts: string[];
}

/** Figma 容器 fill 真值（Q2 容器色回填采集项） */
export interface FigmaContainerTruth {
  nodeId: string;
  name: string;
  /** SOLID fill 色（#rrggbb）；opacity < 0.05 视为无 fill 不采集 */
  color: string;
  /** 子树全部 TEXT 文本（锚定产物元素用） */
  childTexts: string[];
}

export interface BackfillEdit {
  tag: string;
  anchorText: string;
  figmaNodeId: string;
  matchType: 'exact' | 'substr';
  applied: Record<string, string>;
  beforeStyle: string | null;
  /** 内部字段：开标签起点（应用替换用），对外序列化时剔除 */
  _pos?: number;
  /** 内部字段：原开标签长度 */
  _oldLen?: number;
  /** 内部字段：替换后的完整开标签 */
  _newOpenTag?: string;
}

export interface FileBackfillResult {
  path: string;
  changed: boolean;
  edits: BackfillEdit[];
  /** 回填后的完整文件内容（changed=false 时与输入一致） */
  content: string;
}

export interface BackfillOptions {
  applyColor?: boolean;
  applyFontSize?: boolean;
  applySizes?: boolean;
}

export interface BackfillStats {
  /** 进入匹配流程的 figma 文本数 */
  evaluated: number;
  /** 归一化后长度 <2，跳过 */
  shortSkipped: number;
  /** 模板插值 {{ }} 文本，无法静态匹配，跳过 */
  interpSkipped: number;
  exact: number;
  substr: number;
  miss: number;
  colorApplied: number;
  fontSizeApplied: number;
  sizeApplied: number;
}

export interface BackfillResult {
  files: FileBackfillResult[];
  stats: BackfillStats;
}

/** 归一化：去掉所有空白（含全角），比对用 */
export function normalizeAnchorText(s: string): string {
  return String(s || '')
    .replace(/[\s\u3000]+/g, '')
    .trim();
}

function figmaColorToCss(fill: any): string | undefined {
  if (!fill || fill.type !== 'SOLID' || !fill.color) return undefined;
  const { r, g, b } = fill.color;
  const a = typeof fill.opacity === 'number' ? fill.opacity : fill.color.a ?? 1;
  const to255 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  if (a >= 0.99) {
    const hex = (v: number) => to255(v).toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  return `rgba(${to255(r)},${to255(g)},${to255(b)},${Number(a.toFixed(2))})`;
}

/** 节点首个可见 SOLID fill（opacity < 0.05 视为无）；模块级供采集与父链查询共用 */
function solidFillOfNode(node: any): { color: string; opacity: number } | undefined {  const fill = Array.isArray(node.fills)
    ? node.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false)
    : undefined;
  if (!fill) return undefined;
  const opacity = typeof fill.opacity === 'number' ? fill.opacity : 1;
  if (opacity < 0.05) return undefined;
  const color = figmaColorToCss(fill);
  return color ? { color, opacity } : undefined;
}

/**
 * 节点首个可见渐变 fill → CSS 渐变值（单一实现，采集与计划共用）。
 *
 * 为什么必须还原成 CSS 渐变，而不是"导出成 png 当底图"：
 *   Figma 会把渐变节点渲染成位图（真机 36:1694 = RECTANGLE「bg」603×555，子树零 IMAGE fill
 *   却含 GRADIENT_LINEAR）——那种 png 是**渲染结果**不是切图资源，挂 url() 语义就错了
 *   （层级也不对：alpha 是渐变末段透明 + 节点 opacity 合成，不是"半透明蒙层"）。
 *
 * 角度：Figma 给 3 个归一化 handle（0=起 1=止），方向向量 (dx,dy)，画布 y 轴向下；
 *   CSS `linear-gradient(<deg>)` 的 0deg = 向上、顺时针 → deg = atan2(dx, -dy)。
 *   两端 handles 重合（径向/角度渐变）时退回 180deg（to bottom）。
 */
export function gradientFillToCss(node: any): string | undefined {
  const fill = Array.isArray(node?.fills)
    ? node.fills.find((f: any) => typeof f?.type === 'string' && f.type.startsWith('GRADIENT_') && f.visible !== false)
    : undefined;
  if (!fill) return undefined;
  const stops = (fill.gradientStops ?? [])
    .map((s: any) => {
      const c = figmaColorToCss({ type: 'SOLID', color: s?.color });
      if (!c) return undefined;
      const p = Number(s?.position);
      return `${c} ${Math.round((Number.isFinite(p) ? p : 0) * 100)}%`;
    })
    .filter((x: string | undefined): x is string => !!x);
  if (stops.length < 2) return undefined;
  const h = fill.gradientHandlePositions;
  let deg = 180;
  if (Array.isArray(h) && h.length >= 2) {
    const dx = Number(h[1]?.x) - Number(h[0]?.x);
    const dy = Number(h[1]?.y) - Number(h[0]?.y);
    if (Number.isFinite(dx) && Number.isFinite(dy) && (dx !== 0 || dy !== 0)) {
      deg = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);
    }
  }
  if (fill.type === 'GRADIENT_RADIAL') return `radial-gradient(circle, ${stops.join(', ')})`;
  if (fill.type === 'GRADIENT_ANGULAR') return `conic-gradient(from ${deg}deg, ${stops.join(', ')})`;
  return `linear-gradient(${deg}deg, ${stops.join(', ')})`;
}

/**
 * 按节点 id 查其直接父容器的 SOLID fill（Q2 VECTOR 反哺条目补 parentFill 用）。
 * 返回 undefined = 节点不存在；null = 父无 SOLID fill（透明）；对象 = 真值色。
 */
export function findParentFillById(
  root: any,
  nodeId: string,
): { color: string; opacity: number } | null | undefined {
  const dfs = (node: any, parent: any): { color: string; opacity: number } | null | undefined => {
    if (!node || typeof node !== 'object') return undefined;
    if (node.id === nodeId) {
      if (!parent) return null;
      return solidFillOfNode(parent) ?? null;
    }
    for (const c of node.children ?? []) {
      const r = dfs(c, node);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  return dfs(root, undefined);
}

/**
 * 整子树文本（递归、去重、trim、剔空）——bg 结构锚定的底层取词口径。
 */
export function subtreeTextsOf(root: any): string[] {
  const out: string[] = [];
  const rec = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'TEXT' && typeof n.characters === 'string') {
      const t = n.characters.trim();
      if (t && !out.includes(t)) out.push(t);
    }
    for (const c of n.children ?? []) rec(c);
  };
  rec(root);
  return out;
}

/** 节点索引缓存（同一棵树多次调用只建一次） */
const nodeIndexCache = new WeakMap<object, { parentOf: Map<any, any>; byId: Map<string, any> }>();

function nodeIndexOf(root: any): { parentOf: Map<any, any>; byId: Map<string, any> } {
  const cached = nodeIndexCache.get(root);
  if (cached) return cached;
  const parentOf = new Map<any, any>();
  const byId = new Map<string, any>();
  const stack: any[] = [root];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;
    if (typeof n.id === 'string') byId.set(n.id, n);
    for (const c of n.children ?? []) {
      if (c && typeof c === 'object') { parentOf.set(c, n); stack.push(c); }
    }
  }
  const idx = { parentOf, byId };
  nodeIndexCache.set(root, idx);
  return idx;
}

/**
 * 「最近有文本祖先」的整子树文本 —— bg 结构锚定的**唯一取词来源**（判据单一来源）。
 *
 * 从 `nodeId` 的父节点起上溯，最多 `hops`（默认 3）跳，取第一个子树含文本的祖先；
 * 返回其整子树文本（上限 `cap` 默认 12 条，防爬到整页把全页文本当锚点）。
 * 全链无文本 → 空数组（**不臆造锚点**）。
 *
 * 🔴 为什么不是「直接父容器的直接 TEXT 子节点」（83cfb20e 实锤）：
 * 整图卡底图的文本常在孙层（图标/名称/计数的子 frame），直接父下没有 TEXT 兄弟，
 * 旧口径 `siblingTexts` 恒空 ⇒ AI 兜底只能靠 vision 猜 label。
 * 🔴 为什么 ≤3 跳：`g-8421` 一路走 3 跳会抓到整页头区文本，必须设上限。
 */
export function collectAncestorTexts(
  root: any,
  nodeId: string,
  opts: { hops?: number; cap?: number } = {},
): string[] {
  const hops = opts.hops ?? 3;
  const cap = opts.cap ?? 12;
  const { parentOf, byId } = nodeIndexOf(root);
  let cur = parentOf.get(byId.get(nodeId));
  for (let hop = 0; hop < hops && cur; hop += 1) {
    const t = subtreeTextsOf(cur);
    if (t.length > 0) return t.slice(0, cap);
    cur = parentOf.get(cur);
  }
  return [];
}

/** 资源在 Figma 树里的父容器元信息（E2N 容器级判定的证据源） */
export interface AssetParentMeta {
  parentId?: string;
  parentBox?: { width: number; height: number };
  /** 资源 bbox ≈ 父容器 bbox（±tol）⇒ 容器整块底图 */
  containerLevel: boolean;
  /** 最近有文本祖先的整子树文本（与 collectAncestorTexts 同口径） */
  parentTexts: string[];
}

/**
 * 一次取全资源的父容器元信息：`parentId` / `containerLevel` / `parentTexts`。
 *
 * 🔴 为什么容器级判定只看**两侧 bbox**：产物侧 CSS（`height:26px` / `background:#6B6B6B`）
 * 都是 LLM 视觉分析产出的，拿它当授权证据等于用幻觉确认幻觉。而「资源尺寸 = 父容器尺寸」
 * 是 Figma 内部事实，与产物无关——它能唯一区分「容器整块底图」与「卡内某状态胶囊」
 * （6e59a0d4 实锤：bg-7890 295×27 = tabs-list 295×27 → 容器级；bg-tab-active 78×21 → 元素级）。
 */
export function collectAssetParentMeta(
  root: any,
  nodeId: string,
  opts: { tolPx?: number } = {},
): AssetParentMeta {
  const tol = opts.tolPx ?? 1;
  const { parentOf, byId } = nodeIndexOf(root);
  const node = byId.get(nodeId);
  const parent = node ? parentOf.get(node) : undefined;
  const parentTexts = collectAncestorTexts(root, nodeId);
  if (!parent) return { containerLevel: false, parentTexts };
  const nb = node.absoluteBoundingBox ?? {};
  const pb = parent.absoluteBoundingBox ?? {};
  const containerLevel =
    typeof nb.width === 'number' && typeof nb.height === 'number' &&
    typeof pb.width === 'number' && typeof pb.height === 'number' &&
    Math.abs(nb.width - pb.width) <= tol &&
    Math.abs(nb.height - pb.height) <= tol;
  return {
    parentId: typeof parent.id === 'string' ? parent.id : undefined,
    parentBox:
      typeof pb.width === 'number' && typeof pb.height === 'number'
        ? { width: pb.width, height: pb.height }
        : undefined,
    containerLevel,
    parentTexts,
  };
}

/**
 * 从 Figma fetchNodeData 返回的节点树收集真值清单。
 * 只收集确定性字段（L0 级）：characters / style.fontSize / SOLID fills / absoluteBoundingBox。
 */
export function collectFigmaTruth(root: any): TruthInventory {  const texts: FigmaTextTruth[] = [];
  const assets: FigmaAssetTruth[] = [];
  const containers: FigmaContainerTruth[] = [];
  /** 待补 childTexts 的容器（walk 时子树未遍历完，walk 后统一回填） */
  const pendingContainers: Array<{ entry: FigmaContainerTruth; node: any }> = [];
  let containerCount = 0;

  const siblingTextsOf = (parent: any): string[] =>
    Array.isArray(parent?.children)
      ? parent.children
          .filter((c: any) => c?.type === 'TEXT' && typeof c.characters === 'string')
          .map((c: any) => c.characters)
      : [];

  /** 节点首个可见 SOLID fill（复用模块级 solidFillOfNode） */
  const solidFillOf = (node: any) => solidFillOfNode(node);

  const walk = (node: any, parent: any, grandparent: any) => {
    if (!node || typeof node !== 'object') return;
    const bbox = node.absoluteBoundingBox;
    if (node.type === 'TEXT') {
      const t: FigmaTextTruth = {
        nodeId: node.id,
        characters: String(node.characters ?? ''),
      };
      const fontSize = node.style?.fontSize;
      if (typeof fontSize === 'number' && fontSize > 0) t.fontSize = fontSize;
      const fill = Array.isArray(node.fills)
        ? node.fills.find((f: any) => f.type === 'SOLID' && f.visible !== false)
        : undefined;
      const color = figmaColorToCss(fill);
      if (color) t.color = color;
      if (bbox) {
        t.width = Math.round(bbox.width);
        t.height = Math.round(bbox.height);
        // 🆕 几何归属判据（叶子填充矩形 ↔ 文本）：必须带原点，否则无法判"是否在矩形内"
        t.x = Math.round(bbox.x);
        t.y = Math.round(bbox.y);
      }
      texts.push(t);
      return;
    }
    const imageFill = Array.isArray(node.fills)
      ? node.fills.find((f: any) => f.type === 'IMAGE' && f.visible !== false)
      : undefined;
    if (imageFill) {
      // 兄弟文本锚点：直接父容器优先，父无文本取祖父一层
      const sib = siblingTextsOf(parent);
      const a: FigmaAssetTruth = {
        nodeId: node.id,
        name: String(node.name ?? ''),
        imageRef: imageFill.imageRef,
        width: bbox ? Math.round(bbox.width) : undefined,
        height: bbox ? Math.round(bbox.height) : undefined,
        siblingTexts: sib.length > 0 ? sib : siblingTextsOf(grandparent),
        // 🆕 Q2：父容器 SOLID fill（undefined=透明；供 icon-wrap 臆造底色纠正）
        parentFill: parent ? solidFillOf(parent) ?? null : undefined,
      };
      // 🆕 bg 结构锚定（83cfb20e 实锤）：整图 bg 的 siblingTexts 常为空（父容器下没有
      // 直接 TEXT 兄弟，文本都在孙层）。取「最近的有文本祖先（≤3 跳）」的整子树文本作
      // 确定性结构锚点——与反哺路径**共用** collectAssetParentMeta（判据单一来源）。
      const pMeta = node.id ? collectAssetParentMeta(root, String(node.id)) : undefined;
      if (pMeta?.parentTexts.length) a.parentTexts = pMeta.parentTexts;
      if (pMeta?.parentId) a.parentId = pMeta.parentId;
      if (pMeta) a.containerLevel = pMeta.containerLevel;
      // tx 通道：父容器 bbox（与 containerLevel 合用才算「容器与图同尺寸」这条事实齐备）
      if (pMeta?.parentBox) a.parentBox = pMeta.parentBox;
      // 几何锚点补充：bbox 原点（svg 占位替换路径按 (y,x) 排序与产物占位对位）
      if (bbox) {
        a.x = Math.round(bbox.x);
        a.y = Math.round(bbox.y);
      }
      assets.push(a);
    }
    containerCount += 1;
    // 🆕 Q2 容器采集：本节点有 SOLID fill 且（walk 后）子树含文本 → 进 containers
    if (node.id) {
      const fill = solidFillOf(node);
      if (fill) {
        const entry: FigmaContainerTruth = {
          nodeId: node.id,
          name: String(node.name ?? ''),
          color: fill.color,
          childTexts: [],
        };
        containers.push(entry);
        pendingContainers.push({ entry, node });
      }
    }
    if (Array.isArray(node.children)) {
      for (const c of node.children) walk(c, node, parent);
    }
  };
  walk(root, undefined, undefined);
  // 回填直接子文本（🔴 非递归——子树文本会让「后代 badge 挂在白 header」被误吸，
  // 真机实锤：#FF4D4F 红角标被 #ffffff header 容器换白。直接子对齐才保证「同一元素」）
  for (const { entry, node } of pendingContainers) {
    for (const c of node.children ?? []) {
      if (c?.type === 'TEXT' && typeof c.characters === 'string') {
        const t = normalizeAnchorText(c.characters);
        if (t.length >= 2) entry.childTexts.push(t);
      }
    }
  }
  return { texts, assets, containerCount, containers: containers.filter((c) => c.childTexts.length > 0), fillRects: collectFillRects(root, texts) };
}

/**
 * 采集「叶子填充矩形」= 背景板（2026-11-06）。
 *
 * 判据（全部是 Figma 内部事实，不看产物）：
 *   ① 节点是**叶子**（无子节点）且非 TEXT —— 有子节点的填充框已由 `containers` 通道覆盖，
 *      且"直接子文本"判据在那里更精确；叶子矩形一定是"垫在别人下面的底板"。
 *   ② 有可见 SOLID fill 或 GRADIENT_* fill（IMAGE fill 属资源通道，不在此列）。
 *   ③ 几何覆盖 ≥1 个 TEXT（bbox 中心落入矩形）——覆盖不到文本的纯装饰块无可锚定的落点，
 *      不采集（否则会产出无处可落的计划条目）。
 *
 * 归属：同一文本被多个矩形覆盖时归**面积最小**者。真机 36:1694（603×555 整屏渐变）
 * 与 36:1695（产品描述卡底）都覆盖描述文本，归小的那个 —— 与视觉层级一致；
 * 36:1694 因此只剩其余 28 条文本，锚点自然落到根容器。
 */
function collectFillRects(root: any, texts: FigmaTextTruth[]): FigmaFillRectTruth[] {
  interface Leaf { node: any; bbox: { x: number; y: number; width: number; height: number }; color?: string; gradient?: string }
  const leaves: Leaf[] = [];
  const walkLeaf = (n: any) => {
    if (!n || typeof n !== 'object') return;
    const bbox = n.absoluteBoundingBox;
    const isLeaf = !Array.isArray(n.children) || n.children.length === 0;
    if (
      isLeaf &&
      n.type !== 'TEXT' &&
      bbox &&
      Number(bbox.width) > 0 &&
      Number(bbox.height) > 0
    ) {
      const gradient = gradientFillToCss(n);
      const solid = solidFillOfNode(n);
      if (gradient || solid?.color) {
        leaves.push({
          node: n,
          bbox: { x: Number(bbox.x), y: Number(bbox.y), width: Number(bbox.width), height: Number(bbox.height) },
          color: solid?.color,
          gradient,
        });
      }
    }
    for (const c of n.children ?? []) walkLeaf(c);
  };
  walkLeaf(root);
  if (leaves.length === 0) return [];

  const areas = leaves.map((l) => l.bbox.width * l.bbox.height);
  const covered: string[][] = leaves.map(() => []);
  for (const t of texts) {
    if (typeof t.x !== 'number' || typeof t.y !== 'number') continue;
    const cx = t.x + (t.width ?? 0) / 2;
    const cy = t.y + (t.height ?? 0) / 2;
    let best = -1;
    for (let i = 0; i < leaves.length; i += 1) {
      const b = leaves[i].bbox;
      if (cx < b.x || cx > b.x + b.width || cy < b.y || cy > b.y + b.height) continue;
      if (best < 0 || areas[i] < areas[best]) best = i;
    }
    if (best < 0) continue;
    const key = normalizeAnchorText(t.characters);
    if (key.length >= 2 && !covered[best].includes(key)) covered[best].push(key);
  }

  const out: FigmaFillRectTruth[] = [];
  leaves.forEach((l, i) => {
    if (covered[i].length === 0) return;
    out.push({
      nodeId: String(l.node.id ?? ''),
      name: String(l.node.name ?? ''),
      bbox: l.bbox,
      ...(l.color ? { color: l.color } : {}),
      ...(l.gradient ? { gradient: l.gradient } : {}),
      coveredTexts: covered[i],
    });
  });
  return out;
}

/**
 * 按节点 id 尾段反查节点 id（`icon-7945.png` → '7945' → '2:7945'）。
 * 用于「下载侧反哺真值清单」：VECTOR 图标无 IMAGE fill，collectFigmaTruth 收不到，
 * 但 downloadAssets（命名启发式）能导出 PNG——文件名后缀即来源节点 id 尾段。
 */
export function findNodeIdBySuffix(root: any, suffix: string): string | undefined {
  if (!suffix) return undefined;
  let hit: string | undefined;
  const walk = (node: any): void => {
    if (hit || !node || typeof node !== 'object') return;
    if (typeof node.id === 'string' && node.id.endsWith(`:${suffix}`)) {
      hit = node.id;
      return;
    }
    for (const c of node.children ?? []) walk(c);
  };
  walk(root);
  return hit;
}

/** 按 id 精确查节点（反哺条目补几何用：absoluteBoundingBox → width/height） */
export function findNodeById(root: any, id: string): any | undefined {
  if (!root || typeof root !== 'object') return undefined;
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const hit = findNodeById(c, id);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * 每个节点的「近邻文本」上下文：父层 TEXT 字符集（父无文本取祖父一层，与
 * collectFigmaTruth.siblingTexts 同口径）。全树仅存有文本的节点。
 * 用途：VECTOR 图标反哺真值清单时填充 siblingTexts，供产物空 icon 字段按
 * 「对象 name ↔ 图标近邻文本」做语义 zip（mc-lab-1793869911710：12 个设备卡
 * icon 字段 ↔ 15+ 下载图标，数量不等，几何 zip 不可行，语义锚定才精确）。
 */
export function buildNodeTextContext(root: any): Map<string, string[]> {
  const ctx = new Map<string, string[]>();
  const textsOf = (n: any): string[] =>
    Array.isArray(n?.children)
      ? n.children
          .filter((c: any) => c?.type === 'TEXT' && typeof c.characters === 'string')
          .map((c: any) => c.characters)
      : [];
  const walk = (node: any, parent: any, grandparent: any): void => {
    if (!node || typeof node !== 'object') return;
    if (node.type !== 'TEXT' && node.id) {
      const sib = textsOf(parent);
      const texts = sib.length > 0 ? sib : textsOf(grandparent);
      if (texts.length > 0) ctx.set(String(node.id), texts);
    }
    for (const c of node.children ?? []) walk(c, node, parent);
  };
  walk(root, undefined, undefined);
  return ctx;
}

/**
 * 🆕 2026-11-05 实锤（mc-lab-1793865328825）：downloadAssets 下载的是命名启发式选中的
 * **外层容器**（icon-8036），collectFigmaTruth 收集的是 IMAGE fill 所在**内层节点**（2:8037）
 * —— 两套节点 id 体系，任何节点 id 直接对齐都是死路。
 * 治本：对齐键改用 **imageRef**（同一张图 imageRef 必相同，Figma 确定性保证）。
 * 本函数为每个节点 id 建立其**子树内**首个 IMAGE fill 的 imageRef 索引：
 * 自身有 IMAGE fill 用自身的，否则继承首个后代——容器下载项（外层 group）即可映射到
 * 内层真值资产的 imageRef。
 */
export function buildImageRefIndex(root: any): Map<string, string> {
  const idx = new Map<string, string>();
  const walk = (node: any): string | undefined => {
    if (!node || typeof node !== 'object') return undefined;
    let own: string | undefined;
    if (Array.isArray(node.fills)) {
      const f = node.fills.find(
        (x: any) => x.type === 'IMAGE' && x.visible !== false && x.imageRef,
      );
      if (f) own = f.imageRef;
    }
    let sub: string | undefined;
    if (Array.isArray(node.children)) {
      for (const c of node.children) {
        const r = walk(c);
        if (r && !sub) sub = r;
      }
    }
    const ref = own ?? sub;
    if (ref && node.id) idx.set(String(node.id), ref);
    return ref;
  };
  walk(root);
  return idx;
}

interface LeafElement {
  tag: string;
  attrs: string;
  inner: string;
  /** 开标签在原串中的起止 */
  openStart: number;
  openEnd: number;
  styleValue: string | null;
}

const LEAF_RX = /<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)>([^<>]+)<\/\1>/g;

/**
 * 🔴 锚点解析必须限定在 <template>…</template> 之内：
 *   否则 <script>…</script> 里的纯文本代码行会被当成叶子元素文本参与匹配，
 *   真值 style 会错误注入到 <script>/<style> 标签上
 *   （真机实锤 mc-lab-1793861715204：`<script setup style="font-size:14px;…">`）。
 */
export function extractTemplateRange(content: string): { start: number; end: number } {
  const s = content.indexOf('<template');
  const e = content.lastIndexOf('</template>');
  if (s === -1 || e === -1) return { start: 0, end: content.length };
  return { start: s, end: e + '</template>'.length };
}

function parseLeafElements(content: string): {
  leaves: LeafElement[];
  interpCount: number;
} {
  const leaves: LeafElement[] = [];
  let interpCount = 0;
  let m: RegExpExecArray | null;
  LEAF_RX.lastIndex = 0;
  while ((m = LEAF_RX.exec(content)) !== null) {
    const inner = m[3];
    if (inner.includes('{{')) {
      interpCount += 1;
      continue;
    }
    const attrs = m[2] || '';
    const styleMatch = attrs.match(/\sstyle="([^"]*)"/);
    leaves.push({
      tag: m[1],
      attrs,
      inner,
      openStart: m.index,
      openEnd: m.index + m[0].indexOf('>') + 1,
      styleValue: styleMatch ? styleMatch[1] : null,
    });
  }
  return { leaves, interpCount };
}

function mergeStyleAttrs(
  attrs: string,
  additions: Record<string, string>,
): { attrs: string; before: string | null } {
  const styleMatch = attrs.match(/\sstyle="([^"]*)"/);
  const before = styleMatch ? styleMatch[1] : null;
  const base: Record<string, string> = {};
  if (before) {
    for (const decl of before.split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) base[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
    }
  }
  Object.assign(base, additions);
  const merged = Object.entries(base)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  if (styleMatch) {
    return { attrs: attrs.replace(/\sstyle="[^"]*"/, ` style="${merged}"`), before };
  }
  return { attrs: `${attrs} style="${merged}"`, before };
}

function buildStyleAdditions(
  truth: FigmaTextTruth,
  opts: Required<BackfillOptions>,
  existingStyle: string | null,
): Record<string, string> {
  const additions: Record<string, string> = {};
  const has = (prop: string) =>
    !!existingStyle && new RegExp(`(?:^|;)\\s*${prop}\\s*:`).test(existingStyle);
  if (opts.applyFontSize && typeof truth.fontSize === 'number' && !has('font-size')) {
    additions['font-size'] = `${truth.fontSize}px`;
  }
  if (opts.applyColor && truth.color && !has('color')) {
    additions['color'] = truth.color;
  }
  if (opts.applySizes && truth.width && !has('width')) {
    additions['width'] = `${truth.width}px`;
  }
  if (opts.applySizes && truth.height && !has('height')) {
    additions['height'] = `${truth.height}px`;
  }
  return additions;
}

/**
 * 主入口：对一组 SFC 文件做文本锚点匹配与回填。
 * 输入文件不落盘 —— 写盘由 service 层决定，本函数只返回新内容。
 */
export function backfillSfcFiles(
  files: Array<{ path: string; content: string }>,
  truth: TruthInventory,
  options: BackfillOptions = {},
): BackfillResult {
  const opts: Required<BackfillOptions> = {
    applyColor: options.applyColor !== false,
    applyFontSize: options.applyFontSize !== false,
    applySizes: options.applySizes === true,
  };
  const stats: BackfillStats = {
    evaluated: 0,
    shortSkipped: 0,
    interpSkipped: 0,
    exact: 0,
    substr: 0,
    miss: 0,
    colorApplied: 0,
    fontSizeApplied: 0,
    sizeApplied: 0,
  };

  // 每个文件独立解析（同一文本可能在多个文件出现，取首个命中文件）；
  // 解析范围限定 template 区段，_pos 记录区段内坐标，应用替换时加回偏移
  const parsed = files.map((f) => {
    const range = extractTemplateRange(f.content);
    return {
      ...f,
      range,
      ...parseLeafElements(f.content.slice(range.start, range.end)),
      edits: [] as BackfillEdit[],
      consumed: new Map<string, boolean>(),
    };
  });

  stats.interpSkipped = parsed.reduce((s, p) => s + (p as any).interpCount, 0);

  for (const t of truth.texts) {
    stats.evaluated += 1;
    const key = normalizeAnchorText(t.characters);
    if (key.length < 2) {
      stats.shortSkipped += 1;
      continue;
    }
    let hit:
      | { fileIdx: number; leaf: LeafElement; matchType: 'exact' | 'substr' }
      | undefined;
    for (let i = 0; i < parsed.length; i++) {
      const pf = parsed[i];
      if (pf.consumed.get(key)) break;
      const exact = pf.leaves.find(
        (l) => normalizeAnchorText(l.inner) === key && !pf.consumed.get(`${l.openStart}`),
      );
      if (exact) {
        hit = { fileIdx: i, leaf: exact, matchType: 'exact' };
        break;
      }
    }
    if (!hit) {
      // 子串回退：figma 短文本（如「51」）常被拆分进产物「51次」；
      // 取包含它的最短产物文本，避免误挂到大容器
      for (let i = 0; i < parsed.length; i++) {
        const pf = parsed[i];
        let best: LeafElement | undefined;
        for (const l of pf.leaves) {
          if (pf.consumed.get(`${l.openStart}`)) continue;
          const nk = normalizeAnchorText(l.inner);
          if (nk.includes(key) && (!best || l.inner.length < best.inner.length)) best = l;
        }
        if (best) {
          hit = { fileIdx: i, leaf: best, matchType: 'substr' };
          break;
        }
      }
    }
    if (!hit) {
      stats.miss += 1;
      continue;
    }
    const pf = parsed[hit.fileIdx];
    const additions = buildStyleAdditions(t, opts, hit.leaf.styleValue);
    if (Object.keys(additions).length === 0) {
      // 命中但无可回填字段：仍计入匹配命中，不算 miss
      pf.consumed.set(`${hit.leaf.openStart}`, true);
      if (hit.matchType === 'exact') stats.exact += 1;
      else stats.substr += 1;
      continue;
    }
    const { attrs, before } = mergeStyleAttrs(hit.leaf.attrs, additions);
    pf.edits.push({
      tag: hit.leaf.tag,
      anchorText: t.characters,
      figmaNodeId: t.nodeId,
      matchType: hit.matchType,
      applied: additions,
      beforeStyle: before,
      _pos: hit.leaf.openStart,
      _oldLen: hit.leaf.openEnd - hit.leaf.openStart,
      _newOpenTag: `<${hit.leaf.tag}${attrs}>`,
    });
    pf.consumed.set(`${hit.leaf.openStart}`, true);
    if (hit.matchType === 'exact') stats.exact += 1;
    else stats.substr += 1;
    for (const [k, v] of Object.entries(additions)) {
      if (k === 'color') stats.colorApplied += 1;
      else if (k === 'font-size') stats.fontSizeApplied += 1;
      else stats.sizeApplied += 1;
    }
  }

  // ⚠️ 位移问题：逐个 edit 就地改会因开标签长度变化让后续 index 失效。
  // 处理：对每个文件，按 openStart 从后往前应用 edits（_pos 为 template 区段内坐标）。
  const filesOut: FileBackfillResult[] = parsed.map((pf) => {
    let content = files.find((f) => f.path === pf.path)!.content;
    const sorted = [...pf.edits].sort(
      (a, b) => (b._pos ?? 0) - (a._pos ?? 0),
    );
    for (const e of sorted) {
      const abs = pf.range.start + (e._pos ?? 0);
      content = content.slice(0, abs) + e._newOpenTag + content.slice(abs + e._oldLen!);
    }
    return {
      path: pf.path,
      changed: pf.edits.length > 0,
      content,
      edits: pf.edits.map(({ tag, anchorText, figmaNodeId, matchType, applied, beforeStyle }) => ({
        tag,
        anchorText,
        figmaNodeId,
        matchType,
        applied,
        beforeStyle,
      })),
    };
  });

  return { files: filesOut, stats };
}

// ───────────────────────── 静态资源确定性挂载 ─────────────────────────

export interface AssetMountStats {
  /** 原始资产条数 */
  assetsTotal: number;
  /** 按 imageRef 去重后的独立图片数 */
  uniqueImageRefs: number;
  /** 已挂载（文本锚点 <img> 插入 + svg 占位替换）的独立图片数 */
  mounted: number;
  /** siblingTexts 为空，转入 svg 占位替换路径 */
  noSiblingTexts: number;
  /** 有锚点但产物文本未命中 */
  noAnchor: number;
  /** 文件未下载（fileName 缺失） */
  noFile: number;
  /** 🆕 svg 占位替换成功数（产物 <svg> 臆造图标 → Figma 真 icon <img>） */
  svgReplaced: number;
  /** 🆕 data-URI icon 字段替换成功数（mock 数据 icon: 'data:image/svg+xml,…' → import 标识符） */
  dataUriReplaced: number;
  /** 🆕 CSS 类占位替换成功数（iconClass 字段 + span :class 占位 → icon 字段 + <img>） */
  iconClassReplaced: number;
  /** 🆕 空 icon 变量回填数（const x = ref('') + <img :src="x"> → import 标识符） */
  emptyIconVarsReplaced: number;
  /** 🆕 空 icon 字段回填数（v-for 数组对象 icon: '' → 按对象 name 语义锚定 import 标识符） */
  emptyIconFieldsReplaced: number;
  /** 🆕 空 icon 对象属性回填数（const obj={prop:''} + <img :src="obj.prop"> → import 标识符） */
  emptyObjPropsReplaced: number;
  /** 🆕 第七形态：模板静态 src="../resources/images/x.png" 重写为 :src 绑定 + import 的处数 */
  staticSrcRewritten?: number;
  /** 🆕 新元素插入数（产物零引用 + 唯一文本锚 ⇒ 锚点前插 <img>，含空元素替换） */
  newElementInserted: number;
  /** 🆕 新元素插入放弃：锚文本在模板无命中或多命中（歧义），保守不动 */
  newElSkipNoAnchor: number;
  /** 🆕 新元素插入放弃：锚文本命中多个叶子 */
  newElSkipAmbiguous: number;
  /** 🆕 svg 占位替换失败数（占位数与资产数不匹配等，保守跳过） */
  svgSkipped: number;
  /** 🆕 bg-* 背景图命名↔结构锚定替换成功数 */
  bgAnchored: number;
  /** 🆕 bg-* 放弃：产物无包含核心段的类名 */
  bgSkipNoClass: number;
  /** 🆕 bg-* 放弃：核心段命中多个类（歧义） */
  bgSkipAmbiguous: number;
  /** 🆕 bg-* 放弃：命中类规则无既有 background 键（只换不插） */
  bgSkipNoBgKey: number;
  /** 🆕 bg-* 让位：规则体已含 url（E2N 结构通道先挂过 / 重跑幂等） */
  bgSkipAlreadyUrl: number;
  /** 🆕 img 标签注入真值尺寸（width/height style）数 */
  sizeRestored: number;
  /** 🆕 图片专用包裹层按 Figma 容器真值改写宽高（tx 通道）数 */
  containerSizeFixed: number;
  /** 🆕 父容器固定高度装不下子元素真值 ⇒ 抬 min-height 的次数 */
  parentBoxRelaxed: number;
}

export interface AssetMountResult {
  files: FileBackfillResult[];
  stats: AssetMountStats;
}

interface Insertion {
  /** 绝对坐标（原 content） */
  pos: number;
  /** 可选删除区间终点（pos..end 整段被 text 替换；svg 占位替换用） */
  end?: number;
  text: string;
}

function assetVarName(nodeId: string): string {
  return `labAsset_${nodeId.replace(/[^0-9a-zA-Z]/g, '_')}`;
}

export function importDepthFor(path: string): string {
  return path === 'package/index.vue' ? '../' : '../../';
}

function findAnchorLeaf(
  parsed: Array<{ leaves: LeafElement[]; consumed: Set<string> }>,
  siblingTexts: string[],
): { fileIdx: number; leaf: LeafElement } | undefined {
  const keys = siblingTexts
    .map((s) => normalizeAnchorText(s))
    .filter((k) => k.length >= 2);
  if (keys.length === 0) return undefined;
  // 先全文件 exact，再 substr 最短（与文本回填同一套锚点纪律）
  for (const key of keys) {
    for (let i = 0; i < parsed.length; i++) {
      const hit = parsed[i].leaves.find(
        (l) => normalizeAnchorText(l.inner) === key && !parsed[i].consumed.has(`${i}:${l.openStart}`),
      );
      if (hit) return { fileIdx: i, leaf: hit };
    }
  }
  for (const key of keys) {
    for (let i = 0; i < parsed.length; i++) {
      let best: LeafElement | undefined;
      for (const l of parsed[i].leaves) {
        const nk = normalizeAnchorText(l.inner);
        if (nk.includes(key) && (!best || l.inner.length < best.inner.length)) best = l;
      }
      if (best) return { fileIdx: i, leaf: best };
    }
  }
  return undefined;
}

/**
 * 确定性静态资源挂载：Figma 树内「图片节点与 TEXT 同父」⇒ 产物 DOM 侧
 * 把 <img> 插到对应文本命中元素之前，并在该文件 script 注入 import。
 * 纯函数：不读盘、不下载 —— 图片文件由 service 层预先拷到产物 resources/images/。
 */
export function mountAssetIcons(
  files: Array<{ path: string; content: string }>,
  assets: FigmaAssetTruth[],
): AssetMountResult {
  const stats: AssetMountStats = {
    assetsTotal: assets.length,
    uniqueImageRefs: 0,
    mounted: 0,
    noSiblingTexts: 0,
    noAnchor: 0,
    noFile: 0,
    svgReplaced: 0,
    dataUriReplaced: 0,
    iconClassReplaced: 0,
    emptyIconVarsReplaced: 0,
    emptyIconFieldsReplaced: 0,
    emptyObjPropsReplaced: 0,
    newElementInserted: 0,
    newElSkipNoAnchor: 0,
    newElSkipAmbiguous: 0,
    svgSkipped: 0,
    bgAnchored: 0,
    bgSkipNoClass: 0,
    bgSkipAmbiguous: 0,
    bgSkipNoBgKey: 0,
    bgSkipAlreadyUrl: 0,
    sizeRestored: 0,
    containerSizeFixed: 0,
    parentBoxRelaxed: 0,
  };

  // 按 imageRef 去重（同一图片在 Figma 里被多次引用只挂一次），保留首个有 fileName 的
  // 🆕 VECTOR 反哺条目无 imageRef（矢量无 IMAGE fill），以 nodeId 作去重键放行——
  //   有 fileName（文件实体已下载）即可挂载，2026-11-05 mc-lab-1793869911710 实锤
  const byRef = new Map<string, FigmaAssetTruth>();
  for (const a of assets) {
    if (!a.imageRef && !a.fileName) {
      stats.noFile += 1;
      continue;
    }
    const key = a.imageRef || `nid:${a.nodeId}`;
    const prev = byRef.get(key);
    if (!prev || (!prev.fileName && a.fileName)) byRef.set(key, a);
  }
  stats.uniqueImageRefs = byRef.size;

  const parsed = files.map((f) => {
    const range = extractTemplateRange(f.content);
    return {
      path: f.path,
      content: f.content,
      range,
      // 🔴 2026-11-05 实锤（mc-lab-1793862674851）：透传上游（文本回填）的 changed/edits，
      //   否则输出 filesOut 重算 changed ⇒ mount 无改动时文本回填结果被 service 层
      //   「只写 changed 文件」的逻辑整批丢弃（colorApplied>0 却 filesChanged=0）。
      inputChanged: (f as any).changed === true,
      inputEdits: (f as any).edits ?? [],
      ...parseLeafElements(f.content.slice(range.start, range.end)),
      imports: new Set<string>(),
      insertions: [] as Insertion[],
      // svg 占位替换/script 数组注入的编辑（与 insertions 统一重放，基准均为原 content）
      svgEdits: [] as Insertion[],
      consumed: new Set<string>(),
    };
  });

  // svg 占位替换路径的资产（无兄弟文本锚点，见 mc-lab-1793865328825：卡片行布局
  // icon-frame 与 text-frame 并列非同父，兄弟文本判据结构性失效）
  const svgPathAssets: FigmaAssetTruth[] = [];
  // bg-* 背景图走独立通道（命名↔结构锚定换 CSS background，见 mountBackgroundAssets）
  const bgPathAssets: FigmaAssetTruth[] = [];

  // 第七形态（2026-11-06 bdfba71d 实锤）：模板静态 src="../resources/images/x.png"。
  // Lite AI 定位路径的历史产物形态——静态相对路径是 HTML 属性，预览 vue3-sfc-loader
  // 只重写 script import 与 style url()，模板静态 src 两条管道都不经过 ⇒ 预览 404 破图。
  // 确定性重写：src 文件名 → truth.assets 锚定（fileName 精确匹配）→ import + :src 绑定；
  // 同名文件收敛单一 import（消灭 AI 路径 N 节点重复 import 同一文件的残留）。
  // 🔴 必须在其它消费通道（svg 占位/空变量/字段回填/新元素）之前执行：它是对账性
  //   修复（产物已有同文件 import ⇒ 复用既有变量名并标记 _consumed），先跑才能
  //   阻止空变量/字段通道对同一资产 zip 绑定后注入第二条 import（第二轮真机实锤：
  //   labAsset_48_5808 declared twice ⇒ SFC 校验告警）。
  rewriteStaticTemplateSrc(parsed, byRef, stats);

  for (const a of byRef.values()) {
    if (!a.fileName) {
      stats.noFile += 1;
      continue;
    }
    // 🔴 S2（bfac46ac 实锤）：路由收口到 classifyAsset 单一来源——bg- 前缀之外的
    //   大底图（image_313 459×29 走 icon 通道插成巨图炸 footer）与 decor（g- 决议
    //   只采集不消费，24468462 实锤被刀2 误消费）在此统一裁决。
    const cls = classifyAsset(a);
    if (cls === 'bg' || cls === 'strip') {
      bgPathAssets.push(a);
      continue;
    }
    if (cls === 'decor') {
      // g- 等装饰导出：既有决议只采集计数不消费；计入 svgSkipped 之外的可见缺口
      // （不静默吞——用 noSiblingTexts 之外的语义会误导排障，这里走 svg 路径让它
      //  自然落空，统计口径不变）
      stats.noSiblingTexts += 1;
      svgPathAssets.push(a);
      continue;
    }
    const sibs = (a.siblingTexts || []).filter((s) => normalizeAnchorText(s).length >= 2);
    if (sibs.length === 0) {
      // nearbyTexts-only 条目（VECTOR 反哺）也走此路径：字段语义锚定在兜底链里做，
      // 不进模板锚点（数据驱动产物模板是插值，文本锚点必 noAnchor——probe2 实锤）
      stats.noSiblingTexts += 1;
      svgPathAssets.push(a);
      continue;
    }
    const hit = findAnchorLeaf(parsed as any, sibs);
    if (!hit) {
      stats.noAnchor += 1;
      continue;
    }
    const pf = parsed[hit.fileIdx];
    const varName = assetVarName(a.nodeId);
    const rel = `${importDepthFor(pf.path)}resources/images/${a.fileName}`;
    pf.imports.add(`import ${varName} from '${rel}'`);
    const sizeStyle =
      a.width && a.height ? ` style="width:${a.width}px;height:${a.height}px"` : '';
    pf.insertions.push({
      pos: pf.range.start + hit.leaf.openStart,
      text: `<img class="lab-asset-img" :src="${varName}"${sizeStyle} />`,
    });
    pf.consumed.add(`${hit.fileIdx}:${hit.leaf.openStart}`);
    stats.mounted += 1;
  }

  if (svgPathAssets.length > 0) {
    mountBySvgPlaceholder(parsed, svgPathAssets, stats);
  }
  if (bgPathAssets.length > 0) {
    mountBackgroundAssets(parsed, bgPathAssets, stats);
  }

  const filesOut: FileBackfillResult[] = parsed.map((pf) => {
    let content = pf.content;
    // 统一重放：文本锚点插入（insertions）+ svg 占位替换/script 注入（svgEdits），
    // 全部基于原 content 坐标，从后往前应用防位移（end 区间 = 整段替换）
    const all = [...pf.insertions, ...pf.svgEdits].sort((a, b) => b.pos - a.pos);
    for (const ins of all) {
      content = content.slice(0, ins.pos) + ins.text + content.slice(ins.end ?? ins.pos);
    }
    // script import 注入：优先已有 </script> 前插；无 script 块则在 template 前新建
    if (pf.imports.size > 0) {
      const importBlock = `\n${[...pf.imports].join('\n')}\n`;
      const scriptClose = content.indexOf('</script>');
      if (scriptClose !== -1) {
        content = content.slice(0, scriptClose) + importBlock + content.slice(scriptClose);
      } else {
        const tplStart = content.indexOf('<template');
        content =
          `<script setup>\n${[...pf.imports].join('\n')}\n</script>\n` +
          (tplStart === -1 ? content : content.slice(tplStart));
      }
    }
    return {
      path: pf.path,
      // changed 合并上游标记：mount 改了 OR 上游（文本回填）改过
      changed:
        pf.insertions.length > 0 || pf.svgEdits.length > 0 || pf.imports.size > 0 || pf.inputChanged,
      content,
      edits: [...pf.inputEdits],
    };
  });

  return { files: filesOut, stats };
}

// ───────────────── bg-* 背景图命名↔结构锚定（CSS background 替换） ─────────────────

/**
 * 第七形态（2026-11-06 bdfba71d 实锤）：模板静态 `src="../resources/images/x.png"`。
 *
 * 背景：Lite AI 定位路径的历史产物把模板 img 写成静态相对路径——它是 HTML 属性，
 * 预览 vue3-sfc-loader 只重写 script import（handleModule→绝对 URL）与 style url()
 * （rewriteVueStyleAssetUrls），模板静态 src 两条管道都不经过 ⇒ 预览 404 破图。
 *
 * 判据（确定性，无 LLM）：模板静态 `src="../resources/images/<fileName>"`，
 * 按文件名精确锚定 truth.assets（same fileName；imageRef 去重后逐资产唯一）→
 *   ① img 标签 `src="..."` → `:src="labAsset_<nodeId>"`
 *   ② script 注入 `import labAsset_<nodeId> from '../resources/images/<fileName>'`
 *   ③ 同名文件收敛：多节点引用同一文件只保留首个命中资产的 import（`_consumed` 标记
 *      防后续通道重复消费），其余资产不再生成 import（模板侧本就只有一个静态 src 点）。
 * 统计：每重写一处 src 计 mounted +=1，归集 stats.staticSrcRewritten。
 */
function rewriteStaticTemplateSrc(
  parsed: Array<{
    path: string;
    content: string;
    imports: Set<string>;
    svgEdits: Insertion[];
    consumed: Set<string>;
  }>,
  byRef: Map<string, FigmaAssetTruth>,
  stats: AssetMountStats,
): void {
  // fileName → 首个命中资产（同文件收敛单一 import 源）
  const byFileName = new Map<string, FigmaAssetTruth>();
  for (const a of byRef.values()) {
    if (a.fileName && !byFileName.has(a.fileName)) byFileName.set(a.fileName, a);
  }
  // 🔴 与产物既有 import 对账（bdfba71d 第二轮实锤）：上一轮（AI 路径）残留的
  //   `import labAsset_x from '.../<fileName>'` 原样留在产物里，本轮若不感知就会
  //   对同一文件再注入一条 import ⇒ `Identifier has already been declared`（SFC
  //   校验告警、编译失败）。对账口径：产物中「from 路径含该 fileName」的既有
  //   import 变量名 → 该文件视为已声明（canonical 名取既有变量，保持产物自洽）；
  //   模板 :src 绑定一律指向 canonical 名。
  const existingImportRe =
    /import\s+(labAsset_\d+_\d+)\s+from\s+['"][^'"]*\/([^'"/]+)['"]/g;
  const declaredByFile = new Map<string, string>(); // fileName → canonical varName
  for (const pf of parsed) {
    let dm: RegExpExecArray | null;
    existingImportRe.lastIndex = 0;
    while ((dm = existingImportRe.exec(pf.content)) !== null) {
      const fn = dm[2];
      if (!declaredByFile.has(fn)) declaredByFile.set(fn, dm[1]);
    }
  }
  const srcRe = /\ssrc="(\.\.?\/resources\/images\/([^"]+))"/g;
  // 🔴 2026-11-06 67cd38d8 实锤：`:src="record.icon || '../resources/images/x.png'"`
  //   ——表达式内相对路径字面量（fallback 形态）。与静态 src= 同理不经任何重写管道
  //   ⇒ 预览 404。确定性锚同样是「路径即文件名」：抽字面量为 labAsset import，
  //   表达式改 `record.icon || labAsset_x`（record.icon 有值时用值，空时用真值图）。
  const exprLitRe =
    /(\|\|\s*)(['"])(\.\.?\/resources\/images\/([^'"]+))\2/g;

  for (const pf of parsed) {
    const edits: Insertion[] = [];
    let m: RegExpExecArray | null;
    while ((m = srcRe.exec(pf.content)) !== null) {
      const fileName = m[2];
      // canonical 变量名：优先产物既有声明（零新增 import）；否则按本轮资产造名
      const canonical = declaredByFile.get(fileName);
      const asset = byFileName.get(fileName);
      let varName: string;
      if (canonical) {
        varName = canonical;
        // 🔴 资产本体也标 _consumed（空变量/字段通道按资产对象过滤），pf.consumed
        //   只是本文件坐标记账——两个维度都要堵，否则空变量通道照样 zip 绑定
        //   同一资产并注入第二条 import（第二轮真机实锤 declared twice）。
        if (asset) (asset as any)._consumed = true;
      } else {
        if (!asset || !asset.nodeId) continue;
        if (pf.consumed.has(`nid:${asset.nodeId}`)) continue;
        varName = assetVarName(asset.nodeId);
        const depth = importDepthFor(pf.path);
        pf.imports.add(
          `import ${varName} from '${depth}resources/images/${fileName}'`,
        );
        pf.consumed.add(`nid:${asset.nodeId}`);
        (asset as any)._consumed = true;
      }
      // src 属性 → :src 绑定（整段替换，含前导空格原样保留）
      edits.push({
        pos: m.index,
        end: m.index + m[0].length,
        text: ` :src="${varName}"`,
      });
      stats.mounted += 1;
      stats.staticSrcRewritten = (stats.staticSrcRewritten ?? 0) + 1;
    }

    // 🔴 67cd38d8 形态：`:src="<expr> || '../resources/images/x.png'"` 表达式内
    //   fallback 字面量。抽成 labAsset import，表达式改 `<expr> || labAsset_x`。
    //   （对账纪律与静态 src 相同：产物已有同文件 import ⇒ 复用 canonical 名零新增。）
    while ((m = exprLitRe.exec(pf.content)) !== null) {
      const fileName = m[4];
      const canonical = declaredByFile.get(fileName);
      const asset = byFileName.get(fileName);
      let varName: string;
      if (canonical) {
        varName = canonical;
        if (asset) (asset as any)._consumed = true;
      } else {
        if (!asset || !asset.nodeId) continue;
        if (pf.consumed.has(`nid:${asset.nodeId}`)) continue;
        varName = assetVarName(asset.nodeId);
        const depth = importDepthFor(pf.path);
        pf.imports.add(
          `import ${varName} from '${depth}resources/images/${fileName}'`,
        );
        pf.consumed.add(`nid:${asset.nodeId}`);
        (asset as any)._consumed = true;
      }
      // `<expr> || '相对路径'` → `<expr> || labAsset_x`（整段替换引号字面量）
      edits.push({
        pos: m.index,
        end: m.index + m[0].length,
        text: `${m[1]}${varName}`,
      });
      stats.mounted += 1;
      stats.staticSrcRewritten = (stats.staticSrcRewritten ?? 0) + 1;
    }
    if (edits.length > 0) pf.svgEdits.push(...edits);
  }
}

/**
 * bg 文件名核心段提取（单一来源）：
 * `bg-tab-active-7891.png` → `tab-active`；`bg-7890.png` → `''`（纯 id 命名，语义缺失）。
 * mountBackgroundAssets（命名锚定）与 service 层 AI 兜底候选筛选共用此口径。
 * 🔴 尾部纯数字（`7890`）= Figma 节点 id 残留，不算语义——否则 AI 兜底筛选
 * `!bgFileNameCore()` 永不触发（spec 阳性对照实锤）。
 */
export function bgFileNameCore(fileName: unknown): string {
  const core = String(fileName ?? '')
    .replace(/^bg-/, '')
    .replace(/[-_]\d+(\.\w+)?$|\.png$/g, '')
    .trim();
  return /^\d+$/.test(core) ? '' : core;
}

/** 抽取产物全部 <style> 规则（坐标基于传入 content 绝对坐标，命名锚定与 AI 兜底共用） */
export interface CssStyleRule {
  bodyStart: number;
  bodyEnd: number;
  selNorm: string;
}

export function collectStyleRulesFromContent(content: string): CssStyleRule[] {
  const rules: CssStyleRule[] = [];
  const collect = (css: string, cssStart: number) => {
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let rm: RegExpExecArray | null;
    while ((rm = ruleRe.exec(css)) !== null) {
      rules.push({
        bodyStart: cssStart + rm.index + rm[1].length + 1,
        bodyEnd: cssStart + rm.index + rm[1].length + 1 + rm[2].length,
        selNorm: rm[1].replace(/--/g, '-'),
      });
    }
  };
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let sm: RegExpExecArray | null;
  let anyStyle = false;
  while ((sm = styleRe.exec(content)) !== null) {
    anyStyle = true;
    const cssStart = sm.index + sm[0].indexOf(sm[1]);
    collect(sm[1], cssStart);
  }
  // 🔴 裸 CSS 回退（478f0758 实锤）：预编译 resources/styles/index.css 是预览实际注入的
  // 样式源（微码预览剥 SFC style），回填通道必须同步它——无 <style> 块且非 SFC 时整文件即 CSS
  if (!anyStyle && !/<template[\s>]/.test(content)) {
    collect(content, 0);
  }
  return rules;
}

/** 投影组歧义判定（单一来源，83cfb20e 实锤补丁）：
 *  ① 剥 `.dark`/`.light` 主题前缀后存在多个不同逻辑选择器 → token 包含匹配的假阳性多命中 → 歧义；
 *  ② 同文件同原始选择器多条 → 真重复歧义；
 *  其余（跨文件投影 / 同文件主题副本 `.dark X` vs `X`）= 同一逻辑规则的投影，放行全量替换。 */
function projectionAmbiguous<T>(items: T[], pathOf: (t: T) => string, selOf: (t: T) => string): boolean {
  const themePrefixRe = /^(\.(?:dark|light)\s+)+/;
  const logic = new Set(items.map((t) => selOf(t).trim().replace(themePrefixRe, '')));
  if (logic.size > 1) return true;
  const byRaw = new Map<string, number>();
  for (const t of items) {
    const key = `${pathOf(t)}::${selOf(t).trim()}`;
    byRaw.set(key, (byRaw.get(key) ?? 0) + 1);
  }
  return [...byRaw.values()].some((n) => n > 1);
}

/**
 * bg-* 背景图消费（2026-11-05 grill 决议·方案丁主通道）：
 * 文件名核心段（`bg-tab-active-7891.png` → `tab-active`，剥前缀与尾部 id）
 * ↔ 产物 <style> 规则选择器类名（`--` 归一为 `-`）包含匹配。
 * 双闸门：全产物命中类唯一 + 规则体已有 background 键（只换已有键，不臆造）。
 * 替换 = 原色值后追加 url(...) center / 100% 100% no-repeat——background 不参与
 * 布局（不破坏布局红线），原色保留兜底。
 * 核心段为空（如 `bg-7890.png` 纯 id 命名）→ 语义缺失，保守放弃。
 */
function mountBackgroundAssets(
  parsed: any[],
  assets: FigmaAssetTruth[],
  stats: AssetMountStats,
): void {
  // 收集产物全部 <style> 规则
  const rulesByFile = parsed.map((pf) => collectStyleRulesFromContent(pf.content));
  const rules: Array<CssStyleRule & { pf: any }> = [];
  for (let i = 0; i < parsed.length; i++) {
    for (const r of rulesByFile[i]) rules.push({ ...r, pf: parsed[i] });
  }
  // 逐资产锚定（先全局判定唯一性，再替换；规则被先到资产消费后不再复用）
  const consumedRules = new Set<CssStyleRule & { pf: any }>();
  /** 尺寸锚定通道挂载（dea19159 实锤：bg-7890.png 295×26 = tabs 胶囊条整图，
   *  无语义核心段、siblingTexts 空、AI label 幻觉 → 三通道全灭。第四通道：
   *  真值 w×h ↔ 规则盒尺寸（height 精确相等 + width 有值时 ±2px + 已有 background 键），
   *  全产物唯一命中才挂。复用 bgAnchored/bgSkipAmbiguous/bgSkipNoClass 计数桶。 */
  const tryMountBySize = (a: FigmaAssetTruth): 'mounted' | 'ambiguous' | 'miss' => {
    const ah = Math.round(Number(a.height));
    const aw = Number(a.width);
    if (!ah || ah <= 0) return 'miss';
    const sizeHits = rules.filter((r) => {
      if (consumedRules.has(r)) return false;
      const body = r.pf.content.slice(r.bodyStart, r.bodyEnd);
      const hm = /(?<![-\w])height\s*:\s*(\d+(?:\.\d+)?)px/.exec(body);
      // Figma 真值常带浮点误差（26.9999995）→ round 后允许 ±1px
      if (!hm || Math.abs(Math.round(Number(hm[1])) - ah) > 1) return false;
      const wm = /(?<![-\w])width\s*:\s*(\d+(?:\.\d+)?)px/.exec(body);
      if (wm && Math.abs(Number(wm[1]) - aw) > 2) return false;
      return /\bbackground\s*:/.test(body);
    });
    if (sizeHits.length === 0) return 'miss';
    if (sizeHits.length > 1) return 'ambiguous';
    const rule = sizeHits[0];
    const body = rule.pf.content.slice(rule.bodyStart, rule.bodyEnd);
    const bgM = /\bbackground\s*:\s*[^;{}]+/.exec(body);
    if (!bgM) return 'miss';
    const depth = importDepthFor(rule.pf.path);
    const text = `${bgM[0].replace(/\s*$/, '')} url('${depth}resources/images/${a.fileName}') center / 100% 100% no-repeat`;
    rule.pf.svgEdits.push({
      pos: rule.bodyStart + bgM.index,
      end: rule.bodyStart + bgM.index + bgM[0].length,
      text,
    });
    consumedRules.add(rule);
    return 'mounted';
  };
  for (const a of assets) {
    const core = bgFileNameCore(a.fileName);
    if (!core) {
      // 无语义核心段（如 bg-7890.png 纯 id 命名）→ 尺寸通道兜底，不中才计数放弃
      const bySize = tryMountBySize(a);
      if (bySize === 'mounted') { stats.bgAnchored += 1; continue; }
      if (bySize === 'ambiguous') { stats.bgSkipAmbiguous += 1; continue; }
      stats.bgSkipNoClass += 1;
      continue;
    }
    const hits = rules.filter((r) => r.selNorm.includes(core) && !consumedRules.has(r));
    if (hits.length === 0) {
      // 有核心段但零命中 → 尺寸通道兜底（命名信号与几何信号互补）
      const bySize = tryMountBySize(a);
      if (bySize === 'mounted') { stats.bgAnchored += 1; continue; }
      if (bySize === 'ambiguous') { stats.bgSkipAmbiguous += 1; continue; }
      stats.bgSkipNoClass += 1;
      continue;
    }
    // 🔴 主题副本补丁（83cfb20e 实锤）：歧义判定走投影组单一来源——
    // 不同逻辑选择器多命中 / 同文件真重复 → 弃权；light+dark 主题副本 → 全投影挂载。
    if (projectionAmbiguous(hits, (r) => r.pf.path, (r) => r.selNorm)) {
      stats.bgSkipAmbiguous += 1;
      continue;
    }
    // 投影组逐条挂载：任一条无 background 键 → 整组弃权（与 AI 兜底 bgMs.some(!m) 口径一致）
    const bgMs: Array<{ rule: typeof hits[number]; bgM: RegExpExecArray } | undefined> = hits.map((rule) => {
      const body = rule.pf.content.slice(rule.bodyStart, rule.bodyEnd);
      const bgM = /\bbackground\s*:\s*[^;{}]+/.exec(body);
      return bgM ? { rule, bgM } : undefined;
    });
    if (bgMs.some((m) => !m)) {
      stats.bgSkipNoBgKey += 1;
      continue;
    }
    // 🔴 让位保护（E2N 结构通道提前到 C2 之前后必须）：规则体已含 url 时若再拼一条，
    //   `background: url(A) url(B)` 是 multiple background —— 两张图叠在一起。故直接跳过。
    if (bgMs.some((m) => m && /url\s*\(/i.test(m.bgM[0]))) {
      stats.bgSkipAlreadyUrl += 1;
      continue;
    }
    for (const m of bgMs as Array<{ rule: typeof hits[number]; bgM: RegExpExecArray }>) {
      const { rule, bgM } = m;
      const depth = importDepthFor(rule.pf.path);
      const text = `${bgM[0].replace(/\s*$/, '')} url('${depth}resources/images/${a.fileName}') center / 100% 100% no-repeat`;
      rule.pf.svgEdits.push({
        pos: rule.bodyStart + bgM.index,
        end: rule.bodyStart + bgM.index + bgM[0].length,
        text,
      });
    }
    for (const r of hits) consumedRules.add(r);
    stats.bgAnchored += 1;
    continue;
  }
}

// ───────────────── AI 背景图兜底（AI 只给「资产↔文字」候选，落点走确定性锚定） ─────────────────

/** AI 兜底候选：资产文件名 ↔ AI 在设计截图中读到的该容器可见文字 */
export interface BgAiCandidate {
  fileName: string;
  label: string;
}

export interface BgAiStats {
  /** 收到的候选数（确定性结构候选 + AI 候选合并后） */
  candidates: number;
  /**
   * 🆕 bg 结构锚定（83cfb20e）：由 Figma 真值 parentTexts/siblingTexts 直接拼出的
   * 确定性候选数。这部分**不依赖 vision**——vision 未配置/读图失败也能挂。
   */
  structCandidates?: number;
  /** 🆕 确定性候选覆盖掉 AI 同名候选的次数（结构真值 > AI 幻觉） */
  structOverrides?: number;
  anchored: number;
  /** label 在产物模板文本零命中（AI 幻觉或读图偏差） */
  skipNoLabelHit: number;
  /** 命中叶子无 class 属性 */
  skipNoClass: number;
  /** 命中叶子类名不一致（多卡片同名文字但容器类不同） */
  skipClassAmbiguous: number;
  /** 类名在 <style> 规则选择器零命中 */
  skipNoRule: number;
  /** 类名命中多条规则（歧义） */
  skipRuleAmbiguous: number;
  /** 命中规则体无既有 background 键（只换不插） */
  skipNoBgKey: number;
  /** background 已含 url（被命名锚定消费过） */
  skipAlreadyUrl: number;
  /** vision 调用/解析失败次数（非致命，service 层打日志） */
  errors: number;
  /** vision token 消耗合计 */
  totalTokens: number;
}

export interface BgAiResult {
  files: FileBackfillResult[];
  stats: BgAiStats;
}

/**
 * AI 背景图兜底消费（2026-11-05 立项：bg-7890 纯 id 命名无法命名锚定的兜底通道）。
 *
 * 判据纪律：AI 只提供「资产 ↔ 可见文字」候选，本函数把文字 → 模板叶子（严格归一化
 * 全等，拒绝子串/模糊）→ class → <style> 规则（与命名锚定同一套双闸门：
 * 唯一命中 + 已有 background 键才换值，只追加 url 不动几何）。
 * AI 文字不存在/不唯一 → skip 计数，绝不放宽。
 *
 * 纯函数：不读盘、不调 AI —— candidates 由 service 层调 vision 得到。
 * 操作的是 mountAssetIcons 回放后的最终 content（直接 splice，pos 降序应用）。
 */
export function aiAnchorBackgroundAssets(
  files: Array<{ path: string; content: string }>,
  candidates: BgAiCandidate[],
): BgAiResult {
  const stats: BgAiStats = {
    candidates: candidates.length,
    structCandidates: 0,
    structOverrides: 0,
    anchored: 0,
    skipNoLabelHit: 0,
    skipNoClass: 0,
    skipClassAmbiguous: 0,
    skipNoRule: 0,
    skipRuleAmbiguous: 0,
    skipNoBgKey: 0,
    skipAlreadyUrl: 0,
    errors: 0,
    totalTokens: 0,
  };

  interface AiEdit {
    path: string;
    pos: number;
    end: number;
    text: string;
    desc: string;
  }
  const edits: AiEdit[] = [];
  // 背景规则全产物先到先得（两个候选命中同一规则时后者放弃）
  const consumedRules = new Set<`${string}:${number}`>();
  const parsed0 = files.map((f) => ({ f, tree: parseTemplateTree(f.content) }));

  for (const cand of candidates) {
    const key = normalizeAnchorText(cand.label);
    if (key.length < 2) {
      stats.skipNoLabelHit += 1;
      continue;
    }
    // 🔴 2026-11-05 二代锚定（61c25280 实锤一代整串/单类失效）：
    // AI label 是**区域聚合串**（「总数:56302 隧道设备 异常数:5」），模板是分叶子 +
    // 区域容器。锚定改为：label 分词 → 逐词匹配模板叶子（树节点，ownText exact /
    // 双向包含）→ 命中节点集 → **最近公共祖先（LCA）= 区域容器** → 其类逐个找
    // 「token 唯一命中 + 纯色 background 键」的规则 → 换值挂 url。
    // 闸门不放宽：词零命中 skip；LCA 无类 skip；规则不唯一/无键/已 url skip。
    const words = cand.label.split(/\s+/).map((w) => normalizeAnchorText(w)).filter((w) => w.length >= 2);
    if (words.length === 0) {
      stats.skipNoLabelHit += 1;
      continue;
    }
    // 🔴🔴 033c5e0c 实锤三代锚定（插值产物 + 聚合 label 三断点）：
    // ① 数字是插值（{{ summaryLeft.total }}）→ ownText 零命中 → script 字面量当虚拟文本；
    //    字面量收集必须绑定**完整插值路径**（顶层对象 + 字段）——只按字段名全文收集会把
    //    左右卡同名对象（s.total/r.total）的字面量混成一锅，簇分离失效（spec 实锤）。
    // ② 聚合 label 的局部词（「总数:」）双卡同名全命中 → LCA 泛化到外层 wrap → 簇分离剔离群；
    // ③ LCA 类无 background 键直接放弃 → 沿祖先链回溯找真挂载点（卡容器）。
    const literalsCache = new Map<(typeof parsed0)[number], Map<string, Set<string>>>();
    const literalsOf = (pf: (typeof parsed0)[number], path: string): Set<string> => {
      let m = literalsCache.get(pf);
      if (!m) { m = new Map(); literalsCache.set(pf, m); }
      let s = m.get(path);
      if (!s) {
        s = new Set<string>();
        const parts = path.split('.');
        const top = parts[0];
        const field = parts[parts.length - 1];
        // 字段值采集：字符串（引号）与数字字面量都要（033c5e0c 实锤 total: 56302 无引号）
        const collectFrom = (block: string) => {
          const fre = new RegExp(`${field}\\s*:\\s*(?:['\"]([^'\"]+)['\"]|([\\d.]+))`, 'g');
          let fm: RegExpExecArray | null;
          while ((fm = fre.exec(block)) !== null) {
            const t = normalizeAnchorText(String(fm[1] ?? fm[2] ?? ''));
            if (t.length >= 2) s!.add(t);
          }
        };
        // 主口径：顶层对象绑定块内收集字段字面量（const|let|var top = { ... } 或
        // ref({ ... }) 包装——033c5e0c 实锤 const summaryLeft = ref({ total: 56302 })；
        // 平铺对象 [^{}] 近似，嵌套对象回退全文口径
        const objRe = new RegExp(`(?:const|let|var)\\s+${top}\\s*=\\s*(?:ref\\s*\\(\\s*)?\\{([^{}]*)\\}`, 'g');
        let om: RegExpExecArray | null;
        while ((om = objRe.exec(pf.f.content)) !== null) collectFrom(om[1]);
        // 回退口径（v-for 数组元素等无顶层绑定形态）：字段名全文收集
        if (s.size === 0) collectFrom(pf.f.content);
        m.set(path, s);
      }
      return s;
    };
    // 双向包含统一判据（033c5e0c 实锤补丁）：纯数字短串要求与长串**数字段全等**——
    // 「28」⊂「1280」这类数字截断会让 topStats.typeCount 误命中 bg-8807。
    // 🔴 严格档（c91f6190 实锤）：`strictDigit=true` 时，若一方含数字段而另一方不含，
    //   不算命中。聚合 label「总数:56302」与模板叶子「总 数:」（**两卡同名**）在宽松档
    //   会同时命中左右两卡 → LCA 泛化到 `.stat-cards`（无 background 键）→ skipNoBgKey；
    //   严格档要求数字段相容 ⇒「总数:56302」只与「56302」叶子成立，命中簇自然按卡分离。
    //   两轮匹配：严格档零命中时回退宽松档（不为精确度牺牲召回）。
    const wordsMatch = (a: string, b: string, strictDigit = false): boolean => {
      if (a === b) return true;
      const contained =
        (a.includes(b) || b.includes(a)) &&
        Math.min(a.length, b.length) >= 2 &&
        Math.max(a.length, b.length) >= 4;
      if (!contained) return false;
      const short = a.length <= b.length ? a : b;
      const long = a.length <= b.length ? b : a;
      if (/^\d+$/.test(short)) {
        const digits: string[] = long.match(/\d+/g) ?? [];
        return digits.includes(short);
      }
      if (strictDigit) {
        const ad: string[] = a.match(/\d+/g) ?? [];
        const bd: string[] = b.match(/\d+/g) ?? [];
        if (ad.length > 0 || bd.length > 0) {
          if (ad.length === 0 || bd.length === 0) return false;
          return ad.some((d) => bd.includes(d));
        }
      }
      return true;
    };
    // 叶子判定：插值虚拟文本只认叶子（033c5e0c 实锤——容器 div 的 seg 覆盖整个子树，
    // 后代插值全被算到容器头上，容器节点全部误命中 → 簇分离失效 → LCA 泛化到根）
    const leafNodes = new Set<TplTreeNode>();
    for (const pf of parsed0) {
      for (const n of pf.tree.nodes) {
        if (n.parent && n.parent.tag !== '#root') leafNodes.add(n.parent);
      }
    }
    const collectHits = (strictDigit: boolean) => {
      const hits: Array<{ node: TplTreeNode; pf: (typeof parsed0)[number] }> = [];
      for (const pf of parsed0) {
        for (const node of pf.tree.nodes) {
          if (node.tag === '#root') continue;
          let matched = false;
          const nk = normalizeAnchorText(node.ownText);
          if (nk.length >= 2) {
            for (const w of words) {
              if (wordsMatch(nk, w, strictDigit)) { matched = true; break; }
            }
          }
          // ① 插值虚拟文本：{{ x.prop }} 叶子节点用 script 字面量全集参与匹配（同判据）；
          //    interp 提取完整路径（顶层对象.字段），字面量按路径绑定收集
          if (!matched && !leafNodes.has(node) && (nk.includes('{{') || nk.length < 2)) {
            const seg = pf.f.content.slice(node.afterOpen, node.end);
            const interpRe = /\{\{\s*(\w+(?:\.\w+)*)\s*\}\}/g;
            let im: RegExpExecArray | null;
            while (!matched && (im = interpRe.exec(seg)) !== null) {
              for (const lit of literalsOf(pf, im[1])) {
                for (const w of words) {
                  if (wordsMatch(lit, w, strictDigit)) { matched = true; break; }
                }
                if (matched) break;
              }
            }
          }
          if (matched) hits.push({ node, pf });
        }
      }
      return hits;
    };
    // 🔴 两轮匹配（c91f6190 实锤）：先严格档（数字段相容）——能把双卡同名 label 分开时
    // 就分；严格档零命中才回退宽松档。排序保证「精确优先、召回不降」。
    let hitNodes = collectHits(true);
    if (hitNodes.length === 0) hitNodes = collectHits(false);
    if (hitNodes.length === 0) {
      stats.skipNoLabelHit += 1;
      continue;
    }
    // 🔴 长数字词定簇（c91f6190 实锤第二层）：严格档仍挡不住「无数字的同名词」——
    // 结构 label 分词后「总数:」是独立词（无数字）→ 依旧命中左右两卡 → LCA 又泛化到
    // `.stat-cards`（无 bg 键）。label 里的**长数字**（≥4 位）是区分同名卡最强的判别特征：
    // 命中节点里凡能与长数字词匹配的（如 56302 / 1280），以其为种子重定 LCA，
    // 余下的同名弱命中全部丢弃。无长数字词时保持原行为（不影响既有链路）。
    const digitWords = words.filter((w) => /\d{4,}/.test(w));
    if (digitWords.length > 0) {
      const seeds = hitNodes.filter((h) => {
        const nk = normalizeAnchorText(h.node.ownText);
        return digitWords.some((w) => wordsMatch(nk, w, true));
      });
      if (seeds.length > 0) hitNodes = seeds;
    }
    // LCA：两两求最近公共祖先
    const ancestorsOf = (n: TplTreeNode): TplTreeNode[] => {
      const chain: TplTreeNode[] = [];
      for (let cur: TplTreeNode | null = n; cur; cur = cur.parent) chain.push(cur);
      return chain;
    };
    // ② 簇分离：离群命中（少数派同名文本）会把 LCA 拉高到公共祖先；逐个试删——
    // 删除后 LCA 更具体（祖先链更长）且剩余 ≥2 → 永久剔除，循环到稳定。
    const lcaChainLen = (nodes: Array<{ node: TplTreeNode }>): number => {
      let l = nodes[0].node;
      for (let i = 1; i < nodes.length; i++) {
        const a = ancestorsOf(l);
        const bSet = new Set(ancestorsOf(nodes[i].node));
        l = a.find((x) => bSet.has(x)) ?? l;
      }
      return ancestorsOf(l).length;
    };
    if (hitNodes.length >= 3) {
      let changed = true;
      while (changed && hitNodes.length >= 3) {
        changed = false;
        const d0 = lcaChainLen(hitNodes);
        for (let i = 0; i < hitNodes.length; i++) {
          const rest = hitNodes.filter((_, j) => j !== i);
          if (lcaChainLen(rest) > d0) {
            hitNodes.splice(i, 1);
            changed = true;
            break;
          }
        }
      }
    }
    let lca = hitNodes[0].node;
    for (let i = 1; i < hitNodes.length; i++) {
      const a = ancestorsOf(lca);
      const bSet = new Set(ancestorsOf(hitNodes[i].node));
      lca = a.find((x) => bSet.has(x)) ?? lca;
    }
    if (!lca || lca.tag === '#root') {
      stats.skipNoClass += 1;
      continue;
    }
    // 类逐个找「token 唯一命中 + background 键」的规则（类前缀冲突防御）；
    // 🔴 ③ 渐变键放开（033c5e0c：卡容器臆造渐变正是要被真值 bg 图覆盖的对象）→
    // 挂载语义改多层：url 在上层、原渐变保留兜底（同层追加对渐变是非法 CSS）。
    const findBgRuleForClasses = (
      clsList: string[],
    ): {
      cls: string;
      hits: Array<{ file: { path: string; content: string }; rule: CssStyleRule }>;
      bodies: string[];
      bgMs: RegExpExecArray[];
      isGradient: boolean;
    } | undefined => {
      for (const cls of clsList) {
        const hits: Array<{ file: { path: string; content: string }; rule: CssStyleRule }> = [];
        // 🔴 cls 必须占据选择器「末端」（主体）才算强命中（033c5e0c 实锤）：
        // 后代选择器 `.card--light .icon-wrap` 同样被 cls `--light` token 命中 →
        // hits=2 判歧义 → 回溯越过卡容器误挂页面根。末端 = 匹配后剩余仅为
        // 非组合符修饰（伪类 :hover 等，[^\w-]*）；出现空格/>+~, 即为后代/链式。
        const c = cls.replace(/--/g, '-');
        const escEnd = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const endRe = new RegExp(`(^|[^\\w-])${escEnd}([^\\w-]*)$`);
        for (const f of files) {
          for (const rule of collectStyleRulesFromContent(f.content)) {
            if (classMatchesSelector(rule.selNorm, cls) && endRe.test(rule.selNorm.trim())) {
              hits.push({ file: f, rule });
            }
          }
        }
        if (hits.length === 0) continue;
        // 🔴 投影组语义（478f0758 实锤）：SFC + 预编译 index.css 同名规则 = 同一规则的
        // 多投影，全部替换。歧义判定走投影组单一来源 projectionAmbiguous：
        // endRe 末端锚定保证同 cls 的 hits 逻辑选择器唯一，此处主要防同文件真重复；
        // `.dark X`/`.light X` 主题副本（83cfb20e 实锤）不再是弃权理由。
        if (projectionAmbiguous(hits, (h) => h.file.path, (h) => h.rule.selNorm)) continue;
        const bodies = hits.map((h) => h.file.content.slice(h.rule.bodyStart, h.rule.bodyEnd));
        const bgMs = bodies.map((body) => /\bbackground\s*:\s*([^;{}]+)/.exec(body));
        if (bgMs.some((m) => !m)) continue;
        if (bgMs.some((m) => /url\s*\(/i.test(m![1]))) continue;
        return {
          cls,
          hits,
          bodies,
          bgMs: bgMs as RegExpExecArray[],
          isGradient: /gradient\s*\(/i.test(bgMs[0]![1]),
        };
      }
      return undefined;
    };
    // ③ 祖先回溯：LCA（常是文本行容器）无 bg 键时沿 parent 链找真挂载点（卡容器），
    // 到 #root 停——整链无键才 skipNoBgKey。
    let ruleHit: { cls: string; hits: Array<{ file: { path: string; content: string }; rule: CssStyleRule }>; bodies: string[]; bgMs: RegExpExecArray[]; isGradient: boolean } | undefined;
    for (let cur: TplTreeNode | undefined | null = lca; cur && cur.tag !== '#root'; cur = cur.parent) {
      const clsList = classesFromAttrs(cur.attrs);
      if (clsList.length === 0) continue;
      ruleHit = findBgRuleForClasses(clsList);
      if (ruleHit) break;
    }
    if (!ruleHit) {
      stats.skipNoBgKey += 1;
      continue;
    }
    if (
      ruleHit.hits.some((h) =>
        consumedRules.has(`${h.file.path}:${h.rule.bodyStart}` as `${string}:${number}`),
      )
    ) {
      stats.skipRuleAmbiguous += 1;
      continue;
    }
    // 投影组逐条替换：url 深度按各自文件位置解析（SFC → ../resources/images/，
    // index.css → ../images/）；渐变多层、纯色同层追加。
    for (let i = 0; i < ruleHit.hits.length; i++) {
      const h = ruleHit.hits[i];
      const bgM = ruleHit.bgMs[i];
      // url 深度按各自文件位置：SFC（package/）→ ../resources/images/；
      // 预编译 index.css（resources/styles/）→ ../images/（相对 images 只差一层）
      const imgBase =
        h.file.path === 'resources/styles/index.css'
          ? '../images/'
          : `${importDepthFor(h.file.path)}resources/images/`;
      const imgUrl = `url('${imgBase}${cand.fileName}') center / 100% 100% no-repeat`;
      const text = ruleHit.isGradient
        ? `background: ${imgUrl}, ${bgM[1].trim()}`
        : `${bgM[0].replace(/\s*$/, '')} ${imgUrl}`;
      edits.push({
        path: h.file.path,
        pos: h.rule.bodyStart + bgM.index,
        end: h.rule.bodyStart + bgM.index + bgM[0].length,
        text,
        desc: `bgAi:${cand.fileName}→.${ruleHit.cls}`,
      });
      consumedRules.add(`${h.file.path}:${h.rule.bodyStart}` as `${string}:${number}`);
    }
    stats.anchored += 1;
  }

  const filesOut: FileBackfillResult[] = files.map((f) => {
    const mine = edits.filter((e) => e.path === f.path).sort((a, b) => b.pos - a.pos);
    let content = f.content;
    for (const e of mine) {
      content = content.slice(0, e.pos) + e.text + content.slice(e.end);
    }
    return {
      path: f.path,
      changed: mine.length > 0,
      content,
      // BackfillEdit 形状不匹配本通道（此处只需计数），desc 缩写透传报告用
      edits: mine.map((e) => ({ desc: e.desc })) as any,
    };
  });
  return { files: filesOut, stats };
}

// ───────────────── Q2 容器 fill 真值回填（icon-wrap 臆造底色纠正 + 文本容器换色） ─────────────────

/** 简易模板树节点（栈式解析，足够支撑「img 父类」「元素子树文本」两类查询） */
export interface TplTreeNode {
  tag: string;
  /** 开标签完整属性串（class 与 :class 里的类名都从这里抓） */
  attrs: string;
  start: number;
  afterOpen: number;
  end: number; // 闭标签 `</tag>` 之后；自闭合/void = afterOpen
  ownText: string;
  parent: TplTreeNode | null;
  selfClosed: boolean;
}

const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'meta', 'link']);

/** 栈式解析 template 区间为节点树（不追求完整 HTML 语义，只保证父子/文本查询够用） */
export function parseTemplateTree(content: string): { root: TplTreeNode; nodes: TplTreeNode[] } {
  const tplRange = extractTemplateRange(content);
  const tpl = content.slice(tplRange.start, tplRange.end);
  const base = tplRange.start;
  const sentinel: TplTreeNode = {
    tag: '#root', attrs: '', start: base, afterOpen: base, end: base + tpl.length,
    ownText: '', parent: null, selfClosed: false,
  };
  const stack: TplTreeNode[] = [sentinel];
  const nodes: TplTreeNode[] = [];
  const tagRe = /<(\/?)([\w-]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(tpl)) !== null) {
    const [full, closing, tag, attrs, selfClose] = m;
    const absStart = base + m.index;
    // 标签间文本归栈顶
    if (m.index > last) {
      stack[stack.length - 1].ownText += tpl.slice(last, m.index).replace(/<[^>]*$/g, '');
    }
    last = m.index + full.length;
    if (closing) {
      // 弹栈到同名标签
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          for (let j = stack.length - 1; j >= i; j--) stack[j].end = absStart;
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const node: TplTreeNode = {
      tag,
      attrs: attrs || '',
      start: absStart,
      afterOpen: absStart + full.length,
      end: absStart + full.length,
      ownText: '',
      parent: stack[stack.length - 1],
      selfClosed: selfClose === '/' || VOID_TAGS.has(tag),
    };
    nodes.push(node);
    if (!node.selfClosed) stack.push(node);
  }
  return { root: sentinel, nodes };
}

/** 提取开标签属性串中的全部类名（class="a b" 与 :class="{ 'c': x }" 一并覆盖） */
function classesFromAttrs(attrs: string): string[] {
  const out: string[] = [];
  // 🔴🔴 只认「静态 class 值」+「:class 表达式内的字符串字面量」。
  // 旧实现 `["']([^"']*)["']` 对 attrs 全部引号内容无差别切词：
  // v-for="tab in tabs" 吸进 tab/in/tabs、:class="{ 'x--active': activeTab ... }"
  // 吸进 activeTab（61c25280 插值回退 spec 实锤 clsList=["tab","in","tabs",...,"activeTab"]），
  // clsList[0]（baseCls 语义）错位 → 规则零命中 → 插值回退整体黑洞。
  // 静态 class：class 前不得是绑定前缀（:class / v-bind:class 已被 : 或字母占据）
  const pushToks = (s: string) => {
    for (const tok of s.split(/\s+/)) {
      if (/^[a-zA-Z][\w-]*$/.test(tok)) out.push(tok);
    }
  };
  const staticRe = /(?<![:"'\w-])class\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = staticRe.exec(attrs)) !== null) pushToks(m[1]);
  // 动态 :class / v-bind:class：对象/数组语法，只取引号内字符串字面量
  const dynRe = /(?::class|v-bind:class)\s*=\s*"([^"]*)"/g;
  while ((m = dynRe.exec(attrs)) !== null) {
    const litRe = /['"]([^'"]+)['"]/g;
    let lm: RegExpExecArray | null;
    while ((lm = litRe.exec(m[1])) !== null) pushToks(lm[1]);
  }
  return out;
}

/** ContainerFill 计数（语义见接口字段注释） */
export interface ContainerFillStats {
  /** A 通道：icon-wrap 臆造纯色底 → transparent（父容器真值透明） */
  wrapTransparentized: number;
  /** A 通道：icon-wrap 换成父容器真值色 */
  wrapColorFixed: number;
  /** B 通道：文本容器 background 换真值色 */
  containerColorFixed: number;
  skipNoRule: number;
  skipAmbiguous: number;
  skipUrlOrGradient: number;
  skipSameColor: number;
  /** 评估的 img 父类分组数（A 通道） */
  wrapGroupsEvaluated: number;
  /** B 通道评估的类规则数 */
  containerRulesEvaluated: number;
}

export interface ContainerFillResult {
  files: FileBackfillResult[];
  stats: ContainerFillStats;
}

interface FillEdit {
  path: string;
  pos: number;
  end: number;
  text: string;
  desc: string;
}

/** 类名在规则选择器中的 token 级匹配：`.nav-item` 不得命中 `.nav-item-active`（前缀冲突）。
 * 边界 = 选择器组合符/行首行尾/伪类冒号等非 [\w-] 字符。
 * 🔴 cls 须与 selNorm 同口径归一（selNorm 已把 --→-，cls 不归一则 BEM 类永不命中）。 */
export function classMatchesSelector(selNorm: string, cls: string): boolean {
  const c = cls.replace(/--/g, '-');
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^\\w-])${esc}($|[^\\w-])`);
  return re.test(selNorm);
}

/** 规则体中 background 声明；返回 null = 无纯色 background（url/渐变/缺失均排除）。
 * 🔴 正则不吃尾分号（与 mountBackgroundAssets 同口径），替换后保留原分号。 */
function plainBackgroundDecl(body: string): { match: string; index: number; value: string } | null {
  const m = /\bbackground\s*:\s*([^;{}]+)/.exec(body);
  if (!m) return null;
  const value = m[1].trim();
  if (/url\s*\(/i.test(value)) return null;
  if (/gradient\s*\(/i.test(value)) return null;
  return { match: m[0], index: m.index, value };
}

/**
 * Q2 容器 fill 真值回填（2026-11-05 立项实施）。
 *
 * A 通道（icon-wrap 臆造底色）：产物 <img> 的父元素类 → <style> 规则纯色 background；
 * 该组 img 对应 Figma 资产的 parentFill 全体一致（unanimous，与 unanimousSize 同风格）：
 *   - 全透明（父容器无 SOLID fill）→ 替换为 `background: transparent`
 *   - 全同色 → 替换为真值色
 * 判据可辩驳：Figma 真值说父容器透明，产物却给了深蓝纯色 = lite 臆造。
 *
 * B 通道（文本容器换色）：truth.containers（SOLID fill + 子树文本）↔ 产物元素
 * （类规则 + 子树静态文本）按归一化文本交集唯一匹配 → background 换真值色。
 * 仅动纯色 background；url/渐变一律 skip（v1 不碰，stat 卡渐变+bg 图场景后续立项）。
 *
 * 纯函数：不读盘、不调 AI；替换 = 换值不写几何（不破坏布局红线）。
 */
export function backfillContainerFill(
  files: Array<{ path: string; content: string }>,
  truth: TruthInventory,
): ContainerFillResult {
  const stats: ContainerFillStats = {
    wrapTransparentized: 0,
    wrapColorFixed: 0,
    containerColorFixed: 0,
    skipNoRule: 0,
    skipAmbiguous: 0,
    skipUrlOrGradient: 0,
    skipSameColor: 0,
    wrapGroupsEvaluated: 0,
    containerRulesEvaluated: 0,
  };
  const edits: FillEdit[] = [];
  const consumedRules = new Set<string>();

  // 逐文件解析树 + 规则
  const parsed = files.map((f) => ({
    f,
    tree: parseTemplateTree(f.content),
    rules: collectStyleRulesFromContent(f.content),
  }));

  type C2cRuleHit = { pf: (typeof parsed)[number]; rule: CssStyleRule; body: string };
  // 🔴 投影组语义（478f0758 实锤）：SFC 与预编译 index.css 同名规则是**同一规则的两个投影**，
  // 必须同步替换；歧义只认「同文件多条」。跨文件同名不算歧义。
  const findRuleGroupByClass = (cls: string): C2cRuleHit[] | undefined => {
    const hits: C2cRuleHit[] = [];
    for (const pf of parsed) {
      for (const rule of pf.rules) {
        if (classMatchesSelector(rule.selNorm, cls)) {
          hits.push({ pf, rule, body: pf.f.content.slice(rule.bodyStart, rule.bodyEnd) });
        }
      }
    }
    if (hits.length === 0) return undefined;
    const byFile = new Map<string, number>();
    for (const h of hits) byFile.set(h.pf.f.path, (byFile.get(h.pf.f.path) ?? 0) + 1);
    if ([...byFile.values()].some((n) => n > 1)) return undefined;
    return hits;
  };

  // ── A 通道：img 父类分组 ──
  // 组键 = 父元素的首个 class（无 class 的 img 跳过）
  interface WrapGroup {
    cls: string;
    pf: (typeof parsed)[number];
    node: TplTreeNode;
  }
  const groups = new Map<string, WrapGroup>();
  for (const pf of parsed) {
    for (const n of pf.tree.nodes) {
      if (n.tag !== 'img') continue;
      const p = n.parent;
      if (!p || p.tag === '#root') continue;
      const cls = classesFromAttrs(p.attrs)[0];
      if (!cls) continue;
      const key = `${cls}`;
      if (!groups.has(key)) groups.set(key, { cls, pf, node: p });
    }
  }

  for (const g of groups.values()) {
    stats.wrapGroupsEvaluated += 1;
    const ruleGroup = findRuleGroupByClass(g.cls);
    if (!ruleGroup) {
      stats.skipNoRule += 1;
      continue;
    }
    if (ruleGroup.some((h) => consumedRules.has(`${h.pf.f.path}:${h.rule.bodyStart}`))) {
      stats.skipAmbiguous += 1;
      continue;
    }
    const decl = plainBackgroundDecl(ruleGroup[0].body);
    if (!decl) {
      stats.skipUrlOrGradient += 1;
      continue;
    }
    // 该组 img 关联的资产 parentFill 全体一致才动手：
    // ① 直接变量 :src="labAsset_X" → nodeId 尾段精确对应
    // ② 间接（v-for item.icon）→ 产物 script 全部 `icon[:=] labAsset_X` 全集
    const directIds = new Set<string>();
    const indirectIds = new Set<string>();
    for (const n of parsed) {
      // 直接 :src 绑定 img（按父类过滤）
      for (const node of n.tree.nodes) {
        if (node.tag !== 'img') continue;
        const p = node.parent;
        const pcls = p ? classesFromAttrs(p.attrs)[0] : undefined;
        if (pcls !== g.cls) continue;
        const srcM = /:src="([^"]+)"/.exec(node.attrs);
        const val = srcM?.[1] ?? '';
        const dm = /^labAsset_([\w]+)$/.exec(val);
        if (dm) directIds.add(dm[1]);
      }
      // 间接：script 里的 icon: labAsset_X 全集
      const scriptM = n.f.content.match(/icon\s*:\s*labAsset_([\w]+)/g);
      if (scriptM) {
        for (const s of scriptM) {
          const im = /labAsset_([\w]+)/.exec(s);
          if (im) indirectIds.add(im[1]);
        }
      }
    }
    const idSets = directIds.size > 0 ? [directIds] : indirectIds.size > 0 ? [indirectIds] : [];
    if (idSets.length === 0) {
      stats.skipAmbiguous += 1;
      continue;
    }
    const ids = idSets[0];
    // nodeId 归一（2:8444 → 2_8444）
    const relAssets = truth.assets.filter((a) => ids.has(String(a.nodeId).replace(/[^0-9a-zA-Z]/g, '_')));
    if (relAssets.length === 0) {
      stats.skipAmbiguous += 1;
      continue;
    }
    const fills = relAssets.map((a) => a.parentFill);
    const first = fills[0];
    // 🔴 unanimous 三态：null（全透明）/ {color}（全同色）/ undefined（混合或缺失 → 保守放弃）。
    // 全透明判定必须显式「每个都是 null」——first===null 短路会把混合误判成全透明（spec 实锤）。
    const unanimousFill =
      first === undefined
        ? undefined
        : fills.every((f) => f && first && f.color === first.color && f.opacity === first.opacity)
          ? first
          : fills.every((f) => f === null)
            ? null
            : undefined;
    // undefined = 混合（有的透明有的有色）→ 保守放弃
    if (unanimousFill === undefined) {
      stats.skipAmbiguous += 1;
      continue;
    }
    const target =
      unanimousFill === null ? 'transparent' : unanimousFill.color;
    if (decl.value === target) {
      stats.skipSameColor += 1;
      continue;
    }
    // 投影组逐条替换（SFC + 预编译 index.css 同步；组内各自定位 background 声明）
    for (const h of ruleGroup) {
      const d = plainBackgroundDecl(h.body);
      if (!d || d.value === target) continue;
      const absPos = h.rule.bodyStart + d.index;
      edits.push({
        path: h.pf.f.path,
        pos: absPos,
        end: absPos + d.match.length,
        text: `background: ${target}`,
        desc: `containerFill:${g.cls}→${target}`,
      });
      consumedRules.add(`${h.pf.f.path}:${h.rule.bodyStart}`);
    }
    if (unanimousFill === null) stats.wrapTransparentized += 1;
    else stats.wrapColorFixed += 1;
  }

  // ── B 通道：文本容器 ↔ 类规则 ──
  // 🔴 兼容旧 figma-truth.json 缓存（无 containers 字段）
  if ((truth.containers ?? []).length > 0) {
    const normContainers = (truth.containers ?? []).map((c) => ({
      color: c.color,
      texts: new Set(c.childTexts.map((t) => normalizeAnchorText(t)).filter((t) => t.length >= 2)),
    }));
    for (const pf of parsed) {
      for (const node of pf.tree.nodes) {
        if (node.tag === '#root' || node.tag === 'img') continue;
        const clsList = classesFromAttrs(node.attrs);
        if (clsList.length === 0) continue;
        let ownT = normalizeAnchorText(node.ownText);
        // 🔴 插值回退（61c25280 实锤：tab 深灰臆造底未被纠正——v-for 元素 ownText 为空，
        // 静态文本锚定结构性失效）：{{ x.prop }} → 在 script 中收集 `prop: '字面量'` 全集
        // 当虚拟文本，逐字面量匹配 Figma 容器（直接子文本相等）→ fill 分组裁决：
        //   单色 → 基础类换色；恰两种 → 众数→基础类、少数→修饰类（cls+--xxx，激活态语义）
        // 🔴🔴 门槛不能只看长度：v-for 按钮无子元素时 `{{ tab.label }}` 整段记入 ownText，
        // 归一化后 `{{tab.label}}` 长度≥2 → 误入静态分支（集合永不相等 → continue），
        // 插值分支结构性永不触发（dist TRACE 实锤 evaluated 全来自静态分支）。
        // 含 `{{` 的 ownText 就是插值字面文本，必须走插值分支。
        if (ownT.includes('{{') || ownT.length < 2) {
          const seg = pf.f.content.slice(node.afterOpen, node.end);
          const interpM = /\{\{\s*\w+\.(\w+)\s*\}\}/.exec(seg);
          if (!interpM) continue; // 🔴 观测：无插值的空 ownText 节点（div 壳等），结构性静默
          const prop = interpM[1];
          const literals = new Set<string>();
          const scriptM = pf.f.content.match(new RegExp(`${prop}\\s*:\\s*['\"]([^'\"]+)['\"]`, 'g'));
          if (!scriptM) continue;
          for (const s of scriptM) {
            const lm = new RegExp(`${prop}\\s*:\\s*['\"]([^'\"]+)['\"]`).exec(s);
            const t = lm ? normalizeAnchorText(lm[1]) : '';
            if (t.length >= 2) literals.add(t);
          }
          if (literals.size === 0) continue;
          // 字面量 → 容器 fill 收集
          const fillCount = new Map<string, number>();
          for (const lit of literals) {
            for (const c of normContainers) {
              if (c.texts.size === 1 && c.texts.has(lit)) {
                fillCount.set(c.color, (fillCount.get(c.color) ?? 0) + 1);
              }
            }
          }
          if (fillCount.size === 0 || fillCount.size > 2) continue;
          const entries = [...fillCount.entries()].sort((a, b) => b[1] - a[1]);
          // 基础类 = clsList 中首个有纯色 background 规则的类；修饰类 = `基础类--xxx`
          const plan: Array<{ cls: string; color: string }> = [];
          if (fillCount.size === 1) {
            plan.push({ cls: clsList[0], color: entries[0][0] });
          } else {
            const baseCls = clsList[0];
            const modCls = clsList.find((c) => c.startsWith(`${baseCls}--`));
            if (!modCls) plan.push({ cls: baseCls, color: entries[0][0] });
            else {
              plan.push({ cls: baseCls, color: entries[0][0] });
              plan.push({ cls: modCls, color: entries[1][0] });
            }
          }
          for (const { cls, color } of plan) {
            stats.containerRulesEvaluated += 1;
            const ruleGroup2 = findRuleGroupByClass(cls);
            if (!ruleGroup2) {
              stats.skipNoRule += 1;
              continue;
            }
            if (ruleGroup2.some((h) => consumedRules.has(`${h.pf.f.path}:${h.rule.bodyStart}`))) {
              continue;
            }
            const decl2 = plainBackgroundDecl(ruleGroup2[0].body);
            if (!decl2) {
              stats.skipUrlOrGradient += 1;
              continue;
            }
            if (decl2.value === color) {
              stats.skipSameColor += 1;
              continue;
            }
            for (const h of ruleGroup2) {
              const d = plainBackgroundDecl(h.body);
              if (!d || d.value === color) continue;
              const absPos = h.rule.bodyStart + d.index;
              edits.push({
                path: h.pf.f.path,
                pos: absPos,
                end: absPos + d.match.length,
                text: `background: ${color}`,
                desc: `containerFill:${cls}→${color} (interp)`,
              });
              consumedRules.add(`${h.pf.f.path}:${h.rule.bodyStart}`);
            }
            stats.containerColorFixed += 1;
          }
          continue;
        }
        // 🔴 与容器「直接子文本」同口径：只用元素自身直接文本（非子树）。
        // 子树文本会让 badge/角标这类「后代元素」被祖先容器误吸（真机实锤 #FF4D4F→#ffffff）。
        if (ownT.length < 2) continue;
        const segTexts = new Set<string>([ownT]);
        // 🔴 匹配判据 = 元素直接文本与容器 childTexts **归一化后完全一致**（集合相等）。
        // 「同一元素」必须语义全对齐，宁缺勿错。
        let best: { color: string; overlap: number } | undefined;
        let tie = false;
        for (const c of normContainers) {
          if (c.texts.size !== segTexts.size) continue;
          let overlap = 0;
          for (const t of segTexts) if (c.texts.has(t)) overlap += 1;
          if (overlap !== segTexts.size) continue;
          if (!best) {
            best = { color: c.color, overlap };
            tie = false;
          } else {
            tie = true;
          }
        }
        if (!best || tie) continue;
        // 该节点的每个类逐一找规则（类唯一命中才动）
        for (const cls of clsList) {
          stats.containerRulesEvaluated += 1;
          const ruleGroup = findRuleGroupByClass(cls);
          if (!ruleGroup) continue;
          if (ruleGroup.some((h) => consumedRules.has(`${h.pf.f.path}:${h.rule.bodyStart}`))) {
            continue;
          }
          const decl = plainBackgroundDecl(ruleGroup[0].body);
          if (!decl) {
            stats.skipUrlOrGradient += 1;
            continue;
          }
          if (decl.value === best.color) {
            stats.skipSameColor += 1;
            continue;
          }
          for (const h of ruleGroup) {
            const d = plainBackgroundDecl(h.body);
            if (!d || d.value === best.color) continue;
            const absPos = h.rule.bodyStart + d.index;
            edits.push({
              path: h.pf.f.path,
              pos: absPos,
              end: absPos + d.match.length,
              text: `background: ${best.color}`,
              desc: `containerFill:${cls}→${best.color}`,
            });
            consumedRules.add(`${h.pf.f.path}:${h.rule.bodyStart}`);
          }
          stats.containerColorFixed += 1;
        }
      }
    }
  }

  const filesOut: FileBackfillResult[] = files.map((f) => {
    const mine = edits.filter((e) => e.path === f.path).sort((a, b) => b.pos - a.pos);
    let content = f.content;
    for (const e of mine) {
      content = content.slice(0, e.pos) + e.text + content.slice(e.end);
    }
    return {
      path: f.path,
      changed: mine.length > 0,
      content,
      edits: mine.map((e) => ({ desc: e.desc })) as any,
    };
  });
  return { files: filesOut, stats };
}

// ───────────────── img 尺寸还原（真值 width/height → style 注入） ─────────────────

/** 共享标签（v-for 驱动）尺寸一致性裁决：全部资产尺寸一致且非空才可用 */
function unanimousSize(
  assets: FigmaAssetTruth[],
): { w: number; h: number } | undefined {
  if (assets.length === 0) return undefined;
  const w = assets[0].width;
  const h = assets[0].height;
  if (!w || !h) return undefined;
  return assets.every((a) => a.width === w && a.height === h) ? { w, h } : undefined;
}

/**
 * 向已有 <img ...> 标签注入 style="width:Xpx;height:Ypx"（img 自身尺寸不参与
 * 兄弟元素布局，符合「不破坏布局」红线——只动图片自己）。
 * 已有 width style 则跳过；返回是否注入。
 */
function injectImgSize(
  pf: any,
  tagRe: RegExp,
  size: { w: number; h: number },
  stats: AssetMountStats,
): boolean {
  const m = tagRe.exec(pf.content);
  if (!m || /\bwidth\s*:/.test(m[0])) return false;
  // `/>` 结尾：末三字符为 `空格 / >`，插在空格位 ⇒ 原空格自然留在 style 之后
  const isSelfClose = /\/>$/.test(m[0]);
  const pos = m.index + m[0].length - (isSelfClose ? 3 : 1);
  pf.svgEdits.push({ pos, text: ` style="width:${size.w}px;height:${size.h}px"` });
  stats.sizeRestored += 1;
  return true;
}

/**
 * tx 通道：img **专用包裹层**的宽高按 Figma 容器真值改写（2026-11-06）。
 *
 * 真机 `mc-lab-1793898003372-63cc238e`：Figma `img 98×98`，LLM 产物写成
 * `.c-equipment-detail-thumb { width:64px;height:64px;overflow:hidden }` + `:100%`
 * 收不住 98px 的图 ⇒ 缩略图被裁切放大。只改 img 自己的尺寸（旧 `injectImgSize`）
 * 解释不了容器，必须动容器。
 *
 * 🔴 授权只看 Figma 内部事实（两条同时成立才动手），不看产物 CSS 数值：
 *   ① `containerLevel=true` —— 图 bbox ≈ 父容器 bbox（±1px）⇒ Figma 里容器紧贴图片、
 *      没有内边距，容器尺寸**就是** 图尺寸；图 20×20 装在 24×24 的内边距容器里则
 *      containerLevel=false，天然被排除。
 *   ② 产物侧该 img 的父元素**只有它这一个元素子节点** ⇒ 这个 div 是给这张图的专用
 *      壳（尺寸可以照搬），而不是顺带包着别的兄弟元素的共享行/列（照搬会毁布局）。
 *
 * 落点选**内联 style**（不用类规则）：类规则同时存在于 `package/index.vue`、
 * `common.less`、`index.css` 三处，本阶段只拿到 SFC，改一处会被另一处覆盖；
 * 内联优先级确定。与文本真值（`backfillScriptOptionTruth`）同一做法。
 */
function injectWrapperBox(
  pf: any,
  tagRe: RegExp,
  asset: FigmaAssetTruth,
  stats: AssetMountStats,
): boolean {
  const w = asset.width;
  const h = asset.height;
  if (!w || !h) return false;
  // ① Figma 侧事实：容器与图同尺寸（紧贴、无内边距）
  if (asset.containerLevel !== true) return false;
  const m = tagRe.exec(pf.content);
  if (!m) return false;
  // ② 产物侧事实：专用包裹层（唯一元素子节点就是这张图）
  const { nodes } = parseTemplateTree(pf.content);
  const imgNode = nodes.find((n) => n.tag === 'img' && n.start === m.index);
  const wrap = imgNode?.parent;
  if (!imgNode || !wrap || wrap.tag === '#root') return false;
  if (nodes.filter((n) => n.parent === wrap).length !== 1) return false;

  const openTag = pf.content.slice(wrap.start, wrap.afterOpen);
  const styleM = /style\s*=\s*"([^"]*)"/.exec(openTag);
  const decls = `width:${Math.round(w)}px;height:${Math.round(h)}px`;
  if (styleM) {
    const merged = upsertBoxDecls(styleM[1], Math.round(w), Math.round(h));
    if (merged === styleM[1]) return false; // 已是目标态 → 不产编辑（重跑幂等）
    const ins = wrap.start + styleM.index + styleM[0].length - 1 - styleM[1].length;
    pf.svgEdits.push({ pos: ins, end: ins + styleM[1].length, text: merged });
  } else {
    // 插在开标签 `>` 之前
    pf.svgEdits.push({ pos: wrap.afterOpen - 1, text: ` style="${decls}"` });
  }
  stats.containerSizeFixed += 1;
  // ③ 装不下就抬高父容器：壳按真值变高了，父容器若还是旧的固定 height，
  //    flex 居中会让壳上下溢出、压住下一个区块（真机：header 76px 里塞 98px 的图）。
  ensureParentFits(pf, wrap, Math.round(h), stats);
  return true;
}

/**
 * 父容器固定高度装不下子元素真值 ⇒ 抬 `min-height`（2026-11-06）。
 *
 * 判据只有一条：**父容器自己的固定 height < 子元素真值高度** —— 这个固定高度可证明
 * 是错的（它连自己的直接子元素都装不下），与产物 CSS 的其余数值无关。
 * 只抬 `min-height`（不改 `height`）：min-height 在 CSS 里优先于 height，既能消除溢出，
 * 又不动设计者可能另有用途的 height 键。
 *
 * 幂等：父容器内联样式已有 ≥ 真值的 min-height 时不产编辑。
 */
function ensureParentFits(
  pf: any,
  wrap: TplTreeNode,
  h: number,
  stats: AssetMountStats,
): boolean {
  const parent = wrap.parent;
  if (!parent || parent.tag === '#root') return false;
  const openTag = pf.content.slice(parent.start, parent.afterOpen);
  const styleM = /style\s*=\s*"([^"]*)"/.exec(openTag);
  const fixed = fixedPxOf(pf, parent, 'height', styleM?.[1]);
  if (fixed == null || fixed >= h) return false; // 装得下 / 没有固定高度（auto 自适应）
  const minH = /(?:^|;)\s*min-height\s*:\s*([\d.]+)px/i.exec(styleM?.[1] ?? '');
  if (minH && parseFloat(minH[1]) >= h) return false; // 已抬过（幂等）

  const decls = `min-height:${h}px`;
  if (styleM) {
    const merged = mergeStyleDecls(styleM[1], decls);
    const ins = parent.start + styleM.index + styleM[0].length - 1 - styleM[1].length;
    pf.svgEdits.push({ pos: ins, end: ins + styleM[1].length, text: merged });
  } else {
    pf.svgEdits.push({ pos: parent.afterOpen - 1, text: ` style="${decls}"` });
  }
  stats.parentBoxRelaxed += 1;
  return true;
}

/** 元素自身的固定 px 高度：内联 style 优先，其次本文件里匹配其类名单类的规则 */
function fixedPxOf(
  pf: any,
  node: TplTreeNode,
  prop: 'height',
  inlineCss?: string,
): number | undefined {
  const read = (css: string): number | undefined => {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([\\d.]+)px`, 'i').exec(css);
    return m ? parseFloat(m[1]) : undefined;
  };
  const fromInline = inlineCss ? read(inlineCss) : undefined;
  if (fromInline != null) return fromInline;
  const classes = [...node.attrs.matchAll(/class\s*=\s*"([^"]*)"/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .filter(Boolean);
  if (classes.length === 0) return undefined;
  for (const rule of collectStyleRulesFromContent(pf.content)) {
    if (!classes.some((c) => classMatchesSelector(rule.selNorm, c))) continue;
    const v = read(pf.content.slice(rule.bodyStart, rule.bodyEnd));
    if (v != null) return v;
  }
  return undefined;
}

/** style 属性值追加/覆盖声明（`;` 归一，保证重复执行不产生编辑） */
function mergeStyleDecls(css: string, decls: string): string {
  const parts = css.split(';').map((s) => s.trim()).filter(Boolean);
  for (const d of decls.split(';').map((s) => s.trim()).filter(Boolean)) {
    const name = d.split(':')[0].trim().toLowerCase();
    const i = parts.findIndex((p) => p.split(':')[0].trim().toLowerCase() === name);
    if (i >= 0) parts[i] = d;
    else parts.push(d);
  }
  return parts.join(';');
}

/**
 * 在 style 属性值里改宽高：已有且**数值相同**的原样保留（否则「98px」与「98px; 」
 * 这类写法差异会让每次重跑都产生编辑，幂等判据失效）；其余声明一律不动。
 */
function upsertBoxDecls(css: string, w: number, h: number): string {
  const setOne = (src: string, prop: 'width' | 'height', val: number): string => {
    const rx = new RegExp(`(^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
    const m = rx.exec(src);
    if (m) {
      const num = parseFloat(m[2]);
      const isPx = /^\s*-?[\d.]+px\s*$/i.test(m[2]);
      if (isPx && Math.round(num) === val) return src; // 已一致
      return src.slice(0, m.index) + `${m[1]}${prop}:${val}px` + src.slice(m.index + m[0].length);
    }
    const body = src.replace(/;\s*$/, '');
    return `${body}${body ? ';' : ''}${prop}:${val}px`;
  };
  return setOne(setOne(css, 'width', w), 'height', h);
}

// ───────────────────── svg 占位替换（数据驱动产物挂载） ─────────────────────

const SVG_RX = /<svg[\s\S]*?<\/svg>/g;
const VFOR_RX = /v-for="\s*\(?(\w+)(?:\s*,[^)]*)?\)?\s+in\s+(\w+)[^"]*"/;

interface SvgBlock {
  pf: any;
  start: number;
  end: number;
  vforAlias?: string;
  vforSrc?: string;
}

/** 收集单文件 template 区段内全部 <svg>…</svg> 块及其最近前置 v-for */
function collectSvgBlocks(pf: any): SvgBlock[] {
  const blocks: SvgBlock[] = [];
  SVG_RX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SVG_RX.exec(pf.content)) !== null) {
    if (m.index < pf.range.start || m.index >= pf.range.end) continue;
    const before = pf.content.slice(pf.range.start, m.index);
    // 🔴 取「最后一个」v-for（离 svg 最近）——exec 只回首个匹配，真机实锤
    //   mc-lab-1793865328825：before 里有 tab in tabs + item in stats，取首个错配到 tabs
    let vf: RegExpMatchArray | null = null;
    for (const v of before.matchAll(new RegExp(VFOR_RX.source, 'g'))) vf = v;
    blocks.push({
      pf,
      start: m.index,
      end: m.index + m[0].length,
      vforAlias: vf?.[1],
      vforSrc: vf?.[2],
    });
  }
  return blocks;
}

/** 字符串感知的括号扫描：定位 `const <var> = (ref(...))?[` 的数组字面量区间 */
function findArrayLiteralSpan(
  script: string,
  varName: string,
): { open: number; close: number } | undefined {
  const re = new RegExp(`const\\s+${varName}\\s*=\\s*(?:ref\\s*\\()?\\s*\\[`);
  const m = re.exec(script);
  if (!m) return undefined;
  const open = m.index + m[0].length - 1;
  let depth = 0;
  let inStr: string | null = null;
  let esc = false;
  for (let i = open; i < script.length; i++) {
    const ch = script[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return { open, close: i };
    }
  }
  return undefined;
}

/**
 * 把 icon 注入 v-for 数据数组：在每个顶层对象字面量的收尾 `}` 前插 `, labIcon: <var>`。
 * 顺序契约：Figma 资产按 (y,x) 排序 ↔ 数组字面量顺序（LLM 产物的 mock 数组即视觉顺序）。
 * 数量不等 ⇒ 保守放弃（返回 undefined），禁止错位注入。
 * 只计算不重放：返回的 replacements 基准为原 content，由调用方统一重放（防位移）。
 */
function injectIconsIntoScriptArray(
  script: string,
  srcVar: string,
  assets: FigmaAssetTruth[],
): Array<{ pos: number; text: string }> | undefined {
  const span = findArrayLiteralSpan(script, srcVar);
  if (!span) return undefined;
  // 扫顶层 {…} 组（depth===1 时开合）
  const groups: Array<{ start: number; end: number }> = [];
  let depth = 0;
  let inStr: string | null = null;
  let esc = false;
  let curStart = -1;
  for (let i = span.open + 1; i < span.close; i++) {
    const ch = script[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '{') {
      depth++;
      if (depth === 1) curStart = i;
    } else if (ch === '}') {
      if (depth === 1 && curStart >= 0) groups.push({ start: curStart, end: i });
      depth--;
    }
  }
  if (groups.length !== assets.length) return undefined;
  const replacements: Array<{ pos: number; text: string }> = [];
  for (let i = 0; i < groups.length; i++) {
    const varName = assetVarName(assets[i].nodeId);
    replacements.push({ pos: groups[i].end, text: `, labIcon: ${varName}` });
  }
  return replacements;
}

/**
 * svg 占位替换挂载：产物用臆造 <svg> 占 icon 位时，用 Figma 真 icon <img> 确定性替换。
 * 本函数只产出 edits（追加到 pf.svgEdits）与 imports，不改 content——
 * 所有编辑（文本锚点插入 + svg 替换 + script 数组注入）由 filesOut 统一重放，基准一致防位移。
 * 两条子路径：
 * - v-for 数据驱动（主流，mc-lab-1793865328825 实锤）：svg 全部受同一 v-for 管辖 ⇒
 *   按 (y,x) 排序把 icon 注入 script mock 数组（labIcon 字段），svg 替换为
 *   `<img :src="alias.labIcon">`——运行时每张卡片拿到按视觉顺序对应的真 icon。
 * - 静态 1:1：svg 块数 === 资产数且不受 v-for 管辖时按文档序 zip 直接替换。
 * 数量不匹配等一切不确定情形 ⇒ svgSkipped 保守跳过，零改动。
 */
/**
 * 资产视觉序（判据单一来源，2026-11-06 S1 抽取）：(y,x) 升序，缺坐标者沉底（保持传入序）。
 * 🔴 不用 `(a.y ?? 0)`：x/y 全缺时全部塌 0 ⇒ 排序退化为稳定数组序——反哺条目一旦
 *   缺坐标，盲 zip 会按「truth.assets 数组序」对位（cec84299 实锤：战略区拿到优质图标）。
 *   「缺坐标沉底」让有坐标者始终可靠排前，缺者明确是未知而非 0。
 */
export function byVisualOrder<T extends { x?: number; y?: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ax = typeof a.x === 'number' && typeof a.y === 'number';
    const bx = typeof b.x === 'number' && typeof b.y === 'number';
    if (ax && bx) return a.y! - b.y! || a.x! - b.x!;
    if (ax) return -1; // 有坐标在前
    if (bx) return 1;
    return 0; // 双缺：保持稳定（Array.prototype.sort V8 稳定）
  });
}

// ───────────── S2 资产分类（单一来源，2026-11-06） ─────────────

/** 资产消费类别（S2：替代散落各通道的文件名前缀过滤） */
export type AssetClass = 'bg' | 'strip' | 'icon' | 'decor';

/** bfac46ac 实锤阈值来源：image_313 底图 459×29（footer 宽），icon 40×40；>120px 宽即非图标（命名常量） */
export const STRIP_MIN_WIDTH_PX = 120;

/**
 * 结构派生资产分类（S2 单函数，替代 4 处前缀过滤的散落口径）：
 * - bg：导出器按容器底图语义命名（bg-，强证据）；
 * - strip：非 icon/img 命名 + 宽 ≥ STRIP_MIN_WIDTH_PX 且明显扁/宽于高
 *   （bfac46ac 实锤：459×29 走 icon 通道插成巨图炸 footer）；
 * - icon：导出名 icon-/img-（既有导出器语义）；
 * - decor：其余（g- 等，**既有决议只采集计数不消费**）。
 * 🔴 判据顺序（三条真机证据裁决）：
 *   ① 命名最强（导出器采集期已定的语义）：bg- ⇒ bg、icon-/img- ⇒ icon；
 *   ② containerLevel（bbox≈父容器）**不足以**判 bg——mc-lab-1793898003372 实锤
 *      img-1725（98×98≈卡容器）同时走 icon:'' 字段回填通道且 tx 壳改写生效，
 *      按几何判 bg 会误分流（本函数第一版踩过，tx spec 阳性对照拦下）；
 *   ③ strip 只对无 icon/img 命名的资产生效（icon- 大图不失 icon 资格）。
 */
export function classifyAsset(a: FigmaAssetTruth): AssetClass {
  const fn = String(a.fileName ?? '');
  if (/^bg-/.test(fn)) return 'bg';
  if (/^(?:icon|img)-/.test(fn)) return 'icon';
  const w = a.width ?? 0;
  const h = a.height ?? 0;
  if (w >= STRIP_MIN_WIDTH_PX && w > h * 2) return 'strip';
  if (a.containerLevel === true) return 'bg';
  return 'decor';
}

/** 通道守卫：背景通道消费 bg+strip（底图类）；icon/插入通道只消费 icon。decor 一律不消费（既有 g- 决议收编） */
export function isBgClassAsset(a: FigmaAssetTruth): boolean {
  const c = classifyAsset(a);
  return c === 'bg' || c === 'strip';
}
export function isIconClassAsset(a: FigmaAssetTruth): boolean {
  return classifyAsset(a) === 'icon';
}

/**
 * 资产视觉序（判据单一来源，2026-11-06 S1 抽取）：(y,x) 升序，缺坐标者沉底（保持传入序）。
 */
function mountBySvgPlaceholder(
  parsed: any[],
  assets: FigmaAssetTruth[],
  stats: AssetMountStats,
): void {
  const sorted = byVisualOrder(assets);
  const blocks: SvgBlock[] = [];
  for (const pf of parsed) blocks.push(...collectSvgBlocks(pf));
  if (blocks.length === 0) {
    // 🆕 臆造/占位 icon 形态分档兜底（移动靶，逐形态真机实锤驱动）：
    //   第三形态（mc-lab-1793868147587）：data-URI 字段；
    //   第四形态（mc-lab-1793868575285）：CSS 类占位（iconClass + span :class）；
    //   第五形态（mc-lab-1793869928144 实锤）：规则 0.6 生效后 LLM 留空待回填
    //   （const x = ref('') + <img :src="x">）——VECTOR 图标反哺真值后在此回填。
    //   全部落盘 icon import 标识符；全部失败才 svgSkipped。
    replaceDataUriIcons(parsed, sorted, stats);
    if (stats.dataUriReplaced === 0) {
      replaceIconClassPlaceholders(parsed, sorted, stats);
      if (stats.iconClassReplaced === 0) {
        // 链序：字段（对象 name 语义锚定，强）先消费资产；变量（img alt 锚定，弱）
        // 用剩余资产——mc-lab-1793869911710：12 字段 + 2 变量共分 15 个下载图标
        fillEmptyIconFields(parsed, sorted, stats);
        replaceEmptyIconVars(parsed, sorted, stats);
        // 第六形态（2026-11-06，mc-lab-1793905044222-10d48f4c）：空值对象属性
        //   const statIcons={partner:''} + <img :src="statIcons.partner">；
        //   必须排在字段/变量之后（icon 属性名让位 + _consumed 资产不复用）。
        fillEmptyObjectProps(parsed, sorted, stats);
        // 新元素插入（链尾）：仍零消费的资产（产物零引用、CSS 圆点假图标等）
        //   按唯一文本锚落点受限插入——放链尾是为了让所有「有占位可换」的通道先走。
        insertNewElementAssets(parsed, sorted, stats);
        if (
          stats.emptyIconVarsReplaced === 0 &&
          stats.emptyIconFieldsReplaced === 0 &&
          stats.emptyObjPropsReplaced === 0 &&
          stats.newElementInserted === 0
        ) {
          // 历史口径：全部兜底空转才计 svgSkipped；部分挂载时欠计为已知口径（不追溯）
          stats.svgSkipped += sorted.length;
        }
      }
    }
    return;
  }

  const allSameVfor =
    blocks.every((b) => b.vforSrc) &&
    new Set(blocks.map((b) => `${b.vforAlias}:${b.vforSrc}`)).size === 1;

  if (allSameVfor) {
    const { pf } = blocks[0];
    const alias = blocks[0].vforAlias!;
    const srcVar = blocks[0].vforSrc!;
    const injections = injectIconsIntoScriptArray(pf.content, srcVar, sorted);
    if (!injections) {
      stats.svgSkipped += sorted.length;
      return;
    }
    // import 全部注入同一文件
    for (const a of sorted) {
      const rel = `${importDepthFor(pf.path)}resources/images/${a.fileName}`;
      pf.imports.add(`import ${assetVarName(a.nodeId)} from '${rel}'`);
    }
    // 🔴 尺寸还原（2026-11-05）：共享标签必须 unanimous（首资产盲取会错标异形图标）
    const sz = unanimousSize(sorted);
    const sizeStyle0 = sz ? ` style="width:${sz.w}px;height:${sz.h}px"` : '';
    pf.svgEdits.push(...injections);
    for (const b of blocks) {
      pf.svgEdits.push({
        pos: b.start,
        end: b.end,
        text: `<img class="lab-asset-img" :src="${alias}.labIcon"${sizeStyle0} />`,
      });
    }
    stats.svgReplaced += blocks.length;
    stats.mounted += blocks.length;
    return;
  }

  // 静态 1:1：svg 块数与资产数相等且均不受 v-for 管辖才 zip，否则保守跳过
  const anyVfor = blocks.some((b) => b.vforSrc);
  if (anyVfor || blocks.length !== sorted.length) {
    stats.svgSkipped += sorted.length;
    return;
  }
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const a = sorted[i];
    const varName = assetVarName(a.nodeId);
    b.pf.imports.add(
      `import ${varName} from '${importDepthFor(b.pf.path)}resources/images/${a.fileName}'`,
    );
    const sizeStyle =
      a.width && a.height ? ` style="width:${a.width}px;height:${a.height}px"` : '';
    b.pf.svgEdits.push({
      pos: b.start,
      end: b.end,
      text: `<img class="lab-asset-img" :src="${varName}"${sizeStyle} />`,
    });
  }
  stats.svgReplaced += blocks.length;
  stats.mounted += blocks.length;
}

// ───────────────── data-URI icon 字段替换（臆造 icon 第三形态） ─────────────────

const DATA_URI_ICON_RX = /(\w+)\s*:\s*'(data:image\/svg\+xml[^']*)'/g;

/**
 * data-URI icon 替换：臆造 icon 以 data-URI SVG 形式写在 mock 数据字段里
 * （mc-lab-1793868147587 实锤：icon: 'data:image/svg+xml;utf8,<svg…>'，模板
 * `<img :src="item.icon">` 已存在）⇒ 只需把字段值换成 import 标识符，模板零改动。
 * 顺序契约：data-URI 字段出现顺序（= 数组字面量顺序 = 视觉顺序）↔ 资产 (y,x) 升序。
 * 数量不等 ⇒ 保守跳过，禁止错位。
 */
function replaceDataUriIcons(
  parsed: any[],
  sorted: FigmaAssetTruth[],
  stats: AssetMountStats,
): void {
  const hits: Array<{ pf: any; start: number; end: number; field: string }> = [];
  for (const pf of parsed) {
    DATA_URI_ICON_RX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DATA_URI_ICON_RX.exec(pf.content)) !== null) {
      hits.push({ pf, start: m.index, end: m.index + m[0].length, field: m[1] });
    }
  }
  if (hits.length === 0 || hits.length !== sorted.length) {
    return;
  }
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const a = sorted[i];
    const varName = assetVarName(a.nodeId);
    h.pf.imports.add(
      `import ${varName} from '${importDepthFor(h.pf.path)}resources/images/${a.fileName}'`,
    );
    h.pf.svgEdits.push({ pos: h.start, end: h.end, text: `${h.field}: ${varName}` });
  }
  stats.dataUriReplaced += hits.length;
  stats.mounted += hits.length;
}

// ───────────── CSS 类占位替换（臆造 icon 第四形态） ─────────────

const ICON_CLASS_FIELD_RX = /(\w*[iI]conClass\w*)\s*:\s*'[^']*'/g;
const ICON_CLASS_EL_RX =
  /<(\w+)\b[^>]*:class="\w+\.(\w*[iI]conClass\w*)"[^>]*>\s*<\/\1>/g;

/**
 * CSS 类占位替换：臆造 icon 画成 CSS 类/伪元素（mc-lab-1793868575285 实锤：
 * mock 数据只有 iconClass: 'xxx-truck--red'，模板 <span :class="item.iconClass"></span>）。
 * 两步确定性手术：
 * - script：iconClass 字段后追加 `, icon: labAsset_x`（按出现序 ↔ 资产 (y,x) 序 zip）；
 * - 模板：占位元素整体替换为 `<img :src="alias.icon" …>`。
 * 字段数与资产数不等 ⇒ 保守放弃（零改动）。
 */
function replaceIconClassPlaceholders(
  parsed: any[],
  sorted: FigmaAssetTruth[],
  stats: AssetMountStats,
): void {
  const fieldHits: Array<{ pf: any; start: number; end: number }> = [];
  for (const pf of parsed) {
    ICON_CLASS_FIELD_RX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ICON_CLASS_FIELD_RX.exec(pf.content)) !== null) {
      fieldHits.push({ pf, start: m.index, end: m.index + m[0].length });
    }
  }
  const elHits: Array<{ pf: any; start: number; end: number; alias: string }> = [];
  for (const pf of parsed) {
    ICON_CLASS_EL_RX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ICON_CLASS_EL_RX.exec(pf.content)) !== null) {
      if (m.index < pf.range.start || m.index >= pf.range.end) continue;
      const aliasM = /:class="(\w+)\./.exec(m[0]);
      elHits.push({ pf, start: m.index, end: m.index + m[0].length, alias: aliasM?.[1] ?? 'item' });
    }
  }
  // 模板占位契约：v-for 驱动时静态源码只有 1 个占位元素（运行时渲染 N 个）；
  // 静态写法则占位数 === 资产数。其余形态一律保守放弃。
  const vforDriven = elHits.length === 1 && fieldHits.length > 1;
  if (
    fieldHits.length === 0 ||
    fieldHits.length !== sorted.length ||
    (elHits.length !== 1 && elHits.length !== sorted.length) ||
    (!vforDriven && elHits.length === 1 && sorted.length !== 1)
  ) {
    return;
  }
  // 🔴 尺寸还原（2026-11-05）：共享标签 unanimous（首资产盲取会错标异形图标）
  const szCls = unanimousSize(sorted);
  const sizeStyle = szCls ? ` style="width:${szCls.w}px;height:${szCls.h}px"` : '';
  for (let i = 0; i < fieldHits.length; i++) {
    const fh = fieldHits[i];
    const a = sorted[i];
    const varName = assetVarName(a.nodeId);
    fh.pf.imports.add(
      `import ${varName} from '${importDepthFor(fh.pf.path)}resources/images/${a.fileName}'`,
    );
    // iconClass 字段后追加 icon 字段（不删原字段，保守）
    fh.pf.svgEdits.push({ pos: fh.end, text: `, icon: ${varName}` });
  }
  // 模板替换：v-for 驱动 = 单占位元素（渲染 N 个，绑定 alias.icon）；静态 = zip
  if (vforDriven) {
    const eh = elHits[0];
    eh.pf.svgEdits.push({
      pos: eh.start,
      end: eh.end,
      text: `<img class="lab-asset-img" :src="${eh.alias}.icon"${sizeStyle} />`,
    });
  } else {
    for (let i = 0; i < elHits.length; i++) {
      const eh = elHits[i];
      const aliasM = /:class="(\w+)\./.exec(eh.pf.content.slice(eh.start, eh.end));
      const alias = aliasM?.[1] ?? 'item';
      eh.pf.svgEdits.push({
        pos: eh.start,
        end: eh.end,
        text: `<img class="lab-asset-img" :src="${alias}.icon"${sizeStyle} />`,
      });
    }
  }
  stats.iconClassReplaced += fieldHits.length;
  stats.mounted += fieldHits.length;
}

// ───────────── 空 icon 变量/字段回填（规则 0.6 预期形态） ─────────────

// ref('') 与裸 const x = '' 都收（mc-lab-1793869911710 实锤两种并存）
// 🔴 2026-11-05 实锤（mc-lab-1793871304346）：`''` 后的 `\s*` 若独立于可选 `(\))?`，
//   会把语句后的换行吞进匹配（`(\))?` 匹配空成功、无需回溯）⇒ 替换后相邻 const 胶成
//   一行 ⇒ SFC 语法错误。`\s*` 必须与 `\)` 同组，`)` 缺席时整体回退、换行不消费。
const EMPTY_ICON_VAR_RX = /const\s+(\w+)\s*=\s*(ref\(\s*)?''(\s*\))?/g;

/**
 * 空 icon 变量回填：规则 0.6 要求 LLM 留空待回填（mc-lab-1793869928144 实锤：
 * `const barIcon = ref('')`；mc-lab-1793869911710 变体 `const shieldIcon = ''`）。
 * 契约：模板中实际被 :src 引用的空变量（声明序）↔ **元素级图片**资产（(y,x) 序）zip，
 * 数量不等保守放弃；bg- 前缀（容器级底图）不参与（它有独立通道）。
 *
 * 🔴 2026-11-06 修：资产类从「只认 icon-」放宽为「icon- / img- 两类」。
 *   导出器（`figma-image-exporter.js`）按 Figma 图层名语义分流前缀，普通图片层
 *   一律命名 `img-<id>.png`；而本通道只收 `icon-` ⇒ `img-` 资产**全链路无消费方**
 *   （bg- 通道明确排除、svg 占位通道需要模板里有 <svg>）。
 *   真机（mc-lab-1793898003372-63cc238e）：设备缩略图 36:1729 下载成 img-1725.png，
 *   产物 `<img :src="deviceInfo.icon">` 的 icon 恒为 '' ⇒ 破图占位框。
 */
function replaceEmptyIconVars(
  parsed: any[],
  sorted: FigmaAssetTruth[],
  stats: AssetMountStats,
): void {
  // 字段路径已语义消费的资产不再复用（先字段后变量，见调用链注释）
  const iconAssets = sorted.filter((a) => isIconClassAsset(a) && !(a as any)._consumed);
  const vars: Array<{
    pf: any;
    start: number;
    end: number;
    name: string;
    isRef: boolean;
    alt?: string;
    tagStart?: number;
    tagText?: string;
  }> = [];
  for (const pf of parsed) {
    EMPTY_ICON_VAR_RX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EMPTY_ICON_VAR_RX.exec(pf.content)) !== null) {
      const name = m[1];
      // img 标签 alt：变量语义锚定来源（<img :src="shieldIcon" alt="隧道设备">）
      const tagM = new RegExp(`<img[^>]*:src="${name}"[^>]*>`).exec(pf.content);
      const alt = tagM ? /alt="([^"]*)"/.exec(tagM[0])?.[1] : undefined;
      vars.push({
        pf,
        start: m.index,
        end: m.index + m[0].length,
        name,
        isRef: !!m[2],
        alt,
        tagStart: tagM?.index,
        tagText: tagM?.[0],
      });
    }
  }
  if (vars.length === 0 || iconAssets.length === 0) return;
  const used = new Set<string>();
  const bind = (v: (typeof vars)[number], a: FigmaAssetTruth): void => {
    (a as any)._consumed = true; // 与字段通道一致：先跑的通道消费资产，后续通道（对象属性/新元素）不复用
    const varName = assetVarName(a.nodeId);
    v.pf.imports.add(
      `import ${varName} from '${importDepthFor(v.pf.path)}resources/images/${a.fileName}'`,
    );
    // 保留原形态：ref('') → ref(labAsset_x)；裸 const '' → const x = labAsset_x
    v.pf.svgEdits.push({
      pos: v.start,
      end: v.end,
      text: v.isRef ? `const ${v.name} = ref(${varName})` : `const ${v.name} = ${varName}`,
    });
    // 🔴 尺寸还原（2026-11-05）：变量↔img 一一对应，直接映射注入真值尺寸
    if (v.tagStart !== undefined && v.tagText && a.width && a.height) {
      const re = new RegExp(`<img[^>]*:src="${v.name}"[^>]*>`);
      injectImgSize(v.pf, re, { w: a.width, h: a.height }, stats);
      // tx 通道（2026-11-06）：图与 Figma 容器同尺寸时，专用包裹层也得是那个尺寸
      injectWrapperBox(v.pf, re, a, stats);
    }
    used.add(a.nodeId);
    stats.emptyIconVarsReplaced += 1;
    stats.mounted += 1;
  };
  // 第一轮：alt 语义锚定（变量 alt ↔ 图标近邻文本），每变量独立匹配
  const unbound: typeof vars = [];
  for (const v of vars) {
    const key = v.alt ? normalizeAnchorText(v.alt) : '';
    const a =
      key.length >= 2
        ? iconAssets.find(
            (x) =>
              !used.has(x.nodeId) &&
              (x.nearbyTexts ?? []).some((t) => {
                const nt = normalizeAnchorText(t);
                return nt === key || (nt.length > 1 && nt.includes(key)) || (key.length > 1 && key.includes(nt));
              }),
          )
        : undefined;
    if (a) bind(v, a);
    else unbound.push(v);
  }
  // 第二轮：剩余变量 ↔ 剩余资产数量相等时按序 zip，不等保守放弃（禁止瞎猜）
  const rest = iconAssets.filter((x) => !used.has(x.nodeId));
  if (unbound.length > 0 && unbound.length === rest.length) {
    for (let i = 0; i < unbound.length; i++) bind(unbound[i], rest[i]);
  }
}

const EMPTY_ICON_FIELD_OBJ_RX = /\{[^{}]*\bicon\s*:\s*''[^{}]*\}/g;
const ICON_FIELD_EMPTY_RX = /\bicon\s*:\s*''/;
const NAME_FIELD_RX = /\bname\s*:\s*'([^']*)'/;

/**
 * 空 icon 字段回填：v-for 数组对象的 `icon: ''`（mc-lab-1793869911710 实锤 12 个设备卡）。
 * 下载 icon 资产数常多于字段数（15+ vs 12），几何 zip 不可行 ⇒ 语义锚定：
 * 对象内 name 字段 ↔ 资产 siblingTexts（service 反哺时经 buildNodeTextContext 填充的
 * 图标近邻文本）精确匹配；匹配不上的字段保守留空。
 *
 * 🔴 资产类同 `replaceEmptyIconVars`：`icon-` 与 `img-` 都是「元素级图片」，产物侧
 *   消费方式一样（`<img :src>` / `icon:` 字段），只认 `icon-` 会让 `img-` 静默漏挂。
 *   无近邻文本时走「数量相等按序 zip」兜底（本单 1 资产 ↔ 1 字段）。
 *
 * 🔴🔴 zip 兜底的**准入门槛**：本文件语义锚定**一条都没成**。
 *   语义通道局部可用（有字段锚上了）说明「锚不上的字段是真的对不上」——Figma 里
 *   常有多余装饰图标，按序 zip 会配错图，**配错图比留空更糟**（留空至少布局正确）。
 *   语义通道整体不可用（资产完全没带近邻文本，如 63cc238e 单对象）时，位置配对是
 *   唯一信号，且 1:1 数量相等无歧义，才允许 zip。
 */
/**
 * 资产↔文本键语义匹配（判据单一来源，2026-11-06 抽取）：
 * 资产近邻文本（nearbyTexts 优先，兼容 siblingTexts）与产物侧语义键（img alt / 对象 name）
 * 双向包含即命中。空 icon 字段 / 空变量 / 空对象属性三通道共用，禁止再复制内联版。
 */
function assetSemMatch(a: FigmaAssetTruth, key: string): boolean {
  return (a.nearbyTexts ?? a.siblingTexts ?? []).some((t) => {
    const nt = normalizeAnchorText(t);
    return nt === key || (nt.length > 1 && nt.includes(key)) || (key.length > 1 && key.includes(nt));
  });
}

function fillEmptyIconFields(
  parsed: any[],
  sorted: FigmaAssetTruth[],
  stats: AssetMountStats,
): void {
  const iconAssets = sorted.filter((a) => isIconClassAsset(a));
  if (iconAssets.length === 0) return;
  // 绑定组：按「消费标签变量」分组——同一 pf 内不同变量（statLeft.item…）各有各的
  // 共享标签，混组会让 unanimousSize 把 A 组尺寸错标到 B 组标签上
  // （🔴 mc-lab-1793873410979 实锤：stat 卡标签被 12 卡尺寸错标、12 卡标签反而不上尺寸）
  interface FieldGroup {
    pf: any;
    /** 标签变量：string=已确定；null=数组元素组（注入期解析：排除他组占用后唯一才注入） */
    tagVar: string | null;
    bound: FigmaAssetTruth[];
  }
  const groups = new Map<string, FieldGroup>();
  const groupKeyOf = (pfIdx: number, tag: string) => `${pfIdx}|${tag}`;
  const bindField = (
    pf: any,
    pfIdx: number,
    objM: RegExpExecArray,
    a: FigmaAssetTruth,
    groupTag: string,
    tagVar: string | null,
  ): boolean => {
    const objText = objM[0];
    const fieldRel = ICON_FIELD_EMPTY_RX.exec(objText);
    if (!fieldRel) return false;
    (a as any)._consumed = true; // 语义字段优先消费，空变量路径不再复用
    const varName = assetVarName(a.nodeId);
    pf.imports.add(
      `import ${varName} from '${importDepthFor(pf.path)}resources/images/${a.fileName}'`,
    );
    pf.svgEdits.push({
      pos: objM.index + (fieldRel.index ?? 0),
      end: objM.index + (fieldRel.index ?? 0) + fieldRel[0].length,
      text: `icon: ${varName}`,
    });
    const gk = groupKeyOf(pfIdx, groupTag);
    if (!groups.has(gk)) groups.set(gk, { pf, tagVar, bound: [] });
    groups.get(gk)!.bound.push(a);
    stats.emptyIconFieldsReplaced += 1;
    stats.mounted += 1;
    return true;
  };

  for (let pfIdx = 0; pfIdx < parsed.length; pfIdx++) {
    const pf = parsed[pfIdx];
    // 模板中 `.icon` 绑定标签的变量集合（数组元素组的尺寸注入要求全文件唯一）
    const tplTagVars = [
      ...new Set(
        [...pf.content.matchAll(/:src="(\w+)\.icon"/g)].map((x) => x[1]),
      ),
    ];
    EMPTY_ICON_FIELD_OBJ_RX.lastIndex = 0;
    let m: RegExpExecArray | null;
    const pendingAlt: Array<{ objM: RegExpExecArray; ownVar: string }> = [];
    /** 有 name 但语义锚定失败的空字段（留给第三轮「数量相等 zip」兜底） */
    const unboundFieldNodes: Array<{ objM: RegExpExecArray; ownVar: string | null }> = [];
    while ((m = EMPTY_ICON_FIELD_OBJ_RX.exec(pf.content)) !== null) {
      const objText = m[0];
      // 对象自身变量名（顶层单对象 `const statLeft = {icon:''}`；数组元素无）
      const before = pf.content.slice(Math.max(0, m.index - 120), m.index);
      const ownVarM = /(\w+)\s*=\s*$/.exec(before);
      const ownVar = ownVarM ? ownVarM[1] : null;
      const nameM = NAME_FIELD_RX.exec(objText);
      const key = nameM ? normalizeAnchorText(nameM[1]) : '';
      let bound = false;
      if (key.length >= 2) {
        // 第一轮：对象 name 语义锚定（优先 nearbyTexts，兼容 siblingTexts）
        const a = iconAssets.find((x) => !(x as any)._consumed && assetSemMatch(x, key));
        if (a && a.fileName) {
          // 组标签：有自身变量用自身变量；数组元素 tagVar 留 null，注入期再解析
          const tagVar = ownVar && tplTagVars.includes(ownVar) ? ownVar : null;
          bound = bindField(pf, pfIdx, m, a, ownVar ?? 'arr', tagVar);
        }
      }
      if (!bound && !nameM && ownVar) {
        // 第二轮素材收集：无 name 的顶层单对象（statLeft={icon:''}）→ 走 img alt 锚定
        // （🔴 mc-lab-1793873410979 实锤：alt="隧道设备" ↔ nearbyTexts 可锚但无通道）
        pendingAlt.push({ objM: m, ownVar });
      } else if (!bound && nameM) {
        unboundFieldNodes.push({ objM: m, ownVar });
      }
    }
    // 第二轮：img alt ↔ 资产 nearbyTexts 语义锚定，唯一命中才绑（禁止瞎猜）
    for (const p of pendingAlt) {
      const tagM = new RegExp(`<img[^>]*:src="${p.ownVar}\\.icon"[^>]*>`).exec(pf.content);
      if (!tagM) continue;
      const alt = /alt="([^"]*)"/.exec(tagM[0])?.[1] ?? '';
      const altKey = normalizeAnchorText(alt);
      if (altKey.length < 2) continue;
      const cands = iconAssets.filter((x) => !(x as any)._consumed && assetSemMatch(x, altKey));
      if (cands.length !== 1) continue; // 0 或多候选 = 歧义，保守放弃
      bindField(pf, pfIdx, p.objM, cands[0], p.ownVar, p.ownVar);
    }

    // 第三轮：**数量相等才 zip**（与 `replaceEmptyIconVars` 同一条「禁止瞎猜」纪律）。
    // 真机（mc-lab-1793898003372-63cc238e）：单对象 `{ name:'GD-Robot-04', …, icon:'' }`
    // + 单张 `img-1725.png`，资产没有任何近邻文本（siblingTexts=[]）⇒ 第一轮语义锚定
    // 结构性不可能命中，第二轮又被「有 name」排除 ⇒ 空字段永远填不上 ⇒ 破图占位框。
    // 1 个空字段 ↔ 1 张图不存在歧义；数量不等一律不动。
    // 🔴 且必须「语义锚定零命中」才准入：已锚上过 ⇒ 剩余是真的对不上，zip 会配错图。
    const semanticBound = [...groups.values()].reduce((n, g) => n + g.bound.length, 0);
    if (unboundFieldNodes.length > 0 && semanticBound === 0) {
      const restAssets = iconAssets.filter((x) => !(x as any)._consumed);
      if (unboundFieldNodes.length === restAssets.length) {
        for (let i = 0; i < unboundFieldNodes.length; i += 1) {
          const { objM, ownVar } = unboundFieldNodes[i];
          const tagVar = ownVar && tplTagVars.includes(ownVar) ? ownVar : null;
          bindField(pf, pfIdx, objM, restAssets[i], ownVar ?? 'arr', tagVar);
        }
      }
    }
  }
  // 🔴 尺寸还原（2026-11-05）：按绑定组各自的标签变量精确注入，
  //   unanimous（组内全部一致）才动手，异形图标保守不上尺寸。
  //   tagVar=null 的数组组：注入期解析——排除其他组已占用的标签变量，剩余唯一才注入
  //   （🔴 回归：旧版无脑取文件首个 .icon 标签，把 12 卡尺寸错标到 stat 卡标签上）
  for (const g of groups.values()) {
    const sz = unanimousSize(g.bound);
    if (!sz) continue;
    let tagVar = g.tagVar;
    if (tagVar === null) {
      const occupied = new Set(
        [...groups.values()].filter((o) => o !== g && o.pf === g.pf && o.tagVar).map((o) => o.tagVar!),
      );
      const distinct = [
        ...new Set([...g.pf.content.matchAll(/:src="(\w+)\.icon"/g)].map((x) => x[1])),
      ].filter((v) => !occupied.has(v));
      if (distinct.length !== 1) continue; // 0 或多候选 = 歧义，保守放弃
      tagVar = distinct[0];
    }
    const imgRe = new RegExp(`<img[^>]*:src="${tagVar}\\.icon"[^>]*>`);
    injectImgSize(g.pf, imgRe, sz, stats);
    // 🔴 tx 通道（2026-11-06）：图与 Figma 容器同尺寸时，产物里这张图的**专用壳**也必须
    //   是那个尺寸——否则壳（LLM 写的 64×64）+ `overflow:hidden` 会把 98px 的图裁切。
    //   🔴 放在这里而不是 bindField：`const deviceInfo = ref({icon:''})` 形态下 ownVar 取不到
    //   （`(\w+)\s*=\s*$` 撞上 `ref(`），bind 期 tagVar=null ⇒ 通道静默失效（真机实锤）。
    //   本处 tagVar 已确定，且这里一个组只改一次（不会对同一壳重复注入 style）。
    if (g.bound.every((a) => a.containerLevel === true && a.width && a.height)) {
      injectWrapperBox(g.pf, imgRe, g.bound[0], stats);
    }
  }
}

// ───────────── 空 icon 对象属性回填（第六形态，2026-11-06） ─────────────

/**
 * 形态：`const statIcons = { partner: '', device: '' }` + 模板 `<img :src="statIcons.partner" alt="合作厂商">`。
 * 真机实锤 mc-lab-1793905044222-10d48f4c：规则 0.6 的「留空待回填」被 LLM 写成**空值对象属性**
 * （而非空变量/`icon:''` 字段）⇒ 兜底链四形态全不命中 ⇒ svgSkipped、破图。
 *
 * 准入判据（纯结构，不认名字）：
 * - flat 对象字面量（嵌套 `{` 一律保守跳过——数组对象是字段通道的领地）；
 * - 属性值为**空字符串字面量**；
 * - 该属性被模板 `:src="<objVar>.<prop>"` 实际引用——「被 :src 引用」即 icon 角色证明，
 *   普通空串占位（如备注字段）不会被误绑；
 * - 属性名 `icon` 让位：`fillEmptyIconFields` 先跑且坐标同源（都基于原 content），
 *   同一 `icon: ''` 命中两通道会双重改写产物。
 *
 * 锚定（与空变量通道同构，资产消费纪律 `_consumed` 互通）：
 * 1) img alt ↔ 资产 nearbyTexts/siblingTexts 语义锚（assetSemMatch，唯一命中才绑）；
 * 2) 剩余属性 ↔ 剩余资产**数量相等才 zip**（属性声明序 ↔ 资产传入序），不等保守放弃。
 */
function fillEmptyObjectProps(
  parsed: any[],
  sorted: FigmaAssetTruth[],
  stats: AssetMountStats,
): void {
  const iconAssets = sorted.filter((a) => isIconClassAsset(a) && !(a as any)._consumed);
  if (iconAssets.length === 0) return;
  // objVar → {prop → {start,end,alt,pf}}：从 :src="objVar.prop" 反查 img alt 语义键
  const propsByObj = new Map<string, Map<string, { start: number; end: number; pf: any; alt?: string }>>();
  for (const pf of parsed) {
    // flat 对象字面量：起止花括号之间无嵌套 { }，且含至少一个空串属性
    const objRx = /\{[^{}]*\}/g;
    let om: RegExpExecArray | null;
    while ((om = objRx.exec(pf.content)) !== null) {
      const objText = om[0];
      const before = pf.content.slice(Math.max(0, om.index - 120), om.index);
      // 🔴 多行形态（10d48f4c 实锤）：`const statIcons = {\n  partner: '',`——
      //   `(\w+)\s*=\s*$` 撞 `\n` 失败 ⇒ 必须允许 `=` 与 `{` 之间跨换行空白。
      const ownVarM = /(\w+)\s*=\s*$/.exec(before) ?? /(\w+)\s*=\s*\n\s*$/.exec(before);
      if (!ownVarM) continue; // 数组元素对象（字段通道领地）
      const objVar = ownVarM[1];
      const emptyRx = /(\w+)\s*:\s*''/g;
      let em: RegExpExecArray | null;
      while ((em = emptyRx.exec(objText)) !== null) {
        const prop = em[1];
        if (prop === 'icon') continue; // 字段通道先跑，让位防双改
        const tagM = new RegExp(`<img[^>]*:src="${objVar}\\.${prop}"[^>]*>`).exec(pf.content);
        if (!tagM) continue; // 未被 :src 引用 ⇒ 无 icon 角色证据
        const alt = /alt="([^"]*)"/.exec(tagM[0])?.[1];
        const absStart = om.index + em.index;
        const map = propsByObj.get(objVar) ?? new Map();
        map.set(prop, { start: absStart, end: absStart + em[0].length, pf, alt });
        propsByObj.set(objVar, map);
      }
    }
  }
  // 展平为有序 prop 列表（按 objVar 出现序；Map 保持插入序）
  const pending: Array<{ objVar: string; prop: string; start: number; end: number; pf: any; alt?: string }> = [];
  for (const [objVar, props] of propsByObj) {
    for (const [prop, meta] of props) {
      pending.push({ objVar, prop, ...meta });
    }
  }
  if (pending.length === 0) return;
  const bindProp = (p: (typeof pending)[number], a: FigmaAssetTruth): void => {
    (a as any)._consumed = true;
    const pf = p.pf;
    const varName = assetVarName(a.nodeId);
    pf.imports.add(
      `import ${varName} from '${importDepthFor(pf.path)}resources/images/${a.fileName}'`,
    );
    pf.svgEdits.push({ pos: p.start, end: p.end, text: `${p.prop}: ${varName}` });
    // 尺寸还原：与空变量通道同构，限定 :src="objVar.prop" 标签
    if (a.width && a.height) {
      const re = new RegExp(`<img[^>]*:src="${p.objVar}\\.${p.prop}"[^>]*>`);
      injectImgSize(pf, re, { w: a.width, h: a.height }, stats);
      injectWrapperBox(pf, re, a, stats);
    }
    stats.emptyObjPropsReplaced += 1;
    stats.mounted += 1;
  };
  // 第一轮：alt 语义锚定（唯一命中才绑）
  const unbound: typeof pending = [];
  for (const p of pending) {
    const key = p.alt ? normalizeAnchorText(p.alt) : '';
    const cands =
      key.length >= 2
        ? iconAssets.filter((x) => !(x as any)._consumed && assetSemMatch(x, key))
        : [];
    if (cands.length === 1) bindProp(p, cands[0]);
    else unbound.push(p);
  }
  // 第二轮：剩余属性 ↔ 候选资产数量相等才 zip（禁止瞎猜），不等保守放弃。
  // 🔴 zip 池收敛（10d48f4c 实锤）：同文件常混多路资产（如 3 个分组 icon 产物零引用），
  //   全量 rest 会稀释数量相等判据（2 属性 vs 5 资产 ⇒ 误放弃）；而 assetSemMatch 的
  //   双向包含又太宽（'战略合作厂商' ⊃ '合作厂商' ⇒ 分组 icon 混进池）。故：
  //   - 有 alt 键 ⇒ 池 = 「nearbyTexts/siblingTexts 归一化精确等于某键」的资产
  //     （字面同值才进池，分组长文本资产出局，留给后续通道）；
  //   - 无任何 alt 键 ⇒ 池 = 全量未消费资产（纯位置 zip，与空变量通道第二轮同款纪律，
  //     仅在数量严格相等时兜底）。
  const unboundKeys = new Set(
    unbound
      .map((p) => (p.alt ? normalizeAnchorText(p.alt) : ''))
      .filter((k) => k.length >= 2),
  );
  const unconsumed = iconAssets.filter((x) => !(x as any)._consumed);
  const zipPool =
    unboundKeys.size > 0
      ? unconsumed.filter((x) =>
          [...(x.nearbyTexts ?? []), ...(x.siblingTexts ?? [])].some((t) =>
            unboundKeys.has(normalizeAnchorText(t)),
          ),
        )
      : unconsumed;
  if (unbound.length > 0 && unbound.length === zipPool.length) {
    for (let i = 0; i < unbound.length; i++) bindProp(unbound[i], zipPool[i]);
  }
}

// ───────────────────── 新元素插入通道（2026-11-06） ─────────────────────

/**
 * 产物**零引用**资产的受限落地（plan 层 needs-new-element 的挂载侧兑现）：
 * 真机 mc-lab-1793905044222-10d48f4c：3 个分组标题 icon 在产物零引用，标题旁是
 * LLM 违规用 CSS 圆点拼的假图标（规则 0.6 禁止 CSS 拼图形）⇒ 四形态兜底全部无占位可换。
 *
 * 准入：fileName 存在、非 bg-、未被任何通道消费（_consumed）。
 * 锚定：nearbyTexts ∪ siblingTexts（归一化 ≥2 字）在模板叶子**唯一精确命中**
 *   （0=无锚 → newElSkipNoAnchor；>1=歧义 → newElSkipAmbiguous；均保守不动）。
 * 插入：锚点开标签前插 `<img class="lab-asset-img" :src=… style=width/height/>`；
 *   🔴 防双图标：锚点紧邻前方若为**空元素**（无文本内容的占位 span——结构性判据，
 *   inner.trim()===''，不认名字），则**替换**它（正是 CSS 圆点假图标位）；img 标签除外
 *   （可能是合法已渲染图）。空元素识别窗口 NEW_EL_LOOKBACK（命名常量，非魔法数）。
 */
const NEW_EL_LOOKBACK = 240;

function insertNewElementAssets(
  parsed: any[],
  sorted: FigmaAssetTruth[],
  stats: AssetMountStats,
): void {
  // 🔴 S2：只消费 icon 类（bg/strip 有独立通道、decor 不消费——g- 误消费 24468462 实锤）
  const cands = sorted.filter((a) => a.fileName && isIconClassAsset(a) && !(a as any)._consumed);
  if (cands.length === 0) return;
  for (const a of cands) {
    const keys = new Set(
      [...(a.nearbyTexts ?? []), ...(a.siblingTexts ?? [])]
        .map((t) => normalizeAnchorText(t))
        .filter((k) => k.length >= 2),
    );
    if (keys.size === 0) {
      stats.newElSkipNoAnchor += 1;
      continue;
    }
    // 唯一精确命中（跨全文件；与主循环 consumed 纪律一致，防与文本锚点通道抢占）
    let hit: { pfIdx: number; leaf: LeafElement } | undefined;
    let hitCount = 0;
    for (let i = 0; i < parsed.length; i++) {
      for (const l of parsed[i].leaves) {
        if (keys.has(normalizeAnchorText(l.inner)) && !parsed[i].consumed.has(`${i}:${l.openStart}`)) {
          hitCount += 1;
          if (!hit) hit = { pfIdx: i, leaf: l };
        }
      }
    }
    if (hitCount !== 1 || !hit) {
      // 0 = 无锚 → newElSkipNoAnchor；>1 = 歧义 → newElSkipAmbiguous（均保守不动）
      if (hitCount === 0) stats.newElSkipNoAnchor += 1;
      else stats.newElSkipAmbiguous += 1;
      continue;
    }
    const pf = parsed[hit.pfIdx];
    const leaf = hit.leaf;
    // 空元素探测：锚点开标签前 NEW_EL_LOOKBACK 窗口内找紧邻空元素
    //   （自闭合 <x/> 或 <x …></x>——CSS 圆点假图标正是这种无文本占位 span；
    //    img 除外：可能是合法已渲染图）
    const tpl = pf.content;
    const absOpen = pf.range.start + leaf.openStart;
    const windowStart = Math.max(tpl.lastIndexOf('>', Math.max(0, absOpen - NEW_EL_LOOKBACK)) + 1, 0);
    const before = tpl.slice(windowStart, absOpen);
    const emptyElM =
      /<([a-zA-Z][\w-]*)((?:\s[^<>]*)?)\/>\s*$/.exec(before) ??
      /<([a-zA-Z][\w-]*)((?:\s[^<>]*)?)><\/\1>\s*$/.exec(before);
    let insertPos = absOpen;
    let replaceEnd: number | undefined = undefined;
    if (emptyElM && emptyElM[1].toLowerCase() !== 'img') {
      insertPos = absOpen - emptyElM[0].length;
      replaceEnd = absOpen;
    }
    const varName = assetVarName(a.nodeId);
    pf.imports.add(
      `import ${varName} from '${importDepthFor(pf.path)}resources/images/${a.fileName}'`,
    );
    const sizeStyle =
      a.width && a.height ? ` style="width:${a.width}px;height:${a.height}px"` : '';
    pf.insertions.push({
      pos: insertPos,
      ...(replaceEnd !== undefined ? { end: replaceEnd } : {}),
      text: `<img class="lab-asset-img" :src="${varName}"${sizeStyle} />`,
    });
    pf.consumed.add(`${hit.pfIdx}:${leaf.openStart}`);
    (a as any)._consumed = true;
    stats.newElementInserted += 1;
    stats.mounted += 1;
  }
}

// ───────────────────── script 字面量真值回填（echarts option，2026-11-05 ③立项） ─────────────────────

export interface ScriptTruthStats {
  /** xAxis axisLabel 回填成功（0/1，双轴等复杂形态 v1 只处理首个） */
  xAxisBackfilled: number;
  /** yAxis axisLabel 回填成功（0/1） */
  yAxisBackfilled: number;
  /** markLine（label + lineStyle 同源色）回填成功数 */
  markLineBackfilled: number;
  /** 实际替换的 color 值个数 */
  scriptColorApplied: number;
  /** 实际替换的 fontSize 值个数 */
  scriptFontSizeApplied: number;
  /** 保守放弃数（候选未全命中 / 真值不唯一 / 无既有键可换） */
  scriptSkipped: number;
}

export interface ScriptTruthResult {
  files: FileBackfillResult[];
  stats: ScriptTruthStats;
}

interface TokenTruthEntry {
  colors: Set<string>;
  fontSizes: Set<number>;
}

/** 字符串感知的括号配对：openIdx 指向 [ { ( 之一，返回配对闭括号下标 */
function matchBracketFrom(s: string, openIdx: number): number | undefined {
  const open = s[openIdx];
  const close = open === '[' ? ']' : open === '{' ? '}' : open === '(' ? ')' : undefined;
  if (!close) return undefined;
  let depth = 0;
  let inStr: string | null = null;
  let esc = false;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return undefined;
}

/**
 * 真值 token 索引：Figma TEXT 按（多行拆行）建 精确字符串 → {颜色集, 字号集}。
 * 多行文本（如 y 轴 '40\n30\n20\n10\n0'）拆成逐行 token；单行整条即 token。
 * 数字轴标签长度可为 1（'0'），不受模板锚点 ≥2 的短文本判据约束——这里有
 * 轴标签集合全命中兜底，不会单 token 误挂。
 */
function buildScriptTokenIndex(truth: TruthInventory): Map<string, TokenTruthEntry> {
  const idx = new Map<string, TokenTruthEntry>();
  const add = (token: string, color?: string, fontSize?: number) => {
    if (!token) return;
    let e = idx.get(token);
    if (!e) {
      e = { colors: new Set(), fontSizes: new Set() };
      idx.set(token, e);
    }
    if (color) e.colors.add(color);
    if (typeof fontSize === 'number') e.fontSizes.add(fontSize);
  };
  for (const t of truth.texts) {
    const raw = String(t.characters ?? '');
    const lines = raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const line of lines) add(line, t.color, t.fontSize);
  }
  return idx;
}

/** 单 token 真值裁决：颜色与字号都必须各自唯一才可用（任一多值 = 状态相关或歧义 ⇒ 放弃） */
function unanimousToken(
  idx: Map<string, TokenTruthEntry>,
  token: string,
): { color?: string; fontSize?: number } | undefined {
  const e = idx.get(token);
  if (!e) return undefined;
  const color = e.colors.size === 1 ? [...e.colors][0] : undefined;
  const fontSize = e.fontSizes.size === 1 ? [...e.fontSizes][0] : undefined;
  if (color === undefined && fontSize === undefined) return undefined;
  return { color, fontSize };
}

/** 从数组字面量区间提取字符串元素（单双引号） */
function extractStringLiterals(s: string, open: number, close: number): string[] {
  const out: string[] = [];
  const re = /'([^']*)'|"([^"]*)"/g;
  const seg = s.slice(open + 1, close);
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg)) !== null) out.push(m[1] ?? m[2] ?? '');
  return out;
}

/** 区间内替换已有键：color: '…' / fontSize: N（只换不插——产物没写的属性不臆造） */
function replacePropsInSpan(
  content: string,
  span: { open: number; close: number },
  want: { color?: string; fontSize?: number },
  stats: ScriptTruthStats,
): Array<{ pos: number; end: number; text: string }> {
  const edits: Array<{ pos: number; end: number; text: string }> = [];
  if (want.color) {
    const m = new RegExp(`\\bcolor\\s*:\\s*'[^']*'|\\bcolor\\s*:\\s*"[^"]*"`).exec(
      content.slice(span.open, span.close + 1),
    );
    if (m) {
      const abs = span.open + m.index;
      const oldVal = /'([^']*)'|"([^"]*)"/.exec(m[0]);
      const oldV = oldVal?.[1] ?? oldVal?.[2] ?? '';
      if (oldV !== want.color) {
        edits.push({ pos: abs, end: abs + m[0].length, text: `color: '${want.color}'` });
        stats.scriptColorApplied += 1;
      }
    }
  }
  if (typeof want.fontSize === 'number') {
    const m = /\bfontSize\s*:\s*[\d.]+/.exec(content.slice(span.open, span.close + 1));
    if (m) {
      const abs = span.open + m.index;
      const oldN = Number(/([\d.]+)$/.exec(m[0])?.[1]);
      if (oldN !== want.fontSize) {
        edits.push({ pos: abs, end: abs + m[0].length, text: `fontSize: ${want.fontSize}` });
        stats.scriptFontSizeApplied += 1;
      }
    }
  }
  return edits;
}

/**
 * 轴标签回填：候选标签集 ↔ 真值 token **集合全命中** 且颜色/字号各自唯一才动手。
 * - xAxis：data 引用变量（xArr.value / xArr）→ 解析顶层 const 数组字面量；内联数组亦可。
 * - yAxis：数值轴无 data ⇒ 由块内 min/max/interval **派生**候选标签（缺一或 >16 个放弃）。
 * 替换范围：轴块内 axisLabel: {…} 的既有 color / fontSize 键（纯替换，无键不插）。
 */
function processAxis(
  content: string,
  axisKey: 'xAxis' | 'yAxis',
  idx: Map<string, TokenTruthEntry>,
  stats: ScriptTruthStats,
): Array<{ pos: number; end: number; text: string }> {
  const keyRe = new RegExp(`\\b${axisKey}\\s*:\\s*\\{`);
  const km = keyRe.exec(content);
  if (!km) return [];
  const axisOpen = km.index + km[0].length - 1;
  const axisClose = matchBracketFrom(content, axisOpen);
  if (axisClose === undefined) return [];
  const axisSrc = content.slice(axisOpen, axisClose + 1);

  // 1) 候选标签
  let labels: string[] | undefined;
  if (axisKey === 'xAxis') {
    const dm = /\bdata\s*:\s*([A-Za-z_$][\w$]*)\s*(?:\.value)?\s*,|\bdata\s*:\s*([A-Za-z_$][\w$]*)\s*$/
      .exec(axisSrc);
    const arrM = /\bdata\s*:\s*\[/.exec(axisSrc);
    if (dm) {
      const varName = dm[1] || dm[2];
      const span = varName ? findArrayLiteralSpan(content, varName) : undefined;
      if (span) labels = extractStringLiterals(content, span.open, span.close);
    } else if (arrM) {
      const open = axisOpen + arrM.index + arrM[0].length - 1;
      const close = matchBracketFrom(content, open);
      if (close !== undefined) labels = extractStringLiterals(content, open, close);
    }
  } else {
    const mn = /\bmin\s*:\s*(\d+)/.exec(axisSrc);
    const mx = /\bmax\s*:\s*(\d+)/.exec(axisSrc);
    const iv = /\binterval\s*:\s*(\d+)/.exec(axisSrc);
    if (mn && mx && iv) {
      const start = Number(mn[1]);
      const end = Number(mx[1]);
      const step = Number(iv[1]);
      if (step > 0 && end >= start && (end - start) / step <= 16) {
        labels = [];
        for (let v = start; v <= end; v += step) labels.push(String(v));
      }
    }
  }
  if (!labels || labels.length === 0) {
    stats.scriptSkipped += 1;
    return [];
  }

  // 2) 集合全命中 + 唯一裁决
  let color: string | undefined;
  let fontSize: number | undefined;
  for (const l of labels) {
    const u = unanimousToken(idx, l);
    if (!u) {
      stats.scriptSkipped += 1;
      return [];
    }
    if (u.color !== undefined) {
      if (color !== undefined && color !== u.color) {
        stats.scriptSkipped += 1;
        return [];
      }
      color = u.color;
    }
    if (u.fontSize !== undefined) {
      if (fontSize !== undefined && fontSize !== u.fontSize) {
        stats.scriptSkipped += 1;
        return [];
      }
      fontSize = u.fontSize;
    }
  }
  if (color === undefined && fontSize === undefined) {
    stats.scriptSkipped += 1;
    return [];
  }

  // 3) axisLabel 既有键替换
  const alm = /\baxisLabel\s*:\s*\{/.exec(axisSrc);
  if (!alm) {
    stats.scriptSkipped += 1;
    return [];
  }
  const alOpen = axisOpen + alm.index + alm[0].length - 1;
  const alClose = matchBracketFrom(content, alOpen);
  if (alClose === undefined) {
    stats.scriptSkipped += 1;
    return [];
  }
  // 闸门全过 = 本轴回填成功（值即使已相等也计成功；0 也打的反面：成功必留痕）
  if (axisKey === 'xAxis') stats.xAxisBackfilled += 1;
  else stats.yAxisBackfilled += 1;
  return replacePropsInSpan(content, { open: alOpen, close: alClose }, { color, fontSize }, stats);
}

/**
 * markLine 回填：formatter 字面量 ↔ 真值 token 精确匹配（唯一裁决），
 * label 块既有 color/fontSize 替换 + 同 markLine 块内 lineStyle.color 同源替换
 * （markLine 线与标签同色是 echarts 语义派生，非硬编码）。
 */
function processMarkLine(
  content: string,
  idx: Map<string, TokenTruthEntry>,
  stats: ScriptTruthStats,
): Array<{ pos: number; end: number; text: string }> {
  const edits: Array<{ pos: number; end: number; text: string }> = [];
  const re = /\bformatter\s*:\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const token = (m[1] ?? '').trim();
    if (normalizeAnchorText(token).length < 2) continue;
    const u = unanimousToken(idx, token);
    if (!u || (u.color === undefined && u.fontSize === undefined)) {
      stats.scriptSkipped += 1;
      continue;
    }
    // 向前找包含点：最近的 label: { 与 markLine: {
    const findEnclosing = (nameRe: RegExp) => {
      const name = new RegExp(nameRe.source, 'g');
      let best: { open: number; close: number } | undefined;
      let bm: RegExpExecArray | null;
      while ((bm = name.exec(content.slice(0, m!.index))) !== null) {
        const open = bm.index + bm[0].length - 1;
        const close = matchBracketFrom(content, open);
        if (close !== undefined && close >= m!.index) best = { open, close };
      }
      return best;
    };
    const labelSpan = findEnclosing(/label\s*:\s*\{/);
    const mlSpan = findEnclosing(/markLine\s*:\s*\{/);
    if (labelSpan) edits.push(...replacePropsInSpan(content, labelSpan, u, stats));
    if (mlSpan) {
      const lsm = /\blineStyle\s*:\s*\{/.exec(content.slice(mlSpan.open, mlSpan.close + 1));
      if (lsm && u.color) {
        const lsOpen = mlSpan.open + lsm.index + lsm[0].length - 1;
        const lsClose = matchBracketFrom(content, lsOpen);
        if (lsClose !== undefined) {
          edits.push(...replacePropsInSpan(content, { open: lsOpen, close: lsClose }, { color: u.color }, stats));
        }
      }
    }
    if (labelSpan || mlSpan) stats.markLineBackfilled += 1;
    else stats.scriptSkipped += 1;
  }
  return edits;
}

/**
 * ③ script 数据字面量真值回填（echarts option）：
 * 数据驱动产物的文本与颜色全在 script 字面量里，模板锚点结构性够不着
 * （mc-lab-1793871304346 实锤：exact=0/miss=21/colorApplied=0 而真值色齐全）。
 * 铁律：所有目标值从 truth.texts 派生，无任何硬编码色；集合全命中 + 唯一裁决，
 * 任一不满足整单元保守放弃；只替换产物已写出的键（不臆造结构）。
 * tab 等状态相关插值叶子不在本通道（单帧真值无状态模型，按标签冻色必错）。
 */
export function backfillScriptOptionTruth(
  files: Array<{ path: string; content: string; changed?: boolean; edits?: any[] }>,
  truth: TruthInventory,
): ScriptTruthResult {
  const stats: ScriptTruthStats = {
    xAxisBackfilled: 0,
    yAxisBackfilled: 0,
    markLineBackfilled: 0,
    scriptColorApplied: 0,
    scriptFontSizeApplied: 0,
    scriptSkipped: 0,
  };
  const idx = buildScriptTokenIndex(truth);
  const filesOut = files.map((f) => {
    // 只处理含 echarts option 特征的文件（xAxis/yAxis 关键字）
    if (!/\bxAxis\b/.test(f.content) && !/\bmarkLine\b/.test(f.content)) {
      return { ...f, changed: f.changed === true, edits: f.edits ?? [] };
    }
    const edits = [
      ...processAxis(f.content, 'xAxis', idx, stats),
      ...processAxis(f.content, 'yAxis', idx, stats),
      ...processMarkLine(f.content, idx, stats),
    ];
    if (edits.length === 0) return { ...f, changed: f.changed === true, edits: f.edits ?? [] };
    // 从后往前重放（基准原 content，防位移）
    let content = f.content;
    for (const e of edits.sort((a, b) => b.pos - a.pos)) {
      content = content.slice(0, e.pos) + e.text + content.slice(e.end);
    }
    return { ...f, content, changed: true, edits: f.edits ?? [] };
  });
  return { files: filesOut, stats };
}

// ───────────────── 面板标题插槽归位（478f0758 实锤：标题渲染进内容区 + 头部插槽空置） ─────────────────

export interface PanelTitleStats {
  /** 含 base-panel 的文件数（观测） */
  panels: number;
  /** 标题已迁入 #title-left 插槽 */
  titleRelocated: number;
  /** base-panel 存在但没找到 displayName 对应的静态标题（或已有 title-left） */
  skipNoTitle: number;
}

export interface PanelTitleResult {
  files: Array<{ path: string; content: string; changed: boolean }>;
  stats: PanelTitleStats;
}

/**
 * 面板标题插槽归位（2026-11-05 立项）。
 *
 * 微码语义（vue3-engineer T1 注释同源）：base-panel 外壳负责渲染面板头部——
 * 有 `#title-left` 插槽用之，否则回退显示 componentName；默认插槽 = 内容区。
 * lite 生成把面板标题（== 组件 displayName）放进默认插槽 ⇒ 标题渲染进内容区、
 * 头部只剩英文名（478f0758 实锤）。
 *
 * 判据（确定性，不依赖 Figma 坐标）：默认插槽内静态文本节点归一化 == displayName 归一化。
 * 动作：整体摘除该元素 → `<base-panel>` 开标签后注入 `<template #title-left>文本</template>`。
 * 防线：已有 title-left 不动；displayName 空 / 无 base-panel / 零命中 → 如实计数零改动。
 */
export function relocatePanelTitle(
  files: Array<{ path: string; content: string }>,
  displayName: string,
): PanelTitleResult {
  const stats: PanelTitleStats = { panels: 0, titleRelocated: 0, skipNoTitle: 0 };
  const dn = normalizeAnchorText(displayName);
  const filesOut = files.map((f) => {
    if (!dn || !/<base-panel\b/.test(f.content)) return { ...f, changed: false };
    stats.panels += 1;
    // 已有 title-left 插槽 = 已归位，不重复
    if (/@?title-left/.test(f.content) && /#title-left/.test(f.content)) {
      stats.skipNoTitle += 1;
      return { ...f, changed: false };
    }
    const tree = parseTemplateTree(f.content);
    const hit = tree.nodes.find(
      (n) =>
        n.tag !== '#root' &&
        !n.ownText.includes('{{') &&
        normalizeAnchorText(n.ownText) === dn,
    );
    if (!hit) {
      stats.skipNoTitle += 1;
      return { ...f, changed: false };
    }
    // 注入：base-panel 开标签后补 #title-left 插槽
    const bpOpen = /<base-panel\b[^>]*>/.exec(f.content);
    if (!bpOpen) {
      stats.skipNoTitle += 1;
      return { ...f, changed: false };
    }
    const injectPos = bpOpen.index + bpOpen[0].length;
    const inject = `\n    <template #title-left>${hit.ownText.trim()}</template>`;
    // 🔴 摘除升级：命中文本节点后沿 parent 链向上找「子树全文归一化 == dn 的最外层祖先」，
    // 整体摘除该元素块（含闭标签）。只摘文本节点会残留：① 孤立闭标签（node.end 不含 </tag>）；
    // ② 空壳标题行容器（装饰竖条 bar span 等）→ 预览出现孤立「|」。
    // 保守边界：子树全文一旦 != dn（如 topbar 还含 stats 数字）立即停，绝不吞实质内容。
    const kidsOf = new Map<TplTreeNode, TplTreeNode[]>();
    for (const n of tree.nodes) {
      if (!n.parent || n.parent.tag === '#root') continue;
      const arr = kidsOf.get(n.parent);
      if (arr) arr.push(n);
      else kidsOf.set(n.parent, [n]);
    }
    const subtreeText = (n: TplTreeNode): string =>
      n.ownText + (kidsOf.get(n) ?? []).map(subtreeText).join('');
    let victim = hit;
    for (let p = hit.parent; p && p.tag !== '#root'; p = p.parent) {
      if (normalizeAnchorText(subtreeText(p)) !== dn) break;
      victim = p;
    }
    const closeTag = `</${victim.tag}>`;
    let rmEnd = victim.end;
    if (f.content.slice(rmEnd, rmEnd + closeTag.length) !== closeTag) {
      const found = f.content.indexOf(closeTag, rmEnd);
      if (found >= 0) rmEnd = found + closeTag.length;
    } else {
      rmEnd += closeTag.length;
    }
    // 🔴 先摘除、后注入：注入会使后续坐标偏移 inject.length，混用原坐标必错位
    let rmStart = victim.start;
    while (rmStart > 0 && /[ \t]/.test(f.content[rmStart - 1])) rmStart -= 1;
    let content = f.content.slice(0, rmStart) + f.content.slice(rmEnd);
    const bpOpen2 = /<base-panel\b[^>]*>/.exec(content);
    if (!bpOpen2) {
      stats.skipNoTitle += 1;
      return { path: f.path, content: f.content, changed: false };
    }
    const injectPos2 = bpOpen2.index + bpOpen2[0].length;
    content = content.slice(0, injectPos2) + inject + content.slice(injectPos2);
    // 迁移后标题在内容区遗留的空行清理（连续 3+ 空白行压成 1 行）
    content = content.replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n');
    stats.titleRelocated += 1;
    return { path: f.path, content, changed: true };
  });
  return { files: filesOut, stats };
}

// ───────────────── 面板根内容容器背景清除（微码语义约束） ─────────────────

export interface RootContentBgStats {
  /** 含 base-panel 的文件数（观测） */
  panels: number;
  /** 命中的根内容容器类名数（去重） */
  rootClasses: number;
  /** 清成 transparent 的规则体数（SFC / index.css / .dark / .light 各算一次） */
  cleared: number;
  /** 已是 transparent / none，无需清 */
  skipAlreadyTransparent: number;
  /** 规则体本就没有任何 background 声明 */
  skipNoBackground: number;
  /** base-panel 默认插槽取不到根元素 / 根元素无 class */
  skipNoRootClass: number;
}

export interface RootContentBgResult {
  files: Array<{ path: string; content: string; changed: boolean; edits: Array<{ desc: string }> }>;
  stats: RootContentBgStats;
}

/** 具名插槽属性（`#title-left` / `v-slot:xxx=`）；无此属性 = 默认插槽包裹 */
const NAMED_SLOT_ATTR_RE = /(?:^|\s)(?:#[\w-]+|v-slot(?::[\w-]+)?\s*=)/;

/** base-panel 默认插槽的第一层根元素（跳过具名插槽 template） */
function defaultSlotRoot(bp: TplTreeNode, nodes: TplTreeNode[]): TplTreeNode | undefined {
  for (const k of nodes) {
    if (k.parent !== bp) continue;
    if (k.tag === 'template') {
      if (NAMED_SLOT_ATTR_RE.test(k.attrs)) continue; // 具名插槽 = 面板头部，不是内容区
      const inner = nodes.find((n) => n.parent === k);
      if (inner) return inner;
      continue;
    }
    return k;
  }
  return undefined;
}

/**
 * 面板根内容容器**不该有背景**（用户 2026-11-05 定性）。
 *
 * 微码语义：`base-panel` 外壳负责面板底色 / 圆角 / 阴影；默认插槽里的内容区必须透明。
 * lite 视觉分析会给内容区编一层浅色（83cfb20e/c91f6190 `.c-…-content{background:#E3ECF8}`、
 * 6e59a0d4 `#E4EEF5`）——与外壳双层叠加，且**深色主题破色**（外壳深、内容浅）。
 *
 * 判据（只认微码语义，不查 Figma 真值、不用产物数值反向授权）：
 *   元素 = base-panel 默认插槽的第一层根元素；规则 = 该元素的**单类**选择器
 *   （剥注释 + `.dark`/`.light` 主题前缀后只含一个类 token，挡掉 `.x .y` 后代规则）。
 * 动作：删掉该规则里的 background / background-color / background-image，置 `background: transparent`。
 * 幂等：已是 transparent/none → 计 skipAlreadyTransparent 不动。
 */
export function clearRootContentBackground(
  files: Array<{ path: string; content: string }>,
): RootContentBgResult {
  const stats: RootContentBgStats = {
    panels: 0, rootClasses: 0, cleared: 0,
    skipAlreadyTransparent: 0, skipNoBackground: 0, skipNoRootClass: 0,
  };
  const rootClasses = new Set<string>();

  // ① 收集根内容容器类名（跨文件：SFC 里认元素，规则可能落在 index.css）
  for (const f of files) {
    if (!/\.vue$/.test(f.path) || !/<base-panel\b/.test(f.content)) continue;
    stats.panels += 1;
    let tree: { root: TplTreeNode; nodes: TplTreeNode[] };
    try {
      tree = parseTemplateTree(f.content);
    } catch {
      continue;
    }
    for (const bp of tree.nodes) {
      if (bp.tag !== 'base-panel') continue;
      const root = defaultSlotRoot(bp, tree.nodes);
      if (!root) {
        stats.skipNoRootClass += 1;
        continue;
      }
      const cls = classesFromAttrs(root.attrs);
      if (cls.length === 0) {
        stats.skipNoRootClass += 1;
        continue;
      }
      for (const c of cls) rootClasses.add(c.replace(/--/g, '-'));
    }
  }
  stats.rootClasses = rootClasses.size;
  if (rootClasses.size === 0) {
    return { files: files.map((f) => ({ ...f, changed: false, edits: [] })), stats };
  }

  // ② 逐文件清背景
  const filesOut = files.map((f) => {
    const edits: Array<{ pos: number; end: number; text: string; desc: string }> = [];
    for (const r of collectStyleRulesFromContent(f.content)) {
      // 🔴 首条规则的 selNorm 会带 `<style>` 开头的 `@import '…/index.less';`（真机 83cfb20e 实锤）：
      //   剥注释后仍残留 at-rule，其中的 `.less` 会被当成第二个类 token ⇒ 永远判成"多类"漏清。
      //   取最后一个 `;` 之后的部分才是真选择器。
      const sel = (r.selNorm.replace(/\/\*[\s\S]*?\*\//g, ' ').split(';').pop() ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(\.(?:dark|light)\s+)+/, '');
      const base = sel.replace(/:{1,2}[a-z-]+(\([^)]*\))?/gi, '').trim();
      const toks = base.match(/\.[\w-]+/g) ?? [];
      if (toks.length !== 1) continue; // 后代/多类规则不属于该元素自身
      const cls = toks[0].slice(1);
      if (!rootClasses.has(cls)) continue;

      const body = f.content.slice(r.bodyStart, r.bodyEnd);
      const bgDeclRe = /\n?[ \t]*background(?:-color|-image)?\s*:\s*[^;{}]*;?/gi;
      const decls = [...body.matchAll(bgDeclRe)];
      if (decls.length === 0) {
        stats.skipNoBackground += 1;
        continue;
      }
      if (decls.every((d) => /:\s*(?:transparent|none)\s*(?:!important)?\s*;?$/i.test(d[0].trim()))) {
        stats.skipAlreadyTransparent += 1;
        continue;
      }
      const pad = /\n([ \t]+)\S/.exec(body)?.[1] ?? '  ';
      let newBody = body.replace(bgDeclRe, '');
      if (!newBody.startsWith('\n')) newBody = `\n${newBody}`;
      newBody = `\n${pad}background: transparent;${newBody}`;
      edits.push({ pos: r.bodyStart, end: r.bodyEnd, text: newBody, desc: `rootBgClear:.${cls}` });
      stats.cleared += 1;
    }
    if (edits.length === 0) return { path: f.path, content: f.content, changed: false, edits: [] };
    let content = f.content;
    for (const e of [...edits].sort((a, b) => b.pos - a.pos)) {
      content = content.slice(0, e.pos) + e.text + content.slice(e.end);
    }
    return { path: f.path, content, changed: true, edits: edits.map((e) => ({ desc: e.desc })) };
  });

  return { files: filesOut, stats };
}
