/**
 * 🧱 段粒度过粗的局部 E1 展开（V-5 · 2026-11-08 · mc-1794128973091-c3fe924f 实锤）。
 *
 * ── 病灶 ────────────────────────────────────────────────────────────────────
 * 同一 Figma 节点（`2:8417 cp-设备监测`）三次生成，vision 给出**三套不同粒度**的段树：
 *
 *   | 段数 | 段划分 | 产物 |
 *   |---|---|---|
 *   | 4 | `2:8419 / 89:38 / 2:8439 / 2:8438` | 单卡+单卡底图被当段 → 刀53 覆盖 CardGrid，12 卡全丢 |
 *   | 3 | `2:8419 / 2:8787 / 89:37` | **合格**：12 卡齐全、左侧分类栏完整、高度对 |
 *   | 2 | `2:8419 / 89:40`（整块内容区） | LLM 把整块画成一张大卡，12 卡网格丢失 |
 *
 * 既有 `structure-source` 闸门只判「锚点是否存在」（`hasAnchoredContent`）：`89:40`
 * 是根槽容器、锚点有效 ⇒ 闸门放行 ⇒ 粗粒度骨架直入下游。**锚点存在 ≠ 锚点粒度合理。**
 *
 * ── 判据（几何事实，零命名/零业务值） ───────────────────────────────────────
 * 段锚点 `A` 判为「过粗容器」，当且仅当其直接子容器中存在 ≥2 个同时满足：
 *   ① 沿垂直方向**依次堆叠**（y 升序、相邻不重叠）；
 *   ② 该堆叠序列在垂直方向**覆盖 `A` 高度的 ≥80%**（说明 A 就是这一串区块的外壳）；
 *   ③ 每个高度 ≥ `A` 高的 10%（排除 header 细条/装饰条）；
 *   ④ 每个子树有实质内容（有文本，或节点数 ≥5；排除纯装饰层）。
 *
 * ▸ 为什么不要求「铺满 A 的宽度」：真机 `89:40` 的两个子是 `89:38`（396×65 switch，
 *   铺满）与 `89:37`（46×317，**只有 46 宽**——Figma 里它是左竖 tab 条，横向 auto-layout
 *   把 bbox 报成条宽而不是整行宽）。要求铺满会漏掉这个真实形态。
 *
 * ▸ 为什么不误伤「卡片内 title + body」：`TEXT` 节点不是容器类型，被 ① 的类型过滤排除；
 *   且要求堆叠序列覆盖 A 高 80%，普通卡片内的分区很难满足。
 *
 * ── 🔴 2026-11-11 根因 D 治理（`docs/2026-11-11-组件生成根因治理改动清单.md` §1.4） ──
 * 上面四条判据对**最普通的业务段结构**（段标题条 + 段内容）**恒真**，实测
 * `2:3438 "slot-车型分布"`（387×142 = `2:3439 sub-header` 24.34 + `1263:38 con` 114，
 * 垂直堆叠覆盖 100%）被判过粗拆开 ⇒ 142px 段被抹成两个零 flex 兄弟、比例语义丢失、
 * 面板标题槽被业务小标题占位、挂载契约锚点重排（mc-max-1794360981835-f596dd2d 实锤）。
 * 本文件同批新增四件事：
 *   ① `section-header-body-pattern` 豁免 —— 「细标题条 + 一个占据主体面积的内容体」= 已是最小业务段；
 *   ② `section-has-declared-semantics` 豁免 —— 段已显式声明内部结构（`headerRelation`）时不许重推；
 *   ③ **展开产物必须补齐 `layoutMetadata`**（`applyFigmaHeightGrow` 的 `if (!meta) continue`
 *      是唯一入口，缺它 ⇒ 展开段在归一化/prompt/方向判定整条下游链上隐形）；
 *   ④ 展开后**自检回滚**（推导结果若仍是「标题条 + 内容体」，视为误拆，保留原段）。
 *      2026-11-11 修：该判据初版复用 ① 的 `looksLikeSectionHeaderBody`，因「恰好 2 段」前置而
 *      **恒不可达**（实测把 36px 细标题条 + 两个内容块拆成 3 段、自检零拦截）。现改为
 *      `detectHeaderBandOverExpansion`——只看「候选层否认、推导层却提升」的差集块。
 *
 * ── 处置 ────────────────────────────────────────────────────────────────────
 * 命中 ⇒ 用 **既有** `deriveSectionsFromFigmaTree({ document: 锚点节点 })` 局部递归展开
 * （同一函数、同一判据族，不写第二套结构推导），结果替换原段并留痕。
 * fail-open：展开为空 / 子段数越界 / 子段有锚点无法解析 / 自检未过 ⇒ 保留原段。
 */
import { deriveSectionsFromFigmaTree, getFigmaBox, indexFigmaNodes } from './section-tree.js'
import { FIGMA_ID_RE, sectionAnchorKey } from './section-anchor-truth.js'
// 🔴 单一事实源（根治理硬要求）：`layoutMetadata` 的形状只由本模块定义，展开器**不得**另写一套。
//   两处键名一旦漂移，展开段会在 `applyFigmaHeightGrow` / prompt 高度块里**再次静默隐形**。
import { extractLayoutMetadata } from './layout-metadata.js'

/** 堆叠序列需覆盖锚点高度的比例 */
const VERTICAL_COVER_RATIO = 0.8

/** 相邻兄弟允许的重叠容差（占锚点高度比例）——Figma 边框/阴影常造成 1~3px 交叠 */
const STACK_OVERLAP_TOL_RATIO = 0.02

/** 子容器最小高度占比（排除横向细条/分隔条） */
const MIN_SIZE_RATIO = 0.1

/** 过粗容器至少有的子容器数 */
const MIN_COARSE_CHILDREN = 2

/** 单段展开后的最大子段数（防段数爆炸） */
const MAX_EXPANDED = 4

/** ① 段标题条最大高度占比（超过即不是「条」，而是并列区块） */
const HEADER_BAR_MAX_HEIGHT_RATIO = 0.25

/** ① 内容体最小高度占比 / 最小面积占比（证明它才是该段的主体） */
const BODY_MIN_HEIGHT_RATIO = 0.5
const BODY_MIN_AREA_RATIO = 0.5

/** ① 标题条与内容体之间的最大间隙（占锚点高度） */
const HEADER_BODY_GAP_RATIO = 0.08

/** ① 数字主导文本判定阈值（可见字符里数字/符号的占比） */
const NUMERIC_DOMINANT_RATIO = 0.5

/** 命中即「豁免」而非「判否」的 reason（豁免要单独留痕，判否不用） */
const EXEMPT_REASONS = new Set(['section-header-body-pattern', 'section-has-declared-semantics'])

const CONTAINER_TYPES = new Set(['FRAME', 'GROUP', 'INSTANCE', 'COMPONENT', 'COMPONENT_SET'])

function isContainer(node) {
  return CONTAINER_TYPES.has(String(node?.type || '').toUpperCase())
}

/** 子树是否有实质内容（有文本，或节点数够多） */
function hasSubstance(node) {
  let texts = 0
  let total = 0
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    total += 1
    if (typeof n.characters === 'string' && n.characters.trim()) texts += 1
    for (const c of Array.isArray(n.children) ? n.children : []) walk(c)
    if (total > 500) return
  }
  walk(node)
  return texts >= 1 || total >= 5
}

/** 收集子树文本（Figma TEXT 节点或带非空 `characters` 的节点） */
function collectTexts(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (typeof node.characters === 'string' && node.characters.trim()) out.push(node.characters)
  for (const c of Array.isArray(node.children) ? node.children : []) collectTexts(c, out)
  return out
}

/**
 * 文本是否为「数字主导」（`22350` / `98.5%` / `12/34`）——数字块是 KPI 指标条，不是段标题。
 * 标题（`车型分布` / `流量预测` / `江阴靖江长江隧道`）数字占比为 0，不受影响。
 */
function isNumericDominantText(value) {
  const s = String(value ?? '').replace(/\s+/g, '')
  if (!s) return false
  const numeric = (s.match(/[\d.,%+\-~×*/]/g) || []).length
  return numeric / s.length >= NUMERIC_DOMINANT_RATIO
}

/**
 * 段自身是否已显式声明内部结构（vision 已就「这一段内部怎么排」发言）。
 *
 * 🔴 只认**结构声明**，不认自由文本：`body.responsibility` 是「这一段是什么」的描述
 *   （`当日总流量（请按功能拆分）` 这类粗段同样带），拿它当「内部结构已声明」的证据
 *   会让展开器在生产语料上**恒不触发**（等于用一个更宽的 bug 换掉这个 bug）。
 *
 * @returns {string} 命中的声明类型；空串 = 未声明
 */
export function hasDeclaredSectionSemantics(section) {
  if (!section || typeof section !== 'object') return ''
  if (section.headerRelation) return 'header-relation'
  if (section.body && section.body.headerRelation) return 'body-header-relation'
  return ''
}

/**
 * 「段标题条 + 段内容体」结构指纹（零命名、零业务值）。
 *
 * 命中即说明该锚点**已是最小业务段**：细条是它的标题栏，内容体是它的主体，
 * 拆开只会把标题条变成假 header、把比例语义抹平。实测两例：
 *   · `2:3438 slot-车型分布`：标题条 86×24.34（22% 宽 / 17% 高）+ 内容体 387×114（100% 宽、面积 80%）
 *   · `83:30 slot-流量预测`：标题条 378×24.34（100% 宽 / 14% 高）+ 内容体 363×140.66（面积 78%）
 * 而真机过粗样本 `89:40`（switch 396×65 + 左竖 tab 46×317）内容体面积仅 **9.4%**
 * ⇒ 自然不命中，判据不退化。
 *
 * @param {Array<{id:string, box:{x:number,y:number,w:number,h:number}, node:object}>} sorted 按 y 升序的候选子块
 * @param {{w:number,h:number}} ab 锚点盒
 * @param {object} [anchorNode] 锚点原始节点（用于取子树文本；缺省则用 sorted[].node）
 */
export function looksLikeSectionHeaderBody(sorted, ab, anchorNode = null) {
  if (!Array.isArray(sorted) || sorted.length !== 2) return false
  if (!ab || !(ab.w > 0) || !(ab.h > 0)) return false
  const [head, body] = sorted
  if (!head?.box || !body?.box) return false
  // ① 首块是细条（占比 ≤25%），且它排在内容体之前（sorted 已按 y 升序）
  if (head.box.h > ab.h * HEADER_BAR_MAX_HEIGHT_RATIO) return false
  // ② 细条子树里有文字，且不是数字主导的指标（KPI 数字块常以细条形态出现，不是标题）
  const headNode = head.node || anchorNode?.children?.find?.((c) => String(c?.id ?? '') === head.id) || null
  const headTexts = collectTexts(headNode)
  if (headTexts.length === 0) return false
  if (headTexts.some(isNumericDominantText)) return false
  // ③ 内容体才是该段的主体：高度 ≥50% 且面积 ≥50%
  if (body.box.h < ab.h * BODY_MIN_HEIGHT_RATIO) return false
  if ((body.box.w * body.box.h) / (ab.w * ab.h) < BODY_MIN_AREA_RATIO) return false
  // ④ 内容体紧接细条下方（同一堆叠带内，不是隔着大段留白的两个独立区块）
  const gapTol = Math.max(4, ab.h * HEADER_BODY_GAP_RATIO)
  if (body.box.y > head.box.y + head.box.h + gapTol) return false
  return true
}

/**
 * ④ 自检回滚判据：推导结果是否**超出了候选层的粒度主张**（把候选层否认的标题条拆成了段）。
 *
 * 🔴 为什么不能复用 ① 的 `looksLikeSectionHeaderBody`（2026-11-11 实测，原 ④ 是**不可达死代码**）：
 *   该判据首行 `sorted.length !== 2 ⇒ false`。而
 *     · **恰好 2 个直接子**时，锚点候选集合与推导集合等价（推导层只额外剔除 bg 层）
 *       ⇒ 两层跑同一判据必然同结论 ⇒「① 未豁免」蕴含「④ 不回滚」；
 *     · 推导层段数 ≠ 2 时判据直接 false（`section-tree` 顶层循环对根的直接子**无条件**成段，
 *       细标题条照样进段 ⇒ 3 段）。
 *   ⇒ 自检一次都不会拦。实测形态：`36px 细标题条 + 两个 180px 内容块` 被拆成
 *   `[36, 180, 180]` 三个兄弟段，标题条成了零 flex 独立段、段内比例语义丢失。
 *
 * 本判据只盯**差集**（推导层新增、而候选层否认的那一个块），且必须同时具备标题条特征：
 *   ① 它排在首位（y 最小）且高度 ≤ 锚点高 25%（是「条」，不是与内容并列的区块）；
 *   ② 候选层（`isOverCoarseAnchor` 的 `childIds`）**不含**它（本被视为装饰层/过细层）；
 *   ③ 子树有可读文本且非数字主导（KPI 数字条不是标题）；
 *   ④ 其余各块合并覆盖锚点高 ≥80%（说明它就是整段的标题栏）。
 * 真机 `89:40`（switch 65 + 左竖 tab 317）两个子都在候选层内 ⇒ 不命中，判据不退化；
 * 三个等高区块（首块 33% > 25%）⇒ 不命中，正常展开。
 *
 * @param {Array<{id:string, box:{x:number,y:number,w:number,h:number}, node:object}>} kidStack 推导结果（y 升序）
 * @param {{w:number,h:number}} ab 锚点盒
 * @param {Set<string>} candidateIds 候选层认可的块 id
 * @param {object} [anchorNode] 锚点原始节点（取子树文本兜底）
 * @returns {{ reason: string, headId: string, covered: number }|null}
 */
export function detectHeaderBandOverExpansion(kidStack, ab, candidateIds, anchorNode = null) {
  if (!Array.isArray(kidStack) || kidStack.length < 2) return null
  if (!ab || !(ab.h > 0) || !(ab.w > 0)) return null
  const head = kidStack[0]
  if (!head?.box) return null
  // ② 候选层否认它才算「被过滤掉的一层」
  if (candidateIds && candidateIds.has(String(head.id))) return null
  // ① 是「条」而不是并列区块
  if (head.box.h > ab.h * HEADER_BAR_MAX_HEIGHT_RATIO) return null
  // ③ 承载可读的非数字文本（标题）
  const headNode =
    head.node || anchorNode?.children?.find?.((c) => String(c?.id ?? '') === String(head.id)) || null
  const headTexts = collectTexts(headNode)
  if (headTexts.length === 0) return null
  if (headTexts.some(isNumericDominantText)) return null
  // ④ 其余块合并覆盖锚点高 ≥80%
  const rest = kidStack.slice(1).filter((k) => k?.box)
  if (rest.length === 0) return null
  const top = Math.min(...rest.map((k) => k.box.y))
  const bottom = Math.max(...rest.map((k) => k.box.y + k.box.h))
  const covered = Math.min(1, (bottom - top) / ab.h)
  if (covered < VERTICAL_COVER_RATIO) return null
  return { reason: 'expanded-header-band', headId: String(head.id), covered }
}

/**
 * 判断锚点节点是否为「过粗容器」（其子是一串垂直堆叠、共同覆盖锚点高度的区块）。
 * @param {object} anchorNode Figma 原始节点
 * @param {object} [section] 该锚点对应的 planner 段（用于「已声明内部语义」豁免）
 * @returns {{ over: boolean, reason: string, childIds?: string[], covered?: number }}
 */
export function isOverCoarseAnchor(anchorNode, section = null) {
  if (!anchorNode || typeof anchorNode !== 'object') return { over: false, reason: 'no-anchor' }
  // ② 已有内部结构声明 ⇒ 不重推（展开器只该处理「无内部语义的粗段」）
  const declared = hasDeclaredSectionSemantics(section)
  if (declared) return { over: false, reason: 'section-has-declared-semantics', declared }

  const kids = (Array.isArray(anchorNode.children) ? anchorNode.children : []).filter(isContainer)
  if (kids.length < MIN_COARSE_CHILDREN) {
    return { over: false, reason: 'too-few-container-children' }
  }
  const ab = getFigmaBox(anchorNode)
  if (!ab || ab.w <= 0 || ab.h <= 0) return { over: false, reason: 'no-anchor-box' }
  const areaA = ab.w * ab.h

  const candidates = []
  for (const k of kids) {
    const b = getFigmaBox(k)
    if (!b) continue
    // 只按「高度占比」筛：真机 `89:37` 是 46×317 的左竖 tab 条，面积仅占 9.4%，
    //   用面积阈值会把它滤掉 → 只剩 1 个候选 → 过粗漏判（实锤 substantial-children=1）。
    //   横向细条由高度占比自然排除，装饰块由 hasSubstance 排除，故不再叠面积约束。
    if (b.h < ab.h * MIN_SIZE_RATIO) continue
    if (!hasSubstance(k)) continue
    candidates.push({ id: String(k.id ?? ''), box: b, node: k, areaRatio: (b.w * b.h) / areaA })
  }
  if (candidates.length < MIN_COARSE_CHILDREN) {
    return { over: false, reason: `substantial-children=${candidates.length}` }
  }

  const sorted = [...candidates].sort((a, b) => a.box.y - b.box.y)
  const overlapTol = Math.max(2, ab.h * STACK_OVERLAP_TOL_RATIO)
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1].box
    if (sorted[i].box.y < prev.y + prev.h - overlapTol) {
      return { over: false, reason: 'not-vertically-stacked' }
    }
  }
  const top = sorted[0].box.y
  const bottom = Math.max(...sorted.map((c) => c.box.y + c.box.h))
  const covered = Math.min(1, (bottom - top) / ab.h)
  if (covered < VERTICAL_COVER_RATIO) {
    return { over: false, reason: `vertical-cover=${covered.toFixed(2)}` }
  }
  if (sorted.length > MAX_EXPANDED) {
    return { over: false, reason: `too-many-children=${sorted.length}` }
  }
  // ① 段标题条 + 段内容体 ⇒ 已是最小业务段（无内部语义可推，拆它只有损）
  if (looksLikeSectionHeaderBody(sorted, ab, anchorNode)) {
    return { over: false, reason: 'section-header-body-pattern', covered }
  }
  return { over: true, reason: 'coarse-container', childIds: sorted.map((c) => c.id), covered }
}

/**
 * 方向事实（零猜测）：布局模式优先；缺失时按**子块 y 单调性**判定真实堆叠方向。
 * @returns {'horizontal'|'vertical'|null} null = 无事实（不得臆造）
 */
function resolveDirectionFact(rawNode) {
  const mode = String(rawNode?.layoutMode || '').toUpperCase()
  if (mode === 'HORIZONTAL') return 'horizontal'
  if (mode === 'VERTICAL') return 'vertical'
  const boxes = (Array.isArray(rawNode?.children) ? rawNode.children : [])
    .map((c) => c?.absoluteBoundingBox)
    .filter((b) => b && Number(b.height) > 0)
  if (boxes.length < 2) return null
  const ordered = [...boxes].sort((a, b) => Number(a.y) - Number(b.y))
  const tol = 2
  const stacked = ordered.every(
    (b, i) => i === 0 || Number(b.y) >= Number(ordered[i - 1].y) + Number(ordered[i - 1].height) - tol,
  )
  return stacked ? 'vertical' : 'horizontal'
}

/**
 * 用 Figma 真值节点重建展开子段的 `layoutMetadata`。
 *
 * 🔴 只**供事实**，构造仍走共享 `extractLayoutMetadata`（键契约单一事实源）。
 *   缺 `layoutMetadata` 的后果（实测）：`applyFigmaHeightGrow` L2454 `if (!meta) continue`
 *   ⇒ 该段参与均值却写不回比例 ⇒ `flexGrow` 恒 0；`microcode-engineer` 的高度/间距/方向
 *   三个通道同时空转。
 */
function buildExpandedLayoutMetadata(rawNode, kid) {
  const rawBox = rawNode?.absoluteBoundingBox || null
  const fallbackBox = kid?.absoluteBoundingBox || null
  const abs =
    rawBox && Number(rawBox.height) > 0
      ? rawBox
      : fallbackBox && Number(fallbackBox.height) > 0
        ? fallbackBox
        : null
  const synthetic = {
    layout: resolveDirectionFact(rawNode),
    absoluteBoundingBox: abs,
    children: (Array.isArray(rawNode?.children) ? rawNode.children : []).map((c) => ({
      absoluteBoundingBox: c?.absoluteBoundingBox || null,
    })),
    styles: { flexGrow: kid?.styles?.flexGrow },
  }
  return extractLayoutMetadata(synthetic)
}

/**
 * 对过粗段做局部 E1 展开（复用 section-tree#deriveSectionsFromFigmaTree）。
 *
 * @param {Array<object>} sections planner effectiveSections
 * @param {object} figmaRoot Figma 真值树（或 { document }）
 * @returns {{ sections: Array<object>, stats: {
 *   evaluated: number, sections: number, expanded: number, skippedReason: string,
 *   exempted: number, exemptReasons: string[],
 *   details: Array<{sectionId:string, from:string, to:string[], reason:string, covered:number}>
 * }}}
 */
export function expandOverCoarseSections(sections, figmaRoot) {
  const stats = {
    evaluated: 0,
    sections: Array.isArray(sections) ? sections.length : 0,
    expanded: 0,
    skippedReason: '',
    exempted: 0,
    exemptReasons: [],
    details: [],
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    stats.skippedReason = 'no-sections'
    return { sections, stats }
  }
  const root = figmaRoot?.document || figmaRoot
  if (!root || typeof root !== 'object') {
    stats.skippedReason = 'no-figma-data'
    return { sections, stats }
  }
  const index = indexFigmaNodes(root)
  if (index.size === 0) {
    stats.skippedReason = 'empty-figma-index'
    return { sections, stats }
  }

  const out = []
  let changed = false
  const rejectReasons = []
  for (const sec of sections) {
    stats.evaluated += 1
    const key = sectionAnchorKey(sec)
    if (!key || !FIGMA_ID_RE.test(key)) {
      out.push(sec)
      continue
    }
    const anchor = index.get(String(key))?.rawNode
    const verdict = isOverCoarseAnchor(anchor, sec)
    if (!verdict.over) {
      rejectReasons.push(`${key}:${verdict.reason}`)
      if (EXEMPT_REASONS.has(verdict.reason)) {
        stats.exempted += 1
        stats.exemptReasons.push(`${key}:${verdict.reason}`)
      }
      out.push(sec)
      continue
    }
    // 局部 E1：把锚点节点当作根，复用同一递归推导
    let derived = null
    try {
      derived = deriveSectionsFromFigmaTree({ document: anchor })
    } catch {
      derived = null
    }
    const kids = Array.isArray(derived?.sections) ? derived.sections : []
    if (kids.length < MIN_COARSE_CHILDREN || kids.length > MAX_EXPANDED) {
      rejectReasons.push(`${key}:derived=${kids.length}`)
      out.push(sec)
      continue
    }
    const allAnchored = kids.every((k) => {
      const kk = sectionAnchorKey(k)
      return kk && FIGMA_ID_RE.test(kk) && index.has(String(kk))
    })
    if (!allAnchored) {
      rejectReasons.push(`${key}:derived-unanchored`)
      out.push(sec)
      continue
    }

    // ④ 展开后自检：推导结果若仍是「标题条 + 内容体」，说明拆错了（把最小业务段拆开）
    const anchorBox = getFigmaBox(anchor)
    const kidStack = kids
      .map((k) => {
        const kk = sectionAnchorKey(k)
        const rawNode = index.get(String(kk))?.rawNode || null
        const box = getFigmaBox(rawNode) || getFigmaBox(k)
        return box ? { id: String(k.id ?? ''), box, node: rawNode, kid: k } : null
      })
      .filter(Boolean)
      .sort((a, b) => a.box.y - b.box.y)
    // ④-a 同判断据集群（与 ① 同源）：恰好 2 段且正是「标题条 + 内容体」
    if (looksLikeSectionHeaderBody(kidStack, anchorBox, anchor)) {
      rejectReasons.push(`${key}:expanded-looks-like-header`)
      out.push(sec)
      continue
    }
    // ④-b 差集自检（**这条才是实际生效的那条**）：推导层把候选层否认的细标题条提成了段
    //   ⇒ 回滚保留原段。理由见 `detectHeaderBandOverExpansion` 头注释（原实现不可达）。
    const candidateIds = new Set((Array.isArray(verdict.childIds) ? verdict.childIds : []).map(String))
    const bandOver = detectHeaderBandOverExpansion(kidStack, anchorBox, candidateIds, anchor)
    if (bandOver) {
      rejectReasons.push(`${key}:${bandOver.reason}`)
      stats.exempted += 1
      stats.exemptReasons.push(`${key}:${bandOver.reason}`)
      out.push(sec)
      continue
    }

    for (const k of kids) {
      const kk = sectionAnchorKey(k)
      const rawNode = index.get(String(kk))?.rawNode || null
      const kb = getFigmaBox(rawNode)
      if (kb) {
        // 几何真值回填（`deriveSectionsFromFigmaTree` 只写 figmaHeightPx，不写 bbox）
        k.absoluteBoundingBox = rawNode?.absoluteBoundingBox || {
          x: kb.x,
          y: kb.y,
          width: kb.w,
          height: kb.h,
        }
        k.styles = { ...(k.styles || {}), figmaHeightPx: kb.h }
      }
      // ③ 无条件补齐下游契约元数据（与 ①② 独立：真展开场景同样需要）
      k.layoutMetadata = buildExpandedLayoutMetadata(rawNode, k)
      // 断点① 源头纠正：`section-tree` 按节点名 `/header/i` 打 `type:'header'`，
      //   展开子段若**并非 chrome-only**（`chromeOnly === false`，子树含实质内容），
      //   名字里的 "header" 不构成「面板标题栏」语义 ⇒ 剥掉自动 type，
      //   否则 `applyFigmaHeightGrow` L2413 会把它永久排除出 flex 归一（比例失真）。
      //   ⚠️ 只动**展开产物**，不改变既有段的既有判定（那是 P1-C 的收敛范围）。
      if (k.type === 'header' && k.chromeOnly === false && !hasDeclaredSectionSemantics(k)) {
        delete k.type
        k._headerTypeStripped = true
      }
      k._expandedFrom = String(sec.id ?? '')
    }
    stats.expanded += 1
    stats.details.push({
      sectionId: String(sec.id ?? ''),
      from: key,
      to: kids.map((k) => String(k.id ?? '')),
      reason: verdict.reason,
      covered: Number(verdict.covered) || 0,
    })
    changed = true
    out.push(...kids)
  }

  if (!changed) {
    stats.skippedReason = rejectReasons.length > 0 ? rejectReasons.slice(0, 3).join(' | ') : 'no-section'
    return { sections, stats }
  }
  stats.sections = out.length
  return { sections: out, stats }
}

export default expandOverCoarseSections
