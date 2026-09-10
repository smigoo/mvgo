/**
 * figma-golden-extractor.js — Loop 4 双裁判门禁「Golden 提取器」
 *
 * 【职责】
 * 从**输入侧**（Figma 节点树 + 资源下载结果 resourceDomMapping）确定性生成一份
 * 与 Working Manifest（`utils/resource-manifest.js` 的 buildResourceManifest 产物）
 * **同构**的 Golden Manifest JSON，供 manifest-auditor 做 diff(golden, working)。
 *
 * 【为什么独立（Loop 4 铁律）】
 * Golden 必须在「生成」发生之前、由输入侧独立得出。若与装配层（engineer / mounter /
 * visual-parser）共用代码路径，则装配层的 bug 会同时污染 golden 与 working → diff 恒为空
 * → 门禁形同虚设。故本模块：
 *   - 只 import 契约纯函数（resource-manifest.js 的 sectionKey 语义单一事实源），
 *     **绝不** import engineer / mounter / parser / graph；
 *   - figmaPath 由 Figma 树**祖先链独立推导**，不信任 mapping 自带的 figmaPath 字段
 *     （树中命中时以树为准，provenance='figma-tree'；树中缺失时回退 mapping 字段，
 *     provenance='mapping-fallback'，并登记进 provenance.nodeMissing 供审计）。
 *
 * 【traffic 样本实证（2026-09-11）】
 * fixtures/0907/traffic 的 mapping.figmaNodeId 全部不在其 figma-node-data 树中
 * （树 id 2:35xx vs mapping 2:34xx，属不同 revision）→ 树推导必然全部缺失。
 * 若一律判 BLOCK 会产生 9 条误报。故设计为「树优先 + mapping 回退 + provenance 记档」，
 * 既不臆造真值也不误杀，差异交由 auditor 按 provenance 分级处理。
 *
 * 纯函数（除 hash 用 node:crypto），无 import.meta，jest(ts-jest CJS) 可直接 require。
 */

import { createHash } from 'node:crypto'
import { buildResourceManifest } from './resource-manifest.js'

/** Golden Manifest 形态版本（与 Working 的 'wm-1' 同构，额外挂 golden 元信息） */
export const GOLDEN_VERSION = 'g-1'

/**
 * 递归收集 Figma 树索引：id → 节点、id → 祖先链推导路径、id → bbox。
 * @param {object} doc Figma document 节点（含 children）
 * @returns {{byId:Map<string,object>, pathOf:Map<string,string>, bboxOf:Map<string,object>}}
 */
function indexFigmaTree(doc) {
  const byId = new Map()
  const pathOf = new Map()
  const bboxOf = new Map()
  const walk = (node, ancestors) => {
    if (!node || typeof node !== 'object') return
    const id = node.id != null ? String(node.id) : ''
    const name = String(node.name || '')
    const here = name ? [...ancestors, name] : ancestors
    if (id) {
      byId.set(id, node)
      pathOf.set(id, here.join('/'))
      if (node.absoluteBoundingBox) bboxOf.set(id, node.absoluteBoundingBox)
    }
    const kids = Array.isArray(node.children) ? node.children : []
    for (const c of kids) walk(c, here)
  }
  walk(doc, [])
  return { byId, pathOf, bboxOf }
}

/** 规整 bbox 为 {x,y,width,height}（缺失返回 null） */
function normBox(bb) {
  if (!bb || typeof bb !== 'object') return null
  const x = Number(bb.x)
  const y = Number(bb.y)
  const w = Number(bb.width ?? bb.w)
  const h = Number(bb.height ?? bb.h)
  if (![x, y, w, h].every(Number.isFinite)) return null
  return { x, y, width: w, height: h }
}

/**
 * 把输入侧 mapping 解析为「树优先」的归属元数据。
 *
 * 对每条 mapping：
 *   - 树中命中 figmaNodeId → 用树推导 figmaPath / bbox，provenance='figma-tree'
 *   - 树中缺失 → 回退 mapping.figmaPath / mapping.figmaBox，provenance='mapping-fallback'
 *   - 无 figmaNodeId → 直接回退 mapping 字段，provenance='mapping-fallback'
 *
 * 解析结果**不改写**原 mapping（避免污染调用方缓存），仅产出用于 buildResourceManifest 的副本。
 *
 * @param {Array} mappings resourceDomMapping
 * @param {{byId:Map,pathOf:Map,bboxOf:Map}|null} treeIndex
 * @returns {{resolved:Array, nodeMissing:Array, stats:object}}
 */
export function resolveOwnershipFromInput(mappings, treeIndex) {
  const list = Array.isArray(mappings) ? mappings : []
  const resolved = []
  const nodeMissing = []
  let treeHits = 0
  let fallbacks = 0

  for (const m of list) {
    if (!m || typeof m !== 'object') {
      resolved.push(m)
      continue
    }
    const nid = m.figmaNodeId != null ? String(m.figmaNodeId) : ''
    const hit = nid && treeIndex && treeIndex.byId.has(nid)
    if (hit) {
      treeHits += 1
      const treePath = treeIndex.pathOf.get(nid) || m.figmaPath
      const treeBox = normBox(treeIndex.bboxOf.get(nid)) || normBox(m.figmaBox)
      resolved.push({
        ...m,
        figmaPath: treePath,
        figmaBox: treeBox || m.figmaBox,
        _ownerProvenance: 'figma-tree',
      })
    } else {
      fallbacks += 1
      if (nid && treeIndex) nodeMissing.push(nid)
      resolved.push({
        ...m,
        _ownerProvenance: 'mapping-fallback',
      })
    }
  }

  return {
    resolved,
    nodeMissing,
    stats: { total: list.length, treeHits, fallbacks, nodeMissing: nodeMissing.length },
  }
}

/**
 * 由 Figma 树独立提取「结构真值」：顶层业务容器（section 级）及其 bbox。
 * 供 auditor 的 structural.shifted 比对（bbox 偏移 >8px 或 >5%）。
 *
 * 只取顶层容器（document 的直接业务子节点，跳过 header/hidden），不做语义猜测——
 * 结构真值越朴素越可靠。
 *
 * @param {object} doc Figma document
 * @returns {Array<{figmaNodeId:string,name:string,bbox:object|null}>}
 */
export function extractStructuralSections(doc) {
  if (!doc || typeof doc !== 'object') return []
  const kids = Array.isArray(doc.children) ? doc.children : []
  const out = []
  for (const k of kids) {
    if (!k || typeof k !== 'object') continue
    const nm = String(k.name || '')
    if (!nm || k.visible === false) continue
    out.push({
      figmaNodeId: k.id != null ? String(k.id) : '',
      name: nm,
      bbox: normBox(k.absoluteBoundingBox),
    })
  }
  return out
}

/** 稳定序列化（递归排序 key），保证 hash 与 key 顺序无关 */
function stableStringify(value) {
  const seen = new WeakSet()
  const norm = (v) => {
    if (v === null || typeof v !== 'object') return v
    if (seen.has(v)) return undefined
    seen.add(v)
    if (Array.isArray(v)) return v.map(norm)
    const out = {}
    for (const k of Object.keys(v).sort()) {
      const nv = norm(v[k])
      if (nv !== undefined) out[k] = nv
    }
    return out
  }
  return JSON.stringify(norm(value))
}

/**
 * Golden Manifest 稳定 hash（锁定用）。只对**可比较子集**求 hash：
 * sections / sectionOrder / panel / unassigned / resources 的归属与 bbox，
 * 不含 provenance / 时间戳等易变字段，保证同输入恒同 hash。
 * @param {object} golden
 * @returns {string} sha256 hex（前 16 位足够锁定）
 */
export function hashGolden(golden) {
  const subset = {
    version: golden?.version,
    sectionOrder: golden?.sectionOrder || [],
    sections: golden?.sections || {},
    panel: golden?.panel || [],
    unassigned: golden?.unassigned || [],
  }
  return createHash('sha256').update(stableStringify(subset)).digest('hex').slice(0, 16)
}

/**
 * 主入口：从输入侧生成 Golden Manifest。
 *
 * @param {object} input
 * @param {object} input.figmaNodeData Figma 节点数据（含 document；或直接传 document）
 * @param {Array} input.resourceDomMapping 资源下载结果（权威资源事实源）
 * @param {object} [input.meta] 样本元信息（sample / fileKey / nodeId），写入 provenance
 * @returns {object} Golden Manifest（与 Working Manifest 同构 + golden 元信息）
 */
export function extractGoldenManifest(input = {}) {
  const figmaNodeData = input.figmaNodeData || null
  const doc = figmaNodeData?.document || figmaNodeData || null
  const mappings = input.resourceDomMapping || []
  const meta = input.meta || {}

  const treeIndex = doc ? indexFigmaTree(doc) : null
  const { resolved, nodeMissing, stats } = resolveOwnershipFromInput(mappings, treeIndex)

  // 复用契约纯函数构建同构 Manifest（sectionKey 语义单一事实源，禁止二次实现）
  const manifest = buildResourceManifest(resolved)

  // 归属统计：把 _ownerProvenance 计数从资源条目上还原（不写入节分组 key）
  const treeHits = resolved.filter((m) => m && m._ownerProvenance === 'figma-tree').length
  const fallbacks = resolved.filter((m) => m && m._ownerProvenance === 'mapping-fallback').length

  const golden = {
    version: manifest.version,
    sections: manifest.sections,
    sectionOrder: manifest.sectionOrder,
    panel: manifest.panel,
    unassigned: manifest.unassigned,
    resources: manifest.resources,
    contracts: [],
    golden: {
      goldenVersion: GOLDEN_VERSION,
      strategy: 'figma-tree-first+mapping-fallback',
      structural: extractStructuralSections(doc),
      provenance: {
        sample: meta.sample || null,
        fileKey: meta.fileKey ?? figmaNodeData?.fileKey ?? null,
        nodeId: meta.nodeId ?? figmaNodeData?.nodeId ?? null,
        treeIndexed: Boolean(treeIndex && treeIndex.byId.size > 0),
        resourceCount: mappings.length,
        treeHits,
        fallbacks,
        nodeMissing,
      },
    },
  }
  golden.golden.hash = hashGolden(golden)
  return golden
}

export default extractGoldenManifest
