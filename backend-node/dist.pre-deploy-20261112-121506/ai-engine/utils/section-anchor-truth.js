/**
 * section-anchor-truth.js —— 视觉 section 的「Figma 锚点」真值审计（纯函数、零业务依赖）。
 *
 * 📌 2026-11-05（G14a）：`FIGMA_ID_RE` / `sectionAnchorCandidates` / `sectionAnchorKey`
 *   三项已下沉到零依赖模块 `section-anchor-identity.js`（本文件 re-export 兼容旧路径）。
 *   本文件保留的 `auditSectionAnchors` 需要 Figma 树索引，故仍依赖 `section-tree.js`。
 *
 * 🔴 背景（2026-10-21 · c-d79b-66d79bff「合作厂商弹窗」实锤）：
 *   Vision 给 section 写的 `id` 是**自由文本**，可以出现三种形态：
 *     ① 语义 id（`section-cards`，合法）
 *     ② Figma 形态的**幻觉 id**（`38:3258` —— 树里确实存在，但它是普通段里的「鲁邦通」TEXT）
 *     ③ `figmaNodeId` 指向不存在的节点
 *   ②最危险：它**查得到几何**，于是 `sectionY` 排序、同区域判定、祖先回溯全部拿到一个
 *   语义无关的坐标 —— 表现为「卡片被排到整页最底部」这类"能跑但全错"的症状。
 *
 * 判据（刻意做成**类型无关、命名无关**）：
 *   一个 section 的锚点，必须是它**自己的内容（直接子级引用的 Figma 节点）的祖先**。
 *   否则无论它是 TEXT / VECTOR / 别的什么，锚点都不可信 —— 不需要猜节点类型白名单。
 *
 * 修复（只增不改）：把修正后的锚点写到**新字段** `figmaAnchorId`（最近公共祖先 LCA），
 *   **绝不改写 `id` / `figmaNodeId`**。原因：既有查找（`heightById` / `visionSemantic`）与
 *   本字段是**两条独立轨道**，改 `id` 会让上游语义、下游几何的来源同时被污染，无法 A/B。
 *   （2026-10-29 刀33 起，`subcomponent-planner` 的查找键改走 `sectionAnchorKey`，
 *   `figmaAnchorId` 已是**首选**键 —— 本字段终于被消费，但 `id` / `figmaNodeId` 仍原样保留。）
 *
 * 幂等：判定用 `figmaAnchorId || figmaNodeId || id` 作为"当前声明锚点"，修复后再次运行
 *   会以 `figmaAnchorId` 为准 ⇒ 无 issue、无新 fix。
 *
 * fail-open：section 没有可回指的直接子级引用 ⇒ **不判**（无真值不判，避免臆造）。
 */
import { indexFigmaNodes, getFigmaBox } from './section-tree.js'

// 🔴 G14a（2026-11-05）：三项「声明锚点身份」解析已下沉到**零依赖**模块
//   `section-anchor-identity.js`，本文件 re-export 以保持 6 个消费方 import 路径不变。
//   原因：本文件 `:27` 依赖 `section-tree.js`，而 `section-tree.js#dedupeDuplicateSections`
//   需要 `sectionAnchorKey` 判嵌套 ⇒ 直接反向引用会成环。候选优先级仍为单一来源
//   （定义只在 identity 模块一处），本文件只做转发，**禁止**在此重新实现。
import { FIGMA_ID_RE, sectionAnchorCandidates, sectionAnchorKey } from './section-anchor-identity.js'

export { FIGMA_ID_RE, sectionAnchorCandidates, sectionAnchorKey }

/**
 * 收集 section **直接子级**引用的 Figma 节点 id。
 *
 * 只认 `figmaNode` / `figmaNodeId` / 形如 `12:345` 的 `id`；`section.id` 本身不作引用
 * （它可能是语义名或幻觉 id）。`id` 字段在视觉输出里常被用来放真实节点 id
 * （如 stat-card 的子项 `{ "id": "38:3260" }`），所以必须收。
 */
export function collectSectionFigmaRefs(section) {
  const refs = new Set()
  if (!section || typeof section !== 'object') return refs
  // 🔴 R8-7：`declaredContent`（assembler 透传的内容契约）与 body.children 同族纳入 ——
  //   此前只读 children/body.children，而 generationInput 白名单不透传 body ⇒ refs 恒空
  //   ⇒ R3 isScopeIncomplete 结构性 fail-open（dea074f9 实锤）。
  const dc = section.declaredContent
  const kids = [
    ...(Array.isArray(section.children) ? section.children : []),
    ...(Array.isArray(section.body?.children) ? section.body.children : []),
    ...(Array.isArray(dc?.children) ? dc.children : []),
    ...(Array.isArray(dc?.items) ? dc.items : []),
    ...(Array.isArray(dc?.elements) ? dc.elements : []),
  ]
  for (const kid of kids) {
    if (!kid || typeof kid !== 'object') continue
    for (const key of ['figmaNode', 'figmaNodeId', 'id']) {
      const v = kid[key]
      if (typeof v === 'string' && FIGMA_ID_RE.test(v)) refs.add(v)
    }
  }
  return refs
}

/** id 的祖先链（含自身），做环保护 */
function ancestorChain(index, id) {
  const chain = []
  let cur = index.get(String(id)) || null
  let guard = 0
  while (cur && guard++ < 128) {
    chain.push(String(cur.id))
    cur = cur.parentId != null ? index.get(String(cur.parentId)) || null : null
  }
  return chain
}

/** ancestorId 是否为 id 的祖先（含自身） */
function isAncestorOrSelf(index, ancestorId, id) {
  return ancestorChain(index, id).includes(String(ancestorId))
}

/** 一组节点的最近公共祖先（无法确定 ⇒ null） */
function lowestCommonAncestor(index, ids) {
  const lists = []
  for (const id of ids) {
    const chain = ancestorChain(index, id)
    if (chain.length > 0) lists.push(chain)
  }
  if (lists.length === 0) return null
  for (const candidate of lists[0]) {
    if (lists.every((chain) => chain.includes(candidate))) return candidate
  }
  return null
}

/**
 * section 当前**声明**的锚点（整形 + 形态校验后）。
 * 🔴 R2（2026-11-02）起为**模块内单一来源**：主审计循环与兄弟段预采集共用，不得各写一份。
 * `nodeId` / `id` 需过 FIGMA_ID_RE（防御语义垃圾顶替锚点声明）；`figmaNodeId` / `figmaNode`
 * 沿旧例不校验（显式声明，查无此节点由 `anchor-unknown` 兜）。
 */
function declaredAnchorOf(section) {
  const [repaired, explicit, aliasNode, explicitNode, rawId] = sectionAnchorCandidates(section).map((v) =>
    typeof v === 'string' ? v.trim() : '',
  )
  const claimed =
    repaired ||
    explicit ||
    (FIGMA_ID_RE.test(aliasNode) ? aliasNode : '') ||
    explicitNode ||
    (FIGMA_ID_RE.test(rawId) ? rawId : '')
  return { claimed, rawId, explicit, repaired }
}

/**
 * stats 初值（🔴 每个计数键必须显式初始化 —— 命中与否、跳过与否都要有确定值）。
 *
 * 🔴 **导出给聚合侧复用**（`visual-parser#auditVisionSectionAnchors`：同一 payload 里
 *   `layout.sections` / `layoutStructure.layout.sections` 等多处挂载点各跑一次后求和）。
 *   聚合侧**不得自己拼一份键表**：本模块扩键时聚合侧会静默丢键——真机曾因聚合侧只取
 *   `judged` / `fixes.length` 两个值，导致 `phantomRefs` / `unrepaired` 这两个新的观测面
 *   在日志里彻底不可见（计数行铁律的破口）。
 */
export function emptyAnchorStats() {
  return {
    judged: 0,
    skippedNoRefs: 0,
    skippedSemanticAnchor: 0,
    phantomRefs: 0,
    anchorUnknown: 0,
    notAncestor: 0,
    repaired: 0,
    unrepaired: 0,
    // R2（2026-11-02）：LCA 覆盖兄弟段声明锚点被拒修的事件数（0 也必须出现，防假绿）
    siblingCovered: 0,
  }
}

/**
 * 审计并修复 section 锚点。
 *
 * @param {Array<object>} sections 视觉结构表（`layout.sections`）
 * @param {object} figmaRoot Figma 节点树（可传 `{document}` 包装或 document 本体）
 * @returns {{issues:Array, fixes:Array, unrepaired:Array, stats:object}}
 *   issues:     `{ sectionId, anchorId, kind, refs, missingRefs, detail }`
 *   fixes:      `{ sectionId, from, to, reason }`
 *   unrepaired: `{ sectionId, claimed, kind, candidateLca, reason }`
 *   stats:      `{ judged, skippedNoRefs, skippedSemanticAnchor, phantomRefs,
 *                  anchorUnknown, notAncestor, repaired, unrepaired }`
 *
 * ## B 批加固（2026-10-26 · mc-max-1792985029695-58de7d47 真机实锤）
 *
 * ① **幻影 ref 与祖先判定分离**（消假阳）：
 *    真机 `36:1693` 段被报 `anchor-not-ancestor`，但「非祖先」的唯一 ref 是**树里不存在**的
 *    幻觉 id `36:1696`（vision 臆造）——真实 refs 全部在 `36:1693` 之下。旧实现把
 *    「ref 不在树中」混进祖先判定 ⇒ 凭空造出一条假 issue（真机 issues 3 条里有 1 条是假的）。
 *    ⇒ 现在：祖先判定**只看树内 refs**；不在树的 refs 收进 `missingRefs` 并计入
 *      `stats.phantomRefs`。**不为它们另发 issue**（幻觉 id 的归属方是单一来源
 *      `vision-anchor-validator#validateVisionAnchors`，此处重复报同一事实会形成第二份判据）。
 *
 * ② **修复质量门槛**（宁可不修，不可修错 —— fail-open）：
 *    候选 `lca` 必须同时满足：
 *      · `lca !== claimed`（否则无变化）
 *      · `index.has(lca)`（否则不可信）
 *      · `lca !== 树根 id`（把段锚到整页 ⇒ sectionY/h 取整页几何，正是本模块要防的
 *        「卡片被排到整页最底部」那一类错误）
 *      · `missingRefs.length === 0`（**证据完整性**：有幻影 ref 时 LCA 是在残缺引用集上
 *        算出来的，可能系统性偏窄/偏深 ⇒ 不自动落地）
 *    任一不满足 ⇒ 不写 `figmaAnchorId`，记入 `unrepaired`（含候选 `candidateLca`，留痕待判）。
 *
 * ## R2 加固（2026-11-02 · mc-max-1793597679970-646085b2 真机实锤）
 *
 * ③ **LCA 覆盖兄弟段 ⇒ 拒修**（`lca-covers-sibling-sections`）：候选 LCA 的子树若包含
 *    **其他 section 的声明锚点**（预采集、与遍历顺序无关），则该修复会把别段的地盘划归本段
 *    （真机实锤：统计区锚点被修成整内容容器 796:3，几何取 787 高、内容仍是首卡 76 的子树）。
 *    判据刻意**不设**「高度放大倍数」——刀33 聚合段修复（首卡→整组）本就需要更大 LCA，
 *    放大是正当的；「是否覆盖兄弟段声明锚点」才是正当聚合与有害扩张的充要条件。
 *    拒修事件计 `stats.siblingCovered`，unrepaired 条目附 `coveredAnchors` 留痕待判。
 */
export function auditSectionAnchors(sections, figmaRoot) {
  const root = (figmaRoot && (figmaRoot.document || figmaRoot)) || null
  const index = indexFigmaNodes(root)
  const issues = []
  const fixes = []
  const unrepaired = []
  const stats = emptyAnchorStats()
  if (!index.size || !Array.isArray(sections)) {
    return { issues, fixes, unrepaired, stats }
  }

  const rootId = root?.id != null ? String(root.id) : ''

  // 🔴 R2（2026-11-02 · mc-max-1793597679970-646085b2「合作厂商弹窗」实锤）：
  //   修复门槛只挡 no-lca / lca-is-root / phantom-refs，**不挡「LCA 覆盖兄弟段」**——
  //   真机统计区锚点 38:3260（首卡底板 265×76）被修成 796:3（整内容容器 604×787，内含
  //   3 个兄弟段锚点）⇒ 几何来自 796:3、内容仍是 38:3260 的撕裂段，统计区独占 91% 高度、
  //   内容只剩一张图标。这里**预采集**全部段 的声明锚点（修复写入前、与遍历顺序无关 ⇒ 确定性），
  //   修复门槛据此拒修「LCA 子树覆盖其他段声明锚点」的候选。
  //   为什么不用「高度放大倍数」当判据：刀33 聚合段修复（首卡 → 整组）本来就需要更大的 LCA，
  //   放大是正当的；**「是否覆盖兄弟段声明锚点」才是正当聚合与有害扩张的充要判据**。
  const declaredAnchors = []
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue
    const { claimed } = declaredAnchorOf(s)
    if (claimed) declaredAnchors.push({ section: s, anchor: claimed })
  }

  for (const section of sections) {
    if (!section || typeof section !== 'object') continue
    const refs = collectSectionFigmaRefs(section)
    if (refs.size === 0) {
      stats.skippedNoRefs += 1 // 无真值不判
      continue
    }

    // 当前声明的锚点：修复产物优先（幂等锚点）
    // （候选优先级单一来源 `declaredAnchorOf` → `sectionAnchorCandidates`，此处只做形态校验）
    const { claimed, rawId, explicit, repaired } = declaredAnchorOf(section)

    // 语义 id（如 `section-cards`）是合法的，不算锚点声明 ⇒ 不判
    if (!claimed) {
      stats.skippedSemanticAnchor += 1
      continue
    }
    stats.judged += 1

    const sectionId = rawId || explicit || repaired
    const anchor = index.get(claimed) || null

    // 🔴 ① 分离幻影 ref：祖先判定只在「树内」引用上做
    const refsInTree = [...refs].filter((ref) => index.has(ref))
    const missingRefs = [...refs].filter((ref) => !index.has(ref))
    stats.phantomRefs += missingRefs.length

    let kind = ''
    let detail = ''

    if (!anchor) {
      kind = 'anchor-unknown'
      stats.anchorUnknown += 1
      detail = `锚点 ${claimed} 不在 Figma 树中`
    } else if (
      refsInTree.length > 0 &&
      !refsInTree.every((ref) => isAncestorOrSelf(index, claimed, ref))
    ) {
      const outside = refsInTree.filter((ref) => !isAncestorOrSelf(index, claimed, ref))
      kind = 'anchor-not-ancestor'
      stats.notAncestor += 1
      detail = `锚点 ${claimed}(${anchor.type || '?'} ${anchor.name || ''}) 不是其内容 ${outside.join(',')} 的祖先`
      if (missingRefs.length > 0) {
        detail += `；另有 ${missingRefs.length} 个引用不在树中（${missingRefs.join(',')}）`
      }
    }

    if (!kind) continue

    issues.push({
      sectionId,
      anchorId: claimed,
      kind,
      refs: [...refs],
      missingRefs,
      detail,
    })

    // 🔴 ② 修复质量门槛：候选 LCA 必须过全部门槛才允许落地
    //   注：进入此处时 `kind` 必为真 ⇒ `claimed` 必不是全部树内 ref 的祖先
    //   ⇒ `candidateLca === claimed` 可证明不可达（LCA 不可能等于「不是祖先的那个节点」），故不设该分支。
    const candidateLca = refsInTree.length > 0 ? lowestCommonAncestor(index, refsInTree) : null
    // R2：候选 LCA 子树覆盖的**其他段**声明锚点（含自身 ⇒ isAncestorOrSelf；幻觉锚点不在树中自然不命中）
    const coveredSiblings = candidateLca
      ? declaredAnchors.filter((d) => d.section !== section && isAncestorOrSelf(index, candidateLca, d.anchor))
      : []
    const reason = (() => {
      if (!candidateLca || !index.has(candidateLca)) return 'no-lca'
      if (rootId && candidateLca === rootId) return 'lca-is-root'
      if (missingRefs.length > 0) return 'phantom-refs'
      // 🔴 R2：LCA 子树若覆盖其他 section 的声明锚点 ⇒ 拒修（记 lca-covers-sibling-sections）
      if (coveredSiblings.length > 0) return 'lca-covers-sibling-sections'
      return ''
    })()

    if (!reason) {
      section.figmaAnchorId = candidateLca
      fixes.push({ sectionId, from: claimed, to: candidateLca, reason: kind })
      stats.repaired += 1
    } else {
      unrepaired.push({
        sectionId,
        claimed,
        kind,
        candidateLca,
        reason,
        ...(coveredSiblings.length > 0 ? { coveredAnchors: coveredSiblings.map((d) => d.anchor) } : {}),
      })
      if (reason === 'lca-covers-sibling-sections') stats.siblingCovered += 1
      stats.unrepaired += 1
    }
  }

  return { issues, fixes, unrepaired, stats }
}