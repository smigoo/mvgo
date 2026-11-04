/**
 * 🛡️ A 方案（2026-10-15 · c-aiot-dpjh-bsjd-91544b38 实锤）：Figma 覆盖去重。
 *
 * ## 病灶（两案同一根因：同一批 Figma 节点被两条轨各解释一次）
 *
 * 真机 91544b38 实测（离线重放 subcomponentPlanner.plan 取证）：
 *   - E1 确定性推导（deriveSectionsFromFigmaTree）把 slot-con(565:3) 下 6 个卡组
 *     （48:5798/5813/5828/5843/5858/5873）推成 6 个兄弟 section；
 *   - vision 语义回填（enrich/F1）把「节点卡片列表」的 body.items（6 张卡，
 *     item.id = 各卡组 id）回填给了第 1 个卡组 section 48:5798 ⇒ 它已是「6 卡 v-for」；
 *   - collapseSectionsDeep 随后把**剩下的**卡 2-6 折成 `48:5813-list`（v-for 折叠段）；
 *   - 两条轨并存 ⇒ 产物两个子组件（ContentSection 渲染 v-for 6 卡 + ContentSection3
 *     硬编码卡 2）⇒ **卡 2 双渲染**（index.vue 实测两个 wrapper：
 *     `data-section-id="48:5798"` 与 `data-section-id="48:5813-list"`）。
 *
 * ## 判据（纯几何 + id 集，命名无关、不依赖措辞）
 *
 * 「全包含才算重复」：section Y 的 **Figma 覆盖闭包** ⊆ 兄弟 X 的覆盖闭包 ⇒ Y 是
 * X 的重复解释 ⇒ 丢弃 Y（保留 X）。
 *   - 覆盖闭包 = section 的锚点 id（id / figmaNodeId / sourceNodeIds / items[].id /
 *     body.items[].id）在 Figma 树中的**后代闭包** ∪ 子 section 的闭包。
 *     ⚠️ 必须做后代闭包展开：48:5798 的锚点只含「各卡组 id」（48:5813 等），
 *     而 48:5813-list 的锚点是卡 2 的**内部节点**（48:5814…48:5827）——不展开闭包则
 *     两者零交集，判据失效（实测踩过）。
 *   - 部分覆盖 ⇒ 保留（宁可多渲染，不可漏渲染）；无 Figma 归属（闭包为空）⇒ 不参与。
 *   - 等闭包（互相包含）⇒ 保留靠前者，保证幂等。
 *
 * 本模块纯函数、无 import.meta、无副作用，供 subcomponent-planner 挂点复用（单一事实源）。
 */

/** 刀 22：折叠列表段（collapsed/-list/v-for）形态判定，与路径无关（供吸收者资格复用）。 */
function isCollapsedListShape(sec) {
  if (!sec || typeof sec !== 'object') return false
  const id = String(sec.id ?? '')
  return /-list$/.test(id) || sec.collapsed === true || sec.renderHint === 'v-for'
}

/**
 * 🛡️ 刀 22（mc-max-1793185156712-b2086a9c 实锤）：折叠列表段只允许被
 *   「自身就携带列表内容」的兄弟吸收。覆盖闭包是 figma 后代闭包 ⇒ 列表的
 *   **父容器锚点天然 100% 覆盖**折叠段（父 id 的后代闭包 ⊇ 全部卡）；若父容器
 *   自身不带 items（本次 E1 把 48:5798 推成容器、vision body.items 未回填到它），
 *   删掉折叠段 = 唯一起内容轨消失 ⇒ 6 卡全丢只剩首卡。
 *   携带者判据（语义=「逐项内容真的在这里」，与 planner 富卡判据**用途不同**：
 *   planner 归一要区分富卡/扁平文本，这里只问「逐项内容是否存在」⇒ 任意形态
 *   items ≥2 即算携带）：collapsed/-list/v-for、顶层 items≥2、或 body.items≥2。
 *   历史阳性保持：91544b38/0397a327 的吸收者 48:5798 带 body.items ⇒ 仍删。
 */
function isListContentCarrier(sec) {
  if (!sec || typeof sec !== 'object') return false
  if (isCollapsedListShape(sec)) return true
  if (Array.isArray(sec.items) && sec.items.length >= 2) return true
  if (Array.isArray(sec.body?.items) && sec.body.items.length >= 2) return true
  // R8-9：R8-7 的独立内容契约也是逐项内容真值，不能让整容器与合成子切片并存。
  for (const key of ['items', 'children', 'elements']) {
    if (Array.isArray(sec.declaredContent?.[key]) && sec.declaredContent[key].length >= 2) return true
  }
  return false
}

/**
 * 建 Figma 节点 → 「自身 + 全部后代 id」闭包索引。
 *
 * @param {object|null} figmaNodeData figma-node-data.json 内容（{ document } 或裸根）
 * @returns {Map<string, Set<string>>|null} 无有效数据时返回 null（fail-open）
 */
export function buildFigmaClosureIndex(figmaNodeData) {
  const root = figmaNodeData?.document ?? figmaNodeData
  if (!root || typeof root !== 'object') return null
  const map = new Map()
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 60) return new Set()
    const id = node.id != null ? String(node.id) : ''
    const acc = new Set(id ? [id] : [])
    for (const c of node.children || []) {
      if (!c || typeof c !== 'object') continue
      for (const x of walk(c, depth + 1)) acc.add(x)
    }
    if (id) map.set(id, acc)
    return acc
  }
  walk(root, 0)
  return map.size > 0 ? map : null
}

/**
 * 🛡️ C0.2（2026-11-04 · mc-max-1793750471950-b93589ae 实锤）：Figma TEXT 节点 id 集。
 *   供三段判据（祖先/后代单一归属）做「祖先余量是否有文本内容」判定：
 *   祖先闭包减去全部结构后代闭包后，若连一个 TEXT 节点都不剩 ⇒ 纯容器壳。
 */
export function buildFigmaTextIdSet(figmaNodeData) {
  const root = figmaNodeData?.document ?? figmaNodeData
  if (!root || typeof root !== 'object') return null
  const out = new Set()
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 60) return
    if (node.id != null && String(node.type || '').toUpperCase() === 'TEXT') {
      out.add(String(node.id))
    }
    for (const c of node.children || []) walk(c, depth + 1)
  }
  walk(root, 0)
  return out
}

/**
 * 🛡️ C0.2 配套：Figma TEXT 真值字符索引（trim 后的 characters → TEXT 节点 id 集）。
 *   三段判据的「声明内容承接」证据：壳段 vision 声明的文本若能精确锚到结构后代
 *   闭包内的 TEXT 节点 ⇒ 内容已由后代承接；锚不到（vision 独有内容）⇒ 保留壳段
 *   （7d7925d2 真机：footer 误锚组件根但声明「运行中」为 vision 独有，删壳即丢内容）。
 */
export function buildFigmaTextCharactersIndex(figmaNodeData) {
  const root = figmaNodeData?.document ?? figmaNodeData
  if (!root || typeof root !== 'object') return null
  const out = new Map()
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 60) return
    if (node.id != null && String(node.type || '').toUpperCase() === 'TEXT') {
      const key = typeof node.characters === 'string' ? node.characters.trim() : ''
      if (key) {
        if (!out.has(key)) out.set(key, new Set())
        out.get(key).add(String(node.id))
      }
    }
    for (const c of node.children || []) walk(c, depth + 1)
  }
  walk(root, 0)
  return out
}

/** 递归收集 section 子树里所有「锚点 id」（id / figmaNodeId / figmaNode / items[].id / body.items[].id）。 */
function collectAnchorIds(node, acc = new Set(), depth = 0, includeItemAnchors = true) {
  if (!node || typeof node !== 'object' || depth > 8) return acc
  for (const k of ['id', 'figmaNodeId', 'figmaNode']) {
    const v = node[k]
    if (typeof v === 'string' && v) acc.add(v)
  }
  if (Array.isArray(node.sourceNodeIds)) {
    for (const v of node.sourceNodeIds) {
      if (v != null && String(v)) acc.add(String(v))
    }
  }
  // vision 列表轨：body.items / items 每项带 Figma 卡组 id（91544b38 实测 item.id 即卡组 id）
  // 🛡️ 刀 28b（mc-max-1793252160457-54ae6ee3 实锤）：items[].id 是 vision 自由发挥
  //   的锚点，可能指向**本节 figma 子树之外**的节点（本轮 vision 把尾部文本
  //   「共 6 个节点 48:5888 / 接入设备 10810 48:5889」也塞成 items 条目）⇒
  //   吸收者闭包被杂散锚点吹大 ⇒ 尾部文本段被「全包含」误删（footer 消失）。
  //   分级：判「非列表段是否被吸收」时只用 includeItemAnchors=false 的严格闭包
  //   （自身锚点子树），items 展开证据仅用于「折叠列表段」候选（91544b38 阳性保持）。
  if (includeItemAnchors) {
    for (const k of ['items', 'body']) {
      const list = k === 'body' ? node.body?.items : node.items
      if (!Array.isArray(list)) continue
      for (const it of list) collectAnchorIds(it, acc, depth + 1, includeItemAnchors)
    }
  }
  return acc
}

/** R8-11：无锚合成切片的第二判据——内容文本是否被另一整段完整覆盖。 */
function collectDeclaredTexts(node, acc = new Set(), depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return acc
  for (const key of ['text', 'label', 'value', 'title']) {
    const value = node[key]
    if (typeof value === 'string' && value.trim()) acc.add(value.trim())
  }
  for (const root of ['body', 'declaredContent', 'content', 'parts', 'status']) {
    if (node[root] && typeof node[root] === 'object') collectDeclaredTexts(node[root], acc, depth + 1)
  }
  for (const key of ['items', 'children', 'elements']) {
    for (const child of Array.isArray(node[key]) ? node[key] : []) collectDeclaredTexts(child, acc, depth + 1)
  }
  return acc
}

function textSubset(small, big) {
  if (small.size === 0) return false
  for (const text of small) if (!big.has(text)) return false
  return true
}

/**
 * section 的 Figma 覆盖闭包（含子 section）。
 *
 * @param {object} section
 * @param {Map<string, Set<string>>} closureIndex
 * @returns {Set<string>}
 */
export function sectionCoverageSet(section, closureIndex, opts = {}) {
  const includeItemAnchors = opts.includeItemAnchors !== false
  const out = new Set()
  if (!section || typeof section !== 'object' || !(closureIndex instanceof Map)) return out
  const anchors = collectAnchorIds(section, new Set(), 0, includeItemAnchors)
  for (const id of anchors) {
    const closure = closureIndex.get(id)
    // ⚠️ 索引外的 id **必须丢弃、不得原样计入**：折叠段会合成 `48:5813-list` 这类 id
    //   （真机 91544b38 实测），原样计入会让「折叠段 ⊆ items 段」永远差这一个 id ⇒
    //   子集判据失效、重复段漏删（2026-10-15 首版踩坑）。
    if (!closure) continue
    for (const x of closure) out.add(x)
  }
  for (const child of Array.isArray(section.children) ? section.children : []) {
    if (!child || typeof child !== 'object') continue
    for (const x of sectionCoverageSet(child, closureIndex, opts)) out.add(x)
  }
  return out
}

function isSubset(small, big) {
  if (small.size > big.size) return false
  for (const x of small) if (!big.has(x)) return false
  return true
}

/** 两段判据里「较小闭包被覆盖」的比例 */
function overlapRatio(small, big) {
  if (small.size === 0) return 0
  let inter = 0
  for (const x of small) if (big.has(x)) inter++
  return inter / small.size
}

/**
 * 🛡️ 二段判据的候选判定：**折叠列表段**（collapsed / renderHint=v-for / id 以 `-list` 结尾）。
 *   作用域刻意收窄到这一类：折叠段本身是「对兄弟节点的再一次解释」，判定它是重复最安全；
 *   普通 section / layout 容器**永不进二段**（真机 c-aiot-dpjh-bsjd-3b06a019 顶层 565:2 ⨯ 565:3
 *   交集 100%，但它俩是并列的 header 与内容容器，误删等于整块内容消失）。
 */
function isCollapsedListCandidate(sec, path = '') {
  if (!sec || typeof sec !== 'object') return false
  // 🛡️ 顶层一律不进二段：真机 c-aiot-dpjh-bsjd-3b06a019 顶层 565:2 ⨯ 565:3 覆盖完全一致
  //   （header 与内容容器），误删等于整块内容消失。折叠列表段只会挂在容器内部。
  if (!path) return false
  const id = String(sec.id ?? '')
  if (/-list$/.test(id)) return true
  if (sec.collapsed === true) return true
  if (sec.renderHint === 'v-for') return true
  return false
}

function isLayoutContainerLike(sec) {
  return (
    sec.isLayoutContainer === true ||
    (sec.layoutSource === 'container-rebuild' && Array.isArray(sec.children) && sec.children.length > 0)
  )
}

/** 二段判据阈值：折叠段 ≥75% 节点已被某兄弟渲染 ⇒ 判为重复解释 */
const PARTIAL_OVERLAP_THRESHOLD = 0.75

/**
 * 按 Figma 覆盖闭包去重：同层兄弟中被**完全覆盖**者丢弃（递归整棵树）。
 *
 * @param {Array} sections
 * @param {Map<string, Set<string>>|null} closureIndex 为 null ⇒ 原样返回（fail-open）
 * @returns {{ sections: Array, removed: Array<{id: string, coveredBy: string, size: number, path: string}> }}
 *   ⚠️ `removed` **跨层级聚合**（嵌套子树里被删的段也在内）——真机 48:5813-list 就是在
 *   容器 565:3 的 children 层被删的，只统计顶层会静默留痕为空（2026-10-15 首版踩坑）。
 */
export function dedupeSectionsByCoverage(sections, closureIndex, opts = {}) {
  if (!Array.isArray(sections)) return { sections, removed: [] }
  if (!(closureIndex instanceof Map) || closureIndex.size === 0) {
    return { sections, removed: [] }
  }
  const removed = []
  const out = dedupeLevelByCoverage(sections, closureIndex, removed, '', opts)
  return { sections: out, removed }
}

function dedupeLevelByCoverage(sections, closureIndex, removed, path, opts = {}) {
  const cov = sections.map((s) =>
    s && typeof s === 'object' ? sectionCoverageSet(s, closureIndex) : new Set(),
  )
  // 🛡️ 刀 28b：吸收者「严格闭包」缓存（不含 items[].id 展开，见 collectAnchorIds 注释）。
  //   被删者是非列表段时，吸收证据只能用严格闭包——vision items 杂散锚点不得充当
  //   「覆盖兄弟文本段」的证据（54ae6ee3 尾部文本被误删实锤）。
  const strictCovCache = new Map()
  const strictCovOf = (j) => {
    if (!strictCovCache.has(j)) {
      strictCovCache.set(
        j,
        sectionCoverageSet(sections[j], closureIndex, { includeItemAnchors: false }),
      )
    }
    return strictCovCache.get(j)
  }
  const droppedBy = new Map() // i -> j（吸收者下标）
  const partialBy = new Map() // i -> 二段判据的重叠比例（一段命中者不在此表）
  const contentBy = new Set() // i -> 无锚子切片按 declaredContent/body 文本全覆盖去重

  // 🛡️ 三段判据（2026-11-04 · C0.2 · mc-max-1793750471950-b93589ae 实锤）：
  //   祖先/后代单一归属。病灶：根 Frame 36:1693 与其内部子 Group 801:3 同时成为
  //   平级 section ⇒ LLM 轨（ContentHeader）与确定性轨（ContentSection）各渲染
  //   同一批节点 ⇒ DOM 双份。一段判据在 vision 路径被 requireContentCarrier 挡死
  //   （祖先纯壳不携带逐项内容）、在 figma 路径会反向删掉结构后代留下壳——两道
  //   门都给不出正确的所有权方向。
  //
  //   判据（纯几何 + 节点类型，命名无关）：
  //     1. 平级 X、Y，Y 的**严格闭包** ⊂ X 的严格闭包（真子集）⇒ Y 是 X 的结构后代；
  //     2. 余量 = strictCov(X) ∖ ∪strictCov(结构后代)；
  //     3. 余量里连一个 TEXT 节点都没有 ⇒ X 是纯容器壳 ⇒ **删壳留内容**（保后代）。
  //   执行顺序刻意在一段判据**之前**：祖先/后代关系的所有权必须先裁决（壳先走、
  //   后代存活），非壳情形才回落到一段/二段。方向性与历史误删（ab7bb76c）恰好
  //   相反：旧 bug 删业务段留容器；本段删壳留业务段，阳性不回退。折叠列表形态
  //   段（刀 22 域）不作为被删者参与本段。
  //   fail-open：无 textIdSet（无 figma 数据）⇒ 本段整体不启用。
  const ancestorShellBy = new Set() // i -> 因祖先纯壳被删（reason='ancestor-shell'）
  const textIdSet = opts.textIdSet instanceof Set ? opts.textIdSet : null
  const textCharIndex = opts.textCharIndex instanceof Map ? opts.textCharIndex : null
  if (textIdSet) {
    for (let x = 0; x < sections.length; x++) {
      if (droppedBy.has(x)) continue
      if (!sections[x] || typeof sections[x] !== 'object') continue
      const covX = strictCovOf(x)
      if (covX.size === 0) continue
      // 🛡️ 刀 22 同源防御：被删者若是折叠列表形态或自身携带逐项内容（items ≥2），
      //   其内容轨可能不在后代闭包里（vision items 锚点可指向段外），不删。
      if (isCollapsedListShape(sections[x]) || isListContentCarrier(sections[x])) continue
      const descendants = []
      for (let y = 0; y < sections.length; y++) {
        if (y === x || droppedBy.has(y)) continue
        if (!sections[y] || typeof sections[y] !== 'object') continue
        const covY = strictCovOf(y)
        if (covY.size === 0 || covY.size >= covX.size) continue
        if (!isSubset(covY, covX)) continue
        descendants.push(y)
      }
      if (descendants.length === 0) continue
      const covered = new Set()
      for (const y of descendants) {
        for (const id of strictCovOf(y)) covered.add(id)
      }
      let remainderHasText = false
      for (const id of covX) {
        if (!covered.has(id) && textIdSet.has(id)) {
          remainderHasText = true
          break
        }
      }
      if (remainderHasText) continue // 有文本余量：内容并未全部由后代承接，保留（宁多勿漏）
      // 🛡️ 声明内容承接（7d7925d2 真机教训）：壳段 vision 声明的文本必须能精确锚到
      //   结构后代闭包内的 TEXT 真值节点；锚不到 = vision 独有内容（如误锚组件根的
      //   footer 声明「运行中」），删壳即丢内容 ⇒ 保留。b93589ae 壳段声明的 kv 表
      //   文本全部锚在 801:3 闭包内的 TEXT 节点 ⇒ 承接成立、删壳零丢失。
      if (textCharIndex instanceof Map) {
        const declaredTexts = collectDeclaredTexts(sections[x])
        let allAnchoredInDescendants = true
        for (const t of declaredTexts) {
          const ids = textCharIndex.get(t)
          if (!ids) {
            allAnchoredInDescendants = false
            break
          }
          let hit = false
          for (const id of ids) {
            if (covered.has(id)) {
              hit = true
              break
            }
          }
          if (!hit) {
            allAnchoredInDescendants = false
            break
          }
        }
        if (!allAnchoredInDescendants) continue
      }
      droppedBy.set(x, descendants[0])
      ancestorShellBy.add(x)
    }
  }

  for (let i = 0; i < sections.length; i++) {
    if (!sections[i] || typeof sections[i] !== 'object') continue
    if (cov[i].size === 0) {
      // 无锚点不能参与几何去重；但 vision 显式拆出的合成子切片可凭内容全覆盖判重。
      if (opts.requireContentCarrier) {
        const ownTexts = collectDeclaredTexts(sections[i])
        for (let j = 0; j < sections.length; j++) {
          if (i === j || droppedBy.has(j) || cov[j].size === 0) continue
          if (!textSubset(ownTexts, collectDeclaredTexts(sections[j]))) continue
          droppedBy.set(i, j)
          contentBy.add(i)
          break
        }
      }
      continue
    }
    const iIsList = isCollapsedListShape(sections[i])
    for (let j = 0; j < sections.length; j++) {
      if (i === j || droppedBy.has(j)) continue
      if (!sections[j] || typeof sections[j] !== 'object') continue
      if (cov[j].size === 0) continue
      // 🛡️ 刀 28b：非列表段的吸收者证据 = 严格闭包（items 锚点展开不计）
      const big = iIsList ? cov[j] : strictCovOf(j)
      // 只被「覆盖更全」者吸收；等闭包时只被靠前者吸收（保证幂等、结果稳定）
      if (big.size < cov[i].size) continue
      if (big.size === cov[i].size && j > i) continue
      // 🛡️ 等闭包 + 双方都是 layout 容器 ⇒ 不删（真机 c-aiot-dpjh-bsjd-3b06a019：顶层
      //   565:2 ⨯ 565:3 覆盖完全一致但一个是 header 一个是内容容器，误删等于整块内容消失）
      if (big.size === cov[i].size && isLayoutContainerLike(sections[i]) && isLayoutContainerLike(sections[j])) {
        continue
      }
      if (!isSubset(cov[i], big)) continue
      // 🛡️ 刀 22：被删者是折叠列表段而吸收者自身不携带列表内容 ⇒ 不删
      //   （否则唯一起内容轨消失，整列坍缩成首卡，b2086a9c 实锤）
      if (isCollapsedListShape(sections[i]) && !isListContentCarrier(sections[j])) continue
      // 🛡️ 2026-10-30 第2步（仅 vision 骨架路径开启）：吸收者必须**自身携带逐项内容**，
      //   否则不得把平级兄弟判为「重复解释」删除。vision sections 是**平铺**且段 id 常取
      //   容器 id（如「底部图例与链接」=807:2），其 Figma 后代闭包天然包含统计卡/表格等
      //   平级业务段 ⇒ 旧「全包含即重复」会把整块业务段误删（P0 语料 ab7bb76c 实测：
      //   beforeTop 3 → afterTop 1，统计卡与表格全消失）。判据与刀22 同源
      //   （isListContentCarrier），E1（figma）路径不开启、行为不变。
      if (opts.requireContentCarrier && !isListContentCarrier(sections[j])) continue
      droppedBy.set(i, j)
      break
    }
  }

  // 二段判据（2026-10-15 · c-aiot-dpjh-bsjd-0397a327 实锤）：折叠列表段 ≥75% 节点
  //   已被某兄弟渲染 ⇒ 判为重复解释。真机两类形态：
  //     - 91544b38：折叠段被 100% 覆盖（一段判据命中）；
  //     - 0397a327：折叠段 48:5813-list 覆盖 15 节点，其中 12 个已被 48:5798 覆盖（80%），
  //       差 3 个节点躲过一段判据 ⇒ 两个叶子都拿到 6 卡 body ⇒ **卡 2 仍双渲染**。
  //   只针对折叠列表段 + 只被更大的兄弟吸收，且绝不碰 layout 容器（见 isCollapsedListCandidate）。
  for (let i = 0; i < sections.length; i++) {
    if (droppedBy.has(i)) continue
    if (!sections[i] || typeof sections[i] !== 'object') continue
    if (cov[i].size === 0) continue
    if (!isCollapsedListCandidate(sections[i], path)) continue
    let bestJ = -1
    let bestRatio = 0
    for (let j = 0; j < sections.length; j++) {
      if (i === j || droppedBy.has(j)) continue
      if (!sections[j] || typeof sections[j] !== 'object') continue
      if (cov[j].size < cov[i].size) continue // 只被「覆盖更全」者吸收
      const ratio = overlapRatio(cov[i], cov[j])
      if (ratio < PARTIAL_OVERLAP_THRESHOLD) continue
      // 🛡️ 刀 22：同一段——吸收者必须是列表内容携带者
      if (!isListContentCarrier(sections[j])) continue
      if (ratio > bestRatio || (Math.abs(ratio - bestRatio) < 1e-9 && cov[j].size > cov[bestJ]?.size)) {
        bestRatio = ratio
        bestJ = j
      }
    }
    if (bestJ >= 0) {
      droppedBy.set(i, bestJ)
      partialBy.set(i, Number(bestRatio.toFixed(3)))
    }
  }

  for (const [i, j] of droppedBy) {
    removed.push({
      id: String(sections[i]?.id ?? ''),
      coveredBy: String(sections[j]?.id ?? ''),
      size: cov[i].size,
      // 一段='full'（全包含）/ 二段='partial'（折叠列表段 ≥75% 重叠）/ 三段='ancestor-shell'（祖先纯壳）
      reason: ancestorShellBy.has(i)
        ? 'ancestor-shell'
        : contentBy.has(i)
          ? 'declared-content'
          : partialBy.has(i)
            ? 'partial'
            : 'full',
      ...(partialBy.has(i) ? { ratio: partialBy.get(i) } : {}),
      path: path || '/',
    })
  }

  return sections
    .filter((_, i) => !droppedBy.has(i))
    .map((s) => {
      if (!s || typeof s !== 'object') return s
      if (!Array.isArray(s.children)) return s
      const childPath = `${path}/${String(s.id ?? '')}`
      return {
        ...s,
        children: dedupeLevelByCoverage(s.children, closureIndex, removed, childPath, opts),
      }
    })
}
