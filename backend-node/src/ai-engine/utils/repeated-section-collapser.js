/**
 * 重复同构 section 折叠为 list/grid + v-for（2026-09-10）
 *
 * 事故：device 监测 vision 把 12 张同构卡片 + 12 个装饰 Group 拍扁成顶层
 * sections → planner 强制拆 41 个子组件 → COMP-001 按实例点名 → DeviceCard1..N。
 *
 * 正确产物：1 个 item 模板 + v-for，COMP-001 按模板计数。
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

function buildCollapsedSection(first, items, type) {
  const title = first.header?.title || first.title || first.name || first.id;
  return {
    ...first,
    id: `${first.id}-list`,
    type,
    role: type,
    collapsed: true,
    itemTemplate: first,
    items,
    itemCount: items.length,
    renderHint: 'v-for',
    title: String(title || '').trim(),
  };
}

/**
 * 将 ≥minRepeat 次同构 section 收成 1 个 list/grid。
 * 两组同规模且交错出现时（卡 + 装饰），装饰并入卡片 item.deco，只留 1 个列表。
 *
 * @param {Array<object>} sections
 * @param {{minRepeat?: number}} [opts]
 * @returns {Array<object>}
 */
export function collapseRepeatedSiblingSections(sections, opts = {}) {
  const minRepeat = opts.minRepeat ?? 3;
  if (!Array.isArray(sections) || sections.length < minRepeat) return sections;

  const groups = new Map();
  sections.forEach((sec, i) => {
    const sig = sectionRepeatSignature(sec);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(i);
  });

  const collapsing = [];
  for (const [sig, idxs] of groups) {
    if (idxs.length >= minRepeat) collapsing.push({ sig, idxs, absorb: null });
  }
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
    g.idxs.forEach((i) => skip.add(i));
    const first = sections[g.idxs[0]];
    const type = items.length >= 6 ? 'grid' : 'list';
    replacements.set(g.idxs[0], buildCollapsedSection(first, items, type));
  }

  const out = [];
  sections.forEach((sec, i) => {
    if (replacements.has(i)) out.push(replacements.get(i));
    else if (!skip.has(i)) out.push(sec);
  });
  return out;
}

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
