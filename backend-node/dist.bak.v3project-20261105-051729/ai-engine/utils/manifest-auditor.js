/**
 * manifest-auditor.js — Loop 4 双裁判门禁「审计器」
 *
 * 【职责】
 * 把「Golden 真值」（figma-golden-extractor 产出，锁定于 docs/golden-manifests/）与
 * 「Working Manifest」（管线装配产物）做确定性 diff；并对生成的产物文件做 verifyProduct。
 * 任一类别非空即 fail-closed → BLOCK（返回 issues，调用方据此拒绝落盘）。
 *
 * 【为什么独立（Loop 4 铁律）】
 * 与 figma-golden-extractor 同约束：**绝不 import engineer / mounter / parser / graph**，
 * 不依赖装配层代码路径——否则装配层 bug 会被掩盖。仅复用资源归属纯函数
 * （buildResourceManifest 的 sections 语义）作为比较基准。
 *
 * 【三类判定】
 *  1. structural.shifted：Golden 结构真值（provenance.structural，来自 Figma 树）与 Working
 *     的结构比对，bbox 偏移 >8px 或 >5% → shifted（含新增/缺失节点）。
 *  2. resource.misbound：资源归属漂移——同 assignedVarName 在 Golden 与 Working 落到不同
 *     section；或 Working 引用了 Golden 不存在的资源（臆造变量）；或 figmaNodeId 在 Golden
 *     树索引中缺失（mapping-tree 不一致，traffic 样本实锤）→ 按 provenance 分级。
 *  3. contract.missingPass：Working.contracts 应覆盖 Golden 的 section→资源归属；若某 section
 *     的资源在 Working 中未被任何 contract.parentMustPass 覆盖 → missingPass。
 *
 * 【阈值纪律（宁可漏报不可误杀，与 FLEX-005 / VERT-004 一致）】
 *  - 比对宽度/高度用「max(8px, 5%)」双阈值（常见 Figma 取整 ±1px 不报）。
 *  - mapping-tree 缺失（nodeMissing）只在 Golden 自身为纯 mapping-fallback 且 Working 也未
 *    提供树证据时降级为 WARN，避免对 traffic 这类跨 revision fixture 误 BLOCK。
 *
 * 纯函数（无 import.meta），jest(ts-jest CJS) 可直接 require。
 */

// 偏移双阈值：
const SHIFT_ABS = 8 // px
const SHIFT_RATIO = 0.05 // 5%

function normBox(bb) {
  if (!bb || typeof bb !== 'object') return null
  const x = Number(bb.x)
  const y = Number(bb.y)
  const w = Number(bb.width ?? bb.w)
  const h = Number(bb.height ?? bb.h)
  if (![x, y, w, h].every(Number.isFinite)) return null
  return { x, y, width: w, height: h }
}

function boxShift(a, b) {
  const na = normBox(a)
  const nb = normBox(b)
  if (!na || !nb) return null
  const dx = Math.abs(na.x - nb.x)
  const dy = Math.abs(na.y - nb.y)
  const dw = Math.abs(na.width - nb.width)
  const dh = Math.abs(na.height - nb.height)
  const ratioW = na.width > 0 ? dw / na.width : 0
  const ratioH = na.height > 0 ? dh / na.height : 0
  const absHit = dx > SHIFT_ABS || dy > SHIFT_ABS || dw > SHIFT_ABS || dh > SHIFT_ABS
  const ratioHit = ratioW > SHIFT_RATIO || ratioH > SHIFT_RATIO
  if (absHit || ratioHit) {
    return { dx, dy, dw, dh, ratioW, ratioH }
  }
  return null
}

/** 收集 Golden 结构真值（provenance.structural）按 figmaNodeId 索引 */
function goldenStructuralIndex(golden) {
  const idx = new Map()
  const list = golden?.golden?.structural || []
  for (const s of list) {
    if (s && s.figmaNodeId) idx.set(String(s.figmaNodeId), s)
  }
  return idx
}

/** Working 结构提取（从 working.golden.structural 或 working 顶层 structural） */
function workingStructuralList(working) {
  return working?.golden?.structural || working?.structural || []
}

/**
 * 1. structural.shifted：Golden 结构 vs Working 结构
 * 两边都应带 {figmaNodeId, bbox}。Golden 无 structural（未锁真值）→ 跳过该类（不误杀）。
 * @returns {Array}
 */
export function diffStructural(golden, working) {
  const gIdx = goldenStructuralIndex(golden)
  if (gIdx.size === 0) return []
  const wList = workingStructuralList(working)
  const wById = new Map()
  for (const s of wList) if (s && s.figmaNodeId) wById.set(String(s.figmaNodeId), s)

  const issues = []
  // Golden 节点在 Working 中存在但 bbox 偏移 → shifted
  for (const [nid, g] of gIdx) {
    const w = wById.get(nid)
    if (!w) {
      issues.push({
        code: 'structural.shifted',
        id: nid,
        detail: `结构节点 ${nid}（${g.name || ''}）在 Working 中缺失`,
        severity: 'BLOCK',
      })
      continue
    }
    const shift = boxShift(g.bbox, w.bbox)
    if (shift) {
      issues.push({
        code: 'structural.shifted',
        id: nid,
        detail: `结构节点 ${nid}（${g.name || ''}）bbox 偏移超出阈值：dx=${shift.dx.toFixed(1)} dy=${shift.dy.toFixed(1)} dw=${shift.dw.toFixed(1)} dh=${shift.dh.toFixed(1)}（阈值 ${SHIFT_ABS}px 或 ${SHIFT_RATIO * 100}%）`,
        severity: 'BLOCK',
      })
    }
  }
  return issues
}

/** 取 manifest 的 sections 归一化 ownerMap：assignedVarName → Set(sectionKey) */
function ownerMapOf(manifest) {
  const map = new Map()
  const sections = manifest?.sections || {}
  for (const [sec, list] of Object.entries(sections)) {
    for (const m of Array.isArray(list) ? list : []) {
      const v = m && (m.assignedVarName || m.semanticVarName)
      if (!v) continue
      if (!map.has(v)) map.set(v, new Set())
      map.get(v).add(sec)
    }
  }
  return map
}

/** 取 manifest 的全部 assignedVarName 集合（含 panel/unassigned/sections） */
function allVarNameSet(manifest) {
  const set = new Set()
  for (const m of manifest?.resources || []) {
    const v = m && (m.assignedVarName || m.semanticVarName)
    if (v) set.add(v)
  }
  return set
}

/**
 * 2. resource.misbound：资源归属漂移
 *  - 同变量在 Golden / Working 落到不同 section → 错绑
 *  - Working 引用了 Golden 不存在的变量（臆造）→ 必须 BLOCK
 *  - Golden provenance.nodeMissing 中的 figmaNodeId 在 Working 仍被引用且 Mapping 缺树证据
 *    → 仅当 Golden 是 tree 证据（treeHits>0）时判 misbound，否则降级（traffic 跨 revision 不误杀）
 * @returns {Array}
 */
export function diffResources(golden, working) {
  const gMap = ownerMapOf(golden)
  const wMap = ownerMapOf(working)
  const issues = []

  // 2a. 错绑：同变量不同 section
  for (const [v, gSecs] of gMap) {
    const wSecs = wMap.get(v)
    if (!wSecs) continue // 2b 单独处理缺失
    for (const gs of gSecs) {
      if (!wSecs.has(gs)) {
        issues.push({
          code: 'resource.misbound',
          id: v,
          detail: `资源 ${v} 在 Golden 归属 ${[...gSecs].join('/')}，但 Working 归属 ${[...wSecs].join('/')}（跨 section 错绑）`,
          severity: 'BLOCK',
        })
        break
      }
    }
  }

  // 2b. Working 臆造变量（Golden 无此变量）→ BLOCK
  const gAll = allVarNameSet(golden)
  for (const v of wMap.keys()) {
    if (!gAll.has(v)) {
      issues.push({
        code: 'resource.misbound',
        id: v,
        detail: `Working 引用资源 ${v} 不在 Golden 真值中（臆造绑定 / 跨样本串绑），Golden 资源集=${gAll.size}`,
        severity: 'BLOCK',
      })
    }
  }

  // 2c. mapping-tree 不一致（traffic 跨 revision 实锤）：Golden provenance.nodeMissing 中的
  // nodeId 在 Working 仍被引用 → 仅在 Golden 有 tree 证据（treeIndexed && treeHits>0）时判 BLOCK，
  // 否则降级为 WARN（避免对纯 mapping-fallback 样本误杀）。
  const prov = golden?.golden?.provenance || {}
  const nodeMissing = Array.isArray(prov.nodeMissing) ? prov.nodeMissing : []
  if (nodeMissing.length > 0 && prov.treeIndexed && prov.treeHits > 0) {
    const wAll = allVarNameSet(working)
    // 若 Working 也包含这些 node（说明 mapping 与树不一致延续）→ 已是 resource.misbound 范畴，
    // 这里补充一条结构性提示（仍 BLOCK，因 Golden 有真实树证据而 Working 与之矛盾）。
    for (const nid of nodeMissing) {
      issues.push({
        code: 'resource.misbound',
        id: `tree:${nid}`,
        detail: `资源映射引用 figmaNodeId ${nid} 在 Figma 树中不存在（mapping/树 revision 不一致），Golden 树证据下视为错绑`,
        severity: 'BLOCK',
      })
    }
  }

  return issues
}

/**
 * 3. contract.missingPass：Working.contracts 应覆盖 Golden 的 section→资源归属
 * 对每个 Golden section 的资源变量，检查是否被任一 contract.parentMustPass 覆盖。
 * @returns {Array}
 */
export function diffContracts(golden, working) {
  const gMap = ownerMapOf(golden)
  const contracts = Array.isArray(working?.contracts) ? working.contracts : []
  // 契约制度未启用（Working 无 contracts）→ 无从判断「父组件是否漏透传」，跳过该类。
  // 若强行对空契约求 missingPass，会把每个 section 资源都误判为 BLOCK（含单文件组件场景）。
  // 与 FLEX-005 / VERT-004 同纪律：不可证不报。
  if (contracts.length === 0) return []
  const covered = new Set()
  for (const c of contracts) {
    for (const v of c.parentMustPass || []) covered.add(v)
  }
  const issues = []
  for (const [v, secs] of gMap) {
    if (!covered.has(v)) {
      issues.push({
        code: 'contract.missingPass',
        id: v,
        detail: `资源 ${v}（归属 ${[...secs].join('/')}）未被任何 contract.parentMustPass 覆盖（父组件导入遗漏，子组件 props 透传断裂）`,
        severity: 'BLOCK',
      })
    }
  }
  return issues
}

/**
 * 总 diff：合并三类，附加 summary（各类计数 + 是否 BLOCK）。
 * @returns {{issues:Array, blocked:boolean, summary:object}}
 */
export function diffManifest(golden, working) {
  const issues = [
    ...diffStructural(golden, working),
    ...diffResources(golden, working),
    ...diffContracts(golden, working),
  ]
  const byCode = {}
  for (const i of issues) byCode[i.code] = (byCode[i.code] || 0) + 1
  const blocked = issues.some((i) => i.severity === 'BLOCK')
  return {
    issues,
    blocked,
    summary: {
      total: issues.length,
      blocked: issues.filter((i) => i.severity === 'BLOCK').length,
      byCode,
    },
  }
}

/**
 * verifyProduct：对产物文件做轻量确定性校验（不依赖渲染）。
 * 当前实现：检查每个 contract.parentMustPass 变量在 package/index.vue（或其子组件）
 * 确有 import（避免「契约声明了 import 却没写」的静默失败）。
 * 不强制全量引用，只检查「声明即写入」。
 * @param {object} working Working Manifest（含 contracts）
 * @param {Object<string,string>} files 产物文件表（path → content）
 * @returns {{issues:Array, blocked:boolean, summary:object}}
 */
export function verifyProduct(working, files = {}) {
  const contracts = Array.isArray(working?.contracts) ? working.contracts : []
  if (contracts.length === 0) {
    return { issues: [], blocked: false, summary: { total: 0, blocked: 0, byCode: {} } }
  }
  const fileList = Object.entries(files).filter(([, c]) => typeof c === 'string')
  const issues = []
  for (const c of contracts) {
    const file = c.file || 'package/index.vue'
    const content = files[file] || ''
    for (const v of c.parentMustPass || []) {
      // import 形式：from '.../resources/images/...' 或 const v = ...；检查变量名出现
      const re = new RegExp(`(import\\s+${escapeRe(v)}\\s+from|const\\s+${escapeRe(v)}\\s*=)`)
      const imported = re.test(content) || fileList.some(([, c2]) => new RegExp(`\\b${escapeRe(v)}\\b`).test(c2))
      if (!imported) {
        issues.push({
          code: 'contract.missingPass',
          id: `${file}:${v}`,
          detail: `契约要求 ${file} 导入资源变量 ${v}，但产物中未找到 import（写盘静默失败）`,
          severity: 'BLOCK',
        })
      }
    }
  }
  const byCode = {}
  for (const i of issues) byCode[i.code] = (byCode[i.code] || 0) + 1
  return {
    issues,
    blocked: issues.some((i) => i.severity === 'BLOCK'),
    summary: { total: issues.length, blocked: issues.filter((i) => i.severity === 'BLOCK').length, byCode },
  }
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 门禁总入口：Golden 锁死样本 + Working Manifest + 产物文件。
 * structural / resource / contract 任一非空 → BLOCK。
 * @returns {{issues:Array, blocked:boolean, summary:object}}
 */
export function audit(golden, working, files) {
  const d = diffManifest(golden, working)
  const v = verifyProduct(working, files || {})
  const issues = [...d.issues, ...v.issues]
  const byCode = {}
  for (const i of issues) byCode[i.code] = (byCode[i.code] || 0) + 1
  return {
    issues,
    blocked: d.blocked || v.blocked,
    summary: {
      total: issues.length,
      blocked: issues.filter((i) => i.severity === 'BLOCK').length,
      byCode,
    },
  }
}

/**
 * auditSelfConsistency：**无 Golden 场景**（活流量每轮）的自洽门禁入口。
 *
 * 【为什么不能用 audit(null, ...)】
 * diffResources(null, working) 会把 Working 的每个资源变量都判成「Golden 不存在 → 臆造」
 * → 全量 BLOCK。Golden 缺失时必须走「自洽」而非「对照」，否则门禁变成对活流量的定时炸弹。
 *
 * 自洽口径（不依赖任何外部真值，故不能误杀）：
 *  - 契约声明即写入：contracts[].parentMustPass 的变量必须在产物文件中确有 import/声明
 *    （verifyProduct，即 CODE-018「契约声明了 import 却没写」的确定性探测）。
 *  - 契约未启用（working.contracts 为空）→ 无可证伪项 → 不 BLOCK（与 FLEX-005/VERT-004 同纪律）。
 *
 * @returns {{issues:Array, blocked:boolean, summary:object}}
 */
export function auditSelfConsistency(working, files = {}) {
  return verifyProduct(working, files || {})
}

export default audit
