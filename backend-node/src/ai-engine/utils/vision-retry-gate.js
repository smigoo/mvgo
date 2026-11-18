/**
 * 🛡️ 2026-11-14：视觉分析「是否重跑」与「择优」判据（纯函数、无依赖、可单测）。
 *
 * 真机事实（同一张图、同一 prompt sha1、temperature=0）：五次运行分别产出 6 / 1 / 8 / 5 / 5 段
 *   ⇒ 非确定性来自服务端；而既有重试只看覆盖率，"只切出 1 段"（coverage 57%）不触发。
 */

// 🔴 单一来源：Figma 节点 id 形态集中在 `section-anchor-truth#FIGMA_ID_RE`
//   （与 vision-anchor-validator / inline-row-merger 同源，禁在本文件另写一份正则）
import { FIGMA_ID_RE } from './section-anchor-truth.js'

/**
 * 🔴 段数契约下界（**单一来源**）。
 *
 * 同一个数同时是「触发重跑」与「择优判优」的门槛，缺一即出现
 * 「因结构塌陷而重跑、又按结构塌陷判优」的裂缝（2026-11-18 真机实锤，见下方 ⓪）。
 * 改这个数必须只改这里 —— `shouldRetryVisionAnalysis` 与
 * `pickBetterVisionAnalysis` 都从这里取，禁另写字面量。
 */
export const VISION_SECTION_CONTRACT_MIN = 3

/** 「段承载字段」清单：这些字段出现的 id 才算「该节点被某个段认领」 */
const SECTION_CARRIER_KEYS = Object.freeze([
  'id',
  'figmaNodeId',
  'anchorId',
  'figmaAnchorId',
  'reanchoredFrom',
])

/**
 * 🛡️ 2026-11-15（mc-max-1794723552731-13daa0e4 实锤）：图表「无段承载」计数。
 *
 * ── 病灶 ────────────────────────────────────────────────────────────────────
 * 同一张图、同一 prompt，vision 这一支只吐 3 个段（全是标题条），把数字卡段与两张
 * 柱状图段整体丢掉；但 `charts[]` / `chartDataHints[]` 仍声明 2 张图，`section` 指向
 * `2:7625` / `2:7794` —— **没有任何段的子树提到这两个 id**。产物只剩两个空标题组件，
 * 却照常标 completed 并发布预览（渲染图几乎全白）。
 *
 * 既有判据为何全漏：
 *   - `validateVisionAnchors` 只判「id 在不在 Figma 树里」（`2:7625` 真实存在 ⇒ 绿灯）；
 *   - `resolveChartSectionAnchors` 会标 `sectionUnresolved`，但真机正常支 **3/3 也全是 true**
 *     （重锚后 section 仍是原锚 id）⇒ 不能当信号；
 *   - `shouldRetryVisionAnalysis` 的段数契约要求 `sections < 3`，本次恰好 3 段 ⇒ 不触发。
 *
 * ── 判据（零阈值、零命名、可辩驳） ───────────────────────────────────────────
 *   声称有 N 张图，就必须至少有一个段「承载」它 —— 否则 vision 自相矛盾：
 *     ① 承载池 = 全部段子树内 `SECTION_CARRIER_KEYS` 出现的 id ∪ 段自身 `charts[].section`
 *        （语义：该节点被某个段认领过）；
 *     ② 对顶层 4 处图表声明（`charts` / `layoutStructure.charts` /
 *        `chartDataHints` / `layoutStructure.chartDataHints`）的 `section`：
 *        - 空 ⇒ 跳过（归属由 `chart-anchor-resolver` 解析，不重复判）；
 *        - Figma id 形态 ⇒ 承载池无此 id 记一个 orphan；
 *        - 非 id 形态 ⇒ 等于某段 `name` 判 ok，否则跳过（合成锚 `chart-N` / `chart-section`
 *          是既有合法机制，本判据不裁决）；
 *     ③ 按 `section` 值去重（同一张图在 4 处重复声明只算一次）。
 *
 * 量化验收（445 支历史任务 corpus，判据落地前跑过）：命中 3 支，全部是「verify」类残缺
 * 任务（含本次实锤）；200 支有图表的正常任务 **0 命中** ⇒ 误伤率 0。
 *
 * 纯函数、零 IO、零副作用（不改入参）。
 *
 * @param {object} analysisResult vision 解析结果（`{charts, chartDataHints, layoutStructure}`
 *   或直接 `{layout:{sections}}` 两种形态都吃）
 * @returns {{evaluated:number, orphans:string[], orphanCount:number}} evaluated=参与判定的
 *   图表声明条目数（去重后），orphans=无段承载的 section 引用
 */
export function countOrphanChartCarriers(analysisResult) {
  const empty = { evaluated: 0, orphans: [], orphanCount: 0 }
  if (!analysisResult || typeof analysisResult !== 'object') return empty

  const layout = analysisResult.layoutStructure || analysisResult
  const sections =
    layout?.layout?.sections || layout?.sections || analysisResult?.layout?.sections || []
  if (!Array.isArray(sections) || sections.length === 0) return empty

  const carriers = new Set()
  const sectionNames = new Set()
  const collectIds = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) collectIds(item)
      return
    }
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && FIGMA_ID_RE.test(value.trim())) {
        carriers.add(value.trim())
      }
      collectIds(value)
    }
  }
  for (const section of sections) {
    if (!section || typeof section !== 'object') continue
    if (section.name) sectionNames.add(String(section.name).trim())
    for (const key of SECTION_CARRIER_KEYS) {
      const value = section[key]
      if (typeof value === 'string' && FIGMA_ID_RE.test(value.trim())) {
        carriers.add(value.trim())
      }
    }
    for (const chart of Array.isArray(section.charts) ? section.charts : []) {
      const ref = String(chart?.section ?? '').trim()
      if (FIGMA_ID_RE.test(ref)) carriers.add(ref)
    }
    // 段内任意层级出现的 id 也算「被该段认领」（含 body/items/elements 等载体）
    collectIds(section)
  }

  const declarations = [
    analysisResult.charts,
    layout.charts,
    analysisResult.chartDataHints,
    layout.chartDataHints,
  ]
  const seen = new Set()
  const orphans = []
  for (const list of declarations) {
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      const ref = String(entry?.section ?? '').trim()
      if (!ref || seen.has(ref)) continue
      seen.add(ref)
      if (FIGMA_ID_RE.test(ref)) {
        if (!carriers.has(ref)) orphans.push(ref)
        continue
      }
      // 非 id 形态：段名匹配视为已承载；其它（合成锚）不裁决
      if (sectionNames.has(ref)) continue
    }
  }

  return { evaluated: seen.size, orphans, orphanCount: orphans.length }
}

/**
 * 🛡️ 2026-11-14 / 2026-11-15 扩展：视觉分析「是否重跑」判据（纯函数，易测）。
 *
 * 真机事实（同一张图、同一 prompt sha1、temperature=0）：五次运行分别产出
 * 6 / 1 / 8 / 5 / 5 段 —— 服务端非确定性。既有重试只看覆盖率，1 段那种退化
 * （coverage 57%）不触发，于是"只切出一段"的分析被当正常结果派工。
 *
 * 原判据：覆盖率判 LOW_COVERAGE **或** 段数 < `minSections`（且真值叶段 ≥ `minSections`）。
 * 🛡️ 2026-11-15 增补第三支：`orphanCharts > 0`（图表声明无段承载 ⇒ 自相矛盾）。
 *   段数契约要求 `< 3`，而本次残缺支恰好 3 段（全是标题条）⇒ 差一，故必须补这条。
 */
export function shouldRetryVisionAnalysis({
  sections = 0,
  truthLeafSections = 0,
  lowCoverage = false,
  orphanCharts = 0,
  minSections = VISION_SECTION_CONTRACT_MIN,
} = {}) {
  const few = Number(sections) < Number(minSections) && Number(truthLeafSections) >= Number(minSections);
  const orphaned = Number(orphanCharts) > 0;
  return { retry: Boolean(lowCoverage) || few || orphaned, fewSections: few, orphanCharts: orphaned };
}

/**
 * 🛡️ 择优（**分层裁决**，不再用单一加权分数）。
 *
 * ━━━ 事故（2026-11-15 · mc-max-1794727523599-4b4b4449）━━━
 * 旧实现 `sections*1000 + rate - orphans*1e6` 让 orphan 单项压过一切：
 *   首支 `sections=1 / rate=83 / orphans=0`，重试支 `sections=8 / rate=90 / orphans=2`
 *   ⇒ 因为 `2*1e6 > 7*1000 + 7`，**选了 1 段那支**（结构只剩一个内容容器），
 *   随后 acceptance 必然 FAIL（`E3-v4` 背景错挂祖先段 / `D1` 缺「流量监测」标题），
 *   最终 `DO-NOT-INVENT-CHART-MOUNT-MISSING` 硬失败、零产物。
 *   即：把「更完整的结构」判成了「更差」，orphan 是**软信号**却给了**硬否决权**。
 *
 * ━━━ 分层判据（层级从硬到软）━━━
 * ⓪ **结构性塌陷否决权**：任一侧段数低于结构契约下界 `VISION_SECTION_CONTRACT_MIN`(3)
 *    且两侧不等 ⇒ **段数多者胜**，覆盖率无权补。
 *    机理：`coverageRate` 是**元素召回**口径（`visual-parser.js` 中
 *    `coreMatched/(coreMatched+coreMissing)`），与**段结构正交** ——
 *    把 N 个元素全塞进 1 个容器，召回仍可 100%；拆成多段时丢几个元素反而更低。
 *    故段数差 < `SECTION_GAP_DECISIVE`(2) 时若改由覆盖率裁决，会把「塌陷版」判成更优。
 *    〖真机事故 2026-11-18 · mc-max-1795012976783-9778c031〗
 *      first=`sections:1 / rate:100`，retry=`sections:2 / rate:67`
 *      ⇒ 旧逻辑走 ②（|67-100|=33 ≥ 2）选 `'first'` ⇒ 保留塌陷版 ⇒
 *        planner 只出 1 段（`contract-audit sections:1`）⇒ 确定性模板
 *        `sectionRoots:1` 且该唯一段是图表段（`chartOwned`）⇒ `<div class="…-slot-con">` 空壳、零子组件。
 *    可达性论证（防误伤）：此支只在「重跑已被触发」时生效，而重跑由
 *      `sections<3 且真值叶段≥3` / `lowCoverage` / `orphanCharts` 三支之一触发；
 *      若首支 `sections<3`，则其相对真值已结构性塌陷，段数更多者严格更接近真值。
 * ① **结构完整性**：段数差 ≥ `SECTION_GAP_DECISIVE`(2) ⇒ 段数多者胜。
 *    差 1 段可能只是过度切分（一张卡被切成两段），故不作为决定性证据；
 *    差 ≥2 才说明**少了一整个区块**。
 * ② **覆盖率**：段数同档时比 `rate`，差 ≥ `RATE_GAP_DECISIVE`(2) 个百分点才分胜负
 *    （VLM 覆盖率本身有 ±1pp 抖动）。
 * ③ **自相矛盾**：以上都同档才用 `orphans` 破平（少者胜）—— 它是软信号，
 *    无权抹平结构差异。
 * ④ 仍完全同档（含缺字段）：段数多者胜，再退 `rate` 高者胜（与旧行为的
 *    「无 orphan 字段时段数优先」一致）。
 *
 * 幂等/纯函数：不读写外部状态，同输入同输出。
 *
 * @param {{sections?:number, rate?:number, orphans?:number}} first
 * @param {{sections?:number, rate?:number, orphans?:number}} retry
 * @returns {'retry'|'first'}
 */
const SECTION_GAP_DECISIVE = 2;
const RATE_GAP_DECISIVE = 2;

export function pickBetterVisionAnalysis(first, retry) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const secA = num(first?.sections);
  const secB = num(retry?.sections);
  const rateA = num(first?.rate);
  const rateB = num(retry?.rate);
  const orA = num(first?.orphans);
  const orB = num(retry?.orphans);

  // ⓪ 结构性塌陷否决权（见上方 ⓪ 段：覆盖率与段结构正交，无权补塌陷）
  if (secA !== secB && Math.min(secA, secB) < VISION_SECTION_CONTRACT_MIN) {
    return secB > secA ? 'retry' : 'first';
  }
  // ① 结构完整性优先
  if (Math.abs(secB - secA) >= SECTION_GAP_DECISIVE) return secB > secA ? 'retry' : 'first';
  // ② 覆盖率
  if (Math.abs(rateB - rateA) >= RATE_GAP_DECISIVE) return rateB > rateA ? 'retry' : 'first';
  // ③ 自相矛盾（软信号，只破平）
  if (orA !== orB) return orB < orA ? 'retry' : 'first';
  // ④ 完全同档
  if (secB !== secA) return secB > secA ? 'retry' : 'first';
  return rateB >= rateA ? 'retry' : 'first';
}
