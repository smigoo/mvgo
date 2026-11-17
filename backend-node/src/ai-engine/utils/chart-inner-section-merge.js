/**
 * 🛡️ 图表内部件段归并（2026-11-17 · ef014f7d / 4cac37a8 环境监测实锤）
 *
 * 病灶：vision 会把**图表容器内部**的图例、预警线标签、轴标签当独立 section 输出
 * （真机 `chart-legend` 14px、「预警线」`mark-line` 22px，`sourceNodeIds: []`）。
 * 下游 A4 段高配对只能把它们从**对位序列**里剔除（`syntheticSectionsExcluded`），
 * 但它们仍被当作独立段生成 .vue 组件并分走 flex 份额 ⇒ 图表段被瓜分：
 * 真机 4 段 flex 0.348/0.261/0.152/0.239（Σ=1），chart 段只剩 87px（真值 113px），
 * 图例文字掉到段外；`chart-legend` 里的「zk3+785CO浓度」还无真值锚（幻觉文本直出）。
 *
 * 判据（纯结构，刻意**不认 UI 名字**）：
 *   a) 合成段：`id` 与 `figmaNodeId/figmaNode` 都无法在 Figma 真值树命中，
 *      且未标 `anchorValid === false`（带幻觉标记的段由别的判据管，这里不二次裁决）；
 *   b) 同层存在**图表段**：`type === 'chart'` 或锚节点名带技术栈标记 `@echarts`；
 *   c) 自身高度 ≤ 图表段高度 × CHART_INNER_MAX_HEIGHT_RATIO（几何判据：图例/轴/标注
 *      这类内部件必然远小于图表本体）。
 * 三条同时成立 ⇒ 判为图表内部件，不独立成段（移除，不写比例、不生成组件）。
 *
 * 阈值来源：真机两例 `chart-legend` 14/113 = 12%、`mark-line` 22/113 = 19%；
 * 取 0.35 留足裕度（避免把「真的小业务段」误并），同时覆盖轴标签类（通常 < 25%）。
 *
 * fail-open：任何异常/取不到高度 ⇒ 原样返回，不猜。
 */

/** 图表内部件相对图表段的最大高度比（见文件头「阈值来源」） */
export const CHART_INNER_MAX_HEIGHT_RATIO = 0.35;

/** 技术栈标记：Figma 节点名带此前缀 = 由运行时渲染内部，不做静态还原 */
const TECHSTACK_CHART_RE = /@echarts/i;

/** 段高度兜底取值（styles.figmaHeightPx / layoutMetadata.height / geometryPx.h） */
function sectionHeight(section) {
  const v =
    section?.styles?.figmaHeightPx ??
    section?.layoutMetadata?.height ??
    section?.geometryPx?.h ??
    section?.figmaBox?.height ??
    null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 递归收集 Figma 真值树全部节点 id */
function collectNodeIds(node, acc = new Set()) {
  if (!node || typeof node !== 'object') return acc;
  if (node.id != null) acc.add(String(node.id));
  for (const c of Array.isArray(node.children) ? node.children : []) collectNodeIds(c, acc);
  return acc;
}

/**
 * 段是否是**图表本体段**。
 *
 * 🔴 必须先要求「有真值锚」：真机 `chart-legend` 的 `type` 也是 `'chart'`（vision 把图例标成
 *   图表类），若只认 type 就会把图例本身当成「图表段」而跳过归并（首版实测 merged=1/2）。
 *   图表本体一定锚在 Figma 真值节点上（`2:7898` / `@echarts/line`），合成段必无锚。
 */
function isChartSection(section, figmaById, ids) {
  if (!section) return false;
  const fid = section.figmaNodeId ?? section.figmaNode;
  const node =
    (fid != null && figmaById.get(String(fid))) ||
    (section.id != null && figmaById.get(String(section.id))) ||
    null;
  if (!node || !ids.has(String(node.id))) return false; // 无真值锚 ⇒ 不是图表本体
  if (TECHSTACK_CHART_RE.test(String(node.name || ''))) return true;
  return String(section.type || '').toLowerCase() === 'chart';
}

/** 建 id → 节点 索引（含 name，用于技术栈标记判定） */
function indexFigmaById(node, acc = new Map()) {
  if (!node || typeof node !== 'object') return acc;
  if (node.id != null) acc.set(String(node.id), node);
  for (const c of Array.isArray(node.children) ? node.children : []) indexFigmaById(c, acc);
  return acc;
}

/**
 * @param {Array} sections 顶层段数组（planner 的 effectiveSections）
 * @param {Object} figmaNodeData Figma 节点树（可含 `{document}` 包裹）
 * @returns {{sections: Array, stats: {evaluated:number, merged:number, mergedIds:string[], details:Array}}}
 */
export function mergeChartInnerSections(sections, figmaNodeData) {
  const stats = { evaluated: 0, merged: 0, mergedIds: [], details: [] };
  if (!Array.isArray(sections) || sections.length < 2 || !figmaNodeData) {
    return { sections, stats };
  }
  const root = figmaNodeData.document || figmaNodeData;
  let ids;
  let byId;
  try {
    ids = collectNodeIds(root);
    byId = indexFigmaById(root);
  } catch {
    return { sections, stats };
  }
  if (ids.size === 0) return { sections, stats };

  // 图表段高度（同层取最大值，多个图表段时按最大者作分母，保守）
  const chartHeights = sections
    .filter((s) => isChartSection(s, byId, ids))
    .map((s) => sectionHeight(s))
    .filter((h) => h != null);
  if (chartHeights.length === 0) return { sections, stats };
  const chartH = Math.max(...chartHeights);

  const kept = [];
  for (const sec of sections) {
    stats.evaluated += 1;
    if (!sec || typeof sec !== 'object') {
      kept.push(sec);
      continue;
    }
    if (isChartSection(sec, byId, ids)) {
      kept.push(sec);
      continue;
    }
    const fid = sec.figmaNodeId ?? sec.figmaNode;
    const anchored =
      (sec.id != null && ids.has(String(sec.id))) ||
      (fid != null && ids.has(String(fid)));
    // a) 合成段（无真值锚、未标幻觉）
    const synthetic = !anchored && sec.anchorValid !== false;
    if (!synthetic) {
      kept.push(sec);
      continue;
    }
    // c) 几何：必须显著小于图表段
    const h = sectionHeight(sec);
    if (h == null || h > chartH * CHART_INNER_MAX_HEIGHT_RATIO) {
      kept.push(sec);
      continue;
    }
    stats.merged += 1;
    stats.mergedIds.push(String(sec.id ?? sec.title ?? '?'));
    if (stats.details.length < 6) {
      stats.details.push({
        id: String(sec.id ?? '?'),
        title: String(sec.title || ''),
        h,
        chartH,
        ratio: Number((h / chartH).toFixed(3)),
      });
    }
  }
  if (stats.merged === 0) return { sections, stats };
  return { sections: kept, stats };
}
