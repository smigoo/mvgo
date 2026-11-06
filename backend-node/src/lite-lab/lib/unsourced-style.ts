/**
 * 闸④ · 无源样式检测（unsourced style detection）
 *
 * 定位（2026-11-06 治理框架）：回填通道只会「补」——真值有 → 写；但 LLM 臆造出来的
 * 样式在 Figma 里**根本没有对应真值**，「补」的逻辑看不见它，于是永远留在产物里。
 * 逐个写删除规则既不可能穷举，也会随新幻觉模式失效。
 *
 * 本模块反过来做**溯源证明**：产物里每一个高风险视觉声明，必须能追到一条 Figma 真值；
 * 追不到就是臆造，按 `verdict` 给出处置建议。好处是**不需要预判 LLM 会臆造什么**。
 *
 * 覆盖四类高风险属性（其余属性暂不纳入，避免噪声淹没信号）：
 *   - `background` / `background-color`   ← Figma fills
 *   - `border*`                            ← Figma strokes
 *   - `border-radius`                      ← Figma cornerRadius
 *   - `box-shadow` / `filter: drop-shadow` ← Figma effects
 *
 * 🔴 判据核心：Figma 里「卡片背景」常常不是 class 对应的那个 GROUP，而是它的**子形状图层**
 *   （实测 741c9eed：`38:3260 GROUP` 无 fill，子 `38:3261 VECTOR` 才承载 265×76 渐变；
 *    11a0ef5f：`48:5798 GROUP` 无 fill，子 `48:5799 RECTANGLE` 才有 SOLID + cornerRadius:6）。
 *   因此真值采集必须下钻「覆盖父容器的形状层」，否则会把**所有**有背景的卡片判成臆造。
 *
 * 🔴 三种 verdict 的语义（不可混用）：
 *   - `delete`   真值明确无（查过且为空）→ 建议删键
 *   - `override` 真值有但值不同           → 建议覆盖
 *   - `fanout`   同构兄弟实例真值不一致   → 单实例样式被泛化，建议拆类或逐实例
 *   `delete` 的前提必须是「查过且为空」，绝不能是「没采到」——那会误删真值。
 */

import type { E2nMap } from './e2n-map';
import { findClassRuleHits, buildStyleRuleIndex, selKeyOf } from './e2n-map';
import { findNodeById } from './truth-matcher';

// ───────────────────────── 类型 ─────────────────────────

export type UnsourcedProp = 'background' | 'border' | 'border-radius' | 'box-shadow';

export type UnsourcedVerdict = 'delete' | 'override' | 'fanout';

export interface UnsourcedFinding {
  /** 产物文件（相对产物根） */
  file: string;
  /** 命中规则的选择器（归一后） */
  selector: string;
  /** 产物类名 */
  cls: string;
  /** 该类名映射到的 Figma 节点 */
  figmaId: string;
  figmaName: string;
  /** 归并后的四类属性（处置口径一致） */
  prop: UnsourcedProp;
  /**
   * 原始 CSS 属性名（`border-bottom` / `border-width` … 不再被压平成 `border`）。
   *
   * 闸③ 要靠它决定删哪一条；也正因为长手属性会被压平，「只删一条长手」可能让边框
   * **更明显**（删掉 `border-color` 后宽度+样式仍在 ⇒ 回落 `currentColor`），
   * 故 border 族的处置必须整族一起，不能逐条。
   */
  rawProp: string;
  /** 产物写的值 */
  value: string;
  verdict: UnsourcedVerdict;
  /** 可独立复核的判据说明 */
  evidence: string;

  // ── 定位信息（闸③ 写盘用；全部是**文件内容内的绝对偏移**）──────────────────
  /** 命中规则体的起点（在 `{` 之后） */
  bodyStart: number;
  /** 命中规则体的终点（在 `}` 之前） */
  bodyEnd: number;
  /** 删除时覆盖的区间：含本行前导空白/换行与尾随 `;`，删完不留空行 */
  declStart: number;
  declEnd: number;
  /** 覆盖时只替换值，保留原属性名/缩进/分号 */
  valueStart: number;
  valueEnd: number;

  /**
   * 真值的 **CSS 可写形态**（仅 `override` 且真值可机器读取时给出）。
   * 没有它，闸③ 就只能「删」不能「改」——这是闸③ 的第一阻塞。
   */
  truthValue?: string;
}

export interface UnsourcedStats {
  /** 有 e2n 映射、被检查的类名数 */
  classesScanned: number;
  /** 没找到对应 Figma 节点而跳过的类名数（不计入 findings） */
  classesSkipped: number;
  /**
   * 🔴 产物里声明了高风险属性、但**没有 e2n 映射**因而未被检查的类名。
   *
   * 没有这个字段，e2n 覆盖不足时闸④ 会静默返回 0 findings（看似干净、实为没扫），
   * 正是最难发现的一类假绿。真机 741c9eed 实锤：e2n 只映射 5 个容器（missSeeds=66），
   * `.c-equipment-monitor-stat-card` 整条不在映射里，若不显式列出就永远查不到它。
   */
  unmappedRiskClasses: string[];
  findings: number;
  delete: number;
  override: number;
  fanout: number;
  /** 按属性分布 */
  byProp: Record<UnsourcedProp, number>;
}

export interface DetectUnsourcedOptions {
  figmaRoot: any;
  prodFiles: Array<{ path: string; content: string }>;
  e2n?: E2nMap;
}

// ───────────────────────── Figma 真值采集 ─────────────────────────

/** 节点样式真值签名（含来源节点，便于裁决时人工复核） */
export interface NodeStyleTruth {
  hasFill: boolean;
  hasStroke: boolean;
  /** `null` = Figma 未设置圆角（等价 0） */
  cornerRadius: number | null;
  hasShadow: boolean;
  /**
   * 子树里是否存在「细长填充形状」（宽≈父宽、高≤4px）。
   *
   * 用途：LLM 常把 Figma 的分隔线形状渲染成 `border-bottom`。若只查 strokes，
   * 这种「形态转换」会被误判成臆造并建议删除，导致本该保留的分隔线丢失。
   * 有这条线 ⇒ border 视为「有真值形态」而不报 delete（值是否准确交给 override 通道）。
   */
  hasRuleShape: boolean;
  /** 真值来自哪个节点（自身 or 下钻到的形状层） */
  sourceNodeId: string;
  /** fill 的 CSS 化描述（供 override 证据；多值用 ` | ` 连接） */
  fillCss?: string;
  /** 同构兄弟节点的 fill 描述（用于 fanout 判定；含自身） */
  siblingFills?: string[];
}

const SHAPE_TYPES = new Set(['RECTANGLE', 'VECTOR', 'ELLIPSE', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON']);

function bboxOf(node: any): { x: number; y: number; width: number; height: number } | undefined {
  const bb = node?.absoluteBoundingBox;
  if (!bb || typeof bb.width !== 'number' || typeof bb.height !== 'number') return undefined;
  return { x: bb.x ?? 0, y: bb.y ?? 0, width: bb.width, height: bb.height };
}

function hex255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/**
 * 把 Figma fill 转成可读 CSS 片段（仅用于证据文本，不参与值比对）。
 * 与 `_checkCssReproducible` 的口径一致：SOLID → hex(+alpha)；GRADIENT → `gradient(<stops>)`。
 */
function fillToCss(fill: any): string | undefined {
  if (!fill || fill.visible === false) return undefined;
  if (fill.type === 'SOLID' && fill.color) {
    const { r, g, b } = fill.color;
    const a = typeof fill.opacity === 'number' ? fill.opacity : (fill.color.a ?? 1);
    const hex = `#${hex255(r).toString(16).padStart(2, '0')}${hex255(g)
      .toString(16)
      .padStart(2, '0')}${hex255(b).toString(16).padStart(2, '0')}`;
    return a < 1 ? `${hex}@${Math.round(a * 100)}%` : hex;
  }
  if (typeof fill.type === 'string' && fill.type.startsWith('GRADIENT') && Array.isArray(fill.gradientStops)) {
    const stops = fill.gradientStops
      .slice()
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      .map((s: any) => {
        const c = s.color ?? {};
        const a = typeof s.opacity === 'number' ? s.opacity : (c.a ?? 1);
        const hex = `#${hex255(c.r ?? 0).toString(16).padStart(2, '0')}${hex255(c.g ?? 0)
          .toString(16)
          .padStart(2, '0')}${hex255(c.b ?? 0).toString(16).padStart(2, '0')}`;
        const pa = typeof fill.opacity === 'number' ? fill.opacity : a;
        return pa < 1 ? `${hex}@${Math.round(pa * 100)}%` : hex;
      });
    return `gradient(${stops.join('→')})`;
  }
  if (fill.type === 'IMAGE') return 'image';
  return undefined;
}

/** 节点全部可见 fill 的 CSS 描述（按顺序） */
function visibleFillCssOf(node: any): string[] {
  const fills = Array.isArray(node?.fills) ? node.fills : [];
  return fills.map(fillToCss).filter((x): x is string => !!x);
}

/** 是否存在可见描边（strokes 非空且至少一条非透明） */
function hasVisibleStroke(node: any): boolean {
  const strokes = Array.isArray(node?.strokes) ? node.strokes : [];
  return strokes.some((s: any) => {
    if (!s || s.visible === false) return false;
    if (s.type === 'SOLID' && s.color) return (s.color.a ?? 1) > 0.01;
    // 渐变描边同样算「有描边」——741c9eed 的 stat-card 就是 GRADIENT_LINEAR 描边
    return typeof s.type === 'string' && s.type.startsWith('GRADIENT');
  });
}

/** 是否存在可见阴影（DROP_SHADOW / INNER_SHADOW + visible） */
function hasVisibleShadow(node: any): boolean {
  const effects = Array.isArray(node?.effects) ? node.effects : [];
  return effects.some(
    (e: any) =>
      e &&
      e.visible !== false &&
      (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') &&
      typeof e.radius === 'number' &&
      e.radius > 0,
  );
}

function cornerRadiusOf(node: any): number | null {
  if (typeof node?.cornerRadius === 'number') return node.cornerRadius;
  const radii = node?.rectangleCornerRadii;
  if (Array.isArray(radii) && radii.length > 0) {
    const max = Math.max(...radii.filter((n) => typeof n === 'number'));
    return Number.isFinite(max) ? max : null;
  }
  return null;
}

/**
 * 找「覆盖父容器的形状层」后代 —— 卡片背景/描边的真实载体。
 *
 * 判据：形状类节点（RECTANGLE/VECTOR/ELLIPSE/…）且 bbox 在**原始父容器** bbox 的 ±2px 容差内。
 * 🔴 递归时必须始终以**最初的那个父容器**为参照（`origin`），不能切换成中间层：
 *   否则 `card > inner(430×41) > inner-bg(430×41)` 会在第二层命中，
 *   把内层内容组的底色误当成卡片背景（真机单测实锤：圆角真值因此查成 null）。
 * 只下钻 2 跳：真实稿的「背景层」不会埋得更深，过深下钻会把图标内部形状误当背景。
 */
function findCoveringShapeLayer(parent: any, depth = 0, origin?: any): any | undefined {
  if (!parent || depth > 2) return undefined;
  const anchor = origin ?? parent;
  const pb = bboxOf(anchor);
  if (!pb) return undefined;
  const kids = Array.isArray(parent.children) ? parent.children : [];
  for (const c of kids) {
    if (!c || typeof c !== 'object') continue;
    const cb = bboxOf(c);
    const isShape = SHAPE_TYPES.has(String(c.type || '').toUpperCase());
    if (isShape && cb) {
      const tol = 2;
      const covers =
        Math.abs(cb.width - pb.width) <= tol &&
        Math.abs(cb.height - pb.height) <= tol &&
        Math.abs(cb.x - pb.x) <= tol &&
        Math.abs(cb.y - pb.y) <= tol;
      if (covers) return c;
    }
    const deep = findCoveringShapeLayer(c, depth + 1, anchor);
    if (deep) return deep;
  }
  return undefined;
}

/**
 * 子树是否含「细长填充形状」—— Figma 里表达分隔线的常见形态（宽覆盖父容器、高 ≤4px）。
 * 用于避免把「LLM 用 border-bottom 表达 Figma 线条」误判成臆造。
 */
function hasThinRuleShape(node: any, depth = 0): boolean {
  if (!node || depth > 3) return false;
  const pb = bboxOf(node);
  const kids = Array.isArray(node.children) ? node.children : [];
  for (const c of kids) {
    if (!c || typeof c !== 'object') continue;
    const cb = bboxOf(c);
    if (pb && cb && cb.width >= pb.width * 0.8 && cb.height <= 4 && visibleFillCssOf(c).length > 0) {
      return true;
    }
    if (hasThinRuleShape(c, depth + 1)) return true;
  }
  return false;
}

/**
 * 采集单个节点的样式真值。
 * 自身有 fill 就用自身；否则下钻「覆盖父容器的形状层」（真机两类卡片都是这种结构）。
 */
export function collectNodeStyleTruth(figmaRoot: any, nodeId: string): NodeStyleTruth | undefined {
  const node = findNodeById(figmaRoot, nodeId);
  if (!node) return undefined;

  const selfFills = visibleFillCssOf(node);
  const layer = selfFills.length === 0 ? findCoveringShapeLayer(node) : undefined;
  const effective = layer ?? node;

  const fills = visibleFillCssOf(effective);
  const radius = cornerRadiusOf(effective) ?? cornerRadiusOf(node);

  return {
    hasFill: fills.length > 0,
    hasStroke: hasVisibleStroke(effective) || hasVisibleStroke(node),
    cornerRadius: radius,
    hasShadow: hasVisibleShadow(effective) || hasVisibleShadow(node),
    hasRuleShape: hasThinRuleShape(node),
    sourceNodeId: effective.id ?? node.id,
    fillCss: fills.length > 0 ? fills.join(' | ') : undefined,
  };
}

/**
 * 同构兄弟的 fill 变体（用于 `fanout` 判定：单实例样式被泛化）。
 *
 * 判据：同父、同 type、bbox 尺寸相同（±1px）。真机 11a0ef5f 的 6 张卡正是这样：
 * 同父 `565:3 slot-con`、同为 GROUP、同为 470×72，但 fill 是
 * `#A6CEFF` ×1 + `#FFFFFF@43%` ×5 —— 产物却把 `#a6ceff` 套给了全部 6 张。
 */
export function collectSiblingFillVariants(figmaRoot: any, nodeId: string): string[] | undefined {
  const node = findNodeById(figmaRoot, nodeId);
  const bb = bboxOf(node);
  if (!node || !bb) return undefined;

  // 找父节点
  let parent: any;
  const walk = (n: any) => {
    if (!n || typeof n !== 'object' || parent) return;
    for (const c of Array.isArray(n.children) ? n.children : []) {
      if (c?.id === nodeId) {
        parent = n;
        return;
      }
      walk(c);
    }
  };
  walk(figmaRoot);
  if (!parent) return undefined;

  const sibs = (Array.isArray(parent.children) ? parent.children : []).filter((c: any) => {
    if (!c || String(c.type || '') !== String(node.type || '')) return false;
    const cb = bboxOf(c);
    return cb && Math.abs(cb.width - bb.width) <= 1 && Math.abs(cb.height - bb.height) <= 1;
  });
  if (sibs.length < 2) return undefined;

  const variants = sibs.map((c: any) => {
    const self = visibleFillCssOf(c);
    if (self.length > 0) return self.join('|');
    const layer = findCoveringShapeLayer(c);
    const viaLayer = layer ? visibleFillCssOf(layer) : [];
    return viaLayer.length > 0 ? viaLayer.join('|') : '(none)';
  });
  return variants;
}

// ───────────────────────── 产物侧声明解析 ─────────────────────────

interface ProdDecl {
  prop: UnsourcedProp;
  /** 原始属性名（未归并），闸③ 靠它定位 */
  rawProp: string;
  value: string;
  /** 删除区间（含前导换行/空白 + 尾随分号） */
  declStart: number;
  declEnd: number;
  /** 值区间（覆盖用） */
  valueStart: number;
  valueEnd: number;
}

/**
 * 从 CSS 规则体读四类高风险声明（不解析其它属性，避免噪声）。
 *
 * @param body 规则体文本
 * @param baseOffset body 首字符在**文件内容**中的绝对偏移（闸③ 写盘需要绝对定位）
 */
function readHighRiskDecls(body: string, baseOffset = 0): ProdDecl[] {
  const out: ProdDecl[] = [];
  const declRe = /([-a-zA-Z]+)\s*:\s*([^;{}]+)(?=;|$)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(body)) !== null) {
    const rawProp = m[1].trim();
    const propLower = rawProp.toLowerCase();
    const rawValue = m[2];
    const value = rawValue.trim();
    if (!value) continue;

    // 值区间：`m[2]` 恒为 `m[0]` 的尾部，先减去其长度再补前导空白
    const rawStart = m.index + m[0].length - rawValue.length;
    const lead = rawValue.length - rawValue.trimStart().length;
    const valueStart = baseOffset + rawStart + lead;
    const valueEnd = valueStart + value.length;

    // 删除区间：向左吃掉本行缩进与换行（删完不留空行），向右吃掉尾随分号
    let s = m.index;
    while (s > 0 && (body[s - 1] === ' ' || body[s - 1] === '\t')) s -= 1;
    if (s > 0 && body[s - 1] === '\n') s -= 1;
    let e = m.index + m[0].length;
    while (e < body.length && (body[e] === ' ' || body[e] === '\t')) e += 1;
    if (body[e] === ';') e += 1;

    let prop: UnsourcedProp;
    if (propLower === 'background' || propLower === 'background-color') {
      prop = 'background';
    } else if (propLower === 'border-radius') {
      prop = 'border-radius';
    } else if (propLower === 'box-shadow') {
      prop = 'box-shadow';
    } else if (propLower === 'border' || propLower.startsWith('border-')) {
      // border-width / border-style / border-color 分别判会更细，但处置一致，合并到 border
      prop = 'border';
    } else {
      continue;
    }
    out.push({
      prop,
      rawProp,
      value,
      declStart: baseOffset + s,
      declEnd: baseOffset + e,
      valueStart,
      valueEnd,
    });
  }
  return out;
}

/** 解析 px 数值（`8px` / `8px 12px` 取首个；非 px 单位返回 null 表示不可静态判定） */
function firstPx(value: string): number | null {
  const m = value.match(/(-?\d+(?:\.\d+)?)\s*px/);
  return m ? Number(m[1]) : null;
}

/** 判断 background 值是否已交给 bg 通道（url / 主题变量 / transparent 不参与本闸判定） */
function isBackgroundManagedElsewhere(value: string): boolean {
  const v = value.toLowerCase();
  if (v.includes('url(')) return true;
  if (v.includes('var(')) return true;
  if (v.trim() === 'transparent' || v.trim() === 'none') return true;
  // 纯渐变已由 fill/gradient 通道负责，重复报会淹没有效信号
  if (v.includes('gradient(')) return true;
  return false;
}

// ───────────────────────── 主入口 ─────────────────────────

export function detectUnsourcedStyles(opts: DetectUnsourcedOptions): {
  findings: UnsourcedFinding[];
  stats: UnsourcedStats;
} {
  const findings: UnsourcedFinding[] = [];
  const stats: UnsourcedStats = {
    classesScanned: 0,
    classesSkipped: 0,
    unmappedRiskClasses: [],
    findings: 0,
    delete: 0,
    override: 0,
    fanout: 0,
    byProp: { background: 0, border: 0, 'border-radius': 0, 'box-shadow': 0 },
  };

  const { figmaRoot, prodFiles } = opts;
  if (!figmaRoot || prodFiles.length === 0) return { findings, stats };

  // 🔴 没有 e2n **就是空转**，不存在「退化成按类名全局找节点」的兜底（早前注释写错了）：
  //   `classToFigmas` 只从 `e2n.nodes` 构建，为空即直接 return（下面 size===0 的分支）。
  //   因此把本闸挂到只有 figmaRoot、没有 e2n 的链路（如 `file-writer.js`）会静默返回 0 条，
  //   看起来「很干净」，实则一条都没查 —— 与 `unmappedRiskClasses` 同源的假绿。
  const index = buildStyleRuleIndex(prodFiles);

  // class → Figma 节点候选（同一 class 常被多条边引用：v-for 单实例内容组 + 外层卡片容器）
  // 🔴 取 bbox 面积**最大**的那个作为代表：实测 11a0ef5f 的 `.c-deployment-node-overview-card`
  //   同时映射到 `48:5801`（430×41 内层内容组）与 `48:5798`（470×72 卡片容器），
  //   取第一条会拿到内层组 ⇒ 背景/圆角真值全部查空 ⇒ 整卡被误判成臆造。
  //   容器优先是唯一正确的选择：背景/描边/圆角都挂在外层容器或它的形状层上。
  const classToFigmas = new Map<string, Array<{ figmaId: string; figmaName: string; area: number }>>();
  for (const edge of opts.e2n?.nodes ?? []) {
    const area = (() => {
      const bb = bboxOf(findNodeById(figmaRoot, edge.figmaId));
      return bb ? bb.width * bb.height : 0;
    })();
    for (const cls of edge.classes ?? []) {
      if (!cls) continue;
      const list = classToFigmas.get(cls) ?? [];
      if (!list.some((x) => x.figmaId === edge.figmaId)) {
        list.push({ figmaId: edge.figmaId, figmaName: edge.figmaName, area });
      }
      classToFigmas.set(cls, list);
    }
  }
  if (classToFigmas.size === 0) return { findings, stats };

  const truthCache = new Map<string, NodeStyleTruth | undefined>();
  const variantCache = new Map<string, string[] | undefined>();

  // 🔴 反向覆盖统计：产物里**实际声明了**高风险属性的类名。
  //   它减去「已检查」，剩下的就是闸④ 的盲区（e2n 没映射到 ⇒ 无法溯源 ⇒ 无声放过）。
  //   治本方向是补 e2n 覆盖；但在那之前，盲区必须可见，否则 findings=0 看起来像「很干净」。
  //   用「产物模板里真实出现的 class」做白名单：<style> 的选择器扫描会把
  //   `@import '...common.less'`、裸 `5px` 之类的碎片当成类名（真机复现），
  //   不滤掉会污染盲区清单、让人误判覆盖面。
  //   白名单取自模板（`class="..."` / `:class` 字面量键），而不是 e2n.prodNodes ——
  //   后者只含**已映射**元素，用它过滤会把「恰恰是没映射的真盲区」一起滤掉。
  const realClasses = new Set<string>();
  for (const f of prodFiles) {
    for (const m of f.content.matchAll(/\bclass\s*=\s*"([^"]*)"/g)) {
      for (const t of m[1].split(/\s+/)) if (t) realClasses.add(t);
    }
    for (const m of f.content.matchAll(/:class\s*=\s*"\{([^}]*)\}"/g)) {
      for (const k of m[1].matchAll(/['"]([\w-]+)['"]\s*:/g)) realClasses.add(k[1]);
    }
  }
  const declaredRiskClasses = new Set<string>();
  for (const f of index.files) {
    for (const rule of f.rules) {
      const body = f.content.slice(rule.bodyStart, rule.bodyEnd);
      if (readHighRiskDecls(body).length === 0) continue;
      const selBase = rule.selNorm.replace(/:{1,2}[a-z-]+(\([^)]*\))?/gi, '');
      for (const token of selBase.match(/\.[\w-]+/g) ?? []) {
        const cls = token.slice(1);
        if (realClasses.size > 0 && !realClasses.has(cls)) continue;
        declaredRiskClasses.add(cls);
      }
    }
  }

  for (const [cls, candidates] of classToFigmas) {
    const hits = findClassRuleHits(index, cls);
    if (hits.length === 0) continue;
    stats.classesScanned += 1;

    const ranked = candidates.slice().sort((a, b) => b.area - a.area);
    const mapped = ranked[0];
    if (!truthCache.has(mapped.figmaId)) {
      truthCache.set(mapped.figmaId, collectNodeStyleTruth(figmaRoot, mapped.figmaId));
    }
    const truth = truthCache.get(mapped.figmaId);
    if (!truth) {
      stats.classesSkipped += 1;
      continue;
    }

    // 同一 class 的多个 figma 实例各自 fill —— 直接就是 fanout 判据（比「找同构兄弟」更可靠：
    // 兄弟判定依赖父链遍历，而 e2n 已经把实例清单摆在这里了）
    const instanceFills = candidates
      .map((c) => {
        if (!truthCache.has(c.figmaId)) {
          truthCache.set(c.figmaId, collectNodeStyleTruth(figmaRoot, c.figmaId));
        }
        return truthCache.get(c.figmaId)?.fillCss ?? '(none)';
      })
      .filter((x) => !!x);

    for (const hit of hits) {
      const body = hit.file.content.slice(hit.rule.bodyStart, hit.rule.bodyEnd);
      const selector = selKeyOf(hit.rule.selNorm);
      for (const decl of readHighRiskDecls(body, hit.rule.bodyStart)) {
        const finding = judge({
          cls,
          mapped,
          truth,
          decl,
          file: hit.file.path,
          selector,
          bodyStart: hit.rule.bodyStart,
          bodyEnd: hit.rule.bodyEnd,
          figmaRoot,
          variantCache,
          instanceFills,
        });
        if (!finding) continue;
        findings.push(finding);
        stats.findings += 1;
        stats[finding.verdict] += 1;
        stats.byProp[finding.prop] += 1;
      }
    }
  }

  stats.unmappedRiskClasses = [...declaredRiskClasses]
    .filter((c) => !classToFigmas.has(c))
    .sort();

  return { findings, stats };
}

function judge(args: {
  cls: string;
  mapped: { figmaId: string; figmaName: string };
  truth: NodeStyleTruth;
  decl: ProdDecl;
  file: string;
  selector: string;
  bodyStart: number;
  bodyEnd: number;
  figmaRoot: any;
  variantCache: Map<string, string[] | undefined>;
  /** 同一产物 class 对应的全部 Figma 实例的 fill（>1 且不一致 ⇒ fanout） */
  instanceFills: string[];
}): UnsourcedFinding | undefined {
  const {
    cls,
    mapped,
    truth,
    decl,
    file,
    selector,
    bodyStart,
    bodyEnd,
    figmaRoot,
    variantCache,
    instanceFills,
  } = args;
  const base = {
    file,
    selector,
    cls,
    figmaId: mapped.figmaId,
    figmaName: mapped.figmaName,
    prop: decl.prop,
    rawProp: decl.rawProp,
    value: decl.value,
    bodyStart,
    bodyEnd,
    declStart: decl.declStart,
    declEnd: decl.declEnd,
    valueStart: decl.valueStart,
    valueEnd: decl.valueEnd,
  };

  if (decl.prop === 'background') {
    if (isBackgroundManagedElsewhere(decl.value)) return undefined;
    if (!truth.hasFill) {
      return {
        ...base,
        verdict: 'delete',
        evidence: `Figma 节点 ${mapped.figmaId} 自身及其覆盖形状层均无可见 fill ⇒ background 无真值来源`,
      };
    }
    // 有 fill：再查「多实例是否一致」，不一致就是单实例泛化
    const uniqInstance = [...new Set(instanceFills)];
    if (instanceFills.length >= 2 && uniqInstance.length > 1) {
      return {
        ...base,
        verdict: 'fanout',
        evidence:
          `同一 class 对应 ${instanceFills.length} 个 Figma 实例，fill 不一致（${uniqInstance.join(' / ')}）⇒ ` +
          `单个 class 无法表达，当前值只对应其中一类`,
      };
    }
    // 实例清单只有 1 个时，再按「同构兄弟」兜底（e2n 未覆盖全部卡片的情形）
    if (!variantCache.has(mapped.figmaId)) {
      variantCache.set(mapped.figmaId, collectSiblingFillVariants(figmaRoot, mapped.figmaId));
    }
    const variants = variantCache.get(mapped.figmaId);
    if (variants && variants.length >= 2) {
      const uniq = [...new Set(variants)];
      if (uniq.length > 1) {
        return {
          ...base,
          verdict: 'fanout',
          evidence:
            `同构兄弟 ${variants.length} 个实例的 fill 不一致（${uniq.join(' / ')}）⇒ ` +
            `单个 class 无法表达，当前值只对应其中一类`,
        };
      }
    }
    return undefined;
  }

  if (decl.prop === 'border-radius') {
    const px = firstPx(decl.value);
    if (truth.cornerRadius == null) {
      return {
        ...base,
        verdict: 'delete',
        evidence: `Figma 节点 ${mapped.figmaId} 及形状层均未设置 cornerRadius ⇒ 圆角无真值来源`,
      };
    }
    if (px != null && Math.abs(px - truth.cornerRadius) > 0.5) {
      return {
        ...base,
        verdict: 'override',
        // 唯一有机器可读真值的 override：数值型 px，可直接写盘
        truthValue: `${truth.cornerRadius}px`,
        evidence: `真值 cornerRadius=${truth.cornerRadius}px（${truth.sourceNodeId}），产物 ${px}px`,
      };
    }
    return undefined;
  }

  if (decl.prop === 'border') {
    if (truth.hasStroke) return undefined;
    if (truth.hasRuleShape) {
      // Figma 用「细长填充形状」表达分隔线，产物用 border 表达同一视觉 —— 形态转换，不算臆造
      return undefined;
    }
    return {
      ...base,
      verdict: 'delete',
      evidence: `Figma 节点 ${mapped.figmaId} 及形状层 strokes 为空、子树亦无细长填充形状 ⇒ 边框无真值来源`,
    };
  }

  if (decl.prop === 'box-shadow') {
    if (!truth.hasShadow) {
      return {
        ...base,
        verdict: 'delete',
        evidence: `Figma 节点 ${mapped.figmaId} 及形状层无可见 DROP_SHADOW/INNER_SHADOW effect ⇒ 阴影无真值来源`,
      };
    }
    return undefined;
  }

  return undefined;
}

// ───────────────────────── 渲染 ─────────────────────────

const VERDICT_LABEL: Record<UnsourcedVerdict, string> = {
  delete: '应删除（无真值来源）',
  override: '应覆盖（真值不符）',
  fanout: '应拆类（多实例真值不一致）',
};

const PROP_LABEL: Record<UnsourcedProp, string> = {
  background: '背景',
  border: '边框',
  'border-radius': '圆角',
  'box-shadow': '阴影',
};

/** 渲染成 markdown 一节（并入 backfill-plan.md / conflicts.md） */
export function renderUnsourcedMarkdown(findings: UnsourcedFinding[], stats: UnsourcedStats): string {
  const lines: string[] = [];
  lines.push('## 无源样式检测');
  lines.push('');
  lines.push(
    `扫描 ${stats.classesScanned} 个有映射的类名（跳过 ${stats.classesSkipped} 个未定位节点），` +
      `命中 **${stats.findings}** 处：应删除 ${stats.delete} / 应覆盖 ${stats.override} / 应拆类 ${stats.fanout}。`,
  );

  if (findings.length === 0) {
    lines.push('');
    lines.push('未发现无真值来源的视觉声明。');
  } else {
    lines.push('');
    lines.push('| 类名 | 属性 | 产物值 | 判定 | 图节点 | 判据 |');
    lines.push('|---|---|---|---|---|---|');
    for (const f of findings) {
      lines.push(
        `| \`${f.cls}\` | ${PROP_LABEL[f.prop]} | \`${f.value.slice(0, 40)}\` | ${VERDICT_LABEL[f.verdict]} | ` +
          `${f.figmaId} ${f.figmaName} | ${f.evidence} |`,
      );
    }
  }

  // 🔴 盲区必须显式列出：这些类名声明了视觉属性却没有 Figma 映射，本闸**没查过**它们。
  //   不写出来，读报告的人会把「findings=0」误读成「没有问题」。
  if (stats.unmappedRiskClasses.length > 0) {
    lines.push('');
    lines.push(
      `> ⚠️ 以下 ${stats.unmappedRiskClasses.length} 个类名声明了视觉属性但**没有 Figma 节点映射**，` +
        `本闸未覆盖（须先补 E2N 覆盖）：\`${stats.unmappedRiskClasses.join('`, `')}\``,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** 供 service 层做一行统计日志（逐字段枚举，新计数不会自动出现） */
export function unsourcedStatsLine(stats: UnsourcedStats): string {
  return (
    `unsourcedScanned=${stats.classesScanned},unsourcedFindings=${stats.findings},` +
    `unsourcedDelete=${stats.delete},unsourcedOverride=${stats.override},` +
    `unsourcedFanout=${stats.fanout},unsourcedUnmapped=${stats.unmappedRiskClasses.length}`
  );
}

/**
 * 闸③ v1-lite 的**可落地集合**（单一来源）。
 *
 * 🔴 apply 模块与「落地后收敛断言」必须共用本函数——两处各写一份判据，就会
 * 出现「落地了 A、断言只查 B」的自证假绿。
 *
 * 只收两类（真值硬、误删代价低）：
 *   · `delete` + `box-shadow` —— 真值确实没有阴影，删掉不改变布局
 *   · `override` + `border-radius` + 有 `truthValue` —— 唯一有数值真值的覆盖
 *
 * 明确**不落地**：
 *   · `fanout` —— 需要拆类；单值删除会让多数实例一起失去真值（11a0ef5f 12 卡）
 *   · `background` / `border` 的 delete —— 背景常由祖先提供、border 长手属性删一条
 *     反而会让边框更实（`border-color` 缺失回落 `currentColor`），留待第二/三档
 */
export function isAutoApplicable(f: UnsourcedFinding): boolean {
  if (f.verdict === 'delete') return f.prop === 'box-shadow';
  if (f.verdict === 'override') return f.prop === 'border-radius' && !!f.truthValue;
  return false;
}

/** 可落地项计数（收敛断言用：落地后必须归零） */
export function countAutoApplicable(findings: UnsourcedFinding[]): number {
  return findings.filter(isAutoApplicable).length;
}
