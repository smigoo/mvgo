/**
 * 重复同构 section 折叠为 list/grid + v-for（2026-09-10；2026-09-20 递归化+几何签名治本）
 *
 * 事故：device 监测 vision 把 12 张同构卡片 + 12 个装饰 Group 拍扁成顶层
 * sections → planner 强制拆 41 个子组件 → COMP-001 按实例点名 → DeviceCard1..N。
 * 正确产物：1 个 item 模板 + v-for，COMP-001 按模板计数。
 *
 * 🛡️ 2026-09-20 治本（mc-max-1789871432610 / mc-1789869245851 实锤）：
 *   E1 之后 sections 是嵌套树，重复项几乎都在容器 children 里；旧实现只扫顶层数组
 *   → 折叠能力对嵌套结构静默失效（图例 8 项在 slot-con 内、三卡在横向容器内均未折叠）。
 *   治本三件套：
 *   ① 递归化：collapseSectionsDeep 自底向上（先深层后浅层）对每层兄弟数组执行折叠；
 *   ② 几何同构签名：归一化名不同（Figma 命名 1/2/3）时，几何+结构同构也算重复
 *      （等宽高 ±3px + 同行 y ±4px + 逐子形状同构）；
 *   ③ items 数据增强：折叠产物 items[] 每项自带深层文本/颜色/bg/icon（供 v-for prompt
 *      确定性注入，消灭 LLM 手工 iconMap 对位骰子）。
 */

function getChildren(sec) {
  if (!sec || typeof sec !== 'object') return [];
  const list =
    sec.body?.children ||
    sec.body?.elements ||
    sec.children ||
    sec.elements;
  return Array.isArray(list) ? list : [];
}

/**
 * Group 1321317970 / Frame 2136638825 / 2:8438 → 结构名，去掉实例编号。
 */
export function normalizeRepeatName(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  if (/^\d+:\d+$/.test(s)) return 'figma-node';
  const m = s.match(/^([A-Za-z\u4e00-\u9fff]+)[\s_-]+\d+$/);
  if (m) return m[1].toLowerCase();
  return s.toLowerCase();
}

function childShape(child) {
  const kids = getChildren(child);
  return `${String(child?.role || '')}:${String(child?.type || '')}:${kids.length}`;
}

export function sectionRepeatSignature(sec) {
  const kids = getChildren(sec);
  const name = normalizeRepeatName(sec?.name || '');
  return `${name}|${kids.length}|${kids.map(childShape).join(',')}`;
}

/**
 * 🛡️ ② 几何同构签名（2026-09-20）：名不同但「等宽高 + 同行 + 逐子形状同构」→ 同签名。
 * 用于 Figma 命名 1/2/3 的同构卡（三卡案例：140×74 / 120×74 / 141×74，宽差 ≤3px 容差内）。
 * box 来源：figmaBox（E1）或 absoluteBoundingBox（vision）。
 */
function geoBox(sec) {
  if (!sec || typeof sec !== 'object') return null;
  const b = sec.figmaBox || sec.absoluteBoundingBox || sec.body?.box || null;
  if (!b || typeof b !== 'object') return null;
  const w = Number(b.width) || 0;
  const h = Number(b.height) || 0;
  const x = Number(b.x) || 0;
  const y = Number(b.y) || 0;
  if (!w || !h) return null;
  return { w, h, x, y };
}

/**
 * 🛡️ 结构指纹（2026-09-20 三版）：用**语义槽位**判断同构，不用 childCount。
 *   实证（三卡 mc-1789867417147）：childCount 序列 2,2,1,2 / 2,0,1,2 / 2,2,2,2 各不相同
 *   （icon 内部结构因资源类型而异：GROUP 图标 vs 图片填充），但**语义槽位完全一致**：
 *     bg（无文本）→ icon（无文本）→ group（含文本 label）→ group（含文本 value）
 *   故指纹 = 逐子「归一化名类别 + 是否含文本子树」，对图标内部实现差异免疫。
 */
function hasTextDeep(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return false;
  if (typeof node.text === 'string' && node.text.trim()) return true;
  for (const c of getChildren(node)) {
    if (hasTextDeep(c, depth + 1)) return true;
  }
  return false;
}

function slotFingerprint(node) {
  const name = normalizeRepeatName(node?.name || '');
  const t = hasTextDeep(node) ? 'T' : 'F';
  return `${name}:${t}`;
}

function structuralSignature(sec) {
  const kids = getChildren(sec);
  return `${kids.length}|${kids.map(slotFingerprint).join(',')}`;
}

/**
 * 🛡️ ② 几何同构判定（2026-09-20；同日二版放宽宽度容差）。
 *   判据：**高度严格相同（±3px）** + 同行（y ±4px）+ **宽度相近（相对差 ≤25% 或 ≤ 一段极小绝对差）**
 *        + 结构签名完全一致（子数 + 逐子形状 + 文本槽位数）。
 *   宽度放宽的实证：三卡设计稿 140/120/141（差 21px，相对 15%）——Figma 手绘误差，
 *   § 实际渲染按 flex 比例等分，属同一「同构卡」语义。旧 ±3px 绝对容差使三卡漏判。
 */
export function isGeoIsomorphic(a, b, tolerance = 3) {
  const ba = geoBox(a);
  const bb = geoBox(b);
  if (!ba || !bb) return false;
  if (Math.abs(ba.h - bb.h) > tolerance) return false; // 高度严格
  if (Math.abs(ba.y - bb.y) > 4) return false; // 同行
  const wDiff = Math.abs(ba.w - bb.w);
  const wBase = Math.max(ba.w, bb.w) || 1;
  if (wDiff > 24 && wDiff / wBase > 0.25) return false; // 宽度：绝对 ≤24px 或 相对 ≤25%
  return structuralSignature(a) === structuralSignature(b);
}

/**
 * ② 组合签名：同名走原签名；不同名的兄弟若与「首个候选」几何同构则并入同组。
 * 实现方式：分组时对无 box 或名字特殊的项，尝试与已有组的首项做几何同构判定。
 */
function groupSections(sections, opts = {}) {
  const minRepeat = opts.minRepeat ?? 3;
  const enableGeo = opts.enableGeo !== false;
  const sizeGate = typeof opts._sizeGate === 'function' ? opts._sizeGate : null;
  const groups = [];
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (!sec || typeof sec !== 'object') continue;
    // 🛡️ 尺寸门槛：小装饰项不参与折叠分组（递归调用方注入）
    if (sizeGate && !sizeGate(sec)) continue;
    const sig = sectionRepeatSignature(sec);
    // ① 精确签名组
    let target = groups.find((g) => g.sig === sig);
    if (target) {
      target.idxs.push(i);
      continue;
    }
    // ② 几何同构组（名字不同但形状/几何一致）
    if (enableGeo) {
      target = groups.find(
        (g) =>
          g.geo &&
          isGeoIsomorphic(sections[g.idxs[0]], sec),
      );
      if (target) {
        target.idxs.push(i);
        continue;
      }
    }
    const geo = !!geoBox(sec) && getChildren(sec).length > 0;
    groups.push({ sig, idxs: [i], geo, absorb: null });
  }
  return groups.filter((g) => g.idxs.length >= minRepeat);
}

function isInterleaved(a, b) {
  const n = a.length;
  if (n === 0 || n !== b.length) return false;
  let ab = 0;
  let ba = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] < b[i] && (i === n - 1 || b[i] < a[i + 1])) ab += 1;
    if (b[i] < a[i] && (i === n - 1 || a[i] < b[i + 1])) ba += 1;
  }
  return ab === n || ba === n;
}

/**
 * ③ 收集 item 深层确定性数据（供 v-for prompt / 数据注入消费）：
 *   texts（label/value/unit 文本真值）+ textStyles（含颜色的样式）+ resourceFiles（bg/icon 文件）。
 */
function enrichItemData(item) {
  if (!item || typeof item !== 'object') return item;
  if (item._vforData) return item;
  const texts = [];
  const textStyles = [];
  const resourceFiles = [];
  const collect = (x, d = 0) => {
    if (!x || typeof x !== 'object' || d > 8) return;
    if (typeof x.text === 'string' && x.text.trim()) {
      texts.push(x.text.trim());
      if (x.styles?.color) textStyles.push(String(x.styles.color));
    }
    for (const k of ['resourceFile', 'src']) {
      const v = x[k];
      if (typeof v === 'string' && /\.(png|svg|jpe?g)$/i.test(v)) {
        resourceFiles.push(v.split('/').pop());
      }
    }
    for (const k of ['children', 'items', 'elements', 'parts', 'icon', 'content', 'body']) {
      if (Array.isArray(x[k])) for (const c of x[k]) collect(c, d + 1);
      else if (x[k] && typeof x[k] === 'object') collect(x[k], d + 1);
    }
  };
  collect(item);
  return {
    ...item,
    _vforData: {
      texts: texts.slice(0, 8),
      textStyles: textStyles.slice(0, 8),
      resourceFiles: resourceFiles.slice(0, 6),
    },
  };
}

/**
 * 🛡️ 1a（2026-09-20 · 整改 P3）：items 按**视觉顺序**排序。
 *   实证：重点车辆三卡 Figma 2:8023 的 children 为 Z 序（x=274/166/37），
 *   折叠按原数组序取 items → vehicleList 与 UI 左右序相反。
 *   判据（几何自判定，无需父容器方向参数）：
 *     - 所有 item 的 y 在同一行（y 极差 ≤4px）→ 横排，按 x 升序；
 *     - 否则 → 纵排，先 y（同行容差 ±4px）再 x。
 *   无 box 或 box 不全 → 保持原序（不破坏 device 无 box 回归）。
 */
function sortItemsByVisualOrder(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 2) return pairs;
  const indexed = pairs.map((p, i) => ({ p, i, b: geoBox(p?.item) }));
  if (indexed.some((x) => !x.b)) return pairs; // 有缺失 box 不排序
  const ys = indexed.map((x) => x.b.y);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  if (yMax - yMin <= 4) {
    indexed.sort((a, b) => a.b.x - b.b.x);
  } else {
    indexed.sort((a, b) => {
      if (Math.abs(a.b.y - b.b.y) > 4) return a.b.y - b.b.y;
      return a.b.x - b.b.x;
    });
  }
  return indexed.map((x) => x.p);
}

/**
 * 🛡️ 1b（2026-09-20 · 整改 P8，防御项）：chart 容器豁免递归折叠。
 *   donut 的 Ellipse 子节点被递归折叠成 2:1293-list [v-for]（潜伏：产物未落 DOM，
 *   因 donut 由 ECharts 渲染），但图表内部结构是 chart-builder 的职责，
 *   折叠器不得下钻。
 */
function isChartContainer(sec) {
  if (!sec || typeof sec !== 'object') return false;
  const type = String(sec.type || '').toLowerCase();
  if (type === 'chart') return true;
  const name = String(sec.name || sec.title || '').toLowerCase();
  return /@eachrts|@echarts|chart|图表|环形图/.test(name);
}

function buildCollapsedSection(first, items, type) {
  const title = first.header?.title || first.title || first.name || first.id;
  return {
    ...first,
    id: `${first.id}-list`,
    type,
    role: type,
    collapsed: true,
    itemTemplate: first,
    items: items.map(enrichItemData),
    itemCount: items.length,
    renderHint: 'v-for',
    title: String(title || '').trim(),
  };
}

/**
 * 将 ≥minRepeat 次同构 section 收成 1 个 list/grid。
 * 两组同规模且交错出现时（卡 + 装饰），装饰并入卡片 item.deco，只留 1 个列表。
 *
 * @param {Array<object>} sections 同层兄弟数组
 * @param {{minRepeat?: number, enableGeo?: boolean}} [opts]
 * @returns {Array<object>}
 */
export function collapseRepeatedSiblingSections(sections, opts = {}) {
  const minRepeat = opts.minRepeat ?? 3;
  if (!Array.isArray(sections) || sections.length < minRepeat) return sections;

  const collapsing = groupSections(sections, opts);
  if (collapsing.length === 0) return sections;

  collapsing.sort((a, b) => a.idxs[0] - b.idxs[0]);
  const absorbed = new Set();
  for (let i = 0; i < collapsing.length; i++) {
    for (let j = i + 1; j < collapsing.length; j++) {
      const A = collapsing[i];
      const B = collapsing[j];
      if (A.idxs.length !== B.idxs.length) continue;
      if (absorbed.has(A.sig) || absorbed.has(B.sig)) continue;
      if (!isInterleaved(A.idxs, B.idxs)) continue;
      const aKids = getChildren(sections[A.idxs[0]]).length;
      const bKids = getChildren(sections[B.idxs[0]]).length;
      if (aKids >= bKids) {
        A.absorb = B;
        absorbed.add(B.sig);
      } else {
        B.absorb = A;
        absorbed.add(A.sig);
      }
    }
  }

  const skip = new Set();
  const replacements = new Map();
  for (const g of collapsing) {
    if (absorbed.has(g.sig)) {
      g.idxs.forEach((i) => skip.add(i));
      continue;
    }
    const items = g.idxs.map((idx, n) => {
      const item = sections[idx];
      if (g.absorb) {
        return { ...item, deco: sections[g.absorb.idxs[n]] };
      }
      return item;
    });
    // 🛡️ 1a：按视觉顺序排序（横排 x 升序 / 纵排 y 升序），修卡片左右序倒置
    const itemsSorted = sortItemsByVisualOrder(items.map((item) => ({ item }))).map((p) => p.item);
    g.idxs.forEach((i) => skip.add(i));
    const first = sections[g.idxs[0]];
    const type = items.length >= 6 ? 'grid' : 'list';
    replacements.set(g.idxs[0], buildCollapsedSection(first, itemsSorted, type));
  }

  const out = [];
  sections.forEach((sec, i) => {
    if (replacements.has(i)) out.push(replacements.get(i));
    else if (!skip.has(i)) out.push(sec);
  });
  return out;
}

/**
 * 🛡️ ① 递归折叠（2026-09-20 治本核心）：自底向上对每层兄弟数组执行折叠。
 *   先深层（叶子层最可能同构），后浅层（父容器看到的是已折叠的 list，不会误折叠）。
 *   幂等：collapsed section 不再参与子层折叠（其 items 已收拢）。
 *
 * @param {Array<object>} sections 任意层级的兄弟数组（根调用传根数组）
 * @param {{minRepeat?: number, enableGeo?: boolean, maxDepth?: number}} [opts]
 * @returns {Array<object>}
 */
export function isCollapsedListSection(sec) {
  if (!sec || typeof sec !== 'object') return false;
  if (sec.collapsed === true) return true;
  if (sec.renderHint === 'v-for') return true;
  const t = String(sec.type || '').toLowerCase();
  if (t === 'list' || t === 'grid') {
    return Array.isArray(sec.items) && sec.items.length > 1;
  }
  return Array.isArray(sec.items) && sec.items.length > 1;
}

export function collapseSectionsDeep(sections, opts = {}) {
  const maxDepth = opts.maxDepth ?? 8;
  if (!Array.isArray(sections)) return sections;

  // 🛡️ 收紧（二版）：业务条目尺寸门槛——宽 ≥80 且 高 ≥24。
  //   图例条目 220×32、统计卡 140×74 满足；icon 内 Rectangle（10~18px）不满足，
  //   防小装饰组被误折成 v-for（2:8071 三个 Rectangle 误折叠实锤）。
  //   ⚠️ 无几何数据（fixture / vision 未给 box）时**放行**——保持旧行为，
  //   避免把「无 box 的同构 section」全数排除（device 12 卡回归用例实锤）。
  const isBusinessItem = (sec) => {
    const b = geoBox(sec);
    if (!b) return true;
    return b.w >= 80 && b.h >= 24;
  };

  const recurse = (secs, depth) => {
    if (!Array.isArray(secs) || secs.length === 0) return secs;
    // 先递归处理每个子节点的 children（深层优先）
    const withChildrenCollapsed = secs.map((sec) => {
      if (!sec || typeof sec !== 'object') return sec;
      if (sec.collapsed) return sec; // 已折叠不再下钻
      if (isChartContainer(sec)) return sec; // 🛡️ 1b：chart 容器内部不下钻（Ellipse 组交 chart-builder）
      if (!Array.isArray(sec.children) || sec.children.length === 0) return sec;
      const collapsedKids = recurse(sec.children, depth + 1);
      if (collapsedKids !== sec.children) {
        return { ...sec, children: collapsedKids };
      }
      return sec;
    });
    if (depth > maxDepth) return withChildrenCollapsed;
    // 收紧：当前层过尺寸门槛的兄弟 ≥ minRepeat 才尝试折叠
    const eligible = withChildrenCollapsed.filter(isBusinessItem);
    if (eligible.length < (opts.minRepeat ?? 3)) return withChildrenCollapsed;
    return collapseRepeatedSiblingSections(withChildrenCollapsed, {
      ...opts,
      _sizeGate: isBusinessItem,
    });
  };

  return recurse(sections, 0);
}
