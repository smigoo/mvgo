/**
 * 🛡️ 图表「缺失类型」判定——判据单一来源（2026-11-17 质量门禁放行策略后续）
 *
 * 病灶：门禁 DO-NOT-INVENT-CHART-MISSING 与生成侧 N2 图表兜底各自组装判据，
 *   口径漂移：
 *   - 门禁看「vision 要的类型 T，全产物有没有 T 的 series」；
 *   - N2 看「产物有没有任何 echarts.init」（code-healer 注入器内部还有同款早退）。
 *   ⇒ 产物有 line、缺 pie：门禁报 WARN，N2 却判「已有 echarts」跳过 → 检测到但不修。
 *
 * 本模块把门禁 2.5 段的组装逻辑抽成唯一函数，门禁与 N2 共用，禁止各自复制正则/组装顺序。
 * 底层归一化与收集函数直接复用 do-not-invent-validator 的同款导出（逐字同源）。
 *
 * 判据（与门禁 2.5 段逐字等价）：
 *   requiredTypes = { normalizeChartType(c.type) | c ∈ charts, 非 null }
 *   generatedTypes = collectChartSeriesTypes(vueContent)
 *   lineSatisfiedByDecl = type==='line' && /series\s*:\s*\[/.test(vueContent)
 *   carriedByText = collectTextCarriedChartTypes(charts, figmaIndex, exemptBlocked)
 *   effectiveCarried = hasEchartsProof ? ∅ : carriedByText   ← R1 产物自证矛盾
 *   missing = requiredTypes 中不满足 generatedTypes∪lineDecl∪effectiveCarried 的类型
 *
 * 🛡️ G1 收紧（2026-11-18）：R1 必须落在本函数（只有这里拿得到产物 content），
 * R2/R3/R4 落 chart-type-detection.js。四层计数 exemptBlocked 恒在，零命中也打 0。
 */
import {
  normalizeChartType,
  collectChartSeriesTypes,
  collectTextCarriedChartTypes,
} from './chart-type-detection.js';
import { indexFigmaNodes } from './section-tree.js';

/**
 * @param {object} opts
 * @param {Array}  [opts.charts]        vision charts（{type, section, series, legend, ...}）
 * @param {Record<string,string>} [opts.files] 文件名→内容（含 .vue 子组件）
 * @param {string} [opts.vueContent]   已拼接好的 .vue 内容；给了就优先，省去 files 拼接
 * @param {object} [opts.figmaNodeData] Figma 树（用于文字卡承载豁免）
 * @param {Map|null} [opts.figmaIndex] 已构建的 Figma 索引；给了就优先（门禁惰性构建后复用，避免重复建索引）
 * @returns {{missing: Array<{type:string,chart:object}>, generatedTypes:Set<string>, carriedByText:Set<string>, hasSeriesDecl:boolean, vueContent:string, exemptBlocked:{r1:number,r2:number,r3:number,r4:number}}}
 */
export function findMissingChartTypes({
  charts = [],
  files = {},
  vueContent = null,
  figmaNodeData = null,
  figmaIndex = null,
} = {}) {
  const content =
    typeof vueContent === 'string'
      ? vueContent
      : Object.entries(files || {})
          .filter(([p, c]) => typeof c === 'string' && /\.vue$/.test(p))
          .map(([, c]) => c)
          .join('\n');

  const generatedTypes = collectChartSeriesTypes(content);
  const hasSeriesDecl = /series\s*:\s*\[/.test(content);

  // 惰性构建 Figma 索引：调用方已构建则复用；无 figmaNodeData / 构建失败 ⇒ 空集（fail-open，不豁免）
  let resolvedIndex = figmaIndex;
  if (!resolvedIndex && figmaNodeData) {
    try {
      resolvedIndex = indexFigmaNodes(figmaNodeData?.document ?? figmaNodeData);
    } catch {
      resolvedIndex = null;
    }
  }
  // 四层判据计数（恒在；R2/R3/R4 由 detection 层累加，R1 在本函数累加）
  const exemptBlocked = { r1: 0, r2: 0, r3: 0, r4: 0 };
  const carriedByText = collectTextCarriedChartTypes(charts, resolvedIndex, exemptBlocked);

  // R1 产物自证矛盾：产物已在用 echarts 画图（init 或 series 声明）却缺该类型，
  // 「该类型由文字承载」与产物行为自相矛盾 ⇒ 禁用豁免。只在本层做（detection 无 content）。
  // 边界：真文字卡产物无 echarts ⇒ 豁免保留（T1 反例）。
  const hasEchartsProof = /echarts\s*\.\s*init\s*\(/.test(content) || hasSeriesDecl;
  if (hasEchartsProof && carriedByText.size > 0) exemptBlocked.r1 = carriedByText.size;
  const effectiveCarriedByText = hasEchartsProof ? new Set() : carriedByText;

  const missing = [];
  const seen = new Set();
  for (const chart of Array.isArray(charts) ? charts : []) {
    const type = normalizeChartType(chart?.type);
    if (!type || seen.has(type)) continue;
    seen.add(type);
    const satisfied =
      generatedTypes.has(type) ||
      (type === 'line' && hasSeriesDecl) ||
      effectiveCarriedByText.has(type);
    if (!satisfied) missing.push({ type, chart });
  }

  return {
    missing,
    generatedTypes,
    carriedByText: effectiveCarriedByText,
    hasSeriesDecl,
    vueContent: content,
    exemptBlocked,
  };
}

/**
 * 🛡️ 承载文件定位——单一来源（2026-11-17 可观测性改造）
 *
 * 病灶：2.5 段 DO-NOT-INVENT-CHART-MISSING 的 WARN 把 file 硬编码为 'package/index.vue'、
 *   message 无任何位置信息 ⇒ 用户/开发者看到「缺 pie」却不知道去哪个文件哪个段补，
 *   而 2.7 段 G12b 早有「按 data-section-id 找承载文件」的确定性算法。
 *
 * 本函数抽出该算法供 2.5 / 2.7 共用，杜绝两套定位逻辑漂移。只做可观测性——
 *   绝不注入、不修改产物、不改变判据（missing 仍由 findMissingChartTypes 决定）。
 *
 * 判据（与 2.7 段 G12b 逐字等价）：
 *   第一个「.vue 且内容含 data-section-id="<section>"」的文件 ⇒ 承载文件。
 * fail-open：section 空 / 找不到 ⇒ null（不虚构位置，调用方保留原默认行为）。
 *
 * @param {Record<string,string>} files 产物文件表
 * @param {string|number|null} sectionId vision chart.section
 * @returns {{path:string, content:string}|null}
 */
export function findChartHolderFile(files, sectionId) {
  const sid = sectionId != null ? String(sectionId) : ''
  if (!sid) return null
  const hit = Object.entries(files || {}).find(
    ([p, c]) =>
      typeof c === 'string' && /\.vue$/.test(p) && c.includes(`data-section-id="${sid}"`),
  )
  return hit ? { path: hit[0], content: hit[1] } : null
}
