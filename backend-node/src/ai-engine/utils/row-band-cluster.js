/**
 * 🛡️ 刀 12（2026-10-27 · mc-max-1793096891762-ad8939a5 `801:3` 实锤）：2D 行簇重建。
 *
 * ## 病灶
 * 垂直容器分支把**所有**子段按高度比例纵切。真值是 2D 复合结构时全毁：
 * `801:3`（设备头部 547×493，GROUP 无 layoutMode）真值 =
 *   「左图 98×98 ｜ 右侧（标题 / 编码行+pill）」带 → 参数网格 → 产品描述，
 * 产物把 img / 标题 / pill / 编码行 / 网格 / 描述**七段纵排**（img 被拉通栏、
 * pill 被拉成 100% 宽条）。几何判据 `decideGeometricLayout` 判 column(high) 本身没错
 * （顶层确实是纵流），错在**纵流内部的横向带没有被表达**。
 *
 * ## 判据（纯几何 + 命名无关，XY-cut 递归）
 *   ① y 聚带：子项按 y 排序，`item.y <= 带底 + 1` 归同带（与 section-tree 孤儿文本
 *      分带同一容差口径）；<2 带 ⇒ 无 2D 结构 ⇒ null（零行为变化）。
 *   ② 每带内 x 聚组：按 x 排序，`item.x <= 组右 + 1` 归同组；≥2 组 ⇒ 该带是横向行
 *      （row），组内 >1 项 ⇒ 交替换轴递归（行里的组再按 y 切列）。
 *   ③ 两轴都切不动（x 交叠且 y 交叠）⇒ stacked 兜底：保持 y 序纵排（= 现状，不臆造）。
 *   ④ 顶层必须 ≥2 带 ∧ 至少一个带成行，否则整体 null（纯纵流走既有比例路径）。
 *
 * fail-open：任一 box 缺失/非法 ⇒ null；深度封顶 6。
 *
 * 纯函数、无 import.meta、不修改入参。渲染侧唯一消费者：
 * `code-generator.js#buildDeterministicIndexTemplate` 垂直容器分支。
 *
 * @param {Array<{ref:any, box:{x:number,y:number,w:number,h:number}}>} entries
 * @returns {null | BandNode}
 *   BandNode = { direction:'column'|'row', box, children:BandNode[] }（组）
 *            | { ref, box }（叶，ref 为原 entries[i].ref）
 */
const TOL = 1; // 与 section-tree 孤儿分带同一容差（px）
const MAX_DEPTH = 6;

function isValidBox(b) {
  return (
    b &&
    Number.isFinite(b.x) && Number.isFinite(b.y) &&
    Number.isFinite(b.w) && Number.isFinite(b.h) &&
    b.w > 0 && b.h > 0
  );
}

function unionBox(nodes) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of nodes) {
    const b = n.box;
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** y 聚带：按 top 排序，与当前带底边相交（含 1px 容差）即同带 */
function clusterY(items) {
  const sorted = [...items].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const bands = [];
  for (const it of sorted) {
    const band = bands[bands.length - 1];
    const bottom = band ? Math.max(...band.map((m) => m.box.y + m.box.h)) : -Infinity;
    if (band && it.box.y <= bottom + TOL) band.push(it);
    else bands.push([it]);
  }
  return bands;
}

/** x 聚组：按 left 排序，与当前组右边相交（含 1px 容差）即同组 */
function clusterX(items) {
  const sorted = [...items].sort((a, b) => a.box.x - b.box.x || a.box.y - b.box.y);
  const groups = [];
  for (const it of sorted) {
    const group = groups[groups.length - 1];
    const right = group ? Math.max(...group.map((m) => m.box.x + m.box.w)) : -Infinity;
    if (group && it.box.x <= right + TOL) group.push(it);
    else groups.push([it]);
  }
  return groups;
}

function leaf(it) {
  return { ref: it.ref, box: it.box };
}

function group(direction, children) {
  return { direction, box: unionBox(children), children };
}

/**
 * @param {Array} items [{ref, box}]
 * @param {'row'|'column'} prefer 本层优先切轴（交替递归）
 * @returns {{node: object, rowed: boolean}} rowed=本层是否切出了横向行
 */
function buildNode(items, prefer, depth) {
  if (items.length === 1) return { node: leaf(items[0]), rowed: false };
  if (depth >= MAX_DEPTH) {
    // 深度兜底：纵排叶序（= 现状行为）
    return { node: group('column', items.map(leaf)), rowed: false };
  }
  const tryCut = (axis) => {
    const clusters = axis === 'row' ? clusterX(items) : clusterY(items);
    if (clusters.length < 2) return null;
    const children = clusters.map((c) =>
      c.length === 1 ? leaf(c[0]) : buildNode(c, axis === 'row' ? 'column' : 'row', depth + 1).node,
    );
    return group(axis, children);
  };
  const first = tryCut(prefer);
  if (first) return { node: first, rowed: prefer === 'row' };
  const second = tryCut(prefer === 'row' ? 'column' : 'row');
  if (second) return { node: second, rowed: prefer !== 'row' };
  // 两轴都切不动（真交叠，如 merged 孤儿段与 pill 互穿）⇒ stacked 兜底纵排
  return { node: group('column', items.map(leaf)), rowed: false };
}

export function planRowBands(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length < 3) return null; // <3 子项不可能「既有纵流又有横带」
  if (!list.every((e) => isValidBox(e && e.box))) return null; // fail-open
  const items = list.map((e, i) => ({ ref: e.ref, box: e.box, i }));
  const bands = clusterY(items);
  if (bands.length < 2) return null; // 单带 = 纯横行，属 horizontal 分支管辖
  if (bands.every((b) => b.length === 1)) return null; // 纯纵流 = 现状
  let rowed = 0;
  const children = bands.map((band) => {
    if (band.length === 1) return leaf(band[0]);
    const r = buildNode(band, 'row', 1);
    if (r.rowed) rowed += 1;
    return r.node;
  });
  if (rowed === 0) return null; // 没有任何带成行 ⇒ 不动
  return group('column', children);
}
