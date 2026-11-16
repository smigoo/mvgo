/**
 * 🛡️ S0（2026-11-14 · mc-max-1794651114530-9ed088e3 实锤）：**布局结构事实**（layout facts）。
 *
 * ## 为什么需要它
 * 现状「布局真值」有 7 个写者（prompt-builder / LLM / code-healer / resource-mounter /
 * takeover / code-generator / file-writer 终裁覆写），每个都自己猜方向与间距：
 *   - `@antd/tab` 真值 `itemSpacing = 8.04`，产物写 `gap:16`；
 *   - `2:3660「1统计」` 两张卡与中间装饰图**几何上重叠**，产物却按 flex 行摊平；
 *   - `flex:0.044…0.260`（Σ=1）再叠 `margin-top` 101px ⇒ 总高溢出 12.5%。
 * 本模块把这些判断**收敛成一份事实**，只吃几何，供分析阶段冻结、下游只读。
 *
 * ## 判据原则
 *   - **只看 bbox + 父子关系 + 节点类型**；`layoutMode` 仅用于交叉验证（`modeConflict`），
 *     因为真机实测它不可信（`2:3660` 标 HORIZONTAL 但子项重叠；`88:32` 未标却是一行）。
 *   - **fail-open**：缺 bbox / 子项 <2 ⇒ `unknown`，调用方不写布局，绝不猜。
 *   - 纯函数：不读盘、不改入参。
 *
 * ## 五态
 *   `row` / `row-between` / `column` / `column-between` / `column-stack` / `free-overlay` / `unknown`
 *   - `row|column`        ：主轴间距齐次（极差 ≤2px）⇒ 可用 `gap: 真值`
 *   - `*-between`         ：首尾贴容器内缘、中间弹性 ⇒ 用 `justify-content: space-between`
 *   - `column-stack`      ：纵向但间距不齐 ⇒ 逐项 `margin` = 真值差（不能用一个 gap）
 *   - `free-overlay`      ：子项重叠 / 交叉摆放 ⇒ 只能 absolute/grid 叠放，**禁止 flex 比例**
 */

import { filterLayoutChildren, resolveDeclaredAutoLayout } from './layout-child-filter.js';

export const LAYOUT_FACTS_VERSION = 1;

/** 子项贴合/交叠容差（px） */
const EPS = 2;
/** 间距齐次容差（px）：1px 以内算同一间距（2px 会把 [16,15] 误判成"齐次"，吞掉 between 语义） */
const GAP_UNIFORM_TOL = 1;
/** between 判据：首尾贴容器内缘的容差（px） */
const EDGE_TOL = 16;
/** G2：单间隙超过主轴尺寸该比例 ⇒ between（而不是写一个巨大的 gap） */
const G2_SPAN_RATIO = 0.3;
/**
 * G4：`between` 只对**少量子项**成立（两端对齐的语义）。
 * 8 个子项若判 between，等于把真值间距总和平均摊成弹性空白（slot-con 实测 Σgap=60 会被摊平），
 * 与"逐项 margin = 真值差"相比信息全丢 ⇒ 子项数 > 3 一律走 stack。
 */
const BETWEEN_MAX_CHILDREN = 3;
/** 主轴相邻子项在交叉轴上的最小重叠率（0~1） */
const MIN_OVERLAP_RATIO = 0.5;

function boxOf(node) {
  const b = node?.absoluteBoundingBox || node?.bbox;
  if (!b) return null;
  const { x, y, width, height } = b;
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, w: width, h: height };
}

function overlapLen(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** 主轴排序后，相邻子项在交叉轴上的平均重叠率（按较小边归一） */
function avgCrossOverlap(sorted, axis) {
  if (sorted.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const p = sorted[i - 1].box;
    const c = sorted[i].box;
    if (axis === 'y') {
      const base = Math.min(p.w, c.w);
      sum += base > 0 ? overlapLen(p.x, p.x + p.w, c.x, c.x + c.w) / base : 0;
    } else {
      const base = Math.min(p.h, c.h);
      sum += base > 0 ? overlapLen(p.y, p.y + p.h, c.y, c.y + c.h) / base : 0;
    }
  }
  return sum / (sorted.length - 1);
}

/**
 * 分析单个容器。
 * @param {object} container Figma 节点（需含 children 与 absoluteBoundingBox）
 * @returns {object} facts（永不为 null；不可判定时为 `{mode:'unknown', reason}`）
 */
export function inferLayoutFactsForContainer(container) {
  const cb = boxOf(container);
  // 🛡️ R3-2（2026-11-16）：声明定性走统一判据（非容器类型带 AL ⇒ 作废，不算「声明」），
  //   绝对定位子项先剔除再测（否则「声明 row + 绝对浮层」会被误判成声明说谎）。
  const al = resolveDeclaredAutoLayout(container);
  const layoutMode = al.layoutMode;
  const declaredDir = al.valid ? al.dir : null;
  const { children: layoutChildren, absoluteSkipped } = filterLayoutChildren(container);
  const skippedField = absoluteSkipped > 0 ? { absoluteSkipped } : null;
  if (!cb) return { mode: 'unknown', reason: 'no-container-box', layoutMode };

  const kids = layoutChildren
    .map((node) => ({ node, box: boxOf(node) }))
    .filter((k) => k.box);
  if (kids.length < 2) {
    return {
      mode: 'unknown',
      reason: 'single-child',
      childCount: kids.length,
      layoutMode,
      ...(skippedField || {}),
    };
  }

  const mark = (facts) => {
    if (skippedField) Object.assign(facts, skippedField);
    if (al.declared) {
      facts.alDeclared = al.dir;
      if (!al.valid) facts.alInvalid = true;
      // 间距交叉验证：`itemSpacing` 是 mode 侧唯一可读的间距真值：
      //   真机 `1263:38` 标 `itemSpacing=3`，几何实际 29px ⇒ mode 侧间距也不可信。
      const declaredSpacing = Number(container?.itemSpacing);
      if (
        al.valid &&
        facts.gap != null &&
        Number.isFinite(declaredSpacing) &&
        Math.abs(declaredSpacing - facts.gap) > 1
      ) {
        facts.spacingConflict = true;
      }
      if (declaredDir) {
        const okRow = facts.mode === 'row' || facts.mode === 'row-between';
        const okCol =
          facts.mode === 'column' || facts.mode === 'column-stack' || facts.mode === 'column-between';
        facts.modeConflict = declaredDir === 'row' ? !okRow : !okCol;
        facts.alAgree = !facts.modeConflict;
      }
    }
    return facts;
  };

  // ── 主轴：区间不交叠 + 交叉轴重叠率高 ─────────────────────────────
  const byY = [...kids].sort((a, b) => a.box.y - b.box.y);
  const byX = [...kids].sort((a, b) => a.box.x - b.box.x);
  const yClear = byY.every(
    (k, i) => i === 0 || k.box.y >= byY[i - 1].box.y + byY[i - 1].box.h - EPS,
  );
  const xClear = byX.every(
    (k, i) => i === 0 || k.box.x >= byX[i - 1].box.x + byX[i - 1].box.w - EPS,
  );
  const yCross = avgCrossOverlap(byY, 'y'); // 按 x 重叠
  const xCross = avgCrossOverlap(byX, 'x'); // 按 y 重叠
  const col = yClear && yCross >= MIN_OVERLAP_RATIO;
  const row = xClear && xCross >= MIN_OVERLAP_RATIO;

  if (!col && !row) {
    return mark({
      mode: 'free-overlay',
      reason: yClear || xClear ? 'overlap-on-main-axis' : 'cross-axis-layout',
      childCount: kids.length,
      layoutMode,
    });
  }
  const dir = col && row ? (yCross >= xCross ? 'column' : 'row') : col ? 'column' : 'row';
  const sorted = dir === 'column' ? byY : byX;

  // ── 间隙 ────────────────────────────────────────────────────────
  const gaps = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const p = sorted[i - 1].box;
    const c = sorted[i].box;
    gaps.push(Math.round(dir === 'column' ? c.y - (p.y + p.h) : c.x - (p.x + p.w)));
  }
  if (gaps.some((g) => g < -EPS)) {
    return mark({
      mode: 'free-overlay',
      reason: 'children-overlap',
      gaps,
      childCount: kids.length,
      layoutMode,
    });
  }

  const first = sorted[0].box;
  const last = sorted[sorted.length - 1].box;
  const head = Math.round(dir === 'column' ? first.y - cb.y : first.x - cb.x);
  const tail = Math.round(
    dir === 'column' ? cb.y + cb.h - (last.y + last.h) : cb.x + cb.w - (last.x + last.w),
  );
  const span = dir === 'column' ? cb.h : cb.w;
  const overflow = head < -EPS || tail < -EPS;

  const gapMin = Math.min(...gaps);
  const gapMax = Math.max(...gaps);
  const uniform = gapMax - gapMin <= GAP_UNIFORM_TOL;

  // ── 对齐（交叉轴）───────────────────────────────────────────────
  const starts = sorted.map((k) => (dir === 'column' ? k.box.x : k.box.y));
  const centers = sorted.map((k) =>
    dir === 'column' ? k.box.x + k.box.w / 2 : k.box.y + k.box.h / 2,
  );
  const sizes = sorted.map((k) => (dir === 'column' ? k.box.w : k.box.h));
  const nearAll = (arr) => Math.max(...arr) - Math.min(...arr) <= EPS;
  const align = nearAll(starts) ? 'MIN' : nearAll(centers) ? 'CENTER' : nearAll(sizes) ? 'STRETCH' : null;

  const base = { gaps, childCount: kids.length, align, layoutMode, overflow };

  // ── 三种结论（含守卫 G1/G2/G3）──────────────────────────────────
  // G1 越界：子项越出容器 ⇒ 首尾贴边不可信，不判 between
  // G2 单间隙过大：只有一个间隙且 > 主轴×0.3 ⇒ between（避免写 gap:178 这种荒谬值）
  // G3 间距不齐：只在"首尾贴边 + 无越界"时判 between，否则 stack（逐项 margin 真值）
  const edgesFlush =
    !overflow && head >= -EPS && tail >= -EPS && head <= EDGE_TOL && tail <= EDGE_TOL;
  const singleHugeGap = gaps.length === 1 && gaps[0] > span * G2_SPAN_RATIO;
  const fewChildren = kids.length <= BETWEEN_MAX_CHILDREN;
  // 🔴 G2 必须先于 uniform：只有一个间隙时"齐次"恒成立，否则 `gap:178` 这种荒谬值会被当正常间距下发。
  if (fewChildren && singleHugeGap) {
    return mark({ ...base, mode: `${dir}-between` });
  }
  if (!uniform && fewChildren && edgesFlush) {
    return mark({ ...base, mode: `${dir}-between` });
  }
  if (uniform) {
    return mark({ ...base, mode: dir, gap: Math.max(0, gapMin) });
  }
  return mark({ ...base, mode: dir === 'column' ? 'column-stack' : 'row-stack' });
}

/**
 * 遍历整棵树，产出「容器 id → facts」。
 *
 * @param {object} figmaData `{ document }` 包裹或裸根节点
 * @param {object} [stats] 可选计数收集器（`evaluated / row / between / stack / overlay / unknown / modeConflict`）
 * @returns {Object<string, object>}
 */
export function inferLayoutFacts(figmaData, stats = null) {
  const root = figmaData?.document ?? figmaData;
  const facts = {};
  const bump = (k) => {
    if (stats && typeof stats === 'object') stats[k] = (Number(stats[k]) || 0) + 1;
  };
  if (!root || typeof root !== 'object') return facts;
  if (stats && typeof stats === 'object') {
    for (const k of [
      'evaluated',
      'row',
      'between',
      'stack',
      'overlay',
      'unknown',
      'modeConflict',
      // 🛡️ R3-2：AL 声明侧可观测面（0 也打）
      'alDeclared',
      'alAgree',
      'alInvalid',
      'absoluteSkipped',
    ]) {
      if (!Number.isFinite(Number(stats[k]))) stats[k] = 0;
    }
  }

  const walk = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 60) return;
    const id = node.id != null ? String(node.id) : '';
    if (id && Array.isArray(node.children) && node.children.length >= 2) {
      const f = inferLayoutFactsForContainer(node);
      facts[id] = f;
      bump('evaluated');
      if (f.mode === 'row' || f.mode === 'column') bump('row');
      else if (f.mode === 'row-between' || f.mode === 'column-between') bump('between');
      else if (f.mode === 'column-stack' || f.mode === 'row-stack') bump('stack');
      else if (f.mode === 'free-overlay') bump('overlay');
      else bump('unknown');
      if (f.modeConflict) bump('modeConflict');
      // 🛡️ R3-2：声明侧计数（与冲突计数正交：declared=agree+conflict+无法对账）
      if (f.alDeclared) bump('alDeclared');
      if (f.alAgree) bump('alAgree');
      if (f.alInvalid) bump('alInvalid');
      if (f.absoluteSkipped) bump('absoluteSkipped', f.absoluteSkipped);
    }
    for (const c of node.children || []) walk(c, depth + 1);
  };
  walk(root);
  return facts;
}

/**
 * 段/容器取 facts 的统一入口（下游只读）。
 * @param {object} facts inferLayoutFacts 的产物
 * @param {string[]} candidateIds 依次尝试（figmaNodeId → id → sourceNodeIds）
 */
export function pickLayoutFacts(facts, candidateIds) {
  if (!facts) return null;
  for (const id of candidateIds || []) {
    if (id == null || id === '') continue;
    const hit = facts[String(id)];
    if (hit && hit.mode && hit.mode !== 'unknown') return hit;
  }
  return null;
}

/**
 * 🛡️ S2（2026-11-15 · 用户指令「方向对账拦截」）：用 bbox 几何真值纠正 vision 记录的
 * section 级排列方向误判。
 *
 * ## 背景（实锤）
 * 视觉分析阶段会把每个 section 的 `layout` 记为 `horizontal` / `vertical`，但实测常把
 * 「标题在上、内容在下」的纵向 section 误记为 `horizontal`（如本仓 `c-traffic-monitor-cc0eddc6`
 * 的「当日总流量」`2:3660` 被记成 horizontal，而 bbox 真值是 `free-overlay` ⇒ 实际应为 vertical）。
 * 该 `layout` 字段直接进 engineer prompt，LLM 据此在 LESS 写 `flex-direction: row; justify-content:
 * space-between`，把标题与统计卡挤到同一行（混排 bug）。inline code-generator 走另一条 bbox 通道
 * （`deriveChildLayout` 读 `flexDirection`，free-overlay ⇒ null 不内联），与 prompt 不一致。
 *
 * ## 口径（与 `deriveChildLayout` 对齐）
 *   mode 体系 → 方向：
 *     row / row-between / row-stack           → horizontal
 *     column / column-between / column-stack  → vertical
 *     free-overlay / unknown                  → null（bbox 无法判定）
 *
 * ## 作用域（严格收窄，防过度纠正）
 *   仅当 vision 记录 `layout === 'horizontal'` **且** 该 section 有 header 语义
 *   （`headerRelation` 非空，覆盖 title-same-row / content-below-title / title-itself）时才介入：
 *     - bbox 判为 row*     → 与 vision 一致，保留 horizontal（不误伤合法横排）；
 *     - bbox 判为 column* / free-overlay / unknown → 覆盖为 `vertical`
 *       （header-above-body 是 section 的安全默认；且与 inline 生成器不写 horizontal 的口径一致），
 *       并顺带把 `headerRelation: title-same-row` 纠正为 `content-below-title`。
 *   vision 记录 `vertical` 的 section 一律不动（避免过度纠正、误把合法纵向翻成横排）。
 *
 * 纯函数：原地修正 `layoutStructure.layout.sections[].layout` / `.headerRelation`，
 * 并在 `layoutStructure.layoutFactsAudit` 追加一条可 grep 的审计记录。
 *
 * @param {object} layoutStructure vision 产出的 layoutStructure（需含 `.layout.sections` 与 `.layoutFacts`）
 * @returns {{checked:number, overridden:number, overrides:Array}}
 */
export function reconcileSectionLayoutWithFacts(layoutStructure) {
  const result = { checked: 0, overridden: 0, overrides: [] };
  if (!layoutStructure || typeof layoutStructure !== 'object') return result;
  const facts = layoutStructure.layoutFacts;
  if (!facts) return result;
  const sections = layoutStructure.layout?.sections;
  if (!Array.isArray(sections)) return result;

  // mode → 方向（与 deriveChildLayout 的 flexDirection 口径一致）
  const modeToDirection = (mode) => {
    if (!mode || mode === 'unknown') return null;
    if (mode.startsWith('row')) return 'horizontal';
    if (mode.startsWith('column')) return 'vertical';
    return null; // free-overlay 等
  };

  for (const sec of sections) {
    if (!sec || typeof sec !== 'object') continue;
    // 收窄：仅纠正 vision 误记为 horizontal 且有 header 语义的 section
    if (sec.layout !== 'horizontal') continue;
    if (!sec.headerRelation) continue;
    result.checked += 1;

    const fact = pickLayoutFacts(facts, [sec.id, sec.figmaNodeId, ...(sec.sourceNodeIds || [])]);
    const bboxDir = fact ? modeToDirection(fact.mode) : null;

    // bbox 确认是横排 → 与 vision 一致，保留
    if (bboxDir === 'horizontal') continue;

    // bbox 与 horizontal 矛盾（column / free-overlay / unknown）⇒ 覆盖为 vertical
    const from = sec.layout;
    sec.layout = 'vertical';
    if (sec.headerRelation === 'title-same-row') {
      sec.headerRelation = 'content-below-title';
    }
    result.overridden += 1;
    result.overrides.push({
      id: sec.id,
      name: sec.name,
      from,
      to: sec.layout,
      bboxMode: fact?.mode || 'unknown',
      headerRelation: sec.headerRelation,
    });
  }

  if (result.overridden > 0) {
    if (!Array.isArray(layoutStructure.layoutFactsAudit)) layoutStructure.layoutFactsAudit = [];
    layoutStructure.layoutFactsAudit.push({
      kind: 'section-layout-reconcile',
      checked: result.checked,
      overridden: result.overridden,
      overrides: result.overrides,
    });
  }
  return result;
}
