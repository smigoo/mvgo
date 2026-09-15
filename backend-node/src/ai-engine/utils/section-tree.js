/**
 * 🛡️ A′ Phase 5：effectiveSections 嵌套树遍历。
 * 容器（isLayoutContainer / layoutSource=container-rebuild）只负责空间包裹，不占独立 .vue。
 * 纯函数、无 import.meta，供 planner / prompt / COMP-001 / assembler 共用。
 */

export function isLayoutContainerSection(sec) {
  if (!sec || typeof sec !== 'object') return false
  if (sec.isLayoutContainer === true) return true
  return (
    sec.layoutSource === 'container-rebuild' &&
    Array.isArray(sec.children) &&
    sec.children.length > 0
  )
}

export function forEachLeafSection(sections, visit) {
  if (!Array.isArray(sections)) return
  for (const sec of sections) {
    if (isLayoutContainerSection(sec)) {
      forEachLeafSection(sec.children, visit)
    } else if (sec) {
      visit(sec)
    }
  }
}

export function collectLeafSections(sections) {
  const leaves = []
  forEachLeafSection(sections, (sec) => leaves.push(sec))
  return leaves
}

/**
 * 🛡️ 治本（2026-09-11 · c-device-monitor-hsvmkuvd-cfb53488 实锤，2026-09-14 · 485d724d 复核）：
 * planner 双重解释去重。
 *
 * 实锤链路：同一主内容区被 planner 产出多个叶子，其中「整区语义壳」无 Figma 归属
 * （`sourceNodeIds=[]`）、`elementCount` 覆盖整块（485d724d：壳 32，三个有归属兄弟合计 10），
 * 它是 LLM 对该区域的「完整副本」（MainSection 已含 tab 列 + 切换卡 + 12 设备网格）；
 * 另有 `89:37`(tabs)/`89:38`(switch) 等**有归属子集**是它的冗余切片。
 * 原 ①② 因壳 `sourceNodeIds=[]` 无交集、type/responsibility 不同（壳=body）而双双漏判
 * → 双份内容进入装配 → slot-con 纵向堆叠挤出视口。
 *
 * 确定性去重规则（递归整棵树）：
 *   ① sourceNodeIds 单一归属（R1-1，优先级最高、不依赖措辞）：任一 Figma 节点 id 只能归属
 *     一个叶子 section（layout 容器除外）；两个叶子 sourceNodeIds 有交集 → 保留 elementCount 更大者。
 *   ② type=tabs 措辞兜底（原规则）：按 `type|responsibility` 分组，组内 >1 保留 elementCount 更大者。
 *   ③ 无归属壳判别力（2026-09-14 新增，治 B+C 重复解释，双实证 485d724d/a612a9f7）：
 *      planner 对同一主内容区会产出「无 Figma 归属壳」（sourceNodeIds=[]）与若干「有归属子集」
 *      （@antd/tab 壳/switch 卡/真实 body 切片）。用**判别力**判定该壳性质——
 *      壳 elementCount ≥ 有归属兄弟合计 → 壳是整区「超集」（合法，保留壳、丢竞争类有归属子集）；
 *      壳 elementCount <  有归属兄弟合计 → 壳是「碎片重述」（臆造，丢弃壳、只留真实有归属子集）。
 *      固定倍率只覆盖前者、漏判后者，故改用合计比较。header 永不丢、stats 默认独立保留。
 * 纯函数、幂等，供 resolvePlanSections（R1 单一事实源）调用，
 * 模板装配/命名/prompt/COMP-001 全链自动受益。
 *
 * @param {Array} sections effectiveSections 树
 * @returns {Array} 去重后的树
 */
export function dedupeDuplicateSections(sections) {
  if (!Array.isArray(sections)) return sections
  const out = []
  const seen = new Map() // tabs 措辞 key -> out 下标
  const nodeOwner = new Map() // sourceNodeId -> out 下标（仅叶子）
  for (const sec of sections) {
    if (!sec || typeof sec !== 'object') {
      out.push(sec)
      continue
    }
    // layout 容器：仅空间包裹，不参与归属冲突；递归处理 children
    if (isLayoutContainerSection(sec)) {
      out.push({ ...sec, children: dedupeDuplicateSections(sec.children) })
      continue
    }
    // ① R1-1：sourceNodeIds 单一归属（不依赖措辞）
    const srcIds = Array.isArray(sec.sourceNodeIds)
      ? sec.sourceNodeIds.map((s) => String(s)).filter(Boolean)
      : []
    let conflictIdx = -1
    for (const id of srcIds) {
      if (nodeOwner.has(id)) {
        conflictIdx = nodeOwner.get(id)
        break
      }
    }
    if (conflictIdx >= 0) {
      const prev = out[conflictIdx]
      const prevCount = Number(prev?.elementCount) || 0
      const curCount = Number(sec.elementCount) || 0
      // 保留内容更全的一份（elementCount 更大），丢弃重复解释
      if (curCount > prevCount) {
        for (const id of Array.isArray(prev?.sourceNodeIds) ? prev.sourceNodeIds : []) {
          if (nodeOwner.get(String(id)) === conflictIdx) nodeOwner.delete(String(id))
        }
        out[conflictIdx] = sec
        for (const id of srcIds) nodeOwner.set(id, conflictIdx)
      }
      continue
    }
    if (srcIds.length > 0) {
      const idx = out.length
      for (const id of srcIds) nodeOwner.set(id, idx)
    }
    // ② tabs 措辞兜底（原规则，保留）
    const type = String(sec.type || '').toLowerCase()
    if (type === 'tabs') {
      const key = `tabs|${String(sec.responsibility || '').trim()}`
      if (seen.has(key)) {
        const prevIdx = seen.get(key)
        const prev = out[prevIdx]
        const prevCount = Number(prev?.elementCount) || 0
        const curCount = Number(sec.elementCount) || 0
        if (curCount > prevCount) out[prevIdx] = sec
        continue
      }
      seen.set(key, out.length)
    }
    if (Array.isArray(sec.children)) {
      out.push({ ...sec, children: dedupeDuplicateSections(sec.children) })
      continue
    }
    out.push(sec)
  }
  return dedupeByWholeRegionShell(out)
}

/**
 * 🛡️ P1（2026-09-14 · c-device-monitor-485d724d / a612a9f7 双实证）：无归属壳的判别力去重。
 *
 * 动机：planner 对同一主内容区会产出「无 Figma 归属壳」（sourceNodeIds=[]）与若干
 * 「有归属子集」（@antd/tab 壳 / switch 卡 / 真实 body 切片）两类叶子。原 ①② 只认
 * `sourceNodeIds` 交集与 type/responsibility 措辞，无归属壳双双漏判 → 全集 + 子集全部进入装配。
 *
 * 实测两类**相反**形态，必须用「判别力」而非固定倍率：
 *   - 485d724d：壳 ec=32，有归属兄弟合计 10 → 壳是「整区再分组」（**超集**，合法，保留壳丢切片）
 *   - a612a9f7：壳 ec=7、0，有归属兄弟合计 10 → 壳是「碎片重述」（**比有归属兄弟更小**，臆造，
 *     应丢弃，只留真实子集）。固定 `≥3×maxOwned` 阈值只覆盖前者、漏判后者。
 *
 * 判别力规则（同层叶子之间，纯确定性）：
 *   ① 把每个无归属壳与所有有归属兄弟的 elementCount 之和比较：
 *      - 壳 ≥ 有归属兄弟合计 → 壳是超集：丢弃「与壳竞争」的有归属兄弟（tabs/switch/导航类），
 *        保留壳 + header + 非竞争正文/统计。
 *      - 壳 < 有归属兄弟合计 → 壳是碎片重述：直接丢弃壳，只留真实有归属子集。
 *   ② header 永不视为竞争、也永不丢弃；stats（统计块）默认保留避免误并，除非它是更小碎片壳。
 *   ③ 兜底增强：同层若存在 type=tabs 与 type=switch 两个**都真实有归属**的兄弟（设计稿本就
 *     左 Tab 窄列 + 右切换卡共线），不再触发「横向 sibling 不共存」丢弃，避免 P0 误判。
 *
 * 不依赖 LLM 措辞、不依赖固定倍率，只对「无归属壳 vs 有归属兄弟」生效，不误伤独立 section。
 *
 * @param {Array} sections 同层 section 数组（已递归处理过 children）
 * @returns {Array}
 */
export function dedupeByWholeRegionShell(sections) {
  if (!Array.isArray(sections) || sections.length < 3) return sections

  const COMPETING_TYPES = new Set(['tabs', 'switch', 'nav', 'sidebar', 'toolbar'])
  const COMPETING_KW = /(切换|标签|开关|\btabs?\b|\bswitch\b|导航栏|侧边栏|竖向导航)/i
  const isCompetingType = (type) => COMPETING_TYPES.has(String(type || '').toLowerCase())
  // 是否为「与整区/切换语义竞争」的叶子（header 永否、stats 默认否）
  const isCompetingSec = (sec) => {
    if (sec.type === 'header') return false
    if (isCompetingType(sec.type)) return true
    const resp = String(sec.responsibility || sec.title || '')
    if (sec.type === 'stats') return false // 统计块默认独立，除非它本身就是碎片壳（下面处理）
    return COMPETING_KW.test(resp)
  }

  const shells = [] // 无归属壳（sourceNodeIds=[]）
  const owned = [] // 有归属兄弟
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i]
    if (!sec || typeof sec !== 'object') continue
    if (isLayoutContainerSection(sec)) continue
    const srcIds = Array.isArray(sec.sourceNodeIds)
      ? sec.sourceNodeIds.map((s) => String(s)).filter(Boolean)
      : []
    const count = Number(sec.elementCount) || 0
    const rec = { idx: i, sec, count, type: String(sec.type || '').toLowerCase() }
    if (srcIds.length === 0) shells.push(rec)
    else owned.push(rec)
  }
  if (shells.length === 0 || owned.length < 2) return sections

  // 有归属兄弟的「竞争子集」与「非竞争子集」分开
  const competingOwned = owned.filter((o) => isCompetingSec(o.sec))
  const ownedTotalCount = owned.reduce((n, o) => n + o.count, 0)

  // 每个无归属壳按判别力单独判定
  const dropIdx = new Set()
  const lostGridFacts = [] // 被丢碎片壳携带的栅格空间事实（需并入宿主，信息不丢失）
  for (const shell of shells) {
    if (shell.count >= ownedTotalCount) {
      // 超集：壳覆盖整块 → 丢弃竞争类型的有归属兄弟（它们的内容已被壳完整覆盖）
      for (const o of competingOwned) dropIdx.add(o.idx)
    } else {
      // 碎片重述：壳比真实有归属兄弟更小 → 壳是臆造，丢弃壳本身
      dropIdx.add(shell.idx)
      // 🛡️ 信息不丢失（2026-09-14 · a612a9f7）：碎片壳若携带视觉已标注的栅格列数事实
      //   （`layout:'grid'` + `gridColumns`），丢弃时须并入保留的内容宿主兄弟，
      //   否则代码生成 prompt 拿不到列数 → LLM 自由发挥（真机偶发 4 列，设计稿 3 列）。
      const gc = Number(shell.sec?.gridColumns ?? shell.sec?.body?.gridColumns ?? NaN)
      if (Number.isFinite(gc) && gc > 1) lostGridFacts.push(Math.round(gc))
    }
  }
  if (dropIdx.size === 0) return sections
  // 防御：不允许把有归属兄弟全清空（至少保留 1 个真实 section）
  const remaining = sections.filter((_, i) => !dropIdx.has(i))
  if (remaining.length === 0) return sections

  // 把丢失的栅格事实并入「内容宿主」兄弟（优先级：body > tabs > grid > list > content > stats；
  // 绝不为 header/switch/nav/sidebar/toolbar 等竞争型或标题型节点挂栅格事实）。
  // 注意：只**补充** gridColumns，**不覆盖**宿主自身的 layout（如 @antd/tab 内部是 horizontal
  // 横向双列，其 layout 是真实结构，不能因并入网格壳而被改成 grid）。
  if (lostGridFacts.length > 0) {
    const HOST_PRIORITY = ['body', 'tabs', 'grid', 'list', 'content', 'stats']
    let hostIdx = -1
    for (const t of HOST_PRIORITY) {
      hostIdx = remaining.findIndex((s) => String(s?.type || '').toLowerCase() === t)
      if (hostIdx >= 0) break
    }
    if (hostIdx >= 0) {
      const host = remaining[hostIdx]
      if (!(Number(host.gridColumns) > 1)) {
        const cols = lostGridFacts[0]
        remaining[hostIdx] = {
          ...host,
          gridColumns: cols,
          body: { ...(host.body || {}), gridColumns: cols },
        }
      }
    }
  }
  return remaining
}

/**
 * 建 Figma 节点索引：id → { id, name, type, bbox, parentId }。
 *
 * 🛡️ 单一事实源（2026-09-14）：anchorPhantomSections 与 sortSectionsByFigmaY 共用，
 * 禁止各自再 walk 一遍节点树（重复实现会漂移出「同一节点两种 bbox」类分歧）。
 *
 * @param {Object} [figmaRoot] figma.json 根节点（含 children/absoluteBoundingBox）
 * @returns {Map<string, {id: string, name: string, type: string, bbox: Object|null, parentId: string|null}>}
 */
export function indexFigmaNodes(figmaRoot) {
  const index = new Map()
  if (!figmaRoot || typeof figmaRoot !== 'object') return index
  const walk = (node, parentId) => {
    if (!node || typeof node !== 'object') return
    const id = node.id != null ? String(node.id) : null
    if (id) {
      index.set(id, {
        id,
        name: String(node.name || ''),
        type: String(node.type || ''),
        bbox: node.absoluteBoundingBox || null,
        parentId,
        // 兼容底层事实消费者：保留原始节点引用，避免下游重新 walk
        // 或丢失 children/characters/fills 等事实。业务裁决仍不放在此处。
        rawNode: node,
      })
    }
    const children = Array.isArray(node.children) ? node.children : []
    for (const c of children) walk(c, id)
  }
  walk(figmaRoot, null)
  return index
}

/**
/** 将原始节点或索引记录归一为统一几何 primitive。 */
export function getFigmaBox(node) {
  const source = node?.absoluteBoundingBox || node?.bbox
  if (source && typeof source === 'object') {
    const x = Number(source.x)
    const y = Number(source.y)
    const width = Number(source.width)
    const height = Number(source.height)
    if ([x, y, width, height].every(Number.isFinite)) return { x, y, w: width, h: height }
  }
  const x = Number(node?.x)
  const y = Number(node?.y)
  const width = Number(node?.w)
  const height = Number(node?.h)
  if (![x, y, width, height].every(Number.isFinite)) return null
  return { x, y, w: width, h: height }
}

/**
 * 统一的几何同行判定 primitive。仅表达几何事实，不决定 section 如何装配。
 */
export function areBoxesSideBySide(a, b, opts = {}) {
  const left = getFigmaBox(a)
  const right = getFigmaBox(b)
  if (!left || !right) return false
  const yOverlapRatio = opts.yOverlapRatio ?? 0.5
  const xOverlapRatio = opts.xOverlapRatio ?? 0.15
  const yOverlap = Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y))
  const xOverlap = Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x))
  return (
    yOverlap > yOverlapRatio * Math.min(left.h, right.h) &&
    xOverlap < xOverlapRatio * Math.min(left.w, right.w)
  )
}

export function buildChildrenMap(index) {
  const childrenOf = new Map()
  if (!index || typeof index.values !== 'function') return childrenOf
  for (const node of index.values()) {
    if (!node?.parentId) continue
    if (!childrenOf.has(node.parentId)) childrenOf.set(node.parentId, [])
    childrenOf.get(node.parentId).push(node.id)
  }
  return childrenOf
}

/**
 * 归一化 Figma 文本节点名：剥掉单字母命名前缀（t-/d-/n-/v- 等）。
 */
export function normalizeFigmaTextName(name) {
  return String(name || '').replace(/^[a-zA-Z]-/, '').trim()
}

/**
 * 收集节点子树内的文本事实。返回项保留文本类别和文本节点自身 bbox.x。
 */
export function collectSubtreeTexts(nodeId, index, childrenOf = buildChildrenMap(index)) {
  const out = []
  const seenKeys = new Set()
  const seen = new Set()
  const walk = (id) => {
    const keyId = String(id)
    if (seen.has(keyId)) return
    seen.add(keyId)
    const node = index?.get(keyId)
    if (!node) return
    if (node.type === 'TEXT' || node.type === 'CHARACTER') {
      const raw = String(node.name || '')
      const isTitle = /^[tT]-/.test(raw)
      const text = normalizeFigmaTextName(raw)
      const key = `${isTitle ? 't' : 'd'}:${text}`
      if (text && !seenKeys.has(key)) {
        seenKeys.add(key)
        out.push({
          text,
          isTitle,
          x: typeof node.bbox?.x === 'number' ? node.bbox.x : null,
        })
      }
    }
    for (const childId of childrenOf?.get(keyId) || []) walk(childId)
  }
  walk(nodeId)
  return out
}

/**
 * 取 section 的 Figma 几何盒：sourceNodeIds 中可解析节点里 **最小 y**（同 y 取最小 x）的那个。
 *
 * 用最小 y 而非 sourceNodeIds[0]：避免「同一 section 两种 sourceNodeIds 排列」得到不同锚点；
 * section 根节点通常就是自身子树里最上方的节点，因此最小值即根盒。
 *
 * @param {Object} section
 * @param {Map} index indexFigmaNodes 的产物
 * @returns {{y: number, x: number, width: number, height: number}|null}
 */
export function figmaSectionBox(section, index) {
  if (!index || typeof index.get !== 'function') return null
  const ids = Array.isArray(section?.sourceNodeIds) ? section.sourceNodeIds : []
  let best = null
  for (const raw of ids) {
    const bbox = index.get(String(raw))?.bbox
    if (!bbox || typeof bbox.y !== 'number') continue
    if (!best || bbox.y < best.y || (bbox.y === best.y && (bbox.x ?? 0) < best.x)) {
      best = {
        y: bbox.y,
        x: typeof bbox.x === 'number' ? bbox.x : 0,
        width: typeof bbox.width === 'number' ? bbox.width : 0,
        height: typeof bbox.height === 'number' ? bbox.height : 0,
      }
    }
  }
  return best
}

/**
 * 🛡️ 治本（2026-09-14 · c-traffic-monitor-21e2afd6 实锤）：按 Figma 视觉坐标重排同层 section。
 *
 * 背景：effectiveSections 的顺序 = vision 输出数组顺序；真图表节点由 anchorPhantomSections
 *   追加在尾部 → 「车型分布」（vision 数组序第 4）恒排在两张柱状图之前，与设计稿上下颠倒。
 *   vision 输出里 sections 只有 flexGrow/figmaHeightPx，**没有任何 y 坐标**，
 *   顺序只能来自 Figma 节点树的 absoluteBoundingBox（唯一事实源）。
 *
 * 规则（保守，可部分生效、幂等）：
 *   - 只重排「能解析出 Figma 锚点」的 section，它们按 (y, x) 升序占回原本属于它们的槽位；
 *   - 解析不出锚点的 section 保持原位（不参与比较，也不会被挤走）；
 *   - 可解析者 < 2 个 → 原样返回（无从排序，不做任何猜测）。
 *
 * 纯函数：不改入参数组，返回新数组（无可排时原样返回入参引用）。
 *
 * @param {Array} sections 同层 section 数组
 * @param {Object} [figmaRoot] figma.json 根节点
 * @returns {Array} 排序后的 sections（无 figmaRoot / 无可排项时原样返回）
 */
export function sortSectionsByFigmaY(sections, figmaRoot) {
  if (!Array.isArray(sections) || sections.length < 2) return sections
  const index = indexFigmaNodes(figmaRoot)
  if (index.size === 0) return sections

  const boxes = sections.map((sec) => figmaSectionBox(sec, index))
  const slots = []
  const sortable = []
  boxes.forEach((box, i) => {
    if (!box) return
    slots.push(i)
    sortable.push({ sec: sections[i], box })
  })
  if (sortable.length < 2) return sections

  sortable.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)

  const out = sections.slice()
  slots.forEach((slotIndex, n) => {
    out[slotIndex] = sortable[n].sec
  })
  return out
}

/**
 * 🛡️ 治本（2026-09-14 · c-traffic-monitor-34750940 实锤）：无归属壳锚定真实 Figma 节点。
 *
 * 背景：vision schema 示例教 LLM 用语义 id（"daily-total"）给 section 起名 →
 *   collectSourceNodeIds 只认 `数字:数字` → 壳 src=[]。traffic 实证：同一槽位的
 *   兄弟（sub-header/Group）有归属，@echarts 图表节点反被臆造成语义壳，且全链路
 *   无任何「vision sections ↔ Figma 节点树」对账 → dedupeByWholeRegionShell 双输：
 *   真图表壳（ec 小）被当碎片杀掉（产物缺 ChartSection），假壳（ec 大）被判超集存活。
 *
 * 治本：在「丢弃/保留」裁决**之前**，先拿 figma 节点树（事实源）把壳锚定回真实节点：
 *   ① 标题匹配：壳 title ↔ 候选节点祖先槽名（剥 slot-/slot_ 前缀）或子树 TEXT 文案；
 *   ② 顺序对齐：剩余 chart 类壳（数组序）↔ 剩余未覆盖 @echarts 节点（y/x 升序）zip。
 *   锚定成功 → 补 sourceNodeIds 救回，无 type 壳按节点事实补 type='chart'
 *   （语义识别来自事实源，非关键词猜测）；锚定失败 → 维持原样，交给判别力逻辑兜底。
 *
 * 纯函数、幂等：已锚定 section 的节点进入 covered 集，二次调用零变化。
 *
 * @param {Array} sections effectiveSections（同层数组；容器请先展开或逐层调用）
 * @param {Object} [figmaRoot] figma.json 根节点（含 children/absoluteBoundingBox）
 * @returns {Array} 锚定后的 sections（无 figmaRoot 或无壳可锚时原样返回）
 */
export function anchorPhantomSections(sections, figmaRoot) {
  if (!Array.isArray(sections) || !figmaRoot || typeof figmaRoot !== 'object') {
    return sections
  }

  // ① 建节点索引：id → { id, name, type, bbox, parentId }
  //    🛡️ 单一事实源：与 sortSectionsByFigmaY 共用 indexFigmaNodes，禁止各自 walk 一遍。
  const index = indexFigmaNodes(figmaRoot)
  if (index.size === 0) return sections

  // ② 覆盖集：所有有归属 section 的 sourceNodeIds 并集（含容器子树叶子）
  const covered = new Set()
  forEachLeafSection(sections, (sec) => {
    for (const id of sec.sourceNodeIds || []) covered.add(String(id))
  })
  const isCovered = (markerId) => {
    let cur = index.get(markerId)
    while (cur) {
      if (covered.has(cur.id)) return true
      cur = cur.parentId ? index.get(cur.parentId) : null
    }
    return false
  }

  // ③ 未覆盖 @echarts 标记节点（y/x 升序，与视觉文档序一致）
  const markers = []
  for (const rec of index.values()) {
    if (!rec.name.startsWith('@echarts')) continue
    if (isCovered(rec.id)) continue
    markers.push(rec)
  }
  if (markers.length === 0) return sections
  markers.sort(
    (a, b) =>
      ((a.bbox?.y ?? 0) - (b.bbox?.y ?? 0)) || ((a.bbox?.x ?? 0) - (b.bbox?.x ?? 0)),
  )

  // ④ 候选节点的可匹配文案：祖先链槽名（剥 slot- 前缀）+ 子树 TEXT 文案
  const stripSlot = (n) =>
    String(n || '')
      .replace(/^slot[-_]/i, '')
      .trim()
  const markerTexts = new Map() // markerId -> Set<string>
  for (const m of markers) {
    const names = new Set()
    let cur = index.get(m.id)
    while (cur) {
      const s = stripSlot(cur.name)
      if (s && !s.startsWith('@')) names.add(s)
      cur = cur.parentId ? index.get(cur.parentId) : null
    }
    const node = (function find(id) {
      const stack = [figmaRoot]
      while (stack.length) {
        const n = stack.pop()
        if (String(n?.id) === id) return n
        for (const c of n?.children || []) stack.push(c)
      }
      return null
    })(m.id)
    const collectTexts = (n) => {
      if (!n || typeof n !== 'object') return
      if (n.type === 'TEXT' && n.characters) names.add(String(n.characters).trim())
      for (const c of n.children || []) collectTexts(c)
    }
    if (node) collectTexts(node)
    markerTexts.set(m.id, names)
  }

  const isChartishShell = (s) =>
    String(s.type || '').toLowerCase() === 'chart' ||
    Number(s.complexityReasons?.charts) > 0 ||
    /图表/.test(String(s.responsibility || s.title || ''))

  const isShell = (s) =>
    s &&
    typeof s === 'object' &&
    !isLayoutContainerSection(s) &&
    String(s.type || '').toLowerCase() !== 'header' &&
    (!Array.isArray(s.sourceNodeIds) || s.sourceNodeIds.length === 0)

  // used 全局共享：不同层级的壳不得锚定同一节点
  const used = new Set()

  const anchorLevel = (levelSections) => {
    // ⑤ 标题匹配阶段：壳 title ↔ 候选文案（精确优先，其次双向包含，title ≥2 字）
    const anchored = new Map() // section 下标 -> markerId
    levelSections.forEach((s, i) => {
      if (!isShell(s)) return
      const t = String(s.title || '').trim()
      if (t.length < 2) return
      let hit = null
      for (const m of markers) {
        if (used.has(m.id)) continue
        if (markerTexts.get(m.id)?.has(t)) {
          hit = m
          break
        }
      }
      if (!hit) {
        for (const m of markers) {
          if (used.has(m.id)) continue
          for (const name of markerTexts.get(m.id) || []) {
            if (name.length >= 2 && (name.includes(t) || t.includes(name))) {
              hit = m
              break
            }
          }
          if (hit) break
        }
      }
      if (hit) {
        used.add(hit.id)
        anchored.set(i, hit.id)
      }
    })

    // ⑥ 顺序对齐阶段：剩余 chart 类壳（数组序）↔ 剩余标记（y/x 序）zip
    let mi = 0
    levelSections.forEach((s, i) => {
      if (!isShell(s) || anchored.has(i)) return
      if (!isChartishShell(s)) return
      while (mi < markers.length && used.has(markers[mi].id)) mi += 1
      if (mi >= markers.length) return
      used.add(markers[mi].id)
      anchored.set(i, markers[mi].id)
      mi += 1
    })

    if (anchored.size === 0) return levelSections

    // ⑦ 应用锚定：补 sourceNodeIds；无 type 壳按节点事实补 type='chart'
    return levelSections.map((s, i) => {
      const mid = anchored.get(i)
      if (!mid) return s
      return {
        ...s,
        sourceNodeIds: [mid],
        ...(s.type ? {} : { type: 'chart' }),
      }
    })
  }

  // 容器递归：壳可能嵌套在 layout 容器 children 内（与 dedupeDuplicateSections 同构）
  const recurse = (levelSections) =>
    levelSections.map((s) =>
      isLayoutContainerSection(s) && Array.isArray(s.children)
        ? { ...s, children: recurse(anchorLevel(s.children)) }
        : s,
    )

  return recurse(anchorLevel(sections))
}

/** Figma 节点 id 的严格形态（`89:42` / `2:7898`）。Vision 引用真值节点时必须长这样。 */
const FIGMA_NODE_ID_RX = /^\d+:\d+$/

/**
 * 🛡️ 治本（2026-09-15 · c-device-monitor-228b63d5 实锤）：清洗「编造 id 空间」污染。
 *
 * 背景：Vision 偶发编造整套 Figma 格式 id（`8439:8500` 设备类型网格区、`8788:8439`
 *   切换控制区、`3550:194` 江阴靖江隧道小时流量），这些 id 在真值树中出现 0 次。
 *   `collectSourceNodeIds`（subcomponent-planner.js）只认 `数字:数字` 形态，把假 id 也塞进
 *   sourceNodeIds → 编造 section 伪装成「有归属壳」→ 下游 anchorPhantomSections 的 isShell
 *   （sourceNodeIds 空才锚定）与 dedupeByWholeRegionShell 的「无归属壳」判别力双双失效：
 *     · 真 chart 壳（`3550:194` 对应 @echarts）不再被锚定 → 图表语义靠 type 兜底，脆弱；
 *     · 假 grid 壳（`8439:8500`）被当成有归属兄弟 → 拆成独立 CardGrid，外层布局崩。
 *
 * 治本：在 anchor 之前，把 sourceNodeIds 里「Figma 格式但真值树不存在」的假 id 清掉，
 *   让编造 section 回到「无归属壳」状态，由既有 anchor（锚定真 chart）+ dedupe（剔假壳）
 *   正确接管。**只清 Figma 格式的假 id，语义 id（`slot-xxx` 等）原样保留**，避免误伤旧 schema。
 *
 * 纯函数、幂等：返回新数组；无 figmaRoot / 空索引时原样返回入参引用。
 *
 * @param {Array} sections effectiveSections 树
 * @param {Object} [figmaRoot] figma.json 根（含 children，或 {document} 包装）
 * @returns {Array} 清洗后的 sections
 */
export function stripFabricatedSourceIds(sections, figmaRoot) {
  if (!Array.isArray(sections) || !figmaRoot || typeof figmaRoot !== 'object') {
    return sections
  }
  const rootNode = figmaRoot.document || figmaRoot
  const index = indexFigmaNodes(rootNode)
  if (index.size === 0) return sections

  const strip = (list) =>
    list.map((sec) => {
      if (!sec || typeof sec !== 'object') return sec
      const src = (sec.sourceNodeIds || []).filter((id) => {
        const s = String(id).trim()
        // 非 Figma 格式（语义 id 如 slot-车型分布）原样保留，不参与真假判定
        if (!FIGMA_NODE_ID_RX.test(s)) return true
        return index.has(s)
      })
      const next = { ...sec, sourceNodeIds: src }
      if (Array.isArray(sec.children)) next.children = strip(sec.children)
      return next
    })
  return strip(sections)
}

/**
 * 🛡️ 剔除「幻觉 section」：自身没有任何节点身份，却引用了 Figma 真值里不存在的节点。
 *
 * 背景（2026-09-15 · mc-max-1789446564243-f64ecbed 实锤）：
 * Figma 真值 slot-con(89:41) 只有 **2 个**直接子节点 —— `89:42 sub-t`(y898 h32) 与
 * `2:7898 @echarts/line`(y930 h113)。Vision 却输出了第三个 section `badge-indicator`
 * （name「数值角标」、slotCandidate header-right），其唯一子元素 id 写的是 `89:37`
 * —— 该 id 在整棵 Figma 树中出现 **0 次**（同命名空间的 89:41/89:42/89:43 都真实存在）。
 * 下游 subcomponent-planner 按 sections 出子组件清单 → 多生成一个 `ContentIndicator.vue`：
 *   · 角标「6」被渲染两遍（sub-t 行内已有 num，ContentIndicator 又画一份）；
 *   · slot-con 从「tab 行 + 图表」两行变三行，多出的行按 flex 比例挤走图表高度。
 * 而这类 section **代码门禁结构上不可见**：类名真实、LESS 合法、结构自洽，只是设计里不存在。
 *
 * 为什么判据必须「窄」（2026-09-15 · 162 份真机 vision 缓存离线实测）：
 * 宽判据（「凡声明了 Figma 格式 id 而该 id 不存在 → 剔除」）在真实语料上命中 4 条，
 * 其中 3 条是**真 section**：Vision 偶发编造整套 id 空间（`8000:8010 统计指标行`、
 * `8100:8110 图表区域`、`8776:8787 Tab切换区域`），内容（图表/统计行/tab 区）真实存在
 * 且是唯一来源 —— 一律剔除会把图表整块删掉。窄判据把「自身声明了节点身份」的 section
 * 排除在外（无论该 id 真假），只处理**零节点身份**的伪容器：实测命中恰为 1 条真阳性、零误伤。
 *
 * 事实源：Figma 节点树（indexFigmaNodes，与 anchorPhantomSections / sortSectionsByFigmaY 同一份）。
 * 纯函数、幂等：不修改入参，无 figmaRoot 时原样返回（零回归）。
 *
 * 残余（已知，未在此收口）：编造整套 id 空间的 section（`8000:x`/`8100:x` 型）仍会放行 ——
 * 其 id 自称节点身份，无法与真 section 区分；该形态需靠 bbox 归属或证据重叠另行收口。
 *
 * @param {Array} sections 同层 section 数组（容器请自行逐层传入或依赖本函数递归 children）
 * @param {Object} [figmaRoot] figma.json 根节点（含 children/absoluteBoundingBox）
 * @returns {Array} 剔除幻觉后的新数组（无 figmaRoot / 无命中时返回原引用）
 */
export function dropHallucinatedSections(sections, figmaRoot) {
  if (!Array.isArray(sections) || !figmaRoot || typeof figmaRoot !== 'object') {
    return sections
  }
  // 根节点归一：真机常传 figma.json 包装对象 `{ fileKey, nodeId, document }`，
  // indexFigmaNodes 只沿 `children` 走 → 不剥 `document` 会得到空索引（判据整体失效）。
  // 与 tab-resource-guard#58 / figma-height-ratio#249 / visual-parser#2061 同口径。
  const rootNode = figmaRoot.document || figmaRoot
  const index = indexFigmaNodes(rootNode)
  if (index.size === 0) return sections

  // ① 自身是否「声明了节点身份」——显式引用字段（无论真假）或 id 写成 Figma 形态。
  //    声明的 section 一律保留：宁可漏剔，不可误删真 section（见上方 162 样本实测）。
  const selfClaimsNode = (sec) => {
    if (!sec || typeof sec !== 'object') return false
    const own = [sec.figmaNodeId, sec.figmaNode, ...(sec.sourceNodeIds || [])]
    if (own.some((v) => v != null && String(v).trim() !== '')) return true
    return FIGMA_NODE_ID_RX.test(String(sec.id ?? '').trim())
  }

  // ② 子元素（递归 children / body.children）是否引用了「真值不存在的 Figma 格式 id」
  const hasFabricatedChildRef = (sec) => {
    const stack = []
    const push = (arr) => {
      if (!Array.isArray(arr)) return
      for (const c of arr) {
        if (c && typeof c === 'object') stack.push(c)
      }
    }
    push(sec.children)
    if (sec.body && typeof sec.body === 'object') push(sec.body.children)
    while (stack.length > 0) {
      const cur = stack.pop()
      for (const key of ['id', 'figmaNode', 'figmaNodeId']) {
        const v = cur[key]
        if (v == null) continue
        const s = String(v).trim()
        if (FIGMA_NODE_ID_RX.test(s) && !index.has(s)) return true
      }
      push(cur.children)
      if (cur.body && typeof cur.body === 'object') push(cur.body.children)
    }
    return false
  }

  let dropped = 0
  const filterLevel = (list) =>
    list
      .filter((sec) => {
        if (!sec || typeof sec !== 'object') return true
        if (selfClaimsNode(sec) || !hasFabricatedChildRef(sec)) return true
        dropped += 1
        return false
      })
      .map((sec) =>
        Array.isArray(sec.children) ? { ...sec, children: filterLevel(sec.children) } : sec,
      )

  const result = filterLevel(sections)
  return dropped > 0 ? result : sections
}

/**
 * 🛡️ 幻觉 section 事实校验 —— **全链路**共用的唯一入口（2026-09-15）。
 *
 * 为什么必须「全链路」：Vision 结果有**三条**来源，且后两条是**命中即返回**的缓存短路，
 * 完全绕过 `_postProcessAnalysis`：
 *   ① 全新 Vision 分析 → 走 `_postProcessAnalysis`（内部已调用本函数）
 *   ② `VisualParser.execute()` 的 vision-cache 命中分支（`.mc-gen/cache/vision-cache/*.json`）
 *   ③ graph 节点的 `state._uiCache.previewAnalysis` 命中分支（`_shared-cache/*.json`）
 * 缓存里存的是**加工后**结构（含 merger 产物 `layoutSource: inline-row`），
 * 因此「后处理规则一旦变更，缓存命中的任务永远拿不到修复」——曾经的隐性坑。
 * 事实校验是幂等纯函数、事实源是**实时 Figma 树**，故在缓存命中处补跑即可（不重跑形状归一，避免二次加工）。
 *
 * 形态兼容：扁平 parsed（`layout.sections`）、包装态（`layoutStructure.layout.sections`）、
 * 以及两者同时存在的混合态。
 *
 * ⚠️ **就地写回**（2026-09-15 自证）：`_postProcessAnalysis` 依赖就地修改 `parsed`
 * （调用方 `this._postProcessAnalysis(parsed, …)` 之后继续用同一个对象引用），
 * 若本函数只返回新对象而不写回，全新路径上的剔除会**静默失效**。
 * 故此处直接给 `parsed` 的容器字段重新赋值，并返回同一引用 —— 四处调用点语义统一
 * （可安全用于 `return applyHallucinationDrop(x, figma)` 与「调用后继续用 x」两种写法）。
 *
 * @param {object} parsed vision 结构对象（任意来源；会被就地更新）
 * @param {object} figmaData Figma 节点树（`{fileKey,nodeId,document}` 或直接根节点）
 * @returns {object} 同一个对象引用（无 figmaData / 无命中时零改动）
 */
export function applyHallucinationDrop(parsed, figmaData) {
  if (!parsed || typeof parsed !== 'object' || !figmaData) return parsed
  const dropFor = (sections) => dropHallucinatedSections(sections, figmaData)

  if (parsed.layout && Array.isArray(parsed.layout.sections)) {
    const dropped = dropFor(parsed.layout.sections)
    if (!Object.is(dropped, parsed.layout.sections)) {
      parsed.layout = { ...parsed.layout, sections: dropped }
    }
  }
  if (Array.isArray(parsed.sections)) {
    const dropped = dropFor(parsed.sections)
    if (!Object.is(dropped, parsed.sections)) parsed.sections = dropped
  }
  const lay = parsed.layoutStructure
  if (lay && lay.layout && Array.isArray(lay.layout.sections)) {
    const dropped = dropFor(lay.layout.sections)
    if (!Object.is(dropped, lay.layout.sections)) {
      parsed.layoutStructure = { ...lay, layout: { ...lay.layout, sections: dropped } }
    }
  } else if (lay && Array.isArray(lay.sections)) {
    const dropped = dropFor(lay.sections)
    if (!Object.is(dropped, lay.sections)) {
      parsed.layoutStructure = { ...lay, sections: dropped }
    }
  }
  return parsed
}

export function collectContainerSections(sections, acc = []) {
  if (!Array.isArray(sections)) return acc
  for (const sec of sections) {
    if (isLayoutContainerSection(sec)) {
      acc.push(sec)
      collectContainerSections(sec.children, acc)
    }
  }
  return acc
}

export function findSectionById(sections, id) {
  if (!Array.isArray(sections) || id == null) return null
  for (const sec of sections) {
    if (String(sec?.id) === String(id)) return sec
    if (Array.isArray(sec?.children)) {
      const hit = findSectionById(sec.children, id)
      if (hit) return hit
    }
  }
  return null
}

function formatOne(sec, indent) {
  const pad = '  '.repeat(indent)
  const title = sec.title ? `（原标题「${sec.title}」）` : ''
  const layout =
    sec.layout && String(sec.layout).toLowerCase() !== 'vertical'
      ? `，布局 ${sec.layout}`
      : ''
  // 🛡️ 栅格列数事实透传（2026-09-14 · a612a9f7 实锤）：视觉分析已给出 device-grid 的
  //   `gridColumns: 3`，planner 透传后在此打印到 prompt 树，让 LLM 收到硬约束
  //   （`grid-template-columns: repeat(N, 1fr)`），避免真机偶发退化成 4 列。
  const gridCols = sec.gridColumns ?? (sec.body && sec.body.gridColumns)
  const gridNote =
    gridCols && Number(gridCols) > 1
      ? `，栅格 ${gridCols} 列 (display: grid; grid-template-columns: repeat(${gridCols}, 1fr))`
      : ''
  const extra = sec.elementCount ? `，含 ${sec.elementCount} 个元素` : ''
  const score =
    sec.complexityScore !== undefined ? `，复杂度 ${sec.complexityScore}` : ''
  return `${pad}- \`${sec.id}\` — ${sec.responsibility || sec.type || '区块'}${title}${layout}${gridNote}${extra}${score}`
}

/**
 * 把嵌套 effectiveSections 格式化为 prompt 树：容器标「仅包裹」，叶子才对应 .vue。
 */
export function formatSectionTreeForPrompt(sections, indent = 0) {
  if (!Array.isArray(sections)) return ''
  const lines = []
  for (const sec of sections) {
    if (isLayoutContainerSection(sec)) {
      const pad = '  '.repeat(indent)
      const title = sec.title || sec.name || sec.id
      const childIds = (sec.children || []).map((c) => c.id).join(' → ')
      lines.push(
        `${pad}- 容器 \`${sec.id}\`（${title}）：纵向 flex 包裹，不单独生成 .vue。子区块顺序 [${childIds}]。父模板必须用 column 包住下列子组件，禁止打平。`,
      )
      if (Array.isArray(sec.children)) {
        lines.push(formatSectionTreeForPrompt(sec.children, indent + 1))
      }
    } else {
      lines.push(formatOne(sec, indent))
      if (sec.internalSubcomponents && sec.internalSubcomponents.length > 0) {
        const pad = '  '.repeat(indent + 1)
        lines.push(
          `${pad}→ 该 section 需进一步拆分为 ${sec.internalSubcomponents.length} 个内部子组件：`,
        )
        sec.internalSubcomponents.forEach((sub, subIdx) => {
          let line = `${pad}  ${subIdx + 1}. ${sub.responsibility} (${sub.reason || ''})`
          if (sub.props?.length > 0) line += ` [Props: ${sub.props.join(', ')}]`
          lines.push(line)
        })
      }
    }
  }
  return lines.filter(Boolean).join('\n')
}

/**
 * 🛡️ R2 Loop 2b（2026-09-10）：确定性子组件命名 —— 治「模板段/脚本段/子组件文件名三者各自由
 * 不同 LLM chunk 自定 → 命名不一致 → 死代码 / 结构丢失」（device-0quu3hqa 实锤）。
 *
 * 规则：系统按 leaf section 的 type / responsibility 做**稳定映射**得到 base 名；当同类型出现
 * 多个 section 需要区分时，不再用裸序号 2/3/4（ContentSection2~4 / ChartSection2~3 这类不友好
 * 命名，2026-09-14 · mc-max-1789376057659-2290591b 实锤），而改用 section 自身的
 * title / id / responsibility 派生的**确定性 PascalCase 语义后缀**
 * （ContentSubHeaderSection / ContentVehicleDistSection / ChartHourlyJinjiangSection 等）。
 * 这样「模板段 <Xxx />、脚本段 import、子组件文件名」三者都拿到同一个确定名，从机制上消灭
 * 「命名多解释者」，同时让命名可读、可维护。
 *
 * 纯函数、无 import.meta，供 prompt-builder / code-generator / microcode-engineer 共用。
 * @param {Array} treeSections - effectiveSections（含容器嵌套）
 * @returns {Map<string,string>} sectionId → PascalCase 确定名
 */

// ── 语义后缀命名辅助（2026-09-14 升级） ──
// 中文语义关键词 → 英文 PascalCase token。**最长优先**：把更具体的词组放前面，
// 避免被短词先吃掉（如「车型分布」须先于「车型」「分布」匹配）。
const ZH_SEMANTIC_TOKENS = [
  ['车型分布', 'VehicleDist'],
  ['流量预测', 'Forecast'],
  ['当日总流量', 'DailyTotalFlow'],
  ['总流量', 'TotalFlow'],
  ['隧道', 'Tunnel'],
  ['大桥', 'Bridge'],
  ['车型', 'Vehicle'],
  ['分布', 'Dist'],
  ['预测', 'Forecast'],
  ['流量', 'Flow'],
  ['监测', 'Monitor'],
  ['统计', 'Stats'],
  ['指标', 'Metrics'],
  ['概览', 'Overview'],
  ['列表', 'List'],
  ['详情', 'Detail'],
  ['图表', 'Chart'],
  ['标题', 'Title'],
  ['控件', 'Control'],
  ['操作', 'Action'],
  ['筛选', 'Filter'],
  ['分页', 'Pager'],
  ['卡片', 'Card'],
  ['网格', 'Grid'],
  ['表单', 'Form'],
  ['弹窗', 'Modal'],
  ['侧边', 'Side'],
  ['底部', 'Footer'],
  ['顶部', 'Header'],
  ['头部', 'Header'],
  ['导航', 'Nav'],
  ['菜单', 'Menu'],
  ['趋势', 'Trend'],
  ['排行', 'Rank'],
  ['地图', 'Map'],
  ['时间', 'Time'],
  ['日期', 'Date'],
  ['小时', 'Hourly'],
  ['当日', 'Daily'],
];
// 退化英文词：无语义、纯占位，命名时应丢弃
const DEGENERATE_EN = new Set([
  'group', 'slot', 'section', 'mc', 'panel', 'container', 'wrapper',
  'box', 'area', 'region', 'placeholder', 'frame', 'block',
]);
// base 类别词：语义后缀不应与 base 已表达的类别重复（ChartSection 不应再挂 Chart）
const BASE_CATEGORY_WORDS = [
  'Chart', 'Content', 'Header', 'Tabs', 'Stats', 'Grid', 'List', 'Switch', 'Main', 'Section', 'Card',
];

function decideBaseName(sec) {
  const resp = String(sec.responsibility || '').toLowerCase();
  const type = String(sec.type || '').toLowerCase();
  if (type === 'chart') return 'ChartSection';
  if (type === 'tabs') return 'TabsSection';
  if (type === 'stats') return 'StatsSection';
  if (type === 'grid') return 'CardGrid';
  if (type === 'list') return 'ListSection';
  if (type === 'switch') return 'SwitchSection';
  if (type === 'header') return 'HeaderSection';
  if (type === 'body') return 'MainSection';
  if (resp.includes('图表') || resp.includes('可视化')) return 'ChartSection';
  if (resp.includes('标签页') || resp.includes('切换栏') || resp.includes(' tab')) return 'TabsSection';
  if (resp.includes('switch') || resp.includes('切换')) return 'SwitchSection';
  if (resp.includes('统计') || resp.includes('指标') || resp.includes('概览')) return 'StatsSection';
  if (resp.includes('网格') || resp.includes('卡片')) return 'CardGrid';
  if (resp.includes('列表') || resp.includes('清单')) return 'ListSection';
  if (resp.includes('标题') || resp.includes('控件')) return 'HeaderSection';
  if (resp.includes('主内容') || resp.includes('主体')) return 'MainSection';
  return 'ContentSection';
}

function pascalCaseFromWords(words) {
  return (words || [])
    .filter(Boolean)
    .map((w) => {
      const s = String(w);
      // 已含驼峰（如映射表产物 VehicleDist）→ 原样保留，避免被再次小写化
      if (/[a-z][A-Z]/.test(s) || /^[A-Z]+$/.test(s)) return s;
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    })
    .join('');
}

// 从文本抽取语义 token（中文走映射表、英文/拼音直接 PascalCase，丢弃纯数字与退化词）。
// 返回已 PascalCase 化的 token 数组（映射表产物如 VehicleDist 原样保留）。
function extractSemanticTokens(text) {
  let t = String(text || '').trim();
  if (!t) return [];
  // 去掉槽位/分组前缀（slot-xxx / mc-xxx / group-xxx）
  t = t.replace(/^(slot|mc|section|group)[-_\s]/i, '');
  const tokens = [];
  const map = [...ZH_SEMANTIC_TOKENS].sort((a, b) => b[0].length - a[0].length);
  for (const [zh, en] of map) {
    if (t.includes(zh)) {
      tokens.push(en); // en 已是 PascalCase（如 VehicleDist），直接入队
      t = t.split(zh).join('');
    }
  }
  const restWords = t
    .split(/[-_\s]+/)
    .map((w) => w.trim())
    .filter((w) => /^[a-zA-Z]+$/.test(w));
  for (const w of restWords) {
    if (DEGENERATE_EN.has(w.toLowerCase())) continue;
    tokens.push(pascalCaseFromWords([w]));
  }
  return tokens;
}

// 把 base 名收敛成「类别词干」：ChartSection→Chart / CardGrid→CardGrid / HeaderSection→Header
function categoryStem(base) {
  if (/Section$/i.test(base)) return base.replace(/Section$/i, '');
  return base; // CardGrid 等无 Section 后缀的保留整词
}

// 取 base 的歧义词干（用于过滤冗余后缀）：ChartSection→chart / TabsSection→tabs / HeaderSection→header
function baseCategoryWords(base) {
  const lower = String(base).toLowerCase();
  return BASE_CATEGORY_WORDS.filter((c) => lower.includes(c.toLowerCase())).map((c) =>
    c.toLowerCase(),
  );
}

// 稳定确定性短后缀（退化形态：title 无语义 token 时，用 id 派生可读短名避免 ContentSection2）
function stableIdSuffix(sec) {
  const id = String(sec?.id || '').trim();
  if (!id) return '';
  // 取 id 尾段（slot-车型分布 / 2:3660 / abc-def-ghi），去掉 slot/mc/group 前缀与纯数字段
  const tail = id
    .replace(/^(slot|mc|section|group)[-_]/i, '')
    .split(/[-_:]/)
    .filter((s) => s && !/^\d+$/.test(s))
    .pop();
  if (!tail) return '';
  // 再走一次语义抽取（id 也可能含中文，如 slot-车型分布）
  const toks = extractSemanticTokens(tail);
  if (toks.length) return toks.join('').slice(0, 16);
  // 纯英文/拼音段：取首词首字母大写，最长 12
  const en = tail.replace(/[^a-zA-Z]/g, '');
  if (en) return en.charAt(0).toUpperCase() + en.slice(1, 12).toLowerCase();
  return '';
}

// 为 section 派生确定性语义后缀；无任何语义内容返回 ''（交由调用方退化处理）
function semanticSuffixFor(sec, base) {
  const title = String(sec.title || '').trim();
  const id = String(sec.id || '').trim();
  // 候选文本：title 优先；退化形态（header-/空/Group 开头/纯数字）用 id
  let text = title;
  const degenerate =
    !text || /^header-?$/i.test(text) || /^group\b/i.test(text) || /^\d+$/.test(text);
  if (degenerate) text = id;
  let tokens = extractSemanticTokens(text);
  // 过滤与 base 类别重复的 token（避免 TabsSection 再挂 Tab、ChartSection 再挂 Chart）
  const baseCats = baseCategoryWords(base);
  tokens = tokens.filter((tk) => !baseCats.includes(String(tk).toLowerCase()));
  if (!tokens.length) return '';
  const suffix = tokens.join('');
  // 长度保护，避免超长名
  return suffix.length > 24 ? suffix.slice(0, 24) : suffix;
}
export function assignSectionComponentNames(treeSections) {
  const leaves = collectLeafSections(treeSections);
  // 第一遍：按 base 分组（同类型多 section 归入一组，便于去重/语义后缀）
  const grouped = new Map();
  for (const sec of leaves) {
    if (!sec) continue;
    const base = decideBaseName(sec);
    if (!grouped.has(base)) grouped.set(base, []);
    grouped.get(base).push(sec);
  }
  const used = new Set();
  const nameOf = new Map();
  for (const [base, secs] of grouped) {
    const stem = categoryStem(base); // 类别词干（Chart / Content / CardGrid ...）
    // 单例：直接用 base 干净名（ChartSection），无需后缀
    if (secs.length === 1) {
      let name = base;
      let i = 2;
      while (used.has(name)) {
        name = `${base}${i}`;
        i += 1;
      }
      used.add(name);
      nameOf.set(String(secs[0].id), name);
      continue;
    }
    const seenSuffix = new Set(); // 同组内后缀去重（防止 Tab/Tabs 碰撞）
    secs.forEach((sec) => {
      let suffix = semanticSuffixFor(sec, base);
      // 退化形态（无语义 token）：用 id 派生稳定短后缀
      if (!suffix) suffix = stableIdSuffix(sec);
      let name;
      if (suffix) {
        // 同组内后缀碰撞 → 加序号（确定性与遍历顺序无关）
        let candidate = `${stem}${suffix}`;
        let n = 2;
        while (seenSuffix.has(candidate.toLowerCase())) {
          candidate = `${stem}${suffix}${n}`;
          n += 1;
        }
        seenSuffix.add(candidate.toLowerCase());
        name = candidate;
      } else {
        // 完全无语义、无 id：本组第一个用 base 原名，其余加序号（极少触发）
        name = `${base}${used.has(base) ? used.size + 1 : ''}`;
      }
      // 跨组极端防冲突
      let i = 2;
      while (used.has(name)) {
        name = `${stem}${suffix || base}${i}`;
        i += 1;
      }
      used.add(name);
      nameOf.set(String(sec.id), name);
    });
  }
  return nameOf;
}
