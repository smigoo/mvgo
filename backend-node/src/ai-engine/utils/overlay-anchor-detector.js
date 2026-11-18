/**
 * 🛡️ 角标（badge/overlay）检测器（2026-11-18 · D5 实锤方案落地，判据经三轮收敛）
 *
 * 病根：Figma 里角标与宿主是同父兄弟，「叠在上面」仅靠 bbox 骑跨重叠表达（D5 实测
 *   badge↔tab 重叠率 0.36~0.39，tab↔tab 恒 0）⇒ 下游按兄弟序列流内 flex 排 ⇒
 *   badge 挤占行内空间 ⇒ Tab 条撑宽溢出。
 *
 * 最终判据（四条件全满足才判 overlay，可辩驳）：
 *   ① c 名含 badge/tag/dot/角标（真值命名；badge-status 等流内 pill 也含，靠④区分）；
 *   ② 宿主容器有业务文本兄弟（tab/TEXT/子树含 TEXT——排除纯装饰 GROUP 噪声容器）；
 *   ③ 骑跨重叠率 ∈ [0.3, 0.85)（角标骑跨宿主边缘；≥0.85 视为完全包含=流内形态，
 *      badge-status pill 就落在行容器内部 ratio=1.0，靠此排除）；
 *   ④ 对重叠率最高的宿主取唯一 host。
 *
 * 输出契约：c 节点写 `overlay: { hostId, dx, dy }`（c 相对宿主左上角真值偏移），
 * 宿主标 `hasOverlayChildren: true`。纯函数幂等；meta.pairs 出参供计数行。
 * 阴性防线：流内兄弟（重叠 0）、完全包含 pill（1.0）、装饰大图（面积方向相反）全排除。
 */
import { indexFigmaNodes, getFigmaBox } from './section-tree.js'

const RATIO_MIN = 0.3
const RATIO_MAX_EXCL = 0.85
const NAME_RE = /badge|tag|dot|角标/i

function subtreeHasText(rec) {
  const stack = [rec?.rawNode]
  while (stack.length) {
    const n = stack.pop()
    if (!n) continue
    if (String(n.type) === 'TEXT') return true
    for (const c of n.children || []) stack.push(c)
  }
  return false
}

export function detectOverlayChildren(figmaData, meta = null) {
  if (!figmaData || typeof figmaData !== 'object') {
    return { overlays: 0, pairs: [] }
  }
  const index = indexFigmaNodes(figmaData.document || figmaData)
  if (index.size === 0) return { overlays: 0, pairs: [] }

  let overlays = 0
  const pairs = []

  for (const rec of index.values()) {
    const kids = rec?.rawNode?.children
    if (!Array.isArray(kids) || kids.length < 2) continue
    const boxes = kids.map((k) => ({
      id: String(k.id),
      rec: index.get(String(k.id)),
      box: getFigmaBox(index.get(String(k.id)) || {}),
    }))
    // ② 宿主容器有业务文本兄弟（tab 名/TEXT/子树 TEXT）
    const hasBizText = boxes.some(({ rec: r }) => {
      if (!r) return false
      if (String(r.type) === 'TEXT') return true
      if (/tab/i.test(String(r.name || ''))) return true
      return subtreeHasText(r)
    })
    if (!hasBizText) continue
    const area = (b) => (b ? b.w * b.h : 0)
    for (const { id, rec: cRec, box: cbox } of boxes) {
      // ① 真值命名
      if (!NAME_RE.test(String(cRec?.name || ''))) continue
      if (!cbox || cbox.w <= 0 || cbox.h <= 0) continue
      const areaC = area(cbox)
      if (areaC <= 0) continue
      // ③④ 骑跨重叠率最高的宿主
      let best = null
      for (const { id: hid, box: hbox } of boxes) {
        if (hid === id || !hbox) continue
        const ox = Math.max(0, Math.min(cbox.x + cbox.w, hbox.x + hbox.w) - Math.max(cbox.x, hbox.x))
        const oy = Math.max(0, Math.min(cbox.y + cbox.h, hbox.y + hbox.h) - Math.max(cbox.y, hbox.y))
        const ratio = (ox * oy) / areaC
        if (ratio > best) best = ratio
      }
      if (best < RATIO_MIN || best >= RATIO_MAX_EXCL) continue
      const hostBest = (() => {
        let bestHost = null
        for (const { id: hid, box: hbox } of boxes) {
          if (hid === id || !hbox) continue
          const ox = Math.max(0, Math.min(cbox.x + cbox.w, hbox.x + hbox.w) - Math.max(cbox.x, hbox.x))
          const oy = Math.max(0, Math.min(cbox.y + cbox.h, hbox.y + hbox.h) - Math.max(cbox.y, hbox.y))
          const ratio = (ox * oy) / areaC
          if (ratio < RATIO_MIN || ratio >= RATIO_MAX_EXCL) continue
          if (!bestHost || ratio > bestHost.ratio) {
            bestHost = {
              hostId: hid,
              ratio,
              dx: Math.round((cbox.x - hbox.x) * 10) / 10,
              dy: Math.round((cbox.y - hbox.y) * 10) / 10,
            }
          }
        }
        return bestHost
      })()
      if (!hostBest) continue
      if (cRec?.rawNode) {
        cRec.rawNode.overlay = { hostId: hostBest.hostId, dx: hostBest.dx, dy: hostBest.dy }
        const hostRec = index.get(hostBest.hostId)
        if (hostRec?.rawNode) hostRec.rawNode.hasOverlayChildren = true
        overlays += 1
        pairs.push({ from: id, to: hostBest.hostId, ratio: Math.round(hostBest.ratio * 100) / 100 })
        if (meta && !meta.pairs.some((p) => p.from === id)) {
          meta.pairs.push({ from: id, to: hostBest.hostId, ratio: Math.round(hostBest.ratio * 100) / 100 })
        }
      }
    }
  }
  return { overlays, pairs }
}
