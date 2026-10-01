/**
 * 🛡️ P1-7（2026-10-01 · c-a812-07a812f7 实锤）：vision 锚点真值校验。
 *
 * ── 问题 ────────────────────────────────────────────────────────────────────
 * vision 返回的节点 id 是「半真半假」的：
 *   - 部分真实（`210:45458` = 根子块、`210:45649` = 真实存在但只是个单元格）；
 *   - 部分幻觉（`210:45650` 真值树中**不存在**，是 `210:45649 + 1` 的顺延臆造）；
 *   - 部分错位（`210:45651` 真值 = 文本「张斌」，vision 却标成「表头/姓名」）。
 * 下游把不存在的 id 当锚点用 ⇒ 真值无法驱动装配 ⇒ 退化成 vision-only 盲写，
 * 且**零报警**（该任务的 `role:table` 语义因此被丢弃）。
 *
 * ── 本模块的边界（fail-open，只校验不纠偏） ─────────────────────────────────
 *   - 收集 Figma 真值树全部节点 id；
 *   - 遍历分析结果，凡 `id` / `figmaNodeId` 形如 `N:M` 的都做存在性校验；
 *   - 不存在的对象**原地标注 `anchorValid:false`** 并计入诊断（供 planner / 门禁消费）；
 *   - **不做回填** —— 回填（祖先链归并）判据独立，归 P3-13 / #78 S2。
 *
 * 纯函数、零依赖（不 import logger，日志由调用方按返回值打），单测直测。
 */

/** Figma 节点 id 形态（`210:45641`） */
const FIGMA_ID_RX = /^\d+:\d+$/

/** 诊断明细上限（防臆造风暴撑爆 visual.json） */
const MAX_INVALID_DETAIL = 30

/**
 * 收集 Figma 真值树的全部节点 id（`document` 包装与裸根两种形态都兼容）。
 *
 * @param {object} figmaNodeData Figma 节点树（含 children）
 * @returns {Set<string>}
 */
export function collectFigmaNodeIds(figmaNodeData) {
  const ids = new Set()
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 40) return
    if (typeof node.id === 'string' && FIGMA_ID_RX.test(node.id)) ids.add(node.id)
    const kids = Array.isArray(node.children) ? node.children : []
    for (const c of kids) walk(c, depth + 1)
  }
  walk(figmaNodeData?.document || figmaNodeData, 0)
  return ids
}

/** 从校验路径推出归属域（顶层 key），便于诊断按域聚合 */
function areaOf(path) {
  const top = String(path || '').split('.')[0]
  return top || 'root'
}

function bumpArea(map, area, ok) {
  const cur = map.get(area) || { checked: 0, invalid: 0 }
  cur.checked += 1
  if (!ok) cur.invalid += 1
  map.set(area, cur)
}

/**
 * 校验分析结果里所有 `N:M` 形态的锚点是否存在于 Figma 真值树。
 *
 * 副作用：对**不存在**的锚点，在其所属对象上补 `anchorValid:false`
 * （只加标注、不改结构；下游据此判定「该 section 无法按真值装配」）。
 *
 * @param {object} analysisResult vision 分析结果（已 JSON 解析）
 * @param {object} figmaNodeData Figma 真值树
 * @returns {{
 *   truthNodeCount: number, checked: number, valid: number, invalid: number,
 *   validRatio: number|null, byArea: Object<string,{checked:number,invalid:number}>,
 *   invalidDetail: Array<{path:string, key:string, id:string}>
 * }}
 */
export function validateVisionAnchors(analysisResult, figmaNodeData) {
  const byArea = new Map()
  const out = {
    truthNodeCount: 0,
    checked: 0,
    valid: 0,
    invalid: 0,
    validRatio: null,
    byArea: {},
    invalidDetail: [],
  }
  const truth = collectFigmaNodeIds(figmaNodeData)
  out.truthNodeCount = truth.size
  if (!analysisResult || typeof analysisResult !== 'object' || truth.size === 0) return out

  const seen = new WeakSet()
  const visit = (node, path, depth) => {
    if (!node || typeof node !== 'object' || depth > 14) return
    if (seen.has(node)) return
    seen.add(node)

    for (const key of ['id', 'figmaNodeId']) {
      const raw = node[key]
      if (typeof raw !== 'string') continue
      const v = raw.trim()
      if (!FIGMA_ID_RX.test(v)) continue
      out.checked += 1
      const area = areaOf(path)
      const ok = truth.has(v)
      bumpArea(byArea, area, ok)
      if (ok) {
        out.valid += 1
        continue
      }
      out.invalid += 1
      // 归一化 + 标注（只在确证不存在时写）
      node[key] = v
      node.anchorValid = false
      if (out.invalidDetail.length < MAX_INVALID_DETAIL) {
        out.invalidDetail.push({ path: path || 'root', key, id: v })
      }
    }

    for (const k of Object.keys(node)) {
      const v = node[k]
      if (v && typeof v === 'object') visit(v, path ? `${path}.${k}` : k, depth + 1)
    }
  }
  visit(analysisResult, '', 0)

  out.byArea = Object.fromEntries(byArea)
  if (out.checked > 0) {
    out.validRatio = Math.round((out.valid / out.checked) * 1000) / 10
  }
  return out
}
