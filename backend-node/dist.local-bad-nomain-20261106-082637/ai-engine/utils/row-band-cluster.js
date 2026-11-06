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

/**
 * 🛡️ 刀 17a（2026-10-28 · 6bba7218 `38:3260` 实锤）：planRowBands 的对称入口——
 * **横排容器内含纵排组**（icon ｜ 纵排文本块「标题上+数字下」）。
 *
 * 病灶：刀 12 只评 vertical 容器（y 聚带先行）。`38:3260`（统计卡组 265×76，GROUP）
 * 被 R23 复算为 horizontal ⇒ 不评估 ⇒ icon/标题/数字 三叶子被平铺横排
 * （标题与数字本应上下纵排、与 icon 横向并列）。真值 2D 结构：
 *   x 聚组 ⇒ icon(26920–26973) ｜ 文本块(26997–27061.7) 两组；
 *   文本块内 y 聚带 ⇒ 标题(51496–51520) ｜ 数字(51521.9–51549.9) 两带成列。
 *
 * 判据与 planRowBands 完全对称（同 TOL、同 buildNode 换轴递归、同 fail-open）：
 *   ① x 聚组先行；<2 组 ⇒ 纯纵列，属 vertical 分支管辖 ⇒ null；
 *   ② 全组单元素 ⇒ 纯横行 = horizontal 既有现状 ⇒ null；
 *   ③ 至少一组内部 y 切出 ≥2 带（成列）⇒ 命中；否则 null（零行为变化）。
 *
 * @param {Array<{ref:any, box:{x:number,y:number,w:number,h:number}}>} entries
 * @returns {null | BandNode} 根 direction='row'
 */
export function planColumnGroups(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length < 3) return null;
  if (!list.every((e) => isValidBox(e && e.box))) return null;
  const items = list.map((e, i) => ({ ref: e.ref, box: e.box, i }));
  const groups = clusterX(items);
  if (groups.length < 2) return null; // 单组 = 纯纵列
  if (groups.every((g) => g.length === 1)) return null; // 纯横行 = 现状
  let columned = 0;
  const children = groups.map((g) => {
    if (g.length === 1) return leaf(g[0]);
    // 组内先行 y 切；buildNode prefer='column'（切不出会自行换轴/兜底）
    if (clusterY(g).length >= 2) columned += 1;
    return buildNode(g, 'column', 1).node;
  });
  if (columned === 0) return null; // 没有任何组成列 ⇒ 不动
  return group('row', children);
}

/**
 * 🛡️ 刀 17b（2026-10-28 · 6bba7218 实锤）：横向容器交叉轴居中判据。
 *
 * 病灶：横排组（统计卡）产物 `align-items:stretch` 顶对齐，真值内容块
 * （icon 中心 51523.7 / 文本块中心 51523）相对带中心（51521）偏移 ≤3px = **垂直居中**。
 * GROUP 无 Auto Layout 属性 ⇒ 只能纯几何推导：全部直接子项中心相对容器中心偏移小
 * 且内容高度明显小于容器（有留白可居）⇒ 交叉轴 center。
 *
 * 判据（命名无关、fail-open ''）：
 *   ① 容器 box 与全部子项 box 合法；
 *   ② 每个子项 |中心偏移| ≤ max(4px, 容器高 × 8%)；
 *   ③ 每个子项高 < 容器高 × 92%（≈ 填满时 stretch 与 center 等效，不加 = 零行为变化）。
 *
 * @param {Array<{x,y,w,h}>} childBoxes
 * @param {{x,y,w,h}} containerBox
 * @param {boolean} [self] true ⇒ 出 `align-self`（落单个子项）；false ⇒ `align-items`（落容器）
 * @returns {string} 'align-items:center;' / 'align-self:center;' 或 ''
 */
export function crossAxisCenterStyle(childBoxes, containerBox, self = false) {
  if (!isValidBox(containerBox)) return '';
  const list = Array.isArray(childBoxes) ? childBoxes : [];
  if (list.length === 0 || !list.every(isValidBox)) return '';
  const cCenter = containerBox.y + containerBox.h / 2;
  const tol = Math.max(4, containerBox.h * 0.08);
  for (const b of list) {
    if (Math.abs(b.y + b.h / 2 - cCenter) > tol) return '';
    if (b.h >= containerBox.h * 0.92) return '';
  }
  return self ? 'align-self:center;' : 'align-items:center;';
}
