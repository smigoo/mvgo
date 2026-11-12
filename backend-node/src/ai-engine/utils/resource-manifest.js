/**
 * Resource Manifest Builder — 装配层 v1 资源表（单一事实源）
 *
 * 根因（资源错绑）：chunk 生成 prompt 把整张 resourceDomMapping 全量下发给 LLM，
 * LLM 在「全量资源里自由选名字相邻图」→ traffic 组件灾难级错绑
 * （icon1 属当日总流量却被绑到车型分布、bg2 属车型分布被绑到流量预测）。
 *
 * 治本：按 figmaPath 的 `slot-*` 段把资源聚合为 per-section 资源表；L6
 * 据此给每个 chunk 只下发「本 section 归属」的资源，从管线层消除跨 section 错绑。
 *
 * 纯函数、无 import.meta，jest（ts-jest CJS）可直接 require。
 */

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 框架/布局占位段：出现在 slot 之后、真正业务容器之前，不承载归属语义
 * （如 `@antd` 组件库前缀、`tab`/`cons` antd Tabs 容器、`sub-t` antd 子标签）。
 * 这些段出现时，真正的 per-card 边界在其后（如 `Group NNNNN` / `tabs-list`）。
 */
const SLOT_PLACEHOLDER_RE = /^slot-con$/i
const FRAMEWORK_SEGMENT_RE = /^(?:@antd|antd|tab|tabs|cons|sub-t|sub|frame|panel|body|content|wrapper|container)$/i

/**
 * 从 figmaPath 提取 section key：
 * - 具名 section（形如 `slot-当日总流量`）→ 直接取该段 `slot-当日总流量`。
 * - 占位 section（占位段 `slot-con`）：它本身不是真实业务 section，仅是 antd Tabs 等
 *   容器壳，其下每个业务卡片（如 `Group 2136637321`）才是一个独立归属单元。
 *   此时下钻到 `slot-con` 之后的「最近业务容器段」（跳过 @antd/tab/cons 等框架占位段），
 *   生成更细的归属 key：`slot-con/Group 2136637321`，从而让同一 antd Tab 内多个卡片的
 *   图标/背景可被 L6/L7 精确区分，避免「全 slot-con 同区 → 错绑不拦」的回归。
 * - 无 slot 段（如根容器 bg `cp-流量监测/bg-[m]`，skipMount）→ 返回 null（落 panel）。
 *
 * 0907 治本②（2026-09-09）：device 12 个图标 figmaPath 全为
 * `cp-设备监测/slot-con/@antd/tab/cons/Group NNNNN/icon`，旧实现只取首个 `slot-*`
 * 段 → 12 个资源全部归 `slot-con` → 同区错绑（icon1 绑到 Group 2136637552 生成的卡片）
 * 无法被 L7 拦截。下钻后每个 Group 成为独立 key，错绑方可被确定性识别。
 *
 * @param {string} figmaPath
 * @param {RegExp} re 已编译的 sectionPrefix 正则
 * @returns {string|null}
 */
function sectionKeyOf(figmaPath, re) {
  if (!figmaPath) return null
  const segs = String(figmaPath).split('/').filter(Boolean)
  const slotIdx = segs.findIndex((s) => re.test(s))
  if (slotIdx === -1) return null
  const slotSeg = segs[slotIdx]
  // 具名 section（非占位段）→ 直接作为 key
  if (!SLOT_PLACEHOLDER_RE.test(slotSeg)) return slotSeg
  // 占位段 slot-con：下钻到最近的「业务容器段」，拼成更细的 key
  for (let i = slotIdx + 1; i < segs.length; i++) {
    const s = segs[i]
    if (!FRAMEWORK_SEGMENT_RE.test(s)) {
      return `${slotSeg}/${s}`
    }
  }
  // 占位段之后全是框架占位段（无业务容器）→ 退化为占位段本身（保持 fail-open，不丢资源）
  return slotSeg
}

/**
 * 给资源条目补归属元数据（不修改原 mapping，避免污染上游缓存）。
 *
 * ownerRole 语义：
 * - `section`：归属某个业务 section（ownerSectionId 为 section key，如 slot-车型分布）
 * - `panel`：面板外壳/根级资源（无 section，不应下发给子组件自由挪用）
 * - `unassigned`：缺少 figmaPath，无法判定归属（后续可诊断/人工复核）
 *
 * @param {object} mapping
 * @param {'section'|'panel'|'unassigned'} ownerRole
 * @param {string|null} ownerSectionId
 * @returns {object}
 */
function withResourceOwner(mapping, ownerRole, ownerSectionId = null) {
  if (!mapping || typeof mapping !== 'object') return mapping
  const ownerBlockId = ownerSectionId || null
  const semanticName = inferSemanticName(mapping)
  return {
    ...mapping,
    ownerRole,
    ownerSectionId,
    ownerBlockId,
    semanticName,
    provenance: mapping.figmaPath ? 'figma-tree' : 'mapping-fallback',
  }
}

/**
 * 从 mapping 邻近 TEXT / figmaPath 最后非框架段填 semanticName。
 * 填不出留空，禁止全叫 "icon" 还假装具名。
 */
function inferSemanticName(mapping) {
  const pathName = String(mapping?.figmaPath || '')
    .split('/')
    .filter(Boolean)
    .reverse()
    .find((s) => !FRAMEWORK_SEGMENT_RE.test(s) && !/^slot-/i.test(s) && !/^Group\s/i.test(s) && s !== 'icon' && s !== 'bg' && s !== 'img')
  if (pathName && !/^(icon|bg|img|image)$/i.test(pathName)) return pathName
  const assigned = String(mapping?.assignedVarName || '').trim()
  if (assigned && !/^(icon|bg|img)\d+$/i.test(assigned)) return assigned
  return ''
}

/**
 * 按 figmaPath 为 resourceDomMapping 补 ownerRole / ownerSectionId。
 *
 * @param {Array} mappings
 * @param {Object} [options]
 * @param {string} [options.sectionPrefix='slot-']
 * @returns {Array}
 */
export function annotateResourceOwnership(mappings, options = {}) {
  const sectionPrefix = options.sectionPrefix || 'slot-'
  const re = new RegExp('^' + escapeRegex(sectionPrefix), 'i')
  return (Array.isArray(mappings) ? mappings : []).map((m) => {
    // 🛡️ 2026-09-29 治本：优先用「父节点 id（ownerSectionId，确定性）」作归属锚，
    //   不再依赖 figmaPath 的 slot-* 名字段（名字漂移 → 跨 section 串用资源）。
    if (m && m.ownerSectionId) {
      return withResourceOwner(m, 'section', String(m.ownerSectionId))
    }
    const fp = m && m.figmaPath
    if (!fp) return withResourceOwner(m, 'unassigned', null)
    const sec = sectionKeyOf(fp, re)
    if (!sec) return withResourceOwner(m, 'panel', null)
    return withResourceOwner(m, 'section', sec)
  })
}

/**
 * 构建 per-section 资源 Manifest（资源表 v1 单一事实源）。
 *
 * @param {Array} mappings - resourceDomMapping 数组（权威归属）
 * @param {Object} [options]
 * @param {string} [options.sectionPrefix='slot-'] - section 段前缀
 * @returns {{
 *   sections: Object<string, Array>,   // sectionKey -> 该 section 归属的资源（已补 ownerRole/ownerSectionId）
 *   sectionOrder: string[],            // 出现顺序的 section key 列表
 *   panel: Array,                      // 顶层（无 slot 段）资源，如根容器 bg skipMount
 *   unassigned: Array,                 // 无任何 figmaPath 的资源
 * }}
 */
export function buildResourceManifest(mappings, options = {}) {
  const sections = Object.create(null)
  const sectionOrder = []
  const panel = []
  const unassigned = []

  for (const m of annotateResourceOwnership(mappings, options)) {
    if (!m || typeof m !== 'object') {
      unassigned.push(m)
      continue
    }
    if (m.ownerRole === 'unassigned') {
      unassigned.push(m)
      continue
    }
    if (m.ownerRole === 'panel') {
      panel.push(m)
      continue
    }
    const sec = m.ownerSectionId
    if (!sec) {
      unassigned.push(withResourceOwner(m, 'unassigned', null))
      continue
    }
    if (!sections[sec]) {
      sections[sec] = []
      sectionOrder.push(sec)
    }
    sections[sec].push(m)
  }

  // 🆕 Loop 0.5：resources[]（扁平，含 ownerBlockId=ownerSectionId + provenance）。
  // 注意：resource 对象经 annotateResourceOwnership 已带 ownerRole/ownerSectionId/ownerBlockId/
  // semanticName/provenance 字段；此处仅做聚合扁平化，不再重写归属。
  const resources = []
  for (const key of sectionOrder) {
    for (const m of sections[key] || []) resources.push(m)
  }
  for (const m of panel) resources.push(m)
  for (const m of unassigned) resources.push(m)

  return {
    version: 'wm-1',
    sections,
    sectionOrder,
    panel,
    unassigned,
    resources,
    contracts: [],
  }
}

/**
 * Loop 0.5：由 fileSectionMap 生成 contracts[]。
 * 禁止从 defineProps 反推。无 fileSectionMap / 无 manifest → contracts=[]，不抛。
 *
 * @param {Object} manifest - buildResourceManifest 返回值（含 sections）
 * @param {Object|null} fileSectionMap - path → section key
 * @returns {Array<{file, blockIds, resourceProps, parentMustPass}>}
 */
export function buildContracts(manifest, fileSectionMap) {
  if (!manifest || !fileSectionMap || typeof fileSectionMap !== 'object') return []
  const byFile = Object.create(null)
  let any = false
  for (const [file, key] of Object.entries(fileSectionMap)) {
    if (!file || !key) continue
    any = true
    if (!byFile[file]) byFile[file] = []
    if (!byFile[file].includes(key)) byFile[file].push(key)
  }
  if (!any) return []

  const contracts = []
  for (const [file, blockIds] of Object.entries(byFile)) {
    const resourceProps = []
    const seen = new Set()
    for (const bid of blockIds) {
      const resList = manifest.sections?.[bid] || []
      for (const m of resList) {
        if (!m || m.downloadStatus !== 'success') continue
        const v = m.assignedVarName || m.semanticVarName
        if (!v || seen.has(v)) continue
        seen.add(v)
        resourceProps.push(v)
      }
    }
    contracts.push({
      file,
      blockIds,
      resourceProps,
      parentMustPass: [...resourceProps],
    })
  }
  return contracts
}

/**
 * Loop 1：按契约过滤 mapping（写盘 import 用）。
 * - main：∪ contracts.parentMustPass ∪ panel（均 downloadStatus===success）
 * - sub：ownerBlockId ∈ contract.blockIds 且 success（P0/D 阶段仍 skip 注入 import）
 * - 其它 role：parentMustPass ∪ panel；allowed 为空返回 []（Loop 2.0.A，禁止 forceAll）
 *
 * 注意：ownerBlockId 由 annotateResourceOwnership 补在条目上；若调用方传入的 mapping
 * 未走 annotate（例如来自磁盘的裸 mapping），先 buildResourceManifest 归一。
 */
export function mappingForContract(effectiveMapping, manifest, contract, role) {
  const list = Array.isArray(effectiveMapping) ? effectiveMapping : []
  const success = list.filter((m) => m && m.downloadStatus === 'success')
  if (role === 'sub') {
    if (!contract || !Array.isArray(contract.blockIds) || contract.blockIds.length === 0) return []
    const blocks = new Set(contract.blockIds)
    const out = []
    for (const m of success) {
      const bid = m.ownerBlockId || m.ownerSectionId
      if (bid && blocks.has(bid)) out.push(m)
    }
    return out
  }
  // main / 其它：parentMustPass 并集 + panel
  const allowed = new Set()
  const addName = (v) => { if (v) allowed.add(v) }
  if (contract && Array.isArray(contract.parentMustPass)) {
    for (const v of contract.parentMustPass) addName(v)
  }
  for (const c of manifest?.contracts || []) {
    for (const v of c.parentMustPass || []) addName(v)
  }
  for (const m of manifest?.panel || []) {
    if (m && m.downloadStatus === 'success') addName(m.assignedVarName || m.semanticVarName)
  }
  // Loop 2.0.A：空契约禁止 forceAll。无 parentMustPass / contracts / panel 名时返回 []，
  // 不得把跨区 success 全量灌回主组件。诊断由调用方记；本函数只保证 mapping 为空。
  if (allowed.size === 0) return []
  return success.filter(
    (m) => allowed.has(m.assignedVarName) || allowed.has(m.semanticVarName),
  )
}

/**
 * 主组件合并后的 parentMustPass（∪ 全部子合同 + panel success）。
 */
export function mergedParentMustPass(manifest) {
  const names = []
  const seen = new Set()
  const push = (v) => {
    if (!v || seen.has(v)) return
    seen.add(v)
    names.push(v)
  }
  for (const c of manifest?.contracts || []) {
    for (const v of c.parentMustPass || []) push(v)
  }
  for (const m of manifest?.panel || []) {
    if (m && m.downloadStatus === 'success') push(m.assignedVarName || m.semanticVarName)
  }
  return names
}
export function resolveSectionKey(manifest, sectionIdOrTitle) {
  if (!manifest || !sectionIdOrTitle) return null
  const keys = manifest.sectionOrder || Object.keys(manifest.sections || {})
  if (manifest.sections && manifest.sections[sectionIdOrTitle]) return sectionIdOrTitle
  const norm = (s) => String(s).trim().toLowerCase().replace(/^slot-/, '')
  const target = norm(sectionIdOrTitle)
  for (const k of keys) {
    if (norm(k) === target) return k
  }
  return null
}

/**
 * 取某 section 归属的资源清单（供 L6 注入 chunk prompt）。
 * @param {Object} manifest
 * @param {string} sectionIdOrTitle
 * @returns {Array} 该 section 资源；未命中返回 []（fail-open，不阻断生成）
 */
export function resourcesForSection(manifest, sectionIdOrTitle) {
  if (!manifest) return []
  const key = resolveSectionKey(manifest, sectionIdOrTitle)
  if (!key) return []
  return manifest.sections[key] || []
}

/**
 * 计算子组件 chunk 应下发的「按 section 过滤」资源清单（L6 接线纯函数）。
 *
 * 根因（资源错绑）：子组件 chunk prompt 全量下发 resourceDomMapping → LLM 在「全量资源里
 * 自由选名字相邻图」→ 跨 section 错绑（icon1 属当日总流量被绑到车型分布）。
 * 治本：只返回 matchedSection 归属的资源；其余不进 prompt。
 *
 * @param {Array} resourceDomMapping - 全量资源映射（权威归属）
 * @param {Object|null} matchedSection - 子组件匹配到的 effectiveSection（含 title/id）
 * @returns {Array|undefined} 过滤后的资源清单；以下情况返回 undefined（fail-open 保留全量）：
 *   - 未匹配到 section；- 映射为空；- 过滤后资源数未减少（无意义过滤）
 *
 * 注意：本函数只决定 prompt 暴露给 LLM 的资源清单；写盘 import 注入仍走全量 effectiveMapping，
 * 因此不影响 RESOURCE-001 全量资源使用校验。
 */
export function scopedResourceDomMapping(resourceDomMapping, matchedSection) {
  // Loop 0.D：无 matchedSection / 空 mapping → undefined（调用方不改 prompt）
  // 有 matchedSection 但未命中归属 → []（fail-closed，禁止回全量）
  if (!matchedSection || !Array.isArray(resourceDomMapping) || resourceDomMapping.length === 0) {
    return undefined
  }
  const sectionKey =
    matchedSection.id || matchedSection.sourceNodeIds?.[0] || matchedSection.title
  const manifest = buildResourceManifest(resourceDomMapping)
  // 🛡️ 2026-09-29 治本：优先用 node id（确定性的 ownerSectionId 锚）匹配，name 仅作兜底。
  const direct = resourcesForSection(manifest, sectionKey)

  // 🛡️ 2026-11-05 治本（mc-max-1793840255758-76bb6b43 实锤）：
  //   `buildResourceManifest` 只按 `ownerSectionId` **精确相等**分桶，而 section 的**子孙节点**上的
  //   资源（如 Tab 栏的 tabs-icon(89:43) 下两张图标、激活底图(2:7889)）ownerSectionId 不等于
  //   section id ⇒ 被子组件裁剪全部漏掉。实测 TabsSection 只拿到 `Tab切换栏 (1/7)`、
  //   traffic 各段一律 `0/12` ⇒ LLM 手里没有图标资源可用 ⇒ 只能臆造 class（`bar-chart-filled-1`，
  //   common.less 零定义 ⇒ 图标不可见）或空 `<span>`。
  //   修法：以**结构归属**（entry.ancestorIds 含 section id ⇒ 资源位于该 section 子树内）补集，
  //   与 Figma 真值同源、与命名无关；无 ancestorIds 的旧映射自动退化为原「精确相等」行为。
  const keyStr = sectionKey != null ? String(sectionKey) : null

  // 🛡️ 2026-11-12 治本（mc-max-1794459793796-e5de62fd 实锤）：
  //   **合并段的成员节点归属**。段可以由多个 Figma 节点合并而成（统计卡段 `38:3134` =
  //   合作厂商卡 `38:3260` + 在线设备卡 `38:3282`，见 `sourceNodeIds`），但资源映射里
  //   `ownerSectionId` 记的仍是**成员卡** id ⇒ 只按 `matchedSection.id` 分桶 ⇒ 两卡各自的
  //   图标（icon2 / icon3）全部落空 ⇒ 该段子组件 prompt 资源清单为 **0 条** ⇒ LLM 只能按
  //   语义臆造变量名（`icon战略厂商`），无 import 可用 ⇒ E2-v3「落盘未消费」硬拒。
  //   判据：`ownerSectionId` ∈ 段 id 或 ∈ 段的 `sourceNodeIds` ⇒ 归本段（同一份 sourceNodeIds
  //   就是段划分的事实源，不另立口径）。
  const memberKeys = new Set(
    (Array.isArray(matchedSection.sourceNodeIds) ? matchedSection.sourceNodeIds : [])
      .filter((n) => n != null)
      .map(String),
  )
  if (keyStr) memberKeys.delete(keyStr)
  const byMember = []
  if (memberKeys.size > 0) {
    for (const m of resourceDomMapping) {
      if (!m || typeof m !== 'object') continue
      if (memberKeys.has(String(m.ownerSectionId))) byMember.push(m)
    }
  }

  // 子树补集（2026-11-05 治本，Tab 栏资源场景）**仅在精确归属为空时启用**。
  //   原因：`ancestorIds` 记录的是 Figma **物理层级**，而段划分会重切 —— 实锤本轮
  //   `icon4/5/6`（三组网格各自的图标）的 ancestorIds 也含 `38:3134`（它是整个内容区的
  //   容器），若与精确归属一并合并，统计卡段会吞掉三组网格的图标 ⇒ 跨段错绑。
  //   精确归属（段 id / 成员节点）本身就是「最近归属」，优先于物理祖先。
  const subtree = []
  if (keyStr && direct.length === 0 && byMember.length === 0) {
    for (const m of resourceDomMapping) {
      if (!m || typeof m !== 'object') continue
      const anc = Array.isArray(m.ancestorIds) ? m.ancestorIds : null
      if (!anc) continue
      if (anc.some((a) => a != null && String(a) === keyStr)) subtree.push(m)
    }
  }

  const seen = new Set()
  const merged = []
  for (const m of [...direct, ...byMember, ...subtree]) {
    if (!m || typeof m !== 'object') continue
    const k = [
      m.figmaNodeId ?? m.imageRef ?? m.targetDomSelector ?? '',
      m.varName ?? m.semanticVarName ?? '',
    ].join('|')
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(m)
  }

  // 🔴 2026-11-12 判据修正：旧实现在「过滤后数量未减少」时返回 []（当作无意义过滤）。
  //   但当本段**就是全部资源的宿主**（单段组件 / 段独占整棵树）时，未减少恰恰是正确结果，
  //   返回 [] 会让该段 prompt 一条资源都拿不到（本轮 E2-v3 的直接成因）。
  //   正确语义：命中归属就返回命中集，未命中才 fail-closed 返回 []。
  return merged
}
