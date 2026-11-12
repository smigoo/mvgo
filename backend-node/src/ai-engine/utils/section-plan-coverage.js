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

/**
 * 🛡️ A1 段数比门禁（2026-11-11 · 方案 docs/2026-11-11-A1段数比门禁方案.md）
 *
 * ## 病灶（今日 8 任务量化分布）
 *
 *   417bde2c：vision 2 段 → E1/拆分链把叶子炸到 26（minFiles=28 ⇒ 34 个 .vue）⇒ failed；
 *   d30c05b4：30 组件 completed 但布局全错。分界线：>10 个组件无一合格（8/7/6/6/6/4 全可用）。
 *   规划器自己产出 minFiles=28 却没有任何闸门质疑这个数——「段数 vs 真值」合理性从未被校验。
 *
 * ## 判据（纯结构，命名无关，零枚举）
 *
 *   base  = max(figmaTop, visionSections)   // 真值段数基准（两者取大者）
 *   ratio = leafSections / base
 *   阈值 SECTION_COUNT_RATIO_LIMIT=4 / HARD=8（命名常量；依据=今日分布：
 *   合格任务 max=8、base≈3 ⇒ ratio≈2.7；爆炸 26/2=13 ⇒ 远超 8）
 *
 * ## 判定（fail-open 原则：缺真值不拦截）
 *
 *   ratio ≤ LIMIT        → pass（放行，现有行为不变）
 *   LIMIT < ratio ≤ HARD → trim（按 elementCount 降序保留 top-(base×LIMIT)，被裁段的内容
 *                           合并进最近祖先容器段，内容不丢）
 *   ratio > HARD         → blocked（调用方抛错，同 L0-B 硬闸通道）
 *
 * ⚠️ 与既有①uncoveredLeaf 的教训对齐（本文件头部取证）：叶子多 ≠ 一定错（v-for 数据数组
 *   渲染多卡是合法形态）⇒ trim 只在 ratio 超限才动，且裁剪保内容合并而非删除。
 */

/** 阈值来源：2026-11-11 八任务分布（合格 max 组件 8、爆炸 26-34；详见方案文档）。 */
export const SECTION_COUNT_RATIO_LIMIT = 4;
export const SECTION_COUNT_RATIO_HARD = 8;
/**
 * figmaTop 归位为「业务段下限」观测阈值（2026-11-12）：
 *   leaf < figmaTop × 该值 ⇒ 欠生成告警（不阻断，欠生成危害交下游 acceptance 抓）。
 *   旧实现把 figmaTop 塞进 ratio 分母（max(figmaTop,visionSections)），"下限"语义错配为"分母"。
 */
export const SECTION_COUNT_RATIO_UNDERGEN_RATIO = 0.5;
/** 过拆碎片叶判定（2026-11-12）：elementCount < 该值 或 id 含 tail-text ⇒ 碎片叶。 */
export const SECTION_OVER_SPLIT_FRAGMENT_ELEMENT = 3;
/** 过拆特征显著阈值（2026-11-12）：碎片叶占比 > 该值 ⇒ 真·一段一组件退化（即便 base 精准也 blocked）。 */
export const SECTION_OVER_SPLIT_FRAGMENT_RATIO = 0.3;

/**
 * 🛡️ A5 段数比门禁专用错误（2026-11-11，实案 68f9d3f2）。
 *
 * ## 为什么必须是独立类型（不能复用 err.code 字符串判别）
 *
 * A1 判据 verdict=blocked 时 planner 抛错，但两个调用方（mc-component-graph-phase2.js:4705、
 * mc-component-graph-vue3.js:2433）的 catch 把它当「规划器自身故障」降级为「不强拆自由裁量」
 * ⇒ 空规划 ⇒ 比 34 组件爆炸更糟的空壳产物（68f9d3f2 视觉分 0.40 仍 completed）。
 * err.code 字符串判别在跨模块传递中易被遗漏（已有先例：planner 内层 catch :3490 正确重抛，
 * 外层 catch 却吞掉）⇒ 升级为类型判别 + 保守策略：**instanceof 不命中才降级**。
 *
 * ## 语义分层（A5 契约）
 *
 *   - 本类 = 判据判定「结构爆炸，任务应失败」⇒ 调用方**禁止降级**，必须向上重抛；
 *   - 其它异常 = 规划器内部故障（网络/解析）⇒ 沿用既有「降级不强拆」容错（不破坏）。
 */
export class PlanningGateError extends Error {
  /** @param {string} message 门禁判定描述（含判据名、阈值、实测值） */
  constructor(message) {
    super(message);
    this.name = 'PlanningGateError';
    this.code = 'SECTION_COUNT_RATIO_BLOCKED';
    // Object.setPrototypeOf：class 语法编译到 ES5 目标时 instanceof 会失真，显式修复原型链
    Object.setPrototypeOf(this, PlanningGateError.prototype);
  }
}

/**
 * 段数比审计（纯函数，可单测）。
 *
 * @param {object} params
 * @param {number} params.leafSections    叶子段数（collectLeafSections().length）
 * @param {number} [params.figmaTop]      Figma 顶层业务段数（planner :2536-2541 同口径）
 * @param {number} [params.visionSections] vision 段数（sections.length）
 * @param {number} [params.truthLeafSections] vision 段树递归叶数（vision 口径真值）
 * @param {number} [params.truthLayerSections] **Figma 真值层叶子段数**（真值口径，分子分母同层）
 * @param {Array}  [params.sections]      完整段树（trim 需要树结构；只判定时可省）
 * @returns {{ evaluated: boolean, skippedReason: string|null, base: number, baseSource: string,
 *   ratio: number, verdict: 'pass'|'trim'|'blocked', softBlocked: boolean,
 *   trimmed: Array, sections: Array }}
 */
export function auditSectionCountRatio({ leafSections, figmaTop = 0, visionSections = 0, truthLeafSections, truthLayerSections, sections } = {}) {
  const failOpen = (reason, extra = {}) => ({
    evaluated: false,
    skippedReason: reason,
    base: 0,
    baseSource: 'none',
    ratio: 0,
    verdict: 'pass',
    softBlocked: false,
    trimmed: [],
    underGenerated: false,
    fragmentRatio: 0,
    avgElementCount: 0,
    baseIsTopLevel: false,
    // 🛡️ 2026-11-13 治本：过拆特征的计量口径（已计量 / 未计量分开计数）
    measuredLeafCount: 0,
    unmeasuredLeafCount: 0,
    featuresUnmeasured: false,
    sections: Array.isArray(sections) ? sections : [],
    ...extra,
  });
  if (!Number.isFinite(leafSections) || leafSections <= 0) return failOpen('no-leaf-sections');
  // 🔴 治本·层2（2026-11-13 · 181 个真实任务语料标定）：base 优先取「Figma 真值层段数」。
  //   分子分母**同源同层**：分子 = 规划产出树的叶子数，分母 = 设计稿真值层的叶子数
  //   （deriveSectionsFromFigmaTree 全树推导，与 V-5 局部展开同一口径）。
  //
  //   🔴 为什么必须换口径（旧口径的病灶）：
  //     旧 base 是「展开**前**」的量纲（vision 递归叶 / Figma 顶层块数），
  //     而分子是「展开**后**」的量纲（规划产出树的叶子）⇒ V-5 局部展开把 1 个粗段
  //     换成 N 个真值段时，比值必然暴涨。生产实锤 mc-max-1794459907233-547bfb75：
  //     vision 递归叶=1 / 真值层=15 / 规划叶子=15 ⇒ 旧口径 ratio=15（误杀），
  //     新口径 ratio=1.00（正常：规划段数 == 设计稿真值段数）。
  //
  //   📊 语料标定（backend-node/data/tasks.json，181 个含 checkpoint 的任务）：
  //     真值层段数 p50=8 / p90=18，而 vision 段数 p50=3 ⇒ 真值层本就远多于 vision 段
  //     ⇒ **V-5 展开是真实业务粒度，不是过拆**（这是旧口径误杀的根源）。
  //     旧口径在 completed 任务上同样误杀：`d30c05b4` completed 却被算成 ratio=8.33（>8）。
  const truthLayer = Number(truthLayerSections) || 0;
  const truthLeaf = Number(truthLeafSections) || 0;
  let base = 0;
  let baseSource = 'top-level';
  if (truthLayer > 0) {
    base = truthLayer;
    baseSource = 'truth-layer';
  } else if (truthLeaf > 0) {
    base = truthLeaf;
    baseSource = 'truth-leaf';
  } else {
    base = Math.max(Number(figmaTop) || 0, Number(visionSections) || 0);
    baseSource = 'top-level';
  }
  const baseIsTopLevel = baseSource === 'top-level';
  if (base <= 0) return failOpen('no-truth-baseline');
  // 🛡️ figmaTop 归位为「业务段下限」观测（2026-11-12）：leaf 明显 < figmaTop ⇒ 欠生成告警，
  //   不阻断（欠生成危害由下游 acceptance 抓，门禁只防过拆）。
  const underGenerated = Number(figmaTop) > 0 && leafSections < Number(figmaTop) * SECTION_COUNT_RATIO_UNDERGEN_RATIO;
  // 🛡️ 过拆特征（2026-11-12）：遍历 planner 产出段树算碎片叶占比 / 平均 elementCount，
  //   精准区分「真·一段一组件退化（碎片）」vs「合理深嵌套（大段）」。
  // 🔴 治本（2026-11-13 · 生产实锤 mc-max-1794459907233-547bfb75 · 13:05:52「段数比门禁阻断」）：
  //   原实现用 `Number(s.elementCount) || 0` 把「元素**未计量**」与「计量为 **0**」压成同一个 0，
  //   于是未计量段被当成碎片段、且均值分母算成**全部**叶子 ⇒ frag=1.00 / avgEc=0.0
  //   ⇒ overSplitSignificant=true ⇒ ratio>8 时直接 blocked ⇒ 任务必败（生产实况 ratio=15）。
  //   实锤形态：V-5 局部展开（applyOverCoarseExpansion → deriveSectionsFromFigmaTree，
  //   over-coarse-section-expander.js:396）产出的段**根本不产 elementCount 字段**
  //   （section-tree.js:2856-2878 只有 id/name/figmaNodeId/sourceNodeIds/layout/children/styles）
  //   ⇒ 15 个段全部「未计量」，却被门禁当成「每段 0 元素的碎片」。
  //   ⚠️ 指纹对照（判别依据，不可省）：
  //     真过拆 bbf827f0 的碎片段 elementCount=1（**计量到 1**，小但已计量）；
  //     本次 avgEc 是**精确 0.0**（15/15 段均无计数）⇒ 0 是「未计量」的指纹，不是「元素少」的指纹。
  //   ⇒ 治本：过拆特征只统计**已计量**段（缺失/null/非有限数 = 未计量：不进碎片分子、不进均值分母）；
  //     全段未计量 ⇒ featuresUnmeasured（这些段不是 vision 解析产物 ⇒「每段 0 元素」不成立）
  //     ⇒ **不**默认判过拆显著（不阻断），但留痕计数，交下游 acceptance 复核。
  let fragmentRatio = 0;
  let avgElementCount = 0;
  let featuresAvailable = false;
  let measuredLeafCount = 0;
  let unmeasuredLeafCount = 0;
  if (Array.isArray(sections) && sections.length > 0) {
    const leaves = collectLeafSections(sections);
    if (leaves.length > 0) {
      featuresAvailable = true;
      let frag = 0;
      let sumEc = 0;
      for (const s of leaves) {
        // 未计量 = 字段缺失 / null / 非有限数（**不是** 0；0 是「计量到零」）
        const raw = s?.elementCount;
        const measured = raw !== undefined && raw !== null && Number.isFinite(Number(raw));
        if (!measured) {
          unmeasuredLeafCount += 1;
          continue;
        }
        const ec = Number(raw);
        measuredLeafCount += 1;
        sumEc += ec;
        const isFrag = /tail-text/i.test(String(s?.id ?? '')) || ec < SECTION_OVER_SPLIT_FRAGMENT_ELEMENT;
        if (isFrag) frag += 1;
      }
      // 碎片占比与均值只在**已计量**段上计算（分母 = 已计量数，不是全部叶子）
      fragmentRatio = measuredLeafCount > 0 ? frag / measuredLeafCount : 0;
      avgElementCount = measuredLeafCount > 0 ? sumEc / measuredLeafCount : 0;
    }
  }
  // featuresUnmeasured：sections 给了但**全部叶子未计量** ⇒ 段不是 vision 解析产物
  //   （Figma 树派生段）⇒ 「每段 0 元素」不成立 ⇒ 不判过拆显著（不阻断，留痕）。
  const featuresUnmeasured = featuresAvailable && measuredLeafCount === 0;
  const ratio = leafSections / base;
  // 🛡️ 保守策略**分层**（两者不可合并）：
  //   - featuresAvailable=false（sections 未提供，真·无法评估）⇒ 保守判过拆显著（历史行为，保留）；
  //   - featuresUnmeasured=true（sections 提供但元素全未计量）⇒ 不判过拆显著（本次治本点）。
  const overSplitSignificant = featuresUnmeasured
    ? false
    : !featuresAvailable ||
      fragmentRatio > SECTION_OVER_SPLIT_FRAGMENT_RATIO ||
      avgElementCount < SECTION_OVER_SPLIT_FRAGMENT_ELEMENT;
  // 🛡️ 放宽 + 补丁（2026-11-13 · 181 个真实任务语料标定）：**取消硬阻断**。
  //   旧行为：ratio > HARD 且（base 不可靠 或 过拆显著）⇒ 抛 PlanningGateError 打死整个任务。
  //   三条语料证据（判别依据，不可省）：
  //     ① 旧口径在 **completed** 任务上同样误杀：`d30c05b4` completed，旧 ratio=8.33 > 8 被 blocked；
  //     ② 新口径下 completed 最高 5.00 vs failed 最高 5.40 —— **区间重叠** ⇒ ratio 无判别力，
  //        不具备承担「质量裁决」的资格（任何阈值都在「漏过真过拆」与「误伤成功任务」间二选一）；
  //     ③ 生产实锤 mc-max-1794459907233-547bfb75：ratio=15 的**正常**任务（规划段数 == 真值段数）
  //        被直接打死。
  //   ⇒ 降级为「**裁剪 + 强告警**」：过碎段内容并回宿主容器段（不丢），任务继续跑；
  //     最终质量裁决交下游 **acceptance**（C1/C2/D1 内容真值判据，判别力远高于段数比）。
  //   ⚠️ 不可走「降级为不强拆」路径：A5 注释实锤该路返回**空规划** ⇒ 空壳产物（视觉分 0.40 仍 completed）。
  let softBlocked = false;
  if (ratio > SECTION_COUNT_RATIO_HARD) {
    //   - base 不可靠（顶层降级）⇒ 保守处理（历史行为，保留为软阻断）；
    //   - base 准 且 过拆特征显著（碎片占比高 / 平均 elementCount 过低）⇒ 真·一段一组件退化 ⇒ 软阻断；
    //   - base 准 且 段都合理大（过拆不显著）⇒ 落 trim 分支（不阻断）。
    if (baseIsTopLevel || overSplitSignificant) {
      softBlocked = true;
    }
    // fall-through 到 trim 分支（裁剪 + 告警，不中断任务）
  }
  if (ratio > SECTION_COUNT_RATIO_LIMIT) {
    // 🛡️ 精准裁剪（2026-11-12）：仅过拆特征显著（碎片高 / 平均 elementCount 低）或无法评估特征
    //   （sections 未提供，保守裁剪）时才裁剪；真值 base 准 且 段都合理大（过拆不显著）⇒ 视为合理
    //   深嵌套，pass 不裁剪（避免误伤，内容不丢）。
    if (!overSplitSignificant && !softBlocked) {
      return { evaluated: true, skippedReason: null, base, baseSource, ratio, verdict: 'pass', softBlocked: false, trimmed: [], sections: Array.isArray(sections) ? sections : [], underGenerated, fragmentRatio, avgElementCount, baseIsTopLevel, measuredLeafCount, unmeasuredLeafCount, featuresUnmeasured };
    }
    // 裁剪：保 top-(base×LIMIT) 叶子（elementCount 降序），其余内容并回最近祖先容器段。
    const keep = Math.max(1, Math.round(base * SECTION_COUNT_RATIO_LIMIT));
    const tree = Array.isArray(sections) ? sections : [];
    // 收集全部叶子（带宿主链），按 elementCount 降序取 keep 个
    const leaves = [];
    const walk = (list, host, depth = 0) => {
      if (!Array.isArray(list) || depth > 8) return;
      for (const s of list) {
        if (!s || typeof s !== 'object') continue;
        const kids = Array.isArray(s.children) ? s.children : [];
        if (kids.length === 0) {
          leaves.push({ s, host, count: Number(s.elementCount) || 0 });
        } else {
          walk(kids, s, depth + 1);
        }
      }
    };
    walk(tree, null);
    const sorted = [...leaves].sort((a, b) => b.count - a.count);
    const keepSet = new Set(sorted.slice(0, keep).map((x) => x.s));
    const trimmed = [];
    const prune = (list) => {
      const out = [];
      for (const s of list) {
        if (!s || typeof s !== 'object') { out.push(s); continue; }
        const kids = Array.isArray(s.children) ? s.children : [];
        if (kids.length === 0) {
          if (keepSet.has(s)) { out.push(s); }
          else {
            trimmed.push({ id: String(s.id ?? ''), elementCount: Number(s.elementCount) || 0, mergedInto: null });
          }
          continue;
        }
        const nextKids = prune(kids);
        out.push({ ...s, children: nextKids });
      }
      return out;
    };
    const nextTree = prune(tree);
    // 被裁叶子的 body.items 并回宿主段（内容不丢——与①教训对齐，绝不静默删内容）。
    // 🔴 e3acdc25 调试实锤：被裁叶子的宿主（host）本身是**容器段**（有 children 的段），
    //   被裁叶子的 items 必须并回该**宿主段自身**的 body.items——不能只找「保留下来的
    //   叶子」吸收（本例 10 个叶子全是宿主的直接子节点，宿主自己没有 body.items 就没有
    //   吸收者）。合并目标 = 宿主段（含容器段），mergedInto 记录宿主 id 供审计。
    const mergeItems = (list) => {
      for (const s of list) {
        if (!s || typeof s !== 'object') continue;
        // 本段是被裁叶子的宿主？收集其被裁子叶的 items 并回本段
        const orphanLeaves = leaves.filter(
          (x) => x.host && String(x.host?.id ?? '') === String(s.id ?? '') && !keepSet.has(x.s),
        );
        if (orphanLeaves.length > 0) {
          const orphanItems = orphanLeaves.flatMap((x) =>
            Array.isArray(x.s?.body?.items) ? x.s.body.items : [],
          );
          if (orphanItems.length > 0) {
            s.body = { ...(s.body || {}), items: [...(Array.isArray(s.body?.items) ? s.body.items : []), ...orphanItems] };
            for (const x of orphanLeaves) {
              const t = trimmed.find((tt) => tt.id === String(x.s?.id ?? ''));
              if (t) t.mergedInto = String(s.id ?? '');
            }
          }
        }
        const kids = Array.isArray(s.children) ? s.children : [];
        if (kids.length > 0) mergeItems(kids);
      }
    };
    mergeItems(nextTree);
    return { evaluated: true, skippedReason: null, base, baseSource, ratio, verdict: 'trim', softBlocked, trimmed, sections: nextTree, underGenerated, fragmentRatio, avgElementCount, baseIsTopLevel, measuredLeafCount, unmeasuredLeafCount, featuresUnmeasured };
  }
  return { evaluated: true, skippedReason: null, base, baseSource, ratio, verdict: 'pass', softBlocked: false, trimmed: [], sections: Array.isArray(sections) ? sections : [], underGenerated, fragmentRatio, avgElementCount, baseIsTopLevel, measuredLeafCount, unmeasuredLeafCount, featuresUnmeasured };
}

/**
 * 段清单版面覆盖率下限。
 *
 * 阈值来源（2026-11-11 离线回算 68 个已落盘任务）：
 *   - 好样本 cfa7136d 0.707 / 3ea66342 0.917 / 8184006e 1.000；
 *   - 最坏样本 74722f0f 0.432（段清单只有 3 段合计 349px，而同父 slot-当日总流量 556px 未被任何段覆盖）；
 *   - 中位 0.923。
 * ⇒ 取 0.55 落在 0.432 与 0.694 之间，**只抓「严重漏版面」**；若取 0.7 会把好样本 0.707 卡在边界上（差 0.013）。
 */
export const SECTION_COVERAGE_RATIO_MIN = 0.55;

/**
 * 🛡️ section-coverage（2026-11-11 · 74722f0f 实锤）：段清单版面覆盖率审计（**纯观测，不参与决策**）。
 *
 * 为什么需要：刀53/V14/A4/V-4 四轮都在优化「段内部比例算得准不准」，但没有任何环节校验
 * **段清单是否覆盖了父容器版面**。74722f0f 的 blueprint 只有 3 段（33+142+174=349px），
 * 而同父容器 425×807 下真实存在的 556px 大块完全没进段清单 ⇒ 下游 flexGrow 只能按 349px
 * 归一化（比例只覆盖 40%），LLM 面对空白自拆组件、flex 自拟（0.055 vs 真值 0.689）。
 *
 * 判据（纯几何，**不认 name**，遵守文本命名无关原则）：
 *   1. 段高优先取 `styles.figmaHeightPx`，缺失时回退 Figma 节点 bbox 高；两者都无 ⇒ 计入 missingHeight；
 *   2. 只统计**顶层段**（父链中若含其它段则跳过，避免父子重复计高）；
 *   3. 分母 = 所有顶层段的**最近公共祖先**容器 bbox 高（不是「第一个段的父节点」——那样会把
 *      段父级取成 28px 的 tab 条，实测 ratio 虚高到 30 倍）；
 *   4. ratio < SECTION_COVERAGE_RATIO_MIN ⇒ verdict='incomplete'（仅观测，返回给调用方打计数行）。
 *
 * fail-open：无 figma 索引 / 无段 / 无可用高度 / 无容器高 ⇒ evaluated=false, verdict='pass'。
 *
 * @param {{ sections?: Array<object>, figmaNodeData?: object }} input
 * @returns {{evaluated: boolean, skippedReason: string|null, ratio: number, coveredPx: number,
 *   containerPx: number, containerId: string|null, missingHeight: number, verdict: 'pass'|'incomplete'}}
 */
export function auditSectionCoverage({ sections, figmaNodeData } = {}) {
  const failOpen = (reason) => ({
    evaluated: false,
    skippedReason: reason,
    ratio: 0,
    coveredPx: 0,
    containerPx: 0,
    containerId: null,
    missingHeight: 0,
    verdict: 'pass',
  });
  const tree = indexCoverageTree(figmaNodeData);
  if (!tree) return failOpen('no-figma-index');
  if (!Array.isArray(sections) || sections.length === 0) return failOpen('no-sections');

  const idOf = (s) => (s && s.id != null ? String(s.id) : '');
  const allIds = sections.map(idOf).filter(Boolean);
  if (allIds.length === 0) return failOpen('no-section-ids');
  const idSet = new Set(allIds);

  // 只取顶层段：父链里若出现另一个段，说明它是子段，跳过以免重复计高
  const isNestedUnderSection = (id) => {
    let cur = tree.parentOf.get(id);
    let guard = 0;
    while (cur && guard++ < 80) {
      if (idSet.has(cur)) return true;
      cur = tree.parentOf.get(cur);
    }
    return false;
  };
  const topIds = allIds.filter((id) => !isNestedUnderSection(id));
  if (topIds.length === 0) return failOpen('no-top-sections');

  let coveredPx = 0;
  let missingHeight = 0;
  for (const s of sections) {
    const id = idOf(s);
    if (!id || isNestedUnderSection(id)) continue;
    const declared = Number(s?.styles?.figmaHeightPx);
    const node = tree.byId.get(id);
    const bboxH = Number(node?.absoluteBoundingBox?.height);
    const use = Number.isFinite(declared) && declared > 0
      ? declared
      : Number.isFinite(bboxH) && bboxH > 0
        ? bboxH
        : 0;
    if (use > 0) coveredPx += use;
    else missingHeight += 1;
  }
  if (coveredPx <= 0) return failOpen('no-covered-height');

  // 最近公共祖先（LCA）：各顶层段父链交集取最深
  const chains = topIds.map((id) => {
    const chain = [];
    let cur = tree.parentOf.get(id);
    let guard = 0;
    while (cur && guard++ < 80) {
      chain.push(cur);
      cur = tree.parentOf.get(cur);
    }
    return chain;
  });
  let lca = null;
  if (chains.length > 0) {
    const common = new Set(chains[0]);
    for (const chain of chains.slice(1)) {
      for (const c of [...common]) {
        if (!chain.includes(c)) common.delete(c);
      }
    }
    for (const c of chains[0]) {
      if (common.has(c)) {
        lca = c;
        break;
      }
    }
  }
  const containerPx = lca ? Number(tree.byId.get(lca)?.absoluteBoundingBox?.height) || 0 : 0;
  if (containerPx <= 0) return failOpen('no-container-height');

  const ratio = coveredPx / containerPx;
  return {
    evaluated: true,
    skippedReason: null,
    ratio,
    coveredPx: Math.round(coveredPx),
    containerPx: Math.round(containerPx),
    containerId: lca,
    missingHeight,
    verdict: ratio < SECTION_COVERAGE_RATIO_MIN ? 'incomplete' : 'pass',
  };
}

/**
 * 段锚点几何范围上提的最小倍数（目标容器高 / 当前段高）。
 *
 * 来源（2026-11-11 · 74722f0f 实锤）：段 `2:3550`（当日总流量）锚定在 33px 的 header 条上，
 * 而其 body 内两张数据卡的真实归属容器是 `88:33`（556px，16.8 倍）。取 1.5 倍只捕捉
 * 「数量级级差异」（标题条 vs 内容区），避免 10~20% 的正常误差被误改。
 */
export const SECTION_ANCHOR_LIFT_MIN_RATIO = 1.5;

/**
 * 🛡️ V-6（2026-11-11 · 74722f0f 实锤）：段锚点几何范围按「body 内容的真实归属容器」上提。
 *
 * 与同族判据的分工（避免重复补丁）：
 *   - **V-4**（planner 内）：锚点落在「重复集合中的成员」时上提到集合容器；
 *   - **V-5**（planner 内）：段粒度过粗（整块内容区当一段）⇒ 局部展开成多段；
 *   - **V-6**（本函数）：锚点是**标题条/小标题**（33px），而其 body 描述的内容实际住在
 *     **同级兄弟容器**里（`88:33 slot-当日总流量` 556px）⇒ 把段的几何范围上提到那个容器，
 *     段 id 不变（保持下游判据对位），只更新 `styles.figmaHeightPx` 与 `figmaAnchorId`。
 *
 * 为什么必须治：`applyFigmaHeightGrow` 优先读 `styles.figmaHeightPx`（33）⇒ flexGrow 按 33
 * 归一化（0.095），而真值应按 556 归一化（0.638）⇒ 当日总流量被压成 5.5% 高度，
 * LLM 面对剩余 556px 空白只能自拆组件、flex 自拟。
 *
 * 判据（纯几何 + 父子链，**不认 name**）：
 *   1. 递归收集段 `body` / `header` 内全部 `figmaNode` id（只保留真实存在于 Figma 树的）；
 *   2. 求这些节点的最近公共祖先（LCA，父链交集最深）；
 *   3. 从 LCA 上溯到「父节点 == 段锚点父节点」的那一层容器（即与锚点同级的内容容器）；
 *   4. 目标容器高 ≥ 当前段高 × SECTION_ANCHOR_LIFT_MIN_RATIO ⇒ 上提（更新高度与 figmaAnchorId）。
 *
 * 幂等：上提后 `figmaAnchorId` 已是目标容器，再次调用时 LCA 上溯会得到同一 target ⇒ 高度不再变化。
 * fail-open：无 Figma 索引 / 无 figmaNode 引用 / 找不到同级容器 / 目标高缺失 ⇒ 原样返回。
 *
 * @param {{ sections?: Array<object>, figmaNodeData?: object }} input
 * @returns {{ sections: Array<object>, stats: {evaluated:number, lifted:number, skipped:number} }}
 */
/** 递归收集段 body/header 内全部 `figmaNode` id（只保留真实存在于 Figma 树的）。 */
function collectSectionFigmaIds(sec, parentOf) {
  const out = [];
  const rec = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      for (const v of o) rec(v);
      return;
    }
    const fn = o.figmaNode;
    if (fn != null) {
      const id = String(fn);
      if (parentOf.has(id)) out.push(id);
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') rec(v);
    }
  };
  rec(sec?.body);
  rec(sec?.header);
  return out;
}

/** 父链交集最深者（最近公共祖先）。 */
function lcaOfIds(ids, parentOf) {
  if (!ids || ids.length === 0) return null;
  const chains = [];
  for (const id of ids) {
    const chain = [];
    let cur = parentOf.get(id);
    let guard = 0;
    while (cur && guard++ < 80) {
      chain.push(cur);
      cur = parentOf.get(cur);
    }
    if (chain.length > 0) chains.push(chain);
  }
  if (chains.length === 0) return null;
  const common = new Set(chains[0]);
  for (const chain of chains.slice(1)) {
    for (const c of [...common]) {
      if (!chain.includes(c)) common.delete(c);
    }
  }
  for (const c of chains[0]) {
    if (common.has(c)) return c;
  }
  return null;
}

/**
 * 解析段的「内容真实归属容器」：body/header 内 figmaNode 的 LCA，上溯到与段锚点同级的那一层容器。
 * 无引用 / 无 LCA / LCA 即自身 / 找不到同级容器 ⇒ null（fail-open）。
 * @returns {string|null}
 */
function resolveContentAnchor(sec, tree) {
  const { parentOf } = tree;
  const sid = sec?.id != null ? String(sec.id) : '';
  if (!sid || !parentOf.has(sid)) return null;
  const ids = collectSectionFigmaIds(sec, parentOf);
  if (ids.length === 0) return null;
  const lca = lcaOfIds(ids, parentOf);
  if (!lca || lca === sid) return null;
  const anchorParent = parentOf.get(sid);
  let cur = lca;
  let guard = 0;
  while (cur && guard++ < 40) {
    if (parentOf.get(cur) === anchorParent) return cur;
    cur = parentOf.get(cur);
  }
  return null;
}

export function liftSectionAnchorsByContentRange({ sections, figmaNodeData } = {}) {
  const stats = { evaluated: 0, lifted: 0, skipped: 0 };
  if (!Array.isArray(sections) || sections.length === 0) return { sections: sections || [], stats };
  const tree = indexCoverageTree(figmaNodeData);
  if (!tree) return { sections, stats };
  const { byId, parentOf } = tree;

  const collectFigmaIds = (sec) => collectSectionFigmaIds(sec, parentOf);
  const lcaOf = (ids) => lcaOfIds(ids, parentOf);

  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    stats.evaluated += 1;
    const sid = s.id != null ? String(s.id) : '';
    if (!sid || !parentOf.has(sid)) {
      stats.skipped += 1;
      continue;
    }
    const ids = collectFigmaIds(s);
    if (ids.length === 0) {
      stats.skipped += 1;
      continue;
    }
    const lca = lcaOf(ids);
    if (!lca || lca === sid) {
      stats.skipped += 1;
      continue;
    }
    const anchorParent = parentOf.get(sid);
    let target = null;
    let cur = lca;
    let guard = 0;
    while (cur && guard++ < 40) {
      if (parentOf.get(cur) === anchorParent) {
        target = cur;
        break;
      }
      cur = parentOf.get(cur);
    }
    if (!target || target === sid) {
      stats.skipped += 1;
      continue;
    }
    const targetH = Number(byId.get(target)?.absoluteBoundingBox?.height) || 0;
    const curH = Number(s.styles?.figmaHeightPx) || 0;
    if (targetH <= 0) {
      stats.skipped += 1;
      continue;
    }
    // 已上提过（幂等）：当前高度已达目标
    if (curH > 0 && Math.abs(targetH - curH) < 1) {
      stats.skipped += 1;
      continue;
    }
    if (curH > 0 && targetH < curH * SECTION_ANCHOR_LIFT_MIN_RATIO) {
      stats.skipped += 1;
      continue;
    }
    s.styles = { ...(s.styles || {}), figmaHeightPx: Math.round(targetH) };
    s.figmaAnchorId = target;
    stats.lifted += 1;
  }
  return { sections, stats };
}

/**
 * 🛡️ V-7（2026-11-11 · 5d6a6a25 实锤）：同 id 段合并（撞 id 的两段合为一段，不丢内容）。
 *
 * **实锤**：vision 输出 4 段，其中两个都用 id `2:3550`——
 *   - 段 0「当日总流量」：body 内 4 个 figmaNode，内容真实容器 `88:33`（556px）；
 *   - 段 3「流量趋势柱状图」：body 内 **0 个** figmaNode（无归属幻影段），却复用了同一 id。
 * 结果 `applyFigmaHeightGrow` 归一化时同一 id 出现两次（2.457 / 0.146），LLM 拿到两个同名段
 * 只能猜着分配 ⇒ 当日总流量只拿到 flex 0.480（应 0.638）。**注意这不是「重复段」**——
 * 两段语义不同（一个是总量卡区，一个是趋势图表区），简单按 id 删一个会丢真实内容。
 *
 * **判据**（纯结构，不认 name）：
 *   1. 按 `id` 分组（仅顶层；调用方负责递归批次）；
 *   2. 组内选**宿主** = 有内容锚点（`resolveContentAnchor` 非空）且 `figmaHeightPx` 最大者；
 *      全部无锚点时退化为「body 子节点最多者」；
 *   3. 其余段的 `body.children` / `header.controls` 追加进宿主（按 figmaNode / id / text 去重后），
 *      再从数组移除——**只为消除 id 歧义，不丢弃任何内容描述**；
 *   4. 已唯一或只有一段的组不动。
 *
 * 幂等：合并后再跑，组内仅剩 1 段 ⇒ merged=0。
 * fail-open：无 Figma 树时仍按「高度最大者」做最小合并（不依赖锚点）。
 *
 * @param {{ sections?: Array<object>, figmaNodeData?: object }} input
 * @returns {{ sections: Array<object>, stats: {evaluated:number, groups:number, merged:number, removed:number, detail:Array<object>} }}
 */
/** 段内子项去重键（figmaNode / id / text / name 依次取值）。供 V-7 / V-8 共用。 */
function sectionChildKey(o) {
  if (!o || typeof o !== 'object') return '';
  const k = o.figmaNode ?? o.id ?? o.text ?? o.name ?? '';
  return k === '' ? '' : String(k);
}

/**
 * 把 donor 段的 `body.children` 与 `header.controls` 去重后并入 host 段（**不丢任何描述**）。
 * 供 V-7（撞 id 合并）与 V-8（父子 header 合并）共用——单一事实源，禁止各写一份。
 */
function absorbSectionPayload(host, donor) {
  if (!host || !donor) return;
  const hostBody = host.body && typeof host.body === 'object' ? host.body : null;
  const donorKids = Array.isArray(donor?.body?.children) ? donor.body.children : [];
  if (hostBody && donorKids.length > 0) {
    const exist = new Set((Array.isArray(hostBody.children) ? hostBody.children : []).map(sectionChildKey).filter(Boolean));
    const add = [];
    for (const k of donorKids) {
      const kk = sectionChildKey(k);
      if (kk && exist.has(kk)) continue;
      if (kk) exist.add(kk);
      add.push(k);
    }
    if (add.length > 0) host.body = { ...hostBody, children: [...(hostBody.children || []), ...add] };
  }
  const donorCtl = Array.isArray(donor?.header?.controls) ? donor.header.controls : [];
  if (donorCtl.length > 0) {
    const h = host.header && typeof host.header === 'object' ? host.header : {};
    const exist = new Set((Array.isArray(h.controls) ? h.controls : []).map(sectionChildKey).filter(Boolean));
    const add = donorCtl.filter((c) => {
      const kk = sectionChildKey(c);
      if (kk && exist.has(kk)) return false;
      if (kk) exist.add(kk);
      return true;
    });
    if (add.length > 0) host.header = { ...h, controls: [...(h.controls || []), ...add] };
  }
}

/**
 * V-8 判据：子段高度 ≤ 父段高度的该比例时才视为「父段的 header 片段」。
 *
 * 来源（2026-11-11 · bafe3fb7 实锤）：`136:122 sub-header`(24px) 是 `136:121 slot`(86px) 的**直接子节点**，
 * 高度比 24/86 = 0.279。取 0.4 既覆盖典型 sub-header（通常 20~35%），又不会把
 * 「高度占父段一半的合法子区块」误并。
 */
export const SECTION_CHILD_HEADER_MAX_RATIO = 0.4;

export function mergeCollidedSections({ sections, figmaNodeData } = {}) {
  const stats = { evaluated: 0, groups: 0, merged: 0, removed: 0, detail: [] };
  if (!Array.isArray(sections) || sections.length <= 1) {
    return { sections: sections || [], stats };
  }
  const tree = indexCoverageTree(figmaNodeData);

  const byId = new Map();
  sections.forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    const id = s.id != null ? String(s.id) : '';
    if (!id) return;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(i);
  });

  const drop = new Set();
  const keyOf = sectionChildKey;
  const mergeInto = absorbSectionPayload;

  for (const [id, idxs] of byId.entries()) {
    stats.evaluated += 1;
    if (idxs.length <= 1) continue;
    stats.groups += 1;
    const cands = idxs.map((i) => {
      const s = sections[i];
      const anchor = tree ? resolveContentAnchor(s, tree) : null;
      return {
        i,
        s,
        anchor,
        h: Number(s?.styles?.figmaHeightPx) || 0,
        childCount: Array.isArray(s?.body?.children) ? s.body.children.length : 0,
      };
    });
    const withAnchor = cands.filter((c) => c.anchor && c.anchor !== id);
    const pool = withAnchor.length > 0 ? withAnchor : cands;
    pool.sort((a, b) => (b.h - a.h) || (b.childCount - a.childCount));
    const host = pool[0];
    const donors = cands.filter((c) => c.i !== host.i);
    for (const d of donors) {
      mergeInto(host.s, d.s);
      drop.add(d.i);
      stats.removed += 1;
    }
    stats.merged += 1;
    stats.detail.push({
      id,
      kept: host.i,
      keptAnchor: host.anchor || null,
      keptHeight: host.h,
      absorbed: donors.map((d) => ({
        index: d.i,
        height: d.h,
        bodyChildren: d.childCount,
        anchor: d.anchor || null,
      })),
    });
  }

  if (drop.size === 0) return { sections, stats };
  const out = sections.filter((_, i) => !drop.has(i));
  return { sections: out, stats };
}

/**
 * 🛡️ V-8（2026-11-11 · bafe3fb7 实锤）：父子段合并 + header 上提。
 *
 * **实锤**：`mc-max-1794395328504-bafe3fb7` 产物里出现两个「◆今日累计」。查 Figma：
 *   `136:121 'slot'`(y=963, h=86)          ← 段「统计卡片区」→ 产物 StatsSection
 *   `└── 136:122 'sub-header'`(y=963, h=24) ← **直接子节点**，同 y，被 vision 也当成独立段
 *                                            → 产物 ContentSection（又渲染一份 header）
 * 两个组件各写一份标题 ⇒ 屏幕重复。
 *
 * **与 V-7 的分工**：V-7 合并「**相同 id**」（幻影段抄了别人的 id）；V-8 合并「**父子关系**」
 * （子段只是父段的 header 片段，id 不同）。
 *
 * **判据**（纯结构 + 几何，**不认 name**）：
 *   ① 段 A 的 figma 节点**直接父节点**就是段 B 的 figma 节点（`parentOf.get(A.id) === B.id`）；
 *   ② A 无段级 `children`（否则它是独立子区块，不是 header 片段）；
 *   ③ A 高度 ≤ B 高度 × `SECTION_CHILD_HEADER_MAX_RATIO`(0.4) —— bafe3fb7 实测 24/86 = 0.279。
 * **处置**：① 若 B 无 `header.title` 而 A 有 ⇒ 标题**上提**到 B（否则删 A 会丢标题）；
 *   ② A 的 body.children / header.controls 去重并入 B；③ 删除 A。
 *
 * 幂等（合并后再跑不再命中）；fail-open（无 Figma 树 / 无直接父子 / 高度缺失 ⇒ 原样返回）。
 *
 * @param {{ sections?: Array<object>, figmaNodeData?: object }} input
 * @returns {{ sections: Array<object>, stats: {evaluated:number, groups:number, merged:number, removed:number, detail:Array<object>} }}
 */
export function mergeChildHeaderSections({ sections, figmaNodeData } = {}) {
  const stats = { evaluated: 0, groups: 0, merged: 0, removed: 0, detail: [] };
  if (!Array.isArray(sections) || sections.length <= 1) return { sections: sections || [], stats };
  const tree = indexCoverageTree(figmaNodeData);
  if (!tree) return { sections, stats };
  const { byId, parentOf } = tree;

  const idxById = new Map();
  sections.forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    const id = s.id != null ? String(s.id) : '';
    if (id && !idxById.has(id)) idxById.set(id, i);
  });

  const drop = new Set();
  for (let i = 0; i < sections.length; i += 1) {
    if (drop.has(i)) continue;
    const a = sections[i];
    if (!a || typeof a !== 'object') continue;
    stats.evaluated += 1;
    const aid = a.id != null ? String(a.id) : '';
    if (!aid || !parentOf.has(aid)) continue;
    const pid = parentOf.get(aid);
    const bi = idxById.get(pid);
    if (bi === undefined || bi === i || drop.has(bi)) continue;
    const b = sections[bi];
    if (!b || typeof b !== 'object') continue;
    stats.groups += 1;
    // ① 只有两层父子、无更深嵌套时才可能是 header 片段
    if (Array.isArray(a.children) && a.children.length > 0) continue;
    const ah = Number(byId.get(aid)?.absoluteBoundingBox?.height) || Number(a?.styles?.figmaHeightPx) || 0;
    const bh = Number(byId.get(pid)?.absoluteBoundingBox?.height) || Number(b?.styles?.figmaHeightPx) || 0;
    if (!(ah > 0 && bh > 0)) continue;
    // ② 高度比守卫：只吃真正的 header 条
    if (ah > bh * SECTION_CHILD_HEADER_MAX_RATIO) continue;
    const aTitle = a?.header?.title;
    const bTitle = b?.header?.title;
    const childTitle = aTitle != null ? String(aTitle).trim() : '';
    const hostTitle = bTitle != null ? String(bTitle).trim() : '';
    if (childTitle && !hostTitle) {
      b.header = { ...(b.header && typeof b.header === 'object' ? b.header : {}), title: aTitle };
    }
    absorbSectionPayload(b, a);
    drop.add(i);
    stats.merged += 1;
    stats.removed += 1;
    stats.detail.push({
      child: aid,
      parent: pid,
      childH: Math.round(ah),
      parentH: Math.round(bh),
      ratio: Number((ah / bh).toFixed(3)),
      promotedTitle: childTitle && !hostTitle ? childTitle : null,
    });
  }

  if (drop.size === 0) return { sections, stats };
  return { sections: sections.filter((_, i) => !drop.has(i)), stats };
}
