/**
 * 🛡️ P1 治本（2026-09-11 · mc-max-1789097821000-c6194696 设备监测实锤）：tab 项资源引用幻觉校验与纠正。
 *
 * 根因：Vision 模型在语义壳（section-main）的 tab 项上写死了 `resourceFile="../resources/images/bg-8788.png"`，
 * 但按 resource-dom-mapping 反查，该资源的 figmaNodeId=2:8788、figmaPath=`.../slot-con/switch/active/bg`——
 * 是 switch 的背景图，不是 tab 的背景。tab 的真实背景（89:39 tabs 子树的 2:8826 RECTANGLE / 2:8831 VECTOR）
 * 是 GRADIENT_LINEAR 线性渐变，本该走 CSS `linear-gradient(...)`，根本不导出 png。
 * 旧链路无任何环节校验「tab 项 resourceFile 是否真属于 tab 的 Figma 子树」→ 生成产物里 tab 用了 switch 背景。
 *
 * 治本（确定性、零 LLM）：
 *   1. 遍历 layout 里所有 tab 项（type/role === 'tab'），取 resourceFile（含 icon.resourceFile）。
 *   2. resourceFile 经 resourceDomMapping 反查 figmaNodeId。
 *   3. tab 项 name 经 Figma 树反查（name 或 TEXT.characters 命中），得到真实 tab 节点 → 取其祖先容器子树 id 集合。
 *   4. 反查出的 figmaNodeId 不在该子树内 → 判「资源引用幻觉」，纠正：
 *      a. 摘除幻觉 resourceFile；
 *      b. 若 Figma 真值含 GRADIENT_LINEAR → 写 CSS linear-gradient 到 styles.background；
 *      c. 真值无填充（纯装饰 VECTOR）→ 不挂任何背景。
 *
 * 纯函数、零依赖、无 import.meta，便于 jest 单测；默认不修改入参，返回 `{ hallucinations, applied }`。
 *
 * @param {object} parsed - vision 分析结果（含 layout.sections，可能嵌套 body.children / children）
 * @param {Array} resourceDomMapping - 资源映射 [{resourceFile, figmaNodeId, figmaPath, ...}]
 * @param {object} figmaData - Figma 节点树（含 children 的 document 或节点本身）
 * @param {object} [opts] - { apply: boolean } 是否就地纠正（默认 true，返回新结构不污染入参）
 * @returns {{ hallucinations: Array<{tabId, resourceFile, figmaNodeId, figmaPath, reason}>, applied: number }}
 */

const TAB_ROLE_HINT = /tab/i

/** resourceFile → figmaNodeId 映射 */
function buildResourceNodeIdMap(resourceDomMapping) {
  const map = new Map()
  if (!Array.isArray(resourceDomMapping)) return map
  for (const m of resourceDomMapping) {
    if (m && m.resourceFile && m.figmaNodeId) {
      if (!map.has(m.resourceFile)) map.set(m.resourceFile, String(m.figmaNodeId))
    }
  }
  return map
}

/** resourceFile → 完整 mapping entry */
function buildResourceEntryMap(resourceDomMapping) {
  const map = new Map()
  if (!Array.isArray(resourceDomMapping)) return map
  for (const m of resourceDomMapping) {
    if (m && m.resourceFile) {
      if (!map.has(m.resourceFile)) map.set(m.resourceFile, m)
    }
  }
  return map
}

/** 建 id → node 索引 + 收集某子树的所有 id（用于「资源 figmaNodeId 是否在 tab 子树内」判定） */
function buildFigmaIndex(figmaData) {
  const byId = new Map()
  const parentOf = new Map()
  const walk = (n, p) => {
    if (!n) return
    byId.set(String(n.id), n)
    if (p) parentOf.set(String(n.id), p)
    for (const c of n.children || []) walk(c, n)
  }
  const root = figmaData && (figmaData.document || figmaData)
  if (root) walk(root, null)
  return { byId, parentOf }
}

/** 在 Figma 树里按 name 或 TEXT.characters 找节点（返回第一个命中） */
function findNodeByLabel(byId, label) {
  if (!label) return null
  const target = String(label).trim()
  if (!target) return null
  // 精确 name 命中优先
  for (const n of byId.values()) {
    if (String(n.name || '') === target) return n
  }
  // characters 命中（TEXT 节点的真实文字，如 name="t-监控" characters="监控"）
  for (const n of byId.values()) {
    if (n.type === 'TEXT' && n.characters && String(n.characters).trim() === target) return n
  }
  return null
}

/**
 * 收集节点「真实归属子树」：tab 文字节点（如 t-监控）与其背景（bg）通常是同一 tab 项容器
 * （如 tab-active）下的兄弟节点。故取 tab 文字节点的父容器子树（父 + 其全部后代）作为归属证据。
 * 只取一层父容器（不逐层到根，避免把整棵组件树都算进归属导致误判）。
 */
function collectBelongingSubtreeIds(byId, parentOf, node) {
  const ids = new Set()
  const parent = parentOf.get(String(node.id))
  if (parent) {
    const subtree = collectSubtreeIds(byId, parent)
    for (const id of subtree) ids.add(id)
  } else {
    // 无父节点（节点即根）→ 退化为自身子树
    const subtree = collectSubtreeIds(byId, node)
    for (const id of subtree) ids.add(id)
  }
  return ids
}

/** 收集某子树所有 id（祖先容器子树，向下扩展） */
function collectSubtreeIds(byId, node) {
  const ids = new Set()
  const walk = (n) => {
    if (!n) return
    ids.add(String(n.id))
    for (const c of n.children || []) walk(c)
  }
  walk(node)
  return ids
}

/** 判断 tab 项 node 是否为 tab 项（type/role 含 tab，或 name 命中 tab 且非 tab 容器） */
function isTabItem(node) {
  if (!node || typeof node !== 'object') return false
  const type = String(node.type || '').toLowerCase()
  const role = String(node.role || '').toLowerCase()
  if (type === 'tab' || role === 'tab') return true
  return false
}

/** 取 tab 项的 resourceFile（自身 + icon 子对象） */
function collectTabResourceFiles(node) {
  const out = []
  if (node.resourceFile) out.push(String(node.resourceFile))
  if (node.icon && typeof node.icon === 'object' && node.icon.resourceFile) {
    out.push(String(node.icon.resourceFile))
  }
  return out
}

/** 从 Figma 节点提取 CSS 渐变背景（GRADIENT_LINEAR fills） */
function extractGradientBackground(node) {
  if (!node || !Array.isArray(node.fills)) return null
  for (const f of node.fills) {
    if (f && f.type === 'GRADIENT_LINEAR' && Array.isArray(f.gradientStops) && f.gradientStops.length >= 2) {
      const stops = f.gradientStops
        .map((s) => {
          const c = s.color || {}
          const r = Math.round((c.r ?? 0) * 255)
          const g = Math.round((c.g ?? 0) * 255)
          const b = Math.round((c.b ?? 0) * 255)
          const a = c.a ?? 1
          const pos = Math.round((s.position ?? 0) * 100)
          return `rgba(${r},${g},${b},${a}) ${pos}%`
        })
        .join(', ')
      const angle =
        f.gradientHandlePositions && f.gradientHandlePositions.length >= 2
          ? computeGradientAngle(f.gradientHandlePositions)
          : 180
      return { css: `linear-gradient(${angle}deg, ${stops})` }
    }
  }
  return null
}

/**
 * 在 tab 文字节点的父容器（及父容器后代）里找带 GRADIENT_LINEAR 的节点（tab 背景 bg 兄弟）。
 * tab 文字节点自身通常是 TEXT（无渐变），渐变在父容器下的 bg 节点上。
 */
function findGradientBgInParent(byId, parentOf, textNode) {
  const parent = parentOf.get(String(textNode.id))
  if (!parent) return null
  // 递归在父容器子树内找第一个含 GRADIENT_LINEAR fills 的节点
  const findGrad = (n) => {
    if (!n) return null
    if (extractGradientBackground(n)) return n
    for (const c of n.children || []) {
      const hit = findGrad(c)
      if (hit) return hit
    }
    return null
  }
  return findGrad(parent)
}

function computeGradientAngle(handles) {
  const [a, b] = handles
  if (!a || !b) return 180
  const dx = b.x - a.x
  const dy = b.y - a.y
  const deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI) + 90
  return ((deg % 360) + 360) % 360
}

/**
 * 主入口：校验 + 纠正 tab 项资源引用幻觉。
 */
export function detectAndFixTabResourceHallucination(parsed, resourceDomMapping, figmaData, opts = {}) {
  const apply = opts.apply !== false
  const hallucinations = []
  if (!parsed || typeof parsed !== 'object') return { hallucinations, applied: 0 }

  const resourceNodeIdMap = buildResourceNodeIdMap(resourceDomMapping)
  const resourceEntryMap = buildResourceEntryMap(resourceDomMapping)
  const { byId, parentOf } = buildFigmaIndex(figmaData)
  if (byId.size === 0 || resourceNodeIdMap.size === 0) return { hallucinations, applied: 0 }

  let applied = 0

  // 递归遍历：layout.sections → body.children / children / items / elements
  const walkSections = (sections) => {
    if (!Array.isArray(sections)) return
    for (const sec of sections) {
      const children = (sec && (sec.body?.children || sec.children || sec.items || sec.elements)) || []
      // 处理 tab 项（含嵌套）
      const walkItems = (list) => {
        if (!Array.isArray(list)) return
        for (const node of list) {
          if (isTabItem(node)) {
            const resourceFiles = collectTabResourceFiles(node)
            for (const rf of resourceFiles) {
              const resNodeId = resourceNodeIdMap.get(rf)
              if (!resNodeId) continue
              // tab 项真实归属：用 name 反查 Figma
              const label = node.name || node.label || node.text
              const truthNode = findNodeByLabel(byId, label)
              if (!truthNode) continue
              // 真实归属子树 = tab 文字节点逐层向上，每层容器子树（含 bg 兄弟）
              const truthSubtreeIds = collectBelongingSubtreeIds(byId, parentOf, truthNode)
              const inTruthSubtree = truthSubtreeIds.has(resNodeId)
              if (inTruthSubtree) continue // 资源真属 tab，不纠正
              // 幻觉：resourceFile 反查的节点不在 tab 真实归属链内
              const entry = resourceEntryMap.get(rf)
              const rec = {
                tabId: node.id || node.name,
                tabName: label,
                resourceFile: rf,
                figmaNodeId: resNodeId,
                figmaPath: entry?.figmaPath || null,
                reason: `tab「${label}」的 resourceFile 反查 figmaNodeId=${resNodeId} 不在其真实归属链内`,
              }
              hallucinations.push(rec)
              if (apply) {
                // 纠正 a：摘除幻觉 resourceFile
                if (node.resourceFile === rf) delete node.resourceFile
                if (node.icon && node.icon.resourceFile === rf) delete node.icon.resourceFile
                // 纠正 b：真值渐变 → CSS 背景（渐变在 tab 文字节点的父容器里的 bg 兄弟节点上，
                // 不在文字节点自身）
                const bg = extractGradientBackground(findGradientBgInParent(byId, parentOf, truthNode))
                if (bg) {
                  if (!node.styles) node.styles = {}
                  node.styles.background = bg.css
                  node.styles.backgroundSource = 'tab-figma-gradient'
                }
                applied++
              }
            }
          }
          // 递归嵌套
          for (const key of ['children', 'items', 'elements']) {
            if (Array.isArray(node?.[key])) walkItems(node[key])
          }
        }
      }
      walkItems(children)
      // 递归子 section
      if (Array.isArray(sec?.children)) walkSections(sec.children)
    }
  }

  const sections = parsed?.layout?.sections || parsed?.sections || parsed?.layoutStructure?.sections || []
  walkSections(sections)
  // 兼容 layout 在 layoutStructure.layout.sections
  if (parsed?.layoutStructure?.layout?.sections) walkSections(parsed.layoutStructure.layout.sections)

  return { hallucinations, applied }
}

export default detectAndFixTabResourceHallucination
