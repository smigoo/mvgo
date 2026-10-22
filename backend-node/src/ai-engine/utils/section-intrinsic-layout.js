/**
 * 刀 50 —— 段内固有几何契约（intrinsic layout contract）
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━ 病灶 ━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 三个面板段（38:3137 / 38:3162 / 38:3206）在 Figma 里**结构完全同构**：
 *   上留白 25 / 左留白 20 / header 16 / header→行1 = 16 / 行 30 / 行距 20 / 下留白(剩余)
 * 只有行数不同（2 / 3 / 4 行 ⇒ 段高 161 / 212 / 265）。
 *
 * 产物的做法是「父容器把**整个段高**按子项 Figma 高度比例 `flex:h/Σh` 分给子项」——
 * 这在数学上等价于「子项**按比例拉伸**填满容器」，于是：
 *   · 段的 padding（上留白 25 / 左留白 20）**没人表达**，被摊进子项比例里；
 *   · 段的子项间距（16 / 20）**没人表达**，同样被摊掉；
 *   · 剩余空间（下留白 24/25/28）被当成可分配空间，子项一起被拉高。
 * 实测（真实预览 DOM）：header 高 36 / 77 / 97（真值 41 = 25+16），
 * list 高 63.6 / 138.2 / 172.8（真值 30 / 130 / 180）⇒ 三段互不相同、都不还原。
 *
 * 根因不是「比例算错」，而是**段内几何没有任何人负责**：比例分配只能表达「谁占多少份」，
 * 表达不了「固定高度 + 固定间距 + 固定 padding + 剩余留白」。
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━ 判据 ━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 纯几何、命名无关，全部真值来自 Figma bbox：
 *   ① 父 box 与**每个**子 box 都能解析（子 box = 自身 bbox，缺则 sourceNodeIds **并集**）
 *   ② 父方向为 column（显式 `sec.layout === 'vertical'`，与装配层写 `display:flex` 的判据同源；
 *      grid 归刀 41，row 不在本契约域内）
 *   ③ 子项沿主轴**严格顺序堆叠**（后项起点 ≥ 前项终点 − 1px 容差），否则不判
 *   ④ 每个间距 ≥ 0（负值 = 重叠，语义不明 ⇒ 不判）
 *   ⑤ `paddingTop + Σ子高 + Σ间距 ≤ 父高 + 1px`（超了说明真值自相矛盾 / 内容溢出 ⇒ 不判）
 * 任一不满足 ⇒ `ok:false` + reason，**调用方保持既有 flex 比例行为**（fail-open，绝不臆造）。
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━ 输出形态 ━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 容器：`padding-top:15px` 之类（只写 >0 的；真值 0 不写，避免与 class 规则打架）
 * 子项：`flex:0 1 auto;height:20px;` + `margin-top:10px;`（第 1 项无 margin）
 *   · `flex:0 1 auto` = 不伸不长（剩余空间留在底部 = 下留白）、**允许收缩**
 *     ⇒ 容器比真值小时按真值等比压缩，而不是溢出破版；
 *   · 用 `margin-top` 而非容器 `gap`：间距真值可以**不等**（本例 16 然后 20）。
 *
 * 🔴 与刀 28（`normalizeSectionFlexTruth`）不重叠：刀 28 只处理「同一父下 v-for 段 + 固定段」
 *   这类等分臆造，且只认 `data-section-id` 的 div；本契约处理的是**段 → 子组件标签**的比例拉伸。
 *
 * @module utils/section-intrinsic-layout
 */

import { getFigmaBox } from './section-tree.js';

/** Figma 小数坐标 / 1px 舍入容差 */
const EPS = 1;

/**
 * 原始 box 归一（形态适配，**不是**第二条判据）。
 *
 * 🔴 两个必须容忍的现实形态：
 *   ① `{ absoluteBoundingBox | bbox: {x,y,width,height} }`（Figma 原始节点 / 索引记录）
 *   ② `{ x, y, w, h }`（已归一 primitive）
 * `section-tree#getFigmaBox` 只吃这两种，**不接受**裸 `{x,y,width,height}`
 * （实测 2026-10-22：`getFigmaBox({x,y,width,height})` 返回 null —— 第二分支读的是 `.w/.h`）。
 *
 * 🔴 更关键：planner 的 plan 节点常只带**尺寸不带原点**（`{ width: 46, height: 317 }`），
 *   而 `getFigmaBox` 要求四元齐全 ⇒ 会整块返回 null。这正是既有用例
 *   `code-generator.deterministic-template.spec.ts`（tabs 46 / cons 367）2026-10-22 被本刀打红的真因。
 *   因此分两档：
 *     · `allowPartial=false`（判**几何**：间距 / padding 必须有原点）⇒ 缺原点即 null
 *     · `allowPartial=true`（只判**尺寸**）⇒ 原点补 0，仅取 w/h
 * 裁决仍在 `getFigmaBox` 一处，这里只补「缺原点」这档。
 */
function toBox(src, allowPartial) {
  if (!src || typeof src !== 'object') return null;
  const rawW = src.width ?? src.w;
  const rawH = src.height ?? src.h;
  const complete =
    Number.isFinite(Number(src.x)) &&
    Number.isFinite(Number(src.y)) &&
    Number.isFinite(Number(rawW)) &&
    Number.isFinite(Number(rawH));
  if (complete) {
    return Number.isFinite(Number(src.width))
      ? getFigmaBox({ absoluteBoundingBox: src })
      : getFigmaBox(src);
  }
  if (!allowPartial) return null;
  const w = Number(rawW);
  const h = Number(rawH);
  if (!(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0)) return null;
  return { x: 0, y: 0, w, h };
}

/** 索引记录 → 归一 box（兼容 `{bbox}` / `{rawNode}` 两种形态） */
function boxOfIndexEntry(entry, allowPartial) {
  if (!entry || typeof entry !== 'object') return null;
  return (
    toBox(entry.bbox, allowPartial) ||
    toBox(entry.rawNode?.absoluteBoundingBox, allowPartial)
  );
}

/**
 * 候选 box 收集（**唯一**优先级链，`resolveSectionBox` / `resolveSectionSize` 共用）。
 * 顺序：① 树上自带 → ② figmaNodeId / id 精确 → ③ sourceNodeIds（并集）
 */
function collectBoxCandidates(sec, figmaIndex, allowPartial) {
  const out = { own: null, exact: null, sources: [] };
  if (!sec || typeof sec !== 'object') return out;

  out.own = toBox(sec.absoluteBoundingBox, allowPartial) || toBox(sec.bbox, allowPartial);

  if (!figmaIndex || typeof figmaIndex.get !== 'function') return out;

  for (const key of [sec.figmaNodeId, sec.id]) {
    if (!key) continue;
    const hit = boxOfIndexEntry(figmaIndex.get(String(key)), allowPartial);
    if (hit) {
      out.exact = hit;
      break;
    }
  }

  const ids = Array.isArray(sec.sourceNodeIds) ? sec.sourceNodeIds : [];
  for (const raw of ids) {
    const hit = boxOfIndexEntry(figmaIndex.get(String(raw)), allowPartial);
    if (hit) out.sources.push(hit);
  }
  return out;
}

function resolveBoxInternal(sec, figmaIndex, allowPartial) {
  const c = collectBoxCandidates(sec, figmaIndex, allowPartial);
  if (c.own) return c.own;
  if (c.exact) return c.exact;
  if (c.sources.length > 0) return unionBoxes(c.sources);
  return null;
}

/** 多个 box 的并集（任一缺失则忽略；空集返回 null） */
export function unionBoxes(boxes) {
  const list = (Array.isArray(boxes) ? boxes : []).filter(
    (b) => b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h),
  );
  if (list.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of list) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  if (!(x2 > x1) || !(y2 > y1)) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * 解析段节点的几何 box（**唯一实现**，`resolveSectionFlexSize` 已收敛到此处）。
 *
 * 顺序：
 *   ① 树上自带 bbox（planner 保留尺寸时的快路径）
 *   ② 按 figmaNodeId / id 精确回查
 *   ③ 按 sourceNodeIds **并集**回查 —— 合成节点（`38:3167-list` / 拆列 `287:5-left`）落在此分支；
 *      并集才能得到**整段**尺寸（首个命中只拿到首行/首列的尺寸，是 2026-10-22 实锤的错源）
 *   ④ 子树最上节点兜底（`figmaSectionBox` 同源口径由调用方提供）
 *
 * @param {Object} sec 段节点
 * @param {Map} figmaIndex `indexFigmaNodes(figmaRoot)` 产物（可为 null）
 * @returns {{x:number,y:number,w:number,h:number}|null}
 */
export function resolveSectionBox(sec, figmaIndex) {
  return resolveBoxInternal(sec, figmaIndex, false);
}

/**
 * 段在某一维上的尺寸（**单一实现**，`code-generator#resolveSectionFlexSize` 已收敛到此处）。
 *
 * 与 `resolveSectionBox` 同一条优先级链，唯一差别：允许「只有尺寸、没有原点」的 plan 节点
 * （planner 常见形态）。`sourceNodeIds` 多个候选取**并集**后取该维 —— 合成段
 * （`38:3167-list` 三行 / `287:5-left` 整列）才能拿到整段尺寸，首个命中只拿到首行/首列。
 *
 * @param {Object} sec 段节点
 * @param {Map} figmaIndex `indexFigmaNodes(figmaRoot)` 产物
 * @param {'width'|'height'} axis
 * @returns {number} 该维尺寸（px）；无法确定时为 0
 */
export function resolveSectionSize(sec, figmaIndex, axis = 'width') {
  const box = resolveBoxInternal(sec, figmaIndex, true);
  if (!box) return 0;
  const v = axis === 'height' ? box.h : box.w;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * 垂直堆叠几何裁决（**唯一实现**）：`resolveIntrinsicLayout`（段内，生成期/plan 层）
 * 与刀 52 `section-stack-contract`（父容器，写盘期/DOM 层）共用同一份判据。
 *
 * 为什么要单独抽出来（2026-10-22 真机实锤 `796:3`）：
 *   父容器 `796:3` 的 5 个子项是「两张统计卡**同 y 并列** + 三个厂商段纵向排列」。
 *   旧判据按「逐项严格堆叠」比 ⇒ 并列的两个卡 gap = −76 ⇒ 判 `overlap` ⇒ **整段 fail-open**，
 *   于是父容器仍然按 `flex:比例` 分，三段高度被摊成 179/227/278（真值 161/212/265）。
 *   并列不是重叠：顶边对齐（±1px）即「同一行 = 一个高度单元」，单元高度取成员最大值。
 *
 * 判据（纯几何）：
 *   ① 父 box 与每个子 box 都能解析
 *   ② y 分桶：顶边对齐 ±{@link EPS} 归为同一单元（并列行组）
 *   ③ 单元之间**严格顺序堆叠**，间距 ≥ 0（负值 = 重叠，语义不明）
 *   ④ 首单元顶边不得在父顶之上、最左不得在父左之外
 *   ⑤ `paddingTop + Σ单元高 + Σ间距 ≤ 父高 + EPS`（超了 = 真值自相矛盾 / 内容溢出）
 *
 * @param {{x:number,y:number,w:number,h:number}|null} parentBox
 * @param {Array<{x:number,y:number,w:number,h:number}|null>} childBoxes
 * @returns {{
 *   ok:boolean, reason?:string,
 *   paddingTop?:number, paddingLeft?:number, leftover?:number,
 *   units?: Array<{height:number, gapBefore:number, bottom:number, members:number[]}>
 * }}
 */
export function resolveStackGeometry(parentBox, childBoxes) {
  if (!parentBox || !Number.isFinite(parentBox.h)) return { ok: false, reason: 'parent-box-unknown' };
  const kids = Array.isArray(childBoxes) ? childBoxes : [];
  if (kids.length < 2) return { ok: false, reason: 'too-few-children' };
  if (kids.some((b) => !b)) return { ok: false, reason: 'child-box-unknown' };

  // ② y 分桶（先按 y、再按 x 排序，保证并列成员顺序稳定）
  const order = kids
    .map((b, i) => ({ b, i }))
    .sort((p, q) => (p.b.y - q.b.y) || (p.b.x - q.b.x));
  const buckets = [];
  for (const { b, i } of order) {
    const last = buckets[buckets.length - 1];
    if (last && Math.abs(b.y - last.y) <= EPS) {
      last.members.push(i);
      last.boxes.push(b);
    } else {
      buckets.push({ y: b.y, members: [i], boxes: [b] });
    }
  }

  // ③ 单元高度 = 成员最大值；单元间严格堆叠
  const units = [];
  for (let k = 0; k < buckets.length; k++) {
    const g = buckets[k];
    const height = Math.round(Math.max(...g.boxes.map((b) => b.h)));
    const bottom = Math.max(...g.boxes.map((b) => b.y + b.h));
    if (k === 0) {
      units.push({ height, gapBefore: 0, bottom, members: g.members });
      continue;
    }
    const gap = g.y - units[k - 1].bottom;
    if (gap < -EPS) return { ok: false, reason: 'overlap' };
    units.push({ height, gapBefore: Math.max(0, Math.round(gap)), bottom, members: g.members });
  }

  // ④ 首单元相对父容器的内边距
  const top = Math.min(...kids.map((b) => b.y));
  const left = Math.min(...kids.map((b) => b.x));
  const paddingTop = Math.round(top - parentBox.y);
  const paddingLeft = Math.round(left - parentBox.x);
  if (paddingTop < -EPS || paddingLeft < -EPS) return { ok: false, reason: 'child-outside-parent' };

  // ⑤ 不溢出父高
  const contentBottom = Math.round(Math.max(...units.map((u) => u.bottom)) - parentBox.y);
  const leftover = Math.round(parentBox.h) - contentBottom;
  if (leftover < -EPS) return { ok: false, reason: 'content-overflow' };

  return {
    ok: true,
    paddingTop: Math.max(0, paddingTop),
    paddingLeft: Math.max(0, paddingLeft),
    leftover,
    units,
  };
}

/**
 * 解析「段内固有几何」计划（检测与自愈共用同一判据）。
 *
 * @param {Object} sec 段节点（容器）
 * @param {Map} figmaIndex `indexFigmaNodes(figmaRoot)` 产物
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   axis?: 'column',
 *   sectionId?: string,
 *   paddingTop?: number,
 *   paddingLeft?: number,
 *   leftover?: number,
 *   children?: Array<{height:number, gapBefore:number}>
 * }}
 */
export function resolveIntrinsicLayout(sec, figmaIndex) {
  if (!sec || typeof sec !== 'object') return { ok: false, reason: 'no-section' };

  // ② 方向：只认显式 `vertical`（与装配层 `displayStyle` 同一判据来源）。
  //    `grid` 归刀 41（`grid-list-layout-contract`）——两套判据同时改写会互相覆盖。
  const rawLayout = String(sec.layout ?? '').toLowerCase();
  if (rawLayout === 'grid') return { ok: false, reason: 'grid-axis' };
  if (rawLayout !== 'vertical') return { ok: false, reason: 'axis-not-column' };

  const kids = Array.isArray(sec.children) ? sec.children : [];
  if (kids.length < 2) return { ok: false, reason: 'too-few-children' };

  const pbox = resolveSectionBox(sec, figmaIndex);
  if (!pbox) return { ok: false, reason: 'parent-box-unknown' };

  const cboxes = kids.map((k) => resolveSectionBox(k, figmaIndex));
  const geo = resolveStackGeometry(pbox, cboxes);
  if (!geo.ok) return { ok: false, reason: geo.reason };

  // 🔴 本函数只表达「段内一维序列」：出现并列行组（同一行 2 个以上子项）时，
  //    plan 层无法把「一个高度单元」映射回单个子项标签 ⇒ 保持 fail-open，
  //    交给刀 52（写盘期 DOM 层，此时 rowpeers 包裹层已经存在）。
  if (geo.units.some((u) => u.members.length > 1)) return { ok: false, reason: 'row-peers' };

  return {
    ok: true,
    axis: 'column',
    sectionId: String(sec.id || ''),
    paddingTop: geo.paddingTop,
    paddingLeft: geo.paddingLeft,
    leftover: geo.leftover,
    children: geo.units.map((u) => ({ height: u.height, gapBefore: u.gapBefore })),
  };
}

/** 容器侧 padding 声明（真值 0 不写 ⇒ 不覆盖 class 上的合法 padding 语义） */
export function buildIntrinsicContainerStyle(plan) {
  if (!plan || !plan.ok) return '';
  let s = '';
  if (plan.paddingTop > 0) s += `padding-top:${plan.paddingTop}px;`;
  if (plan.paddingLeft > 0) s += `padding-left:${plan.paddingLeft}px;`;
  return s;
}

/** 第 i 个子项的内联 style（`flex:0 1 auto` = 不拉伸 + 可压缩；剩余空间留作下留白） */
export function buildIntrinsicChildStyle(plan, index) {
  if (!plan || !plan.ok) return '';
  const c = (plan.children || [])[index];
  if (!c) return '';
  let s = `flex:0 1 auto;height:${c.height}px;`;
  if (c.gapBefore > 0) s += `margin-top:${c.gapBefore}px;`;
  return s;
}

export default resolveIntrinsicLayout;
