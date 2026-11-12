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

/**
 * 刀 20c 形态识别（**纯形态，非裁决**）：细长条（宽 ≤12px、长宽比 ≥4）且右缘贴容器边（±4px）。
 * 仅回答「它长得像滚动条滑块吗」，是否豁免由 `isScrollbarNamed` 的正判据共同决定。
 */
function isBarAtRightEdge(b, cBox) {
  return (
    b.width <= 12 &&
    b.height >= 4 * b.width &&
    Math.abs(b.x + b.width - (cBox.x + cBox.width)) <= 4
  )
}

/**
 * 🛡️ 刀 20c-R（2026-11-02 · `43:5688` 实锤）正判据：图层名必须**确指**滚动条。
 *
 * 依据：Figma `node.name` 是**真值事实**（不是启发式猜测），与 `figma-connector` 既有
 * `_isNonSemanticName` / `/^bg(\b|[-_])/i` 同源——命名来自设计稿，可作判据。
 * **自动名不构成证据**：`Rectangle 346242323` ⇒ 返回 false ⇒ 照常吸收（未知即不豁免）。
 */
function isScrollbarNamed(node) {
  return /滚动|scroll/i.test(String(node?.name || ''))
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
 * 🛡️ 刀 7c-grad（2026-11-12 · 46ef66fa 弹窗壳渐变实锤）：Figma 渐变 fill → CSS background。
 * 与 figma-connector.js#_gradientAngleDeg / fills→CSS 路径同算法口径：
 *  · 角度 = atan2(dx, -dy)（handles[0]→[1]），负值 +360，缺 handles 回落 180（上→下）；
 *  · stop 色值含 alpha（<1 用 rgba，=1 用 #hex），位置取 % 整数；
 *  · 填充级 opacity 乘入（fill.opacity ?? 1）。
 * 纯函数；无 stops ⇒ null（调用方 fail-open 跳过）。
 */
function gradientFillToCss(fill) {
  const stops = Array.isArray(fill.gradientStops) ? [...fill.gradientStops] : []
  if (stops.length < 2) return null
  const opacity = typeof fill.opacity === 'number' ? fill.opacity : 1
  const cssColor = (c) => {
    if (!c || typeof c.r !== 'number') return null
    const r = Math.round(c.r * 255)
    const g = Math.round(c.g * 255)
    const b = Math.round(c.b * 255)
    const a = Math.round((c.a !== undefined ? c.a : 1) * opacity * 100) / 100
    return a < 1 ? `rgba(${r},${g},${b},${a})` : `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
  }
  const parts = stops
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((s) => {
      const col = cssColor(s.color)
      return col ? `${col} ${Math.round((s.position ?? 0) * 100)}%` : null
    })
    .filter(Boolean)
  if (parts.length < 2) return null
  if (fill.type === 'GRADIENT_RADIAL') return `radial-gradient(circle, ${parts.join(', ')})`
  // GRADIENT_LINEAR：角度由 gradientHandlePositions 推导（与 _gradientAngleDeg 同式）
  const handles = fill.gradientHandlePositions
  let angle = 180
  if (Array.isArray(handles) && handles.length >= 2 && handles[0] && handles[1]) {
    const dx = (handles[1].x ?? 0) - (handles[0].x ?? 0)
    const dy = (handles[1].y ?? 0) - (handles[0].y ?? 0)
    angle = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI)
    if (angle < 0) angle += 360
  }
  return `linear-gradient(${angle}deg, ${parts.join(', ')})`
}

/**
 * @param {Object} sec 容器 section（读 id/sourceNodeIds）
 * @param {Map|null} figmaIndex `indexFigmaNodes` 产物
 * @param {Set<string>} claimedIds 全部叶子认领的节点 id（含叶子自身 id 与其 sourceNodeIds）
 * @returns {{evaluated:number, scrollbarExempted:number, layers:Array<{id:string, background:string, borderRadius:number|null, edgeCss:string, top:number, left:number, width:number, height:number}>}}
 */
export function resolveAbsorbedBgLayers(sec, figmaIndex, claimedIds) {
  const out = { evaluated: 0, scrollbarExempted: 0, layers: [] }
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
    // 🛡️ 刀 7c-grad（2026-11-12 · mc-max-1794418321523-46ef66fa 实锤）：渐变壳吸收。
    //   病灶：弹窗类画板的壳背景（如 36:1694 name='bg'，603×555 r4）是 GRADIENT_LINEAR
    //   （#D4E2FF→#C1D5FF 纵向、opacity 0.9），旧判据 `fills.find(type==='SOLID')`
    //   取不到 ⇒ `if (!solid) continue` 丢弃 ⇒ 壳层渐变+圆角永不落，弹窗观感全靠
    //   预览页白底硬撑（用户对比设计图报「退化」）。
    //   修法：SOLID 缺失时回落取首个可见 GRADIENT_LINEAR/RADIAL，CSS 化后照常吸收——
    //   渐变→CSS 算法与 figma-connector.js#_gradientAngleDeg / 2347-2361 行同口径
    //   （角度 atan2(dx,-dy)、stop 不透明度优先于填充级 opacity；在此本地实现最小版，
    //   避免为单一函数引入 roles→utils 反向依赖）。
    //   不命中枚举：SOLID 存在仍走原路（逐字不变）；IMAGE/VIDEO fill 不吸收；渐变无
    //   gradientStops ⇒ 跳过（fail-open 不猜）。
    let solid = fills.find((f) => f && f.type === 'SOLID' && f.visible !== false)
    let background = solid ? fillToRgba(solid) : null
    if (!background) {
      const grad = fills.find(
        (f) =>
          f &&
          f.visible !== false &&
          (f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL') &&
          Array.isArray(f.gradientStops) &&
          f.gradientStops.length >= 2,
      )
      if (grad) background = gradientFillToCss(grad)
    }
    if (!background) continue

    const b = boxOf(node)
    if (!b) continue
    // 🛡️ 刀 20c（2026-10-28 · 657661ca 实锤）：滚动条滑块/轨道不是背景层——
    //   细长条贴容器右缘（宽 ≤12px、长宽比 ≥4、右缘贴边 ±4px）被吸收后画成
    //   装饰 div ⇒ 视觉上有滚动条但列表不能滚（假滚动）。真值滚由刀 20b 列表
    //   容器的 overflow-y:auto 承担。
    //
    //   🛡️ 刀 20c-R（2026-11-02）：**几何不足以判别** —— 实测装饰条与真滚动条同构：
    //     · 真滚动条 `48:5904` name='滚动条' 6×218 r3 @(21308,51791)，容器右缘 21308+6=21314；
    //     · 装饰条   `43:5688` name='Rectangle 346242323' 6×218 r3 @(30113,51815)，
    //       容器 `807:2` 右缘 29636+483=30119 = 30113+6（**精确贴合**）。
    //   两者宽/高/圆角/贴边逐字段相同，容器「内容是否溢出」均 0 ⇒ 旧纯几何判据把装饰条
    //   一并豁免。铁证（同构同几何异结果）：`c-device-34fa6237`(10-28 18:07) /
    //   `c-device-486cc6b6`(10-30 09:42) 的 `807:2` 与渲染成功的 `c-device-5665901a`(10-27 18:29)
    //   **逐字段相同**（isLayoutContainer=true / container-rebuild / srcN=116 含 43:5688），
    //   唯一差别是生成时间晚于刀 20c ⇒ 竖条从产物消失（假缺陷：漏渲染却静默通过）。
    //   ⇒ 豁免收窄为**正判据**：形态条状 **且** 图层名确指滚动条才跳过。自动名走吸收。
    if (isBarAtRightEdge(b, cBox) && isScrollbarNamed(node)) {
      out.scrollbarExempted += 1
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

/**
 * 🛡️ 刀 7c（2026-11-03 · `43:5688` 实锤）：候选集扩充 —— 把 sec 的 **Figma 直系子 id**
 * 并入候选集（`sourceNodeIds ∪ directChildren(sec.id)`）。
 *
 * 病灶：刀 7 的候选集唯一来源是 `sec.sourceNodeIds`，而顶层非容器叶子段（`807:2`
 * name='slot-con'，盒 ≡ 图根盒）的 `sourceNodeIds` **只有自身**，7 个直系子
 * （`43:4784/4869/4875/4878/4892/4911/5688`）全不在闭包 ⇒ 判据 `eval=0` ⇒
 * 装饰条 `43:5688`（6×218 r3 `rgba(20,105,169,.37)`，右缘精确贴宿主边）在产物里 0 次出现。
 *
 * **本函数只做枚举，不做任何裁决**：类型/fill/认领/越出/滚动条豁免全部仍由
 * `resolveAbsorbedBgLayers` 单点裁决（判据同构单一来源）。故本函数对
 * `resolveAbsorbedBgLayers` 零改动、零签名变化 ⇒ 其既有用例逐字不变。
 *
 * 纯函数、fail-open：`sec` / `figmaIndex` / `rawNode.children` 任一缺失 ⇒ 原样返回
 * `sourceNodeIds`（调用方拿到的候选集与旧行为逐字相同）。
 *
 * @param {Object} sec 段（读 id / sourceNodeIds）
 * @param {Map|null} figmaIndex `indexFigmaNodes` 产物
 * @returns {string[]} 扩充后的候选 id 列表（保留 `sourceNodeIds` 原序，直系子按图序追加）
 */
export function expandCandidateIdsWithDirectChildren(sec, figmaIndex) {
  const src = Array.isArray(sec?.sourceNodeIds) ? sec.sourceNodeIds.map((v) => String(v)) : []
  if (!sec || !figmaIndex || typeof figmaIndex.get !== 'function') return src
  const id = String(sec.id ?? '')
  if (!id) return src
  const node =
    figmaIndex.get(id)?.rawNode || figmaIndex.get(id)?.node || null
  const children = Array.isArray(node?.children) ? node.children : []
  if (!children.length) return src
  const out = [...src]
  const seen = new Set(src)
  for (const c of children) {
    const cid = String(c?.id ?? '')
    if (!cid || seen.has(cid)) continue
    seen.add(cid)
    out.push(cid)
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
