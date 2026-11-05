/**
 * 🔍 L1 文档同构折叠判据（2026-11-03，方案 docs/2026-11-03-折叠器文档同构判据.md）。
 *
 * 数据源 = docAnalysis.uiElements（S9 文档子管线产物，页面元素表逐行：
 * {name, control, field, api}）。「同 api + 同控件类型」的元素组 = 数据同构的
 * **文档权威声明**，作为 repeated-section-collapser 几何签名之外的第二条折叠证据
 * （三层 OR：L1 文档声明 ∨ L3 几何签名——本模块只负责 L1）。
 *
 * 硬约束：
 * - 名词归一为语言学后缀规则（非业务词特判，命名无关原则不破）；
 * - 几何否决门：核心成员必须同行等高，声明噪声（文档说同构、设计稿差异巨大）不放行；
 * - 本模块为纯函数，无 logger——计数由调用方（planner）挂真机日志行。
 */
import { geoBoxWithRoot } from './repeated-section-collapser.js';

/** 文档页面元素表两行起即构成同构声明（几何路径 minRepeat=3 不受影响） */
const DOC_GROUP_MIN_MEMBERS = 2;
/** 行容差与几何签名同行容差同源（collapser :14「同行 y ±4px」） */
const DOC_ROW_TOLERANCE_PX = 4;
/** 等高容差：三卡案例 74px 等高（今日累计 mc-max-1793639342120-dc888541），±8 覆盖手绘误差 */
const DOC_HEIGHT_TOLERANCE_PX = 8;
/**
 * 文档元素名 → 段名 的数据后缀（实证：页面元素表「危化品车数量」↔ 段树「危化品车」）。
 * 语言学后缀规则，非业务词特判。
 */
const DOC_NAME_SUFFIX_RE = /(数量|值|标签|统计|卡片|卡)+$/;

/** 文档元素名归一：剥数据后缀 + 小写 */
export function normalizeDocElementName(name) {
  return String(name || '').trim().replace(DOC_NAME_SUFFIX_RE, '').toLowerCase();
}

/**
 * 从 docAnalysis 提取「同 api + 同控件类型」的同构组。
 * @returns {Array<{api:string, control:string, nameSet:Set<string>}>}
 */
export function buildDocHomogeneityGroups(docAnalysis) {
  const rows = Array.isArray(docAnalysis?.uiElements) ? docAnalysis.uiElements : [];
  const byKey = new Map();
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const api = String(r.api || '').trim();
    const control = String(r.control || '').trim();
    const norm = normalizeDocElementName(r.name);
    if (!api || !control || !norm) continue;
    const key = `${api}||${control}`;
    if (!byKey.has(key)) byKey.set(key, { api, control, nameSet: new Set() });
    byKey.get(key).nameSet.add(norm);
  }
  // 少于 2 个不同元素名的组不构成「重复」声明
  return Array.from(byKey.values()).filter((g) => g.nameSet.size >= DOC_GROUP_MIN_MEMBERS);
}

/** 弱相似（否决门）：同行 + 等高。box 缺失时按段 id 在 figmaRoot 兜底（geoBoxWithRoot 单一来源）。 */
function geoWeakSimilar(a, b, figmaRoot) {
  const ba = geoBoxWithRoot(a, figmaRoot);
  const bb = geoBoxWithRoot(b, figmaRoot);
  if (!ba || !bb) return false;
  return (
    Math.abs(ba.y - bb.y) <= DOC_ROW_TOLERANCE_PX &&
    Math.abs(ba.h - bb.h) <= DOC_HEIGHT_TOLERANCE_PX
  );
}

/**
 * 对一层兄弟数组做 L1 文档证据分组。
 * @param {Array<object>} sections 同层兄弟段
 * @param {Array} groups buildDocHomogeneityGroups 产物
 * @param {object|null} [figmaRoot] Figma 节点树根——vision sections 无内联 box 时
 *   按 section.id 兜底取 absoluteBoundingBox（真机实证：planner 折叠时机 vision 段
 *   无 box，否则否决门恒 fail-closed 恒不折叠）。
 * @returns {{idxs:number[], api:string, control:string, matched:string[], absorbed:number[]}|null}
 *   matched = 命中文档的段名（原始），absorbed = 几何弱相似并入的段名（原始）。
 */
export function matchDocEvidenceGroup(sections, groups, figmaRoot = null) {
  if (!Array.isArray(sections) || !Array.isArray(groups) || groups.length === 0) return null;
  const normOf = (i) => normalizeDocElementName(sections[i]?.name || '');

  // ① 每段命中哪个组（双向包含：归一后相等，或一方完整包含另一方——
  //    覆盖「危化品车数量」归一后「危化品车」与段名「危化品车」相等之外的残差形态）
  const hit = new Map(); // idx -> group
  for (let i = 0; i < sections.length; i++) {
    if (!sections[i] || typeof sections[i] !== 'object') continue;
    const n = normOf(i);
    if (!n) continue;
    for (const g of groups) {
      const hitInGroup = Array.from(g.nameSet).some(
        (dn) => dn === n || dn.includes(n) || n.includes(dn),
      );
      if (hitInGroup) {
        hit.set(i, g);
        break;
      }
    }
  }

  // ② 取命中数最多的组（须 ≥2 核心成员）
  const byGroup = new Map();
  for (const [idx, g] of hit) {
    const key = `${g.api}||${g.control}`;
    if (!byGroup.has(key)) byGroup.set(key, { group: g, idxs: [] });
    byGroup.get(key).idxs.push(idx);
  }
  let best = null;
  for (const cand of byGroup.values()) {
    if (cand.idxs.length < DOC_GROUP_MIN_MEMBERS) continue;
    if (!best || cand.idxs.length > best.idxs.length) best = cand;
  }
  if (!best) return null;

  // 🔧 拷贝快照：core 必须与 best.idxs 解耦——loop ④ 向 best.idxs 并入新成员时
  //   不得反向污染 matched（引用别名 bug，spec「证据组明细」用例实锤）。
  const core = [...best.idxs];
  for (let a = 0; a < core.length; a++) {
    for (let b = a + 1; b < core.length; b++) {
      if (!geoWeakSimilar(sections[core[a]], sections[core[b]], figmaRoot)) return null;
    }
  }

  // ④ 未命中兄弟段与任一核心成员弱相似 ⇒ 并入（同排同高 = 同一组卡的视觉事实）
  const absorbed = [];
  for (let i = 0; i < sections.length; i++) {
    if (core.includes(i)) continue;
    if (!sections[i] || typeof sections[i] !== 'object') continue;
    if (hit.has(i)) continue; // 命中其他组的段不并入本组
    if (core.some((c) => geoWeakSimilar(sections[i], sections[c], figmaRoot))) {
      best.idxs.push(i);
      absorbed.push(String(sections[i]?.name || ''));
    }
  }
  best.idxs.sort((a, b) => a - b);
  return {
    idxs: best.idxs,
    api: best.group.api,
    control: best.group.control,
    matched: core.map((i) => String(sections[i]?.name || '')),
    absorbed,
  };
}
