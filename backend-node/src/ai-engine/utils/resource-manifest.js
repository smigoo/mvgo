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
  return {
    ...mapping,
    ownerRole,
    ownerSectionId,
  }
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

  return { sections, sectionOrder, panel, unassigned }
}

/**
 * 把 chunk 的 section 标识（effectiveSection.title 或 id，可能带/不带 slot- 前缀）
 * 解析回 Manifest 中的 section key。供 L6 按 section 过滤资源清单。
 *
 * 匹配优先级：
 *   1. 精确相等（含前缀）
 *   2. 两端都去掉 slot- 前缀后相等（大小写不敏感）
 *
 * @param {Object} manifest - buildResourceManifest 的返回值
 * @param {string} sectionIdOrTitle - chunk 的 section 标识
 * @returns {string|null} 命中的 section key，未命中返回 null
 */
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
  const manifest = buildResourceManifest(resourceDomMapping)
  const sectionRes = resourcesForSection(manifest, matchedSection.title || matchedSection.id)
  if (sectionRes.length > 0 && sectionRes.length < resourceDomMapping.length) {
    return sectionRes
  }
  return []
}
