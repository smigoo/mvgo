/**
 * 只读回填计划（backfill plan）· 2026-11-05 立项
 *
 * 背景：lite-lab 的回填由 8 条通道各扫各的（C 文本 / C3 script / C2 图标 / C2a E2N 容器 bg /
 * C2b AI 兜底 / C2c 容器 fill / C2d 标题 / C2e 清背景），每条自己判「落点在哪、改成什么」，
 * 判据互不一致 ⇒ 同一元素被多通道争抢、落点由"谁先跑"决定、改完无人对账。
 *
 * 本模块只做一件事：**先出一份完整计划**（要动哪些元素、为什么、改成什么、和谁冲突），
 * 不写盘、不改产物。计划是「事实 + 判据」的可辩驳留痕：
 *   · 分类只看 Figma 内部事实（资源 bbox ≈ 父容器 bbox / IMAGE fill 有无 / SOLID fill）
 *   · 落点只看结构映射（E2N 边 / 文本 seed），不按"哪条规则碰巧有 background 键"
 *   · 冲突在计划期消解（background 是简写属性只能有一个值）
 *
 * 🔴 授权纪律（与 e2n-map 同一口径）：产物 CSS 里的 height/background 是 LLM 视觉分析产物，
 *   **不作授权证据**，只作「现状是什么」的观察项 + 幂等判定。
 */
import {
  collectFigmaTruth,
  findNodeById,
  isBgClassAsset,
  isIconClassAsset,
  type FigmaAssetTruth,
  type TruthInventory,
} from './truth-matcher';
import {
  anchorByCoveredTexts,
  bgUrlFor,
  buildE2nMap,
  buildStyleRuleIndex,
  findClassRuleHits,
  findE2nEdge,
  isSingleClassSelector,
  readBgDecl,
  selKeyOf,
  type E2nMap,
  type E2nNodeEdge,
  type StyleRuleIndex,
} from './e2n-map';
import { OPAQUE_BG_ALPHA } from './asset-opacity';

// ───────────────────────── 类型 ─────────────────────────

export type PlanKind = 'bg-image' | 'inline-image' | 'fill-color' | 'text-truth';

export type PlanAction =
  /** 渐变 → 资源图整条替换 */
  | 'replace-gradient'
  /** 纯色 background → 资源图整条替换 */
  | 'replace-color'
  /** background-color: <color> → background: url(...)（连属性名改写，否则非法 CSS） */
  | 'replace-bg-color'
  /** 规则体无背景声明 → 插入 */
  | 'insert'
  /** 规则体已挂别的图 → 换成计划中的图（资产冲突） */
  | 'replace-url'
  /** 🔴 资源是半透明叠加层 → **保留原底色**，把图叠在上层（`background: url(...), <原值>`） */
  | 'layer-url'
  /** 元素级静态图 → 设 <img src> / 图标变量 */
  | 'set-src'
  /** 容器 SOLID fill → 换 background 色值 */
  | 'set-background-color'
  /** 文本真值 → 写内联 style（color / font-size / width / height） */
  | 'set-inline-style'
  /** 现状已是目标态（幂等空转） */
  | 'noop';

export interface PlanTarget {
  /** 被改的产物文件（相对产物根） */
  file: string;
  /** 冲突判定键：样式改动 = 规则唯一键；内联 style = 元素唯一键（不能用类名，
   *  v-for 内多个实例共用同一类名，按类名判冲突会把 12 张卡判成互相冲突） */
  key: string;
  /** 命中的选择器（归一后；样式类改动用） */
  selector?: string;
  /** 命中的类名（原样，含 `--` 变体后缀） */
  cls?: string;
  action: PlanAction;
  /** 现状值（可辩驳：现状 → 计划） */
  before?: string;
  after?: string;
  /** 该投影当前是否已是目标态 */
  satisfied: boolean;
  /** 现状值不可静态判定（如 `calc(@fontSize * .75)` / `var(--x)`：真值要运行时才算得出来） */
  undecidable?: boolean;
}

export interface PlanEntry {
  id: string;
  kind: PlanKind;
  decision: 'apply' | 'skip';
  skipReason?: string;
  figma: {
    nodeId: string;
    name: string;
    type?: string;
    text?: string;
    w?: number;
    h?: number;
    parentId?: string;
  };
  /** 产物侧结构落点（E2N 边 / 文本 seed 命中） */
  prod?: {
    file?: string;
    path?: string;
    tag?: string;
    classes?: string[];
  };
  /** 判定依据（每条都应能被独立复核） */
  evidence: string[];
  targets: PlanTarget[];
  conflicts: Array<{ entryId: string; rule: string; resolution: string }>;
  payload?: Record<string, unknown>;
}

export type PlanGapKind = PlanKind | 'container-fill' | 'gradient-fill';

export interface PlanGap {
  kind: PlanGapKind;
  figmaId?: string;
  detail: string;
}

export interface BackfillPlanStats {
  entries: number;
  apply: number;
  skip: number;
  /** 全部 target 已满足（幂等空转，执行器不会写盘） */
  satisfied: number;
  /** 现状值不可静态判定（运行期表达式）的条目数 */
  undecidable: number;
  byKind: Record<PlanKind, { candidates: number; apply: number; skip: number; satisfied: number }>;
  conflicts: number;
  gaps: number;
}

export interface BackfillPlan {
  builtAt: string;
  stats: BackfillPlanStats;
  entries: PlanEntry[];
  gaps: PlanGap[];
}

export interface BuildPlanOptions {
  /** Figma node 数据根（fetchNodeData 返回体；有 document 字段时自动取） */
  figmaRoot: any;
  /** 产物全量文件（package/*.vue + resources/styles/**），相对产物根 */
  prodFiles: Array<{ path: string; content: string }>;
  /** 注入已收集的真值清单（含下载后的 fileName）；不给则从 figmaRoot 现算 */
  truth?: TruthInventory;
  /** 注入已建好的 E2N 图；不给则现建 */
  e2n?: E2nMap;
  /** 已被其他通道（AI 兜底）消费的 bg 文件名 —— 计划里标注来源，避免重复规划 */
  agentConsumed?: string[];
  /**
   * 资源像素统计（meanAlpha 决定「整块底图」还是「叠加层」）。
   * 由调用方从磁盘读（纯函数模块不碰 IO）；缺省时一律按整块底图处理（旧行为）。
   */
  assetOpacity?: Record<string, { meanAlpha: number; meanLum?: number; visibleRatio?: number }>;
  now?: string;
}

// ───────────────────────── 小工具 ─────────────────────────

const KIND_PRIORITY: Record<PlanKind, number> = {
  'inline-image': 40,
  'bg-image': 30,
  'fill-color': 20,
  'text-truth': 10,
};

function normColor(v: string): string {
  const s = String(v || '').trim().toLowerCase();
  const hex = /^#([0-9a-f]{3})$/.exec(s);
  if (hex) return `#${hex[1].split('').map((c) => c + c).join('')}`;
  const rgba = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*(?:[,/]\s*([\d.]+))?\)$/.exec(s);
  if (rgba) {
    const hexv = [rgba[1], rgba[2], rgba[3]]
      .map((x) => Number(x).toString(16).padStart(2, '0'))
      .join('');
    return `#${hexv}`;
  }
  return s;
}

/** 规则体里已有的资源图文件名（`url('../images/bg-1.png')` → `bg-1.png`） */
function urlFileNameOf(cssValue: string): string | undefined {
  const m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(cssValue);
  if (!m) return undefined;
  const seg = m[1].split('/').pop() ?? '';
  return seg || undefined;
}

/** 背景值里除资源图之外是否还有别的图层（旧渐变 / 臆造纯色 = 需要清理的残留）。
 *  🔴 历史产物存在 `url(A) … , linear-gradient(…)` 这种「图上叠渐变」的中间态：
 *    执行器看 hitHasUrl 判幂等会直接跳过它 ⇒ 永远清不掉。计划必须把它标成「待清理」。 */
function hasExtraBgLayers(value: string): boolean {
  const rest = value.replace(/url\(\s*['"]?[^'")]+['"]?\s*\)/gi, '');
  return /gradient\s*\(|rgba?\(|#[0-9a-f]{3,8}\b/i.test(rest);
}

interface AssetRef {
  file: string;
  kind: 'import' | 'css-url' | 'ref';
  snippet: string;
}

/** 产物里对该资源文件的全部引用（inline-image 的现状判据） */
function findAssetRefs(files: Array<{ path: string; content: string }>, fileName: string): AssetRef[] {
  const out: AssetRef[] = [];
  for (const f of files) {
    let i = f.content.indexOf(fileName);
    while (i >= 0) {
      const lineStart = f.content.lastIndexOf('\n', i) + 1;
      const nl = f.content.indexOf('\n', i);
      const line = f.content.slice(lineStart, nl < 0 ? f.content.length : nl).trim();
      out.push({
        file: f.path,
        kind: /^\s*import\s/.test(line) ? 'import' : /url\s*\(/i.test(line) ? 'css-url' : 'ref',
        snippet: line.length > 180 ? `${line.slice(0, 180)}…` : line,
      });
      if (out.length >= 8) return out;
      i = f.content.indexOf(fileName, i + fileName.length);
    }
  }
  return out;
}

function fmtNum(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '?';
  return (Math.round(v * 10) / 10).toString();
}

/** 结构映射的一条边 → 候选类名（逆序：先变体类后基类，与执行器一致） */
function classCandidates(edge: E2nNodeEdge | undefined): string[] {
  return (edge?.classes ?? []).filter((c) => c && !/^_/.test(c)).reverse();
}

interface ResolvedClassRules {
  cls?: string;
  hits?: ReturnType<typeof findClassRuleHits>;
  skip?: 'rule-ambiguous' | 'multi-class-selector' | 'no-style-rule';
  detail?: string;
}

/** 类名 → 规则投影，带执行器同款两道闸门（唯一逻辑选择器 / 单类选择器） */
function resolveClassRules(index: StyleRuleIndex, edge: E2nNodeEdge | undefined): ResolvedClassRules {
  const cands = classCandidates(edge);
  if (cands.length === 0) return { skip: 'no-style-rule', detail: '结构边没有可用类名' };
  for (const cls of cands) {
    const hits = findClassRuleHits(index, cls);
    if (hits.length === 0) continue;
    const selSet = new Set(hits.map((h) => selKeyOf(h.rule.selNorm)));
    if (selSet.size > 1) {
      return { cls, hits, skip: 'rule-ambiguous', detail: [...selSet].join('  |  ') };
    }
    const sel = [...selSet][0];
    if (!isSingleClassSelector(sel)) return { cls, hits, skip: 'multi-class-selector', detail: sel };
    return { cls, hits };
  }
  return { skip: 'no-style-rule', detail: `类名均无规则：${cands.map((c) => `.${c}`).join(' / ')}` };
}

/** 元素类名命中的 CSS 规则里最后一次声明的某属性（近似层叠：文件/规则顺序靠后者赢）。
 *  用途 = 「现状是否已满足」的观察口径：真值可能已经由样式规则满足，不该误报成"待写"。 */
function declaredProp(
  index: StyleRuleIndex,
  file: string,
  classes: string[],
  prop: 'color' | 'font-size',
): { value: string; where: string } | undefined {
  let best: { value: string; where: string } | undefined;
  for (const cls of classes) {
    for (const h of findClassRuleHits(index, cls)) {
      if (h.file.path !== file) continue;
      const body = h.file.content.slice(h.rule.bodyStart, h.rule.bodyEnd);
      const m = new RegExp(`(^|[;{\\s])${prop}\\s*:\\s*([^;{}]+)`).exec(body);
      if (m) best = { value: m[2].trim(), where: `.${cls}` };
    }
  }
  return best;
}

/** 规则所属主题投影（`.dark X` / `.light X` / 无前缀），只用于人读区分同文件的多份副本 */
function themeTagOf(selNorm: string): string {
  const s = (selNorm.replace(/\/\*[\s\S]*?\*\//g, ' ').split(';').pop() ?? '').replace(/\s+/g, ' ').trim();
  const m = /^\.(dark|light)\s/.exec(s);
  return m ? ` (.${m[1]})` : '';
}

/** 值是不是运行期表达式（less 变量 / var() / calc()）——这类值无法与 Figma 真值静态比对 */
function isRuntimeExpr(v: string | undefined): boolean {
  if (!v) return false;
  return /(^|[^\w-])(calc|var|clamp|min|max)\s*\(|@[\w-]+/.test(v);
}

/**
 * 🔴 节点自身 + 整棵子树的 fill 画像 —— 判「这个 bg 资源到底是图片还是渐变渲染图」。
 *
 * 真机实锤（设备面板 `2:8439`/`2:8788`/`2:8807`，2026-11-05）：三张 `bg-*.png` 对应的
 * Figma 节点都是 `GROUP「bg」` + `VECTOR(GRADIENT_LINEAR)`，**子树零 IMAGE fill**。
 * 也就是说 png 是 Figma 把**渐变渲染出来的位图**（images API 可渲染任意节点），
 * 不是设计稿里切出来的图片资源。把它当背景图挂 `url()` 会带来三个错误：
 *   ① 语义错：真值是渐变，应还原 `linear-gradient(...)`（可主题化、无缩放失真）；
 *   ② 层级错：渲染图自带合成后的 alpha（`bg-8439` alpha≈12/255），会被误判成「半透明叠加层」；
 *   ③ 自相矛盾：同一视觉既进 bg 通道、又进 gradient-fill 缺口（父组挂图 / 子节点缺真值）。
 *
 * 判据只看 Figma 内部事实，不看文件名：**无 IMAGE 且含 GRADIENT_* ⇒ 渐变渲染图**。
 * 有 IMAGE fill 的节点（真·切图/位图）行为完全不变（阳性对照：fixture 无 fills 时不触发）。
 */
function fillProfileOf(node: any): { hasImage: boolean; gradients: number; solids: number } {
  let hasImage = false;
  let gradients = 0;
  let solids = 0;
  (function walk(n: any) {
    if (!n || typeof n !== 'object') return;
    for (const f of Array.isArray(n.fills) ? n.fills : []) {
      const t = String(f?.type || '');
      if (t === 'IMAGE' || t === 'VIDEO') hasImage = true;
      else if (t.startsWith('GRADIENT')) gradients += 1;
      else if (t === 'SOLID') solids += 1;
    }
    for (const c of n.children || []) walk(c);
  })(node);
  return { hasImage, gradients, solids };
}

// ───────────────────────── 计划构建 ─────────────────────────

export function buildBackfillPlan(opts: BuildPlanOptions): BackfillPlan {
  const figmaRoot = opts.figmaRoot?.document ?? opts.figmaRoot;
  const truth: TruthInventory = opts.truth ?? collectFigmaTruth(figmaRoot);
  const prodFiles = opts.prodFiles;
  const e2n: E2nMap = opts.e2n ?? buildE2nMap(figmaRoot, prodFiles);
  const index = buildStyleRuleIndex(prodFiles);
  const contentByPath = new Map(prodFiles.map((f) => [f.path, f.content]));
  const consumedByOther = new Set(opts.agentConsumed ?? []);

  const entries: PlanEntry[] = [];
  const gaps: PlanGap[] = [];
  const byKind = {
    'bg-image': { candidates: 0, apply: 0, skip: 0, satisfied: 0 },
    'inline-image': { candidates: 0, apply: 0, skip: 0, satisfied: 0 },
    'fill-color': { candidates: 0, apply: 0, skip: 0, satisfied: 0 },
    'text-truth': { candidates: 0, apply: 0, skip: 0, satisfied: 0 },
  } as BackfillPlanStats['byKind'];

  const pushEntry = (e: PlanEntry) => {
    entries.push(e);
    const b = byKind[e.kind];
    b.candidates += 1;
    if (e.decision === 'apply') b.apply += 1;
    else b.skip += 1;
    if (e.decision === 'apply' && e.targets.length > 0 && e.targets.every((t) => t.satisfied)) b.satisfied += 1;
  };

  // ── ① 背景图（容器级底图）：资源 bbox ≈ 父容器 bbox ─────────────────────
  for (const a of truth.assets as FigmaAssetTruth[]) {
    // 🔴 S2：bg 路由收口 isBgClassAsset（bg- 前缀外底图同入 bg-image 计划）
    if (!a.fileName || !isBgClassAsset(a)) continue;
    const parent = a.parentId ? findNodeById(figmaRoot, a.parentId) : undefined;
    const pb = parent?.absoluteBoundingBox;
    const evidence: string[] = [];
    evidence.push(
      pb
        ? `资源 bbox ${fmtNum(a.width)}×${fmtNum(a.height)} ${a.containerLevel ? '≈' : '≠'} 父容器 ${fmtNum(pb.width)}×${fmtNum(pb.height)}（±1px）⇒ ${a.containerLevel ? '容器级整块底图' : '元素级局部图'}`
        : `资源 bbox ${fmtNum(a.width)}×${fmtNum(a.height)}（父容器无 bbox，无法判容器级）`,
    );
    if (a.parentTexts?.length) {
      evidence.push(`容器子树文本 [${a.parentTexts.slice(0, 6).map((t) => `「${t}」`).join(' ')}]`);
    }
    if (consumedByOther.has(a.fileName)) evidence.push('该资源已被 AI 兜底通道消费（计划不重复规划）');
    // 🔴 像素事实：alpha 决定这块图是「整块底图」还是「叠加层」。删错方向的代价是整块变白。
    const op = opts.assetOpacity?.[a.fileName];
    const overlay = !!op && op.meanAlpha < OPAQUE_BG_ALPHA;
    if (op) {
      evidence.push(
        `资源 alpha 均值 ${op.meanAlpha}/255（可见像素 ${Math.round((op.visibleRatio ?? 0) * 100)}%）⇒ ${
          overlay
            ? '半透明**叠加层**：保留原底色，把图叠在上层'
            : '不透明**整块底图**：可整条替换底色'
        }`,
      );
    }

    const base: PlanEntry = {
      id: `bg/${a.nodeId}`,
      kind: 'bg-image',
      decision: 'apply',
      figma: {
        nodeId: String(a.nodeId),
        name: String(a.name ?? ''),
        type: 'IMAGE',
        w: a.width,
        h: a.height,
        parentId: a.parentId,
      },
      evidence,
      targets: [],
      conflicts: [],
      payload: {
        containerLevel: !!a.containerLevel,
        figmaNodeName: a.name,
        fileName: a.fileName,
        alpha: op?.meanAlpha,
        overlay,
      },
    };

    // 🔴 先判「这张 png 是不是渐变组的渲染图」——它决定后面所有落点/叠加判定是否成立。
    //   顺序必须在父容器/容器级判据之前：渲染图不是图片资源，挂不挂 url 与落点无关。
    const bgNode = findNodeById(figmaRoot, String(a.nodeId));
    const fillProfile = bgNode ? fillProfileOf(bgNode) : undefined;
    if (fillProfile && !fillProfile.hasImage && fillProfile.gradients > 0) {
      base.decision = 'skip';
      base.skipReason = 'gradient-render';
      evidence.push(
        `🔴 节点子树零 IMAGE fill、含 ${fillProfile.gradients} 条 GRADIENT_* ⇒ 该 png 是**渐变组渲染图**，不是图片资源：应以 CSS 渐变还原，不主张挂 url()`,
      );
      pushEntry(base);
      gaps.push({
        kind: 'gradient-fill',
        figmaId: String(a.nodeId),
        detail: `渐变渲染图（${fillProfile.gradients} 条 GRADIENT_*、零 IMAGE fill）—— 待采集 colorStops/handles 还原 linear-gradient`,
      });
      continue;
    }

    if (!a.parentId) {
      base.decision = 'skip';
      base.skipReason = 'no-parent';
      evidence.push('Figma 侧无父容器 ⇒ 无法定位容器落点');
      pushEntry(base);
      gaps.push({ kind: 'bg-image', figmaId: String(a.nodeId), detail: '资源无父容器，无法确定容器落点' });
      continue;
    }
    const edge = findE2nEdge(e2n, a.parentId);
    if (!edge) {
      base.decision = 'skip';
      base.skipReason = 'no-e2n-edge';
      evidence.push(`父容器 ${a.parentId} 在产物里没有结构映射（E2N 无边）⇒ 落点不明，需补文本/结构锚点`);
      pushEntry(base);
      gaps.push({ kind: 'bg-image', figmaId: String(a.nodeId), detail: `父容器 ${a.parentId} 无 E2N 边` });
      continue;
    }
    evidence.push(
      `父容器 ${a.parentId}「${edge.figmaName}」→ ${edge.prodPath} ${edge.classes.map((c) => `.${c}`).join('')}（${edge.how}，匹配 ${edge.matched} 文本${edge.instCount > 1 ? `，v-for ×${edge.instCount}` : ''}）`,
    );
    base.prod = { file: edge.prodPath, path: edge.prodPath, classes: edge.classes };

    if (!a.containerLevel) {
      // 元素级 bg（资源只占父容器一部分）——容器整体换图会把兄弟内容也吞掉，标记为需人工判定
      base.decision = 'skip';
      base.skipReason = 'not-container-level';
      evidence.push('资源明显小于父容器 ⇒ 不是整块底图；当前计划不主张替换容器背景（避免吞掉兄弟元素）');
      pushEntry(base);
      gaps.push({ kind: 'bg-image', figmaId: String(a.nodeId), detail: '元素级 bg 待定落点（容器级判据不成立）' });
      continue;
    }

    const resolved = resolveClassRules(index, edge);
    if (resolved.skip) {
      base.decision = 'skip';
      base.skipReason = resolved.skip;
      evidence.push(`落点解析失败：${resolved.detail}`);
      pushEntry(base);
      gaps.push({ kind: 'bg-image', figmaId: String(a.nodeId), detail: `${resolved.skip}: ${resolved.detail}` });
      continue;
    }

    const cls = resolved.cls!;
    const hits = resolved.hits!;
    evidence.push(
      `落点 .${cls} 命中 ${hits.length} 处投影：${hits.map((h) => `${h.file.path}${themeTagOf(h.rule.selNorm)}`).join(' / ')}（同一逻辑规则的多份副本，必须全部替换，否则被后注入者压掉）`,
    );
    for (const h of hits) {
      const content = contentByPath.get(h.file.path) ?? h.file.content;
      const body = content.slice(h.rule.bodyStart, h.rule.bodyEnd);
      const d = readBgDecl(body);
      let after = bgUrlFor(h.file.path, a.fileName);
      const key = `${h.file.path}::${h.rule.bodyStart}`;
      let action: PlanAction = 'insert';
      let before: string | undefined;
      let satisfied = false;
      if (d.kind === 'background' && d.hasUrl) {
        const cur = urlFileNameOf(d.value);
        const leftover = hasExtraBgLayers(d.value);
        // 叠加层：图 + 底色共存才是目标态；整块底图：必须单层
        satisfied = cur === a.fileName && (overlay || !leftover);
        action = satisfied ? 'noop' : 'replace-url';
        before = d.value.trim();
        // 🔴 已满足 ⇒ 现状就是目标态，after 必须回填现状。否则报告会出现
        //   「已满足 / 叠图（留底色）」却在 after 列把底色剥掉 —— 照报告手改会把底色删光，
        //   半透明叠加层下整块编白（白底 + 白字 = 看不见）。
        if (satisfied) after = before;
        if (cur !== a.fileName) {
          evidence.push(`⚠ ${h.file.path} 该规则已挂其他图（${cur ?? '?'}）⇒ 计划替换`);
        } else if (!satisfied && leftover) {
          evidence.push(`⚠ ${h.file.path} 已挂本图但残留旧图层（渐变/纯色叠在图上）⇒ 计划清理为单层`);
        }
      } else if (d.kind === 'background') {
        if (overlay) {
          // 半透明图必须叠在底色之上（CSS 多背景：先写着在最上层）
          action = 'layer-url';
          before = d.value.trim();
          after = `${after}, ${d.value.trim()}`;
        } else {
          action = d.isGradient ? 'replace-gradient' : 'replace-color';
          before = d.value.trim();
        }
      } else if (d.kind === 'background-color') {
        if (overlay) {
          action = 'layer-url';
          before = `${d.match.trim()}`;
          after = `${after}, ${d.value.trim()}`;
        } else {
          action = 'replace-bg-color';
          before = `${d.match.trim()}`;
        }
      } else {
        before = '(无背景声明)';
      }
      base.targets.push({
        file: h.file.path,
        key,
        selector: selKeyOf(h.rule.selNorm),
        cls,
        action,
        before,
        after,
        satisfied,
      });
    }
    if (base.targets.length > 0 && base.targets.every((t) => t.satisfied)) {
      evidence.push('现状已全部满足（幂等空转，执行器不会写盘）');
    }
    pushEntry(base);
  }

  // ── ② 静态图（元素级 <img> / 图标变量） ─────────────────────────────
  for (const a of truth.assets as FigmaAssetTruth[]) {
    // 🔴 S2：inline 路由收口 isIconClassAsset（bg/strip 归 bg-image、decor 不进计划）
    if (!a.fileName || !isIconClassAsset(a)) continue;
    const evidence: string[] = [];
    evidence.push(`资源 bbox ${fmtNum(a.width)}×${fmtNum(a.height)}（元素级，非容器底图）`);
    if (a.parentTexts?.length) {
      evidence.push(`容器子树文本 [${a.parentTexts.slice(0, 6).map((t) => `「${t}」`).join(' ')}]`);
    }
    const edge = a.parentId ? findE2nEdge(e2n, a.parentId) : undefined;
    if (edge) {
      evidence.push(
        `父容器 ${a.parentId}「${edge.figmaName}」→ ${edge.prodPath} ${edge.classes.map((c) => `.${c}`).join('')}`,
      );
    } else if (a.parentId) {
      evidence.push(`父容器 ${a.parentId} 无 E2N 边`);
    }
    const refs = findAssetRefs(prodFiles, a.fileName);
    const entry: PlanEntry = {
      id: `img/${a.nodeId}`,
      kind: 'inline-image',
      decision: 'apply',
      figma: { nodeId: String(a.nodeId), name: String(a.name ?? ''), type: 'IMAGE', w: a.width, h: a.height, parentId: a.parentId },
      prod: edge ? { file: edge.prodPath, path: edge.prodPath, classes: edge.classes } : undefined,
      evidence,
      targets: [],
      conflicts: [],
      payload: { refs: refs.map((r) => ({ file: r.file, kind: r.kind, snippet: r.snippet })) },
    };
    if (refs.length > 0) {
      evidence.push(`产物已引用该文件 ${refs.length} 处（${refs.map((r) => `${r.file}:${r.kind}`).join(', ')}）`);
      entry.targets = refs.map((r) => ({
        file: r.file,
        key: `${r.file}::ref:${a.fileName}`,
        action: 'noop' as PlanAction,
        before: r.snippet,
        satisfied: true,
      }));
    } else {
      evidence.push('产物无任何引用 ⇒ 需要新增 <img src> / 图标变量绑定');
      entry.decision = 'skip';
      entry.skipReason = refs.length === 0 && !edge ? 'no-anchor' : 'needs-new-element';
      gaps.push({ kind: 'inline-image', figmaId: String(a.nodeId), detail: '产物无引用，需新增元素（当前计划不主张）' });
    }
    pushEntry(entry);
  }

  // ── ③ 容器背景色（Figma SOLID fill） ────────────────────────────────
  for (const c of truth.containers) {
    const evidence: string[] = [
      `Figma 容器「${c.name}」SOLID fill ${c.color}`,
      `子树文本 [${c.childTexts.slice(0, 6).map((t) => `「${t}」`).join(' ')}]`,
    ];
    const entry: PlanEntry = {
      id: `fill/${c.nodeId}`,
      kind: 'fill-color',
      decision: 'apply',
      figma: { nodeId: String(c.nodeId), name: String(c.name ?? '') },
      evidence,
      targets: [],
      conflicts: [],
      payload: { color: c.color },
    };
    const edge = findE2nEdge(e2n, c.nodeId);
    if (!edge) {
      entry.decision = 'skip';
      entry.skipReason = 'no-e2n-edge';
      evidence.push('该容器在产物里没有结构映射');
      pushEntry(entry);
      gaps.push({ kind: 'container-fill', figmaId: String(c.nodeId), detail: '容器无 E2N 边' });
      continue;
    }
    evidence.push(
      `容器 → ${edge.prodPath} ${edge.classes.map((x) => `.${x}`).join('')}（${edge.how}，匹配 ${edge.matched} 文本）`,
    );
    entry.prod = { file: edge.prodPath, classes: edge.classes };
    const resolved = resolveClassRules(index, edge);
    if (resolved.skip) {
      entry.decision = 'skip';
      entry.skipReason = resolved.skip;
      evidence.push(`落点解析失败：${resolved.detail}`);
      pushEntry(entry);
      continue;
    }
    const cls = resolved.cls!;
    for (const h of resolved.hits!) {
      const content = contentByPath.get(h.file.path) ?? h.file.content;
      const body = content.slice(h.rule.bodyStart, h.rule.bodyEnd);
      const d = readBgDecl(body);
      const target: PlanTarget = {
        file: h.file.path,
        key: `${h.file.path}::${h.rule.bodyStart}`,
        selector: selKeyOf(h.rule.selNorm),
        cls,
        action: 'set-background-color',
        after: c.color,
        satisfied: false,
      };
      if (d.kind === 'background' && d.hasUrl) {
        target.action = 'noop';
        target.before = d.value.trim();
        entry.conflicts.push({
          entryId: `bg@${h.file.path}:${h.rule.bodyStart}`,
          rule: 'background 是简写属性，只能有一个值',
          resolution: '底图优先：本容器已由背景图通道接管，fill 色不再写入',
        });
      } else if (d.kind === 'none') {
        target.action = 'set-background-color';
        target.before = '(无背景声明)';
      } else {
        target.before = d.value.trim();
        target.satisfied = normColor(d.value) === normColor(c.color);
      }
      entry.targets.push(target);
    }
    pushEntry(entry);
  }

  // ── ③c 叶子填充矩形（背景板）：SOLID 与 GRADIENT 同一通道（2026-11-06）──────
  // ③ 只覆盖「有直接子文本的容器」；Figma 常见的「bg 矩形 + 内容平级」画法下矩形是叶子，
  // 永远进不了 ③ ⇒ 背景色/整屏渐变系统性漏回（36:1695 #e1ebff、36:1694 渐变）。
  // 这里用「几何覆盖文本 → 产物公共祖先」补上（anchorByCoveredTexts），
  // 判定与落点仍只看 Figma 事实 + 结构映射，不看产物 CSS 数值。
  for (const r of truth.fillRects ?? []) {
    const after = r.gradient ?? r.color;
    if (!after) continue;
    const isGradient = !!r.gradient;
    const evidence: string[] = [
      `Figma 叶子填充矩形「${r.name}」${Math.round(r.bbox.width)}×${Math.round(r.bbox.height)} ${isGradient ? '渐变' : '纯色'} ${after}`,
      `几何覆盖文本 ${r.coveredTexts.length} 条 [${r.coveredTexts.slice(0, 5).map((t) => `「${t}」`).join(' ')}${r.coveredTexts.length > 5 ? ' …' : ''}]`,
    ];
    const entry: PlanEntry = {
      id: `fillrect/${r.nodeId}`,
      kind: 'fill-color',
      decision: 'apply',
      figma: { nodeId: String(r.nodeId), name: String(r.name ?? '') },
      evidence,
      targets: [],
      conflicts: [],
      payload: { color: after },
    };
    const edge = anchorByCoveredTexts(e2n, r.coveredTexts);
    if (!edge) {
      entry.decision = 'skip';
      entry.skipReason = 'no-anchor';
      evidence.push('覆盖文本在产物里没有共同祖先（分布在不同子树）');
      pushEntry(entry);
      gaps.push({ kind: 'container-fill', figmaId: String(r.nodeId), detail: '叶子填充矩形的覆盖文本无共同祖先' });
      continue;
    }
    evidence.push(
      `矩形 → ${edge.prodPath} ${edge.classes.map((x) => `.${x}`).join('')}（fill-rect-cover，覆盖 ${edge.matched} 文本）`,
    );
    entry.prod = { file: edge.prodPath, classes: edge.classes };
    const resolved = resolveClassRules(index, edge);
    if (resolved.skip) {
      entry.decision = 'skip';
      entry.skipReason = resolved.skip;
      evidence.push(`落点解析失败：${resolved.detail}`);
      pushEntry(entry);
      continue;
    }
    const cls = resolved.cls!;
    for (const h of resolved.hits!) {
      const content = contentByPath.get(h.file.path) ?? h.file.content;
      const body = content.slice(h.rule.bodyStart, h.rule.bodyEnd);
      const d = readBgDecl(body);
      const target: PlanTarget = {
        file: h.file.path,
        key: `${h.file.path}::${h.rule.bodyStart}`,
        selector: selKeyOf(h.rule.selNorm),
        cls,
        action: 'set-background-color',
        after,
        satisfied: false,
      };
      if (d.kind === 'background' && d.hasUrl) {
        // 背景图通道已接管该元素：background 是简写，塞颜色会把 url 整条吃掉
        target.action = 'noop';
        target.before = d.value.trim();
        entry.conflicts.push({
          entryId: `bg@${h.file.path}:${h.rule.bodyStart}`,
          rule: 'background 是简写属性，只能有一个值',
          resolution: '底图优先：该元素已由背景图通道接管，矩形 fill 不再写入',
        });
      } else if (d.kind === 'none') {
        target.before = '(无背景声明)';
      } else {
        target.before = d.value.trim();
        // 🔴 幂等判据：渐变不能走 normColor（会把 linear-gradient(...) 归一成空/误判），
        //   按「去空白后的字面量」比较；纯色仍走 normColor（#FFF ≡ #ffffff）。
        target.satisfied = isGradient
          ? d.value.replace(/\s+/g, '') === after.replace(/\s+/g, '')
          : normColor(d.value) === normColor(after);
        // 已是目标态 ⇒ 不主张动作（与背景图通道 line 487 同一约定：satisfied → action=noop），
        // 否则报表会出现「计划 apply、实际零写入」的自相矛盾条目。
        if (target.satisfied) target.action = 'noop';
      }
      entry.targets.push(target);
    }
    pushEntry(entry);
  }

  // ── ③b 渐变 fill：属于「需要颜色真值」但当前真值采集器不收（SOLID/IMAGE 之外） ──
  // 只登记**容器级**（bbox ≈ 父容器）或设计者命名为 `bg` 的渐变节点——它们是"这块区域的背景"，
  // 产物里的渐变目前是 LLM 猜的色标，无法对账。这是计划必须显式承认的事实缺口。
  {
    const seenSig = new Set<string>();
    /** ③c 已能落地的渐变矩形，不再登记为「事实缺口」（否则报告自相矛盾：既执行又报缺口） */
    const handledGradIds = new Set(
      (truth.fillRects ?? []).filter((r) => !!r.gradient).map((r) => String(r.nodeId)),
    );
    const walkGrad = (n: any, parent?: any) => {
      if (!n || typeof n !== 'object') return;
      const fills = Array.isArray(n.fills) ? n.fills.filter((f: any) => f?.visible !== false) : [];
      const isGrad = fills.some((f: any) => typeof f?.type === 'string' && f.type.startsWith('GRADIENT_'));
      const b = n.absoluteBoundingBox ?? {};
      const pb = parent?.absoluteBoundingBox ?? {};
      const containerLevel =
        typeof b.width === 'number' && typeof pb.width === 'number' &&
        Math.abs(b.width - pb.width) <= 1 && Math.abs(b.height - pb.height) <= 1;
      if (
        isGrad &&
        n.type !== 'TEXT' &&
        (containerLevel || /^bg$/i.test(String(n.name ?? ''))) &&
        !handledGradIds.has(String(n.id ?? ''))
      ) {
        const sig = `${n.name}#${Math.round(Number(b.width) || 0)}x${Math.round(Number(b.height) || 0)}`;
        if (!seenSig.has(sig)) {
          seenSig.add(sig);
          gaps.push({
            kind: 'gradient-fill',
            figmaId: String(n.id ?? ''),
            detail: `渐变 fill（${n.type}「${n.name}」${Math.round(Number(b.width) || 0)}×${Math.round(Number(b.height) || 0)}）—— 渐变真值未采集，产物里是猜的`,
          });
        }
      }
      for (const c of n.children ?? []) walkGrad(c, n);
    };
    walkGrad(figmaRoot);
  }

  // ── ④ 文本真值（颜色 / 字号 / 尺寸） ────────────────────────────────
  const seededProd = new Set<string>();
  for (const seed of e2n.seeds) {
    const t = truth.texts.find((x) => x.nodeId === seed.figmaId);
    if (!t) continue;
    const hasTruth = !!(t.color || t.fontSize || (t.width && t.height));
    const node = e2n.prodNodes.find((p) => p.key === seed.prodKey);
    if (!node) continue;
    const content = contentByPath.get(node.path);
    if (content == null) continue;
    const openEnd = content.indexOf('>', node.start);
    const openTag = openEnd > node.start ? content.slice(node.start, openEnd + 1) : '';
    const styleM = /style\s*=\s*"([^"]*)"/.exec(openTag);
    const style = styleM ? styleM[1] : '';
    // 现状口径 = 内联 style ∪ 该类名的 CSS 声明（真值可能已由样式规则满足）
    const cssColor = t.color ? declaredProp(index, node.path, node.classes, 'color') : undefined;
    const cssFont = t.fontSize ? declaredProp(index, node.path, node.classes, 'font-size') : undefined;
    const colorOk =
      !t.color ||
      style.toLowerCase().includes(t.color.toLowerCase()) ||
      (!!cssColor && normColor(cssColor.value) === normColor(t.color));
    const fontOk =
      !t.fontSize ||
      new RegExp(`font-size\\s*:\\s*${Math.round(t.fontSize)}(?:\\.\\d+)?px`).test(style) ||
      (!!cssFont && Math.abs(parseFloat(cssFont.value) - t.fontSize) < 0.51);
    const cssProps = [
      t.color ? `color:${t.color}` : '',
      t.fontSize ? `font-size:${Math.round(t.fontSize)}px` : '',
    ].filter(Boolean);
    const wants = [...cssProps, t.width && t.height ? `size:${t.width}×${t.height}` : ''].filter(Boolean);
    const beforeParts: string[] = [];
    if (style) beforeParts.push(`inline: ${style}`);
    if (cssColor) beforeParts.push(`CSS color:${cssColor.value}`);
    if (cssFont) beforeParts.push(`CSS font-size:${cssFont.value}`);
    const before = beforeParts.length ? beforeParts.join(' / ') : '(无内联 style、无 CSS 声明)';
    const evidence = [`Figma TEXT「${t.characters}」真值 ${wants.join(' ')}（${seed.how}）`];
    // 🔴 `<template #title-left>` 这类插槽标签不能承载 style（executor 也写不进去）——
    //    计划里必须标成不可写，而不是假装能改。
    const notStyleable = node.tag === 'template';
    // 元素文本是插值（{{ }}）时没有静态锚点：执行器按文本锚定会 interpSkipped，
    // 只能按 seed(prodKey) 定位 —— 这是「计划能定、执行器还不能落」的已知缺口。
    const interpOnly = node.ownStatic.length === 0 && node.ownInterp.length > 0;
    if (notStyleable) evidence.push(`<${node.tag}> 是插槽/结构包装标签，不能写 style ⇒ 真值需落到内层元素`);
    if (interpOnly) evidence.push(`元素文本为插值 {{ }}，无静态锚点 ⇒ 执行器需按 seed 定位（非文本锚定）`);
    if (cssColor || cssFont) {
      evidence.push(
        `现状（CSS 规则）：${[cssColor && `color ${cssColor.value} @ ${cssColor.where}`, cssFont && `font-size ${cssFont.value} @ ${cssFont.where}`].filter(Boolean).join('，')}`,
      );
    }
    if (seededProd.has(seed.prodKey)) evidence.push('⚠ 同一产物元素被多个 Figma 文本 seed 命中（真值可能互相覆盖）');
    // 现状不可静态判定（calc(@fontSize*0.75) / var(--x)）时不能当成「真值没落」——
    // 只能记「不可判定」，否则计划会把 12 张卡全判成待写，可信度直接归零。
    const colorExpr = !colorOk && isRuntimeExpr(cssColor?.value);
    const fontExpr = !fontOk && isRuntimeExpr(cssFont?.value);
    const colorBad = !colorOk && !colorExpr;
    const fontBad = !fontOk && !fontExpr;
    const undecidable = (colorExpr || fontExpr) && !colorBad && !fontBad;
    if (colorExpr || fontExpr) {
      evidence.push(
        `现状值不可静态判定：${[colorExpr && `color=${cssColor?.value}`, fontExpr && `font-size=${cssFont?.value}`].filter(Boolean).join('，')}（运行期表达式，需渲染后取值）`,
      );
    }
    seededProd.add(seed.prodKey);
    const entry: PlanEntry = {
      id: `txt/${seed.figmaId}`,
      kind: 'text-truth',
      decision: hasTruth && !notStyleable ? 'apply' : 'skip',
      skipReason: !hasTruth ? 'no-truth' : notStyleable ? 'not-styleable' : undefined,
      figma: { nodeId: seed.figmaId, name: '', type: 'TEXT', text: t.characters, w: t.width, h: t.height },
      prod: { file: node.path, tag: node.tag, classes: node.classes },
      evidence,
      targets: [
        {
          file: node.path,
          key: `${node.path}#${node.start}`,
          cls: node.classes[0],
          action: hasTruth && !notStyleable && !(colorOk && fontOk) ? 'set-inline-style' : 'noop',
          before,
          // after 只放**合法 CSS 声明**（size 是核对用的真值，不是 style 属性）
          after: cssProps.join('; '),
          satisfied: hasTruth ? colorOk && fontOk : true,
          ...(undecidable ? { undecidable: true } : {}),
        },
      ],
      conflicts: [],
      payload: { truth: { color: t.color, fontSize: t.fontSize, width: t.width, height: t.height }, interpOnly, undecidable },
    };
    pushEntry(entry);
  }

  // ── ⑤ 冲突消解：同一规则/元素被多条计划争用 ──────────────────────────
  const byKey = new Map<string, PlanEntry[]>();
  for (const e of entries) {
    if (e.decision !== 'apply') continue;
    for (const t of e.targets) {
      if (t.action === 'noop') continue;
      const key = t.key;
      const arr = byKey.get(key) ?? [];
      if (!arr.includes(e)) arr.push(e);
      byKey.set(key, arr);
    }
  }
  let conflictCount = 0;
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    list.sort((a, b) => KIND_PRIORITY[b.kind] - KIND_PRIORITY[a.kind]);
    const winner = list[0];
    for (const loser of list.slice(1)) {
      const prop = loser.kind === 'fill-color' ? 'background' : 'inline-style';
      conflictCount += 1;
      loser.decision = 'skip';
      loser.skipReason = 'conflict-lost';
      loser.conflicts.push({
        entryId: winner.id,
        rule: `同一落点 ${key} 争用 ${prop}（${winner.kind} vs ${loser.kind}）`,
        resolution: `${winner.kind} 优先（同属性只能有一个值），${loser.kind} 让位`,
      });
      winner.conflicts.push({
        entryId: loser.id,
        rule: `同一落点 ${key} 争用 ${prop}`,
        resolution: `${winner.kind} 胜出，${loser.kind} 让位`,
      });
      byKind[loser.kind].apply -= 1;
      byKind[loser.kind].skip += 1;
    }
  }

  const apply = entries.filter((x) => x.decision === 'apply');
  const satisfied = apply.filter((x) => x.targets.length > 0 && x.targets.every((t) => t.satisfied)).length;
  const undecidable = entries.filter((x) => x.targets.some((t) => t.undecidable)).length;
  return {
    builtAt: opts.now ?? new Date().toISOString(),
    stats: {
      entries: entries.length,
      apply: apply.length,
      skip: entries.length - apply.length,
      satisfied,
      undecidable,
      byKind,
      conflicts: conflictCount,
      gaps: gaps.length,
    },
    entries,
    gaps,
  };
}

// ───────────────────────── 人读渲染 ─────────────────────────

const KIND_LABEL: Record<PlanKind, string> = {
  'bg-image': '背景图（替换背景）',
  'inline-image': '静态图（元素级）',
  'fill-color': '背景色（容器 fill）',
  'text-truth': '文本真值（颜色/字号）',
};

const ACTION_LABEL: Record<PlanAction, string> = {
  'replace-gradient': '渐变→整条替换',
  'replace-color': '纯色→整条替换',
  'replace-bg-color': 'background-color→改写',
  insert: '插入 background',
  'replace-url': '换图',
  'layer-url': '叠图（留底色）',
  'set-src': '设 src',
  'set-background-color': '换背景色',
  'set-inline-style': '写内联 style',
  noop: '已满足',
};

/** Markdown 渲染（人读对账用；纯函数，可直接给前端/CLI 复用） */
export function renderPlanMarkdown(plan: BackfillPlan): string {
  const L: string[] = [];
  const s = plan.stats;
  L.push('# 回填计划（只读）');
  L.push('');
  L.push(`生成时间：${plan.builtAt}`);
  L.push('');
  L.push(
    `总条目 ${s.entries}｜执行 ${s.apply}（其中已满足 ${s.satisfied}）｜跳过 ${s.skip}｜冲突 ${s.conflicts}｜事实缺口 ${s.gaps}`,
  );
  L.push('');
  L.push('| 类别 | 候选 | 执行 | 跳过 | 已满足 |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const k of ['bg-image', 'inline-image', 'fill-color', 'text-truth'] as PlanKind[]) {
    const b = s.byKind[k];
    L.push(`| ${KIND_LABEL[k]} | ${b.candidates} | ${b.apply} | ${b.skip} | ${b.satisfied} |`);
  }

  for (const kind of ['bg-image', 'fill-color', 'inline-image'] as PlanKind[]) {
    const list = plan.entries.filter((e) => e.kind === kind);
    if (list.length === 0) continue;
    L.push('');
    L.push(`## ${KIND_LABEL[kind]}（${list.length}）`);
    L.push('');
    L.push('| Figma | 产物落点 | 动作 | 现状 → 计划 | 判定 |');
    L.push('| --- | --- | --- | --- | --- |');
    for (const e of list) {
      const fig = `${e.figma.nodeId} ${e.figma.name || ''}${e.figma.text ? `「${e.figma.text}」` : ''}`.trim();
      // 同一 (文件, 类名) 的多条投影（明文/.dark/.light）合并成一行，避免重复刷屏
      const groups = new Map<string, PlanTarget[]>();
      for (const t of e.targets) {
        const gk = `${t.file}::${t.cls ?? t.selector ?? ''}`;
        const arr = groups.get(gk) ?? [];
        arr.push(t);
        groups.set(gk, arr);
      }
      const prod = groups.size
        ? [...groups.values()].map((ts) => {
            const t = ts[0];
            const label = `${t.file}${t.cls ? ` .${t.cls}` : t.selector ? ` ${t.selector}` : ''}`;
            return `${label}${ts.length > 1 ? ` ×${ts.length} 投影` : ''}`;
          }).join('<br>')
        : (e.prod?.classes ?? []).map((c) => `.${c}`).join('') || '—';
      const act = e.targets.length ? [...new Set(e.targets.map((t) => ACTION_LABEL[t.action]))].join(' / ') : '—';
      const flow = e.targets.length
        ? [...groups.values()]
            .map((ts) => {
              const befores = [...new Set(ts.map((t) => t.before ?? '—'))];
              return `${befores.join(' ¦ ')} → ${ts[0].after ?? (ts[0].action === 'noop' ? '（已是目标态）' : '—')}`;
            })
            .join('<br>')
        : '—';
      const allDone = e.targets.length > 0 && e.targets.every((t) => t.satisfied);
      const verdict = e.decision === 'apply' ? (allDone ? '✅ 已满足' : '🟡 待执行') : `⏭ ${e.skipReason}`;
      L.push(`| ${fig} | ${prod} | ${act} | ${flow} | ${verdict} |`);
    }
  }

  // 背景图逐条依据（最需要人工复核的部分：为什么这块该用这张图、为什么落在这个类上）
  const bgList = plan.entries.filter((e) => e.kind === 'bg-image');
  if (bgList.length > 0) {
    L.push('');
    L.push('### 背景图逐条依据');
    for (const e of bgList) {
      L.push('');
      L.push(
        `**${e.figma.nodeId} ${e.figma.name}${e.figma.parentId ? `（父容器 ${e.figma.parentId}）` : ''}** — ${
          e.decision === 'apply' ? '计划执行' : `跳过：${e.skipReason}`
        }`,
      );
      for (const ev of e.evidence) L.push(`- ${ev}`);
      for (const c of e.conflicts) L.push(`- 冲突：${c.rule} ⇒ ${c.resolution}`);
    }
  }

  const texts = plan.entries.filter((e) => e.kind === 'text-truth');
  if (texts.length > 0) {
    const pending = texts.filter((e) => e.decision === 'apply' && e.targets.some((t) => !t.satisfied));
    const undec = pending.filter((e) => e.targets[0]?.undecidable);
    const todo = pending.filter((e) => !e.targets[0]?.undecidable);
    const done = texts.length - pending.length;
    L.push('');
    L.push(
      `## ${KIND_LABEL['text-truth']}（${texts.length}：已满足 ${done} / 待写 ${todo.length} / 不可静态判定 ${undec.length}）`,
    );
    for (const [title, list] of [
      ['待写', todo],
      ['不可静态判定（现状是 calc()/var() 表达式，需渲染后取值）', undec],
    ] as Array<[string, PlanEntry[]]>) {
      if (list.length === 0) continue;
      L.push('');
      L.push(`**${title}**`);
      L.push('');
      L.push('| Figma 文本 | 产物元素 | 现状 → 计划 |');
      L.push('| --- | --- | --- |');
      for (const e of list.slice(0, 40)) {
        const t = e.targets[0];
        const mark = e.payload?.interpOnly ? ' ⚠插值' : '';
        L.push(
          `| 「${String(e.figma.text).replace(/\n/g, '⏎')}」 | ${e.prod?.file} <${e.prod?.tag}> .${(e.prod?.classes ?? []).join('.')}${mark} | ${t.before} → ${t.after} |`,
        );
      }
    }
  }

  if (plan.gaps.length > 0) {
    L.push('');
    L.push(`## 事实缺口（${plan.gaps.length}）—— 这些没法定，需要补判据`);
    L.push('');
    for (const g of plan.gaps) L.push(`- \`${g.kind}\` ${g.figmaId ?? ''}：${g.detail}`);
  }
  L.push('');
  return L.join('\n');
}
