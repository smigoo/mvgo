/**
 * 🛡️ 刀 7（2026-10-27 · 8bbcf027 `36:1695` 实锤）：容器「吸收背景层」判据。
 *
 * 病灶：容器（`isLayoutContainer`，仅空间包裹、不单独生成 .vue）的 `sourceNodeIds`
 * 会吸收「自带可见 SOLID 填充的 RECTANGLE 底卡」（真值 `36:1695` 547×193 #E1EBFF r12）。
 * 它不是任何叶子的锚点 ⇒ 四层事实链上没有任何载体 ⇒ 产物里该背景色 0 次出现。
 *
 * 治本：装配层（`code-generator#buildDeterministicIndexTemplate` 容器分支）把这类
 * 「被吸收且无人认领」的矩形渲染为容器内的**绝对定位背景层**（`z-index:-1` 沉到内容之下、
 * 容器背景之上），几何用「边锚定」表达：
 *   - 边与容器贴合 ⇒ 该边 `:0`（跟随容器尺寸，不随 flex 比例漂移）；
 *   - 单边贴合 ⇒ 贴合边 `:0` + 真值尺寸；
 *   - 不贴合 ⇒ 真值偏移 + 真值尺寸。
 *
 * 判据（全走 Figma 真值，逐事实缺失即 fail-open，不猜）：
 *   ① 节点在容器 sourceNodeIds 里且能被 figmaIndex 解析；
 *   ② 不是容器自身、未被任何叶子认领（claimedIds）；
 *   ③ type === 'RECTANGLE'（窄判据：ELLIPSE/FRAME 的语义不同，不泛化）；
 *   ④ 有可见 SOLID fill（IMAGE fill 走资源通道，不是本判据职责）；
 *   ⑤ bbox 完整且不越出容器 bbox（部分越出 = 归属语义不同，绝不用部分重叠猜）。
 *
 * 纯函数（不读盘、不改入参）。任何一条不满足 ⇒ 该节点跳过，其余照常。
 */
import { fillToRgba } from './section-tree.js'

function boxOf(node) {
  const b = node?.absoluteBoundingBox || node?.bbox
  if (!b) return null
  const { x, y, width, height } = b
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

/** 单轴边锚定：贴合 ⇒ 0；单贴 ⇒ 0+真值尺寸；不贴 ⇒ 偏移+真值尺寸。 */
function axisCss(a0, aSize, c0, cSize, startProp, endProp, sizeProp) {
  const a1 = a0 + aSize
  const c1 = c0 + cSize
  const startTouch = a0 === c0
  const endTouch = a1 === c1
  if (startTouch && endTouch) return `${startProp}:0;${endProp}:0;`
  if (endTouch) return `${endProp}:0;${sizeProp}:${aSize}px;`
  if (startTouch) return `${startProp}:0;${sizeProp}:${aSize}px;`
  return `${startProp}:${a0 - c0}px;${sizeProp}:${aSize}px;`
}

/**
 * @param {Object} sec 容器 section（读 id/sourceNodeIds）
 * @param {Map|null} figmaIndex `indexFigmaNodes` 产物
 * @param {Set<string>} claimedIds 全部叶子认领的节点 id（含叶子自身 id 与其 sourceNodeIds）
 * @returns {{evaluated:number, layers:Array<{id:string, background:string, borderRadius:number|null, edgeCss:string, top:number, left:number, width:number, height:number}>}}
 */
export function resolveAbsorbedBgLayers(sec, figmaIndex, claimedIds) {
  const out = { evaluated: 0, layers: [] }
  if (!sec || !figmaIndex || typeof figmaIndex.get !== 'function') return out
  const src = Array.isArray(sec.sourceNodeIds) ? sec.sourceNodeIds : []
  if (!src.length) return out
  const containerNode = figmaIndex.get(String(sec.id))?.rawNode || figmaIndex.get(String(sec.id))?.node || null
  const cBox = boxOf(containerNode)
  if (!cBox) return out
  const claimed = claimedIds instanceof Set ? claimedIds : new Set()

  for (const rawId of src) {
    const id = String(rawId)
    if (id === String(sec.id)) continue
    if (claimed.has(id)) continue
    const node = figmaIndex.get(id)?.rawNode || figmaIndex.get(id)?.node || null
    if (!node) continue
    if (String(node.type || '').toUpperCase() !== 'RECTANGLE') continue
    out.evaluated += 1

    const fills = Array.isArray(node.fills) ? node.fills : []
    const solid = fills.find((f) => f && f.type === 'SOLID' && f.visible !== false)
    if (!solid) continue
    const background = fillToRgba(solid)
    if (!background) continue

    const b = boxOf(node)
    if (!b) continue
    // 🛡️ 刀 20c（2026-10-28 · 657661ca 实锤）：滚动条滑块/轨道不是背景层——
    //   细长条贴容器右缘（宽 ≤12px、长宽比 ≥4、右缘贴边 ±4px）被吸收后画成
    //   装饰 div ⇒ 视觉上有滚动条但列表不能滚（假滚动）。真值滚由刀 20b 列表
    //   容器的 overflow-y:auto 承担。判据纯几何，不猜语义。
    if (
      b.width <= 12 &&
      b.height >= 4 * b.width &&
      Math.abs(b.x + b.width - (cBox.x + cBox.width)) <= 4
    ) {
      continue
    }
    // 越出容器 ⇒ 归属语义不同，跳过
    if (
      b.x < cBox.x ||
      b.y < cBox.y ||
      b.x + b.width > cBox.x + cBox.width ||
      b.y + b.height > cBox.y + cBox.height
    ) {
      continue
    }

    const radius = Number(node.cornerRadius)
    out.layers.push({
      id,
      background,
      borderRadius: Number.isFinite(radius) && radius > 0 ? radius : null,
      edgeCss:
        axisCss(b.x, b.width, cBox.x, cBox.width, 'left', 'right', 'width') +
        axisCss(b.y, b.height, cBox.y, cBox.height, 'top', 'bottom', 'height'),
      // 审计字段（真值偏移/尺寸，测试与日志可读）
      top: b.y - cBox.y,
      left: b.x - cBox.x,
      width: b.width,
      height: b.height,
    })
  }
  return out
}

/** 背景层的完整内联样式（`z-index:-1` 沉到容器内容之下、容器背景之上）。 */
export function buildAbsorbedBgLayerStyle(layer) {
  if (!layer) return ''
  return (
    `position:absolute;${layer.edgeCss}` +
    `background:${layer.background};` +
    (layer.borderRadius ? `border-radius:${layer.borderRadius}px;` : '') +
    'z-index:-1;'
  )
}

/**
 * 🛡️ 刀 29c（mc-max-1793255115028-7ec263c9 实锤）：collapsed/v-for 列表叶的
 *   **几何包含认领**。病灶：vision items 的 id 可能是卡内层 GROUP（48:5816 真身是
 *   card2 `48:5813` 的内部组，figma 已核实）⇒ sourceNodeIds 闭包（刀 28③ 按 id
 *   展开）拿不到兄弟卡的真实面 rect（48:5814/5829/…）⇒ 刀 7 把卡 2-6 卡面判
 *   「未认领」⇒ absorbed-bg 空壳色带。判据纯几何（containment，与本文件刀 7
 *   的越出检查同源）：box 完整可解析的 collapsed 叶 ⇒ figmaIndex 里 bbox 完整
 *   落在叶盒内的节点 id 全部入认领集。v-for 整段渲染盒内的可见层都属于该列表
 *   的渲染领土，零语义猜测。纯函数，fail-open（叶盒缺失 ⇒ 原样返回输入集）。
 *
 * @param {Set<string>} claimedIds 现有认领集（会被原地扩充并返回）
 * @param {Array} leaves 全部叶子 section
 * @param {Map} figmaIndex `indexFigmaNodes` 产物
 * @param {(sec:object, idx:Map)=>{x:number,y:number,w:number,h:number}|null} resolveBox
 *   几何解析器（装配层传 `resolveSectionBox`，与本文件刀 7 越出检查同一坐标系）
 * @returns {Set<string>} 扩充后的认领集
 */
export function claimCollapsedLeafContainedIds(claimedIds, leaves, figmaIndex, resolveBox) {
  const claimed = claimedIds instanceof Set ? claimedIds : new Set()
  if (!figmaIndex || typeof figmaIndex.get !== 'function') return claimed
  if (typeof figmaIndex[Symbol.iterator] !== 'function') return claimed
  for (const l of Array.isArray(leaves) ? leaves : []) {
    if (!l || (l.collapsed !== true && l.renderHint !== 'v-for')) continue
    const box = typeof resolveBox === 'function' ? resolveBox(l, figmaIndex) : null
    if (!box || !(box.w > 0) || !(box.h > 0)) continue
    for (const [fid, rec] of figmaIndex) {
      const id = String(fid)
      if (claimed.has(id)) continue
      const b = rec?.bbox || rec?.rawNode?.absoluteBoundingBox
      if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) continue
      if (
        b.x >= box.x &&
        b.y >= box.y &&
        b.x + b.width <= box.x + box.w &&
        b.y + b.height <= box.y + box.h
      ) {
        claimed.add(id)
      }
    }
  }
  return claimed
}
