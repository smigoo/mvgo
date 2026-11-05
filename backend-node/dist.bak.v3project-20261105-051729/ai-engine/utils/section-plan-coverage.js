/**
 * 🛡️ A 方案（2026-10-23 · mc-max-1792718704810-f98f7463 实锤）：**plan 层覆盖门禁**。
 *
 * ## 病灶（f98f7463：plan section 切分错，是「丢卡 / 重复 / 错装」三类视觉缺陷的共同上游）
 *
 *   真值 `807:2`(slot-con) 下 `43:4892` 是 3 张同构统计卡（43:4893 / 43:4898 / 43:4903），
 *   plan 只切出后两张、**漏掉 43:4893** ⇒ 该卡从未进入生成计划 ⇒ 必然丢失；
 *   另有合成 id 段（`43:4812-list` / `807:2-tail-text`）与 `43:4785` 覆盖大面积重叠 ⇒
 *   内容守卫算出 `duplicateTextIssues:8 / borrowedTextIssues:8`。
 *
 * ## 判据（三条，全部可证伪，纯几何 + 树结构，命名无关）
 *
 *   ① **uncoveredLeaf**：TEXT 节点的**最近容器祖先**（叶子容器）未被任何**叶子 section**
 *      的 Figma 覆盖闭包命中 ⇒ 该容器承载的文案没有任何组件会渲染它。
 *   ② **overlapping**：同层兄弟 section 的覆盖闭包交集 ≠ ∅ ⇒ 同一批节点被两条轨各解释一次。
 *   ③ **oversizedTextRow**：合成 id 的**纯文本行段**（children 全是 TEXT）却把**容器节点**
 *      当锚点 ⇒ 覆盖闭包被撑成整棵父树（本单 `807:2-tail-text` → 45 文本）。
 *
 * ## 🔴 为什么只有 ③ 做确定性修复，①② 只留痕（真实语料取证，2026-10-23）
 *
 *   在 137 个真实组件语料上重放 `SubcomponentPlanner#plan` 实测：
 *   - ① 有 82/137 组件命中「容器未覆盖」，**但属假阳**：`c-aiot-dpjh-bsjd-4e35965c` 的
 *     叶子 section 只有 3 个（header / 单卡 `48:5801` / 页脚），另外 5 张同构卡的 30 条
 *     文本「未覆盖」——可是产物 `ContentSection.vue:34-38` **6 张卡的数据全在**
 *     （2,138 / 1,665 / 1,415 / 965 / 752）。⇒ 列表卡的文案由 v-for 数据数组渲染，
 *     plan 的 `sourceNodeIds` 只锚了第一张卡 ⇒ **「未覆盖」≠「会丢失」**。
 *     按 ① 补建 section 会给 60% 的组件凭空加组件（且与 v-for 双渲染）⇒ 违反「宁漏不误删」。
 *   - ② 残留 10/137 为**部分**重叠；全包含与折叠段 ≥75% 已由 `figma-coverage-dedupe.js`
 *     处置，剩余部分重叠按该模块注释「误删等于整块内容消失」⇒ 不得自动删。
 *   - ③ 在 137 个组件上**零命中**（纯文本行段的锚点全都正确）⇒ 修复它**零回归风险**，
 *     且一旦出现 f98f7463 那种形态就会被确定性收敛。
 *
 *   ⇒ ①② 定位为**诊断留痕**（让下一次同类事故从「人肉取证 4 小时」变成「一条日志」）；
 *     真正的渲染侧修复走刀 53d（在 Figma 树上做兄弟同构聚类，不依赖 plan 切分）。
 *
 * ## 判据单一来源
 *
 *   - 覆盖闭包：`figma-coverage-dedupe.js#buildFigmaClosureIndex / sectionCoverageSet`（不重写）。
 *   - 叶子段：`section-tree.js#collectLeafSections`（与 planner 同一实现）。
 *   - 纯几何、无 `import.meta`、无副作用 ⇒ 可直接单测与离线重放。
 */

import { buildFigmaClosureIndex, sectionCoverageSet } from './figma-coverage-dedupe.js';
import { collectLeafSections } from './section-tree.js';

const CONTAINER_TYPES = new Set([
  'FRAME',
  'GROUP',
  'INSTANCE',
  'COMPONENT',
  'COMPONENT_SET',
  'SECTION',
]);

/**
 * 建 Figma 覆盖索引。
 *
 * @param {object|null} figmaNodeData `{ document }` 或裸根
 * @returns {null|{ rootId: string, byId: Map<string, object>, parentOf: Map<string, string>,
 *   leafContainerOfText: Map<string, string>,
 *   containerTexts: Map<string, { ids: string[], sample: string[] }> }}
 *   ⚠️ 返回值供 detect/heal 共用；无有效数据时返回 null（fail-open）。
 */
export function indexCoverageTree(figmaNodeData) {
  const root = figmaNodeData?.document ?? figmaNodeData;
  if (!root || typeof root !== 'object') return null;
  const rootId = root.id != null ? String(root.id) : '';
  const byId = new Map();
  const parentOf = new Map();
  const leafContainerOfText = new Map();
  const containerTexts = new Map();

  const nearestContainer = (startParent) => {
    let p = startParent;
    let guard = 0;
    while (p && typeof p === 'object' && guard++ < 60) {
      if (CONTAINER_TYPES.has(String(p.type || '').toUpperCase())) return p;
      const pid = p.id != null ? String(p.id) : '';
      p = pid ? parentOf.get(pid) : null;
    }
    return null;
  };

  const walk = (node, parent, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 60) return;
    const id = node.id != null ? String(node.id) : '';
    if (id) {
      byId.set(id, node);
      if (parent) parentOf.set(id, String(parent.id ?? ''));
    }
    if (String(node.type || '').toUpperCase() === 'TEXT' && id) {
      const box = nearestContainer(parent);
      const boxId = box && box.id != null ? String(box.id) : '';
      if (boxId) {
        leafContainerOfText.set(id, boxId);
        if (!containerTexts.has(boxId)) containerTexts.set(boxId, { ids: [], sample: [] });
        const info = containerTexts.get(boxId);
        info.ids.push(id);
        const ch = String(node.characters || '').trim();
        if (ch && info.sample.length < 8) info.sample.push(ch.slice(0, 16));
      }
    }
    for (const c of node.children || []) walk(c, node, depth + 1);
  };
  walk(root, null, 0);
  if (byId.size === 0) return null;
  return { rootId, byId, parentOf, leafContainerOfText, containerTexts };
}

/** 递归遍历 section 树（含 children），回调返回 true 可提前终止。 */
function walkSections(list, fn, depth = 0) {
  if (!Array.isArray(list) || depth > 8) return;
  for (const s of list) {
    if (!s || typeof s !== 'object') continue;
    if (fn(s, depth) === false) return;
    walkSections(s.children, fn, depth + 1);
  }
}

/** 同层兄弟两两求覆盖闭包交集（与既有 audit 脚本同一口径）。 */
function collectOverlaps(sections, closure, out) {
  const scan = (list, path) => {
    const l = (list || []).filter((s) => s && typeof s === 'object');
    for (let i = 0; i < l.length; i++) {
      for (let j = i + 1; j < l.length; j++) {
        const a = sectionCoverageSet(l[i], closure);
        const b = sectionCoverageSet(l[j], closure);
        if (a.size === 0 || b.size === 0) continue;
        let shared = 0;
        for (const x of a) if (b.has(x)) shared++;
        if (shared > 0) {
          out.push({ a: String(l[i].id ?? ''), b: String(l[j].id ?? ''), shared, path: path || '/' });
        }
      }
    }
    for (const s of l) {
      if (Array.isArray(s.children)) scan(s.children, `${path}/${String(s.id ?? '')}`);
    }
  };
  scan(sections, '');
}

/**
 * ③ 判据：合成 id 的**纯文本行段**却拿容器当锚点。
 *
 * 「纯文本行段」由结构判定（children 全为 TEXT），不依赖任何命名后缀或组件名 ⇒
 * 与「不允许硬编码」一致；`-tail-text` / `-orphan-text-N` 只是 section-tree 的**命名**
 * 表现，判据本身不读它。
 *
 * @returns {boolean}
 */
function isOversizedTextRow(sec, closure, idx) {
  const id = String(sec?.id ?? '');
  if (!id) return false;
  if (closure instanceof Map && closure.has(id)) return false; // 真 Figma 节点 ⇒ 不是合成段
  const kids = Array.isArray(sec?.children) ? sec.children : null;
  if (!kids || kids.length === 0) return false;
  const allText = kids.every((c) => c && String(c.type || '').toUpperCase() === 'TEXT');
  if (!allText) return false;
  const src = Array.isArray(sec.sourceNodeIds) ? sec.sourceNodeIds.map(String).filter(Boolean) : [];
  return src.some((a) => {
    const n = idx.byId.get(a);
    return !!n && (n.children || []).length > 0;
  });
}

/**
 * 🛡️ plan 层覆盖门禁（诊断）。
 *
 * @param {object} params
 * @param {Array} params.sections plan.effectiveSections
 * @param {object|null} params.figmaNodeData
 * @param {Array} [params.leafSections] 已算好的叶子段（省略则内部用 collectLeafSections）
 * @returns {{ evaluated: number, uncovered: Array, overlapping: Array, oversizedTextRow: Array,
 *   skipped: boolean, skippedReason: string|null }}
 */
export function detectPlanCoverageGaps({ sections, figmaNodeData, leafSections } = {}) {
  const empty = (reason) => ({
    evaluated: 0,
    uncovered: [],
    overlapping: [],
    oversizedTextRow: [],
    skipped: true,
    skippedReason: reason,
  });
  if (!Array.isArray(sections) || sections.length === 0) return empty('no-sections');
  const idx = indexCoverageTree(figmaNodeData);
  if (!idx) return empty('no-figma-tree');
  const closure = buildFigmaClosureIndex(figmaNodeData);
  if (!(closure instanceof Map) || closure.size === 0) return empty('no-closure-index');

  const leaves = Array.isArray(leafSections) ? leafSections : collectLeafSections(sections) || [];

  // ① 覆盖缺口（只算叶子段：容器 section 只透传，算进去会恒 100% 覆盖 ⇒ 假阴）
  const covered = new Set();
  for (const s of leaves) {
    if (!s || typeof s !== 'object') continue;
    for (const x of sectionCoverageSet(s, closure)) covered.add(x);
  }
  // 🔴 判定必须在 **TEXT 级**做：真机常见「段的锚点是容器里的裸 TEXT」（`-tail-text`
  //   段 sourceNodeIds=['38:3139']，容器 38:3137 自身从不进覆盖集）⇒ 按容器 id 判会
  //   把这类段误报成「未覆盖」（2026-10-23 全量语料实测：3/137 组件因此假阳）。
  //   ⇒ 容器内**任一** TEXT 被覆盖即算该容器已覆盖。
  const uncovered = [];
  for (const [lc, info] of idx.containerTexts) {
    // 🔴 根节点是组件边界、不是内容容器：报「整个根未覆盖」没有可操作性，且会淹没真信号
    //   （它的覆盖问题等价于「本组件有没有 section」，已由 leafSections 数量反映）。
    if (lc === idx.rootId) continue;
    if (info.ids.some((id) => covered.has(id))) continue;
    if (info.sample.length === 0) continue; // 无可辨文案 ⇒ 丢了也不产生视觉缺陷
    uncovered.push({ containerId: lc, textCount: info.ids.length, sample: info.sample.slice(0, 3) });
  }

  // ② 同层兄弟覆盖重叠
  const overlapping = [];
  collectOverlaps(sections, closure, overlapping);

  // ③ 纯文本行段的覆盖膨胀
  const oversizedTextRow = [];
  walkSections(sections, (s) => {
    if (!isOversizedTextRow(s, closure, idx)) return;
    const src = (s.sourceNodeIds || []).map(String).filter(Boolean);
    oversizedTextRow.push({
      id: String(s.id ?? ''),
      containerAnchors: src.filter((a) => (idx.byId.get(a)?.children || []).length > 0),
      coverageSize: sectionCoverageSet(s, closure).size,
    });
  });

  return {
    evaluated: leaves.length,
    uncovered,
    overlapping,
    oversizedTextRow,
    skipped: false,
    skippedReason: null,
  };
}

/**
 * 🛡️ ③ 的确定性修复：纯文本行段的 `sourceNodeIds` 用**自身 children 的 TEXT 节点 id** 重建。
 *
 * 判据可证伪：只对「合成 id + children 全 TEXT + 现存锚点里含容器」的段生效；
 * 重建结果为空 ⇒ **不处置**（宁漏不误删）。真实语料 137 组件零命中 ⇒ 上线零回归风险。
 *
 * @param {object} params
 * @returns {{ sections: Array, healed: Array<{id: string, before: string[], after: string[]}>,
 *   residual: Array<{id: string, reason: string}>, skipped: boolean, skippedReason: string|null }}
 */
export function healOversizedTextRowAnchors({ sections, figmaNodeData } = {}) {
  const base = { healed: [], residual: [], skipped: false, skippedReason: null };
  if (!Array.isArray(sections) || sections.length === 0) {
    return { ...base, sections: sections ?? [], skipped: true, skippedReason: 'no-sections' };
  }
  const idx = indexCoverageTree(figmaNodeData);
  if (!idx) return { ...base, sections, skipped: true, skippedReason: 'no-figma-tree' };
  const closure = buildFigmaClosureIndex(figmaNodeData);
  if (!(closure instanceof Map) || closure.size === 0) {
    return { ...base, sections, skipped: true, skippedReason: 'no-closure-index' };
  }

  const rebuilt = [];
  const walk = (list, depth = 0) => {
    if (!Array.isArray(list) || depth > 8) return list;
    return list.map((s) => {
      if (!s || typeof s !== 'object') return s;
      const next = Array.isArray(s.children) ? { ...s, children: walk(s.children, depth + 1) } : s;
      if (!isOversizedTextRow(next, closure, idx)) return next;
      const before = (next.sourceNodeIds || []).map(String).filter(Boolean);
      const after = (next.children || [])
        .map((c) => String(c?.id ?? ''))
        .filter((id) => id && idx.byId.has(id));
      if (after.length === 0) {
        rebuilt.push({ id: String(next.id ?? ''), reason: 'no-text-child-anchor' });
        return next;
      }
      rebuilt.push({ id: String(next.id ?? ''), before, after, healed: true });
      return { ...next, sourceNodeIds: after };
    });
  };
  const out = walk(sections, 0);
  return {
    sections: out,
    healed: rebuilt.filter((r) => r.healed === true).map(({ id, before, after }) => ({ id, before, after })),
    residual: rebuilt.filter((r) => r.healed !== true).map(({ id, reason }) => ({ id, reason })),
    skipped: false,
    skippedReason: null,
  };
}
