/**
 * E2N 映射：视觉分析产物 ↔ Figma 节点的结构对应（2026-11-05 立项）
 *
 * 背景：产物结构是 LLM 视觉分析生成的（模板 + CSS），Figma 是设计结构，两者没有共同 id。
 * 旧回填靠点对点启发式（文本精确匹配 / 文件名语义 / 尺寸巧合 / AI 读图），判据互不一致，
 * 落点常被"哪条规则碰巧有 background 键"决定（6e59a0d4：bg-7890 挂到 .tab 而非 .tabs）。
 *
 * 本模块建一张映射表，之后所有回填只查表：
 *   1) 产物**实例化**：v-for 展开 + 插值取 script 字面量（否则两边形态不同，无法比较）
 *   2) 文本 seed：按**文本值**匹配（禁按序——真机 12 卡与 nav 顺序都与 Figma 不同）
 *   3) 祖先传播：子树内**已 seed** 集合相等且候选唯一 → 建边
 *
 * 🔴 授权纪律：产物 CSS 里的任何数值（height/background 键）都是 LLM 产出，**不作授权证据**；
 *   容器级资源判定只用 Figma 内部事实（资源 bbox ≈ 父容器 bbox）。
 */
import {
  classMatchesSelector,
  collectStyleRulesFromContent,
  importDepthFor,
  normalizeAnchorText,
  parseTemplateTree,
  type TplTreeNode,
} from './truth-matcher';

// ───────────────────────── 类型 ─────────────────────────

export interface E2nProdNode {
  /** 稳定标识 `<path>#<start>` */
  key: string;
  path: string;
  tag: string;
  classes: string[];
  start: number;
  end: number;
  parentKey?: string;
  /** 本节点直系静态文本片段 */
  ownStatic: string[];
  /** 本节点直系插值展开值（v-for 别名 → 全值） */
  ownInterp: string[];
  /** 本节点直系插值单实例值（v-for 取一项） */
  ownInterpSingle: string[];
  /** 该节点渲染一次产生的全部文本（含内部 v-for 展开） */
  renderTexts: string[];
  /** 单实例文本（v-for 元素取一项；非 v-for 等于 renderTexts） */
  instanceTexts: string[];
  /** v-for 展开次数（1 = 非 v-for） */
  vforCount: number;
  /** 单实例产出的文本节点数（文本槽位；用于判断 Figma 单卡 ↔ 产物的形状是否装得下） */
  instTextNodes: number;
  vforAlias?: string;
  vforList?: string;
}

export interface E2nSeed {
  figmaId: string;
  text: string;
  prodKey: string;
  how: 'text-exact' | 'text-partial';
  /** 同一文本在产物里命中的节点数（>1 时该 seed 不可用于消歧） */
  candidates: number;
}

export interface E2nNodeEdge {
  figmaId: string;
  figmaType: string;
  figmaName: string;
  prodKey: string;
  prodPath: string;
  /** 产物元素的类名（挂载时择优取规则） */
  classes: string[];
  how: 'subtree-set-equal' | 'vfor-unit';
  /** 该 Figma 容器子树内已 seed 的文本数 */
  matched: number;
  /** v-for 单元的实例数（仅 how=vfor-unit 有意义） */
  instCount: number;
  unique: boolean;
}

export interface E2nMulti {
  figmaId: string;
  figmaName: string;
  prodKeys: string[];
}

export interface E2nMap {
  seeds: E2nSeed[];
  nodes: E2nNodeEdge[];
  multi: E2nMulti[];
  unmapped: Array<{ figmaId?: string; prodKey?: string; reason: string }>;
  prodNodes: E2nProdNode[];
  stats: {
    prodNodes: number;
    figmaTexts: number;
    seeds: number;
    ambiguousSeeds: number;
    partialSeeds: number;
    missSeeds: number;
    nodes: number;
    multi: number;
    /** 并列候选同链、按最外层定边的次数 */
    depthResolved: number;
    figmaContainers: number;
  };
}

export interface BuildE2nOptions {
  /** 只处理这些产物文件（默认全部；通常传 package/*.vue + styles） */
  files?: string[];
}

// ───────────────────────── 轻量字面量解析（script 里 const x = [...] / {...}） ─────────────────────────

type Lit =
  | { k: 'str'; v: string }
  | { k: 'num'; v: number }
  | { k: 'bool'; v: boolean }
  | { k: 'null' }
  | { k: 'arr'; v: Lit[] }
  | { k: 'obj'; v: Record<string, Lit> }
  | { k: 'ref'; v: string }
  | { k: 'unknown' };

function skipWs(src: string, i: number): number {
  while (i < src.length && /\s/.test(src[i])) i += 1;
  return i;
}

function parseLiteral(src: string, i: number): { lit: Lit; next: number } {
  i = skipWs(src, i);
  const ch = src[i];
  if (ch === undefined) return { lit: { k: 'unknown' }, next: i };
  if (ch === '"' || ch === "'" || ch === '`') {
    const quote = ch;
    let j = i + 1;
    let out = '';
    while (j < src.length && src[j] !== quote) {
      if (src[j] === '\\' && j + 1 < src.length) { out += src[j + 1]; j += 2; continue; }
      out += src[j];
      j += 1;
    }
    return { lit: { k: 'str', v: out }, next: j + 1 };
  }
  if (ch === '[') {
    const arr: Lit[] = [];
    let j = i + 1;
    for (;;) {
      j = skipWs(src, j);
      if (src[j] === ']' || src[j] === undefined) return { lit: { k: 'arr', v: arr }, next: j + 1 };
      const r = parseLiteral(src, j);
      arr.push(r.lit);
      j = skipWs(src, r.next);
      if (src[j] === ',') j += 1;
    }
  }
  if (ch === '{') {
    const obj: Record<string, Lit> = {};
    let j = i + 1;
    for (;;) {
      j = skipWs(src, j);
      if (src[j] === '}' || src[j] === undefined) return { lit: { k: 'obj', v: obj }, next: j + 1 };
      let key = '';
      if (src[j] === '"' || src[j] === "'") {
        const r = parseLiteral(src, j);
        key = r.lit.k === 'str' ? r.lit.v : '';
        j = r.next;
      } else {
        const m = /^[\w$]+/.exec(src.slice(j));
        key = m ? m[0] : '';
        j += key.length;
      }
      j = skipWs(src, j);
      if (src[j] === ':') j += 1;
      const r = parseLiteral(src, j);
      if (key) obj[key] = r.lit;
      j = skipWs(src, r.next);
      if (src[j] === ',') j += 1;
    }
  }
  const numM = /^-?\d+(?:\.\d+)?/.exec(src.slice(i));
  if (numM) return { lit: { k: 'num', v: Number(numM[0]) }, next: i + numM[0].length };
  const idM = /^[\w$.]+/.exec(src.slice(i));
  if (idM) {
    const word = idM[0];
    if (word === 'true') return { lit: { k: 'bool', v: true }, next: i + 4 };
    if (word === 'false') return { lit: { k: 'bool', v: false }, next: i + 5 };
    if (word === 'null') return { lit: { k: 'null' }, next: i + 4 };
    return { lit: { k: 'ref', v: word }, next: i + word.length };
  }
  return { lit: { k: 'unknown' }, next: i + 1 };
}

function litScalar(l: Lit | undefined): string | undefined {
  if (!l) return undefined;
  if (l.k === 'str') return l.v;
  if (l.k === 'num') return String(l.v);
  if (l.k === 'bool') return String(l.v);
  return undefined;
}

/** script 里的顶层绑定：name → 字面量（数组/对象/标量） */
function extractScriptBindings(src: string): Map<string, Lit> {
  const map = new Map<string, Lit>();
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let sm: RegExpExecArray | null;
  while ((sm = scriptRe.exec(src)) !== null) {
    const body = sm[1];
    const re = /(?:const|let|var)\s+([\w$]+)\s*=\s*(?:ref\s*\(\s*|reactive\s*\(\s*)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const start = m.index + m[0].length;
      if (!/[\[{"']/.test(body[start] ?? '')) continue;
      const r = parseLiteral(body, start);
      map.set(m[1], r.lit);
    }
  }
  return map;
}

// ───────────────────────── 产物实例化 ─────────────────────────

interface VforScope { alias: string; list?: string }

function classesFromAttrs(attrs: string): string[] {
  const out: string[] = [];
  const staticM = /\bclass\s*=\s*"([^"]*)"/.exec(attrs);
  if (staticM) {
    for (const c of staticM[1].split(/\s+/)) if (c && !out.includes(c)) out.push(c);
  }
  const dynM = /:class\s*=\s*"([^"]*)"/.exec(attrs);
  if (dynM) {
    for (const cm of dynM[1].matchAll(/'([\w-]+)'/g)) {
      if (!out.includes(cm[1])) out.push(cm[1]);
    }
  }
  return out;
}

function vforOf(attrs: string): { alias: string; list?: string } | undefined {
  const m = /v-for\s*=\s*"\s*\(?\s*([\w$]+)(?:\s*,\s*[\w$]+)?\s*\)?\s+(?:in|of)\s+([\w$.]+)\s*"/.exec(attrs);
  if (!m) return undefined;
  return { alias: m[1], list: m[2] };
}

/** 把一个表达式求成「可见文本候选」（v-for 别名 → 全值；单实例 → 第一项） */
function evalInterp(
  expr: string,
  scopes: VforScope[],
  bindings: Map<string, Lit>,
): { values: string[]; single: string[] } {
  const path = expr.trim().replace(/^\((.*)\)$/, '$1');
  const parts = path.split('.');
  const head = parts[0];
  const scope = [...scopes].reverse().find((s) => s.alias === head);
  const listName = scope?.list;
  const list = listName ? bindings.get(listName) : undefined;
  const pick = (l: Lit): string[] => {
    if (parts.length === 1) return litScalar(l) !== undefined ? [litScalar(l)!] : [];
    const out: string[] = [];
    let cur: Lit | undefined = l;
    for (let i = 1; i < parts.length; i += 1) {
      cur = cur && cur.k === 'obj' ? cur.v[parts[i]] : undefined;
    }
    const s = litScalar(cur);
    return s !== undefined ? [s] : [];
  };
  if (scope && list?.k === 'arr') {
    const all: string[] = [];
    const singles: string[] = [];
    for (const item of list.v) {
      const got = pick(item);
      if (got.length === 0) continue;
      for (const g of got) if (!all.includes(g)) all.push(g);
      if (singles.length === 0) singles.push(...got);
    }
    return { values: all, single: singles };
  }
  const root = bindings.get(head);
  if (!root) return { values: [], single: [] };
  const got = pick(root);
  return { values: got, single: got };
}

function instantiateProd(files: Array<{ path: string; content: string }>): E2nProdNode[] {
  const all: E2nProdNode[] = [];
  for (const f of files) {
    if (!/\.vue$/.test(f.path)) continue;
    let tree: { root: TplTreeNode; nodes: TplTreeNode[] };
    try {
      tree = parseTemplateTree(f.content);
    } catch {
      continue;
    }
    const bindings = extractScriptBindings(f.content);
    const byNode = new Map<TplTreeNode, E2nProdNode>();
    // 🔴 `<template>` 要分两类（83cfb20e 实锤：「设备监测」标题一度整条 miss）：
    //   ① 无插槽属性 = 结构包裹层（SFC 根 / v-if 包裹）→ 不建节点（否则会与内层容器渲染集相等，
    //      在"取最外层"时抢走容器位且 classes 为空），但其**直系文本要上移**给最近的已建祖先；
    //   ② 带 `#xxx` / `v-slot:` = **具名插槽**，内容是真实渲染的（标题就住这里）→ 必须建节点。
    const NAMED_SLOT_RE = /(?:^|\s)(?:#[\w-]+|v-slot(?::[\w-]+)?\s*=)/;
    const isSkipped = (n: TplTreeNode): boolean => n.tag === 'template' && !NAMED_SLOT_RE.test(n.attrs);
    // 有效祖先：沿 parent 链跳过结构包裹层，返回最近的已建节点（未跳过则返回自身）
    const effectiveParent = (n: TplTreeNode | null): TplTreeNode | null => {
      let cur = n;
      while (cur && cur.tag !== '#root' && isSkipped(cur)) cur = cur.parent;
      return !cur || cur.tag === '#root' ? null : cur;
    };
    // 被跳过的包裹层里的直系文本 → 上移给最近已建祖先（含插值的保守不迁，避免把 {{ }} 当文本）
    const inheritedTexts = new Map<number, string[]>();
    for (const n of tree.nodes) {
      if (!isSkipped(n)) continue;
      const raw = n.ownText ?? '';
      const own = normalizeAnchorText(raw);
      if (!own || /[{}]/.test(raw)) continue;
      const p = effectiveParent(n.parent);
      if (!p) continue;
      const arr = inheritedTexts.get(p.start) ?? [];
      arr.push(own);
      inheritedTexts.set(p.start, arr);
    }
    const scopesOf = (n: TplTreeNode): VforScope[] => {
      const chain: VforScope[] = [];
      for (let cur: TplTreeNode | null = n; cur; cur = cur.parent) {
        const vf = vforOf(cur.attrs);
        if (vf) chain.unshift({ alias: vf.alias, list: vf.list });
      }
      return chain;
    };
    const ordered = [...tree.nodes].sort((a, b) => b.start - a.start);
    for (const node of ordered) {
      // `#root` 与结构包裹层 template 不建节点（见上方 isSkipped 注释）
      if (node.tag === '#root' || isSkipped(node)) continue;
      const scopes = scopesOf(node);
      const vf = vforOf(node.attrs);
      const listName = vf?.list;
      const listLit = listName ? bindings.get(listName) : undefined;
      const vforCount = listLit?.k === 'arr' && listLit.v.length > 1 ? listLit.v.length : 1;

      // 包裹层上移的文本先入列（顺序：上行文本 → 本节点直系静态片段 → 插值）
      const ownStatic: string[] = [...(inheritedTexts.get(node.start) ?? [])];
      const ownInterp: string[] = [];
      const ownInterpSingle: string[] = [];
      const textSrc = node.ownText ?? '';
      const rx = /\{\{\s*([^}]+?)\s*\}\}/g;
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(textSrc)) !== null) {
        const before = normalizeAnchorText(textSrc.slice(last, m.index));
        if (before.length >= 1) ownStatic.push(before);
        last = m.index + m[0].length;
        const ev = evalInterp(m[1], scopes, bindings);
        for (const v of ev.values) {
          const nv = normalizeAnchorText(v);
          if (nv && !ownInterp.includes(nv)) ownInterp.push(nv);
        }
        for (const v of ev.single) {
          const nv = normalizeAnchorText(v);
          if (nv && !ownInterpSingle.includes(nv)) ownInterpSingle.push(nv);
        }
      }
      const tail = normalizeAnchorText(textSrc.slice(last));
      if (tail.length >= 1) ownStatic.push(tail);

      const childKeys: string[] = [];
      for (const c of tree.nodes) {
        if (c.tag === '#root' || isSkipped(c)) continue;
        // 🔴 判据是「c 的有效祖先 == node」而不是「effectiveParent(c) == node」——
        //   后者对未跳过节点返回自身，永远不成立（真机 12 条边全丢的根因）。
        if (effectiveParent(c.parent) === node) childKeys.push(`${f.path}#${c.start}`);
      }
      const children = childKeys.map((k) => all.find((x) => x.key === k)).filter(Boolean) as E2nProdNode[];
      const childRender = children.flatMap((c) => c.renderTexts);
      const childInst = children.flatMap((c) => c.instanceTexts);

      const dedupe = (arr: string[]) => {
        const out: string[] = [];
        for (const x of arr) if (x && !out.includes(x)) out.push(x);
        return out;
      };
      const renderTexts = dedupe([...ownStatic, ...ownInterp, ...childRender]);
      // 单实例文本节点数：本节点自身是否承载文本（静态片段 / 插值 / 上移文本任一）+ 子节点槽位之和
      const instTextNodes =
        (ownStatic.length > 0 || ownInterp.length > 0 ? 1 : 0) +
        children.reduce((s, c) => s + c.instTextNodes, 0);
      const entry: E2nProdNode = {
        key: `${f.path}#${node.start}`,
        path: f.path,
        tag: node.tag,
        classes: classesFromAttrs(node.attrs),
        start: node.start,
        end: node.end,
        ...(effectiveParent(node.parent)
          ? { parentKey: `${f.path}#${effectiveParent(node.parent)!.start}` }
          : {}),
        ownStatic,
        ownInterp,
        ownInterpSingle,
        renderTexts,
        // 单实例文本：「单实例视角」= 本节点自己或任一祖先带 v-for 作用域。
        // 🔴 只判 vforCount>1 不够：v-for 单元内的子节点（如 .card-label）自身不带 v-for，
        //   它的 ownInterp 仍会把 12 项全展开 ⇒ 单元的实例集膨胀成 24 条，vfor-unit 边永不成立。
        //   作用域内取 插值第一项 + 子节点单实例集；不在作用域 ⇒ 整棵子树只渲染一次，实例集 == 展开集。
        instanceTexts:
          scopes.length > 0
            ? dedupe([...ownStatic, ...ownInterpSingle, ...childInst])
            : renderTexts,
        vforCount,
        instTextNodes,
        ...(vf ? { vforAlias: vf.alias } : {}),
        ...(vf?.list ? { vforList: vf.list } : {}),
      };
      byNode.set(node, entry);
      all.push(entry);
    }
  }
  return all;
}

// ───────────────────────── Figma 节点收集 ─────────────────────────

interface FigmaInfo {
  id: string;
  type: string;
  name: string;
  ownText: string;
  texts: string[];
  childIds: string[];
}

function collectFigmaNodes(root: any): { nodes: FigmaInfo[]; byId: Map<string, FigmaInfo> } {
  const nodes: FigmaInfo[] = [];
  const byId = new Map<string, FigmaInfo>();
  const rec = (n: any): FigmaInfo | undefined => {
    if (!n || typeof n !== 'object' || typeof n.id !== 'string') return undefined;
    const info: FigmaInfo = {
      id: n.id,
      type: String(n.type ?? ''),
      name: String(n.name ?? ''),
      ownText: n.type === 'TEXT' ? normalizeAnchorText(String(n.characters ?? '')) : '',
      texts: [],
      childIds: [],
    };
    const kids: FigmaInfo[] = [];
    for (const c of n.children ?? []) {
      const ci = rec(c);
      if (ci) { kids.push(ci); info.childIds.push(ci.id); }
    }
    const set: string[] = [];
    if (info.ownText) set.push(info.ownText);
    for (const k of kids) for (const t of k.texts) if (t && !set.includes(t)) set.push(t);
    info.texts = set;
    nodes.push(info);
    byId.set(info.id, info);
    return info;
  };
  rec(root);
  return { nodes, byId };
}

// ───────────────────────── 建图 ─────────────────────────

/** 并列候选若构成单条祖先链，返回最外层（祖先）者；分叉则 undefined */
function outermostOf(cands: E2nProdNode[], prodNodes: E2nProdNode[]): E2nProdNode | undefined {
  const byKey = new Map(prodNodes.map((p) => [p.key, p]));
  const isAncestor = (a: E2nProdNode, b: E2nProdNode): boolean => {
    for (let cur = byKey.get(b.parentKey ?? ''); cur; cur = byKey.get(cur.parentKey ?? '')) {
      if (cur.key === a.key) return true;
    }
    return false;
  };
  for (const a of cands) {
    if (cands.every((b) => b === a || isAncestor(a, b))) return a;
  }
  return undefined;
}

export function buildE2nMap(
  figmaRoot: any,
  prodFiles: Array<{ path: string; content: string }>,
  opts: BuildE2nOptions = {},
): E2nMap {
  const files = opts.files ? prodFiles.filter((f) => opts.files!.includes(f.path)) : prodFiles;
  const prodNodes = instantiateProd(files);
  const { nodes: figmaNodes, byId } = collectFigmaNodes(figmaRoot);

  // 产物文本索引：归一化文本 → 产物节点（同节点多值只记一次）
  const textIndex = new Map<string, Set<string>>();
  for (const p of prodNodes) {
    for (const t of [...p.ownStatic, ...p.ownInterp]) {
      const k = normalizeAnchorText(t);
      if (!k) continue;
      if (!textIndex.has(k)) textIndex.set(k, new Set());
      textIndex.get(k)!.add(p.key);
    }
  }

  // Step 1 文本 seed（按值匹配；多命中直接标 ambiguous，不做顺序消歧）
  const seeds: E2nSeed[] = [];
  const seedByFigma = new Map<string, E2nSeed>();
  const usedProd = new Set<string>();
  const figmaTexts = figmaNodes.filter((n) => n.type === 'TEXT' && n.ownText);
  let ambiguousSeeds = 0;
  let partialSeeds = 0;
  let missSeeds = 0;
  for (const ft of figmaTexts) {
    const cands = [...(textIndex.get(ft.ownText) ?? [])];
    if (cands.length === 1) {
      const s: E2nSeed = { figmaId: ft.id, text: ft.ownText, prodKey: cands[0], how: 'text-exact', candidates: 1 };
      seeds.push(s);
      seedByFigma.set(ft.id, s);
      usedProd.add(cands[0]);
      continue;
    }
    if (cands.length > 1) {
      ambiguousSeeds += 1;
      continue;
    }
    // partial（互含，长度≥3）：仅当该产物文本尚未被占用，避免抢位
    let hit: string | undefined;
    for (const [text, keys] of textIndex) {
      if (text.length < 3) continue;
      if (text.includes(ft.ownText) || ft.ownText.includes(text)) {
        const free = [...keys].filter((k) => !usedProd.has(k));
        if (free.length === 1) { hit = free[0]; break; }
      }
    }
    if (hit) {
      const s: E2nSeed = { figmaId: ft.id, text: ft.ownText, prodKey: hit, how: 'text-partial', candidates: 1 };
      seeds.push(s);
      seedByFigma.set(ft.id, s);
      usedProd.add(hit);
      partialSeeds += 1;
    } else {
      missSeeds += 1;
    }
  }

  // Figma 容器子树内已 seed 的 TEXT（自底向上聚合）
  const figmaSeeded = new Map<string, Set<string>>();
  for (const n of [...figmaNodes].sort((a, b) => a.texts.length - b.texts.length)) {
    const set = new Set<string>();
    if (seedByFigma.has(n.id)) set.add(n.id);
    for (const cid of n.childIds) for (const k of figmaSeeded.get(cid) ?? []) set.add(k);
    figmaSeeded.set(n.id, set);
  }

  // Step 2 祖先传播：以「已 seed 的文本集合」对称比较（不依赖节点 id，也不依赖顺序）
  const seededTextSet = new Set(seeds.map((s) => s.text));
  const prodSeeded = new Map<string, { render: string[]; inst: string[] }>();
  for (const p of prodNodes) {
    prodSeeded.set(p.key, {
      render: p.renderTexts.filter((t) => seededTextSet.has(t)),
      inst: p.instanceTexts.filter((t) => seededTextSet.has(t)),
    });
  }
  const sameSet = (a: string[], b: string[]): boolean =>
    a.length === b.length && a.every((x) => b.includes(x));

  const edges: E2nNodeEdge[] = [];
  const multi: E2nMulti[] = [];
  const unmapped: Array<{ figmaId?: string; prodKey?: string; reason: string }> = [];
  let figmaContainers = 0;
  /** 并列但同链 → 取最外层建边的次数（「深度未定」的可辩驳留痕） */
  let depthResolved = 0;
  for (const fn of figmaNodes) {
    if (fn.type === 'TEXT') continue;
    const seedIds = figmaSeeded.get(fn.id);
    if (!seedIds || seedIds.size === 0) continue;
    figmaContainers += 1;
    const sTexts: string[] = [];
    for (const fid of seedIds) {
      const s = seedByFigma.get(fid);
      if (s && !sTexts.includes(s.text)) sTexts.push(s.text);
    }
    const hits: Array<{ p: E2nProdNode; how: E2nNodeEdge['how'] }> = [];
    for (const p of prodNodes) {
      const ps = prodSeeded.get(p.key)!;
      if (p.vforCount > 1) {
        // 重复单元：Figma 单张卡 ↔ 产物 v-for 单元。
        // 判据 = ①该单元能产出至少一条 Figma 文本（有交集，否则是别的容器）
        //        ②Figma 容器的文本量不超过该单元的单实例文本槽位（挡住「12 卡整容器」这种上游容器）
        // 🔴 不能要求「单实例 seed 数 == 容器 seed 数」：真机 83cfb20e 同一张卡的第二个文本
        //   "(2/484)" 被另一组数值组合吃掉（(0/484) 出现 11 次 ⇒ ambiguous 无 seed），
        //   按等式判定会让首卡永远建不成边，而它的 bg-8439 正是挂在那个容器上。
        const sr = sTexts.filter((t) => p.renderTexts.includes(t));
        if (sr.length > 0 && sTexts.length <= p.instTextNodes) hits.push({ p, how: 'vfor-unit' });
        continue;
      }
      if (ps.render.length > 0 && sameSet(ps.render, sTexts)) hits.push({ p, how: 'subtree-set-equal' });
    }
    if (hits.length === 0) {
      unmapped.push({ figmaId: fn.id, reason: 'no-prod-container' });
      continue;
    }
    // 唯一性：取渲染文本最少（最紧）的候选；并列分两种情况：
    //   ① 候选构成**单条祖先链**（只是"深度未定"，如 .tabs-list > .tab 都只渲染「总数」）
    //      → 取最外层（祖先）建边：Figma 节点是容器，落点应在容器上而不是它里面的文字叶子。
    //      「子树区域」本身唯一，深度不影响资源归属 ⇒ 不算猜，计入 stats.depthResolved 留痕。
    //   ② 候选分叉在不同子树（如左右双卡同名）→ 真歧义，记 multi 不建边。
    hits.sort((a, b) => a.p.renderTexts.length - b.p.renderTexts.length);
    const bestLen = hits[0].p.renderTexts.length;
    const tie = hits.filter((h) => h.p.renderTexts.length === bestLen);
    if (tie.length > 1) {
      const outer = outermostOf(tie.map((h) => h.p), prodNodes);
      if (outer) {
        depthResolved += 1;
        edges.push({
          figmaId: fn.id,
          figmaType: fn.type,
          figmaName: fn.name,
          prodKey: outer.key,
          prodPath: outer.path,
          classes: outer.classes,
          how: 'subtree-set-equal',
          matched: seedIds.size,
          instCount: outer.vforCount,
          unique: true,
        });
      } else {
        multi.push({ figmaId: fn.id, figmaName: fn.name, prodKeys: tie.map((h) => h.p.key) });
      }
      continue;
    }
    edges.push({
      figmaId: fn.id,
      figmaType: fn.type,
      figmaName: fn.name,
      prodKey: hits[0].p.key,
      prodPath: hits[0].p.path,
      classes: hits[0].p.classes,
      how: hits[0].how,
      matched: seedIds.size,
      instCount: hits[0].p.vforCount,
      unique: true,
    });
  }

  return {
    seeds,
    nodes: edges,
    multi,
    unmapped,
    prodNodes,
    stats: {
      prodNodes: prodNodes.length,
      figmaTexts: figmaTexts.length,
      seeds: seeds.length,
      ambiguousSeeds,
      partialSeeds,
      missSeeds,
      nodes: edges.length,
      multi: multi.length,
      depthResolved,
      figmaContainers,
    },
  };
}

/** 查某 Figma 节点映射到的产物节点（资源挂载用） */
export function findE2nEdge(e2n: E2nMap, figmaId: string | undefined): E2nNodeEdge | undefined {
  if (!figmaId) return undefined;
  return e2n.nodes.find((n) => n.figmaId === figmaId);
}

// ───────────────────────── 容器级 bg 挂载（消费 E2N） ─────────────────────────

export interface BgE2nStats {
  candidates: number;
  anchored: number;
  /** 规则体原本没有背景声明 → 新增插入的次数 */
  inserted: number;
  /** @deprecated 2026-11-05 起改为「替换底色」（见 replacedColor）；恒 0，保留字段仅为兼容旧报告读取 */
  mergedColor: number;
  /** 规则体是渐变 → 用资源图**替换**（不叠加）的次数 —— 资源图是 Figma 完整背景，叠加会双重上色 */
  replacedGradient: number;
  /** 规则体是 background-color → 用资源图**替换**（丢弃臆造底色）的次数 */
  replacedColor: number;
  skipNoEdge: number;
  skipNoClass: number;
  skipNoRule: number;
  /** 命中的规则选择器不止一个类（如 `.a .b`）——闸门②否决 */
  skipMultiClass: number;
  skipRuleAmbiguous: number;
  skipAlreadyUrl: number;
}

export interface BgE2nResult {
  files: Array<{ path: string; changed: boolean; content: string; edits: Array<{ desc: string }> }>;
  stats: BgE2nStats;
  /** 已挂上的资产（供下游 AI 兜底通道跳过，避免重复消费同一 bg） */
  anchoredAssets: Array<{
    fileName: string;
    figmaId: string;
    cls: string;
    how: 'insert' | 'merge-color' | 'replace-gradient' | 'replace-color' | 'value';
  }>;
}

const BG_URL_TAIL = 'center / 100% 100% no-repeat';

/** 选择器归一：剥注释 + 剥 at-rule 残留 + 剥 .dark/.light 主题前缀（唯一性判定的比较口径）
 *  🔴 首条规则的 selNorm 会带 `<style>` 开头的 `@import '…/index.less';`（83cfb20e 实锤），
 *    其中的 `.less` 会被算成第二个类 token ⇒ 取最后一个 `;` 之后的部分才是真选择器。 */
export function selKeyOf(sel: string): string {
  return (sel.replace(/\/\*[\s\S]*?\*\//g, ' ').split(';').pop() ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(\.(?:dark|light)\s+)+/, '');
}

/** 产物样式规则索引：一次解析、多资产复用（旧实现每个「资产 × 类名」都重解析全文件）。 */
export interface StyleRuleIndex {
  files: Array<{ path: string; content: string; rules: ReturnType<typeof collectStyleRulesFromContent> }>;
}

export function buildStyleRuleIndex(
  files: Array<{ path: string; content: string }>,
): StyleRuleIndex {
  return {
    files: files.map((f) => ({ path: f.path, content: f.content, rules: collectStyleRulesFromContent(f.content) })),
  };
}

export interface ClassRuleHit {
  file: { path: string; content: string };
  rule: ReturnType<typeof collectStyleRulesFromContent>[number];
}

/**
 * 某类名命中的**全部规则投影**（跨文件 / 跨主题副本）。
 *
 * 双重过滤（缺一不可）：① token 级匹配挡住 `.nav-item` 命中 `.nav-item-active`；
 * ② 归一选择器必须以该类名**结尾**，挡住 `.card .card-body` 这类「后代里提到该类」的假命中。
 * 🔴 判据单一来源：执行器 mountBgByE2n 与只读 planner 都必须走本函数。
 */
export function findClassRuleHits(index: StyleRuleIndex, cls: string): ClassRuleHit[] {
  const hits: ClassRuleHit[] = [];
  const esc = cls.replace(/--/g, '-').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const endRe = new RegExp(`(^|[^\\w-])${esc}([^\\w-]*)$`);
  for (const f of index.files) {
    for (const rule of f.rules) {
      if (!classMatchesSelector(rule.selNorm, cls)) continue;
      if (!endRe.test(selKeyOf(rule.selNorm))) continue;
      hits.push({ file: f, rule });
    }
  }
  return hits;
}

/** 选择器归一后是否只有一个类 token（可带伪类/伪元素修饰）——闸门②的单一实现 */
export function isSingleClassSelector(selNorm: string): boolean {
  const selBase = selNorm.replace(/:{1,2}[a-z-]+(\([^)]*\))?/gi, '').trim();
  return (selBase.match(/\.[\w-]+/g) ?? []).length === 1;
}

/**
 * 资源图在指定产物文件里的引用写法（执行器与 planner 共用的唯一实现）。
 *
 * 🔴 相对深度按「被改文件」算，不能按 edge.prodPath（edge 指向 .vue）。
 * 🔴 2026-11-05 真机实锤（1b5b72d0 「DOM 里有 bg url 但被 common.less 的纯渐变压掉」）：
 *   样式源有两类，图片基准**不同**——旧实现只特判 index.css，把 less 源也按 .vue 算，
 *   一旦把 common.less / themes/*.less 纳入挂载就会写出 `../../resources/images/` 这种错路径。
 *   ① resources/**（index.css / common.less / themes/*.less）→ 相对同一 resources/images/
 *      `resources/styles/x` → ../images/ ；`resources/styles/themes/x` → ../../images/
 *   ② `.vue`（package/index.vue 等）→ 相对组件根 → `<n>../resources/images/`
 */
export function bgUrlFor(filePath: string, fileName: string): string {
  const depth = filePath.startsWith('resources/')
    ? `${'../'.repeat(Math.max(0, filePath.split('/').length - 2))}images/`
    : `${importDepthFor(filePath)}resources/images/`;
  return `url('${depth}${fileName}') ${BG_URL_TAIL}`;
}

/** 背景声明形态：`background` 简写 / `background-color` 单项 / 缺失
 *  与执行器分支一一对应（replace-gradient / replace-color / replace-bg-color / insert） */
export type BgDecl =
  | { kind: 'background'; value: string; isGradient: boolean; hasUrl: boolean; index: number; end: number; match: string }
  | { kind: 'background-color'; value: string; index: number; end: number; match: string }
  | { kind: 'none' };

/** 读规则体的背景声明形态（执行器与 planner 共用；避免两侧判据漂移）。
 *  index/end 是**待替换片段**在规则体里的偏移：
 *    · `background`      → 只换值（保留属性名），[index,end) = 值本身
 *    · `background-color`→ 连属性名一起换（`background-color: url(...)` 是非法 CSS），
 *                          [index,end) = `background-color: <value>` 整段 */
export function readBgDecl(body: string): BgDecl {
  const bgRe = /(^|[;{\s])background\s*:\s*([^;{}]+)/;
  const bm = bgRe.exec(body);
  if (bm) {
    const value = bm[2];
    const valueStart = bm.index + bm[0].length - value.length;
    return {
      kind: 'background',
      value,
      isGradient: /gradient\s*\(/i.test(value),
      hasUrl: /url\s*\(/i.test(value),
      index: valueStart,
      end: valueStart + value.length,
      match: bm[0],
    };
  }
  const cm = /(^|[;{\s])background-color\s*:\s*([^;{}]+)/.exec(body);
  if (cm) {
    return {
      kind: 'background-color',
      value: cm[2],
      index: cm.index + cm[1].length,
      end: cm.index + cm[0].length,
      match: cm[0],
    };
  }
  return { kind: 'none' };
}

/**
 * 容器级背景挂载：落点由 E2N 边决定，**允许在无背景声明的规则上插入**。
 *
 * 与 aiAnchorBackgroundAssets 的分工：
 *   - 那条通道靠「词→叶子→LCA→有 bg 键的规则」，落点会被"哪条规则碰巧有 bg 键"决定；
 *   - 本通道落点来自结构边（Figma 容器 ↔ 产物元素），授权不依赖产物 CSS 数值。
 * 判据（插入时四条同时成立）：① 逻辑规则唯一；② 选择器单类；③ 资源容器级；
 *   ④ 规则体无 `background`（有 `background-color` 则合并成简写，不算无键）。
 */
export function mountBgByE2n(
  files: Array<{ path: string; content: string }>,
  assets: Array<{ nodeId: string; fileName?: string; parentId?: string; containerLevel?: boolean }>,
  e2n: E2nMap,
): BgE2nResult {
  const stats: BgE2nStats = {
    candidates: 0, anchored: 0, inserted: 0, mergedColor: 0, replacedGradient: 0, replacedColor: 0,
    skipNoEdge: 0, skipNoClass: 0, skipNoRule: 0, skipMultiClass: 0,
    skipRuleAmbiguous: 0, skipAlreadyUrl: 0,
  };
  interface Edit { path: string; pos: number; end: number; text: string; desc: string; inserted?: boolean }
  const edits: Edit[] = [];
  const consumed = new Set<string>();
  const anchoredAssets: BgE2nResult['anchoredAssets'] = [];
  // 样式规则只解析一次（旧实现「每个资产 × 每个类名」都重扫全部文件）
  const index = buildStyleRuleIndex(files);

  for (const a of assets) {
    if (!a.fileName || !/^bg-/.test(a.fileName)) continue;
    if (!a.containerLevel || !a.parentId) continue;
    stats.candidates += 1;
    const edge = findE2nEdge(e2n, a.parentId);
    if (!edge) { stats.skipNoEdge += 1; continue; }
    const clsList = edge.classes.filter((c) => c && !/^_/.test(c));
    if (clsList.length === 0) { stats.skipNoClass += 1; continue; }

    let applied = false;
    // 本资产是否已被闸门明确否决（否决分支各自 +1，避免末尾再补一次 skipNoRule 重复计数）
    let rejected = false;
    for (const cls of [...clsList].reverse()) {
      const hits = findClassRuleHits(index, cls);
      if (hits.length === 0) continue;
      // ① 逻辑规则唯一：先剥「选择器前的 CSS 注释」与「.dark/.light 主题前缀」再比较——
      //    产物里同一逻辑规则常有 4 个投影（SFC 副本 / index.css / .dark X / .light X），
      //    真机 6e59a0d4 实锤 selNorm 形如 `/* Tab 切换栏 */\n.c-environment-monitoring-tabs`，
      //    不剥注释会把同一规则判成两个选择器 ⇒ skipRuleAmbiguous ⇒ 容器底图永远挂不上。
      const selSet = new Set(hits.map((h) => selKeyOf(h.rule.selNorm)));
      if (selSet.size > 1) { stats.skipRuleAmbiguous += 1; rejected = true; break; }
      // ② 选择器单类：归一后只允许一个类 token（可带伪类/伪元素修饰）
      if (!isSingleClassSelector(selKeyOf(hits[0].rule.selNorm))) {
        stats.skipMultiClass += 1;
        rejected = true;
        break;
      }

      const bodies = hits.map((h) => h.file.content.slice(h.rule.bodyStart, h.rule.bodyEnd));
      const decls = bodies.map((b) => readBgDecl(b));
      // 🔴 幂等判据按 **hit 逐个**判，不是「任一投影已有 url 就整体否决」——
      //   真机 1b5b72d0 实测存在「index.css 已有 url、common.less 没有」的**部分修复态**；
      //   整体否决会让这类资产永远补不齐且静默（表现为「DOM 里规则有 url，但被 less 投影压掉」）。
      //   只有全部投影都已挂 url 才算真正完成（此时记 skipAlreadyUrl 并退出）。
      const hitHasUrl = decls.map((d) => d.kind === 'background' && d.hasUrl);
      if (hitHasUrl.length > 0 && hitHasUrl.every(Boolean)) {
        stats.skipAlreadyUrl += 1;
        rejected = true;
        break;
      }

      // 🔴 相对深度按「被改文件」算，不能按 edge.prodPath（edge 指向 .vue）。
      //    两类样式源的图片基准不同 → 统一走 bgUrlFor（与 planner 同一实现）。
      let editedAny = false;
      let howKind: 'insert' | 'merge-color' | 'replace-gradient' | 'replace-color' | 'value' = 'value';
      for (let i = 0; i < hits.length; i += 1) {
        const h = hits[i];
        // 该投影已挂过 url（部分修复态）→ 跳过它，其余投影继续补齐
        if (hitHasUrl[i]) continue;
        const key = `${h.file.path}:${h.rule.bodyStart}`;
        if (consumed.has(key)) continue;
        const url = bgUrlFor(h.file.path, a.fileName);
        const body = bodies[i];
        const d = decls[i];
        if (d.kind === 'background') {
          // 🔴 2026-11-05 用户定性（1b5b72d0 截图：「背景被换上后原来背景应该删除」）：
          //   资源图是 Figma 里该容器的**完整背景**（自带渐变/纹理），原 `background` 值——
          //   无论渐变还是纯色——都属于视觉分析臆造的"背景"，**整条替换**而非叠加/保留：
          //   · 渐变：叠加会双重上色（蓝色卡左深右浅、右下角露出渐变直角）
          //   · 纯色（如设备卡 `rgba(255,255,255,.6)`）：叠上去把 Figma 的白→浅蓝渐变压平
          //   （前面已排除含 url 的投影，故此处不会吃掉已挂好的图）
          edits.push({
            path: h.file.path,
            pos: h.rule.bodyStart + d.index,
            end: h.rule.bodyStart + d.end,
            text: url,
            desc: `e2nBg:${a.fileName}→.${cls}(${d.isGradient ? 'replace-gradient' : 'replace-color'})`,
          });
          if (d.isGradient) {
            stats.replacedGradient += 1;
            howKind = 'replace-gradient';
          } else {
            stats.replacedColor += 1;
            howKind = 'replace-color';
          }
          editedAny = true;
        } else if (d.kind === 'background-color') {
          // ③ 只有 `background-color` → **整条改写为 `background: <url>`**
          //   不能只替换值：`background-color: url(...)` 是非法 CSS（该属性只吃颜色），
          //   浏览器会丢弃整条声明 —— 原实现 `${color} ${url}` 就是踩了这个坑。
          edits.push({
            path: h.file.path,
            pos: h.rule.bodyStart + d.index,
            end: h.rule.bodyStart + d.end,
            text: `background: ${url}`,
            desc: `e2nBg:${a.fileName}→.${cls}(replace-color)`,
          });
          stats.replacedColor += 1;
          editedAny = true;
          howKind = 'replace-color';
        } else {
          // ④ 无背景声明 → 插入（规则体末尾）
          const pad = body.endsWith('\n') ? '' : '\n  ';
          edits.push({
            path: h.file.path,
            pos: h.rule.bodyStart + body.length,
            end: h.rule.bodyStart + body.length,
            text: `${pad}background: ${url};\n`,
            desc: `e2nBg:${a.fileName}→.${cls}(insert)`,
            inserted: true,
          });
          stats.inserted += 1;
          editedAny = true;
          howKind = 'insert';
        }
        consumed.add(key);
      }
      if (editedAny) {
        stats.anchored += 1;
        applied = true;
        anchoredAssets.push({ fileName: a.fileName, figmaId: a.parentId!, cls, how: howKind });
        break;
      }
    }
    // 走到这里 = 所有类名都没找到可用规则（否决分支已各自计数并置 rejected）
    if (!applied && !rejected) stats.skipNoRule += 1;
  }

  const out = files.map((f) => {
    const mine = edits.filter((e) => e.path === f.path).sort((a, b) => b.pos - a.pos);
    let content = f.content;
    for (const e of mine) content = content.slice(0, e.pos) + e.text + content.slice(e.end);
    return { path: f.path, changed: mine.length > 0, content, edits: mine.map((e) => ({ desc: e.desc })) };
  });
  return { files: out, stats, anchoredAssets };
}
